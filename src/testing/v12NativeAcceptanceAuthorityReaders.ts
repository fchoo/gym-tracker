import type { SqliteReadTransactionExecutor } from "../platform/sqlite/sqliteKernel";
import {
  V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS,
  v12NativeAcceptanceCaseContract,
  type V12NativeAcceptanceCaseContract,
  type V12NativeAcceptanceOperationKind,
} from "./contracts/phase15Workout.contract";

const NONCE = /^[a-f0-9]{48}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const MAX_PROJECTION_ROWS = 8;

export type V12NativeAcceptanceAuthorityReaderRequest = Readonly<{
  caseId: string;
  fixtureId: "v12-synthetic-fixtures-r18";
  nonce: string;
}>;

export type V12NativeAcceptanceAuthorityProof = Readonly<{
  schemaVersion: 1;
  operationId: string;
  caseId: string;
  operationKind: V12NativeAcceptanceOperationKind;
  authorityTables: readonly string[];
  projectionRowCount: number;
  projectionSha256: string;
}>;

type AuthorityScope = Readonly<{
  nonce: string;
  nonceLike: string;
  workoutPlanId: string;
  completionActivationRequestId: string;
  completionWritebackExerciseId: string;
  metricDraftExerciseId: string;
  runningPlanId: string;
  ownedReadPlanId: string;
  workoutPreferenceKey: string;
  customExerciseId: string;
  copiedCustomExerciseId: string;
  metricExerciseId: string;
  historySubjectId: string;
  historySubjectUpdatedAt: number;
  bundledInstructionExerciseId: string;
  actionIdentity: string;
}>;

export type V12NativeAcceptanceAuthorityQuery = Readonly<{
  sql: string;
  parameterKeys: readonly (keyof AuthorityScope)[];
}>;

export type V12NativeAcceptanceAuthorityReader = Readonly<{
  operationId: string;
  caseId: string;
  operationKind: V12NativeAcceptanceOperationKind;
  authorityTables: readonly string[];
  queries: readonly V12NativeAcceptanceAuthorityQuery[];
  allowZeroRows: false;
  read(input: Readonly<{
    query: SqliteReadTransactionExecutor;
    request: V12NativeAcceptanceAuthorityReaderRequest;
    sha256(value: string): Promise<string>;
  }>): Promise<V12NativeAcceptanceAuthorityProof>;
}>;

type ReaderSpec = Readonly<{
  shard: "workout" | "library-running";
  caseId: string;
  sql: string;
  parameterKeys: readonly (keyof AuthorityScope)[];
}>;

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function authorityScope(request: V12NativeAcceptanceAuthorityReaderRequest): AuthorityScope {
  if (request.fixtureId !== "v12-synthetic-fixtures-r18" || !NONCE.test(request.nonce)) {
    throw new Error("v12_native_acceptance_authority_reader_request_invalid");
  }
  const activatedAtMs = 1_800_000_000_000 + Number.parseInt(request.nonce.slice(0, 8), 16);
  return Object.freeze({
    nonce: request.nonce,
    nonceLike: `%${request.nonce}%`,
    workoutPlanId: `plan_copy_${activatedAtMs}`,
    completionActivationRequestId: `v12:completion-writeback:${request.nonce}:starter`,
    completionWritebackExerciseId: `v12:completion-writeback:${request.nonce}:exercise`,
    metricDraftExerciseId: `v12:workout:${request.caseId}:${request.nonce}:metric-exercise`,
    runningPlanId: `v12:running:${request.nonce}`,
    ownedReadPlanId: `v12:owned-plan-read:${request.nonce}`,
    workoutPreferenceKey: `gym_tracker.workout_plan_preferences.v1:plan_copy_${activatedAtMs}`,
    customExerciseId: `v12:custom-exercise:${request.nonce}`,
    copiedCustomExerciseId: `v12:custom-copy:${request.nonce}`,
    metricExerciseId: `v12:metric-exercise:${request.nonce}`,
    historySubjectId: 'history-subject/v1:["exercise_metric","5f140001-7e35-4a6d-9100-000000000001","load_reps:1:1","identity"]',
    historySubjectUpdatedAt: activatedAtMs + 6_000,
    bundledInstructionExerciseId: "00fda844-429f-58c8-9c8c-134b730a480b",
    actionIdentity: actionIdentity(request.caseId, request.nonce),
  });
}

