import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { ProgressDashboardProjection } from "../../domains/progress/contracts";
import type { RunningPlanAggregate } from "../../domains/running/contracts";
import { ProgressScreen } from "../screens/ProgressScreen";
import { SemanticToastProvider } from "../components/SemanticToast";
import { AppearanceProvider, createMemoryAppearanceStore } from "../theme";

const runningTargetSource: RunningPlanAggregate = Object.freeze({
  version: 1,
  id: "running-plan-2400",
  name: "2.4 km plan",
  revision: 4,
  active: true,
  lifecycle: "active",
  createdAtMs: 1,
  goal: {
    version: 1 as const,
    id: "running-goal-2400",
    planId: "running-plan-2400",
    revision: 2,
    goalDistanceMeters: 2_400,
    targetDurationMs: 660_000,
    trainingDays: ["Monday" as const],
    createdAtMs: 1,
  },
  sessions: [],
});

const runningDashboard = (): ProgressDashboardProjection => ({
  sport: "Running",
  state: "ready",
  goals: [{
    distanceMeters: 2400,
    timeBasis: "elapsed",
    latest: {
      activityId: "activity-latest",
      sourceIdentity: "accepted-activity-latest",
      sourceRevision: 4,
      localDate: "2026-08-24",
      durationSeconds: 680,
      timeBasis: "elapsed",
      evidence: "source_summary",
    },
    best: {
      activityId: "activity-best",
      sourceIdentity: "accepted-activity-best",
      sourceRevision: 3,
      localDate: "2026-08-17",
      durationSeconds: 650,
      timeBasis: "elapsed",
      evidence: "source_laps",
    },
    target: { targetId: "running-2400", durationSeconds: 660 },
    targetAtDate: { targetId: "running-2400", durationSeconds: 660 },
    history: [{
      effort: {
        activityId: "activity-best",
        sourceIdentity: "accepted-activity-best",
        sourceRevision: 3,
        localDate: "2026-08-17",
        durationSeconds: 650,
        timeBasis: "elapsed",
        evidence: "source_laps",
      },
      targetAtDate: { targetId: "running-2400", durationSeconds: 660 },
    }, {
      effort: {
        activityId: "activity-latest",
        sourceIdentity: "accepted-activity-latest",
        sourceRevision: 4,
        localDate: "2026-08-24",
        durationSeconds: 680,
        timeBasis: "elapsed",
        evidence: "source_summary",
      },
      targetAtDate: { targetId: "running-2400", durationSeconds: 660 },
    }],
    evidenceCount: 2,
  }],
});

function dashboardFor(sport: "All" | "Strength" | "Running"): ProgressDashboardProjection {
  return sport === "Running"
    ? runningDashboard()
    : sport === "All"
      ? { sport: "All", state: "empty", primaryGoal: null }
      : { sport: "Strength", state: "empty", facts: [] };
}

async function renderProgress(
  loadProgress: React.ComponentProps<typeof ProgressScreen>["loadProgress"] = jest.fn(async (input: { sport: "All" | "Strength" | "Running"; period: string }) => ({
  sport: input.sport,
  period: input.period as "4_weeks" | "12_weeks" | "all_time",
  freshness: "current" as const,
  dashboard: dashboardFor(input.sport),
})) as never,
  overrides: Partial<React.ComponentProps<typeof ProgressScreen>> = {},
) {
  await render(
    <AppearanceProvider store={createMemoryAppearanceStore("Light")}>
      <SemanticToastProvider>
        <ProgressScreen
          loadProgress={loadProgress as never}
          nowLocalDate="2026-08-24"
          onOpenExercise={jest.fn()}
          onOpenSession={jest.fn()}
          {...overrides}
        />
      </SemanticToastProvider>
    </AppearanceProvider>,
  );
  return loadProgress;
}

