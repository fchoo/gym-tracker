// The integration tracer owns the real SQLite setup and schema migration path.
// Re-export its suite here under the stable Phase 13 Running foundation name.
import "./multi-plan-foundation-tracer.test";

import { afterEach, describe, expect, it } from "@jest/globals";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { canonicalRunningRequestHash, saveRunningTarget, type SaveRunningTargetInput } from "../../src/domains/running/commands";
import { runningTargetForDistance } from "../../src/domains/running/contracts";
import { createRunningPlanRuntimePort } from "../../src/bootstrap/runningPlanRuntime";
import { runtimeSha256 } from "../../src/platform/crypto/runtimeSha256";
import { type SqliteConnection, type SqlitePreparedResult, type SqlitePreparedStatement, configureSqliteConnection } from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createRunningPlanRepository } from "../../src/platform/sqlite/repositories/runningPlanRepository";
import { createProgressRepository } from "../../src/platform/sqlite/repositories/progressRepository";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";
import { createCollisionDecisionCommand } from "../../src/domains/scheduling/scheduleCommands";
import {
  appendScheduleCollisionDecision,
  transitionSelectedSchedule,
} from "../../src/domains/scheduling/scheduleState";
import { parseLocalDate } from "../../src/domains/scheduling/localDate";
import { parseStoredTimeZone } from "../../src/domains/scheduling/timeZone";

class TargetResult<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(readonly changes: number, readonly lastInsertRowId: number, private readonly rows: readonly Row[]) {}
  async getAllAsync(): Promise<readonly Row[]> { return this.rows; }
}
class TargetStatement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}
  async executeAsync<Row extends Record<string, unknown>>(parameters: readonly SQLInputValue[] = []): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) return new TargetResult(0, 0, this.statement.all(...parameters) as Row[]);
    const result = this.statement.run(...parameters);
    return new TargetResult(Number(result.changes), Number(result.lastInsertRowid), []);
  }
  async finalizeAsync(): Promise<void> {}
}
class TargetConnection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}
  async execAsync(sql: string): Promise<void> { this.database.exec(sql); }
  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> { return new TargetStatement(this.database.prepare(sql)); }
  async isInTransactionAsync(): Promise<boolean> { return this.database.isTransaction; }
  async closeAsync(): Promise<void> { this.database.close(); }
}
const targetDirectories = new Set<string>();
const targetKernels: SqliteKernel[] = [];
afterEach(async () => {
  await Promise.all(targetKernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of targetDirectories) rmSync(directory, { force: true, recursive: true });
  targetDirectories.clear();
});
async function targetKernel(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-running-target-"));
  targetDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixture = new DatabaseSync(databasePath);
  fixture.exec(readFileSync(join(__dirname, "../migrations/fixtures/v6-metric-profiles.sql"), "utf8"));
  fixture.close();
  const writer = new TargetConnection(new DatabaseSync(databasePath));
  const reader = new TargetConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ writer, reader });
  targetKernels.push(kernel);
  await createMigrationRunner({ databaseName: databasePath, kernel, migrations, recoveryBackup: { async createAndValidate(request) { return { backupId: "running-target", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true as const }; } } }).run();
  return kernel;
}

