import { parseLocalDate, type LocalDate } from "../../../domains/scheduling/localDate";
import type { SqliteKernel, SqliteReadTransactionExecutor } from "../sqliteKernel";

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
  | Readonly<CalendarEventFacts & { source: "imported_activity"; sport: "running"; status: "imported" | "matched"; destination: Readonly<{ kind: "activity"; activityId: string }> }>;

export type TrainingCalendarRange = Readonly<{
  events: readonly TrainingCalendarEvent[];
}>;

type StrengthRow = Readonly<{
  id: string; schedule_id: string; schedule_version_id: string; plan_id: string; plan_name: string;
  local_date: string; timezone: string; revision: number; state: string; outcome: string | null;
  session_id: string | null; session_status: string | null;
}>;
type RunningRow = Readonly<{
  id: string; schedule_id: string; schedule_version_id: string; plan_id: string; plan_name: string;
  slot_id: string; session_revision_id: string; session_kind: string; local_date: string; timezone: string; state: string;
}>;
type ImportedRow = Readonly<{
  id: string; source: string; started_at_ms: number; aggregate_json: string; opportunity_id: string | null;
}>;

function range(input: Readonly<{ startLocalDate: string; endLocalDateExclusive: string }>): Readonly<{ start: LocalDate; end: LocalDate }> {
  const start = parseLocalDate(input.startLocalDate);
  const end = parseLocalDate(input.endLocalDateExclusive);
  if (start >= end) throw new Error("training_calendar_range_invalid");
  return Object.freeze({ start, end });
}

type ImportedFacts = Readonly<{ localDate: LocalDate; timeZone: string | null; title: string }>;

function displayWords(value: string): string {
  const words = value.replaceAll("_", " ").replaceAll("-", " ").trim();
  return words.length === 0 ? "" : `${words[0]!.toUpperCase()}${words.slice(1)}`;
}

function importedFacts(row: ImportedRow): ImportedFacts | null {
  try {
    const aggregate = JSON.parse(row.aggregate_json) as {
      confirmed_local_date?: unknown;
      normalized?: { sport?: unknown; subtype?: unknown; source_time_zone?: unknown };
    };
    if (typeof aggregate.confirmed_local_date !== "string"
      || aggregate.normalized?.sport !== "running"
      || typeof aggregate.normalized.subtype !== "string") return null;
    const subtype = displayWords(aggregate.normalized.subtype);
    if (subtype.length === 0 || row.source.trim().length === 0) return null;
    return Object.freeze({
      localDate: parseLocalDate(aggregate.confirmed_local_date),
      timeZone: typeof aggregate.normalized.source_time_zone === "string" ? aggregate.normalized.source_time_zone : null,
      title: `${subtype} run`,
    });
  } catch {
    return null;
  }
}

function strengthEvent(row: StrengthRow): TrainingCalendarEvent | null {
  if (row.plan_name.trim().length === 0) return null;
  const base = {
    id: row.id, source: "strength" as const, sport: "strength" as const,
    title: row.plan_name, sourceLabel: "Strength", localDate: parseLocalDate(row.local_date), timeZone: row.timezone,
    scheduleId: row.schedule_id, scheduleVersionId: row.schedule_version_id, planId: row.plan_id,
    slotId: null, revision: row.revision,
  };
  if ((row.session_status === "completed" || row.session_status === "partial") && row.session_id !== null) {
    return Object.freeze({
      ...base, status: row.session_status, state: row.session_status,
      destination: Object.freeze({ kind: "session" as const, sessionId: row.session_id }),
    });
  }
  if (row.session_id !== null
    || row.session_status !== null
    || row.outcome === "completed"
    || row.outcome === "partial"
    || row.state === "completed"
    || row.state === "partial") return null;
  return Object.freeze({
    ...base, status: "planned" as const, state: "planned",
    destination: Object.freeze({ kind: "occurrence" as const, occurrenceId: row.id }),
  });
}

