import { fireEvent, render, waitFor } from "@testing-library/react-native";
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";
import { createHash } from "node:crypto";

import type { ImportedActivityDetailReadResult } from "../../src/domains/activities/activityDetails";
import type { RunningPlanAggregate } from "../../src/domains/running/contracts";
import type { PlannedStrengthOccurrenceDetail, SessionDetail } from "../../src/domains/workout";
import type { CalendarRange, CalendarReadPort } from "../../src/ui/calendar/calendarPorts";
import { AppearanceProvider, sizes } from "../../src/ui/theme";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockLoadCalendarRange = jest.fn<CalendarReadPort["loadCalendarRange"]>();
const mockLoadRunningPlan = jest.fn<(planId: string, sessionId?: string) => Promise<RunningPlanAggregate | null>>();
const mockGetSessionDetail = jest.fn<(sessionId: string) => Promise<SessionDetail>>();
const mockLoadOccurrence = jest.fn<(occurrenceId: string) => Promise<PlannedStrengthOccurrenceDetail | null>>();
const mockLoadActivity = jest.fn<(activityId: string) => Promise<ImportedActivityDetailReadResult>>();
const mockLoadGarminRevisionReview = jest.fn(async () => null);
const mockCreatePhase17ActionRequestId = jest.fn(async (_label: string, requestId: string) => requestId);
const mockPreviewLifecycle = jest.fn();
const mockConfirmLifecycle = jest.fn();
const mockMutationCommands = Object.freeze({
  commitScheduleCollisionChoice: jest.fn(),
  removeHistorySession: jest.fn(),
  resolveGarminRevision: jest.fn(),
  resumePartialWorkout: jest.fn(),
});
const mockUseWorkoutAppRuntime = jest.fn(() => ({
  createPhase17ActionRequestId: mockCreatePhase17ActionRequestId,
  getSessionDetail: mockGetSessionDetail,
  loadCalendarRange: mockLoadCalendarRange,
  loadGarminRevisionReview: mockLoadGarminRevisionReview,
  loadImportedActivityDetail: mockLoadActivity,
  loadPlannedStrengthOccurrence: mockLoadOccurrence,
  ...mockMutationCommands,
  workoutRefreshGeneration: 0,
}));
const mockUseRunningPlanRuntime = jest.fn(() => ({
  confirmLifecycle: mockConfirmLifecycle,
  createId: (kind: string) => `${kind}:calendar-test`,
  loadPlan: mockLoadRunningPlan,
  previewLifecycle: mockPreviewLifecycle,
  ...mockMutationCommands,
}));
const mockFocusEffects = new Set<() => void>();
let mockSearchParams: Readonly<Record<string, string | undefined>> = {};

jest.mock("expo-router", () => {
  const ReactImplementation = require("react") as typeof React;
  return {
    Stack: { Screen: () => null },
    router: {
      back: () => {
        mockBack();
        for (const callback of mockFocusEffects) callback();
      },
      push: (...args: readonly unknown[]) => mockPush(...args),
      replace: jest.fn(),
    },
    useFocusEffect: (callback: () => void) => {
      ReactImplementation.useEffect(() => {
        mockFocusEffects.add(callback);
        callback();
        return () => { mockFocusEffects.delete(callback); };
      }, [callback]);
    },
    useLocalSearchParams: () => mockSearchParams,
  };
});

const localToday = (): string => {
  const now = new Date();
  return [
    now.getFullYear().toString().padStart(4, "0"),
    (now.getMonth() + 1).toString().padStart(2, "0"),
    now.getDate().toString().padStart(2, "0"),
  ].join("-");
};

const runningPlan: RunningPlanAggregate = {
  version: 1,
  id: "running-plan:calendar/tempo",
  name: "Calendar tempo plan",
  revision: 3,
  active: true,
  lifecycle: "active",
  createdAtMs: 1,
  goal: {
    version: 1,
    id: "running-goal:calendar",
    planId: "running-plan:calendar/tempo",
    revision: 3,
    goalDistanceMeters: 10_000,
    targetDurationMs: 3_600_000,
    trainingDays: ["Monday"],
    createdAtMs: 1,
  },
  sessions: [{
    slot: { id: "running-slot-revision:calendar", rootId: "running-slot:calendar", weekday: "Monday", revision: 1, ordinal: 0 },
    session: { version: 1, id: "running-session-revision:calendar", rootId: "running-session:calendar", planId: "running-plan:calendar/tempo", sessionKind: "tempo", revision: 1, createdAtMs: 1, phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "duration", durationMs: 60_000 }] }], contextual: { format: "continuous", work: { durationMs: 60_000 } } },
  }],
};

