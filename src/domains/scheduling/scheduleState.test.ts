import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  parseLocalDate,
  type LocalDate,
} from "./localDate";
import {
  FOLLOW_DEVICE_TIMEZONE_LABEL,
  KEEP_CURRENT_TIMEZONE_LABEL,
  consumeDateOverride,
  resolveWeekdayPlanDay,
  transitionDateOverride,
  transitionRotation,
  transitionTimeZoneChoice,
  transitionWeekdayOpportunity,
  type PendingScheduleOpportunityV1,
  type RotationScheduleStateV1,
  type ScheduleDateOverrideV1,
  type ScheduleTimeZoneStateV1,
} from "./scheduleState";
import { parseStoredTimeZone } from "./timeZone";

const monday = parseLocalDate("2026-08-17");
const tuesday = parseLocalDate("2026-08-18");
const wednesday = parseLocalDate("2026-08-19");

function pendingOpportunity(
  overrides: Partial<PendingScheduleOpportunityV1> = {},
): PendingScheduleOpportunityV1 {
  return {
    version: 1,
    state: "pending",
    id: "opportunity-1",
    source: "rotation",
    localDate: monday,
    planDayId: "day-a",
    revision: 1,
    ...overrides,
  };
}

function rotationState(
  overrides: Partial<RotationScheduleStateV1> = {},
): RotationScheduleStateV1 {
  return {
    version: 1,
    mode: "rotation",
    revision: 4,
    bindings: ["day-a", "day-b", "day-c"],
    pointer: 0,
    currentOpportunity: pendingOpportunity(),
    ...overrides,
  };
}

function timeZoneState(
  overrides: Partial<ScheduleTimeZoneStateV1> = {},
): ScheduleTimeZoneStateV1 {
  return {
    version: 1,
    revision: 2,
    timeZone: parseStoredTimeZone("Asia/Singapore"),
    lastDeviceTimeZoneDecision: null,
    ...overrides,
  };
}

