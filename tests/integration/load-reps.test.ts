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
  acceptRecommendation,
  keepCurrentTarget,
  recordExerciseEffort,
} from "../../src/domains/progression";
import {
  startWorkout,
} from "../../src/domains/workout";
import {
  createWorkoutOutcomeRepository,
} from "../../src/platform/sqlite/repositories/workoutOutcomeRepository";
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
  createWorkoutRepository,
} from "../../src/platform/sqlite/repositories/workoutRepository";
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
    backupId: `load-reps-${request.fromVersion}-${request.toVersion}`,
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

async function createKernel(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-load-reps-"));
  directories.add(directory);
  const path = join(directory, "gym-tracker.db");
  const writer = new NodeSqliteConnection(new DatabaseSync(path));
  const reader = new NodeSqliteConnection(new DatabaseSync(path));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations,
    recoveryBackup,
  }).run();
  kernels.push(kernel);
  return kernel;
}

async function createLatestKernel(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-load-reps-latest-"));
  directories.add(directory);
  const path = join(directory, "gym-tracker.db");
  const writer = new NodeSqliteConnection(new DatabaseSync(path));
  const reader = new NodeSqliteConnection(new DatabaseSync(path));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations,
    recoveryBackup,
  }).run();
  kernels.push(kernel);
  return kernel;
}

