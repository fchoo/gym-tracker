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
import type { WorkoutPreference } from "../../src/domains/workout/workoutPreferences";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockGetActiveWorkout = jest.fn<() => Promise<ActiveWorkoutView>>();
const mockCompleteSet = jest.fn();
const mockReadWorkoutPreferences = jest.fn<() => Promise<WorkoutPreference>>().mockResolvedValue({
  version: 1 as const,
  planId: "plan-owner",
  defaultRestSeconds: 90,
  weightIncrementGrams: 2500 as const,
  revision: 3,
});
type WorkoutPreferenceWrite = Readonly<{
  planId: string;
  expectedRevision: number;
  defaultRestSeconds: number;
  weightIncrementGrams: WorkoutPreference["weightIncrementGrams"];
  updatedAtMs: number;
}>;
const mockSetWorkoutPreferences = jest.fn<(input: WorkoutPreferenceWrite) => Promise<void>>();
const mockListOwnedPlanExercises = jest.fn<() => Promise<readonly Readonly<{
  id: string;
  name: string;
}>[]>>().mockResolvedValue([]);
let mockParams: Readonly<{
  sessionId: string | string[];
  returnTo?: string;
  phase20CalendarFixture?: string;
  phase20CalendarEvidenceNonce?: string;
  phase20CalendarRequirementsSha256?: string;
}> = { sessionId: "session-identity" };
let mockInitialHeaderFocus = false;

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { android: { package: "com.fchoo.gymtracker.devtest" }, extra: { buildProfile: "development-test", nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance" } } },
}));

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
    readWorkoutPreferences: mockReadWorkoutPreferences,
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
    setWorkoutPreferences: mockSetWorkoutPreferences,
    updateSessionExerciseDefaultRest: jest.fn(),
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

jest.mock("../../src/ui/components/WorkoutPlanSettingsSheet", () => ({
  WorkoutPlanSettingsSheet: ({ visible, onSave }: Readonly<{
    visible: boolean;
    onSave(field: "defaultRestSeconds" | "weightIncrementGrams", value: number): Promise<void>;
  }>) => {
    if (!visible) return null;
    const { Pressable } = require("react-native") as typeof import("react-native");
    return <>
      <Pressable
        accessibilityLabel="Save default rest"
        accessibilityRole="button"
        onPress={() => { void onSave("defaultRestSeconds", 120); }}
      />
      <Pressable
        accessibilityLabel="Save weight increment"
        accessibilityRole="button"
        onPress={() => { void onSave("weightIncrementGrams", 5000); }}
      />
    </>;
  },
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
    ActiveWorkoutScreen: ({ initialHeaderFocus = false, onGoBack, onFinishLater, onOpenPlanSettings, onRequestPlanEdit }: Readonly<{
      initialHeaderFocus?: boolean;
      onGoBack(): void;
      onFinishLater(): void;
      onOpenPlanSettings(): void;
      onRequestPlanEdit(): void;
    }>) => {
      mockInitialHeaderFocus = initialHeaderFocus;
      return <>
        <Pressable testID="active-workout" />
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Workout" onPress={onGoBack} />
        <Pressable accessibilityRole="button" accessibilityLabel="Edit plan after workout" onPress={onRequestPlanEdit} />
        <Pressable accessibilityRole="button" accessibilityLabel="Open plan settings" onPress={onOpenPlanSettings} />
        <Pressable accessibilityRole="button" accessibilityLabel="Finish workout later" onPress={onFinishLater} />
      </>;
    },
  };
});

import ActiveWorkoutRoute from "../workout/[sessionId]";

