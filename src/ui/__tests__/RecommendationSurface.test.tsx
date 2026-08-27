import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

import type {
  MetricTarget,
} from "../../domains/metrics";
import type {
  ProgressRecommendationReview,
} from "../../domains/progress";
import type {
  SessionRecommendation,
} from "../../domains/workout";
import {
  RecommendationSurface,
} from "../components/RecommendationSurface";
import {
  AppearanceProvider,
} from "../theme";

const pendingReview: ProgressRecommendationReview = {
  id: "recommendation-bench-1",
  exerciseId: "bench-press",
  exerciseName: "Bench Press",
  sourceSessionId: "session-42",
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
    loadGrams: 60_000,
    minReps: 8,
    maxReps: 8,
    targetReps: [8, 8, 8],
    incrementGrams: 2_500,
    perSide: false,
  },
  proposedTarget: {
    version: 1,
    profile: "load_reps",
    loadGrams: 62_500,
    minReps: 6,
    maxReps: 6,
    targetReps: [6, 6, 6],
    incrementGrams: 2_500,
    perSide: false,
  },
};

const legacyRecommendation: SessionRecommendation = {
  id: "legacy-bench-1",
  exerciseId: "bench-press",
  exerciseName: "Bench Press",
  status: "pending",
  decision: "increase",
  reason: "All comparable sets qualified.",
  confidence: "high",
  currentLoadGrams: 60_000,
  proposedLoadGrams: 62_500,
  currentTargetReps: [8, 8, 8],
  proposedTargetReps: [6, 6, 6],
  comparableReps: [8, 8, 8],
  rule: "load_reps.double_progression.v1",
  ruleVersion: 1,
};

