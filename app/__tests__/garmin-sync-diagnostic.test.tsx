import { act, cleanup, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import Route from "../__garmin-sync-diagnostic";
import { runGarminSyncDiagnostic } from "../../src/testing/garminSyncDiagnostic";
import { getGarminConnectNativeModule } from "../../modules/garmin-connect/src";
let mockNonce: unknown = "a".repeat(32);
const identity = { android: { package: "com.fchoo.gymtracker.devtest" }, extra: { buildProfile: "development-test", nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance" } };
let mockConfig: Partial<typeof identity> | undefined = identity;
jest.mock("expo-constants", () => ({ __esModule: true, default: { get expoConfig() { return mockConfig; } } }));
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({ nonce: mockNonce }), Redirect: () => { const { View } = require("react-native"); return <View testID="redirect" />; } }));
jest.mock("../../modules/garmin-connect/src", () => ({ getGarminConnectNativeModule: jest.fn(() => ({})) }));
jest.mock("../../src/testing/garminSyncDiagnostic", () => ({ runGarminSyncDiagnostic: jest.fn() }));
describe("guarded read-only stage route", () => {
  beforeEach(() => { mockNonce = "a".repeat(32); mockConfig = identity; jest.clearAllMocks(); jest.spyOn(console, "log").mockImplementation(() => undefined); jest.mocked(getGarminConnectNativeModule).mockReturnValue({} as never); });
  afterEach(async () => { await cleanup(); jest.restoreAllMocks(); });
  it("rejects untrusted profile and nonce before native access", async () => {
    mockConfig = undefined; const view = await render(<Route />);
    for (const config of [undefined, {}, { android: identity.android }, { extra: identity.extra }, { ...identity, android: { package: "com.fchoo.gymtracker" } }, { ...identity, extra: { ...identity.extra, nativeContractsEnabled: false } }]) {
      mockConfig = config; await view.rerender(<Route />); expect(screen.getByTestId("redirect")).toBeOnTheScreen();
    }
    mockConfig = identity;
    for (const nonce of [undefined, null, ["a".repeat(32)], "bad"]) { mockNonce = nonce; await view.rerender(<Route />); expect(screen.getByTestId("redirect")).toBeOnTheScreen(); }
    expect(getGarminConnectNativeModule).not.toHaveBeenCalled(); expect(console.log).not.toHaveBeenCalled();
  });
  it.each(["passed", "failed"] as const)("logs only a fixed nonce-bound %s result", async status => {
    const result = status === "passed"
      ? { status: "passed", stage: "complete", code: "read_only_components_ready" } as const
      : { status: "failed", stage: "activity", code: "malformed_response" } as const;
    jest.mocked(runGarminSyncDiagnostic).mockResolvedValue(result);
    await render(<Route />); await waitFor(() => expect(screen.getByText(status === "passed" ? "Read-only native stages ready" : "Read-only stage failed")).toBeOnTheScreen());
    expect(runGarminSyncDiagnostic).toHaveBeenCalledWith(getGarminConnectNativeModule(), mockNonce);
    expect(console.log).toHaveBeenCalledWith(`GYM_TRACKER_GARMIN_SYNC_DIAGNOSTIC:${JSON.stringify({ schema_version: 1, nonce: "a".repeat(32), ...result })}`);
  });
  it("sanitizes module construction errors", async () => {
    jest.mocked(getGarminConnectNativeModule).mockImplementation(() => { throw new Error("private"); });
    await render(<Route />); await waitFor(() => expect(screen.getByText("Read-only stage failed")).toBeOnTheScreen());
    expect(JSON.stringify(jest.mocked(console.log).mock.calls)).not.toContain("private");
  });
  it("does not publish after route unmount", async () => {
    let done!: (value: Awaited<ReturnType<typeof runGarminSyncDiagnostic>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof runGarminSyncDiagnostic>>>(resolve => { done = resolve; });
    jest.mocked(runGarminSyncDiagnostic).mockReturnValue(pending); const view = await render(<Route />); await view.unmount();
    await act(async () => { done({ status: "passed", stage: "complete", code: "read_only_components_ready" }); await pending; });
    expect(console.log).not.toHaveBeenCalled();
  });

  it.each(["pending", "failed"] as const)("reuses actual provider execution on a %s route remount", async state => {
    const actual = jest.requireActual<typeof import("../../src/testing/garminSyncDiagnostic")>("../../src/testing/garminSyncDiagnostic");
    jest.mocked(runGarminSyncDiagnostic).mockImplementation(actual.runGarminSyncDiagnostic);
    mockNonce = (state === "pending" ? "b" : "c").repeat(32);
    const ok = (data: unknown) => ({ status: "ok", data });
    let finish!: (value: unknown) => void;
    const discovery = state === "pending" ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ status: "error", error: { code: "offline" } });
    const native = {
      restoreSession: jest.fn<() => Promise<unknown>>().mockResolvedValue(ok({ kind: "connected" })),
      getActivities: jest.fn<() => Promise<unknown>>().mockReturnValue(discovery),
      getActivity: jest.fn<() => Promise<unknown>>().mockResolvedValue(ok({})),
      getActivitySplits: jest.fn<() => Promise<unknown>>().mockResolvedValue(ok({})),
      getActivityDetails: jest.fn<() => Promise<unknown>>().mockResolvedValue(ok({})),
    };
    jest.mocked(getGarminConnectNativeModule).mockReturnValue(native as never);
    const first = await render(<Route />);
    await waitFor(() => expect(native.getActivities).toHaveBeenCalledTimes(1));
    if (state === "failed") await waitFor(() => expect(screen.getByText("Read-only stage failed")).toBeOnTheScreen());
    await first.unmount(); jest.mocked(console.log).mockClear();
    await render(<Route />);
    if (state === "pending") await act(async () => { finish(ok({ items: [{ activityId: 123 }] })); await discovery; });
    await waitFor(() => expect(screen.getByText(state === "pending" ? "Read-only native stages ready" : "Read-only stage failed")).toBeOnTheScreen());
    expect(native.restoreSession).toHaveBeenCalledTimes(1);
    expect(native.getActivities).toHaveBeenCalledTimes(1);
    for (const method of ["getActivity", "getActivitySplits", "getActivityDetails"] as const) expect(native[method]).toHaveBeenCalledTimes(state === "pending" ? 1 : 0);
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(`GYM_TRACKER_GARMIN_SYNC_DIAGNOSTIC:${JSON.stringify({ schema_version: 1, nonce: mockNonce, status: state === "pending" ? "passed" : "failed", stage: state === "pending" ? "complete" : "discovery", code: state === "pending" ? "read_only_components_ready" : "offline" })}`);
  });
});
