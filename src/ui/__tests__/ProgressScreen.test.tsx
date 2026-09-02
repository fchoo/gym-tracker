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
import {
  TextInput,
} from "react-native";

import type {
  ProgressPeriodProjection,
} from "../../domains/progress";
import {
  ProgressScreen,
} from "../screens/ProgressScreen";
import {
  AppearanceProvider,
  createMemoryAppearanceStore,
} from "../theme";

const BACK_SQUAT_ID = "5f140001-7e35-4a6d-9100-000000000001";

function projection(
  overrides: Partial<ProgressPeriodProjection> = {},
): ProgressPeriodProjection {
  return {
    state: "current",
    window: { start: "2026-08-10", end: "2026-08-24" },
    summary: {
      scheduledOpportunities: { completed: 2, planned: 3 },
      workingSets: { completed: 5, planned: 6 },
      improvingCount: 1,
      holdingCount: 1,
      baselineCount: 1,
      attentionCount: 0,
      sourceReferences: {
        scheduledOpportunities: { sessionIds: ["session-record"], exerciseIds: [], exercises: [] },
        workingSets: {
          sessionIds: ["session-record"],
          exerciseIds: [BACK_SQUAT_ID],
          exercises: [{ exerciseId: BACK_SQUAT_ID, exerciseName: "Back Squat" }],
        },
        exerciseStatuses: {
          sessionIds: ["session-record"],
          exerciseIds: [BACK_SQUAT_ID],
          exercises: [{ exerciseId: BACK_SQUAT_ID, exerciseName: "Back Squat" }],
        },
        attention: { sessionIds: [], exerciseIds: [], exercises: [] },
      },
    },
    records: [{
      exerciseId: BACK_SQUAT_ID,
      exerciseName: "Back Squat",
      identityKey: "load_reps:1:1",
      comparatorKey: "load_reps",
      sessionId: "session-record",
      setId: "set-record",
      localDate: "2026-08-24",
      targetJson: JSON.stringify({
        version: 1,
        profile: "load_reps",
        loadGrams: 40_000,
        minReps: 8,
        maxReps: 10,
        incrementGrams: 2_500,
        perSide: false,
      }),
      observationJson: JSON.stringify({
        version: 1,
        profile: "load_reps",
        loadGrams: 45_000,
        reps: 9,
        source: "manual",
      }),
    }],
    exercises: [{
      exerciseId: BACK_SQUAT_ID,
      exerciseName: "Back Squat",
      identityKey: "load_reps:1:1",
      comparatorKey: "load_reps",
      status: "improving",
      sessionId: "session-record",
      setId: "set-record",
      localDate: "2026-08-24",
    }, {
      exerciseId: "row",
      exerciseName: "Barbell Row",
      identityKey: "load_reps:1:1",
      comparatorKey: "load_reps",
      status: "holding",
      sessionId: "session-row",
      setId: "set-row",
      localDate: "2026-08-20",
    }, {
      exerciseId: "squat",
      exerciseName: "Front Squat",
      identityKey: "load_reps:1:1",
      comparatorKey: "load_reps",
      status: "baseline",
      sessionId: "session-squat",
      setId: "set-squat",
      localDate: "2026-08-18",
    }],
    trend: [{
      localDate: "2026-08-20",
      scheduledOpportunities: { completed: 1, planned: 1 },
      workingSets: { completed: 3, planned: 3 },
      sessionIds: ["session-row"],
      exerciseIds: ["row"],
      exercises: [{ exerciseId: "row", exerciseName: "Barbell Row" }],
    }, {
      localDate: "2026-08-24",
      scheduledOpportunities: { completed: 1, planned: 2 },
      workingSets: { completed: 2, planned: 3 },
      sessionIds: ["session-record"],
      exerciseIds: [BACK_SQUAT_ID],
      exercises: [{ exerciseId: BACK_SQUAT_ID, exerciseName: "Back Squat" }],
    }],
    attention: [],
    recommendations: [],
    stateSourceReferences: {
      sessionIds: ["session-record"],
      exerciseIds: [BACK_SQUAT_ID],
      exercises: [{ exerciseId: BACK_SQUAT_ID, exerciseName: "Back Squat" }],
    },
    ...overrides,
  };
}

