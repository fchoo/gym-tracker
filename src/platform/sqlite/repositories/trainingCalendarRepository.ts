import { parseLocalDate, type LocalDate } from "../../../domains/scheduling/localDate";
import type { SqliteKernel, SqliteReadTransactionExecutor } from "../sqliteKernel";

export type TrainingCalendarEvent = Readonly<{
  id: string;
  source: "strength" | "running" | "imported_activity";
  localDate: LocalDate;
  timeZone: string | null;
  scheduleId: string | null;
  scheduleVersionId: string | null;
  planId: string | null;
  slotId: string | null;
  revision: number | null;
  state: string;
}>;

export type TrainingCalendarRange = Readonly<{
  events: readonly TrainingCalendarEvent[];
}>;

type StrengthRow = Readonly<{
  id: string; schedule_id: string; schedule_version_id: string; plan_id: string;
  local_date: string; timezone: string; revision: number; state: string; outcome: string | null;
}>;
type RunningRow = Readonly<{
  id: string; schedule_id: string; schedule_version_id: string; plan_id: string;
  slot_id: string; session_revision_id: string; local_date: string; timezone: string; state: string;
}>;
type ImportedRow = Readonly<{ id: string; started_at_ms: number; aggregate_json: string }>;

function range(input: Readonly<{ startLocalDate: string; endLocalDateExclusive: string }>): Readonly<{ start: LocalDate; end: LocalDate }> {
  const start = parseLocalDate(input.startLocalDate);
  const end = parseLocalDate(input.endLocalDateExclusive);
  if (start >= end) throw new Error("training_calendar_range_invalid");
  return Object.freeze({ start, end });
}

function importedLocalDate(row: ImportedRow): LocalDate | null {
  try {
    const aggregate = JSON.parse(row.aggregate_json) as { confirmed_local_date?: unknown };
    return typeof aggregate.confirmed_local_date === "string" ? parseLocalDate(aggregate.confirmed_local_date) : null;
  } catch {
    return null;
  }
}

async function queryRange(
  reader: SqliteReadTransactionExecutor,
  input: Readonly<{ start: LocalDate; end: LocalDate }>,
): Promise<TrainingCalendarRange> {
  const [strengthRows, runningRows, importedRows] = await Promise.all([
    reader.queryAll<StrengthRow>(
      `SELECT opportunity.id, opportunity.schedule_id, opportunity.schedule_version_id,
              schedule.plan_id, opportunity.local_date, version.timezone,
              opportunity.revision, opportunity.state, opportunity.outcome
         FROM owned_plan_schedule_opportunities opportunity
         JOIN owned_plan_schedules schedule ON schedule.id = opportunity.schedule_id
         JOIN owned_plan_schedule_versions version ON version.id = opportunity.schedule_version_id
        WHERE opportunity.local_date >= ? AND opportunity.local_date < ?
        ORDER BY opportunity.local_date, opportunity.id`, [input.start, input.end],
    ),
    reader.queryAll<RunningRow>(
      `SELECT opportunity.id, opportunity.schedule_id, opportunity.schedule_version_id,
              opportunity.plan_id, opportunity.slot_id, opportunity.session_revision_id,
              opportunity.local_date, opportunity.timezone, opportunity.state
         FROM running_opportunities opportunity
        WHERE opportunity.local_date >= ? AND opportunity.local_date < ?
        ORDER BY opportunity.local_date, opportunity.slot_id, opportunity.id`, [input.start, input.end],
    ),
    reader.queryAll<ImportedRow>(
      `SELECT activity.id, activity.started_at_ms, activity.aggregate_json
         FROM imported_activities activity
         JOIN imported_activity_current_lifecycle lifecycle ON lifecycle.activity_id = activity.id
        WHERE lifecycle.removal_state = 'active'
          AND json_extract(activity.aggregate_json, '$.confirmed_local_date') >= ?
          AND json_extract(activity.aggregate_json, '$.confirmed_local_date') < ?
        ORDER BY json_extract(activity.aggregate_json, '$.confirmed_local_date'), activity.started_at_ms, activity.id`, [input.start, input.end],
    ),
  ]);
  const events: TrainingCalendarEvent[] = [
    ...strengthRows.map((row) => Object.freeze({
      id: row.id, source: "strength" as const, localDate: parseLocalDate(row.local_date), timeZone: row.timezone,
      scheduleId: row.schedule_id, scheduleVersionId: row.schedule_version_id, planId: row.plan_id,
      slotId: null, revision: row.revision, state: row.outcome ?? row.state,
    })),
    ...runningRows.map((row) => Object.freeze({
      id: row.id, source: "running" as const, localDate: parseLocalDate(row.local_date), timeZone: row.timezone,
      scheduleId: row.schedule_id, scheduleVersionId: row.schedule_version_id, planId: row.plan_id,
      slotId: row.slot_id, revision: null, state: row.state,
    })),
    ...importedRows.flatMap((row) => {
      const localDate = importedLocalDate(row);
      return localDate === null ? [] : [Object.freeze({
        id: row.id, source: "imported_activity" as const, localDate, timeZone: null,
        scheduleId: null, scheduleVersionId: null, planId: null, slotId: null, revision: null, state: "imported",
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
