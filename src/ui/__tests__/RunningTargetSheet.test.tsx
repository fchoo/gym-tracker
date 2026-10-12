import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { RunningTargetSheet } from "../components/RunningTargetSheet";
import type { RunningPlanAggregate } from "../../domains/running/contracts";

const source = (overrides: Partial<RunningPlanAggregate["goal"]> = {}): RunningPlanAggregate => ({
  version: 1,
  id: "running-2point4",
  name: "2.4 km target",
  revision: 4,
  active: true,
  lifecycle: "active",
  createdAtMs: 1,
  goal: {
    version: 1,
    id: "goal-2point4-v2",
    planId: "running-2point4",
    revision: 2,
    goalDistanceMeters: 2400,
    trainingDays: ["Monday", "Thursday"],
    benchmark: {
      source: "personal_history",
      distanceMeters: 2400,
      durationMs: 720_000,
      localDate: "2026-10-01",
    },
    createdAtMs: 1,
    ...overrides,
  },
  sessions: [],
});

describe("RunningTargetSheet", () => {
  it("seeds the approved 2.4 km default, preserves a source revision, and saves only the canonical draft", async () => {
    const saveRunningTarget = jest.fn(async () => ({
      outcome: "committed" as const,
      plan: source({ id: "goal-2point4-v3", revision: 3, targetDurationMs: 660_000 }),
    }));
    const onSaved = jest.fn();
    const view = render(
      <RunningTargetSheet
        onClose={jest.fn()}
        onSaved={onSaved}
        runtime={{ createId: () => "request-1", saveRunningTarget } as never}
        sources={[source()]}
        todayLocalDate="2026-10-12"
        visible
      />,
    );

    expect(view.getByText("Running target")).toBeTruthy();
    expect(view.getByDisplayValue("11:00")).toBeTruthy();
    expect(view.getByText("Current benchmark")).toBeTruthy();
    expect(view.getByText("12:00 · Personal history · 2026-10-01")).toBeTruthy();

    fireEvent.changeText(view.getByLabelText("Target time"), "10:45");
    fireEvent.press(view.getByLabelText("Tuesday"));
    fireEvent.press(view.getByText("Save target"));

    await waitFor(() => expect(saveRunningTarget).toHaveBeenCalledWith(expect.objectContaining({
      planId: "running-2point4",
      expectedSourceRevision: 4,
      targetDurationMs: 645_000,
      trainingDays: ["Monday", "Tuesday", "Thursday"],
    })));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ revision: 5 }));
  });

  it("retains its complete draft and invokes no runtime save after invalid validation", async () => {
    const saveRunningTarget = jest.fn();
    const view = render(
      <RunningTargetSheet
        onClose={jest.fn()}
        runtime={{ createId: () => "request-1", saveRunningTarget } as never}
        sources={[source()]}
        todayLocalDate="2026-10-12"
        visible
      />,
    );

    fireEvent.changeText(view.getByLabelText("Target time"), "00:59");
    fireEvent.changeText(view.getByLabelText("Optional target date"), "2026-10-12");
    fireEvent.press(view.getByText("Save target"));

    expect(view.getByText("Enter a valid target time.")).toBeTruthy();
    expect(view.getByDisplayValue("00:59")).toBeTruthy();
    expect(view.getByDisplayValue("2026-10-12")).toBeTruthy();
    expect(saveRunningTarget).not.toHaveBeenCalled();
  });

  it("keeps the draft after a stale save and reloads only when the owner explicitly asks", async () => {
    const stale = new Error("running_target_revision_conflict");
    const loadPlan = jest.fn(async () => source({ id: "goal-2point4-v4", revision: 4, targetDurationMs: 630_000 }));
    const view = render(
      <RunningTargetSheet
        onClose={jest.fn()}
        runtime={{ createId: () => "request-1", loadPlan, saveRunningTarget: jest.fn(async () => { throw stale; }) } as never}
        sources={[source()]}
        todayLocalDate="2026-10-12"
        visible
      />,
    );

    fireEvent.changeText(view.getByLabelText("Target time"), "10:45");
    fireEvent.press(view.getByText("Save target"));
    await waitFor(() => expect(view.getByText("Target changed since this sheet opened")).toBeTruthy());
    expect(view.getByDisplayValue("10:45")).toBeTruthy();
    fireEvent.press(view.getByText("Reload target"));
    await waitFor(() => expect(loadPlan).toHaveBeenCalledWith("running-2point4"));
    expect(view.getByDisplayValue("10:45")).toBeTruthy();
  });

  it("discards on its explicit action without a mutation", () => {
    const saveRunningTarget = jest.fn();
    const onClose = jest.fn();
    const view = render(
      <RunningTargetSheet
        onClose={onClose}
        runtime={{ createId: () => "request-1", saveRunningTarget } as never}
        sources={[source()]}
        todayLocalDate="2026-10-12"
        visible
      />,
    );
    fireEvent.changeText(view.getByLabelText("Target time"), "10:45");
    fireEvent.press(view.getByText("Discard target changes"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(saveRunningTarget).not.toHaveBeenCalled();
  });
});
