import type {
  SQLiteBindValue,
  SQLiteDatabase,
} from "expo-sqlite";

export const SQLITE_BUSY_TIMEOUT_MS = 1_000 as const;

export type SqliteParameter =
  | null
  | number
  | string
  | Uint8Array;

export type SqlitePreparedResult<Row extends Record<string, unknown>> = Readonly<{
  changes: number;
  lastInsertRowId: number;
  getAllAsync(): Promise<readonly Row[]>;
}>;

export interface SqlitePreparedStatement {
  executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly SqliteParameter[],
  ): Promise<SqlitePreparedResult<Row>>;
  finalizeAsync(): Promise<void>;
}

export interface SqliteConnection {
  execAsync(sql: string): Promise<void>;
  prepareAsync(sql: string): Promise<SqlitePreparedStatement>;
  isInTransactionAsync(): Promise<boolean>;
  closeAsync(): Promise<void>;
}

export type SqliteConnectionConfiguration = Readonly<{
  busyTimeoutMs: number;
  foreignKeys: boolean;
  journalMode: string;
}>;

export class SqliteStatementFinalizeError extends Error {
  constructor() {
    super("sqlite_statement_finalize_failed");
    this.name = "SqliteStatementFinalizeError";
  }
}

class ExpoSqlitePreparedStatement implements SqlitePreparedStatement {
  constructor(
    private readonly statement: Awaited<
      ReturnType<SQLiteDatabase["prepareAsync"]>
    >,
  ) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly SqliteParameter[],
  ): Promise<SqlitePreparedResult<Row>> {
    const result = await this.statement.executeAsync<Row>(
      [...parameters] as SQLiteBindValue[],
    );
    return {
      changes: result.changes,
      lastInsertRowId: result.lastInsertRowId,
      getAllAsync: () => result.getAllAsync(),
    };
  }

  async finalizeAsync(): Promise<void> {
    await this.statement.finalizeAsync();
  }
}

class ExpoSqliteConnection implements SqliteConnection {
  constructor(private readonly database: SQLiteDatabase) {}

  execAsync(sql: string): Promise<void> {
    return this.database.execAsync(sql);
  }

  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new ExpoSqlitePreparedStatement(
      await this.database.prepareAsync(sql),
    );
  }

  isInTransactionAsync(): Promise<boolean> {
    return this.database.isInTransactionAsync();
  }

  closeAsync(): Promise<void> {
    return this.database.closeAsync();
  }
}

export async function withPreparedStatement<Result>(
  connection: SqliteConnection,
  sql: string,
  operation: (statement: SqlitePreparedStatement) => Promise<Result>,
): Promise<Result> {
  const statement = await connection.prepareAsync(sql);
  let operationError: unknown;
  try {
    return await operation(statement);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await statement.finalizeAsync();
    } catch {
      if (operationError === undefined) {
        throw new SqliteStatementFinalizeError();
      }
    }
  }
}

export async function executePrepared(
  connection: SqliteConnection,
  sql: string,
  parameters: readonly SqliteParameter[],
): Promise<Readonly<{ changes: number; lastInsertRowId: number }>> {
  return withPreparedStatement(connection, sql, async (statement) => {
    const result = await statement.executeAsync(parameters);
    return {
      changes: result.changes,
      lastInsertRowId: result.lastInsertRowId,
    };
  });
}

export async function queryPrepared<Row extends Record<string, unknown>>(
  connection: SqliteConnection,
  sql: string,
  parameters: readonly SqliteParameter[] = [],
): Promise<readonly Row[]> {
  return withPreparedStatement(connection, sql, async (statement) => {
    const result = await statement.executeAsync<Row>(parameters);
    return result.getAllAsync();
  });
}

export async function configureSqliteConnection(
  connection: SqliteConnection,
  options: Readonly<{ enableWal: boolean }>,
): Promise<SqliteConnectionConfiguration> {
  if (options.enableWal) {
    await connection.execAsync("PRAGMA journal_mode = WAL");
  }
  await connection.execAsync("PRAGMA foreign_keys = ON");
  await connection.execAsync(
    `PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`,
  );

  const [journalMode] = await queryPrepared<{ journal_mode: string }>(
    connection,
    "PRAGMA journal_mode",
  );
  const [foreignKeys] = await queryPrepared<{ foreign_keys: number }>(
    connection,
    "PRAGMA foreign_keys",
  );
  const [busyTimeout] = await queryPrepared<{ timeout: number }>(
    connection,
    "PRAGMA busy_timeout",
  );

  return {
    journalMode: journalMode?.journal_mode.toLowerCase() ?? "",
    foreignKeys: foreignKeys?.foreign_keys === 1,
    busyTimeoutMs: busyTimeout?.timeout ?? -1,
  };
}

export async function openConfiguredSqliteConnections(
  databaseName: string,
): Promise<Readonly<{
  reader: SqliteConnection;
  writer: SqliteConnection;
}>> {
  const { openDatabaseAsync } = require("expo-sqlite") as typeof import("expo-sqlite");
  const writer = new ExpoSqliteConnection(
    await openDatabaseAsync(databaseName, { useNewConnection: true }),
  );

  try {
    await configureSqliteConnection(writer, { enableWal: true });
    const reader = new ExpoSqliteConnection(
      await openDatabaseAsync(databaseName, { useNewConnection: true }),
    );
    try {
      await configureSqliteConnection(reader, { enableWal: false });
      return { reader, writer };
    } catch (error) {
      await reader.closeAsync().catch(() => undefined);
      throw error;
    }
  } catch (error) {
    await writer.closeAsync().catch(() => undefined);
    throw error;
  }
}
