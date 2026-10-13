import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { Animated, StyleSheet } from "react-native";

import type { PlannedStrengthOccurrenceDetail } from "../../domains/workout";
import { AppearanceProvider } from "../theme";
import { PlannedWorkoutDetailScreen } from "../screens/PlannedWorkoutDetailScreen";

const occurrence = Object.freeze({
  occurrenceId: "occurrence-1", planId: "plan-1", planName: "Full Body Foundation",
  planDayId: "day-1", dayName: "Full Body A", scheduleId: "schedule-1", scheduleVersionId: "version-1",
  localDate: "2026-10-13", timezone: "Asia/Singapore", sourceRevisions: Object.freeze({ plan: 1, day: 1, schedule: 1, opportunity: 1 }),
  exercises: Object.freeze([Object.freeze({ id: "exercise-1", exerciseId: "bench", exerciseName: "Bench press", ordinal: 0, targets: Object.freeze([Object.freeze({ id: "target-1", ordinal: 0, targetJson: JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 50_000, minReps: 5, maxReps: 5, incrementGrams: 2_500, perSide: false }), unitJson: "{}", previousObservationJson: JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 40_000, reps: 8, source: "manual" }) })]) })]),
}) as PlannedStrengthOccurrenceDetail;

function occurrenceWithTargets(
  occurrenceId: string,
  targets: readonly Readonly<{ id: string; target: unknown }>[],
): PlannedStrengthOccurrenceDetail {
  return Object.freeze({
    ...occurrence,
    occurrenceId,
    exercises: Object.freeze([Object.freeze({
      ...occurrence.exercises[0]!,
      targets: Object.freeze(targets.map(({ id, target }, ordinal) => Object.freeze({
        id,
        ordinal,
        targetJson: JSON.stringify(target),
        unitJson: "{}",
        previousObservationJson: null,
      }))),
    })]),
  });
}

