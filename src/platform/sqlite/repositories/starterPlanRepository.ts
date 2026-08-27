import type {
  AcceptedScheduleBinding,
  AcceptedStarterOccurrence,
  AcceptedStarterPlanActivation,
  AcceptedStarterPlanCopy,
  AcceptedStarterPlanCopyRepositoryInput,
  AcceptedStarterPlanRepository,
  AcceptedStarterPlanRepositoryInput,
  AcceptedStarterTemplate,
  StarterPlanCopyChoice,
} from "../../../domains/plans/activateStarterPlan";
import type {
  InitialScheduleActivation,
} from "../../../domains/scheduling";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

export type StarterPlanRepositoryErrorCode =
  | "starter_active_workout_blocked"
  | "starter_copy_choice_invalid"
  | "starter_copy_choice_required"
  | "starter_owned_copy_revision_conflict"
  | "starter_reference_invalid"
  | "starter_request_identity_conflict"
  | "starter_schedule_revision_conflict"
  | "starter_source_conflict"
  | "starter_update_source_invalid";

export class StarterPlanRepositoryError extends Error {
  readonly kind = "conflict" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-ACTIVATE03" as const;

  constructor(readonly code: StarterPlanRepositoryErrorCode) {
    super(code);
    this.name = "StarterPlanRepositoryError";
  }
}

export type StarterPlanRepositoryTestObserver = Readonly<{
  afterPlanDay?(sourceDayId: string): void;
}>;

type ActivationOutcome =
  | Readonly<{
      kind: "conflict";
      code: StarterPlanRepositoryErrorCode;
    }>
  | Readonly<{
      kind: "result";
      result: AcceptedStarterPlanActivation;
    }>;

type CopyOutcome =
  | Readonly<{
      kind: "conflict";
      code: StarterPlanRepositoryErrorCode;
    }>
  | Readonly<{
      kind: "result";
      result: AcceptedStarterPlanCopy;
    }>;

type ActivationReceiptRow = Readonly<{
  request_sha256: string;
  result_json: string;
}>;

type CopyReceiptRow = Readonly<{
  request_sha256: string;
  result_json: string;
}>;

type ActiveScheduleRow = Readonly<{
  schedule_id: string | null;
  schedule_revision: number | null;
  plan_id: string;
  plan_revision: number;
  plan_is_active: number;
}>;

type OwnedCopyRow = Readonly<{
  plan_id: string;
  plan_revision: number;
  schedule_id: string;
  schedule_revision: number;
}>;

type ExerciseReferenceRow = Readonly<{
  exercise_id: string;
  origin: "bundled" | "custom" | "copied";
  availability: "available" | "unavailable";
  metric_profile: string;
  metric_contract_version: number;
  exercise_metric_generation: number;
}>;

type OwnedDayRow = Readonly<{
  id: string;
  source_day_id: string;
  name: string;
  ordinal: number;
  occurrence_count: number;
}>;

type ScheduleVersionRow = Readonly<{
  id: string;
  version_number: number;
  effective_local_date: string;
  mode: "weekday" | "rotation";
  timezone: string;
}>;

type ScheduleBindingRow = Readonly<{
  plan_day_id: string;
  source_day_id: string;
  ordinal: number;
  week_index: number | null;
  weekday: AcceptedScheduleBinding extends { weekday: infer Value }
    ? Value | null
    : string | null;
}>;

function id(prefix: string, requestSha256: string, suffix?: string): string {
  return suffix === undefined
    ? `${prefix}:${requestSha256}`
    : `${prefix}:${requestSha256}:${suffix}`;
}

function targetWithoutPlannedSets(
  occurrence: AcceptedStarterOccurrence,
): Record<string, unknown> {
  const { plannedSets: _plannedSets, ...target } = occurrence.target;
  return target;
}

function unitJson(occurrence: AcceptedStarterOccurrence): string {
  const unitsByProfile = {
    load_reps: { version: 1, load: "grams", count: "repetitions" },
    bodyweight_reps: { version: 1, count: "repetitions" },
    added_load_reps: {
      version: 1,
      addedLoad: "grams",
      count: "repetitions",
    },
    assisted_reps: {
      version: 1,
      assistance: "grams",
      count: "repetitions",
    },
    timed_hold: occurrence.metricIdentity.contractVersion === 1
      ? { version: 1, duration: "seconds" }
      : { version: 2, duration: "milliseconds" },
    fixed_distance: { version: 1, distance: "meters" },
    fixed_time: { version: 1, duration: "milliseconds" },
    intervals: {
      version: 1,
      rounds: "count",
      duration: "milliseconds",
    },
    unscored: { version: 1, completion: "boolean" },
  } as const;
  return JSON.stringify(unitsByProfile[occurrence.metricIdentity.profile]);
}

function policyJson(occurrence: AcceptedStarterOccurrence): string {
  return JSON.stringify({
    kind: occurrence.policy.kind,
    id: occurrence.policy.id,
    version: occurrence.policy.version,
    decisionRule: occurrence.policy.decisionRule,
  });
}

