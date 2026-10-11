import { act, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { Text } from "react-native";

import type { GarminActivitySourcePort } from "../../domains/activities/garminActivitySourcePort";
import type { GarminSyncCoordinator } from "../../platform/garmin/garminSyncContracts";
import {
  type GarminActivityListItem,
  useGarminConnectionController,
} from "./useGarminConnectionController";

const activity: GarminActivityListItem = Object.freeze({
  activityId: "local-activity-1",
  title: "Morning run",
  activityType: "Running",
  confirmedLocalDate: "2026-10-10",
  summary: "5.0 km · 28 min",
  matchState: "unmatched",
  revisionState: "accepted",
});

const emptyCounts = Object.freeze({
  pages: 0,
  discoveredActivities: 0,
  attemptedActivities: 0,
  newActivities: 0,
  unchangedActivities: 0,
  reviewActivities: 0,
  failedActivities: 0,
});

function source(overrides: Partial<GarminActivitySourcePort> = {}): GarminActivitySourcePort {
  return {
    connectionState: async () => ({ kind: "disconnected" }),
    login: async () => ({ kind: "disconnected" }),
    resumeMfa: async () => ({ kind: "disconnected" }),
    logout: async () => undefined,
    listRunningSummaries: async () => ({ items: [] }),
    readActivity: async () => { throw new Error("not used"); },
    ...overrides,
  };
}

function coordinator(): GarminSyncCoordinator {
  return {
    syncNow: async () => ({ kind: "success", counts: emptyCounts }),
  };
}

let current: ReturnType<typeof useGarminConnectionController> | undefined;

function Harness(input: Parameters<typeof useGarminConnectionController>[0]) {
  current = useGarminConnectionController(input);
  return <Text testID="connection-state">{current.state.connection}</Text>;
}

describe("useGarminConnectionController connection tracer", () => {
  it("serializes credentials and MFA once while keeping secret inputs and handles out of snapshots", async () => {
    const secretMarker = ["opaque", "credential", "input"].join("-");
    const codeMarker = ["opaque", "verification", "input"].join("-");
    const login = jest.fn(async () => ({
      kind: "mfa_required" as const,
      challenge_handle: "opaque-continuation-handle-1234",
      generation: 4,
    }));
    const resumeMfa = jest.fn(async () => ({
      kind: "connected" as const,
      account_namespace: "private-account-namespace",
      generation: 5,
    }));
    const loadActivities = jest.fn(async () => [activity]);
    const clearPasswordInput = jest.fn();
    const clearMfaCodeInput = jest.fn();

    await render(<Harness
      clearMfaCodeInput={clearMfaCodeInput}
      clearPasswordInput={clearPasswordInput}
      coordinator={coordinator()}
      loadActivities={loadActivities}
      source={source({ login, resumeMfa })}
    />);

    await waitFor(() => expect(current?.state.connection).toBe("disconnected"));
    await act(async () => {
      current?.openCredentials();
    });
    await waitFor(() => expect(current?.state.connection).toBe("credentials"));
    await act(async () => {
      current?.setEmail("owner@example.test");
      current?.setPassword(secretMarker);
    });
    await waitFor(() => expect(current?.state.email).toBe("owner@example.test"));
    await act(async () => {
      await Promise.all([
        current?.submitCredentials(),
        current?.submitCredentials(),
      ]);
    });

    expect(login).toHaveBeenCalledTimes(1);
    expect(current?.state.connection).toBe("mfa");
    expect(clearPasswordInput).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(current?.state)).not.toContain(secretMarker);
    expect(JSON.stringify(current?.state)).not.toContain("opaque-continuation-handle-1234");
    expect(JSON.stringify(current?.state)).not.toContain("private-account-namespace");

    await act(async () => current?.setMfaCode(codeMarker));
    await act(async () => {
      await Promise.all([current?.submitMfa(), current?.submitMfa()]);
    });

    expect(resumeMfa).toHaveBeenCalledTimes(1);
    expect(clearMfaCodeInput).toHaveBeenCalledTimes(1);
    expect(current?.state).toMatchObject({
      connection: "connected",
      activities: [activity],
      historyStatus: "ready",
    });
    expect(JSON.stringify(current?.state)).not.toContain(codeMarker);
    expect(loadActivities).toHaveBeenCalledTimes(2);
  });

  it("cancels an MFA continuation through logout without syncing or dropping retained history", async () => {
    const logout = jest.fn(async () => undefined);
    const syncNow = jest.fn(async () => ({ kind: "success" as const, counts: emptyCounts }));

    await render(<Harness
      coordinator={{ syncNow }}
      loadActivities={async () => [activity]}
      source={source({
        connectionState: async () => ({
          kind: "mfa_required",
          challenge_handle: "opaque-continuation-handle-5678",
          generation: 2,
        }),
        logout,
      })}
    />);

    await waitFor(() => expect(current?.state.connection).toBe("mfa"));
    await act(async () => current?.cancelConnection());

    expect(logout).toHaveBeenCalledTimes(1);
    expect(syncNow).not.toHaveBeenCalled();
    expect(current?.state).toMatchObject({
      connection: "disconnected",
      activities: [activity],
    });
  });
});
