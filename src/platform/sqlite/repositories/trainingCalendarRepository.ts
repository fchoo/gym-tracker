import {
  addLocalDays,
  differenceInLocalDays,
  parseLocalDate,
  type LocalDate,
} from "../../../domains/scheduling/localDate";
import {
  assertValidHistoryCorrectionSnapshot,
  type HistoryCorrectionSnapshot,
} from "../../../domains/history";
import type { SqliteKernel, SqliteReadTransactionExecutor } from "../sqliteKernel";
import {
  parseRunningSessionRevision,
  runningSessionRevisionReadback,
} from "../../../domains/running/contracts";
import { parseStrengthOccurrenceSnapshot } from "./strengthOccurrenceSnapshot";

type CalendarDestination =
  | Readonly<{ kind: "session"; sessionId: string }>
  | Readonly<{ kind: "occurrence"; occurrenceId: string }>
  | Readonly<{ kind: "plan"; planId: string; sessionId: string }>
  | Readonly<{ kind: "activity"; activityId: string }>;

type CalendarEventFacts = Readonly<{
  id: string;
  source: "strength" | "running" | "imported_activity";
  sport: "strength" | "running";
  status: "planned" | "completed" | "partial" | "imported" | "matched";
  title: string;
  displaySummary: string;
  sourceLabel: string;
  localDate: LocalDate;
  timeZone: string | null;
  scheduleId: string | null;
  scheduleVersionId: string | null;
  planId: string | null;
  slotId: string | null;
  revision: number | null;
  state: string;
  destination: CalendarDestination;
}>;

export type TrainingCalendarEvent =
  | Readonly<CalendarEventFacts & { source: "strength"; sport: "strength"; status: "planned"; destination: Readonly<{ kind: "occurrence"; occurrenceId: string }> }>
  | Readonly<CalendarEventFacts & { source: "strength"; sport: "strength"; status: "completed" | "partial"; destination: Readonly<{ kind: "session"; sessionId: string }> }>
  | Readonly<CalendarEventFacts & { source: "running"; sport: "running"; status: "planned"; destination: Readonly<{ kind: "plan"; planId: string; sessionId: string }> }>
  | Readonly<CalendarEventFacts & {
    source: "imported_activity";
    sport: "running";
    status: "imported" | "matched";
    sourceIdentity: Readonly<{
      sourceKind: "garmin_connect_account";
      accountNamespace: string;
      externalActivityId: string;
    }>;
    destination: Readonly<{ kind: "activity"; activityId: string }>;
  }>;

export type TrainingCalendarRange = Readonly<{
  events: readonly TrainingCalendarEvent[];
  days: readonly TrainingCalendarDay[];
}>;

export type TrainingCalendarDay = Readonly<{
  localDate: LocalDate;
  kind: "events" | "rest" | "empty";
  restSummary: string | null;
}>;

type StrengthRow = Readonly<{
  id: string; schedule_id: string; schedule_version_id: string; plan_id: string; plan_name: string;
  plan_active: number; plan_revision: number; plan_day_id: string | null;
  plan_day_name: string | null; day_revision: number | null;
  schedule_lifecycle: "active" | "inactive"; schedule_revision: number;
  local_date: string; timezone: string; revision: number; state: string; outcome: string | null;
  session_id: string | null; session_status: string | null; snapshot_json: string | null;
  planned_snapshot_json: string | null;
  completed_working_sets: number; planned_working_sets: number; planned_target_sets: number;
}>;
type RunningRow = Readonly<{
  id: string; schedule_id: string; schedule_version_id: string; plan_id: string; plan_name: string;
  slot_id: string; session_revision_id: string; session_kind: string; definition_json: string;
  local_date: string; timezone: string; state: string;
}>;
type ImportedRow = Readonly<{
  id: string; source: string; source_kind: string; account_namespace: string; external_activity_id: string;
  started_at_ms: number; aggregate_json: string; opportunity_id: string | null;
  matched_schedule_id: string | null; matched_schedule_version_id: string | null;
  matched_plan_id: string | null; matched_slot_id: string | null;
}>;

