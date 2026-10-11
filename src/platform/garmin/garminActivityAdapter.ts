import type {
  GarminActivityDiscovery,
  GarminActivitySourcePort,
  GarminConnectionState,
  GarminSourceEnvelope,
} from "../../domains/activities/garminActivitySourcePort";
import { parseGarminSourceEnvelope } from "../../domains/activities/importContracts";
import { getGarminConnectNativeModule } from "../../../modules/garmin-connect/src";

const MAX_PAGE_SIZE = 50;
const MAX_PAGE_START = 10_000;
const MAX_JSON_DEPTH = 16;
const MAX_JSON_NODES = 25_000;
const MAX_JSON_STRING_LENGTH = 16_384;
const EXTERNAL_ACTIVITY_ID = /^[1-9][0-9]{0,18}$/u;
const ACCOUNT_NAMESPACE = /^garmin:[a-f0-9]{32}$/u;
const SAFE_CODE = /^[a-z][a-z0-9_]{0,63}$/u;
const FORBIDDEN_KEY = /(authorization|ciphertext|cookie|credential|email|password|refresh|token|traceback|url)/iu;
const URL_VALUE = /^(?:https?|ftp):\/\//iu;
const NATIVE_ERROR_CODES: ReadonlySet<GarminNativeErrorCode> = new Set([
  "invalid_credentials",
  "mfa_expired",
  "sign_in_required",
  "data_access_denied",
  "rate_limited",
  "offline",
  "timeout",
  "temporary_failure",
  "malformed_response",
  "stale_generation",
  "operation_rejected",
  "arguments_rejected",
]);

export type GarminNativeErrorCode =
  | "invalid_credentials"
  | "mfa_expired"
  | "sign_in_required"
  | "data_access_denied"
  | "rate_limited"
  | "offline"
  | "timeout"
  | "temporary_failure"
  | "malformed_response"
  | "stale_generation"
  | "operation_rejected"
  | "arguments_rejected";

type GarminNativeSuccess<T> = Readonly<{ status: "ok"; generation: number; data: T }>;

export type GarminNativeResult<T> =
  | GarminNativeSuccess<T>
  | Readonly<{
      status: "error";
      error: Readonly<{ code: GarminNativeErrorCode; retryAfterMs?: number }>;
    }>;

type GarminNativeConnectionData =
  | Readonly<{ kind: "disconnected" }>
  | Readonly<{ kind: "connected"; account_namespace: string }>
  | Readonly<{ kind: "mfa_required"; challenge_handle: string }>;

export type GarminNativeDriver = Readonly<{
  connectionState(): Promise<unknown>;
  restoreSession(): Promise<unknown>;
  login(input: Readonly<{ email: string; password: string }>): Promise<unknown>;
  resumeMfa(input: Readonly<{ challengeHandle: string; code: string }>): Promise<unknown>;
  logout(): Promise<unknown>;
  getActivities(input: Readonly<{ start: number; limit: number; activityType: "running" }>): Promise<unknown>;
  getActivity(input: Readonly<{ externalActivityId: string }>): Promise<unknown>;
  getActivitySplits(input: Readonly<{ externalActivityId: string }>): Promise<unknown>;
  getActivityDetails(input: Readonly<{
    externalActivityId: string;
    maxchart: 2000;
    maxpoly: 4000;
  }>): Promise<unknown>;
}>;

export type GarminActivityMapper = Readonly<{
  fromActivity(input: Readonly<{
    external_activity_id: string;
    activity: unknown;
    splits: unknown;
    details: unknown;
  }>): GarminSourceEnvelope | Promise<GarminSourceEnvelope>;
}>;

export class GarminActivityAdapterError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(readonly code: GarminNativeErrorCode | "garmin_page_invalid" | "garmin_activity_id_invalid", retryAfterMs?: number) {
    super(code);
    this.name = "GarminActivityAdapterError";
    this.retryable = code === "rate_limited" || code === "offline" || code === "timeout" || code === "temporary_failure";
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GarminActivityAdapterError("malformed_response");
  }
  return value as Record<string, unknown>;
}

function safeGeneration(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > Number.MAX_SAFE_INTEGER) {
    throw new GarminActivityAdapterError("malformed_response");
  }
  return value as number;
}

function assertSafeJson(value: unknown, depth = 0, budget = { nodes: 0 }): unknown {
  budget.nodes += 1;
  if (depth > MAX_JSON_DEPTH || budget.nodes > MAX_JSON_NODES) {
    throw new GarminActivityAdapterError("malformed_response");
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new GarminActivityAdapterError("malformed_response");
    return value;
  }
  if (typeof value === "string") {
    if (value.length > MAX_JSON_STRING_LENGTH || URL_VALUE.test(value)) throw new GarminActivityAdapterError("malformed_response");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => assertSafeJson(item, depth + 1, budget));
  const object = record(value);
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(object)) {
    if (key.length === 0 || key.length > 128 || FORBIDDEN_KEY.test(key)) {
      throw new GarminActivityAdapterError("malformed_response");
    }
    output[key] = assertSafeJson(child, depth + 1, budget);
  }
  return output;
}

