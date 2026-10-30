import { describe, expect, it } from "@jest/globals";
import { PHASE17_CASE_ACTION_CONTRACTS, PHASE17_FAMILY_A_MUTATION_RECEIPTS, PHASE17_LIBRARY_RUNNING_CASES, PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS, PHASE17_REQUIRED_LIBRARY_REQUIREMENTS } from "./phase17LibraryRunning.contract";

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

  it("requires an explicit durable receipt and result comparator for every mutating Family A case", () => {
    const mutatingFamilyA = PHASE17_CASE_ACTION_CONTRACTS.filter(
      ({ id, proofMode }) => proofMode === "mutating" && id.startsWith("library.") && !id.startsWith("library.running-"),
    );
    expect(PHASE17_FAMILY_A_MUTATION_RECEIPTS).toHaveLength(mutatingFamilyA.length);
    expect(new Set(PHASE17_FAMILY_A_MUTATION_RECEIPTS.map(([caseId]) => caseId)))
      .toEqual(new Set(mutatingFamilyA.map(({ id }) => id)));
    for (const [, receiptTable, comparator] of PHASE17_FAMILY_A_MUTATION_RECEIPTS) {
      expect(receiptTable).toMatch(/^[a-z_]+$/u);
      expect(comparator).toMatch(/^[a-z_]+$/u);
    }
  });
});
