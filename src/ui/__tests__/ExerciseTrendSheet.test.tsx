import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { ExerciseMetricHistory } from "../../domains/history";
import { ExerciseTrendSheet } from "../components/ExerciseTrendSheet";
import { AppearanceProvider } from "../theme";

const history: ExerciseMetricHistory = {
  exerciseId: "back-squat",
  warmupVisits: [],
  segments: [{
    identity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
    referenceTarget: { version: 1, profile: "load_reps", loadGrams: 60_000, minReps: 6, maxReps: 8, incrementGrams: 2_500, perSide: false },
    comparableSets: [{
      sessionId: "session-1", localDate: "2026-08-24", exerciseId: "back-squat", exerciseName: "Back Squat",
      identity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
      target: { version: 1, profile: "load_reps", loadGrams: 60_000, minReps: 6, maxReps: 8, incrementGrams: 2_500, perSide: false },
      observation: { version: 1, profile: "load_reps", loadGrams: 60_000, reps: 8, source: "manual" },
      sessionStatus: "completed", setKind: "working", setStatus: "completed", plannedWorkingSets: 1, completedWorkingSets: 1,
      setId: "set-1", setOrdinal: 0, completedAtMs: 1_724_428_800_000,
    }],
    best: null,
    average: null,
    last: null,
  }],
};

describe("ExerciseTrendSheet", () => {
  it("uses Return to Workout for its non-mutating dismissal", async () => {
    const rendered = await render(<AppearanceProvider><ExerciseTrendSheet exerciseName="Back Squat" history={null} onClose={jest.fn()} visible /></AppearanceProvider>);

    expect(rendered.getByLabelText("Return to Workout")).toBeTruthy();
  });

  it("renders written Recent, Best, Change, and chart data for compatible evidence", async () => {
    const rendered = await render(<AppearanceProvider><ExerciseTrendSheet exerciseName="Back Squat" history={history} onClose={() => undefined} visible /></AppearanceProvider>);

    expect(rendered.getByText("Recent")).toBeTruthy();
    expect(rendered.getByText("Best")).toBeTruthy();
    expect(rendered.getByText("Change")).toBeTruthy();
    expect(rendered.getByLabelText("Exercise performance over six sessions")).toBeTruthy();
    expect(rendered.getByText(/24 August 2026/u)).toBeTruthy();
  });
});
