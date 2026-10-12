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
      getCalendarSessionDetail: jest.fn<() => Promise<SessionDetail | null>>(),
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
      ["loadCalendarSessionDetail"],
      ["loadPlannedStrengthOccurrence"],
      ["loadImportedActivityDetail", "loadGarminRevisionReview"],
    ]);
    expect(ports.every(Object.isFrozen)).toBe(true);
    expect(ports.some((port) => "removeHistorySession" in port || "resumePartialWorkout" in port || "resolveGarminRevision" in port)).toBe(false);
  });

  it("loads a Calendar Running plan only when the exact scheduled revision remains a member", async () => {
    const plan = Object.freeze({
      id: "plan-1",
      sessions: Object.freeze([
        Object.freeze({ session: Object.freeze({ id: "session-revision-2", planId: "plan-1" }) }),
      ]),
    }) as unknown as RunningPlanAggregate;
    const loadScheduledSessionPlan = jest.fn(async (planId: string, sessionRevisionId: string) =>
      planId === "plan-1" && sessionRevisionId === "session-revision-2" ? plan : null
    );
    const port = createCalendarRunningPlanReadPort({ loadScheduledSessionPlan });

    await expect(port.loadScheduledSessionPlan("plan-1", "session-revision-2")).resolves.toBe(plan);
    await expect(port.loadScheduledSessionPlan("plan-1", "stale-revision")).resolves.toBeNull();
    await expect(port.loadScheduledSessionPlan("other-plan", "session-revision-2")).resolves.toBeNull();
    expect(loadScheduledSessionPlan).toHaveBeenNthCalledWith(1, "plan-1", "session-revision-2");
    expect(Object.keys(port)).toEqual(["loadScheduledSessionPlan"]);
    expect(Object.isFrozen(port)).toBe(true);
  });
});
