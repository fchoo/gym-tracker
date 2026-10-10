import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import { WorkoutActionDock } from "../components/WorkoutActionDock";
import { AppearanceProvider } from "../theme";

function renderDock(overrides: Partial<React.ComponentProps<typeof WorkoutActionDock>> = {}) {
  const props = {
    completeLabel: "Complete Set 1",
    onAddExercise: jest.fn(),
    onComplete: jest.fn(),
    state: "ready" as const,
    ...overrides,
  };
  const rendered = render(
    <AppearanceProvider>
      <WorkoutActionDock {...props} />
    </AppearanceProvider>,
  );
  return { props, ...rendered };
}

describe("WorkoutActionDock", () => {
  it("keeps Add exercise and the authoritative current completion in one compact dock", () => {
    const { getByRole, props } = renderDock();

    fireEvent.press(getByRole("button", { name: "Add exercise" }));
    fireEvent.press(getByRole("button", { name: "Complete Set 1" }));

    expect(props.onAddExercise).toHaveBeenCalledTimes(1);
    expect(props.onComplete).toHaveBeenCalledTimes(1);
  });

  it("blocks both duplicate intents while the authoritative set command is saving", () => {
    const { getByRole } = renderDock({ state: "saving" });

    expect(getByRole("button", { name: "Add exercise" })).toBeDisabled();
    expect(getByRole("button", { name: "Complete Set 1" })).toBeDisabled();
  });

  it("retains the exact retry action after a failed set command", () => {
    const { getByRole, props } = renderDock({ completeLabel: "Set not saved · Retry", state: "failed" });

    fireEvent.press(getByRole("button", { name: "Set not saved · Retry" }));

    expect(props.onComplete).toHaveBeenCalledTimes(1);
  });
});
