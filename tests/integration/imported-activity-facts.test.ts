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
import { createSqliteKernel, type SqliteKernel, type SqliteKernelTestObserver } from "../../src/platform/sqlite/sqliteKernel";

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> { constructor(readonly changes: number, readonly lastInsertRowId: number, private readonly rows: readonly Row[]) {} async getAllAsync() { return this.rows; } }
class Statement implements SqlitePreparedStatement { constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>, private readonly connection: Connection) {} async executeAsync<Row extends Record<string, unknown>>(parameters: readonly SQLInputValue[] = []): Promise<SqlitePreparedResult<Row>> { if (this.statement.columns().length > 0) return new Result(0, 0, this.statement.all(...parameters) as Row[]); this.connection.beforeMutation(); const result = this.statement.run(...parameters); return new Result(Number(result.changes), Number(result.lastInsertRowid), []); } async finalizeAsync() {} }
class Connection implements SqliteConnection { private mutationCount = 0; private failAtMutation: number | null = null; constructor(readonly db: DatabaseSync) {} armMutationFailure(failAt: number) { this.mutationCount = 0; this.failAtMutation = failAt; } beforeMutation() { this.mutationCount += 1; if (this.mutationCount === this.failAtMutation) throw new Error("injected_repository_cut"); } async execAsync(sql: string) { this.db.exec(sql); } async prepareAsync(sql: string) { return new Statement(this.db.prepare(sql), this); } async isInTransactionAsync() { return this.db.isTransaction; } async closeAsync() { this.db.close(); } }

const directories = new Set<string>(); const kernels: SqliteKernel[] = [];
afterEach(async () => { await Promise.all(kernels.splice(0).map((kernel) => kernel.close())); for (const directory of directories) rmSync(directory, { recursive: true, force: true }); directories.clear(); });
async function runtime(observer: SqliteKernelTestObserver = {}) { const directory = mkdtempSync(join(tmpdir(), "gym-imported-activity-")); directories.add(directory); const path = join(directory, "gym.db"); const fixture = new DatabaseSync(path); fixture.exec(readFileSync(join(__dirname, "../migrations/fixtures/v6-metric-profiles.sql"), "utf8")); fixture.close(); const writer = new Connection(new DatabaseSync(path)); const reader = new Connection(new DatabaseSync(path)); await configureSqliteConnection(writer, { enableWal: true }); await configureSqliteConnection(reader, { enableWal: false }); const kernel = createSqliteKernel({ writer, reader }, observer); kernels.push(kernel); await createMigrationRunner({ databaseName: path, kernel, migrations, recoveryBackup: { async createAndValidate(request) { return { backupId: "test", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true as const }; } } }).run(); return { kernel, writer, repository: createImportedActivityRepository(kernel) }; }
async function staged(options: Readonly<{ externalActivityId?: string; distanceMeters?: number; laps?: { ordinal: number; elapsed_ms: number }[]; samples?: { elapsed_ms: number; distance_meters: number }[] }> = {}) { const normalized = { version: 1 as const, started_at_ms: 1_700_000_000_000, sport: "running" as const, subtype: "outdoor", distance_meters: options.distanceMeters ?? 5000, elapsed_ms: 1_500_000, laps: options.laps ?? [], ...(options.samples === undefined ? {} : { samples: options.samples }) }; return prepareGarminImport({ version: 1 as const, source_kind: "garmin_connect_account" as const, account_namespace: "owner-a", external_activity_id: options.externalActivityId ?? "42", normalization_version: 1, normalized_json_sha256: createHash("sha256").update(canonicalJson({ normalization_version: 1, normalized })).digest("hex"), raw_component_sha256: { activity: "a".repeat(64), splits: "b".repeat(64), details: "c".repeat(64) }, sample_fidelity: "source_summary" as const, normalized }, async (value) => createHash("sha256").update(value).digest("hex")); }
async function importedCounts(kernel: SqliteKernel) {
  return kernel.queryAll<{ activities: number; identities: number; payloads: number; receipts: number; proposals: number }>(`SELECT
    (SELECT count(*) FROM imported_activities) AS activities,
    (SELECT count(*) FROM imported_activity_identities) AS identities,
    (SELECT count(*) FROM imported_activity_payloads) AS payloads,
    (SELECT count(*) FROM imported_activity_receipts) AS receipts,
    (SELECT count(*) FROM imported_activity_revision_proposals) AS proposals`);
}

