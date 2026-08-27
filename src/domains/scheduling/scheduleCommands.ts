import type {
  ActivateOwnedPlanScheduleRepositoryInput,
  ActivateOwnedPlanScheduleResult,
  ApplyScheduleOpportunityRepositoryInput,
  ChangeScheduleTimeZoneRepositoryInput,
  ConsumeScheduleDateOverrideRepositoryInput,
  ScheduleActionState,
  ScheduleMutationOperation,
  ScheduleRepository,
  ScheduleRepositoryResult,
  ScheduleMutationResult,
  ScheduleVersionBindingDraft,
  ScheduleVersionDraft,
  ScheduleVersionSnapshot,
  SaveScheduleVersionResult,
  SaveScheduleVersionRepositoryInput,
  SetScheduleDateOverrideRepositoryInput,
} from "../../platform/sqlite/repositories/scheduleRepository";
import {
  compareLocalDates,
  parseLocalDate,
  WEEKDAYS,
  type LocalDate,
} from "./localDate";
import {
  parseStoredTimeZone,
  type StoredTimeZone,
} from "./timeZone";
import {
  consumeDateOverride,
  transitionDateOverride,
  transitionRotation,
  transitionTimeZoneChoice,
  transitionWeekdayOpportunity,
  type RotationAction,
  type ScheduleOverrideSelection,
  type ScheduleTimeZoneChoice,
  type WeekdayOpportunityAction,
} from "./scheduleState";

const IDENTIFIER_MAX_CODE_POINTS = 128;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export type ActiveSchedulePairExpectation =
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "pair";
      planId: string;
      planRevision: number;
      scheduleId: string;
      scheduleRevision: number;
    }>;

export type TargetScheduleExpectation =
  | Readonly<{
      kind: "absent";
      scheduleId: string;
    }>
  | Readonly<{
      kind: "inactive";
      scheduleId: string;
      scheduleRevision: number;
      before: ScheduleVersionSnapshot;
    }>;

export type SaveScheduleVersionPreview = Readonly<{
  scheduleId: string;
  planId: string;
  expectedScheduleRevision: number;
  expectedPlanRevision: number;
  before: ScheduleVersionSnapshot | null;
  after: ScheduleVersionInput;
}>;

export type ActivateOwnedPlanSchedulePreview = Readonly<{
  planId: string;
  expectedPlanRevision: number;
  expectedActivePair: ActiveSchedulePairExpectation;
  targetSchedule: TargetScheduleExpectation;
  after: ScheduleVersionInput;
}>;

export type ScheduleVersionPreview =
  | SaveScheduleVersionPreview
  | ActivateOwnedPlanSchedulePreview;

export type ScheduleVersionInput =
  | Readonly<{
      effectiveLocalDate: string;
      mode: "weekday";
      timeZone: string;
      bindings: readonly Readonly<{
        ordinal: number;
        weekIndex: number;
        weekday: (typeof WEEKDAYS)[number];
        planDayId: string;
      }>[];
    }>
  | Readonly<{
      effectiveLocalDate: string;
      mode: "rotation";
      timeZone: string;
      bindings: readonly Readonly<{
        ordinal: number;
        planDayId: string;
      }>[];
    }>;

export type SaveScheduleVersionInput = Readonly<{
  requestId: string;
  scheduleId: string;
  planId: string;
  expectedScheduleRevision: number;
  expectedPlanRevision: number;
  todayLocalDate: string;
  savedAtMs: number;
  before: ScheduleVersionSnapshot | null;
  next: ScheduleVersionInput;
  confirmationToken: string;
}>;

export type ActivateOwnedPlanScheduleInput = Readonly<{
  requestId: string;
  planId: string;
  expectedPlanRevision: number;
  expectedActivePair: ActiveSchedulePairExpectation;
  targetSchedule: TargetScheduleExpectation;
  todayLocalDate: string;
  activatedAtMs: number;
  next: ScheduleVersionInput;
  confirmationToken: string;
}>;

