import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createHash } from "node:crypto";
import React from "react";
import {
  AppState,
  Text,
  type AppStateStatus,
} from "react-native";

let mockNativeContractsEnabled = true;
const mockCommittedHaptic = jest.fn(async () => undefined);
const mockCueHaptic = jest.fn(async () => undefined);

import starterPlansAsset from "../../assets/content/starter-plans.v2.json";
import starterPlansAcceptanceAsset from "../../artifacts/review/phase2/starter-plans-acceptance.json";
import type {
  PlansRepository,
  SessionExerciseEditsForPlanPreview,
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
  AdvancedTimingCommandResult,
  AdvancedTimingRepository,
  AdvancedTimingStateV1,
} from "../domains/advancedTiming";
import type {
  RunningActivityMatchCandidate,
} from "../domains/running/activityMatchCommands";
import type {
  AdvancedTimingRepositoryPort,
} from "../platform/sqlite/repositories/advancedTimingRepository";
import type {
  ProgressionRepository,
} from "../domains/progression";
import type { ProgressRecommendationReview } from "../domains/progress";
import type { BodyweightEntryState } from "../domains/bodyweight/contracts";
import type {
  ActiveWorkoutRepository,
  ActiveWorkoutView,
  SessionDetail,
  StartedWorkout,
  PlannedStrengthOccurrenceDetail,
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
  projectAutomaticBackupPresentation,
} from "../domains/backup/automaticBackupPresentation";
import type {
  AutomaticBackupRuntime,
} from "./automaticBackupRuntime";
import {
  PrimaryAction,
} from "../ui/components";
import {
  WORKOUT_REMOVE_RECEIPT_SCHEMA_STATEMENTS,
} from "../platform/sqlite/migrations/0017_workout_remove_receipts";
import {
  WORKOUT_REMOVE_RECEIPT_ENTITY_ID_SCHEMA_STATEMENTS,
} from "../platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids";
import {
  SESSION_EXERCISE_EDITING_SCHEMA_STATEMENTS,
} from "../platform/sqlite/migrations/0019_session_exercise_editing";
import {
  SESSION_EXERCISE_EDIT_RECEIPT_SCHEMA_STATEMENTS,
  SESSION_EXERCISE_REORDER_RECEIPT_SCHEMA_STATEMENTS,
} from "../platform/sqlite/migrations/0020_session_exercise_edit_receipts";
import {
  PORTABLE_OWNER_IDENTITIES_TRIGGER_STATEMENTS,
} from "../platform/sqlite/migrations/0022_portable_owner_identities";
import {
  AUTOMATIC_BACKUP_GENERATION_TRIGGER_STATEMENTS,
} from "../platform/sqlite/migrations/0023_automatic_drive_backup";
import {
  CURRENT_SCHEMA_VERSION,
} from "../platform/sqlite/migrations";
import {
  AppearanceProvider,
} from "../ui/theme";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (_algorithm: string, value: string) =>
    require("node:crypto").createHash("sha256").update(value).digest("hex"),
  randomUUID: () => "00000000-0000-4000-8000-000000000000",
}));

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
jest.mock("../platform/sqlite/recoveryBackup", () => ({
  createExpoRecoveryBackupPort: jest.fn(() => ({
    createAndValidate: jest.fn(async (request: Readonly<{
      databaseName: string;
      fromVersion: number;
      toVersion: number;
    }>) => ({
      backupId: "runtime-test-recovery",
      databaseName: request.databaseName,
      fromVersion: request.fromVersion,
      toVersion: request.toVersion,
      validated: true,
    })),
  })),
}));
jest.mock("expo-sqlite", () => ({
  backupDatabaseAsync: jest.fn(async () => undefined),
  deleteDatabaseAsync: jest.fn(async () => undefined),
  openDatabaseAsync: jest.fn(),
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        get nativeContractsEnabled() {
          return mockNativeContractsEnabled;
        },
      },
    },
  },
}));
jest.mock("../platform/haptics/expoHapticsAdapter", () => ({
  createExpoHapticsAdapter: jest.fn(() => ({
    committed: mockCommittedHaptic,
    cue: mockCueHaptic,
  })),
}));
jest.mock("./ownedPlanRuntime", () => {
  const actual = jest.requireActual<typeof import("./ownedPlanRuntime")>(
    "./ownedPlanRuntime",
  );
  return {
    ...actual,
    createOwnedPlanRuntimePort: jest.fn(actual.createOwnedPlanRuntimePort),
  };
});
jest.mock("./trainingFoundationRuntime", () => {
  const actual = jest.requireActual<typeof import("./trainingFoundationRuntime")>(
    "./trainingFoundationRuntime",
  );
  return {
    ...actual,
    createTrainingFoundationRuntimePort: jest.fn(
      actual.createTrainingFoundationRuntimePort,
    ),
  };
});
jest.mock("./runningPlanRuntime", () => {
  const actual = jest.requireActual<typeof import("./runningPlanRuntime")>(
    "./runningPlanRuntime",
  );
  return {
    ...actual,
    createRunningPlanRuntimePort: jest.fn(actual.createRunningPlanRuntimePort),
  };
});
jest.mock("../domains/plans", () => {
  const actual = jest.requireActual<typeof import("../domains/plans")>("../domains/plans");
  return {
    ...actual,
    activateStarterPlan: jest.fn(actual.activateStarterPlan),
    createStarterPlanCopy: jest.fn(actual.createStarterPlanCopy),
  };
});

import {
  acknowledgeCommittedRuntimeResult,
  activateInitialAcceptedStarter,
  createLibrarySectionPreferencePort,
  createWorkoutAppRuntimeDependencies,
  mapWorkoutMutationFailure,
  productionWorkoutAppRuntimeDependencies,
  WorkoutAppRuntimeProvider,
  type WorkoutAppRuntimeDependencies,
  useCalendarActivityReadPort,
  useCalendarRangeReadPort,
  useCalendarSessionReadPort,
  useCalendarStrengthOccurrenceReadPort,
  useWorkoutAppRuntime,
} from "./workoutAppRuntime";
import {
  createOwnedPlanRuntimePort,
} from "./ownedPlanRuntime";
import {
  createTrainingFoundationRuntimePort,
} from "./trainingFoundationRuntime";
import {
  createRunningPlanRuntimePort,
  type RunningPlanRuntimePort,
} from "./runningPlanRuntime";
import type { RunningPlanAggregate } from "../domains/running/contracts";
import { activateStarterPlan, createStarterPlanCopy } from "../domains/plans";
import type {
  TrainingCalendarRange,
} from "../platform/sqlite/repositories/trainingCalendarRepository";
import {
  applyWorkoutMutationTestControl,
} from "./workoutMutationTestControls";
import {
  createStarterPlanRuntimeCatalog,
} from "./starterPlanRuntime";
import type {
  SecureMergeCommands,
} from "../domains/portability/mergeCommands";
import type {
  WorkoutLifecycleResult,
} from "./workoutLifecycle";
import type {
  ScheduleRuntimeAdapter,
} from "./scheduleRuntime";

const recoveryBackupMock = jest.requireMock(
  "../platform/sqlite/recoveryBackup",
) as {
  createExpoRecoveryBackupPort: jest.MockedFunction<typeof import("../platform/sqlite/recoveryBackup")["createExpoRecoveryBackupPort"]>;
};
const expoSqliteMock = jest.requireMock("expo-sqlite") as {
  openDatabaseAsync: jest.MockedFunction<typeof import("expo-sqlite")["openDatabaseAsync"]>;
};
const mockedCreateOwnedPlanRuntimePort = jest.mocked(
  createOwnedPlanRuntimePort,
);
const mockedCreateTrainingFoundationRuntimePort = jest.mocked(
  createTrainingFoundationRuntimePort,
);
const mockedCreateRunningPlanRuntimePort = jest.mocked(
  createRunningPlanRuntimePort,
);
const mockedActivateStarterPlan = jest.mocked(activateStarterPlan);
const mockedCreateStarterPlanCopy = jest.mocked(createStarterPlanCopy);

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

const acceptedGarminDigest = "c".repeat(64);

function acceptedGarminAggregateJson(): string {
  return JSON.stringify({
    source_kind: "garmin_connect_account",
    account_namespace: "must-not-render",
    external_activity_id: "garmin-123",
    normalized_json_sha256: acceptedGarminDigest,
    sample_fidelity: "source_laps",
    confirmed_local_date: "2026-10-04",
    normalized: {
      version: 1,
      started_at_ms: Date.UTC(2026, 9, 4, 7, 12),
      sport: "running",
      subtype: "outdoor",
      distance_meters: 5_000,
      elapsed_ms: 1_560_000,
      timer_ms: 1_500_000,
      moving_ms: 1_475_000,
      average_heart_rate_bpm: 152,
      laps: [{
        ordinal: 0,
        elapsed_ms: 310_000,
        timer_ms: 300_000,
        moving_ms: 295_000,
        distance_meters: 1_000,
      }],
      route: [
        { latitude_e6: 1_352_100, longitude_e6: 103_819_800, elapsed_ms: 0 },
        { latitude_e6: 1_353_200, longitude_e6: 103_821_100, elapsed_ms: 300_000 },
      ],
    },
  });
}

function runningMatchCandidate(
  overrides: Partial<RunningActivityMatchCandidate> = {},
): RunningActivityMatchCandidate {
  return Object.freeze({
    activityId: "activity-local-01",
    expectedActivityRevision: 1,
    expectedAcceptedPayloadSha256: acceptedGarminDigest,
    opportunityId: "opportunity-1",
    expectedOpportunityRevision: 1,
    planId: "plan-1",
    planName: "Running plan",
    scheduleId: "schedule-1",
    scheduleVersionId: "schedule-version-1",
    expectedScheduleRevision: 1,
    planDayId: "day-1",
    expectedPlanDayRevision: 1,
    slotId: "slot-1",
    slotRevisionId: "slot-revision-1",
    expectedSlotRevision: 1,
    slotOrdinal: 0,
    sessionRevisionId: "session-revision-1",
    expectedSessionRevision: 1,
    sessionKind: "recovery",
    localDate: "2026-10-11",
    localTime: null,
    timezone: "Asia/Singapore",
    targetSummary: "30 min · easy Z2",
    state: "planned",
    expectedRelationRevision: 3,
    ...overrides,
  });
}

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
  addExercise: jest.MockedFunction<NonNullable<ActiveWorkoutRepository["addExercise"]>>;
  replaceExercise: jest.MockedFunction<
    NonNullable<ActiveWorkoutRepository["replaceExercise"]>
  >;
  removeExercise: jest.MockedFunction<
    NonNullable<ActiveWorkoutRepository["removeExercise"]>
  >;
  reorderExercises: jest.MockedFunction<
    NonNullable<ActiveWorkoutRepository["reorderExercises"]>
  >;
  addWorkingSet: jest.MockedFunction<
    ActiveWorkoutRepository["addWorkingSet"]
  >;
  copyPreviousWarmup: jest.MockedFunction<
    ActiveWorkoutRepository["copyPreviousWarmup"]
  >;
  removeWarmup: jest.MockedFunction<
    NonNullable<ActiveWorkoutRepository["removeWarmup"]>
  >;
  removeWorkingSet: jest.MockedFunction<
    NonNullable<ActiveWorkoutRepository["removeWorkingSet"]>
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
    addExercise: jest.fn(async (input) => ({
      outcome: "committed" as const,
      sessionId: input.sessionId,
      sessionExerciseId: input.sessionExerciseId,
      setId: input.setId,
      sessionRevision: input.expectedSessionRevision + 1,
    })),
    replaceExercise: jest.fn(async (input) => ({
      outcome: "committed" as const,
      disposition: "deleted_provisional" as const,
      sessionId: input.sessionId,
      sessionExerciseId: input.sessionExerciseId,
      replacementSessionExerciseId: input.replacementSessionExerciseId,
      replacementSetId: input.replacementSetId,
      sessionRevision: input.expectedSessionRevision + 1,
    })),
    removeExercise: jest.fn(async (input) => ({
      outcome: "committed" as const,
      disposition: "deleted_provisional" as const,
      sessionId: input.sessionId,
      sessionExerciseId: input.sessionExerciseId,
      sessionRevision: input.expectedSessionRevision + 1,
    })),
    reorderExercises: jest.fn(async (input) => ({
      outcome: "committed" as const,
      sessionId: input.sessionId,
      orderedSessionExerciseIds: input.orderedSessionExerciseIds,
      sessionRevision: input.expectedSessionRevision + 1,
    })),
    addWarmup: jest.fn(async () => activeWorkoutView),
    addWorkingSet: jest.fn(async () => activeWorkoutView),
    copyPreviousWarmup: jest.fn(async () => activeWorkoutView),
    removeWarmup: jest.fn(async (input) => ({
      outcome: "committed" as const,
      sessionId: input.sessionId,
      setId: input.setId,
      sessionRevision: input.expectedSessionRevision + 1,
    })),
    removeWorkingSet: jest.fn(async (input) => ({
      outcome: "committed" as const,
      sessionId: input.sessionId,
      setId: input.setId,
      sessionRevision: input.expectedSessionRevision + 1,
    })),
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

