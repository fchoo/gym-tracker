import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configureSqliteConnection, type SqliteConnection, type SqlitePreparedResult, type SqlitePreparedStatement } from "../../src/platform/sqlite/connection";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createLibraryPlanDeletionPort } from "../../src/platform/sqlite/repositories/libraryPlanDeletionRepository";
import { createOwnedPlanRepository } from "../../src/platform/sqlite/repositories/ownedPlanRepository";
import { libraryPlanDeletionKey } from "../../src/domains/library/planDeletion";

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

const kernels: SqliteKernel[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

async function open(createdAtMs = 1): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-library-deletion-closeout-"));
  directories.push(directory);
  const writer = new Connection(new DatabaseSync(join(directory, "gym.db")));
  const reader = new Connection(new DatabaseSync(join(directory, "gym.db")));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  kernels.push(kernel);
  await createMigrationRunner({ databaseName: "gym.db", kernel, migrations,
    recoveryBackup: { createAndValidate: async () => ({ backupId: "test", databaseName: "gym.db", fromVersion: 0, toVersion: 0, validated: true }) } }).run();
  await createOwnedPlanRepository(kernel).createDraft({ requestId: "create-plan", requestSha256: "a".repeat(64),
    planId: "plan", dayId: "day", name: "Unused Plan", dayName: "Day A", createdAtMs });
  return kernel;
}

describe("Library deletion rejects invalid inputs without retiring source facts", () => {
  it.each([" ", "x".repeat(129)])("rejects invalid plan identifier %p before database mutation", async (planId) => {
    const kernel = await open();
    const before = await kernel.queryAll("SELECT * FROM plans");
    const deletion = createLibraryPlanDeletionPort(kernel, { nowMs: () => 10 });
    await expect(deletion.readEligibility(planId)).rejects.toMatchObject({ cause: expect.objectContaining({ message: "library_plan_id_invalid" }) });
    await expect(deletion.deletePlan({ planId })).rejects.toMatchObject({ cause: expect.objectContaining({ message: "library_plan_id_invalid" }) });
    expect(await kernel.queryAll("SELECT * FROM plans")).toEqual(before);
    expect(await kernel.queryAll("SELECT key FROM app_settings WHERE key = ?", [libraryPlanDeletionKey("plan")])).toEqual([]);
  });

  it.each(["missing", "bundled"])("keeps a %s plan ineligible in both preview and the exclusive writer", async (kind) => {
    const kernel = await open();
    if (kind === "bundled") await kernel.write((transaction) => transaction.execute(`INSERT INTO plans
      (id, origin, source_namespace, upstream_id, name, days_per_week, revision)
      VALUES ('bundled', 'bundled', 'test', 'bundled', 'Bundled Plan', 1, 1)`));
    const nowMs = jest.fn(() => 10);
    const deletion = createLibraryPlanDeletionPort(kernel, { nowMs });
    const planId = kind;
    const reason = kind === "missing" ? "not_found" : "bundled";
    const before = await kernel.queryAll("SELECT * FROM plans");
    expect(await deletion.readEligibility(planId)).toEqual({ planId, eligible: false, reason });
    expect(await deletion.deletePlan({ planId })).toEqual({ outcome: "ineligible", planId, reason });
    expect(nowMs).not.toHaveBeenCalled();
    expect(await kernel.queryAll("SELECT * FROM plans")).toEqual(before);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid deletion timestamp %p with source facts preserved", async (timestamp) => {
    const kernel = await open();
    const before = await kernel.queryAll("SELECT * FROM plans");
    const states = await kernel.queryAll("SELECT * FROM owned_plan_aggregate_states");
    await expect(createLibraryPlanDeletionPort(kernel, { nowMs: () => timestamp }).deletePlan({ planId: "plan" }))
      .rejects.toMatchObject({ cause: expect.objectContaining({ message: "library_plan_deletion_time_invalid" }) });
    expect(await kernel.queryAll("SELECT * FROM plans")).toEqual(before);
    expect(await kernel.queryAll("SELECT * FROM owned_plan_aggregate_states")).toEqual(states);
    expect(await kernel.queryAll("SELECT key FROM app_settings WHERE key = ?", [libraryPlanDeletionKey("plan")])).toEqual([]);
  });

  it("reads eligibility through the legacy kernel and persists a zero timestamp without fabrication", async () => {
    const kernel = await open(0);
    const { readSnapshot: _readSnapshot, ...legacyKernel } = kernel;
    const deletion = createLibraryPlanDeletionPort(legacyKernel, { nowMs: () => 0 });
    expect(await deletion.readEligibility("plan")).toEqual({ planId: "plan", eligible: true, reason: null });
    expect(await deletion.deletePlan({ planId: "plan" })).toEqual({ outcome: "deleted", planId: "plan" });
    expect(await kernel.queryAll("SELECT value_json, updated_at_ms FROM app_settings WHERE key = ?", [libraryPlanDeletionKey("plan")]))
      .toEqual([{ value_json: JSON.stringify({ version: 1, planId: "plan", deletedAtMs: 0 }), updated_at_ms: 0 }]);
    expect(await deletion.readEligibility("plan")).toEqual({ planId: "plan", eligible: false, reason: "already_deleted" });
  });

  it("fails closed if the linkage query returns no eligibility sentinel", async () => {
    const kernel = await open();
    const incompleteKernel: SqliteKernel = { ...kernel,
      readSnapshot: (operation) => kernel.readSnapshot!((transaction) => operation({ ...transaction,
        queryAll: (sql, parameters) => sql.startsWith("WITH\n  days AS") ? Promise.resolve([]) : transaction.queryAll(sql, parameters),
      })),
    };
    expect(await createLibraryPlanDeletionPort(incompleteKernel, { nowMs: () => 10 }).readEligibility("plan"))
      .toEqual({ planId: "plan", eligible: false, reason: "workout_linked" });
    expect(await kernel.queryAll("SELECT lifecycle FROM owned_plan_aggregate_states WHERE plan_id = 'plan'"))
      .toEqual([{ lifecycle: "draft" }]);
  });
});
