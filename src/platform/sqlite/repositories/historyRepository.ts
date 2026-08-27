import {
  buildExerciseMetricHistory,
  calendarStateForSession,
  historyProgress,
  historySourceLabel,
  orderedCalendarStates,
  parseHistoryLocalDate,
  type EffectiveMetricHistorySet,
  type EffectiveHistoryProjectionSession,
  type ExerciseMetricHistory,
  type CalendarDay,
  type CalendarDayState,
  type CalendarMonth,
  type HistorySessionStatus,
  type HistorySessionSummary,
  type HistorySource,
  type RemovedHistorySession,
} from "../../../domains/history";
import {
  parseMetricIdentity,
  parseMetricObservationJson,
  parseMetricTargetJson,
  type MetricIdentity,
} from "../../../domains/metrics";
import type {
  LocalDate,
} from "../../../domains/scheduling";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

type SourceSessionRow = Readonly<{
  id: string;
  source: HistorySource;
  status: string;
  local_date: string;
  timezone: string;
  started_at_ms: number;
  completed_at_ms: number | null;
  creation_timezone_offset_minutes: number;
  revision: number;
  plan_name: string | null;
  day_name: string | null;
  effective_revision: number | null;
  lifecycle: "active" | "voided" | null;
  snapshot_json: string | null;
  effective_local_date: string | null;
  effective_timezone: string | null;
  effective_started_at_ms: number | null;
  effective_completed_at_ms: number | null;
}>;

type RemovedSessionRow = SourceSessionRow & Readonly<{
  removed_at_ms: number;
}>;

type SessionCountRow = Readonly<{
  completed_exercises: number;
  planned_exercises: number;
  completed_working_sets: number;
  planned_working_sets: number;
}>;

type PlannedOpportunityRow = Readonly<{
  local_date: string;
}>;

type SourceMetricSetRow = Readonly<{
  session_id: string;
  local_date: string;
  session_status: "completed" | "partial";
  exercise_id: string;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
  set_id: string;
  set_kind: "warmup" | "working";
  set_ordinal: number;
  set_status: "completed";
  target_json: string;
  observed_json: string;
  completed_at_ms: number;
  planned_working_sets: number;
  completed_working_sets: number;
}>;

type SourceRecommendationScopeRow = Readonly<{
  session_id: string;
  scope_id: string;
}>;

export type EffectiveSnapshot = Readonly<{
  version: number;
  session: Readonly<{
    id: string;
    source: HistorySource;
    status: HistorySessionStatus;
    planName: string | null;
    dayName: string | null;
    localDate: string;
    timezone: string;
    startedAtMs: number;
    completedAtMs: number | null;
  }>;
  exercises: readonly Readonly<{
    id: string;
    exerciseId: string;
    name: string;
    ordinal: number;
    status: "planned" | "active" | "completed" | "skipped";
    metricIdentity?: MetricIdentity;
    sets: readonly Readonly<{
      id: string;
      kind: "warmup" | "working";
      ordinal: number;
      status: "planned" | "draft" | "completed" | "skipped";
      target?: unknown;
      observation?: unknown;
      completedAtMs?: number | null;
      sourcePlanWorkingSetTargetId?: string;
      sourceOwnedPlanWorkingSetTargetId?: string;
    }>[];
  }>[];
}>;

type EffectiveSession = Readonly<{
  id: string;
  source: HistorySource;
  status: HistorySessionStatus;
  planName: string | null;
  dayName: string | null;
  localDate: LocalDate;
  timezone: string;
  startedAtMs: number;
  completedAtMs: number | null;
  lifecycle: "active" | "voided";
  revision: number;
  original: HistorySessionSummary["original"];
  exerciseProgress: HistorySessionSummary["exerciseProgress"];
  workingSetProgress: HistorySessionSummary["workingSetProgress"];
}>;

const FINALIZED_HISTORY_STATUSES = new Set<string>([
  "completed",
  "partial",
  "manual_visit",
  "zero_sets",
]);

function isHistorySource(value: unknown): value is HistorySource {
  return value === "scheduled_day"
    || value === "alternate_day"
    || value === "rest_day"
    || value === "empty"
    || value === "manual";
}

