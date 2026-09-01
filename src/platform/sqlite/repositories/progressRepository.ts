import {
  projectProgressPeriod,
  type ProgressPeriod,
  type ProgressPeriodProjection,
  type ProgressProjectionDiagnostic,
  type ProgressProjectionFreshness,
  type ProgressRecommendationReview,
  type ProgressScheduledOpportunity,
} from "../../../domains/progress";
import type {
  HistoryProjectionComparableExposure,
  HistoryProjectionPeriodInput,
} from "../../../domains/history";
import {
  parseMetricIdentity,
} from "../../../domains/metrics";
import {
  loadEffectiveHistoryProjectionSessions,
} from "./historyRepository";
import {
  ACTIONABLE_RECOMMENDATION_EVIDENCE_VERSION,
  parseActionableRecommendationEvidence,
} from "../../../domains/progression";
import type {
  SqliteKernel,
} from "../sqliteKernel";

type RevisionRow = Readonly<{
  subject_id: string;
  revision: number;
  applied_revision: number | null;
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

export type ProgressRepositoryRead = Readonly<{
  period: ProgressPeriod;
  freshness: ProgressProjectionFreshness;
  projection: ProgressPeriodProjection | null;
  diagnostic?: ProgressProjectionDiagnostic;
}>;

export type ProgressRepository = Readonly<{
  load(input: Readonly<{
    period: ProgressPeriod;
    nowLocalDate: string;
  }>): Promise<ProgressRepositoryRead>;
}>;

const ALL_PERIOD_SUBJECT_ID = 'history-subject/v1:["period","all"]';

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
    } else if (input.metricSubjectIds.has(subjectId)) {
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
): HistoryProjectionComparableExposure {
  return Object.freeze({
    exerciseId: row.exercise_id,
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
  return Object.freeze({
    async load(input) {
      const metricSubjects = await kernel.queryAll<MetricSubjectRow>(
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
      const revisions = await kernel.queryAll<RevisionRow>(
        `SELECT subject.subject_id, subject.revision, freshness.applied_revision
         FROM history_subject_revisions subject
         LEFT JOIN history_projection_freshness freshness
           ON freshness.subject_id = subject.subject_id
         WHERE subject.subject_id IN (${placeholders})
         ORDER BY subject.subject_id`,
        subjectIds,
      );
      const hasHistorySubjects = revisions.length > 0;
      if (hasHistorySubjects && revisions.length !== subjectIds.length) {
        const presentSubjectIds = new Set(revisions.map(({ subject_id }) => subject_id));
        return Object.freeze({
          period: input.period,
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
        return Object.freeze({
          period: input.period,
          freshness: "updating",
          projection: null,
          diagnostic: diagnosticForSubjects({
            code: "history_projection_updating",
            subjectIds: revisions
              .filter(({ revision, applied_revision }) => applied_revision !== revision)
              .map(({ subject_id }) => subject_id),
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
      ] = await Promise.all([
        kernel.queryAll<PeriodInputRow>(
          `SELECT local_date, completed_exercises, planned_exercises,
                  completed_working_sets, planned_working_sets,
                  comparable_exposure_count
           FROM history_projection_period_inputs
           WHERE subject_id = ?
           ORDER BY local_date`,
          [ALL_PERIOD_SUBJECT_ID],
        ),
        kernel.queryAll<ComparableExposureRow>(
          `SELECT exercise_id, identity_key, comparator_key, session_id,
                  local_date, set_id, set_ordinal, completed_at_ms,
                  target_json, observation_json
           FROM history_projection_comparable_exposures
           ORDER BY exercise_id, identity_key, comparator_key, completed_at_ms,
                    session_id, set_ordinal, set_id`,
        ),
        kernel.queryAll<OpportunityRow>(
          `SELECT id, local_date, outcome, session_id
           FROM owned_plan_schedule_opportunities
           WHERE state = 'consumed'
             AND outcome IS NOT NULL
           ORDER BY local_date, id`,
        ),
        kernel.queryAll<RecommendationReviewRow>(
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
        kernel.queryAll<RecommendationReviewRow>(
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
        loadEffectiveHistoryProjectionSessions(kernel),
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
      return Object.freeze({
        period: input.period,
        freshness: "current",
        projection: withToSortedCompatibility(() => projectProgressPeriod({
          period: input.period,
          nowLocalDate: input.nowLocalDate,
          periodInputs: periodRows.map(periodInputFromRow),
          comparableExposures: exposureRows.map(exposureFromRow),
          scheduledOpportunities: opportunityRows.map(opportunityFromRow),
          attention: recommendations
            .filter(({ lifecycle }) => lifecycle === "pending")
            .map(({ id, exerciseId, sourceSessionId }) => Object.freeze({
              id,
              exerciseId,
              sessionId: sourceSessionId,
            })),
          sourceSessions: sourceSessions.map((session) => Object.freeze({
            sessionId: session.sessionId,
            localDate: session.localDate,
            lifecycle: session.lifecycle,
            exerciseIds: Object.freeze(session.metricSets.map(({ exerciseId }) => exerciseId)),
          })),
          recommendations,
        })),
      });
    },
  });
}
