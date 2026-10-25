import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import React from "react";

import type { ActiveWorkoutView, CompleteSetResult } from "../../domains/workout";
import { ActiveWorkoutScreen, type ActiveWorkoutCommands } from "../screens/ActiveWorkoutScreen";
import { AppearanceProvider } from "../theme";
import { SemanticToastProvider } from "../components/SemanticToast";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (_algorithm: string, value: string) =>
    require("node:crypto").createHash("sha256").update(value).digest("hex"),
}));

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
    undoCompletedSet: jest.fn(async () => ({ outcome: "unavailable" as const })),
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
  it("queues rapid rest adjustments with the latest committed revisions", async () => {
    const initial = workoutView({ rest: { version: 1, state: "running", revision: 1, startedAtMs: 3_000, endsAtMs: 63_000, nextSetId: "working-1" } });
    let resolveFirst!: (result: import("../../domains/rest").RestCommandResult) => void;
    const first = new Promise<import("../../domains/rest").RestCommandResult>((resolve) => { resolveFirst = resolve; });
    const adjusted = { state: { ...initial.rest, state: "running" as const, startedAtMs: 3_000, endsAtMs: 48_000, revision: 2 }, sessionRevision: 2, invalidationScopes: [["active-workout", "session-1"], ["today"]] as const };
    const adjustRest = jest.fn<ActiveWorkoutCommands["adjustRest"]>().mockImplementationOnce(() => first).mockImplementationOnce(async () => ({ ...adjusted, state: { ...adjusted.state, endsAtMs: 33_000, revision: 3 }, sessionRevision: 3 }));
    await renderScreen(initial, { adjustRest });
    const control = screen.getByRole("button", { name: "Subtract 15 seconds from rest" });
    await act(async () => { await Promise.all([fireEvent.press(control), fireEvent.press(control)]); });
    expect(adjustRest).toHaveBeenCalledTimes(1);
    expect(adjustRest).toHaveBeenNthCalledWith(1, expect.objectContaining({ expectedSessionRevision: 1, expectedRestRevision: 1, deltaMs: -15_000 }));
    await act(() => { resolveFirst(adjusted); });
    await waitFor(() => expect(adjustRest).toHaveBeenCalledTimes(2));
    expect(adjustRest).toHaveBeenNthCalledWith(2, expect.objectContaining({ expectedSessionRevision: 2, expectedRestRevision: 2, deltaMs: -15_000 }));
    expect(screen.getByLabelText("00:30 remaining")).toBeOnTheScreen();
  });
  it("focuses the real Active header action before publishing a resumed-route receipt", async () => {
    const onInitialHeaderFocused = jest.fn();
    const view = workoutView();
    await render(
      <AppearanceProvider>
        <ActiveWorkoutScreen
          commands={commands(view)}
          initialHeaderFocus
          nowMs={() => 3_000}
          onFinishLater={jest.fn()}
          onGoBack={jest.fn()}
          onInitialHeaderFocused={onInitialHeaderFocused}
          sessionId={view.id}
          view={view}
        />
      </AppearanceProvider>,
    );

    await waitFor(() => expect(onInitialHeaderFocused).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "More workout actions" })).toHaveProp("hasTVPreferredFocus", true);
  });

  it("sets Return to Workout on every non-confirmation Active bottom-sheet call site", () => {
    const source = readFileSync("src/ui/screens/ActiveWorkoutScreen.tsx", "utf8");
    expect([...source.matchAll(/<BottomSheet\s+cancelLabel="Return to Workout"/gu)])
      .toHaveLength(6);
  });

  it("saves a per-exercise rest draft with authoritative revisions and a stable receipt envelope", async () => {
    const initial = workoutView();
    const saved = workoutView({
      revision: 2,
      currentExercise: { ...initial.currentExercise, defaultRestSeconds: 120 },
      exercises: [{ ...initial.exercises[0]!, defaultRestSeconds: 120 }],
    });
    const updateSessionExerciseDefaultRest = jest.fn(async () => saved);
    await renderScreen(initial, { updateSessionExerciseDefaultRest });

    await fireEvent.press(screen.getByRole("button", { name: "Open Back Squat menu" }));
    await fireEvent.press(screen.getByRole("button", { name: "Timing" }));
    await fireEvent.changeText(
      screen.getByLabelText("Between-set rest seconds for Back Squat"),
      "120",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save between-set rest" }));

    await waitFor(() => expect(updateSessionExerciseDefaultRest).toHaveBeenCalledTimes(1));
    expect(updateSessionExerciseDefaultRest).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: initial.id,
      sessionExerciseId: "exercise-1",
      defaultRestSeconds: 120,
      expectedSessionRevision: initial.revision,
      expectedSessionExerciseRevision: 1,
      occurredAtMs: 3_000,
      requestId: expect.stringMatching(/^exercise-rest:/u),
      requestSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    }));
    expect(screen.queryByLabelText("Between-set rest seconds for Back Squat")).toBeNull();
  });

  it("keeps the per-exercise rest draft open without a write acknowledgement on failure", async () => {
    const updateSessionExerciseDefaultRest = jest.fn(async () => {
      throw new Error("write_failed");
    });
    await renderScreen(workoutView(), { updateSessionExerciseDefaultRest });

    await fireEvent.press(screen.getByRole("button", { name: "Open Back Squat menu" }));
    await fireEvent.press(screen.getByRole("button", { name: "Timing" }));
    const input = screen.getByLabelText("Between-set rest seconds for Back Squat");
    await fireEvent.changeText(input, "120");
    await fireEvent.press(screen.getByRole("button", { name: "Save between-set rest" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Between-set rest was not saved"));
    expect(screen.getByLabelText("Between-set rest seconds for Back Squat")).toHaveProp("value", "120");
  });

  it("opens real plan settings only for the session's owning plan", async () => {
    const onOpenPlanSettings = jest.fn();
    await render(
      <AppearanceProvider>
        <ActiveWorkoutScreen
          commands={commands(workoutView({ planId: "plan-owner" }))}
          nowMs={() => 3_000}
          onFinishLater={jest.fn()}
          onGoBack={jest.fn()}
          onOpenPlanSettings={onOpenPlanSettings}
          sessionId="session-1"
          view={workoutView({ planId: "plan-owner" })}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "More workout actions" }));
    await fireEvent.press(screen.getByRole("button", { name: "Plan settings" }));
    expect(onOpenPlanSettings).toHaveBeenCalledTimes(1);
  });

  it("reloads durable facts before accepting an unknown finish receipt", async () => {
    const initial = workoutView({ activeSetId: null });
    const onOutcomeSaved = jest.fn();
    const onResolveUnknownOutcome = jest.fn(async () => ({
      id: initial.id,
      status: "completed",
    } as never));
    const finishCompleted = jest.fn<ActiveWorkoutCommands["finishCompleted"]>()
      .mockResolvedValue({
        detail: {
          id: "unexpected-session",
          status: "completed",
        } as never,
        invalidationScopes: [],
      });

    await render(
      <AppearanceProvider>
        <ActiveWorkoutScreen
          commands={commands(initial, { finishCompleted })}
          nowMs={() => 3_000}
          onFinishLater={jest.fn()}
          onGoBack={jest.fn()}
          onOutcomeSaved={onOutcomeSaved}
          onResolveUnknownOutcome={onResolveUnknownOutcome}
          sessionId={initial.id}
          view={initial}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Finish workout" }));

    await waitFor(() => expect(onResolveUnknownOutcome).toHaveBeenCalledWith(initial.id));
    expect(onOutcomeSaved).toHaveBeenCalledWith(initial.id);
  });

  it("keeps the workout active and offers an operation-specific retry when finishing fails", async () => {
    const onOutcomeSaved = jest.fn();
    const initial = workoutView({ activeSetId: null });
    const finishCompleted = jest.fn<ActiveWorkoutCommands["finishCompleted"]>()
      .mockRejectedValueOnce(new Error("storage_failed"));

    await render(
      <AppearanceProvider>
        <ActiveWorkoutScreen
          commands={commands(initial, { finishCompleted })}
          nowMs={() => 3_000}
          onFinishLater={jest.fn()}
          onGoBack={jest.fn()}
          onOutcomeSaved={onOutcomeSaved}
          sessionId={initial.id}
          view={initial}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Finish workout" }));

    await waitFor(() => {
      expect(screen.getByRole("header", {
        name: "Workout was not finished",
      })).toBeOnTheScreen();
    });
    expect(screen.getByText(
      "Your workout is still active. Your completed sets and rest are unchanged. Try finishing again.",
    )).toBeOnTheScreen();
    expect(onOutcomeSaved).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", {
      name: "Retry finishing workout",
    }));
    await waitFor(() => expect(finishCompleted).toHaveBeenCalledTimes(2));
  });

  it("keeps a failed partial save in its confirmation context and reuses its exact token", async () => {
    const finishPartial = jest.fn<ActiveWorkoutCommands["finishPartial"]>()
      .mockRejectedValueOnce(new Error("storage_failed"));
    const initial = workoutView();

    await render(
      <AppearanceProvider>
        <ActiveWorkoutScreen
          commands={commands(initial, { finishPartial })}
          nowMs={() => 3_000}
          onFinishLater={jest.fn()}
          onGoBack={jest.fn()}
          sessionId={initial.id}
          view={initial}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", {
      name: "More workout actions",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Finish as partial",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Save partial workout",
    }));

    await waitFor(() => expect(screen.getByRole("header", {
      name: "Partial workout was not saved",
    })).toBeOnTheScreen());
    expect(screen.getByText(
      "Your workout is still active. Your completed sets and current rest are unchanged. Try saving the partial workout again.",
    )).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", {
      name: "Retry saving partial workout",
    }));
    await waitFor(() => expect(finishPartial).toHaveBeenCalledTimes(2));
    expect(finishPartial.mock.calls[1]?.[0]).toEqual(finishPartial.mock.calls[0]?.[0]);
  });

  it("keeps the exercise overflow to Timing, Replace exercise, and Delete exercise", async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Open Back Squat menu" }));

    expect(screen.getByRole("button", { name: "Timing" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Replace exercise" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Delete exercise" })).toBeOnTheScreen();
    expect(within(screen.getByTestId("exercise-actions-sheet-content"))
      .queryByRole("button", { name: /trend/i })).not.toBeOnTheScreen();
  });

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
      name: "Open Back Squat menu",
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

    await fireEvent.press(screen.getByRole("button", { name: "Open Back Squat menu" }));
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
    await fireEvent.press(screen.getAllByRole("button", { name: "Return to Workout" })[1]!);

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
      name: /Back Squat\. 60 kg × 8 · 1\/1 complete\. Expand exercise/u,
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
      name: /Back Squat\. 60 kg × 8 · 1\/1 complete\. Expand exercise/u,
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
      name: /Back Squat\. 60 kg × 8 · 1\/1 complete\. Expand exercise/u,
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
      name: /Back Squat\. 60 kg × 8 · 1\/1 complete\. Expand exercise/u,
    })).toBeOnTheScreen());

    expect(completeSet).toHaveBeenCalledTimes(2);
    expect(completeSet.mock.calls[1]).toEqual(completeSet.mock.calls[0]);
  });

  it("offers contextual Undo after a committed set and restores the returned source view", async () => {
    const initial = workoutView();
    const completedSet = {
      ...initial.currentExercise.workingSets[0]!,
      completedAtMs: 3_000,
      revision: 2,
      status: "completed" as const,
    };
    const completed = {
      ...initial,
      activeSetId: null,
      currentExercise: {
        ...initial.currentExercise,
        status: "completed" as const,
        workingSets: [completedSet],
      },
      exercises: [{
        ...initial.currentExercise,
        status: "completed" as const,
        workingSets: [completedSet],
      }],
      revision: 2,
    };
    const undoCompletedSet = jest.fn<NonNullable<ActiveWorkoutCommands["undoCompletedSet"]>>()
      .mockResolvedValue({ outcome: "undone", view: initial });
    await render(
      <AppearanceProvider>
        <SemanticToastProvider>
          <ActiveWorkoutScreen
            commands={commands(initial, {
              completeSet: jest.fn(async () => ({ outcome: "committed" as const, view: completed })),
              undoCompletedSet,
            })}
            nowMs={() => 3_000}
            onFinishLater={jest.fn()}
            onGoBack={jest.fn()}
            sessionId={initial.id}
            view={initial}
          />
        </SemanticToastProvider>
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Complete Set 1" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Undo completed set" })).toBeOnTheScreen());
    await fireEvent.press(screen.getByRole("button", { name: "Undo completed set" }));

    await waitFor(() => expect(undoCompletedSet).toHaveBeenCalledWith({
      sessionId: "session-1",
      completedSetId: "working-1",
      nowMs: 3_000,
    }));
    expect(screen.getByRole("button", { name: "Complete Set 1" })).toBeOnTheScreen();
  });
});