export type ScheduleCommandInputErrorCode =
  | "schedule_action_invalid"
  | "schedule_bindings_invalid"
  | "schedule_effective_local_date_invalid"
  | "schedule_hash_invalid"
  | "schedule_identifier_invalid"
  | "schedule_preview_conflict"
  | "schedule_revision_invalid"
  | "schedule_state_unavailable"
  | "schedule_time_invalid"
  | "schedule_timezone_invalid";

export class ScheduleCommandInputError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-SCHEDULE01" as const;

  constructor(readonly code: ScheduleCommandInputErrorCode) {
    super(code);
    this.name = "ScheduleCommandInputError";
  }
}

type Sha256 = (value: string) => Promise<string>;

type ScheduleCommandContext = Readonly<{
  repository: ScheduleRepository;
  invalidate(keys: readonly string[]): Promise<void>;
  sha256: Sha256;
}>;

function codePointLength(value: string): number {
  return [...value].length;
}

function validIdentifier(value: string): boolean {
  return typeof value === "string"
    && value.trim() === value
    && value.length > 0
    && codePointLength(value) <= IDENTIFIER_MAX_CODE_POINTS;
}

function validRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right, "en")
    );
    return `{${entries.map(([key, entry]) =>
      `${JSON.stringify(key)}:${stableJson(entry)}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function digest(sha256: Sha256, value: unknown): Promise<string> {
  const valueDigest = await sha256(stableJson(value));
  if (!SHA256_PATTERN.test(valueDigest)) {
    throw new ScheduleCommandInputError("schedule_hash_invalid");
  }
  return valueDigest;
}

function validatedLocalDate(
  value: string,
  code: ScheduleCommandInputErrorCode,
): LocalDate {
  try {
    return parseLocalDate(value);
  } catch {
    throw new ScheduleCommandInputError(code);
  }
}

function validatedTimeZone(value: string): StoredTimeZone {
  try {
    return parseStoredTimeZone(value);
  } catch {
    throw new ScheduleCommandInputError("schedule_timezone_invalid");
  }
}

function validateBindingIdentity(
  binding: Readonly<{ ordinal: number; planDayId: string }>,
  expectedOrdinal: number,
): void {
  if (
    binding.ordinal !== expectedOrdinal
    || !Number.isSafeInteger(binding.ordinal)
    || !validIdentifier(binding.planDayId)
  ) {
    throw new ScheduleCommandInputError("schedule_bindings_invalid");
  }
}

function stageBindings(
  value: ScheduleVersionInput,
): readonly ScheduleVersionBindingDraft[] {
  if (value.mode === "rotation") {
    return Object.freeze(value.bindings.map((binding, ordinal) => {
      validateBindingIdentity(binding, ordinal);
      return Object.freeze({
        ordinal: binding.ordinal,
        planDayId: binding.planDayId,
      });
    }));
  }
  const seenSlots = new Set<string>();
  const staged = value.bindings.map((binding, ordinal) => {
    validateBindingIdentity(binding, ordinal);
    if (
      !Number.isSafeInteger(binding.weekIndex)
      || binding.weekIndex < 0
      || !WEEKDAYS.includes(binding.weekday)
    ) {
      throw new ScheduleCommandInputError("schedule_bindings_invalid");
    }
    const slot = `${binding.weekIndex}:${binding.weekday}`;
    if (seenSlots.has(slot)) {
      throw new ScheduleCommandInputError("schedule_bindings_invalid");
    }
    seenSlots.add(slot);
    return Object.freeze({
      ordinal: binding.ordinal,
      weekIndex: binding.weekIndex,
      weekday: binding.weekday,
      planDayId: binding.planDayId,
    });
  });
  return Object.freeze(staged);
}

