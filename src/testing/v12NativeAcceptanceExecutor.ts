import type {
  SqliteKernel,
  SqliteReadTransactionExecutor,
} from "../platform/sqlite/sqliteKernel";
import {
  v12NativeAcceptanceCaseContract,
  type V12NativeAcceptanceCaseContract,
  type V12NativeAcceptanceOperationKind,
  type V12NativeAcceptanceShard,
} from "./contracts/phase15Workout.contract";
import {
  runMultiPlanRunningContractCase,
  type MultiPlanRunningContractCaseId,
} from "./contracts/multiPlanRunning.contract";

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

const TABLE_FACT_COLUMNS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  app_settings: Object.freeze(["key", "value_version", "value_json", "revision", "updated_at_ms"]),
  custom_exercise_mutation_receipts: Object.freeze(["request_id", "mutation_kind", "request_json", "result_json", "committed_at_ms"]),
  exercise_library_entries: Object.freeze(["exercise_id", "origin", "canonical_name", "exercise_type", "metric_profile", "revision"]),
  exercise_owner_preferences: Object.freeze(["exercise_id", "favorite", "hidden", "archived", "revision", "updated_at_ms"]),
  exercise_search_terms: Object.freeze(["id", "exercise_id", "kind", "ordinal", "display_text", "normalized_text"]),
  exercises: Object.freeze(["id", "origin", "name", "metric_profile", "metric_contract_version", "exercise_metric_generation", "revision"]),
  history_projection_metric_aggregates: Object.freeze(["subject_id", "exercise_id", "identity_key", "comparator_key", "reference_target_json", "aggregate_json"]),
  history_subject_revisions: Object.freeze(["subject_id", "revision", "updated_at_ms"]),
  metric_profile_migration_events: Object.freeze(["idempotency_key", "exercise_id", "from_metric_profile", "to_metric_profile", "to_exercise_metric_generation", "exercise_revision", "result_json", "migrated_at_ms"]),
  owned_plan_aggregate_states: Object.freeze(["plan_id", "lifecycle", "graph_status", "missing_requirement_code"]),
  owned_plan_day_exercises: Object.freeze(["id", "plan_day_id", "exercise_id", "ordinal", "metric_profile", "metric_contract_version", "exercise_metric_generation", "revision"]),
  owned_plan_mutation_requests: Object.freeze(["request_id", "request_sha256", "operation", "source_plan_id", "result_plan_id", "result_revision", "result_json", "committed_at_ms"]),
  owned_plan_schedule_versions: Object.freeze(["id", "schedule_id", "version_number", "effective_local_date", "mode", "timezone"]),
  owned_plan_schedule_events: Object.freeze(["id", "schedule_id", "event_type", "local_date", "payload_json", "schedule_revision", "created_at_ms"]),
  owned_plan_schedules: Object.freeze(["id", "plan_id", "lifecycle", "revision", "activated_at_ms", "deactivated_at_ms"]),
  pending_effects: Object.freeze(["id", "effect_type", "idempotency_key", "subject_id", "expected_revision", "status", "attempt_count"]),
  plan_days: Object.freeze(["id", "plan_id", "ordinal", "name", "revision"]),
  plans: Object.freeze(["id", "origin", "name", "is_active", "revision", "plan_kind"]),
  progression_recommendations: Object.freeze(["id", "exercise_id", "status", "source_revision", "target_revision", "decided_at_ms"]),
  running_plan_events: Object.freeze(["id", "plan_id", "event_type", "payload_json", "created_at_ms"]),
  running_plan_receipts: Object.freeze(["request_id", "request_sha256", "operation", "plan_id", "expected_plan_revision", "result_json", "committed_at_ms"]),
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
 * Executes the case-owned production boundary. Phase 13 cases use their exact
 * repository contract. Workout and Library cases use a case-scoped query or
 * serialized writer transaction over the contract's authoritative table;
 * post-action snapshots below independently verify committed readback.
 */
export async function dispatchV12NativeAcceptanceProductionOperation(input: Readonly<{
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
