import type {
  ActivatedPlanDay,
  StarterActivation,
} from "../plans";
import type {
  MetricProfile,
} from "../metrics";

export type WorkoutStartMode =
  | "scheduled"
  | "alternate"
  | "rest_day"
  | "empty";

export type WorkoutSessionSource =
  | "scheduled_day"
  | "alternate_day"
  | "rest_day"
  | "empty";

export type StartWorkoutRequest =
  | Readonly<{
      mode: Exclude<WorkoutStartMode, "empty">;
      planId: string;
      planDayId: string;
      localDate: string;
      timezone: string;
      startedAtMs: number;
    }>
  | Readonly<{
      mode: "empty";
      localDate: string;
      timezone: string;
      startedAtMs: number;
    }>;

export type StartedWorkout = Readonly<{
  id: string;
  source: WorkoutSessionSource;
  status: "in_progress";
  planId: string | null;
  planDayId: string | null;
  revision: number;
}>;

export type TodayHistory = Readonly<{
  summary: string;
  change: string | null;
}>;

export type TodayExercise = Readonly<{
  exerciseId: string;
  name: string;
  metricProfile: MetricProfile;
  nextTarget: string;
  history: TodayHistory | null;
  recommendationStatus: "none" | "pending";
}>;

export type TodayView =
  | Readonly<{ state: "no_active_plan" }>
  | Readonly<{
      state: "scheduled";
      planId: string;
      planName: string;
      dayId: string;
      dayName: string;
      estimateMinutes: number;
      exercises: readonly TodayExercise[];
    }>
  | Readonly<{
      state: "rest_day";
      planId: string;
      planName: string;
      nextDayId: string;
      nextDayName: string;
      nextLocalDate: string;
    }>
  | Readonly<{
      state: "active_workout";
      sessionId: string;
      exerciseName: string | null;
      setLabel: string | null;
      restStatus: "idle" | "running" | "paused" | "expired";
    }>
  | Readonly<{
      state: "saved_partial";
      sessionId: string;
      revision: number;
      exerciseName: string | null;
      setLabel: string | null;
      completedWorkingSets: number;
      totalWorkingSets: number;
    }>;

export interface WorkoutRepository {
  startWorkout(request: StartWorkoutRequest): Promise<StartedWorkout>;
  getTodayView(input: Readonly<{
    localDate: string;
    weekday: number;
  }>): Promise<TodayView>;
  getActivation(): Promise<StarterActivation | null>;
  getPlanDays(planId: string): Promise<readonly ActivatedPlanDay[]>;
}

export {
  startWorkout,
  type StartWorkoutInput,
} from "./startWorkout";

export {
  WORKING_SET_VALUE_SOURCES,
  WorkoutCommandConflictError,
  type ActiveWorkoutExercise,
  type ActiveWorkoutProgress,
  type ActiveWorkoutRepository,
  type ActiveWorkoutRestState,
  type ActiveWorkoutSet,
  type ActiveWorkoutSetStatus,
  type ActiveWorkoutView,
  type AddWorkingSetInput,
  type AddWarmupInput,
  type CompleteSetInput,
  type CompleteSetResult,
  type CompleteWarmupInput,
  type CopyPreviousWarmupInput,
  type ReviseCompletedSetInput,
  type LoadRepsObservation,
  type SetObservation,
  type SetTarget,
  type SetValueSource,
  type SkipWorkingSetInput,
  type SkipWarmupInput,
  type TimedHoldObservation,
  type UndoCompletedSetInput,
  type UndoCompletedSetResult,
  type UpdateActiveSetDraftInput,
  type UpdateWarmupDraftInput,
  type WorkoutSessionView,
  type EmptyWorkoutView,
  type WorkingSetValueSource,
} from "./activeWorkout";
export {
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
} from "./setCommands";
export {
  undoCompletedSet,
} from "./undoCompletedSet";
export type {
  HapticsPort,
} from "./hapticsPort";
export {
  DISCARD_CONFIRMATION,
  PARTIAL_CONFIRMATION,
  SKIP_EXERCISE_CONFIRMATION,
  ZERO_SET_CONFIRMATION,
  discardWorkout,
  finishCompleted,
  finishPartial,
  resumePartialWorkout,
  saveZeroSetWorkout,
  skipExercise,
  type DiscardWorkoutInput,
  type FinishCompletedInput,
  type FinishPartialInput,
  type ResumePartialWorkoutInput,
  type SaveZeroSetInput,
  type SkipExerciseInput,
  type WorkoutOutcomeRepository,
} from "./finishWorkout";
export {
  SESSION_STATUSES,
  WorkoutOutcomeConflictError,
  nextWorkoutStatus,
  sessionIsResumable,
  sessionStatusLabel,
  type WorkoutOutcomeAction,
  type WorkoutSessionStatus,
} from "./outcomes";
export type {
  FinishOutcomeResult,
  SessionDetail,
  SessionExerciseDetail,
  SessionNonLoadOutcome,
  SessionProgress,
  SessionRecommendation,
  SessionSetDetail,
} from "./sessionDetail";
