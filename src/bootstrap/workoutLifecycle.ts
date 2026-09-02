import type {
  ForegroundRestFeedbackPort,
  RestContext,
  RestNotificationPermission,
  RestNotificationPort,
  RestRepository,
  RestStateV1,
} from "../domains/rest";
import type {
  ProgressionRepository,
} from "../domains/progression";
import {
  EffectExecutionError,
  createEffectRunner,
  type EffectDrainResult,
} from "../platform/sqlite/effects/effectRunner";
import {
  createEffectStore,
  type EffectStore,
  type PendingEffect,
} from "../platform/sqlite/effects/effectStore";
import {
  HISTORY_PROJECTION_EFFECT_MAX_ATTEMPTS,
  HISTORY_PROJECTION_EFFECT_LEASE_DURATION_MS,
  HISTORY_PROJECTION_EFFECT_RETRY_DELAY_MS,
  createHistoryProjectionEffectRunner,
  createHistoryProjectionEffectStore,
  type HistoryProjectionEffectDrainResult,
  type HistoryProjectionEffectStore,
} from "../platform/sqlite/effects/historyProjectionEffects";
import type {
  HistoryProjectionRepository,
} from "../platform/sqlite/repositories/historyProjectionRepository";
import {
  createRestNotificationReconciler,
  type RestReconciliationResult,
} from "../platform/notifications/restNotificationReconciler";
import type {
  SqliteKernel,
} from "../platform/sqlite";
import {
  createForegroundRestFeedbackStore,
  type ForegroundRestFeedbackStore,
} from "../platform/sqlite/foregroundRestFeedbackStore";

export type WorkoutLifecycleTrigger =
  | "launch"
  | "foreground"
  | "permission_change"
  | "post_commit"
  | "supported_boot";

type AppStateStatus = import("react-native").AppStateStatus;

const HISTORY_PROJECTION_DRAIN_BATCH_SIZE = 16;

export type WorkoutLifecycleResult = Readonly<{
  trigger: WorkoutLifecycleTrigger;
  reconciled: number;
  permission: RestNotificationPermission;
  drain: EffectDrainResult;
  progressionDrain: EffectDrainResult;
  historyProjectionDrain: HistoryProjectionEffectDrainResult;
  outcomes: readonly RestReconciliationResult[];
  foregroundFeedback: readonly ForegroundRestFeedbackResult[];
}>;

export type ForegroundRestExpiry = Readonly<{
  sessionId: string;
  restRevision: number;
}>;

export type ForegroundRestFeedbackDiagnostic =
  | "claim_failed"
  | "scheduled_notification_cancel_failed"
  | "preference_read_failed"
  | "tone_failed"
  | "vibration_failed";

export type ForegroundRestFeedbackResult = Readonly<{
  sessionId: string;
  restRevision: number;
  outcome:
    | "attempted"
    | "scheduled_fallback"
    | "already_attempted"
    | "claim_failed";
  diagnostics: readonly ForegroundRestFeedbackDiagnostic[];
}>;

type LifecycleAppState = Readonly<{
  currentState: AppStateStatus;
  addEventListener(
    type: "change",
    listener: (state: AppStateStatus) => void,
  ): Readonly<{ remove(): void }>;
}>;

function createDefaultForegroundRestFeedback(): ForegroundRestFeedbackPort {
  return require("../platform/notifications/expoForegroundRestFeedbackAdapter")
    .createExpoForegroundRestFeedbackAdapter() as ForegroundRestFeedbackPort;
}

type ForegroundExpiryReconciliation = Readonly<{
  context: RestContext | null | undefined;
  feedback: ForegroundRestFeedbackResult | undefined;
}>;

function effectSessionId(effect: PendingEffect): string {
  const payload = effect.payload as Record<string, unknown>;
  return typeof payload.sessionId === "string"
    ? payload.sessionId
    : effect.subjectId;
}

function emptyHistoryProjectionDrain(): HistoryProjectionEffectDrainResult {
  return {
    claimed: 0,
    completed: 0,
    permanentFailures: 0,
    retried: 0,
    superseded: 0,
  };
}

async function drainHistoryProjectionBatch(
  runner: ReturnType<typeof createHistoryProjectionEffectRunner>,
  nowMs: number,
): Promise<Readonly<{
  result: HistoryProjectionEffectDrainResult;
  failed: boolean;
}>> {
  try {
    return {
      result: await runner.drain({
        nowMs,
        limit: HISTORY_PROJECTION_DRAIN_BATCH_SIZE,
      }),
      failed: false,
    };
  } catch {
    return {
      result: emptyHistoryProjectionDrain(),
      failed: true,
    };
  }
}

