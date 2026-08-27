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
  migrateCustomExerciseMetricProfile,
  type MigrateCustomExerciseMetricProfileInput,
} from "../../src/domains/metrics/migrateCustomExerciseMetricProfile";
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
  initialMigration,
} from "../../src/platform/sqlite/migrations/0001_initial";
import {
  outcomeEffortMigration,
} from "../../src/platform/sqlite/migrations/0002_outcome_effort";
import {
  exerciseHistoryIndexMigration,
} from "../../src/platform/sqlite/migrations/0003_exercise_history_index";
import {
  contentLibraryMigration,
} from "../../src/platform/sqlite/migrations/0004_content_library";
import {
  exerciseSearchFtsMigration,
} from "../../src/platform/sqlite/migrations/0005_exercise_search_fts";
import {
  metricProfilesMigration,
} from "../../src/platform/sqlite/migrations/0006_metric_profiles";
import {
  scheduleActivationMigration,
} from "../../src/platform/sqlite/migrations/0008_schedule_activation";
import {
  ownedPlansMigration,
} from "../../src/platform/sqlite/migrations/0009_owned_plans";
import {
  ownedRecommendationsMigration,
} from "../../src/platform/sqlite/migrations/0010_owned_recommendations";
import type {
  RecoveryBackupPort,
} from "../../src/platform/sqlite/recoveryBackup";
import {
  createMetricRepository,
} from "../../src/platform/sqlite/repositories/metricRepository";
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
const migrations = [
  initialMigration,
  outcomeEffortMigration,
  exerciseHistoryIndexMigration,
  contentLibraryMigration,
  exerciseSearchFtsMigration,
  metricProfilesMigration,
  scheduleActivationMigration,
  ownedPlansMigration,
  ownedRecommendationsMigration,
] as const;
const recoveryBackup: RecoveryBackupPort = {
  createAndValidate: async (request) => ({
    backupId: `metric-${request.fromVersion}-${request.toVersion}`,
    databaseName: request.databaseName,
    fromVersion: request.fromVersion,
    toVersion: request.toVersion,
    validated: true,
  }),
};
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

