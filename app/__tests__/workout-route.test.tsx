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

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockGetActiveWorkout = jest.fn();
const mockListOwnedPlanExercises = jest.fn().mockResolvedValue([]);
let mockParams: Readonly<{
  sessionId: string;
  returnTo?: string;
}> = { sessionId: "session-identity" };

jest.mock("expo-router", () => ({
  router: {
    back: (...args: readonly unknown[]) => mockBack(...args),
    replace: (...args: readonly unknown[]) => mockReplace(...args),
  },
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => mockParams,
}));

jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    addExercise: jest.fn(),
    addWarmup: jest.fn(),
    addWorkingSet: jest.fn(),
    adjustRest: jest.fn(),
    beginAdvancedTimingClusterGap: jest.fn(),
    completeSet: jest.fn(),
    completeWarmup: jest.fn(),
    configureAdvancedTiming: jest.fn(),
    discardWorkout: jest.fn(),
    expireRest: jest.fn(),
    finishCompleted: jest.fn(),
    finishPartial: jest.fn(),
    getActiveWorkout: mockGetActiveWorkout,
    listOwnedPlanExercises: mockListOwnedPlanExercises,
    notificationPermission: "undetermined",
    pauseAdvancedTiming: jest.fn(),
    pauseRest: jest.fn(),
    readRestAlertPreferences: () => ({ soundEnabled: false }),
    reconcileAdvancedTiming: jest.fn(),
    removeExercise: jest.fn(),
    removeWarmup: jest.fn(),
    removeWorkingSet: jest.fn(),
    reorderExercises: jest.fn(),
    replaceExercise: jest.fn(),
    resumeAdvancedTiming: jest.fn(),
    resumeRest: jest.fn(),
    reviseCompletedSet: jest.fn(),
    saveZeroSetWorkout: jest.fn(),
    skipExercise: jest.fn(),
    skipRest: jest.fn(),
    startAdvancedTiming: jest.fn(),
    startManualRest: jest.fn(),
    stopAdvancedTiming: jest.fn(),
    updateActiveSetDraft: jest.fn(),
    updateSessionExerciseAdvancedTiming: jest.fn(),
    updateSessionSetAdvancedTiming: jest.fn(),
    updateWarmupDraft: jest.fn(),
    workoutRefreshGeneration: 0,
  }),
}));

jest.mock("../../src/bootstrap/restCountdownCue", () => ({
  useRestCountdownCue: () => null,
}));

jest.mock("../../src/bootstrap/workoutMutationTestControls", () => ({
  createWorkoutMutationTestCommandAdapters: (commands: unknown) => commands,
}));

jest.mock("../../src/ui/screens/RootScreens", () => ({
  ActiveWorkoutLoadingScreen: () => null,
}));

jest.mock("../../src/ui/components", () => {
  const { Pressable, Text } = require("react-native") as typeof import("react-native");
  return {
    EmptyState: ({ heading, primaryAction }: Readonly<{
      heading: string;
      primaryAction: React.ReactNode;
    }>) => <><Text>{heading}</Text>{primaryAction}</>,
    PrimaryAction: ({ label, onPress }: Readonly<{
      label: string;
      onPress(): void;
    }>) => <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} />,
    ScreenHeader: () => null,
  };
});

jest.mock("../../src/ui/layout/AdaptiveScreen", () => ({
  AdaptiveScreen: ({ primary }: Readonly<{ primary: React.ReactNode }>) => primary,
}));

jest.mock("../../src/ui/screens/ActiveWorkoutScreen", () => {
  const { Pressable } = require("react-native") as typeof import("react-native");
  return {
    ActiveWorkoutScreen: ({ onGoBack }: Readonly<{ onGoBack(): void }>) => (
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Workout" onPress={onGoBack} />
    ),
  };
});

import ActiveWorkoutRoute from "../workout/[sessionId]";

describe("ActiveWorkoutRoute", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockReplace.mockReset();
    mockGetActiveWorkout.mockReset();
    mockListOwnedPlanExercises.mockClear();
    mockParams = {
      sessionId: "session-identity",
      returnTo: "/(tabs)",
    };
  });

  it("retries the exact failed session read and returns to its owning Workout context", async () => {
    mockGetActiveWorkout
      .mockRejectedValueOnce(new Error("read_failed"))
      .mockResolvedValueOnce({
        id: "session-identity",
        status: "in_progress",
        revision: 3,
        activeSetId: null,
        activeExerciseId: null,
        currentExercise: {},
        exercises: [],
        progress: { completedWorkingSets: 0, totalWorkingSets: 0 },
        rest: { state: "idle", revision: 0, nextSetId: null },
      });

    await render(<ActiveWorkoutRoute />);

    await waitFor(() => {
      expect(screen.getByText("Workout could not be opened")).toBeOnTheScreen();
    });
    await fireEvent.press(screen.getByRole("button", {
      name: "Retry opening workout data",
    }));
    await waitFor(() => {
      expect(mockGetActiveWorkout).toHaveBeenCalledTimes(2);
      expect(mockGetActiveWorkout).toHaveBeenLastCalledWith("session-identity");
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Back to Workout",
    }));
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
    expect(mockBack).not.toHaveBeenCalled();
  });
});