async function setupRecommendation() {
  const kernel = await createKernel();
  const plans = createPlansWorkoutRepository(kernel);
  const activation = await activateStarterPlan({
    fixture: parseFullBodyFoundation(fullBodyFoundationAsset),
    repository: plans,
    activatedAtMs: 1_786_853_600_000,
    startLocalDate: "2026-08-17",
    timezone: "Asia/Singapore",
  });
  const [exercise] = await kernel.queryAll<{
    exercise_id: string;
    target_id: string;
    target_revision: number;
    target_json: string;
    metric_profile: string;
    metric_contract_version: number;
    exercise_metric_generation: number;
  }>(
    `SELECT de.exercise_id, t.id AS target_id, t.revision AS target_revision,
            t.target_json, t.metric_profile, t.metric_contract_version,
            t.exercise_metric_generation
     FROM plan_day_exercises de
     JOIN plan_working_set_targets t ON t.plan_day_exercise_id = de.id
     WHERE de.plan_day_id = ? AND de.ordinal = 0 AND t.ordinal = 0`,
    [activation.days[0]!.id],
  );
  const targetScope = await kernel.queryAll<{ id: string; revision: number }>(
    `SELECT id, revision
     FROM plan_working_set_targets
     WHERE plan_day_exercise_id = (
       SELECT plan_day_exercise_id
       FROM plan_working_set_targets
       WHERE id = ?
     )
     ORDER BY ordinal`,
    [exercise!.target_id],
  );
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO workout_sessions
        (id, plan_id, plan_day_id, source, status, local_date, timezone,
         started_at_ms, completed_at_ms, revision,
         creation_timezone_offset_minutes)
       VALUES ('recommendation-source-session', NULL, NULL, 'manual',
               'completed', '2026-08-17', 'Asia/Singapore', 1000, 2000, 1,
               480)`,
    );
    await transaction.execute(
      `INSERT INTO session_exercises
        (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
         exercise_name, metric_profile, metric_contract_version,
         exercise_metric_generation, default_rest_seconds, target_revision,
         status, revision)
       VALUES ('recommendation-source-exercise',
               'recommendation-source-session', NULL, ?, 0,
               'Recommendation source', ?, ?, ?, 90, ?, 'completed', 1)`,
      [
        exercise!.exercise_id,
        exercise!.metric_profile,
        exercise!.metric_contract_version,
        exercise!.exercise_metric_generation,
        exercise!.target_revision,
      ],
    );
    await transaction.execute(
      `INSERT INTO session_sets
        (id, session_exercise_id, set_kind, ordinal,
         source_plan_working_set_target_id, target_load_grams,
         target_min_reps, target_max_reps, target_json, unit_json,
         rule_type, rule_version, metric_profile, metric_contract_version,
         exercise_metric_generation, observed_json, completed_at_ms, status,
         revision)
       VALUES ('recommendation-source-set',
               'recommendation-source-exercise', 'working', 0, ?, 60000, 6,
               8, ?, '{"version":1,"load":"grams","count":"repetitions"}',
               'load_reps', 1, ?, ?, ?,
               '{"version":1,"profile":"load_reps","loadGrams":60000,"reps":8,"source":"manual"}',
               2000, 'completed', 1)`,
      [
        exercise!.target_id,
        exercise!.target_json,
        exercise!.metric_profile,
        exercise!.metric_contract_version,
        exercise!.exercise_metric_generation,
      ],
    );
    await transaction.execute(
      `INSERT INTO progression_recommendations
        (id, exercise_id, plan_working_set_target_id, rule_type, rule_version,
         evidence_version, evidence_json, current_target_json,
         proposed_target_json, metric_profile, metric_contract_version,
         exercise_metric_generation, status, source_revision, target_revision,
         created_at_ms, decided_at_ms)
       VALUES (?, ?, ?, 'load_reps', 1, 2, ?, ?, ?, ?, ?, ?, 'pending',
               ?, ?, ?, NULL)`,
      [
        "recommendation-1",
        exercise!.exercise_id,
        exercise!.target_id,
        JSON.stringify({
          version: 2,
          rule: { id: "load_reps.double_progression.v1", version: 1 },
          metricIdentity: {
            profile: exercise!.metric_profile,
            contractVersion: exercise!.metric_contract_version,
            exerciseMetricGeneration: exercise!.exercise_metric_generation,
          },
          source: {
            sessionId: "recommendation-source-session",
            sessionExerciseId: "recommendation-source-exercise",
            sessionRevision: 1,
            setIds: ["recommendation-source-set"],
          },
          revisions: {
            source: exercise!.target_revision,
            target: exercise!.target_revision,
          },
          targetScope,
          currentTarget: JSON.parse(exercise!.target_json),
          proposedTarget: {
            version: 1,
            profile: "load_reps",
            loadGrams: 60_000,
            minReps: 6,
            maxReps: 8,
            targetReps: [8, 8, 8],
            incrementGrams: 2_500,
            perSide: false,
          },
          decision: "increase",
          reasonCode: "increase_all_qualified_sets_at_upper_bound",
          reason: "All qualifying sets reached the upper bound",
          confidence: "high",
          lifecycle: {
            state: "pending",
            createdAtMs: 1_786_853_900_000,
          },
        }),
        exercise!.target_json,
        JSON.stringify({
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          minReps: 6,
          maxReps: 8,
          targetReps: [8, 8, 8],
          incrementGrams: 2_500,
          perSide: false,
        }),
        exercise!.metric_profile,
        exercise!.metric_contract_version,
        exercise!.exercise_metric_generation,
        exercise!.target_revision,
        exercise!.target_revision,
        1_786_853_900_000,
      ],
    );
  });
  return {
    kernel,
    repository: createWorkoutOutcomeRepository(kernel),
    targetId: exercise!.target_id,
  };
}

async function setupCompletedWorkout() {
  const kernel = await createKernel();
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
  const [squat] = await kernel.queryAll<{ id: string }>(
    `SELECT id FROM session_exercises
     WHERE session_id = ? ORDER BY ordinal LIMIT 1`,
    [session.id],
  );
  await kernel.write(async (transaction) => {
    for (const [ordinal, reps] of [8, 8, 7].entries()) {
      await transaction.execute(
        `UPDATE session_sets
         SET status = 'completed',
             observed_load_grams = 60_000,
             observed_reps = ?,
             observed_json = ?,
             completed_at_ms = ?,
             revision = revision + 1
         WHERE session_exercise_id = ?
           AND set_kind = 'working'
           AND ordinal = ?`,
        [
          reps,
          JSON.stringify({
            version: 1,
            profile: "load_reps",
            loadGrams: 60_000,
            reps,
            source: "manual",
          }),
          1_786_853_700_000 + ordinal,
          squat!.id,
          ordinal,
        ],
      );
    }
    await transaction.execute(
      `UPDATE session_exercises
       SET status = CASE WHEN id = ? THEN 'completed' ELSE 'skipped' END,
           revision = revision + 1
       WHERE session_id = ?`,
      [squat!.id, session.id],
    );
    await transaction.execute(
      `UPDATE session_sets
       SET status = 'skipped', revision = revision + 1
       WHERE session_exercise_id <> ? AND status IN ('planned', 'draft')`,
      [squat!.id],
    );
    await transaction.execute(
      `UPDATE workout_sessions
       SET status = 'partial',
           completed_at_ms = ?,
           active_session_exercise_id = NULL,
           active_set_id = NULL,
           revision = 2
       WHERE id = ?`,
      [1_786_853_800_000, session.id],
    );
  });
  return {
    kernel,
    repository: createWorkoutOutcomeRepository(kernel),
    sessionId: session.id,
    squatId: squat!.id,
  };
}

describe("Plan 01-10 recommendation lifecycle", () => {
  it("activates the legacy starter with complete identity on the latest schema", async () => {
    const kernel = await createLatestKernel();
    const activation = await activateStarterPlan({
      fixture: parseFullBodyFoundation(fullBodyFoundationAsset),
      repository: createPlansWorkoutRepository(kernel),
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    });

    expect(activation.plan.name).toBe("Full Body Foundation");
    for (const table of [
      "exercises",
      "plan_day_exercises",
      "plan_working_set_targets",
      "progression_policies",
    ]) {
      await expect(kernel.queryAll(
        `SELECT DISTINCT metric_contract_version,
                exercise_metric_generation
         FROM ${table}`,
      )).resolves.toEqual([{
        exercise_metric_generation: 1,
        metric_contract_version: 1,
      }]);
    }
  });

  it("generates stored evidence and a factual detail recommendation from source sets", async () => {
    const { kernel, repository, sessionId } = await setupCompletedWorkout();

    await expect(repository.generateRecommendationsForSession(
      sessionId,
      2,
      1_786_853_900_000,
    )).resolves.toBe(1);

    const detail = await repository.getSessionDetail(sessionId);
    expect(detail).toMatchObject({
      status: "partial",
      recommendationStatus: "pending",
      workingSetProgress: {
        completed: 3,
        planned: 15,
        percent: 20,
      },
    });
    expect(detail.exercises[0]).toMatchObject({
      name: "Back Squat",
      topWorkingSet: "60 kg × 8",
      totalWorkingReps: 23,
    });
    expect(detail.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        exerciseName: "Back Squat",
        decision: "hold",
        reason: "One more repetition completes the range",
        comparableReps: [8, 8, 7],
        proposedLoadGrams: 60_000,
        proposedTargetReps: [8, 8, 8],
      }),
    ]));
    expect(await kernel.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM progression_recommendations
       WHERE status = 'pending'`,
    )).toEqual([{ count: 1 }]);
  });

  it("persists the evaluator reason code and available equipment increment from the current target", async () => {
    const { kernel, repository, sessionId, squatId } = await setupCompletedWorkout();
    await kernel.write((transaction) => transaction.execute(
      `UPDATE session_sets
       SET observed_reps = 8,
           observed_json = json_set(observed_json, '$.reps', 8)
       WHERE session_exercise_id = ?
         AND set_kind = 'working'
         AND ordinal = 2`,
      [squatId],
    ));
    await kernel.write((transaction) => transaction.execute(
      `UPDATE session_exercises
       SET effort = 'easy'
       WHERE id = ?`,
      [squatId],
    ));
    await kernel.write((transaction) => transaction.execute(
      `UPDATE plan_working_set_targets
       SET target_json = json_set(target_json, '$.incrementGrams', 5000)
       WHERE id = (
         SELECT source_plan_working_set_target_id
         FROM session_sets
         WHERE session_exercise_id = ?
           AND set_kind = 'working'
           AND ordinal = 0
       )`,
      [squatId],
    ));

    await expect(repository.generateRecommendationsForSession(
      sessionId,
      2,
      1_786_853_900_000,
    )).resolves.toBe(1);

    expect(await kernel.queryAll<{
      proposed_target_json: string;
      evidence_json: string;
    }>(
      `SELECT proposed_target_json, evidence_json
       FROM progression_recommendations`,
    )).toEqual([expect.objectContaining({
      proposed_target_json: expect.stringContaining('\"loadGrams\":65000'),
      evidence_json: expect.stringContaining(
        '\"reasonCode\":\"increase_all_qualified_sets_at_upper_bound\"',
      ),
    })]);
  });

  it("replays same-revision recommendation generation idempotently", async () => {
    const { kernel, repository, sessionId } = await setupCompletedWorkout();

    await expect(repository.generateRecommendationsForSession(
      sessionId,
      2,
      1_786_853_900_000,
    )).resolves.toBe(1);
    await expect(repository.generateRecommendationsForSession(
      sessionId,
      2,
      1_786_854_000_000,
    )).resolves.toBe(1);

    await expect(kernel.queryAll(
      `SELECT status, created_at_ms, decided_at_ms
       FROM progression_recommendations
       WHERE json_extract(evidence_json, '$.source.sessionId') = ?`,
      [sessionId],
    )).resolves.toEqual([{
      created_at_ms: 1_786_853_900_000,
      decided_at_ms: null,
      status: "pending",
    }]);
  });

  it("stores a complete v2 envelope for every pending generated recommendation", async () => {
    const { kernel, repository, sessionId } = await setupCompletedWorkout();

    await expect(repository.generateRecommendationsForSession(
      sessionId,
      2,
      1_786_853_900_000,
    )).resolves.toBe(1);

    await expect(kernel.queryAll<{
      evidence_version: number;
      evidence_json: string;
    }>(
      `SELECT evidence_version, evidence_json
       FROM progression_recommendations
       WHERE status = 'pending'`,
    )).resolves.toEqual([expect.objectContaining({
      evidence_version: 2,
      evidence_json: expect.stringContaining('"targetScope"'),
    })]);
  });

  it("keeps completion recommendations scoped to their source session", async () => {
    const { kernel, repository, sessionId } = await setupCompletedWorkout();
    await repository.generateRecommendationsForSession(
      sessionId,
      2,
      1_786_853_900_000,
    );
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE progression_recommendations
         SET status = 'accepted', decided_at_ms = 1_786_853_950_000
         WHERE status = 'pending'`,
      );
      await transaction.execute(
        `INSERT INTO progression_recommendations
          (id, exercise_id, plan_working_set_target_id, rule_type,
           rule_version, evidence_version, evidence_json,
           current_target_json, proposed_target_json,
           metric_profile, metric_contract_version,
           exercise_metric_generation, status,
           source_revision, target_revision, created_at_ms, decided_at_ms)
         SELECT 'recommendation-later-session', exercise_id,
                plan_working_set_target_id, rule_type, rule_version,
                1,
                json_set(
                  json_set(evidence_json, '$.source.sessionId', 'later-session'),
                  '$.lifecycle.createdAtMs',
                  created_at_ms + 1000
                ),
                current_target_json, proposed_target_json,
                metric_profile, metric_contract_version,
                exercise_metric_generation, 'pending',
                source_revision, target_revision, created_at_ms + 1000, NULL
         FROM progression_recommendations
         WHERE status = 'accepted'`,
      );
    });

    await expect(repository.getSessionDetail(sessionId)).resolves.toMatchObject({
      recommendationStatus: "accepted",
      recommendations: [expect.objectContaining({
        status: "accepted",
      })],
    });
  });

  it("advances session revision and enqueues replay after effort", async () => {
    const { kernel, repository, sessionId, squatId } =
      await setupCompletedWorkout();
    await repository.generateRecommendationsForSession(
      sessionId,
      2,
      1_786_853_900_000,
    );
    const detail = await repository.getSessionDetail(sessionId);
    const squat = detail.exercises.find(({ id }) => id === squatId)!;

    await expect(recordExerciseEffort({
      repository,
      input: {
        sessionId,
        sessionExerciseId: squatId,
        expectedExerciseRevision: squat.revision,
        effort: "on_target",
        recordedAtMs: 1_786_854_000_000,
      },
    })).resolves.toMatchObject({
      effort: "on_target",
      revision: squat.revision + 1,
    });
    await expect(repository.currentSessionRevision(sessionId)).resolves.toBe(3);
    await expect(repository.generateRecommendationsForSession(
      sessionId,
      3,
      1_786_854_100_000,
    )).resolves.toBe(1);
    await expect(repository.getSessionDetail(sessionId)).resolves.toMatchObject({
      recommendationStatus: "pending",
      recommendations: [expect.objectContaining({
        status: "pending",
      })],
    });
    expect(await kernel.queryAll<{
      expected_revision: number;
      status: string;
    }>(
      `SELECT expected_revision, status
       FROM pending_effects
       WHERE effect_type = 'regenerate_load_reps_recommendation'
       ORDER BY created_at_ms DESC
       LIMIT 1`,
    )).toEqual([{ expected_revision: 3, status: "pending" }]);
    await expect(repository.currentSessionRevision("missing")).resolves
      .toBeNull();
  });

  it.each([
    ["accepted", "accepted"],
    ["kept current", "rejected"],
  ] as const)(
    "shows a newer pending recommendation after %s",
    async (...parameters) => {
      const [, decidedStatus] = parameters;
      const { kernel, repository, sessionId, squatId } =
        await setupCompletedWorkout();
      await repository.generateRecommendationsForSession(
        sessionId,
        2,
        1_786_853_900_000,
      );
      await kernel.write((transaction) =>
        transaction.execute(
          `UPDATE progression_recommendations
           SET status = ?, decided_at_ms = 1_786_853_950_000
           WHERE status = 'pending'`,
          [decidedStatus],
        )
      );
      const detail = await repository.getSessionDetail(sessionId);
      const squat = detail.exercises.find(({ id }) => id === squatId)!;
      await recordExerciseEffort({
        repository,
        input: {
          sessionId,
          sessionExerciseId: squatId,
          expectedExerciseRevision: squat.revision,
          effort: "on_target",
          recordedAtMs: 1_786_854_000_000,
        },
      });
      await repository.generateRecommendationsForSession(
        sessionId,
        3,
        1_786_854_100_000,
      );

      await expect(repository.getSessionDetail(sessionId)).resolves
        .toMatchObject({
          recommendationStatus: "pending",
          recommendations: [expect.objectContaining({
            status: "pending",
          })],
        });
    },
  );

  it("rejects stale recommendation generation without replacing pending evidence", async () => {
    const { kernel, repository, sessionId } = await setupCompletedWorkout();
    await repository.generateRecommendationsForSession(
      sessionId,
      2,
      1_786_853_900_000,
    );
    await expect(repository.generateRecommendationsForSession(
      sessionId,
      1,
      1_786_854_000_000,
    )).rejects.toThrow("sqlite_transaction_failed");
    expect(await kernel.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM progression_recommendations
       WHERE status = 'pending'`,
    )).toEqual([{ count: 1 }]);
  });

  it("skips a completed session exercise that has no reproducible target reference", async () => {
    const { kernel, repository, sessionId, squatId } =
      await setupCompletedWorkout();
    await kernel.write((transaction) => transaction.execute(
      `UPDATE session_sets
       SET source_plan_working_set_target_id = NULL
       WHERE session_exercise_id = ?`,
      [squatId],
    ));

    await expect(repository.generateRecommendationsForSession(
      sessionId,
      2,
      1_786_854_000_000,
    )).resolves.toBe(0);
  });

  it("skips a sourced target when no working set completed", async () => {
    const { kernel, repository, sessionId, squatId } =
      await setupCompletedWorkout();
    await kernel.write((transaction) => transaction.execute(
      `UPDATE session_sets
       SET status = 'skipped',
           observed_load_grams = NULL,
           observed_reps = NULL,
           observed_json = NULL,
           completed_at_ms = NULL
       WHERE session_exercise_id = ?
         AND set_kind = 'working'`,
      [squatId],
    ));

    await expect(repository.generateRecommendationsForSession(
      sessionId,
      2,
      1_786_854_000_000,
    )).resolves.toBe(0);
  });

  it("rejects recommendation generation when sibling target revisions diverge", async () => {
    const { kernel, repository, sessionId, squatId } =
      await setupCompletedWorkout();
    const [source] = await kernel.queryAll<{ target_id: string }>(
      `SELECT source_plan_working_set_target_id AS target_id
       FROM session_sets
       WHERE session_exercise_id = ?
         AND set_kind = 'working'
       ORDER BY ordinal
       LIMIT 1`,
      [squatId],
    );
    await kernel.write((transaction) => transaction.execute(
      `UPDATE plan_working_set_targets
       SET revision = revision + 1
       WHERE plan_day_exercise_id = (
         SELECT plan_day_exercise_id
         FROM plan_working_set_targets
         WHERE id = ?
       )
         AND id <> ?`,
      [source!.target_id, source!.target_id],
    ));

    await expect(repository.generateRecommendationsForSession(
      sessionId,
      2,
      1_786_854_000_000,
    )).rejects.toThrow("sqlite_transaction_failed");
  });

  it("records optional exercise effort once per completed exercise", async () => {
    const { kernel, repository } = await setupRecommendation();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO workout_sessions
          (id, plan_id, plan_day_id, source, status, local_date, timezone,
           started_at_ms, completed_at_ms, active_session_exercise_id,
           active_set_id, revision)
         VALUES ('effort-session', NULL, NULL, 'empty', 'completed',
                 '2026-08-17', 'Asia/Singapore', 1000, 2000, NULL, NULL, 1)`,
      );
      await transaction.execute(
        `INSERT INTO exercises
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           metric_profile, metric_contract_version,
           exercise_metric_generation, equipment, default_rest_seconds, revision)
         VALUES ('effort-exercise-source', NULL, 'custom', NULL, NULL, 'Row',
                 'load_reps', 1, 1, 'Cable', 60, 1)`,
      );
      await transaction.execute(
        `INSERT INTO session_exercises
          (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
           exercise_name, metric_profile, metric_contract_version,
           exercise_metric_generation, default_rest_seconds,
           target_revision, status, revision)
         VALUES ('effort-exercise', 'effort-session', NULL,
                 'effort-exercise-source', 0, 'Row', 'load_reps', 1, 1, 60, 1,
                 'completed', 1)`,
      );
    });

    const recorded = await recordExerciseEffort({
      repository,
      input: {
        sessionId: "effort-session",
        sessionExerciseId: "effort-exercise",
        expectedExerciseRevision: 1,
        effort: "on_target",
        recordedAtMs: 2_100,
      },
    });
    expect(recorded.effort).toBe("on_target");
    await expect(recordExerciseEffort({
      repository,
      input: {
        sessionId: "effort-session",
        sessionExerciseId: "effort-exercise",
        expectedExerciseRevision: recorded.revision,
        effort: "easy",
        recordedAtMs: 2_200,
      },
    })).rejects.toThrow("exercise_effort_already_recorded");
  });

  it("accepts a recommendation only when the copied target revision matches", async () => {
    const { kernel, repository, targetId } = await setupRecommendation();
    const accepted = await acceptRecommendation({
      repository,
      input: {
        recommendationId: "recommendation-1",
        decidedAtMs: 1_786_854_000_000,
      },
    });
    expect(accepted.status).toBe("accepted");
    expect(await kernel.queryAll<{ target_json: string; revision: number }>(
      `SELECT target_json, revision FROM plan_working_set_targets WHERE id = ?`,
      [targetId],
    )).toEqual([
      expect.objectContaining({
        revision: 2,
        target_json: expect.stringContaining("\"targetReps\":[8,8,8]"),
      }),
    ]);
    const plans = createPlansWorkoutRepository(kernel);
    const activation = await plans.getActivation();
    const session = await startWorkout({
      repository: plans,
      request: {
        mode: "scheduled",
        planId: activation!.plan.id,
        planDayId: activation!.days[0]!.id,
        localDate: "2026-08-18",
        timezone: "Asia/Singapore",
        startedAtMs: 1_786_940_000_000,
      },
    });
    const [nextSet] = await kernel.queryAll<{
      target_json: string;
    }>(
      `SELECT ss.target_json
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       WHERE se.session_id = ?
         AND se.ordinal = 0
         AND ss.set_kind = 'working'
         AND ss.ordinal = 0`,
      [session.id],
    );
    expect(JSON.parse(nextSet!.target_json)).toEqual(
      expect.objectContaining({
        minReps: 6,
        maxReps: 8,
        targetReps: [8, 8, 8],
      }),
    );
  });

  it("keeps historical empty target payloads readable while retaining source observations", async () => {
    const { kernel, repository } = await setupRecommendation();
    await kernel.write((transaction) => transaction.execute(
      `UPDATE session_sets
       SET target_json = '{}'
       WHERE id = 'recommendation-source-set'`,
    ));

    await expect(repository.getSessionDetail("recommendation-source-session"))
      .resolves.toMatchObject({
        exercises: [expect.objectContaining({
          topWorkingSet: "60 kg × 8",
          workingSets: [expect.objectContaining({
            target: expect.objectContaining({
              profile: "load_reps",
              loadGrams: 0,
              minReps: 1,
              maxReps: 1,
            }),
          })],
        })],
      });
  });

  it("shows accepted same and mixed per-set aims on Today without changing the policy range", async () => {
    const { kernel, repository, targetId } = await setupRecommendation();
    await acceptRecommendation({
      repository,
      input: {
        recommendationId: "recommendation-1",
        decidedAtMs: 1_786_854_000_000,
      },
    });
    const plans = createPlansWorkoutRepository(kernel);
    const sameAim = await plans.getTodayView({
      localDate: "2026-08-17",
      weekday: 1,
    });
    expect(sameAim.state).toBe("scheduled");
    if (sameAim.state !== "scheduled") {
      throw new Error("scheduled_today_expected");
    }
    expect(sameAim.exercises[0]).toEqual(
      expect.objectContaining({ nextTarget: "60 kg × 8" }),
    );

    const [target] = await kernel.queryAll<{ plan_day_exercise_id: string }>(
      `SELECT plan_day_exercise_id
       FROM plan_working_set_targets WHERE id = ?`,
      [targetId],
    );
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE plan_working_set_targets
         SET target_json = json_set(
           target_json,
           '$.targetReps',
           json_array(8, 8, 7)
         )
         WHERE plan_day_exercise_id = ?`,
        [target!.plan_day_exercise_id],
      );
    });
    const mixedAim = await plans.getTodayView({
      localDate: "2026-08-17",
      weekday: 1,
    });
    expect(mixedAim.state).toBe("scheduled");
    if (mixedAim.state !== "scheduled") {
      throw new Error("scheduled_today_expected");
    }
    expect(mixedAim.exercises[0]).toEqual(
      expect.objectContaining({ nextTarget: "60 kg × 8 / 8 / 7" }),
    );
  });

  it("uses pending per-set recommendation aims as the next workout value source", async () => {
    const { kernel } = await setupRecommendation();
    const plans = createPlansWorkoutRepository(kernel);
    const activation = await plans.getActivation();
    const session = await startWorkout({
      repository: plans,
      request: {
        mode: "scheduled",
        planId: activation!.plan.id,
        planDayId: activation!.days[0]!.id,
        localDate: "2026-08-17",
        timezone: "Asia/Singapore",
        startedAtMs: 1_786_853_600_000,
      },
    });

    const view = await createWorkoutRepository(kernel)
      .getActiveWorkout(session.id);
    const firstSet = view.currentExercise.workingSets[0]!;
    expect(firstSet.target).toMatchObject({
      minReps: 6,
      maxReps: 8,
    });
    expect(firstSet.valueSources[0]).toEqual({
      source: "recommended",
      observation: {
        version: 1,
        profile: "load_reps",
        loadGrams: 60_000,
        reps: 8,
        source: "recommended",
      },
    });
  });

  it("supersedes stale acceptance and preserves a manually edited target", async () => {
    const { kernel, repository, targetId } = await setupRecommendation();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE plan_working_set_targets
         SET load_grams = 65_000,
             target_json = json_set(target_json, '$.loadGrams', 65000),
             revision = revision + 1
         WHERE id = ?`,
        [targetId],
      );
    });

    const result = await acceptRecommendation({
      repository,
      input: {
        recommendationId: "recommendation-1",
        decidedAtMs: 1_786_854_000_000,
      },
    });
    expect(result.status).toBe("superseded");
    expect(await kernel.queryAll<{ load_grams: number; revision: number }>(
      `SELECT load_grams, revision FROM plan_working_set_targets WHERE id = ?`,
      [targetId],
    )).toEqual([{ load_grams: 65_000, revision: 2 }]);
  });

  it("supersedes a legacy pending row instead of applying unverifiable evidence", async () => {
    const { kernel, repository, targetId } = await setupRecommendation();
    await kernel.write((transaction) => transaction.execute(
      `UPDATE progression_recommendations
       SET evidence_version = 1
       WHERE id = 'recommendation-1'`,
    ));

    await expect(acceptRecommendation({
      repository,
      input: {
        recommendationId: "recommendation-1",
        decidedAtMs: 1_786_854_000_000,
      },
    })).resolves.toEqual({
      recommendationId: "recommendation-1",
      status: "superseded",
    });
    await expect(kernel.queryAll(
      `SELECT revision FROM plan_working_set_targets WHERE id = ?`,
      [targetId],
    )).resolves.toEqual([{ revision: 1 }]);
  });

  it("supersedes a recommendation whose immutable source session is voided", async () => {
    const { kernel, repository, targetId } = await setupRecommendation();
    await kernel.write((transaction) => transaction.execute(
      `UPDATE workout_sessions
       SET status = 'voided'
       WHERE id = 'recommendation-source-session'`,
    ));

    await expect(acceptRecommendation({
      repository,
      input: {
        recommendationId: "recommendation-1",
        decidedAtMs: 1_786_854_000_000,
      },
    })).resolves.toEqual({
      recommendationId: "recommendation-1",
      status: "superseded",
    });
    await expect(kernel.queryAll(
      `SELECT revision FROM plan_working_set_targets WHERE id = ?`,
      [targetId],
    )).resolves.toEqual([{ revision: 1 }]);
  });

  it("supersedes evidence that omits sibling targets from its accepted scope", async () => {
    const { kernel, repository, targetId } = await setupRecommendation();
    await kernel.write((transaction) => transaction.execute(
      `UPDATE progression_recommendations
       SET evidence_json = json_set(
         evidence_json,
         '$.targetScope',
         json_array(json_object('id', ?, 'revision', 1))
       )
       WHERE id = 'recommendation-1'`,
      [targetId],
    ));

    await expect(acceptRecommendation({
      repository,
      input: {
        recommendationId: "recommendation-1",
        decidedAtMs: 1_786_854_000_000,
      },
    })).resolves.toEqual({
      recommendationId: "recommendation-1",
      status: "superseded",
    });
  });

  it("supersedes a v2 recommendation after its source session revision changes", async () => {
    const { kernel, repository, sessionId } = await setupCompletedWorkout();
    await repository.generateRecommendationsForSession(
      sessionId,
      2,
      1_786_853_900_000,
    );
    const [before] = await kernel.queryAll<{
      id: string;
      target_id: string;
      target_json: string;
      revision: number;
    }>(
      `SELECT recommendation.id, recommendation.plan_working_set_target_id AS target_id,
              target.target_json, target.revision
       FROM progression_recommendations recommendation
       JOIN plan_working_set_targets target
         ON target.id = recommendation.plan_working_set_target_id
       WHERE recommendation.status = 'pending'`,
    );
    await kernel.write((transaction) => transaction.execute(
      `UPDATE workout_sessions
       SET revision = revision + 1
       WHERE id = ?`,
      [sessionId],
    ));

    await expect(acceptRecommendation({
      repository,
      input: {
        recommendationId: before!.id,
        decidedAtMs: 1_786_854_000_000,
      },
    })).resolves.toEqual({
      recommendationId: before!.id,
      status: "superseded",
    });
    await expect(kernel.queryAll(
      `SELECT target_json, revision
       FROM plan_working_set_targets
       WHERE id = ?`,
      [before!.target_id],
    )).resolves.toEqual([{
      target_json: before!.target_json,
      revision: before!.revision,
    }]);
  });

  it("supersedes a semantically malformed v2 envelope without mutating its target", async () => {
    const { kernel, repository, targetId } = await setupRecommendation();
    const [before] = await kernel.queryAll<{
      target_json: string;
      revision: number;
    }>(
      `SELECT target_json, revision
       FROM plan_working_set_targets
       WHERE id = ?`,
      [targetId],
    );
    await kernel.write((transaction) => transaction.execute(
      `UPDATE progression_recommendations
       SET evidence_json = json_set(evidence_json, '$.unexpected', 'value')
       WHERE id = 'recommendation-1'`,
    ));

    await expect(acceptRecommendation({
      repository,
      input: {
        recommendationId: "recommendation-1",
        decidedAtMs: 1_786_854_000_000,
      },
    })).resolves.toEqual({
      recommendationId: "recommendation-1",
      status: "superseded",
    });
    await expect(kernel.queryAll(
      `SELECT target_json, revision
       FROM plan_working_set_targets
       WHERE id = ?`,
      [targetId],
    )).resolves.toEqual([before]);
  });

  it("rejects a mismatched actionable evidence table version", async () => {
    const { kernel } = await setupRecommendation();

    await expect(kernel.write((transaction) => transaction.execute(
      `UPDATE progression_recommendations
       SET evidence_version = 3
       WHERE id = 'recommendation-1'`,
    ))).rejects.toThrow("sqlite_transaction_failed");
  });

  it("rejects removal of an actionable evidence target scope", async () => {
    const { kernel } = await setupRecommendation();

    await expect(kernel.write((transaction) => transaction.execute(
      `UPDATE progression_recommendations
       SET evidence_json = json_remove(evidence_json, '$.targetScope')
       WHERE id = 'recommendation-1'`,
    ))).rejects.toThrow("sqlite_transaction_failed");
  });

  it("keeps the current target by rejecting without mutation", async () => {
    const { kernel, repository, targetId } = await setupRecommendation();
    const result = await keepCurrentTarget({
      repository,
      input: {
        recommendationId: "recommendation-1",
        decidedAtMs: 1_786_854_000_000,
      },
    });
    expect(result.status).toBe("rejected");
    expect(await kernel.queryAll<{ load_grams: number; revision: number }>(
      `SELECT load_grams, revision FROM plan_working_set_targets WHERE id = ?`,
      [targetId],
    )).toEqual([{ load_grams: 60_000, revision: 1 }]);
  });

  it("rejects a keep-current decision for an unknown recommendation", async () => {
    const { repository } = await setupRecommendation();

    await expect(keepCurrentTarget({
      repository,
      input: {
        recommendationId: "recommendation-missing",
        decidedAtMs: 1_786_854_000_000,
      },
    })).rejects.toThrow("sqlite_transaction_failed");
  });

  it("rejects repeated decisions after the pending lifecycle has closed", async () => {
    const { repository } = await setupRecommendation();
    await keepCurrentTarget({
      repository,
      input: {
        recommendationId: "recommendation-1",
        decidedAtMs: 1_786_854_000_000,
      },
    });

    await expect(acceptRecommendation({
      repository,
      input: {
        recommendationId: "recommendation-1",
        decidedAtMs: 1_786_854_001_000,
      },
    })).rejects.toThrow("sqlite_transaction_failed");
    await expect(keepCurrentTarget({
      repository,
      input: {
        recommendationId: "recommendation-1",
        decidedAtMs: 1_786_854_001_000,
      },
    })).rejects.toThrow("sqlite_transaction_failed");
  });
});
