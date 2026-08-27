import {
  afterEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import {
  DatabaseSync,
  type SQLInputValue,
} from "node:sqlite";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
  configureSqliteConnection,
} from "../../src/platform/sqlite/connection";
import {
  createMigrationRunner,
} from "../../src/platform/sqlite/migrationRunner";
import {
  exerciseSearchFtsMigration,
} from "../../src/platform/sqlite/migrations/0005_exercise_search_fts";
import {
  createSqliteKernel,
  type SqliteKernel,
  type SqliteTransactionExecutor,
} from "../../src/platform/sqlite/sqliteKernel";

class NodePreparedResult<Row extends Record<string, unknown>>
implements SqlitePreparedResult<Row> {
  constructor(
    readonly changes: number,
    readonly lastInsertRowId: number,
    private readonly rows: readonly Row[],
  ) {}

  async getAllAsync(): Promise<readonly Row[]> {
    return this.rows;
  }
}

class NodePreparedStatement implements SqlitePreparedStatement {
  constructor(
    private readonly statement: ReturnType<DatabaseSync["prepare"]>,
  ) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly SQLInputValue[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new NodePreparedResult(
        0,
        0,
        this.statement.all(...parameters) as Row[],
      );
    }
    const result = this.statement.run(...parameters);
    return new NodePreparedResult(
      Number(result.changes),
      Number(result.lastInsertRowid),
      [],
    );
  }

  async finalizeAsync(): Promise<void> {}
}

class NodeSqliteConnection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new NodePreparedStatement(this.database.prepare(sql));
  }

  async isInTransactionAsync(): Promise<boolean> {
    return this.database.isTransaction;
  }

  async closeAsync(): Promise<void> {
    this.database.close();
  }
}

const repositoryRoot = join(__dirname, "../..");
const temporaryDirectories = new Set<string>();
const runtimes: SqliteKernel[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

async function createRuntime(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-exercise-search-fts-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixtureDatabase = new DatabaseSync(databasePath);
  fixtureDatabase.exec(readFileSync(
    join(
      repositoryRoot,
      "tests/migrations/fixtures/v1-phase1.sql",
    ),
    "utf8",
  ));
  fixtureDatabase.exec(readFileSync(
    join(
      repositoryRoot,
      "tests/migrations/fixtures/v4-content-library.sql",
    ),
    "utf8",
  ));
  fixtureDatabase.close();

  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  runtimes.push(kernel);
  return kernel;
}

async function migrateToV5(kernel: SqliteKernel): Promise<void> {
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations: [exerciseSearchFtsMigration],
  }).run();
}

async function insertExercise(
  kernel: SqliteKernel,
  exerciseId: string,
  normalizedText: string,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO exercise_library_entries
        (exercise_id, origin, canonical_name, exercise_type, movement_class,
         metric_profile, metric_contract_version,
         exercise_metric_generation, availability, revision)
       VALUES (?, 'custom', ?, 'strength', 'compound', 'load_reps',
               1, 1, 'available', 1)`,
      [exerciseId, normalizedText],
    );
    await transaction.execute(
      `INSERT INTO exercise_search_terms
        (exercise_id, kind, ordinal, display_text, normalized_text)
       VALUES (?, 'canonical', 0, ?, ?)`,
      [exerciseId, normalizedText, normalizedText],
    );
  });
}

async function matchIds(
  kernel: SqliteKernel,
  query: string,
  limit = 30,
): Promise<readonly number[]> {
  const rows = await kernel.queryAll<{ rowid: number }>(
    `SELECT rowid
     FROM exercise_search_terms_fts
     WHERE normalized_text MATCH ?
     ORDER BY rowid
     LIMIT ?`,
    [`"${query.replaceAll('"', '""')}"`, limit],
  );
  return rows.map(({ rowid }) => rowid);
}

