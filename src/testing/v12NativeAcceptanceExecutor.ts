import type {
  SqliteKernel,
  SqliteReadTransactionExecutor,
} from "../platform/sqlite/sqliteKernel";
import {
  V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS,
  v12NativeAcceptanceCaseContract,
  type V12NativeAcceptanceCaseContract,
  type V12NativeAcceptanceOperationKind,
  type V12NativeAcceptanceShard,
} from "./contracts/phase15Workout.contract";
import {
  runMultiPlanRunningContractCase,
  type MultiPlanRunningContractCaseId,
} from "./contracts/multiPlanRunning.contract";
import type { RunningPlanRuntimePort } from "../bootstrap/runningPlanRuntime";
import type { OwnedPlanRuntimePort } from "../bootstrap/ownedPlanRuntime";
import {
  runningTargetForDistance,
  type RunningPlanAggregate,
  type RunningSessionKind,
  type RunningSessionRevision,
} from "../domains/running/contracts";
import {
  archiveCustomExercise,
  createCustomCopy,
  createCustomExercise,
  editCustomExercise,
  previewCustomExerciseArchive,
  restoreCustomExercise,
  setExerciseFavorite,
  setExerciseHidden,
} from "../domains/library/customExerciseCommands";
import { migrateCustomExerciseMetricProfile } from "../domains/metrics/migrateCustomExerciseMetricProfile";
import {
  createCustomExerciseRepository,
  type CustomExerciseRepository,
} from "../platform/sqlite/repositories/customExerciseRepository";
import { createContentRepository } from "../platform/sqlite/repositories/contentRepository";
import { createLibrarySearchRepository } from "../platform/sqlite/repositories/librarySearchRepository";
import { createMetricRepository } from "../platform/sqlite/repositories/metricRepository";
import { createPlansWorkoutRepository } from "../platform/sqlite/repositories/plansWorkoutRepository";
import { createWorkoutRepository } from "../platform/sqlite/repositories/workoutRepository";
import { createWorkoutOutcomeRepository } from "../platform/sqlite/repositories/workoutOutcomeRepository";
import { createRestRepository } from "../platform/sqlite/repositories/restRepository";
import { createWorkoutPreferenceRepository } from "../platform/sqlite/repositories/workoutPreferenceRepository";
import { createOwnedPlanRepository } from "../platform/sqlite/repositories/ownedPlanRepository";
import { createStarterPlanRepository } from "../platform/sqlite/repositories/starterPlanRepository";
import { runtimeSha256 } from "../platform/crypto/runtimeSha256";
import { parseAcceptedPhase2Catalog } from "./contracts/phase2Content.contract";
import fullBodyFoundationAsset from "../../assets/content/full-body-foundation.v1.json";
import starterPlansAsset from "../../assets/content/starter-plans.v2.json";
import starterPlansAcceptanceAsset from "../../artifacts/review/phase2/starter-plans-acceptance.json";
import { parseFullBodyFoundation } from "../domains/content";
import { activateStarterPlan, createStarterPlanActivationConfirmationToken, parseAcceptedStarterPlanPack } from "../domains/plans";
import { startWorkout } from "../domains/workout/startWorkout";
import { addWorkingSet, completeSet, updateActiveSetDraft } from "../domains/workout/setCommands";
import { addExercise, removeExercise, reorderExercises, replaceExercise } from "../domains/workout/sessionExerciseCommands";
import { undoCompletedSet } from "../domains/workout/undoCompletedSet";
import { presentWorkoutSession } from "../domains/workout/workoutPresentation";
import { WorkoutCommandConflictError } from "../domains/workout/activeWorkout";
import { adjustRest, pauseRest, resumeRest, startManualRest } from "../domains/rest/restCommands";

export type { V12NativeAcceptanceShard } from "./contracts/phase15Workout.contract";

export type V12NativeAcceptanceRequest = Readonly<{
  shard: V12NativeAcceptanceShard;
  caseId: string;
  fixtureId: "v12-synthetic-fixtures-r18";
  title: string;
  source: string;
  requirement: string;
  action: string;
  readback: string;
  sourceProbe: string;
  authorityTables: readonly string[];
  nonce: string;
}>;

export type V12NativeAcceptanceSourceState = Readonly<{
  probe_id: string;
  facts_sha256: string;
  source_sha256: string;
  row_count: number;
  table_count: number;
  schema_version: number;
}>;

export type V12NativeAcceptanceSourceReceipt = Readonly<{
  schema_version: 2;
  producer: "v12-native-acceptance-source/v2";
  authority: "sqlite-production-operation";
  shard: V12NativeAcceptanceShard;
  case_id: string;
  nonce: string;
  action_id: string;
  operation_id: string;
  operation_kind: V12NativeAcceptanceOperationKind;
  operation_result: "read" | "committed";
  operation_result_sha256: string;
  operation_handler_id: string;
  operation_postcondition_id: string;
  command_receipt_id: string | null;
  command_outcome: "committed" | "already_committed" | null;
  committed_effects: number;
  source_probe: string;
  authority_tables: readonly string[];
  pre: V12NativeAcceptanceSourceState;
  action: V12NativeAcceptanceSourceState;
  post: V12NativeAcceptanceSourceState;
  action_request_sha256: string;
  source_receipt_sha256: string;
}>;

export type V12NativeAcceptanceUiReadback = Readonly<{
  schema_version: 2;
  producer: "v12-native-acceptance-ui-readback/v2";
  shard: V12NativeAcceptanceShard;
  case_id: string;
  nonce: string;
  declared_action: string;
  declared_readback: string;
  readback_id: string;
  source_receipt_sha256: string;
  ui_receipt_sha256: string;
}>;

export type V12NativeAcceptanceReadbacks = Readonly<{
  source_receipt: V12NativeAcceptanceSourceReceipt;
  ui_readback: V12NativeAcceptanceUiReadback;
}>;

const HASH = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{48}$/u;
const TABLE = /^[a-z][a-z0-9_]{1,80}$/u;

type V12OperationFacts = Readonly<{
  handler_id: string;
  postcondition_id: string;
  authoritative_readback: unknown;
  receipt_id: string | null;
  outcome: "committed" | "already_committed" | null;
  committed_effects: number;
}>;

type V12NativeAcceptanceProductionHandlerInput = Readonly<{
  kernel: SqliteKernel;
  contract: V12NativeAcceptanceCaseContract;
  request?: V12NativeAcceptanceRequest;
  runtime?: V12NativeAcceptanceProductionRuntime;
}>;

/**
 * Production command ports deliberately live at the acceptance boundary.  The
 * executor may read a receipt to prove a command, but it can never mint one:
 * writes remain inside the owning repository/domain runtime.
 */
export type V12NativeAcceptanceProductionRuntime = Readonly<{
  running?: RunningPlanRuntimePort;
  ownedPlans?: OwnedPlanRuntimePort;
  customExercises?: CustomExerciseRepository;
}>;

export type V12NativeAcceptanceProductionHandler = Readonly<{
  handlerId: string;
  operationIds: readonly string[];
  prepare?(input: V12NativeAcceptanceProductionHandlerInput): Promise<void>;
  execute(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "read" | "committed"; facts: unknown }>>;
}>;

const TABLE_FACT_COLUMNS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  app_settings: Object.freeze(["key", "value_version", "value_json", "revision", "updated_at_ms"]),
  automatic_backup_state: Object.freeze(["id", "authority_state", "mutation_generation", "backed_up_generation", "status_code", "dirty_since_ms"]),
  bodyweight_command_receipts: Object.freeze(["request_id", "request_sha256", "entry_id", "owner_id", "result_json", "committed_at_ms"]),
  bodyweight_entries: Object.freeze(["id", "owner_id", "current_revision", "lifecycle", "created_at_ms"]),
  bodyweight_entry_events: Object.freeze(["id", "entry_id", "owner_id", "revision", "event_id", "operation", "local_date", "timezone", "grams", "occurred_at_ms"]),
  custom_exercise_mutation_receipts: Object.freeze(["request_id", "mutation_kind", "request_json", "result_json", "committed_at_ms"]),
  exercise_library_entries: Object.freeze(["exercise_id", "origin", "canonical_name", "exercise_type", "metric_profile", "revision"]),
  exercise_owner_preferences: Object.freeze(["exercise_id", "favorite", "hidden", "archived", "revision", "updated_at_ms"]),
  exercise_search_terms: Object.freeze(["id", "exercise_id", "kind", "ordinal", "display_text", "normalized_text"]),
  exercises: Object.freeze(["id", "origin", "name", "metric_profile", "metric_contract_version", "exercise_metric_generation", "revision"]),
  history_projection_metric_aggregates: Object.freeze(["subject_id", "exercise_id", "identity_key", "comparator_key", "reference_target_json", "aggregate_json"]),
  history_projection_freshness: Object.freeze(["subject_id", "applied_revision", "updated_at_ms"]),
  history_subject_revisions: Object.freeze(["subject_id", "revision", "updated_at_ms"]),
  imported_activities: Object.freeze(["id", "source", "source_activity_id", "started_at_ms", "aggregate_json", "imported_at_ms"]),
  imported_activity_identities: Object.freeze(["activity_id", "source_kind", "account_namespace", "external_activity_id", "aggregate_revision", "accepted_normalized_sha256", "removal_state"]),
  imported_activity_receipts: Object.freeze(["id", "activity_id", "request_sha256", "committed_at_ms"]),
  imported_activity_removal_events: Object.freeze(["id", "activity_id", "removed_at_ms", "reason"]),
  metric_profile_migration_events: Object.freeze(["idempotency_key", "exercise_id", "from_metric_profile", "to_metric_profile", "to_exercise_metric_generation", "exercise_revision", "result_json", "migrated_at_ms"]),
  owned_plan_aggregate_states: Object.freeze(["plan_id", "lifecycle", "graph_status", "missing_requirement_code"]),
  owned_plan_day_exercises: Object.freeze(["id", "plan_day_id", "exercise_id", "ordinal", "metric_profile", "metric_contract_version", "exercise_metric_generation", "revision"]),
  owned_plan_mutation_requests: Object.freeze(["request_id", "request_sha256", "operation", "source_plan_id", "result_plan_id", "result_revision", "result_json", "committed_at_ms"]),
  owned_plan_schedule_versions: Object.freeze(["id", "schedule_id", "version_number", "effective_local_date", "mode", "timezone"]),
  owned_plan_schedule_events: Object.freeze(["id", "schedule_id", "event_type", "local_date", "payload_json", "schedule_revision", "created_at_ms"]),
  owned_plan_schedules: Object.freeze(["id", "plan_id", "lifecycle", "revision", "activated_at_ms", "deactivated_at_ms"]),
  pending_effects: Object.freeze(["id", "effect_type", "idempotency_key", "subject_id", "expected_revision", "status", "attempt_count"]),
  portability_restore_state: Object.freeze(["id", "state", "updated_at_ms"]),
  portable_owner_identity: Object.freeze(["id", "owner_namespace"]),
  plan_days: Object.freeze(["id", "plan_id", "ordinal", "name", "revision"]),
  plans: Object.freeze(["id", "origin", "name", "is_active", "revision", "plan_kind"]),
  progression_recommendations: Object.freeze(["id", "exercise_id", "status", "source_revision", "target_revision", "decided_at_ms"]),
  running_plan_events: Object.freeze(["id", "plan_id", "event_type", "payload_json", "created_at_ms"]),
  running_plan_receipts: Object.freeze(["request_id", "request_sha256", "operation", "plan_id", "expected_plan_revision", "result_json", "committed_at_ms"]),
  running_activity_current_matches: Object.freeze(["opportunity_id", "activity_id", "relation_revision", "event_id"]),
  running_activity_match_events: Object.freeze(["id", "activity_id", "opportunity_id", "prior_opportunity_id", "action", "activity_revision", "opportunity_revision", "prior_relation_revision", "relation_revision", "request_sha256", "created_at_ms"]),
  running_activity_match_receipts: Object.freeze(["request_id", "request_sha256", "activity_id", "opportunity_id", "relation_revision", "result_kind", "committed_at_ms"]),
  running_plans: Object.freeze(["plan_id", "status", "revision", "created_at_ms"]),
  running_session_revisions: Object.freeze(["id", "plan_id", "session_kind", "revision", "definition_json", "created_at_ms"]),
  running_session_slot_revisions: Object.freeze(["id", "slot_root_id", "session_revision_id", "revision", "ordinal"]),
  running_session_slots: Object.freeze(["id", "plan_id", "weekday", "ordinal", "session_revision_id"]),
  schedule_collision_projections: Object.freeze(["outcome_id", "selected_kind", "selected_opportunity_id", "effective_local_date", "moved_local_date", "acknowledged"]),
  schedule_collision_receipts: Object.freeze(["request_id", "request_sha256", "outcome_id", "result_json", "committed_at_ms"]),
  session_advanced_timing_states: Object.freeze(["session_id", "session_set_id", "revision", "status", "mode", "progress_json"]),
  session_undo_snapshots: Object.freeze(["id", "session_id", "completed_set_id", "idempotency_key", "snapshot_version", "consumed_at_ms", "created_at_ms"]),
  session_exercises: Object.freeze(["id", "session_id", "exercise_id", "ordinal", "exercise_name", "metric_profile", "status", "revision"]),
  session_rest_states: Object.freeze(["session_id", "status", "remaining_ms", "next_set_id", "revision"]),
  session_sets: Object.freeze(["id", "session_exercise_id", "set_kind", "ordinal", "metric_profile", "observed_json", "status", "completion_idempotency_key", "revision"]),
  starter_plan_activation_requests: Object.freeze(["request_id", "request_sha256", "source_namespace", "template_id", "source_revision", "choice", "committed_at_ms"]),
  workout_provenance: Object.freeze(["workout_session_id", "plan_id", "plan_day_id", "schedule_id", "schedule_version_id", "source_revision"]),
  workout_receipts: Object.freeze(["id", "workout_session_id", "request_sha256", "committed_at_ms"]),
  workout_session_exercise_edit_receipts: Object.freeze(["request_id", "request_sha256", "operation", "session_id", "subject_session_exercise_id", "replacement_session_exercise_id", "result_session_revision", "result_json"]),
  workout_session_exercise_reorder_receipts: Object.freeze(["request_id", "request_sha256", "operation", "session_id", "ordered_session_exercise_ids_json", "result_session_revision", "result_json"]),
  workout_sessions: Object.freeze(["id", "plan_id", "plan_day_id", "source", "status", "local_date", "active_session_exercise_id", "active_set_id", "revision"]),
});

const EMPTY_POSTCONDITION_CASES = new Set([
  "workout.scheduled-rest-empty",
  "library.neutral-plan-chooser",
  "library.true-no-plans",
  "library.running-create-zero-sessions",
]);

export function authorityTablesForV12NativeAcceptance(
  shard: V12NativeAcceptanceShard,
  caseId: string,
  sourceProbe: string,
): readonly string[] {
  const contract = v12NativeAcceptanceCaseContract(shard, caseId);
  const tables = contract.probes.post.tables;
  if (sourceProbe !== contract.sourceProbe) {
    throw new Error("v12_native_acceptance_authority_missing");
  }
  return tables;
}

export function validateV12NativeAcceptanceAuthorityTables(
  tables: readonly string[] | undefined,
): tables is readonly string[] {
  return Array.isArray(tables) && tables.length > 0 && tables.every((table) => TABLE.test(table));
}

function stableJson(value: unknown): string {
  if (value === undefined) throw new Error("v12_native_acceptance_operation_result_invalid");
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}

