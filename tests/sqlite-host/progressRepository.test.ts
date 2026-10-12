import {
  afterEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import {
  createMigrationRunner,
} from "../../src/platform/sqlite/migrationRunner";
import {
  migrations,
} from "../../src/platform/sqlite/migrations";
import type {
  RecoveryBackupPort,
} from "../../src/platform/sqlite/recoveryBackup";
import {
  createProgressRepository,
} from "../../src/platform/sqlite/repositories/progressRepository";
import {
  createWorkoutOutcomeRepository,
} from "../../src/platform/sqlite/repositories/workoutOutcomeRepository";
import {
  createRunningPlanRepository,
} from "../../src/platform/sqlite/repositories/runningPlanRepository";
import type {
  ProgressPeriod,
} from "../../src/domains/progress";
import {
  createSqliteKernel,
  type SqliteKernel,
  type SqliteSnapshotKernel,
  type SqliteTransactionExecutor,
} from "../../src/platform/sqlite/sqliteKernel";

class Result<Row extends Record<string, unknown>>
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

class Statement implements SqlitePreparedStatement {
  constructor(
    private readonly statement: ReturnType<DatabaseSync["prepare"]>,
  ) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly (null | number | string | Uint8Array)[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    }
    const result = this.statement.run(...parameters);
    return new Result(
      Number(result.changes),
      Number(result.lastInsertRowid),
      [],
    );
  }

  async finalizeAsync(): Promise<void> {}
}

class Connection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new Statement(this.database.prepare(sql));
  }

  async isInTransactionAsync(): Promise<boolean> {
    return this.database.isTransaction;
  }

  async closeAsync(): Promise<void> {
    this.database.close();
  }
}

const directories = new Set<string>();
const kernels: SqliteKernel[] = [];

afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of directories) {
    rmSync(directory, { force: true, recursive: true });
  }
  directories.clear();
});

async function open(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-progress-"));
  directories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  const recoveryBackup: RecoveryBackupPort = {
    createAndValidate: async (request) => ({
      backupId: "progress",
      databaseName: request.databaseName,
      fromVersion: request.fromVersion,
      toVersion: request.toVersion,
      validated: true,
    }),
  };
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations,
    recoveryBackup,
  }).run();
  kernels.push(kernel);
  return kernel;
}

const ALL_PERIOD_SUBJECT_ID = 'history-subject/v1:["period","all"]';
const BENCH_METRIC_SUBJECT_ID =
  'history-subject/v1:["exercise_metric","bench-press","load_reps:1:1","identity"]';

const target = JSON.stringify({
  version: 1,
  profile: "load_reps",
  loadGrams: 40_000,
  minReps: 8,
  maxReps: 10,
  incrementGrams: 2_500,
  perSide: false,
});

const proposedTarget = JSON.stringify({
  version: 1,
  profile: "load_reps",
  loadGrams: 42_500,
  minReps: 6,
  maxReps: 8,
  targetReps: [8, 8, 8],
  incrementGrams: 2_500,
  perSide: false,
});

function observation(reps: number): string {
  return JSON.stringify({
    version: 1,
    profile: "load_reps",
    loadGrams: 40_000,
    reps,
    source: "manual",
  });
}