function runtimeAdvancedTimingRepository(): AdvancedTimingRepositoryPort & {
  getAdvancedTimingContext: jest.MockedFunction<
    AdvancedTimingRepositoryPort["getAdvancedTimingContext"]
  >;
  listActiveTimingContexts: jest.MockedFunction<
    AdvancedTimingRepositoryPort["listActiveTimingContexts"]
  >;
  configureAdvancedTiming: jest.MockedFunction<
    AdvancedTimingRepository["configureAdvancedTiming"]
  >;
  startAdvancedTiming: jest.MockedFunction<
    AdvancedTimingRepository["startAdvancedTiming"]
  >;
  updateSessionExerciseAdvancedTiming: jest.MockedFunction<
    AdvancedTimingRepository["updateSessionExerciseAdvancedTiming"]
  >;
  updateSessionSetAdvancedTiming: jest.MockedFunction<
    AdvancedTimingRepository["updateSessionSetAdvancedTiming"]
  >;
  beginAdvancedTimingClusterGap: jest.MockedFunction<
    AdvancedTimingRepository["beginAdvancedTimingClusterGap"]
  >;
  skipAdvancedTimingClusterGap: jest.MockedFunction<
    AdvancedTimingRepository["skipAdvancedTimingClusterGap"]
  >;
  reconcileAdvancedTiming: jest.MockedFunction<
    AdvancedTimingRepository["reconcileAdvancedTiming"]
  >;
} {
  const idle: AdvancedTimingStateV1 = {
    version: 1,
    state: "idle",
    revision: 0,
    targetSessionSetId: null,
  };
  const result: AdvancedTimingCommandResult = {
    state: idle,
    sessionRevision: 1,
    invalidationScopes: [
      ["active-workout", "session-1"],
      ["today"],
    ],
  };
  return {
    getAdvancedTimingContext: jest.fn<
      AdvancedTimingRepositoryPort["getAdvancedTimingContext"]
    >(async () => ({
      sessionId: "session-1",
      sessionRevision: 1,
      state: idle,
    })),
    listActiveTimingContexts: jest.fn<
      AdvancedTimingRepositoryPort["listActiveTimingContexts"]
    >(async () => []),
    configureAdvancedTiming: jest.fn<
      AdvancedTimingRepository["configureAdvancedTiming"]
    >(async () => result),
    startAdvancedTiming: jest.fn<AdvancedTimingRepository["startAdvancedTiming"]>(
      async () => result,
    ),
    updateSessionExerciseAdvancedTiming: jest.fn<
      AdvancedTimingRepository["updateSessionExerciseAdvancedTiming"]
    >(async () => result),
    updateSessionSetAdvancedTiming: jest.fn<
      AdvancedTimingRepository["updateSessionSetAdvancedTiming"]
    >(async () => result),
    beginAdvancedTimingClusterGap: jest.fn<
      AdvancedTimingRepository["beginAdvancedTimingClusterGap"]
    >(async () => result),
    skipAdvancedTimingClusterGap: jest.fn<
      AdvancedTimingRepository["skipAdvancedTimingClusterGap"]
    >(async () => result),
    pauseAdvancedTiming: jest.fn<AdvancedTimingRepository["pauseAdvancedTiming"]>(
      async () => result,
    ),
    resumeAdvancedTiming: jest.fn<AdvancedTimingRepository["resumeAdvancedTiming"]>(
      async () => result,
    ),
    reconcileAdvancedTiming: jest.fn<
      AdvancedTimingRepository["reconcileAdvancedTiming"]
    >(async () => ({ ...result, cue: null })),
    stopAdvancedTiming: jest.fn<AdvancedTimingRepository["stopAdvancedTiming"]>(
      async () => result,
    ),
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
  modifiedFromPlan: false,
  exerciseProgress: { completed: 1, planned: 1, percent: 100 },
  workingSetProgress: { completed: 1, planned: 1, percent: 100 },
  exercises: [],
  nonLoadOutcomes: [],
  recommendations: [],
  recommendationStatus: "none",
  resumable: false,
  readOnly: true,
};

const sessionWriteBackPreview: SessionExerciseEditsForPlanPreview = {
  kind: "session_exercise_edits",
  sourceSessionId: "session-1",
  sourceSessionRevision: 2,
  planId: "plan-copy",
  planName: "Full Body Foundation",
  planDayId: "day-a",
  dayName: "Full Body A",
  expectedPlanRevision: 1,
  currentWorkoutUnaffected: true,
  previewToken: `session-writeback-v1:${"a".repeat(64)}`,
  composition: [],
  changes: [],
};

function runtimeOutcomeRepository():
WorkoutOutcomeRepository & ProgressionRepository & Readonly<{
  getCalendarSessionDetail(sessionId: string): Promise<SessionDetail | null>;
}> {
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
    getCalendarSessionDetail: jest.fn(async () => runtimeSessionDetail),
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
    dispose: jest.fn(async () => undefined),
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
  getTodayView: jest.MockedFunction<Repository["getTodayView"]>;
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
  const queryAll = jest.fn(async () => []);
  const kernel = {
    close: jest.fn(async () => undefined),
    queryAll,
    readSnapshot: jest.fn(async (query: (transaction: Pick<SqliteTransactionExecutor, "queryAll">) => Promise<unknown>) =>
      query({ queryAll }),
    ),
    write: jest.fn(async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) =>
      command({
        execute: jest.fn(async () => ({ changes: 1, lastInsertRowId: 0 })),
        queryAll: jest.fn(async () => []),
      })),
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

function CalendarPortsProbe({ onReady }: Readonly<{ onReady(): void }>) {
  useCalendarRangeReadPort();
  useCalendarSessionReadPort();
  useCalendarStrengthOccurrenceReadPort();
  useCalendarActivityReadPort();
  React.useEffect(onReady, [onReady]);
  return <Text testID="calendar-ports-ready">ready</Text>;
}

function CalendarPortsHarness({
  dependencies: runtimeDependencies,
  onReady,
}: Readonly<{
  dependencies: WorkoutAppRuntimeDependencies;
  onReady(): void;
}>) {
  return (
    <AppearanceProvider>
      <WorkoutAppRuntimeProvider dependencies={runtimeDependencies}>
        <CalendarPortsProbe onReady={onReady} />
      </WorkoutAppRuntimeProvider>
    </AppearanceProvider>
  );
}

describe("WorkoutAppRuntimeProvider", () => {
  it("reads and commits Library section preferences with exact revision fencing", async () => {
    let row: { value_version: number; value_json: string; revision: number } | undefined;
    let updateChanges = 1;
    const execute = jest.fn(async (sql: string, parameters?: readonly unknown[]) => {
      if (sql.includes("INSERT INTO app_settings")) {
        row = { value_version: 1, value_json: String(parameters?.[1]), revision: Number(parameters?.[2]) };
      } else if (sql.includes("UPDATE app_settings") && updateChanges === 1) {
        row = { value_version: 1, value_json: String(parameters?.[0]), revision: Number(parameters?.[1]) };
      }
      return { changes: updateChanges, lastInsertRowId: 0 };
    });
    const queryAll = jest.fn(async () => row === undefined ? [] : [row]);
    const kernel = {
      queryAll,
      write: jest.fn(async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) => command({ execute, queryAll } as never)),
    } as unknown as SqliteKernel;
    const port = createLibrarySectionPreferencePort(kernel, () => 123);

    await expect(port.read()).resolves.toEqual({ section: "plans", revision: 0 });
    await expect(port.write("exercises", 0)).resolves.toEqual({ section: "exercises", revision: 1 });
    expect(row).toEqual({ value_version: 1, value_json: '{"section":"exercises"}', revision: 1 });
    await expect(port.write("exercises", 1)).resolves.toEqual({ section: "exercises", revision: 1 });
    await expect(port.write("plans", 0)).rejects.toThrow("library_section_preference_conflict");
    await expect(port.write("plans", 1)).resolves.toEqual({ section: "plans", revision: 2 });

    updateChanges = 0;
    await expect(port.write("exercises", 2)).rejects.toThrow("library_section_preference_conflict");
    await expect(port.write("invalid" as never, 2)).rejects.toThrow("library_section_preference_invalid");
    await expect(port.write("plans", -1)).rejects.toThrow("library_section_preference_invalid");

    row = { value_version: 2, value_json: '{"section":"plans"}', revision: 1 };
    await expect(port.read()).rejects.toThrow("library_section_preference_invalid");
    row = { value_version: 1, value_json: "not-json", revision: 1 };
    await expect(port.read()).rejects.toThrow("library_section_preference_invalid");
    for (const value_json of ["null", "[]", "{}", '{"section":"other"}']) {
      row = { value_version: 1, value_json, revision: 1 };
      await expect(port.read()).rejects.toThrow("library_section_preference_invalid");
    }
  });

  beforeEach(() => {
    mockNativeContractsEnabled = true;
    mockCommittedHaptic.mockClear();
    mockCueHaptic.mockClear();
    mockedCreateTrainingFoundationRuntimePort.mockClear();
    mockedCreateRunningPlanRuntimePort.mockClear();
    mockedActivateStarterPlan.mockClear();
    mockedCreateStarterPlanCopy.mockClear();
    applyWorkoutMutationTestControl("reset_workout_failures");
  });

  it("delegates bounded Calendar range reads through the query-only foundation port", async () => {
    const range = Object.freeze({ events: Object.freeze([]), days: Object.freeze([]) }) as TrainingCalendarRange;
    const loadCalendarRange = jest.fn(async () => range);
    mockedCreateTrainingFoundationRuntimePort.mockImplementationOnce(() =>
      Object.freeze({
        loadCalendarRange,
        loadPlannedStrengthOccurrence: jest.fn(async () => null),
        loadToday: jest.fn(async () => range),
        loadBodyweightHistory: jest.fn(async () => Object.freeze([])),
        commitBodyweight: jest.fn(async () => Object.freeze({ kind: "created" as const, entry: undefined })),
      }),
    );
    const repository = runtimeRepository([noPlanView], [null]);
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;

    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository)}
        onReady={(runtime) => { captured = runtime; }}
      />,
    );
    await waitFor(() => expect(captured?.launchState).toBe("trusted"));

    await expect(captured!.loadCalendarRange({
      startLocalDate: "2026-10-01",
      endLocalDateExclusive: "2026-11-01",
    })).resolves.toBe(range);
    expect(loadCalendarRange).toHaveBeenCalledWith({
      startLocalDate: "2026-10-01",
      endLocalDateExclusive: "2026-11-01",
    });
  });

  it("delegates exact planned Strength occurrence reads without fabricating a session", async () => {
    const occurrence = Object.freeze({
      occurrenceId: "occurrence-1", planId: "plan-1", planName: "Full Body Foundation",
      planDayId: "day-1", dayName: "Full Body A",
      scheduleId: "schedule-1", scheduleVersionId: "version-1",
      localDate: "2026-10-13", timezone: "Asia/Singapore",
      sourceRevisions: Object.freeze({ plan: 1, day: 1, schedule: 1, opportunity: 1 }),
      exercises: Object.freeze([]),
    }) as PlannedStrengthOccurrenceDetail;
    const loadPlannedStrengthOccurrence = jest.fn(async () => occurrence);
    mockedCreateTrainingFoundationRuntimePort.mockImplementationOnce(() =>
      Object.freeze({
        loadCalendarRange: jest.fn(async () => Object.freeze({ events: Object.freeze([]), days: Object.freeze([]) })),
        loadPlannedStrengthOccurrence,
        loadToday: jest.fn(async () => Object.freeze({ events: Object.freeze([]), days: Object.freeze([]) })),
        loadBodyweightHistory: jest.fn(async () => Object.freeze([])),
        commitBodyweight: jest.fn(async () => Object.freeze({ kind: "created" as const, entry: undefined })),
      }),
    );
    const repository = runtimeRepository([noPlanView], [null]);
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;

    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository)}
        onReady={(runtime) => { captured = runtime; }}
      />,
    );
    await waitFor(() => expect(captured?.launchState).toBe("trusted"));

    await expect(captured!.loadPlannedStrengthOccurrence("occurrence-1"))
      .resolves.toBe(occurrence);
    expect(loadPlannedStrengthOccurrence).toHaveBeenCalledWith("occurrence-1");
  });

  it("keeps legacy runtime dependencies trusted without reading Phase 12 backup state", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const kernel = {
      close: jest.fn(async () => undefined),
      queryAll: jest.fn(async (sql: string) => {
        if (sql.includes("automatic_backup_state")) {
          throw new Error("legacy_kernel_has_no_phase12_tables");
        }
        return [];
      }),
      write: jest.fn(async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) =>
        command({
          execute: jest.fn(async () => ({ changes: 1, lastInsertRowId: 0 })),
          queryAll: jest.fn(async () => []),
        })),
    } as unknown as SqliteKernel;
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
    expect(captured?.automaticBackup.status).toBe("not_connected");
    expect(kernel.queryAll).not.toHaveBeenCalledWith(
      expect.stringContaining("automatic_backup_state"),
    );
  });

  it("hydrates the automatic backup model from the injected runtime", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const automaticBackup = projectAutomaticBackupPresentation({
      status: "idle",
      accountLabel: "backup@example.com",
      mutationGeneration: 4,
      backedUpGeneration: 4,
      nowMs: 1_786_853_600_000,
    });
    const runtime = {
      current: jest.fn(() => automaticBackup),
      start: jest.fn(async () => undefined),
      refresh: jest.fn(async () => undefined),
      subscribe: jest.fn(() => () => undefined),
      dispose: jest.fn(),
    } as unknown as AutomaticBackupRuntime;
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;

    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createAutomaticBackupRuntime: () => runtime,
        })}
        onReady={(value) => {
          captured = value;
        }}
      />,
    );

    await waitFor(() => {
      expect(captured?.launchState).toBe("trusted");
      expect(captured?.automaticBackup).toEqual(automaticBackup);
    });
    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(runtime.current).toHaveBeenCalled();
  });

  it.each([
    ["rebuilt", "ready"],
    ["retryable_failure", "rebuild_pending"],
  ] as Array<["rebuilt" | "retryable_failure", "ready" | "rebuild_pending"]>)("reports %s merge reconciliation as %s without replaying the writer", async (outcome, expectedState) => {
    const repository = runtimeRepository([noPlanView], [null]);
    const commitSecureMerge = jest.fn(async () => ({ state: "rebuild_pending" as const }));
    const mergeCommands: SecureMergeCommands = {
      preflightSecureMerge: async () => ({ outcome: "cancelled" }),
      commitSecureMerge,
      invalidateSecureMergePreflight: () => undefined,
    };
    const reconcileRestore = jest.fn<
      NonNullable<WorkoutAppRuntimeDependencies["reconcileRestore"]>
    >()
      .mockResolvedValueOnce({
        outcome: "already_ready" as const,
        state: "ready" as const,
        unavailableCatalogReferences: 0,
      })
      .mockResolvedValueOnce({
        outcome,
        state: outcome === "rebuilt" ? "ready" as const : "rebuild_pending" as const,
        unavailableCatalogReferences: 0,
      });
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;

    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createMergeCommands: () => mergeCommands,
          reconcileRestore,
        })}
        onReady={(runtime) => {
          captured = runtime;
        }}
      />,
    );
    await waitFor(() => {
      expect(captured?.launchState).toBe("trusted");
    });

    let result: Awaited<ReturnType<NonNullable<typeof captured>["commitSecureMerge"]>>;
    await act(async () => {
      result = await captured!.commitSecureMerge({
        confirmation: "MERGE",
        token: "single-use",
      });
    });

    expect(result!).toEqual({ state: expectedState });
    expect(commitSecureMerge).toHaveBeenCalledWith({
      confirmation: "MERGE",
      token: "single-use",
    });
    expect(reconcileRestore).toHaveBeenCalledTimes(2);
  });

  it("loads and records latest safe backup metadata after a successful share", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const writes: Array<readonly unknown[]> = [];
    const kernel = {
      close: jest.fn(async () => undefined),
      queryAll: jest.fn(async (sql: string) => {
        if (sql.includes("FROM app_settings")) {
          return [{
            value_version: 1,
            value_json: JSON.stringify({
              archiveId: "previous-backup",
              createdAtMs: 1_786_853_000_000,
              displayName: "previous-backup.gtbk",
            }),
          }];
        }
        return [];
      }),
      write: jest.fn(async (
        command: (transaction: SqliteTransactionExecutor) => Promise<unknown>,
      ) => command({
        execute: jest.fn(async (
          _sql,
          parameters: readonly unknown[] = [],
        ) => {
          writes.push(parameters);
          return { changes: 1, lastInsertRowId: 0 };
        }),
        queryAll: jest.fn(async () => []),
      })),
    } as unknown as SqliteKernel;
    const backupArchive = {
      archiveId: "backup-20260921",
      createdAtMs: 1_789_977_000_000,
      displayName: "backup-20260921.gtbk",
    };
    const backupCommands = {
      createSecureBackup: jest.fn(async () => backupArchive),
      discardSecureBackup: jest.fn(async () => undefined),
      shareSecureBackup: jest.fn(async () => undefined),
    };
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;

    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          openKernel: jest.fn(async () => kernel),
          createBackupCommands: () => backupCommands,
        })}
        onReady={(runtime) => {
          captured = runtime;
        }}
      />,
    );
    await waitFor(() => {
      expect(captured?.latestBackup).toEqual({
        archiveId: "previous-backup",
        createdAtMs: 1_786_853_000_000,
        displayName: "previous-backup.gtbk",
      });
    });

    await act(async () => {
      await captured!.shareSecureBackup(backupArchive);
    });

    expect(backupCommands.shareSecureBackup).toHaveBeenCalledWith(backupArchive);
    expect(captured!.latestBackup).toEqual(backupArchive);
    expect(writes.at(-1)).toEqual([
      "backup.latest",
      JSON.stringify(backupArchive),
      1_786_853_600_000,
    ]);
    expect(JSON.stringify(writes)).not.toContain("file:");
  });

  it("does not fail an already-shared backup when metadata persistence fails", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const kernel = {
      close: jest.fn(async () => undefined),
      queryAll: jest.fn(async () => []),
      write: jest.fn(async () => {
        throw new Error("metadata_write_failed");
      }),
    } as unknown as SqliteKernel;
    const backupArchive = {
      archiveId: "backup-20260921",
      createdAtMs: 1_789_977_000_000,
      displayName: "backup-20260921.gtbk",
    };
    const backupCommands = {
      createSecureBackup: jest.fn(async () => backupArchive),
      discardSecureBackup: jest.fn(async () => undefined),
      shareSecureBackup: jest.fn(async () => undefined),
    };
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;

    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          openKernel: jest.fn(async () => kernel),
          createBackupCommands: () => backupCommands,
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
      await expect(captured!.shareSecureBackup(backupArchive)).resolves.toBeUndefined();
    });
    expect(backupCommands.shareSecureBackup).toHaveBeenCalledWith(backupArchive);
    await waitFor(() => {
      expect(captured!.latestBackup).toEqual(backupArchive);
    });
  });

  it("exposes factual progress only through the trusted runtime boundary", async () => {
    const queryAll = jest.fn(async () => []);
    const readSnapshot = jest.fn(async (
      query: (transaction: Pick<SqliteTransactionExecutor, "queryAll">) => Promise<unknown>,
    ) => query({ queryAll }));
    const kernel = {
      close: jest.fn(async () => undefined),
      queryAll,
      readSnapshot,
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
      sport: "Running",
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
    })).resolves.toEqual({
      sport: "Running",
      period: "4_weeks",
      freshness: "current",
      refresh: {
        generation: 0,
        automaticRefresh: {
          maxAttempts: 3,
          backoffMs: [250, 1_000, 4_000],
          terminal: "current",
        },
      },
      projection: expect.objectContaining({
        state: "baseline",
        window: { start: "2026-07-28", end: "2026-08-24" },
      }),
      dashboard: {
        sport: "Running",
        state: "empty",
        goals: [],
        absenceReason: "no_factual_points",
      },
      runningTargetSources: [],
    });
    expect(readSnapshot).toHaveBeenCalledTimes(1);
  });

  it("uses the bounded snapshot fallback and fences imported source revisions", async () => {
    let stale = false;
    const queryAll = jest.fn(async (sql: string) => {
      if (stale && sql.includes("history_projection_freshness")) {
        return [{ subject_id: "session-1", revision: 2, applied_revision: 1 }];
      }
      if (stale && sql.includes("FROM history_rebuild_effects")) {
        return [{ subject_id: "session-1" }];
      }
      return sql.includes("FROM imported_activities activity") ? [{
        activity_id: "activity-1",
        aggregate_json: "{}",
        aggregate_revision: 1,
        accepted_normalized_sha256: "a".repeat(64),
        removal_state: "active",
        pending_revision_count: 0,
      }] : [];
    });
    const kernel = {
      close: jest.fn(async () => undefined),
      queryAll,
    } as unknown as SqliteKernel;
    const repository = runtimeRepository([noPlanView], [null]);
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;

    await render(<RuntimeCaptureHarness
      dependencies={dependencies(repository, { openKernel: jest.fn(async () => kernel) })}
      onReady={(runtime) => { captured = runtime; }}
    />);
    await waitFor(() => expect(captured?.launchState).toBe("trusted"));

    await expect(captured!.loadProgress({
      sport: "Strength",
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
    })).resolves.toMatchObject({ sport: "Strength", freshness: "current" });
    await expect(captured!.loadImportedActivityDetail("activity-1", 2))
      .resolves.toEqual({
        kind: "projection_error",
        code: "accepted_payload_unavailable",
      });
    await expect(captured!.loadImportedActivityDetail("activity-1", 1))
      .resolves.toMatchObject({ kind: "projection_error" });
    stale = true;
    await expect(captured!.loadProgress({
      sport: "Running",
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
    })).resolves.toMatchObject({ sport: "Running", freshness: "updating" });
  });

  it("exposes only typed Running target reads and commit-gated commands to Progress", async () => {
    const targetSource = Object.freeze({
      version: 1 as const,
      id: "running-plan-2400",
      name: "2.4 km plan",
      revision: 4,
      active: true,
      lifecycle: "active" as const,
      createdAtMs: 1,
      goal: Object.freeze({
        version: 1 as const,
        id: "running-goal-2400",
        planId: "running-plan-2400",
        revision: 2,
        goalDistanceMeters: 2_400,
        targetDurationMs: 660_000,
        trainingDays: ["Monday" as const],
        createdAtMs: 1,
      }),
      sessions: Object.freeze([]),
    }) satisfies RunningPlanAggregate;
    const archivedTargetSource = Object.freeze({
      ...targetSource,
      id: "running-plan-archived",
      lifecycle: "archived" as const,
      goal: Object.freeze({ ...targetSource.goal, planId: "running-plan-archived" }),
    }) satisfies RunningPlanAggregate;
    const progressRunningTargetRuntime = Object.freeze({
      createId: jest.fn(() => "running-target-save:request"),
      loadPlan: jest.fn(async (planId: string) => planId === "running-plan-missing"
        ? null
        : planId === "running-plan-archived" ? archivedTargetSource : targetSource),
      saveRunningTarget: jest.fn(async () => Object.freeze({
        outcome: "committed" as const,
        plan: targetSource,
      })),
    }) as unknown as RunningPlanRuntimePort;
    mockedCreateRunningPlanRuntimePort.mockImplementationOnce(() => progressRunningTargetRuntime);
    const queryAll = jest.fn(async (sql: string) => {
      if (sql.includes("SELECT plan.id AS plan_id") && sql.includes("JOIN running_plans")) {
        return [{ plan_id: "running-plan-2400" }];
      }
      if (sql.includes("SELECT plan.id, plan.name, plan.revision, running.created_at_ms")) {
        return [{
          id: targetSource.id,
          name: targetSource.name,
          revision: targetSource.revision,
          created_at_ms: targetSource.createdAtMs,
          is_active: 1,
          status: "ready",
        }];
      }
      if (sql.includes("FROM running_goals")) {
        return [{
          id: "running-goal-2400",
          plan_id: "running-plan-2400",
          revision: 2,
          goal_json: JSON.stringify(targetSource.goal),
          created_at_ms: 1,
        }];
      }
      return [];
    });
    const kernel = {
      close: jest.fn(async () => undefined),
      queryAll,
      readSnapshot: jest.fn(async (
        query: (transaction: Pick<SqliteTransactionExecutor, "queryAll">) => Promise<unknown>,
      ) => query({
        queryAll: queryAll as unknown as SqliteTransactionExecutor["queryAll"],
      })),
    } as unknown as SqliteKernel;
    const repository = runtimeRepository([noPlanView], [null]);
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;

    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, { openKernel: jest.fn(async () => kernel) })}
        onReady={(runtime) => { captured = runtime; }}
      />,
    );
    await waitFor(() => expect(captured?.launchState).toBe("trusted"));

    const progress = await captured!.loadProgress({
      sport: "Running",
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
    });
    expect(progress.runningTargetSources).toEqual([targetSource]);
    expect(progress).not.toHaveProperty("sourceFacts");
    expect(captured!.progressRunningTargetRuntime.createId("running-target-save"))
      .toBe("running-target-save:request");
    await expect(captured!.progressRunningTargetRuntime.loadPlan("running-plan-2400"))
      .resolves.toBe(targetSource);
    await expect(captured!.progressRunningTargetRuntime.saveRunningTarget({
      planId: "running-plan-2400",
      requestId: "running-target-save:request",
      expectedSourceRevision: 4,
      goalDistanceMeters: 2_400,
      targetDurationMs: 660_000,
      trainingDays: ["Monday"],
    })).resolves.toEqual({ outcome: "committed", plan: targetSource });
    const runningDependencies = mockedCreateRunningPlanRuntimePort.mock.calls.at(-1)?.[1];
    await expect(runningDependencies?.sha256("phase19-runtime-seam"))
      .resolves.toMatch(/^[a-f0-9]{64}$/u);
  });

  it("keeps Progress recommendation and bodyweight commands behind typed receipt adapters", async () => {
    const bodyweightEntry = Object.freeze({
      entryId: "bodyweight-1",
      ownerId: "owner-1",
      revision: 1,
      lifecycle: "active" as const,
      revisionId: "bodyweight-revision-1",
      eventId: "bodyweight-event-1",
      localDate: "2026-08-17",
      timezone: "Asia/Singapore",
      grams: 72_100,
    }) satisfies BodyweightEntryState;
    const loadBodyweightHistory = jest.fn<() => Promise<readonly BodyweightEntryState[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([bodyweightEntry]);
    const commitBodyweight = jest.fn(async () => Object.freeze({
      kind: "created" as const,
      entry: bodyweightEntry,
    }));
    mockedCreateTrainingFoundationRuntimePort.mockImplementationOnce(() => Object.freeze({
      loadCalendarRange: jest.fn(),
      loadPlannedStrengthOccurrence: jest.fn(),
      loadToday: jest.fn(),
      loadBodyweightHistory,
      commitBodyweight,
    }) as never);
    const outcomeRepository = runtimeOutcomeRepository();
    const queryAll = jest.fn(async (sql: string) => {
      if (sql.includes("FROM portable_owner_identity")) return [{ owner_namespace: "owner-1" }];
      if (sql.includes("FROM progression_recommendations")) return [{
        evidence_version: 2,
        source_revision: 4,
        target_revision: 3,
        status: "pending",
      }];
      return [];
    });
    const kernel = {
      close: jest.fn(async () => undefined),
      queryAll,
      readSnapshot: jest.fn(async (
        query: (transaction: Pick<SqliteTransactionExecutor, "queryAll">) => Promise<unknown>,
      ) => query({ queryAll: queryAll as unknown as SqliteTransactionExecutor["queryAll"] })),
    } as unknown as SqliteKernel;
    const repository = runtimeRepository([noPlanView], [null]);
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;

    await render(<RuntimeCaptureHarness
      dependencies={dependencies(repository, {
        createOutcomeRepository: () => outcomeRepository,
        openKernel: jest.fn(async () => kernel),
      })}
      onReady={(runtime) => { captured = runtime; }}
    />);
    await waitFor(() => expect(captured?.launchState).toBe("trusted"));

    await expect(captured!.progressBodyweightRuntime.loadHistory()).resolves.toEqual([]);
    await expect(captured!.progressBodyweightRuntime.save({
      entryId: "bodyweight-1",
      expectedRevision: 0,
      grams: 72_100,
      localDate: "2026-08-17",
      requestId: "bodyweight-save-1",
    })).resolves.toEqual([{
      entryId: "bodyweight-1",
      revision: 1,
      localDate: "2026-08-17",
      grams: 72_100,
    }]);
    expect(commitBodyweight).toHaveBeenCalledWith(expect.objectContaining({
      operation: "create",
      ownerId: "owner-1",
      requestId: "bodyweight-save-1",
      requestSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    }));

    const recommendation = {
      id: "recommendation-1",
      lifecycle: "pending",
    } as ProgressRecommendationReview;
    let decisionResult: unknown;
    await act(async () => {
      decisionResult = await captured!.progressRecommendationRuntime.decide(
        recommendation,
        "use_target",
      );
    });
    expect(decisionResult).toEqual({ recommendationId: "recommendation-1", status: "accepted" });
    expect(outcomeRepository.acceptRecommendation).toHaveBeenCalledWith(expect.objectContaining({
      decision: "use_target",
      expectedEvidenceVersion: 2,
      expectedSourceRevision: 4,
      expectedTargetRevision: 3,
      recommendationId: "recommendation-1",
      requestId: expect.stringMatching(/^recommendation-use:/u),
    }));
  });

  it("fails closed across bodyweight owner, conflict, retry, edit, delete, and readback seams", async () => {
    const entry = Object.freeze({
      entryId: "bodyweight-1",
      ownerId: "owner-1",
      revision: 1,
      lifecycle: "active" as const,
      revisionId: "revision-1",
      eventId: "event-1",
      localDate: "2026-08-17",
      timezone: "Asia/Singapore",
      grams: 72_100,
    }) satisfies BodyweightEntryState;
    let ownerRows: readonly { owner_namespace: string }[] = [];
    let historyEntries: readonly BodyweightEntryState[] = [];
    let commitResult: unknown = { kind: "conflict" };
    const loadBodyweightHistory = jest.fn(async () => historyEntries);
    const commitBodyweight = jest.fn(async () => commitResult);
    mockedCreateTrainingFoundationRuntimePort.mockImplementationOnce(() => Object.freeze({
      loadCalendarRange: jest.fn(),
      loadPlannedStrengthOccurrence: jest.fn(),
      loadToday: jest.fn(),
      loadBodyweightHistory,
      commitBodyweight,
    }) as never);
    const queryAll = jest.fn(async (sql: string) =>
      sql.includes("FROM portable_owner_identity") ? ownerRows : []);
    const kernel = {
      close: jest.fn(async () => undefined),
      queryAll,
      readSnapshot: jest.fn(async (
        query: (transaction: Pick<SqliteTransactionExecutor, "queryAll">) => Promise<unknown>,
      ) => query({ queryAll: queryAll as unknown as SqliteTransactionExecutor["queryAll"] })),
    } as unknown as SqliteKernel;
    const repository = runtimeRepository([noPlanView], [null]);
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(<RuntimeCaptureHarness
      dependencies={dependencies(repository, { openKernel: jest.fn(async () => kernel) })}
      onReady={(runtime) => { captured = runtime; }}
    />);
    await waitFor(() => expect(captured?.launchState).toBe("trusted"));

    await expect(captured!.progressBodyweightRuntime.loadHistory())
      .rejects.toThrow("progress_bodyweight_owner_unavailable");
    const createInput = {
      entryId: "bodyweight-1",
      expectedRevision: 0,
      grams: 72_100,
      localDate: "2026-08-17",
      requestId: "bodyweight-create",
    };
    await expect(captured!.progressBodyweightRuntime.save(createInput))
      .rejects.toThrow("progress_bodyweight_owner_unavailable");

    ownerRows = [{ owner_namespace: "owner-1" }];
    await expect(captured!.progressBodyweightRuntime.save(createInput))
      .rejects.toThrow("bodyweight_revision_conflict");
    commitResult = { kind: "created", entry };
    historyEntries = [entry];
    await expect(captured!.progressBodyweightRuntime.save(createInput))
      .resolves.toMatchObject([{ entryId: "bodyweight-1", revision: 1 }]);

    const edited = { ...entry, revision: 2, grams: 72_200 };
    commitResult = { kind: "edited", entry: edited };
    historyEntries = [edited];
    await expect(captured!.progressBodyweightRuntime.save({
      ...createInput,
      requestId: "bodyweight-edit",
      expectedRevision: 1,
      grams: 72_200,
    })).resolves.toMatchObject([{ revision: 2, grams: 72_200 }]);

    commitResult = { kind: "deleted", entry: edited };
    historyEntries = [];
    await expect(captured!.progressBodyweightRuntime.delete({
      entryId: edited.entryId,
      revision: edited.revision,
      localDate: edited.localDate,
      grams: edited.grams,
    }, "bodyweight-delete")).resolves.toEqual([]);

    commitResult = { kind: "created", entry };
    await expect(captured!.progressBodyweightRuntime.save({
      ...createInput,
      requestId: "bodyweight-missing-readback",
    })).rejects.toThrow("bodyweight_readback_missing");
  });

  it("fences non-actionable recommendations, retries one command, and supports Keep", async () => {
    const outcomeRepository = runtimeOutcomeRepository();
    const queryAll = jest.fn(async (sql: string) => sql.includes("FROM progression_recommendations")
      ? [{ evidence_version: 2, source_revision: 4, target_revision: 3, status: "pending" }]
      : []);
    const kernel = {
      close: jest.fn(async () => undefined),
      queryAll,
      readSnapshot: jest.fn(async (
        query: (transaction: Pick<SqliteTransactionExecutor, "queryAll">) => Promise<unknown>,
      ) => query({ queryAll: queryAll as unknown as SqliteTransactionExecutor["queryAll"] })),
    } as unknown as SqliteKernel;
    const repository = runtimeRepository([noPlanView], [null]);
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(<RuntimeCaptureHarness
      dependencies={dependencies(repository, {
        createOutcomeRepository: () => outcomeRepository,
        openKernel: jest.fn(async () => kernel),
      })}
      onReady={(runtime) => { captured = runtime; }}
    />);
    await waitFor(() => expect(captured?.launchState).toBe("trusted"));
    const pending = { id: "recommendation-1", lifecycle: "pending" } as ProgressRecommendationReview;
    await expect(captured!.progressRecommendationRuntime.decide({
      ...pending,
      lifecycle: "accepted",
    } as ProgressRecommendationReview, "use_target"))
      .rejects.toThrow("recommendation_no_longer_actionable");

    queryAll.mockResolvedValueOnce([]);
    await expect(captured!.progressRecommendationRuntime.decide(pending, "use_target"))
      .rejects.toThrow("recommendation_revision_fence_unavailable");

    const keepCurrentTargetMock = outcomeRepository.keepCurrentTarget as jest.MockedFunction<
      typeof outcomeRepository.keepCurrentTarget
    >;
    keepCurrentTargetMock
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ recommendationId: "recommendation-1", status: "rejected" });
    const fenceCalls = () => queryAll.mock.calls.filter(([sql]) =>
      String(sql).includes("FROM progression_recommendations")).length;
    const callsBeforeKeep = fenceCalls();
    await expect(captured!.progressRecommendationRuntime.decide(pending, "keep_current_target"))
      .rejects.toThrow();
    await expect(captured!.progressRecommendationRuntime.decide(pending, "keep_current_target"))
      .resolves.toMatchObject({ status: "rejected" });
    expect(fenceCalls() - callsBeforeKeep).toBe(2);

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

  it("keeps advanced timing out of the active runtime surface", () => {
    const runtimeSource = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "src/bootstrap/workoutAppRuntime.tsx"),
      "utf8",
    ) as string;

    expect(runtimeSource).not.toMatch(/advancedTimingRepository/u);
    expect(runtimeSource).not.toMatch(/createAdvancedTimingRepository/u);
    expect(runtimeSource).not.toMatch(/(?:start|configure|reconcile|pause|resume|stop)AdvancedTiming/u);
    expect(runtimeSource).not.toMatch(/(?:begin|skip)AdvancedTimingClusterGap/u);
  });

  /* Legacy runtime timing behavior was retired by TIM-01. Historical timing
   * records remain readable through portability/history modules, but the active
   * runtime must never recreate a command-capable surface. */
  /*
  it("retires cadence runtime commands without rest effects or permission work", async () => {
    const repository = runtimeRepository([activeView, activeView, activeView], [activation]);
    const advanced = runtimeAdvancedTimingRepository();
    const rest = runtimeRestRepository();
    const lifecycle = runtimeLifecycle();
    const notifications = runtimeNotifications("undetermined");
    const running: AdvancedTimingStateV1 = {
      version: 1,
      state: "running",
      mode: "per_rep",
      revision: 1,
      targetSessionSetId: "set-1",
      cueChannels: "haptic",
      intervalMs: 1_000,
      startedAtMs: 10_000,
      nextBoundaryAtMs: 11_000,
      nextRepetitionIndex: 1,
    };
    advanced.startAdvancedTiming.mockResolvedValue({
      state: running,
      sessionRevision: 1,
      invalidationScopes: [
        ["active-workout", "session-1"],
        ["today"],
      ],
    });
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;

    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createAdvancedTimingRepository: () => advanced,
          createRestRepository: () => rest,
          createLifecycle: () => lifecycle,
          createNotifications: () => notifications,
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

    let result: AdvancedTimingCommandResult | undefined;
    await act(async () => {
      result = await captured!.configureAdvancedTiming({
        sessionId: "session-1",
        sessionSetId: "set-1",
        expectedSessionRevision: 1,
        expectedAdvancedTimingRevision: 0,
        nowMs: 10_000,
        config: {
          version: 1,
          mode: "per_rep",
          intervalMs: 1_000,
          cueChannels: "haptic",
        },
      });
    });
    expect(result).toEqual(expect.objectContaining({
      state: {
        version: 1,
        state: "idle",
        revision: 0,
        targetSessionSetId: null,
      },
    }));
    await act(async () => {
      result = await captured!.startAdvancedTiming({
        sessionId: "session-1",
        sessionSetId: "set-1",
        expectedSessionRevision: 1,
        expectedAdvancedTimingRevision: 0,
        nowMs: 10_000,
        config: {
          version: 1,
          mode: "per_rep",
          intervalMs: 1_000,
          cueChannels: "haptic",
        },
      });
    });
    expect(result).toEqual(expect.objectContaining({ state: {
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    } }));

    expect(advanced.configureAdvancedTiming).not.toHaveBeenCalled();
    expect(advanced.startAdvancedTiming).not.toHaveBeenCalled();
    expect(advanced.listActiveTimingContexts).not.toHaveBeenCalled();
    expect(rest.listActiveSessionIds).not.toHaveBeenCalled();
    expect(lifecycle.trigger).not.toHaveBeenCalled();
    expect(notifications.requestPermission).not.toHaveBeenCalled();
  });

  it("returns zero cues for retired timing reconciliation", async () => {
    const repository = runtimeRepository([activeView, activeView], [activation]);
    const advanced = runtimeAdvancedTimingRepository();
    const rest = runtimeRestRepository();
    const lifecycle = runtimeLifecycle();
    const notifications = runtimeNotifications("undetermined");
    const running: AdvancedTimingStateV1 = {
      version: 1,
      state: "running",
      mode: "per_rep",
      revision: 3,
      targetSessionSetId: "set-1",
      cueChannels: "haptic",
      intervalMs: 1_000,
      startedAtMs: 10_000,
      nextBoundaryAtMs: 11_000,
      nextRepetitionIndex: 1,
    };
    advanced.reconcileAdvancedTiming.mockResolvedValue({
      state: {
        ...running,
        revision: 4,
        nextBoundaryAtMs: 21_000,
        nextRepetitionIndex: 11,
      },
      sessionRevision: 1,
      invalidationScopes: [
        ["active-workout", "session-1"],
        ["today"],
      ],
      cue: { repetitionIndex: 10, boundaryAtMs: 20_000 },
    });
    mockCueHaptic.mockRejectedValueOnce(new Error("haptics_unavailable"));
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;

    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createAdvancedTimingRepository: () => advanced,
          createRestRepository: () => rest,
          createLifecycle: () => lifecycle,
          createNotifications: () => notifications,
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

    let result: (AdvancedTimingCommandResult & Readonly<{
      cue: { repetitionIndex: number; boundaryAtMs: number } | null;
    }>) | undefined;
    await act(async () => {
      result = await captured!.reconcileAdvancedTiming({
        sessionId: "session-1",
        sessionSetId: "set-1",
        expectedSessionRevision: 1,
        expectedAdvancedTimingRevision: 3,
        nowMs: 20_050,
        foregroundSinceMs: 20_000,
      });
      await Promise.resolve();
    });
    expect(result).toEqual(expect.objectContaining({ cue: null }));

    expect(mockCueHaptic).not.toHaveBeenCalled();
    expect(rest.listActiveSessionIds).not.toHaveBeenCalled();
    expect(lifecycle.trigger).not.toHaveBeenCalled();
    expect(notifications.requestPermission).not.toHaveBeenCalled();
    expect(captured?.advancedTimingCueFailed).toBeUndefined();
  });

  it("does not play audio-only cues after TIM-01 retirement", async () => {
    const repository = runtimeRepository([activeView, activeView], [activation]);
    const advanced = runtimeAdvancedTimingRepository();
    const rest = runtimeRestRepository();
    const lifecycle = runtimeLifecycle();
    const notifications = runtimeNotifications("undetermined");
    const countdownCue = {
      playShortCue: jest.fn(async () => undefined),
      playLongCue: jest.fn(async () => undefined),
    };
    const running: AdvancedTimingStateV1 = {
      version: 1,
      state: "running",
      mode: "per_rep",
      revision: 3,
      targetSessionSetId: "set-1",
      cueChannels: "audio",
      intervalMs: 1_000,
      startedAtMs: 10_000,
      nextBoundaryAtMs: 11_000,
      nextRepetitionIndex: 1,
    };
    advanced.reconcileAdvancedTiming.mockResolvedValue({
      state: {
        ...running,
        revision: 4,
        nextBoundaryAtMs: 21_000,
        nextRepetitionIndex: 11,
      },
      sessionRevision: 1,
      invalidationScopes: [["active-workout", "session-1"], ["today"]],
      cue: { repetitionIndex: 10, boundaryAtMs: 20_000 },
    });
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;

    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createAdvancedTimingRepository: () => advanced,
          createRestRepository: () => rest,
          createLifecycle: () => lifecycle,
          createNotifications: () => notifications,
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

    await act(async () => {
      await captured!.reconcileAdvancedTiming({
        sessionId: "session-1",
        sessionSetId: "set-1",
        expectedSessionRevision: 1,
        expectedAdvancedTimingRevision: 3,
        nowMs: 20_050,
        foregroundSinceMs: 20_000,
        countdownCue,
      });
    });

    expect(countdownCue.playShortCue).not.toHaveBeenCalled();
    expect(countdownCue.playLongCue).not.toHaveBeenCalled();
    expect(mockCueHaptic).not.toHaveBeenCalled();
    expect(rest.listActiveSessionIds).not.toHaveBeenCalled();
    expect(lifecycle.trigger).not.toHaveBeenCalled();
    expect(notifications.requestPermission).not.toHaveBeenCalled();
  });

  it("does not dispatch cluster cues after TIM-01 retirement", async () => {
    const repository = runtimeRepository([activeView, activeView], [activation]);
    const advanced = runtimeAdvancedTimingRepository();
    const rest = runtimeRestRepository();
    const lifecycle = runtimeLifecycle();
    const notifications = runtimeNotifications("undetermined");
    const countdownCue = {
      playShortCue: jest.fn(async () => undefined),
      playLongCue: jest.fn(async () => undefined),
    };
    const clusterReady: AdvancedTimingStateV1 = {
      version: 1,
      state: "cluster_ready",
      mode: "cluster",
      revision: 4,
      targetSessionSetId: "set-1",
      cueChannels: "both",
      groupSizes: [3, 3, 3],
      intraRestMs: 20_000,
      currentGroupIndex: 1,
    };
    advanced.skipAdvancedTimingClusterGap.mockResolvedValue({
      state: clusterReady,
      sessionRevision: 1,
      invalidationScopes: [["active-workout", "session-1"], ["today"]],
    });
    mockCueHaptic.mockRejectedValueOnce(new Error("haptics_unavailable"));
    countdownCue.playLongCue.mockRejectedValueOnce(new Error("audio_unavailable"));
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;

    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createAdvancedTimingRepository: () => advanced,
          createRestRepository: () => rest,
          createLifecycle: () => lifecycle,
          createNotifications: () => notifications,
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

    await act(async () => {
      await captured!.skipAdvancedTimingClusterGap({
        sessionId: "session-1",
        sessionSetId: "set-1",
        expectedSessionRevision: 1,
        expectedAdvancedTimingRevision: 3,
        nowMs: 20_000,
        countdownCue,
      });
      await Promise.resolve();
    });

    expect(mockCueHaptic).not.toHaveBeenCalled();
    expect(countdownCue.playLongCue).not.toHaveBeenCalled();
    expect(countdownCue.playShortCue).not.toHaveBeenCalled();
    expect(rest.listActiveSessionIds).not.toHaveBeenCalled();
    expect(lifecycle.trigger).not.toHaveBeenCalled();
    expect(notifications.requestPermission).not.toHaveBeenCalled();
    expect(captured?.advancedTimingCueFailed).toBeUndefined();
  });

  it("does not reconcile legacy advanced timing on foreground", async () => {
    const repository = runtimeRepository([activeView, activeView], [activation]);
    const advanced = runtimeAdvancedTimingRepository();
    const rest = runtimeRestRepository();
    const lifecycle = runtimeLifecycle();
    const notifications = runtimeNotifications("undetermined");
    const running: AdvancedTimingStateV1 = {
      version: 1,
      state: "running",
      mode: "per_rep",
      revision: 3,
      targetSessionSetId: "set-1",
      cueChannels: "haptic",
      intervalMs: 1_000,
      startedAtMs: 10_000,
      nextBoundaryAtMs: 11_000,
      nextRepetitionIndex: 1,
    };
    jest.mocked(advanced.reconcileAdvancedTiming).mockResolvedValue({
      state: {
        ...running,
        revision: 4,
        nextBoundaryAtMs: 21_000,
        nextRepetitionIndex: 11,
      },
      sessionRevision: 1,
      invalidationScopes: [
        ["active-workout", "session-1"],
        ["today"],
      ],
      cue: null,
    });
    let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
    const addEventListener = jest.spyOn(AppState, "addEventListener")
      .mockImplementation((event, listener) => {
        if (event === "change") {
          onAppStateChange = listener;
        }
        return { remove: jest.fn() };
      });
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    try {
      await render(
        <RuntimeCaptureHarness
          dependencies={dependencies(repository, {
            createAdvancedTimingRepository: () => advanced,
            createRestRepository: () => rest,
            createLifecycle: () => lifecycle,
            createNotifications: () => notifications,
            nowMs: () => 20_050,
          })}
          onReady={(runtime) => {
            captured = runtime;
          }}
        />,
      );
      await waitFor(() => {
        expect(captured?.launchState).toBe("trusted");
      });
      advanced.listActiveTimingContexts.mockResolvedValue([{
        sessionId: "session-1",
        sessionRevision: 1,
        state: running,
      }]);
      jest.mocked(advanced.reconcileAdvancedTiming).mockClear();
      lifecycle.trigger.mockClear();

      await act(async () => {
        onAppStateChange?.("background");
        onAppStateChange?.("active");
        await Promise.resolve();
      });
      expect(advanced.reconcileAdvancedTiming).not.toHaveBeenCalled();
      expect(rest.listActiveSessionIds).not.toHaveBeenCalled();
      expect(lifecycle.trigger).not.toHaveBeenCalled();
      expect(notifications.requestPermission).not.toHaveBeenCalled();
    } finally {
      addEventListener.mockRestore();
    }
  });

  it("characterizes a queued foreground callback that resolves after unmount without touching timing or rest", async () => {
    const repository = runtimeRepository([activeView, activeView], [activation]);
    const advanced = runtimeAdvancedTimingRepository();
    const rest = runtimeRestRepository();
    type TimingContext = Readonly<{
      sessionId: string;
      sessionRevision: number;
      state: AdvancedTimingStateV1;
    }>;
    let resolveContexts: ((contexts: readonly TimingContext[]) => void) | undefined;
    const pendingContexts = new Promise<readonly TimingContext[]>((resolve) => {
      resolveContexts = resolve;
    });
    advanced.listActiveTimingContexts.mockReturnValueOnce(pendingContexts);
    const running: AdvancedTimingStateV1 = {
      version: 1,
      state: "running",
      mode: "per_rep",
      revision: 3,
      targetSessionSetId: "set-1",
      cueChannels: "haptic",
      intervalMs: 1_000,
      startedAtMs: 10_000,
      nextBoundaryAtMs: 11_000,
      nextRepetitionIndex: 1,
    };
    const subscription = { remove: jest.fn() };
    const addEventListener = jest.spyOn(AppState, "addEventListener")
      .mockImplementation(() => subscription);
    try {
      const rendered = await render(
        <RuntimeCaptureHarness
          dependencies={dependencies(repository, {
            createAdvancedTimingRepository: () => advanced,
            createRestRepository: () => rest,
            nowMs: () => 20_050,
          })}
          onReady={() => undefined}
        />,
      );
      await rendered.unmount();
      resolveContexts?.([{ sessionId: "session-1", sessionRevision: 1, state: running }]);
      await Promise.resolve();

      expect(subscription.remove).toHaveBeenCalledTimes(1);
      expect(advanced.reconcileAdvancedTiming).not.toHaveBeenCalled();
      expect(mockCueHaptic).not.toHaveBeenCalled();
      expect(rest.listActiveSessionIds).not.toHaveBeenCalled();
    } finally {
      addEventListener.mockRestore();
    }
  });

  it("does not replay any legacy timing contexts after foreground", async () => {
    const repository = runtimeRepository([activeView, activeView], [activation]);
    const advanced = runtimeAdvancedTimingRepository();
    const rest = runtimeRestRepository();
    const lifecycle = runtimeLifecycle();
    const notifications = runtimeNotifications("granted");
    const stopped: AdvancedTimingStateV1 = {
      version: 1,
      state: "stopped",
      mode: "per_rep",
      revision: 2,
      targetSessionSetId: "set-stopped",
      stoppedAtMs: 9_000,
      nextRepetitionIndex: 2,
    };
    const clusterGap: AdvancedTimingStateV1 = {
      version: 1,
      state: "cluster_gap_running",
      mode: "cluster",
      revision: 3,
      targetSessionSetId: "set-cluster",
      cueChannels: "haptic",
      groupSizes: [3, 3],
      intraRestMs: 20_000,
      currentGroupIndex: 0,
      gapStartedAtMs: 10_000,
      gapEndsAtMs: 30_000,
    };
    const running: AdvancedTimingStateV1 = {
      version: 1,
      state: "running",
      mode: "per_rep",
      revision: 4,
      targetSessionSetId: "set-running",
      cueChannels: "haptic",
      intervalMs: 1_000,
      startedAtMs: 10_000,
      nextBoundaryAtMs: 11_000,
      nextRepetitionIndex: 1,
    };
    advanced.listActiveTimingContexts.mockResolvedValue([
      { sessionId: "session-stopped", sessionRevision: 1, state: stopped },
      { sessionId: "session-cluster", sessionRevision: 2, state: clusterGap },
      { sessionId: "session-running", sessionRevision: 3, state: running },
    ]);
    jest.mocked(advanced.reconcileAdvancedTiming).mockImplementation(async (input) => ({
      state: input.sessionId === "session-cluster" ? clusterGap : running,
      sessionRevision: input.expectedSessionRevision,
      invalidationScopes: [["active-workout", input.sessionId], ["today"]],
      cue: null,
    }));
    let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
    const addEventListener = jest.spyOn(AppState, "addEventListener")
      .mockImplementation((event, listener) => {
        if (event === "change") onAppStateChange = listener;
        return { remove: jest.fn() };
      });
    try {
      await render(
        <RuntimeCaptureHarness
          dependencies={dependencies(repository, {
            createAdvancedTimingRepository: () => advanced,
            createRestRepository: () => rest,
            createLifecycle: () => lifecycle,
            createNotifications: () => notifications,
            nowMs: () => 20_050,
          })}
          onReady={() => undefined}
        />,
      );
      await waitFor(() => expect(onAppStateChange).toBeDefined());
      jest.mocked(advanced.reconcileAdvancedTiming).mockClear();

      await act(async () => {
        onAppStateChange?.("background");
        onAppStateChange?.("active");
        await Promise.resolve();
      });
      expect(advanced.reconcileAdvancedTiming).not.toHaveBeenCalled();
    } finally {
      addEventListener.mockRestore();
    }
  });

  */

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

  it("publishes a committed exercise add so the active route rereads its empty workout view", async () => {
    const repository = runtimeRepository([activeView, activeView], [activation]);
    const workoutRepository = runtimeActiveWorkoutRepository();
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

    await act(async () => {
      await captured!.addExercise({
        requestId: "add-runtime-exercise",
        requestSha256: "a".repeat(64),
        sessionId: "session-1",
        expectedSessionRevision: 1,
        occurredAtMs: 2_000,
        libraryExerciseId: "squat",
        sessionExerciseId: "added-exercise",
        setId: "added-set",
      });
    });

    expect(workoutRepository.addExercise).toHaveBeenCalledTimes(1);
    expect(captured.workoutRefreshGeneration).toBe(1);
  });

  it("delegates replace and remove exactly once, then returns only the authoritative overview refresh", async () => {
    const repository = runtimeRepository([activeView, activeView], [activation]);
    const workoutRepository = runtimeActiveWorkoutRepository();
    const events: string[] = [];
    const refreshedView: ActiveWorkoutView = {
      ...activeWorkoutView,
      revision: 4,
      currentExercise: {
        ...activeWorkoutView.currentExercise,
        id: "replacement-exercise",
        name: "Front Squat",
      },
      exercises: [{
        ...activeWorkoutView.exercises[0]!,
        id: "replacement-exercise",
        name: "Front Squat",
      }],
    };
    repository.getTodayView = jest.fn(async () => {
      events.push("trusted-read");
      return activeView;
    });
    workoutRepository.replaceExercise.mockImplementationOnce(async (input) => {
      events.push("replace");
      return {
        outcome: "committed",
        disposition: "deleted_provisional",
        sessionId: input.sessionId,
        sessionExerciseId: input.sessionExerciseId,
        replacementSessionExerciseId: input.replacementSessionExerciseId,
        replacementSetId: input.replacementSetId,
        sessionRevision: input.expectedSessionRevision + 1,
      };
    });
    workoutRepository.removeExercise.mockImplementationOnce(async (input) => {
      events.push("remove");
      return {
        outcome: "already_committed",
        disposition: "skipped_history_preserved",
        sessionId: input.sessionId,
        sessionExerciseId: input.sessionExerciseId,
        sessionRevision: input.expectedSessionRevision + 1,
      };
    });
    workoutRepository.getActiveWorkout
      .mockImplementationOnce(async () => {
        events.push("replace-active-read");
        return refreshedView;
      })
      .mockImplementationOnce(async () => {
        events.push("remove-active-read");
        return refreshedView;
      });
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

    events.splice(0);
    const replaceInput = {
      requestId: "replace-runtime",
      requestSha256: "e".repeat(64),
      sessionId: "session-1",
      expectedSessionRevision: 1,
      sessionExerciseId: "exercise-1",
      expectedSessionExerciseRevision: 1,
      occurredAtMs: 2_000,
      libraryExerciseId: "front-squat",
      replacementSessionExerciseId: "replacement-exercise",
      replacementSetId: "replacement-set",
    };
    let replaced: Awaited<ReturnType<typeof captured.replaceExercise>>;
    await act(async () => {
      replaced = await captured!.replaceExercise(replaceInput);
    });
    expect(replaced!).toBe(refreshedView);
    expect(workoutRepository.replaceExercise).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      "replace",
      "replace-active-read",
      "trusted-read",
    ]);

    events.splice(0);
    const removeInput = {
      requestId: "remove-runtime",
      requestSha256: "f".repeat(64),
      sessionId: "session-1",
      expectedSessionRevision: 4,
      sessionExerciseId: "replacement-exercise",
      expectedSessionExerciseRevision: 2,
      occurredAtMs: 2_001,
    };
    let removed: Awaited<ReturnType<typeof captured.removeExercise>>;
    await act(async () => {
      removed = await captured!.removeExercise(removeInput);
    });
    expect(removed!).toBe(refreshedView);
    expect(workoutRepository.removeExercise).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      "remove",
      "remove-active-read",
      "trusted-read",
    ]);
  });

  it("delegates reorder once, then returns only the authoritative reordered overview", async () => {
    const repository = runtimeRepository([activeView], [activation]);
    const workoutRepository = runtimeActiveWorkoutRepository();
    const events: string[] = [];
    const reorderedView: ActiveWorkoutView = {
      ...activeWorkoutView,
      revision: 2,
      exercises: [activeWorkoutView.currentExercise],
    };
    repository.getTodayView = jest.fn(async () => {
      events.push("trusted-read");
      return activeView;
    });
    workoutRepository.reorderExercises.mockImplementationOnce(async (input) => {
      events.push("reorder");
      return {
        outcome: "committed",
        sessionId: input.sessionId,
        orderedSessionExerciseIds: input.orderedSessionExerciseIds,
        sessionRevision: input.expectedSessionRevision + 1,
      };
    });
    workoutRepository.getActiveWorkout.mockImplementationOnce(async () => {
      events.push("reorder-active-read");
      return reorderedView;
    });
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

    events.splice(0);
    const input = {
      requestId: "reorder-runtime",
      requestSha256: "a".repeat(64),
      sessionId: "session-1",
      expectedSessionRevision: 1,
      occurredAtMs: 2_000,
      orderedSessionExerciseIds: ["exercise-1"],
      expectedSessionExerciseRevisions: [{
        sessionExerciseId: "exercise-1",
        revision: 1,
      }],
    };
    let reordered: Awaited<ReturnType<typeof captured.reorderExercises>>;
    await act(async () => {
      reordered = await captured!.reorderExercises(input);
    });
    expect(reordered!).toBe(reorderedView);
    expect(workoutRepository.reorderExercises).toHaveBeenCalledWith(input);
    expect(events).toEqual([
      "reorder",
      "reorder-active-read",
      "trusted-read",
    ]);
  });

  it("keeps a committed exercise edit distinct when its authoritative refresh fails", async () => {
    const repository = runtimeRepository([activeView], [activation]);
    const workoutRepository = runtimeActiveWorkoutRepository();
    workoutRepository.getActiveWorkout.mockRejectedValueOnce(
      new Error("active_workout_read_failed"),
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

    let result: Awaited<ReturnType<typeof captured.removeExercise>>;
    await act(async () => {
      result = await captured!.removeExercise({
        requestId: "remove-runtime-refresh-failure",
        requestSha256: "a".repeat(64),
        sessionId: "session-1",
        expectedSessionRevision: 1,
        sessionExerciseId: "exercise-1",
        expectedSessionExerciseRevision: 1,
        occurredAtMs: 2_000,
      });
    });

    expect(result!).toEqual({
      outcome: "committed_refresh_failed",
      sessionId: "session-1",
      sessionExerciseId: "exercise-1",
      sessionRevision: 2,
    });
    expect(workoutRepository.removeExercise).toHaveBeenCalledTimes(1);
    expect(captured.mutationFailure).toBeUndefined();
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

  it("returns the committed active view only after the removal, active read, and trusted refresh", async () => {
    const repository = runtimeRepository([activeView, activeView], [activation]);
    const lifecycle = runtimeLifecycle();
    const events: string[] = [];
    repository.getTodayView = jest.fn(async () => {
      events.push("trusted-read");
      return activeView;
    });
    const workoutRepository = runtimeActiveWorkoutRepository();
    const refreshedActiveView: ActiveWorkoutView = {
      ...activeWorkoutView,
      revision: 2,
      currentExercise: {
        ...activeWorkoutView.currentExercise,
        warmups: [],
      },
      exercises: [{
        ...activeWorkoutView.exercises[0]!,
        warmups: [],
      }],
    };
    workoutRepository.removeWarmup.mockImplementationOnce(async (input) => {
      events.push("remove-warmup");
      return {
        outcome: "committed",
        sessionId: input.sessionId,
        setId: input.setId,
        sessionRevision: input.expectedSessionRevision + 1,
      };
    });
    workoutRepository.getActiveWorkout.mockImplementationOnce(async () => {
      events.push("active-read");
      return refreshedActiveView;
    });
    const conflict = new WorkoutCommandConflictError("remove_set_conflict");
    workoutRepository.removeWorkingSet.mockImplementationOnce(async () => {
      events.push("remove-working");
      throw conflict;
    });
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createWorkoutRepository: () => workoutRepository,
          createLifecycle: () => lifecycle,
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

    events.splice(0);
    const warmupInput = {
      requestId: "remove-runtime-warmup",
      requestSha256: "a".repeat(64),
      sessionId: "session-1",
      setId: "warmup-1",
      expectedSessionRevision: 1,
      expectedSetRevision: 1,
      removedAtMs: 2_000,
    };
    let removed: Awaited<ReturnType<typeof captured.removeWarmup>>;
    await act(async () => {
      removed = await captured!.removeWarmup(warmupInput);
    });
    expect(removed!).toBe(refreshedActiveView);
    expect(workoutRepository.removeWarmup).toHaveBeenCalledWith(warmupInput);
    expect(workoutRepository.getActiveWorkout).toHaveBeenCalledWith("session-1");
    expect(events).toEqual(["remove-warmup", "active-read", "trusted-read"]);
    expect(captured.workoutRefreshGeneration).toBe(2);
    await waitFor(() => {
      expect(lifecycle.trigger).toHaveBeenCalledWith("post_commit", {});
    });

    events.splice(0);
    const workingInput = {
      requestId: "remove-runtime-working",
      requestSha256: "b".repeat(64),
      sessionId: "session-1",
      setId: "set-1",
      expectedSessionRevision: 2,
      expectedSetRevision: 1,
      removedAtMs: 2_001,
    };
    let rejected: unknown;
    await act(async () => {
      try {
        await captured!.removeWorkingSet(workingInput);
      } catch (error) {
        rejected = error;
      }
    });
    expect(rejected).toBe(conflict);
    expect(workoutRepository.removeWorkingSet).toHaveBeenCalledWith(workingInput);
    expect(events).toEqual(["remove-working"]);
    expect(captured.workoutRefreshGeneration).toBe(2);
    expect(captured.mutationFailure).toEqual({
      kind: "conflict",
      code: "remove_set_conflict",
      retryable: false,
      correlationCode: "GT-ACTION01",
    });
  });

  it("preserves a committed removal when its authoritative refresh fails", async () => {
    const repository = runtimeRepository([activeView], [activation]);
    const workoutRepository = runtimeActiveWorkoutRepository();
    const refreshFailure = new Error("active_workout_read_failed");
    workoutRepository.getActiveWorkout.mockRejectedValueOnce(refreshFailure);
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

    const input = {
      requestId: "remove-runtime-refresh-failure",
      requestSha256: "c".repeat(64),
      sessionId: "session-1",
      setId: "set-1",
      expectedSessionRevision: 1,
      expectedSetRevision: 1,
      removedAtMs: 2_002,
    };
    let result: Awaited<ReturnType<typeof captured.removeWorkingSet>>;
    await act(async () => {
      result = await captured!.removeWorkingSet(input);
    });

    expect(result!).toEqual({
      outcome: "committed_refresh_failed",
      sessionId: "session-1",
      setId: "set-1",
      sessionRevision: 2,
    });
    expect(workoutRepository.removeWorkingSet).toHaveBeenCalledTimes(1);
    expect(workoutRepository.getActiveWorkout).toHaveBeenCalledWith("session-1");
    expect(repository.getTodayView).toHaveBeenCalledTimes(1);
    expect(captured.mutationFailure).toBeUndefined();
  });

  it("preserves a committed removal when the trusted global refresh fails", async () => {
    const repository = runtimeRepository([activeView], [activation]);
    const workoutRepository = runtimeActiveWorkoutRepository();
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
    repository.getTodayView.mockRejectedValueOnce(
      new Error("trusted_global_read_failed"),
    );

    const input = {
      requestId: "remove-runtime-trusted-refresh-failure",
      requestSha256: "d".repeat(64),
      sessionId: "session-1",
      setId: "set-1",
      expectedSessionRevision: 1,
      expectedSetRevision: 1,
      removedAtMs: 2_003,
    };
    let result: Awaited<ReturnType<typeof captured.removeWorkingSet>>;
    await act(async () => {
      result = await captured!.removeWorkingSet(input);
    });

    expect(result!).toEqual({
      outcome: "committed_refresh_failed",
      sessionId: "session-1",
      setId: "set-1",
      sessionRevision: 2,
    });
    expect(workoutRepository.removeWorkingSet).toHaveBeenCalledTimes(1);
    expect(workoutRepository.getActiveWorkout).toHaveBeenCalledWith("session-1");
    expect(captured.mutationFailure).toBeUndefined();
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

  it("projects authoritative Library, starter, filter, and activation-preview facts", async () => {
    const prettyBytes = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
    const catalog = await createStarterPlanRuntimeCatalog({
      starterPackBytes: prettyBytes(starterPlansAsset),
      acceptanceBytes: prettyBytes(starterPlansAcceptanceAsset),
      sha256: async (value) => createHash("sha256").update(value).digest("hex"),
    });
    const template = catalog.templates.find(({ id }) => id === "full-body-foundation")!;
    let templateUpdateMode: "current" | "outdated" | "legacy" = "current";
    const queryAll = jest.fn(async (sql: string) => {
      if (sql.includes("FROM app_settings")) {
        return sql.includes("revision")
          ? [{ value_version: 1, value_json: JSON.stringify({ section: "exercises" }), revision: 2 }]
          : [];
      }
      if (sql.includes("FROM taxonomy_terms")) return [
        { kind: "exercise_type", slug: "strength" },
        { kind: "muscle", slug: "legs" },
        { kind: "equipment", slug: "barbell" },
      ];
      if (sql.includes("FROM owned_plan_starter_sources source")
        && sql.includes("accepted.template_json")) {
        if (templateUpdateMode === "legacy") return [];
        return [{
          owned_plan_name: "Current starter copy",
          owned_plan_revision: 5,
          source_revision: templateUpdateMode === "current" ? template.revision : 1,
          template_json: template.sourceJson,
          active_schedule_revision: null,
        }];
      }
      if (sql.includes("FROM owned_plan_starter_sources source")) return [{
        plan_id: "starter-copy",
        plan_name: "Starter copy",
        plan_revision: 3,
        schedule_lifecycle: "inactive",
        schedule_revision: 4,
        schedule_version_id: "starter-version",
        schedule_mode: "weekday",
      }];
      if (sql.includes("FROM owned_plan_schedule_bindings binding")) return [
        { ordinal: 0, weekday: "Monday", day_name: "Full Body A" },
        { ordinal: 1, weekday: "Wednesday", day_name: "Full Body B" },
      ];
      if (sql.includes("FROM owned_plan_schedules") && sql.includes("plan_kind = 'strength'")) {
        return [{ revision: 7 }];
      }
      if (sql.includes("FROM workout_sessions") && sql.includes("status = 'in_progress'")) {
        return [{ id: "active-session", revision: 2 }];
      }
      if (sql.includes("plan.origin = 'copied'")) return [{
        owned_plan_name: "Legacy starter copy",
        owned_plan_revision: 1,
        active_schedule_revision: null,
      }];
      if (sql.includes("FROM plans plan") && sql.includes("plan.origin IN")) return [
        { id: "active-strength", name: "Active Strength", days_per_week: 3, is_active: 1, lifecycle: "active", missing_requirement: null, schedule_lifecycle: "active", legacy_schedule_id: null, source_namespace: null, upstream_id: null, source_revision: null, plan_kind: "strength" },
        { id: "archived-running", name: "Archived Running", days_per_week: 2, is_active: 0, lifecycle: "archived", missing_requirement: null, schedule_lifecycle: "inactive", legacy_schedule_id: null, source_namespace: null, upstream_id: null, source_revision: null, plan_kind: "running" },
        { id: "draft-strength", name: "Draft Strength", days_per_week: 2, is_active: 0, lifecycle: "draft", missing_requirement: "schedule", schedule_lifecycle: null, legacy_schedule_id: null, source_namespace: null, upstream_id: null, source_revision: null, plan_kind: "strength" },
        { id: "active-running", name: "Legacy Running", days_per_week: 1, is_active: 1, lifecycle: "inactive", missing_requirement: null, schedule_lifecycle: null, legacy_schedule_id: "legacy-running", source_namespace: null, upstream_id: null, source_revision: null, plan_kind: "running" },
        { id: "inactive-strength", name: "Inactive Strength", days_per_week: 1, is_active: 0, lifecycle: "inactive", missing_requirement: null, schedule_lifecycle: null, legacy_schedule_id: null, source_namespace: "gym-tracker.original", upstream_id: template.id, source_revision: 1, plan_kind: "strength" },
      ];
      return [];
    });
    const kernel = {
      close: jest.fn(async () => undefined),
      queryAll,
      readSnapshot: jest.fn(async (read: (transaction: Pick<SqliteTransactionExecutor, "queryAll">) => Promise<unknown>) => read({ queryAll: queryAll as never })),
      write: jest.fn(async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) => command({
        execute: jest.fn(async () => ({ changes: 1, lastInsertRowId: 0 })),
        queryAll: queryAll as never,
      })),
    } as unknown as SqliteKernel;
    const repository = runtimeRepository([noPlanView], [null]);
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          loadStarterPlans: async () => catalog,
          openKernel: jest.fn(async () => kernel),
        })}
        onReady={(runtime) => { captured = runtime; }}
      />,
    );
    await waitFor(() => expect(captured?.launchState).toBe("trusted"));
    if (captured === undefined) throw new Error("runtime_not_captured");

    const library = await captured.loadLibrary();
    expect(library.sectionPreference).toEqual({ section: "exercises", revision: 2 });
    expect(library.plans.activePlans.map(({ id }) => id)).toEqual(["active-strength", "active-running"]);
    expect(library.plans.owned.map(({ status }) => status)).toEqual(["Active", "Archived", "Draft", "Active", "Inactive"]);
    expect(library.exerciseFilterOptions).toEqual({ exerciseTypes: ["strength"], muscles: ["legs"], equipment: ["barbell"] });
    await expect(captured.retryLibraryLoad()).resolves.toEqual(library);
    await expect(captured.loadStarterPlan(template.id)).resolves.toBe(template);
    await expect(captured.loadStarterPlan("missing-template")).resolves.toBeNull();
    await expect(captured.loadStarterActivationPreview(template.id)).resolves.toMatchObject({
      activeScheduleRevision: 7,
      activeWorkout: { sessionId: "active-session", sessionRevision: 2 },
      copies: [{ planId: "starter-copy", state: "Inactive", scheduleSummary: "Weekday · Monday Full Body A, Wednesday Full Body B" }],
    });
    await expect(captured.loadStarterActivationPreview("missing-template")).resolves.toBeNull();
    await expect(captured.loadStarterTemplateUpdate({ ownedPlanId: "starter-copy", templateId: template.id })).resolves.toBeNull();
    templateUpdateMode = "outdated";
    const outdatedPreview = await captured.loadStarterTemplateUpdate({ ownedPlanId: "starter-copy", templateId: template.id });
    expect(outdatedPreview).toMatchObject({
      ownedPlanId: "starter-copy",
      ownedPlanName: "Current starter copy",
      template: { id: template.id, revision: template.revision },
    });
    templateUpdateMode = "legacy";
    await expect(captured.loadStarterTemplateUpdate({ ownedPlanId: "legacy-copy", templateId: template.id })).resolves.toMatchObject({
      ownedPlanId: "legacy-copy",
      ownedPlanName: "Legacy starter copy",
      ownedPlanRevision: 1,
    });
    await expect(captured.loadStarterTemplateUpdate({ ownedPlanId: "legacy-copy", templateId: "missing-template" })).resolves.toBeNull();

    mockedActivateStarterPlan.mockResolvedValueOnce({ plan: { id: "activated-starter" } } as never);
    mockedCreateStarterPlanCopy
      .mockResolvedValueOnce({ plan: { id: "editable-weekday-copy" } } as never)
      .mockResolvedValueOnce({ plan: { id: "editable-rotation-copy" } } as never)
      .mockResolvedValueOnce({ plan: { id: "template-update-copy" } } as never);
    await expect(captured.activateAcceptedStarterPlan({
      templateId: template.id,
      startLocalDate: "2026-08-17",
      timeZone: "Asia/Singapore",
      mode: "weekday",
      bindings: [{ planDaySourceId: "full-body-a", ordinal: 0, weekIndex: 0, weekday: "Monday" }],
      copyChoice: null,
      expectedActiveScheduleRevision: 7,
    })).resolves.toMatchObject({ plan: { id: "activated-starter" } });
    await expect(captured.createStarterEditableCopy(template.id)).resolves.toBe("editable-weekday-copy");
    await expect(captured.createStarterEditableCopy("push-pull-legs")).resolves.toBe("editable-rotation-copy");
    await expect(captured.createStarterTemplateUpdateCopy(outdatedPreview!)).resolves.toBe("template-update-copy");
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
    recoveryBackupMock.createExpoRecoveryBackupPort.mockClear();
    expoSqliteMock.openDatabaseAsync.mockReset();
    let userVersion = 10;
    const createdTableNames = new Set<string>();
    const execute = jest.fn(async (sql: string, _parameters?: readonly unknown[]) => {
      const createdTableName = /^CREATE TABLE\s+([a-z0-9_]+)/iu.exec(
        sql.trim(),
      )?.[1];
      if (createdTableName !== undefined) {
        createdTableNames.add(createdTableName);
      }
      const appliedVersion = /^PRAGMA user_version = (\d+)$/u.exec(
        sql.trim(),
      )?.[1];
      if (appliedVersion !== undefined) {
        userVersion = Number(appliedVersion);
      }
      return {
        changes: 0,
        lastInsertRowId: 0,
      };
    });
    const queryAllMock = jest.fn(async (
      sql: string,
      parameters: readonly unknown[] = [],
    ) => {
      if (sql === "PRAGMA user_version") {
        return [{ user_version: userVersion }];
      }
      if (sql === "PRAGMA table_info(workout_remove_receipts)") {
        return [
          { name: "request_id", type: "TEXT", notnull: 1, pk: 1 },
          { name: "request_sha256", type: "TEXT", notnull: 1, pk: 0 },
          { name: "operation", type: "TEXT", notnull: 1, pk: 0 },
          { name: "session_id", type: "TEXT", notnull: 1, pk: 0 },
          { name: "set_id", type: "TEXT", notnull: 1, pk: 0 },
          { name: "expected_session_revision", type: "INTEGER", notnull: 1, pk: 0 },
          { name: "expected_set_revision", type: "INTEGER", notnull: 1, pk: 0 },
          { name: "result_session_revision", type: "INTEGER", notnull: 1, pk: 0 },
          { name: "result_json", type: "TEXT", notnull: 1, pk: 0 },
          { name: "committed_at_ms", type: "INTEGER", notnull: 1, pk: 0 },
        ];
      }
      if (sql === "PRAGMA foreign_key_list(workout_remove_receipts)") {
        return [];
      }
      if (sql.includes("workout_remove_receipts_immutable_update")) {
        const receiptSchema = execute.mock.calls.some(([statement]) => (
          typeof statement === "string"
          && statement.includes(
            "ALTER TABLE workout_remove_receipts RENAME TO workout_remove_receipts_v17",
          )
        ))
          ? WORKOUT_REMOVE_RECEIPT_ENTITY_ID_SCHEMA_STATEMENTS
          : WORKOUT_REMOVE_RECEIPT_SCHEMA_STATEMENTS;
        return [
          {
            type: "table",
            name: "workout_remove_receipts",
            sql: receiptSchema[0],
          },
          {
            type: "trigger",
            name: "workout_remove_receipts_immutable_update",
            sql: receiptSchema[1],
          },
          {
            type: "trigger",
            name: "workout_remove_receipts_immutable_delete",
            sql: receiptSchema[2],
          },
        ];
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
        return [
          { name: "creation_timezone_offset_minutes", notnull: 1 },
          { name: "modified_from_plan", notnull: 1 },
          { name: "portable_id", notnull: 0 },
          { name: "merge_modified_at_ms", notnull: 0 },
        ];
      }
      if ([
        "PRAGMA table_info(plan_day_exercises)",
        "PRAGMA table_info(owned_plan_day_exercises)",
      ].includes(sql)) {
        return [{ name: "advanced_timing_default_json", notnull: 1 }];
      }
      if ([
        "PRAGMA table_info(plan_warmup_sets)",
        "PRAGMA table_info(plan_working_set_targets)",
        "PRAGMA table_info(owned_plan_warmup_sets)",
        "PRAGMA table_info(owned_plan_working_set_targets)",
      ].includes(sql)) {
        return [{ name: "advanced_timing_override_json", notnull: 0 }];
      }
      if (sql === "PRAGMA table_info(session_exercises)") {
        return [
          { name: "origin", notnull: 1 },
          { name: "display_ordinal", notnull: 1 },
          { name: "advanced_timing_default_json", notnull: 1 },
          { name: "default_rest_seconds_is_override", notnull: 1 },
        ];
      }
      if (sql === "PRAGMA table_info(running_session_slots)") {
        return [{ name: "retired_at_ms", notnull: 0 }];
      }
      if (parameters.includes("workout_session_exercise_rest_default_receipts")) {
        return [{ name: "workout_session_exercise_rest_default_receipts" }];
      }
      if (sql === "PRAGMA table_info(session_sets)") {
        return [
          { name: "advanced_timing_override_json", notnull: 0 },
          { name: "advanced_timing_resolved_json", notnull: 1 },
        ];
      }
      if (sql === "PRAGMA table_info(exercises)" || sql === "PRAGMA table_info(plans)") {
        return [{ name: "portable_id" }];
      }
      if (sql === "SELECT id, owner_namespace FROM portable_owner_identity") {
        return [{ id: 1, owner_namespace: "0123456789abcdef0123456789abcdef" }];
      }
      if (sql === "SELECT id, mutation_generation, backed_up_generation FROM automatic_backup_state") {
        return [{ id: 1, mutation_generation: 0, backed_up_generation: 0 }];
      }
      if (sql === "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'automatic_backup_generation_%'") {
        return AUTOMATIC_BACKUP_GENERATION_TRIGGER_STATEMENTS.map((_, index) => ({ name: `automatic_backup_generation_${index}` }));
      }
      if (sql === "SELECT id, environment FROM automatic_backup_receipt_state") {
        return [{ id: 1, environment: "production" }];
      }
      if (sql === "SELECT deletion_progress, authority_state FROM automatic_backup_state WHERE id = 1") {
        return [{ deletion_progress: "none", authority_state: "quarantine" }];
      }
      if (sql === "SELECT account_display_label FROM automatic_backup_state WHERE id = 1") {
        return [{ account_display_label: null }];
      }
      const phase18MigrationTableNames = [
        "imported_activity_revision_proposals",
        "imported_activity_revision_decisions",
        "garmin_sync_summary",
      ].filter((name) => sql.includes(`'${name}'`));
      if (phase18MigrationTableNames.length > 0) {
        return phase18MigrationTableNames
          .filter((name) => createdTableNames.has(name))
          .map((name) => ({ name }));
      }
      if (sql.startsWith("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (")) {
        return parameters.map((name) => ({ name }));
      }
      if (sql === "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?") {
        return parameters.map((name) => ({ name }));
      }
      if (sql.includes("FROM sqlite_master WHERE type = 'trigger' AND name = ?")) {
        return parameters.map((name) => ({ name }));
      }
      if (sql === "SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('one_active_owned_plan_per_sport', 'one_active_owned_schedule_per_sport')") {
        return [
          { name: "one_active_owned_plan_per_sport" },
          { name: "one_active_owned_schedule_per_sport" },
        ];
      }
      if (sql.includes("portable_id IS NULL")) {
        return [{ count: 0 }];
      }
      if (sql.includes("portable_owner_identity_immutable")) {
        const triggerNames = [
          "portable_owner_identity_immutable",
          "portable_owner_identity_no_delete",
          "exercises_portable_id_insert_valid",
          "exercises_portable_id_allocate",
          "exercises_portable_id_allocate_on_origin",
          "plans_portable_id_insert_valid",
          "plans_portable_id_allocate",
          "plans_portable_id_allocate_on_origin",
          "workout_sessions_portable_identity_insert_valid",
          "workout_sessions_portable_identity_allocate",
          "exercises_portable_id_valid",
          "plans_portable_id_valid",
          "workout_sessions_portable_id_valid",
          "exercises_portable_id_immutable",
          "plans_portable_id_immutable",
          "workout_sessions_portable_id_immutable",
          "workout_sessions_portable_merge_freshness",
        ];
        return [
          { type: "index", name: "exercises_portable_id_unique", sql: "" },
          { type: "index", name: "plans_portable_id_unique", sql: "" },
          { type: "index", name: "workout_sessions_portable_id_unique", sql: "" },
          { type: "index", name: "workout_sessions_portable_merge_freshness_idx", sql: "" },
          ...triggerNames.map((name, index) => ({
            type: "trigger",
            name,
            sql: PORTABLE_OWNER_IDENTITIES_TRIGGER_STATEMENTS[index],
          })),
        ];
      }
      if (sql === "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_advanced_timing_states'") {
        return [{ name: "session_advanced_timing_states" }];
      }
      if (sql === "PRAGMA foreign_key_list(session_advanced_timing_states)") {
        return [{ table: "workout_sessions" }, { table: "session_sets" }];
      }
      if (sql === "PRAGMA index_list(session_advanced_timing_states)") {
        return [{ name: "session_advanced_timing_states_target_idx" }];
      }
      if (sql.includes("WHERE type = 'trigger' AND name IN (?, ?)")) {
        return [
          { name: "session_advanced_timing_states_target_session_insert" },
          { name: "session_advanced_timing_states_target_session_update" },
        ];
      }
      if (sql.includes("creation_timezone_offset_minutes IS NULL")) {
        return [];
      }
      if (sql === "PRAGMA index_list(session_exercises)") {
        return [
          { name: "exercise_history" },
          { name: "session_exercises_session_display_ordinal_idx" },
        ];
      }
      if (sql === "PRAGMA foreign_key_list(workout_session_exercise_edit_receipts)") {
        return execute.mock.calls.some(([statement]) => (
          typeof statement === "string"
          && statement.includes(
            "ALTER TABLE workout_session_exercise_edit_receipts RENAME TO workout_session_exercise_edit_receipts_v19",
          )
        ))
          ? [{ table: "workout_sessions" }]
          : [{ table: "workout_sessions" }, { table: "session_exercises" }];
      }
      if (sql === "PRAGMA index_list(workout_session_exercise_edit_receipts)") {
        return [{ name: "workout_session_exercise_edit_receipts_session_committed_request_idx" }];
      }
      if (sql === "PRAGMA table_info(workout_session_exercise_edit_receipts)") {
        return execute.mock.calls.some(([statement]) => (
          typeof statement === "string"
          && statement.includes(
            "ALTER TABLE workout_session_exercise_edit_receipts RENAME TO workout_session_exercise_edit_receipts_v19",
          )
        )) ? [
          { name: "request_id", type: "TEXT", notnull: 1, pk: 1 },
          { name: "request_sha256", type: "TEXT", notnull: 1, pk: 0 },
          { name: "operation", type: "TEXT", notnull: 1, pk: 0 },
          { name: "session_id", type: "TEXT", notnull: 1, pk: 0 },
          { name: "subject_session_exercise_id", type: "TEXT", notnull: 1, pk: 0 },
          { name: "replacement_session_exercise_id", type: "TEXT", notnull: 0, pk: 0 },
          { name: "expected_session_revision", type: "INTEGER", notnull: 1, pk: 0 },
          { name: "result_session_revision", type: "INTEGER", notnull: 1, pk: 0 },
          { name: "result_json", type: "TEXT", notnull: 1, pk: 0 },
          { name: "committed_at_ms", type: "INTEGER", notnull: 1, pk: 0 },
        ] : [
          { name: "request_id", type: "TEXT", notnull: 1, pk: 1 },
          { name: "request_sha256", type: "TEXT", notnull: 1, pk: 0 },
          { name: "operation", type: "TEXT", notnull: 1, pk: 0 },
          { name: "session_id", type: "TEXT", notnull: 1, pk: 0 },
          { name: "session_exercise_id", type: "TEXT", notnull: 1, pk: 0 },
          { name: "expected_session_revision", type: "INTEGER", notnull: 1, pk: 0 },
          { name: "result_session_revision", type: "INTEGER", notnull: 1, pk: 0 },
          { name: "result_json", type: "TEXT", notnull: 1, pk: 0 },
          { name: "committed_at_ms", type: "INTEGER", notnull: 1, pk: 0 },
        ];
      }
      if (sql === "PRAGMA table_info(workout_session_exercise_reorder_receipts)") {
        return [
          { name: "request_id", type: "TEXT", notnull: 1, pk: 1 },
          { name: "request_sha256", type: "TEXT", notnull: 1, pk: 0 },
          { name: "operation", type: "TEXT", notnull: 1, pk: 0 },
          { name: "session_id", type: "TEXT", notnull: 1, pk: 0 },
          { name: "ordered_session_exercise_ids_json", type: "TEXT", notnull: 1, pk: 0 },
          { name: "expected_session_revision", type: "INTEGER", notnull: 1, pk: 0 },
          { name: "result_session_revision", type: "INTEGER", notnull: 1, pk: 0 },
          { name: "result_json", type: "TEXT", notnull: 1, pk: 0 },
          { name: "committed_at_ms", type: "INTEGER", notnull: 1, pk: 0 },
        ];
      }
      if (sql === "PRAGMA foreign_key_list(workout_session_exercise_reorder_receipts)") {
        return [{ table: "workout_sessions" }];
      }
      if (sql === "PRAGMA index_list(workout_session_exercise_reorder_receipts)") {
        return [{ name: "workout_session_exercise_reorder_receipts_session_committed_request_idx" }];
      }
      if (sql.includes("workout_session_exercise_edit_receipts_immutable_update")) {
        const receiptSchema = execute.mock.calls.some(([statement]) => (
          typeof statement === "string"
          && statement.includes(
            "ALTER TABLE workout_session_exercise_edit_receipts RENAME TO workout_session_exercise_edit_receipts_v19",
          )
        ))
          ? SESSION_EXERCISE_EDIT_RECEIPT_SCHEMA_STATEMENTS
          : SESSION_EXERCISE_EDITING_SCHEMA_STATEMENTS;
        return receiptSchema === SESSION_EXERCISE_EDITING_SCHEMA_STATEMENTS ? [
          {
            type: "table",
            name: "workout_session_exercise_edit_receipts",
            sql: receiptSchema[5],
          },
          {
            type: "trigger",
            name: "workout_session_exercise_edit_receipts_immutable_update",
            sql: receiptSchema[6],
          },
          {
            type: "trigger",
            name: "workout_session_exercise_edit_receipts_immutable_delete",
            sql: receiptSchema[7],
          },
        ] : [
          {
            type: "table",
            name: "workout_session_exercise_edit_receipts",
            sql: receiptSchema[0],
          },
          {
            type: "trigger",
            name: "workout_session_exercise_edit_receipts_immutable_update",
            sql: receiptSchema[2],
          },
          {
            type: "trigger",
            name: "workout_session_exercise_edit_receipts_immutable_delete",
            sql: receiptSchema[3],
          },
          {
            type: "table",
            name: "workout_session_exercise_reorder_receipts",
            sql: SESSION_EXERCISE_REORDER_RECEIPT_SCHEMA_STATEMENTS[0],
          },
          {
            type: "trigger",
            name: "workout_session_exercise_reorder_receipts_immutable_update",
            sql: SESSION_EXERCISE_REORDER_RECEIPT_SCHEMA_STATEMENTS[2],
          },
          {
            type: "trigger",
            name: "workout_session_exercise_reorder_receipts_immutable_delete",
            sql: SESSION_EXERCISE_REORDER_RECEIPT_SCHEMA_STATEMENTS[3],
          },
        ];
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
      async queryAll<Row extends Record<string, unknown>>(
        sql: string,
        parameters: readonly unknown[] = [],
      ) {
        return await queryAllMock(sql, parameters) as unknown as Row[];
      },
    };
    const kernel = {
      write: jest.fn(async (command: (
        transaction: SqliteTransactionExecutor,
      ) => Promise<unknown>) => command(transaction)),
      async queryAll<Row extends Record<string, unknown>>(
        sql: string,
        parameters: readonly unknown[] = [],
      ) {
        return await queryAllMock(sql, parameters) as unknown as Row[];
      },
      close: jest.fn(async () => undefined),
    } as unknown as SqliteKernel;

    await expect(
      productionWorkoutAppRuntimeDependencies.migrate(kernel),
    ).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("CREATE TABLE imported_activity_revision_proposals"),
      [],
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("CREATE TABLE imported_activity_revision_decisions"),
      [],
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("CREATE TABLE garmin_sync_summary"),
      [],
    );
    expect(queryAllMock).toHaveBeenCalledWith(
      expect.stringContaining("imported_activity_revision_proposals"),
      [],
    );
    expect(queryAllMock).toHaveBeenCalledWith(
      expect.stringContaining("garmin_sync_summary"),
      [],
    );
    expect(execute).toHaveBeenCalledWith("PRAGMA user_version = 43");
    expect(execute).toHaveBeenCalledWith(
      `PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`,
    );
    expect(userVersion).toBe(CURRENT_SCHEMA_VERSION);
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
    const recoveryOptions = recoveryBackupMock.createExpoRecoveryBackupPort
      .mock.calls[0]?.[0];
    if (recoveryOptions === undefined) {
      throw new Error("recovery_backup_port_not_created");
    }
    const source = { closeAsync: jest.fn(async () => undefined) };
    const destination = { closeAsync: jest.fn(async () => undefined) };
    expoSqliteMock.openDatabaseAsync
      .mockResolvedValueOnce(source as never)
      .mockResolvedValueOnce(destination as never);
    await recoveryOptions.openSource("recovery-source.db");
    await recoveryOptions.openDestination("recovery-destination.db");
    expect(expoSqliteMock.openDatabaseAsync).toHaveBeenNthCalledWith(
      1,
      "recovery-source.db",
      {
        useNewConnection: true,
        finalizeUnusedStatementsBeforeClosing: false,
      },
    );
    expect(expoSqliteMock.openDatabaseAsync).toHaveBeenNthCalledWith(
      2,
      "recovery-destination.db",
      {
        useNewConnection: true,
        finalizeUnusedStatementsBeforeClosing: false,
      },
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
    const close = jest.fn(async () => undefined);
    const unsubscribe = jest.fn<() => undefined>(() => undefined);
    lifecycle.subscribeForeground.mockReturnValueOnce(unsubscribe);
    const createLifecycle = jest.fn(() => lifecycle);
    const result = await render(
      <RuntimeHarness
        dependencies={dependencies(repository, {
          createLifecycle,
          openKernel: jest.fn(async () => ({ close } as unknown as SqliteKernel)),
        })}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("runtime-state")).toHaveTextContent("trusted");
    });
    expect(lifecycle.trigger).toHaveBeenCalledWith("launch");
    expect(lifecycle.subscribeForeground).toHaveBeenCalledTimes(1);

    await result.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(lifecycle.dispose).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(lifecycle.dispose.mock.invocationCallOrder[0])
      .toBeLessThan(close.mock.invocationCallOrder[0]!);
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
      const firstLifecycle = runtimeLifecycle();
      const secondLifecycle = runtimeLifecycle();
      let resolveOpen: ((kernel: SqliteKernel) => void) | undefined;
      let resolveMigration: (() => void) | undefined;
      let resolveQuery: ((view: TodayView) => void) | undefined;
      let opens = 0;
      const runtimeDependencies = dependencies(repository, {
        createLifecycle: jest.fn<WorkoutAppRuntimeDependencies["createLifecycle"]>((input) =>
          input.kernel === firstKernel ? firstLifecycle : secondLifecycle
        ),
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
      if (stage === "open") {
        expect(firstLifecycle.dispose).not.toHaveBeenCalled();
      } else {
        expect(firstLifecycle.dispose).toHaveBeenCalled();
        expect(firstLifecycle.dispose.mock.invocationCallOrder[0])
          .toBeLessThan(firstClose.mock.invocationCallOrder[0]!);
      }
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
    let scheduleReads = 0;
    const schedule = {
      ...runtimeScheduleAdapter(),
      loadToday: jest.fn(async () => {
        scheduleReads += 1;
        if (scheduleReads === 1) return null;
        return {
          planDays: activation.days,
          scheduleToday: {} as never,
          view: scheduledView,
          selectedStrengthOccurrence: {
            kind: "strength" as const,
            opportunityId: "opportunity-1",
            planId: "plan-copy",
            planDayId: "day-a",
            scheduleId: "schedule-1",
            scheduleVersionId: "schedule-version-1",
            localDate: "2026-08-17",
            timeZone: "Asia/Singapore",
            sourceRevisions: {
              plan: 1,
              day: 1,
              schedule: 1,
              opportunity: 1,
            },
          },
        };
      }),
    } as ScheduleRuntimeAdapter;
    const runtimeDependencies = dependencies(repository, {
      loadStarterPlans: jest.fn(async () => ({}) as never),
      activateInitialStarter,
      createScheduleRuntime: () => schedule,
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
    const queryAll = jest.fn(async (sql: string) => sql.includes("FROM progression_recommendations")
      ? [{ evidence_version: 2, source_revision: 1, target_revision: 1, status: "pending" }]
      : []);
    const kernel = {
      close: jest.fn(async () => undefined),
      queryAll,
      readSnapshot: jest.fn(async (
        query: (transaction: Pick<SqliteTransactionExecutor, "queryAll">) => Promise<unknown>,
      ) => query({ queryAll: queryAll as unknown as SqliteTransactionExecutor["queryAll"] })),
    } as unknown as SqliteKernel;
    await render(
      <RuntimeHarness dependencies={dependencies(repository, {
        createOutcomeRepository: () => outcomeRepository,
        openKernel: jest.fn(async () => kernel),
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
      expect(outcomeRepository.acceptRecommendation).toHaveBeenCalledWith(expect.objectContaining({
        decision: "use_target",
        expectedEvidenceVersion: 2,
        expectedSourceRevision: 1,
        expectedTargetRevision: 1,
        requestId: expect.stringMatching(/^recommendation-use:/u),
      }));
      expect(outcomeRepository.keepCurrentTarget).toHaveBeenCalledWith(expect.objectContaining({
        decision: "keep_current_target",
        expectedEvidenceVersion: 2,
        expectedSourceRevision: 1,
        expectedTargetRevision: 1,
        requestId: expect.stringMatching(/^recommendation-keep:/u),
      }));
    });
  });

  it("reads aggregate write-back eligibility only after durable completion and never applies an ineligible session", async () => {
    const repository = runtimeRepository([activeView, activeView], [activation]);
    const outcomeRepository = runtimeOutcomeRepository();
    const schedule = runtimeScheduleAdapter();
    const events: string[] = [];
    jest.spyOn(outcomeRepository, "finishCompleted").mockImplementationOnce(async () => {
      events.push("finish");
      return {
        detail: runtimeSessionDetail,
        invalidationScopes: [],
      };
    });
    jest.spyOn(schedule, "completeScheduledSession").mockImplementationOnce(async () => {
      events.push("schedule");
      return null;
    });
    const ownedPlans = {
      previewSessionExerciseEdits: jest.fn(async () => {
        events.push("preview");
        return null;
      }),
      applySessionExerciseEdits: jest.fn(async () => {
        events.push("apply");
        return {
          outcome: "committed" as const,
          operation: "session_exercise_edits" as const,
          planId: "plan-copy",
          planRevision: 2,
          sourceSessionId: "session-1",
          currentWorkoutUnaffected: true,
          invalidations: [],
        };
      }),
    };
    mockedCreateOwnedPlanRuntimePort.mockReturnValueOnce({
      ...({} as ReturnType<typeof createOwnedPlanRuntimePort>),
      ...ownedPlans,
    } as unknown as ReturnType<typeof createOwnedPlanRuntimePort>);
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createOutcomeRepository: () => outcomeRepository,
          createScheduleRuntime: () => schedule,
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

    await act(async () => {
      await captured!.finishCompleted({
        sessionId: "session-1",
        expectedSessionRevision: 1,
        endedAtMs: 2_000,
      });
    });
    const writeBack = await captured.previewCompletedWorkoutPlanWriteBack(
      "session-1",
    );

    expect(events).toEqual(["finish", "schedule", "preview"]);
    expect(writeBack).toEqual({
      state: "completed",
      disposition: "not_eligible",
    });
    expect(ownedPlans.applySessionExerciseEdits).not.toHaveBeenCalled();
  });

  it("refreshes a stale write-back preview before retrying the aggregate apply", async () => {
    const repository = runtimeRepository([activeView, activeView], [activation]);
    const previewSessionExerciseEdits = jest.fn(async () =>
      sessionWriteBackPreview
    );
    const applySessionExerciseEdits = jest.fn(async () => ({
      outcome: "committed" as const,
      operation: "session_exercise_edits" as const,
      planId: "plan-copy",
      planRevision: 2,
      sourceSessionId: "session-1",
      currentWorkoutUnaffected: true as const,
      invalidations: [],
    }));
    mockedCreateOwnedPlanRuntimePort.mockReturnValueOnce({
      ...({} as ReturnType<typeof createOwnedPlanRuntimePort>),
      previewSessionExerciseEdits,
      applySessionExerciseEdits,
    } as unknown as ReturnType<typeof createOwnedPlanRuntimePort>);
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository)}
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

    let result: Awaited<
      ReturnType<typeof captured.applyCompletedWorkoutPlanWriteBack>
    >;
    await act(async () => {
      result = await captured!.applyCompletedWorkoutPlanWriteBack({
        state: "save_failed",
        preview: sessionWriteBackPreview,
        failure: { kind: "stale", code: "plan_impact_preview_stale" },
      });
    });

    expect(result!).toEqual({
      state: "completed",
      disposition: "saved",
      outcome: "committed",
    });
    expect(previewSessionExerciseEdits).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(applySessionExerciseEdits).toHaveBeenCalledWith({
      sourceSessionId: "session-1",
      expectedPlanRevision: 1,
      previewToken: sessionWriteBackPreview.previewToken,
      composition: [],
    });
  });

  it("keeps the completed workout retryable when a stale retry cannot refresh its preview", async () => {
    const repository = runtimeRepository([activeView], [activation]);
    const previewSessionExerciseEdits = jest.fn(async () => {
      throw new Error("preview_read_failed");
    });
    const applySessionExerciseEdits = jest.fn();
    mockedCreateOwnedPlanRuntimePort.mockReturnValueOnce({
      ...({} as ReturnType<typeof createOwnedPlanRuntimePort>),
      previewSessionExerciseEdits,
      applySessionExerciseEdits,
    } as unknown as ReturnType<typeof createOwnedPlanRuntimePort>);
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository)}
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

    await expect(captured.applyCompletedWorkoutPlanWriteBack({
      state: "save_failed",
      preview: sessionWriteBackPreview,
      failure: { kind: "stale", code: "plan_impact_preview_stale" },
    })).resolves.toEqual({
      state: "save_failed",
      preview: sessionWriteBackPreview,
      failure: {
        kind: "failed",
        code: "session_write_back_preview_failed",
      },
    });
    expect(applySessionExerciseEdits).not.toHaveBeenCalled();
  });

  it("keeps the completed workout safe when the development-test write-back hook fails", async () => {
    const repository = runtimeRepository([activeView], [activation]);
    const previewSessionExerciseEdits = jest.fn(async () =>
      sessionWriteBackPreview
    );
    const applySessionExerciseEdits = jest.fn();
    mockedCreateOwnedPlanRuntimePort.mockReturnValueOnce({
      ...({} as ReturnType<typeof createOwnedPlanRuntimePort>),
      previewSessionExerciseEdits,
      applySessionExerciseEdits,
    } as unknown as ReturnType<typeof createOwnedPlanRuntimePort>);
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository)}
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

    applyWorkoutMutationTestControl("arm_plan_write_back_failure");
    await expect(captured.applyCompletedWorkoutPlanWriteBack({
      state: "awaiting_choice",
      preview: sessionWriteBackPreview,
    })).resolves.toEqual({
      state: "save_failed",
      preview: sessionWriteBackPreview,
      failure: {
        kind: "failed",
        code: "session_write_back_failed",
      },
    });
    expect(applySessionExerciseEdits).not.toHaveBeenCalled();
  });

  it("builds truthful Garmin identity copy from accepted source facts at the runtime facade", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const kernel = {
      close: jest.fn(async () => undefined),
      queryAll: jest.fn(async (sql: string) => {
        if (sql.includes("FROM imported_activities activity")) {
          return [{
            activity_id: "activity-local-01",
            aggregate_json: acceptedGarminAggregateJson(),
            aggregate_revision: 1,
            accepted_normalized_sha256: acceptedGarminDigest,
            removal_state: "active",
            match_count: 0,
            pending_revision_count: 0,
          }];
        }
        return [];
      }),
      write: jest.fn(async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) =>
        command({
          execute: jest.fn(async () => ({ changes: 1, lastInsertRowId: 0 })),
          queryAll: jest.fn(async () => []),
        })),
    } as unknown as SqliteKernel;
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
    if (captured === undefined) {
      throw new Error("runtime_not_captured");
    }

    await expect(captured.garminImport.loadGarminActivities()).resolves.toEqual([
      expect.objectContaining({
        activityId: "activity-local-01",
        title: "Outdoor run",
        confirmedLocalDate: "2026-10-04",
        summary: "5.00 km · 26:00",
        identityCopy: "Accepted source title unavailable. Outdoor run on 2026-10-04.",
        matchState: "unmatched",
        revisionState: "accepted",
      }),
    ]);
  });

  it("loads a bounded Garmin revision review with canonical changed-field copy", async () => {
    let revisionAvailable = true;
    const queryAll = jest.fn(async (sql: string) => {
      if (!sql.includes("imported_activity_revision_proposals") || !revisionAvailable) return [];
      return [{
        accepted_revision: 3,
        accepted_aggregate_json: JSON.stringify({
          normalized: { distance_meters: 5_000, label: "Current", approved: true, route: { segments: 1 } },
        }),
        proposed_revision: 4,
        proposed_sha256: "a".repeat(64),
        proposed_aggregate_json: JSON.stringify({
          normalized: { distance_meters: 5_010, label: "Updated", approved: false, route: { segments: 2 }, elapsed_ms: 1_500_000 },
        }),
      }];
    });
    const kernel = {
      close: jest.fn(async () => undefined),
      queryAll,
      readSnapshot: jest.fn(async (read: (transaction: Pick<SqliteTransactionExecutor, "queryAll">) => Promise<unknown>) => read({ queryAll: queryAll as never })),
      write: jest.fn(async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) => command({
        execute: jest.fn(async () => ({ changes: 1, lastInsertRowId: 0 })),
        queryAll: queryAll as never,
      })),
    } as unknown as SqliteKernel;
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(runtimeRepository([noPlanView], [null]), {
          openKernel: jest.fn(async () => kernel),
        })}
        onReady={(runtime) => { captured = runtime; }}
      />,
    );
    await waitFor(() => expect(captured?.launchState).toBe("trusted"));

    await expect(captured!.loadGarminRevisionReview("external-id")).resolves.toBeNull();
    await expect(captured!.loadGarminRevisionReview("activity-local-01")).resolves.toEqual({
      activityId: "activity-local-01",
      acceptedRevision: 3,
      proposedRevision: 4,
      expectedProposedSha256: "a".repeat(64),
      changedFields: [
        { field: "approved", accepted: "true", proposed: "false" },
        { field: "distance_meters", accepted: "5000", proposed: "5010" },
        { field: "elapsed_ms", accepted: "Unavailable", proposed: "1500000" },
        { field: "label", accepted: "Current", proposed: "Updated" },
        { field: "route", accepted: '{"segments":1}', proposed: '{"segments":2}' },
      ],
    });
    revisionAvailable = false;
    await expect(captured!.loadGarminRevisionReview("activity-local-01")).resolves.toBeNull();
  });

  it("uses the current relation fence for runtime unmatch and reassignment commands", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const current = runningMatchCandidate();
    const next = runningMatchCandidate({
      opportunityId: "opportunity-2",
      slotId: "slot-2",
      slotRevisionId: "slot-revision-2",
      slotOrdinal: 1,
      sessionRevisionId: "session-revision-2",
      sessionKind: "intervals",
      targetSummary: "6 × 1 min · Z3",
      expectedRelationRevision: 99,
    });
    const execute = jest.fn(async () => ({ changes: 1, lastInsertRowId: 0 }));
    const transactionQueryAllCalls = jest.fn();
    const transactionQueryAll = async <Row extends Record<string, unknown>>(
      sql: string,
      parameters?: readonly unknown[],
    ): Promise<readonly Row[]> => {
      transactionQueryAllCalls(sql, parameters);
      const opportunityId = parameters?.[0];
      if (sql.includes("FROM running_activity_match_receipts")) {
        return [] as readonly Row[];
      }
      if (sql.includes("FROM imported_activity_identities")) {
        return [{
          aggregate_revision: current.expectedActivityRevision,
          accepted_normalized_sha256: current.expectedAcceptedPayloadSha256,
          removal_state: "active",
        }] as unknown as readonly Row[];
      }
      if (sql.includes("FROM running_opportunities opportunity")) {
        if (opportunityId === current.opportunityId) {
          return [{
            plan_id: current.planId,
            schedule_id: current.scheduleId,
            schedule_version_id: current.scheduleVersionId,
            schedule_revision: current.expectedScheduleRevision,
            schedule_lifecycle: "active",
            plan_active: 1,
            plan_day_id: current.planDayId,
            plan_day_revision: current.expectedPlanDayRevision,
            slot_id: current.slotId,
            slot_revision_id: current.slotRevisionId,
            slot_revision: current.expectedSlotRevision,
            session_revision_id: current.sessionRevisionId,
            session_revision: current.expectedSessionRevision,
            state: "planned",
          }] as unknown as readonly Row[];
        }
        if (opportunityId === next.opportunityId) {
          return [{
            plan_id: next.planId,
            schedule_id: next.scheduleId,
            schedule_version_id: next.scheduleVersionId,
            schedule_revision: next.expectedScheduleRevision,
            schedule_lifecycle: "active",
            plan_active: 1,
            plan_day_id: next.planDayId,
            plan_day_revision: next.expectedPlanDayRevision,
            slot_id: next.slotId,
            slot_revision_id: next.slotRevisionId,
            slot_revision: next.expectedSlotRevision,
            session_revision_id: next.sessionRevisionId,
            session_revision: next.expectedSessionRevision,
            state: "planned",
          }] as unknown as readonly Row[];
        }
        return [] as readonly Row[];
      }
      if (sql === "SELECT activity_id, opportunity_id, relation_revision FROM running_activity_current_matches WHERE activity_id = ?") {
        return [{
          activity_id: current.activityId,
          opportunity_id: current.opportunityId,
          relation_revision: current.expectedRelationRevision,
        }] as unknown as readonly Row[];
      }
      if (sql === "SELECT activity_id, opportunity_id, relation_revision FROM running_activity_current_matches WHERE opportunity_id = ?") {
        return opportunityId === current.opportunityId
          ? [{
            activity_id: current.activityId,
            opportunity_id: current.opportunityId,
            relation_revision: current.expectedRelationRevision,
          }] as unknown as readonly Row[]
          : [] as readonly Row[];
      }
      if (sql.includes("SELECT relation_revision FROM running_activity_match_events")) {
        return [{ relation_revision: current.expectedRelationRevision }] as unknown as readonly Row[];
      }
      if (sql.includes("SELECT EXISTS")) {
        return [{ invalid: 0 }] as unknown as readonly Row[];
      }
      return [] as readonly Row[];
    };
    const kernel = {
      close: jest.fn(async () => undefined),
      queryAll: jest.fn(async () => []),
      write: jest.fn(async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) =>
        command({
          execute,
          queryAll: transactionQueryAll,
        })),
    } as unknown as SqliteKernel;
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
    if (captured === undefined) {
      throw new Error("runtime_not_captured");
    }

    await expect(captured.unmatchActivityMatch(current)).resolves.toEqual({
      kind: "unmatched",
      activityId: current.activityId,
      opportunityId: current.opportunityId,
      relationRevision: current.expectedRelationRevision + 1,
    });
    execute.mockClear();
    transactionQueryAllCalls.mockClear();

    await expect(captured.reassignActivityMatch({ current, next })).resolves.toEqual({
      kind: "reassigned",
      activityId: current.activityId,
      opportunityId: next.opportunityId,
      relationRevision: current.expectedRelationRevision + 1,
    });
    expect(execute).toHaveBeenCalled();
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

  it("keeps every exposed runtime capability bounded under incomplete route input", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const automaticPresentation = projectAutomaticBackupPresentation({
      status: "idle",
      accountLabel: "coverage@example.com",
      mutationGeneration: 1,
      backedUpGeneration: 1,
      nowMs: 1_786_853_600_000,
    });
    const automaticMethods = new Map<PropertyKey, jest.Mock>();
    const automaticRuntime = new Proxy({
      current: jest.fn(() => automaticPresentation),
      dispose: jest.fn(),
      refresh: jest.fn(async () => undefined),
      start: jest.fn(async () => undefined),
      subscribe: jest.fn(() => () => undefined),
    } as unknown as AutomaticBackupRuntime, {
      get(target, property, receiver) {
        if (property in target) return Reflect.get(target, property, receiver);
        const existing = automaticMethods.get(property);
        if (existing !== undefined) return existing;
        const method = jest.fn(async () => undefined);
        automaticMethods.set(property, method);
        return method;
      },
    });
    let captured: ReturnType<typeof useWorkoutAppRuntime> | undefined;
    await render(
      <RuntimeCaptureHarness
        dependencies={dependencies(repository, {
          createAutomaticBackupRuntime: () => automaticRuntime,
        })}
        onReady={(runtime) => { captured = runtime; }}
      />,
    );
    await waitFor(() => expect(captured?.launchState).toBe("trusted"));
    if (captured === undefined) throw new Error("runtime_not_captured");

    const callable = new Map<string, (...args: readonly unknown[]) => unknown>();
    const visited = new WeakSet<object>();
    const collect = (value: unknown, path: string, depth: number) => {
      if (depth > 2 || value === null || (typeof value !== "object" && typeof value !== "function")) return;
      if (typeof value === "function") {
        callable.set(path, value as (...args: readonly unknown[]) => unknown);
        return;
      }
      if (visited.has(value)) return;
      visited.add(value);
      for (const [key, child] of Object.entries(value)) collect(child, `${path}.${key}`, depth + 1);
    };
    collect(captured, "runtime", 0);
    expect(callable.size).toBeGreaterThan(100);

    const incomplete = Object.freeze({});
    await act(async () => {
      const pending: Promise<unknown>[] = [];
      for (const [path, operation] of callable) {
        if (path === "runtime.retry") continue;
        try {
          const result = operation(incomplete, incomplete, incomplete);
          if (result !== null && typeof result === "object" && "then" in result) {
            pending.push(Promise.resolve(result));
          }
        } catch {
          // A capability may reject an incomplete boundary payload synchronously.
        }
      }
      await Promise.allSettled(pending);
    });

    const boundaryValue = (label: string): unknown => {
      const callableBoundary = () => boundaryValue(label);
      return new Proxy(callableBoundary, {
        apply: () => boundaryValue(label),
        get(_target, property) {
          if (property === "then") return undefined;
          if (property === "length") return 1;
          if (property === Symbol.iterator) return function* iterator() { yield boundaryValue(label); };
          if (property === Symbol.toPrimitive) return (hint: string) => hint === "number" ? 1 : label;
          if (property === "trim" || property === "toString") return () => label;
          if (property === "valueOf") return () => 1;
          if (property === "map" || property === "filter" || property === "flatMap") return () => [];
          return boundaryValue(`${label}.${String(property)}`);
        },
      });
    };
    await act(async () => {
      const pending: Promise<unknown>[] = [];
      for (const [path, operation] of callable) {
        if (path === "runtime.retry") continue;
        try {
          const input = boundaryValue(path);
          const result = operation(input, input, input);
          if (result !== null && typeof result === "object" && "then" in result) {
            pending.push(Promise.resolve(result));
          }
        } catch {
          // Typed runtime boundaries may reject the generic non-domain value.
        }
      }
      await Promise.allSettled(pending);
    });
    expect(callable.size).toBeGreaterThan(100);
    expect(automaticMethods.size).toBeGreaterThan(10);
  });

  it("rejects use outside its provider", async () => {
    function OutsideProbe() {
      useWorkoutAppRuntime();
      return null;
    }
    await expect(render(<OutsideProbe />)).rejects.toThrow(
      "useWorkoutAppRuntime must be used within WorkoutAppRuntimeProvider",
    );

    for (const [usePort, message] of [
      [useCalendarRangeReadPort, "calendar_range_read_port_unavailable"],
      [useCalendarSessionReadPort, "calendar_session_read_port_unavailable"],
      [useCalendarStrengthOccurrenceReadPort, "calendar_strength_occurrence_read_port_unavailable"],
      [useCalendarActivityReadPort, "calendar_activity_read_port_unavailable"],
    ] as const) {
      function OutsideCalendarProbe() {
        usePort();
        return null;
      }
      await expect(render(<OutsideCalendarProbe />)).rejects.toThrow(message);
    }
  });

  it("provides every bounded Calendar read context inside the runtime provider", async () => {
    const repository = runtimeRepository([noPlanView], [null]);
    const onReady = jest.fn();
    await render(
      <CalendarPortsHarness dependencies={dependencies(repository)} onReady={onReady} />,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("calendar-ports-ready")).toHaveTextContent("ready");
  });
});
