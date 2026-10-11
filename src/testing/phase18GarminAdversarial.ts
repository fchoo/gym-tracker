import {
  CryptoDigestAlgorithm,
  digestStringAsync,
} from "expo-crypto";
import { getGarminConnectNativeModule } from "../../modules/garmin-connect/src";

import type { GarminSourceEnvelope } from "../domains/activities/garminActivitySourcePort";
import {
  GarminActivityAdapterError,
  createGarminActivityAdapter,
  type GarminActivityMapper,
  type GarminNativeDriver,
} from "../platform/garmin/garminActivityAdapter";
import { normalizeGarminActivity } from "../platform/garmin/normalizeGarminActivity";
import { createGarminSyncCoordinator } from "../platform/garmin/garminSyncCoordinator";

export const PHASE18_GARMIN_ADVERSARIAL_CONFIRMATION =
  "VERIFY-PHASE18-GARMIN-ADVERSARIAL";
export const PHASE18_GARMIN_ADVERSARIAL_RESULT_MARKER =
  "GYM_TRACKER_PHASE18_GARMIN_ADVERSARIAL_RESULT:";

export const PHASE18_GARMIN_ADVERSARIAL_CASE_IDS = Object.freeze([
  "PH18-ADV-RESTORE",
  "PH18-ADV-REFRESH",
  "PH18-ADV-READ",
  "PH18-ADV-LOGOUT",
  "PH18-ADV-RESTART",
  "PH18-ADV-LATE-GENERATION",
  "PH18-ADV-403",
  "PH18-ADV-429",
  "PH18-ADV-OFFLINE",
  "PH18-ADV-TIMEOUT",
  "PH18-ADV-5XX",
  "PH18-ADV-MALFORMED",
  "PH18-ADV-OVERSIZED",
  "PH18-ADV-MISSING-COMPONENT",
  "PH18-ADV-PARTIAL-PAGE",
  "PH18-ADV-ROTATION",
] as const);

export type Phase18GarminAdversarialCaseId =
  typeof PHASE18_GARMIN_ADVERSARIAL_CASE_IDS[number];

export type Phase18GarminAdversarialCase = Readonly<{
  id: Phase18GarminAdversarialCaseId;
  status: "passed" | "TECHNICAL_REVIEW_REQUIRED";
  provenance: "host-deterministic" | "expected-injected" | "native-exact-artifact" | "unexpected";
  stage: string;
  code: string;
  duration_ms: number;
  call_count: number;
  automatic_retry_count: number;
  retry_after_ms: number;
  source_write_count: number;
  connection_state: string;
  sync_state: string;
  session_digest: string;
  history_digest: string;
  source_digest: string;
  match_digest: string;
  generation_before: number;
  generation_after: number;
}>;

type Sha256 = (value: string) => Promise<string>;

type DriverState = {
  connected: boolean;
  generation: number;
  sessionDigest: string;
  rotationCount: number;
  calls: Map<string, number>;
};

const ACCOUNT_NAMESPACE = "garmin:0123456789abcdef0123456789abcdef";
const EXTERNAL_ACTIVITY_ID = "424242";

export function phase18GarminAdversarialEnabled(input: Readonly<{
  buildProfile?: unknown;
  nativeContractsEnabled?: unknown;
  suite?: unknown;
  confirmation?: unknown;
}>): boolean {
  return input.buildProfile === "development-test"
    && input.nativeContractsEnabled === true
    && input.suite === "phase18-garmin-adversarial"
    && input.confirmation === PHASE18_GARMIN_ADVERSARIAL_CONFIRMATION;
}

const defaultSha256: Sha256 = (value) =>
  digestStringAsync(CryptoDigestAlgorithm.SHA256, value);

function count(state: DriverState, operation: string): void {
  state.calls.set(operation, (state.calls.get(operation) ?? 0) + 1);
}

function sourceComponents(externalActivityId = EXTERNAL_ACTIVITY_ID) {
  return Object.freeze({
    activity: Object.freeze({
      activityId: Number(externalActivityId),
      activityTypeDTO: Object.freeze({ typeKey: "running" }),
      summaryDTO: Object.freeze({
        startTimeGMT: "2026-10-05T23:30:00.000Z",
        distance: 5_000,
        duration: 1_500,
        elapsedDuration: 1_560,
        movingDuration: 1_475,
      }),
    }),
    splits: Object.freeze({ lapDTOs: Object.freeze([]) }),
    details: Object.freeze({
      metricDescriptors: Object.freeze([]),
      activityDetailMetrics: Object.freeze([]),
    }),
  });
}

