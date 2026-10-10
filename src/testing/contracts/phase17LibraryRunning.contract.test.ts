import { describe, expect, it } from "@jest/globals";
import { PHASE17_CASE_ACTION_CONTRACTS, PHASE17_LIBRARY_RUNNING_CASES, PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS, PHASE17_REQUIRED_LIBRARY_REQUIREMENTS } from "./phase17LibraryRunning.contract";

describe("Phase 17 Library and Running evidence ledger", () => {
  it("assigns every LIB requirement exactly once to a stable canonical evidence ID", () => {
    expect(PHASE17_REQUIRED_LIBRARY_REQUIREMENTS).toHaveLength(36);
    expect(PHASE17_LIBRARY_RUNNING_CASES).toHaveLength(39);
    expect(new Set(PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS).size).toBe(39);
    for (const number of Array.from({ length: 36 }, (_, index) => index + 1)) {
      const requirement = `LIB-${String(number).padStart(2, "0")}`;
      expect(PHASE17_LIBRARY_RUNNING_CASES.filter((entry) => entry.requirements.includes(requirement))).toHaveLength(1);
    }
  });

  it("makes every bounded ledger case name its exact product action, UI readback, source probe, report and cleanup", () => {
    expect(PHASE17_CASE_ACTION_CONTRACTS).toHaveLength(39);
    expect(new Set(PHASE17_CASE_ACTION_CONTRACTS.map(({ id }) => id))).toEqual(new Set(PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS));
    for (const entry of PHASE17_CASE_ACTION_CONTRACTS) {
      expect(entry.action).toMatch(/^[a-z0-9-]+$/u);
      expect(entry.uiReadback).toMatch(/^[a-z0-9-]+$/u);
      expect(entry.sourceProbe).toMatch(/^[a-z_]+$/u);
      expect(entry.rawReportRequired).toBe(true);
      expect(entry.cleanupRequired).toBe(true);
    }
  });
});