const calendarRange = (): CalendarRange => Object.freeze({
  events: Object.freeze([Object.freeze({
    id: "calendar-event:running/tempo",
    source: "running",
    sport: "running",
    status: "planned",
    title: "Calendar tempo plan",
    sourceLabel: "Tempo",
    localDate: localToday(),
    timeZone: "Asia/Singapore",
    scheduleId: "running-schedule:calendar",
    scheduleVersionId: "running-schedule-version:calendar",
    planId: runningPlan.id,
    slotId: "running-slot:calendar",
    revision: 3,
    state: "planned",
    destination: Object.freeze({
      kind: "plan",
      planId: runningPlan.id,
      sessionId: "running-session-revision:calendar",
    }),
  })]),
}) as CalendarRange;

const calendarMatrixRange = (): CalendarRange => {
  const event = calendarRange().events[0]!;
  return Object.freeze({
    events: Object.freeze([
      Object.freeze({
        ...event,
        id: "calendar-event:strength-complete",
        source: "strength",
        sport: "strength",
        status: "completed",
        state: "completed",
        title: "Completed strength",
        sourceLabel: "Strength",
        destination: Object.freeze({ kind: "session", sessionId: "strength-session:complete" }),
      }),
      Object.freeze({
        ...event,
        id: "calendar-event:strength-partial",
        source: "strength",
        sport: "strength",
        status: "partial",
        state: "partial",
        title: "Partial strength",
        sourceLabel: "Strength",
        destination: Object.freeze({ kind: "session", sessionId: "strength-session:partial" }),
      }),
      Object.freeze({
        ...event,
        id: "calendar-event:strength-planned",
        source: "strength",
        sport: "strength",
        status: "planned",
        state: "planned",
        title: "Planned strength",
        sourceLabel: "Strength",
        destination: Object.freeze({ kind: "occurrence", occurrenceId: "strength-occurrence:planned" }),
      }),
      event,
      Object.freeze({
        ...event,
        id: "calendar-event:activity-outdoor",
        source: "imported_activity",
        status: "imported",
        state: "imported",
        title: "Outdoor run",
        sourceLabel: "Garmin",
        destination: Object.freeze({ kind: "activity", activityId: "activity-local-outdoor" }),
      }),
      Object.freeze({
        ...event,
        id: "calendar-event:activity-treadmill",
        source: "imported_activity",
        status: "imported",
        state: "imported",
        title: "Treadmill run",
        sourceLabel: "Garmin",
        destination: Object.freeze({ kind: "activity", activityId: "activity-local-treadmill" }),
      }),
    ]),
  }) as CalendarRange;
};

const sessionDetail = (id: string, status: "completed" | "partial"): SessionDetail => ({
  id, status, statusLabel: status === "partial" ? "Partial" : "Complete", sourceLabel: "Planned", planName: "Strength plan", dayName: "Day A",
  localDate: localToday(), timezone: "Asia/Singapore", startedAtMs: 1, endedAtMs: 2, durationMs: 1, revision: 4, modifiedFromPlan: false,
  exerciseProgress: { completed: 1, planned: 1, percent: 100 }, workingSetProgress: { completed: 1, planned: 1, percent: 100 },
  exercises: [], nonLoadOutcomes: [], recommendations: [], recommendationStatus: "none", resumable: status === "partial", readOnly: true,
}) as unknown as SessionDetail;

const plannedOccurrence = (occurrenceId: string): PlannedStrengthOccurrenceDetail => Object.freeze({
  occurrenceId,
  planId: "strength-plan:calendar",
  planName: "Strength plan",
  planDayId: "strength-day:calendar",
  dayName: "Day A",
  scheduleId: "strength-schedule:calendar",
  scheduleVersionId: "strength-schedule-version:calendar",
  localDate: localToday(),
  timezone: "Asia/Singapore",
  sourceRevisions: Object.freeze({ plan: 1, day: 1, schedule: 1, opportunity: 1 }),
  exercises: Object.freeze([Object.freeze({
    id: "strength-exercise:calendar",
    exerciseId: "squat",
    exerciseName: "Back squat",
    ordinal: 0,
    targets: Object.freeze([Object.freeze({
      id: "strength-target:calendar",
      ordinal: 0,
      targetJson: JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 80_000, minReps: 5, maxReps: 5, incrementGrams: 2_500, perSide: false }),
      unitJson: "{}",
      previousObservationJson: null,
    })]),
  })]),
}) as PlannedStrengthOccurrenceDetail;