function quoteIdentifier(value: string): string {
  return `"${value}"`;
}

async function readCaseFacts(
  query: SqliteReadTransactionExecutor,
  contract: V12NativeAcceptanceCaseContract,
): Promise<Readonly<{ tables: readonly Readonly<{ table: string; columns: readonly string[]; rows: readonly unknown[] }>[]; rowCount: number }>> {
  const facts = [] as Readonly<{ table: string; columns: readonly string[]; rows: readonly unknown[] }>[];
  let rowCount = 0;
  for (const table of contract.probes.post.tables) {
    const columns = TABLE_FACT_COLUMNS[table]!;
    const selection = columns.map(quoteIdentifier).join(", ");
    const rows = await query.queryAll<Record<string, unknown>>(
      `SELECT ${selection} FROM ${quoteIdentifier(table)} ORDER BY ${quoteIdentifier(columns[0]!)}`,
    );
    const ordered = [...rows].sort((left, right) => stableJson(left).localeCompare(stableJson(right), "en"));
    facts.push(Object.freeze({ table, columns, rows: Object.freeze(ordered) }));
    rowCount += rows.length;
  }
  return Object.freeze({ tables: Object.freeze(facts), rowCount });
}

function operationFacts(input: Readonly<{
  contract: V12NativeAcceptanceCaseContract;
  authoritativeReadback: unknown;
  receiptId?: string;
  outcome?: "committed" | "already_committed";
  committedEffects?: number;
}>): V12OperationFacts {
  return Object.freeze({
    handler_id: input.contract.operation.handlerId,
    postcondition_id: input.contract.operation.postcondition.id,
    authoritative_readback: input.authoritativeReadback,
    receipt_id: input.receiptId ?? null,
    outcome: input.outcome ?? null,
    committed_effects: input.committedEffects ?? 0,
  });
}

/**
 * Workout acceptance data is always built through the production starter-plan
 * activation and start-workout commands.  The nonce is folded into the
 * activation timestamp, so a state row from another acceptance request can
 * never satisfy this case's durable identity.
 */
function workoutFixtureActivatedAt(request: V12NativeAcceptanceRequest): number {
  return V12_RUNNING_SEED_AT_MS + Number.parseInt(request.nonce.slice(0, 8), 16);
}

function workoutFixturePlanId(request: V12NativeAcceptanceRequest): string {
  return `plan_copy_${workoutFixtureActivatedAt(request)}`;
}

async function workoutFixtureSessionId(kernel: SqliteKernel, request: V12NativeAcceptanceRequest): Promise<string | null> {
  const [session] = await kernel.queryAll<Readonly<{ id: string }>>(
    `SELECT id FROM workout_sessions
     WHERE plan_id = ? AND started_at_ms = ? AND source = 'alternate_day'
     ORDER BY id LIMIT 1`,
    [workoutFixturePlanId(request), workoutFixtureActivatedAt(request) + 1_000],
  );
  return session?.id ?? null;
}

async function prepareWorkoutFixture(input: V12NativeAcceptanceProductionHandlerInput): Promise<void> {
  const request = requireRequest(input);
  const planId = workoutFixturePlanId(request);
  const [existing] = await input.kernel.queryAll<Readonly<{ id: string }>>(
    "SELECT id FROM plans WHERE id = ? AND origin = 'copied' AND plan_kind = 'strength'",
    [planId],
  );
  if (existing !== undefined) return;
  const activation = await activateStarterPlan({
    fixture: parseFullBodyFoundation(fullBodyFoundationAsset),
    repository: createPlansWorkoutRepository(input.kernel),
    activatedAtMs: workoutFixtureActivatedAt(request),
    startLocalDate: "2027-01-15",
    timezone: "UTC",
  });
  if (activation.plan.id !== planId || activation.days.length === 0) {
    throw new Error("v12_native_acceptance_workout_fixture_seed_invalid");
  }
}

async function workoutFixtureDayId(kernel: SqliteKernel, request: V12NativeAcceptanceRequest): Promise<string> {
  const [day] = await kernel.queryAll<Readonly<{ id: string }>>(
    "SELECT id FROM plan_days WHERE plan_id = ? ORDER BY ordinal LIMIT 1",
    [workoutFixturePlanId(request)],
  );
  if (day === undefined) throw new Error("v12_native_acceptance_workout_fixture_day_missing");
  return day.id;
}

async function prepareActiveWorkoutFixture(input: V12NativeAcceptanceProductionHandlerInput): Promise<void> {
  await prepareWorkoutFixture(input);
  const request = requireRequest(input);
  const existingSessionId = await workoutFixtureSessionId(input.kernel, request);
  if (existingSessionId !== null) return;
  const started = await startWorkout({
    repository: createPlansWorkoutRepository(input.kernel),
    request: {
      mode: "alternate",
      planId: workoutFixturePlanId(request),
      planDayId: await workoutFixtureDayId(input.kernel, request),
      localDate: "2027-01-15",
      timezone: "UTC",
      startedAtMs: workoutFixtureActivatedAt(request) + 1_000,
      commandIdentity: `v12:${request.caseId}:${request.nonce}`,
    },
  });
  if (started.status !== "in_progress" || await workoutFixtureSessionId(input.kernel, request) !== started.id) {
    throw new Error("v12_native_acceptance_workout_fixture_start_invalid");
  }
}

async function workoutFixtureActiveSet(kernel: SqliteKernel, request: V12NativeAcceptanceRequest) {
  const [set] = await kernel.queryAll<Readonly<{
    session_id: string;
    session_revision: number;
    exercise_id: string;
    exercise_revision: number;
    set_id: string;
    set_revision: number;
    metric_profile: "load_reps" | "timed_hold" | "unscored" | "fixed_time" | "intervals";
    metric_contract_version: number;
    exercise_metric_generation: number;
  }>>(
    `SELECT session.id AS session_id, session.revision AS session_revision,
            exercise.id AS exercise_id, exercise.revision AS exercise_revision,
            set_row.id AS set_id, set_row.revision AS set_revision,
            set_row.metric_profile, set_row.metric_contract_version,
            set_row.exercise_metric_generation
     FROM workout_sessions session
     JOIN session_exercises exercise ON exercise.session_id = session.id
     JOIN session_sets set_row ON set_row.session_exercise_id = exercise.id
     WHERE session.id = ? AND session.status = 'in_progress'
       AND set_row.set_kind = 'working' AND set_row.status IN ('planned', 'draft')
     ORDER BY exercise.ordinal, set_row.ordinal
     LIMIT 1`,
    [await workoutFixtureSessionId(kernel, request)],
  );
  if (set === undefined) throw new Error("v12_native_acceptance_workout_fixture_set_missing");
  return set;
}

async function workoutFixtureExercises(kernel: SqliteKernel, request: V12NativeAcceptanceRequest) {
  const sessionId = await workoutFixtureSessionId(kernel, request);
  if (sessionId === null) throw new Error("v12_native_acceptance_workout_fixture_session_missing");
  const rows = await kernel.queryAll<Readonly<{ id: string; exercise_id: string; revision: number; ordinal: number }>>(
    `SELECT id, exercise_id, revision, ordinal
     FROM session_exercises
     WHERE session_id = ?
     ORDER BY ordinal, id`,
    [sessionId],
  );
  if (rows.length === 0) throw new Error("v12_native_acceptance_workout_fixture_exercise_missing");
  return Object.freeze(rows);
}

async function workoutAlternateLibraryExercise(kernel: SqliteKernel, request: V12NativeAcceptanceRequest, currentExerciseId: string): Promise<string> {
  const readAvailable = async () => kernel.queryAll<Readonly<{ id: string }>>(
    `SELECT entry.exercise_id AS id
     FROM exercise_library_entries entry
     JOIN exercises exercise ON exercise.id = entry.exercise_id
     WHERE entry.exercise_id <> ? AND entry.availability = 'available'
     ORDER BY exercise.name, entry.exercise_id LIMIT 1`,
    [currentExerciseId],
  );
  let [exercise] = await readAvailable();
  if (exercise === undefined) {
    const exerciseId = `v12:workout:${request.nonce}:library-exercise`;
    await createCustomExercise({
      repository: createCustomExerciseRepository(kernel),
      invalidate: async () => undefined,
      input: {
        requestId: `v12:workout:${request.nonce}:library-exercise-seed`,
        exerciseId,
        name: "V12 workout added exercise",
        aliases: ["V12 added"],
        exerciseType: "strength",
        movementClass: "compound",
        primaryMuscles: ["quadriceps"],
        secondaryMuscles: ["glutes"],
        equipment: ["barbell"],
        metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
        defaultRestSeconds: 60,
        progression: { kind: "manual_hold", version: 1 },
        createdAtMs: workoutFixtureActivatedAt(request) + 1_500,
      },
    });
    [exercise] = await readAvailable();
  }
  if (exercise === undefined) throw new Error("v12_native_acceptance_workout_library_exercise_missing");
  return exercise.id;
}

async function workoutAuthorityReadback(input: V12NativeAcceptanceProductionHandlerInput): Promise<unknown> {
  if (input.kernel.readSnapshot === undefined) throw new Error("v12_native_acceptance_snapshot_unavailable");
  return input.kernel.readSnapshot((query) => readCaseFacts(query, input.contract));
}

async function executeWorkoutRepositoryRead(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "read"; facts: unknown }>> {
  const request = requireRequest(input);
  const requiresActiveWorkout = input.contract.operation.handlerId.startsWith("active-workout.")
    || input.contract.operation.handlerId.startsWith("rest.")
    || input.contract.operation.handlerId.startsWith("workout.workout-outcome-repository.get-session-detail");
  if (requiresActiveWorkout) await prepareActiveWorkoutFixture(input);
  else await prepareWorkoutFixture(input);
  const plans = createPlansWorkoutRepository(input.kernel);
  const sessionId = await workoutFixtureSessionId(input.kernel, request);
  switch (input.contract.operation.handlerId) {
    case "workout.plans-workout-repository.get-today-view":
    case "workout.plans-workout-repository.get-plan-days": {
      const days = await plans.getPlanDays(workoutFixturePlanId(request));
      if (days.length === 0) throw new Error("v12_native_acceptance_workout_read_precondition_missing");
      break;
    }
    case "active-workout.workout-repository.get-workout-session": {
      if (sessionId === null || await createWorkoutRepository(input.kernel).getWorkoutSession(sessionId) === null) {
        throw new Error("v12_native_acceptance_workout_read_precondition_missing");
      }
      break;
    }
    case "active-workout.workout-repository.get-active-workout": {
      if (sessionId === null || (await createWorkoutRepository(input.kernel).getActiveWorkout(sessionId)).status !== "in_progress") {
        throw new Error("v12_native_acceptance_workout_read_precondition_missing");
      }
      break;
    }
    case "rest.rest-repository.get-rest-context": {
      if (sessionId === null || await createRestRepository(input.kernel).getRestContext(sessionId) === null) {
        throw new Error("v12_native_acceptance_workout_read_precondition_missing");
      }
      break;
    }
    case "workout.workout-outcome-repository.get-session-detail": {
      if (sessionId === null) throw new Error("v12_native_acceptance_workout_read_precondition_missing");
      const detail = await createWorkoutOutcomeRepository(input.kernel).getSessionDetail(sessionId);
      if (detail.id !== sessionId || detail.status !== "in_progress" || detail.exercises.length === 0) {
        throw new Error("v12_native_acceptance_workout_read_precondition_missing");
      }
      break;
    }
    default:
      throw new Error("v12_native_acceptance_workout_read_handler_unimplemented");
  }
  return Object.freeze({ result: "read" as const, facts: operationFacts({
    contract: input.contract,
    authoritativeReadback: await workoutAuthorityReadback(input),
  }) });
}

async function executeWorkoutPresentationRead(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "read"; facts: unknown }>> {
  await prepareActiveWorkoutFixture(input);
  const request = requireRequest(input);
  const sessionId = await workoutFixtureSessionId(input.kernel, request);
  if (sessionId === null) throw new Error("v12_native_acceptance_workout_read_precondition_missing");
  const view = await createWorkoutRepository(input.kernel).getActiveWorkout(sessionId);
  const projection = presentWorkoutSession(view);
  if (projection.sessionId !== sessionId || projection.revision !== view.revision || projection.exercises.length === 0
    || projection.exercises.some((exercise) => exercise.workingSets.length === 0)) {
    throw new Error("v12_native_acceptance_workout_presentation_postcondition_failed");
  }
  return Object.freeze({ result: "read" as const, facts: operationFacts({
    contract: input.contract,
    authoritativeReadback: await workoutAuthorityReadback(input),
  }) });
}

async function executeWorkoutCompleteSetConflict(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "read"; facts: unknown }>> {
  await prepareActiveWorkoutFixture(input);
  const request = requireRequest(input);
  const set = await workoutFixtureActiveSet(input.kernel, request);
  if (set.metric_profile !== "load_reps") throw new Error("v12_native_acceptance_workout_metric_precondition_missing");
  let conflict = false;
  try {
    await completeSet({
      repository: createWorkoutRepository(input.kernel),
      haptics: { committed: async () => undefined, cue: async () => undefined },
      invalidate: async () => undefined,
      drainEffects: async () => undefined,
      input: {
        sessionId: set.session_id,
        setId: set.set_id,
        expectedSessionRevision: set.session_revision,
        expectedSetRevision: set.set_revision + 1,
        completionIdempotencyKey: `v12:workout:${request.caseId}:${request.nonce}:conflict`,
        metricIdentity: {
          profile: "load_reps",
          contractVersion: set.metric_contract_version,
          exerciseMetricGeneration: set.exercise_metric_generation,
        },
        observation: { version: 1, profile: "load_reps", loadGrams: 12_500, reps: 5, source: "manual" },
        completedAtMs: workoutFixtureActivatedAt(request) + 3_000,
      },
    });
  } catch (error) {
    conflict = error instanceof WorkoutCommandConflictError && error.code === "complete_set_conflict";
  }
  if (!conflict) throw new Error("v12_native_acceptance_workout_complete_conflict_missing");
  const [row] = await input.kernel.queryAll<Readonly<{ status: string; revision: number }>>(
    "SELECT status, revision FROM session_sets WHERE id = ?",
    [set.set_id],
  );
  if (row?.status !== "planned" || row.revision !== set.set_revision) {
    throw new Error("v12_native_acceptance_workout_complete_conflict_postcondition_failed");
  }
  return Object.freeze({ result: "read" as const, facts: operationFacts({
    contract: input.contract,
    authoritativeReadback: await workoutAuthorityReadback(input),
  }) });
}

async function prepareLibrarySearch(input: V12NativeAcceptanceProductionHandlerInput): Promise<void> {
  requireRequest(input);
  await createContentRepository(input.kernel).importAcceptedCatalog({
    catalog: await parseAcceptedPhase2Catalog(runtimeSha256),
  });
}

async function executeLibraryExerciseSearch(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "read"; facts: unknown }>> {
  await prepareLibrarySearch(input);
  const page = await createLibrarySearchRepository(input.kernel).searchExercises({ query: "press" });
  if (page.state !== "page" || page.items.length === 0 || page.items.some((item) => item.canonicalName.trim() === "")) {
    throw new Error("v12_native_acceptance_library_search_postcondition_failed");
  }
  return Object.freeze({ result: "read" as const, facts: operationFacts({
    contract: input.contract,
    authoritativeReadback: await workoutAuthorityReadback(input),
  }) });
}

function ownedPlanReadFixtureId(request: V12NativeAcceptanceRequest): string {
  return `v12:owned-plan-read:${request.nonce}`;
}

