import { render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { PlannedStrengthOccurrenceDetail } from "../../src/domains/workout";

const mockBack = jest.fn();
const mockLoadPlannedStrengthOccurrence = jest.fn<() => Promise<PlannedStrengthOccurrenceDetail | null>>();
let mockParams: Readonly<{ occurrenceId?: string | readonly string[] }> = { occurrenceId: "occurrence-1" };

jest.mock("expo-router", () => ({
  router: { back: (...args: readonly unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({ loadPlannedStrengthOccurrence: mockLoadPlannedStrengthOccurrence }),
}));
jest.mock("../../src/ui/screens/PlannedWorkoutDetailScreen", () => ({
  PlannedWorkoutDetailScreen: ({ occurrenceId, loadOccurrence }: { occurrenceId: string; loadOccurrence(id: string): Promise<PlannedStrengthOccurrenceDetail | null> }) => {
    const { Text } = require("react-native") as typeof import("react-native");
    void loadOccurrence(occurrenceId);
    return <Text>{`Preview ${occurrenceId}`}</Text>;
  },
}));

import CalendarPlanRoute from "../calendar/plan/[occurrenceId]";

describe("Calendar planned Strength route", () => {
  beforeEach(() => { mockBack.mockReset(); mockLoadPlannedStrengthOccurrence.mockReset(); mockParams = { occurrenceId: "occurrence-1" }; });

  it("loads exactly the durable planned occurrence identity", async () => {
    mockLoadPlannedStrengthOccurrence.mockResolvedValue(null);
    await render(<CalendarPlanRoute />);
    await waitFor(() => expect(mockLoadPlannedStrengthOccurrence).toHaveBeenCalledWith("occurrence-1"));
    expect(screen.getByText("Preview occurrence-1")).toBeOnTheScreen();
  });

  it("does not substitute an array or missing route identity", async () => {
    mockParams = { occurrenceId: ["occurrence-1", "other"] };
    await render(<CalendarPlanRoute />);
    await waitFor(() => expect(mockLoadPlannedStrengthOccurrence).not.toHaveBeenCalled());
    expect(screen.getByText("Preview ")).toBeOnTheScreen();
  });
});
