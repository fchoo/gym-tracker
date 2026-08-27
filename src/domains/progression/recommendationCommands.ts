import type {
  ExerciseEffort,
} from "./loadRepsV1";

export type RecommendationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "invalidated"
  | "superseded";

export type RecommendationDecisionResult = Readonly<{
  recommendationId: string;
  status: Extract<
    RecommendationStatus,
    "accepted" | "rejected" | "superseded"
  >;
}>;

export type RecordExerciseEffortInput = Readonly<{
  sessionId: string;
  sessionExerciseId: string;
  expectedExerciseRevision: number;
  effort: ExerciseEffort;
  recordedAtMs: number;
}>;

export type RecommendationDecisionInput = Readonly<{
  recommendationId: string;
  decidedAtMs: number;
}>;

export interface ProgressionRepository {
  recordExerciseEffort(
    input: RecordExerciseEffortInput,
  ): Promise<Readonly<{
    sessionExerciseId: string;
    effort: ExerciseEffort;
    revision: number;
  }>>;
  acceptRecommendation(
    input: RecommendationDecisionInput,
  ): Promise<RecommendationDecisionResult>;
  keepCurrentTarget(
    input: RecommendationDecisionInput,
  ): Promise<RecommendationDecisionResult>;
  generateRecommendationsForSession(
    sessionId: string,
    expectedSessionRevision: number,
    nowMs: number,
  ): Promise<number>;
  currentSessionRevision(sessionId: string): Promise<number | null>;
}

function validTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function recordExerciseEffort(input: Readonly<{
  repository: ProgressionRepository;
  input: RecordExerciseEffortInput;
}>) {
  if (
    !Number.isSafeInteger(input.input.expectedExerciseRevision)
    || input.input.expectedExerciseRevision < 0
    || !validTimestamp(input.input.recordedAtMs)
  ) {
    throw new TypeError("exercise_effort_input_invalid");
  }
  return input.repository.recordExerciseEffort(input.input);
}

export function acceptRecommendation(input: Readonly<{
  repository: ProgressionRepository;
  input: RecommendationDecisionInput;
}>) {
  if (!validTimestamp(input.input.decidedAtMs)) {
    throw new TypeError("recommendation_decision_input_invalid");
  }
  return input.repository.acceptRecommendation(input.input);
}

export function keepCurrentTarget(input: Readonly<{
  repository: ProgressionRepository;
  input: RecommendationDecisionInput;
}>) {
  if (!validTimestamp(input.input.decidedAtMs)) {
    throw new TypeError("recommendation_decision_input_invalid");
  }
  return input.repository.keepCurrentTarget(input.input);
}