const activityDetail = (activityType: "Outdoor run" | "Treadmill run"): ImportedActivityDetailReadResult => Object.freeze({
  kind: "ready",
  detail: Object.freeze({
    activityType,
    confirmedLocalDate: localToday(),
    distance: "5.00 km",
    elapsed: "26:00",
    route: Object.freeze({ kind: activityType === "Outdoor run" ? "unavailable" : "none" }),
    laps: Object.freeze([]),
    fidelity: Object.freeze({
      kind: "source_summary",
      heading: "Source summary",
      body: "Summary facts come from accepted source fields.",
    }),
  }),
});

function sourceDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useCalendarActivityReadPort: () => ({
    loadGarminRevisionReview: mockLoadGarminRevisionReview,
    loadImportedActivityDetail: mockLoadActivity,
  }),
  useCalendarRangeReadPort: () => ({ loadCalendarRange: mockLoadCalendarRange }),
  useCalendarSessionReadPort: () => ({ loadCalendarSessionDetail: mockGetSessionDetail }),
  useCalendarStrengthOccurrenceReadPort: () => ({
    loadPlannedStrengthOccurrence: mockLoadOccurrence,
  }),
  useWorkoutAppRuntime: () => mockUseWorkoutAppRuntime(),
}));

jest.mock("../../src/bootstrap/runningPlanRuntime", () => ({
  useCalendarRunningPlanReadPort: () => ({ loadScheduledSessionPlan: mockLoadRunningPlan }),
  useRunningPlanRuntime: () => mockUseRunningPlanRuntime(),
}));

jest.mock("../../src/ui/garmin/GarminRouteShell", () => ({
  GarminRouteShell: ({ children }: Readonly<{ children: React.ReactNode }>) => children,
}));

jest.mock("../../src/ui/shell/AppRootShell", () => ({
  useRootSettingsController: () => ({ openRootSettings: jest.fn() }),
}));

jest.mock("../../src/ui/shell/rootFocus", () => ({
  rootSettingsTriggerNativeID: () => "calendar-settings",
  useRootHeadingRef: () => ({ current: null }),
}));

import CalendarRoute from "../(tabs)/calendar";
import CalendarPlannedWorkoutRoute from "../calendar/plan/[occurrenceId]";
import ImportedActivityDetailRoute from "../garmin/activity/[activityId]";
import RunningPlanDetailRoute from "../library/running/[planId]";
import SessionDetailRoute from "../session/[sessionId]";

