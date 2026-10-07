import { afterEach, describe, expect, it } from "@jest/globals";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { confirmRunningActivityMatch } from "../../src/domains/running/activityMatchCommands";
import { type SqliteConnection, type SqlitePreparedResult, type SqlitePreparedStatement, configureSqliteConnection } from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createImportedActivityRepository } from "../../src/platform/sqlite/repositories/importedActivityRepository";
import { createRunningActivityMatchRepository } from "../../src/platform/sqlite/repositories/runningActivityMatchRepository";
import { createRunningPlanRepository } from "../../src/platform/sqlite/repositories/runningPlanRepository";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> { constructor(readonly changes: number, readonly lastInsertRowId: number, private readonly rows: readonly Row[]) {} async getAllAsync() { return this.rows; } }
class Statement implements SqlitePreparedStatement { constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {} async executeAsync<Row extends Record<string, unknown>>(parameters: readonly SQLInputValue[] = []): Promise<SqlitePreparedResult<Row>> { if (this.statement.columns().length > 0) return new Result(0, 0, this.statement.all(...parameters) as Row[]); const result = this.statement.run(...parameters); return new Result(Number(result.changes), Number(result.lastInsertRowid), []); } async finalizeAsync() {} }
class Connection implements SqliteConnection { constructor(private readonly db: DatabaseSync) {} async execAsync(sql: string) { this.db.exec(sql); } async prepareAsync(sql: string) { return new Statement(this.db.prepare(sql)); } async isInTransactionAsync() { return this.db.isTransaction; } async closeAsync() { this.db.close(); } }
const directories = new Set<string>(); const kernels: SqliteKernel[] = [];
afterEach(async () => { await Promise.all(kernels.splice(0).map((kernel) => kernel.close())); for (const directory of directories) rmSync(directory, { recursive: true, force: true }); directories.clear(); });
async function runtime() { const directory = mkdtempSync(join(tmpdir(), "gym-running-match-")); directories.add(directory); const path = join(directory, "gym.db"); const fixture = new DatabaseSync(path); fixture.exec(readFileSync(join(__dirname, "../migrations/fixtures/v6-metric-profiles.sql"), "utf8")); fixture.close(); const writer = new Connection(new DatabaseSync(path)); const reader = new Connection(new DatabaseSync(path)); await configureSqliteConnection(writer, { enableWal: true }); await configureSqliteConnection(reader, { enableWal: false }); const kernel = createSqliteKernel({ writer, reader }); kernels.push(kernel); await createMigrationRunner({ databaseName: path, kernel, migrations, recoveryBackup: { async createAndValidate(request) { return { backupId: "test", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true as const }; } } }).run(); return kernel; }

async function seed(kernel: SqliteKernel) {
  const plans = createRunningPlanRepository(kernel);
  await kernel.write((transaction) => transaction.execute("UPDATE workout_sessions SET status = 'completed', completed_at_ms = COALESCE(completed_at_ms, started_at_ms), active_session_exercise_id = NULL, active_set_id = NULL WHERE status = 'in_progress'"));
  await kernel.write((transaction) => transaction.execute("INSERT INTO owned_plan_schedules (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind) VALUES ('strength-schedule', 'plan-copy', 'active', 1, 1, NULL, 'strength')"));
  await plans.createInactiveMinimum({ planId: "running-plan", planName: "Running", anchorDayId: "running-anchor", scheduleId: "running-schedule", scheduleVersionId: "running-version", scheduleBindingId: "running-binding", createdAtMs: 1000, effectiveLocalDate: "2026-10-05", timezone: "Asia/Singapore", recoveryRevisionId: "running-session-v1", slots: [{ id: "running-slot", weekday: "Monday", ordinal: 0, sessionRevisionId: "running-session-v1" }] });
  await plans.activateMinimum({ planId: "running-plan", scheduleId: "running-schedule", expectedPlanRevision: 1, expectedScheduleRevision: 1, activatedAtMs: 2000 });
  await plans.materializeOccurrences({ planId: "running-plan", scheduleId: "running-schedule", scheduleVersionId: "running-version", localDate: "2026-10-05", timezone: "Asia/Singapore", createdAtMs: 3000, occurrenceIds: ["running-opportunity"] });
  await kernel.write(async (transaction) => { await transaction.execute("INSERT INTO imported_activities(id, source, source_activity_id, started_at_ms, aggregate_json, imported_at_ms) VALUES ('activity-1', 'garmin_connect_account:owner', 'external-1', 1, '{}', 1)"); await transaction.execute("INSERT INTO imported_activity_identities(activity_id, source_kind, account_namespace, external_activity_id, aggregate_revision, accepted_normalized_sha256, removal_state) VALUES ('activity-1', 'garmin_connect_account', 'owner', 'external-1', 1, ?, 'active')", ["a".repeat(64)]); });
}

describe("Running activity matching", () => {
  it("does not allow an implicit candidate read to create a match", async () => {
    const repository = { confirm: async () => Object.freeze({ kind: "conflict" as const, activityId: "activity-1", opportunityId: "opportunity-1", relationRevision: 0 }) };
    await expect(confirmRunningActivityMatch(repository, {
      requestId: "candidate-read-is-not-a-command", requestSha256: "b".repeat(64), action: "match" as const,
      activityId: "activity-1", expectedActivityRevision: 1, opportunityId: "opportunity-1", expectedOpportunityRevision: 1,
      expectedRelationRevision: 0, scheduleId: "schedule-1", scheduleVersionId: "schedule-version-1", slotId: "slot-1",
      sessionRevisionId: "session-revision-1", occurredAtMs: 1_700_000_000_000,
    })).resolves.toMatchObject({ kind: "conflict" });
  });

  it("appends one revision-fenced confirmation and replays it without duplicating the current relation", async () => {
    const kernel = await runtime(); await seed(kernel); const repository = createRunningActivityMatchRepository(kernel);
    const input = { requestId: "match-1", requestSha256: "c".repeat(64), action: "match" as const, activityId: "activity-1", expectedActivityRevision: 1, opportunityId: "running-opportunity", expectedOpportunityRevision: 1, expectedRelationRevision: 0, scheduleId: "running-schedule", scheduleVersionId: "running-version", slotId: "running-slot", sessionRevisionId: "running-session-v1", occurredAtMs: 4000 };
    await expect(confirmRunningActivityMatch(repository, input)).resolves.toEqual({ kind: "matched", activityId: "activity-1", opportunityId: "running-opportunity", relationRevision: 1 });
    await expect(confirmRunningActivityMatch(repository, input)).resolves.toEqual({ kind: "replayed", activityId: "activity-1", opportunityId: "running-opportunity", relationRevision: 1 });
    await expect(kernel.queryAll<{ count: number }>("SELECT count(*) AS count FROM running_activity_current_matches")).resolves.toEqual([{ count: 1 }]);
    await expect(kernel.queryAll<{ count: number }>("SELECT count(*) AS count FROM running_activity_match_events")).resolves.toEqual([{ count: 1 }]);
    await expect(confirmRunningActivityMatch(repository, { ...input, requestId: "old-match", requestSha256: "d".repeat(64), expectedRelationRevision: 0 })).resolves.toMatchObject({ kind: "conflict" });
  });
});