async function prepareOwnedPlanReadFixture(input: V12NativeAcceptanceProductionHandlerInput): Promise<void> {
  const request = requireRequest(input);
  const repository = createOwnedPlanRepository(input.kernel);
  const planId = ownedPlanReadFixtureId(request);
  if (await repository.read(planId) !== null) return;
  const result = await repository.createDraft({
    requestId: `v12:owned-plan-read:${request.nonce}:seed`,
    requestSha256: await runtimeSha256(`v12:owned-plan-read:${request.nonce}:seed`),
    planId,
    name: "V12 owned-plan read fixture",
    dayId: `v12:owned-plan-read:${request.nonce}:day`,
    dayName: "V12 owned-plan day",
    createdAtMs: workoutFixtureActivatedAt(request),
  });
  if (result.outcome !== "committed" || result.plan.id !== planId || result.plan.days.length !== 1) {
    throw new Error("v12_native_acceptance_owned_plan_read_seed_invalid");
  }
}

async function executeOwnedPlanRead(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "read"; facts: unknown }>> {
  await prepareOwnedPlanReadFixture(input);
  const request = requireRequest(input);
  const plan = await createOwnedPlanRepository(input.kernel).read(ownedPlanReadFixtureId(request));
  if (plan === null || plan.name !== "V12 owned-plan read fixture" || plan.days.length !== 1 || plan.days[0]?.name !== "V12 owned-plan day") {
    throw new Error("v12_native_acceptance_owned_plan_read_postcondition_failed");
  }
  return Object.freeze({ result: "read" as const, facts: operationFacts({
    contract: input.contract,
    authoritativeReadback: await workoutAuthorityReadback(input),
  }) });
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function acceptedStarterSchedule(template: Awaited<ReturnType<typeof parseAcceptedStarterPlanPack>>["templates"][number]) {
  if (template.scheduleSuggestion.mode === "rotation") {
    return Object.freeze({
      startLocalDate: "2027-01-15",
      timeZone: "UTC",
      mode: "rotation" as const,
      bindings: template.scheduleSuggestion.rotation.map((planDaySourceId, ordinal) => ({ planDaySourceId, ordinal })),
    });
  }
  const suggestion = template.scheduleSuggestion;
  return Object.freeze({
    startLocalDate: "2027-01-15",
    timeZone: "UTC",
    mode: "weekday" as const,
    bindings: suggestion.cycleWeeks.flatMap((week, weekIndex) => week.map((binding, ordinal) => ({
      planDaySourceId: binding.dayId,
      ordinal: suggestion.cycleWeeks.slice(0, weekIndex).reduce((count, value) => count + value.length, 0) + ordinal,
      weekIndex,
      weekday: binding.weekday,
    }))),
  });
}

async function executeAcceptedStarterActivation(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  const request = requireRequest(input);
  await createContentRepository(input.kernel).importAcceptedCatalog({
    catalog: await parseAcceptedPhase2Catalog(runtimeSha256),
  });
  const requestId = `v12:starter-activation:${request.nonce}`;
  const [before] = await input.kernel.queryAll<Readonly<{ request_id: string; result_plan_id: string }>>(
    "SELECT request_id, result_plan_id FROM starter_plan_activation_requests WHERE request_id = ?",
    [requestId],
  );
  const pack = await parseAcceptedStarterPlanPack({
    starterPackBytes: prettyJson(starterPlansAsset),
    acceptanceBytes: prettyJson(starterPlansAcceptanceAsset),
    sha256: runtimeSha256,
  });
  const template = pack.templates.find(({ id }) => id === "full-body-foundation");
  if (template === undefined) throw new Error("v12_native_acceptance_starter_template_missing");
  const schedule = acceptedStarterSchedule(template);
  if (before === undefined) {
    const activation = await activateStarterPlan({
      kind: "accepted",
      starterPackBytes: prettyJson(starterPlansAsset),
      acceptanceBytes: prettyJson(starterPlansAcceptanceAsset),
      sha256: runtimeSha256,
      repository: createStarterPlanRepository(input.kernel),
      requestId,
      activatedAtMs: workoutFixtureActivatedAt(request),
      expectedActiveScheduleRevision: null,
      confirmationToken: createStarterPlanActivationConfirmationToken({
        assetSha256: pack.assetSha256,
        templateId: template.id,
        templateRevision: template.revision,
        ...schedule,
        bindings: schedule.bindings as never,
        copyChoice: null,
      }),
      templateId: template.id,
      templateRevision: template.revision,
      ...schedule,
      bindings: schedule.bindings as never,
      copyChoice: null,
    });
    if (activation.outcome !== "committed" || activation.plan.sourceTemplateId !== template.id || activation.days.length === 0) {
      throw new Error("v12_native_acceptance_starter_activation_failed");
    }
  }
  const [receipt] = await input.kernel.queryAll<Readonly<{ request_id: string; result_plan_id: string; choice: string | null }>>(
    "SELECT request_id, result_plan_id, choice FROM starter_plan_activation_requests WHERE request_id = ?",
    [requestId],
  );
  return workoutMutationFacts({
    handler: input,
    receiptId: stableJson({ request_id: requestId }),
    outcome: before === undefined ? "committed" : "already_committed",
    verify: async () => {
      const [plan] = await input.kernel.queryAll<Readonly<{ id: string; is_active: number }>>(
        "SELECT id, is_active FROM plans WHERE id = ?",
        [receipt?.result_plan_id ?? ""],
      );
      if (receipt?.request_id !== requestId || receipt.choice !== "initial" || plan?.id !== receipt.result_plan_id || plan.is_active !== 1) {
        throw new Error("v12_native_acceptance_starter_activation_postcondition_failed");
      }
    },
  });
}

async function workoutMutationFacts(input: Readonly<{
  handler: V12NativeAcceptanceProductionHandlerInput;
  receiptId: string;
  outcome: "committed" | "already_committed";
  verify(): Promise<void>;
}>): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  await input.verify();
  return Object.freeze({ result: "committed" as const, facts: operationFacts({
    contract: input.handler.contract,
    authoritativeReadback: await workoutAuthorityReadback(input.handler),
    receiptId: input.receiptId,
    outcome: input.outcome,
    committedEffects: input.outcome === "committed" ? 1 : 0,
  }) });
}

async function executeWorkoutSetDraft(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  await prepareActiveWorkoutFixture(input);
  const request = requireRequest(input);
  const set = await workoutFixtureActiveSet(input.kernel, request);
  if (set.metric_profile !== "load_reps") throw new Error("v12_native_acceptance_workout_metric_precondition_missing");
  const [before] = await input.kernel.queryAll<Readonly<{ observed_json: string | null }>>(
    "SELECT observed_json FROM session_sets WHERE id = ?",
    [set.set_id],
  );
  const expected = JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 12_500, reps: 5, source: "manual" });
  const replay = before?.observed_json === expected;
  if (!replay) {
    await updateActiveSetDraft({
      repository: createWorkoutRepository(input.kernel),
      input: {
        sessionId: set.session_id,
        setId: set.set_id,
        expectedSetRevision: set.set_revision,
        metricIdentity: { profile: "load_reps", contractVersion: set.metric_contract_version, exerciseMetricGeneration: set.exercise_metric_generation },
        observation: { version: 1, profile: "load_reps", loadGrams: 12_500, reps: 5, source: "manual" },
        updatedAtMs: workoutFixtureActivatedAt(request) + 2_000,
      },
    });
  }
  return workoutMutationFacts({
    handler: input,
    receiptId: stableJson({ session_id: set.session_id, set_id: set.set_id, nonce: request.nonce }),
    outcome: replay ? "already_committed" : "committed",
    verify: async () => {
      const [row] = await input.kernel.queryAll<Readonly<{ observed_json: string | null }>>("SELECT observed_json FROM session_sets WHERE id = ?", [set.set_id]);
      if (row?.observed_json !== expected) throw new Error("v12_native_acceptance_workout_set_postcondition_failed");
    },
  });
}

async function executeWorkoutAddSet(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  await prepareActiveWorkoutFixture(input);
  const request = requireRequest(input);
  const set = await workoutFixtureActiveSet(input.kernel, request);
  const newSetId = `v12:workout:${request.caseId}:${request.nonce}:set`;
  const [existing] = await input.kernel.queryAll<Readonly<{ id: string }>>("SELECT id FROM session_sets WHERE id = ?", [newSetId]);
  if (existing === undefined) {
    await addWorkingSet({
      repository: createWorkoutRepository(input.kernel),
      input: { sessionId: set.session_id, sessionExerciseId: set.exercise_id, sourceSetId: set.set_id, setId: newSetId, nowMs: workoutFixtureActivatedAt(request) + 2_000 },
    });
  }
  return workoutMutationFacts({
    handler: input,
    receiptId: stableJson({ session_id: set.session_id, set_id: newSetId, nonce: request.nonce }),
    outcome: existing === undefined ? "committed" : "already_committed",
    verify: async () => {
      const [row] = await input.kernel.queryAll<Readonly<{ id: string }>>("SELECT id FROM session_sets WHERE id = ? AND session_exercise_id = ?", [newSetId, set.exercise_id]);
      if (row === undefined) throw new Error("v12_native_acceptance_workout_add_set_postcondition_failed");
    },
  });
}

async function workoutEditReceipt(kernel: SqliteKernel, requestId: string) {
  const [receipt] = await kernel.queryAll<Readonly<{ request_id: string; operation: string; result_session_revision: number }>>(
    `SELECT request_id, operation, result_session_revision
     FROM workout_session_exercise_edit_receipts
     WHERE request_id = ?`,
    [requestId],
  );
  return receipt;
}

async function executeWorkoutAddExercise(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  await prepareActiveWorkoutFixture(input);
  const request = requireRequest(input);
  const requestId = `v12:workout:${request.caseId}:${request.nonce}:action`;
  const before = await workoutEditReceipt(input.kernel, requestId);
  const session = await workoutFixtureSessionRevision(input.kernel, request);
  const exercises = await workoutFixtureExercises(input.kernel, request);
  const source = exercises[0]!;
  const sessionExerciseId = `v12:workout:${request.nonce}:added-exercise`;
  const setId = `v12:workout:${request.nonce}:added-set`;
  if (before === undefined) {
    const result = await addExercise({
      repository: createWorkoutRepository(input.kernel),
      input: {
        requestId,
        requestSha256: await runtimeSha256(requestId),
        sessionId: session.id,
        expectedSessionRevision: session.revision,
        occurredAtMs: workoutFixtureActivatedAt(request) + 2_000,
        libraryExerciseId: await workoutAlternateLibraryExercise(input.kernel, request, source.exercise_id),
        sessionExerciseId,
        setId,
      },
    });
    if (result.outcome !== "committed") throw new Error("v12_native_acceptance_workout_add_exercise_failed");
  }
  const receipt = await workoutEditReceipt(input.kernel, requestId);
  return workoutMutationFacts({
    handler: input,
    receiptId: stableJson({ request_id: requestId }),
    outcome: before === undefined ? "committed" : "already_committed",
    verify: async () => {
      const [row] = await input.kernel.queryAll<Readonly<{ id: string; session_id: string }>>(
        "SELECT id, session_id FROM session_exercises WHERE id = ?", [sessionExerciseId],
      );
      if (receipt?.operation !== "add_exercise" || row?.session_id !== session.id) {
        throw new Error("v12_native_acceptance_workout_add_exercise_postcondition_failed");
      }
    },
  });
}

async function executeWorkoutReorderExercises(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  await prepareActiveWorkoutFixture(input);
  const request = requireRequest(input);
  const requestId = `v12:workout:${request.caseId}:${request.nonce}:action`;
  const [before] = await input.kernel.queryAll<Readonly<{ request_id: string; operation: string; ordered_session_exercise_ids_json: string }>>(
    `SELECT request_id, operation, ordered_session_exercise_ids_json
     FROM workout_session_exercise_reorder_receipts
     WHERE request_id = ?`, [requestId],
  );
  const session = await workoutFixtureSessionRevision(input.kernel, request);
  const exercises = await workoutFixtureExercises(input.kernel, request);
  const ordered = Object.freeze([...exercises].reverse().map(({ id }) => id));
  if (before === undefined) {
    const result = await reorderExercises({
      repository: createWorkoutRepository(input.kernel),
      input: {
        requestId,
        requestSha256: await runtimeSha256(requestId),
        sessionId: session.id,
        expectedSessionRevision: session.revision,
        occurredAtMs: workoutFixtureActivatedAt(request) + 2_000,
        orderedSessionExerciseIds: ordered,
        expectedSessionExerciseRevisions: exercises.slice().reverse().map(({ id, revision }) => ({ sessionExerciseId: id, revision })),
      },
    });
    if (result.outcome !== "committed") throw new Error("v12_native_acceptance_workout_reorder_failed");
  }
  return workoutMutationFacts({
    handler: input,
    receiptId: stableJson({ request_id: requestId }),
    outcome: before === undefined ? "committed" : "already_committed",
    verify: async () => {
      const [receipt] = await input.kernel.queryAll<Readonly<{ operation: string; ordered_session_exercise_ids_json: string }>>(
        "SELECT operation, ordered_session_exercise_ids_json FROM workout_session_exercise_reorder_receipts WHERE request_id = ?", [requestId],
      );
      if (receipt?.operation !== "reorder_exercises" || receipt.ordered_session_exercise_ids_json !== JSON.stringify(ordered)) {
        throw new Error("v12_native_acceptance_workout_reorder_postcondition_failed");
      }
    },
  });
}

async function executeWorkoutReplaceExercise(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  await prepareActiveWorkoutFixture(input);
  const request = requireRequest(input);
  const requestId = `v12:workout:${request.caseId}:${request.nonce}:action`;
  const before = await workoutEditReceipt(input.kernel, requestId);
  const session = await workoutFixtureSessionRevision(input.kernel, request);
  const source = (await workoutFixtureExercises(input.kernel, request))[0]!;
  const replacementSessionExerciseId = `v12:workout:${request.nonce}:replacement-exercise`;
  const replacementSetId = `v12:workout:${request.nonce}:replacement-set`;
  if (before === undefined) {
    const result = await replaceExercise({
      repository: createWorkoutRepository(input.kernel),
      input: {
        requestId,
        requestSha256: await runtimeSha256(requestId),
        sessionId: session.id,
        expectedSessionRevision: session.revision,
        sessionExerciseId: source.id,
        expectedSessionExerciseRevision: source.revision,
        occurredAtMs: workoutFixtureActivatedAt(request) + 2_000,
        libraryExerciseId: await workoutAlternateLibraryExercise(input.kernel, request, source.exercise_id),
        replacementSessionExerciseId,
        replacementSetId,
      },
    });
    if (result.outcome !== "committed") throw new Error("v12_native_acceptance_workout_replace_exercise_failed");
  }
  const receipt = await workoutEditReceipt(input.kernel, requestId);
  return workoutMutationFacts({
    handler: input,
    receiptId: stableJson({ request_id: requestId }),
    outcome: before === undefined ? "committed" : "already_committed",
    verify: async () => {
      const [replacement] = await input.kernel.queryAll<Readonly<{ id: string; session_id: string }>>(
        "SELECT id, session_id FROM session_exercises WHERE id = ?", [replacementSessionExerciseId],
      );
      if (receipt?.operation !== "replace_exercise" || replacement?.session_id !== session.id) {
        throw new Error("v12_native_acceptance_workout_replace_exercise_postcondition_failed");
      }
    },
  });
}

