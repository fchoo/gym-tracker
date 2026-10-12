import {
  act,
  fireEvent,
  render,
  StyleSheet,
  waitFor,
} from "@testing-library/react-native";
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

import type { RunningPlanAggregate } from "../../src/domains/running/contracts";
import type { CalendarRange } from "../../src/ui/calendar/calendarPorts";
import { AppearanceProvider } from "../../src/ui/theme";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockLoadCalendarRange = jest.fn();
const mockLoadRunningPlan = jest.fn();
const mockPreviewLifecycle = jest.fn();
const mockConfirmLifecycle = jest.fn();
let mockFocusEffect: (() => void) | null = null;
let mockSearchParams: Readonly<Record<string, string | undefined>> = {};

jest.mock("expo-router", () => {
  const ReactImplementation = require("react") as typeof React;
  return {
    Stack: { Screen: () => null },
    router: {
      back: () => {
        mockBack();
        mockFocusEffect?.();
      },
      push: (...args: readonly unknown[]) => mockPush(...args),
      replace: jest.fn(),
    },
    useFocusEffect: (callback: () => void) => {
      mockFocusEffect = callback;
      ReactImplementation.useEffect(() => callback(), [callback]);
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

const runningPlan: RunningPlanAggregate = Object.freeze({
  version: 1,
  id: "running-plan:calendar/tempo",
  name: "Calendar tempo plan",
  revision: 3,
  active: true,
  lifecycle: "active",
  createdAtMs: 1,
  goal: Object.freeze({
    version: 1,
    id: "running-goal:calendar",
    planId: "running-plan:calendar/tempo",
    revision: 3,
    goalDistanceMeters: 10_000,
    targetDurationMs: 3_600_000,
    trainingDays: Object.freeze(["Monday"]),
    createdAtMs: 1,
  }),
  sessions: Object.freeze([]),
});

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

jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    createPhase17ActionRequestId: jest.fn(async (_label: string, requestId: string) => requestId),
    loadCalendarRange: mockLoadCalendarRange,
  }),
}));

jest.mock("../../src/bootstrap/runningPlanRuntime", () => ({
  useRunningPlanRuntime: () => ({
    confirmLifecycle: mockConfirmLifecycle,
    createId: (kind: string) => `${kind}:calendar-test`,
    loadPlan: mockLoadRunningPlan,
    previewLifecycle: mockPreviewLifecycle,
  }),
}));

jest.mock("../../src/ui/shell/AppRootShell", () => ({
  useRootSettingsController: () => ({ openRootSettings: jest.fn() }),
}));

jest.mock("../../src/ui/shell/rootFocus", () => ({
  rootSettingsTriggerNativeID: () => "calendar-settings",
  useRootHeadingRef: () => ({ current: null }),
}));

import CalendarRoute from "../(tabs)/calendar";
import RunningPlanDetailRoute from "../library/running/[planId]";

describe("Calendar cross-destination routes", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockBack.mockReset();
    mockLoadCalendarRange.mockReset().mockResolvedValue(calendarRange());
    mockLoadRunningPlan.mockReset().mockResolvedValue(runningPlan);
    mockPreviewLifecycle.mockReset();
    mockConfirmLifecycle.mockReset();
    mockFocusEffect = null;
    mockSearchParams = {};
  });

  it("opens the real Running detail by unchanged durable identity and restores the invoking Calendar row with the shared 3dp focus", async () => {
    const calendar = await render(<AppearanceProvider><CalendarRoute /></AppearanceProvider>);
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
    expect(mockLoadRunningPlan).toHaveBeenCalledWith(runningPlan.id);
    expect(detail.queryByRole("button", { name: "Sync Garmin / match activity" })).toBeNull();
    expect(detail.queryByRole("button", { name: "Edit running plan" })).toBeNull();
    expect(detail.queryByRole("button", { name: "Review archive" })).toBeNull();

    await fireEvent.press(detail.getByRole("button", { name: "Go back" }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(agendaRow.props.hasTVPreferredFocus).toBe(true));
    await act(() => fireEvent(agendaRow, "focus"));
    expect(StyleSheet.flatten(agendaRow.props.style).outlineWidth).toBe(3);
    expect(mockPreviewLifecycle).not.toHaveBeenCalled();
    expect(mockConfirmLifecycle).not.toHaveBeenCalled();
  });

  it("uses the real Running missing state for a stale identity and returns without substituting another plan", async () => {
    mockLoadRunningPlan.mockResolvedValueOnce(null);
    mockSearchParams = {
      origin: "calendar",
      planId: "running-plan:removed",
      returnEventId: "calendar-event:removed",
    };
    const detail = await render(<AppearanceProvider><RunningPlanDetailRoute /></AppearanceProvider>);

    expect(await detail.findByText("Running plan not found")).toBeOnTheScreen();
    expect(mockLoadRunningPlan).toHaveBeenCalledWith("running-plan:removed");
    expect(detail.queryByText("Calendar tempo plan")).toBeNull();
    expect(detail.getByRole("button", { name: "Back to Calendar" })).toBeOnTheScreen();

    await fireEvent.press(detail.getByRole("button", { name: "Back to Calendar" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
