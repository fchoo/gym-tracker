import { describe, expect, it, jest } from "@jest/globals";
import type { GarminConnectNativeModule } from "../../modules/garmin-connect/src";
import { garminBridgeDiagnosticEnabled, runGarminBridgeDiagnostic } from "./garminBridgeDiagnostic";

const identity = { packageName: "com.fchoo.gymtracker.devtest", profile: "development-test", enabled: true, suite: "v1.2-acceptance" };
const nonce = "a".repeat(32);
function native() {
  return { runtimeInfo: jest.fn(async () => ({ schemaVersion: 1, pythonVersion: "3.13", clientVersion: "0.3.17", clientCommit: "218e72ca5459e014435fc2d94fd18bd601fa0c14", abi: "arm64-v8a", capabilities: ["runtimeInfo"], benchmark: { processId: 1, installedApkSizeBytes: 1, garminModuleSizeBytes: 1, pythonStartupKind: "cold", pythonStartupDurationMs: 0, observedAtMonotonicMs: 0 } })),
    connectionState: jest.fn(async (): Promise<unknown> => ({ status: "ok", generation: 1, data: { kind: "disconnected" } })),
    benchmarkDeterministicJson: jest.fn(async (): Promise<unknown> => ({ schemaVersion: 1, transport: "chaquopy-python-garminconnect-0.3.17", payloadSha256: "a".repeat(64), normalizedJson: '{"probe":1}', outputSha256: "b".repeat(64) })) };
}
describe("credential-free Garmin bridge diagnostic", () => {
  it("permits only the exact test identity and scalar nonce", () => {
    expect(garminBridgeDiagnosticEnabled(identity, nonce)).toBe(true);
    for (const input of [{ ...identity, packageName: "com.fchoo.gymtracker" }, { ...identity, profile: "production" }, { ...identity, enabled: false }, { ...identity, suite: "other" }]) expect(garminBridgeDiagnosticEnabled(input, nonce)).toBe(false);
    for (const invalid of [null, [nonce], "x", "g".repeat(32)]) expect(garminBridgeDiagnosticEnabled(identity, invalid)).toBe(false);
  });
  it("calls only runtime metadata, disconnected-state and fixed JSON without credentials", async () => {
    const driver = native();
    expect(await runGarminBridgeDiagnostic(driver as unknown as GarminConnectNativeModule)).toEqual({ status: "passed", stage: "complete", code: "native_bridge_ready" });
    expect(driver.benchmarkDeterministicJson).toHaveBeenCalledWith({ payloadJson: '{"probe":1}' });
  });
  it("reduces all failure details to the current fixed stage", async () => {
    const runtime = native(); runtime.runtimeInfo.mockRejectedValue(new Error("private raw exception"));
    expect(await runGarminBridgeDiagnostic(runtime as unknown as GarminConnectNativeModule)).toEqual({ status: "failed", stage: "runtime", code: "native_bridge_rejected" });
    expect(runtime.connectionState).not.toHaveBeenCalled();
    for (const value of [null, 3, [], {}, { status: "error", error: { code: "temporary_failure" } }, { status: "ok" }, { status: "ok", data: { kind: "connected", account_namespace: "private" } }]) {
      const driver = native(); driver.connectionState.mockResolvedValue(value);
      expect(await runGarminBridgeDiagnostic(driver as unknown as GarminConnectNativeModule)).toEqual({ status: "failed", stage: "connection", code: "native_bridge_rejected" });
      expect(driver.benchmarkDeterministicJson).not.toHaveBeenCalled();
    }
    const json = native(); json.benchmarkDeterministicJson.mockResolvedValue({ schemaVersion: 1, transport: "chaquopy-python-garminconnect-0.3.17", payloadSha256: "a".repeat(64), normalizedJson: '{"probe":2}', outputSha256: "b".repeat(64) });
    expect(await runGarminBridgeDiagnostic(json as unknown as GarminConnectNativeModule)).toEqual({ status: "failed", stage: "json", code: "native_bridge_rejected" });
  });
});
