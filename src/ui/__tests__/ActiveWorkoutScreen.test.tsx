import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { ActiveWorkoutView, CompleteSetResult } from "../../domains/workout";
import { ActiveWorkoutScreen, type ActiveWorkoutCommands } from "../screens/ActiveWorkoutScreen";
import { AppearanceProvider } from "../theme";

const identity = { profile: "load_reps" as const, contractVersion: 1, exerciseMetricGeneration: 1 };
const observation = { version: 1 as const, profile: "load_reps" as const, loadGrams: 60_000, reps: 8, source: "manual" as const };

function workoutView(overrides: Partial<ActiveWorkoutView> = {}): ActiveWorkoutView {
  const set = {
    id: "working-1", kind: "working" as const, ordinal: 0, sourceTargetId: "target-1",
    metricIdentity: identity,
    target: { version: 1 as const, profile: "load_reps" as const, loadGrams: 60_000, minReps: 6, maxReps: 8, incrementGrams: 2_500, perSide: false },
    observation, status: "planned" as const, completedAtMs: null, revision: 1,
    valueSources: [
      { source: "recommended" as const, observation: { ...observation, loadGrams: 62_500, reps: 6, source: "recommended" as const } },
      { source: "manual" as const, observation },
    ],
  };
  const exercise = {
    id: "exercise-1", exerciseId: "back-squat", name: "Back Squat", metricIdentity: identity,
    metricProfile: "load_reps" as const, ordinal: 0, defaultRestSeconds: 0,
    status: "active" as const, revision: 1, warmups: [], workingSets: [set],
  };
  return {
    id: "session-1", status: "in_progress", revision: 1, activeExerciseId: exercise.id,
    activeSetId: set.id, currentExercise: exercise, exercises: [exercise],
    progress: { completedWorkingSets: 0, totalWorkingSets: 1 },
    rest: { version: 1, state: "idle", revision: 0, nextSetId: null },
    ...overrides,
  };
}

function commands(view: ActiveWorkoutView, overrides: Partial<ActiveWorkoutCommands> = {}): ActiveWorkoutCommands {
  const rest = {
    state: view.rest,
    sessionRevision: view.revision,
    invalidationScopes: [["active-workout", view.id], ["today"]] as const,
  };
  return {
    updateActiveSetDraft: jest.fn(async () => view),
    updateWarmupDraft: jest.fn(async () => view),
    reviseCompletedSet: jest.fn(async () => ({ ...view, committedSetId: "working-1" })),
    completeSet: jest.fn(async () => ({ outcome: "already_completed" as const, view })),
    addWarmup: jest.fn(async () => ({ ...view, committedSetId: "warmup-1" })),
    addWorkingSet: jest.fn(async () => ({ ...view, committedSetId: "working-1" })),
    completeWarmup: jest.fn(async () => view),
    skipWarmup: jest.fn(async () => view),
    skipWorkingSet: jest.fn(async () => view),
    startManualRest: jest.fn(async () => rest),
    pauseRest: jest.fn(async () => rest),
    resumeRest: jest.fn(async () => rest),
    adjustRest: jest.fn(async () => rest),
    skipRest: jest.fn(async () => rest),
    expireRest: jest.fn(async () => rest),
    finishCompleted: jest.fn(async () => ({ detail: {} as never, invalidationScopes: [] })),
    finishPartial: jest.fn(async () => ({ detail: {} as never, invalidationScopes: [] })),
    saveZeroSetWorkout: jest.fn(async () => ({ detail: {} as never, invalidationScopes: [] })),
    discardWorkout: jest.fn(async () => ({ detail: {} as never, invalidationScopes: [] })),
    skipExercise: jest.fn(async () => ({ sessionId: view.id, status: "in_progress" as const, sessionRevision: view.revision })),
    ...overrides,
  };
}

async function renderScreen(view = workoutView(), commandOverrides: Partial<ActiveWorkoutCommands> = {}) {
  const renderedCommands = commands(view, commandOverrides);
  await render(
    <AppearanceProvider>
      <ActiveWorkoutScreen
        commands={renderedCommands}
        nowMs={() => 3_000}
        onFinishLater={jest.fn()}
        onGoBack={jest.fn()}
        sessionId={view.id}
        view={view}
      />
    </AppearanceProvider>,
  );
  return renderedCommands;
}

