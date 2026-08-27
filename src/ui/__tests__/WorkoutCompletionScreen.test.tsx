import {
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
  SessionDetail,
} from "../../domains/workout";
import {
  SessionDetailScreen,
} from "../screens/SessionDetailScreen";
import {
  WorkoutCompletionScreen,
} from "../screens/WorkoutCompletionScreen";
import {
  RecommendationSurface,
} from "../components/RecommendationSurface";
import { AppearanceProvider, themes } from "../theme";

const loadRepsIdentity = {
  profile: "load_reps" as const,
  contractVersion: 1,
  exerciseMetricGeneration: 1,
};
const loadRepsTarget = {
  version: 1 as const,
  profile: "load_reps" as const,
  loadGrams: 60_000,
  minReps: 6,
  maxReps: 8,
  incrementGrams: 2_500,
  perSide: false,
};

const completedDetail: SessionDetail = {
  id: "session-1",
  status: "completed",
  statusLabel: "Completed",
  sourceLabel: "Planned day",
  planName: "Full Body Foundation",
  dayName: "Full Body A",
  localDate: "2026-08-17",
  timezone: "Asia/Singapore",
  startedAtMs: 1_000,
  endedAtMs: 301_000,
  durationMs: 300_000,
  revision: 8,
  exerciseProgress: {
    completed: 1,
    planned: 1,
    percent: 100,
  },
  workingSetProgress: {
    completed: 3,
    planned: 3,
    percent: 100,
  },
  nonLoadOutcomes: [],
  exercises: [{
    id: "session-exercise-1",
    exerciseId: "squat",
    name: "Back Squat",
    metricIdentity: loadRepsIdentity,
    metricProfile: "load_reps",
    ordinal: 0,
    status: "completed",
    revision: 2,
    effort: null,
    topWorkingSet: "60 kg × 8",
    totalWorkingReps: 23,
    warmups: [{
      id: "warmup-1",
      kind: "warmup",
      ordinal: 0,
      status: "completed",
      metricIdentity: loadRepsIdentity,
      target: {
        ...loadRepsTarget,
        loadGrams: 20_000,
        minReps: 8,
        maxReps: 8,
      },
      observation: {
        version: 1,
        profile: "load_reps",
        loadGrams: 20_000,
        reps: 8,
        source: "manual",
      },
      value: "20 kg × 8",
    }],
    workingSets: [8, 8, 7].map((reps, ordinal) => ({
      id: `working-${ordinal + 1}`,
      kind: "working" as const,
      ordinal,
      status: "completed" as const,
      metricIdentity: loadRepsIdentity,
      target: loadRepsTarget,
      observation: {
        version: 1 as const,
        profile: "load_reps" as const,
        loadGrams: 60_000,
        reps,
        source: "manual" as const,
      },
      value: `60 kg × ${reps}`,
    })),
  }],
  recommendations: [{
    id: "recommendation-1",
    exerciseId: "squat",
    exerciseName: "Back Squat",
    status: "pending",
    decision: "hold",
    reason: "One more repetition completes the range",
    confidence: "high",
    currentLoadGrams: 60_000,
    proposedLoadGrams: 60_000,
    currentTargetReps: [8, 8, 8],
    proposedTargetReps: [8, 8, 8],
    comparableReps: [8, 8, 7],
    rule: "load_reps.double_progression.v1",
    ruleVersion: 1,
  }],
  recommendationStatus: "pending",
  resumable: false,
  readOnly: true,
};

