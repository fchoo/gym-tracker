import {
  parseLocalDate,
  weekdayForLocalDate,
  type LocalDate,
  type Weekday,
} from "./localDate";

declare const STORED_TIME_ZONE_BRAND: unique symbol;

export type StoredTimeZone = string & {
  readonly [STORED_TIME_ZONE_BRAND]: true;
};

export type StoredCalendarContext = Readonly<{
  localDate: LocalDate;
  timeZone: StoredTimeZone;
  weekday: Weekday;
}>;

export class ScheduleTimeZoneError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;

  constructor(readonly code: string) {
    super(code);
    this.name = "ScheduleTimeZoneError";
  }
}

const MAXIMUM_DATE_INSTANT_MS = 8_640_000_000_000_000;

function calendarFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US-u-ca-iso8601-nu-latn", {
      calendar: "iso8601",
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    });
  } catch {
    throw new ScheduleTimeZoneError("schedule_timezone_invalid");
  }
}

function validInstant(instantMs: number): boolean {
  return Number.isSafeInteger(instantMs)
    && instantMs >= 0
    && instantMs <= MAXIMUM_DATE_INSTANT_MS;
}

export function parseStoredTimeZone(value: string): StoredTimeZone {
  if (value.trim() !== value || value.length === 0) {
    throw new ScheduleTimeZoneError("schedule_timezone_invalid");
  }
  calendarFormatter(value);
  return value as StoredTimeZone;
}

export function localDateAtInstant(
  instantMs: number,
  timeZone: StoredTimeZone,
): LocalDate {
  if (!validInstant(instantMs)) {
    throw new ScheduleTimeZoneError("schedule_instant_invalid");
  }
  const parts = calendarFormatter(timeZone).formatToParts(new Date(instantMs));
  const values = new Map(
    parts
      .filter((part) => (
        part.type === "year"
        || part.type === "month"
        || part.type === "day"
      ))
      .map((part) => [part.type, part.value]),
  );
  const year = values.get("year")!;
  const month = values.get("month")!;
  const day = values.get("day")!;
  return parseLocalDate(`${year.padStart(4, "0")}-${month}-${day}`);
}

export function resolveStoredCalendarContext(
  instantMs: number,
  timeZone: StoredTimeZone,
): StoredCalendarContext {
  const localDate = localDateAtInstant(instantMs, timeZone);
  return {
    localDate,
    timeZone,
    weekday: weekdayForLocalDate(localDate),
  };
}
