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

type RelativeStrengthProjection = Readonly<{
  loadGrams: number;
  relativeLoad: number;
  basis: Readonly<{
    grams: number;
    localDate: string;
  }>;
}>;

export type EffectiveMetricHistorySet = Readonly<{
  sessionId: string;
  localDate: string;
  exerciseId: string;
  exerciseName: string;
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
  /** Effective immutable source revision used by source navigation. */
  sourceRevision?: number;
  /** Target captured at this observation's effective source date. */
  targetAtDate?: MetricTarget;
  /** Optional view-only dated projection. No command authority crosses this field. */
  relativeStrength?: RelativeStrengthProjection | null;
  historyStatus?: "accepted_current" | "corrected_effective";
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
  exerciseName?: string | null;
  freshness?: "current" | "updating" | "unavailable";
  segments: readonly MetricHistorySegment[];
  warmupVisits: readonly EffectiveMetricHistorySet[];
}>;

export type LoadMetricHistoryView = "load" | "relative";

export type LoadMetricHistoryPoint = Readonly<{
  sessionId: string;
  sourceRevision: number | null;
  localDate: string;
  value: number;
  targetAtDate: number;
  basisDisclosure: string | null;
  statusLabel: "Accepted/current" | "Corrected effective fact";
}>;

export type LoadMetricHistorySeries = Readonly<{
  view: LoadMetricHistoryView;
  points: readonly LoadMetricHistoryPoint[];
  currentTarget: number;
  relativeAvailable: boolean;
}>;

/** A bounded, one-point-per-session view for the Active Workout trend sheet. */
export type ExerciseMetricTrend = Readonly<{
  identity: MetricIdentity;
  referenceTarget: MetricTarget;
  sessions: readonly EffectiveMetricHistorySet[];
  recent: EffectiveMetricHistorySet;
  best: EffectiveMetricHistorySet;
  previous: EffectiveMetricHistorySet | null;
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
    exerciseName: relevant
      .filter(({ exerciseName }) => exerciseName.trim().length > 0)
      .sort(visitOrder)[0]?.exerciseName ?? null,
    freshness: "current",
    segments: Object.freeze(segments),
    warmupVisits: Object.freeze(warmupVisits),
  });
}

function loadTargetGrams(target: MetricTarget): number | null {
  return target.profile === "load_reps" ? target.loadGrams : null;
}

function basisDisclosure(projection: RelativeStrengthProjection): string {
  const kilograms = projection.basis.grams / 1_000;
  const [year, month, day] = projection.basis.localDate.split("-").map(Number);
  const formattedDate = year === undefined || month === undefined || day === undefined
    ? projection.basis.localDate
    : new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
      year: "numeric",
    }).format(new Date(Date.UTC(year, month - 1, day)));
  return `Using ${kilograms} kg from ${formattedDate}`;
}

/**
 * Converts one already-comparable load segment into one immutable chart/data
 * series. Temporal selection has already happened below this boundary.
 */
export function projectLoadMetricHistorySeries(
  segment: MetricHistorySegment,
  view: LoadMetricHistoryView,
): LoadMetricHistorySeries | null {
  if (segment.identity.profile !== "load_reps") return null;
  const referenceTargetGrams = loadTargetGrams(segment.referenceTarget);
  if (referenceTargetGrams === null) return null;
  const ordered = [...segment.comparableSets].sort((left, right) =>
    left.completedAtMs! - right.completedAtMs!
    || left.sessionId.localeCompare(right.sessionId)
    || left.setOrdinal - right.setOrdinal
    || left.setId.localeCompare(right.setId)
  );
  const relativeAvailable = ordered.length > 0
    && ordered.every(({ relativeStrength }) => relativeStrength != null);
  if (view === "relative" && !relativeAvailable) return null;
  const points = ordered.flatMap((set): readonly LoadMetricHistoryPoint[] => {
    if (set.observation?.profile !== "load_reps") return [];
    const targetGrams = loadTargetGrams(set.targetAtDate ?? set.target);
    if (targetGrams === null) return [];
    const relative = set.relativeStrength ?? null;
    if (view === "relative" && relative === null) return [];
    const basisGrams = relative?.basis.grams ?? null;
    return [Object.freeze({
      sessionId: set.sessionId,
      sourceRevision: Number.isSafeInteger(set.sourceRevision) && set.sourceRevision! > 0
        ? set.sourceRevision!
        : null,
      localDate: set.localDate,
      value: view === "load"
        ? set.observation.loadGrams / 1_000
        : relative!.relativeLoad,
      targetAtDate: view === "load"
        ? targetGrams / 1_000
        : targetGrams / basisGrams!,
      basisDisclosure: relative === null ? null : basisDisclosure(relative),
      statusLabel: set.historyStatus === "corrected_effective"
        ? "Corrected effective fact"
        : "Accepted/current",
    })];
  });
  const latestBasis = ordered.at(-1)?.relativeStrength?.basis.grams ?? null;
  return Object.freeze({
    view,
    points: Object.freeze(points),
    currentTarget: view === "load"
      ? referenceTargetGrams / 1_000
      : referenceTargetGrams / latestBasis!,
    relativeAvailable,
  });
}

/**
 * Keeps Active's compact trend factual: only one completed working-set result
 * per compatible session, newest first, with no target/profile blending.
 */
export function projectComparableExerciseTrend(
  history: ExerciseMetricHistory,
): ExerciseMetricTrend | null {
  const segments = [...history.segments]
    .filter(({ comparableSets }) => comparableSets.length > 0)
    .sort((left, right) =>
      visitOrder(left.comparableSets[0]!, right.comparableSets[0]!)
      || metricIdentityKey(left.identity).localeCompare(metricIdentityKey(right.identity))
    );
  const segment = segments[0];
  if (segment === undefined) {
    return null;
  }
  const seenSessionIds = new Set<string>();
  const sessions = segment.comparableSets.filter((set) => {
    if (seenSessionIds.has(set.sessionId)) {
      return false;
    }
    seenSessionIds.add(set.sessionId);
    return true;
  }).slice(0, 6);
  const recent = sessions[0];
  if (recent === undefined) {
    return null;
  }
  const candidates = sessions.map((set) => ({
    observation: set.observation!,
    completedAtMs: set.completedAtMs!,
    sessionId: set.sessionId,
    setOrdinal: set.setOrdinal,
    setId: set.setId,
  }));
  const bestCandidate = selectBestMetricCandidate({
    identity: segment.identity,
    target: segment.referenceTarget,
    candidates,
  });
  const best = bestCandidate === null
    ? recent
    : sessions.find(({ setId }) => setId === bestCandidate.setId) ?? recent;
  return Object.freeze({
    identity: segment.identity,
    referenceTarget: segment.referenceTarget,
    sessions: Object.freeze(sessions),
    recent,
    best,
    previous: sessions[1] ?? null,
  });
}
