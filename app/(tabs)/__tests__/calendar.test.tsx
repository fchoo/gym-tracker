import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react-native";
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (...args: readonly unknown[]) => mockPush(...args) },
  useFocusEffect: () => undefined,
}));

jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({
  useCalendarRangeReadPort: () => ({ loadCalendarRange: jest.fn() }),
}));

jest.mock("../../../src/ui/shell/AppRootShell", () => ({
  useRootSettingsController: () => ({ openRootSettings: jest.fn() }),
}));

jest.mock("../../../src/ui/shell/rootFocus", () => ({
  rootSettingsTriggerNativeID: () => "calendar-settings",
  useRootHeadingRef: () => ({ current: null }),
}));

jest.mock("../../../src/ui/screens/CalendarScreen", () => {
  const { Pressable } = require("react-native") as typeof import("react-native");
  return {
    CalendarScreen: ({ onOpenEvent }: Readonly<{ onOpenEvent(destination: unknown, returnEventId?: string): void }>) => (
      <>
        <Pressable
          accessibilityLabel="Open completed Strength event"
          accessibilityRole="button"
          onPress={() => onOpenEvent({ kind: "session", sessionId: "session-17" }, "event-session-17")}
        />
        <Pressable
          accessibilityLabel="Open planned Strength event"
          accessibilityRole="button"
          onPress={() => onOpenEvent({ kind: "occurrence", occurrenceId: "occurrence-17" }, "event-occurrence-17")}
        />
        <Pressable
          accessibilityLabel="Open planned Running event"
          accessibilityRole="button"
          onPress={() => onOpenEvent({ kind: "plan", planId: "running-plan-17", sessionId: "revision-17" }, "event-plan-17")}
        />
        <Pressable
          accessibilityLabel="Open imported Running event"
          accessibilityRole="button"
          onPress={() => onOpenEvent({ kind: "activity", activityId: "activity-17" }, "event-activity-17")}
        />
      </>
    ),
  };
});

import CalendarRoute from "../calendar";

describe("CalendarRoute", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it("routes a completed Strength event by its durable session identity with Calendar origin", async () => {
    await render(<CalendarRoute />);

    await fireEvent.press(screen.getByRole("button", { name: "Open completed Strength event" }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/session/session-17?origin=calendar&returnEventId=event-session-17");
  });

  it("passes every remaining durable destination to its route boundary without fabricating a workout command", async () => {
    await render(<CalendarRoute />);

    await fireEvent.press(screen.getByRole("button", { name: "Open planned Strength event" }));
    await fireEvent.press(screen.getByRole("button", { name: "Open planned Running event" }));
    await fireEvent.press(screen.getByRole("button", { name: "Open imported Running event" }));

    expect(mockPush).toHaveBeenNthCalledWith(1, "/calendar/plan/occurrence-17?origin=calendar&returnEventId=event-occurrence-17");
    expect(mockPush).toHaveBeenNthCalledWith(2, "/library/running/running-plan-17?origin=calendar&sessionId=revision-17&returnEventId=event-plan-17");
    expect(mockPush).toHaveBeenNthCalledWith(3, {
      pathname: "/garmin/activity/[activityId]",
      params: {
        activityId: "activity-17",
        origin: "calendar",
      },
    });
    expect(mockPush.mock.calls.join(" ")).not.toMatch(/resume|correct|remove|match|workout/u);
  });
});