async function seedCurrentProjection(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO workout_sessions
        (id, plan_id, plan_day_id, source, status, local_date, timezone,
         started_at_ms, completed_at_ms, revision,
         creation_timezone_offset_minutes)
       VALUES ('session-1', NULL, NULL, 'manual', 'completed',
               '2026-08-20', 'Asia/Singapore', 1, 2, 1, 480)`,
    );
    await transaction.execute(
      `INSERT INTO workout_sessions
        (id, plan_id, plan_day_id, source, status, local_date, timezone,
         started_at_ms, completed_at_ms, revision,
         creation_timezone_offset_minutes)
       VALUES ('session-2', NULL, NULL, 'manual', 'completed',
               '2026-08-22', 'Asia/Singapore', 2, 3, 1, 480)`,
    );
    await transaction.execute(
      `INSERT INTO exercises
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         metric_profile, metric_contract_version, exercise_metric_generation,
         equipment, default_rest_seconds, revision)
       VALUES ('bench-press', NULL, 'custom', NULL, NULL, 'Bench Press',
               'load_reps', 1, 1, 'Barbell', 90, 1)`,
    );
    for (const [id, sessionId] of [
      ["progress-source-exercise-1", "session-1"],
      ["progress-source-exercise-2", "session-2"],
    ] as const) {
      await transaction.execute(
        `INSERT INTO session_exercises
          (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
           exercise_name, metric_profile, metric_contract_version,
           exercise_metric_generation, default_rest_seconds, target_revision,
           status, revision)
         VALUES (?, ?, NULL, 'bench-press', 0, 'Bench Press',
                 'load_reps', 1, 1, 90, 1, 'completed', 1)`,
        [id, sessionId],
      );
    }
    for (const [id, exerciseId, completedAtMs, reps] of [
      ["progress-source-set-1", "progress-source-exercise-1", 2, 8],
      ["progress-source-set-2", "progress-source-exercise-2", 3, 10],
    ] as const) {
      await transaction.execute(
        `INSERT INTO session_sets
          (id, session_exercise_id, set_kind, ordinal, target_load_grams,
           target_min_reps, target_max_reps, target_json, unit_json,
           rule_type, rule_version, metric_profile, metric_contract_version,
           exercise_metric_generation, observed_json, completed_at_ms, status,
           revision)
         VALUES (?, ?, 'working', 0, 40000, 8, 10, ?,
                 '{"version":1,"load":"grams","count":"repetitions"}',
                 'load_reps', 1, 'load_reps', 1, 1, ?, ?, 'completed', 1)`,
        [id, exerciseId, target, observation(reps), completedAtMs],
      );
    }
    await transaction.execute(
      `INSERT INTO plans
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         days_per_week, audience, goal, estimate_minutes, attribution,
         is_active, revision)
       VALUES ('plan-1', NULL, 'custom', NULL, NULL, 'Plan',
               1, 'Test', 'Progress', 30, 'Test', 0, 1)`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_schedules
        (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms)
       VALUES ('schedule-1', 'plan-1', 'active', 1, 1, NULL)`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_versions
        (id, schedule_id, version_number, effective_local_date, mode, timezone,
         rotation_pointer, created_at_ms)
       VALUES ('schedule-version-1', 'schedule-1', 1, '2026-08-01',
               'rotation', 'Asia/Singapore', 0, 1)`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_opportunities
        (id, schedule_id, schedule_version_id, local_date, source, plan_day_id,
         state, outcome, session_id, revision, consumed_at_ms)
       VALUES
         ('opportunity-complete', 'schedule-1', 'schedule-version-1',
          '2026-08-20', 'rotation', NULL, 'consumed', 'completed',
          'session-1', 1, 2),
         ('opportunity-missed', 'schedule-1', 'schedule-version-1',
          '2026-08-22', 'rotation', NULL, 'consumed', 'planned_not_completed',
          NULL, 1, 3)`,
    );
    for (const subjectId of [ALL_PERIOD_SUBJECT_ID, BENCH_METRIC_SUBJECT_ID]) {
      await transaction.execute(
        `INSERT INTO history_subject_revisions
          (subject_id, revision, updated_at_ms) VALUES (?, 1, 1)`,
        [subjectId],
      );
      await transaction.execute(
        `INSERT INTO history_projection_freshness
          (subject_id, applied_revision, updated_at_ms) VALUES (?, 1, 1)`,
        [subjectId],
      );
    }
    for (const [localDate, completedWorkingSets, plannedWorkingSets] of [
      ['2026-08-20', 1, 1],
      ['2026-08-22', 1, 2],
    ] as const) {
      await transaction.execute(
        `INSERT INTO history_projection_period_inputs
          (subject_id, local_date, completed_exercises, planned_exercises,
           completed_working_sets, planned_working_sets, comparable_exposure_count)
         VALUES (?, ?, 1, 1, ?, ?, 1)`,
        [ALL_PERIOD_SUBJECT_ID, localDate, completedWorkingSets, plannedWorkingSets],
      );
    }
    for (const [setId, sessionId, localDate, completedAtMs, reps] of [
      ['progress-source-set-1', 'session-1', '2026-08-20', 2, 8],
      ['progress-source-set-2', 'session-2', '2026-08-22', 3, 10],
    ] as const) {
      await transaction.execute(
        `INSERT INTO history_projection_comparable_exposures
          (subject_id, exercise_id, identity_key, comparator_key, session_id,
           local_date, set_id, set_ordinal, completed_at_ms, target_json,
           observation_json)
         VALUES (?, 'bench-press', 'load_reps:1:1', 'identity', ?, ?, ?, 0,
                 ?, ?, ?)`,
        [
          BENCH_METRIC_SUBJECT_ID,
          sessionId,
          localDate,
          setId,
          completedAtMs,
          target,
          observation(reps),
        ],
      );
    }
  });
}

async function seedAcceptedRunningActivity(
  kernel: SqliteKernel,
  input: Readonly<{
    id: string;
    aggregateRevision: number;
    lifecycle: "active" | "removed";
    localDate: string;
    startedAtMs: number;
  }>,
): Promise<void> {
  await kernel.write((transaction) => insertAcceptedRunningActivity(transaction, input));
}

async function insertAcceptedRunningActivity(
  transaction: SqliteTransactionExecutor,
  input: Readonly<{
    id: string;
    aggregateRevision: number;
    lifecycle: "active" | "removed";
    localDate: string;
    startedAtMs: number;
  }>,
): Promise<void> {
    await transaction.execute(
      `INSERT INTO imported_activities
        (id, source, source_activity_id, started_at_ms, aggregate_json, imported_at_ms)
       VALUES (?, 'garmin', ?, ?, ?, ?)`,
      [
        input.id,
        `${input.id}-external`,
        input.startedAtMs,
        JSON.stringify({
          confirmed_local_date: input.localDate,
          sample_fidelity: "source_summary",
          normalized: {
            distance_meters: 2_400,
            elapsed_ms: 660_000,
          },
        }),
        input.startedAtMs,
      ],
    );
    await transaction.execute(
      `INSERT INTO imported_activity_identities
        (activity_id, source_kind, account_namespace, external_activity_id,
         aggregate_revision, accepted_normalized_sha256, removal_state)
       VALUES (?, 'garmin_connect_account', 'owner', ?, ?, ?, ?)`,
      [
        input.id,
        `${input.id}-external`,
        input.aggregateRevision,
        "a".repeat(64),
        input.lifecycle,
      ],
    );
    await transaction.execute(
      `INSERT INTO imported_activity_events
        (id, activity_id, aggregate_revision, event_type, payload_json, created_at_ms)
       VALUES (?, ?, ?, ?, '{}', ?)`,
      [
        `${input.id}-event`,
        input.id,
        input.aggregateRevision,
        input.lifecycle === "active" ? "imported" : "removed",
        input.startedAtMs,
      ],
    );
    await transaction.execute(
      `INSERT INTO imported_activity_current_lifecycle
        (activity_id, aggregate_revision, removal_state, lifecycle_event_id)
       VALUES (?, ?, ?, ?)`,
      [input.id, input.aggregateRevision, input.lifecycle, `${input.id}-event`],
    );
}

