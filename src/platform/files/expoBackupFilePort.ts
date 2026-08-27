import {
  BACKUP_LIMITS,
} from "../../domains/portability/backupContracts";

export type BackupArchiveHandle = Readonly<{
  archiveId: string;
}>;

export type BackupArchiveFilePort = Readonly<{
  writeArchive(input: Readonly<{
    archiveId: string;
    archive: Uint8Array;
  }>): Promise<BackupArchiveHandle>;
  shareArchive(archive: BackupArchiveHandle): Promise<void>;
  deleteArchive(archive: BackupArchiveHandle): Promise<void>;
}>;

type SelectedRestoreFile = Readonly<{
  size: number;
  open(): Readonly<{
    readBytes(length: number): Uint8Array;
    close(): void;
  }>;
}>;

export type ExpoRestoreFileDriver = Readonly<{
  pickSingleArchive(): Promise<SelectedRestoreFile | null>;
}>;

export class RestoreFilePortError extends Error {
  readonly kind = "storage" as const;
  readonly retryable = true;
  readonly correlationCode = "GT-RESTORE03" as const;

  constructor(readonly code: "limit_exceeded" | "read_failed" | "picker_failed") {
    super(code);
    this.name = "RestoreFilePortError";
  }
}

/**
 * This intentionally exposes only bytes or cancellation.  A selected file's
 * URI can be a private app path or a content URI and must never leave this
 * adapter.
 */
export function createExpoRestoreFilePort(
  driver: ExpoRestoreFileDriver,
): Readonly<{
  readSelectedArchiveAtMost(maxBytes: number): Promise<Uint8Array | null>;
}> {
  return Object.freeze({
    async readSelectedArchiveAtMost(maxBytes) {
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
        throw new RestoreFilePortError("read_failed");
      }
      let file: SelectedRestoreFile | null;
      try {
        file = await driver.pickSingleArchive();
      } catch {
        throw new RestoreFilePortError("picker_failed");
      }
      if (file === null) return null;
      // The native size is only an early rejection: providers can report an
      // unknown or stale value, so the bounded handle read below remains the
      // authority. Unknown/negative values fail closed.
      if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > maxBytes) {
        throw new RestoreFilePortError("limit_exceeded");
      }
      let handle: ReturnType<SelectedRestoreFile["open"]> | undefined;
      let primaryFailure: RestoreFilePortError | undefined;
      try {
        // Expo defaults SAF/content URIs to ReadOnly. Production passes the
        // enum explicitly below; the driver seam has no write-capable method.
        handle = file.open();
        const bytes = handle.readBytes(maxBytes);
        if (!(bytes instanceof Uint8Array) || bytes.byteLength > maxBytes) {
          throw new RestoreFilePortError("limit_exceeded");
        }
        // A reported exact size must agree with the capped read. This catches
        // both a truncated read and a provider that changed beneath us.
        if (bytes.byteLength !== file.size) {
          throw new RestoreFilePortError("read_failed");
        }
        return new Uint8Array(bytes);
      } catch (error) {
        primaryFailure = error instanceof RestoreFilePortError
          ? error
          : new RestoreFilePortError("read_failed");
        throw primaryFailure;
      } finally {
        try {
          handle?.close();
        } catch {
          // Never allow a close failure to override an already classified
          // bound/read rejection or disclose a native URI/error.
          if (primaryFailure === undefined) {
            throw new RestoreFilePortError("read_failed");
          }
        }
      }
    },
  });
}

/** Production read-only picker. `maxBytes` is supplied as archive limit + 1. */
export function createProductionExpoRestoreFilePort() {
  return createExpoRestoreFilePort({
    async pickSingleArchive() {
      const { File, FileMode } = require("expo-file-system") as typeof import("expo-file-system");
      const selected = await File.pickFileAsync({
        mimeTypes: "application/octet-stream",
        multipleFiles: false,
      });
      if (selected.canceled) return null;
      return Object.freeze({
        size: selected.result.size,
        open() {
          const handle = selected.result.open(FileMode.ReadOnly);
          return Object.freeze({
            readBytes: (length: number) => handle.readBytes(length),
            close: () => handle.close(),
          });
        },
      });
    },
  });
}

type CacheFile = Readonly<{
  uri: string;
  exists: boolean;
  size: number;
  create(options: Readonly<{ intermediates: boolean; overwrite: boolean }>): void;
  delete(): void;
  write(bytes: Uint8Array): void;
}>;

