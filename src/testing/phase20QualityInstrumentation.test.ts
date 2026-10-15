import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";

import {
  collectPhase20QualityObservation,
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

  it("uses controlled native measurement seams and rejects absent or undersampled measurements", () => {
    const complete = collectPhase20QualityObservation({
      now: (() => { let n = 10; return () => ++n; })(),
      layout: () => ({ width: 390, height: 844, density: 3, fontScale: 2, imeTop: 600, imeBottom: 844 }),
      semantics: () => [
        { id: "strength", name: "Strength", role: "radio", state: "unselected", nonColorCue: true, left: 12, top: 100, width: 366, height: 56 },
        { id: "running", name: "Running", role: "radio", state: "unselected", nonColorCue: true, left: 12, top: 168, width: 366, height: 56 },
      ],
      frame: () => ({ workMs: 1, missedFrames: 0, refreshRateHz: 60, profilerOverheadMs: 0.1 }),
    });
    expect(complete.configuration.font_scale).toBe(2);
    expect(complete.targets).toHaveLength(2);
    expect(complete.frames).toHaveLength(100);
    expect(() => collectPhase20QualityObservation({
      now: () => 1, layout: () => null, semantics: () => [], frame: () => null,
    })).toThrow("phase20_quality_measurement_missing");
    expect(() => collectPhase20QualityObservation({
      now: () => 1,
      layout: () => ({ width: 390, height: 844, density: 3, fontScale: 2, imeTop: 600, imeBottom: 844 }),
      semantics: () => [], frame: () => ({ workMs: 1, missedFrames: 0, refreshRateHz: 60, profilerOverheadMs: 0 }),
    })).toThrow("phase20_quality_semantics_missing");
  });

  it("composes the production roots and existing SQLite benchmark producers", () => {
    const source = readFileSync(require.resolve("./phase20QualityInstrumentation"), "utf8");
    for (const symbol of ["TodayScreen", "CalendarScreen", "LibraryScreen", "ProgressScreen", "ActiveWorkoutScreen"]) {
      expect(source).toContain(symbol);
    }
    expect(source).toContain("openSqliteKernel(databaseName)");
    expect(source).toContain("runPhase20HeavyWorkload");
    expect(source).toContain("seedPhase20ProgressQualityFixture");
    expect(source).not.toContain("PlanTypeChooserScreen");
  });
});