describe("Calendar cross-destination routes", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockBack.mockReset();
    mockLoadCalendarRange.mockReset().mockResolvedValue(calendarRange());
    mockLoadRunningPlan.mockReset().mockResolvedValue(runningPlan);
    mockGetSessionDetail.mockReset().mockImplementation(async (sessionId) => sessionDetail(
      sessionId,
      sessionId.endsWith("partial") ? "partial" : "completed",
    ));
    mockLoadOccurrence.mockReset().mockImplementation(async (occurrenceId) => plannedOccurrence(occurrenceId));
    mockLoadActivity.mockReset().mockImplementation(async (activityId) => activityDetail(
      activityId.endsWith("treadmill") ? "Treadmill run" : "Outdoor run",
    ));
    mockLoadGarminRevisionReview.mockClear();
    mockCreatePhase17ActionRequestId.mockClear();
    mockPreviewLifecycle.mockReset();
    mockConfirmLifecycle.mockReset();
    mockUseWorkoutAppRuntime.mockClear();
    mockUseRunningPlanRuntime.mockClear();
    Object.values(mockMutationCommands).forEach((command) => command.mockReset());
    mockFocusEffects.clear();
    mockSearchParams = {};
  });

  it("opens the real Running detail by unchanged durable identity and restores the invoking Calendar row with the shared 3dp focus", async () => {
    const calendar = await render(
      <AppearanceProvider>
        <CalendarRoute key="calendar" />
      </AppearanceProvider>,
    );
    const day = await calendar.findByRole("button", { name: /Calendar tempo plan.*Running.*Planned/u });
    await fireEvent.press(day);
    const agendaRow = await calendar.findByTestId("calendar-agenda-event-calendar-event:running/tempo");
    await fireEvent.press(agendaRow);

    expect(mockPush).toHaveBeenCalledWith(
      "/library/running/running-plan%3Acalendar%2Ftempo?origin=calendar&sessionId=running-session-revision%3Acalendar&returnEventId=calendar-event%3Arunning%2Ftempo",
    );

    mockSearchParams = {
      origin: "calendar",
      planId: runningPlan.id,
      returnEventId: "calendar-event:running/tempo",
      sessionId: "running-session-revision:calendar",
    };
    const detail = await render(<AppearanceProvider><RunningPlanDetailRoute /></AppearanceProvider>);

    expect(await detail.findByText("Calendar tempo plan")).toBeOnTheScreen();
    expect(mockLoadRunningPlan).toHaveBeenCalledWith(runningPlan.id, "running-session-revision:calendar");
    expect(detail.queryByRole("button", { name: "Sync Garmin / match activity" })).toBeNull();
    expect(detail.queryByRole("button", { name: "Edit running plan" })).toBeNull();
    expect(detail.queryByRole("button", { name: "Review archive" })).toBeNull();

    await fireEvent.press(detail.getByRole("button", { name: "Back to Calendar agenda" }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      const restoredRow = calendar.getByTestId("calendar-agenda-event-calendar-event:running/tempo");
      expect(restoredRow.props.hasTVPreferredFocus).toBe(true);
    });
    expect(sizes.focusRing).toBe(3);
    expect(mockPreviewLifecycle).not.toHaveBeenCalled();
    expect(mockConfirmLifecycle).not.toHaveBeenCalled();
    expect(mockUseWorkoutAppRuntime).not.toHaveBeenCalled();
    expect(mockUseRunningPlanRuntime).not.toHaveBeenCalled();
  });

  it("uses the real Running missing state for a stale identity and returns without substituting another plan", async () => {
    mockLoadRunningPlan.mockResolvedValueOnce(runningPlan);
    mockSearchParams = {
      origin: "calendar",
      planId: runningPlan.id,
      sessionId: "running-session-revision:removed",
      returnEventId: "calendar-event:removed",
    };
    const detail = await render(<AppearanceProvider><RunningPlanDetailRoute /></AppearanceProvider>);

    expect(await detail.findByText("Running plan not found")).toBeOnTheScreen();
    expect(mockLoadRunningPlan).toHaveBeenCalledWith(runningPlan.id, "running-session-revision:removed");
    expect(detail.queryByText("Calendar tempo plan")).toBeNull();
    expect(detail.getAllByRole("button", { name: "Back to Calendar agenda" })).toHaveLength(2);

    await fireEvent.press(detail.getAllByRole("button", { name: "Back to Calendar agenda" })[1]!);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("executes every real Calendar destination with keyboard/touch activation and preserves a zero-command source digest", async () => {
    const sourceState = Object.freeze({
      calendar: calendarMatrixRange(),
      imported: Object.freeze({
        outdoor: activityDetail("Outdoor run"),
        treadmill: activityDetail("Treadmill run"),
      }),
      planned: plannedOccurrence("strength-occurrence:planned"),
      running: runningPlan,
      sessions: Object.freeze([
        sessionDetail("strength-session:complete", "completed"),
        sessionDetail("strength-session:partial", "partial"),
      ]),
    });
    const beforeDigest = sourceDigest(sourceState);
    mockLoadCalendarRange.mockResolvedValue(sourceState.calendar);

    const calendar = await render(
      <AppearanceProvider>
        <CalendarRoute key="calendar" />
      </AppearanceProvider>,
    );
    await fireEvent.press(await calendar.findByRole("button", { name: /6 scheduled or imported events/u }));

    const journeys = [
      {
        eventId: "calendar-event:strength-complete",
        activate: "press",
        params: { origin: "calendar", sessionId: "strength-session:complete" },
        Route: SessionDetailRoute,
        loaded: "Complete · read only",
        back: "Back to Calendar agenda",
      },
      {
        eventId: "calendar-event:strength-partial",
        activate: "keyboard",
        params: { origin: "calendar", sessionId: "strength-session:partial" },
        Route: SessionDetailRoute,
        loaded: "Partial · read only",
        back: "Back to Calendar agenda",
      },
      {
        eventId: "calendar-event:strength-planned",
        activate: "press",
        params: { occurrenceId: "strength-occurrence:planned", origin: "calendar" },
        Route: CalendarPlannedWorkoutRoute,
        loaded: "Planned preview · read only",
        back: "Back to Calendar agenda",
      },
      {
        eventId: "calendar-event:running/tempo",
        activate: "keyboard",
        params: { origin: "calendar", planId: runningPlan.id, sessionId: "running-session-revision:calendar" },
        Route: RunningPlanDetailRoute,
        loaded: "Saved Running goal, benchmark, and schedule facts. Activation stays separate.",
        back: "Back to Calendar agenda",
      },
      {
        eventId: "calendar-event:activity-outdoor",
        activate: "press",
        params: { activityId: "activity-local-outdoor", origin: "calendar" },
        Route: ImportedActivityDetailRoute,
        loaded: "Activity detail",
        back: "Back to Calendar agenda",
      },
      {
        eventId: "calendar-event:activity-treadmill",
        activate: "keyboard",
        params: { activityId: "activity-local-treadmill", origin: "calendar" },
        Route: ImportedActivityDetailRoute,
        loaded: "Activity detail",
        back: "Back to Calendar agenda",
      },
    ] as const;

    for (const journey of journeys) {
      mockPush.mockClear();
      const row = calendar.getByTestId(`calendar-agenda-event-${journey.eventId}`);
      if (journey.activate === "keyboard") {
        await fireEvent(row, "keyDown", { nativeEvent: { key: "Enter" } });
      } else {
        await fireEvent.press(row);
      }
      expect(mockPush).toHaveBeenCalledTimes(1);

      mockSearchParams = journey.params;
      await calendar.rerender(
        <AppearanceProvider>
          <CalendarRoute key="calendar" />
          <journey.Route key="destination" />
        </AppearanceProvider>,
      );
      expect(await calendar.findByText(journey.loaded)).toBeOnTheScreen();
      if (journey.Route === ImportedActivityDetailRoute) {
        expect(calendar.queryByRole("button", { name: "Match to scheduled workout" })).toBeNull();
      }
      await fireEvent.press(calendar.getByRole("button", { name: journey.back }));
      await calendar.rerender(
        <AppearanceProvider>
          <CalendarRoute key="calendar" />
        </AppearanceProvider>,
      );
      await waitFor(() => {
        expect(calendar.getByTestId(`calendar-agenda-event-${journey.eventId}`).props.hasTVPreferredFocus).toBe(true);
      });
    }

    expect(mockGetSessionDetail.mock.calls.map(([id]) => id)).toEqual([
      "strength-session:complete",
      "strength-session:partial",
    ]);
    expect(mockLoadOccurrence).toHaveBeenCalledWith("strength-occurrence:planned");
    expect(mockLoadRunningPlan).toHaveBeenCalledWith(runningPlan.id, "running-session-revision:calendar");
    expect(mockLoadActivity.mock.calls.map(([id]) => id)).toEqual([
      "activity-local-outdoor",
      "activity-local-treadmill",
    ]);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/garmin/activity/[activityId]",
      params: {
        activityId: "activity-local-treadmill",
        origin: "calendar",
      },
    });
    Object.values(mockMutationCommands).forEach((command) => expect(command).not.toHaveBeenCalled());
    expect(mockPreviewLifecycle).not.toHaveBeenCalled();
    expect(mockConfirmLifecycle).not.toHaveBeenCalled();
    expect(mockUseWorkoutAppRuntime).not.toHaveBeenCalled();
    expect(mockUseRunningPlanRuntime).not.toHaveBeenCalled();
    expect(sourceDigest(sourceState)).toBe(beforeDigest);
  });

  it("keeps a removed imported activity unavailable and returns without a substitute or mutation", async () => {
    mockLoadActivity.mockResolvedValueOnce({ kind: "removed" });
    mockSearchParams = { activityId: "activity-local-removed", origin: "calendar" };
    const detail = await render(<AppearanceProvider><ImportedActivityDetailRoute /></AppearanceProvider>);

    expect(await detail.findByText("Activity removed")).toBeOnTheScreen();
    expect(mockLoadActivity).toHaveBeenCalledWith("activity-local-removed");
    expect(detail.queryByText("Outdoor run")).toBeNull();
    await fireEvent.press(detail.getByRole("button", { name: "Back to Calendar agenda" }));
    Object.values(mockMutationCommands).forEach((command) => expect(command).not.toHaveBeenCalled());
  });
});
