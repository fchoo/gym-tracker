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
      target: { targetId: "target", durationSeconds: 660 }, targetAtDate: { targetId: "target", durationSeconds: 660 }, history: [{ effort: { activityId: "activity-local-01", sourceIdentity: "opaque-latest", sourceRevision: 2, localDate: "2026-08-24", durationSeconds: 680, timeBasis: "elapsed" as const, evidence: "source_summary" as const }, targetAtDate: { targetId: "target", durationSeconds: 660 } }], evidenceCount: 2,
      gap: "Gap · 10 seconds ahead of target",
      pacing: { target: "11:00", pacePerKm: "4:35/km", per400m: "1:50/400 m", per200m: "0:55/200 m" },
    }],
  } : { sport: "All" as const, state: "empty" as const, primaryGoal: null, activeGoals: [] },
}));

jest.mock("expo-router", () => ({
  router: { push: (...args: readonly unknown[]) => mockPush(...args) },
  useFocusEffect: (effect: () => void) => effect(),
}));
jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    loadProgress: mockLoadProgress,
    progressRunningTargetRuntime: {
      createId: () => "target-request",
      loadPlan: jest.fn(async () => null),
      saveRunningTarget: jest.fn(),
    },
    workoutRefreshGeneration: 0,
  }),
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

  it("navigates Running evidence with only the exact local activity revision", async () => {
    await render(<AppearanceProvider><ProgressRoute /></AppearanceProvider>);
    await fireEvent.press(await screen.findByRole("tab", { name: "Running" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Open history for 2.4 km" }));
    await fireEvent.press(screen.getAllByRole("button", { name: "Show history data" }).at(-1)!);
    await fireEvent.press(screen.getByRole("button", { name: "Open source" }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/garmin/activity/[activityId]",
      params: {
        activityId: "activity-local-01",
        origin: "progress",
        sourceRevision: "2",
      },
    });
  });

  it("navigates Strength history with an allowlisted retained return token", async () => {
    mockLoadProgress.mockImplementation((async (input: { sport?: string; period: string }) => ({
      sport: input.sport,
      period: input.period as "4_weeks" | "12_weeks" | "all_time",
      freshness: "current" as const,
      dashboard: input.sport === "Strength" ? {
        sport: "Strength" as const,
        state: "ready" as const,
        facts: [{ exerciseId: "bench-press", exerciseName: "Bench Press", identityKey: "load_reps:1:1", comparatorKey: "identity", sessionId: "session-42", setId: "set-1", localDate: "2026-08-24", targetJson: "{}", observationJson: "{}" }],
        goals: [{
          goalId: "bench",
          exerciseId: "bench-press",
          exerciseName: "Bench Press",
          identityKey: "load_reps:1:1",
          status: "improving" as const,
          latest: { value: 62.5, label: "62.5 kg × 8", localDate: "2026-08-24", sessionId: "session-42", sourceRevision: 2 },
          best: { value: 62.5, label: "62.5 kg × 8", localDate: "2026-08-24", sessionId: "session-42", sourceRevision: 2 },
          target: { value: 60, label: "60 kg × 8" },
          gap: "Gap · 2.5 kg better than target",
          evidenceCount: 2,
          fasterIsLower: false,
          valueFormat: "kilograms" as const,
          unitLabel: "kg",
          directionLabel: "Higher comparable load is better.",
          history: [{ value: 62.5, label: "62.5 kg × 8", localDate: "2026-08-24", sessionId: "session-42", sourceRevision: 2, targetAtDate: 60 }],
        }],
      } : { sport: "All" as const, state: "empty" as const, primaryGoal: null, activeGoals: [] },
    })) as never);
    await render(<AppearanceProvider><ProgressRoute /></AppearanceProvider>);
    await fireEvent.press(await screen.findByRole("tab", { name: "Strength" }));
    await fireEvent.press((await screen.findAllByRole("button", { name: "Open exercise history for Bench Press" })).at(-1)!);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/exercise-history/[exerciseId]",
      params: {
        exerciseId: "bench-press",
        exerciseName: "Bench Press",
        origin: "progress",
        returnToken: "progress:Strength:4_weeks:exercise:bench-press",
      },
    });
  });
});
