import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  calendarDayAccessibilityLabel,
  calendarDayPresentation,
  calendarStateForSession,
  historySourceLabel,
  orderedCalendarEvents,
  orderedCalendarStates,
} from "./calendar";
import type { CalendarEvent } from "../../ui/calendar/calendarPorts";

const events = [
  Object.freeze({ id: "first", title: "Full Body A", sport: "strength", status: "completed", sourceLabel: "Strength", localDate: "2026-08-24", destination: Object.freeze({ kind: "session", sessionId: "session-1" }) }),
  Object.freeze({ id: "second", title: "Easy run", sport: "running", status: "planned", sourceLabel: "Recovery", localDate: "2026-08-24", destination: Object.freeze({ kind: "plan", planId: "plan-1", sessionId: "revision-1" }) }),
  Object.freeze({ id: "third", title: "Outdoor run", sport: "running", status: "imported", sourceLabel: "Garmin", localDate: "2026-08-24", destination: Object.freeze({ kind: "activity", activityId: "activity-1" }) }),
] as unknown as readonly CalendarEvent[];

describe("history calendar presentation", () => {
  it("preserves every source event identity while deriving bounded visual and complete semantic forms", () => {
    expect(orderedCalendarEvents(events).map(({ id }) => id)).toEqual(["first", "second", "third"]);
    expect(calendarDayPresentation(events)).toEqual({ visualEvents: events.slice(0, 2), overflowCount: 1 });
    expect(calendarDayAccessibilityLabel({
      date: "24 August 2026",
      events,
      isOutsideMonth: false,
      isSelected: true,
      isToday: true,
    })).toBe("24 August 2026. today. 3 scheduled or imported events. Full Body A. Strength. Complete. Strength. Easy run. Running. Planned. Recovery. Outdoor run. Running. Complete. Garmin. selected");
    expect(calendarDayAccessibilityLabel({
      date: "25 August 2026",
      events: [],
      isOutsideMonth: false,
      isRest: true,
      isSelected: false,
      isToday: false,
    })).toBe("25 August 2026. Rest day. No workout");
  });
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