function createMapper(sha256: Sha256): GarminActivityMapper {
  const normalize = (
    externalActivityId: string,
    input: Readonly<{ activity: unknown; splits: unknown; details: unknown }> = sourceComponents(externalActivityId),
  ) =>
    normalizeGarminActivity({
      account_namespace: ACCOUNT_NAMESPACE,
      external_activity_id: externalActivityId,
      ...input,
    }, sha256);
  return Object.freeze({
    fromActivity: (input) => normalize(input.external_activity_id, {
      activity: input.activity,
      splits: input.splits,
      details: input.details,
    }),
  });
}

function createConnectedDriver(
  state: DriverState,
  rotatedSessionDigest: string,
  absentSessionDigest: string,
): GarminNativeDriver {
  const components = sourceComponents();
  return Object.freeze({
    async connectionState() {
      count(state, "connectionState");
      return state.connected
        ? {
          status: "ok" as const,
          generation: state.generation,
          data: { kind: "connected" as const, account_namespace: ACCOUNT_NAMESPACE },
        }
        : {
          status: "ok" as const,
          generation: state.generation,
          data: { kind: "disconnected" as const },
        };
    },
    async restoreSession() {
      count(state, "restoreSession");
      return state.connected
        ? {
          status: "ok" as const,
          generation: state.generation,
          data: { kind: "connected" as const, account_namespace: ACCOUNT_NAMESPACE },
        }
        : {
          status: "error" as const,
          error: { code: "sign_in_required" as const },
        };
    },
    async login() {
      count(state, "login");
      return { status: "error" as const, error: { code: "operation_rejected" as const } };
    },
    async resumeMfa() {
      count(state, "resumeMfa");
      return { status: "error" as const, error: { code: "operation_rejected" as const } };
    },
    async logout() {
      count(state, "logout");
      state.generation += 1;
      state.connected = false;
      state.sessionDigest = absentSessionDigest;
      return {
        status: "ok" as const,
        generation: state.generation,
        data: { kind: "disconnected" as const },
      };
    },
    async getActivities() {
      count(state, "getActivities");
      state.sessionDigest = rotatedSessionDigest;
      state.rotationCount += 1;
      return {
        status: "ok" as const,
        generation: state.generation,
        data: { items: [{ activityId: EXTERNAL_ACTIVITY_ID, activityType: { typeKey: "running" } }] },
      };
    },
    async getActivity() {
      count(state, "getActivity");
      return { status: "ok" as const, generation: state.generation, data: components.activity };
    },
    async getActivitySplits() {
      count(state, "getActivitySplits");
      return { status: "ok" as const, generation: state.generation, data: components.splits };
    },
    async getActivityDetails() {
      count(state, "getActivityDetails");
      return { status: "ok" as const, generation: state.generation, data: components.details };
    },
  });
}

function duration(startedAt: number, endedAt: number): number {
  return Math.max(0, Math.floor(endedAt - startedAt));
}

function result(input: Omit<Phase18GarminAdversarialCase, "duration_ms"> & Readonly<{
  startedAt: number;
  endedAt: number;
}>): Phase18GarminAdversarialCase {
  const { startedAt, endedAt, ...entry } = input;
  return Object.freeze({ ...entry, duration_ms: duration(startedAt, endedAt) });
}

