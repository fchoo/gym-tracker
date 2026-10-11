import { createHash } from "node:crypto";
import { describe, expect, it, jest } from "@jest/globals";

import type {
  GarminActivitySourcePort,
  GarminSourceEnvelope,
} from "../../domains/activities/garminActivitySourcePort";
import type { GarminImportResult, ImportedActivityCommandRepository } from "../../domains/activities/importCommands";
import {
  canonicalizeGarminPayload,
  GARMIN_CANONICAL_LIMITS,
} from "./canonicalGarminPayload";
import {
  createGarminActivityAdapter,
  type GarminActivityMapper,
  type GarminNativeDriver,
} from "./garminActivityAdapter";
import { normalizeGarminActivity } from "./normalizeGarminActivity";
import {
  createGarminSharedImportCommitter,
  createGarminSyncCoordinator,
} from "./garminSyncCoordinator";
import type {
  GarminSyncFailureCode,
  GarminSyncLimits,
  GarminSyncProgress,
} from "./garminSyncContracts";
import { GARMIN_SYNC_HARD_LIMITS } from "./garminSyncContracts";

const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");

function sourceComponents(externalActivityId = "424242") {
  return {
    activity: {
      activityId: Number(externalActivityId),
      activityTypeDTO: { typeKey: "running" },
      summaryDTO: {
        startTimeGMT: "2026-10-05T23:30:00.000Z",
        distance: 5_000,
        duration: 1_500,
        elapsedDuration: 1_560,
        movingDuration: 1_475,
      },
    },
    splits: { lapDTOs: [] },
    details: { metricDescriptors: [], activityDetailMetrics: [] },
  };
}

async function connectedAdapter() {
  const externalActivityId = "424242";
  const accountNamespace = "account-fixture";
  const components = sourceComponents(externalActivityId);
  const summaryEnvelope = await normalizeGarminActivity({
    account_namespace: accountNamespace,
    external_activity_id: externalActivityId,
    ...components,
  }, sha256);
  const operations: string[] = [];
  const driver: GarminNativeDriver = {
    connectionState: jest.fn(async () => {
      operations.push("connectionState");
      return { status: "ok" as const, generation: 1, data: { kind: "connected" as const, account_namespace: accountNamespace } };
    }),
    login: jest.fn(async () => ({
      status: "ok" as const,
      generation: 1,
      data: { kind: "connected" as const, account_namespace: accountNamespace },
    })),
    resumeMfa: jest.fn(async () => ({ status: "error" as const, error: { code: "mfa_expired" as const } })),
    logout: jest.fn(async () => ({ status: "ok" as const, generation: 2, data: { kind: "disconnected" as const } })),
    getActivities: jest.fn(async () => {
      operations.push("getActivities");
      return { status: "ok" as const, generation: 1, data: { items: [{ activityId: externalActivityId }] } };
    }),
    getActivity: jest.fn(async () => {
      operations.push("getActivity");
      return { status: "ok" as const, generation: 1, data: components.activity };
    }),
    getActivitySplits: jest.fn(async () => {
      operations.push("getActivitySplits");
      return { status: "ok" as const, generation: 1, data: components.splits };
    }),
    getActivityDetails: jest.fn(async (input) => {
      operations.push("getActivityDetails");
      expect(input).toEqual({ externalActivityId, maxchart: 2_000, maxpoly: 4_000 });
      return { status: "ok" as const, generation: 1, data: components.details };
    }),
  };
  const mapper: GarminActivityMapper = {
    fromSummary: () => summaryEnvelope,
    fromActivity: async (input) => {
      operations.push("normalizeGarminActivity");
      return normalizeGarminActivity({ account_namespace: accountNamespace, ...input }, sha256);
    },
  };
  const source = createGarminActivityAdapter({ driver, mapper });
  await source.login({ email: "synthetic-owner", password: "synthetic-secret" });
  return { driver, operations, source };
}

async function envelope(externalActivityId: string): Promise<GarminSourceEnvelope> {
  return normalizeGarminActivity({
    account_namespace: "account-fixture",
    external_activity_id: externalActivityId,
    ...sourceComponents(externalActivityId),
  }, sha256);
}