describe("PlannedWorkoutDetailScreen", () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it("keeps Back as the preferred entry target while the exact occurrence is loading", async () => {
    await render(<AppearanceProvider><PlannedWorkoutDetailScreen occurrenceId="occurrence-1" loadOccurrence={() => new Promise(() => undefined)} onBack={jest.fn()} /></AppearanceProvider>);
    expect(screen.getByRole("button", { name: "Back to Calendar agenda" }).props.hasTVPreferredFocus).toBe(true);
    expect(StyleSheet.flatten(screen.getByText("Workout preview").props.style)).toMatchObject({ fontSize: 22, fontWeight: "800" });
  });

  it("renders immutable planned targets with no session or mutation controls", async () => {
    const timing = jest.spyOn(Animated, "timing");
    await render(<AppearanceProvider><PlannedWorkoutDetailScreen occurrenceId="occurrence-1" loadOccurrence={jest.fn(async () => occurrence)} onBack={jest.fn()} /></AppearanceProvider>);
    expect(await screen.findByText("Planned preview · read only")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Back to Calendar agenda" }).props.hasTVPreferredFocus).toBe(true);
    expect(screen.getByRole("header", { name: "Full Body A" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Bench press" })).toBeOnTheScreen();
    expect(screen.getByText("0 of 1 sets")).toBeOnTheScreen();
    expect(screen.getByText("50 kg × 5")).toBeOnTheScreen();
    expect(screen.getByText("40 kg × 8")).toBeOnTheScreen();
    expect(screen.getByTestId("planned-exercise-disclosure-exercise-1")).toBeOnTheScreen();
    expect(screen.getByTestId("planned-state-target-1")).toBeOnTheScreen();
    expect(screen.getByLabelText("Planned")).not.toHaveTextContent("—");
    timing.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: /Bench press.*Collapse exercise/u }));
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      duration: 160,
      toValue: 0,
      useNativeDriver: true,
    }));
    expect(screen.queryByTestId("planned-target-target-1")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: /Bench press.*Expand exercise/u }));
    expect(screen.getByTestId("planned-target-target-1")).toBeOnTheScreen();
    expect(screen.queryByText(/Exercise 1/u)).toBeNull();
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
    expect(StyleSheet.flatten(screen.getByText("Workout preview could not be loaded").props.style)).toMatchObject({ fontSize: 22, fontWeight: "800" });
    expect(screen.getByRole("button", { name: "Back to Calendar agenda" }).props.hasTVPreferredFocus).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Retry preview" }));
    expect(await screen.findByText("Workout preview unavailable")).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByText("Workout preview unavailable").props.style)).toMatchObject({ fontSize: 22, fontWeight: "800" });
    expect(screen.getAllByRole("button", { name: "Back to Calendar agenda" })[0]).toHaveProp("hasTVPreferredFocus", true);
    expect(screen.getAllByRole("button", { name: "Back to Calendar agenda" })).toHaveLength(2);
    expect(loadOccurrence).toHaveBeenLastCalledWith("stale-occurrence");
    await fireEvent.press(screen.getAllByRole("button", { name: "Back to Calendar agenda" })[1]!);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("formats every canonical metric target and rejects lookalike payloads", async () => {
    const valid = occurrenceWithTargets("all-targets", [
      { id: "load", target: { version: 1, profile: "load_reps", loadGrams: 50_000, minReps: 4, maxReps: 6, incrementGrams: 2_500, perSide: false } },
      { id: "bodyweight", target: { version: 1, profile: "bodyweight_reps", minReps: 8, maxReps: 10, variationId: "standard", perSide: false } },
      { id: "added", target: { version: 1, profile: "added_load_reps", addedLoadGrams: 10_000, minReps: 5, maxReps: 5, incrementGrams: 1_000, perSide: false } },
      { id: "assisted", target: { version: 1, profile: "assisted_reps", assistanceGrams: 20_000, minReps: 6, maxReps: 8, decrementGrams: 1_000, assistanceEquipmentId: "machine", perSide: false } },
      { id: "hold", target: { version: 2, profile: "timed_hold", durationMs: 45_000, perSide: false } },
      { id: "distance", target: { version: 1, profile: "fixed_distance", plannedDistanceMeters: 400 } },
      { id: "time", target: { version: 1, profile: "fixed_time", plannedDurationMs: 60_000 } },
      { id: "intervals", target: { version: 1, profile: "intervals", protocolId: "tabata", comparatorId: "rounds_then_work", comparatorVersion: 1, plannedRounds: 8, workIntervalMs: 20_000, restIntervalMs: 10_000 } },
      { id: "unscored", target: { version: 1, profile: "unscored", completionRequired: true } },
    ]);
    const rendered = await render(<AppearanceProvider><PlannedWorkoutDetailScreen occurrenceId="all-targets" loadOccurrence={jest.fn(async () => valid)} onBack={jest.fn()} /></AppearanceProvider>);

    for (const value of ["50 kg × 6", "Bodyweight × 10", "BW + 10 kg × 5", "20 kg assist × 8", "45 sec", "400 m", "60 sec", "8 rounds · 20 sec work", "Complete"]) {
      expect(await screen.findByText(value)).toBeOnTheScreen();
    }

    const invalid = occurrenceWithTargets("invalid-target", [
      { id: "lookalike", target: { version: 1, profile: "load_reps", loadGrams: 50_000, maxReps: 5, unexpected: true } },
    ]);
    await rendered.rerender(<AppearanceProvider><PlannedWorkoutDetailScreen occurrenceId="invalid-target" loadOccurrence={jest.fn(async () => invalid)} onBack={jest.fn()} /></AppearanceProvider>);
    expect(await screen.findByText("Workout preview unavailable")).toBeOnTheScreen();
  });

  it("ignores a stale occurrence response after route identity changes", async () => {
    let resolveFirst!: (value: PlannedStrengthOccurrenceDetail | null) => void;
    const first = new Promise<PlannedStrengthOccurrenceDetail | null>((resolve) => { resolveFirst = resolve; });
    const second = occurrenceWithTargets("occurrence-2", [
      { id: "target-2", target: { version: 1, profile: "unscored", completionRequired: true } },
    ]);
    const loadOccurrence = jest.fn((id: string) => id === "occurrence-1" ? first : Promise.resolve(second));
    const rendered = await render(<AppearanceProvider><PlannedWorkoutDetailScreen occurrenceId="occurrence-1" loadOccurrence={loadOccurrence} onBack={jest.fn()} /></AppearanceProvider>);

    await rendered.rerender(<AppearanceProvider><PlannedWorkoutDetailScreen occurrenceId="occurrence-2" loadOccurrence={loadOccurrence} onBack={jest.fn()} /></AppearanceProvider>);
    expect(await screen.findByText("Complete")).toBeOnTheScreen();
    await act(async () => resolveFirst(occurrence));
    expect(screen.getByText("Complete")).toBeOnTheScreen();
    expect(screen.queryByText("50 kg × 5")).toBeNull();
  });

  it("fails closed when source-backed plan, day, or exercise names are missing", async () => {
    const invalid = [
      Object.freeze({ ...occurrence, planName: " " }),
      Object.freeze({ ...occurrence, dayName: " " }),
      Object.freeze({ ...occurrence, exercises: Object.freeze([Object.freeze({ ...occurrence.exercises[0]!, exerciseName: " " })]) }),
    ];
    const rendered = await render(<AppearanceProvider><PlannedWorkoutDetailScreen occurrenceId="occurrence-1" loadOccurrence={jest.fn(async () => invalid[0]!)} onBack={jest.fn()} /></AppearanceProvider>);
    expect(await screen.findByText("Workout preview unavailable")).toBeOnTheScreen();
    for (const next of invalid.slice(1)) {
      await rendered.rerender(<AppearanceProvider><PlannedWorkoutDetailScreen occurrenceId="occurrence-1" loadOccurrence={jest.fn(async () => next)} onBack={jest.fn()} /></AppearanceProvider>);
      expect(await screen.findByText("Workout preview unavailable")).toBeOnTheScreen();
    }
  });
});