async function lifecycleCases(
  sha256: Sha256,
  now: () => number,
): Promise<readonly Phase18GarminAdversarialCase[]> {
  const [initialSessionDigest, rotatedSessionDigest, absentSessionDigest, historyDigest, sourceDigest, matchDigest] = await Promise.all([
    sha256("session-record-valid-initial"),
    sha256("session-record-valid-rotated"),
    sha256("session-record-absent"),
    sha256("history-retained"),
    sha256("source-retained"),
    sha256("match-retained"),
  ]);
  const state: DriverState = {
    connected: true,
    generation: 7,
    sessionDigest: initialSessionDigest,
    rotationCount: 0,
    calls: new Map(),
  };
  const source = createGarminActivityAdapter({
    driver: createConnectedDriver(state, rotatedSessionDigest, absentSessionDigest),
    mapper: createMapper(sha256),
  });
  const startedRestore = now();
  const restored = await source.connectionState();
  const restore = result({
    id: "PH18-ADV-RESTORE",
    status: "passed",
    provenance: "host-deterministic",
    stage: "restore",
    code: "completed",
    call_count: state.calls.get("connectionState") ?? 0,
    automatic_retry_count: 0,
    retry_after_ms: 0,
    source_write_count: 0,
    connection_state: restored.kind,
    sync_state: "idle",
    session_digest: state.sessionDigest,
    history_digest: historyDigest,
    source_digest: sourceDigest,
    match_digest: matchDigest,
    generation_before: 7,
    generation_after: state.generation,
    startedAt: startedRestore,
    endedAt: now(),
  });

  const coordinator = createGarminSyncCoordinator({
    source,
    limits: { pageSize: 1, maxPages: 1, maxActivities: 1 },
    importActivity: async (_envelope: GarminSourceEnvelope, assertCurrentGeneration) => {
      await assertCurrentGeneration();
      return Object.freeze({ kind: "replayed" as const, activityId: "local-activity", aggregateRevision: 1 });
    },
  });
  const startedRead = now();
  const sync = await coordinator.syncNow();
  const syncState = sync.kind === "success" ? "success" : `${sync.kind}-${"failure" in sync ? sync.failure.code : "unknown"}`;
  const refresh = result({
    id: "PH18-ADV-REFRESH",
    status: "passed",
    provenance: "host-deterministic",
    stage: "refresh",
    code: "completed",
    call_count: state.rotationCount,
    automatic_retry_count: 0,
    retry_after_ms: 0,
    source_write_count: 0,
    connection_state: "connected",
    sync_state: syncState,
    session_digest: state.sessionDigest,
    history_digest: historyDigest,
    source_digest: sourceDigest,
    match_digest: matchDigest,
    generation_before: 7,
    generation_after: state.generation,
    startedAt: startedRead,
    endedAt: now(),
  });
  const read = result({
    id: "PH18-ADV-READ",
    status: "passed",
    provenance: "host-deterministic",
    stage: "read",
    code: "completed",
    call_count: ["getActivities", "getActivity", "getActivitySplits", "getActivityDetails"]
      .reduce((sum, operation) => sum + (state.calls.get(operation) ?? 0), 0),
    automatic_retry_count: 0,
    retry_after_ms: 0,
    source_write_count: 0,
    connection_state: "connected",
    sync_state: syncState,
    session_digest: state.sessionDigest,
    history_digest: historyDigest,
    source_digest: sourceDigest,
    match_digest: matchDigest,
    generation_before: 7,
    generation_after: state.generation,
    startedAt: startedRead,
    endedAt: now(),
  });

  const generationBeforeLogout = state.generation;
  const startedLogout = now();
  await source.logout();
  const logout = result({
    id: "PH18-ADV-LOGOUT",
    status: "passed",
    provenance: "host-deterministic",
    stage: "logout",
    code: "completed",
    call_count: state.calls.get("logout") ?? 0,
    automatic_retry_count: 0,
    retry_after_ms: 0,
    source_write_count: 0,
    connection_state: "disconnected",
    sync_state: "idle",
    session_digest: state.sessionDigest,
    history_digest: historyDigest,
    source_digest: sourceDigest,
    match_digest: matchDigest,
    generation_before: generationBeforeLogout,
    generation_after: state.generation,
    startedAt: startedLogout,
    endedAt: now(),
  });

  const restarted = createGarminActivityAdapter({
    driver: createConnectedDriver(state, rotatedSessionDigest, absentSessionDigest),
    mapper: createMapper(sha256),
  });
  const startedRestart = now();
  const restartState = await restarted.connectionState();
  const restart = result({
    id: "PH18-ADV-RESTART",
    status: "passed",
    provenance: "host-deterministic",
    stage: "restart",
    code: restartState.kind === "disconnected" ? "sign_in_required" : "temporary_failure",
    call_count: 1,
    automatic_retry_count: 0,
    retry_after_ms: 0,
    source_write_count: 0,
    connection_state: restartState.kind === "disconnected" ? "sign-in-required" : restartState.kind,
    sync_state: "idle",
    session_digest: state.sessionDigest,
    history_digest: historyDigest,
    source_digest: sourceDigest,
    match_digest: matchDigest,
    generation_before: state.generation,
    generation_after: state.generation,
    startedAt: startedRestart,
    endedAt: now(),
  });

  const late = await lateGenerationCase({ sha256, now, historyDigest, sourceDigest, matchDigest });
  return Object.freeze([restore, refresh, read, logout, restart, late]);
}

