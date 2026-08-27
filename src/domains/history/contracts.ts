import {
  parseLocalDate,
  type LocalDate,
} from "../scheduling";

export type HistoryLifecycle = "active" | "voided";

export type HistorySessionStatus =
  | "completed"
  | "partial"
  | "manual_visit"
  | "zero_sets";

export type HistorySource =
  | "scheduled_day"
  | "alternate_day"
  | "rest_day"
  | "empty"
  | "manual";

export type HistoryProgress = Readonly<{
  completed: number;
  planned: number;
  percent: number | null;
}>;

export type OriginalHistoryFacts = Readonly<{
  localDate: LocalDate;
  timezone: string;
  startedAtMs: number;
  completedAtMs: number | null;
  creationTimezoneOffsetMinutes: number;
}>;

export type EffectiveHistoryFacts = Readonly<{
  lifecycle: HistoryLifecycle;
  localDate: LocalDate;
  timezone: string;
  startedAtMs: number;
  completedAtMs: number | null;
  revision: number;
}>;

export type HistorySessionSummary = Readonly<{
  id: string;
  status: HistorySessionStatus;
  source: HistorySource;
  sourceLabel: string;
  planName: string | null;
  dayName: string | null;
  original: OriginalHistoryFacts;
  effective: EffectiveHistoryFacts;
  exerciseProgress: HistoryProgress;
  workingSetProgress: HistoryProgress;
}>;

export type RemovedHistorySession = Readonly<{
  id: string;
  sourceLabel: string;
  planName: string | null;
  dayName: string | null;
  localDate: LocalDate;
  timezone: string;
  effectiveRevision: number;
  removedAtMs: number;
  workingSetProgress: HistoryProgress;
}>;

export type CalendarDayState =
  | "completed"
  | "partial"
  | "manual"
  | "planned_not_completed"
  | "today";

export type CalendarDay = Readonly<{
  localDate: LocalDate;
  states: readonly CalendarDayState[];
}>;

export type CalendarMonth = Readonly<{
  days: readonly CalendarDay[];
  month: LocalDate;
  selectedDate: LocalDate;
  sessions: readonly HistorySessionSummary[];
}>;

export function parseHistoryLocalDate(value: string): LocalDate {
  return parseLocalDate(value);
}

export function historyProgress(
  completed: number,
  planned: number,
): HistoryProgress {
  if (
    !Number.isSafeInteger(completed)
    || !Number.isSafeInteger(planned)
    || completed < 0
    || planned < 0
    || completed > planned
  ) {
    throw new TypeError("history_progress_invalid");
  }
  return Object.freeze({
    completed,
    planned,
    percent: planned === 0 ? null : Math.round((completed / planned) * 100),
  });
}
