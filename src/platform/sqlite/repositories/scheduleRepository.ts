import {
  differenceInLocalDays,
  parseLocalDate,
  weekdayForLocalDate,
  type LocalDate,
  type Weekday,
} from "../../../domains/scheduling/localDate";
import {
  localDateAtInstant,
  parseStoredTimeZone,
  type StoredTimeZone,
} from "../../../domains/scheduling/timeZone";
import type {
  ConsumedDateOverrideTransitionResult,
  DateOverrideTransitionResult,
  PendingScheduleOpportunityV1,
  RotationScheduleStateV1,
  RotationTransitionResult,
  ScheduleDateOverrideV1,
  ScheduleOpportunityV1,
  ScheduleTimeZoneStateV1,
  ScheduleTimeZoneTransitionResult,
  WeekdayOpportunityTransitionResult,
} from "../../../domains/scheduling/scheduleState";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

export type WeekdayScheduleVersionBinding = Readonly<{
  id: string;
  ordinal: number;
  weekIndex: number;
  weekday: Weekday;
  planDayId: string;
}>;

export type RotationScheduleVersionBinding = Readonly<{
  id: string;
  ordinal: number;
  planDayId: string;
}>;

export type ScheduleVersionBinding =
  | WeekdayScheduleVersionBinding
  | RotationScheduleVersionBinding;

export type ScheduleVersionBindingDraft =
  | Omit<WeekdayScheduleVersionBinding, "id">
  | Omit<RotationScheduleVersionBinding, "id">;

export type ScheduleVersionSnapshot = Readonly<{
  id: string;
  versionNumber: number;
  effectiveLocalDate: string;
  mode: "weekday" | "rotation";
  timeZone: string;
  rotationPointer: number | null;
  bindings: readonly ScheduleVersionBinding[];
}>;

export type ScheduleVersionDraft =
  | Readonly<{
      effectiveLocalDate: LocalDate;
      mode: "weekday";
      timeZone: StoredTimeZone;
      bindings: readonly Omit<WeekdayScheduleVersionBinding, "id">[];
    }>
  | Readonly<{
      effectiveLocalDate: LocalDate;
      mode: "rotation";
      timeZone: StoredTimeZone;
      rotationPointer: number;
      bindings: readonly Omit<RotationScheduleVersionBinding, "id">[];
    }>;

export type SaveScheduleVersionRepositoryInput = Readonly<{
  operation: "save_schedule_version";
  requestId: string;
  requestSha256: string;
  scheduleId: string;
  planId: string;
  expectedScheduleRevision: number;
  expectedPlanRevision: number;
  todayLocalDate: LocalDate;
  savedAtMs: number;
  before: ScheduleVersionSnapshot | null;
  next: ScheduleVersionDraft;
  confirmationToken: string;
  versionId: string;
  bindingIds: readonly string[];
}>;

export type SaveScheduleVersionResult = Readonly<{
  outcome: "committed" | "already_committed";
  operation: "save_schedule_version";
  scheduleId: string;
  planId: string;
  scheduleRevision: number;
  planRevision: number;
  version: ScheduleVersionSnapshot;
  invalidations: readonly string[];
}>;

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

export type ActivateOwnedPlanScheduleRepositoryInput = Readonly<{
  operation: "activate_schedule";
  requestId: string;
  requestSha256: string;
  planId: string;
  expectedPlanRevision: number;
  expectedActivePair: ActiveSchedulePairExpectation;
  targetSchedule: TargetScheduleExpectation;
  todayLocalDate: LocalDate;
  activatedAtMs: number;
  next: ScheduleVersionDraft;
  confirmationToken: string;
  versionId: string;
  bindingIds: readonly string[];
}>;

export type ActivateOwnedPlanScheduleResult = Readonly<{
  outcome: "committed" | "already_committed";
  operation: "activate_schedule";
  scheduleId: string;
  planId: string;
  scheduleRevision: number;
  planRevision: number;
  version: ScheduleVersionSnapshot;
  invalidations: readonly string[];
}>;

export type ScheduleMutationOperation =
  | "advance_rotation"
  | "change_timezone"
  | "complete_scheduled"
  | "consume_date_override"
  | "mark_weekday_missed"
  | "record_train_anyway"
  | "repeat_rotation"
  | "set_date_override"
  | "skip_opportunity";

export type ScheduleMutationResult = Readonly<{
  outcome: "committed" | "already_committed";
  operation: ScheduleMutationOperation;
  scheduleId: string;
  planId: string;
  scheduleRevision: number;
  planRevision: number;
  localDate: string;
  version?: ScheduleVersionSnapshot;
  invalidations: readonly string[];
}>;

export type ScheduleRepositoryResult =
  | ActivateOwnedPlanScheduleResult
  | SaveScheduleVersionResult
  | ScheduleMutationResult;

export type EffectiveOverrideOpportunity = Readonly<{
  version: 1;
  state: "pending" | "consumed";
  id: string;
  source: "override";
  localDate: LocalDate;
  planDayId: string | null;
  revision: number;
  selectionKind: "plan_day" | "rest_day" | "skip";
  outcome:
    | "completed"
    | "skipped"
    | "planned_not_completed"
    | "advanced"
    | "rest_day"
    | null;
  sessionId: string | null;
}>;

export type EffectiveScheduleOpportunity =
  | ScheduleOpportunityV1
  | EffectiveOverrideOpportunity;

export type EffectiveScheduleRead = Readonly<{
  scheduleId: string;
  scheduleRevision: number;
  localDate: string;
  timeZone: string;
  version: ScheduleVersionSnapshot;
  override: ScheduleDateOverrideV1 | null;
  opportunity: EffectiveScheduleOpportunity | null;
}>;

export type ScheduleActionState = Readonly<{
  scheduleId: string;
  planId: string;
  scheduleRevision: number;
  planRevision: number;
  localDate: LocalDate;
  hasEffectiveOverride?: boolean;
  version: ScheduleVersionSnapshot;
  rotationState: RotationScheduleStateV1 | null;
  opportunity: EffectiveScheduleOpportunity | null;
}>;

export type ScheduleDateOverrideReadInput = Readonly<{
  scheduleId: string;
  localDate: string;
}>;

export type ScheduleTimeZoneRead = Readonly<{
  scheduleId: string;
  planId: string;
  scheduleRevision: number;
  planRevision: number;
  version: ScheduleVersionSnapshot;
  state: ScheduleTimeZoneStateV1;
}>;

type ScheduleRevisionExpectation = Readonly<{
  scheduleId: string;
  planId: string;
  expectedScheduleRevision: number;
  expectedPlanRevision: number;
}>;

type ScheduleMutationBase =
  & ScheduleRevisionExpectation
  & Readonly<{
  requestId: string;
  requestSha256: string;
  localDate: LocalDate;
  occurredAtMs: number;
  }>;

export type ApplyScheduleOpportunityRepositoryInput =
  & ScheduleMutationBase
  & Readonly<{
    operation:
      | "advance_rotation"
      | "complete_scheduled"
      | "mark_weekday_missed"
      | "record_train_anyway"
      | "repeat_rotation"
      | "skip_opportunity";
    versionId: string;
    transition:
      | RotationTransitionResult
      | WeekdayOpportunityTransitionResult;
  }>;

export type SetScheduleDateOverrideRepositoryInput =
  & ScheduleMutationBase
  & Readonly<{
    operation: "set_date_override";
    transition: DateOverrideTransitionResult;
  }>;

export type ConsumeScheduleDateOverrideRepositoryInput =
  & ScheduleMutationBase
  & Readonly<{
    operation: "consume_date_override";
    transition: ConsumedDateOverrideTransitionResult;
  }>;

