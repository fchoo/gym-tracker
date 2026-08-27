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

describe("Plan 01-10 explicit workout outcomes", () => {
  it("finishes completed only when every intended working set is resolved", async () => {
    const { kernel, repository, session } = await setupPlannedWorkout();
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
    const { repository, session } = await setupPlannedWorkout();
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

  it("stores zero working sets only after its exact confirmation", async () => {
    const kernel = await createKernel();
    const plans = createPlansWorkoutRepository(kernel);
    const session = await startWorkout({
      repository: plans,
      request: {
        mode: "empty",
        localDate: "2026-08-17",
        timezone: "Asia/Singapore",
        startedAtMs: 1_786_853_600_000,
      },
    });
    const repository = createWorkoutOutcomeRepository(kernel);

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
      workingSetProgress: { completed: 0, planned: 0, percent: null },
    });
  });

  it("discards an in-progress workout without scheduling a progression replay", async () => {
    const { kernel, repository, session } = await setupPlannedWorkout();

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
    )).resolves.toEqual([{ effect_type: "reconcile_rest_notification" }]);
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
  });

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