function stageVersion(
  input: ScheduleVersionInput,
  todayLocalDate: LocalDate,
  before: ScheduleVersionSnapshot | null,
): ScheduleVersionDraft {
  const effectiveLocalDate = validatedLocalDate(
    input.effectiveLocalDate,
    "schedule_effective_local_date_invalid",
  );
  if (
    compareLocalDates(effectiveLocalDate, todayLocalDate) === -1
    || (
      before !== null
      && compareLocalDates(
        effectiveLocalDate,
        validatedLocalDate(
          before.effectiveLocalDate,
          "schedule_effective_local_date_invalid",
        ),
      ) !== 1
    )
  ) {
    throw new ScheduleCommandInputError(
      "schedule_effective_local_date_invalid",
    );
  }
  const timeZone = validatedTimeZone(input.timeZone);
  const bindings = stageBindings(input);
  return input.mode === "weekday"
    ? Object.freeze({
        effectiveLocalDate,
        mode: input.mode,
        timeZone,
        bindings,
      }) as ScheduleVersionDraft
    : Object.freeze({
        effectiveLocalDate,
        mode: input.mode,
        timeZone,
        rotationPointer: 0,
        bindings,
      }) as ScheduleVersionDraft;
}

function deterministicId(prefix: string, requestSha256: string, ordinal?: number) {
  return ordinal === undefined
    ? `${prefix}:${requestSha256}`
    : `${prefix}:${requestSha256}:${ordinal}`;
}

export async function createScheduleVersionPreviewToken(input: Readonly<{
  sha256: Sha256;
  preview: ScheduleVersionPreview;
}>): Promise<string> {
  return `schedule-preview-v1:${await digest(input.sha256, input.preview)}`;
}

async function postCommit<Result extends ScheduleRepositoryResult>(
  context: ScheduleCommandContext,
  result: Result,
): Promise<Result> {
  if (result.outcome === "committed") {
    await context.invalidate(result.invalidations).catch(() => undefined);
  }
  return result;
}

export async function saveScheduleVersion(
  context: ScheduleCommandContext & Readonly<{
    input: SaveScheduleVersionInput;
  }>,
): Promise<SaveScheduleVersionResult> {
  const value = context.input;
  if (
    !validIdentifier(value.requestId)
    || !validIdentifier(value.scheduleId)
    || !validIdentifier(value.planId)
  ) {
    throw new ScheduleCommandInputError("schedule_identifier_invalid");
  }
  if (
    !validRevision(value.expectedScheduleRevision)
    || !validRevision(value.expectedPlanRevision)
  ) {
    throw new ScheduleCommandInputError("schedule_revision_invalid");
  }
  if (!validTime(value.savedAtMs)) {
    throw new ScheduleCommandInputError("schedule_time_invalid");
  }
  const todayLocalDate = validatedLocalDate(
    value.todayLocalDate,
    "schedule_effective_local_date_invalid",
  );
  const next = stageVersion(value.next, todayLocalDate, value.before);
  const preview = Object.freeze({
    scheduleId: value.scheduleId,
    planId: value.planId,
    expectedScheduleRevision: value.expectedScheduleRevision,
    expectedPlanRevision: value.expectedPlanRevision,
    before: value.before,
    after: value.next,
  });
  const expectedToken = await createScheduleVersionPreviewToken({
    sha256: context.sha256,
    preview,
  });
  if (value.confirmationToken !== expectedToken) {
    throw new ScheduleCommandInputError("schedule_preview_conflict");
  }
  const canonical = Object.freeze({
    operation: "save_schedule_version" as const,
    requestId: value.requestId,
    scheduleId: value.scheduleId,
    planId: value.planId,
    expectedScheduleRevision: value.expectedScheduleRevision,
    expectedPlanRevision: value.expectedPlanRevision,
    todayLocalDate,
    savedAtMs: value.savedAtMs,
    before: value.before,
    next,
    confirmationToken: value.confirmationToken,
  });
  const requestSha256 = await digest(context.sha256, canonical);
  const staged: SaveScheduleVersionRepositoryInput = Object.freeze({
    ...canonical,
    requestSha256,
    versionId: deterministicId("schedule-version", requestSha256),
    bindingIds: Object.freeze(next.bindings.map((_, ordinal) =>
      deterministicId("schedule-binding", requestSha256, ordinal)
    )),
  });
  return postCommit(
    context,
    await context.repository.saveVersion(staged),
  );
}

