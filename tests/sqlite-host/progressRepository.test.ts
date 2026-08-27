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
  createSqliteKernel,
  type SqliteKernel,
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
      ['set-1', 'session-1', '2026-08-20', 2, 8],
      ['set-2', 'session-2', '2026-08-22', 3, 10],
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
     VALUES (?, 'review-exercise', 'review-target', ?, 1, ?, ?, ?, ?,
             'load_reps', 1, 1, ?, 1, 1, 10, ?)`,
    [
      input.id,
      input.ruleType ?? "load_reps",
      input.evidenceVersion ?? 2,
      input.evidenceJson ?? actionableEvidence({ targetId: "review-target" }),
      target,
      proposedTarget,
      input.status ?? "pending",
      input.decidedAtMs ?? null,
    ],
  ));
}

describe("progress repository", () => {
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
            },
            workingSets: {
              sessionIds: ["session-1", "session-2"],
              exerciseIds: ["bench-press"],
            },
            exerciseStatuses: {
              sessionIds: ["session-1", "session-2"],
              exerciseIds: ["bench-press"],
            },
          }),
        }),
        stateSourceReferences: {
          sessionIds: ["session-1", "session-2"],
          exerciseIds: ["bench-press"],
        },
        records: [expect.objectContaining({
          sessionId: "session-2",
          setId: "set-2",
        })],
      }),
    }));
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
});
