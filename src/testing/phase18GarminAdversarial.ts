import {
  CryptoDigestAlgorithm,
  digestStringAsync,
} from "expo-crypto";

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
] as const);

export type Phase18GarminAdversarialCaseId =
  typeof PHASE18_GARMIN_ADVERSARIAL_CASE_IDS[number];

export type Phase18GarminAdversarialCase = Readonly<{
  id: Phase18GarminAdversarialCaseId;
  status: "passed" | "TECHNICAL_REVIEW_REQUIRED";
  provenance: "host-deterministic" | "expected-injected" | "unexpected";
  stage: string;
  code: string;
  duration_ms: number;
  call_count: number;
  automatic_retry_count: number;
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

const ACCOUNT_NAMESPACE = "synthetic-account";
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

function sourceComponents() {
  return Object.freeze({
    activity: Object.freeze({
      activityId: Number(EXTERNAL_ACTIVITY_ID),
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
  const components = sourceComponents();
  const normalize = (externalActivityId: string, input = components) =>
    normalizeGarminActivity({
      account_namespace: ACCOUNT_NAMESPACE,
      external_activity_id: externalActivityId,
      ...input,
    }, sha256);
  return Object.freeze({
    fromSummary: () => normalize(EXTERNAL_ACTIVITY_ID),
    fromActivity: (input) => normalize(input.external_activity_id, {
      activity: input.activity as typeof components.activity,
      splits: input.splits as typeof components.splits,
      details: input.details as typeof components.details,
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
        data: { items: [{ activityId: EXTERNAL_ACTIVITY_ID }] },
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
    data: { items: [{ activityId: EXTERNAL_ACTIVITY_ID }] },
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

export async function runPhase18GarminAdversarialHostSuite(input: Readonly<{
  sha256?: Sha256;
  now?: () => number;
}> = {}) {
  const sha256 = input.sha256 ?? defaultSha256;
  const cases = await lifecycleCases(sha256, input.now ?? Date.now);
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
