import { afterEach, describe, expect, it } from "@jest/globals";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import {
  FOREGROUND_REST_FEEDBACK_RETENTION_MS,
  createForegroundRestFeedbackStore,
  enqueueForegroundRestFeedbackAttempt,
} from "../../src/platform/sqlite/foregroundRestFeedbackStore";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { foregroundRestFeedbackMigration } from "../../src/platform/sqlite/migrations/0011_foreground_rest_feedback";
import { foregroundRestFeedbackAttemptsMigration } from "../../src/platform/sqlite/migrations/0012_foreground_rest_feedback_attempts";
import { type RecoveryBackupPort } from "../../src/platform/sqlite/recoveryBackup";
import {
  createSqliteKernel,
  type SqliteKernel,
  type SqliteTransactionExecutor,
} from "../../src/platform/sqlite/sqliteKernel";

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(readonly changes: number, readonly lastInsertRowId: number, private readonly rows: readonly Row[]) {}
  async getAllAsync(): Promise<readonly Row[]> { return this.rows; }
}
class Statement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}
  async executeAsync<Row extends Record<string, unknown>>(parameters: readonly (null | number | string | Uint8Array)[] = []): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    const result = this.statement.run(...parameters);
    return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
  }
  async finalizeAsync(): Promise<void> {}
}
class Connection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}
  async execAsync(sql: string): Promise<void> { this.database.exec(sql); }
  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> { return new Statement(this.database.prepare(sql)); }
  async isInTransactionAsync(): Promise<boolean> { return this.database.isTransaction; }
  async closeAsync(): Promise<void> { this.database.close(); }
}
const directories = new Set<string>();
const kernels: SqliteKernel[] = [];
afterEach(async () => { await Promise.all(kernels.splice(0).map((kernel) => kernel.close())); for (const directory of directories) rmSync(directory, { force: true, recursive: true }); directories.clear(); });
async function open(databasePath: string, migrationsToRun = migrations): Promise<SqliteKernel> {
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true }); await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  const recoveryBackup: RecoveryBackupPort = { createAndValidate: async (request) => ({ backupId: "feedback", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true }) };
  await createMigrationRunner({ databaseName: "gym-tracker.db", kernel, migrations: migrationsToRun, recoveryBackup }).run(); kernels.push(kernel); return kernel;
}
async function createKernel(): Promise<SqliteKernel> { const directory = mkdtempSync(join(tmpdir(), "gym-feedback-")); directories.add(directory); return open(join(directory, "gym-tracker.db")); }
async function session(kernel: SqliteKernel, id: string): Promise<void> { await kernel.write((transaction) => transaction.execute(`INSERT INTO workout_sessions (id, plan_id, plan_day_id, source, status, local_date, timezone, started_at_ms, completed_at_ms, revision) VALUES (?, NULL, NULL, 'empty', 'in_progress', '2026-08-22', 'Asia/Singapore', 0, NULL, 0)`, [id])); }
async function enqueue(kernel: SqliteKernel, id: string, revision: number, preferences = { soundEnabled: true, vibrationEnabled: true }): Promise<void> { await kernel.write((transaction) => enqueueForegroundRestFeedbackAttempt(transaction, { sessionId: id, restRevision: revision, nowMs: 120_000, preferences })); }

