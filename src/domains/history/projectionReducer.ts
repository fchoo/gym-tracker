import {
  aggregateMetricObservations,
  metricIdentityKey,
  parseMetricObservation,
  parseMetricTarget,
  type MetricAggregate,
  type MetricIdentity,
  type MetricObservation,
  type MetricTarget,
} from "../metrics";
import {
  type EffectiveMetricHistorySet,
  buildExerciseMetricHistory,
} from "./metricHistory";
import {
  metricComparatorBoundaryKey,
} from "./historySubjects";
import {
  parseHistoryLocalDate,
} from "./contracts";

export type EffectiveHistoryProjectionSession = Readonly<{
  sessionId: string;
  localDate: string;
  lifecycle: "active" | "voided";
  completedExercises: number;
  plannedExercises: number;
  completedWorkingSets: number;
  plannedWorkingSets: number;
  metricSets: readonly EffectiveMetricHistorySet[];
  recommendationScopes: readonly string[];
}>;

export type HistoryProjectionRecordCandidate = Readonly<{
  exerciseId: string;
  identityKey: string;
  comparatorKey: string;
  sessionId: string;
  localDate: string;
  setId: string;
  setOrdinal: number;
  completedAtMs: number;
  targetJson: string;
  observationJson: string;
}>;

export type HistoryProjectionComparableExposure = HistoryProjectionRecordCandidate;

export type HistoryProjectionMetricAggregate = Readonly<{
  exerciseId: string;
  identityKey: string;
  comparatorKey: string;
  referenceTargetJson: string;
  aggregate: MetricAggregate;
  aggregateJson: string;
}>;

export type HistoryProjectionPeriodInput = Readonly<{
  localDate: string;
  completedExercises: number;
  plannedExercises: number;
  completedWorkingSets: number;
  plannedWorkingSets: number;
  comparableExposureCount: number;
}>;

