import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { GarminConnectNativeModule } from "../../modules/garmin-connect/src";
import { runGarminSyncDiagnostic } from "./garminSyncDiagnostic";

function fixture() {
  const ok = (data: unknown) => ({ status: "ok", data });
  const restoreSession = jest.fn<() => Promise<unknown>>().mockResolvedValue(ok({ kind: "connected" }));
  const getActivities = jest.fn<() => Promise<unknown>>().mockResolvedValue(ok({ items: [{ activityId: 123 }] }));
  const getActivity = jest.fn<() => Promise<unknown>>().mockResolvedValue(ok({}));
  const getActivitySplits = jest.fn<() => Promise<unknown>>().mockResolvedValue(ok({}));
  const getActivityDetails = jest.fn<() => Promise<unknown>>().mockResolvedValue(ok({}));
  const native = { restoreSession, getActivities, getActivity, getActivitySplits, getActivityDetails } as unknown as GarminConnectNativeModule;
  return { native, restoreSession, getActivities, getActivity, getActivitySplits, getActivityDetails, ok };
}

describe("private read-only sync stage diagnostic", () => {
  it("reads one activity without exposing its private data or identifier", async () => {
    const f = fixture();
    const result = await runGarminSyncDiagnostic(f.native);
    expect(result).toEqual({ status: "passed", stage: "complete", code: "read_only_components_ready" });
    expect(f.getActivities).toHaveBeenCalledTimes(1);
    expect(f.getActivities).toHaveBeenCalledWith({ start: 0, limit: 1, activityType: "running" });
    expect(f.getActivityDetails).toHaveBeenCalledWith({ externalActivityId: "123", maxchart: 2000, maxpoly: 4000 });
    expect(Object.keys(result).sort()).toEqual(["code", "stage", "status"]);
  });
  it("accepts a string identity internally and a truly empty page", async () => {
    const f = fixture(); f.getActivities.mockResolvedValueOnce(f.ok({ items: [{ activityId: "123" }] }));
    expect((await runGarminSyncDiagnostic(f.native)).status).toBe("passed");
    f.getActivities.mockResolvedValueOnce(f.ok({ items: [] }));
    expect(await runGarminSyncDiagnostic(f.native)).toEqual({ status: "passed", stage: "empty", code: "read_only_discovery_ready" });
  });
  it.each([
    ["restore", "restoreSession"], ["discovery", "getActivities"], ["activity", "getActivity"], ["splits", "getActivitySplits"], ["details", "getActivityDetails"],
  ] as [string, "restoreSession" | "getActivities" | "getActivity" | "getActivitySplits" | "getActivityDetails"][])("retains only the failing %s stage and a fixed code", async (stage, method) => {
    const f = fixture(); f[method].mockResolvedValueOnce({ status: "error", error: { code: "malformed_response", message: "private" } });
    expect(await runGarminSyncDiagnostic(f.native)).toEqual({ status: "failed", stage, code: "malformed_response" });
  });
  it("refuses disconnected sessions without further provider reads", async () => {
    const f = fixture(); f.restoreSession.mockResolvedValueOnce(f.ok({ kind: "disconnected" }));
    expect(await runGarminSyncDiagnostic(f.native)).toEqual({ status: "failed", stage: "restore", code: "sign_in_required" });
    expect(f.getActivities).not.toHaveBeenCalled();
  });
  it.each([null, [], { status: "unknown" }, { status: "ok", data: null }, { status: "ok", data: [] }, { status: "ok", data: 3 }, { status: "error" }, { status: "error", error: { code: "private" } }, { status: "error", error: { code: 3 } }])("rejects unsafe native envelopes without leaking them", async (value) => {
    const f = fixture(); f.restoreSession.mockResolvedValueOnce(value);
    expect(await runGarminSyncDiagnostic(f.native)).toEqual({ status: "failed", stage: "restore", code: "malformed_response" });
  });
  it.each([{}, { items: null }, { items: [1, 2] }, { items: [null] }, { items: [{ activityId: 0 }] }, { items: [{ activityId: "0" }] }, { items: [{ activityId: -1 }] }, { items: [{ activityId: NaN }] }, { items: [{ activityId: {} }] }])("rejects unsafe discovery shape before component reads", async (page) => {
    const f = fixture(); f.getActivities.mockResolvedValueOnce(f.ok(page));
    expect(await runGarminSyncDiagnostic(f.native)).toEqual({ status: "failed", stage: "discovery", code: "malformed_response" });
    expect(f.getActivity).not.toHaveBeenCalled();
  });
  it.each([new Error("private"), "private", new Error("offline")])("reduces thrown errors to the fixed allowlist", async (value) => {
    const f = fixture(); f.restoreSession.mockRejectedValueOnce(value);
    expect((await runGarminSyncDiagnostic(f.native)).code).toBe(value instanceof Error && value.message === "offline" ? "offline" : "temporary_failure");
  });
});