export type ExpoBackupFileDriver = Readonly<{
  createCacheFile(archiveId: string): CacheFile;
  isSharingAvailable(): Promise<boolean>;
  share(uri: string, options: Readonly<{
    dialogTitle: string;
    mimeType: string;
  }>): Promise<void>;
}>;

export class BackupFilePortError extends Error {
  readonly kind = "storage" as const;
  readonly retryable = true;
  readonly correlationCode = "GT-BACKUP05" as const;

  constructor(readonly code:
    | "backup_file_input_invalid"
    | "backup_file_write_failed"
    | "backup_file_not_found"
    | "backup_file_cleanup_failed"
    | "backup_sharing_unavailable"
    | "backup_sharing_failed",
  ) {
    super(code);
    this.name = "BackupFilePortError";
  }
}

function validArchiveId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,119}$/u.test(value);
}

function validArchive(value: Uint8Array): boolean {
  return value instanceof Uint8Array
    && value.byteLength > 0
    && value.byteLength <= BACKUP_LIMITS.maxArchiveBytes;
}

function knownHandle(
  archives: ReadonlyMap<string, CacheFile>,
  archive: BackupArchiveHandle,
): CacheFile {
  if (!validArchiveId(archive.archiveId)) {
    throw new BackupFilePortError("backup_file_input_invalid");
  }
  const file = archives.get(archive.archiveId);
  if (file === undefined || !file.exists || file.size < 1) {
    throw new BackupFilePortError("backup_file_not_found");
  }
  return file;
}

/**
 * Keeps archive paths private to the platform adapter. Callers receive only a
 * stable handle so UI state and diagnostics can never disclose a filesystem
 * location. The archive stays in an evictable cache directory and is deleted
 * by the command lifecycle after sharing succeeds, fails, or is cancelled.
 */
export function createExpoBackupFilePort(
  driver: ExpoBackupFileDriver,
): BackupArchiveFilePort {
  const archives = new Map<string, CacheFile>();

  return Object.freeze({
    async writeArchive(input) {
      if (!validArchiveId(input.archiveId) || !validArchive(input.archive)) {
        throw new BackupFilePortError("backup_file_input_invalid");
      }
      let file: CacheFile | undefined;
      try {
        file = driver.createCacheFile(input.archiveId);
        if (file.exists) {
          file.delete();
        }
        file.create({ intermediates: true, overwrite: true });
        file.write(input.archive);
        if (!file.exists || file.size !== input.archive.byteLength) {
          throw new Error("archive_write_incomplete");
        }
        archives.set(input.archiveId, file);
        return Object.freeze({ archiveId: input.archiveId });
      } catch {
        try {
          if (file?.exists) {
            file.delete();
          }
        } catch {
          throw new BackupFilePortError("backup_file_cleanup_failed");
        }
        throw new BackupFilePortError("backup_file_write_failed");
      }
    },

    async shareArchive(archive) {
      const file = knownHandle(archives, archive);
      try {
        if (!await driver.isSharingAvailable()) {
          throw new BackupFilePortError("backup_sharing_unavailable");
        }
        await driver.share(file.uri, {
          dialogTitle: "Share Gym Tracker backup",
          mimeType: "application/octet-stream",
        });
      } catch (error) {
        if (error instanceof BackupFilePortError) {
          throw error;
        }
        throw new BackupFilePortError("backup_sharing_failed");
      }
    },

    async deleteArchive(archive) {
      const file = archives.get(archive.archiveId);
      archives.delete(archive.archiveId);
      if (file === undefined) {
        return;
      }
      try {
        if (file.exists) {
          file.delete();
        }
      } catch {
        throw new BackupFilePortError("backup_file_cleanup_failed");
      }
    },
  });
}

/** Production adapter loaded only inside the Expo runtime. */
export function createProductionExpoBackupFilePort(): BackupArchiveFilePort {
  return createExpoBackupFilePort({
    createCacheFile(archiveId) {
      const {
        Directory,
        File,
        Paths,
      } = require("expo-file-system") as typeof import("expo-file-system");
      const directory = new Directory(Paths.cache, "gym-tracker-backups");
      directory.create({ idempotent: true, intermediates: true });
      return new File(directory, `${archiveId}.gtbk`);
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