async function renderCompletion(
  overrides: Partial<React.ComponentProps<typeof WorkoutCompletionScreen>> = {},
  appearance?: "Light" | "Dark",
) {
  const props = {
    detail: completedDetail,
    onAcceptRecommendation: jest.fn(),
    onKeepCurrentTarget: jest.fn(),
    onRecordEffort: jest.fn(),
    onRetrySummary: jest.fn(),
    onReturnToday: jest.fn(),
    onViewDetails: jest.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof WorkoutCompletionScreen>;
  await render(
    <AppearanceProvider
      {...(appearance === undefined
        ? {}
        : { store: { read: () => appearance, write: () => undefined } })}
    >
      <WorkoutCompletionScreen {...props} />
    </AppearanceProvider>,
  );
  return props;
}

describe("Plan 01-10 completion and detail", () => {
  it("leads with committed factual completion and metric-appropriate results", async () => {
    await renderCompletion();

    expect(screen.getByRole("header", { name: "Workout complete" }))
      .toBeOnTheScreen();
    expect(screen.getByText("5 min")).toBeOnTheScreen();
    expect(screen.getByText("1/1 (100%)")).toBeOnTheScreen();
    expect(screen.getByText("3")).toBeOnTheScreen();
    expect(screen.getByText("Top working set · 60 kg × 8")).toBeOnTheScreen();
    expect(screen.getByText("Total working reps · 23")).toBeOnTheScreen();
    expect(screen.getByText("Warm-ups excluded")).toBeOnTheScreen();
  });

  it("uses high-contrast flat cards for completion context, metrics, and exercise results", async () => {
    await renderCompletion({ width: 840 });

    for (const cardId of [
      "workout-completion-context-card",
      "workout-completion-metrics-card",
      "workout-completion-result-session-exercise-1",
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
    expect(screen.getByRole("button", { name: "Return to Today" }))
      .not.toHaveStyle({ backgroundColor: themes.light.contentCard });
  });

  it.each(["Light", "Dark"] as const)(
    "resolves every completion card through shared tokens in %s appearance",
    async (appearance) => {
      await renderCompletion({ width: 840 }, appearance);
      const colors = themes[appearance.toLowerCase() as "light" | "dark"];

      for (const cardId of [
        "workout-completion-context-card",
        "workout-completion-metrics-card",
        "workout-completion-result-session-exercise-1",
      ]) {
        expect(screen.getByTestId(cardId)).toHaveStyle({
          backgroundColor: colors.contentCard,
          borderColor: colors.contentCardBorder,
        });
      }
      expect(screen.getByText("How did Back Squat feel?"))
        .toHaveStyle({ color: colors.contentCardText });
      expect(screen.getByRole("button", { name: "Return to Today" }))
        .not.toHaveStyle({ backgroundColor: colors.contentCard });
    },
  );

  it("records optional effort without blocking completion navigation", async () => {
    const props = await renderCompletion();

    expect(screen.getByText("Optional · skip without blocking completion"))
      .toBeOnTheScreen();
    for (const label of ["Easy", "On target", "Hard", "Failed"]) {
      expect(screen.getByRole("button", { name: label })).toBeOnTheScreen();
    }
    await fireEvent.press(screen.getByRole("button", { name: "On target" }));
    expect(props.onRecordEffort).toHaveBeenCalledWith(
      "session-exercise-1",
      "on_target",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Return to Today" }),
    );
    expect(props.onReturnToday).toHaveBeenCalledTimes(1);
  });

  it("shows the locked 8/8/7 evidence and explicit target decision", async () => {
    const props = await renderCompletion();

    expect(screen.getByText("Repeat 60 kg next time")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "You completed 8 / 8 / 7 at 60 kg. One more repetition completes the range.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Increase only after every working set reaches 8 reps and effort is Easy or On target.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText("60 kg · aim for 8 / 8 / 8"))
      .toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Use this target next time" }),
    );
    expect(props.onAcceptRecommendation)
      .toHaveBeenCalledWith("recommendation-1");
    await fireEvent.press(
      screen.getByRole("button", { name: "Keep current target" }),
    );
    expect(props.onKeepCurrentTarget)
      .toHaveBeenCalledWith("recommendation-1");
  });

  it("keeps saved outcome visible when derived summary fails", async () => {
    const retry = jest.fn();
    await renderCompletion({
      summaryError: true,
      onRetrySummary: retry,
    });

    expect(screen.getByRole("header", { name: "Workout complete" }))
      .toBeOnTheScreen();
    expect(
      screen.getByText(
        "Workout saved. Some summary details could not be calculated.",
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Retry summary" }),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("renders an explicit partial heading and actual counts", async () => {
    await renderCompletion({
      detail: {
        ...completedDetail,
        status: "partial",
        statusLabel: "Partial",
        exerciseProgress: { completed: 1, planned: 5, percent: 20 },
        workingSetProgress: { completed: 3, planned: 15, percent: 20 },
      },
    });

    expect(screen.getByRole("header", { name: "Workout saved" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Partial · 1 of 5 exercises"))
      .toBeOnTheScreen();
  });

  it("keeps basic detail read-only and separates warm-ups from working sets", async () => {
    const resume = jest.fn();
    const openExerciseHistory = jest.fn();
    await render(
      <AppearanceProvider>
        <SessionDetailScreen
          detail={completedDetail}
          onGoBack={jest.fn()}
          onOpenExerciseHistory={openExerciseHistory}
          onResume={resume}
        />
      </AppearanceProvider>,
    );

    expect(screen.getByRole("header", { name: "Workout details" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Exercises · 1/1 (100%)")).toBeOnTheScreen();
    expect(screen.getByText("Working sets · 3/3 (100%)")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Warm-ups" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Working sets" }))
      .toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /correct|remove|restore/iu }))
      .not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Resume workout" }))
      .not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "View Back Squat history",
    }));
    expect(openExerciseHistory).toHaveBeenCalledWith(
      completedDetail.exercises[0],
    );
  });

  it("presents manual and factual non-load outcomes as read-only source evidence", async () => {
    const openExerciseHistory = jest.fn();
    const fixedDistanceIdentity = {
      profile: "fixed_distance" as const,
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    };
    const fixedDistanceTarget = {
      version: 1 as const,
      profile: "fixed_distance" as const,
      plannedDistanceMeters: 200,
    };
    await render(
      <AppearanceProvider>
        <SessionDetailScreen
          detail={{
            ...completedDetail,
            nonLoadOutcomes: [{
              version: 1,
              exerciseId: "run",
              exerciseName: "200 m Run",
              profile: "fixed_distance",
              rule: {
                kind: "plan_authored",
                id: "fixed_distance.plan_authored.v1",
                version: 1,
              },
              decision: "hold",
              reasonCode: "plan_authored_fixed_target_reviewed",
              reason: "The copied plan retains this fixed target",
              currentTarget: fixedDistanceTarget,
              proposedTarget: null,
              review: { actionable: false, state: "factual" },
              evidence: {
                version: 1,
                metricIdentity: fixedDistanceIdentity,
                immutableComparatorDimensions: { plannedDistanceMeters: 200 },
                comparableSourceFacts: [{
                  version: 1,
                  profile: "fixed_distance",
                  distanceMeters: 200,
                  durationMs: 72_000,
                  source: "manual",
                }],
                sourceFactCount: 1,
              },
              source: {
                sessionId: "session-1",
                sessionExerciseId: "session-exercise-run",
                setIds: ["run-set-1"],
                effectiveRevision: 8,
              },
            }, {
              version: 1,
              exerciseId: "plank",
              exerciseName: "Plank",
              profile: "timed_hold",
              rule: {
                kind: "manual_hold",
                id: "timed_hold.manual_hold.v1",
                version: 1,
              },
              decision: "manual",
              reasonCode: "manual_hold",
              reason: "The copied plan keeps this target under owner control",
              currentTarget: {
                version: 1,
                profile: "timed_hold",
                durationSeconds: 45,
                perSide: false,
              },
              proposedTarget: null,
              review: { actionable: false, state: "manual" },
              evidence: {
                version: 1,
                metricIdentity: {
                  profile: "timed_hold",
                  contractVersion: 1,
                  exerciseMetricGeneration: 1,
                },
                immutableComparatorDimensions: { perSide: false },
                comparableSourceFacts: [{
                  version: 1,
                  profile: "timed_hold",
                  durationSeconds: 45,
                  source: "manual",
                }],
                sourceFactCount: 1,
              },
              source: {
                sessionId: "session-1",
                sessionExerciseId: "session-exercise-plank",
                setIds: ["plank-set-1"],
                effectiveRevision: 8,
              },
            }],
          }}
          onGoBack={jest.fn()}
          onOpenExerciseHistory={openExerciseHistory}
          onResume={jest.fn()}
        />
      </AppearanceProvider>,
    );

    expect(screen.getByRole("header", { name: "Manual review" }))
      .toBeOnTheScreen();
    expect(screen.getAllByText("This target has no automatic change."))
      .toHaveLength(2);
    expect(screen.getByText("Rule · fixed_distance.plan_authored.v1 v1"))
      .toBeOnTheScreen();
    expect(screen.getByText("Current target · 200 m")).toBeOnTheScreen();
    expect(screen.getAllByText("Source evidence · 1 completed working set"))
      .toHaveLength(2);
    expect(screen.getByText("The copied plan keeps this target under owner control"))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", {
      name: "View 200 m Run history",
    })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /use proposed|keep current target/iu }))
      .not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", {
      name: "View 200 m Run history",
    }));
    expect(openExerciseHistory).toHaveBeenCalledWith(expect.objectContaining({
      id: "session-exercise-run",
      exerciseId: "run",
    }));
  });

  it("requires an explicit completed-session confirmation before removal from history", async () => {
    const removeFromHistory = jest.fn(async () => undefined);
    await render(
      <AppearanceProvider>
        <SessionDetailScreen
          detail={completedDetail}
          onGoBack={jest.fn()}
          onOpenExerciseHistory={jest.fn()}
          onRemoveFromHistory={removeFromHistory}
          onResume={jest.fn()}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getAllByRole("button", {
      name: "Remove from history",
    })[0]!);
    expect(screen.getByRole("header", { name: "Remove from history?" }))
      .toBeOnTheScreen();
    expect(screen.getByText(
      "This hides the workout from ordinary Calendar, history, records, and recommendations. You can restore it later from Removed sessions.",
    )).toBeOnTheScreen();
    expect(removeFromHistory).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("remove-from-history-confirm"));
    await waitFor(() => expect(removeFromHistory).toHaveBeenCalledTimes(1));
  });

  it("labels and explains corrected effective history without exposing the editor by default", async () => {
    await render(
      <AppearanceProvider>
        <SessionDetailScreen
          detail={{
            ...completedDetail,
            corrected: true,
            ownerNote: "Paused between sets for setup",
          }}
          onGoBack={jest.fn()}
          onOpenExerciseHistory={jest.fn()}
          onResume={jest.fn()}
        />
      </AppearanceProvider>,
    );

    expect(screen.getByText("COMPLETED · CORRECTED")).toBeOnTheScreen();
    expect(screen.getByText("Owner note · Paused between sets for setup"))
      .toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Correct workout" }))
      .not.toBeOnTheScreen();
  });

  it("renders baseline, increase, manual, and decided recommendation states", async () => {
    await render(
      <AppearanceProvider>
        <>
          <RecommendationSurface
            onAccept={jest.fn()}
            onKeepCurrent={jest.fn()}
            recommendation={{
              ...completedDetail.recommendations[0]!,
              status: "accepted",
              decision: "increase",
              comparableReps: [8, 8, 8],
              proposedLoadGrams: 62_500,
              proposedTargetReps: [6, 6, 6],
            }}
          />
          <RecommendationSurface
            onAccept={jest.fn()}
            onKeepCurrent={jest.fn()}
            recommendation={{
              ...completedDetail.recommendations[0]!,
              id: "recommendation-manual",
              exerciseName: "Manual Row",
              status: "rejected",
              decision: "manual",
              comparableReps: [],
              confidence: "manual",
              reason: "Working-set evidence is not comparable",
            }}
          />
          <RecommendationSurface
            onAccept={jest.fn()}
            onKeepCurrent={jest.fn()}
            recommendation={{
              ...completedDetail.recommendations[0]!,
              id: "recommendation-superseded",
              exerciseName: "Superseded Press",
              status: "superseded",
            }}
          />
        </>
      </AppearanceProvider>,
    );
    expect(screen.getByText("Move to 62.5 kg next time")).toBeOnTheScreen();
    expect(screen.getByText("Accepted")).toBeOnTheScreen();
    expect(
      screen.queryByRole("button", { name: "Use this target next time" }),
    ).not.toBeOnTheScreen();
    expect(screen.getByText("Choose the next target manually"))
      .toBeOnTheScreen();
    expect(
      screen.getByText(
        "No comparable working-set history yet. Repeat 60 kg to establish a baseline.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText("Kept current target")).toBeOnTheScreen();
    expect(screen.getByText("Suggestion no longer applies")).toBeOnTheScreen();
  });

  it("shows zero-result completion and resumable in-progress detail without false percentages", async () => {
    const emptyDetail: SessionDetail = {
      ...completedDetail,
      status: "zero_sets",
      statusLabel: "Zero working sets",
      durationMs: null,
      exerciseProgress: { completed: 0, planned: 0, percent: null },
      workingSetProgress: { completed: 0, planned: 0, percent: null },
      exercises: [],
      recommendations: [],
      recommendationStatus: "none",
    };
    const resume = jest.fn();
    await render(
      <AppearanceProvider>
        <>
          <WorkoutCompletionScreen
            detail={emptyDetail}
            onAcceptRecommendation={jest.fn()}
            onKeepCurrentTarget={jest.fn()}
            onRecordEffort={jest.fn()}
            onRetrySummary={jest.fn()}
            onReturnToday={jest.fn()}
            onViewDetails={jest.fn()}
          />
          <SessionDetailScreen
            detail={{
              ...emptyDetail,
              status: "in_progress",
              statusLabel: "In progress",
              resumable: true,
            }}
            onGoBack={jest.fn()}
            onOpenExerciseHistory={jest.fn()}
            onResume={resume}
          />
        </>
      </AppearanceProvider>,
    );
    expect(screen.getByText("—")).toBeOnTheScreen();
    expect(screen.getByText("0/0")).toBeOnTheScreen();
    expect(screen.getByText("No exercise summary yet")).toBeOnTheScreen();
    expect(screen.getByText("IN PROGRESS")).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Resume workout" }),
    );
    expect(resume).toHaveBeenCalledTimes(1);
  });
});
