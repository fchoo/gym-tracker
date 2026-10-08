import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";
import { Appearance, Dimensions, Keyboard, ScrollView } from "react-native";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async () => "a".repeat(64),
}));

import type {
  AdvancedTimingCommandResult,
  AdvancedTimingStateV1,
} from "../../domains/advancedTiming";
import type {
  RestCommandResult,
} from "../../domains/rest";
import type {
  ActiveWorkoutView,
  CompleteSetResult,
  EmptyWorkoutView,
} from "../../domains/workout";
import {
  ActiveWorkoutScreen,
  type ActiveWorkoutCommands,
} from "../screens/ActiveWorkoutScreen";
import {
  AppearanceProvider,
  createMemoryAppearanceStore,
  sizes,
  themes,
} from "../theme";

function loadReps(
  loadGrams: number,
  reps: number,
  source: "recommended" | "last_workout" | "plan_default" | "manual",
) {
  return {
    version: 1 as const,
    profile: "load_reps" as const,
    loadGrams,
    reps,
    source,
  };
}

const loadRepsIdentity = {
  profile: "load_reps" as const,
  contractVersion: 1,
  exerciseMetricGeneration: 1,
};

const initialView: ActiveWorkoutView = {
  id: "session-1",
  status: "in_progress",
  revision: 1,
  activeExerciseId: "session-exercise-1",
  activeSetId: "working-1",
  currentExercise: {
    id: "session-exercise-1",
    exerciseId: "squat",
    name: "Back Squat",
    metricIdentity: loadRepsIdentity,
    metricProfile: "load_reps",
    ordinal: 0,
    defaultRestSeconds: 180,
    status: "active",
    revision: 1,
    warmups: [
      {
        id: "warmup-1",
        kind: "warmup",
        ordinal: 0,
        sourceTargetId: null,
        metricIdentity: loadRepsIdentity,
        target: {
          version: 1,
          profile: "load_reps",
          loadGrams: 20_000,
          minReps: 8,
          maxReps: 8,
          incrementGrams: 2_500,
          perSide: false,
        },
        observation: null,
        status: "planned",
        completedAtMs: null,
        revision: 1,
        valueSources: [],
      },
    ],
    workingSets: [
      {
        id: "working-1",
        kind: "working",
        ordinal: 0,
        sourceTargetId: "target-1",
        metricIdentity: loadRepsIdentity,
        target: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          minReps: 6,
          maxReps: 8,
          incrementGrams: 2_500,
          perSide: false,
        },
        observation: null,
        status: "planned",
        completedAtMs: null,
        revision: 1,
        valueSources: [
          {
            source: "recommended",
            observation: loadReps(62_500, 6, "recommended"),
          },
          {
            source: "last_workout",
            observation: loadReps(60_000, 7, "last_workout"),
          },
          {
            source: "plan_default",
            observation: loadReps(60_000, 8, "plan_default"),
          },
          {
            source: "manual",
            observation: loadReps(60_000, 8, "manual"),
          },
        ],
      },
      {
        id: "working-2",
        kind: "working",
        ordinal: 1,
        sourceTargetId: "target-2",
        metricIdentity: loadRepsIdentity,
        target: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          minReps: 6,
          maxReps: 8,
          incrementGrams: 2_500,
          perSide: false,
        },
        observation: null,
        status: "planned",
        completedAtMs: null,
        revision: 1,
        valueSources: [
          {
            source: "plan_default",
            observation: loadReps(60_000, 8, "plan_default"),
          },
          {
            source: "manual",
            observation: loadReps(60_000, 8, "manual"),
          },
        ],
      },
    ],
  },
  exercises: [],
  progress: {
    completedWorkingSets: 0,
    totalWorkingSets: 2,
  },
  rest: {
    version: 1,
    state: "idle",
    revision: 0,
    nextSetId: null,
  },
};

const completedView: ActiveWorkoutView = {
  ...initialView,
  revision: 2,
  activeSetId: "working-2",
  currentExercise: {
    ...initialView.currentExercise,
    revision: 2,
    workingSets: [
      {
        ...initialView.currentExercise.workingSets[0]!,
        observation: loadReps(60_000, 8, "plan_default"),
        status: "completed",
        completedAtMs: 2_000,
        revision: 2,
      },
      initialView.currentExercise.workingSets[1]!,
    ],
  },
  progress: {
    completedWorkingSets: 1,
    totalWorkingSets: 2,
  },
  rest: {
    version: 1,
    state: "running",
    revision: 1,
    startedAtMs: 2_000,
    endsAtMs: 182_000,
    nextSetId: "working-2",
  },
};

function overviewView(): ActiveWorkoutView {
  const completedExercise = {
    ...initialView.currentExercise,
    id: "session-exercise-1",
    name: "Back Squat",
    revision: 7,
    status: "completed" as const,
    workingSets: initialView.currentExercise.workingSets.map((set) => ({
      ...set,
      status: "completed" as const,
      completedAtMs: 1_000,
      revision: 11,
    })),
  };
  const activeExercise = {
    ...initialView.currentExercise,
    id: "session-exercise-2",
    exerciseId: "bench-press",
    name: "Bench Press",
    ordinal: 1,
    revision: 13,
    workingSets: initialView.currentExercise.workingSets.map((set, index) => ({
      ...set,
      id: `bench-working-${index + 1}`,
      revision: 17 + index,
    })),
  };
  return {
    ...initialView,
    activeExerciseId: activeExercise.id,
    activeSetId: "bench-working-1",
    currentExercise: activeExercise,
    exercises: [completedExercise, activeExercise],
  };
}

function emptyWorkoutView(): EmptyWorkoutView {
  return {
    state: "empty_workout",
    id: "empty-session",
    status: "in_progress",
    revision: 41,
    activeSetId: null,
    activeExerciseId: null,
    progress: { completedWorkingSets: 0, totalWorkingSets: 0 },
    rest: {
      version: 1,
      state: "idle",
      revision: 0,
      nextSetId: null,
    },
  };
}

function commands(
  overrides: Partial<ActiveWorkoutCommands> = {},
): ActiveWorkoutCommands {
  const restResult = (state = initialView.rest): RestCommandResult => ({
    state,
    sessionRevision: initialView.revision + 1,
    invalidationScopes: [
      ["active-workout", initialView.id],
      ["today"],
    ],
  });
  return {
    updateActiveSetDraft: jest.fn(async () => initialView),
    updateWarmupDraft: jest.fn(async () => initialView),
    addWarmup: jest.fn(async () => ({
      ...initialView,
      committedSetId: "warmup-1",
    })),
    addWorkingSet: jest.fn(async () => ({
      ...initialView,
      committedSetId: "working-1",
    })),
    completeWarmup: jest.fn(async () => initialView),
    skipWarmup: jest.fn(async () => initialView),
    skipWorkingSet: jest.fn(async () => initialView),
    reviseCompletedSet: jest.fn(async () => ({
      ...initialView,
      committedSetId: "working-1",
    })),
    completeSet: jest.fn<ActiveWorkoutCommands["completeSet"]>(async () => ({
      outcome: "committed",
      view: completedView,
    })),
    startManualRest: jest.fn(async () => restResult()),
    pauseRest: jest.fn(async () => restResult()),
    resumeRest: jest.fn(async () => restResult()),
    adjustRest: jest.fn(async () => restResult()),
    skipRest: jest.fn(async () => restResult()),
    expireRest: jest.fn(async () => restResult()),
    finishCompleted: jest.fn(async () => ({
      detail: {} as never,
      invalidationScopes: [],
    })),
    finishPartial: jest.fn(async () => ({
      detail: {} as never,
      invalidationScopes: [],
    })),
    saveZeroSetWorkout: jest.fn(async () => ({
      detail: {} as never,
      invalidationScopes: [],
    })),
    discardWorkout: jest.fn(async () => ({
      detail: {} as never,
      invalidationScopes: [],
    })),
    skipExercise: jest.fn(async () => ({
      sessionId: initialView.id,
      status: "in_progress" as const,
      sessionRevision: initialView.revision + 1,
    })),
    ...overrides,
  };
}

function advancedResult(
  state: AdvancedTimingStateV1,
  sessionRevision = initialView.revision,
): AdvancedTimingCommandResult {
  return {
    state,
    sessionRevision,
    invalidationScopes: [["active-workout", initialView.id], ["today"]],
  };
}

async function renderActive(
  overrides: Partial<React.ComponentProps<typeof ActiveWorkoutScreen>> = {},
  appearance?: "Light" | "Dark",
  reduceMotion = false,
) {
  const activeCommands = overrides.commands ?? commands();
  const props = {
    commands: activeCommands,
    nowMs: () => 2_000,
    onFinishLater: jest.fn(),
    onGoBack: jest.fn(),
    sessionId: "session-1",
    view: initialView,
    ...overrides,
  } satisfies React.ComponentProps<typeof ActiveWorkoutScreen>;
  return {
    commands: activeCommands,
    props,
    rendered: await render(
      <AppearanceProvider
        reduceMotion={reduceMotion}
        {...(appearance === undefined
          ? {}
          : { store: { read: () => appearance, write: () => undefined } })}
      >
        <ActiveWorkoutScreen {...props} />
      </AppearanceProvider>,
    ),
  };
}