async function executeWorkoutRemoveExercise(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  await prepareActiveWorkoutFixture(input);
  const request = requireRequest(input);
  const requestId = `v12:workout:${request.caseId}:${request.nonce}:action`;
  const before = await workoutEditReceipt(input.kernel, requestId);
  const session = await workoutFixtureSessionRevision(input.kernel, request);
  const exercises = await workoutFixtureExercises(input.kernel, request);
  const source = exercises.at(-1)!;
  if (before === undefined) {
    const result = await removeExercise({
      repository: createWorkoutRepository(input.kernel),
      input: {
        requestId,
        requestSha256: await runtimeSha256(requestId),
        sessionId: session.id,
        expectedSessionRevision: session.revision,
        sessionExerciseId: source.id,
        expectedSessionExerciseRevision: source.revision,
        occurredAtMs: workoutFixtureActivatedAt(request) + 2_000,
      },
    });
    if (result.outcome !== "committed") throw new Error("v12_native_acceptance_workout_remove_exercise_failed");
  }
  const receipt = await workoutEditReceipt(input.kernel, requestId);
  return workoutMutationFacts({
    handler: input,
    receiptId: stableJson({ request_id: requestId }),
    outcome: before === undefined ? "committed" : "already_committed",
    verify: async () => {
      const [removed] = await input.kernel.queryAll<Readonly<{ id: string; status: string }>>(
        "SELECT id, status FROM session_exercises WHERE id = ?", [source.id],
      );
      if (receipt?.operation !== "remove_exercise" || removed?.status === "active") {
        throw new Error("v12_native_acceptance_workout_remove_exercise_postcondition_failed");
      }
    },
  });
}

async function executeWorkoutPreferenceWrite(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  await prepareWorkoutFixture(input);
  const request = requireRequest(input);
  const repository = createWorkoutPreferenceRepository(input.kernel);
  const planId = workoutFixturePlanId(request);
  const current = await repository.read(planId);
  const defaultRestSeconds = input.contract.caseId === "workout.appearance" ? 75 : 105;
  const replay = current.defaultRestSeconds === defaultRestSeconds && current.weightIncrementGrams === 2500;
  if (!replay) {
    const saved = await repository.write({
      planId,
      expectedRevision: current.revision,
      defaultRestSeconds,
      weightIncrementGrams: 2500,
      updatedAtMs: workoutFixtureActivatedAt(request) + 6_000,
    });
    if (saved.defaultRestSeconds !== defaultRestSeconds || saved.revision !== current.revision + 1) {
      throw new Error("v12_native_acceptance_workout_preference_postcondition_failed");
    }
  }
  const key = `gym_tracker.workout_plan_preferences.v1:${planId}`;
  return workoutMutationFacts({
    handler: input,
    receiptId: stableJson({ key, nonce: request.nonce }),
    outcome: replay ? "already_committed" : "committed",
    verify: async () => {
      const persisted = await repository.read(planId);
      if (persisted.defaultRestSeconds !== defaultRestSeconds || persisted.weightIncrementGrams !== 2500) {
        throw new Error("v12_native_acceptance_workout_preference_postcondition_failed");
      }
    },
  });
}

async function executeWorkoutUndoCompletedSet(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  await prepareActiveWorkoutFixture(input);
  const request = requireRequest(input);
  const completionKey = `v12:workout:${request.caseId}:${request.nonce}:completion`;
  const undoKey = `undo:${completionKey}`;
  const [before] = await input.kernel.queryAll<Readonly<{
    id: string;
    completed_set_id: string;
    consumed_at_ms: number | null;
  }>>(
    `SELECT id, completed_set_id, consumed_at_ms
     FROM session_undo_snapshots
     WHERE idempotency_key = ?`,
    [undoKey],
  );
  if (before === undefined) {
    const set = await workoutFixtureActiveSet(input.kernel, request);
    if (set.metric_profile !== "load_reps") throw new Error("v12_native_acceptance_workout_metric_precondition_missing");
    const completed = await completeSet({
      repository: createWorkoutRepository(input.kernel),
      haptics: { committed: async () => undefined, cue: async () => undefined },
      invalidate: async () => undefined,
      drainEffects: async () => undefined,
      input: {
        sessionId: set.session_id,
        setId: set.set_id,
        expectedSessionRevision: set.session_revision,
        expectedSetRevision: set.set_revision,
        completionIdempotencyKey: completionKey,
        metricIdentity: {
          profile: "load_reps",
          contractVersion: set.metric_contract_version,
          exerciseMetricGeneration: set.exercise_metric_generation,
        },
        observation: { version: 1, profile: "load_reps", loadGrams: 12_500, reps: 5, source: "manual" },
        completedAtMs: workoutFixtureActivatedAt(request) + 3_000,
      },
    });
    if (completed.outcome !== "committed") throw new Error("v12_native_acceptance_workout_undo_completion_failed");
  }
  const [snapshot] = await input.kernel.queryAll<Readonly<{
    completed_set_id: string;
    consumed_at_ms: number | null;
  }>>(
    `SELECT completed_set_id, consumed_at_ms
     FROM session_undo_snapshots
     WHERE idempotency_key = ?`,
    [undoKey],
  );
  if (snapshot === undefined) throw new Error("v12_native_acceptance_workout_undo_receipt_missing");
  if (snapshot.consumed_at_ms === null) {
    const sessionId = await workoutFixtureSessionId(input.kernel, request);
    if (sessionId === null) throw new Error("v12_native_acceptance_workout_fixture_session_missing");
    const result = await undoCompletedSet({
      repository: createWorkoutRepository(input.kernel),
      input: {
        sessionId,
        completedSetId: snapshot.completed_set_id,
        nowMs: workoutFixtureActivatedAt(request) + 4_000,
      },
    });
    if (result.outcome !== "undone") throw new Error("v12_native_acceptance_workout_undo_failed");
  }
  return workoutMutationFacts({
    handler: input,
    receiptId: stableJson({ idempotency_key: undoKey }),
    outcome: before === undefined || before.consumed_at_ms === null ? "committed" : "already_committed",
    verify: async () => {
      const [receipt] = await input.kernel.queryAll<Readonly<{ consumed_at_ms: number | null }>>(
        "SELECT consumed_at_ms FROM session_undo_snapshots WHERE idempotency_key = ?",
        [undoKey],
      );
      const [set] = await input.kernel.queryAll<Readonly<{ status: string }>>(
        "SELECT status FROM session_sets WHERE id = ?",
        [snapshot.completed_set_id],
      );
      if (receipt?.consumed_at_ms !== workoutFixtureActivatedAt(request) + 4_000 || set?.status !== "planned") {
        throw new Error("v12_native_acceptance_workout_undo_postcondition_failed");
      }
    },
  });
}

async function executeWorkoutCompleteSet(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  await prepareActiveWorkoutFixture(input);
  const request = requireRequest(input);
  const key = `v12:workout:${request.caseId}:${request.nonce}:completion`;
  const [replayed] = await input.kernel.queryAll<Readonly<{ id: string; session_id: string }>>(
    `SELECT set_row.id, exercise.session_id
     FROM session_sets set_row
     JOIN session_exercises exercise ON exercise.id = set_row.session_exercise_id
     WHERE set_row.completion_idempotency_key = ?`,
    [key],
  );
  const set = replayed === undefined ? await workoutFixtureActiveSet(input.kernel, request) : null;
  if (set !== null && set.metric_profile !== "load_reps") throw new Error("v12_native_acceptance_workout_metric_precondition_missing");
  if (set !== null) {
    await completeSet({
      repository: createWorkoutRepository(input.kernel),
      haptics: { committed: async () => undefined, cue: async () => undefined },
      invalidate: async () => undefined,
      drainEffects: async () => undefined,
      input: {
        sessionId: set.session_id, setId: set.set_id,
        expectedSessionRevision: set.session_revision, expectedSetRevision: set.set_revision,
        completionIdempotencyKey: key,
        metricIdentity: { profile: "load_reps", contractVersion: set.metric_contract_version, exerciseMetricGeneration: set.exercise_metric_generation },
        observation: { version: 1, profile: "load_reps", loadGrams: 12_500, reps: 5, source: "manual" },
        completedAtMs: workoutFixtureActivatedAt(request) + 3_000,
      },
    });
  }
  return workoutMutationFacts({
    handler: input,
    receiptId: stableJson({ completion_idempotency_key: key }),
    outcome: replayed === undefined ? "committed" : "already_committed",
    verify: async () => {
      const [row] = await input.kernel.queryAll<Readonly<{ status: string; completion_idempotency_key: string | null }>>(
        "SELECT status, completion_idempotency_key FROM session_sets WHERE completion_idempotency_key = ?", [key],
      );
      if (row?.status !== "completed" || row.completion_idempotency_key !== key) throw new Error("v12_native_acceptance_workout_complete_postcondition_failed");
    },
  });
}

async function executeWorkoutStart(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  await prepareWorkoutFixture(input);
  const request = requireRequest(input);
  const before = await workoutFixtureSessionId(input.kernel, request);
  if (before === null) {
    const started = await startWorkout({
      repository: createPlansWorkoutRepository(input.kernel),
      request: {
        mode: "alternate",
        planId: workoutFixturePlanId(request),
        planDayId: await workoutFixtureDayId(input.kernel, request),
        localDate: "2027-01-15",
        timezone: "UTC",
        startedAtMs: workoutFixtureActivatedAt(request) + 1_000,
        commandIdentity: `v12:${request.caseId}:${request.nonce}`,
      },
    });
    if (started.status !== "in_progress") throw new Error("v12_native_acceptance_workout_start_postcondition_failed");
  }
  const sessionId = await workoutFixtureSessionId(input.kernel, request);
  if (sessionId === null) throw new Error("v12_native_acceptance_workout_start_postcondition_failed");
  return workoutMutationFacts({
    handler: input,
    receiptId: stableJson({ workout_session_id: sessionId, nonce: request.nonce }),
    outcome: before === null ? "committed" : "already_committed",
    verify: async () => {
      const [session] = await input.kernel.queryAll<Readonly<{ status: string; plan_id: string | null }>>(
        "SELECT status, plan_id FROM workout_sessions WHERE id = ?", [sessionId],
      );
      if (session?.status !== "in_progress" || session.plan_id !== workoutFixturePlanId(request)) {
        throw new Error("v12_native_acceptance_workout_start_postcondition_failed");
      }
    },
  });
}

async function workoutFixtureSessionRevision(kernel: SqliteKernel, request: V12NativeAcceptanceRequest): Promise<Readonly<{ id: string; revision: number }>> {
  const sessionId = await workoutFixtureSessionId(kernel, request);
  if (sessionId === null) throw new Error("v12_native_acceptance_workout_fixture_session_missing");
  const [session] = await kernel.queryAll<Readonly<{ id: string; revision: number }>>(
    "SELECT id, revision FROM workout_sessions WHERE id = ? AND status = 'in_progress'", [sessionId],
  );
  if (session === undefined) throw new Error("v12_native_acceptance_workout_fixture_session_missing");
  return session;
}

async function ensureWorkoutRest(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ sessionId: string; restRevision: number }>> {
  const request = requireRequest(input);
  const repository = createRestRepository(input.kernel);
  const session = await workoutFixtureSessionRevision(input.kernel, request);
  const current = await repository.getRestContext(session.id);
  if (current === null) throw new Error("v12_native_acceptance_workout_rest_precondition_missing");
  if (current.state.state === "idle") {
    await startManualRest({
      repository,
      input: { sessionId: session.id, expectedSessionRevision: session.revision, expectedRestRevision: current.state.revision, nowMs: workoutFixtureActivatedAt(request) + 4_000 },
    });
  }
  const started = await repository.getRestContext(session.id);
  if (started === null || started.state.state === "idle") throw new Error("v12_native_acceptance_workout_rest_start_failed");
  return Object.freeze({ sessionId: session.id, restRevision: started.state.revision });
}

async function executeWorkoutRestAdjust(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  await prepareActiveWorkoutFixture(input);
  const request = requireRequest(input);
  const repository = createRestRepository(input.kernel);
  const started = await ensureWorkoutRest(input);
  const session = await workoutFixtureSessionRevision(input.kernel, request);
  const current = await repository.getRestContext(started.sessionId);
  if (current === null) throw new Error("v12_native_acceptance_workout_rest_precondition_missing");
  const replay = current.state.state === "paused" && current.state.remainingMs > 0;
  if (!replay) {
    if (current.state.state !== "running") throw new Error("v12_native_acceptance_workout_rest_precondition_missing");
    await pauseRest({
      repository,
      input: { sessionId: started.sessionId, expectedSessionRevision: session.revision, expectedRestRevision: current.state.revision, nowMs: workoutFixtureActivatedAt(request) + 4_500 },
    });
    const paused = await repository.getRestContext(started.sessionId);
    const freshSession = await workoutFixtureSessionRevision(input.kernel, request);
    if (paused?.state.state !== "paused") throw new Error("v12_native_acceptance_workout_rest_pause_missing");
    await adjustRest({
      repository,
      input: { sessionId: started.sessionId, expectedSessionRevision: freshSession.revision, expectedRestRevision: paused.state.revision, nowMs: workoutFixtureActivatedAt(request) + 4_500, deltaMs: 15_000 },
    });
  }
  return workoutMutationFacts({
    handler: input,
    receiptId: stableJson({ session_id: started.sessionId, operation: "adjust_rest", nonce: request.nonce }),
    outcome: replay ? "already_committed" : "committed",
    verify: async () => {
      const context = await repository.getRestContext(started.sessionId);
      if (context?.state.state !== "paused" || context.state.remainingMs < 15_000) {
        throw new Error("v12_native_acceptance_workout_rest_adjust_postcondition_failed");
      }
    },
  });
}

async function executeWorkoutRestResume(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  await prepareActiveWorkoutFixture(input);
  const request = requireRequest(input);
  const repository = createRestRepository(input.kernel);
  const started = await ensureWorkoutRest(input);
  const session = await workoutFixtureSessionRevision(input.kernel, request);
  const current = await repository.getRestContext(started.sessionId);
  if (current === null) throw new Error("v12_native_acceptance_workout_rest_precondition_missing");
  const replay = current.state.state === "running" && current.state.startedAtMs === workoutFixtureActivatedAt(request) + 5_000;
  if (!replay) {
    if (current.state.state !== "paused") {
      if (current.state.state !== "running") throw new Error("v12_native_acceptance_workout_rest_precondition_missing");
      await pauseRest({
        repository,
        input: { sessionId: started.sessionId, expectedSessionRevision: session.revision, expectedRestRevision: current.state.revision, nowMs: workoutFixtureActivatedAt(request) + 4_500 },
      });
    }
    const paused = await repository.getRestContext(started.sessionId);
    const freshSession = await workoutFixtureSessionRevision(input.kernel, request);
    if (paused?.state.state !== "paused") throw new Error("v12_native_acceptance_workout_rest_pause_missing");
    await resumeRest({
      repository,
      input: { sessionId: started.sessionId, expectedSessionRevision: freshSession.revision, expectedRestRevision: paused.state.revision, nowMs: workoutFixtureActivatedAt(request) + 5_000 },
    });
  }
  return workoutMutationFacts({
    handler: input,
    receiptId: stableJson({ session_id: started.sessionId, operation: "resume_rest", nonce: request.nonce }),
    outcome: replay ? "already_committed" : "committed",
    verify: async () => {
      const context = await repository.getRestContext(started.sessionId);
      if (context?.state.state !== "running" || context.state.startedAtMs !== workoutFixtureActivatedAt(request) + 5_000) {
        throw new Error("v12_native_acceptance_workout_rest_resume_postcondition_failed");
      }
    },
  });
}

