import {
  compareLocalDates,
  weekdayForLocalDate,
  type LocalDate,
  type Weekday,
} from "./localDate";
import type { StoredTimeZone } from "./timeZone";

export const FOLLOW_DEVICE_TIMEZONE_LABEL =
  "Follow device timezone from today";
export const KEEP_CURRENT_TIMEZONE_LABEL = "Keep current timezone";

export type ScheduleTimeZoneChoice =
  | typeof FOLLOW_DEVICE_TIMEZONE_LABEL
  | typeof KEEP_CURRENT_TIMEZONE_LABEL;

export class ScheduleTransitionError extends Error {
  readonly kind = "conflict" as const;
  readonly retryable = false;

  constructor(readonly code: string) {
    super(code);
    this.name = "ScheduleTransitionError";
  }
}

export type PendingScheduleOpportunityV1 = Readonly<{
  version: 1;
  state: "pending";
  id: string;
  source: "weekday" | "rotation";
  localDate: LocalDate;
  planDayId: string;
  revision: number;
}>;

export type ScheduleOpportunityOutcome =
  | "completed"
  | "skipped"
  | "planned_not_completed"
  | "advanced";

export type ConsumedScheduleOpportunityV1 = Readonly<{
  version: 1;
  state: "consumed";
  id: string;
  source: "weekday" | "rotation";
  localDate: LocalDate;
  planDayId: string;
  revision: number;
  outcome: ScheduleOpportunityOutcome;
  sessionId: string | null;
}>;

export type ScheduleOpportunityV1 =
  | PendingScheduleOpportunityV1
  | ConsumedScheduleOpportunityV1;

export type RotationScheduleStateV1 = Readonly<{
  version: 1;
  mode: "rotation";
  revision: number;
  bindings: readonly string[];
  pointer: number;
  currentOpportunity: PendingScheduleOpportunityV1 | null;
}>;

type TrainAnywayWorkout =
  | Readonly<{
      kind: "plan_day";
      planDayId: string;
    }>
  | Readonly<{
      kind: "rest_day" | "empty";
      planDayId: null;
    }>;

export type RotationAction =
  | Readonly<{
      type: "complete_scheduled";
      sessionId: string;
      sessionLocalDate: LocalDate;
      planDayId: string;
    }>
  | Readonly<{
      type: "repeat" | "skip" | "advance";
    }>
  | Readonly<{
      type: "train_anyway";
      localDate: LocalDate;
      workout: TrainAnywayWorkout;
      advanceRotation: boolean;
    }>;

export type RotationEvent =
  | Readonly<{
      type:
        | "rotation_completed"
        | "rotation_repeated"
        | "rotation_skipped"
        | "rotation_advanced";
      fromPointer: number;
      toPointer: number;
    }>
  | Readonly<{
      type: "train_anyway";
      localDate: LocalDate;
      workoutKind: TrainAnywayWorkout["kind"];
      planDayId: string | null;
      rotationAdvanced: boolean;
      fromPointer: number;
      toPointer: number;
    }>;

export type RotationTransitionResult = Readonly<{
  next: RotationScheduleStateV1;
  consumed: ConsumedScheduleOpportunityV1 | null;
  events: readonly RotationEvent[];
}>;

export type WeekdayBinding = Readonly<{
  weekday: Weekday;
  planDayId: string;
}>;

export type WeekdayOpportunityAction =
  | Readonly<{
      type: "skip";
    }>
  | Readonly<{
      type: "mark_missed";
      observedLocalDate: LocalDate;
    }>
  | Readonly<{
      type: "complete";
      sessionId: string;
      sessionLocalDate: LocalDate;
    }>;

export type WeekdayOpportunityEvent =
  | Readonly<{
      type: "weekday_skipped";
      localDate: LocalDate;
      planDayId: string;
    }>
  | Readonly<{
      type: "weekday_missed";
      localDate: LocalDate;
      planDayId: string;
      label: "Planned but not completed";
    }>
  | Readonly<{
      type: "weekday_completed";
      localDate: LocalDate;
      planDayId: string;
      sessionId: string;
    }>;

export type WeekdayOpportunityTransitionResult = Readonly<{
  next: ConsumedScheduleOpportunityV1;
  events: readonly WeekdayOpportunityEvent[];
}>;

export type ScheduleOverrideSelection =
  | Readonly<{
      kind: "plan_day";
      planDayId: string;
    }>
  | Readonly<{
      kind: "rest_day" | "skip";
    }>;

