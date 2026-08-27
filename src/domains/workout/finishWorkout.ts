import type {
  FinishOutcomeResult,
  SessionDetail,
} from "./sessionDetail";

export const PARTIAL_CONFIRMATION = "save_partial_workout" as const;
export const ZERO_SET_CONFIRMATION = "save_zero_set_workout" as const;
export const DISCARD_CONFIRMATION = "discard_workout" as const;
export const SKIP_EXERCISE_CONFIRMATION = "skip_exercise" as const;

export type FinishCompletedInput = Readonly<{
  sessionId: string;
  expectedSessionRevision: number;
  endedAtMs: number;
}>;

export type FinishPartialInput = FinishCompletedInput & Readonly<{
  confirmation: string;
}>;

export type SaveZeroSetInput = FinishPartialInput;
export type DiscardWorkoutInput = FinishPartialInput;

export type SkipExerciseInput = Readonly<{
  sessionId: string;
  sessionExerciseId: string;
  expectedSessionRevision: number;
  expectedExerciseRevision: number;
  confirmation: string;
  nowMs: number;
}>;

export type ResumePartialWorkoutInput = Readonly<{
  sessionId: string;
  expectedSessionRevision: number;
  resumedAtMs: number;
}>;

export interface WorkoutOutcomeRepository {
  finishCompleted(input: FinishCompletedInput): Promise<FinishOutcomeResult>;
  finishPartial(input: FinishPartialInput): Promise<FinishOutcomeResult>;
  saveZeroSetWorkout(input: SaveZeroSetInput): Promise<FinishOutcomeResult>;
  discardWorkout(input: DiscardWorkoutInput): Promise<FinishOutcomeResult>;
  skipExercise(input: SkipExerciseInput): Promise<Readonly<{
    sessionId: string;
    status: "in_progress";
    sessionRevision: number;
  }>>;
  resumePartialWorkout(input: ResumePartialWorkoutInput): Promise<Readonly<{
    sessionId: string;
    status: "in_progress";
    sessionRevision: number;
  }>>;
  getSessionDetail(sessionId: string): Promise<SessionDetail>;
}

function timestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function revisions(...values: readonly number[]): boolean {
  return values.every((value) => Number.isSafeInteger(value) && value >= 0);
}

export function finishCompleted(input: Readonly<{
  repository: WorkoutOutcomeRepository;
  input: FinishCompletedInput;
}>): Promise<FinishOutcomeResult> {
  if (
    !revisions(input.input.expectedSessionRevision)
    || !timestamp(input.input.endedAtMs)
  ) {
    throw new TypeError("finish_completed_input_invalid");
  }
  return input.repository.finishCompleted(input.input);
}

export function finishPartial(input: Readonly<{
  repository: WorkoutOutcomeRepository;
  input: FinishPartialInput;
}>): Promise<FinishOutcomeResult> {
  if (input.input.confirmation !== PARTIAL_CONFIRMATION) {
    throw new TypeError("partial_confirmation_required");
  }
  if (
    !revisions(input.input.expectedSessionRevision)
    || !timestamp(input.input.endedAtMs)
  ) {
    throw new TypeError("finish_partial_input_invalid");
  }
  return input.repository.finishPartial(input.input);
}

export function saveZeroSetWorkout(input: Readonly<{
  repository: WorkoutOutcomeRepository;
  input: SaveZeroSetInput;
}>): Promise<FinishOutcomeResult> {
  if (input.input.confirmation !== ZERO_SET_CONFIRMATION) {
    throw new TypeError("zero_set_confirmation_required");
  }
  if (
    !revisions(input.input.expectedSessionRevision)
    || !timestamp(input.input.endedAtMs)
  ) {
    throw new TypeError("zero_set_input_invalid");
  }
  return input.repository.saveZeroSetWorkout(input.input);
}

export function discardWorkout(input: Readonly<{
  repository: WorkoutOutcomeRepository;
  input: DiscardWorkoutInput;
}>): Promise<FinishOutcomeResult> {
  if (input.input.confirmation !== DISCARD_CONFIRMATION) {
    throw new TypeError("discard_confirmation_required");
  }
  if (
    !revisions(input.input.expectedSessionRevision)
    || !timestamp(input.input.endedAtMs)
  ) {
    throw new TypeError("discard_input_invalid");
  }
  return input.repository.discardWorkout(input.input);
}

export function skipExercise(input: Readonly<{
  repository: WorkoutOutcomeRepository;
  input: SkipExerciseInput;
}>) {
  if (input.input.confirmation !== SKIP_EXERCISE_CONFIRMATION) {
    throw new TypeError("skip_exercise_confirmation_required");
  }
  if (
    !revisions(
      input.input.expectedSessionRevision,
      input.input.expectedExerciseRevision,
    )
    || !timestamp(input.input.nowMs)
  ) {
    throw new TypeError("skip_exercise_input_invalid");
  }
  return input.repository.skipExercise(input.input);
}

export function resumePartialWorkout(input: Readonly<{
  repository: WorkoutOutcomeRepository;
  input: ResumePartialWorkoutInput;
}>) {
  if (
    !revisions(input.input.expectedSessionRevision)
    || !timestamp(input.input.resumedAtMs)
  ) {
    throw new TypeError("resume_partial_input_invalid");
  }
  return input.repository.resumePartialWorkout(input.input);
}
