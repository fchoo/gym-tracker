import { describe, expect, it, jest } from "@jest/globals";
import type { GarminConnectNativeModule } from "../../modules/garmin-connect/src";
import { garminBridgeDiagnosticEnabled, runGarminBridgeDiagnostic } from "./garminBridgeDiagnostic";

const identity = { packageName: "com.fchoo.gymtracker.devtest", profile: "development-test", enabled: true, suite: "v1.2-acceptance" };
const nonce = "a".repeat(32);
const ready = { status: "passed", stage: "complete", code: "actual_transport_ready" };
function forbidden() { return jest.fn(async (): Promise<unknown> => { throw new Error("account/store/weak probe forbidden"); }); }
function native() {
  return { runtimeInfo: forbidden(), connectionState: forbidden(), benchmarkDeterministicJson: forbidden(),
    login: forbidden(), resumeMfa: forbidden(), restoreSession: forbidden(),
    diagnoseTransportReadiness: jest.fn(async (): Promise<unknown> => ready) };
}
const run = (driver: ReturnType<typeof native>, input: unknown = nonce) => runGarminBridgeDiagnostic(driver as unknown as GarminConnectNativeModule, input as string);
describe("credential-free Garmin transport diagnostic", () => {
  it("permits only the exact test identity and scalar nonce", () => {
    expect(garminBridgeDiagnosticEnabled(identity, nonce)).toBe(true);
    for (const input of [{ ...identity, packageName: "com.fchoo.gymtracker" }, { ...identity, profile: "production" }, { ...identity, enabled: false }, { ...identity, enabled: "true" }, { ...identity, suite: "other" }]) expect(garminBridgeDiagnosticEnabled(input, nonce)).toBe(false);
    for (const invalid of [null, [nonce], "x", "g".repeat(32), "A".repeat(32), `${nonce}\n`]) expect(garminBridgeDiagnosticEnabled(identity, invalid)).toBe(false);
  });
  it("never counts a metadata-only old build as actual native readiness", async () => {
    const driver = native(); delete (driver as Partial<typeof driver>).diagnoseTransportReadiness;
    expect(await run(driver)).toEqual({ status: "failed", stage: "transport", code: "native_bridge_rejected" });
  });
  it("requires one actual selected-client/CFFI probe and never enters account or weak metadata paths", async () => {
    const driver = native(); const result = await run(driver);
    expect(result).toEqual(ready); expect(Object.isFrozen(result)).toBe(true);
    expect(driver.diagnoseTransportReadiness).toHaveBeenCalledTimes(1);
    expect(driver.diagnoseTransportReadiness).toHaveBeenCalledWith(nonce);
    for (const method of [driver.runtimeInfo, driver.connectionState, driver.benchmarkDeterministicJson, driver.login, driver.resumeMfa, driver.restoreSession]) expect(method).not.toHaveBeenCalled();
  });
  it("rejects malformed nonce and private/unbound native payloads without retry", async () => {
    for (const input of [null, [nonce], "bad", `${nonce}\n`]) {
      const driver = native(); expect(await run(driver, input)).toEqual({ status: "failed", stage: "transport", code: "native_bridge_rejected" });
      expect(driver.diagnoseTransportReadiness).not.toHaveBeenCalled();
    }
    const invalid = [null, 3, [], {}, { ...ready, message: "private" }, { ...ready, http_status: 200 },
      { ...ready, status: "other" }, { ...ready, stage: "client_factory" }, { ...ready, code: "ImportError" },
      { status: "failed", stage: 3, code: "ImportError" }, { status: "failed", stage: "client_import", code: 3 },
      { status: "failed", stage: "private", code: "Exception" }, { status: "failed", stage: "client_import", code: "PrivateError" },
      { status: "failed", stage: "native", code: "Exception" }, { status: "failed", stage: "complete", code: "native_bridge_rejected" },
      Object.assign(Object.create(ready), { a: 1, b: 2, c: 3 })];
    for (const value of invalid) {
      const driver = native(); driver.diagnoseTransportReadiness.mockResolvedValue(value);
      expect(await run(driver)).toEqual({ status: "failed", stage: "transport", code: "native_bridge_rejected" });
      expect(driver.diagnoseTransportReadiness).toHaveBeenCalledTimes(1);
    }
    const driver = native(); driver.diagnoseTransportReadiness.mockRejectedValue(new Error("private"));
    expect(await run(driver)).toEqual({ status: "failed", stage: "transport", code: "native_bridge_rejected" });
  });
  it("snapshots native scalar fields once so changing accessors cannot bypass the allowlist", async () => {
    let reads = 0;
    const driver = native();
    driver.diagnoseTransportReadiness.mockResolvedValue({ status: "failed", get stage() { return reads++ < 2 ? "curl_import" : "private"; }, code: "ImportError" });
    expect(await run(driver)).toEqual({ status: "failed", stage: "curl_import", code: "ImportError" });
    expect(reads).toBe(1);
  });
  it("retains only fixed transport stage and allowlisted exception class code", async () => {
    for (const stage of ["client_import", "cffi_backend", "curl_import", "curl_session", "requests_import", "ua_import", "certifi_import", "ssl_context", "client_factory", "session_close"])
      for (const code of ["ImportError", "ModuleNotFoundError", "OSError", "RuntimeError", "TypeError", "ValueError", "AttributeError", "Exception"]) {
        const driver = native(); driver.diagnoseTransportReadiness.mockResolvedValue({ status: "failed", stage, code });
        expect(await run(driver)).toEqual({ status: "failed", stage, code });
      }
    const driver = native(); driver.diagnoseTransportReadiness.mockResolvedValue({ status: "failed", stage: "native", code: "native_bridge_rejected" });
    expect(await run(driver)).toEqual({ status: "failed", stage: "native", code: "native_bridge_rejected" });
  });
});
