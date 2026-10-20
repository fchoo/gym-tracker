import { createHash } from "node:crypto";
import { describe, expect, it, jest } from "@jest/globals";


import type { SqliteKernel, SqliteReadTransactionExecutor, SqliteTransactionExecutor } from "../platform/sqlite/sqliteKernel";
import {
  assertV12NativeAcceptanceOperationRegistry,
  V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS,
  v12NativeAcceptanceCaseContract,
  type V12NativeAcceptanceCaseContract,
} from "./contracts/phase15Workout.contract";
import { MULTI_PLAN_RUNNING_CONTRACT_CASES } from "./contracts/multiPlanRunning.contract";
import { V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY } from "./v12NativeAcceptanceAuthorityReaders";
import {
  authorityTablesForV12NativeAcceptance,
  assertV12NativeAcceptanceProductionHandlerRegistry,
  dispatchV12NativeAcceptanceProductionOperation,
  executeV12NativeAcceptanceReadAction,
  prepareV12NativeAcceptanceProductionOperation,
  resolveV12NativeAcceptanceProductionHandler,
  validateV12NativeAcceptanceAuthorityTables,
  type V12NativeAcceptanceRequest,
} from "./v12NativeAcceptanceExecutor";

const sha256 = async (value: string): Promise<string> =>
  createHash("sha256").update(value).digest("hex");

function request(overrides: Partial<V12NativeAcceptanceRequest> = {}): V12NativeAcceptanceRequest {
  return {
    shard: "workout",
    caseId: "workout.day-switch",
    fixtureId: "v12-synthetic-fixtures-r18",
    title: "Workout",
    source: "PHASE15_REQUIRED_CASES",
    requirement: "WRK-02",
    action: "day-switch",
    readback: "Workout source contract observation",
    sourceProbe: "phase15-workout-ledger:workout.day-switch",
    authorityTables: ["plans", "owned_plan_schedules", "workout_sessions"],
    nonce: "a".repeat(48),
    ...overrides,
  };
}

function requestForContract(
  contract: V12NativeAcceptanceCaseContract,
  nonce = "b".repeat(48),
): V12NativeAcceptanceRequest {
  return request({
    shard: contract.shard,
    caseId: contract.caseId,
    requirement: contract.requirement,
    action: contract.actionId,
    readback: contract.uiReadback.label,
    sourceProbe: contract.sourceProbe,
    authorityTables: contract.probes.post.tables,
    nonce,
  });
}

