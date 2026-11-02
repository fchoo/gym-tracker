import { describe, expect, it } from "@jest/globals";

import {
  V12_ACCEPTANCE_BENCHMARK_MARKER,
  createV12AcceptanceBenchmark,
} from "../../bootstrap/v12AcceptanceBenchmark";
import {
  V12_RECOVERY_CASES,
  V12_RECOVERY_CUT_DEFINITIONS,
  V12_RECOVERY_CUTS,
  V12_RECOVERY_STEPS,
  V12_RECOVERY_UNCOMMITTED_CUTS,
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

describe("Phase 20 coverage gate branches", () => {
  it("covers disabled, duplicate, missing, mismatched, and successful benchmark boundaries", () => {
    const disabled = createV12AcceptanceBenchmark({ enabled: false, now: () => { throw new Error("disabled clock"); } });
    disabled.markSetActivation();
    disabled.markInputStart("rest-control");
    disabled.markInputVisible("rest-control");
    disabled.markSearchDebounceEnded();
    disabled.markSearchResultsVisible();
    disabled.markProgressStart("targeted-rebuild");
    disabled.markProgressVisible("targeted-rebuild");

    const times = Array.from({ length: 20 }, (_, index) => index + 1);
    const benchmark = createV12AcceptanceBenchmark({ enabled: true, now: () => times.shift()! });
    benchmark.markSetActivation();
    expect(() => benchmark.markSetActivation()).toThrow("v12_benchmark_set_activation_duplicate");
    benchmark.markAuthoritativeSetCommit();
    benchmark.markVisibleDock();
    expect(() => benchmark.markInputVisible("numeric-edit")).toThrow("v12_benchmark_input_missing");
    benchmark.markInputStart("numeric-edit");
    expect(() => benchmark.markInputStart("rest-control")).toThrow("v12_benchmark_input_duplicate");
    expect(() => benchmark.markInputVisible("rest-control")).toThrow("v12_benchmark_input_missing");
    benchmark.markInputVisible("numeric-edit");
    expect(() => benchmark.markSearchResultsVisible()).toThrow("v12_benchmark_search_missing");
    benchmark.markSearchDebounceEnded();
    expect(() => benchmark.markSearchDebounceEnded()).toThrow("v12_benchmark_search_duplicate");
    benchmark.markSearchResultsVisible();
    expect(() => benchmark.markProgressVisible("useful-content")).toThrow("v12_benchmark_progress_missing");
    benchmark.markProgressStart("targeted-rebuild");
    expect(() => benchmark.markProgressStart("review-open")).toThrow("v12_benchmark_progress_duplicate");
    expect(() => benchmark.markProgressVisible("review-open")).toThrow("v12_benchmark_progress_missing");
    benchmark.markProgressVisible("targeted-rebuild");
    expect(benchmark.result()).toMatchObject({
      marker: V12_ACCEPTANCE_BENCHMARK_MARKER,
      input_response_ms: { "numeric-edit": [1], "rest-control": [] },
      search_after_debounce_ms: [1],
      progress_ms: { "targeted-rebuild": [1] },
    });

    const committed = createV12AcceptanceBenchmark({ enabled: true, now: () => 1 });
    committed.markAuthoritativeSetCommit();
    expect(() => committed.markSetActivation()).toThrow("v12_benchmark_set_activation_duplicate");
  });

  it("records the privacy-safe zero digest when an otherwise valid recovery receipt digest is malformed", async () => {
    let index = 0;
    const result = await runV12RecoveryContract({
      observe: async (definition, step, cut) => {
        const cutDefinition = V12_RECOVERY_CUT_DEFINITIONS.find(({ id }) => id === cut)!;
        const uncommitted = V12_RECOVERY_UNCOMMITTED_CUTS.includes(cut as (typeof V12_RECOVERY_UNCOMMITTED_CUTS)[number]);
        const before = snapshot(0, "a");
        const afterCommit = { ...snapshot(1, "b"), receiptKinds: [step.receiptKind] };
        const afterCut = uncommitted ? before : afterCommit;
        const afterReopen = uncommitted ? before : afterCut;
        const current = index++;
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
          afterRetry: afterCommit,
          receiptDigest: current === 0 ? "malformed" : current.toString(16).padStart(64, "0"),
        };
      },
    });

    expect(V12_RECOVERY_CASES).toHaveLength(8);
    expect(V12_RECOVERY_STEPS).toHaveLength(14);
    expect(V12_RECOVERY_CUTS).toHaveLength(8);
    expect(result).toMatchObject({ status: "failed", total: 112, passed: 111, failed: 1, skipped: 0 });
    expect(result.cases[0]!.cuts[0]).toEqual(expect.objectContaining({ status: "failed", digest: "0".repeat(64) }));
  });
});