export type HistoryProjection = Readonly<{
  recordCandidates: readonly HistoryProjectionRecordCandidate[];
  comparableExposures: readonly HistoryProjectionComparableExposure[];
  metricAggregates: readonly HistoryProjectionMetricAggregate[];
  periodInputs: readonly HistoryProjectionPeriodInput[];
  recommendationInvalidationScopes: readonly string[];
}>;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const object = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(object).sort().map((key) =>
    `${JSON.stringify(key)}:${stableJson(object[key])}`
  ).join(",")}}`;
}

function nonEmpty(value: string, code: string): string {
  if (value.trim() === "") {
    throw new TypeError(code);
  }
  return value;
}

function nonnegativeInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(code);
  }
  return value;
}

function normalizeSet(set: EffectiveMetricHistorySet): Readonly<{
  identity: MetricIdentity;
  target: MetricTarget;
  observation: MetricObservation;
}> {
  if (set.observation === null || set.completedAtMs === null) {
    throw new TypeError("history_projection_comparable_set_invalid");
  }
  const identity = set.identity;
  return Object.freeze({
    identity,
    target: parseMetricTarget(identity, set.target),
    observation: parseMetricObservation(identity, set.observation),
  });
}

function rowForSet(
  set: EffectiveMetricHistorySet,
): HistoryProjectionComparableExposure {
  const normalized = normalizeSet(set);
  return Object.freeze({
    exerciseId: set.exerciseId,
    identityKey: metricIdentityKey(normalized.identity),
    comparatorKey: metricComparatorBoundaryKey({
      identity: normalized.identity,
      target: normalized.target,
    }),
    sessionId: set.sessionId,
    localDate: set.localDate,
    setId: set.setId,
    setOrdinal: set.setOrdinal,
    completedAtMs: set.completedAtMs!,
    targetJson: stableJson(normalized.target),
    observationJson: stableJson(normalized.observation),
  });
}

function compareExposureRows(
  left: HistoryProjectionComparableExposure,
  right: HistoryProjectionComparableExposure,
): number {
  return left.exerciseId.localeCompare(right.exerciseId)
    || left.identityKey.localeCompare(right.identityKey)
    || left.comparatorKey.localeCompare(right.comparatorKey)
    || left.completedAtMs - right.completedAtMs
    || left.sessionId.localeCompare(right.sessionId)
    || left.setOrdinal - right.setOrdinal
    || left.setId.localeCompare(right.setId);
}

function compareAggregateRows(
  left: HistoryProjectionMetricAggregate,
  right: HistoryProjectionMetricAggregate,
): number {
  return left.exerciseId.localeCompare(right.exerciseId)
    || left.identityKey.localeCompare(right.identityKey)
    || left.comparatorKey.localeCompare(right.comparatorKey)
    || left.referenceTargetJson.localeCompare(right.referenceTargetJson);
}

function metricSetsForActiveSessions(
  sessions: readonly EffectiveHistoryProjectionSession[],
): readonly EffectiveMetricHistorySet[] {
  const sets: EffectiveMetricHistorySet[] = [];
  for (const session of sessions) {
    if (session.lifecycle !== "active") {
      continue;
    }
    for (const set of session.metricSets) {
      if (set.sessionId !== session.sessionId || set.localDate !== session.localDate) {
        throw new TypeError("history_projection_metric_set_session_mismatch");
      }
      sets.push(set);
    }
  }
  return Object.freeze(sets);
}

function activePeriodInputs(
  sessions: readonly EffectiveHistoryProjectionSession[],
  comparableExposures: readonly HistoryProjectionComparableExposure[],
): readonly HistoryProjectionPeriodInput[] {
  const comparableByDate = new Map<string, number>();
  for (const exposure of comparableExposures) {
    comparableByDate.set(
      exposure.localDate,
      (comparableByDate.get(exposure.localDate) ?? 0) + 1,
    );
  }
  const totals = new Map<string, {
    completedExercises: number;
    plannedExercises: number;
    completedWorkingSets: number;
    plannedWorkingSets: number;
  }>();
  for (const session of sessions) {
    if (session.lifecycle !== "active") {
      continue;
    }
    const localDate = parseHistoryLocalDate(session.localDate);
    const current = totals.get(localDate) ?? {
      completedExercises: 0,
      plannedExercises: 0,
      completedWorkingSets: 0,
      plannedWorkingSets: 0,
    };
    current.completedExercises += nonnegativeInteger(
      session.completedExercises,
      "history_projection_completed_exercises_invalid",
    );
    current.plannedExercises += nonnegativeInteger(
      session.plannedExercises,
      "history_projection_planned_exercises_invalid",
    );
    current.completedWorkingSets += nonnegativeInteger(
      session.completedWorkingSets,
      "history_projection_completed_working_sets_invalid",
    );
    current.plannedWorkingSets += nonnegativeInteger(
      session.plannedWorkingSets,
      "history_projection_planned_working_sets_invalid",
    );
    totals.set(localDate, current);
  }
  return Object.freeze(
    [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([localDate, total]) => Object.freeze({
        localDate,
        ...total,
        comparableExposureCount: comparableByDate.get(localDate) ?? 0,
      })),
  );
}

function recommendationScopes(
  sessions: readonly EffectiveHistoryProjectionSession[],
): readonly string[] {
  return Object.freeze(
    [...new Set(sessions
      .filter(({ lifecycle }) => lifecycle === "active")
      .flatMap(({ recommendationScopes: scopes }) => scopes.map((scope) =>
        nonEmpty(scope, "history_projection_recommendation_scope_invalid")
      )))]
      .sort((left, right) => left.localeCompare(right)),
  );
}

/**
 * Produces every disposable history projection from effective source facts.
 * Targeted and full rebuilds intentionally invoke this exact reducer; callers
 * only choose which deterministic rows to replace.
 */
export function reduceHistoryProjection(input: Readonly<{
  sessions: readonly EffectiveHistoryProjectionSession[];
}>): HistoryProjection {
  const activeSets = metricSetsForActiveSessions(input.sessions);
  const exerciseIds = [...new Set(activeSets.map(({ exerciseId }) =>
    nonEmpty(exerciseId, "history_projection_exercise_id_invalid")
  ))].sort((left, right) => left.localeCompare(right));
  const comparableExposures: HistoryProjectionComparableExposure[] = [];
  const recordCandidates: HistoryProjectionRecordCandidate[] = [];
  const metricAggregates: HistoryProjectionMetricAggregate[] = [];

  for (const exerciseId of exerciseIds) {
    const history = buildExerciseMetricHistory({
      exerciseId,
      sets: activeSets,
    });
    for (const segment of history.segments) {
      const segmentRows = segment.comparableSets.map(rowForSet);
      comparableExposures.push(...segmentRows);
      if (segment.best !== null) {
        recordCandidates.push(rowForSet(segment.best));
      }
      if (segment.average !== null) {
        const identity = segment.identity;
        const aggregate = aggregateMetricObservations(
          identity,
          segment.comparableSets.map(({ observation }) => observation!),
        );
        if (aggregate === null) {
          throw new Error("history_projection_aggregate_missing");
        }
        metricAggregates.push(Object.freeze({
          exerciseId,
          identityKey: metricIdentityKey(identity),
          comparatorKey: metricComparatorBoundaryKey({
            identity,
            target: segment.referenceTarget,
          }),
          referenceTargetJson: stableJson(segment.referenceTarget),
          aggregate,
          aggregateJson: stableJson(aggregate),
        }));
      }
    }
  }

  const normalizedExposures = Object.freeze(
    comparableExposures.sort(compareExposureRows),
  );
  return Object.freeze({
    recordCandidates: Object.freeze(recordCandidates.sort(compareExposureRows)),
    comparableExposures: normalizedExposures,
    metricAggregates: Object.freeze(metricAggregates.sort(compareAggregateRows)),
    periodInputs: activePeriodInputs(input.sessions, normalizedExposures),
    recommendationInvalidationScopes: recommendationScopes(input.sessions),
  });
}
