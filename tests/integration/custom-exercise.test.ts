import {
  afterEach,
  describe,
  expect,
  it,
  jest,
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
  archiveCustomExercise,
  createCustomExercise,
  createCustomCopy,
  editCustomExercise,
  previewCustomExerciseArchive,
  restoreCustomExercise,
  setExerciseFavorite,
  setExerciseHidden,
  type CreateCustomExerciseInput,
} from "../../src/domains/library/customExerciseCommands";
import {
  createCustomExerciseRuntimeReadPort,
} from "../../src/bootstrap/workoutAppRuntime";

jest.mock("../../src/platform/haptics/expoHapticsAdapter", () => ({
  createExpoHapticsAdapter: jest.fn(() => ({
    setCompleted: jest.fn(async () => undefined),
  })),
}));
jest.mock(
  "../../src/platform/notifications/expoRestNotificationAdapter",
  () => ({
    createExpoRestNotificationAdapter: jest.fn(() => ({
      ensureChannel: jest.fn(async () => undefined),
      permission: jest.fn(async () => "granted"),
      requestPermission: jest.fn(async () => "granted"),
      listScheduled: jest.fn(async () => []),
      cancel: jest.fn(async () => undefined),
      schedule: jest.fn(async () => "notification"),
      openSettings: jest.fn(async () => undefined),
    })),
  }),
);
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
  migrations,
} from "../../src/platform/sqlite/migrations";
import {
  createCustomExerciseRepository,
  CustomExerciseConflictError,
  type CustomExerciseRepository,
} from "../../src/platform/sqlite/repositories/customExerciseRepository";
import {
  createLibrarySearchRepository,
} from "../../src/platform/sqlite/repositories/librarySearchRepository";
import {
  createSqliteKernel,
  type SqliteKernel,
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
const kernels = new Set<SqliteKernel>();

afterEach(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

async function setupRuntime(
  options: Readonly<{ failCommit?: boolean }> = {},
): Promise<Readonly<{
  databasePath: string;
  kernel: SqliteKernel;
  repository: CustomExerciseRepository;
}>> {
  const directory = mkdtempSync(join(tmpdir(), "gym-custom-exercise-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixtureDatabase = new DatabaseSync(databasePath);
  fixtureDatabase.exec(readFileSync(
    join(repositoryRoot, "tests/migrations/fixtures/v6-metric-profiles.sql"),
    "utf8",
  ));
  fixtureDatabase.close();

  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  let rejectCommit = false;
  const kernel = createSqliteKernel(
    { reader, writer },
    {
      beforeCommit: async () => {
        if (rejectCommit) {
            throw new Error("injected_commit_failure");
        }
      },
    },
  );
  kernels.add(kernel);
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations,
  }).run();
  rejectCommit = options.failCommit ?? false;
  return {
    databasePath,
    kernel,
    repository: createCustomExerciseRepository(kernel),
  };
}

async function reopenRuntime(
  databasePath: string,
): Promise<Readonly<{
  kernel: SqliteKernel;
  repository: CustomExerciseRepository;
}>> {
  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  kernels.add(kernel);
  return {
    kernel,
    repository: createCustomExerciseRepository(kernel),
  };
}

function createInput(
  changes: Partial<CreateCustomExerciseInput> = {},
): CreateCustomExerciseInput {
  return {
    requestId: "request-custom-sled",
    exerciseId: "custom-sled",
    name: "雪橇推进",
    aliases: ["Sled Push"],
    exerciseType: "strongman",
    movementClass: "compound",
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes"],
    equipment: ["sled"],
    metricIdentity: {
      profile: "fixed_time",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    defaultRestSeconds: 75,
    createdAtMs: 1_787_000_000_000,
    ...changes,
  };
}

describe("LIB-05 custom exercise runtime reads", () => {
  it("loads source authority and complete current migration facts", async () => {
    const { kernel, repository } = await setupRuntime();
    const port = createCustomExerciseRuntimeReadPort({
      kernel,
      customExerciseRepository: repository,
    });
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO content_pack_revisions
          (id, namespace, revision, source_commit, pack_sha256,
           manifest_sha256, license_sha256, review_status, accepted_at_ms)
         VALUES ('runtime-source', 'kinetic-place.exercises-db', 1,
                 'revision-1', ?, ?, ?, 'accepted', 1)`,
        ["a".repeat(64), "b".repeat(64), "c".repeat(64)],
      );
      await transaction.execute(
        `INSERT INTO exercise_catalog_sources
          (exercise_id, content_revision_id, source_namespace,
           source_revision, upstream_id, canonical_name, exercise_type,
           movement_class, metric_profile, metric_contract_version,
           exercise_metric_generation, availability, license, attribution,
           legacy_link_status, linked_upstream_id, revision)
         VALUES ('exercise-squat', 'runtime-source',
                 'kinetic-place.exercises-db', 'revision-1', 'squat',
                 'Squat', 'strength', 'compound', 'load_reps', 1, 1,
                 'available', 'MIT', 'Runtime attribution',
                 'not_applicable', NULL, 1)`,
      );
    });

    await expect(port.loadExercise("missing-exercise")).resolves.toBeNull();
    await expect(port.loadExercise("exercise-squat")).resolves.toEqual(
      expect.objectContaining({
        exerciseId: "exercise-squat",
        origin: "bundled",
        originLabel: "Built-in",
        source: expect.objectContaining({
          license: expect.any(String),
          attribution: expect.any(String),
        }),
      }),
    );
    await expect(port.loadExercise("exercise-plank")).resolves.toEqual(
      expect.objectContaining({
        exerciseId: "exercise-plank",
        origin: "custom",
        originLabel: "Custom",
        metricIdentity: {
          profile: "timed_hold",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
      }),
    );
    await expect(kernel.queryAll("PRAGMA user_version")).resolves.toEqual([
      { user_version: migrations.at(-1)?.version },
    ]);

    const migration = await port.loadMigration("exercise-plank");
    expect(migration).toEqual(expect.objectContaining({
      exerciseId: "exercise-plank",
      exerciseName: "Plank",
      activeWorkoutSessionId: null,
      occurrences: [expect.objectContaining({
        graph: "legacy",
        planName: "Hold Practice",
        dayName: "Hold Day",
        occurrenceId: "plan-day-exercise-plank",
        policyRevision: 4,
        targets: [expect.objectContaining({
          targetId: "working-target-plank",
          targetRevision: 6,
          currentTarget: "45 sec",
        })],
      })],
    }));

    await kernel.write((transaction) => transaction.execute(
      `UPDATE session_exercises
       SET exercise_id = 'exercise-plank'
       WHERE id = 'session-exercise-squat'`,
    ));
    await expect(port.loadMigration("exercise-plank")).resolves.toEqual(
      expect.objectContaining({
        activeWorkoutSessionId: "session-active",
      }),
    );
    await expect(port.loadMigration("exercise-squat")).resolves.toBeNull();
  });
});

async function rowCounts(kernel: SqliteKernel) {
  const [row] = await kernel.queryAll<{
    exercise_count: number;
    library_count: number;
    preference_count: number;
    alias_count: number;
    taxonomy_count: number;
    term_count: number;
    fts_count: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM exercises) AS exercise_count,
       (SELECT COUNT(*) FROM exercise_library_entries) AS library_count,
       (SELECT COUNT(*) FROM exercise_owner_preferences) AS preference_count,
       (SELECT COUNT(*) FROM exercise_aliases) AS alias_count,
       (SELECT COUNT(*) FROM exercise_taxonomy) AS taxonomy_count,
       (SELECT COUNT(*) FROM exercise_search_terms) AS term_count,
       (SELECT COUNT(*) FROM exercise_search_terms_fts_docsize) AS fts_count`,
  );
  return row;
}

async function seedBundledSquatTaxonomy(
  kernel: SqliteKernel,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `UPDATE exercise_library_entries
       SET exercise_type = 'strength', movement_class = 'compound'
       WHERE exercise_id = 'exercise-squat'`,
    );
    for (const [kind, slug, relation, ordinal] of [
      ["muscle", "quadriceps", "primary", 0],
      ["muscle", "glutes", "primary", 1],
      ["muscle", "hamstrings", "secondary", 0],
      ["equipment", "barbell", "equipment", 0],
    ] as const) {
      await transaction.execute(
        `INSERT OR IGNORE INTO taxonomy_terms(kind, slug, display_name)
         VALUES (?, ?, ?)`,
        [kind, slug, slug],
      );
      await transaction.execute(
        `INSERT INTO exercise_taxonomy
          (exercise_id, kind, slug, relation, ordinal)
         VALUES ('exercise-squat', ?, ?, ?, ?)`,
        [kind, slug, relation, ordinal],
      );
    }
  });
}

describe("LIB-05 custom exercise create/edit repository", () => {
  it("create commits one explicit Unicode profile with manual Hold and is immediately searchable", async () => {
    const { kernel, repository } = await setupRuntime();
    const invalidations: string[][] = [];

    const result = await createCustomExercise({
      repository,
      invalidate: async (keys) => {
        invalidations.push([...keys]);
      },
      input: createInput(),
    });

    expect(result).toEqual(expect.objectContaining({
      outcome: "committed",
      progression: { kind: "manual_hold", version: 1 },
      exercise: expect.objectContaining({
        exerciseId: "custom-sled",
        name: "雪橇推进",
        metricIdentity: {
          profile: "fixed_time",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
        revision: 1,
      }),
    }));
    expect(invalidations).toEqual([[
      "library:exercises",
      "exercise:custom-sled",
    ]]);

    const search = await createLibrarySearchRepository(kernel).searchExercises({
      query: "雪橇",
    });
    expect(search).toMatchObject({
      state: "page",
      items: [{
        exerciseId: "custom-sled",
        canonicalName: "雪橇推进",
        origin: "custom",
        archived: false,
        equipment: ["sled"],
      }],
    });
    expect(await rowCounts(kernel)).toEqual(expect.objectContaining({
      exercise_count: 3,
      library_count: 3,
      preference_count: 1,
      alias_count: 1,
      taxonomy_count: 5,
      term_count: 3,
      fts_count: 3,
    }));
  });

  it("create returns stable likely duplicates and requires explicit create_anyway confirmation", async () => {
    const { repository } = await setupRuntime();
    await createCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: createInput({
        requestId: "request-seated-plank",
        exerciseId: "custom-seated-plank",
        name: "Plank",
        aliases: [],
        equipment: ["bodyweight"],
        metricIdentity: {
          profile: "timed_hold",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
        duplicateDecision: {
          type: "create_anyway",
          candidateExerciseIds: ["exercise-plank"],
        },
      }),
    });

    await expect(createCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: createInput({
        requestId: "request-plank-duplicate",
        exerciseId: "custom-plank-duplicate",
        name: "Ｐｌａｎｋ",
        aliases: [],
        equipment: ["bodyweight"],
        metricIdentity: {
          profile: "timed_hold",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
      }),
    })).rejects.toMatchObject({
      code: "custom_exercise_duplicate_confirmation_required",
      candidates: [
        {
          exerciseId: "custom-seated-plank",
          canonicalName: "Plank",
        },
        {
          exerciseId: "exercise-plank",
          canonicalName: "Plank",
        },
      ],
    });

    const confirmed = await createCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: createInput({
        requestId: "request-plank-duplicate",
        exerciseId: "custom-plank-duplicate",
        name: "Ｐｌａｎｋ",
        aliases: [],
        equipment: ["bodyweight"],
        metricIdentity: {
          profile: "timed_hold",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
        duplicateDecision: {
          type: "create_anyway",
          candidateExerciseIds: [
            "custom-seated-plank",
            "exercise-plank",
          ],
        },
      }),
    });
    expect(confirmed.exercise.exerciseId).toBe("custom-plank-duplicate");
  });

  it("create replay is exact, but request identity reuse with another payload is rejected", async () => {
    const { databasePath, kernel, repository } = await setupRuntime();
    const input = createInput();
    const first = await createCustomExercise({
      repository,
      invalidate: async () => undefined,
      input,
    });
    const replay = await createCustomExercise({
      repository,
      invalidate: async () => undefined,
      input,
    });
    const reopened = await reopenRuntime(databasePath);
    const restartedReplay = await createCustomExercise({
      repository: reopened.repository,
      invalidate: async () => undefined,
      input,
    });

    expect(replay).toEqual({
      ...first,
      outcome: "already_committed",
    });
    expect(restartedReplay).toEqual(replay);
    await expect(createCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: { ...input, name: "Another Name" },
    })).rejects.toBeInstanceOf(CustomExerciseConflictError);
    expect((await rowCounts(kernel))?.exercise_count).toBe(3);
  });

  it("create commit failure rolls back source, taxonomy, terms, FTS, and invalidation", async () => {
    const { kernel, repository } = await setupRuntime({ failCommit: true });
    const before = await rowCounts(kernel);
    let invalidated = false;

    await expect(createCustomExercise({
      repository,
      invalidate: async () => {
        invalidated = true;
      },
      input: createInput(),
    })).rejects.toMatchObject({ code: "sqlite_commit_failed" });

    expect(await rowCounts(kernel)).toEqual(before);
    expect(invalidated).toBe(false);
  });

  it("serialized concurrent edits permit one revision and reject the stale writer", async () => {
    const { kernel, repository } = await setupRuntime();
    await createCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: createInput(),
    });

    const edit = (requestId: string, name: string) => editCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: {
        ...createInput({ requestId, name }),
        expectedExerciseRevision: 1,
        editedAtMs: 1_787_000_001_000,
      },
    });
    const outcomes = await Promise.allSettled([
      edit("request-edit-a", "雪橇推进 A"),
      edit("request-edit-b", "雪橇推进 B"),
    ]);

    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === "rejected",
    );
    expect(rejected?.reason).toMatchObject({
      code: "custom_exercise_revision_conflict",
    });
    const [exercise] = await kernel.queryAll<{
      name: string;
      revision: number;
    }>(
      "SELECT name, revision FROM exercises WHERE id = 'custom-sled'",
    );
    expect(exercise?.revision).toBe(2);
    expect(["雪橇推进 A", "雪橇推进 B"]).toContain(exercise?.name);
  });
});

