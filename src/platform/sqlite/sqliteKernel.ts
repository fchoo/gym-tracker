import {
  SQLITE_BUSY_TIMEOUT_MS,
  SqliteConnection,
  SqliteConnectionConfiguration,
  SqliteParameter,
  SqliteStatementFinalizeError,
  configureSqliteConnection,
  executePrepared,
  openConfiguredSqliteConnections,
  queryPrepared,
} from "./connection";
import {
  SerializedWriteExecutor,
  SqliteWriterError,
} from "./serializedWriter";

export type SqliteStatementResult = Readonly<{
  changes: number;
  lastInsertRowId: number;
}>;

export interface SqliteTransactionExecutor {
  execute(
    sql: string,
    parameters?: readonly SqliteParameter[],
  ): Promise<SqliteStatementResult>;
  queryAll<Row extends Record<string, unknown>>(
    sql: string,
    parameters?: readonly SqliteParameter[],
  ): Promise<readonly Row[]>;
}

export interface SqliteKernel {
  write<Result>(
    command: (transaction: SqliteTransactionExecutor) => Promise<Result>,
  ): Promise<Result>;
  queryAll<Row extends Record<string, unknown>>(
    sql: string,
    parameters?: readonly SqliteParameter[],
  ): Promise<readonly Row[]>;
  connectionConfiguration(): Promise<Readonly<{
    reader: SqliteConnectionConfiguration;
    writer: SqliteConnectionConfiguration;
  }>>;
  close(): Promise<void>;
}

export type SqliteStorageErrorCode =
  | "sqlite_begin_failed"
  | "sqlite_commit_failed"
  | "sqlite_query_failed"
  | "sqlite_rollback_failed"
  | "sqlite_statement_finalize_failed"
  | "sqlite_transaction_failed";

export class SqliteStorageError extends Error {
  readonly kind = "storage" as const;
  readonly retryable: boolean;

  constructor(
    readonly code: SqliteStorageErrorCode,
    readonly cause: unknown,
  ) {
    super(code);
    this.name = "SqliteStorageError";
    this.retryable = code === "sqlite_begin_failed";
  }
}

type SqliteKernelConnections = Readonly<{
  reader: SqliteConnection;
  writer: SqliteConnection;
}>;

export type SqliteKernelTestObserver = Readonly<{
  beforeCommit?(): Promise<void>;
}>;

export type SqliteKernelTestRuntime = Readonly<{
  kernel: SqliteKernel;
  competeForWriteIntent(): Promise<Readonly<{
    code: "sqlite_busy" | "unexpected_error" | "unexpected_success";
    durationMs: number;
  }>>;
  isWriterInTransaction(): Promise<boolean>;
  close(): Promise<void>;
}>;

function storageError(error: unknown): SqliteStorageError {
  if (error instanceof SqliteStatementFinalizeError) {
    return new SqliteStorageError(
      "sqlite_statement_finalize_failed",
      error,
    );
  }
  const writerError = error as SqliteWriterError;
  const codeByStage = {
    begin: "sqlite_begin_failed",
    commit: "sqlite_commit_failed",
    rollback: "sqlite_rollback_failed",
    statement: "sqlite_statement_finalize_failed",
    transaction: "sqlite_transaction_failed",
  } as const;
  return new SqliteStorageError(
    codeByStage[writerError.stage],
    writerError.cause,
  );
}

function createBoundExecutor(
  connection: SqliteConnection,
): SqliteTransactionExecutor {
  return Object.freeze({
    execute: (
      sql: string,
      parameters: readonly SqliteParameter[] = [],
    ) => executePrepared(connection, sql, parameters),
    queryAll: <Row extends Record<string, unknown>>(
      sql: string,
      parameters: readonly SqliteParameter[] = [],
    ) => queryPrepared<Row>(connection, sql, parameters),
  });
}

export function createSqliteKernel(
  connections: SqliteKernelConnections,
  observer: SqliteKernelTestObserver = {},
): SqliteKernel {
  const serializedWriter = new SerializedWriteExecutor(
    connections.writer,
    observer.beforeCommit,
  );
  const transactionExecutor = createBoundExecutor(connections.writer);

  return Object.freeze({
    async write<Result>(
      command: (transaction: SqliteTransactionExecutor) => Promise<Result>,
    ): Promise<Result> {
      try {
        return await serializedWriter.execute(() => command(transactionExecutor));
      } catch (error) {
        throw storageError(error);
      }
    },
    async queryAll<Row extends Record<string, unknown>>(
      sql: string,
      parameters: readonly SqliteParameter[] = [],
    ): Promise<readonly Row[]> {
      try {
        return await queryPrepared<Row>(connections.reader, sql, parameters);
      } catch (error) {
        if (error instanceof SqliteStatementFinalizeError) {
          throw storageError(error);
        }
        throw new SqliteStorageError("sqlite_query_failed", error);
      }
    },
    async connectionConfiguration() {
      try {
        const writer = await configureSqliteConnection(
          connections.writer,
          { enableWal: false },
        );
        const reader = await configureSqliteConnection(
          connections.reader,
          { enableWal: false },
        );
        return { reader, writer };
      } catch (error) {
        throw new SqliteStorageError("sqlite_query_failed", error);
      }
    },
    async close(): Promise<void> {
      let firstFailure: unknown;
      for (const connection of [connections.reader, connections.writer]) {
        try {
          await connection.closeAsync();
        } catch (error) {
          firstFailure ??= error;
        }
      }
      if (firstFailure !== undefined) {
        throw new SqliteStorageError("sqlite_query_failed", firstFailure);
      }
    },
  });
}

export async function openSqliteKernel(
  databaseName: string,
): Promise<SqliteKernel> {
  return createSqliteKernel(
    await openConfiguredSqliteConnections(databaseName),
  );
}

export async function openSqliteKernelTestRuntime(
  databaseName: string,
  observer: SqliteKernelTestObserver = {},
): Promise<SqliteKernelTestRuntime> {
  const connections = await openConfiguredSqliteConnections(databaseName);
  const kernel = createSqliteKernel(connections, observer);

  return Object.freeze({
    kernel,
    async competeForWriteIntent() {
      const { openDatabaseAsync } = require("expo-sqlite") as typeof import("expo-sqlite");
      const competingDatabase = await openDatabaseAsync(
        databaseName,
        { useNewConnection: true },
      );
      const startedAt = Date.now();
      try {
        await competingDatabase.execAsync(
          `PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`,
        );
        await competingDatabase.execAsync("BEGIN IMMEDIATE");
        await competingDatabase.execAsync("ROLLBACK");
        return {
          code: "unexpected_success" as const,
          durationMs: Date.now() - startedAt,
        };
      } catch (error) {
        return {
          code: /busy|locked/i.test(String(error))
            ? "sqlite_busy" as const
            : "unexpected_error" as const,
          durationMs: Date.now() - startedAt,
        };
      } finally {
        await competingDatabase.closeAsync();
      }
    },
    isWriterInTransaction: () => connections.writer.isInTransactionAsync(),
    close: () => kernel.close(),
  });
}
