import { createHash } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "@jest/globals";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createScheduleCollisionRepository } from "../../src/platform/sqlite/repositories/scheduleCollisionRepository";
import { configureSqliteConnection, type SqliteConnection, type SqlitePreparedResult, type SqlitePreparedStatement } from "../../src/platform/sqlite/connection";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(readonly changes: number, readonly lastInsertRowId: number, private readonly rows: readonly Row[]) {}
  async getAllAsync(): Promise<readonly Row[]> { return this.rows; }
}
class Statement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}
  async executeAsync<Row extends Record<string, unknown>>(parameters: readonly SQLInputValue[] = []): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    const result = this.statement.run(...parameters); return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
  }
  async finalizeAsync(): Promise<void> {}
}
class Connection implements SqliteConnection {
  constructor(private readonly db: DatabaseSync) {}
  async execAsync(sql: string): Promise<void> { this.db.exec(sql); }
  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> { return new Statement(this.db.prepare(sql)); }
  async isInTransactionAsync(): Promise<boolean> { return this.db.isTransaction; }
  async closeAsync(): Promise<void> { this.db.close(); }
}

const directories = new Set<string>(); const kernels: SqliteKernel[] = [];
const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
afterEach(async () => { await Promise.all(kernels.splice(0).map((kernel) => kernel.close())); for (const directory of directories) rmSync(directory, { force: true, recursive: true }); directories.clear(); });

async function runtime(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-schedule-collision-")); directories.add(directory);
  const path = join(directory, "gym-tracker.db"); const fixture = new DatabaseSync(path);
  fixture.exec(readFileSync(join(__dirname, "../migrations/fixtures/v6-metric-profiles.sql"), "utf8")); fixture.close();
  const writer = new Connection(new DatabaseSync(path)); const reader = new Connection(new DatabaseSync(path));
  await configureSqliteConnection(writer, { enableWal: true }); await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ writer, reader }); kernels.push(kernel);
  await createMigrationRunner({ databaseName: "gym-tracker.db", kernel, migrations, recoveryBackup: { async createAndValidate(request) { return { backupId: "collision", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true as const }; } } }).run();
  await kernel.write(async (transaction) => {
    await transaction.execute("UPDATE workout_sessions SET status = 'completed', completed_at_ms = COALESCE(completed_at_ms, started_at_ms), active_session_exercise_id = NULL, active_set_id = NULL WHERE status = 'in_progress'");
    await transaction.execute("INSERT INTO plans (id, content_pack_id, origin, source_namespace, upstream_id, name, days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision, plan_kind) VALUES ('running-plan', NULL, 'custom', NULL, NULL, 'Running', 1, 'Owner', '10K', 30, 'Owner', 0, 1, 'running')");
    await transaction.execute("INSERT INTO running_plans (plan_id, status, revision, created_at_ms) VALUES ('running-plan', 'ready', 1, 1)");
    await transaction.execute("INSERT INTO running_session_roots (id, plan_id, session_kind, current_revision, created_at_ms) VALUES ('running-root', 'running-plan', 'recovery', 1, 1)");
    await transaction.execute("INSERT INTO running_session_revisions (id, plan_id, session_kind, revision, definition_json, created_at_ms) VALUES ('running-session-v1', 'running-plan', 'recovery', 1, '{}', 1)");
    await transaction.execute("INSERT INTO running_session_slot_roots (id, plan_id, weekday, created_at_ms) VALUES ('running-slot-root', 'running-plan', 'Monday', 1)");
    await transaction.execute("INSERT INTO running_session_slot_revisions (id, slot_root_id, revision, ordinal, session_root_id, session_revision_id, created_at_ms) VALUES ('running-slot-v1', 'running-slot-root', 1, 0, 'running-root', 'running-session-v1', 1)");
    await transaction.execute("INSERT INTO running_session_slots (id, plan_id, weekday, ordinal, session_revision_id, revision, retired_at_ms) VALUES ('running-slot-v1', 'running-plan', 'Monday', 0, 'running-session-v1', 1, NULL)");
    await transaction.execute("INSERT INTO owned_plan_schedules (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind) VALUES ('strength-schedule', 'plan-hold', 'active', 4, 1, NULL, 'strength'), ('running-schedule', 'running-plan', 'active', 7, 1, NULL, 'running')");
    await transaction.execute("INSERT INTO owned_plan_schedule_versions (id, schedule_id, version_number, effective_local_date, mode, timezone, rotation_pointer, created_at_ms) VALUES ('strength-version', 'strength-schedule', 1, '2026-11-01', 'weekday', 'Asia/Singapore', NULL, 1), ('running-version', 'running-schedule', 1, '2026-11-01', 'weekday', 'Asia/Singapore', NULL, 1)");
    await transaction.execute("INSERT INTO owned_plan_schedule_opportunities (id, schedule_id, schedule_version_id, local_date, source, plan_day_id, state, outcome, session_id, revision, consumed_at_ms) VALUES ('strength-opportunity', 'strength-schedule', 'strength-version', '2026-11-09', 'weekday', 'plan-day-hold', 'pending', NULL, NULL, 2, NULL)");
    await transaction.execute("INSERT INTO running_opportunities (id, plan_id, schedule_id, schedule_version_id, slot_id, local_date, timezone, session_revision_id, state, created_at_ms) VALUES ('running-opportunity', 'running-plan', 'running-schedule', 'running-version', 'running-slot-v1', '2026-11-09', 'Asia/Singapore', 'running-session-v1', 'planned', 1)");
  });
  return kernel;
}