describe("Plan 01-08 ActiveWorkoutScreen", () => {
  it("adds a selected library exercise from an empty workout and retains revision-checked zero-set confirmation", async () => {
    const addExercise = jest.fn<NonNullable<ActiveWorkoutCommands["addExercise"]>>(async (input) => ({
      outcome: "committed",
      sessionId: input.sessionId,
      sessionExerciseId: input.sessionExerciseId,
      setId: input.setId,
      sessionRevision: input.expectedSessionRevision + 1,
    }));
    const dismissKeyboard = jest.spyOn(Keyboard, "dismiss");
    const saveZeroSetWorkout = jest.fn<ActiveWorkoutCommands["saveZeroSetWorkout"]>(async () => ({
      detail: {} as never,
      invalidationScopes: [],
    }));
    const outcomeSaved = jest.fn();
    await renderActive({
      availableExercises: [{ id: "back-squat", name: "Back Squat" }],
      commands: commands({ addExercise, saveZeroSetWorkout }),
      onOutcomeSaved: outcomeSaved,
      sessionId: "empty-session",
      view: emptyWorkoutView(),
    });

    expect(screen.getByRole("header", { name: "Workout" })).toBeOnTheScreen();
    expect(screen.getByLabelText("Add exercise"))
      .toHaveProp("accessibilityState", expect.objectContaining({ disabled: false }));
    expect(screen.queryByLabelText(/Working set/u)).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Add exercise" }));
    await fireEvent.changeText(screen.getByLabelText("Search exercises"), "Back Squat");
    await fireEvent.press(screen.getByRole("button", {
      name: "Back Squat. Add exercise",
    }));
    expect(dismissKeyboard).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Add Back Squat" }));
    await waitFor(() => expect(addExercise).toHaveBeenCalledWith(expect.objectContaining({
      expectedSessionRevision: 41,
      libraryExerciseId: "back-squat",
      sessionId: "empty-session",
    })));
    dismissKeyboard.mockRestore();

    await fireEvent.press(screen.getByRole("button", { name: "Save zero-set workout" }));
    expect(screen.getByRole("header", { name: "Finish without working sets?" }))
      .toBeOnTheScreen();
    const confirmation = screen.getAllByRole("button", { name: "Save zero-set workout" }).at(1);
    if (confirmation === undefined) {
      throw new Error("zero-set confirmation action was not rendered");
    }
    await fireEvent.press(confirmation);

    await waitFor(() => {
      expect(saveZeroSetWorkout).toHaveBeenCalledWith(expect.objectContaining({
        confirmation: "save_zero_set_workout",
        expectedSessionRevision: 41,
        sessionId: "empty-session",
      }));
      expect(outcomeSaved).toHaveBeenCalledWith("empty-session");
    });
  });

  it("collapses earlier completed exercises accessibly and lets compact rows open one existing editor", async () => {
    const view = overviewView();
    const futureExercise = {
      ...view.currentExercise,
      id: "session-exercise-3",
      exerciseId: "overhead-press",
      name: "Overhead Press",
      ordinal: 2,
      status: "planned" as const,
      workingSets: view.currentExercise.workingSets.map((set, index) => ({
        ...set,
        id: `overhead-working-${index + 1}`,
      })),
    };
    await renderActive({ view: { ...view, exercises: [...view.exercises, futureExercise] } });

    const collapsed = screen.getByRole("button", {
      name: "Back Squat. Completed. 2 of 2 working sets. Expand exercise",
    });
    expect(collapsed).toHaveProp("accessibilityState", expect.objectContaining({ expanded: false }));
    expect(collapsed).toHaveStyle({ minHeight: 48, minWidth: 48 });
    await fireEvent(collapsed, "focus");
    expect(collapsed).toHaveStyle({
      outlineColor: themes.light.focusRing,
      outlineWidth: sizes.focusRing,
    });
    await fireEvent(collapsed, "keyDown", { nativeEvent: { key: "Enter" } });
    expect(screen.getByRole("button", {
      name: "Back Squat. Completed. 2 of 2 working sets. Collapse exercise",
    })).toHaveProp("accessibilityState", expect.objectContaining({ expanded: true }));
    await fireEvent(screen.getByRole("button", {
      name: "Back Squat. Completed. 2 of 2 working sets. Collapse exercise",
    }), "keyDown", { nativeEvent: { key: " " } });
    expect(screen.getByRole("button", {
      name: "Back Squat. Completed. 2 of 2 working sets. Expand exercise",
    })).toHaveProp("accessibilityState", expect.objectContaining({ expanded: false }));

    const benchCompact = screen.getByTestId(
      "overview-session-exercise-2-bench-working-2",
    );
    expect(benchCompact).toHaveStyle({ minHeight: 48, minWidth: 48 });
    await fireEvent.press(benchCompact);
    expect(screen.getByLabelText("Working set 2 load in kilograms")).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId(
      "overview-session-exercise-3-overhead-working-1",
    ));
    expect(screen.queryByLabelText("Working set 2 load in kilograms")).not.toBeOnTheScreen();
    expect(screen.getAllByLabelText("Working set 1 load in kilograms").length).toBeGreaterThan(0);
  });

  it("scrolls the authoritative next active set once after its matching layout and honors reduced motion", async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, "scrollTo")
      .mockImplementation(() => undefined);
    const completeSet = jest.fn<ActiveWorkoutCommands["completeSet"]>(async () => ({
      outcome: "committed",
      view: completedView,
    }));
    await renderActive({ commands: commands({ completeSet }) });

    await fireEvent.press(screen.getByRole("button", { name: "Complete Set 1" }));
    await waitFor(() => expect(completeSet).toHaveBeenCalledTimes(1));
    await fireEvent(screen.getByTestId("overview-exercise-session-exercise-1"), "layout", {
      nativeEvent: { layout: { x: 0, y: 120, width: 320, height: 400 } },
    });
    await fireEvent(screen.getByTestId("overview-working-card-session-exercise-1"), "layout", {
      nativeEvent: { layout: { x: 0, y: 40, width: 320, height: 240 } },
    });
    await fireEvent(screen.getByTestId("working-set-2-row"), "layout", {
      nativeEvent: { layout: { x: 0, y: 32, width: 320, height: 160 } },
    });

    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
    expect(scrollTo).toHaveBeenLastCalledWith({ animated: true, x: 0, y: 192 });
    scrollTo.mockRestore();
  });

  it("uses a non-animated authoritative request under reduced motion and suppresses no-op results", async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, "scrollTo")
      .mockImplementation(() => undefined);
    const noOpComplete = jest.fn<ActiveWorkoutCommands["completeSet"]>(async () => ({
      outcome: "already_completed",
      view: initialView,
    }));
    await renderActive({ commands: commands({ completeSet: noOpComplete }) }, undefined, true);
    await fireEvent.press(screen.getByRole("button", { name: "Complete Set 1" }));
    await waitFor(() => expect(noOpComplete).toHaveBeenCalledTimes(1));
    expect(scrollTo).not.toHaveBeenCalled();

    const committedComplete = jest.fn<ActiveWorkoutCommands["completeSet"]>(async () => ({
      outcome: "committed",
      view: completedView,
    }));
    const { rendered } = await renderActive({
      commands: commands({ completeSet: committedComplete }),
    }, undefined, true);
    await fireEvent.press(screen.getByRole("button", { name: "Complete Set 1" }));
    await waitFor(() => expect(committedComplete).toHaveBeenCalledTimes(1));
    await fireEvent(screen.getByTestId("overview-exercise-session-exercise-1"), "layout", {
      nativeEvent: { layout: { x: 0, y: 120, width: 320, height: 400 } },
    });
    await fireEvent(screen.getByTestId("overview-working-card-session-exercise-1"), "layout", {
      nativeEvent: { layout: { x: 0, y: 40, width: 320, height: 240 } },
    });
    await fireEvent(screen.getByTestId("working-set-2-row"), "layout", {
      nativeEvent: { layout: { x: 0, y: 32, width: 320, height: 160 } },
    });

    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
    expect(scrollTo).toHaveBeenLastCalledWith({ animated: false, x: 0, y: 192 });
    await rendered.unmount();
    scrollTo.mockRestore();
  });

  it.each([
    ["compact", 360],
    ["medium", 720],
    ["expanded", 1024],
  ])("renders the full overview in %s layout", async (layout, width) => {
    await renderActive({ view: overviewView(), width });
    expect(screen.getByLabelText(`${layout} layout`)).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Bench Press" })).toBeOnTheScreen();
  });

  it.each([null, "Light", "Dark"] as const)("keeps the overview reachable with %s appearance", async (appearance) => {
    const props = {
      commands: commands(),
      nowMs: () => 2_000,
      onFinishLater: jest.fn(),
      onGoBack: jest.fn(),
      sessionId: "session-1",
      view: overviewView(),
    } satisfies React.ComponentProps<typeof ActiveWorkoutScreen>;
    const systemScheme = appearance === null
      ? jest.spyOn(Appearance, "getColorScheme").mockReturnValue("dark")
      : undefined;
    try {
      await render(
        <AppearanceProvider store={createMemoryAppearanceStore(appearance)}>
          <ActiveWorkoutScreen {...props} />
        </AppearanceProvider>,
      );
      expect(screen.getByRole("header", { name: "Bench Press" })).toBeOnTheScreen();
    } finally {
      systemScheme?.mockRestore();
    }
  });

  it("keeps long overview labels and compact-row controls reachable at 200 percent text", async () => {
    const previous = Dimensions.get("window");
    await act(() => {
      Dimensions.set({
        screen: { ...previous, fontScale: 2 },
        window: { ...previous, fontScale: 2 },
      });
    });
    const source = overviewView();
    const longActiveExercise = {
      ...source.currentExercise,
      name: "A very long active exercise name that remains reachable at 200 percent text",
    };
    const longNameView = {
      ...source,
      currentExercise: longActiveExercise,
      exercises: [source.exercises[0]!, longActiveExercise],
    };
    const { rendered } = await renderActive({ view: longNameView, width: 360 });
    expect(screen.getByRole("header", {
      name: "A very long active exercise name that remains reachable at 200 percent text",
    })).toBeOnTheScreen();
    expect(screen.getByTestId("overview-session-exercise-2-bench-working-2"))
      .toHaveStyle({ minHeight: 48, minWidth: 48 });
    try {
      await rendered.unmount();
    } finally {
      await act(() => {
        Dimensions.set({ screen: previous, window: previous });
      });
    }
  });

  it("renders every exercise in one overview and completes the stable active-set identity inline", async () => {
    const view = overviewView();
    const completeSet = jest.fn<ActiveWorkoutCommands["completeSet"]>(async () => ({
      outcome: "committed",
      view,
    }));
    await renderActive({ commands: commands({ completeSet }), view });

    expect(screen.getByRole("header", { name: "Back Squat" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Bench Press" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Back Squat. Completed. 2 of 2 working sets. Expand exercise",
    }));
    expect(screen.getByTestId("overview-session-exercise-1-working-1"))
      .toBeOnTheScreen();
    expect(screen.getByTestId("overview-session-exercise-2-bench-working-1"))
      .toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Complete Set 1" }));
    await waitFor(() => {
      expect(completeSet).toHaveBeenCalledWith(expect.objectContaining({
        setId: "bench-working-1",
        expectedSetRevision: 17,
      }));
    });
  });

  it("exposes the exact per-exercise action overflow with expanded accessibility state", async () => {
    await renderActive({ view: overviewView() });

    const actions = screen.getByRole("button", {
      name: "Bench Press exercise actions",
    });
    expect(screen.getByTestId("exercise-divider-session-exercise-2"))
      .toHaveStyle({
        backgroundColor: themes.light.divider,
        height: sizes.focusRing,
      });
    expect(actions).toHaveStyle({
      position: "absolute",
      right: 0,
    });
    expect(actions).toHaveProp("testID", "exercise-actions-bench-press");
    expect(actions).toHaveProp("accessibilityState", expect.objectContaining({
      expanded: false,
    }));

    await fireEvent.press(actions);

    expect(actions).toHaveProp("accessibilityState", expect.objectContaining({
      expanded: true,
    }));
    expect(screen.getByRole("button", { name: "Replace exercise" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove exercise" }))
      .toBeOnTheScreen();
  });

  it("submits drag and explicit fallback moves through one authoritative reorder command", async () => {
    const before = overviewView();
    const after: ActiveWorkoutView = {
      ...before,
      revision: 2,
      exercises: [before.currentExercise, before.exercises[0]!],
    };
    const reorderExercises = jest.fn<
      NonNullable<ActiveWorkoutCommands["reorderExercises"]>
    >(async () => after);
    await renderActive({
      commands: commands({ reorderExercises }),
      view: before,
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "More workout actions",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Reorder exercises",
    }));
    expect(screen.getByTestId("drag-exercise-session-exercise-2"))
      .toHaveProp("accessibilityLabel", "Reorder Bench Press");
    expect(screen.getByTestId("exercise-reorder-position-session-exercise-2"))
      .toHaveTextContent("Bench Press · Position 2 of 2");
    await fireEvent.press(screen.getByRole("button", {
      name: "Move Bench Press up",
    }));

    await waitFor(() => {
      expect(reorderExercises).toHaveBeenCalledWith(expect.objectContaining({
        expectedSessionExerciseRevisions: [
          { sessionExerciseId: "session-exercise-2", revision: 13 },
          { sessionExerciseId: "session-exercise-1", revision: 7 },
        ],
        expectedSessionRevision: 1,
        orderedSessionExerciseIds: [
          "session-exercise-2",
          "session-exercise-1",
        ],
        sessionId: "session-1",
      }));
      expect(screen.getByText("Bench Press moved to 1 of 2"))
        .toBeOnTheScreen();
      expect(screen.getByTestId(
        "exercise-reorder-announcement-session-exercise-2",
      )).toHaveTextContent("Bench Press moved to 1 of 2");
      expect(screen.getByText("Bench Press moved to 1 of 2"))
        .toHaveProp("accessibilityLiveRegion", "polite");
    });
  });

  it("adds one selected library exercise from the populated overview list end", async () => {
    const dismissKeyboard = jest.spyOn(Keyboard, "dismiss");
    const addExercise = jest.fn<
      NonNullable<ActiveWorkoutCommands["addExercise"]>
    >(async (input) => ({
      outcome: "committed",
      sessionId: input.sessionId,
      sessionExerciseId: input.sessionExerciseId,
      setId: input.setId,
      sessionRevision: input.expectedSessionRevision + 1,
    }));
    await renderActive({
      availableExercises: [{
        id: "5f140001-7e35-4a6d-9100-000000000007",
        name: "Overhead Press",
      }],
      commands: commands({ addExercise }),
      view: overviewView(),
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Add exercise",
    }));
    expect(screen.getByTestId("bottom-sheet-frame")).toBeOnTheScreen();
    expect(screen.getByTestId("active-workout-add-exercise-picker-content"))
      .toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText("Search exercises"),
      "Overhead Press",
    );
    await fireEvent.press(screen.getByTestId(
      "add-exercise-option-5f140001-7e35-4a6d-9100-000000000007",
    ));
    expect(dismissKeyboard).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", {
      name: "Add Overhead Press",
    }));

    await waitFor(() => {
      expect(addExercise).toHaveBeenCalledWith(expect.objectContaining({
        expectedSessionRevision: 1,
        libraryExerciseId: "5f140001-7e35-4a6d-9100-000000000007",
        sessionId: "session-1",
      }));
    });
    dismissKeyboard.mockRestore();
  });

  it("retries a provisional replacement through the selected authoritative exercise", async () => {
    const dismissKeyboard = jest.spyOn(Keyboard, "dismiss");
    const before = overviewView();
    const replacement = {
      ...before.currentExercise,
      id: "replacement-exercise",
      exerciseId: "barbell-row",
      name: "Barbell Row",
      revision: 31,
      origin: "added" as const,
      workingSets: before.currentExercise.workingSets.map((set, index) => ({
        ...set,
        id: "replacement-working-" + (index + 1),
      })),
    };
    const after: ActiveWorkoutView = {
      ...before,
      revision: 32,
      activeExerciseId: replacement.id,
      activeSetId: "replacement-working-1",
      currentExercise: replacement,
      exercises: [before.exercises[0]!, replacement],
    };
    const replaceExercise = jest.fn<NonNullable<ActiveWorkoutCommands["replaceExercise"]>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(after);
    await renderActive({
      availableExercises: [
        { id: "barbell-row", name: "Barbell Row" },
        { id: "bench-press", name: "Bench Press" },
      ],
      commands: commands({ replaceExercise }),
      view: before,
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Bench Press exercise actions",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Replace exercise" }));
    expect(screen.getByRole("header", { name: "Choose exercise" })).toBeOnTheScreen();
    expect(screen.getByTestId(
      "replace-exercise-picker-keyboard-layout",
    )).toBeOnTheScreen();
    expect(screen.getByLabelText("Search exercises")).toBeOnTheScreen();
    expect(screen.getByTestId("replace-exercise-option-barbell-row"))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("radio", { name: "Barbell Row" }));
    expect(dismissKeyboard).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Replace with Barbell Row" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry replacing exercise" }))
        .toBeOnTheScreen();
    });
    expect(replaceExercise).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("header", { name: "Bench Press" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Retry replacing exercise" }));
    await waitFor(() => {
      expect(replaceExercise).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("header", { name: "Barbell Row" })).toBeOnTheScreen();
    });
    dismissKeyboard.mockRestore();
  });

  it("retries replacement with bounded request identities for native-shaped exercise IDs", async () => {
    const source = overviewView();
    const nativeSessionId = "session_1789579784827_empty";
    const nativeExerciseId =
      "add-exercise:session_1789579784827_empty:1:5f140001-7e35-4a6d-9100-000000000001:exercise";
    const nativeExercise = {
      ...source.currentExercise,
      id: nativeExerciseId,
    };
    const before: ActiveWorkoutView = {
      ...source,
      id: nativeSessionId,
      activeExerciseId: nativeExercise.id,
      currentExercise: nativeExercise,
      exercises: [source.exercises[0]!, nativeExercise],
    };
    const replacement = {
      ...nativeExercise,
      id: "replacement-exercise",
      exerciseId: "barbell-row",
      name: "Barbell Row",
      revision: 31,
      origin: "added" as const,
      workingSets: nativeExercise.workingSets.map((set, index) => ({
        ...set,
        id: "replacement-working-" + (index + 1),
      })),
    };
    const after: ActiveWorkoutView = {
      ...before,
      revision: 32,
      activeExerciseId: replacement.id,
      activeSetId: "replacement-working-1",
      currentExercise: replacement,
      exercises: [before.exercises[0]!, replacement],
    };
    let attempts = 0;
    const replaceExercise = jest.fn<NonNullable<ActiveWorkoutCommands["replaceExercise"]>>(
      async (input) => {
        attempts += 1;
        if (input.requestId.length > 128) {
          throw new Error("replace_exercise_identifier_invalid");
        }
        if (attempts === 1) {
          throw new Error("offline");
        }
        return after;
      },
    );
    await renderActive({
      availableExercises: [
        { id: "barbell-row", name: "Barbell Row" },
        { id: "bench-press", name: "Bench Press" },
      ],
      commands: commands({ replaceExercise }),
      sessionId: nativeSessionId,
      view: before,
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Bench Press exercise actions",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Replace exercise" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Barbell Row" }));
    await fireEvent.press(screen.getByRole("button", { name: "Replace with Barbell Row" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry replacing exercise" }))
        .toBeOnTheScreen();
    });
    expect(replaceExercise).toHaveBeenCalledWith(expect.objectContaining({
      requestId: expect.any(String),
    }));
    expect(replaceExercise.mock.calls[0]![0].requestId.length).toBeLessThanOrEqual(128);

    await fireEvent.press(screen.getByRole("button", { name: "Retry replacing exercise" }));
    await waitFor(() => {
      expect(replaceExercise).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("header", { name: "Barbell Row" })).toBeOnTheScreen();
    });
    expect(replaceExercise.mock.calls[1]![0].requestId.length).toBeLessThanOrEqual(128);
  });

  it("keeps protected completed history after cancellation and a retried removal", async () => {
    const before = overviewView();
    const active = before.currentExercise;
    const completed = before.exercises[0]!;
    const protectedExercise = {
      ...active,
      id: "protected-exercise",
      name: "Overhead Press",
      origin: "added" as const,
      revision: 23,
      workingSets: active.workingSets.map((set, index) => ({
        ...set,
        id: "protected-working-" + (index + 1),
        observation: loadReps(60_000, 8, "manual"),
        status: index === 0 ? "completed" as const : "planned" as const,
        completedAtMs: index === 0 ? 2_000 : null,
      })),
    };
    const protectedBefore: ActiveWorkoutView = {
      ...before,
      revision: 22,
      activeExerciseId: protectedExercise.id,
      activeSetId: "protected-working-2",
      currentExercise: protectedExercise,
      exercises: [completed, protectedExercise],
    };
    const skipped = {
      ...protectedExercise,
      revision: 24,
      status: "skipped" as const,
      workingSets: protectedExercise.workingSets.map((set) =>
        set.status === "completed" ? set : { ...set, status: "skipped" as const }),
    };
    const protectedAfter: ActiveWorkoutView = {
      ...protectedBefore,
      revision: 24,
      currentExercise: skipped,
      exercises: [completed, skipped],
    };
    const removeExercise = jest.fn<NonNullable<ActiveWorkoutCommands["removeExercise"]>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(protectedAfter);
    await renderActive({
      commands: commands({ removeExercise }),
      view: protectedBefore,
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Overhead Press exercise actions",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Remove exercise" }));
    expect(screen.getByText(
      "This exercise has completed sets. They will be retained and this exercise will be marked Skipped, not deleted.",
    )).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Keep exercise" }));
    expect(removeExercise).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", {
      name: "Overhead Press exercise actions",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Remove exercise" }));
    await fireEvent.press(screen.getByTestId("remove-exercise-confirm"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry removing exercise" }))
        .toBeOnTheScreen();
    });
    expect(removeExercise).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Retry removing exercise" }));
    await waitFor(() => {
      expect(removeExercise).toHaveBeenCalledTimes(2);
      expect(screen.getByLabelText(
        "Overhead Press. Skipped. Completed · 60 kg × 8. 1 of 2 working sets. Collapse exercise",
      )).toBeOnTheScreen();
      expect(screen.getByText("Completed · 60 kg × 8")).toBeOnTheScreen();
    });
    expect(screen.getByText("Skipped · Completed · 60 kg × 8"))
      .toBeOnTheScreen();
  });

  it("keeps the workout overview identity outside scrolling content", async () => {
    const reviewedExercise = {
      ...initialView.currentExercise,
      id: "session-exercise-2",
      name: "Bench Press",
      ordinal: 1,
      status: "completed" as const,
    };
    const view: ActiveWorkoutView = {
      ...initialView,
      exercises: [initialView.currentExercise, reviewedExercise],
    };
    const { props, rendered } = await renderActive({ view });
    const stickyHeader = screen.getByTestId("active-workout-sticky-header");
    const scroll = screen.getByTestId("active-workout-scroll");

    expect(within(stickyHeader).getByTestId(
      "active-workout-identity-current",
    )).toBeOnTheScreen();
    expect(within(stickyHeader).getByRole("header", { name: "Workout" }))
      .toBeOnTheScreen();
    expect(within(stickyHeader).getByText("WORKOUT OVERVIEW"))
      .toBeOnTheScreen();
    expect(within(scroll).queryByTestId("active-workout-identity-current"))
      .not.toBeOnTheScreen();

  });

  it("keeps active-workout controls on the overview without a second plan surface", async () => {
    await renderActive();

    expect(screen.queryByRole("button", { name: "Today's plan" }))
      .not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "More workout actions" }))
      .toBeOnTheScreen();
  });

  it("keeps active-exercise timing configuration reachable from the sticky header", async () => {
    await renderActive({
      commands: commands({
        updateSessionExerciseAdvancedTiming: jest.fn(async () => advancedResult({
          version: 1,
          state: "idle",
          revision: 0,
          targetSessionSetId: null,
        }, 2)),
      }),
    });

    const configureTiming = screen.getByRole("button", {
      name: "Configure Back Squat timing",
    });
    expect(configureTiming).toHaveStyle({ minHeight: 48, minWidth: 48 });

    await fireEvent.press(configureTiming);

    expect(screen.getByText("Exercise timing")).toBeOnTheScreen();
  });

  it("lists every workout exercise in overview order without changing the active pointer", async () => {
    const reviewedExercise = {
      ...initialView.currentExercise,
      id: "session-exercise-2",
      name: "Bench Press",
      ordinal: 1,
      status: "completed" as const,
      workingSets: initialView.currentExercise.workingSets.map((set) => ({
        ...set,
        status: "completed" as const,
      })),
    };
    const plannedExercise = {
      ...initialView.currentExercise,
      id: "session-exercise-3",
      name: "Barbell Row",
      ordinal: 2,
      status: "planned" as const,
    };
    const skippedExercise = {
      ...initialView.currentExercise,
      id: "session-exercise-4",
      name: "Pull-up",
      ordinal: 3,
      status: "skipped" as const,
    };
    const view: ActiveWorkoutView = {
      ...initialView,
      exercises: [
        initialView.currentExercise,
        reviewedExercise,
        plannedExercise,
        skippedExercise,
      ],
    };
    await renderActive({ view });
    for (const name of ["Back Squat", "Bench Press", "Barbell Row", "Pull-up"]) {
      expect(screen.getByRole("header", { name })).toBeOnTheScreen();
    }
    expect(view.activeExerciseId).toBe("session-exercise-1");
  });

  it("keeps workout context in flat cards while inline set controls and action sheet retain semantic surfaces", async () => {
    await renderActive({ width: 840 });

    for (const cardId of [
      "active-workout-target-card",
      "active-workout-warmups-card",
      "active-workout-working-sets-card",
    ]) {
      expect(screen.getByTestId(cardId)).toHaveStyle({
        backgroundColor: themes.light.contentCard,
        borderColor: themes.light.contentCardBorder,
        borderWidth: 0.5,
      });
    }
    expect(screen.getByText("60 kg × 8")).toHaveStyle({
      color: themes.light.contentCardText,
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "More workout actions" }),
    );
    expect(screen.getByTestId("workout-actions-sheet-content"))
      .toHaveStyle({ backgroundColor: themes.light.surface });
  });

  it.each(["Light", "Dark"] as const)(
    "uses global card tokens while retaining editable set fields in %s appearance",
    async (appearance) => {
      await renderActive({ width: 840 }, appearance);
      const colors = themes[appearance.toLowerCase() as "light" | "dark"];

      expect(screen.getByTestId("active-workout-warmups-card")).toHaveStyle({
        backgroundColor: colors.contentCard,
        borderColor: colors.contentCardBorder,
      });
      expect(screen.getByRole("header", { name: "Warm-ups" }))
        .toHaveStyle({ color: colors.contentCardText });
      expect(screen.queryByText("Excluded from records and progression"))
        .not.toBeOnTheScreen();
      expect(screen.getByLabelText("Working set 1 load in kilograms"))
        .toHaveStyle({ backgroundColor: colors.surface });
    },
  );

  it("renders cohesive compact warm-up and working-set rows", async () => {
    const { rendered } = await renderActive();

    expect(screen.getByRole("header", { name: "Back Squat" }))
      .toBeOnTheScreen();
    expect(screen.getByText("TODAY'S TARGET")).toBeOnTheScreen();
    expect(screen.getAllByText("60 kg × 8").length).toBeGreaterThan(0);
    expect(screen.getByText("Last workout · 60 kg × 7")).toBeOnTheScreen();
    expect(screen.getByText("W1")).toBeOnTheScreen();
    expect(screen.getByLabelText(/Working set 1 of 2/u))
      .toHaveProp("accessibilityState", { selected: true });
    expect(screen.getByLabelText(/Working set 2 of 2/u))
      .toHaveProp("accessibilityState", { selected: false });
    expect(screen.getByRole("button", { name: "Complete Set 1" }))
      .toHaveStyle({ minHeight: 48, minWidth: 48 });
    expect(screen.getByRole("button", { name: "Complete warm-up W1" }))
      .toHaveStyle({ minHeight: 48, minWidth: 48 });
    expect(screen.getByTestId("working-set-1-actions")).toHaveStyle({
      flexDirection: "row",
    });
    expect(screen.getByTestId("warmup-W1-actions")).toHaveStyle({
      flexDirection: "row",
    });
    expect(screen.getByLabelText("Working set 1 load in kilograms"))
      .toHaveDisplayValue("60");
    const loadInput = screen.getByLabelText(
      "Working set 1 load in kilograms",
    );
    await fireEvent(loadInput, "focus");
    expect(loadInput).toHaveStyle({
      outlineColor: themes.light.focusRing,
      outlineWidth: sizes.focusRing,
    });
    await fireEvent(loadInput, "blur");
    expect(loadInput).toHaveStyle({ outlineWidth: 0 });
    expect(screen.getByLabelText("Working set 1 repetitions"))
      .toHaveDisplayValue("8");
    expect(screen.getByTestId("working-set-1-row")).toHaveProp(
      "accessible",
      false,
    );
    expect(screen.getByLabelText(/Working set 1 of 2/u))
      .toHaveProp("accessible", true);
    expect(screen.getByLabelText("Warm-up W1 load in kilograms"))
      .toHaveDisplayValue("20");
    expect(screen.getByLabelText("Warm-up W1 repetitions"))
      .toHaveDisplayValue("8");
    const tree = JSON.stringify(rendered.toJSON());
    expect(tree).not.toContain("Excluded from records and progression");
    expect(screen.getByTestId("active-workout-warmup-actions"))
      .toHaveStyle({ alignSelf: "flex-end" });
    expect(screen.getByTestId("active-workout-working-actions"))
      .toHaveStyle({ alignSelf: "flex-end" });
    for (const label of [
      "Add warm-up",
      "Add working set",
      "Complete Set 1",
      "Remove set 1",
      "Complete warm-up W1",
      "Remove warm-up W1",
    ]) {
      expect(screen.getByRole("button", { name: label }))
        .toHaveStyle({ minHeight: 48, minWidth: 48 });
    }
  });

  it("offers inline value sources in approved order and persists one tap selection", async () => {
    const updatedView: ActiveWorkoutView = {
      ...initialView,
      revision: 2,
      currentExercise: {
        ...initialView.currentExercise,
        workingSets: [
          {
            ...initialView.currentExercise.workingSets[0]!,
            observation: loadReps(62_500, 6, "recommended"),
            status: "draft",
            revision: 2,
          },
          initialView.currentExercise.workingSets[1]!,
        ],
      },
    };
    const updateActiveSetDraft = jest.fn(async () => updatedView);
    await renderActive({
      commands: commands({ updateActiveSetDraft }),
    });

    expect(screen.getAllByRole("button").map(
      (source) => source.props.accessibilityLabel,
    )).toEqual(expect.arrayContaining([
      "Use Recommended values for working set 1: 62.5 kg × 6",
      "Use Last workout values for working set 1: 60 kg × 7",
      "Use Plan default values for working set 1: 60 kg × 8",
    ]));
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Use Recommended values for working set 1: 62.5 kg × 6",
      }),
    );

    await waitFor(() => {
      expect(updateActiveSetDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          setId: "working-1",
          expectedSetRevision: 1,
          observation: loadReps(62_500, 6, "recommended"),
        }),
      );
    });
    expect(screen.getByLabelText("Working set 1 load in kilograms"))
      .toHaveDisplayValue("62.5");
    expect(screen.getByLabelText("Working set 1 repetitions"))
      .toHaveDisplayValue("6");
  });

  it("edits load and reps inline and persists the combined draft on blur", async () => {
    const updatedView: ActiveWorkoutView = {
      ...initialView,
      revision: 2,
      currentExercise: {
        ...initialView.currentExercise,
        workingSets: [{
          ...initialView.currentExercise.workingSets[0]!,
          observation: loadReps(65_000, 9, "manual"),
          status: "draft",
          revision: 2,
        }, initialView.currentExercise.workingSets[1]!],
      },
    };
    const updateActiveSetDraft = jest.fn(async () => updatedView);
    await renderActive({
      commands: commands({ updateActiveSetDraft }),
    });

    await fireEvent.changeText(
      screen.getByLabelText("Working set 1 load in kilograms"),
      "65",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Working set 1 repetitions"),
      "9",
    );
    await fireEvent(
      screen.getByLabelText("Working set 1 repetitions"),
      "blur",
    );

    await waitFor(() => {
      expect(updateActiveSetDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          observation: loadReps(65_000, 9, "manual"),
        }),
      );
    });
  });

  it("completes with inline values after the queued draft save", async () => {
    const updatedView: ActiveWorkoutView = {
      ...initialView,
      revision: 2,
      currentExercise: {
        ...initialView.currentExercise,
        workingSets: [{
          ...initialView.currentExercise.workingSets[0]!,
          observation: loadReps(65_000, 9, "manual"),
          status: "draft",
          revision: 2,
        }, initialView.currentExercise.workingSets[1]!],
      },
    };
    let resolveDraft: ((view: ActiveWorkoutView) => void) | undefined;
    const updateActiveSetDraft = jest.fn(() => new Promise<ActiveWorkoutView>(
      (resolve) => {
        resolveDraft = resolve;
      },
    ));
    const completeSet = jest.fn<ActiveWorkoutCommands["completeSet"]>(
      async () => ({
        outcome: "committed",
        view: completedView,
      }),
    );
    await renderActive({
      commands: commands({ completeSet, updateActiveSetDraft }),
    });

    await fireEvent.changeText(
      screen.getByLabelText("Working set 1 load in kilograms"),
      "65",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Working set 1 repetitions"),
      "9",
    );
    await fireEvent(
      screen.getByLabelText("Working set 1 repetitions"),
      "blur",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Complete Set 1" }),
    );
    expect(completeSet).not.toHaveBeenCalled();
    await act(async () => {
      resolveDraft?.(updatedView);
    });

    await waitFor(() => {
      expect(completeSet).toHaveBeenCalledWith(expect.objectContaining({
        expectedSessionRevision: 2,
        expectedSetRevision: 2,
        observation: loadReps(65_000, 9, "manual"),
      }));
    });
  });

  it("flushes focused inline values before completing", async () => {
    const updatedView: ActiveWorkoutView = {
      ...initialView,
      revision: 2,
      currentExercise: {
        ...initialView.currentExercise,
        workingSets: [{
          ...initialView.currentExercise.workingSets[0]!,
          observation: loadReps(60_000, 7, "manual"),
          status: "draft",
          revision: 2,
        }, initialView.currentExercise.workingSets[1]!],
      },
    };
    let resolveDraft: ((view: ActiveWorkoutView) => void) | undefined;
    const updateActiveSetDraft = jest.fn(() => new Promise<ActiveWorkoutView>(
      (resolve) => {
        resolveDraft = resolve;
      },
    ));
    const completeSet = jest.fn<ActiveWorkoutCommands["completeSet"]>(
      async () => ({
        outcome: "committed",
        view: completedView,
      }),
    );
    await renderActive({
      commands: commands({ completeSet, updateActiveSetDraft }),
    });

    await fireEvent.changeText(
      screen.getByLabelText("Working set 1 repetitions"),
      "7",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Complete Set 1" }),
    );

    expect(updateActiveSetDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        observation: loadReps(60_000, 7, "manual"),
      }),
    );
    expect(completeSet).not.toHaveBeenCalled();

    await act(async () => {
      resolveDraft?.(updatedView);
    });
    await waitFor(() => {
      expect(completeSet).toHaveBeenCalledWith(expect.objectContaining({
        expectedSessionRevision: 2,
        expectedSetRevision: 2,
        observation: loadReps(60_000, 7, "manual"),
      }));
    });
  });

  it("retries a failed focused inline save before completing", async () => {
    const updatedView: ActiveWorkoutView = {
      ...initialView,
      revision: 2,
      currentExercise: {
        ...initialView.currentExercise,
        workingSets: [{
          ...initialView.currentExercise.workingSets[0]!,
          observation: loadReps(60_000, 7, "manual"),
          status: "draft",
          revision: 2,
        }, initialView.currentExercise.workingSets[1]!],
      },
    };
    const updateActiveSetDraft = jest.fn<
      ActiveWorkoutCommands["updateActiveSetDraft"]
    >()
      .mockRejectedValueOnce(new Error("draft save failed"))
      .mockResolvedValueOnce(updatedView);
    const completeSet = jest.fn<ActiveWorkoutCommands["completeSet"]>(
      async () => ({
        outcome: "committed",
        view: completedView,
      }),
    );
    await renderActive({
      commands: commands({ completeSet, updateActiveSetDraft }),
    });

    await fireEvent.changeText(
      screen.getByLabelText("Working set 1 repetitions"),
      "7",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Complete Set 1" }),
    );
    await waitFor(() => {
      expect(updateActiveSetDraft).toHaveBeenCalledTimes(1);
    });
    expect(completeSet).not.toHaveBeenCalled();

    await fireEvent.press(
      screen.getByRole("button", { name: "Complete Set 1" }),
    );
    await waitFor(() => {
      expect(updateActiveSetDraft).toHaveBeenCalledTimes(2);
      expect(completeSet).toHaveBeenCalledWith(expect.objectContaining({
        expectedSessionRevision: 2,
        expectedSetRevision: 2,
        observation: loadReps(60_000, 7, "manual"),
      }));
    });
  });

  it("does not persist invalid inline values", async () => {
    const updateActiveSetDraft = jest.fn(async () => initialView);
    await renderActive({
      commands: commands({ updateActiveSetDraft }),
    });

    await fireEvent.changeText(
      screen.getByLabelText("Working set 1 load in kilograms"),
      "not-a-number",
    );
    await fireEvent(
      screen.getByLabelText("Working set 1 load in kilograms"),
      "blur",
    );

    expect(updateActiveSetDraft).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid load.")).toBeOnTheScreen();
  });

  it("edits timed-hold duration inline without encoding it as repetitions", async () => {
    const timedView: ActiveWorkoutView = {
      ...initialView,
      currentExercise: {
        ...initialView.currentExercise,
        exerciseId: "plank",
        name: "Plank",
        metricProfile: "timed_hold",
        warmups: [],
        workingSets: [{
          ...initialView.currentExercise.workingSets[0]!,
          target: {
            version: 1,
            profile: "timed_hold",
            durationSeconds: 45,
            perSide: false,
          },
          valueSources: [
            {
              source: "plan_default",
              observation: {
                version: 1,
                profile: "timed_hold",
                durationSeconds: 45,
                source: "plan_default",
              },
            },
            {
              source: "manual",
              observation: {
                version: 1,
                profile: "timed_hold",
                durationSeconds: 45,
                source: "manual",
              },
            },
          ],
        }],
      },
      progress: {
        completedWorkingSets: 0,
        totalWorkingSets: 1,
      },
    };
    const updateActiveSetDraft = jest.fn(async () => timedView);
    await renderActive({
      commands: commands({ updateActiveSetDraft }),
      view: timedView,
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Working set 1 duration in seconds",
      }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("Working set 1 duration in seconds minutes"),
      "1",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Working set 1 duration in seconds seconds"),
      "",
    );
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Confirm working set 1 duration in seconds",
      }),
    );

    await waitFor(() => {
      expect(updateActiveSetDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          observation: {
            version: 1,
            profile: "timed_hold",
            durationSeconds: 60,
            source: "manual",
          },
        }),
      );
    });
    expect(screen.queryByLabelText(/repetitions/iu)).not.toBeOnTheScreen();
  });

  it("shows Saving set without optimistic completion until the command commits", async () => {
    let resolveCompletion: (
      result: CompleteSetResult,
    ) => void = () => undefined;
    const completeSet = jest.fn(() => new Promise<CompleteSetResult>(
      (resolve) => {
        resolveCompletion = resolve;
      },
    ));
    await renderActive({ commands: commands({ completeSet }) });

    await fireEvent.press(
      screen.getByRole("button", { name: "Complete Set 1" }),
    );
    expect(screen.getByRole("button", { name: "Saving set…" }))
      .toBeDisabled();
    expect(screen.getByLabelText(/Working set 1 of 2/u))
      .toHaveProp("accessibilityState", { selected: true });
    expect(screen.queryByText("Completed working set 1"))
      .not.toBeOnTheScreen();

    await act(async () => {
      resolveCompletion({ outcome: "committed", view: completedView });
    });
    expect(screen.getByText("Completed working set 1")).toBeOnTheScreen();
    expect(screen.getByLabelText(/Working set 2 of 2/u))
      .toHaveProp("accessibilityState", { selected: true });
    expect(screen.getByRole("button", { name: "Edit completed set 1" }))
      .toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Undo completed set" }))
      .not.toBeOnTheScreen();
  });

  it("retains values and follows the normal committed path after exact Retry", async () => {
    const completeSet = jest.fn<ActiveWorkoutCommands["completeSet"]>()
      .mockRejectedValueOnce(new Error("storage_failed"))
      .mockResolvedValueOnce({
        outcome: "committed",
        view: completedView,
      });
    await renderActive({ commands: commands({ completeSet }) });

    await fireEvent.press(
      screen.getByRole("button", { name: "Complete Set 1" }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Set not saved · Retry" }),
      ).toBeOnTheScreen();
    });
    expect(screen.getByText(
      "Your values are still here. The set was not completed and rest did not start.",
    )).toBeOnTheScreen();
    expect(screen.getAllByText("60 kg × 8").length).toBeGreaterThan(0);

    await fireEvent.press(
      screen.getByRole("button", { name: "Set not saved · Retry" }),
    );
    await waitFor(() => {
      expect(screen.getByText("Completed working set 1")).toBeOnTheScreen();
    });
    expect(completeSet).toHaveBeenCalledTimes(2);
    expect(completeSet.mock.calls[1]).toEqual(completeSet.mock.calls[0]);
  });

  it.each<[
    string,
    string,
    Readonly<{ nativeEvent: Readonly<{ actionName?: string; key?: string }> }>,
  ]>([
    ["Semantic activate action", "accessibilityAction", {
      nativeEvent: { actionName: "activate" },
    }],
    ["Enter", "keyDown", { nativeEvent: { key: "Enter" } }],
    ["Space", "keyDown", { nativeEvent: { key: " " } }],
  ])(
    "routes %s activation through the same completeSet command",
    async (_label, eventName, event) => {
      const completeSet = jest.fn(async () => ({
        outcome: "already_completed" as const,
        view: initialView,
      }));
      await renderActive({ commands: commands({ completeSet }) });
      const action = screen.getByRole("button", { name: "Complete Set 1" });

      await fireEvent(action, eventName, event);

      expect(completeSet).toHaveBeenCalledTimes(1);
      expect(completeSet).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: "session-1",
        setId: "working-1",
      }));
    },
  );

  it("uses separate warm-up commands and excludes them from working progress", async () => {
    const completeWarmup = jest.fn(async () => ({
      ...initialView,
      revision: 2,
      currentExercise: {
        ...initialView.currentExercise,
        warmups: [{
          ...initialView.currentExercise.warmups[0]!,
          status: "completed" as const,
          completedAtMs: 2_000,
          revision: 2,
        }],
      },
    }));
    await renderActive({ commands: commands({ completeWarmup }) });

    await fireEvent.press(
      screen.getByRole("button", { name: "Complete warm-up W1" }),
    );

    await waitFor(() => {
      expect(completeWarmup).toHaveBeenCalledWith(expect.objectContaining({
        setId: "warmup-1",
      }));
    });
    expect(screen.getByText("0 of 2 working sets")).toBeOnTheScreen();
    expect(screen.getByText("Completed warm-up W1")).toBeOnTheScreen();
    expect(screen.getByTestId("warmup-W1-status-glyph"))
      .toHaveStyle({ right: 8, top: 8 });
  });

  it("adds warm-ups and confirms removal only through the trusted removal port", async () => {
    const addWarmup = jest.fn<ActiveWorkoutCommands["addWarmup"]>(async () => ({
      ...initialView,
      committedSetId: "warmup-1",
    }));
    const removedView: ActiveWorkoutView = {
      ...initialView,
      revision: 2,
      currentExercise: {
        ...initialView.currentExercise,
        warmups: [],
      },
    };
    const removeWarmup = jest.fn(async () => removedView);
    await renderActive({
      commands: commands({
        addWarmup,
        removeWarmup,
      }),
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Add warm-up" }),
    );
    await waitFor(() => {
      expect(addWarmup).toHaveBeenCalledWith(expect.objectContaining({
        sessionExerciseId: "session-exercise-1",
        observation: loadReps(20_000, 8, "manual"),
      }));
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Remove warm-up W1" }),
    );
    expect(screen.getByText("Remove warm-up W1?")).toBeOnTheScreen();
    expect(screen.getByText("This warm-up will be removed from this workout. This cannot be undone."))
      .toBeOnTheScreen();
    expect(removeWarmup).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Remove warm-up" }));
    await waitFor(() => {
      expect(removeWarmup).toHaveBeenCalledWith(expect.objectContaining({
        setId: "warmup-1",
        requestSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }));
    });
    expect(screen.queryByRole("button", { name: "Remove warm-up W1" }))
      .not.toBeOnTheScreen();
    expect(screen.getByText("Warm-up W1 removed")).toBeOnTheScreen();
  });

  it("uses a bounded deterministic request ID when removing restored long IDs", async () => {
    const sessionId = "s".repeat(128);
    const setId = "w".repeat(128);
    const longIdView: ActiveWorkoutView = {
      ...initialView,
      id: sessionId,
      activeSetId: setId,
      currentExercise: {
        ...initialView.currentExercise,
        workingSets: [{
          ...initialView.currentExercise.workingSets[0]!,
          id: setId,
        }],
      },
      progress: {
        completedWorkingSets: 0,
        totalWorkingSets: 1,
      },
    };
    const removeWorkingSet = jest.fn<NonNullable<
      ActiveWorkoutCommands["removeWorkingSet"]
    >>(async () => ({
      ...longIdView,
      revision: 2,
      currentExercise: {
        ...longIdView.currentExercise,
        workingSets: [],
      },
    }));
    await renderActive({
      commands: commands({ removeWorkingSet }),
      sessionId,
      view: longIdView,
    });

    await fireEvent.press(screen.getByRole("button", { name: "Remove set 1" }));
    await fireEvent.press(screen.getByRole("button", { name: "Remove set" }));

    await waitFor(() => {
      expect(removeWorkingSet).toHaveBeenCalledWith(expect.objectContaining({
        requestId: `remove_${"a".repeat(64)}`,
        requestSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        sessionId,
        setId,
      }));
    });
    const removalRequest = removeWorkingSet.mock.calls[0]?.[0];
    expect(removalRequest).toBeDefined();
    expect(removalRequest?.requestId).toHaveLength(71);
  });

  it("adds a first warm-up from the active load/reps target when none are planned", async () => {
    const addWarmup = jest.fn<ActiveWorkoutCommands["addWarmup"]>(async () => ({
      ...initialView,
      committedSetId: "warmup-1",
    }));
    await renderActive({
      commands: commands({ addWarmup }),
      view: {
        ...initialView,
        currentExercise: {
          ...initialView.currentExercise,
          warmups: [],
        },
      },
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Add warm-up" }),
    );

    await waitFor(() => {
      expect(addWarmup).toHaveBeenCalledWith(expect.objectContaining({
        observation: loadReps(60_000, 8, "manual"),
      }));
    });
  });

  it("adds working sets and leaves rows unchanged until confirmed removal commits", async () => {
    const addedView: ActiveWorkoutView = {
      ...initialView,
      revision: 2,
      currentExercise: {
        ...initialView.currentExercise,
        workingSets: [
          ...initialView.currentExercise.workingSets,
          {
            ...initialView.currentExercise.workingSets[1]!,
            id: "working-added",
            ordinal: 2,
            sourceTargetId: null,
            observation: loadReps(60_000, 8, "manual"),
            status: "draft",
          },
        ],
      },
      progress: {
        completedWorkingSets: 0,
        totalWorkingSets: 3,
      },
    };
    const removedView: ActiveWorkoutView = {
      ...addedView,
      revision: 3,
      activeSetId: "working-2",
      currentExercise: {
        ...addedView.currentExercise,
        workingSets: addedView.currentExercise.workingSets.filter(
          ({ id }) => id !== "working-1",
        ),
      },
    };
    const addWorkingSet = jest.fn(async () => ({
      ...addedView,
      committedSetId: "working-added",
    }));
    const removeWorkingSet = jest.fn(async () => removedView);
    await renderActive({
      commands: commands({ addWorkingSet, removeWorkingSet }),
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Add working set" }),
    );
    await waitFor(() => {
      expect(addWorkingSet).toHaveBeenCalledWith(expect.objectContaining({
        sessionExerciseId: "session-exercise-1",
        sourceSetId: "working-2",
      }));
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Remove set 1" }),
    );
    expect(screen.getByRole("button", { name: "Keep set" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Keep set" }));
    expect(removeWorkingSet).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Remove set 1" }));
    await fireEvent.press(screen.getByRole("button", { name: "Remove set" }));
    await waitFor(() => {
      expect(removeWorkingSet).toHaveBeenCalledWith(expect.objectContaining({
        setId: "working-1",
        expectedSessionRevision: 2,
      }));
    });
    expect(screen.getByText("Set 1 removed")).toBeOnTheScreen();
  });

  it("confirms and removes an inactive future working set, then follows the authoritative pointer", async () => {
    const removedView: ActiveWorkoutView = {
      ...initialView,
      revision: 2,
      activeSetId: "working-1",
      currentExercise: {
        ...initialView.currentExercise,
        workingSets: [{
          ...initialView.currentExercise.workingSets[0]!,
          ordinal: 0,
        }],
      },
    };
    const removeWorkingSet = jest.fn(async () => removedView);
    await renderActive({ commands: commands({ removeWorkingSet }) });

    expect(screen.getByRole("button", { name: "Remove set 2" }).props
      .accessibilityState).toMatchObject({ disabled: false });
    await fireEvent.press(
      screen.getByRole("button", { name: "Remove set 2" }),
    );
    expect(screen.getByText("Remove set 2?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Remove set" }));

    await waitFor(() => {
      expect(removeWorkingSet).toHaveBeenCalledWith(expect.objectContaining({
        setId: "working-2",
        expectedSessionRevision: 1,
        expectedSetRevision: 1,
      }));
    });
    expect(screen.getByText("Set 2 removed")).toBeOnTheScreen();
    expect(screen.getByText("Current set")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove set 1" }))
      .toBeOnTheScreen();
  });

  it.each([
    ["warm-up", "warmup-1", "Remove warm-up W1", "Remove warm-up"],
    ["working set", "working-2", "Remove set 2", "Remove set"],
  ])(
    "confirms removal for a skipped %s",
    async (_kind, setId, removeLabel, confirmLabel) => {
      const view: ActiveWorkoutView = {
        ...initialView,
        currentExercise: {
          ...initialView.currentExercise,
          warmups: initialView.currentExercise.warmups.map((set) => ({
            ...set,
            status: "skipped" as const,
          })),
          workingSets: initialView.currentExercise.workingSets.map((set) =>
            set.id === "working-2"
              ? { ...set, status: "skipped" as const }
              : set
          ),
        },
      };
      const removedView: ActiveWorkoutView = {
        ...view,
        revision: 2,
        currentExercise: {
          ...view.currentExercise,
          warmups: setId === "warmup-1" ? [] : view.currentExercise.warmups,
          workingSets: setId === "working-2"
            ? view.currentExercise.workingSets.filter(({ id }) => id !== setId)
            : view.currentExercise.workingSets,
        },
      };
      const removeWarmup = jest.fn(async () => removedView);
      const removeWorkingSet = jest.fn(async () => removedView);
      await renderActive({
        commands: commands({ removeWarmup, removeWorkingSet }),
        view,
      });

      expect(screen.getByRole("button", { name: removeLabel })).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole("button", { name: removeLabel }));
      expect(screen.getByRole("button", { name: confirmLabel })).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole("button", { name: confirmLabel }));

      await waitFor(() => {
        const remove = setId === "warmup-1" ? removeWarmup : removeWorkingSet;
        expect(remove).toHaveBeenCalledWith(expect.objectContaining({ setId }));
      });
    },
  );

  it("does not reissue a committed removal when the authoritative reload fails", async () => {
    const onGoBack = jest.fn();
    const removeWorkingSet = jest.fn<NonNullable<
      ActiveWorkoutCommands["removeWorkingSet"]
    >>(
      async () => ({
        outcome: "committed_refresh_failed",
        sessionId: "session-1",
        setId: "working-2",
        sessionRevision: 2,
      }),
    );
    await renderActive({
      commands: commands({ removeWorkingSet }),
      onGoBack,
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Remove set 2" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Remove set" }));

    await waitFor(() => {
      expect(screen.getByText("Set removed. Reload workout")).toBeOnTheScreen();
    });
    expect(screen.getByText(
      "The set was removed, but the latest workout could not be loaded. Return to Today and reopen this workout.",
    )).toBeOnTheScreen();
    expect(screen.queryByText("Your workout was not changed. Try again."))
      .not.toBeOnTheScreen();
    expect(removeWorkingSet).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole("button", { name: "Return to Today" }));
    expect(onGoBack).toHaveBeenCalledTimes(1);
    expect(removeWorkingSet).toHaveBeenCalledTimes(1);
  });

  it("corrects a completed working set throughout the active workout without whole-session Undo", async () => {
    const revisedView: ActiveWorkoutView = {
      ...completedView,
      revision: 3,
      currentExercise: {
        ...completedView.currentExercise,
        workingSets: completedView.currentExercise.workingSets.map((set) =>
          set.id === "working-1"
            ? {
                ...set,
                observation: loadReps(62_500, 8, "manual"),
                revision: 3,
              }
            : set
        ),
      },
    };
    const reviseCompletedSet = jest.fn(async () => ({
      ...revisedView,
      committedSetId: "working-1",
    }));
    await renderActive({
      commands: commands({ reviseCompletedSet }),
      view: completedView,
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Edit completed set 1" }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("Working set 1 load in kilograms"),
      "62.5",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Save correction for completed set 1" }),
    );

    await waitFor(() => {
      expect(reviseCompletedSet).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: "session-1",
        setId: "working-1",
        expectedSessionRevision: completedView.revision,
        expectedSetRevision: 2,
        observation: loadReps(62_500, 8, "manual"),
      }));
    });
    expect(screen.getAllByText("62.5 kg × 8").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Undo completed set" }))
      .not.toBeOnTheScreen();
  });

  it("keeps section mutations retryable without duplicate submissions", async () => {
    const addWarmup = jest.fn<ActiveWorkoutCommands["addWarmup"]>()
      .mockRejectedValueOnce(new Error("storage_failed"))
      .mockResolvedValueOnce({ ...initialView, committedSetId: "warmup-2" });
    const addWorkingSet = jest.fn<ActiveWorkoutCommands["addWorkingSet"]>()
      .mockRejectedValueOnce(new Error("storage_failed"))
      .mockResolvedValueOnce({ ...initialView, committedSetId: "working-added" });
    await renderActive({
      commands: commands({ addWarmup, addWorkingSet }),
    });

    for (const [action, retry] of [
      ["Add warm-up", "Retry add warm-up"],
      ["Add working set", "Retry add working set"],
    ] as const) {
      await fireEvent.press(screen.getByRole("button", { name: action }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: retry })).toBeOnTheScreen();
      });
      await fireEvent.press(screen.getByRole("button", { name: retry }));
    }

    await waitFor(() => {
      expect(addWarmup).toHaveBeenCalledTimes(2);
      expect(addWorkingSet).toHaveBeenCalledTimes(2);
    });
  });

  it("guards repeated add-working taps until the committed mutation settles", async () => {
    let resolveAdd: (value: Awaited<
      ReturnType<ActiveWorkoutCommands["addWorkingSet"]>
    >) => void = () => undefined;
    const addWorkingSet = jest.fn<ActiveWorkoutCommands["addWorkingSet"]>(
      () => new Promise((resolve) => {
        resolveAdd = resolve;
      }),
    );
    await renderActive({ commands: commands({ addWorkingSet }) });
    const addAction = screen.getByRole("button", { name: "Add working set" });

    await fireEvent.press(addAction);
    await fireEvent.press(addAction);

    expect(addWorkingSet).toHaveBeenCalledTimes(1);
    expect(addAction).toHaveProp("accessibilityState", expect.objectContaining({
      busy: true,
      disabled: true,
    }));
    await act(async () => {
      resolveAdd({ ...initialView, committedSetId: "working-2" });
    });
  });

  it("shows the finish action after the final authoritative set result", async () => {
    const finish = jest.fn();
    const finalView: ActiveWorkoutView = {
      ...completedView,
      activeSetId: null,
      progress: {
        completedWorkingSets: 2,
        totalWorkingSets: 2,
      },
      currentExercise: {
        ...completedView.currentExercise,
        status: "completed",
        workingSets: completedView.currentExercise.workingSets.map((set) => ({
          ...set,
          status: "completed" as const,
          completedAtMs: 2_000,
        })),
      },
      rest: {
        version: 1,
        state: "idle",
        revision: 2,
        nextSetId: null,
      },
    };
    await renderActive({
      commands: commands({
        completeSet: jest.fn<ActiveWorkoutCommands["completeSet"]>(async () => ({
          outcome: "committed",
          view: finalView,
        })),
      }),
      onFinishLater: finish,
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Complete Set 1" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Finish workout" }),
    );
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it("shows a completion state when no working set remains", async () => {
    const finish = jest.fn();
    const completedExerciseView: ActiveWorkoutView = {
      ...initialView,
      activeSetId: null,
      currentExercise: {
        ...initialView.currentExercise,
        status: "completed",
        workingSets: initialView.currentExercise.workingSets.map((set) => ({
          ...set,
          status: "skipped" as const,
        })),
      },
      progress: {
        completedWorkingSets: 0,
        totalWorkingSets: 2,
      },
    };
    const { rendered } = await renderActive({
      onFinishLater: finish,
    });

    await rendered.rerender(
      <AppearanceProvider>
        <ActiveWorkoutScreen
          commands={commands()}
          nowMs={() => 2_000}
          onFinishLater={finish}
          onGoBack={jest.fn()}
          sessionId="session-1"
          view={completedExerciseView}
        />
      </AppearanceProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Finish workout" }))
        .toBeOnTheScreen();
    });
    expect(screen.getByLabelText(/Working set 1 of 2/u))
      .toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Finish workout" }),
    );
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it("requires explicit partial and discard confirmations", async () => {
    const activeCommands = commands();
    const finishLater = jest.fn();
    const outcomeSaved = jest.fn();
    const discarded = jest.fn();
    await renderActive({
      commands: activeCommands,
      onFinishLater: finishLater,
      onOutcomeSaved: outcomeSaved,
      onDiscarded: discarded,
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "More workout actions" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Finish as partial" }),
    );
    expect(screen.getByRole("header", { name: "Save partial workout?" }))
      .toBeOnTheScreen();
    expect(activeCommands.finishPartial).not.toHaveBeenCalled();
    expect(screen.getByTestId("save-partial-workout-confirm"))
      .toBeEnabled();
    await fireEvent.press(
      screen.getByTestId("save-partial-workout-confirm"),
    );
    await waitFor(() => {
      expect(activeCommands.finishPartial).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmation: "save_partial_workout",
          expectedSessionRevision: initialView.revision,
        }),
      );
      expect(outcomeSaved).toHaveBeenCalledWith(initialView.id);
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "More workout actions" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Discard workout" }),
    );
    expect(screen.getByRole("header", { name: "Discard workout?" }))
      .toBeOnTheScreen();
    expect(activeCommands.discardWorkout).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole("button", { name: "Discard workout" }),
    );
    await waitFor(() => {
      expect(activeCommands.discardWorkout).toHaveBeenCalledWith(
        expect.objectContaining({ confirmation: "discard_workout" }),
      );
      expect(discarded).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the workout overflow quiet, natural-height, and limited to retained outcomes", async () => {
    await renderActive();

    expect(screen.queryByText("Rest resumed")).not.toBeOnTheScreen();
    expect(screen.queryByText("Warm-up added")).not.toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "More workout actions" }),
    );

    const sheet = screen.getByTestId("workout-actions-sheet-content");
    expect(sheet).toHaveStyle({ maxHeight: "90%" });
    expect(sheet.props.style).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ height: expect.anything() }),
    ]));
    expect(screen.getByRole("button", { name: "Finish as partial" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Discard workout" }))
      .toBeOnTheScreen();
    for (const removedAction of [
      "Start rest",
      "Skip Back Squat",
      "Save zero-set workout",
      "Finish workout later",
      "Close",
    ]) {
      expect(screen.queryByRole("button", { name: removedAction }))
        .not.toBeOnTheScreen();
    }
  });

  it("routes RestDock controls through revision-checked rest commands", async () => {
    const runningView: ActiveWorkoutView = {
      ...initialView,
      revision: 2,
      rest: {
        version: 1,
        state: "running",
        revision: 1,
        startedAtMs: 2_000,
        endsAtMs: 182_000,
        nextSetId: "working-1",
      },
    };
    const pausedState = {
      version: 1 as const,
      state: "paused" as const,
      revision: 2,
      remainingMs: 180_000,
      nextSetId: "working-1",
    };
    const pauseRest = jest.fn(async () => ({
      state: pausedState,
      sessionRevision: 3,
      invalidationScopes: [
        ["active-workout", "session-1"],
        ["today"],
      ] as const,
    }));
    const resumeRest = jest.fn(async () => ({
      state: runningView.rest,
      sessionRevision: 4,
      invalidationScopes: [
        ["active-workout", "session-1"],
        ["today"],
      ] as const,
    }));
    const adjustRest = jest.fn(async () => ({
      state: runningView.rest,
      sessionRevision: 5,
      invalidationScopes: [
        ["active-workout", "session-1"],
        ["today"],
      ] as const,
    }));
    const skipRest = jest.fn(async () => ({
      state: {
        version: 1 as const,
        state: "idle" as const,
        revision: 6,
        nextSetId: null,
      },
      sessionRevision: 6,
      invalidationScopes: [
        ["active-workout", "session-1"],
        ["today"],
      ] as const,
    }));
    await renderActive({
      commands: commands({
        pauseRest,
        resumeRest,
        adjustRest,
        skipRest,
      }),
      view: runningView,
    });
    expect(screen.getByRole("button", { name: "Complete Set 1" }))
      .toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove set 1" }))
      .toBeDisabled();

    await fireEvent.press(screen.getByRole("button", {
      name: "Expand rest controls",
    }));
    await fireEvent.press(
      screen.getByRole("button", { name: "Pause rest" }),
    );
    await waitFor(() => {
      expect(pauseRest).toHaveBeenCalledWith(expect.objectContaining({
        expectedSessionRevision: 2,
        expectedRestRevision: 1,
      }));
    });
    expect(screen.getByText("REST PAUSED · NEXT: SET 1 AT 60 kg × 8"))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Collapse rest controls",
    }));
    expect(screen.getByText("03:00")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Expand rest controls",
    }));
    await fireEvent.press(
      screen.getByRole("button", { name: "Resume rest" }),
    );
    await waitFor(() => {
      expect(resumeRest).toHaveBeenCalledWith(expect.objectContaining({
        expectedSessionRevision: 3,
        expectedRestRevision: 2,
      }));
    });
    expect(screen.getByText("RESTING · NEXT: SET 1 AT 60 kg × 8"))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Collapse rest controls",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Expand rest controls",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Add 15 seconds",
    }));
    await waitFor(() => {
      expect(adjustRest).toHaveBeenCalledWith(expect.objectContaining({
        deltaMs: 15_000,
      }));
    });
    await fireEvent.press(screen.getByRole("button", { name: "Skip rest" }));
    await waitFor(() => {
      expect(skipRest).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("button", { name: "Complete Set 1" }))
      .toBeOnTheScreen();
  });

  it("expires collapsed rest through the authoritative command without skipped feedback", async () => {
    jest.useFakeTimers();
    try {
      let nowMs = 1_000;
      const expireRest = jest.fn(async () => ({
        state: {
          version: 1 as const,
          state: "expired" as const,
          revision: 2,
          expiredAtMs: 2_000,
          nextSetId: "working-1",
        },
        sessionRevision: 3,
        invalidationScopes: [
          ["active-workout", "session-1"],
          ["today"],
        ] as const,
      }));
      await renderActive({
        commands: commands({ expireRest }),
        nowMs: () => nowMs,
        view: {
          ...initialView,
          revision: 2,
          rest: {
            version: 1,
            state: "running",
            revision: 1,
            startedAtMs: 1_000,
            endsAtMs: 2_000,
            nextSetId: "working-1",
          },
        },
      });

      expect(screen.getByText("00:01")).toBeOnTheScreen();
      nowMs = 2_000;
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });

      await waitFor(() => {
        expect(expireRest).toHaveBeenCalledWith(expect.objectContaining({
          expectedSessionRevision: 2,
          expectedRestRevision: 1,
        }));
        expect(screen.getByRole("button", { name: "Complete Set 1" }))
          .toBeOnTheScreen();
      });
      expect(screen.queryByText("Rest skipped")).not.toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    [
      "running",
      {
        version: 1 as const,
        state: "running" as const,
        revision: 1,
        startedAtMs: 2_000,
        endsAtMs: 182_000,
        nextSetId: "working-1",
      },
    ],
    [
      "paused",
      {
        version: 1 as const,
        state: "paused" as const,
        revision: 1,
        remainingMs: 180_000,
        nextSetId: "working-1",
      },
    ],
  ] as const)(
    "skips %s rest once and transitions directly to the ready state",
    async (...[_stateName, rest]) => {
      let resolveSkip: ((result: RestCommandResult) => void) | undefined;
      const skipRest = jest.fn<ActiveWorkoutCommands["skipRest"]>(
        () => new Promise<RestCommandResult>((resolve) => {
          resolveSkip = resolve;
        }),
      );
      const { rendered } = await renderActive({
        commands: commands({ skipRest }),
        view: {
          ...initialView,
          revision: 2,
          rest,
        },
      });

      await fireEvent.press(screen.getByRole("button", {
        name: "Expand rest controls",
      }));
      await fireEvent.press(screen.getByRole("button", { name: "Skip rest" }));
      await fireEvent.press(screen.getByRole("button", { name: "Skip rest" }));
      expect(skipRest).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveSkip?.({
          state: {
            version: 1,
            state: "idle",
            revision: rest.revision + 1,
            nextSetId: null,
          },
          sessionRevision: 3,
          invalidationScopes: [
            ["active-workout", "session-1"],
            ["today"],
          ],
        });
      });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Complete Set 1" }))
          .toBeOnTheScreen();
      });
      expect(screen.queryByText("Rest skipped")).not.toBeOnTheScreen();
      expect(JSON.stringify(rendered.toJSON())).not.toContain("Rest skipped");
    },
  );

  it("rehydrates running, paused, and expired rest from authoritative props", async () => {
    const { rendered } = await renderActive();
    await rendered.rerender(
      <AppearanceProvider>
        <ActiveWorkoutScreen
          commands={commands()}
          nowMs={() => 40_000}
          onFinishLater={jest.fn()}
          onGoBack={jest.fn()}
          sessionId="session-1"
          view={{
            ...initialView,
            revision: 2,
            rest: {
              version: 1,
              state: "running",
              revision: 1,
              startedAtMs: 10_000,
              endsAtMs: 100_000,
              nextSetId: "working-1",
            },
          }}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByText("RESTING · NEXT: SET 1 AT 60 kg × 8"))
      .toBeOnTheScreen();

    await rendered.rerender(
      <AppearanceProvider>
        <ActiveWorkoutScreen
          commands={commands()}
          nowMs={() => 40_000}
          onFinishLater={jest.fn()}
          onGoBack={jest.fn()}
          sessionId="session-1"
          view={{
            ...initialView,
            revision: 3,
            rest: {
              version: 1,
              state: "paused",
              revision: 2,
              remainingMs: 60_000,
              nextSetId: "working-1",
            },
          }}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByText("REST PAUSED · NEXT: SET 1 AT 60 kg × 8"))
      .toBeOnTheScreen();

    await rendered.rerender(
      <AppearanceProvider>
        <ActiveWorkoutScreen
          commands={commands()}
          nowMs={() => 50_000}
          onFinishLater={jest.fn()}
          onGoBack={jest.fn()}
          sessionId="session-1"
          view={{
            ...initialView,
            revision: 4,
            rest: {
              version: 1,
              state: "expired",
              revision: 3,
              expiredAtMs: 45_000,
              nextSetId: "working-1",
            },
          }}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByRole("button", { name: "Complete Set 1" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ disabled: false }));
    expect(screen.queryByText("RESTING · NEXT: SET 1 AT 60 kg × 8"))
      .not.toBeOnTheScreen();
  });

  it("configures and starts per-rep cadence for the active working set", async () => {
    const configureAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["configureAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    }, 2));
    const running: AdvancedTimingStateV1 = {
      version: 1,
      state: "running",
      mode: "per_rep",
      revision: 1,
      targetSessionSetId: "working-1",
      cueChannels: "haptic",
      intervalMs: 4_000,
      startedAtMs: 2_000,
      nextBoundaryAtMs: 6_000,
      nextRepetitionIndex: 1,
    };
    const startAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["startAdvancedTiming"]
    >>(async () => advancedResult(running, 2));
    const onAdvancedTimingChanged = jest.fn();

    await renderActive({
      advancedTimingContext: {
        sessionId: "session-1",
        sessionRevision: 1,
        state: {
          version: 1,
          state: "idle",
          revision: 0,
          targetSessionSetId: null,
        },
      },
      commands: commands({
        configureAdvancedTiming,
        startAdvancedTiming,
      }),
      onAdvancedTimingChanged,
    });

    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId("advanced-timing-interval-seconds"),
        "4",
      );
    });
    await fireEvent.press(screen.getByRole("button", {
      name: "Configure and start per-rep cadence",
    }));

    expect(configureAdvancedTiming).toHaveBeenCalledWith({
      sessionId: "session-1",
      sessionSetId: "working-1",
      expectedSessionRevision: 1,
      expectedAdvancedTimingRevision: 0,
      nowMs: 2_000,
      config: {
        version: 1,
        mode: "per_rep",
        intervalMs: 4_000,
        cueChannels: "haptic",
      },
    });
    expect(startAdvancedTiming).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      sessionSetId: "working-1",
      expectedSessionRevision: 2,
      expectedAdvancedTimingRevision: 0,
    }));
    expect(onAdvancedTimingChanged).toHaveBeenLastCalledWith({
      sessionId: "session-1",
      sessionRevision: 2,
      state: running,
    });
  });

  it("uses the locally committed timing revision for the next command before route refresh", async () => {
    const configureAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["configureAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    }, 2));
    const running: AdvancedTimingStateV1 = {
      version: 1,
      state: "running",
      mode: "per_rep",
      revision: 1,
      targetSessionSetId: "working-1",
      cueChannels: "haptic",
      intervalMs: 3_000,
      startedAtMs: 2_000,
      nextBoundaryAtMs: 5_000,
      nextRepetitionIndex: 1,
    };
    const startAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["startAdvancedTiming"]
    >>(async () => advancedResult(running, 2));
    const pauseAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["pauseAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "paused",
      mode: "per_rep",
      revision: 2,
      targetSessionSetId: "working-1",
      cueChannels: "haptic",
      intervalMs: 3_000,
      remainingMs: 2_000,
      nextRepetitionIndex: 1,
    }, 2));

    await renderActive({
      advancedTimingContext: {
        sessionId: "session-1",
        sessionRevision: 1,
        state: { version: 1, state: "idle", revision: 0, targetSessionSetId: null },
      },
      commands: commands({
        configureAdvancedTiming,
        pauseAdvancedTiming,
        startAdvancedTiming,
      }),
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Configure and start per-rep cadence",
    }));
    await waitFor(() => expect(startAdvancedTiming).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByRole("button", {
      name: "Pause per-rep cadence",
    }));

    await waitFor(() => expect(pauseAdvancedTiming).toHaveBeenCalledWith({
      sessionId: "session-1",
      sessionSetId: "working-1",
      expectedSessionRevision: 2,
      expectedAdvancedTimingRevision: 1,
      nowMs: 2_000,
    }));
  });

  it("uses the active set's resolved audio preference when starting per-rep cadence", async () => {
    const configureAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["configureAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    }, 2));
    const startAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["startAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "running",
      mode: "per_rep",
      revision: 1,
      targetSessionSetId: "working-1",
      cueChannels: "audio",
      intervalMs: 3_000,
      startedAtMs: 2_000,
      nextBoundaryAtMs: 5_000,
      nextRepetitionIndex: 1,
    }, 2));
    const view: ActiveWorkoutView = {
      ...initialView,
      currentExercise: {
        ...initialView.currentExercise,
        workingSets: initialView.currentExercise.workingSets.map((set) =>
          set.id === "working-1"
            ? {
                ...set,
                advancedTimingResolved: {
                  version: 1,
                  mode: "per_rep",
                  intervalMs: 3_000,
                  cueChannels: "audio",
                },
              }
            : set
        ),
      },
    };

    await renderActive({
      advancedTimingContext: {
        sessionId: "session-1",
        sessionRevision: 1,
        state: {
          version: 1,
          state: "idle",
          revision: 0,
          targetSessionSetId: null,
        },
      },
      commands: commands({ configureAdvancedTiming, startAdvancedTiming }),
      view,
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Configure and start per-rep cadence",
    }));

    expect(configureAdvancedTiming).toHaveBeenCalledWith(expect.objectContaining({
      config: {
        version: 1,
        mode: "per_rep",
        intervalMs: 3_000,
        cueChannels: "audio",
      },
    }));
  });

  it("keeps the independent RestDock visible while advanced timing is running", async () => {
    const runningAdvanced: AdvancedTimingStateV1 = {
      version: 1,
      state: "running",
      mode: "per_rep",
      revision: 1,
      targetSessionSetId: "working-1",
      cueChannels: "both",
      intervalMs: 3_000,
      startedAtMs: 2_000,
      nextBoundaryAtMs: 5_000,
      nextRepetitionIndex: 1,
    };
    const view: ActiveWorkoutView = {
      ...initialView,
      rest: {
        version: 1,
        state: "running",
        revision: 2,
        startedAtMs: 2_000,
        endsAtMs: 92_000,
        nextSetId: "working-1",
      },
    };

    await renderActive({
      advancedTimingContext: {
        sessionId: "session-1",
        sessionRevision: 1,
        state: runningAdvanced,
      },
      commands: commands({
        pauseAdvancedTiming: jest.fn(async () => advancedResult({
          ...runningAdvanced,
          state: "paused",
          remainingMs: 3_000,
        }, 1)),
      }),
      view,
    });

    expect(screen.getByLabelText("Per-rep cadence status. Rep 1 · 00:03"))
      .toBeOnTheScreen();
    expect(screen.getByText("RESTING · NEXT: SET 1 AT 60 kg × 8"))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Expand rest controls" }));
    expect(screen.getByRole("button", { name: "Pause rest" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Pause per-rep cadence" }))
      .toBeOnTheScreen();
  });

  it("configures cluster timing and advances intra-set gaps without rest or set commands", async () => {
    const configureAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["configureAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    }, 2));
    const ready: AdvancedTimingStateV1 = {
      version: 1,
      state: "cluster_ready",
      mode: "cluster",
      revision: 1,
      targetSessionSetId: "working-1",
      cueChannels: "haptic",
      groupSizes: [3, 3, 3],
      intraRestMs: 20_000,
      currentGroupIndex: 0,
    };
    const gap: AdvancedTimingStateV1 = {
      ...ready,
      state: "cluster_gap_running",
      revision: 2,
      gapStartedAtMs: 2_000,
      gapEndsAtMs: 22_000,
    };
    const secondReady: AdvancedTimingStateV1 = {
      ...ready,
      revision: 3,
      currentGroupIndex: 1,
    };
    const startAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["startAdvancedTiming"]
    >>(async () => advancedResult(ready, 2));
    const beginAdvancedTimingClusterGap = jest.fn<NonNullable<
      ActiveWorkoutCommands["beginAdvancedTimingClusterGap"]
    >>(async () => advancedResult(gap, 2));
    const skipAdvancedTimingClusterGap = jest.fn<NonNullable<
      ActiveWorkoutCommands["skipAdvancedTimingClusterGap"]
    >>(async () => advancedResult(secondReady, 2));
    const completeSet = jest.fn<ActiveWorkoutCommands["completeSet"]>(async () => ({
      outcome: "committed",
      view: completedView,
    }));
    const startManualRest = jest.fn<ActiveWorkoutCommands["startManualRest"]>(async () => ({
      state: completedView.rest,
      sessionRevision: 2,
      invalidationScopes: [["active-workout", "session-1"], ["today"]],
    }));
    const countdownCue = {
      playShortCue: jest.fn(async () => undefined),
      playLongCue: jest.fn(async () => undefined),
    };
    const onAdvancedTimingChanged = jest.fn();

    const { rendered } = await renderActive({
      advancedTimingContext: {
        sessionId: "session-1",
        sessionRevision: 1,
        state: {
          version: 1,
          state: "idle",
          revision: 0,
          targetSessionSetId: null,
        },
      },
      commands: commands({
        beginAdvancedTimingClusterGap,
        completeSet,
        configureAdvancedTiming,
        skipAdvancedTimingClusterGap,
        startAdvancedTiming,
        startManualRest,
      }),
      countdownCue,
      onAdvancedTimingChanged,
    });

    await fireEvent.press(screen.getByRole("button", { name: "Select cluster timing" }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Configure and start cluster timing",
    }));

    expect(configureAdvancedTiming).toHaveBeenCalledWith({
      sessionId: "session-1",
      sessionSetId: "working-1",
      expectedSessionRevision: 1,
      expectedAdvancedTimingRevision: 0,
      nowMs: 2_000,
      config: {
        version: 1,
        mode: "cluster",
        groupSizes: [3, 3, 3],
        intraRestMs: 20_000,
        cueChannels: "haptic",
      },
    });
    expect(startAdvancedTiming).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      sessionSetId: "working-1",
      expectedSessionRevision: 2,
      expectedAdvancedTimingRevision: 0,
      countdownCue,
    }));

    await rendered.rerender(
      <AppearanceProvider>
        <ActiveWorkoutScreen
          commands={commands({
            beginAdvancedTimingClusterGap,
            completeSet,
            configureAdvancedTiming,
            skipAdvancedTimingClusterGap,
            startAdvancedTiming,
            startManualRest,
          })}
          nowMs={() => 2_000}
          onAdvancedTimingChanged={onAdvancedTimingChanged}
          onFinishLater={jest.fn()}
          onGoBack={jest.fn()}
          sessionId="session-1"
          view={{ ...initialView, revision: 2 }}
          countdownCue={countdownCue}
          advancedTimingContext={{
            sessionId: "session-1",
            sessionRevision: 2,
            state: ready,
          }}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByRole("button", { name: "Complete Set 1" }))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Start rest after group 1",
    }));
    expect(beginAdvancedTimingClusterGap).toHaveBeenCalledWith({
      sessionId: "session-1",
      sessionSetId: "working-1",
      expectedSessionRevision: 2,
      expectedAdvancedTimingRevision: 1,
      nowMs: 2_000,
      countdownCue,
    });

    await rendered.rerender(
      <AppearanceProvider>
        <ActiveWorkoutScreen
          commands={commands({
            beginAdvancedTimingClusterGap,
            completeSet,
            configureAdvancedTiming,
            skipAdvancedTimingClusterGap,
            startAdvancedTiming,
            startManualRest,
          })}
          nowMs={() => 2_000}
          onAdvancedTimingChanged={onAdvancedTimingChanged}
          onFinishLater={jest.fn()}
          onGoBack={jest.fn()}
          sessionId="session-1"
          view={{
            ...initialView,
            revision: 2,
            rest: {
              version: 1,
              state: "running",
              revision: 4,
              startedAtMs: 2_000,
              endsAtMs: 62_000,
              nextSetId: "working-2",
            },
          }}
          countdownCue={countdownCue}
          advancedTimingContext={{
            sessionId: "session-1",
            sessionRevision: 2,
            state: gap,
          }}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByText("RESTING · NEXT: SET 1 AT 60 kg × 8"))
      .toBeOnTheScreen();
    expect(screen.getByLabelText(
      "Cluster timing status. Cluster 1 of 3. Intra-set rest · 00:20",
    )).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Complete Set 1" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ disabled: true }));
    await fireEvent.press(screen.getByRole("button", { name: "Skip intra-set rest" }));

    expect(skipAdvancedTimingClusterGap).toHaveBeenCalledWith({
      sessionId: "session-1",
      sessionSetId: "working-1",
      expectedSessionRevision: 2,
      expectedAdvancedTimingRevision: 2,
      nowMs: 2_000,
      countdownCue,
    });
    expect(completeSet).not.toHaveBeenCalled();
    expect(startManualRest).not.toHaveBeenCalled();
  });

  it("keeps normal set completion available while per-rep timing is visible", async () => {
    const completeSet = jest.fn<ActiveWorkoutCommands["completeSet"]>(async () => ({
      outcome: "committed",
      view: completedView,
    }));
    const configureAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["configureAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    }, 3));
    const startAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["startAdvancedTiming"]
    >>(async (input) => advancedResult({
      version: 1,
      state: "running",
      mode: "per_rep",
      revision: 1,
      targetSessionSetId: input.sessionSetId,
      cueChannels: "haptic",
      intervalMs: 3_000,
      startedAtMs: input.nowMs,
      nextBoundaryAtMs: input.nowMs + 3_000,
      nextRepetitionIndex: 1,
    }, 3));
    await renderActive({
      advancedTimingContext: {
        sessionId: "session-1",
        sessionRevision: 1,
        state: {
          version: 1,
          state: "running",
          mode: "per_rep",
          revision: 1,
          targetSessionSetId: "working-1",
          cueChannels: "haptic",
          intervalMs: 3_000,
          startedAtMs: 2_000,
          nextBoundaryAtMs: 5_000,
          nextRepetitionIndex: 1,
        },
      },
      commands: commands({
        completeSet,
        configureAdvancedTiming,
        startAdvancedTiming,
        pauseAdvancedTiming: jest.fn(async () => advancedResult({
          version: 1,
          state: "paused",
          mode: "per_rep",
          revision: 2,
          targetSessionSetId: "working-1",
          cueChannels: "haptic",
          intervalMs: 3_000,
          remainingMs: 2_000,
          nextRepetitionIndex: 1,
        })),
        resumeAdvancedTiming: jest.fn(async () => advancedResult({
          version: 1,
          state: "running",
          mode: "per_rep",
          revision: 3,
          targetSessionSetId: "working-1",
          cueChannels: "haptic",
          intervalMs: 3_000,
          startedAtMs: 4_000,
          nextBoundaryAtMs: 6_000,
          nextRepetitionIndex: 1,
        })),
        stopAdvancedTiming: jest.fn(async () => advancedResult({
          version: 1,
          state: "stopped",
          mode: "per_rep",
          revision: 2,
          targetSessionSetId: "working-1",
          stoppedAtMs: 2_000,
          nextRepetitionIndex: 1,
        })),
      }),
      cueUnavailable: true,
    });

    expect(screen.getByText("Timing cue unavailable")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Complete Set 1" }))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Complete Set 1" }));
    await waitFor(() => expect(completeSet).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        setId: "working-1",
      }),
    ));
    await fireEvent.press(screen.getByRole("button", {
      name: "Configure and start per-rep cadence",
    }));
    await waitFor(() => expect(configureAdvancedTiming).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionSetId: "working-2",
        expectedSessionRevision: 2,
        expectedAdvancedTimingRevision: 0,
      }),
    ));
    expect(startAdvancedTiming).toHaveBeenCalledWith(expect.objectContaining({
      sessionSetId: "working-2",
    }));
  });

  it("configures the active exercise timing default through the session command", async () => {
    const updateSessionExerciseAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["updateSessionExerciseAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    }, 2));

    await renderActive({
      advancedTimingContext: {
        sessionId: "session-1",
        sessionRevision: 1,
        state: { version: 1, state: "idle", revision: 0, targetSessionSetId: null },
      },
      commands: commands({ updateSessionExerciseAdvancedTiming }),
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Back Squat exercise actions" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Configure timing" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Per-rep timing" }));
    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId("advanced-timing-config-interval"),
        "3",
      );
    });
    await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));

    await waitFor(() =>
      expect(updateSessionExerciseAdvancedTiming).toHaveBeenCalledWith({
        sessionId: "session-1",
        sessionExerciseId: "session-exercise-1",
        expectedSessionRevision: 1,
        expectedSessionExerciseRevision: 1,
        nowMs: 2_000,
        config: {
          version: 1,
          mode: "per_rep",
          intervalMs: 3_000,
          cueChannels: "haptic",
        },
      }));
  });

  it("scrolls to the timing panel after a timing save instead of restoring the active set", async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, "scrollTo")
      .mockImplementation(() => undefined);
    const updateSessionExerciseAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["updateSessionExerciseAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    }, 2));

    const { props, rendered } = await renderActive({
      advancedTimingContext: {
        sessionId: "session-1",
        sessionRevision: 1,
        state: { version: 1, state: "idle", revision: 0, targetSessionSetId: null },
      },
      commands: commands({ updateSessionExerciseAdvancedTiming }),
    });
    scrollTo.mockClear();

    await fireEvent.press(screen.getByRole("button", {
      name: "Configure Back Squat timing",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Per-rep timing" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));
    await waitFor(() => expect(updateSessionExerciseAdvancedTiming).toHaveBeenCalledTimes(1));
    await rendered.rerender(
      <AppearanceProvider>
        <ActiveWorkoutScreen
          {...props}
          view={{ ...initialView, revision: 2 }}
        />
      </AppearanceProvider>,
    );

    await fireEvent(screen.getByTestId("overview-exercise-session-exercise-1"), "layout", {
      nativeEvent: { layout: { x: 0, y: 120, width: 320, height: 400 } },
    });
    await fireEvent(screen.getByTestId("overview-working-card-session-exercise-1"), "layout", {
      nativeEvent: { layout: { x: 0, y: 40, width: 320, height: 240 } },
    });
    await fireEvent(screen.getByTestId("working-set-1-row"), "layout", {
      nativeEvent: { layout: { x: 0, y: 32, width: 320, height: 160 } },
    });
    await fireEvent(screen.getByTestId("advanced-timing-panel-measurement"), "layout", {
      nativeEvent: { layout: { x: 0, y: 16, width: 320, height: 240 } },
    });

    await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith({
      animated: true,
      x: 0,
      y: 176,
    }));
    scrollTo.mockRestore();
  });

  it("overrides the active working-set timing and inherits from the exercise", async () => {
    const updateSessionSetAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["updateSessionSetAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    }, 2));

    await renderActive({
      advancedTimingContext: {
        sessionId: "session-1",
        sessionRevision: 1,
        state: { version: 1, state: "idle", revision: 0, targetSessionSetId: null },
      },
      commands: commands({ updateSessionSetAdvancedTiming }),
    });

    expect(screen.getByTestId("set-timing-summary-session-exercise-1-working-1"))
      .toHaveTextContent("Working set 1 timing · Inherits exercise timing");

    await fireEvent.press(screen.getByRole("button", {
      name: "Configure Back Squat, working set 1 timing",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Off timing" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));

    await waitFor(() =>
      expect(updateSessionSetAdvancedTiming).toHaveBeenCalledWith({
        sessionId: "session-1",
        sessionSetId: "working-1",
        expectedSessionRevision: 1,
        expectedSetRevision: 1,
        override: { version: 1, mode: "off" },
        nowMs: 2_000,
      }));
  });

  it("uses the refreshed inherited revision and immediately renders a saved set-level cluster override", async () => {
    const updateSessionExerciseAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["updateSessionExerciseAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    }, 2));
    const updateSessionSetAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["updateSessionSetAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    }, 3));

    await renderActive({
      advancedTimingContext: {
        sessionId: "session-1",
        sessionRevision: 1,
        state: { version: 1, state: "idle", revision: 0, targetSessionSetId: null },
      },
      commands: commands({
        updateSessionExerciseAdvancedTiming,
        updateSessionSetAdvancedTiming,
      }),
    });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", {
        name: "Configure Back Squat timing",
      }));
    });
    await waitFor(() => expect(screen.getByRole("button", {
      name: "Per-rep timing",
    })).toBeOnTheScreen());
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Per-rep timing" }));
    });
    await waitFor(() => expect(screen.getByTestId(
      "advanced-timing-config-interval",
    )).toBeOnTheScreen());
    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId("advanced-timing-config-interval"),
        "3",
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save timing" }));
    });

    await waitFor(() => expect(updateSessionExerciseAdvancedTiming)
      .toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("button", {
      name: "Per-rep timing",
    })).not.toBeOnTheScreen());

    await act(async () => {
      fireEvent.press(screen.getByRole("button", {
        name: "Configure Back Squat, working set 1 timing",
      }));
    });
    await waitFor(() => expect(screen.getByRole("button", {
      name: "Cluster timing",
    })).toBeOnTheScreen());
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Cluster timing" }));
    });
    await waitFor(() => expect(screen.getByTestId(
      "advanced-timing-config-cluster-pattern",
    )).toBeOnTheScreen());
    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId("advanced-timing-config-cluster-pattern"),
        "3+3+3",
      );
      fireEvent.changeText(
        screen.getByTestId("advanced-timing-config-cluster-rest"),
        "20",
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "both cues" }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save timing" }));
    });

    await waitFor(() => expect(updateSessionSetAdvancedTiming).toHaveBeenCalledWith({
      sessionId: "session-1",
      sessionSetId: "working-1",
      expectedSessionRevision: 2,
      expectedSetRevision: 2,
      override: {
        version: 1,
        mode: "cluster",
        groupSizes: [3, 3, 3],
        intraRestMs: 20_000,
        cueChannels: "both",
      },
      nowMs: 2_000,
    }));

    expect(screen.getByTestId("set-timing-summary-session-exercise-1-working-1"))
      .toHaveTextContent("Working set 1 timing · Cluster 3+3+3 · 20 sec · both");
    expect(screen.getByText("Cluster timing")).toBeOnTheScreen();
    expect(screen.getByLabelText("Cluster grouping")).toBeOnTheScreen();
  });

  it("immediately restores the exercise default after clearing a set-level override", async () => {
    const updateSessionSetAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["updateSessionSetAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    }, 2));
    const perRepDefault = {
      version: 1 as const,
      mode: "per_rep" as const,
      intervalMs: 3_000,
      cueChannels: "audio" as const,
    };
    const clusterOverride = {
      version: 1 as const,
      mode: "cluster" as const,
      groupSizes: [3, 3, 3],
      intraRestMs: 20_000,
      cueChannels: "both" as const,
    };
    const view: ActiveWorkoutView = {
      ...initialView,
      currentExercise: {
        ...initialView.currentExercise,
        advancedTimingDefault: perRepDefault,
        workingSets: initialView.currentExercise.workingSets.map((set) =>
          set.id === "working-1"
            ? {
                ...set,
                advancedTimingOverride: clusterOverride,
                advancedTimingResolved: clusterOverride,
              }
            : set),
      },
    };

    await renderActive({
      advancedTimingContext: {
        sessionId: "session-1",
        sessionRevision: 1,
        state: { version: 1, state: "idle", revision: 0, targetSessionSetId: null },
      },
      commands: commands({ updateSessionSetAdvancedTiming }),
      view,
    });

    expect(screen.getByText("Cluster timing")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Configure Back Squat, working set 1 timing",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Inherit timing" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));

    await waitFor(() => expect(updateSessionSetAdvancedTiming).toHaveBeenCalledWith({
      sessionId: "session-1",
      sessionSetId: "working-1",
      expectedSessionRevision: 1,
      expectedSetRevision: 1,
      override: null,
      nowMs: 2_000,
    }));

    expect(screen.getByTestId("set-timing-summary-session-exercise-1-working-1"))
      .toHaveTextContent("Working set 1 timing · Inherits exercise timing");
    expect(screen.getByText("Per-rep cadence")).toBeOnTheScreen();
    expect(screen.getByLabelText("Per-rep interval in seconds"))
      .toHaveProp("value", "3");
  });

  it("keeps a completed working set read-only for advanced timing", async () => {
    const updateSessionSetAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["updateSessionSetAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    }, 2));
    const completedActiveSet: ActiveWorkoutView = {
      ...initialView,
      currentExercise: {
        ...initialView.currentExercise,
        workingSets: initialView.currentExercise.workingSets.map((set, index) =>
          index === 0
            ? {
                ...set,
                status: "completed" as const,
                completedAtMs: 3_000,
                observation: loadReps(60_000, 8, "manual"),
              }
            : set
        ),
      },
    };

    await renderActive({
      view: completedActiveSet,
      advancedTimingContext: {
        sessionId: "session-1",
        sessionRevision: 1,
        state: { version: 1, state: "idle", revision: 0, targetSessionSetId: null },
      },
      commands: commands({ updateSessionSetAdvancedTiming }),
    });

    expect(screen.getByTestId("set-timing-readonly-session-exercise-1-working-1"))
      .toHaveTextContent("Completed sets are read-only. Timing cannot change.");
    expect(screen.queryByRole("button", { name: "Configure Back Squat, working set 1 timing" }))
      .not.toBeOnTheScreen();
    expect(updateSessionSetAdvancedTiming).not.toHaveBeenCalled();
  });

  it("configures warm-up and working-set timing independently by row", async () => {
    let sessionRevision = initialView.revision;
    const updateSessionSetAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["updateSessionSetAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    }, ++sessionRevision));

    await renderActive({
      advancedTimingContext: {
        sessionId: "session-1",
        sessionRevision: 1,
        state: { version: 1, state: "idle", revision: 0, targetSessionSetId: null },
      },
      commands: commands({ updateSessionSetAdvancedTiming }),
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Configure Back Squat, warm-up W1 timing",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Per-rep timing" }));
    await fireEvent.changeText(
      screen.getByTestId("advanced-timing-config-interval"),
      "4",
    );
    await fireEvent.press(screen.getByTestId("advanced-timing-channel-audio"));
    await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));
    await waitFor(() => expect(updateSessionSetAdvancedTiming).toHaveBeenCalledTimes(1));

    await fireEvent.press(screen.getByRole("button", {
      name: "Configure Back Squat, working set 1 timing",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Off timing" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));
    await waitFor(() => expect(updateSessionSetAdvancedTiming).toHaveBeenCalledTimes(2));

    await fireEvent.press(screen.getByRole("button", {
      name: "Configure Back Squat, working set 2 timing",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Cluster timing" }));
    await fireEvent.changeText(
      screen.getByTestId("advanced-timing-config-cluster-pattern"),
      "2+2",
    );
    await fireEvent.changeText(
      screen.getByTestId("advanced-timing-config-cluster-rest"),
      "15",
    );
    await fireEvent.press(screen.getByTestId("advanced-timing-channel-both"));
    await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));
    await waitFor(() => expect(updateSessionSetAdvancedTiming).toHaveBeenCalledTimes(3));

    expect(updateSessionSetAdvancedTiming).toHaveBeenNthCalledWith(1, {
      sessionId: "session-1",
      sessionSetId: "warmup-1",
      expectedSessionRevision: 1,
      expectedSetRevision: 1,
      override: {
        version: 1,
        mode: "per_rep",
        intervalMs: 4_000,
        cueChannels: "audio",
      },
      nowMs: 2_000,
    });
    expect(updateSessionSetAdvancedTiming).toHaveBeenNthCalledWith(2, {
      sessionId: "session-1",
      sessionSetId: "working-1",
      expectedSessionRevision: 2,
      expectedSetRevision: 1,
      override: { version: 1, mode: "off" },
      nowMs: 2_000,
    });
    expect(updateSessionSetAdvancedTiming).toHaveBeenNthCalledWith(3, {
      sessionId: "session-1",
      sessionSetId: "working-2",
      expectedSessionRevision: 3,
      expectedSetRevision: 1,
      override: {
        version: 1,
        mode: "cluster",
        groupSizes: [2, 2],
        intraRestMs: 15_000,
        cueChannels: "both",
      },
      nowMs: 2_000,
    });
    expect(screen.getByTestId("set-timing-summary-session-exercise-1-warmup-1"))
      .toHaveTextContent("Warm-up W1 timing · Per-rep every 4 sec · audio");
    expect(screen.getByTestId("set-timing-summary-session-exercise-1-working-1"))
      .toHaveTextContent("Working set 1 timing · Off");
    expect(screen.getByTestId("set-timing-summary-session-exercise-1-working-2"))
      .toHaveTextContent("Working set 2 timing · Cluster 2+2 · 15 sec · both");
  });

  it("selects a configured warm-up as the active timing target", async () => {
    const updateSessionSetAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["updateSessionSetAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    }, 2));
    const configureAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["configureAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    }, 3));
    const startAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["startAdvancedTiming"]
    >>(async (input) => advancedResult({
      version: 1,
      state: "running",
      mode: "per_rep",
      revision: 1,
      targetSessionSetId: input.sessionSetId,
      cueChannels: "haptic",
      intervalMs: 3_000,
      startedAtMs: input.nowMs,
      nextBoundaryAtMs: input.nowMs + 3_000,
      nextRepetitionIndex: 1,
    }, 3));
    await renderActive({
      advancedTimingContext: {
        sessionId: "session-1",
        sessionRevision: 1,
        state: { version: 1, state: "idle", revision: 0, targetSessionSetId: null },
      },
      commands: commands({
        configureAdvancedTiming,
        startAdvancedTiming,
        updateSessionSetAdvancedTiming,
      }),
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Configure Back Squat, warm-up W1 timing",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Per-rep timing" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save timing" }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Configure and start per-rep cadence",
    }));

    await waitFor(() => expect(startAdvancedTiming).toHaveBeenCalledWith(
      expect.objectContaining({ sessionSetId: "warmup-1" }),
    ));
    expect(configureAdvancedTiming).toHaveBeenCalledWith(expect.objectContaining({
      sessionSetId: "warmup-1",
      expectedSessionRevision: 2,
    }));
  });

  it("uniquely identifies the same timing row ordinal across exercises", async () => {
    const source = overviewView();
    const activeExercise = {
      ...source.currentExercise,
      workingSets: source.currentExercise.workingSets.map((set, index) =>
        index === 1 ? { ...set, status: "skipped" as const } : set),
    };
    const active = {
      ...source,
      currentExercise: activeExercise,
      exercises: [source.exercises[0]!, activeExercise],
    };
    const futureExercise = {
      ...active.currentExercise,
      id: "session-exercise-3",
      exerciseId: "overhead-press",
      name: "Overhead Press",
      ordinal: 2,
      status: "planned" as const,
      warmups: active.currentExercise.warmups.map((set) => ({
        ...set,
        id: "overhead-warmup-1",
      })),
      workingSets: active.currentExercise.workingSets.map((set, index) => ({
        ...set,
        id: `overhead-working-${index + 1}`,
        status: index === 1 ? "skipped" as const : "planned" as const,
      })),
    };
    await renderActive({
      view: { ...active, exercises: [...active.exercises, futureExercise] },
      commands: commands({
        updateSessionSetAdvancedTiming: jest.fn(async () => advancedResult({
          version: 1,
          state: "idle",
          revision: 0,
          targetSessionSetId: null,
        }, 2)),
      }),
    });

    const benchTiming = screen.getByRole("button", {
      name: "Configure Bench Press, working set 1 timing",
    });
    const overheadTiming = screen.getByRole("button", {
      name: "Configure Overhead Press, working set 1 timing",
    });
    expect(benchTiming).toHaveProp(
      "testID",
      "set-timing-action-session-exercise-2-bench-working-1",
    );
    expect(overheadTiming).toHaveProp(
      "testID",
      "set-timing-action-session-exercise-3-overhead-working-1",
    );
    for (const [exerciseId, editableSetId, readonlySetId] of [
      ["session-exercise-2", "bench-working-1", "bench-working-2"],
      ["session-exercise-3", "overhead-working-1", "overhead-working-2"],
    ] as const) {
      expect(screen.getByTestId(`set-timing-${exerciseId}-${editableSetId}`))
        .toBeOnTheScreen();
      expect(screen.getByTestId(
        `set-timing-summary-${exerciseId}-${editableSetId}`,
      )).toBeOnTheScreen();
      expect(screen.getByTestId(
        `set-timing-readonly-${exerciseId}-${readonlySetId}`,
      )).toBeOnTheScreen();
    }
  });

  it("keeps completed and skipped set timing read-only", async () => {
    const updateSessionSetAdvancedTiming = jest.fn<NonNullable<
      ActiveWorkoutCommands["updateSessionSetAdvancedTiming"]
    >>(async () => advancedResult({
      version: 1,
      state: "idle",
      revision: 0,
      targetSessionSetId: null,
    }, 2));
    const readOnlyView: ActiveWorkoutView = {
      ...initialView,
      activeSetId: "working-2",
      currentExercise: {
        ...initialView.currentExercise,
        warmups: initialView.currentExercise.warmups.map((set) => ({
          ...set,
          status: "completed" as const,
          completedAtMs: 1_000,
          advancedTimingResolved: {
            version: 1,
            mode: "per_rep" as const,
            intervalMs: 4_000,
            cueChannels: "audio" as const,
          },
        })),
        workingSets: initialView.currentExercise.workingSets.map((set, index) =>
          index === 0
            ? {
                ...set,
                status: "skipped" as const,
                advancedTimingResolved: {
                  version: 1,
                  mode: "cluster" as const,
                  groupSizes: [2, 2],
                  intraRestMs: 15_000,
                  cueChannels: "both" as const,
                },
              }
            : set
        ),
      },
    };

    await renderActive({
      view: readOnlyView,
      commands: commands({ updateSessionSetAdvancedTiming }),
    });

    expect(screen.getByTestId("set-timing-summary-session-exercise-1-warmup-1"))
      .toHaveTextContent("Warm-up W1 timing · Per-rep every 4 sec · audio");
    expect(screen.getByTestId("set-timing-readonly-session-exercise-1-warmup-1"))
      .toHaveTextContent("Completed sets are read-only. Timing cannot change.");
    expect(screen.queryByRole("button", { name: "Configure Back Squat, warm-up W1 timing" }))
      .not.toBeOnTheScreen();
    expect(screen.getByTestId("set-timing-summary-session-exercise-1-working-1"))
      .toHaveTextContent("Working set 1 timing · Cluster 2+2 · 15 sec · both");
    expect(screen.getByTestId("set-timing-readonly-session-exercise-1-working-1"))
      .toHaveTextContent("Skipped sets are read-only. Timing cannot change.");
    expect(screen.queryByRole("button", { name: "Configure Back Squat, working set 1 timing" }))
      .not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Configure Back Squat, working set 2 timing" }))
      .toBeOnTheScreen();
    expect(updateSessionSetAdvancedTiming).not.toHaveBeenCalled();
  });
});
