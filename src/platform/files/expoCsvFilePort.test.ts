import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  CSV_EXPORT_FILENAME,
  CSV_EXPORT_MAX_BYTES,
  CsvFilePortError,
  createExpoCsvFilePort,
  createProductionExpoCsvFilePort,
  type ExpoCsvFileDriver,
} from "./expoCsvFilePort";

const mockDirectoryCreate = jest.fn<(options: unknown) => void>();
const mockFileCreate = jest.fn<(options: unknown) => void>();
const mockFileDelete = jest.fn<() => void>();
const mockFileWrite = jest.fn<(bytes: Uint8Array) => void>();
const mockShareAvailability = jest.fn<() => Promise<boolean>>();
const mockShareAsync = jest.fn<(uri: string, options: unknown) => Promise<void>>();

jest.mock("expo-file-system", () => ({
  Directory: class Directory {
    constructor(..._args: unknown[]) {}
    create(options: unknown) { mockDirectoryCreate(options); }
  },
  File: class File {
    exists = false;
    size = 4;
    uri = "file:///cache/gym-tracker-exports/gym-tracker-export-v1.csv";
    constructor(..._args: unknown[]) {}
    create(options: unknown) { mockFileCreate(options); this.exists = true; }
    delete() { mockFileDelete(); this.exists = false; }
    write(bytes: Uint8Array) { mockFileWrite(bytes); this.size = bytes.byteLength; }
  },
  Paths: { cache: "file:///cache" },
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: () => mockShareAvailability(),
  shareAsync: (uri: string, options: unknown) => mockShareAsync(uri, options),
}));

type FakeFile = {
  uri: string;
  exists: boolean;
  size: number;
  deleteCalls: number;
  written: Uint8Array[];
  create(options: Readonly<{ intermediates: boolean; overwrite: boolean }>): void;
  delete(): void;
  write(bytes: Uint8Array): void;
};

function fakeFile(filename: string): FakeFile {
  const file: FakeFile = {
    uri: `file:///cache/${filename}`, exists: true, size: 3, deleteCalls: 0,
    written: [],
    create() { file.exists = true; },
    delete() { file.exists = false; file.size = 0; file.deleteCalls += 1; },
    write(bytes) { file.written.push(bytes); file.size = bytes.byteLength; },
  };
  return file;
}

function fixture(overrides: Partial<ExpoCsvFileDriver> = {}) {
  let file: FakeFile | undefined;
  const shares: string[] = [];
  const driver: ExpoCsvFileDriver = {
    createCacheFile(filename) {
      file = fakeFile(filename);
      return file;
    },
    isSharingAvailable: async () => true,
    share: async (uri) => { shares.push(uri); },
    ...overrides,
  };
  return { driver, file: () => file, shares };
}

