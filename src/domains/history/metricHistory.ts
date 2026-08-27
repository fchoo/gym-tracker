import type {
  MetricAggregate,
} from "../metrics";
import {
  aggregateMetricObservations,
  areMetricExposuresComparable,
  isMetricExposureEligible,
  metricIdentityKey,
  parseMetricTarget,
  selectBestMetricCandidate,
  selectLastMetricCandidate,
  type MetricCandidate,
  type MetricExposure,
  type MetricIdentity,
  type MetricObservation,
  type MetricTarget,
} from "../metrics";

export type EffectiveMetricHistorySet = Readonly<{
  sessionId: string;
  localDate: string;
  exerciseId: string;
  identity: MetricIdentity;
  target: MetricTarget;
  observation: MetricObservation | null;
  sessionStatus: MetricExposure["sessionStatus"];
  setKind: MetricExposure["setKind"];
  setStatus: MetricExposure["setStatus"];
  plannedWorkingSets: number;
  completedWorkingSets: number;
  setId: string;
  setOrdinal: number;
  completedAtMs: number | null;
}>;

export type MetricHistorySegment = Readonly<{
  identity: MetricIdentity;
  referenceTarget: MetricTarget;
  comparableSets: readonly EffectiveMetricHistorySet[];
  best: EffectiveMetricHistorySet | null;
  average: MetricAggregate | null;
  last: EffectiveMetricHistorySet | null;
}>;

export type ExerciseMetricHistory = Readonly<{
  exerciseId: string;
  segments: readonly MetricHistorySegment[];
  warmupVisits: readonly EffectiveMetricHistorySet[];
}>;

type ComparableEntry = Readonly<{
  set: EffectiveMetricHistorySet;
  exposure: MetricExposure;
  candidate: MetricCandidate;
}>;

type ComparableGroup = Readonly<{
  reference: ComparableEntry;
  entries: readonly ComparableEntry[];
}>;

function exposureFor(set: EffectiveMetricHistorySet): MetricExposure | null {
  if (set.observation === null) {
    return null;
  }
  return {
    exerciseId: set.exerciseId,
    identity: set.identity,
    target: set.target,
    observation: set.observation,
    sessionStatus: set.sessionStatus,
    setKind: set.setKind,
    setStatus: set.setStatus,
    plannedWorkingSets: set.plannedWorkingSets,
    completedWorkingSets: set.completedWorkingSets,
  };
}

function targetSignature(set: EffectiveMetricHistorySet): string {
  return JSON.stringify(parseMetricTarget(set.identity, set.target));
}

function compareSets(
  left: EffectiveMetricHistorySet,
  right: EffectiveMetricHistorySet,
): number {
  return metricIdentityKey(left.identity).localeCompare(metricIdentityKey(right.identity))
    || targetSignature(left).localeCompare(targetSignature(right))
    || left.completedAtMs! - right.completedAtMs!
    || left.sessionId.localeCompare(right.sessionId)
    || left.setOrdinal - right.setOrdinal
    || left.setId.localeCompare(right.setId);
}

function visitOrder(
  left: EffectiveMetricHistorySet,
  right: EffectiveMetricHistorySet,
): number {
  return right.completedAtMs! - left.completedAtMs!
    || left.sessionId.localeCompare(right.sessionId)
    || left.setOrdinal - right.setOrdinal
    || left.setId.localeCompare(right.setId);
}

function comparableEntry(set: EffectiveMetricHistorySet): ComparableEntry | null {
  const exposure = exposureFor(set);
  if (exposure === null || !isMetricExposureEligible(exposure)) {
    return null;
  }
  if (set.completedAtMs === null) {
    throw new Error("history_metric_completed_timestamp_missing");
  }
  return Object.freeze({
    set,
    exposure,
    candidate: Object.freeze({
      observation: set.observation!,
      completedAtMs: set.completedAtMs,
      sessionId: set.sessionId,
      setOrdinal: set.setOrdinal,
      setId: set.setId,
    }),
  });
}

function groupComparableEntries(
  entries: readonly ComparableEntry[],
): readonly ComparableGroup[] {
  const groups: ComparableGroup[] = [];
  for (const entry of entries) {
    const groupIndex = groups.findIndex(({ reference }) =>
      areMetricExposuresComparable(reference.exposure, entry.exposure)
    );
    if (groupIndex === -1) {
      groups.push(Object.freeze({
        reference: entry,
        entries: Object.freeze([entry]),
      }));
      continue;
    }
    const group = groups[groupIndex]!;
    groups[groupIndex] = Object.freeze({
      reference: group.reference,
      entries: Object.freeze([...group.entries, entry]),
    });
  }
  return Object.freeze(groups);
}

function segmentFor(group: ComparableGroup): MetricHistorySegment {
  const ordered = [...group.entries].sort((left, right) =>
    visitOrder(left.set, right.set)
  );
  const candidates = ordered.map(({ candidate }) => candidate);
  const lastCandidate = selectLastMetricCandidate(candidates);
  const referenceTarget = lastCandidate === null
    ? group.reference.set.target
    : ordered.find(({ candidate }) => candidate === lastCandidate)!.set.target;
  const bestCandidate = selectBestMetricCandidate({
    identity: group.reference.set.identity,
    target: referenceTarget,
    candidates,
  });
  const setForCandidate = (candidate: MetricCandidate | null) => candidate === null
    ? null
    : ordered.find(({ candidate: current }) => current === candidate)!.set;
  return Object.freeze({
    identity: group.reference.set.identity,
    referenceTarget,
    comparableSets: Object.freeze(ordered.map(({ set }) => set)),
    best: setForCandidate(bestCandidate),
    average: aggregateMetricObservations(
      group.reference.set.identity,
      ordered.map(({ candidate }) => candidate.observation),
    ),
    last: setForCandidate(lastCandidate),
  });
}

export function buildExerciseMetricHistory(input: Readonly<{
  exerciseId: string;
  sets: readonly EffectiveMetricHistorySet[];
}>): ExerciseMetricHistory {
  const relevant = input.sets.filter(({ exerciseId }) => exerciseId === input.exerciseId);
  const warmupVisits = relevant
    .filter((set) =>
      set.setKind === "warmup"
      && set.setStatus === "completed"
      && set.observation !== null
      && set.completedAtMs !== null
    )
    .sort(visitOrder);
  const comparable = relevant
    .map(comparableEntry)
    .filter((entry): entry is ComparableEntry => entry !== null)
    .sort((left, right) => compareSets(left.set, right.set));
  const segments = groupComparableEntries(comparable)
    .map(segmentFor)
    .sort((left, right) =>
      metricIdentityKey(left.identity).localeCompare(metricIdentityKey(right.identity))
      || JSON.stringify(left.referenceTarget).localeCompare(
        JSON.stringify(right.referenceTarget),
      )
    );
  return Object.freeze({
    exerciseId: input.exerciseId,
    segments: Object.freeze(segments),
    warmupVisits: Object.freeze(warmupVisits),
  });
}
