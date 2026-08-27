import type {
  MetricIdentity,
  MetricObservation,
  MetricProfile,
  MetricTarget,
} from "../metrics";

export const WORKING_SET_VALUE_SOURCES = [
  "recommended",
  "last_workout",
  "plan_default",
  "manual",
] as const;

export type WorkingSetValueSource =
  (typeof WORKING_SET_VALUE_SOURCES)[number];

export type LoadRepsObservation = Extract<
  MetricObservation,
  { profile: "load_reps" }
>;

export type TimedHoldObservation = Extract<
  MetricObservation,
  { profile: "timed_hold"; version: 1 }
>;

export type SetObservation = MetricObservation;
export type SetTarget = MetricTarget;

export type SetValueSource = Readonly<{
  source: WorkingSetValueSource;
  observation: SetObservation;
}>;

export type ActiveWorkoutSetStatus =
  | "planned"
  | "draft"
  | "completed"
  | "skipped";

export type ActiveWorkoutSet = Readonly<{
  id: string;
  kind: "warmup" | "working";
  ordinal: number;
  sourceTargetId: string | null;
  metricIdentity: MetricIdentity;
  target: SetTarget;
  observation: SetObservation | null;
  status: ActiveWorkoutSetStatus;
  completedAtMs: number | null;
  revision: number;
  valueSources: readonly SetValueSource[];
}>;

export type ActiveWorkoutExercise = Readonly<{
  id: string;
  exerciseId: string;
  name: string;
  metricIdentity: MetricIdentity;
  metricProfile: MetricProfile;
  ordinal: number;
  defaultRestSeconds: number;
  status: "planned" | "active" | "completed" | "skipped";
  revision: number;
  warmups: readonly ActiveWorkoutSet[];
  workingSets: readonly ActiveWorkoutSet[];
}>;

export type ActiveWorkoutRestState =
  | Readonly<{
      version: 1;
      state: "idle";
      revision: number;
      nextSetId: string | null;
    }>
  | Readonly<{
      version: 1;
      state: "running";
      revision: number;
      startedAtMs: number;
      endsAtMs: number;
      nextSetId: string | null;
    }>
  | Readonly<{
      version: 1;
      state: "paused";
      revision: number;
      remainingMs: number;
      nextSetId: string | null;
    }>
  | Readonly<{
      version: 1;
      state: "expired";
      revision: number;
      expiredAtMs: number;
      nextSetId: string | null;
    }>;

export type ActiveWorkoutProgress = Readonly<{
  completedWorkingSets: number;
  totalWorkingSets: number;
}>;

export type ActiveWorkoutView = Readonly<{
  id: string;
  status: "in_progress";
  revision: number;
  activeSetId: string | null;
  activeExerciseId: string | null;
  currentExercise: ActiveWorkoutExercise;
  exercises: readonly ActiveWorkoutExercise[];
  progress: ActiveWorkoutProgress;
  rest: ActiveWorkoutRestState;
}>;

export type EmptyWorkoutView = Readonly<{
  state: "empty_workout";
  id: string;
  status: "in_progress";
  revision: number;
  activeSetId: null;
  activeExerciseId: null;
  progress: Readonly<{
    completedWorkingSets: 0;
    totalWorkingSets: 0;
  }>;
  rest: ActiveWorkoutRestState;
}>;

export type WorkoutSessionView = ActiveWorkoutView | EmptyWorkoutView;

export type UpdateActiveSetDraftInput = Readonly<{
  sessionId: string;
  setId: string;
  expectedSetRevision: number;
  metricIdentity: MetricIdentity;
  observation: SetObservation;
  updatedAtMs: number;
}>;

export type UpdateWarmupDraftInput = Readonly<{
  sessionId: string;
  setId: string;
  expectedSetRevision: number;
  observation: LoadRepsObservation;
  updatedAtMs: number;
}>;

