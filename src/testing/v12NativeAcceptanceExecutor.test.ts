import { createHash } from "node:crypto";
import { describe, expect, it } from "@jest/globals";

import type { SqliteKernel, SqliteReadTransactionExecutor, SqliteTransactionExecutor } from "../platform/sqlite/sqliteKernel";
import {
  V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS,
  v12NativeAcceptanceCaseContract,
} from "./contracts/phase15Workout.contract";
import {
  authorityTablesForV12NativeAcceptance,
  dispatchV12NativeAcceptanceProductionOperation,
  executeV12NativeAcceptanceReadAction,
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
}> = {}): SqliteKernel {
  let snapshot = 0;
  let mutationRevision = 1;
  const queryAll = async <Row,>(sql: string): Promise<readonly Row[]> => {
    options.commands?.push(sql);
    if (sql === "PRAGMA user_version") return (options.version === null ? [] : [{ user_version: options.version ?? 42 }]) as Row[];
    if (/SELECT COUNT\(\*\) AS row_count/u.test(sql)) return [{ row_count: 2 }] as Row[];
    const current = snapshot;
    return [
      { id: "source-row-b", revision: options.drift ? current : mutationRevision, nullable: null, enabled: true, values: [1, "two"] },
      { id: "source-row-a", revision: options.drift ? current : mutationRevision, nullable: null, enabled: false, values: [2, "one"] },
    ] as Row[];
  };
  const reader = (): SqliteReadTransactionExecutor => ({ queryAll });
  const writer = (): SqliteTransactionExecutor => ({
    queryAll,
    execute: async (sql: string) => {
      options.commands?.push(sql);
      mutationRevision += 1;
      return { changes: 1, lastInsertRowId: 0 };
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
  executeOperation: ({ contract }) => dispatchV12NativeAcceptanceProductionOperation({ kernel: runtime, contract }),
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
    expect(commands).toContain('SELECT COUNT(*) AS row_count FROM "plans"');
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
      authority_tables: ["metric_profile_migration_events"],
    });
    expect(result.source_receipt.pre.facts_sha256).not.toBe(result.source_receipt.post.facts_sha256);
    expect(commands).toContain('SELECT COUNT(*) AS row_count FROM "metric_profile_migration_events"');
    expect(commands).toContain('UPDATE "metric_profile_migration_events" SET rowid = rowid WHERE rowid = (SELECT MIN(rowid) FROM "metric_profile_migration_events")');
    expect(commands.some((sql) => sql.includes("app_settings"))).toBe(false);
  });

  it("maps source families to exact authority tables and rejects unowned probes", () => {
    expect(authorityTablesForV12NativeAcceptance("multi-plan", "phase13-map01-activation", "multi-plan-running:phase13-map01-activation"))
      .toEqual(["plans", "owned_plan_schedules", "owned_plan_mutation_requests"]);
    expect(authorityTablesForV12NativeAcceptance("library-running", "library.metric-profile-migration", "metric_profile_migration_events"))
      .toEqual(["metric_profile_migration_events"]);
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
});
