import type {
  SQLiteBindValue,
  SQLiteDatabase,
} from "expo-sqlite";

import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../connection";
import {
  type SqliteKernel,
  createSqliteKernel,
  type SqliteKernelTestObserver,
  type SqliteTransactionExecutor,
} from "../sqliteKernel";

export type ExerciseSearchIndexParity = Readonly<{
  sourceTermCount: number;
  indexedTermCount: number;
  missingSourceTermIds: readonly number[];
  extraIndexedTermIds: readonly number[];
  integrityOk: boolean;
  exact: boolean;
}>;

export type ExerciseSearchIndexRepository = Readonly<{
  verifyParity(): Promise<ExerciseSearchIndexParity>;
  rebuildSearchIndex(): Promise<ExerciseSearchIndexParity>;
}>;

export type ExerciseSearchFtsContractRuntime = Readonly<{
  kernel: SqliteKernel;
  isWriterInTransaction(): Promise<boolean>;
  close(): Promise<void>;
}>;

class ExerciseSearchFtsPreparedResult<Row extends Record<string, unknown>>
implements SqlitePreparedResult<Row> {
  constructor(
    readonly changes: number,
    readonly lastInsertRowId: number,
    private readonly loadRows: () => Promise<readonly Row[]>,
  ) {}

  async getAllAsync(): Promise<readonly Row[]> {
    return this.loadRows();
  }
}

class ExerciseSearchFtsPreparedStatement implements SqlitePreparedStatement {
  constructor(
    private readonly statement: Awaited<
      ReturnType<SQLiteDatabase["prepareAsync"]>
    >,
  ) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly (
      null | number | string | Uint8Array
    )[],
  ): Promise<SqlitePreparedResult<Row>> {
    const result = await this.statement.executeAsync<Row>(
      [...parameters] as SQLiteBindValue[],
    );
    return new ExerciseSearchFtsPreparedResult(
      result.changes,
      result.lastInsertRowId,
      () => result.getAllAsync(),
    );
  }

  async finalizeAsync(): Promise<void> {
    await this.statement.finalizeAsync();
  }
}

class ExerciseSearchFtsExpoConnection implements SqliteConnection {
  constructor(private readonly database: SQLiteDatabase) {}

  execAsync(sql: string): Promise<void> {
    return this.database.execAsync(sql);
  }

  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new ExerciseSearchFtsPreparedStatement(
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

async function verifyParityInTransaction(
  transaction: SqliteTransactionExecutor,
): Promise<ExerciseSearchIndexParity> {
  const [sourceCount] = await transaction.queryAll<{ count: number }>(
    "SELECT COUNT(*) AS count FROM exercise_search_terms",
  );
  const [indexedCount] = await transaction.queryAll<{ count: number }>(
    "SELECT COUNT(*) AS count FROM exercise_search_terms_fts_docsize",
  );
  const missingSourceTermIds = await transaction.queryAll<{ id: number }>(
    `SELECT source.id
     FROM exercise_search_terms source
     LEFT JOIN exercise_search_terms_fts_docsize fts_doc
       ON fts_doc.id = source.id
     WHERE fts_doc.id IS NULL
     ORDER BY source.id`,
  );
  const extraIndexedTermIds = await transaction.queryAll<{ id: number }>(
    `SELECT fts_doc.id
     FROM exercise_search_terms_fts_docsize fts_doc
     LEFT JOIN exercise_search_terms source
       ON source.id = fts_doc.id
     WHERE source.id IS NULL
     ORDER BY fts_doc.id`,
  );

  let integrityOk = true;
  try {
    await transaction.execute(
      `INSERT INTO exercise_search_terms_fts(
        exercise_search_terms_fts,
        rank
      )
      VALUES ('integrity-check', 1)`,
    );
  } catch {
    integrityOk = false;
  }

  const sourceTermCount = sourceCount?.count ?? 0;
  const indexedTermCount = indexedCount?.count ?? 0;
  const missingIds = missingSourceTermIds.map(({ id }) => id);
  const extraIds = extraIndexedTermIds.map(({ id }) => id);
  return {
    sourceTermCount,
    indexedTermCount,
    missingSourceTermIds: missingIds,
    extraIndexedTermIds: extraIds,
    integrityOk,
    exact:
      sourceTermCount === indexedTermCount
      && missingIds.length === 0
      && extraIds.length === 0
      && integrityOk,
  };
}

export function createExerciseSearchIndexRepository(
  kernel: SqliteKernel,
): ExerciseSearchIndexRepository {
  return Object.freeze({
    verifyParity: () => kernel.write(verifyParityInTransaction),
    rebuildSearchIndex: () => kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO exercise_search_terms_fts(
          exercise_search_terms_fts
        )
        VALUES ('rebuild')`,
      );
      const parity = await verifyParityInTransaction(transaction);
      if (!parity.exact) {
        throw new Error("exercise_search_fts_rebuild_incomplete");
      }
      return parity;
    }),
  });
}

export async function openExerciseSearchFtsContractRuntime(
  databaseName: string,
  observer: SqliteKernelTestObserver = {},
): Promise<ExerciseSearchFtsContractRuntime> {
  const {
    deleteDatabaseAsync,
    openDatabaseAsync,
  } = require("expo-sqlite") as typeof import("expo-sqlite");
  await deleteDatabaseAsync(databaseName).catch(() => undefined);
  const openOptions = {
    useNewConnection: true,
    finalizeUnusedStatementsBeforeClosing: false,
  } as const;
  const writer = new ExerciseSearchFtsExpoConnection(await openDatabaseAsync(
    databaseName,
    openOptions,
  ));
  let reader: ExerciseSearchFtsExpoConnection | undefined;
  try {
    await configureSqliteConnection(writer, { enableWal: true });
    reader = new ExerciseSearchFtsExpoConnection(await openDatabaseAsync(
      databaseName,
      openOptions,
    ));
    await configureSqliteConnection(reader, { enableWal: false });
  } catch (error) {
    await reader?.closeAsync().catch(() => undefined);
    await writer.closeAsync().catch(() => undefined);
    await deleteDatabaseAsync(databaseName).catch(() => undefined);
    throw error;
  }
  const kernel = createSqliteKernel({
    reader: reader as ExerciseSearchFtsExpoConnection,
    writer,
  }, observer);
  return {
    kernel,
    isWriterInTransaction: () => writer.isInTransactionAsync(),
    async close() {
      await kernel.close();
      await deleteDatabaseAsync(databaseName).catch(() => undefined);
    },
  };
}