export type AddWarmupInput = Readonly<{
  sessionId: string;
  sessionExerciseId: string;
  setId: string;
  observation: LoadRepsObservation;
  nowMs: number;
}>;

export type AddWorkingSetInput = Readonly<{
  sessionId: string;
  sessionExerciseId: string;
  sourceSetId: string;
  setId: string;
  nowMs: number;
}>;

export type CopyPreviousWarmupInput = Readonly<{
  sessionId: string;
  sourceSetId: string;
  setId: string;
  nowMs: number;
}>;

export type CompleteWarmupInput = Readonly<{
  sessionId: string;
  setId: string;
  expectedSetRevision: number;
  completedAtMs: number;
}>;

export type SkipWarmupInput = Readonly<{
  sessionId: string;
  setId: string;
  expectedSetRevision: number;
  skippedAtMs: number;
}>;

export type SkipWorkingSetInput = Readonly<{
  sessionId: string;
  setId: string;
  expectedSessionRevision: number;
  expectedSetRevision: number;
  metricIdentity: MetricIdentity;
  skippedAtMs: number;
}>;

export type CompleteSetInput = Readonly<{
  sessionId: string;
  setId: string;
  expectedSessionRevision: number;
  expectedSetRevision: number;
  completionIdempotencyKey: string;
  metricIdentity: MetricIdentity;
  observation: SetObservation;
  completedAtMs: number;
}>;

export type CompleteSetResult =
  | Readonly<{
      outcome: "committed";
      view: ActiveWorkoutView;
    }>
  | Readonly<{
      outcome: "already_completed";
      view: ActiveWorkoutView;
    }>;

export type ReviseCompletedSetInput = Readonly<{
  sessionId: string;
  setId: string;
  expectedSessionRevision: number;
  expectedSetRevision: number;
  correctionIdempotencyKey: string;
  metricIdentity: MetricIdentity;
  observation: SetObservation;
  revisedAtMs: number;
}>;

export type UndoCompletedSetInput = Readonly<{
  sessionId: string;
  completedSetId: string;
  nowMs: number;
}>;

export type UndoCompletedSetResult =
  | Readonly<{
      outcome: "undone";
      view: ActiveWorkoutView;
    }>
  | Readonly<{
      outcome: "unavailable";
    }>;

export interface ActiveWorkoutRepository {
  getActiveWorkout(sessionId: string): Promise<ActiveWorkoutView>;
  getWorkoutSession(sessionId: string): Promise<WorkoutSessionView>;
  updateActiveSetDraft(
    input: UpdateActiveSetDraftInput,
  ): Promise<ActiveWorkoutView>;
  updateWarmupDraft(
    input: UpdateWarmupDraftInput,
  ): Promise<ActiveWorkoutView>;
  addWarmup(input: AddWarmupInput): Promise<ActiveWorkoutView>;
  addWorkingSet(input: AddWorkingSetInput): Promise<ActiveWorkoutView>;
  copyPreviousWarmup(
    input: CopyPreviousWarmupInput,
  ): Promise<ActiveWorkoutView>;
  completeWarmup(input: CompleteWarmupInput): Promise<ActiveWorkoutView>;
  skipWarmup(input: SkipWarmupInput): Promise<ActiveWorkoutView>;
  skipWorkingSet(input: SkipWorkingSetInput): Promise<ActiveWorkoutView>;
  completeSet(input: CompleteSetInput): Promise<CompleteSetResult>;
  reviseCompletedSet(
    input: ReviseCompletedSetInput,
  ): Promise<ActiveWorkoutView>;
  undoCompletedSet(
    input: UndoCompletedSetInput,
  ): Promise<UndoCompletedSetResult>;
}

export class WorkoutCommandConflictError extends Error {
  readonly kind = "conflict" as const;
  readonly retryable = false;

  constructor(readonly code: string) {
    super(code);
    this.name = "WorkoutCommandConflictError";
  }
}
