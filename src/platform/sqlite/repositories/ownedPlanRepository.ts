import type {
  MetricIdentity,
  MetricTarget,
} from "../../../domains/metrics";
import {
  OWNED_PLAN_MISSING_VALID_TARGET_CODE,
  OWNED_PLAN_MISSING_VALID_TARGET_REASON,
} from "../migrations/0009_owned_plans";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

export type StagedOwnedPlanWarmup = Readonly<{
  id: string;
  ordinal: number;
  loadGrams: number;
  reps: number;
}>;

export type StagedOwnedPlanTarget = Readonly<{
  id: string;
  ordinal: number;
  target: MetricTarget;
  units: Readonly<Record<string, unknown>>;
}>;

export type StagedOwnedPlanPolicy = Readonly<{
  id: string;
  kind: "automatic" | "manual_hold" | "plan_authored";
  policyId: string;
  version: number;
  rule: Readonly<Record<string, unknown>>;
}>;

export type StagedOwnedPlanOccurrence = Readonly<{
  id: string;
  exerciseId: string;
  ordinal: number;
  restSeconds: number;
  metricIdentity: MetricIdentity;
  warmups: readonly StagedOwnedPlanWarmup[];
  targets: readonly StagedOwnedPlanTarget[];
  policy: StagedOwnedPlanPolicy;
}>;

export type StagedOwnedPlanDay = Readonly<{
  id: string;
  name: string;
  ordinal: number;
  occurrences: readonly StagedOwnedPlanOccurrence[];
}>;

export type StagedCreateOwnedPlanDraft = Readonly<{
  requestId: string;
  requestSha256: string;
  planId: string;
  name: string;
  dayId: string;
  dayName: string;
  createdAtMs: number;
}>;

export type StagedSaveOwnedPlan = Readonly<{
  requestId: string;
  requestSha256: string;
  planId: string;
  name: string;
  expectedRevision: number;
  savedAtMs: number;
  days: readonly StagedOwnedPlanDay[];
}>;

export type StagedDuplicateOwnedPlan = Readonly<{
  requestId: string;
  requestSha256: string;
  sourcePlanId: string;
  expectedRevision: number;
  newPlanId: string;
  name: string;
  duplicatedAtMs: number;
}>;

export type StagedSetOwnedPlanArchived = Readonly<{
  requestId: string;
  requestSha256: string;
  planId: string;
  expectedRevision: number;
  archived: boolean;
  updatedAtMs: number;
}>;

export type OwnedPlanScheduleDefaults = Readonly<{
  id: string;
  lifecycle: "active" | "inactive";
  revision: number;
  version: Readonly<{
    id: string;
    versionNumber: number;
    effectiveLocalDate: string;
    mode: "weekday" | "rotation";
    timeZone: string;
    rotationPointer: number | null;
    bindings: readonly Readonly<{
      id: string;
      ordinal: number;
      weekIndex: number | null;
      weekday: string | null;
      planDayId: string;
    }>[];
  }> | null;
}>;

export type OwnedPlanSnapshot = Readonly<{
  id: string;
  name: string;
  revision: number;
  lifecycle: "draft" | "ready" | "archived";
  graphStatus: "missing_valid_target" | "valid";
  missingRequirement: string | null;
  isActive: boolean;
  hasInProgressWorkout: boolean;
  days: readonly StagedOwnedPlanDay[];
  scheduleDefaults: OwnedPlanScheduleDefaults | null;
}>;

export type OwnedPlanCommittedResult = Readonly<{
  outcome: "committed" | "already_committed";
  operation: "create" | "save" | "duplicate" | "archive" | "restore";
  plan: OwnedPlanSnapshot;
  currentWorkoutUnaffected: boolean;
  invalidations: readonly string[];
}>;

export type OwnedPlanImpactRequiredResult = Readonly<{
  outcome: "requires_schedule_impact";
  code: "requires_schedule_impact";
  planId: string;
  expectedRevision: number;
  activeScheduleId: string | null;
  invalidations: readonly [];
}>;

export type OwnedPlanRepositoryResult =
  | OwnedPlanCommittedResult
  | OwnedPlanImpactRequiredResult;

export type OwnedPlanRepository = Readonly<{
  read(planId: string): Promise<OwnedPlanSnapshot | null>;
  createDraft(
    input: StagedCreateOwnedPlanDraft,
  ): Promise<OwnedPlanRepositoryResult>;
  save(input: StagedSaveOwnedPlan): Promise<OwnedPlanRepositoryResult>;
  duplicate(
    input: StagedDuplicateOwnedPlan,
  ): Promise<OwnedPlanRepositoryResult>;
  archive(
    input: StagedSetOwnedPlanArchived,
  ): Promise<OwnedPlanRepositoryResult>;
  restore(
    input: StagedSetOwnedPlanArchived,
  ): Promise<OwnedPlanRepositoryResult>;
}>;

export type OwnedPlanConflictCode =
  | "owned_plan_already_exists"
  | "owned_plan_idempotency_conflict"
  | "owned_plan_not_found"
  | "owned_plan_revision_conflict"
  | "owned_plan_source_invalid";

export class OwnedPlanConflictError extends Error {
  readonly kind = "conflict" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-PLAN03" as const;

  constructor(readonly code: OwnedPlanConflictCode) {
    super(code);
    this.name = "OwnedPlanConflictError";
  }
}

type QueryExecutor = Pick<SqliteKernel, "queryAll">;