describe("running schedule collision command", () => {
  it.each(["move_running", "move_strength", "keep_both"] as const)("commits %s as an immutable, selected-occurrence-only result", async (choice) => {
    const kernel = await runtime(); const repository = createScheduleCollisionRepository(kernel, sha256);
    const preview = await repository.previewForRunningPlan("running-plan"); expect(preview).not.toBeNull();
    const result = await repository.confirm({ requestId: `request-${choice}`, choice, preview: preview!, committedAtMs: 10 });
    expect(result).toMatchObject({ outcome: "committed", choice });
    expect(await kernel.queryAll("SELECT state FROM running_opportunities WHERE id = 'running-opportunity'")).toEqual([{ state: "planned" }]);
    expect(await kernel.queryAll("SELECT state FROM owned_plan_schedule_opportunities WHERE id = 'strength-opportunity'")).toEqual([{ state: "pending" }]);
    expect(await kernel.queryAll("SELECT choice FROM schedule_collision_outcomes")).toEqual([{ choice }]);
  });

  it("replays the identical request, rejects a hash conflict, and rolls back a stale dual revision", async () => {
    const kernel = await runtime(); const repository = createScheduleCollisionRepository(kernel, sha256);
    const preview = (await repository.previewForRunningPlan("running-plan"))!;
    await expect(repository.confirm({ requestId: "replay", choice: "move_running", preview, committedAtMs: 10 })).resolves.toMatchObject({ outcome: "committed" });
    await expect(repository.confirm({ requestId: "replay", choice: "move_running", preview, committedAtMs: 10 })).resolves.toMatchObject({ outcome: "already_committed" });
    await expect(repository.confirm({ requestId: "replay", choice: "keep_both", preview, committedAtMs: 10 })).rejects.toThrow("schedule_collision_request_identity_conflict");
    await kernel.write((transaction) => transaction.execute("UPDATE owned_plan_schedules SET revision = revision + 1 WHERE id = 'strength-schedule'"));
    await expect(repository.confirm({ requestId: "stale", choice: "move_strength", preview, committedAtMs: 11 })).rejects.toThrow("schedule_collision_revision_conflict");
    expect(await kernel.queryAll("SELECT request_id FROM schedule_collision_outcomes ORDER BY request_id")).toEqual([{ request_id: "replay" }]);
  });

  it("rebuilds current projection from immutable receipts without collapsing same-day Running identities", async () => {
    const kernel = await runtime(); const repository = createScheduleCollisionRepository(kernel, sha256);
    const preview = (await repository.previewForRunningPlan("running-plan"))!;
    await repository.confirm({ requestId: "projection", choice: "keep_both", preview, committedAtMs: 10 });
    await kernel.write((transaction) => transaction.execute("DELETE FROM schedule_collision_projections"));
    await repository.rebuildProjection();
    expect(await kernel.queryAll("SELECT acknowledged, selected_kind FROM schedule_collision_projections")).toEqual([{ acknowledged: 1, selected_kind: "none" }]);
  });

  it("keeps ordinary collision source facts immutable while allowing projection rebuild", async () => {
    const kernel = await runtime(); const repository = createScheduleCollisionRepository(kernel, sha256);
    const preview = (await repository.previewForRunningPlan("running-plan"))!;
    await repository.confirm({ requestId: "ordinary-guard", choice: "move_running", preview, committedAtMs: 10 });
    await expect(kernel.write((transaction) => transaction.execute("DELETE FROM schedule_collision_receipts WHERE request_id = ?", ["ordinary-guard"]))).rejects.toThrow("sqlite_transaction_failed");
    await expect(kernel.write((transaction) => transaction.execute("DELETE FROM schedule_collision_outcomes WHERE request_id = ?", ["ordinary-guard"]))).rejects.toThrow("sqlite_transaction_failed");
    await repository.rebuildProjection();
    expect(await kernel.queryAll("SELECT outcome_id FROM schedule_collision_projections")).toHaveLength(1);
  });
});