export type ChangeScheduleTimeZoneRepositoryInput =
  & ScheduleMutationBase
  & (
    | Readonly<{
        operation: "change_timezone";
        transition: ScheduleTimeZoneTransitionResult;
        nextVersion: ScheduleVersionDraft;
        versionId: string;
        bindingIds: readonly string[];
      }>
    | Readonly<{
        operation: "change_timezone";
        transition: ScheduleTimeZoneTransitionResult;
        nextVersion: null;
        versionId: null;
        bindingIds: readonly [];
      }>
  );

export type ScheduleRepository = Readonly<{
  readCommandResult(input: Readonly<{
    requestId: string;
    requestSha256: string;
  }>): Promise<ScheduleRepositoryResult | null>;
  saveVersion(
    input: SaveScheduleVersionRepositoryInput,
  ): Promise<SaveScheduleVersionResult>;
  activateSchedule(
    input: ActivateOwnedPlanScheduleRepositoryInput,
  ): Promise<ActivateOwnedPlanScheduleResult>;
  readEffectiveOpportunity(input: Readonly<{
    scheduleId: string;
    instantMs: number;
  }>): Promise<EffectiveScheduleRead | null>;
  readActionState(input: Readonly<{
    scheduleId: string;
    instantMs: number;
  }>): Promise<ScheduleActionState | null>;
  readDateOverride(
    input: ScheduleDateOverrideReadInput,
  ): Promise<ScheduleDateOverrideV1 | null>;
  readTimeZoneState(input: Readonly<{
    scheduleId: string;
  }>): Promise<ScheduleTimeZoneRead | null>;
  setDateOverride(
    input: SetScheduleDateOverrideRepositoryInput,
  ): Promise<ScheduleMutationResult>;
  consumeDateOverride(
    input: ConsumeScheduleDateOverrideRepositoryInput,
  ): Promise<ScheduleMutationResult>;
  applyOpportunityAction(
    input: ApplyScheduleOpportunityRepositoryInput,
  ): Promise<ScheduleMutationResult>;
  changeTimeZone(
    input: ChangeScheduleTimeZoneRepositoryInput,
  ): Promise<ScheduleMutationResult>;
}>;

export type ScheduleRepositoryErrorCode =
  | "schedule_active_revision_conflict"
  | "schedule_active_state_invalid"
  | "schedule_active_workout_blocked"
  | "schedule_before_snapshot_conflict"
  | "schedule_plan_revision_conflict"
  | "schedule_reference_invalid"
  | "schedule_request_identity_conflict"
  | "schedule_revision_conflict"
  | "schedule_session_fact_conflict";

export class ScheduleRepositoryError extends Error {
  readonly kind = "conflict" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-SCHEDULE02" as const;

  constructor(readonly code: ScheduleRepositoryErrorCode) {
    super(code);
    this.name = "ScheduleRepositoryError";
  }
}

export type ScheduleRepositoryTestObserver = Readonly<{
  afterBinding?(ordinal: number): void;
}>;

type QueryExecutor = Pick<SqliteKernel, "queryAll">;

type ScheduleAggregateRow = Readonly<{
  schedule_id: string;
  schedule_revision: number;
  plan_id: string;
  plan_revision: number;
  plan_origin: "bundled" | "custom" | "copied";
  schedule_lifecycle: "active" | "inactive";
  plan_lifecycle: "draft" | "ready" | "archived" | null;
  plan_graph_status: "missing_valid_target" | "valid" | null;
}>;

type ActiveSchedulePairRow = Readonly<{
  plan_id: string;
  plan_revision: number;
  schedule_id: string | null;
  schedule_revision: number | null;
}>;

type ScheduleActivationPlanRow = Readonly<{
  plan_id: string;
  plan_revision: number;
  plan_origin: "bundled" | "custom" | "copied";
  plan_is_active: number;
  plan_lifecycle: "draft" | "ready" | "archived" | null;
  plan_graph_status: "missing_valid_target" | "valid" | null;
  schedule_id: string | null;
  schedule_revision: number | null;
  schedule_lifecycle: "active" | "inactive" | null;
}>;

type VersionRow = Readonly<{
  id: string;
  version_number: number;
  effective_local_date: string;
  mode: "weekday" | "rotation";
  timezone: string;
  rotation_pointer: number | null;
}>;

type BindingRow = Readonly<{
  id: string;
  ordinal: number;
  week_index: number | null;
  weekday: Weekday | null;
  plan_day_id: string;
}>;

type EventRow = Readonly<{
  payload_json: string;
}>;

type ScheduleEventHistoryRow = Readonly<{
  event_type: string;
  payload_json: string;
  schedule_revision: number;
}>;

type OverrideRow = Readonly<{
  id: string;
  local_date: string;
  selection_kind: "plan_day" | "rest_day" | "skip";
  plan_day_id: string | null;
  state: "pending" | "consumed";
  revision: number;
  consumed_opportunity_id: string | null;
}>;

type OpportunityRow = Readonly<{
  id: string;
  source: "weekday" | "rotation" | "override";
  plan_day_id: string | null;
  state: "pending" | "consumed";
  outcome: "completed" | "skipped" | "planned_not_completed" | "advanced"
    | "rest_day" | null;
  session_id: string | null;
  revision: number;
}>;

function isWeekdayBindingDraft(
  binding: ScheduleVersionBindingDraft,
): binding is Omit<WeekdayScheduleVersionBinding, "id"> {
  return "weekday" in binding && "weekIndex" in binding;
}

function invalidations(
  scheduleId: string,
  planId: string,
  localDate: string,
  includePlan: boolean,
): readonly string[] {
  return Object.freeze([
    ...(includePlan ? [`plan:${planId}`] : []),
    `schedule:${scheduleId}`,
    `schedule:${scheduleId}:date:${localDate}`,
    "today",
  ]);
}

function parseReceipt(value: string): Readonly<{
  requestId: string;
  requestSha256: string;
  result: ScheduleRepositoryResult;
}> {
  const parsed = JSON.parse(value) as {
    requestId?: unknown;
    requestSha256?: unknown;
    result?: ScheduleRepositoryResult;
  };
  if (
    typeof parsed.requestId !== "string"
    || typeof parsed.requestSha256 !== "string"
    || parsed.result?.outcome !== "committed"
    || typeof parsed.result.operation !== "string"
    || !Array.isArray(parsed.result.invalidations)
  ) {
    throw new Error("schedule_command_receipt_invalid");
  }
  return {
    requestId: parsed.requestId,
    requestSha256: parsed.requestSha256,
    result: parsed.result,
  };
}

function replayResult(
  receipt: ReturnType<typeof parseReceipt>,
  requestSha256: string,
): ScheduleRepositoryResult {
  if (receipt.requestSha256 !== requestSha256) {
    throw new ScheduleRepositoryError("schedule_request_identity_conflict");
  }
  return Object.freeze({
    ...receipt.result,
    outcome: "already_committed",
  });
}

async function readReceipt(
  executor: QueryExecutor | SqliteTransactionExecutor,
  requestId: string,
): Promise<ReturnType<typeof parseReceipt> | null> {
  const [row] = await executor.queryAll<EventRow>(
    `SELECT payload_json
     FROM owned_plan_schedule_events
     WHERE id = ?`,
    [`schedule-command:${requestId}`],
  );
  return row === undefined ? null : parseReceipt(row.payload_json);
}

async function readAggregate(
  executor: QueryExecutor | SqliteTransactionExecutor,
  scheduleId: string,
): Promise<ScheduleAggregateRow | undefined> {
  const [row] = await executor.queryAll<ScheduleAggregateRow>(
    `SELECT schedule.id AS schedule_id,
            schedule.revision AS schedule_revision,
            plan.id AS plan_id,
            plan.revision AS plan_revision,
            plan.origin AS plan_origin,
            schedule.lifecycle AS schedule_lifecycle,
            state.lifecycle AS plan_lifecycle,
            state.graph_status AS plan_graph_status
     FROM owned_plan_schedules schedule
     JOIN plans plan ON plan.id = schedule.plan_id
     LEFT JOIN owned_plan_aggregate_states state ON state.plan_id = plan.id
     WHERE schedule.id = ?`,
    [scheduleId],
  );
  return row;
}