async function supportsOwnedRecommendations(
  executor: QueryExecutor,
): Promise<boolean> {
  const [row] = await executor.queryAll<{ supported: 0 | 1 }>(
    `SELECT EXISTS(
       SELECT 1
       FROM sqlite_master
       WHERE type = 'table' AND name = 'owned_progression_recommendations'
     ) AS supported`,
  );
  return row?.supported === 1;
}

type ReceiptRow = Readonly<{
  request_sha256: string;
  result_json: string;
}>;

type PlanRow = Readonly<{
  id: string;
  origin: "bundled" | "custom" | "copied";
  name: string;
  days_per_week: number;
  audience: string;
  goal: string;
  estimate_minutes: number;
  attribution: string;
  is_active: number;
  revision: number;
  lifecycle: "draft" | "ready" | "archived";
  graph_status: "missing_valid_target" | "valid";
  missing_requirement: string | null;
}>;

type DayRow = Readonly<{
  id: string;
  name: string;
  ordinal: number;
}>;

type OccurrenceRow = Readonly<{
  id: string;
  plan_day_id: string;
  exercise_id: string;
  ordinal: number;
  between_exercise_rest_seconds: number;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
}>;

type WarmupRow = Readonly<{
  id: string;
  plan_day_exercise_id: string;
  ordinal: number;
  load_grams: number;
  reps: number;
}>;

type TargetRow = Readonly<{
  id: string;
  plan_day_exercise_id: string;
  ordinal: number;
  target_json: string;
  unit_json: string;
}>;

type PolicyRow = Readonly<{
  id: string;
  plan_day_exercise_id: string;
  policy_kind: StagedOwnedPlanPolicy["kind"];
  policy_id: string;
  policy_version: number;
  rule_json: string;
}>;

type ScheduleRow = Readonly<{
  id: string;
  lifecycle: "active" | "inactive";
  revision: number;
  activated_at_ms: number;
  deactivated_at_ms: number | null;
}>;

type ScheduleVersionRow = Readonly<{
  id: string;
  version_number: number;
  effective_local_date: string;
  mode: "weekday" | "rotation";
  timezone: string;
  rotation_pointer: number | null;
  created_at_ms: number;
}>;

type ScheduleBindingRow = Readonly<{
  id: string;
  ordinal: number;
  week_index: number | null;
  weekday: string | null;
  plan_day_id: string;
}>;

function invalidations(planId: string): readonly string[] {
  return Object.freeze([
    "library:plans",
    `plan:${planId}`,
  ]);
}

