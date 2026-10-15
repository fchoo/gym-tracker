import { describe, expect, it, jest } from "@jest/globals";

import {
  V12_RECOVERY_CASES,
  V12_RECOVERY_SCENARIOS,
  V12_RECOVERY_CUTS,
  V12_RECOVERY_CUT_DEFINITIONS,
  runV12RecoveryContract,
  type V12RecoveryContractSnapshot,
} from "./v12Recovery.contract";

function snapshot(receiptCount: number, digest: string): V12RecoveryContractSnapshot {
  return {
    sourceCount: receiptCount,
    receiptCount,
    sourceDigest: digest.repeat(64),
    receiptDigest: digest.repeat(64),
  };
}

describe("v1.2 recovery host contract", () => {
  it("names eight causal scenarios and eight distinct host barriers", () => {
    expect(V12_RECOVERY_SCENARIOS).toEqual([
      { id: "legacy-playback", operationId: "tim01-legacy-playback", boundaryIds: ["start", "edit"] },
      { id: "foreground-reconciliation", operationId: "tim01-foreground-reconciliation", boundaryIds: ["rest"] },
      { id: "queued-callback", operationId: "tim01-queued-callback", boundaryIds: ["commit"] },
      { id: "relaunch", operationId: "workout-relaunch-replay", boundaryIds: ["finish"] },
      { id: "restore", operationId: "secure-restore", boundaryIds: ["restore", "import"] },
      { id: "merge", operationId: "secure-merge", boundaryIds: ["merge", "match"] },
      { id: "zero-cue", operationId: "tim01-zero-cue", boundaryIds: ["start", "edit", "finish"] },
      { id: "between-set-rest-pointer", operationId: "workout-rest-set-pointer", boundaryIds: ["commit", "rest"] },
    ]);
    expect(new Set(V12_RECOVERY_SCENARIOS.map(({ operationId }) => operationId)).size).toBe(8);
    expect(new Set(V12_RECOVERY_SCENARIOS.flatMap(({ boundaryIds }) => boundaryIds)))
      .toEqual(new Set(["start", "edit", "commit", "rest", "finish", "import", "match", "restore", "merge"]));
    expect(V12_RECOVERY_CUT_DEFINITIONS.map(({ barrierId }) => barrierId)).toEqual([
      "before-transaction", "writer-transaction-open", "commit-durable-ack-pending",
      "acknowledgement-observed", "replay-process-open", "first-attempt-failed",
      "post-boundary-offline", "domain-reconciliation-pending",
    ]);
    expect(new Set(V12_RECOVERY_CUT_DEFINITIONS.map(({ barrierId }) => barrierId)).size).toBe(8);
  });

  it("derives all 64 outcomes from reopen and retry facts without accepting app status", async () => {
    const observe = jest.fn(async (
      definition: (typeof V12_RECOVERY_CASES)[number],
      cut: (typeof V12_RECOVERY_CUTS)[number],
    ) => {
      const uncommitted = cut === "pre-transaction" || cut === "in-transaction";
      return {
        caseId: definition.id,
        cutId: cut,
        afterReopen: uncommitted ? snapshot(0, "a") : snapshot(1, "b"),
        afterRetry: snapshot(1, "b"),
      };
    });

    const result = await runV12RecoveryContract({ observe });

    expect(observe).toHaveBeenCalledTimes(64);
    expect(result).toMatchObject({
      status: "passed",
      total: 64,
      passed: 64,
      failed: 0,
      skipped: 0,
    });
    expect(result.cases).toHaveLength(8);
    expect(result.cases.every(({ cuts }) => cuts.length === 8)).toBe(true);
  });

  it("fails forged committed, rollback, identity, and thrown observations", async () => {
    const result = await runV12RecoveryContract({
      observe: async (definition, cut) => {
        if (definition.id === "legacy-playback" && cut === "pre-transaction") {
          throw new Error("private details stay outside the result");
        }
        if (definition.id === "foreground-reconciliation" && cut === "in-transaction") {
          return {
            caseId: "wrong",
            cutId: cut,
            afterReopen: snapshot(0, "a"),
            afterRetry: snapshot(1, "b"),
          };
        }
        if (definition.id === "queued-callback" && cut === "post-commit-before-ack") {
          return {
            caseId: definition.id,
            cutId: cut,
            afterReopen: snapshot(0, "a"),
            afterRetry: snapshot(1, "b"),
          };
        }
        const uncommitted = cut === "pre-transaction" || cut === "in-transaction";
        return {
          caseId: definition.id,
          cutId: cut,
          afterReopen: uncommitted ? snapshot(0, "a") : snapshot(1, "b"),
          afterRetry: snapshot(1, "b"),
        };
      },
    });

    expect(result).toMatchObject({ status: "failed", total: 64, passed: 61, failed: 3 });
    expect(result.cases.flatMap(({ cuts }) => cuts).filter(({ status }) => status === "failed"))
      .toHaveLength(3);
  });
});
