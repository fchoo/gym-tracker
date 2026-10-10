import {
  PHASE17_LIBRARY_RUNNING_CASES,
  PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS,
  PHASE17_REQUIRED_LIBRARY_REQUIREMENTS,
} from "./phase17LibraryRunning.contract";

describe("Phase 17 Library and Running evidence ledger", () => {
  it("assigns every LIB requirement exactly once to a stable canonical evidence ID", () => {
    expect(PHASE17_REQUIRED_LIBRARY_REQUIREMENTS).toHaveLength(36);
    expect(PHASE17_LIBRARY_RUNNING_CASES).toHaveLength(36);
    expect(new Set(PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS).size).toBe(36);

    for (const number of Array.from({ length: 36 }, (_, index) => index + 1)) {
      const requirement = `LIB-${String(number).padStart(2, "0")}`;
      expect(PHASE17_LIBRARY_RUNNING_CASES.filter((entry) => entry.requirements.includes(requirement))).toHaveLength(1);
    }
  });

  it("requires the neutral, inactive create and recovery matrix without collapsing the seven session forms", () => {
    const cases = new Map(PHASE17_LIBRARY_RUNNING_CASES.map((entry) => [entry.id, entry]));
    for (const id of [
      "library.neutral-plan-chooser",
      "library.running-create-zero-sessions",
      "library.running-create-typed-sessions",
      "library.running-two-same-day-slots",
      "library.running-session-lifecycle",
      "library.accessibility-recovery",
      "library.running-conflict",
    ]) {
      expect(cases.has(id)).toBe(true);
    }

    expect(cases.get("library.running-create-zero-sessions")?.assertions).toEqual(expect.arrayContaining([
      "inactive-after-atomic-commit", "true-empty-after-reopen", "no-source-drift",
    ]));
    expect(cases.get("library.running-create-typed-sessions")?.assertions).toEqual(expect.arrayContaining([
      "seven-typed-session-branches", "one-aggregate-commit", "inactive-after-atomic-commit",
    ]));
    expect(cases.get("library.running-two-same-day-slots")?.assertions).toEqual(expect.arrayContaining([
      "same-weekday-order-retained", "portable-after-reopen", "no-activation",
    ]));
  });
});
