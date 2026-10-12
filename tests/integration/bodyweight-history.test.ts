import { afterEach, describe, expect, it } from "@jest/globals";
import { createHash } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { canonicalBodyweightRequestPayload, type BodyweightCommand } from "../../src/domains/bodyweight/contracts";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createBodyweightRepository } from "../../src/platform/sqlite/repositories/bodyweightRepository";
import { createProgressRepository } from "../../src/platform/sqlite/repositories/progressRepository";
import { type SqliteConnection, type SqlitePreparedResult, type SqlitePreparedStatement, configureSqliteConnection } from "../../src/platform/sqlite/connection";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> { constructor(readonly changes: number, readonly lastInsertRowId: number, private readonly rows: readonly Row[]) {} async getAllAsync() { return this.rows; } }
class Statement implements SqlitePreparedStatement { constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {} async executeAsync<Row extends Record<string, unknown>>(parameters: readonly SQLInputValue[] = []): Promise<SqlitePreparedResult<Row>> { if (this.statement.columns().length > 0) return new Result(0, 0, this.statement.all(...parameters) as Row[]); const result = this.statement.run(...parameters); return new Result(Number(result.changes), Number(result.lastInsertRowid), []); } async finalizeAsync() {} }
class Connection implements SqliteConnection { constructor(private readonly db: DatabaseSync) {} async execAsync(sql: string) { this.db.exec(sql); } async prepareAsync(sql: string) { return new Statement(this.db.prepare(sql)); } async isInTransactionAsync() { return this.db.isTransaction; } async closeAsync() { this.db.close(); } }

const directories = new Set<string>();
const kernels = new Set<SqliteKernel>();
afterEach(async () => { await Promise.all([...kernels].map((kernel) => kernel.close())); kernels.clear(); for (const directory of directories) rmSync(directory, { recursive: true, force: true }); directories.clear(); });

async function runtime(path?: string) {
  const databasePath = path ?? join(mkdtempSync(join(tmpdir(), "gym-bodyweight-")), "gym.db");
  if (path === undefined) { directories.add(join(databasePath, "..")); const db = new DatabaseSync(databasePath); db.exec(readFileSync(join(__dirname, "../migrations/fixtures/v6-metric-profiles.sql"), "utf8")); db.close(); }
  const writer = new Connection(new DatabaseSync(databasePath)); const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true }); await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ writer, reader }); kernels.add(kernel);
  await createMigrationRunner({ databaseName: databasePath, kernel, migrations, recoveryBackup: { async createAndValidate(request) { return { backupId: "test", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true as const }; } } }).run();
  return { databasePath, kernel, repository: createBodyweightRepository(kernel) };
}

function command(overrides: Partial<BodyweightCommand> = {}): BodyweightCommand {
  const value = { operation: "create" as const, requestId: "bodyweight-request-1", entryId: "bodyweight-entry-1", ownerId: "owner-1", expectedRevision: 0, revisionId: "bodyweight-revision-1", eventId: "bodyweight-event-1", occurredAtMs: 1_790_000_000_000, localDate: "2026-10-07", timezone: "Asia/Singapore", grams: 72_500, ...overrides };
  const { requestSha256, ...request } = value;
  return {
    ...request,
    requestSha256: requestSha256
      ?? createHash("sha256").update(canonicalBodyweightRequestPayload(request)).digest("hex"),
  };
}

async function protectedDigest(kernel: SqliteKernel) {
  return kernel.queryAll<{
    plans: number;
    runningGoals: number;
    importedActivities: number;
    sessions: number;
    sets: number;
    recommendations: number;
  }>("SELECT (SELECT count(*) FROM plans) AS plans, (SELECT count(*) FROM running_goals) AS runningGoals, (SELECT count(*) FROM imported_activities) AS importedActivities, (SELECT count(*) FROM workout_sessions) AS sessions, (SELECT count(*) FROM session_sets) AS sets, (SELECT count(*) FROM progression_recommendations) AS recommendations");
}

