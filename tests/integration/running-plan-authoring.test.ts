import { afterEach, describe, expect, it } from "@jest/globals";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SqliteConnection, SqlitePreparedResult, SqlitePreparedStatement } from "../../src/platform/sqlite/connection";
import { configureSqliteConnection } from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createRunningPlanRepository } from "../../src/platform/sqlite/repositories/runningPlanRepository";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";
import type { CreateInactiveRunningPlanInput } from "../../src/domains/running/commands";
import type { RunningPlanSession } from "../../src/domains/running/contracts";

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(readonly changes: number, readonly lastInsertRowId: number, private readonly rows: readonly Row[]) {}
  async getAllAsync(): Promise<readonly Row[]> { return this.rows; }
}
class Statement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}
  async executeAsync<Row extends Record<string, unknown>>(parameters: readonly SQLInputValue[] = []): Promise<SqlitePreparedResult<Row>> {
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

async function migratedKernel(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-running-authoring-")); directories.add(directory);
  const path = join(directory, "gym-tracker.db");
  const fixture = new DatabaseSync(path); fixture.exec(readFileSync(join(__dirname, "../migrations/fixtures/v6-metric-profiles.sql"), "utf8")); fixture.close();
  const writer = new Connection(new DatabaseSync(path)); const reader = new Connection(new DatabaseSync(path));
  await configureSqliteConnection(writer, { enableWal: true }); await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ writer, reader }); kernels.push(kernel);
  await createMigrationRunner({ databaseName: "gym-tracker.db", kernel, migrations, recoveryBackup: { async createAndValidate(request) { return { backupId: "test", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true as const }; } } }).run();
  return kernel;
}

function session(planId: string, kind: "recovery" | "tempo", ordinal: number): RunningPlanSession {
  return {
    slot: { id: `${kind}-slot-v1`, rootId: `${kind}-slot`, weekday: "Monday" as const, revision: 1, ordinal },
    session: { version: 1 as const, id: `${kind}-v1`, rootId: kind, planId, sessionKind: kind, revision: 1, createdAtMs: 100, phases: [{ ordinal: 0, kind: "work" as const, steps: [{ ordinal: 0, kind: "duration" as const, durationMs: 60_000 }] }], contextual: kind === "tempo" ? { format: "continuous" as const, durationMs: 60_000 } : {} },
  } as RunningPlanSession;
}

describe("Running plan authoring boundary", () => {
  it("commits and reopens zero and ordered same-day typed sessions as inactive source facts", async () => {
    const kernel = await migratedKernel(); const repository = createRunningPlanRepository(kernel);
    const zero: CreateInactiveRunningPlanInput = { requestId: "zero-request", requestSha256: "1".repeat(64), plan: { version: 1 as const, id: "zero", name: "Zero", revision: 1, createdAtMs: 100, goal: { version: 1 as const, id: "zero-goal", planId: "zero", revision: 1, goalDistanceMeters: 5_000, trainingDays: ["Monday" as const], createdAtMs: 100 }, sessions: [] } };
    await expect(repository.createInactiveAggregate(zero)).resolves.toMatchObject({ id: "zero", active: false, sessions: [] });
    const plan: CreateInactiveRunningPlanInput = { requestId: "same-day-request", requestSha256: "2".repeat(64), plan: { version: 1 as const, id: "same-day", name: "Same day", revision: 1, createdAtMs: 100, goal: { version: 1 as const, id: "same-day-goal", planId: "same-day", revision: 1, goalDistanceMeters: 10_000, targetDurationMs: 3_600_000, trainingDays: ["Monday" as const], createdAtMs: 100 }, sessions: [session("same-day", "recovery", 0), session("same-day", "tempo", 1)] } };
    const committed = await repository.createInactiveAggregate(plan);
    await expect(repository.createInactiveAggregate(plan)).resolves.toEqual(committed);
    await expect(repository.readAggregate("same-day")).resolves.toEqual(committed);
    await expect(kernel.queryAll<{ plan_kind: string; is_active: number }>("SELECT plan_kind, is_active FROM plans WHERE id = ?", ["same-day"])).resolves.toEqual([{ plan_kind: "running", is_active: 0 }]);
    await expect(repository.createInactiveAggregate({ ...plan, requestSha256: "3".repeat(64) })).rejects.toThrow("sqlite_transaction_failed");
  });
});