async function readReceipt(
  transaction: SqliteTransactionExecutor,
  requestId: string,
): Promise<ActivationReceiptRow | undefined> {
  const [row] = await transaction.queryAll<ActivationReceiptRow>(
    `SELECT request_sha256, result_json
     FROM starter_plan_activation_requests
     WHERE request_id = ?`,
    [requestId],
  );
  return row;
}

function parseCommittedResult(value: string): AcceptedStarterPlanActivation {
  const parsed = JSON.parse(value) as AcceptedStarterPlanActivation;
  if (
    parsed.outcome !== "committed"
    || parsed.plan.isActive !== true
    || parsed.schedule.lifecycle !== "active"
  ) {
    throw new Error("starter_activation_receipt_invalid");
  }
  return parsed;
}

function parseCommittedCopy(value: string): AcceptedStarterPlanCopy {
  const parsed = JSON.parse(value) as AcceptedStarterPlanCopy;
  if (
    parsed.outcome !== "committed"
    || parsed.plan.isActive !== false
    || parsed.schedule.lifecycle !== "inactive"
  ) {
    throw new Error("starter_copy_receipt_invalid");
  }
  return parsed;
}

async function readCopyReceipt(
  transaction: SqliteTransactionExecutor,
  requestId: string,
): Promise<CopyReceiptRow | undefined> {
  const [row] = await transaction.queryAll<CopyReceiptRow>(
    `SELECT request_sha256, result_json
     FROM owned_plan_mutation_requests
     WHERE request_id = ?`,
    [requestId],
  );
  return row;
}

