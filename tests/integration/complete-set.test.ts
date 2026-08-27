import {
  afterEach,
  describe,
  expect,
  it,
  jest,
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
  type HapticsPort,
} from "../../src/domains/workout/hapticsPort";
import type {
  ActiveWorkoutView,
} from "../../src/domains/workout/activeWorkout";
import {
  addWorkingSet,
  addWarmup,
  completeSet,
  completeWarmup,
  copyPreviousWarmup,
  reviseCompletedSet,
  skipWorkingSet,
  skipWarmup,
  updateActiveSetDraft,
  updateWarmupDraft,
} from "../../src/domains/workout/setCommands";
import {
  startWorkout,
} from "../../src/domains/workout/startWorkout";
import {
  undoCompletedSet,
} from "../../src/domains/workout/undoCompletedSet";
import {
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
  configureSqliteConnection,
} from "../../src/platform/sqlite/connection";
import {
  migrations,
} from "../../src/platform/sqlite/migrations";
import {
  createMigrationRunner,
} from "../../src/platform/sqlite/migrationRunner";
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

const temporaryDirectories = new Set<string>();
const kernels: SqliteKernel[] = [];

afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

async function createKernel(
  observer: SqliteKernelTestObserver = {},
): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-complete-set-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer }, observer);
  const recoveryBackup: RecoveryBackupPort = {
    createAndValidate: async (request) => ({
      backupId: `complete-set-${request.fromVersion}-${request.toVersion}`,
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

async function setupActiveWorkout(
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
    plans,
    repository: createWorkoutRepository(kernel),
    activation,
    session,
  };
}

function haptics(): HapticsPort & {
  committed: jest.MockedFunction<HapticsPort["committed"]>;
} {
  return {
    committed: jest.fn(async () => undefined),
  };
}

describe("Plan 01-08 persisted values and value sources", () => {
  it("loads a valid empty workout without fabricating an exercise", async () => {
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

    await expect(createWorkoutRepository(kernel).getWorkoutSession(session.id))
      .resolves.toEqual({
        state: "empty_workout",
        id: session.id,
        status: "in_progress",
        revision: 1,
        activeSetId: null,
        activeExerciseId: null,
        progress: {
          completedWorkingSets: 0,
          totalWorkingSets: 0,
        },
        rest: {
          version: 1,
          state: "idle",
          revision: 0,
          nextSetId: null,
        },
      });
  });

  it("persists draft values and restores them from source state", async () => {
    const { repository, session } = await setupActiveWorkout();
    const initial = await repository.getActiveWorkout(session.id);
    const working = initial.currentExercise.workingSets[0]!;

    await updateActiveSetDraft({
      repository,
      input: {
        sessionId: session.id,
        setId: working.id,
        expectedSetRevision: working.revision,
        metricIdentity: working.metricIdentity,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 62_500,
          reps: 7,
          source: "manual",
        },
        updatedAtMs: 1_786_853_601_000,
      },
    });

    const restored = await repository.getActiveWorkout(session.id);
    expect(restored.currentExercise.workingSets[0]).toEqual(
      expect.objectContaining({
        status: "draft",
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 62_500,
          reps: 7,
          source: "manual",
        },
      }),
    );
  });

  it("offers recommended, last comparable, plan default, and manual in order", async () => {
    const { kernel, repository, activation, session } =
      await setupActiveWorkout();
    const active = await repository.getActiveWorkout(session.id);
    const working = active.currentExercise.workingSets[0]!;
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO workout_sessions
          (id, plan_id, plan_day_id, source, status, local_date, timezone,
           started_at_ms, completed_at_ms, active_session_exercise_id,
           active_set_id, revision)
         VALUES ('history-session', ?, ?, 'scheduled_day', 'completed',
                 '2026-08-15', 'Asia/Singapore', 1000, 2000, NULL, NULL, 1)`,
        [activation.plan.id, activation.days[0]!.id],
      );
      await transaction.execute(
        `INSERT INTO session_exercises
          (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
           exercise_name, metric_profile, metric_contract_version,
           exercise_metric_generation, default_rest_seconds,
           target_revision, status, revision)
         VALUES ('history-exercise', 'history-session', NULL,
                 '5f140001-7e35-4a6d-9100-000000000001', 0,
                 'Back Squat', 'load_reps', 1, 1, 180, 1, 'completed', 1)`,
      );
      await transaction.execute(
        `INSERT INTO session_sets
          (id, session_exercise_id, set_kind, ordinal,
           source_plan_working_set_target_id,
           target_load_grams, target_min_reps, target_max_reps,
           target_json, unit_json, rule_type, rule_version,
           metric_profile, metric_contract_version,
           exercise_metric_generation,
           observed_load_grams, observed_reps, observed_json, status,
           draft_updated_at_ms, completed_at_ms,
           completion_idempotency_key, revision)
         VALUES ('history-set', 'history-exercise', 'working', 0, NULL,
                 60000, 6, 8, '{}', '{}', 'load_reps', 1,
                 'load_reps', 1, 1,
                 60000, 7,
                 '{"version":1,"profile":"load_reps","loadGrams":60000,"reps":7,"source":"manual"}',
                 'completed', 1500, 1600, 'history-complete', 1)`,
      );
      await transaction.execute(
        `INSERT INTO progression_recommendations
          (id, exercise_id, plan_working_set_target_id, rule_type,
           rule_version, evidence_version, evidence_json,
           current_target_json, proposed_target_json, status,
           metric_profile, metric_contract_version,
           exercise_metric_generation,
           source_revision, target_revision, created_at_ms, decided_at_ms)
         VALUES ('recommended-values',
                 '5f140001-7e35-4a6d-9100-000000000001',
                 ?, 'load_reps', 1, 1, '{}',
                 '{"loadGrams":60000,"reps":8}',
                 '{"loadGrams":62500,"reps":6}',
                 'pending', 'load_reps', 1, 1, 1, 1, 3000, NULL)`,
        [working.sourceTargetId],
      );
    });

    const view = await repository.getActiveWorkout(session.id);
    expect(view.currentExercise.workingSets[0]?.valueSources).toEqual([
      {
        source: "recommended",
        observation: expect.objectContaining({
          loadGrams: 62_500,
          reps: 6,
        }),
      },
      {
        source: "last_workout",
        observation: expect.objectContaining({
          loadGrams: 60_000,
          reps: 7,
        }),
      },
      {
        source: "plan_default",
        observation: expect.objectContaining({
          loadGrams: 60_000,
          reps: 8,
        }),
      },
      {
        source: "manual",
        observation: expect.objectContaining({
          loadGrams: 60_000,
          reps: 8,
        }),
      },
    ]);
  });
});

describe("Plan 01-08 warm-up commands", () => {
  it("adds, copies, completes, and skips warm-ups without working evidence", async () => {
    const { kernel, repository, session } = await setupActiveWorkout();
    const initial = await repository.getActiveWorkout(session.id);
    const first = initial.currentExercise.warmups[0]!;

    await updateWarmupDraft({
      repository,
      input: {
        sessionId: session.id,
        setId: first.id,
        expectedSetRevision: first.revision,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 25_000,
          reps: 6,
          source: "manual",
        },
        updatedAtMs: 1_786_853_600_900,
      },
    });
    await addWarmup({
      repository,
      input: {
        sessionId: session.id,
        sessionExerciseId: initial.currentExercise.id,
        setId: "added-warmup",
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 45_000,
          reps: 4,
          source: "manual",
        },
        nowMs: 1_786_853_601_000,
      },
    });
    await copyPreviousWarmup({
      repository,
      input: {
        sessionId: session.id,
        sourceSetId: first.id,
        setId: "copied-warmup",
        nowMs: 1_786_853_601_100,
      },
    });
    await completeWarmup({
      repository,
      input: {
        sessionId: session.id,
        setId: "added-warmup",
        expectedSetRevision: 1,
        completedAtMs: 1_786_853_601_200,
      },
    });
    await skipWarmup({
      repository,
      input: {
        sessionId: session.id,
        setId: "copied-warmup",
        expectedSetRevision: 1,
        skippedAtMs: 1_786_853_601_300,
      },
    });

    const view = await repository.getActiveWorkout(session.id);
    expect(view.currentExercise.warmups).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: first.id,
        observation: expect.objectContaining({
          loadGrams: 25_000,
          reps: 6,
        }),
      }),
      expect.objectContaining({ id: "added-warmup", status: "completed" }),
      expect.objectContaining({ id: "copied-warmup", status: "skipped" }),
    ]));
    expect(await kernel.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM pending_effects
       WHERE effect_type = 'regenerate_load_reps_recommendation'`,
    )).toEqual([{ count: 0 }]);
    expect(view.progress.completedWorkingSets).toBe(0);
  });
});