describe("Running target source receipts", () => {
  it("persists one target source revision, replays the same receipt, and rejects changed or stale input", async () => {
    const kernel = await targetKernel();
    const repository = createRunningPlanRepository(kernel);
    const source = {
      version: 1 as const, id: "target-running", name: "Target Running", revision: 1, active: false as const, lifecycle: "inactive" as const, createdAtMs: 1,
      goal: { version: 1 as const, id: "target-goal-1", planId: "target-running", revision: 1, goalDistanceMeters: 2400, trainingDays: ["Monday" as const], createdAtMs: 1 }, sessions: [],
    };
    await repository.createInactiveAggregate({ requestId: "target-create", requestSha256: "a".repeat(64), plan: source });
    const base = {
      requestId: "target-save", planId: source.id, expectedPlanRevision: 1, expectedGoalRevision: 1, savedAtMs: 2,
      goal: { ...source.goal, id: "target-goal-2", revision: 2, targetDurationMs: 660_000, trainingDays: ["Monday" as const, "Thursday" as const], createdAtMs: 2 },
    };
    const input: SaveRunningTargetInput = { ...base, requestSha256: canonicalRunningRequestHash(base) };
    await expect(saveRunningTarget(repository, input)).resolves.toMatchObject({ outcome: "committed", targetRevision: 2 });
    await expect(saveRunningTarget(repository, input)).resolves.toMatchObject({ outcome: "already_committed", targetRevision: 2 });
    await expect(saveRunningTarget(repository, { ...input, requestSha256: canonicalRunningRequestHash({ ...base, goal: { ...base.goal, targetDurationMs: 645_000 } }) })).rejects.toThrow("sqlite_transaction_failed");
    await expect(saveRunningTarget(repository, { ...input, requestId: "target-stale", requestSha256: "b".repeat(64) })).rejects.toThrow("sqlite_transaction_failed");
    await expect(repository.readAggregate(source.id)).resolves.toMatchObject({ revision: 2, goal: { revision: 2, targetDurationMs: 660_000, trainingDays: ["Monday", "Thursday"] } });
    await expect(kernel.queryAll<{ count: number }>("SELECT COUNT(*) AS count FROM running_goals WHERE plan_id = ?", [source.id])).resolves.toEqual([{ count: 2 }]);
  });

  it("preserves current targets for 2.4 km, 10 km, and Half Marathon across runtime recreation", async () => {
    const kernel = await targetKernel();
    const repository = createRunningPlanRepository(kernel);
    const source = {
      version: 1 as const, id: "distance-target-running", name: "Distance targets", revision: 1,
      active: false as const, lifecycle: "inactive" as const, createdAtMs: 1,
      goal: {
        version: 1 as const, id: "distance-target-goal-1", planId: "distance-target-running",
        revision: 1, goalDistanceMeters: 2_400, trainingDays: ["Monday" as const], createdAtMs: 1,
      },
      sessions: [],
    };
    await repository.createInactiveAggregate({
      requestId: "distance-target-create",
      requestSha256: "c".repeat(64),
      plan: source,
    });

    let nowMs = 2;
    let identity = 0;
    const recreateRuntime = () => createRunningPlanRuntimePort(kernel, {
      nowMs: () => nowMs++,
      randomUUID: () => `distance-${++identity}`,
      sha256: runtimeSha256,
    });
    const save = async (distanceMeters: number, targetDurationMs: number, requestId: string) => {
      const runtime = recreateRuntime();
      const before = await runtime.loadPlan(source.id);
      expect(before).not.toBeNull();
      await runtime.saveRunningTarget({
        planId: source.id,
        requestId,
        expectedSourceRevision: before!.revision,
        goalDistanceMeters: distanceMeters,
        targetDurationMs,
        trainingDays: ["Monday", "Thursday"],
      });
      return recreateRuntime().loadPlan(source.id);
    };

    const afterTwoPointFour = await save(2_400, 650_000, "save-2400");
    expect(runningTargetForDistance(afterTwoPointFour!, 2_400)).toMatchObject({
      revision: 2,
      targetDurationMs: 650_000,
    });

    const afterTenKilometres = await save(10_000, 3_000_000, "save-10000");
    expect(runningTargetForDistance(afterTenKilometres!, 2_400)).toMatchObject({
      revision: 2,
      targetDurationMs: 650_000,
    });
    expect(runningTargetForDistance(afterTenKilometres!, 10_000)).toMatchObject({
      revision: 1,
      targetDurationMs: 3_000_000,
    });

    const afterHalfMarathon = await save(21_097, 7_200_000, "save-half-marathon");
    expect(runningTargetForDistance(afterHalfMarathon!, 2_400)).toMatchObject({
      revision: 2,
      targetDurationMs: 650_000,
    });
    expect(runningTargetForDistance(afterHalfMarathon!, 10_000)).toMatchObject({
      revision: 1,
      targetDurationMs: 3_000_000,
    });
    expect(runningTargetForDistance(afterHalfMarathon!, 21_097)).toMatchObject({
      revision: 1,
      targetDurationMs: 7_200_000,
    });
    await expect(kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM running_goals WHERE plan_id = ?",
      [source.id],
    )).resolves.toEqual([{ count: 4 }]);

    await kernel.write(async (transaction) => {
      await transaction.execute("UPDATE plans SET is_active = 1 WHERE id = ?", [source.id]);
      await transaction.execute(
        "UPDATE owned_plan_schedules SET lifecycle = 'active', deactivated_at_ms = NULL WHERE plan_id = ?",
        [source.id],
      );
    });
    const projected = await createProgressRepository(kernel).load({
      sport: "Running",
      period: "all_time",
      nowLocalDate: "2026-10-13",
    });
    expect(projected.dashboard).toMatchObject({
      sport: "Running",
      goals: [
        { distanceMeters: 2_400, target: { durationSeconds: 650 } },
        { distanceMeters: 10_000, target: { durationSeconds: 3_000 } },
        { distanceMeters: 21_097, target: { durationSeconds: 7_200 } },
      ],
    });
    expect(projected.runningTargetSources).toEqual([
      expect.objectContaining({
        id: source.id,
        currentTargets: expect.arrayContaining([
          expect.objectContaining({ goalDistanceMeters: 2_400, revision: 2 }),
          expect.objectContaining({ goalDistanceMeters: 10_000, revision: 1 }),
          expect.objectContaining({ goalDistanceMeters: 21_097, revision: 1 }),
        ]),
      }),
    ]);
  });
});