async function readActiveSchedule(
  transaction: SqliteTransactionExecutor,
): Promise<ActiveScheduleRow | undefined> {
  const activePlans = await transaction.queryAll<ActiveScheduleRow>(
    `SELECT schedule.id AS schedule_id,
            schedule.revision AS schedule_revision,
            plan.id AS plan_id,
            plan.revision AS plan_revision,
            plan.is_active AS plan_is_active
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
    throw new Error("starter_active_schedule_state_invalid");
  }
  const activePlan = activePlans[0];
  const activeSchedule = activeSchedules[0];
  if (
    activeSchedule !== undefined
    && (
      activePlan === undefined
      || activePlan.plan_id !== activeSchedule.plan_id
      || activePlan.schedule_id !== activeSchedule.schedule_id
    )
  ) {
    throw new Error("starter_active_schedule_state_invalid");
  }
  return activePlan;
}

async function readCopies(
  transaction: SqliteTransactionExecutor,
  input: AcceptedStarterPlanRepositoryInput,
): Promise<readonly OwnedCopyRow[]> {
  return transaction.queryAll<OwnedCopyRow>(
    `SELECT plan.id AS plan_id,
            plan.revision AS plan_revision,
            schedule.id AS schedule_id,
            schedule.revision AS schedule_revision
     FROM owned_plan_starter_sources source
     JOIN plans plan ON plan.id = source.plan_id
     JOIN owned_plan_schedules schedule ON schedule.plan_id = plan.id
     WHERE source.source_namespace = ?
       AND source.template_id = ?
       AND source.source_revision = ?
     ORDER BY plan.id`,
    [input.pack.namespace, input.template.id, input.template.revision],
  );
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

function expectedActiveRevisionMatches(
  active: ActiveScheduleRow | undefined,
  expectedRevision: number | null,
): boolean {
  return active === undefined
    ? expectedRevision === null
    : active.schedule_revision === null
      ? expectedRevision === null && active.plan_is_active === 1
      : expectedRevision === active.schedule_revision
        && active.plan_is_active === 1;
}

function classifyChoice(
  copies: readonly OwnedCopyRow[],
  choice: StarterPlanCopyChoice | null,
): StarterPlanRepositoryErrorCode | null {
  if (copies.length === 0) {
    return choice === null ? null : "starter_copy_choice_invalid";
  }
  if (choice === null) {
    return "starter_copy_choice_required";
  }
  if (choice.type === "create_another") {
    return null;
  }
  const selected = copies.find(({ plan_id: planId }) =>
    planId === choice.planId
  );
  if (selected === undefined) {
    return "starter_copy_choice_invalid";
  }
  return selected.plan_revision === choice.expectedPlanRevision
      && selected.schedule_revision === choice.expectedScheduleRevision
    ? null
    : "starter_owned_copy_revision_conflict";
}

async function validateExerciseReferences(
  transaction: SqliteTransactionExecutor,
  template: AcceptedStarterTemplate,
): Promise<StarterPlanRepositoryErrorCode | null> {
  const occurrences = template.days.flatMap(({ exercises }) => exercises);
  const exerciseIds = [...new Set(occurrences.map(({ exerciseId }) => exerciseId))]
    .sort();
  const placeholders = exerciseIds.map(() => "?").join(", ");
  const rows = await transaction.queryAll<ExerciseReferenceRow>(
    `SELECT exercise_id, origin, availability, metric_profile,
            metric_contract_version, exercise_metric_generation
     FROM exercise_library_entries
     WHERE exercise_id IN (${placeholders})
     ORDER BY exercise_id`,
    exerciseIds,
  );
  const byId = new Map(rows.map((row) => [row.exercise_id, row]));
  for (const occurrence of occurrences) {
    const row = byId.get(occurrence.exerciseId);
    if (
      row === undefined
      || row.origin !== "bundled"
      || row.availability !== "available"
      || row.metric_profile !== occurrence.catalogMetricIdentity.profile
      || row.metric_contract_version
        !== occurrence.catalogMetricIdentity.contractVersion
      || row.exercise_metric_generation
        !== occurrence.catalogMetricIdentity.exerciseMetricGeneration
    ) {
      return "starter_reference_invalid";
    }
  }
  return null;
}

async function validateSource(
  transaction: SqliteTransactionExecutor,
  input: AcceptedStarterPlanRepositoryInput,
): Promise<StarterPlanRepositoryErrorCode | null> {
  const [source] = await transaction.queryAll<{
    asset_sha256: string;
    template_json: string;
  }>(
    `SELECT asset_sha256, template_json
     FROM starter_plan_sources
     WHERE source_namespace = ?
       AND template_id = ?
       AND source_revision = ?`,
    [input.pack.namespace, input.template.id, input.template.revision],
  );
  if (source === undefined) {
    return null;
  }
  return source.asset_sha256 === input.assetSha256
      && source.template_json === input.template.sourceJson
    ? null
    : "starter_source_conflict";
}

async function validateUpdateSource(
  transaction: SqliteTransactionExecutor,
  input: AcceptedStarterPlanCopyRepositoryInput,
): Promise<StarterPlanRepositoryErrorCode | null> {
  const [source] = await transaction.queryAll<{
    origin: string;
    source_namespace: string | null;
    upstream_id: string | null;
    revision: number;
    source_revision: number | null;
  }>(
    `SELECT plan.origin,
            plan.source_namespace,
            plan.upstream_id,
            plan.revision,
            accepted.source_revision
     FROM plans plan
     LEFT JOIN owned_plan_starter_sources accepted
       ON accepted.plan_id = plan.id
     WHERE plan.id = ?`,
    [input.sourceOwnedPlanId],
  );
  return source !== undefined
      && source.origin === "copied"
      && source.upstream_id === input.template.id
      && source.revision === input.expectedSourcePlanRevision
      && (
        (
          source.source_namespace === "gym-tracker.original"
          && input.template.revision > 1
        )
        || (
          source.source_namespace === input.pack.namespace
          && source.source_revision !== null
          && source.source_revision < input.template.revision
        )
      )
    ? null
    : "starter_update_source_invalid";
}

async function insertSource(
  transaction: SqliteTransactionExecutor,
  input: AcceptedStarterPlanRepositoryInput,
): Promise<void> {
  await transaction.execute(
    `INSERT INTO starter_plan_sources
      (source_namespace, template_id, source_revision, asset_sha256,
       display_name, template_json, accepted_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_namespace, template_id, source_revision) DO NOTHING`,
    [
      input.pack.namespace,
      input.template.id,
      input.template.revision,
      input.assetSha256,
      input.template.displayName,
      input.template.sourceJson,
      input.pack.acceptedAtMs,
    ],
  );
}

async function insertOwnedAggregateState(
  transaction: SqliteTransactionExecutor,
  planId: string,
  createdAtMs: number,
): Promise<void> {
  const [table] = await transaction.queryAll<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM sqlite_master
     WHERE type = 'table'
       AND name = 'owned_plan_aggregate_states'`,
  );
  if (table?.count !== 1) {
    return;
  }
  await transaction.execute(
    `INSERT INTO owned_plan_aggregate_states
      (plan_id, lifecycle, graph_status, missing_requirement_code,
       missing_requirement, created_at_ms, updated_at_ms, archived_at_ms)
     VALUES (?, 'ready', 'valid', NULL, NULL, ?, ?, NULL)`,
    [planId, createdAtMs, createdAtMs],
  );
}

async function deactivateCurrent(
  transaction: SqliteTransactionExecutor,
  active: ActiveScheduleRow | undefined,
  selectedPlanId: string | null,
  activatedAtMs: number,
): Promise<void> {
  if (active === undefined || active.plan_id === selectedPlanId) {
    return;
  }
  const plan = await transaction.execute(
    `UPDATE plans
     SET is_active = 0, revision = revision + 1
     WHERE id = ? AND is_active = 1`,
    [active.plan_id],
  );
  const schedule = active.schedule_id === null
    ? null
    : await transaction.execute(
      `UPDATE owned_plan_schedules
       SET lifecycle = 'inactive',
           revision = revision + 1,
           deactivated_at_ms = ?
       WHERE id = ? AND lifecycle = 'active'`,
      [activatedAtMs, active.schedule_id],
    );
  void plan;
  void schedule;
}