describe("Plan 01-10 working-set structure commands", () => {
  it("adds a session-only working set and skips the active set without starting rest", async () => {
    const { kernel, repository, session } = await setupActiveWorkout();
    const initial = await repository.getActiveWorkout(session.id);
    const source = initial.currentExercise.workingSets.at(-1)!;

    const withAddedSet = await addWorkingSet({
      repository,
      input: {
        sessionId: session.id,
        sessionExerciseId: initial.currentExercise.id,
        sourceSetId: source.id,
        setId: "added-working-set",
        nowMs: 1_786_853_601_000,
      },
    });

    expect(withAddedSet.currentExercise.workingSets.at(-1)).toEqual(
      expect.objectContaining({
        id: "added-working-set",
        kind: "working",
        sourceTargetId: null,
        status: "draft",
        observation: expect.objectContaining({ source: "manual" }),
      }),
    );
    expect(withAddedSet.progress.totalWorkingSets)
      .toBe(initial.progress.totalWorkingSets + 1);

    const active = withAddedSet.currentExercise.workingSets.find(
      ({ id }) => id === withAddedSet.activeSetId,
    )!;
    const skipped = await skipWorkingSet({
      repository,
      input: {
        sessionId: session.id,
        setId: active.id,
        expectedSessionRevision: withAddedSet.revision,
        expectedSetRevision: active.revision,
        metricIdentity: active.metricIdentity,
        skippedAtMs: 1_786_853_601_100,
      },
    });

    expect(skipped.currentExercise.workingSets[0]).toEqual(
      expect.objectContaining({ id: active.id, status: "skipped" }),
    );
    expect(skipped.activeSetId).toBe(
      skipped.currentExercise.workingSets[1]?.id,
    );
    expect(skipped.rest).toEqual(expect.objectContaining({ state: "idle" }));
    expect(await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM pending_effects",
    )).toEqual([{ count: 0 }]);
  });
});