async function cancelOrphanRestNotifications(input: Readonly<{
  activeSessionIds: readonly string[];
  notifications: RestNotificationPort;
}>): Promise<void> {
  const activeSessionIds = new Set(input.activeSessionIds);
  const scheduled = await input.notifications.listScheduled().catch(() => []);
  for (const request of scheduled) {
    if (
      !request.identifier.startsWith("rest:")
      || (
        request.sessionId !== null
        && activeSessionIds.has(request.sessionId)
      )
    ) {
      continue;
    }
    await input.notifications.cancel(request.identifier).catch(() => undefined);
  }
}

export function createWorkoutLifecycle(input: Readonly<{
  kernel: SqliteKernel;
  restRepository: RestRepository;
  progressionRepository?: ProgressionRepository;
  notifications: RestNotificationPort;
  nowMs: () => number;
  appState?: LifecycleAppState;
  effectStore?: EffectStore;
  historyProjectionRepository?: HistoryProjectionRepository;
  historyProjectionEffectStore?: HistoryProjectionEffectStore;
  foregroundFeedback?: ForegroundRestFeedbackPort;
  foregroundFeedbackStore?: ForegroundRestFeedbackStore;
}>) {
  const reconciler = createRestNotificationReconciler({
    repository: input.restRepository,
    notifications: input.notifications,
    nowMs: input.nowMs,
  });
  const effectStore = input.effectStore ?? createEffectStore(input.kernel);
  const historyProjectionEffectStore = input.historyProjectionRepository === undefined
    ? null
    : input.historyProjectionEffectStore
      ?? createHistoryProjectionEffectStore(input.kernel);
  const historyProjectionRunner = input.historyProjectionRepository === undefined
    || historyProjectionEffectStore === null
    ? null
    : createHistoryProjectionEffectRunner({
      repository: input.historyProjectionRepository,
      store: historyProjectionEffectStore,
    });
  let projectionDrainInFlight: Promise<Readonly<{
    result: HistoryProjectionEffectDrainResult;
    failed: boolean;
  }>> | null = null;
  let projectionDrainRequested = false;
  let disposed = false;
  const projectionDrainTimers = new Set<ReturnType<typeof setTimeout>>();
  const scheduleHistoryProjectionDrain = (delayMs: number, earliestNowMs = 0) => {
    if (disposed) {
      return;
    }
    const timer = setTimeout(() => {
      projectionDrainTimers.delete(timer);
      if (disposed) {
        return;
      }
      void requestHistoryProjectionDrain(Math.max(input.nowMs(), earliestNowMs));
    }, delayMs);
    projectionDrainTimers.add(timer);
  };
  const requestHistoryProjectionDrain = async (
    nowMs: number,
  ): Promise<HistoryProjectionEffectDrainResult> => {
    if (disposed || historyProjectionRunner === null) {
      return emptyHistoryProjectionDrain();
    }
    if (projectionDrainInFlight !== null) {
      projectionDrainRequested = true;
      return (await projectionDrainInFlight).result;
    }
    projectionDrainRequested = false;
    projectionDrainInFlight = (async () => {
      await historyProjectionEffectStore?.resetExpiredClaims(nowMs)
        .catch(() => undefined);
      return drainHistoryProjectionBatch(historyProjectionRunner, nowMs);
    })();
    try {
      const attempt = await projectionDrainInFlight;
      if (disposed) {
        return attempt.result;
      }
      const batch = attempt.result;
      const settled = batch.completed + batch.permanentFailures
        + batch.retried + batch.superseded;
      if (batch.claimed === HISTORY_PROJECTION_DRAIN_BATCH_SIZE) {
        scheduleHistoryProjectionDrain(0);
      }
      if (batch.retried > 0) {
        const retryDelayMs = HISTORY_PROJECTION_EFFECT_RETRY_DELAY_MS
          * (HISTORY_PROJECTION_EFFECT_MAX_ATTEMPTS - 1);
        scheduleHistoryProjectionDrain(retryDelayMs, nowMs + retryDelayMs);
      }
      if (attempt.failed || settled < batch.claimed) {
        scheduleHistoryProjectionDrain(
          HISTORY_PROJECTION_EFFECT_LEASE_DURATION_MS,
          nowMs + HISTORY_PROJECTION_EFFECT_LEASE_DURATION_MS,
        );
      }
      return batch;
    } finally {
      projectionDrainInFlight = null;
      if (!disposed && projectionDrainRequested) {
        projectionDrainRequested = false;
        scheduleHistoryProjectionDrain(0);
      }
    }
  };
  let foregroundFeedback = input.foregroundFeedback;
  const foregroundFeedbackStore = input.foregroundFeedbackStore
    ?? createForegroundRestFeedbackStore(input.kernel);

  function foregroundFeedbackAdapter(): ForegroundRestFeedbackPort {
    foregroundFeedback ??= createDefaultForegroundRestFeedback();
    return foregroundFeedback;
  }

  async function reconcileForegroundExpiry(
    sessionId: string,
    trigger: WorkoutLifecycleTrigger,
  ): Promise<ForegroundExpiryReconciliation> {
    if (trigger !== "foreground") {
      return { context: undefined, feedback: undefined };
    }
    const context = await input.restRepository.getRestContext(sessionId);
    if (context === null) {
      return { context: null, feedback: undefined };
    }
    let state = context.state;
    if (state.state === "running" && state.endsAtMs <= input.nowMs()) {
      const result = await input.restRepository.expireRest({
        sessionId,
        expectedSessionRevision: context.sessionRevision,
        expectedRestRevision: state.revision,
        nowMs: input.nowMs(),
      });
      state = result.state;
      const resolvedContext = {
        state,
        sessionRevision: result.sessionRevision,
      };
      return { context: resolvedContext, feedback: undefined };
    }
    return { context, feedback: undefined };
  }

  async function triggerForegroundFeedback(
    sessionId: string,
    state: RestStateV1,
  ): Promise<ForegroundRestFeedbackResult> {
    if (state.state !== "expired") {
      throw new Error("foreground_rest_feedback_not_expired");
    }
    const diagnostics: ForegroundRestFeedbackDiagnostic[] = [];
    let claim: Awaited<ReturnType<ForegroundRestFeedbackStore["claimPending"]>>;
    try {
      claim = await foregroundFeedbackStore.claimPending({
        sessionId,
        restRevision: state.revision,
      });
    } catch {
      return Object.freeze({
        sessionId,
        restRevision: state.revision,
        outcome: "claim_failed",
        diagnostics: Object.freeze<ForegroundRestFeedbackDiagnostic[]>([
          "claim_failed",
        ]),
      });
    }
    if (claim === "job_missing") {
      return Object.freeze({
        sessionId,
        restRevision: state.revision,
        outcome: "claim_failed",
        diagnostics: Object.freeze<ForegroundRestFeedbackDiagnostic[]>([
          "claim_failed",
        ]),
      });
    }
    if (claim === "already_attempted") {
      return Object.freeze({
        sessionId,
        restRevision: state.revision,
        outcome: "already_attempted",
        diagnostics: Object.freeze([]),
      });
    }
    const scheduledRequestCancelled = await input.notifications
      .cancel(`rest:${sessionId}`)
      .then(() => true)
      .catch(() => {
        diagnostics.push("scheduled_notification_cancel_failed");
        return false;
      });
    if (!scheduledRequestCancelled) {
      return Object.freeze({
        sessionId,
        restRevision: state.revision,
        outcome: "scheduled_fallback" as const,
        diagnostics: Object.freeze(diagnostics),
      });
    }
    const feedback = foregroundFeedbackAdapter();
    await Promise.all([
      claim.sound
        ? feedback.playTone({ sessionId }).catch(() => {
            diagnostics.push("tone_failed");
          })
        : Promise.resolve(),
      claim.vibration
        ? feedback.vibrate().catch(() => {
            diagnostics.push("vibration_failed");
          })
        : Promise.resolve(),
    ]);
    await foregroundFeedbackStore.complete({
      sessionId,
      restRevision: state.revision,
    }).catch(() => undefined);
    return Object.freeze({
      sessionId,
      restRevision: state.revision,
      outcome: "attempted",
      diagnostics: Object.freeze(diagnostics),
    });
  }
  const runner = createEffectRunner({
    store: effectStore,
    effectType: "reconcile_rest_notification",
    currentRevision: (subjectId, effectType) => (
      effectType === "reconcile_rest_notification"
        ? input.restRepository.currentRestRevision(subjectId)
        : Promise.resolve(null)
    ),
    handlers: {
      async reconcile_rest_notification(effect) {
        const result = await reconciler.reconcile(effectSessionId(effect));
        if (
          result.outcome === "permission_denied"
          || result.outcome === "permission_undetermined"
          || result.outcome === "platform_failure"
        ) {
          throw new EffectExecutionError(
            "transient",
            result.outcome,
          );
        }
      },
      regenerate_load_reps_recommendation: async () => undefined,
    },
  });
  const progressionRunner = createEffectRunner({
    store: effectStore,
    effectType: "regenerate_load_reps_recommendation",
    currentRevision: (subjectId, effectType) => (
      effectType === "regenerate_load_reps_recommendation"
        ? input.progressionRepository?.currentSessionRevision(subjectId)
          ?? Promise.resolve(null)
        : Promise.resolve(null)
    ),
    handlers: {
      reconcile_rest_notification: async () => undefined,
      async regenerate_load_reps_recommendation(effect) {
        const payload = effect.payload as Record<string, unknown>;
        const sessionId = typeof payload.sessionId === "string"
          ? payload.sessionId
          : effect.subjectId;
        if (input.progressionRepository === undefined) {
          throw new EffectExecutionError(
            "permanent",
            "progression_repository_unavailable",
          );
        }
        await input.progressionRepository.generateRecommendationsForSession(
          sessionId,
          effect.expectedRevision,
          input.nowMs(),
        );
      },
    },
  });

  return Object.freeze({
    async dispose(): Promise<void> {
      disposed = true;
      projectionDrainRequested = false;
      for (const timer of projectionDrainTimers) {
        clearTimeout(timer);
      }
      projectionDrainTimers.clear();
      await projectionDrainInFlight?.then(() => undefined, () => undefined);
    },

    async trigger(
      trigger: WorkoutLifecycleTrigger,
      options: Readonly<{ foregroundExpiry?: ForegroundRestExpiry }> = {},
    ): Promise<WorkoutLifecycleResult> {
      await foregroundFeedbackStore.prune({ nowMs: input.nowMs() })
        .catch(() => undefined);
      const sessionIds = await input.restRepository.listActiveSessionIds();
      const outcomes: RestReconciliationResult[] = [];
      const foregroundFeedback: ForegroundRestFeedbackResult[] = [];
      const postCommitExpiry = trigger === "post_commit"
        ? options.foregroundExpiry
        : undefined;
      if (
        postCommitExpiry !== undefined
        && sessionIds.includes(postCommitExpiry.sessionId)
      ) {
        const context = await input.restRepository
          .getRestContext(postCommitExpiry.sessionId)
          .catch(() => null);
        if (
          context?.state.state === "expired"
          && context.state.revision === postCommitExpiry.restRevision
        ) {
          foregroundFeedback.push(await triggerForegroundFeedback(
            postCommitExpiry.sessionId,
            context.state,
          ));
        }
      }
      if (trigger === "launch") {
        const pending = await foregroundFeedbackStore.listPending().catch(() => []);
        for (const pendingExpiry of pending) {
          const context = await input.restRepository
            .getRestContext(pendingExpiry.sessionId)
            .catch(() => null);
          if (
            context?.state.state === "expired"
            && context.state.revision === pendingExpiry.restRevision
          ) {
            foregroundFeedback.push(await triggerForegroundFeedback(
              pendingExpiry.sessionId,
              context.state,
            ));
          }
        }
      }
      for (const sessionId of sessionIds) {
        const foregroundExpiry = await reconcileForegroundExpiry(
          sessionId,
          trigger,
        ).catch(() => ({
          context: undefined,
          feedback: undefined,
        }));
        if (foregroundExpiry.feedback !== undefined) {
          foregroundFeedback.push(foregroundExpiry.feedback);
        }
        outcomes.push(await reconciler.reconcile(
          sessionId,
          foregroundExpiry.context,
        ));
      }
      await cancelOrphanRestNotifications({
        activeSessionIds: sessionIds,
        notifications: input.notifications,
      });
      const permission = await input.notifications.permission()
        .catch(() => "denied" as const);
      const drain = await runner.drain({
        nowMs: input.nowMs(),
        limit: 16,
      });
      const progressionDrain = await progressionRunner.drain({
        nowMs: input.nowMs(),
        limit: 16,
      });
      const historyProjectionDrain = historyProjectionRunner === null
        ? {
          claimed: 0,
          completed: 0,
          permanentFailures: 0,
          retried: 0,
          superseded: 0,
        }
        : await (async () => {
          const projectionNowMs = input.nowMs();
          return requestHistoryProjectionDrain(projectionNowMs);
        })();
      return {
        trigger,
        reconciled: outcomes.length,
        permission,
        drain,
        progressionDrain,
        historyProjectionDrain,
        outcomes,
        foregroundFeedback: Object.freeze(foregroundFeedback),
      };
    },

    subscribeForeground(
      onResult?: (result: WorkoutLifecycleResult) => void,
    ) {
      if (disposed) {
        return () => undefined;
      }
      const appState = input.appState
        ?? (require("react-native") as typeof import("react-native")).AppState;
      let previous: AppStateStatus = appState.currentState;
      const subscription = appState.addEventListener("change", (next) => {
        const enteringForeground = previous !== "active" && next === "active";
        previous = next;
        if (enteringForeground && !disposed) {
          void this.trigger("foreground").then(onResult, () => undefined);
        }
      });
      return () => subscription.remove();
    },
  });
}
