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
  MigrationError,
} from "../../src/platform/sqlite/migrationRunner";
import {
  scheduleActivationMigration,
} from "../../src/platform/sqlite/migrations/0008_schedule_activation";
import {
  ownedPlansMigration,
} from "../../src/platform/sqlite/migrations/0009_owned_plans";
import {
  OWNED_RECOMMENDATION_SCHEMA_STATEMENTS,
  ownedRecommendationsMigration,
} from "../../src/platform/sqlite/migrations/0010_owned_recommendations";
import {
  migrations,
} from "../../src/platform/sqlite/migrations";
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

async function retainedV6Runtime(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-owned-recommendations-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixture = new DatabaseSync(databasePath);
  fixture.exec(readFileSync(
    join(
      repositoryRoot,
      "tests/migrations/fixtures/v6-metric-profiles.sql",
    ),
    "utf8",
  ));
  fixture.close();
  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  runtimes.push(kernel);
  return kernel;
}

const requiredSchema = [
  { name: "owned_progression_recommendations", type: "table" },
  { name: "one_pending_owned_recommendation", type: "index" },
  { name: "owned_recommendations_by_exercise", type: "index" },
  { name: "session_sets_by_owned_target", type: "index" },
  { name: "session_sets_target_graph_insert", type: "trigger" },
  { name: "session_sets_target_graph_update", type: "trigger" },
  { name: "session_sets_owned_target_identity_insert", type: "trigger" },
  { name: "session_sets_owned_target_identity_update", type: "trigger" },
  { name: "owned_recommendations_identity_insert", type: "trigger" },
  { name: "owned_recommendations_identity_update", type: "trigger" },
] as const;

function verificationTransaction(
  input: Readonly<{
    columns?: readonly Readonly<{ name: string }>[];
    schema?: readonly Readonly<{ name: string; type: string }>[];
    invalid?: readonly Readonly<{ count: number }>[];
  }>,
): SqliteTransactionExecutor {
  return {
    execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
    async queryAll<Row extends Record<string, unknown>>(sql: string) {
      const rows = sql.startsWith("PRAGMA table_info(session_sets)")
        ? input.columns ?? []
        : sql.includes("FROM sqlite_master")
          ? input.schema ?? []
          : input.invalid ?? [];
      return rows as unknown as Row[];
    },
  };
}

