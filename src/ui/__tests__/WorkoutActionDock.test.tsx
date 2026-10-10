import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

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

    fireEvent.press(screen.getByRole("button", { name: "Add exercise" }));
    fireEvent.press(screen.getByRole("button", { name: "Complete Set 1" }));

    expect(props.onAddExercise).toHaveBeenCalledTimes(1);
    expect(props.onComplete).toHaveBeenCalledTimes(1);
  });
});
