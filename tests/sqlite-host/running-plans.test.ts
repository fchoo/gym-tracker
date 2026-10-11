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
import { createRunningPlanRuntimePort } from "../../src/bootstrap/runningPlanRuntime";
import { PHASE17_FAMILY_B_CASE_IDS, createPhase17FamilyBFixtureDriver, phase17FamilyBSelectorSchema } from "../../src/bootstrap/phase17FamilyBFixture";
import { createHash } from "node:crypto";

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
    const backup = await createLogicalBackupRepository(kernel).collect({ snapshotId: "running-lifecycle", createdAtMs: 300 });
    expect(backup.tables.running_session_slots).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "recovery-slot", retired_at_ms: null }),
      expect.objectContaining({ id: "tempo-slot", retired_at_ms: 200 }),
    ]));
    expect(backup.tables.running_session_slot_roots).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "recovery-slot" }),
      expect.objectContaining({ id: "tempo-slot" }),
    ]));
  });

  it("seeds true preconditions for every non-collision Phase 17 Running fixture and rejects skipped actions", async () => {
    const kernel = await migratedKernel();
    let nonce = 0;
    const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
    const running = createRunningPlanRuntimePort(kernel, {
      nowMs: () => 1_000 + nonce,
      randomUUID: () => `fixture-${++nonce}`,
      sha256,
    });
    const driver = createPhase17FamilyBFixtureDriver({ kernel, running, sha256 });
    for (const caseId of PHASE17_FAMILY_B_CASE_IDS) {
      const token = `phase17:fixture-token-${String(++nonce).padStart(16, "0")}`;
      const sourceTable = caseId === "library.running-create-zero-sessions" ? "running_plan_aggregates"
        : caseId === "library.running-goal-edit" ? "running_plan_revisions"
          : caseId === "library.running-session-lifecycle" || caseId === "library.running-two-same-day-slots" ? "running_session_slots"
            : "running_session_revisions";
      let seed;
      try { seed = await driver.seed(caseId, token, sourceTable); }
      catch (error) { throw new Error(`${caseId}: ${(error as Error).message}`); }
      const schema = phase17FamilyBSelectorSchema(caseId);
      expect(Object.keys(seed.selectors).sort()).toEqual([...schema.selectors].sort());
      expect(Object.keys(seed.actionInputs ?? {}).sort()).toEqual([...schema.actionInputs].sort());
      const planId = seed.selectors.runningPlanId ?? seed.actionInputs?.runningPlanId;
      if (planId === undefined) throw new Error(`${caseId}: fixture returned no running plan ID`);
      expect(planId).toContain("phase17:running-plan:");
      if (caseId === "library.running-create-zero-sessions") {
        await expect(kernel.queryAll<{ plan_id: string }>("SELECT plan_id FROM running_plans WHERE plan_id = ?", [planId])).resolves.toEqual([]);
      } else {
        const [row] = await kernel.queryAll<{ revision: number }>("SELECT revision FROM running_plans WHERE plan_id = ?", [planId]);
        expect(row).toBeDefined();
        expect(seed.selectors.runningPlanRevision).toBe(String(row!.revision));
        const aggregate = await running.loadPlan(planId);
        if (aggregate === null) throw new Error(`${caseId}: fixture aggregate missing`);
        expect(seed.selectors.runningPlanId).toBe(aggregate.id);
        const requestId = seed.selectors.runningRequestId;
        expect(requestId).toBeDefined();
        await expect(kernel.queryAll<{ request_id: string }>("SELECT request_id FROM running_plan_receipts WHERE plan_id = ? AND request_id = ?", [planId, requestId!])).resolves.toEqual([{ request_id: requestId! }]);
        for (const selector of ["runningSessionRootId", "runningSessionRevisionId", "runningSlotRootId", "runningSlotRevisionId"] as const) {
          const value = seed.selectors[selector];
          if (value !== undefined) expect(JSON.stringify(aggregate.sessions)).toContain(value);
        }
      }
      if (caseId === "library.running-detail") {
        expect(seed.actionReceiptId).toBeNull();
        await expect(driver.probe(caseId, token, sourceTable, seed.selectors)).resolves.toEqual(expect.objectContaining({ rowCount: 1, facts: seed.expectedPostState }));
      } else {
        expect(seed.actionReceiptId).toMatch(/^phase17:library\.running-/u);
        expect(seed.expectedPreState).not.toEqual(seed.expectedPostState);
        await expect(driver.probe(caseId, token, sourceTable, seed.selectors)).rejects.toThrow(
          caseId === "library.running-create-zero-sessions" ? /probe_missing/u : /action_receipt_missing/u,
        );
      }
      await driver.cleanup(caseId, token, seed.selectors);
      await expect(kernel.queryAll<{ id: string }>("SELECT id FROM plans WHERE id = ?", [planId])).resolves.toEqual([]);
      await expect(kernel.queryAll<{ request_id: string }>("SELECT request_id FROM running_plan_receipts WHERE plan_id = ?", [planId])).resolves.toEqual([]);
    }
  });

  it("permits cleanup only for exact Phase 17 fixture-owned plan namespaces", async () => {
    const kernel = await migratedKernel();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        "INSERT INTO plans (id, origin, name, days_per_week, revision) VALUES ('ordinary-custom', 'custom', 'Ordinary custom', 1, 1)",
      );
      await transaction.execute(
        "INSERT INTO plans (id, origin, source_namespace, upstream_id, name, days_per_week, revision) VALUES ('ordinary-copied', 'copied', 'fixture-source', 'fixture-upstream', 'Ordinary copied', 1, 1)",
      );
      await transaction.execute(
        "INSERT INTO plans (id, origin, name, days_per_week, revision) VALUES ('phase17:owned-plan:fixture-token-0000000000000042', 'custom', 'Fixture owned', 1, 1)",
      );
    });
    await expect(kernel.write((transaction) => transaction.execute("DELETE FROM plans WHERE id = ?", ["ordinary-custom"]))).rejects.toThrow("sqlite_transaction_failed");
    await expect(kernel.write((transaction) => transaction.execute("DELETE FROM plans WHERE id = ?", ["ordinary-copied"]))).rejects.toThrow("sqlite_transaction_failed");
    await expect(kernel.write((transaction) => transaction.execute("DELETE FROM plans WHERE id = ?", ["phase17:owned-plan:fixture-token-0000000000000042"]))).resolves.toMatchObject({ changes: 1 });
  });

  it("accepts a real production Running save only when its deterministic fixture receipt and source facts match", async () => {
    const kernel = await migratedKernel();
    const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
    const running = createRunningPlanRuntimePort(kernel, { nowMs: () => 4_000, randomUUID: () => "fixture-action", sha256 });
    const driver = createPhase17FamilyBFixtureDriver({ kernel, running, sha256 });
    const token = "phase17:fixture-token-0000000000000042";
    const seed = await driver.seed("library.running-recovery", token, "running_session_revisions");
    const planId = seed.selectors.runningPlanId!;
    const actionReceiptId = seed.actionReceiptId!;
    const before = await running.loadPlan(planId);
    if (before === null) throw new Error("fixture plan missing");
    await running.saveSession({
      planId, expectedPlanRevision: before.revision, requestId: actionReceiptId,
      session: { sessionKind: "recovery", weekday: "Monday", phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "duration", durationMs: 1_800_000 }] }], advisoryTarget: { rpe: 4 }, contextual: {} },
    });
    await expect(driver.probe("library.running-recovery", token, "running_session_revisions", seed.selectors)).resolves.toEqual(expect.objectContaining({ facts: seed.expectedPostState }));
    await driver.cleanup("library.running-recovery", token, seed.selectors);
  });

  it("keeps real activation, archive, reactivate, and receipt retry facts scoped to a Running fixture plan", async () => {
    const kernel = await migratedKernel();
    await kernel.write(async (transaction) => {
      await transaction.execute("UPDATE workout_sessions SET status = 'completed' WHERE status = 'in_progress'");
    });
    let nonce = 0;
    const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
    const runtime = createRunningPlanRuntimePort(kernel, {
      nowMs: () => 2_000 + nonce,
      randomUUID: () => `lifecycle-${++nonce}`,
      sha256,
    });
    const created = await runtime.createInactivePlan({ plan: {
      version: 1, id: "phase17:lifecycle-plan", name: "Fixture", revision: 1, createdAtMs: 2_000,
      goal: { version: 1, id: "phase17:lifecycle-goal", planId: "phase17:lifecycle-plan", revision: 1, goalDistanceMeters: 5_000, trainingDays: ["Monday"], createdAtMs: 2_000 },
      sessions: [session("phase17:lifecycle-plan", "recovery", 0)],
    } });
    expect(created.lifecycle).toBe("inactive");
    for (const [action, lifecycle] of [["activate", "active"], ["archive", "archived"], ["reactivate", "inactive"]] as const) {
      const preview = await runtime.previewLifecycle(created.id, action);
      const requestId = `phase17:lifecycle-${action}`;
      const result = await runtime.confirmLifecycle({ action, preview, requestId });
      await expect(runtime.confirmLifecycle({ action, preview: { ...preview, confirmationToken: "stale-retry-is-ignored" }, requestId })).resolves.toEqual(result);
      expect(result.lifecycle).toBe(lifecycle);
    }
    await expect(kernel.queryAll<{ request_id: string }>("SELECT request_id FROM running_plan_receipts WHERE plan_id = ? AND operation IN ('activate', 'archive', 'reactivate') ORDER BY request_id", [created.id])).resolves.toHaveLength(3);
  });
});
