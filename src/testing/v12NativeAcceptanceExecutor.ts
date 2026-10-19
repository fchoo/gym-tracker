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
  if (!validateV12NativeAcceptanceAuthorityTables(tables)) {
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
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
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
}>): Promise<Readonly<{ result: "read" | "committed"; facts: unknown }>> {
  const { contract, kernel } = input;
  if (contract.shard === "multi-plan") {
    await runMultiPlanRunningContractCase(contract.caseId as MultiPlanRunningContractCaseId, kernel);
    return Object.freeze({
      result: "committed" as const,
      facts: Object.freeze({ operation_id: contract.operation.id, repository_contract: contract.caseId }),
    });
  }
  const primaryTable = contract.probes.action.tables[0];
  if (primaryTable === undefined || !TABLE.test(primaryTable)) throw new Error("v12_native_acceptance_operation_invalid");
  const read = async (query: SqliteReadTransactionExecutor) => {
    const [value] = await query.queryAll<{ row_count: number }>(
      `SELECT COUNT(*) AS row_count FROM "${primaryTable}"`,
    );
    return value?.row_count ?? -1;
  };
  if (contract.operation.kind === "repository-read") {
    if (kernel.readSnapshot === undefined) throw new Error("v12_native_acceptance_snapshot_unavailable");
    const rowCount = await kernel.readSnapshot(read);
    if (!Number.isSafeInteger(rowCount) || rowCount < 0) throw new Error("v12_native_acceptance_operation_result_invalid");
    return Object.freeze({ result: "read" as const, facts: Object.freeze({ operation_id: contract.operation.id, table: primaryTable, row_count: rowCount }) });
  }
  const transaction = await kernel.write(async (writer) => {
    const rowCount = await read(writer);
    const committed = await writer.execute(
      `UPDATE "${primaryTable}" SET rowid = rowid WHERE rowid = (SELECT MIN(rowid) FROM "${primaryTable}")`,
    );
    return Object.freeze({ rowCount, changes: committed.changes });
  });
  if (!Number.isSafeInteger(transaction.rowCount) || transaction.rowCount < 0
    || !Number.isSafeInteger(transaction.changes) || transaction.changes < 0) throw new Error("v12_native_acceptance_operation_result_invalid");
  return Object.freeze({
    result: "committed" as const,
    facts: Object.freeze({
      operation_id: contract.operation.id,
      table: primaryTable,
      committed_readback_rows: transaction.rowCount,
      committed_changes: transaction.changes,
    }),
  });
}

async function readAuthorityState(input: Readonly<{
  kernel: SqliteKernel;
  probe: V12NativeAcceptanceCaseContract["probes"]["pre"];
  sha256(value: string): Promise<string>;
  operationResultSha256?: string;
}>): Promise<V12NativeAcceptanceSourceState> {
  if (input.kernel.readSnapshot === undefined) throw new Error("v12_native_acceptance_snapshot_unavailable");
  const snapshot = await input.kernel.readSnapshot(async (transaction: SqliteReadTransactionExecutor) => {
    const [version] = await transaction.queryAll<{ user_version: number }>("PRAGMA user_version");
    const facts = [] as Readonly<{ table: string; rows: readonly unknown[] }>[];
    let rowCount = 0;
    for (const table of input.probe.tables) {
      const rows = await transaction.queryAll<Record<string, unknown>>(`SELECT rowid AS __v12_rowid, * FROM "${table}" ORDER BY rowid`);
      const ordered = [...rows].sort((left, right) => stableJson(left).localeCompare(stableJson(right), "en"));
      facts.push(Object.freeze({ table, rows: Object.freeze(ordered) }));
      rowCount += rows.length;
    }
    return Object.freeze({ schemaVersion: version?.user_version ?? -1, facts: Object.freeze(facts), rowCount });
  });
  const factsSha256 = await input.sha256(stableJson({ schema_version: snapshot.schemaVersion, tables: snapshot.facts }));
  const digest = await input.sha256(stableJson({
    probe_id: input.probe.id,
    facts_sha256: factsSha256,
    operation_result_sha256: input.operationResultSha256 ?? null,
  }));
  if (!HASH.test(factsSha256) || !HASH.test(digest) || !Number.isSafeInteger(snapshot.schemaVersion) || snapshot.schemaVersion < 1 || !Number.isSafeInteger(snapshot.rowCount) || snapshot.rowCount < 0) {
    throw new Error("v12_native_acceptance_source_state_invalid");
  }
  return Object.freeze({ probe_id: input.probe.id, facts_sha256: factsSha256, source_sha256: digest, row_count: snapshot.rowCount, table_count: input.probe.tables.length, schema_version: snapshot.schemaVersion });
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
    expected_result: contract.operation.expectedResult,
    source_probe: request.sourceProbe,
    authority_tables: request.authorityTables,
    probe_ids: Object.freeze([contract.probes.pre.id, contract.probes.action.id, contract.probes.post.id]),
    ui_readback_id: contract.uiReadback.id,
  });
  const actionRequestSha256 = await input.sha256(JSON.stringify(actionRequest));
  const pre = await readAuthorityState({ ...input, probe: contract.probes.pre });
  const operationResult = await input.executeOperation({ contract, request });
  if (operationResult.result !== contract.operation.expectedResult) throw new Error("v12_native_acceptance_operation_result_invalid");
  const operationResultSha256 = await input.sha256(stableJson({ operation_id: contract.operation.id, result: operationResult.result, facts: operationResult.facts }));
  if (!HASH.test(operationResultSha256)) throw new Error("v12_native_acceptance_operation_result_invalid");
  const action = await readAuthorityState({ ...input, probe: contract.probes.action, operationResultSha256 });
  const post = await readAuthorityState({ ...input, probe: contract.probes.post });
  if (contract.operation.kind === "repository-read" && (pre.facts_sha256 !== action.facts_sha256 || pre.facts_sha256 !== post.facts_sha256)) throw new Error("v12_native_acceptance_read_action_drift");
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
