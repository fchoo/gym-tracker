import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { confirmRunningActivityMatch } from "../../src/domains/running/activityMatchCommands";
import type { GarminActivitySourcePort } from "../../src/domains/activities/garminActivitySourcePort";
import { normalizeGarminActivity } from "../../src/platform/garmin/normalizeGarminActivity";
import {
  createGarminSharedImportCommitter,
  createGarminSyncCoordinator,
} from "../../src/platform/garmin/garminSyncCoordinator";
import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createImportedActivityRepository } from "../../src/platform/sqlite/repositories/importedActivityRepository";
import { createRunningActivityMatchRepository } from "../../src/platform/sqlite/repositories/runningActivityMatchRepository";
import { createRunningPlanRepository } from "../../src/platform/sqlite/repositories/runningPlanRepository";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";

const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(
    readonly changes: number,
    readonly lastInsertRowId: number,
    private readonly rows: readonly Row[],
  ) {}

  async getAllAsync() {
    return this.rows;
  }
}

class Statement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly SQLInputValue[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    }
    const result = this.statement.run(...parameters);
    return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
  }

  async finalizeAsync() {}
}

class Connection implements SqliteConnection {
  constructor(readonly db: DatabaseSync) {}

  async execAsync(sql: string) {
    this.db.exec(sql);
  }

  async prepareAsync(sql: string) {
    return new Statement(this.db.prepare(sql));
  }

  async isInTransactionAsync() {
    return this.db.isTransaction;
  }

  async closeAsync() {
    this.db.close();
  }
}

const directories = new Set<string>();
const kernels: SqliteKernel[] = [];

afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories.clear();
});

async function runtime() {
  const directory = mkdtempSync(join(tmpdir(), "gym-garmin-sync-"));
  directories.add(directory);
  const path = join(directory, "gym.db");
  const fixture = new DatabaseSync(path);
  fixture.exec(readFileSync(join(__dirname, "../migrations/fixtures/v6-metric-profiles.sql"), "utf8"));
  fixture.close();
  const writer = new Connection(new DatabaseSync(path));
  const reader = new Connection(new DatabaseSync(path));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ writer, reader });
  kernels.push(kernel);
  await createMigrationRunner({
    databaseName: path,
    kernel,
    migrations,
    recoveryBackup: {
      async createAndValidate(request) {
        return {
          backupId: "test",
          databaseName: request.databaseName,
          fromVersion: request.fromVersion,
          toVersion: request.toVersion,
          validated: true as const,
        };
      },
    },
  }).run();
  return { kernel, repository: createImportedActivityRepository(kernel) };
}