export type PendingScheduleDateOverrideV1 = Readonly<{
  version: 1;
  state: "pending";
  id: string;
  revision: number;
  localDate: LocalDate;
  selection: ScheduleOverrideSelection;
}>;

export type ConsumedScheduleDateOverrideV1 = Readonly<{
  version: 1;
  state: "consumed";
  id: string;
  revision: number;
  localDate: LocalDate;
  selection: ScheduleOverrideSelection;
  opportunityId: string;
}>;

export type ScheduleDateOverrideV1 =
  | PendingScheduleDateOverrideV1
  | ConsumedScheduleDateOverrideV1;

export type DateOverrideEvent =
  | Readonly<{
      type: "override_created";
      localDate: LocalDate;
      replacement: ScheduleOverrideSelection;
    }>
  | Readonly<{
      type: "override_replaced";
      localDate: LocalDate;
      previous: ScheduleOverrideSelection;
      replacement: ScheduleOverrideSelection;
    }>
  | Readonly<{
      type: "override_consumed";
      localDate: LocalDate;
      opportunityId: string;
    }>;

export type DateOverrideTransitionResult = Readonly<{
  next: PendingScheduleDateOverrideV1;
  events: readonly DateOverrideEvent[];
}>;

export type ConsumedDateOverrideTransitionResult = Readonly<{
  next: ConsumedScheduleDateOverrideV1;
  events: readonly DateOverrideEvent[];
}>;

export type ScheduleTimeZoneDecision = Readonly<{
  detectedDeviceTimeZone: StoredTimeZone;
  effectiveLocalDate: LocalDate;
  choice: ScheduleTimeZoneChoice;
}>;

export type ScheduleTimeZoneStateV1 = Readonly<{
  version: 1;
  revision: number;
  timeZone: StoredTimeZone;
  lastDeviceTimeZoneDecision: ScheduleTimeZoneDecision | null;
}>;

export type ScheduleTimeZoneEvent = Readonly<{
  type: "timezone_followed" | "timezone_kept";
  effectiveLocalDate: LocalDate;
  previousTimeZone: StoredTimeZone;
  detectedDeviceTimeZone: StoredTimeZone;
  nextTimeZone: StoredTimeZone;
}>;

export type ScheduleTimeZoneTransitionResult = Readonly<{
  next: ScheduleTimeZoneStateV1;
  events: readonly ScheduleTimeZoneEvent[];
}>;

function assertExpectedRevision(
  actualRevision: number,
  expectedRevision: number,
): void {
  if (actualRevision !== expectedRevision) {
    throw new ScheduleTransitionError("schedule_revision_conflict");
  }
}

function assertNonEmptyIdentifier(value: string): void {
  if (value.length === 0) {
    throw new ScheduleTransitionError("schedule_identifier_invalid");
  }
}

function assertRotationCurrent(
  current: RotationScheduleStateV1,
): PendingScheduleOpportunityV1 {
  const expectedPlanDayId = current.bindings[current.pointer];
  if (
    expectedPlanDayId === undefined
    || current.currentOpportunity === null
    || current.currentOpportunity.source !== "rotation"
    || current.currentOpportunity.planDayId !== expectedPlanDayId
  ) {
    throw new ScheduleTransitionError("schedule_rotation_state_invalid");
  }
  return current.currentOpportunity;
}

function validateRotationState(
  current: RotationScheduleStateV1,
): PendingScheduleOpportunityV1 | null {
  if (current.bindings.length === 0) {
    if (current.pointer !== 0 || current.currentOpportunity !== null) {
      throw new ScheduleTransitionError("schedule_rotation_state_invalid");
    }
    return null;
  }
  return assertRotationCurrent(current);
}

function nextRotationPointer(current: RotationScheduleStateV1): number {
  return (current.pointer + 1) % current.bindings.length;
}

function consumeOpportunity(
  current: PendingScheduleOpportunityV1,
  outcome: ScheduleOpportunityOutcome,
  sessionId: string | null,
): ConsumedScheduleOpportunityV1 {
  return {
    ...current,
    state: "consumed",
    revision: current.revision + 1,
    outcome,
    sessionId,
  };
}

function advanceRotation(
  current: RotationScheduleStateV1,
  consumed: ConsumedScheduleOpportunityV1,
): RotationScheduleStateV1 {
  return {
    ...current,
    revision: current.revision + 1,
    pointer: nextRotationPointer(current),
    currentOpportunity: null,
  };
}