function isHistoryStatus(value: unknown): value is HistorySessionStatus {
  return value === "completed"
    || value === "partial"
    || value === "manual_visit"
    || value === "zero_sets";
}

function validTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validNullableTimestamp(value: unknown): value is number | null {
  return value === null || validTimestamp(value);
}

function parseEffectiveSnapshot(
  value: string,
  row: SourceSessionRow,
): EffectiveSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("history_effective_snapshot_invalid");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("history_effective_snapshot_invalid");
  }
  const snapshot = parsed as Partial<EffectiveSnapshot>;
  const session = snapshot.session;
  if (
    snapshot.version !== 1
    || typeof session !== "object"
    || session === null
    || session.id !== row.id
    || !isHistorySource(session.source)
    || !isHistoryStatus(session.status)
    || typeof session.localDate !== "string"
    || typeof session.timezone !== "string"
    || session.timezone.trim() === ""
    || !validTimestamp(session.startedAtMs)
    || !validNullableTimestamp(session.completedAtMs)
    || (session.completedAtMs !== null
      && session.completedAtMs < session.startedAtMs)
    || !Array.isArray(snapshot.exercises)
  ) {
    throw new Error("history_effective_snapshot_invalid");
  }
  parseHistoryLocalDate(session.localDate);
  return snapshot as EffectiveSnapshot;
}

function countEffectiveSnapshot(
  snapshot: EffectiveSnapshot,
): Pick<EffectiveSession, "exerciseProgress" | "workingSetProgress"> {
  let completedExercises = 0;
  let plannedExercises = 0;
  let completedWorkingSets = 0;
  let plannedWorkingSets = 0;
  for (const exercise of snapshot.exercises) {
    if (
      typeof exercise !== "object"
      || exercise === null
      || !Array.isArray(exercise.sets)
    ) {
      throw new Error("history_effective_snapshot_invalid");
    }
    plannedExercises += 1;
    if (exercise.status === "completed") {
      completedExercises += 1;
    }
    for (const set of exercise.sets) {
      if (
        typeof set !== "object"
        || set === null
        || (set.kind !== "warmup" && set.kind !== "working")
      ) {
        throw new Error("history_effective_snapshot_invalid");
      }
      if (set.kind === "working") {
        plannedWorkingSets += 1;
        if (set.status === "completed") {
          completedWorkingSets += 1;
        }
      }
    }
  }
  return {
    exerciseProgress: historyProgress(completedExercises, plannedExercises),
    workingSetProgress: historyProgress(
      completedWorkingSets,
      plannedWorkingSets,
    ),
  };
}

function effectiveMetricIdentity(
  value: unknown,
): MetricIdentity {
  try {
    return parseMetricIdentity(value);
  } catch {
    throw new Error("history_effective_snapshot_invalid");
  }
}

function completedMetricSet(input: Readonly<{
  sessionId: string;
  localDate: string;
  sessionStatus: "completed" | "partial";
  exerciseId: string;
  identity: MetricIdentity;
  set: EffectiveSnapshot["exercises"][number]["sets"][number];
  plannedWorkingSets: number;
  completedWorkingSets: number;
}>): EffectiveMetricHistorySet | null {
  const { set } = input;
  if (
    set.status !== "completed"
    || set.target === undefined
    || set.observation === undefined
    || !validTimestamp(set.completedAtMs)
  ) {
    return null;
  }
  try {
    return Object.freeze({
      sessionId: input.sessionId,
      localDate: input.localDate,
      exerciseId: input.exerciseId,
      identity: input.identity,
      target: parseMetricTargetJson(input.identity, JSON.stringify(set.target)),
      observation: parseMetricObservationJson(
        input.identity,
        JSON.stringify(set.observation),
      ),
      sessionStatus: input.sessionStatus,
      setKind: set.kind,
      setStatus: set.status,
      plannedWorkingSets: input.plannedWorkingSets,
      completedWorkingSets: input.completedWorkingSets,
      setId: set.id,
      setOrdinal: set.ordinal,
      completedAtMs: set.completedAtMs,
    });
  } catch {
    throw new Error("history_effective_snapshot_invalid");
  }
}