function parseNativeResult<T>(value: unknown): GarminNativeSuccess<T> {
  const result = record(value);
  if (result.status === "error") {
    const error = record(result.error);
    if (typeof error.code !== "string" || !SAFE_CODE.test(error.code)) {
      throw new GarminActivityAdapterError("malformed_response");
    }
    const code = NATIVE_ERROR_CODES.has(error.code as GarminNativeErrorCode)
      ? error.code as GarminNativeErrorCode
      : "temporary_failure";
    const nativeRetryAfterMs = error.retryAfterMs;
    if (nativeRetryAfterMs !== undefined && (!Number.isSafeInteger(nativeRetryAfterMs) || (nativeRetryAfterMs as number) < 0)) {
      throw new GarminActivityAdapterError("malformed_response");
    }
    const retryAfterMs = code === "rate_limited" && nativeRetryAfterMs !== undefined
      ? Math.min(900_000, Math.max(1_000, nativeRetryAfterMs as number))
      : undefined;
    throw new GarminActivityAdapterError(code, retryAfterMs);
  }
  if (result.status !== "ok") throw new GarminActivityAdapterError("malformed_response");
  return {
    status: "ok",
    generation: safeGeneration(result.generation),
    data: assertSafeJson(result.data) as T,
  };
}

function connectionState(result: GarminNativeSuccess<GarminNativeConnectionData>): GarminConnectionState {
  const data = record(result.data);
  if (data.kind === "disconnected") return { kind: "disconnected" };
  if (data.kind === "connected" && typeof data.account_namespace === "string" && ACCOUNT_NAMESPACE.test(data.account_namespace)) {
    return { kind: "connected", account_namespace: data.account_namespace, generation: result.generation };
  }
  if (data.kind === "mfa_required" && typeof data.challenge_handle === "string" && /^[A-Za-z0-9_-]{16,128}$/u.test(data.challenge_handle)) {
    return { kind: "mfa_required", challenge_handle: data.challenge_handle, generation: result.generation };
  }
  throw new GarminActivityAdapterError("malformed_response");
}

function parsePage(input: Readonly<{ cursor?: string; limit: number }>): Readonly<{ start: number; limit: number }> {
  if (input.cursor !== undefined && !/^(?:0|[1-9][0-9]{0,4})$/u.test(input.cursor)) {
    throw new GarminActivityAdapterError("garmin_page_invalid");
  }
  const start = input.cursor === undefined ? 0 : Number(input.cursor);
  if (!Number.isSafeInteger(start) || start < 0 || start > MAX_PAGE_START || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > MAX_PAGE_SIZE) {
    throw new GarminActivityAdapterError("garmin_page_invalid");
  }
  return { start, limit: input.limit };
}

function validateActivityId(value: string): void {
  if (!EXTERNAL_ACTIVITY_ID.test(value)) throw new GarminActivityAdapterError("garmin_activity_id_invalid");
}

function parseDiscovery(
  value: unknown,
  accountNamespace: string,
): GarminActivityDiscovery {
  const summary = record(assertSafeJson(value));
  const rawActivityId = summary.activityId;
  const externalActivityId = typeof rawActivityId === "number"
    && Number.isSafeInteger(rawActivityId)
    && rawActivityId > 0
      ? String(rawActivityId)
      : rawActivityId;
  const activityType = record(summary.activityType);
  if (typeof externalActivityId !== "string"
    || !EXTERNAL_ACTIVITY_ID.test(externalActivityId)
    || activityType.typeKey !== "running") {
    throw new GarminActivityAdapterError("malformed_response");
  }
  return Object.freeze({
    account_namespace: accountNamespace,
    external_activity_id: externalActivityId,
  });
}