describe("Plan 01-08 exactly-once completeSet and Undo", () => {
  it("keeps completion and every post-commit probe pending until commit resolves", async () => {
    let holdCommit = false;
    let enteredCommit: (() => void) | undefined;
    let releaseCommit: (() => void) | undefined;
    const commitEntered = new Promise<void>((resolve) => {
      enteredCommit = resolve;
    });
    const commitRelease = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const { kernel, repository, session } = await setupActiveWorkout({
      beforeCommit: async () => {
        if (holdCommit) {
          enteredCommit?.();
          await commitRelease;
        }
      },
    });
    const initial = await repository.getActiveWorkout(session.id);
    const working = initial.currentExercise.workingSets[0]!;
    const haptic = haptics();
    const invalidate = jest.fn(async () => undefined);
    const drainEffects = jest.fn(async () => undefined);
    holdCommit = true;

    const completion = completeSet({
      repository,
      haptics: haptic,
      invalidate,
      drainEffects,
      input: {
        sessionId: session.id,
        setId: working.id,
        expectedSessionRevision: initial.revision,
        expectedSetRevision: working.revision,
        completionIdempotencyKey: "held-commit",
        metricIdentity: working.metricIdentity,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          reps: 8,
          source: "manual",
        },
        completedAtMs: 1_786_853_602_000,
      },
    });
    await commitEntered;

    expect(haptic.committed).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(drainEffects).not.toHaveBeenCalled();
    expect(await kernel.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM session_sets
       WHERE id = ? AND status = 'completed'`,
      [working.id],
    )).toEqual([{ count: 0 }]);

    releaseCommit?.();
    await expect(completion).resolves.toMatchObject({ outcome: "committed" });
    expect(haptic.committed).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(drainEffects).toHaveBeenCalledTimes(1);
  });

  it("commits rapid duplicate completion once and runs post-commit probes once", async () => {
    const { kernel, repository, session } = await setupActiveWorkout();
    const initial = await repository.getActiveWorkout(session.id);
    const working = initial.currentExercise.workingSets[0]!;
    const haptic = haptics();
    const invalidate = jest.fn(async () => undefined);
    const drainEffects = jest.fn(async () => undefined);
    const input = {
      sessionId: session.id,
      setId: working.id,
      expectedSessionRevision: initial.revision,
      expectedSetRevision: working.revision,
      completionIdempotencyKey: "complete-first-working",
      metricIdentity: working.metricIdentity,
      observation: {
        version: 1 as const,
        profile: "load_reps" as const,
        loadGrams: 60_000,
        reps: 8,
        source: "plan_default" as const,
      },
      completedAtMs: 1_786_853_602_000,
    };

    const [first, second] = await Promise.all([
      completeSet({
        repository,
        haptics: haptic,
        invalidate,
        drainEffects,
        input,
      }),
      completeSet({
        repository,
        haptics: haptic,
        invalidate,
        drainEffects,
        input,
      }),
    ]);

    expect([first.outcome, second.outcome].sort()).toEqual([
      "already_completed",
      "committed",
    ]);
    expect(haptic.committed).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(drainEffects).toHaveBeenCalledTimes(1);
    expect(await kernel.queryAll<{
      completed: number;
      effects: number;
      undo: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM session_sets
          WHERE id = ? AND status = 'completed') AS completed,
         (SELECT COUNT(*) FROM pending_effects
          WHERE idempotency_key = 'rest:complete-first-working') AS effects,
         (SELECT COUNT(*) FROM session_undo_snapshots
          WHERE completed_set_id = ? AND consumed_at_ms IS NULL) AS undo`,
      [working.id, working.id],
    )).toEqual([{ completed: 1, effects: 1, undo: 1 }]);
  });

  it("returns committed source state when post-commit derivatives fail", async () => {
    const { repository, session } = await setupActiveWorkout();
    const initial = await repository.getActiveWorkout(session.id);
    const working = initial.currentExercise.workingSets[0]!;

    await expect(completeSet({
      repository,
      haptics: {
        committed: async () => {
          throw new Error("haptic_failed");
        },
      },
      invalidate: async () => {
        throw new Error("invalidation_failed");
      },
      drainEffects: async () => {
        throw new Error("effect_drain_failed");
      },
      input: {
        sessionId: session.id,
        setId: working.id,
        expectedSessionRevision: initial.revision,
        expectedSetRevision: working.revision,
        completionIdempotencyKey: "derivatives-fail",
        metricIdentity: working.metricIdentity,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          reps: 8,
          source: "manual",
        },
        completedAtMs: 1_786_853_602_000,
      },
    })).resolves.toMatchObject({ outcome: "committed" });

    await expect(repository.getActiveWorkout(session.id)).resolves
      .toMatchObject({
        currentExercise: {
          workingSets: [
            expect.objectContaining({ status: "completed" }),
            expect.anything(),
            expect.anything(),
          ],
        },
      });
  });

  it("does not acknowledge, advance, rest, effect, or haptic when commit fails", async () => {
    let failCommit = false;
    const { kernel, repository, session } = await setupActiveWorkout({
      beforeCommit: async () => {
        if (failCommit) {
          failCommit = false;
          throw new Error("injected_commit_failure");
        }
      },
    });
    const initial = await repository.getActiveWorkout(session.id);
    const working = initial.currentExercise.workingSets[0]!;
    const haptic = haptics();
    const invalidate = jest.fn(async () => undefined);
    const drainEffects = jest.fn(async () => undefined);
    failCommit = true;

    await expect(completeSet({
      repository,
      haptics: haptic,
      invalidate,
      drainEffects,
      input: {
        sessionId: session.id,
        setId: working.id,
        expectedSessionRevision: initial.revision,
        expectedSetRevision: working.revision,
        completionIdempotencyKey: "failed-complete",
        metricIdentity: working.metricIdentity,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          reps: 8,
          source: "manual",
        },
        completedAtMs: 1_786_853_602_000,
      },
    })).rejects.toMatchObject({ code: "sqlite_commit_failed" });

    const restored = await repository.getActiveWorkout(session.id);
    expect(restored.activeSetId).toBe(initial.activeSetId);
    expect(restored.revision).toBe(initial.revision);
    expect(restored.currentExercise.workingSets[0]).toEqual(
      expect.objectContaining({ status: "planned" }),
    );
    expect(haptic.committed).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(drainEffects).not.toHaveBeenCalled();
    expect(await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM pending_effects",
    )).toEqual([{ count: 0 }]);
    expect(await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM session_rest_states",
    )).toEqual([{ count: 0 }]);

    await expect(completeSet({
      repository,
      haptics: haptic,
      invalidate,
      drainEffects,
      input: {
        sessionId: session.id,
        setId: working.id,
        expectedSessionRevision: initial.revision,
        expectedSetRevision: working.revision,
        completionIdempotencyKey: "retry-failed-complete",
        metricIdentity: working.metricIdentity,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          reps: 8,
          source: "manual",
        },
        completedAtMs: 1_786_853_602_100,
      },
    })).resolves.toMatchObject({ outcome: "committed" });
    expect(haptic.committed).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(drainEffects).toHaveBeenCalledTimes(1);
  });

  it("undoes before eight seconds and is unavailable at or after expiry", async () => {
    const { repository, session } = await setupActiveWorkout();
    const initial = await repository.getActiveWorkout(session.id);
    const working = initial.currentExercise.workingSets[0]!;
    const completedAtMs = 1_786_853_602_000;
    await completeSet({
      repository,
      haptics: haptics(),
      invalidate: async () => undefined,
      drainEffects: async () => undefined,
      input: {
        sessionId: session.id,
        setId: working.id,
        expectedSessionRevision: initial.revision,
        expectedSetRevision: working.revision,
        completionIdempotencyKey: "undoable-complete",
        metricIdentity: working.metricIdentity,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          reps: 8,
          source: "manual",
        },
        completedAtMs,
      },
    });

    const undone = await undoCompletedSet({
      repository,
      input: {
        sessionId: session.id,
        completedSetId: working.id,
        nowMs: completedAtMs + 7_999,
      },
    });
    expect(undone.outcome).toBe("undone");
    if (undone.outcome !== "undone") {
      throw new Error("expected completed set to be undone");
    }
    expect(undone.view.activeSetId).toBe(working.id);
    expect(undone.view.currentExercise.workingSets[0]).toEqual(
      expect.objectContaining({ status: "planned" }),
    );

    const next = undone.view.currentExercise.workingSets[0]!;
    await completeSet({
      repository,
      haptics: haptics(),
      invalidate: async () => undefined,
      drainEffects: async () => undefined,
      input: {
        sessionId: session.id,
        setId: next.id,
        expectedSessionRevision: undone.view.revision,
        expectedSetRevision: next.revision,
        completionIdempotencyKey: "expired-undo-complete",
        metricIdentity: next.metricIdentity,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          reps: 8,
          source: "manual",
        },
        completedAtMs: completedAtMs + 10_000,
      },
    });
    await expect(undoCompletedSet({
      repository,
      input: {
        sessionId: session.id,
        completedSetId: next.id,
        nowMs: completedAtMs + 18_000,
      },
    })).resolves.toEqual({ outcome: "unavailable" });
  });
});

