import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { RunningPlanAggregate } from "../../domains/running/contracts";
import { RunningPlanEditorScreen } from "../screens/RunningPlanEditorScreen";
import { makeRunningSessionDraft, type RunningPlanDraft } from "../running/runningFormDraft";
import { AppearanceProvider } from "../theme";

const initialDraft: RunningPlanDraft = {
  version: 1 as const, id: "running-plan", name: "Running plan", revision: 1, createdAtMs: 1,
  goal: { version: 1 as const, id: "running-goal", planId: "running-plan", revision: 1, goalDistanceMeters: 5_000, trainingDays: ["Monday" as const], createdAtMs: 1 },
  sessions: [],
};

describe("RunningPlanEditorScreen", () => {
  it("keeps sessions local until save, supports delete to zero, then navigates only after committed readback", async () => {
    const savePlan = jest.fn(async (draft: typeof initialDraft) => ({ ...draft, active: false as const, lifecycle: "inactive" as const }));
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
    expect(screen.getByRole("summary", { name: "1 phase · revision 1" })).toBeOnTheScreen();
    expect(screen.queryByLabelText("Running Recovery session")).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Delete recovery" }));
    expect(screen.getByText("Remove recovery session?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Remove session" }));
    expect(screen.queryByLabelText("Running Recovery session")).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(savePlan).toHaveBeenCalledWith(expect.objectContaining({ sessions: [] })));
    expect(onSaved).toHaveBeenCalledWith("running-plan");
  });

  it("confirms a final-session removal locally and renders a true saved-empty state", async () => {
    const savePlan = jest.fn(async (draft: typeof initialDraft) => ({ ...draft, active: false as const, lifecycle: "inactive" as const }));
    const view = await render(<AppearanceProvider><RunningPlanEditorScreen
      createId={(kind) => `${kind}:id`}
      initialDraft={initialDraft}
      onBack={jest.fn()}
      onSaved={jest.fn()}
      savePlan={savePlan}
    /></AppearanceProvider>);

    expect(view.getByText("No sessions yet")).toBeOnTheScreen();
    await fireEvent.press(view.getByRole("button", { name: "Add recovery" }));
    await fireEvent.press(view.getByRole("button", { name: "Delete recovery" }));
    expect(view.getByText("Remove recovery session?" )).toBeOnTheScreen();
    expect(savePlan).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole("button", { name: "Remove session" }));
    expect(view.getByText("No sessions yet")).toBeOnTheScreen();
    expect(savePlan).not.toHaveBeenCalled();
  });

  it("offers all seven typed local session kinds before the first command", async () => {
    await render(<AppearanceProvider><RunningPlanEditorScreen
      createId={(kind) => `${kind}:id`}
      initialDraft={initialDraft}
      onBack={jest.fn()}
      onSaved={jest.fn()}
      savePlan={jest.fn(async (draft: RunningPlanDraft): Promise<RunningPlanAggregate> => ({ ...draft, active: false, lifecycle: "inactive" }))}
    /></AppearanceProvider>);
    for (const label of ["recovery", "long run", "progression", "tempo", "intervals", "hills", "fartlek"]) {
      expect(screen.getByRole("button", { name: `Add ${label}` })).toBeOnTheScreen();
    }
  });

  it("moves same-day stable slots later and submits the exact reordered membership", async () => {
    const recovery = makeRunningSessionDraft({
      id: "recovery-v1", rootId: "recovery-root", slotId: "recovery-slot-v1", slotRootId: "recovery-slot",
      planId: initialDraft.id, kind: "recovery", weekday: "Monday", ordinal: 0, createdAtMs: 1,
    });
    const tempo = makeRunningSessionDraft({
      id: "tempo-v1", rootId: "tempo-root", slotId: "tempo-slot-v1", slotRootId: "tempo-slot",
      planId: initialDraft.id, kind: "tempo", weekday: "Monday", ordinal: 1, createdAtMs: 1,
    });
    const sameDayDraft = { ...initialDraft, sessions: [recovery, tempo] };
    const savePlan = jest.fn(async (draft: RunningPlanDraft): Promise<RunningPlanAggregate> => ({ ...draft, active: false, lifecycle: "inactive" }));
    const view = await render(<AppearanceProvider><RunningPlanEditorScreen
      createId={(kind) => `${kind}:id`}
      initialDraft={sameDayDraft}
      onBack={jest.fn()}
      onSaved={jest.fn()}
      savePlan={savePlan}
    /></AppearanceProvider>);

    await fireEvent.press(view.getByRole("button", { name: "Move recovery later" }));
    await fireEvent.press(view.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(savePlan).toHaveBeenCalledWith(expect.objectContaining({
      sessions: [
        expect.objectContaining({ slot: expect.objectContaining({ rootId: "tempo-slot", ordinal: 0 }) }),
        expect.objectContaining({ slot: expect.objectContaining({ rootId: "recovery-slot", ordinal: 1 }) }),
      ],
    })));
  });
});