async function source(input: Readonly<{
  readActivity?: (externalActivityId: string) => ReturnType<GarminActivitySourcePort["readActivity"]>;
}> = {}): Promise<GarminActivitySourcePort> {
  const externalActivityId = "424242";
  const accountNamespace = "account-integration";
  const components = {
    activity: {
      activityId: 424242,
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
  const summaryEnvelope = await normalizeGarminActivity({
    account_namespace: accountNamespace,
    external_activity_id: externalActivityId,
    ...components,
  }, sha256);
  return {
    connectionState: jest.fn(async () => ({ kind: "connected" as const, account_namespace: accountNamespace, generation: 1 })),
    restoreSession: jest.fn(async () => ({ kind: "connected" as const, account_namespace: accountNamespace, generation: 1 })),
    login: jest.fn(async () => ({ kind: "connected" as const, account_namespace: accountNamespace, generation: 1 })),
    resumeMfa: jest.fn(async () => ({ kind: "connected" as const, account_namespace: accountNamespace, generation: 1 })),
    logout: jest.fn(async () => undefined),
    listRunningSummaries: jest.fn(async () => ({ items: [summaryEnvelope] })),
    readActivity: jest.fn(input.readActivity ?? (async (activityId: string) => normalizeGarminActivity({
        account_namespace: accountNamespace,
        external_activity_id: activityId,
        ...components,
      }, sha256))),
  };
}

function adapterError(code: string, retryAfterMs?: number): Error {
  const error = new Error(code) as Error & { code: string; retryAfterMs?: number };
  error.name = "GarminActivityAdapterError";
  error.code = code;
  if (retryAfterMs !== undefined) error.retryAfterMs = retryAfterMs;
  return error;
}

async function seedRunningMatch(kernel: SqliteKernel, activityId: string): Promise<void> {
  const plans = createRunningPlanRepository(kernel);
  await kernel.write((transaction) => transaction.execute(
    "UPDATE workout_sessions SET status = 'completed', completed_at_ms = COALESCE(completed_at_ms, started_at_ms), active_session_exercise_id = NULL, active_set_id = NULL WHERE status = 'in_progress'",
  ));
  await kernel.write((transaction) => transaction.execute(
    "INSERT INTO owned_plan_schedules (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind) VALUES ('garmin-strength-schedule', 'plan-copy', 'active', 1, 1, NULL, 'strength')",
  ));
  await plans.createInactiveMinimum({
    planId: "garmin-running-plan",
    planName: "Running",
    anchorDayId: "garmin-running-anchor",
    scheduleId: "garmin-running-schedule",
    scheduleVersionId: "garmin-running-version",
    scheduleBindingId: "garmin-running-binding",
    createdAtMs: 1_000,
    effectiveLocalDate: "2026-10-05",
    timezone: "Asia/Singapore",
    recoveryRevisionId: "garmin-running-session-v1",
    slots: [{
      id: "garmin-running-slot",
      weekday: "Monday",
      ordinal: 0,
      sessionRevisionId: "garmin-running-session-v1",
    }],
  });
  await plans.activateMinimum({
    planId: "garmin-running-plan",
    scheduleId: "garmin-running-schedule",
    expectedPlanRevision: 1,
    expectedScheduleRevision: 1,
    activatedAtMs: 2_000,
  });
  await plans.materializeOccurrences({
    planId: "garmin-running-plan",
    scheduleId: "garmin-running-schedule",
    scheduleVersionId: "garmin-running-version",
    localDate: "2026-10-05",
    timezone: "Asia/Singapore",
    createdAtMs: 3_000,
    occurrenceIds: ["garmin-running-opportunity"],
  });
  const [activity] = await kernel.queryAll<{ accepted_normalized_sha256: string }>("SELECT accepted_normalized_sha256 FROM imported_activity_identities WHERE activity_id = ?", [activityId]);
  if (activity === undefined) throw new Error("accepted_activity_missing");
  await confirmRunningActivityMatch(createRunningActivityMatchRepository(kernel), {
    requestId: "garmin-running-match",
    requestSha256: "f".repeat(64),
    action: "match",
    activityId,
    expectedActivityRevision: 1,
    expectedAcceptedPayloadSha256: activity.accepted_normalized_sha256,
    opportunityId: "garmin-running-opportunity",
    expectedOpportunityRevision: 1,
    expectedRelationRevision: 0,
    planId: "garmin-running-plan",
    scheduleId: "garmin-running-schedule",
    scheduleVersionId: "garmin-running-version",
    expectedScheduleRevision: 2,
    planDayId: "garmin-running-anchor",
    expectedPlanDayRevision: 1,
    slotId: "garmin-running-slot",
    slotRevisionId: "garmin-running-slot:revision:1",
    expectedSlotRevision: 1,
    sessionRevisionId: "garmin-running-session-v1",
    expectedSessionRevision: 1,
    occurredAtMs: 4_000,
  });
}

async function durableFacts(kernel: SqliteKernel) {
  const [identity] = await kernel.queryAll<{
    activity_id: string;
    accepted_normalized_sha256: string;
    aggregate_revision: number;
  }>("SELECT activity_id, accepted_normalized_sha256, aggregate_revision FROM imported_activity_identities");
  const payloads = await kernel.queryAll<{ sha256: string }>(
    "SELECT sha256 FROM imported_activity_payloads ORDER BY id",
  );
  const receipts = await kernel.queryAll<{ request_sha256: string }>(
    "SELECT request_sha256 FROM imported_activity_receipts ORDER BY id",
  );
  const matches = await kernel.queryAll<{
    activity_id: string;
    opportunity_id: string;
    relation_revision: number;
  }>("SELECT activity_id, opportunity_id, relation_revision FROM running_activity_current_matches ORDER BY activity_id");
  const matchEvents = await kernel.queryAll<{
    action: string;
    request_sha256: string;
  }>("SELECT action, request_sha256 FROM running_activity_match_events ORDER BY id");
  return { identity, payloads, receipts, matches, matchEvents };
}

describe("Garmin foreground sync", () => {
  it("normalizes one complete source activity and commits it through real SQLite exactly once", async () => {
    const { kernel, repository } = await runtime();
    const coordinator = createGarminSyncCoordinator({
      source: await source(),
      importActivity: createGarminSharedImportCommitter({
        repository,
        sha256,
        requestFor: async () => ({
          requestId: "garmin-sync-request",
          requestSha256: "d".repeat(64),
          activityId: "garmin-local-activity",
          expectedAggregateRevision: 0,
          confirmedLocalDate: "2026-10-06",
        }),
      }),
    });

    await expect(coordinator.syncNow()).resolves.toMatchObject({
      kind: "success",
      counts: { newActivities: 1, unchangedActivities: 0, reviewActivities: 0, failedActivities: 0 },
    });
    await expect(kernel.queryAll<{ activities: number; payloads: number; receipts: number }>(
      `SELECT
        (SELECT count(*) FROM imported_activities) AS activities,
        (SELECT count(*) FROM imported_activity_payloads) AS payloads,
        (SELECT count(*) FROM imported_activity_receipts) AS receipts`,
    )).resolves.toEqual([{ activities: 1, payloads: 1, receipts: 1 }]);
  });

  it("keeps exact replay unchanged and stages a changed digest for revision review", async () => {
    const { kernel, repository } = await runtime();
    const original = await normalizeGarminActivity({
      account_namespace: "account-integration",
      external_activity_id: "424242",
      activity: {
        activityId: 424242,
        activityTypeDTO: { typeKey: "running" },
        summaryDTO: { startTimeGMT: "2026-10-05T23:30:00.000Z", distance: 5_000 },
      },
      splits: { lapDTOs: [] },
      details: { metricDescriptors: [], activityDetailMetrics: [] },
    }, sha256);
    const revised = await normalizeGarminActivity({
      account_namespace: "account-integration",
      external_activity_id: "424242",
      activity: {
        activityId: 424242,
        activityTypeDTO: { typeKey: "running" },
        summaryDTO: { startTimeGMT: "2026-10-05T23:30:00.000Z", distance: 5_001 },
      },
      splits: { lapDTOs: [] },
      details: { metricDescriptors: [], activityDetailMetrics: [] },
    }, sha256);
    let current = original;
    let request = 0;
    const syncSource = await source({ readActivity: async () => current });
    const coordinator = createGarminSyncCoordinator({
      source: syncSource,
      importActivity: createGarminSharedImportCommitter({
        repository,
        sha256,
        requestFor: async () => {
          request += 1;
          return {
            requestId: `garmin-sync-request-${request}`,
            requestSha256: await sha256(`request-${request}`),
            activityId: "garmin-local-activity",
            expectedAggregateRevision: 0,
            confirmedLocalDate: "2026-10-06",
          };
        },
      }),
    });

    await expect(coordinator.syncNow()).resolves.toMatchObject({ kind: "success", counts: { newActivities: 1 } });
    await expect(coordinator.syncNow()).resolves.toMatchObject({ kind: "success", counts: { unchangedActivities: 1 } });
    const [acceptedBefore] = await kernel.queryAll<{ accepted_normalized_sha256: string }>(
      "SELECT accepted_normalized_sha256 FROM imported_activity_identities",
    );
    current = revised;
    await expect(coordinator.syncNow()).resolves.toMatchObject({ kind: "success", counts: { reviewActivities: 1 } });

    await expect(kernel.queryAll<{
      accepted_normalized_sha256: string;
      payloads: number;
      events: number;
    }>(`SELECT accepted_normalized_sha256,
        (SELECT count(*) FROM imported_activity_payloads) AS payloads,
        (SELECT count(*) FROM imported_activity_events) AS events
      FROM imported_activity_identities`)).resolves.toEqual([{
      accepted_normalized_sha256: acceptedBefore!.accepted_normalized_sha256,
      payloads: 1,
      events: 1,
    }]);
  });

  it("preserves prior activity, source, receipt, and match facts across every classified read failure", async () => {
    const { kernel, repository } = await runtime();
    let fault: Error | undefined;
    const syncSource = await source({
      readActivity: async (externalActivityId) => {
        if (fault !== undefined) throw fault;
        return normalizeGarminActivity({
          account_namespace: "account-integration",
          external_activity_id: externalActivityId,
          activity: {
            activityId: Number(externalActivityId),
            activityTypeDTO: { typeKey: "running" },
            summaryDTO: { startTimeGMT: "2026-10-05T23:30:00.000Z", distance: 5_000 },
          },
          splits: { lapDTOs: [] },
          details: { metricDescriptors: [], activityDetailMetrics: [] },
        }, sha256);
      },
    });
    const coordinator = createGarminSyncCoordinator({
      source: syncSource,
      importActivity: createGarminSharedImportCommitter({
        repository,
        sha256,
        requestFor: async () => ({
          requestId: "garmin-preservation-import",
          requestSha256: "a".repeat(64),
          activityId: "garmin-preserved-activity",
          expectedAggregateRevision: 0,
          confirmedLocalDate: "2026-10-06",
        }),
      }),
    });
    await expect(coordinator.syncNow()).resolves.toMatchObject({ kind: "success", counts: { newActivities: 1 } });
    await seedRunningMatch(kernel, "garmin-preserved-activity");
    const before = await durableFacts(kernel);
    const readActivity = syncSource.readActivity as jest.MockedFunction<GarminActivitySourcePort["readActivity"]>;

    for (const [code, retryAfterMs] of [
      ["offline", undefined],
      ["timeout", undefined],
      ["temporary_failure", undefined],
      ["data_access_denied", undefined],
      ["rate_limited", 1_800_000],
      ["malformed_response", undefined],
    ] as const) {
      fault = adapterError(code, retryAfterMs);
      const callsBefore = readActivity.mock.calls.length;
      await expect(coordinator.syncNow()).resolves.toMatchObject({
        kind: "failure",
        counts: { failedActivities: 1 },
        failure: {
          code,
          ...(code === "rate_limited" ? { retryAfterMs: 900_000 } : {}),
        },
      });
      expect(readActivity.mock.calls.length - callsBefore).toBe(1);
      await expect(durableFacts(kernel)).resolves.toEqual(before);
    }
  });

  it("replays a committed receipt after process interruption without duplicating facts", async () => {
    const { kernel, repository } = await runtime();
    let interrupt = true;
    const interruptedRepository = {
      async confirmGarminImport(input: Parameters<typeof repository.confirmGarminImport>[0]) {
        const result = await repository.confirmGarminImport(input);
        if (interrupt) {
          interrupt = false;
          throw new Error("synthetic_process_interruption");
        }
        return result;
      },
    };
    const coordinator = createGarminSyncCoordinator({
      source: await source(),
      importActivity: createGarminSharedImportCommitter({
        repository: interruptedRepository,
        sha256,
        requestFor: async () => ({
          requestId: "garmin-interrupted-import",
          requestSha256: "b".repeat(64),
          activityId: "garmin-interrupted-activity",
          expectedAggregateRevision: 0,
          confirmedLocalDate: "2026-10-06",
        }),
      }),
    });

    await expect(coordinator.syncNow()).resolves.toMatchObject({
      kind: "failure",
      counts: { newActivities: 0, failedActivities: 1 },
      failure: { code: "temporary_failure" },
    });
    const afterInterruption = await durableFacts(kernel);
    await expect(coordinator.syncNow()).resolves.toMatchObject({
      kind: "success",
      counts: { unchangedActivities: 1, failedActivities: 0 },
    });
    await expect(durableFacts(kernel)).resolves.toEqual(afterInterruption);
  });
});
