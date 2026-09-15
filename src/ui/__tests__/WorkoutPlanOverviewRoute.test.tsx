import {
  act,
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

import type {
  ActiveWorkoutExercise,
  ActiveWorkoutView,
  WorkoutSessionView,
} from "../../domains/workout";
import { AppearanceProvider } from "../theme";

let mockSessionId = "session-a";
let mockRefreshGeneration = 0;
let mockFocusCallback: (() => void) | null = null;
let mockActiveWorkoutScreenInstanceCount = 0;
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockGetActiveWorkout = jest.fn<(
  sessionId: string,
) => Promise<WorkoutSessionView>>();

jest.mock("expo-router", () => ({
  router: {
    back: mockBack,
    replace: mockReplace,
  },
  useFocusEffect: (callback: () => void) => {
    mockFocusCallback = callback;
  },
  useLocalSearchParams: () => ({ sessionId: mockSessionId }),
}));

jest.mock("../../bootstrap/restCountdownCue", () => ({
  useRestCountdownCue: () => ({
    acknowledge: () => undefined,
    observe: () => undefined,
  }),
}));

jest.mock("../../bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    adjustRest: jest.fn(),
    addWarmup: jest.fn(),
    addWorkingSet: jest.fn(),
    completeSet: jest.fn(),
    completeWarmup: jest.fn(),
    discardWorkout: jest.fn(),
    expireRest: jest.fn(),
    finishCompleted: jest.fn(),
    finishPartial: jest.fn(),
    getActiveWorkout: mockGetActiveWorkout,
    openRestNotificationSettings: jest.fn(),
    pauseRest: jest.fn(),
    readRestAlertPreferences: () => ({ soundEnabled: false }),
    removeWarmup: jest.fn(),
    removeWorkingSet: jest.fn(),
    resumeRest: jest.fn(),
    reviseCompletedSet: jest.fn(),
    saveZeroSetWorkout: jest.fn(),
    skipExercise: jest.fn(),
    skipRest: jest.fn(),
    startManualRest: jest.fn(),
    updateActiveSetDraft: jest.fn(),
    updateWarmupDraft: jest.fn(),
    workoutRefreshGeneration: mockRefreshGeneration,
  }),
}));

jest.mock("../screens/ActiveWorkoutScreen", () => {
  const React = require("react") as typeof import("react");
  const { Text } = require("react-native") as typeof import("react-native");

  return {
    ActiveWorkoutScreen: ({
      sessionId,
      view,
    }: Readonly<{
      sessionId: string;
      view: ActiveWorkoutView;
    }>) => {
      const [instance] = React.useState(() => {
        mockActiveWorkoutScreenInstanceCount += 1;
        return mockActiveWorkoutScreenInstanceCount;
      });

      return (
        <>
          <Text accessibilityRole="header">Workout</Text>
          <Text>{view.currentExercise.name}</Text>
          <Text testID="active-workout-screen-instance">
            {`${sessionId}:${instance}`}
          </Text>
        </>
      );
    },
  };
});

import ActiveWorkoutRoute from "../../../app/workout/[sessionId]";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function activeWorkout(
  sessionId: string,
  exerciseName: string,
): ActiveWorkoutView {
  const exercise: ActiveWorkoutExercise = {
    id: `${sessionId}-exercise`,
    exerciseId: `${sessionId}-catalog-exercise`,
    name: exerciseName,
    metricIdentity: {
      profile: "load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    metricProfile: "load_reps",
    ordinal: 0,
    defaultRestSeconds: 90,
    status: "active",
    revision: 1,
    warmups: [],
    workingSets: [],
  };
  return {
    id: sessionId,
    status: "in_progress",
    revision: 1,
    activeSetId: null,
    activeExerciseId: exercise.id,
    currentExercise: exercise,
    exercises: [exercise],
    progress: {
      completedWorkingSets: 0,
      totalWorkingSets: 0,
    },
    rest: {
      version: 1,
      state: "idle",
      revision: 0,
      nextSetId: null,
    },
  };
}

async function renderRoute() {
  return render(
    <AppearanceProvider>
      <ActiveWorkoutRoute />
    </AppearanceProvider>,
  );
}

describe("ActiveWorkoutRoute", () => {
  beforeEach(() => {
    mockSessionId = "session-a";
    mockRefreshGeneration = 0;
    mockFocusCallback = null;
    mockActiveWorkoutScreenInstanceCount = 0;
    mockBack.mockReset();
    mockReplace.mockReset();
    mockGetActiveWorkout.mockReset();
  });

  it("never renders the prior session while a changed session is loading and keeps the overview identity", async () => {
    const sessionA = deferred<WorkoutSessionView>();
    const sessionB = deferred<WorkoutSessionView>();
    mockGetActiveWorkout.mockImplementation((sessionId) =>
      sessionId === "session-a" ? sessionA.promise : sessionB.promise
    );
    const rendered = await renderRoute();

    await act(async () => {
      sessionA.resolve(activeWorkout("session-a", "Back Squat"));
      await sessionA.promise;
    });
    expect(screen.getByRole("header", { name: "Workout" })).toBeOnTheScreen();

    mockSessionId = "session-b";
    await act(async () => {
      await rendered.rerender(
        <AppearanceProvider>
          <ActiveWorkoutRoute />
        </AppearanceProvider>,
      );
    });

    expect(screen.getByText("WORKOUT OVERVIEW"))
      .toBeOnTheScreen();
    expect(screen.queryByText("Back Squat")).not.toBeOnTheScreen();

    await act(async () => {
      sessionB.resolve(activeWorkout("session-b", "Bench Press"));
      await sessionB.promise;
    });
    expect(screen.getByText("Bench Press")).toBeOnTheScreen();
  });

  it("returns to loading when a failed request is refreshed", async () => {
    const failed = deferred<WorkoutSessionView>();
    const retry = deferred<WorkoutSessionView>();
    mockGetActiveWorkout.mockImplementation(() =>
      mockRefreshGeneration === 0 ? failed.promise : retry.promise
    );
    const rendered = await renderRoute();

    await act(async () => {
      failed.reject(new Error("unavailable"));
      await failed.promise.catch(() => undefined);
    });
    expect(screen.getByRole("header", {
      name: "Workout could not be opened",
    })).toBeOnTheScreen();

    mockRefreshGeneration = 1;
    await act(async () => {
      await rendered.rerender(
        <AppearanceProvider>
          <ActiveWorkoutRoute />
        </AppearanceProvider>,
      );
    });

    expect(screen.getByText("WORKOUT OVERVIEW"))
      .toBeOnTheScreen();
    await act(async () => {
      retry.resolve(activeWorkout("session-a", "Back Squat"));
      await retry.promise;
    });
    await waitFor(() => {
      expect(screen.getByText("Back Squat")).toBeOnTheScreen();
    });
  });

  it("remounts the same active workout overview when the route regains focus", async () => {
    mockGetActiveWorkout.mockResolvedValue(
      activeWorkout("session-a", "Back Squat"),
    );
    await renderRoute();

    await waitFor(() => {
      expect(screen.getByTestId("active-workout-screen-instance"))
        .toHaveTextContent("session-a:1");
    });
    expect(mockFocusCallback).toEqual(expect.any(Function));

    await act(async () => {
      mockFocusCallback?.();
    });

    expect(screen.getByTestId("active-workout-screen-instance"))
      .toHaveTextContent("session-a:2");
  });
});
