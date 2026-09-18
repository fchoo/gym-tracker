import type {
  MetricIdentity,
  MetricTarget,
} from "../../../domains/metrics";
import {
  OFF_ADVANCED_TIMING_CONFIG,
  canonicalAdvancedTimingConfigJson,
  parseAdvancedTimingConfig,
  type AdvancedTimingConfigV1,
} from "../../../domains/advancedTiming";
import {
  parseMetricIdentity,
  parseMetricTarget,
} from "../../../domains/metrics";
import type {
  SessionExerciseEditsForPlanFacts,
  SessionExerciseEditsForPlanPreview,
  SessionExerciseWriteBackComposition,
} from "../../../domains/plans/planImpactCommands";
import {
  canonicalizeSessionExerciseEditsForPlan,
} from "../../../domains/plans/planImpactCommands";
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
  advancedTimingOverride?: AdvancedTimingConfigV1 | null;
}>;

export type StagedOwnedPlanTarget = Readonly<{
  id: string;
  ordinal: number;
  target: MetricTarget;
  units: Readonly<Record<string, unknown>>;
  advancedTimingOverride?: AdvancedTimingConfigV1 | null;
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
  advancedTimingDefault?: AdvancedTimingConfigV1;
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

export type ApplySessionExerciseEditsToPlanInput = Readonly<{
  requestId: string;
  requestSha256: string;
  sourceSessionId: string;
  sourceSessionRevision: number;
  planId: string;
  planDayId: string;
  expectedPlanRevision: number;
  previewToken: string;
  composition: readonly SessionExerciseWriteBackComposition[];
  committedAtMs: number;
}>;

export type SessionExerciseEditsToPlanResult = Readonly<{
  outcome: "committed" | "already_committed";
  operation: "session_exercise_edits";
  planId: string;
  planRevision: number;
  sourceSessionId: string;
  currentWorkoutUnaffected: true;
  invalidations: readonly string[];
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
  readSessionExerciseEditsForPlan(input: Readonly<{
    sessionId: string;
  }>): Promise<SessionExerciseEditsForPlanFacts | null>;
  applySessionExerciseEditsToPlan(
    input: ApplySessionExerciseEditsToPlanInput,
  ): Promise<SessionExerciseEditsToPlanResult>;
  readSessionExerciseEditsToPlanResult(input: Readonly<{
    requestId: string;
    requestSha256: string;
  }>): Promise<SessionExerciseEditsToPlanResult | null>;
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

const RETIRED_OCCURRENCE_ORDINAL_BASE = 1_000_000;

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

async function supportsOwnedAdvancedTimingConfig(
  executor: QueryExecutor,
): Promise<boolean> {
  const [occurrenceColumns, warmupColumns, targetColumns] = await Promise.all([
    executor.queryAll<{ name: string }>(
      "PRAGMA table_info(owned_plan_day_exercises)",
    ),
    executor.queryAll<{ name: string }>(
      "PRAGMA table_info(owned_plan_warmup_sets)",
    ),
    executor.queryAll<{ name: string }>(
      "PRAGMA table_info(owned_plan_working_set_targets)",
    ),
  ]);
  return occurrenceColumns.some(({ name }) =>
    name === "advanced_timing_default_json"
  )
    && warmupColumns.some(({ name }) =>
      name === "advanced_timing_override_json"
    )
    && targetColumns.some(({ name }) =>
      name === "advanced_timing_override_json"
    );
}

type ReceiptRow = Readonly<{
  request_sha256: string;
  result_json: string;
}>;

type SessionExerciseEditReceiptRow = Readonly<{
  operation: "replace_exercise" | "remove_exercise";
  subject_session_exercise_id: string;
  replacement_session_exercise_id: string | null;
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
  advanced_timing_default_json?: string;
}>;

type WarmupRow = Readonly<{
  id: string;
  plan_day_exercise_id: string;
  ordinal: number;
  load_grams: number;
  reps: number;
  advanced_timing_override_json?: string | null;
}>;

type TargetRow = Readonly<{
  id: string;
  plan_day_exercise_id: string;
  ordinal: number;
  target_json: string;
  unit_json: string;
  advanced_timing_override_json?: string | null;
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

type SessionWriteBackRow = Readonly<{
  id: string;
  plan_id: string | null;
  plan_day_id: string | null;
  plan_name: string | null;
  day_name: string | null;
  revision: number;
  source: "scheduled_day" | "alternate_day" | "rest_day" | "empty" | "manual";
  status: "completed" | "partial" | "discarded" | "zero_sets" | "in_progress";
  modified_from_plan: number;
}>;

type SessionWriteBackExerciseRow = Readonly<{
  session_exercise_id: string;
  exercise_id: string;
  display_ordinal: number;
  default_rest_seconds: number;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
  source_occurrence_id: string | null;
  advanced_timing_default_json?: string;
}>;

type SessionWriteBackTargetRow = Readonly<{
  ordinal: number;
  target_json: string;
  unit_json: string;
  advanced_timing_override_json?: string | null;
}>;

type SessionWriteBackWarmupRow = Readonly<{
  ordinal: number;
  load_grams: number;
  reps: number;
  advanced_timing_override_json?: string | null;
}>;

type SessionWriteBackEditRow = Readonly<{
  operation: "replace_exercise" | "remove_exercise";
  subject_session_exercise_id: string;
  replacement_session_exercise_id: string | null;
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

function parseTimingJson(value: string): AdvancedTimingConfigV1 {
  try {
    return parseAdvancedTimingConfig(JSON.parse(value));
  } catch {
    throw new Error("owned_plan_advanced_timing_invalid");
  }
}

function parseOptionalTimingJson(
  value: string | null | undefined,
): AdvancedTimingConfigV1 | null {
  return value == null ? null : parseTimingJson(value);
}

function timingConfigJson(value: AdvancedTimingConfigV1 | undefined): string {
  return canonicalAdvancedTimingConfigJson(value ?? OFF_ADVANCED_TIMING_CONFIG);
}

function timingOverrideJson(
  value: AdvancedTimingConfigV1 | null | undefined,
): string | null {
  return value == null ? null : canonicalAdvancedTimingConfigJson(value);
}

function timingOverrideField(
  value: AdvancedTimingConfigV1 | null,
): Readonly<{ advancedTimingOverride?: AdvancedTimingConfigV1 | null }> {
  return value === null
    ? Object.freeze({})
    : Object.freeze({ advancedTimingOverride: value });
}

function timingDefaultField(
  value: AdvancedTimingConfigV1 | undefined,
): Readonly<{ advancedTimingDefault?: AdvancedTimingConfigV1 }> {
  return value === undefined || value.mode === "off"
    ? Object.freeze({})
    : Object.freeze({ advancedTimingDefault: value });
}

function stagedTimingOverrideField(
  value: AdvancedTimingConfigV1 | null | undefined,
): Readonly<{ advancedTimingOverride?: AdvancedTimingConfigV1 | null }> {
  return value === undefined
    ? Object.freeze({})
    : Object.freeze({ advancedTimingOverride: value });
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

function parseSessionExerciseEditsResult(
  value: string,
): SessionExerciseEditsToPlanResult {
  const parsed = JSON.parse(value) as SessionExerciseEditsToPlanResult;
  if (
    parsed.outcome !== "committed"
    || parsed.operation !== "session_exercise_edits"
    || typeof parsed.planId !== "string"
    || typeof parsed.sourceSessionId !== "string"
    || !Number.isSafeInteger(parsed.planRevision)
    || parsed.planRevision < 1
    || parsed.currentWorkoutUnaffected !== true
    || !Array.isArray(parsed.invalidations)
  ) {
    throw new Error("owned_plan_receipt_invalid");
  }
  return parsed;
}

function replaySessionExerciseEditsResult(
  receipt: ReceiptRow | undefined,
  requestSha256: string,
): SessionExerciseEditsToPlanResult | null {
  if (receipt === undefined) {
    return null;
  }
  if (receipt.request_sha256 !== requestSha256) {
    throw new OwnedPlanConflictError("owned_plan_idempotency_conflict");
  }
  return Object.freeze({
    ...parseSessionExerciseEditsResult(receipt.result_json),
    outcome: "already_committed",
  });
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
  advancedTimingConfig: boolean,
): Promise<readonly OccurrenceRow[]> {
  return executor.queryAll<OccurrenceRow>(
    `SELECT occurrence.id, occurrence.plan_day_id,
            occurrence.exercise_id, occurrence.ordinal,
            occurrence.between_exercise_rest_seconds,
            occurrence.metric_profile,
            occurrence.metric_contract_version,
            occurrence.exercise_metric_generation
            ${advancedTimingConfig
              ? ", occurrence.advanced_timing_default_json"
              : ""}
     FROM owned_plan_day_exercises occurrence
     JOIN plan_days day ON day.id = occurrence.plan_day_id
     WHERE day.plan_id = ? AND day.ordinal < ?
       AND occurrence.ordinal < ${RETIRED_OCCURRENCE_ORDINAL_BASE}
     ORDER BY day.ordinal, occurrence.ordinal`,
    [planId, currentDayCount],
  );
}

async function readWarmups(
  executor: QueryExecutor,
  planId: string,
  currentDayCount: number,
  advancedTimingConfig: boolean,
): Promise<readonly WarmupRow[]> {
  return executor.queryAll<WarmupRow>(
    `SELECT warmup.id, warmup.plan_day_exercise_id, warmup.ordinal,
            warmup.load_grams, warmup.reps
            ${advancedTimingConfig
              ? ", warmup.advanced_timing_override_json"
              : ""}
     FROM owned_plan_warmup_sets warmup
     JOIN owned_plan_day_exercises occurrence
       ON occurrence.id = warmup.plan_day_exercise_id
     JOIN plan_days day ON day.id = occurrence.plan_day_id
     WHERE day.plan_id = ? AND day.ordinal < ?
       AND occurrence.ordinal < ${RETIRED_OCCURRENCE_ORDINAL_BASE}
     ORDER BY day.ordinal, occurrence.ordinal, warmup.ordinal`,
    [planId, currentDayCount],
  );
}

async function readTargets(
  executor: QueryExecutor,
  planId: string,
  currentDayCount: number,
  advancedTimingConfig: boolean,
): Promise<readonly TargetRow[]> {
  return executor.queryAll<TargetRow>(
    `SELECT target.id, target.plan_day_exercise_id, target.ordinal,
            target.target_json, target.unit_json
            ${advancedTimingConfig
              ? ", target.advanced_timing_override_json"
              : ""}
     FROM owned_plan_working_set_targets target
     JOIN owned_plan_day_exercises occurrence
       ON occurrence.id = target.plan_day_exercise_id
     JOIN plan_days day ON day.id = occurrence.plan_day_id
     WHERE day.plan_id = ? AND day.ordinal < ?
       AND occurrence.ordinal < ${RETIRED_OCCURRENCE_ORDINAL_BASE}
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
       AND occurrence.ordinal < ${RETIRED_OCCURRENCE_ORDINAL_BASE}
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

async function readSessionExerciseEditsForPlan(
  executor: QueryExecutor,
  input: Readonly<{ sessionId: string }>,
): Promise<SessionExerciseEditsForPlanFacts | null> {
  const [session] = await executor.queryAll<SessionWriteBackRow>(
    `SELECT session.id, session.plan_id, session.plan_day_id,
            plan.name AS plan_name, day.name AS day_name, session.revision,
            session.source, session.status, session.modified_from_plan
     FROM workout_sessions session
     LEFT JOIN plans plan ON plan.id = session.plan_id
     LEFT JOIN plan_days day ON day.id = session.plan_day_id
     WHERE session.id = ?`,
    [input.sessionId],
  );
  if (
    session === undefined
    || session.plan_id === null
    || session.plan_day_id === null
    || session.plan_name === null
    || session.day_name === null
  ) {
    return null;
  }
  const plan = await readPlan(executor, session.plan_id);
  if (plan === undefined || plan.origin === "bundled") {
    return null;
  }
  const advancedTimingConfig = await supportsOwnedAdvancedTimingConfig(executor);
  const [day] = await executor.queryAll<{ id: string; name: string }>(
    `SELECT id, name FROM plan_days
     WHERE id = ? AND plan_id = ? AND ordinal < ?`,
    [session.plan_day_id, session.plan_id, plan.days_per_week],
  );
  if (day === undefined) {
    return null;
  }
  const existing = await snapshot(executor, session.plan_id);
  const planDay = existing.days.find(({ id }) => id === day.id);
  if (planDay === undefined) {
    return null;
  }
  const exercises = await executor.queryAll<SessionWriteBackExerciseRow>(
    `SELECT se.id AS session_exercise_id, se.exercise_id, se.display_ordinal,
            se.default_rest_seconds, se.metric_profile,
            se.metric_contract_version, se.exercise_metric_generation,
            ${advancedTimingConfig
              ? "se.advanced_timing_default_json,"
              : ""}
            COALESCE(
              (SELECT target.plan_day_exercise_id
               FROM owned_plan_working_set_targets target
               JOIN session_sets set_row
                 ON set_row.source_owned_plan_working_set_target_id = target.id
               WHERE set_row.session_exercise_id = se.id
               LIMIT 1),
              se.source_plan_day_exercise_id
            ) AS source_occurrence_id
     FROM session_exercises se
     WHERE se.session_id = ?
     ORDER BY se.display_ordinal, se.id`,
    [session.id],
  );
  const sessionExercises = await Promise.all(exercises.map(async (exercise) => {
    const identity = parseMetricIdentity({
      profile: exercise.metric_profile,
      contractVersion: exercise.metric_contract_version,
      exerciseMetricGeneration: exercise.exercise_metric_generation,
    });
    const warmups = await executor.queryAll<SessionWriteBackWarmupRow>(
      `SELECT ordinal, target_load_grams AS load_grams, target_max_reps AS reps
              ${advancedTimingConfig
                ? ", advanced_timing_override_json"
                : ""}
       FROM session_sets
       WHERE session_exercise_id = ? AND set_kind = 'warmup'
       ORDER BY ordinal`,
      [exercise.session_exercise_id],
    );
    const targets = await executor.queryAll<SessionWriteBackTargetRow>(
      `SELECT ordinal, target_json, unit_json
              ${advancedTimingConfig
                ? ", advanced_timing_override_json"
                : ""}
       FROM session_sets
       WHERE session_exercise_id = ? AND set_kind = 'working'
       ORDER BY ordinal`,
      [exercise.session_exercise_id],
    );
    return Object.freeze({
      sessionExerciseId: exercise.session_exercise_id,
      exerciseId: exercise.exercise_id,
      displayOrdinal: exercise.display_ordinal,
      sourceOccurrenceId: exercise.source_occurrence_id,
      restSeconds: exercise.default_rest_seconds,
      metricIdentity: identity,
      ...timingDefaultField(advancedTimingConfig
        ? parseTimingJson(exercise.advanced_timing_default_json!)
        : OFF_ADVANCED_TIMING_CONFIG),
      warmups: Object.freeze(warmups.map((warmup) => Object.freeze({
        ordinal: warmup.ordinal,
        loadGrams: warmup.load_grams,
        reps: warmup.reps,
        ...timingOverrideField(advancedTimingConfig
          ? parseOptionalTimingJson(warmup.advanced_timing_override_json)
          : null),
      }))),
      targets: Object.freeze(targets.map((target) => Object.freeze({
        ordinal: target.ordinal,
        target: parseMetricTarget(identity, parseJsonRecord(target.target_json)),
        units: parseJsonRecord(target.unit_json),
        ...timingOverrideField(advancedTimingConfig
          ? parseOptionalTimingJson(target.advanced_timing_override_json)
          : null),
      }))),
    });
  }));
  const edits = await executor.queryAll<SessionWriteBackEditRow>(
    `SELECT operation, subject_session_exercise_id,
            replacement_session_exercise_id
     FROM workout_session_exercise_edit_receipts
     WHERE session_id = ?
       AND operation IN ('replace_exercise', 'remove_exercise')
     ORDER BY request_id`,
    [session.id],
  );
  return Object.freeze({
    session: Object.freeze({
      id: session.id,
      planId: session.plan_id,
      planDayId: session.plan_day_id,
      planName: session.plan_name,
      dayName: session.day_name,
      revision: session.revision,
      source: session.source,
      status: session.status,
      modifiedFromPlan: session.modified_from_plan === 1,
    }),
    day: Object.freeze({
      id: planDay.id,
      name: planDay.name,
      planId: session.plan_id,
      planRevision: existing.revision,
      occurrences: Object.freeze(planDay.occurrences.map((occurrence) =>
        Object.freeze({
          occurrenceId: occurrence.id,
          exerciseId: occurrence.exerciseId,
          ordinal: occurrence.ordinal,
          restSeconds: occurrence.restSeconds,
          metricIdentity: occurrence.metricIdentity,
          ...timingDefaultField(occurrence.advancedTimingDefault),
          warmups: Object.freeze(occurrence.warmups.map((warmup) =>
            Object.freeze({
              ordinal: warmup.ordinal,
              loadGrams: warmup.loadGrams,
              reps: warmup.reps,
              ...timingOverrideField(warmup.advancedTimingOverride ?? null),
            })
          )),
          targets: Object.freeze(occurrence.targets.map((target) =>
            Object.freeze({
              ordinal: target.ordinal,
              target: target.target,
              units: target.units,
              ...timingOverrideField(target.advancedTimingOverride ?? null),
            })
          )),
          policy: Object.freeze({
            kind: occurrence.policy.kind,
            policyId: occurrence.policy.policyId,
            version: occurrence.policy.version,
            rule: occurrence.policy.rule,
          }),
        })
      )),
    }),
    sessionExercises: Object.freeze(sessionExercises),
    edits: Object.freeze(edits.map((edit) => Object.freeze({
      operation: edit.operation,
      subjectSessionExerciseId: edit.subject_session_exercise_id,
      replacementSessionExerciseId: edit.replacement_session_exercise_id,
    }))),
  });
}

async function snapshot(
  executor: QueryExecutor,
  planId: string,
): Promise<OwnedPlanSnapshot> {
  const plan = await readPlan(executor, planId);
  const ownedPlan = plan!;
  const advancedTimingConfig = await supportsOwnedAdvancedTimingConfig(executor);
  const [
    days,
    occurrences,
    warmups,
    targets,
    policies,
    defaults,
  ] = await Promise.all([
    readDays(executor, planId, ownedPlan.days_per_week),
    readOccurrences(
      executor,
      planId,
      ownedPlan.days_per_week,
      advancedTimingConfig,
    ),
    readWarmups(executor, planId, ownedPlan.days_per_week, advancedTimingConfig),
    readTargets(executor, planId, ownedPlan.days_per_week, advancedTimingConfig),
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
          ...timingDefaultField(advancedTimingConfig
            ? parseTimingJson(occurrence.advanced_timing_default_json!)
            : OFF_ADVANCED_TIMING_CONFIG),
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
                ...timingOverrideField(advancedTimingConfig
                  ? parseOptionalTimingJson(
                      warmup.advanced_timing_override_json,
                    )
                  : null),
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
                ...timingOverrideField(advancedTimingConfig
                  ? parseOptionalTimingJson(
                      target.advanced_timing_override_json,
                    )
                  : null),
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
  advancedTimingConfig: boolean,
): Promise<void> {
  await transaction.execute(
    `INSERT INTO owned_plan_day_exercises
      (id, plan_day_id, exercise_id, ordinal,
       between_exercise_rest_seconds, metric_profile,
       metric_contract_version, exercise_metric_generation,
       ${advancedTimingConfig ? "advanced_timing_default_json," : ""}
       revision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?,
             ${advancedTimingConfig ? "?," : ""}
             1)
     ON CONFLICT(id) DO UPDATE SET
       plan_day_id = excluded.plan_day_id,
       exercise_id = excluded.exercise_id,
       ordinal = excluded.ordinal,
       between_exercise_rest_seconds =
         excluded.between_exercise_rest_seconds,
       metric_profile = excluded.metric_profile,
       metric_contract_version = excluded.metric_contract_version,
       exercise_metric_generation = excluded.exercise_metric_generation,
       ${advancedTimingConfig
         ? "advanced_timing_default_json = excluded.advanced_timing_default_json,"
         : ""}
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
      ...(advancedTimingConfig
        ? [timingConfigJson(occurrence.advancedTimingDefault)]
        : []),
    ],
  );
  for (const warmup of occurrence.warmups) {
    await transaction.execute(
      `INSERT INTO owned_plan_warmup_sets
        (id, plan_day_exercise_id, ordinal, load_grams, reps,
         ${advancedTimingConfig ? "advanced_timing_override_json," : ""}
         revision)
       VALUES (?, ?, ?, ?, ?,
               ${advancedTimingConfig ? "?," : ""}
               1)
       ON CONFLICT(id) DO UPDATE SET
         plan_day_exercise_id = excluded.plan_day_exercise_id,
         ordinal = excluded.ordinal,
         load_grams = excluded.load_grams,
         reps = excluded.reps,
         ${advancedTimingConfig
           ? "advanced_timing_override_json = excluded.advanced_timing_override_json,"
           : ""}
         revision = owned_plan_warmup_sets.revision + 1`,
      [
        warmup.id,
        occurrence.id,
        warmup.ordinal,
        warmup.loadGrams,
        warmup.reps,
        ...(advancedTimingConfig
          ? [timingOverrideJson(warmup.advancedTimingOverride)]
          : []),
      ],
    );
  }
  for (const target of occurrence.targets) {
    await transaction.execute(
      `INSERT INTO owned_plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, target_json, unit_json,
         metric_profile, metric_contract_version,
         exercise_metric_generation,
         ${advancedTimingConfig ? "advanced_timing_override_json," : ""}
         revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?,
               ${advancedTimingConfig ? "?," : ""}
               1)
       ON CONFLICT(id) DO UPDATE SET
         plan_day_exercise_id = excluded.plan_day_exercise_id,
         ordinal = excluded.ordinal,
         target_json = excluded.target_json,
         unit_json = excluded.unit_json,
         metric_profile = excluded.metric_profile,
         metric_contract_version = excluded.metric_contract_version,
         exercise_metric_generation = excluded.exercise_metric_generation,
         ${advancedTimingConfig
           ? "advanced_timing_override_json = excluded.advanced_timing_override_json,"
           : ""}
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
        ...(advancedTimingConfig
          ? [timingOverrideJson(target.advancedTimingOverride)]
          : []),
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

function writeBackOccurrenceId(
  input: ApplySessionExerciseEditsToPlanInput,
  ordinal: number,
): string {
  return `session-writeback:${input.requestSha256}:occurrence:${ordinal}`;
}

function writeBackTargetId(
  input: ApplySessionExerciseEditsToPlanInput,
  compositionOrdinal: number,
  targetOrdinal: number,
): string {
  return `session-writeback:${input.requestSha256}:target:${compositionOrdinal}:${targetOrdinal}`;
}

function writeBackPolicyId(
  input: ApplySessionExerciseEditsToPlanInput,
  ordinal: number,
): string {
  return `session-writeback:${input.requestSha256}:policy:${ordinal}`;
}

async function activeOwnedOccurrences(
  transaction: SqliteTransactionExecutor,
  input: ApplySessionExerciseEditsToPlanInput,
): Promise<readonly Readonly<{ id: string; ordinal: number }>[]> {
  return transaction.queryAll<{ id: string; ordinal: number }>(
    `SELECT occurrence.id, occurrence.ordinal
     FROM owned_plan_day_exercises occurrence
     JOIN plan_days day ON day.id = occurrence.plan_day_id
     WHERE occurrence.plan_day_id = ?
       AND day.plan_id = ?
       AND day.ordinal < (SELECT days_per_week FROM plans WHERE id = ?)
       AND occurrence.ordinal < ${RETIRED_OCCURRENCE_ORDINAL_BASE}
     ORDER BY occurrence.ordinal, occurrence.id`,
    [input.planDayId, input.planId, input.planId],
  );
}

async function freeActiveOccurrenceOrdinals(
  transaction: SqliteTransactionExecutor,
  active: readonly Readonly<{ id: string; ordinal: number }>[],
): Promise<void> {
  for (const occurrence of active) {
    await transaction.execute(
      `UPDATE owned_plan_day_exercises
       SET ordinal = ?
       WHERE id = ? AND ordinal = ?`,
      [
        RETIRED_OCCURRENCE_ORDINAL_BASE * 2 + occurrence.ordinal,
        occurrence.id,
        occurrence.ordinal,
      ],
    );
  }
}

async function retireAbsentOccurrences(
  transaction: SqliteTransactionExecutor,
  input: ApplySessionExerciseEditsToPlanInput,
  active: readonly Readonly<{ id: string; ordinal: number }>[],
  retainedOccurrenceIds: ReadonlySet<string>,
): Promise<void> {
  for (const occurrence of active) {
    if (retainedOccurrenceIds.has(occurrence.id)) {
      continue;
    }
    await transaction.execute(
      `UPDATE owned_plan_day_exercises
       SET ordinal = ?, revision = revision + 1
       WHERE id = ? AND plan_day_id = ? AND ordinal = ?`,
      [
        RETIRED_OCCURRENCE_ORDINAL_BASE + occurrence.ordinal,
        occurrence.id,
        input.planDayId,
        RETIRED_OCCURRENCE_ORDINAL_BASE * 2 + occurrence.ordinal,
      ],
    );
  }
}

async function writeBackComposition(
  transaction: SqliteTransactionExecutor,
  input: ApplySessionExerciseEditsToPlanInput,
): Promise<void> {
  const advancedTimingConfig = await supportsOwnedAdvancedTimingConfig(
    transaction,
  );
  const active = await activeOwnedOccurrences(transaction, input);
  const existingPlan = await snapshot(transaction, input.planId);
  const existingOccurrences = new Map(
    existingPlan.days.flatMap(({ occurrences }) => occurrences)
      .map((occurrence) => [occurrence.id, occurrence]),
  );
  await freeActiveOccurrenceOrdinals(transaction, active);
  const retainedOccurrenceIds = new Set<string>();
  for (const entry of input.composition) {
    const occurrenceId = entry.source === "planned"
      ? entry.sourceOccurrenceId!
      : writeBackOccurrenceId(input, entry.ordinal);
    retainedOccurrenceIds.add(occurrenceId);
    const existing = entry.source === "planned"
      ? existingOccurrences.get(occurrenceId)!
      : undefined;
    const occurrence: StagedOwnedPlanOccurrence = {
      id: occurrenceId,
      exerciseId: entry.exerciseId,
      ordinal: entry.ordinal,
      restSeconds: entry.restSeconds,
      metricIdentity: entry.metricIdentity,
      ...timingDefaultField(
        existing?.advancedTimingDefault ?? entry.advancedTimingDefault,
      ),
      // Manual session additions do not carry plan warm-ups.
      warmups: existing === undefined
        ? entry.warmups.map((warmup, index) => ({
            id: `${writeBackTargetId(input, entry.ordinal, index)}:warmup`,
            ordinal: warmup.ordinal,
            loadGrams: warmup.loadGrams,
            reps: warmup.reps,
            ...stagedTimingOverrideField(warmup.advancedTimingOverride),
          }))
        : existing.warmups.map((warmup) => ({
            id: warmup.id,
            ordinal: warmup.ordinal,
            loadGrams: warmup.loadGrams,
            reps: warmup.reps,
            ...stagedTimingOverrideField(warmup.advancedTimingOverride),
          })),
      targets: existing === undefined
        ? entry.targets.map((target) => ({
            id: writeBackTargetId(input, entry.ordinal, target.ordinal),
            ordinal: target.ordinal,
            target: target.target,
            units: target.units,
            ...stagedTimingOverrideField(target.advancedTimingOverride),
          }))
        : existing.targets.map((target) => ({
            id: target.id,
            ordinal: target.ordinal,
            target: target.target,
            units: target.units,
            ...stagedTimingOverrideField(target.advancedTimingOverride),
          })),
      policy: {
        id: existing === undefined
          ? writeBackPolicyId(input, entry.ordinal)
          : existing.policy.id,
        kind: existing?.policy.kind ?? entry.policy.kind,
        policyId: existing?.policy.policyId ?? entry.policy.policyId,
        version: existing?.policy.version ?? entry.policy.version,
        rule: existing?.policy.rule ?? entry.policy.rule,
      },
    };
    await upsertOccurrence(
      transaction,
      input.planDayId,
      occurrence,
      advancedTimingConfig,
    );
  }
  await retireAbsentOccurrences(transaction, input, active, retainedOccurrenceIds);
}

async function applySessionExerciseEditsToPlanTransaction(
  transaction: SqliteTransactionExecutor,
  input: ApplySessionExerciseEditsToPlanInput,
): Promise<SessionExerciseEditsToPlanResult> {
  const receipt = await readReceipt(transaction, input.requestId);
  if (receipt !== undefined) {
    if (receipt.request_sha256 !== input.requestSha256) {
      throw new OwnedPlanConflictError("owned_plan_idempotency_conflict");
    }
    return Object.freeze({
      ...parseSessionExerciseEditsResult(receipt.result_json),
      outcome: "already_committed",
    });
  }
  const facts = await readSessionExerciseEditsForPlan(transaction, {
    sessionId: input.sourceSessionId,
  });
  const composition = facts === null
    ? null
    : canonicalizeSessionExerciseEditsForPlan(facts);
  if (
    facts === null
    || composition === null
    || facts.session.revision !== input.sourceSessionRevision
    || facts.session.planId !== input.planId
    || facts.session.planDayId !== input.planDayId
    || facts.day.planRevision !== input.expectedPlanRevision
    || JSON.stringify(composition) !== JSON.stringify(input.composition)
  ) {
    throw new OwnedPlanConflictError("owned_plan_revision_conflict");
  }
  // The same serialized transaction read this owned plan in the facts above.
  await transaction.execute(
    `UPDATE owned_progression_recommendations
     SET status = 'invalidated', decided_at_ms = ?
     WHERE status = 'pending'
       AND owned_plan_working_set_target_id IN (
         SELECT target.id
         FROM owned_plan_working_set_targets target
         JOIN owned_plan_day_exercises occurrence
           ON occurrence.id = target.plan_day_exercise_id
         WHERE occurrence.plan_day_id = ?
       )`,
    [input.committedAtMs, input.planDayId],
  );
  await writeBackComposition(transaction, input);
  await transaction.execute(
    `UPDATE plans
     SET revision = revision + 1
     WHERE id = ? AND revision = ?`,
    [input.planId, input.expectedPlanRevision],
  );
  const result: SessionExerciseEditsToPlanResult = Object.freeze({
    outcome: "committed",
    operation: "session_exercise_edits",
    planId: input.planId,
    planRevision: input.expectedPlanRevision + 1,
    sourceSessionId: input.sourceSessionId,
    currentWorkoutUnaffected: true,
    invalidations: invalidations(input.planId),
  });
  await transaction.execute(
    `INSERT INTO owned_plan_mutation_requests
      (request_id, request_sha256, operation, source_plan_id,
       result_plan_id, expected_revision, result_revision, result_json,
       committed_at_ms)
     VALUES (?, ?, 'save', ?, ?, ?, ?, ?, ?)`,
    [
      input.requestId,
      input.requestSha256,
      input.planId,
      input.planId,
      input.expectedPlanRevision,
      result.planRevision,
      JSON.stringify(result),
      input.committedAtMs,
    ],
  );
  return result;
}

async function applyGraph(
  transaction: SqliteTransactionExecutor,
  input: StagedSaveOwnedPlan,
): Promise<void> {
  const advancedTimingConfig = await supportsOwnedAdvancedTimingConfig(
    transaction,
  );
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
      await upsertOccurrence(
        transaction,
        day.id,
        occurrence,
        advancedTimingConfig,
      );
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
    readSessionExerciseEditsForPlan: (input) =>
      readSessionExerciseEditsForPlan(kernel, input),
    applySessionExerciseEditsToPlan: (input) =>
      kernel.write((transaction) =>
        applySessionExerciseEditsToPlanTransaction(transaction, input)
      ),
    readSessionExerciseEditsToPlanResult: async (input) =>
      replaySessionExerciseEditsResult(
        await readReceipt(kernel, input.requestId),
        input.requestSha256,
      ),
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
