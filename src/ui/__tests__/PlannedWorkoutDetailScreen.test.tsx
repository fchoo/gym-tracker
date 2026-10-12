import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { PlannedStrengthOccurrenceDetail } from "../../domains/workout";
import { AppearanceProvider } from "../theme";
import { PlannedWorkoutDetailScreen } from "../screens/PlannedWorkoutDetailScreen";

const occurrence = Object.freeze({
  occurrenceId: "occurrence-1", planId: "plan-1", planDayId: "day-1", scheduleId: "schedule-1", scheduleVersionId: "version-1",
  localDate: "2026-10-13", timezone: "Asia/Singapore", sourceRevisions: Object.freeze({ plan: 1, day: 1, schedule: 1 }),
  exercises: Object.freeze([Object.freeze({ id: "exercise-1", exerciseId: "bench", ordinal: 0, targets: Object.freeze([Object.freeze({ id: "target-1", ordinal: 0, targetJson: JSON.stringify({ profile: "load_reps", loadGrams: 50_000, maxReps: 5 }), unitJson: "{}" })]) })]),
}) as PlannedStrengthOccurrenceDetail;

describe("PlannedWorkoutDetailScreen", () => {
  it("renders immutable planned targets with no session or mutation controls", async () => {
    await render(<AppearanceProvider><PlannedWorkoutDetailScreen occurrenceId="occurrence-1" loadOccurrence={jest.fn(async () => occurrence)} onBack={jest.fn()} /></AppearanceProvider>);
    expect(await screen.findByText("Planned preview · read only")).toBeOnTheScreen();
    expect(screen.getByText("0 of 1 sets")).toBeOnTheScreen();
    expect(screen.getByText("50 kg × 5")).toBeOnTheScreen();
    expect(screen.getByText("Planned")).toBeOnTheScreen();
    expect(screen.queryByText("Start workout")).toBeNull();
    expect(screen.queryByText("Resume workout")).toBeNull();
  });

  it("keeps the exact identity for missing and retry states", async () => {
    const loadOccurrence = jest.fn<() => Promise<PlannedStrengthOccurrenceDetail | null>>()
      .mockRejectedValueOnce(new Error("read_failed"))
      .mockResolvedValueOnce(null);
    const onBack = jest.fn();
    await render(<AppearanceProvider><PlannedWorkoutDetailScreen occurrenceId="stale-occurrence" loadOccurrence={loadOccurrence} onBack={onBack} /></AppearanceProvider>);
    expect(await screen.findByText("Workout preview could not be loaded")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Retry preview" }));
    expect(await screen.findByText("Workout preview unavailable")).toBeOnTheScreen();
    expect(loadOccurrence).toHaveBeenLastCalledWith("stale-occurrence");
    await fireEvent.press(screen.getByRole("button", { name: "Back to Calendar" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
