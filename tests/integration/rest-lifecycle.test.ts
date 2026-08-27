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
  adjustRest,
  expireRest,
  expireRestWithForegroundFeedback,
  pauseRest,
  resumeRest,
  skipRest,
  startManualRest,
  type RestCommandResult,
  type RestNotificationPermission,
  type RestNotificationPort,
  type RestRepository,
} from "../../src/domains/rest";
import {
  startWorkout,
} from "../../src/domains/workout";
import {
  createWorkoutLifecycle,
} from "../../src/bootstrap/workoutLifecycle";
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
  createRestRepository,
} from "../../src/platform/sqlite/repositories/restRepository";
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
  const directory = mkdtempSync(join(tmpdir(), "gym-rest-lifecycle-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer }, observer);
  const recoveryBackup: RecoveryBackupPort = {
    createAndValidate: async (request) => ({
      backupId: `rest-lifecycle-${request.fromVersion}-${request.toVersion}`,
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
    session,
    workoutRepository: createWorkoutRepository(kernel),
    restRepository: createRestRepository(kernel),
  };
}

describe("Plan 01-09 persisted rest commands", () => {
  it("delegates foreground expiry with the exact command input", async () => {
    const { restRepository } = await setupWorkout();
    const input = {
      sessionId: "session-foreground",
      expectedSessionRevision: 11,
      expectedRestRevision: 7,
      nowMs: 120_000,
      preferences: {
        soundEnabled: false,
        vibrationEnabled: true,
      },
    } as const;
    const expected: RestCommandResult = {
      state: {
        version: 1,
        state: "expired",
        revision: 8,
        expiredAtMs: input.nowMs,
        nextSetId: "set-2",
      },
      sessionRevision: 12,
      invalidationScopes: [
        ["active-workout", input.sessionId],
        ["today"],
      ],
    };
    const foregroundExpiry = jest.fn<
      NonNullable<RestRepository["expireRestWithForegroundFeedback"]>
    >(async () => expected);
    const ordinaryExpiry = jest.fn<RestRepository["expireRest"]>(
      async () => expected,
    );
    const repository: RestRepository = {
      ...restRepository,
      expireRest: ordinaryExpiry,
      expireRestWithForegroundFeedback: foregroundExpiry,
    };

    await expect(expireRestWithForegroundFeedback({
      repository,
      input,
    })).resolves.toBe(expected);
    expect(foregroundExpiry).toHaveBeenCalledTimes(1);
    expect(foregroundExpiry).toHaveBeenCalledWith(input);
    expect(ordinaryExpiry).not.toHaveBeenCalled();
  });

  it("fails closed when foreground expiry is unsupported", async () => {
    const { restRepository } = await setupWorkout();
    const {
      expireRestWithForegroundFeedback: unsupportedForegroundExpiry,
      ...supportedRepository
    } = restRepository;
    const ordinaryExpiry = jest.fn<RestRepository["expireRest"]>(
      restRepository.expireRest,
    );
    const repository: RestRepository = {
      ...supportedRepository,
      expireRest: ordinaryExpiry,
    };

    expect(() => expireRestWithForegroundFeedback({
      repository,
      input: {
        sessionId: "session-foreground",
        expectedSessionRevision: 11,
        expectedRestRevision: 7,
        nowMs: 120_000,
        preferences: {
          soundEnabled: true,
          vibrationEnabled: true,
        },
      },
    })).toThrow("foreground_rest_expiry_unavailable");
    expect(unsupportedForegroundExpiry).toBeDefined();
    expect(ordinaryExpiry).not.toHaveBeenCalled();
  });

  it("starts manual rest from the immutable exercise duration", async () => {
    const { kernel, session, workoutRepository, restRepository } =
      await setupWorkout();
    const workout = await workoutRepository.getActiveWorkout(session.id);
    const result = await startManualRest({
      repository: restRepository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: workout.revision,
        expectedRestRevision: 0,
        nowMs: 10_000,
      },
    });

    expect(result.state).toEqual({
      version: 1,
      state: "running",
      revision: 1,
      startedAtMs: 10_000,
      endsAtMs: 190_000,
      nextSetId: workout.activeSetId,
    });
    expect(await kernel.queryAll<{
      count: number;
    }>(
      `SELECT COUNT(*) AS count
       FROM pending_effects
       WHERE idempotency_key = ?`,
      [`rest:${session.id}:1`],
    )).toEqual([{ count: 1 }]);
  });

  it("persists ordinary pause, resume, adjust, skip, and expiry without foreground feedback", async () => {
    const { kernel, session, workoutRepository, restRepository } = await setupWorkout();
    const workout = await workoutRepository.getActiveWorkout(session.id);
    const running = await startManualRest({
      repository: restRepository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: workout.revision,
        expectedRestRevision: 0,
        nowMs: 10_000,
      },
    });
    const paused = await pauseRest({
      repository: restRepository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: running.sessionRevision,
        expectedRestRevision: running.state.revision,
        nowMs: 40_000,
      },
    });
    expect(paused.state).toMatchObject({
      state: "paused",
      revision: 2,
      remainingMs: 150_000,
    });

    const shortened = await adjustRest({
      repository: restRepository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: paused.sessionRevision,
        expectedRestRevision: paused.state.revision,
        deltaMs: -15_000,
        nowMs: 41_000,
      },
    });
    expect(shortened.state).toMatchObject({
      state: "paused",
      revision: 3,
      remainingMs: 135_000,
    });

    const resumed = await resumeRest({
      repository: restRepository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: shortened.sessionRevision,
        expectedRestRevision: shortened.state.revision,
        nowMs: 50_000,
      },
    });
    expect(resumed.state).toMatchObject({
      state: "running",
      revision: 4,
      startedAtMs: 50_000,
      endsAtMs: 185_000,
    });

    const extended = await adjustRest({
      repository: restRepository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: resumed.sessionRevision,
        expectedRestRevision: resumed.state.revision,
        deltaMs: 15_000,
        nowMs: 60_000,
      },
    });
    expect(extended.state).toMatchObject({
      state: "running",
      revision: 5,
      endsAtMs: 200_000,
    });

    const skipped = await skipRest({
      repository: restRepository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: extended.sessionRevision,
        expectedRestRevision: extended.state.revision,
        nowMs: 61_000,
      },
    });
    expect(skipped.state).toEqual({
      version: 1,
      state: "idle",
      revision: 6,
      nextSetId: null,
    });

    const restarted = await startManualRest({
      repository: restRepository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: skipped.sessionRevision,
        expectedRestRevision: skipped.state.revision,
        nowMs: 70_000,
      },
    });
    await expect(expireRest({
      repository: restRepository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: restarted.sessionRevision,
        expectedRestRevision: restarted.state.revision,
        nowMs: 250_000,
      },
    })).resolves.toMatchObject({
      state: {
        state: "expired",
        revision: 8,
        expiredAtMs: 250_000,
      },
    });
    await expect(kernel.queryAll<{
      session_id: string;
      rest_revision: number;
      sound_status: string;
      vibration_status: string;
    }>(
      `SELECT session_id, rest_revision, sound_status, vibration_status
       FROM foreground_rest_feedback_attempts
       WHERE session_id = ?`,
      [session.id],
    )).resolves.toEqual([]);
  });

  it("rejects stale revisions and invalid transitions without source changes", async () => {
    const { session, workoutRepository, restRepository } = await setupWorkout();
    const workout = await workoutRepository.getActiveWorkout(session.id);
    const running = await startManualRest({
      repository: restRepository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: workout.revision,
        expectedRestRevision: 0,
        nowMs: 10_000,
      },
    });
    await expect(pauseRest({
      repository: restRepository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: running.sessionRevision,
        expectedRestRevision: 0,
        nowMs: 20_000,
      },
    })).rejects.toMatchObject({ code: "rest_revision_conflict" });
    await expect(resumeRest({
      repository: restRepository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: running.sessionRevision,
        expectedRestRevision: running.state.revision,
        nowMs: 20_000,
      },
    })).rejects.toMatchObject({ code: "rest_not_paused" });
    await expect(restRepository.getRestState(session.id)).resolves.toEqual(
      running.state,
    );
  });

  it("rolls back rest state and effects when commit fails", async () => {
    let failCommit = false;
    const { kernel, session, workoutRepository, restRepository } = await setupWorkout({
      beforeCommit: async () => {
        if (failCommit) {
          failCommit = false;
          throw new Error("injected_commit_failure");
        }
      },
    });
    const workout = await workoutRepository.getActiveWorkout(session.id);
    failCommit = true;

    await expect(startManualRest({
      repository: restRepository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: workout.revision,
        expectedRestRevision: 0,
        nowMs: 10_000,
      },
    })).rejects.toMatchObject({ code: "sqlite_commit_failed" });
    await expect(restRepository.getRestState(session.id)).resolves.toEqual({
      version: 1,
      state: "idle",
      revision: 0,
      nextSetId: null,
    });
    expect(await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM pending_effects",
    )).toEqual([{ count: 0 }]);
  });
});