export function metricSetsFromEffectiveSnapshot(
  snapshot: EffectiveSnapshot,
): readonly EffectiveMetricHistorySet[] {
  if (snapshot.session.status !== "completed" && snapshot.session.status !== "partial") {
    return Object.freeze([]);
  }
  const result: EffectiveMetricHistorySet[] = [];
  for (const exercise of snapshot.exercises) {
    const identity = exercise.metricIdentity === undefined
      ? null
      : effectiveMetricIdentity(exercise.metricIdentity);
    if (identity === null) {
      continue;
    }
    const plannedWorkingSets = exercise.sets.filter(({ kind }) => kind === "working").length;
    const completedWorkingSets = exercise.sets.filter(({ kind, status }) =>
      kind === "working" && status === "completed"
    ).length;
    for (const set of exercise.sets) {
      const metricSet = completedMetricSet({
        sessionId: snapshot.session.id,
        localDate: snapshot.session.localDate,
        sessionStatus: snapshot.session.status,
        exerciseId: exercise.exerciseId,
        identity,
        set,
        plannedWorkingSets,
        completedWorkingSets,
      });
      if (metricSet !== null) {
        result.push(metricSet);
      }
    }
  }
  return Object.freeze(result);
}

function recommendationScopesFromSnapshot(
  snapshot: EffectiveSnapshot,
): readonly string[] {
  const scopes: string[] = [];
  for (const exercise of snapshot.exercises) {
    for (const set of exercise.sets) {
      if (set.kind !== "working") {
        continue;
      }
      if (typeof set.sourcePlanWorkingSetTargetId === "string"
        && set.sourcePlanWorkingSetTargetId.trim() !== "") {
        scopes.push(`legacy:${set.sourcePlanWorkingSetTargetId}`);
      }
      if (typeof set.sourceOwnedPlanWorkingSetTargetId === "string"
        && set.sourceOwnedPlanWorkingSetTargetId.trim() !== "") {
        scopes.push(`owned:${set.sourceOwnedPlanWorkingSetTargetId}`);
      }
    }
  }
  return Object.freeze([...new Set(scopes)].sort((left, right) =>
    left.localeCompare(right)
  ));
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((left, right) =>
    left.localeCompare(right)
  ));
}

function metricSetFromSourceRow(row: SourceMetricSetRow): EffectiveMetricHistorySet {
  const identity = effectiveMetricIdentity({
    profile: row.metric_profile,
    contractVersion: row.metric_contract_version,
    exerciseMetricGeneration: row.exercise_metric_generation,
  });
  return Object.freeze({
    sessionId: row.session_id,
    localDate: row.local_date,
    exerciseId: row.exercise_id,
    identity,
    target: parseMetricTargetJson(identity, row.target_json),
    observation: parseMetricObservationJson(identity, row.observed_json),
    sessionStatus: row.session_status,
    setKind: row.set_kind,
    setStatus: row.set_status,
    plannedWorkingSets: Number(row.planned_working_sets),
    completedWorkingSets: Number(row.completed_working_sets),
    setId: row.set_id,
    setOrdinal: row.set_ordinal,
    completedAtMs: row.completed_at_ms,
  });
}

/**
 * Shared effective-history source adapter for disposable projections. It keeps
 * the same raw-versus-overlay precedence as Calendar and exercise-history
 * reads: an overlay wholly replaces raw facts, and a voided overlay contributes
 * no ordinary evidence.
 */
