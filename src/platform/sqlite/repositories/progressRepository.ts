import {
  projectProgressPeriod,
  type ProgressPeriod,
  type ProgressComparableExposure,
  type ProgressPeriodProjection,
  type ProgressProjectionDiagnostic,
  type ProgressProjectionFreshness,
  type ProgressRecommendationReview,
  type ProgressScheduledOpportunity,
} from "../../../domains/progress";
import {
  projectProgressDashboard,
} from "../../../domains/progress/dashboardProjection";
import type {
  ProgressDashboardProjection,
  ProgressGoalRevision,
  ProgressRunningActivityFact,
  ProgressRefreshMetadata,
  ProgressSport,
} from "../../../domains/progress/contracts";
import type {
  EffectiveHistoryProjectionSession,
  HistoryProjectionPeriodInput,
} from "../../../domains/history";
import {
  parseMetricIdentity,
} from "../../../domains/metrics";
import {
  parseRunningGoal,
} from "../../../domains/running/contracts";
import {
  loadEffectiveHistoryProjectionSessions,
} from "./historyRepository";
import {
  ACTIONABLE_RECOMMENDATION_EVIDENCE_VERSION,
  parseActionableRecommendationEvidence,
} from "../../../domains/progression";
import type {
  SqliteKernel,
  SqliteReadTransactionExecutor,
  SqliteSnapshotKernel,
} from "../sqliteKernel";

type RevisionRow = Readonly<{
  subject_id: string;
  revision: number;
  applied_revision: number | null;
}>;

type RebuildAvailabilityRow = Readonly<{
  subject_id: string;
}>;

type PeriodInputRow = Readonly<{
  local_date: string;
  completed_exercises: number;
  planned_exercises: number;
  completed_working_sets: number;
  planned_working_sets: number;
  comparable_exposure_count: number;
}>;

type ComparableExposureRow = Readonly<{
  exercise_id: string;
  identity_key: string;
  comparator_key: string;
  session_id: string;
  local_date: string;
  set_id: string;
  set_ordinal: number;
  completed_at_ms: number;
  target_json: string;
  observation_json: string;
}>;

type OpportunityRow = Readonly<{
  id: string;
  local_date: string;
  outcome: ProgressScheduledOpportunity["outcome"];
  session_id: string | null;
}>;

type MetricSubjectRow = Readonly<{
  subject_id: string;
}>;

type RecommendationReviewRow = Readonly<{
  id: string;
  exercise_id: string;
  exercise_name: string;
  status: ProgressRecommendationReview["status"];
  evidence_json: string;
  current_target_json: string;
  proposed_target_json: string;
  target_id: string;
  evidence_version: number;
  rule_type: string;
  rule_version: number;
  metric_profile: string;
  metric_contract_version: number;
  exercise_metric_generation: number;
  source_revision: number;
  target_revision: number;
  created_at_ms: number;
}>;

type RunningActivityFactRow = Readonly<{
  id: string;
  started_at_ms: number;
  aggregate_json: string;
  opportunity_id: string | null;
}>;

type RunningGoalFactRow = Readonly<{
  id: string;
  plan_id: string;
  revision: number;
  goal_json: string;
  created_at_ms: number;
}>;

type DashboardRunningActivityRow = Readonly<{
  id: string;
  started_at_ms: number;
  aggregate_json: string;
  aggregate_revision: number;
}>;

type BodyweightFactRow = Readonly<{
  id: string;
  owner_id: string;
  current_revision: number;
  local_date: string;
  timezone: string;
  grams: number;
}>;

type SourceAvailability = "available" | "unavailable";

export type ProgressSourceFacts = Readonly<{
  running: Readonly<{
    kind: SourceAvailability;
    activityKind: SourceAvailability;
    goalKind: SourceAvailability;
    activities: readonly Readonly<{
      id: string; startedAtMs: number; localDate: string; opportunityId: string | null;
      distanceMeters: number; durationMs: number;
    }>[];
    goals: readonly Readonly<{ id: string; planId: string; revision: number; goalJson: string; }>[];
  }>;
  bodyweight: Readonly<{
    kind: SourceAvailability;
    entries: readonly Readonly<{
      id: string; ownerId: string; revision: number; localDate: string; timezone: string; grams: number;
    }>[];
  }>;
}>;