async function readBindings(
  executor: QueryExecutor | SqliteTransactionExecutor,
  versionId: string,
  mode: "weekday" | "rotation",
): Promise<readonly ScheduleVersionBinding[]> {
  const rows = await executor.queryAll<BindingRow>(
    `SELECT id, ordinal, week_index, weekday, plan_day_id
     FROM owned_plan_schedule_bindings
     WHERE schedule_version_id = ?
     ORDER BY ordinal, id`,
    [versionId],
  );
  return Object.freeze(rows.map((row) => {
    if (mode === "weekday") {
      return Object.freeze({
        id: row.id,
        ordinal: row.ordinal,
        weekIndex: row.week_index!,
        weekday: row.weekday!,
        planDayId: row.plan_day_id,
      });
    }
    return Object.freeze({
      id: row.id,
      ordinal: row.ordinal,
      planDayId: row.plan_day_id,
    });
  }));
}

async function snapshotVersion(
  executor: QueryExecutor | SqliteTransactionExecutor,
  row: VersionRow,
): Promise<ScheduleVersionSnapshot> {
  return Object.freeze({
    id: row.id,
    versionNumber: row.version_number,
    effectiveLocalDate: row.effective_local_date,
    mode: row.mode,
    timeZone: row.timezone,
    rotationPointer: row.rotation_pointer,
    bindings: await readBindings(executor, row.id, row.mode),
  });
}

async function readLatestVersion(
  executor: QueryExecutor | SqliteTransactionExecutor,
  scheduleId: string,
): Promise<ScheduleVersionSnapshot | null> {
  const [row] = await executor.queryAll<VersionRow>(
    `SELECT id, version_number, effective_local_date, mode, timezone,
            rotation_pointer
     FROM owned_plan_schedule_versions
     WHERE schedule_id = ?
     ORDER BY version_number DESC
     LIMIT 1`,
    [scheduleId],
  );
  return row === undefined ? null : snapshotVersion(executor, row);
}

function sameSnapshot(
  actual: ScheduleVersionSnapshot | null,
  expected: ScheduleVersionSnapshot | null,
): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function validatePlanDayReferences(
  transaction: SqliteTransactionExecutor,
  planId: string,
  bindings: readonly ScheduleVersionBindingDraft[],
): Promise<boolean> {
  if (bindings.length === 0) {
    return true;
  }
  const uniqueIds = [...new Set(bindings.map(({ planDayId }) => planDayId))];
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const rows = await transaction.queryAll<{ id: string }>(
    `SELECT id
     FROM plan_days
     WHERE plan_id = ? AND id IN (${placeholders})
     ORDER BY id`,
    [planId, ...uniqueIds],
  );
  return rows.length === uniqueIds.length;
}

async function nextVersionNumber(
  transaction: SqliteTransactionExecutor,
  scheduleId: string,
): Promise<number> {
  const [row] = await transaction.queryAll<{ next_version: number }>(
    `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
     FROM owned_plan_schedule_versions
     WHERE schedule_id = ?`,
    [scheduleId],
  );
  return row!.next_version;
}

async function insertVersion(
  transaction: SqliteTransactionExecutor,
  input: Readonly<{
    versionId: string;
    scheduleId: string;
    next: ScheduleVersionDraft;
    bindingIds: readonly string[];
    savedAtMs: number;
  }>,
  versionNumber: number,
  observer: ScheduleRepositoryTestObserver,
): Promise<ScheduleVersionSnapshot> {
  await transaction.execute(
    `INSERT INTO owned_plan_schedule_versions
      (id, schedule_id, version_number, effective_local_date, mode, timezone,
       rotation_pointer, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.versionId,
      input.scheduleId,
      versionNumber,
      input.next.effectiveLocalDate,
      input.next.mode,
      input.next.timeZone,
      input.next.mode === "rotation"
        ? input.next.rotationPointer
        : null,
      input.savedAtMs,
    ],
  );
  for (const [ordinal, binding] of input.next.bindings.entries()) {
    const weekdayBinding = isWeekdayBindingDraft(binding) ? binding : null;
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_bindings
        (id, schedule_version_id, mode, ordinal, week_index, weekday,
         plan_day_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.bindingIds[ordinal]!,
        input.versionId,
        input.next.mode,
        binding.ordinal,
        weekdayBinding?.weekIndex ?? null,
        weekdayBinding?.weekday ?? null,
        binding.planDayId,
      ],
    );
    observer.afterBinding?.(ordinal);
  }
  return Object.freeze({
    id: input.versionId,
    versionNumber,
    effectiveLocalDate: input.next.effectiveLocalDate,
    mode: input.next.mode,
    timeZone: input.next.timeZone,
    rotationPointer: input.next.mode === "rotation"
      ? input.next.rotationPointer
      : null,
    bindings: Object.freeze(input.next.bindings.map((binding, ordinal) =>
      Object.freeze({
        id: input.bindingIds[ordinal]!,
        ...binding,
      })
    )),
  });
}

async function saveVersionTransaction(
  transaction: SqliteTransactionExecutor,
  input: SaveScheduleVersionRepositoryInput,
  observer: ScheduleRepositoryTestObserver,
): Promise<SaveScheduleVersionResult> {
  const receipt = await readReceipt(transaction, input.requestId);
  if (receipt !== null) {
    const result = replayResult(receipt, input.requestSha256);
    return result as SaveScheduleVersionResult;
  }
  await assertMutationAggregate(transaction, input);
  if (!sameSnapshot(
    await readLatestVersion(transaction, input.scheduleId),
    input.before,
  )) {
    throw new ScheduleRepositoryError("schedule_before_snapshot_conflict");
  }
  if (!await validatePlanDayReferences(
    transaction,
    input.planId,
    input.next.bindings,
  )) {
    throw new ScheduleRepositoryError("schedule_reference_invalid");
  }
  const versionNumber = await nextVersionNumber(
    transaction,
    input.scheduleId,
  );
  const version = await insertVersion(
    transaction,
    input,
    versionNumber,
    observer,
  );
  const scheduleUpdate = await transaction.execute(
    `UPDATE owned_plan_schedules
     SET revision = revision + 1
     WHERE id = ? AND revision = ?`,
    [input.scheduleId, input.expectedScheduleRevision],
  );
  const planUpdate = await transaction.execute(
    `UPDATE plans
     SET revision = revision + 1
     WHERE id = ? AND revision = ?`,
    [input.planId, input.expectedPlanRevision],
  );
  void scheduleUpdate;
  void planUpdate;
  const result: ScheduleRepositoryResult = Object.freeze({
    outcome: "committed",
    operation: input.operation,
    scheduleId: input.scheduleId,
    planId: input.planId,
    scheduleRevision: input.expectedScheduleRevision + 1,
    planRevision: input.expectedPlanRevision + 1,
    version,
    invalidations: invalidations(
      input.scheduleId,
      input.planId,
      input.next.effectiveLocalDate,
      true,
    ),
  });
  await transaction.execute(
    `INSERT INTO owned_plan_schedule_events
      (id, schedule_id, event_type, local_date, payload_json,
       schedule_revision, created_at_ms)
     VALUES (?, ?, 'schedule_version_saved', ?, ?, ?, ?)`,
    [
      `schedule-command:${input.requestId}`,
      input.scheduleId,
      input.next.effectiveLocalDate,
      JSON.stringify({
        requestId: input.requestId,
        requestSha256: input.requestSha256,
        before: input.before,
        after: version,
        result,
      }),
      result.scheduleRevision,
      input.savedAtMs,
    ],
  );
  return result;
}

async function readActiveSchedulePair(
  transaction: SqliteTransactionExecutor,
): Promise<ActiveSchedulePairRow | null> {
  const activePlans = await transaction.queryAll<ActiveSchedulePairRow>(
    `SELECT plan.id AS plan_id,
            plan.revision AS plan_revision,
            schedule.id AS schedule_id,
            schedule.revision AS schedule_revision
     FROM plans plan
     LEFT JOIN owned_plan_schedules schedule
       ON schedule.plan_id = plan.id
      AND schedule.lifecycle = 'active'
     WHERE plan.is_active = 1
     ORDER BY plan.id`,
  );
  const activeSchedules = await transaction.queryAll<{
    schedule_id: string;
    schedule_revision: number;
    plan_id: string;
  }>(
    `SELECT id AS schedule_id, revision AS schedule_revision, plan_id
     FROM owned_plan_schedules
     WHERE lifecycle = 'active'
     ORDER BY id`,
  );
  if (activePlans.length > 1 || activeSchedules.length > 1) {
    throw new ScheduleRepositoryError("schedule_active_state_invalid");
  }
  const activePlan = activePlans[0];
  const activeSchedule = activeSchedules[0];
  if (
    activeSchedule !== undefined
    && (
      activePlan === undefined
      || activePlan.plan_id !== activeSchedule.plan_id
      || activePlan.schedule_id !== activeSchedule.schedule_id
      || activePlan.schedule_revision !== activeSchedule.schedule_revision
    )
  ) {
    throw new ScheduleRepositoryError("schedule_active_state_invalid");
  }
  if (activePlan !== undefined && activePlan.schedule_id === null) {
    throw new ScheduleRepositoryError("schedule_active_state_invalid");
  }
  return activePlan ?? null;
}

function activePairMatches(
  active: ActiveSchedulePairRow | null,
  expected: ActiveSchedulePairExpectation,
): boolean {
  if (expected.kind === "none") {
    return active === null;
  }
  return active?.plan_id === expected.planId
    && active.plan_revision === expected.planRevision
    && active.schedule_id === expected.scheduleId
    && active.schedule_revision === expected.scheduleRevision;
}

async function hasActiveWorkout(
  transaction: SqliteTransactionExecutor,
): Promise<boolean> {
  const [row] = await transaction.queryAll<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM workout_sessions
     WHERE status = 'in_progress'`,
  );
  return row!.count > 0;
}

