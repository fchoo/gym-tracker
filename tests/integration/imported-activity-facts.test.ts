import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJson } from "../../src/domains/activities/importContracts";
import * as activityIdentity from "../../src/domains/activities/activityIdentity";
import { confirmGarminImportDate, prepareGarminImport } from "../../src/domains/activities/importCommands";
import { type SqliteConnection, type SqlitePreparedResult, type SqlitePreparedStatement, configureSqliteConnection } from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createImportedActivityRepository } from "../../src/platform/sqlite/repositories/importedActivityRepository";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> { constructor(readonly changes: number, readonly lastInsertRowId: number, private readonly rows: readonly Row[]) {} async getAllAsync() { return this.rows; } }
class Statement implements SqlitePreparedStatement { constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {} async executeAsync<Row extends Record<string, unknown>>(parameters: readonly SQLInputValue[] = []): Promise<SqlitePreparedResult<Row>> { if (this.statement.columns().length > 0) return new Result(0, 0, this.statement.all(...parameters) as Row[]); const result = this.statement.run(...parameters); return new Result(Number(result.changes), Number(result.lastInsertRowid), []); } async finalizeAsync() {} }
class Connection implements SqliteConnection { constructor(readonly db: DatabaseSync) {} async execAsync(sql: string) { this.db.exec(sql); } async prepareAsync(sql: string) { return new Statement(this.db.prepare(sql)); } async isInTransactionAsync() { return this.db.isTransaction; } async closeAsync() { this.db.close(); } }

const directories = new Set<string>(); const kernels: SqliteKernel[] = [];
afterEach(async () => { await Promise.all(kernels.splice(0).map((kernel) => kernel.close())); for (const directory of directories) rmSync(directory, { recursive: true, force: true }); directories.clear(); });
async function runtime() { const directory = mkdtempSync(join(tmpdir(), "gym-imported-activity-")); directories.add(directory); const path = join(directory, "gym.db"); const fixture = new DatabaseSync(path); fixture.exec(readFileSync(join(__dirname, "../migrations/fixtures/v6-metric-profiles.sql"), "utf8")); fixture.close(); const writer = new Connection(new DatabaseSync(path)); const reader = new Connection(new DatabaseSync(path)); await configureSqliteConnection(writer, { enableWal: true }); await configureSqliteConnection(reader, { enableWal: false }); const kernel = createSqliteKernel({ writer, reader }); kernels.push(kernel); await createMigrationRunner({ databaseName: path, kernel, migrations, recoveryBackup: { async createAndValidate(request) { return { backupId: "test", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true as const }; } } }).run(); return { kernel, writer, repository: createImportedActivityRepository(kernel) }; }
function staged(options: Readonly<{ externalActivityId?: string; laps?: { ordinal: number; elapsed_ms: number }[]; samples?: { elapsed_ms: number; distance_meters: number }[] }> = {}) { const normalized = { version: 1 as const, started_at_ms: 1_700_000_000_000, sport: "running" as const, subtype: "outdoor", distance_meters: 5000, elapsed_ms: 1_500_000, laps: options.laps ?? [], ...(options.samples === undefined ? {} : { samples: options.samples }) }; return prepareGarminImport({ version: 1 as const, source_kind: "garmin_connect_account" as const, account_namespace: "owner-a", external_activity_id: options.externalActivityId ?? "42", normalization_version: 1, normalized_json_sha256: createHash("sha256").update(canonicalJson({ normalization_version: 1, normalized })).digest("hex"), raw_component_sha256: { activity: "a".repeat(64), splits: "b".repeat(64), details: "c".repeat(64) }, sample_fidelity: "source_summary" as const, normalized }); }