describe("LIB-05 bundled hide and custom copy lifecycle", () => {
  it("favorite and unfavorite stay in owner preference state with exact replay", async () => {
    const { kernel, repository } = await setupRuntime();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO exercise_search_terms
          (exercise_id, kind, ordinal, display_text, normalized_text)
         VALUES ('exercise-squat', 'canonical', 0, 'Squat', 'squat')`,
      );
    });
    const [sourceBefore] = await kernel.queryAll<{
      exercise_json: string;
      library_json: string;
    }>(
      `SELECT json_object(
                'id', exercise.id,
                'origin', exercise.origin,
                'name', exercise.name,
                'revision', exercise.revision
              ) AS exercise_json,
              json_object(
                'exerciseId', library.exercise_id,
                'origin', library.origin,
                'canonicalName', library.canonical_name,
                'revision', library.revision
              ) AS library_json
       FROM exercises exercise
       JOIN exercise_library_entries library
         ON library.exercise_id = exercise.id
       WHERE exercise.id = 'exercise-squat'`,
    );

    const favoriteInput = {
      requestId: "favorite-squat",
      exerciseId: "exercise-squat",
      expectedPreferenceRevision: null,
      favorite: true,
      updatedAtMs: 1_787_000_002_250,
    } as const;
    const favorite = await setExerciseFavorite({
      repository,
      invalidate: async () => undefined,
      input: favoriteInput,
    });
    const replay = await setExerciseFavorite({
      repository,
      invalidate: async () => undefined,
      input: favoriteInput,
    });
    expect(replay).toEqual({
      ...favorite,
      outcome: "already_committed",
    });
    await expect(setExerciseFavorite({
      repository,
      invalidate: async () => undefined,
      input: { ...favoriteInput, favorite: false },
    })).rejects.toMatchObject({
      code: "custom_exercise_idempotency_conflict",
    });

    const favoriteSearch = await createLibrarySearchRepository(kernel)
      .searchExercises({
        query: "squat",
        filters: { favorite: [true] },
      });
    expect(favoriteSearch).toMatchObject({
      state: "page",
      items: [{ exerciseId: "exercise-squat", favorite: true }],
    });
    const unfavorite = await setExerciseFavorite({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "unfavorite-squat",
        exerciseId: "exercise-squat",
        expectedPreferenceRevision: favorite.preferenceRevision,
        favorite: false,
        updatedAtMs: 1_787_000_002_500,
      },
    });
    expect(unfavorite).toMatchObject({
      favorite: false,
      preferenceRevision: 2,
    });
    const favoriteAgain = await setExerciseFavorite({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "favorite-squat-again",
        exerciseId: "exercise-squat",
        expectedPreferenceRevision: unfavorite.preferenceRevision,
        favorite: true,
        updatedAtMs: 1_787_000_002_750,
      },
    });
    expect(favoriteAgain).toMatchObject({
      favorite: true,
      preferenceRevision: 3,
    });
    const [sourceAfter] = await kernel.queryAll<{
      exercise_json: string;
      library_json: string;
    }>(
      `SELECT json_object(
                'id', exercise.id,
                'origin', exercise.origin,
                'name', exercise.name,
                'revision', exercise.revision
              ) AS exercise_json,
              json_object(
                'exerciseId', library.exercise_id,
                'origin', library.origin,
                'canonicalName', library.canonical_name,
                'revision', library.revision
              ) AS library_json
       FROM exercises exercise
       JOIN exercise_library_entries library
         ON library.exercise_id = exercise.id
       WHERE exercise.id = 'exercise-squat'`,
    );
    expect(sourceAfter).toEqual(sourceBefore);

    await expect(setExerciseFavorite({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "favorite-missing",
        exerciseId: "missing-exercise",
        expectedPreferenceRevision: null,
        favorite: true,
        updatedAtMs: 1,
      },
    })).rejects.toMatchObject({ code: "custom_exercise_not_found" });
    await expect(setExerciseFavorite({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "favorite-stale",
        exerciseId: "exercise-squat",
        expectedPreferenceRevision: 1,
        favorite: true,
        updatedAtMs: 2,
      },
    })).rejects.toMatchObject({
      code: "custom_exercise_preference_revision_conflict",
    });
  });

  it("hide and show mutate only owner preference state and filter bundled search", async () => {
    const { kernel, repository } = await setupRuntime();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO exercise_search_terms
          (exercise_id, kind, ordinal, display_text, normalized_text)
         VALUES ('exercise-squat', 'canonical', 0, 'Squat', 'squat')`,
      );
    });
    const [sourceBefore] = await kernel.queryAll<{
      exercise_json: string;
      library_json: string;
    }>(
      `SELECT
         json_object(
           'id', exercise.id,
           'origin', exercise.origin,
           'sourceNamespace', exercise.source_namespace,
           'upstreamId', exercise.upstream_id,
           'name', exercise.name,
           'revision', exercise.revision
         ) AS exercise_json,
         json_object(
           'exerciseId', library.exercise_id,
           'origin', library.origin,
           'canonicalName', library.canonical_name,
           'revision', library.revision
         ) AS library_json
       FROM exercises exercise
       JOIN exercise_library_entries library
         ON library.exercise_id = exercise.id
       WHERE exercise.id = 'exercise-squat'`,
    );

    const hidden = await setExerciseHidden({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "hide-squat",
        exerciseId: "exercise-squat",
        expectedPreferenceRevision: null,
        hidden: true,
        updatedAtMs: 1_787_000_002_000,
      },
    });
    expect(hidden).toMatchObject({
      outcome: "committed",
      hidden: true,
      preferenceRevision: 1,
    });
    const defaultSearch = await createLibrarySearchRepository(kernel)
      .searchExercises({ query: "squat" });
    expect(defaultSearch).toMatchObject({ state: "page", items: [] });
    const hiddenSearch = await createLibrarySearchRepository(kernel)
      .searchExercises({
        query: "squat",
        filters: { visibility: ["hidden"] },
      });
    expect(hiddenSearch).toMatchObject({
      state: "page",
      items: [{
        exerciseId: "exercise-squat",
        hidden: true,
      }],
    });

    const shown = await setExerciseHidden({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "show-squat",
        exerciseId: "exercise-squat",
        expectedPreferenceRevision: hidden.preferenceRevision,
        hidden: false,
        updatedAtMs: 1_787_000_003_000,
      },
    });
    expect(shown).toMatchObject({
      hidden: false,
      preferenceRevision: 2,
    });
    const [sourceAfter] = await kernel.queryAll<{
      exercise_json: string;
      library_json: string;
    }>(
      `SELECT
         json_object(
           'id', exercise.id,
           'origin', exercise.origin,
           'sourceNamespace', exercise.source_namespace,
           'upstreamId', exercise.upstream_id,
           'name', exercise.name,
           'revision', exercise.revision
         ) AS exercise_json,
         json_object(
           'exerciseId', library.exercise_id,
           'origin', library.origin,
           'canonicalName', library.canonical_name,
           'revision', library.revision
         ) AS library_json
       FROM exercises exercise
       JOIN exercise_library_entries library
         ON library.exercise_id = exercise.id
       WHERE exercise.id = 'exercise-squat'`,
    );
    expect(sourceAfter).toEqual(sourceBefore);
  });

  it("rejects bundled field edits but creates a fresh independent custom copy", async () => {
    const { kernel, repository } = await setupRuntime();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE exercise_library_entries
         SET exercise_type = 'strength', movement_class = 'compound'
         WHERE exercise_id = 'exercise-squat'`,
      );
      for (const [kind, slug] of [
        ["muscle", "quadriceps"],
        ["equipment", "barbell"],
      ] as const) {
        await transaction.execute(
          `INSERT OR IGNORE INTO taxonomy_terms(kind, slug, display_name)
           VALUES (?, ?, ?)`,
          [kind, slug, slug],
        );
        await transaction.execute(
          `INSERT INTO exercise_taxonomy
            (exercise_id, kind, slug, relation, ordinal)
           VALUES ('exercise-squat', ?, ?, ?, 0)`,
          [kind, slug, kind === "muscle" ? "primary" : "equipment"],
        );
      }
      await transaction.execute(
        `INSERT INTO exercise_search_terms
          (exercise_id, kind, ordinal, display_text, normalized_text)
         VALUES ('exercise-squat', 'canonical', 0, 'Squat', 'squat')`,
      );
    });

    await expect(editCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: {
        ...createInput({
          requestId: "edit-bundled-squat",
          exerciseId: "exercise-squat",
          name: "Changed bundled squat",
          aliases: [],
          primaryMuscles: ["quadriceps"],
          secondaryMuscles: [],
          equipment: ["barbell"],
          metricIdentity: {
            profile: "load_reps",
            contractVersion: 1,
            exerciseMetricGeneration: 1,
          },
        }),
        expectedExerciseRevision: 2,
        editedAtMs: 1_787_000_004_000,
      },
    })).rejects.toMatchObject({
      code: "custom_exercise_source_read_only",
    });

    const copied = await createCustomCopy({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "copy-squat",
        sourceExerciseId: "exercise-squat",
        expectedSourceRevision: 2,
        exerciseId: "custom-squat-copy",
        name: "Squat copy",
        createdAtMs: 1_787_000_005_000,
      },
    });
    expect(copied).toMatchObject({
      outcome: "committed",
      exercise: {
        exerciseId: "custom-squat-copy",
        name: "Squat copy",
        metricIdentity: {
          profile: "load_reps",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
        revision: 1,
      },
    });
    const [identity] = await kernel.queryAll<{
      origin: string;
      source_namespace: string | null;
      upstream_id: string | null;
      source_count: number;
    }>(
      `SELECT exercise.origin,
              exercise.source_namespace,
              exercise.upstream_id,
              (SELECT COUNT(*)
                 FROM exercise_catalog_sources source
                WHERE source.exercise_id = exercise.id) AS source_count
       FROM exercises exercise
       WHERE exercise.id = 'custom-squat-copy'`,
    );
    expect(identity).toEqual({
      origin: "custom",
      source_namespace: null,
      upstream_id: null,
      source_count: 0,
    });
    const search = await createLibrarySearchRepository(kernel).searchExercises({
      query: "squat copy",
    });
    expect(search).toMatchObject({
      state: "page",
      items: [{
        exerciseId: "custom-squat-copy",
        origin: "custom",
      }],
    });
  });
});

describe("LIB-05 custom archive and restore lifecycle", () => {
  it("archive preview is stable, archive removes new selection, and existing plans remain readable as Archived", async () => {
    const { kernel, repository } = await setupRuntime();
    const preview = await previewCustomExerciseArchive({
      repository,
      input: {
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
      },
    });
    expect(preview).toEqual({
      exerciseId: "exercise-plank",
      exerciseRevision: 3,
      preferenceRevision: null,
      previewRevision: expect.any(String),
      affectedPlans: [{
        planId: "plan-hold",
        planName: "Hold Practice",
        planRevision: 2,
        occurrences: [{
          occurrenceId: "plan-day-exercise-plank",
          occurrenceRevision: 5,
          dayId: "plan-day-hold",
          dayName: "Hold Day",
        }],
      }],
    });

    const archived = await archiveCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "archive-plank",
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
        expectedPreferenceRevision: preview.preferenceRevision,
        previewRevision: preview.previewRevision,
        updatedAtMs: 1_787_000_006_000,
      },
    });
    expect(archived).toMatchObject({
      outcome: "committed",
      archived: true,
      preferenceRevision: 1,
      affectedPlanIds: ["plan-hold"],
      invalidations: [
        "library:exercises",
        "exercise:exercise-plank",
        "plan:plan-hold",
      ],
    });

    const defaultSearch = await createLibrarySearchRepository(kernel)
      .searchExercises({ query: "plank" });
    expect(defaultSearch).toMatchObject({ state: "page", items: [] });
    const archivedSearch = await createLibrarySearchRepository(kernel)
      .searchExercises({
        query: "plank",
        filters: { visibility: ["archived"] },
      });
    expect(archivedSearch).toMatchObject({
      state: "page",
      items: [{
        exerciseId: "exercise-plank",
        archived: true,
      }],
    });
    const references = await repository.listExercisePlanReferences(
      "exercise-plank",
    );
    expect(references).toEqual([{
      planId: "plan-hold",
      planName: "Hold Practice",
      dayId: "plan-day-hold",
      dayName: "Hold Day",
      occurrenceId: "plan-day-exercise-plank",
      statusLabel: "Archived",
      runnable: true,
    }]);
    const [history] = await kernel.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM session_exercises
       WHERE exercise_id = 'exercise-plank'`,
    );
    expect(history?.count).toBe(1);
  });

  it("restore requires a fresh preview and returns the exercise to default selection", async () => {
    const { kernel, repository } = await setupRuntime();
    const beforeArchive = await previewCustomExerciseArchive({
      repository,
      input: {
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
      },
    });
    const archived = await archiveCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "archive-plank",
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
        expectedPreferenceRevision: null,
        previewRevision: beforeArchive.previewRevision,
        updatedAtMs: 1_787_000_007_000,
      },
    });
    const beforeRestore = await previewCustomExerciseArchive({
      repository,
      input: {
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
      },
    });
    const restored = await restoreCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "restore-plank",
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
        expectedPreferenceRevision: archived.preferenceRevision,
        previewRevision: beforeRestore.previewRevision,
        updatedAtMs: 1_787_000_008_000,
      },
    });

    expect(restored).toMatchObject({
      outcome: "committed",
      archived: false,
      preferenceRevision: 2,
    });
    const search = await createLibrarySearchRepository(kernel).searchExercises({
      query: "plank",
    });
    expect(search).toMatchObject({
      state: "page",
      items: [{ exerciseId: "exercise-plank", archived: false }],
    });
  });

  it("archive rejects stale preview facts and writes nothing", async () => {
    const { kernel, repository } = await setupRuntime();
    const preview = await previewCustomExerciseArchive({
      repository,
      input: {
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
      },
    });
    await kernel.write(async (transaction) => {
      await transaction.execute(
        "UPDATE plans SET revision = revision + 1 WHERE id = 'plan-hold'",
      );
    });

    await expect(archiveCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "archive-plank-stale",
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
        expectedPreferenceRevision: null,
        previewRevision: preview.previewRevision,
        updatedAtMs: 1_787_000_009_000,
      },
    })).rejects.toMatchObject({
      code: "custom_exercise_preview_revision_conflict",
    });
    const [preference] = await kernel.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM exercise_owner_preferences
       WHERE exercise_id = 'exercise-plank'`,
    );
    expect(preference?.count).toBe(0);
  });

  it("archive commit failure rolls back preference state and emits no invalidation", async () => {
    const { kernel, repository } = await setupRuntime({ failCommit: true });
    const preview = await previewCustomExerciseArchive({
      repository,
      input: {
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
      },
    });
    let invalidated = false;

    await expect(archiveCustomExercise({
      repository,
      invalidate: async () => {
        invalidated = true;
      },
      input: {
        requestId: "archive-plank-fail",
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
        expectedPreferenceRevision: null,
        previewRevision: preview.previewRevision,
        updatedAtMs: 1_787_000_010_000,
      },
    })).rejects.toMatchObject({ code: "sqlite_commit_failed" });
    const [preference] = await kernel.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM exercise_owner_preferences
       WHERE exercise_id = 'exercise-plank'`,
    );
    expect(preference?.count).toBe(0);
    expect(invalidated).toBe(false);
  });
});