describe("Phase 13 independent schedule collision semantics", () => {
  const strength = Object.freeze({
    id: "strength-opportunity-spring",
    scheduleId: "strength-schedule",
    scheduleVersionId: "strength-v2",
    planId: "strength-plan",
    slotId: "strength-day-a",
    localDate: parseLocalDate("2026-03-08"),
    timeZone: parseStoredTimeZone("America/New_York"),
    revision: 4,
    state: "planned" as const,
  });
  const running = Object.freeze({
    id: "running-opportunity-fall",
    scheduleId: "running-schedule",
    scheduleVersionId: "running-v7",
    planId: "running-plan",
    slotId: "running-slot-2",
    localDate: parseLocalDate("2026-11-01"),
    timeZone: parseStoredTimeZone("Australia/Sydney"),
    revision: 8,
    state: "planned" as const,
  });

  it.each<Readonly<{
    decision: "move_running" | "move_strength" | "keep_both";
    selected: "running" | "strength" | "none";
  }>>([
    { decision: "move_running", selected: "running" },
    { decision: "move_strength", selected: "strength" },
    { decision: "keep_both", selected: "none" },
  ])("appends $decision only for the exact selected future occurrence", ({ decision, selected }) => {
    const command = createCollisionDecisionCommand({
      id: `collision-${decision}`,
      decision,
      occurredAtMs: 1_793_491_200_000,
      strength,
      running,
      prospectiveLocalDate: selected === "none" ? null : parseLocalDate("2026-11-08"),
    });
    const result = appendScheduleCollisionDecision(command);

    expect(result.event).toMatchObject({
      id: `collision-${decision}`,
      decision,
      strengthOpportunityId: strength.id,
      runningOpportunityId: running.id,
    });
    expect(result.prospectiveIntent?.selected ?? "none").toBe(selected);
    expect(result.prospectiveIntent?.localDate ?? null).toBe(
      selected === "none" ? null : "2026-11-08",
    );
    expect(Object.isFrozen(result.event)).toBe(true);
  });

  it("changes only the selected schedule and preserves the other snapshot byte-for-byte across DST", () => {
    const before = Object.freeze({ strength, running });
    const result = transitionSelectedSchedule({
      schedules: before,
      selected: "strength",
      expectedRevision: strength.revision,
      nextState: "advanced",
    });

    expect(JSON.stringify(result.next.running)).toBe(JSON.stringify(before.running));
    expect(result.next.strength).toMatchObject({
      id: strength.id,
      localDate: "2026-03-08",
      timeZone: "America/New_York",
      revision: 5,
      state: "advanced",
    });
    expect(before.running).toMatchObject({
      localDate: "2026-11-01",
      timeZone: "Australia/Sydney",
      revision: 8,
    });
  });
});
