import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { ProgressDashboardProjection } from "../../domains/progress/contracts";
import { ProgressScreen } from "../screens/ProgressScreen";
import { AppearanceProvider, createMemoryAppearanceStore } from "../theme";

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
    history: [],
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

async function renderProgress(loadProgress = jest.fn(async (input: { sport: "All" | "Strength" | "Running"; period: string }) => ({
  sport: input.sport,
  period: input.period as "4_weeks" | "12_weeks" | "all_time",
  freshness: "current" as const,
  dashboard: dashboardFor(input.sport),
}))) {
  await render(
    <AppearanceProvider store={createMemoryAppearanceStore("Light")}>
      <ProgressScreen
        loadProgress={loadProgress as never}
        nowLocalDate="2026-08-24"
        onOpenExercise={jest.fn()}
        onOpenSession={jest.fn()}
      />
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
    await renderProgress(loadProgress);

    await fireEvent.press(screen.getByRole("tab", { name: "Running" }));
    expect(await screen.findByRole("header", { name: "2.4 km goal" })).toBeOnTheScreen();
    completeAll?.({ sport: "All", period: "4_weeks", freshness: "current", dashboard: dashboardFor("All") });

    await waitFor(() => expect(screen.getByRole("header", { name: "2.4 km goal" })).toBeOnTheScreen());
    expect(screen.queryByRole("header", { name: "Nearest active goal" })).not.toBeOnTheScreen();
  });
});