describe("bodyweight source history", () => {
  it("rejects invalid bounds, precision, and future dates before any durable graph changes", async () => {
    const { kernel, repository } = await runtime();
    const beforeProtected = await protectedDigest(kernel);
    const [before] = await kernel.queryAll<{ entries: number; events: number; receipts: number }>("SELECT (SELECT count(*) FROM bodyweight_entries) AS entries, (SELECT count(*) FROM bodyweight_entry_events) AS events, (SELECT count(*) FROM bodyweight_command_receipts) AS receipts");

    for (const invalid of [
      command({ grams: 19_900 }),
      command({ requestId: "bodyweight-precision", grams: 20_050 }),
      command({ requestId: "bodyweight-future", localDate: "2099-01-01" }),
    ]) {
      await expect(repository.commit(invalid)).rejects.toThrow("bodyweight_command_measurement_invalid");
    }

    const [after] = await kernel.queryAll<{ entries: number; events: number; receipts: number }>("SELECT (SELECT count(*) FROM bodyweight_entries) AS entries, (SELECT count(*) FROM bodyweight_entry_events) AS events, (SELECT count(*) FROM bodyweight_command_receipts) AS receipts");
    expect(after).toEqual(before);
    expect(await protectedDigest(kernel)).toEqual(beforeProtected);
  });

  it("commits correction events and exact receipts without protected-graph writes", async () => {
    const { kernel, repository } = await runtime(); const before = await protectedDigest(kernel);
    const created = await repository.commit(command());
    const edited = await repository.commit(command({ operation: "edit", requestId: "bodyweight-request-2", expectedRevision: 1, revisionId: "bodyweight-revision-2", eventId: "bodyweight-event-2", grams: 71_900 }));
    const deleted = await repository.commit(command({ operation: "delete", requestId: "bodyweight-request-3", expectedRevision: 2, revisionId: "bodyweight-revision-3", eventId: "bodyweight-event-3", localDate: undefined, timezone: undefined, grams: undefined }));
    const restored = await repository.commit(command({ operation: "restore", requestId: "bodyweight-request-4", expectedRevision: 3, revisionId: "bodyweight-revision-4", eventId: "bodyweight-event-4", grams: 72_100 }));
    expect([created.kind, edited.kind, deleted.kind, restored.kind]).toEqual(["created", "edited", "deleted", "restored"]);
    expect(await protectedDigest(kernel)).toEqual(before);
    await expect(kernel.queryAll<{ count: number }>("SELECT count(*) AS count FROM bodyweight_entry_events")).resolves.toEqual([{ count: 4 }]);
  });

  it("returns an exact receipt after restart and fences stale or changed requests", async () => {
    const first = await runtime(); const created = await first.repository.commit(command());
    await first.kernel.close(); kernels.delete(first.kernel);
    const reopened = await runtime(first.databasePath);
    await expect(reopened.repository.commit(command())).resolves.toEqual(created);
    await expect(reopened.repository.commit(command({ requestSha256: "0".repeat(64) }))).rejects.toThrow("bodyweight_command_hash_invalid");
    await expect(reopened.repository.commit(command({ operation: "edit", requestId: "bodyweight-request-stale", expectedRevision: 0, revisionId: "bodyweight-revision-stale", eventId: "bodyweight-event-stale" }))).resolves.toMatchObject({ kind: "conflict", conflictCode: "stale_revision" });
  });

  it("retains owner isolation, replay conflicts, and current history across lifecycle transitions", async () => {
    const { repository } = await runtime();
    const created = await repository.commit(command());
    await expect(repository.commit(command({ requestId: "bodyweight-request-conflict", eventId: "bodyweight-event-conflict" }))).resolves.toMatchObject({ kind: "conflict", conflictCode: "entry_exists" });
    await expect(repository.commit(command({ requestId: "bodyweight-request-owner", ownerId: "owner-2", eventId: "bodyweight-event-owner" }))).resolves.toMatchObject({ kind: "conflict", conflictCode: "entry_exists" });
    await expect(repository.history("owner-1")).resolves.toEqual([created.entry]);
    await repository.commit(command({ operation: "delete", requestId: "bodyweight-request-history-delete", expectedRevision: 1, revisionId: "bodyweight-revision-history-delete", eventId: "bodyweight-event-history-delete", localDate: undefined, timezone: undefined, grams: undefined }));
    await expect(repository.history("owner-1")).resolves.toEqual([expect.objectContaining({ lifecycle: "deleted", revision: 2 })]);
    await expect(repository.history("other-owner")).resolves.toEqual([]);
  });

  it("fails closed for corrupt receipts, missing current facts, lost updates, and unreadable post-write state", async () => {
    const { kernel, repository } = await runtime();
    const corruptReceipt = command({ requestId: "bodyweight-corrupt-receipt" });
    await repository.commit(corruptReceipt);
    await kernel.write(async (transaction) => {
      await transaction.execute("DROP TRIGGER bodyweight_command_receipts_immutable_update");
      await transaction.execute(
      "UPDATE bodyweight_command_receipts SET result_json = ? WHERE request_id = ?",
      ["{}", "bodyweight-corrupt-receipt"],
      );
    });
    await expect(repository.commit(corruptReceipt)).rejects.toThrow("sqlite_transaction_failed");
    await kernel.write((transaction) => transaction.execute(
      "UPDATE bodyweight_command_receipts SET request_sha256 = ? WHERE request_id = ?",
      ["b".repeat(64), "bodyweight-corrupt-receipt"],
    ));
    await expect(repository.commit(corruptReceipt)).resolves.toMatchObject({ kind: "conflict" });

    await repository.commit(command({ requestId: "bodyweight-current", entryId: "bodyweight-current-entry", revisionId: "bodyweight-current-revision", eventId: "bodyweight-current-event" }));
    await kernel.write(async (transaction) => {
      await transaction.execute("DROP TRIGGER bodyweight_entry_events_immutable_delete");
      await transaction.execute("DELETE FROM bodyweight_entry_events WHERE id = ?", ["bodyweight-current-revision"]);
    });
    await expect(repository.history("owner-1")).rejects.toThrow("bodyweight_entry_measurement_missing");

    const missingRevision = await runtime();
    await missingRevision.repository.commit(command({ requestId: "bodyweight-revision", entryId: "bodyweight-revision-entry", revisionId: "bodyweight-revision-present", eventId: "bodyweight-event-present" }));
    await missingRevision.kernel.write((transaction) => transaction.execute("UPDATE bodyweight_entries SET current_revision = 99 WHERE id = ?", ["bodyweight-revision-entry"]));
    await expect(missingRevision.repository.history("owner-1")).rejects.toThrow("bodyweight_entry_revision_missing");

    const fenced = await runtime();
    await fenced.repository.commit(command({ requestId: "bodyweight-fenced", entryId: "bodyweight-fenced-entry", revisionId: "bodyweight-fenced-revision", eventId: "bodyweight-fenced-event" }));
    await fenced.kernel.write((transaction) => transaction.execute("CREATE TRIGGER reject_bodyweight_revision BEFORE UPDATE ON bodyweight_entries BEGIN SELECT RAISE(IGNORE); END"));
    await expect(fenced.repository.commit(command({ operation: "edit", requestId: "bodyweight-lost-update", entryId: "bodyweight-fenced-entry", expectedRevision: 1, revisionId: "bodyweight-lost-update-revision", eventId: "bodyweight-lost-update-event", grams: 72_400 }))).rejects.toThrow("sqlite_transaction_failed");

    const unreadable = await runtime();
    await unreadable.kernel.write((transaction) => transaction.execute("CREATE TRIGGER corrupt_bodyweight_readback AFTER INSERT ON bodyweight_entry_events BEGIN UPDATE bodyweight_entries SET lifecycle = 'deleted' WHERE id = NEW.entry_id; END"));
    await expect(unreadable.repository.commit(command({ requestId: "bodyweight-unreadable", entryId: "bodyweight-unreadable-entry", revisionId: "bodyweight-unreadable-revision", eventId: "bodyweight-unreadable-event" }))).rejects.toThrow("sqlite_transaction_failed");
  });

  it("exposes only current dated bodyweight facts through Progress without changing protected or backup state", async () => {
    const { kernel, repository } = await runtime();
    const beforeProtected = await protectedDigest(kernel);
    const [beforeBackup] = await kernel.queryAll<{ mutation_generation: number }>("SELECT mutation_generation FROM automatic_backup_state WHERE id = 1");
    const progress = createProgressRepository(kernel);
    await repository.commit(command());
    const [afterCommitBackup] = await kernel.queryAll<{ mutation_generation: number }>("SELECT mutation_generation FROM automatic_backup_state WHERE id = 1");

    const first = await progress.load({ period: "4_weeks", nowLocalDate: "2026-10-08" });
    const second = await progress.load({ period: "4_weeks", nowLocalDate: "2026-10-08" });
    expect(first.sourceFacts).toEqual(second.sourceFacts);
    expect(first.sourceFacts?.bodyweight).toMatchObject({ kind: "available", entries: [{ id: "bodyweight-entry-1", grams: 72_500, localDate: "2026-10-07" }] });
    const [afterReadBackup] = await kernel.queryAll<{ mutation_generation: number }>("SELECT mutation_generation FROM automatic_backup_state WHERE id = 1");
    expect(afterReadBackup?.mutation_generation).toBe(afterCommitBackup?.mutation_generation);

    await repository.commit(command({ operation: "delete", requestId: "bodyweight-request-progress-delete", expectedRevision: 1, revisionId: "bodyweight-revision-progress-delete", eventId: "bodyweight-event-progress-delete", localDate: undefined, timezone: undefined, grams: undefined }));
    const [afterDeleteBackup] = await kernel.queryAll<{ mutation_generation: number }>("SELECT mutation_generation FROM automatic_backup_state WHERE id = 1");
    await expect(progress.load({ period: "4_weeks", nowLocalDate: "2026-10-08" })).resolves.toMatchObject({ sourceFacts: { bodyweight: { kind: "unavailable", entries: [] } } });
    const [afterBackup] = await kernel.queryAll<{ mutation_generation: number }>("SELECT mutation_generation FROM automatic_backup_state WHERE id = 1");
    expect(await protectedDigest(kernel)).toEqual(beforeProtected);
    expect(afterBackup?.mutation_generation).toBeGreaterThan(beforeBackup!.mutation_generation);
    expect(afterBackup?.mutation_generation).toBe(afterDeleteBackup?.mutation_generation);
  });

  it("fails closed over malformed and non-positive source facts without mutating SQLite", async () => {
    const { kernel, repository } = await runtime();
    const progress = createProgressRepository(kernel);
    await repository.commit(command({
      requestId: "bodyweight-progress-invalid",
      entryId: "bodyweight-progress-invalid-entry",
      revisionId: "bodyweight-progress-invalid-revision",
      eventId: "bodyweight-progress-invalid-event",
    }));
    const before = await protectedDigest(kernel);

    await kernel.write(async (transaction) => {
      await transaction.execute("DROP TRIGGER bodyweight_entry_events_immutable_update");
      await transaction.execute("PRAGMA ignore_check_constraints = ON");
      await transaction.execute(
        "UPDATE bodyweight_entry_events SET grams = 0 WHERE entry_id = ? AND revision = 1",
        ["bodyweight-progress-invalid-entry"],
      );
      await transaction.execute("PRAGMA ignore_check_constraints = OFF");
    });

    await expect(progress.load({
      period: "4_weeks",
      nowLocalDate: "2026-10-08",
    })).resolves.toMatchObject({
      freshness: "current",
      sourceFacts: {
        bodyweight: { kind: "unavailable", entries: [] },
        running: {
          kind: "unavailable",
          activityKind: "unavailable",
          goalKind: "unavailable",
        },
      },
    });
    expect(await protectedDigest(kernel)).toEqual(before);
  });
});
