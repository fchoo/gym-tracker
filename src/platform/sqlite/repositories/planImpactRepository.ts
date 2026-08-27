import {
  OWNED_PLAN_MISSING_VALID_TARGET_CODE,
  OWNED_PLAN_MISSING_VALID_TARGET_REASON,
} from "../migrations/0009_owned_plans";
import type {
  MetricIdentity,
  MetricTarget,
} from "../../../domains/metrics";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

const RETIRED_ORDINAL_BASE = 1_000_000;
const TEMPORARY_ORDINAL_BASE = 2_000_000;

export type PlanImpactBindingFacts = Readonly<{
  id: string;
  ordinal: number;
  weekIndex: number | null;
  weekday: string | null;
  planDayId: string;
}>;

export type PlanImpactScheduleFacts = Readonly<{
  id: string;
  revision: number;
  lifecycle: "active" | "inactive";
  version: Readonly<{
    id: string;
    versionNumber: number;
    effectiveLocalDate: string;
    mode: "weekday" | "rotation";
    timeZone: string;
    rotationPointer: number | null;
    bindings: readonly PlanImpactBindingFacts[];
  }>;
}>;

export type DayRemovalRepositoryPreview = Readonly<{
  planId: string;
  planName: string;
  planRevision: number;
  currentDayCount: number;
  dayId: string;
  dayName: string;
  dayRevision: number;
  dayOrdinal: number;
  hasInProgressWorkout: boolean;
  schedule: PlanImpactScheduleFacts | null;
  affectedOverrides: readonly Readonly<{
    id: string;
    localDate: string;
    revision: number;
  }>[];
  replacementDays: readonly Readonly<{
    id: string;
    name: string;
    revision: number;
  }>[];
}>;

export type ApplyDayRemovalRepositoryInput = Readonly<{
  requestId: string;
  requestSha256: string;
  planId: string;
  dayId: string;
  expectedPlanRevision: number;
  expectedScheduleRevision: number;
  expectedPreview: DayRemovalRepositoryPreview;
  effectiveLocalDate: string;
  choice:
    | Readonly<{
        kind: "replacement_day";
        replacementDayId: string;
      }>
    | Readonly<{ kind: "remove_binding" | "effective_date" }>;
  committedAtMs: number;
}>;

export type PlanImpactCommittedResult = Readonly<{
  outcome: "committed" | "already_committed";
  planId: string;
  planRevision: number;
  scheduleRevision: number;
  currentWorkoutUnaffected: boolean;
  invalidations: readonly string[];
}>;

export type ExerciseReplacementOccurrenceFacts = Readonly<{
  occurrenceId: string;
  occurrenceRevision: number;
  dayId: string;
  dayName: string;
  dayRevision: number;
  dayOrdinal: number;
  occurrenceOrdinal: number;
  restSeconds: number;
  warmups: readonly Readonly<{
    id: string;
    revision: number;
    ordinal: number;
    loadGrams: number;
    reps: number;
  }>[];
  targets: readonly Readonly<{
    id: string;
    revision: number;
    ordinal: number;
    target: MetricTarget;
    units: Readonly<Record<string, unknown>>;
  }>[];
  policy: Readonly<{
    id: string;
    revision: number;
    kind: "automatic" | "manual_hold" | "plan_authored";
    policyId: string;
    version: number;
    rule: Readonly<Record<string, unknown>>;
  }>;
}>;

export type ExerciseReplacementRepositoryPreview = Readonly<{
  planId: string;
  planName: string;
  planRevision: number;
  sourceOccurrenceId: string;
  sourceExerciseId: string;
  sourceExerciseName: string;
  sourceMetricIdentity: MetricIdentity;
  hasInProgressWorkout: boolean;
  candidates: readonly Readonly<{
    exerciseId: string;
    name: string;
    metricIdentity: MetricIdentity;
    exerciseRevision: number;
    libraryRevision: number;
  }>[];
  occurrences: readonly ExerciseReplacementOccurrenceFacts[];
}>;

export type ApplyExerciseReplacementRepositoryInput = Readonly<{
  requestId: string;
  requestSha256: string;
  planId: string;
  sourceOccurrenceId: string;
  sourceExerciseId: string;
  expectedPlanRevision: number;
  expectedPreview: ExerciseReplacementRepositoryPreview;
  scope: "this_occurrence" | "all_occurrences";
  replacementExerciseId: string;
  occurrences: readonly ExerciseReplacementOccurrenceFacts[];
  committedAtMs: number;
}>;

export type ExerciseReplacementCommittedResult = Readonly<{
  outcome: "committed" | "already_committed";
  planId: string;
  planRevision: number;
  replacementExerciseId: string;
  affectedOccurrenceIds: readonly string[];
  currentWorkoutUnaffected: boolean;
  invalidations: readonly string[];
}>;

