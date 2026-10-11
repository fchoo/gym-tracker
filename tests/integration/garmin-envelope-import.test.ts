import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "@jest/globals";

import { createGarminImportRuntime } from "../../src/bootstrap/garminImportRuntime";
import { normalizeGarminActivity } from "../../src/platform/garmin/normalizeGarminActivity";
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
  async execAsync(sql: string) { this.db.exec(sql); }
  async prepareAsync(sql: string) { return new Statement(this.db.prepare(sql)); }
  async isInTransactionAsync() { return this.db.isTransaction; }
  async closeAsync() { this.db.close(); }
}

const directories = new Set<string>();
const kernels: SqliteKernel[] = [];

afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories.clear();
});

async function applicationRuntime(input: Readonly<{
  invalidateReads?: () => Promise<void>;
}> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "gym-garmin-envelope-"));
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
  const services = Object.freeze({
    importedActivities: createImportedActivityRepository(kernel),
  });
  return {
    kernel,
    runtime: createGarminImportRuntime({
      services,
      sha256,
      invalidateReads: input.invalidateReads ?? (async () => undefined),
    }),
  };
}

async function envelope() {
  return normalizeGarminActivity({
    account_namespace: "account-integration",
    external_activity_id: "424242",
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
  }, sha256);
}

describe("Garmin envelope import boundary", () => {
  it("commits one normalized envelope through the existing application import service", async () => {
    const { kernel, runtime } = await applicationRuntime();
    const source = await envelope();
    const input = {
      envelope: source,
      confirmation: {
        requestId: "request-envelope",
        requestSha256: "d".repeat(64),
        activityId: "activity-envelope",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-10-06",
      },
    };

    await expect(runtime.commitEnvelope(input)).resolves.toEqual({
      kind: "imported",
      activityId: "activity-envelope",
      aggregateRevision: 1,
    });
    await expect(kernel.queryAll<{
      activity_id: string;
      request_sha256: string;
      confirmed_local_date: string;
    }>(`SELECT receipt.activity_id, receipt.request_sha256,
              json_extract(activity.aggregate_json, '$.confirmed_local_date') AS confirmed_local_date
         FROM imported_activity_receipts receipt
         JOIN imported_activities activity ON activity.id = receipt.activity_id
        WHERE receipt.id = ?`, [input.confirmation.requestId])).resolves.toEqual([{
      activity_id: input.confirmation.activityId,
      request_sha256: input.confirmation.requestSha256,
      confirmed_local_date: input.confirmation.confirmedLocalDate,
    }]);
    expect(source).not.toHaveProperty("fit_sha256");
    expect(source.normalized).toMatchObject({
      sport: "running",
      subtype: "outdoor",
      distance_meters: 5_000,
      elapsed_ms: 1_560_000,
      timer_ms: 1_500_000,
      moving_ms: 1_475_000,
    });
  });

  it("replays a committed receipt after acknowledgement is lost without a second dirty advance", async () => {
    let acknowledgements = 0;
    const { kernel, runtime } = await applicationRuntime({
      invalidateReads: async () => {
        acknowledgements += 1;
        throw new Error("acknowledgement_lost");
      },
    });
    const input = {
      envelope: await envelope(),
      confirmation: {
        requestId: "request-lost-ack",
        requestSha256: "e".repeat(64),
        activityId: "activity-lost-ack",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-10-06",
      },
    };

    await expect(runtime.commitEnvelope(input)).rejects.toThrow("acknowledgement_lost");
    const [afterCommit] = await kernel.queryAll<{ mutation_generation: number }>(
      "SELECT mutation_generation FROM automatic_backup_state WHERE id = 1",
    );
    await expect(runtime.commitEnvelope(input)).resolves.toEqual({
      kind: "replayed",
      activityId: input.confirmation.activityId,
      aggregateRevision: 1,
    });
    const [afterReplay] = await kernel.queryAll<{ mutation_generation: number }>(
      "SELECT mutation_generation FROM automatic_backup_state WHERE id = 1",
    );

    expect(acknowledgements).toBe(1);
    expect(afterReplay).toEqual(afterCommit);
    await expect(kernel.queryAll<{ count: number }>(
      "SELECT count(*) AS count FROM imported_activity_receipts WHERE id = ?",
      [input.confirmation.requestId],
    )).resolves.toEqual([{ count: 1 }]);
  });

  it("prepares ambiguous source time without writes and persists explicit midnight provenance on confirmation", async () => {
    const { kernel, runtime } = await applicationRuntime();
    const proposal = await runtime.prepareEnvelope({
      envelope: await envelope(),
      sourceDate: Object.freeze({
        sourceLocalDateTime: "2026-10-06T00:30:00",
      }),
    });

    expect(proposal.kind).toBe("date_confirmation_required");
    await expect(kernel.queryAll<{ activities: number; receipts: number }>(
      `SELECT (SELECT count(*) FROM imported_activities) AS activities,
              (SELECT count(*) FROM imported_activity_receipts) AS receipts`,
    )).resolves.toEqual([{ activities: 0, receipts: 0 }]);

    const request = {
      requestId: "request-midnight",
      requestSha256: "2".repeat(64),
      activityId: "activity-midnight",
      expectedAggregateRevision: 0,
    };
    const decision = Object.freeze({
      kind: "confirmed" as const,
      localDate: "2026-10-06",
      localTime: "00:30:00",
      timeZone: "Asia/Singapore",
      utcOffsetMinutes: 480,
    });

    await expect(runtime.confirmPreparedDate({ proposal, request, decision })).resolves.toMatchObject({
      kind: "imported",
      activityId: request.activityId,
    });
    await expect(kernel.queryAll<{ date_provenance: string }>(
      "SELECT json_extract(aggregate_json, '$.date_provenance') AS date_provenance FROM imported_activities WHERE id = ?",
      [request.activityId],
    )).resolves.toEqual([{
      date_provenance: JSON.stringify({
        absolute_started_at_ms: proposal.date.absoluteStartedAtMs,
        source_local_date_time: "2026-10-06T00:30:00",
        confirmed_local_date: "2026-10-06",
        confirmed_local_time: "00:30:00",
        confirmed_time_zone: "Asia/Singapore",
        confirmed_utc_offset_minutes: 480,
      }),
    }]);

    await expect(runtime.confirmPreparedDate({ proposal, request, decision })).resolves.toMatchObject({
      kind: "replayed",
      activityId: request.activityId,
    });
  });

  it.each([
    ["cancelled", "America/New_York"],
    ["stale", "Asia/Singapore"],
    ["invalid", "Australia/Lord_Howe"],
    ["dst_gap", "America/New_York"],
  ] as Array<[
    "cancelled" | "stale" | "invalid" | "dst_gap",
    string,
  ]>)("keeps %s date outcomes zero-write regardless of phone zone %s", async (reason, phoneZone) => {
    const { kernel, runtime } = await applicationRuntime();
    const proposal = await runtime.prepareEnvelope({
      envelope: await envelope(),
      sourceDate: Object.freeze({
        sourceLocalDateTime: "2026-03-08T02:30:00",
        sourceTimeZone: phoneZone,
      }),
    });

    await expect(runtime.confirmPreparedDate({
      proposal,
      request: {
        requestId: `request-${reason}`,
        requestSha256: "3".repeat(64),
        activityId: `activity-${reason}`,
        expectedAggregateRevision: 0,
      },
      decision: Object.freeze({ kind: reason }),
    })).resolves.toEqual({ kind: "not_committed", reason });
    await expect(kernel.queryAll<{ activities: number; receipts: number }>(
      `SELECT (SELECT count(*) FROM imported_activities) AS activities,
              (SELECT count(*) FROM imported_activity_receipts) AS receipts`,
    )).resolves.toEqual([{ activities: 0, receipts: 0 }]);
  });
});