function actionIdentity(caseId: string, nonce: string): string {
  if (caseId === "workout.add-set") return `v12:workout:${caseId}:${nonce}:set`;
  if (caseId === "workout.complete-commit") return `v12:workout:${caseId}:${nonce}:completion`;
  if (caseId === "workout.undo") return `undo:v12:workout:${caseId}:${nonce}:completion`;
  if (caseId === "workout.plan-increment") return `v12:workout-plan-increment:${nonce}`;
  if (["workout.add-exercise", "workout.replace-exercise", "workout.delete-exercise", "workout.reorder"].includes(caseId)) {
    return `v12:workout:${caseId}:${nonce}:action`;
  }
  if (caseId === "workout.outcomes") return `v12:workout-finish-partial:${nonce}`;
  if (caseId === "workout.offline-recovery") return `v12:logical-backup:${nonce}`;
  if (caseId === "library.owned-lifecycle") return `v12:owned-plan-archive:${nonce}`;
  if (caseId === "library.plan-editor") return `v12:owned-plan-save:${nonce}`;
  if (caseId === "library.starter-detail") return `v12:starter-editable-copy:${nonce}`;
  if (caseId === "library.starter-activation") return `v12:starter-activation:${nonce}`;
  if (caseId === "library.template-update") return `v12:starter-template-update-copy:${nonce}`;
  if (["library.true-no-plans", "library.create-strength"].includes(caseId)) {
    return `v12:owned-plan-create:${caseId}:${nonce}`;
  }
  if (caseId === "library.schedule-editor") return `schedule-command:v12:schedule-editor:${nonce}`;
  if (caseId === "library.replacement-impact") return `plan-impact-command:v12:replacement-impact:${nonce}`;
  if (caseId === "library.day-removal-impact") return `plan-impact-command:v12:day-removal-impact:${nonce}`;
  if (caseId === "library.running-conflict") return `v12:collision:${nonce}:confirm`;
  if (caseId.startsWith("library.running-")) return `v12:running:${caseId}:${nonce}:action`;
  if (caseId.startsWith("library.")) return `v12:custom-exercise:${caseId}:${nonce}:action`;
  return `v12:${caseId}:${nonce}:action`;
}

async function readExactProjection(
  reader: Pick<V12NativeAcceptanceAuthorityReader, "operationId" | "caseId" | "operationKind" | "authorityTables" | "queries">,
  input: Readonly<{
    query: SqliteReadTransactionExecutor;
    request: V12NativeAcceptanceAuthorityReaderRequest;
    sha256(value: string): Promise<string>;
  }>,
): Promise<V12NativeAcceptanceAuthorityProof> {
  if (input.request.caseId !== reader.caseId) throw new Error("v12_native_acceptance_authority_reader_request_invalid");
  const scope = authorityScope(input.request);
  const projections: unknown[] = [];
  let projectionRowCount = 0;
  for (const declaration of reader.queries) {
    const parameters = declaration.parameterKeys.map((key) => scope[key]);
    const rows = await input.query.queryAll<Record<string, unknown>>(declaration.sql, parameters);
    if (rows.length > MAX_PROJECTION_ROWS) throw new Error("v12_native_acceptance_authority_reader_unbounded");
    projectionRowCount += rows.length;
    projections.push(Object.freeze([...rows]));
  }
  if (projectionRowCount === 0) throw new Error("v12_native_acceptance_authority_reader_postcondition_missing");
  const projectionSha256 = await input.sha256(stableJson(Object.freeze({ operationId: reader.operationId, projections })));
  if (!HASH.test(projectionSha256)) throw new Error("v12_native_acceptance_authority_reader_hash_invalid");
  return Object.freeze({
    schemaVersion: 1,
    operationId: reader.operationId,
    caseId: reader.caseId,
    operationKind: reader.operationKind,
    authorityTables: reader.authorityTables,
    projectionRowCount,
    projectionSha256,
  });
}

const workoutPlan = ["workoutPlanId"] as const;
const nonceLike = ["nonceLike"] as const;
const runningPlan = ["runningPlanId"] as const;
const ownedReadPlan = ["ownedReadPlanId"] as const;
const preferenceKey = ["workoutPreferenceKey"] as const;
const action = ["actionIdentity"] as const;

/**
 * One literal SQL declaration per canonical source-owned operation.  The SQL
 * never accepts a table or column identifier from a caller; only nonce-bound
 * values are supplied at execution time.  Result rows stay inside this module
 * and are reduced to a digest before crossing the acceptance boundary.
 */
