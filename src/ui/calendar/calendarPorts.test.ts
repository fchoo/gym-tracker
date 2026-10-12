import { describe, expect, it, jest } from "@jest/globals";

import { parseLocalDate } from "../../domains/scheduling/localDate";
import type { PlannedStrengthOccurrenceDetail } from "../../domains/workout";
import type { WorkoutPresentationModel } from "../../domains/workout/workoutPresentation";
import { WorkoutSessionPresentation } from "../components/WorkoutSessionPresentation";
import {
  CalendarWorkoutSessionPresentation,
  type CalendarEvent,
  type CalendarReadPort,
  type CalendarWorkoutPresentationModel,
} from "./calendarPorts";

describe("Calendar capability ports", () => {
  it("narrows the foundation runtime to bounded calendar reads and the exact stale-safe Strength occurrence loader", async () => {
    const occurrence: PlannedStrengthOccurrenceDetail = Object.freeze({
      occurrenceId: "strength-occurrence", planId: "strength-plan", planDayId: "day-1", scheduleId: "schedule-1",
      scheduleVersionId: "version-1", localDate: "2026-11-01", timezone: "Asia/Singapore",
      sourceRevisions: Object.freeze({ plan: 1, day: 1, schedule: 1 }), exercises: Object.freeze([]),
    });
    const calendar: CalendarReadPort = Object.freeze({
      loadCalendarRange: jest.fn(async () => Object.freeze({ events: Object.freeze([]) })),
      loadPlannedStrengthOccurrence: jest.fn(async (occurrenceId: string) => occurrenceId === occurrence.occurrenceId ? occurrence : null),
    });

    await expect(calendar.loadPlannedStrengthOccurrence("strength-occurrence")).resolves.toBe(occurrence);
    await expect(calendar.loadPlannedStrengthOccurrence("stale-occurrence")).resolves.toBeNull();
    await expect(calendar.loadCalendarRange({
      startLocalDate: "2026-11-01", endLocalDateExclusive: "2026-11-02",
    })).resolves.toEqual({ events: [] });
  });

  it("retains the immutable source event destination union and the command-free presentation model", () => {
    const event: CalendarEvent = Object.freeze({
      id: "imported-run", source: "imported_activity", sport: "running", status: "imported",
      title: "Outdoor run", sourceLabel: "garmin_connect_account:owner-a", localDate: parseLocalDate("2026-11-01"),
      timeZone: "Asia/Singapore", scheduleId: null, scheduleVersionId: null, planId: null, slotId: null,
      revision: null, state: "imported", destination: Object.freeze({ kind: "activity", activityId: "imported-run" }),
    });
    const model = null as unknown as WorkoutPresentationModel;
    const calendarModel: CalendarWorkoutPresentationModel = model;

    expect(event.destination).toEqual({ kind: "activity", activityId: "imported-run" });
    expect(Object.isFrozen(event.destination)).toBe(true);
    expect(calendarModel).toBe(model);
    expect(CalendarWorkoutSessionPresentation).toBe(WorkoutSessionPresentation);
  });
});