export type PlanImpactRepository = Readonly<{
  readCommandResult(input: Readonly<{
    requestId: string;
    requestSha256: string;
  }>): Promise<PlanImpactCommittedResult | null>;
  readDayRemoval(input: Readonly<{
    planId: string;
    dayId: string;
  }>): Promise<DayRemovalRepositoryPreview | null>;
  applyDayRemoval(
    input: ApplyDayRemovalRepositoryInput,
  ): Promise<PlanImpactCommittedResult>;
  readExerciseReplacement(input: Readonly<{
    planId: string;
    occurrenceId: string;
  }>): Promise<ExerciseReplacementRepositoryPreview | null>;
  readCommittedExerciseReplacement(input: Readonly<{
    planId: string;
    expectedPlanRevision: number;
    replacementExerciseId: string;
    occurrences: readonly ExerciseReplacementOccurrenceFacts[];
  }>): Promise<ExerciseReplacementCommittedResult | null>;
  applyExerciseReplacement(
    input: ApplyExerciseReplacementRepositoryInput,
  ): Promise<ExerciseReplacementCommittedResult>;
}>;

export type PlanImpactRepositoryErrorCode =
  | "plan_impact_day_invalid"
  | "plan_impact_idempotency_conflict"
  | "plan_impact_plan_invalid"
  | "plan_impact_preview_stale"
  | "plan_impact_replacement_invalid"
  | "plan_impact_replacement_incompatible"
  | "plan_impact_schedule_invalid"
  | "plan_impact_workout_active";

export type PlanImpactRepositoryTestStage =
  | "before_day_aggregate_update"
  | "before_day_override_update"
  | "before_day_retire"
  | "before_replacement_occurrence_update"
  | "before_replacement_plan_update";

export type PlanImpactRepositoryTestObserver = Readonly<{
  beforeWrite?(
    stage: PlanImpactRepositoryTestStage,
    transaction: SqliteTransactionExecutor,
  ): Promise<void>;
}>;

export class PlanImpactRepositoryError extends Error {
  readonly kind = "conflict" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-PLAN04" as const;

  constructor(readonly code: PlanImpactRepositoryErrorCode) {
    super(code);
    this.name = "PlanImpactRepositoryError";
  }
}

type QueryExecutor = Pick<SqliteKernel, "queryAll">;

type PlanRow = Readonly<{
  id: string;
  name: string;
  origin: "bundled" | "custom" | "copied";
  days_per_week: number;
  revision: number;
}>;

type DayRow = Readonly<{
  id: string;
  name: string;
  ordinal: number;
  revision: number;
}>;

type ScheduleRow = Readonly<{
  id: string;
  lifecycle: "active" | "inactive";
  revision: number;
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
  weekday: string | null;
  plan_day_id: string;
}>;

type OverrideRow = Readonly<{
  id: string;
  local_date: string;
  revision: number;
}>;

type ReplacementOccurrenceRow = Readonly<{
  occurrence_id: string;
  occurrence_revision: number;
  day_id: string;
  day_name: string;
  day_revision: number;
  day_ordinal: number;
  occurrence_ordinal: number;
  exercise_id: string;
  exercise_name: string;
  rest_seconds: number;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
}>;

type ReplacementCandidateRow = Readonly<{
  exercise_id: string;
  canonical_name: string;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
  exercise_revision: number;
  library_revision: number;
}>;

type ReplacementWarmupRow = Readonly<{
  id: string;
  plan_day_exercise_id: string;
  ordinal: number;
  load_grams: number;
  reps: number;
  revision: number;
}>;

type ReplacementTargetRow = Readonly<{
  id: string;
  plan_day_exercise_id: string;
  ordinal: number;
  target_json: string;
  unit_json: string;
  revision: number;
}>;

type ReplacementPolicyRow = Readonly<{
  id: string;
  plan_day_exercise_id: string;
  policy_kind: "automatic" | "manual_hold" | "plan_authored";
  policy_id: string;
  policy_version: number;
  rule_json: string;
  revision: number;
}>;

function invalidations(
  planId: string,
  scheduleId: string,
): readonly string[] {
  return Object.freeze([
    "library:plans",
    `plan:${planId}`,
    `schedule:${scheduleId}`,
    "today",
  ]);
}

function replacementInvalidations(
  planId: string,
  sourceExerciseId: string,
  replacementExerciseId: string,
): readonly string[] {
  return Object.freeze([
    "library:plans",
    `plan:${planId}`,
    `exercise:${sourceExerciseId}`,
    `exercise:${replacementExerciseId}`,
    "today",
  ]);
}

function parseJsonRecord(value: string): Readonly<Record<string, unknown>> {
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("plan_impact_json_invalid");
  }
  return parsed as Readonly<Record<string, unknown>>;
}

async function readPlan(
  executor: QueryExecutor,
  planId: string,
): Promise<PlanRow | undefined> {
  const [row] = await executor.queryAll<PlanRow>(
    `SELECT id, name, origin, days_per_week, revision
     FROM plans
     WHERE id = ?`,
    [planId],
  );
  return row;
}

async function readCurrentDay(
  executor: QueryExecutor,
  planId: string,
  dayId: string,
  currentDayCount: number,
): Promise<DayRow | undefined> {
  const [row] = await executor.queryAll<DayRow>(
    `SELECT id, name, ordinal, revision
     FROM plan_days
     WHERE id = ? AND plan_id = ? AND ordinal < ?`,
    [dayId, planId, currentDayCount],
  );
  return row;
}

