import { describe, expect, it } from "@jest/globals";
import {
  MULTI_PLAN_RUNNING_CONTRACT_CASES,
  PHASE13_STATEMENT_FAILURE_CUT,
  runMultiPlanRunningContract,
} from "./multiPlanRunning.contract";

describe("multi-plan Running lifecycle contract", () => {
  it("keeps immutable, unique case IDs for every Phase 13 lifecycle boundary", () => {
    expect(MULTI_PLAN_RUNNING_CONTRACT_CASES).toEqual([
      "phase13-migration-failure-cuts",
      "phase13-map01-activation",
      "phase13-running-two-slots",
      "phase13-strength-completion-retry",
      "phase13-import-normalized-identity",
      "phase13-import-remove-restore",
      "phase13-match-invalidation",
      "phase13-stale-replay-no-resurrection",
      "phase13-bodyweight-correction-delete",
      "phase13-backup-clean-restore",
      "phase13-merge-rebuild",
      "phase13-source-generation-neutrality",
      "phase13-tim01-retirement",
    ]);
    expect(new Set(MULTI_PLAN_RUNNING_CONTRACT_CASES).size).toBe(MULTI_PLAN_RUNNING_CONTRACT_CASES.length);
  });

  it("injects the migration statement failure after the first schema write", () => {
    expect(PHASE13_STATEMENT_FAILURE_CUT).toEqual({ phase: "after", statementIndex: 0 });
  });

  it("dispatches every native lifecycle case independently and preserves only its own failure", async () => {
    const failedId = "phase13-import-remove-restore" as const;
    const calls: string[] = [];
    const result = await runMultiPlanRunningContract({
      async runCase(id) {
        calls.push(id);
        if (id === failedId) throw new Error("phase13_remove_restore_invalid");
      },
    });

    expect(calls).toEqual(MULTI_PLAN_RUNNING_CONTRACT_CASES);
    expect(result).toMatchObject({
      status: "failed",
      total: MULTI_PLAN_RUNNING_CONTRACT_CASES.length,
      passed: MULTI_PLAN_RUNNING_CONTRACT_CASES.length - 1,
      failed: 1,
      skipped: 0,
    });
    expect(result.cases).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: failedId, status: "failed", errorCode: "phase13_remove_restore_invalid" }),
      expect.objectContaining({ id: "phase13-map01-activation", status: "passed" }),
      expect.objectContaining({ id: "phase13-tim01-retirement", status: "passed" }),
    ]));
    expect(result.cases.map(({ id }) => id)).toEqual(MULTI_PLAN_RUNNING_CONTRACT_CASES);
    expect(JSON.stringify(result)).not.toContain("account_namespace");
    expect(JSON.stringify(result)).not.toContain("owner_request");
  });
});