function parseJsonRecord(value: string): Readonly<Record<string, unknown>> {
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("owned_plan_json_invalid");
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function parseReceiptResult(value: string): OwnedPlanCommittedResult {
  const parsed = JSON.parse(value) as OwnedPlanCommittedResult;
  if (
    parsed.outcome !== "committed"
    || ![
      "create",
      "save",
      "duplicate",
      "archive",
      "restore",
    ].includes(parsed.operation)
    || typeof parsed.plan?.id !== "string"
    || !Array.isArray(parsed.invalidations)
  ) {
    throw new Error("owned_plan_receipt_invalid");
  }
  return parsed;
}

async function readReceipt(
  executor: QueryExecutor,
  requestId: string,
): Promise<ReceiptRow | undefined> {
  const [row] = await executor.queryAll<ReceiptRow>(
    `SELECT request_sha256, result_json
     FROM owned_plan_mutation_requests
     WHERE request_id = ?`,
    [requestId],
  );
  return row;
}

function replayReceipt(
  receipt: ReceiptRow | undefined,
  requestSha256: string,
): OwnedPlanCommittedResult | null {
  if (receipt === undefined) {
    return null;
  }
  if (receipt.request_sha256 !== requestSha256) {
    throw new OwnedPlanConflictError("owned_plan_idempotency_conflict");
  }
  return Object.freeze({
    ...parseReceiptResult(receipt.result_json),
    outcome: "already_committed",
  });
}

async function readPlan(
  executor: QueryExecutor,
  planId: string,
): Promise<PlanRow | undefined> {
  const [row] = await executor.queryAll<PlanRow>(
    `SELECT plan.id, plan.origin, plan.name, plan.days_per_week,
            plan.audience, plan.goal, plan.estimate_minutes,
            plan.attribution, plan.is_active, plan.revision,
            state.lifecycle, state.graph_status, state.missing_requirement
     FROM plans plan
     JOIN owned_plan_aggregate_states state ON state.plan_id = plan.id
     WHERE plan.id = ?`,
    [planId],
  );
  return row;
}

async function readDays(
  executor: QueryExecutor,
  planId: string,
  currentDayCount: number,
): Promise<readonly DayRow[]> {
  return executor.queryAll<DayRow>(
    `SELECT id, name, ordinal
     FROM plan_days
     WHERE plan_id = ? AND ordinal < ?
     ORDER BY ordinal`,
    [planId, currentDayCount],
  );
}

async function readOccurrences(
  executor: QueryExecutor,
  planId: string,
  currentDayCount: number,
): Promise<readonly OccurrenceRow[]> {
  return executor.queryAll<OccurrenceRow>(
    `SELECT occurrence.id, occurrence.plan_day_id,
            occurrence.exercise_id, occurrence.ordinal,
            occurrence.between_exercise_rest_seconds,
            occurrence.metric_profile,
            occurrence.metric_contract_version,
            occurrence.exercise_metric_generation
     FROM owned_plan_day_exercises occurrence
     JOIN plan_days day ON day.id = occurrence.plan_day_id
     WHERE day.plan_id = ? AND day.ordinal < ?
     ORDER BY day.ordinal, occurrence.ordinal`,
    [planId, currentDayCount],
  );
}

async function readWarmups(
  executor: QueryExecutor,
  planId: string,
  currentDayCount: number,
): Promise<readonly WarmupRow[]> {
  return executor.queryAll<WarmupRow>(
    `SELECT warmup.id, warmup.plan_day_exercise_id, warmup.ordinal,
            warmup.load_grams, warmup.reps
     FROM owned_plan_warmup_sets warmup
     JOIN owned_plan_day_exercises occurrence
       ON occurrence.id = warmup.plan_day_exercise_id
     JOIN plan_days day ON day.id = occurrence.plan_day_id
     WHERE day.plan_id = ? AND day.ordinal < ?
     ORDER BY day.ordinal, occurrence.ordinal, warmup.ordinal`,
    [planId, currentDayCount],
  );
}

async function readTargets(
  executor: QueryExecutor,
  planId: string,
  currentDayCount: number,
): Promise<readonly TargetRow[]> {
  return executor.queryAll<TargetRow>(
    `SELECT target.id, target.plan_day_exercise_id, target.ordinal,
            target.target_json, target.unit_json
     FROM owned_plan_working_set_targets target
     JOIN owned_plan_day_exercises occurrence
       ON occurrence.id = target.plan_day_exercise_id
     JOIN plan_days day ON day.id = occurrence.plan_day_id
     WHERE day.plan_id = ? AND day.ordinal < ?
     ORDER BY day.ordinal, occurrence.ordinal, target.ordinal`,
    [planId, currentDayCount],
  );
}

async function readPolicies(
  executor: QueryExecutor,
  planId: string,
  currentDayCount: number,
): Promise<readonly PolicyRow[]> {
  return executor.queryAll<PolicyRow>(
    `SELECT policy.id, policy.plan_day_exercise_id, policy.policy_kind,
            policy.policy_id, policy.policy_version, policy.rule_json
     FROM owned_plan_progression_policies policy
     JOIN owned_plan_day_exercises occurrence
       ON occurrence.id = policy.plan_day_exercise_id
     JOIN plan_days day ON day.id = occurrence.plan_day_id
     WHERE day.plan_id = ? AND day.ordinal < ?
     ORDER BY day.ordinal, occurrence.ordinal`,
    [planId, currentDayCount],
  );
}

async function readSchedule(
  executor: QueryExecutor,
  planId: string,
): Promise<ScheduleRow | undefined> {
  const [row] = await executor.queryAll<ScheduleRow>(
    `SELECT id, lifecycle, revision, activated_at_ms, deactivated_at_ms
     FROM owned_plan_schedules
     WHERE plan_id = ?`,
    [planId],
  );
  return row;
}

async function readLatestScheduleVersion(
  executor: QueryExecutor,
  scheduleId: string,
): Promise<ScheduleVersionRow | undefined> {
  const [row] = await executor.queryAll<ScheduleVersionRow>(
    `SELECT id, version_number, effective_local_date, mode, timezone,
            rotation_pointer, created_at_ms
     FROM owned_plan_schedule_versions
     WHERE schedule_id = ?
     ORDER BY version_number DESC
     LIMIT 1`,
    [scheduleId],
  );
  return row;
}

async function readScheduleBindings(
  executor: QueryExecutor,
  scheduleVersionId: string,
): Promise<readonly ScheduleBindingRow[]> {
  return executor.queryAll<ScheduleBindingRow>(
    `SELECT id, ordinal, week_index, weekday, plan_day_id
     FROM owned_plan_schedule_bindings
     WHERE schedule_version_id = ?
     ORDER BY ordinal`,
    [scheduleVersionId],
  );
}

async function scheduleDefaults(
  executor: QueryExecutor,
  planId: string,
): Promise<OwnedPlanScheduleDefaults | null> {
  const schedule = await readSchedule(executor, planId);
  if (schedule === undefined) {
    return null;
  }
  const version = await readLatestScheduleVersion(executor, schedule.id);
  const versionSnapshot = version === undefined
    ? null
    : Object.freeze({
        id: version.id,
        versionNumber: version.version_number,
        effectiveLocalDate: version.effective_local_date,
        mode: version.mode,
        timeZone: version.timezone,
        rotationPointer: version.rotation_pointer,
        bindings: Object.freeze(
          (await readScheduleBindings(executor, version.id)).map((binding) =>
            Object.freeze({
              id: binding.id,
              ordinal: binding.ordinal,
              weekIndex: binding.week_index,
              weekday: binding.weekday,
              planDayId: binding.plan_day_id,
            })
          ),
        ),
      });
  return Object.freeze({
    id: schedule.id,
    lifecycle: schedule.lifecycle,
    revision: schedule.revision,
    version: versionSnapshot,
  });
}

async function snapshot(
  executor: QueryExecutor,
  planId: string,
): Promise<OwnedPlanSnapshot> {
  const plan = await readPlan(executor, planId);
  const ownedPlan = plan!;
  const [
    days,
    occurrences,
    warmups,
    targets,
    policies,
    defaults,
  ] = await Promise.all([
    readDays(executor, planId, ownedPlan.days_per_week),
    readOccurrences(executor, planId, ownedPlan.days_per_week),
    readWarmups(executor, planId, ownedPlan.days_per_week),
    readTargets(executor, planId, ownedPlan.days_per_week),
    readPolicies(executor, planId, ownedPlan.days_per_week),
    scheduleDefaults(executor, planId),
  ]);
  const stagedDays = days.map((day) => {
    const dayOccurrences = occurrences
      .filter(({ plan_day_id: dayId }) => dayId === day.id)
      .map((occurrence) => {
        const policy = policies.find(
          ({ plan_day_exercise_id: occurrenceId }) =>
            occurrenceId === occurrence.id,
        );
        if (policy === undefined) {
          throw new Error("owned_plan_policy_missing");
        }
        return Object.freeze({
          id: occurrence.id,
          exerciseId: occurrence.exercise_id,
          ordinal: occurrence.ordinal,
          restSeconds: occurrence.between_exercise_rest_seconds,
          metricIdentity: Object.freeze({
            profile: occurrence.metric_profile,
            contractVersion: occurrence.metric_contract_version,
            exerciseMetricGeneration: occurrence.exercise_metric_generation,
          }),
          warmups: Object.freeze(
            warmups
              .filter(({ plan_day_exercise_id: occurrenceId }) =>
                occurrenceId === occurrence.id
              )
              .map((warmup) => Object.freeze({
                id: warmup.id,
                ordinal: warmup.ordinal,
                loadGrams: warmup.load_grams,
                reps: warmup.reps,
              })),
          ),
          targets: Object.freeze(
            targets
              .filter(({ plan_day_exercise_id: occurrenceId }) =>
                occurrenceId === occurrence.id
              )
              .map((target) => Object.freeze({
                id: target.id,
                ordinal: target.ordinal,
                target: parseJsonRecord(target.target_json) as MetricTarget,
                units: parseJsonRecord(target.unit_json),
              })),
          ),
          policy: Object.freeze({
            id: policy.id,
            kind: policy.policy_kind,
            policyId: policy.policy_id,
            version: policy.policy_version,
            rule: parseJsonRecord(policy.rule_json),
          }),
        });
      });
    return Object.freeze({
      id: day.id,
      name: day.name,
      ordinal: day.ordinal,
      occurrences: Object.freeze(dayOccurrences),
    });
  });
  return Object.freeze({
    id: ownedPlan.id,
    name: ownedPlan.name,
    revision: ownedPlan.revision,
    lifecycle: ownedPlan.lifecycle,
    graphStatus: ownedPlan.graph_status,
    missingRequirement: ownedPlan.missing_requirement,
    isActive: ownedPlan.is_active === 1,
    hasInProgressWorkout: await hasInProgressWorkout(executor, planId),
    days: Object.freeze(stagedDays),
    scheduleDefaults: defaults,
  });
}

async function hasInProgressWorkout(
  executor: QueryExecutor,
  planId: string,
): Promise<boolean> {
  const [row] = await executor.queryAll<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM workout_sessions
     WHERE plan_id = ? AND status = 'in_progress'`,
    [planId],
  );
  return row!.count > 0;
}

function committedResult(
  operation: OwnedPlanCommittedResult["operation"],
  plan: OwnedPlanSnapshot,
  currentWorkoutUnaffected: boolean,
): OwnedPlanCommittedResult {
  return Object.freeze({
    outcome: "committed",
    operation,
    plan,
    currentWorkoutUnaffected,
    invalidations: invalidations(plan.id),
  });
}

async function writeReceipt(
  transaction: SqliteTransactionExecutor,
  input: Readonly<{
    requestId: string;
    requestSha256: string;
    operation: OwnedPlanCommittedResult["operation"];
    sourcePlanId: string | null;
    resultPlanId: string;
    expectedRevision: number | null;
    result: OwnedPlanCommittedResult;
    committedAtMs: number;
  }>,
): Promise<void> {
  await transaction.execute(
    `INSERT INTO owned_plan_mutation_requests
      (request_id, request_sha256, operation, source_plan_id,
       result_plan_id, expected_revision, result_revision, result_json,
       committed_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.requestId,
      input.requestSha256,
      input.operation,
      input.sourcePlanId,
      input.resultPlanId,
      input.expectedRevision,
      input.result.plan.revision,
      JSON.stringify(input.result),
      input.committedAtMs,
    ],
  );
}