async function renderProgress(
  overrides: Partial<React.ComponentProps<typeof ProgressScreen>> = {},
) {
  const props: React.ComponentProps<typeof ProgressScreen> = {
    nowLocalDate: "2026-08-24",
    workoutRefreshGeneration: 0,
    loadProgress: jest.fn(async () => ({
      period: "4_weeks" as const,
      freshness: "current" as const,
      projection: projection(),
    })),
    onOpenExercise: jest.fn(),
    onOpenSession: jest.fn(),
    ...overrides,
  };
  await render(
    <AppearanceProvider store={createMemoryAppearanceStore("Light")}>
      <ProgressScreen {...props} />
    </AppearanceProvider>,
  );
  return props;
}

describe("ProgressScreen", () => {
  it("renders one factual selected-period view with source-backed drill-downs and equivalent consistency output", async () => {
    const onOpenExercise = jest.fn();
    const onOpenSession = jest.fn();
    await renderProgress({ onOpenExercise, onOpenSession });

    expect(await screen.findByRole("header", { name: "Progress" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "4 weeks" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
    expect(screen.getByRole("button", { name: "12 weeks" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "All time" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Overall Progress" }))
      .toBeOnTheScreen();
    expect(screen.getByText("10 August 2026 to 24 August 2026"))
      .toBeOnTheScreen();
    expect(screen.getByText("Scheduled opportunities · 2 of 3 completed"))
      .toBeOnTheScreen();
    expect(screen.getByText("Working sets · 5 of 6 completed"))
      .toBeOnTheScreen();
    expect(screen.getByText("1 improving · 1 holding · 1 baseline"))
      .toBeOnTheScreen();
    expect(screen.getByText("Back Squat · 45 kg × 9")).toBeOnTheScreen();
    expect(screen.getByRole("button", {
      name: "Open source workout for Scheduled opportunities",
    })).toBeOnTheScreen();
    expect(screen.getByRole("button", {
      name: "Open source workout for Working sets",
    })).toBeOnTheScreen();
    expect(screen.getByRole("button", {
      name: "Open Back Squat exercise history for Working sets",
    })).toBeOnTheScreen();
    expect(screen.getByRole("button", {
      name: "Open source workout for Progress status",
    })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", {
      name: "Open source workout for Scheduled opportunities",
    }));
    expect(onOpenSession).toHaveBeenCalledWith("session-record");

    await fireEvent.press(screen.getByRole("button", {
      name: "Open Back Squat exercise history for Working sets",
    }));
    expect(onOpenExercise).toHaveBeenCalledWith(BACK_SQUAT_ID, "Back Squat");

    await fireEvent.press(screen.getByRole("button", {
      name: "Open workout details for record on 24 August 2026",
    }));
    expect(onOpenSession).toHaveBeenCalledWith("session-record");

    await fireEvent.press(screen.getAllByRole("button", {
      name: "Open exercise history for Back Squat",
    }).at(-1)!);
    expect(onOpenExercise).toHaveBeenCalledWith(BACK_SQUAT_ID, "Back Squat");
    expect(screen.queryByText(BACK_SQUAT_ID)).not.toBeOnTheScreen();
    expect(screen.queryByLabelText(new RegExp(BACK_SQUAT_ID, "u")))
      .not.toBeOnTheScreen();

    expect(screen.getByRole("header", { name: "Consistency" }))
      .toBeOnTheScreen();
    expect(screen.getAllByText("20 August 2026 · 1 of 1 scheduled completed · 3 of 3 working sets completed"))
      .toHaveLength(2);
    expect(screen.getByTestId("progress-trend-table")).toBeOnTheScreen();
    expect(screen.getAllByText("24 August 2026 · 1 of 2 scheduled completed · 2 of 3 working sets completed"))
      .toHaveLength(2);
  });

  it("reloads the same factual view model when the period changes", async () => {
    const loadProgress = jest.fn(async (input: Readonly<{ period: string }>) => ({
      period: input.period as "4_weeks" | "12_weeks" | "all_time",
      freshness: "current" as const,
      projection: projection(),
    }));
    await renderProgress({ loadProgress });
    await screen.findByRole("header", { name: "Overall Progress" });

    await fireEvent.press(screen.getByRole("button", { name: "All time" }));

    await waitFor(() => expect(loadProgress).toHaveBeenLastCalledWith({
      period: "all_time",
      nowLocalDate: "2026-08-24",
    }));
    expect(screen.getByRole("button", { name: "All time" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
  });

  it("reloads the selected period when the workout generation changes", async () => {
    const loadProgress = jest.fn(async () => ({
      period: "4_weeks" as const,
      freshness: "current" as const,
      projection: projection(),
    }));
    const props: React.ComponentProps<typeof ProgressScreen> = {
      nowLocalDate: "2026-08-24",
      workoutRefreshGeneration: 0,
      loadProgress,
      onOpenExercise: jest.fn(),
      onOpenSession: jest.fn(),
    };
    const rendered = await render(
      <AppearanceProvider store={createMemoryAppearanceStore("Light")}>
        <ProgressScreen {...props} />
      </AppearanceProvider>,
    );
    await waitFor(() => expect(loadProgress).toHaveBeenCalledTimes(1));

    await rendered.rerender(
      <AppearanceProvider store={createMemoryAppearanceStore("Light")}>
        <ProgressScreen {...props} workoutRefreshGeneration={1} />
      </AppearanceProvider>,
    );

    await waitFor(() => expect(loadProgress).toHaveBeenCalledTimes(2));
    expect(loadProgress).toHaveBeenLastCalledWith({
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
    });
  });

  it("suppresses stale totals while progress is updating", async () => {
    jest.useFakeTimers();
    const loadProgress = jest.fn(async () => ({
        period: "4_weeks" as const,
        freshness: "updating" as const,
        projection: null,
      }));
    try {
      await renderProgress({ loadProgress });

      expect(await screen.findByText("Updating progress")).toBeOnTheScreen();
      expect(screen.getByText("Saved history is being recalculated. Results refresh automatically."))
        .toBeOnTheScreen();
      expect(screen.queryByText(/Scheduled opportunities ·/u)).not.toBeOnTheScreen();
      expect(screen.queryByText(/Working sets ·/u)).not.toBeOnTheScreen();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
      await waitFor(() => expect(loadProgress).toHaveBeenCalledTimes(2));
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows the same safe rebuild state for an unavailable projection and retries the factual read", async () => {
    const loadProgress = jest.fn(async () => ({
      period: "4_weeks" as const,
      freshness: "unavailable" as const,
      projection: null,
    }));
    await renderProgress({ loadProgress });

    expect(await screen.findByText("Updating progress")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Refresh progress" }));
    await waitFor(() => expect(loadProgress).toHaveBeenCalledTimes(2));
  });

  it("explains only the coarse affected rebuild subjects while suppressing stale totals", async () => {
    await renderProgress({
      loadProgress: jest.fn(async () => ({
        period: "4_weeks" as const,
        freshness: "updating" as const,
        projection: null,
        diagnostic: {
          code: "history_projection_updating" as const,
          affectedSubjects: ["all_period", "exercise_metric"] as const,
        },
      })),
    });

    expect(await screen.findByText(
      "Rebuilding overall and exercise progress history. Results refresh automatically.",
    )).toBeOnTheScreen();
    expect(screen.queryByText(/session-|set-|recommendation-/iu)).not.toBeOnTheScreen();
    expect(screen.queryByText(/Scheduled opportunities ·/u)).not.toBeOnTheScreen();
  });

  it("uses a retryable error state when the factual progress read fails", async () => {
    const loadProgress = jest.fn(async () => {
      throw new Error("progress_read_failed");
    });
    await renderProgress({ loadProgress });

    expect(await screen.findByRole("header", { name: "Progress could not be loaded" }))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Retry loading progress" }));
    await waitFor(() => expect(loadProgress).toHaveBeenCalledTimes(2));
  });

  it("retries the same typed request and renders the recovered factual progress", async () => {
    const loadProgress = jest.fn<React.ComponentProps<typeof ProgressScreen>["loadProgress"]>()
      .mockRejectedValueOnce(new Error("progress_read_failed"))
      .mockResolvedValueOnce({
        period: "4_weeks" as const,
        freshness: "current" as const,
        projection: projection(),
      });
    await renderProgress({ loadProgress });

    expect(await screen.findByRole("header", { name: "Progress could not be loaded" }))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Retry loading progress" }));

    expect(await screen.findByRole("header", { name: "Overall Progress" }))
      .toBeOnTheScreen();
    expect(loadProgress).toHaveBeenLastCalledWith({
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
    });
  });

  it("uses the shared exercise Search with factual zero, one, and many result states", async () => {
    await renderProgress();

    const input = await screen.findByLabelText("Search exercises");
    expect(screen.getByTestId("progress-exercise-search-control").children[0])
      .toHaveProp("accessible", false);
    expect(screen.getByLabelText("3 Search exercises results")).toBeOnTheScreen();

    await fireEvent.changeText(input, "back");
    expect(screen.getByLabelText("1 Search exercises result")).toBeOnTheScreen();
    expect(screen.getByText("Back Squat")).toBeOnTheScreen();
    expect(screen.queryByText("Barbell Row")).not.toBeOnTheScreen();

    await fireEvent.changeText(input, "deadlift");
    expect(screen.getByLabelText("No Search exercises results")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "No matching exercises" }))
      .toBeOnTheScreen();

    await fireEvent.changeText(input, "s");
    expect(screen.getByLabelText("2 Search exercises results")).toBeOnTheScreen();
  });

  it("disambiguates duplicate exercise names without exposing their identities", async () => {
    const firstId = "custom-plank-0001";
    const secondId = "custom-plank-0002";
    const base = projection();
    const duplicateRows = [
      { ...base.exercises[0]!, exerciseId: firstId, exerciseName: "Plank" },
      { ...base.exercises[1]!, exerciseId: secondId, exerciseName: "Plank" },
    ];
    const onOpenExercise = jest.fn();
    await renderProgress({
      onOpenExercise,
      loadProgress: jest.fn(async () => ({
        period: "4_weeks" as const,
        freshness: "current" as const,
        projection: projection({
          exercises: duplicateRows,
          trend: [{
            ...base.trend[0]!,
            exerciseIds: [firstId, secondId],
            exercises: duplicateRows.map(({ exerciseId, exerciseName }) => ({
              exerciseId,
              exerciseName,
            })),
          }],
        }),
      })),
    });

    expect(await screen.findByText("Plank (1 of 2)")).toBeOnTheScreen();
    expect(screen.getByText("Plank (2 of 2)")).toBeOnTheScreen();
    const firstButtons = screen.getAllByRole("button", {
      name: "Open exercise history for Plank (1 of 2)",
    });
    expect(firstButtons.length).toBeGreaterThan(1);
    await fireEvent.press(firstButtons.at(-1)!);
    expect(onOpenExercise).toHaveBeenCalledWith(firstId, "Plank");
    expect(screen.queryByText(firstId)).not.toBeOnTheScreen();
    expect(screen.queryByText(secondId)).not.toBeOnTheScreen();
  });

  it("restores the shared Search focus after clearing a Progress query", async () => {
    const focus = jest.spyOn(TextInput.prototype, "focus");
    await renderProgress();
    const input = await screen.findByLabelText("Search exercises");

    await fireEvent.changeText(input, "row");
    await fireEvent.press(screen.getByRole("button", { name: "Clear search exercises" }));

    expect(screen.getByLabelText("Search exercises")).toHaveProp("value", "");
    expect(focus).toHaveBeenCalled();
    focus.mockRestore();
  });

  it("keeps source-backed Progress exercise rows usable without toSorted", async () => {
    const arrayPrototype = Array.prototype as {
      toSorted?: typeof Array.prototype.toSorted;
    };
    const originalToSorted = arrayPrototype.toSorted;
    delete arrayPrototype.toSorted;

    try {
      await renderProgress();
      expect(await screen.findByText("Back Squat")).toBeOnTheScreen();
    } finally {
      Object.defineProperty(arrayPrototype, "toSorted", {
        configurable: true,
        enumerable: false,
        value: originalToSorted,
        writable: true,
      });
    }
  });

  it("shows a no-history state when there are no factual progress rows", async () => {
    await renderProgress({
      loadProgress: jest.fn(async () => ({
        period: "4_weeks" as const,
        freshness: "current" as const,
        projection: projection({
          records: [],
          exercises: [],
          trend: [],
          summary: {
            scheduledOpportunities: { completed: 0, planned: 0 },
            workingSets: { completed: 0, planned: 0 },
            improvingCount: 0,
            holdingCount: 0,
            baselineCount: 0,
            attentionCount: 0,
            sourceReferences: {
              scheduledOpportunities: { sessionIds: [], exerciseIds: [], exercises: [] },
              workingSets: { sessionIds: [], exerciseIds: [], exercises: [] },
              exerciseStatuses: { sessionIds: [], exerciseIds: [], exercises: [] },
              attention: { sessionIds: [], exerciseIds: [], exercises: [] },
            },
          },
        }),
      })),
    });

    expect(await screen.findByRole("header", { name: "No progress history yet" }))
      .toBeOnTheScreen();
  });

  it.each([
    ["baseline", "Baseline", "More comparable working sets are needed before a change is shown."],
    ["hold", "Hold", "Comparable evidence is unchanged for this period."],
  ] as const)(
    "describes a sparse %s projection without manufacturing a score",
    async (...[state, heading, body]) => {
      await renderProgress({
        loadProgress: jest.fn(async () => ({
          period: "4_weeks" as const,
          freshness: "current" as const,
          projection: projection({ state }),
        })),
      });

      expect(await screen.findByText(heading)).toBeOnTheScreen();
      expect(screen.getByText(body)).toBeOnTheScreen();
    },
  );

  it("explains when an Overall Progress row has no source instead of rendering a dead drill-down", async () => {
    await renderProgress({
      loadProgress: jest.fn(async () => ({
        period: "4_weeks" as const,
        freshness: "current" as const,
        projection: projection({
          summary: {
            ...projection().summary,
            attentionCount: 1,
            sourceReferences: {
              ...projection().summary.sourceReferences,
              attention: { sessionIds: [], exerciseIds: [], exercises: [] },
            },
          },
        }),
      })),
    });

    expect(await screen.findByText("No source workout or exercise is available for Review available."))
      .toBeOnTheScreen();
    expect(screen.queryByRole("button", {
      name: "Open source workout for Review available",
    })).not.toBeOnTheScreen();
  });

  it("renders a source-backed pending review and reloads from the runtime after a committed decision", async () => {
    const pendingReview = {
      id: "recommendation-bench-1",
      exerciseId: "bench-press",
      exerciseName: "Bench Press",
      sourceSessionId: "session-review",
      status: "pending" as const,
      lifecycle: "pending" as const,
      rule: { id: "load_reps.double_progression.v1", version: 1 },
      confidence: "high",
      reason: "All planned working sets reached the upper rep bound.",
      metricIdentity: {
        profile: "load_reps" as const,
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      currentTarget: {
        version: 1 as const,
        profile: "load_reps" as const,
        loadGrams: 60_000,
        minReps: 8,
        maxReps: 8,
        targetReps: [8, 8, 8],
        incrementGrams: 2_500,
        perSide: false,
      },
      proposedTarget: {
        version: 1 as const,
        profile: "load_reps" as const,
        loadGrams: 62_500,
        minReps: 6,
        maxReps: 6,
        targetReps: [6, 6, 6],
        incrementGrams: 2_500,
        perSide: false,
      },
    };
    const loadProgress = jest.fn(async () => ({
      period: "4_weeks" as const,
      freshness: "current" as const,
      projection: projection({
        attention: [{
          id: pendingReview.id,
          exerciseId: pendingReview.exerciseId,
          exerciseName: pendingReview.exerciseName,
          sessionId: pendingReview.sourceSessionId,
        }],
        recommendations: [pendingReview],
      }),
    }));
    const accept = jest.fn(async () => ({ status: "accepted" as const }));
    const onOpenSession = jest.fn();
    await renderProgress({
      loadProgress,
      onAcceptRecommendation: accept,
      onOpenSession,
    });

    expect(await screen.findByRole("header", { name: "Needs attention" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Current target · 60 kg × 8")).toBeOnTheScreen();
    expect(screen.getByText("Proposed target · 62.5 kg × 6")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Open source workout for Bench Press",
    }));
    expect(onOpenSession).toHaveBeenCalledWith("session-review");

    await fireEvent.press(screen.getByRole("button", {
      name: "Use proposed target for Bench Press",
    }));
    expect(accept).toHaveBeenCalledWith("recommendation-bench-1");
    await waitFor(() => expect(loadProgress).toHaveBeenCalledTimes(2));
  });

  it("plainly reports a superseded decision before reloading SQLite-backed progress", async () => {
    const pendingReview = {
      id: "recommendation-bench-2",
      exerciseId: "bench-press",
      exerciseName: "Bench Press",
      sourceSessionId: "session-review",
      status: "pending" as const,
      lifecycle: "pending" as const,
      rule: { id: "load_reps.double_progression.v1", version: 1 },
      confidence: "high",
      reason: "All planned working sets reached the upper rep bound.",
      metricIdentity: {
        profile: "load_reps" as const,
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      currentTarget: {
        version: 1 as const, profile: "load_reps" as const, loadGrams: 60_000,
        minReps: 8, maxReps: 8, targetReps: [8, 8, 8],
        incrementGrams: 2_500, perSide: false,
      },
      proposedTarget: {
        version: 1 as const, profile: "load_reps" as const, loadGrams: 62_500,
        minReps: 6, maxReps: 6, targetReps: [6, 6, 6],
        incrementGrams: 2_500, perSide: false,
      },
    };
    const loadProgress = jest.fn(async () => ({
      period: "4_weeks" as const,
      freshness: "current" as const,
      projection: projection({ recommendations: [pendingReview] }),
    }));
    const accept = jest.fn(async () => ({
      recommendationId: pendingReview.id,
      status: "superseded" as const,
    }));

    await renderProgress({ loadProgress, onAcceptRecommendation: accept });
    await screen.findByRole("header", { name: "Needs attention" });
    await fireEvent.press(screen.getByRole("button", {
      name: "Use proposed target for Bench Press",
    }));

    await waitFor(() => {
      expect(screen.getByText("Recommendation no longer applies"))
        .toBeOnTheScreen();
      expect(screen.getByText(/current target was not changed/iu))
        .toBeOnTheScreen();
      expect(loadProgress).toHaveBeenCalledTimes(2);
    });
  });

  it("plainly reports a rejected decision command before reloading factual progress", async () => {
    const pendingReview = {
      id: "recommendation-bench-3",
      exerciseId: "bench-press",
      exerciseName: "Bench Press",
      sourceSessionId: "session-review",
      status: "pending" as const,
      lifecycle: "pending" as const,
      rule: { id: "load_reps.double_progression.v1", version: 1 },
      confidence: "high",
      reason: "All planned working sets reached the upper rep bound.",
      metricIdentity: {
        profile: "load_reps" as const,
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      currentTarget: {
        version: 1 as const, profile: "load_reps" as const, loadGrams: 60_000,
        minReps: 8, maxReps: 8, targetReps: [8, 8, 8],
        incrementGrams: 2_500, perSide: false,
      },
      proposedTarget: {
        version: 1 as const, profile: "load_reps" as const, loadGrams: 62_500,
        minReps: 6, maxReps: 6, targetReps: [6, 6, 6],
        incrementGrams: 2_500, perSide: false,
      },
    };
    const loadProgress = jest.fn(async () => ({
      period: "4_weeks" as const,
      freshness: "current" as const,
      projection: projection({ recommendations: [pendingReview] }),
    }));
    const accept = jest.fn(async () => {
      throw new Error("recommendation_decision_conflict");
    });

    await renderProgress({ loadProgress, onAcceptRecommendation: accept });
    await screen.findByRole("header", { name: "Needs attention" });
    await fireEvent.press(screen.getByRole("button", {
      name: "Use proposed target for Bench Press",
    }));

    await waitFor(() => {
      expect(screen.getByText("Recommendation decision needs review"))
        .toBeOnTheScreen();
      expect(screen.getByText(/saved target was not changed/iu))
        .toBeOnTheScreen();
      expect(loadProgress).toHaveBeenCalledTimes(2);
    });
  });

  it("does not show manual non-actionable outcomes as a recommendation review", async () => {
    await renderProgress({
      loadProgress: jest.fn(async () => ({
        period: "4_weeks" as const,
        freshness: "current" as const,
        projection: projection({ recommendations: [] }),
      })),
    });

    await screen.findByRole("header", { name: "Overall Progress" });
    expect(screen.queryByRole("header", { name: "Needs attention" }))
      .not.toBeOnTheScreen();
  });

  it("keeps persisted review history understandable without exposing decision controls", async () => {
    const acceptedReview = {
      id: "recommendation-bench-history",
      exerciseId: "bench-press",
      exerciseName: "Bench Press",
      sourceSessionId: "session-review",
      status: "accepted" as const,
      lifecycle: "accepted" as const,
      rule: { id: "load_reps.double_progression.v1", version: 1 },
      confidence: "high",
      reason: "All planned working sets reached the upper rep bound.",
      metricIdentity: {
        profile: "load_reps" as const,
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      currentTarget: {
        version: 1 as const, profile: "load_reps" as const, loadGrams: 60_000,
        minReps: 8, maxReps: 8, targetReps: [8, 8, 8],
        incrementGrams: 2_500, perSide: false,
      },
      proposedTarget: {
        version: 1 as const, profile: "load_reps" as const, loadGrams: 62_500,
        minReps: 6, maxReps: 6, targetReps: [6, 6, 6],
        incrementGrams: 2_500, perSide: false,
      },
    };
    const onOpenSession = jest.fn();
    await renderProgress({
      onOpenSession,
      loadProgress: jest.fn(async () => ({
        period: "4_weeks" as const,
        freshness: "current" as const,
        projection: projection({
          recommendations: [acceptedReview],
          records: [],
          exercises: [],
          trend: [],
          summary: {
            scheduledOpportunities: { completed: 0, planned: 0 },
            workingSets: { completed: 0, planned: 0 },
            improvingCount: 0,
            holdingCount: 0,
            baselineCount: 0,
            attentionCount: 0,
            sourceReferences: {
              scheduledOpportunities: { sessionIds: [], exerciseIds: [], exercises: [] },
              workingSets: { sessionIds: [], exerciseIds: [], exercises: [] },
              exerciseStatuses: { sessionIds: [], exerciseIds: [], exercises: [] },
              attention: { sessionIds: [], exerciseIds: [], exercises: [] },
            },
          },
        }),
      })),
    });

    expect(await screen.findByRole("header", { name: "Target review history" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Accepted")).toBeOnTheScreen();
    expect(screen.getByText("Current target at review time · 60 kg × 8"))
      .toBeOnTheScreen();
    expect(screen.getByText("Proposed target at review time · 62.5 kg × 6"))
      .toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Use proposed target/u }))
      .not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Open source workout for Bench Press",
    }));
    expect(onOpenSession).toHaveBeenCalledWith("session-review");
  });
});