export async function activateOwnedPlanSchedule(
  context: ScheduleCommandContext & Readonly<{
    input: ActivateOwnedPlanScheduleInput;
  }>,
): Promise<ActivateOwnedPlanScheduleResult> {
  const value = context.input;
  if (
    !validIdentifier(value.requestId)
    || !validIdentifier(value.planId)
    || !validIdentifier(value.targetSchedule.scheduleId)
    || (
      value.expectedActivePair.kind === "pair"
      && (
        !validIdentifier(value.expectedActivePair.planId)
        || !validIdentifier(value.expectedActivePair.scheduleId)
      )
    )
  ) {
    throw new ScheduleCommandInputError("schedule_identifier_invalid");
  }
  if (
    !validRevision(value.expectedPlanRevision)
    || (
      value.targetSchedule.kind === "inactive"
      && !validRevision(value.targetSchedule.scheduleRevision)
    )
    || (
      value.expectedActivePair.kind === "pair"
      && (
        !validRevision(value.expectedActivePair.planRevision)
        || !validRevision(value.expectedActivePair.scheduleRevision)
      )
    )
  ) {
    throw new ScheduleCommandInputError("schedule_revision_invalid");
  }
  if (!validTime(value.activatedAtMs)) {
    throw new ScheduleCommandInputError("schedule_time_invalid");
  }
  const todayLocalDate = validatedLocalDate(
    value.todayLocalDate,
    "schedule_effective_local_date_invalid",
  );
  if (value.next.bindings.length === 0) {
    throw new ScheduleCommandInputError("schedule_bindings_invalid");
  }
  const before = value.targetSchedule.kind === "inactive"
    ? value.targetSchedule.before
    : null;
  const next = stageVersion(value.next, todayLocalDate, before);
  const preview = Object.freeze({
    planId: value.planId,
    expectedPlanRevision: value.expectedPlanRevision,
    expectedActivePair: value.expectedActivePair,
    targetSchedule: value.targetSchedule,
    after: value.next,
  });
  const expectedToken = await createScheduleVersionPreviewToken({
    sha256: context.sha256,
    preview,
  });
  if (value.confirmationToken !== expectedToken) {
    throw new ScheduleCommandInputError("schedule_preview_conflict");
  }
  const canonical = Object.freeze({
    operation: "activate_schedule" as const,
    requestId: value.requestId,
    planId: value.planId,
    expectedPlanRevision: value.expectedPlanRevision,
    expectedActivePair: value.expectedActivePair,
    targetSchedule: value.targetSchedule,
    todayLocalDate,
    activatedAtMs: value.activatedAtMs,
    next,
    confirmationToken: value.confirmationToken,
  });
  const requestSha256 = await digest(context.sha256, canonical);
  const staged: ActivateOwnedPlanScheduleRepositoryInput = Object.freeze({
    ...canonical,
    requestSha256,
    versionId: deterministicId("schedule-version", requestSha256),
    bindingIds: Object.freeze(next.bindings.map((_, ordinal) =>
      deterministicId("schedule-binding", requestSha256, ordinal)
    )),
  });
  return postCommit(
    context,
    await context.repository.activateSchedule(staged),
  );
}

type CommonScheduleMutationInput = Readonly<{
  requestId: string;
  scheduleId: string;
  planId: string;
  expectedScheduleRevision: number;
  expectedPlanRevision: number;
  occurredAtMs: number;
}>;

export type ScheduleOpportunityActionInput =
  & CommonScheduleMutationInput
  & Readonly<{
    instantMs: number;
  }>;

export type CompleteScheduledOpportunityInput =
  & ScheduleOpportunityActionInput
  & Readonly<{
    sessionId: string;
    sessionLocalDate: string;
    planDayId: string;
  }>;

export type RecordTrainAnywayInput =
  & ScheduleOpportunityActionInput
  & Readonly<{
    workout:
      | Readonly<{ kind: "plan_day"; planDayId: string }>
      | Readonly<{ kind: "rest_day" | "empty"; planDayId: null }>;
    advanceRotation: boolean;
  }>;

export type MarkWeekdayOpportunityMissedInput =
  & ScheduleOpportunityActionInput
  & Readonly<{
    observedLocalDate: string;
  }>;

