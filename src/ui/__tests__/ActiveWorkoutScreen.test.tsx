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
  resolveWorkoutPlanOverviewScene,
  WorkoutPlanOverviewScreen,
} from "../screens/WorkoutPlanOverviewScreen";
import { AppearanceProvider, themes } from "../theme";

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
    copyPreviousWarmup: jest.fn(async () => ({
      ...initialView,
      committedSetId: "warmup-1",
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

async function renderActive(
  overrides: Partial<React.ComponentProps<typeof ActiveWorkoutScreen>> = {},
  appearance?: "Light" | "Dark",
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
  it("keeps current and reviewed exercise identity outside scrolling content", async () => {
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
    expect(within(stickyHeader).getByRole("header", { name: "Back Squat" }))
      .toBeOnTheScreen();
    expect(within(stickyHeader).getByText("FOCUSED WORKOUT"))
      .toBeOnTheScreen();
    expect(within(scroll).queryByTestId("active-workout-identity-current"))
      .not.toBeOnTheScreen();

    await rendered.rerender(
      <AppearanceProvider>
        <ActiveWorkoutScreen
          {...props}
          reviewExerciseId="session-exercise-2"
        />
      </AppearanceProvider>,
    );

    const reviewStickyHeader = screen.getByTestId(
      "active-workout-sticky-header",
    );
    const reviewScroll = screen.getByTestId("active-workout-scroll");
    expect(within(reviewStickyHeader).getByTestId(
      "active-workout-identity-review",
    )).toBeOnTheScreen();
    expect(within(reviewStickyHeader).getByRole("header", {
      name: "Bench Press",
    })).toBeOnTheScreen();
    expect(within(reviewStickyHeader).getByText("REVIEWING WORKOUT"))
      .toBeOnTheScreen();
    expect(within(reviewStickyHeader).queryByRole("button", {
      name: "More workout actions",
    })).not.toBeOnTheScreen();
    expect(within(reviewScroll).queryByTestId("active-workout-identity-review"))
      .not.toBeOnTheScreen();
    expect(within(reviewScroll).getByRole("button", {
      name: "Return to current exercise",
    })).toBeOnTheScreen();
  });

  it("opens Today's plan without sending a workout mutation", async () => {
    const activeCommands = commands();
    const onOpenWorkoutPlan = jest.fn();
    await renderActive({
      commands: activeCommands,
      onOpenWorkoutPlan,
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Today's plan" }),
    );

    expect(onOpenWorkoutPlan).toHaveBeenCalledTimes(1);
    expect(activeCommands.completeSet).not.toHaveBeenCalled();
    expect(activeCommands.skipExercise).not.toHaveBeenCalled();
    expect(activeCommands.updateActiveSetDraft).not.toHaveBeenCalled();
  });

  it("renders production-owned loading and error scenes with the existing navigation actions", async () => {
    const onBack = jest.fn();
    const onReturnToActiveWorkout = jest.fn();
    const { rerender } = await render(
      <AppearanceProvider>
        <WorkoutPlanOverviewScreen
          onBack={onBack}
          onReturnToActiveWorkout={onReturnToActiveWorkout}
          onReviewExercise={jest.fn()}
          scene={{ state: "loading" }}
        />
      </AppearanceProvider>,
    );

    expect(screen.getByRole("header", { name: "Today's plan" }))
      .toBeOnTheScreen();
    expect(screen.getByLabelText("Loading today's plan"))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalledTimes(1);

    await rerender(
      <AppearanceProvider>
        <WorkoutPlanOverviewScreen
          onBack={onBack}
          onReturnToActiveWorkout={onReturnToActiveWorkout}
          onReviewExercise={jest.fn()}
          scene={{ state: "error" }}
        />
      </AppearanceProvider>,
    );

    expect(screen.getByRole("header", {
      name: "Today's plan could not be opened",
    })).toBeOnTheScreen();
    expect(screen.getByText(
      "Your workout was not changed. Return to the active workout to continue.",
    )).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByRole("button", {
      name: "Return to active workout",
    }));
    expect(onReturnToActiveWorkout).toHaveBeenCalledTimes(1);
  });

  it("renders an accessible empty scene without fabricating currentExercise", async () => {
    const emptyWorkout: EmptyWorkoutView = {
      state: "empty_workout",
      id: "session-empty",
      status: "in_progress",
      revision: 1,
      activeSetId: null,
      activeExerciseId: null,
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
    const onReturnToActiveWorkout = jest.fn();

    expect(resolveWorkoutPlanOverviewScene(initialView)).toEqual({
      state: "empty",
    });
    expect(resolveWorkoutPlanOverviewScene(emptyWorkout)).toEqual({
      state: "empty",
    });

    await render(
      <AppearanceProvider>
        <WorkoutPlanOverviewScreen
          onBack={jest.fn()}
          onReturnToActiveWorkout={onReturnToActiveWorkout}
          onReviewExercise={jest.fn()}
          scene={resolveWorkoutPlanOverviewScene(initialView)}
        />
      </AppearanceProvider>,
    );

    expect(screen.getByRole("summary", {
      name: "No exercises in today's plan",
    })).toBeOnTheScreen();
    expect(screen.getByText(
      "No exercises are planned in this session yet.",
    )).toBeOnTheScreen();
    expect(screen.queryByText("Back Squat")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("today-plan-exercise-session-exercise-1"))
      .not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Return to active workout",
    }));
    expect(onReturnToActiveWorkout).toHaveBeenCalledTimes(1);
  });

  it("lists every workout exercise in order and reviews it without changing the active pointer", async () => {
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
    const onReviewExercise = jest.fn();
    await render(
      <AppearanceProvider>
        <WorkoutPlanOverviewScreen
          onBack={jest.fn()}
          onReturnToActiveWorkout={jest.fn()}
          onReviewExercise={onReviewExercise}
          scene={resolveWorkoutPlanOverviewScene(view)}
        />
      </AppearanceProvider>,
    );

    expect(screen.getByLabelText(
      "1. Back Squat. Current. Open for review",
    )).toBeOnTheScreen();
    expect(screen.getByLabelText(
      "2. Bench Press. Completed. Open for review",
    )).toBeOnTheScreen();
    expect(screen.getByLabelText(
      "3. Barbell Row. Planned. Open for review",
    )).toBeOnTheScreen();
    expect(screen.getByLabelText(
      "4. Pull-up. Skipped. Open for review",
    )).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText(
      "2. Bench Press. Completed. Open for review",
    ));

    expect(onReviewExercise).toHaveBeenCalledWith("session-exercise-2");
    expect(view.activeExerciseId).toBe("session-exercise-1");

    const activeCommands = commands();
    const onReturnToCurrent = jest.fn();
    await renderActive({
      commands: activeCommands,
      onReturnToCurrent,
      reviewExerciseId: "session-exercise-2",
      view,
    });
    expect(screen.getByRole("header", { name: "Bench Press" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Reviewing another exercise"))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", {
      name: "Return to current exercise",
    })).toBeOnTheScreen();
    expect(screen.queryByRole("button", {
      name: "Complete Set 1",
    })).not.toBeOnTheScreen();
    expect(activeCommands.completeSet).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", {
      name: "Return to current exercise",
    }));
    expect(onReturnToCurrent).toHaveBeenCalledTimes(1);
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
      .not.toHaveStyle({ backgroundColor: themes.light.contentCard });
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
      outlineColor: "#155EEF",
      outlineWidth: 2,
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
      "Copy previous warm-up",
      "Add working set",
      "Complete Set 1",
      "Skip Set 1",
      "Complete warm-up W1",
      "Skip warm-up W1",
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

  it("adds, copies, and skips warm-ups through separate persisted commands", async () => {
    const addWarmup = jest.fn<ActiveWorkoutCommands["addWarmup"]>(async () => ({
      ...initialView,
      committedSetId: "warmup-1",
    }));
    const copyPreviousWarmup = jest.fn<
      ActiveWorkoutCommands["copyPreviousWarmup"]
    >(async () => ({
      ...initialView,
      committedSetId: "warmup-1",
    }));
    const skipWarmup = jest.fn(async () => ({
      ...initialView,
      revision: 2,
      currentExercise: {
        ...initialView.currentExercise,
        warmups: [{
          ...initialView.currentExercise.warmups[0]!,
          status: "skipped" as const,
          completedAtMs: 2_000,
          revision: 2,
        }],
      },
    }));
    await renderActive({
      commands: commands({
        addWarmup,
        copyPreviousWarmup,
        skipWarmup,
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
      screen.getByRole("button", { name: "Copy previous warm-up" }),
    );
    await waitFor(() => {
      expect(copyPreviousWarmup).toHaveBeenCalledWith(expect.objectContaining({
        sourceSetId: "warmup-1",
      }));
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Skip warm-up W1" }),
    );
    await waitFor(() => {
      expect(skipWarmup).toHaveBeenCalledWith(expect.objectContaining({
        setId: "warmup-1",
      }));
    });
    expect(screen.getByText("Skipped warm-up W1")).toBeOnTheScreen();
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

  it("adds and skips working sets with the same visible action pattern as warm-ups", async () => {
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
    const skippedView: ActiveWorkoutView = {
      ...addedView,
      revision: 3,
      activeSetId: "working-2",
      currentExercise: {
        ...addedView.currentExercise,
        workingSets: addedView.currentExercise.workingSets.map((set) =>
          set.id === "working-1"
            ? { ...set, status: "skipped" as const, revision: 2 }
            : set
        ),
      },
    };
    const addWorkingSet = jest.fn(async () => ({
      ...addedView,
      committedSetId: "working-added",
    }));
    const skipWorkingSet = jest.fn(async () => skippedView);
    await renderActive({
      commands: commands({ addWorkingSet, skipWorkingSet }),
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
    expect(screen.getByText("Working set 3 added and focused"))
      .toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Skip Set 1" }),
    );
    await waitFor(() => {
      expect(skipWorkingSet).toHaveBeenCalledWith(expect.objectContaining({
        setId: "working-1",
        expectedSessionRevision: 2,
      }));
    });
    expect(screen.getByText("Skipped working set 1")).toBeOnTheScreen();
    expect(screen.getByTestId("working-1-status-glyph"))
      .toHaveStyle({ right: 8, top: 8 });
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
    const copyPreviousWarmup = jest.fn<
      ActiveWorkoutCommands["copyPreviousWarmup"]
    >()
      .mockRejectedValueOnce(new Error("storage_failed"))
      .mockResolvedValueOnce({ ...initialView, committedSetId: "warmup-copy-2" });
    const addWorkingSet = jest.fn<ActiveWorkoutCommands["addWorkingSet"]>()
      .mockRejectedValueOnce(new Error("storage_failed"))
      .mockResolvedValueOnce({ ...initialView, committedSetId: "working-added" });
    await renderActive({
      commands: commands({ addWarmup, addWorkingSet, copyPreviousWarmup }),
    });

    for (const [action, retry] of [
      ["Add warm-up", "Retry add warm-up"],
      ["Copy previous warm-up", "Retry copy warm-up"],
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
      expect(copyPreviousWarmup).toHaveBeenCalledTimes(2);
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
      expect(screen.getByText("Exercise complete")).toBeOnTheScreen();
    });
    expect(screen.getByLabelText(/Working set 1 of 2/u))
      .toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Finish workout" }),
    );
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it("requires explicit partial, skip-exercise, and discard confirmations", async () => {
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
      screen.getByRole("button", { name: "Skip Back Squat" }),
    );
    expect(screen.getByRole("header", { name: "Skip Back Squat?" }))
      .toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Skip exercise" }),
    );
    await waitFor(() => {
      expect(activeCommands.skipExercise).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmation: "skip_exercise",
          sessionExerciseId: initialView.currentExercise.id,
        }),
      );
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

  it("starts manual rest from More workout actions using current revisions", async () => {
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
    const startManualRest = jest.fn(async () => ({
      state: runningView.rest,
      sessionRevision: runningView.revision,
      invalidationScopes: [
        ["active-workout", "session-1"],
        ["today"],
      ] as const,
    }));
    await renderActive({
      commands: commands({ startManualRest }),
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "More workout actions" }),
    );
    expect(screen.getByText(/Uses 180 seconds/u)).toBeOnTheScreen();
    expect(screen.getByTestId("workout-actions-sheet-content")).toHaveProp(
      "keyboardShouldPersistTaps",
      "handled",
    );
    expect(screen.getByTestId("workout-actions-sheet-content")).toHaveStyle({
      maxHeight: "90%",
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Start rest" }),
    );

    await waitFor(() => {
      expect(startManualRest).toHaveBeenCalledWith({
        sessionId: "session-1",
        expectedSessionRevision: 1,
        expectedRestRevision: 0,
        nowMs: 2_000,
      });
    });
    expect(screen.getByText("RESTING · NEXT: SET 1 AT 60 kg × 8"))
      .toBeOnTheScreen();
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
    expect(screen.getByRole("button", { name: "Skip Set 1" }))
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
        expect(screen.getByText("Rest ended")).toBeOnTheScreen();
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
    expect(screen.getByText("Rest ended")).toBeOnTheScreen();
    expect(screen.getByText(
      "Rest ended 5 seconds ago · working set 1 is ready",
    )).toBeOnTheScreen();
  });
});
