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

import fullBodyFoundationAsset from "../../assets/content/full-body-foundation.v1.json";
import {
  parseFullBodyFoundation,
} from "../../src/domains/content";
import {
  activateStarterPlan,
} from "../../src/domains/plans";
import {
  discardWorkout,
  finishCompleted,
  finishPartial,
  resumePartialWorkout,
  saveZeroSetWorkout,
  skipExercise,
} from "../../src/domains/workout/finishWorkout";
import {
  completeSet,
} from "../../src/domains/workout/setCommands";
import {
  createWorkoutOutcomeRepository,
} from "../../src/platform/sqlite/repositories/workoutOutcomeRepository";
import {
  startWorkout,
} from "../../src/domains/workout";
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
import type {
  RecoveryBackupPort,
} from "../../src/platform/sqlite/recoveryBackup";
import {
  createPlansWorkoutRepository,
} from "../../src/platform/sqlite/repositories/plansWorkoutRepository";
import {
  createProgressRepository,
} from "../../src/platform/sqlite/repositories/progressRepository";
import {
  createHistoryProjectionRepository,
} from "../../src/platform/sqlite/repositories/historyProjectionRepository";
import {
  createHistoryCommandRepository,
} from "../../src/platform/sqlite/repositories/historyCommandRepository";
import {
  createHistoryRepository,
  loadEffectiveHistoryProjectionSessions,
} from "../../src/platform/sqlite/repositories/historyRepository";
import {
  createHistoryProjectionEffectRunner,
  createHistoryProjectionEffectStore,
} from "../../src/platform/sqlite/effects/historyProjectionEffects";
import {
  enqueuePendingEffect,
} from "../../src/platform/sqlite/effects/effectStore";
import {
  createWorkoutRepository,
} from "../../src/platform/sqlite/repositories/workoutRepository";
import {
  createSqliteKernel,
  type SqliteKernel,
  type SqliteKernelTestObserver,
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
    parameters: readonly (null | number | string | Uint8Array)[] = [],
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

const directories = new Set<string>();
const kernels: SqliteKernel[] = [];
const recoveryBackup: RecoveryBackupPort = {
  createAndValidate: async (request) => ({
    backupId: "workout-outcomes-" + request.fromVersion + "-" + request.toVersion,
    databaseName: request.databaseName,
    fromVersion: request.fromVersion,
    toVersion: request.toVersion,
    validated: true,
  }),
};

afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of directories) {
    rmSync(directory, { force: true, recursive: true });
  }
  directories.clear();
});

async function createKernel(
  observer: SqliteKernelTestObserver = {},
): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-outcomes-"));
  directories.add(directory);
  const path = join(directory, "gym-tracker.db");
  const writer = new NodeSqliteConnection(new DatabaseSync(path));
  const reader = new NodeSqliteConnection(new DatabaseSync(path));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer }, observer);
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations,
    recoveryBackup,
  }).run();
  kernels.push(kernel);
  return kernel;
}

async function setupPlannedWorkout(
  observer: SqliteKernelTestObserver = {},
) {
  const kernel = await createKernel(observer);
  const plans = createPlansWorkoutRepository(kernel);
  const activation = await activateStarterPlan({
    fixture: parseFullBodyFoundation(fullBodyFoundationAsset),
    repository: plans,
    activatedAtMs: 1_786_853_600_000,
    startLocalDate: "2026-08-17",
    timezone: "Asia/Singapore",
  });
  const session = await startWorkout({
    repository: plans,
    request: {
      mode: "scheduled",
      planId: activation.plan.id,
      planDayId: activation.days[0]!.id,
      localDate: "2026-08-17",
      timezone: "Asia/Singapore",
      startedAtMs: 1_786_853_600_000,
    },
  });
  return {
    kernel,
    repository: createWorkoutOutcomeRepository(kernel),
    session,
  };
}