async function setupRuntime(options: Readonly<{
  failCommit?: boolean;
  includeOwnedRecommendations?: boolean;
  secondTarget?: boolean;
}> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "gym-profile-command-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixtureDatabase = new DatabaseSync(databasePath);
  for (const fixture of [
    "v1-phase1.sql",
    "v4-content-library.sql",
    "v5-search-fts.sql",
  ]) {
    fixtureDatabase.exec(readFileSync(
      join(repositoryRoot, "tests/migrations/fixtures", fixture),
      "utf8",
    ));
  }
  fixtureDatabase.close();

  let rejectCommit = false;
  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
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
    migrations: options.includeOwnedRecommendations === false
      ? migrations.slice(0, -1)
      : migrations,
    recoveryBackup,
  }).run();

  if (options.secondTarget) {
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO plan_working_set_targets
          (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps,
           target_json, unit_json, metric_profile, metric_contract_version,
           exercise_metric_generation, revision)
         VALUES ('working-target-plank-2', 'plan-day-exercise-plank', 1,
                 0, 0, 0,
                 '{"version":1,"profile":"timed_hold","durationSeconds":60,"perSide":false}',
                 '{"version":1,"duration":"seconds"}',
                 'timed_hold', 1, 1, 2)`,
      );
    });
  }
  if (options.failCommit) {
    rejectCommit = true;
  }
  return {
    kernel,
    repository: createMetricRepository(kernel),
  };
}

function input(
  secondTarget = false,
): MigrateCustomExerciseMetricProfileInput {
  return {
    exerciseId: "exercise-plank",
    expectedExerciseRevision: 3,
    fromIdentity: {
      profile: "timed_hold",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    toIdentity: {
      profile: "timed_hold",
      contractVersion: 2,
      exerciseMetricGeneration: 2,
    },
    replacements: [
      {
        targetId: "working-target-plank",
        expectedTargetRevision: 6,
        target: {
          version: 2,
          profile: "timed_hold",
          durationMs: 45_000,
          perSide: false,
        },
        unit: {
          version: 2,
          duration: "milliseconds",
        },
      },
      ...(secondTarget
        ? [{
            targetId: "working-target-plank-2",
            expectedTargetRevision: 2,
            target: {
              version: 2 as const,
              profile: "timed_hold" as const,
              durationMs: 60_000,
              perSide: false,
            },
            unit: {
              version: 2,
              duration: "milliseconds",
            },
          }]
        : []),
    ],
    policyDecisions: [{
      planDayExerciseId: "plan-day-exercise-plank",
      expectedPolicyRevision: 4,
      policy: {
        kind: "manual_hold",
        version: 1,
      },
    }],
    acknowledgedHistoryImmutable: true,
    idempotencyKey: "metric-profile-plank-v2",
    migratedAtMs: 1_787_000_000_000,
  };
}

async function historyBytes(kernel: SqliteKernel) {
  return {
    exercise: await kernel.queryAll(
      `SELECT * FROM session_exercises
       WHERE exercise_id = 'exercise-plank'
       ORDER BY id`,
    ),
    sets: await kernel.queryAll(
      `SELECT ss.*
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       WHERE se.exercise_id = 'exercise-plank'
       ORDER BY ss.id`,
    ),
    undo: await kernel.queryAll(
      "SELECT * FROM session_undo_snapshots ORDER BY id",
    ),
  };
}

const ROLLBACK_CASES: readonly Readonly<{
  name: string;
  change(
    request: MigrateCustomExerciseMetricProfileInput,
  ): MigrateCustomExerciseMetricProfileInput;
  error: string;
  secondTarget: boolean;
}>[] = [
  {
    name: "stale exercise revision",
    change: (request) => ({
      ...request,
      expectedExerciseRevision: 2,
    }),
    error: "metric_profile_exercise_revision_conflict",
    secondTarget: false,
  },
  {
    name: "stale target revision",
    change: (request) => ({
      ...request,
      replacements: [{
        ...request.replacements[0]!,
        expectedTargetRevision: 5,
      }],
    }),
    error: "metric_profile_target_revision_conflict",
    secondTarget: false,
  },
  {
    name: "incomplete target replacement map",
    change: (request) => ({
      ...request,
      replacements: [request.replacements[0]!],
    }),
    error: "metric_profile_replacement_incomplete",
    secondTarget: true,
  },
];

describe("atomic D-34 future-target profile migration", () => {
  it("migrates final owned-plan targets and policy in the same future-only transaction", async () => {
    const { kernel, repository } = await setupRuntime();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO plans
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           days_per_week, audience, goal, estimate_minutes, attribution,
           is_active, revision)
         VALUES ('owned-plan-plank', NULL, 'custom', NULL, NULL,
                 'Owned Plank Plan', 1, 'Owner', 'Core', 20,
                 'Owner-created', 0, 1)`,
      );
      await transaction.execute(
        `INSERT INTO plan_days(id, plan_id, ordinal, name, revision)
         VALUES ('owned-day-plank', 'owned-plan-plank', 0, 'Core Day', 1)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_day_exercises
          (id, plan_day_id, exercise_id, ordinal,
           between_exercise_rest_seconds, metric_profile,
           metric_contract_version, exercise_metric_generation, revision)
         VALUES ('owned-occurrence-plank', 'owned-day-plank',
                 'exercise-plank', 0, 60, 'timed_hold', 1, 1, 1)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_working_set_targets
          (id, plan_day_exercise_id, ordinal, target_json, unit_json,
           metric_profile, metric_contract_version,
           exercise_metric_generation, revision)
         VALUES ('owned-target-plank', 'owned-occurrence-plank', 0,
                 '{"version":1,"profile":"timed_hold","durationSeconds":75,"perSide":false}',
                 '{"version":1,"duration":"seconds"}',
                 'timed_hold', 1, 1, 1)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_progression_policies
          (id, plan_day_exercise_id, policy_kind, policy_id, policy_version,
           rule_json, metric_profile, metric_contract_version,
           exercise_metric_generation, status, revision)
         VALUES ('owned-policy-plank', 'owned-occurrence-plank',
                 'manual_hold', 'manual-hold-v1', 1,
                 '{"kind":"manual_hold","id":"manual-hold-v1","version":1}',
                 'timed_hold', 1, 1, 'active', 1)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_aggregate_states
          (plan_id, lifecycle, graph_status, missing_requirement_code,
           missing_requirement, created_at_ms, updated_at_ms, archived_at_ms)
         VALUES ('owned-plan-plank', 'ready', 'valid', NULL, NULL, 0, 0, NULL)`,
      );
      await transaction.execute(
        `INSERT INTO owned_progression_recommendations
          (id, exercise_id, owned_plan_working_set_target_id, rule_type,
           rule_version, evidence_version, evidence_json,
           current_target_json, proposed_target_json, metric_profile,
           metric_contract_version, exercise_metric_generation, status,
           source_revision, target_revision, created_at_ms, decided_at_ms)
         VALUES (
           'owned-recommendation-plank', 'exercise-plank',
           'owned-target-plank', 'timed_hold', 1, 1, '{}',
           '{"version":1,"profile":"timed_hold","durationSeconds":75,"perSide":false}',
           '{"version":1,"profile":"timed_hold","durationSeconds":90,"perSide":false}',
           'timed_hold', 1, 1, 'pending', 1, 1, 10000, NULL
         )`,
      );
    });
    const request = input();

    await expect(migrateCustomExerciseMetricProfile({
      repository,
      input: {
        ...request,
        replacements: [
          ...request.replacements,
          {
            targetId: "owned-target-plank",
            expectedTargetRevision: 1,
            target: {
              version: 2,
              profile: "timed_hold",
              durationMs: 75_000,
              perSide: false,
            },
            unit: {
              version: 2,
              duration: "milliseconds",
            },
          },
        ],
        policyDecisions: [
          ...request.policyDecisions,
          {
            planDayExerciseId: "owned-occurrence-plank",
            expectedPolicyRevision: 1,
            policy: {
              kind: "manual_hold",
              version: 1,
            },
          },
        ],
      },
    })).resolves.toEqual(expect.objectContaining({
      invalidatedRecommendationIds: ["owned-recommendation-plank"],
      migratedTargetIds: [
        "owned-target-plank",
        "working-target-plank",
      ],
      invalidatedPolicyIds: [
        "owned-policy-plank",
        "policy-plank",
      ],
    }));
    await expect(kernel.queryAll(
      `SELECT metric_profile, metric_contract_version,
              exercise_metric_generation, revision, target_json, unit_json
       FROM owned_plan_working_set_targets
       WHERE id = 'owned-target-plank'`,
    )).resolves.toEqual([{
      exercise_metric_generation: 2,
      metric_contract_version: 2,
      metric_profile: "timed_hold",
      revision: 2,
      target_json:
        '{"version":2,"profile":"timed_hold","durationMs":75000,"perSide":false}',
      unit_json: '{"version":2,"duration":"milliseconds"}',
    }]);
    await expect(kernel.queryAll(
      `SELECT metric_profile, metric_contract_version,
              exercise_metric_generation, revision, policy_kind,
              policy_id, policy_version, rule_json
       FROM owned_plan_progression_policies
       WHERE plan_day_exercise_id = 'owned-occurrence-plank'`,
    )).resolves.toEqual([{
      exercise_metric_generation: 2,
      metric_contract_version: 2,
      metric_profile: "timed_hold",
      policy_id: "manual_hold",
      policy_kind: "manual_hold",
      policy_version: 1,
      revision: 2,
      rule_json: '{"version":1,"progression":"manual"}',
    }]);
    await expect(kernel.queryAll(
      `SELECT status
       FROM owned_progression_recommendations
       WHERE id = 'owned-recommendation-plank'`,
    )).resolves.toEqual([{ status: "invalidated" }]);
  });

  it("migrates every future target, invalidates progression, and preserves history", async () => {
    const { kernel, repository } = await setupRuntime({ secondTarget: true });
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO progression_recommendations
          (id, exercise_id, plan_working_set_target_id, rule_type,
           rule_version, evidence_version, evidence_json,
           current_target_json, proposed_target_json, metric_profile,
           metric_contract_version, exercise_metric_generation, status,
           source_revision, target_revision, created_at_ms, decided_at_ms)
         VALUES ('recommendation-plank', 'exercise-plank',
                 'working-target-plank', 'timed_hold', 1, 1, '{}',
                 '{"version":1,"profile":"timed_hold","durationSeconds":45,"perSide":false}',
                 '{"version":1,"profile":"timed_hold","durationSeconds":60,"perSide":false}',
                 'timed_hold', 1, 1, 'pending', 6, 6, 10000, NULL)`,
      );
      await transaction.execute(
        `INSERT INTO pending_effects
          (id, effect_type, payload_version, payload_json, idempotency_key,
           subject_id, expected_revision, status, attempt_count,
           next_attempt_at_ms, claimed_at_ms, lease_expires_at_ms,
           last_error_code, created_at_ms, updated_at_ms)
         VALUES ('effect-plank', 'regenerate_load_reps_recommendation', 1,
                 '{"version":1,"sessionId":"session-plank-completed","sessionRevision":3}',
                 'recommend:session-plank-completed:3',
                 'session-plank-completed', 3, 'pending', 0, 10000,
                 NULL, NULL, NULL, 10000, 10000)`,
      );
    });
    const before = await historyBytes(kernel);

    await expect(migrateCustomExerciseMetricProfile({
      repository,
      input: input(true),
    })).resolves.toEqual({
      outcome: "committed",
      exerciseId: "exercise-plank",
      exerciseRevision: 4,
      metricIdentity: {
        profile: "timed_hold",
        contractVersion: 2,
        exerciseMetricGeneration: 2,
      },
      migratedTargetIds: [
        "working-target-plank",
        "working-target-plank-2",
      ],
      invalidatedRecommendationIds: ["recommendation-plank"],
      invalidatedPolicyIds: ["policy-plank"],
      baselineStatus: "awaiting_comparable_observation",
    });
    await expect(historyBytes(kernel)).resolves.toEqual(before);
    await expect(kernel.queryAll(
      `SELECT metric_profile, metric_contract_version,
              exercise_metric_generation, revision
       FROM exercises
       WHERE id = 'exercise-plank'`,
    )).resolves.toEqual([{
      exercise_metric_generation: 2,
      metric_contract_version: 2,
      metric_profile: "timed_hold",
      revision: 4,
    }]);
    await expect(kernel.queryAll(
      `SELECT id, status
       FROM progression_policies
       WHERE plan_day_exercise_id = 'plan-day-exercise-plank'
       ORDER BY status, id`,
    )).resolves.toEqual([
      expect.objectContaining({
        id: "metric-profile-plank-v2:policy:plan-day-exercise-plank",
        status: "active",
      }),
      expect.objectContaining({ id: "policy-plank", status: "invalidated" }),
    ]);
    await expect(kernel.queryAll(
      `SELECT status FROM progression_recommendations
       WHERE id = 'recommendation-plank'`,
    )).resolves.toEqual([{ status: "invalidated" }]);
    await expect(kernel.queryAll(
      `SELECT status, last_error_code
       FROM pending_effects
       WHERE id = 'effect-plank'`,
    )).resolves.toEqual([{
      last_error_code: "metric_profile_migrated",
      status: "superseded",
    }]);
    await expect(kernel.queryAll(
      `SELECT status FROM exercise_metric_baselines
       WHERE exercise_id = 'exercise-plank'
         AND exercise_metric_generation = 2`,
    )).resolves.toEqual([{
      status: "awaiting_comparable_observation",
    }]);

    await expect(repository.readComparableHistory({
      exerciseId: "exercise-plank",
      identity: input().fromIdentity,
    })).resolves.toHaveLength(1);
    await expect(repository.readComparableHistory({
      exerciseId: "exercise-plank",
      identity: input().toIdentity,
    })).resolves.toEqual([]);
  });

  it("invalidates legacy recommendations before v10 is installed", async () => {
    const { kernel, repository } = await setupRuntime({
      includeOwnedRecommendations: false,
    });
    await kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO progression_recommendations
          (id, exercise_id, plan_working_set_target_id, rule_type,
           rule_version, evidence_version, evidence_json,
           current_target_json, proposed_target_json, metric_profile,
           metric_contract_version, exercise_metric_generation, status,
           source_revision, target_revision, created_at_ms, decided_at_ms)
         VALUES ('recommendation-plank-v9', 'exercise-plank',
                 'working-target-plank', 'timed_hold', 1, 1, '{}',
                 '{"version":1,"profile":"timed_hold","durationSeconds":45,"perSide":false}',
                 '{"version":1,"profile":"timed_hold","durationSeconds":60,"perSide":false}',
                 'timed_hold', 1, 1, 'pending', 6, 6, 10000, NULL)`,
      )
    );

    await expect(migrateCustomExerciseMetricProfile({
      repository,
      input: input(),
    })).resolves.toEqual(expect.objectContaining({
      invalidatedRecommendationIds: ["recommendation-plank-v9"],
    }));
    await expect(kernel.queryAll(
      `SELECT status
       FROM progression_recommendations
       WHERE id = 'recommendation-plank-v9'`,
    )).resolves.toEqual([{ status: "invalidated" }]);
  });

  it("replays the exact committed result without duplicating generation or events", async () => {
    const { kernel, repository } = await setupRuntime();
    const request = input();
    const first = await migrateCustomExerciseMetricProfile({
      repository,
      input: request,
    });

    await expect(migrateCustomExerciseMetricProfile({
      repository,
      input: request,
    })).resolves.toEqual({
      ...first,
      outcome: "already_committed",
    });
    await expect(kernel.queryAll(
      `SELECT exercise_metric_generation FROM exercises
       WHERE id = 'exercise-plank'`,
    )).resolves.toEqual([{ exercise_metric_generation: 2 }]);
    await expect(kernel.queryAll(
      "SELECT COUNT(*) AS count FROM metric_profile_migration_events",
    )).resolves.toEqual([{ count: 1 }]);
  });

  it("rejects idempotency-key reuse with a different validated request", async () => {
    const { repository } = await setupRuntime();
    const request = input();
    await migrateCustomExerciseMetricProfile({
      repository,
      input: request,
    });

    await expect(migrateCustomExerciseMetricProfile({
      repository,
      input: {
        ...request,
        migratedAtMs: request.migratedAtMs + 1,
      },
    })).rejects.toThrow("metric_profile_idempotency_conflict");
  });

  it.each([
    {
      name: "missing exercise",
      mutate: async (kernel: SqliteKernel) => {
        await kernel.write((transaction) => transaction.execute(
          "DELETE FROM exercise_library_entries WHERE exercise_id = 'exercise-plank'",
        ));
      },
      change: (request: MigrateCustomExerciseMetricProfileInput) => ({
        ...request,
        exerciseId: "missing-exercise",
      }),
      error: "metric_profile_exercise_not_found",
    },
    {
      name: "library identity drift",
      mutate: async (kernel: SqliteKernel) => {
        await kernel.write((transaction) => transaction.execute(
          `UPDATE exercise_library_entries
           SET exercise_metric_generation = 2
           WHERE exercise_id = 'exercise-plank'`,
        ));
      },
      change: (request: MigrateCustomExerciseMetricProfileInput) => request,
      error: "metric_profile_identity_conflict",
    },
    {
      name: "incomplete policy occurrence map",
      mutate: async () => undefined,
      change: (request: MigrateCustomExerciseMetricProfileInput) => ({
        ...request,
        policyDecisions: [{
          ...request.policyDecisions[0]!,
          planDayExerciseId: "wrong-occurrence",
        }],
      }),
      error: "metric_profile_policy_decision_incomplete",
    },
    {
      name: "stale policy revision",
      mutate: async () => undefined,
      change: (request: MigrateCustomExerciseMetricProfileInput) => ({
        ...request,
        policyDecisions: [{
          ...request.policyDecisions[0]!,
          expectedPolicyRevision: 3,
        }],
      }),
      error: "metric_profile_policy_revision_conflict",
    },
  ])("rejects $name before writes", async ({ mutate, change, error }) => {
    const { kernel, repository } = await setupRuntime();
    await mutate(kernel);

    await expect(migrateCustomExerciseMetricProfile({
      repository,
      input: change(input()),
    })).rejects.toThrow(error);
  });

  it("creates an explicit new policy when the occurrence had none", async () => {
    const { kernel, repository } = await setupRuntime();
    await kernel.write((transaction) => transaction.execute(
      "DELETE FROM progression_policies WHERE id = 'policy-plank'",
    ));
    const request = input();

    await expect(migrateCustomExerciseMetricProfile({
      repository,
      input: {
        ...request,
        policyDecisions: [{
          ...request.policyDecisions[0]!,
          expectedPolicyRevision: null,
        }],
      },
    })).resolves.toEqual(expect.objectContaining({
      invalidatedPolicyIds: [],
      outcome: "committed",
    }));
  });

  it("defends the repository port against non-monotonic or unserializable callers", async () => {
    const { repository } = await setupRuntime();
    const request = input();
    await expect(repository.migrateCustomExerciseMetricProfile({
      ...request,
      toIdentity: {
        ...request.toIdentity,
        exerciseMetricGeneration: 3,
      },
    })).rejects.toThrow("metric_profile_generation_invalid");
    await expect(repository.migrateCustomExerciseMetricProfile({
      ...request,
      replacements: [{
        ...request.replacements[0]!,
        unit: {
          toJSON: () => undefined,
        },
      }],
    })).rejects.toThrow("metric_profile_replacement_invalid");
    await expect(repository.migrateCustomExerciseMetricProfile({
      ...request,
      policyDecisions: [
        {
          planDayExerciseId: "z-occurrence",
          expectedPolicyRevision: null,
          policy: {
            kind: "metric",
            profile: "timed_hold",
            version: 2,
            rule: {
              version: 2,
              progression: "manual",
            },
          },
        },
        {
          planDayExerciseId: "a-occurrence",
          expectedPolicyRevision: null,
          policy: {
            kind: "manual_hold",
            version: 1,
          },
        },
      ],
    })).rejects.toThrow("metric_profile_policy_decision_incomplete");
  });

  it("rejects unsupported complete identities on history reads", async () => {
    const { repository } = await setupRuntime();
    await expect(repository.readComparableHistory({
      exerciseId: "exercise-plank",
      identity: {
        profile: "timed_hold",
        contractVersion: 99,
        exerciseMetricGeneration: 1,
      },
    })).rejects.toThrow("metric_identity_unsupported");
  });

  it.each(ROLLBACK_CASES)(
    "rolls back $name",
    async ({ change, error, secondTarget }) => {
    const { kernel, repository } = await setupRuntime({ secondTarget });
    const before = await kernel.queryAll(
      "SELECT * FROM exercises WHERE id = 'exercise-plank'",
    );

    await expect(migrateCustomExerciseMetricProfile({
      repository,
      input: change(input(secondTarget)),
    })).rejects.toThrow(error);
    await expect(kernel.queryAll(
      "SELECT * FROM exercises WHERE id = 'exercise-plank'",
    )).resolves.toEqual(before);
    await expect(kernel.queryAll(
      "SELECT COUNT(*) AS count FROM metric_profile_migration_events",
    )).resolves.toEqual([{ count: 0 }]);
    },
  );

  it("rejects bundled authority before any future-target write", async () => {
    const { repository } = await setupRuntime();
    const request = input();

    await expect(migrateCustomExerciseMetricProfile({
      repository,
      input: {
        ...request,
        exerciseId: "exercise-squat",
        expectedExerciseRevision: 2,
        fromIdentity: {
          profile: "load_reps",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
        toIdentity: {
          profile: "unscored",
          contractVersion: 1,
          exerciseMetricGeneration: 2,
        },
        replacements: [{
          targetId: "working-target-1",
          expectedTargetRevision: 7,
          target: {
            version: 1,
            profile: "unscored",
            completionRequired: true,
          },
          unit: {
            version: 1,
            completion: "boolean",
          },
        }],
        policyDecisions: [{
          planDayExerciseId: "plan-day-exercise-squat",
          expectedPolicyRevision: 1,
          policy: {
            kind: "manual_hold",
            version: 1,
          },
        }],
        idempotencyKey: "metric-profile-squat-unscored",
      },
    })).rejects.toThrow("metric_profile_custom_required");
  });

  it("blocks while any in-progress workout references the exercise", async () => {
    const { kernel, repository } = await setupRuntime();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO session_exercises
          (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
           exercise_name, metric_profile, metric_contract_version,
           exercise_metric_generation, default_rest_seconds, target_revision,
           status, revision, effort, effort_recorded_at_ms)
         VALUES ('session-active-plank', 'session-active',
                 'plan-day-exercise-plank', 'exercise-plank', 1, 'Plank',
                 'timed_hold', 1, 1, 60, 6, 'planned', 1, NULL, NULL)`,
      );
    });

    await expect(migrateCustomExerciseMetricProfile({
      repository,
      input: input(),
    })).rejects.toThrow("metric_profile_active_workout");
  });

  it("rolls back source, targets, policy, baseline, and event when commit fails", async () => {
    const { kernel, repository } = await setupRuntime({ failCommit: true });
    const before = {
      exercise: await kernel.queryAll(
        "SELECT * FROM exercises WHERE id = 'exercise-plank'",
      ),
      target: await kernel.queryAll(
        `SELECT * FROM plan_working_set_targets
         WHERE id = 'working-target-plank'`,
      ),
      policy: await kernel.queryAll(
        `SELECT * FROM progression_policies
         WHERE id = 'policy-plank'`,
      ),
    };

    await expect(migrateCustomExerciseMetricProfile({
      repository,
      input: input(),
    })).rejects.toThrow("sqlite_commit_failed");
    await expect(kernel.queryAll(
      "SELECT * FROM exercises WHERE id = 'exercise-plank'",
    )).resolves.toEqual(before.exercise);
    await expect(kernel.queryAll(
      `SELECT * FROM plan_working_set_targets
       WHERE id = 'working-target-plank'`,
    )).resolves.toEqual(before.target);
    await expect(kernel.queryAll(
      `SELECT * FROM progression_policies
       WHERE id = 'policy-plank'`,
    )).resolves.toEqual(before.policy);
    await expect(kernel.queryAll(
      "SELECT COUNT(*) AS count FROM metric_profile_migration_events",
    )).resolves.toEqual([{ count: 0 }]);
    await expect(kernel.queryAll(
      "SELECT COUNT(*) AS count FROM exercise_metric_baselines",
    )).resolves.toEqual([{ count: 0 }]);
  });
});
