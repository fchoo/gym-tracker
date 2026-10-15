import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";

import {
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

  it("composes production screens and ports over root-specific SQLite scenarios", () => {
    const source = readFileSync(require.resolve("./phase20QualityInstrumentation"), "utf8");
    for (const symbol of ["TodayScreen", "CalendarScreen", "LibraryScreen", "ProgressScreen", "ActiveWorkoutScreen"]) {
      expect(source).toContain(symbol);
    }
    expect(source).toContain("phase20QualityDatabaseName(request.nonce, root)");
    expect(source).toContain('root === "calendar") await seedPhase20CalendarQualityFixture');
    expect(source).toContain('root === "progress") await seedPhase20ProgressQualityFixture');
    expect(source).toContain('currentPath={displayRoot === "workout" ? "/" : `/${displayRoot}`}');
    expect(source).toContain('onProductCallback("settings-open")');
    expect(source).toContain('productCallback("settings-close")');
    expect(source).toContain('onProductCallback("settings-search-change")');
    expect(source).toContain("seedPhase20QualityWorkloadFixture(kernel)");
    expect(source).toContain("collectPhase20QualitySourceProof");
    expect(source).toContain("<AppTabs");
    expect(source).toContain('onProductCallback("numeric-edit-commit"');
    expect(source).toContain('onProductCallback("rest-adjust-commit"');
    expect(source).toContain('current.rest.state !== "idle"');
    expect(source).toContain("runPhase20HeavyWorkload");
    expect(source).not.toContain("setDisplayRoot(targetRoot)");
    expect(source).not.toContain("openSqliteKernel(phase20QualityDatabaseName(request.nonce))");
    expect(source).not.toContain("PlanTypeChooserScreen");
  });
});