async function currentActiveSchedule(
  executor: QueryExecutor,
  planId: string,
): Promise<ScheduleRow | undefined> {
  const schedule = await readSchedule(executor, planId);
  return schedule?.lifecycle === "active" ? schedule : undefined;
}

function sameIds(
  existing: readonly string[],
  requested: readonly string[],
): boolean {
  return existing.length === requested.length
    && existing.every((value) => requested.includes(value));
}

function graphIdentifiers(
  days: readonly StagedOwnedPlanDay[],
): Readonly<{
  days: readonly string[];
  occurrences: readonly string[];
  warmups: readonly string[];
  targets: readonly string[];
  policies: readonly string[];
}> {
  return Object.freeze({
    days: Object.freeze(days.map(({ id }) => id)),
    occurrences: Object.freeze(days.flatMap((day) =>
      day.occurrences.map(({ id }) => `${day.id}:${id}`)
    )),
    warmups: Object.freeze(days.flatMap((day) =>
      day.occurrences.flatMap((occurrence) =>
        occurrence.warmups.map(({ id }) =>
          `${day.id}:${occurrence.id}:${id}`
        )
      )
    )),
    targets: Object.freeze(days.flatMap((day) =>
      day.occurrences.flatMap((occurrence) =>
        occurrence.targets.map(({ id }) =>
          `${day.id}:${occurrence.id}:${id}`
        )
      )
    )),
    policies: Object.freeze(days.flatMap((day) =>
      day.occurrences.map((occurrence) =>
        `${day.id}:${occurrence.id}:${occurrence.policy.id}`
      )
    )),
  });
}

