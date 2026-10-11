import { act, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { Text } from "react-native";

import type { GarminActivitySourcePort } from "../../domains/activities/garminActivitySourcePort";
import {
  createGarminActivityAdapter,
  type GarminNativeDriver,
} from "../../platform/garmin/garminActivityAdapter";
import {
  type GarminActivityListItem,
  type GarminSyncControllerPort,
  type GarminSyncFailureCode,
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
    restoreSession: async () => overrides.connectionState?.() ?? ({ kind: "disconnected" }),
    login: async () => ({ kind: "disconnected" }),
    resumeMfa: async () => ({ kind: "disconnected" }),
    logout: async () => undefined,
    listRunningSummaries: async () => ({ items: [] }),
    readActivity: async () => { throw new Error("not used"); },
    ...overrides,
  };
}

function coordinator(): GarminSyncControllerPort {
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
  it("restores the native session on a fresh mount before treating the account as disconnected", async () => {
    const connectionState = jest.fn(async () => ({ kind: "disconnected" as const }));
    const restoreSession = jest.fn(async () => ({
      kind: "connected" as const,
      account_namespace: "private-account-namespace",
      generation: 7,
    }));

    await render(<Harness
      coordinator={coordinator()}
      loadActivities={async () => [activity]}
      source={{ ...source({ connectionState }), restoreSession }}
    />);

    await waitFor(() => expect(current?.state.connection).toBe("connected"));
    expect(restoreSession).toHaveBeenCalledTimes(1);
    expect(connectionState).not.toHaveBeenCalled();
    expect(current?.state.activities).toEqual([activity]);
  });

  it("keeps retained history visible when an encrypted session is missing or corrupt", async () => {
    const restoreError = Object.assign(new Error("sign_in_required"), {
      name: "GarminActivityAdapterError",
      code: "sign_in_required",
      retryable: false,
    });

    await render(<Harness
      coordinator={coordinator()}
      loadActivities={async () => [activity]}
      source={{
        ...source(),
        restoreSession: jest.fn(async () => Promise.reject(restoreError)),
      }}
    />);

    await waitFor(() => expect(current?.state.historyStatus).toBe("ready"));
    expect(current?.state).toMatchObject({
      connection: "disconnected",
      activities: [activity],
      error: { code: "sign_in_required", retryable: false },
    });
  });

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

  it("allows a second MFA code after the native continuation rejects the first code", async () => {
    const accountNamespace = "garmin:abcdefabcdefabcdefabcdefabcdefab";
    const resumeMfa = jest.fn<GarminNativeDriver["resumeMfa"]>()
      .mockResolvedValueOnce({ status: "error", error: { code: "mfa_expired" } })
      .mockResolvedValueOnce({
        status: "ok",
        generation: 1,
        data: { kind: "connected", account_namespace: accountNamespace },
      });
    const adapter = createGarminActivityAdapter({
      driver: {
        restoreSession: jest.fn(async () => ({
          status: "ok",
          generation: 0,
          data: { kind: "disconnected" },
        })),
        connectionState: jest.fn(async () => ({
          status: "ok",
          generation: 1,
          data: { kind: "mfa_required", challenge_handle: "opaque-challenge" },
        })),
        login: jest.fn(async () => ({
          status: "ok",
          generation: 1,
          data: { kind: "mfa_required", challenge_handle: "opaque-challenge" },
        })),
        resumeMfa,
        logout: jest.fn(async () => ({
          status: "ok",
          generation: 2,
          data: { kind: "disconnected" },
        })),
        getActivities: jest.fn(async () => ({ status: "error", error: { code: "operation_rejected" } })),
        getActivity: jest.fn(async () => ({ status: "error", error: { code: "operation_rejected" } })),
        getActivitySplits: jest.fn(async () => ({ status: "error", error: { code: "operation_rejected" } })),
        getActivityDetails: jest.fn(async () => ({ status: "error", error: { code: "operation_rejected" } })),
      },
      mapper: {
        fromActivity: async () => { throw new Error("not used"); },
      },
    });

    await render(<Harness
      coordinator={coordinator()}
      loadActivities={async () => [activity]}
      source={adapter}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("disconnected"));
    await act(async () => {
      current?.openCredentials();
      current?.setEmail("synthetic-owner@example.test");
      current?.setPassword("synthetic-secret");
    });
    await act(async () => current?.submitCredentials());
    await act(async () => current?.setMfaCode("000000"));
    await act(async () => current?.submitMfa());

    expect(current?.state).toMatchObject({
      connection: "mfa",
      error: { code: "mfa_expired" },
    });

    await act(async () => current?.setMfaCode("111111"));
    await act(async () => current?.submitMfa());
    expect(current?.state.connection).toBe("connected");
    expect(resumeMfa).toHaveBeenCalledTimes(2);
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

describe("useGarminConnectionController committed sync semantics", () => {
  it("loads the durable last successful sync independently from transient state", async () => {
    const lastSuccessfulSync = {
      attemptId: "garmin-sync:durable",
      completedAtMs: 123_000,
      counts: { ...emptyCounts, pages: 2, newActivities: 1, unchangedActivities: 3 },
    };
    await render(<Harness
      coordinator={coordinator()}
      loadActivities={async () => [activity]}
      loadLastSuccessfulSync={async () => lastSuccessfulSync}
      source={source({
        restoreSession: async () => ({
          kind: "connected",
          account_namespace: "private-account-namespace",
          generation: 1,
        }),
      })}
    />);

    await waitFor(() => expect(current?.state.historyStatus).toBe("ready"));
    expect(current?.state.lastSuccessfulSync).toEqual(lastSuccessfulSync);
    expect(current?.state.sync).toEqual({ kind: "idle" });
  });

  it("publishes bounded progress and reloads history only from a committed result", async () => {
    const refreshedActivity = Object.freeze({ ...activity, activityId: "local-activity-2", title: "Evening run" });
    const loadActivities = jest.fn<() => Promise<readonly GarminActivityListItem[]>>()
      .mockResolvedValueOnce([activity])
      .mockResolvedValueOnce([activity, refreshedActivity]);
    let release: ((value: Awaited<ReturnType<GarminSyncControllerPort["syncNow"]>>) => void) | undefined;
    const syncNow = jest.fn(async (options?: Parameters<GarminSyncControllerPort["syncNow"]>[0]) => {
      options?.onProgress?.({ kind: "page", counts: { ...emptyCounts, pages: 1, discoveredActivities: 2 } });
      return new Promise<Awaited<ReturnType<GarminSyncControllerPort["syncNow"]>>>((resolve) => { release = resolve; });
    });
    const saveLastSuccessfulSync = jest.fn(async () => undefined);
    await render(<Harness
      coordinator={{ syncNow }}
      loadActivities={loadActivities}
      now={() => 123_456}
      saveLastSuccessfulSync={saveLastSuccessfulSync}
      source={source({ connectionState: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }) })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("connected"));

    let first: Promise<void> | undefined;
    await act(async () => {
      first = current?.syncNow();
      void current?.syncNow();
      await Promise.resolve();
    });
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(loadActivities).toHaveBeenCalledTimes(1);
    expect(current?.state.sync).toMatchObject({
      kind: "syncing",
      progress: { kind: "page", counts: { pages: 1, discoveredActivities: 2 } },
    });

    await act(async () => {
      release?.({ kind: "success", counts: { ...emptyCounts, pages: 1, discoveredActivities: 2, attemptedActivities: 2, newActivities: 2 } });
      await first;
    });

    expect(loadActivities).toHaveBeenCalledTimes(2);
    expect(current?.state).toMatchObject({
      activities: [activity, refreshedActivity],
      lastSuccessfulSync: {
        attemptId: "garmin-sync:123456:1:2",
        completedAtMs: 123_456,
        counts: { newActivities: 2 },
      },
      sync: { kind: "success", counts: { newActivities: 2 }, completedAtMs: 123_456 },
    });
    expect(saveLastSuccessfulSync).toHaveBeenCalledWith(current?.state.lastSuccessfulSync);
  });

  it("keeps the prior durable receipt and fails closed when saving a newer success fails", async () => {
    const prior = Object.freeze({
      attemptId: "garmin-sync:1000:1:1",
      completedAtMs: 1_000,
      counts: { ...emptyCounts, pages: 1, discoveredActivities: 1, attemptedActivities: 1, unchangedActivities: 1 },
    });
    await render(<Harness
      coordinator={{
        syncNow: async () => ({
          kind: "success",
          counts: { ...emptyCounts, pages: 1, discoveredActivities: 1, attemptedActivities: 1, newActivities: 1 },
        }),
      }}
      loadActivities={async () => [activity]}
      loadLastSuccessfulSync={async () => prior}
      now={() => 2_000}
      saveLastSuccessfulSync={async () => { throw new Error("private storage detail"); }}
      source={source({
        restoreSession: async () => ({
          kind: "connected",
          account_namespace: "private-account-namespace",
          generation: 1,
        }),
      })}
    />);
    await waitFor(() => expect(current?.state).toMatchObject({
      connection: "connected",
      lastSuccessfulSync: prior,
    }));

    await act(async () => {
      await current?.syncNow();
    });
    await waitFor(() => expect(current?.state).toMatchObject({
      operation: "idle",
      lastSuccessfulSync: prior,
      sync: {
        kind: "failure",
        failure: { code: "temporary_failure", retryable: true },
      },
    }));
    expect(JSON.stringify(current?.state)).not.toContain("private storage detail");
  });

  const failureCases: ReadonlyArray<readonly [GarminSyncFailureCode, boolean]> = [
    ["offline", true],
    ["temporary_failure", true],
    ["sign_in_required", false],
    ["data_access_denied", false],
    ["rate_limited", true],
    ["timeout", true],
    ["malformed_response", false],
    ["stale_generation", false],
    ["date_confirmation_required", false],
  ];

  it.each(failureCases)("retains prior rows for %s without inventing committed counts", async (code, retryable) => {
    const failure = Object.freeze({
      code,
      retryable,
      ...(code === "rate_limited" ? { retryAfterMs: 9_999_999 } : {}),
    });
    await render(<Harness
      coordinator={{ syncNow: async () => ({ kind: "failure", counts: emptyCounts, failure }) }}
      loadActivities={async () => [activity]}
      source={source({ connectionState: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }) })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("connected"));
    await act(async () => current?.syncNow());

    expect(current?.state.activities).toEqual([activity]);
    expect(current?.state.sync).toMatchObject({
      kind: "failure",
      counts: emptyCounts,
      failure: { code, retryable },
    });
    if (code === "rate_limited" && current?.state.sync.kind === "failure") {
      expect(current.state.sync.failure.retryAfterMs).toBe(900_000);
    }
  });

  it("ignores a prior attempt's late progress after retry starts a new generation", async () => {
    const options: Array<Parameters<GarminSyncControllerPort["syncNow"]>[0]> = [];
    let releaseSecond: ((value: Awaited<ReturnType<GarminSyncControllerPort["syncNow"]>>) => void) | undefined;
    const syncNow = jest.fn(async (attemptOptions?: Parameters<GarminSyncControllerPort["syncNow"]>[0]) => {
      options.push(attemptOptions);
      if (options.length === 1) {
        return { kind: "failure" as const, counts: emptyCounts, failure: { code: "offline" as const, retryable: true } };
      }
      return new Promise<Awaited<ReturnType<GarminSyncControllerPort["syncNow"]>>>((resolve) => { releaseSecond = resolve; });
    });
    await render(<Harness
      coordinator={{ syncNow }}
      loadActivities={async () => [activity]}
      source={source({ connectionState: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }) })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("connected"));
    await act(async () => current?.syncNow());

    let retry: Promise<void> | undefined;
    await act(async () => {
      retry = current?.syncNow();
      await Promise.resolve();
    });
    await act(async () => {
      options[1]?.onProgress?.({ kind: "page", counts: { ...emptyCounts, pages: 2 } });
      options[0]?.onProgress?.({ kind: "page", counts: { ...emptyCounts, pages: 99 } });
    });
    expect(current?.state.sync).toMatchObject({ kind: "syncing", progress: { counts: { pages: 2 } } });

    await act(async () => {
      releaseSecond?.({ kind: "success", counts: { ...emptyCounts, pages: 2, newActivities: 1 } });
      await retry;
    });
    expect(current?.state.sync).toMatchObject({ kind: "success", counts: { pages: 2, newActivities: 1 } });
  });
});

