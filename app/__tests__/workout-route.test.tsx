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
import type { ActiveWorkoutView } from "../../src/domains/workout";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockGetActiveWorkout = jest.fn<() => Promise<ActiveWorkoutView>>();
const mockCompleteSet = jest.fn();
const mockListOwnedPlanExercises = jest.fn<() => Promise<readonly Readonly<{
  id: string;
  name: string;
}>[]>>().mockResolvedValue([]);
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
    completeSet: mockCompleteSet,
    completeWarmup: jest.fn(),
    discardWorkout: jest.fn(),
    expireRest: jest.fn(),
    finishCompleted: jest.fn(),
    finishPartial: jest.fn(),
    getActiveWorkout: mockGetActiveWorkout,
    listOwnedPlanExercises: mockListOwnedPlanExercises,
    notificationPermission: "undetermined",
    pauseRest: jest.fn(),
    readRestAlertPreferences: () => ({ soundEnabled: false }),
    removeExercise: jest.fn(),
    removeWarmup: jest.fn(),
    removeWorkingSet: jest.fn(),
    reorderExercises: jest.fn(),
    replaceExercise: jest.fn(),
    resumeRest: jest.fn(),
    reviseCompletedSet: jest.fn(),
    saveZeroSetWorkout: jest.fn(),
    skipExercise: jest.fn(),
    skipRest: jest.fn(),
    startManualRest: jest.fn(),
    updateActiveSetDraft: jest.fn(),
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
    ActiveWorkoutScreen: ({ onGoBack, onFinishLater, onRequestPlanEdit }: Readonly<{
      onGoBack(): void;
      onFinishLater(): void;
      onRequestPlanEdit(): void;
    }>) => <>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Workout" onPress={onGoBack} />
      <Pressable accessibilityRole="button" accessibilityLabel="Edit plan after workout" onPress={onRequestPlanEdit} />
      <Pressable accessibilityRole="button" accessibilityLabel="Finish workout later" onPress={onFinishLater} />
    </>,
  };
});

import ActiveWorkoutRoute from "../workout/[sessionId]";

describe("ActiveWorkoutRoute", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockReplace.mockReset();
    mockGetActiveWorkout.mockReset();
    mockCompleteSet.mockReset();
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
      } as unknown as ActiveWorkoutView);

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

  it("does not issue a workout command when Active unmounts or returns", async () => {
    mockGetActiveWorkout.mockResolvedValue({
      id: "session-identity",
      status: "in_progress",
      revision: 3,
      activeSetId: null,
      activeExerciseId: null,
      currentExercise: {},
      exercises: [],
      progress: { completedWorkingSets: 0, totalWorkingSets: 0 },
      rest: { state: "idle", revision: 0, nextSetId: null },
    } as unknown as ActiveWorkoutView);
    const rendered = await render(<ActiveWorkoutRoute />);

    await waitFor(() => expect(mockGetActiveWorkout).toHaveBeenCalledWith("session-identity"));
    await fireEvent.press(screen.getByRole("button", { name: "Back to Workout" }));
    rendered.unmount();

    expect(mockCompleteSet).not.toHaveBeenCalled();
  });

  it("defers editing the owning plan until Finish workout later returns from Active", async () => {
    mockGetActiveWorkout.mockResolvedValue({
      id: "session-identity", status: "in_progress", revision: 3,
      planId: "plan-owner", activeSetId: null, activeExerciseId: null,
      currentExercise: {}, exercises: [], progress: { completedWorkingSets: 0, totalWorkingSets: 0 },
      rest: { state: "idle", revision: 0, nextSetId: null },
    } as unknown as ActiveWorkoutView);

    await render(<ActiveWorkoutRoute />);
    await waitFor(() => expect(mockGetActiveWorkout).toHaveBeenCalledWith("session-identity"));
    await fireEvent.press(screen.getByRole("button", { name: "Edit plan after workout" }));
    expect(mockReplace).not.toHaveBeenCalledWith("/library/plan/plan-owner/edit");
    await fireEvent.press(screen.getByRole("button", { name: "Finish workout later" }));

    expect(mockReplace).toHaveBeenCalledWith("/library/plan/plan-owner/edit");
  });
});
