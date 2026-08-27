import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  BackupFilePortError,
  RestoreFilePortError,
  createExpoBackupFilePort,
  createExpoRestoreFilePort,
  createProductionExpoBackupFilePort,
  createProductionExpoRestoreFilePort,
  type ExpoBackupFileDriver,
} from "./expoBackupFilePort";

const mockDirectoryCreate = jest.fn<(options: unknown) => void>();
const mockFileCreate = jest.fn<(options: unknown) => void>();
const mockFileDelete = jest.fn<() => void>();
const mockFileWrite = jest.fn<(bytes: Uint8Array) => void>();
const mockShareAvailability = jest.fn<() => Promise<boolean>>();
const mockShareAsync = jest.fn<(
  uri: string,
  options: unknown,
) => Promise<void>>();
const mockPickFileAsync = jest.fn<(input: unknown) => Promise<unknown>>();

jest.mock("expo-file-system", () => ({
  Directory: class Directory {
    constructor(..._args: unknown[]) {}
    create(options: unknown) {
      mockDirectoryCreate(options);
    }
  },
  File: class File {
    static pickFileAsync = mockPickFileAsync;
    exists = true;
    size = 1;
    uri = "file:///cache/gym-tracker-backups/backup-production.gtbk";
    constructor(..._args: unknown[]) {}
    create(options: unknown) {
      mockFileCreate(options);
    }
    delete() {
      mockFileDelete();
    }
    write(bytes: Uint8Array) {
      mockFileWrite(bytes);
    }
  },
  FileMode: { ReadOnly: "r" },
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
  createCalls: number;
  deleteCalls: number;
  writtenArchives: Uint8Array[];
  create(options: Readonly<{ intermediates: boolean; overwrite: boolean }>): void;
  delete(): void;
  write(bytes: Uint8Array): void;
};

function driver(overrides: Partial<ExpoBackupFileDriver> = {}): Readonly<{
  driver: ExpoBackupFileDriver;
  files: Map<string, FakeFile>;
  shareCalls: Array<Readonly<{
    uri: string;
    options: Readonly<{ dialogTitle: string; mimeType: string }>;
  }>>;
}> {
  const files = new Map<string, FakeFile>();
  const shareCalls: Array<Readonly<{
    uri: string;
    options: Readonly<{ dialogTitle: string; mimeType: string }>;
  }>> = [];
  const share: ExpoBackupFileDriver["share"] = async (uri, options) => {
    shareCalls.push({ uri, options });
  };
  return {
    driver: {
      createCacheFile(archiveId) {
        const file: FakeFile = {
          uri: `file:///cache/${archiveId}.gtbk`,
          exists: false,
          size: 0,
          createCalls: 0,
          deleteCalls: 0,
          writtenArchives: [],
          create() {
            file.createCalls += 1;
            file.exists = true;
          },
          delete() {
            file.deleteCalls += 1;
            file.exists = false;
            file.size = 0;
          },
          write(bytes) {
            file.writtenArchives.push(bytes);
            file.size = bytes.byteLength;
          },
        };
        files.set(archiveId, file);
        return file;
      },
      isSharingAvailable: async () => true,
      share,
      ...overrides,
    },
    files,
    shareCalls,
  };
}

describe("Expo backup file port", () => {
  beforeEach(() => {
    mockDirectoryCreate.mockReset();
    mockFileCreate.mockReset();
    mockFileDelete.mockReset();
    mockFileWrite.mockReset();
    mockShareAvailability.mockReset();
    mockShareAvailability.mockResolvedValue(true);
    mockShareAsync.mockReset();
    mockShareAsync.mockResolvedValue(undefined);
    mockPickFileAsync.mockReset();
  });
  it("writes a complete encrypted archive to cache without exposing its URI", async () => {
    const fixture = driver();
    const port = createExpoBackupFilePort(fixture.driver);

    const archive = await port.writeArchive({
      archiveId: "backup-20260825",
      archive: Uint8Array.from([0x47, 0x54, 0x42, 0x4b]),
    });

    expect(archive).toEqual({ archiveId: "backup-20260825" });
    expect(archive).not.toHaveProperty("uri");
    expect(fixture.files.get(archive.archiveId)?.writtenArchives).toEqual([
      Uint8Array.from([0x47, 0x54, 0x42, 0x4b]),
    ]);
  });

  it("deletes a partial cache archive when writing fails", async () => {
    let failedFile: FakeFile | undefined;
    const fixture = driver({
      createCacheFile(archiveId) {
        const file: FakeFile = {
          uri: `file:///cache/${archiveId}.gtbk`,
          exists: false,
          size: 0,
          createCalls: 0,
          deleteCalls: 0,
          writtenArchives: [],
          create() {
            file.createCalls += 1;
            file.exists = true;
          },
          delete() {
            file.deleteCalls += 1;
            file.exists = false;
          },
          write() {
            throw new Error("storage full");
          },
        };
        failedFile = file;
        fixture.files.set(archiveId, file);
        return file;
      },
    });
    const port = createExpoBackupFilePort(fixture.driver);

    await expect(port.writeArchive({
      archiveId: "backup-write-failure",
      archive: Uint8Array.from([1, 2, 3]),
    })).rejects.toEqual(expect.objectContaining({
      code: "backup_file_write_failed",
    }));

    expect(failedFile?.deleteCalls).toBe(1);
  });

  it("rejects invalid input and refuses a partially written or cleanup-failed archive", async () => {
    const incomplete = driver({
      createCacheFile(archiveId) {
        const file: FakeFile = {
          uri: `file:///cache/${archiveId}.gtbk`,
          exists: false,
          size: 0,
          createCalls: 0,
          deleteCalls: 0,
          writtenArchives: [],
          create() {
            file.createCalls += 1;
            file.exists = true;
          },
          delete() {
            file.deleteCalls += 1;
            file.exists = false;
          },
          write(bytes) {
            file.writtenArchives.push(bytes);
            file.size = bytes.byteLength - 1;
          },
        };
        incomplete.files.set(archiveId, file);
        return file;
      },
    });
    const port = createExpoBackupFilePort(incomplete.driver);

    await expect(port.writeArchive({
      archiveId: "invalid id",
      archive: Uint8Array.from([1]),
    })).rejects.toEqual(expect.objectContaining({
      code: "backup_file_input_invalid",
    }));
    await expect(port.writeArchive({
      archiveId: "backup-incomplete",
      archive: new Uint8Array(),
    })).rejects.toEqual(expect.objectContaining({
      code: "backup_file_input_invalid",
    }));
    await expect(port.writeArchive({
      archiveId: "backup-incomplete",
      archive: Uint8Array.from([1, 2]),
    })).rejects.toEqual(expect.objectContaining({
      code: "backup_file_write_failed",
    }));
    expect(incomplete.files.get("backup-incomplete")?.deleteCalls).toBe(1);

    const cleanupFailure = driver({
      createCacheFile(archiveId) {
        const file: FakeFile = {
          uri: `file:///cache/${archiveId}.gtbk`,
          exists: false,
          size: 0,
          createCalls: 0,
          deleteCalls: 0,
          writtenArchives: [],
          create() {
            file.exists = true;
          },
          delete() {
            throw new Error("delete failed");
          },
          write() {
            throw new Error("write failed");
          },
        };
        return file;
      },
    });
    await expect(createExpoBackupFilePort(cleanupFailure.driver).writeArchive({
      archiveId: "backup-cleanup-failure",
      archive: Uint8Array.from([1]),
    })).rejects.toEqual(expect.objectContaining({
      code: "backup_file_cleanup_failed",
    }));

    const missingDuringCleanup = driver({
      createCacheFile(archiveId) {
        const file: FakeFile = {
          uri: `file:///cache/${archiveId}.gtbk`,
          exists: false,
          size: 0,
          createCalls: 0,
          deleteCalls: 0,
          writtenArchives: [],
          create() {
            file.exists = true;
          },
          delete() {
            file.deleteCalls += 1;
            file.exists = false;
          },
          write() {
            file.exists = false;
            throw new Error("write failed");
          },
        };
        return file;
      },
    });
    await expect(createExpoBackupFilePort(missingDuringCleanup.driver).writeArchive({
      archiveId: "backup-missing-during-cleanup",
      archive: Uint8Array.from([1]),
    })).rejects.toEqual(expect.objectContaining({
      code: "backup_file_write_failed",
    }));
  });

  it("refuses unavailable sharing without revealing or retaining a cache URI", async () => {
    const fixture = driver({ isSharingAvailable: async () => false });
    const port = createExpoBackupFilePort(fixture.driver);
    const archive = await port.writeArchive({
      archiveId: "backup-no-share",
      archive: Uint8Array.from([1, 2, 3]),
    });

    await expect(port.shareArchive(archive)).rejects.toEqual(
      expect.objectContaining({
        code: "backup_sharing_unavailable",
      }),
    );
    expect(fixture.shareCalls).toEqual([]);

    await port.deleteArchive(archive);
    expect(fixture.files.get(archive.archiveId)?.deleteCalls).toBe(1);
  });

  it("uses the system share sheet only for a complete tracked archive", async () => {
    const fixture = driver();
    const port = createExpoBackupFilePort(fixture.driver);
    const archive = await port.writeArchive({
      archiveId: "backup-share",
      archive: Uint8Array.from([1, 2, 3]),
    });

    await port.shareArchive(archive);

    expect(fixture.shareCalls).toEqual([
      expect.objectContaining({
        uri: "file:///cache/backup-share.gtbk",
        options: expect.objectContaining({ mimeType: "application/octet-stream" }),
      }),
    ]);
    await expect(port.shareArchive({ archiveId: "unknown" })).rejects.toBeInstanceOf(
      BackupFilePortError,
    );
  });

  it("replaces a pre-existing cache file and maps share or cleanup failures safely", async () => {
    const fixture = driver({
      createCacheFile(archiveId) {
        const file: FakeFile = {
          uri: `file:///cache/${archiveId}.gtbk`,
          exists: true,
          size: 4,
          createCalls: 0,
          deleteCalls: 0,
          writtenArchives: [],
          create() {
            file.createCalls += 1;
            file.exists = true;
          },
          delete() {
            file.deleteCalls += 1;
            file.exists = false;
            file.size = 0;
          },
          write(bytes) {
            file.writtenArchives.push(bytes);
            file.size = bytes.byteLength;
          },
        };
        fixture.files.set(archiveId, file);
        return file;
      },
      share: async () => {
        throw new Error("platform share failure");
      },
    });
    const port = createExpoBackupFilePort(fixture.driver);
    const archive = await port.writeArchive({
      archiveId: "backup-replace",
      archive: Uint8Array.from([1, 2, 3]),
    });
    expect(fixture.files.get(archive.archiveId)?.deleteCalls).toBe(1);
    await expect(port.shareArchive(archive)).rejects.toEqual(expect.objectContaining({
      code: "backup_sharing_failed",
    }));

    const cleanupFailure = driver({
      createCacheFile(archiveId) {
        const file: FakeFile = {
          uri: `file:///cache/${archiveId}.gtbk`,
          exists: false,
          size: 0,
          createCalls: 0,
          deleteCalls: 0,
          writtenArchives: [],
          create() {
            file.exists = true;
          },
          delete() {
            throw new Error("cleanup failed");
          },
          write(bytes) {
            file.size = bytes.byteLength;
          },
        };
        return file;
      },
    });
    const failingPort = createExpoBackupFilePort(cleanupFailure.driver);
    const cleanupArchive = await failingPort.writeArchive({
      archiveId: "backup-delete-failure",
      archive: Uint8Array.from([1]),
    });
    await expect(failingPort.deleteArchive(cleanupArchive)).rejects.toEqual(
      expect.objectContaining({ code: "backup_file_cleanup_failed" }),
    );
    await expect(failingPort.deleteArchive(cleanupArchive)).resolves.toBeUndefined();

    const missingDelete = driver({
      createCacheFile(archiveId) {
        const file: FakeFile = {
          uri: `file:///cache/${archiveId}.gtbk`,
          exists: false,
          size: 0,
          createCalls: 0,
          deleteCalls: 0,
          writtenArchives: [],
          create() {
            file.exists = true;
          },
          delete() {
            file.deleteCalls += 1;
            file.exists = false;
          },
          write(bytes) {
            file.size = bytes.byteLength;
          },
        };
        return file;
      },
    });
    const missingPort = createExpoBackupFilePort(missingDelete.driver);
    const missingArchive = await missingPort.writeArchive({
      archiveId: "backup-missing-delete",
      archive: Uint8Array.from([1]),
    });
    await missingPort.deleteArchive(missingArchive);
    await missingPort.deleteArchive(missingArchive);

    const externallyMissing = driver({
      createCacheFile(archiveId) {
        const file: FakeFile = {
          uri: `file:///cache/${archiveId}.gtbk`,
          exists: false,
          size: 0,
          createCalls: 0,
          deleteCalls: 0,
          writtenArchives: [],
          create() {
            file.exists = true;
          },
          delete() {
            file.deleteCalls += 1;
            file.exists = false;
          },
          write(bytes) {
            file.size = bytes.byteLength;
          },
        };
        externallyMissing.files.set(archiveId, file);
        return file;
      },
    });
    const externallyMissingPort = createExpoBackupFilePort(externallyMissing.driver);
    const externallyMissingArchive = await externallyMissingPort.writeArchive({
      archiveId: "backup-external-delete",
      archive: Uint8Array.from([1]),
    });
    const externallyMissingFile = externallyMissing.files.get(
      externallyMissingArchive.archiveId,
    );
    if (externallyMissingFile === undefined) {
      throw new Error("fixture_file_missing");
    }
    externallyMissingFile.exists = false;
    await externallyMissingPort.deleteArchive(externallyMissingArchive);
    expect(externallyMissingFile.deleteCalls).toBe(0);
  });

  it("keeps malformed handles out of the cache and uses the production Expo adapters", async () => {
    const fixture = driver();
    const port = createExpoBackupFilePort(fixture.driver);
    await expect(port.shareArchive({ archiveId: "invalid id" })).rejects.toEqual(
      expect.objectContaining({ code: "backup_file_input_invalid" }),
    );
    await expect(port.deleteArchive({ archiveId: "unknown" })).resolves.toBeUndefined();

    const productionPort = createProductionExpoBackupFilePort();
    const archive = await productionPort.writeArchive({
      archiveId: "backup-production",
      archive: Uint8Array.from([1]),
    });
    await productionPort.shareArchive(archive);
    await productionPort.deleteArchive(archive);

    expect(mockDirectoryCreate).toHaveBeenCalledWith({
      idempotent: true,
      intermediates: true,
    });
    expect(mockFileCreate).toHaveBeenCalledWith({
      intermediates: true,
      overwrite: true,
    });
    expect(mockFileWrite).toHaveBeenCalledWith(Uint8Array.from([1]));
    expect(mockShareAsync).toHaveBeenCalledWith(
      "file:///cache/gym-tracker-backups/backup-production.gtbk",
      expect.objectContaining({ mimeType: "application/octet-stream" }),
    );
    expect(mockFileDelete).toHaveBeenCalled();
  });
});

describe("Expo restore file port", () => {
  function selectedFile(input: Readonly<{
    size: number;
    bytes: Uint8Array;
    readError?: Error;
  }>) {
    const close = jest.fn();
    const readBytes = jest.fn((count: number) => {
      if (input.readError !== undefined) throw input.readError;
      return input.bytes.slice(0, count);
    });
    const open = jest.fn(() => ({ close, readBytes }));
    return { file: { size: input.size, open }, open, readBytes, close };
  }

  it("returns cancellation without opening or exposing the selected path", async () => {
    const pickSingleArchive = jest.fn(async () => null);
    const port = createExpoRestoreFilePort({ pickSingleArchive });

    await expect(port.readSelectedArchiveAtMost(5)).resolves.toBeNull();
    expect(JSON.stringify(await port.readSelectedArchiveAtMost(5))).not.toContain("file:");
  });

  it("rejects an invalid read cap before invoking the picker", async () => {
    const pickSingleArchive = jest.fn(async () => null);
    const port = createExpoRestoreFilePort({ pickSingleArchive });

    await expect(port.readSelectedArchiveAtMost(0)).rejects.toEqual(
      new RestoreFilePortError("read_failed"),
    );
    await expect(port.readSelectedArchiveAtMost(1.5)).rejects.toEqual(
      new RestoreFilePortError("read_failed"),
    );
    expect(pickSingleArchive).not.toHaveBeenCalled();
  });

  it("reads exactly the cap through a read-only handle and always closes it", async () => {
    const selected = selectedFile({ size: 5, bytes: Uint8Array.from([1, 2, 3, 4, 5]) });
    const port = createExpoRestoreFilePort({ pickSingleArchive: async () => selected.file });

    await expect(port.readSelectedArchiveAtMost(5)).resolves.toEqual(Uint8Array.from([1, 2, 3, 4, 5]));
    expect(selected.open).toHaveBeenCalledWith();
    expect(selected.readBytes).toHaveBeenCalledWith(5);
    expect(selected.close).toHaveBeenCalledTimes(1);
  });

  it("fails closed for an oversized or lying provider before archive bytes leave the adapter", async () => {
    const oversized = selectedFile({ size: 6, bytes: Uint8Array.from([1, 2, 3, 4, 5, 6]) });
    const oversizedPort = createExpoRestoreFilePort({ pickSingleArchive: async () => oversized.file });
    await expect(oversizedPort.readSelectedArchiveAtMost(5)).rejects.toEqual(new RestoreFilePortError("limit_exceeded"));
    expect(oversized.open).not.toHaveBeenCalled();

    const lying = selectedFile({ size: 4, bytes: Uint8Array.from([1, 2, 3, 4, 5]) });
    const lyingPort = createExpoRestoreFilePort({ pickSingleArchive: async () => lying.file });
    await expect(lyingPort.readSelectedArchiveAtMost(5)).rejects.toEqual(new RestoreFilePortError("read_failed"));
    expect(lying.close).toHaveBeenCalledTimes(1);
  });

  it("closes a read-only handle after a read failure", async () => {
    const selected = selectedFile({ size: 4, bytes: new Uint8Array(), readError: new Error("private/content/path") });
    const port = createExpoRestoreFilePort({ pickSingleArchive: async () => selected.file });
    await expect(port.readSelectedArchiveAtMost(5)).rejects.toEqual(new RestoreFilePortError("read_failed"));
    expect(selected.close).toHaveBeenCalledTimes(1);
  });

  it("maps picker and close failures to typed safe errors without replacing a bound classification", async () => {
    const picker = createExpoRestoreFilePort({
      pickSingleArchive: async () => { throw new Error("content://private/archive"); },
    });
    await expect(picker.readSelectedArchiveAtMost(5)).rejects.toEqual(new RestoreFilePortError("picker_failed"));

    const close = jest.fn(() => { throw new Error("file:///private/archive"); });
    const bounded = createExpoRestoreFilePort({
      pickSingleArchive: async () => ({ size: 5, open: () => ({ close, readBytes: () => new Uint8Array(6) }) }),
    });
    await expect(bounded.readSelectedArchiveAtMost(5)).rejects.toEqual(new RestoreFilePortError("limit_exceeded"));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("treats a close failure after a successful bounded read as read_failed", async () => {
    const close = jest.fn(() => { throw new Error("content://private/archive"); });
    const readBytes = jest.fn(() => Uint8Array.from([1, 2, 3]));
    const port = createExpoRestoreFilePort({
      pickSingleArchive: async () => ({
        size: 3,
        open: () => ({ close, readBytes }),
      }),
    });

    await expect(port.readSelectedArchiveAtMost(5)).rejects.toEqual(
      new RestoreFilePortError("read_failed"),
    );
    expect(readBytes).toHaveBeenCalledWith(5);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("uses Expo's cancelled/result picker shape and FileMode.ReadOnly in production", async () => {
    const handle = { close: jest.fn(), readBytes: jest.fn(() => Uint8Array.from([1, 2, 3])) };
    const open = jest.fn(() => handle);
    mockPickFileAsync.mockResolvedValueOnce({ canceled: false, result: { size: 3, open, uri: "content://private/backup" } });
    const port = createProductionExpoRestoreFilePort();

    await expect(port.readSelectedArchiveAtMost(5)).resolves.toEqual(Uint8Array.from([1, 2, 3]));
    expect(mockPickFileAsync).toHaveBeenCalledWith({ mimeTypes: "application/octet-stream", multipleFiles: false });
    expect(open).toHaveBeenCalledWith("r");
    expect(handle.close).toHaveBeenCalledTimes(1);

    mockPickFileAsync.mockResolvedValueOnce({ canceled: true, result: null });
    await expect(port.readSelectedArchiveAtMost(5)).resolves.toBeNull();
  });
});
