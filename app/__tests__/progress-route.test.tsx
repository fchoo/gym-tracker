import {
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
const mockLoadProgress = jest.fn(async () => ({
  period: "4_weeks" as const,
  freshness: "current" as const,
  projection: {
    state: "baseline" as const,
    window: { start: "2026-08-01", end: "2026-08-24" },
    summary: {
      scheduledOpportunities: { completed: 0, planned: 0 },
      workingSets: { completed: 0, planned: 0 },
      improvingCount: 0,
      holdingCount: 0,
      baselineCount: 0,
      attentionCount: 0,
    },
    records: [],
    exercises: [],
    trend: [],
    attention: [],
    recommendations: [],
  },
}));

jest.mock("expo-router", () => ({
  router: { push: mockPush },
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
});
