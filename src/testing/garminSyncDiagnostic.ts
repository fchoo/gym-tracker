import type { GarminConnectNativeModule } from "../../modules/garmin-connect/src";

const codes = new Set(["invalid_credentials", "mfa_expired", "sign_in_required", "data_access_denied", "rate_limited", "offline", "timeout", "malformed_response", "temporary_failure"]);

const nonceCapacity = 32;
const nonceResults = new Map<string, Promise<Awaited<ReturnType<typeof readGarminSyncStages>>>>();

/** One provider execution per nonce for this runtime, including failures. No consumed nonce is evicted. */
export function runGarminSyncDiagnostic(native: GarminConnectNativeModule, nonce?: string) {
  // Direct host callers may omit a nonce; the guarded route always supplies its exact nonce.
  if (nonce === undefined) return readGarminSyncStages(native);
  if (typeof nonce !== "string" || !/^[a-f0-9]{32}$/u.test(nonce)) {
    return Promise.resolve(Object.freeze({ status: "failed", stage: "guard", code: "invalid_nonce" }));
  }
  const existing = nonceResults.get(nonce);
  if (existing !== undefined) return existing;
  if (nonceResults.size >= nonceCapacity) {
    return Promise.resolve(Object.freeze({ status: "failed", stage: "guard", code: "nonce_capacity_exhausted" }));
  }
  // Reserve synchronously before any native stage can run, including a reentrant call.
  const pending = Promise.resolve().then(() => readGarminSyncStages(native));
  nonceResults.set(nonce, pending);
  return pending;
}

/** Read-only provider stage diagnosis. No credentials, payloads or activity identifiers escape. */
async function readGarminSyncStages(native: GarminConnectNativeModule) {
  let stage = "restore";
  try {
    const read = async (operation: () => Promise<unknown>) => {
      const value = await operation();
      if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("malformed_response");
      const result = value as Record<string, unknown>;
      if (result.status === "error") {
        const error = result.error as Record<string, unknown> | undefined;
        throw new Error(typeof error?.code === "string" && codes.has(error.code) ? error.code : "malformed_response");
      }
      if (result.status !== "ok" || result.data === null || typeof result.data !== "object" || Array.isArray(result.data)) throw new Error("malformed_response");
      return result.data as Record<string, unknown>;
    };
    const connection = await read(() => native.restoreSession());
    if (connection.kind !== "connected") throw new Error("sign_in_required");
    stage = "discovery";
    const page = await read(() => native.getActivities({ start: 0, limit: 1, activityType: "running" }));
    if (!Array.isArray(page.items) || page.items.length > 1) throw new Error("malformed_response");
    if (page.items.length === 0) return Object.freeze({ status: "passed", stage: "empty", code: "read_only_discovery_ready" });
    const item = page.items[0] as Record<string, unknown> | null;
    const rawId = item?.activityId;
    const id = typeof rawId === "number" && Number.isSafeInteger(rawId) && rawId > 0 ? String(rawId) : rawId;
    if (typeof id !== "string" || !/^[1-9][0-9]{0,18}$/u.test(id)) throw new Error("malformed_response");
    stage = "activity";
    await read(() => native.getActivity({ externalActivityId: id }));
    stage = "splits";
    await read(() => native.getActivitySplits({ externalActivityId: id }));
    stage = "details";
    await read(() => native.getActivityDetails({ externalActivityId: id, maxchart: 2000, maxpoly: 4000 }));
    return Object.freeze({ status: "passed", stage: "complete", code: "read_only_components_ready" });
  } catch (error) {
    return Object.freeze({ status: "failed", stage, code: error instanceof Error && codes.has(error.message) ? error.message : "temporary_failure" });
  }
}