function kernel(options: Readonly<{
  drift?: boolean;
  version?: number | null;
  commands?: string[];
  rowCount?: number;
  changes?: number;
  empty?: boolean;
  emptySql?: RegExp;
  initialRevision?: number;
  snapshotValues?: readonly number[];
  values?: Readonly<Record<string, unknown>>;
}> = {}): SqliteKernel {
  let snapshot = 0;
  let mutationRevision = options.initialRevision ?? 1;
  const queryAll = async <Row,>(sql: string): Promise<readonly Row[]> => {
    options.commands?.push(sql);
    if (sql === "PRAGMA user_version") return (options.version === null ? [] : [{ user_version: options.version ?? 42 }]) as Row[];
    if ((options.empty || options.emptySql?.test(sql)) && /^SELECT /u.test(sql)) return [];
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

async function authoritativeFacts(
  runtime: SqliteKernel,
  contract: V12NativeAcceptanceCaseContract,
  value: V12NativeAcceptanceRequest,
) {
  return V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY[contract.operation.id]!.read({
    query: runtime,
    request: { caseId: value.caseId, fixtureId: value.fixtureId, nonce: value.nonce },
    sha256,
  });
}

async function operationFactsFor(
  runtime: SqliteKernel,
  contract: V12NativeAcceptanceCaseContract,
  value: V12NativeAcceptanceRequest,
  input: Readonly<{
    receiptId?: string | null;
    outcome?: "committed" | "already_committed" | null;
    committedEffects?: number;
  }> = {},
) {
  return {
    handler_id: contract.operation.handlerId,
    postcondition_id: contract.operation.postcondition.id,
    receipt_id: input.receiptId ?? null,
    outcome: input.outcome ?? null,
    committed_effects: input.committedEffects ?? 0,
    authoritative_readback: await authoritativeFacts(runtime, contract, value),
  };
}

function isolateExecutorWithMocks(
  mocks: readonly Readonly<{ moduleName: string; factory(): unknown }>[],
): Readonly<{
  executor: typeof import("./v12NativeAcceptanceExecutor");
  contracts: typeof import("./contracts/phase15Workout.contract");
}> {
  let executor: typeof import("./v12NativeAcceptanceExecutor") | undefined;
  let contracts: typeof import("./contracts/phase15Workout.contract") | undefined;
  jest.isolateModules(() => {
    for (const mock of mocks) jest.doMock(mock.moduleName, mock.factory);
    executor = require("./v12NativeAcceptanceExecutor") as typeof import("./v12NativeAcceptanceExecutor");
    contracts = require("./contracts/phase15Workout.contract") as typeof import("./contracts/phase15Workout.contract");
  });
  if (executor === undefined || contracts === undefined) {
    throw new Error("v12_native_acceptance_isolated_module_missing");
  }
  return { executor, contracts };
}

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
    const sourceOwned = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.filter(({ shard }) => shard !== "multi-plan");
    expect(Object.keys(V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY)).toHaveLength(88);
    for (const contract of V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS) {
      const handler = resolveV12NativeAcceptanceProductionHandler(contract);
      expect(typeof handler.execute).toBe("function");
      expect(handler.operationIds).toContain(contract.operation.id);
    }
    for (const contract of sourceOwned) {
      const reader = V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY[contract.operation.id];
      expect(reader).toMatchObject({ caseId: contract.caseId, authorityTables: contract.probes.post.tables });
      expect(typeof reader?.read).toBe("function");
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
    }])).toThrow("v12_native_acceptance_authority_reader_unresolved");
    expect(() => assertV12NativeAcceptanceProductionHandlerRegistry([{
      ...source,
      probes: {
        ...source.probes,
        post: { ...source.probes.post, tables: [...source.probes.post.tables].reverse() },
      },
    }, ...V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.filter((entry) => entry !== source)])).toThrow(
      "v12_native_acceptance_authority_reader_unresolved",
    );
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
      case_id: "workout.day-switch",
      nonce: "a".repeat(48),
      action_id: "day-switch",
      operation_id: "workout:workout.day-switch:day-switch",
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
    expect(result.ui_readback.readback_id).toBe("workout.day-switch:ui:Workout source contract observation");
  });

  it("fails closed when a production mutation handler is called without its nonce-bound request", async () => {
    const contract = v12NativeAcceptanceCaseContract("library-running", "library.metric-profile-migration");
    await expect(dispatchV12NativeAcceptanceProductionOperation({
      kernel: kernel(), contract,
    })).rejects.toThrow("v12_native_acceptance_request_required");
  });

  it("rejects missing production runtimes and propagates a failed source-owned wrapper", async () => {
    const running = v12NativeAcceptanceCaseContract("workout", "workout.context-running");
    await expect(dispatchV12NativeAcceptanceProductionOperation({
      kernel: kernel(), contract: running, request: requestForContract(running),
    })).rejects.toThrow("v12_native_acceptance_running_runtime_required");

    const custom = v12NativeAcceptanceCaseContract("library-running", "library.exercise-favorites");
    await expect(dispatchV12NativeAcceptanceProductionOperation({
      kernel: kernel(), contract: custom, request: requestForContract(custom),
    })).rejects.toThrow("v12_native_acceptance_custom_exercise_runtime_required");

    const metric = v12NativeAcceptanceCaseContract("library-running", "library.metric-profile-migration");
    await expect(prepareV12NativeAcceptanceProductionOperation({
      kernel: kernel(), contract: metric, request: requestForContract(metric),
      runtime: { customExercises: {} as never },
    })).rejects.toThrow("v12_native_acceptance_owned_plan_runtime_required");

    const wrapper = v12NativeAcceptanceCaseContract("multi-plan", "phase13-map01-activation");
    await expect(dispatchV12NativeAcceptanceProductionOperation({
      kernel: kernel(), contract: wrapper, request: requestForContract(wrapper),
      runtime: {
        multiPlan: {
          runWrapper: async () => ({
            schemaVersion: 1,
            contractVersion: 1,
            status: "failed",
            total: MULTI_PLAN_RUNNING_CONTRACT_CASES.length,
            passed: MULTI_PLAN_RUNNING_CONTRACT_CASES.length - 1,
            failed: 1,
            skipped: 0,
            cases: MULTI_PLAN_RUNNING_CONTRACT_CASES.map((id) => ({
              id,
              status: id === wrapper.caseId ? "failed" as const : "passed" as const,
              durationMs: 1,
            })),
            startedAt: "2026-10-01T00:00:00.000Z",
            finishedAt: "2026-10-01T00:00:01.000Z",
          }),
        },
      },
    })).rejects.toThrow("v12_native_acceptance_multi_plan_wrapper_failed");
  });

  it("fails preparation before a missing request or fixture can mint a production operation", async () => {
    const workout = v12NativeAcceptanceCaseContract("workout", "workout.day-switch");
    await expect(prepareV12NativeAcceptanceProductionOperation({
      kernel: kernel(), contract: workout,
    })).rejects.toThrow("v12_native_acceptance_request_required");

    await expect(dispatchV12NativeAcceptanceProductionOperation({
      kernel: kernel({ empty: true }), contract: workout, request: requestForContract(workout),
    })).rejects.toThrow("v12_native_acceptance_workout_read_precondition_missing");

    const active = v12NativeAcceptanceCaseContract("workout", "workout.context-running");
    await expect(dispatchV12NativeAcceptanceProductionOperation({
      kernel: kernel({ empty: true }), contract: active, request: requestForContract(active),
    })).rejects.toThrow("v12_native_acceptance_running_runtime_required");
  });

  it("rejects invalid Workout fixture writers before a handler can observe their synthetic state", async () => {
    let isolatedExecutor: typeof import("./v12NativeAcceptanceExecutor") | undefined;
    let isolatedContracts: typeof import("./contracts/phase15Workout.contract") | undefined;
    jest.isolateModules(() => {
      jest.doMock("../domains/plans", () => {
        const actual = jest.requireActual<typeof import("../domains/plans")>("../domains/plans");
        return { ...actual, activateStarterPlan: async () => ({ plan: { id: "wrong-plan" }, days: [] }) };
      });
      isolatedExecutor = require("./v12NativeAcceptanceExecutor") as typeof import("./v12NativeAcceptanceExecutor");
      isolatedContracts = require("./contracts/phase15Workout.contract") as typeof import("./contracts/phase15Workout.contract");
    });
    try {
      if (isolatedExecutor === undefined || isolatedContracts === undefined) {
        throw new Error("v12_native_acceptance_isolated_module_missing");
      }
      const workout = isolatedContracts.v12NativeAcceptanceCaseContract("workout", "workout.day-switch");
      const fixtureRequest = requestForContract(workout, "d".repeat(48));
      await expect(isolatedExecutor.dispatchV12NativeAcceptanceProductionOperation({
        kernel: kernel({ empty: true }), contract: workout, request: fixtureRequest,
      })).rejects.toThrow("v12_native_acceptance_workout_fixture_seed_invalid");
    } finally {
      jest.resetModules();
    }
  });

  it("rejects an absent Workout fixture day and non-running production start results", async () => {
    let isolatedExecutor: typeof import("./v12NativeAcceptanceExecutor") | undefined;
    let isolatedContracts: typeof import("./contracts/phase15Workout.contract") | undefined;
    jest.isolateModules(() => {
      jest.doMock("../domains/plans", () => {
        const actual = jest.requireActual<typeof import("../domains/plans")>("../domains/plans");
        return {
          ...actual,
          activateStarterPlan: async ({ activatedAtMs }: Readonly<{ activatedAtMs: number }>) => ({
            plan: { id: `plan_copy_${activatedAtMs}` }, days: [{}],
          }),
        };
      });
      jest.doMock("../domains/workout/startWorkout", () => ({
        ...jest.requireActual<typeof import("../domains/workout/startWorkout")>("../domains/workout/startWorkout"),
        startWorkout: async () => ({ status: "abandoned", id: "not-a-running-session" }),
      }));
      isolatedExecutor = require("./v12NativeAcceptanceExecutor") as typeof import("./v12NativeAcceptanceExecutor");
      isolatedContracts = require("./contracts/phase15Workout.contract") as typeof import("./contracts/phase15Workout.contract");
    });
    try {
      if (isolatedExecutor === undefined || isolatedContracts === undefined) {
        throw new Error("v12_native_acceptance_isolated_module_missing");
      }
      const contract = isolatedContracts.v12NativeAcceptanceCaseContract("workout", "workout.start-alternate");
      const fixtureRequest = requestForContract(contract, "e".repeat(48));
      await expect(isolatedExecutor.dispatchV12NativeAcceptanceProductionOperation({
        kernel: kernel({ empty: true }), contract, request: fixtureRequest,
      })).rejects.toThrow("v12_native_acceptance_workout_fixture_day_missing");
      await expect(isolatedExecutor.dispatchV12NativeAcceptanceProductionOperation({
        kernel: kernel({ emptySql: /(?:SELECT id FROM plans WHERE|SELECT id FROM workout_sessions)/u }),
        contract,
        request: fixtureRequest,
      })).rejects.toThrow("v12_native_acceptance_workout_start_postcondition_failed");

      const activeContract = isolatedContracts.v12NativeAcceptanceCaseContract("workout", "workout.row-edit");
      await expect(isolatedExecutor.dispatchV12NativeAcceptanceProductionOperation({
        kernel: kernel({ emptySql: /(?:SELECT id FROM plans WHERE|SELECT id FROM workout_sessions)/u }),
        contract: activeContract,
        request: requestForContract(activeContract, fixtureRequest.nonce),
      })).rejects.toThrow("v12_native_acceptance_workout_fixture_start_invalid");
    } finally {
      jest.resetModules();
    }
  });

  it("rejects Workout repository reads whose case-specific projections lose their required facts", async () => {
    let isolatedExecutor: typeof import("./v12NativeAcceptanceExecutor") | undefined;
    let isolatedContracts: typeof import("./contracts/phase15Workout.contract") | undefined;
    jest.isolateModules(() => {
      jest.doMock("../platform/sqlite/repositories/plansWorkoutRepository", () => {
        const actual = jest.requireActual<typeof import("../platform/sqlite/repositories/plansWorkoutRepository")>("../platform/sqlite/repositories/plansWorkoutRepository");
        return {
          ...actual,
          createPlansWorkoutRepository: () => ({
            getTodayView: async () => ({ state: "missing" }),
            getPlanDays: async () => [],
          }),
        };
      });
      isolatedExecutor = require("./v12NativeAcceptanceExecutor") as typeof import("./v12NativeAcceptanceExecutor");
      isolatedContracts = require("./contracts/phase15Workout.contract") as typeof import("./contracts/phase15Workout.contract");
    });
    try {
      if (isolatedExecutor === undefined || isolatedContracts === undefined) {
        throw new Error("v12_native_acceptance_isolated_module_missing");
      }
      const today = isolatedContracts.v12NativeAcceptanceCaseContract("workout", "workout.root-identity");
      await expect(isolatedExecutor.dispatchV12NativeAcceptanceProductionOperation({
        kernel: kernel(), contract: today, request: requestForContract(today),
      })).rejects.toThrow("v12_native_acceptance_workout_today_view_precondition_missing");

      const days = isolatedContracts.v12NativeAcceptanceCaseContract("workout", "workout.day-switch");
      await expect(isolatedExecutor.dispatchV12NativeAcceptanceProductionOperation({
        kernel: kernel(), contract: days, request: requestForContract(days),
      })).rejects.toThrow("v12_native_acceptance_workout_read_precondition_missing");
    } finally {
      jest.resetModules();
    }
  });

  it("rejects missing and non-running active Workout repository projections", async () => {
    let isolatedExecutor: typeof import("./v12NativeAcceptanceExecutor") | undefined;
    let isolatedContracts: typeof import("./contracts/phase15Workout.contract") | undefined;
    jest.isolateModules(() => {
      jest.doMock("../platform/sqlite/repositories/workoutRepository", () => {
        const actual = jest.requireActual<typeof import("../platform/sqlite/repositories/workoutRepository")>("../platform/sqlite/repositories/workoutRepository");
        return {
          ...actual,
          createWorkoutRepository: () => ({
            getWorkoutSession: async () => null,
            getActiveWorkout: async () => ({ status: "paused" }),
          }),
        };
      });
      isolatedExecutor = require("./v12NativeAcceptanceExecutor") as typeof import("./v12NativeAcceptanceExecutor");
      isolatedContracts = require("./contracts/phase15Workout.contract") as typeof import("./contracts/phase15Workout.contract");
    });
    try {
      if (isolatedExecutor === undefined || isolatedContracts === undefined) {
        throw new Error("v12_native_acceptance_isolated_module_missing");
      }
      const session = isolatedContracts.v12NativeAcceptanceCaseContract("workout", "workout.start-resume");
      await expect(isolatedExecutor.dispatchV12NativeAcceptanceProductionOperation({
        kernel: kernel(), contract: session, request: requestForContract(session),
      })).rejects.toThrow("v12_native_acceptance_workout_read_precondition_missing");

      const active = isolatedContracts.v12NativeAcceptanceCaseContract("workout", "workout.exercise-disclosure");
      await expect(isolatedExecutor.dispatchV12NativeAcceptanceProductionOperation({
        kernel: kernel(), contract: active, request: requestForContract(active),
      })).rejects.toThrow("v12_native_acceptance_workout_read_precondition_missing");
    } finally {
      jest.resetModules();
    }
  });

  it("rejects Library search and instruction projections that omit case-owned content", async () => {
    const { executor, contracts } = isolateExecutorWithMocks([
      {
        moduleName: "../platform/sqlite/repositories/contentRepository",
        factory: () => ({
          ...jest.requireActual<typeof import("../platform/sqlite/repositories/contentRepository")>("../platform/sqlite/repositories/contentRepository"),
          createContentRepository: () => ({
            importAcceptedCatalog: async () => undefined,
            readBundledExerciseInstructions: async () => null,
          }),
        }),
      },
      {
        moduleName: "../platform/sqlite/repositories/librarySearchRepository",
        factory: () => ({
          ...jest.requireActual<typeof import("../platform/sqlite/repositories/librarySearchRepository")>("../platform/sqlite/repositories/librarySearchRepository"),
          createLibrarySearchRepository: () => ({ searchExercises: async () => ({ state: "empty", items: [] }) }),
        }),
      },
    ]);
    try {
      const search = contracts.v12NativeAcceptanceCaseContract("library-running", "library.exercise-search");
      await expect(executor.dispatchV12NativeAcceptanceProductionOperation({
        kernel: kernel(), contract: search, request: requestForContract(search),
      })).rejects.toThrow("v12_native_acceptance_library_search_postcondition_failed");

      const instructions = contracts.v12NativeAcceptanceCaseContract("library-running", "library.builtin-exercise");
      await expect(executor.dispatchV12NativeAcceptanceProductionOperation({
        kernel: kernel(), contract: instructions, request: requestForContract(instructions),
      })).rejects.toThrow("v12_native_acceptance_instruction_postcondition_failed");
    } finally {
      jest.resetModules();
    }
  });

  it("rejects Library section and runtime projections that no longer meet their owned contracts", async () => {
    const { executor, contracts } = isolateExecutorWithMocks([
      {
        moduleName: "../bootstrap/librarySectionPreferencePort",
        factory: () => ({
          ...jest.requireActual<typeof import("../bootstrap/librarySectionPreferencePort")>("../bootstrap/librarySectionPreferencePort"),
          createLibrarySectionPreferencePort: () => ({
            read: async () => ({ section: "plans", revision: 0 }),
            write: async () => ({ section: "plans", revision: 0 }),
          }),
        }),
      },
    ]);
    try {
      const remembered = contracts.v12NativeAcceptanceCaseContract("library-running", "library.remembered-state");
      await expect(executor.prepareV12NativeAcceptanceProductionOperation({
        kernel: kernel(), contract: remembered, request: requestForContract(remembered),
      })).rejects.toThrow("v12_native_acceptance_library_section_precondition_failed");
      await expect(executor.dispatchV12NativeAcceptanceProductionOperation({
        kernel: kernel(), contract: remembered, request: requestForContract(remembered),
      })).rejects.toThrow("v12_native_acceptance_library_section_postcondition_failed");
    } finally {
      jest.resetModules();
    }

    const runtime = isolateExecutorWithMocks([
      {
        moduleName: "../bootstrap/libraryRuntimeReadPort",
        factory: () => ({
          ...jest.requireActual<typeof import("../bootstrap/libraryRuntimeReadPort")>("../bootstrap/libraryRuntimeReadPort"),
          readLibraryRuntimeSnapshot: async () => ({
            sectionPreference: { section: "plans", revision: 0 },
            plans: { owned: [] },
            exerciseFilterOptions: { exerciseTypes: [] },
          }),
        }),
      },
    ]);
    try {
      const actions = runtime.contracts.v12NativeAcceptanceCaseContract("library-running", "library.actions-sheet");
      await expect(runtime.executor.dispatchV12NativeAcceptanceProductionOperation({
        kernel: kernel(), contract: actions, request: requestForContract(actions),
      })).rejects.toThrow("v12_native_acceptance_library_actions_postcondition_failed");
      const accessibility = runtime.contracts.v12NativeAcceptanceCaseContract("library-running", "library.accessibility-recovery");
      await expect(runtime.executor.dispatchV12NativeAcceptanceProductionOperation({
        kernel: kernel(), contract: accessibility, request: requestForContract(accessibility),
      })).rejects.toThrow("v12_native_acceptance_library_accessibility_postcondition_failed");
    } finally {
      jest.resetModules();
    }
  });

  it("rejects invalid Owned Plan seed, read, and absent-plan projections", async () => {
    const seed = isolateExecutorWithMocks([
      {
        moduleName: "../platform/sqlite/repositories/ownedPlanRepository",
        factory: () => ({
          ...jest.requireActual<typeof import("../platform/sqlite/repositories/ownedPlanRepository")>("../platform/sqlite/repositories/ownedPlanRepository"),
          createOwnedPlanRepository: () => ({
            read: async () => null,
            createDraft: async () => ({ outcome: "already_committed", plan: { id: "wrong", days: [] } }),
          }),
        }),
      },
    ]);
    try {
      const contract = seed.contracts.v12NativeAcceptanceCaseContract("library-running", "library.plan-groups");
      await expect(seed.executor.prepareV12NativeAcceptanceProductionOperation({
        kernel: kernel(), contract, request: requestForContract(contract),
      })).rejects.toThrow("v12_native_acceptance_owned_plan_read_seed_invalid");
    } finally {
      jest.resetModules();
    }

    const invalidRead = isolateExecutorWithMocks([
      {
        moduleName: "../platform/sqlite/repositories/ownedPlanRepository",
        factory: () => ({
          ...jest.requireActual<typeof import("../platform/sqlite/repositories/ownedPlanRepository")>("../platform/sqlite/repositories/ownedPlanRepository"),
          createOwnedPlanRepository: () => ({
            read: async () => ({ name: "wrong", days: [] }),
          }),
        }),
      },
    ]);
    try {
      const read = invalidRead.contracts.v12NativeAcceptanceCaseContract("library-running", "library.plan-groups");
      await expect(invalidRead.executor.dispatchV12NativeAcceptanceProductionOperation({
        kernel: kernel(), contract: read, request: requestForContract(read),
      })).rejects.toThrow("v12_native_acceptance_owned_plan_read_postcondition_failed");
      const absent = invalidRead.contracts.v12NativeAcceptanceCaseContract("library-running", "library.neutral-plan-chooser");
      await expect(invalidRead.executor.dispatchV12NativeAcceptanceProductionOperation({
        kernel: kernel(), contract: absent, request: requestForContract(absent),
      })).rejects.toThrow("v12_native_acceptance_plan_create_intent_postcondition_failed");
    } finally {
      jest.resetModules();
    }
  });

  it("rejects custom-exercise handlers when durable receipts or exercise preconditions are absent", async () => {
    const runtime = { customExercises: {} as never };
    const favorite = v12NativeAcceptanceCaseContract("library-running", "library.exercise-favorites");
    await expect(dispatchV12NativeAcceptanceProductionOperation({
      kernel: kernel(), contract: favorite, request: requestForContract(favorite), runtime,
    })).rejects.toThrow("v12_native_acceptance_custom_exercise_receipt_invalid");

    const edit = v12NativeAcceptanceCaseContract("library-running", "library.custom-exercise-edit");
    await expect(dispatchV12NativeAcceptanceProductionOperation({
      kernel: kernel({ empty: true }), contract: edit, request: requestForContract(edit), runtime,
    })).rejects.toThrow("v12_native_acceptance_custom_exercise_precondition_missing");

    const archive = v12NativeAcceptanceCaseContract("library-running", "library.custom-exercise-archive");
    await expect(dispatchV12NativeAcceptanceProductionOperation({
      kernel: kernel({ empty: true }), contract: archive, request: requestForContract(archive), runtime,
    })).rejects.toThrow("v12_native_acceptance_custom_exercise_precondition_missing");

    const copy = isolateExecutorWithMocks([
      {
        moduleName: "../platform/sqlite/repositories/contentRepository",
        factory: () => ({
          ...jest.requireActual<typeof import("../platform/sqlite/repositories/contentRepository")>("../platform/sqlite/repositories/contentRepository"),
          createContentRepository: () => ({ importAcceptedCatalog: async () => undefined }),
        }),
      },
    ]);
    try {
      const contract = copy.contracts.v12NativeAcceptanceCaseContract("library-running", "library.custom-exercise-copy-bundled");
      await expect(copy.executor.prepareV12NativeAcceptanceProductionOperation({
        kernel: kernel({ empty: true }), contract, request: requestForContract(contract), runtime,
      })).rejects.toThrow("v12_native_acceptance_copy_source_missing");
    } finally {
      jest.resetModules();
    }
  });

  it("rejects Running handlers whose nonce-bound aggregate is absent", async () => {
    const runtime = { running: { loadPlan: async () => null } as never };
    const cases = [
      ["workout", "workout.context-running", kernel()],
      ["library-running", "library.running-session-common", kernel({ emptySql: /running_plan_receipts/u })],
      ["library-running", "library.running-create-typed-sessions", kernel({ emptySql: /running_plan_receipts/u })],
      ["library-running", "library.running-goal-edit", kernel({ emptySql: /running_plan_receipts/u })],
    ] as const;
    for (const [shard, caseId, runtimeKernel] of cases) {
      const contract = v12NativeAcceptanceCaseContract(shard, caseId);
      await expect(dispatchV12NativeAcceptanceProductionOperation({
        kernel: runtimeKernel,
        contract,
        request: requestForContract(contract),
        runtime,
      })).rejects.toThrow("v12_native_acceptance_running_precondition_missing");
    }
  });

  it("consumes the full multi-plan wrapper projection through the outer source receipt", async () => {
    const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find(({ shard, caseId }) => (
      shard === "multi-plan" && caseId === "phase13-map01-activation"
    ))!;
    const runtime = kernel();
    let calls = 0;
    const result = await executeV12NativeAcceptanceReadAction({
      kernel: runtime,
      request: request({
        shard: contract.shard,
        caseId: contract.caseId,
        action: contract.actionId,
        readback: contract.uiReadback.label,
        sourceProbe: contract.sourceProbe,
        authorityTables: contract.probes.post.tables,
      }),
      sha256,
      executeOperation: ({ contract: operationContract, request: operationRequest }) => dispatchV12NativeAcceptanceProductionOperation({
        kernel: runtime,
        contract: operationContract,
        request: operationRequest,
        runtime: {
          multiPlan: {
            runWrapper: async () => {
              calls += 1;
              return {
                schemaVersion: 1,
                contractVersion: 1,
                status: "passed",
                total: MULTI_PLAN_RUNNING_CONTRACT_CASES.length,
                passed: MULTI_PLAN_RUNNING_CONTRACT_CASES.length,
                failed: 0,
                skipped: 0,
                cases: MULTI_PLAN_RUNNING_CONTRACT_CASES.map((id) => ({ id, status: "passed", durationMs: 1 })),
                startedAt: "2026-10-01T00:00:00.000Z",
                finishedAt: "2026-10-01T00:00:01.000Z",
              };
            },
          },
        },
      }),
    });

    expect(calls).toBe(1);
    expect(result.source_receipt).toMatchObject({
      operation_result: "committed",
      command_outcome: "committed",
      committed_effects: 1,
    });
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

  it("rejects authoritative proof hash, source drift, postcondition drift, and illegal mutation transitions", async () => {
    const readContract = v12NativeAcceptanceCaseContract("workout", "workout.day-switch");
    const readRequest = requestForContract(readContract);
    const invalidHashKernel = kernel();
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: invalidHashKernel,
      request: readRequest,
      sha256: async (value) => value.includes('"operation_id"') && value.includes(readContract.operation.id) ? "invalid" : sha256(value),
      executeOperation: async () => ({
        result: "read" as const,
        facts: await operationFactsFor(invalidHashKernel, readContract, readRequest),
      }),
    })).rejects.toThrow("v12_native_acceptance_operation_result_invalid");

    const readDriftKernel = kernel({ snapshotValues: [1, 1, 2, 2] });
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: readDriftKernel,
      request: readRequest,
      sha256,
      executeOperation: async () => ({
        result: "read" as const,
        facts: await operationFactsFor(readDriftKernel, readContract, readRequest),
      }),
    })).rejects.toThrow("v12_native_acceptance_read_action_drift");

    const mutationContract = v12NativeAcceptanceCaseContract("library-running", "library.metric-profile-migration");
    const mutationRequest = requestForContract(mutationContract);
    const receiptId = "durable-mutation-receipt";
    const missingEffectKernel = kernel();
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: missingEffectKernel,
      request: mutationRequest,
      sha256,
      executeOperation: async () => ({
        result: "committed" as const,
        facts: await operationFactsFor(missingEffectKernel, mutationContract, mutationRequest, {
          receiptId, outcome: "committed", committedEffects: 1,
        }),
      }),
    })).rejects.toThrow("v12_native_acceptance_mutation_effect_missing");

    const replayMutationKernel = kernel();
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: replayMutationKernel,
      request: mutationRequest,
      sha256,
      executeOperation: async () => {
        await replayMutationKernel.write((transaction) => transaction.execute("UPDATE exercises SET revision = revision"));
        return {
          result: "committed" as const,
          facts: await operationFactsFor(replayMutationKernel, mutationContract, mutationRequest, {
            receiptId, outcome: "already_committed", committedEffects: 0,
          }),
        };
      },
    })).rejects.toThrow("v12_native_acceptance_replay_mutated");

    const postconditionDriftKernel = kernel({ snapshotValues: [1, 2, 2, 3] });
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: postconditionDriftKernel,
      request: mutationRequest,
      sha256,
      executeOperation: async () => {
        await postconditionDriftKernel.write((transaction) => transaction.execute("UPDATE exercises SET revision = revision"));
        return {
          result: "committed" as const,
          facts: await operationFactsFor(postconditionDriftKernel, mutationContract, mutationRequest, {
            receiptId, outcome: "committed", committedEffects: 1,
          }),
        };
      },
    })).rejects.toThrow("v12_native_acceptance_postcondition_drift");
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
      .rejects.toThrow("v12_native_acceptance_metric_precondition_missing");
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

  it("requires a durable receipt before mutation proof can be accepted", async () => {
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
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel(), request: mutationRequest, sha256,
      executeOperation: async ({ contract: operationContract }) => ({
        result: "committed",
        facts: {
          handler_id: operationContract.operation.handlerId,
          postcondition_id: operationContract.operation.postcondition.id,
          receipt_id: null,
          outcome: "committed",
          committed_effects: 1,
          authoritative_readback: {},
        },
      }),
    })).rejects.toThrow("v12_native_acceptance_mutation_effect_missing");
  });

  it("fails every operation-result and transaction integrity branch closed", async () => {
    const readContract = v12NativeAcceptanceCaseContract("library-running", "library.exercise-search");
    const readRequest = request({
      shard: "library-running", caseId: readContract.caseId, title: "Library and running",
      source: "PHASE17_CASE_ACTION_CONTRACTS + PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_CONTRACTS",
      requirement: readContract.requirement, action: readContract.actionId,
      readback: readContract.uiReadback.label, sourceProbe: readContract.sourceProbe,
      authorityTables: readContract.probes.post.tables,
    });
    const readOperation = Object.freeze({
      result: "read" as const,
      facts: Object.freeze({
        handler_id: readContract.operation.handlerId,
        postcondition_id: readContract.operation.postcondition.id,
        receipt_id: null,
        outcome: null,
        committed_effects: 0,
        authoritative_readback: Object.freeze({ projection: "case-owned" }),
      }),
    });
    const readFacts = readOperation.facts as Readonly<Record<string, unknown>>;

    await expect(executeV12NativeAcceptanceReadAction({
      kernel: {} as SqliteKernel,
      request: readRequest,
      sha256,
      executeOperation: async () => readOperation,
    }))
      .rejects.toThrow("v12_native_acceptance_snapshot_unavailable");
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel(), request: readRequest, sha256,
      executeOperation: async () => ({ result: "committed", facts: readFacts }),
    })).rejects.toThrow("v12_native_acceptance_operation_result_invalid");
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel(), request: readRequest, sha256,
      executeOperation: async () => ({ result: "read", facts: { ...readFacts, receipt_id: "forbidden-read-receipt" } }),
    })).rejects.toThrow("v12_native_acceptance_operation_result_invalid");
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel(), request: readRequest, sha256,
      executeOperation: async () => ({ result: "read", facts: { ...readFacts, authoritative_readback: undefined } }),
    })).rejects.toThrow("v12_native_acceptance_operation_result_invalid");
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel(), request: readRequest, sha256,
      executeOperation: async () => ({ result: "read", facts: { ...readFacts, authoritative_readback: {} } }),
    })).rejects.toThrow("v12_native_acceptance_operation_result_invalid");
    let digestCall = 0;
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel(), request: readRequest,
      sha256: async (value) => (++digestCall === 6 ? "bad" : sha256(value)),
      executeOperation: async () => readOperation,
    })).rejects.toThrow("v12_native_acceptance_operation_result_invalid");
    await expect(executeV12NativeAcceptanceReadAction({
      kernel: kernel({ snapshotValues: [1, 1, 1, 2, 1] }),
      request: readRequest,
      sha256,
      executeOperation: async () => readOperation,
    }))
      .rejects.toThrow("v12_native_acceptance_operation_result_invalid");

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
    })).rejects.toThrow("v12_native_acceptance_request_required");
    await expect(dispatchV12NativeAcceptanceProductionOperation({
      kernel: kernel({ values: {
        idempotency_key: null, exercise_id: null, exercise_revision: null,
        to_exercise_metric_generation: null, result_json: null,
      } }),
      contract: mutationContract, request: mutationRequest,
    })).rejects.toThrow("v12_native_acceptance_metric_postcondition_failed");
    const favorite = v12NativeAcceptanceCaseContract("library-running", "library.exercise-favorites");
    await expect(dispatchV12NativeAcceptanceProductionOperation({
      kernel: kernel({ values: { mutation_kind: "favorite" } }), contract: favorite,
    })).rejects.toThrow("v12_native_acceptance_request_required");

    const invalidProof = (outcome: "committed" | "already_committed", effects: number) =>
      executeV12NativeAcceptanceReadAction({
        kernel: kernel(), request: mutationRequest, sha256,
        executeOperation: async () => ({
          result: "committed",
          facts: {
            handler_id: mutationContract.operation.handlerId,
            postcondition_id: mutationContract.operation.postcondition.id,
            receipt_id: "durable-migration-receipt",
            outcome,
            committed_effects: effects,
            authoritative_readback: {},
          },
        }),
      });
    await expect(invalidProof("committed", 0))
      .rejects.toThrow("v12_native_acceptance_mutation_effect_missing");
    await expect(invalidProof("already_committed", 1))
      .rejects.toThrow("v12_native_acceptance_operation_result_invalid");
  });
});