async function insertOwnedOccurrence(
  transaction: SqliteTransactionExecutor,
  input: Readonly<{
    requestSha256: string;
    dayId: string;
    sourceDayId: string;
    occurrence: AcceptedStarterOccurrence;
  }>,
): Promise<void> {
  const occurrenceId = id(
    "owned-occurrence",
    input.requestSha256,
    input.occurrence.id,
  );
  await transaction.execute(
    `INSERT INTO owned_plan_day_exercises
      (id, plan_day_id, exercise_id, ordinal,
       between_exercise_rest_seconds, metric_profile,
       metric_contract_version, exercise_metric_generation, revision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      occurrenceId,
      input.dayId,
      input.occurrence.exerciseId,
      input.occurrence.ordinal - 1,
      input.occurrence.restSeconds,
      input.occurrence.metricIdentity.profile,
      input.occurrence.metricIdentity.contractVersion,
      input.occurrence.metricIdentity.exerciseMetricGeneration,
    ],
  );
  await transaction.execute(
    `INSERT INTO owned_plan_occurrence_sources
      (plan_day_exercise_id, plan_day_id, source_occurrence_id,
       source_exercise_id, source_ordinal, catalog_metric_profile,
       catalog_metric_contract_version,
       catalog_exercise_metric_generation, metric_override_json,
       content_rationale)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      occurrenceId,
      input.dayId,
      input.occurrence.id,
      input.occurrence.exerciseId,
      input.occurrence.ordinal,
      input.occurrence.catalogMetricIdentity.profile,
      input.occurrence.catalogMetricIdentity.contractVersion,
      input.occurrence.catalogMetricIdentity.exerciseMetricGeneration,
      input.occurrence.metricOverride === null
        ? null
        : JSON.stringify(input.occurrence.metricOverride),
      input.occurrence.contentRationale,
    ],
  );
  for (const [index, warmup] of input.occurrence.warmups.entries()) {
    await transaction.execute(
      `INSERT INTO owned_plan_warmup_sets
        (id, plan_day_exercise_id, ordinal, load_grams, reps, revision)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [
        id(
          "owned-warmup",
          input.requestSha256,
          `${input.occurrence.id}:${warmup.ordinal}`,
        ),
        occurrenceId,
        index,
        warmup.loadGrams,
        warmup.reps,
      ],
    );
  }
  const targetJson = JSON.stringify(targetWithoutPlannedSets(input.occurrence));
  for (
    let ordinal = 0;
    ordinal < input.occurrence.target.plannedSets;
    ordinal += 1
  ) {
    await transaction.execute(
      `INSERT INTO owned_plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, target_json, unit_json,
         metric_profile, metric_contract_version,
         exercise_metric_generation, revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        id(
          "owned-target",
          input.requestSha256,
          `${input.occurrence.id}:${ordinal}`,
        ),
        occurrenceId,
        ordinal,
        targetJson,
        unitJson(input.occurrence),
        input.occurrence.metricIdentity.profile,
        input.occurrence.metricIdentity.contractVersion,
        input.occurrence.metricIdentity.exerciseMetricGeneration,
      ],
    );
  }
  await transaction.execute(
    `INSERT INTO owned_plan_progression_policies
      (id, plan_day_exercise_id, policy_kind, policy_id, policy_version,
       rule_json, metric_profile, metric_contract_version,
       exercise_metric_generation, status, revision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1)`,
    [
      id(
        "owned-policy",
        input.requestSha256,
        input.occurrence.id,
      ),
      occurrenceId,
      input.occurrence.policy.kind,
      input.occurrence.policy.id,
      input.occurrence.policy.version,
      policyJson(input.occurrence),
      input.occurrence.metricIdentity.profile,
      input.occurrence.metricIdentity.contractVersion,
      input.occurrence.metricIdentity.exerciseMetricGeneration,
    ],
  );
}

