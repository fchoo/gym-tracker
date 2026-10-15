import { describe, expect, it, jest } from "@jest/globals";

import {
  V12_RECOVERY_CASES,
  V12_RECOVERY_SCENARIOS,
  V12_RECOVERY_STEPS,
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
    receiptKinds: receiptCount === 0 ? [] : ["set-completion"],
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
  step: (typeof V12_RECOVERY_STEPS)[number],
  cut: (typeof V12_RECOVERY_CUTS)[number],
  receiptSeed: string,
) {
  const cutDefinition = V12_RECOVERY_CUT_DEFINITIONS.find(({ id }) => id === cut)!;
  const uncommitted = cut === "pre-transaction" || cut === "in-transaction" || cut === "retry";
  const before = snapshot(0, "a");
  const committed = { ...snapshot(1, "b"), receiptKinds: [step.receiptKind] };
  const afterCut = uncommitted ? before : committed;
  const afterReopen = uncommitted ? before : afterCut;
  return {
    caseId: definition.id,
    stepId: step.id,
    cutId: cut,
    operationId: step.operationId,
    boundaryId: step.boundaryId,
    receiptKind: step.receiptKind,
    barrierId: cutDefinition.barrierId,
    barrierProvenance: cutDefinition.provenance,
    firstAttempt: cutDefinition.firstAttempt,
    before,
    afterCut,
    afterReopen,
    recoveryCode: cut === "recovery" ? "domain-reconciled" : "not-required",
    afterRecovery: afterReopen,
    retryCode: uncommitted ? "committed" : "replayed",
    afterRetry: committed,
    receiptDigest: receiptSeed.padStart(64, "0"),
  };
}

describe("v1.2 recovery host contract", () => {
  it("names eight causal scenarios and eight distinct host barriers", () => {
    expect(V12_RECOVERY_SCENARIOS.map(({ id }) => id)).toEqual([
      "legacy-playback", "foreground-reconciliation", "queued-callback", "relaunch",
      "restore", "merge", "zero-cue", "between-set-rest-pointer",
    ]);
    const steps = V12_RECOVERY_STEPS;
    expect(new Set(steps.map(({ operationId }) => operationId)).size).toBe(14);
    expect(new Set(steps.map(({ boundaryId }) => boundaryId)))
      .toEqual(new Set(["start", "edit", "commit", "rest", "finish", "import", "match", "restore", "merge"]));
    expect(V12_RECOVERY_CUT_DEFINITIONS.map(({ barrierId }) => barrierId)).toEqual([
      "before-transaction", "writer-transaction-open", "commit-durable-ack-pending",
      "acknowledgement-observed", "relaunch-runtime-open", "first-attempt-failed",
      "offline-toggle-before-commit", "recovery-replay-writer-open",
    ]);
    expect(new Set(V12_RECOVERY_CUT_DEFINITIONS.map(({ barrierId }) => barrierId)).size).toBe(8);
  });

  it("declares every required boundary as an explicit command step", () => {
    const steps = V12_RECOVERY_STEPS;
    expect(steps).toHaveLength(14);
    expect(steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ boundaryId: "start", receiptKind: "workout-start" }),
      expect.objectContaining({ boundaryId: "edit", receiptKind: "workout-edit" }),
      expect.objectContaining({ boundaryId: "finish", receiptKind: "workout-finish" }),
      expect.objectContaining({ boundaryId: "import", receiptKind: "garmin-import" }),
      expect.objectContaining({ boundaryId: "match", receiptKind: "activity-match" }),
      expect.objectContaining({ boundaryId: "restore", receiptKind: "secure-restore" }),
      expect.objectContaining({ boundaryId: "merge", receiptKind: "secure-merge" }),
    ]));
    expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length);
  });

  it("records eight unique protocol provenances for the host actions", () => {
    const provenances = V12_RECOVERY_CUT_DEFINITIONS.map(({ provenance }) => provenance);
    expect(provenances.every((value) => typeof value === "string" && value.length > 0)).toBe(true);
    expect(new Set(provenances).size).toBe(8);
  });

  it("derives all 64 outcomes from reopen and retry facts without accepting app status", async () => {
    const observe = jest.fn(async (
      definition: (typeof V12_RECOVERY_CASES)[number],
      step: (typeof V12_RECOVERY_STEPS)[number],
      cut: (typeof V12_RECOVERY_CUTS)[number],
    ) => {
      const index = V12_RECOVERY_STEPS.indexOf(step) * V12_RECOVERY_CUTS.length
        + V12_RECOVERY_CUTS.indexOf(cut) + 1;
      return observation(definition, step, cut, index.toString(16));
    });

    const result = await runV12RecoveryContract({ observe });

    expect(observe).toHaveBeenCalledTimes(112);
    expect(result).toMatchObject({
      status: "passed",
      total: 112,
      passed: 112,
      failed: 0,
      skipped: 0,
    });
    expect(result.cases).toHaveLength(8);
    expect(result.cases.map(({ cuts }) => cuts.length)).toEqual([16, 8, 8, 8, 16, 16, 24, 16]);
  });

  it("fails forged committed, rollback, identity, and thrown observations", async () => {
    const result = await runV12RecoveryContract({
      observe: async (definition, step, cut) => {
        if (definition.id === "legacy-playback" && step.id === "legacy-start" && cut === "pre-transaction") {
          throw new Error("private details stay outside the result");
        }
        const index = V12_RECOVERY_STEPS.indexOf(step) * V12_RECOVERY_CUTS.length
          + V12_RECOVERY_CUTS.indexOf(cut) + 1;
        const value = observation(definition, step, cut, index.toString(16));
        if (definition.id === "foreground-reconciliation" && cut === "in-transaction") {
          return { ...value, caseId: "wrong" };
        }
        if (definition.id === "queued-callback" && cut === "post-commit-before-ack") {
          return { ...value, afterReopen: snapshot(0, "a") };
        }
        return value;
      },
    });

    expect(result).toMatchObject({ status: "failed", total: 112, passed: 109, failed: 3 });
    expect(result.cases.flatMap(({ cuts }) => cuts).filter(({ status }) => status === "failed"))
      .toHaveLength(3);
  });
});
