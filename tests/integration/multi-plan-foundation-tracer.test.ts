import { afterEach, describe, expect, it } from "@jest/globals";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { evaluateRunningReadiness } from "../../src/domains/running/contracts";
import {
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
  configureSqliteConnection,
} from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createRunningPlanRepository } from "../../src/platform/sqlite/repositories/runningPlanRepository";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";

class NodePreparedResult<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(readonly changes: number, readonly lastInsertRowId: number, private readonly rows: readonly Row[]) {}
  async getAllAsync(): Promise<readonly Row[]> { return this.rows; }
}

class NodePreparedStatement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}
  async executeAsync<Row extends Record<string, unknown>>(parameters: readonly SQLInputValue[] = []): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) return new NodePreparedResult(0, 0, this.statement.all(...parameters) as Row[]);
    const result = this.statement.run(...parameters);
    return new NodePreparedResult(Number(result.changes), Number(result.lastInsertRowid), []);
  }
  async finalizeAsync(): Promise<void> {}
}

class NodeSqliteConnection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}
  async execAsync(sql: string): Promise<void> { this.database.exec(sql); }
  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> { return new NodePreparedStatement(this.database.prepare(sql)); }
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
  const directory = mkdtempSync(join(tmpdir(), "gym-multi-plan-tracer-"));
  directories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixture = new DatabaseSync(databasePath);
  fixture.exec(readFileSync(join(__dirname, "../migrations/fixtures/v6-metric-profiles.sql"), "utf8"));
  fixture.close();
  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ writer, reader });
  kernels.push(kernel);
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations,
    recoveryBackup: {
      async createAndValidate(request) {
        return { backupId: "recovery-27-28", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true as const };
      },
    },
  }).run();
  return kernel;
}

describe("minimum Running activation and ordered occurrences", () => {
  it("requires a Recovery revision and at least one stable slot", () => {
    expect(evaluateRunningReadiness({ hasRecoveryRevision: false, slotCount: 2 })).toEqual({ ready: false, reason: "missing_recovery" });
    expect(evaluateRunningReadiness({ hasRecoveryRevision: true, slotCount: 0 })).toEqual({ ready: false, reason: "missing_slots" });
    expect(evaluateRunningReadiness({ hasRecoveryRevision: true, slotCount: 2 })).toEqual({ ready: true, reason: "ready" });
  });

  it("keeps Strength active while a minimum Running plan materializes two ordered same-day occurrences", async () => {
    const kernel = await migratedKernel();
    const repository = createRunningPlanRepository(kernel);
    await kernel.write((transaction) => transaction.execute(
      `UPDATE workout_sessions
       SET status = 'completed', completed_at_ms = COALESCE(completed_at_ms, started_at_ms),
           active_session_exercise_id = NULL, active_set_id = NULL
       WHERE status = 'in_progress'`,
    ));
    await kernel.write((transaction) => transaction.execute(
      `INSERT INTO owned_plan_schedules
        (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind)
       VALUES ('schedule-strength-legacy', 'plan-copy', 'active', 1, 1_000, NULL, 'strength')`,
    ));
    await repository.createInactiveMinimum({
      planId: "plan-running", planName: "Recovery Running", anchorDayId: "running-anchor",
      scheduleId: "schedule-running", scheduleVersionId: "schedule-running-v1", scheduleBindingId: "schedule-running-binding",
      createdAtMs: 1_000, effectiveLocalDate: "2026-10-05", timezone: "Asia/Singapore", recoveryRevisionId: "running-recovery-v1",
      slots: [
        { id: "running-slot-0", weekday: "Monday", ordinal: 0, sessionRevisionId: "running-recovery-v1" },
        { id: "running-slot-1", weekday: "Monday", ordinal: 1, sessionRevisionId: "running-recovery-v1" },
      ],
    });
    await repository.activateMinimum({ planId: "plan-running", scheduleId: "schedule-running", expectedPlanRevision: 1, expectedScheduleRevision: 1, activatedAtMs: 2_000 });
    const occurrences = await repository.materializeOccurrences({
      planId: "plan-running", scheduleId: "schedule-running", scheduleVersionId: "schedule-running-v1",
      localDate: "2026-10-05", timezone: "Asia/Singapore", createdAtMs: 3_000,
      occurrenceIds: ["running-opportunity-0", "running-opportunity-1"],
    });
    expect(occurrences).toEqual([
      { id: "running-opportunity-0", slotId: "running-slot-0", ordinal: 0, localDate: "2026-10-05", timezone: "Asia/Singapore" },
      { id: "running-opportunity-1", slotId: "running-slot-1", ordinal: 1, localDate: "2026-10-05", timezone: "Asia/Singapore" },
    ]);
    await expect(kernel.queryAll<{ plan_kind: string; is_active: number }>("SELECT plan_kind, is_active FROM plans WHERE is_active = 1 ORDER BY plan_kind")).resolves.toEqual([
      { plan_kind: "running", is_active: 1 }, { plan_kind: "strength", is_active: 1 },
    ]);
    await expect(kernel.queryAll<{ id: string; slot_id: string }>("SELECT id, slot_id FROM running_opportunities ORDER BY slot_id")).resolves.toEqual([
      { id: "running-opportunity-0", slot_id: "running-slot-0" }, { id: "running-opportunity-1", slot_id: "running-slot-1" },
    ]);
    await expect(kernel.queryAll<{ id: string; current_revision: number }>("SELECT id, current_revision FROM running_session_roots")).resolves.toEqual([
      { id: "running-recovery-v1:root", current_revision: 1 },
    ]);
    await expect(kernel.queryAll<{ id: string; ordinal: number }>("SELECT id, ordinal FROM running_session_slot_revisions ORDER BY ordinal")).resolves.toEqual([
      { id: "running-slot-0:revision:1", ordinal: 0 }, { id: "running-slot-1:revision:1", ordinal: 1 },
    ]);
  });
});
