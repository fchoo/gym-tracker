import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { ActiveWorkoutSet } from "../../domains/workout";
import { SetRow } from "../components/SetRow";
import { AppearanceProvider } from "../theme";

const set: ActiveWorkoutSet = {
  id: "working-1", kind: "working", ordinal: 0, sourceTargetId: "target-1",
  metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
  target: { version: 1, profile: "load_reps", loadGrams: 60_000, minReps: 6, maxReps: 8, incrementGrams: 2_500, perSide: false },
  observation: { version: 1, profile: "load_reps", loadGrams: 62_500, reps: 6, source: "manual" },
  status: "planned", completedAtMs: null, revision: 1, valueSources: [],
};

describe("SetRow", () => {
  it("is a facts-only tap target with no mutation controls", async () => {
    const onPress = jest.fn();
    await render(<AppearanceProvider><SetRow active index={1} kind="working" onPress={onPress} set={set} /></AppearanceProvider>);
    await fireEvent.press(screen.getByRole("button", { name: /Set 1\. 62\.5 kg × 6\. Current\. Edit set values/i }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /complete|reset|remove/i })).not.toBeOnTheScreen();
  });
});
