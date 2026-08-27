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
  normalizeSearchText,
  SEARCH_NORMALIZATION_VERSION,
  SEARCH_PAGE_SIZE,
  type SearchFilters,
} from "../../src/domains/library/search";
import {
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
  configureSqliteConnection,
} from "../../src/platform/sqlite/connection";
import {
  createExerciseSearchIndexRepository,
} from "../../src/platform/sqlite/repositories/exerciseSearchIndexRepository";
import {
  createLibrarySearchRepository,
  LibrarySearchRepositoryError,
} from "../../src/platform/sqlite/repositories/librarySearchRepository";
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

type ExerciseSeed = Readonly<{
  id: string;
  name: string;
  aliases?: readonly string[];
  origin?: "bundled" | "copied" | "custom";
  exerciseType?: "cardio" | "strength" | "stretching";
  muscles?: readonly string[];
  equipment?: readonly string[];
  availability?: "available" | "unavailable";
  favorite?: boolean;
  hidden?: boolean;
  archived?: boolean;
}>;

const repositoryRoot = join(__dirname, "../..");
const temporaryDirectories = new Set<string>();
const kernels: SqliteKernel[] = [];
let nextTermId = 10_000;

afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
  nextTermId = 10_000;
});

async function createRuntime(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-library-search-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixtureDatabase = new DatabaseSync(databasePath);
  fixtureDatabase.exec(readFileSync(
    join(repositoryRoot, "tests/migrations/fixtures/v1-phase1.sql"),
    "utf8",
  ));
  fixtureDatabase.exec(readFileSync(
    join(repositoryRoot, "tests/migrations/fixtures/v4-content-library.sql"),
    "utf8",
  ));
  fixtureDatabase.exec(readFileSync(
    join(repositoryRoot, "tests/migrations/fixtures/v5-search-fts.sql"),
    "utf8",
  ));
  fixtureDatabase.close();

  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  kernels.push(kernel);
  return kernel;
}

