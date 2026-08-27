export const CSV_EXPORT_MAX_BYTES = 32 * 1024 * 1024;
export const CSV_EXPORT_FILENAME = "gym-tracker-export-v1.csv";

export type CsvExportHandle = Readonly<{ exportId: string }>;

type CacheFile = Readonly<{
  uri: string;
  exists: boolean;
  size: number;
  create(options: Readonly<{ intermediates: boolean; overwrite: boolean }>): void;
  delete(): void;
  write(bytes: Uint8Array): void;
}>;

export type ExpoCsvFileDriver = Readonly<{
  createCacheFile(filename: string): CacheFile;
  isSharingAvailable(): Promise<boolean>;
  share(uri: string, options: Readonly<{
    dialogTitle: string;
    mimeType: string;
  }>): Promise<void>;
}>;

export type CsvFilePort = Readonly<{
  writeCsv(bytes: Uint8Array): Promise<CsvExportHandle>;
  shareCsv(handle: CsvExportHandle): Promise<void>;
  discardCsv(handle: CsvExportHandle): Promise<void>;
}>;

export class CsvFilePortError extends Error {
  readonly kind = "storage" as const;
  readonly retryable = true;
  readonly correlationCode = "GT-CSV03" as const;

  constructor(readonly code:
    | "csv_file_input_invalid"
    | "csv_file_write_failed"
    | "csv_file_cleanup_failed"
    | "csv_file_not_found"
    | "csv_file_busy"
    | "csv_sharing_unavailable"
    | "csv_sharing_failed",
  ) {
    super(code);
    this.name = "CsvFilePortError";
  }
}

function validBytes(bytes: Uint8Array): boolean {
  return bytes instanceof Uint8Array
    && bytes.byteLength > 0
    && bytes.byteLength <= CSV_EXPORT_MAX_BYTES;
}

export function createExpoCsvFilePort(driver: ExpoCsvFileDriver): CsvFilePort {
  let generation = 0;
  let current: Readonly<{
    exportId: string;
    file: CacheFile;
    state: "ready" | "sharing";
  }> | undefined;

  const matching = (handle: CsvExportHandle) =>
    current?.exportId === handle.exportId ? current : undefined;

  const discardReady = (handle: CsvExportHandle): void => {
    const entry = matching(handle);
    if (entry === undefined || entry.state !== "ready") return;
    current = undefined;
    try {
      if (entry.file.exists) entry.file.delete();
    } catch {
      current = entry;
      throw new CsvFilePortError("csv_file_cleanup_failed");
    }
  };

  return Object.freeze({
    async writeCsv(bytes) {
      if (!validBytes(bytes)) {
        throw new CsvFilePortError("csv_file_input_invalid");
      }
      let file: CacheFile | undefined;
      try {
        if (current?.state === "sharing") {
          throw new CsvFilePortError("csv_file_busy");
        }
        if (current !== undefined) discardReady({ exportId: current.exportId });
        file = driver.createCacheFile(CSV_EXPORT_FILENAME);
        if (file.exists) file.delete();
        file.create({ intermediates: true, overwrite: true });
        file.write(bytes);
        if (!file.exists || file.size !== bytes.byteLength) {
          throw new Error("csv_write_incomplete");
        }
        generation += 1;
        const handle = Object.freeze({ exportId: `csv-v1-${generation}` });
        current = Object.freeze({ ...handle, file, state: "ready" as const });
        return handle;
      } catch (error) {
        try {
          if (file?.exists) file.delete();
        } catch {
          throw new CsvFilePortError("csv_file_cleanup_failed");
        }
        if (error instanceof CsvFilePortError) throw error;
        throw new CsvFilePortError("csv_file_write_failed");
      }
    },

    async shareCsv(handle) {
      const entry = matching(handle);
      if (entry === undefined || entry.state !== "ready"
        || !entry.file.exists || entry.file.size < 1) {
        throw new CsvFilePortError("csv_file_not_found");
      }
      current = Object.freeze({ ...entry, state: "sharing" as const });
      let shareFailure: CsvFilePortError | undefined;
      try {
        if (!await driver.isSharingAvailable()) {
          shareFailure = new CsvFilePortError("csv_sharing_unavailable");
        } else {
          await driver.share(entry.file.uri, {
            dialogTitle: "Share Gym Tracker CSV",
            mimeType: "text/csv",
          });
        }
      } catch {
        shareFailure = new CsvFilePortError("csv_sharing_failed");
      }
      try {
        if (entry.file.exists) entry.file.delete();
      } catch {
        current = Object.freeze({ ...entry, state: "ready" as const });
        throw new CsvFilePortError("csv_file_cleanup_failed");
      } finally {
        if (matching(handle)?.state === "sharing") current = undefined;
      }
      if (shareFailure !== undefined) throw shareFailure;
    },

    async discardCsv(handle) {
      discardReady(handle);
    },
  });
}

export function createProductionExpoCsvFilePort(): CsvFilePort {
  return createExpoCsvFilePort({
    createCacheFile(filename) {
      const { Directory, File, Paths } = require("expo-file-system") as
        typeof import("expo-file-system");
      const directory = new Directory(Paths.cache, "gym-tracker-exports");
      directory.create({ idempotent: true, intermediates: true });
      return new File(directory, filename);
    },
    async isSharingAvailable() {
      const Sharing = require("expo-sharing") as typeof import("expo-sharing");
      return Sharing.isAvailableAsync();
    },
    async share(uri, options) {
      const Sharing = require("expo-sharing") as typeof import("expo-sharing");
      await Sharing.shareAsync(uri, options);
    },
  });
}