function pagedSource(
  pages: ReadonlyMap<string, Readonly<{ items: readonly GarminSourceEnvelope[]; next_cursor?: string }>>,
  readActivity: (externalActivityId: string) => Promise<GarminSourceEnvelope>,
): GarminActivitySourcePort {
  return {
    connectionState: jest.fn(async () => ({ kind: "connected" as const, account_namespace: "account-fixture", generation: 1 })),
    login: jest.fn(async () => ({ kind: "connected" as const, account_namespace: "account-fixture", generation: 1 })),
    resumeMfa: jest.fn(async () => ({ kind: "connected" as const, account_namespace: "account-fixture", generation: 1 })),
    logout: jest.fn(async () => undefined),
    listRunningSummaries: jest.fn(async (input: Readonly<{ cursor?: string; limit: number }>) =>
      pages.get(input.cursor ?? "start") ?? { items: [] }),
    readActivity: jest.fn(readActivity),
  };
}

const syncLimitCases: Array<[string, keyof GarminSyncLimits, number]> = [
  ["page size", "pageSize", GARMIN_SYNC_HARD_LIMITS.pageSize],
  ["page count", "maxPages", GARMIN_SYNC_HARD_LIMITS.maxPages],
  ["activity count", "maxActivities", GARMIN_SYNC_HARD_LIMITS.maxActivities],
];

const syncFailureCases: Array<[string, GarminSyncFailureCode, number | undefined]> = [
  ["offline", "offline", undefined],
  ["timeout", "timeout", undefined],
  ["temporary_failure", "temporary_failure", undefined],
  ["data_access_denied", "data_access_denied", undefined],
  ["rate_limited", "rate_limited", 9_999_999],
  ["malformed_response", "malformed_response", undefined],
];

function adapterError(code: string, retryAfterMs?: number): Error {
  const error = new Error(code) as Error & { code: string; retryAfterMs?: number };
  error.name = "GarminActivityAdapterError";
  error.code = code;
  if (retryAfterMs !== undefined) error.retryAfterMs = retryAfterMs;
  return error;
}