const RUNNING_GOAL_EDIT_HANDLER = "running-plan.running-plan-repository.save-running-target";
const RUNNING_AGGREGATE_READ_HANDLER = "running-plan.running-plan-repository.read-aggregate";
const RUNNING_CREATE_HANDLER = "running-plan.running-plan-repository.create-inactive-aggregate";
const RUNNING_SOURCE_GRAPH_HANDLER = "running-plan.running-plan-repository.save-source-graph";
const RUNNING_LIFECYCLE_HANDLER = "running-plan.running-plan-repository.confirm-lifecycle";
const V12_RUNNING_SEED_AT_MS = 1_800_000_000_000;
const RUNNING_FAMILY_B_CASE_IDS = new Set([
  "library.running-detail", "library.running-create-zero-sessions", "library.running-goal-edit",
  "library.running-session-common", "library.running-recovery", "library.running-long",
  "library.running-progression", "library.running-tempo", "library.running-intervals",
  "library.running-hills", "library.running-fartlek", "library.running-session-lifecycle",
  "library.running-create-typed-sessions", "library.running-two-same-day-slots",
]);
type RunningWeekday = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

function requireRequest(input: V12NativeAcceptanceProductionHandlerInput): V12NativeAcceptanceRequest {
  if (input.request === undefined || !NONCE.test(input.request.nonce)) {
    throw new Error("v12_native_acceptance_request_required");
  }
  return input.request;
}

function requireRunningRuntime(input: V12NativeAcceptanceProductionHandlerInput): RunningPlanRuntimePort {
  const runtime = input.runtime?.running;
  if (runtime === undefined) throw new Error("v12_native_acceptance_running_runtime_required");
  return runtime;
}

function runningFixturePlanId(request: V12NativeAcceptanceRequest): string {
  return `v12:running:${request.nonce}`;
}

function runningSeedRequestId(request: V12NativeAcceptanceRequest): string {
  return `v12:running:${request.nonce}:seed`;
}

function runningActionRequestId(request: V12NativeAcceptanceRequest): string {
  return `v12:running:${request.caseId}:${request.nonce}:action`;
}

function runningSessionKindForCase(caseId: string): RunningSessionKind {
  const kind = (Object.freeze({
    "library.running-session-common": "recovery",
    "library.running-recovery": "recovery",
    "library.running-long": "long_run",
    "library.running-progression": "progression",
    "library.running-tempo": "tempo",
    "library.running-intervals": "intervals",
    "library.running-hills": "hills",
    "library.running-fartlek": "fartlek",
  }) as Readonly<Partial<Record<string, RunningSessionKind>>>)[caseId];
  if (kind === undefined) throw new Error("v12_native_acceptance_running_case_unimplemented");
  return kind;
}

function runningSessionDefinition(kind: RunningSessionKind, weekday: RunningWeekday) {
  const phases = [{ ordinal: 0, kind: "work" as const, steps: [{ ordinal: 0, kind: "duration" as const, durationMs: 1_800_000 }] }];
  if (kind === "recovery") return { sessionKind: kind, weekday, phases, advisoryTarget: { rpe: 4 }, contextual: {} };
  if (kind === "long_run") return { sessionKind: kind, weekday, phases, advisoryTarget: { rpe: 4 }, contextual: { finish: "easy_throughout" as const } };
  if (kind === "progression") return { sessionKind: kind, weekday, phases, contextual: { stages: 3, startTarget: { rpe: 3 }, finishTarget: { rpe: 6 } } };
  if (kind === "tempo") return { sessionKind: kind, weekday, phases, advisoryTarget: { rpe: 6 }, contextual: { format: "continuous" as const, work: { durationMs: 1_800_000 } } };
  if (kind === "intervals") return { sessionKind: kind, weekday, phases, advisoryTarget: { rpe: 7 }, contextual: { repetitions: 4, work: { durationMs: 180_000 }, recovery: { durationMs: 90_000 } } };
  if (kind === "hills") return { sessionKind: kind, weekday, phases, advisoryTarget: { rpe: 7 }, contextual: { repetitions: 4, work: { durationMs: 120_000 }, returnRecovery: { durationMs: 120_000 } } };
  return { sessionKind: kind, weekday, phases, advisoryTarget: { rpe: 6 }, contextual: { format: "structured" as const, repetitions: 4, work: { durationMs: 120_000 }, recovery: { durationMs: 120_000 } } };
}

function runningGoalFixture(planId: string) {
  return Object.freeze({
    version: 1 as const,
    id: planId,
    name: "V12 acceptance Running goal fixture",
    revision: 1,
    createdAtMs: V12_RUNNING_SEED_AT_MS,
    goal: Object.freeze({
      version: 1 as const,
      id: `${planId}:goal:1`,
      planId,
      revision: 1,
      goalDistanceMeters: 3_000,
      targetDurationMs: 1_800_000,
      trainingDays: ["Monday"] as RunningPlanAggregate["goal"]["trainingDays"],
      runsPerWeek: 1,
      longRunDay: "Monday" as const,
      currentWeeklyDistanceMeters: 10_000,
      createdAtMs: V12_RUNNING_SEED_AT_MS,
    }),
    sessions: Object.freeze([]),
  });
}

async function readRunningReceipt(kernel: SqliteKernel, requestId: string) {
  const [receipt] = await kernel.queryAll<Readonly<{
    request_id: string;
    request_sha256: string;
    operation: string;
    plan_id: string;
    expected_plan_revision: number;
    result_json: string;
    committed_at_ms: number;
  }>>(
    `SELECT request_id, request_sha256, operation, plan_id, expected_plan_revision, result_json, committed_at_ms
     FROM running_plan_receipts
     WHERE request_id = ?`,
    [requestId],
  );
  return receipt;
}

async function prepareRunningGoalEdit(input: V12NativeAcceptanceProductionHandlerInput): Promise<void> {
  const request = requireRequest(input);
  const runtime = requireRunningRuntime(input);
  const planId = runningFixturePlanId(request);
  if (await runtime.loadPlan(planId) !== null) return;
  await runtime.createInactivePlan({
    requestId: runningSeedRequestId(request),
    plan: runningGoalFixture(planId),
  });
  const seeded = await runtime.loadPlan(planId);
  if (seeded === null || seeded.revision !== 1 || seeded.goal.goalDistanceMeters !== 3_000) {
    throw new Error("v12_native_acceptance_running_seed_invalid");
  }
}

async function prepareRunningFamilyB(input: V12NativeAcceptanceProductionHandlerInput): Promise<void> {
  if (!RUNNING_FAMILY_B_CASE_IDS.has(input.contract.caseId)) return;
  if (input.contract.caseId === "library.running-create-zero-sessions") return;
  await prepareRunningGoalEdit(input);
}

async function runningMutationFacts(input: Readonly<{
  handler: V12NativeAcceptanceProductionHandlerInput;
  before: Awaited<ReturnType<typeof readRunningReceipt>>;
  expectedOperation: string;
  verify(plan: RunningPlanAggregate): void;
}>): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  const request = requireRequest(input.handler);
  const actionRequestId = runningActionRequestId(request);
  const receipt = await readRunningReceipt(input.handler.kernel, actionRequestId);
  const plan = await requireRunningRuntime(input.handler).loadPlan(runningFixturePlanId(request));
  if (receipt === undefined || receipt.operation !== input.expectedOperation
    || receipt.plan_id !== runningFixturePlanId(request) || receipt.request_sha256.length !== 64 || plan === null) {
    throw new Error("v12_native_acceptance_running_receipt_invalid");
  }
  input.verify(plan);
  if (input.handler.kernel.readSnapshot === undefined) throw new Error("v12_native_acceptance_snapshot_unavailable");
  const authoritativeReadback = await input.handler.kernel.readSnapshot((query) => readCaseFacts(query, input.handler.contract));
  return Object.freeze({
    result: "committed" as const,
    facts: operationFacts({
      contract: input.handler.contract,
      authoritativeReadback,
      receiptId: stableJson(Object.freeze({ request_id: receipt.request_id })),
      outcome: input.before === undefined ? "committed" : "already_committed",
      committedEffects: input.before === undefined ? 1 : 0,
    }),
  });
}

async function executeRunningAggregateRead(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "read"; facts: unknown }>> {
  const request = requireRequest(input);
  const plan = await requireRunningRuntime(input).loadPlan(runningFixturePlanId(request));
  if (plan === null || plan.lifecycle !== "inactive" || plan.goal.goalDistanceMeters !== 3_000) {
    throw new Error("v12_native_acceptance_running_precondition_missing");
  }
  if (input.kernel.readSnapshot === undefined) throw new Error("v12_native_acceptance_snapshot_unavailable");
  const authoritativeReadback = await input.kernel.readSnapshot((query) => readCaseFacts(query, input.contract));
  return Object.freeze({ result: "read" as const, facts: operationFacts({ contract: input.contract, authoritativeReadback }) });
}

async function executeRunningCreateZeroSessions(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  const request = requireRequest(input);
  const runtime = requireRunningRuntime(input);
  const actionRequestId = runningActionRequestId(request);
  const before = await readRunningReceipt(input.kernel, actionRequestId);
  if (before === undefined) {
    const planId = runningFixturePlanId(request);
    const created = await runtime.createInactivePlan({ requestId: actionRequestId, plan: runningGoalFixture(planId) });
    if (created.sessions.length !== 0 || created.lifecycle !== "inactive") throw new Error("v12_native_acceptance_running_postcondition_failed");
  }
  return runningMutationFacts({
    handler: input,
    before,
    expectedOperation: "create",
    verify: (plan) => {
      if (plan.sessions.length !== 0 || plan.lifecycle !== "inactive") throw new Error("v12_native_acceptance_running_postcondition_failed");
    },
  });
}

async function executeRunningSessionSave(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  const request = requireRequest(input);
  const runtime = requireRunningRuntime(input);
  const actionRequestId = runningActionRequestId(request);
  const before = await readRunningReceipt(input.kernel, actionRequestId);
  const kind = runningSessionKindForCase(input.contract.caseId);
  if (before === undefined) {
    const plan = await runtime.loadPlan(runningFixturePlanId(request));
    if (plan === null) throw new Error("v12_native_acceptance_running_precondition_missing");
    const saved = await runtime.saveSession({
      planId: plan.id,
      expectedPlanRevision: plan.revision,
      requestId: actionRequestId,
      session: runningSessionDefinition(kind, "Monday"),
    });
    if (!saved.plan.sessions.some(({ session }) => session.sessionKind === kind)) {
      throw new Error("v12_native_acceptance_running_postcondition_failed");
    }
  }
  return runningMutationFacts({
    handler: input,
    before,
    expectedOperation: "edit",
    verify: (plan) => {
      if (!plan.sessions.some(({ session }) => session.sessionKind === kind)) throw new Error("v12_native_acceptance_running_postcondition_failed");
    },
  });
}

function runningAggregateSession(
  plan: RunningPlanAggregate,
  kind: RunningSessionKind,
  ordinal: number,
  weekday: RunningWeekday,
): RunningPlanAggregate["sessions"][number] {
  const rootId = `${plan.id}:v12:${kind}:${ordinal}`;
  const { weekday: sessionWeekday, ...definition } = runningSessionDefinition(kind, weekday);
  const session: RunningSessionRevision = {
    version: 1,
    id: `${rootId}:revision:1`,
    rootId,
    planId: plan.id,
    revision: 1,
    createdAtMs: V12_RUNNING_SEED_AT_MS + ordinal,
    ...definition,
  } as RunningSessionRevision;
  return Object.freeze({
    session,
    slot: Object.freeze({
      id: `${rootId}:slot:revision:1`,
      rootId: `${rootId}:slot`,
      weekday: sessionWeekday,
      revision: 1,
      ordinal,
      sessionRootId: rootId,
      sessionRevisionId: session.id,
    }),
  });
}