export async function loadEffectiveHistoryProjectionSessions(
  executor: Pick<SqliteKernel, "queryAll"> | SqliteTransactionExecutor,
): Promise<readonly EffectiveHistoryProjectionSession[]> {
  const [sessionRows, counts, sourceMetrics, rawScopes] = await Promise.all([
    executor.queryAll<SourceSessionRow>(
      `SELECT ws.id, ws.source, ws.status, ws.local_date, ws.timezone,
              ws.started_at_ms, ws.completed_at_ms,
              ws.creation_timezone_offset_minutes, ws.revision,
              plan.name AS plan_name, day.name AS day_name,
              overlay.effective_revision, overlay.lifecycle,
              overlay.snapshot_json, overlay.effective_local_date,
              overlay.effective_timezone, overlay.effective_started_at_ms,
              overlay.effective_completed_at_ms
       FROM workout_sessions ws
       LEFT JOIN plans plan ON plan.id = ws.plan_id
       LEFT JOIN plan_days day ON day.id = ws.plan_day_id
       LEFT JOIN history_session_overlays overlay ON overlay.session_id = ws.id
       WHERE ws.status IN ('completed', 'partial')
          OR overlay.session_id IS NOT NULL
       ORDER BY ws.id`,
    ),
    executor.queryAll<SessionCountRow & Readonly<{ session_id: string }>>(
      `SELECT se.session_id,
              COUNT(DISTINCT CASE WHEN se.status = 'completed' THEN se.id END)
                AS completed_exercises,
              COUNT(DISTINCT se.id) AS planned_exercises,
              SUM(CASE WHEN ss.set_kind = 'working' AND ss.status = 'completed'
                       THEN 1 ELSE 0 END) AS completed_working_sets,
              SUM(CASE WHEN ss.set_kind = 'working' THEN 1 ELSE 0 END)
                AS planned_working_sets
       FROM session_exercises se
       LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
       GROUP BY se.session_id
       ORDER BY se.session_id`,
    ),
    executor.queryAll<SourceMetricSetRow>(
      `SELECT session.id AS session_id, session.local_date,
              session.status AS session_status, exercise.exercise_id,
              exercise.metric_profile, exercise.metric_contract_version,
              exercise.exercise_metric_generation, set_row.id AS set_id,
              set_row.set_kind, set_row.ordinal AS set_ordinal,
              set_row.status AS set_status, set_row.target_json,
              set_row.observed_json, set_row.completed_at_ms,
              (SELECT COUNT(*) FROM session_sets planned
               WHERE planned.session_exercise_id = exercise.id
                 AND planned.set_kind = 'working') AS planned_working_sets,
              (SELECT COUNT(*) FROM session_sets completed
               WHERE completed.session_exercise_id = exercise.id
                 AND completed.set_kind = 'working'
                 AND completed.status = 'completed') AS completed_working_sets
       FROM workout_sessions session
       JOIN session_exercises exercise ON exercise.session_id = session.id
       JOIN session_sets set_row ON set_row.session_exercise_id = exercise.id
       WHERE session.status IN ('completed', 'partial')
         AND set_row.status = 'completed'
         AND set_row.observed_json IS NOT NULL
         AND set_row.completed_at_ms IS NOT NULL
       ORDER BY set_row.completed_at_ms, session.id, set_row.ordinal, set_row.id`,
    ),
    executor.queryAll<SourceRecommendationScopeRow>(
      `SELECT exercise.session_id,
              'legacy:' || set_row.source_plan_working_set_target_id AS scope_id
       FROM session_sets set_row
       JOIN session_exercises exercise ON exercise.id = set_row.session_exercise_id
       WHERE set_row.source_plan_working_set_target_id IS NOT NULL
       UNION
       SELECT exercise.session_id,
              'owned:' || set_row.source_owned_plan_working_set_target_id AS scope_id
       FROM session_sets set_row
       JOIN session_exercises exercise ON exercise.id = set_row.session_exercise_id
       WHERE set_row.source_owned_plan_working_set_target_id IS NOT NULL
       ORDER BY 1, 2`,
    ),
  ]);
  const countsBySession = new Map(counts.map((row) => [row.session_id, row]));
  const metricsBySession = new Map<string, EffectiveMetricHistorySet[]>();
  for (const row of sourceMetrics) {
    const entries = metricsBySession.get(row.session_id) ?? [];
    entries.push(metricSetFromSourceRow(row));
    metricsBySession.set(row.session_id, entries);
  }
  const scopesBySession = new Map<string, string[]>();
  for (const row of rawScopes) {
    const entries = scopesBySession.get(row.session_id) ?? [];
    entries.push(row.scope_id);
    scopesBySession.set(row.session_id, entries);
  }

  const projected: EffectiveHistoryProjectionSession[] = [];
  for (const row of sessionRows) {
    if (row.snapshot_json !== null) {
      if (row.lifecycle === "voided") {
        continue;
      }
      const snapshot = parseEffectiveSnapshot(row.snapshot_json, row);
      if (snapshot.session.status !== "completed" && snapshot.session.status !== "partial") {
        continue;
      }
      const progress = countEffectiveSnapshot(snapshot);
      projected.push(Object.freeze({
        sessionId: snapshot.session.id,
        localDate: snapshot.session.localDate,
        lifecycle: "active",
        completedExercises: progress.exerciseProgress.completed,
        plannedExercises: progress.exerciseProgress.planned,
        completedWorkingSets: progress.workingSetProgress.completed,
        plannedWorkingSets: progress.workingSetProgress.planned,
        metricSets: metricSetsFromEffectiveSnapshot(snapshot),
        recommendationScopes: recommendationScopesFromSnapshot(snapshot),
      }));
      continue;
    }
    if (row.status !== "completed" && row.status !== "partial") {
      continue;
    }
    const countsForSession = countsBySession.get(row.id);
    projected.push(Object.freeze({
      sessionId: row.id,
      localDate: row.local_date,
      lifecycle: "active",
      completedExercises: Number(countsForSession?.completed_exercises ?? 0),
      plannedExercises: Number(countsForSession?.planned_exercises ?? 0),
      completedWorkingSets: Number(countsForSession?.completed_working_sets ?? 0),
      plannedWorkingSets: Number(countsForSession?.planned_working_sets ?? 0),
      metricSets: Object.freeze(metricsBySession.get(row.id) ?? []),
      recommendationScopes: uniqueSorted(scopesBySession.get(row.id) ?? []),
    }));
  }
  return Object.freeze(projected.sort((left, right) =>
    left.sessionId.localeCompare(right.sessionId)
  ));
}