async function readScheduleActivationPlan(
  transaction: SqliteTransactionExecutor,
  planId: string,
): Promise<ScheduleActivationPlanRow | null> {
  const [row] = await transaction.queryAll<ScheduleActivationPlanRow>(
    `SELECT plan.id AS plan_id,
            plan.revision AS plan_revision,
            plan.origin AS plan_origin,
            plan.is_active AS plan_is_active,
            state.lifecycle AS plan_lifecycle,
            state.graph_status AS plan_graph_status,
            schedule.id AS schedule_id,
            schedule.revision AS schedule_revision,
            schedule.lifecycle AS schedule_lifecycle
     FROM plans plan
     LEFT JOIN owned_plan_aggregate_states state ON state.plan_id = plan.id
     LEFT JOIN owned_plan_schedules schedule ON schedule.plan_id = plan.id
     WHERE plan.id = ?`,
    [planId],
  );
  return row ?? null;
}

async function hasValidPlanTargetFacts(
  transaction: SqliteTransactionExecutor,
  planId: string,
): Promise<boolean> {
  const [row] = await transaction.queryAll<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM owned_plan_working_set_targets target
     JOIN owned_plan_day_exercises occurrence
       ON occurrence.id = target.plan_day_exercise_id
     JOIN owned_plan_progression_policies policy
       ON policy.plan_day_exercise_id = occurrence.id
     JOIN plan_days day ON day.id = occurrence.plan_day_id
     WHERE day.plan_id = ?
       AND target.metric_profile = occurrence.metric_profile
       AND target.metric_contract_version = occurrence.metric_contract_version
       AND target.exercise_metric_generation =
         occurrence.exercise_metric_generation
       AND policy.status = 'active'
       AND policy.metric_profile = occurrence.metric_profile
       AND policy.metric_contract_version = occurrence.metric_contract_version
       AND policy.exercise_metric_generation =
         occurrence.exercise_metric_generation`,
    [planId],
  );
  return row!.count > 0;
}

function activationInvalidations(
  input: ActivateOwnedPlanScheduleRepositoryInput,
  active: ActiveSchedulePairRow | null,
): readonly string[] {
  const scheduleId = input.targetSchedule.scheduleId;
  return Object.freeze([
    `plan:${input.planId}`,
    `schedule:${scheduleId}`,
    `schedule:${scheduleId}:date:${input.next.effectiveLocalDate}`,
    ...(active === null || active.plan_id === input.planId
      ? []
      : [`plan:${active.plan_id}`]),
    ...(active?.schedule_id === null
        || active?.schedule_id === undefined
        || active.schedule_id === scheduleId
      ? []
      : [`schedule:${active.schedule_id}`]),
    "today",
  ]);
}

async function activateScheduleTransaction(
  transaction: SqliteTransactionExecutor,
  input: ActivateOwnedPlanScheduleRepositoryInput,
  observer: ScheduleRepositoryTestObserver,
): Promise<ActivateOwnedPlanScheduleResult> {
  const receipt = await readReceipt(transaction, input.requestId);
  if (receipt !== null) {
    return replayResult(
      receipt,
      input.requestSha256,
    ) as ActivateOwnedPlanScheduleResult;
  }
  const active = await readActiveSchedulePair(transaction);
  if (!activePairMatches(
    active,
    input.expectedActivePair,
  )) {
    throw new ScheduleRepositoryError("schedule_active_revision_conflict");
  }
  if (await hasActiveWorkout(transaction)) {
    throw new ScheduleRepositoryError("schedule_active_workout_blocked");
  }
  const target = await readScheduleActivationPlan(transaction, input.planId);
  if (
    target === null
    || target.plan_origin === "bundled"
    || target.plan_is_active !== 0
    || target.plan_lifecycle !== "ready"
    || target.plan_graph_status !== "valid"
    || target.plan_revision !== input.expectedPlanRevision
    || (
      target.schedule_id === null
        ? input.targetSchedule.kind !== "absent"
        : input.targetSchedule.kind !== "inactive"
          || target.schedule_id !== input.targetSchedule.scheduleId
          || target.schedule_lifecycle !== "inactive"
          || target.schedule_revision !== input.targetSchedule.scheduleRevision
    )
    || !await hasValidPlanTargetFacts(transaction, input.planId)
  ) {
    throw new ScheduleRepositoryError("schedule_reference_invalid");
  }
  const scheduleId = input.targetSchedule.scheduleId;
  const before = input.targetSchedule.kind === "inactive"
    ? input.targetSchedule.before
    : null;
  if (
    !sameSnapshot(
      target.schedule_id === null
        ? null
        : await readLatestVersion(transaction, scheduleId),
      before,
    )
  ) {
    throw new ScheduleRepositoryError("schedule_before_snapshot_conflict");
  }
  if (!await validatePlanDayReferences(
    transaction,
    input.planId,
    input.next.bindings,
  )) {
    throw new ScheduleRepositoryError("schedule_reference_invalid");
  }
  if (active !== null && active.plan_id !== input.planId) {
    const planUpdate = await transaction.execute(
      `UPDATE plans
       SET is_active = 0, revision = revision + 1
       WHERE id = ? AND revision = ? AND is_active = 1`,
      [active.plan_id, active.plan_revision],
    );
    if (planUpdate.changes !== 1) {
      throw new ScheduleRepositoryError("schedule_active_revision_conflict");
    }
    if (active.schedule_id !== null) {
      const scheduleUpdate = await transaction.execute(
        `UPDATE owned_plan_schedules
         SET lifecycle = 'inactive',
             revision = revision + 1,
             deactivated_at_ms = ?
         WHERE id = ? AND revision = ? AND lifecycle = 'active'`,
        [
          input.activatedAtMs,
          active.schedule_id,
          active.schedule_revision,
        ],
      );
      if (scheduleUpdate.changes !== 1) {
        throw new ScheduleRepositoryError("schedule_active_revision_conflict");
      }
    }
  }
  const scheduleRevision = input.targetSchedule.kind === "absent"
    ? 1
    : input.targetSchedule.scheduleRevision + 1;
  if (target.schedule_id === null) {
    await transaction.execute(
      `INSERT INTO owned_plan_schedules
        (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms)
       VALUES (?, ?, 'active', 1, ?, NULL)`,
      [scheduleId, input.planId, input.activatedAtMs],
    );
  } else {
    const scheduleUpdate = await transaction.execute(
      `UPDATE owned_plan_schedules
       SET lifecycle = 'active',
           revision = revision + 1,
           activated_at_ms = ?,
           deactivated_at_ms = NULL
       WHERE id = ? AND revision = ? AND lifecycle = 'inactive'`,
      [
        input.activatedAtMs,
        scheduleId,
        input.targetSchedule.kind === "inactive"
          ? input.targetSchedule.scheduleRevision
          : -1,
      ],
    );
    if (scheduleUpdate.changes !== 1) {
      throw new ScheduleRepositoryError("schedule_revision_conflict");
    }
  }
  const version = await insertVersion(
    transaction,
    {
      versionId: input.versionId,
      scheduleId,
      next: input.next,
      bindingIds: input.bindingIds,
      savedAtMs: input.activatedAtMs,
    },
    await nextVersionNumber(transaction, scheduleId),
    observer,
  );
  const targetPlanUpdate = await transaction.execute(
    `UPDATE plans
     SET is_active = 1, revision = revision + 1
     WHERE id = ? AND revision = ? AND is_active = 0`,
    [input.planId, input.expectedPlanRevision],
  );
  if (targetPlanUpdate.changes !== 1) {
    throw new ScheduleRepositoryError("schedule_plan_revision_conflict");
  }
  const activated = await readActiveSchedulePair(transaction);
  if (
    activated?.plan_id !== input.planId
    || activated.plan_revision !== input.expectedPlanRevision + 1
    || activated.schedule_id !== scheduleId
    || activated.schedule_revision !== scheduleRevision
  ) {
    throw new ScheduleRepositoryError("schedule_active_state_invalid");
  }
  const result: ActivateOwnedPlanScheduleResult = Object.freeze({
    outcome: "committed",
    operation: input.operation,
    scheduleId,
    planId: input.planId,
    scheduleRevision,
    planRevision: input.expectedPlanRevision + 1,
    version,
    invalidations: activationInvalidations(input, active),
  });
  await transaction.execute(
    `INSERT INTO owned_plan_schedule_events
      (id, schedule_id, event_type, local_date, payload_json,
       schedule_revision, created_at_ms)
     VALUES (?, ?, 'schedule_activated', ?, ?, ?, ?)`,
    [
      `schedule-command:${input.requestId}`,
      scheduleId,
      input.next.effectiveLocalDate,
      JSON.stringify({
        requestId: input.requestId,
        requestSha256: input.requestSha256,
        previousActivePair: active,
        before,
        after: version,
        result,
      }),
      scheduleRevision,
      input.activatedAtMs,
    ],
  );
  return result;
}

async function assertMutationAggregate(
  transaction: SqliteTransactionExecutor,
  input: ScheduleRevisionExpectation,
): Promise<ScheduleAggregateRow> {
  const aggregate = await readAggregate(transaction, input.scheduleId);
  if (
    aggregate === undefined
    || aggregate.plan_id !== input.planId
    || aggregate.plan_origin === "bundled"
    || aggregate.schedule_lifecycle !== "active"
    || aggregate.plan_lifecycle === "archived"
    || aggregate.plan_graph_status === "missing_valid_target"
  ) {
    throw new ScheduleRepositoryError("schedule_reference_invalid");
  }
  if (aggregate.schedule_revision !== input.expectedScheduleRevision) {
    throw new ScheduleRepositoryError("schedule_revision_conflict");
  }
  if (aggregate.plan_revision !== input.expectedPlanRevision) {
    throw new ScheduleRepositoryError("schedule_plan_revision_conflict");
  }
  return aggregate;
}

async function incrementScheduleRevision(
  transaction: SqliteTransactionExecutor,
  input: ScheduleMutationBase,
): Promise<void> {
  const updated = await transaction.execute(
    `UPDATE owned_plan_schedules
     SET revision = revision + 1
     WHERE id = ? AND revision = ?`,
    [input.scheduleId, input.expectedScheduleRevision],
  );
  void updated;
}

async function incrementPlanRevision(
  transaction: SqliteTransactionExecutor,
  input: ScheduleMutationBase,
): Promise<void> {
  const updated = await transaction.execute(
    `UPDATE plans
     SET revision = revision + 1
     WHERE id = ? AND revision = ?`,
    [input.planId, input.expectedPlanRevision],
  );
  void updated;
}

function mutationResult(
  input: ScheduleMutationBase & Readonly<{
    operation: ScheduleMutationOperation;
  }>,
  version?: ScheduleVersionSnapshot,
): ScheduleMutationResult {
  return Object.freeze({
    outcome: "committed",
    operation: input.operation,
    scheduleId: input.scheduleId,
    planId: input.planId,
    scheduleRevision: input.expectedScheduleRevision + 1,
    planRevision: input.expectedPlanRevision + (version === undefined ? 0 : 1),
    localDate: input.localDate,
    ...(version === undefined ? {} : { version }),
    invalidations: invalidations(
      input.scheduleId,
      input.planId,
      input.localDate,
      version !== undefined,
    ),
  });
}

async function appendCommandEvent(
  transaction: SqliteTransactionExecutor,
  input: ScheduleMutationBase & Readonly<{
    operation: ScheduleMutationOperation;
  }>,
  eventType: string,
  domainEvents: readonly unknown[],
  result: ScheduleMutationResult,
  extra: Readonly<Record<string, unknown>> = {},
): Promise<void> {
  await transaction.execute(
    `INSERT INTO owned_plan_schedule_events
      (id, schedule_id, event_type, local_date, payload_json,
       schedule_revision, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      `schedule-command:${input.requestId}`,
      input.scheduleId,
      eventType,
      input.localDate,
      JSON.stringify({
        requestId: input.requestId,
        requestSha256: input.requestSha256,
        domainEvents,
        result,
        ...extra,
      }),
      result.scheduleRevision,
      input.occurredAtMs,
    ],
  );
}

