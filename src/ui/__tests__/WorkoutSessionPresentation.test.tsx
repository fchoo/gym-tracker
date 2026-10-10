import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";

import {
  presentWorkoutSession,
  type WorkoutPresentationModel,
} from "../../domains/workout/workoutPresentation";
import type { ActiveWorkoutView } from "../../domains/workout";
import { WorkoutSessionPresentation } from "../components/WorkoutSessionPresentation";
import { AppearanceProvider } from "../theme";

const model: WorkoutPresentationModel = {
  sessionId: "session-1",
  revision: 4,
  progress: { completedWorkingSets: 1, totalWorkingSets: 2 },
  activeExerciseId: "session-exercise-1",
  exercises: [
    {
      id: "session-exercise-1",
      exerciseId: "exercise-squat",
      name: "Back squat",
      status: "active",
      warmups: [{
        id: "warmup-1", kind: "warmup", ordinal: 1, status: "completed",
        previous: null, target: "40 kg × 8", result: "40 kg × 8",
      }],
      workingSets: [{
        id: "working-1", kind: "working", ordinal: 1, status: "draft",
        previous: "60 kg × 5", target: "80 kg × 5", result: null,
      }],
    },
    {
      id: "session-exercise-2",
      exerciseId: "exercise-row",
      name: "Cable row",
      status: "planned",
      warmups: [],
      workingSets: [{
        id: "working-2", kind: "working", ordinal: 1, status: "planned",
        previous: null, target: "45 kg × 10", result: null,
      }],
    },
  ],
};

describe("WorkoutSessionPresentation", () => {
  it("renders immutable facts with one active exercise edge and local disclosure", async () => {
    await render(
      <AppearanceProvider>
        <WorkoutSessionPresentation model={model} />
      </AppearanceProvider>,
    );

    expect(screen.getByText("Back squat")).toBeOnTheScreen();
    expect(screen.getByText("W1")).toBeOnTheScreen();
    expect(screen.getByText("01")).toBeOnTheScreen();
    expect(screen.getByTestId("workout-presentation-exercise-session-exercise-1"))
      .toHaveStyle({ borderLeftWidth: 4 });
    expect(screen.queryByText("45 kg × 10")).not.toBeOnTheScreen();

    fireEvent.press(screen.getByRole("button", {
      name: /Cable row.*Expand exercise/u,
    }));

    await waitFor(() => expect(screen.getByText("45 kg × 10")).toBeOnTheScreen());
  });

  it("maps a live workout view without creating commands", () => {
    const result = presentWorkoutSession({
      id: "session-2",
      status: "in_progress",
      revision: 3,
      activeSetId: "set-1",
      activeExerciseId: "exercise-1",
      currentExercise: {
        id: "exercise-1", exerciseId: "exercise-1", name: "Press",
        metricIdentity: "load_reps", metricProfile: "load_reps", status: "active",
        origin: "plan", revision: 1, warmups: [], workingSets: [{
          id: "set-1", kind: "working", ordinal: 1, sourceTargetId: "target-1",
          metricIdentity: "load_reps", metricProfile: "load_reps", status: "planned",
          revision: 1, target: { profile: "load_reps", loadGrams: 50000, minReps: 5, maxReps: 5 },
          observation: null, valueSources: [],
        }],
      },
      exercises: [],
      progress: { completedWorkingSets: 0, totalWorkingSets: 1 },
      rest: { state: "idle", revision: 1, nextSetId: "set-1" },
    } as unknown as ActiveWorkoutView);

    expect(result.activeExerciseId).toBe("exercise-1");
    expect(result.exercises[0]?.workingSets[0]).toMatchObject({
      id: "set-1", target: "50 kg × 5", result: null,
    });
  });
});
