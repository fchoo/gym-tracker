import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import { RunningPlanEditorScreen } from "../screens/RunningPlanEditorScreen";
import { AppearanceProvider } from "../theme";

const initialDraft = {
  version: 1 as const, id: "running-plan", name: "Running plan", revision: 1, createdAtMs: 1,
  goal: { version: 1 as const, id: "running-goal", planId: "running-plan", revision: 1, goalDistanceMeters: 5_000, trainingDays: ["Monday" as const], createdAtMs: 1 },
  sessions: [],
};

describe("RunningPlanEditorScreen", () => {
  it("keeps sessions local until save, supports delete to zero, then navigates only after committed readback", async () => {
    const savePlan = jest.fn(async (draft: typeof initialDraft) => ({ ...draft, active: false as const }));
    const onSaved = jest.fn();
    await render(<AppearanceProvider><RunningPlanEditorScreen
      createId={(kind) => `${kind}:id`}
      initialDraft={initialDraft}
      onBack={jest.fn()}
      onSaved={onSaved}
      savePlan={savePlan}
    /></AppearanceProvider>);

    expect(screen.getByRole("header", { name: "New Running plan" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Add recovery" }));
    expect(screen.getByLabelText("Running Recovery session")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Delete recovery" }));
    expect(screen.queryByLabelText("Running Recovery session")).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(savePlan).toHaveBeenCalledWith(expect.objectContaining({ sessions: [] })));
    expect(onSaved).toHaveBeenCalledWith("running-plan");
  });

  it("offers all seven typed local session kinds before the first command", async () => {
    await render(<AppearanceProvider><RunningPlanEditorScreen
      createId={(kind) => `${kind}:id`}
      initialDraft={initialDraft}
      onBack={jest.fn()}
      onSaved={jest.fn()}
      savePlan={jest.fn(async (draft) => ({ ...draft, active: false as const }))}
    /></AppearanceProvider>);
    for (const label of ["recovery", "long run", "progression", "tempo", "intervals", "hills", "fartlek"]) {
      expect(screen.getByRole("button", { name: `Add ${label}` })).toBeOnTheScreen();
    }
  });
});
