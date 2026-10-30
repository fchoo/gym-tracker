import { describe, expect, it } from "@jest/globals";
import type { ProgressRecord } from "../../domains/progress/contracts";
import { inspectSyntheticStrengthFixture, progressNativeDiagnosticCode } from "./progressNativeDiagnostics";

const fixture: ProgressRecord = {
  exerciseId: "synthetic-exercise", exerciseName: "Synthetic press", identityKey: "load_reps:1:1", comparatorKey: "identity",
  sessionId: "synthetic-session", setId: "synthetic-set", localDate: "2026-08-24", sourceRevision: 1,
  targetJson: JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 40_000, minReps: 8, maxReps: 10, incrementGrams: 2_500, perSide: false }),
  observationJson: JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 42_500, reps: 8, source: "manual" }),
};

describe("bounded native Progress diagnostics", () => {
  it("uses the real parsers and keeps the exact fixture valid without targetReps", () => {
    const result = inspectSyntheticStrengthFixture(fixture);
    expect(result).toEqual(["identity", "target", "observation"].map(stage => ({ stage, status: "passed", code: "validated" })));
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.every(Object.isFrozen)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(fixture.exerciseName);
  });

  it("retains the exact failed parser stage without continuing or exposing source data", () => {
    for (const identityKey of ["", "load_reps:1:1:extra", "unknown:1:1"]) {
      expect(inspectSyntheticStrengthFixture({ ...fixture, identityKey })).toEqual([{ stage: "identity", status: "failed", code: "metric_identity_invalid" }]);
    }
    expect(inspectSyntheticStrengthFixture({ ...fixture, targetJson: "{" }).at(-1)).toEqual({ stage: "target", status: "failed", code: "metric_json_invalid" });
    expect(inspectSyntheticStrengthFixture({ ...fixture, targetJson: "{}" })).toEqual([
      { stage: "identity", status: "passed", code: "validated" }, { stage: "target", status: "failed", code: "metric_target_invalid" },
    ]);
    expect(inspectSyntheticStrengthFixture({ ...fixture, observationJson: "{}" }).at(-1)).toEqual({ stage: "observation", status: "failed", code: "metric_observation_invalid" });
  });

  it("preserves allowlisted invariant codes and drops all unknown messages and payloads", () => {
    for (const code of ["metric_identity_invalid", "metric_json_invalid", "metric_target_invalid", "metric_observation_invalid", "progress_all_sources_invalid", "progress_strength_projection_invalid", "progress_snapshot_kernel_required"]) {
      expect(progressNativeDiagnosticCode(new Error(code))).toBe(code);
    }
    expect(progressNativeDiagnosticCode(new TypeError("private payload"))).toBe("type_error");
    expect(progressNativeDiagnosticCode(new ReferenceError("private payload"))).toBe("reference_error");
    for (const error of [new Error("private payload"), null, "private payload", { message: "metric_target_invalid" }]) {
      expect(progressNativeDiagnosticCode(error)).toBe("unexpected_error");
    }
  });
});