export function createGarminActivityAdapter(input: Readonly<{
  driver?: GarminNativeDriver;
  mapper: GarminActivityMapper;
}>): GarminActivitySourcePort {
  const driver = input.driver ?? getGarminConnectNativeModule();
  let currentState: GarminConnectionState = { kind: "disconnected" };
  let generation = 0;

  async function callNative<T>(operation: () => Promise<unknown>): Promise<GarminNativeSuccess<T>> {
    try {
      return parseNativeResult<T>(await operation());
    } catch (error) {
      if (error instanceof GarminActivityAdapterError) throw error;
      throw new GarminActivityAdapterError("temporary_failure");
    }
  }

  function acceptState(value: unknown): GarminConnectionState {
    const next = connectionState(parseNativeResult<GarminNativeConnectionData>(value));
    if (next.kind === "disconnected") {
      currentState = next;
      return next;
    }
    if (next.generation < generation) throw new GarminActivityAdapterError("stale_generation");
    generation = next.generation;
    currentState = next;
    return next;
  }

  function requireCurrent(resultGeneration: number, startedGeneration: number): void {
    if (resultGeneration !== startedGeneration || generation !== startedGeneration || currentState.kind !== "connected") {
      throw new GarminActivityAdapterError("stale_generation");
    }
  }

  return Object.freeze({
    async connectionState() {
      return acceptState(await callNative<GarminNativeConnectionData>(() => driver.connectionState()));
    },
    async restoreSession() {
      return acceptState(await callNative<GarminNativeConnectionData>(() => driver.restoreSession()));
    },
    async login(credentials) {
      generation += 1;
      currentState = { kind: "disconnected" };
      return acceptState(await callNative<GarminNativeConnectionData>(() => driver.login(credentials)));
    },
    async resumeMfa(challenge) {
      if (currentState.kind !== "mfa_required" || challenge.challenge_handle !== currentState.challenge_handle) {
        throw new GarminActivityAdapterError("mfa_expired");
      }
      const pendingGeneration = currentState.generation;
      let next: GarminConnectionState;
      try {
        next = acceptState(await callNative<GarminNativeConnectionData>(() => driver.resumeMfa({
          challengeHandle: challenge.challenge_handle,
          code: challenge.code,
        })));
      } catch (error) {
        if (error instanceof GarminActivityAdapterError && error.code === "mfa_expired") {
          try {
            const authoritative = acceptState(await callNative<GarminNativeConnectionData>(
              () => driver.connectionState(),
            ));
            if (authoritative.kind !== "mfa_required"
              || authoritative.challenge_handle !== challenge.challenge_handle
              || authoritative.generation !== pendingGeneration) {
              currentState = { kind: "disconnected" };
            }
          } catch {
            currentState = { kind: "disconnected" };
          }
        }
        throw error;
      }
      if (next.kind !== "connected" || next.generation !== pendingGeneration) {
        throw new GarminActivityAdapterError("stale_generation");
      }
      return next;
    },
    async logout() {
      generation += 1;
      currentState = { kind: "disconnected" };
      const result = await callNative<GarminNativeConnectionData>(() => driver.logout());
      if (result.generation < generation) throw new GarminActivityAdapterError("stale_generation");
      generation = result.generation;
    },
    async listRunningSummaries(pageInput) {
      const page = parsePage(pageInput);
      if (currentState.kind !== "connected") throw new GarminActivityAdapterError("sign_in_required");
      const startedGeneration = generation;
      const result = await callNative<Readonly<{ items: readonly unknown[]; nextStart?: number }>>(
        () => driver.getActivities({ ...page, activityType: "running" }),
      );
      requireCurrent(result.generation, startedGeneration);
      const data = record(result.data);
      if (!Array.isArray(data.items) || data.items.length > page.limit) throw new GarminActivityAdapterError("malformed_response");
      const accountNamespace = currentState.account_namespace;
      const items = data.items.map((item) => parseDiscovery(item, accountNamespace));
      requireCurrent(result.generation, startedGeneration);
      const nextStart = data.nextStart;
      if (nextStart === undefined) return { items };
      if (!Number.isSafeInteger(nextStart) || (nextStart as number) < 0 || (nextStart as number) > MAX_PAGE_START) {
        throw new GarminActivityAdapterError("malformed_response");
      }
      return { items, next_cursor: String(nextStart) };
    },
    async readActivity(externalActivityId) {
      validateActivityId(externalActivityId);
      if (currentState.kind !== "connected") throw new GarminActivityAdapterError("sign_in_required");
      const startedGeneration = generation;
      const activity = await callNative<unknown>(() => driver.getActivity({ externalActivityId }));
      requireCurrent(activity.generation, startedGeneration);
      const splits = await callNative<unknown>(() => driver.getActivitySplits({ externalActivityId }));
      requireCurrent(splits.generation, startedGeneration);
      const details = await callNative<unknown>(() => driver.getActivityDetails({
        externalActivityId,
        maxchart: 2_000,
        maxpoly: 4_000,
      }));
      requireCurrent(details.generation, startedGeneration);
      const envelope = await input.mapper.fromActivity({
        external_activity_id: externalActivityId,
        activity: activity.data,
        splits: splits.data,
        details: details.data,
      });
      requireCurrent(details.generation, startedGeneration);
      const parsed = parseGarminSourceEnvelope(envelope);
      if (parsed.external_activity_id !== externalActivityId) throw new GarminActivityAdapterError("malformed_response");
      return parsed;
    },
  });
}