function sameGraphIdentifiers(
  left: ReturnType<typeof graphIdentifiers>,
  right: ReturnType<typeof graphIdentifiers>,
): boolean {
  return sameIds(left.days, right.days)
    && sameIds(left.occurrences, right.occurrences)
    && sameIds(left.warmups, right.warmups)
    && sameIds(left.targets, right.targets)
    && sameIds(left.policies, right.policies);
}

async function structuralImpact(
  transaction: SqliteTransactionExecutor,
  input: StagedSaveOwnedPlan,
): Promise<boolean> {
  const existing = await snapshot(transaction, input.planId);
  const existingIdentifiers = graphIdentifiers(existing.days);
  if (existingIdentifiers.occurrences.length === 0) {
    return false;
  }
  return !sameGraphIdentifiers(
    existingIdentifiers,
    graphIdentifiers(input.days),
  );
}

async function upsertOccurrence(
  transaction: SqliteTransactionExecutor,
  dayId: string,
  occurrence: StagedOwnedPlanOccurrence,
): Promise<void> {
  await transaction.execute(
    `INSERT INTO owned_plan_day_exercises
      (id, plan_day_id, exercise_id, ordinal,
       between_exercise_rest_seconds, metric_profile,
       metric_contract_version, exercise_metric_generation, revision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET
       plan_day_id = excluded.plan_day_id,
       exercise_id = excluded.exercise_id,
       ordinal = excluded.ordinal,
       between_exercise_rest_seconds =
         excluded.between_exercise_rest_seconds,
       metric_profile = excluded.metric_profile,
       metric_contract_version = excluded.metric_contract_version,
       exercise_metric_generation = excluded.exercise_metric_generation,
       revision = owned_plan_day_exercises.revision + 1`,
    [
      occurrence.id,
      dayId,
      occurrence.exerciseId,
      occurrence.ordinal,
      occurrence.restSeconds,
      occurrence.metricIdentity.profile,
      occurrence.metricIdentity.contractVersion,
      occurrence.metricIdentity.exerciseMetricGeneration,
    ],
  );
  for (const warmup of occurrence.warmups) {
    await transaction.execute(
      `INSERT INTO owned_plan_warmup_sets
        (id, plan_day_exercise_id, ordinal, load_grams, reps, revision)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET
         plan_day_exercise_id = excluded.plan_day_exercise_id,
         ordinal = excluded.ordinal,
         load_grams = excluded.load_grams,
         reps = excluded.reps,
         revision = owned_plan_warmup_sets.revision + 1`,
      [
        warmup.id,
        occurrence.id,
        warmup.ordinal,
        warmup.loadGrams,
        warmup.reps,
      ],
    );
  }
  for (const target of occurrence.targets) {
    await transaction.execute(
      `INSERT INTO owned_plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, target_json, unit_json,
         metric_profile, metric_contract_version,
         exercise_metric_generation, revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET
         plan_day_exercise_id = excluded.plan_day_exercise_id,
         ordinal = excluded.ordinal,
         target_json = excluded.target_json,
         unit_json = excluded.unit_json,
         metric_profile = excluded.metric_profile,
         metric_contract_version = excluded.metric_contract_version,
         exercise_metric_generation = excluded.exercise_metric_generation,
         revision = owned_plan_working_set_targets.revision + 1`,
      [
        target.id,
        occurrence.id,
        target.ordinal,
        JSON.stringify(target.target),
        JSON.stringify(target.units),
        occurrence.metricIdentity.profile,
        occurrence.metricIdentity.contractVersion,
        occurrence.metricIdentity.exerciseMetricGeneration,
      ],
    );
  }
  const policy = occurrence.policy;
  await transaction.execute(
    `INSERT INTO owned_plan_progression_policies
      (id, plan_day_exercise_id, policy_kind, policy_id, policy_version,
       rule_json, metric_profile, metric_contract_version,
       exercise_metric_generation, status, revision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1)
     ON CONFLICT(plan_day_exercise_id) DO UPDATE SET
       id = excluded.id,
       policy_kind = excluded.policy_kind,
       policy_id = excluded.policy_id,
       policy_version = excluded.policy_version,
       rule_json = excluded.rule_json,
       metric_profile = excluded.metric_profile,
       metric_contract_version = excluded.metric_contract_version,
       exercise_metric_generation = excluded.exercise_metric_generation,
       status = 'active',
       revision = owned_plan_progression_policies.revision + 1`,
    [
      policy.id,
      occurrence.id,
      policy.kind,
      policy.policyId,
      policy.version,
      JSON.stringify(policy.rule),
      occurrence.metricIdentity.profile,
      occurrence.metricIdentity.contractVersion,
      occurrence.metricIdentity.exerciseMetricGeneration,
    ],
  );
}

async function freeRequestedOrdinals(
  transaction: SqliteTransactionExecutor,
  input: StagedSaveOwnedPlan,
): Promise<void> {
  for (const [dayIndex, day] of input.days.entries()) {
    await transaction.execute(
      `UPDATE plan_days
       SET ordinal = ?
       WHERE id = ? AND plan_id = ?`,
      [1_000_000 + dayIndex, day.id, input.planId],
    );
    for (const [occurrenceIndex, occurrence] of day.occurrences.entries()) {
      await transaction.execute(
        `UPDATE owned_plan_day_exercises
         SET ordinal = ?
         WHERE id = ? AND plan_day_id = ?`,
        [1_000_000 + occurrenceIndex, occurrence.id, day.id],
      );
      for (const [warmupIndex, warmup] of occurrence.warmups.entries()) {
        await transaction.execute(
          `UPDATE owned_plan_warmup_sets
           SET ordinal = ?
           WHERE id = ? AND plan_day_exercise_id = ?`,
          [1_000_000 + warmupIndex, warmup.id, occurrence.id],
        );
      }
      for (const [targetIndex, target] of occurrence.targets.entries()) {
        await transaction.execute(
          `UPDATE owned_plan_working_set_targets
           SET ordinal = ?
           WHERE id = ? AND plan_day_exercise_id = ?`,
          [1_000_000 + targetIndex, target.id, occurrence.id],
        );
      }
    }
  }
}