export type ProgressRepositoryRead = Readonly<{
  period: ProgressPeriod;
  freshness: ProgressProjectionFreshness;
  projection: ProgressPeriodProjection | null;
  /** Present for the Phase 19 sport-aware runtime path. */
  sport?: ProgressSport;
  dashboard?: ProgressDashboardProjection | null;
  refresh?: ProgressRefreshMetadata;
  diagnostic?: ProgressProjectionDiagnostic;
  sourceFacts?: ProgressSourceFacts;
}>;

export type ProgressRepository = Readonly<{
  load(input: Readonly<{
    /** Optional only while the legacy Progress screen is migrated in Plan 19-03. */
    sport?: ProgressSport;
    period: ProgressPeriod;
    nowLocalDate: string;
  }>): Promise<ProgressRepositoryRead>;
}>;

const ALL_PERIOD_SUBJECT_ID = 'history-subject/v1:["period","all"]';
const ALL_TIME_PAGE_SIZE = 500;
const BOUNDED_REFRESH_BACKOFF_MS = Object.freeze([250, 1_000, 4_000] as const);

function refreshMetadata(generation: number, terminal: ProgressProjectionFreshness): ProgressRefreshMetadata {
  return Object.freeze({
    generation,
    automaticRefresh: Object.freeze({
      maxAttempts: BOUNDED_REFRESH_BACKOFF_MS.length,
      backoffMs: BOUNDED_REFRESH_BACKOFF_MS,
      terminal,
    }),
  });
}

