import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  calendarStateForSession,
  historyProgress,
  orderedCalendarStates,
  parseHistoryLocalDate,
} from "./index";

describe("history contracts", () => {
  it("preserves civil dates and reports factual completion percentages", () => {
    expect(parseHistoryLocalDate("2026-08-24")).toBe("2026-08-24");
    expect(historyProgress(2, 3)).toEqual({
      completed: 2,
      planned: 3,
      percent: 67,
    });
    expect(historyProgress(0, 0)).toEqual({
      completed: 0,
      planned: 0,
      percent: null,
    });
  });

  it("makes calendar state explicit and stable when several facts share a date", () => {
    expect(calendarStateForSession("partial", "scheduled_day"))
      .toBe("partial");
    expect(calendarStateForSession("completed", "manual"))
      .toBe("manual");
    expect(orderedCalendarStates([
      "today",
      "manual",
      "completed",
      "completed",
      "planned_not_completed",
    ])).toEqual([
      "completed",
      "manual",
      "planned_not_completed",
      "today",
    ]);
  });

  it.each([
    [-1, 1],
    [2, 1],
    [1.5, 2],
  ])("rejects invalid factual progress %s/%s", (completed, planned) => {
    expect(() => historyProgress(completed, planned)).toThrow(
      "history_progress_invalid",
    );
  });
});
