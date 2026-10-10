import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { RunningPlanAggregate } from "../../domains/running/contracts";
import { makeRunningSessionSpec, RunningSessionEditorScreen } from "../screens/RunningSessionEditorScreen";
import { initialRunningSessionFormDraft } from "../components/RunningSessionFields";
import { AppearanceProvider } from "../theme";

const plan: RunningPlanAggregate = {
  version: 1, id: "plan-1", name: "Plan", revision: 1, active: false, lifecycle: "inactive", createdAtMs: 1,
  goal: { version: 1, id: "goal-1", planId: "plan-1", revision: 1, goalDistanceMeters: 5000, trainingDays: ["Monday"], createdAtMs: 1 },
  sessions: [],
};

describe("RunningSessionEditorScreen", () => {
  it("serializes only the selected Long run or Progression contextual variant", () => {
    const longRun = makeRunningSessionSpec({
      ...initialRunningSessionFormDraft("long_run", "Tuesday"),
      volume: "12000",
      target: { mode: "heart_rate_zone", paceMsPerKm: "999", heartRateZone: "2", rpe: "9" },
      finish: "steady_finish",
      stages: "9",
      startTarget: { mode: "rpe", paceMsPerKm: "", heartRateZone: "", rpe: "3" },
      finishTarget: { mode: "rpe", paceMsPerKm: "", heartRateZone: "", rpe: "8" },
    });
    expect(longRun).toEqual(expect.objectContaining({
      sessionKind: "long_run", advisoryTarget: { heartRateZone: 2 }, contextual: { finish: "steady_finish" },
    }));
    expect(longRun).not.toHaveProperty("contextual.stages");

    const progression = makeRunningSessionSpec({
      ...initialRunningSessionFormDraft("progression", "Thursday"),
      volume: "9000", stages: "3",
      startTarget: { mode: "rpe", paceMsPerKm: "", heartRateZone: "", rpe: "4" },
      finishTarget: { mode: "pace", paceMsPerKm: "290000", heartRateZone: "", rpe: "" },
      finish: "progression_finish",
    });
    expect(progression).toEqual(expect.objectContaining({
      sessionKind: "progression",
      contextual: { stages: 3, startTarget: { rpe: 4 }, finishTarget: { paceMsPerKm: 290000 } },
    }));
    expect(progression).not.toHaveProperty("advisoryTarget");
  });

  it("keeps create identity UI-only until the committed Recovery command readback", async () => {
    const saveSession = jest.fn(async () => ({ plan: { ...plan, revision: 2 }, sessionRootId: "session-root-1" }));
    const onSaved = jest.fn();
    const view = await render(<AppearanceProvider><RunningSessionEditorScreen
      loadPlan={jest.fn(async () => plan)}
      mode="create"
      onBack={jest.fn()}
      onSaved={onSaved}
      planId="plan-1"
      createRequestId={() => "request-1"}
      saveSession={saveSession}
    /></AppearanceProvider>);

    await view.findByRole("header", { name: "New session" });
    await fireEvent.changeText(view.getByLabelText("Volume distance metres"), "5000");
    await fireEvent.changeText(view.getByLabelText("RPE"), "5");
    await fireEvent.press(view.getByRole("button", { name: "Save session" }));

    await waitFor(() => expect(saveSession).toHaveBeenCalledWith(expect.objectContaining({
      expectedPlanRevision: 1,
      sessionRootId: undefined,
      draft: expect.objectContaining({ kind: "recovery", volume: "5000" }),
    })));
    expect(onSaved).toHaveBeenCalledWith("session-root-1");
  });

  it("retains a valid Long run draft and exposes a retry after a write failure", async () => {
    const saveSession = jest.fn(async () => { throw new Error("conflict"); });
    const view = await render(<AppearanceProvider><RunningSessionEditorScreen
      loadPlan={jest.fn(async () => plan)}
      mode="create"
      onBack={jest.fn()}
      onSaved={jest.fn()}
      planId="plan-1"
      createRequestId={() => "request-2"}
      saveSession={saveSession}
    /></AppearanceProvider>);

    await view.findByRole("header", { name: "New session" });
    await fireEvent.press(view.getByRole("button", { name: "Workout type Long run" }));
    await fireEvent.changeText(view.getByLabelText("Volume distance metres"), "12000");
    await fireEvent.changeText(view.getByLabelText("RPE"), "6");
    await fireEvent.press(view.getByRole("button", { name: "Save session" }));

    await view.findByText("Long run session could not be saved. Your edits are still here. Try again.");
    expect(view.getByLabelText("Volume distance metres")).toHaveProp("value", "12000");
    expect(view.getByRole("button", { name: "Retry saving session" })).toBeOnTheScreen();
  });
});