function rangeStart(period: ProgressPeriod, nowLocalDate: string): string | null {
  const date = new Date(`${nowLocalDate}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) return null;
  const days = period === "4_weeks" ? 27 : period === "12_weeks" ? 83 : null;
  if (days === null) return null;
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function withToSortedCompatibility<Result>(operation: () => Result): Result {
  const arrayPrototype = Array.prototype as {
    toSorted?: <Value>(
      this: readonly Value[],
      compareFn?: (left: Value, right: Value) => number,
    ) => Value[];
  };
  if (arrayPrototype.toSorted !== undefined) {
    return operation();
  }
  Object.defineProperty(arrayPrototype, "toSorted", {
    configurable: true,
    enumerable: false,
    value: function toSorted<Value>(
      this: readonly Value[],
      compareFn?: (left: Value, right: Value) => number,
    ): Value[] {
      return [...this].sort(compareFn);
    },
    writable: true,
  });
  try {
    return operation();
  } finally {
    delete arrayPrototype.toSorted;
  }
}

function freshnessFor(rows: readonly RevisionRow[]): ProgressProjectionFreshness {
  return rows.every(({ revision, applied_revision }) => applied_revision === revision)
    ? "current"
    : "updating";
}

function diagnosticForSubjects(input: Readonly<{
  code: ProgressProjectionDiagnostic["code"];
  subjectIds: readonly string[];
  metricSubjectIds: ReadonlySet<string>;
}>): ProgressProjectionDiagnostic {
  const affectedSubjects = new Set<
    ProgressProjectionDiagnostic["affectedSubjects"][number]
  >();
  for (const subjectId of input.subjectIds) {
    if (subjectId === ALL_PERIOD_SUBJECT_ID) {
      affectedSubjects.add("all_period");
    }
    if (input.metricSubjectIds.has(subjectId)) {
      affectedSubjects.add("exercise_metric");
    }
  }
  return Object.freeze({
    code: input.code,
    affectedSubjects: Object.freeze([
      ...(affectedSubjects.has("all_period") ? ["all_period" as const] : []),
      ...(affectedSubjects.has("exercise_metric")
        ? ["exercise_metric" as const]
        : []),
    ]),
  });
}

function periodInputFromRow(row: PeriodInputRow): HistoryProjectionPeriodInput {
  return Object.freeze({
    localDate: row.local_date,
    completedExercises: row.completed_exercises,
    plannedExercises: row.planned_exercises,
    completedWorkingSets: row.completed_working_sets,
    plannedWorkingSets: row.planned_working_sets,
    comparableExposureCount: row.comparable_exposure_count,
  });
}

function exposureFromRow(
  row: ComparableExposureRow,
  effectiveSetsById: ReadonlyMap<string, EffectiveHistoryProjectionSession["metricSets"][number]>,
): ProgressComparableExposure {
  const effectiveSet = effectiveSetsById.get(`${row.session_id}\u0000${row.set_id}`);
  if (
    effectiveSet === undefined
    || effectiveSet.exerciseId !== row.exercise_id
    || effectiveSet.sessionId !== row.session_id
  ) {
    throw new Error("progress_effective_exercise_name_unavailable");
  }
  return Object.freeze({
    exerciseId: row.exercise_id,
    exerciseName: effectiveSet.exerciseName,
    identityKey: row.identity_key,
    comparatorKey: row.comparator_key,
    sessionId: row.session_id,
    localDate: row.local_date,
    setId: row.set_id,
    setOrdinal: row.set_ordinal,
    completedAtMs: row.completed_at_ms,
    targetJson: row.target_json,
    observationJson: row.observation_json,
  });
}

function opportunityFromRow(row: OpportunityRow): ProgressScheduledOpportunity {
  return Object.freeze({
    id: row.id,
    localDate: row.local_date,
    outcome: row.outcome,
    ...(row.session_id === null ? {} : { sessionId: row.session_id }),
  });
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

async function loadSourceFacts(
  executor: SqliteReadTransactionExecutor,
): Promise<ProgressSourceFacts> {
  const [activityRows, goalRows, bodyweightRows] = await Promise.all([
    executor.queryAll<RunningActivityFactRow>(
      `SELECT activity.id, activity.started_at_ms, activity.aggregate_json, match.opportunity_id
         FROM imported_activities activity
         JOIN imported_activity_current_lifecycle lifecycle ON lifecycle.activity_id = activity.id
         LEFT JOIN running_activity_current_matches match ON match.activity_id = activity.id
        WHERE lifecycle.removal_state = 'active'
        ORDER BY activity.started_at_ms, activity.id`,
    ),
    executor.queryAll<RunningGoalFactRow>(
      `SELECT id, plan_id, revision, goal_json, created_at_ms
         FROM running_goals ORDER BY plan_id, revision, id`,
    ),
    executor.queryAll<BodyweightFactRow>(
      `SELECT entry.id, entry.owner_id, entry.current_revision, measurement.local_date, measurement.timezone, measurement.grams
         FROM bodyweight_entries entry
         JOIN bodyweight_entry_events measurement ON measurement.entry_id = entry.id
          AND measurement.revision = entry.current_revision
        WHERE entry.lifecycle = 'active' AND measurement.local_date IS NOT NULL
        ORDER BY measurement.local_date DESC, entry.id`,
    ),
  ]);
  const activities = activityRows.flatMap((row) => {
    const aggregate = parseJsonRecord(row.aggregate_json);
    const normalized = aggregate?.normalized !== null && typeof aggregate?.normalized === "object" && !Array.isArray(aggregate.normalized)
      ? aggregate.normalized as Record<string, unknown> : null;
    const localDate = stringValue(aggregate, "confirmed_local_date");
    const distanceMeters = normalized?.distance_meters;
    const durationMs = normalized?.duration_ms;
    if (localDate === null || !positiveSafeInteger(distanceMeters) || !positiveSafeInteger(durationMs)) return [];
    return [Object.freeze({ id: row.id, startedAtMs: row.started_at_ms, localDate, opportunityId: row.opportunity_id, distanceMeters, durationMs })];
  });
  const goals = goalRows.flatMap((row) => {
    const goal = parseJsonRecord(row.goal_json);
    return stringValue(goal, "planId") === row.plan_id ? [Object.freeze({ id: row.id, planId: row.plan_id, revision: row.revision, goalJson: row.goal_json })] : [];
  });
  const entries = bodyweightRows.flatMap((row) => positiveSafeInteger(row.grams)
    ? [Object.freeze({ id: row.id, ownerId: row.owner_id, revision: row.current_revision, localDate: row.local_date, timezone: row.timezone, grams: row.grams })] : []);
  const activityKind: SourceAvailability = activities.length === 0 ? "unavailable" : "available";
  const goalKind: SourceAvailability = goals.length === 0 ? "unavailable" : "available";
  return Object.freeze({
    running: Object.freeze({ kind: activityKind === "available" || goalKind === "available" ? "available" : "unavailable", activityKind, goalKind, activities: Object.freeze(activities), goals: Object.freeze(goals) }),
    bodyweight: Object.freeze({ kind: entries.length === 0 ? "unavailable" : "available", entries: Object.freeze(entries) }),
  });
}

function isLocalDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

function durationFromNormalized(
  normalized: Record<string, unknown>,
): Readonly<{ seconds: number; timeBasis: ProgressRunningActivityFact["timeBasis"] }> | null {
  for (const [key, timeBasis] of [
    ["elapsed_ms", "elapsed"],
    ["timer_ms", "timer"],
    ["moving_ms", "moving"],
  ] as const) {
    const milliseconds = normalized[key];
    if (positiveSafeInteger(milliseconds) && milliseconds % 1_000 === 0) {
      return Object.freeze({ seconds: milliseconds / 1_000, timeBasis });
    }
  }
  return null;
}

function evidenceFromAggregate(
  aggregate: Record<string, unknown>,
): ProgressRunningActivityFact["evidence"] {
  const fidelity = aggregate.fidelity_by_channel;
  const exactEffortBasis = fidelity !== null
    && typeof fidelity === "object"
    && !Array.isArray(fidelity)
    ? (fidelity as Record<string, unknown>).exact_effort_basis
    : aggregate.sample_fidelity;
  return exactEffortBasis === "source_summary" || exactEffortBasis === "source_laps"
    ? exactEffortBasis
    : "sampled";
}

async function loadDashboardFacts(
  executor: SqliteReadTransactionExecutor,
): Promise<Readonly<{
  activities: readonly ProgressRunningActivityFact[];
  goals: readonly ProgressGoalRevision[];
}>> {
  const [activityRows, goalRows] = await Promise.all([
    executor.queryAll<DashboardRunningActivityRow>(
      `SELECT activity.id, activity.started_at_ms, activity.aggregate_json,
              lifecycle.aggregate_revision
         FROM imported_activities activity
         JOIN imported_activity_identities identity ON identity.activity_id = activity.id
         JOIN imported_activity_current_lifecycle lifecycle ON lifecycle.activity_id = activity.id
        WHERE identity.removal_state = 'active'
          AND lifecycle.removal_state = 'active'
          AND identity.aggregate_revision = lifecycle.aggregate_revision
        ORDER BY activity.started_at_ms, activity.id
        LIMIT ?`,
      [ALL_TIME_PAGE_SIZE],
    ),
    executor.queryAll<RunningGoalFactRow>(
      `SELECT id, plan_id, revision, goal_json, created_at_ms
         FROM running_goals
         ORDER BY created_at_ms, id
         LIMIT ?`,
      [ALL_TIME_PAGE_SIZE],
    ),
  ]);
  const activities = activityRows.flatMap((row) => {
    const aggregate = parseJsonRecord(row.aggregate_json);
    const normalized = aggregate?.normalized !== null
      && typeof aggregate?.normalized === "object"
      && !Array.isArray(aggregate.normalized)
      ? aggregate.normalized as Record<string, unknown>
      : null;
    const localDate = aggregate === null ? null : stringValue(aggregate, "confirmed_local_date");
    const distanceMeters = normalized?.distance_meters;
    const duration = normalized === null ? null : durationFromNormalized(normalized);
    if (
      aggregate === null
      || normalized === null
      || !isLocalDate(localDate)
      || !positiveSafeInteger(distanceMeters)
      || duration === null
      || !positiveSafeInteger(row.aggregate_revision)
    ) return [];
    const evidence = evidenceFromAggregate(aggregate);
    return [Object.freeze({
      activityId: row.id,
      sourceIdentity: row.id,
      sourceRevision: row.aggregate_revision,
      startedAtMs: row.started_at_ms,
      localDate,
      lifecycle: "active" as const,
      accepted: true,
      fixture: false,
      distanceMeters,
      durationSeconds: duration.seconds,
      timeBasis: duration.timeBasis,
      evidence,
      exactDistanceMeters: evidence === "sampled" ? null : distanceMeters,
    })];
  });
  const goals = goalRows.flatMap((row, sourceOrder) => {
    try {
      const goal = parseRunningGoal(JSON.parse(row.goal_json));
      if (
        goal.planId !== row.plan_id
        || goal.revision !== row.revision
        || !positiveSafeInteger(goal.goalDistanceMeters)
      ) return [];
      const targetDurationSeconds = goal.targetDurationMs === undefined
        ? null
        : goal.targetDurationMs > 0 && goal.targetDurationMs % 1_000 === 0
          ? goal.targetDurationMs / 1_000
          : null;
      return [Object.freeze({
        targetId: row.id,
        sport: "Running" as const,
        distanceMeters: goal.goalDistanceMeters,
        targetDurationSeconds,
        effectiveAtMs: row.created_at_ms,
        revision: row.revision,
        sourceOrder,
      })];
    } catch {
      return [];
    }
  });
  return Object.freeze({ activities: Object.freeze(activities), goals: Object.freeze(goals) });
}

function stringValue(
  source: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0;
}

function recommendationFromRow(
  row: RecommendationReviewRow,
): ProgressRecommendationReview | null {
  try {
    if (
      row.evidence_version !== ACTIONABLE_RECOMMENDATION_EVIDENCE_VERSION
      || row.rule_type !== "load_reps"
    ) {
      return null;
    }
    const identity = parseMetricIdentity({
      profile: row.metric_profile,
      contractVersion: row.metric_contract_version,
      exerciseMetricGeneration: row.exercise_metric_generation,
    });
    const evidence = parseJsonRecord(row.evidence_json);
    const rule = evidence?.rule;
    const ruleId = rule !== null && typeof rule === "object" && !Array.isArray(rule)
      ? stringValue(rule as Record<string, unknown>, "id")
      : null;
    const evidenceTargetRevision = evidence?.revisions !== null
      && typeof evidence?.revisions === "object"
      && !Array.isArray(evidence.revisions)
      ? (evidence.revisions as Record<string, unknown>).target
      : null;
    const reason = stringValue(evidence, "reason");
    const confidence = stringValue(evidence, "confidence");
    if (
      ruleId === null
      || reason === null
      || confidence === null
      || !Number.isSafeInteger(row.rule_version)
      || row.rule_version < 1
    ) {
      return null;
    }
    const evidenceBoundTargetRevision = row.status === "pending"
      ? row.target_revision
      : nonNegativeSafeInteger(evidenceTargetRevision)
        ? evidenceTargetRevision
        : null;
    if (evidenceBoundTargetRevision === null) {
      return null;
    }
    const actionable = parseActionableRecommendationEvidence({
      evidence,
      expected: {
        rule: { id: ruleId, version: row.rule_version },
        metricIdentity: identity,
        sourceRevision: row.source_revision,
        // A pending review must still describe the target revision it can
        // safely change. Once a decision commits, the target revision can
        // legitimately advance, so history is verified against its immutable
        // evidence envelope instead of the newer live target.
        targetRevision: evidenceBoundTargetRevision,
        targetId: row.target_id,
        currentTarget: JSON.parse(row.current_target_json),
        proposedTarget: JSON.parse(row.proposed_target_json),
        createdAtMs: row.created_at_ms,
      },
    });
    return Object.freeze({
      id: row.id,
      exerciseId: row.exercise_id,
      exerciseName: row.exercise_name,
      sourceSessionId: actionable.source.sessionId,
      status: row.status,
      lifecycle: row.status,
      rule: actionable.rule,
      confidence: actionable.confidence,
      reason: actionable.reason,
      metricIdentity: actionable.metricIdentity,
      currentTarget: actionable.currentTarget,
      proposedTarget: actionable.proposedTarget,
    });
  } catch {
    return null;
  }
}

/**
 * Reads only disposable Phase 3 projections once their source revisions are
 * current. The no-subject case is a valid new-owner baseline, not a failed
 * analytics query. Any behind subject returns no factual projection so callers
 * cannot accidentally present stale totals as final.
 */
export function createProgressRepository(
  kernel: SqliteKernel,
): ProgressRepository {
  if (kernel.readSnapshot === undefined) {
    throw new Error("progress_snapshot_kernel_required");
  }
  const snapshotKernel = kernel as SqliteSnapshotKernel;
  return Object.freeze({
    async load(input) {
      const sport = input.sport;
      return snapshotKernel.readSnapshot(async (executor) => {
      const metricSubjects = await executor.queryAll<MetricSubjectRow>(
        `SELECT subject_id
         FROM history_subject_revisions
         WHERE subject_id LIKE 'history-subject/v1:["exercise_metric",%'
         ORDER BY subject_id`,
      );
      const subjectIds = [
        ALL_PERIOD_SUBJECT_ID,
        ...metricSubjects.map(({ subject_id }) => subject_id),
      ];
      const metricSubjectIds = new Set(metricSubjects.map(({ subject_id }) => subject_id));
      const placeholders = subjectIds.map(() => "?").join(", " );
      const revisions = await executor.queryAll<RevisionRow>(
        `SELECT subject.subject_id, subject.revision, freshness.applied_revision
         FROM history_subject_revisions subject
         LEFT JOIN history_projection_freshness freshness
           ON freshness.subject_id = subject.subject_id
         WHERE subject.subject_id IN (${placeholders})
         ORDER BY subject.subject_id`,
        subjectIds,
      );
      const hasHistorySubjects = revisions.length > 0;
      const generation = revisions.reduce((current, row) =>
        Math.max(current, row.revision, row.applied_revision ?? 0), 0);
      if (hasHistorySubjects && revisions.length !== subjectIds.length) {
        const presentSubjectIds = new Set(revisions.map(({ subject_id }) => subject_id));
        return Object.freeze({
          period: input.period,
          ...(sport === undefined ? {} : {
            sport,
            dashboard: null,
            refresh: refreshMetadata(generation, "unavailable"),
          }),
          freshness: "unavailable",
          projection: null,
          diagnostic: diagnosticForSubjects({
            code: "history_projection_unavailable",
            subjectIds: subjectIds.filter((subjectId) => !presentSubjectIds.has(subjectId)),
            metricSubjectIds,
          }),
        });
      }
      if (hasHistorySubjects && freshnessFor(revisions) !== "current") {
        const staleSubjectIds = revisions
          .filter(({ revision, applied_revision }) => applied_revision !== revision)
          .map(({ subject_id }) => subject_id);
        const stalePlaceholders = staleSubjectIds.map(() => "?").join(", " );
        const rebuildable = await executor.queryAll<RebuildAvailabilityRow>(
          `SELECT DISTINCT subject_id
           FROM history_rebuild_effects
           WHERE subject_id IN (${stalePlaceholders})
             AND status IN ('pending', 'processing')
           ORDER BY subject_id`,
          staleSubjectIds,
        );
        const rebuildableSubjectIds = new Set(
          rebuildable.map(({ subject_id }) => subject_id),
        );
        const unavailable = staleSubjectIds.some((subjectId) =>
          !rebuildableSubjectIds.has(subjectId)
        );
        return Object.freeze({
          period: input.period,
          ...(sport === undefined ? {} : {
            sport,
            dashboard: null,
            refresh: refreshMetadata(generation, unavailable ? "unavailable" : "updating"),
          }),
          freshness: unavailable ? "unavailable" : "updating",
          projection: null,
          diagnostic: diagnosticForSubjects({
            code: unavailable
              ? "history_projection_unavailable"
              : "history_projection_updating",
            subjectIds: staleSubjectIds,
            metricSubjectIds,
          }),
        });
      }

      const [
        periodRows,
        exposureRows,
        opportunityRows,
        legacyRecommendationRows,
        ownedRecommendationRows,
        sourceSessions,
        sourceFacts,
        dashboardFacts,
      ] = await Promise.all([
        executor.queryAll<PeriodInputRow>(
          `SELECT local_date, completed_exercises, planned_exercises,
                  completed_working_sets, planned_working_sets,
                  comparable_exposure_count
           FROM history_projection_period_inputs
           WHERE subject_id = ?
             AND (? IS NULL OR local_date >= ?)
           ORDER BY local_date`,
          [ALL_PERIOD_SUBJECT_ID, rangeStart(input.period, input.nowLocalDate), rangeStart(input.period, input.nowLocalDate)],
        ),
        executor.queryAll<ComparableExposureRow>(
          `SELECT exercise_id, identity_key, comparator_key, session_id,
                  local_date, set_id, set_ordinal, completed_at_ms,
                  target_json, observation_json
           FROM history_projection_comparable_exposures
           WHERE (? IS NULL OR local_date >= ?)
           ORDER BY exercise_id, identity_key, comparator_key, completed_at_ms,
                    session_id, set_ordinal, set_id
           LIMIT ?`,
          [rangeStart(input.period, input.nowLocalDate), rangeStart(input.period, input.nowLocalDate), ALL_TIME_PAGE_SIZE],
        ),
        executor.queryAll<OpportunityRow>(
          `SELECT id, local_date, outcome, session_id
           FROM owned_plan_schedule_opportunities
           WHERE state = 'consumed'
             AND outcome IS NOT NULL
             AND (? IS NULL OR local_date >= ?)
           ORDER BY local_date, id
           LIMIT ?`,
          [rangeStart(input.period, input.nowLocalDate), rangeStart(input.period, input.nowLocalDate), ALL_TIME_PAGE_SIZE],
        ),
        executor.queryAll<RecommendationReviewRow>(
          `SELECT recommendation.id, recommendation.exercise_id,
                  exercise.name AS exercise_name, recommendation.status,
                  recommendation.evidence_json, recommendation.current_target_json,
                  recommendation.proposed_target_json,
                  recommendation.plan_working_set_target_id AS target_id,
                  recommendation.evidence_version, recommendation.rule_type,
                  recommendation.rule_version,
                  recommendation.metric_profile, recommendation.metric_contract_version,
                  recommendation.exercise_metric_generation, recommendation.source_revision,
                  recommendation.target_revision, recommendation.created_at_ms
           FROM progression_recommendations recommendation
           JOIN exercises exercise ON exercise.id = recommendation.exercise_id
           ORDER BY recommendation.created_at_ms DESC, recommendation.id`,
        ),
        executor.queryAll<RecommendationReviewRow>(
          `SELECT recommendation.id, recommendation.exercise_id,
                  exercise.name AS exercise_name, recommendation.status,
                  recommendation.evidence_json, recommendation.current_target_json,
                  recommendation.proposed_target_json,
                  recommendation.owned_plan_working_set_target_id AS target_id,
                  recommendation.evidence_version, recommendation.rule_type,
                  recommendation.rule_version,
                  recommendation.metric_profile, recommendation.metric_contract_version,
                  recommendation.exercise_metric_generation, recommendation.source_revision,
                  recommendation.target_revision, recommendation.created_at_ms
           FROM owned_progression_recommendations recommendation
           JOIN exercises exercise ON exercise.id = recommendation.exercise_id
           ORDER BY recommendation.created_at_ms DESC, recommendation.id`,
        ),
        loadEffectiveHistoryProjectionSessions(executor),
        loadSourceFacts(executor),
        loadDashboardFacts(executor),
      ]);
      const recommendations = [
        ...legacyRecommendationRows,
        ...ownedRecommendationRows,
      ].flatMap((row) => {
        const recommendation = recommendationFromRow(row);
        return recommendation === null ? [] : [recommendation];
      }).slice().sort((left, right) =>
        left.exerciseName.localeCompare(right.exerciseName) || left.id.localeCompare(right.id)
      );
      const effectiveSetsById = new Map(sourceSessions.flatMap(({ metricSets }) =>
        metricSets.map((set) => [`${set.sessionId}\u0000${set.setId}`, set] as const)
      ));
      const projection = withToSortedCompatibility(() => projectProgressPeriod({
        period: input.period,
        nowLocalDate: input.nowLocalDate,
        periodInputs: periodRows.map(periodInputFromRow),
        comparableExposures: exposureRows.map((row) =>
          exposureFromRow(row, effectiveSetsById)
        ),
        scheduledOpportunities: opportunityRows.map(opportunityFromRow),
        attention: recommendations
          .filter(({ lifecycle }) => lifecycle === "pending")
          .map(({ id, exerciseId, exerciseName, sourceSessionId }) => Object.freeze({
            id,
            exerciseId,
            exerciseName,
            sessionId: sourceSessionId,
          })),
        sourceSessions: sourceSessions.map((session) => Object.freeze({
          sessionId: session.sessionId,
          localDate: session.localDate,
          lifecycle: session.lifecycle,
          exercises: Object.freeze(session.metricSets.map(({
            exerciseId,
            exerciseName,
          }) => Object.freeze({ exerciseId, exerciseName }))),
        })),
        recommendations,
      }));
      const dashboard = sport === undefined ? undefined : withToSortedCompatibility(() =>
        projectProgressDashboard({
          sport,
          running: {
            activities: dashboardFacts.activities,
            targets: dashboardFacts.goals,
          },
          strength: { facts: projection.records },
          goals: dashboardFacts.goals,
        })
      );
      return Object.freeze({
        period: input.period,
        freshness: "current",
        ...(sport === undefined ? { sourceFacts } : {}),
        projection,
        ...(sport === undefined ? {} : {
          sport,
          dashboard,
          refresh: refreshMetadata(generation, "current"),
        }),
      }) as ProgressRepositoryRead;
      }) as Promise<ProgressRepositoryRead>;
    },
  });
}