describe("owned recommendation migration", () => {
  it("registers v10 after the released owned-plan graph and retains later migrations", () => {
    expect(ownedRecommendationsMigration).toMatchObject({
      version: 10,
      name: "owned-recommendations",
      kind: "additive",
    });
    expect(migrations.slice(0, 11).map(({ version }) => version)).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      8,
      9,
      10,
      11,
      12,
    ]);
    expect(migrations.at(-1)?.version).toBeGreaterThanOrEqual(12);
  });

  it("preserves retained legacy recommendations while adding owned links", async () => {
    const kernel = await retainedV6Runtime();
    await createMigrationRunner({
      databaseName: "gym-tracker.db",
      kernel,
      migrations: [scheduleActivationMigration, ownedPlansMigration],
    }).run();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO owned_plan_day_exercises
          (id, plan_day_id, exercise_id, ordinal,
           between_exercise_rest_seconds, metric_profile,
           metric_contract_version, exercise_metric_generation, revision)
         VALUES ('owned-squat-动作', 'plan-day-copy', 'exercise-squat', 0,
                 180, 'load_reps', 1, 1, 3)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_working_set_targets
          (id, plan_day_exercise_id, ordinal, target_json, unit_json,
           metric_profile, metric_contract_version,
           exercise_metric_generation, revision)
         VALUES (
           'owned-squat-target-重量',
           'owned-squat-动作',
           0,
           '{"version":1,"profile":"load_reps","loadGrams":55000,"minReps":6,"maxReps":8,"incrementGrams":2500,"perSide":false}',
           '{"version":1,"load":"grams","count":"repetitions"}',
           'load_reps', 1, 1, 4
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_progression_policies
          (id, plan_day_exercise_id, policy_kind, policy_id, policy_version,
           rule_json, metric_profile, metric_contract_version,
           exercise_metric_generation, status, revision)
         VALUES (
           'owned-squat-policy-進行',
           'owned-squat-动作',
           'automatic',
           'load_reps.double_progression.v1',
           1,
           '{"version":1,"incrementGrams":2500}',
           'load_reps', 1, 1, 'active', 2
         )`,
      );
    });
    const before = {
      recommendations: await kernel.queryAll(
        "SELECT * FROM progression_recommendations ORDER BY id",
      ),
      ownedOccurrences: await kernel.queryAll(
        "SELECT * FROM owned_plan_day_exercises ORDER BY id",
      ),
      ownedTargets: await kernel.queryAll(
        "SELECT * FROM owned_plan_working_set_targets ORDER BY id",
      ),
      ownedPolicies: await kernel.queryAll(
        "SELECT * FROM owned_plan_progression_policies ORDER BY id",
      ),
      sets: await kernel.queryAll(
        "SELECT * FROM session_sets ORDER BY id",
      ),
    };

    await createMigrationRunner({
      databaseName: "gym-tracker.db",
      kernel,
      migrations: [ownedRecommendationsMigration],
    }).run();

    await expect(kernel.queryAll("PRAGMA user_version")).resolves.toEqual([
      { user_version: 10 },
    ]);
    await expect(kernel.queryAll(
      "SELECT * FROM progression_recommendations ORDER BY id",
    )).resolves.toEqual(before.recommendations);
    await expect(kernel.queryAll(
      "SELECT * FROM owned_plan_day_exercises ORDER BY id",
    )).resolves.toEqual(before.ownedOccurrences);
    await expect(kernel.queryAll(
      "SELECT * FROM owned_plan_working_set_targets ORDER BY id",
    )).resolves.toEqual(before.ownedTargets);
    await expect(kernel.queryAll(
      "SELECT * FROM owned_plan_progression_policies ORDER BY id",
    )).resolves.toEqual(before.ownedPolicies);
    await expect(kernel.queryAll(
      `SELECT id, session_exercise_id, set_kind, ordinal,
              source_plan_working_set_target_id, target_load_grams,
              target_min_reps, target_max_reps, target_json, unit_json,
              rule_type, rule_version, metric_profile,
              metric_contract_version, exercise_metric_generation,
              observed_load_grams, observed_reps, observed_json, status,
              draft_updated_at_ms, completed_at_ms,
              completion_idempotency_key, revision
       FROM session_sets
       ORDER BY id`,
    )).resolves.toEqual(before.sets);
    await expect(kernel.queryAll(
      `SELECT COUNT(*) AS count
       FROM session_sets
       WHERE source_owned_plan_working_set_target_id IS NOT NULL`,
    )).resolves.toEqual([{ count: 0 }]);
    await expect(kernel.queryAll(
      "SELECT COUNT(*) AS count FROM owned_progression_recommendations",
    )).resolves.toEqual([{ count: 0 }]);
    await expect(createMigrationRunner({
      databaseName: "gym-tracker.db",
      kernel,
      migrations: [ownedRecommendationsMigration],
    }).run()).resolves.toMatchObject({
      appliedVersions: [],
      currentVersion: 10,
    });
  });

  it.each(
    OWNED_RECOMMENDATION_SCHEMA_STATEMENTS.flatMap((_, statementIndex) => [
      ["before", statementIndex] as const,
      ["after", statementIndex] as const,
    ]),
  )(
    "rolls back v10 when failure is injected %s schema statement %i",
    async (...parameters) => {
      const [phase, statementIndex] = parameters;
      const kernel = await retainedV6Runtime();
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel,
        migrations: [scheduleActivationMigration, ownedPlansMigration],
      }).run();
      const beforeRecommendations = await kernel.queryAll(
        "SELECT * FROM progression_recommendations ORDER BY id",
      );

      await expect(createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel,
        migrations: [ownedRecommendationsMigration],
        failureInjector(event) {
          if (
            event.phase === phase
            && event.statementIndex === statementIndex
          ) {
            throw new Error(`injected_${phase}_${statementIndex}`);
          }
        },
      }).run()).rejects.toBeInstanceOf(MigrationError);

      await expect(kernel.queryAll("PRAGMA user_version")).resolves.toEqual([
        { user_version: 9 },
      ]);
      await expect(kernel.queryAll(
        "SELECT * FROM progression_recommendations ORDER BY id",
      )).resolves.toEqual(beforeRecommendations);
      await expect(kernel.queryAll<{ name: string }>(
        "PRAGMA table_info(session_sets)",
      )).resolves.not.toContainEqual({
        name: "source_owned_plan_working_set_target_id",
      });
      await expect(kernel.queryAll<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM sqlite_master
         WHERE name = 'owned_progression_recommendations'`,
      )).resolves.toEqual([{ count: 0 }]);
    },
  );

  it("rejects cross-exercise owned recommendation and session links", async () => {
    const kernel = await retainedV6Runtime();
    await createMigrationRunner({
      databaseName: "gym-tracker.db",
      kernel,
      migrations: [
        scheduleActivationMigration,
        ownedPlansMigration,
        ownedRecommendationsMigration,
      ],
    }).run();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO exercises
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           metric_profile, metric_contract_version,
           exercise_metric_generation, equipment, default_rest_seconds,
           revision)
         VALUES ('exercise-row', NULL, 'custom', NULL, NULL, 'Row',
                 'load_reps', 1, 1, 'Cable', 90, 1)`,
      );
      await transaction.execute(
        `INSERT INTO exercise_library_entries
          (exercise_id, origin, canonical_name, exercise_type, movement_class,
           metric_profile, metric_contract_version,
           exercise_metric_generation, availability, revision)
         VALUES ('exercise-row', 'custom', 'Row', 'strength', 'compound',
                 'load_reps', 1, 1, 'available', 1)`,
      );
      await transaction.execute(
        `INSERT INTO plans
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           days_per_week, audience, goal, estimate_minutes, attribution,
           is_active, revision)
         VALUES ('owned-row-plan', NULL, 'custom', NULL, NULL, 'Row Plan',
                 1, 'Owner', 'Strength', 20, 'Owner', 0, 1)`,
      );
      await transaction.execute(
        `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
         VALUES ('owned-row-day', 'owned-row-plan', 0, 'Row Day', 1)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_day_exercises
          (id, plan_day_id, exercise_id, ordinal,
           between_exercise_rest_seconds, metric_profile,
           metric_contract_version, exercise_metric_generation, revision)
         VALUES ('owned-row-occurrence', 'owned-row-day', 'exercise-row', 0,
                 90, 'load_reps', 1, 1, 1)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_working_set_targets
          (id, plan_day_exercise_id, ordinal, target_json, unit_json,
           metric_profile, metric_contract_version,
           exercise_metric_generation, revision)
         VALUES (
           'owned-row-target', 'owned-row-occurrence', 0,
           '{"version":1,"profile":"load_reps","loadGrams":30000,"minReps":8,"maxReps":10,"incrementGrams":2500,"perSide":false}',
           '{"version":1,"load":"grams","count":"repetitions"}',
           'load_reps', 1, 1, 1
         )`,
      );
    });

    await expect(kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO owned_progression_recommendations
          (id, exercise_id, owned_plan_working_set_target_id, rule_type,
           rule_version, evidence_version, evidence_json,
           current_target_json, proposed_target_json, metric_profile,
           metric_contract_version, exercise_metric_generation, status,
           source_revision, target_revision, created_at_ms, decided_at_ms)
         VALUES (
           'owned-mismatch', 'exercise-squat', 'owned-row-target',
           'load_reps', 1, 1, '{}',
           '{"version":1,"profile":"load_reps","loadGrams":30000,"minReps":8,"maxReps":10,"incrementGrams":2500,"perSide":false}',
           '{"version":1,"profile":"load_reps","loadGrams":32500,"minReps":8,"maxReps":10,"incrementGrams":2500,"perSide":false}',
           'load_reps', 1, 1, 'pending', 1, 1, 1000, NULL
         )`,
      )
    )).rejects.toThrow("sqlite_transaction_failed");

    await expect(kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO session_sets
          (id, session_exercise_id, set_kind, ordinal,
           source_plan_working_set_target_id,
           source_owned_plan_working_set_target_id, target_load_grams,
           target_min_reps, target_max_reps, target_json, unit_json,
           rule_type, rule_version, metric_profile, metric_contract_version,
           exercise_metric_generation, observed_load_grams, observed_reps,
           observed_json, status, draft_updated_at_ms, completed_at_ms,
           completion_idempotency_key, revision)
         VALUES (
           'owned-set-mismatch', 'session-exercise-squat', 'working', 2,
           NULL, 'owned-row-target', 30000, 8, 10,
           '{"version":1,"profile":"load_reps","loadGrams":30000,"minReps":8,"maxReps":10,"incrementGrams":2500,"perSide":false}',
           '{"version":1,"load":"grams","count":"repetitions"}',
           'load_reps', 1, 'load_reps', 1, 1, NULL, NULL, NULL, 'planned',
           NULL, NULL, NULL, 1
         )`,
      )
    )).rejects.toThrow("sqlite_transaction_failed");
  });

  it("fails closed on incomplete session and recommendation schemas", async () => {
    await expect(ownedRecommendationsMigration.verify(
      verificationTransaction({}),
    )).rejects.toThrow("owned_recommendation_session_schema_incomplete");

    await expect(ownedRecommendationsMigration.verify(
      verificationTransaction({
        columns: [{ name: "source_owned_plan_working_set_target_id" }],
      }),
    )).rejects.toThrow("owned_recommendation_schema_incomplete");
  });

  it("fails closed on invalid or missing identity verification rows", async () => {
    const input = {
      columns: [{ name: "source_owned_plan_working_set_target_id" }],
      schema: requiredSchema,
    };
    await expect(ownedRecommendationsMigration.verify(
      verificationTransaction(input),
    )).rejects.toThrow("owned_recommendation_identity_invalid");
    await expect(ownedRecommendationsMigration.verify(
      verificationTransaction({
        ...input,
        invalid: [{ count: 1 }],
      }),
    )).rejects.toThrow("owned_recommendation_identity_invalid");
    await expect(ownedRecommendationsMigration.verify(
      verificationTransaction({
        ...input,
        invalid: [{ count: 0 }],
      }),
    )).resolves.toBeUndefined();
  });
});
