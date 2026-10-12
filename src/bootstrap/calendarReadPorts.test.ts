import { describe, expect, it, jest } from "@jest/globals";

import type { ImportedActivityDetailReadResult } from "../domains/activities/activityDetails";
import type { RunningPlanAggregate } from "../domains/running/contracts";
import type { PlannedStrengthOccurrenceDetail, SessionDetail } from "../domains/workout";
import type { TrainingCalendarRange } from "../platform/sqlite/repositories/trainingCalendarRepository";
import {
  createCalendarActivityReadPort,
  createCalendarRangeReadPort,
  createCalendarRunningPlanReadPort,
  createCalendarSessionReadPort,
  createCalendarStrengthOccurrenceReadPort,
} from "./calendarReadPorts";

describe("production Calendar read capabilities", () => {
  it("freezes one-purpose ports without forwarding mutation authority", () => {
    const source = {
      loadCalendarRange: jest.fn<() => Promise<TrainingCalendarRange>>(),
      getSessionDetail: jest.fn<() => Promise<SessionDetail>>(),
      loadPlannedStrengthOccurrence: jest.fn<() => Promise<PlannedStrengthOccurrenceDetail | null>>(),
      loadImportedActivityDetail: jest.fn<() => Promise<ImportedActivityDetailReadResult>>(),
      loadGarminRevisionReview: jest.fn(async () => null),
      removeHistorySession: jest.fn(),
      resumePartialWorkout: jest.fn(),
      resolveGarminRevision: jest.fn(),
    };

    const ports = [
      createCalendarRangeReadPort(source),
      createCalendarSessionReadPort(source),
      createCalendarStrengthOccurrenceReadPort(source),
      createCalendarActivityReadPort(source),
    ];

    expect(ports.map((port) => Object.keys(port))).toEqual([
      ["loadCalendarRange"],
      ["getSessionDetail"],
      ["loadPlannedStrengthOccurrence"],
      ["loadImportedActivityDetail", "loadGarminRevisionReview"],
    ]);
    expect(ports.every(Object.isFrozen)).toBe(true);
    expect(ports.some((port) => "removeHistorySession" in port || "resumePartialWorkout" in port || "resolveGarminRevision" in port)).toBe(false);
  });

  it("freezes the one-purpose Running read port without lifecycle commands", () => {
    const loadPlan = jest.fn<(planId: string) => Promise<RunningPlanAggregate | null>>();
    const port = createCalendarRunningPlanReadPort({ loadPlan });

    expect(Object.keys(port)).toEqual(["loadPlan"]);
    expect(Object.isFrozen(port)).toBe(true);
  });
});
