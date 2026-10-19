import { createHash } from "node:crypto";
import { describe, expect, it } from "@jest/globals";

import type { SqliteKernel, SqliteReadTransactionExecutor, SqliteTransactionExecutor } from "../platform/sqlite/sqliteKernel";
import {
  assertV12NativeAcceptanceOperationRegistry,
  V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS,
  v12NativeAcceptanceCaseContract,
  type V12NativeAcceptanceCaseContract,
} from "./contracts/phase15Workout.contract";
import {
  authorityTablesForV12NativeAcceptance,
  assertV12NativeAcceptanceProductionHandlerRegistry,
  dispatchV12NativeAcceptanceProductionOperation,
  executeV12NativeAcceptanceReadAction,
  resolveV12NativeAcceptanceProductionHandler,
  validateV12NativeAcceptanceAuthorityTables,
  type V12NativeAcceptanceRequest,
} from "./v12NativeAcceptanceExecutor";

const sha256 = async (value: string): Promise<string> =>
  createHash("sha256").update(value).digest("hex");

function request(overrides: Partial<V12NativeAcceptanceRequest> = {}): V12NativeAcceptanceRequest {
  return {
    shard: "workout",
    caseId: "workout.root-identity",
    fixtureId: "v12-synthetic-fixtures-r18",
    title: "Workout",
    source: "PHASE15_REQUIRED_CASES",
    requirement: "WRK-01",
    action: "root-identity",
    readback: "Workout source contract observation",
    sourceProbe: "phase15-workout-ledger:workout.root-identity",
    authorityTables: ["plans", "owned_plan_schedules", "workout_sessions"],
    nonce: "a".repeat(48),
    ...overrides,
  };
}

function kernel(options: Readonly<{
  drift?: boolean;
  version?: number | null;
  commands?: string[];
  rowCount?: number;
  changes?: number;
  empty?: boolean;
  initialRevision?: number;
  snapshotValues?: readonly number[];
  values?: Readonly<Record<string, unknown>>;
}> = {}): SqliteKernel {
  let snapshot = 0;
  let mutationRevision = options.initialRevision ?? 1;
  const queryAll = async <Row,>(sql: string): Promise<readonly Row[]> => {
    options.commands?.push(sql);
    if (sql === "PRAGMA user_version") return (options.version === null ? [] : [{ user_version: options.version ?? 42 }]) as Row[];
    if (options.empty && /^SELECT /u.test(sql)) return [];
    if (/SELECT COUNT\(\*\) AS row_count/u.test(sql)) return [{ row_count: options.rowCount ?? 2 }] as Row[];
    const current = snapshot;
    const selected = /^SELECT ([\s\S]+?) FROM /u.exec(sql)?.[1]
      ?.split(",").map((column) => column.trim().replaceAll('"', "")) ?? ["id", "revision"];
    const row = Object.fromEntries(selected.map((column) => {
      if (Object.hasOwn(options.values ?? {}, column)) return [column, options.values?.[column]];
      if (/json$/u.test(column)) return [column, JSON.stringify({ case: "owned", column })];
      if (/(?:revision|ordinal|_ms|count|version|favorite|hidden|archived|acknowledged)$/u.test(column)) {
        return [column, options.snapshotValues?.[current] ?? (options.drift ? current : mutationRevision)];
      }
      if (column === "completion_idempotency_key") return [column, "durable-completion-receipt"];
      if (column === "status") return [column, "committed"];
      if (column === "operation") return [column, "case-owned-operation"];
      return [column, options.values?.[column] ?? `${column}-owned-1`];
    }));
    return [row, Object.fromEntries(Object.entries(row).map(([key, value]) => [
      key,
      typeof value === "string" && !/json$/u.test(key) ? `${value}-second` : value,
    ]))] as Row[];
  };
  const reader = (): SqliteReadTransactionExecutor => ({ queryAll });
  const writer = (): SqliteTransactionExecutor => ({
    queryAll,
    execute: async (sql: string) => {
      options.commands?.push(sql);
      mutationRevision += 1;
      return { changes: options.changes ?? 1, lastInsertRowId: 0 };
    },
  });
  return {
    readSnapshot: async <Result,>(read: (transaction: SqliteReadTransactionExecutor) => Promise<Result>) => {
      const value = await read(reader());
      snapshot += 1;
      return value;
    },
    write: async <Result,>(command: (transaction: SqliteTransactionExecutor) => Promise<Result>) => command(writer()),
    queryAll,
  } as unknown as SqliteKernel;
}

