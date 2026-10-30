import { describe, expect, it } from "@jest/globals";

import {
  createPhase20QualityRuntimeDependencies,
  phase20QualityEnabled,
  resolvePhase20QualityRequest,
} from "./phase20QualityInstrumentation";

const enabled = {
  buildProfile: "development-test",
  nativeContractsEnabled: true,
  nativeContractSuite: "v1.2-acceptance",
};

describe("Phase 20 quality instrumentation contract", () => {
  it("requires the exact development-test v1.2 acceptance gate", () => {
    expect(phase20QualityEnabled(enabled)).toBe(true);
    expect(phase20QualityEnabled({ ...enabled, buildProfile: "production" })).toBe(false);
    expect(phase20QualityEnabled({ ...enabled, nativeContractsEnabled: false })).toBe(false);
    expect(phase20QualityEnabled({ ...enabled, nativeContractSuite: "phase14" })).toBe(false);
  });

  it("accepts only nonce-bound quality actions", () => {
    expect(resolvePhase20QualityRequest({ nonce: "a".repeat(48), action: "accessibility", operation: "accessibility-workout-normal", sequence: "1" })).toEqual({ nonce: "a".repeat(48), action: "accessibility", operation: "accessibility-workout-normal", sequence: 1 });
    expect(resolvePhase20QualityRequest({ nonce: "a".repeat(47), action: "accessibility", operation: "accessibility-workout-normal", sequence: "1" })).toBeNull();
    expect(resolvePhase20QualityRequest({ nonce: "a".repeat(48), action: "release", operation: "accessibility-workout-normal", sequence: "1" })).toBeNull();
  });

  it("uses the strict isolated runtime contract for quality scenarios", () => {
    const dependencies = createPhase20QualityRuntimeDependencies(
      "gym-tracker-phase20-quality-test.db",
      "calendar",
    );

    expect(dependencies.strictDisposal).toBe(true);
    expect(dependencies.prepareRuntime).toEqual(expect.any(Function));
    expect(dependencies.createAutomaticBackupRuntime).toBeUndefined();
    expect(dependencies.createAutomaticBackupScheduler).toBeUndefined();
    expect(dependencies.createBackupCommands).toBeUndefined();
    expect(dependencies.createCsvExportRepository).toBeUndefined();
    expect(dependencies.createCsvFiles).toBeUndefined();
    expect(dependencies.createMergeCommands).toBeUndefined();
    expect(dependencies.createRestoreCommands).toBeUndefined();
    expect(dependencies.reconcileRestore).toBeUndefined();
  });
});
