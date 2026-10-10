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
import { createLogicalBackupRepository } from "../../src/platform/sqlite/repositories/logicalBackupRepository";
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

  it("adds Recovery, Long run, and Progression revisions then reopens exact typed source facts", async () => {
    const kernel = await migratedKernel(); const repository = createRunningPlanRepository(kernel);
    const plan: CreateInactiveRunningPlanInput = { requestId: "typed-request", requestSha256: "4".repeat(64), plan: { version: 1, id: "typed", name: "Typed", revision: 1, createdAtMs: 100, goal: { version: 1, id: "typed-goal", planId: "typed", revision: 1, goalDistanceMeters: 10_000, trainingDays: ["Monday", "Thursday"], createdAtMs: 100 }, sessions: [] } };
    await repository.createInactiveAggregate(plan);
    const graph = (expectedPlanRevision: number, requestId: string, session: SaveRunningSourceGraphInput["sessions"][number], slot: SaveRunningSourceGraphInput["slots"][number]): SaveRunningSourceGraphInput => {
      const value = { requestId, operation: "edit" as const, planId: "typed", expectedPlanRevision, createdAtMs: 200 + expectedPlanRevision, goal: { ...plan.plan.goal, id: `typed-goal-${expectedPlanRevision}`, revision: expectedPlanRevision + 1, createdAtMs: 200 + expectedPlanRevision }, sessions: [session], slots: [slot] };
      return { ...value, requestSha256: canonicalRunningRequestHash(value) };
    };
    const recovery = { version: 1 as const, id: "recovery-v1", rootId: "recovery-root", planId: "typed", revision: 1, createdAtMs: 201, sessionKind: "recovery" as const, phases: [{ ordinal: 0, kind: "work" as const, steps: [{ ordinal: 0, kind: "distance" as const, distanceMeters: 5_000 }] }], advisoryTarget: { rpe: 4 }, contextual: {} };
    await saveRunningSourceGraph(repository, graph(1, "typed-recovery", recovery, { id: "recovery-slot-v1", rootId: "recovery-slot", weekday: "Monday", revision: 1, ordinal: 0, sessionRootId: recovery.rootId, sessionRevisionId: recovery.id }));
    const longRun = { version: 1 as const, id: "long-v1", rootId: "long-root", planId: "typed", revision: 1, createdAtMs: 202, sessionKind: "long_run" as const, phases: [{ ordinal: 0, kind: "work" as const, steps: [{ ordinal: 0, kind: "distance" as const, distanceMeters: 14_000 }] }], advisoryTarget: { heartRateZone: 2 }, contextual: { finish: "steady_finish" as const } };
    await saveRunningSourceGraph(repository, graph(2, "typed-long", longRun, { id: "long-slot-v1", rootId: "long-slot", weekday: "Thursday", revision: 1, ordinal: 0, sessionRootId: longRun.rootId, sessionRevisionId: longRun.id }));
    const progression = { version: 1 as const, id: "progression-v1", rootId: "progression-root", planId: "typed", revision: 1, createdAtMs: 203, sessionKind: "progression" as const, phases: [{ ordinal: 0, kind: "work" as const, steps: [{ ordinal: 0, kind: "distance" as const, distanceMeters: 9_000 }] }], contextual: { stages: 3, startTarget: { rpe: 4 }, finishTarget: { paceMsPerKm: 290_000 } } };
    await saveRunningSourceGraph(repository, graph(3, "typed-progression", progression, { id: "progression-slot-v1", rootId: "progression-slot", weekday: "Thursday", revision: 1, ordinal: 1, sessionRootId: progression.rootId, sessionRevisionId: progression.id }));
    const readBack = await repository.readAggregate("typed");
    expect(readBack?.active).toBe(false);
    expect(readBack?.sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ session: expect.objectContaining({ sessionKind: "recovery", advisoryTarget: { rpe: 4 } }) }),
      expect.objectContaining({ session: expect.objectContaining({ sessionKind: "long_run", contextual: { finish: "steady_finish" } }) }),
      expect.objectContaining({ session: expect.objectContaining({ sessionKind: "progression", contextual: { stages: 3, startTarget: { rpe: 4 }, finishTarget: { paceMsPerKm: 290_000 } } }) }),
    ]));
    expect(readBack?.sessions.filter((entry) => entry.slot.weekday === "Thursday").map((entry) => entry.slot.ordinal)).toEqual([0, 1]);
  });

  it("replaces only the active Running schedule, rejects stale or active-workout lifecycle confirms, and preserves archived source history", async () => {
    const kernel = await migratedKernel();
    const repository = createRunningPlanRepository(kernel);
    await kernel.write((transaction) => transaction.execute(
      `UPDATE workout_sessions SET status = 'completed', completed_at_ms = COALESCE(completed_at_ms, started_at_ms),
       active_session_exercise_id = NULL, active_set_id = NULL WHERE status = 'in_progress'`,
    ));
    const create = async (id: string) => {
      const base = session(id, "recovery", 0);
      const recovery = {
        ...base,
        slot: { ...base.slot, id: `${id}-slot-v1`, rootId: `${id}-slot` },
        session: { ...base.session, id: `${id}-recovery-v1`, rootId: `${id}-recovery` },
      };
      return repository.createInactiveAggregate({
      requestId: `${id}-create`, requestSha256: `${id === "running-a" ? "a" : "b"}`.repeat(64),
      plan: {
        version: 1, id, name: id, revision: 1, createdAtMs: 100,
        goal: { version: 1, id: `${id}-goal`, planId: id, revision: 1, goalDistanceMeters: 5_000, trainingDays: ["Monday"], createdAtMs: 100 },
        sessions: [recovery],
      },
      });
    };
    await create("running-a");
    await create("running-b");
    const confirm = async (requestId: string, preview: Awaited<ReturnType<typeof repository.previewLifecycle>>) => {
      const input = { action: preview.action, requestId, preview, confirmationToken: preview.confirmationToken, committedAtMs: 200 };
      return repository.confirmLifecycle({ ...input, requestSha256: canonicalRunningRequestHash(input) });
    };
    const strengthBefore = await kernel.queryAll<{ id: string; is_active: number }>(
      "SELECT id, is_active FROM plans WHERE plan_kind = 'strength' ORDER BY id",
    );
    const firstPreview = await repository.previewLifecycle("running-a", "activate");
    expect(firstPreview.activeRunning).toBeNull();
    await expect(confirm("activate-a", firstPreview)).resolves.toEqual({ planId: "running-a", lifecycle: "active" });
    const replacePreview = await repository.previewLifecycle("running-b", "activate");
    expect(replacePreview.activeRunning).toMatchObject({ planId: "running-a", scheduleId: "running-a:schedule" });
    const replacement = await confirm("activate-b", replacePreview);
    await expect(repository.confirmLifecycle({
      action: replacePreview.action, requestId: "activate-b", preview: replacePreview,
      confirmationToken: replacePreview.confirmationToken, committedAtMs: 200,
      requestSha256: canonicalRunningRequestHash({ action: replacePreview.action, requestId: "activate-b", preview: replacePreview, confirmationToken: replacePreview.confirmationToken, committedAtMs: 200 }),
    })).resolves.toEqual(replacement);
    await expect(repository.readAggregate("running-a")).resolves.toMatchObject({ lifecycle: "inactive", active: false });
    await expect(repository.readAggregate("running-b")).resolves.toMatchObject({ lifecycle: "active", active: true });
    await expect(kernel.queryAll<{ id: string; is_active: number }>("SELECT id, is_active FROM plans WHERE plan_kind = 'strength' ORDER BY id")).resolves.toEqual(strengthBefore);

    const stalePreview = await repository.previewLifecycle("running-b", "archive");
    await kernel.write((transaction) => transaction.execute("UPDATE plans SET revision = revision + 1 WHERE id = ?", ["running-b"]));
    await expect(confirm("archive-stale", stalePreview)).rejects.toThrow("sqlite_transaction_failed");

    const archivePreview = await repository.previewLifecycle("running-b", "archive");
    await kernel.write((transaction) => transaction.execute("UPDATE workout_sessions SET status = 'in_progress', completed_at_ms = NULL WHERE id = (SELECT id FROM workout_sessions LIMIT 1)"));
    const blockedPreview = await repository.previewLifecycle("running-b", "archive");
    expect(blockedPreview.activeWorkout).toBe(true);
    await expect(confirm("archive-blocked", blockedPreview)).rejects.toThrow("sqlite_transaction_failed");
    await kernel.write((transaction) => transaction.execute("UPDATE workout_sessions SET status = 'completed', completed_at_ms = COALESCE(completed_at_ms, started_at_ms), active_session_exercise_id = NULL, active_set_id = NULL WHERE status = 'in_progress'"));
    await expect(confirm("archive-b", archivePreview)).resolves.toEqual({ planId: "running-b", lifecycle: "archived" });
    await expect(repository.readAggregate("running-b")).resolves.toMatchObject({ lifecycle: "archived", active: false, sessions: [expect.anything()] });
    await expect(kernel.queryAll<{ count: number }>("SELECT COUNT(*) AS count FROM running_session_revisions WHERE plan_id = ?", ["running-b"])).resolves.toEqual([{ count: 1 }]);
    const backup = await createLogicalBackupRepository(kernel).collect({ snapshotId: "lifecycle-backup", createdAtMs: 300 });
    expect(backup.tables.running_plan_events).toEqual(expect.arrayContaining([
      expect.objectContaining({ plan_id: "running-b", event_type: "archived" }),
    ]));
    expect(backup.tables.running_plan_receipts).toEqual(expect.arrayContaining([
      expect.objectContaining({ plan_id: "running-b", operation: "archive" }),
    ]));
    const reactivatePreview = await repository.previewLifecycle("running-b", "reactivate");
    await expect(confirm("reactivate-b", reactivatePreview)).resolves.toEqual({ planId: "running-b", lifecycle: "inactive" });
    await expect(repository.readAggregate("running-b")).resolves.toMatchObject({ lifecycle: "inactive", active: false });
  });
});