describe("ProgressScreen", () => {
  it("renders one accepted 2.4 km Running path with exact factual evidence and pacing", async () => {
    const loadProgress = await renderProgress();

    await fireEvent.press(screen.getByRole("tab", { name: "Running" }));
    await fireEvent.press(screen.getByRole("button", { name: "All time" }));

    await waitFor(() => expect(loadProgress).toHaveBeenLastCalledWith({
      sport: "Running", period: "all_time", nowLocalDate: "2026-08-24",
    }));
    expect(await screen.findByText("Running facts and best efforts come from accepted imported Garmin activities."))
      .toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "2.4 km goal" })).toBeOnTheScreen();
    expect(screen.getByText("Latest · 11:20 elapsed")).toBeOnTheScreen();
    expect(screen.getByText("Best · 10:50 elapsed")).toBeOnTheScreen();
    expect(screen.getByText("Target · 11:00")).toBeOnTheScreen();
    expect(screen.getByText("Gap · 10 seconds ahead of target")).toBeOnTheScreen();
    expect(screen.getByText("Pace · 4:35/km")).toBeOnTheScreen();
    expect(screen.getByText("400 m · 1:50")).toBeOnTheScreen();
    expect(screen.getByText("200 m · 0:55")).toBeOnTheScreen();
    expect(screen.getByText("Evidence · 2 accepted imported activities")).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Running" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
    expect(screen.getByRole("button", { name: "All time" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
  });

  it("gives the exact sport/range controls selected semantics, 48dp targets, and roving keyboard movement", async () => {
    await renderProgress();

    const all = screen.getByRole("tab", { name: "All" });
    const running = screen.getByRole("tab", { name: "Running" });
    expect(all).toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
    expect(all).toHaveStyle({ minHeight: 48 });
    expect(screen.getByRole("button", { name: "4 weeks" })).toHaveStyle({ minHeight: 48 });

    await fireEvent(running, "keyDown", { nativeEvent: { key: "Home", preventDefault: jest.fn() } });
    expect(screen.getByRole("tab", { name: "All" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
    await fireEvent(all, "keyDown", { nativeEvent: { key: "End", preventDefault: jest.fn() } });
    expect(await screen.findByRole("tab", { name: "Running" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
  });

  it("ignores an obsolete completion instead of relabelling it as the selected sport", async () => {
    let completeAll: ((value: unknown) => void) | undefined;
    const loadProgress = jest.fn((input: { sport: "All" | "Strength" | "Running"; period: string }) => new Promise((resolve) => {
      if (input.sport === "All") {
        completeAll = resolve;
        return;
      }
      resolve({ sport: input.sport, period: input.period, freshness: "current", dashboard: runningDashboard() });
    }));
    await renderProgress(loadProgress as never);

    await fireEvent.press(screen.getByRole("tab", { name: "Running" }));
    expect(await screen.findByRole("header", { name: "2.4 km goal" })).toBeOnTheScreen();
    completeAll?.({ sport: "All", period: "4_weeks", freshness: "current", dashboard: dashboardFor("All") });

    await waitFor(() => expect(screen.getByRole("header", { name: "2.4 km goal" })).toBeOnTheScreen());
    expect(screen.queryByRole("header", { name: "Nearest active goal" })).not.toBeOnTheScreen();
  });

  it("opens the factual All nearest active goal in its sport without changing the selected range", async () => {
    const loadProgress = jest.fn(async (input: { sport: "All" | "Strength" | "Running"; period: string }) => ({
      sport: input.sport,
      period: input.period as "4_weeks" | "12_weeks" | "all_time",
      freshness: "current" as const,
      dashboard: input.sport === "All"
        ? {
          sport: "All" as const,
          state: "ready" as const,
          primaryGoal: {
            targetId: "running-2400", sport: "Running" as const, distanceMeters: 2400,
            targetDurationSeconds: 660, effectiveAtMs: 1, revision: 2, sourceOrder: 0,
          },
        }
        : runningDashboard(),
    }));
    await renderProgress(loadProgress as never);

    expect(await screen.findByRole("header", { name: "Nearest active goal" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Open Running goal" }));

    await waitFor(() => expect(loadProgress).toHaveBeenLastCalledWith({
      sport: "Running", period: "4_weeks", nowLocalDate: "2026-08-24",
    }));
    expect(screen.getByRole("button", { name: "4 weeks" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
  });

  it("renders Strength facts and target-only Running absence without fixture values", async () => {
    const strengthFact = {
      exerciseId: "back-squat", exerciseName: "Back Squat", identityKey: "load_reps:1:1",
      comparatorKey: "identity", sessionId: "session-1", setId: "set-1", localDate: "2026-08-24",
      targetJson: "opaque-source-target", observationJson: "opaque-source-observation",
    };
    const loadProgress = jest.fn(async (input: { sport: "All" | "Strength" | "Running"; period: string }) => ({
      sport: input.sport,
      period: input.period as "4_weeks" | "12_weeks" | "all_time",
      freshness: "current" as const,
      dashboard: input.sport === "Strength"
        ? { sport: "Strength" as const, state: "ready" as const, facts: [strengthFact] }
        : { sport: "Running" as const, state: "empty" as const, goals: [] },
    }));
    await renderProgress(loadProgress as never);

    await fireEvent.press(screen.getByRole("tab", { name: "Strength" }));
    expect(await screen.findByText("Back Squat")).toBeOnTheScreen();
    expect(screen.getByText("Target unavailable")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("tab", { name: "Running" }));
    expect(await screen.findByText("10 km · Target unset · No effort recorded · Set target")).toBeOnTheScreen();
    expect(screen.getByText("Half Marathon · Target unset · No effort recorded · Set target")).toBeOnTheScreen();
    expect(screen.queryByText("0:00")).not.toBeOnTheScreen();
  });

  it("keeps rebuild values suppressed and leaves an explicit manual retry", async () => {
    const loadProgress = jest.fn<React.ComponentProps<typeof ProgressScreen>["loadProgress"]>()
      .mockResolvedValue({ sport: "All", period: "4_weeks", freshness: "updating", dashboard: null });
    await renderProgress(loadProgress);

    expect(await screen.findByText("Updating progress")).toBeOnTheScreen();
    expect(screen.queryByText(/Latest ·|Best ·/u)).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Refresh progress" }));
    await waitFor(() => expect(loadProgress).toHaveBeenCalledTimes(2));
  });

  it("opens exact Running history evidence and retains sport and range on close", async () => {
    const onOpenRunningSource = jest.fn();
    await renderProgress(undefined, { onOpenRunningSource });

    await fireEvent.press(screen.getByRole("tab", { name: "Running" }));
    await fireEvent.press(screen.getByRole("button", { name: "All time" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Open history for 2.4 km" }));

    expect(screen.getByRole("header", { name: "2.4 km best efforts" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Show history data" }));
    await fireEvent.press(screen.getAllByRole("button", { name: "Open source" })[0]!);
    expect(onOpenRunningSource).toHaveBeenCalledWith({
      activityId: "activity-best",
      sourceRevision: 3,
    }, "running-history:2400");

    await fireEvent.press(screen.getByRole("button", { name: "Close 2.4 km best efforts" }));
    expect(screen.getByRole("tab", { name: "Running" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByRole("button", { name: "All time" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true }),
    );
  });

  it("refreshes from committed read-back before acknowledging a saved Running target", async () => {
    const saved = Object.freeze({
      ...runningTargetSource,
      revision: 5,
      goal: Object.freeze({
        ...runningTargetSource.goal,
        revision: 3,
      }),
    });
    const saveRunningTarget = jest.fn(async () => ({ outcome: "committed" as const, plan: saved }));
    const loadProgress = jest.fn(async (input: { sport: "All" | "Strength" | "Running"; period: string }) => ({
      sport: input.sport,
      period: input.period as "4_weeks" | "12_weeks" | "all_time",
      freshness: "current" as const,
      dashboard: dashboardFor(input.sport),
      runningTargetSources: input.sport === "Running" ? [runningTargetSource] : [],
    }));
    await renderProgress(loadProgress as never, {
      runningTargetRuntime: {
        createId: () => "running-target-save:request",
        loadPlan: async () => runningTargetSource,
        saveRunningTarget,
      },
    });

    await fireEvent.press(screen.getByRole("tab", { name: "Running" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Set target for 2.4 km" }));
    expect(screen.getByRole("header", { name: "Running target" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Save target" }));

    await waitFor(() => expect(saveRunningTarget).toHaveBeenCalledWith(expect.objectContaining({
      planId: "running-plan-2400",
      expectedSourceRevision: 4,
      goalDistanceMeters: 2_400,
    })));
    await waitFor(() => expect(loadProgress).toHaveBeenLastCalledWith({
      sport: "Running",
      period: "4_weeks",
      nowLocalDate: "2026-08-24",
    }));
    expect(screen.getByText("2.4 km target saved.")).toBeOnTheScreen();
  });
});
