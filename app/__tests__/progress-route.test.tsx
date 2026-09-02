import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

import {
  AppearanceProvider,
} from "../../src/ui/theme";

const mockPush = jest.fn();
let mockWorkoutRefreshGeneration = 0;
let mockProgressProjection: Record<string, unknown> = {
  state: "baseline" as const,
  window: { start: "2026-08-01", end: "2026-08-24" },
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
  records: [],
  exercises: [],
  trend: [],
  attention: [],
  recommendations: [],
  stateSourceReferences: { sessionIds: [], exerciseIds: [], exercises: [] },
};
const mockLoadProgress = jest.fn(async () => ({
  period: "4_weeks" as const,
  freshness: "current" as const,
  projection: mockProgressProjection,
}));

jest.mock("expo-router", () => ({
  router: { push: (...args: readonly unknown[]) => mockPush(...args) },
}));

jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    loadProgress: mockLoadProgress,
    workoutRefreshGeneration: mockWorkoutRefreshGeneration,
  }),
}));

import ProgressRoute from "../(tabs)/progress";

describe("ProgressRoute", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockLoadProgress.mockClear();
    mockWorkoutRefreshGeneration = 0;
    mockProgressProjection = {
      ...mockProgressProjection,
      records: [],
      exercises: [],
      trend: [],
      recommendations: [],
    };
  });

  it("binds Progress only through the typed runtime load capability", async () => {
    await render(
      <AppearanceProvider>
        <ProgressRoute />
      </AppearanceProvider>,
    );

    expect(await screen.findByRole("header", { name: "Progress" }))
      .toBeOnTheScreen();
    await waitFor(() => expect(mockLoadProgress).toHaveBeenCalledWith({
      period: "4_weeks",
      nowLocalDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
    }));
    expect(screen.getByRole("header", { name: "No progress history yet" }))
      .toBeOnTheScreen();
  });

  it("reloads Progress when the runtime workout generation changes", async () => {
    const rendered = await render(
      <AppearanceProvider>
        <ProgressRoute />
      </AppearanceProvider>,
    );
    await waitFor(() => expect(mockLoadProgress).toHaveBeenCalledTimes(1));

    mockWorkoutRefreshGeneration = 1;
    await rendered.rerender(
      <AppearanceProvider>
        <ProgressRoute />
      </AppearanceProvider>,
    );

    await waitFor(() => expect(mockLoadProgress).toHaveBeenCalledTimes(2));
  });

  it("routes a named Progress exercise without using its UUID as the title", async () => {
    const exerciseId = "5f140001-7e35-4a6d-9100-000000000001";
    mockProgressProjection = {
      ...mockProgressProjection,
      exercises: [{
        exerciseId,
        exerciseName: "Back Squat",
        identityKey: "load_reps:1:1",
        comparatorKey: "identity",
        status: "baseline",
        sessionId: "session-1",
        setId: "set-1",
        localDate: "2026-08-24",
      }],
    };
    await render(
      <AppearanceProvider>
        <ProgressRoute />
      </AppearanceProvider>,
    );

    await fireEvent.press(await screen.findByRole("button", {
      name: "Open exercise history for Back Squat",
    }));

    expect(mockPush).toHaveBeenCalledWith(
      `/exercise-history/${exerciseId}?exerciseName=Back%20Squat`,
    );
  });
});
