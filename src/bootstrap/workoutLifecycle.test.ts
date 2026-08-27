import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type {
  AppStateStatus,
} from "react-native";

import type {
  RestCommandResult,
  RestNotificationPort,
  RestRepository,
  RestStateV1,
} from "../domains/rest";
import {
  REST_NOTIFICATION_CHANNEL_ID,
} from "../domains/rest";
import type {
  EffectStore,
  PendingEffect,
} from "../platform/sqlite/effects/effectStore";
import type {
  SqliteKernel,
} from "../platform/sqlite";
import type {
  ProgressionRepository,
} from "../domains/progression";
import type {
  HistoryProjectionRepository,
} from "../platform/sqlite/repositories/historyProjectionRepository";
import type {
  HistoryProjectionEffectStore,
} from "../platform/sqlite/effects/historyProjectionEffects";
import {
  createWorkoutLifecycle,
} from "./workoutLifecycle";

type ForegroundFeedbackPort = Readonly<{
  playTone(input: Readonly<{ sessionId: string }>): Promise<void>;
  vibrate(): Promise<void>;
}>;

type ForegroundFeedbackStore = Readonly<{
  listPending(): Promise<readonly Readonly<{ sessionId: string; restRevision: number }>[]>;
  claimPending(input: Readonly<{
    sessionId: string;
    restRevision: number;
  }>): Promise<
    | Readonly<{ outcome: "claimed"; sound: boolean; vibration: boolean }>
    | "already_attempted"
    | "job_missing"
  >;
  complete(input: Readonly<{ sessionId: string; restRevision: number }>): Promise<void>;
  prune(input: Readonly<{ nowMs: number }>): Promise<number>;
}>;

function foregroundFeedbackStore(): ForegroundFeedbackStore {
  const consumed = new Set<string>();
  return {
    listPending: jest.fn(async () => []),
    claimPending: jest.fn(async ({ sessionId, restRevision }) => {
      const identity = `${sessionId}:${restRevision}`;
      if (consumed.has(identity)) {
        return "already_attempted" as const;
      }
      consumed.add(identity);
      return {
        outcome: "claimed" as const,
        sound: true,
        vibration: true,
      };
    }),
    complete: jest.fn(async () => undefined),
    prune: jest.fn(async () => 0),
  };
}

function foregroundFeedbackPort(): ForegroundFeedbackPort {
  return {
    playTone: jest.fn(async () => undefined),
    vibrate: jest.fn(async () => undefined),
  };
}

const running: RestStateV1 = {
  version: 1,
  state: "running",
  revision: 3,
  startedAtMs: 10_000,
  endsAtMs: 100_000,
  nextSetId: "set-2",
};

function restRepository(): RestRepository {
  let context: Readonly<{ state: RestStateV1; sessionRevision: number }> = {
    state: running,
    sessionRevision: 7,
  };
  const commandResult = (): RestCommandResult => ({
    state: context.state,
    sessionRevision: context.sessionRevision,
    invalidationScopes: [
      ["active-workout", "session-1"],
      ["today"],
    ],
  });
  return {
    getRestState: jest.fn(async () => running),
    getRestContext: jest.fn(async () => context),
    listActiveSessionIds: jest.fn(async () => ["session-1"]),
    currentRestRevision: jest.fn(async () => context.state.revision),
    startManualRest: jest.fn(async () => commandResult()),
    pauseRest: jest.fn(async () => commandResult()),
    resumeRest: jest.fn(async () => commandResult()),
    adjustRest: jest.fn(async () => commandResult()),
    skipRest: jest.fn(async () => commandResult()),
    expireRest: jest.fn(async () => {
      context = {
        state: {
          version: 1,
          state: "expired",
          revision: context.state.revision + 1,
          expiredAtMs: 120_000,
          nextSetId: context.state.nextSetId,
        },
        sessionRevision: context.sessionRevision + 1,
      };
      return commandResult();
    }),
  };
}