function sourceSessionCounts(row: SessionCountRow): Pick<
  EffectiveSession,
  "exerciseProgress" | "workingSetProgress"
> {
  return {
    exerciseProgress: historyProgress(
      row.completed_exercises,
      row.planned_exercises,
    ),
    workingSetProgress: historyProgress(
      row.completed_working_sets,
      row.planned_working_sets,
    ),
  };
}

function resolveEffectiveSession(
  row: SourceSessionRow,
  counts: SessionCountRow,
  resolveVoidedSnapshot = false,
): EffectiveSession | null {
  if (!FINALIZED_HISTORY_STATUSES.has(row.status)) {
    return null;
  }
  if (!isHistorySource(row.source) || !isHistoryStatus(row.status)) {
    throw new Error("history_source_session_invalid");
  }
  const original = Object.freeze({
    localDate: parseHistoryLocalDate(row.local_date),
    timezone: row.timezone,
    startedAtMs: row.started_at_ms,
    completedAtMs: row.completed_at_ms,
    creationTimezoneOffsetMinutes: row.creation_timezone_offset_minutes,
  });
  if (row.lifecycle === "voided" && !resolveVoidedSnapshot) {
    return Object.freeze({
      id: row.id,
      source: row.source,
      status: row.status,
      planName: row.plan_name,
      dayName: row.day_name,
      localDate: original.localDate,
      timezone: original.timezone,
      startedAtMs: original.startedAtMs,
      completedAtMs: original.completedAtMs,
      lifecycle: "voided",
      revision: row.effective_revision ?? row.revision,
      original,
      ...sourceSessionCounts(counts),
    });
  }
  if (row.snapshot_json === null) {
    return Object.freeze({
      id: row.id,
      source: row.source,
      status: row.status,
      planName: row.plan_name,
      dayName: row.day_name,
      localDate: original.localDate,
      timezone: original.timezone,
      startedAtMs: original.startedAtMs,
      completedAtMs: original.completedAtMs,
      lifecycle: "active",
      revision: row.revision,
      original,
      ...sourceSessionCounts(counts),
    });
  }
  const snapshot = parseEffectiveSnapshot(row.snapshot_json, row);
  const effectiveLocalDate = parseHistoryLocalDate(row.effective_local_date ?? "");
  if (
    snapshot.session.localDate !== effectiveLocalDate
    || snapshot.session.timezone !== row.effective_timezone
    || snapshot.session.startedAtMs !== row.effective_started_at_ms
    || snapshot.session.completedAtMs !== row.effective_completed_at_ms
  ) {
    throw new Error("history_effective_snapshot_mismatch");
  }
  return Object.freeze({
    id: row.id,
    source: snapshot.session.source,
    status: snapshot.session.status,
    planName: snapshot.session.planName,
    dayName: snapshot.session.dayName,
    localDate: effectiveLocalDate,
    timezone: snapshot.session.timezone,
    startedAtMs: snapshot.session.startedAtMs,
    completedAtMs: snapshot.session.completedAtMs,
    lifecycle: row.lifecycle ?? "active",
    revision: row.effective_revision ?? row.revision,
    original,
    ...countEffectiveSnapshot(snapshot),
  });
}

