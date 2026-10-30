import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createHash } from "node:crypto";
import type { GarminConnectNativeModule } from "../../modules/garmin-connect/src";
import { runGarminSyncDiagnostic } from "./garminSyncDiagnostic";
import { GARMIN_SYNC_DEFAULT_LIMITS } from "../platform/garmin/garminSyncContracts";
import * as normalizer from "../platform/garmin/normalizeGarminActivity";

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

const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
function normalizationFixture() {
  const f = fixture();
  f.restoreSession.mockResolvedValue(f.ok({ kind: "connected", account_namespace: "garmin:synthetic-account" }));
  const activity = { activityId: 123, activityTypeDTO: { typeKey: "running" }, summaryDTO: {
    startTimeGMT: "2026-10-05T23:30:00.000Z", startTimeLocal: "2026-10-06T07:30:00", timeZoneId: "Asia/Singapore", distance: 1000, elapsedDuration: 300,
  } };
  f.getActivity.mockResolvedValue(f.ok(activity));
  f.getActivitySplits.mockResolvedValue(f.ok({ lapDTOs: [] }));
  f.getActivityDetails.mockResolvedValue(f.ok({ metricDescriptors: [], activityDetailMetrics: [] }));
  return { ...f, activity };
}

describe("latest activity normalization diagnostic", () => {
  it("reads exactly one default-sized batch discovery page without components or data output", async () => {
    const f = normalizationFixture(); f.getActivities.mockResolvedValue(f.ok({ items: [] }));
    expect(await runGarminSyncDiagnostic(f.native, "0".repeat(32), "discovery")).toEqual({ status: "passed", stage: "batch_discovery", code: "read_only_discovery_ready" });
    expect(f.getActivities).toHaveBeenCalledWith({ start: 0, limit: GARMIN_SYNC_DEFAULT_LIMITS.pageSize, activityType: "running" });
    expect(f.getActivity).not.toHaveBeenCalled(); expect(f.getActivitySplits).not.toHaveBeenCalled(); expect(f.getActivityDetails).not.toHaveBeenCalled();
  });
  it("runs the real normalizer on one captured component triple and returns only fixed observations", async () => {
    const f = normalizationFixture();
    const hash = jest.fn(sha256);
    const result = await runGarminSyncDiagnostic(f.native, "d".repeat(32), "normalize", hash);
    expect(result).toEqual({ status: "passed", stage: "normalization", code: "read_only_normalization_ready", shape: {
      namespace_kind: "string", summary_utc_format: "strict_0_or_3", summary_local_format: "format_0_to_3", timezone_kind: "string",
    } });
    expect(hash).toHaveBeenCalledTimes(4);
    for (const method of ["restoreSession", "getActivities", "getActivity", "getActivitySplits", "getActivityDetails"] as const) expect(f[method]).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/synthetic-account|2026|Asia\/|activityId|summaryDTO|1000/u);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.shape)).toBe(true);
  });

  it("distinguishes current fractional UTC source rejection at normalization without copying values", async () => {
    const f = normalizationFixture(); f.activity.summaryDTO.startTimeGMT = "2026-10-05T23:30:00.1Z";
    const result = await runGarminSyncDiagnostic(f.native, "e".repeat(32), "normalize", sha256);
    expect(result).toEqual({ status: "failed", stage: "normalization", code: "garmin_source_invalid", shape: {
      namespace_kind: "string", summary_utc_format: "fraction_1_or_2", summary_local_format: "format_0_to_3", timezone_kind: "string",
    } });
    expect(JSON.stringify(result)).not.toContain("2026");
  });

  it("never reuses components success as normalized success or re-reads on a nonce mode change", async () => {
    const f = normalizationFixture(); const nonce = "f".repeat(32);
    expect((await runGarminSyncDiagnostic(f.native, nonce)).code).toBe("read_only_components_ready");
    expect(await runGarminSyncDiagnostic(f.native, nonce, "normalize", sha256)).toEqual({ status: "failed", stage: "guard", code: "nonce_mode_mismatch" });
    expect(f.restoreSession).toHaveBeenCalledTimes(1);
    expect(f.getActivities).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, 0, {}, []])("rejects a missing or untyped actual stored namespace without inventing one", async namespace => {
    const f = normalizationFixture(); f.restoreSession.mockResolvedValue(f.ok({ kind: "connected", ...(namespace === undefined ? {} : { account_namespace: namespace }) }));
    const hash = jest.fn(sha256);
    const result = await runGarminSyncDiagnostic(f.native, undefined, "normalize", hash);
    expect(result).toMatchObject({ status: "failed", stage: "normalization", code: "garmin_source_invalid" });
    expect(hash).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("synthetic-account");
  });

  it.each(["garmin_source_invalid", "garmin_sport_unsupported", "garmin_json_invalid", "garmin_json_limit", "garmin_digest_invalid"])("preserves the real normalizer's fixed %s diagnosis", async code => {
    const f = normalizationFixture();
    let hash = sha256;
    if (code === "garmin_source_invalid") f.restoreSession.mockResolvedValue(f.ok({ kind: "connected", account_namespace: "" }));
    if (code === "garmin_sport_unsupported") f.activity.activityTypeDTO.typeKey = "cycling";
    if (code === "garmin_json_invalid") f.getActivity.mockResolvedValue(f.ok({ ...f.activity, unsafe: undefined }));
    if (code === "garmin_json_limit") f.getActivity.mockResolvedValue(f.ok({ ...f.activity, oversize: "x".repeat(16385) }));
    if (code === "garmin_digest_invalid") hash = async () => "private digest";
    const result = await runGarminSyncDiagnostic(f.native, undefined, "normalize", hash);
    expect(result).toMatchObject({ status: "failed", stage: "normalization", code });
    expect(JSON.stringify(result)).not.toMatch(/cycling|private digest|oversize|unsafe|synthetic-account/u);
  });

  it("reduces actual strict-schema errors to the fixed source code", async () => {
    const f = normalizationFixture(); f.getActivity.mockResolvedValue(f.ok({ ...f.activity, summaryDTO: { startTimeGMT: "1969-12-31T23:30:00.000Z", distance: 1, elapsedDuration: 1 } }));
    expect(await runGarminSyncDiagnostic(f.native, undefined, "normalize", sha256)).toMatchObject({ status: "failed", stage: "normalization", code: "garmin_source_invalid" });
  });

  it.each([new Error("private credentials"), "private timestamp", null, { code: "private", message: "private" }, { code: "garmin_envelope_invalid", message: "private" }])("reduces thrown normalizer values to fixed output", async error => {
    const spy = jest.spyOn(normalizer, "normalizeGarminActivity").mockRejectedValueOnce(error);
    try {
      const f = normalizationFixture(); const result = await runGarminSyncDiagnostic(f.native, undefined, "normalize", sha256);
      expect(result).toMatchObject({ status: "failed", stage: "normalization", code: typeof error === "object" && error !== null && "code" in error && error.code === "garmin_envelope_invalid" ? "garmin_envelope_invalid" : "temporary_failure" });
      expect(JSON.stringify(result)).not.toMatch(/private|credentials|timestamp/u);
    } finally { spy.mockRestore(); }
  });

  it("never returns the normalizer's private envelope", async () => {
    const spy = jest.spyOn(normalizer, "normalizeGarminActivity").mockResolvedValueOnce({ private: "private payload" } as never);
    try {
      const f = normalizationFixture(); const result = await runGarminSyncDiagnostic(f.native, undefined, "normalize", sha256);
      expect(Object.keys(result).sort()).toEqual(["code", "shape", "stage", "status"]);
      expect(JSON.stringify(result)).not.toContain("private");
    } finally { spy.mockRestore(); }
  });

  it.each([
    [undefined, "missing"], [null, "null"], [3, "other"], ["other", "other"],
    ["2026-10-05T23:30:00Z", "strict_0_or_3"], ["2026-10-05T23:30:00.12Z", "fraction_1_or_2"],
  ] as [unknown, string][])("reports fixed UTC shape without source values", async (value, expected) => {
    const f = normalizationFixture(); f.getActivity.mockResolvedValue(f.ok({ ...f.activity, summaryDTO: { ...f.activity.summaryDTO, ...(value === undefined ? { startTimeGMT: undefined } : { startTimeGMT: value }) } }));
    expect((await runGarminSyncDiagnostic(f.native, undefined, "normalize", sha256)).shape?.summary_utc_format).toBe(expected);
  });

  it.each([undefined, null, 3, false, "bad-local"])("reports fixed local/timezone shapes", async value => {
    const f = normalizationFixture(); f.getActivity.mockResolvedValue(f.ok({ ...f.activity, summaryDTO: { ...f.activity.summaryDTO, startTimeLocal: value, timeZoneId: value } }));
    const result = await runGarminSyncDiagnostic(f.native, undefined, "normalize", sha256);
    expect(result.shape?.summary_local_format).toBe(value === undefined ? "missing" : value === null ? "null" : "other");
    expect(result.shape?.timezone_kind).toBe(value === undefined ? "missing" : value === null ? "null" : typeof value === "number" ? "number" : typeof value === "string" ? "string" : "other");
  });

  it.each([undefined, null, [], 1])("reports only conservative fixed shapes for malformed summary DTOs", async summary => {
    const f = normalizationFixture(); f.getActivity.mockResolvedValue(f.ok({ ...f.activity, summaryDTO: summary }));
    expect((await runGarminSyncDiagnostic(f.native, undefined, "normalize", sha256)).shape).toEqual({ namespace_kind: "string", summary_utc_format: "other", summary_local_format: "other", timezone_kind: "other" });
  });

  it("does not turn empty discovery into normalized success", async () => {
    const f = normalizationFixture(); f.getActivities.mockResolvedValue(f.ok({ items: [] }));
    expect(await runGarminSyncDiagnostic(f.native, undefined, "normalize", sha256)).toEqual({ status: "failed", stage: "empty", code: "no_activity_to_normalize" });
  });

  it.each(["offline", "malformed_response"])("preserves fixed batch-discovery native failure %s without components", async code => {
    const f = normalizationFixture(); f.getActivities.mockResolvedValue({ status: "error", error: { code, message: "private" } });
    expect(await runGarminSyncDiagnostic(f.native, undefined, "discovery")).toEqual({ status: "failed", stage: "batch_discovery", code });
    expect(f.getActivity).not.toHaveBeenCalled();
  });

  it("bounds the exact default batch page and accepts a full page with no item output", async () => {
    const f = normalizationFixture(); f.getActivities.mockResolvedValue(f.ok({ items: Array.from({ length: GARMIN_SYNC_DEFAULT_LIMITS.pageSize }, (_, activityId) => ({ activityId: activityId + 1 })) }));
    expect(await runGarminSyncDiagnostic(f.native, undefined, "discovery")).toEqual({ status: "passed", stage: "batch_discovery", code: "read_only_discovery_ready" });
    f.getActivities.mockResolvedValue(f.ok({ items: Array.from({ length: GARMIN_SYNC_DEFAULT_LIMITS.pageSize + 1 }, () => ({})) }));
    expect((await runGarminSyncDiagnostic(f.native, undefined, "discovery")).code).toBe("malformed_response");
  });
});

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

  it.each([null, "", "unknown", ["normalize"], ["components", "discovery"]])("rejects unsafe modes before native access", async mode => {
    const f = fixture(); expect(await run(f.native, nonce, mode)).toEqual({ status: "failed", stage: "guard", code: "invalid_mode" });
    expect(f.restoreSession).not.toHaveBeenCalled();
  });

  it("retains normalize failures, requires an injected hasher, and binds all three modes", async () => {
    const f = normalizationFixture();
    const invalid = await run(f.native, nonce, "normalize");
    expect(invalid).toEqual({ status: "failed", stage: "guard", code: "invalid_hasher" });
    expect(await run(f.native, nonce, "normalize", sha256)).toBe(invalid);
    expect(f.restoreSession).not.toHaveBeenCalled();
    expect((await run(f.native, nonce, "discovery")).code).toBe("nonce_mode_mismatch");
    expect((await run(f.native, nonce, "components")).code).toBe("nonce_mode_mismatch");
  });

  it("shares actual pending normalization and retains its completed source failure", async () => {
    const f = normalizationFixture(); f.activity.summaryDTO.startTimeGMT = "invalid";
    let done!: (value: unknown) => void;
    const pendingDiscovery = new Promise(resolve => { done = resolve; });
    f.getActivities.mockReturnValueOnce(pendingDiscovery);
    const first = run(f.native, nonce, "normalize", sha256);
    const second = run(f.native, nonce, "normalize", sha256);
    done(f.ok({ items: [{ activityId: 123 }] }));
    const result = await first;
    expect(await second).toBe(result); expect(await run(f.native, nonce, "normalize", sha256)).toBe(result);
    expect(result.code).toBe("garmin_source_invalid"); expect(f.restoreSession).toHaveBeenCalledTimes(1); expect(f.getActivityDetails).toHaveBeenCalledTimes(1);
  });

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
