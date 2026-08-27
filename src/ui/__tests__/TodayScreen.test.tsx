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
  TodayView,
} from "../../domains/workout";
import { TodayScreen } from "../screens/TodayScreen";
import { AppearanceProvider, themes } from "../theme";

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

describe("Plan 01-07 TodayScreen", () => {
  it("renders trusted loading structure without stale facts", async () => {
    await renderToday(undefined);

    expect(screen.getByRole("header", { name: "Today" })).toBeOnTheScreen();
    expect(
      screen.getAllByTestId(/today-skeleton/u, { includeHiddenElements: true }),
    ).toHaveLength(6);
    expect(screen.queryByText(/60 kg/u)).not.toBeOnTheScreen();
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

  it("keeps independently toggled rest-alert settings when writes resolve later", async () => {
    type PersistedPreferenceResult = Readonly<{
      status: "persisted";
      preferences: { soundEnabled: boolean; vibrationEnabled: boolean };
    }>;
    let resolveFirstWrite: ((value: PersistedPreferenceResult) => void) | undefined;
    let resolveSecondWrite: ((value: PersistedPreferenceResult) => void) | undefined;
    const firstWrite = new Promise<PersistedPreferenceResult>((resolve) => {
      resolveFirstWrite = resolve;
    });
    const secondWrite = new Promise<PersistedPreferenceResult>((resolve) => {
      resolveSecondWrite = resolve;
    });
    let writeCount = 0;
    const changePreferences = (
      _preferences: Readonly<{ soundEnabled: boolean; vibrationEnabled: boolean }>,
    ) => ++writeCount === 1
      ? firstWrite
      : secondWrite;
    const changePreferencesSpy = jest.fn(changePreferences);
    const openNotificationSettings = () => undefined;
    const openNotificationSettingsSpy = jest.fn(openNotificationSettings);
    const { props, rendered } = await renderToday(scheduledView, {
      notificationPermission: "denied",
      onChangeRestAlertPreferences: changePreferencesSpy,
      onOpenRestNotificationSettings: openNotificationSettingsSpy,
      restAlertPreferences: { soundEnabled: true, vibrationEnabled: true },
    });

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Appearance and rest-alert settings",
      }),
    );

    expect(screen.getByRole("header", { name: "Rest alerts" })).toBeOnTheScreen();
    expect(screen.getByText(/in-app timer remains the authoritative/u))
      .toBeOnTheScreen();
    expect(screen.getByRole("switch", { name: "Rest sound" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ checked: true }));
    expect(screen.getByRole("switch", { name: "Rest vibration" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ checked: true }));

    await fireEvent.press(screen.getByRole("switch", { name: "Rest sound" }));
    await waitFor(() => expect(changePreferencesSpy).toHaveBeenCalledWith({
      soundEnabled: false,
      vibrationEnabled: true,
    }));
    await fireEvent.press(
      screen.getByRole("switch", { name: "Rest vibration" }),
    );
    expect(screen.getByRole("switch", { name: "Rest sound" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ checked: false }));
    expect(screen.getByRole("switch", { name: "Rest vibration" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ checked: false }));
    expect(changePreferencesSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstWrite?.({
        status: "persisted",
        preferences: { soundEnabled: false, vibrationEnabled: true },
      });
      await firstWrite;
    });
    await waitFor(() => expect(changePreferencesSpy).toHaveBeenLastCalledWith({
      soundEnabled: false,
      vibrationEnabled: false,
    }));
    await act(async () => {
      resolveSecondWrite?.({
        status: "persisted",
        preferences: { soundEnabled: false, vibrationEnabled: false },
      });
      await secondWrite;
    });
    await rendered.rerender(
      <AppearanceProvider>
        <TodayScreen
          {...props}
          restAlertPreferences={{ soundEnabled: true, vibrationEnabled: false }}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByRole("switch", { name: "Rest sound" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ checked: true }));
    expect(screen.getByRole("switch", { name: "Rest vibration" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ checked: false }));
    await fireEvent.press(
      screen.getByRole("button", { name: "Open notification settings" }),
    );
    expect(openNotificationSettingsSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("rest-alert-settings-sheet-content"))
      .toHaveProp("keyboardShouldPersistTaps", "handled");
  });

  it("opens the production rest-alert sheet in its preference-read loading state", async () => {
    const readPreferences = jest.fn<() => void>();
    const { props, rendered } = await renderToday(scheduledView, {
      notificationPermission: "denied",
      onReadRestAlertPreferences: readPreferences,
      restAlertPreferences: { soundEnabled: true, vibrationEnabled: true },
      restAlertPreferencesLoading: true,
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Appearance and rest-alert settings",
    }));

    expect(readPreferences).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("progressbar", {
      name: "Loading rest alert settings",
    })).toHaveProp("accessibilityState", expect.objectContaining({
      busy: true,
      disabled: true,
    }));
    expect(screen.queryByRole("switch", { name: "Rest sound" }))
      .not.toBeOnTheScreen();
    for (const name of [
      "Open notification settings",
      "Appearance",
      "Close rest alerts",
    ]) {
      expect(screen.getByRole("button", { name }))
        .toHaveProp("accessibilityState", expect.objectContaining({
          disabled: true,
        }));
    }

    await rendered.rerender(
      <AppearanceProvider>
        <TodayScreen
          {...props}
          restAlertPreferences={{ soundEnabled: false, vibrationEnabled: true }}
          restAlertPreferencesLoading={false}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByRole("switch", { name: "Rest sound" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        checked: false,
      }));
    expect(screen.getByRole("switch", { name: "Rest vibration" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        checked: true,
      }));
  });

  it("reconciles a no-op preference write to persisted values with a bounded alert", async () => {
    const { rendered, props } = await renderToday(scheduledView, {
      restAlertPreferences: { soundEnabled: true, vibrationEnabled: true },
      onChangeRestAlertPreferences: jest.fn(async () => ({
        status: "not_persisted" as const,
        preferences: { soundEnabled: true, vibrationEnabled: true },
      })),
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Appearance and rest-alert settings",
    }));
    await fireEvent.press(screen.getByRole("switch", { name: "Rest sound" }));

    await waitFor(() => {
      expect(screen.getByRole("alert"))
        .toHaveTextContent("Rest alert setting was not saved");
      expect(screen.getByRole("switch", { name: "Rest sound" }))
        .toHaveProp("accessibilityState", expect.objectContaining({ checked: true }));
    });

    await rendered.rerender(
      <AppearanceProvider>
        <TodayScreen {...props} />
      </AppearanceProvider>,
    );
  });

  it("reverts a rejected preference write and announces the bounded error", async () => {
    await renderToday(scheduledView, {
      restAlertPreferences: { soundEnabled: true, vibrationEnabled: false },
      onChangeRestAlertPreferences: jest.fn(async () => {
        throw new Error("preference_write_failed");
      }),
    });

    await fireEvent.press(screen.getByRole("button", {
      name: "Appearance and rest-alert settings",
    }));
    await fireEvent.press(screen.getByRole("switch", { name: "Rest vibration" }));

    await waitFor(() => {
      expect(screen.getByRole("alert"))
        .toHaveTextContent("Rest alert setting was not saved");
      expect(screen.getByRole("switch", { name: "Rest vibration" }))
        .toHaveProp("accessibilityState", expect.objectContaining({ checked: false }));
    });
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
        "This will not advance your schedule unless you explicitly mark the planned day complete or skipped.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByTestId("workout-start-sheet-content")).toHaveProp(
      "keyboardShouldPersistTaps",
      "handled",
    );
    expect(screen.getByTestId("workout-start-sheet-content")).toHaveStyle({
      maxHeight: "90%",
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Start Full Body B" }),
    );
    expect(start).toHaveBeenCalledWith("day-b", "alternate");
    await fireEvent.press(
      screen.getByRole("button", { name: "Start empty workout" }),
    );
    expect(startEmpty).toHaveBeenCalledTimes(1);
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
    expect(
      screen.getByText(/will not advance your schedule/iu),
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

  it("shows a safe action failure without hiding authoritative Today facts", async () => {
    const retry = jest.fn();
    await renderToday(scheduledView, {
      actionFailure: {
        code: "workout_action_failed",
        correlationCode: "GT-ACTION01",
      },
      onRetry: retry,
    });

    expect(screen.getByText("Workout action was not saved")).toBeOnTheScreen();
    expect(
      screen.getByText("Your saved data was not changed. GT-ACTION01"),
    ).toBeOnTheScreen();
    expect(screen.getByText("60 kg × 8")).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Retry Today action" }),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it.each([599, 600, 840])(
    "preserves Today hierarchy at width %i",
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
    })).not.toHaveStyle({ backgroundColor: themes.light.surface });
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
    },
  );
});
