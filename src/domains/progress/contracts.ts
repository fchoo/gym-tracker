import type {
  HistoryProjectionComparableExposure,
  HistoryProjectionPeriodInput,
} from "../history";
import type {
  MetricIdentity,
  MetricTarget,
} from "../metrics";

export type ProgressPeriod = "4_weeks" | "12_weeks" | "all_time";

export type ProgressProjectionFreshness =
  | "current"
  | "updating"
  | "unavailable";

/**
 * A deliberately coarse explanation for why a progress projection is not
 * currently safe to display. This must never expose a source-row identifier,
 * target, or session detail while a canonical rebuild is in progress.
 */
export type ProgressProjectionDiagnostic = Readonly<{
  code:
    | "history_projection_updating"
    | "history_projection_unavailable";
  affectedSubjects: readonly (
    | "all_period"
    | "exercise_metric"
  )[];
}>;

export type ProgressScheduledOpportunity = Readonly<{
  id: string;
  localDate: string;
  outcome: "completed" | "skipped" | "planned_not_completed" | "advanced" | "rest_day";
  sessionId?: string;
}>;

export type ProgressAttentionItem = Readonly<{
  id: string;
  exerciseId: string;
  exerciseName: string;
  sessionId: string | null;
}>;

export type ProgressExerciseReference = Readonly<{
  exerciseId: string;
  exerciseName: string;
}>;

/**
 * Immutable navigation evidence for a factual progress row. The identifiers
 * always originate from the same selected effective-history window as the
 * value they explain; a missing collection deliberately means no source is
 * available rather than a fabricated analytics fallback.
 */
export type ProgressSourceReference = Readonly<{
  sessionIds: readonly string[];
  /** Stable identities retained for compatibility with non-visual consumers. */
  exerciseIds: readonly string[];
  exercises: readonly ProgressExerciseReference[];
}>;

export type ProgressSummarySourceReferences = Readonly<{
  scheduledOpportunities: ProgressSourceReference;
  workingSets: ProgressSourceReference;
  exerciseStatuses: ProgressSourceReference;
  attention: ProgressSourceReference;
}>;

export type ProgressEffectiveSourceSession = Readonly<{
  sessionId: string;
  localDate: string;
  lifecycle: "active" | "voided";
  exercises: readonly ProgressExerciseReference[];
}>;

export type ProgressComparableExposure = HistoryProjectionComparableExposure & Readonly<{
  exerciseName: string;
}>;

/**
 * A source-backed recommendation review. The current target and proposal are
 * both persisted recommendation facts; callers must not replace a current
 * target with the proposal before a committed acceptance succeeds.
 */
export type ProgressRecommendationReview = Readonly<{
  id: string;
  exerciseId: string;
  exerciseName: string;
  sourceSessionId: string | null;
  status: "pending" | "accepted" | "rejected" | "invalidated" | "superseded";
  lifecycle: "pending" | "accepted" | "rejected" | "invalidated" | "superseded";
  rule: Readonly<{ id: string; version: number }>;
  confidence: string;
  reason: string;
  metricIdentity: MetricIdentity;
  currentTarget: MetricTarget;
  proposedTarget: MetricTarget;
}>;

export type ProgressPeriodProjectionInput = Readonly<{
  period: ProgressPeriod;
  nowLocalDate: string;
  periodInputs: readonly HistoryProjectionPeriodInput[];
  comparableExposures: readonly ProgressComparableExposure[];
  scheduledOpportunities: readonly ProgressScheduledOpportunity[];
  attention: readonly ProgressAttentionItem[];
  sourceSessions?: readonly ProgressEffectiveSourceSession[];
  recommendations?: readonly ProgressRecommendationReview[];
}>;

export type ProgressWindow = Readonly<{
  start: string;
  end: string;
}>;

export type ProgressSummary = Readonly<{
  scheduledOpportunities: Readonly<{ completed: number; planned: number }>;
  workingSets: Readonly<{ completed: number; planned: number }>;
  improvingCount: number;
  holdingCount: number;
  baselineCount: number;
  attentionCount: number;
  sourceReferences: ProgressSummarySourceReferences;
}>;

export type ProgressExerciseStatus = "baseline" | "improving" | "holding";

export type ProgressExercise = Readonly<{
  exerciseId: string;
  exerciseName: string;
  identityKey: string;
  comparatorKey: string;
  status: ProgressExerciseStatus;
  sessionId: string;
  setId: string;
  localDate: string;
}>;

export type ProgressRecord = Readonly<{
  exerciseId: string;
  exerciseName: string;
  identityKey: string;
  comparatorKey: string;
  sessionId: string;
  setId: string;
  localDate: string;
  targetJson: string;
  observationJson: string;
}>;

export type ProgressTrendRow = Readonly<{
  localDate: string;
  scheduledOpportunities: Readonly<{ completed: number; planned: number }>;
  workingSets: Readonly<{ completed: number; planned: number }>;
  sessionIds: readonly string[];
  /** Stable identities retained for compatibility with non-visual consumers. */
  exerciseIds: readonly string[];
  exercises: readonly ProgressExerciseReference[];
}>;

export type ProgressPeriodProjection = Readonly<{
  state: "current" | "baseline" | "hold";
  window: ProgressWindow;
  summary: ProgressSummary;
  records: readonly ProgressRecord[];
  exercises: readonly ProgressExercise[];
  trend: readonly ProgressTrendRow[];
  attention: readonly ProgressAttentionItem[];
  recommendations: readonly ProgressRecommendationReview[];
  stateSourceReferences: ProgressSourceReference;
}>;