function range(input: Readonly<{ startLocalDate: string; endLocalDateExclusive: string }>): Readonly<{ start: LocalDate; end: LocalDate }> {
  const start = parseLocalDate(input.startLocalDate);
  const end = parseLocalDate(input.endLocalDateExclusive);
  if (start >= end) throw new Error("training_calendar_range_invalid");
  return Object.freeze({ start, end });
}

type ImportedFacts = Readonly<{
  localDate: LocalDate;
  timeZone: string | null;
  title: string;
  displaySummary: string;
}>;

function displayWords(value: string): string {
  const words = value.replaceAll("_", " ").replaceAll("-", " ").trim();
  return words.length === 0 ? "" : `${words[0]!.toUpperCase()}${words.slice(1)}`;
}

function durationLabel(milliseconds: number): string {
  const totalSeconds = Math.round(milliseconds / 1_000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function distanceLabel(meters: number): string {
  return meters >= 1_000 ? `${(meters / 1_000).toFixed(2)} km` : `${meters} m`;
}

function importedFacts(row: ImportedRow): ImportedFacts | null {
  try {
    const aggregate = JSON.parse(row.aggregate_json) as {
      confirmed_local_date?: unknown;
      normalized?: {
        sport?: unknown;
        subtype?: unknown;
        source_time_zone?: unknown;
        distance_meters?: unknown;
        elapsed_ms?: unknown;
      };
    };
    if (typeof aggregate.confirmed_local_date !== "string"
      || aggregate.normalized?.sport !== "running"
      || typeof aggregate.normalized.subtype !== "string"
      || typeof aggregate.normalized.distance_meters !== "number"
      || !Number.isFinite(aggregate.normalized.distance_meters)
      || aggregate.normalized.distance_meters < 0
      || (aggregate.normalized.elapsed_ms !== undefined
        && (typeof aggregate.normalized.elapsed_ms !== "number"
          || !Number.isFinite(aggregate.normalized.elapsed_ms)
          || aggregate.normalized.elapsed_ms < 0))) return null;
    const subtype = displayWords(aggregate.normalized.subtype);
    if (subtype.length === 0
      || row.source_kind !== "garmin_connect_account"
      || row.account_namespace.trim().length === 0
      || row.external_activity_id.trim().length === 0) return null;
    const distance = distanceLabel(aggregate.normalized.distance_meters);
    return Object.freeze({
      localDate: parseLocalDate(aggregate.confirmed_local_date),
      timeZone: typeof aggregate.normalized.source_time_zone === "string" ? aggregate.normalized.source_time_zone : null,
      title: `${subtype} run`,
      displaySummary: aggregate.normalized.elapsed_ms === undefined
        ? distance
        : `${distance} · ${durationLabel(aggregate.normalized.elapsed_ms)}`,
    });
  } catch {
    return null;
  }
}

function workingSetSummary(completed: number, planned: number): string {
  return `${completed} of ${planned} ${planned === 1 ? "working set" : "working sets"} completed`;
}

function effectiveStrengthSnapshot(row: StrengthRow): Readonly<{
  localDate: LocalDate;
  status: "completed" | "partial";
  title: string;
  displaySummary: string;
}> | null {
  if (row.snapshot_json === null) {
    if ((row.session_status !== "completed" && row.session_status !== "partial") || row.session_id === null) return null;
    return Object.freeze({
      localDate: parseLocalDate(row.local_date),
      status: row.session_status,
      title: row.plan_day_name?.trim() || row.plan_name,
      displaySummary: workingSetSummary(row.completed_working_sets, row.planned_working_sets),
    });
  }
  let snapshot: HistoryCorrectionSnapshot;
  try {
    const decoded = JSON.parse(row.snapshot_json) as HistoryCorrectionSnapshot;
    assertValidHistoryCorrectionSnapshot(decoded);
    snapshot = decoded;
  } catch {
    throw new Error("training_calendar_effective_snapshot_invalid");
  }
  if (snapshot.session.id !== row.session_id
    || (snapshot.session.status !== "completed" && snapshot.session.status !== "partial")) return null;
  const workingSets = snapshot.exercises.flatMap(({ sets }) => sets).filter(({ kind }) => kind === "working");
  return Object.freeze({
    localDate: parseLocalDate(snapshot.session.localDate),
    status: snapshot.session.status,
    title: snapshot.session.dayName?.trim() || snapshot.session.planName?.trim() || row.plan_name,
    displaySummary: workingSetSummary(
      workingSets.filter(({ status }) => status === "completed").length,
      workingSets.length,
    ),
  });
}

type StrengthProjection = Readonly<{
  event: TrainingCalendarEvent | null;
  rest: Readonly<{ localDate: LocalDate; summary: string }> | null;
}>;

function strengthProjection(row: StrengthRow): StrengthProjection {
  if (row.plan_name.trim().length === 0) return Object.freeze({ event: null, rest: null });
  const history = effectiveStrengthSnapshot(row);
  if (history !== null) {
    return Object.freeze({
      event: Object.freeze({
        id: row.id, source: "strength", sport: "strength", status: history.status,
        title: history.title, displaySummary: history.displaySummary, sourceLabel: "Strength",
        localDate: history.localDate, timeZone: row.timezone,
        scheduleId: row.schedule_id, scheduleVersionId: row.schedule_version_id, planId: row.plan_id,
        slotId: null, revision: row.revision, state: history.status,
        destination: Object.freeze({ kind: "session", sessionId: row.session_id! }),
      }),
      rest: null,
    });
  }
  if (row.schedule_lifecycle !== "active") return Object.freeze({ event: null, rest: null });
  if (row.state === "consumed" && row.outcome === "rest_day" && row.session_id === null) {
    return Object.freeze({
      event: null,
      rest: Object.freeze({
        localDate: parseLocalDate(row.local_date),
        summary: `${row.plan_name}. Nothing to resume or review.`,
      }),
    });
  }
  if (row.state !== "pending"
    || row.outcome !== null
    || row.session_id !== null
    || row.session_status !== null
    || row.plan_day_id === null
    || row.plan_active !== 1
    || row.day_revision === null
    || row.planned_snapshot_json === null) return Object.freeze({ event: null, rest: null });
  const snapshot = parseStrengthOccurrenceSnapshot(row.planned_snapshot_json);
  if (snapshot === null
    || snapshot.occurrenceId !== row.id
    || snapshot.planId !== row.plan_id
    || snapshot.planDayId !== row.plan_day_id
    || snapshot.scheduleId !== row.schedule_id
    || snapshot.scheduleVersionId !== row.schedule_version_id
    || snapshot.sourceRevisions.plan !== row.plan_revision
    || snapshot.sourceRevisions.day !== row.day_revision
    || snapshot.sourceRevisions.schedule !== row.schedule_revision
    || snapshot.sourceRevisions.opportunity !== row.revision) {
    return Object.freeze({ event: null, rest: null });
  }
  const plannedTargetSets = snapshot.exercises.reduce(
    (count, exercise) => count + exercise.targets.length,
    0,
  );
  const title = snapshot.dayName;
  return Object.freeze({
    event: Object.freeze({
      id: row.id, source: "strength", sport: "strength", status: "planned",
      title, displaySummary: `${title} · ${plannedTargetSets} working set${plannedTargetSets === 1 ? "" : "s"} planned`,
      sourceLabel: "Strength", localDate: parseLocalDate(snapshot.localDate), timeZone: snapshot.timezone,
      scheduleId: row.schedule_id, scheduleVersionId: row.schedule_version_id, planId: row.plan_id,
      slotId: null, revision: row.revision, state: "planned",
      destination: Object.freeze({ kind: "occurrence", occurrenceId: row.id }),
    }),
    rest: null,
  });
}

function runningEvent(row: RunningRow): TrainingCalendarEvent | null {
  if (row.state !== "planned" || row.plan_name.trim().length === 0 || row.session_revision_id.trim().length === 0) return null;
  const sourceLabel = displayWords(row.session_kind);
  if (sourceLabel.length === 0) return null;
  let displaySummary: string;
  try {
    const session = parseRunningSessionRevision(JSON.parse(row.definition_json));
    if (session.id !== row.session_revision_id || session.planId !== row.plan_id) return null;
    displaySummary = runningSessionRevisionReadback(session);
  } catch {
    return null;
  }
  return Object.freeze({
    id: row.id, source: "running", sport: "running", status: "planned", title: row.plan_name,
    displaySummary, sourceLabel,
    localDate: parseLocalDate(row.local_date), timeZone: row.timezone, scheduleId: row.schedule_id,
    scheduleVersionId: row.schedule_version_id, planId: row.plan_id, slotId: row.slot_id, revision: null, state: "planned",
    destination: Object.freeze({ kind: "plan", planId: row.plan_id, sessionId: row.session_revision_id }),
  });
}

async function queryRange(
  reader: SqliteReadTransactionExecutor,
  input: Readonly<{ start: LocalDate; end: LocalDate }>,
): Promise<TrainingCalendarRange> {
  const [strengthRows, runningRows, importedRows] = await Promise.all([
    reader.queryAll<StrengthRow>(
      `SELECT opportunity.id, opportunity.schedule_id, opportunity.schedule_version_id,
              schedule.plan_id, plan.name AS plan_name, plan.is_active AS plan_active,
              plan.revision AS plan_revision, opportunity.plan_day_id,
              day.name AS plan_day_name, day.revision AS day_revision,
              schedule.lifecycle AS schedule_lifecycle, schedule.revision AS schedule_revision,
              COALESCE(overlay.effective_local_date, session.local_date, projection.moved_local_date, opportunity.local_date) AS local_date,
              COALESCE(overlay.effective_timezone, session.timezone, version.timezone) AS timezone,
              opportunity.revision, opportunity.state, opportunity.outcome,
              session.id AS session_id, session.status AS session_status,
              overlay.snapshot_json,
              (SELECT event.payload_json
                 FROM owned_plan_schedule_events event
                WHERE event.schedule_id = schedule.id
                  AND event.event_type = 'planned_occurrence_snapshot'
                  AND json_extract(event.payload_json, '$.occurrenceId') = opportunity.id
                ORDER BY event.created_at_ms DESC, event.id DESC LIMIT 1) AS planned_snapshot_json,
              (SELECT COUNT(*) FROM session_sets completed_set
                JOIN session_exercises completed_exercise
                  ON completed_exercise.id = completed_set.session_exercise_id
               WHERE completed_exercise.session_id = session.id
                 AND completed_set.set_kind = 'working'
                 AND completed_set.status = 'completed') AS completed_working_sets,
              (SELECT COUNT(*) FROM session_sets planned_set
                JOIN session_exercises planned_exercise
                  ON planned_exercise.id = planned_set.session_exercise_id
               WHERE planned_exercise.session_id = session.id
                 AND planned_set.set_kind = 'working') AS planned_working_sets,
              (SELECT COUNT(*) FROM owned_plan_working_set_targets target
                JOIN owned_plan_day_exercises exercise
                  ON exercise.id = target.plan_day_exercise_id
               WHERE exercise.plan_day_id = opportunity.plan_day_id) AS planned_target_sets
         FROM owned_plan_schedule_opportunities opportunity
         JOIN owned_plan_schedules schedule ON schedule.id = opportunity.schedule_id
         JOIN owned_plan_schedule_versions version
           ON version.id = opportunity.schedule_version_id
          AND version.schedule_id = schedule.id
         JOIN plans plan ON plan.id = schedule.plan_id
         LEFT JOIN plan_days day ON day.id = opportunity.plan_day_id AND day.plan_id = plan.id
         LEFT JOIN workout_session_schedule_links link ON link.opportunity_id = opportunity.id
         LEFT JOIN workout_sessions session ON session.id = COALESCE(link.workout_session_id, opportunity.session_id)
         LEFT JOIN history_session_overlays overlay ON overlay.session_id = session.id
         LEFT JOIN schedule_collision_projections projection ON projection.selected_kind = 'strength' AND projection.selected_opportunity_id = opportunity.id
          AND NOT EXISTS (
            SELECT 1
            FROM schedule_collision_outcomes later
            JOIN schedule_collision_outcomes current ON current.id = projection.outcome_id
            WHERE later.strength_opportunity_id = current.strength_opportunity_id
              AND later.strength_schedule_revision = current.strength_schedule_revision
              AND later.strength_opportunity_revision = current.strength_opportunity_revision
              AND later.running_opportunity_id = current.running_opportunity_id
              AND later.running_schedule_revision = current.running_schedule_revision
              AND later.running_opportunity_revision = current.running_opportunity_revision
              AND (later.committed_at_ms > current.committed_at_ms
                OR (later.committed_at_ms = current.committed_at_ms AND later.id > current.id))
          )
        WHERE COALESCE(overlay.effective_local_date, session.local_date, projection.moved_local_date, opportunity.local_date) >= ?
          AND COALESCE(overlay.effective_local_date, session.local_date, projection.moved_local_date, opportunity.local_date) < ?
          AND (session.id IS NOT NULL OR schedule.lifecycle = 'active')
          AND (overlay.lifecycle IS NULL OR overlay.lifecycle = 'active')
        ORDER BY local_date, opportunity.id`, [input.start, input.end],
    ),
    reader.queryAll<RunningRow>(
      `SELECT opportunity.id, opportunity.schedule_id, opportunity.schedule_version_id,
              opportunity.plan_id, plan.name AS plan_name, opportunity.slot_id,
              opportunity.session_revision_id, session.session_kind, session.definition_json,
              COALESCE(projection.moved_local_date, opportunity.local_date) AS local_date, opportunity.timezone, opportunity.state
         FROM running_opportunities opportunity
         JOIN plans plan ON plan.id = opportunity.plan_id
         JOIN owned_plan_schedules schedule
           ON schedule.id = opportunity.schedule_id
          AND schedule.plan_id = opportunity.plan_id
          AND schedule.lifecycle = 'active'
         JOIN running_session_slots slot
           ON slot.id = opportunity.slot_id
          AND slot.plan_id = opportunity.plan_id
          AND slot.retired_at_ms IS NULL
         JOIN running_session_revisions session ON session.id = opportunity.session_revision_id AND session.plan_id = opportunity.plan_id
         LEFT JOIN schedule_collision_projections projection ON projection.selected_kind = 'running' AND projection.selected_opportunity_id = opportunity.id
          AND NOT EXISTS (
            SELECT 1
            FROM schedule_collision_outcomes later
            JOIN schedule_collision_outcomes current ON current.id = projection.outcome_id
            WHERE later.strength_opportunity_id = current.strength_opportunity_id
              AND later.strength_schedule_revision = current.strength_schedule_revision
              AND later.strength_opportunity_revision = current.strength_opportunity_revision
              AND later.running_opportunity_id = current.running_opportunity_id
              AND later.running_schedule_revision = current.running_schedule_revision
              AND later.running_opportunity_revision = current.running_opportunity_revision
              AND (later.committed_at_ms > current.committed_at_ms
                OR (later.committed_at_ms = current.committed_at_ms AND later.id > current.id))
          )
        WHERE schedule.lifecycle = 'active'
          AND COALESCE(projection.moved_local_date, opportunity.local_date) >= ? AND COALESCE(projection.moved_local_date, opportunity.local_date) < ?
        ORDER BY local_date, slot.ordinal, opportunity.id`, [input.start, input.end],
    ),
    reader.queryAll<ImportedRow>(
      `SELECT activity.id, activity.source, identity.source_kind, identity.account_namespace,
              identity.external_activity_id, activity.started_at_ms, activity.aggregate_json,
              match.opportunity_id,
              matched_opportunity.schedule_id AS matched_schedule_id,
              matched_opportunity.schedule_version_id AS matched_schedule_version_id,
              matched_opportunity.plan_id AS matched_plan_id,
              matched_opportunity.slot_id AS matched_slot_id
         FROM imported_activities activity
         JOIN imported_activity_identities identity ON identity.activity_id = activity.id
         JOIN imported_activity_current_lifecycle lifecycle ON lifecycle.activity_id = activity.id
         LEFT JOIN running_activity_current_matches match ON match.activity_id = activity.id
         LEFT JOIN running_opportunities matched_opportunity
           ON matched_opportunity.id = match.opportunity_id
        WHERE lifecycle.removal_state = 'active'
          AND json_extract(activity.aggregate_json, '$.confirmed_local_date') >= ?
          AND json_extract(activity.aggregate_json, '$.confirmed_local_date') < ?
        ORDER BY json_extract(activity.aggregate_json, '$.confirmed_local_date'), activity.started_at_ms, activity.id`, [input.start, input.end],
    ),
  ]);
  const strength = strengthRows.map(strengthProjection);
  const restByDate = new Map(
    strength.flatMap(({ rest }) => rest === null ? [] : [[rest.localDate, rest.summary] as const]),
  );
  const imported = importedRows.flatMap((row) => {
    const facts = importedFacts(row);
    if (facts === null) return [];
    const matched = row.opportunity_id !== null
      && row.matched_schedule_id !== null && row.matched_schedule_id.trim().length > 0
      && row.matched_schedule_version_id !== null && row.matched_schedule_version_id.trim().length > 0
      && row.matched_plan_id !== null && row.matched_plan_id.trim().length > 0
      && row.matched_slot_id !== null && row.matched_slot_id.trim().length > 0;
    return [{
      matchedOpportunityId: matched ? row.opportunity_id : null,
      event: Object.freeze({
        id: row.id, source: "imported_activity" as const, sport: "running" as const,
        status: matched ? "matched" as const : "imported" as const, title: facts.title,
        displaySummary: facts.displaySummary, sourceLabel: "Garmin",
        sourceIdentity: Object.freeze({
          sourceKind: "garmin_connect_account" as const,
          accountNamespace: row.account_namespace,
          externalActivityId: row.external_activity_id,
        }),
        localDate: facts.localDate, timeZone: facts.timeZone,
        scheduleId: matched ? row.matched_schedule_id : null,
        scheduleVersionId: matched ? row.matched_schedule_version_id : null,
        planId: matched ? row.matched_plan_id : null,
        slotId: matched ? row.matched_slot_id : null,
        revision: null,
        state: matched ? "matched" : "imported",
        destination: Object.freeze({ kind: "activity" as const, activityId: row.id }),
      }),
    }];
  });
  const matchedOpportunityIds = new Set(
    imported.flatMap(({ matchedOpportunityId }) =>
      matchedOpportunityId === null ? [] : [matchedOpportunityId]
    ),
  );
  const events: TrainingCalendarEvent[] = [
    ...strength.flatMap(({ event }) => {
      return event === null ? [] : [event];
    }),
    ...runningRows.filter((row) => !matchedOpportunityIds.has(row.id)).flatMap((row) => {
      const event = runningEvent(row);
      return event === null ? [] : [event];
    }),
    ...imported.map(({ event }) => event),
  ];
  const orderedEvents = Object.freeze(events.sort((left, right) => {
      const sourceOrder = { strength: 0, running: 1, imported_activity: 2 } as const;
      return left.localDate.localeCompare(right.localDate)
        || sourceOrder[left.source] - sourceOrder[right.source];
    }));
  const eventDates = new Set(orderedEvents.map(({ localDate }) => localDate));
  const dayCount = differenceInLocalDays(input.start, input.end);
  const days = Object.freeze(Array.from({ length: dayCount }, (_, index): TrainingCalendarDay => {
    const localDate = addLocalDays(input.start, index);
    const restSummary = restByDate.get(localDate) ?? null;
    return Object.freeze({
      localDate,
      kind: eventDates.has(localDate)
        ? "events"
        : restSummary === null ? "empty" : "rest",
      restSummary,
    });
  }));
  return Object.freeze({
    events: orderedEvents,
    days,
  });
}

/** Query-only, bounded source facts for Today and Calendar.  This deliberately
 * neither materializes an opportunity nor consults current activation state. */
export function createTrainingCalendarRepository(kernel: SqliteKernel) {
  return Object.freeze({
    async loadRange(input: Readonly<{ startLocalDate: string; endLocalDateExclusive: string }>): Promise<TrainingCalendarRange> {
      const bounded = range(input);
      if (kernel.readSnapshot !== undefined) return kernel.readSnapshot((reader) => queryRange(reader, bounded));
      return queryRange(kernel, bounded);
    },
  });
}
