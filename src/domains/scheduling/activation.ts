import {
  parseLocalDate,
  WEEKDAYS,
  type LocalDate,
  type Weekday,
} from "./localDate";
import {
  parseStoredTimeZone,
  type StoredTimeZone,
} from "./timeZone";

export type InitialWeekdayScheduleBinding = Readonly<{
  planDaySourceId: string;
  ordinal: number;
  weekIndex: number;
  weekday: Weekday;
}>;

export type InitialRotationScheduleBinding = Readonly<{
  planDaySourceId: string;
  ordinal: number;
}>;

export type InitialScheduleActivation =
  | Readonly<{
      startLocalDate: LocalDate;
      timeZone: StoredTimeZone;
      mode: "weekday";
      bindings: readonly InitialWeekdayScheduleBinding[];
    }>
  | Readonly<{
      startLocalDate: LocalDate;
      timeZone: StoredTimeZone;
      mode: "rotation";
      bindings: readonly InitialRotationScheduleBinding[];
    }>;

export type InitialScheduleActivationInput =
  | Readonly<{
      startLocalDate: string;
      timeZone: string;
      mode: "weekday";
      bindings: readonly InitialWeekdayScheduleBinding[];
    }>
  | Readonly<{
      startLocalDate: string;
      timeZone: string;
      mode: "rotation";
      bindings: readonly InitialRotationScheduleBinding[];
    }>;

export type InitialScheduleActivationErrorCode =
  | "activation_bindings_invalid"
  | "activation_start_local_date_invalid"
  | "activation_timezone_invalid";

export class InitialScheduleActivationError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-ACTIVATE01" as const;

  constructor(readonly code: InitialScheduleActivationErrorCode) {
    super(code);
    this.name = "InitialScheduleActivationError";
  }
}

function validatedLocalDate(value: string): LocalDate {
  try {
    return parseLocalDate(value);
  } catch {
    throw new InitialScheduleActivationError(
      "activation_start_local_date_invalid",
    );
  }
}

function validatedTimeZone(value: string): StoredTimeZone {
  try {
    return parseStoredTimeZone(value);
  } catch {
    throw new InitialScheduleActivationError("activation_timezone_invalid");
  }
}

function validIdentifier(value: string): boolean {
  return value.trim() === value && value.length >= 1 && value.length <= 128;
}

function validOrdinal(value: number, expected: number): boolean {
  return Number.isSafeInteger(value) && value === expected;
}

function validWeekdayBinding(
  binding: InitialWeekdayScheduleBinding,
  expectedOrdinal: number,
): boolean {
  return validIdentifier(binding.planDaySourceId)
    && validOrdinal(binding.ordinal, expectedOrdinal)
    && Number.isSafeInteger(binding.weekIndex)
    && binding.weekIndex >= 0
    && WEEKDAYS.includes(binding.weekday);
}

function validRotationBinding(
  binding: InitialRotationScheduleBinding,
  expectedOrdinal: number,
): boolean {
  return validIdentifier(binding.planDaySourceId)
    && validOrdinal(binding.ordinal, expectedOrdinal);
}

function validateWeekdayBindings(
  bindings: readonly InitialWeekdayScheduleBinding[],
): readonly InitialWeekdayScheduleBinding[] {
  const slots = new Set<string>();
  for (const [index, binding] of bindings.entries()) {
    const slot = `${binding.weekIndex}:${binding.weekday}`;
    if (
      !validWeekdayBinding(binding, index)
      || slots.has(slot)
    ) {
      throw new InitialScheduleActivationError("activation_bindings_invalid");
    }
    slots.add(slot);
  }
  return bindings.map((binding) => ({ ...binding }));
}

function validateRotationBindings(
  bindings: readonly InitialRotationScheduleBinding[],
): readonly InitialRotationScheduleBinding[] {
  for (const [index, binding] of bindings.entries()) {
    if (!validRotationBinding(binding, index)) {
      throw new InitialScheduleActivationError("activation_bindings_invalid");
    }
  }
  return bindings.map((binding) => ({ ...binding }));
}

export function validateInitialScheduleActivation(
  input: InitialScheduleActivationInput,
): InitialScheduleActivation {
  if (input.bindings.length === 0) {
    throw new InitialScheduleActivationError("activation_bindings_invalid");
  }
  const startLocalDate = validatedLocalDate(input.startLocalDate);
  const timeZone = validatedTimeZone(input.timeZone);
  if (input.mode === "weekday") {
    return {
      startLocalDate,
      timeZone,
      mode: input.mode,
      bindings: validateWeekdayBindings(input.bindings),
    };
  }
  return {
    startLocalDate,
    timeZone,
    mode: input.mode,
    bindings: validateRotationBindings(input.bindings),
  };
}
