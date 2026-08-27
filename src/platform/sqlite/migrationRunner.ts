import {
  type RecoveryBackupManifest,
  type RecoveryBackupPort,
} from "./recoveryBackup";
import {
  type SqliteParameter,
} from "./connection";
import {
  type SqliteKernel,
  type SqliteStorageError,
  type SqliteTransactionExecutor,
} from "./sqliteKernel";

export type MigrationKind = "additive" | "destructive" | "long";

export type Migration = Readonly<{
  version: number;
  name: string;
  kind: MigrationKind;
  up(transaction: SqliteTransactionExecutor): Promise<void>;
  verify(transaction: SqliteTransactionExecutor): Promise<void>;
}>;

export type MigrationFailureEvent = Readonly<{
  migration: Migration;
  phase: "before" | "after";
  statementIndex: number;
}>;

export type MigrationErrorCode =
  | "migration_commit_failed"
  | "migration_integrity_failed"
  | "migration_manifest_invalid"
  | "migration_recovery_failed"
  | "migration_retry_requires_restart"
  | "migration_statement_failed"
  | "migration_verify_failed"
  | "migration_version_unsupported";

export class MigrationError extends Error {
  readonly kind = "storage" as const;
  readonly retryable = false;

  constructor(
    readonly code: MigrationErrorCode,
    readonly cause?: unknown,
  ) {
    super(code);
    this.name = "MigrationError";
  }
}

export type MigrationRunResult = Readonly<{
  appliedVersions: readonly number[];
  currentVersion: number;
  recoveryBackup: RecoveryBackupManifest | null;
}>;

type MigrationRunnerOptions = Readonly<{
  databaseName: string;
  kernel: SqliteKernel;
  migrations: readonly Migration[];
  recoveryBackup?: RecoveryBackupPort;
  failureInjector?(event: MigrationFailureEvent): void;
}>;

type IntegrityRow = Readonly<Record<string, unknown>>;

function validateManifest(migrations: readonly Migration[]): void {
  let previousVersion = 0;
  for (const migration of migrations) {
    if (
      !Number.isInteger(migration.version)
      || migration.version <= previousVersion
      || migration.version < 1
      || migration.name.trim().length === 0
    ) {
      throw new MigrationError("migration_manifest_invalid");
    }
    previousVersion = migration.version;
  }
}

