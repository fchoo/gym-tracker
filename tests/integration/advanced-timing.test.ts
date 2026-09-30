import {
  afterEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { createHash } from "node:crypto";
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
  createOwnedPlanDraft,
  saveOwnedPlan,
} from "../../src/domains/plans";
import {
  beginAdvancedTimingClusterGap,
  pauseAdvancedTiming,
  reconcileAdvancedTiming,
  resumeAdvancedTiming,
  skipAdvancedTimingClusterGap,
  startAdvancedTiming,
  stopAdvancedTiming,
  updateSessionExerciseAdvancedTiming,
  updateSessionSetAdvancedTiming,
} from "../../src/domains/advancedTiming";
import {
  completeSet,
  startWorkout,
} from "../../src/domains/workout";
import type {
  SqliteConnection,
  SqlitePreparedResult,
  SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import {
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
  createAdvancedTimingRepository,
} from "../../src/platform/sqlite/repositories/advancedTimingRepository";
import {
  createOwnedPlanRepository,
} from "../../src/platform/sqlite/repositories/ownedPlanRepository";
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
const perRep = {
  version: 1 as const,
  mode: "per_rep" as const,
  intervalMs: 1_000,
  cueChannels: "haptic" as const,
};
const cluster = {
  version: 1 as const,
  mode: "cluster" as const,
  groupSizes: [3, 3, 3] as const,
  intraRestMs: 20_000,
  cueChannels: "haptic" as const,
};
const audioPerRep = {
  version: 1 as const,
  mode: "per_rep" as const,
  intervalMs: 1_200,
  cueChannels: "audio" as const,
};
const bothCluster = {
  version: 1 as const,
  mode: "cluster" as const,
  groupSizes: [2, 2] as const,
  intraRestMs: 15_000,
  cueChannels: "both" as const,
};

async function sha256(value: string): Promise<string> {
  return createHash("sha256").update(value).digest("hex");
}

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
  const directory = mkdtempSync(join(tmpdir(), "gym-advanced-timing-"));
  directories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer }, observer);
  const recoveryBackup: RecoveryBackupPort = {
    createAndValidate: async (request) => ({
      backupId: "advanced-timing",
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

async function setupWorkout(
  observer: SqliteKernelTestObserver = {},
  advancedConfig: typeof perRep | typeof cluster = perRep,
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
  await kernel.write((transaction) => transaction.execute(
    `UPDATE plan_day_exercises
     SET advanced_timing_default_json = ?
     WHERE plan_day_id = ? AND ordinal = 0`,
    [JSON.stringify(advancedConfig), activation.days[0]!.id],
  ));
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
  const [activeSet] = await kernel.queryAll<{ id: string; revision: number }>(
    `SELECT id, revision FROM session_sets
     WHERE id = (
       SELECT active_set_id FROM workout_sessions WHERE id = ?
     )`,
    [session.id],
  );
  const otherSets = await kernel.queryAll<{ id: string }>(
    `SELECT id FROM session_sets
     WHERE session_exercise_id = (
       SELECT session_exercise_id FROM session_sets WHERE id = ?
     ) AND set_kind = 'working' AND id <> ?
     ORDER BY ordinal`,
    [activeSet!.id, activeSet!.id],
  );
  return {
    kernel,
    session,
    activeSet: activeSet!,
    otherSetId: otherSets[0]!.id,
    repository: createAdvancedTimingRepository(kernel),
  };
}

async function protectedFacts(kernel: SqliteKernel, sessionId: string) {
  const [session, sets, rest, undo, restEffects] = await Promise.all([
    kernel.queryAll(
      "SELECT * FROM workout_sessions WHERE id = ?",
      [sessionId],
    ),
    kernel.queryAll(
      `SELECT ss.* FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       WHERE se.session_id = ? ORDER BY ss.id`,
      [sessionId],
    ),
    kernel.queryAll(
      "SELECT * FROM session_rest_states WHERE session_id = ?",
      [sessionId],
    ),
    kernel.queryAll(
      "SELECT * FROM session_undo_snapshots WHERE session_id = ? ORDER BY id",
      [sessionId],
    ),
    kernel.queryAll(
      `SELECT * FROM pending_effects
       WHERE effect_type = 'reconcile_rest_notification'
       ORDER BY id`,
    ),
  ]);
  return { session, sets, rest, undo, restEffects };
}

async function startAndStopTiming(
  fixture: Awaited<ReturnType<typeof setupWorkout>>,
): Promise<void> {
  const started = await startAdvancedTiming({
    repository: fixture.repository,
    input: {
      sessionId: fixture.session.id,
      sessionSetId: fixture.activeSet.id,
      expectedSessionRevision: fixture.session.revision,
      expectedAdvancedTimingRevision: 0,
      nowMs: 10_000,
      config: perRep,
    },
  });
  await stopAdvancedTiming({
    repository: fixture.repository,
    input: {
      sessionId: fixture.session.id,
      sessionSetId: fixture.activeSet.id,
      expectedSessionRevision: fixture.session.revision,
      expectedAdvancedTimingRevision: started.state.revision,
      nowMs: 11_000,
    },
  });
}

type ProtectedSetRow = Readonly<{
  id: string;
  session_exercise_id: string;
  status: string;
  revision: number;
  advanced_timing_resolved_json?: string;
}>;

async function timingRows(
  kernel: SqliteKernel,
  sessionId: string,
  sessionExerciseId: string,
) {
  return kernel.queryAll<{
    exercise_id: string;
    exercise_revision: number;
    set_id: string;
    set_revision: number;
    ordinal: number;
    advanced_timing_default_json: string;
    advanced_timing_override_json: string | null;
    advanced_timing_resolved_json: string;
  }>(
    `SELECT se.id AS exercise_id,
            se.revision AS exercise_revision,
            ss.id AS set_id,
            ss.revision AS set_revision,
            ss.ordinal,
            se.advanced_timing_default_json,
            ss.advanced_timing_override_json,
            ss.advanced_timing_resolved_json
     FROM session_exercises se
     JOIN session_sets ss ON ss.session_exercise_id = se.id
     WHERE se.session_id = ?
       AND se.id = ?
       AND ss.set_kind = 'working'
     ORDER BY ss.ordinal`,
    [sessionId, sessionExerciseId],
  );
}

describe("advanced timing repository", () => {
  it("round-trips independent warm-up and working-set timing overrides through owned plan and session snapshots", async () => {
    const kernel = await createKernel();
    const ownedPlans = createOwnedPlanRepository(kernel);
    const plans = createPlansWorkoutRepository(kernel);
    const invalidate = async () => undefined;
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO exercises
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           metric_profile, metric_contract_version,
           exercise_metric_generation, equipment, default_rest_seconds,
           revision)
         VALUES (?, NULL, 'custom', NULL, NULL, ?, 'load_reps', 1, 1,
                 'Barbell', 90, 1)`,
        ["exercise-independent-squat", "Independent Squat"],
      );
      await transaction.execute(
        `INSERT INTO exercise_library_entries
          (exercise_id, origin, canonical_name, exercise_type, movement_class,
           metric_profile, metric_contract_version, exercise_metric_generation,
           availability, revision)
         VALUES (?, 'custom', ?, 'strength', 'compound', 'load_reps', 1, 1,
                 'available', 1)`,
        ["exercise-independent-squat", "Independent Squat"],
      );
    });
    const created = await createOwnedPlanDraft({
      repository: ownedPlans,
      invalidate,
      sha256,
      input: {
        requestId: "create-independent-timing-plan",
        planId: "plan-independent-timing",
        name: "Independent Timing",
        dayId: "day-independent-timing",
        dayName: "Timing Day",
        createdAtMs: 1_000,
      },
    });
    if (created.outcome === "requires_schedule_impact") {
      throw new Error("owned_plan_create_unexpected_impact");
    }
    const saved = await saveOwnedPlan({
      repository: ownedPlans,
      invalidate,
      sha256,
      input: {
        requestId: "save-independent-timing-plan",
        expectedRevision: created.plan.revision,
        savedAtMs: 2_000,
        plan: {
          id: created.plan.id,
          name: created.plan.name,
          days: [{
            id: created.plan.days[0]!.id,
            name: created.plan.days[0]!.name,
            ordinal: 0,
            occurrences: [{
              id: "occurrence-independent-squat",
              exerciseId: "exercise-independent-squat",
              ordinal: 0,
              restSeconds: 90,
              metricIdentity: {
                profile: "load_reps",
                contractVersion: 1,
                exerciseMetricGeneration: 1,
              },
              advancedTimingDefault: perRep,
              warmups: [{
                id: "warmup-independent-1",
                ordinal: 0,
                loadGrams: 10_000,
                reps: 5,
                advancedTimingOverride: null,
              }, {
                id: "warmup-independent-2",
                ordinal: 1,
                loadGrams: 15_000,
                reps: 3,
                advancedTimingOverride: { version: 1, mode: "off" },
              }],
              targets: [{
                id: "target-independent-1",
                ordinal: 0,
                target: {
                  profile: "load_reps",
                  version: 1,
                  loadGrams: 20_000,
                  minReps: 8,
                  maxReps: 12,
                  incrementGrams: 2_500,
                  perSide: false,
                },
                units: { version: 1, load: "grams", count: "repetitions" },
                advancedTimingOverride: audioPerRep,
              }, {
                id: "target-independent-2",
                ordinal: 1,
                target: {
                  profile: "load_reps",
                  version: 1,
                  loadGrams: 20_000,
                  minReps: 8,
                  maxReps: 12,
                  incrementGrams: 2_500,
                  perSide: false,
                },
                units: { version: 1, load: "grams", count: "repetitions" },
                advancedTimingOverride: bothCluster,
              }, {
                id: "target-independent-3",
                ordinal: 2,
                target: {
                  profile: "load_reps",
                  version: 1,
                  loadGrams: 20_000,
                  minReps: 8,
                  maxReps: 12,
                  incrementGrams: 2_500,
                  perSide: false,
                },
                units: { version: 1, load: "grams", count: "repetitions" },
                advancedTimingOverride: null,
              }],
              policy: {
                id: "policy-independent-squat",
                kind: "manual_hold",
                policyId: "load_reps.manual_hold.v1",
                version: 1,
                rule: {
                  kind: "manual_hold",
                  id: "load_reps.manual_hold.v1",
                  version: 1,
                },
              },
            }],
          }],
        },
      },
    });
    if (saved.outcome === "requires_schedule_impact") {
      throw new Error("owned_plan_save_unexpected_impact");
    }

    const reloaded = await ownedPlans.read(saved.plan.id);
    const occurrence = reloaded!.days[0]!.occurrences[0]!;
    expect(occurrence.warmups.map((row) => row.advancedTimingOverride ?? null))
      .toEqual([null, { version: 1, mode: "off" }]);
    expect(occurrence.targets.map((row) => row.advancedTimingOverride ?? null))
      .toEqual([audioPerRep, bothCluster, null]);

    const session = await startWorkout({
      repository: plans,
      request: {
        mode: "scheduled",
        planId: saved.plan.id,
        planDayId: saved.plan.days[0]!.id,
        localDate: "2026-09-30",
        timezone: "Asia/Singapore",
        startedAtMs: 3_000,
      },
    });
    const timingSnapshots = await kernel.queryAll<{
      set_kind: "warmup" | "working";
      ordinal: number;
      advanced_timing_override_json: string | null;
      advanced_timing_resolved_json: string;
    }>(
      `SELECT ss.set_kind, ss.ordinal, ss.advanced_timing_override_json,
              ss.advanced_timing_resolved_json
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       WHERE se.session_id = ?
       ORDER BY CASE ss.set_kind WHEN 'warmup' THEN 0 ELSE 1 END, ss.ordinal`,
      [session.id],
    );
    expect(timingSnapshots).toEqual([
      {
        set_kind: "warmup",
        ordinal: 0,
        advanced_timing_override_json: null,
        advanced_timing_resolved_json: JSON.stringify(perRep),
      },
      {
        set_kind: "warmup",
        ordinal: 1,
        advanced_timing_override_json: JSON.stringify({ version: 1, mode: "off" }),
        advanced_timing_resolved_json: JSON.stringify({ version: 1, mode: "off" }),
      },
      {
        set_kind: "working",
        ordinal: 0,
        advanced_timing_override_json: JSON.stringify(audioPerRep),
        advanced_timing_resolved_json: JSON.stringify(audioPerRep),
      },
      {
        set_kind: "working",
        ordinal: 1,
        advanced_timing_override_json: JSON.stringify(bothCluster),
        advanced_timing_resolved_json: JSON.stringify(bothCluster),
      },
      {
        set_kind: "working",
        ordinal: 2,
        advanced_timing_override_json: null,
        advanced_timing_resolved_json: JSON.stringify(perRep),
      },
    ]);
  });

  it("persists only the standalone advanced row across every per-rep transition", async () => {
    const { kernel, session, activeSet, repository } = await setupWorkout();
    const before = await protectedFacts(kernel, session.id);

    const started = await startAdvancedTiming({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision,
        expectedAdvancedTimingRevision: 0,
        nowMs: 10_000,
        config: perRep,
      },
    });
    expect(started).toEqual(expect.objectContaining({
      sessionRevision: session.revision,
      state: expect.objectContaining({
        state: "running",
        revision: 1,
        targetSessionSetId: activeSet.id,
      }),
    }));
    expect(await protectedFacts(kernel, session.id)).toEqual(before);

    const paused = await pauseAdvancedTiming({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision,
        expectedAdvancedTimingRevision: 1,
        nowMs: 10_400,
      },
    });
    expect(paused.state).toEqual(expect.objectContaining({
      state: "paused",
      revision: 2,
      remainingMs: 600,
    }));
    expect(await protectedFacts(kernel, session.id)).toEqual(before);

    const resumed = await resumeAdvancedTiming({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision,
        expectedAdvancedTimingRevision: 2,
        nowMs: 20_000,
      },
    });
    expect(resumed.state).toEqual(expect.objectContaining({
      state: "running",
      revision: 3,
      nextBoundaryAtMs: 20_600,
    }));
    expect(await protectedFacts(kernel, session.id)).toEqual(before);

    const reconciled = await reconcileAdvancedTiming({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision,
        expectedAdvancedTimingRevision: 3,
        nowMs: 22_100,
        foregroundSinceMs: 22_000,
      },
    });
    expect(reconciled).toEqual(expect.objectContaining({
      cue: null,
      state: expect.objectContaining({
        state: "running",
        revision: 4,
        nextBoundaryAtMs: 22_600,
        nextRepetitionIndex: 3,
      }),
    }));
    expect(await protectedFacts(kernel, session.id)).toEqual(before);

    const stopped = await stopAdvancedTiming({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision,
        expectedAdvancedTimingRevision: 4,
        nowMs: 22_200,
      },
    });
    expect(stopped.state).toEqual(expect.objectContaining({
      state: "stopped",
      revision: 5,
      stoppedAtMs: 22_200,
    }));
    expect(await protectedFacts(kernel, session.id)).toEqual(before);

    await expect(createAdvancedTimingRepository(kernel)
      .getAdvancedTimingContext(session.id)).resolves.toEqual({
      sessionId: session.id,
      sessionRevision: session.revision,
      state: stopped.state,
    });
    await expect(kernel.queryAll(
      "SELECT effect_type FROM pending_effects WHERE effect_type = 'reconcile_rest_notification'",
    )).resolves.toEqual([]);
  });

  it("rejects conflicts, inactive or completed targets, and rolls back a failed writer", async () => {
    const { kernel, session, activeSet, otherSetId, repository } = await setupWorkout();
    const input = {
      sessionId: session.id,
      sessionSetId: activeSet.id,
      expectedSessionRevision: session.revision,
      expectedAdvancedTimingRevision: 0,
      nowMs: 10_000,
      config: perRep,
    };
    await expect(startAdvancedTiming({ repository, input: {
      ...input,
      sessionSetId: otherSetId,
    } })).rejects.toThrow("advanced_timing_target_not_active");
    await expect(startAdvancedTiming({ repository, input: {
      ...input,
      expectedSessionRevision: session.revision + 1,
    } })).rejects.toThrow("advanced_timing_session_revision_conflict");

    await kernel.write((transaction) => transaction.execute(
      "UPDATE session_sets SET status = 'completed' WHERE id = ?",
      [activeSet.id],
    ));
    await expect(startAdvancedTiming({ repository, input }))
      .rejects.toThrow("advanced_timing_target_not_available");

    let failCommit = false;
    const failing = await setupWorkout({
      beforeCommit: async () => {
        if (failCommit) {
          throw new Error("injected_advanced_timing_commit_failure");
        }
      },
    });
    failCommit = true;
    await expect(startAdvancedTiming({
      repository: failing.repository,
      input: {
        sessionId: failing.session.id,
        sessionSetId: failing.activeSet.id,
        expectedSessionRevision: failing.session.revision,
        expectedAdvancedTimingRevision: 0,
        nowMs: 10_000,
        config: perRep,
      },
    })).rejects.toMatchObject({ code: "sqlite_commit_failed" });
    await expect(failing.kernel.queryAll(
      "SELECT * FROM session_advanced_timing_states WHERE session_id = ?",
      [failing.session.id],
    )).resolves.toEqual([]);
  });

  it("serializes concurrent due reconciliation and never replays a missed cue", async () => {
    const { kernel, session, activeSet, repository } = await setupWorkout();
    await startAdvancedTiming({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision,
        expectedAdvancedTimingRevision: 0,
        nowMs: 10_000,
        config: perRep,
      },
    });
    const input = {
      sessionId: session.id,
      sessionSetId: activeSet.id,
      expectedSessionRevision: session.revision,
      expectedAdvancedTimingRevision: 1,
      nowMs: 20_050,
      foregroundSinceMs: 20_001,
    };
    const results = await Promise.allSettled([
      reconcileAdvancedTiming({ repository, input }),
      reconcileAdvancedTiming({ repository, input }),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    await expect(repository.getAdvancedTimingContext(session.id))
      .resolves.toEqual(expect.objectContaining({
        state: expect.objectContaining({
          state: "running",
          revision: 2,
          nextBoundaryAtMs: 21_000,
          nextRepetitionIndex: 11,
        }),
      }));
  });

  it("reconstructs durable running state and rejects malformed persisted versions", async () => {
    const { kernel, session, activeSet, repository } = await setupWorkout();
    await startAdvancedTiming({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision,
        expectedAdvancedTimingRevision: 0,
        nowMs: 10_000,
        config: perRep,
      },
    });
    const reconstructed = createAdvancedTimingRepository(kernel);
    await expect(reconstructed.getAdvancedTimingContext(session.id))
      .resolves.toEqual(expect.objectContaining({
        sessionId: session.id,
        sessionRevision: session.revision,
        state: expect.objectContaining({
          state: "running",
          revision: 1,
          nextBoundaryAtMs: 11_000,
        }),
      }));
    await expect(kernel.write((transaction) => transaction.execute(
      "UPDATE session_advanced_timing_states SET state_version = 2 WHERE session_id = ?",
      [session.id],
    ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
    await expect(reconstructed.getAdvancedTimingContext(session.id))
      .resolves.toEqual(expect.objectContaining({
        state: expect.objectContaining({ state: "running", revision: 1 }),
      }));
  });

  it("persists cluster gaps as advanced-only state and preserves one recorded set", async () => {
    const { kernel, session, activeSet, repository } = await setupWorkout(
      {},
      cluster,
    );
    const before = await protectedFacts(kernel, session.id);

    const started = await startAdvancedTiming({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision,
        expectedAdvancedTimingRevision: 0,
        nowMs: 10_000,
        config: cluster,
      },
    });
    expect(started).toEqual(expect.objectContaining({
      sessionRevision: session.revision,
      state: expect.objectContaining({
        state: "cluster_ready",
        currentGroupIndex: 0,
        targetSessionSetId: activeSet.id,
      }),
    }));
    expect(await protectedFacts(kernel, session.id)).toEqual(before);

    const firstGap = await beginAdvancedTimingClusterGap({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision,
        expectedAdvancedTimingRevision: 1,
        nowMs: 30_000,
      },
    });
    expect(firstGap.state).toEqual(expect.objectContaining({
      state: "cluster_gap_running",
      revision: 2,
      gapEndsAtMs: 50_000,
    }));
    expect(await protectedFacts(kernel, session.id)).toEqual(before);

    const paused = await pauseAdvancedTiming({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision,
        expectedAdvancedTimingRevision: 2,
        nowMs: 40_000,
      },
    });
    expect(paused.state).toEqual(expect.objectContaining({
      state: "cluster_gap_paused",
      revision: 3,
      remainingMs: 10_000,
    }));
    const resumed = await resumeAdvancedTiming({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision,
        expectedAdvancedTimingRevision: 3,
        nowMs: 60_000,
      },
    });
    expect(resumed.state).toEqual(expect.objectContaining({
      state: "cluster_gap_running",
      revision: 4,
      gapEndsAtMs: 70_000,
    }));
    const secondReady = await skipAdvancedTimingClusterGap({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision,
        expectedAdvancedTimingRevision: 4,
        nowMs: 61_000,
      },
    });
    expect(secondReady.state).toEqual(expect.objectContaining({
      state: "cluster_ready",
      revision: 5,
      currentGroupIndex: 1,
    }));

    const secondGap = await beginAdvancedTimingClusterGap({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision,
        expectedAdvancedTimingRevision: 5,
        nowMs: 80_000,
      },
    });
    expect(secondGap.state).toEqual(expect.objectContaining({
      state: "cluster_gap_running",
      revision: 6,
      currentGroupIndex: 1,
      gapEndsAtMs: 100_000,
    }));
    const finalReady = await reconcileAdvancedTiming({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision,
        expectedAdvancedTimingRevision: 6,
        nowMs: 100_001,
        foregroundSinceMs: 99_500,
      },
    });
    expect(finalReady).toEqual(expect.objectContaining({
      cue: { repetitionIndex: 3, boundaryAtMs: 100_000 },
      state: expect.objectContaining({
        state: "cluster_ready",
        revision: 7,
        currentGroupIndex: 2,
      }),
    }));
    expect(await protectedFacts(kernel, session.id)).toEqual(before);

    const sets = await kernel.queryAll<{ id: string; status: string }>(
      `SELECT ss.id, ss.status FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       WHERE se.session_id = ? AND ss.id = ?`,
      [session.id, activeSet.id],
    );
    expect(sets).toEqual([{ id: activeSet.id, status: "planned" }]);

    const workout = createWorkoutRepository(kernel);
    const activeView = await workout.getActiveWorkout(session.id);
    const workingSet = activeView.currentExercise.workingSets.find(
      ({ id }) => id === activeSet.id,
    );
    if (workingSet === undefined) {
      throw new Error("cluster_active_set_missing");
    }
    await expect(completeSet({
      repository: workout,
      haptics: {
        committed: async () => undefined,
        cue: async () => undefined,
      },
      invalidate: async () => undefined,
      drainEffects: async () => undefined,
      input: {
        sessionId: session.id,
        setId: workingSet.id,
        expectedSessionRevision: activeView.revision,
        expectedSetRevision: workingSet.revision,
        completionIdempotencyKey: "cluster-complete-once",
        metricIdentity: workingSet.metricIdentity,
        observation: workingSet.valueSources[0]!.observation,
        completedAtMs: 120_000,
      },
    })).resolves.toMatchObject({ outcome: "committed" });
    await expect(kernel.queryAll<{ count: number; completed: number }>(
      `SELECT COUNT(*) AS count,
              SUM(CASE WHEN ss.status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       WHERE se.session_id = ? AND ss.id = ?`,
      [session.id, activeSet.id],
    )).resolves.toEqual([{ count: 1, completed: 1 }]);
  });

  it("removes timing ownership before set, exercise, and replacement deletion", async () => {
    const removeSetFixture = await setupWorkout();
    await startAndStopTiming(removeSetFixture);
    const removeSetWorkout = createWorkoutRepository(removeSetFixture.kernel);
    await expect(removeSetWorkout.removeWorkingSet?.({
      requestId: "remove-timed-set",
      requestSha256: "a".repeat(64),
      sessionId: removeSetFixture.session.id,
      setId: removeSetFixture.activeSet.id,
      expectedSessionRevision: removeSetFixture.session.revision,
      expectedSetRevision: removeSetFixture.activeSet.revision,
      removedAtMs: 12_000,
    })).resolves.toMatchObject({ outcome: "committed" });

    const removeExerciseFixture = await setupWorkout();
    await startAndStopTiming(removeExerciseFixture);
    const [removableExercise] = await removeExerciseFixture.kernel.queryAll<{
      id: string;
      revision: number;
    }>(
      `SELECT se.id, se.revision FROM session_exercises se
       JOIN session_sets ss ON ss.session_exercise_id = se.id
       WHERE ss.id = ?`,
      [removeExerciseFixture.activeSet.id],
    );
    const removeExerciseWorkout = createWorkoutRepository(removeExerciseFixture.kernel);
    await expect(removeExerciseWorkout.removeExercise?.({
      requestId: "remove-timed-exercise",
      requestSha256: "b".repeat(64),
      sessionId: removeExerciseFixture.session.id,
      sessionExerciseId: removableExercise!.id,
      expectedSessionRevision: removeExerciseFixture.session.revision,
      expectedSessionExerciseRevision: removableExercise!.revision,
      occurredAtMs: 13_000,
    })).resolves.toMatchObject({
      outcome: "committed",
      disposition: "deleted_provisional",
    });

    const replaceExerciseFixture = await setupWorkout();
    await startAndStopTiming(replaceExerciseFixture);
    await replaceExerciseFixture.kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO exercises
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           metric_profile, metric_contract_version, exercise_metric_generation,
           equipment, default_rest_seconds, revision)
         VALUES ('replacement-exercise', NULL, 'custom', NULL, NULL,
                 'Replacement exercise', 'load_reps', 1, 1, 'Barbell', 90, 1)`,
      );
      await transaction.execute(
        `INSERT INTO exercise_library_entries
          (exercise_id, origin, canonical_name, exercise_type, movement_class,
           metric_profile, metric_contract_version, exercise_metric_generation,
           availability, revision)
         VALUES ('replacement-exercise', 'custom', 'Replacement exercise',
                 'strength', 'compound', 'load_reps', 1, 1, 'available', 1)`,
      );
    });
    const [replaceableExercise] = await replaceExerciseFixture.kernel.queryAll<{
      id: string;
      revision: number;
    }>(
      `SELECT se.id, se.revision FROM session_exercises se
       JOIN session_sets ss ON ss.session_exercise_id = se.id
       WHERE ss.id = ?`,
      [replaceExerciseFixture.activeSet.id],
    );
    const replaceExerciseWorkout = createWorkoutRepository(replaceExerciseFixture.kernel);
    await expect(replaceExerciseWorkout.replaceExercise?.({
      requestId: "replace-timed-exercise",
      requestSha256: "c".repeat(64),
      sessionId: replaceExerciseFixture.session.id,
      sessionExerciseId: replaceableExercise!.id,
      expectedSessionRevision: replaceExerciseFixture.session.revision,
      expectedSessionExerciseRevision: replaceableExercise!.revision,
      occurredAtMs: 14_000,
      libraryExerciseId: "replacement-exercise",
      replacementSessionExerciseId: "replacement-session-exercise",
      replacementSetId: "replacement-session-set",
    })).resolves.toMatchObject({
      outcome: "committed",
      disposition: "deleted_provisional",
    });
  });

  it("updates active-session exercise defaults and set overrides without touching completed or rest facts", async () => {
    const { kernel, session, activeSet, repository } =
      await setupWorkout();
    const before = await protectedFacts(kernel, session.id);
    const beforeSets = before.sets as readonly ProtectedSetRow[];
    const [exercise] = await kernel.queryAll<{ id: string; revision: number }>(
      `SELECT se.id, se.revision
       FROM session_exercises se
       JOIN session_sets ss ON ss.session_exercise_id = se.id
       WHERE ss.id = ?`,
      [activeSet.id],
    );
    expect(exercise).toBeDefined();

    const exerciseUpdate = await updateSessionExerciseAdvancedTiming({
      repository,
      input: {
        sessionId: session.id,
        sessionExerciseId: exercise!.id,
        expectedSessionRevision: session.revision,
        expectedSessionExerciseRevision: exercise!.revision,
        config: audioPerRep,
        nowMs: 140_000,
      },
    });
    expect(exerciseUpdate).toEqual(expect.objectContaining({
      sessionRevision: session.revision + 1,
      state: expect.objectContaining({ state: "idle", revision: 0 }),
    }));
    const defaultRows = await timingRows(kernel, session.id, exercise!.id);
    expect(defaultRows).toHaveLength(3);
    expect(defaultRows).toEqual(defaultRows.map((row) => expect.objectContaining({
      set_id: row.set_id,
      exercise_revision: exercise!.revision + 1,
      set_revision: beforeSets.find(({ id }) => id === row.set_id)!.revision + 1,
      advanced_timing_default_json: JSON.stringify(audioPerRep),
      advanced_timing_override_json: null,
      advanced_timing_resolved_json: JSON.stringify(audioPerRep),
    })));
    const afterDefault = await protectedFacts(kernel, session.id);
    expect(afterDefault.rest).toEqual(before.rest);
    expect(afterDefault.undo).toEqual(before.undo);
    expect(afterDefault.restEffects).toEqual(before.restEffects);
    expect(afterDefault.session).toEqual([{
      ...before.session[0]!,
      revision: session.revision + 1,
      merge_modified_at_ms: (before.session[0]!.merge_modified_at_ms as number) + 1,
    }]);
    expect(afterDefault.sets).toEqual(beforeSets.map((set) => {
      if (
        set.session_exercise_id !== exercise!.id
        || set.status === "completed"
      ) {
        return set;
      }
      return {
        ...set,
        revision: set.revision + 1,
        advanced_timing_resolved_json: JSON.stringify(audioPerRep),
      };
    }));

    const override = await updateSessionSetAdvancedTiming({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision + 1,
        expectedSetRevision: (afterDefault.sets as readonly ProtectedSetRow[]).find(({ id }) =>
          id === activeSet.id
        )!.revision,
        override: bothCluster,
        nowMs: 141_000,
      },
    });
    expect(override.sessionRevision).toBe(session.revision + 2);
    const overrideRows = await timingRows(kernel, session.id, exercise!.id);
    expect(overrideRows).toEqual(defaultRows.map((row) => expect.objectContaining({
      set_id: row.set_id,
      advanced_timing_override_json: row.set_id === activeSet.id
        ? JSON.stringify(bothCluster)
        : null,
      advanced_timing_resolved_json: row.set_id === activeSet.id
        ? JSON.stringify(bothCluster)
        : JSON.stringify(audioPerRep),
    })));

    const cleared = await updateSessionSetAdvancedTiming({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision + 2,
        expectedSetRevision: (afterDefault.sets as readonly ProtectedSetRow[]).find(({ id }) =>
          id === activeSet.id
        )!.revision + 1,
        override: null,
        nowMs: 142_000,
      },
    });
    expect(cleared.sessionRevision).toBe(session.revision + 3);
    const clearedRows = await timingRows(kernel, session.id, exercise!.id);
    expect(clearedRows).toEqual(defaultRows.map((row) => expect.objectContaining({
      set_id: row.set_id,
      advanced_timing_override_json: null,
      advanced_timing_resolved_json: JSON.stringify(audioPerRep),
    })));

    await expect(updateSessionSetAdvancedTiming({
      repository,
      input: {
        sessionId: session.id,
        sessionSetId: activeSet.id,
        expectedSessionRevision: session.revision,
        expectedSetRevision: 1,
        override: cluster,
        nowMs: 143_000,
      },
    })).rejects.toThrow("advanced_timing_session_revision_conflict");
  });

  it("updates independent warm-up and working-set overrides without touching protected facts", async () => {
    const { kernel, session, repository } = await setupWorkout();
    const rows = await kernel.queryAll<{
      id: string;
      set_kind: "warmup" | "working";
      ordinal: number;
      revision: number;
      status: "planned" | "draft" | "completed" | "skipped";
    }>(
      `SELECT ss.id, ss.set_kind, ss.ordinal, ss.revision, ss.status
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       WHERE se.session_id = ?
       ORDER BY CASE ss.set_kind WHEN 'warmup' THEN 0 ELSE 1 END, ss.ordinal`,
      [session.id],
    );
    const warmup = rows.find(({ set_kind: kind }) => kind === "warmup");
    const workingRows = rows.filter(({ set_kind: kind }) => kind === "working");
    const completedWorking = workingRows[2];
    if (warmup === undefined || workingRows.length < 3 || completedWorking === undefined) {
      throw new Error("independent_timing_fixture_incomplete");
    }
    await kernel.write((transaction) => transaction.execute(
      `UPDATE session_sets
       SET status = 'completed', observed_load_grams = target_load_grams,
           observed_reps = target_min_reps, completed_at_ms = 5_000,
           revision = revision + 1
       WHERE id = ?`,
      [completedWorking.id],
    ));
    const before = await protectedFacts(kernel, session.id);
    const beforeSets = before.sets as readonly Readonly<Record<string, unknown>>[];
    const completedBefore = beforeSets.find(({ id }) => id === completedWorking.id);

    const updates = [
      { row: warmup, override: audioPerRep, nowMs: 150_000 },
      { row: workingRows[0]!, override: bothCluster, nowMs: 151_000 },
      {
        row: workingRows[1]!,
        override: { version: 1 as const, mode: "off" as const },
        nowMs: 152_000,
      },
    ] as const;
    let expectedSessionRevision = session.revision;
    for (const update of updates) {
      const result = await updateSessionSetAdvancedTiming({
        repository,
        input: {
          sessionId: session.id,
          sessionSetId: update.row.id,
          expectedSessionRevision,
          expectedSetRevision: update.row.revision,
          override: update.override,
          nowMs: update.nowMs,
        },
      });
      expectedSessionRevision += 1;
      expect(result.sessionRevision).toBe(expectedSessionRevision);
    }

    const after = await protectedFacts(kernel, session.id);
    expect(after.rest).toEqual(before.rest);
    expect(after.undo).toEqual(before.undo);
    expect(after.restEffects).toEqual(before.restEffects);
    expect(after.session).toEqual([{
      ...before.session[0]!,
      revision: (before.session[0]!.revision as number) + updates.length,
      merge_modified_at_ms:
        (before.session[0]!.merge_modified_at_ms as number) + updates.length,
    }]);

    const expectedOverrides = new Map(updates.map(({ row, override }) => [
      row.id,
      JSON.stringify(override),
    ]));
    expect(after.sets).toEqual(beforeSets.map((set) => {
      const overrideJson = expectedOverrides.get(set.id as string);
      if (overrideJson === undefined) return set;
      return {
        ...set,
        revision: (set.revision as number) + 1,
        advanced_timing_override_json: overrideJson,
        advanced_timing_resolved_json: overrideJson,
      };
    }));
    expect((after.sets as readonly Readonly<Record<string, unknown>>[])
      .find(({ id }) => id === completedWorking.id)).toEqual(completedBefore);

    const changedRows = await kernel.queryAll<{
      id: string;
      set_kind: "warmup" | "working";
      ordinal: number;
      revision: number;
      advanced_timing_override_json: string | null;
      advanced_timing_resolved_json: string;
    }>(
      `SELECT ss.id, ss.set_kind, ss.ordinal, ss.revision,
              ss.advanced_timing_override_json,
              ss.advanced_timing_resolved_json
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       WHERE se.session_id = ? AND ss.id IN (?, ?, ?)
       ORDER BY CASE ss.set_kind WHEN 'warmup' THEN 0 ELSE 1 END, ss.ordinal`,
      [session.id, warmup.id, workingRows[0]!.id, workingRows[1]!.id],
    );
    expect(changedRows).toEqual(updates.map(({ row, override }) => ({
      id: row.id,
      set_kind: row.set_kind,
      ordinal: row.ordinal,
      revision: row.revision + 1,
      advanced_timing_override_json: JSON.stringify(override),
      advanced_timing_resolved_json: JSON.stringify(override),
    })));
  });
});