async function insertExerciseInTransaction(
  transaction: SqliteTransactionExecutor,
  seed: ExerciseSeed,
): Promise<void> {
  const origin = seed.origin ?? "custom";
  const exerciseType = seed.exerciseType ?? "strength";
  const availability = seed.availability ?? "available";
  const sourceNamespace = origin === "custom" ? null : "search.test";
  const upstreamId = origin === "custom" ? null : seed.id;
  await transaction.execute(
    `INSERT INTO exercises
      (id, content_pack_id, origin, source_namespace, upstream_id, name,
       metric_profile, equipment, default_rest_seconds, revision)
     VALUES (?, NULL, ?, ?, ?, ?, 'load_reps', ?, 90, 1)`,
    [
      seed.id,
      origin,
      sourceNamespace,
      upstreamId,
      seed.name,
      seed.equipment?.join(", ") ?? "Unspecified",
    ],
  );
  await transaction.execute(
    `INSERT INTO exercise_library_entries
      (exercise_id, origin, canonical_name, exercise_type, movement_class,
       metric_profile, metric_contract_version, exercise_metric_generation,
       availability, revision)
     VALUES (?, ?, ?, ?, 'compound', 'load_reps', 1, 1, ?, 1)`,
    [seed.id, origin, seed.name, exerciseType, availability],
  );
  if (origin === "bundled") {
    await transaction.execute(
      `INSERT OR IGNORE INTO content_pack_revisions
        (id, namespace, revision, source_commit, pack_sha256, manifest_sha256,
         license_sha256, review_status, accepted_at_ms)
       VALUES (
         'search-test-pack:1', 'search.test', 1, 'search-test-commit',
         ?, ?, ?, 'accepted', 1
       )`,
      ["a".repeat(64), "b".repeat(64), "c".repeat(64)],
    );
    await transaction.execute(
      `INSERT INTO exercise_catalog_sources
        (exercise_id, content_revision_id, source_namespace, source_revision,
         upstream_id, canonical_name, exercise_type, movement_class,
         metric_profile, metric_contract_version,
         exercise_metric_generation, availability, license, attribution,
         legacy_link_status, linked_upstream_id, revision)
       VALUES (
         ?, 'search-test-pack:1', 'search.test', 'revision-1', ?, ?, ?,
         'compound', 'load_reps', 1, 1, ?, 'MIT',
         'Search test attribution', 'not_applicable', NULL, 1
       )`,
      [seed.id, seed.id, seed.name, exerciseType, availability],
    );
  }
  const canonicalId = nextTermId;
  nextTermId += 1;
  await transaction.execute(
    `INSERT INTO exercise_search_terms
      (id, exercise_id, kind, ordinal, display_text, normalized_text)
     VALUES (?, ?, 'canonical', 0, ?, ?)`,
    [
      canonicalId,
      seed.id,
      seed.name,
      normalizeSearchText(seed.name).text,
    ],
  );
  for (const [ordinal, alias] of (seed.aliases ?? []).entries()) {
    const aliasId = nextTermId;
    nextTermId += 1;
    await transaction.execute(
      `INSERT INTO exercise_aliases
        (id, exercise_id, ordinal, display_text, normalized_text)
       VALUES (?, ?, ?, ?, ?)`,
      [aliasId, seed.id, ordinal, alias, normalizeSearchText(alias).text],
    );
    await transaction.execute(
      `INSERT INTO exercise_search_terms
        (id, exercise_id, kind, ordinal, display_text, normalized_text)
       VALUES (?, ?, 'alias', ?, ?, ?)`,
      [aliasId, seed.id, ordinal, alias, normalizeSearchText(alias).text],
    );
  }
  for (const [kind, values] of [
    ["muscle", seed.muscles ?? []],
    ["equipment", seed.equipment ?? []],
  ] as const) {
    for (const [ordinal, slug] of values.entries()) {
      await transaction.execute(
        `INSERT OR IGNORE INTO taxonomy_terms(kind, slug, display_name)
         VALUES (?, ?, ?)`,
        [kind, slug, slug],
      );
      await transaction.execute(
        `INSERT INTO exercise_taxonomy
          (exercise_id, kind, slug, relation, ordinal)
         VALUES (?, ?, ?, ?, ?)`,
        [
          seed.id,
          kind,
          slug,
          kind === "muscle" ? "primary" : "equipment",
          ordinal,
        ],
      );
    }
  }
  if (seed.favorite || seed.hidden || seed.archived) {
    await transaction.execute(
      `INSERT INTO exercise_owner_preferences
        (exercise_id, favorite, hidden, archived, revision, updated_at_ms)
       VALUES (?, ?, ?, ?, 1, 1)`,
      [
        seed.id,
        seed.favorite ? 1 : 0,
        seed.hidden ? 1 : 0,
        seed.archived ? 1 : 0,
      ],
    );
  }
}

async function insertExercise(
  kernel: SqliteKernel,
  seed: ExerciseSeed,
): Promise<void> {
  await kernel.write((transaction) =>
    insertExerciseInTransaction(transaction, seed)
  );
}

