import {
  type HistoryProjectionComparableExposure,
  type HistoryProjectionPeriodInput,
} from "../history";
import {
  compareMetricObservations,
} from "../metrics";
import {
  parseMetricIdentity,
} from "../metrics";
import {
  addLocalDays,
  compareLocalDates,
  parseLocalDate,
} from "../scheduling";
import type {
  ProgressAttentionItem,
  ProgressExercise,
  ProgressExerciseStatus,
  ProgressEffectiveSourceSession,
  ProgressPeriodProjection,
  ProgressPeriodProjectionInput,
  ProgressRecord,
  ProgressScheduledOpportunity,
  ProgressSourceReference,
  ProgressTrendRow,
  ProgressWindow,
} from "./contracts";

type ExposureGroup = Readonly<{
  exerciseId: string;
  identityKey: string;
  comparatorKey: string;
  exposures: readonly HistoryProjectionComparableExposure[];
}>;

type MutableTrend = {
  scheduledCompleted: number;
  scheduledPlanned: number;
  workingCompleted: number;
  workingPlanned: number;
  sessionIds: Set<string>;
  exerciseIds: Set<string>;
};

function compareExposures(
  left: HistoryProjectionComparableExposure,
  right: HistoryProjectionComparableExposure,
): number {
  return left.completedAtMs - right.completedAtMs
    || left.sessionId.localeCompare(right.sessionId)
    || left.setOrdinal - right.setOrdinal
    || left.setId.localeCompare(right.setId);
}

function parseIdentityKey(value: string) {
  const [profile, contractVersion, exerciseMetricGeneration, ...extra] = value.split(":");
  if (
    profile === undefined
    || contractVersion === undefined
    || exerciseMetricGeneration === undefined
    || extra.length > 0
  ) {
    throw new TypeError("progress_metric_identity_key_invalid");
  }
  return parseMetricIdentity({
    profile,
    contractVersion: Number(contractVersion),
    exerciseMetricGeneration: Number(exerciseMetricGeneration),
  });
}

function requireNonEmpty(value: string, code: string): string {
  if (value.trim() === "") {
    throw new TypeError(code);
  }
  return value;
}

function requireCount(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(code);
  }
  return value;
}

function within(window: ProgressWindow, value: string): boolean {
  const date = parseLocalDate(value);
  return compareLocalDates(date, parseLocalDate(window.start)) !== -1
    && compareLocalDates(date, parseLocalDate(window.end)) !== 1;
}

function windowFor(input: ProgressPeriodProjectionInput): ProgressWindow {
  const end = parseLocalDate(input.nowLocalDate);
  if (input.period === "4_weeks") {
    return Object.freeze({ start: addLocalDays(end, -27), end });
  }
  if (input.period === "12_weeks") {
    return Object.freeze({ start: addLocalDays(end, -83), end });
  }
  const sourceDates = [
    ...input.periodInputs.map(({ localDate }) => parseLocalDate(localDate)),
    ...input.comparableExposures.map(({ localDate }) => parseLocalDate(localDate)),
    ...input.scheduledOpportunities.map(({ localDate }) => parseLocalDate(localDate)),
    ...(input.sourceSessions ?? []).map(({ localDate }) => parseLocalDate(localDate)),
  ];
  const start = sourceDates.length === 0
    ? end
    : sourceDates.toSorted(compareLocalDates)[0]!;
  return Object.freeze({ start, end });
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].toSorted());
}

function sourceReference(input: Readonly<{
  sessionIds: readonly string[];
  exerciseIds: readonly string[];
}>): ProgressSourceReference {
  return Object.freeze({
    sessionIds: sortedUnique(input.sessionIds),
    exerciseIds: sortedUnique(input.exerciseIds),
  });
}

function filteredSourceSessions(
  values: readonly ProgressEffectiveSourceSession[],
  window: ProgressWindow,
): readonly ProgressEffectiveSourceSession[] {
  const ids = new Set<string>();
  const included: ProgressEffectiveSourceSession[] = [];
  for (const value of values) {
    if (!within(window, value.localDate) || value.lifecycle !== "active") {
      continue;
    }
    requireNonEmpty(value.sessionId, "progress_source_session_id_invalid");
    if (ids.has(value.sessionId)) {
      throw new TypeError("progress_source_session_duplicate");
    }
    ids.add(value.sessionId);
    for (const exerciseId of value.exerciseIds) {
      requireNonEmpty(exerciseId, "progress_source_exercise_id_invalid");
    }
    included.push(Object.freeze({
      sessionId: value.sessionId,
      localDate: parseLocalDate(value.localDate),
      lifecycle: "active",
      exerciseIds: sortedUnique(value.exerciseIds),
    }));
  }
  return Object.freeze(included.toSorted((left, right) =>
    left.sessionId.localeCompare(right.sessionId)
  ));
}