describe("Plan 02-03 Rotation schedule transitions", () => {
  it.each([
    {
      id: "D-42 scheduled completion advances",
      action: {
        type: "complete_scheduled",
        sessionId: "session-1",
        sessionLocalDate: monday,
        planDayId: "day-a",
      } as const,
      pointer: 1,
      consumedOutcome: "completed",
      eventType: "rotation_completed",
    },
    {
      id: "D-42 Repeat holds",
      action: { type: "repeat" } as const,
      pointer: 0,
      consumedOutcome: null,
      eventType: "rotation_repeated",
    },
    {
      id: "D-42 Skip records and advances",
      action: { type: "skip" } as const,
      pointer: 1,
      consumedOutcome: "skipped",
      eventType: "rotation_skipped",
    },
    {
      id: "D-42 Advance creates no workout and advances",
      action: { type: "advance" } as const,
      pointer: 1,
      consumedOutcome: "advanced",
      eventType: "rotation_advanced",
    },
  ])(
    "$id",
    ({ action, pointer, consumedOutcome, eventType }) => {
      const result = transitionRotation({
        current: rotationState(),
        expectedRevision: 4,
        action,
      });

      expect(result.next.revision).toBe(5);
      expect(result.next.pointer).toBe(pointer);
      expect(result.consumed?.outcome ?? null).toBe(consumedOutcome);
      expect(result.events).toEqual([
        expect.objectContaining({
          type: eventType,
          fromPointer: 0,
          toPointer: pointer,
        }),
      ]);
      if (action.type === "repeat") {
        expect(result.next.currentOpportunity).toEqual(
          pendingOpportunity(),
        );
      } else {
        expect(result.next.currentOpportunity).toBeNull();
      }
    },
  );

  it("wraps the pointer after the final scheduled day", () => {
    const result = transitionRotation({
      current: rotationState({
        pointer: 2,
        currentOpportunity: pendingOpportunity({
          planDayId: "day-c",
        }),
      }),
      expectedRevision: 4,
      action: { type: "skip" },
    });

    expect(result.next.pointer).toBe(0);
  });

  it.each([
    {
      id: "D-43 alternate plan day does not advance",
      workout: {
        kind: "plan_day",
        planDayId: "day-c",
      } as const,
    },
    {
      id: "D-43 rest-day training does not advance",
      workout: {
        kind: "rest_day",
        planDayId: null,
      } as const,
    },
    {
      id: "D-43 empty workout does not advance",
      workout: {
        kind: "empty",
        planDayId: null,
      } as const,
    },
  ])("$id", ({ workout }) => {
    const result = transitionRotation({
      current: rotationState(),
      expectedRevision: 4,
      action: {
        type: "train_anyway",
        localDate: monday,
        workout,
        advanceRotation: false,
      },
    });

    expect(result.next).toEqual({
      ...rotationState(),
      revision: 5,
    });
    expect(result.consumed).toBeNull();
    expect(result.events).toEqual([{
      type: "train_anyway",
      localDate: monday,
      workoutKind: workout.kind,
      planDayId: workout.planDayId,
      rotationAdvanced: false,
      fromPointer: 0,
      toPointer: 0,
    }]);
  });

  it("D-43 advances after alternate training only through explicit intent", () => {
    const result = transitionRotation({
      current: rotationState(),
      expectedRevision: 4,
      action: {
        type: "train_anyway",
        localDate: monday,
        workout: {
          kind: "plan_day",
          planDayId: "day-c",
        },
        advanceRotation: true,
      },
    });

    expect(result.next.pointer).toBe(1);
    expect(result.next.currentOpportunity).toBeNull();
    expect(result.consumed?.outcome).toBe("advanced");
    expect(result.events).toEqual([{
      type: "train_anyway",
      localDate: monday,
      workoutKind: "plan_day",
      planDayId: "day-c",
      rotationAdvanced: true,
      fromPointer: 0,
      toPointer: 1,
    }]);
  });

  it("E-54 permits empty-schedule Train anyway without implicit advancement", () => {
    const current = rotationState({
      bindings: [],
      pointer: 0,
      currentOpportunity: null,
    });
    const result = transitionRotation({
      current,
      expectedRevision: 4,
      action: {
        type: "train_anyway",
        localDate: monday,
        workout: {
          kind: "empty",
          planDayId: null,
        },
        advanceRotation: false,
      },
    });

    expect(result.next).toEqual({
      ...current,
      revision: 5,
    });
    expect(result.consumed).toBeNull();
    expect(() => transitionRotation({
      current,
      expectedRevision: 4,
      action: { type: "advance" },
    })).toThrow("schedule_rotation_empty");
  });

  it.each([
    {
      id: "empty bindings with a nonzero pointer",
      current: rotationState({
        bindings: [],
        pointer: 1,
        currentOpportunity: null,
      }),
    },
    {
      id: "empty bindings with a pending opportunity",
      current: rotationState({
        bindings: [],
        pointer: 0,
        currentOpportunity: pendingOpportunity(),
      }),
    },
    {
      id: "nonempty bindings with a mismatched opportunity",
      current: rotationState({
        currentOpportunity: pendingOpportunity({ planDayId: "day-b" }),
      }),
    },
  ])(
    "rejects malformed non-advancing Train anyway state: $id",
    ({ current }) => {
      expect(() => transitionRotation({
        current,
        expectedRevision: 4,
        action: {
          type: "train_anyway",
          localDate: monday,
          workout: {
            kind: "empty",
            planDayId: null,
          },
          advanceRotation: false,
        },
      })).toThrow("schedule_rotation_state_invalid");
    },
  );

  it("rejects completion of an alternate plan day as scheduled completion", () => {
    expect(() => transitionRotation({
      current: rotationState(),
      expectedRevision: 4,
      action: {
        type: "complete_scheduled",
        sessionId: "session-1",
        sessionLocalDate: monday,
        planDayId: "day-b",
      },
    })).toThrow("schedule_rotation_completion_not_current");
  });

  it.each([
    {
      id: "pointer outside bindings",
      current: rotationState({ pointer: 3 }),
    },
    {
      id: "missing current opportunity",
      current: rotationState({ currentOpportunity: null }),
    },
    {
      id: "weekday opportunity in rotation state",
      current: rotationState({
        currentOpportunity: pendingOpportunity({ source: "weekday" }),
      }),
    },
    {
      id: "opportunity does not match pointer",
      current: rotationState({
        currentOpportunity: pendingOpportunity({ planDayId: "day-b" }),
      }),
    },
  ])("rejects malformed rotation state: $id", ({ current }) => {
    expect(() => transitionRotation({
      current,
      expectedRevision: 4,
      action: { type: "advance" },
    })).toThrow("schedule_rotation_state_invalid");
  });

  it("rejects an empty completion session identifier", () => {
    expect(() => transitionRotation({
      current: rotationState(),
      expectedRevision: 4,
      action: {
        type: "complete_scheduled",
        sessionId: "",
        sessionLocalDate: monday,
        planDayId: "day-a",
      },
    })).toThrow("schedule_identifier_invalid");
  });

  it("E-57 rejects repeated intent after the first revision commits", () => {
    const current = rotationState();
    const first = transitionRotation({
      current,
      expectedRevision: 4,
      action: { type: "skip" },
    });

    expect(first.next.revision).toBe(5);
    expect(() => transitionRotation({
      current: first.next,
      expectedRevision: 4,
      action: { type: "skip" },
    })).toThrow("schedule_revision_conflict");
  });

  it("E-58 rejects concurrent stale commands with a typed conflict", () => {
    const current = rotationState();
    const accepted = transitionRotation({
      current,
      expectedRevision: 4,
      action: { type: "repeat" },
    });

    expect(accepted.next.revision).toBe(5);
    let conflict: unknown;
    try {
      transitionRotation({
        current: accepted.next,
        expectedRevision: 4,
        action: { type: "advance" },
      });
    } catch (error) {
      conflict = error;
    }
    expect(conflict).toMatchObject({
      kind: "conflict",
      code: "schedule_revision_conflict",
      retryable: false,
    });
  });
});

