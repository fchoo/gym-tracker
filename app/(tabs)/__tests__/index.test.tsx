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
      onChangeRestAlertPreferences,
      onReadRestAlertPreferences,
      onReviewSuggestion,
      pendingRecommendations,
      restAlertPreferences,
      restAlertPreferencesLoading,
    }: {
      launchState: string;
      onChangeRestAlertPreferences(preferences: Readonly<{
        soundEnabled: boolean;
        vibrationEnabled: boolean;
      }>): Promise<unknown>;
      onReadRestAlertPreferences(): Promise<void>;
      onReviewSuggestion(exerciseId: string): void;
      restAlertPreferences: Readonly<{
        soundEnabled: boolean;
        vibrationEnabled: boolean;
      }>;
      restAlertPreferencesLoading: boolean;
      pendingRecommendations: readonly { id: string }[];
    }) => (
      <View>
        <Text testID="today-route-state">
          {`${launchState}:${restAlertPreferences.soundEnabled}:${restAlertPreferences.vibrationEnabled}:${restAlertPreferencesLoading}`}
        </Text>
        <Text testID="pending-review-count">
          {pendingRecommendations.length}
        </Text>
        <Pressable
          accessibilityLabel="Open rest alerts"
          accessibilityRole="button"
          onPress={() => { void onReadRestAlertPreferences(); }}
        />
        <Pressable
          accessibilityLabel="Save rest alerts"
          accessibilityRole="button"
          onPress={() => {
            void onChangeRestAlertPreferences({
              soundEnabled: false,
              vibrationEnabled: true,
            });
          }}
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
    "uses immutable default rest-alert preferences before runtime is %s",
    async (launchState) => {
      mockLaunchState = launchState;

      await render(<TodayRoute />);

      expect(mockReadRestAlertPreferences).not.toHaveBeenCalled();
      expect(screen.getByTestId("today-route-state"))
        .toHaveTextContent(`${launchState}:true:true:false`);
    },
  );

  it("loads persisted rest-alert preferences only when the trusted settings action opens", async () => {
    mockLaunchState = "trusted";
    const readGate = new Promise<void>((resolve) => {
      resolvePreferenceRead = resolve;
    });
    mockReadRestAlertPreferences.mockImplementationOnce(async () => {
      await readGate;
      return { soundEnabled: false, vibrationEnabled: false };
    });

    await render(<TodayRoute />);

    expect(mockReadRestAlertPreferences).not.toHaveBeenCalled();
    expect(screen.getByTestId("today-route-state"))
      .toHaveTextContent("trusted:true:true:false");

    await fireEvent.press(screen.getByRole("button", {
      name: "Open rest alerts",
    }));

    expect(screen.getByTestId("today-route-state"))
      .toHaveTextContent("trusted:true:true:true");
    resolvePreferenceRead?.();
    await waitFor(() => {
      expect(mockReadRestAlertPreferences).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("today-route-state"))
        .toHaveTextContent("trusted:false:false:false");
    });
  });

  it("settles a rejected preference read to immutable default-on values", async () => {
    mockLaunchState = "trusted";
    mockReadRestAlertPreferences.mockImplementationOnce(() => {
      throw new Error("preference_read_failed");
    });

    await render(<TodayRoute />);
    await fireEvent.press(screen.getByRole("button", {
      name: "Open rest alerts",
    }));

    await waitFor(() => {
      expect(screen.getByTestId("today-route-state"))
        .toHaveTextContent("trusted:true:true:false");
    });
  });

  it("ignores an in-flight preference read after the runtime leaves trusted state", async () => {
    mockLaunchState = "trusted";
    const readGate = new Promise<void>((resolve) => {
      resolvePreferenceRead = resolve;
    });
    mockReadRestAlertPreferences.mockImplementationOnce(async () => {
      await readGate;
      return { soundEnabled: false, vibrationEnabled: false };
    });
    const rendered = await render(<TodayRoute />);

    await fireEvent.press(screen.getByRole("button", {
      name: "Open rest alerts",
    }));
    mockLaunchState = "failed";
    await rendered.rerender(<TodayRoute />);
    expect(screen.getByTestId("today-route-state"))
      .toHaveTextContent("failed:true:true:false");

    await act(async () => {
      resolvePreferenceRead?.();
      await readGate;
    });
    expect(screen.getByTestId("today-route-state"))
      .toHaveTextContent("failed:true:true:false");
  });

  it("keeps route preferences aligned with the persisted write result", async () => {
    mockLaunchState = "trusted";

    await render(<TodayRoute />);
    await fireEvent.press(screen.getByRole("button", {
      name: "Save rest alerts",
    }));

    await waitFor(() => {
      expect(mockSetRestAlertPreferences).toHaveBeenCalledWith({
        soundEnabled: false,
        vibrationEnabled: true,
      });
      expect(screen.getByTestId("today-route-state"))
        .toHaveTextContent("trusted:false:true:false");
    });
  });

  it("opens Progress when Today requests a source-backed target review", async () => {
    mockLaunchState = "trusted";

    await render(<TodayRoute />);
    await fireEvent.press(screen.getByRole("button", {
      name: "Review pending target",
    }));

    expect(mockPush).toHaveBeenCalledWith("/progress");
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