export type SetDateOverrideInput =
  & CommonScheduleMutationInput
  & Readonly<{
    expectedOverrideRevision: number;
    overrideId: string;
    localDate: string;
    replacement: ScheduleOverrideSelection;
    confirmation?: "replace_pending_override";
  }>;

export type ConsumeScheduleDateOverrideInput =
  & CommonScheduleMutationInput
  & Readonly<{
    expectedOverrideRevision: number;
    overrideId: string;
    localDate: string;
    opportunityId: string;
  }>;

export type ChangeScheduleTimeZoneInput =
  & CommonScheduleMutationInput
  & Readonly<{
    detectedDeviceTimeZone: string;
    effectiveLocalDate: string;
    choice: ScheduleTimeZoneChoice;
  }>;

function validateMutationBase(value: CommonScheduleMutationInput): void {
  if (
    !validIdentifier(value.requestId)
    || !validIdentifier(value.scheduleId)
    || !validIdentifier(value.planId)
  ) {
    throw new ScheduleCommandInputError("schedule_identifier_invalid");
  }
  if (
    !validRevision(value.expectedScheduleRevision)
    || !validRevision(value.expectedPlanRevision)
  ) {
    throw new ScheduleCommandInputError("schedule_revision_invalid");
  }
  if (!validTime(value.occurredAtMs)) {
    throw new ScheduleCommandInputError("schedule_time_invalid");
  }
}

function validateInstant(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ScheduleCommandInputError("schedule_time_invalid");
  }
}

async function mutationDigest(
  context: ScheduleCommandContext,
  operation: ScheduleMutationOperation,
  value: unknown,
): Promise<string> {
  return digest(context.sha256, Object.freeze({ operation, value }));
}

async function replayMutation(
  context: ScheduleCommandContext,
  requestId: string,
  requestSha256: string,
  operation: ScheduleMutationOperation,
): Promise<ScheduleMutationResult | null> {
  const replay = await context.repository.readCommandResult({
    requestId,
    requestSha256,
  });
  if (
    replay !== null
    && (
      replay.operation === "save_schedule_version"
      || replay.operation !== operation
    )
  ) {
    throw new ScheduleCommandInputError("schedule_action_invalid");
  }
  return replay as ScheduleMutationResult | null;
}

function assertActionState(
  state: ScheduleActionState | null,
  input: ScheduleOpportunityActionInput,
): ScheduleActionState {
  if (
    state === null
    || state.scheduleId !== input.scheduleId
    || state.planId !== input.planId
  ) {
    throw new ScheduleCommandInputError("schedule_state_unavailable");
  }
  return state;
}