async function seedRecommendationGraph(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO exercises
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         metric_profile, metric_contract_version, exercise_metric_generation,
         equipment, default_rest_seconds, revision)
       VALUES ('review-exercise', NULL, 'custom', NULL, NULL, 'Review exercise',
               'load_reps', 1, 1, 'Barbell', 90, 1)`,
    );
    await transaction.execute(
      `INSERT INTO plans
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         days_per_week, audience, goal, estimate_minutes, attribution,
         is_active, revision)
       VALUES ('review-plan', NULL, 'custom', NULL, NULL, 'Review plan',
               1, 'Owner', 'Strength', 30, 'Owner', 0, 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
       VALUES ('review-day', 'review-plan', 0, 'Review day', 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_day_exercises
        (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds,
         metric_profile, metric_contract_version, exercise_metric_generation, revision)
       VALUES ('review-occurrence', 'review-day', 'review-exercise', 0,
               90, 'load_reps', 1, 1, 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps,
         target_json, unit_json, metric_profile, metric_contract_version,
         exercise_metric_generation, revision)
       VALUES ('review-target', 'review-occurrence', 0, 40000, 8, 10, ?,
               '{"version":1,"load":"grams","count":"repetitions"}',
               'load_reps', 1, 1, 1)`,
      [target],
    );
    await transaction.execute(
      `INSERT INTO workout_sessions
        (id, plan_id, plan_day_id, source, status, local_date, timezone,
         started_at_ms, completed_at_ms, revision,
         creation_timezone_offset_minutes)
       VALUES ('source-session-1', NULL, NULL, 'manual', 'completed',
               '2026-08-24', 'Asia/Singapore', 1, 2, 1, 480)`,
    );
    await transaction.execute(
      `INSERT INTO session_exercises
        (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
         exercise_name, metric_profile, metric_contract_version,
         exercise_metric_generation, default_rest_seconds, target_revision,
         status, revision)
       VALUES ('source-exercise-1', 'source-session-1', NULL,
               'review-exercise', 0, 'Review exercise', 'load_reps', 1, 1,
               90, 1, 'completed', 1)`,
    );
    await transaction.execute(
      `INSERT INTO session_sets
        (id, session_exercise_id, set_kind, ordinal,
         source_plan_working_set_target_id, target_load_grams,
         target_min_reps, target_max_reps, target_json, unit_json,
         rule_type, rule_version, metric_profile, metric_contract_version,
         exercise_metric_generation, observed_json, completed_at_ms, status,
         revision)
       VALUES ('source-set-1', 'source-exercise-1', 'working', 0,
               'review-target', 40000, 8, 10, ?,
               '{"version":1,"load":"grams","count":"repetitions"}',
               'load_reps', 1, 'load_reps', 1, 1,
               '{"version":1,"profile":"load_reps","loadGrams":40000,"reps":10,"source":"manual"}',
               2, 'completed', 1)`,
      [target],
    );
  });
}

function actionableEvidence(input: Readonly<{
  targetId: string;
  sourceSessionId?: string;
}>): string {
  return JSON.stringify({
    version: 2,
    rule: { id: "load_reps.double_progression.v1", version: 1 },
    metricIdentity: {
      profile: "load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    source: {
      sessionId: input.sourceSessionId ?? "source-session-1",
      sessionExerciseId: "source-exercise-1",
      sessionRevision: 1,
      setIds: ["source-set-1"],
    },
    revisions: { source: 1, target: 1 },
    targetScope: [{ id: input.targetId, revision: 1 }],
    currentTarget: JSON.parse(target),
    proposedTarget: JSON.parse(proposedTarget),
    decision: "increase",
    reasonCode: "increase_all_qualified_sets_at_upper_bound",
    reason: "All qualifying sets reached the upper bound.",
    confidence: "high",
    lifecycle: { state: "pending", createdAtMs: 10 },
  });
}

async function insertRecommendation(
  kernel: SqliteKernel,
  input: Readonly<{
    id: string;
    targetId?: string;
    evidenceVersion?: number;
    evidenceJson?: string;
    ruleType?: string;
    status?: "pending" | "accepted" | "rejected" | "invalidated" | "superseded";
    decidedAtMs?: number | null;
  }>,
): Promise<void> {
  await kernel.write((transaction) => transaction.execute(
    `INSERT INTO progression_recommendations
      (id, exercise_id, plan_working_set_target_id, rule_type, rule_version,
       evidence_version, evidence_json, current_target_json, proposed_target_json,
       metric_profile, metric_contract_version, exercise_metric_generation,
       status, source_revision, target_revision, created_at_ms, decided_at_ms)
     VALUES (?, 'review-exercise', ?, ?, 1, ?, ?, ?, ?,
             'load_reps', 1, 1, ?, 1, 1, 10, ?)`,
    [
      input.id,
      input.targetId ?? "review-target",
      input.ruleType ?? "load_reps",
      input.evidenceVersion ?? 2,
      input.evidenceJson ?? actionableEvidence({ targetId: input.targetId ?? "review-target" }),
      target,
      proposedTarget,
      input.status ?? "pending",
      input.decidedAtMs ?? null,
    ],
  ));
}

describe("progress repository", () => {
  it("loads a Running dashboard through exactly one source-coherent SQLite snapshot", async () => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    let snapshots = 0;
    const snapshotKernel = {
      ...kernel,
      readSnapshot: async (query: unknown) => {
        snapshots += 1;
        return kernel.readSnapshot!(query as never);
      },
    } as unknown as SqliteSnapshotKernel;

    const result = await createProgressRepository(snapshotKernel).load({
      sport: "Running",
      period: "all_time",
      nowLocalDate: "2026-08-24",
    });

    expect(snapshots).toBe(1);
    expect(result).toMatchObject({
      sport: "Running",
      freshness: "current",
      dashboard: {
        sport: "Running",
        state: "empty",
      },
    });
  });

  it("accepts only the current active imported revision and never exposes a provider payload", async () => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    await seedAcceptedRunningActivity(kernel, {
      id: "accepted-running-2400",
      aggregateRevision: 3,
      lifecycle: "active",
      localDate: "2026-08-24",
      startedAtMs: 100,
    });
    await seedAcceptedRunningActivity(kernel, {
      id: "removed-running-2400",
      aggregateRevision: 4,
      lifecycle: "removed",
      localDate: "2026-08-24",
      startedAtMs: 101,
    });

    const result = await createProgressRepository(kernel).load({
      sport: "Running",
      period: "all_time",
      nowLocalDate: "2026-08-24",
    });

    expect(result).toEqual(expect.objectContaining({
      sport: "Running",
      freshness: "current",
      dashboard: {
        sport: "Running",
        state: "sparse",
        goals: [expect.objectContaining({
          distanceMeters: 2_400,
          latest: expect.objectContaining({
            activityId: "accepted-running-2400",
            sourceRevision: 3,
            durationSeconds: 660,
          }),
        })],
      },
    }));
    expect(result).not.toHaveProperty("sourceFacts");
    expect(JSON.stringify(result)).not.toContain("aggregate_json");
    expect(JSON.stringify(result)).not.toContain("removed-running-2400");
  });

  it("scopes Running facts to the selected period and pages All time without dropping the newest fact", async () => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    await seedAcceptedRunningActivity(kernel, {
      id: "old-running-2400",
      aggregateRevision: 1,
      lifecycle: "active",
      localDate: "2026-01-01",
      startedAtMs: 1,
    });
    await kernel.write(async (transaction) => {
      for (let index = 0; index < 501; index += 1) {
        await insertAcceptedRunningActivity(transaction, {
          id: `paged-running-${String(index).padStart(3, "0")}`,
          aggregateRevision: 1,
          lifecycle: "active",
          localDate: index === 500 ? "2026-08-24" : "2026-08-01",
          startedAtMs: index + 10,
        });
      }
    });
    const repository = createProgressRepository(kernel);

    const fourWeeks = await repository.load({
      sport: "Running",
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
    });
    const allTime = await repository.load({
      sport: "Running",
      period: "all_time",
      nowLocalDate: "2026-08-24",
    });

    expect(fourWeeks.dashboard).toMatchObject({
      goals: [{
        evidenceCount: 501,
        latest: { activityId: "paged-running-500" },
      }],
    });
    expect(allTime.dashboard).toMatchObject({
      goals: [{
        evidenceCount: 502,
        latest: { activityId: "paged-running-500" },
      }],
    });
  });

  it("returns the active Running target source from the same coherent snapshot", async () => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    await createRunningPlanRepository(kernel).createInactiveAggregate({
      requestId: "create-active-progress-running",
      requestSha256: "a".repeat(64),
      plan: {
        version: 1,
        id: "active-progress-running",
        name: "Active Progress Running",
        revision: 1,
        createdAtMs: 1,
        goal: {
          version: 1,
          id: "active-progress-running-goal",
          planId: "active-progress-running",
          revision: 1,
          goalDistanceMeters: 2_400,
          targetDurationMs: 660_000,
          trainingDays: ["Monday"],
          createdAtMs: 1,
        },
        sessions: [],
      },
    });
    await kernel.write(async (transaction) => {
      await transaction.execute(
        "UPDATE plans SET is_active = 1 WHERE id = 'active-progress-running'",
      );
      await transaction.execute(
        "UPDATE owned_plan_schedules SET lifecycle = 'active', deactivated_at_ms = NULL WHERE plan_id = 'active-progress-running'",
      );
    });
    let snapshots = 0;
    const snapshotKernel = {
      ...kernel,
      readSnapshot: async (query: unknown) => {
        snapshots += 1;
        return kernel.readSnapshot!(query as never);
      },
    } as unknown as SqliteSnapshotKernel;

    const result = await createProgressRepository(snapshotKernel).load({
      sport: "Running",
      period: "all_time",
      nowLocalDate: "2026-08-24",
    });

    expect(snapshots).toBe(1);
    expect(result.runningTargetSources).toEqual([
      expect.objectContaining({
        id: "active-progress-running",
        active: true,
        lifecycle: "active",
        goal: expect.objectContaining({
          goalDistanceMeters: 2_400,
          targetDurationMs: 660_000,
        }),
      }),
    ]);
  });

  const progressRanges: ReadonlyArray<readonly [ProgressPeriod, string | null]> = [
    ["4_weeks", "2026-07-28"],
    ["12_weeks", "2026-06-02"],
    ["all_time", null],
  ];

  it.each(progressRanges)("binds %s date predicates before materializing Progress rows", async (...[period, expectedStart]) => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    const queries: Array<Readonly<{ sql: string; parameters: readonly unknown[] }>> = [];
    const snapshotKernel = {
      ...kernel,
      readSnapshot: async (query: unknown) => kernel.readSnapshot!(async (transaction) =>
        (query as (executor: typeof transaction) => Promise<unknown>)({
          queryAll: async <Row extends Record<string, unknown>>(
            sql: string,
            parameters: readonly (null | number | string | Uint8Array)[] = [],
          ) => {
            queries.push({ sql, parameters });
            return transaction.queryAll<Row>(sql, parameters);
          },
        }),
      ),
    } as unknown as SqliteSnapshotKernel;

    await createProgressRepository(snapshotKernel).load({
      sport: "All",
      period,
      nowLocalDate: "2026-08-24",
    });

    const boundedRows = queries.filter(({ sql }) =>
      sql.includes("history_projection_period_inputs")
      || sql.includes("history_projection_comparable_exposures")
      || sql.includes("owned_plan_schedule_opportunities")
      || sql.includes("FROM imported_activities activity")
        && sql.includes("identity.aggregate_revision = lifecycle.aggregate_revision")
    );
    expect(boundedRows).toHaveLength(4);
    for (const { sql, parameters } of boundedRows) {
      expect(sql).toMatch(/(?:local_date|confirmed_local_date'\)) >= \?/u);
      expect(parameters).toContain(expectedStart);
    }
    expect(queries.some(({ sql }) => /INSERT|UPDATE|DELETE/u.test(sql))).toBe(false);
  });

  it("reads only current all-period and metric projections with persisted opportunities", async () => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    const repository = createProgressRepository(kernel);

    await expect(repository.load({
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
    })).resolves.toEqual(expect.objectContaining({
      freshness: "current",
      projection: expect.objectContaining({
        state: "current",
        summary: expect.objectContaining({
          scheduledOpportunities: { completed: 1, planned: 2 },
          workingSets: { completed: 2, planned: 3 },
          sourceReferences: expect.objectContaining({
            scheduledOpportunities: {
              sessionIds: ["session-1"],
              exerciseIds: [],
              exercises: [],
            },
            workingSets: {
              sessionIds: ["session-1", "session-2"],
              exerciseIds: ["bench-press"],
              exercises: [{
                exerciseId: "bench-press",
                exerciseName: "Bench Press",
              }],
            },
            exerciseStatuses: {
              sessionIds: ["session-1", "session-2"],
              exerciseIds: ["bench-press"],
              exercises: [{
                exerciseId: "bench-press",
                exerciseName: "Bench Press",
              }],
            },
          }),
        }),
        stateSourceReferences: {
          sessionIds: ["session-1", "session-2"],
          exerciseIds: ["bench-press"],
          exercises: [{
            exerciseId: "bench-press",
            exerciseName: "Bench Press",
          }],
        },
        records: [expect.objectContaining({
          exerciseName: "Bench Press",
          sessionId: "session-2",
          setId: "progress-source-set-2",
        })],
        exercises: [expect.objectContaining({
          exerciseName: "Bench Press",
          sessionId: "session-2",
          setId: "progress-source-set-2",
        })],
      }),
    }));
  });

  it("uses the immutable workout name instead of a renamed exercise catalog row", async () => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    await kernel.write((transaction) => transaction.execute(
      `UPDATE exercises SET name = 'Current catalog rename' WHERE id = 'bench-press'`,
    ));
    const repository = createProgressRepository(kernel);

    const result = await repository.load({
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
    });

    expect(result.projection?.records[0]?.exerciseName).toBe("Bench Press");
    expect(result.projection?.exercises[0]?.exerciseName).toBe("Bench Press");
  });

  it("fails closed to Updating when the all-period projection is behind source revision", async () => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    const repository = createProgressRepository(kernel);
    await kernel.write((transaction) => transaction.execute(
      `UPDATE history_subject_revisions
       SET revision = 2, updated_at_ms = 2
       WHERE subject_id = ?`,
      [ALL_PERIOD_SUBJECT_ID],
    ));
    await kernel.write((transaction) => transaction.execute(
      `INSERT INTO history_rebuild_effects
        (id, subject_id, expected_revision, payload_version, payload_json,
         status, attempt_count, next_attempt_at_ms, claimed_at_ms,
         lease_expires_at_ms, last_error_code, created_at_ms, updated_at_ms)
       VALUES ('pending-all-period-rebuild', ?, 2, 1,
               '{"type":"rebuild_history_subject","version":1}',
               'pending', 0, 2, NULL, NULL, NULL, 2, 2)`,
      [ALL_PERIOD_SUBJECT_ID],
    ));

    await expect(repository.load({
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
    })).resolves.toEqual({
      period: "4_weeks",
      freshness: "updating",
      projection: null,
      diagnostic: {
        code: "history_projection_updating",
        affectedSubjects: ["all_period"],
      },
    });
  });

  it("suppresses old metric facts with a rebuild diagnostic that never leaks source rows", async () => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    const repository = createProgressRepository(kernel);
    await kernel.write((transaction) => transaction.execute(
      `UPDATE history_subject_revisions
       SET revision = 2, updated_at_ms = 2
       WHERE subject_id = ?`,
      [BENCH_METRIC_SUBJECT_ID],
    ));
    await kernel.write((transaction) => transaction.execute(
      `INSERT INTO history_rebuild_effects
        (id, subject_id, expected_revision, payload_version, payload_json,
         status, attempt_count, next_attempt_at_ms, claimed_at_ms,
         lease_expires_at_ms, last_error_code, created_at_ms, updated_at_ms)
       VALUES ('pending-metric-rebuild', ?, 2, 1,
               '{"type":"rebuild_history_subject","version":1}',
               'pending', 0, 2, NULL, NULL, NULL, 2, 2)`,
      [BENCH_METRIC_SUBJECT_ID],
    ));

    const result = await repository.load({
      period: "all_time",
      nowLocalDate: "2026-08-24",
    });

    expect(result).toEqual({
      period: "all_time",
      freshness: "updating",
      projection: null,
      diagnostic: {
        code: "history_projection_updating",
        affectedSubjects: ["exercise_metric"],
      },
    });
    expect(JSON.stringify(result.diagnostic)).not.toContain("bench-press");
    expect(JSON.stringify(result.diagnostic)).not.toContain("session-2");
  });

  it("reports every coarse category when all required projections are behind", async () => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    const repository = createProgressRepository(kernel);
    await kernel.write((transaction) => transaction.execute(
      `UPDATE history_subject_revisions
       SET revision = 2, updated_at_ms = 2
       WHERE subject_id IN (?, ?)`,
      [ALL_PERIOD_SUBJECT_ID, BENCH_METRIC_SUBJECT_ID],
    ));
    await kernel.write(async (transaction) => {
      for (const [id, subjectId] of [
        ["pending-all-period-rebuild", ALL_PERIOD_SUBJECT_ID],
        ["pending-metric-rebuild", BENCH_METRIC_SUBJECT_ID],
      ] as const) {
        await transaction.execute(
          `INSERT INTO history_rebuild_effects
            (id, subject_id, expected_revision, payload_version, payload_json,
             status, attempt_count, next_attempt_at_ms, claimed_at_ms,
             lease_expires_at_ms, last_error_code, created_at_ms, updated_at_ms)
           VALUES (?, ?, 2, 1,
                   '{"type":"rebuild_history_subject","version":1}',
                   'pending', 0, 2, NULL, NULL, NULL, 2, 2)`,
          [id, subjectId],
        );
      }
    });

    const result = await repository.load({
      period: "all_time",
      nowLocalDate: "2026-08-24",
    });

    expect(result).toEqual({
      period: "all_time",
      freshness: "updating",
      projection: null,
      diagnostic: {
        code: "history_projection_updating",
        affectedSubjects: ["all_period", "exercise_metric"],
      },
    });
    expect(JSON.stringify(result.diagnostic)).not.toContain("bench-press");
    expect(JSON.stringify(result.diagnostic)).not.toContain("session-2");
  });

  it("stops automatic updating when a stale projection has no live rebuild work", async () => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    const repository = createProgressRepository(kernel);
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE history_subject_revisions
         SET revision = 2, updated_at_ms = 2
         WHERE subject_id = ?`,
        [ALL_PERIOD_SUBJECT_ID],
      );
      await transaction.execute(
        `INSERT INTO history_rebuild_effects
          (id, subject_id, expected_revision, payload_version, payload_json,
           status, attempt_count, next_attempt_at_ms, claimed_at_ms,
           lease_expires_at_ms, last_error_code, created_at_ms, updated_at_ms)
         VALUES ('failed-progress-rebuild', ?, 2, 1,
                 '{"type":"rebuild_history_subject","version":1}',
                 'permanent_failure', 5, 2, NULL, NULL,
                 'history_projection_effect_failed', 2, 2)`,
        [ALL_PERIOD_SUBJECT_ID],
      );
    });

    await expect(repository.load({
      sport: "Running",
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
    })).resolves.toEqual({
      sport: "Running",
      period: "4_weeks",
      freshness: "unavailable",
      projection: null,
      dashboard: null,
      refresh: {
        generation: 2,
        automaticRefresh: {
          maxAttempts: 3,
          backoffMs: [250, 1_000, 4_000],
          terminal: "unavailable",
        },
      },
      diagnostic: {
        code: "history_projection_unavailable",
        affectedSubjects: ["all_period"],
      },
    });
  });

  it("fails closed with a coarse unavailable diagnostic when the all-period revision disappears", async () => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    const repository = createProgressRepository(kernel);
    await kernel.write((transaction) => transaction.execute(
      `DELETE FROM history_subject_revisions WHERE subject_id = ?`,
      [ALL_PERIOD_SUBJECT_ID],
    ));

    await expect(repository.load({
      period: "12_weeks",
      nowLocalDate: "2026-08-24",
    })).resolves.toEqual({
      period: "12_weeks",
      freshness: "unavailable",
      projection: null,
      diagnostic: {
        code: "history_projection_unavailable",
        affectedSubjects: ["all_period"],
      },
    });
  });

  it("reads validated pending recommendation evidence and derives a source-backed attention item", async () => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    await seedRecommendationGraph(kernel);
    await insertRecommendation(kernel, { id: "review-valid" });
    const repository = createProgressRepository(kernel);

    const result = await repository.load({
      period: "all_time",
      nowLocalDate: "2026-08-24",
    });

    expect(result.projection?.recommendations).toEqual([expect.objectContaining({
      id: "review-valid",
      exerciseId: "review-exercise",
      exerciseName: "Review exercise",
      sourceSessionId: "source-session-1",
      lifecycle: "pending",
      currentTarget: JSON.parse(target),
      proposedTarget: JSON.parse(proposedTarget),
    })]);
    expect(result.projection?.attention).toEqual([{
      id: "review-valid",
      exerciseId: "review-exercise",
      exerciseName: "Review exercise",
      sessionId: "source-session-1",
    }]);
  });

  it.each([
    ["legacy evidence", { evidenceVersion: 1 }],
    ["a non-load rule", { evidenceVersion: 1, ruleType: "timed_hold" }],
    ["incomplete historical evidence", {
      evidenceJson: JSON.stringify({ version: 2 }),
      status: "accepted" as const,
      decidedAtMs: 11,
    }],
  ])("excludes %s from review and attention facts", async (_label, options) => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    await seedRecommendationGraph(kernel);
    await insertRecommendation(kernel, { id: "review-invalid", ...options });
    const repository = createProgressRepository(kernel);

    const result = await repository.load({
      period: "all_time",
      nowLocalDate: "2026-08-24",
    });

    expect(result.projection?.recommendations).toEqual([]);
    expect(result.projection?.attention).toEqual([]);
  });

  it("keeps a valid historical decision while reserving attention for pending reviews", async () => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    await seedRecommendationGraph(kernel);
    await insertRecommendation(kernel, {
      id: "review-accepted",
      status: "accepted",
      decidedAtMs: 11,
    });
    const repository = createProgressRepository(kernel);

    const result = await repository.load({
      period: "all_time",
      nowLocalDate: "2026-08-24",
    });

    expect(result.projection?.recommendations).toEqual([expect.objectContaining({
      id: "review-accepted",
      lifecycle: "accepted",
    })]);
    expect(result.projection?.attention).toEqual([]);
  });

  it("retains accepted review history after the real decision advances its live target revision", async () => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    await seedRecommendationGraph(kernel);
    await insertRecommendation(kernel, { id: "review-accepted-after-decision" });
    const outcomes = createWorkoutOutcomeRepository(kernel);

    await expect(outcomes.acceptRecommendation({
      recommendationId: "review-accepted-after-decision",
      decidedAtMs: 11,
    })).resolves.toEqual({
      recommendationId: "review-accepted-after-decision",
      status: "accepted",
    });

    await expect(createProgressRepository(kernel).load({
      period: "all_time",
      nowLocalDate: "2026-08-24",
    })).resolves.toMatchObject({
      freshness: "current",
      projection: {
        attention: [],
        recommendations: [expect.objectContaining({
          id: "review-accepted-after-decision",
          lifecycle: "accepted",
        })],
      },
    });
  });

  it("rejects malformed or unbound evidence while sorting only independently validated reviews", async () => {
    const kernel = await open();
    await seedCurrentProjection(kernel);
    await seedRecommendationGraph(kernel);
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO exercises
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           metric_profile, metric_contract_version, exercise_metric_generation,
           equipment, default_rest_seconds, revision)
         VALUES ('review-exercise-second', NULL, 'custom', NULL, NULL,
                 'Review exercise', 'load_reps', 1, 1, 'Barbell', 90, 1)`,
      );
      await transaction.execute(
        `INSERT INTO plan_day_exercises
          (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds,
           metric_profile, metric_contract_version, exercise_metric_generation, revision)
         VALUES ('review-occurrence-second', 'review-day', 'review-exercise-second', 1,
                 90, 'load_reps', 1, 1, 1)`,
      );
      await transaction.execute(
        `INSERT INTO plan_working_set_targets
          (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps,
           target_json, unit_json, metric_profile, metric_contract_version,
           exercise_metric_generation, revision)
         VALUES ('review-target-second', 'review-occurrence-second', 0,
                 40000, 8, 10, ?,
                 '{"version":1,"load":"grams","count":"repetitions"}',
                 'load_reps', 1, 1, 1)`,
        [target],
      );
    });
    await insertRecommendation(kernel, { id: "review-zebra" });
    await insertRecommendation(kernel, {
      id: "review-alpha",
      targetId: "review-target-second",
    });
    await insertRecommendation(kernel, {
      id: "review-historical-unbound",
      status: "accepted",
      decidedAtMs: 11,
      evidenceJson: JSON.stringify({
        ...JSON.parse(actionableEvidence({ targetId: "review-target" })),
        revisions: { source: 1, target: "not-a-revision" },
      }),
    });

    const result = await createProgressRepository(kernel).load({
      period: "all_time",
      nowLocalDate: "2026-08-24",
    });

    expect(result.projection?.recommendations.map(({ id }) => id)).toEqual([
      "review-alpha",
      "review-zebra",
    ]);
    expect(result.projection?.attention.map(({ id }) => id)).toEqual([
      "review-alpha",
      "review-zebra",
    ]);
  });

  it("keeps source facts unavailable when persisted imported data is structurally unusable", async () => {
    const kernel = await open();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO imported_activities
          (id, source, source_activity_id, started_at_ms, aggregate_json, imported_at_ms)
         VALUES ('malformed-progress-activity', 'test', 'malformed', 1, '[]', 1)`,
      );
      await transaction.execute(
        `INSERT INTO imported_activity_identities
          (activity_id, source_kind, account_namespace, external_activity_id,
           aggregate_revision, accepted_normalized_sha256, removal_state)
         VALUES ('malformed-progress-activity', 'garmin_connect_account', 'test',
                 'malformed', 1, ?, 'active')`,
        ["a".repeat(64)],
      );
      await transaction.execute(
        `INSERT INTO imported_activity_events
          (id, activity_id, aggregate_revision, event_type, payload_json, created_at_ms)
         VALUES ('malformed-progress-event', 'malformed-progress-activity', 1,
                 'imported', '{}', 1)`,
      );
      await transaction.execute(
        `INSERT INTO imported_activity_current_lifecycle
          (activity_id, aggregate_revision, removal_state, lifecycle_event_id)
         VALUES ('malformed-progress-activity', 1, 'active', 'malformed-progress-event')`,
      );
    });

    const result = await createProgressRepository(kernel).load({
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
    });

    expect(result.sourceFacts).toEqual(expect.objectContaining({
      running: expect.objectContaining({
        kind: "unavailable",
        activityKind: "unavailable",
        activities: [],
      }),
      bodyweight: { kind: "unavailable", entries: [] },
    }));
  });

  it("treats a database with no history subjects as an explicit baseline rather than unavailable analytics", async () => {
    const kernel = await open();
    const repository = createProgressRepository(kernel);

    await expect(repository.load({
      period: "all_time",
      nowLocalDate: "2026-08-24",
    })).resolves.toEqual(expect.objectContaining({
      freshness: "current",
      projection: expect.objectContaining({
        state: "baseline",
        records: [],
        exercises: [],
      }),
    }));
  });

  it("returns the factual current baseline when the candidate lacks toSorted", async () => {
    const kernel = await open();
    const repository = createProgressRepository(kernel);
    const arrayPrototype = Array.prototype as {
      toSorted?: typeof Array.prototype.toSorted;
    };
    const originalToSorted = arrayPrototype.toSorted;
    delete arrayPrototype.toSorted;

    try {
      await expect(repository.load({
        period: "4_weeks",
        nowLocalDate: "2026-08-24",
      })).resolves.toEqual(expect.objectContaining({
        freshness: "current",
        projection: expect.objectContaining({
          state: "baseline",
          records: [],
          exercises: [],
        }),
      }));
      expect(arrayPrototype.toSorted).toBeUndefined();
    } finally {
      Object.defineProperty(arrayPrototype, "toSorted", {
        configurable: true,
        enumerable: false,
        value: originalToSorted,
        writable: true,
      });
    }

    await expect(repository.load({
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
    })).resolves.toEqual(expect.objectContaining({
      freshness: "current",
      projection: expect.objectContaining({
        state: "baseline",
        records: [],
        exercises: [],
      }),
    }));
  });

  it("covers invalid range dates and every accepted/sampled fidelity branch", async () => {
    const kernel = await open();
    await expect(createProgressRepository(kernel).load({
      sport: "Running",
      period: "4_weeks",
      nowLocalDate: "invalid-date",
    })).rejects.toThrow();

    await seedAcceptedRunningActivity(kernel, {
      id: "fidelity-running-2400",
      aggregateRevision: 1,
      lifecycle: "active",
      localDate: "2026-08-24",
      startedAtMs: 200,
    });
    await kernel.write((transaction) => transaction.execute(
      "UPDATE imported_activities SET aggregate_json = ? WHERE id = 'fidelity-running-2400'",
      [JSON.stringify({
        confirmed_local_date: "2026-08-24",
        fidelity_by_channel: { exact_effort_basis: "source_laps" },
        normalized: { distance_meters: 2_400, elapsed_ms: 660_000 },
      })],
    ));
    await expect(createProgressRepository(kernel).load({
      sport: "Running", period: "all_time", nowLocalDate: "2026-08-24",
    })).resolves.toMatchObject({ dashboard: { goals: [{ latest: { evidence: "source_laps" } }] } });

    await kernel.write((transaction) => transaction.execute(
      "UPDATE imported_activities SET aggregate_json = ? WHERE id = 'fidelity-running-2400'",
      [JSON.stringify({
        confirmed_local_date: "2026-08-24",
        fidelity_by_channel: [],
        sample_fidelity: "unknown",
        normalized: { distance_meters: 2_400, elapsed_ms: 660_000 },
      })],
    ));
    await expect(createProgressRepository(kernel).load({
      sport: "Running", period: "all_time", nowLocalDate: "2026-08-24",
    })).resolves.toMatchObject({
      dashboard: { state: "more_data_needed", absenceReason: "exact_effort_evidence_insufficient" },
    });
  });

  it("maps unset, exact, and non-second Running goal durations without fabrication", async () => {
    const kernel = await open();
    const repository = createRunningPlanRepository(kernel);
    for (const [id, duration] of [
      ["unset", undefined],
      ["exact", 660_000],
      ["fractional-second", 660_001],
    ] as const) {
      await repository.createInactiveAggregate({
        requestId: `create-${id}`,
        requestSha256: "a".repeat(64),
        plan: {
          version: 1,
          id: `plan-${id}`,
          name: id,
          revision: 1,
          createdAtMs: 1,
          goal: {
            version: 1,
            id: `goal-${id}`,
            planId: `plan-${id}`,
            revision: 1,
            goalDistanceMeters: id === "exact" ? 2_400 : id === "unset" ? 10_000 : 21_097,
            ...(duration === undefined ? {} : { targetDurationMs: duration }),
            trainingDays: ["Monday"],
            createdAtMs: 1,
          },
          sessions: [],
        },
      });
    }
    await kernel.write(async (transaction) => {
      await transaction.execute(
        "UPDATE plans SET is_active = 1 WHERE id = 'plan-exact'",
      );
      await transaction.execute(
        "UPDATE owned_plan_schedules SET lifecycle = 'active', deactivated_at_ms = NULL WHERE plan_id = 'plan-exact'",
      );
    });
    const result = await createProgressRepository(kernel).load({
      sport: "All", period: "all_time", nowLocalDate: "2026-08-24",
    });
    expect(result.dashboard).toMatchObject({
      sport: "All",
      state: "sparse",
      primaryGoal: {
        sport: "Running",
        goal: {
          distanceMeters: 2_400,
          target: { durationSeconds: 660 },
          latest: null,
        },
      },
    });
  });
});