function monthBounds(month: LocalDate): readonly [string, string] {
  if (!month.endsWith("-01")) {
    throw new TypeError("history_month_must_start_on_first");
  }
  const year = Number(month.slice(0, 4));
  const currentMonth = Number(month.slice(5, 7));
  const nextYear = currentMonth === 12 ? year + 1 : year;
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const next = `${nextYear.toString().padStart(4, "0")}-${nextMonth
    .toString()
    .padStart(2, "0")}-01`;
  return [month, next];
}

function summary(session: EffectiveSession): HistorySessionSummary {
  return Object.freeze({
    id: session.id,
    status: session.status,
    source: session.source,
    sourceLabel: historySourceLabel(session.source),
    planName: session.planName,
    dayName: session.dayName,
    original: session.original,
    effective: Object.freeze({
      lifecycle: session.lifecycle,
      localDate: session.localDate,
      timezone: session.timezone,
      startedAtMs: session.startedAtMs,
      completedAtMs: session.completedAtMs,
      revision: session.revision,
    }),
    exerciseProgress: session.exerciseProgress,
    workingSetProgress: session.workingSetProgress,
  });
}

export type HistoryRepository = Readonly<{
  loadCalendarMonth(input: Readonly<{
    month: string;
    selectedDate: string;
    today: string;
  }>): Promise<CalendarMonth>;
  loadExerciseMetricHistory(input: Readonly<{
    exerciseId: string;
  }>): Promise<ExerciseMetricHistory>;
  listRemovedSessions(): Promise<readonly RemovedHistorySession[]>;
}>;

