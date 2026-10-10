import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

import {
  PlanTypeChooserScreen,
} from "../screens/PlanTypeChooserScreen";
import {
  AppearanceProvider,
  createMemoryAppearanceStore,
} from "../theme";

describe("PlanTypeChooserScreen", () => {
  it("presents equal unselected Strength and Running choices without mutating on entry", async () => {
    const onBack = jest.fn();
    const onChooseRunning = jest.fn();
    const onChooseStrength = jest.fn();

    await render(
      <AppearanceProvider store={createMemoryAppearanceStore()}>
        <PlanTypeChooserScreen
          onBack={onBack}
          onChooseRunning={onChooseRunning}
          onChooseStrength={onChooseStrength}
        />
      </AppearanceProvider>,
    );

    expect(screen.getByText("What are you training for?")).toBeOnTheScreen();
    expect(screen.getByText("Choose the plan structure first. Creating a plan does not activate it.")).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Strength" }).props.accessibilityState)
      .toMatchObject({ selected: false });
    expect(screen.getByRole("radio", { name: "Running" }).props.accessibilityState)
      .toMatchObject({ selected: false });
    expect(onChooseStrength).not.toHaveBeenCalled();
    expect(onChooseRunning).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole("radio", { name: "Running" }));
    expect(onChooseRunning).toHaveBeenCalledTimes(1);
    expect(onChooseStrength).not.toHaveBeenCalled();
  });
});
