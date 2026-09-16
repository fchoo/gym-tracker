import { afterEach, describe, expect, it } from "@jest/globals";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import fullBodyFoundationAsset from "../../assets/content/full-body-foundation.v1.json";
import { parseFullBodyFoundation } from "../../src/domains/content";
import { activateStarterPlan } from "../../src/domains/plans";
import { startWorkout } from "../../src/domains/workout";
import type { SqliteConnection, SqlitePreparedResult, SqlitePreparedStatement } from "../../src/platform/sqlite/connection";
import { configureSqliteConnection } from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import type { RecoveryBackupPort } from "../../src/platform/sqlite/recoveryBackup";
import { createPlansWorkoutRepository } from "../../src/platform/sqlite/repositories/plansWorkoutRepository";
import { createWorkoutRepository } from "../../src/platform/sqlite/repositories/workoutRepository";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";

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
const directories = new Set<string>();
const kernels: SqliteKernel[] = [];
const recoveryBackup: RecoveryBackupPort = { createAndValidate: async (request) => ({ backupId: "phase9", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true }) };
afterEach(async () => { await Promise.all(kernels.splice(0).map((kernel) => kernel.close())); for (const directory of directories) rmSync(directory, { force: true, recursive: true }); directories.clear(); });

async function setup() {
  const directory = mkdtempSync(join(tmpdir(), "gym-phase9-")); directories.add(directory);
  const path = join(directory, "gym.db");
  const writer = new Connection(new DatabaseSync(path)); const reader = new Connection(new DatabaseSync(path));
  await configureSqliteConnection(writer, { enableWal: true }); await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer }); kernels.push(kernel);
  await createMigrationRunner({ databaseName: "gym.db", kernel, migrations, recoveryBackup }).run();
  const plans = createPlansWorkoutRepository(kernel);
  const activation = await activateStarterPlan({ fixture: parseFullBodyFoundation(fullBodyFoundationAsset), repository: plans, activatedAtMs: 1_000, startLocalDate: "2026-09-16", timezone: "Asia/Singapore" });
  await kernel.write((transaction) => transaction.execute(
    `INSERT INTO exercise_library_entries
      (exercise_id, origin, canonical_name, exercise_type, movement_class,
       metric_profile, metric_contract_version, exercise_metric_generation,
       availability, revision)
     SELECT id, origin, name, 'strength', 'compound', metric_profile,
            metric_contract_version, exercise_metric_generation, 'available', revision
     FROM exercises WHERE id = (SELECT exercise_id FROM plan_day_exercises LIMIT 1)`,
  ));
  const session = await startWorkout({ repository: plans, request: { mode: "scheduled", planId: activation.plan.id, planDayId: activation.days[0]!.id, localDate: "2026-09-16", timezone: "Asia/Singapore", startedAtMs: 1_001 } });
  const [library] = await kernel.queryAll<{ exercise_id: string }>("SELECT exercise_id FROM exercise_library_entries WHERE availability = 'available' ORDER BY exercise_id LIMIT 1");
  return { kernel, repository: createWorkoutRepository(kernel), session, libraryExerciseId: library!.exercise_id };
}

