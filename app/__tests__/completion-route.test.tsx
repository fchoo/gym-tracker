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

import type {
  CompletedWorkoutPlanWriteBackState,
  SessionDetail,
} from "../../src/domains/workout";
import {
  AppearanceProvider,
} from "../../src/ui/theme";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockGetSessionDetail = jest.fn<
  (sessionId: string) => Promise<SessionDetail>
>();
const mockPreview = jest.fn<
  (sessionId: string) => Promise<CompletedWorkoutPlanWriteBackState>
>();
const mockApply = jest.fn();
const mockKeep = jest.fn();
let mockRefreshGeneration = 0;

jest.mock("expo-router", () => ({
  router: {
    push: (...args: readonly unknown[]) => mockPush(...args),
    replace: (...args: readonly unknown[]) => mockReplace(...args),
  },
  useLocalSearchParams: () => ({ sessionId: "session-1" }),
}));

jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    applyCompletedWorkoutPlanWriteBack: mockApply,
    getSessionDetail: mockGetSessionDetail,
    keepCompletedWorkoutPlanAsIs: mockKeep,
    previewCompletedWorkoutPlanWriteBack: mockPreview,
    recordExerciseEffort: jest.fn(),
    acceptRecommendation: jest.fn(),
    keepCurrentTarget: jest.fn(),
    workoutRefreshGeneration: mockRefreshGeneration,
  }),
}));

import WorkoutCompletionRoute from "../completion/[sessionId]";

const detail: SessionDetail = {
  id: "session-1",
  status: "completed",
  statusLabel: "Completed",
  sourceLabel: "Planned day",
  planName: "Owner Strength",
  dayName: "Strength Day",
  localDate: "2026-09-17",
  timezone: "Asia/Singapore",
  startedAtMs: 1_000,
  endedAtMs: 2_000,
  durationMs: 1_000,
  revision: 4,
  modifiedFromPlan: true,
  exerciseProgress: { completed: 1, planned: 1, percent: 100 },
  workingSetProgress: { completed: 1, planned: 1, percent: 100 },
  exercises: [],
  nonLoadOutcomes: [],
  recommendations: [],
  recommendationStatus: "none",
  resumable: false,
  readOnly: true,
};

const awaiting: CompletedWorkoutPlanWriteBackState = {
  state: "awaiting_choice",
  preview: {
    kind: "session_exercise_edits",
    sourceSessionId: "session-1",
    sourceSessionRevision: 4,
    planId: "plan-owner",
    planName: "Owner Strength",
    planDayId: "day-owner",
    dayName: "Strength Day",
    expectedPlanRevision: 3,
    currentWorkoutUnaffected: true,
    previewToken: `session-writeback-v1:${"a".repeat(64)}`,
    composition: [],
  },
};

describe("WorkoutCompletionRoute", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockGetSessionDetail.mockReset();
    mockPreview.mockReset();
    mockApply.mockReset();
    mockKeep.mockReset();
    mockRefreshGeneration = 0;
    mockGetSessionDetail.mockResolvedValue(detail);
    mockPreview.mockResolvedValue(awaiting);
    mockKeep.mockReturnValue({ state: "completed", disposition: "kept" });
  });

  it("recomputes the durable completion preview and keeps the plan unchanged by default", async () => {
    await render(
      <AppearanceProvider>
        <WorkoutCompletionRoute />
      </AppearanceProvider>,
    );

    await waitFor(() => {
      expect(mockGetSessionDetail).toHaveBeenCalledWith("session-1");
      expect(mockPreview).toHaveBeenCalledWith("session-1");
    });
    await fireEvent.press(screen.getByRole("button", {
      name: "Keep plan as-is",
    }));

    expect(mockKeep).toHaveBeenCalledWith(awaiting);
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });
});