function runningEvent(row: RunningRow): TrainingCalendarEvent | null {
  if (row.state !== "planned" || row.plan_name.trim().length === 0 || row.session_revision_id.trim().length === 0) return null;
  const sourceLabel = displayWords(row.session_kind);
  if (sourceLabel.length === 0) return null;
  return Object.freeze({
    id: row.id, source: "running", sport: "running", status: "planned", title: row.plan_name, sourceLabel,
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
              schedule.plan_id, plan.name AS plan_name, COALESCE(projection.moved_local_date, opportunity.local_date) AS local_date, version.timezone,
              opportunity.revision, opportunity.state, opportunity.outcome, session.id AS session_id, session.status AS session_status
         FROM owned_plan_schedule_opportunities opportunity
         JOIN owned_plan_schedules schedule ON schedule.id = opportunity.schedule_id
         JOIN owned_plan_schedule_versions version ON version.id = opportunity.schedule_version_id
         JOIN plans plan ON plan.id = schedule.plan_id
         LEFT JOIN workout_session_schedule_links link ON link.opportunity_id = opportunity.id
         LEFT JOIN workout_sessions session ON session.id = link.workout_session_id
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
        WHERE COALESCE(projection.moved_local_date, opportunity.local_date) >= ? AND COALESCE(projection.moved_local_date, opportunity.local_date) < ?
        ORDER BY local_date, opportunity.id`, [input.start, input.end],
    ),
    reader.queryAll<RunningRow>(
      `SELECT opportunity.id, opportunity.schedule_id, opportunity.schedule_version_id,
              opportunity.plan_id, plan.name AS plan_name, opportunity.slot_id, opportunity.session_revision_id, session.session_kind,
              COALESCE(projection.moved_local_date, opportunity.local_date) AS local_date, opportunity.timezone, opportunity.state
         FROM running_opportunities opportunity
         JOIN plans plan ON plan.id = opportunity.plan_id
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
        WHERE COALESCE(projection.moved_local_date, opportunity.local_date) >= ? AND COALESCE(projection.moved_local_date, opportunity.local_date) < ?
        ORDER BY local_date, opportunity.slot_id, opportunity.id`, [input.start, input.end],
    ),
    reader.queryAll<ImportedRow>(
      `SELECT activity.id, activity.source, activity.started_at_ms, activity.aggregate_json,
              match.opportunity_id
         FROM imported_activities activity
         JOIN imported_activity_current_lifecycle lifecycle ON lifecycle.activity_id = activity.id
         LEFT JOIN running_activity_current_matches match ON match.activity_id = activity.id
        WHERE lifecycle.removal_state = 'active'
          AND json_extract(activity.aggregate_json, '$.confirmed_local_date') >= ?
          AND json_extract(activity.aggregate_json, '$.confirmed_local_date') < ?
        ORDER BY json_extract(activity.aggregate_json, '$.confirmed_local_date'), activity.started_at_ms, activity.id`, [input.start, input.end],
    ),
  ]);
  const matchedOpportunityIds = new Set(
    importedRows.flatMap(({ opportunity_id }) => opportunity_id === null ? [] : [opportunity_id]),
  );
  const events: TrainingCalendarEvent[] = [
    ...strengthRows.flatMap((row) => {
      const event = strengthEvent(row);
      return event === null ? [] : [event];
    }),
    ...runningRows.filter((row) => !matchedOpportunityIds.has(row.id)).flatMap((row) => {
      const event = runningEvent(row);
      return event === null ? [] : [event];
    }),
    ...importedRows.flatMap((row) => {
      const facts = importedFacts(row);
      const matched = row.opportunity_id === null
        ? null
        : runningRows.find(({ id }) => id === row.opportunity_id) ?? null;
      if (facts === null || (row.opportunity_id !== null && matched === null)) return [];
      return [Object.freeze({
        id: row.id, source: "imported_activity" as const, sport: "running" as const,
        status: matched === null ? "imported" as const : "matched" as const, title: facts.title, sourceLabel: row.source,
        localDate: facts.localDate, timeZone: facts.timeZone,
        scheduleId: matched?.schedule_id ?? null, scheduleVersionId: matched?.schedule_version_id ?? null,
        planId: matched?.plan_id ?? null, slotId: matched?.slot_id ?? null, revision: null,
        state: matched === null ? "imported" : "matched", destination: Object.freeze({ kind: "activity" as const, activityId: row.id }),
      })];
    }),
  ];
  return Object.freeze({
    events: Object.freeze(events.sort((left, right) => {
      const sourceOrder = { strength: 0, running: 1, imported_activity: 2 } as const;
      return left.localDate.localeCompare(right.localDate)
        || sourceOrder[left.source] - sourceOrder[right.source]
        || left.id.localeCompare(right.id);
    })),
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