const hash = "a".repeat(64);
describe("Phase 09 session exercise editing", () => {
  it("appends one added-origin exercise and one null-lineage working set without changing prior snapshots", async () => {
    const { kernel, repository, session, libraryExerciseId } = await setup();
    const before = await kernel.queryAll<{ id: string; bytes: string }>("SELECT id, quote(session_id) || quote(exercise_id) || quote(ordinal) || quote(exercise_name) || quote(status) || quote(revision) AS bytes FROM session_exercises WHERE session_id = ? ORDER BY id", [session.id]);
    const result = await repository.addExercise!({ requestId: "add-1", requestSha256: hash, sessionId: session.id, expectedSessionRevision: session.revision, occurredAtMs: 2_000, libraryExerciseId, sessionExerciseId: "added-exercise", setId: "added-set" });
    expect(result).toMatchObject({ outcome: "committed", sessionRevision: session.revision + 1 });
    expect(await kernel.queryAll("SELECT origin, source_plan_day_exercise_id, display_ordinal, status FROM session_exercises WHERE id = 'added-exercise'")).toEqual([{ origin: "added", source_plan_day_exercise_id: null, display_ordinal: before.length, status: "planned" }]);
    expect(await kernel.queryAll("SELECT set_kind, source_plan_working_set_target_id, source_owned_plan_working_set_target_id, status FROM session_sets WHERE id = 'added-set'")).toEqual([{ set_kind: "working", source_plan_working_set_target_id: null, source_owned_plan_working_set_target_id: null, status: "planned" }]);
    expect(await kernel.queryAll<{ id: string; bytes: string }>("SELECT id, quote(session_id) || quote(exercise_id) || quote(ordinal) || quote(exercise_name) || quote(status) || quote(revision) AS bytes FROM session_exercises WHERE session_id = ? AND id <> 'added-exercise' ORDER BY id", [session.id])).toEqual(before);
    expect(await kernel.queryAll("SELECT modified_from_plan, revision FROM workout_sessions WHERE id = ?", [session.id])).toEqual([{ modified_from_plan: 1, revision: session.revision + 1 }]);
  });

  it("replays an identical receipt and rejects stale or mismatched commands without writes", async () => {
    const { kernel, repository, session, libraryExerciseId } = await setup();
    const input = { requestId: "add-2", requestSha256: hash, sessionId: session.id, expectedSessionRevision: session.revision, occurredAtMs: 2_000, libraryExerciseId, sessionExerciseId: "added-exercise", setId: "added-set" };
    await repository.addExercise!(input);
    await expect(repository.addExercise!(input)).resolves.toMatchObject({ outcome: "already_committed" });
    const count = await kernel.queryAll<{ count: number }>("SELECT COUNT(*) AS count FROM session_exercises WHERE session_id = ?", [session.id]);
    await expect(repository.addExercise!({ ...input, requestSha256: "b".repeat(64) })).rejects.toThrow("add_exercise_replay_conflict");
    await expect(repository.addExercise!({ ...input, requestId: "add-stale", expectedSessionRevision: session.revision, sessionExerciseId: "other-exercise", setId: "other-set" })).rejects.toThrow("add_exercise_conflict");
    expect(await kernel.queryAll<{ count: number }>("SELECT COUNT(*) AS count FROM session_exercises WHERE session_id = ?", [session.id])).toEqual(count);
  });

  it("preserves populated v19 receipts, then writes and replays Add through v20", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gym-phase9-v19-v20-"));
    directories.add(directory);
    const databasePath = join(directory, "gym.db");
    const writer = new Connection(new DatabaseSync(databasePath));
    const reader = new Connection(new DatabaseSync(databasePath));
    await configureSqliteConnection(writer, { enableWal: true });
    await configureSqliteConnection(reader, { enableWal: false });
    const kernel = createSqliteKernel({ reader, writer });
    kernels.push(kernel);
    await createMigrationRunner({
      databaseName: "gym.db", kernel, migrations: migrations.filter(({ version }) => version <= 19), recoveryBackup,
    }).run();
    const plans = createPlansWorkoutRepository(kernel);
    const activation = await activateStarterPlan({ fixture: parseFullBodyFoundation(fullBodyFoundationAsset), repository: plans, activatedAtMs: 1_000, startLocalDate: "2026-09-16", timezone: "Asia/Singapore" });
    await kernel.write((transaction) => transaction.execute(
      `INSERT INTO exercise_library_entries
        (exercise_id, origin, canonical_name, exercise_type, movement_class,
         metric_profile, metric_contract_version, exercise_metric_generation,
         availability, revision)
       SELECT id, origin, name, 'strength', 'compound', metric_profile,
              metric_contract_version, exercise_metric_generation, 'available', revision
       FROM exercises WHERE id = (SELECT exercise_id FROM plan_day_exercises LIMIT 1)`,
    ));
    const session = await startWorkout({ repository: plans, request: { mode: "scheduled", planId: activation.plan.id, planDayId: activation.days[0]!.id, localDate: "2026-09-16", timezone: "Asia/Singapore", startedAtMs: 1_001 } });
    const [legacy] = await kernel.queryAll<{ id: string }>("SELECT id FROM session_exercises WHERE session_id = ? ORDER BY ordinal LIMIT 1", [session.id]);
    await kernel.write((transaction) => transaction.execute(
      `INSERT INTO workout_session_exercise_edit_receipts
        (request_id, request_sha256, operation, session_id, session_exercise_id,
         expected_session_revision, result_session_revision, result_json, committed_at_ms)
       VALUES ('legacy-v19-add', ?, 'add_exercise', ?, ?, ?, ?, ?, ?)`,
      [hash, session.id, legacy!.id, session.revision, session.revision + 1, JSON.stringify({ setId: "legacy-set" }), 1_999],
    ));
    await createMigrationRunner({ databaseName: "gym.db", kernel, migrations, recoveryBackup }).run();
    expect(await kernel.queryAll("SELECT request_id, subject_session_exercise_id, replacement_session_exercise_id FROM workout_session_exercise_edit_receipts WHERE request_id = 'legacy-v19-add'")).toEqual([{ request_id: "legacy-v19-add", subject_session_exercise_id: legacy!.id, replacement_session_exercise_id: null }]);
    const [library] = await kernel.queryAll<{ exercise_id: string }>("SELECT exercise_id FROM exercise_library_entries WHERE availability = 'available' ORDER BY exercise_id LIMIT 1");
    const input = { requestId: "v20-add", requestSha256: hash, sessionId: session.id, expectedSessionRevision: session.revision, occurredAtMs: 2_000, libraryExerciseId: library!.exercise_id, sessionExerciseId: "v20-added-exercise", setId: "v20-added-set" };
    const first = await createWorkoutRepository(kernel).addExercise!(input);
    await expect(createWorkoutRepository(kernel).addExercise!(input)).resolves.toEqual({ ...first, outcome: "already_committed" });
    expect(await kernel.queryAll("SELECT operation, subject_session_exercise_id, replacement_session_exercise_id FROM workout_session_exercise_edit_receipts WHERE request_id = 'v20-add'")).toEqual([{ operation: "add_exercise", subject_session_exercise_id: "v20-added-exercise", replacement_session_exercise_id: null }]);
  });
});
