import type {
  HistoryProjectionComparableExposure,
  HistoryProjectionPeriodInput,
} from "../history";
import type {
  MetricIdentity,
  MetricExposure,
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

/** Phase 19's factual dashboard is deliberately separate from the legacy
 * period summary above.  It is a discriminated union so consumers cannot
 * probe a bag of optional Strength and Running fields. */
export type ProgressSport = "All" | "Strength" | "Running";

export type ProgressReadState = "ready" | "empty" | "sparse" | "more_data_needed" | "unavailable";

export type ProgressAbsenceReason =
  | "exact_effort_evidence_insufficient"
  | "no_factual_points"
  | "incompatible_facts";

export type ProgressEvidenceSufficiency = "source_summary" | "source_laps" | "sampled";

export type ProgressRunningTimeBasis = "elapsed" | "timer" | "moving";

/** A normalized, accepted source fact; screen and projector code never parse a
 * provider payload or infer an arbitrary effort from chart samples. */
export type ProgressRunningActivityFact = Readonly<{
  activityId: string;
  sourceIdentity: string;
  sourceRevision: number;
  startedAtMs: number;
  localDate: string;
  lifecycle: "active" | "removed";
  accepted: boolean;
  fixture: boolean;
  distanceMeters: number;
  durationSeconds: number;
  timeBasis: ProgressRunningTimeBasis;
  evidence: ProgressEvidenceSufficiency;
  /** null means the payload has no source-reported exact effort basis. */
  exactDistanceMeters: number | null;
}>;

export type ProgressGoalRevision = Readonly<{
  targetId: string;
  sport: "Strength" | "Running";
  distanceMeters?: number;
  targetDurationSeconds: number | null;
  targetLocalDate?: string;
  effectiveAtMs: number;
  revision: number;
  /** Owner/source ordering is the first deterministic All-goal tie break. */
  sourceOrder: number;
}>;

export type ProgressRunningEffort = Readonly<{
  activityId: string;
  sourceIdentity: string;
  sourceRevision: number;
  localDate: string;
  durationSeconds: number;
  timeBasis: ProgressRunningTimeBasis;
  evidence: Exclude<ProgressEvidenceSufficiency, "sampled">;
}>;

export type ProgressRunningGoal = Readonly<{
  distanceMeters: number;
  timeBasis: ProgressRunningTimeBasis;
  latest: ProgressRunningEffort;
  best: ProgressRunningEffort;
  target: Readonly<{ targetId: string; durationSeconds: number }> | null;
  targetAtDate: Readonly<{ targetId: string; durationSeconds: number }> | null;
  history: readonly Readonly<{
    effort: ProgressRunningEffort;
    targetAtDate: Readonly<{ targetId: string; durationSeconds: number }> | null;
  }>[];
  evidenceCount: number;
}>;

export type ProgressRunningDashboardProjection = Readonly<{
  sport: "Running";
  state: ProgressReadState;
  goals: readonly ProgressRunningGoal[];
  absenceReason?: ProgressAbsenceReason;
}>;

export type ProgressAllDashboardProjection = Readonly<{
  sport: "All";
  state: ProgressReadState;
  primaryGoal: ProgressGoalRevision | null;
}>;

export type ProgressStrengthDashboardProjection = Readonly<{
  sport: "Strength";
  state: ProgressReadState;
  facts: readonly ProgressRecord[];
}>;

/** Effective Strength facts retain the metric boundary and revision fence used
 * to decide whether a pending recommendation is still actionable. */
export type ProgressStrengthFactInput = Readonly<{
  record: ProgressRecord;
  metricExposure: MetricExposure;
  effectiveRevision: number;
  targetRevision: number;
  recommendation?: Readonly<{
    status: "pending" | "accepted" | "rejected" | "invalidated" | "superseded";
    sourceRevision: number;
    targetRevision: number;
  }>;
}>;

export type ProgressDashboardProjection =
  | ProgressAllDashboardProjection
  | ProgressStrengthDashboardProjection
  | ProgressRunningDashboardProjection;

export type ProgressDashboardInput = Readonly<{
  sport: ProgressSport;
  running?: Readonly<{
    activities: readonly ProgressRunningActivityFact[];
    targets: readonly ProgressGoalRevision[];
  }>;
  strength?: Readonly<{
    facts?: readonly ProgressRecord[];
    candidates?: readonly ProgressStrengthFactInput[];
  }>;
  goals?: readonly ProgressGoalRevision[];
}>;

/**
 * Repository-owned refresh facts. Automatic refresh is deliberately bounded:
 * callers can react to a new source generation, but cannot turn an updating
 * projection into a permanent polling loop.
 */
export type ProgressRefreshMetadata = Readonly<{
  generation: number;
  automaticRefresh: Readonly<{
    maxAttempts: number;
    backoffMs: readonly number[];
    terminal: ProgressProjectionFreshness;
  }>;
}>;
