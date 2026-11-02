import { afterEach, describe, expect, it } from "@jest/globals";
import { DatabaseSync } from "node:sqlite";

import type {
  SqliteConnection,
  SqlitePreparedResult,
  SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import { configureSqliteConnection } from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createGarminSyncSummaryRepository } from "../../src/platform/sqlite/repositories/garminSyncSummaryRepository";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(
    readonly changes: number,
    readonly lastInsertRowId: number,
    private readonly rows: readonly Row[],
  ) {}

  async getAllAsync(): Promise<readonly Row[]> { return this.rows; }
}

class Statement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly (null | number | string | Uint8Array)[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    }
    const result = this.statement.run(...parameters);
    return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
  }

  async finalizeAsync(): Promise<void> {}
}

class Connection implements SqliteConnection {
  private closed = false;

  constructor(private readonly database: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> { this.database.exec(sql); }
  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new Statement(this.database.prepare(sql));
  }
  async isInTransactionAsync(): Promise<boolean> { return this.database.isTransaction; }
  async closeAsync(): Promise<void> {
    if (!this.closed) {
      this.database.close();
      this.closed = true;
    }
  }
}

const kernels = new Set<SqliteKernel>();

afterEach(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
});

async function open(): Promise<SqliteKernel> {
  const connection = new Connection(new DatabaseSync(":memory:"));
  await configureSqliteConnection(connection, { enableWal: false });
  const kernel = createSqliteKernel({ reader: connection, writer: connection });
  kernels.add(kernel);
  await createMigrationRunner({
    databaseName: "garmin-sync-summary-host",
    kernel,
    migrations,
    recoveryBackup: {
      createAndValidate: async (request) => ({
        backupId: "host",
        databaseName: request.databaseName,
        fromVersion: request.fromVersion,
        toVersion: request.toVersion,
        validated: true,
      }),
    },
  }).run();
  return kernel;
}

const firstSummary = Object.freeze({
  attemptId: "garmin-sync:1000:2:4",
  completedAtMs: 1_000,
  counts: Object.freeze({
    pages: 2,
    discoveredActivities: 4,
    attemptedActivities: 4,
    newActivities: 1,
    unchangedActivities: 2,
    reviewActivities: 1,
    failedActivities: 0,
  }),
});

describe("Garmin sync summary repository host SQLite", () => {
  it("persists one bounded successful receipt across repository recreation", async () => {
    const kernel = await open();
    const first = createGarminSyncSummaryRepository(kernel);

    await expect(first.load()).resolves.toBeNull();
    await expect(first.save(firstSummary)).resolves.toBeUndefined();

    const reopened = createGarminSyncSummaryRepository(kernel);
    await expect(reopened.load()).resolves.toEqual(firstSummary);
  });

  it("replaces only with a current-or-newer successful receipt", async () => {
    const kernel = await open();
    const repository = createGarminSyncSummaryRepository(kernel);
    await repository.save(firstSummary);
    const newer = Object.freeze({
      ...firstSummary,
      attemptId: "garmin-sync:2000:3:5",
      completedAtMs: 2_000,
      counts: Object.freeze({
        ...firstSummary.counts,
        pages: 3,
        discoveredActivities: 5,
        attemptedActivities: 5,
        unchangedActivities: 3,
      }),
    });

    await expect(repository.save(newer)).resolves.toBeUndefined();
    await expect(repository.save(firstSummary)).rejects.toThrow("garmin_sync_summary_stale");
    await expect(repository.load()).resolves.toEqual(newer);
  });

  it("rejects malformed or non-success counts before SQLite writes", async () => {
    const repository = createGarminSyncSummaryRepository(await open());

    await expect(repository.save({
      ...firstSummary,
      counts: { ...firstSummary.counts, failedActivities: 1 },
    })).rejects.toThrow("garmin_sync_summary_invalid");
    await expect(repository.load()).resolves.toBeNull();
  });

  it("rejects every invalid bounded receipt field before writing", async () => {
    const repository = createGarminSyncSummaryRepository(await open());
    const invalid = [
      { ...firstSummary, attemptId: "" },
      { ...firstSummary, attemptId: "x".repeat(129) },
      { ...firstSummary, completedAtMs: -1 },
      { ...firstSummary, completedAtMs: 1.5 },
      { ...firstSummary, counts: { ...firstSummary.counts, pages: 0 } },
      { ...firstSummary, counts: { ...firstSummary.counts, discoveredActivities: -1 } },
      { ...firstSummary, counts: { ...firstSummary.counts, attemptedActivities: -1 } },
      { ...firstSummary, counts: { ...firstSummary.counts, newActivities: -1 } },
      { ...firstSummary, counts: { ...firstSummary.counts, unchangedActivities: -1 } },
      { ...firstSummary, counts: { ...firstSummary.counts, reviewActivities: -1 } },
      { ...firstSummary, counts: { ...firstSummary.counts, failedActivities: -1 } },
      { ...firstSummary, counts: { ...firstSummary.counts, discoveredActivities: 3 } },
      { ...firstSummary, counts: { ...firstSummary.counts, newActivities: 0 } },
      { ...firstSummary, counts: { ...firstSummary.counts, failedActivities: 1 } },
    ];

    for (const summary of invalid) {
      await expect(repository.save(summary)).rejects.toThrow("garmin_sync_summary_invalid");
    }
    await expect(repository.load()).resolves.toBeNull();
  });

  it("fails closed when the singleton read returns duplicate or malformed rows", async () => {
    const validRow = {
      attempt_id: firstSummary.attemptId,
      completed_at_ms: firstSummary.completedAtMs,
      pages: firstSummary.counts.pages,
      discovered_activities: firstSummary.counts.discoveredActivities,
      attempted_activities: firstSummary.counts.attemptedActivities,
      new_activities: firstSummary.counts.newActivities,
      unchanged_activities: firstSummary.counts.unchangedActivities,
      review_activities: firstSummary.counts.reviewActivities,
      failed_activities: firstSummary.counts.failedActivities,
    };
    const fakeKernel = (rows: readonly Record<string, unknown>[]) => ({
      queryAll: async () => rows,
    }) as unknown as SqliteKernel;

    await expect(createGarminSyncSummaryRepository(fakeKernel([validRow, validRow])).load())
      .rejects.toThrow("garmin_sync_summary_invalid");
    await expect(createGarminSyncSummaryRepository(fakeKernel([{
      ...validRow,
      attempt_id: 42,
    }])).load()).rejects.toThrow("garmin_sync_summary_invalid");
  });
});