async function clonePlan(
  transaction: SqliteTransactionExecutor,
  input: AcceptedStarterPlanRepositoryInput,
  observer: StarterPlanRepositoryTestObserver,
  active = true,
): Promise<Readonly<{
  planId: string;
  planRevision: number;
  days: AcceptedStarterPlanActivation["days"];
}>> {
  const planId = id("owned-plan", input.requestSha256);
  await transaction.execute(
    `INSERT INTO plans
      (id, content_pack_id, origin, source_namespace, upstream_id, name,
       days_per_week, audience, goal, estimate_minutes, attribution,
       is_active, revision)
     VALUES (?, NULL, 'copied', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      planId,
      input.pack.namespace,
      input.template.id,
      input.template.displayName,
      input.template.daysPerWeek,
      input.template.audience,
      input.template.goal,
      input.template.estimatedDurationMinutes,
      input.template.sourceNotes.map(({ text }) => text).join(" "),
      active ? 1 : 0,
    ],
  );
  const occurrenceCount = input.template.days.reduce(
    (count, day) => count + day.exercises.length,
    0,
  );
  await transaction.execute(
    `INSERT INTO owned_plan_starter_sources
      (plan_id, source_namespace, template_id, source_revision,
       asset_sha256, cloned_day_count, cloned_occurrence_count, cloned_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      planId,
      input.pack.namespace,
      input.template.id,
      input.template.revision,
      input.assetSha256,
      input.template.days.length,
      occurrenceCount,
      input.activatedAtMs,
    ],
  );

  const days: AcceptedStarterPlanActivation["days"][number][] = [];
  for (const day of input.template.days) {
    const dayId = id("owned-day", input.requestSha256, day.id);
    await transaction.execute(
      `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
       VALUES (?, ?, ?, ?, 1)`,
      [dayId, planId, day.ordinal - 1, day.displayName],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_day_sources
        (plan_day_id, plan_id, source_day_id, source_ordinal)
       VALUES (?, ?, ?, ?)`,
      [dayId, planId, day.id, day.ordinal],
    );
    for (const occurrence of day.exercises) {
      await insertOwnedOccurrence(transaction, {
        requestSha256: input.requestSha256,
        dayId,
        sourceDayId: day.id,
        occurrence,
      });
    }
    observer.afterPlanDay?.(day.id);
    days.push({
      id: dayId,
      sourceDayId: day.id,
      name: day.displayName,
      ordinal: day.ordinal - 1,
      occurrenceCount: day.exercises.length,
    });
  }
  await insertOwnedAggregateState(
    transaction,
    planId,
    input.activatedAtMs,
  );
  return { planId, planRevision: 1, days };
}

async function createInactiveSchedule(
  transaction: SqliteTransactionExecutor,
  input: AcceptedStarterPlanRepositoryInput,
  planId: string,
  days: AcceptedStarterPlanActivation["days"],
): Promise<AcceptedStarterPlanCopy["schedule"]> {
  const scheduleId = id("owned-schedule", input.requestSha256);
  await transaction.execute(
    `INSERT INTO owned_plan_schedules
      (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms)
     VALUES (?, ?, 'inactive', 1, ?, ?)`,
    [
      scheduleId,
      planId,
      input.activatedAtMs,
      input.activatedAtMs,
    ],
  );
  const version = await insertScheduleVersion(transaction, {
    requestSha256: input.requestSha256,
    scheduleId,
    versionNumber: 1,
    schedule: input.schedule,
    dayIdsBySource: new Map(
      days.map(({ sourceDayId, id: dayId }) => [sourceDayId, dayId]),
    ),
    activatedAtMs: input.activatedAtMs,
  });
  return {
    id: scheduleId,
    lifecycle: "inactive",
    revision: 1,
    version: {
      id: version.row.id,
      versionNumber: version.row.version_number,
      effectiveLocalDate: version.row.effective_local_date,
      mode: version.row.mode,
      timeZone: version.row.timezone,
      bindings: version.bindings,
    },
  };
}

async function readOwnedDays(
  transaction: SqliteTransactionExecutor,
  planId: string,
): Promise<AcceptedStarterPlanActivation["days"]> {
  const rows = await transaction.queryAll<OwnedDayRow>(
    `SELECT day.id,
            source.source_day_id,
            day.name,
            day.ordinal,
            COUNT(occurrence.id) AS occurrence_count
     FROM plan_days day
     JOIN owned_plan_day_sources source ON source.plan_day_id = day.id
     JOIN owned_plan_day_exercises occurrence
       ON occurrence.plan_day_id = day.id
     WHERE day.plan_id = ?
     GROUP BY day.id, source.source_day_id, day.name, day.ordinal
     ORDER BY day.ordinal`,
    [planId],
  );
  return rows.map((row) => ({
    id: row.id,
    sourceDayId: row.source_day_id,
    name: row.name,
    ordinal: row.ordinal,
    occurrenceCount: row.occurrence_count,
  }));
}

async function nextScheduleVersion(
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

async function insertScheduleVersion(
  transaction: SqliteTransactionExecutor,
  input: Readonly<{
    requestSha256: string;
    scheduleId: string;
    versionNumber: number;
    schedule: InitialScheduleActivation;
    dayIdsBySource: ReadonlyMap<string, string>;
    activatedAtMs: number;
  }>,
): Promise<Readonly<{
  row: ScheduleVersionRow;
  bindings: readonly AcceptedScheduleBinding[];
}>> {
  const versionId = id(
    "owned-schedule-version",
    input.requestSha256,
    String(input.versionNumber),
  );
  await transaction.execute(
    `INSERT INTO owned_plan_schedule_versions
      (id, schedule_id, version_number, effective_local_date, mode, timezone,
       rotation_pointer, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      versionId,
      input.scheduleId,
      input.versionNumber,
      input.schedule.startLocalDate,
      input.schedule.mode,
      input.schedule.timeZone,
      input.schedule.mode === "rotation" ? 0 : null,
      input.activatedAtMs,
    ],
  );
  const bindings: AcceptedScheduleBinding[] = [];
  for (const binding of input.schedule.bindings) {
    const planDayId = input.dayIdsBySource.get(binding.planDaySourceId)!;
    const weekIndex = "weekIndex" in binding ? binding.weekIndex : null;
    const weekday = "weekday" in binding ? binding.weekday : null;
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_bindings
        (id, schedule_version_id, mode, ordinal, week_index, weekday,
         plan_day_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id(
          "owned-binding",
          input.requestSha256,
          `${input.versionNumber}:${binding.ordinal}`,
        ),
        versionId,
        input.schedule.mode,
        binding.ordinal,
        weekIndex,
        weekday,
        planDayId,
      ],
    );
    bindings.push(
      input.schedule.mode === "weekday"
        ? {
            planDayId,
            sourcePlanDayId: binding.planDaySourceId,
            ordinal: binding.ordinal,
            weekIndex: weekIndex!,
            weekday: weekday!,
          }
        : {
            planDayId,
            sourcePlanDayId: binding.planDaySourceId,
            ordinal: binding.ordinal,
          },
    );
  }
  return {
    row: {
      id: versionId,
      version_number: input.versionNumber,
      effective_local_date: input.schedule.startLocalDate,
      mode: input.schedule.mode,
      timezone: input.schedule.timeZone,
    },
    bindings,
  };
}

