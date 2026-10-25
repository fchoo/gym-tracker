import { afterEach, describe, expect, it } from "@jest/globals";
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
import { createRunningPlanRepository } from "../../src/platform/sqlite/repositories/runningPlanRepository";
import { createScheduleRepository } from "../../src/platform/sqlite/repositories/scheduleRepository";
import { createStarterPlanRepository } from "../../src/platform/sqlite/repositories/starterPlanRepository";
import { readLibraryRuntimeSnapshot } from "../../src/bootstrap/libraryRuntimeReadPort";
import { libraryPlanDeletionKey } from "../../src/domains/library/planDeletion";

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
  const directory = mkdtempSync(join(tmpdir(), "gym-library-deletion-"));
  directories.push(directory);
  const writer = new Connection(new DatabaseSync(join(directory, "gym.db")));
  const reader = new Connection(new DatabaseSync(join(directory, "gym.db")));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  kernels.push(kernel);
  await createMigrationRunner({ databaseName: "gym.db", kernel, migrations,
    recoveryBackup: { createAndValidate: async () => ({ backupId: "test", databaseName: "gym.db", fromVersion: 0, toVersion: 0, validated: true }) } }).run();
  await createOwnedPlanRepository(kernel).createDraft({
    requestId: "create-plan", requestSha256: "a".repeat(64), planId: "plan", dayId: "day",
    name: "Unused Plan", dayName: "Day A", createdAtMs: 1,
  });
  return kernel;
}

async function workout(kernel: SqliteKernel, input: { planId?: string; dayId?: string; status?: string } = {}) {
  await kernel.write((transaction) => transaction.execute(`INSERT INTO workout_sessions
    (id, plan_id, plan_day_id, source, status, local_date, timezone, started_at_ms, completed_at_ms, revision)
    VALUES ('session', ?, ?, 'manual', ?, '2026-10-25', 'Asia/Singapore', 1, NULL, 1)`,
    [input.planId ?? null, input.dayId ?? null, input.status ?? "in_progress"]));
}

async function running(kernel: SqliteKernel) {
  await kernel.write(async (transaction) => {
    await transaction.execute(`INSERT INTO plans (id, origin, name, days_per_week, audience, goal,
      estimate_minutes, attribution, is_active, revision, plan_kind)
      VALUES ('run', 'custom', 'Unused Run', 1, 'Owner', 'Running', 1, 'Owner', 0, 1, 'running')`);
    await transaction.execute("INSERT INTO running_plans VALUES ('run', 'ready', 1, 1)");
    await transaction.execute(`INSERT INTO owned_plan_schedules
      (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind)
      VALUES ('schedule', 'run', 'inactive', 1, 1, 1, 'running')`);
    await transaction.execute(`INSERT INTO owned_plan_schedule_versions
      (id, schedule_id, version_number, mode, timezone, effective_local_date, rotation_pointer, created_at_ms)
      VALUES ('version', 'schedule', 1, 'weekday', 'Asia/Singapore', '2026-10-25', NULL, 1)`);
    await transaction.execute("INSERT INTO running_session_revisions VALUES ('revision', 'run', 'recovery', 1, '{}', 1)");
    await transaction.execute("INSERT INTO running_session_slots (id, plan_id, weekday, ordinal, session_revision_id, revision) VALUES ('slot', 'run', 'Monday', 0, 'revision', 1)");
    await transaction.execute(`INSERT INTO running_opportunities
      VALUES ('opportunity', 'run', 'schedule', 'version', 'slot', '2026-10-25', 'Asia/Singapore', 'revision', 'planned', 1)`);
    await transaction.execute("INSERT INTO imported_activities (id, source, source_activity_id, started_at_ms, aggregate_json, imported_at_ms) VALUES ('activity', 'garmin', 'activity-1', 1, '{}', 1)");
  });
}

