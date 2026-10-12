import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { ProgressRunningGoal } from "../../domains/progress/contracts";
import { RunningHistorySheet } from "../components/RunningHistorySheet";
import { AppearanceProvider } from "../theme";

const goal: ProgressRunningGoal = Object.freeze({
  best: Object.freeze({ activityId: "activity-september", sourceIdentity: "accepted-activity-september", sourceRevision: 4, localDate: "2026-09-04", durationSeconds: 654, timeBasis: "elapsed", evidence: "source_laps" }),
  distanceMeters: 2_400,
  evidenceCount: 2,
  latest: Object.freeze({ activityId: "activity-september", sourceIdentity: "accepted-activity-september", sourceRevision: 4, localDate: "2026-09-04", durationSeconds: 654, timeBasis: "elapsed", evidence: "source_laps" }),
  target: Object.freeze({ targetId: "running-2.4", durationSeconds: 660 }),
  targetAtDate: Object.freeze({ targetId: "running-2.4", durationSeconds: 660 }),
  timeBasis: "elapsed",
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
    expect(rendered.getAllByText("10:54")[0]).toBeTruthy();
    expect(rendered.getAllByText("Target")[0]).toBeTruthy();
    expect(rendered.getAllByText("11:00")[0]).toBeTruthy();

    await fireEvent.press(rendered.getByRole("button", { name: "Show history data" }));
    await fireEvent.press(rendered.getAllByRole("button", { name: "Open source" })[1]!);
    expect(onOpenSource).toHaveBeenCalledWith({ activityId: "activity-september", sourceRevision: 4 });

    await fireEvent.press(rendered.getByLabelText("Close 2.4 km best efforts"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
