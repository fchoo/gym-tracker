import { describe, expect, it, jest } from "@jest/globals";
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
