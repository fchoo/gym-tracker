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
  useWorkoutAppRuntime: () => ({ loadCalendarRange: jest.fn() }),
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
    CalendarScreen: ({ onOpenEvent }: Readonly<{ onOpenEvent(destination: unknown): void }>) => (
      <Pressable
        accessibilityLabel="Open completed Strength event"
        accessibilityRole="button"
        onPress={() => onOpenEvent({ kind: "session", sessionId: "session-17" })}
      />
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
    expect(mockPush).toHaveBeenCalledWith("/session/session-17?origin=calendar");
  });
});
