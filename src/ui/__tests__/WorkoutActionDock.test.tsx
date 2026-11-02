import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import {
  PrimaryAction,
  WorkoutPrimaryAction,
} from "../components";
import { WorkoutActionDock } from "../components/WorkoutActionDock";
import { AppearanceProvider } from "../theme";

async function renderDock(overrides: Partial<React.ComponentProps<typeof WorkoutActionDock>> = {}) {
  const props = {
    completeLabel: "Complete Set 1",
    onAddExercise: jest.fn(),
    onComplete: jest.fn(),
    state: "ready" as const,
    ...overrides,
  };
  await render(
    <AppearanceProvider>
      <WorkoutActionDock {...props} />
    </AppearanceProvider>,
  );
  return props;
}

describe("WorkoutActionDock", () => {
  it("keeps Add exercise and the authoritative current completion in one compact dock", async () => {
    const props = await renderDock();

    await fireEvent.press(screen.getByRole("button", { name: "Add exercise" }));
    await fireEvent.press(screen.getByRole("button", { name: "Complete Set 1" }));

    expect(props.onAddExercise).toHaveBeenCalledTimes(1);
    expect(props.onComplete).toHaveBeenCalledTimes(1);
  });

  it("uses the workout-only root geometry and compact dock dimensions without changing generic actions", async () => {
    const rendered = await render(<AppearanceProvider>
      <WorkoutPrimaryAction label="Start workout" onPress={jest.fn()} />
      <PrimaryAction label="Generic save" onPress={jest.fn()} />
      <WorkoutActionDock
        completeLabel="Complete Set 1"
        onAddExercise={jest.fn()}
        onComplete={jest.fn()}
        state="ready"
      />
    </AppearanceProvider>);

    expect(rendered.getByLabelText("Start workout")).toHaveStyle({
      borderRadius: 16,
      minHeight: 64,
    });
    expect(rendered.getByLabelText("Generic save")).toHaveStyle({
      borderRadius: 8,
      minHeight: 56,
    });
    expect(rendered.getByLabelText("Add exercise")).toHaveStyle({ minHeight: 56 });
    expect(rendered.getByLabelText("Complete Set 1")).toHaveStyle({ minHeight: 56 });
    expect(rendered.getByTestId("workout-action-dock-add")).toHaveStyle({ minWidth: 128 });
  });
});