export function transitionRotation(input: Readonly<{
  current: RotationScheduleStateV1;
  expectedRevision: number;
  action: RotationAction;
}>): RotationTransitionResult {
  assertExpectedRevision(input.current.revision, input.expectedRevision);
  const opportunity = validateRotationState(input.current);
  if (input.action.type === "train_anyway" && !input.action.advanceRotation) {
    return {
      next: {
        ...input.current,
        revision: input.current.revision + 1,
      },
      consumed: null,
      events: [{
        type: "train_anyway",
        localDate: input.action.localDate,
        workoutKind: input.action.workout.kind,
        planDayId: input.action.workout.planDayId,
        rotationAdvanced: false,
        fromPointer: input.current.pointer,
        toPointer: input.current.pointer,
      }],
    };
  }

  if (opportunity === null) {
    throw new ScheduleTransitionError("schedule_rotation_empty");
  }
  if (input.action.type === "repeat") {
    return {
      next: {
        ...input.current,
        revision: input.current.revision + 1,
      },
      consumed: null,
      events: [{
        type: "rotation_repeated",
        fromPointer: input.current.pointer,
        toPointer: input.current.pointer,
      }],
    };
  }

  if (input.action.type === "complete_scheduled") {
    assertNonEmptyIdentifier(input.action.sessionId);
    if (
      input.action.planDayId !== opportunity.planDayId
      || input.action.sessionLocalDate !== opportunity.localDate
    ) {
      throw new ScheduleTransitionError(
        "schedule_rotation_completion_not_current",
      );
    }
    const consumed = consumeOpportunity(
      opportunity,
      "completed",
      input.action.sessionId,
    );
    const next = advanceRotation(input.current, consumed);
    return {
      next,
      consumed,
      events: [{
        type: "rotation_completed",
        fromPointer: input.current.pointer,
        toPointer: next.pointer,
      }],
    };
  }

  const outcome = input.action.type === "skip" ? "skipped" : "advanced";
  const consumed = consumeOpportunity(opportunity, outcome, null);
  const next = advanceRotation(input.current, consumed);
  if (input.action.type === "train_anyway") {
    return {
      next,
      consumed,
      events: [{
        type: "train_anyway",
        localDate: input.action.localDate,
        workoutKind: input.action.workout.kind,
        planDayId: input.action.workout.planDayId,
        rotationAdvanced: true,
        fromPointer: input.current.pointer,
        toPointer: next.pointer,
      }],
    };
  }
  return {
    next,
    consumed,
    events: [{
      type: input.action.type === "skip"
        ? "rotation_skipped"
        : "rotation_advanced",
      fromPointer: input.current.pointer,
      toPointer: next.pointer,
    }],
  };
}

export function resolveWeekdayPlanDay(
  localDate: LocalDate,
  bindings: readonly WeekdayBinding[],
): string | null {
  const weekday = weekdayForLocalDate(localDate);
  return bindings.find((binding) => binding.weekday === weekday)?.planDayId
    ?? null;
}

export function transitionWeekdayOpportunity(input: Readonly<{
  current: ScheduleOpportunityV1;
  expectedRevision: number;
  action: WeekdayOpportunityAction;
}>): WeekdayOpportunityTransitionResult {
  assertExpectedRevision(input.current.revision, input.expectedRevision);
  if (input.current.state === "consumed") {
    throw new ScheduleTransitionError("schedule_opportunity_consumed");
  }
  if (input.current.source !== "weekday") {
    throw new ScheduleTransitionError("schedule_weekday_source_invalid");
  }
  if (input.action.type === "skip") {
    return {
      next: consumeOpportunity(input.current, "skipped", null),
      events: [{
        type: "weekday_skipped",
        localDate: input.current.localDate,
        planDayId: input.current.planDayId,
      }],
    };
  }
  if (input.action.type === "mark_missed") {
    if (
      compareLocalDates(
        input.current.localDate,
        input.action.observedLocalDate,
      ) !== -1
    ) {
      throw new ScheduleTransitionError("schedule_weekday_not_missed");
    }
    return {
      next: consumeOpportunity(
        input.current,
        "planned_not_completed",
        null,
      ),
      events: [{
        type: "weekday_missed",
        localDate: input.current.localDate,
        planDayId: input.current.planDayId,
        label: "Planned but not completed",
      }],
    };
  }
  assertNonEmptyIdentifier(input.action.sessionId);
  if (input.action.sessionLocalDate !== input.current.localDate) {
    throw new ScheduleTransitionError(
      "schedule_weekday_completion_date_conflict",
    );
  }
  return {
    next: consumeOpportunity(
      input.current,
      "completed",
      input.action.sessionId,
    ),
    events: [{
      type: "weekday_completed",
      localDate: input.current.localDate,
      planDayId: input.current.planDayId,
      sessionId: input.action.sessionId,
    }],
  };
}

