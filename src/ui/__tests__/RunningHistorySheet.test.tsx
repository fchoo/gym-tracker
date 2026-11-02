import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { ProgressRunningGoal } from "../../domains/progress/contracts";
import { RunningHistorySheet } from "../components/RunningHistorySheet";
import { AppearanceProvider } from "../theme";

const goal: ProgressRunningGoal = Object.freeze({
  best: Object.freeze({ activityId: "activity-september", sourceIdentity: "accepted-activity-september", sourceRevision: 4, localDate: "2026-09-04", durationSeconds: 654, timeBasis: "elapsed", evidence: "source_laps" }),
  distanceMeters: 2_400,
  evidenceCount: 2,
  gap: "Gap · 6 seconds ahead of target",
  latest: Object.freeze({ activityId: "activity-september", sourceIdentity: "accepted-activity-september", sourceRevision: 4, localDate: "2026-09-04", durationSeconds: 654, timeBasis: "elapsed", evidence: "source_laps" }),
  target: Object.freeze({ targetId: "running-2.4", durationSeconds: 660 }),
  targetAtDate: Object.freeze({ targetId: "running-2.4", durationSeconds: 660 }),
  timeBasis: "elapsed",
  pacing: Object.freeze({ target: "11:00", pacePerKm: "4:35/km", per400m: "1:50/400 m", per200m: "0:55/200 m" }),
  history: Object.freeze([
    Object.freeze({ effort: Object.freeze({ activityId: "activity-august", sourceIdentity: "accepted-activity-august", sourceRevision: 3, localDate: "2026-08-04", durationSeconds: 726, timeBasis: "elapsed", evidence: "source_summary" }), targetAtDate: Object.freeze({ targetId: "running-2.4", durationSeconds: 720 }) }),
    Object.freeze({ effort: Object.freeze({ activityId: "activity-september", sourceIdentity: "accepted-activity-september", sourceRevision: 4, localDate: "2026-09-04", durationSeconds: 654, timeBasis: "elapsed", evidence: "source_laps" }), targetAtDate: Object.freeze({ targetId: "running-2.4", durationSeconds: 660 }) }),
  ]),
});

describe("RunningHistorySheet", () => {
  it("presents one accepted same-distance history with a non-mutating close and source revision action", async () => {
    const onClose = jest.fn();
    const onOpenSource = jest.fn();
    const rendered = await render(<AppearanceProvider><RunningHistorySheet goal={goal} onClose={onClose} onOpenSource={onOpenSource} rangeLabel="All time" visible /></AppearanceProvider>);

    expect(rendered.getByText("2.4 km best efforts")).toBeTruthy();
    expect(rendered.getByText("Best efforts compare elapsed time at the same distance. Faster is lower on the clock.")).toBeTruthy();
    expect(rendered.getAllByText("Best")[0]).toBeTruthy();
    expect(rendered.getAllByText("10:54")[0]).toHaveStyle({ fontFamily: "IBMPlexMono_400Regular", fontSize: 20, fontWeight: "400" });
    expect(rendered.getAllByText("Target")[0]).toBeTruthy();
    expect(rendered.getAllByText("11:00")[0]).toBeTruthy();

    await fireEvent.press(rendered.getByRole("button", { name: "Show history data" }));
    await fireEvent.press(rendered.getAllByRole("button", { name: "Open source" })[1]!);
    expect(onOpenSource).toHaveBeenCalledWith({ activityId: "activity-september", sourceRevision: 4 });

    await fireEvent.press(rendered.getByLabelText("Close 2.4 km best efforts"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("preserves a persisted target in no-effort state and makes retry a full 48dp action", async () => {
    const noEffortGoal: ProgressRunningGoal = Object.freeze({ ...goal, history: Object.freeze([]) });
    const empty = await render(<AppearanceProvider><RunningHistorySheet goal={noEffortGoal} onClose={jest.fn()} rangeLabel="All time" visible /></AppearanceProvider>);
    expect(empty.getAllByText("No effort recorded")[0]).toBeTruthy();
    expect(empty.getByText("Target")).toBeTruthy();
    expect(empty.getByText("11:00")).toBeTruthy();

    const retry = jest.fn();
    const failed = await render(<AppearanceProvider><RunningHistorySheet goal={goal} onClose={jest.fn()} onRetry={retry} rangeLabel="All time" state="source_error" visible /></AppearanceProvider>);
    const retryAction = failed.getByRole("button", { name: "Retry history" });
    expect(retryAction).toHaveStyle({ minHeight: 48 });
    await fireEvent.press(retryAction);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("suppresses stale final values while rebuilding and restores the invoking focus on cancellation", async () => {
    const focus = jest.fn();
    const restoreFocusRef = { current: { focus } as never };
    const onClose = jest.fn();
    const rendered = await render(<AppearanceProvider><RunningHistorySheet goal={goal} onClose={onClose} rangeLabel="All time" restoreFocusRef={restoreFocusRef} state="rebuilding" visible /></AppearanceProvider>);
    expect(rendered.getByText("Updating progress")).toBeTruthy();
    expect(rendered.queryByText("10:54")).toBeNull();
    expect(rendered.queryByRole("button", { name: "Open source" })).toBeNull();

    await fireEvent.press(rendered.getByLabelText("Close 2.4 km best efforts"));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(focus).toHaveBeenCalledTimes(1));
  });
});
