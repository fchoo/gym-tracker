import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createHash } from "node:crypto";
import React from "react";
import { Text } from "react-native";

import starterPlansAsset from "../../assets/content/starter-plans.v2.json";
import starterPlansAcceptanceAsset from "../../artifacts/review/phase2/starter-plans-acceptance.json";
import type {
  PlansRepository,
  StarterActivation,
} from "../domains/plans";
import {
  REST_NOTIFICATION_CHANNEL_IDS,
  type RestCommandResult,
  type RestNotificationPort,
  type RestRepository,
  type ScheduledRestNotification,
  type RestStateV1,
} from "../domains/rest";
import type {
  ProgressionRepository,
} from "../domains/progression";
import type {
  ActiveWorkoutRepository,
  ActiveWorkoutView,
  SessionDetail,
  StartedWorkout,
  TodayView,
  WorkoutOutcomeRepository,
  WorkoutRepository,
} from "../domains/workout";
import {
  WorkoutCommandConflictError,
} from "../domains/workout";
import type { SqliteKernel } from "../platform/sqlite";
import type {
  SqliteTransactionExecutor,
} from "../platform/sqlite/sqliteKernel";
import {
  PrimaryAction,
} from "../ui/components";
import {
  AppearanceProvider,
} from "../ui/theme";

jest.mock("../platform/notifications/expoRestNotificationAdapter", () => ({
  createExpoRestNotificationAdapter: jest.fn(() => ({
    ensureChannel: jest.fn(async () => undefined),
    permission: jest.fn(async () => "granted"),
    requestPermission: jest.fn(async () => "granted"),
    listScheduled: jest.fn(async () => []),
    cancel: jest.fn(async () => undefined),
    schedule: jest.fn(async (input: { identifier: string }) =>
      input.identifier
    ),
    openSettings: jest.fn(async () => undefined),
  })),
}));

import {
  acknowledgeCommittedRuntimeResult,
  activateInitialAcceptedStarter,
  createWorkoutAppRuntimeDependencies,
  mapWorkoutMutationFailure,
  productionWorkoutAppRuntimeDependencies,
  WorkoutAppRuntimeProvider,
  type WorkoutAppRuntimeDependencies,
  useWorkoutAppRuntime,
} from "./workoutAppRuntime";
import {
  createStarterPlanRuntimeCatalog,
} from "./starterPlanRuntime";
import type {
  WorkoutLifecycleResult,
} from "./workoutLifecycle";
import type {
  ScheduleRuntimeAdapter,
} from "./scheduleRuntime";

type Repository = PlansRepository & WorkoutRepository;

const activation: StarterActivation = {
  plan: {
    id: "plan-copy",
    origin: "copied",
    sourceNamespace: "gym-tracker.original",
    upstreamId: "full-body-foundation",
    name: "Full Body Foundation",
    isActive: true,
    revision: 1,
  },
  days: [
    { id: "day-a", name: "Full Body A", ordinal: 0 },
    { id: "day-b", name: "Full Body B", ordinal: 1 },
  ],
  schedule: {
    id: "schedule-1",
    mode: "weekday",
    startLocalDate: "2026-08-17",
    timezone: "Asia/Singapore",
    cycleLengthWeeks: 2,
  },
};