describe("Plan 01-09 durable notification replay", () => {
  it("retries denial and completes the same effect after permission grant", async () => {
    const { kernel, session, workoutRepository, restRepository } =
      await setupWorkout();
    const workout = await workoutRepository.getActiveWorkout(session.id);
    await startManualRest({
      repository: restRepository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: workout.revision,
        expectedRestRevision: 0,
        nowMs: 10_000,
      },
    });

    let nowMs = 10_000;
    let permission: RestNotificationPermission = "denied";
    const scheduled = new Map<string, {
      sessionId: string;
      restRevision: number;
      endsAtMs: number;
    }>();
    const notifications: RestNotificationPort = {
      ensureChannel: async () => undefined,
      permission: async () => permission,
      requestPermission: async () => permission,
      async listScheduled() {
        return [...scheduled].map(([identifier, request]) => ({
          identifier,
          ...request,
        }));
      },
      async cancel(identifier) {
        scheduled.delete(identifier);
      },
      async schedule(request) {
        scheduled.set(request.identifier, {
          sessionId: request.sessionId,
          restRevision: request.restRevision,
          endsAtMs: request.endsAtMs,
        });
        return request.identifier;
      },
      openSettings: async () => undefined,
    };
    const lifecycle = createWorkoutLifecycle({
      kernel,
      restRepository,
      notifications,
      nowMs: () => nowMs,
    });

    await expect(lifecycle.trigger("post_commit")).resolves.toMatchObject({
      permission: "denied",
      drain: {
        claimed: 1,
        retried: 1,
      },
    });
    expect(await kernel.queryAll<{
      status: string;
      attempt_count: number;
      last_error_code: string | null;
    }>(
      `SELECT status, attempt_count, last_error_code
       FROM pending_effects
       WHERE idempotency_key = ?`,
      [`rest:${session.id}:1`],
    )).toEqual([{
      status: "pending",
      attempt_count: 1,
      last_error_code: "permission_denied",
    }]);
    await expect(restRepository.getRestState(session.id)).resolves
      .toMatchObject({
        state: "running",
        revision: 1,
      });

    permission = "granted";
    nowMs = 11_000;
    await expect(lifecycle.trigger("permission_change")).resolves
      .toMatchObject({
        permission: "granted",
        drain: {
          claimed: 1,
          completed: 1,
        },
      });
    expect(scheduled.get(`rest:${session.id}`)).toEqual({
      sessionId: session.id,
      restRevision: 1,
      endsAtMs: 190_000,
    });
    expect(await kernel.queryAll<{
      status: string;
      attempt_count: number;
      last_error_code: string | null;
    }>(
      `SELECT status, attempt_count, last_error_code
       FROM pending_effects
       WHERE idempotency_key = ?`,
      [`rest:${session.id}:1`],
    )).toEqual([{
      status: "completed",
      attempt_count: 2,
      last_error_code: null,
    }]);
  });

  it("removes stale scheduler rows while preserving the active SQLite request", async () => {
    const { session, workoutRepository, restRepository, kernel } =
      await setupWorkout();
    const workout = await workoutRepository.getActiveWorkout(session.id);
    const running = await startManualRest({
      repository: restRepository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: workout.revision,
        expectedRestRevision: 0,
        nowMs: 10_000,
      },
    });
    const scheduled = new Map<string, {
      sessionId: string | null;
      restRevision: number | null;
      endsAtMs: number | null;
    }>([
      ["rest:stale-session", {
        sessionId: "stale-session",
        restRevision: 1,
        endsAtMs: 90_000,
      }],
    ]);
    const notifications: RestNotificationPort = {
      ensureChannel: async () => undefined,
      permission: async () => "granted",
      requestPermission: async () => "granted",
      async listScheduled() {
        return [...scheduled].map(([identifier, request]) => ({
          identifier,
          ...request,
        }));
      },
      async cancel(identifier) {
        scheduled.delete(identifier);
      },
      async schedule(request) {
        scheduled.set(request.identifier, {
          sessionId: request.sessionId,
          restRevision: request.restRevision,
          endsAtMs: request.endsAtMs,
        });
        return request.identifier;
      },
      openSettings: async () => undefined,
    };
    const lifecycle = createWorkoutLifecycle({
      kernel,
      restRepository,
      notifications,
      nowMs: () => 11_000,
    });

    await expect(lifecycle.trigger("launch")).resolves.toMatchObject({
      trigger: "launch",
      reconciled: 1,
      permission: "granted",
    });
    expect(scheduled).toEqual(new Map([
      [`rest:${session.id}`, {
        sessionId: session.id,
        restRevision: running.state.revision,
        endsAtMs: 190_000,
      }],
    ]));
  });
});