async function executeRunningGraphSave(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  const request = requireRequest(input);
  const runtime = requireRunningRuntime(input);
  const actionRequestId = runningActionRequestId(request);
  const before = await readRunningReceipt(input.kernel, actionRequestId);
  const typed = input.contract.caseId === "library.running-create-typed-sessions";
  const sameDay = input.contract.caseId === "library.running-two-same-day-slots";
  if (!typed && !sameDay) return executeRunningSessionSave(input);
  if (before === undefined) {
    const plan = await runtime.loadPlan(runningFixturePlanId(request));
    if (plan === null) throw new Error("v12_native_acceptance_running_precondition_missing");
    const definitions = typed
      ? (["recovery", "long_run", "progression", "tempo", "intervals", "hills", "fartlek"] as const)
        .map((kind, ordinal) => runningAggregateSession(plan, kind, ordinal, (["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const)[ordinal]!))
      : [
        runningAggregateSession(plan, "recovery", 0, "Monday"),
        runningAggregateSession(plan, "long_run", 1, "Monday"),
      ];
    const { active: _active, lifecycle: _lifecycle, ...editable } = plan;
    const saved = await runtime.savePlan({ ...editable, sessions: definitions, requestId: actionRequestId });
    if ((typed && saved.sessions.length !== 7) || (sameDay && saved.sessions.filter(({ slot }) => slot.weekday === "Monday").length !== 2)) {
      throw new Error("v12_native_acceptance_running_postcondition_failed");
    }
  }
  return runningMutationFacts({
    handler: input,
    before,
    expectedOperation: "edit",
    verify: (plan) => {
      if (typed && plan.sessions.length !== 7) throw new Error("v12_native_acceptance_running_postcondition_failed");
      if (sameDay && plan.sessions.filter(({ slot }) => slot.weekday === "Monday").length !== 2) throw new Error("v12_native_acceptance_running_postcondition_failed");
    },
  });
}

async function executeRunningLifecycle(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  const request = requireRequest(input);
  const runtime = requireRunningRuntime(input);
  const actionRequestId = runningActionRequestId(request);
  const before = await readRunningReceipt(input.kernel, actionRequestId);
  if (before === undefined) {
    const preview = await runtime.previewLifecycle(runningFixturePlanId(request), "archive");
    const result = await runtime.confirmLifecycle({ action: "archive", preview, requestId: actionRequestId });
    if (result.lifecycle !== "archived") throw new Error("v12_native_acceptance_running_postcondition_failed");
  }
  return runningMutationFacts({
    handler: input,
    before,
    expectedOperation: "archive",
    verify: (plan) => {
      if (plan.lifecycle !== "archived") throw new Error("v12_native_acceptance_running_postcondition_failed");
    },
  });
}

async function executeRunningGoalEdit(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  const request = requireRequest(input);
  const runtime = requireRunningRuntime(input);
  const actionRequestId = runningActionRequestId(request);
  const planId = runningFixturePlanId(request);
  const before = await readRunningReceipt(input.kernel, actionRequestId);
  if (before === undefined) {
    const plan = await runtime.loadPlan(planId);
    if (plan === null || plan.revision < 1) throw new Error("v12_native_acceptance_running_precondition_missing");
    const result = await runtime.saveRunningTarget({
      planId,
      requestId: actionRequestId,
      expectedSourceRevision: plan.revision,
      goalDistanceMeters: 5_000,
      targetDurationMs: 1_950_000,
      trainingDays: ["Monday"],
    });
    if (result.outcome !== "committed" || runningTargetForDistance(result.plan, 5_000)?.goalDistanceMeters !== 5_000) {
      throw new Error("v12_native_acceptance_running_postcondition_failed");
    }
  }
  const receipt = await readRunningReceipt(input.kernel, actionRequestId);
  const plan = await runtime.loadPlan(planId);
  if (receipt === undefined || receipt.operation !== "edit" || receipt.plan_id !== planId
    || receipt.request_sha256.length !== 64 || plan === null || runningTargetForDistance(plan, 5_000)?.goalDistanceMeters !== 5_000) {
    throw new Error("v12_native_acceptance_running_receipt_invalid");
  }
  if (input.kernel.readSnapshot === undefined) throw new Error("v12_native_acceptance_snapshot_unavailable");
  const authoritativeReadback = await input.kernel.readSnapshot((query) => readCaseFacts(query, input.contract));
  return Object.freeze({
    result: "committed" as const,
    facts: operationFacts({
      contract: input.contract,
      authoritativeReadback,
      receiptId: stableJson(Object.freeze({ request_id: receipt.request_id })),
      outcome: before === undefined ? "committed" : "already_committed",
      committedEffects: before === undefined ? 1 : 0,
    }),
  });
}

const CUSTOM_FAVORITE_HANDLER = "custom-exercise.custom-exercise-repository.set-exercise-favorite";

function requireCustomExerciseRepository(input: V12NativeAcceptanceProductionHandlerInput): CustomExerciseRepository {
  const repository = input.runtime?.customExercises;
  if (repository === undefined) throw new Error("v12_native_acceptance_custom_exercise_runtime_required");
  return repository;
}

function customExerciseFixtureId(request: V12NativeAcceptanceRequest): string {
  return `v12:custom-exercise:${request.nonce}`;
}

function customExerciseSeedRequestId(request: V12NativeAcceptanceRequest): string {
  return `v12:custom-exercise:${request.nonce}:seed`;
}

function customExerciseActionRequestId(request: V12NativeAcceptanceRequest): string {
  return `v12:custom-exercise:${request.caseId}:${request.nonce}:action`;
}

async function customExerciseRow(kernel: SqliteKernel, exerciseId: string) {
  const [row] = await kernel.queryAll<Readonly<{ id: string; revision: number }>>(
    "SELECT id, revision FROM exercises WHERE id = ? AND origin = 'custom'",
    [exerciseId],
  );
  return row;
}

async function customExercisePreference(kernel: SqliteKernel, exerciseId: string) {
  const [row] = await kernel.queryAll<Readonly<{ favorite: number; revision: number }>>(
    "SELECT favorite, revision FROM exercise_owner_preferences WHERE exercise_id = ?",
    [exerciseId],
  );
  return row;
}

async function customExerciseReceipt(kernel: SqliteKernel, requestId: string) {
  const [row] = await kernel.queryAll<Readonly<{
    request_id: string;
    mutation_kind: string;
    request_json: string;
    result_json: string;
    committed_at_ms: number;
  }>>(
    `SELECT request_id, mutation_kind, request_json, result_json, committed_at_ms
     FROM custom_exercise_mutation_receipts
     WHERE request_id = ?`,
    [requestId],
  );
  return row;
}

async function prepareCustomFavorite(input: V12NativeAcceptanceProductionHandlerInput): Promise<void> {
  const request = requireRequest(input);
  const repository = requireCustomExerciseRepository(input);
  const exerciseId = customExerciseFixtureId(request);
  if (await customExerciseRow(input.kernel, exerciseId) !== undefined) return;
  const created = await createCustomExercise({
    repository,
    invalidate: async () => undefined,
    input: {
      requestId: customExerciseSeedRequestId(request),
      exerciseId,
      name: "V12 nonce-bound custom exercise",
      aliases: ["V12 custom"],
      exerciseType: "strength",
      movementClass: "compound",
      primaryMuscles: ["quadriceps"],
      secondaryMuscles: ["glutes"],
      equipment: ["barbell"],
      metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
      defaultRestSeconds: 60,
      progression: { kind: "manual_hold", version: 1 },
      createdAtMs: V12_RUNNING_SEED_AT_MS,
    },
  });
  if (created.outcome !== "committed" || created.exercise.exerciseId !== exerciseId) {
    throw new Error("v12_native_acceptance_custom_exercise_seed_invalid");
  }
}

async function executeCustomFavorite(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  const request = requireRequest(input);
  const repository = requireCustomExerciseRepository(input);
  const requestId = customExerciseActionRequestId(request);
  const before = await customExerciseReceipt(input.kernel, requestId);
  const exerciseId = customExerciseFixtureId(request);
  if (before === undefined) {
    const preference = await customExercisePreference(input.kernel, exerciseId);
    const result = await setExerciseFavorite({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId,
        exerciseId,
        expectedPreferenceRevision: preference?.revision ?? null,
        favorite: true,
        updatedAtMs: V12_RUNNING_SEED_AT_MS + 1,
      },
    });
    if (result.outcome !== "committed" || result.favorite !== true) throw new Error("v12_native_acceptance_custom_exercise_postcondition_failed");
  }
  const receipt = await customExerciseReceipt(input.kernel, requestId);
  const preference = await customExercisePreference(input.kernel, exerciseId);
  if (receipt === undefined || receipt.mutation_kind !== "favorite" || !receipt.request_json.includes(requestId)
    || preference === undefined || preference.favorite !== 1) {
    throw new Error("v12_native_acceptance_custom_exercise_receipt_invalid");
  }
  if (input.kernel.readSnapshot === undefined) throw new Error("v12_native_acceptance_snapshot_unavailable");
  const authoritativeReadback = await input.kernel.readSnapshot((query) => readCaseFacts(query, input.contract));
  return Object.freeze({
    result: "committed" as const,
    facts: operationFacts({
      contract: input.contract,
      authoritativeReadback,
      receiptId: stableJson(Object.freeze({ request_id: receipt.request_id })),
      outcome: before === undefined ? "committed" : "already_committed",
      committedEffects: before === undefined ? 1 : 0,
    }),
  });
}

const CUSTOM_CREATE_HANDLER = "custom-exercise.custom-exercise-repository.create-custom-exercise";
const CUSTOM_EDIT_HANDLER = "custom-exercise.custom-exercise-repository.edit-custom-exercise";
const CUSTOM_HIDDEN_HANDLER = "custom-exercise.custom-exercise-repository.set-exercise-hidden";
const CUSTOM_ARCHIVE_HANDLER = "custom-exercise.custom-exercise-repository.set-custom-exercise-archived";
const CUSTOM_COPY_HANDLER = "custom-exercise.custom-exercise-repository.create-custom-copy";
const METRIC_MIGRATION_HANDLER = "metric-profile.metric-repository.migrate-custom-exercise-metric-profile";
const WORKOUT_START_HANDLER = "workout.plans-workout-repository.start-workout";
const WORKOUT_SET_DRAFT_HANDLER = "active-workout.workout-repository.update-active-set-draft";
const WORKOUT_ADD_SET_HANDLER = "active-workout.workout-repository.add-working-set";
const WORKOUT_COMPLETE_SET_HANDLER = "active-workout.workout-repository.complete-set";
const WORKOUT_REST_ADJUST_HANDLER = "rest.rest-repository.adjust-rest";
const WORKOUT_REST_RESUME_HANDLER = "rest.rest-repository.resume-rest";
const WORKOUT_ADD_EXERCISE_HANDLER = "active-workout.workout-repository.add-exercise";
const WORKOUT_REORDER_EXERCISES_HANDLER = "active-workout.workout-repository.reorder-exercises";
const WORKOUT_REPLACE_EXERCISE_HANDLER = "active-workout.workout-repository.replace-exercise";
const WORKOUT_REMOVE_EXERCISE_HANDLER = "active-workout.workout-repository.remove-exercise";
const WORKOUT_UNDO_COMPLETED_SET_HANDLER = "active-workout.workout-repository.undo-completed-set";
const WORKOUT_PREFERENCE_WRITE_HANDLER = "workout.workout-preference-repository.write";

function customExerciseInput(requestId: string, exerciseId: string) {
  return {
    requestId,
    exerciseId,
    name: "V12 nonce-bound custom exercise",
    aliases: ["V12 custom"],
    exerciseType: "strength" as const,
    movementClass: "compound" as const,
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes"],
    equipment: ["barbell"],
    metricIdentity: { profile: "load_reps" as const, contractVersion: 1, exerciseMetricGeneration: 1 },
    defaultRestSeconds: 60,
    progression: { kind: "manual_hold" as const, version: 1 as const },
  };
}

async function customMutationFacts(input: Readonly<{
  handler: V12NativeAcceptanceProductionHandlerInput;
  before: Awaited<ReturnType<typeof customExerciseReceipt>>;
  expectedMutationKind: string;
  verify(): Promise<void>;
}>): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  const request = requireRequest(input.handler);
  const requestId = customExerciseActionRequestId(request);
  const receipt = await customExerciseReceipt(input.handler.kernel, requestId);
  if (receipt === undefined || receipt.mutation_kind !== input.expectedMutationKind || !receipt.request_json.includes(requestId)) {
    throw new Error("v12_native_acceptance_custom_exercise_receipt_invalid");
  }
  await input.verify();
  if (input.handler.kernel.readSnapshot === undefined) throw new Error("v12_native_acceptance_snapshot_unavailable");
  const authoritativeReadback = await input.handler.kernel.readSnapshot((query) => readCaseFacts(query, input.handler.contract));
  return Object.freeze({
    result: "committed" as const,
    facts: operationFacts({
      contract: input.handler.contract,
      authoritativeReadback,
      receiptId: stableJson(Object.freeze({ request_id: receipt.request_id })),
      outcome: input.before === undefined ? "committed" : "already_committed",
      committedEffects: input.before === undefined ? 1 : 0,
    }),
  });
}

async function executeCustomCreate(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  const request = requireRequest(input);
  const repository = requireCustomExerciseRepository(input);
  const requestId = customExerciseActionRequestId(request);
  const exerciseId = customExerciseFixtureId(request);
  const before = await customExerciseReceipt(input.kernel, requestId);
  if (before === undefined) {
    const result = await createCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: { ...customExerciseInput(requestId, exerciseId), createdAtMs: V12_RUNNING_SEED_AT_MS + 1 },
    });
    if (result.outcome !== "committed" || result.exercise.exerciseId !== exerciseId) throw new Error("v12_native_acceptance_custom_exercise_postcondition_failed");
  }
  return customMutationFacts({
    handler: input,
    before,
    expectedMutationKind: "create",
    verify: async () => {
      if (await customExerciseRow(input.kernel, exerciseId) === undefined) throw new Error("v12_native_acceptance_custom_exercise_postcondition_failed");
    },
  });
}

async function executeCustomEdit(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  const request = requireRequest(input);
  const repository = requireCustomExerciseRepository(input);
  const requestId = customExerciseActionRequestId(request);
  const exerciseId = customExerciseFixtureId(request);
  const before = await customExerciseReceipt(input.kernel, requestId);
  if (before === undefined) {
    const existing = await customExerciseRow(input.kernel, exerciseId);
    if (existing === undefined) throw new Error("v12_native_acceptance_custom_exercise_precondition_missing");
    const result = await editCustomExercise({
      repository,
      invalidate: async () => undefined,
      input: {
        ...customExerciseInput(requestId, exerciseId),
        name: "V12 edited custom exercise",
        aliases: ["V12 edited"],
        expectedExerciseRevision: existing.revision,
        editedAtMs: V12_RUNNING_SEED_AT_MS + 1,
      },
    });
    if (result.outcome !== "committed" || result.exercise.revision !== existing.revision + 1) throw new Error("v12_native_acceptance_custom_exercise_postcondition_failed");
  }
  return customMutationFacts({
    handler: input,
    before,
    expectedMutationKind: "edit",
    verify: async () => {
      const row = await customExerciseRow(input.kernel, exerciseId);
      if (row === undefined || row.revision < 2) throw new Error("v12_native_acceptance_custom_exercise_postcondition_failed");
    },
  });
}

async function executeCustomHidden(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  const request = requireRequest(input);
  const repository = requireCustomExerciseRepository(input);
  const requestId = customExerciseActionRequestId(request);
  const exerciseId = customExerciseFixtureId(request);
  const hidden = input.contract.caseId !== "library.custom-exercise-unhide";
  const before = await customExerciseReceipt(input.kernel, requestId);
  if (before === undefined) {
    const preference = await customExercisePreference(input.kernel, exerciseId);
    const result = await setExerciseHidden({
      repository,
      invalidate: async () => undefined,
      input: { requestId, exerciseId, expectedPreferenceRevision: preference?.revision ?? null, hidden, updatedAtMs: V12_RUNNING_SEED_AT_MS + 1 },
    });
    if (result.outcome !== "committed" || result.hidden !== hidden) throw new Error("v12_native_acceptance_custom_exercise_postcondition_failed");
  }
  return customMutationFacts({
    handler: input,
    before,
    expectedMutationKind: "hidden",
    verify: async () => {
      const [preference] = await input.kernel.queryAll<Readonly<{ hidden: number }>>("SELECT hidden FROM exercise_owner_preferences WHERE exercise_id = ?", [exerciseId]);
      if (preference === undefined || preference.hidden !== (hidden ? 1 : 0)) throw new Error("v12_native_acceptance_custom_exercise_postcondition_failed");
    },
  });
}

async function executeCustomArchive(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  const request = requireRequest(input);
  const repository = requireCustomExerciseRepository(input);
  const requestId = customExerciseActionRequestId(request);
  const exerciseId = customExerciseFixtureId(request);
  const archived = input.contract.caseId !== "library.custom-exercise-reactivate";
  const before = await customExerciseReceipt(input.kernel, requestId);
  if (before === undefined) {
    const row = await customExerciseRow(input.kernel, exerciseId);
    const preference = await customExercisePreference(input.kernel, exerciseId);
    if (row === undefined) throw new Error("v12_native_acceptance_custom_exercise_precondition_missing");
    const preview = await previewCustomExerciseArchive({ repository, input: { exerciseId, expectedExerciseRevision: row.revision } });
    const command = archived ? archiveCustomExercise : restoreCustomExercise;
    const result = await command({
      repository,
      invalidate: async () => undefined,
      input: { requestId, exerciseId, expectedExerciseRevision: row.revision, expectedPreferenceRevision: preference?.revision ?? null, previewRevision: preview.previewRevision, updatedAtMs: V12_RUNNING_SEED_AT_MS + 1 },
    });
    if (result.outcome !== "committed" || result.archived !== archived) throw new Error("v12_native_acceptance_custom_exercise_postcondition_failed");
  }
  return customMutationFacts({
    handler: input,
    before,
    expectedMutationKind: "archive",
    verify: async () => {
      const [preference] = await input.kernel.queryAll<Readonly<{ archived: number }>>("SELECT archived FROM exercise_owner_preferences WHERE exercise_id = ?", [exerciseId]);
      if (preference === undefined || preference.archived !== (archived ? 1 : 0)) throw new Error("v12_native_acceptance_custom_exercise_postcondition_failed");
    },
  });
}

async function bundledExerciseSource(kernel: SqliteKernel) {
  const [source] = await kernel.queryAll<Readonly<{
    id: string;
    revision: number;
    name: string;
  }>>(
    `SELECT id, revision, name
     FROM exercises
     WHERE origin = 'bundled'
       AND metric_profile = 'load_reps'
     ORDER BY id
     LIMIT 1`,
  );
  return source;
}

function copiedCustomExerciseId(request: V12NativeAcceptanceRequest): string {
  return `v12:custom-copy:${request.nonce}`;
}