function notifications(
  permission: "granted" | "denied" = "granted",
): RestNotificationPort {
  return {
    ensureChannel: jest.fn(async () => undefined),
    permission: jest.fn(async () => permission),
    requestPermission: jest.fn(async () => permission),
    listScheduled: jest.fn(async () => []),
    cancel: jest.fn(async () => undefined),
    schedule: jest.fn<RestNotificationPort["schedule"]>(
      async ({ identifier }) => identifier,
    ),
    openSettings: jest.fn(async () => undefined),
  };
}

function progressionRepository(): ProgressionRepository {
  return {
    currentSessionRevision: jest.fn(async () => 8),
    generateRecommendationsForSession: jest.fn(async () => 1),
    recordExerciseEffort: jest.fn<
      ProgressionRepository["recordExerciseEffort"]
    >(async (input) => ({
      sessionExerciseId: input.sessionExerciseId,
      effort: input.effort,
      revision: input.expectedExerciseRevision + 1,
    })),
    acceptRecommendation: jest.fn<
      ProgressionRepository["acceptRecommendation"]
    >(async (input) => ({
      recommendationId: input.recommendationId,
      status: "accepted" as const,
    })),
    keepCurrentTarget: jest.fn<
      ProgressionRepository["keepCurrentTarget"]
    >(async (input) => ({
      recommendationId: input.recommendationId,
      status: "rejected" as const,
    })),
  };
}

function historyProjectionRepository(): HistoryProjectionRepository {
  return {
    advanceAndEnqueue: jest.fn(async () => []),
    currentRevision: jest.fn(async () => null),
    freshness: jest.fn(async () => "unavailable" as const),
    rebuildSubject: jest.fn(async () => "stale" as const),
    rebuildAll: jest.fn(async () => undefined),
    loadFreshness: jest.fn(async () => "unavailable" as const),
    dumpProjectionRows: jest.fn(async () => ({
      recordCandidates: [],
      comparableExposures: [],
      metricAggregates: [],
      periodInputs: [],
      recommendationScopes: [],
    })),
  };
}

function historyProjectionEffectStore(): HistoryProjectionEffectStore {
  return {
    claimNext: jest.fn(async () => null),
    resetExpiredClaims: jest.fn(async () => 0),
    complete: jest.fn(async () => undefined),
    supersede: jest.fn(async () => undefined),
    retry: jest.fn(async () => undefined),
    failPermanently: jest.fn(async () => undefined),
    findById: jest.fn(async () => null),
  };
}

function effectStoreWithOneEffect(
  status: "pending" | "processing" = "pending",
): EffectStore {
  const effect: PendingEffect = {
    id: "effect-1",
    type: "reconcile_rest_notification",
    payloadVersion: 1,
    payload: {
      version: 1,
      sessionId: "session-1",
      restRevision: 3,
    },
    idempotencyKey: "rest:session-1:3",
    subjectId: "session-1",
    expectedRevision: 3,
    status,
    attemptCount: status === "processing" ? 1 : 0,
    nextAttemptAtMs: 0,
    claimedAtMs: status === "processing" ? 1 : null,
    leaseExpiresAtMs: status === "processing" ? 31_000 : null,
    lastErrorCode: null,
    createdAtMs: 0,
    updatedAtMs: 0,
  };
  const store: EffectStore = {
    claimNext: jest.fn<EffectStore["claimNext"]>(async () => effect),
    resetExpiredClaims: jest.fn(async () => 0),
    complete: jest.fn(async () => undefined),
    supersede: jest.fn(async () => undefined),
    retry: jest.fn(async () => undefined),
    failPermanently: jest.fn(async () => undefined),
    findById: jest.fn<EffectStore["findById"]>(async () => effect),
  };
  let claimCount = 0;
  store.claimNext = jest.fn<EffectStore["claimNext"]>(async () => {
    claimCount += 1;
    return claimCount === 1 ? effect : null;
  });
  return store;
}

