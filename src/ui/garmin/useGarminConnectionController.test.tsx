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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

let current: ReturnType<typeof useGarminConnectionController> | undefined;

function Harness(input: Parameters<typeof useGarminConnectionController>[0]) {
  current = useGarminConnectionController(input);
  return <Text testID="connection-state">{current.state.connection}</Text>;
}

describe("useGarminConnectionController connection tracer", () => {
  it.each([
    [new Error("private restore detail"), { code: "temporary_failure", retryable: true }],
    [Object.assign(new Error("private code"), { name: "GarminActivityAdapterError", code: "unknown" }), { code: "temporary_failure", retryable: true }],
    [Object.assign(new Error("private throttle"), { name: "GarminActivityAdapterError", code: "rate_limited", retryAfterMs: 1 }), { code: "rate_limited", retryable: true, retryAfterMs: 1_000 }],
    [Object.assign(new Error("private malformed retry"), { name: "GarminActivityAdapterError", code: "rate_limited", retryAfterMs: -1 }), { code: "rate_limited", retryable: true }],
  ])("maps a restore boundary failure without exposing details", async (failure, expected) => {
    await render(<Harness
      coordinator={coordinator()}
      loadActivities={async () => []}
      source={source({ restoreSession: async () => Promise.reject(failure) })}
    />);
    await waitFor(() => expect(current?.state.error).toEqual(expected));
    expect(JSON.stringify(current?.state)).not.toMatch(/private/u);
    await act(async () => current?.clearError());
    expect(current?.state.error).toBeNull();
  });

  it("rejects empty credentials and exposes a disconnected login result truthfully", async () => {
    const login = jest.fn(async () => ({ kind: "disconnected" as const }));
    const clearPasswordInput = jest.fn();
    await render(<Harness
      clearPasswordInput={clearPasswordInput}
      coordinator={coordinator()}
      loadActivities={async () => []}
      source={source({ login })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("disconnected"));
    await act(async () => current?.openCredentials());
    await act(async () => current?.submitCredentials());
    expect(current?.state.error).toMatchObject({ code: "invalid_credentials" });
    expect(login).not.toHaveBeenCalled();

    await act(async () => {
      current?.setEmail("owner@example.test");
      current?.setPassword("synthetic-secret");
    });
    await act(async () => current?.submitCredentials());
    expect(current?.state).toMatchObject({
      connection: "disconnected",
      operation: "idle",
      error: { code: "sign_in_required" },
    });
    expect(clearPasswordInput).toHaveBeenCalledTimes(2);
  });

  it("clears a prior history error after a connected login reload succeeds", async () => {
    const loadActivities = jest.fn<() => Promise<readonly GarminActivityListItem[]>>()
      .mockRejectedValueOnce(new Error("private history failure"))
      .mockResolvedValueOnce([activity]);
    await render(<Harness
      coordinator={coordinator()}
      loadActivities={loadActivities}
      source={source({ login: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }) })}
    />);
    await waitFor(() => expect(current?.state.error).toMatchObject({ code: "history_unavailable" }));
    await act(async () => {
      current?.openCredentials();
      current?.setEmail("owner@example.test");
      current?.setPassword("synthetic-secret");
    });
    await act(async () => current?.submitCredentials());
    expect(current?.state).toMatchObject({ connection: "connected", historyStatus: "ready", error: null });
  });

  it("ignores a late login completion after cancellation and latches the credential controls", async () => {
    const login = deferred<Awaited<ReturnType<GarminActivitySourcePort["login"]>>>();
    const logout = jest.fn(async () => undefined);
    await render(<Harness
      coordinator={coordinator()}
      loadActivities={async () => []}
      source={source({ login: () => login.promise, logout })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("disconnected"));
    await act(async () => {
      current?.openCredentials();
      current?.setEmail("owner@example.test");
      current?.setPassword("synthetic-secret");
    });
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = current?.submitCredentials();
      await Promise.resolve();
      current?.openCredentials();
    });
    expect(current?.state.operation).toBe("connecting");
    await act(async () => current?.cancelConnection());
    await act(async () => {
      login.resolve({ kind: "connected", account_namespace: "private-account-namespace", generation: 2 });
      await pending;
    });
    expect(logout).toHaveBeenCalledTimes(1);
    expect(current?.state.connection).toBe("disconnected");
  });

  it("ignores startup completions after unmount", async () => {
    const restore = deferred<Awaited<ReturnType<GarminActivitySourcePort["restoreSession"]>>>();
    const history = deferred<readonly GarminActivityListItem[]>();
    const summary = deferred<null>();
    const view = await render(<Harness
      coordinator={coordinator()}
      loadActivities={() => history.promise}
      loadLastSuccessfulSync={() => summary.promise}
      source={source({ restoreSession: () => restore.promise })}
    />);
    await view.unmount();
    await act(async () => {
      restore.resolve({ kind: "disconnected" });
      history.resolve([]);
      summary.resolve(null);
      await Promise.all([restore.promise, history.promise, summary.promise]);
    });

    const failedRestore = deferred<Awaited<ReturnType<GarminActivitySourcePort["restoreSession"]>>>();
    const failedHistory = deferred<readonly GarminActivityListItem[]>();
    const failedSummary = deferred<null>();
    const failedView = await render(<Harness
      coordinator={coordinator()}
      loadActivities={() => failedHistory.promise}
      loadLastSuccessfulSync={() => failedSummary.promise}
      source={source({ restoreSession: () => failedRestore.promise })}
    />);
    await failedView.unmount();
    await act(async () => {
      failedRestore.reject(new Error("private restore"));
      failedHistory.reject(new Error("private history"));
      failedSummary.reject(new Error("private summary"));
      await Promise.allSettled([failedRestore.promise, failedHistory.promise, failedSummary.promise]);
    });
  });
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

  it("requires an MFA code and preserves a retryable challenge after a transient failure", async () => {
    const resumeMfa = jest.fn(async () => { throw new Error("private transient failure"); });
    await render(<Harness
      coordinator={coordinator()}
      loadActivities={async () => []}
      source={source({
        restoreSession: async () => ({ kind: "mfa_required", challenge_handle: "opaque-challenge", generation: 1 }),
        resumeMfa,
      })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("mfa"));
    await act(async () => current?.submitMfa());
    expect(current?.state.error).toMatchObject({ code: "mfa_expired" });
    expect(resumeMfa).not.toHaveBeenCalled();
    await act(async () => current?.setMfaCode("123456"));
    await act(async () => current?.submitMfa());
    expect(current?.state).toMatchObject({ connection: "mfa", error: { code: "temporary_failure" } });
  });

  it("reports an expired MFA flow when the source returns disconnected", async () => {
    await render(<Harness
      coordinator={coordinator()}
      loadActivities={async () => []}
      source={source({
        restoreSession: async () => ({ kind: "mfa_required", challenge_handle: "opaque-challenge", generation: 1 }),
        resumeMfa: async () => ({ kind: "disconnected" }),
      })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("mfa"));
    await act(async () => current?.setMfaCode("123456"));
    await act(async () => current?.submitMfa());
    expect(current?.state).toMatchObject({ connection: "disconnected", error: { code: "mfa_expired" } });
  });

  it.each(["resolve", "reject"] as const)("ignores a late MFA %s after cancellation", async (outcome) => {
    const continuation = deferred<Awaited<ReturnType<GarminActivitySourcePort["resumeMfa"]>>>();
    await render(<Harness
      coordinator={coordinator()}
      loadActivities={async () => []}
      source={source({
        restoreSession: async () => ({ kind: "mfa_required", challenge_handle: "opaque-challenge", generation: 1 }),
        resumeMfa: () => continuation.promise,
      })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("mfa"));
    await act(async () => current?.setMfaCode("123456"));
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = current?.submitMfa();
      await Promise.resolve();
    });
    await act(async () => current?.cancelConnection());
    await act(async () => {
      if (outcome === "resolve") {
        continuation.resolve({ kind: "connected", account_namespace: "private-account-namespace", generation: 2 });
      } else {
        continuation.reject(new Error("private late MFA error"));
      }
      await pending;
    });
    expect(current?.state.connection).toBe("disconnected");
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

  it("maps a current credential failure and allows idle cancellation without native logout", async () => {
    const logout = jest.fn(async () => undefined);
    await render(<Harness
      coordinator={coordinator()}
      loadActivities={async () => []}
      source={source({
        login: async () => { throw new Error("private login failure"); },
        logout,
      })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("disconnected"));
    await act(async () => {
      current?.openCredentials();
      current?.setEmail("owner@example.test");
      current?.setPassword("synthetic-secret");
    });
    await act(async () => current?.submitCredentials());
    expect(current?.state).toMatchObject({
      connection: "credentials",
      operation: "idle",
      error: { code: "temporary_failure", retryable: true },
    });
    await act(async () => current?.cancelConnection());
    expect(logout).not.toHaveBeenCalled();
    expect(current?.state.connection).toBe("disconnected");
  });

  it.each(["cancel", "unmount"] as const)("ignores a late credential rejection after %s", async (outcome) => {
    const login = deferred<Awaited<ReturnType<GarminActivitySourcePort["login"]>>>();
    const view = await render(<Harness
      coordinator={coordinator()}
      loadActivities={async () => []}
      source={source({ login: () => login.promise })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("disconnected"));
    await act(async () => {
      current?.openCredentials();
      current?.setEmail("owner@example.test");
      current?.setPassword("synthetic-secret");
    });
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = current?.submitCredentials();
      await Promise.resolve();
    });
    if (outcome === "cancel") await act(async () => current?.cancelConnection());
    else await view.unmount();
    login.reject(new Error("private late login"));
    await pending;
  });

  it.each(["resolve", "reject"] as const)("ignores a late cancellation logout %s after unmount", async (outcome) => {
    const logout = deferred<void>();
    const view = await render(<Harness
      coordinator={coordinator()}
      loadActivities={async () => []}
      source={source({
        restoreSession: async () => ({ kind: "mfa_required", challenge_handle: "opaque-challenge", generation: 1 }),
        logout: () => logout.promise,
      })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("mfa"));
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = current?.cancelConnection();
      await Promise.resolve();
    });
    await view.unmount();
    if (outcome === "resolve") logout.resolve();
    else logout.reject(new Error("private late cancellation"));
    await pending;
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

  it("drops malformed retry-after metadata from a rate-limit result", async () => {
    await render(<Harness
      coordinator={{ syncNow: async () => ({
        kind: "failure",
        counts: emptyCounts,
        failure: { code: "rate_limited", retryable: true, retryAfterMs: -1 },
      }) }}
      loadActivities={async () => [activity]}
      source={source({ restoreSession: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }) })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("connected"));
    await act(async () => current?.syncNow());
    expect(current?.state.sync).toEqual({
      kind: "failure",
      counts: emptyCounts,
      failure: { code: "rate_limited", retryable: true },
    });
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

  it("returns cancelled and thrown attempts to an idle, retryable state", async () => {
    const syncNow = jest.fn<GarminSyncControllerPort["syncNow"]>()
      .mockResolvedValueOnce({ kind: "cancelled", counts: emptyCounts })
      .mockRejectedValueOnce(new Error("private sync detail"));
    await render(<Harness
      coordinator={{ syncNow }}
      loadActivities={async () => [activity]}
      source={source({ restoreSession: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }) })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("connected"));
    await act(async () => current?.syncNow());
    expect(current?.state.sync).toEqual({ kind: "idle" });
    await act(async () => current?.syncNow());
    expect(current?.state).toMatchObject({
      operation: "idle",
      error: { code: "temporary_failure", retryable: true },
      sync: { kind: "idle" },
    });
  });

  it("publishes partial committed counts without replacing the durable success receipt", async () => {
    const prior = { attemptId: "prior", completedAtMs: 1, counts: { ...emptyCounts, pages: 1 } };
    await render(<Harness
      coordinator={{ syncNow: async () => ({
        kind: "partial",
        counts: { ...emptyCounts, pages: 2, newActivities: 1, failedActivities: 1 },
        failure: { code: "temporary_failure", retryable: true },
      }) }}
      loadActivities={async () => [activity]}
      loadLastSuccessfulSync={async () => prior}
      source={source({ restoreSession: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }) })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("connected"));
    await act(async () => current?.syncNow());
    expect(current?.state).toMatchObject({
      lastSuccessfulSync: prior,
      sync: { kind: "partial", counts: { newActivities: 1, failedActivities: 1 } },
    });
  });

  it("clears a retained history error only after a committed sync reload succeeds", async () => {
    const loadActivities = jest.fn<() => Promise<readonly GarminActivityListItem[]>>()
      .mockRejectedValueOnce(new Error("private history failure"))
      .mockResolvedValueOnce([activity]);
    await render(<Harness
      coordinator={{ syncNow: async () => ({ kind: "success", counts: { ...emptyCounts, newActivities: 1 } }) }}
      loadActivities={loadActivities}
      source={source({ restoreSession: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }) })}
    />);
    await waitFor(() => expect(current?.state.error).toMatchObject({ code: "history_unavailable" }));
    await act(async () => current?.syncNow());
    expect(current?.state).toMatchObject({ historyStatus: "ready", error: null, activities: [activity] });
  });

  it.each(["resolve", "reject"] as const)("ignores a stale successful-sync receipt %s after disconnect", async (outcome) => {
    const save = deferred<void>();
    await render(<Harness
      coordinator={{ syncNow: async (options) => {
        expect(options?.isCancelled()).toBe(false);
        return { kind: "success", counts: emptyCounts };
      } }}
      loadActivities={async () => [activity]}
      saveLastSuccessfulSync={() => save.promise}
      source={source({ restoreSession: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }) })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("connected"));
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = current?.syncNow();
      await Promise.resolve();
      await current?.disconnect();
    });
    if (outcome === "resolve") save.resolve();
    else save.reject(new Error("private stale save"));
    await act(async () => pending);
    expect(current?.state.connection).toBe("disconnected");
  });

  it("ignores stale sync completion after a committed-history reload", async () => {
    const history = deferred<readonly GarminActivityListItem[]>();
    const loadActivities = jest.fn<() => Promise<readonly GarminActivityListItem[]>>(async () => [activity])
      .mockResolvedValueOnce([activity])
      .mockImplementationOnce(() => history.promise);
    await render(<Harness
      coordinator={{ syncNow: async (options) => {
        expect(options?.isCancelled()).toBe(false);
        return { kind: "success", counts: { ...emptyCounts, newActivities: 1 } };
      } }}
      loadActivities={loadActivities}
      source={source({ restoreSession: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }) })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("connected"));
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = current?.syncNow();
      await Promise.resolve();
      await current?.disconnect();
      history.resolve([activity]);
      await pending;
    });
    expect(current?.state.connection).toBe("disconnected");
  });

  it("ignores a stale thrown sync after disconnect", async () => {
    const attempt = deferred<Awaited<ReturnType<GarminSyncControllerPort["syncNow"]>>>();
    let options: Parameters<GarminSyncControllerPort["syncNow"]>[0];
    await render(<Harness
      coordinator={{ syncNow: async (value) => {
        options = value;
        return attempt.promise;
      } }}
      loadActivities={async () => [activity]}
      source={source({ restoreSession: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }) })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("connected"));
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = current?.syncNow();
      await Promise.resolve();
      await current?.disconnect();
    });
    expect(options!.isCancelled()).toBe(true);
    attempt.reject(new Error("private stale sync"));
    await act(async () => pending);
    expect(current?.state.connection).toBe("disconnected");
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

  it("reports cancellation logout failure without leaking it", async () => {
    await render(<Harness
      coordinator={coordinator()}
      loadActivities={async () => [activity]}
      source={source({
        restoreSession: async () => ({ kind: "mfa_required", challenge_handle: "opaque-challenge", generation: 1 }),
        logout: async () => { throw new Error("private logout detail"); },
      })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("mfa"));
    await act(async () => current?.cancelConnection());
    expect(current?.state).toMatchObject({
      connection: "mfa",
      operation: "idle",
      error: { code: "logout_failed", retryable: true },
    });
    expect(JSON.stringify(current?.state)).not.toContain("private logout detail");
  });

  it.each(["resolve", "reject"] as const)("ignores a late disconnect %s after unmount", async (outcome) => {
    const logout = deferred<void>();
    const view = await render(<Harness
      coordinator={coordinator()}
      loadActivities={async () => [activity]}
      source={source({
        restoreSession: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }),
        logout: () => logout.promise,
      })}
    />);
    await waitFor(() => expect(current?.state.connection).toBe("connected"));
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = current?.disconnect();
      await Promise.resolve();
    });
    await view.unmount();
    if (outcome === "resolve") logout.resolve();
    else logout.reject(new Error("private late logout"));
    await pending;
  });
});