const READER_SPECS: readonly ReaderSpec[] = Object.freeze([
  { shard: "workout", caseId: "workout.root-identity", sql: "SELECT id, origin, is_active, revision, plan_kind FROM plans WHERE id = ? AND origin = 'copied' AND plan_kind = 'strength' LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.day-switch", sql: "SELECT id, ordinal, revision FROM plan_days WHERE plan_id = ? ORDER BY ordinal, id LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.scheduled-rest-empty", sql: "SELECT ? AS plan_id WHERE NOT EXISTS (SELECT 1 FROM workout_sessions WHERE plan_id = ? AND local_date = '2027-01-16') LIMIT 8", parameterKeys: ["workoutPlanId", "workoutPlanId"] },
  { shard: "workout", caseId: "workout.start-alternate", sql: "SELECT id, plan_id, source, status, local_date, revision FROM workout_sessions WHERE plan_id = ? AND source = 'alternate_day' ORDER BY started_at_ms DESC LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.start-resume", sql: "SELECT id, status, active_session_exercise_id, active_set_id, revision FROM workout_sessions WHERE plan_id = ? AND status = 'in_progress' ORDER BY started_at_ms DESC LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.context-running", sql: "SELECT plan.id, plan.origin, plan.is_active, plan.revision, plan.plan_kind, running.status, running.revision AS running_revision, receipt.request_id, receipt.operation, receipt.result_json FROM plans plan JOIN running_plans running ON running.plan_id = plan.id JOIN running_plan_receipts receipt ON receipt.plan_id = plan.id WHERE plan.id = ? AND plan.plan_kind = 'running' AND receipt.operation = 'create' LIMIT 8", parameterKeys: runningPlan },
  { shard: "workout", caseId: "workout.active-layout", sql: "SELECT id, status, active_session_exercise_id, active_set_id, revision FROM workout_sessions WHERE plan_id = ? AND status = 'in_progress' LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.active-back", sql: "SELECT id, status, revision FROM workout_sessions WHERE plan_id = ? AND status = 'in_progress' LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.exercise-disclosure", sql: "SELECT exercise.id, exercise.exercise_id, exercise.ordinal, exercise.status, exercise.revision FROM session_exercises exercise JOIN workout_sessions session ON session.id = exercise.session_id WHERE session.plan_id = ? ORDER BY exercise.ordinal, exercise.id LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.active-indicator", sql: "SELECT id, active_session_exercise_id, active_set_id, revision FROM workout_sessions WHERE plan_id = ? AND status = 'in_progress' LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.set-states", sql: "SELECT set_row.id, set_row.set_kind, set_row.ordinal, set_row.metric_profile, set_row.status, set_row.revision FROM session_sets set_row JOIN session_exercises exercise ON exercise.id = set_row.session_exercise_id JOIN workout_sessions session ON session.id = exercise.session_id WHERE session.plan_id = ? ORDER BY exercise.ordinal, set_row.ordinal LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.row-edit", sql: "SELECT set_row.id, set_row.status, set_row.observed_json, set_row.revision FROM session_sets set_row JOIN session_exercises exercise ON exercise.id = set_row.session_exercise_id JOIN workout_sessions session ON session.id = exercise.session_id WHERE session.plan_id = ? AND set_row.observed_json IS NOT NULL ORDER BY set_row.revision DESC LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.load-reps-editor", sql: "SELECT set_row.id, set_row.metric_profile, set_row.observed_json, set_row.status, set_row.revision FROM session_sets set_row JOIN session_exercises exercise ON exercise.id = set_row.session_exercise_id JOIN workout_sessions session ON session.id = exercise.session_id WHERE session.plan_id = ? AND set_row.metric_profile = 'load_reps' AND set_row.observed_json IS NOT NULL LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.duration-editor", sql: "SELECT set_row.id, set_row.metric_profile, set_row.metric_contract_version, set_row.exercise_metric_generation, set_row.observed_json, set_row.status, set_row.revision FROM session_sets set_row JOIN session_exercises exercise ON exercise.id = set_row.session_exercise_id JOIN workout_sessions session ON session.id = exercise.session_id WHERE exercise.exercise_id = ? AND session.plan_id = ? AND set_row.metric_profile = 'timed_hold' AND json_extract(set_row.observed_json, '$.durationSeconds') = 45 LIMIT 8", parameterKeys: ["metricDraftExerciseId", "workoutPlanId"] },
  { shard: "workout", caseId: "workout.all-metrics", sql: "SELECT set_row.id, set_row.metric_profile, set_row.metric_contract_version, set_row.exercise_metric_generation, set_row.observed_json, set_row.status, set_row.revision FROM session_sets set_row JOIN session_exercises exercise ON exercise.id = set_row.session_exercise_id JOIN workout_sessions session ON session.id = exercise.session_id WHERE exercise.exercise_id = ? AND session.plan_id = ? AND set_row.metric_profile = 'fixed_time' AND json_extract(set_row.observed_json, '$.durationMs') = 720000 AND json_extract(set_row.observed_json, '$.distanceMeters') = 2400 LIMIT 8", parameterKeys: ["metricDraftExerciseId", "workoutPlanId"] },
  { shard: "workout", caseId: "workout.warmup-order", sql: "SELECT set_row.id, set_row.set_kind, set_row.ordinal, set_row.revision FROM session_sets set_row JOIN session_exercises exercise ON exercise.id = set_row.session_exercise_id JOIN workout_sessions session ON session.id = exercise.session_id WHERE session.plan_id = ? ORDER BY exercise.ordinal, CASE set_row.set_kind WHEN 'warmup' THEN 0 ELSE 1 END, set_row.ordinal LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.add-set", sql: "SELECT id, session_exercise_id, set_kind, ordinal, revision FROM session_sets WHERE id = ? AND set_kind = 'working' LIMIT 8", parameterKeys: action },
  { shard: "workout", caseId: "workout.complete-commit", sql: "SELECT id, status, completion_idempotency_key, revision FROM session_sets WHERE completion_idempotency_key = ? AND status = 'completed' LIMIT 8", parameterKeys: action },
  { shard: "workout", caseId: "workout.complete-failure", sql: "SELECT set_row.id, set_row.status, set_row.revision FROM session_sets set_row JOIN session_exercises exercise ON exercise.id = set_row.session_exercise_id JOIN workout_sessions session ON session.id = exercise.session_id WHERE session.plan_id = ? AND set_row.status IN ('planned', 'draft') ORDER BY set_row.id LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.completion-collapse", sql: "SELECT session.id, session.status, session.revision, set_row.id AS set_id, set_row.status AS set_status FROM workout_sessions session JOIN session_exercises exercise ON exercise.session_id = session.id JOIN session_sets set_row ON set_row.session_exercise_id = exercise.id WHERE session.plan_id = ? ORDER BY exercise.ordinal, set_row.ordinal LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.rest-dock", sql: "SELECT rest.session_id, rest.status, rest.remaining_ms, rest.next_set_id, rest.revision FROM session_rest_states rest JOIN workout_sessions session ON session.id = rest.session_id WHERE session.plan_id = ? LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.rest-controls", sql: "SELECT rest.session_id, rest.status, rest.remaining_ms, rest.next_set_id, rest.revision FROM session_rest_states rest JOIN workout_sessions session ON session.id = rest.session_id WHERE session.plan_id = ? AND rest.status = 'paused' LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.rest-recovery", sql: "SELECT rest.session_id, rest.status, rest.started_at_ms, rest.remaining_ms, rest.revision FROM session_rest_states rest JOIN workout_sessions session ON session.id = rest.session_id WHERE session.plan_id = ? AND rest.status = 'running' LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.trend", sql: "SELECT aggregate.subject_id, aggregate.exercise_id, aggregate.identity_key, aggregate.comparator_key, aggregate.reference_target_json, aggregate.aggregate_json, subject.revision, subject.updated_at_ms FROM history_projection_metric_aggregates aggregate JOIN history_subject_revisions subject ON subject.subject_id = aggregate.subject_id WHERE aggregate.subject_id = ? AND subject.updated_at_ms = ? LIMIT 8", parameterKeys: ["historySubjectId", "historySubjectUpdatedAt"] },
  { shard: "workout", caseId: "workout.exercise-menu", sql: "SELECT exercise.id, exercise.exercise_id, exercise.ordinal, exercise.status, exercise.revision FROM session_exercises exercise JOIN workout_sessions session ON session.id = exercise.session_id WHERE session.plan_id = ? AND exercise.status IN ('active', 'planned') ORDER BY exercise.ordinal LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.timing-flat", sql: "SELECT set_row.id, set_row.advanced_timing_resolved_json, set_row.status, set_row.revision FROM session_sets set_row JOIN session_exercises exercise ON exercise.id = set_row.session_exercise_id JOIN workout_sessions session ON session.id = exercise.session_id WHERE session.plan_id = ? ORDER BY exercise.ordinal, set_row.ordinal LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.plan-increment", sql: "SELECT request_id, recommendation_id, decision, result_json, committed_at_ms FROM progression_recommendation_decision_receipts WHERE request_id = ? LIMIT 8", parameterKeys: action },
  { shard: "workout", caseId: "workout.plan-after-workout", sql: "SELECT plan.id, plan.origin, plan.revision, state.lifecycle, state.graph_status, state.missing_requirement_code FROM plans plan JOIN owned_plan_aggregate_states state ON state.plan_id = plan.id WHERE plan.id = ? LIMIT 8", parameterKeys: ownedReadPlan },
  { shard: "workout", caseId: "workout.add-exercise", sql: "SELECT request_id, operation, session_id, subject_session_exercise_id, replacement_session_exercise_id, result_session_revision, result_json FROM workout_session_exercise_edit_receipts WHERE request_id = ? AND operation = 'add_exercise' LIMIT 8", parameterKeys: action },
  { shard: "workout", caseId: "workout.replace-exercise", sql: "SELECT request_id, operation, session_id, subject_session_exercise_id, replacement_session_exercise_id, result_session_revision, result_json FROM workout_session_exercise_edit_receipts WHERE request_id = ? AND operation = 'replace_exercise' LIMIT 8", parameterKeys: action },
  { shard: "workout", caseId: "workout.delete-exercise", sql: "SELECT request_id, operation, session_id, subject_session_exercise_id, result_session_revision, result_json FROM workout_session_exercise_edit_receipts WHERE request_id = ? AND operation = 'remove_exercise' LIMIT 8", parameterKeys: action },
  { shard: "workout", caseId: "workout.reorder", sql: "SELECT request_id, operation, session_id, ordered_session_exercise_ids_json, result_session_revision, result_json FROM workout_session_exercise_reorder_receipts WHERE request_id = ? AND operation = 'reorder_exercises' LIMIT 8", parameterKeys: action },
  { shard: "workout", caseId: "workout.undo", sql: "SELECT id, session_id, completed_set_id, idempotency_key, snapshot_version, consumed_at_ms FROM session_undo_snapshots WHERE idempotency_key = ? AND consumed_at_ms IS NOT NULL LIMIT 8", parameterKeys: action },
  { shard: "workout", caseId: "workout.outcomes", sql: "SELECT id, workout_session_id, request_sha256, committed_at_ms FROM workout_receipts WHERE id = ? LIMIT 8", parameterKeys: action },
  { shard: "workout", caseId: "workout.completion-review", sql: "SELECT session.id, session.status, session.completed_at_ms, session.revision, provenance.plan_id, provenance.plan_day_id, provenance.source_revision FROM workout_sessions session LEFT JOIN workout_provenance provenance ON provenance.workout_session_id = session.id WHERE session.plan_id = ? LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.completion-writeback", sql: "SELECT mutation.request_id, mutation.request_sha256, mutation.operation, mutation.result_plan_id, mutation.result_revision, mutation.committed_at_ms, activation.request_id AS activation_request_id, activation.result_plan_id AS activation_plan_id, plan.revision AS plan_revision, day.id AS plan_day_id, occurrence.id AS occurrence_id, occurrence.exercise_id, occurrence.ordinal AS occurrence_ordinal, occurrence.revision AS occurrence_revision, target.id AS target_id, target.plan_day_exercise_id, target.ordinal AS target_ordinal, target.revision AS target_revision FROM starter_plan_activation_requests activation JOIN owned_plan_mutation_requests mutation ON mutation.result_plan_id = activation.result_plan_id JOIN plans plan ON plan.id = mutation.result_plan_id JOIN plan_days day ON day.plan_id = plan.id AND day.ordinal = 0 JOIN owned_plan_day_exercises occurrence ON occurrence.plan_day_id = day.id AND occurrence.exercise_id = ? JOIN owned_plan_working_set_targets target ON target.plan_day_exercise_id = occurrence.id WHERE activation.request_id = ? AND mutation.operation = 'save' AND json_extract(mutation.result_json, '$.operation') = 'session_exercise_edits' AND mutation.result_revision = plan.revision LIMIT 8", parameterKeys: ["completionWritebackExerciseId", "completionActivationRequestId"] },
  { shard: "workout", caseId: "workout.readonly-presentation", sql: "SELECT id, status, active_session_exercise_id, active_set_id, revision FROM workout_sessions WHERE plan_id = ? AND status = 'in_progress' LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.timing-policy", sql: "SELECT key, value_version, value_json, revision FROM app_settings WHERE key = ? LIMIT 8", parameterKeys: preferenceKey },
  { shard: "workout", caseId: "workout.accessibility", sql: "SELECT id, status, active_session_exercise_id, active_set_id, revision FROM workout_sessions WHERE plan_id = ? AND status = 'in_progress' LIMIT 8", parameterKeys: workoutPlan },
  { shard: "workout", caseId: "workout.appearance", sql: "SELECT key, value_version, value_json, revision FROM app_settings WHERE key = ? LIMIT 8", parameterKeys: preferenceKey },
  { shard: "workout", caseId: "workout.offline-recovery", sql: "SELECT request_id, request_sha256, snapshot_id, snapshot_sha256, total_rows, committed_at_ms FROM logical_backup_receipts WHERE request_id = ? LIMIT 8", parameterKeys: action },
  { shard: "workout", caseId: "workout.performance", sql: "SELECT id, status, active_session_exercise_id, active_set_id, revision FROM workout_sessions WHERE plan_id = ? AND status = 'in_progress' LIMIT 8", parameterKeys: workoutPlan },

  { shard: "library-running", caseId: "library.remembered-state", sql: "SELECT key, value_version, value_json, revision FROM app_settings WHERE key = 'library.section' LIMIT 8", parameterKeys: [] },
  { shard: "library-running", caseId: "library.plan-groups", sql: "SELECT id, origin, name, is_active, revision, plan_kind FROM plans WHERE id = ? AND origin = 'custom' LIMIT 8", parameterKeys: ownedReadPlan },
  { shard: "library-running", caseId: "library.exercise-search", sql: "SELECT id, exercise_id, kind, ordinal, display_text, normalized_text FROM exercise_search_terms WHERE normalized_text LIKE '%press%' ORDER BY exercise_id, ordinal LIMIT 8", parameterKeys: [] },
  { shard: "library-running", caseId: "library.exercise-favorites", sql: "SELECT request_id, mutation_kind, result_json, committed_at_ms FROM custom_exercise_mutation_receipts WHERE request_id = ? AND mutation_kind = 'favorite' LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.actions-sheet", sql: "SELECT plan.id, plan.origin, plan.revision, term.kind, term.slug FROM plans plan CROSS JOIN taxonomy_terms term WHERE plan.id = ? AND term.kind IN ('exercise_type', 'muscle', 'equipment') ORDER BY term.kind, term.slug LIMIT 8", parameterKeys: ownedReadPlan },
  { shard: "library-running", caseId: "library.neutral-plan-chooser", sql: "SELECT ? AS absent_plan_id WHERE NOT EXISTS (SELECT 1 FROM plans WHERE id = ?) LIMIT 8", parameterKeys: ["nonceLike", "nonceLike"] },
  { shard: "library-running", caseId: "library.true-no-plans", sql: "SELECT request_id, operation, result_plan_id, result_revision, result_json FROM owned_plan_mutation_requests WHERE request_id = ? AND operation = 'create' LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.owned-summary", sql: "SELECT plan.id, plan.origin, plan.name, plan.is_active, plan.revision, plan.plan_kind, state.lifecycle, state.graph_status FROM plans plan JOIN owned_plan_aggregate_states state ON state.plan_id = plan.id WHERE plan.id = ? LIMIT 8", parameterKeys: ownedReadPlan },
  { shard: "library-running", caseId: "library.owned-lifecycle", sql: "SELECT request_id, operation, result_plan_id, result_revision, result_json FROM owned_plan_mutation_requests WHERE request_id = ? AND operation = 'archive' LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.starter-detail", sql: "SELECT request_id, operation, source_plan_id, result_plan_id, result_revision, result_json FROM owned_plan_mutation_requests WHERE request_id = ? AND operation = 'create' LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.starter-activation", sql: "SELECT request_id, request_sha256, template_id, source_revision, choice, result_plan_id, result_schedule_id, result_json FROM starter_plan_activation_requests WHERE request_id = ? LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.template-update", sql: "SELECT request_id, operation, source_plan_id, result_plan_id, result_revision, result_json FROM owned_plan_mutation_requests WHERE request_id = ? AND operation = 'duplicate' LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.create-strength", sql: "SELECT request_id, operation, result_plan_id, result_revision, result_json FROM owned_plan_mutation_requests WHERE request_id = ? AND operation = 'create' LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.plan-editor", sql: "SELECT request_id, operation, result_plan_id, result_revision, result_json FROM owned_plan_mutation_requests WHERE request_id = ? AND operation = 'save' LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.editor-draft-guards", sql: "SELECT plan.id, plan.name, plan.revision, state.lifecycle, state.graph_status FROM plans plan JOIN owned_plan_aggregate_states state ON state.plan_id = plan.id WHERE plan.id = ? LIMIT 8", parameterKeys: ownedReadPlan },
  { shard: "library-running", caseId: "library.schedule-editor", sql: "SELECT id, schedule_id, event_type, local_date, payload_json, schedule_revision, created_at_ms FROM owned_plan_schedule_events WHERE id = ? AND event_type = 'schedule_version_saved' LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.replacement-impact", sql: "SELECT id, schedule_id, event_type, local_date, payload_json, schedule_revision, created_at_ms FROM owned_plan_schedule_events WHERE id = ? AND event_type = 'plan_exercise_replaced' LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.day-removal-impact", sql: "SELECT id, schedule_id, event_type, local_date, payload_json, schedule_revision, created_at_ms FROM owned_plan_schedule_events WHERE id = ? AND event_type = 'plan_day_removed' LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.builtin-exercise", sql: "SELECT library.exercise_id, library.origin, library.canonical_name, library.exercise_type, library.metric_profile, library.revision AS library_revision, instruction.source_namespace, instruction.source_revision, instruction.upstream_id, instruction.source_license, instruction.source_attribution, instruction.steps_json, instruction.revision AS instruction_revision FROM exercise_library_entries library JOIN exercise_instruction_sets instruction ON instruction.exercise_id = library.exercise_id WHERE library.exercise_id = ? AND library.origin = 'bundled' AND library.availability = 'available' LIMIT 8", parameterKeys: ["bundledInstructionExerciseId"] },
  { shard: "library-running", caseId: "library.custom-exercise", sql: "SELECT request_id, mutation_kind, result_json, committed_at_ms FROM custom_exercise_mutation_receipts WHERE request_id = ? AND mutation_kind = 'archive' LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.create-exercise", sql: "SELECT request_id, mutation_kind, result_json, committed_at_ms FROM custom_exercise_mutation_receipts WHERE request_id = ? AND mutation_kind = 'create' LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.copy-metric-migration", sql: "SELECT idempotency_key, exercise_id, from_metric_profile, to_metric_profile, to_exercise_metric_generation, exercise_revision, result_json FROM metric_profile_migration_events WHERE idempotency_key = ? LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.load-error-recovery", sql: "SELECT id, origin, name, is_active, revision, plan_kind FROM plans WHERE id = ? LIMIT 8", parameterKeys: ownedReadPlan },
  { shard: "library-running", caseId: "library.running-detail", sql: "SELECT plan.id, plan.origin, plan.revision, plan.plan_kind, running.status, running.revision AS running_revision FROM plans plan JOIN running_plans running ON running.plan_id = plan.id WHERE plan.id = ? LIMIT 8", parameterKeys: runningPlan },
  { shard: "library-running", caseId: "library.running-create-zero-sessions", sql: "SELECT receipt.request_id, receipt.operation, receipt.plan_id, receipt.result_json, running.status, running.revision FROM running_plan_receipts receipt JOIN running_plans running ON running.plan_id = receipt.plan_id WHERE receipt.request_id = ? AND receipt.operation = 'create' AND NOT EXISTS (SELECT 1 FROM running_session_revisions revision WHERE revision.plan_id = receipt.plan_id) LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.running-goal-edit", sql: "SELECT request_id, operation, plan_id, expected_plan_revision, result_json, committed_at_ms FROM running_plan_receipts WHERE request_id = ? AND operation = 'edit' LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.running-session-common", sql: "SELECT receipt.request_id, receipt.operation, revision.session_kind, revision.revision, revision.definition_json FROM running_plan_receipts receipt JOIN running_session_revisions revision ON revision.plan_id = receipt.plan_id WHERE receipt.request_id = ? AND revision.session_kind = 'recovery' ORDER BY revision.revision DESC LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.running-recovery", sql: "SELECT receipt.request_id, receipt.operation, revision.session_kind, revision.revision, revision.definition_json FROM running_plan_receipts receipt JOIN running_session_revisions revision ON revision.plan_id = receipt.plan_id WHERE receipt.request_id = ? AND revision.session_kind = 'recovery' ORDER BY revision.revision DESC LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.running-long", sql: "SELECT receipt.request_id, receipt.operation, revision.session_kind, revision.revision, revision.definition_json FROM running_plan_receipts receipt JOIN running_session_revisions revision ON revision.plan_id = receipt.plan_id WHERE receipt.request_id = ? AND revision.session_kind = 'long_run' ORDER BY revision.revision DESC LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.running-progression", sql: "SELECT receipt.request_id, receipt.operation, revision.session_kind, revision.revision, revision.definition_json FROM running_plan_receipts receipt JOIN running_session_revisions revision ON revision.plan_id = receipt.plan_id WHERE receipt.request_id = ? AND revision.session_kind = 'progression' ORDER BY revision.revision DESC LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.running-tempo", sql: "SELECT receipt.request_id, receipt.operation, revision.session_kind, revision.revision, revision.definition_json FROM running_plan_receipts receipt JOIN running_session_revisions revision ON revision.plan_id = receipt.plan_id WHERE receipt.request_id = ? AND revision.session_kind = 'tempo' ORDER BY revision.revision DESC LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.running-intervals", sql: "SELECT receipt.request_id, receipt.operation, revision.session_kind, revision.revision, revision.definition_json FROM running_plan_receipts receipt JOIN running_session_revisions revision ON revision.plan_id = receipt.plan_id WHERE receipt.request_id = ? AND revision.session_kind = 'intervals' ORDER BY revision.revision DESC LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.running-hills", sql: "SELECT receipt.request_id, receipt.operation, revision.session_kind, revision.revision, revision.definition_json FROM running_plan_receipts receipt JOIN running_session_revisions revision ON revision.plan_id = receipt.plan_id WHERE receipt.request_id = ? AND revision.session_kind = 'hills' ORDER BY revision.revision DESC LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.running-fartlek", sql: "SELECT receipt.request_id, receipt.operation, revision.session_kind, revision.revision, revision.definition_json FROM running_plan_receipts receipt JOIN running_session_revisions revision ON revision.plan_id = receipt.plan_id WHERE receipt.request_id = ? AND revision.session_kind = 'fartlek' ORDER BY revision.revision DESC LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.running-session-lifecycle", sql: "SELECT request_id, operation, plan_id, expected_plan_revision, result_json, committed_at_ms FROM running_plan_receipts WHERE request_id = ? AND operation = 'archive' LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.running-conflict", sql: "SELECT receipt.request_id, receipt.outcome_id, receipt.result_json, projection.selected_kind, projection.selected_opportunity_id, projection.effective_local_date, projection.moved_local_date, projection.acknowledged FROM schedule_collision_receipts receipt JOIN schedule_collision_projections projection ON projection.outcome_id = receipt.outcome_id WHERE receipt.request_id = ? LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.running-create-typed-sessions", sql: "SELECT receipt.request_id, receipt.operation, revision.session_kind, revision.revision, revision.definition_json FROM running_plan_receipts receipt JOIN running_session_revisions revision ON revision.plan_id = receipt.plan_id WHERE receipt.request_id = ? ORDER BY revision.session_kind, revision.revision DESC LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.running-two-same-day-slots", sql: "SELECT receipt.request_id, receipt.operation, slot.id, slot.weekday, slot.ordinal, slot.session_revision_id, slot.revision FROM running_plan_receipts receipt JOIN running_session_slots slot ON slot.plan_id = receipt.plan_id WHERE receipt.request_id = ? AND slot.weekday = 'Monday' ORDER BY slot.ordinal LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.accessibility-recovery", sql: "SELECT plan.id, plan.origin, plan.revision, entry.exercise_id, entry.origin AS exercise_origin, term.kind, term.slug FROM plans plan CROSS JOIN exercise_library_entries entry CROSS JOIN taxonomy_terms term WHERE plan.id = ? AND entry.origin = 'bundled' AND term.kind = 'exercise_type' ORDER BY entry.exercise_id, term.slug LIMIT 8", parameterKeys: ownedReadPlan },
  { shard: "library-running", caseId: "library.custom-exercise-edit", sql: "SELECT request_id, mutation_kind, result_json, committed_at_ms FROM custom_exercise_mutation_receipts WHERE request_id = ? AND mutation_kind = 'edit' LIMIT 8", parameterKeys: action },
  { shard: "library-running", caseId: "library.custom-exercise-hide", sql: "SELECT receipt.request_id, receipt.mutation_kind, receipt.result_json, preference.exercise_id, preference.hidden, preference.revision FROM custom_exercise_mutation_receipts receipt JOIN exercise_owner_preferences preference ON preference.exercise_id = ? WHERE receipt.request_id = ? AND receipt.mutation_kind = 'hidden' AND preference.hidden = 1 LIMIT 8", parameterKeys: ["customExerciseId", "actionIdentity"] },
  { shard: "library-running", caseId: "library.custom-exercise-unhide", sql: "SELECT receipt.request_id, receipt.mutation_kind, receipt.result_json, preference.exercise_id, preference.hidden, preference.revision FROM custom_exercise_mutation_receipts receipt JOIN exercise_owner_preferences preference ON preference.exercise_id = ? WHERE receipt.request_id = ? AND receipt.mutation_kind = 'hidden' AND preference.hidden = 0 LIMIT 8", parameterKeys: ["customExerciseId", "actionIdentity"] },
  { shard: "library-running", caseId: "library.custom-exercise-copy-bundled", sql: "SELECT receipt.request_id, receipt.mutation_kind, receipt.result_json, exercise.id, exercise.origin, exercise.revision FROM custom_exercise_mutation_receipts receipt JOIN exercises exercise ON exercise.id = ? WHERE receipt.request_id = ? AND receipt.mutation_kind = 'copy' AND exercise.origin = 'custom' LIMIT 8", parameterKeys: ["copiedCustomExerciseId", "actionIdentity"] },
  { shard: "library-running", caseId: "library.custom-exercise-archive", sql: "SELECT receipt.request_id, receipt.mutation_kind, receipt.result_json, preference.exercise_id, preference.archived, preference.revision FROM custom_exercise_mutation_receipts receipt JOIN exercise_owner_preferences preference ON preference.exercise_id = ? WHERE receipt.request_id = ? AND receipt.mutation_kind = 'archive' AND preference.archived = 1 LIMIT 8", parameterKeys: ["customExerciseId", "actionIdentity"] },
  { shard: "library-running", caseId: "library.custom-exercise-reactivate", sql: "SELECT receipt.request_id, receipt.mutation_kind, receipt.result_json, preference.exercise_id, preference.archived, preference.revision FROM custom_exercise_mutation_receipts receipt JOIN exercise_owner_preferences preference ON preference.exercise_id = ? WHERE receipt.request_id = ? AND receipt.mutation_kind = 'archive' AND preference.archived = 0 LIMIT 8", parameterKeys: ["customExerciseId", "actionIdentity"] },
  { shard: "library-running", caseId: "library.metric-profile-migration", sql: "SELECT event.idempotency_key, event.exercise_id, event.to_metric_profile, event.to_exercise_metric_generation, event.exercise_revision, event.result_json, exercise.metric_profile, exercise.exercise_metric_generation, exercise.revision FROM metric_profile_migration_events event JOIN exercises exercise ON exercise.id = ? WHERE event.idempotency_key = ? AND event.exercise_id = exercise.id LIMIT 8", parameterKeys: ["metricExerciseId", "actionIdentity"] },
]);

