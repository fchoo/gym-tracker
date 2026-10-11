import { createHash } from "node:crypto";
import { describe, expect, it, jest } from "@jest/globals";

import type { GarminImportResult, ImportedActivityCommandRepository } from "../../domains/activities/importCommands";
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
import type { GarminSyncProgress } from "./garminSyncContracts";

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
    ]);
    expect(driver.getActivity).toHaveBeenCalledTimes(1);
    expect(driver.getActivitySplits).toHaveBeenCalledTimes(1);
    expect(driver.getActivityDetails).toHaveBeenCalledTimes(1);
    expect(repository.confirmGarminImport).toHaveBeenCalledTimes(1);
    expect(prepareSha256).toHaveBeenCalledTimes(1);
    expect(progress.at(-1)).toMatchObject({ kind: "committed", counts: { newActivities: 1 } });
  });
});