async function applyGraph(
  transaction: SqliteTransactionExecutor,
  input: StagedSaveOwnedPlan,
): Promise<void> {
  await freeRequestedOrdinals(transaction, input);
  for (const day of input.days) {
    await transaction.execute(
      `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET
         plan_id = excluded.plan_id,
         ordinal = excluded.ordinal,
         name = excluded.name,
         revision = plan_days.revision + 1`,
      [day.id, input.planId, day.ordinal, day.name],
    );
    for (const occurrence of day.occurrences) {
      await upsertOccurrence(transaction, day.id, occurrence);
    }
  }
}

async function createDraftTransaction(
  transaction: SqliteTransactionExecutor,
  input: StagedCreateOwnedPlanDraft,
): Promise<OwnedPlanCommittedResult> {
  if (await readPlan(transaction, input.planId) !== undefined) {
    throw new OwnedPlanConflictError("owned_plan_already_exists");
  }
  await transaction.execute(
    `INSERT INTO plans
      (id, content_pack_id, origin, source_namespace, upstream_id, name,
       days_per_week, audience, goal, estimate_minutes, attribution,
       is_active, revision)
     VALUES (?, NULL, 'custom', NULL, NULL, ?, 1, 'Owner', 'Custom', 1,
             'Owner-created', 0, 1)`,
    [input.planId, input.name],
  );
  await transaction.execute(
    `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
     VALUES (?, ?, 0, ?, 1)`,
    [input.dayId, input.planId, input.dayName],
  );
  await transaction.execute(
    `INSERT INTO owned_plan_aggregate_states
      (plan_id, lifecycle, graph_status, missing_requirement_code,
       missing_requirement, created_at_ms, updated_at_ms, archived_at_ms)
     VALUES (?, 'draft', 'missing_valid_target', ?, ?, ?, ?, NULL)`,
    [
      input.planId,
      OWNED_PLAN_MISSING_VALID_TARGET_CODE,
      OWNED_PLAN_MISSING_VALID_TARGET_REASON,
      input.createdAtMs,
      input.createdAtMs,
    ],
  );
  const result = committedResult(
    "create",
    await snapshot(transaction, input.planId),
    false,
  );
  await writeReceipt(transaction, {
    requestId: input.requestId,
    requestSha256: input.requestSha256,
    operation: "create",
    sourcePlanId: null,
    resultPlanId: input.planId,
    expectedRevision: null,
    result,
    committedAtMs: input.createdAtMs,
  });
  return result;
}

async function saveTransaction(
  transaction: SqliteTransactionExecutor,
  input: StagedSaveOwnedPlan,
): Promise<OwnedPlanRepositoryResult> {
  const plan = await readPlan(transaction, input.planId);
  if (plan === undefined || plan.origin === "bundled") {
    throw new OwnedPlanConflictError("owned_plan_not_found");
  }
  if (plan.revision !== input.expectedRevision) {
    throw new OwnedPlanConflictError("owned_plan_revision_conflict");
  }
  if (await structuralImpact(transaction, input)) {
    const activeSchedule = await currentActiveSchedule(
      transaction,
      input.planId,
    );
    return Object.freeze({
      outcome: "requires_schedule_impact",
      code: "requires_schedule_impact",
      planId: input.planId,
      expectedRevision: input.expectedRevision,
      activeScheduleId: activeSchedule?.id ?? null,
      invalidations: [] as const,
    });
  }
  if (await supportsOwnedRecommendations(transaction)) {
    await transaction.execute(
      `UPDATE owned_progression_recommendations
       SET status = 'invalidated',
           decided_at_ms = ?
       WHERE status = 'pending'
         AND EXISTS (
           SELECT 1
           FROM owned_plan_working_set_targets target
           JOIN owned_plan_day_exercises occurrence
             ON occurrence.id = target.plan_day_exercise_id
           JOIN plan_days day ON day.id = occurrence.plan_day_id
           WHERE target.id =
             owned_progression_recommendations.owned_plan_working_set_target_id
             AND day.plan_id = ?
         )`,
      [input.savedAtMs, input.planId],
    );
  }
  await applyGraph(transaction, input);
  await transaction.execute(
    `UPDATE plans
     SET name = ?, days_per_week = ?, revision = revision + 1
     WHERE id = ? AND revision = ?`,
    [
      input.name,
      input.days.length,
      input.planId,
      input.expectedRevision,
    ],
  );
  const graphValid = input.days.some(({ occurrences }) =>
    occurrences.length > 0
  );
  await transaction.execute(
    `UPDATE owned_plan_aggregate_states
     SET lifecycle = ?,
         graph_status = ?,
         missing_requirement_code = ?,
         missing_requirement = ?,
         updated_at_ms = ?,
         archived_at_ms = NULL
     WHERE plan_id = ?`,
    [
      graphValid ? "ready" : "draft",
      graphValid ? "valid" : "missing_valid_target",
      graphValid ? null : OWNED_PLAN_MISSING_VALID_TARGET_CODE,
      graphValid ? null : OWNED_PLAN_MISSING_VALID_TARGET_REASON,
      input.savedAtMs,
      input.planId,
    ],
  );
  const result = committedResult(
    "save",
    await snapshot(transaction, input.planId),
    await hasInProgressWorkout(transaction, input.planId),
  );
  await writeReceipt(transaction, {
    requestId: input.requestId,
    requestSha256: input.requestSha256,
    operation: "save",
    sourcePlanId: input.planId,
    resultPlanId: input.planId,
    expectedRevision: input.expectedRevision,
    result,
    committedAtMs: input.savedAtMs,
  });
  return result;
}