async function renderReview(
  review: ProgressRecommendationReview = pendingReview,
  overrides: Partial<React.ComponentProps<typeof RecommendationSurface>> = {},
) {
  const props = {
    recommendation: review,
    onAccept: jest.fn(),
    onKeepCurrent: jest.fn(),
    onOpenSource: jest.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof RecommendationSurface>;
  await render(
    <AppearanceProvider>
      <RecommendationSurface {...props} />
    </AppearanceProvider>,
  );
  return props;
}

describe("RecommendationSurface actionable review", () => {
  it("renders target evidence, a named rule, lifecycle, and source navigation without treating the proposal as current", async () => {
    const props = await renderReview();

    expect(screen.getByRole("header", { name: "Review next target for Bench Press" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Pending review")).toBeOnTheScreen();
    expect(screen.getByText("Current target · 60 kg × 8")).toBeOnTheScreen();
    expect(screen.getByText("Proposed target · 62.5 kg × 6")).toBeOnTheScreen();
    expect(screen.getByText("Rule · load_reps.double_progression.v1 v1"))
      .toBeOnTheScreen();
    expect(screen.getByText("Confidence · high")).toBeOnTheScreen();
    expect(screen.getByText(pendingReview.reason)).toBeOnTheScreen();
    expect(screen.getByText(/current target remains unchanged/iu)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", {
      name: "Open source workout for Bench Press",
    }));
    expect(props.onOpenSource).toHaveBeenCalledWith("session-42");
  });

  it("disables only committed decision actions while their command is in flight", async () => {
    await renderReview(pendingReview, { busy: true });

    expect(screen.getByRole("button", { name: "Use proposed target for Bench Press" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ disabled: true }));
    expect(screen.getByRole("button", { name: "Keep current target for Bench Press" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ disabled: true }));
    expect(screen.getByRole("button", { name: "Open source workout for Bench Press" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ disabled: false }));
  });

  it.each(["superseded", "invalidated"] as const)(
    "plainly explains a %s recommendation without exposing decision actions",
    async (status) => {
      await renderReview({ ...pendingReview, lifecycle: status, status });

      expect(screen.getByText("Recommendation no longer applies"))
        .toBeOnTheScreen();
      expect(screen.getByText(/current target was not changed by this recommendation/iu))
        .toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: /Use proposed target/u }))
        .not.toBeOnTheScreen();
    },
  );

  it.each([
    ["accepted", "Accepted"],
    ["rejected", "Kept current target"],
  ] as const)(
    "explains a committed %s decision without source navigation or actionable controls",
    async (...[status, label]) => {
      await renderReview({
        ...pendingReview,
        lifecycle: status,
        status,
        sourceSessionId: null,
      });

      expect(screen.getByText(label)).toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: /Open source workout/u }))
        .not.toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: /Use proposed target/u }))
        .not.toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: /Keep current target/u }))
        .not.toBeOnTheScreen();
    },
  );

  it.each<readonly [string, MetricTarget, string]>([
    ["load and reps", pendingReview.currentTarget, "60 kg × 8"],
    ["bodyweight reps", {
      version: 1, profile: "bodyweight_reps", minReps: 8, maxReps: 10,
      variationId: "push-up", perSide: false,
    }, "Bodyweight × 10"],
    ["added-load reps", {
      version: 1, profile: "added_load_reps", addedLoadGrams: 10_000,
      minReps: 6, maxReps: 8, incrementGrams: 2_500, perSide: true,
    }, "BW + 10 kg × 8 per side"],
    ["assisted reps", {
      version: 1, profile: "assisted_reps", assistanceGrams: 20_000,
      minReps: 6, maxReps: 8, decrementGrams: 2_500,
      assistanceEquipmentId: "assisted-pull-up", perSide: false,
    }, "20 kg assist × 8"],
    ["timed hold v1", {
      version: 1, profile: "timed_hold", durationSeconds: 45, perSide: true,
    }, "45 sec per side"],
    ["timed hold v2", {
      version: 2, profile: "timed_hold", durationMs: 45_000, perSide: false,
    }, "45 sec"],
    ["fixed distance", {
      version: 1, profile: "fixed_distance", plannedDistanceMeters: 400,
    }, "400 m"],
    ["fixed time", {
      version: 1, profile: "fixed_time", plannedDurationMs: 90_000,
    }, "90 sec"],
    ["intervals", {
      version: 1, profile: "intervals", protocolId: "interval-v1",
      comparatorId: "rounds_then_work", comparatorVersion: 1, plannedRounds: 5,
      workIntervalMs: 30_000, restIntervalMs: 15_000,
    }, "5 rounds · 30 sec work"],
    ["unscored", {
      version: 1, profile: "unscored", completionRequired: true,
    }, "Complete"],
  ])(
    "formats a profile-safe %s target",
    async (_label, target, expected) => {
      await renderReview({
        ...pendingReview,
        currentTarget: target,
        proposedTarget: target,
      });

      expect(screen.getByText("Current target · " + expected)).toBeOnTheScreen();
      expect(screen.getByText("Proposed target · " + expected)).toBeOnTheScreen();
    },
  );

  it.each([
    ["increase", "pending", [8, 8, 8], "Move to 62.5 kg next time", null],
    ["manual", "accepted", [], "Choose the next target manually", "Accepted"],
    ["hold", "rejected", [7, 8], "Repeat 62.5 kg next time", "Kept current target"],
    ["retry", "invalidated", [6], "Repeat 62.5 kg next time", "Suggestion no longer applies"],
  ] as const)(
    "preserves legacy %s lifecycle presentation",
    async (...[decision, status, comparableReps, heading, outcome]) => {
      await render(
        <AppearanceProvider>
          <RecommendationSurface
            onAccept={jest.fn()}
            onKeepCurrent={jest.fn()}
            recommendation={{
              ...legacyRecommendation,
              decision,
              status,
              comparableReps,
            }}
          />
        </AppearanceProvider>,
      );

      expect(screen.getByRole("header", { name: heading })).toBeOnTheScreen();
      if (comparableReps.length === 0) {
        expect(screen.getByText(/No comparable working-set history yet/u)).toBeOnTheScreen();
      } else {
        expect(screen.getByText(/You completed/u)).toBeOnTheScreen();
      }
      if (outcome === null) {
        expect(screen.getByRole("button", { name: "Use this target next time" }))
          .toBeOnTheScreen();
      } else {
        expect(screen.getByText(outcome)).toBeOnTheScreen();
      }
    },
  );
});