describe("Plan 02-03 Weekday opportunity transitions", () => {
  it("D-48 resolves weekday intent from the LocalDate value", () => {
    expect(resolveWeekdayPlanDay(monday, [
      { weekday: "Monday", planDayId: "day-a" },
      { weekday: "Wednesday", planDayId: "day-b" },
    ])).toBe("day-a");
    expect(resolveWeekdayPlanDay(tuesday, [
      { weekday: "Monday", planDayId: "day-a" },
    ])).toBeNull();
    expect(resolveWeekdayPlanDay(wednesday, [])).toBeNull();
  });

  it("D-45 Skip consumes only the date-only opportunity", () => {
    const current = pendingOpportunity({
      source: "weekday",
      localDate: monday,
    });
    const result = transitionWeekdayOpportunity({
      current,
      expectedRevision: 1,
      action: { type: "skip" },
    });

    expect(result.next).toEqual({
      ...current,
      state: "consumed",
      revision: 2,
      outcome: "skipped",
      sessionId: null,
    });
    expect(result.events).toEqual([{
      type: "weekday_skipped",
      localDate: monday,
      planDayId: "day-a",
    }]);
  });

  it("D-46 marks a passed due date as Planned but not completed", () => {
    const result = transitionWeekdayOpportunity({
      current: pendingOpportunity({
        source: "weekday",
        localDate: monday,
      }),
      expectedRevision: 1,
      action: {
        type: "mark_missed",
        observedLocalDate: tuesday,
      },
    });

    expect(result.next.outcome).toBe("planned_not_completed");
    expect(result.events).toEqual([{
      type: "weekday_missed",
      localDate: monday,
      planDayId: "day-a",
      label: "Planned but not completed",
    }]);
  });

  it("does not mark the current or a future weekday as missed", () => {
    const current = pendingOpportunity({
      source: "weekday",
      localDate: monday,
    });
    expect(() => transitionWeekdayOpportunity({
      current,
      expectedRevision: 1,
      action: {
        type: "mark_missed",
        observedLocalDate: monday,
      },
    })).toThrow("schedule_weekday_not_missed");
    expect(() => transitionWeekdayOpportunity({
      current,
      expectedRevision: 1,
      action: {
        type: "mark_missed",
        observedLocalDate: parseLocalDate("2026-08-16"),
      },
    })).toThrow("schedule_weekday_not_missed");
  });

  it("completes a due weekday opportunity without changing recurring bindings", () => {
    const current = pendingOpportunity({
      source: "weekday",
      localDate: monday,
    });
    const result = transitionWeekdayOpportunity({
      current,
      expectedRevision: 1,
      action: {
        type: "complete",
        sessionId: "session-1",
        sessionLocalDate: monday,
      },
    });

    expect(result.next.outcome).toBe("completed");
    expect(result.next.sessionId).toBe("session-1");
    expect(result.next.localDate).toBe(monday);
    expect(result.next.planDayId).toBe("day-a");
  });

  it("rejects rewriting an already consumed opportunity", () => {
    const consumed = transitionWeekdayOpportunity({
      current: pendingOpportunity({
        source: "weekday",
        localDate: monday,
      }),
      expectedRevision: 1,
      action: { type: "skip" },
    }).next;

    expect(() => transitionWeekdayOpportunity({
      current: consumed,
      expectedRevision: 2,
      action: { type: "skip" },
    })).toThrow("schedule_opportunity_consumed");
  });

  it("rejects a rotation opportunity at the weekday transition seam", () => {
    expect(() => transitionWeekdayOpportunity({
      current: pendingOpportunity(),
      expectedRevision: 1,
      action: { type: "skip" },
    })).toThrow("schedule_weekday_source_invalid");
  });

  it.each([
    {
      id: "empty session identifier",
      sessionId: "",
      sessionLocalDate: monday,
      expected: "schedule_identifier_invalid",
    },
    {
      id: "different session LocalDate",
      sessionId: "session-1",
      sessionLocalDate: tuesday,
      expected: "schedule_weekday_completion_date_conflict",
    },
  ] as const)(
    "rejects weekday completion with $id",
    ({ sessionId, sessionLocalDate, expected }) => {
      expect(() => transitionWeekdayOpportunity({
        current: pendingOpportunity({
          source: "weekday",
          localDate: monday,
        }),
        expectedRevision: 1,
        action: {
          type: "complete",
          sessionId,
          sessionLocalDate,
        },
      })).toThrow(expected);
    },
  );
});

