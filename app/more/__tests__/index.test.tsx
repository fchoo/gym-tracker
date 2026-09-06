import {
  fireEvent,
  render,
  screen,
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

import {
  AppearanceProvider,
} from "../../../src/ui/theme";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockOpenRestNotificationSettings = jest.fn();
const mockReadRestAlertPreferences = jest.fn();
const mockSetRestAlertPreferences = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    push: (href: string) => mockPush(href),
  },
}));

jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    launchState: "trusted",
    notificationPermission: "granted",
    openRestNotificationSettings: mockOpenRestNotificationSettings,
    readRestAlertPreferences: mockReadRestAlertPreferences,
    setRestAlertPreferences: mockSetRestAlertPreferences,
  }),
}));

import MoreRoute from "../index";

describe("MoreRoute Settings ownership", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockPush.mockReset();
    mockOpenRestNotificationSettings.mockReset();
    mockReadRestAlertPreferences.mockReset();
    mockReadRestAlertPreferences.mockReturnValue({
      soundEnabled: false,
      vibrationEnabled: true,
    });
    mockSetRestAlertPreferences.mockReset();
    mockSetRestAlertPreferences.mockImplementation(async (preferences) => ({
      status: "persisted" as const,
      preferences,
    }));
  });

  it("owns the sole Settings destination, saved rest preferences, and nested destinations", async () => {
    await render(
      <AppearanceProvider>
        <MoreRoute />
      </AppearanceProvider>,
    );

    expect(screen.getByRole("header", { name: "Settings" }))
      .toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "More" }))
      .not.toBeOnTheScreen();
    await waitFor(() => expect(mockReadRestAlertPreferences).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("switch", { name: "Rest sound" }))
      .toHaveProp(
        "accessibilityState",
        expect.objectContaining({ checked: false }),
      );

    await fireEvent.press(screen.getByRole("switch", { name: "Rest sound" }));
    await waitFor(() => expect(mockSetRestAlertPreferences).toHaveBeenCalledWith({
      soundEnabled: true,
      vibrationEnabled: true,
    }));

    await fireEvent.press(screen.getByRole("button", {
      name: "Removed sessions",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Data and recovery",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));

    expect(mockPush).toHaveBeenNthCalledWith(1, "/more/removed-sessions");
    expect(mockPush).toHaveBeenNthCalledWith(2, "/more/data-and-recovery");
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