describe("exercise search FTS migration", () => {
  it.each([
    {
      label: "disabled FTS5",
      rows: [
        [{ fts5_enabled: 0 }],
      ],
      error: "exercise_search_fts5_unavailable",
    },
    {
      label: "missing schema object",
      rows: [
        [{ fts5_enabled: 1 }],
        [{ name: "exercise_search_terms_fts", type: "table" }],
      ],
      error: "exercise_search_fts_schema_incomplete",
    },
    {
      label: "row count mismatch",
      rows: [
        [{ fts5_enabled: 1 }],
        [
          { name: "exercise_search_terms_fts", type: "table" },
          { name: "exercise_search_terms_fts_ad", type: "trigger" },
          { name: "exercise_search_terms_fts_ai", type: "trigger" },
          { name: "exercise_search_terms_fts_au", type: "trigger" },
        ],
        [{ count: 2 }],
        [{ count: 1 }],
      ],
      error: "exercise_search_fts_row_count_mismatch",
    },
    {
      label: "stable ID length mismatch",
      rows: [
        [{ fts5_enabled: 1 }],
        [
          { name: "exercise_search_terms_fts", type: "table" },
          { name: "exercise_search_terms_fts_ad", type: "trigger" },
          { name: "exercise_search_terms_fts_ai", type: "trigger" },
          { name: "exercise_search_terms_fts_au", type: "trigger" },
        ],
        [{ count: 1 }],
        [{ count: 1 }],
        [{ id: 1 }],
        [],
      ],
      error: "exercise_search_fts_stable_id_mismatch",
    },
    {
      label: "stable ID value mismatch",
      rows: [
        [{ fts5_enabled: 1 }],
        [
          { name: "exercise_search_terms_fts", type: "table" },
          { name: "exercise_search_terms_fts_ad", type: "trigger" },
          { name: "exercise_search_terms_fts_ai", type: "trigger" },
          { name: "exercise_search_terms_fts_au", type: "trigger" },
        ],
        [{ count: 1 }],
        [{ count: 1 }],
        [{ id: 1 }],
        [{ id: 2 }],
      ],
      error: "exercise_search_fts_stable_id_mismatch",
    },
  ])("fails verification for $label", async ({ rows, error }) => {
    let queryIndex = 0;
    const transaction: SqliteTransactionExecutor = {
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      async queryAll<Row extends Record<string, unknown>>() {
        const result = rows[queryIndex] ?? [];
        queryIndex += 1;
        return result as unknown as Row[];
      },
    };

    await expect(exerciseSearchFtsMigration.verify(transaction)).rejects
      .toThrow(error);
  });

  it("migrates the retained v4 fixture without changing source facts", async () => {
    const kernel = await createRuntime();
    const sourceBefore = await kernel.queryAll(
      "SELECT * FROM exercise_search_terms ORDER BY id",
    );

    await migrateToV5(kernel);

    expect(await kernel.queryAll("PRAGMA user_version")).toEqual([
      { user_version: 5 },
    ]);
    expect(await kernel.queryAll(
      "SELECT * FROM exercise_search_terms ORDER BY id",
    )).toEqual(sourceBefore);
    expect(await kernel.queryAll(
      `SELECT name, type
       FROM sqlite_master
       WHERE name IN (
         'exercise_search_terms_fts',
         'exercise_search_terms_fts_ad',
         'exercise_search_terms_fts_ai',
         'exercise_search_terms_fts_au'
       )
       ORDER BY name`,
    )).toEqual([
      { name: "exercise_search_terms_fts", type: "table" },
      { name: "exercise_search_terms_fts_ad", type: "trigger" },
      { name: "exercise_search_terms_fts_ai", type: "trigger" },
      { name: "exercise_search_terms_fts_au", type: "trigger" },
    ]);
  });

  it("indexes, updates, deletes, and rolls source terms back atomically", async () => {
    const kernel = await createRuntime();
    await migrateToV5(kernel);
    await insertExercise(kernel, "exercise-alpha", "cable crossover");
    const [source] = await kernel.queryAll<{ id: number }>(
      `SELECT id
       FROM exercise_search_terms
       WHERE exercise_id = ?`,
      ["exercise-alpha"],
    );

    expect(await matchIds(kernel, "cross")).toEqual([source!.id]);

    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE exercise_search_terms
         SET display_text = ?, normalized_text = ?
         WHERE id = ?`,
        ["cable fly", "cable fly", source!.id],
      );
    });
    expect(await matchIds(kernel, "cross")).toEqual([]);
    expect(await matchIds(kernel, "fly")).toEqual([source!.id]);

    await expect(kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE exercise_search_terms
         SET display_text = ?, normalized_text = ?
         WHERE id = ?`,
        ["must rollback", "must rollback", source!.id],
      );
      throw new Error("injected_source_transaction_failure");
    })).rejects.toMatchObject({
      code: "sqlite_transaction_failed",
    });
    expect(await kernel.queryAll(
      `SELECT normalized_text
       FROM exercise_search_terms
       WHERE id = ?`,
      [source!.id],
    )).toEqual([{ normalized_text: "cable fly" }]);
    expect(await matchIds(kernel, "fly")).toEqual([source!.id]);
    expect(await matchIds(kernel, "rollback")).toEqual([]);

    await kernel.write(async (transaction) => {
      await transaction.execute(
        "DELETE FROM exercise_search_terms WHERE id = ?",
        [source!.id],
      );
    });
    expect(await matchIds(kernel, "fly")).toEqual([]);
  });

  it("covers E-20 through E-27 bounds and derivative repair cases", async () => {
    const kernel = await createRuntime();
    await migrateToV5(kernel);

    expect(await matchIds(kernel, "any")).toEqual([]);

    const cases = [
      ["exercise-short-one", "a"],
      ["exercise-short-two", "ab"],
      ["exercise-trigram", "abc"],
      ["exercise-punctuation", "press and hold quote safe"],
      ["exercise-diacritic", "cafe raise"],
      ["exercise-max", "x".repeat(120)],
    ] as const;
    for (const [exerciseId, text] of cases) {
      await insertExercise(kernel, exerciseId, text);
    }

    expect(await kernel.queryAll<{ id: number }>(
      `SELECT id
       FROM exercise_search_terms
       WHERE normalized_text LIKE '%' || ? || '%' ESCAPE '\\'
       ORDER BY id
       LIMIT ?`,
      ["a", 30],
    )).not.toEqual([]);
    expect(await kernel.queryAll<{ id: number }>(
      `SELECT id
       FROM exercise_search_terms
       WHERE normalized_text LIKE '%' || ? || '%' ESCAPE '\\'
       ORDER BY id
       LIMIT ?`,
      ["ab", 30],
    )).not.toEqual([]);
    expect(await matchIds(kernel, "abc")).toHaveLength(1);
    expect(await matchIds(kernel, "and")).toHaveLength(1);
    expect(await matchIds(kernel, "quo")).toHaveLength(1);
    expect(await matchIds(kernel, "cafe")).toHaveLength(1);
    expect(await matchIds(kernel, "x".repeat(120))).toHaveLength(1);

    for (let ordinal = 0; ordinal < 31; ordinal += 1) {
      await insertExercise(
        kernel,
        `exercise-page-${String(ordinal).padStart(2, "0")}`,
        `page marker ${String(ordinal).padStart(2, "0")}`,
      );
    }
    expect(await matchIds(kernel, "page", 29)).toHaveLength(29);
    expect(await matchIds(kernel, "page", 30)).toHaveLength(30);
    const pageIds = await matchIds(kernel, "page", 31);
    expect(pageIds).toHaveLength(31);
    expect(pageIds).toEqual([...pageIds].sort((left, right) => left - right));

    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO exercise_search_terms_fts(
          exercise_search_terms_fts
        ) VALUES ('rebuild')`,
      );
      await transaction.execute(
        `INSERT INTO exercise_search_terms_fts(
          exercise_search_terms_fts,
          rank
        ) VALUES ('integrity-check', 1)`,
      );
      await transaction.execute(
        `INSERT INTO exercise_search_terms_fts(
          exercise_search_terms_fts
        ) VALUES ('rebuild')`,
      );
      await transaction.execute(
        `INSERT INTO exercise_search_terms_fts(
          exercise_search_terms_fts,
          rank
        ) VALUES ('integrity-check', 1)`,
      );
    });
    expect(await matchIds(kernel, "page", 31)).toEqual(pageIds);
  });
});