async function assertScheduledSession(
  transaction: SqliteTransactionExecutor,
  consumed: NonNullable<RotationTransitionResult["consumed"]>
    | WeekdayOpportunityTransitionResult["next"],
  planId: string,
): Promise<void> {
  if (consumed.outcome !== "completed" || consumed.sessionId === null) {
    return;
  }
  const [session] = await transaction.queryAll<{
    plan_id: string | null;
    plan_day_id: string | null;
    source: string;
    status: string;
    local_date: string;
  }>(
    `SELECT plan_id, plan_day_id, source, status, local_date
     FROM workout_sessions
     WHERE id = ?`,
    [consumed.sessionId],
  );
  if (
    session === undefined
    || session.plan_id !== planId
    || session.plan_day_id !== consumed.planDayId
    || session.source !== "scheduled_day"
    || session.status !== "completed"
    || session.local_date !== consumed.localDate
  ) {
    throw new ScheduleRepositoryError("schedule_session_fact_conflict");
  }
}

async function persistConsumedOpportunity(
  transaction: SqliteTransactionExecutor,
  input: ApplyScheduleOpportunityRepositoryInput,
  consumed: NonNullable<RotationTransitionResult["consumed"]>
    | WeekdayOpportunityTransitionResult["next"],
): Promise<void> {
  await assertScheduledSession(transaction, consumed, input.planId);
  const updated = await transaction.execute(
    `UPDATE owned_plan_schedule_opportunities
     SET state = 'consumed',
         outcome = ?,
         session_id = ?,
         revision = ?,
         consumed_at_ms = ?
     WHERE id = ? AND state = 'pending' AND revision = ?`,
    [
      consumed.outcome,
      consumed.sessionId,
      consumed.revision,
      input.occurredAtMs,
      consumed.id,
      consumed.revision - 1,
    ],
  );
  if (updated.changes === 1) {
    return;
  }
  await transaction.execute(
    `INSERT INTO owned_plan_schedule_opportunities
      (id, schedule_id, schedule_version_id, local_date, source,
       plan_day_id, state, outcome, session_id, revision, consumed_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, 'consumed', ?, ?, ?, ?)`,
    [
      consumed.id,
      input.scheduleId,
      input.versionId,
      consumed.localDate,
      consumed.source,
      consumed.planDayId,
      consumed.outcome,
      consumed.sessionId,
      consumed.revision,
      input.occurredAtMs,
    ],
  );
}