function freshId(
  newPlanId: string,
  kind: "day" | "occurrence" | "warmup" | "target" | "policy",
  ordinalPath: string,
): string {
  return `${newPlanId}:${kind}:${ordinalPath}`;
}

async function cloneSchedule(
  transaction: SqliteTransactionExecutor,
  sourcePlanId: string,
  newPlanId: string,
  dayIds: ReadonlyMap<string, string>,
  duplicatedAtMs: number,
): Promise<void> {
  const sourceSchedule = await readSchedule(transaction, sourcePlanId);
  if (sourceSchedule === undefined) {
    return;
  }
  const sourceVersion = await readLatestScheduleVersion(
    transaction,
    sourceSchedule.id,
  );
  const scheduleId = `${newPlanId}:schedule`;
  await transaction.execute(
    `INSERT INTO owned_plan_schedules
      (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms)
     VALUES (?, ?, 'inactive', 1, ?, ?)`,
    [scheduleId, newPlanId, duplicatedAtMs, duplicatedAtMs],
  );
  if (sourceVersion === undefined) {
    return;
  }
  const versionId = `${scheduleId}:version:1`;
  await transaction.execute(
    `INSERT INTO owned_plan_schedule_versions
      (id, schedule_id, version_number, effective_local_date, mode,
       timezone, rotation_pointer, created_at_ms)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
    [
      versionId,
      scheduleId,
      sourceVersion.effective_local_date,
      sourceVersion.mode,
      sourceVersion.timezone,
      sourceVersion.rotation_pointer,
      duplicatedAtMs,
    ],
  );
  const bindings = await readScheduleBindings(
    transaction,
    sourceVersion.id,
  );
  for (const binding of bindings) {
    const planDayId = dayIds.get(binding.plan_day_id);
    if (planDayId === undefined) {
      throw new Error("owned_plan_schedule_binding_invalid");
    }
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_bindings
        (id, schedule_version_id, mode, ordinal, week_index, weekday,
         plan_day_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        `${versionId}:binding:${binding.ordinal}`,
        versionId,
        sourceVersion.mode,
        binding.ordinal,
        binding.week_index,
        binding.weekday,
        planDayId,
      ],
    );
  }
}

async function duplicateTransaction(
  transaction: SqliteTransactionExecutor,
  input: StagedDuplicateOwnedPlan,
): Promise<OwnedPlanCommittedResult> {
  const source = await readPlan(transaction, input.sourcePlanId);
  if (source === undefined || source.origin === "bundled") {
    throw new OwnedPlanConflictError("owned_plan_not_found");
  }
  if (source.revision !== input.expectedRevision) {
    throw new OwnedPlanConflictError("owned_plan_revision_conflict");
  }
  if (await readPlan(transaction, input.newPlanId) !== undefined) {
    throw new OwnedPlanConflictError("owned_plan_already_exists");
  }
  const sourceSnapshot = await snapshot(transaction, input.sourcePlanId);
  await transaction.execute(
    `INSERT INTO plans
      (id, content_pack_id, origin, source_namespace, upstream_id, name,
       days_per_week, audience, goal, estimate_minutes, attribution,
       is_active, revision)
     VALUES (?, NULL, 'custom', NULL, NULL, ?, ?, ?, ?, ?, ?, 0, 1)`,
    [
      input.newPlanId,
      input.name,
      source.days_per_week,
      source.audience,
      source.goal,
      source.estimate_minutes,
      source.attribution,
    ],
  );
  const dayIds = new Map<string, string>();
  const clonedDays = sourceSnapshot.days.map((day) => {
    const dayId = freshId(
      input.newPlanId,
      "day",
      String(day.ordinal),
    );
    dayIds.set(day.id, dayId);
    return Object.freeze({
      id: dayId,
      name: day.name,
      ordinal: day.ordinal,
      occurrences: Object.freeze(day.occurrences.map((occurrence) => {
        const occurrenceId = freshId(
          input.newPlanId,
          "occurrence",
          `${day.ordinal}:${occurrence.ordinal}`,
        );
        return Object.freeze({
          ...occurrence,
          id: occurrenceId,
          warmups: Object.freeze(occurrence.warmups.map((warmup) =>
            Object.freeze({
              ...warmup,
              id: freshId(
                input.newPlanId,
                "warmup",
                `${day.ordinal}:${occurrence.ordinal}:${warmup.ordinal}`,
              ),
            })
          )),
          targets: Object.freeze(occurrence.targets.map((target) =>
            Object.freeze({
              ...target,
              id: freshId(
                input.newPlanId,
                "target",
                `${day.ordinal}:${occurrence.ordinal}:${target.ordinal}`,
              ),
            })
          )),
          policy: Object.freeze({
            ...occurrence.policy,
            id: freshId(
              input.newPlanId,
              "policy",
              `${day.ordinal}:${occurrence.ordinal}`,
            ),
          }),
        });
      })),
    });
  });
  const graphValid = clonedDays.some(({ occurrences }) =>
    occurrences.length > 0
  );
  await transaction.execute(
    `INSERT INTO owned_plan_aggregate_states
      (plan_id, lifecycle, graph_status, missing_requirement_code,
       missing_requirement, created_at_ms, updated_at_ms, archived_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      input.newPlanId,
      graphValid ? "ready" : "draft",
      graphValid ? "valid" : "missing_valid_target",
      graphValid ? null : OWNED_PLAN_MISSING_VALID_TARGET_CODE,
      graphValid ? null : OWNED_PLAN_MISSING_VALID_TARGET_REASON,
      input.duplicatedAtMs,
      input.duplicatedAtMs,
    ],
  );
  await applyGraph(transaction, {
    requestId: input.requestId,
    requestSha256: input.requestSha256,
    planId: input.newPlanId,
    name: input.name,
    expectedRevision: 1,
    savedAtMs: input.duplicatedAtMs,
    days: clonedDays,
  });
  await cloneSchedule(
    transaction,
    input.sourcePlanId,
    input.newPlanId,
    dayIds,
    input.duplicatedAtMs,
  );
  const result = committedResult(
    "duplicate",
    await snapshot(transaction, input.newPlanId),
    false,
  );
  await writeReceipt(transaction, {
    requestId: input.requestId,
    requestSha256: input.requestSha256,
    operation: "duplicate",
    sourcePlanId: input.sourcePlanId,
    resultPlanId: input.newPlanId,
    expectedRevision: input.expectedRevision,
    result,
    committedAtMs: input.duplicatedAtMs,
  });
  return result;
}