async function createSchedule(
  transaction: SqliteTransactionExecutor,
  input: AcceptedStarterPlanRepositoryInput,
  planId: string,
  days: AcceptedStarterPlanActivation["days"],
): Promise<AcceptedStarterPlanActivation["schedule"]> {
  const scheduleId = id("owned-schedule", input.requestSha256);
  await transaction.execute(
    `INSERT INTO owned_plan_schedules
      (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms)
     VALUES (?, ?, 'active', 1, ?, NULL)`,
    [scheduleId, planId, input.activatedAtMs],
  );
  const dayIdsBySource = new Map(
    days.map(({ sourceDayId, id: dayId }) => [sourceDayId, dayId]),
  );
  const version = await insertScheduleVersion(transaction, {
    requestSha256: input.requestSha256,
    scheduleId,
    versionNumber: 1,
    schedule: input.schedule,
    dayIdsBySource,
    activatedAtMs: input.activatedAtMs,
  });
  return {
    id: scheduleId,
    lifecycle: "active",
    revision: 1,
    version: {
      id: version.row.id,
      versionNumber: version.row.version_number,
      effectiveLocalDate: version.row.effective_local_date,
      mode: version.row.mode,
      timeZone: version.row.timezone,
      bindings: version.bindings,
    },
  };
}

async function reactivatePlan(
  transaction: SqliteTransactionExecutor,
  input: AcceptedStarterPlanRepositoryInput,
  choice: Extract<StarterPlanCopyChoice, { type: "reactivate_existing" }>,
): Promise<Readonly<{
  planId: string;
  planRevision: number;
  days: AcceptedStarterPlanActivation["days"];
  schedule: AcceptedStarterPlanActivation["schedule"];
}>> {
  const [scheduleRow] = await transaction.queryAll<{
    id: string;
    revision: number;
  }>(
    `SELECT id, revision
     FROM owned_plan_schedules
     WHERE plan_id = ?`,
    [choice.planId],
  );
  const planUpdate = await transaction.execute(
    `UPDATE plans
     SET is_active = 1, revision = revision + 1
     WHERE id = ? AND revision = ?`,
    [choice.planId, choice.expectedPlanRevision],
  );
  const scheduleUpdate = await transaction.execute(
    `UPDATE owned_plan_schedules
     SET lifecycle = 'active',
         revision = revision + 1,
         activated_at_ms = ?,
         deactivated_at_ms = NULL
     WHERE id = ? AND revision = ?`,
    [
      input.activatedAtMs,
      scheduleRow!.id,
      choice.expectedScheduleRevision,
    ],
  );
  void planUpdate;
  void scheduleUpdate;
  const days = await readOwnedDays(transaction, choice.planId);
  const versionNumber = await nextScheduleVersion(
    transaction,
    scheduleRow!.id,
  );
  const version = await insertScheduleVersion(transaction, {
    requestSha256: input.requestSha256,
    scheduleId: scheduleRow!.id,
    versionNumber,
    schedule: input.schedule,
    dayIdsBySource: new Map(
      days.map(({ sourceDayId, id: dayId }) => [sourceDayId, dayId]),
    ),
    activatedAtMs: input.activatedAtMs,
  });
  return {
    planId: choice.planId,
    planRevision: choice.expectedPlanRevision + 1,
    days,
    schedule: {
      id: scheduleRow!.id,
      lifecycle: "active",
      revision: choice.expectedScheduleRevision + 1,
      version: {
        id: version.row.id,
        versionNumber: version.row.version_number,
        effectiveLocalDate: version.row.effective_local_date,
        mode: version.row.mode,
        timeZone: version.row.timezone,
        bindings: version.bindings,
      },
    },
  };
}