async function prepareCustomCopy(input: V12NativeAcceptanceProductionHandlerInput): Promise<void> {
  const request = requireRequest(input);
  await createContentRepository(input.kernel).importAcceptedCatalog({
    catalog: await parseAcceptedPhase2Catalog(runtimeSha256),
  });
  const source = await bundledExerciseSource(input.kernel);
  if (source === undefined || source.revision < 1 || source.name.length === 0) {
    throw new Error("v12_native_acceptance_copy_source_missing");
  }
  if (!copiedCustomExerciseId(request).includes(request.nonce)) {
    throw new Error("v12_native_acceptance_copy_nonce_unbound");
  }
}

async function executeCustomCopy(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  const request = requireRequest(input);
  const repository = requireCustomExerciseRepository(input);
  const requestId = customExerciseActionRequestId(request);
  const before = await customExerciseReceipt(input.kernel, requestId);
  const source = await bundledExerciseSource(input.kernel);
  const exerciseId = copiedCustomExerciseId(request);
  if (before === undefined) {
    if (source === undefined) throw new Error("v12_native_acceptance_copy_precondition_missing");
    const result = await createCustomCopy({
      repository,
      invalidate: async () => undefined,
      input: {
        requestId,
        sourceExerciseId: source.id,
        expectedSourceRevision: source.revision,
        exerciseId,
        name: `V12 copy of ${source.name}`,
        createdAtMs: V12_RUNNING_SEED_AT_MS + 1,
      },
    });
    if (result.outcome !== "committed" || result.exercise.exerciseId !== exerciseId) {
      throw new Error("v12_native_acceptance_custom_exercise_postcondition_failed");
    }
  }
  return customMutationFacts({
    handler: input,
    before,
    expectedMutationKind: "copy",
    verify: async () => {
      const [copied] = await input.kernel.queryAll<Readonly<{
        id: string;
        origin: string;
        revision: number;
      }>>(
        "SELECT id, origin, revision FROM exercises WHERE id = ? AND origin = 'custom'",
        [exerciseId],
      );
      if (copied === undefined || copied.revision < 1) {
        throw new Error("v12_native_acceptance_custom_exercise_postcondition_failed");
      }
    },
  });
}

function requireOwnedPlanRuntime(input: V12NativeAcceptanceProductionHandlerInput): OwnedPlanRuntimePort {
  const runtime = input.runtime?.ownedPlans;
  if (runtime === undefined) throw new Error("v12_native_acceptance_owned_plan_runtime_required");
  return runtime;
}

function metricFixtureExerciseId(request: V12NativeAcceptanceRequest): string {
  return `v12:metric-exercise:${request.nonce}`;
}

function metricFixturePlanId(request: V12NativeAcceptanceRequest): string {
  return `v12:metric-plan:${request.nonce}`;
}

function metricFixtureDayId(request: V12NativeAcceptanceRequest): string {
  return `v12:metric-day:${request.nonce}`;
}

function metricFixtureOccurrenceId(request: V12NativeAcceptanceRequest): string {
  return `v12:metric-occurrence:${request.nonce}`;
}

function metricFixtureTargetId(request: V12NativeAcceptanceRequest): string {
  return `v12:metric-target:${request.nonce}`;
}

async function metricFixtureRows(kernel: SqliteKernel, request: V12NativeAcceptanceRequest) {
  const [exercise] = await kernel.queryAll<Readonly<{
    revision: number;
    metric_profile: string;
    metric_contract_version: number;
    exercise_metric_generation: number;
  }>>(
    `SELECT revision, metric_profile, metric_contract_version,
            exercise_metric_generation
     FROM exercises
     WHERE id = ? AND origin = 'custom'`,
    [metricFixtureExerciseId(request)],
  );
  const [target] = await kernel.queryAll<Readonly<{ revision: number }>>(
    "SELECT revision FROM owned_plan_working_set_targets WHERE id = ?",
    [metricFixtureTargetId(request)],
  );
  const [policy] = await kernel.queryAll<Readonly<{ revision: number }>>(
    "SELECT revision FROM owned_plan_progression_policies WHERE plan_day_exercise_id = ?",
    [metricFixtureOccurrenceId(request)],
  );
  return Object.freeze({ exercise, target, policy });
}

async function prepareMetricMigration(input: V12NativeAcceptanceProductionHandlerInput): Promise<void> {
  const request = requireRequest(input);
  const customExercises = requireCustomExerciseRepository(input);
  const ownedPlans = requireOwnedPlanRuntime(input);
  const exerciseId = metricFixtureExerciseId(request);
  const planId = metricFixturePlanId(request);
  if (await customExerciseRow(input.kernel, exerciseId) === undefined) {
    const created = await createCustomExercise({
      repository: customExercises,
      invalidate: async () => undefined,
      input: {
        requestId: `${customExerciseSeedRequestId(request)}:metric`,
        exerciseId,
        name: "V12 metric migration fixture",
        aliases: ["V12 metric fixture"],
        exerciseType: "strength",
        movementClass: "isolation",
        primaryMuscles: ["core"],
        secondaryMuscles: [],
        equipment: ["bodyweight"],
        metricIdentity: { profile: "timed_hold", contractVersion: 1, exerciseMetricGeneration: 1 },
        defaultRestSeconds: 60,
        progression: { kind: "manual_hold", version: 1 },
        createdAtMs: V12_RUNNING_SEED_AT_MS,
      },
    });
    if (created.outcome !== "committed") throw new Error("v12_native_acceptance_metric_seed_invalid");
  }
  if (await ownedPlans.loadPlan(planId) === null) {
    const created = await ownedPlans.createFixtureDraft({
      requestId: `${runningSeedRequestId(request)}:metric-plan`,
      planId,
      dayId: metricFixtureDayId(request),
      name: "V12 metric migration plan",
      dayName: "Metric day",
    });
    if (created.outcome !== "committed") throw new Error("v12_native_acceptance_metric_plan_seed_invalid");
    const saved = await ownedPlans.savePlan({
      requestId: `${runningSeedRequestId(request)}:metric-save`,
      expectedRevision: created.plan.revision,
      plan: {
        id: planId,
        name: "V12 metric migration plan",
        days: [{
          id: metricFixtureDayId(request), name: "Metric day", ordinal: 0,
          occurrences: [{
            id: metricFixtureOccurrenceId(request), exerciseId, ordinal: 0,
            restSeconds: 60,
            metricIdentity: { profile: "timed_hold", contractVersion: 1, exerciseMetricGeneration: 1 },
            warmups: [],
            targets: [{
              id: metricFixtureTargetId(request), ordinal: 0,
              target: { version: 1, profile: "timed_hold", durationSeconds: 45, perSide: false },
              units: { version: 1, duration: "seconds" },
            }],
            policy: {
              id: `v12:metric-policy:${request.nonce}`,
              kind: "manual_hold", policyId: "manual-hold-v1", version: 1,
              rule: { kind: "manual_hold", id: "manual-hold-v1", version: 1 },
            },
          }],
        }],
      },
    });
    if (saved.outcome !== "committed") throw new Error("v12_native_acceptance_metric_plan_seed_invalid");
  }
  const facts = await metricFixtureRows(input.kernel, request);
  if (await metricMigrationEvent(input.kernel, customExerciseActionRequestId(request)) !== undefined) {
    return;
  }
  if (facts.exercise === undefined || facts.exercise.revision !== 1) {
    throw new Error("v12_native_acceptance_metric_exercise_precondition_missing");
  }
  if (facts.target === undefined || facts.target.revision !== 1) {
    throw new Error("v12_native_acceptance_metric_target_precondition_missing");
  }
  if (facts.policy === undefined || facts.policy.revision !== 1) {
    throw new Error("v12_native_acceptance_metric_policy_precondition_missing");
  }
}

async function metricMigrationEvent(kernel: SqliteKernel, requestId: string) {
  const [event] = await kernel.queryAll<Readonly<{
    idempotency_key: string;
    exercise_id: string;
    exercise_revision: number;
    to_exercise_metric_generation: number;
    result_json: string;
  }>>(
    `SELECT idempotency_key, exercise_id, exercise_revision,
            to_exercise_metric_generation, result_json
     FROM metric_profile_migration_events
     WHERE idempotency_key = ?`,
    [requestId],
  );
  return event;
}

async function executeMetricMigration(input: V12NativeAcceptanceProductionHandlerInput): Promise<Readonly<{ result: "committed"; facts: unknown }>> {
  const request = requireRequest(input);
  const requestId = customExerciseActionRequestId(request);
  const before = await metricMigrationEvent(input.kernel, requestId);
  const fixture = await metricFixtureRows(input.kernel, request);
  if (fixture.exercise === undefined || fixture.target === undefined || fixture.policy === undefined) {
    throw new Error("v12_native_acceptance_metric_precondition_missing");
  }
  if (before === undefined) {
    const result = await migrateCustomExerciseMetricProfile({
      repository: createMetricRepository(input.kernel),
      input: {
        exerciseId: metricFixtureExerciseId(request),
        expectedExerciseRevision: fixture.exercise.revision,
        fromIdentity: { profile: "timed_hold", contractVersion: 1, exerciseMetricGeneration: 1 },
        toIdentity: { profile: "timed_hold", contractVersion: 2, exerciseMetricGeneration: 2 },
        replacements: [{
          targetId: metricFixtureTargetId(request),
          expectedTargetRevision: fixture.target.revision,
          target: { version: 2, profile: "timed_hold", durationMs: 45_000, perSide: false },
          unit: { version: 2, duration: "milliseconds" },
        }],
        policyDecisions: [{
          planDayExerciseId: metricFixtureOccurrenceId(request),
          expectedPolicyRevision: fixture.policy.revision,
          policy: { kind: "manual_hold", version: 1 },
        }],
        acknowledgedHistoryImmutable: true,
        idempotencyKey: requestId,
        migratedAtMs: V12_RUNNING_SEED_AT_MS + 1,
      },
    });
    if (result.outcome !== "committed" || result.exerciseRevision !== fixture.exercise.revision + 1
      || result.metricIdentity.exerciseMetricGeneration !== 2) {
      throw new Error("v12_native_acceptance_metric_postcondition_failed");
    }
  }
  const event = await metricMigrationEvent(input.kernel, requestId);
  const post = await metricFixtureRows(input.kernel, request);
  if (event === undefined || event.exercise_id !== metricFixtureExerciseId(request)
    || event.exercise_revision !== 2 || event.to_exercise_metric_generation !== 2
    || !event.result_json.includes('"outcome":"committed"')
    || post.exercise?.exercise_metric_generation !== 2
    || post.target === undefined || post.target.revision !== 2
    || post.policy === undefined || post.policy.revision !== 2) {
    throw new Error("v12_native_acceptance_metric_postcondition_failed");
  }
  if (input.kernel.readSnapshot === undefined) throw new Error("v12_native_acceptance_snapshot_unavailable");
  const authoritativeReadback = await input.kernel.readSnapshot((query) => readCaseFacts(query, input.contract));
  return Object.freeze({
    result: "committed" as const,
    facts: operationFacts({
      contract: input.contract,
      authoritativeReadback,
      receiptId: stableJson(Object.freeze({ idempotency_key: event.idempotency_key })),
      outcome: before === undefined ? "committed" : "already_committed",
      committedEffects: before === undefined ? 1 : 0,
    }),
  });
}

/**
 * Executes the case-owned production boundary. Phase 13 cases use their exact
 * repository contract. Workout and Library cases use a case-scoped query or
 * serialized writer transaction over the contract's authoritative table;
 * post-action snapshots below independently verify committed readback.
 */
async function executeV12NativeAcceptanceProductionOperation(input: Readonly<{
  kernel: SqliteKernel;
  contract: V12NativeAcceptanceCaseContract;
  request?: V12NativeAcceptanceRequest;
}>): Promise<Readonly<{ result: "read" | "committed"; facts: unknown }>> {
  const { contract, kernel } = input;
  if (contract.shard === "multi-plan") {
    await runMultiPlanRunningContractCase(contract.caseId as MultiPlanRunningContractCaseId, kernel);
    return Object.freeze({
      result: "committed" as const,
      facts: operationFacts({
        contract,
        authoritativeReadback: Object.freeze({ repository_contract: contract.caseId }),
        receiptId: `${contract.caseId}:contract-receipt`,
        outcome: "committed",
        committedEffects: 1,
      }),
    });
  }
  if (contract.operation.kind === "repository-read") {
    if (kernel.readSnapshot === undefined) throw new Error("v12_native_acceptance_snapshot_unavailable");
    const readback = await kernel.readSnapshot((query) => readCaseFacts(query, contract));
    if (readback.rowCount === 0 && !EMPTY_POSTCONDITION_CASES.has(contract.caseId)) {
      throw new Error("v12_native_acceptance_postcondition_failed");
    }
    return Object.freeze({
      result: "read" as const,
      facts: operationFacts({ contract, authoritativeReadback: readback }),
    });
  }
  const receipt = contract.operation.receipt;
  if (receipt === null) throw new Error("v12_native_acceptance_receipt_contract_missing");
  const transaction = await kernel.write(async (writer) => {
    const readback = await readCaseFacts(writer, contract);
    const receiptFacts = readback.tables.find(({ table }) => table === receipt.table);
    const row = (receiptFacts?.rows as readonly Readonly<Record<string, unknown>>[] | undefined)
      ?.filter((candidate) => Object.entries(receipt.expectedValues).every(([column, value]) => candidate[column] === value))
      .at(-1);
    if (row === undefined) throw new Error("v12_native_acceptance_mutation_receipt_missing");
    const identity = Object.freeze(Object.fromEntries(receipt.identityColumns.map((column) => [column, row[column]])));
    const effect = Object.freeze(Object.fromEntries(receipt.effectColumns.map((column) => [column, row[column]])));
    if (Object.values(identity).some((value) => value === null || value === undefined || value === "")
      || Object.values(effect).every((value) => value === null || value === undefined)) {
      throw new Error("v12_native_acceptance_mutation_receipt_invalid");
    }
    return Object.freeze({ readback, receiptId: stableJson(identity) });
  });
  return Object.freeze({
    result: "committed" as const,
    facts: operationFacts({
      contract,
      authoritativeReadback: transaction.readback,
      receiptId: transaction.receiptId,
      outcome: "already_committed",
      committedEffects: 0,
    }),
  });
}

const productionHandlerEntries = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.reduce(
  (entries, contract) => {
    const current = entries.get(contract.operation.handlerId) ?? [];
    current.push(contract.operation.id);
    entries.set(contract.operation.handlerId, current);
    return entries;
  },
  new Map<string, string[]>(),
);