async function applyOpportunityTransaction(
  transaction: SqliteTransactionExecutor,
  input: ApplyScheduleOpportunityRepositoryInput,
): Promise<ScheduleMutationResult> {
  const receipt = await readReceipt(transaction, input.requestId);
  if (receipt !== null) {
    return replayResult(receipt, input.requestSha256) as ScheduleMutationResult;
  }
  await assertMutationAggregate(transaction, input);
  const consumed = "consumed" in input.transition
    ? input.transition.consumed
    : input.transition.next;
  if (consumed !== null) {
    await persistConsumedOpportunity(transaction, input, consumed);
  }
  await incrementScheduleRevision(transaction, input);
  const result = mutationResult(input);
  const firstEvent = input.transition.events[0]!;
  await appendCommandEvent(
    transaction,
    input,
    firstEvent.type,
    input.transition.events,
    result,
  );
  return result;
}

function overrideValues(override: ScheduleDateOverrideV1): Readonly<{
  selectionKind: "plan_day" | "rest_day" | "skip";
  planDayId: string | null;
}> {
  return {
    selectionKind: override.selection.kind,
    planDayId: override.selection.kind === "plan_day"
      ? override.selection.planDayId
      : null,
  };
}

async function setOverrideTransaction(
  transaction: SqliteTransactionExecutor,
  input: SetScheduleDateOverrideRepositoryInput,
): Promise<ScheduleMutationResult> {
  const receipt = await readReceipt(transaction, input.requestId);
  if (receipt !== null) {
    return replayResult(receipt, input.requestSha256) as ScheduleMutationResult;
  }
  await assertMutationAggregate(transaction, input);
  const next = input.transition.next;
  const values = overrideValues(next);
  if (
    values.planDayId !== null
    && !await validatePlanDayReferences(transaction, input.planId, [{
      ordinal: 0,
      planDayId: values.planDayId,
    }])
  ) {
    throw new ScheduleRepositoryError("schedule_reference_invalid");
  }
  if (next.revision === 1) {
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_overrides
        (id, schedule_id, local_date, selection_kind, plan_day_id, state,
         revision, consumed_opportunity_id, created_at_ms, consumed_at_ms)
       VALUES (?, ?, ?, ?, ?, 'pending', 1, NULL, ?, NULL)`,
      [
        next.id,
        input.scheduleId,
        next.localDate,
        values.selectionKind,
        values.planDayId,
        input.occurredAtMs,
      ],
    );
  } else {
    const updated = await transaction.execute(
      `UPDATE owned_plan_schedule_overrides
       SET selection_kind = ?, plan_day_id = ?, revision = ?
       WHERE id = ? AND schedule_id = ? AND local_date = ?
         AND state = 'pending' AND revision = ?`,
      [
        values.selectionKind,
        values.planDayId,
        next.revision,
        next.id,
        input.scheduleId,
        next.localDate,
        next.revision - 1,
      ],
    );
    void updated;
  }
  await incrementScheduleRevision(transaction, input);
  const result = mutationResult(input);
  await appendCommandEvent(
    transaction,
    input,
    input.transition.events[0]!.type,
    input.transition.events,
    result,
  );
  return result;
}

async function consumeOverrideTransaction(
  transaction: SqliteTransactionExecutor,
  input: ConsumeScheduleDateOverrideRepositoryInput,
): Promise<ScheduleMutationResult> {
  const receipt = await readReceipt(transaction, input.requestId);
  if (receipt !== null) {
    return replayResult(receipt, input.requestSha256) as ScheduleMutationResult;
  }
  await assertMutationAggregate(transaction, input);
  const next = input.transition.next;
  const updated = await transaction.execute(
    `UPDATE owned_plan_schedule_overrides
     SET state = 'consumed',
         revision = ?,
         consumed_opportunity_id = ?,
         consumed_at_ms = ?
     WHERE id = ? AND schedule_id = ? AND local_date = ?
       AND state = 'pending' AND revision = ?`,
    [
      next.revision,
      next.opportunityId,
      input.occurredAtMs,
      next.id,
      input.scheduleId,
      next.localDate,
      next.revision - 1,
    ],
  );
  void updated;
  const selection = overrideValues(next);
  const version = await readLatestVersion(transaction, input.scheduleId);
  if (version === null) {
    throw new ScheduleRepositoryError("schedule_reference_invalid");
  }
  const pending = next.selection.kind === "plan_day";
  await transaction.execute(
    `INSERT INTO owned_plan_schedule_opportunities
      (id, schedule_id, schedule_version_id, local_date, source,
       plan_day_id, state, outcome, session_id, revision, consumed_at_ms)
     VALUES (?, ?, ?, ?, 'override', ?, ?, ?, NULL, 1, ?)`,
    [
      next.opportunityId,
      input.scheduleId,
      version.id,
      next.localDate,
      selection.planDayId,
      pending ? "pending" : "consumed",
      next.selection.kind === "skip"
        ? "skipped"
        : next.selection.kind === "rest_day"
          ? "rest_day"
          : null,
      pending ? null : input.occurredAtMs,
    ],
  );
  await incrementScheduleRevision(transaction, input);
  const result = mutationResult(input);
  await appendCommandEvent(
    transaction,
    input,
    input.transition.events[0]!.type,
    input.transition.events,
    result,
  );
  return result;
}

async function changeTimeZoneTransaction(
  transaction: SqliteTransactionExecutor,
  input: ChangeScheduleTimeZoneRepositoryInput,
  observer: ScheduleRepositoryTestObserver,
): Promise<ScheduleMutationResult> {
  const receipt = await readReceipt(transaction, input.requestId);
  if (receipt !== null) {
    return replayResult(receipt, input.requestSha256) as ScheduleMutationResult;
  }
  await assertMutationAggregate(transaction, input);
  let version: ScheduleVersionSnapshot | undefined;
  if (input.nextVersion !== null) {
    if (!await validatePlanDayReferences(
      transaction,
      input.planId,
      input.nextVersion.bindings,
    )) {
      throw new ScheduleRepositoryError("schedule_reference_invalid");
    }
    version = await insertVersion(
      transaction,
      {
        versionId: input.versionId,
        scheduleId: input.scheduleId,
        next: input.nextVersion,
        bindingIds: input.bindingIds,
        savedAtMs: input.occurredAtMs,
      },
      await nextVersionNumber(transaction, input.scheduleId),
      observer,
    );
    await incrementPlanRevision(transaction, input);
  }
  await incrementScheduleRevision(transaction, input);
  const result = mutationResult(input, version);
  await appendCommandEvent(
    transaction,
    input,
    input.transition.events[0]!.type,
    input.transition.events,
    result,
    { timeZoneState: input.transition.next },
  );
  return result;
}

function derivedOpportunityId(
  scheduleId: string,
  localDate: string,
  source: "weekday" | "rotation",
): string {
  return `schedule-opportunity:${scheduleId}:${localDate}:${source}`;
}

function pendingOpportunity(
  scheduleId: string,
  localDate: LocalDate,
  source: "weekday" | "rotation",
  planDayId: string,
): PendingScheduleOpportunityV1 {
  return Object.freeze({
    version: 1,
    state: "pending",
    id: derivedOpportunityId(scheduleId, localDate, source),
    source,
    localDate,
    planDayId,
    revision: 1,
  });
}

function weekdayPlanDay(
  version: ScheduleVersionSnapshot,
  localDate: LocalDate,
): string | null {
  const bindings = version.bindings.filter(
    (binding): binding is WeekdayScheduleVersionBinding =>
      "weekday" in binding,
  );
  if (bindings.length === 0) {
    return null;
  }
  const cycleLength = Math.max(...bindings.map(({ weekIndex }) => weekIndex))
    + 1;
  const dayDifference = differenceInLocalDays(
    parseLocalDate(version.effectiveLocalDate),
    localDate,
  );
  const weekIndex = Math.floor(dayDifference / 7) % cycleLength;
  const weekday = weekdayForLocalDate(localDate);
  return bindings.find((binding) =>
    binding.weekIndex === weekIndex && binding.weekday === weekday
  )?.planDayId ?? null;
}

function rotationPlanDay(version: ScheduleVersionSnapshot): string | null {
  if (version.bindings.length === 0) {
    return null;
  }
  const pointer = version.rotationPointer!;
  return version.bindings[pointer]?.planDayId ?? null;
}

function eventDomainEvents(payloadJson: string): readonly unknown[] {
  const parsed = JSON.parse(payloadJson) as {
    domainEvents?: unknown;
  };
  return Array.isArray(parsed.domainEvents) ? parsed.domainEvents : [];
}

function resultVersionId(payloadJson: string): string | null {
  const parsed = JSON.parse(payloadJson) as {
    result?: { version?: { id?: unknown } };
  };
  return typeof parsed.result?.version?.id === "string"
    ? parsed.result.version.id
    : null;
}

async function effectiveRotationPointer(
  kernel: SqliteKernel,
  scheduleId: string,
  version: ScheduleVersionSnapshot,
): Promise<number> {
  if (version.mode !== "rotation" || version.bindings.length === 0) {
    return 0;
  }
  const rows = await kernel.queryAll<ScheduleEventHistoryRow>(
    `SELECT event_type, payload_json, schedule_revision
     FROM owned_plan_schedule_events
     WHERE schedule_id = ?
     ORDER BY schedule_revision, created_at_ms, id`,
    [scheduleId],
  );
  const versionRevision = rows.reduce(
    (revision, row) =>
      resultVersionId(row.payload_json) === version.id
        ? row.schedule_revision
        : revision,
    0,
  );
  let pointer = version.rotationPointer!;
  for (const row of rows) {
    if (row.schedule_revision <= versionRevision) {
      continue;
    }
    for (const event of eventDomainEvents(row.payload_json)) {
      if (
        typeof event === "object"
        && event !== null
        && "toPointer" in event
        && Number.isSafeInteger(event.toPointer)
      ) {
        pointer = event.toPointer as number;
      }
    }
  }
  return pointer;
}

async function readPersistedOpportunity(
  kernel: SqliteKernel,
  scheduleId: string,
  localDate: LocalDate,
  source: "weekday" | "rotation",
): Promise<EffectiveScheduleOpportunity | null> {
  const [row] = await kernel.queryAll<OpportunityRow>(
    `SELECT id, source, plan_day_id, state, outcome, session_id, revision
     FROM owned_plan_schedule_opportunities
     WHERE schedule_id = ? AND local_date = ? AND source = ?`,
    [scheduleId, localDate, source],
  );
  if (row === undefined || row.plan_day_id === null || row.source === "override") {
    return null;
  }
  if (row.outcome === "rest_day") {
    throw new Error("schedule_opportunity_state_invalid");
  }
  if (row.state === "pending") {
    return Object.freeze({
      version: 1,
      state: "pending",
      id: row.id,
      source: row.source,
      localDate,
      planDayId: row.plan_day_id,
      revision: row.revision,
    });
  }
  return Object.freeze({
    version: 1,
    state: "consumed",
    id: row.id,
    source: row.source,
    localDate,
    planDayId: row.plan_day_id,
    revision: row.revision,
    outcome: row.outcome!,
    sessionId: row.session_id,
  });
}

async function readOverrideOpportunity(
  kernel: SqliteKernel,
  override: ScheduleDateOverrideV1,
): Promise<EffectiveOverrideOpportunity> {
  if (override.state === "pending") {
    return Object.freeze({
      version: 1,
      state: "pending",
      id: `${override.id}:effective`,
      source: "override",
      localDate: override.localDate,
      planDayId: override.selection.kind === "plan_day"
        ? override.selection.planDayId
        : null,
      revision: override.revision,
      selectionKind: override.selection.kind,
      outcome: null,
      sessionId: null,
    });
  }
  const [row] = await kernel.queryAll<OpportunityRow>(
    `SELECT id, source, plan_day_id, state, outcome, session_id, revision
     FROM owned_plan_schedule_opportunities
     WHERE id = ?`,
    [override.opportunityId],
  );
  if (row === undefined || row.source !== "override") {
    throw new Error("schedule_override_opportunity_invalid");
  }
  return Object.freeze({
    version: 1,
    state: row.state,
    id: row.id,
    source: "override",
    localDate: override.localDate,
    planDayId: row.plan_day_id,
    revision: row.revision,
    selectionKind: override.selection.kind,
    outcome: row.outcome,
    sessionId: row.session_id,
  });
}

async function effectiveVersion(
  kernel: SqliteKernel,
  scheduleId: string,
  instantMs: number,
): Promise<Readonly<{
  row: VersionRow;
  localDate: LocalDate;
  timeZone: StoredTimeZone;
}> | null> {
  const rows = await kernel.queryAll<VersionRow>(
    `SELECT id, version_number, effective_local_date, mode, timezone,
            rotation_pointer
     FROM owned_plan_schedule_versions
     WHERE schedule_id = ?
     ORDER BY effective_local_date DESC, version_number DESC`,
    [scheduleId],
  );
  for (const row of rows) {
    const timeZone = parseStoredTimeZone(row.timezone);
    const localDate = localDateAtInstant(instantMs, timeZone);
    if (row.effective_local_date <= localDate) {
      return { row, localDate, timeZone };
    }
  }
  return null;
}

async function readEffectiveOpportunity(
  kernel: SqliteKernel,
  input: Readonly<{ scheduleId: string; instantMs: number }>,
): Promise<EffectiveScheduleRead | null> {
  const aggregate = await readAggregate(kernel, input.scheduleId);
  if (aggregate === undefined) {
    return null;
  }
  const effective = await effectiveVersion(
    kernel,
    input.scheduleId,
    input.instantMs,
  );
  if (effective === null) {
    return null;
  }
  const version = await snapshotVersion(kernel, effective.row);
  const resolvedVersion = version.mode === "rotation"
    ? Object.freeze({
        ...version,
        rotationPointer: await effectiveRotationPointer(
          kernel,
          input.scheduleId,
          version,
        ),
      })
    : version;
  const override = await readDateOverride(kernel, {
    scheduleId: input.scheduleId,
    localDate: effective.localDate,
  });
  if (override !== null) {
    return Object.freeze({
      scheduleId: input.scheduleId,
      scheduleRevision: aggregate.schedule_revision,
      localDate: effective.localDate,
      timeZone: effective.timeZone,
      version: resolvedVersion,
      override,
      opportunity: await readOverrideOpportunity(kernel, override),
    });
  }
  const source = resolvedVersion.mode;
  const persisted = await readPersistedOpportunity(
    kernel,
    input.scheduleId,
    effective.localDate,
    source,
  );
  const planDayId = source === "weekday"
    ? weekdayPlanDay(resolvedVersion, effective.localDate)
    : rotationPlanDay(resolvedVersion);
  return Object.freeze({
    scheduleId: input.scheduleId,
    scheduleRevision: aggregate.schedule_revision,
    localDate: parseLocalDate(effective.localDate),
    timeZone: effective.timeZone,
    version: resolvedVersion,
    override: null,
    opportunity: persisted ?? (
      planDayId === null
        ? null
        : pendingOpportunity(
            input.scheduleId,
            effective.localDate,
            source,
            planDayId,
          )
    ),
  });
}

function pendingDomainOpportunity(
  opportunity: EffectiveScheduleOpportunity | null,
): PendingScheduleOpportunityV1 | null {
  if (
    opportunity === null
    || opportunity.state !== "pending"
    || opportunity.source === "override"
  ) {
    return null;
  }
  return Object.freeze({
    version: 1,
    state: "pending",
    id: opportunity.id,
    source: opportunity.source,
    localDate: parseLocalDate(opportunity.localDate),
    planDayId: opportunity.planDayId,
    revision: opportunity.revision,
  });
}

async function readActionState(
  kernel: SqliteKernel,
  input: Readonly<{ scheduleId: string; instantMs: number }>,
): Promise<ScheduleActionState | null> {
  const effective = await readEffectiveOpportunity(kernel, input);
  if (effective === null) {
    return null;
  }
  const aggregate = await readAggregate(kernel, input.scheduleId);
  const scheduleAggregate = aggregate!;
  const hasEffectiveOverride = effective.override !== null;
  const recurringRotationOpportunity =
    hasEffectiveOverride && effective.version.mode === "rotation"
      ? (() => {
          const planDayId = rotationPlanDay(effective.version);
          return planDayId === null
            ? null
            : pendingOpportunity(
                input.scheduleId,
                parseLocalDate(effective.localDate),
                "rotation",
                planDayId,
              );
        })()
      : pendingDomainOpportunity(effective.opportunity);
  return Object.freeze({
    scheduleId: input.scheduleId,
    planId: scheduleAggregate.plan_id,
    scheduleRevision: scheduleAggregate.schedule_revision,
    planRevision: scheduleAggregate.plan_revision,
    localDate: parseLocalDate(effective.localDate),
    hasEffectiveOverride,
    version: effective.version,
    rotationState: effective.version.mode === "rotation"
      ? Object.freeze({
          version: 1,
          mode: "rotation",
          revision: scheduleAggregate.schedule_revision,
          bindings: Object.freeze(
            effective.version.bindings.map(({ planDayId }) => planDayId),
          ),
          pointer: effective.version.rotationPointer!,
          currentOpportunity: recurringRotationOpportunity,
        })
      : null,
    opportunity: effective.opportunity?.source === "override"
      ? null
      : effective.opportunity,
  });
}

async function readDateOverride(
  kernel: SqliteKernel,
  input: ScheduleDateOverrideReadInput,
): Promise<ScheduleDateOverrideV1 | null> {
  const [row] = await kernel.queryAll<OverrideRow>(
    `SELECT id, local_date, selection_kind, plan_day_id, state, revision,
            consumed_opportunity_id
     FROM owned_plan_schedule_overrides
     WHERE schedule_id = ? AND local_date = ?`,
    [input.scheduleId, input.localDate],
  );
  if (row === undefined) {
    return null;
  }
  const selection = row.selection_kind === "plan_day"
    ? {
        kind: "plan_day" as const,
        planDayId: row.plan_day_id!,
      }
    : { kind: row.selection_kind };
  return row.state === "pending"
    ? Object.freeze({
        version: 1,
        state: "pending",
        id: row.id,
        revision: row.revision,
        localDate: parseLocalDate(row.local_date),
        selection,
      })
    : Object.freeze({
        version: 1,
        state: "consumed",
        id: row.id,
        revision: row.revision,
        localDate: parseLocalDate(row.local_date),
        selection,
        opportunityId: row.consumed_opportunity_id!,
      });
}

function latestTimeZoneDecision(
  rows: readonly ScheduleEventHistoryRow[],
): ScheduleTimeZoneStateV1["lastDeviceTimeZoneDecision"] {
  for (const row of [...rows].reverse()) {
    const parsed = JSON.parse(row.payload_json) as {
      timeZoneState?: ScheduleTimeZoneStateV1;
    };
    if (parsed.timeZoneState?.lastDeviceTimeZoneDecision !== undefined) {
      return parsed.timeZoneState.lastDeviceTimeZoneDecision;
    }
  }
  return null;
}

async function readTimeZoneState(
  kernel: SqliteKernel,
  input: Readonly<{ scheduleId: string }>,
): Promise<ScheduleTimeZoneRead | null> {
  const aggregate = await readAggregate(kernel, input.scheduleId);
  const version = await readLatestVersion(kernel, input.scheduleId);
  if (aggregate === undefined || version === null) {
    return null;
  }
  const rows = await kernel.queryAll<ScheduleEventHistoryRow>(
    `SELECT event_type, payload_json, schedule_revision
     FROM owned_plan_schedule_events
     WHERE schedule_id = ?
     ORDER BY schedule_revision, created_at_ms, id`,
    [input.scheduleId],
  );
  return Object.freeze({
    scheduleId: input.scheduleId,
    planId: aggregate.plan_id,
    scheduleRevision: aggregate.schedule_revision,
    planRevision: aggregate.plan_revision,
    version,
    state: Object.freeze({
      version: 1,
      revision: aggregate.schedule_revision,
      timeZone: parseStoredTimeZone(version.timeZone),
      lastDeviceTimeZoneDecision: latestTimeZoneDecision(rows),
    }),
  });
}

function unwrapScheduleError(error: unknown): never {
  const cause = (error as { cause?: unknown })?.cause;
  if (cause instanceof ScheduleRepositoryError) {
    throw cause;
  }
  throw error;
}

export function createScheduleRepository(
  kernel: SqliteKernel,
  observer: ScheduleRepositoryTestObserver = {},
): ScheduleRepository {
  return Object.freeze({
    async readCommandResult(input) {
      const receipt = await readReceipt(kernel, input.requestId);
      return receipt === null
        ? null
        : replayResult(receipt, input.requestSha256);
    },
    async saveVersion(input) {
      try {
        return await kernel.write((transaction) =>
          saveVersionTransaction(transaction, input, observer)
        );
      } catch (error) {
        return unwrapScheduleError(error);
      }
    },
    async activateSchedule(input) {
      try {
        return await kernel.write((transaction) =>
          activateScheduleTransaction(transaction, input, observer)
        );
      } catch (error) {
        return unwrapScheduleError(error);
      }
    },
    readEffectiveOpportunity: (input) =>
      readEffectiveOpportunity(kernel, input),
    readActionState: (input) => readActionState(kernel, input),
    readDateOverride: (input) => readDateOverride(kernel, input),
    readTimeZoneState: (input) => readTimeZoneState(kernel, input),
    async setDateOverride(input) {
      try {
        return await kernel.write((transaction) =>
          setOverrideTransaction(transaction, input)
        );
      } catch (error) {
        return unwrapScheduleError(error);
      }
    },
    async consumeDateOverride(input) {
      try {
        return await kernel.write((transaction) =>
          consumeOverrideTransaction(transaction, input)
        );
      } catch (error) {
        return unwrapScheduleError(error);
      }
    },
    async applyOpportunityAction(input) {
      try {
        return await kernel.write((transaction) =>
          applyOpportunityTransaction(transaction, input)
        );
      } catch (error) {
        return unwrapScheduleError(error);
      }
    },
    async changeTimeZone(input) {
      try {
        return await kernel.write((transaction) =>
          changeTimeZoneTransaction(transaction, input, observer)
        );
      } catch (error) {
        return unwrapScheduleError(error);
      }
    },
  });
}
