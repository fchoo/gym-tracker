import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { RunningActivityMatchCandidate } from "../../domains/running/activityMatchCommands";
import { ActivityMatchScreen } from "../screens/ActivityMatchScreen";
import { AppearanceProvider } from "../theme";

const firstCandidate: RunningActivityMatchCandidate = Object.freeze({
  activityId: "activity-local-1",
  expectedActivityRevision: 2,
  expectedAcceptedPayloadSha256: "a".repeat(64),
  opportunityId: "opportunity-monday-1",
  expectedOpportunityRevision: 1,
  planId: "running-plan-1",
  planName: "5K plan",
  scheduleId: "running-schedule-1",
  scheduleVersionId: "running-schedule-version-2",
  expectedScheduleRevision: 2,
  planDayId: "running-anchor-1",
  expectedPlanDayRevision: 1,
  slotId: "running-slot-root-1",
  slotRevisionId: "running-slot-root-1:revision:2",
  expectedSlotRevision: 2,
  slotOrdinal: 0,
  sessionRevisionId: "running-session-revision-4",
  expectedSessionRevision: 4,
  sessionKind: "recovery",
  localDate: "2026-10-12",
  localTime: null,
  timezone: "Asia/Singapore",
  targetSummary: "30 min · easy Z2",
  state: "planned",
  expectedRelationRevision: 0,
});

const alternateCandidate: RunningActivityMatchCandidate = Object.freeze({
  ...firstCandidate,
  opportunityId: "opportunity-monday-2",
  slotId: "running-slot-root-2",
  slotRevisionId: "running-slot-root-2:revision:1",
  expectedSlotRevision: 1,
  slotOrdinal: 1,
  sessionRevisionId: "running-session-revision-5",
  expectedSessionRevision: 5,
  sessionKind: "intervals",
  targetSummary: "6 × 400 m · recovery 2 min · 4:35 / km",
});

describe("ActivityMatchScreen confirmation boundary", () => {
  it("keeps ranked and alternate selection local until Confirm sends the exact selected envelope", async () => {
    const onConfirm = jest.fn(async () => ({
      kind: "matched" as const,
      activityId: alternateCandidate.activityId,
      opportunityId: alternateCandidate.opportunityId,
      relationRevision: 1,
    }));
    await render(
      <AppearanceProvider>
        <ActivityMatchScreen
          onBack={jest.fn()}
          onConfirm={onConfirm}
          onLeaveUnmatched={jest.fn()}
          onRetry={jest.fn()}
          state={{
            kind: "ready",
            activityId: firstCandidate.activityId,
            candidates: [firstCandidate, alternateCandidate],
          }}
        />
      </AppearanceProvider>,
    );

    expect(onConfirm).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("radio", { name: /Intervals/ }));
    expect(onConfirm).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Confirm match" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith(alternateCandidate);
    expect(await screen.findByText("Matched")).toBeOnTheScreen();
  });

  it("keeps Back, Leave unmatched, radio changes, and duplicate activation write-free", async () => {
    let finishConfirm: ((value: { kind: "matched"; activityId: string; opportunityId: string; relationRevision: number }) => void) | undefined;
    const onConfirm = jest.fn(() => new Promise<{ kind: "matched"; activityId: string; opportunityId: string; relationRevision: number }>((resolve) => {
      finishConfirm = resolve;
    }));
    const onBack = jest.fn();
    const onLeaveUnmatched = jest.fn();
    await render(
      <AppearanceProvider>
        <ActivityMatchScreen
          onBack={onBack}
          onConfirm={onConfirm}
          onLeaveUnmatched={onLeaveUnmatched}
          onRetry={jest.fn()}
          state={{ kind: "ready", activityId: firstCandidate.activityId, candidates: [firstCandidate, alternateCandidate] }}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("radio", { name: /Intervals/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    await fireEvent.press(screen.getByRole("button", { name: "Leave unmatched" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onLeaveUnmatched).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    const confirm = screen.getByRole("button", { name: "Confirm match" });
    await fireEvent.press(confirm);
    await fireEvent.press(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    finishConfirm?.({ kind: "matched", activityId: alternateCandidate.activityId, opportunityId: alternateCandidate.opportunityId, relationRevision: 1 });
    await waitFor(() => expect(screen.getByText("Matched")).toBeOnTheScreen());
  });
});
