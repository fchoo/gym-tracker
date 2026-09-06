import {
  act,
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

let mockLaunchState: "booting" | "trusted" | "failed" = "booting";
let mockWorkoutRefreshGeneration = 0;
let resolvePreferenceRead: (() => void) | null = null;
const mockReadRestAlertPreferences = jest.fn<() => Readonly<{
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}> | Promise<Readonly<{
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}>>>(() => ({
  soundEnabled: false,
  vibrationEnabled: false,
}));
const mockSetRestAlertPreferences = jest.fn(async (preferences: Readonly<{
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}>) => ({ status: "persisted" as const, preferences }));
const mockLoadProgress = jest.fn<() => Promise<Readonly<{
  period: "all_time";
  freshness: "current" | "updating" | "unavailable";
  projection: Readonly<{
    recommendations: readonly Readonly<{
      id: string;
      lifecycle: string;
    }>[];
  }> | null;
}>>>(() => Promise.resolve({
  period: "all_time",
  freshness: "current",
  projection: { recommendations: [] },
}));
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (...args: readonly unknown[]) => mockPush(...args) },
}));

jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    actionFailure: undefined,
    failure: undefined,
    launchState: mockLaunchState,
    loadProgress: mockLoadProgress,
    notificationPermission: "undetermined",
    openRestNotificationSettings: jest.fn(),
    readRestAlertPreferences: mockReadRestAlertPreferences,
    retry: jest.fn(),
    setRestAlertPreferences: mockSetRestAlertPreferences,
    workoutRefreshGeneration: mockWorkoutRefreshGeneration,
  }),
}));

jest.mock("../../../src/ui/screens/TodayScreen", () => {
  const { Pressable, Text, View } = require("react-native") as typeof import("react-native");
  return {
    TodayScreen: ({
      launchState,
      onOpenSettings,
      onReviewSuggestion,
      pendingRecommendations,
      restAlertPreferences,
      restAlertPreferencesLoading,
    }: {
      launchState: string;
      onOpenSettings(): void;
      onReviewSuggestion(exerciseId: string): void;
      restAlertPreferences: Readonly<{
        soundEnabled: boolean;
        vibrationEnabled: boolean;
      }>;
      restAlertPreferencesLoading: boolean;
      pendingRecommendations: readonly { id: string }[];
    }) => (
      <View>
        <Text testID="today-route-state">{launchState}</Text>
        <Text testID="pending-review-count">
          {pendingRecommendations.length}
        </Text>
        <Pressable
          accessibilityLabel="Open Settings"
          accessibilityRole="button"
          onPress={() => onOpenSettings()}
        />
        <Pressable
          accessibilityLabel="Review pending target"
          accessibilityRole="button"
          onPress={() => onReviewSuggestion("bench")}
        />
      </View>
    ),
  };
});

import TodayRoute from "../index";

describe("TodayRoute readiness", () => {
  beforeEach(() => {
    mockLaunchState = "booting";
    mockWorkoutRefreshGeneration = 0;
    mockPush.mockReset();
    resolvePreferenceRead = null;
    mockReadRestAlertPreferences.mockReset();
    mockReadRestAlertPreferences.mockReturnValue({
      soundEnabled: false,
      vibrationEnabled: false,
    });
    mockSetRestAlertPreferences.mockReset();
    mockSetRestAlertPreferences.mockImplementation(async (preferences) => ({
      status: "persisted" as const,
      preferences,
    }));
    mockLoadProgress.mockReset();
    mockLoadProgress.mockResolvedValue({
      period: "all_time",
      freshness: "current",
      projection: { recommendations: [] },
    });
  });

  it.each(["booting", "failed"] as const)(
    "preserves Today route readiness while runtime is %s",
    async (launchState) => {
      mockLaunchState = launchState;

      await render(<TodayRoute />);

      expect(screen.getByTestId("today-route-state"))
        .toHaveTextContent(launchState);
    },
  );

  it("opens Progress when Today requests a source-backed target review", async () => {
    mockLaunchState = "trusted";

    await render(<TodayRoute />);
    await fireEvent.press(screen.getByRole("button", {
      name: "Review pending target",
    }));

    expect(mockPush).toHaveBeenCalledWith("/progress");
  });

  it("opens Settings from Today", async () => {
    mockLaunchState = "trusted";

    await render(<TodayRoute />);
    await fireEvent.press(screen.getByRole("button", {
      name: "Open Settings",
    }));

    expect(mockPush).toHaveBeenCalledWith("/more");
  });

  it("clears a prior pending review indicator when the next progress read is stale", async () => {
    mockLaunchState = "trusted";
    mockLoadProgress
      .mockResolvedValueOnce({
        period: "all_time",
        freshness: "current",
        projection: {
          recommendations: [{
            id: "recommendation-bench",
            lifecycle: "pending",
          }],
        },
      })
      .mockResolvedValueOnce({
        period: "all_time",
        freshness: "updating",
        projection: null,
      });

    const rendered = await render(<TodayRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("pending-review-count")).toHaveTextContent("1");
    });

    mockWorkoutRefreshGeneration = 1;
    await rendered.rerender(<TodayRoute />);

    await waitFor(() => {
      expect(screen.getByTestId("pending-review-count")).toHaveTextContent("0");
    });
  });
});
