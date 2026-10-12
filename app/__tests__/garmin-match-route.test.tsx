import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type {
  RunningActivityMatchCandidate,
  RunningActivityMatchReadResult,
  RunningActivityMatchResult,
} from "../../src/domains/running/activityMatchCommands";
import { AppearanceProvider } from "../../src/ui/theme";

const mockBack = jest.fn();
const mockLoadRunningActivityMatch = jest.fn<(activityId: string) => Promise<RunningActivityMatchReadResult>>();
const mockConfirmActivityMatch = jest.fn<(candidate: RunningActivityMatchCandidate) => Promise<RunningActivityMatchResult>>();
const mockReassignActivityMatch = jest.fn<(input: Readonly<{ current: RunningActivityMatchCandidate; next: RunningActivityMatchCandidate }>) => Promise<RunningActivityMatchResult>>();
const mockUnmatchActivityMatch = jest.fn<(candidate: RunningActivityMatchCandidate) => Promise<RunningActivityMatchResult>>();
let mockParams: Readonly<{ activityId?: string | readonly string[]; origin?: string | readonly string[] }> = {};
let mockShellProps: Readonly<Record<string, unknown>> = {};
let pendingLoads: Array<Readonly<{
  resolve(result: RunningActivityMatchReadResult): void;
  reject(error: Error): void;
}>> = [];

jest.mock("expo-router", () => ({
  router: { back: (...args: readonly unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    loadRunningActivityMatch: mockLoadRunningActivityMatch,
    confirmActivityMatch: mockConfirmActivityMatch,
    reassignActivityMatch: mockReassignActivityMatch,
    unmatchActivityMatch: mockUnmatchActivityMatch,
  }),
}));

jest.mock("../../src/ui/garmin/GarminRouteShell", () => ({
  GarminRouteShell: (props: Readonly<Record<string, unknown>>) => {
    const ReactModule = require("react") as typeof import("react");
    const { View: MockView } = require("react-native") as typeof import("react-native");
    mockShellProps = props;
    return ReactModule.createElement(
      MockView,
      { testID: "garmin-route-shell" },
      props.children as React.ReactNode,
    );
  },
}));

import ActivityMatchRoute, { createActivityMatchHref } from "../garmin/match/[activityId]";

const candidate = (ordinal: number): RunningActivityMatchCandidate => Object.freeze({
  activityId: "activity-local-01",
  expectedActivityRevision: 2,
  expectedAcceptedPayloadSha256: "a".repeat(64),
  opportunityId: `opportunity-${ordinal}`,
  expectedOpportunityRevision: 1,
  planId: "running-plan-1",
  planName: "5K plan",
  scheduleId: "running-schedule-1",
  scheduleVersionId: "running-version-2",
  expectedScheduleRevision: 2,
  planDayId: "running-anchor-1",
  expectedPlanDayRevision: 1,
  slotId: `running-slot-${ordinal}`,
  slotRevisionId: `running-slot-${ordinal}:revision:1`,
  expectedSlotRevision: 1,
  slotOrdinal: ordinal,
  sessionRevisionId: `running-session-${ordinal}`,
  expectedSessionRevision: 1,
  sessionKind: ordinal === 0 ? "recovery" : "intervals",
  localDate: "2026-10-12",
  localTime: null,
  timezone: "Asia/Singapore",
  targetSummary: ordinal === 0 ? "30 min · Z2" : "6 × 400 m · 2 min recovery",
  state: "planned",
  expectedRelationRevision: 0,
});

async function renderRoute() {
  return render(<AppearanceProvider><ActivityMatchRoute /></AppearanceProvider>);
}

async function settleLoad(result: RunningActivityMatchReadResult) {
  const pending = pendingLoads.shift();
  if (pending === undefined) throw new Error("missing_pending_match_load");
  await act(async () => pending.resolve(result));
}