describe("ActiveWorkoutRoute", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockReplace.mockReset();
    mockGetActiveWorkout.mockReset();
    mockCompleteSet.mockReset();
    mockReadWorkoutPreferences.mockClear();
    mockSetWorkoutPreferences.mockReset();
    mockListOwnedPlanExercises.mockClear();
    mockInitialHeaderFocus = false;
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

  it("loads the resumed Phase 20 partial fixture on the real Active route", async () => {
    mockParams = {
      sessionId: "v12-strength-partial",
      phase20CalendarFixture: "v12-calendar-isolated-facts-v1",
      phase20CalendarEvidenceNonce: "b".repeat(32),
      phase20CalendarRequirementsSha256: "a".repeat(64),
    };

    await render(<ActiveWorkoutRoute />);

    expect(await screen.findByTestId("active-workout")).toBeOnTheScreen();
    expect(mockInitialHeaderFocus).toBe(true);
    expect(mockGetActiveWorkout).not.toHaveBeenCalled();
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

  it("loads settings through the active session's authoritative plan id", async () => {
    mockGetActiveWorkout.mockResolvedValue({
      id: "session-identity", status: "in_progress", revision: 3,
      planId: "plan-owner", activeSetId: null, activeExerciseId: null,
      currentExercise: {}, exercises: [], progress: { completedWorkingSets: 0, totalWorkingSets: 0 },
      rest: { state: "idle", revision: 0, nextSetId: null },
    } as unknown as ActiveWorkoutView);

    await render(<ActiveWorkoutRoute />);
    await waitFor(() => expect(mockGetActiveWorkout).toHaveBeenCalledWith("session-identity"));
    await fireEvent.press(screen.getByRole("button", { name: "Open plan settings" }));
    await waitFor(() => expect(mockReadWorkoutPreferences).toHaveBeenCalledWith("plan-owner"));
  });

  it("writes only confirmed default rest against the latest saved increment and reloads the source", async () => {
    mockGetActiveWorkout.mockResolvedValue({
      id: "session-identity", status: "in_progress", revision: 3,
      planId: "plan-owner", activeSetId: null, activeExerciseId: null,
      currentExercise: {}, exercises: [], progress: { completedWorkingSets: 0, totalWorkingSets: 0 },
      rest: { state: "idle", revision: 0, nextSetId: null },
    } as unknown as ActiveWorkoutView);
    mockSetWorkoutPreferences.mockResolvedValue(undefined);

    await render(<ActiveWorkoutRoute />);
    await waitFor(() => expect(mockGetActiveWorkout).toHaveBeenCalledWith("session-identity"));
    await fireEvent.press(screen.getByRole("button", { name: "Open plan settings" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save default rest" })).toBeOnTheScreen());
    await fireEvent.press(screen.getByRole("button", { name: "Save default rest" }));

    await waitFor(() => expect(mockSetWorkoutPreferences).toHaveBeenCalledWith(expect.objectContaining({
      planId: "plan-owner",
      expectedRevision: 3,
      defaultRestSeconds: 120,
      weightIncrementGrams: 2500,
      updatedAtMs: expect.any(Number),
    })));
    expect(mockReadWorkoutPreferences).toHaveBeenLastCalledWith("plan-owner");
  });

  it("writes only confirmed weight increment against the latest saved rest after a conflict", async () => {
    mockGetActiveWorkout.mockResolvedValue({
      id: "session-identity", status: "in_progress", revision: 3,
      planId: "plan-owner", activeSetId: null, activeExerciseId: null,
      currentExercise: {}, exercises: [], progress: { completedWorkingSets: 0, totalWorkingSets: 0 },
      rest: { state: "idle", revision: 0, nextSetId: null },
    } as unknown as ActiveWorkoutView);
    mockReadWorkoutPreferences
      .mockResolvedValueOnce({ version: 1, planId: "plan-owner", defaultRestSeconds: 90, weightIncrementGrams: 2500, revision: 3 })
      .mockResolvedValueOnce({ version: 1, planId: "plan-owner", defaultRestSeconds: 90, weightIncrementGrams: 2500, revision: 3 })
      .mockResolvedValueOnce({ version: 1, planId: "plan-owner", defaultRestSeconds: 150, weightIncrementGrams: 2500, revision: 4 })
      .mockResolvedValueOnce({ version: 1, planId: "plan-owner", defaultRestSeconds: 150, weightIncrementGrams: 5000, revision: 5 });
    mockSetWorkoutPreferences
      .mockRejectedValueOnce(new Error("revision_conflict"))
      .mockResolvedValueOnce(undefined);

    await render(<ActiveWorkoutRoute />);
    await waitFor(() => expect(mockGetActiveWorkout).toHaveBeenCalledWith("session-identity"));
    await fireEvent.press(screen.getByRole("button", { name: "Open plan settings" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save weight increment" })).toBeOnTheScreen());
    await fireEvent.press(screen.getByRole("button", { name: "Save weight increment" }));

    await waitFor(() => expect(mockSetWorkoutPreferences).toHaveBeenCalledTimes(2));
    const [firstWrite, retryWrite] = mockSetWorkoutPreferences.mock.calls;
    expect(firstWrite?.[0]).toEqual(expect.objectContaining({
      expectedRevision: 3,
      defaultRestSeconds: 90,
      weightIncrementGrams: 5000,
    }));
    expect(retryWrite?.[0]).toEqual(expect.objectContaining({
      expectedRevision: 4,
      defaultRestSeconds: 150,
      weightIncrementGrams: 5000,
    }));
  });
});