describe("foreground rest feedback attempts", () => {
  it("retains the full 0012 manifest prefix while allowing later migrations", () => {
    expect(migrations.slice(0, 11).map(({ version }) => version)).toEqual([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]);
    expect(migrations.at(-1)?.version).toBeGreaterThanOrEqual(12);
  });
  it.each([
    {
      name: "foreground feedback consumption",
      migration: foregroundRestFeedbackMigration,
      errorCode: "foreground_rest_feedback_schema_incomplete",
    },
    {
      name: "foreground feedback attempt",
      migration: foregroundRestFeedbackAttemptsMigration,
      errorCode: "foreground_rest_feedback_attempt_schema_incomplete",
    },
  ])("rejects an incomplete $name schema", async ({ migration, errorCode }) => {
    const transaction = {
      queryAll: async () => [],
    } as unknown as SqliteTransactionExecutor;

    await expect(migration.verify?.(transaction)).rejects.toThrow(errorCode);
  });
  it("migrates legacy 0011 consumption to terminal attempted rows", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gym-feedback-v11-")); directories.add(directory); const path = join(directory, "gym-tracker.db");
    const kernel = await open(path, migrations.filter(({ version }) => version <= 11)); await session(kernel, "legacy");
    await kernel.write((transaction) => transaction.execute(`INSERT INTO foreground_rest_feedback_consumptions (session_id, rest_revision, consumed_at_ms) VALUES ('legacy', 4, 100)`));
    await kernel.close(); kernels.splice(kernels.indexOf(kernel), 1);
    const upgraded = await open(path); const store = createForegroundRestFeedbackStore(upgraded);
    await expect(store.claimPending({ sessionId: "legacy", restRevision: 4 })).resolves.toBe("already_attempted");
  });
  it("atomically claims a preference snapshot once and retains attempted state after reopen", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gym-feedback-reopen-")); directories.add(directory); const path = join(directory, "gym-tracker.db");
    const kernel = await open(path); await session(kernel, "s"); await enqueue(kernel, "s", 4, { soundEnabled: true, vibrationEnabled: false });
    const store = createForegroundRestFeedbackStore(kernel);
    await expect(store.claimPending({ sessionId: "s", restRevision: 4 })).resolves.toEqual({ outcome: "claimed", sound: true, vibration: false });
    await kernel.close(); kernels.splice(kernels.indexOf(kernel), 1);
    await expect(createForegroundRestFeedbackStore(await open(path)).claimPending({ sessionId: "s", restRevision: 4 })).resolves.toBe("already_attempted");
  });
  it("reports a missing feedback identity without creating an attempt", async () => {
    const kernel = await createKernel();
    const store = createForegroundRestFeedbackStore(kernel);

    await expect(store.claimPending({
      sessionId: "missing",
      restRevision: 1,
    })).resolves.toBe("job_missing");
    await expect(store.listPending()).resolves.toEqual([]);
  });
  it.each([[true,true],[true,false],[false,true],[false,false]])("snapshots sound=%s vibration=%s", async (soundEnabled, vibrationEnabled) => {
    const kernel = await createKernel(); await session(kernel, "s"); await enqueue(kernel, "s", 4, { soundEnabled, vibrationEnabled });
    await expect(createForegroundRestFeedbackStore(kernel).claimPending({ sessionId: "s", restRevision: 4 })).resolves.toEqual(soundEnabled || vibrationEnabled ? { outcome: "claimed", sound: soundEnabled, vibration: vibrationEnabled } : "already_attempted");
  });
  it("lists only pending work for launch recovery and makes concurrent claims terminal", async () => {
    const kernel = await createKernel(); await session(kernel, "s"); await enqueue(kernel, "s", 4);
    const store = createForegroundRestFeedbackStore(kernel);
    await expect(store.listPending()).resolves.toEqual([{ sessionId: "s", restRevision: 4 }]);
    await expect(Promise.all([
      store.claimPending({ sessionId: "s", restRevision: 4 }),
      store.claimPending({ sessionId: "s", restRevision: 4 }),
    ])).resolves.toContainEqual({ outcome: "claimed", sound: true, vibration: true });
    await expect(store.listPending()).resolves.toEqual([]);
  });
  it("completes attempted feedback statuses and excludes the completed row from launch recovery", async () => {
    const kernel = await createKernel(); await session(kernel, "completed"); await enqueue(kernel, "completed", 4);
    const store = createForegroundRestFeedbackStore(kernel);

    await expect(store.claimPending({ sessionId: "completed", restRevision: 4 })).resolves.toEqual({
      outcome: "claimed",
      sound: true,
      vibration: true,
    });
    await expect(kernel.queryAll(
      `SELECT sound_status, vibration_status
       FROM foreground_rest_feedback_attempts
       WHERE session_id = 'completed' AND rest_revision = 4`,
    )).resolves.toEqual([{ sound_status: "attempted", vibration_status: "attempted" }]);

    await store.complete({ sessionId: "completed", restRevision: 4 });

    await expect(kernel.queryAll(
      `SELECT sound_status, vibration_status
       FROM foreground_rest_feedback_attempts
       WHERE session_id = 'completed' AND rest_revision = 4`,
    )).resolves.toEqual([{ sound_status: "completed", vibration_status: "completed" }]);
    await expect(store.listPending()).resolves.toEqual([]);
  });
  it("prunes expired finalized-workout feedback while retaining expired active-workout feedback", async () => {
    const kernel = await createKernel();
    await session(kernel, "finalized"); await enqueue(kernel, "finalized", 2);
    await kernel.write((transaction) => transaction.execute(
      `UPDATE workout_sessions
       SET status = 'completed', completed_at_ms = 180000
       WHERE id = 'finalized'`,
    ));
    await session(kernel, "active"); await enqueue(kernel, "active", 1);
    const store = createForegroundRestFeedbackStore(kernel);

    await expect(store.prune({
      nowMs: 120_000 + FOREGROUND_REST_FEEDBACK_RETENTION_MS + 1,
    })).resolves.toBe(1);

    await expect(kernel.queryAll(
      `SELECT session_id, rest_revision
       FROM foreground_rest_feedback_attempts
       ORDER BY session_id`,
    )).resolves.toEqual([{ session_id: "active", rest_revision: 1 }]);
    await expect(store.listPending()).resolves.toEqual([{ sessionId: "active", restRevision: 1 }]);
  });
});
