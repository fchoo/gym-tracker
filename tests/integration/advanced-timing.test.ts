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
  beginAdvancedTimingClusterGap,
  pauseAdvancedTiming,
  reconcileAdvancedTiming,
  resumeAdvancedTiming,
  skipAdvancedTimingClusterGap,
  startAdvancedTiming,
  stopAdvancedTiming,
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
     ) AND id <> ?
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

describe("advanced timing repository", () => {
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
});
