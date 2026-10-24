import type { GarminConnectNativeModule } from "../../modules/garmin-connect/src";
import { normalizeGarminActivity } from "../platform/garmin/normalizeGarminActivity";
import type { GarminPayloadSha256 } from "../platform/garmin/canonicalGarminPayload";
import { GARMIN_SYNC_DEFAULT_LIMITS } from "../platform/garmin/garminSyncContracts";

const codes = new Set(["invalid_credentials", "mfa_expired", "sign_in_required", "data_access_denied", "rate_limited", "offline", "timeout", "malformed_response", "temporary_failure"]);
const normalizationCodes = new Set(["garmin_json_invalid", "garmin_json_limit", "garmin_source_invalid", "garmin_digest_invalid", "garmin_sport_unsupported", "garmin_envelope_invalid"]);
export type GarminSyncDiagnosticMode = "components" | "normalize" | "discovery";
export function resolveGarminSyncDiagnosticMode(value: unknown): GarminSyncDiagnosticMode | undefined {
  if (value === undefined || value === "components") return "components";
  if (value === "normalize" || value === "discovery") return value;
  return undefined;
}

function valueKind(value: unknown) {
  if (value === undefined) return "missing" as const;
  if (value === null) return "null" as const;
  if (typeof value === "string") return "string" as const;
  if (typeof value === "number") return "number" as const;
  return "other" as const;
}

function utcFormat(value: unknown) {
  if (value === undefined || value === null) return valueKind(value) as "missing" | "null";
  if (typeof value !== "string") return "other" as const;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?$/u.test(value)) return "strict_0_or_3" as const;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\.\d{1,2}Z?$/u.test(value)) return "fraction_1_or_2" as const;
  return "other" as const;
}

function localFormat(value: unknown) {
  if (value === undefined || value === null) return valueKind(value) as "missing" | "null";
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/u.test(value) ? "format_0_to_3" as const : "other" as const;
}

function normalizationShape(namespace: unknown, activity: Record<string, unknown>) {
  const value = activity.summaryDTO;
  const summary = value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  return Object.freeze({ namespace_kind: valueKind(namespace),
    summary_utc_format: summary === undefined ? "other" as const : utcFormat(summary.startTimeGMT),
    summary_local_format: summary === undefined ? "other" as const : localFormat(summary.startTimeLocal),
    timezone_kind: summary === undefined ? "other" as const : valueKind(summary.timeZoneId) });
}

type DiagnosticResult = Readonly<{ status: "passed" | "failed"; stage: string; code: string; shape?: ReturnType<typeof normalizationShape> }>;
function guardFailure(code: string): Promise<DiagnosticResult> {
  return Promise.resolve(Object.freeze({ status: "failed", stage: "guard", code }));
}

const nonceCapacity = 32;
const nonceResults = new Map<string, Readonly<{ mode: GarminSyncDiagnosticMode; pending: Promise<DiagnosticResult> }>>();

/** One provider execution per nonce for this runtime, including failures. No consumed nonce is evicted. */
export function runGarminSyncDiagnostic(native: GarminConnectNativeModule, nonce?: string, requestedMode?: unknown, sha256?: GarminPayloadSha256): Promise<DiagnosticResult> {
  const mode = resolveGarminSyncDiagnosticMode(requestedMode);
  if (mode === undefined) return guardFailure("invalid_mode");
  // Direct host callers may omit a nonce; the guarded route always supplies its exact nonce.
  if (nonce === undefined) return readGarminSyncStages(native, mode, sha256);
  if (typeof nonce !== "string" || !/^[a-f0-9]{32}$/u.test(nonce)) {
    return guardFailure("invalid_nonce");
  }
  const existing = nonceResults.get(nonce);
  if (existing !== undefined) return existing.mode === mode ? existing.pending : guardFailure("nonce_mode_mismatch");
  if (nonceResults.size >= nonceCapacity) {
    return guardFailure("nonce_capacity_exhausted");
  }
  // Reserve synchronously before any native stage can run, including a reentrant call.
  const pending = Promise.resolve().then(() => readGarminSyncStages(native, mode, sha256));
  nonceResults.set(nonce, Object.freeze({ mode, pending }));
  return pending;
}

/** Read-only provider stage diagnosis. No credentials, payloads or activity identifiers escape. */
async function readGarminSyncStages(native: GarminConnectNativeModule, mode: GarminSyncDiagnosticMode, sha256?: GarminPayloadSha256): Promise<DiagnosticResult> {
  if (mode === "normalize" && typeof sha256 !== "function") return guardFailure("invalid_hasher");
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
    stage = mode === "discovery" ? "batch_discovery" : "discovery";
    const limit = mode === "discovery" ? GARMIN_SYNC_DEFAULT_LIMITS.pageSize : 1;
    const page = await read(() => native.getActivities({ start: 0, limit, activityType: "running" }));
    if (!Array.isArray(page.items) || page.items.length > limit) throw new Error("malformed_response");
    if (mode === "discovery") return Object.freeze({ status: "passed", stage, code: "read_only_discovery_ready" });
    if (page.items.length === 0) return Object.freeze({ status: mode === "normalize" ? "failed" : "passed", stage: "empty", code: mode === "normalize" ? "no_activity_to_normalize" : "read_only_discovery_ready" });
    const item = page.items[0] as Record<string, unknown> | null;
    const rawId = item?.activityId;
    const id = typeof rawId === "number" && Number.isSafeInteger(rawId) && rawId > 0 ? String(rawId) : rawId;
    if (typeof id !== "string" || !/^[1-9][0-9]{0,18}$/u.test(id)) throw new Error("malformed_response");
    stage = "activity";
    const activity = await read(() => native.getActivity({ externalActivityId: id }));
    stage = "splits";
    const splits = await read(() => native.getActivitySplits({ externalActivityId: id }));
    stage = "details";
    const details = await read(() => native.getActivityDetails({ externalActivityId: id, maxchart: 2000, maxpoly: 4000 }));
    if (mode === "normalize") {
      const namespace = connection.account_namespace;
      const shape = normalizationShape(namespace, activity);
      stage = "normalization";
      if (typeof namespace !== "string") return Object.freeze({ status: "failed", stage, code: "garmin_source_invalid", shape });
      try {
        await normalizeGarminActivity({ account_namespace: namespace, external_activity_id: id, activity, splits, details }, sha256!);
        return Object.freeze({ status: "passed", stage, code: "read_only_normalization_ready", shape });
      } catch (error) {
        const code = error !== null && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
        return Object.freeze({ status: "failed", stage, code: typeof code === "string" && normalizationCodes.has(code) ? code
          : error instanceof Error && error.name === "ZodError" ? "garmin_source_invalid" : "temporary_failure", shape });
      }
    }
    return Object.freeze({ status: "passed", stage: "complete", code: "read_only_components_ready" });
  } catch (error) {
    return Object.freeze({ status: "failed", stage, code: error instanceof Error && codes.has(error.message) ? error.message : "temporary_failure" });
  }
}
