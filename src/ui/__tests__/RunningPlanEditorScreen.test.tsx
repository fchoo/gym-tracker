import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { RunningPlanAggregate } from "../../domains/running/contracts";
import { RunningPlanEditorScreen, sessionDeleteFocusTarget } from "../screens/RunningPlanEditorScreen";
import { makeRunningSessionDraft, type RunningPlanDraft } from "../running/runningFormDraft";
import { AppearanceProvider } from "../theme";

const mockRequestAndroidViewFocus = jest.fn<(nativeID: string) => Promise<boolean>>(async () => true);
jest.mock("../../bootstrap/androidViewFocus", () => ({
  requestAndroidViewFocus: (nativeID: string) => mockRequestAndroidViewFocus(nativeID),
}));

const initialDraft: RunningPlanDraft = {
  version: 1 as const, id: "running-plan", name: "Running plan", revision: 1, createdAtMs: 1,
  goal: { version: 1 as const, id: "running-goal", planId: "running-plan", revision: 1, goalDistanceMeters: 5_000, targetDurationMs: 1_800_000, runsPerWeek: 1, trainingDays: ["Monday" as const], createdAtMs: 1 },
  sessions: [],
};

describe("RunningPlanEditorScreen", () => {
  it("chooses next, then previous, then Add session after first, middle, last, and final deletion", () => {
    expect(sessionDeleteFocusTarget(["first", "second", "third"], 0)).toEqual({ kind: "row", slotRootId: "second" });
    expect(sessionDeleteFocusTarget(["first", "second", "third"], 1)).toEqual({ kind: "row", slotRootId: "third" });
    expect(sessionDeleteFocusTarget(["first", "second", "third"], 2)).toEqual({ kind: "row", slotRootId: "second" });
    expect(sessionDeleteFocusTarget(["only"], 0)).toEqual({ kind: "add" });
  });

  it("keeps deletion local and returns cancellation focus to the exact delete trigger", async () => {
    const savePlan = jest.fn<(draft: RunningPlanDraft) => Promise<RunningPlanAggregate>>(async (draft) => ({ ...draft, active: false, lifecycle: "inactive" }));
    const view = await render(<AppearanceProvider><RunningPlanEditorScreen
      createId={(kind) => `${kind}:id`}
      initialDraft={initialDraft}
      onBack={jest.fn()}
      onSaved={jest.fn()}
      savePlan={savePlan}
    /></AppearanceProvider>);

    await fireEvent.press(view.getByRole("button", { name: "Add Recovery session" }));
    const trigger = view.getByRole("button", { name: "Delete Recovery session" });
    expect(trigger).toHaveProp("nativeID", "running-plan-session-delete-running-slot:id");
    await fireEvent.press(trigger);
    await fireEvent.press(view.getByRole("button", { name: "Keep session" }));

    expect(view.getByRole("button", { name: "Delete Recovery session" })).toBeOnTheScreen();
    expect(savePlan).not.toHaveBeenCalled();
  });

  it("uses the stable Add session target after the final local deletion rerenders", async () => {
    const view = await render(<AppearanceProvider><RunningPlanEditorScreen
      createId={(kind) => `${kind}:final`}
      initialDraft={initialDraft}
      onBack={jest.fn()}
      onSaved={jest.fn()}
      savePlan={jest.fn(async (draft: typeof initialDraft) => ({ ...draft, active: false as const, lifecycle: "inactive" as const }))}
    /></AppearanceProvider>);

    await fireEvent.press(view.getByRole("button", { name: "Add Recovery session" }));
    mockRequestAndroidViewFocus.mockClear();
    await fireEvent.press(view.getByRole("button", { name: "Delete Recovery session" }));
    await fireEvent.press(view.getByRole("button", { name: "Delete session" }));

    await waitFor(() => expect(view.getByRole("button", { name: "Add session" })).toHaveProp("nativeID", "running-plan-add-session"));
    expect(mockRequestAndroidViewFocus).toHaveBeenCalledWith("running-plan-add-session");
  });

  it("restores a dirty session-draft leave confirmation to its Edit trigger without writing", async () => {
    const savePlan = jest.fn<(draft: RunningPlanDraft) => Promise<RunningPlanAggregate>>(async (draft) => ({ ...draft, active: false, lifecycle: "inactive" }));
    const view = await render(<AppearanceProvider><RunningPlanEditorScreen
      createId={(kind) => `${kind}:leave`}
      initialDraft={initialDraft}
      onBack={jest.fn()}
      onSaved={jest.fn()}
      savePlan={savePlan}
    /></AppearanceProvider>);

    await fireEvent.press(view.getByRole("button", { name: "Add Recovery session" }));
    const trigger = view.getByRole("button", { name: "Edit Recovery session" });
    expect(trigger).toHaveProp("nativeID", "running-plan-session-edit-running-slot:leave");
    await fireEvent.press(trigger);
    expect(view.getByText("Save changes?")).toBeOnTheScreen();
    await fireEvent.press(view.getByRole("button", { name: "Keep editing" }));

    expect(view.getByRole("button", { name: "Edit Recovery session" })).toBeOnTheScreen();
    expect(savePlan).not.toHaveBeenCalled();
  });

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

    expect(screen.getByRole("header", { name: "Goal and weekly sessions" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Add Recovery session" }));
    expect(screen.getByText("1 min · easy No target")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Running Recovery session")).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Delete Recovery session" }));
    expect(screen.getByText("Delete Recovery session?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Delete session" }));
    expect(screen.queryByLabelText("Running Recovery session")).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Create running plan" }));
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
    await fireEvent.press(view.getByRole("button", { name: "Add Recovery session" }));
    await fireEvent.press(view.getByRole("button", { name: "Delete Recovery session" }));
    expect(view.getByText("Delete Recovery session?" )).toBeOnTheScreen();
    expect(savePlan).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole("button", { name: "Delete session" }));
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
    for (const label of ["Recovery", "Long run", "Progression", "Tempo", "Intervals", "Hills", "Fartlek"]) {
      expect(screen.getByRole("button", { name: `Add ${label} session` })).toBeOnTheScreen();
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

    await fireEvent(view.getByRole("adjustable", { name: "Reorder Monday · Recovery" }), "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    await fireEvent.press(view.getByRole("button", { name: "Create running plan" }));

    await waitFor(() => expect(savePlan).toHaveBeenCalledWith(expect.objectContaining({
      sessions: [
        expect.objectContaining({ slot: expect.objectContaining({ rootId: "tempo-slot", ordinal: 0 }) }),
        expect.objectContaining({ slot: expect.objectContaining({ rootId: "recovery-slot", ordinal: 1 }) }),
      ],
    })));
  });

  it("focuses and announces the stable Running plan recovery heading after an async save failure", async () => {
    const announce = jest.spyOn(require("react-native").AccessibilityInfo, "announceForAccessibility");
    const view = await render(<AppearanceProvider><RunningPlanEditorScreen
      createId={(kind) => `${kind}:failure`}
      initialDraft={initialDraft}
      onBack={jest.fn()}
      onSaved={jest.fn()}
      savePlan={jest.fn(async () => { throw new Error("write_failed"); })}
    /></AppearanceProvider>);

    mockRequestAndroidViewFocus.mockClear();
    await fireEvent.press(view.getByRole("button", { name: "Create running plan" }));

    await view.findByText("Running plan could not be saved");
    expect(view.getByText("Running plan could not be saved").parent?.parent).toHaveProp("nativeID", "running-plan-save-error-heading");
    expect(view.getByRole("button", { name: "Retry saving plan" })).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith("Running plan could not be saved. Your edits are still here. Retry saving plan.");
    await waitFor(() => expect(mockRequestAndroidViewFocus).toHaveBeenCalledWith("running-plan-save-error-heading"));
  });
});