describe("custom exercise repository conflict and replay matrix", () => {
  it("replays edit and hide requests exactly and rejects payload reuse", async () => {
    const { repository } = await setupRuntime();
    await createCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: createInput(),
    });
    const editInput = {
      ...createInput({
        requestId: "edit-replay",
        name: "雪橇推进 Edited",
      }),
      expectedExerciseRevision: 1,
      editedAtMs: 1_787_000_011_000,
    };
    const firstEdit = await editCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: editInput,
    });
    const editReplay = await editCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: editInput,
    });
    expect(editReplay).toEqual({
      ...firstEdit,
      outcome: "already_committed",
    });
    await expect(editCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: { ...editInput, name: "Different replay" },
    })).rejects.toMatchObject({
      code: "custom_exercise_idempotency_conflict",
    });

    const hideInput = {
      requestId: "hide-replay",
      exerciseId: "exercise-squat",
      expectedPreferenceRevision: null,
      hidden: true,
      updatedAtMs: 1_787_000_012_000,
    } as const;
    const firstHide = await setExerciseHidden({
      repository,
      invalidate: async () => undefined,
      input: hideInput,
    });
    const hideReplay = await setExerciseHidden({
      repository,
      invalidate: async () => undefined,
      input: hideInput,
    });
    expect(hideReplay).toEqual({
      ...firstHide,
      outcome: "already_committed",
    });
    await expect(setExerciseHidden({
      repository,
      invalidate: async () => undefined,
      input: { ...hideInput, hidden: false },
    })).rejects.toMatchObject({
      code: "custom_exercise_idempotency_conflict",
    });
  });

  it("replays successful custom copies and archive transitions, rejecting changed payloads", async () => {
    const { kernel, repository } = await setupRuntime();
    await seedBundledSquatTaxonomy(kernel);
    const copyInput = {
      requestId: "copy-replay",
      sourceExerciseId: "exercise-squat",
      expectedSourceRevision: 2,
      exerciseId: "custom-copy-replay",
      name: "Squat replay copy",
      createdAtMs: 1_787_000_013_000,
    } as const;
    const firstCopy = await createCustomCopy({
      repository,
      invalidate: async () => undefined,
      input: copyInput,
    });
    const copyReplay = await createCustomCopy({
      repository,
      invalidate: async () => undefined,
      input: copyInput,
    });
    expect(copyReplay).toEqual({
      ...firstCopy,
      outcome: "already_committed",
    });
    await expect(createCustomCopy({
      repository,
      invalidate: async () => undefined,
      input: { ...copyInput, name: "Changed copy replay" },
    })).rejects.toMatchObject({
      code: "custom_exercise_idempotency_conflict",
    });

    const preview = await previewCustomExerciseArchive({
      repository,
      input: {
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
      },
    });
    const archiveInput = {
      requestId: "archive-replay",
      exerciseId: "exercise-plank",
      expectedExerciseRevision: 3,
      expectedPreferenceRevision: null,
      previewRevision: preview.previewRevision,
      updatedAtMs: 1_787_000_014_000,
    } as const;
    const firstArchive = await archiveCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: archiveInput,
    });
    const archiveReplay = await archiveCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: archiveInput,
    });
    expect(archiveReplay).toEqual({
      ...firstArchive,
      outcome: "already_committed",
    });
    await expect(archiveCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: {
        ...archiveInput,
        updatedAtMs: archiveInput.updatedAtMs + 1,
      },
    })).rejects.toMatchObject({
      code: "custom_exercise_idempotency_conflict",
    });
  });

  it("rejects duplicate override drift and committed create state drift after restart", async () => {
    const { databasePath, kernel, repository } = await setupRuntime();
    await expect(createCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: createInput({
        requestId: "duplicate-drift",
        exerciseId: "duplicate-drift",
        name: "Plank",
        aliases: [],
        equipment: ["bodyweight"],
        metricIdentity: {
          profile: "timed_hold",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
        duplicateDecision: {
          type: "create_anyway",
          candidateExerciseIds: ["wrong-candidate"],
        },
      }),
    })).rejects.toMatchObject({
      code: "custom_exercise_duplicate_confirmation_invalid",
    });

    const input = createInput();
    await createCustomExercise({
      repository,
      invalidate: async () => undefined,
      input,
    });
    await kernel.close();
    kernels.delete(kernel);
    const reopened = await reopenRuntime(databasePath);
    await expect(createCustomExercise({
      repository: reopened.repository,
      invalidate: async () => undefined,
      input: { ...input, defaultRestSeconds: 76 },
    })).rejects.toMatchObject({
      code: "custom_exercise_idempotency_conflict",
    });
  });

  it("classifies missing, different, and body-only equipment deterministically", async () => {
    const { kernel, repository } = await setupRuntime();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO exercise_library_entries
          (exercise_id, origin, canonical_name, exercise_type,
           movement_class, metric_profile, metric_contract_version,
           exercise_metric_generation, availability, revision)
         VALUES ('orphan-library', 'custom', 'Ghost Timer', 'cardio',
                 'compound', 'fixed_time', 1, 1, 'available', 1)`,
      );
      await transaction.execute(
        `INSERT INTO exercise_search_terms
          (exercise_id, kind, ordinal, display_text, normalized_text)
         VALUES ('orphan-library', 'canonical', 0,
                 'Ghost Timer', 'ghost timer')`,
      );
    });

    const orphanNonmatch = await createCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: createInput({
        requestId: "orphan-nonmatch",
        exerciseId: "orphan-nonmatch",
        name: "Ghost Timer",
        aliases: [],
      }),
    });
    expect(orphanNonmatch.outcome).toBe("committed");

    const differentEquipment = await createCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: createInput({
        requestId: "different-equipment",
        exerciseId: "different-equipment",
        name: "Plank",
        aliases: [],
        equipment: ["sled"],
        metricIdentity: {
          profile: "timed_hold",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
      }),
    });
    expect(differentEquipment.outcome).toBe("committed");

    await kernel.write((transaction) =>
      transaction.execute(
        `UPDATE exercises
         SET equipment = 'body-only'
         WHERE id = 'exercise-plank'`,
      )
    );
    await expect(createCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: createInput({
        requestId: "catalog-body-only-match",
        exerciseId: "catalog-body-only-match",
        name: "Plank",
        aliases: [],
        equipment: ["bodyweight"],
        metricIdentity: {
          profile: "timed_hold",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
      }),
    })).rejects.toMatchObject({
      code: "custom_exercise_duplicate_confirmation_required",
      candidates: [expect.objectContaining({
        exerciseId: "exercise-plank",
        equipment: ["body-only"],
      })],
    });

    await kernel.write((transaction) =>
      transaction.execute(
        `UPDATE exercises
         SET equipment = 'Body Only'
         WHERE id = 'exercise-plank'`,
      )
    );
    await expect(createCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: createInput({
        requestId: "legacy-body-only-match",
        exerciseId: "legacy-body-only-match",
        name: "Plank",
        aliases: [],
        equipment: ["bodyweight"],
        metricIdentity: {
          profile: "timed_hold",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
      }),
    })).rejects.toMatchObject({
      code: "custom_exercise_duplicate_confirmation_required",
      candidates: [expect.objectContaining({
        exerciseId: "exercise-plank",
        equipment: ["body only"],
      })],
    });
  });

  it("rejects missing, bundled, stale, and inconsistent edit/archive facts", async () => {
    const { kernel, repository } = await setupRuntime();
    const edit = (
      exerciseId: string,
      expectedExerciseRevision: number,
      metricIdentity = createInput().metricIdentity,
    ) => editCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: {
        ...createInput({
          requestId: `edit-${exerciseId}-${expectedExerciseRevision}`,
          exerciseId,
          metricIdentity,
        }),
        expectedExerciseRevision,
        editedAtMs: 1_787_000_015_000,
      },
    });
    await expect(edit("missing-exercise", 1)).rejects.toMatchObject({
      code: "custom_exercise_not_found",
    });
    await expect(edit("exercise-squat", 2, {
      profile: "load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    })).rejects.toMatchObject({
      code: "custom_exercise_source_read_only",
    });
    await expect(edit("exercise-plank", 2, {
      profile: "timed_hold",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    })).rejects.toMatchObject({
      code: "custom_exercise_revision_conflict",
    });
    await expect(edit("exercise-plank", 3, {
      profile: "timed_hold",
      contractVersion: 2,
      exerciseMetricGeneration: 1,
    })).rejects.toMatchObject({
      code: "custom_exercise_source_inconsistent",
    });

    await expect(previewCustomExerciseArchive({
      repository,
      input: {
        exerciseId: "missing-exercise",
        expectedExerciseRevision: 1,
      },
    })).rejects.toMatchObject({ code: "custom_exercise_not_found" });
    await expect(previewCustomExerciseArchive({
      repository,
      input: {
        exerciseId: "exercise-squat",
        expectedExerciseRevision: 2,
      },
    })).rejects.toMatchObject({
      code: "custom_exercise_source_read_only",
    });
    await expect(previewCustomExerciseArchive({
      repository,
      input: {
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 2,
      },
    })).rejects.toMatchObject({
      code: "custom_exercise_revision_conflict",
    });

    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO exercises
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           metric_profile, metric_contract_version,
           exercise_metric_generation, equipment,
           default_rest_seconds, revision)
         VALUES ('orphan-custom', NULL, 'custom', NULL, NULL, 'Orphan',
                 'unscored', 1, 1, 'None', 0, 1)`,
      );
    });
    await expect(previewCustomExerciseArchive({
      repository,
      input: {
        exerciseId: "orphan-custom",
        expectedExerciseRevision: 1,
      },
    })).rejects.toMatchObject({ code: "custom_exercise_not_found" });
  });

  it("rejects hidden preference conflicts and covers existing-preference true updates", async () => {
    const { repository } = await setupRuntime();
    await expect(setExerciseHidden({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "hide-missing",
        exerciseId: "missing-exercise",
        expectedPreferenceRevision: null,
        hidden: true,
        updatedAtMs: 1,
      },
    })).rejects.toMatchObject({ code: "custom_exercise_not_found" });

    const first = await setExerciseHidden({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "show-initial",
        exerciseId: "exercise-squat",
        expectedPreferenceRevision: null,
        hidden: false,
        updatedAtMs: 2,
      },
    });
    await expect(setExerciseHidden({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "hide-stale",
        exerciseId: "exercise-squat",
        expectedPreferenceRevision: null,
        hidden: true,
        updatedAtMs: 3,
      },
    })).rejects.toMatchObject({
      code: "custom_exercise_preference_revision_conflict",
    });
    const hidden = await setExerciseHidden({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "hide-existing",
        exerciseId: "exercise-squat",
        expectedPreferenceRevision: first.preferenceRevision,
        hidden: true,
        updatedAtMs: 4,
      },
    });
    expect(hidden.hidden).toBe(true);
  });

  it("rejects all custom-copy source conflicts and incomplete source taxonomy", async () => {
    const { kernel, repository } = await setupRuntime();
    await seedBundledSquatTaxonomy(kernel);
    const base = {
      requestId: "copy-conflict",
      sourceExerciseId: "exercise-squat",
      expectedSourceRevision: 2,
      exerciseId: "custom-copy-conflict",
      name: "Copy conflict",
      createdAtMs: 1_787_000_016_000,
    } as const;
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO exercises
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           metric_profile, metric_contract_version,
           exercise_metric_generation, equipment,
           default_rest_seconds, revision)
         VALUES ('custom-copy-conflict', NULL, 'custom', NULL, NULL,
                 'Existing', 'unscored', 1, 1, 'None', 0, 1)`,
      );
    });
    await expect(createCustomCopy({
      repository,
      invalidate: async () => undefined,
      input: base,
    })).rejects.toMatchObject({ code: "custom_exercise_already_exists" });

    await expect(createCustomCopy({
      repository,
      invalidate: async () => undefined,
      input: {
        ...base,
        requestId: "copy-missing",
        sourceExerciseId: "missing-exercise",
        exerciseId: "copy-missing",
      },
    })).rejects.toMatchObject({ code: "custom_exercise_not_found" });
    await expect(createCustomCopy({
      repository,
      invalidate: async () => undefined,
      input: {
        ...base,
        requestId: "copy-custom",
        sourceExerciseId: "exercise-plank",
        expectedSourceRevision: 3,
        exerciseId: "copy-custom",
      },
    })).rejects.toMatchObject({
      code: "custom_exercise_copy_source_required",
    });
    await expect(createCustomCopy({
      repository,
      invalidate: async () => undefined,
      input: {
        ...base,
        requestId: "copy-stale",
        expectedSourceRevision: 1,
        exerciseId: "copy-stale",
      },
    })).rejects.toMatchObject({
      code: "custom_exercise_revision_conflict",
    });

    await kernel.write(async (transaction) => {
      await transaction.execute(
        `DELETE FROM exercise_taxonomy
         WHERE exercise_id = 'exercise-squat' AND kind = 'muscle'`,
      );
    });
    await expect(createCustomCopy({
      repository,
      invalidate: async () => undefined,
      input: {
        ...base,
        requestId: "copy-incomplete",
        exerciseId: "copy-incomplete",
      },
    })).rejects.toMatchObject({
      code: "sqlite_transaction_failed",
    });
  });

  it("copies fallback equipment and exposes non-archived references without a label", async () => {
    const { kernel, repository } = await setupRuntime();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE exercise_library_entries
         SET exercise_type = 'strength', movement_class = 'compound'
         WHERE exercise_id = 'exercise-squat'`,
      );
      await transaction.execute(
        `INSERT OR IGNORE INTO taxonomy_terms(kind, slug, display_name)
         VALUES ('muscle', 'quadriceps', 'quadriceps')`,
      );
      await transaction.execute(
        `INSERT INTO exercise_taxonomy
          (exercise_id, kind, slug, relation, ordinal)
         VALUES ('exercise-squat', 'muscle', 'quadriceps', 'primary', 0)`,
      );
    });
    const copied = await createCustomCopy({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "copy-fallback-equipment",
        sourceExerciseId: "exercise-squat",
        expectedSourceRevision: 2,
        exerciseId: "copy-fallback-equipment",
        name: "Fallback Equipment Copy",
        createdAtMs: 1_787_000_017_000,
      },
    });
    expect(copied.exercise.equipment).toEqual(["unspecified"]);

    const references = await repository.listExercisePlanReferences(
      "exercise-plank",
    );
    expect(references).toEqual([expect.objectContaining({
      statusLabel: null,
      runnable: true,
    })]);
  });

  it("preserves stable multi-muscle taxonomy order in a custom copy", async () => {
    const { kernel, repository } = await setupRuntime();
    await seedBundledSquatTaxonomy(kernel);

    const copied = await createCustomCopy({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "copy-multi-taxonomy",
        sourceExerciseId: "exercise-squat",
        expectedSourceRevision: 2,
        exerciseId: "copy-multi-taxonomy",
        name: "Multi Taxonomy Copy",
        createdAtMs: 1_787_000_018_000,
      },
    });

    expect(copied.exercise.primaryMuscles).toEqual([
      "quadriceps",
      "glutes",
    ]);
    expect(copied.exercise.secondaryMuscles).toEqual(["hamstrings"]);
  });

  it("rejects archive preference drift and source conflicts inside the write", async () => {
    const { repository } = await setupRuntime();
    const preview = await previewCustomExerciseArchive({
      repository,
      input: {
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
      },
    });
    const hidden = await setExerciseHidden({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "hide-plank-before-archive",
        exerciseId: "exercise-plank",
        expectedPreferenceRevision: null,
        hidden: true,
        updatedAtMs: 1,
      },
    });
    await expect(archiveCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "archive-preference-drift",
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
        expectedPreferenceRevision: null,
        previewRevision: preview.previewRevision,
        updatedAtMs: 2,
      },
    })).rejects.toMatchObject({
      code: "custom_exercise_preference_revision_conflict",
    });
    const freshPreview = await previewCustomExerciseArchive({
      repository,
      input: {
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
      },
    });
    const archived = await archiveCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "archive-existing-preference",
        exerciseId: "exercise-plank",
        expectedExerciseRevision: 3,
        expectedPreferenceRevision: hidden.preferenceRevision,
        previewRevision: freshPreview.previewRevision,
        updatedAtMs: 3,
      },
    });
    expect(archived.archived).toBe(true);

    await expect(archiveCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId: "archive-missing",
        exerciseId: "missing-exercise",
        expectedExerciseRevision: 1,
        expectedPreferenceRevision: null,
        previewRevision: "preview",
        updatedAtMs: 1,
      },
    })).rejects.toMatchObject({ code: "custom_exercise_not_found" });
  });
});