async function appendActivationEvent(
  transaction: SqliteTransactionExecutor,
  input: AcceptedStarterPlanRepositoryInput,
  result: AcceptedStarterPlanActivation,
  eventType: "starter_activated" | "starter_reactivated",
): Promise<void> {
  await transaction.execute(
    `INSERT INTO owned_plan_schedule_events
      (id, schedule_id, event_type, local_date, payload_json,
       schedule_revision, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id("owned-event", input.requestSha256),
      result.schedule.id,
      eventType,
      input.schedule.startLocalDate,
      JSON.stringify({
        requestId: input.requestId,
        templateId: input.template.id,
        sourceRevision: input.template.revision,
        planId: result.plan.id,
      }),
      result.schedule.revision,
      input.activatedAtMs,
    ],
  );
}

async function insertReceipt(
  transaction: SqliteTransactionExecutor,
  input: AcceptedStarterPlanRepositoryInput,
  result: AcceptedStarterPlanActivation,
): Promise<void> {
  const choice = input.copyChoice?.type ?? "initial";
  const selectedPlanId = input.copyChoice?.type === "reactivate_existing"
    ? input.copyChoice.planId
    : null;
  await transaction.execute(
    `INSERT INTO starter_plan_activation_requests
      (request_id, request_sha256, source_namespace, template_id,
       source_revision, expected_active_schedule_revision, choice,
       selected_plan_id, result_plan_id, result_schedule_id, result_json,
       committed_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.requestId,
      input.requestSha256,
      input.pack.namespace,
      input.template.id,
      input.template.revision,
      input.expectedActiveScheduleRevision,
      choice,
      selectedPlanId,
      result.plan.id,
      result.schedule.id,
      JSON.stringify(result),
      input.activatedAtMs,
    ],
  );
}

function committedResult(
  input: AcceptedStarterPlanRepositoryInput,
  plan: Readonly<{
    id: string;
    revision: number;
  }>,
  days: AcceptedStarterPlanActivation["days"],
  schedule: AcceptedStarterPlanActivation["schedule"],
): AcceptedStarterPlanActivation {
  return {
    outcome: "committed",
    plan: {
      id: plan.id,
      name: input.template.displayName,
      sourceTemplateId: input.template.id,
      sourceRevision: input.template.revision,
      isActive: true,
      revision: plan.revision,
    },
    days,
    schedule,
    invalidationScopes: [
      { scope: "library-plans" },
      { scope: "plan-detail", planId: plan.id },
      { scope: "today" },
    ],
  };
}

function committedCopyResult(
  input: AcceptedStarterPlanCopyRepositoryInput,
  plan: Readonly<{
    id: string;
    revision: number;
  }>,
  days: AcceptedStarterPlanCopy["days"],
  schedule: AcceptedStarterPlanCopy["schedule"],
): AcceptedStarterPlanCopy {
  return {
    outcome: "committed",
    sourceOwnedPlanId: input.sourceOwnedPlanId,
    plan: {
      id: plan.id,
      name: input.template.displayName,
      sourceTemplateId: input.template.id,
      sourceRevision: input.template.revision,
      isActive: false,
      revision: plan.revision,
    },
    days,
    schedule,
    invalidationScopes: [
      { scope: "library-plans" },
      { scope: "plan-detail", planId: plan.id },
    ],
  };
}

async function insertCopyReceipt(
  transaction: SqliteTransactionExecutor,
  input: AcceptedStarterPlanCopyRepositoryInput,
  result: AcceptedStarterPlanCopy,
): Promise<void> {
  await transaction.execute(
    `INSERT INTO owned_plan_mutation_requests
      (request_id, request_sha256, operation, source_plan_id,
       result_plan_id, expected_revision, result_revision, result_json,
       committed_at_ms)
     VALUES (?, ?, 'duplicate', ?, ?, ?, ?, ?, ?)`,
    [
      input.requestId,
      input.requestSha256,
      input.sourceOwnedPlanId,
      result.plan.id,
      input.expectedSourcePlanRevision,
      result.plan.revision,
      JSON.stringify(result),
      input.createdAtMs,
    ],
  );
}

