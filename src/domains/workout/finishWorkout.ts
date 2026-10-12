import type {
  ApplySessionExerciseEditsToPlanInput,
  SessionExerciseEditsForPlanPreview,
} from "../plans";
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
  getSessionDetailAtRevision?(
    sessionId: string,
    sourceRevision: number,
  ): Promise<SessionDetail>;
}

export type CompletedWorkoutPlanWriteBackFailure = Readonly<{
  kind: "stale" | "failed";
  code: string;
}>;

export type CompletedWorkoutPlanWriteBackCompletedState =
  | Readonly<{
      state: "completed";
      disposition: "not_eligible" | "kept";
    }>
  | Readonly<{
      state: "completed";
      disposition: "saved";
      outcome: "committed" | "already_committed";
    }>;

export type CompletedWorkoutPlanWriteBackAwaitingChoiceState = Readonly<{
  state: "awaiting_choice";
  preview: SessionExerciseEditsForPlanPreview;
}>;

export type CompletedWorkoutPlanWriteBackApplyingState = Readonly<{
  state: "applying";
  preview: SessionExerciseEditsForPlanPreview;
}>;

export type CompletedWorkoutPlanWriteBackSaveFailedState = Readonly<{
  state: "save_failed";
  preview: SessionExerciseEditsForPlanPreview;
  failure: CompletedWorkoutPlanWriteBackFailure;
}>;

export type CompletedWorkoutPlanWriteBackChoiceState =
  | CompletedWorkoutPlanWriteBackAwaitingChoiceState
  | CompletedWorkoutPlanWriteBackSaveFailedState;

export type CompletedWorkoutPlanWriteBackState =
  | CompletedWorkoutPlanWriteBackCompletedState
  | CompletedWorkoutPlanWriteBackAwaitingChoiceState
  | CompletedWorkoutPlanWriteBackApplyingState
  | CompletedWorkoutPlanWriteBackSaveFailedState;

export type CompletedWorkoutPlanWriteBackPort = Readonly<{
  previewSessionExerciseEdits(input: Readonly<{
    sessionId: string;
  }>): Promise<SessionExerciseEditsForPlanPreview | null>;
  applySessionExerciseEdits(
    input: Omit<ApplySessionExerciseEditsToPlanInput, "requestId">,
  ): Promise<Readonly<{
    outcome: "committed" | "already_committed";
  }>>;
}>;

function planWriteBackFailure(
  error: unknown,
): CompletedWorkoutPlanWriteBackFailure {
  const code = error instanceof Error
    && "code" in error
    && typeof error.code === "string"
    ? error.code
    : "session_write_back_failed";
  return {
    kind: code === "plan_impact_preview_stale" ? "stale" : "failed",
    code,
  };
}

export async function previewCompletedWorkoutPlanWriteBack(input: Readonly<{
  port: CompletedWorkoutPlanWriteBackPort;
  sessionId: string;
}>): Promise<
  | CompletedWorkoutPlanWriteBackCompletedState
  | CompletedWorkoutPlanWriteBackAwaitingChoiceState
> {
  const preview = await input.port.previewSessionExerciseEdits({
    sessionId: input.sessionId,
  });
  return preview === null
    ? { state: "completed", disposition: "not_eligible" }
    : { state: "awaiting_choice", preview };
}

export function beginCompletedWorkoutPlanWriteBack(
  state: CompletedWorkoutPlanWriteBackChoiceState,
): CompletedWorkoutPlanWriteBackApplyingState {
  return { state: "applying", preview: state.preview };
}

export function keepCompletedWorkoutPlanAsIs(
  state: CompletedWorkoutPlanWriteBackChoiceState,
): CompletedWorkoutPlanWriteBackCompletedState {
  void state;
  return { state: "completed", disposition: "kept" };
}

export async function applyCompletedWorkoutPlanWriteBack(input: Readonly<{
  port: CompletedWorkoutPlanWriteBackPort;
  state: CompletedWorkoutPlanWriteBackApplyingState;
}>): Promise<
  | CompletedWorkoutPlanWriteBackCompletedState
  | CompletedWorkoutPlanWriteBackSaveFailedState
> {
  const { preview } = input.state;
  try {
    const result = await input.port.applySessionExerciseEdits({
      sourceSessionId: preview.sourceSessionId,
      expectedPlanRevision: preview.expectedPlanRevision,
      previewToken: preview.previewToken,
      composition: preview.composition,
    });
    return {
      state: "completed",
      disposition: "saved",
      outcome: result.outcome,
    };
  } catch (error) {
    return {
      state: "save_failed",
      preview,
      failure: planWriteBackFailure(error),
    };
  }
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
