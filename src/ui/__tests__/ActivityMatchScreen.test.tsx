import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { BackHandler, StyleSheet } from "react-native";

import type {
  RunningActivityMatchCandidate,
  RunningActivityMatchReadResult,
  RunningActivityMatchResult,
} from "../../domains/running/activityMatchCommands";
import { ActivityMatchScreen } from "../screens/ActivityMatchScreen";
import { AppearanceProvider, createMemoryAppearanceStore, sizes } from "../theme";

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

const noopReloadMatchState = async (): Promise<void> => undefined;

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
          onReloadMatchState={noopReloadMatchState}
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
          onReloadMatchState={noopReloadMatchState}
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
    await act(async () => finishConfirm?.({ kind: "matched", activityId: alternateCandidate.activityId, opportunityId: alternateCandidate.opportunityId, relationRevision: 1 }));
    await waitFor(() => expect(screen.getByText("Matched")).toBeOnTheScreen());
  });

  it("blocks stale reconfirmation until retry loads a refreshed candidate revision", async () => {
    const staleResult = {
      kind: "conflict" as const,
      activityId: firstCandidate.activityId,
      opportunityId: firstCandidate.opportunityId,
      relationRevision: 1,
    };
    const onConfirm = jest.fn<(
      candidate: RunningActivityMatchCandidate,
    ) => Promise<RunningActivityMatchResult>>(async () => staleResult);
    const onRetry = jest.fn();
    const view = await render(
      <AppearanceProvider>
        <ActivityMatchScreen
          onBack={jest.fn()}
          onConfirm={onConfirm}
          onLeaveUnmatched={jest.fn()}
          onReloadMatchState={noopReloadMatchState}
          onRetry={onRetry}
          state={{ kind: "ready", activityId: firstCandidate.activityId, candidates: [firstCandidate] }}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Confirm match" }));
    expect(await screen.findByText("Match needs review")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Confirm match" })).toBeDisabled();

    await fireEvent.press(screen.getByRole("button", { name: "Retry scheduled workouts" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Match needs review")).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Confirm match" })).toBeDisabled();

    const refreshedCandidate = Object.freeze({
      ...firstCandidate,
      expectedOpportunityRevision: 2,
      expectedRelationRevision: 1,
      targetSummary: "35 min · easy Z2",
    });
    onConfirm.mockResolvedValueOnce({
      kind: "matched",
      activityId: refreshedCandidate.activityId,
      opportunityId: refreshedCandidate.opportunityId,
      relationRevision: 2,
    });
    await act(async () => {
      view.rerender(
        <AppearanceProvider>
          <ActivityMatchScreen
            onBack={jest.fn()}
            onConfirm={onConfirm}
            onLeaveUnmatched={jest.fn()}
            onReloadMatchState={noopReloadMatchState}
            onRetry={onRetry}
            state={{ kind: "ready", activityId: refreshedCandidate.activityId, candidates: [refreshedCandidate] }}
          />
        </AppearanceProvider>,
      );
    });

    await waitFor(() => expect(screen.getByText("35 min · easy Z2")).toBeOnTheScreen());
    expect(screen.getByRole("button", { name: "Confirm match" })).toBeEnabled();
    await fireEvent.press(screen.getByRole("button", { name: "Confirm match" }));
    await waitFor(() => expect(onConfirm).toHaveBeenLastCalledWith(refreshedCandidate));
  });

  it("preserves alternate selection through shared Appearance and gives modal Back priority", async () => {
    const remove = jest.fn();
    const addEventListener = jest.spyOn(BackHandler, "addEventListener").mockReturnValue({ remove });
    const appearanceStore = createMemoryAppearanceStore();
    const onBack = jest.fn();
    await render(
      <AppearanceProvider store={appearanceStore}>
        <ActivityMatchScreen
          onBack={onBack}
          onConfirm={jest.fn(async () => ({ kind: "conflict" as const, activityId: firstCandidate.activityId, opportunityId: firstCandidate.opportunityId, relationRevision: 0 }))}
          onLeaveUnmatched={jest.fn()}
          onReloadMatchState={noopReloadMatchState}
          onRetry={jest.fn()}
          state={{ kind: "ready", activityId: firstCandidate.activityId, candidates: [firstCandidate, alternateCandidate] }}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("radio", { name: /Intervals/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Appearance" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Dark" }));
    expect(appearanceStore.read()).toBe("Dark");
    const listener = addEventListener.mock.calls.at(-1)?.[1];
    await act(async () => {
      expect(listener?.(undefined as never)).toBe(true);
    });
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.queryByRole("radio", { name: "System" })).toBeNull();
    expect(screen.getByRole("radio", { name: /Intervals/ })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true }),
    );
    addEventListener.mockRestore();
  });

  it("reflows compact and expanded layouts with 48dp actions and visible focus", async () => {
    const rendered = await render(
      <AppearanceProvider>
        <ActivityMatchScreen
          onBack={jest.fn()}
          onConfirm={jest.fn(async () => ({ kind: "conflict" as const, activityId: firstCandidate.activityId, opportunityId: firstCandidate.opportunityId, relationRevision: 0 }))}
          onLeaveUnmatched={jest.fn()}
          onReloadMatchState={noopReloadMatchState}
          onRetry={jest.fn()}
          state={{ kind: "ready", activityId: firstCandidate.activityId, candidates: [firstCandidate] }}
          width={360}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByLabelText("compact layout")).toBeOnTheScreen();
    for (const name of ["Go back", "Appearance", "Confirm match", "Leave unmatched"]) {
      expect(StyleSheet.flatten(screen.getByRole("button", { name }).props.style).minHeight)
        .toBeGreaterThanOrEqual(sizes.minimumTarget);
    }
    const row = screen.getByTestId("activity-match-candidate-0");
    expect(row).toHaveStyle({ minHeight: sizes.minimumTarget, width: "100%" });
    await fireEvent(row, "focus");
    expect(row).toHaveStyle({ outlineWidth: sizes.focusRing });

    await rendered.rerender(
      <AppearanceProvider>
        <ActivityMatchScreen
          onBack={jest.fn()}
          onConfirm={jest.fn(async () => ({ kind: "conflict" as const, activityId: firstCandidate.activityId, opportunityId: firstCandidate.opportunityId, relationRevision: 0 }))}
          onLeaveUnmatched={jest.fn()}
            onReloadMatchState={noopReloadMatchState}
          onRetry={jest.fn()}
          state={{ kind: "ready", activityId: firstCandidate.activityId, candidates: [firstCandidate] }}
          width={840}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByLabelText("expanded layout")).toBeOnTheScreen();
    expect(screen.getByText(/Time not scheduled/)).toBeOnTheScreen();
  });

  it("keeps correction actions disabled until unmatch reloads authoritative candidates", async () => {
    const refreshedCandidate = Object.freeze({
      ...firstCandidate,
      expectedRelationRevision: 2,
      targetSummary: "35 min · authoritative Z2",
    });
    let finishReload: ((state: RunningActivityMatchReadResult) => void) | undefined;
    const loadMatchState = jest.fn(() => new Promise<RunningActivityMatchReadResult>((resolve) => {
      finishReload = resolve;
    }));
    const onUnmatch = jest.fn(async () => ({
      kind: "unmatched" as const,
      activityId: firstCandidate.activityId,
      opportunityId: firstCandidate.opportunityId,
      relationRevision: 2,
    }));
    const onConfirm = jest.fn(async () => ({
      kind: "matched" as const,
      activityId: refreshedCandidate.activityId,
      opportunityId: refreshedCandidate.opportunityId,
      relationRevision: 3,
    }));

    function Harness() {
      const [state, setState] = React.useState<React.ComponentProps<typeof ActivityMatchScreen>["state"]>({
        kind: "already_matched",
        activityId: firstCandidate.activityId,
        currentCandidate: firstCandidate,
        candidates: [alternateCandidate],
        opportunityId: firstCandidate.opportunityId,
        relationRevision: 1,
      });
      return (
        <ActivityMatchScreen
          onBack={jest.fn()}
          onConfirm={onConfirm}
          onLeaveUnmatched={jest.fn()}
          onReassign={jest.fn(async () => ({ kind: "conflict" as const, activityId: firstCandidate.activityId, opportunityId: alternateCandidate.opportunityId, relationRevision: 1 }))}
          onReloadMatchState={async () => setState(await loadMatchState())}
          onRetry={jest.fn()}
          onUnmatch={onUnmatch}
          state={state}
        />
      );
    }

    await render(
      <AppearanceProvider>
        <Harness />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Unmatch activity" }));
    await waitFor(() => expect(loadMatchState).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Unmatch activity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reassign match" })).toBeDisabled();
    expect(screen.getByText("30 min · easy Z2")).toBeOnTheScreen();

    await act(async () => finishReload?.({
      kind: "ready",
      activityId: refreshedCandidate.activityId,
      candidates: [refreshedCandidate],
    }));

    expect(await screen.findByText("Match removed")).toBeOnTheScreen();
    expect(screen.queryByText("Currently matched")).not.toBeOnTheScreen();
    expect(screen.getByText("35 min · authoritative Z2")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Confirm match" })).toBeEnabled();
    expect(onConfirm).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Confirm match" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(refreshedCandidate));
  });

  it("renders and uses the authoritative current relation after reassignment reloads", async () => {
    const refreshedCurrent = Object.freeze({
      ...alternateCandidate,
      expectedRelationRevision: 2,
      targetSummary: "8 × 400 m · authoritative relation",
    });
    const refreshedAlternative = Object.freeze({
      ...firstCandidate,
      expectedRelationRevision: 2,
      targetSummary: "32 min · refreshed alternative",
    });
    let finishReload: ((state: RunningActivityMatchReadResult) => void) | undefined;
    let loadCount = 0;
    const loadMatchState = jest.fn(() => {
      loadCount += 1;
      if (loadCount === 1) {
        return new Promise<RunningActivityMatchReadResult>((resolve) => {
          finishReload = resolve;
        });
      }
      return Promise.resolve<RunningActivityMatchReadResult>({
        kind: "ready",
        activityId: firstCandidate.activityId,
        candidates: [refreshedAlternative, refreshedCurrent],
      });
    });
    const onReassign = jest.fn(async () => ({
      kind: "reassigned" as const,
      activityId: firstCandidate.activityId,
      opportunityId: alternateCandidate.opportunityId,
      relationRevision: 2,
    }));
    const onUnmatch = jest.fn(async () => ({
      kind: "unmatched" as const,
      activityId: firstCandidate.activityId,
      opportunityId: alternateCandidate.opportunityId,
      relationRevision: 3,
    }));

    function Harness() {
      const [state, setState] = React.useState<React.ComponentProps<typeof ActivityMatchScreen>["state"]>({
        kind: "already_matched",
        activityId: firstCandidate.activityId,
        currentCandidate: firstCandidate,
        candidates: [alternateCandidate],
        opportunityId: firstCandidate.opportunityId,
        relationRevision: 1,
      });
      return (
        <ActivityMatchScreen
          onBack={jest.fn()}
          onConfirm={jest.fn(async () => ({ kind: "conflict" as const, activityId: firstCandidate.activityId, opportunityId: firstCandidate.opportunityId, relationRevision: 1 }))}
          onLeaveUnmatched={jest.fn()}
          onReassign={onReassign}
          onReloadMatchState={async () => setState(await loadMatchState())}
          onRetry={jest.fn()}
          onUnmatch={onUnmatch}
          state={state}
        />
      );
    }

    await render(
      <AppearanceProvider>
        <Harness />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Reassign match" }));
    await waitFor(() => expect(onReassign).toHaveBeenCalledWith({
      current: firstCandidate,
      next: alternateCandidate,
    }));
    await waitFor(() => expect(loadMatchState).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Unmatch activity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reassign match" })).toBeDisabled();

    await act(async () => finishReload?.({
      kind: "already_matched",
      activityId: firstCandidate.activityId,
      currentCandidate: refreshedCurrent,
      candidates: [refreshedAlternative],
      opportunityId: refreshedCurrent.opportunityId,
      relationRevision: 2,
    }));

    expect(await screen.findByText("Match reassigned")).toBeOnTheScreen();
    const currentRelation = screen.getByText("Currently matched").parent;
    expect(currentRelation).not.toBeNull();
    expect(within(currentRelation!).getByText("8 × 400 m · authoritative relation")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Unmatch activity" })).toBeEnabled();

    await fireEvent.press(screen.getByRole("button", { name: "Unmatch activity" }));
    await waitFor(() => expect(onUnmatch).toHaveBeenCalledWith(refreshedCurrent));
  });

  it.each([
    [{ kind: "loading" as const }, "Loading scheduled workouts"],
    [{ kind: "missing" as const, activityId: "activity-local-1" }, "Activity not found"],
    [{ kind: "projection_error" as const }, "Scheduled workouts unavailable"],
    [{ kind: "no_candidates" as const, activityId: "activity-local-1" }, "No scheduled workouts"],
    [{
      kind: "already_matched" as const,
      activityId: "activity-local-1",
      currentCandidate: firstCandidate,
      candidates: [],
      opportunityId: "opportunity-1",
      relationRevision: 1,
    }, "Already matched"],
  ])("renders the bounded %s state", async (state, expected) => {
    await render(
      <AppearanceProvider>
        <ActivityMatchScreen
          onBack={jest.fn()}
          onConfirm={jest.fn(async () => ({ kind: "conflict" as const, activityId: "activity-local-1", opportunityId: "opportunity-1", relationRevision: 0 }))}
          onLeaveUnmatched={jest.fn()}
          onReloadMatchState={noopReloadMatchState}
          onReassign={jest.fn(async () => ({ kind: "reassigned" as const, activityId: "activity-local-1", opportunityId: "opportunity-1", relationRevision: 1 }))}
          onRetry={jest.fn()}
          onUnmatch={jest.fn(async () => ({ kind: "unmatched" as const, activityId: "activity-local-1", opportunityId: "opportunity-1", relationRevision: 1 }))}
          state={state}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByText(expected)).toBeOnTheScreen();
  });
});