describe("Library plan deletion with authoritative SQLite facts", () => {
  it("deletes an unused draft from Library while retaining its graph and immutable creation receipt", async () => {
    const kernel = await open();
    const deletion = createLibraryPlanDeletionPort(kernel, { nowMs: () => 10 });
    expect(await deletion.readEligibility("plan")).toMatchObject({ eligible: true });
    const before = await kernel.queryAll("SELECT * FROM owned_plan_mutation_requests");
    expect(await deletion.deletePlan({ planId: "plan" })).toEqual({ outcome: "deleted", planId: "plan" });
    expect(await kernel.queryAll("SELECT * FROM owned_plan_mutation_requests")).toEqual(before);
    expect(await kernel.queryAll("SELECT id FROM plan_days WHERE plan_id = 'plan'")).toHaveLength(1);
    expect(await createOwnedPlanRepository(kernel).read("plan")).toBeNull();
    expect((await readLibraryRuntimeSnapshot({ kernel, nowMs: () => 10, templates: [], starterPlans: [] })).plans.owned).toEqual([]);
    expect(await deletion.deletePlan({ planId: "plan" })).toMatchObject({ outcome: "ineligible", reason: "already_deleted" });
  });

  it("retires an unused active plan and schedule atomically, and rejects stale restoration and activation", async () => {
    const kernel = await open();
    await kernel.write(async (transaction) => {
      await transaction.execute("UPDATE plans SET is_active = 1 WHERE id = 'plan'");
      await transaction.execute(`INSERT INTO owned_plan_schedules
        (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms)
        VALUES ('schedule', 'plan', 'active', 1, 1, NULL)`);
    });
    expect(await createLibraryPlanDeletionPort(kernel, { nowMs: () => 10 }).deletePlan({ planId: "plan" }))
      .toMatchObject({ outcome: "deleted" });
    expect(await kernel.queryAll("SELECT is_active FROM plans WHERE id = 'plan'")).toEqual([{ is_active: 0 }]);
    expect(await kernel.queryAll("SELECT lifecycle FROM owned_plan_schedules")).toEqual([{ lifecycle: "inactive" }]);
    await expect(createOwnedPlanRepository(kernel).restore({ planId: "plan", expectedRevision: 2,
      requestId: "restore", requestSha256: "b".repeat(64), archived: false, updatedAtMs: 20 })).rejects.toThrow();
    await expect(createScheduleRepository(kernel).activateSchedule({ planId: "plan" } as never)).rejects.toThrow();
    await expect(createStarterPlanRepository(kernel).activateAcceptedStarterPlan({
      copyChoice: { type: "reactivate_existing", planId: "plan" },
    } as never)).rejects.toThrow();
    expect(await kernel.queryAll("SELECT is_active FROM plans WHERE id = 'plan'")).toEqual([{ is_active: 0 }]);
  });

  it.each(["in_progress", "completed", "partial", "discarded"])("preserves plans linked to %s workouts", async (status) => {
    const kernel = await open();
    await workout(kernel, { planId: "plan", status });
    const deletion = createLibraryPlanDeletionPort(kernel, { nowMs: () => 10 });
    expect(await deletion.deletePlan({ planId: "plan" })).toMatchObject({ outcome: "ineligible", reason: "workout_linked" });
    expect(await kernel.queryAll("SELECT key FROM app_settings WHERE key = ?", [libraryPlanDeletionKey("plan")])).toEqual([]);
  });

  it("rechecks linkage after the browse preview, including a historical day-only link", async () => {
    const kernel = await open();
    const deletion = createLibraryPlanDeletionPort(kernel, { nowMs: () => 10 });
    expect(await deletion.readEligibility("plan")).toMatchObject({ eligible: true });
    await workout(kernel, { dayId: "day", status: "completed" });
    expect(await deletion.deletePlan({ planId: "plan" })).toMatchObject({ outcome: "ineligible", reason: "workout_linked" });
  });

  it("preserves a removed workout's retained source snapshot even when current direct links are absent", async () => {
    const kernel = await open();
    await workout(kernel, { status: "completed" });
    await kernel.write((transaction) => transaction.execute(`INSERT INTO history_session_overlays
      VALUES ('session', 1, 'voided', '{"planId":"plan"}', '2026-10-25', 'Asia/Singapore', 1, NULL, 1, 1)`));
    expect(await createLibraryPlanDeletionPort(kernel, { nowMs: () => 10 }).deletePlan({ planId: "plan" }))
      .toMatchObject({ outcome: "ineligible", reason: "workout_linked" });
  });

  it.each(["legacy", "current", "prior", "receipt"])("preserves running plans with %s activity-match evidence", async (kind) => {
    const kernel = await open();
    await running(kernel);
    await kernel.write(async (transaction) => {
      if (kind === "legacy") await transaction.execute("INSERT INTO running_match_events VALUES ('match', 'activity', 'opportunity', 'unmatched', 1)");
      if (kind === "prior") {
        await transaction.execute(`INSERT INTO plans (id, origin, name, days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision, plan_kind)
          VALUES ('other-run', 'custom', 'Other Run', 1, 'Owner', 'Running', 1, 'Owner', 0, 1, 'running')`);
        await transaction.execute("INSERT INTO running_plans VALUES ('other-run', 'ready', 1, 1)");
        await transaction.execute(`INSERT INTO owned_plan_schedules (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind)
          VALUES ('other-schedule', 'other-run', 'inactive', 1, 1, 1, 'running')`);
        await transaction.execute(`INSERT INTO owned_plan_schedule_versions
          (id, schedule_id, version_number, mode, timezone, effective_local_date, rotation_pointer, created_at_ms)
          VALUES ('other-version', 'other-schedule', 1, 'weekday', 'Asia/Singapore', '2026-10-25', NULL, 1)`);
        await transaction.execute("INSERT INTO running_session_revisions VALUES ('other-revision', 'other-run', 'recovery', 1, '{}', 1)");
        await transaction.execute(`INSERT INTO running_session_slots (id, plan_id, weekday, ordinal, session_revision_id, revision)
          VALUES ('other-slot', 'other-run', 'Monday', 0, 'other-revision', 1)`);
        await transaction.execute(`INSERT INTO running_opportunities
          VALUES ('other-opportunity', 'other-run', 'other-schedule', 'other-version', 'other-slot', '2026-10-25', 'Asia/Singapore', 'other-revision', 'planned', 1)`);
      }
      if (kind === "current" || kind === "prior") await transaction.execute(`INSERT INTO running_activity_match_events
        VALUES ('match', 'activity', ?, ?, 'unmatched', 1, 1, 0, 1, ?, 1)`,
        [kind === "prior" ? "other-opportunity" : "opportunity", kind === "prior" ? "opportunity" : null, "a".repeat(64)]);
      if (kind === "receipt") await transaction.execute(`INSERT INTO running_activity_match_receipts
        VALUES ('match', ?, 'activity', 'opportunity', 1, 'unmatched', 1)`, ["a".repeat(64)]);
    });
    expect(await createLibraryPlanDeletionPort(kernel, { nowMs: () => 10 }).deletePlan({ planId: "run" }))
      .toMatchObject({ outcome: "ineligible", reason: "workout_linked" });
  });

  it("rejects stale Running lifecycle activation after deletion", async () => {
    const kernel = await open();
    await running(kernel);
    expect(await createLibraryPlanDeletionPort(kernel, { nowMs: () => 10 }).deletePlan({ planId: "run" }))
      .toMatchObject({ outcome: "deleted" });
    expect(await createRunningPlanRepository(kernel).readAggregate("run")).toBeNull();
    await expect(createRunningPlanRepository(kernel).confirmLifecycle({ preview: { planId: "run" } } as never)).rejects.toThrow();
    await expect(createScheduleRepository(kernel).activateRunningSchedule!({ planId: "run" } as never)).rejects.toThrow();
  });

  it.each(["occurrence", "target"])("preserves a plan referenced only through retained %s source facts", async (kind) => {
    const kernel = await open();
    await workout(kernel, { status: "completed" });
    await kernel.write(async (transaction) => {
      await transaction.execute(`INSERT INTO exercises
        (id, origin, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision)
        VALUES ('exercise', 'custom', 'Row', 'load_reps', 1, 1, 'Cable', 90, 1)`);
      await transaction.execute(`INSERT INTO exercise_library_entries
        (exercise_id, origin, canonical_name, exercise_type, movement_class, metric_profile, metric_contract_version, exercise_metric_generation, availability, revision)
        VALUES ('exercise', 'custom', 'Row', 'strength', 'compound', 'load_reps', 1, 1, 'available', 1)`);
      await transaction.execute(`INSERT INTO plan_day_exercises
        (id, plan_day_id, exercise_id, ordinal, metric_profile, metric_contract_version, exercise_metric_generation, revision)
        VALUES ('legacy-occurrence', 'day', 'exercise', 0, 'load_reps', 1, 1, 1)`);
      await transaction.execute(`INSERT INTO session_exercises
        (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal, exercise_name, metric_profile,
         metric_contract_version, exercise_metric_generation, default_rest_seconds, target_revision, status, revision)
        VALUES ('session-exercise', 'session', ?, 'exercise', 0, 'Row', 'load_reps', 1, 1, 90, 1, 'skipped', 1)`,
        [kind === "occurrence" ? "legacy-occurrence" : null]);
      if (kind === "target") {
        await transaction.execute(`INSERT INTO owned_plan_day_exercises
          (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds, metric_profile,
           metric_contract_version, exercise_metric_generation, revision)
          VALUES ('owned-occurrence', 'day', 'exercise', 0, 90, 'load_reps', 1, 1, 1)`);
        await transaction.execute(`INSERT INTO owned_plan_working_set_targets
          (id, plan_day_exercise_id, ordinal, target_json, unit_json, metric_profile, metric_contract_version, exercise_metric_generation, revision)
          VALUES ('target', 'owned-occurrence', 0, '{}', '{}', 'load_reps', 1, 1, 1)`);
        await transaction.execute(`INSERT INTO session_sets
          (id, session_exercise_id, set_kind, ordinal, source_owned_plan_working_set_target_id,
           target_load_grams, target_min_reps, target_max_reps, rule_type, rule_version, metric_profile,
           metric_contract_version, exercise_metric_generation, status, revision)
          VALUES ('set', 'session-exercise', 'working', 0, 'target', 0, 1, 1, 'load_reps', 1, 'load_reps', 1, 1, 'skipped', 1)`);
      }
    });
    expect(await createLibraryPlanDeletionPort(kernel, { nowMs: () => 10 }).deletePlan({ planId: "plan" }))
      .toMatchObject({ outcome: "ineligible", reason: "workout_linked" });
  });

  it("rolls back plan retirement if the deletion marker cannot commit", async () => {
    const kernel = await open();
    const before = await kernel.queryAll("SELECT * FROM plans WHERE id = 'plan'");
    const stateBefore = await kernel.queryAll("SELECT * FROM owned_plan_aggregate_states WHERE plan_id = 'plan'");
    const failingKernel: SqliteKernel = { ...kernel,
      write: (command) => kernel.write((transaction) => command({ ...transaction,
        execute: (sql, parameters) => {
          if (sql.includes("INSERT INTO app_settings")) throw new Error("test_marker_failed");
          return transaction.execute(sql, parameters);
        },
      })),
    };
    await expect(createLibraryPlanDeletionPort(failingKernel, { nowMs: () => 10 }).deletePlan({ planId: "plan" }))
      .rejects.toThrow();
    expect(await kernel.queryAll("SELECT * FROM plans WHERE id = 'plan'")).toEqual(before);
    expect(await kernel.queryAll("SELECT * FROM owned_plan_aggregate_states WHERE plan_id = 'plan'")).toEqual(stateBefore);
    expect(await kernel.queryAll("SELECT key FROM app_settings WHERE key = ?", [libraryPlanDeletionKey("plan")])).toEqual([]);
  });

  it("rejects an old initial activation receipt replay after its unused plan was deleted", async () => {
    const kernel = await open();
    await kernel.write(async (transaction) => {
      await transaction.execute(`INSERT INTO owned_plan_schedules
        (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms)
        VALUES ('schedule', 'plan', 'inactive', 1, 1, 1)`);
      await transaction.execute(`INSERT INTO starter_plan_sources
        VALUES ('test', 'template', 1, ?, 'Unused Plan', '{}', 1)`, ["a".repeat(64)]);
      await transaction.execute(`INSERT INTO starter_plan_activation_requests
        VALUES ('activation', ?, 'test', 'template', 1, NULL, 'initial', NULL, 'plan', 'schedule', ?, 1)`,
        ["a".repeat(64), JSON.stringify({ outcome: "committed", plan: { id: "plan", isActive: true }, schedule: { lifecycle: "active" } })]);
    });
    expect(await createLibraryPlanDeletionPort(kernel, { nowMs: () => 10 }).deletePlan({ planId: "plan" }))
      .toMatchObject({ outcome: "deleted" });
    await expect(createStarterPlanRepository(kernel).activateAcceptedStarterPlan({
      requestId: "activation", requestSha256: "a".repeat(64),
    } as never)).rejects.toMatchObject({ cause: expect.objectContaining({ message: "library_plan_deleted" }) });
    expect(await kernel.queryAll("SELECT is_active FROM plans WHERE id = 'plan'")).toEqual([{ is_active: 0 }]);
  });
});