async function lifecycleTransaction(
  transaction: SqliteTransactionExecutor,
  input: StagedSetOwnedPlanArchived,
): Promise<OwnedPlanRepositoryResult> {
  const plan = await readPlan(transaction, input.planId);
  if (plan === undefined || plan.origin === "bundled") {
    throw new OwnedPlanConflictError("owned_plan_not_found");
  }
  if (plan.revision !== input.expectedRevision) {
    throw new OwnedPlanConflictError("owned_plan_revision_conflict");
  }
  const activeSchedule = await currentActiveSchedule(
    transaction,
    input.planId,
  );
  if (input.archived && activeSchedule !== undefined) {
    return Object.freeze({
      outcome: "requires_schedule_impact",
      code: "requires_schedule_impact",
      planId: input.planId,
      expectedRevision: input.expectedRevision,
      activeScheduleId: activeSchedule.id,
      invalidations: [] as const,
    });
  }
  await transaction.execute(
    `UPDATE plans
     SET revision = revision + 1
     WHERE id = ? AND revision = ?`,
    [input.planId, input.expectedRevision],
  );
  await transaction.execute(
    `UPDATE owned_plan_aggregate_states
     SET lifecycle = CASE
           WHEN ? = 1 THEN 'archived'
           WHEN graph_status = 'valid' THEN 'ready'
           ELSE 'draft'
         END,
         archived_at_ms = CASE WHEN ? = 1 THEN ? ELSE NULL END,
         updated_at_ms = ?
     WHERE plan_id = ?`,
    [
      input.archived ? 1 : 0,
      input.archived ? 1 : 0,
      input.updatedAtMs,
      input.updatedAtMs,
      input.planId,
    ],
  );
  const operation = input.archived ? "archive" as const : "restore" as const;
  const result = committedResult(
    operation,
    await snapshot(transaction, input.planId),
    await hasInProgressWorkout(transaction, input.planId),
  );
  await writeReceipt(transaction, {
    requestId: input.requestId,
    requestSha256: input.requestSha256,
    operation,
    sourcePlanId: input.planId,
    resultPlanId: input.planId,
    expectedRevision: input.expectedRevision,
    result,
    committedAtMs: input.updatedAtMs,
  });
  return result;
}

async function executeWithReceipt(
  kernel: SqliteKernel,
  input: Readonly<{
    requestId: string;
    requestSha256: string;
  }>,
  command: (
    transaction: SqliteTransactionExecutor,
  ) => Promise<OwnedPlanRepositoryResult>,
): Promise<OwnedPlanRepositoryResult> {
  return kernel.write(async (transaction) => {
    const replay = replayReceipt(
      await readReceipt(transaction, input.requestId),
      input.requestSha256,
    );
    return replay ?? command(transaction);
  });
}

export function createOwnedPlanRepository(
  kernel: SqliteKernel,
): OwnedPlanRepository {
  async function execute(
    input: Readonly<{
      requestId: string;
      requestSha256: string;
    }>,
    command: (
      transaction: SqliteTransactionExecutor,
    ) => Promise<OwnedPlanRepositoryResult>,
  ): Promise<OwnedPlanRepositoryResult> {
    try {
      return await executeWithReceipt(kernel, input, command);
    } catch (error) {
      const cause = (error as { cause?: unknown })?.cause;
      if (cause instanceof OwnedPlanConflictError) {
        throw cause;
      }
      throw error;
    }
  }

  return Object.freeze({
    read: async (planId) =>
      await readPlan(kernel, planId) === undefined
        ? null
        : snapshot(kernel, planId),
    createDraft: (input) =>
      execute(
        input,
        (transaction) => createDraftTransaction(transaction, input),
      ),
    save: (input) =>
      execute(
        input,
        (transaction) => saveTransaction(transaction, input),
      ),
    duplicate: (input) =>
      execute(
        input,
        (transaction) => duplicateTransaction(transaction, input),
      ),
    archive: (input) =>
      execute(
        input,
        (transaction) => lifecycleTransaction(transaction, input),
      ),
    restore: (input) =>
      execute(
        input,
        (transaction) => lifecycleTransaction(transaction, input),
      ),
  });
}