async function readReplacementDays(
  executor: QueryExecutor,
  planId: string,
  dayId: string,
  currentDayCount: number,
): Promise<readonly DayRow[]> {
  return executor.queryAll<DayRow>(
    `SELECT id, name, ordinal, revision
     FROM plan_days
     WHERE plan_id = ? AND id <> ? AND ordinal < ?
     ORDER BY ordinal, id`,
    [planId, dayId, currentDayCount],
  );
}

async function readSchedule(
  executor: QueryExecutor,
  planId: string,
): Promise<ScheduleRow | undefined> {
  const [row] = await executor.queryAll<ScheduleRow>(
    `SELECT id, lifecycle, revision
     FROM owned_plan_schedules
     WHERE plan_id = ?`,
    [planId],
  );
  return row;
}

async function readLatestVersion(
  executor: QueryExecutor,
  scheduleId: string,
): Promise<VersionRow | undefined> {
  const [row] = await executor.queryAll<VersionRow>(
    `SELECT id, version_number, effective_local_date, mode, timezone,
            rotation_pointer
     FROM owned_plan_schedule_versions
     WHERE schedule_id = ?
     ORDER BY version_number DESC
     LIMIT 1`,
    [scheduleId],
  );
  return row;
}

async function readBindings(
  executor: QueryExecutor,
  versionId: string,
): Promise<readonly BindingRow[]> {
  return executor.queryAll<BindingRow>(
    `SELECT id, ordinal, week_index, weekday, plan_day_id
     FROM owned_plan_schedule_bindings
     WHERE schedule_version_id = ?
     ORDER BY ordinal, id`,
    [versionId],
  );
}