describe("imported activity facts", () => {
  it("commits source evidence exactly once without plan or session side effects", async () => { const { kernel, repository } = await runtime(); const before = await kernel.queryAll<{ plans: number; sessions: number }>("SELECT (SELECT count(*) FROM plans) AS plans, (SELECT count(*) FROM workout_sessions) AS sessions"); const input = { requestId: "request-1", requestSha256: "d".repeat(64), activityId: "activity-local-1", expectedAggregateRevision: 0, confirmedLocalDate: "2026-10-07", staged: await staged() }; await expect(confirmGarminImportDate(repository, input)).resolves.toEqual({ kind: "imported", activityId: "activity-local-1", aggregateRevision: 1 }); await expect(confirmGarminImportDate(repository, input)).resolves.toEqual({ kind: "replayed", activityId: "activity-local-1", aggregateRevision: 1 }); await expect(kernel.queryAll<{ plans: number; sessions: number }>("SELECT (SELECT count(*) FROM plans) AS plans, (SELECT count(*) FROM workout_sessions) AS sessions")).resolves.toEqual(before); await expect(kernel.queryAll<{ count: number }>("SELECT count(*) AS count FROM imported_activity_payloads")).resolves.toEqual([{ count: 1 }]); });

  it("fails closed for conflicting receipts, stale revisions, removed identities, and changed source bytes", async () => {
    const { repository } = await runtime();
    const input = { requestId: "import-branches", requestSha256: "e".repeat(64), activityId: "activity-branches", expectedAggregateRevision: 0, confirmedLocalDate: "2026-10-07", staged: await staged() };
    await expect(confirmGarminImportDate(repository, input)).resolves.toMatchObject({ kind: "imported" });
    await expect(confirmGarminImportDate(repository, { ...input, requestSha256: "f".repeat(64) })).resolves.toMatchObject({ kind: "conflict" });
    await expect(confirmGarminImportDate(repository, { ...input, requestId: "stale-new", activityId: "new-stale", expectedAggregateRevision: 2 })).resolves.toMatchObject({ kind: "replayed" });
    await expect(repository.changeGarminActivityLifecycle({ operation: "remove", requestId: "remove-branches", requestSha256: "1".repeat(64), activityId: input.activityId, expectedAggregateRevision: 1, occurredAtMs: 3, reason: "owner_remove" })).resolves.toMatchObject({ kind: "removed" });
    await expect(confirmGarminImportDate(repository, input)).resolves.toMatchObject({ kind: "removed" });
    await expect(repository.changeGarminActivityLifecycle({ operation: "remove", requestId: "remove-again", requestSha256: "2".repeat(64), activityId: input.activityId, expectedAggregateRevision: 1, occurredAtMs: 4, reason: "owner_remove" })).resolves.toMatchObject({ kind: "removed" });
    await expect(confirmGarminImportDate(repository, { ...input, requestId: "removed-duplicate" })).resolves.toMatchObject({ kind: "removed" });
    const revised = await staged({ distanceMeters: 5_001 });
    await expect(confirmGarminImportDate(repository, { ...input, requestId: "removed-source", staged: revised })).resolves.toMatchObject({ kind: "removed" });
    await expect(repository.changeGarminActivityLifecycle({ operation: "restore", requestId: "restore-branches", requestSha256: "3".repeat(64), activityId: input.activityId, expectedAggregateRevision: 1, occurredAtMs: 5, reason: "owner_restore" })).resolves.toMatchObject({ kind: "replayed" });
    await expect(repository.changeGarminActivityLifecycle({ operation: "restore", requestId: "restore-branches", requestSha256: "a".repeat(64), activityId: input.activityId, expectedAggregateRevision: 1, occurredAtMs: 5, reason: "owner_restore" })).resolves.toMatchObject({ kind: "conflict" });
    await expect(confirmGarminImportDate(repository, input)).resolves.toMatchObject({ kind: "replayed" });
    await expect(confirmGarminImportDate(repository, {
      ...input,
      requestId: "changed-source",
      requestSha256: "6".repeat(64),
      staged: revised,
    })).resolves.toMatchObject({ kind: "revision_review" });
    const classification = jest.spyOn(activityIdentity, "classifyGarminActivityIdentity").mockReturnValue(Object.freeze({ kind: "conflict" }));
    await expect(confirmGarminImportDate(repository, { ...input, requestId: "identity-conflict", activityId: "identity-conflict" })).resolves.toMatchObject({ kind: "conflict", activityId: input.activityId, aggregateRevision: 1 });
    await expect(confirmGarminImportDate(repository, { ...input, requestId: "missing-identity-conflict", activityId: "missing-identity-conflict", staged: await staged({ externalActivityId: "missing-identity" }) })).resolves.toMatchObject({ kind: "conflict", activityId: "missing-identity-conflict", aggregateRevision: 0 });
    classification.mockRestore();
    await expect(repository.changeGarminActivityLifecycle({ operation: "restore", requestId: "restore-active", requestSha256: "4".repeat(64), activityId: input.activityId, expectedAggregateRevision: 1, occurredAtMs: 6, reason: "owner_restore" })).resolves.toMatchObject({ kind: "conflict" });
    await expect(repository.changeGarminActivityLifecycle({ operation: "remove", requestId: "missing", requestSha256: "5".repeat(64), activityId: "missing", expectedAggregateRevision: 1, occurredAtMs: 6, reason: "owner_remove" })).resolves.toMatchObject({ kind: "conflict", aggregateRevision: 0 });
  });

  it("replays lifecycle receipts, rejects an orphaned source receipt, and persists optional source components", async () => {
    const { kernel, writer, repository } = await runtime();
    const input = { requestId: "component-import", requestSha256: "6".repeat(64), activityId: "component-activity", expectedAggregateRevision: 0, confirmedLocalDate: "2026-10-08", staged: await staged({ externalActivityId: "component-42", laps: [{ ordinal: 0, elapsed_ms: 600_000 }], samples: [{ elapsed_ms: 1, distance_meters: 2 }] }) };
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
    await expect(confirmGarminImportDate(repository, { ...input, requestId: "stale-new-identity", activityId: "stale-new-identity", expectedAggregateRevision: 1, staged: await staged({ externalActivityId: "stale-identity" }) })).resolves.toMatchObject({ kind: "conflict", aggregateRevision: 0 });
  });

  it("rolls back every repository statement cut and a precommit interruption without changing existing digests", async () => {
    for (let failAt = 1; failAt <= 9; failAt += 1) {
      const { kernel, writer, repository } = await runtime();
      const before = await kernel.queryAll<Record<string, number>>(`SELECT
        (SELECT count(*) FROM plans) AS plans,
        (SELECT count(*) FROM workout_sessions) AS sessions,
        (SELECT count(*) FROM running_activity_current_matches) AS matches`);
      writer.armMutationFailure(failAt);
      await expect(confirmGarminImportDate(repository, {
        requestId: `fault-${failAt}`,
        requestSha256: "b".repeat(64),
        activityId: `fault-activity-${failAt}`,
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-10-09",
        staged: await staged({ externalActivityId: `fault-external-${failAt}` }),
      })).rejects.toThrow("sqlite_transaction_failed");
      await expect(kernel.queryAll<{ activities: number; receipts: number }>(`SELECT
        (SELECT count(*) FROM imported_activities) AS activities,
        (SELECT count(*) FROM imported_activity_receipts) AS receipts`)).resolves.toEqual([{ activities: 0, receipts: 0 }]);
      await expect(kernel.queryAll<Record<string, number>>(`SELECT
        (SELECT count(*) FROM plans) AS plans,
        (SELECT count(*) FROM workout_sessions) AS sessions,
        (SELECT count(*) FROM running_activity_current_matches) AS matches`)).resolves.toEqual(before);
    }

    let interruptBeforeCommit = false;
    const { kernel, repository } = await runtime({
      beforeCommit: async () => {
        if (interruptBeforeCommit) throw new Error("precommit_interrupted");
      },
    });
    interruptBeforeCommit = true;
    await expect(confirmGarminImportDate(repository, {
      requestId: "precommit-interruption",
      requestSha256: "c".repeat(64),
      activityId: "precommit-activity",
      expectedAggregateRevision: 0,
      confirmedLocalDate: "2026-10-09",
      staged: await staged({ externalActivityId: "precommit-external" }),
    })).rejects.toThrow("sqlite_commit_failed");
    await expect(kernel.queryAll<{ activities: number; receipts: number }>(`SELECT
      (SELECT count(*) FROM imported_activities) AS activities,
      (SELECT count(*) FROM imported_activity_receipts) AS receipts`)).resolves.toEqual([{ activities: 0, receipts: 0 }]);
  });

  it.each([
    {
      label: "account namespace mutation",
      mutate: (value: Awaited<ReturnType<typeof staged>>) => ({
        ...value,
        envelope: {
          ...value.envelope,
          account_namespace: "owner-b",
        },
      }),
    },
    {
      label: "external activity id mutation",
      mutate: (value: Awaited<ReturnType<typeof staged>>) => ({
        ...value,
        envelope: {
          ...value.envelope,
          external_activity_id: "99",
        },
      }),
    },
    {
      label: "source kind mutation",
      mutate: (value: Awaited<ReturnType<typeof staged>>) => ({
        ...value,
        envelope: {
          ...value.envelope,
          source_kind: "garmin_connect_account_mutated" as never,
        },
      }),
    },
    {
      label: "normalized payload mutation",
      mutate: (value: Awaited<ReturnType<typeof staged>>) => ({
        ...value,
        envelope: {
          ...value.envelope,
          normalized: {
            ...value.envelope.normalized,
            distance_meters: value.envelope.normalized.distance_meters + 1,
          },
        },
      }),
    },
  ])("writes zero rows when prepared import has a post-prepare $label", async ({ mutate }) => {
    const { kernel, repository } = await runtime();
    const input = {
      requestId: "mutation-check",
      requestSha256: "d".repeat(64),
      activityId: "mutation-activity",
      expectedAggregateRevision: 0,
      confirmedLocalDate: "2026-10-07",
      staged: mutate(await staged()),
    };

    await expect(confirmGarminImportDate(repository, input)).resolves.toEqual({
      kind: "conflict",
      activityId: "mutation-activity",
      aggregateRevision: 0,
    });
    await expect(importedCounts(kernel)).resolves.toEqual([{
      activities: 0,
      identities: 0,
      payloads: 0,
      receipts: 0,
      proposals: 0,
    }]);
  });
});
