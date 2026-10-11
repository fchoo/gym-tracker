import { afterEach, describe, expect, it } from "@jest/globals";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { confirmRunningActivityMatch, queryRunningActivityMatchCandidates, type RunningActivityMatchInput } from "../../src/domains/running/activityMatchCommands";
import { type SqliteConnection, type SqlitePreparedResult, type SqlitePreparedStatement, configureSqliteConnection } from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createImportedActivityRepository } from "../../src/platform/sqlite/repositories/importedActivityRepository";
import { createRunningActivityMatchRepository } from "../../src/platform/sqlite/repositories/runningActivityMatchRepository";
import { createRunningPlanRepository } from "../../src/platform/sqlite/repositories/runningPlanRepository";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> { constructor(readonly changes: number, readonly lastInsertRowId: number, private readonly rows: readonly Row[]) {} async getAllAsync() { return this.rows; } }
class Statement implements SqlitePreparedStatement { constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {} async executeAsync<Row extends Record<string, unknown>>(parameters: readonly SQLInputValue[] = []): Promise<SqlitePreparedResult<Row>> { if (this.statement.columns().length > 0) return new Result(0, 0, this.statement.all(...parameters) as Row[]); const result = this.statement.run(...parameters); return new Result(Number(result.changes), Number(result.lastInsertRowid), []); } async finalizeAsync() {} }
class Connection implements SqliteConnection { constructor(readonly db: DatabaseSync) {} async execAsync(sql: string) { this.db.exec(sql); } async prepareAsync(sql: string) { return new Statement(this.db.prepare(sql)); } async isInTransactionAsync() { return this.db.isTransaction; } async closeAsync() { this.db.close(); } }
const directories = new Set<string>(); const kernels: SqliteKernel[] = [];
afterEach(async () => { await Promise.all(kernels.splice(0).map((kernel) => kernel.close())); for (const directory of directories) rmSync(directory, { recursive: true, force: true }); directories.clear(); });
async function runtime() { const directory = mkdtempSync(join(tmpdir(), "gym-running-match-")); directories.add(directory); const path = join(directory, "gym.db"); const fixture = new DatabaseSync(path); fixture.exec(readFileSync(join(__dirname, "../migrations/fixtures/v6-metric-profiles.sql"), "utf8")); fixture.close(); const writer = new Connection(new DatabaseSync(path)); const reader = new Connection(new DatabaseSync(path)); await configureSqliteConnection(writer, { enableWal: true }); await configureSqliteConnection(reader, { enableWal: false }); const kernel = createSqliteKernel({ writer, reader }); kernels.push(kernel); await createMigrationRunner({ databaseName: path, kernel, migrations, recoveryBackup: { async createAndValidate(request) { return { backupId: "test", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true as const }; } } }).run(); return { kernel, writer }; }

async function seed(kernel: SqliteKernel) {
  const plans = createRunningPlanRepository(kernel);
  await kernel.write((transaction) => transaction.execute("UPDATE workout_sessions SET status = 'completed', completed_at_ms = COALESCE(completed_at_ms, started_at_ms), active_session_exercise_id = NULL, active_set_id = NULL WHERE status = 'in_progress'"));
  await kernel.write((transaction) => transaction.execute("INSERT INTO owned_plan_schedules (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind) VALUES ('strength-schedule', 'plan-copy', 'active', 1, 1, NULL, 'strength')"));
  await plans.createInactiveMinimum({ planId: "running-plan", planName: "Running", anchorDayId: "running-anchor", scheduleId: "running-schedule", scheduleVersionId: "running-version", scheduleBindingId: "running-binding", createdAtMs: 1000, effectiveLocalDate: "2026-10-05", timezone: "Asia/Singapore", recoveryRevisionId: "running-session-v1", slots: [{ id: "running-slot", weekday: "Monday", ordinal: 0, sessionRevisionId: "running-session-v1" }] });
  await plans.activateMinimum({ planId: "running-plan", scheduleId: "running-schedule", expectedPlanRevision: 1, expectedScheduleRevision: 1, activatedAtMs: 2000 });
  await plans.materializeOccurrences({ planId: "running-plan", scheduleId: "running-schedule", scheduleVersionId: "running-version", localDate: "2026-10-05", timezone: "Asia/Singapore", createdAtMs: 3000, occurrenceIds: ["running-opportunity"] });
  await kernel.write(async (transaction) => { await transaction.execute("INSERT INTO imported_activities(id, source, source_activity_id, started_at_ms, aggregate_json, imported_at_ms) VALUES ('activity-1', 'garmin_connect_account:owner', 'external-1', 1, '{}', 1)"); await transaction.execute("INSERT INTO imported_activity_identities(activity_id, source_kind, account_namespace, external_activity_id, aggregate_revision, accepted_normalized_sha256, removal_state) VALUES ('activity-1', 'garmin_connect_account', 'owner', 'external-1', 1, ?, 'active')", ["a".repeat(64)]); await transaction.execute("INSERT INTO imported_activity_events(id, activity_id, aggregate_revision, event_type, payload_json, created_at_ms) VALUES ('activity-1:import', 'activity-1', 1, 'imported', '{}', 1)"); await transaction.execute("INSERT INTO imported_activity_current_lifecycle(activity_id, aggregate_revision, removal_state, lifecycle_event_id) VALUES ('activity-1', 1, 'active', 'activity-1:import')"); });
}