describe("Plan 02-27 completed working-set correction", () => {
  async function completedWorkingSetFixture(
    observer: SqliteKernelTestObserver = {},
  ) {
    const runtime = await setupActiveWorkout(observer);
    const initial = await runtime.repository.getActiveWorkout(runtime.session.id);
    const first = initial.currentExercise.workingSets[0]!;
    const completed = await completeSet({
      repository: runtime.repository,
      haptics: haptics(),
      invalidate: async () => undefined,
      drainEffects: async () => undefined,
      input: {
        sessionId: runtime.session.id,
        setId: first.id,
        expectedSessionRevision: initial.revision,
        expectedSetRevision: first.revision,
        completionIdempotencyKey: "complete-correction-fixture",
        metricIdentity: first.metricIdentity,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          reps: 8,
          source: "manual",
        },
        completedAtMs: 1_786_853_602_000,
      },
    });
    return {
      ...runtime,
      initial,
      first,
      completed: completed.view,
    };
  }

  function correctionInput(input: Readonly<{
    sessionId: string;
    view: ActiveWorkoutView;
    set: ActiveWorkoutView["currentExercise"]["workingSets"][number];
  }>) {
    return {
      sessionId: input.sessionId,
      setId: input.set.id,
      expectedSessionRevision: input.view.revision,
      expectedSetRevision: input.set.revision,
      correctionIdempotencyKey: `correct:${input.sessionId}:${input.set.id}:${input.set.revision}`,
      metricIdentity: input.set.metricIdentity,
      observation: {
        version: 1 as const,
        profile: "load_reps" as const,
        loadGrams: 62_500,
        reps: 7,
        source: "manual" as const,
      },
      revisedAtMs: 1_786_853_604_000,
    };
  }

  it("updates only a selected completed working set while preserving later progress, pointer, rest, and snapshots", async () => {
    const { kernel, repository, session } = await setupActiveWorkout();
    const initial = await repository.getActiveWorkout(session.id);
    const first = initial.currentExercise.workingSets[0]!;

    const firstCompleted = await completeSet({
      repository,
      haptics: haptics(),
      invalidate: async () => undefined,
      drainEffects: async () => undefined,
      input: {
        sessionId: session.id,
        setId: first.id,
        expectedSessionRevision: initial.revision,
        expectedSetRevision: first.revision,
        completionIdempotencyKey: "complete-before-correction",
        metricIdentity: first.metricIdentity,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          reps: 8,
          source: "manual",
        },
        completedAtMs: 1_786_853_602_000,
      },
    });
    const second = firstCompleted.view.currentExercise.workingSets[1]!;
    const laterCompleted = await completeSet({
      repository,
      haptics: haptics(),
      invalidate: async () => undefined,
      drainEffects: async () => undefined,
      input: {
        sessionId: session.id,
        setId: second.id,
        expectedSessionRevision: firstCompleted.view.revision,
        expectedSetRevision: second.revision,
        completionIdempotencyKey: "complete-later-before-correction",
        metricIdentity: second.metricIdentity,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          reps: 8,
          source: "manual",
        },
        completedAtMs: 1_786_853_603_000,
      },
    });
    const beforeRows = await kernel.queryAll<Readonly<{
      id: string;
      observed_json: string | null;
      status: string;
      revision: number;
    }>>(
      `SELECT id, observed_json, status, revision
       FROM session_sets
       WHERE session_exercise_id = ? AND id <> ?
       ORDER BY ordinal`,
      [laterCompleted.view.currentExercise.id, first.id],
    );
    const beforeSnapshots = await kernel.queryAll<Readonly<{
      id: string;
      snapshot_json: string;
    }>>(
      `SELECT id, snapshot_json
       FROM session_undo_snapshots
       WHERE session_id = ?
       ORDER BY id`,
      [session.id],
    );
    const restBefore = laterCompleted.view.rest;

    const corrected = await reviseCompletedSet({
      repository,
      input: {
        sessionId: session.id,
        setId: first.id,
        expectedSessionRevision: laterCompleted.view.revision,
        expectedSetRevision: firstCompleted.view.currentExercise.workingSets[0]!.revision,
        correctionIdempotencyKey: "correct-first-set-revision-2",
        metricIdentity: first.metricIdentity,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 62_500,
          reps: 7,
          source: "manual",
        },
        revisedAtMs: 1_786_853_604_000,
      },
    });

    expect(corrected).toEqual(expect.objectContaining({
      activeExerciseId: laterCompleted.view.activeExerciseId,
      activeSetId: laterCompleted.view.activeSetId,
      rest: restBefore,
    }));
    expect(corrected.currentExercise.workingSets[0]).toEqual(
      expect.objectContaining({
        id: first.id,
        status: "completed",
        observation: expect.objectContaining({
          loadGrams: 62_500,
          reps: 7,
        }),
      }),
    );
    expect(await kernel.queryAll(
      `SELECT id, observed_json, status, revision
       FROM session_sets
       WHERE session_exercise_id = ? AND id <> ?
       ORDER BY ordinal`,
      [laterCompleted.view.currentExercise.id, first.id],
    )).toEqual(beforeRows);
    expect(await kernel.queryAll(
      `SELECT id, snapshot_json
       FROM session_undo_snapshots
       WHERE session_id = ?
       ORDER BY id`,
      [session.id],
    )).toEqual(beforeSnapshots);
  });

  it("rejects stale correction replay without changing the committed correction", async () => {
    const { repository, session, completed } = await completedWorkingSetFixture();
    const first = completed.currentExercise.workingSets[0]!;
    const input = correctionInput({
      sessionId: session.id,
      view: completed,
      set: first,
    });

    const corrected = await reviseCompletedSet({ repository, input });
    await expect(reviseCompletedSet({ repository, input })).rejects
      .toMatchObject({ code: "revise_completed_set_conflict" });
    await expect(repository.getActiveWorkout(session.id)).resolves
      .toEqual(corrected);
  });

  it.each(["completed", "partial", "discarded"] as const)(
    "rejects correction when the authoritative session is %s",
    async (status) => {
      const { kernel, repository, session, completed } =
        await completedWorkingSetFixture();
      const first = completed.currentExercise.workingSets[0]!;
      await kernel.write((transaction) => transaction.execute(
        "UPDATE workout_sessions SET status = ? WHERE id = ?",
        [status, session.id],
      ));

      await expect(reviseCompletedSet({
        repository,
        input: correctionInput({
          sessionId: session.id,
          view: completed,
          set: first,
        }),
      })).rejects.toMatchObject({ code: "revise_completed_set_conflict" });
    },
  );

  it.each([
    ["warm-up", "warmup", "completed"],
    ["skipped working", "working", "skipped"],
    ["active planned working", "working", "planned"],
  ] as const)(
    "rejects a %s target",
    async (...[_name, setKind, status]) => {
      const { kernel, repository, session, completed } =
        await completedWorkingSetFixture();
      const first = completed.currentExercise.workingSets[0]!;
      await kernel.write(async (transaction) => {
        if (setKind === "warmup") {
          await transaction.execute(
            "DELETE FROM session_sets WHERE session_exercise_id = ? AND set_kind = 'warmup'",
            [completed.currentExercise.id],
          );
        }
        await transaction.execute(
          "UPDATE session_sets SET set_kind = ?, status = ? WHERE id = ?",
          [setKind, status, first.id],
        );
      });

      await expect(reviseCompletedSet({
        repository,
        input: correctionInput({
          sessionId: session.id,
          view: completed,
          set: first,
        }),
      })).rejects.toMatchObject({ code: "revise_completed_set_conflict" });
    },
  );

  it("rejects incompatible metric identity without changing the completed source fact", async () => {
    const { kernel, repository, session, completed } =
      await completedWorkingSetFixture();
    const first = completed.currentExercise.workingSets[0]!;
    const before = await kernel.queryAll(
      "SELECT observed_json, revision FROM session_sets WHERE id = ?",
      [first.id],
    );

    await expect(repository.reviseCompletedSet({
      ...correctionInput({ sessionId: session.id, view: completed, set: first }),
      metricIdentity: {
        profile: "timed_hold",
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      observation: {
        version: 1,
        profile: "timed_hold",
        durationSeconds: 45,
        source: "manual",
      },
    })).rejects.toMatchObject({ code: "revise_completed_set_conflict" });
    expect(await kernel.queryAll(
      "SELECT observed_json, revision FROM session_sets WHERE id = ?",
      [first.id],
    )).toEqual(before);
  });

  it("rolls back the selected correction when commit fails", async () => {
    let failCommit = false;
    const { kernel, repository, session, completed } =
      await completedWorkingSetFixture({
        beforeCommit: async () => {
          if (failCommit) {
            failCommit = false;
            throw new Error("injected_correction_commit_failure");
          }
        },
      });
    const first = completed.currentExercise.workingSets[0]!;
    const before = await repository.getActiveWorkout(session.id);
    failCommit = true;

    await expect(reviseCompletedSet({
      repository,
      input: correctionInput({ sessionId: session.id, view: completed, set: first }),
    })).rejects.toMatchObject({ code: "sqlite_commit_failed" });
    await expect(repository.getActiveWorkout(session.id)).resolves.toEqual(before);
    expect(await kernel.queryAll(
      "SELECT COUNT(*) AS count FROM pending_effects",
    )).toEqual([{ count: 1 }]);
  });
});