const productionHandlerExecutors: Readonly<Record<string, Pick<V12NativeAcceptanceProductionHandler, "prepare" | "execute">>> = Object.freeze({
  [WORKOUT_START_HANDLER]: Object.freeze({
    prepare: prepareWorkoutFixture,
    execute: executeWorkoutStart,
  }),
  [WORKOUT_SET_DRAFT_HANDLER]: Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutSetDraft,
  }),
  [WORKOUT_ADD_SET_HANDLER]: Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutAddSet,
  }),
  [WORKOUT_COMPLETE_SET_HANDLER]: Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutCompleteSet,
  }),
  [WORKOUT_REST_ADJUST_HANDLER]: Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutRestAdjust,
  }),
  [WORKOUT_REST_RESUME_HANDLER]: Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutRestResume,
  }),
  [WORKOUT_ADD_EXERCISE_HANDLER]: Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutAddExercise,
  }),
  [WORKOUT_REORDER_EXERCISES_HANDLER]: Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutReorderExercises,
  }),
  [WORKOUT_REPLACE_EXERCISE_HANDLER]: Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutReplaceExercise,
  }),
  [WORKOUT_REMOVE_EXERCISE_HANDLER]: Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutRemoveExercise,
  }),
  [WORKOUT_UNDO_COMPLETED_SET_HANDLER]: Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutUndoCompletedSet,
  }),
  [WORKOUT_PREFERENCE_WRITE_HANDLER]: Object.freeze({
    prepare: prepareWorkoutFixture,
    execute: executeWorkoutPreferenceWrite,
  }),
  "workout.plans-workout-repository.get-today-view": Object.freeze({
    prepare: prepareWorkoutFixture,
    execute: executeWorkoutRepositoryRead,
  }),
  "workout.plans-workout-repository.get-plan-days": Object.freeze({
    prepare: prepareWorkoutFixture,
    execute: executeWorkoutRepositoryRead,
  }),
  "active-workout.workout-repository.get-workout-session": Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutRepositoryRead,
  }),
  "active-workout.workout-repository.get-active-workout": Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutRepositoryRead,
  }),
  "rest.rest-repository.get-rest-context": Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutRepositoryRead,
  }),
  "workout.workout-outcome-repository.get-session-detail": Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutRepositoryRead,
  }),
  "active-workout.workout-repository.complete-set-conflict": Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutCompleteSetConflict,
  }),
  "workout.workout-presentation.project-workout": Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutPresentationRead,
  }),
  "workout.workout-presentation.project-accessibility": Object.freeze({
    prepare: prepareActiveWorkoutFixture,
    execute: executeWorkoutPresentationRead,
  }),
  "library.library-search-repository.search-exercises": Object.freeze({
    prepare: prepareLibrarySearch,
    execute: executeLibraryExerciseSearch,
  }),
  "owned-plan.owned-plan-repository.read": Object.freeze({
    prepare: prepareOwnedPlanReadFixture,
    execute: executeOwnedPlanRead,
  }),
  "starter-plan.starter-plan-repository.activate-accepted-starter-plan": Object.freeze({
    execute: executeAcceptedStarterActivation,
  }),
  [RUNNING_AGGREGATE_READ_HANDLER]: Object.freeze({
    prepare: prepareRunningFamilyB,
    execute: executeRunningAggregateRead,
  }),
  [RUNNING_CREATE_HANDLER]: Object.freeze({
    prepare: prepareRunningFamilyB,
    execute: executeRunningCreateZeroSessions,
  }),
  [RUNNING_GOAL_EDIT_HANDLER]: Object.freeze({
    prepare: prepareRunningGoalEdit,
    execute: executeRunningGoalEdit,
  }),
  [RUNNING_SOURCE_GRAPH_HANDLER]: Object.freeze({
    prepare: prepareRunningFamilyB,
    execute: executeRunningGraphSave,
  }),
  [RUNNING_LIFECYCLE_HANDLER]: Object.freeze({
    prepare: prepareRunningFamilyB,
    execute: executeRunningLifecycle,
  }),
  [CUSTOM_FAVORITE_HANDLER]: Object.freeze({
    prepare: prepareCustomFavorite,
    execute: executeCustomFavorite,
  }),
  [CUSTOM_CREATE_HANDLER]: Object.freeze({
    execute: executeCustomCreate,
  }),
  [CUSTOM_EDIT_HANDLER]: Object.freeze({
    prepare: prepareCustomFavorite,
    execute: executeCustomEdit,
  }),
  [CUSTOM_HIDDEN_HANDLER]: Object.freeze({
    prepare: prepareCustomFavorite,
    execute: executeCustomHidden,
  }),
  [CUSTOM_ARCHIVE_HANDLER]: Object.freeze({
    prepare: prepareCustomFavorite,
    execute: executeCustomArchive,
  }),
  [CUSTOM_COPY_HANDLER]: Object.freeze({
    prepare: prepareCustomCopy,
    execute: executeCustomCopy,
  }),
  [METRIC_MIGRATION_HANDLER]: Object.freeze({
    prepare: prepareMetricMigration,
    execute: executeMetricMigration,
  }),
});

export const V12_NATIVE_ACCEPTANCE_PRODUCTION_HANDLER_REGISTRY: Readonly<Record<string, V12NativeAcceptanceProductionHandler>> = Object.freeze(
  Object.fromEntries([...productionHandlerEntries].map(([handlerId, operationIds]) => {
    const executor = productionHandlerExecutors[handlerId];
    return [
      handlerId,
      Object.freeze({
        handlerId,
        operationIds: Object.freeze([...operationIds]),
        ...(executor?.prepare === undefined ? {} : { prepare: executor.prepare }),
        execute: executor?.execute
          ?? ((input: V12NativeAcceptanceProductionHandlerInput) => executeV12NativeAcceptanceProductionOperation(input)),
      }),
    ];
  })),
);

export function resolveV12NativeAcceptanceProductionHandler(
  contract: V12NativeAcceptanceCaseContract,
): V12NativeAcceptanceProductionHandler {
  const handler = V12_NATIVE_ACCEPTANCE_PRODUCTION_HANDLER_REGISTRY[contract.operation.handlerId];
  if (handler === undefined || !handler.operationIds.includes(contract.operation.id)) {
    throw new Error("v12_native_acceptance_handler_unresolved");
  }
  return handler;
}

export function assertV12NativeAcceptanceProductionHandlerRegistry(
  contracts: readonly V12NativeAcceptanceCaseContract[] = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS,
): true {
  for (const contract of contracts) {
    if (contract.probes.post.tables.some((table) => TABLE_FACT_COLUMNS[table] === undefined)) {
      throw new Error("v12_native_acceptance_authority_fact_columns_missing");
    }
    if (typeof resolveV12NativeAcceptanceProductionHandler(contract).execute !== "function") {
      throw new Error("v12_native_acceptance_handler_unresolved");
    }
  }
  return true;
}

assertV12NativeAcceptanceProductionHandlerRegistry();

/** Must run before source pre-state is captured so production setup is not
 * misreported as the UI/action mutation. */
export async function prepareV12NativeAcceptanceProductionOperation(input: V12NativeAcceptanceProductionHandlerInput): Promise<void> {
  await resolveV12NativeAcceptanceProductionHandler(input.contract).prepare?.(input);
}

export async function dispatchV12NativeAcceptanceProductionOperation(input: Readonly<{
  kernel: SqliteKernel;
  contract: V12NativeAcceptanceCaseContract;
  request?: V12NativeAcceptanceRequest;
  runtime?: V12NativeAcceptanceProductionRuntime;
}>): Promise<Readonly<{ result: "read" | "committed"; facts: unknown }>> {
  return resolveV12NativeAcceptanceProductionHandler(input.contract).execute(input);
}

async function readAuthorityState(input: Readonly<{
  kernel: SqliteKernel;
  contract: V12NativeAcceptanceCaseContract;
  probe: V12NativeAcceptanceCaseContract["probes"]["pre"];
  sha256(value: string): Promise<string>;
  operationResultSha256?: string;
}>): Promise<Readonly<{ state: V12NativeAcceptanceSourceState; facts: unknown }>> {
  if (input.kernel.readSnapshot === undefined) throw new Error("v12_native_acceptance_snapshot_unavailable");
  const snapshot = await input.kernel.readSnapshot(async (transaction: SqliteReadTransactionExecutor) => {
    const [version] = await transaction.queryAll<{ user_version: number }>("PRAGMA user_version");
    const facts = await readCaseFacts(transaction, input.contract);
    return Object.freeze({ schemaVersion: version?.user_version ?? -1, facts, rowCount: facts.rowCount });
  });
  const factsSha256 = await input.sha256(stableJson({ schema_version: snapshot.schemaVersion, facts: snapshot.facts }));
  const digest = await input.sha256(stableJson({
    probe_id: input.probe.id,
    facts_sha256: factsSha256,
    operation_result_sha256: input.operationResultSha256 ?? null,
  }));
  if (!HASH.test(factsSha256) || !HASH.test(digest) || !Number.isSafeInteger(snapshot.schemaVersion) || snapshot.schemaVersion < 1 || !Number.isSafeInteger(snapshot.rowCount) || snapshot.rowCount < 0) {
    throw new Error("v12_native_acceptance_source_state_invalid");
  }
  return Object.freeze({
    state: Object.freeze({ probe_id: input.probe.id, facts_sha256: factsSha256, source_sha256: digest, row_count: snapshot.rowCount, table_count: input.probe.tables.length, schema_version: snapshot.schemaVersion }),
    facts: snapshot.facts,
  });
}

export async function executeV12NativeAcceptanceReadAction(input: Readonly<{
  kernel: SqliteKernel;
  request: V12NativeAcceptanceRequest;
  sha256(value: string): Promise<string>;
  /** Case setup uses production commands and must finish before pre-state. */
  prepareOperation?(input: Readonly<{
    contract: V12NativeAcceptanceCaseContract;
    request: V12NativeAcceptanceRequest;
  }>): Promise<void>;
  executeOperation(input: Readonly<{
    contract: V12NativeAcceptanceCaseContract;
    request: V12NativeAcceptanceRequest;
  }>): Promise<Readonly<{ result: "read" | "committed"; facts: unknown }>>;
}>): Promise<V12NativeAcceptanceReadbacks> {
  const { request } = input;
  if (!NONCE.test(request.nonce)) throw new Error("v12_native_acceptance_request_invalid");
  const contract = v12NativeAcceptanceCaseContract(request.shard, request.caseId);
  const expectedTables = authorityTablesForV12NativeAcceptance(request.shard, request.caseId, request.sourceProbe);
  if (request.action !== contract.actionId || request.readback !== contract.uiReadback.label
    || stableJson(expectedTables) !== stableJson(request.authorityTables)) throw new Error("v12_native_acceptance_authority_mismatch");
  const actionRequest = Object.freeze({
    schema_version: 2,
    producer: "v12-native-acceptance-action-request/v2",
    shard: request.shard,
    case_id: request.caseId,
    nonce: request.nonce,
    action_id: request.action,
    operation_id: contract.operation.id,
    operation_kind: contract.operation.kind,
    operation_handler_id: contract.operation.handlerId,
    operation_postcondition_id: contract.operation.postcondition.id,
    expected_result: contract.operation.expectedResult,
    source_probe: request.sourceProbe,
    authority_tables: request.authorityTables,
    probe_ids: Object.freeze([contract.probes.pre.id, contract.probes.action.id, contract.probes.post.id]),
    ui_readback_id: contract.uiReadback.id,
  });
  const actionRequestSha256 = await input.sha256(JSON.stringify(actionRequest));
  await input.prepareOperation?.({ contract, request });
  const preRead = await readAuthorityState({ ...input, contract, probe: contract.probes.pre });
  const operationResult = await input.executeOperation({ contract, request });
  if (operationResult.result !== contract.operation.expectedResult) throw new Error("v12_native_acceptance_operation_result_invalid");
  const facts = operationResult.facts as Partial<V12OperationFacts> | null;
  if (facts === null || typeof facts !== "object" || Array.isArray(facts)
    || facts.handler_id !== contract.operation.handlerId
    || facts.postcondition_id !== contract.operation.postcondition.id
    || !Number.isSafeInteger(facts.committed_effects) || Number(facts.committed_effects) < 0) {
    throw new Error("v12_native_acceptance_operation_result_invalid");
  }
  const committedEffects = Number(facts.committed_effects);
  if (contract.operation.kind === "repository-read") {
    if (facts.receipt_id !== null || facts.outcome !== null || facts.committed_effects !== 0) {
      throw new Error("v12_native_acceptance_operation_result_invalid");
    }
  } else if (typeof facts.receipt_id !== "string" || facts.receipt_id.length < 8
    || (facts.outcome !== "committed" && facts.outcome !== "already_committed")
    || (facts.outcome === "committed" && facts.committed_effects === 0)
    || (facts.outcome === "already_committed" && facts.committed_effects !== 0)) {
    throw new Error(facts.outcome === "committed"
      ? "v12_native_acceptance_mutation_effect_missing"
      : "v12_native_acceptance_operation_result_invalid");
  }
  const postProofRead = await readAuthorityState({ ...input, contract, probe: contract.probes.post });
  if (contract.operation.kind === "repository-read" && preRead.state.facts_sha256 !== postProofRead.state.facts_sha256) {
    throw new Error("v12_native_acceptance_read_action_drift");
  }
  if (stableJson(facts.authoritative_readback) !== stableJson(postProofRead.facts)) {
    throw new Error("v12_native_acceptance_operation_result_invalid");
  }
  const durableProof = Object.freeze({
    operation_id: contract.operation.id,
    result: operationResult.result,
    handler_id: facts.handler_id,
    postcondition_id: facts.postcondition_id,
    receipt_id: facts.receipt_id,
    outcome: facts.outcome,
    committed_effects: committedEffects,
    authoritative_facts_sha256: postProofRead.state.facts_sha256,
  });
  const operationResultSha256 = await input.sha256(stableJson(durableProof));
  if (!HASH.test(operationResultSha256)) throw new Error("v12_native_acceptance_operation_result_invalid");
  const actionRead = await readAuthorityState({ ...input, contract, probe: contract.probes.action, operationResultSha256 });
  const postRead = await readAuthorityState({ ...input, contract, probe: contract.probes.post });
  const pre = preRead.state;
  const action = actionRead.state;
  const post = postRead.state;
  if (contract.operation.kind === "repository-read" && (pre.facts_sha256 !== action.facts_sha256 || pre.facts_sha256 !== post.facts_sha256)) throw new Error("v12_native_acceptance_read_action_drift");
  if (postProofRead.state.facts_sha256 !== post.facts_sha256) throw new Error("v12_native_acceptance_postcondition_drift");
  if (contract.operation.kind === "repository-mutation") {
    if (facts.outcome === "committed" && pre.facts_sha256 === post.facts_sha256) {
      throw new Error("v12_native_acceptance_mutation_effect_missing");
    }
    if (facts.outcome === "already_committed" && pre.facts_sha256 !== post.facts_sha256) {
      throw new Error("v12_native_acceptance_replay_mutated");
    }
  }
  const sourceUnsigned = Object.freeze({
    schema_version: 2 as const,
    producer: "v12-native-acceptance-source/v2" as const,
    authority: "sqlite-production-operation" as const,
    shard: request.shard,
    case_id: request.caseId,
    nonce: request.nonce,
    action_id: request.action,
    operation_id: contract.operation.id,
    operation_kind: contract.operation.kind,
    operation_result: operationResult.result,
    operation_result_sha256: operationResultSha256,
    operation_handler_id: contract.operation.handlerId,
    operation_postcondition_id: contract.operation.postcondition.id,
    command_receipt_id: facts.receipt_id ?? null,
    command_outcome: facts.outcome ?? null,
    committed_effects: committedEffects,
    source_probe: request.sourceProbe,
    authority_tables: request.authorityTables,
    pre,
    action,
    post,
    action_request_sha256: actionRequestSha256,
  });
  const sourceReceipt = Object.freeze({ ...sourceUnsigned, source_receipt_sha256: await input.sha256(JSON.stringify(sourceUnsigned)) });
  const uiUnsigned = Object.freeze({
    schema_version: 2 as const,
    producer: "v12-native-acceptance-ui-readback/v2" as const,
    shard: request.shard,
    case_id: request.caseId,
    nonce: request.nonce,
    declared_action: request.action,
    declared_readback: request.readback,
    readback_id: contract.uiReadback.id,
    source_receipt_sha256: sourceReceipt.source_receipt_sha256,
  });
  const uiReadback = Object.freeze({ ...uiUnsigned, ui_receipt_sha256: await input.sha256(JSON.stringify(uiUnsigned)) });
  return Object.freeze({ source_receipt: sourceReceipt, ui_readback: uiReadback });
}
