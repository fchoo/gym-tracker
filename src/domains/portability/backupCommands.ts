import {
  createBackupEnvelopeCodec,
} from "./backupFormat";
import {
  ARGON2ID_DESCRIPTOR_VERSION,
  ARGON2ID_ITERATIONS,
  ARGON2ID_MEMORY_KIB,
  ARGON2ID_OUTPUT_LENGTH,
  ARGON2ID_PARALLELISM,
  ARGON2ID_SALT_LENGTH,
  type PasswordKdfPort,
} from "../../platform/crypto/passwordKdf";
import {
  AES_GCM_ARCHIVE_NONCE_BYTES,
  type AesGcmArchivePort,
} from "../../platform/crypto/aesGcmArchivePort";
import type {
  BackupArchiveFilePort,
  BackupArchiveHandle,
} from "../../platform/files/expoBackupFilePort";
import type {
  LogicalBackupRepository,
} from "../../platform/sqlite/repositories/logicalBackupRepository";

export type SecureBackupCommands = Readonly<{
  createSecureBackup(input: Readonly<{
    password: string;
    signal?: AbortSignal;
  }>): Promise<BackupArchiveHandle>;
  discardSecureBackup(archive: BackupArchiveHandle): Promise<void>;
  shareSecureBackup(archive: BackupArchiveHandle): Promise<void>;
}>;

export class BackupCommandError extends Error {
  readonly kind = "storage" as const;
  readonly retryable = true;
  readonly correlationCode = "GT-BACKUP04" as const;

  constructor(readonly code:
    | "backup_export_input_invalid"
    | "backup_export_cancelled"
    | "backup_export_failed"
    | "backup_sharing_failed",
  ) {
    super(code);
    this.name = "BackupCommandError";
  }
}

export type BackupCommandDependencies = Readonly<{
  collector: LogicalBackupRepository;
  crypto: AesGcmArchivePort;
  files: BackupArchiveFilePort;
  kdf: PasswordKdfPort;
  nowMs(): number;
  randomBytes(length: number): Uint8Array;
  snapshotId(): string;
}>;

function wipe(...buffers: Array<Uint8Array | undefined>): void {
  for (const buffer of buffers) {
    buffer?.fill(0);
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new BackupCommandError("backup_export_cancelled");
  }
}

function mapCreateError(error: unknown): BackupCommandError {
  if (error instanceof BackupCommandError) {
    return error;
  }
  return new BackupCommandError("backup_export_failed");
}

function mapShareError(error: unknown): BackupCommandError {
  if (error instanceof BackupCommandError) {
    return error;
  }
  return new BackupCommandError("backup_sharing_failed");
}

function validPassword(value: string): boolean {
  const bytes = new TextEncoder().encode(value);
  try {
    return bytes.byteLength >= 1 && bytes.byteLength <= 1_024;
  } finally {
    wipe(bytes);
  }
}

export function createBackupCommands(
  dependencies: BackupCommandDependencies,
): SecureBackupCommands {
  const codec = createBackupEnvelopeCodec({
    deriveKey: async ({ password, salt }) => {
      const result = await dependencies.kdf.derive(password, {
        algorithm: "argon2id",
        iterations: ARGON2ID_ITERATIONS,
        memoryKiB: ARGON2ID_MEMORY_KIB,
        outputLength: ARGON2ID_OUTPUT_LENGTH,
        parallelism: ARGON2ID_PARALLELISM,
        salt,
        version: ARGON2ID_DESCRIPTOR_VERSION,
      });
      return { key: result.bytes };
    },
    encrypt: dependencies.crypto.encrypt,
    decrypt: dependencies.crypto.decrypt,
  });

  return Object.freeze({
    async createSecureBackup(input) {
      if (!validPassword(input.password)) {
        throw new BackupCommandError("backup_export_input_invalid");
      }
      const password = new TextEncoder().encode(input.password);
      let salt: Uint8Array | undefined;
      let nonce: Uint8Array | undefined;
      let archive: Uint8Array | undefined;
      let handle: BackupArchiveHandle | undefined;
      try {
        throwIfAborted(input.signal);
        const snapshot = await dependencies.collector.collect({
          createdAtMs: dependencies.nowMs(),
          snapshotId: dependencies.snapshotId(),
        });
        throwIfAborted(input.signal);
        salt = dependencies.randomBytes(ARGON2ID_SALT_LENGTH);
        nonce = dependencies.randomBytes(AES_GCM_ARCHIVE_NONCE_BYTES);
        if (!(salt instanceof Uint8Array)
          || salt.byteLength !== ARGON2ID_SALT_LENGTH
          || !(nonce instanceof Uint8Array)
          || nonce.byteLength !== AES_GCM_ARCHIVE_NONCE_BYTES) {
          throw new BackupCommandError("backup_export_failed");
        }
        archive = await codec.seal({
          nonce,
          password,
          salt,
          snapshot,
        });
        throwIfAborted(input.signal);
        handle = await dependencies.files.writeArchive({
          archive,
          archiveId: snapshot.snapshotId,
        });
        throwIfAborted(input.signal);
        return handle;
      } catch (error) {
        if (handle !== undefined) {
          try {
            await dependencies.files.deleteArchive(handle);
          } catch {
            throw new BackupCommandError("backup_export_failed");
          }
        }
        throw mapCreateError(error);
      } finally {
        wipe(password, salt, nonce, archive);
      }
    },

    async discardSecureBackup(archive) {
      try {
        await dependencies.files.deleteArchive(archive);
      } catch {
        throw new BackupCommandError("backup_export_failed");
      }
    },

    async shareSecureBackup(archive) {
      let failure: unknown;
      try {
        await dependencies.files.shareArchive(archive);
      } catch (error) {
        failure = error;
      }
      try {
        await dependencies.files.deleteArchive(archive);
      } catch {
        throw new BackupCommandError("backup_export_failed");
      }
      if (failure !== undefined) {
        throw mapShareError(failure);
      }
    },
  });
}