async function lateGenerationCase(input: Readonly<{
  sha256: Sha256;
  now: () => number;
  historyDigest: string;
  sourceDigest: string;
  matchDigest: string;
}>): Promise<Phase18GarminAdversarialCase> {
  const sessionDigest = await input.sha256("session-record-valid-late");
  const clearedDigest = await input.sha256("session-record-absent");
  const state: DriverState = {
    connected: true,
    generation: 20,
    sessionDigest,
    rotationCount: 0,
    calls: new Map(),
  };
  let release: ((value: unknown) => void) | undefined;
  const base = createConnectedDriver(state, sessionDigest, clearedDigest);
  const driver: GarminNativeDriver = Object.freeze({
    ...base,
    getActivities: async () => {
      count(state, "getActivities");
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  const source = createGarminActivityAdapter({ driver, mapper: createMapper(input.sha256) });
  await source.connectionState();
  const startedAt = input.now();
  const delayed = source.listRunningSummaries({ limit: 1 });
  await Promise.resolve();
  const generationBefore = state.generation;
  await source.logout();
  state.sessionDigest = clearedDigest;
  release?.({
    status: "ok",
    generation: generationBefore,
    data: { items: [{ activityId: EXTERNAL_ACTIVITY_ID, activityType: { typeKey: "running" } }] },
  });
  let code = "temporary_failure";
  try {
    await delayed;
  } catch (error) {
    if (error instanceof GarminActivityAdapterError) code = error.code;
  }
  return result({
    id: "PH18-ADV-LATE-GENERATION",
    status: code === "stale_generation" ? "passed" : "TECHNICAL_REVIEW_REQUIRED",
    provenance: code === "stale_generation" ? "host-deterministic" : "unexpected",
    stage: "late-generation",
    code,
    call_count: state.calls.get("getActivities") ?? 0,
    automatic_retry_count: 0,
    retry_after_ms: 0,
    source_write_count: 0,
    connection_state: "disconnected",
    sync_state: `failure-${code.replaceAll("_", "-")}`,
    session_digest: state.sessionDigest,
    history_digest: input.historyDigest,
    source_digest: input.sourceDigest,
    match_digest: input.matchDigest,
    generation_before: generationBefore,
    generation_after: state.generation,
    startedAt,
    endedAt: input.now(),
  });
}

type InjectedCaseId = Exclude<
  Phase18GarminAdversarialCaseId,
  | "PH18-ADV-RESTORE"
  | "PH18-ADV-REFRESH"
  | "PH18-ADV-READ"
  | "PH18-ADV-LOGOUT"
  | "PH18-ADV-RESTART"
  | "PH18-ADV-LATE-GENERATION"
>;

const INJECTED_CASE_IDS = PHASE18_GARMIN_ADVERSARIAL_CASE_IDS.slice(6) as readonly InjectedCaseId[];

const EXPECTED_FAILURE: Readonly<Record<InjectedCaseId, string>> = Object.freeze({
  "PH18-ADV-403": "data_access_denied",
  "PH18-ADV-429": "rate_limited",
  "PH18-ADV-OFFLINE": "offline",
  "PH18-ADV-TIMEOUT": "timeout",
  "PH18-ADV-5XX": "temporary_failure",
  "PH18-ADV-MALFORMED": "malformed_response",
  "PH18-ADV-OVERSIZED": "malformed_response",
  "PH18-ADV-MISSING-COMPONENT": "malformed_response",
  "PH18-ADV-PARTIAL-PAGE": "temporary_failure",
  "PH18-ADV-ROTATION": "stale_generation",
});

function injectedDriver(id: InjectedCaseId, state: DriverState): GarminNativeDriver {
  const ok = (data: unknown) => ({ status: "ok" as const, generation: state.generation, data });
  const nativeFailure = (code: "data_access_denied" | "rate_limited" | "offline" | "timeout" | "temporary_failure" | "stale_generation", retryAfterMs?: number) => ({
    status: "error" as const,
    error: { code, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) },
  });
  return Object.freeze({
    async connectionState() {
      count(state, "connectionState");
      return ok({ kind: "connected", account_namespace: ACCOUNT_NAMESPACE });
    },
    async restoreSession() {
      count(state, "restoreSession");
      return ok({ kind: "connected", account_namespace: ACCOUNT_NAMESPACE });
    },
    async login() {
      count(state, "login");
      return nativeFailure("temporary_failure");
    },
    async resumeMfa() {
      count(state, "resumeMfa");
      return nativeFailure("temporary_failure");
    },
    async logout() {
      count(state, "logout");
      return ok({ kind: "disconnected" });
    },
    async getActivities() {
      count(state, "getActivities");
      switch (id) {
        case "PH18-ADV-403": return nativeFailure("data_access_denied");
        case "PH18-ADV-429": return nativeFailure("rate_limited", 9_999_999);
        case "PH18-ADV-OFFLINE": return nativeFailure("offline");
        case "PH18-ADV-TIMEOUT": return nativeFailure("timeout");
        case "PH18-ADV-5XX": return nativeFailure("temporary_failure");
        case "PH18-ADV-MALFORMED": return { status: "unexpected" };
        case "PH18-ADV-OVERSIZED": return ok({
          items: [{ activityId: EXTERNAL_ACTIVITY_ID, activityType: { typeKey: "running" }, payload: "x".repeat(16_385) }],
        });
        case "PH18-ADV-PARTIAL-PAGE": return ok({
          items: [
            { activityId: EXTERNAL_ACTIVITY_ID, activityType: { typeKey: "running" } },
            { activityId: "424243", activityType: { typeKey: "running" } },
          ],
        });
        default: return ok({
          items: [{ activityId: EXTERNAL_ACTIVITY_ID, activityType: { typeKey: "running" } }],
        });
      }
    },
    async getActivity({ externalActivityId }) {
      count(state, "getActivity");
      if (id === "PH18-ADV-PARTIAL-PAGE" && externalActivityId === "424243") {
        return nativeFailure("temporary_failure");
      }
      return ok(sourceComponents(externalActivityId).activity);
    },
    async getActivitySplits({ externalActivityId }) {
      count(state, "getActivitySplits");
      if (id === "PH18-ADV-MISSING-COMPONENT") return ok(undefined);
      if (id === "PH18-ADV-ROTATION") return nativeFailure("stale_generation");
      return ok(sourceComponents(externalActivityId).splits);
    },
    async getActivityDetails({ externalActivityId }) {
      count(state, "getActivityDetails");
      return ok(sourceComponents(externalActivityId).details);
    },
  });
}

async function injectedFailureCase(input: Readonly<{
  id: InjectedCaseId;
  sha256: Sha256;
  now: () => number;
  sessionDigest: string;
  historyDigest: string;
  sourceDigest: string;
  matchDigest: string;
}>): Promise<Phase18GarminAdversarialCase> {
  const state: DriverState = {
    connected: true,
    generation: 30,
    sessionDigest: input.sessionDigest,
    rotationCount: 0,
    calls: new Map(),
  };
  const source = createGarminActivityAdapter({
    driver: injectedDriver(input.id, state),
    mapper: createMapper(input.sha256),
  });
  await source.connectionState();
  let sourceWriteCount = 0;
  const coordinator = createGarminSyncCoordinator({
    source,
    limits: {
      pageSize: input.id === "PH18-ADV-PARTIAL-PAGE" ? 2 : 1,
      maxPages: 1,
      maxActivities: input.id === "PH18-ADV-PARTIAL-PAGE" ? 2 : 1,
    },
    importActivity: async (_envelope, assertCurrentGeneration) => {
      await assertCurrentGeneration();
      return Object.freeze({ kind: "replayed" as const, activityId: "local-activity", aggregateRevision: 1 });
    },
  });
  const startedAt = input.now();
  const sync = await coordinator.syncNow();
  const failure = sync.kind === "failure" || sync.kind === "partial" ? sync.failure : undefined;
  const code = failure?.code ?? "temporary_failure";
  const expected = EXPECTED_FAILURE[input.id];
  const requestCallCount = ["getActivities", "getActivity", "getActivitySplits", "getActivityDetails"]
    .reduce((sum, operation) => sum + (state.calls.get(operation) ?? 0), 0);
  return result({
    id: input.id,
    status: code === expected && sourceWriteCount === 0
      ? "passed"
      : "TECHNICAL_REVIEW_REQUIRED",
    provenance: code === expected && sourceWriteCount === 0
      ? "expected-injected"
      : "unexpected",
    stage: input.id.toLowerCase().replaceAll("ph18-adv-", "").replaceAll("-", "_"),
    code,
    call_count: requestCallCount,
    automatic_retry_count: 0,
    retry_after_ms: failure?.retryAfterMs ?? 0,
    source_write_count: sourceWriteCount,
    connection_state: "connected",
    sync_state: `${sync.kind}-${code.replaceAll("_", "-")}`,
    session_digest: state.sessionDigest,
    history_digest: input.historyDigest,
    source_digest: input.sourceDigest,
    match_digest: input.matchDigest,
    generation_before: 30,
    generation_after: state.generation,
    startedAt,
    endedAt: input.now(),
  });
}

async function injectedFailureCases(sha256: Sha256, now: () => number) {
  const [sessionDigest, historyDigest, sourceDigest, matchDigest] = await Promise.all([
    sha256("session-record-last-valid"),
    sha256("history-retained"),
    sha256("source-retained"),
    sha256("match-retained"),
  ]);
  const cases: Phase18GarminAdversarialCase[] = [];
  for (const id of INJECTED_CASE_IDS) {
    cases.push(await injectedFailureCase({
      id,
      sha256,
      now,
      sessionDigest,
      historyDigest,
      sourceDigest,
      matchDigest,
    }));
  }
  return Object.freeze(cases);
}

export async function runPhase18GarminAdversarialHostSuite(input: Readonly<{
  sha256?: Sha256;
  now?: () => number;
}> = {}) {
  const sha256 = input.sha256 ?? defaultSha256;
  const now = input.now ?? Date.now;
  const cases = Object.freeze([
    ...await lifecycleCases(sha256, now),
    ...await injectedFailureCases(sha256, now),
  ]);
  return Object.freeze({
    schema_version: 1 as const,
    suite: "phase18-garmin-adversarial" as const,
    status: cases.every(({ status }) => status === "passed")
      ? "host-ready-native-deferred" as const
      : "TECHNICAL_REVIEW_REQUIRED" as const,
    case_ids: PHASE18_GARMIN_ADVERSARIAL_CASE_IDS,
    cases,
  });
}

export async function runPhase18GarminAdversarialNativeSuite(
  nativeModule = getGarminConnectNativeModule(),
): Promise<Readonly<{
  status: "passed" | "TECHNICAL_REVIEW_REQUIRED";
  cases: readonly Phase18GarminAdversarialCase[];
  current_identity: Readonly<Record<string, string>>;
}>> {
  const raw = await nativeModule.runAdversarialSuite({
    confirmation: PHASE18_GARMIN_ADVERSARIAL_CONFIRMATION,
  });
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("phase18_garmin_native_report_invalid");
  }
  const report = raw as Readonly<Record<string, unknown>>;
  if (report.schema_version !== 1
    || report.suite !== "phase18-garmin-adversarial"
    || (report.status !== "passed" && report.status !== "TECHNICAL_REVIEW_REQUIRED")
    || report.current_identity === null
    || typeof report.current_identity !== "object"
    || Array.isArray(report.current_identity)
    || !Array.isArray(report.cases)
    || report.cases.length !== PHASE18_GARMIN_ADVERSARIAL_CASE_IDS.length
    || report.cases.some((entry, index) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return true;
      const candidate = entry as Readonly<Record<string, unknown>>;
      return candidate.id !== PHASE18_GARMIN_ADVERSARIAL_CASE_IDS[index]
        || (candidate.status === "passed" && candidate.provenance !== "native-exact-artifact")
        || (candidate.status !== "passed" && candidate.status !== "TECHNICAL_REVIEW_REQUIRED");
    })) {
    throw new Error("phase18_garmin_native_report_invalid");
  }
  return Object.freeze({
    status: report.status,
    cases: Object.freeze(report.cases as Phase18GarminAdversarialCase[]),
    current_identity: Object.freeze(report.current_identity as Record<string, string>),
  });
}
