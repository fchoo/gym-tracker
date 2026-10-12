import type {
  ExerciseEffort,
} from "./loadRepsV1";

export type RecommendationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "invalidated"
  | "superseded";

export type RecommendationDecision = "use_target" | "keep_current_target";

export type RecommendationDecisionResult = Readonly<{
  recommendationId: string;
  status: Extract<
    RecommendationStatus,
    "accepted" | "rejected" | "superseded"
  > | "already_committed";
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
  /** New callers must submit the full immutable envelope; old route callers remain readable. */
  requestId?: string;
  decision?: RecommendationDecision;
  expectedEvidenceVersion?: number;
  expectedSourceRevision?: number;
  expectedTargetRevision?: number;
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

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/u;

function explicitEnvelopePresent(input: RecommendationDecisionInput): boolean {
  return input.requestId !== undefined
    || input.decision !== undefined
    || input.expectedEvidenceVersion !== undefined
    || input.expectedSourceRevision !== undefined
    || input.expectedTargetRevision !== undefined;
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalRecommendationDecisionRequest(input: Readonly<{
  recommendationId: string;
  requestId: string;
  decision: RecommendationDecision;
  expectedEvidenceVersion: number;
  expectedSourceRevision: number;
  expectedTargetRevision: number;
  decidedAtMs: number;
}>): string {
  return stableJson(input);
}

export function validateRecommendationDecisionInput(
  input: RecommendationDecisionInput,
  expectedDecision?: RecommendationDecision,
): void {
  if (!IDENTIFIER.test(input.recommendationId) || !validTimestamp(input.decidedAtMs)) {
    throw new TypeError("recommendation_decision_input_invalid");
  }
  if (!explicitEnvelopePresent(input)) return;
  if (
    typeof input.requestId !== "string"
    || !IDENTIFIER.test(input.requestId)
    || (input.decision !== "use_target" && input.decision !== "keep_current_target")
    || (expectedDecision !== undefined && input.decision !== expectedDecision)
    || !validRevision(input.expectedEvidenceVersion)
    || !validRevision(input.expectedSourceRevision)
    || !validRevision(input.expectedTargetRevision)
  ) {
    throw new TypeError("recommendation_decision_input_invalid");
  }
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
  validateRecommendationDecisionInput(input.input, "use_target");
  return input.repository.acceptRecommendation(input.input);
}

export function keepCurrentTarget(input: Readonly<{
  repository: ProgressionRepository;
  input: RecommendationDecisionInput;
}>) {
  validateRecommendationDecisionInput(input.input, "keep_current_target");
  return input.repository.keepCurrentTarget(input.input);
}
