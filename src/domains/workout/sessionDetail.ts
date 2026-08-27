import type {
  MetricIdentity,
  MetricObservation,
  MetricProfile,
  MetricTarget,
} from "../metrics";
import type {
  ExerciseEffort,
} from "../progression";
import type {
  WorkoutSessionStatus,
} from "./outcomes";

export type SessionSetDetail = Readonly<{
  id: string;
  kind: "warmup" | "working";
  ordinal: number;
  status: "planned" | "draft" | "completed" | "skipped";
  metricIdentity: MetricIdentity;
  target: MetricTarget;
  observation: MetricObservation | null;
  value: string;
}>;

export type SessionExerciseDetail = Readonly<{
  id: string;
  exerciseId: string;
  name: string;
  metricIdentity: MetricIdentity;
  metricProfile: MetricProfile;
  ordinal: number;
  status: "planned" | "active" | "completed" | "skipped";
  revision: number;
  effort: ExerciseEffort | null;
  topWorkingSet: string | null;
  totalWorkingReps: number | null;
  warmups: readonly SessionSetDetail[];
  workingSets: readonly SessionSetDetail[];
}>;

export type SessionProgress = Readonly<{
  completed: number;
  planned: number;
  percent: number | null;
}>;

export type SessionRecommendation = Readonly<{
  id: string;
  exerciseId: string;
  exerciseName: string;
  status: "pending" | "accepted" | "rejected" | "invalidated" | "superseded";
  decision: "baseline" | "hold" | "increase" | "retry" | "manual";
  reason: string;
  confidence: "baseline" | "high" | "manual";
  currentLoadGrams: number;
  proposedLoadGrams: number;
  currentTargetReps: readonly number[];
  proposedTargetReps: readonly number[];
  comparableReps: readonly number[];
  rule: "load_reps.double_progression.v1";
  ruleVersion: 1;
}>;

/**
 * A deterministic, read-only non-load progression result. It is derived from
 * immutable session facts (or their effective-history overlay), never stored
 * as a recommendation, and can never change a future target.
 */
export type SessionNonLoadOutcome = Readonly<{
  version: 1;
  exerciseId: string;
  exerciseName: string;
  profile: MetricProfile;
  rule: Readonly<{
    kind: "manual_hold" | "plan_authored";
    id: string;
    version: number;
  }>;
  decision: "hold" | "manual";
  reasonCode: string;
  reason: string;
  currentTarget: MetricTarget;
  proposedTarget: null;
  review: Readonly<{
    actionable: false;
    state: "manual" | "factual";
  }>;
  evidence: Readonly<{
    version: 1;
    metricIdentity: MetricIdentity;
    immutableComparatorDimensions: Readonly<Record<string, unknown>>;
    comparableSourceFacts: readonly MetricObservation[];
    sourceFactCount: number;
  }>;
  source: Readonly<{
    sessionId: string;
    sessionExerciseId: string;
    setIds: readonly string[];
    effectiveRevision: number;
  }>;
}>;

export type SessionDetail = Readonly<{
  id: string;
  status: WorkoutSessionStatus;
  statusLabel: string;
  sourceLabel: string;
  planName: string | null;
  dayName: string | null;
  localDate: string;
  timezone: string;
  startedAtMs: number;
  endedAtMs: number | null;
  durationMs: number | null;
  revision: number;
  /** Present only when the effective-history overlay differs from source facts. */
  corrected?: boolean;
  /** Owner-entered correction context; never sent to diagnostics or effects. */
  ownerNote?: string | null;
  exerciseProgress: SessionProgress;
  workingSetProgress: SessionProgress;
  exercises: readonly SessionExerciseDetail[];
  nonLoadOutcomes: readonly SessionNonLoadOutcome[];
  recommendations: readonly SessionRecommendation[];
  recommendationStatus:
    | "accepted"
    | "kept_current"
    | "pending"
    | "none";
  resumable: boolean;
  readOnly: boolean;
}>;

export type FinishOutcomeResult = Readonly<{
  detail: SessionDetail;
  invalidationScopes: readonly (
    | readonly ["today"]
    | readonly ["session-detail", string]
    | readonly ["workout-completion", string]
  )[];
}>;