describe("Garmin sync coordinator", () => {
  it("reads one complete Running activity and counts it only after the shared import commits", async () => {
    const { driver, operations, source } = await connectedAdapter();
    const progress: GarminSyncProgress[] = [];
    const prepareSha256 = jest.fn(sha256);
    const committed: GarminImportResult = { kind: "imported", activityId: "local-activity", aggregateRevision: 1 };
    const repository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn(async () => {
        expect(progress.every((event) => event.counts.newActivities === 0)).toBe(true);
        return committed;
      }),
    };
    const importActivity = createGarminSharedImportCommitter({
      repository,
      sha256: prepareSha256,
      requestFor: async () => ({
        requestId: "garmin-sync-request",
        requestSha256: "d".repeat(64),
        activityId: "local-activity",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-10-06",
      }),
    });
    const coordinator = createGarminSyncCoordinator({ source, importActivity });

    const result = await coordinator.syncNow({ onProgress: (event) => progress.push(event) });

    expect(result).toEqual({
      kind: "success",
      counts: {
        pages: 1,
        discoveredActivities: 1,
        attemptedActivities: 1,
        newActivities: 1,
        unchangedActivities: 0,
        reviewActivities: 0,
        failedActivities: 0,
      },
    });
    expect(operations).toEqual([
      "connectionState",
      "getActivities",
      "connectionState",
      "getActivity",
      "getActivitySplits",
      "getActivityDetails",
      "normalizeGarminActivity",
      "connectionState",
      "connectionState",
    ]);
    expect(driver.getActivity).toHaveBeenCalledTimes(1);
    expect(driver.getActivitySplits).toHaveBeenCalledTimes(1);
    expect(driver.getActivityDetails).toHaveBeenCalledTimes(1);
    expect(repository.confirmGarminImport).toHaveBeenCalledTimes(1);
    expect(prepareSha256).toHaveBeenCalledTimes(1);
    expect(progress.at(-1)).toMatchObject({ kind: "committed", counts: { newActivities: 1 } });
  });

  it.each(syncLimitCases)("accepts %s limit-1 and limit but rejects limit+1", async (_label, key, limit) => {
    const source = pagedSource(new Map(), async () => envelope("1"));
    const importActivity = jest.fn(async () => ({ kind: "imported" as const, activityId: "local", aggregateRevision: 1 }));

    expect(() => createGarminSyncCoordinator({ source, importActivity, limits: { [key]: limit - 1 } })).not.toThrow();
    expect(() => createGarminSyncCoordinator({ source, importActivity, limits: { [key]: limit } })).not.toThrow();
    expect(() => createGarminSyncCoordinator({ source, importActivity, limits: { [key]: limit + 1 } })).toThrow("malformed_response");
  });

  it("accepts exact canonical array, nesting, string, and byte bounds and rejects limit+1", () => {
    const nested = (depth: number): unknown => depth === 0 ? null : [nested(depth - 1)];
    const byteFixture = (lastStringLength: number) => [
      ...Array.from({ length: 122 }, () => "x".repeat(GARMIN_CANONICAL_LIMITS.maxStringCodeUnits)),
      "x".repeat(lastStringLength),
    ];

    expect(() => canonicalizeGarminPayload(Array.from({ length: GARMIN_CANONICAL_LIMITS.maxArrayLength - 1 }, () => null))).not.toThrow();
    expect(() => canonicalizeGarminPayload(Array.from({ length: GARMIN_CANONICAL_LIMITS.maxArrayLength }, () => null))).not.toThrow();
    expect(() => canonicalizeGarminPayload(Array.from({ length: GARMIN_CANONICAL_LIMITS.maxArrayLength + 1 }, () => null))).toThrow("garmin_json_limit");
    expect(() => canonicalizeGarminPayload(nested(GARMIN_CANONICAL_LIMITS.maxDepth))).not.toThrow();
    expect(() => canonicalizeGarminPayload(nested(GARMIN_CANONICAL_LIMITS.maxDepth + 1))).toThrow("garmin_json_limit");
    expect(() => canonicalizeGarminPayload("x".repeat(GARMIN_CANONICAL_LIMITS.maxStringCodeUnits))).not.toThrow();
    expect(() => canonicalizeGarminPayload("x".repeat(GARMIN_CANONICAL_LIMITS.maxStringCodeUnits + 1))).toThrow("garmin_json_limit");
    expect(Buffer.byteLength(canonicalizeGarminPayload(byteFixture(781)), "utf8")).toBe(GARMIN_CANONICAL_LIMITS.maxCanonicalBytes - 1);
    expect(Buffer.byteLength(canonicalizeGarminPayload(byteFixture(782)), "utf8")).toBe(GARMIN_CANONICAL_LIMITS.maxCanonicalBytes);
    expect(() => canonicalizeGarminPayload(byteFixture(783))).toThrow("garmin_json_limit");
  });

  it("stops at configured page/activity bounds and exposes count-only progress", async () => {
    const activities = await Promise.all(["1", "2", "3", "4"].map(envelope));
    const source = pagedSource(new Map([
      ["start", { items: activities.slice(0, 2), next_cursor: "2" }],
      ["2", { items: activities.slice(2), next_cursor: "4" }],
    ]), async (externalActivityId) => activities.find((item) => item.external_activity_id === externalActivityId)!);
    const progress: GarminSyncProgress[] = [];
    const importActivity = jest.fn(async () => ({ kind: "imported" as const, activityId: "local", aggregateRevision: 1 }));
    const coordinator = createGarminSyncCoordinator({
      source,
      importActivity,
      limits: { pageSize: 2, maxPages: 2, maxActivities: 3 },
    });

    const result = await coordinator.syncNow({ onProgress: (event) => progress.push(event) });

    expect(result).toMatchObject({
      kind: "success",
      counts: { pages: 2, discoveredActivities: 3, attemptedActivities: 3, newActivities: 3 },
    });
    expect(source.listRunningSummaries).toHaveBeenCalledTimes(2);
    expect(source.readActivity).toHaveBeenCalledTimes(3);
    expect(importActivity).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(progress)).not.toMatch(/account-fixture|external|activityId|[1-4]{6}/u);
  });

  it("cancels only at an activity boundary and retains the prior committed count", async () => {
    const activities = await Promise.all(["1", "2"].map(envelope));
    let cancelled = false;
    const source = pagedSource(new Map([
      ["start", { items: activities }],
    ]), async (externalActivityId) => activities.find((item) => item.external_activity_id === externalActivityId)!);
    const importActivity = jest.fn(async () => {
      cancelled = true;
      return { kind: "imported" as const, activityId: "local", aggregateRevision: 1 };
    });
    const coordinator = createGarminSyncCoordinator({ source, importActivity });

    await expect(coordinator.syncNow({ isCancelled: () => cancelled })).resolves.toMatchObject({
      kind: "cancelled",
      counts: { attemptedActivities: 1, newActivities: 1, failedActivities: 0 },
    });
    expect(source.readActivity).toHaveBeenCalledTimes(1);
    expect(importActivity).toHaveBeenCalledTimes(1);
  });

  it("counts a malformed selected activity as failed without losing a prior committed result", async () => {
    const first = await envelope("1");
    const malformed = { ...await envelope("2"), external_activity_id: "malformed" } as GarminSourceEnvelope;
    const source = pagedSource(new Map([
      ["start", { items: [first, malformed] }],
    ]), async () => first);
    const importActivity = jest.fn(async () => ({ kind: "imported" as const, activityId: "local", aggregateRevision: 1 }));
    const coordinator = createGarminSyncCoordinator({ source, importActivity });

    await expect(coordinator.syncNow()).resolves.toMatchObject({
      kind: "partial",
      counts: { newActivities: 1, failedActivities: 1 },
      failure: { code: "malformed_response" },
    });
    expect(importActivity).toHaveBeenCalledTimes(1);
  });

  it.each(syncFailureCases)("reduces %s once without retrying or exposing source detail", async (sourceCode, expectedCode, retryAfterMs) => {
    const summary = await envelope("1");
    const readActivity = jest.fn(async () => {
      throw adapterError(sourceCode, retryAfterMs);
    });
    const source = pagedSource(new Map([["start", { items: [summary] }]]), readActivity);
    const importActivity = jest.fn(async () => ({ kind: "imported" as const, activityId: "local", aggregateRevision: 1 }));
    const coordinator = createGarminSyncCoordinator({ source, importActivity });

    const result = await coordinator.syncNow();

    expect(result).toMatchObject({
      kind: "failure",
      counts: { attemptedActivities: 1, failedActivities: 1 },
      failure: { code: expectedCode },
    });
    if (expectedCode === "rate_limited") {
      expect(result).toMatchObject({ failure: { retryAfterMs: GARMIN_SYNC_HARD_LIMITS.maxRetryAfterMs } });
    }
    expect(readActivity).toHaveBeenCalledTimes(1);
    expect(importActivity).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/account-fixture|source detail|external_activity_id/u);
  });

  it("rejects logout during canonical preparation before the shared repository write", async () => {
    const { source } = await connectedAdapter();
    const repository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn(async () => ({ kind: "imported" as const, activityId: "local", aggregateRevision: 1 })),
    };
    const prepareSha256 = jest.fn(async (value: string) => {
      await source.logout();
      return sha256(value);
    });
    const coordinator = createGarminSyncCoordinator({
      source,
      importActivity: createGarminSharedImportCommitter({
        repository,
        sha256: prepareSha256,
        requestFor: async () => ({
          requestId: "generation-fence",
          requestSha256: "e".repeat(64),
          activityId: "local",
          expectedAggregateRevision: 0,
          confirmedLocalDate: "2026-10-06",
        }),
      }),
    });

    await expect(coordinator.syncNow()).resolves.toMatchObject({
      kind: "failure",
      counts: { failedActivities: 1, newActivities: 0 },
      failure: { code: "stale_generation" },
    });
    expect(repository.confirmGarminImport).not.toHaveBeenCalled();
  });

  it("serializes foreground attempts and rejects overlap without starting another page", async () => {
    const summary = await envelope("1");
    const source = pagedSource(new Map([["start", { items: [summary] }]]), async () => summary);
    let releaseImport!: (result: GarminImportResult) => void;
    const importResult = new Promise<GarminImportResult>((resolve) => {
      releaseImport = resolve;
    });
    const importActivity = jest.fn(async () => importResult);
    const coordinator = createGarminSyncCoordinator({ source, importActivity });
    const first = coordinator.syncNow();
    await new Promise<void>((resolve) => {
      const check = () => importActivity.mock.calls.length === 1 ? resolve() : queueMicrotask(check);
      check();
    });

    await expect(coordinator.syncNow()).resolves.toMatchObject({
      kind: "failure",
      failure: { code: "sync_in_progress" },
    });
    expect(source.listRunningSummaries).toHaveBeenCalledTimes(1);

    releaseImport({ kind: "imported", activityId: "local", aggregateRevision: 1 });
    await expect(first).resolves.toMatchObject({ kind: "success", counts: { newActivities: 1 } });
  });
});