describe("Plan 02-03 date override transitions", () => {
  const restSelection = { kind: "rest_day" } as const;
  const skipSelection = { kind: "skip" } as const;

  it("D-44 creates exactly one pending override for a LocalDate", () => {
    const result = transitionDateOverride({
      current: null,
      expectedRevision: 0,
      overrideId: "override-1",
      localDate: monday,
      replacement: {
        kind: "plan_day",
        planDayId: "day-b",
      },
    });

    expect(result.next).toEqual({
      version: 1,
      state: "pending",
      id: "override-1",
      revision: 1,
      localDate: monday,
      selection: {
        kind: "plan_day",
        planDayId: "day-b",
      },
    });
    expect(result.events[0]?.type).toBe("override_created");
  });

  it("D-44 replaces a pending override only with explicit confirmation", () => {
    const pending = transitionDateOverride({
      current: null,
      expectedRevision: 0,
      overrideId: "override-1",
      localDate: monday,
      replacement: restSelection,
    }).next;

    expect(() => transitionDateOverride({
      current: pending,
      expectedRevision: 1,
      overrideId: "override-1",
      localDate: monday,
      replacement: skipSelection,
    })).toThrow("schedule_override_replace_confirmation_required");

    const replaced = transitionDateOverride({
      current: pending,
      expectedRevision: 1,
      overrideId: "override-1",
      localDate: monday,
      replacement: skipSelection,
      confirmation: "replace_pending_override",
    });

    expect(replaced.next).toEqual({
      ...pending,
      revision: 2,
      selection: skipSelection,
    });
    expect(replaced.events).toEqual([{
      type: "override_replaced",
      localDate: monday,
      previous: restSelection,
      replacement: skipSelection,
    }]);
  });

  it("D-44 keeps consumed overrides immutable", () => {
    const pending = transitionDateOverride({
      current: null,
      expectedRevision: 0,
      overrideId: "override-1",
      localDate: monday,
      replacement: restSelection,
    }).next;
    const consumed = consumeDateOverride({
      current: pending,
      expectedRevision: 1,
      opportunityId: "opportunity-1",
    }).next;

    expect(consumed).toEqual({
      ...pending,
      state: "consumed",
      revision: 2,
      opportunityId: "opportunity-1",
    });
    expect(() => transitionDateOverride({
      current: consumed,
      expectedRevision: 2,
      overrideId: "override-1",
      localDate: monday,
      replacement: skipSelection,
      confirmation: "replace_pending_override",
    })).toThrow("schedule_override_consumed");
  });

  it("rejects a second date or identifier from replacing the pending fact", () => {
    const pending: ScheduleDateOverrideV1 = {
      version: 1,
      state: "pending",
      id: "override-1",
      revision: 1,
      localDate: monday,
      selection: restSelection,
    };

    expect(() => transitionDateOverride({
      current: pending,
      expectedRevision: 1,
      overrideId: "override-2",
      localDate: monday,
      replacement: skipSelection,
      confirmation: "replace_pending_override",
    })).toThrow("schedule_override_identity_conflict");
    expect(() => transitionDateOverride({
      current: pending,
      expectedRevision: 1,
      overrideId: "override-1",
      localDate: tuesday,
      replacement: skipSelection,
      confirmation: "replace_pending_override",
    })).toThrow("schedule_override_date_conflict");
  });

  it("rejects invalid override identifiers and repeated consumption", () => {
    expect(() => transitionDateOverride({
      current: null,
      expectedRevision: 0,
      overrideId: "",
      localDate: monday,
      replacement: restSelection,
    })).toThrow("schedule_identifier_invalid");

    const pending = transitionDateOverride({
      current: null,
      expectedRevision: 0,
      overrideId: "override-1",
      localDate: monday,
      replacement: restSelection,
    }).next;
    expect(() => consumeDateOverride({
      current: pending,
      expectedRevision: 1,
      opportunityId: "",
    })).toThrow("schedule_identifier_invalid");
    const consumed = consumeDateOverride({
      current: pending,
      expectedRevision: 1,
      opportunityId: "opportunity-1",
    }).next;
    expect(() => consumeDateOverride({
      current: consumed,
      expectedRevision: 2,
      opportunityId: "opportunity-2",
    })).toThrow("schedule_override_consumed");
  });
});