async function executeOpportunityAction(
  context: ScheduleCommandContext,
  operation: ApplyScheduleOpportunityRepositoryInput["operation"],
  value: ScheduleOpportunityActionInput,
  createAction: (
    state: ScheduleActionState,
  ) => RotationAction | WeekdayOpportunityAction,
): Promise<ScheduleMutationResult> {
  validateMutationBase(value);
  validateInstant(value.instantMs);
  const requestSha256 = await mutationDigest(context, operation, value);
  const replay = await replayMutation(
    context,
    value.requestId,
    requestSha256,
    operation,
  );
  if (replay !== null) {
    return replay;
  }
  const state = assertActionState(
    await context.repository.readActionState({
      scheduleId: value.scheduleId,
      instantMs: value.instantMs,
    }),
    value,
  );
  const action = createAction(state);
  if (
    state.hasEffectiveOverride === true
    && action.type !== "train_anyway"
  ) {
    throw new ScheduleCommandInputError("schedule_action_invalid");
  }
  let transition;
  if (state.version.mode === "rotation") {
    if (
      state.rotationState === null
      || action.type === "mark_missed"
      || action.type === "complete"
    ) {
      throw new ScheduleCommandInputError("schedule_action_invalid");
    }
    transition = transitionRotation({
      current: state.rotationState,
      expectedRevision: value.expectedScheduleRevision,
      action,
    });
  } else {
    if (
      state.opportunity === null
      || state.opportunity.source === "override"
    ) {
      throw new ScheduleCommandInputError("schedule_action_invalid");
    }
    let weekdayAction: WeekdayOpportunityAction;
    if (action.type === "complete_scheduled") {
      weekdayAction = {
        type: "complete",
        sessionId: action.sessionId,
        sessionLocalDate: action.sessionLocalDate,
      };
    } else if (action.type === "skip") {
      weekdayAction = { type: "skip" };
    } else if (action.type === "mark_missed") {
      weekdayAction = action;
    } else {
      throw new ScheduleCommandInputError("schedule_action_invalid");
    }
    transition = transitionWeekdayOpportunity({
      current: state.opportunity,
      expectedRevision: state.opportunity.revision,
      action: weekdayAction,
    });
  }
  const staged: ApplyScheduleOpportunityRepositoryInput = Object.freeze({
    operation,
    requestId: value.requestId,
    requestSha256,
    scheduleId: value.scheduleId,
    planId: value.planId,
    expectedScheduleRevision: value.expectedScheduleRevision,
    expectedPlanRevision: value.expectedPlanRevision,
    localDate: parseLocalDate(state.localDate),
    occurredAtMs: value.occurredAtMs,
    versionId: state.version.id,
    transition,
  });
  return postCommit(
    context,
    await context.repository.applyOpportunityAction(staged),
  );
}

export function repeatRotation(
  context: ScheduleCommandContext & Readonly<{
    input: ScheduleOpportunityActionInput;
  }>,
): Promise<ScheduleMutationResult> {
  return executeOpportunityAction(
    context,
    "repeat_rotation",
    context.input,
    () => ({ type: "repeat" }),
  );
}

export function skipOpportunity(
  context: ScheduleCommandContext & Readonly<{
    input: ScheduleOpportunityActionInput;
  }>,
): Promise<ScheduleMutationResult> {
  return executeOpportunityAction(
    context,
    "skip_opportunity",
    context.input,
    () => ({ type: "skip" }),
  );
}

export function advanceRotation(
  context: ScheduleCommandContext & Readonly<{
    input: ScheduleOpportunityActionInput;
  }>,
): Promise<ScheduleMutationResult> {
  return executeOpportunityAction(
    context,
    "advance_rotation",
    context.input,
    () => ({ type: "advance" }),
  );
}

export function completeScheduledOpportunity(
  context: ScheduleCommandContext & Readonly<{
    input: CompleteScheduledOpportunityInput;
  }>,
): Promise<ScheduleMutationResult> {
  if (
    !validIdentifier(context.input.sessionId)
    || !validIdentifier(context.input.planDayId)
  ) {
    throw new ScheduleCommandInputError("schedule_identifier_invalid");
  }
  const sessionLocalDate = validatedLocalDate(
    context.input.sessionLocalDate,
    "schedule_effective_local_date_invalid",
  );
  return executeOpportunityAction(
    context,
    "complete_scheduled",
    context.input,
    () => ({
      type: "complete_scheduled",
      sessionId: context.input.sessionId,
      sessionLocalDate,
      planDayId: context.input.planDayId,
    }),
  );
}

export function recordTrainAnyway(
  context: ScheduleCommandContext & Readonly<{
    input: RecordTrainAnywayInput;
  }>,
): Promise<ScheduleMutationResult> {
  if (
    context.input.workout.kind === "plan_day"
    && !validIdentifier(context.input.workout.planDayId)
  ) {
    throw new ScheduleCommandInputError("schedule_identifier_invalid");
  }
  return executeOpportunityAction(
    context,
    "record_train_anyway",
    context.input,
    (state) => ({
      type: "train_anyway",
      localDate: parseLocalDate(state.localDate),
      workout: context.input.workout,
      advanceRotation: context.input.advanceRotation,
    }),
  );
}

