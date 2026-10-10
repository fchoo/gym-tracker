import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { ActiveWorkoutSet, SetObservation } from "../../domains/workout";
import { WorkoutSetEditorSheet } from "../components/WorkoutSetEditorSheet";
import { AppearanceProvider } from "../theme";

const set: ActiveWorkoutSet = {
  id: "working-1", kind: "working", ordinal: 0, sourceTargetId: "target-1",
  metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
  target: { version: 1, profile: "load_reps", loadGrams: 60_000, minReps: 6, maxReps: 8, incrementGrams: 2_500, perSide: false },
  observation: { version: 1, profile: "load_reps", loadGrams: 62_500, reps: 6, source: "manual" },
  status: "planned", completedAtMs: null, revision: 1, valueSources: [],
};

describe("WorkoutSetEditorSheet", () => {
  it("keeps a load/reps draft local until explicit Save", async () => {
    const onSave = jest.fn(async (_observation: SetObservation) => undefined);
    const onCancel = jest.fn();
    await render(<AppearanceProvider><WorkoutSetEditorSheet exerciseName="Back Squat" onCancel={onCancel} onSave={onSave} set={set} visible /></AppearanceProvider>);
    await fireEvent.changeText(screen.getByLabelText("Load (kg)"), "65");
    await fireEvent.changeText(screen.getByLabelText("Repetitions"), "7");
    expect(onSave).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Save set values" }));
    expect(onSave).toHaveBeenCalledWith({ version: 1, profile: "load_reps", loadGrams: 65_000, reps: 7, source: "manual" });
  });

  it("cancels without saving", async () => {
    const onSave = jest.fn(async (_observation: SetObservation) => undefined);
    const onCancel = jest.fn();
    await render(<AppearanceProvider><WorkoutSetEditorSheet exerciseName="Back Squat" onCancel={onCancel} onSave={onSave} set={set} visible /></AppearanceProvider>);
    await fireEvent.press(screen.getByRole("button", { name: "Close edit back squat" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