describe("Plan 01-09 workout lifecycle", () => {
  it("reconciles launch and drains the same pending rest effect", async () => {
    const repository = restRepository();
    const notificationPort = notifications();
    const effectStore = effectStoreWithOneEffect();
    const lifecycle = createWorkoutLifecycle({
      kernel: {} as SqliteKernel,
      restRepository: repository,
      notifications: notificationPort,
      nowMs: () => 40_000,
      effectStore,
    });

    await expect(lifecycle.trigger("launch")).resolves.toMatchObject({
      trigger: "launch",
      reconciled: 1,
      permission: "granted",
      drain: {
        claimed: 1,
        completed: 1,
      },
    });
  });

  it("drains recommendation work through its own filtered replay path", async () => {
    const effect: PendingEffect = {
      id: "effect-recommend",
      type: "regenerate_load_reps_recommendation",
      payloadVersion: 1,
      payload: {
        version: 1,
        sessionId: "session-1",
        sessionRevision: 8,
      },
      idempotencyKey: "recommend:session-1:8",
      subjectId: "session-1",
      expectedRevision: 8,
      status: "pending",
      attemptCount: 0,
      nextAttemptAtMs: 0,
      claimedAtMs: null,
      leaseExpiresAtMs: null,
      lastErrorCode: null,
      createdAtMs: 0,
      updatedAtMs: 0,
    };
    let claims = 0;
    const store = effectStoreWithOneEffect();
    store.claimNext = jest.fn<EffectStore["claimNext"]>(async (options) => {
      if (
        options.effectType === "regenerate_load_reps_recommendation"
        && claims === 0
      ) {
        claims += 1;
        return effect;
      }
      return null;
    });
    const progression = progressionRepository();
    const lifecycle = createWorkoutLifecycle({
      kernel: {} as SqliteKernel,
      restRepository: {
        ...restRepository(),
        listActiveSessionIds: jest.fn(async () => []),
      },
      progressionRepository: progression,
      notifications: notifications(),
      nowMs: () => 40_000,
      effectStore: store,
    });

    await expect(lifecycle.trigger("post_commit")).resolves.toMatchObject({
      progressionDrain: {
        claimed: 1,
        completed: 1,
      },
    });
    expect(progression.generateRecommendationsForSession).toHaveBeenCalledWith(
      "session-1",
      8,
      40_000,
    );
  });

  it("drains dedicated history projection work without coupling it to generic effects", async () => {
    const projectionRepository = historyProjectionRepository();
    const projectionStore = historyProjectionEffectStore();
    const lifecycle = createWorkoutLifecycle({
      kernel: {} as SqliteKernel,
      restRepository: {
        ...restRepository(),
        listActiveSessionIds: jest.fn(async () => []),
      },
      notifications: notifications(),
      nowMs: () => 40_000,
      effectStore: {
        ...effectStoreWithOneEffect(),
        claimNext: jest.fn(async () => null),
      },
      foregroundFeedbackStore: foregroundFeedbackStore(),
      historyProjectionRepository: projectionRepository,
      historyProjectionEffectStore: projectionStore,
    });

    await expect(lifecycle.trigger("launch")).resolves.toMatchObject({
      historyProjectionDrain: {
        claimed: 0,
        completed: 0,
        permanentFailures: 0,
      },
    });
    expect(projectionStore.resetExpiredClaims).toHaveBeenCalledWith(40_000);
  });

  it("recovers dedicated projection leases through its default queue store", async () => {
    const projectionRepository = historyProjectionRepository();
    const execute = jest.fn(async () => ({ changes: 0, lastInsertRowId: 0 }));
    const kernel = {
      write: async <Result,>(
        work: (transaction: Readonly<{
          execute: typeof execute;
          queryAll: <Row extends Record<string, unknown>>() => Promise<readonly Row[]>;
        }>) => Promise<Result>,
      ) => work({
        execute,
        queryAll: async <Row extends Record<string, unknown>>() => [] as readonly Row[],
      }),
    } as unknown as SqliteKernel;
    const lifecycle = createWorkoutLifecycle({
      kernel,
      restRepository: {
        ...restRepository(),
        listActiveSessionIds: jest.fn(async () => []),
      },
      notifications: notifications(),
      nowMs: () => 40_000,
      effectStore: {
        ...effectStoreWithOneEffect(),
        claimNext: jest.fn(async () => null),
      },
      foregroundFeedbackStore: foregroundFeedbackStore(),
      historyProjectionRepository: projectionRepository,
    });

    await lifecycle.trigger("launch");
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("history_projection_attempts_exhausted"),
      [40_000, 40_000, 5],
    );
  });

  it("keeps denied effects retryable and succeeds after permission grant", async () => {
    const repository = restRepository();
    let permission: "granted" | "denied" = "denied";
    const notificationPort = notifications();
    jest.spyOn(notificationPort, "permission").mockImplementation(
      async () => permission,
    );
    const effectStore = effectStoreWithOneEffect();
    const lifecycle = createWorkoutLifecycle({
      kernel: {} as SqliteKernel,
      restRepository: repository,
      notifications: notificationPort,
      nowMs: () => 40_000,
      effectStore,
    });

    await expect(lifecycle.trigger("post_commit")).resolves.toMatchObject({
      permission: "denied",
      drain: {
        claimed: 1,
        retried: 1,
      },
    });
    permission = "granted";
    await expect(lifecycle.trigger("permission_change")).resolves.toMatchObject({
      permission: "granted",
    });
  });

  it("removes orphan rest alerts without touching active or unrelated requests", async () => {
    const notificationPort: RestNotificationPort = {
      ...notifications(),
      listScheduled: jest.fn(async () => [
        {
          identifier: "rest:session-1",
          sessionId: "session-1",
          restRevision: 3,
          endsAtMs: 100_000,
          channelId: REST_NOTIFICATION_CHANNEL_ID,
        },
        {
          identifier: "rest:stale-session",
          sessionId: "stale-session",
          restRevision: 1,
          endsAtMs: 90_000,
        },
        {
          identifier: "rest:malformed",
          sessionId: null,
          restRevision: null,
          endsAtMs: null,
        },
        {
          identifier: "other:request",
          sessionId: null,
          restRevision: null,
          endsAtMs: null,
        },
      ]),
    };
    const lifecycle = createWorkoutLifecycle({
      kernel: {} as SqliteKernel,
      restRepository: restRepository(),
      notifications: notificationPort,
      nowMs: () => 40_000,
      effectStore: {
        ...effectStoreWithOneEffect(),
        claimNext: jest.fn(async () => null),
      },
    });

    await expect(lifecycle.trigger("launch")).resolves.toMatchObject({
      trigger: "launch",
      reconciled: 1,
    });
    expect(notificationPort.cancel).toHaveBeenCalledTimes(2);
    expect(notificationPort.cancel).toHaveBeenNthCalledWith(
      1,
      "rest:stale-session",
    );
    expect(notificationPort.cancel).toHaveBeenNthCalledWith(
      2,
      "rest:malformed",
    );
  });

  it("keeps scheduler sweep failures non-authoritative", async () => {
    const notificationPort: RestNotificationPort = {
      ...notifications(),
      listScheduled: jest.fn(async () => [{
        identifier: "rest:stale-session",
        sessionId: "stale-session",
        restRevision: 1,
        endsAtMs: 90_000,
      }]),
      cancel: jest.fn(async () => {
        throw new Error("scheduler_unavailable");
      }),
    };
    const lifecycle = createWorkoutLifecycle({
      kernel: {} as SqliteKernel,
      restRepository: restRepository(),
      notifications: notificationPort,
      nowMs: () => 40_000,
      effectStore: {
        ...effectStoreWithOneEffect(),
        claimNext: jest.fn(async () => null),
      },
    });

    await expect(lifecycle.trigger("foreground")).resolves.toMatchObject({
      trigger: "foreground",
      reconciled: 1,
    });
  });

  it("uses one foreground subscription and ignores active-to-active repeats", async () => {
    let listener: ((state: AppStateStatus) => void) | undefined;
    const remove = jest.fn();
    const onResult = jest.fn();
    const repository = restRepository();
    const effectStore = effectStoreWithOneEffect();
    const lifecycle = createWorkoutLifecycle({
      kernel: {} as SqliteKernel,
      restRepository: repository,
      notifications: notifications(),
      nowMs: () => 40_000,
      effectStore,
      appState: {
        currentState: "background",
        addEventListener: (_type, nextListener) => {
          listener = nextListener;
          return { remove };
        },
      },
    });

    const unsubscribe = lifecycle.subscribeForeground(onResult);
    listener?.("active");
    listener?.("active");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onResult).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("does not replay overdue feedback when returning to the foreground", async () => {
    const repository = restRepository();
    const store = foregroundFeedbackStore();
    const feedback = foregroundFeedbackPort();
    const lifecycle = createWorkoutLifecycle({
      kernel: {} as SqliteKernel,
      restRepository: repository,
      notifications: notifications(),
      nowMs: () => 120_000,
      effectStore: {
        ...effectStoreWithOneEffect(),
        claimNext: jest.fn(async () => null),
      },
      foregroundFeedback: feedback,
      foregroundFeedbackStore: store,
    });

    await lifecycle.trigger("foreground");
    await lifecycle.trigger("foreground");

    expect(repository.expireRest).toHaveBeenCalledWith({
      sessionId: "session-1",
      expectedSessionRevision: 7,
      expectedRestRevision: 3,
      nowMs: 120_000,
    });
    expect(store.claimPending).not.toHaveBeenCalled();
    expect(feedback.playTone).not.toHaveBeenCalled();
    expect(feedback.vibrate).not.toHaveBeenCalled();
  });

  it("uses the claimed durable modality snapshot rather than rereading preferences", async () => {
      const repository = restRepository();
      const feedback = foregroundFeedbackPort();
      const lifecycle = createWorkoutLifecycle({
        kernel: {} as SqliteKernel,
        restRepository: repository,
        notifications: notifications(),
        nowMs: () => 120_000,
        effectStore: {
          ...effectStoreWithOneEffect(),
          claimNext: jest.fn(async () => null),
        },
        foregroundFeedback: feedback,
        foregroundFeedbackStore: foregroundFeedbackStore(),
      });

      await lifecycle.trigger("foreground");
      await lifecycle.trigger("post_commit", {
        foregroundExpiry: { sessionId: "session-1", restRevision: 4 },
      });

      expect(feedback.playTone).toHaveBeenCalledTimes(1);
      expect(feedback.vibrate).toHaveBeenCalledTimes(1);
  });

  it("keeps the expired SQLite state usable when foreground feedback fails", async () => {
    const repository = restRepository();
    const feedback: ForegroundFeedbackPort = {
      playTone: jest.fn(async () => {
        throw new Error("tone_unavailable");
      }),
      vibrate: jest.fn(async () => {
        throw new Error("haptic_unavailable");
      }),
    };
    const lifecycle = createWorkoutLifecycle({
      kernel: {} as SqliteKernel,
      restRepository: repository,
      notifications: notifications(),
      nowMs: () => 120_000,
      effectStore: {
        ...effectStoreWithOneEffect(),
        claimNext: jest.fn(async () => null),
      },
      foregroundFeedback: feedback,
      foregroundFeedbackStore: foregroundFeedbackStore(),
    });

    await lifecycle.trigger("foreground");
    await expect(lifecycle.trigger("post_commit", {
      foregroundExpiry: { sessionId: "session-1", restRevision: 4 },
    })).resolves.toMatchObject({
      trigger: "post_commit",
    });
    expect(repository.expireRest).toHaveBeenCalledTimes(1);
    expect(feedback.playTone).toHaveBeenCalledTimes(1);
    expect(feedback.vibrate).toHaveBeenCalledTimes(1);
  });

  it("falls back to the scheduled alert when cancellation cannot be confirmed", async () => {
    const repository = restRepository();
    const notificationPort = notifications();
    jest.spyOn(notificationPort, "cancel").mockRejectedValueOnce(
      new Error("scheduler_unavailable"),
    );
    const feedback = foregroundFeedbackPort();
    const lifecycle = createWorkoutLifecycle({
      kernel: {} as SqliteKernel,
      restRepository: repository,
      notifications: notificationPort,
      nowMs: () => 120_000,
      effectStore: {
        ...effectStoreWithOneEffect(),
        claimNext: jest.fn(async () => null),
      },
      foregroundFeedback: feedback,
      foregroundFeedbackStore: foregroundFeedbackStore(),
    });

    await lifecycle.trigger("foreground");
    await expect(lifecycle.trigger("post_commit", {
      foregroundExpiry: { sessionId: "session-1", restRevision: 4 },
    })).resolves.toMatchObject({
      foregroundFeedback: [{
        outcome: "scheduled_fallback",
        diagnostics: ["scheduled_notification_cancel_failed"],
      }],
    });
    expect(feedback.playTone).not.toHaveBeenCalled();
    expect(feedback.vibrate).not.toHaveBeenCalled();
  });

  it("does not replay feedback for an old expired state without a foreground transition", async () => {
    const repository = restRepository();
    const expired: RestStateV1 = {
      version: 1,
      state: "expired",
      revision: 9,
      expiredAtMs: 100_000,
      nextSetId: "set-2",
    };
    (repository.getRestContext as jest.MockedFunction<
      RestRepository["getRestContext"]
    >).mockResolvedValue({
      state: expired,
      sessionRevision: 12,
    });
    const store = foregroundFeedbackStore();
    const feedback = foregroundFeedbackPort();
    const lifecycle = createWorkoutLifecycle({
      kernel: {} as SqliteKernel,
      restRepository: repository,
      notifications: notifications(),
      nowMs: () => 120_000,
      effectStore: {
        ...effectStoreWithOneEffect(),
        claimNext: jest.fn(async () => null),
      },
      foregroundFeedback: feedback,
      foregroundFeedbackStore: store,
    });

    await lifecycle.trigger("launch");
    await lifecycle.trigger("post_commit");

    expect(store.claimPending).not.toHaveBeenCalled();
    expect(feedback.playTone).not.toHaveBeenCalled();
    expect(feedback.vibrate).not.toHaveBeenCalled();
  });

  it("recovers a pending committed foreground attempt once at launch without creating one for an overdue rest", async () => {
    const repository = restRepository();
    const store = foregroundFeedbackStore();
    (store.listPending as jest.MockedFunction<ForegroundFeedbackStore["listPending"]>)
      .mockResolvedValue([{ sessionId: "session-1", restRevision: 4 }]);
    const feedback = foregroundFeedbackPort();
    const lifecycle = createWorkoutLifecycle({
      kernel: {} as SqliteKernel,
      restRepository: repository,
      notifications: notifications(),
      nowMs: () => 120_000,
      effectStore: { ...effectStoreWithOneEffect(), claimNext: jest.fn(async () => null) },
      foregroundFeedback: feedback,
      foregroundFeedbackStore: store,
    });

    await lifecycle.trigger("foreground");
    await lifecycle.trigger("launch");
    await lifecycle.trigger("launch");

    expect(store.claimPending).toHaveBeenCalledTimes(2);
    expect(feedback.playTone).toHaveBeenCalledTimes(1);
    expect(feedback.vibrate).toHaveBeenCalledTimes(1);
  });

  it("handles a post-commit expiry only when the committed identity is supplied", async () => {
    const repository = restRepository();
    const expired: RestStateV1 = {
      version: 1,
      state: "expired",
      revision: 9,
      expiredAtMs: 100_000,
      nextSetId: "set-2",
    };
    (repository.getRestContext as jest.MockedFunction<
      RestRepository["getRestContext"]
    >).mockResolvedValue({
      state: expired,
      sessionRevision: 12,
    });
    const notificationPort = notifications();
    const feedback = foregroundFeedbackPort();
    const lifecycle = createWorkoutLifecycle({
      kernel: {} as SqliteKernel,
      restRepository: repository,
      notifications: notificationPort,
      nowMs: () => 120_000,
      effectStore: {
        ...effectStoreWithOneEffect(),
        claimNext: jest.fn(async () => null),
      },
      foregroundFeedback: feedback,
      foregroundFeedbackStore: foregroundFeedbackStore(),
    });

    await lifecycle.trigger("post_commit", {
      foregroundExpiry: { sessionId: "session-1", restRevision: 9 },
    });

    expect(notificationPort.cancel).toHaveBeenCalledWith("rest:session-1");
    expect(feedback.playTone).toHaveBeenCalledWith({ sessionId: "session-1" });
    expect(feedback.vibrate).toHaveBeenCalledTimes(1);
  });
});