describe("imported activity facts", () => {
  it("commits source evidence exactly once without plan or session side effects", async () => { const { kernel, repository } = await runtime(); const before = await kernel.queryAll<{ plans: number; sessions: number }>("SELECT (SELECT count(*) FROM plans) AS plans, (SELECT count(*) FROM workout_sessions) AS sessions"); const input = { requestId: "request-1", requestSha256: "d".repeat(64), activityId: "activity-local-1", expectedAggregateRevision: 0, confirmedLocalDate: "2026-10-07", staged: staged() }; await expect(confirmGarminImportDate(repository, input)).resolves.toEqual({ kind: "imported", activityId: "activity-local-1", aggregateRevision: 1 }); await expect(confirmGarminImportDate(repository, input)).resolves.toEqual({ kind: "replayed", activityId: "activity-local-1", aggregateRevision: 1 }); await expect(kernel.queryAll<{ plans: number; sessions: number }>("SELECT (SELECT count(*) FROM plans) AS plans, (SELECT count(*) FROM workout_sessions) AS sessions")).resolves.toEqual(before); await expect(kernel.queryAll<{ count: number }>("SELECT count(*) AS count FROM imported_activity_payloads")).resolves.toEqual([{ count: 1 }]); });

  it("fails closed for conflicting receipts, stale revisions, removed identities, and changed source bytes", async () => {
    const { repository } = await runtime();
    const input = { requestId: "import-branches", requestSha256: "e".repeat(64), activityId: "activity-branches", expectedAggregateRevision: 0, confirmedLocalDate: "2026-10-07", staged: staged() };
    await expect(confirmGarminImportDate(repository, input)).resolves.toMatchObject({ kind: "imported" });
    await expect(confirmGarminImportDate(repository, { ...input, requestSha256: "f".repeat(64) })).resolves.toMatchObject({ kind: "conflict" });
    await expect(confirmGarminImportDate(repository, { ...input, requestId: "stale-new", activityId: "new-stale", expectedAggregateRevision: 2 })).resolves.toMatchObject({ kind: "replayed" });
    await expect(repository.changeGarminActivityLifecycle({ operation: "remove", requestId: "remove-branches", requestSha256: "1".repeat(64), activityId: input.activityId, expectedAggregateRevision: 1, occurredAtMs: 3, reason: "owner_remove" })).resolves.toMatchObject({ kind: "removed" });
    await expect(confirmGarminImportDate(repository, input)).resolves.toMatchObject({ kind: "removed" });
    await expect(repository.changeGarminActivityLifecycle({ operation: "remove", requestId: "remove-again", requestSha256: "2".repeat(64), activityId: input.activityId, expectedAggregateRevision: 1, occurredAtMs: 4, reason: "owner_remove" })).resolves.toMatchObject({ kind: "removed" });
    await expect(confirmGarminImportDate(repository, { ...input, requestId: "removed-duplicate" })).resolves.toMatchObject({ kind: "removed" });
    const changed = staged();
    const revised = { ...changed, envelope: { ...changed.envelope, normalized_json_sha256: "9".repeat(64) } };
    await expect(confirmGarminImportDate(repository, { ...input, requestId: "removed-source", staged: revised })).resolves.toMatchObject({ kind: "removed" });
    await expect(repository.changeGarminActivityLifecycle({ operation: "restore", requestId: "restore-branches", requestSha256: "3".repeat(64), activityId: input.activityId, expectedAggregateRevision: 1, occurredAtMs: 5, reason: "owner_restore" })).resolves.toMatchObject({ kind: "replayed" });
    await expect(repository.changeGarminActivityLifecycle({ operation: "restore", requestId: "restore-branches", requestSha256: "a".repeat(64), activityId: input.activityId, expectedAggregateRevision: 1, occurredAtMs: 5, reason: "owner_restore" })).resolves.toMatchObject({ kind: "conflict" });
    await expect(confirmGarminImportDate(repository, input)).resolves.toMatchObject({ kind: "replayed" });
    await expect(confirmGarminImportDate(repository, { ...input, requestId: "changed-source", staged: revised })).resolves.toMatchObject({ kind: "revision_review" });
    const classification = jest.spyOn(activityIdentity, "classifyGarminActivityIdentity").mockReturnValue(Object.freeze({ kind: "conflict" }));
    await expect(confirmGarminImportDate(repository, { ...input, requestId: "identity-conflict", activityId: "identity-conflict" })).resolves.toMatchObject({ kind: "conflict", activityId: input.activityId, aggregateRevision: 1 });
    await expect(confirmGarminImportDate(repository, { ...input, requestId: "missing-identity-conflict", activityId: "missing-identity-conflict", staged: staged({ externalActivityId: "missing-identity" }) })).resolves.toMatchObject({ kind: "conflict", activityId: "missing-identity-conflict", aggregateRevision: 0 });
    classification.mockRestore();
    await expect(repository.changeGarminActivityLifecycle({ operation: "restore", requestId: "restore-active", requestSha256: "4".repeat(64), activityId: input.activityId, expectedAggregateRevision: 1, occurredAtMs: 6, reason: "owner_restore" })).resolves.toMatchObject({ kind: "conflict" });
    await expect(repository.changeGarminActivityLifecycle({ operation: "remove", requestId: "missing", requestSha256: "5".repeat(64), activityId: "missing", expectedAggregateRevision: 1, occurredAtMs: 6, reason: "owner_remove" })).resolves.toMatchObject({ kind: "conflict", aggregateRevision: 0 });
  });

  it("replays lifecycle receipts, rejects an orphaned source receipt, and persists optional source components", async () => {
    const { kernel, writer, repository } = await runtime();
    const input = { requestId: "component-import", requestSha256: "6".repeat(64), activityId: "component-activity", expectedAggregateRevision: 0, confirmedLocalDate: "2026-10-08", staged: staged({ externalActivityId: "component-42", laps: [{ ordinal: 0, elapsed_ms: 600_000 }], samples: [{ elapsed_ms: 1, distance_meters: 2 }] }) };
    await expect(confirmGarminImportDate(repository, input)).resolves.toMatchObject({ kind: "imported" });
    await expect(kernel.queryAll<{ laps: number; chunks: number }>("SELECT (SELECT count(*) FROM imported_activity_laps) AS laps, (SELECT count(*) FROM imported_activity_chunks) AS chunks")).resolves.toEqual([{ laps: 1, chunks: 1 }]);
    const remove = { operation: "remove" as const, requestId: "component-remove", requestSha256: "7".repeat(64), activityId: input.activityId, expectedAggregateRevision: 1, occurredAtMs: 7, reason: "owner_remove" };
    await expect(repository.changeGarminActivityLifecycle(remove)).resolves.toMatchObject({ kind: "removed" });
    await expect(repository.changeGarminActivityLifecycle(remove)).resolves.toMatchObject({ kind: "removed" });
    const restore = { ...remove, operation: "restore" as const, requestId: "component-restore", requestSha256: "8".repeat(64), occurredAtMs: 8 };
    await expect(repository.changeGarminActivityLifecycle(restore)).resolves.toMatchObject({ kind: "replayed" });
    await expect(repository.changeGarminActivityLifecycle(restore)).resolves.toMatchObject({ kind: "replayed" });
    const immutableTriggers = writer.db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'imported_activity_identities'").all() as unknown as readonly { name: string }[];
    for (const { name } of immutableTriggers) writer.db.exec(`DROP TRIGGER ${name}`);
    writer.db.prepare("DELETE FROM imported_activity_identities WHERE activity_id = ?").run(input.activityId);
    await expect(confirmGarminImportDate(repository, input)).rejects.toThrow("sqlite_transaction_failed");
    await expect(confirmGarminImportDate(repository, { ...input, requestId: "stale-new-identity", activityId: "stale-new-identity", expectedAggregateRevision: 1, staged: staged({ externalActivityId: "stale-identity" }) })).resolves.toMatchObject({ kind: "conflict", aggregateRevision: 0 });
  });
});