export function markWeekdayOpportunityMissed(
  context: ScheduleCommandContext & Readonly<{
    input: MarkWeekdayOpportunityMissedInput;
  }>,
): Promise<ScheduleMutationResult> {
  return executeOpportunityAction(
    context,
    "mark_weekday_missed",
    context.input,
    () => ({
      type: "mark_missed",
      observedLocalDate: validatedLocalDate(
        context.input.observedLocalDate,
        "schedule_effective_local_date_invalid",
      ),
    }),
  );
}

export async function setDateOverride(
  context: ScheduleCommandContext & Readonly<{
    input: SetDateOverrideInput;
  }>,
): Promise<ScheduleMutationResult> {
  const value = context.input;
  validateMutationBase(value);
  if (
    !Number.isSafeInteger(value.expectedOverrideRevision)
    || value.expectedOverrideRevision < 0
    || !validIdentifier(value.overrideId)
    || (
      value.replacement.kind === "plan_day"
      && !validIdentifier(value.replacement.planDayId)
    )
  ) {
    throw new ScheduleCommandInputError("schedule_action_invalid");
  }
  const localDate = validatedLocalDate(
    value.localDate,
    "schedule_effective_local_date_invalid",
  );
  const operation = "set_date_override" as const;
  const requestSha256 = await mutationDigest(context, operation, value);
  const replay = await replayMutation(
    context,
    value.requestId,
    requestSha256,
    operation,
  );
  if (replay !== null) {
    return replay;
  }
  const transition = transitionDateOverride({
    current: await context.repository.readDateOverride({
      scheduleId: value.scheduleId,
      localDate,
    }),
    expectedRevision: value.expectedOverrideRevision,
    overrideId: value.overrideId,
    localDate,
    replacement: value.replacement,
    ...(value.confirmation === undefined
      ? {}
      : { confirmation: value.confirmation }),
  });
  const staged: SetScheduleDateOverrideRepositoryInput = Object.freeze({
    operation,
    requestId: value.requestId,
    requestSha256,
    scheduleId: value.scheduleId,
    planId: value.planId,
    expectedScheduleRevision: value.expectedScheduleRevision,
    expectedPlanRevision: value.expectedPlanRevision,
    localDate,
    occurredAtMs: value.occurredAtMs,
    transition,
  });
  return postCommit(context, await context.repository.setDateOverride(staged));
}

export async function consumeScheduleDateOverride(
  context: ScheduleCommandContext & Readonly<{
    input: ConsumeScheduleDateOverrideInput;
  }>,
): Promise<ScheduleMutationResult> {
  const value = context.input;
  validateMutationBase(value);
  if (
    !Number.isSafeInteger(value.expectedOverrideRevision)
    || value.expectedOverrideRevision < 1
    || !validIdentifier(value.overrideId)
    || !validIdentifier(value.opportunityId)
  ) {
    throw new ScheduleCommandInputError("schedule_action_invalid");
  }
  const localDate = validatedLocalDate(
    value.localDate,
    "schedule_effective_local_date_invalid",
  );
  const operation = "consume_date_override" as const;
  const requestSha256 = await mutationDigest(context, operation, value);
  const replay = await replayMutation(
    context,
    value.requestId,
    requestSha256,
    operation,
  );
  if (replay !== null) {
    return replay;
  }
  const current = await context.repository.readDateOverride({
    scheduleId: value.scheduleId,
    localDate,
  });
  if (current === null || current.id !== value.overrideId) {
    throw new ScheduleCommandInputError("schedule_state_unavailable");
  }
  const transition = consumeDateOverride({
    current,
    expectedRevision: value.expectedOverrideRevision,
    opportunityId: value.opportunityId,
  });
  const staged: ConsumeScheduleDateOverrideRepositoryInput = Object.freeze({
    operation,
    requestId: value.requestId,
    requestSha256,
    scheduleId: value.scheduleId,
    planId: value.planId,
    expectedScheduleRevision: value.expectedScheduleRevision,
    expectedPlanRevision: value.expectedPlanRevision,
    localDate,
    occurredAtMs: value.occurredAtMs,
    transition,
  });
  return postCommit(
    context,
    await context.repository.consumeDateOverride(staged),
  );
}