describe("nonce-bound provider execution", () => {
  let run: typeof runGarminSyncDiagnostic;
  beforeEach(() => {
    jest.isolateModules(() => {
      run = jest.requireActual<typeof import("./garminSyncDiagnostic")>("./garminSyncDiagnostic").runGarminSyncDiagnostic;
    });
  });
  const nonce = "a".repeat(32);

  it("shares one pending execution across concurrent callers and later reuse", async () => {
    const first = fixture();
    const remount = fixture();
    let finish!: (value: unknown) => void;
    first.getActivities.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = run(first.native, nonce);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const concurrent = run(remount.native, nonce);
    finish(first.ok({ items: [{ activityId: 123 }] }));
    const [result, reused] = await Promise.all([pending, concurrent]);
    expect(result).toEqual({ status: "passed", stage: "complete", code: "read_only_components_ready" });
    expect(reused).toBe(result);
    expect(await run(remount.native, nonce)).toBe(result);
    for (const method of ["restoreSession", "getActivities", "getActivity", "getActivitySplits", "getActivityDetails"] as const) {
      expect(first[method]).toHaveBeenCalledTimes(1);
      expect(remount[method]).not.toHaveBeenCalled();
    }
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each(["restoreSession", "getActivities", "getActivity", "getActivitySplits", "getActivityDetails"] as const)("retains completed %s failures without implicit retry", async method => {
    const first = fixture(); const remount = fixture();
    first[method].mockRejectedValueOnce(new Error("offline"));
    const result = await run(first.native, nonce);
    expect(result.status).toBe("failed");
    expect(result.code).toBe("offline");
    expect(await run(first.native, nonce)).toBe(result);
    expect(await run(remount.native, nonce)).toBe(result);
    expect(first[method]).toHaveBeenCalledTimes(1);
    expect(remount.restoreSession).not.toHaveBeenCalled();
  });

  it.each([null, [nonce], "bad", "g".repeat(32), "A".repeat(32), `${nonce}\n`, 1])("rejects an invalid nonce before every native stage", async invalid => {
    const f = fixture();
    const result = await run(f.native, invalid as string);
    expect(result).toEqual({ status: "failed", stage: "guard", code: "invalid_nonce" });
    expect(Object.isFrozen(result)).toBe(true);
    expect(f.restoreSession).not.toHaveBeenCalled();
  });

  it("bounds pending and consumed nonces without evicting failures or admitting new provider reads", async () => {
    const first = fixture();
    first.restoreSession.mockRejectedValueOnce(new Error("offline"));
    const retained = await run(first.native, nonce);
    const busy = fixture();
    let finish!: (value: unknown) => void;
    busy.restoreSession.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = Array.from({ length: 31 }, (_, index) => run(busy.native, index.toString(16).padStart(32, "0")));
    const overflow = fixture();
    const result = await run(overflow.native, "b".repeat(32));
    expect(result).toEqual({ status: "failed", stage: "guard", code: "nonce_capacity_exhausted" });
    expect(Object.isFrozen(result)).toBe(true);
    expect(overflow.restoreSession).not.toHaveBeenCalled();
    expect(await run(overflow.native, nonce)).toBe(retained);
    finish(busy.ok({ kind: "disconnected" }));
    await Promise.all(pending);
    expect(await run(overflow.native, "b".repeat(32))).toEqual(result);
    expect(overflow.restoreSession).not.toHaveBeenCalled();
    expect(await run(overflow.native, nonce)).toBe(retained);
    expect(busy.restoreSession).toHaveBeenCalledTimes(31);
    expect(busy.getActivities).not.toHaveBeenCalled();
  });
});