describe("Expo CSV file port", () => {
  beforeEach(() => {
    mockDirectoryCreate.mockReset();
    mockFileCreate.mockReset();
    mockFileDelete.mockReset();
    mockFileWrite.mockReset();
    mockShareAvailability.mockReset();
    mockShareAvailability.mockResolvedValue(true);
    mockShareAsync.mockReset();
    mockShareAsync.mockResolvedValue(undefined);
  });

  it("replaces the deterministic cache file and exposes only an opaque handle", async () => {
    const state = fixture();
    const port = createExpoCsvFilePort(state.driver);
    const bytes = new TextEncoder().encode("a,b\r\n1,2\r\n");

    const handle = await port.writeCsv(bytes);

    expect(handle).toEqual({ exportId: "csv-v1-1" });
    expect(handle).not.toHaveProperty("uri");
    expect(state.file()?.uri.endsWith(CSV_EXPORT_FILENAME)).toBe(true);
    expect(state.file()?.deleteCalls).toBe(1);
    expect(state.file()?.written).toEqual([bytes]);
  });

  it("replaces an unshared export without letting stale cleanup delete the new file", async () => {
    const state = fixture();
    const port = createExpoCsvFilePort(state.driver);
    const first = await port.writeCsv(Uint8Array.of(1));
    const firstFile = state.file();
    const second = await port.writeCsv(Uint8Array.of(2));
    const secondFile = state.file();

    expect(second).not.toEqual(first);
    expect(firstFile?.exists).toBe(false);
    await expect(port.discardCsv(first)).resolves.toBeUndefined();
    expect(secondFile?.exists).toBe(true);
    await expect(port.shareCsv(second)).resolves.toBeUndefined();
    expect(state.shares).toEqual([expect.stringMatching(CSV_EXPORT_FILENAME)]);
  });

  it("discards an unshared export idempotently without exposing its URI", async () => {
    const state = fixture();
    const port = createExpoCsvFilePort(state.driver);
    const handle = await port.writeCsv(Uint8Array.of(1, 2, 3));

    expect(handle).not.toHaveProperty("uri");
    await expect(port.discardCsv(handle)).resolves.toBeUndefined();
    await expect(port.discardCsv(handle)).resolves.toBeUndefined();
    expect(state.file()?.exists).toBe(false);
    await expect(port.shareCsv(handle)).rejects.toEqual(
      expect.objectContaining({ code: "csv_file_not_found" }),
    );

    const externallyRemoved = fixture();
    const removedPort = createExpoCsvFilePort(externallyRemoved.driver);
    const removedHandle = await removedPort.writeCsv(Uint8Array.of(4));
    externallyRemoved.file()!.exists = false;
    await expect(removedPort.discardCsv(removedHandle)).resolves.toBeUndefined();
    await expect(removedPort.discardCsv(removedHandle)).resolves.toBeUndefined();
  });

  it("keeps an in-flight share alive and blocks replacement until cleanup finishes", async () => {
    let finishShare: (() => void) | undefined;
    const state = fixture({
      share: () => new Promise<void>((resolve) => { finishShare = resolve; }),
    });
    const port = createExpoCsvFilePort(state.driver);
    const handle = await port.writeCsv(Uint8Array.of(1, 2, 3));
    const sharing = port.shareCsv(handle);

    await expect(port.discardCsv(handle)).resolves.toBeUndefined();
    expect(state.file()?.exists).toBe(true);
    await expect(port.writeCsv(Uint8Array.of(4))).rejects.toEqual(
      expect.objectContaining({ code: "csv_file_busy" }),
    );
    finishShare?.();
    await expect(sharing).resolves.toBeUndefined();
    expect(state.file()?.exists).toBe(false);
  });

  it("rejects empty/oversized bytes and deletes partial writes", async () => {
    let partial: FakeFile | undefined;
    const state = fixture({
      createCacheFile(filename) {
        const candidate = fakeFile(filename);
        candidate.write = () => { throw new Error("storage full /private/path"); };
        partial = candidate;
        return candidate;
      },
    });
    const port = createExpoCsvFilePort(state.driver);

    await expect(port.writeCsv(new Uint8Array())).rejects.toEqual(
      expect.objectContaining({ code: "csv_file_input_invalid" }),
    );
    await expect(port.writeCsv(new Uint8Array(CSV_EXPORT_MAX_BYTES + 1)))
      .rejects.toEqual(expect.objectContaining({ code: "csv_file_input_invalid" }));
    await expect(port.writeCsv(Uint8Array.of(1, 2, 3))).rejects.toEqual(
      expect.objectContaining({ code: "csv_file_write_failed" }),
    );
    expect(partial?.deleteCalls).toBe(2);
  });

  it("rejects an incomplete write and reports cleanup failure without retaining it", async () => {
    const incomplete = fixture({
      createCacheFile(filename) {
        const candidate = fakeFile(filename);
        candidate.write = (bytes) => { candidate.size = bytes.byteLength - 1; };
        return candidate;
      },
    });
    await expect(createExpoCsvFilePort(incomplete.driver).writeCsv(Uint8Array.of(1, 2)))
      .rejects.toEqual(expect.objectContaining({ code: "csv_file_write_failed" }));

    const cleanupFailure = fixture({
      createCacheFile(filename) {
        const candidate = fakeFile(filename);
        candidate.write = () => { throw new Error("write failed"); };
        candidate.delete = () => { throw new Error("delete failed"); };
        return candidate;
      },
    });
    await expect(createExpoCsvFilePort(cleanupFailure.driver).writeCsv(Uint8Array.of(1)))
      .rejects.toEqual(expect.objectContaining({ code: "csv_file_cleanup_failed" }));

    const vanishedPartial = fixture({
      createCacheFile(filename) {
        const candidate = fakeFile(filename);
        candidate.write = () => { candidate.exists = false; throw new Error("gone"); };
        return candidate;
      },
    });
    await expect(createExpoCsvFilePort(vanishedPartial.driver).writeCsv(Uint8Array.of(1)))
      .rejects.toEqual(expect.objectContaining({ code: "csv_file_write_failed" }));
  });

  const shareCases: Array<[
    string,
    boolean,
    boolean,
    "csv_sharing_unavailable" | "csv_sharing_failed" | undefined,
  ]> = [
    ["success", true, false, undefined],
    ["unavailable", false, false, "csv_sharing_unavailable"],
    ["rejected", true, true, "csv_sharing_failed"],
  ];

  it.each(shareCases)("deletes the cache file after %s share completion", async (_name, available, reject, errorCode) => {
    const state = fixture({
      isSharingAvailable: async () => available,
      share: async (uri) => {
        state.shares.push(uri);
        if (reject) throw new Error("rejected /private/path");
      },
    });
    const port = createExpoCsvFilePort(state.driver);
    const handle = await port.writeCsv(Uint8Array.of(1, 2, 3));

    const result = port.shareCsv(handle);
    if (errorCode === undefined) await expect(result).resolves.toBeUndefined();
    else await expect(result).rejects.toEqual(expect.objectContaining({ code: errorCode }));
    expect(state.file()?.deleteCalls).toBe(2);
    expect(state.file()?.exists).toBe(false);
    await expect(port.shareCsv(handle)).rejects.toBeInstanceOf(CsvFilePortError);
    await expect(port.discardCsv(handle)).resolves.toBeUndefined();
  });

  it("rejects an invalid handle and reports cleanup failure after sharing", async () => {
    const state = fixture();
    const port = createExpoCsvFilePort(state.driver);
    await expect(port.shareCsv({ exportId: "other" } as never)).rejects.toEqual(
      expect.objectContaining({ code: "csv_file_not_found" }),
    );

    const cleanupFailure = fixture({
      createCacheFile(filename) {
        const candidate = fakeFile(filename);
        let deletions = 0;
        candidate.delete = () => {
          deletions += 1;
          if (deletions === 1) {
            candidate.exists = true;
          } else {
            throw new Error("cleanup failed");
          }
        };
        return candidate;
      },
    });
    const failingPort = createExpoCsvFilePort(cleanupFailure.driver);
    const handle = await failingPort.writeCsv(Uint8Array.of(1, 2));
    await expect(failingPort.shareCsv(handle)).rejects.toEqual(
      expect.objectContaining({ code: "csv_file_cleanup_failed" }),
    );
    await expect(failingPort.discardCsv(handle)).rejects.toEqual(
      expect.objectContaining({ code: "csv_file_cleanup_failed" }),
    );

    const removedByShare = fixture({
      share: async () => {
        const file = removedByShare.file();
        if (file !== undefined) file.exists = false;
      },
    });
    const removedPort = createExpoCsvFilePort(removedByShare.driver);
    const removedHandle = await removedPort.writeCsv(Uint8Array.of(1));
    await expect(removedPort.shareCsv(removedHandle)).resolves.toBeUndefined();
    expect(removedByShare.file()?.deleteCalls).toBe(1);
  });

  it("loads the production Expo SDK 57 file and sharing APIs", async () => {
    const port = createProductionExpoCsvFilePort();
    const handle = await port.writeCsv(Uint8Array.of(1, 2, 3, 4));
    await port.shareCsv(handle);
    expect(mockDirectoryCreate).toHaveBeenCalledWith({ idempotent: true, intermediates: true });
    expect(mockFileCreate).toHaveBeenCalledWith({ intermediates: true, overwrite: true });
    expect(mockShareAsync).toHaveBeenCalledWith(
      expect.stringMatching(/gym-tracker-export-v1\.csv$/u),
      { dialogTitle: "Share Gym Tracker CSV", mimeType: "text/csv" },
    );
    expect(mockFileDelete).toHaveBeenCalledTimes(1);
  });
});
