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
    effectCount: receiptCount,
    pointerCount: 1,
    restCount: receiptCount,
    historyCount: 1,
    timingCount: 1,
    restoreCount: 1,
    mergeReceiptCount: receiptCount,
    cueCount: 0,
    sourceDigest: digest.repeat(64),
    receiptDigest: digest.repeat(64),
    effectDigest: digest.repeat(64),
    pointerDigest: digest.repeat(64),
    restDigest: digest.repeat(64),
    historyDigest: digest.repeat(64),
    timingDigest: digest.repeat(64),
    restoreDigest: digest.repeat(64),
    mergeReceiptDigest: digest.repeat(64),
    cueDigest: digest.repeat(64),
  };
}

function observation(
  definition: (typeof V12_RECOVERY_CASES)[number],
  cut: (typeof V12_RECOVERY_CUTS)[number],
  receiptSeed: string,
) {
  const cutDefinition = V12_RECOVERY_CUT_DEFINITIONS.find(({ id }) => id === cut)!;
  const uncommitted = cut === "pre-transaction" || cut === "in-transaction" || cut === "retry";
  const before = snapshot(0, "a"); const afterCut = uncommitted ? before : snapshot(1, "b");
  const afterReopen = uncommitted ? before : afterCut;
  return {
    caseId: definition.id,
    cutId: cut,
    operationId: definition.operationId,
    boundaryIds: definition.boundaryIds,
    barrierId: cutDefinition.barrierId,
    firstAttempt: cutDefinition.firstAttempt,
    before,
    afterCut,
    afterReopen,
    recoveryCode: cut === "recovery" ? "domain-reconciled" : "not-required",
    afterRecovery: afterReopen,
    retryCode: uncommitted ? "committed" : "replayed",
    afterRetry: snapshot(1, "b"),
    receiptDigest: receiptSeed.padStart(64, "0"),
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
      const index = V12_RECOVERY_CASES.indexOf(definition) * V12_RECOVERY_CUTS.length
        + V12_RECOVERY_CUTS.indexOf(cut) + 1;
      return observation(definition, cut, index.toString(16));
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
        const index = V12_RECOVERY_CASES.indexOf(definition) * V12_RECOVERY_CUTS.length
          + V12_RECOVERY_CUTS.indexOf(cut) + 1;
        const value = observation(definition, cut, index.toString(16));
        if (definition.id === "foreground-reconciliation" && cut === "in-transaction") {
          return { ...value, caseId: "wrong" };
        }
        if (definition.id === "queued-callback" && cut === "post-commit-before-ack") {
          return { ...value, afterReopen: snapshot(0, "a") };
        }
        return value;
      },
    });

    expect(result).toMatchObject({ status: "failed", total: 64, passed: 61, failed: 3 });
    expect(result.cases.flatMap(({ cuts }) => cuts).filter(({ status }) => status === "failed"))
      .toHaveLength(3);
  });
});
