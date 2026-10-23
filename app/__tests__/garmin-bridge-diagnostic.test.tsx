import { act, cleanup, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import Route from "../__garmin-bridge-diagnostic";
import { runGarminBridgeDiagnostic } from "../../src/testing/garminBridgeDiagnostic";
import { getGarminConnectNativeModule } from "../../modules/garmin-connect/src";
let mockNonce: unknown = "a".repeat(32);
let mockEnabled = true;
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { android: { package: "com.fchoo.gymtracker.devtest" }, extra: { buildProfile: "development-test", get nativeContractsEnabled() { return mockEnabled; }, nativeContractSuite: "v1.2-acceptance" } } } }));
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({ nonce: mockNonce }), Redirect: () => { const { View } = require("react-native"); return <View testID="redirect" />; } }));
jest.mock("../../modules/garmin-connect/src", () => ({ getGarminConnectNativeModule: jest.fn(() => ({})) }));
jest.mock("../../src/testing/garminBridgeDiagnostic", () => ({ ...jest.requireActual<typeof import("../../src/testing/garminBridgeDiagnostic")>("../../src/testing/garminBridgeDiagnostic"), runGarminBridgeDiagnostic: jest.fn() }));
describe("guarded credential-free native bridge route", () => {
  beforeEach(() => { mockNonce = "a".repeat(32); mockEnabled = true; jest.clearAllMocks(); jest.spyOn(console, "log").mockImplementation(() => undefined); jest.mocked(getGarminConnectNativeModule).mockReturnValue({} as never); });
  afterEach(async () => { await cleanup(); jest.restoreAllMocks(); });
  it("denies disabled and malformed requests before loading native code", async () => {
    mockEnabled = false; const view = await render(<Route />); expect(screen.getByTestId("redirect")).toBeOnTheScreen();
    mockEnabled = true; mockNonce = ["a".repeat(32)]; await view.rerender(<Route />); expect(screen.getByTestId("redirect")).toBeOnTheScreen();
    expect(getGarminConnectNativeModule).not.toHaveBeenCalled();
  });
  it.each(["passed", "failed"] as const)("emits only a fixed nonce-bound %s result", async status => {
    jest.mocked(runGarminBridgeDiagnostic).mockResolvedValue(status === "passed" ? { status, stage: "complete", code: "native_bridge_ready" } : { status, stage: "runtime", code: "native_bridge_rejected" });
    await render(<Route />); await waitFor(() => expect(screen.getByText(status === "passed" ? "Native bridge ready" : "Native bridge failed")).toBeOnTheScreen());
    expect(console.log).toHaveBeenCalledTimes(1); expect(JSON.stringify(jest.mocked(console.log).mock.calls)).toContain("a".repeat(32));
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
    await act(async () => { done({ status: "passed", stage: "complete", code: "native_bridge_ready" }); await pending; }); expect(console.log).not.toHaveBeenCalled();
  });
});
