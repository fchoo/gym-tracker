import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

import type {
  SelectedStrengthOccurrence,
  TodayView,
} from "../../domains/workout";
import { TodayScreen } from "../screens/TodayScreen";
import { AppearanceProvider, sizes, themes } from "../theme";

async function renderToday(
  view: TodayView | undefined,
  overrides: Partial<React.ComponentProps<typeof TodayScreen>> = {},
) {
  const props = {
    launchState: view === undefined ? "booting" : "trusted",
    planDays: [
      { id: "day-a", name: "Full Body A", ordinal: 0 },
      { id: "day-b", name: "Full Body B", ordinal: 1 },
    ],
    onActivatePlan: jest.fn(),
    onResumeWorkout: jest.fn(),
    onReviewSuggestion: jest.fn(),
    onStartEmpty: jest.fn(),
    onStartPlanDay: jest.fn(),
    onRetry: jest.fn(),
    ...overrides,
    ...(view === undefined ? {} : { view }),
  } satisfies React.ComponentProps<typeof TodayScreen>;

  return {
    props,
    rendered: await render(
      <AppearanceProvider>
        <TodayScreen {...props} />
      </AppearanceProvider>,
    ),
  };
}

const scheduledView: TodayView = {
  state: "scheduled",
  planId: "plan-copy",
  planName: "Full Body Foundation",
  dayId: "day-a",
  dayName: "Full Body A",
  estimateMinutes: 48,
  exercises: [
    {
      exerciseId: "squat",
      name: "Back Squat",
      metricProfile: "load_reps",
      nextTarget: "60 kg × 8",
      history: null,
      recommendationStatus: "none",
    },
    {
      exerciseId: "bench",
      name: "Bench Press",
      metricProfile: "load_reps",
      nextTarget: "42.5 kg × 10",
      history: {
        summary: "Last 42.5 kg · 10 / 9 / 9",
        change: "+1 rep",
      },
      recommendationStatus: "pending",
    },
    {
      exerciseId: "plank",
      name: "Plank",
      metricProfile: "timed_hold",
      nextTarget: "45 sec",
      history: null,
      recommendationStatus: "none",
    },
  ],
};

const selectedOccurrence: SelectedStrengthOccurrence = {
  kind: "strength",
  opportunityId: "occurrence-monday-a",
  planId: "plan-copy",
  planDayId: "day-a",
  scheduleId: "schedule-copy",
  scheduleVersionId: "schedule-version-1",
  localDate: "2026-09-07",
  timeZone: "Asia/Singapore",
  sourceRevisions: { plan: 1, day: 1, schedule: 1, opportunity: 1 },
};