const noPlanView: TodayView = { state: "no_active_plan" };
const scheduledView: TodayView = {
  state: "scheduled",
  planId: "plan-copy",
  planName: "Full Body Foundation",
  dayId: "day-a",
  dayName: "Full Body A",
  estimateMinutes: 48,
  exercises: [],
};
const activeView: TodayView = {
  state: "active_workout",
  sessionId: "session-1",
  exerciseName: "Back Squat",
  setLabel: "Working set 1",
  restStatus: "idle",
};
const activeWorkoutView: ActiveWorkoutView = {
  id: "session-1",
  status: "in_progress",
  revision: 1,
  activeExerciseId: "exercise-1",
  activeSetId: "set-1",
  currentExercise: {
    id: "exercise-1",
    exerciseId: "squat",
    name: "Back Squat",
    metricIdentity: {
      profile: "load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    metricProfile: "load_reps",
    ordinal: 0,
    defaultRestSeconds: 180,
    status: "active",
    revision: 1,
    warmups: [],
    workingSets: [{
      id: "set-1",
      kind: "working",
      ordinal: 0,
      sourceTargetId: "target-1",
      metricIdentity: {
        profile: "load_reps",
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      target: {
        version: 1,
        profile: "load_reps",
        loadGrams: 60_000,
        minReps: 6,
        maxReps: 8,
        incrementGrams: 2_500,
        perSide: false,
      },
      observation: null,
      status: "planned",
      completedAtMs: null,
      revision: 1,
      valueSources: [{
        source: "plan_default",
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          reps: 8,
          source: "plan_default",
        },
      }],
    }],
  },
  exercises: [],
  progress: {
    completedWorkingSets: 0,
    totalWorkingSets: 1,
  },
  rest: {
    version: 1,
    state: "idle",
    revision: 0,
    nextSetId: null,
  },
};

function activeWorkoutViewWithCommittedSet(
  setId: string,
  kind: "warmup" | "working",
): ActiveWorkoutView {
  const source = activeWorkoutView.currentExercise.workingSets[0]!;
  const inserted = {
    ...source,
    id: setId,
    kind,
    ordinal: kind === "warmup"
      ? activeWorkoutView.currentExercise.warmups.length
      : activeWorkoutView.currentExercise.workingSets.length,
    sourceTargetId: kind === "warmup" ? null : source.sourceTargetId,
  } as const;
  return {
    ...activeWorkoutView,
    revision: activeWorkoutView.revision + 1,
    currentExercise: {
      ...activeWorkoutView.currentExercise,
      warmups: kind === "warmup"
        ? [...activeWorkoutView.currentExercise.warmups, inserted]
        : activeWorkoutView.currentExercise.warmups,
      workingSets: kind === "working"
        ? [...activeWorkoutView.currentExercise.workingSets, inserted]
        : activeWorkoutView.currentExercise.workingSets,
    },
  };
}

function runtimeActiveWorkoutRepository(): ActiveWorkoutRepository & {
  getActiveWorkout: jest.MockedFunction<
    ActiveWorkoutRepository["getActiveWorkout"]
  >;
  getWorkoutSession: jest.MockedFunction<
    ActiveWorkoutRepository["getWorkoutSession"]
  >;
  updateActiveSetDraft: jest.MockedFunction<
    ActiveWorkoutRepository["updateActiveSetDraft"]
  >;
  addWarmup: jest.MockedFunction<ActiveWorkoutRepository["addWarmup"]>;
  addWorkingSet: jest.MockedFunction<
    ActiveWorkoutRepository["addWorkingSet"]
  >;
  copyPreviousWarmup: jest.MockedFunction<
    ActiveWorkoutRepository["copyPreviousWarmup"]
  >;
  reviseCompletedSet: jest.MockedFunction<
    ActiveWorkoutRepository["reviseCompletedSet"]
  >;
  completeWarmup: jest.MockedFunction<
    ActiveWorkoutRepository["completeWarmup"]
  >;
  skipWarmup: jest.MockedFunction<ActiveWorkoutRepository["skipWarmup"]>;
  completeSet: jest.MockedFunction<ActiveWorkoutRepository["completeSet"]>;
  undoCompletedSet: jest.MockedFunction<
    ActiveWorkoutRepository["undoCompletedSet"]
  >;
} {
  return {
    getActiveWorkout: jest.fn(async () => activeWorkoutView),
    getWorkoutSession: jest.fn(async () => activeWorkoutView),
    updateActiveSetDraft: jest.fn(async () => activeWorkoutView),
    updateWarmupDraft: jest.fn(async () => activeWorkoutView),
    addWarmup: jest.fn(async () => activeWorkoutView),
    addWorkingSet: jest.fn(async () => activeWorkoutView),
    copyPreviousWarmup: jest.fn(async () => activeWorkoutView),
    reviseCompletedSet: jest.fn(async () => activeWorkoutView),
    completeWarmup: jest.fn(async () => activeWorkoutView),
    skipWarmup: jest.fn(async () => activeWorkoutView),
    skipWorkingSet: jest.fn(async () => activeWorkoutView),
    completeSet: jest.fn(async () => ({
      outcome: "committed",
      view: activeWorkoutView,
    })),
    undoCompletedSet: jest.fn(async () => ({
      outcome: "undone",
      view: activeWorkoutView,
    })),
  };
}

function runtimeRestRepository(): RestRepository {
  const idle: RestStateV1 = {
    version: 1,
    state: "idle",
    revision: 0,
    nextSetId: null,
  };
  const result: RestCommandResult = {
    state: idle,
    sessionRevision: 2,
    invalidationScopes: [
      ["active-workout", "session-1"],
      ["today"],
    ],
  };
  return {
    getRestState: jest.fn(async () => idle),
    getRestContext: jest.fn(async () => ({
      state: idle,
      sessionRevision: 1,
    })),
    listActiveSessionIds: jest.fn(async () => ["session-1"]),
    currentRestRevision: jest.fn(async () => 0),
    startManualRest: jest.fn(async () => result),
    pauseRest: jest.fn(async () => result),
    resumeRest: jest.fn(async () => result),
    adjustRest: jest.fn(async () => result),
    skipRest: jest.fn(async () => result),
    expireRest: jest.fn(async () => result),
    expireRestWithForegroundFeedback: jest.fn(async () => result),
  };
}

const runtimeSessionDetail: SessionDetail = {
  id: "session-1",
  status: "completed",
  statusLabel: "Completed",
  sourceLabel: "Planned day",
  planName: "Full Body Foundation",
  dayName: "Full Body A",
  localDate: "2026-08-17",
  timezone: "Asia/Singapore",
  startedAtMs: 1_000,
  endedAtMs: 2_000,
  durationMs: 1_000,
  revision: 2,
  exerciseProgress: { completed: 1, planned: 1, percent: 100 },
  workingSetProgress: { completed: 1, planned: 1, percent: 100 },
  exercises: [],
  nonLoadOutcomes: [],
  recommendations: [],
  recommendationStatus: "none",
  resumable: false,
  readOnly: true,
};

function runtimeOutcomeRepository():
WorkoutOutcomeRepository & ProgressionRepository {
  const finishResult = {
    detail: runtimeSessionDetail,
    invalidationScopes: [
      ["today"] as const,
      ["session-detail", "session-1"] as const,
      ["workout-completion", "session-1"] as const,
    ],
  };
  return {
    getSessionDetail: jest.fn(async () => runtimeSessionDetail),
    finishCompleted: jest.fn(async () => finishResult),
    finishPartial: jest.fn(async () => finishResult),
    saveZeroSetWorkout: jest.fn(async () => finishResult),
    discardWorkout: jest.fn(async () => finishResult),
    skipExercise: jest.fn<WorkoutOutcomeRepository["skipExercise"]>(
      async () => ({
      sessionId: "session-1",
      status: "in_progress" as const,
      sessionRevision: 2,
      }),
    ),
    resumePartialWorkout: jest.fn<
      WorkoutOutcomeRepository["resumePartialWorkout"]
    >(async () => ({
      sessionId: "session-1",
      status: "in_progress" as const,
      sessionRevision: 3,
    })),
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
    generateRecommendationsForSession: jest.fn(async () => 1),
    currentSessionRevision: jest.fn(async () => 2),
  };
}

function runtimeNotifications(
  permission: "granted" | "denied" | "undetermined" = "granted",
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

function runtimeLifecycle(
  permission: "granted" | "denied" | "undetermined" = "granted",
) {
  const result: WorkoutLifecycleResult = {
    trigger: "launch",
    reconciled: 0,
    permission,
    drain: {
      claimed: 0,
      completed: 0,
      permanentFailures: 0,
      retried: 0,
      superseded: 0,
    },
    progressionDrain: {
      claimed: 0,
      completed: 0,
      permanentFailures: 0,
      retried: 0,
      superseded: 0,
    },
    historyProjectionDrain: {
      claimed: 0,
      completed: 0,
      permanentFailures: 0,
      retried: 0,
      superseded: 0,
    },
    outcomes: [],
    foregroundFeedback: [],
  };
  return {
    trigger: jest.fn(async (trigger: WorkoutLifecycleResult["trigger"]) => ({
      ...result,
      trigger,
    })),
    subscribeForeground: jest.fn(() => () => undefined),
  };
}

function runtimeScheduleAdapter(): ScheduleRuntimeAdapter {
  return {
    actOnToday: jest.fn(async () => null),
    chooseTimeZone: jest.fn(async () => null),
    completeScheduledSession: jest.fn(async () => null),
    consumeDateOverride: jest.fn(async () => null),
    loadSchedule: jest.fn(async () => null),
    loadToday: jest.fn(async () => null),
    markWeekdayMissed: jest.fn(async () => null),
    recordTrainAnyway: jest.fn(async () => null),
    saveSchedule: jest.fn(async () => null),
    setDateOverride: jest.fn(async () => null),
  } as unknown as ScheduleRuntimeAdapter;
}

function runtimeRepository(
  views: TodayView[],
  activations: Array<StarterActivation | null>,
): Repository & {
  activateStarterPlan: jest.MockedFunction<PlansRepository["activateStarterPlan"]>;
  startWorkout: jest.MockedFunction<WorkoutRepository["startWorkout"]>;
} {
  let viewIndex = 0;
  let activationIndex = 0;
  return {
    activateStarterPlan: jest.fn(async () => activation),
    startWorkout: jest.fn(async (request) => ({
      id: "session-1",
      source: request.mode === "empty" ? "empty" : "scheduled_day",
      status: "in_progress",
      planId: request.mode === "empty" ? null : request.planId,
      planDayId: request.mode === "empty" ? null : request.planDayId,
      revision: 1,
    } satisfies StartedWorkout)),
    getTodayView: jest.fn(async () => {
      const view = views[Math.min(viewIndex, views.length - 1)];
      viewIndex += 1;
      if (view === undefined) {
        throw new Error("today_read_failed");
      }
      return view;
    }),
    async getActivation() {
      const value = activations[
        Math.min(activationIndex, activations.length - 1)
      ] ?? null;
      activationIndex += 1;
      return value;
    },
    async getPlanDays() {
      return activation.days;
    },
  };
}

function dependencies(
  repository: Repository,
  overrides: Partial<WorkoutAppRuntimeDependencies> = {},
): WorkoutAppRuntimeDependencies {
  const kernel = {
    close: jest.fn(async () => undefined),
  } as unknown as SqliteKernel;
  return {
    openKernel: jest.fn(async () => kernel),
    migrate: jest.fn(async () => undefined),
    activateInitialStarter: jest.fn(async () => undefined),
    createRepository: () => repository,
    createNotifications: () => runtimeNotifications(),
    createLifecycle: () => runtimeLifecycle(),
    createRestRepository: () => runtimeRestRepository(),
    createOutcomeRepository: () => runtimeOutcomeRepository(),
    createWorkoutRepository: () => runtimeActiveWorkoutRepository(),
    now: () => new Date("2026-08-17T08:00:00+08:00"),
    nowMs: () => 1_786_853_600_000,
    ...overrides,
  };
}

function RuntimeProbe() {
  const runtime = useWorkoutAppRuntime();
  return (
    <>
      <Text testID="runtime-state">{runtime.launchState}</Text>
      <Text testID="runtime-view">{runtime.view?.state ?? "none"}</Text>
      <Text testID="runtime-days">{runtime.planDays.length}</Text>
      <Text testID="runtime-failure">
        {runtime.failure?.correlationCode ?? "none"}
      </Text>
      <Text testID="runtime-action-failure">
        {runtime.actionFailure?.correlationCode ?? "none"}
      </Text>
      <Text testID="runtime-notification-permission">
        {runtime.notificationPermission}
      </Text>
      <Text testID="runtime-rest-sound">
        {runtime.launchState === "trusted"
          ? String(runtime.readRestAlertPreferences().soundEnabled)
          : "unavailable"}
      </Text>
      <PrimaryAction
        label="Request runtime notifications"
        onPress={() => {
          void runtime.requestRestNotificationPermission()
            .catch(() => undefined);
        }}
      />
      <PrimaryAction
        label="Disable runtime rest sound"
        onPress={() => {
          void runtime.setRestAlertPreferences({
            soundEnabled: false,
            vibrationEnabled: true,
          }).catch(() => undefined);
        }}
      />
      <PrimaryAction
        label="Activate runtime plan"
        onPress={() => {
          void runtime.activatePlan().catch(() => undefined);
        }}
      />
      <PrimaryAction
        label="Start runtime day"
        onPress={() => {
          void runtime.startPlanDay("day-a", "scheduled")
            .catch(() => undefined);
        }}
      />
      <PrimaryAction
        label="Start runtime empty"
        onPress={() => {
          void runtime.startEmptyWorkout().catch(() => undefined);
        }}
      />
      <PrimaryAction
        label="Refresh runtime"
        onPress={() => {
          void runtime.refresh().catch(() => undefined);
        }}
      />
      <PrimaryAction
        label="Run runtime workout commands"
        onPress={() => {
          void runtime.getActiveWorkout("session-1").then(async (view) => {
            if ("state" in view) {
              throw new Error("expected planned workout");
            }
            const set = view.currentExercise.workingSets[0]!;
            const observation = set.valueSources[0]!.observation;
            await runtime.updateActiveSetDraft({
              sessionId: view.id,
              setId: set.id,
              expectedSetRevision: set.revision,
              metricIdentity: set.metricIdentity,
              observation,
              updatedAtMs: 2_000,
            });
            await runtime.updateWarmupDraft({
              sessionId: view.id,
              setId: "warmup-added",
              expectedSetRevision: 1,
              observation: {
                version: 1,
                profile: "load_reps",
                loadGrams: 20_000,
                reps: 5,
                source: "manual",
              },
              updatedAtMs: 2_000,
            });
            await runtime.addWarmup({
              sessionId: view.id,
              sessionExerciseId: view.currentExercise.id,
              setId: "warmup-added",
              observation: {
                version: 1,
                profile: "load_reps",
                loadGrams: 20_000,
                reps: 5,
                source: "manual",
              },
              nowMs: 2_000,
            });
            await runtime.addWorkingSet({
              sessionId: view.id,
              sessionExerciseId: view.currentExercise.id,
              sourceSetId: set.id,
              setId: "working-added",
              nowMs: 2_000,
            });
            await runtime.copyPreviousWarmup({
              sessionId: view.id,
              sourceSetId: "warmup-added",
              setId: "warmup-copied",
              nowMs: 2_001,
            });
            await runtime.reviseCompletedSet({
              sessionId: view.id,
              setId: set.id,
              expectedSessionRevision: view.revision,
              expectedSetRevision: set.revision,
              correctionIdempotencyKey: "runtime-correction",
              metricIdentity: set.metricIdentity,
              observation,
              revisedAtMs: 2_001,
            });
            await runtime.completeWarmup({
              sessionId: view.id,
              setId: "warmup-added",
              expectedSetRevision: 1,
              completedAtMs: 2_002,
            });
            await runtime.skipWarmup({
              sessionId: view.id,
              setId: "warmup-copied",
              expectedSetRevision: 1,
              skippedAtMs: 2_003,
            });
            await runtime.skipWorkingSet({
              sessionId: view.id,
              setId: set.id,
              expectedSessionRevision: view.revision,
              expectedSetRevision: set.revision,
              metricIdentity: set.metricIdentity,
              skippedAtMs: 2_003,
            });
            await runtime.completeSet({
              sessionId: view.id,
              setId: set.id,
              expectedSessionRevision: view.revision,
              expectedSetRevision: set.revision,
              completionIdempotencyKey: "runtime-complete",
              metricIdentity: set.metricIdentity,
              observation,
              completedAtMs: 2_004,
            });
            await runtime.undoCompletedSet({
              sessionId: view.id,
              completedSetId: set.id,
              nowMs: 2_005,
            });
          });
        }}
      />
      <PrimaryAction
        label="Run runtime outcome commands"
        onPress={() => {
          void (async () => {
            await runtime.getSessionDetail("session-1");
            await runtime.finishCompleted({
              sessionId: "session-1",
              expectedSessionRevision: 1,
              endedAtMs: 2_000,
            });
            await runtime.finishPartial({
              sessionId: "session-1",
              expectedSessionRevision: 1,
              confirmation: "save_partial_workout",
              endedAtMs: 2_000,
            });
            await runtime.saveZeroSetWorkout({
              sessionId: "session-1",
              expectedSessionRevision: 1,
              confirmation: "save_zero_set_workout",
              endedAtMs: 2_000,
            });
            await runtime.discardWorkout({
              sessionId: "session-1",
              expectedSessionRevision: 1,
              confirmation: "discard_workout",
              endedAtMs: 2_000,
            });
            await runtime.skipExercise({
              sessionId: "session-1",
              sessionExerciseId: "exercise-1",
              expectedSessionRevision: 1,
              expectedExerciseRevision: 1,
              confirmation: "skip_exercise",
              nowMs: 2_000,
            });
            await runtime.resumePartialWorkout({
              sessionId: "session-1",
              expectedSessionRevision: 2,
              resumedAtMs: 3_000,
            });
            await runtime.recordExerciseEffort({
              sessionId: "session-1",
              sessionExerciseId: "exercise-1",
              expectedExerciseRevision: 1,
              effort: "on_target",
              recordedAtMs: 3_000,
            });
            await runtime.acceptRecommendation("recommendation-1");
            await runtime.keepCurrentTarget("recommendation-2");
          })();
        }}
      />
      <PrimaryAction
        label="Run runtime custom exercise commands"
        onPress={() => {
          void Promise.allSettled([
            runtime.createCustomExercise({
              requestId: "runtime-create",
              exerciseId: "runtime-exercise",
              name: "Runtime Exercise",
              aliases: [],
              exerciseType: "strength",
              movementClass: "compound",
              primaryMuscles: ["core"],
              secondaryMuscles: [],
              equipment: ["bodyweight"],
              metricIdentity: {
                profile: "bodyweight_reps",
                contractVersion: 1,
                exerciseMetricGeneration: 1,
              },
              defaultRestSeconds: 60,
              progression: {
                kind: "manual_hold",
                version: 1,
              },
            }),
            runtime.editCustomExercise({
              requestId: "runtime-edit",
              exerciseId: "runtime-exercise",
              name: "Runtime Exercise Edited",
              aliases: [],
              exerciseType: "strength",
              movementClass: "compound",
              primaryMuscles: ["core"],
              secondaryMuscles: [],
              equipment: ["bodyweight"],
              metricIdentity: {
                profile: "bodyweight_reps",
                contractVersion: 1,
                exerciseMetricGeneration: 1,
              },
              defaultRestSeconds: 60,
              progression: {
                kind: "manual_hold",
                version: 1,
              },
              expectedExerciseRevision: 1,
            }),
            runtime.previewCustomExerciseArchive("runtime-exercise", 1),
            runtime.migrateCustomExerciseMetricProfile({
              exerciseId: "runtime-exercise",
              expectedExerciseRevision: 1,
              fromIdentity: {
                profile: "bodyweight_reps",
                contractVersion: 1,
                exerciseMetricGeneration: 1,
              },
              toIdentity: {
                profile: "unscored",
                contractVersion: 1,
                exerciseMetricGeneration: 2,
              },
              replacements: [{
                targetId: "runtime-target",
                expectedTargetRevision: 1,
                target: {
                  profile: "unscored",
                  version: 1,
                  completionRequired: true,
                },
                unit: {
                  version: 1,
                  completion: "boolean",
                },
              }],
              policyDecisions: [{
                planDayExerciseId: "runtime-occurrence",
                expectedPolicyRevision: 1,
                policy: {
                  kind: "manual_hold",
                  version: 1,
                },
              }],
              acknowledgedHistoryImmutable: true,
              idempotencyKey: "runtime-migration",
            }),
          ]);
        }}
      />
      <PrimaryAction
        label="Run runtime schedule commands"
        onPress={() => {
          void Promise.allSettled([
            runtime.loadSchedule("plan-copy"),
            runtime.loadToday(1),
            runtime.actOnToday("repeat"),
            runtime.chooseTimeZone(
              "Keep current timezone",
              "America/New_York",
            ),
            runtime.completeScheduledSession("session-1"),
            runtime.consumeDateOverride("2026-08-17"),
            runtime.markWeekdayMissed("2026-08-16"),
            runtime.recordTrainAnyway({
              workout: { kind: "empty", planDayId: null },
              advanceRotation: false,
            }),
            runtime.saveSchedule({
              planId: "plan-copy",
              scheduleId: "schedule-1",
              expectedPlanRevision: 1,
              expectedScheduleRevision: 1,
              expectedActivePair: {
                kind: "pair",
                planId: "plan-copy",
                planRevision: 1,
                scheduleId: "schedule-1",
                scheduleRevision: 1,
              },
              before: null,
              todayLocalDate: "2026-08-17",
              next: {
                effectiveLocalDate: "2026-08-17",
                mode: "rotation",
                timeZone: "Asia/Singapore",
                bindings: [{ ordinal: 0, planDayId: "day-a" }],
              },
            }),
            runtime.setDateOverride({
              localDate: "2026-08-17",
              replacement: { kind: "skip" },
            }),
          ]);
        }}
      />
      <PrimaryAction label="Retry runtime" onPress={runtime.retry} />
    </>
  );
}

function RuntimeHarness({
  dependencies: runtimeDependencies,
}: Readonly<{ dependencies: WorkoutAppRuntimeDependencies }>) {
  return (
    <AppearanceProvider>
      <WorkoutAppRuntimeProvider dependencies={runtimeDependencies}>
        <RuntimeProbe />
      </WorkoutAppRuntimeProvider>
    </AppearanceProvider>
  );
}

function RuntimeCapture({
  onReady,
}: Readonly<{
  onReady(value: ReturnType<typeof useWorkoutAppRuntime>): void;
}>) {
  const runtime = useWorkoutAppRuntime();
  React.useEffect(() => {
    onReady(runtime);
  }, [onReady, runtime]);
  return <Text testID="runtime-capture-state">{runtime.launchState}</Text>;
}

function RuntimeCaptureHarness({
  dependencies: runtimeDependencies,
  onReady,
}: Readonly<{
  dependencies: WorkoutAppRuntimeDependencies;
  onReady(value: ReturnType<typeof useWorkoutAppRuntime>): void;
}>) {
  return (
    <AppearanceProvider>
      <WorkoutAppRuntimeProvider dependencies={runtimeDependencies}>
        <RuntimeCapture onReady={onReady} />
      </WorkoutAppRuntimeProvider>
    </AppearanceProvider>
  );
}

describe("WorkoutAppRuntimeProvider", () => {
  it("exposes factual progress only through the trusted runtime boundary", async () => {
    const kernel = {
      close: jest.fn(async () => undefined),
      queryAll: jest.fn(async () => []),
    } as unknown as SqliteKernel;
    const repository = runtimeRepository([noPlanView], [null]);
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;

    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          openKernel: jest.fn(async () => kernel),
        })}
        onReady={(runtime) => {
          captured = runtime;
        }}
      />,
    );

    await waitFor(() => {
      expect(captured?.launchState).toBe("trusted");
    });

    await expect(captured!.loadProgress({
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
    })).resolves.toEqual({
      period: "4_weeks",
      freshness: "current",
      projection: expect.objectContaining({
        state: "baseline",
        window: { start: "2026-07-28", end: "2026-08-24" },
      }),
    });
    expect((kernel as unknown as { queryAll: jest.Mock }).queryAll)
      .toHaveBeenCalled();
  });

  it("keeps the development expiry bridge unavailable until launch is trusted", async () => {
    let resolveOpen: ((kernel: SqliteKernel) => void) | undefined;
    const kernel = {
      close: jest.fn(async () => undefined),
    } as unknown as SqliteKernel;
    const repository = runtimeRepository([noPlanView], [null]);
    const createRestRepository = jest.fn(() => runtimeRestRepository());
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;

    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createRestRepository,
          openKernel: jest.fn(() => new Promise<SqliteKernel>((resolve) => {
            resolveOpen = resolve;
          })),
        })}
        onReady={(runtime) => {
          captured = runtime;
        }}
      />,
    );

    await expect(captured!.exerciseNotificationExpiry("foreground"))
      .resolves.toBe("runtime_contract_unavailable");
    expect(createRestRepository).not.toHaveBeenCalled();

    resolveOpen?.(kernel);
    await waitFor(() => {
      expect(captured?.launchState).toBe("trusted");
    });
  });

  it("expires one authoritative running rest and proves its foreground feedback claim is consumed", async () => {
    const nowMs = 1_786_853_600_000;
    const endsAtMs = nowMs + 60_000;
    const repository = runtimeRepository([noPlanView], [null]);
    const restRepository = runtimeRestRepository();
    const lifecycle = runtimeLifecycle();
    jest.spyOn(restRepository, "getRestContext").mockResolvedValue({
      state: {
        version: 1,
        state: "running",
        revision: 7,
        startedAtMs: nowMs - 30_000,
        endsAtMs,
        nextSetId: "set-2",
      },
      sessionRevision: 11,
    });
    jest.spyOn(restRepository, "expireRestWithForegroundFeedback").mockResolvedValue({
      state: {
        version: 1,
        state: "expired",
        revision: 8,
        expiredAtMs: endsAtMs,
        nextSetId: "set-2",
      },
      sessionRevision: 12,
      invalidationScopes: [
        ["active-workout", "session-1"],
        ["today"],
      ],
    });
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createLifecycle: () => lifecycle,
          createRestRepository: () => restRepository,
          nowMs: () => nowMs,
        })}
        onReady={(runtime) => {
          captured = runtime;
        }}
      />,
    );
    await waitFor(() => {
      expect(captured?.launchState).toBe("trusted");
    });
    lifecycle.trigger.mockClear();
    lifecycle.trigger
      .mockResolvedValueOnce({
        ...await runtimeLifecycle().trigger("post_commit"),
        foregroundFeedback: [{
          sessionId: "session-1",
          restRevision: 8,
          outcome: "attempted",
          diagnostics: [],
        }],
      })
      .mockResolvedValueOnce({
        ...await runtimeLifecycle().trigger("post_commit"),
        foregroundFeedback: [{
          sessionId: "session-1",
          restRevision: 8,
          outcome: "already_attempted",
          diagnostics: [],
        }],
      });

    let expiryCode: Awaited<ReturnType<
      NonNullable<typeof captured>["exerciseNotificationExpiry"]
    >> | undefined;
    await act(async () => {
      expiryCode = await captured!.exerciseNotificationExpiry("foreground");
    });
    expect(expiryCode).toBe("foreground_expiry_attempted_once");
    expect(restRepository.expireRestWithForegroundFeedback).toHaveBeenCalledWith({
      sessionId: "session-1",
      expectedSessionRevision: 11,
      expectedRestRevision: 7,
      nowMs: endsAtMs,
      preferences: { soundEnabled: true, vibrationEnabled: true },
    });
    expect(lifecycle.trigger).toHaveBeenNthCalledWith(1, "post_commit", {
      foregroundExpiry: { sessionId: "session-1", restRevision: 8 },
    });
    expect(lifecycle.trigger).toHaveBeenNthCalledWith(2, "post_commit", {
      foregroundExpiry: { sessionId: "session-1", restRevision: 8 },
    });
  });

  it("returns a bounded unavailable result without mutating when there is no unique running rest", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const restRepository = runtimeRestRepository();
    const lifecycle = runtimeLifecycle();
    jest.spyOn(restRepository, "getRestContext").mockResolvedValue({
      state: {
        version: 1,
        state: "paused",
        revision: 7,
        remainingMs: 30_000,
        nextSetId: "set-2",
      },
      sessionRevision: 11,
    });
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createLifecycle: () => lifecycle,
          createRestRepository: () => restRepository,
        })}
        onReady={(runtime) => {
          captured = runtime;
        }}
      />,
    );
    await waitFor(() => {
      expect(captured?.launchState).toBe("trusted");
    });
    lifecycle.trigger.mockClear();

    await expect(captured!.exerciseNotificationExpiry("foreground"))
      .resolves.toBe("runtime_contract_unavailable");
    expect(restRepository.expireRest).not.toHaveBeenCalled();
    expect(lifecycle.trigger).not.toHaveBeenCalled();
  });

  it("reports a post-commit lifecycle failure without claiming the authoritative expiry was undone", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const restRepository = runtimeRestRepository();
    const lifecycle = runtimeLifecycle();
    jest.spyOn(restRepository, "getRestContext").mockResolvedValue({
      state: {
        version: 1,
        state: "running",
        revision: 7,
        startedAtMs: 90_000,
        endsAtMs: 120_000,
        nextSetId: "set-2",
      },
      sessionRevision: 11,
    });
    jest.spyOn(restRepository, "expireRestWithForegroundFeedback").mockResolvedValue({
      state: {
        version: 1,
        state: "expired",
        revision: 8,
        expiredAtMs: 120_000,
        nextSetId: "set-2",
      },
      sessionRevision: 12,
      invalidationScopes: [["active-workout", "session-1"], ["today"]],
    });
    lifecycle.trigger.mockRejectedValueOnce(new Error("lifecycle_unavailable"));
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createLifecycle: () => lifecycle,
          createRestRepository: () => restRepository,
        })}
        onReady={(runtime) => {
          captured = runtime;
        }}
      />,
    );
    await waitFor(() => {
      expect(captured?.launchState).toBe("trusted");
    });
    lifecycle.trigger.mockClear();
    lifecycle.trigger.mockRejectedValueOnce(new Error("lifecycle_unavailable"));

    await expect(captured!.exerciseNotificationExpiry("foreground"))
      .resolves.toBe("platform_failure_after_expiry_commit");
    expect(restRepository.expireRestWithForegroundFeedback).toHaveBeenCalledWith({
      sessionId: "session-1",
      expectedSessionRevision: 11,
      expectedRestRevision: 7,
      nowMs: 120_000,
      preferences: { soundEnabled: true, vibrationEnabled: true },
    });
  });

  it("replaces and verifies one non-rest background probe using current preferences", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const probeIdentifier = "notification-test:background-expiry";
    let scheduled: ScheduledRestNotification[] = [
      {
        identifier: probeIdentifier,
        sessionId: "notification-test",
        restRevision: 0,
        endsAtMs: 1,
      },
      {
        identifier: "rest:session-1",
        sessionId: "session-1",
        restRevision: 4,
        endsAtMs: 2,
      },
    ];
    const notifications = runtimeNotifications();
    notifications.listScheduled = jest.fn(async () => scheduled);
    notifications.cancel = jest.fn(async (identifier) => {
      scheduled = scheduled.filter((request) =>
        request.identifier !== identifier
      );
    });
    notifications.schedule = jest.fn<RestNotificationPort["schedule"]>(
      async (input) => {
        scheduled.push({
          identifier: input.identifier,
          sessionId: input.sessionId,
          restRevision: input.restRevision,
          endsAtMs: input.endsAtMs,
          channelId: REST_NOTIFICATION_CHANNEL_IDS.vibrationOnly,
        });
        return input.identifier;
      },
    );
    const preferenceStore = {
      read: jest.fn(() => ({
        soundEnabled: false,
        vibrationEnabled: true,
      })),
      write: jest.fn(),
    };
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createNotifications: () => notifications,
          restAlertPreferenceStore: preferenceStore,
        })}
        onReady={(runtime) => {
          captured = runtime;
        }}
      />,
    );
    await waitFor(() => {
      expect(captured?.launchState).toBe("trusted");
    });
    jest.mocked(notifications.listScheduled).mockClear();
    jest.mocked(notifications.cancel).mockClear();
    jest.mocked(notifications.schedule).mockClear();
    jest.mocked(notifications.ensureChannel).mockClear();

    await expect(captured!.exerciseNotificationExpiry("background"))
      .resolves.toBe("background_expiry_scheduled_once");
    expect(notifications.cancel).toHaveBeenCalledTimes(1);
    expect(notifications.cancel).toHaveBeenCalledWith(probeIdentifier);
    expect(notifications.ensureChannel).toHaveBeenCalledWith({
      soundEnabled: false,
      vibrationEnabled: true,
    });
    expect(notifications.schedule).toHaveBeenCalledWith(expect.objectContaining({
      identifier: probeIdentifier,
      sessionId: "notification-test",
      restRevision: 0,
      preferences: { soundEnabled: false, vibrationEnabled: true },
    }));
    expect(scheduled.filter(({ identifier }) => identifier === probeIdentifier))
      .toHaveLength(1);
    expect(scheduled).toContainEqual(expect.objectContaining({
      identifier: "rest:session-1",
    }));
  });

  it("forwards the committed foreground expiry identity to lifecycle reconciliation", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const restRepository = runtimeRestRepository();
    const lifecycle = runtimeLifecycle();
    jest.spyOn(restRepository, "expireRestWithForegroundFeedback").mockResolvedValueOnce({
      state: {
        version: 1,
        state: "expired",
        revision: 8,
        expiredAtMs: 120_000,
        nextSetId: "set-2",
      },
      sessionRevision: 12,
      invalidationScopes: [
        ["active-workout", "session-1"],
        ["today"],
      ],
    });
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createLifecycle: () => lifecycle,
          createRestRepository: () => restRepository,
        })}
        onReady={(runtime) => {
          captured = runtime;
        }}
      />,
    );
    await waitFor(() => {
      expect(captured?.launchState).toBe("trusted");
    });

    await act(async () => {
      await captured!.expireRest({
        sessionId: "session-1",
        expectedSessionRevision: 11,
        expectedRestRevision: 7,
        nowMs: 120_000,
      });
    });
    await waitFor(() => {
      expect(lifecycle.trigger).toHaveBeenCalledWith("post_commit", {
        foregroundExpiry: { sessionId: "session-1", restRevision: 8 },
      });
    });
  });

  it("keeps a committed result authoritative when its immediate refresh fails", async () => {
    const committed = { outcome: "committed" as const };
    const onRefreshed = jest.fn();
    const onRefreshFailed = jest.fn();

    await expect(acknowledgeCommittedRuntimeResult({
      result: committed,
      refresh: async () => {
        throw new Error("derived_refresh_failed");
      },
      onRefreshed,
      onRefreshFailed,
    })).resolves.toBe(committed);
    expect(onRefreshed).not.toHaveBeenCalled();
    expect(onRefreshFailed).toHaveBeenCalledTimes(1);

    const snapshot = { launchState: "trusted" as const };
    await expect(acknowledgeCommittedRuntimeResult({
      result: committed,
      refresh: async () => snapshot,
      onRefreshed,
      onRefreshFailed,
    })).resolves.toBe(committed);
    expect(onRefreshed).toHaveBeenCalledWith(snapshot);
  });

  it("maps mutation failures into bounded retryable and non-retryable states", () => {
    expect(mapWorkoutMutationFailure(
      new WorkoutCommandConflictError("revise_completed_set_conflict"),
    )).toEqual({
      kind: "conflict",
      code: "revise_completed_set_conflict",
      retryable: false,
      correlationCode: "GT-ACTION01",
    });
    expect(mapWorkoutMutationFailure(
      new TypeError("invalid_correction_idempotency_key"),
    )).toEqual({
      kind: "validation",
      code: "workout_mutation_invalid",
      retryable: false,
      correlationCode: "GT-ACTION01",
    });
    expect(mapWorkoutMutationFailure(
      new Error("SQLITE_CONSTRAINT params=[secret]"),
    )).toEqual({
      kind: "storage",
      code: "workout_mutation_failed",
      retryable: true,
      correlationCode: "GT-ACTION01",
    });
  });

  it("returns committed identities for insertions and forwards completed-set corrections", async () => {
    const repository = runtimeRepository([activeView], [activation]);
    const workoutRepository = runtimeActiveWorkoutRepository();
    workoutRepository.addWarmup.mockResolvedValueOnce(
      activeWorkoutViewWithCommittedSet("warmup-added", "warmup"),
    );
    workoutRepository.copyPreviousWarmup.mockResolvedValueOnce(
      activeWorkoutViewWithCommittedSet("warmup-copied", "warmup"),
    );
    workoutRepository.addWorkingSet.mockResolvedValueOnce(
      activeWorkoutViewWithCommittedSet("working-added", "working"),
    );
    workoutRepository.reviseCompletedSet.mockResolvedValueOnce(
      activeWorkoutViewWithCommittedSet("set-1", "working"),
    );
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createWorkoutRepository: () => workoutRepository,
        })}
        onReady={(runtime) => {
          captured = runtime;
        }}
      />,
    );
    await waitFor(() => {
      expect(captured?.launchState).toBe("trusted");
    });
    if (captured === undefined) {
      throw new Error("runtime_not_captured");
    }

    let warmup: Awaited<ReturnType<typeof captured.addWarmup>>;
    await act(async () => {
      warmup = await captured!.addWarmup({
      sessionId: "session-1",
      sessionExerciseId: "exercise-1",
      setId: "warmup-added",
      observation: {
        version: 1,
        profile: "load_reps",
        loadGrams: 20_000,
        reps: 5,
        source: "manual",
      },
      nowMs: 2_000,
      });
    });
    let copied: Awaited<ReturnType<typeof captured.copyPreviousWarmup>>;
    await act(async () => {
      copied = await captured!.copyPreviousWarmup({
      sessionId: "session-1",
      sourceSetId: "warmup-added",
      setId: "warmup-copied",
      nowMs: 2_001,
      });
    });
    let working: Awaited<ReturnType<typeof captured.addWorkingSet>>;
    await act(async () => {
      working = await captured!.addWorkingSet({
      sessionId: "session-1",
      sessionExerciseId: "exercise-1",
      sourceSetId: "set-1",
      setId: "working-added",
      nowMs: 2_002,
      });
    });
    let corrected: Awaited<ReturnType<typeof captured.reviseCompletedSet>>;
    await act(async () => {
      corrected = await captured!.reviseCompletedSet({
      sessionId: "session-1",
      setId: "set-1",
      expectedSessionRevision: 1,
      expectedSetRevision: 1,
      correctionIdempotencyKey: "runtime-correction",
      metricIdentity: activeWorkoutView.currentExercise.metricIdentity,
      observation: {
        version: 1,
        profile: "load_reps",
        loadGrams: 62_500,
        reps: 7,
        source: "manual",
      },
      revisedAtMs: 2_003,
      });
    });

    expect(warmup!.committedSetId).toBe("warmup-added");
    expect(copied!.committedSetId).toBe("warmup-copied");
    expect(working!.committedSetId).toBe("working-added");
    expect(corrected!.committedSetId).toBe("set-1");
    expect(working!.currentExercise.workingSets.map(({ id }) => id))
      .toContain("working-added");
    expect(workoutRepository.reviseCompletedSet).toHaveBeenCalledWith({
      sessionId: "session-1",
      setId: "set-1",
      expectedSessionRevision: 1,
      expectedSetRevision: 1,
      correctionIdempotencyKey: "runtime-correction",
      metricIdentity: activeWorkoutView.currentExercise.metricIdentity,
      observation: {
        version: 1,
        profile: "load_reps",
        loadGrams: 62_500,
        reps: 7,
        source: "manual",
      },
      revisedAtMs: 2_003,
    });
  });

  it("propagates typed mutation rejection without refreshing before commit", async () => {
    const repository = runtimeRepository([activeView], [activation]);
    const workoutRepository = runtimeActiveWorkoutRepository();
    const conflict = new WorkoutCommandConflictError("add_warmup_conflict");
    workoutRepository.addWarmup.mockRejectedValueOnce(conflict);
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createWorkoutRepository: () => workoutRepository,
        })}
        onReady={(runtime) => {
          captured = runtime;
        }}
      />,
    );
    await waitFor(() => {
      expect(captured?.launchState).toBe("trusted");
    });
    if (captured === undefined) {
      throw new Error("runtime_not_captured");
    }

    let rejected: unknown;
    await act(async () => {
      try {
        await captured!.addWarmup({
          sessionId: "session-1",
          sessionExerciseId: "exercise-1",
          setId: "warmup-rejected",
          observation: {
            version: 1,
            profile: "load_reps",
            loadGrams: 20_000,
            reps: 5,
            source: "manual",
          },
          nowMs: 2_000,
        });
      } catch (error) {
        rejected = error;
      }
    });
    expect(rejected).toBe(conflict);
    expect(captured.mutationFailure).toEqual({
      kind: "conflict",
      code: "add_warmup_conflict",
      retryable: false,
      correlationCode: "GT-ACTION01",
    });
    expect(repository.getTodayView).toHaveBeenCalledTimes(1);

    workoutRepository.addWarmup.mockResolvedValueOnce(
      activeWorkoutViewWithCommittedSet("warmup-committed", "warmup"),
    );
    let committed: Awaited<ReturnType<typeof captured.addWarmup>>;
    await act(async () => {
      committed = await captured!.addWarmup({
        sessionId: "session-1",
        sessionExerciseId: "exercise-1",
        setId: "warmup-committed",
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 20_000,
          reps: 5,
          source: "manual",
        },
        nowMs: 2_001,
      });
    });
    expect(committed!).toMatchObject({ committedSetId: "warmup-committed" });
    await waitFor(() => {
      expect(repository.getTodayView).toHaveBeenCalledTimes(2);
    });
  });

  it("builds Today activation from the accepted Full Body starter", async () => {
    const prettyBytes = (value: unknown) => `${JSON.stringify(value, null, 2)}
`;
    const catalog = await createStarterPlanRuntimeCatalog({
      starterPackBytes: prettyBytes(starterPlansAsset),
      acceptanceBytes: prettyBytes(starterPlansAcceptanceAsset),
      sha256: async (value) => createHash("sha256").update(value).digest("hex"),
    });
    const activate = jest.fn(async () => ({} as never));
    const kernel = {} as SqliteKernel;

    await activateInitialAcceptedStarter({
      kernel,
      catalog,
      startLocalDate: "2026-08-19",
      timeZone: "Asia/Singapore",
      activatedAtMs: 1_787_082_000_000,
    }, activate);

    expect(activate).toHaveBeenCalledWith(expect.objectContaining({
      kind: "accepted",
      repository: expect.objectContaining({
        activateAcceptedStarterPlan: expect.any(Function),
      }),
      requestId:
        "starter-today:full-body-foundation:1787082000000",
      activatedAtMs: 1_787_082_000_000,
      expectedActiveScheduleRevision: null,
      templateId: "full-body-foundation",
      templateRevision: 2,
      copyChoice: null,
      startLocalDate: "2026-08-19",
      timeZone: "Asia/Singapore",
      mode: "weekday",
      bindings: expect.arrayContaining([
        expect.objectContaining({
          planDaySourceId: "full-body-a",
          weekday: "Monday",
        }),
      ]),
      confirmationToken: expect.stringMatching(/^starter-confirmation:v1:/u),
    }));
    await expect(activateInitialAcceptedStarter({
      kernel,
      catalog: { ...catalog, templates: [] },
      startLocalDate: "2026-08-19",
      timeZone: "Asia/Singapore",
      activatedAtMs: 1_787_082_000_000,
    }, activate)).rejects.toThrow("starter_template_not_found");
  });

  it("binds production adapters to the stable database name", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const kernel = {
      close: jest.fn(async () => undefined),
    } as unknown as SqliteKernel;
    const openKernel = jest.fn(async () => kernel);
    const runMigrations = jest.fn(async () => undefined);
    const activateInitialStarter = jest.fn(async () => undefined);
    const createRepository = jest.fn(() => repository);
    const createNotifications = jest.fn(() => runtimeNotifications());
    const createLifecycle = jest.fn(() => runtimeLifecycle());
    const createRest = jest.fn(() => runtimeRestRepository());
    const createOutcome = jest.fn(() => runtimeOutcomeRepository());
    const createActiveRepository = jest.fn(() =>
      runtimeActiveWorkoutRepository(),
    );
    const now = jest.fn(() => new Date("2026-08-16T08:00:00+08:00"));
    const nowMs = jest.fn(() => 1_786_767_200_000);
    const bound = createWorkoutAppRuntimeDependencies({
      openKernel,
      runMigrations,
      activateInitialStarter,
      createRepository,
      createNotifications,
      createLifecycle,
      createRestRepository: createRest,
      createOutcomeRepository: createOutcome,
      createWorkoutRepository: createActiveRepository,
      now,
      nowMs,
    });

    await expect(bound.openKernel()).resolves.toBe(kernel);
    await bound.migrate(kernel);
    await bound.activateInitialStarter({
      kernel,
      catalog: {} as never,
      startLocalDate: "2026-08-16",
      timeZone: "Asia/Singapore",
      activatedAtMs: 1_786_767_200_000,
    });
    expect(bound.createRepository(kernel)).toBe(repository);
    expect(bound.createNotifications()).toEqual(expect.objectContaining({
      permission: expect.any(Function),
    }));
    expect(bound.createLifecycle({
      kernel,
      restRepository: runtimeRestRepository(),
      notifications: runtimeNotifications(),
      nowMs,
    })).toEqual(expect.objectContaining({
      trigger: expect.any(Function),
    }));
    expect(bound.createRestRepository(kernel)).toEqual(
      expect.objectContaining({
        getRestState: expect.any(Function),
      }),
    );
    expect(bound.createOutcomeRepository(kernel)).toEqual(
      expect.objectContaining({
        getSessionDetail: expect.any(Function),
      }),
    );
    expect(bound.createWorkoutRepository(kernel)).toEqual(
      expect.objectContaining({
        getActiveWorkout: expect.any(Function),
      }),
    );
    expect(bound.now().getDay()).toBe(0);
    expect(bound.nowMs()).toBe(1_786_767_200_000);
    expect(openKernel).toHaveBeenCalledWith("gym-tracker.db");
    expect(runMigrations).toHaveBeenCalledWith({
      databaseName: "gym-tracker.db",
      kernel,
    });
    expect(activateInitialStarter).toHaveBeenCalledWith({
      kernel,
      catalog: {},
      startLocalDate: "2026-08-16",
      timeZone: "Asia/Singapore",
      activatedAtMs: 1_786_767_200_000,
    });
    expect(createRepository).toHaveBeenCalledWith(kernel);
    expect(createNotifications).toHaveBeenCalledTimes(1);
    expect(createLifecycle).toHaveBeenCalledTimes(1);
    expect(createRest).toHaveBeenCalledWith(kernel);
    expect(createOutcome).toHaveBeenCalledWith(kernel);
    expect(createActiveRepository).toHaveBeenCalledWith(kernel);
  });

  it("executes the production migration and clock adapters against a fake kernel", async () => {
    const execute = jest.fn(async () => ({
      changes: 0,
      lastInsertRowId: 0,
    }));
    const queryAllMock = jest.fn(async (sql: string) => {
      if (sql === "PRAGMA user_version") {
        return [{ user_version: 10 }];
      }
      if (sql.includes("foreground_rest_feedback_consumptions")) {
        return [{ name: "foreground_rest_feedback_consumptions" }];
      }
      if (sql.includes("foreground_rest_feedback_attempts")) {
        return [{ name: "foreground_rest_feedback_attempts" }];
      }
      if (sql.includes("progression_recommendations_actionable_evidence")) {
        return [
          { name: "progression_recommendations_actionable_evidence_insert" },
          { name: "progression_recommendations_actionable_evidence_update" },
          { name: "owned_progression_recommendations_actionable_evidence_insert" },
          { name: "owned_progression_recommendations_actionable_evidence_update" },
        ];
      }
      if (sql === "PRAGMA table_info(portability_restore_state)") {
        return [
          { name: "id", type: "INTEGER", notnull: 1, pk: 1 },
          { name: "state", type: "TEXT", notnull: 1, pk: 0 },
          { name: "updated_at_ms", type: "INTEGER", notnull: 1, pk: 0 },
        ];
      }
      if (sql === "SELECT id, state, updated_at_ms FROM portability_restore_state") {
        return [{ id: 1, state: "ready", updated_at_ms: 0 }];
      }
      if (sql.includes("FROM sqlite_master WHERE name LIKE 'history_%'")) {
        return [
          { type: "table", name: "history_audit_events" },
          { type: "table", name: "history_projection_freshness" },
          { type: "table", name: "history_rebuild_effects" },
          { type: "table", name: "history_session_overlays" },
          { type: "table", name: "history_subject_revisions" },
          { type: "trigger", name: "history_audit_events_immutable_delete" },
          { type: "trigger", name: "history_audit_events_immutable_update" },
          { type: "index", name: "history_audit_events_by_session" },
          { type: "index", name: "history_overlays_by_date" },
          { type: "index", name: "history_rebuild_effects_eligible" },
        ];
      }
      if (sql.includes("FROM sqlite_master")
        && sql.includes("history_projection_%")) {
        return [
          { type: "table", name: "history_projection_record_candidates" },
          { type: "table", name: "history_projection_comparable_exposures" },
          { type: "table", name: "history_projection_metric_aggregates" },
          { type: "table", name: "history_projection_period_inputs" },
          { type: "table", name: "history_projection_recommendation_scopes" },
          { type: "index", name: "history_projection_records_by_metric" },
          { type: "index", name: "history_projection_exposures_by_metric" },
          { type: "index", name: "history_projection_period_inputs_by_date" },
        ];
      }
      if (sql === "PRAGMA table_info(workout_sessions)") {
        return [{ name: "creation_timezone_offset_minutes" }];
      }
      if (sql.includes("creation_timezone_offset_minutes IS NULL")) {
        return [];
      }
      if (sql === "PRAGMA index_list(session_exercises)") {
        return [{ name: "exercise_history" }];
      }
      if (sql === "PRAGMA foreign_key_check") {
        return [];
      }
      if (sql === "PRAGMA integrity_check") {
        return [{ integrity_check: "ok" }];
      }
      return [];
    });
    const transaction: SqliteTransactionExecutor = {
      execute,
      async queryAll<Row extends Record<string, unknown>>(sql: string) {
        return await queryAllMock(sql) as unknown as Row[];
      },
    };
    const kernel = {
      write: jest.fn(async (command: (
        transaction: SqliteTransactionExecutor,
      ) => Promise<unknown>) => command(transaction)),
      async queryAll<Row extends Record<string, unknown>>(sql: string) {
        return await queryAllMock(sql) as unknown as Row[];
      },
      close: jest.fn(async () => undefined),
    } as unknown as SqliteKernel;

    await expect(
      productionWorkoutAppRuntimeDependencies.migrate(kernel),
    ).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE pending_effects"),
      expect.any(Array),
    );
    expect(execute).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE session_rest_states"),
      expect.any(Array),
    );
    expect(productionWorkoutAppRuntimeDependencies.now()).toBeInstanceOf(Date);
    expect(productionWorkoutAppRuntimeDependencies.nowMs()).toEqual(
      expect.any(Number),
    );
  });

  it("maps Sunday to weekday seven and tolerates close failures", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const getTodayView = jest.spyOn(repository, "getTodayView");
    const close = jest.fn(async () => {
      throw new Error("close_failed");
    });
    const runtimeDependencies = dependencies(repository, {
      openKernel: jest.fn(async () => ({
        close,
      } as unknown as SqliteKernel)),
      now: () => new Date("2026-08-16T08:00:00+08:00"),
    });
    const result = await render(
      <RuntimeHarness dependencies={runtimeDependencies} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-state")).toHaveTextContent("trusted");
    });
    expect(getTodayView).toHaveBeenCalledWith({
      localDate: "2026-08-16",
      weekday: 7,
    });
    await result.unmount();
    await waitFor(() => {
      expect(close).toHaveBeenCalled();
    });
  });

  it("enables trusted state only after migration and the first Today read", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const runtimeDependencies = dependencies(repository);

    await render(
      <RuntimeHarness dependencies={runtimeDependencies} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("runtime-state")).toHaveTextContent("trusted");
    });
    expect(screen.getByTestId("runtime-view")).toHaveTextContent(
      "no_active_plan",
    );
    expect(runtimeDependencies.openKernel).toHaveBeenCalledTimes(1);
    expect(runtimeDependencies.migrate).toHaveBeenCalledTimes(1);
  });

  it("runs one launch lifecycle, subscribes foreground, and cleans up", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const lifecycle = runtimeLifecycle();
    const unsubscribe = jest.fn<() => undefined>(() => undefined);
    lifecycle.subscribeForeground.mockReturnValueOnce(unsubscribe);
    const createLifecycle = jest.fn(() => lifecycle);
    const result = await render(
      <RuntimeHarness
        dependencies={dependencies(repository, { createLifecycle })}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-state")).toHaveTextContent("trusted");
    });
    expect(lifecycle.trigger).toHaveBeenCalledWith("launch");
    expect(lifecycle.subscribeForeground).toHaveBeenCalledTimes(1);

    await result.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("requests notification permission explicitly and refreshes runtime readiness", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    let permission: "undetermined" | "granted" = "undetermined";
    const notifications = runtimeNotifications("undetermined");
    notifications.permission = jest.fn(async () => permission);
    notifications.requestPermission = jest.fn(async () => {
      permission = "granted";
      return permission;
    });
    await render(
      <RuntimeHarness
        dependencies={dependencies(repository, {
          createNotifications: () => notifications,
        })}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-notification-permission"))
        .toHaveTextContent("undetermined");
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Request runtime notifications" }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("runtime-notification-permission"))
        .toHaveTextContent("granted");
    });
    expect(notifications.requestPermission).toHaveBeenCalledTimes(1);
  });

  it("returns an explicit bounded failure with readback after a no-op preference write", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const lifecycle = runtimeLifecycle();
    const preferenceStore = {
      read: jest.fn(() => ({ soundEnabled: true, vibrationEnabled: true })),
      write: jest.fn(),
    };
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createLifecycle: () => lifecycle,
          restAlertPreferenceStore: preferenceStore,
        })}
        onReady={(runtime) => {
          captured = runtime;
        }}
      />,
    );
    await waitFor(() => {
      expect(captured?.launchState).toBe("trusted");
    });

    if (captured === undefined) {
      throw new Error("runtime_not_ready");
    }
    const runtime = captured;
    let result: Awaited<ReturnType<typeof runtime.setRestAlertPreferences>>;
    await act(async () => {
      result = await runtime.setRestAlertPreferences({
        soundEnabled: false,
        vibrationEnabled: true,
      });
    });
    expect(result!).toEqual({
      status: "not_persisted",
      preferences: { soundEnabled: true, vibrationEnabled: true },
    });

    expect(preferenceStore.write).toHaveBeenCalledWith({
      soundEnabled: false,
      vibrationEnabled: true,
    });
    expect(preferenceStore.read).toHaveBeenCalled();
    expect(lifecycle.trigger).not.toHaveBeenCalledWith("post_commit");
  });

  it("returns an explicit bounded failure with readback after a rejected preference write", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const preferenceStore = {
      read: jest.fn(() => ({ soundEnabled: true, vibrationEnabled: false })),
      write: jest.fn(() => {
        throw new Error("preference_write_failed");
      }),
    };
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, { restAlertPreferenceStore: preferenceStore })}
        onReady={(runtime) => {
          captured = runtime;
        }}
      />,
    );
    await waitFor(() => {
      expect(captured?.launchState).toBe("trusted");
    });

    if (captured === undefined) {
      throw new Error("runtime_not_ready");
    }
    const runtime = captured;
    let result: Awaited<ReturnType<typeof runtime.setRestAlertPreferences>>;
    await act(async () => {
      result = await runtime.setRestAlertPreferences({
        soundEnabled: false,
        vibrationEnabled: false,
      });
    });
    expect(result!).toEqual({
      status: "failed",
      preferences: { soundEnabled: true, vibrationEnabled: false },
    });
  });

  it("maps open, migration, and first-query failures to safe launch states", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    for (const [label, runtimeDependencies, code] of [
      [
        "open",
        dependencies(repository, {
          openKernel: jest.fn(async () => {
            throw new Error("secret_open_detail");
          }),
        }),
        "GT-WRITER01",
      ],
      [
        "migration",
        dependencies(repository, {
          migrate: jest.fn(async () => {
            throw new Error("secret_migration_detail");
          }),
        }),
        "GT-MIGRATE1",
      ],
      [
        "query",
        dependencies(runtimeRepository([], [])),
        "GT-QUERY001",
      ],
    ] as const) {
      const result = await render(
        <RuntimeHarness dependencies={runtimeDependencies} />,
      );
      await waitFor(() => {
        expect(screen.getByTestId("runtime-state")).toHaveTextContent("failed");
      });
      expect(screen.getByTestId("runtime-failure")).toHaveTextContent(code);
      expect(JSON.stringify(result.toJSON())).not.toContain(`secret_${label}`);
      await result.unmount();
    }
  });

  it("retries with a fresh kernel after a launch failure", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    let attempts = 0;
    const runtimeDependencies = dependencies(repository, {
      openKernel: jest.fn(async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("first_open_failed");
        }
        return {
          close: jest.fn(async () => undefined),
        } as unknown as SqliteKernel;
      }),
    });

    await render(
      <RuntimeHarness dependencies={runtimeDependencies} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-state")).toHaveTextContent("failed");
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Retry runtime" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-state")).toHaveTextContent("trusted");
    });
    expect(runtimeDependencies.openKernel).toHaveBeenCalledTimes(2);
  });

  it("closes stale open, migration, and query generations after retry", async () => {
    for (const stage of ["open", "migration", "query"] as const) {
      const repository = runtimeRepository(
        [noPlanView, noPlanView],
        [null, null],
      );
      const firstClose = jest.fn(async () => {
        throw new Error("stale_close_failed");
      });
      const secondClose = jest.fn(async () => undefined);
      const firstKernel = { close: firstClose } as unknown as SqliteKernel;
      const secondKernel = { close: secondClose } as unknown as SqliteKernel;
      let resolveOpen: ((kernel: SqliteKernel) => void) | undefined;
      let resolveMigration: (() => void) | undefined;
      let resolveQuery: ((view: TodayView) => void) | undefined;
      let opens = 0;
      const runtimeDependencies = dependencies(repository, {
        openKernel: jest.fn(async () => {
          opens += 1;
          if (opens === 1 && stage === "open") {
            return new Promise<SqliteKernel>((resolve) => {
              resolveOpen = resolve;
            });
          }
          return opens === 1 ? firstKernel : secondKernel;
        }),
        migrate: jest.fn(async (kernel) => {
          if (kernel === firstKernel && stage === "migration") {
            await new Promise<void>((resolve) => {
              resolveMigration = resolve;
            });
          }
        }),
      });
      if (stage === "query") {
        let reads = 0;
        repository.getTodayView = jest.fn(async () => {
          reads += 1;
          if (reads === 1) {
            return new Promise<TodayView>((resolve) => {
              resolveQuery = resolve;
            });
          }
          return noPlanView;
        });
      }

      const result = await render(
        <RuntimeHarness dependencies={runtimeDependencies} />,
      );
      if (stage !== "open") {
        await waitFor(() => {
          expect(runtimeDependencies.openKernel).toHaveBeenCalledTimes(1);
        });
      }
      await fireEvent.press(
        screen.getByRole("button", { name: "Retry runtime" }),
      );
      if (stage === "open") {
        resolveOpen?.(firstKernel);
      } else if (stage === "migration") {
        resolveMigration?.();
      } else {
        resolveQuery?.(noPlanView);
      }
      await waitFor(() => {
        expect(screen.getByTestId("runtime-state")).toHaveTextContent("trusted");
      });
      await waitFor(() => {
        expect(firstClose).toHaveBeenCalled();
      });
      expect(screen.getByTestId("runtime-view")).toHaveTextContent(
        "no_active_plan",
      );
      await result.unmount();
    }
  });

  it("ignores stale open, migration, and query failures after retry", async () => {
    for (const stage of ["open", "migration", "query"] as const) {
      const repository = runtimeRepository(
        [noPlanView, noPlanView],
        [null, null],
      );
      let rejectOpen: ((error: Error) => void) | undefined;
      let rejectMigration: ((error: Error) => void) | undefined;
      let rejectQuery: ((error: Error) => void) | undefined;
      let opens = 0;
      const firstKernel = {
        close: jest.fn(async () => undefined),
      } as unknown as SqliteKernel;
      const secondKernel = {
        close: jest.fn(async () => undefined),
      } as unknown as SqliteKernel;
      const runtimeDependencies = dependencies(repository, {
        openKernel: jest.fn(async () => {
          opens += 1;
          if (opens === 1 && stage === "open") {
            return new Promise<SqliteKernel>((_resolve, reject) => {
              rejectOpen = reject;
            });
          }
          return opens === 1 ? firstKernel : secondKernel;
        }),
        migrate: jest.fn(async (kernel) => {
          if (kernel === firstKernel && stage === "migration") {
            await new Promise<void>((_resolve, reject) => {
              rejectMigration = reject;
            });
          }
        }),
      });
      if (stage === "query") {
        let reads = 0;
        repository.getTodayView = jest.fn(async () => {
          reads += 1;
          if (reads === 1) {
            return new Promise<TodayView>((_resolve, reject) => {
              rejectQuery = reject;
            });
          }
          return noPlanView;
        });
      }

      const result = await render(
        <RuntimeHarness dependencies={runtimeDependencies} />,
      );
      if (stage !== "open") {
        await waitFor(() => {
          expect(runtimeDependencies.openKernel).toHaveBeenCalledTimes(1);
        });
      }
      await fireEvent.press(
        screen.getByRole("button", { name: "Retry runtime" }),
      );
      if (stage === "open") {
        rejectOpen?.(new Error("stale_open_failed"));
      } else if (stage === "migration") {
        rejectMigration?.(new Error("stale_migration_failed"));
      } else {
        rejectQuery?.(new Error("stale_query_failed"));
      }
      await waitFor(() => {
        expect(screen.getByTestId("runtime-state")).toHaveTextContent("trusted");
      });
      expect(screen.getByTestId("runtime-failure")).toHaveTextContent("none");
      await result.unmount();
    }
  });

  it("refreshes authoritative Today state after activation and both start modes", async () => {
    const repository = runtimeRepository(
      [noPlanView, scheduledView, activeView, activeView],
      [null, activation, activation, activation],
    );
    const activateInitialStarter = jest.fn(async () => undefined);
    const runtimeDependencies = dependencies(repository, {
      loadStarterPlans: jest.fn(async () => ({}) as never),
      activateInitialStarter,
    });

    await render(
      <RuntimeHarness dependencies={runtimeDependencies} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-view")).toHaveTextContent(
        "no_active_plan",
      );
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Activate runtime plan" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-view")).toHaveTextContent("scheduled");
    });
    expect(screen.getByTestId("runtime-days")).toHaveTextContent("2");
    expect(activateInitialStarter).toHaveBeenCalledWith(expect.objectContaining({
      startLocalDate: "2026-08-17",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      activatedAtMs: 1_786_853_600_000,
    }));
    expect(repository.activateStarterPlan).not.toHaveBeenCalled();

    await fireEvent.press(
      screen.getByRole("button", { name: "Start runtime day" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-view")).toHaveTextContent(
        "active_workout",
      );
    });
    expect(repository.startWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "scheduled", planDayId: "day-a" }),
    );
  });

  it("starts an empty workout through the same authoritative refresh path", async () => {
    const repository = runtimeRepository(
      [noPlanView, activeView],
      [null, null],
    );
    await render(
      <RuntimeHarness dependencies={dependencies(repository)} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-view")).toHaveTextContent(
        "no_active_plan",
      );
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Start runtime empty" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-view")).toHaveTextContent(
        "active_workout",
      );
    });
    expect(repository.startWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "empty" }),
    );
  });

  it("composes every active-workout command through the injected repository", async () => {
    const repository = runtimeRepository(
      [
        activeView,
        activeView,
        activeView,
        activeView,
        activeView,
        activeView,
        activeView,
        activeView,
      ],
      [
        activation,
        activation,
        activation,
        activation,
        activation,
        activation,
        activation,
        activation,
      ],
    );
    const workoutRepository = runtimeActiveWorkoutRepository();
    const runtimeDependencies = dependencies(repository, {
      createWorkoutRepository: () => workoutRepository,
    });
    await render(
      <RuntimeHarness dependencies={runtimeDependencies} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-state")).toHaveTextContent("trusted");
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Run runtime workout commands" }),
    );

    await waitFor(() => {
      expect(workoutRepository.getWorkoutSession).toHaveBeenCalledWith(
        "session-1",
      );
      expect(workoutRepository.updateActiveSetDraft).toHaveBeenCalledTimes(1);
      expect(workoutRepository.updateWarmupDraft).toHaveBeenCalledTimes(1);
      expect(workoutRepository.addWarmup).toHaveBeenCalledTimes(1);
      expect(workoutRepository.addWorkingSet).toHaveBeenCalledTimes(1);
      expect(workoutRepository.copyPreviousWarmup).toHaveBeenCalledTimes(1);
      expect(workoutRepository.reviseCompletedSet).toHaveBeenCalledTimes(1);
      expect(workoutRepository.completeWarmup).toHaveBeenCalledTimes(1);
      expect(workoutRepository.skipWarmup).toHaveBeenCalledTimes(1);
      expect(workoutRepository.skipWorkingSet).toHaveBeenCalledTimes(1);
      expect(workoutRepository.completeSet).toHaveBeenCalledTimes(1);
      expect(workoutRepository.undoCompletedSet).toHaveBeenCalledTimes(1);
    });
  });

  it("returns committed workout source state when a secondary Today refresh fails", async () => {
    const repository = runtimeRepository([activeView], [activation]);
    let reads = 0;
    repository.getTodayView = jest.fn(async () => {
      reads += 1;
      if (reads > 1) {
        throw new Error("secondary_refresh_failed");
      }
      return activeView;
    });
    const workoutRepository = runtimeActiveWorkoutRepository();
    const runtimeDependencies = dependencies(repository, {
      createWorkoutRepository: () => workoutRepository,
    });
    await render(
      <RuntimeHarness dependencies={runtimeDependencies} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-state")).toHaveTextContent("trusted");
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Run runtime workout commands" }),
    );

    await waitFor(() => {
      expect(workoutRepository.updateActiveSetDraft).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("runtime-action-failure"))
        .toHaveTextContent("GT-ACTION01");
    });
  });

  it("composes every outcome and recommendation command through one repository", async () => {
    const repository = runtimeRepository(
      Array.from({ length: 12 }, () => activeView),
      Array.from({ length: 12 }, () => activation),
    );
    const outcomeRepository = runtimeOutcomeRepository();
    await render(
      <RuntimeHarness dependencies={dependencies(repository, {
        createOutcomeRepository: () => outcomeRepository,
      })} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-state")).toHaveTextContent("trusted");
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Run runtime outcome commands" }),
    );

    await waitFor(() => {
      expect(outcomeRepository.getSessionDetail).toHaveBeenCalledTimes(1);
      expect(outcomeRepository.finishCompleted).toHaveBeenCalledTimes(1);
      expect(outcomeRepository.finishPartial).toHaveBeenCalledTimes(1);
      expect(outcomeRepository.saveZeroSetWorkout).toHaveBeenCalledTimes(1);
      expect(outcomeRepository.discardWorkout).toHaveBeenCalledTimes(1);
      expect(outcomeRepository.skipExercise).toHaveBeenCalledTimes(1);
      expect(outcomeRepository.resumePartialWorkout).toHaveBeenCalledTimes(1);
      expect(outcomeRepository.recordExerciseEffort).toHaveBeenCalledTimes(1);
      expect(outcomeRepository.acceptRecommendation).toHaveBeenCalledTimes(1);
      expect(outcomeRepository.keepCurrentTarget).toHaveBeenCalledTimes(1);
    });
  });

  it("composes custom create, edit, archive preview, and migration capabilities", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    await render(
      <RuntimeHarness dependencies={dependencies(repository)} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-state")).toHaveTextContent("trusted");
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Run runtime custom exercise commands",
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId("runtime-state")).toHaveTextContent("trusted");
  });

  it("forwards every schedule capability through the injected runtime port", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const schedule = runtimeScheduleAdapter();
    await render(
      <RuntimeHarness dependencies={dependencies(repository, {
        createScheduleRuntime: () => schedule,
      })} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-state")).toHaveTextContent("trusted");
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Run runtime schedule commands",
    }));

    await waitFor(() => {
      expect(schedule.loadSchedule).toHaveBeenCalledWith("plan-copy");
      expect(schedule.actOnToday).toHaveBeenCalledWith("repeat");
      expect(schedule.chooseTimeZone).toHaveBeenCalledWith(
        "Keep current timezone",
        "America/New_York",
      );
      expect(schedule.completeScheduledSession).toHaveBeenCalledWith(
        "session-1",
      );
      expect(schedule.consumeDateOverride).toHaveBeenCalledWith("2026-08-17");
      expect(schedule.markWeekdayMissed).toHaveBeenCalledWith("2026-08-16");
      expect(schedule.recordTrainAnyway).toHaveBeenCalledTimes(1);
      expect(schedule.saveSchedule).toHaveBeenCalledTimes(1);
      expect(schedule.setDateOverride).toHaveBeenCalledTimes(1);
    });
  });

  it("preserves trusted facts and exposes a safe action failure", async () => {
    const repository = runtimeRepository(
      [noPlanView, noPlanView, noPlanView, noPlanView],
      [null, null, null, null],
    );
    const activateInitialStarter = jest.fn(async () => {
      throw new Error("secret_activation_failure");
    });
    repository.startWorkout
      .mockRejectedValueOnce(new Error("secret_planned_failure"))
      .mockRejectedValueOnce(new Error("secret_empty_failure"));
    const result = await render(
      <RuntimeHarness dependencies={dependencies(repository, {
        loadStarterPlans: jest.fn(async () => ({}) as never),
        activateInitialStarter,
      })} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-view")).toHaveTextContent(
        "no_active_plan",
      );
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Activate runtime plan" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-action-failure"))
        .toHaveTextContent("GT-ACTION01");
    });
    expect(screen.getByTestId("runtime-view")).toHaveTextContent(
      "no_active_plan",
    );
    expect(repository.activateStarterPlan).not.toHaveBeenCalled();

    await fireEvent.press(
      screen.getByRole("button", { name: "Start runtime day" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Start runtime empty" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-action-failure"))
        .toHaveTextContent("GT-ACTION01");
    });
    expect(JSON.stringify(result.toJSON())).not.toMatch(/secret_/u);
  });

  it("fails planned start safely when the active copy disappears", async () => {
    const repository = runtimeRepository(
      [scheduledView],
      [activation, null],
    );
    await render(
      <RuntimeHarness dependencies={dependencies(repository)} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-view")).toHaveTextContent("scheduled");
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Start runtime day" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-action-failure"))
        .toHaveTextContent("GT-ACTION01");
    });
    expect(repository.startWorkout).not.toHaveBeenCalled();
  });

  it("marks refresh failure safely and rejects commands before trusted launch", async () => {
    let resolveOpen: ((kernel: SqliteKernel) => void) | undefined;
    const kernel = {
      close: jest.fn(async () => undefined),
    } as unknown as SqliteKernel;
    const repository = runtimeRepository([noPlanView], [null]);
    const runtimeDependencies = dependencies(repository, {
      openKernel: jest.fn(() => new Promise<SqliteKernel>((resolve) => {
        resolveOpen = resolve;
      })),
    });

    await render(<RuntimeHarness dependencies={runtimeDependencies} />);
    expect(screen.getByTestId("runtime-state")).toHaveTextContent("booting");
    await fireEvent.press(
      screen.getByRole("button", { name: "Start runtime empty" }),
    );
    expect(repository.startWorkout).not.toHaveBeenCalled();

    resolveOpen?.(kernel);
    await waitFor(() => {
      expect(screen.getByTestId("runtime-state")).toHaveTextContent("trusted");
    });
    repository.getTodayView = jest.fn(async () => {
      throw new Error("secret_refresh_failure");
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Refresh runtime" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-action-failure"))
        .toHaveTextContent("GT-ACTION01");
    });
  });

  it("rejects use outside its provider", async () => {
    function OutsideProbe() {
      useWorkoutAppRuntime();
      return null;
    }
    await expect(render(<OutsideProbe />)).rejects.toThrow(
      "useWorkoutAppRuntime must be used within WorkoutAppRuntimeProvider",
    );
  });
});
