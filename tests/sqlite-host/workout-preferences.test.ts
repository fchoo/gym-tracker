import { afterEach, describe, expect, it } from "@jest/globals";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configureSqliteConnection, type SqliteConnection, type SqlitePreparedResult, type SqlitePreparedStatement } from "../../src/platform/sqlite/connection";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createWorkoutPreferenceRepository } from "../../src/platform/sqlite/repositories/workoutPreferenceRepository";

const kernels: SqliteKernel[] = [];
const directories: string[] = [];

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

afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

async function open(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-workout-preferences-"));
  directories.push(directory);
  const writer = new Connection(new DatabaseSync(join(directory, "gym.db")));
  const reader = new Connection(new DatabaseSync(join(directory, "gym.db")));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  await createMigrationRunner({ databaseName: "gym.db", kernel, migrations,
    recoveryBackup: { createAndValidate: async () => ({ backupId: "test", databaseName: "gym.db", fromVersion: 0, toVersion: 0, validated: true }) } }).run();
  kernels.push(kernel);
  await kernel.write(async (transaction) => {
    for (const id of ["strength-a", "strength-b"]) {
      await transaction.execute(`INSERT INTO plans (id, content_pack_id, origin, source_namespace, upstream_id, name, days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision, plan_kind) VALUES (?, NULL, 'custom', NULL, NULL, ?, 1, 'test', 'test', 1, 'test', 0, 1, 'strength')`, [id, id]);
    }
    await transaction.execute(`INSERT INTO plans (id, content_pack_id, origin, source_namespace, upstream_id, name, days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision, plan_kind) VALUES ('running-a', NULL, 'custom', NULL, NULL, 'running-a', 1, 'test', 'test', 1, 'test', 0, 1, 'running')`);
  });
  return kernel;
}

describe("workout plan preferences", () => {
  it("commits one plan's versioned preference without touching another plan", async () => {
    const repository = createWorkoutPreferenceRepository(await open());
    expect(await repository.read("strength-a")).toMatchObject({ revision: 0, defaultRestSeconds: 90, weightIncrementGrams: 2500 });
    expect(await repository.write({ planId: "strength-a", expectedRevision: 0, defaultRestSeconds: 120, weightIncrementGrams: 5000, updatedAtMs: 1 })).toMatchObject({ revision: 1, defaultRestSeconds: 120, weightIncrementGrams: 5000 });
    expect(await repository.read("strength-b")).toMatchObject({ revision: 0, defaultRestSeconds: 90, weightIncrementGrams: 2500 });
    await expect(repository.write({ planId: "strength-a", expectedRevision: 0, defaultRestSeconds: 60, weightIncrementGrams: 1250, updatedAtMs: 2 })).rejects.toThrow();
    await expect(repository.write({ planId: "running-a", expectedRevision: 0, defaultRestSeconds: 60, weightIncrementGrams: 1250, updatedAtMs: 2 })).rejects.toThrow();
  });
});
