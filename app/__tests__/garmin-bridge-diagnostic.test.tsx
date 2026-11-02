import { act, cleanup, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import Route from "../__garmin-bridge-diagnostic";
import { runGarminBridgeDiagnostic } from "../../src/testing/garminBridgeDiagnostic";
import { getGarminConnectNativeModule } from "../../modules/garmin-connect/src";
let mockNonce: unknown = "a".repeat(32);
const identity = { android: { package: "com.fchoo.gymtracker.devtest" }, extra: { buildProfile: "development-test", nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance" } };
let mockConfig: Partial<typeof identity> | undefined = identity;
jest.mock("expo-constants", () => ({ __esModule: true, default: { get expoConfig() { return mockConfig; } } }));
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({ nonce: mockNonce }), Redirect: () => { const { View } = require("react-native"); return <View testID="redirect" />; } }));
jest.mock("../../modules/garmin-connect/src", () => ({ getGarminConnectNativeModule: jest.fn(() => ({})) }));
jest.mock("../../src/testing/garminBridgeDiagnostic", () => ({ ...jest.requireActual<typeof import("../../src/testing/garminBridgeDiagnostic")>("../../src/testing/garminBridgeDiagnostic"), runGarminBridgeDiagnostic: jest.fn() }));
describe("guarded credential-free native bridge route", () => {
  beforeEach(() => { mockNonce = "a".repeat(32); mockConfig = identity; jest.clearAllMocks(); jest.spyOn(console, "log").mockImplementation(() => undefined); jest.mocked(getGarminConnectNativeModule).mockReturnValue({} as never); });
  afterEach(async () => { await cleanup(); jest.restoreAllMocks(); });
  it("denies production, disabled, missing config and malformed requests before native code", async () => {
    mockConfig = undefined; const view = await render(<Route />);
    const invalid = [undefined, {}, { android: identity.android }, { extra: identity.extra },
      { ...identity, android: { package: "com.fchoo.gymtracker" } },
      { ...identity, extra: { ...identity.extra, buildProfile: "production" } },
      { ...identity, extra: { ...identity.extra, nativeContractsEnabled: false } },
      { ...identity, extra: { ...identity.extra, nativeContractSuite: "other" } }];
    for (const config of invalid) { mockConfig = config; await view.rerender(<Route />); expect(screen.getByTestId("redirect")).toBeOnTheScreen(); }
    mockConfig = identity;
    for (const nonce of [undefined, null, ["a".repeat(32)], "bad", "A".repeat(32)]) {
      mockNonce = nonce; await view.rerender(<Route />); expect(screen.getByTestId("redirect")).toBeOnTheScreen();
    }
    expect(getGarminConnectNativeModule).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });
  it.each(["passed", "failed"] as const)("emits only a fixed nonce-bound %s result", async status => {
    jest.mocked(runGarminBridgeDiagnostic).mockResolvedValue(status === "passed" ? { status, stage: "complete", code: "actual_transport_ready" } : { status, stage: "cffi_backend", code: "ModuleNotFoundError" });
    await render(<Route />); await waitFor(() => expect(screen.getByText(status === "passed" ? "Inert transport ready (no login or handshake)" : "Native bridge failed")).toBeOnTheScreen());
    expect(runGarminBridgeDiagnostic).toHaveBeenCalledWith({}, "a".repeat(32));
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(`GYM_TRACKER_GARMIN_BRIDGE_DIAGNOSTIC:${JSON.stringify({ schema_version: 1, nonce: "a".repeat(32), status, stage: status === "passed" ? "complete" : "cffi_backend", code: status === "passed" ? "actual_transport_ready" : "ModuleNotFoundError" })}`);
  });
  it("sanitizes native module construction failure", async () => {
    jest.mocked(getGarminConnectNativeModule).mockImplementation(() => { throw new Error("private native message"); });
    await render(<Route />); await waitFor(() => expect(screen.getByText("Native bridge failed")).toBeOnTheScreen());
    expect(JSON.stringify(jest.mocked(console.log).mock.calls)).not.toContain("private native message");
  });
  it("does not publish after unmount while native work is pending", async () => {
    let done!: (value: Awaited<ReturnType<typeof runGarminBridgeDiagnostic>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof runGarminBridgeDiagnostic>>>(resolve => { done = resolve; });
    jest.mocked(runGarminBridgeDiagnostic).mockReturnValue(pending); const view = await render(<Route />); await view.unmount();
    await act(async () => { done({ status: "passed", stage: "complete", code: "actual_transport_ready" }); await pending; }); expect(console.log).not.toHaveBeenCalled();
  });
});