describe("useGarminConnectionController disconnect semantics", () => {
  it("invalidates in-flight sync, latches duplicate disconnect, and retains imported history", async () => {
    let releaseSync: ((value: Awaited<ReturnType<GarminSyncControllerPort["syncNow"]>>) => void) | undefined;
    let releaseLogout: (() => void) | undefined;
    const syncNow = jest.fn(async () => new Promise<Awaited<ReturnType<GarminSyncControllerPort["syncNow"]>>>((resolve) => { releaseSync = resolve; }));
    const logout = jest.fn(async () => new Promise<void>((resolve) => { releaseLogout = resolve; }));
    const loadActivities = jest.fn(async () => [activity]);
    await render(<Harness
      coordinator={{ syncNow }}
      loadActivities={loadActivities}
      source={source({
        connectionState: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }),
        logout,
      })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("connected"));

    let pendingSync: Promise<void> | undefined;
    let disconnectOne: Promise<void> | undefined;
    let disconnectTwo: Promise<void> | undefined;
    await act(async () => {
      pendingSync = current?.syncNow();
      await Promise.resolve();
      disconnectOne = current?.disconnect();
      disconnectTwo = current?.disconnect();
      await Promise.resolve();
    });
    expect(logout).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseLogout?.();
      await Promise.all([disconnectOne, disconnectTwo]);
    });
    expect(current?.state).toMatchObject({
      connection: "disconnected",
      activities: [activity],
      sync: { kind: "idle" },
    });

    await act(async () => {
      releaseSync?.({ kind: "success", counts: { ...emptyCounts, newActivities: 3 } });
      await pendingSync;
    });
    expect(current?.state).toMatchObject({
      connection: "disconnected",
      activities: [activity],
      sync: { kind: "idle" },
    });
    expect(loadActivities).toHaveBeenCalledTimes(2);
  });

  it("keeps the connected state and imported rows when local logout fails", async () => {
    await render(<Harness
      coordinator={coordinator()}
      loadActivities={async () => [activity]}
      source={source({
        connectionState: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }),
        logout: async () => { throw new Error("private native detail"); },
      })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("connected"));
    await act(async () => current?.disconnect());

    expect(current?.state).toMatchObject({
      connection: "connected",
      activities: [activity],
      error: { code: "logout_failed", retryable: true },
    });
    expect(JSON.stringify(current?.state)).not.toContain("private native detail");
  });
});