async function insertExposure(
  kernel: SqliteKernel,
  input: Readonly<{
    exerciseId: string;
    ordinal: number;
    completedAtMs: number;
    sessionStatus?: "completed" | "manual_visit" | "partial";
    setStatus?: "completed" | "draft";
    setKind?: "warmup" | "working";
  }>,
): Promise<void> {
  const sessionId = `session-recent-${input.ordinal}`;
  const sessionExerciseId = `session-exercise-recent-${input.ordinal}`;
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO workout_sessions
        (id, plan_id, plan_day_id, source, status, local_date, timezone,
         started_at_ms, completed_at_ms, active_session_exercise_id,
         active_set_id, revision)
       VALUES (?, NULL, NULL, 'manual', ?, '2026-08-18', 'Asia/Singapore',
               ?, ?, NULL, NULL, 1)`,
      [
        sessionId,
        input.sessionStatus ?? "completed",
        input.completedAtMs - 100,
        input.completedAtMs,
      ],
    );
    await transaction.execute(
      `INSERT INTO session_exercises
        (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
         exercise_name, metric_profile, default_rest_seconds,
         target_revision, status, revision)
       SELECT ?, ?, NULL, exercise_id, 0, canonical_name, 'load_reps',
              90, 1, 'completed', 1
       FROM exercise_library_entries
       WHERE exercise_id = ?`,
      [sessionExerciseId, sessionId, input.exerciseId],
    );
    await transaction.execute(
      `INSERT INTO session_sets
        (id, session_exercise_id, set_kind, ordinal,
         source_plan_working_set_target_id, target_load_grams,
         target_min_reps, target_max_reps, target_json, unit_json,
         rule_type, rule_version, observed_load_grams, observed_reps,
         observed_json, status, draft_updated_at_ms, completed_at_ms,
         completion_idempotency_key, revision)
       VALUES (?, ?, ?, 0, NULL, 1000, 1, 1, '{}', '{}',
               'load_reps', 1, 1000, 1, '{}', ?, ?, ?, ?, 1)`,
      [
        `set-recent-${input.ordinal}`,
        sessionExerciseId,
        input.setKind ?? "working",
        input.setStatus ?? "completed",
        input.completedAtMs,
        input.completedAtMs,
        `recent-complete-${input.ordinal}`,
      ],
    );
  });
}

function requirePage<Result extends { state: string }>(
  result: Result,
): asserts result is Extract<Result, { state: "page" }> {
  expect(result.state).toBe("page");
}

const catalogContextRow = {
  entry_count: 1,
  entry_revision_sum: 1,
  term_count: 1,
  max_term_id: 1,
  preference_count: 0,
  preference_revision_sum: 0,
  taxonomy_count: 0,
  source_count: 0,
  source_revision_sum: 0,
} as const;

const rankedCandidateRow = {
  exercise_id: "scripted-exercise",
  canonical_sort_key: "scripted press",
  tier: 1,
} as const;

const hydratedExerciseRow = {
  request_ordinal: 0,
  exercise_id: "scripted-exercise",
  canonical_name: "Scripted Press",
  canonical_sort_key: "scripted press",
  tier: 1,
  exercise_type: "strength",
  origin: "custom",
  availability: "available",
  favorite: 0,
  hidden: 0,
  archived: 0,
  recent_at_ms: null,
  aliases_json: "[]",
  muscles_json: "[]",
  equipment_json: "[]",
  source_namespace: null,
  source_revision: null,
  license: null,
  attribution: null,
} as const;

function scriptedKernel(
  rows: readonly (readonly Record<string, unknown>[] | Error)[],
): SqliteKernel {
  let index = 0;
  return {
    async queryAll<Row extends Record<string, unknown>>() {
      const next = rows[index];
      index += 1;
      if (next instanceof Error) {
        throw next;
      }
      return (next ?? []) as readonly Row[];
    },
    async write() {
      throw new Error("unexpected scripted write");
    },
    async connectionConfiguration() {
      throw new Error("unexpected scripted configuration");
    },
    async close() {},
  };
}

describe("LIB-03/LIB-04 authoritative exercise search repository", () => {
  it("returns an alias-caused tracer with canonical row and D-15 attribution", async () => {
    const kernel = await createRuntime();
    await insertExercise(kernel, {
      id: "exercise-horizontal-press",
      name: "Horizontal Barbell Press",
      aliases: ["Bench Press", "Barbell Bench"],
      origin: "bundled",
      muscles: ["chest"],
      equipment: ["barbell", "bench"],
      favorite: true,
    });
    const sourceBefore = await kernel.queryAll(
      "SELECT * FROM exercise_search_terms ORDER BY id",
    );

    const result = await createLibrarySearchRepository(kernel).searchExercises({
      query: "bench",
    });

    requirePage(result);
    expect(result.items).toEqual([
      expect.objectContaining({
        exerciseId: "exercise-horizontal-press",
        canonicalName: "Horizontal Barbell Press",
        canonicalSortKey: "horizontal barbell press",
        tier: 2,
        matchedAlias: {
          id: expect.any(Number),
          displayText: "Bench Press",
          label: "Matched alias: Bench Press",
        },
        origin: "bundled",
        originLabel: "Built-in",
        favorite: true,
        muscles: ["chest"],
        equipment: ["barbell", "bench"],
        source: {
          namespace: "search.test",
          revision: "revision-1",
          license: "MIT",
          attribution: "Search test attribution",
        },
      }),
    ]);
    expect(result.diagnostic).toMatchObject({
      code: "exercise_search_ok",
      strategy: "trigram",
      normalizationVersion: SEARCH_NORMALIZATION_VERSION,
      resultCount: 1,
    });
    expect(JSON.stringify(result.diagnostic)).not.toContain("bench");
    expect(await kernel.queryAll(
      "SELECT * FROM exercise_search_terms ORDER BY id",
    )).toEqual(sourceBefore);
  });

  it("orders exact, canonical prefix, alias, and partial without Favorite or Recent boosts", async () => {
    const kernel = await createRuntime();
    await insertExercise(kernel, {
      id: "rank-exact",
      name: "Press",
    });
    await insertExercise(kernel, {
      id: "rank-prefix",
      name: "Press Machine",
    });
    await insertExercise(kernel, {
      id: "rank-alias",
      name: "Horizontal Push",
      aliases: ["Press Variation"],
      favorite: true,
    });
    await insertExercise(kernel, {
      id: "rank-partial-a",
      name: "Bench Press",
    });
    await insertExercise(kernel, {
      id: "rank-partial-b",
      name: "Bench Press",
      favorite: true,
    });
    await insertExposure(kernel, {
      exerciseId: "rank-partial-b",
      ordinal: 1,
      completedAtMs: 9_000,
    });

    const result = await createLibrarySearchRepository(kernel).searchExercises({
      query: "press",
    });

    requirePage(result);
    expect(result.items.map(({ exerciseId, tier }) => [exerciseId, tier]))
      .toEqual([
        ["rank-exact", 0],
        ["rank-prefix", 1],
        ["rank-alias", 2],
        ["rank-partial-a", 3],
        ["rank-partial-b", 3],
      ]);
  });

  it("applies D-10 defaults and OR-within/AND-across D-14 filters", async () => {
    const kernel = await createRuntime();
    const seeds: readonly ExerciseSeed[] = [
      {
        id: "filter-barbell",
        name: "Filter Barbell Press",
        muscles: ["chest"],
        equipment: ["barbell"],
        favorite: true,
      },
      {
        id: "filter-cable",
        name: "Filter Cable Press",
        muscles: ["chest"],
        equipment: ["cable"],
      },
      {
        id: "filter-back",
        name: "Filter Back Press",
        muscles: ["back"],
        equipment: ["barbell"],
        favorite: true,
      },
      {
        id: "filter-hidden",
        name: "Filter Hidden Press",
        muscles: ["chest"],
        equipment: ["barbell"],
        hidden: true,
      },
      {
        id: "filter-archived",
        name: "Filter Archived Press",
        muscles: ["chest"],
        equipment: ["barbell"],
        archived: true,
      },
      {
        id: "filter-unavailable",
        name: "Filter Unavailable Press",
        muscles: ["chest"],
        equipment: ["barbell"],
        availability: "unavailable",
      },
    ];
    for (const seed of seeds) {
      await insertExercise(kernel, seed);
    }
    const repository = createLibrarySearchRepository(kernel);

    const defaultResult = await repository.searchExercises({ query: "filter" });
    requirePage(defaultResult);
    expect(defaultResult.items.map(({ exerciseId }) => exerciseId)).toEqual([
      "filter-back",
      "filter-barbell",
      "filter-cable",
    ]);

    const filtered = await repository.searchExercises({
      query: "filter",
      filters: {
        muscles: ["chest", "shoulders"],
        equipment: ["barbell", "cable"],
        favorite: [true],
      },
    });
    requirePage(filtered);
    expect(filtered.items.map(({ exerciseId }) => exerciseId)).toEqual([
      "filter-barbell",
    ]);

    const visibility = await repository.searchExercises({
      query: "filter",
      filters: {
        visibility: ["archived", "hidden", "unavailable"],
      },
    });
    requirePage(visibility);
    expect(visibility.items.map(({ exerciseId }) => exerciseId)).toEqual([
      "filter-archived",
      "filter-hidden",
      "filter-unavailable",
    ]);
  });

  it.each([
    { query: "a", strategy: "relational" },
    { query: "ab", strategy: "relational" },
    { query: "abc", strategy: "trigram" },
    {
      query: "Café / PRESS - and (hold): \"OR\"",
      strategy: "trigram",
    },
  ] as const)("uses the bounded $strategy path for $query", async ({
    query,
    strategy,
  }) => {
    const kernel = await createRuntime();
    await insertExercise(kernel, {
      id: `query-${strategy}`,
      name: "ABC Café Press and Hold OR",
    });

    const result = await createLibrarySearchRepository(kernel).searchExercises({
      query,
    });

    requirePage(result);
    expect(result.items.map(({ exerciseId }) => exerciseId)).toContain(
      `query-${strategy}`,
    );
    expect(result.diagnostic.strategy).toBe(strategy);
    expect(result.diagnostic).not.toHaveProperty("query");
    expect(result.diagnostic).not.toHaveProperty("rawQuery");
  });

  it.each([29, 30, 31])(
    "returns stable nonduplicated thirty-row keyset pages for %i rows",
    async (count) => {
      const kernel = await createRuntime();
      for (let ordinal = 0; ordinal < count; ordinal += 1) {
        await insertExercise(kernel, {
          id: `page-${String(ordinal).padStart(2, "0")}`,
          name: `Page Marker ${String(ordinal).padStart(2, "0")}`,
        });
      }
      const repository = createLibrarySearchRepository(kernel);
      const first = await repository.searchExercises({ query: "page" });
      requirePage(first);

      expect(first.items).toHaveLength(Math.min(count, SEARCH_PAGE_SIZE));
      expect(new Set(first.items.map(({ exerciseId }) => exerciseId)).size)
        .toBe(first.items.length);
      expect(first.nextCursor === null).toBe(count <= SEARCH_PAGE_SIZE);
      if (first.nextCursor === null) {
        return;
      }

      const second = await repository.searchExercises({
        query: "page",
        cursor: first.nextCursor,
      });
      requirePage(second);
      expect(second.items).toHaveLength(1);
      expect(new Set([
        ...first.items.map(({ exerciseId }) => exerciseId),
        ...second.items.map(({ exerciseId }) => exerciseId),
      ]).size).toBe(count);
      expect(second.nextCursor).toBeNull();
    },
  );

  it("returns typed restart when cursor query, filters, or catalog revision drift", async () => {
    const kernel = await createRuntime();
    for (let ordinal = 0; ordinal < 31; ordinal += 1) {
      await insertExercise(kernel, {
        id: `cursor-${String(ordinal).padStart(2, "0")}`,
        name: `Cursor Press ${String(ordinal).padStart(2, "0")}`,
      });
    }
    const repository = createLibrarySearchRepository(kernel);
    const first = await repository.searchExercises({ query: "cursor" });
    requirePage(first);
    expect(first.nextCursor).not.toBeNull();

    await expect(repository.searchExercises({
      query: "press",
      cursor: first.nextCursor,
    })).resolves.toEqual({
      state: "restart",
      reason: "query_changed",
    });
    await expect(repository.searchExercises({
      query: "cursor",
      filters: { favorite: [true] },
      cursor: first.nextCursor,
    })).resolves.toEqual({
      state: "restart",
      reason: "filters_changed",
    });

    await insertExercise(kernel, {
      id: "cursor-new-row",
      name: "Cursor Press New",
    });
    await expect(repository.searchExercises({
      query: "cursor",
      cursor: first.nextCursor,
    })).resolves.toEqual({
      state: "restart",
      reason: "catalog_changed",
    });
  });

  it("lists only the ten latest unique completed working-set exposures", async () => {
    const kernel = await createRuntime();
    for (let ordinal = 0; ordinal < 12; ordinal += 1) {
      await insertExercise(kernel, {
        id: `recent-${String(ordinal).padStart(2, "0")}`,
        name: `Recent Exercise ${String(ordinal).padStart(2, "0")}`,
      });
      await insertExposure(kernel, {
        exerciseId: `recent-${String(ordinal).padStart(2, "0")}`,
        ordinal,
        completedAtMs: 1_000 + ordinal,
      });
    }
    await insertExposure(kernel, {
      exerciseId: "recent-11",
      ordinal: 20,
      completedAtMs: 5_000,
      sessionStatus: "partial",
    });
    await insertExposure(kernel, {
      exerciseId: "recent-00",
      ordinal: 21,
      completedAtMs: 9_000,
      sessionStatus: "manual_visit",
    });
    await insertExposure(kernel, {
      exerciseId: "recent-01",
      ordinal: 22,
      completedAtMs: 9_001,
      setKind: "warmup",
    });
    await insertExposure(kernel, {
      exerciseId: "recent-02",
      ordinal: 23,
      completedAtMs: 9_002,
      setStatus: "draft",
    });

    const repository = createLibrarySearchRepository(kernel);
    const recent = await repository.listRecentExercises();

    expect(recent).toHaveLength(10);
    expect(recent.map(({ exerciseId }) => exerciseId)).toEqual([
      "exercise-plank",
      "recent-11",
      "recent-10",
      "recent-09",
      "recent-08",
      "recent-07",
      "recent-06",
      "recent-05",
      "recent-04",
      "recent-03",
    ]);
    const filtered = await repository.searchExercises({
      query: "recent",
      filters: { recent: [true] },
    });
    requirePage(filtered);
    expect(filtered.items.map(({ exerciseId }) => exerciseId)).toEqual([
      "recent-03",
      "recent-04",
      "recent-05",
      "recent-06",
      "recent-07",
      "recent-08",
      "recent-09",
      "recent-10",
      "recent-11",
    ]);
  });

  it("restores FTS parity without changing authoritative relational results", async () => {
    const kernel = await createRuntime();
    await insertExercise(kernel, {
      id: "repair-cable",
      name: "Repair Cable Crossover",
    });
    const [term] = await kernel.queryAll<{
      id: number;
      normalized_text: string;
    }>(
      `SELECT id, normalized_text
       FROM exercise_search_terms
       WHERE exercise_id = ? AND kind = 'canonical'`,
      ["repair-cable"],
    );
    const sourceBefore = await kernel.queryAll(
      "SELECT * FROM exercise_search_terms ORDER BY id",
    );
    const repository = createLibrarySearchRepository(kernel);
    const before = await repository.searchExercises({ query: "crossover" });
    requirePage(before);
    expect(before.items.map(({ exerciseId }) => exerciseId)).toEqual([
      "repair-cable",
    ]);

    await kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO exercise_search_terms_fts(
          exercise_search_terms_fts, rowid, normalized_text
        ) VALUES ('delete', ?, ?)`,
        [term!.id, term!.normalized_text],
      )
    );
    const drifted = await repository.searchExercises({ query: "crossover" });
    requirePage(drifted);
    expect(drifted.items).toEqual([]);

    await expect(
      createExerciseSearchIndexRepository(kernel).rebuildSearchIndex(),
    ).resolves.toMatchObject({ exact: true });
    const repaired = await repository.searchExercises({ query: "crossover" });
    requirePage(repaired);
    expect(repaired.items).toEqual(before.items);
    expect(await kernel.queryAll(
      "SELECT * FROM exercise_search_terms ORDER BY id",
    )).toEqual(sourceBefore);
  });

  it("rolls failed source writes back and fails page hydration with a safe code", async () => {
    const kernel = await createRuntime();
    await insertExercise(kernel, {
      id: "safe-prior",
      name: "Safe Prior Press",
    });
    const repository = createLibrarySearchRepository(kernel);
    const prior = await repository.searchExercises({ query: "safe" });
    requirePage(prior);
    const priorBytes = JSON.stringify(prior);

    await expect(kernel.write(async (transaction) => {
      await insertExerciseInTransaction(transaction, {
        id: "must-rollback",
        name: "Sensitive Rollback Query",
      });
      throw new Error("injected-search-source-failure");
    })).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
    const absent = await repository.searchExercises({ query: "rollback" });
    requirePage(absent);
    expect(absent.items).toEqual([]);

    let readCount = 0;
    const failingKernel: SqliteKernel = {
      ...kernel,
      async queryAll<Row extends Record<string, unknown>>(
        sql: string,
        parameters: readonly (null | number | string | Uint8Array)[] = [],
      ): Promise<readonly Row[]> {
        readCount += 1;
        if (readCount === 3) {
          throw new Error("Sensitive Rollback Query");
        }
        return kernel.queryAll<Row>(sql, parameters);
      },
    };
    await expect(
      createLibrarySearchRepository(failingKernel).searchExercises({
        query: "safe",
      }),
    ).rejects.toEqual(
      new LibrarySearchRepositoryError("exercise_search_hydration_failed"),
    );
    expect(JSON.stringify(prior)).toBe(priorBytes);
  });

  it("treats every non-empty filter group as an intersection", async () => {
    const kernel = await createRuntime();
    await insertExercise(kernel, {
      id: "all-groups",
      name: "All Groups Press",
      origin: "custom",
      exerciseType: "strength",
      muscles: ["chest"],
      equipment: ["barbell"],
      favorite: true,
    });
    await insertExposure(kernel, {
      exerciseId: "all-groups",
      ordinal: 30,
      completedAtMs: 10_000,
      sessionStatus: "partial",
    });
    const filters: SearchFilters = {
      exerciseTypes: ["strength"],
      muscles: ["chest"],
      equipment: ["barbell"],
      origins: ["custom"],
      visibility: ["available"],
      recent: [true],
      favorite: [true],
    };

    const result = await createLibrarySearchRepository(kernel).searchExercises({
      query: "groups",
      filters,
    });

    requirePage(result);
    expect(result.items.map(({ exerciseId }) => exerciseId)).toEqual([
      "all-groups",
    ]);
  });

  it.each([
    {
      label: "context read failure",
      kernel: scriptedKernel([new Error("sensitive context")]),
      error: "exercise_search_context_failed",
    },
    {
      label: "missing context row",
      kernel: scriptedKernel([[]]),
      error: "exercise_search_context_failed",
    },
    {
      label: "candidate read failure",
      kernel: scriptedKernel([
        [catalogContextRow],
        new Error("sensitive candidate"),
      ]),
      error: "exercise_search_candidate_failed",
    },
  ])("maps $label to a bounded code", async ({ kernel, error }) => {
    await expect(createLibrarySearchRepository(kernel).searchExercises({
      query: "scripted",
    })).rejects.toEqual(new LibrarySearchRepositoryError(
      error as ConstructorParameters<typeof LibrarySearchRepositoryError>[0],
    ));
  });

  it.each([
    {
      label: "non-array taxonomy",
      row: { ...hydratedExerciseRow, muscles_json: "{}" },
    },
    {
      label: "non-string taxonomy entry",
      row: { ...hydratedExerciseRow, equipment_json: "[1]" },
    },
    {
      label: "non-array aliases",
      row: { ...hydratedExerciseRow, aliases_json: "{}" },
    },
    {
      label: "invalid alias entry",
      row: { ...hydratedExerciseRow, aliases_json: "[{}]" },
    },
    {
      label: "rank drift",
      row: { ...hydratedExerciseRow, tier: 3 },
    },
    {
      label: "partial source attribution",
      row: {
        ...hydratedExerciseRow,
        source_namespace: "search.test",
      },
    },
  ])("rejects $label during hydration", async ({ row }) => {
    const kernel = scriptedKernel([
      [catalogContextRow],
      [rankedCandidateRow],
      [row],
    ]);

    await expect(createLibrarySearchRepository(kernel).searchExercises({
      query: "scripted",
    })).rejects.toEqual(
      new LibrarySearchRepositoryError("exercise_search_hydration_failed"),
    );
  });

  it("accepts SQLite JSON string aliases during hydration", async () => {
    const kernel = scriptedKernel([
      [catalogContextRow],
      [{ ...rankedCandidateRow, tier: 2 }],
      [{
        ...hydratedExerciseRow,
        tier: 2,
        canonical_name: "Horizontal Push",
        canonical_sort_key: "horizontal push",
        aliases_json: JSON.stringify([
          JSON.stringify({
            id: 1,
            displayText: "Scripted Press",
            normalizedText: "scripted press",
          }),
        ]),
      }],
    ]);

    const result = await createLibrarySearchRepository(kernel).searchExercises({
      query: "scripted",
    });

    requirePage(result);
    expect(result.items[0]?.matchedAlias?.label).toBe(
      "Matched alias: Scripted Press",
    );
  });

  it("rejects missing or reordered hydration rows", async () => {
    const kernel = scriptedKernel([
      [catalogContextRow],
      [rankedCandidateRow],
      [],
    ]);

    await expect(createLibrarySearchRepository(kernel).searchExercises({
      query: "scripted",
    })).rejects.toEqual(
      new LibrarySearchRepositoryError("exercise_search_hydration_failed"),
    );
  });

  it("maps Recent read failure to a bounded code", async () => {
    await expect(createLibrarySearchRepository(
      scriptedKernel([new Error("sensitive recent")]),
    ).listRecentExercises()).rejects.toEqual(
      new LibrarySearchRepositoryError("exercise_search_recent_failed"),
    );
  });
});