function storageCode(error: unknown): string | undefined {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

function nestedCause(error: unknown): unknown {
  if (
    typeof error === "object"
    && error !== null
    && "cause" in error
  ) {
    return error.cause;
  }
  return undefined;
}

function migrationFailure(error: unknown): MigrationError {
  const directCause = nestedCause(error);
  const migrationCause = directCause instanceof MigrationError
    ? directCause
    : error instanceof MigrationError
      ? error
      : undefined;
  if (migrationCause !== undefined) {
    return migrationCause;
  }
  if (storageCode(error) === "sqlite_commit_failed") {
    return new MigrationError("migration_commit_failed", error);
  }
  return new MigrationError("migration_statement_failed", error);
}

async function readUserVersion(kernel: SqliteKernel): Promise<number> {
  const [row] = await kernel.queryAll<{ user_version: number }>(
    "PRAGMA user_version",
  );
  return row?.user_version ?? 0;
}

function instrumentTransaction(
  transaction: SqliteTransactionExecutor,
  migration: Migration,
  failureInjector: MigrationRunnerOptions["failureInjector"],
): SqliteTransactionExecutor {
  let statementIndex = 0;
  return Object.freeze({
    async execute(
      sql: string,
      parameters: readonly SqliteParameter[] = [],
    ) {
      const currentIndex = statementIndex;
      statementIndex += 1;
      failureInjector?.({
        migration,
        phase: "before",
        statementIndex: currentIndex,
      });
      const result = await transaction.execute(sql, parameters);
      failureInjector?.({
        migration,
        phase: "after",
        statementIndex: currentIndex,
      });
      return result;
    },
    queryAll: <Row extends Record<string, unknown>>(
      sql: string,
      parameters = [],
    ) => transaction.queryAll<Row>(sql, parameters),
  });
}

async function verifyIntegrity(kernel: SqliteKernel): Promise<void> {
  let foreignKeyRows: readonly IntegrityRow[];
  let integrityRows: readonly IntegrityRow[];
  try {
    [foreignKeyRows, integrityRows] = await Promise.all([
      kernel.queryAll("PRAGMA foreign_key_check"),
      kernel.queryAll("PRAGMA integrity_check"),
    ]);
  } catch (error) {
    throw new MigrationError("migration_integrity_failed", error);
  }

  const integrityOk = integrityRows.length === 1
    && Object.values(integrityRows[0]!).some((value) => value === "ok");
  if (foreignKeyRows.length > 0 || !integrityOk) {
    throw new MigrationError("migration_integrity_failed");
  }
}

async function verifyTransactionIntegrity(
  transaction: SqliteTransactionExecutor,
): Promise<void> {
  let foreignKeyRows: readonly IntegrityRow[];
  let integrityRows: readonly IntegrityRow[];
  try {
    foreignKeyRows = await transaction.queryAll("PRAGMA foreign_key_check");
    integrityRows = await transaction.queryAll("PRAGMA integrity_check");
  } catch (error) {
    throw new MigrationError("migration_integrity_failed", error);
  }

  const integrityOk = integrityRows.length === 1
    && Object.values(integrityRows[0]!).some((value) => value === "ok");
  if (foreignKeyRows.length > 0 || !integrityOk) {
    throw new MigrationError("migration_integrity_failed");
  }
}

export function createMigrationRunner(options: MigrationRunnerOptions): Readonly<{
  run(): Promise<MigrationRunResult>;
}> {
  let attempted = false;

  return Object.freeze({
    async run(): Promise<MigrationRunResult> {
      if (attempted) {
        throw new MigrationError("migration_retry_requires_restart");
      }
      attempted = true;
      validateManifest(options.migrations);

      const currentVersion = await readUserVersion(options.kernel);
      const latestVersion = options.migrations.at(-1)?.version ?? 0;
      if (currentVersion > latestVersion) {
        throw new MigrationError("migration_version_unsupported");
      }

      const pending = options.migrations.filter(
        ({ version }) => version > currentVersion,
      );
      let recoveryBackup: RecoveryBackupManifest | null = null;
      if (pending.some(({ kind }) => kind !== "additive")) {
        if (options.recoveryBackup === undefined) {
          throw new MigrationError("migration_recovery_failed");
        }
        try {
          recoveryBackup = await options.recoveryBackup.createAndValidate({
            databaseName: options.databaseName,
            fromVersion: currentVersion,
            toVersion: pending[pending.length - 1]!.version,
          });
        } catch (error) {
          throw new MigrationError("migration_recovery_failed", error);
        }
        if (!recoveryBackup.validated) {
          throw new MigrationError("migration_recovery_failed");
        }
      }

      const appliedVersions: number[] = [];
      for (const migration of pending) {
        try {
          await options.kernel.write(async (transaction) => {
            const instrumented = instrumentTransaction(
              transaction,
              migration,
              options.failureInjector,
            );
            await migration.up(instrumented);
            try {
              await migration.verify(transaction);
            } catch (error) {
              throw new MigrationError("migration_verify_failed", error);
            }
            await verifyTransactionIntegrity(transaction);
            await transaction.execute(
              `PRAGMA user_version = ${migration.version}`,
            );
          });
        } catch (error) {
          throw migrationFailure(error as SqliteStorageError);
        }
        appliedVersions.push(migration.version);
      }

      await verifyIntegrity(options.kernel);
      return {
        appliedVersions,
        currentVersion: pending.at(-1)?.version ?? currentVersion,
        recoveryBackup,
      };
    },
  });
}
