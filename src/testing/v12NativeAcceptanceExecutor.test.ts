import { createHash } from "node:crypto";
import { describe, expect, it } from "@jest/globals";

import type { SqliteKernel, SqliteReadTransactionExecutor } from "../platform/sqlite/sqliteKernel";
import {
  authorityTablesForV12NativeAcceptance,
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

function kernel(options: Readonly<{ drift?: boolean; version?: number | null }> = {}): SqliteKernel {
  let snapshot = 0;
  return {
    readSnapshot: async <Result,>(read: (transaction: SqliteReadTransactionExecutor) => Promise<Result>) => {
      const current = snapshot;
      snapshot += 1;
      return read({
        queryAll: async <Row,>(sql: string): Promise<readonly Row[]> => {
          if (sql === "PRAGMA user_version") return (options.version === null ? [] : [{ user_version: options.version ?? 42 }]) as Row[];
          return [
            { id: "source-row-b", revision: options.drift ? current : 1, nullable: null, enabled: true, values: [1, "two"] },
            { id: "source-row-a", revision: options.drift ? current : 1, nullable: null, enabled: false, values: [2, "one"] },
          ] as Row[];
        },
      });
    },
  } as unknown as SqliteKernel;
}

describe("v1.2 native acceptance SQLite read executor", () => {
  it("binds the nonce and exact case to stable authoritative pre/action/post receipts", async () => {
    const result = await executeV12NativeAcceptanceReadAction({ kernel: kernel(), request: request(), sha256 });

    expect(result.source_receipt).toMatchObject({
      authority: "sqlite-domain-read",
      shard: "workout",
      case_id: "workout.root-identity",
      nonce: "a".repeat(48),
      action_id: "root-identity",
      authority_tables: ["plans", "owned_plan_schedules", "workout_sessions"],
    });
    expect(result.source_receipt.pre).toEqual(result.source_receipt.action);
    expect(result.source_receipt.action).toEqual(result.source_receipt.post);
    expect(result.source_receipt.pre.row_count).toBe(6);
    expect(result.source_receipt.source_receipt_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.ui_readback).toMatchObject({
      case_id: "workout.root-identity",
      nonce: "a".repeat(48),
      source_receipt_sha256: result.source_receipt.source_receipt_sha256,
    });
  });

  it("maps every source family to explicit authority tables and rejects unowned probes", () => {
    expect(authorityTablesForV12NativeAcceptance("multi-plan", "phase13-map01-activation", "ignored"))
      .toEqual(["plans", "owned_plan_schedules", "owned_plan_mutation_requests"]);
    expect(authorityTablesForV12NativeAcceptance("library-running", "library.metric-profile-migration", "metric_profile_migration_events"))
      .toEqual(["metric_profile_migration_events"]);
    for (const caseId of [
      "workout.root-identity", "workout.rest-dock", "workout.trend", "workout.plan-increment",
      "workout.add-exercise", "workout.outcomes", "workout.timing-policy", "workout.set-states",
      "workout.active-layout",
    ]) {
      expect(authorityTablesForV12NativeAcceptance("workout", caseId, "ignored").length).toBeGreaterThan(0);
    }
    expect(() => authorityTablesForV12NativeAcceptance("library-running", "library.unknown", "not_a_probe"))
      .toThrow("v12_native_acceptance_authority_missing");
    expect(validateV12NativeAcceptanceAuthorityTables(undefined)).toBe(false);
    expect(validateV12NativeAcceptanceAuthorityTables([])).toBe(false);
    expect(validateV12NativeAcceptanceAuthorityTables(["../private"])).toBe(false);
    expect(validateV12NativeAcceptanceAuthorityTables(["app_settings"])).toBe(true);
  });

  it("fails closed for wrong nonce, substituted tables, source drift, missing snapshots, and invalid source facts", async () => {
    await expect(executeV12NativeAcceptanceReadAction({ kernel: kernel(), request: request({ nonce: "wrong" }), sha256 }))
      .rejects.toThrow("v12_native_acceptance_request_invalid");
    await expect(executeV12NativeAcceptanceReadAction({ kernel: kernel(), request: request({ authorityTables: ["app_settings"] }), sha256 }))
      .rejects.toThrow("v12_native_acceptance_authority_mismatch");
    await expect(executeV12NativeAcceptanceReadAction({ kernel: kernel({ drift: true }), request: request(), sha256 }))
      .rejects.toThrow("v12_native_acceptance_read_action_drift");
    await expect(executeV12NativeAcceptanceReadAction({ kernel: {} as SqliteKernel, request: request(), sha256 }))
      .rejects.toThrow("v12_native_acceptance_snapshot_unavailable");
    await expect(executeV12NativeAcceptanceReadAction({ kernel: kernel({ version: 0 }), request: request(), sha256 }))
      .rejects.toThrow("v12_native_acceptance_source_state_invalid");
    await expect(executeV12NativeAcceptanceReadAction({ kernel: kernel({ version: null }), request: request(), sha256 }))
      .rejects.toThrow("v12_native_acceptance_source_state_invalid");
    await expect(executeV12NativeAcceptanceReadAction({ kernel: kernel(), request: request(), sha256: async () => "bad" }))
      .rejects.toThrow("v12_native_acceptance_source_state_invalid");
  });
});
