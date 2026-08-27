declare const LOCAL_DATE_BRAND: unique symbol;

export type LocalDate = string & {
  readonly [LOCAL_DATE_BRAND]: true;
};

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export class LocalDateValidationError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;

  constructor(readonly code: string) {
    super(code);
    this.name = "LocalDateValidationError";
  }
}

type LocalDateComponents = Readonly<{
  year: number;
  month: number;
  day: number;
}>;

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_PER_400_YEARS = 146_097;
const CIVIL_EPOCH_OFFSET = 719_468;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function componentsOf(value: string): LocalDateComponents {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (match === null) {
    throw new LocalDateValidationError("local_date_invalid");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    year < 1
    || year > 9_999
    || month < 1
    || month > 12
    || day < 1
    || day > daysInMonth(year, month)
  ) {
    throw new LocalDateValidationError("local_date_invalid");
  }
  return { year, month, day };
}

function daysFromCivil(
  year: number,
  month: number,
  day: number,
): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365
    + Math.floor(yearOfEra / 4)
    - Math.floor(yearOfEra / 100)
    + dayOfYear;
  return era * DAYS_PER_400_YEARS + dayOfEra - CIVIL_EPOCH_OFFSET;
}

function civilFromDays(daysSinceEpoch: number): LocalDateComponents {
  const civilDays = daysSinceEpoch + CIVIL_EPOCH_OFFSET;
  const era = Math.floor(civilDays / DAYS_PER_400_YEARS);
  const dayOfEra = civilDays - era * DAYS_PER_400_YEARS;
  const yearOfEra = Math.floor(
    (
      dayOfEra
      - Math.floor(dayOfEra / 1_460)
      + Math.floor(dayOfEra / 36_524)
      - Math.floor(dayOfEra / 146_096)
    ) / 365,
  );
  let year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (
    365 * yearOfEra
    + Math.floor(yearOfEra / 4)
    - Math.floor(yearOfEra / 100)
  );
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return { year, month, day };
}

function formatComponents(components: LocalDateComponents): LocalDate {
  if (components.year < 1 || components.year > 9_999) {
    throw new LocalDateValidationError("local_date_out_of_range");
  }
  return [
    components.year.toString().padStart(4, "0"),
    components.month.toString().padStart(2, "0"),
    components.day.toString().padStart(2, "0"),
  ].join("-") as LocalDate;
}

function ordinal(value: LocalDate): number {
  const { year, month, day } = componentsOf(value);
  return daysFromCivil(year, month, day);
}

export function parseLocalDate(value: string): LocalDate {
  componentsOf(value);
  return value as LocalDate;
}

export function compareLocalDates(
  left: LocalDate,
  right: LocalDate,
): -1 | 0 | 1 {
  const leftOrdinal = ordinal(left);
  const rightOrdinal = ordinal(right);
  if (leftOrdinal === rightOrdinal) {
    return 0;
  }
  return leftOrdinal < rightOrdinal ? -1 : 1;
}

export function addLocalDays(value: LocalDate, dayCount: number): LocalDate {
  if (!Number.isSafeInteger(dayCount)) {
    throw new LocalDateValidationError("local_date_day_count_invalid");
  }
  return formatComponents(civilFromDays(ordinal(value) + dayCount));
}

export function differenceInLocalDays(
  from: LocalDate,
  to: LocalDate,
): number {
  return ordinal(to) - ordinal(from);
}

export function weekdayForLocalDate(value: LocalDate): Weekday {
  const weekdayIndex = ((ordinal(value) + 4) % 7 + 7) % 7;
  return WEEKDAYS[weekdayIndex]!;
}
