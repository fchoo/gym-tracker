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
import { canonicalRunningRequestHash, saveRunningSourceGraph, type CreateInactiveRunningPlanInput, type SaveRunningSourceGraphInput } from "../../src/domains/running/commands";
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

afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of directories) rmSync(directory, { force: true, recursive: true });
  directories.clear();
});

async function migratedKernel(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-running-lifecycle-"));
  directories.add(directory);
  const path = join(directory, "gym-tracker.db");
  const fixture = new DatabaseSync(path);
  fixture.exec(readFileSync(join(__dirname, "../migrations/fixtures/v6-metric-profiles.sql"), "utf8"));
  fixture.close();
  const writer = new Connection(new DatabaseSync(path));
  const reader = new Connection(new DatabaseSync(path));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ writer, reader });
  kernels.push(kernel);
  await createMigrationRunner({ databaseName: "gym-tracker.db", kernel, migrations, recoveryBackup: { async createAndValidate(request) { return { backupId: "test", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true as const }; } } }).run();
  return kernel;
}

function session(planId: string, kind: "recovery" | "tempo", ordinal: number): RunningPlanSession {
  return {
    slot: { id: `${kind}-slot-v1`, rootId: `${kind}-slot`, weekday: "Monday", revision: 1, ordinal },
    session: { version: 1, id: `${kind}-v1`, rootId: kind, planId, sessionKind: kind, revision: 1, createdAtMs: 100, phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "duration", durationMs: 60_000 }] }], contextual: kind === "tempo" ? { format: "continuous", work: { durationMs: 60_000 } } : {} },
  } as RunningPlanSession;
}

describe("Running plan lifecycle persistence", () => {
  it("applies a prospective exact-membership deletion once while preserving stable roots and replay receipts", async () => {
    const kernel = await migratedKernel();
    const repository = createRunningPlanRepository(kernel);
    const plan: CreateInactiveRunningPlanInput = {
      requestId: "create", requestSha256: "a".repeat(64),
      plan: {
        version: 1, id: "running", name: "Running", revision: 1, createdAtMs: 100,
        goal: { version: 1, id: "goal-v1", planId: "running", revision: 1, goalDistanceMeters: 5_000, trainingDays: ["Monday"], createdAtMs: 100 },
        sessions: [session("running", "recovery", 0), session("running", "tempo", 1)],
      },
    };
    await repository.createInactiveAggregate(plan);

    const recovery = session("running", "recovery", 0);
    const command: Omit<SaveRunningSourceGraphInput, "requestSha256"> = {
      requestId: "delete-tempo", operation: "edit", planId: "running", expectedPlanRevision: 1, createdAtMs: 200,
      goal: { ...plan.plan.goal, id: "goal-v2", revision: 2, createdAtMs: 200 },
      sessions: [{ ...recovery.session, id: "recovery-v2", revision: 2, createdAtMs: 200 }],
      slots: [{ id: "recovery-slot-v2", rootId: recovery.slot.rootId, weekday: "Monday", revision: 2, ordinal: 0, sessionRootId: recovery.session.rootId, sessionRevisionId: "recovery-v2" }],
      completeMembership: true,
    };
    const input = { ...command, requestSha256: canonicalRunningRequestHash(command) };

    const committed = await saveRunningSourceGraph(repository, input);
    await expect(saveRunningSourceGraph(repository, input)).resolves.toEqual(committed);
    await expect(repository.readAggregate("running")).resolves.toMatchObject({
      revision: 2,
      sessions: [expect.objectContaining({ slot: expect.objectContaining({ rootId: "recovery-slot", ordinal: 0, revision: 2 }), session: expect.objectContaining({ rootId: "recovery", revision: 2 }) })],
    });
    await expect(kernel.queryAll<{ id: string }>("SELECT id FROM running_session_slot_roots WHERE plan_id = ? ORDER BY id", ["running"])).resolves.toEqual([
      { id: "recovery-slot" }, { id: "tempo-slot" },
    ]);
    await expect(kernel.queryAll<{ request_id: string }>("SELECT request_id FROM running_plan_receipts WHERE plan_id = ? AND request_id = ?", ["running", "delete-tempo"])).resolves.toEqual([{ request_id: "delete-tempo" }]);
  });
});
