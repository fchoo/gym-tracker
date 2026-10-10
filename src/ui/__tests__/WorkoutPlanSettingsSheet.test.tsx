import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import { WorkoutPlanSettingsSheet } from "../components/WorkoutPlanSettingsSheet";
import { AppearanceProvider } from "../theme";

describe("WorkoutPlanSettingsSheet", () => {
  it("keeps saved plan preferences distinct from a pending draft", async () => {
    const onSave = jest.fn(async () => undefined);
    await render(<AppearanceProvider><WorkoutPlanSettingsSheet
      defaultRestSeconds={90}
      onClose={jest.fn()}
      onEditPlanAfterWorkout={jest.fn()}
      onOpenWorkoutActions={jest.fn()}
      onSave={onSave}
      planName="Full Body A"
      scheduleSummary="Monday"
      visible
      weightIncrementGrams={2500}
    /></AppearanceProvider>);

    expect(screen.getByText("Full Body A")).toBeOnTheScreen();
    expect(screen.getByText("Default rest")).toBeOnTheScreen();
    expect(screen.getByText("Saved rest · 90 sec")).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "2.5 kilograms" }))
      .toHaveProp("accessibilityState", { checked: true, disabled: false });
    await fireEvent.changeText(
      screen.getByLabelText("Default between-set rest seconds"),
      "120",
    );
    expect(screen.getByText("Saved rest · 90 sec")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Save default rest" }));
    expect(onSave).toHaveBeenCalledWith({ defaultRestSeconds: 120, weightIncrementGrams: 2500 });
  });
});