async function seedPendingRecommendation(
  kernel: SqliteKernel,
  sessionId: string,
  recommendationId: string,
  effectId: string,
): Promise<void> {
  const [target] = await kernel.queryAll<{
    id: string;
    revision: number;
    exercise_id: string;
    metric_profile: string;
    metric_contract_version: number;
    exercise_metric_generation: number;
    target_json: string;
  }>(
    `SELECT target.id, target.revision, occurrence.exercise_id,
            target.metric_profile, target.metric_contract_version,
            target.exercise_metric_generation, target.target_json
     FROM session_sets set_row
     JOIN plan_working_set_targets target
       ON target.id = set_row.source_plan_working_set_target_id
     JOIN plan_day_exercises occurrence
       ON occurrence.id = target.plan_day_exercise_id
     JOIN session_exercises session_exercise
       ON session_exercise.id = set_row.session_exercise_id
     WHERE session_exercise.session_id = ?
       AND set_row.set_kind = 'working'
     ORDER BY session_exercise.ordinal, set_row.ordinal
     LIMIT 1`,
    [sessionId],
  );
  if (target === undefined) throw new Error("test_target_missing");
  const [session] = await kernel.queryAll<{ revision: number }>(
    "SELECT revision FROM workout_sessions WHERE id = ?",
    [sessionId],
  );
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO progression_recommendations
        (id, exercise_id, plan_working_set_target_id, rule_type, rule_version,
         evidence_version, evidence_json, current_target_json, proposed_target_json,
         metric_profile, metric_contract_version, exercise_metric_generation,
         status, source_revision, target_revision, created_at_ms, decided_at_ms)
       VALUES (?, ?, ?, 'load_reps', 1, 1, '{}', ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL)`,
      [
        recommendationId, target.exercise_id, target.id, target.target_json,
        target.target_json, target.metric_profile, target.metric_contract_version,
        target.exercise_metric_generation, session!.revision, target.revision,
        1_786_853_640_000,
      ],
    );
    await enqueuePendingEffect(transaction, {
      id: effectId,
      type: "regenerate_load_reps_recommendation",
      payloadVersion: 1,
      payload: { version: 1, sessionId, sessionRevision: session!.revision },
      idempotencyKey: `recommend:${effectId}`,
      subjectId: sessionId,
      expectedRevision: session!.revision,
      nowMs: 1_786_853_640_000,
    });
  });
}

describe("Plan 01-10 explicit workout outcomes", () => {
  it("finishes completed only when every intended working set is resolved", async () => {
    const { kernel, repository, session } = await setupPlannedWorkout();
    await seedPendingRecommendation(
      kernel,
      session.id,
      "preexisting-completed-recommendation",
      "preexisting-completed-effect",
    );
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE session_sets
         SET status = 'completed',
             observed_load_grams = target_load_grams,
             observed_reps = target_max_reps,
             observed_json = CASE rule_type
               WHEN 'manual_hold' THEN json_object(
                 'version', 1,
                 'profile', 'timed_hold',
                 'durationSeconds', json_extract(target_json, '$.durationSeconds'),
                 'source', 'manual'
               )
               ELSE json_object(
                 'version', 1,
                 'profile', 'load_reps',
                 'loadGrams', target_load_grams,
                 'reps', target_max_reps,
                 'source', 'manual'
               )
             END,
             completed_at_ms = ?,
             revision = revision + 1
         WHERE set_kind = 'working'`,
        [1_786_853_900_000],
      );
      await transaction.execute(
        `UPDATE session_exercises
         SET status = 'completed', revision = revision + 1
         WHERE session_id = ?`,
        [session.id],
      );
    });

    const result = await finishCompleted({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: session.revision,
        endedAtMs: 1_786_854_000_000,
      },
    });

    expect(result.detail).toMatchObject({
      status: "completed",
      durationMs: 400_000,
      exerciseProgress: { completed: 5, planned: 5, percent: 100 },
      workingSetProgress: { completed: 15, planned: 15, percent: 100 },
      resumable: false,
    });
    expect(await kernel.queryAll<{ status: string }>(
      "SELECT status FROM workout_sessions WHERE id = ?",
      [session.id],
    )).toEqual([{ status: "completed" }]);
    await expect(kernel.queryAll<{ status: string; decided_at_ms: number | null }>(
      `SELECT status, decided_at_ms FROM progression_recommendations
       WHERE id = 'preexisting-completed-recommendation'`,
    )).resolves.toEqual([{
      status: "invalidated",
      decided_at_ms: 1_786_854_000_000,
    }]);
    await expect(kernel.queryAll<{ idempotency_key: string; status: string }>(
      `SELECT idempotency_key, status FROM pending_effects
       WHERE effect_type = 'regenerate_load_reps_recommendation'
       ORDER BY idempotency_key`,
    )).resolves.toEqual([
      { idempotency_key: "recommend:preexisting-completed-effect", status: "superseded" },
      { idempotency_key: `recommend:${session.id}:${result.detail.revision}`, status: "pending" },
    ]);
    const projection = createHistoryProjectionRepository(kernel);
    const runner = createHistoryProjectionEffectRunner({
      repository: projection,
      store: createHistoryProjectionEffectStore(kernel),
    });
    const drain = await runner.drain({
      nowMs: 1_786_854_000_100,
      limit: 64,
    });
    expect(drain.claimed).toBeGreaterThan(0);
    expect(drain).toMatchObject({
      completed: drain.claimed,
      permanentFailures: 0,
      retried: 0,
    });
    await expect(createProgressRepository(kernel).load({
      period: "4_weeks",
      nowLocalDate: "2026-08-17",
    })).resolves.toMatchObject({
      freshness: "current",
      projection: {
        exercises: expect.arrayContaining([
          expect.objectContaining({
            exerciseId: "5f140001-7e35-4a6d-9100-000000000001",
          }),
        ]),
        summary: {
          workingSets: { completed: 15, planned: 15 },
        },
      },
    });
  });

  it("requires explicit partial and discard confirmation tokens", async () => {
    const { repository, session } = await setupPlannedWorkout();

    expect(() => finishPartial({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: session.revision,
        confirmation: "keep_training",
        endedAtMs: 1_786_853_700_000,
      },
    })).toThrow("partial_confirmation_required");

    expect(() => discardWorkout({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: session.revision,
        confirmation: "keep_workout",
        endedAtMs: 1_786_853_700_000,
      },
    })).toThrow("discard_confirmation_required");
  });

  it("saves an explicit partial and resumes it through a revision check", async () => {
    const { kernel, repository, session } = await setupPlannedWorkout();
    const partial = await finishPartial({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: session.revision,
        confirmation: "save_partial_workout",
        endedAtMs: 1_786_853_700_000,
      },
    });
    expect(partial.detail).toMatchObject({
      status: "partial",
      resumable: true,
    });
    await expect(createPlansWorkoutRepository(kernel).getTodayView({
      localDate: "2026-08-17",
      weekday: 1,
    })).resolves.toMatchObject({
      state: "saved_partial",
      sessionId: session.id,
      revision: partial.detail.revision,
    });

    const resumed = await resumePartialWorkout({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: partial.detail.revision,
        resumedAtMs: 1_786_853_800_000,
      },
    });
    expect(resumed).toMatchObject({
      status: "in_progress",
      sessionId: session.id,
    });
  });

  it("rebuilds Progress when a partial workout enters and leaves history", async () => {
    const { kernel, repository, session } = await setupPlannedWorkout();
    const workout = createWorkoutRepository(kernel);
    let current = await workout.getActiveWorkout(session.id);
    const sourceTargetId = current.currentExercise.workingSets[0]!.sourceTargetId!;
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO progression_recommendations
          (id, exercise_id, plan_working_set_target_id, rule_type, rule_version,
           evidence_version, evidence_json, current_target_json,
           proposed_target_json, metric_profile, metric_contract_version,
           exercise_metric_generation, status, source_revision, target_revision,
           created_at_ms, decided_at_ms)
         SELECT 'preexisting-progress-recommendation', occurrence.exercise_id,
                target.id, 'load_reps', 1, 1, '{}', target.target_json,
                target.target_json, target.metric_profile,
                target.metric_contract_version,
                target.exercise_metric_generation, 'pending', ?,
                target.revision, ?, NULL
         FROM plan_working_set_targets target
         JOIN plan_day_exercises occurrence
           ON occurrence.id = target.plan_day_exercise_id
         WHERE target.id = ?`,
        [current.revision, 1_786_853_640_000, sourceTargetId],
      );
      await enqueuePendingEffect(transaction, {
        id: "preexisting-progress-effect",
        type: "regenerate_load_reps_recommendation",
        payloadVersion: 1,
        payload: {
          version: 1,
          sessionId: session.id,
          sessionRevision: current.revision,
        },
        idempotencyKey: "recommend:preexisting-progress",
        subjectId: session.id,
        expectedRevision: current.revision,
        nowMs: 1_786_853_640_000,
      });
    });
    for (let index = 0; index < 3; index += 1) {
      const next = current.currentExercise.workingSets.find(
        ({ id }) => id === current.activeSetId,
      )!;
      const completed = await completeSet({
        repository: workout,
        haptics: { committed: async () => undefined },
        invalidate: async () => undefined,
        drainEffects: async () => undefined,
        input: {
          sessionId: session.id,
          setId: next.id,
          expectedSessionRevision: current.revision,
          expectedSetRevision: next.revision,
          completionIdempotencyKey: `progress-partial-set-${index + 1}`,
          metricIdentity: next.metricIdentity,
          observation: {
            version: 1,
            profile: "load_reps",
            loadGrams: 60_000,
            reps: 8,
            source: "plan_default",
          },
          completedAtMs: 1_786_853_650_000 + index,
        },
      });
      current = completed.view;
    }
    const partial = await finishPartial({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: current.revision,
        confirmation: "save_partial_workout",
        endedAtMs: 1_786_853_700_000,
      },
    });
    const projection = createHistoryProjectionRepository(kernel);
    const runner = createHistoryProjectionEffectRunner({
      repository: projection,
      store: createHistoryProjectionEffectStore(kernel),
    });

    await expect(createProgressRepository(kernel).load({
      period: "4_weeks",
      nowLocalDate: "2026-08-17",
    })).resolves.toMatchObject({ freshness: "updating", projection: null });
    await expect(kernel.queryAll<{ status: string }>(
      `SELECT status FROM progression_recommendations
       WHERE id = 'preexisting-progress-recommendation'`,
    )).resolves.toEqual([{ status: "invalidated" }]);
    await expect(kernel.queryAll<{ idempotency_key: string; status: string }>(
      `SELECT idempotency_key, status
       FROM pending_effects
       WHERE effect_type = 'regenerate_load_reps_recommendation'
       ORDER BY idempotency_key`,
    )).resolves.toEqual([
      {
        idempotency_key: "recommend:preexisting-progress",
        status: "superseded",
      },
      {
        idempotency_key: `recommend:${session.id}:${partial.detail.revision}`,
        status: "pending",
      },
    ]);

    const savedDrain = await runner.drain({
      nowMs: 1_786_853_700_100,
      limit: 64,
    });
    expect(savedDrain.claimed).toBeGreaterThan(0);
    expect(savedDrain).toMatchObject({
      completed: savedDrain.claimed,
      permanentFailures: 0,
      retried: 0,
    });
    const savedProgress = await createProgressRepository(kernel).load({
      period: "4_weeks",
      nowLocalDate: "2026-08-17",
    });
    expect(savedProgress).toMatchObject({
      freshness: "current",
      projection: {
        summary: {
          workingSets: { completed: 3, planned: 15 },
        },
      },
    });
    expect(savedProgress.projection?.exercises).toEqual([
      expect.objectContaining({
        exerciseId: "5f140001-7e35-4a6d-9100-000000000001",
        status: "holding",
      }),
    ]);

    await resumePartialWorkout({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: partial.detail.revision,
        resumedAtMs: 1_786_853_800_000,
      },
    });
    await expect(createProgressRepository(kernel).load({
      period: "4_weeks",
      nowLocalDate: "2026-08-17",
    })).resolves.toMatchObject({ freshness: "updating", projection: null });
    await expect(kernel.queryAll<{ status: string }>(
      `SELECT status
       FROM pending_effects
       WHERE effect_type = 'regenerate_load_reps_recommendation'
       ORDER BY idempotency_key`,
    )).resolves.toEqual([
      { status: "superseded" },
      { status: "superseded" },
    ]);
    const resumedDrain = await runner.drain({
      nowMs: 1_786_853_800_100,
      limit: 64,
    });
    expect(resumedDrain.claimed).toBeGreaterThan(0);
    expect(resumedDrain).toMatchObject({
      completed: resumedDrain.claimed,
      permanentFailures: 0,
      retried: 0,
    });
    await expect(createProgressRepository(kernel).load({
      period: "4_weeks",
      nowLocalDate: "2026-08-17",
    })).resolves.toMatchObject({
      freshness: "current",
      projection: {
        exercises: [],
        records: [],
        summary: {
          workingSets: { completed: 0, planned: 0 },
        },
        trend: [],
      },
    });
  });

  it("rejects malformed history targets without committing outcome state", async () => {
    const { kernel, repository, session } = await setupPlannedWorkout();
    await kernel.write((transaction) => transaction.execute(
      `UPDATE session_sets
       SET target_json = '{"version":1,"profile":"load_reps"}'
       WHERE id = (
         SELECT ss.id
         FROM session_sets ss
         JOIN session_exercises se ON se.id = ss.session_exercise_id
         WHERE se.session_id = ? AND ss.set_kind = 'working'
         ORDER BY se.ordinal, ss.ordinal
         LIMIT 1
       )`,
      [session.id],
    ));

    await expect(finishPartial({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: session.revision,
        confirmation: "save_partial_workout",
        endedAtMs: 1_786_853_700_000,
      },
    })).rejects.toMatchObject({
      code: "sqlite_transaction_failed",
      cause: expect.objectContaining({
        code: "session_detail_target_invalid",
      }),
    });
    await expect(kernel.queryAll<{ status: string; completed_at_ms: number | null }>(
      `SELECT status, completed_at_ms FROM workout_sessions WHERE id = ?`,
      [session.id],
    )).resolves.toEqual([{ status: "in_progress", completed_at_ms: null }]);
    await expect(kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM session_rest_states",
    )).resolves.toEqual([{ count: 0 }]);
    await expect(kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM history_subject_revisions",
    )).resolves.toEqual([{ count: 0 }]);
    await expect(kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM history_rebuild_effects",
    )).resolves.toEqual([{ count: 0 }]);
    await expect(kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM pending_effects",
    )).resolves.toEqual([{ count: 0 }]);
  });

  it("rejects malformed history targets without committing a partial resume", async () => {
    const { kernel, repository, session } = await setupPlannedWorkout();
    const partial = await finishPartial({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: session.revision,
        confirmation: "save_partial_workout",
        endedAtMs: 1_786_853_700_000,
      },
    });
    await kernel.write((transaction) => transaction.execute(
      `UPDATE session_sets
       SET target_json = '{"version":1,"profile":"load_reps"}'
       WHERE id = (
         SELECT ss.id
         FROM session_sets ss
         JOIN session_exercises se ON se.id = ss.session_exercise_id
         WHERE se.session_id = ? AND ss.set_kind = 'working'
         ORDER BY se.ordinal, ss.ordinal
         LIMIT 1
       )`,
      [session.id],
    ));
    const beforeSubjects = await kernel.queryAll(
      "SELECT * FROM history_subject_revisions ORDER BY subject_id",
    );
    const beforeRebuilds = await kernel.queryAll(
      "SELECT * FROM history_rebuild_effects ORDER BY id",
    );
    const beforeEffects = await kernel.queryAll(
      "SELECT * FROM pending_effects ORDER BY id",
    );

    await expect(resumePartialWorkout({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: partial.detail.revision,
        resumedAtMs: 1_786_853_800_000,
      },
    })).rejects.toMatchObject({
      code: "sqlite_transaction_failed",
      cause: expect.objectContaining({ code: "session_detail_target_invalid" }),
    });
    await expect(kernel.queryAll(
      `SELECT status, completed_at_ms, revision
       FROM workout_sessions WHERE id = ?`,
      [session.id],
    )).resolves.toEqual([{
      status: "partial",
      completed_at_ms: 1_786_853_700_000,
      revision: partial.detail.revision,
    }]);
    await expect(kernel.queryAll(
      "SELECT * FROM history_subject_revisions ORDER BY subject_id",
    )).resolves.toEqual(beforeSubjects);
    await expect(kernel.queryAll(
      "SELECT * FROM history_rebuild_effects ORDER BY id",
    )).resolves.toEqual(beforeRebuilds);
    await expect(kernel.queryAll(
      "SELECT * FROM pending_effects ORDER BY id",
    )).resolves.toEqual(beforeEffects);
  });

  it("saves partial after one completed generated set identity", async () => {
    const { kernel, repository, session } = await setupPlannedWorkout();
    const [set] = await kernel.queryAll<{
      target_json: string;
    }>(
      `SELECT ss.target_json
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       WHERE se.session_id = ?
         AND ss.set_kind = 'working'
       ORDER BY se.ordinal, ss.ordinal
       LIMIT 1`,
      [session.id],
    );
    const generatedSetId = `session_target_${"s".repeat(140)}_0`;
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO session_sets
          (id, session_exercise_id, set_kind, ordinal,
           source_plan_working_set_target_id, target_load_grams,
           target_min_reps, target_max_reps, target_json, unit_json,
           rule_type, rule_version, metric_profile, metric_contract_version,
           exercise_metric_generation, observed_load_grams, observed_reps,
           observed_json, status,
           draft_updated_at_ms, completed_at_ms,
           completion_idempotency_key, revision)
         SELECT ?, session_exercise_id, set_kind, 99,
                source_plan_working_set_target_id, target_load_grams,
                target_min_reps, target_max_reps, target_json, unit_json,
                rule_type, rule_version, metric_profile, metric_contract_version,
                exercise_metric_generation, target_load_grams, target_max_reps,
                json_object(
                  'version', 1,
                  'profile', 'load_reps',
                  'loadGrams', target_load_grams,
                  'reps', target_max_reps,
                  'source', 'plan_default'
                ),
                'completed', NULL, ?, 'generated-set-completion', 1
         FROM session_sets
         WHERE id = (
           SELECT ss.id
           FROM session_sets ss
           JOIN session_exercises se ON se.id = ss.session_exercise_id
           WHERE se.session_id = ?
             AND ss.set_kind = 'working'
           ORDER BY se.ordinal, ss.ordinal
           LIMIT 1
         )`,
        [generatedSetId, 1_786_853_650_000, session.id],
      );
    });

    const partial = await finishPartial({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: session.revision,
        confirmation: "save_partial_workout",
        endedAtMs: 1_786_853_700_000,
      },
    });
    expect(partial.detail).toMatchObject({
      status: "partial",
      workingSetProgress: { completed: 1, planned: 16 },
    });
    expect(partial.detail.exercises[0]).toMatchObject({
      topWorkingSet: "60 kg × 8",
    });
    expect(partial.detail.exercises[0]!.workingSets).toContainEqual(
      expect.objectContaining({
        id: generatedSetId,
        target: JSON.parse(set!.target_json),
      }),
    );
  });

  it("stores zero working sets outside history fan-out and preserves recommendation work", async () => {
    const { kernel, repository, session } = await setupPlannedWorkout();
    await seedPendingRecommendation(
      kernel,
      session.id,
      "zero-set-preserved-recommendation",
      "zero-set-preserved-effect",
    );
    expect(() => saveZeroSetWorkout({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: session.revision,
        confirmation: "keep_training",
        endedAtMs: 1_786_853_700_000,
      },
    })).toThrow("zero_set_confirmation_required");

    const saved = await saveZeroSetWorkout({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: session.revision,
        confirmation: "save_zero_set_workout",
        endedAtMs: 1_786_853_700_000,
      },
    });

    expect(saved.detail).toMatchObject({
      status: "zero_sets",
      workingSetProgress: { completed: 0, planned: 15, percent: 0 },
    });
    await expect(kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM history_subject_revisions",
    )).resolves.toEqual([{ count: 0 }]);
    await expect(kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM history_rebuild_effects",
    )).resolves.toEqual([{ count: 0 }]);
    await expect(kernel.queryAll<{ status: string }>(
      `SELECT status FROM progression_recommendations
       WHERE id = 'zero-set-preserved-recommendation'`,
    )).resolves.toEqual([{ status: "pending" }]);
    await expect(kernel.queryAll<{ idempotency_key: string; status: string }>(
      `SELECT idempotency_key, status FROM pending_effects
       WHERE effect_type = 'regenerate_load_reps_recommendation'`,
    )).resolves.toEqual([{
      idempotency_key: "recommend:zero-set-preserved-effect",
      status: "pending",
    }]);
  });

  it("discards an in-progress workout without scheduling a progression replay", async () => {
    const { kernel, repository, session } = await setupPlannedWorkout();
    await seedPendingRecommendation(
      kernel,
      session.id,
      "discard-preserved-recommendation",
      "discard-preserved-effect",
    );

    const discarded = await discardWorkout({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: session.revision,
        confirmation: "discard_workout",
        endedAtMs: 1_786_853_700_000,
      },
    });

    expect(discarded.detail).toMatchObject({
      status: "discarded",
      resumable: false,
    });
    await expect(kernel.queryAll<{ effect_type: string }>(
      `SELECT effect_type
       FROM pending_effects
       WHERE subject_id = ?
       ORDER BY effect_type`,
      [session.id],
    )).resolves.toEqual([
      { effect_type: "reconcile_rest_notification" },
      { effect_type: "regenerate_load_reps_recommendation" },
    ]);
    await expect(kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM history_subject_revisions",
    )).resolves.toEqual([{ count: 0 }]);
    await expect(kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM history_rebuild_effects",
    )).resolves.toEqual([{ count: 0 }]);
    await expect(kernel.queryAll<{ status: string }>(
      `SELECT status FROM progression_recommendations
       WHERE id = 'discard-preserved-recommendation'`,
    )).resolves.toEqual([{ status: "pending" }]);
  });

  it("marks the current exercise skipped while preserving completed sets", async () => {
    const { kernel, repository, session } = await setupPlannedWorkout();
    const [exercise] = await kernel.queryAll<{ id: string; revision: number }>(
      `SELECT id, revision FROM session_exercises
       WHERE session_id = ? ORDER BY ordinal LIMIT 1`,
      [session.id],
    );
    const result = await skipExercise({
      repository,
      input: {
        sessionId: session.id,
        sessionExerciseId: exercise!.id,
        expectedSessionRevision: session.revision,
        expectedExerciseRevision: exercise!.revision,
        confirmation: "skip_exercise",
        nowMs: 1_786_853_700_000,
      },
    });

    expect(result.status).toBe("in_progress");
    expect(await kernel.queryAll<{ status: string }>(
      "SELECT status FROM session_exercises WHERE id = ?",
      [exercise!.id],
    )).toEqual([{ status: "skipped" }]);
  });

  it("rolls back finish status, rest, and effects when commit fails", async () => {
    let armed = false;
    let failed = false;
    const { kernel, repository, session } = await setupPlannedWorkout({
      beforeCommit: async () => {
        if (armed && !failed) {
          failed = true;
          throw new Error("commit_failed");
        }
      },
    });
    await seedPendingRecommendation(
      kernel,
      session.id,
      "rollback-preserved-recommendation",
      "rollback-preserved-recommendation-effect",
    );
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO session_rest_states
          (session_id, state_version, status, started_at_ms, ends_at_ms,
           remaining_ms, expired_at_ms, next_set_id, revision)
         VALUES (?, 1, 'paused', NULL, NULL, 30000, NULL, NULL, 7)`,
        [session.id],
      );
      await enqueuePendingEffect(transaction, {
        id: "rollback-preserved-rest-effect",
        type: "reconcile_rest_notification",
        payloadVersion: 1,
        payload: { version: 1, sessionId: session.id, restRevision: 7 },
        idempotencyKey: "rest:rollback-preserved:7",
        subjectId: session.id,
        expectedRevision: 7,
        nowMs: 1_786_853_650_000,
      });
    });
    const beforeRest = await kernel.queryAll(
      "SELECT * FROM session_rest_states WHERE session_id = ?",
      [session.id],
    );
    const beforeRecommendations = await kernel.queryAll(
      "SELECT * FROM progression_recommendations ORDER BY id",
    );
    const beforePendingEffects = await kernel.queryAll(
      "SELECT * FROM pending_effects ORDER BY id",
    );
    armed = true;

    await expect(finishPartial({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: session.revision,
        confirmation: "save_partial_workout",
        endedAtMs: 1_786_853_700_000,
      },
    })).rejects.toMatchObject({ code: "sqlite_commit_failed" });

    expect(await kernel.queryAll<{ status: string; completed_at_ms: number | null }>(
      `SELECT status, completed_at_ms FROM workout_sessions WHERE id = ?`,
      [session.id],
    )).toEqual([{ status: "in_progress", completed_at_ms: null }]);
    expect(await kernel.queryAll(
      "SELECT * FROM session_rest_states WHERE session_id = ?",
      [session.id],
    )).toEqual(beforeRest);
    expect(await kernel.queryAll(
      "SELECT * FROM progression_recommendations ORDER BY id",
    )).toEqual(beforeRecommendations);
    expect(await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM history_subject_revisions",
    )).toEqual([{ count: 0 }]);
    expect(await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM history_rebuild_effects",
    )).toEqual([{ count: 0 }]);
    expect(await kernel.queryAll(
      "SELECT * FROM pending_effects ORDER BY id",
    )).toEqual(beforePendingEffects);
  });

  it("rolls back a partial resume and its history rebuild effects together", async () => {
    let armed = false;
    let failed = false;
    const { kernel, repository, session } = await setupPlannedWorkout({
      beforeCommit: async () => {
        if (armed && !failed) {
          failed = true;
          throw new Error("resume_commit_failed");
        }
      },
    });
    const partial = await finishPartial({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: session.revision,
        confirmation: "save_partial_workout",
        endedAtMs: 1_786_853_700_000,
      },
    });
    await seedPendingRecommendation(
      kernel,
      session.id,
      "resume-rollback-preserved-recommendation",
      "resume-rollback-preserved-recommendation-effect",
    );
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE session_rest_states
         SET status = 'paused', remaining_ms = 30000, revision = revision + 1
         WHERE session_id = ?`,
        [session.id],
      );
      await enqueuePendingEffect(transaction, {
        id: "resume-rollback-preserved-rest-effect",
        type: "reconcile_rest_notification",
        payloadVersion: 1,
        payload: { version: 1, sessionId: session.id, restRevision: 2 },
        idempotencyKey: "rest:resume-rollback-preserved:2",
        subjectId: session.id,
        expectedRevision: 2,
        nowMs: 1_786_853_750_000,
      });
    });
    const beforeRest = await kernel.queryAll(
      "SELECT * FROM session_rest_states WHERE session_id = ?",
      [session.id],
    );
    const beforeRecommendations = await kernel.queryAll(
      "SELECT * FROM progression_recommendations ORDER BY id",
    );
    const beforeSubjects = await kernel.queryAll<{
      subject_id: string;
      revision: number;
    }>(
      `SELECT subject_id, revision
       FROM history_subject_revisions
       ORDER BY subject_id`,
    );
    const beforeEffects = await kernel.queryAll<{
      id: string;
      status: string;
    }>(
      `SELECT id, status FROM history_rebuild_effects ORDER BY id`,
    );
    const beforePendingEffects = await kernel.queryAll<{
      id: string;
      status: string;
    }>(
      `SELECT id, status FROM pending_effects ORDER BY id`,
    );
    armed = true;

    await expect(resumePartialWorkout({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: partial.detail.revision,
        resumedAtMs: 1_786_853_800_000,
      },
    })).rejects.toMatchObject({ code: "sqlite_commit_failed" });

    expect(await kernel.queryAll<{ status: string; completed_at_ms: number | null }>(
      `SELECT status, completed_at_ms FROM workout_sessions WHERE id = ?`,
      [session.id],
    )).toEqual([{ status: "partial", completed_at_ms: 1_786_853_700_000 }]);
    expect(await kernel.queryAll(
      "SELECT * FROM session_rest_states WHERE session_id = ?",
      [session.id],
    )).toEqual(beforeRest);
    expect(await kernel.queryAll(
      "SELECT * FROM progression_recommendations ORDER BY id",
    )).toEqual(beforeRecommendations);
    expect(await kernel.queryAll(
      `SELECT subject_id, revision
       FROM history_subject_revisions
       ORDER BY subject_id`,
    )).toEqual(beforeSubjects);
    expect(await kernel.queryAll(
      `SELECT id, status FROM history_rebuild_effects ORDER BY id`,
    )).toEqual(beforeEffects);
    expect(await kernel.queryAll(
      `SELECT id, status FROM pending_effects ORDER BY id`,
    )).toEqual(beforePendingEffects);
  });

  it("voids corrected partial history when it resumes and replaces it on a later save", async () => {
    const { kernel, repository, session } = await setupPlannedWorkout();
    const workout = createWorkoutRepository(kernel);
    let current = await workout.getActiveWorkout(session.id);
    const activeSet = current.currentExercise.workingSets.find(
      ({ id }) => id === current.activeSetId,
    )!;
    const completed = await completeSet({
      repository: workout,
      haptics: { committed: async () => undefined },
      invalidate: async () => undefined,
      drainEffects: async () => undefined,
      input: {
        sessionId: session.id,
        setId: activeSet.id,
        expectedSessionRevision: current.revision,
        expectedSetRevision: activeSet.revision,
        completionIdempotencyKey: "corrected-partial-resume-set",
        metricIdentity: activeSet.metricIdentity,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          reps: 8,
          source: "plan_default",
        },
        completedAtMs: 1_786_853_650_000,
      },
    });
    current = completed.view;
    const partial = await finishPartial({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: current.revision,
        confirmation: "save_partial_workout",
        endedAtMs: 1_786_853_700_000,
      },
    });
    const corrections = createHistoryCommandRepository(kernel);
    const editor = await corrections.loadCorrectionSession(session.id);
    await corrections.correctSession({
      base: editor.snapshot,
      expectedEffectiveRevision: editor.effectiveRevision,
      next: {
        ...editor.snapshot,
        session: {
          ...editor.snapshot.session,
          ownerNote: "Keep corrected partial facts",
        },
      },
      nowMs: 1_786_853_750_000,
    });
    const projection = createHistoryProjectionRepository(kernel);
    const runner = createHistoryProjectionEffectRunner({
      repository: projection,
      store: createHistoryProjectionEffectStore(kernel),
    });
    await runner.drain({ nowMs: 1_786_853_750_100, limit: 64 });
    await expect(createProgressRepository(kernel).load({
      period: "4_weeks",
      nowLocalDate: "2026-08-17",
    })).resolves.toMatchObject({
      freshness: "current",
      projection: {
        summary: {
          workingSets: { completed: 1, planned: 15 },
        },
      },
    });
    await expect(loadEffectiveHistoryProjectionSessions(kernel)).resolves
      .toEqual([
        expect.objectContaining({
          sessionId: session.id,
          completedWorkingSets: 1,
          plannedWorkingSets: 15,
        }),
      ]);

    const corrected = await repository.getSessionDetail(session.id);
    expect(corrected).toMatchObject({
      corrected: true,
      ownerNote: "Keep corrected partial facts",
      resumable: true,
      status: "partial",
    });
    const resumed = await resumePartialWorkout({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: corrected.revision,
        resumedAtMs: 1_786_853_800_000,
      },
    });
    expect(resumed).toMatchObject({
      status: "in_progress",
      sessionRevision: partial.detail.revision + 1,
    });
    await expect(kernel.queryAll(
      `SELECT lifecycle, effective_revision
       FROM history_session_overlays WHERE session_id = ?`,
      [session.id],
    )).resolves.toEqual([{
      lifecycle: "voided",
      effective_revision: corrected.revision + 1,
    }]);
    await expect(createHistoryRepository(kernel).listRemovedSessions())
      .resolves.toEqual([]);
    await expect(kernel.queryAll<{
      event_type: string;
      field_identity: string;
      effective_revision: number;
    }>(
      `SELECT event_type, field_identity, effective_revision
       FROM history_audit_events
       WHERE session_id = ?
       ORDER BY effective_revision, id`,
      [session.id],
    )).resolves.toEqual([
      {
        event_type: "correction",
        field_identity: "session.ownerNote",
        effective_revision: corrected.revision,
      },
      {
        event_type: "void",
        field_identity: "session.lifecycle",
        effective_revision: corrected.revision + 1,
      },
    ]);
    await expect(loadEffectiveHistoryProjectionSessions(kernel)).resolves.toEqual([]);
    await expect(createProgressRepository(kernel).load({
      period: "4_weeks",
      nowLocalDate: "2026-08-17",
    })).resolves.toMatchObject({ freshness: "updating", projection: null });
    await runner.drain({ nowMs: 1_786_853_800_100, limit: 64 });
    await expect(createProgressRepository(kernel).load({
      period: "4_weeks",
      nowLocalDate: "2026-08-17",
    })).resolves.toMatchObject({
      freshness: "current",
      projection: {
        exercises: [],
        records: [],
        summary: {
          workingSets: { completed: 0, planned: 0 },
        },
        trend: [],
      },
    });

    const resaved = await finishPartial({
      repository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: resumed.sessionRevision,
        confirmation: "save_partial_workout",
        endedAtMs: 1_786_853_900_000,
      },
    });
    expect(resaved.detail).toMatchObject({
      corrected: true,
      ownerNote: null,
      status: "partial",
    });
    await expect(kernel.queryAll<{
      lifecycle: string;
      effective_revision: number;
      snapshot_json: string;
    }>(
      `SELECT lifecycle, effective_revision, snapshot_json
       FROM history_session_overlays WHERE session_id = ?`,
      [session.id],
    )).resolves.toEqual([
      expect.objectContaining({
        lifecycle: "active",
        effective_revision: corrected.revision + 2,
        snapshot_json: expect.stringContaining('"ownerNote":null'),
      }),
    ]);
    await expect(kernel.queryAll<{
      event_type: string;
      field_identity: string;
      effective_revision: number;
    }>(
      `SELECT event_type, field_identity, effective_revision
       FROM history_audit_events
       WHERE session_id = ?
       ORDER BY effective_revision, id`,
      [session.id],
    )).resolves.toEqual([
      {
        event_type: "correction",
        field_identity: "session.ownerNote",
        effective_revision: corrected.revision,
      },
      {
        event_type: "void",
        field_identity: "session.lifecycle",
        effective_revision: corrected.revision + 1,
      },
      {
        event_type: "restore",
        field_identity: "session.lifecycle",
        effective_revision: corrected.revision + 2,
      },
      {
        event_type: "correction",
        field_identity: "session.source_snapshot",
        effective_revision: corrected.revision + 2,
      },
    ]);
    await runner.drain({ nowMs: 1_786_853_900_100, limit: 64 });
    await expect(createProgressRepository(kernel).load({
      period: "4_weeks",
      nowLocalDate: "2026-08-17",
    })).resolves.toMatchObject({
      freshness: "current",
      projection: {
        summary: {
          workingSets: { completed: 1, planned: 15 },
        },
      },
    });
    await expect(loadEffectiveHistoryProjectionSessions(kernel)).resolves
      .toEqual([
        expect.objectContaining({
          sessionId: session.id,
          completedWorkingSets: 1,
          plannedWorkingSets: 15,
        }),
      ]);
  });

  it.each<readonly [
    "discarded" | "zero_sets",
    "discard" | "zero sets",
  ]>([
    ["discarded", "discard"] as const,
    ["zero_sets", "zero sets"] as const,
  ])(
    "terminalizes a voided corrected partial as %s without retaining a removed session",
    async (terminalStatus, terminalLabel) => {
      const { kernel, repository, session } = await setupPlannedWorkout();
      const partial = await finishPartial({
        repository,
        input: {
          sessionId: session.id,
          expectedSessionRevision: session.revision,
          confirmation: "save_partial_workout",
          endedAtMs: 1_786_853_700_000,
        },
      });
      const corrections = createHistoryCommandRepository(kernel);
      const editor = await corrections.loadCorrectionSession(session.id);
      const firstExercise = editor.snapshot.exercises[0]!;
      const firstWorkingSet = firstExercise.sets.find(
        ({ kind }) => kind === "working",
      )!;
      const corrected = await corrections.correctSession({
        base: editor.snapshot,
        expectedEffectiveRevision: editor.effectiveRevision,
        next: {
          ...editor.snapshot,
          session: {
            ...editor.snapshot.session,
            ownerNote: `Corrected before ${terminalLabel}`,
          },
          exercises: editor.snapshot.exercises.map((exercise) =>
            exercise.id !== firstExercise.id
              ? exercise
              : {
                  ...exercise,
                  sets: exercise.sets.map((set) =>
                    set.id !== firstWorkingSet.id
                      ? set
                      : {
                          ...set,
                          status: "completed",
                          observation: {
                            version: 1,
                            profile: "load_reps",
                            loadGrams: 60_000,
                            reps: 8,
                            source: "manual",
                          },
                          completedAtMs: 1_786_853_750_000,
                        }
                  ),
                }
          ),
        },
        nowMs: 1_786_853_750_000,
      });
      const projection = createHistoryProjectionRepository(kernel);
      const runner = createHistoryProjectionEffectRunner({
        repository: projection,
        store: createHistoryProjectionEffectStore(kernel),
      });
      await runner.drain({ nowMs: 1_786_853_750_100, limit: 64 });
      await expect(createProgressRepository(kernel).load({
        period: "4_weeks",
        nowLocalDate: "2026-08-17",
      })).resolves.toMatchObject({
        freshness: "current",
        projection: {
          summary: {
            workingSets: { completed: 1, planned: 15 },
          },
        },
      });

      const resumed = await resumePartialWorkout({
        repository,
        input: {
          sessionId: session.id,
          expectedSessionRevision: corrected.effectiveRevision,
          resumedAtMs: 1_786_853_800_000,
        },
      });
      const auditsBeforeTerminal = await kernel.queryAll<{
        id: string;
        event_type: string;
        field_identity: string;
        effective_revision: number;
      }>(
        `SELECT id, event_type, field_identity, effective_revision
         FROM history_audit_events
         WHERE session_id = ?
         ORDER BY id`,
        [session.id],
      );

      const terminal = terminalStatus === "discarded"
        ? await discardWorkout({
            repository,
            input: {
              sessionId: session.id,
              expectedSessionRevision: resumed.sessionRevision,
              confirmation: "discard_workout",
              endedAtMs: 1_786_853_900_000,
            },
          })
        : await saveZeroSetWorkout({
            repository,
            input: {
              sessionId: session.id,
              expectedSessionRevision: resumed.sessionRevision,
              confirmation: "save_zero_set_workout",
              endedAtMs: 1_786_853_900_000,
            },
          });

      expect(terminal.detail).toMatchObject({
        id: session.id,
        status: terminalStatus,
        revision: resumed.sessionRevision + 1,
        resumable: false,
      });
      expect(terminal.detail.corrected).toBeUndefined();
      expect(terminal.detail.ownerNote).toBeUndefined();
      await expect(kernel.queryAll<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM history_session_overlays
         WHERE session_id = ?`,
        [session.id],
      )).resolves.toEqual([{ count: 0 }]);
      const auditsAfterTerminal = await kernel.queryAll<{
        id: string;
        event_type: string;
        field_identity: string;
        effective_revision: number;
      }>(
        `SELECT id, event_type, field_identity, effective_revision
         FROM history_audit_events
         WHERE session_id = ?
         ORDER BY id`,
        [session.id],
      );
      expect(auditsAfterTerminal).toEqual(
        expect.arrayContaining([...auditsBeforeTerminal]),
      );
      expect(auditsAfterTerminal).toHaveLength(auditsBeforeTerminal.length + 1);
      expect(auditsAfterTerminal).toContainEqual({
        id: `history-audit:${session.id}:${resumed.sessionRevision + 1}:terminalized`,
        event_type: "correction",
        field_identity: "session.terminal_status",
        effective_revision: resumed.sessionRevision + 1,
      });

      const history = createHistoryRepository(kernel);
      await expect(history.listRemovedSessions()).resolves.toEqual([]);
      const calendar = await history.loadCalendarMonth({
        month: "2026-08-01",
        selectedDate: "2026-08-17",
        today: "2026-08-17",
      });
      expect(calendar.sessions).toEqual(
        terminalStatus === "zero_sets"
          ? [expect.objectContaining({
              id: session.id,
              status: "zero_sets",
              effective: expect.objectContaining({
                lifecycle: "active",
                revision: resumed.sessionRevision + 1,
              }),
            })]
          : [],
      );
      await expect(loadEffectiveHistoryProjectionSessions(kernel)).resolves
        .toEqual([]);
      await expect(createProgressRepository(kernel).load({
        period: "4_weeks",
        nowLocalDate: "2026-08-17",
      })).resolves.toMatchObject({ freshness: "updating", projection: null });
      const terminalDrain = await runner.drain({
        nowMs: 1_786_853_900_100,
        limit: 64,
      });
      expect(terminalDrain.claimed).toBeGreaterThan(0);
      await expect(createProgressRepository(kernel).load({
        period: "4_weeks",
        nowLocalDate: "2026-08-17",
      })).resolves.toMatchObject({
        freshness: "current",
        projection: {
          exercises: [],
          records: [],
          summary: {
            workingSets: { completed: 0, planned: 0 },
          },
          trend: [],
        },
      });
    },
  );

  it("renders manual and voided retained states read-only in session detail", async () => {
    const kernel = await createKernel();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO workout_sessions
          (id, plan_id, plan_day_id, source, status, local_date, timezone,
           started_at_ms, completed_at_ms, active_session_exercise_id,
           active_set_id, revision)
         VALUES
          ('manual-visit', NULL, NULL, 'manual', 'manual_visit', '2026-08-17',
           'Asia/Singapore', 1000, 2000, NULL, NULL, 1),
          ('removed', NULL, NULL, 'empty', 'voided', '2026-08-17',
           'Asia/Singapore', 1000, 2000, NULL, NULL, 1)`,
      );
    });
    const repository = createWorkoutOutcomeRepository(kernel);

    await expect(repository.getSessionDetail("manual-visit")).resolves
      .toMatchObject({ statusLabel: "Manual visit", readOnly: true });
    await expect(repository.getSessionDetail("removed")).resolves
      .toMatchObject({ statusLabel: "Removed from history", readOnly: true });
  });
});