describe("Plan 02-03 prospective timezone choices", () => {
  it.each([
    {
      label: FOLLOW_DEVICE_TIMEZONE_LABEL,
      expectedTimeZone: "America/New_York",
      eventType: "timezone_followed",
    },
    {
      label: KEEP_CURRENT_TIMEZONE_LABEL,
      expectedTimeZone: "Asia/Singapore",
      eventType: "timezone_kept",
    },
  ] as const)(
    "D-49 applies exact choice $label prospectively",
    ({ label, expectedTimeZone, eventType }) => {
      const result = transitionTimeZoneChoice({
        current: timeZoneState(),
        expectedRevision: 2,
        detectedDeviceTimeZone: parseStoredTimeZone("America/New_York"),
        effectiveLocalDate: monday,
        choice: label,
      });

      expect(result.next.revision).toBe(3);
      expect(result.next.timeZone).toBe(expectedTimeZone);
      expect(result.next.lastDeviceTimeZoneDecision).toEqual({
        detectedDeviceTimeZone: "America/New_York",
        effectiveLocalDate: monday,
        choice: label,
      });
      expect(result.events).toEqual([{
        type: eventType,
        effectiveLocalDate: monday,
        previousTimeZone: "Asia/Singapore",
        detectedDeviceTimeZone: "America/New_York",
        nextTimeZone: expectedTimeZone,
      }]);
    },
  );

  it("D-49 prompts only once for the same detected device timezone", () => {
    const first = transitionTimeZoneChoice({
      current: timeZoneState(),
      expectedRevision: 2,
      detectedDeviceTimeZone: parseStoredTimeZone("America/New_York"),
      effectiveLocalDate: monday,
      choice: KEEP_CURRENT_TIMEZONE_LABEL,
    });

    expect(() => transitionTimeZoneChoice({
      current: first.next,
      expectedRevision: 3,
      detectedDeviceTimeZone: parseStoredTimeZone("America/New_York"),
      effectiveLocalDate: tuesday,
      choice: KEEP_CURRENT_TIMEZONE_LABEL,
    })).toThrow("schedule_timezone_choice_already_recorded");
  });

  it("rejects a timezone choice when the device timezone has not changed", () => {
    expect(() => transitionTimeZoneChoice({
      current: timeZoneState(),
      expectedRevision: 2,
      detectedDeviceTimeZone: parseStoredTimeZone("Asia/Singapore"),
      effectiveLocalDate: monday,
      choice: FOLLOW_DEVICE_TIMEZONE_LABEL,
    })).toThrow("schedule_timezone_unchanged");
  });
});