function sourceReferenceForSessions(
  sessions: readonly ProgressEffectiveSourceSession[],
): ProgressSourceReference {
  return sourceReference({
    sessionIds: sessions.map(({ sessionId }) => sessionId),
    exerciseIds: sessions.flatMap(({ exerciseIds }) => exerciseIds),
  });
}

function sourceReferenceForSessionIds(input: Readonly<{
  sessionIds: readonly string[];
  sourcesBySessionId: ReadonlyMap<string, ProgressEffectiveSourceSession>;
}>): ProgressSourceReference {
  const sources = input.sessionIds.flatMap((sessionId) => {
    const source = input.sourcesBySessionId.get(sessionId);
    return source === undefined ? [] : [source];
  });
  return sourceReferenceForSessions(sources);
}

function sessionOnlySourceReference(
  sessionIds: readonly string[],
): ProgressSourceReference {
  return sourceReference({ sessionIds, exerciseIds: [] });
}

function sourceReferenceForExposures(
  exposures: readonly HistoryProjectionComparableExposure[],
): ProgressSourceReference {
  return sourceReference({
    sessionIds: exposures.map(({ sessionId }) => sessionId),
    exerciseIds: exposures.map(({ exerciseId }) => exerciseId),
  });
}

function sourceReferenceForAttention(
  attention: readonly ProgressAttentionItem[],
): ProgressSourceReference {
  return sourceReference({
    sessionIds: attention.flatMap(({ sessionId }) => sessionId === null ? [] : [sessionId]),
    exerciseIds: attention.map(({ exerciseId }) => exerciseId),
  });
}

function filteredPeriodInputs(
  values: readonly HistoryProjectionPeriodInput[],
  window: ProgressWindow,
): readonly HistoryProjectionPeriodInput[] {
  const dateKeys = new Set<string>();
  const included = values.filter((row) => {
    const localDate = parseLocalDate(row.localDate);
    if (!within(window, localDate)) {
      return false;
    }
    if (dateKeys.has(localDate)) {
      throw new TypeError("progress_period_input_duplicate_date");
    }
    dateKeys.add(localDate);
    requireCount(row.completedExercises, "progress_completed_exercises_invalid");
    requireCount(row.plannedExercises, "progress_planned_exercises_invalid");
    requireCount(row.completedWorkingSets, "progress_completed_working_sets_invalid");
    requireCount(row.plannedWorkingSets, "progress_planned_working_sets_invalid");
    requireCount(row.comparableExposureCount, "progress_comparable_exposure_count_invalid");
    return true;
  });
  return Object.freeze(included.toSorted((left, right) =>
    left.localDate.localeCompare(right.localDate)
  ));
}

function filteredExposures(
  values: readonly HistoryProjectionComparableExposure[],
  window: ProgressWindow,
): readonly HistoryProjectionComparableExposure[] {
  const seen = new Set<string>();
  const included = values.filter((row) => {
    if (!within(window, row.localDate)) {
      return false;
    }
    requireNonEmpty(row.exerciseId, "progress_exercise_id_invalid");
    requireNonEmpty(row.comparatorKey, "progress_comparator_key_invalid");
    requireNonEmpty(row.sessionId, "progress_session_id_invalid");
    requireNonEmpty(row.setId, "progress_set_id_invalid");
    parseIdentityKey(row.identityKey);
    if (!Number.isSafeInteger(row.completedAtMs) || row.completedAtMs < 0) {
      throw new TypeError("progress_completed_at_invalid");
    }
    if (!Number.isSafeInteger(row.setOrdinal) || row.setOrdinal < 0) {
      throw new TypeError("progress_set_ordinal_invalid");
    }
    const key = `${row.exerciseId}:${row.setId}`;
    if (seen.has(key)) {
      throw new TypeError("progress_exposure_duplicate_set");
    }
    seen.add(key);
    return true;
  });
  return Object.freeze(included.toSorted(compareExposures));
}

function filteredOpportunities(
  values: readonly ProgressScheduledOpportunity[],
  window: ProgressWindow,
): readonly ProgressScheduledOpportunity[] {
  const ids = new Set<string>();
  const included = values.filter((row) => {
    if (!within(window, row.localDate)) {
      return false;
    }
    requireNonEmpty(row.id, "progress_opportunity_id_invalid");
    if (ids.has(row.id)) {
      throw new TypeError("progress_opportunity_duplicate_id");
    }
    ids.add(row.id);
    return true;
  });
  return Object.freeze(included.toSorted((left, right) =>
    left.localDate.localeCompare(right.localDate) || left.id.localeCompare(right.id)
  ));
}