describe("ActiveWorkoutScreen explicit-save editor", () => {
  it("keeps the global add picker non-mutating until an exercise is selected and confirmed", async () => {
    const addExercise = jest.fn(async () => ({
      outcome: "committed" as const,
      sessionId: "session-1",
      sessionExerciseId: "added-exercise",
      setId: "added-set",
      sessionRevision: 2,
    }));
    const initial = workoutView();
    const renderedCommands = commands(initial, { addExercise });

    await render(
      <AppearanceProvider>
        <ActiveWorkoutScreen
          availableExercises={[
            { id: "deadlift", name: "Deadlift" },
            { id: "lat-pulldown", name: "Lat pulldown" },
          ]}
          commands={renderedCommands}
          nowMs={() => 3_000}
          onFinishLater={jest.fn()}
          onGoBack={jest.fn()}
          sessionId={initial.id}
          view={initial}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Add exercise" }));
    expect(addExercise).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Search exercises"), "dead");
    expect(screen.getByRole("button", { name: "Deadlift. Add exercise" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Lat pulldown. Add exercise" })).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Deadlift. Add exercise" }));
    expect(addExercise).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Add Deadlift" }));

    await waitFor(() => expect(addExercise).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      expectedSessionRevision: 1,
      libraryExerciseId: "deadlift",
    })));
  });

  it("explains an empty global add search without issuing a mutation", async () => {
    const addExercise = jest.fn<NonNullable<ActiveWorkoutCommands["addExercise"]>>();
    const initial = workoutView();
    await render(
      <AppearanceProvider>
        <ActiveWorkoutScreen
          availableExercises={[]}
          commands={commands(initial, { addExercise })}
          nowMs={() => 3_000}
          onFinishLater={jest.fn()}
          onGoBack={jest.fn()}
          sessionId={initial.id}
          view={initial}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Add exercise" }));

    expect(screen.getByText("No exercises found")).toBeOnTheScreen();
    expect(addExercise).not.toHaveBeenCalled();
  });

  it("requires explicit named delete confirmation and retains protected history truthfully", async () => {
    const base = workoutView();
    const completed = {
      ...base.currentExercise.workingSets[0]!,
      completedAtMs: 3_000,
      status: "completed" as const,
    };
    const protectedView = {
      ...base,
      activeSetId: null,
      currentExercise: {
        ...base.currentExercise,
        status: "completed" as const,
        workingSets: [completed],
      },
      exercises: [{
        ...base.currentExercise,
        status: "completed" as const,
        workingSets: [completed],
      }],
    };
    await renderScreen(protectedView);

    await fireEvent.press(screen.getByRole("button", {
      name: "Back Squat exercise actions",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete exercise" }));

    expect(screen.getByRole("header", { name: "Delete Back Squat?" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Confirm delete Back Squat" })).toBeOnTheScreen();
    expect(screen.getByText(/completed sets.*marked Skipped/u)).toBeOnTheScreen();
  });

  it("retries a failed replace with the exact receipt-fenced command envelope", async () => {
    let clock = 3_000;
    const replaceExercise = jest.fn<NonNullable<ActiveWorkoutCommands["replaceExercise"]>>()
      .mockRejectedValueOnce(new Error("storage_failed"));
    const initial = workoutView();
    await render(
      <AppearanceProvider>
        <ActiveWorkoutScreen
          availableExercises={[{ id: "deadlift", name: "Deadlift" }]}
          commands={commands(initial, { replaceExercise })}
          nowMs={() => clock++}
          onFinishLater={jest.fn()}
          onGoBack={jest.fn()}
          sessionId={initial.id}
          view={initial}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Back Squat exercise actions" }));
    await fireEvent.press(screen.getByRole("button", { name: "Replace exercise" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Deadlift" }));
    await fireEvent.press(screen.getByRole("button", { name: "Replace with Deadlift" }));
    await waitFor(() => expect(replaceExercise).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByRole("button", { name: "Retry replacing exercise" }));
    await waitFor(() => expect(replaceExercise).toHaveBeenCalledTimes(2));

    expect(replaceExercise.mock.calls[1]).toEqual(replaceExercise.mock.calls[0]);
  });

  it("scopes the two-option Add set menu to its invoking exercise", async () => {
    const initial = workoutView();
    const warmup = {
      ...initial.currentExercise.workingSets[0]!,
      id: "warmup-1",
      kind: "warmup" as const,
      ordinal: 0,
      sourceTargetId: null,
      metricIdentity: identity,
      status: "draft" as const,
    };
    const withWarmup = {
      ...initial,
      revision: 2,
      currentExercise: {
        ...initial.currentExercise,
        revision: 2,
        warmups: [warmup],
      },
    };
    const nextView = { ...withWarmup, exercises: [withWarmup.currentExercise] };
    const addWarmup = jest.fn(async () => ({ ...nextView, committedSetId: warmup.id }));
    await renderScreen(initial, { addWarmup });

    await fireEvent.press(screen.getByRole("button", { name: "Add set" }));
    expect(screen.getByRole("button", { name: "Add warm-up set" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Add working set" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Add circuit set" })).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Add warm-up set" }));

    await waitFor(() => expect(addWarmup).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      sessionExerciseId: "exercise-1",
    })));
    expect(screen.getByRole("button", { name: /Warm-up W1/u })).toBeOnTheScreen();
  });

  it("opens a facts-only row in one local editor, keeps source choice local, and cancels without a source write", async () => {
    const updateActiveSetDraft = jest.fn(async () => workoutView());
    await renderScreen(undefined, { updateActiveSetDraft });

    const row = screen.getByRole("button", { name: /Set 1\. 60 kg × 8\. Current\. Edit set values/u });
    expect(screen.queryByRole("button", { name: /reset|remove/u })).not.toBeOnTheScreen();
    await fireEvent.press(row);
    await fireEvent.press(screen.getByRole("button", { name: "Use recommended" }));
    expect(screen.getByLabelText("Load (kg)")).toHaveProp("value", "62.5");
    expect(screen.getByLabelText("Repetitions")).toHaveProp("value", "6");
    await fireEvent.changeText(screen.getByLabelText("Load (kg)"), "65");
    await fireEvent.changeText(screen.getByLabelText("Repetitions"), "9");
    expect(updateActiveSetDraft).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));

    expect(updateActiveSetDraft).not.toHaveBeenCalled();
    expect(screen.queryByTestId("workout-set-editor-sheet")).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /Set 1\. 60 kg × 8/u })).toBeOnTheScreen();
  });

  it("saves the selected source or direct draft once through the revision-fenced command", async () => {
    const saved = workoutView({
      revision: 2,
      currentExercise: { ...workoutView().currentExercise, revision: 2, workingSets: [{ ...workoutView().currentExercise.workingSets[0]!, observation: { ...observation, loadGrams: 65_000, reps: 9 }, status: "draft" as const, revision: 2 }] },
    });
    const savedWithExercises = { ...saved, exercises: [saved.currentExercise] };
    const updateActiveSetDraft = jest.fn(async () => savedWithExercises);
    await renderScreen(undefined, { updateActiveSetDraft });

    await fireEvent.press(screen.getByRole("button", { name: /Set 1\. 60 kg × 8/u }));
    await fireEvent.changeText(screen.getByLabelText("Load (kg)"), "65");
    await fireEvent.changeText(screen.getByLabelText("Repetitions"), "9");
    await fireEvent.press(screen.getByRole("button", { name: "Save set values" }));

    await waitFor(() => expect(updateActiveSetDraft).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1", setId: "working-1", expectedSetRevision: 1,
      metricIdentity: identity, observation: { ...observation, loadGrams: 65_000, reps: 9 },
    })));
    expect(screen.queryByTestId("workout-set-editor-sheet")).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /Set 1\. 65 kg × 9/u })).toBeOnTheScreen();
  });

  it("keeps a committed correction sheet and its draft open after a revision-fenced failure", async () => {
    const base = workoutView();
    const completedBase = workoutView({
      revision: 2, activeSetId: null,
      currentExercise: { ...base.currentExercise, status: "completed" as const, revision: 2, workingSets: [{ ...base.currentExercise.workingSets[0]!, status: "completed" as const, completedAtMs: 2_000, revision: 2 }] },
    });
    const completed = { ...completedBase, exercises: [completedBase.currentExercise] };
    const reviseCompletedSet = jest.fn(async () => { throw new Error("storage_failed"); });
    await renderScreen(completed, { reviseCompletedSet });

    await fireEvent.press(screen.getByRole("button", {
      name: /Back Squat\. Completed\. 1 of 1 working sets\. Expand exercise/u,
    }));
    await fireEvent.press(screen.getByRole("button", { name: /Set 1\. 60 kg × 8\. Completed/u }));
    await fireEvent.changeText(screen.getByLabelText("Load (kg)"), "65");
    await fireEvent.press(screen.getByRole("button", { name: "Save committed set edit" }));

    await waitFor(() => expect(reviseCompletedSet).toHaveBeenCalledWith(expect.objectContaining({
      setId: "working-1", expectedSetRevision: 2, observation: { ...observation, loadGrams: 65_000 },
    })));
    expect(screen.getByTestId("workout-set-editor-sheet")).toBeOnTheScreen();
    expect(screen.getByLabelText("Load (kg)")).toHaveProp("value", "65");
    expect(screen.getByText(/Your draft is still available; try Save again/u)).toBeOnTheScreen();
  });

  it("gates completion in the screen-owned dock until its exclusive transaction resolves", async () => {
    let resolveCompletion: (result: CompleteSetResult) => void = () => undefined;
    const completeSet = jest.fn(() => new Promise<CompleteSetResult>((resolve) => { resolveCompletion = resolve; }));
    await renderScreen(undefined, { completeSet });

    const complete = screen.getByRole("button", { name: "Complete Set 1" });
    await fireEvent.press(complete);
    await fireEvent.press(complete);
    expect(completeSet).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Complete Set 1" })).toBeDisabled();
    expect(screen.queryByText("Completed working set 1")).not.toBeOnTheScreen();

    const completedBase = workoutView({
      activeSetId: null,
      currentExercise: { ...workoutView().currentExercise, status: "completed" as const, workingSets: [{ ...workoutView().currentExercise.workingSets[0]!, status: "completed" as const, completedAtMs: 3_000 }] },
    });
    await act(async () => resolveCompletion({ outcome: "committed", view: { ...completedBase, exercises: [completedBase.currentExercise] } }));
    expect(screen.getByRole("button", {
      name: /Back Squat\. Completed\. 1 of 1 working sets\. Expand exercise/u,
    })).toBeOnTheScreen();
  });

  it("collapses the final exercise and reveals Finish workout only after its committed source view", async () => {
    const initial = workoutView();
    const completedExercise = {
      ...initial.currentExercise,
      status: "completed" as const,
      revision: 2,
      workingSets: initial.currentExercise.workingSets.map((set) => ({
        ...set,
        completedAtMs: 3_000,
        revision: 2,
        status: "completed" as const,
      })),
    };
    const completed = {
      ...initial,
      activeSetId: null,
      currentExercise: completedExercise,
      exercises: [completedExercise],
      progress: { completedWorkingSets: 1, totalWorkingSets: 1 },
      revision: 2,
    };
    await renderScreen(initial, {
      completeSet: jest.fn(async () => ({ outcome: "committed" as const, view: completed })),
    });

    await fireEvent.press(screen.getByRole("button", { name: "Complete Set 1" }));

    await waitFor(() => expect(screen.getByRole("button", {
      name: /Back Squat\. Completed\. 1 of 1 working sets\. Expand exercise/u,
    })).toBeOnTheScreen());
    expect(screen.getByRole("button", { name: "Finish workout" })).toBeOnTheScreen();
  });

  it("retries a failed screen-owned completion with the exact command envelope", async () => {
    const committedBase = workoutView({
      activeSetId: null,
      currentExercise: { ...workoutView().currentExercise, status: "completed" as const, workingSets: [{ ...workoutView().currentExercise.workingSets[0]!, status: "completed" as const, completedAtMs: 3_000 }] },
    });
    const committed = { ...committedBase, exercises: [committedBase.currentExercise] };
    const completeSet = jest.fn<ActiveWorkoutCommands["completeSet"]>()
      .mockRejectedValueOnce(new Error("storage_failed"))
      .mockResolvedValueOnce({ outcome: "committed", view: committed });
    await renderScreen(undefined, { completeSet });

    await fireEvent.press(screen.getByRole("button", { name: "Complete Set 1" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Set not saved · Retry" })).toBeOnTheScreen());
    await fireEvent.press(screen.getByRole("button", { name: "Set not saved · Retry" }));
    await waitFor(() => expect(screen.getByRole("button", {
      name: /Back Squat\. Completed\. 1 of 1 working sets\. Expand exercise/u,
    })).toBeOnTheScreen());

    expect(completeSet).toHaveBeenCalledTimes(2);
    expect(completeSet.mock.calls[1]).toEqual(completeSet.mock.calls[0]);
  });
});
