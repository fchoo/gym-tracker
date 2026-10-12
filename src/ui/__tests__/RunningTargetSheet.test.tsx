import React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { RunningTargetSheet } from "../components/RunningTargetSheet";
import type { RunningPlanAggregate } from "../../domains/running/contracts";
import { AppearanceProvider } from "../theme";

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
  afterEach(async () => {
    await cleanup();
  });

  it("seeds the approved 2.4 km default, preserves a source revision, and saves only the canonical draft", async () => {
    const saveRunningTarget = jest.fn(async () => ({
      outcome: "committed" as const,
      plan: { ...source({ id: "goal-2point4-v3", revision: 3, targetDurationMs: 660_000 }), revision: 5 },
    }));
    const onSaved = jest.fn();
    const view = await render(
      <AppearanceProvider reduceMotion><RunningTargetSheet
        onClose={jest.fn()}
        onSaved={onSaved}
        runtime={{ createId: () => "request-1", saveRunningTarget } as never}
        sources={[source()]}
        todayLocalDate="2026-10-12"
        visible
      /></AppearanceProvider>,
    );

    expect(view.getByText("Running target")).toBeTruthy();
    expect(view.getByDisplayValue("11:00")).toBeTruthy();
    expect(view.getByText("Current benchmark")).toBeTruthy();
    expect(view.getByText("12:00 · Personal History · 2026-10-01")).toBeTruthy();

    await fireEvent.changeText(view.getByLabelText("Target time"), "10:45");
    await fireEvent.press(view.getByLabelText("Tuesday"));
    await waitFor(() => expect(view.getByDisplayValue("10:45")).toBeTruthy());
    await fireEvent.press(view.getByText("Save target"));

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
    const view = await render(
      <AppearanceProvider reduceMotion><RunningTargetSheet
        onClose={jest.fn()}
        runtime={{ createId: () => "request-1", saveRunningTarget } as never}
        sources={[source()]}
        todayLocalDate="2026-10-12"
        visible
      /></AppearanceProvider>,
    );

    await fireEvent.changeText(view.getByLabelText("Target time"), "00:59");
    await fireEvent.changeText(view.getByLabelText("Optional target date"), "2026-10-12");
    await waitFor(() => expect(view.getByDisplayValue("00:59")).toBeTruthy());
    await fireEvent.press(view.getByText("Save target"));

    await waitFor(() => expect(view.getByText("Enter a valid target time.")).toBeTruthy());
    expect(view.getByDisplayValue("00:59")).toBeTruthy();
    expect(view.getByDisplayValue("2026-10-12")).toBeTruthy();
    expect(saveRunningTarget).not.toHaveBeenCalled();
  });

  it("keeps the draft after a stale save and reloads only when the owner explicitly asks", async () => {
    const stale = new Error("running_target_revision_conflict");
    const loadPlan = jest.fn(async () => source({ id: "goal-2point4-v4", revision: 4, targetDurationMs: 630_000 }));
    const view = await render(
      <AppearanceProvider reduceMotion><RunningTargetSheet
        onClose={jest.fn()}
        runtime={{ createId: () => "request-1", loadPlan, saveRunningTarget: jest.fn(async () => { throw stale; }) } as never}
        sources={[source()]}
        todayLocalDate="2026-10-12"
        visible
      /></AppearanceProvider>,
    );

    await fireEvent.changeText(view.getByLabelText("Target time"), "10:45");
    await waitFor(() => expect(view.getByDisplayValue("10:45")).toBeTruthy());
    await fireEvent.press(view.getByText("Save target"));
    await waitFor(() => expect(view.getByText("Target changed since this sheet opened")).toBeTruthy());
    expect(view.getByDisplayValue("10:45")).toBeTruthy();
    await fireEvent.press(view.getByText("Reload target"));
    await waitFor(() => expect(loadPlan).toHaveBeenCalledWith("running-2point4"));
    expect(view.getByDisplayValue("10:45")).toBeTruthy();
  });

  it("keeps the current target and a stable retry receipt through a storage failure", async () => {
    const saveRunningTarget = jest.fn(async (_input: Record<string, unknown>): Promise<unknown> => undefined)
      .mockRejectedValueOnce(new Error("running_target_storage_failed"))
      .mockResolvedValueOnce({ outcome: "committed", plan: { ...source({ targetDurationMs: 645_000 }), revision: 5 } });
    const onSaved = jest.fn();
    const view = await render(
      <AppearanceProvider reduceMotion><RunningTargetSheet
        onClose={jest.fn()}
        onSaved={onSaved}
        runtime={{ createId: () => "retry-request", saveRunningTarget } as never}
        sources={[source()]}
        todayLocalDate="2026-10-12"
        visible
      /></AppearanceProvider>,
    );
    await fireEvent.changeText(view.getByLabelText("Target time"), "10:45");
    await fireEvent.press(view.getByText("Save target"));
    await waitFor(() => expect(view.getByText("Target was not saved")).toBeTruthy());
    expect(view.getByDisplayValue("10:45")).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    await fireEvent.press(view.getByText("Retry saving target"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(saveRunningTarget.mock.calls.map((args) => args[0]?.["requestId"])).toEqual(["retry-request", "retry-request"]);
  });

  it("discards on its explicit action without a mutation", async () => {
    const saveRunningTarget = jest.fn();
    const onClose = jest.fn();
    const view = await render(
      <AppearanceProvider reduceMotion><RunningTargetSheet
        onClose={onClose}
        runtime={{ createId: () => "request-1", saveRunningTarget } as never}
        sources={[source()]}
        todayLocalDate="2026-10-12"
        visible
      /></AppearanceProvider>,
    );
    await fireEvent.changeText(view.getByLabelText("Target time"), "10:45");
    await fireEvent.press(view.getByText("Discard target changes"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(saveRunningTarget).not.toHaveBeenCalled();
  });

  it("supports wrapped D-pad focus and Enter or Space activation for training days", async () => {
    const view = await render(
      <AppearanceProvider reduceMotion><RunningTargetSheet
        onClose={jest.fn()}
        runtime={{ createId: () => "request-1", saveRunningTarget: jest.fn() } as never}
        sources={[source()]}
        todayLocalDate="2026-10-12"
        visible
      /></AppearanceProvider>,
    );

    await fireEvent(view.getByLabelText("Monday"), "keyDown", {
      nativeEvent: { key: "ArrowRight", preventDefault: jest.fn() },
    });
    await waitFor(() => expect(view.getByLabelText("Tuesday"))
      .toHaveProp("hasTVPreferredFocus", true));
    await fireEvent(view.getByLabelText("Tuesday"), "keyDown", {
      nativeEvent: { key: " ", preventDefault: jest.fn() },
    });
    expect(view.getByLabelText("Tuesday")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ checked: true }),
    );
  });
});
