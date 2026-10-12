import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import { AppearanceProvider } from "../../src/ui/theme";

const mockPush = jest.fn();
const mockLoadProgress = jest.fn(async (input: { sport?: string; period: string }) => ({
  sport: input.sport,
  period: input.period as "4_weeks" | "12_weeks" | "all_time",
  freshness: "current" as const,
  dashboard: input.sport === "Running" ? {
    sport: "Running" as const,
    state: "ready" as const,
    goals: [{
      distanceMeters: 2400, timeBasis: "elapsed" as const,
      latest: { activityId: "latest", sourceIdentity: "opaque-latest", sourceRevision: 2, localDate: "2026-08-24", durationSeconds: 680, timeBasis: "elapsed" as const, evidence: "source_summary" as const },
      best: { activityId: "best", sourceIdentity: "opaque-best", sourceRevision: 1, localDate: "2026-08-17", durationSeconds: 650, timeBasis: "elapsed" as const, evidence: "source_laps" as const },
      target: { targetId: "target", durationSeconds: 660 }, targetAtDate: { targetId: "target", durationSeconds: 660 }, history: [], evidenceCount: 2,
    }],
  } : { sport: "All" as const, state: "empty" as const, primaryGoal: null },
}));

jest.mock("expo-router", () => ({ router: { push: (...args: readonly unknown[]) => mockPush(...args) } }));
jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({ loadProgress: mockLoadProgress, workoutRefreshGeneration: 0 }),
}));

import ProgressRoute from "../(tabs)/progress";

describe("ProgressRoute", () => {
  beforeEach(() => { mockPush.mockReset(); mockLoadProgress.mockClear(); });

  it("forwards only selected sport/range requests through the typed runtime adapter", async () => {
    await render(<AppearanceProvider><ProgressRoute /></AppearanceProvider>);
    await fireEvent.press(await screen.findByRole("tab", { name: "Running" }));
    await fireEvent.press(screen.getByRole("button", { name: "12 weeks" }));

    await waitFor(() => expect(mockLoadProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      sport: "Running", period: "12_weeks", nowLocalDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
    })));
    expect(screen.queryByText(/opaque-latest|opaque-best/u)).not.toBeOnTheScreen();
  });
});
