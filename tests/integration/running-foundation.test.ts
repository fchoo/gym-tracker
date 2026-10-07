// The integration tracer owns the real SQLite setup and schema migration path.
// Re-export its suite here under the stable Phase 13 Running foundation name.
import "./multi-plan-foundation-tracer.test";

import { describe, expect, it } from "@jest/globals";

import { createCollisionDecisionCommand } from "../../src/domains/scheduling/scheduleCommands";
import {
  appendScheduleCollisionDecision,
  transitionSelectedSchedule,
} from "../../src/domains/scheduling/scheduleState";
import { parseLocalDate } from "../../src/domains/scheduling/localDate";
import { parseStoredTimeZone } from "../../src/domains/scheduling/timeZone";

describe("Phase 13 independent schedule collision semantics", () => {
  const strength = Object.freeze({
    id: "strength-opportunity-spring",
    scheduleId: "strength-schedule",
    scheduleVersionId: "strength-v2",
    planId: "strength-plan",
    slotId: "strength-day-a",
    localDate: parseLocalDate("2026-03-08"),
    timeZone: parseStoredTimeZone("America/New_York"),
    revision: 4,
    state: "planned" as const,
  });
  const running = Object.freeze({
    id: "running-opportunity-fall",
    scheduleId: "running-schedule",
    scheduleVersionId: "running-v7",
    planId: "running-plan",
    slotId: "running-slot-2",
    localDate: parseLocalDate("2026-11-01"),
    timeZone: parseStoredTimeZone("Australia/Sydney"),
    revision: 8,
    state: "planned" as const,
  });

  it.each([
    ["move_running", "running"],
    ["move_strength", "strength"],
    ["keep_both", "none"],
  ] as const)("appends %s only for the exact selected future occurrence", (decision, selected) => {
    const command = createCollisionDecisionCommand({
      id: `collision-${decision}`,
      decision,
      occurredAtMs: 1_793_491_200_000,
      strength,
      running,
      prospectiveLocalDate: selected === "none" ? null : parseLocalDate("2026-11-08"),
    });
    const result = appendScheduleCollisionDecision(command);

    expect(result.event).toMatchObject({
      id: `collision-${decision}`,
      decision,
      strengthOpportunityId: strength.id,
      runningOpportunityId: running.id,
    });
    expect(result.prospectiveIntent?.selected).toBe(selected);
    expect(result.prospectiveIntent?.localDate ?? null).toBe(
      selected === "none" ? null : "2026-11-08",
    );
    expect(Object.isFrozen(result.event)).toBe(true);
  });

  it("changes only the selected schedule and preserves the other snapshot byte-for-byte across DST", () => {
    const before = Object.freeze({ strength, running });
    const result = transitionSelectedSchedule({
      schedules: before,
      selected: "strength",
      expectedRevision: strength.revision,
      nextState: "advanced",
    });

    expect(JSON.stringify(result.next.running)).toBe(JSON.stringify(before.running));
    expect(result.next.strength).toMatchObject({
      id: strength.id,
      localDate: "2026-03-08",
      timeZone: "America/New_York",
      revision: 5,
      state: "advanced",
    });
    expect(before.running).toMatchObject({
      localDate: "2026-11-01",
      timeZone: "Australia/Sydney",
      revision: 8,
    });
  });
});