function groupedExposures(
  exposures: readonly HistoryProjectionComparableExposure[],
): readonly ExposureGroup[] {
  const groups = new Map<string, HistoryProjectionComparableExposure[]>();
  for (const row of exposures) {
    const key = [row.exerciseId, row.identityKey, row.comparatorKey].join("\u0000");
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }
  return Object.freeze([...groups.values()].map((values) => {
    const ordered = values.toSorted(compareExposures);
    const first = ordered[0]!;
    return Object.freeze({
      exerciseId: first.exerciseId,
      identityKey: first.identityKey,
      comparatorKey: first.comparatorKey,
      exposures: Object.freeze(ordered),
    });
  }).toSorted((left, right) =>
    left.exerciseId.localeCompare(right.exerciseId)
      || left.identityKey.localeCompare(right.identityKey)
      || left.comparatorKey.localeCompare(right.comparatorKey)
  ));
}

function statusFor(group: ExposureGroup): ProgressExerciseStatus {
  if (group.exposures.length < 2) {
    return "baseline";
  }
  const latest = group.exposures.at(-1)!;
  const previous = group.exposures.at(-2)!;
  const comparison = compareMetricObservations({
    identity: parseIdentityKey(group.identityKey),
    target: JSON.parse(latest.targetJson) as unknown,
    left: JSON.parse(latest.observationJson) as unknown,
    right: JSON.parse(previous.observationJson) as unknown,
  });
  return comparison === "better" ? "improving" : "holding";
}

function bestRecord(group: ExposureGroup): ProgressRecord {
  let best = group.exposures[0]!;
  const identity = parseIdentityKey(group.identityKey);
  for (const candidate of group.exposures.slice(1)) {
    const result = compareMetricObservations({
      identity,
      target: JSON.parse(candidate.targetJson) as unknown,
      left: JSON.parse(candidate.observationJson) as unknown,
      right: JSON.parse(best.observationJson) as unknown,
    });
    if (result === "better" || (result === "equal" && compareExposures(candidate, best) > 0)) {
      best = candidate;
    }
  }
  return Object.freeze({
    exerciseId: best.exerciseId,
    identityKey: best.identityKey,
    comparatorKey: best.comparatorKey,
    sessionId: best.sessionId,
    setId: best.setId,
    localDate: best.localDate,
    targetJson: best.targetJson,
    observationJson: best.observationJson,
  });
}

function trendRows(input: Readonly<{
  periodInputs: readonly HistoryProjectionPeriodInput[];
  exposures: readonly HistoryProjectionComparableExposure[];
  opportunities: readonly ProgressScheduledOpportunity[];
}>): readonly ProgressTrendRow[] {
  const rows = new Map<string, MutableTrend>();
  const rowFor = (localDate: string): MutableTrend => {
    const current = rows.get(localDate);
    if (current !== undefined) {
      return current;
    }
    const next: MutableTrend = {
      scheduledCompleted: 0,
      scheduledPlanned: 0,
      workingCompleted: 0,
      workingPlanned: 0,
      sessionIds: new Set(),
      exerciseIds: new Set(),
    };
    rows.set(localDate, next);
    return next;
  };
  for (const item of input.periodInputs) {
    const row = rowFor(item.localDate);
    row.workingCompleted += item.completedWorkingSets;
    row.workingPlanned += item.plannedWorkingSets;
  }
  for (const item of input.exposures) {
    const row = rowFor(item.localDate);
    row.sessionIds.add(item.sessionId);
    row.exerciseIds.add(item.exerciseId);
  }
  for (const item of input.opportunities) {
    const row = rowFor(item.localDate);
    row.scheduledPlanned += 1;
    if (item.outcome === "completed") {
      row.scheduledCompleted += 1;
    }
    if (item.sessionId !== undefined) {
      row.sessionIds.add(item.sessionId);
    }
  }
  return Object.freeze([...rows.entries()].toSorted(([left], [right]) =>
    left.localeCompare(right)
  ).map(([localDate, row]) => Object.freeze({
    localDate,
    scheduledOpportunities: Object.freeze({
      completed: row.scheduledCompleted,
      planned: row.scheduledPlanned,
    }),
    workingSets: Object.freeze({
      completed: row.workingCompleted,
      planned: row.workingPlanned,
    }),
    sessionIds: Object.freeze([...row.sessionIds].toSorted()),
    exerciseIds: Object.freeze([...row.exerciseIds].toSorted()),
  })));
}