export function createStarterPlanRepository(
  kernel: SqliteKernel,
  observer: StarterPlanRepositoryTestObserver = {},
): AcceptedStarterPlanRepository {
  return Object.freeze({
    async activateAcceptedStarterPlan(
      input: AcceptedStarterPlanRepositoryInput,
    ): Promise<AcceptedStarterPlanActivation> {
      const outcome = await kernel.write<ActivationOutcome>(
        async (transaction) => {
          const receipt = await readReceipt(transaction, input.requestId);
          if (receipt !== undefined) {
            return receipt.request_sha256 === input.requestSha256
              ? {
                  kind: "result",
                  result: parseCommittedResult(receipt.result_json),
                }
              : {
                  kind: "conflict",
                  code: "starter_request_identity_conflict",
                };
          }
          const active = await readActiveSchedule(transaction);
          if (!expectedActiveRevisionMatches(
            active,
            input.expectedActiveScheduleRevision,
          )) {
            return {
              kind: "conflict",
              code: "starter_schedule_revision_conflict",
            };
          }
          if (await hasActiveWorkout(transaction)) {
            return {
              kind: "conflict",
              code: "starter_active_workout_blocked",
            };
          }
          const copies = await readCopies(transaction, input);
          const choiceConflict = classifyChoice(copies, input.copyChoice);
          if (choiceConflict !== null) {
            return { kind: "conflict", code: choiceConflict };
          }
          const referenceConflict = await validateExerciseReferences(
            transaction,
            input.template,
          );
          if (referenceConflict !== null) {
            return { kind: "conflict", code: referenceConflict };
          }
          const sourceConflict = await validateSource(transaction, input);
          if (sourceConflict !== null) {
            return { kind: "conflict", code: sourceConflict };
          }

          const selectedPlanId =
            input.copyChoice?.type === "reactivate_existing"
              ? input.copyChoice.planId
              : null;
          await deactivateCurrent(
            transaction,
            active,
            selectedPlanId,
            input.activatedAtMs,
          );
          await insertSource(transaction, input);

          let result: AcceptedStarterPlanActivation;
          if (input.copyChoice?.type === "reactivate_existing") {
            const reactivated = await reactivatePlan(
              transaction,
              input,
              input.copyChoice,
            );
            result = committedResult(
              input,
              {
                id: reactivated.planId,
                revision: reactivated.planRevision,
              },
              reactivated.days,
              reactivated.schedule,
            );
            await appendActivationEvent(
              transaction,
              input,
              result,
              "starter_reactivated",
            );
          } else {
            const cloned = await clonePlan(transaction, input, observer);
            const schedule = await createSchedule(
              transaction,
              input,
              cloned.planId,
              cloned.days,
            );
            result = committedResult(
              input,
              { id: cloned.planId, revision: cloned.planRevision },
              cloned.days,
              schedule,
            );
            await appendActivationEvent(
              transaction,
              input,
              result,
              "starter_activated",
            );
          }
          await insertReceipt(transaction, input, result);
          return { kind: "result", result };
        },
      );
      if (outcome.kind === "conflict") {
        throw new StarterPlanRepositoryError(outcome.code);
      }
      return outcome.result;
    },

    async createAcceptedStarterPlanCopy(
      input: AcceptedStarterPlanCopyRepositoryInput,
    ): Promise<AcceptedStarterPlanCopy> {
      const outcome = await kernel.write<CopyOutcome>(
        async (transaction) => {
          const receipt = await readCopyReceipt(
            transaction,
            input.requestId,
          );
          if (receipt !== undefined) {
            return receipt.request_sha256 === input.requestSha256
              ? {
                  kind: "result",
                  result: parseCommittedCopy(receipt.result_json),
                }
              : {
                  kind: "conflict",
                  code: "starter_request_identity_conflict",
                };
          }
          const active = await readActiveSchedule(transaction);
          if (!expectedActiveRevisionMatches(
            active,
            input.expectedActiveScheduleRevision,
          )) {
            return {
              kind: "conflict",
              code: "starter_schedule_revision_conflict",
            };
          }
          const sourceConflict = await validateUpdateSource(
            transaction,
            input,
          );
          if (sourceConflict !== null) {
            return { kind: "conflict", code: sourceConflict };
          }
          const referenceConflict = await validateExerciseReferences(
            transaction,
            input.template,
          );
          if (referenceConflict !== null) {
            return { kind: "conflict", code: referenceConflict };
          }
          const acceptedSourceConflict = await validateSource(
            transaction,
            {
              ...input,
              activatedAtMs: input.createdAtMs,
              copyChoice: null,
            },
          );
          if (acceptedSourceConflict !== null) {
            return {
              kind: "conflict",
              code: acceptedSourceConflict,
            };
          }
          const copyInput: AcceptedStarterPlanRepositoryInput = {
            ...input,
            activatedAtMs: input.createdAtMs,
            copyChoice: null,
          };
          await insertSource(transaction, copyInput);
          const cloned = await clonePlan(
            transaction,
            copyInput,
            observer,
            false,
          );
          const schedule = await createInactiveSchedule(
            transaction,
            copyInput,
            cloned.planId,
            cloned.days,
          );
          const result = committedCopyResult(
            input,
            { id: cloned.planId, revision: cloned.planRevision },
            cloned.days,
            schedule,
          );
          await insertCopyReceipt(transaction, input, result);
          return { kind: "result", result };
        },
      );
      if (outcome.kind === "conflict") {
        throw new StarterPlanRepositoryError(outcome.code);
      }
      return outcome.result;
    },
  });
}