describe("Plan 01-07 TodayScreen", () => {
  it("keeps rest and start-failure states truthful while alternatives remain explicit", async () => {
    await renderToday({
      state: "rest_day",
      planId: "plan-copy",
      planName: "Full Body Foundation",
      nextDayId: "day-b",
      nextDayName: "Full Body B",
      nextLocalDate: "2026-09-09",
    }, {
      actionFailure: { code: "workout_action_failed", correlationCode: "GT-ACTION01" },
    });

    expect(screen.getByText("No workout planned")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Nothing scheduled" })).toBeDisabled();
    expect(screen.getByText("Workout was not started")).toBeOnTheScreen();
    expect(screen.getByText(/Your saved data was not changed\. Try again\./u)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Retry starting workout" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Train anyway" }));
    expect(screen.getByRole("button", { name: "Return to Workout" })).toBeOnTheScreen();
  });

  it("keeps a source-less rest-day view truthful while offering explicit alternatives", async () => {
    await renderToday({
      state: "rest_day",
      planId: "plan-copy",
      planName: "Full Body Foundation",
      nextDayId: "removed-day",
      nextDayName: "Retired Strength Day",
      nextLocalDate: "2026-09-09",
    }, {
      planDays: [{ id: "day-a", name: "Full Body A", ordinal: 0 }],
    });

    expect(screen.getByRole("button", { name: "Nothing scheduled" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Train anyway" })).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Choose another day" })).toBeOnTheScreen();
  });

  it("shows independent Running context as navigation only", async () => {
    const viewPlan = jest.fn();
    const syncGarmin = jest.fn();
    await renderToday(scheduledView, {
      runningContext: { label: "Tempo", planId: "running-plan" },
      onOpenRunningPlan: viewPlan,
      onSyncGarmin: syncGarmin,
    });

    expect(screen.getByText("ALSO SCHEDULED")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "View plan" }));
    await fireEvent.press(screen.getByRole("button", { name: "Sync Garmin" }));
    expect(viewPlan).toHaveBeenCalledWith("running-plan");
    expect(syncGarmin).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: "Sync Garmin" })).toHaveLength(1);
    expect(screen.getByText("Full Body A")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Start Run/u })).not.toBeOnTheScreen();
  });
  it("renders the selected real occurrence before its complete persisted-order preview", async () => {
    const start = jest.fn();
    const { rendered } = await renderToday(scheduledView, {
      onStartOccurrence: start,
      selectedStrengthOccurrence: selectedOccurrence,
      strengthOccurrences: [{
        occurrence: selectedOccurrence,
        dayName: "Full Body A",
        planName: "Full Body Foundation",
        estimateMinutes: 48,
        exercises: scheduledView.exercises,
      }],
    });

    expect(screen.getAllByText("MON · 07 SEP 2026")).toHaveLength(2);
    expect(screen.getAllByText("Full Body A")).toHaveLength(2);
    expect(screen.getByText("3 exercises · about 48 min")).toBeOnTheScreen();
    expect(screen.getByText("Back Squat")).toBeOnTheScreen();
    expect(screen.getByText("Bench Press")).toBeOnTheScreen();
    expect(screen.getByText("Plank")).toBeOnTheScreen();
    const tree = JSON.stringify(rendered.toJSON());
    expect(tree.indexOf("Full Body A")).toBeLessThan(tree.indexOf("Back Squat"));
    await fireEvent.press(screen.getByRole("button", { name: "Start Full Body A" }));
    expect(start).toHaveBeenCalledWith(selectedOccurrence);
  });

  it("changes only the preview selection and gives a recovered session priority", async () => {
    const alternate: SelectedStrengthOccurrence = {
      ...selectedOccurrence,
      opportunityId: "occurrence-wednesday-b",
      planDayId: "day-b",
      localDate: "2026-09-09",
    };
    const start = jest.fn();
    const resume = jest.fn();
    const { rendered } = await renderToday(scheduledView, {
      onResumeWorkout: resume,
      onStartOccurrence: start,
      selectedStrengthOccurrence: selectedOccurrence,
      strengthOccurrences: [
        {
          occurrence: selectedOccurrence,
          dayName: "Full Body A",
          planName: "Full Body Foundation",
          estimateMinutes: 48,
          exercises: scheduledView.exercises,
        },
        {
          occurrence: alternate,
          dayName: "Full Body B",
          planName: "Full Body Foundation",
          estimateMinutes: 42,
          exercises: scheduledView.exercises.slice(0, 2),
        },
      ],
    });

    await fireEvent.press(screen.getByRole("tab", { name: /Preview Full Body B/u }));
    expect(screen.getAllByText("Full Body B")).toHaveLength(2);
    await fireEvent.press(screen.getByRole("button", { name: "Start Full Body B" }));
    expect(start).toHaveBeenCalledWith(alternate);
    expect(rendered.toJSON()).toBeTruthy();

    await rendered.rerender(
      <AppearanceProvider>
        <TodayScreen
          launchState="trusted"
          onResumeWorkout={resume}
          onStartOccurrence={start}
          planDays={[]}
          view={{
            state: "active_workout",
            sessionId: "recovered-session",
            exerciseName: "Back Squat",
            setLabel: "Working set 2",
            restStatus: "idle",
          }}
          selectedStrengthOccurrence={selectedOccurrence}
          strengthOccurrences={[]}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByRole("button", { name: "Resume workout" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Start Full Body/u })).not.toBeOnTheScreen();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("renders trusted loading structure without stale facts", async () => {
    await renderToday(undefined);

    expect(screen.getByRole("header", { name: "Workout" })).toBeOnTheScreen();
    expect(
      screen.getAllByTestId(/today-skeleton/u, { includeHiddenElements: true }),
    ).toHaveLength(6);
    expect(screen.queryByText(/60 kg/u)).not.toBeOnTheScreen();
  });

  it("uses one labelled Settings gear without manual schedule or duplicate data controls", async () => {
    const start = jest.fn();
    const openSettings = jest.fn();
    await renderToday(scheduledView, {
      onOpenSettings: openSettings,
      onStartPlanDay: start,
      width: 360,
    });

    const settings = screen.getByRole("button", { name: "Open App Settings" });
    expect(settings).toHaveProp(
      "accessibilityHint",
      "Opens App Settings",
    );
    expect(settings).toHaveStyle({ minHeight: 48 });
    expect(screen.getByTestId("adaptive-screen"))
      .toHaveProp("accessibilityLabel", "compact layout");
    for (const label of [
      "Repeat",
      "Skip",
      "Advance",
      "History and data",
      "Appearance and rest-alert settings",
    ]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeOnTheScreen();
    }

    await fireEvent(settings, "focus");
    expect(settings).toHaveStyle({ outlineWidth: sizes.focusRing });
    await fireEvent(settings, "keyDown", {
      nativeEvent: { key: "Enter" },
    });
    expect(start).not.toHaveBeenCalled();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it("shows only Full Body Foundation on first use and activates after preview", async () => {
    const activate = jest.fn();
    await renderToday(
      { state: "no_active_plan" },
      { onActivatePlan: activate },
    );

    expect(
      screen.getByRole("header", { name: "Choose your starting plan" }),
    ).toBeOnTheScreen();
    expect(screen.getByText("Full Body Foundation")).toBeOnTheScreen();
    expect(screen.getByText(/3 days per week/u)).toBeOnTheScreen();
    expect(screen.getByText(/Barbell, cable machine, dumbbells/u))
      .toBeOnTheScreen();
    expect(screen.queryByText(/another plan/iu)).not.toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole("button", { name: "Use Full Body Foundation" }),
    );
    expect(
      screen.getByText(/creates a personal copy/iu),
    ).toBeOnTheScreen();
    expect(screen.getByText(/Back Squat/iu)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Activate Full Body Foundation",
      }),
    );
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it("keeps Start before history and shows consistent targets and suggestion status", async () => {
    const start = jest.fn();
    const review = jest.fn();
    const { rendered } = await renderToday(scheduledView, {
      onStartPlanDay: start,
      onReviewSuggestion: review,
    });

    const startAction = screen.getByRole("button", {
      name: "Start Full Body A",
    });
    const squat = screen.getByText("Back Squat");
    const tree = rendered.toJSON();
    expect(JSON.stringify(tree).indexOf("Start Full Body A"))
      .toBeLessThan(JSON.stringify(tree).indexOf("Back Squat"));
    expect(startAction).toBeOnTheScreen();
    expect(squat).toBeOnTheScreen();
    expect(screen.getAllByText("NEXT TARGET")).toHaveLength(3);
    expect(screen.getByText("60 kg × 8")).toBeOnTheScreen();
    expect(screen.getAllByText("First recorded session")).toHaveLength(2);
    expect(screen.getByText("Last 42.5 kg · 10 / 9 / 9 · +1 rep"))
      .toBeOnTheScreen();
    expect(screen.getByText("42.5 kg × 10")).toBeOnTheScreen();
    expect(screen.queryByText(/proposed/iu)).not.toBeOnTheScreen();

    await fireEvent.press(startAction);
    expect(start).toHaveBeenCalledWith("day-a", "scheduled");
    await fireEvent.press(
      screen.getByRole("button", { name: "Review suggestion for Bench Press" }),
    );
    expect(review).toHaveBeenCalledWith("bench");
  });

  it("quietly marks a pending target review while retaining the accepted Today target", async () => {
    await renderToday(scheduledView, {
      pendingRecommendations: [{
        id: "recommendation-bench-1",
        exerciseId: "bench",
        exerciseName: "Bench Press",
        sourceSessionId: "session-bench",
        status: "pending",
        lifecycle: "pending",
        rule: { id: "load_reps.double_progression.v1", version: 1 },
        confidence: "high",
        reason: "All planned working sets reached the upper rep bound.",
        metricIdentity: {
          profile: "load_reps",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
        currentTarget: {
          version: 1,
          profile: "load_reps",
          loadGrams: 42_500,
          minReps: 8,
          maxReps: 10,
          incrementGrams: 2_500,
          perSide: false,
        },
        proposedTarget: {
          version: 1,
          profile: "load_reps",
          loadGrams: 45_000,
          minReps: 6,
          maxReps: 8,
          incrementGrams: 2_500,
          perSide: false,
        },
      }],
    });

    expect(screen.getByText("42.5 kg × 10")).toBeOnTheScreen();
    expect(screen.queryByText("45 kg × 8")).not.toBeOnTheScreen();
    expect(screen.getByLabelText("Pending target review for Bench Press"))
      .toHaveTextContent("Pending target review · current target above remains active");
  });

  it("keeps Today quiet when a pending review belongs to another exercise", async () => {
    await renderToday(scheduledView, {
      pendingRecommendations: [{
        id: "recommendation-other-1",
        exerciseId: "unlisted-exercise",
        exerciseName: "Unlisted exercise",
        sourceSessionId: null,
        status: "pending",
        lifecycle: "pending",
        rule: { id: "load_reps.double_progression.v1", version: 1 },
        confidence: "high",
        reason: "A review exists outside this Today session.",
        metricIdentity: {
          profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1,
        },
        currentTarget: {
          version: 1, profile: "load_reps", loadGrams: 42_500, minReps: 8, maxReps: 10,
          incrementGrams: 2_500, perSide: false,
        },
        proposedTarget: {
          version: 1, profile: "load_reps", loadGrams: 45_000, minReps: 6, maxReps: 8,
          incrementGrams: 2_500, perSide: false,
        },
      }],
    });

    expect(screen.queryByLabelText(/Pending target review/u)).not.toBeOnTheScreen();
    expect(screen.getByText("42.5 kg × 10")).toBeOnTheScreen();
  });

  it("opens start alternatives without implying schedule advancement", async () => {
    const start = jest.fn();
    const startEmpty = jest.fn();
    await renderToday(scheduledView, {
      onStartPlanDay: start,
      onStartEmpty: startEmpty,
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Choose another day" }),
    );
    expect(
      screen.getByText(
        "Alternate, rest-day, and empty workouts do not advance your schedule. Completing the scheduled workout advances it.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByTestId("workout-start-sheet-content")).toHaveProp(
      "keyboardShouldPersistTaps",
      "handled",
    );
    expect(screen.getByTestId("workout-start-sheet-content")).toHaveStyle({
      maxHeight: "82%",
    });
    expect(screen.queryByRole("checkbox", {
      name: "Advance rotation after this workout",
    })).not.toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Start Full Body B" }),
    );
    expect(start).toHaveBeenCalledWith("day-b", "alternate");
    await fireEvent.press(
      screen.getByRole("button", { name: "Start empty workout" }),
    );
    expect(startEmpty).toHaveBeenCalledWith();
  });

  it("shows rest day context and Train anyway without schedule advancement copy", async () => {
    const start = jest.fn();
    await renderToday({
      state: "rest_day",
      planId: "plan-copy",
      planName: "Full Body Foundation",
      nextDayId: "day-b",
      nextDayName: "Full Body B",
      nextLocalDate: "2026-08-19",
    }, {
      onStartPlanDay: start,
    });

    expect(screen.getByRole("header", { name: "Rest day" })).toBeOnTheScreen();
    expect(screen.getByText(/Full Body B · 2026-08-19/u)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Train anyway" }),
    );
    expect(screen.queryByRole("checkbox", {
      name: "Advance rotation after this workout",
    })).not.toBeOnTheScreen();
    expect(
      screen.getByText(/do not advance your schedule/iu),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Start Full Body B" }),
    );
    expect(start).toHaveBeenCalledWith("day-b", "rest_day");
  });

  it("shows active workout resume context as the only primary workout action", async () => {
    const resume = jest.fn();
    await renderToday({
      state: "active_workout",
      sessionId: "session-1",
      exerciseName: "Back Squat",
      setLabel: "Working set 2",
      restStatus: "paused",
    }, {
      onResumeWorkout: resume,
    });

    expect(screen.getByText("Workout in progress")).toBeOnTheScreen();
    expect(screen.getByText(/Back Squat · Working set 2 · Rest paused/u))
      .toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Start Full Body/u }))
      .not.toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Resume workout" }),
    );
    expect(resume).toHaveBeenCalledWith("session-1");
  });

  it("shows an explicitly saved partial with actual progress and Resume", async () => {
    const resume = jest.fn();
    await renderToday({
      state: "saved_partial",
      sessionId: "session-partial",
      revision: 8,
      exerciseName: "Bench Press",
      setLabel: "Working set 2",
      completedWorkingSets: 4,
      totalWorkingSets: 15,
    }, {
      onResumeWorkout: resume,
    });

    expect(screen.getByText("Workout saved as partial")).toBeOnTheScreen();
    expect(
      screen.getByText("Bench Press · Working set 2 · 4/15 working sets"),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Resume workout" }),
    );
    expect(resume).toHaveBeenCalledWith("session-partial", 8);
  });

  it("shows typed root failure and retry without workout facts", async () => {
    const retry = jest.fn();
    await renderToday(undefined, {
      launchState: "failed",
      failure: {
        category: "storage",
        code: "launch_firstTrustedQuery_failed",
        correlationCode: "GT-QUERY001",
        retryable: true,
      },
      onRetry: retry,
    });

    expect(
      screen.getByRole("header", { name: "Workout data could not be opened" }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/Full Body/u)).not.toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Retry opening workout data" }),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows a safe action failure without hiding authoritative Workout facts", async () => {
    const retry = jest.fn();
    await renderToday(scheduledView, {
      actionFailure: {
        code: "workout_action_failed",
        correlationCode: "GT-ACTION01",
      },
      onRetry: retry,
    });

    expect(screen.getByText("Workout was not started")).toBeOnTheScreen();
    expect(
      screen.getByText("Your saved data was not changed. Try again. GT-ACTION01"),
    ).toBeOnTheScreen();
    expect(screen.getByText("60 kg × 8")).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Retry starting workout" }),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it.each([599, 600, 840])(
    "preserves Workout root hierarchy at width %i",
    async (width) => {
      await renderToday(scheduledView, { width });
      expect(screen.getByRole("button", { name: "Start Full Body A" }))
        .toBeOnTheScreen();
      expect(screen.getByText("TODAY IN CONTEXT")).toBeOnTheScreen();
    },
  );

  it("uses flat high-contrast cards for Today content without turning notices or sheets into cards", async () => {
    await renderToday(scheduledView, { width: 840 });

    for (const cardId of [
      "today-workout-card",
      "today-exercise-card-squat",
      "today-exercise-card-bench",
      "today-exercise-card-plank",
    ]) {
      expect(screen.getByTestId(cardId)).toHaveStyle({
        backgroundColor: themes.light.contentCard,
        borderColor: themes.light.contentCardBorder,
        borderWidth: 0.5,
      });
    }
    expect(screen.getByText("Back Squat")).toHaveStyle({
      color: themes.light.contentCardText,
    });
    expect(screen.getAllByText("First recorded session")[0]).toHaveStyle({
      color: themes.light.contentCardTextSecondary,
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Choose another day" }),
    );
    expect(screen.getByTestId("workout-start-sheet-content"))
      .not.toHaveStyle({ backgroundColor: themes.light.contentCard });
  });

  it("keeps the activation selector flat within its shared content card", async () => {
    await renderToday({ state: "no_active_plan" });

    expect(screen.getByTestId("today-activation-card")).toHaveStyle({
      backgroundColor: themes.light.contentCard,
      borderColor: themes.light.contentCardBorder,
    });
    expect(screen.getByRole("header", { name: "Choose your starting plan" }))
      .toHaveStyle({ color: themes.light.contentCardText });
    expect(screen.getByText(
      "Barbell, cable machine, dumbbells, and bodyweight · First day starts with Back Squat",
    )).toHaveStyle({ color: themes.light.contentCardTextSecondary });
    expect(screen.getByRole("button", {
      name: /Full Body Foundation\. 3 days per week/u,
    })).toHaveProp("accessibilityRole", "button");
  });

  it.each(["Light", "Dark"] as const)(
    "keeps Today cards high contrast in %s appearance",
    async (appearance) => {
      const { rendered } = await renderToday(scheduledView);
      await rendered.unmount();
      await render(
        <AppearanceProvider
          store={{ read: () => appearance, write: () => undefined }}
        >
          <TodayScreen
            launchState="trusted"
            onActivatePlan={jest.fn()}
            onResumeWorkout={jest.fn()}
            onReviewSuggestion={jest.fn()}
            onRetry={jest.fn()}
            onStartEmpty={jest.fn()}
            onStartPlanDay={jest.fn()}
            planDays={[]}
            view={scheduledView}
          />
        </AppearanceProvider>,
      );
      const colors = themes[appearance.toLowerCase() as "light" | "dark"];
      expect(screen.getByTestId("today-workout-card")).toHaveStyle({
        backgroundColor: colors.contentCard,
      });
      expect(screen.getByText("Back Squat")).toHaveStyle({
        color: colors.contentCardText,
      });
      expect(screen.getByRole("button", { name: "Open App Settings" }))
        .toHaveStyle({ minHeight: 48 });
    },
  );
});