describe("ActivityMatchRoute local identity boundary", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockLoadRunningActivityMatch.mockReset();
    mockConfirmActivityMatch.mockReset();
    mockReassignActivityMatch.mockReset();
    mockUnmatchActivityMatch.mockReset();
    mockParams = { activityId: "activity-local-01", origin: "progress" };
    mockShellProps = {};
    pendingLoads = [];
    mockLoadRunningActivityMatch.mockImplementation(() => new Promise((resolve, reject) => {
      pendingLoads.push({ resolve, reject });
    }));
    mockConfirmActivityMatch.mockResolvedValue({
      kind: "matched",
      activityId: "activity-local-01",
      opportunityId: "opportunity-1",
      relationRevision: 1,
    });
    mockReassignActivityMatch.mockResolvedValue({
      kind: "reassigned",
      activityId: "activity-local-01",
      opportunityId: "opportunity-1",
      relationRevision: 2,
    });
    mockUnmatchActivityMatch.mockResolvedValue({
      kind: "unmatched",
      activityId: "activity-local-01",
      opportunityId: "opportunity-0",
      relationRevision: 2,
    });
  });

  it("loads one local activity and confirms the exact alternate stable candidate", async () => {
    await renderRoute();
    expect(screen.getByTestId("garmin-route-shell")).toBeTruthy();
    expect(mockShellProps.origin).toBe("progress");
    await waitFor(() => expect(mockLoadRunningActivityMatch).toHaveBeenCalledWith("activity-local-01"));
    const candidates = [candidate(0), candidate(1)];
    await settleLoad({ kind: "ready", activityId: "activity-local-01", candidates });

    await fireEvent.press(screen.getByRole("radio", { name: /Intervals/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Confirm match" }));

    await waitFor(() => expect(mockConfirmActivityMatch).toHaveBeenCalledTimes(1));
    expect(mockConfirmActivityMatch).toHaveBeenCalledWith(candidates[1]);
  });

  it.each([
    "987654321",
    "garmin-987654321",
    "external_activity_id:987654321",
    "activity local 01",
    `activity-${"x".repeat(129)}`,
  ])("rejects provider-facing or malformed route identity %s without fallback", async (activityId) => {
    mockParams = { activityId };
    await renderRoute();

    expect(await screen.findByText("Activity not found")).toBeOnTheScreen();
    expect(mockLoadRunningActivityMatch).not.toHaveBeenCalled();
    expect(mockConfirmActivityMatch).not.toHaveBeenCalled();
  });

  it("returns from Back and Leave unmatched without calling the command", async () => {
    await renderRoute();
    await settleLoad({ kind: "ready", activityId: "activity-local-01", candidates: [candidate(0)] });

    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    await fireEvent.press(screen.getByRole("button", { name: "Leave unmatched" }));

    expect(mockBack).toHaveBeenCalledTimes(2);
    expect(mockConfirmActivityMatch).not.toHaveBeenCalled();
  });

  it("reloads stale candidates before allowing a second confirmation", async () => {
    mockConfirmActivityMatch.mockResolvedValueOnce({
      kind: "conflict",
      activityId: "activity-local-01",
      opportunityId: "opportunity-0",
      relationRevision: 1,
    });
    await renderRoute();
    const initial = candidate(0);
    await settleLoad({ kind: "ready", activityId: "activity-local-01", candidates: [initial] });

    await fireEvent.press(screen.getByRole("button", { name: "Confirm match" }));
    expect(await screen.findByText("Match needs review")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Retry scheduled workouts" }));

    expect(await screen.findByText("Loading scheduled workouts")).toBeOnTheScreen();
    expect(mockLoadRunningActivityMatch).toHaveBeenCalledTimes(2);
    const refreshed = Object.freeze({
      ...initial,
      expectedOpportunityRevision: 2,
      expectedRelationRevision: 1,
      targetSummary: "35 min · Z2",
    });
    await settleLoad({ kind: "ready", activityId: "activity-local-01", candidates: [refreshed] });

    expect(await screen.findByText("35 min · Z2")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Confirm match" })).toBeEnabled();
    await fireEvent.press(screen.getByRole("button", { name: "Confirm match" }));
    await waitFor(() => expect(mockConfirmActivityMatch).toHaveBeenLastCalledWith(refreshed));
  });

  it("reloads authoritative match state after unmatching", async () => {
    await renderRoute();
    await settleLoad({
      kind: "already_matched",
      activityId: "activity-local-01",
      currentCandidate: candidate(0),
      candidates: [candidate(1)],
      opportunityId: "opportunity-0",
      relationRevision: 1,
    });

    await fireEvent.press(screen.getByRole("button", { name: "Unmatch activity" }));
    await waitFor(() => expect(mockUnmatchActivityMatch).toHaveBeenCalledWith(candidate(0)));
    await waitFor(() => expect(mockLoadRunningActivityMatch).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Unmatch activity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reassign match" })).toBeDisabled();

    const refreshedCandidate = Object.freeze({
      ...candidate(0),
      expectedRelationRevision: 2,
      targetSummary: "35 min · authoritative Z2",
    });
    await settleLoad({
      kind: "ready",
      activityId: "activity-local-01",
      candidates: [refreshedCandidate],
    });

    expect(await screen.findByText("Match removed")).toBeOnTheScreen();
    expect(screen.queryByText("Currently matched")).not.toBeOnTheScreen();
    expect(screen.getByText("35 min · authoritative Z2")).toBeOnTheScreen();
  });

  it("reloads and renders the authoritative relation after reassignment", async () => {
    await renderRoute();
    await settleLoad({
      kind: "already_matched",
      activityId: "activity-local-01",
      currentCandidate: candidate(0),
      candidates: [candidate(1)],
      opportunityId: "opportunity-0",
      relationRevision: 1,
    });

    await fireEvent.press(screen.getByRole("button", { name: "Reassign match" }));
    await waitFor(() => expect(mockReassignActivityMatch).toHaveBeenCalledWith({
      current: candidate(0),
      next: candidate(1),
    }));
    await waitFor(() => expect(mockLoadRunningActivityMatch).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Unmatch activity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reassign match" })).toBeDisabled();

    const refreshedCurrent = Object.freeze({
      ...candidate(1),
      expectedRelationRevision: 2,
      targetSummary: "Authoritative reassigned interval",
    });
    await settleLoad({
      kind: "already_matched",
      activityId: "activity-local-01",
      currentCandidate: refreshedCurrent,
      candidates: [Object.freeze({ ...candidate(0), expectedRelationRevision: 2 })],
      opportunityId: refreshedCurrent.opportunityId,
      relationRevision: 2,
    });

    expect(await screen.findByText("Match reassigned")).toBeOnTheScreen();
    expect(screen.getByText("Authoritative reassigned interval")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Unmatch activity" })).toBeEnabled();
  });
});

describe("createActivityMatchHref", () => {
  it("publishes only an opaque local activity ID", () => {
    expect(createActivityMatchHref("activity-local-01")).toEqual({
      pathname: "/garmin/match/[activityId]",
      params: { activityId: "activity-local-01" },
    });
    expect(() => createActivityMatchHref("external_activity_id:987654321")).toThrow("activity_match_route_invalid");
  });
});
