import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

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

async function source(): Promise<GarminActivitySourcePort> {
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
    login: jest.fn(async () => ({ kind: "connected" as const, account_namespace: accountNamespace, generation: 1 })),
    resumeMfa: jest.fn(async () => ({ kind: "connected" as const, account_namespace: accountNamespace, generation: 1 })),
    logout: jest.fn(async () => undefined),
    listRunningSummaries: jest.fn(async () => ({ items: [summaryEnvelope] })),
    readActivity: jest.fn(async (activityId) => normalizeGarminActivity({
      account_namespace: accountNamespace,
      external_activity_id: activityId,
      ...components,
    }, sha256)),
  };
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
});