function createReader(spec: ReaderSpec): readonly [string, V12NativeAcceptanceAuthorityReader] {
  const contract = v12NativeAcceptanceCaseContract(spec.shard, spec.caseId);
  const query = Object.freeze({ sql: spec.sql, parameterKeys: Object.freeze([...spec.parameterKeys]) });
  const base = Object.freeze({
    operationId: contract.operation.id,
    caseId: contract.caseId,
    operationKind: contract.operation.kind,
    authorityTables: Object.freeze([...contract.probes.post.tables]),
    queries: Object.freeze([query]),
    allowZeroRows: false as const,
  });
  const reader: V12NativeAcceptanceAuthorityReader = Object.freeze({
    ...base,
    read: (input) => readExactProjection(base, input),
  });
  return [contract.operation.id, reader] as const;
}

export const V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY: Readonly<Record<string, V12NativeAcceptanceAuthorityReader>> = Object.freeze(
  Object.fromEntries(READER_SPECS.map(createReader)),
);

export function assertV12NativeAcceptanceAuthorityReaderRegistry(
  contracts: readonly V12NativeAcceptanceCaseContract[] = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.filter(({ shard }) => shard !== "multi-plan"),
  registry: Readonly<Record<string, V12NativeAcceptanceAuthorityReader>> = V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY,
): true {
  const entries = Object.entries(registry);
  if (contracts.length !== 88 || entries.length !== 88) throw new Error("v12_native_acceptance_authority_reader_count_invalid");
  const declaredCaseIds = READER_SPECS.map(({ caseId }) => caseId);
  if (contracts.some((contract, index) => contract.caseId !== declaredCaseIds[index])) {
    throw new Error("v12_native_acceptance_authority_reader_order_invalid");
  }
  const callableReaders = new Set<unknown>();
  for (const [index, contract] of contracts.entries()) {
    const [operationId, reader] = entries[index] ?? [];
    if (operationId !== contract.operation.id || reader === undefined || reader.operationId !== contract.operation.id
      || reader.caseId !== contract.caseId || reader.operationKind !== contract.operation.kind) {
      throw new Error("v12_native_acceptance_authority_reader_unresolved");
    }
    if (stableJson(reader.authorityTables) !== stableJson(contract.probes.post.tables)) {
      throw new Error("v12_native_acceptance_authority_reader_projection_invalid");
    }
    if (callableReaders.has(reader.read)) throw new Error("v12_native_acceptance_authority_reader_collapsed");
    callableReaders.add(reader.read);
    if (reader.allowZeroRows !== false && contract.operation.kind === "repository-mutation") {
      throw new Error("v12_native_acceptance_authority_reader_zero_row_invalid");
    }
    if (reader.queries.length !== 1) throw new Error("v12_native_acceptance_authority_reader_query_invalid");
    for (const query of reader.queries) {
      const normalized = query.sql.replace(/\s+/gu, " ").trim();
      const placeholders = normalized.match(/\?/gu)?.length ?? 0;
      if (!/^SELECT\b/iu.test(normalized) || /\bCOUNT\s*\(\s*\*\s*\)/iu.test(normalized)
        || /\bSELECT\s+\*/iu.test(normalized) || /;|--|\/\*/u.test(normalized)
        || !/\bLIMIT\s+8$/iu.test(normalized) || placeholders !== query.parameterKeys.length
        || normalized === "SELECT 1 LIMIT 8") {
        throw new Error("v12_native_acceptance_authority_reader_query_invalid");
      }
      if (/\bapp_settings\b/iu.test(normalized)
        && !["workout.timing-policy", "workout.appearance", "library.remembered-state"].includes(contract.caseId)) {
        throw new Error("v12_native_acceptance_authority_reader_query_invalid");
      }
      if (contract.operation.kind === "repository-mutation" && /\bLIKE\s+\?/iu.test(normalized)) {
        throw new Error("v12_native_acceptance_authority_reader_query_invalid");
      }
    }
  }
  return true;
}

export function resolveV12NativeAcceptanceAuthorityReader(operationId: string): V12NativeAcceptanceAuthorityReader {
  const reader = V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY[operationId];
  if (reader === undefined) throw new Error("v12_native_acceptance_authority_reader_unresolved");
  return reader;
}

assertV12NativeAcceptanceAuthorityReaderRegistry();