const execute = (runtime: SqliteKernel, value: V12NativeAcceptanceRequest) => executeV12NativeAcceptanceReadAction({
  kernel: runtime,
  request: value,
  sha256,
  executeOperation: ({ contract, request: operationRequest }) => dispatchV12NativeAcceptanceProductionOperation({ kernel: runtime, contract, request: operationRequest }),
});

describe("v1.2 native acceptance production executor", () => {
  it("owns one exact action/operation/probe/table/readback contract for all 101 source cases", () => {
    expect(V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS).toHaveLength(101);
    expect(new Set(V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.map(({ shard, caseId }) => `${shard}:${caseId}`)).size).toBe(101);
    for (const entry of V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS) {
      expect(entry.operation.id).toContain(`${entry.shard}:${entry.caseId}:`);
      expect(entry.probes.pre.id).toContain(`${entry.caseId}:pre:`);
      expect(entry.probes.action.id).toContain(`${entry.caseId}:action:`);
      expect(entry.probes.post.id).toContain(`${entry.caseId}:post:`);
      expect(entry.probes.pre.tables).toEqual(entry.probes.action.tables);
      expect(entry.probes.action.tables).toEqual(entry.probes.post.tables);
      expect(entry.probes.post.tables.length).toBeGreaterThan(0);
      expect(entry.uiReadback.id).toContain(`${entry.caseId}:ui:`);
    }
    const sourceOwned = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.filter(({ shard }) => shard !== "multi-plan");
    expect(sourceOwned).toHaveLength(88);
    const operationSignatures = new Set<string>();
    for (const entry of sourceOwned) {
      const operation = entry.operation as typeof entry.operation & Readonly<{
        handlerId?: string;
        parameterContract?: string;
        postcondition?: Readonly<{ id?: string; description?: string }>;
      }>;
      expect(operation.handlerId).toMatch(/^(?:workout|active-workout|rest|history|owned-plan|starter-plan|plan-impact|library|custom-exercise|metric-profile|running-plan|schedule-collision|backup|migration)\.[a-z0-9.-]+$/u);
      expect(operation.parameterContract).toContain(entry.caseId);
      expect(operation.postcondition?.id).toContain(entry.caseId);
      expect(operation.postcondition?.description?.length).toBeGreaterThan(12);
      expect(operation.handlerId).not.toMatch(/(?:count|noop|metadata|generic)/u);
      const signature = `${operation.handlerId}\u0000${operation.parameterContract}\u0000${operation.postcondition?.id}`;
      expect(operationSignatures.has(signature)).toBe(false);
      operationSignatures.add(signature);
    }
    expect(operationSignatures.size).toBe(88);
  });

  it("resolves every case-owned handler to an executable production function", () => {
    expect(assertV12NativeAcceptanceProductionHandlerRegistry()).toBe(true);
    for (const contract of V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS) {
      const handler = resolveV12NativeAcceptanceProductionHandler(contract);
      expect(typeof handler.execute).toBe("function");
      expect(handler.operationIds).toContain(contract.operation.id);
    }
    const source = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find(({ shard }) => shard === "workout")!;
    expect(() => resolveV12NativeAcceptanceProductionHandler({
      ...source,
      operation: { ...source.operation, handlerId: "workout.not-registered" },
    })).toThrow("v12_native_acceptance_handler_unresolved");
    expect(() => assertV12NativeAcceptanceProductionHandlerRegistry([{
      ...source,
      probes: {
        ...source.probes,
        post: { ...source.probes.post, tables: ["missing_authority_table"] },
      },
    }])).toThrow("v12_native_acceptance_authority_fact_columns_missing");
  });

  it("audits count, identity, handler, postcondition, receipt, and collapse invariants independently", () => {
    const replace = (
      index: number,
      value: V12NativeAcceptanceCaseContract,
      contracts: readonly V12NativeAcceptanceCaseContract[] = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS,
    ) => contracts.map((contract, contractIndex) => contractIndex === index ? value : contract);
    const sourceIndex = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.findIndex(({ shard }) => shard === "workout");
    const source = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS[sourceIndex]!;
    const mutationIndex = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.findIndex(({ shard, operation }) => shard === "workout" && operation.kind === "repository-mutation");
    const mutation = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS[mutationIndex]!;
    const readIndexes = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS
      .map((contract, index) => ({ contract, index }))
      .filter(({ contract }) => contract.shard === "workout" && contract.operation.kind === "repository-read")
      .slice(0, 2);

    expect(() => assertV12NativeAcceptanceOperationRegistry([])).toThrow("v12_native_acceptance_contract_count_invalid");
    expect(() => assertV12NativeAcceptanceOperationRegistry(replace(sourceIndex, { ...source, shard: "multi-plan" }))).toThrow("v12_native_acceptance_operation_count_invalid");
    const duplicateTarget = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS[sourceIndex + 1]!;
    expect(() => assertV12NativeAcceptanceOperationRegistry(replace(sourceIndex, {
      ...source,
      caseId: duplicateTarget.caseId,
      operation: duplicateTarget.operation,
    }))).toThrow("v12_native_acceptance_contract_duplicate");

    const invalidOperations: V12NativeAcceptanceCaseContract["operation"][] = [
      { ...source.operation, handlerId: "generic.count" },
      { ...source.operation, handlerId: "Invalid handler" },
      { ...source.operation, parameterContract: "wrong-case" },
      { ...source.operation, postcondition: { ...source.operation.postcondition, id: "wrong-case" } },
      { ...source.operation, postcondition: { ...source.operation.postcondition, description: "short" } },
    ];
    for (const operation of invalidOperations) {
      expect(() => assertV12NativeAcceptanceOperationRegistry(replace(sourceIndex, { ...source, operation })))
        .toThrow("v12_native_acceptance_operation_invalid");
    }

    for (const receipt of [
      null,
      { ...mutation.operation.receipt!, table: "not_authoritative" },
      { ...mutation.operation.receipt!, identityColumns: [] },
      { ...mutation.operation.receipt!, effectColumns: [] },
      { ...mutation.operation.receipt!, identityColumns: mutation.operation.receipt!.effectColumns.slice(0, 1) },
    ]) {
      expect(() => assertV12NativeAcceptanceOperationRegistry(replace(mutationIndex, {
        ...mutation,
        operation: { ...mutation.operation, receipt },
      }))).toThrow("v12_native_acceptance_receipt_contract_missing");
    }
    const read = readIndexes[0]!.contract;
    expect(() => assertV12NativeAcceptanceOperationRegistry(replace(readIndexes[0]!.index, {
      ...read,
      operation: { ...read.operation, receipt: mutation.operation.receipt },
    }))).toThrow("v12_native_acceptance_read_receipt_forbidden");

    const sharedParameter = `${readIndexes[0]!.contract.caseId}:${readIndexes[1]!.contract.caseId}:shared`;
    const sharedPostcondition = {
      id: `${readIndexes[0]!.contract.caseId}:${readIndexes[1]!.contract.caseId}:postcondition`,
      description: "shared handler with silently collapsed parameters",
    };
    let collapsed = replace(readIndexes[0]!.index, {
      ...readIndexes[0]!.contract,
      operation: { ...readIndexes[0]!.contract.operation, handlerId: "workout.shared-read", parameterContract: sharedParameter, postcondition: sharedPostcondition },
    });
    collapsed = replace(readIndexes[1]!.index, {
      ...readIndexes[1]!.contract,
      operation: { ...readIndexes[1]!.contract.operation, handlerId: "workout.shared-read", parameterContract: sharedParameter, postcondition: sharedPostcondition },
    }, collapsed);
    expect(() => assertV12NativeAcceptanceOperationRegistry(collapsed)).toThrow("v12_native_acceptance_operation_collapsed");
    expect(() => v12NativeAcceptanceCaseContract("workout", "workout.unknown")).toThrow("v12_native_acceptance_contract_missing");
  });

  it("dispatches a case-specific production repository read without a generic app_settings action", async () => {
    const commands: string[] = [];
    const result = await execute(kernel({ commands }), request());

    expect(result.source_receipt).toMatchObject({
      authority: "sqlite-production-operation",
      shard: "workout",
      case_id: "workout.root-identity",
      nonce: "a".repeat(48),
      action_id: "root-identity",
      operation_id: "workout:workout.root-identity:root-identity",
      operation_kind: "repository-read",
      operation_result: "read",
      authority_tables: ["plans", "owned_plan_schedules", "workout_sessions"],
    });
    expect(result.source_receipt.pre.facts_sha256).toBe(result.source_receipt.post.facts_sha256);
    expect(result.source_receipt.pre.source_sha256).not.toBe(result.source_receipt.action.source_sha256);
    expect(result.source_receipt.action.source_sha256).not.toBe(result.source_receipt.post.source_sha256);
    expect(commands.some((sql) => /SELECT COUNT\(\*\)/u.test(sql))).toBe(false);
    expect(commands.some((sql) => /SELECT[^;]*(?:\bid\b|\brevision\b|\bstatus\b)/u.test(sql))).toBe(true);
    expect(commands.filter((sql) => sql !== "PRAGMA user_version").every((sql) => !sql.includes("app_settings"))).toBe(true);
    expect(result.ui_readback.readback_id).toBe("workout.root-identity:ui:Workout source contract observation");
  });

  it("dispatches a case-specific serialized mutation and verifies committed authoritative readback", async () => {
    const commands: string[] = [];
    const contract = v12NativeAcceptanceCaseContract("library-running", "library.metric-profile-migration");
    const result = await execute(kernel({ commands }), request({
      shard: "library-running",
      caseId: contract.caseId,
      title: "Library and running",
      source: "PHASE17_CASE_ACTION_CONTRACTS + PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_CONTRACTS",
      requirement: contract.requirement,
      action: contract.actionId,
      readback: contract.uiReadback.label,
      sourceProbe: contract.sourceProbe,
      authorityTables: contract.probes.post.tables,
    }));

    expect(result.source_receipt).toMatchObject({
      operation_id: contract.operation.id,
      operation_kind: "repository-mutation",
      operation_result: "committed",
      command_outcome: "already_committed",
      committed_effects: 0,
      authority_tables: ["metric_profile_migration_events", "exercises"],
    });
    expect(result.source_receipt.pre.facts_sha256).toBe(result.source_receipt.post.facts_sha256);
    expect(commands.some((sql) => /SELECT COUNT\(\*\)/u.test(sql))).toBe(false);
    expect(commands.some((sql) => /SET rowid\s*=\s*rowid/u.test(sql))).toBe(false);
    expect(commands.some((sql) => sql.includes("app_settings"))).toBe(false);
  });

  it("maps source families to exact authority tables and rejects unowned probes", () => {
    expect(authorityTablesForV12NativeAcceptance("multi-plan", "phase13-map01-activation", "multi-plan-running:phase13-map01-activation"))
      .toEqual(["plans", "owned_plan_schedules", "owned_plan_mutation_requests"]);
    expect(authorityTablesForV12NativeAcceptance("library-running", "library.metric-profile-migration", "metric_profile_migration_events"))
      .toEqual(["metric_profile_migration_events", "exercises"]);
    expect(() => authorityTablesForV12NativeAcceptance("library-running", "library.remembered-state", "not_a_probe"))
      .toThrow("v12_native_acceptance_authority_missing");
    expect(validateV12NativeAcceptanceAuthorityTables(undefined)).toBe(false);
    expect(validateV12NativeAcceptanceAuthorityTables([])).toBe(false);
    expect(validateV12NativeAcceptanceAuthorityTables(["../private"])).toBe(false);
  });

  it("fails closed for wrong nonce, substituted semantics, source drift, missing snapshots, and invalid facts", async () => {
    await expect(execute(kernel(), request({ nonce: "wrong" }))).rejects.toThrow("v12_native_acceptance_request_invalid");
    await expect(execute(kernel(), request({ action: "unrelated-global-action", authorityTables: ["app_settings"] })))
      .rejects.toThrow("v12_native_acceptance_authority_mismatch");
    await expect(execute(kernel({ drift: true }), request())).rejects.toThrow("v12_native_acceptance_read_action_drift");
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: {} as SqliteKernel,
      request: request(),
      sha256,
      executeOperation: async () => ({ result: "read", facts: {} }),
    })).rejects.toThrow("v12_native_acceptance_snapshot_unavailable");
    await expect(execute(kernel({ version: 0 }), request())).rejects.toThrow("v12_native_acceptance_source_state_invalid");
    await expect(execute(kernel({ version: null }), request())).rejects.toThrow("v12_native_acceptance_source_state_invalid");
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel(), request: request(), sha256: async () => "bad",
      executeOperation: async () => ({ result: "read", facts: {} }),
    })).rejects.toThrow("v12_native_acceptance_source_state_invalid");
  });

  it("rejects generic count metadata and unrelated facts even when the wrapper names the right case", async () => {
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel(),
      request: request(),
      sha256,
      executeOperation: async ({ contract }) => ({
        result: "read",
        facts: {
          operation_id: contract.operation.id,
          row_count: 2,
          sql: 'SELECT COUNT(*) AS row_count FROM "plans"',
        },
      }),
    })).rejects.toThrow("v12_native_acceptance_operation_result_invalid");

    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel(),
      request: request(),
      sha256,
      executeOperation: async ({ contract }) => ({
        result: "read",
        facts: {
          operation_id: contract.operation.id,
          table: "app_settings",
          value: "unrelated",
        },
      }),
    })).rejects.toThrow("v12_native_acceptance_operation_result_invalid");
  });

  it("does not mint committed receipts for empty databases or zero-change mutations", async () => {
    const contract = v12NativeAcceptanceCaseContract("library-running", "library.metric-profile-migration");
    const mutationRequest = request({
      shard: "library-running",
      caseId: contract.caseId,
      title: "Library and running",
      source: "PHASE17_CASE_ACTION_CONTRACTS + PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_CONTRACTS",
      requirement: contract.requirement,
      action: contract.actionId,
      readback: contract.uiReadback.label,
      sourceProbe: contract.sourceProbe,
      authorityTables: contract.probes.post.tables,
    });
    await expect(execute(kernel({ empty: true }), mutationRequest))
      .rejects.toThrow("v12_native_acceptance_mutation_receipt_missing");
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel(),
      request: mutationRequest,
      sha256,
      executeOperation: async ({ contract: operationContract }) => ({
        result: "committed",
        facts: {
          handler_id: operationContract.operation.handlerId,
          postcondition_id: operationContract.operation.postcondition.id,
          receipt_id: "durable-receipt",
          outcome: "committed",
          committed_effects: 0,
          authoritative_readback: {},
        },
      }),
    })).rejects.toThrow("v12_native_acceptance_mutation_effect_missing");
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel(),
      request: mutationRequest,
      sha256,
      executeOperation: async ({ contract: operationContract }) => ({
        result: "committed",
        facts: {
          handler_id: operationContract.operation.handlerId,
          postcondition_id: operationContract.operation.postcondition.id,
          receipt_id: "durable-receipt",
          outcome: null,
          committed_effects: 1,
          authoritative_readback: {},
        },
      }),
    })).rejects.toThrow("v12_native_acceptance_operation_result_invalid");
  });

  it("requires a durable receipt and accepts replay only with the same receipt and no second mutation", async () => {
    const contract = v12NativeAcceptanceCaseContract("library-running", "library.metric-profile-migration");
    const mutationRequest = request({
      shard: "library-running",
      caseId: contract.caseId,
      title: "Library and running",
      source: "PHASE17_CASE_ACTION_CONTRACTS + PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_CONTRACTS",
      requirement: contract.requirement,
      action: contract.actionId,
      readback: contract.uiReadback.label,
      sourceProbe: contract.sourceProbe,
      authorityTables: contract.probes.post.tables,
    });
    const runtime = kernel();
    const run = () => execute(runtime, mutationRequest);
    const first = await run();
    const replay = await run();
    expect(first.source_receipt.operation_result_sha256).toBe(replay.source_receipt.operation_result_sha256);
    expect(first.source_receipt.command_receipt_id).toBe(replay.source_receipt.command_receipt_id);
    expect(first.source_receipt.command_outcome).toBe("already_committed");
    expect(replay.source_receipt.committed_effects).toBe(0);
  });

  it("fails every operation-result and transaction integrity branch closed", async () => {
    const readContract = v12NativeAcceptanceCaseContract("workout", "workout.root-identity");
    const readRuntime = kernel();
    const readOperation = await dispatchV12NativeAcceptanceProductionOperation({ kernel: readRuntime, contract: readContract });
    const readFacts = readOperation.facts as Readonly<Record<string, unknown>>;

    await expect(dispatchV12NativeAcceptanceProductionOperation({ kernel: {} as SqliteKernel, contract: readContract }))
      .rejects.toThrow("v12_native_acceptance_snapshot_unavailable");
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel(), request: request(), sha256,
      executeOperation: async () => ({ result: "committed", facts: readFacts }),
    })).rejects.toThrow("v12_native_acceptance_operation_result_invalid");
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel(), request: request(), sha256,
      executeOperation: async () => ({ result: "read", facts: { ...readFacts, receipt_id: "forbidden-read-receipt" } }),
    })).rejects.toThrow("v12_native_acceptance_operation_result_invalid");
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel(), request: request(), sha256,
      executeOperation: async () => ({ result: "read", facts: { ...readFacts, authoritative_readback: undefined } }),
    })).rejects.toThrow("v12_native_acceptance_operation_result_invalid");
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel(), request: request(), sha256,
      executeOperation: async () => ({ result: "read", facts: { ...readFacts, authoritative_readback: {} } }),
    })).rejects.toThrow("v12_native_acceptance_operation_result_invalid");
    let digestCall = 0;
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel(), request: request(),
      sha256: async (value) => (++digestCall === 6 ? "bad" : sha256(value)),
      executeOperation: async () => readOperation,
    })).rejects.toThrow("v12_native_acceptance_operation_result_invalid");
    await expect(execute(kernel({ snapshotValues: [1, 1, 1, 2, 1] }), request()))
      .rejects.toThrow("v12_native_acceptance_read_action_drift");

    const mutationContract = v12NativeAcceptanceCaseContract("library-running", "library.metric-profile-migration");
    const mutationRequest = request({
      shard: "library-running", caseId: mutationContract.caseId, title: "Library and running",
      source: "PHASE17_CASE_ACTION_CONTRACTS + PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_CONTRACTS",
      requirement: mutationContract.requirement, action: mutationContract.actionId,
      readback: mutationContract.uiReadback.label, sourceProbe: mutationContract.sourceProbe,
      authorityTables: mutationContract.probes.post.tables,
    });
    await expect(dispatchV12NativeAcceptanceProductionOperation({
      kernel: kernel(),
      contract: { ...mutationContract, operation: { ...mutationContract.operation, receipt: null } },
    })).rejects.toThrow("v12_native_acceptance_receipt_contract_missing");
    await expect(dispatchV12NativeAcceptanceProductionOperation({
      kernel: kernel({ values: {
        idempotency_key: null, exercise_id: null, exercise_revision: null,
        to_exercise_metric_generation: null, result_json: null,
      } }),
      contract: mutationContract,
    })).rejects.toThrow("v12_native_acceptance_mutation_receipt_invalid");
    const favorite = v12NativeAcceptanceCaseContract("library-running", "library.exercise-favorites");
    await expect(dispatchV12NativeAcceptanceProductionOperation({
      kernel: kernel({ values: { mutation_kind: "favorite" } }), contract: favorite,
    })).resolves.toMatchObject({ result: "committed", facts: { outcome: "already_committed" } });

    const authoritative = async (revision: number) => {
      const operation = await dispatchV12NativeAcceptanceProductionOperation({
        kernel: kernel({ initialRevision: revision }), contract: mutationContract,
      });
      return (operation.facts as Readonly<Record<string, unknown>>).authoritative_readback;
    };
    const executeMutationProof = async (input: Readonly<{
      outcome: "committed" | "already_committed";
      effects: number;
      snapshots: readonly number[];
      authoritativeRevision: number;
    }>) => executeV12NativeAcceptanceReadAction({
      kernel: kernel({ snapshotValues: input.snapshots }), request: mutationRequest, sha256,
      executeOperation: async () => ({
        result: "committed",
        facts: {
          handler_id: mutationContract.operation.handlerId,
          postcondition_id: mutationContract.operation.postcondition.id,
          receipt_id: "durable-migration-receipt",
          outcome: input.outcome,
          committed_effects: input.effects,
          authoritative_readback: await authoritative(input.authoritativeRevision),
        },
      }),
    });
    await expect(executeMutationProof({ outcome: "committed", effects: 1, snapshots: [1, 2, 2, 2], authoritativeRevision: 2 }))
      .resolves.toMatchObject({ source_receipt: { command_outcome: "committed", committed_effects: 1 } });
    await expect(executeMutationProof({ outcome: "committed", effects: 1, snapshots: [1, 1, 1, 1], authoritativeRevision: 1 }))
      .rejects.toThrow("v12_native_acceptance_mutation_effect_missing");
    await expect(executeMutationProof({ outcome: "already_committed", effects: 0, snapshots: [1, 2, 2, 2], authoritativeRevision: 2 }))
      .rejects.toThrow("v12_native_acceptance_replay_mutated");
    await expect(executeMutationProof({ outcome: "already_committed", effects: 0, snapshots: [1, 2, 2, 3], authoritativeRevision: 2 }))
      .rejects.toThrow("v12_native_acceptance_postcondition_drift");
  });
});
