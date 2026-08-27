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
  useLocalSearchParams: () => ({ sessionId: mockSessionId }),
}));

jest.mock("../../bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    getActiveWorkout: mockGetActiveWorkout,
    workoutRefreshGeneration: mockRefreshGeneration,
  }),
}));

import WorkoutPlanOverviewRoute from "../../../app/workout-plan/[sessionId]";

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
      <WorkoutPlanOverviewRoute />
    </AppearanceProvider>,
  );
}

describe("WorkoutPlanOverviewRoute", () => {
  beforeEach(() => {
    mockSessionId = "session-a";
    mockRefreshGeneration = 0;
    mockBack.mockReset();
    mockReplace.mockReset();
    mockGetActiveWorkout.mockReset();
  });

  it("never renders the prior session while a changed session is loading", async () => {
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
    expect(screen.getByLabelText(
      "1. Back Squat. Current. Open for review",
    )).toBeOnTheScreen();

    mockSessionId = "session-b";
    await act(async () => {
      await rendered.rerender(
        <AppearanceProvider>
          <WorkoutPlanOverviewRoute />
        </AppearanceProvider>,
      );
    });

    expect(screen.getByLabelText("Loading today's plan"))
      .toBeOnTheScreen();
    expect(screen.queryByText("Back Squat")).not.toBeOnTheScreen();

    await act(async () => {
      sessionB.resolve(activeWorkout("session-b", "Bench Press"));
      await sessionB.promise;
    });
    expect(screen.getByLabelText(
      "1. Bench Press. Current. Open for review",
    )).toBeOnTheScreen();
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
      name: "Today's plan could not be opened",
    })).toBeOnTheScreen();

    mockRefreshGeneration = 1;
    await act(async () => {
      await rendered.rerender(
        <AppearanceProvider>
          <WorkoutPlanOverviewRoute />
        </AppearanceProvider>,
      );
    });

    expect(screen.getByLabelText("Loading today's plan"))
      .toBeOnTheScreen();
    await act(async () => {
      retry.resolve(activeWorkout("session-a", "Back Squat"));
      await retry.promise;
    });
    await waitFor(() => {
      expect(screen.getByLabelText(
        "1. Back Squat. Current. Open for review",
      )).toBeOnTheScreen();
    });
  });
});
