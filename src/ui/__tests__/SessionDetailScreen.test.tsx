import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { SessionDetail } from "../../domains/workout";
import { CalendarReadOnlyWorkout } from "../calendar/CalendarReadOnlyWorkout";

const detail = {
  id: "completed-session", status: "completed", statusLabel: "Complete", sourceLabel: "Manual visit", planName: "Foundation", dayName: "Day A", localDate: "2026-10-13", timezone: "Asia/Singapore", startedAtMs: 0, endedAtMs: 1, durationMs: 60_000, revision: 1, modifiedFromPlan: false,
  exerciseProgress: { completed: 1, planned: 1, percent: 100 }, workingSetProgress: { completed: 1, planned: 2, percent: 50 },
  exercises: [{ id: "exercise-1", exerciseId: "bench", name: "Bench press", metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 }, metricProfile: "load_reps", ordinal: 0, status: "completed", revision: 1, effort: null, topWorkingSet: "50 kg × 5", totalWorkingReps: 5, warmups: [], workingSets: [{ id: "set-1", kind: "working", ordinal: 0, status: "completed", metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 }, target: { profile: "load_reps", version: 1, loadGrams: 50000, minReps: 5, maxReps: 5, incrementGrams: 2500, perSide: false }, observation: { profile: "load_reps", version: 1, loadGrams: 50000, reps: 5, source: "manual" }, value: "50 kg × 5" }, { id: "set-2", kind: "working", ordinal: 1, status: "planned", metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 }, target: { profile: "load_reps", version: 1, loadGrams: 50000, minReps: 5, maxReps: 5, incrementGrams: 2500, perSide: false }, observation: null, value: "50 kg × 5" }] }],
  nonLoadOutcomes: [], recommendations: [], recommendationStatus: "none", resumable: false, readOnly: true,
} as unknown as SessionDetail;

describe("CalendarReadOnlyWorkout", () => {
  it("renders immutable completed facts and disclosure without management actions", () => {
    const onGoBack = jest.fn();
    render(<CalendarReadOnlyWorkout detail={detail} onGoBack={onGoBack} />);
    expect(screen.getByText("Complete · read only")).toBeOnTheScreen();
    expect(screen.getByText("Not completed")).toBeOnTheScreen();
    expect(screen.queryByText("Correct workout")).toBeNull();
    expect(screen.queryByText("Resume workout")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Back to Calendar agenda" }));
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });
});