export function transitionDateOverride(input: Readonly<{
  current: ScheduleDateOverrideV1 | null;
  expectedRevision: number;
  overrideId: string;
  localDate: LocalDate;
  replacement: ScheduleOverrideSelection;
  confirmation?: "replace_pending_override";
}>): DateOverrideTransitionResult {
  assertNonEmptyIdentifier(input.overrideId);
  if (input.current === null) {
    assertExpectedRevision(0, input.expectedRevision);
    return {
      next: {
        version: 1,
        state: "pending",
        id: input.overrideId,
        revision: 1,
        localDate: input.localDate,
        selection: input.replacement,
      },
      events: [{
        type: "override_created",
        localDate: input.localDate,
        replacement: input.replacement,
      }],
    };
  }
  assertExpectedRevision(input.current.revision, input.expectedRevision);
  if (input.current.state === "consumed") {
    throw new ScheduleTransitionError("schedule_override_consumed");
  }
  if (input.current.id !== input.overrideId) {
    throw new ScheduleTransitionError("schedule_override_identity_conflict");
  }
  if (input.current.localDate !== input.localDate) {
    throw new ScheduleTransitionError("schedule_override_date_conflict");
  }
  if (input.confirmation !== "replace_pending_override") {
    throw new ScheduleTransitionError(
      "schedule_override_replace_confirmation_required",
    );
  }
  return {
    next: {
      ...input.current,
      revision: input.current.revision + 1,
      selection: input.replacement,
    },
    events: [{
      type: "override_replaced",
      localDate: input.localDate,
      previous: input.current.selection,
      replacement: input.replacement,
    }],
  };
}

export function consumeDateOverride(input: Readonly<{
  current: ScheduleDateOverrideV1;
  expectedRevision: number;
  opportunityId: string;
}>): ConsumedDateOverrideTransitionResult {
  assertExpectedRevision(input.current.revision, input.expectedRevision);
  if (input.current.state === "consumed") {
    throw new ScheduleTransitionError("schedule_override_consumed");
  }
  assertNonEmptyIdentifier(input.opportunityId);
  return {
    next: {
      ...input.current,
      state: "consumed",
      revision: input.current.revision + 1,
      opportunityId: input.opportunityId,
    },
    events: [{
      type: "override_consumed",
      localDate: input.current.localDate,
      opportunityId: input.opportunityId,
    }],
  };
}

export function transitionTimeZoneChoice(input: Readonly<{
  current: ScheduleTimeZoneStateV1;
  expectedRevision: number;
  detectedDeviceTimeZone: StoredTimeZone;
  effectiveLocalDate: LocalDate;
  choice: ScheduleTimeZoneChoice;
}>): ScheduleTimeZoneTransitionResult {
  assertExpectedRevision(input.current.revision, input.expectedRevision);
  if (input.detectedDeviceTimeZone === input.current.timeZone) {
    throw new ScheduleTransitionError("schedule_timezone_unchanged");
  }
  if (
    input.current.lastDeviceTimeZoneDecision?.detectedDeviceTimeZone
    === input.detectedDeviceTimeZone
  ) {
    throw new ScheduleTransitionError(
      "schedule_timezone_choice_already_recorded",
    );
  }
  const nextTimeZone = input.choice === FOLLOW_DEVICE_TIMEZONE_LABEL
    ? input.detectedDeviceTimeZone
    : input.current.timeZone;
  return {
    next: {
      ...input.current,
      revision: input.current.revision + 1,
      timeZone: nextTimeZone,
      lastDeviceTimeZoneDecision: {
        detectedDeviceTimeZone: input.detectedDeviceTimeZone,
        effectiveLocalDate: input.effectiveLocalDate,
        choice: input.choice,
      },
    },
    events: [{
      type: input.choice === FOLLOW_DEVICE_TIMEZONE_LABEL
        ? "timezone_followed"
        : "timezone_kept",
      effectiveLocalDate: input.effectiveLocalDate,
      previousTimeZone: input.current.timeZone,
      detectedDeviceTimeZone: input.detectedDeviceTimeZone,
      nextTimeZone,
    }],
  };
}
