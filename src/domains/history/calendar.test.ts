import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  calendarStateForSession,
  historySourceLabel,
  orderedCalendarStates,
} from "./calendar";

describe("history calendar presentation", () => {
  it("labels every source and preserves manual precedence over completed or partial status", () => {
    expect(historySourceLabel("scheduled_day")).toBe("Planned day");
    expect(historySourceLabel("alternate_day")).toBe("Alternate plan day");
    expect(historySourceLabel("rest_day")).toBe("Trained on rest day");
    expect(historySourceLabel("empty")).toBe("Empty workout");
    expect(historySourceLabel("manual")).toBe("Manual visit");

    expect(calendarStateForSession("completed", "manual")).toBe("manual");
    expect(calendarStateForSession("manual_visit", "scheduled_day"))
      .toBe("manual");
    expect(calendarStateForSession("partial", "scheduled_day"))
      .toBe("partial");
    expect(calendarStateForSession("zero_sets", "empty"))
      .toBe("completed");
  });

  it("returns only known calendar states in the UI's stable priority order", () => {
    expect(orderedCalendarStates([
      "today",
      "manual",
      "completed",
      "today",
      "planned_not_completed",
      "partial",
    ])).toEqual([
      "completed",
      "partial",
      "manual",
      "planned_not_completed",
      "today",
    ]);
    expect(orderedCalendarStates([])).toEqual([]);
  });
});
