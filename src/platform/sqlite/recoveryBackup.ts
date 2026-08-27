import {
  type SqliteKernel,
} from "./sqliteKernel";

export type RecoveryBackupRequest = Readonly<{
  databaseName: string;
  fromVersion: number;
  toVersion: number;
}>;

export type RecoveryBackupManifest = Readonly<{
  backupId: string;
  databaseName: string;
  fromVersion: number;
  toVersion: number;
  validated: true;
}>;

export interface RecoveryBackupPort {
  createAndValidate(
    request: RecoveryBackupRequest,
  ): Promise<RecoveryBackupManifest>;
}

type ExpoRecoveryBackupOptions = Readonly<{
  backupIdPrefix?: string;
  retainValidationKernel?(kernel: SqliteKernel): void;
  openSource(databaseName: string): Promise<unknown>;
  openDestination(databaseName: string): Promise<unknown>;
  backup(options: Readonly<{
    sourceDatabase: unknown;
    destDatabase: unknown;
  }>): Promise<void>;
  close(database: unknown): Promise<void>;
  validate(databaseName: string): Promise<SqliteKernel>;
  remove(databaseName: string): Promise<void>;
  writeManifest(manifest: RecoveryBackupManifest): Promise<void>;
}>;

async function validateBackup(
  kernel: SqliteKernel,
  expectedVersion: number,
  retainKernel: ExpoRecoveryBackupOptions["retainValidationKernel"],
): Promise<void> {
  try {
    const [versionRow] = await kernel.queryAll<{ user_version: number }>(
      "PRAGMA user_version",
    );
    const foreignKeyRows = await kernel.queryAll("PRAGMA foreign_key_check");
    const integrityRows = await kernel.queryAll<Record<string, unknown>>(
      "PRAGMA integrity_check",
    );
    const integrityOk = integrityRows.length === 1
      && Object.values(integrityRows[0]!).some((value) => value === "ok");
    if (
      versionRow?.user_version !== expectedVersion
      || foreignKeyRows.length > 0
      || !integrityOk
    ) {
      throw new Error("recovery_backup_validation_failed");
    }
  } catch (error) {
    await kernel.close();
    throw error;
  }
  if (retainKernel === undefined) {
    await kernel.close();
  } else {
    retainKernel(kernel);
  }
}

export function createExpoRecoveryBackupPort(
  options: ExpoRecoveryBackupOptions,
): RecoveryBackupPort {
  return Object.freeze({
    async createAndValidate(
      request: RecoveryBackupRequest,
    ): Promise<RecoveryBackupManifest> {
      const backupId =
        `${options.backupIdPrefix ?? ""}migration-recovery-v${request.fromVersion}-to-v${request.toVersion}`;
      const backupDatabaseName = `${backupId}.db`;
      await options.remove(backupDatabaseName).catch(() => undefined);

      let sourceDatabase: unknown;
      let destDatabase: unknown;
      try {
        sourceDatabase = await options.openSource(request.databaseName);
        destDatabase = await options.openDestination(backupDatabaseName);
        await options.backup({ sourceDatabase, destDatabase });
        await Promise.allSettled([
          options.close(sourceDatabase),
          options.close(destDatabase),
        ]);
        sourceDatabase = undefined;
        destDatabase = undefined;
        await validateBackup(
          await options.validate(backupDatabaseName),
          request.fromVersion,
          options.retainValidationKernel,
        );
        const manifest: RecoveryBackupManifest = {
          backupId,
          databaseName: request.databaseName,
          fromVersion: request.fromVersion,
          toVersion: request.toVersion,
          validated: true,
        };
        await options.writeManifest(manifest);
        return manifest;
      } catch (error) {
        await options.remove(backupDatabaseName).catch(() => undefined);
        throw error;
      } finally {
        await Promise.allSettled([
          sourceDatabase === undefined
            ? Promise.resolve()
            : options.close(sourceDatabase),
          destDatabase === undefined
            ? Promise.resolve()
            : options.close(destDatabase),
        ]);
      }
    },
  });
}