function nextTimeZoneVersion(
  version: ScheduleVersionSnapshot,
  effectiveLocalDate: LocalDate,
  timeZone: StoredTimeZone,
): ScheduleVersionDraft {
  if (version.mode === "rotation") {
    return Object.freeze({
      effectiveLocalDate,
      mode: "rotation",
      timeZone,
      rotationPointer: version.rotationPointer!,
      bindings: Object.freeze(version.bindings.map((binding) =>
        Object.freeze({
          ordinal: binding.ordinal,
          planDayId: binding.planDayId,
        })
      )),
    });
  }
  return Object.freeze({
    effectiveLocalDate,
    mode: "weekday",
    timeZone,
    bindings: Object.freeze(version.bindings.map((binding) => {
      const weekdayBinding = binding as Extract<
        ScheduleVersionSnapshot["bindings"][number],
        Readonly<{ weekday: unknown }>
      >;
      return Object.freeze({
        ordinal: weekdayBinding.ordinal,
        weekIndex: weekdayBinding.weekIndex,
        weekday: weekdayBinding.weekday,
        planDayId: weekdayBinding.planDayId,
      });
    })),
  });
}

export async function changeScheduleTimeZone(
  context: ScheduleCommandContext & Readonly<{
    input: ChangeScheduleTimeZoneInput;
  }>,
): Promise<ScheduleMutationResult> {
  const value = context.input;
  validateMutationBase(value);
  const detectedDeviceTimeZone = validatedTimeZone(
    value.detectedDeviceTimeZone,
  );
  const effectiveLocalDate = validatedLocalDate(
    value.effectiveLocalDate,
    "schedule_effective_local_date_invalid",
  );
  const operation = "change_timezone" as const;
  const requestSha256 = await mutationDigest(context, operation, value);
  const replay = await replayMutation(
    context,
    value.requestId,
    requestSha256,
    operation,
  );
  if (replay !== null) {
    return replay;
  }
  const current = await context.repository.readTimeZoneState({
    scheduleId: value.scheduleId,
  });
  if (
    current === null
    || current.planId !== value.planId
    || current.scheduleRevision !== value.expectedScheduleRevision
    || current.planRevision !== value.expectedPlanRevision
  ) {
    throw new ScheduleCommandInputError("schedule_state_unavailable");
  }
  const transition = transitionTimeZoneChoice({
    current: current.state,
    expectedRevision: value.expectedScheduleRevision,
    detectedDeviceTimeZone,
    effectiveLocalDate,
    choice: value.choice,
  });
  const followsDevice = transition.next.timeZone !== current.state.timeZone;
  if (
    followsDevice
    && compareLocalDates(
      effectiveLocalDate,
      validatedLocalDate(
        current.version.effectiveLocalDate,
        "schedule_effective_local_date_invalid",
      ),
    ) !== 1
  ) {
    throw new ScheduleCommandInputError(
      "schedule_effective_local_date_invalid",
    );
  }
  const nextVersion = followsDevice
    ? nextTimeZoneVersion(
        current.version,
        effectiveLocalDate,
        transition.next.timeZone,
      )
    : null;
  const stagedBase = {
    operation,
    requestId: value.requestId,
    requestSha256,
    scheduleId: value.scheduleId,
    planId: value.planId,
    expectedScheduleRevision: value.expectedScheduleRevision,
    expectedPlanRevision: value.expectedPlanRevision,
    localDate: effectiveLocalDate,
    occurredAtMs: value.occurredAtMs,
    transition,
  } as const;
  const staged: ChangeScheduleTimeZoneRepositoryInput = followsDevice
    ? Object.freeze({
        ...stagedBase,
        nextVersion: nextVersion!,
        versionId: deterministicId("schedule-version", requestSha256),
        bindingIds: Object.freeze(current.version.bindings.map((_, ordinal) =>
          deterministicId("schedule-binding", requestSha256, ordinal)
        )),
      })
    : Object.freeze({
        ...stagedBase,
        nextVersion: null,
        versionId: null,
        bindingIds: [] as const,
      });
  return postCommit(context, await context.repository.changeTimeZone(staged));
}