export function createHistoryRepository(kernel: SqliteKernel): HistoryRepository {
  return Object.freeze({
    async listRemovedSessions() {
      const rows = await kernel.queryAll<RemovedSessionRow>(
        `SELECT ws.id, ws.source, ws.status, ws.local_date, ws.timezone,
                ws.started_at_ms, ws.completed_at_ms,
                ws.creation_timezone_offset_minutes, ws.revision,
                plan.name AS plan_name, day.name AS day_name,
                overlay.effective_revision, overlay.lifecycle,
                overlay.snapshot_json, overlay.effective_local_date,
                overlay.effective_timezone, overlay.effective_started_at_ms,
                overlay.effective_completed_at_ms,
                audit.occurred_at_ms AS removed_at_ms
         FROM history_session_overlays overlay
         JOIN workout_sessions ws ON ws.id = overlay.session_id
         LEFT JOIN plans plan ON plan.id = ws.plan_id
         LEFT JOIN plan_days day ON day.id = ws.plan_day_id
         JOIN history_audit_events audit
           ON audit.session_id = overlay.session_id
          AND audit.effective_revision = overlay.effective_revision
          AND audit.event_type = 'void'
         WHERE overlay.lifecycle = 'voided'
         ORDER BY audit.occurred_at_ms DESC, overlay.session_id ASC`,
      );
      const removed = await Promise.all(rows.map(async (row) => {
        const [counts] = await kernel.queryAll<SessionCountRow>(
          `SELECT
             COUNT(DISTINCT CASE WHEN se.status = 'completed' THEN se.id END)
               AS completed_exercises,
             COUNT(DISTINCT se.id) AS planned_exercises,
             SUM(CASE
                   WHEN ss.set_kind = 'working' AND ss.status = 'completed'
                   THEN 1 ELSE 0
                 END) AS completed_working_sets,
             SUM(CASE WHEN ss.set_kind = 'working' THEN 1 ELSE 0 END)
               AS planned_working_sets
           FROM session_exercises se
           LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
           WHERE se.session_id = ?`,
          [row.id],
        );
        const session = resolveEffectiveSession(row, {
          completed_exercises: Number(counts?.completed_exercises ?? 0),
          planned_exercises: Number(counts?.planned_exercises ?? 0),
          completed_working_sets: Number(counts?.completed_working_sets ?? 0),
          planned_working_sets: Number(counts?.planned_working_sets ?? 0),
        }, true);
        if (session === null || session.lifecycle !== "voided") {
          throw new Error("history_removed_session_invalid");
        }
        return Object.freeze({
          id: session.id,
          sourceLabel: historySourceLabel(session.source),
          planName: session.planName,
          dayName: session.dayName,
          localDate: session.localDate,
          timezone: session.timezone,
          effectiveRevision: session.revision,
          removedAtMs: row.removed_at_ms,
          workingSetProgress: session.workingSetProgress,
        });
      }));
      return Object.freeze(removed);
    },
    async loadCalendarMonth(input) {
      const month = parseHistoryLocalDate(input.month);
      const selectedDate = parseHistoryLocalDate(input.selectedDate);
      const today = parseHistoryLocalDate(input.today);
      const [startDate, endDate] = monthBounds(month);
      const [rows, opportunities] = await Promise.all([
        kernel.queryAll<SourceSessionRow>(
          `SELECT ws.id, ws.source, ws.status, ws.local_date, ws.timezone,
                  ws.started_at_ms, ws.completed_at_ms,
                  ws.creation_timezone_offset_minutes, ws.revision,
                  plan.name AS plan_name, day.name AS day_name,
                  overlay.effective_revision, overlay.lifecycle,
                  overlay.snapshot_json, overlay.effective_local_date,
                  overlay.effective_timezone, overlay.effective_started_at_ms,
                  overlay.effective_completed_at_ms
           FROM workout_sessions ws
           LEFT JOIN plans plan ON plan.id = ws.plan_id
           LEFT JOIN plan_days day ON day.id = ws.plan_day_id
           LEFT JOIN history_session_overlays overlay ON overlay.session_id = ws.id
           WHERE ws.status IN ('completed', 'partial', 'manual_visit', 'zero_sets')
              OR overlay.session_id IS NOT NULL
           ORDER BY ws.id`,
        ),
        kernel.queryAll<PlannedOpportunityRow>(
          `SELECT opportunity.local_date
           FROM owned_plan_schedule_opportunities opportunity
           JOIN owned_plan_schedules schedule
             ON schedule.id = opportunity.schedule_id
           WHERE schedule.lifecycle = 'active'
             AND opportunity.outcome = 'planned_not_completed'
             AND opportunity.local_date >= ?
             AND opportunity.local_date < ?
           ORDER BY opportunity.local_date, opportunity.id`,
          [startDate, endDate],
        ),
      ]);
      const sessions = await Promise.all(rows.map(async (row) => {
        const [counts] = await kernel.queryAll<SessionCountRow>(
          `SELECT
             COUNT(DISTINCT CASE WHEN se.status = 'completed' THEN se.id END)
               AS completed_exercises,
             COUNT(DISTINCT se.id) AS planned_exercises,
             SUM(CASE
                   WHEN ss.set_kind = 'working' AND ss.status = 'completed'
                   THEN 1 ELSE 0 END
                 ) AS completed_working_sets,
             SUM(CASE WHEN ss.set_kind = 'working' THEN 1 ELSE 0 END)
               AS planned_working_sets
           FROM session_exercises se
           LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
           WHERE se.session_id = ?`,
          [row.id],
        );
        return resolveEffectiveSession(row, {
          completed_exercises: Number(counts?.completed_exercises ?? 0),
          planned_exercises: Number(counts?.planned_exercises ?? 0),
          completed_working_sets: Number(counts?.completed_working_sets ?? 0),
          planned_working_sets: Number(counts?.planned_working_sets ?? 0),
        });
      }));
      const activeSessions = sessions.filter((session): session is EffectiveSession =>
        session !== null
        && session.lifecycle === "active"
        && session.localDate >= startDate
        && session.localDate < endDate
      );
      const statesByDate = new Map<string, CalendarDayState[]>();
      for (const session of activeSessions) {
        const states = statesByDate.get(session.localDate) ?? [];
        states.push(calendarStateForSession(session.status, session.source));
        statesByDate.set(session.localDate, states);
      }
      for (const opportunity of opportunities) {
        const states = statesByDate.get(opportunity.local_date) ?? [];
        states.push("planned_not_completed");
        statesByDate.set(opportunity.local_date, states);
      }
      if (today >= startDate && today < endDate) {
        const states = statesByDate.get(today) ?? [];
        states.push("today");
        statesByDate.set(today, states);
      }
      const days: readonly CalendarDay[] = Object.freeze(
        [...statesByDate.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([localDate, states]) => Object.freeze({
            localDate: parseHistoryLocalDate(localDate),
            states: orderedCalendarStates(states),
          })),
      );
      const selectedSessions = Object.freeze(
        activeSessions
          .filter((session) => session.localDate === selectedDate)
          .sort((left, right) =>
            right.startedAtMs - left.startedAtMs || left.id.localeCompare(right.id)
          )
          .map(summary),
      );
      return Object.freeze({
        month,
        selectedDate,
        days,
        sessions: selectedSessions,
      });
    },
    async loadExerciseMetricHistory(input) {
      const rows = await kernel.queryAll<SourceSessionRow>(
        `SELECT ws.id, ws.source, ws.status, ws.local_date, ws.timezone,
                ws.started_at_ms, ws.completed_at_ms,
                ws.creation_timezone_offset_minutes, ws.revision,
                plan.name AS plan_name, day.name AS day_name,
                overlay.effective_revision, overlay.lifecycle,
                overlay.snapshot_json, overlay.effective_local_date,
                overlay.effective_timezone, overlay.effective_started_at_ms,
                overlay.effective_completed_at_ms
         FROM workout_sessions ws
         LEFT JOIN plans plan ON plan.id = ws.plan_id
         LEFT JOIN plan_days day ON day.id = ws.plan_day_id
         LEFT JOIN history_session_overlays overlay ON overlay.session_id = ws.id
         WHERE (ws.status IN ('completed', 'partial')
                OR overlay.session_id IS NOT NULL)
         ORDER BY ws.id`,
      );
      const overlaySessions = new Set<string>();
      const effectiveSets: EffectiveMetricHistorySet[] = [];
      for (const row of rows) {
        if (row.snapshot_json === null) {
          continue;
        }
        overlaySessions.add(row.id);
        if (row.lifecycle === "voided") {
          continue;
        }
        const snapshot = parseEffectiveSnapshot(row.snapshot_json, row);
        for (const set of metricSetsFromEffectiveSnapshot(snapshot)) {
          if (set.exerciseId === input.exerciseId) {
            effectiveSets.push(set);
          }
        }
      }
      const sourceRows = await kernel.queryAll<SourceMetricSetRow>(
        `SELECT session.id AS session_id,
                session.local_date,
                session.status AS session_status,
                exercise.exercise_id,
                exercise.metric_profile,
                exercise.metric_contract_version,
                exercise.exercise_metric_generation,
                set_row.id AS set_id,
                set_row.set_kind,
                set_row.ordinal AS set_ordinal,
                set_row.status AS set_status,
                set_row.target_json,
                set_row.observed_json,
                set_row.completed_at_ms,
                (
                  SELECT COUNT(*)
                  FROM session_sets planned
                  WHERE planned.session_exercise_id = exercise.id
                    AND planned.set_kind = 'working'
                ) AS planned_working_sets,
                (
                  SELECT COUNT(*)
                  FROM session_sets completed
                  WHERE completed.session_exercise_id = exercise.id
                    AND completed.set_kind = 'working'
                    AND completed.status = 'completed'
                ) AS completed_working_sets
         FROM workout_sessions session
         JOIN session_exercises exercise ON exercise.session_id = session.id
         JOIN session_sets set_row ON set_row.session_exercise_id = exercise.id
         WHERE session.status IN ('completed', 'partial')
           AND exercise.exercise_id = ?
           AND set_row.status = 'completed'
           AND set_row.observed_json IS NOT NULL
           AND set_row.completed_at_ms IS NOT NULL
         ORDER BY set_row.completed_at_ms DESC, session.id, set_row.ordinal, set_row.id`,
        [input.exerciseId],
      );
      for (const row of sourceRows) {
        if (!overlaySessions.has(row.session_id)) {
          effectiveSets.push(metricSetFromSourceRow(row));
        }
      }
      return buildExerciseMetricHistory({
        exerciseId: input.exerciseId,
        sets: effectiveSets,
      });
    },
  });
}
