import { act, cleanup, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import Route from "../__garmin-sync-diagnostic";
import { runGarminSyncDiagnostic } from "../../src/testing/garminSyncDiagnostic";
import { getGarminConnectNativeModule } from "../../modules/garmin-connect/src";
import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
let mockNonce: unknown = "a".repeat(32);
let mockMode: unknown;
const identity = { android: { package: "com.fchoo.gymtracker.devtest" }, extra: { buildProfile: "development-test", nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance" } };
let mockConfig: Partial<typeof identity> | undefined = identity;
jest.mock("expo-constants", () => ({ __esModule: true, default: { get expoConfig() { return mockConfig; } } }));
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({ nonce: mockNonce, mode: mockMode }), Redirect: () => { const { View } = require("react-native"); return <View testID="redirect" />; } }));
jest.mock("../../modules/garmin-connect/src", () => ({ getGarminConnectNativeModule: jest.fn(() => ({})) }));
jest.mock("../../src/testing/garminSyncDiagnostic", () => ({ ...jest.requireActual<typeof import("../../src/testing/garminSyncDiagnostic")>("../../src/testing/garminSyncDiagnostic"), runGarminSyncDiagnostic: jest.fn() }));
jest.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "SHA-256" }, digestStringAsync: jest.fn(async (_algorithm: string, value: string) => require("node:crypto").createHash("sha256").update(value).digest("hex")) }));
describe("guarded read-only stage route", () => {
  beforeEach(() => { mockMode = undefined; mockNonce = "a".repeat(32); mockConfig = identity; jest.clearAllMocks(); jest.spyOn(console, "log").mockImplementation(() => undefined); jest.mocked(getGarminConnectNativeModule).mockReturnValue({} as never); });
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
  it("rejects unknown and multivalue modes before native construction", async () => {
    jest.mocked(runGarminSyncDiagnostic).mockResolvedValue({ status: "passed", stage: "complete", code: "read_only_components_ready" });
    mockMode = "unknown"; const view = await render(<Route />);
    for (const mode of ["unknown", "", null, ["normalize"], ["components", "normalize"]]) {
      mockMode = mode; await view.rerender(<Route />); expect(screen.getByTestId("redirect")).toBeOnTheScreen();
    }
    expect(getGarminConnectNativeModule).not.toHaveBeenCalled();
    expect(runGarminSyncDiagnostic).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
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

  it("passes a valid normalize mode and the real expo-crypto SHA256 function without leaking the envelope", async () => {
    mockMode = "normalize"; mockNonce = "d".repeat(32);
    const actual = jest.requireActual<typeof import("../../src/testing/garminSyncDiagnostic")>("../../src/testing/garminSyncDiagnostic");
    jest.mocked(runGarminSyncDiagnostic).mockImplementation(actual.runGarminSyncDiagnostic);
    const ok = (data: unknown) => ({ status: "ok", data });
    const native = {
      restoreSession: jest.fn<() => Promise<unknown>>().mockResolvedValue(ok({ kind: "connected", account_namespace: "garmin:synthetic-account" })),
      getActivities: jest.fn<() => Promise<unknown>>().mockResolvedValue(ok({ items: [{ activityId: 123 }] })),
      getActivity: jest.fn<() => Promise<unknown>>().mockResolvedValue(ok({ activityId: 123, activityTypeDTO: { typeKey: "running" }, summaryDTO: { startTimeGMT: "2026-10-05T23:30:00.000Z", distance: 1000, elapsedDuration: 300 } })),
      getActivitySplits: jest.fn<() => Promise<unknown>>().mockResolvedValue(ok({ lapDTOs: [] })),
      getActivityDetails: jest.fn<() => Promise<unknown>>().mockResolvedValue(ok({ metricDescriptors: [], activityDetailMetrics: [] })),
    };
    jest.mocked(getGarminConnectNativeModule).mockReturnValue(native as never);
    await render(<Route />); await waitFor(() => expect(screen.getByText("Read-only native stages ready")).toBeOnTheScreen());
    expect(runGarminSyncDiagnostic).toHaveBeenCalledWith(native, mockNonce, "normalize", expect.any(Function));
    expect(digestStringAsync).toHaveBeenCalledTimes(4);
    expect(jest.mocked(digestStringAsync).mock.calls.every(([algorithm]) => algorithm === CryptoDigestAlgorithm.SHA256)).toBe(true);
    const output = JSON.parse(String(jest.mocked(console.log).mock.calls[0]![0]).split("GYM_TRACKER_GARMIN_SYNC_DIAGNOSTIC:")[1]!);
    expect(output).toEqual({ schema_version: 1, nonce: mockNonce, status: "passed", stage: "normalization", code: "read_only_normalization_ready", shape: { namespace_kind: "string", summary_utc_format: "strict_0_or_3", summary_local_format: "missing", timezone_kind: "missing" } });
    expect(JSON.stringify(output)).not.toMatch(/synthetic-account|2026|activityId|1000/u);
  });

  it("passes discovery mode without constructing or invoking a hash function", async () => {
    mockMode = "discovery";
    jest.mocked(runGarminSyncDiagnostic).mockResolvedValue({ status: "passed", stage: "batch_discovery", code: "read_only_discovery_ready" });
    await render(<Route />); await waitFor(() => expect(screen.getByText("Read-only native stages ready")).toBeOnTheScreen());
    expect(runGarminSyncDiagnostic).toHaveBeenCalledWith(getGarminConnectNativeModule(), mockNonce, "discovery", undefined);
    expect(digestStringAsync).not.toHaveBeenCalled();
  });

  it("cancels publication when mode changes while a normalize result is pending", async () => {
    mockMode = "normalize";
    let done!: (value: Awaited<ReturnType<typeof runGarminSyncDiagnostic>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof runGarminSyncDiagnostic>>>(resolve => { done = resolve; });
    jest.mocked(runGarminSyncDiagnostic).mockReturnValueOnce(pending).mockResolvedValue({ status: "failed", stage: "guard", code: "nonce_mode_mismatch" });
    const view = await render(<Route />); mockMode = "discovery"; await view.rerender(<Route />);
    await waitFor(() => expect(screen.getByText("Read-only stage failed")).toBeOnTheScreen());
    await act(async () => { done({ status: "passed", stage: "normalization", code: "read_only_normalization_ready" }); await pending; });
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(String(jest.mocked(console.log).mock.calls[0]![0])).toContain("nonce_mode_mismatch");
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