async function readAffectedOverrides(
  executor: QueryExecutor,
  scheduleId: string,
  dayId: string,
): Promise<readonly OverrideRow[]> {
  return executor.queryAll<OverrideRow>(
    `SELECT id, local_date, revision
     FROM owned_plan_schedule_overrides
     WHERE schedule_id = ?
       AND plan_day_id = ?
       AND state = 'pending'
     ORDER BY local_date, id`,
    [scheduleId, dayId],
  );
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

async function readDayRemoval(
  executor: QueryExecutor,
  input: Readonly<{ planId: string; dayId: string }>,
): Promise<DayRemovalRepositoryPreview | null> {
  const plan = await readPlan(executor, input.planId);
  if (
    plan === undefined
    || plan.origin === "bundled"
    || plan.days_per_week < 2
  ) {
    return null;
  }
  const day = await readCurrentDay(
    executor,
    input.planId,
    input.dayId,
    plan.days_per_week,
  );
  if (day === undefined) {
    return null;
  }
  const schedule = await readSchedule(executor, input.planId);
  let scheduleFacts: PlanImpactScheduleFacts | null = null;
  let affectedOverrides: readonly OverrideRow[] = [];
  if (schedule !== undefined) {
    const version = await readLatestVersion(executor, schedule.id);
    if (version !== undefined) {
      const bindings = await readBindings(executor, version.id);
      scheduleFacts = Object.freeze({
        id: schedule.id,
        lifecycle: schedule.lifecycle,
        revision: schedule.revision,
        version: Object.freeze({
          id: version.id,
          versionNumber: version.version_number,
          effectiveLocalDate: version.effective_local_date,
          mode: version.mode,
          timeZone: version.timezone,
          rotationPointer: version.rotation_pointer,
          bindings: Object.freeze(bindings.map((binding) => Object.freeze({
            id: binding.id,
            ordinal: binding.ordinal,
            weekIndex: binding.week_index,
            weekday: binding.weekday,
            planDayId: binding.plan_day_id,
          }))),
        }),
      });
      affectedOverrides = await readAffectedOverrides(
        executor,
        schedule.id,
        input.dayId,
      );
    }
  }
  const replacements = await readReplacementDays(
    executor,
    input.planId,
    input.dayId,
    plan.days_per_week,
  );
  return Object.freeze({
    planId: plan.id,
    planName: plan.name,
    planRevision: plan.revision,
    currentDayCount: plan.days_per_week,
    dayId: day.id,
    dayName: day.name,
    dayRevision: day.revision,
    dayOrdinal: day.ordinal,
    hasInProgressWorkout: await hasInProgressWorkout(executor, plan.id),
    schedule: scheduleFacts,
    affectedOverrides: Object.freeze(
      affectedOverrides.map((row) => Object.freeze({
        id: row.id,
        localDate: row.local_date,
        revision: row.revision,
      })),
    ),
    replacementDays: Object.freeze(replacements.map((replacement) =>
      Object.freeze({
        id: replacement.id,
        name: replacement.name,
        revision: replacement.revision,
      })
    )),
  });
}

function replacementIdentity(
  row: Readonly<{
    metric_profile: MetricIdentity["profile"];
    metric_contract_version: number;
    exercise_metric_generation: number;
  }>,
): MetricIdentity {
  return Object.freeze({
    profile: row.metric_profile,
    contractVersion: row.metric_contract_version,
    exerciseMetricGeneration: row.exercise_metric_generation,
  });
}

async function readReplacementOccurrenceRows(
  executor: QueryExecutor,
  planId: string,
): Promise<readonly ReplacementOccurrenceRow[]> {
  return executor.queryAll<ReplacementOccurrenceRow>(
    `SELECT occurrence.id AS occurrence_id,
            occurrence.revision AS occurrence_revision,
            day.id AS day_id,
            day.name AS day_name,
            day.revision AS day_revision,
            day.ordinal AS day_ordinal,
            occurrence.ordinal AS occurrence_ordinal,
            occurrence.exercise_id,
            entry.canonical_name AS exercise_name,
            occurrence.between_exercise_rest_seconds AS rest_seconds,
            occurrence.metric_profile,
            occurrence.metric_contract_version,
            occurrence.exercise_metric_generation
     FROM owned_plan_day_exercises occurrence
     JOIN plan_days day ON day.id = occurrence.plan_day_id
     JOIN plans plan ON plan.id = day.plan_id
     JOIN exercise_library_entries entry
       ON entry.exercise_id = occurrence.exercise_id
     WHERE plan.id = ? AND day.ordinal < plan.days_per_week
     ORDER BY day.ordinal, occurrence.ordinal, occurrence.id`,
    [planId],
  );
}

async function readReplacementWarmups(
  executor: QueryExecutor,
  occurrenceIds: readonly string[],
): Promise<readonly ReplacementWarmupRow[]> {
  const placeholders = occurrenceIds.map(() => "?").join(", ");
  return executor.queryAll<ReplacementWarmupRow>(
    `SELECT id, plan_day_exercise_id, ordinal, load_grams, reps, revision
     FROM owned_plan_warmup_sets
     WHERE plan_day_exercise_id IN (${placeholders})
     ORDER BY plan_day_exercise_id, ordinal, id`,
    occurrenceIds,
  );
}

async function readReplacementTargets(
  executor: QueryExecutor,
  occurrenceIds: readonly string[],
): Promise<readonly ReplacementTargetRow[]> {
  const placeholders = occurrenceIds.map(() => "?").join(", ");
  return executor.queryAll<ReplacementTargetRow>(
    `SELECT id, plan_day_exercise_id, ordinal, target_json, unit_json,
            revision
     FROM owned_plan_working_set_targets
     WHERE plan_day_exercise_id IN (${placeholders})
     ORDER BY plan_day_exercise_id, ordinal, id`,
    occurrenceIds,
  );
}

async function readReplacementPolicies(
  executor: QueryExecutor,
  occurrenceIds: readonly string[],
): Promise<readonly ReplacementPolicyRow[]> {
  const placeholders = occurrenceIds.map(() => "?").join(", ");
  return executor.queryAll<ReplacementPolicyRow>(
    `SELECT id, plan_day_exercise_id, policy_kind, policy_id,
            policy_version, rule_json, revision
     FROM owned_plan_progression_policies
     WHERE plan_day_exercise_id IN (${placeholders})
     ORDER BY plan_day_exercise_id, id`,
    occurrenceIds,
  );
}

async function readReplacementCandidates(
  executor: QueryExecutor,
  sourceExerciseId: string,
): Promise<readonly ReplacementCandidateRow[]> {
  return executor.queryAll<ReplacementCandidateRow>(
    `SELECT entry.exercise_id,
            entry.canonical_name,
            entry.metric_profile,
            entry.metric_contract_version,
            entry.exercise_metric_generation,
            exercise.revision AS exercise_revision,
            entry.revision AS library_revision
     FROM exercise_library_entries entry
     JOIN exercises exercise ON exercise.id = entry.exercise_id
     LEFT JOIN exercise_owner_preferences preference
       ON preference.exercise_id = entry.exercise_id
     WHERE entry.exercise_id <> ?
       AND entry.availability = 'available'
       AND COALESCE(preference.hidden, 0) = 0
       AND COALESCE(preference.archived, 0) = 0
     ORDER BY entry.canonical_name, entry.exercise_id`,
    [sourceExerciseId],
  );
}

async function hydrateReplacementOccurrences(
  executor: QueryExecutor,
  rows: readonly ReplacementOccurrenceRow[],
): Promise<readonly ExerciseReplacementOccurrenceFacts[]> {
  const occurrenceIds = rows.map(
    ({ occurrence_id: occurrenceId }) => occurrenceId,
  );
  const [warmups, targets, policies] = await Promise.all([
    readReplacementWarmups(executor, occurrenceIds),
    readReplacementTargets(executor, occurrenceIds),
    readReplacementPolicies(executor, occurrenceIds),
  ]);
  return Object.freeze(rows.map((row) => {
    const policy = policies.find(
      ({ plan_day_exercise_id: occurrenceId }) =>
        occurrenceId === row.occurrence_id,
    );
    if (policy === undefined) {
      throw new Error("plan_impact_policy_missing");
    }
    return Object.freeze({
      occurrenceId: row.occurrence_id,
      occurrenceRevision: row.occurrence_revision,
      dayId: row.day_id,
      dayName: row.day_name,
      dayRevision: row.day_revision,
      dayOrdinal: row.day_ordinal,
      occurrenceOrdinal: row.occurrence_ordinal,
      restSeconds: row.rest_seconds,
      warmups: Object.freeze(warmups
        .filter(({ plan_day_exercise_id: occurrenceId }) =>
          occurrenceId === row.occurrence_id
        )
        .map((warmup) => Object.freeze({
          id: warmup.id,
          revision: warmup.revision,
          ordinal: warmup.ordinal,
          loadGrams: warmup.load_grams,
          reps: warmup.reps,
        }))),
      targets: Object.freeze(targets
        .filter(({ plan_day_exercise_id: occurrenceId }) =>
          occurrenceId === row.occurrence_id
        )
        .map((target) => Object.freeze({
          id: target.id,
          revision: target.revision,
          ordinal: target.ordinal,
          target: parseJsonRecord(target.target_json) as MetricTarget,
          units: parseJsonRecord(target.unit_json),
        }))),
      policy: Object.freeze({
        id: policy.id,
        revision: policy.revision,
        kind: policy.policy_kind,
        policyId: policy.policy_id,
        version: policy.policy_version,
        rule: parseJsonRecord(policy.rule_json),
      }),
    });
  }));
}

async function readExerciseReplacement(
  executor: QueryExecutor,
  input: Readonly<{ planId: string; occurrenceId: string }>,
): Promise<ExerciseReplacementRepositoryPreview | null> {
  const plan = await readPlan(executor, input.planId);
  if (plan === undefined || plan.origin === "bundled") {
    return null;
  }
  const allRows = await readReplacementOccurrenceRows(
    executor,
    input.planId,
  );
  const source = allRows.find(
    ({ occurrence_id: occurrenceId }) => occurrenceId === input.occurrenceId,
  );
  if (source === undefined) {
    return null;
  }
  const relatedRows = allRows.filter(
    ({ exercise_id: exerciseId }) => exerciseId === source.exercise_id,
  );
  const [occurrences, candidates] = await Promise.all([
    hydrateReplacementOccurrences(executor, relatedRows),
    readReplacementCandidates(executor, source.exercise_id),
  ]);
  return Object.freeze({
    planId: plan.id,
    planName: plan.name,
    planRevision: plan.revision,
    sourceOccurrenceId: source.occurrence_id,
    sourceExerciseId: source.exercise_id,
    sourceExerciseName: source.exercise_name,
    sourceMetricIdentity: replacementIdentity(source),
    hasInProgressWorkout: await hasInProgressWorkout(executor, plan.id),
    candidates: Object.freeze(candidates.map((candidate) => Object.freeze({
      exerciseId: candidate.exercise_id,
      name: candidate.canonical_name,
      metricIdentity: replacementIdentity(candidate),
      exerciseRevision: candidate.exercise_revision,
      libraryRevision: candidate.library_revision,
    }))),
    occurrences,
  });
}

function samePreview(
  actual: unknown,
  expected: unknown,
): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function readCommittedExerciseReplacement(
  executor: QueryExecutor,
  input: Readonly<{
    planId: string;
    expectedPlanRevision: number;
    replacementExerciseId: string;
    occurrences: readonly ExerciseReplacementOccurrenceFacts[];
  }>,
): Promise<ExerciseReplacementCommittedResult | null> {
  const plan = await readPlan(executor, input.planId);
  if (
    plan === undefined
    || plan.revision !== input.expectedPlanRevision + 1
    || input.occurrences.length === 0
  ) {
    return null;
  }
  const rows = await readReplacementOccurrenceRows(
    executor,
    input.planId,
  );
  const selectedRows = input.occurrences.map((expected) =>
    rows.find(
      ({ occurrence_id: occurrenceId }) =>
        occurrenceId === expected.occurrenceId,
    )
  );
  if (selectedRows.some((row) => row === undefined)) {
    return null;
  }
  const committedRows = selectedRows as readonly ReplacementOccurrenceRow[];
  if (committedRows.some((row, index) =>
    row.exercise_id !== input.replacementExerciseId
    || row.occurrence_revision
      !== input.occurrences[index]!.occurrenceRevision + 1
  )) {
    return null;
  }
  const actualFacts = await hydrateReplacementOccurrences(
    executor,
    committedRows,
  );
  const exactChildren = actualFacts.every((actual, index) => {
    const expected = input.occurrences[index]!;
    return actual.dayId === expected.dayId
      && actual.dayName === expected.dayName
      && actual.dayRevision === expected.dayRevision
      && actual.dayOrdinal === expected.dayOrdinal
      && actual.occurrenceOrdinal === expected.occurrenceOrdinal
      && actual.restSeconds === expected.restSeconds
      && JSON.stringify(actual.warmups) === JSON.stringify(expected.warmups)
      && JSON.stringify(actual.targets) === JSON.stringify(expected.targets)
      && JSON.stringify(actual.policy) === JSON.stringify(expected.policy);
  });
  if (!exactChildren) {
    return null;
  }
  return Object.freeze({
    outcome: "already_committed",
    planId: input.planId,
    planRevision: plan.revision,
    replacementExerciseId: input.replacementExerciseId,
    affectedOccurrenceIds: Object.freeze(
      input.occurrences.map(({ occurrenceId }) => occurrenceId),
    ),
    currentWorkoutUnaffected: await hasInProgressWorkout(
      executor,
      input.planId,
    ),
    invalidations: Object.freeze([]),
  });
}

function transformedBindings(
  input: ApplyDayRemovalRepositoryInput,
): readonly PlanImpactBindingFacts[] {
  const schedule = input.expectedPreview.schedule!;
  return Object.freeze(
    schedule.version.bindings
      .flatMap((binding) => {
        if (binding.planDayId !== input.dayId) {
          return [binding];
        }
        if (input.choice.kind === "replacement_day") {
          return [{
            ...binding,
            planDayId: input.choice.replacementDayId,
          }];
        }
        return [];
      })
      .map((binding, ordinal) => Object.freeze({
        ...binding,
        ordinal,
      })),
  );
}

function nextRotationPointer(
  input: ApplyDayRemovalRepositoryInput,
  bindings: readonly PlanImpactBindingFacts[],
): number | null {
  const version = input.expectedPreview.schedule!.version;
  if (version.mode === "weekday") {
    return null;
  }
  if (bindings.length === 0) {
    return 0;
  }
  if (input.choice.kind === "replacement_day") {
    return Math.min(version.rotationPointer!, bindings.length - 1);
  }
  const removedOrdinal = version.bindings.find(
    ({ planDayId }) => planDayId === input.dayId,
  )?.ordinal;
  const current = version.rotationPointer!;
  if (removedOrdinal === undefined || current < removedOrdinal) {
    return Math.min(current, bindings.length - 1);
  }
  if (current > removedOrdinal) {
    return Math.min(current - 1, bindings.length - 1);
  }
  return current % bindings.length;
}

async function applyOverrideChoices(
  transaction: SqliteTransactionExecutor,
  input: ApplyDayRemovalRepositoryInput,
  observer: PlanImpactRepositoryTestObserver,
): Promise<void> {
  for (const override of input.expectedPreview.affectedOverrides) {
    if (override.localDate < input.effectiveLocalDate) {
      continue;
    }
    await observer.beforeWrite?.("before_day_override_update", transaction);
    const result = input.choice.kind === "replacement_day"
      ? await transaction.execute(
          `UPDATE owned_plan_schedule_overrides
           SET plan_day_id = ?, revision = revision + 1
           WHERE id = ? AND state = 'pending' AND revision = ?`,
          [
            input.choice.replacementDayId,
            override.id,
            override.revision,
          ],
        )
      : await transaction.execute(
          `UPDATE owned_plan_schedule_overrides
           SET selection_kind = 'rest_day',
               plan_day_id = NULL,
               revision = revision + 1
           WHERE id = ? AND state = 'pending' AND revision = ?`,
          [override.id, override.revision],
        );
    if (result.changes !== 1) {
      throw new PlanImpactRepositoryError("plan_impact_preview_stale");
    }
  }
}

async function retireCurrentDay(
  transaction: SqliteTransactionExecutor,
  input: ApplyDayRemovalRepositoryInput,
  observer: PlanImpactRepositoryTestObserver,
): Promise<void> {
  const ordinal = input.expectedPreview.dayOrdinal;
  const currentDayCount = input.expectedPreview.currentDayCount;
  await observer.beforeWrite?.("before_day_retire", transaction);
  const retired = await transaction.execute(
    `UPDATE plan_days
     SET ordinal = ?, revision = revision + 1
     WHERE id = ? AND plan_id = ? AND ordinal = ? AND revision = ?`,
    [
      RETIRED_ORDINAL_BASE + ordinal,
      input.dayId,
      input.planId,
      ordinal,
      input.expectedPreview.dayRevision,
    ],
  );
  if (retired.changes !== 1) {
    throw new PlanImpactRepositoryError("plan_impact_preview_stale");
  }
  await transaction.execute(
    `UPDATE plan_days
     SET ordinal = ordinal + ?
     WHERE plan_id = ? AND ordinal > ? AND ordinal < ?`,
    [
      TEMPORARY_ORDINAL_BASE,
      input.planId,
      ordinal,
      currentDayCount,
    ],
  );
  await transaction.execute(
    `UPDATE plan_days
     SET ordinal = ordinal - ?
     WHERE plan_id = ?
       AND ordinal >= ?
       AND ordinal < ?`,
    [
      TEMPORARY_ORDINAL_BASE + 1,
      input.planId,
      TEMPORARY_ORDINAL_BASE,
      TEMPORARY_ORDINAL_BASE + currentDayCount,
    ],
  );
}

async function updateGraphState(
  transaction: SqliteTransactionExecutor,
  input: ApplyDayRemovalRepositoryInput,
): Promise<void> {
  const [row] = await transaction.queryAll<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM owned_plan_day_exercises occurrence
     JOIN owned_plan_working_set_targets target
       ON target.plan_day_exercise_id = occurrence.id
     JOIN plan_days day ON day.id = occurrence.plan_day_id
     JOIN plans plan ON plan.id = day.plan_id
     WHERE plan.id = ? AND day.ordinal < plan.days_per_week
       AND target.metric_profile = occurrence.metric_profile
       AND target.metric_contract_version =
         occurrence.metric_contract_version
       AND target.exercise_metric_generation =
         occurrence.exercise_metric_generation`,
    [input.planId],
  );
  const graphValid = row!.count > 0;
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
      input.committedAtMs,
      input.planId,
    ],
  );
}

async function readReceipt(
  executor: QueryExecutor,
  requestId: string,
): Promise<Readonly<{
  requestSha256: string;
  result: PlanImpactCommittedResult;
}> | null> {
  const [row] = await executor.queryAll<{ payload_json: string }>(
    `SELECT payload_json
     FROM owned_plan_schedule_events
     WHERE id = ?`,
    [`plan-impact-command:${requestId}`],
  );
  if (row === undefined) {
    return null;
  }
  const parsed = JSON.parse(row.payload_json) as {
    requestSha256?: unknown;
    result?: PlanImpactCommittedResult;
  };
  if (
    typeof parsed.requestSha256 !== "string"
    || parsed.result?.outcome !== "committed"
  ) {
    throw new Error("plan_impact_receipt_invalid");
  }
  return {
    requestSha256: parsed.requestSha256,
    result: parsed.result,
  };
}

async function replayReceipt(
  executor: QueryExecutor,
  input: Readonly<{
    requestId: string;
    requestSha256: string;
  }>,
): Promise<PlanImpactCommittedResult | null> {
  const receipt = await readReceipt(executor, input.requestId);
  if (receipt === null) {
    return null;
  }
  if (receipt.requestSha256 !== input.requestSha256) {
    throw new PlanImpactRepositoryError(
      "plan_impact_idempotency_conflict",
    );
  }
  return Object.freeze({
    ...receipt.result,
    outcome: "already_committed",
  });
}

async function applyExerciseReplacementTransaction(
  transaction: SqliteTransactionExecutor,
  input: ApplyExerciseReplacementRepositoryInput,
  observer: PlanImpactRepositoryTestObserver,
): Promise<ExerciseReplacementCommittedResult> {
  const current = await readExerciseReplacement(transaction, {
    planId: input.planId,
    occurrenceId: input.sourceOccurrenceId,
  });
  if (
    current === null
    || !samePreview(current, input.expectedPreview)
    || current.planRevision !== input.expectedPlanRevision
  ) {
    throw new PlanImpactRepositoryError("plan_impact_preview_stale");
  }
  const candidate = current.candidates.find(
    ({ exerciseId }) => exerciseId === input.replacementExerciseId,
  );
  if (
    candidate === undefined
    || candidate.metricIdentity.profile
      !== current.sourceMetricIdentity.profile
    || candidate.metricIdentity.contractVersion
      !== current.sourceMetricIdentity.contractVersion
    || candidate.metricIdentity.exerciseMetricGeneration
      !== current.sourceMetricIdentity.exerciseMetricGeneration
  ) {
    throw new PlanImpactRepositoryError(
      "plan_impact_replacement_incompatible",
    );
  }
  const expectedIds = input.scope === "this_occurrence"
    ? [input.sourceOccurrenceId]
    : current.occurrences.map(({ occurrenceId }) => occurrenceId);
  if (
    input.occurrences.length !== expectedIds.length
    || input.occurrences.some((occurrence, index) =>
      occurrence.occurrenceId !== expectedIds[index]
    )
    || JSON.stringify(input.occurrences)
      !== JSON.stringify(current.occurrences.filter(({ occurrenceId }) =>
        expectedIds.includes(occurrenceId)
      ))
  ) {
    throw new PlanImpactRepositoryError("plan_impact_preview_stale");
  }
  for (const occurrence of input.occurrences) {
    await transaction.execute(
      `UPDATE owned_progression_recommendations
       SET status = 'invalidated',
           decided_at_ms = ?
       WHERE status = 'pending'
         AND owned_plan_working_set_target_id IN (
           SELECT id
           FROM owned_plan_working_set_targets
           WHERE plan_day_exercise_id = ?
         )`,
      [input.committedAtMs, occurrence.occurrenceId],
    );
    await observer.beforeWrite?.(
      "before_replacement_occurrence_update",
      transaction,
    );
    const updated = await transaction.execute(
      `UPDATE owned_plan_day_exercises
       SET exercise_id = ?, revision = revision + 1
       WHERE id = ? AND exercise_id = ? AND revision = ?`,
      [
        input.replacementExerciseId,
        occurrence.occurrenceId,
        input.sourceExerciseId,
        occurrence.occurrenceRevision,
      ],
    );
    if (updated.changes !== 1) {
      throw new PlanImpactRepositoryError("plan_impact_preview_stale");
    }
  }
  await observer.beforeWrite?.(
    "before_replacement_plan_update",
    transaction,
  );
  const planUpdated = await transaction.execute(
    `UPDATE plans
     SET revision = revision + 1
     WHERE id = ? AND revision = ?`,
    [input.planId, input.expectedPlanRevision],
  );
  if (planUpdated.changes !== 1) {
    throw new PlanImpactRepositoryError("plan_impact_preview_stale");
  }
  const affectedOccurrenceIds = Object.freeze(
    input.occurrences.map(({ occurrenceId }) => occurrenceId),
  );
  const result: ExerciseReplacementCommittedResult = Object.freeze({
    outcome: "committed",
    planId: input.planId,
    planRevision: input.expectedPlanRevision + 1,
    replacementExerciseId: input.replacementExerciseId,
    affectedOccurrenceIds,
    currentWorkoutUnaffected: current.hasInProgressWorkout,
    invalidations: replacementInvalidations(
      input.planId,
      input.sourceExerciseId,
      input.replacementExerciseId,
    ),
  });
  return result;
}

async function applyDayRemovalTransaction(
  transaction: SqliteTransactionExecutor,
  input: ApplyDayRemovalRepositoryInput,
  observer: PlanImpactRepositoryTestObserver,
): Promise<PlanImpactCommittedResult> {
  const replay = await replayReceipt(transaction, input);
  if (replay !== null) {
    return replay;
  }
  const current = await readDayRemoval(transaction, {
    planId: input.planId,
    dayId: input.dayId,
  });
  if (current === null || !samePreview(current, input.expectedPreview)) {
    throw new PlanImpactRepositoryError("plan_impact_preview_stale");
  }
  if (current.hasInProgressWorkout) {
    throw new PlanImpactRepositoryError("plan_impact_workout_active");
  }
  if (
    current.planRevision !== input.expectedPlanRevision
    || current.schedule === null
    || current.schedule.revision !== input.expectedScheduleRevision
  ) {
    throw new PlanImpactRepositoryError("plan_impact_preview_stale");
  }
  const replacementDayId = input.choice.kind === "replacement_day"
    ? input.choice.replacementDayId
    : null;
  if (
    replacementDayId !== null
    && !current.replacementDays.some(
      ({ id }) => id === replacementDayId,
    )
  ) {
    throw new PlanImpactRepositoryError(
      "plan_impact_replacement_invalid",
    );
  }

  const bindings = transformedBindings(input);
  const version = current.schedule.version;
  const versionNumber = version.versionNumber + 1;
  const versionId = `plan-impact-version:${input.requestSha256}`;
  await transaction.execute(
    `INSERT INTO owned_plan_schedule_versions
      (id, schedule_id, version_number, effective_local_date, mode,
       timezone, rotation_pointer, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      versionId,
      current.schedule.id,
      versionNumber,
      input.effectiveLocalDate,
      version.mode,
      version.timeZone,
      nextRotationPointer(input, bindings),
      input.committedAtMs,
    ],
  );
  for (const binding of bindings) {
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_bindings
        (id, schedule_version_id, mode, ordinal, week_index, weekday,
         plan_day_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        `${versionId}:binding:${binding.ordinal}`,
        versionId,
        version.mode,
        binding.ordinal,
        binding.weekIndex,
        binding.weekday,
        binding.planDayId,
      ],
    );
  }
  await applyOverrideChoices(transaction, input, observer);
  await retireCurrentDay(transaction, input, observer);

  await observer.beforeWrite?.("before_day_aggregate_update", transaction);
  const planUpdated = await transaction.execute(
    `UPDATE plans
     SET days_per_week = days_per_week - 1,
         revision = revision + 1
     WHERE id = ? AND revision = ? AND days_per_week = ?`,
    [
      input.planId,
      input.expectedPlanRevision,
      input.expectedPreview.currentDayCount,
    ],
  );
  const scheduleUpdated = await transaction.execute(
    `UPDATE owned_plan_schedules
     SET revision = revision + 1
     WHERE id = ? AND revision = ?`,
    [current.schedule.id, input.expectedScheduleRevision],
  );
  if (planUpdated.changes !== 1 || scheduleUpdated.changes !== 1) {
    throw new PlanImpactRepositoryError("plan_impact_preview_stale");
  }
  await updateGraphState(transaction, input);

  const result: PlanImpactCommittedResult = Object.freeze({
    outcome: "committed",
    planId: input.planId,
    planRevision: input.expectedPlanRevision + 1,
    scheduleRevision: input.expectedScheduleRevision + 1,
    currentWorkoutUnaffected: false,
    invalidations: invalidations(input.planId, current.schedule.id),
  });
  await transaction.execute(
    `INSERT INTO owned_plan_schedule_events
      (id, schedule_id, event_type, local_date, payload_json,
       schedule_revision, created_at_ms)
     VALUES (?, ?, 'plan_day_removed', ?, ?, ?, ?)`,
    [
      `plan-impact-command:${input.requestId}`,
      current.schedule.id,
      input.effectiveLocalDate,
      JSON.stringify({
        requestSha256: input.requestSha256,
        planId: input.planId,
        dayId: input.dayId,
        choice: input.choice,
        result,
      }),
      result.scheduleRevision,
      input.committedAtMs,
    ],
  );
  return result;
}

function unwrapPlanImpactError(error: unknown): never {
  const cause = (error as { cause?: unknown })?.cause;
  if (cause instanceof PlanImpactRepositoryError) {
    throw cause;
  }
  throw error;
}

export function createPlanImpactRepository(
  kernel: SqliteKernel,
  observer: PlanImpactRepositoryTestObserver,
): PlanImpactRepository {
  return Object.freeze({
    readCommandResult: (input) => replayReceipt(kernel, input),
    readDayRemoval: (input) => readDayRemoval(kernel, input),
    readExerciseReplacement: (input) =>
      readExerciseReplacement(kernel, input),
    readCommittedExerciseReplacement: (input) =>
      readCommittedExerciseReplacement(kernel, input),
    async applyDayRemoval(input) {
      try {
        return await kernel.write((transaction) =>
          applyDayRemovalTransaction(transaction, input, observer)
        );
      } catch (error) {
        return unwrapPlanImpactError(error);
      }
    },
    async applyExerciseReplacement(input) {
      try {
        return await kernel.write((transaction) =>
          applyExerciseReplacementTransaction(transaction, input, observer)
        );
      } catch (error) {
        return unwrapPlanImpactError(error);
      }
    },
  });
}