function sortedAttention(
  values: readonly ProgressAttentionItem[],
): readonly ProgressAttentionItem[] {
  const ids = new Set<string>();
  for (const value of values) {
    requireNonEmpty(value.id, "progress_attention_id_invalid");
    requireNonEmpty(value.exerciseId, "progress_attention_exercise_id_invalid");
    if (ids.has(value.id)) {
      throw new TypeError("progress_attention_duplicate_id");
    }
    ids.add(value.id);
  }
  return Object.freeze(values.toSorted((left, right) =>
    left.exerciseId.localeCompare(right.exerciseId) || left.id.localeCompare(right.id)
  ));
}

export function projectProgressPeriod(
  input: ProgressPeriodProjectionInput,
): ProgressPeriodProjection {
  const window = windowFor(input);
  const periodInputs = filteredPeriodInputs(input.periodInputs, window);
  const exposures = filteredExposures(input.comparableExposures, window);
  const opportunities = filteredOpportunities(input.scheduledOpportunities, window);
  const sourceSessions = filteredSourceSessions(input.sourceSessions ?? [], window);
  const sourcesBySessionId = new Map(sourceSessions.map((source) => [
    source.sessionId,
    source,
  ]));
  const effectiveExposures = input.sourceSessions === undefined
    ? exposures
    : Object.freeze(exposures.filter(({ sessionId }) =>
      sourcesBySessionId.has(sessionId)
    ));
  const attention = sortedAttention(input.sourceSessions === undefined
    ? input.attention
    : input.attention.filter(({ sessionId }) =>
      sessionId !== null && sourcesBySessionId.has(sessionId)
    ));
  const groups = groupedExposures(effectiveExposures);
  const exercises: readonly ProgressExercise[] = Object.freeze(groups.map((group) => {
    const latest = group.exposures.at(-1)!;
    return Object.freeze({
      exerciseId: group.exerciseId,
      identityKey: group.identityKey,
      comparatorKey: group.comparatorKey,
      status: statusFor(group),
      sessionId: latest.sessionId,
      setId: latest.setId,
      localDate: latest.localDate,
    });
  }));
  const records = Object.freeze(groups.map(bestRecord).toSorted((left, right) =>
    right.localDate.localeCompare(left.localDate)
      || right.sessionId.localeCompare(left.sessionId)
      || left.exerciseId.localeCompare(right.exerciseId)
      || left.setId.localeCompare(right.setId)
  ));
  const workingCompleted = periodInputs.reduce(
    (total, row) => total + row.completedWorkingSets,
    0,
  );
  const workingPlanned = periodInputs.reduce(
    (total, row) => total + row.plannedWorkingSets,
    0,
  );
  const improvingCount = exercises.filter(({ status }) => status === "improving").length;
  const holdingCount = exercises.filter(({ status }) => status === "holding").length;
  const baselineCount = exercises.filter(({ status }) => status === "baseline").length;
  const state = improvingCount > 0
    ? "current"
    : holdingCount > 0
      ? "hold"
      : "baseline";
  const statusSources = sourceReferenceForExposures(effectiveExposures);
  const stateSources = sourceReferenceForExposures(effectiveExposures.filter(({ exerciseId }) =>
    exercises.some((exercise) => exercise.exerciseId === exerciseId
      && exercise.status === (state === "current" ? "improving" : state === "hold" ? "holding" : "baseline"))
  ));
  return Object.freeze({
    state,
    window,
    summary: Object.freeze({
      scheduledOpportunities: Object.freeze({
        completed: opportunities.filter(({ outcome }) => outcome === "completed").length,
        planned: opportunities.length,
      }),
      workingSets: Object.freeze({
        completed: workingCompleted,
        planned: workingPlanned,
      }),
      improvingCount,
      holdingCount,
      baselineCount,
      attentionCount: attention.length,
      sourceReferences: Object.freeze({
        scheduledOpportunities: Object.freeze({
          ...sourceReferenceForSessionIds({
          sessionIds: opportunities.flatMap(({ sessionId }) =>
            sessionId === undefined ? [] : [sessionId]
          ),
          sourcesBySessionId,
          }),
          exerciseIds: Object.freeze([]),
        }),
        workingSets: sourceReferenceForSessions(sourceSessions),
        exerciseStatuses: statusSources,
        attention: sourceReferenceForAttention(attention),
      }),
    }),
    records,
    exercises,
    trend: trendRows({ periodInputs, exposures: effectiveExposures, opportunities }),
    attention,
    recommendations: input.recommendations ?? [],
    stateSourceReferences: stateSources,
  });
}