function matchInput(overrides: Partial<RunningActivityMatchInput> = {}): RunningActivityMatchInput {
  return {
    requestId: "match-request",
    requestSha256: "a".repeat(64),
    action: "match",
    activityId: "activity-1",
    expectedActivityRevision: 1,
    expectedAcceptedPayloadSha256: "a".repeat(64),
    opportunityId: "running-opportunity",
    expectedOpportunityRevision: 1,
    expectedRelationRevision: 0,
    planId: "running-plan",
    scheduleId: "running-schedule",
    scheduleVersionId: "running-version",
    expectedScheduleRevision: 2,
    planDayId: "running-anchor",
    expectedPlanDayRevision: 1,
    slotId: "running-slot",
    slotRevisionId: "running-slot:revision:1",
    expectedSlotRevision: 1,
    sessionRevisionId: "running-session-v1",
    expectedSessionRevision: 1,
    occurredAtMs: 4_000,
    ...overrides,
  };
}

describe("Running activity matching", () => {
  it("reads stable same-day candidates in slot order without writing and confirms only the selected occurrence", async () => {
    const { kernel } = await runtime();
    await seed(kernel);
    await kernel.write(async (transaction) => {
      await transaction.execute("INSERT INTO running_session_slots(id, plan_id, weekday, ordinal, session_revision_id, revision) VALUES ('running-slot-2', 'running-plan', 'Monday', 1, 'running-session-v1', 1)");
      await transaction.execute("INSERT INTO running_session_slot_roots(id, plan_id, weekday, created_at_ms) VALUES ('running-slot-2', 'running-plan', 'Monday', 1000)");
      await transaction.execute("INSERT INTO running_session_slot_revisions(id, slot_root_id, revision, ordinal, session_root_id, session_revision_id, created_at_ms) VALUES ('running-slot-2:revision:1', 'running-slot-2', 1, 1, 'running-session-v1:root', 'running-session-v1', 1000)");
      await transaction.execute("INSERT INTO running_opportunities(id, plan_id, schedule_id, schedule_version_id, slot_id, local_date, timezone, session_revision_id, state, created_at_ms) VALUES ('running-opportunity-2', 'running-plan', 'running-schedule', 'running-version', 'running-slot-2', '2026-10-05', 'Asia/Singapore', 'running-session-v1', 'planned', 3000)");
    });
    const repository = createRunningActivityMatchRepository(kernel);
    const before = await kernel.queryAll<{ events: number; receipts: number; relations: number }>(`SELECT
      (SELECT COUNT(*) FROM running_activity_match_events) AS events,
      (SELECT COUNT(*) FROM running_activity_match_receipts) AS receipts,
      (SELECT COUNT(*) FROM running_activity_current_matches) AS relations`);

    const read = await queryRunningActivityMatchCandidates(repository, "activity-1");

    expect(read.kind).toBe("ready");
    if (read.kind !== "ready") throw new Error("expected_ready_candidates");
    expect(read.candidates.map((candidate) => [candidate.opportunityId, candidate.slotOrdinal]))
      .toEqual([["running-opportunity", 0], ["running-opportunity-2", 1]]);
    await expect(kernel.queryAll(`SELECT
      (SELECT COUNT(*) FROM running_activity_match_events) AS events,
      (SELECT COUNT(*) FROM running_activity_match_receipts) AS receipts,
      (SELECT COUNT(*) FROM running_activity_current_matches) AS relations`)).resolves.toEqual(before);

    const selected = read.candidates[1]!;
    await expect(confirmRunningActivityMatch(repository, {
      requestId: "selected-match",
      requestSha256: "8".repeat(64),
      action: "match",
      activityId: selected.activityId,
      expectedActivityRevision: selected.expectedActivityRevision,
      expectedAcceptedPayloadSha256: selected.expectedAcceptedPayloadSha256,
      opportunityId: selected.opportunityId,
      expectedOpportunityRevision: selected.expectedOpportunityRevision,
      expectedRelationRevision: selected.expectedRelationRevision,
      planId: selected.planId,
      scheduleId: selected.scheduleId,
      scheduleVersionId: selected.scheduleVersionId,
      expectedScheduleRevision: selected.expectedScheduleRevision,
      planDayId: selected.planDayId,
      expectedPlanDayRevision: selected.expectedPlanDayRevision,
      slotId: selected.slotId,
      slotRevisionId: selected.slotRevisionId,
      expectedSlotRevision: selected.expectedSlotRevision,
      sessionRevisionId: selected.sessionRevisionId,
      expectedSessionRevision: selected.expectedSessionRevision,
      occurredAtMs: 4000,
    })).resolves.toMatchObject({
      kind: "matched",
      opportunityId: "running-opportunity-2",
      relationRevision: 1,
    });
    await expect(kernel.queryAll("SELECT activity_id, opportunity_id, relation_revision FROM running_activity_current_matches"))
      .resolves.toEqual([{ activity_id: "activity-1", opportunity_id: "running-opportunity-2", relation_revision: 1 }]);
  });

  it("does not allow an implicit candidate read to create a match", async () => {
    const repository = { confirm: async () => Object.freeze({ kind: "conflict" as const, activityId: "activity-1", opportunityId: "opportunity-1", relationRevision: 0 }) };
    await expect(confirmRunningActivityMatch(repository, matchInput({
      requestId: "candidate-read-is-not-a-command",
      requestSha256: "b".repeat(64),
    }))).resolves.toMatchObject({ kind: "conflict" });
  });

  it("appends one revision-fenced confirmation and replays it without duplicating the current relation", async () => {
    const { kernel } = await runtime(); await seed(kernel); const repository = createRunningActivityMatchRepository(kernel);
    const input = matchInput({ requestId: "match-1", requestSha256: "c".repeat(64) });
    await expect(confirmRunningActivityMatch(repository, input)).resolves.toEqual({ kind: "matched", activityId: "activity-1", opportunityId: "running-opportunity", relationRevision: 1 });
    await expect(confirmRunningActivityMatch(repository, input)).resolves.toEqual({ kind: "replayed", activityId: "activity-1", opportunityId: "running-opportunity", relationRevision: 1 });
    await expect(kernel.queryAll<{ count: number }>("SELECT count(*) AS count FROM running_activity_current_matches")).resolves.toEqual([{ count: 1 }]);
    await expect(kernel.queryAll<{ count: number }>("SELECT count(*) AS count FROM running_activity_match_events")).resolves.toEqual([{ count: 1 }]);
    await expect(confirmRunningActivityMatch(repository, { ...input, requestId: "old-match", requestSha256: "d".repeat(64), expectedRelationRevision: 0 })).resolves.toMatchObject({ kind: "conflict" });
  });

  it("removes a current match atomically and leaves a restored activity unmatched", async () => {
    const { kernel } = await runtime(); await seed(kernel); const matches = createRunningActivityMatchRepository(kernel); const imported = createImportedActivityRepository(kernel);
    const match = matchInput({ requestId: "match-remove", requestSha256: "e".repeat(64) });
    await expect(confirmRunningActivityMatch(matches, match)).resolves.toMatchObject({ kind: "matched" });
    await expect(imported.changeGarminActivityLifecycle({ operation: "remove", requestId: "remove-1", requestSha256: "f".repeat(64), activityId: "activity-1", expectedAggregateRevision: 1, occurredAtMs: 5000, reason: "owner_remove" })).resolves.toMatchObject({ kind: "removed" });
    await expect(kernel.queryAll<{ count: number }>("SELECT count(*) AS count FROM running_activity_current_matches")).resolves.toEqual([{ count: 0 }]);
    await expect(kernel.queryAll<{ action: string }>("SELECT action FROM running_activity_match_events ORDER BY created_at_ms, id")).resolves.toEqual([{ action: "matched" }, { action: "invalidated" }]);
    await expect(imported.changeGarminActivityLifecycle({ operation: "restore", requestId: "restore-1", requestSha256: "1".repeat(64), activityId: "activity-1", expectedAggregateRevision: 1, occurredAtMs: 6000, reason: "owner_restore" })).resolves.toMatchObject({ kind: "replayed" });
    await expect(kernel.queryAll<{ count: number }>("SELECT count(*) AS count FROM running_activity_current_matches")).resolves.toEqual([{ count: 0 }]);
  });

  it("rejects stale identities and fences explicit match, unmatch, and reassign transitions", async () => {
    const { kernel } = await runtime(); await seed(kernel); const repository = createRunningActivityMatchRepository(kernel);
    await kernel.write(async (transaction) => {
      await transaction.execute("INSERT INTO running_session_slots(id, plan_id, weekday, ordinal, session_revision_id, revision) VALUES ('running-slot-2', 'running-plan', 'Monday', 1, 'running-session-v1', 1)");
      await transaction.execute("INSERT INTO running_session_slots(id, plan_id, weekday, ordinal, session_revision_id, revision) VALUES ('running-slot-3', 'running-plan', 'Monday', 2, 'running-session-v1', 1)");
      await transaction.execute("INSERT INTO running_session_slot_roots(id, plan_id, weekday, created_at_ms) VALUES ('running-slot-2', 'running-plan', 'Monday', 3), ('running-slot-3', 'running-plan', 'Monday', 3)");
      await transaction.execute("INSERT INTO running_session_slot_revisions(id, slot_root_id, revision, ordinal, session_root_id, session_revision_id, created_at_ms) VALUES ('running-slot-2:revision:1', 'running-slot-2', 1, 1, 'running-session-v1:root', 'running-session-v1', 3), ('running-slot-3:revision:1', 'running-slot-3', 1, 2, 'running-session-v1:root', 'running-session-v1', 3)");
      await transaction.execute("INSERT INTO running_opportunities(id, plan_id, schedule_id, schedule_version_id, slot_id, local_date, timezone, session_revision_id, state, created_at_ms) VALUES ('running-opportunity-2', 'running-plan', 'running-schedule', 'running-version', 'running-slot-2', '2026-10-05', 'Asia/Singapore', 'running-session-v1', 'planned', 3)");
      await transaction.execute("INSERT INTO running_opportunities(id, plan_id, schedule_id, schedule_version_id, slot_id, local_date, timezone, session_revision_id, state, created_at_ms) VALUES ('running-opportunity-3', 'running-plan', 'running-schedule', 'running-version', 'running-slot-3', '2026-10-05', 'Asia/Singapore', 'running-session-v1', 'planned', 3)");
      await transaction.execute("INSERT INTO imported_activities(id, source, source_activity_id, started_at_ms, aggregate_json, imported_at_ms) VALUES ('activity-2', 'garmin_connect_account:owner', 'external-2', 2, '{}', 2)");
      await transaction.execute("INSERT INTO imported_activity_identities(activity_id, source_kind, account_namespace, external_activity_id, aggregate_revision, accepted_normalized_sha256, removal_state) VALUES ('activity-2', 'garmin_connect_account', 'owner', 'external-2', 1, ?, 'active')", ["b".repeat(64)]);
      await transaction.execute("INSERT INTO imported_activity_events(id, activity_id, aggregate_revision, event_type, payload_json, created_at_ms) VALUES ('activity-2:import', 'activity-2', 1, 'imported', '{}', 2)");
      await transaction.execute("INSERT INTO imported_activity_current_lifecycle(activity_id, aggregate_revision, removal_state, lifecycle_event_id) VALUES ('activity-2', 1, 'active', 'activity-2:import')");
    });
    const first = matchInput({ requestId: "transitions-match" });
    await expect(repository.confirm({ ...first, requestId: "nonzero-without-current", expectedRelationRevision: 1 })).resolves.toMatchObject({ kind: "conflict", relationRevision: 0 });
    await expect(repository.confirm({ ...first, requestId: "bad-activity", expectedActivityRevision: 2 })).resolves.toMatchObject({ kind: "conflict" });
    await expect(repository.confirm({ ...first, requestId: "bad-opportunity", slotId: "wrong-slot" })).resolves.toMatchObject({ kind: "conflict" });
    await expect(repository.confirm(first)).resolves.toMatchObject({ kind: "matched", relationRevision: 1 });
    await expect(repository.confirm({ ...first, requestId: "stale-current", requestSha256: "9".repeat(64), expectedRelationRevision: 0 })).resolves.toMatchObject({ kind: "conflict", relationRevision: 1 });
    await expect(repository.confirm({ ...first, requestSha256: "c".repeat(64) })).resolves.toMatchObject({ kind: "conflict" });
    await expect(repository.confirm({ ...first, requestId: "duplicate-match", requestSha256: "d".repeat(64), expectedRelationRevision: 1 })).resolves.toMatchObject({ kind: "conflict" });
    await expect(repository.confirm({ ...first, requestId: "wrong-unmatch", requestSha256: "e".repeat(64), action: "unmatch", expectedRelationRevision: 1, expectedCurrentOpportunityId: "running-opportunity-2" })).resolves.toMatchObject({ kind: "conflict" });
    await expect(repository.confirm({ ...first, requestId: "unmatch", requestSha256: "f".repeat(64), action: "unmatch", expectedRelationRevision: 1, expectedCurrentOpportunityId: "running-opportunity" })).resolves.toMatchObject({ kind: "unmatched", relationRevision: 2 });
    await expect(repository.confirm({ ...first, requestId: "match-again", requestSha256: "1".repeat(64), expectedRelationRevision: 2 })).resolves.toMatchObject({ kind: "matched", relationRevision: 3 });
    await expect(repository.confirm({ ...first, requestId: "reassign", requestSha256: "2".repeat(64), action: "reassign", opportunityId: "running-opportunity-2", slotId: "running-slot-2", slotRevisionId: "running-slot-2:revision:1", expectedRelationRevision: 3, expectedCurrentOpportunityId: "running-opportunity" })).resolves.toMatchObject({ kind: "reassigned", opportunityId: "running-opportunity-2", relationRevision: 4 });
    await expect(repository.confirm({ ...first, requestId: "other-activity", requestSha256: "3".repeat(64), activityId: "activity-2", expectedAcceptedPayloadSha256: "b".repeat(64), opportunityId: "running-opportunity-3", slotId: "running-slot-3", slotRevisionId: "running-slot-3:revision:1", expectedRelationRevision: 0 })).resolves.toMatchObject({ kind: "matched" });
    await expect(repository.confirm({ ...first, requestId: "occupied-reassign", requestSha256: "4".repeat(64), action: "reassign", opportunityId: "running-opportunity-3", slotId: "running-slot-3", slotRevisionId: "running-slot-3:revision:1", expectedRelationRevision: 4, expectedCurrentOpportunityId: "running-opportunity-2" })).resolves.toMatchObject({ kind: "conflict" });
  });

  it("fails closed if a corrupted current-match ledger violates the schema's one-to-one invariant", async () => {
    const { kernel, writer } = await runtime(); await seed(kernel); const repository = createRunningActivityMatchRepository(kernel);
    writer.db.exec("ALTER TABLE running_activity_current_matches RENAME TO running_activity_current_matches_valid");
    writer.db.exec("CREATE TABLE running_activity_current_matches (opportunity_id TEXT NOT NULL, activity_id TEXT NOT NULL, relation_revision INTEGER NOT NULL, event_id TEXT NOT NULL)");
    writer.db.exec("INSERT INTO running_activity_current_matches VALUES ('corrupt-opportunity-a', 'corrupt-activity', 1, 'corrupt-a'), ('corrupt-opportunity-b', 'corrupt-activity', 2, 'corrupt-b')");
    const input = matchInput({ requestId: "corrupt-ledger" });
    await expect(repository.confirm(input)).rejects.toThrow("sqlite_transaction_failed");
  });
});
