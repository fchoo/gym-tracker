import {
  selectStrengthOccurrence,
  type StrengthOccurrenceContext,
} from "./activePlanSelection";

describe("selectStrengthOccurrence", () => {
  const occurrence = (id: string): StrengthOccurrenceContext => ({
    kind: "strength",
    opportunityId: id,
    planId: `plan-${id}`,
    planDayId: `day-${id}`,
    scheduleId: `schedule-${id}`,
    scheduleVersionId: `version-${id}`,
    localDate: "2026-10-07",
    timeZone: "Asia/Singapore",
    sourceRevisions: {
      plan: 3,
      day: 2,
      schedule: 5,
      opportunity: 1,
    },
  });

  it("selects one exact Strength occurrence without changing its provenance", () => {
    expect(selectStrengthOccurrence({
      contexts: [occurrence("one")],
      opportunityId: "one",
    })).toEqual(occurrence("one"));
  });

  it("rejects an absent or ambiguous selection instead of picking the first row", () => {
    expect(() => selectStrengthOccurrence({ contexts: [occurrence("one")] }))
      .toThrow("selected_strength_occurrence_ambiguous");
    expect(() => selectStrengthOccurrence({
      contexts: [occurrence("one"), occurrence("two")],
      opportunityId: "missing",
    })).toThrow("selected_strength_occurrence_unavailable");
  });
});
