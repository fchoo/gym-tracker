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
import type { SqliteKernelTestObserver } from "../../src/platform/sqlite/sqliteKernel";

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

async function setup(observer: SqliteKernelTestObserver = {}) {
  const directory = mkdtempSync(join(tmpdir(), "gym-phase9-")); directories.add(directory);
  const path = join(directory, "gym.db");
  const writer = new Connection(new DatabaseSync(path)); const reader = new Connection(new DatabaseSync(path));
  await configureSqliteConnection(writer, { enableWal: true }); await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer }, observer); kernels.push(kernel);
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
  const [replacement] = await kernel.queryAll<{ exercise_id: string }>(
    "SELECT exercise_id FROM exercise_library_entries WHERE availability = 'available' ORDER BY exercise_id DESC LIMIT 1",
  );
  return { kernel, repository: createWorkoutRepository(kernel), session, libraryExerciseId: library!.exercise_id, replacementLibraryExerciseId: replacement!.exercise_id };
}

const hash = "a".repeat(64);

async function sessionExercise(kernel: SqliteKernel, sessionId: string) {
  const [row] = await kernel.queryAll<{
    id: string;
    revision: number;
    display_ordinal: number;
    exercise_id: string;
  }>(
    `SELECT id, revision, display_ordinal, exercise_id
     FROM session_exercises
     WHERE session_id = ?
     ORDER BY display_ordinal, ordinal
     LIMIT 1`,
    [sessionId],
  );
  return row!;
}

function replaceInput(
  sessionId: string,
  sessionRevision: number,
  exercise: Awaited<ReturnType<typeof sessionExercise>>,
  libraryExerciseId: string,
  requestId = "replace-1",
) {
  return {
    requestId,
    requestSha256: hash,
    sessionId,
    expectedSessionRevision: sessionRevision,
    sessionExerciseId: exercise.id,
    expectedSessionExerciseRevision: exercise.revision,
    occurredAtMs: 2_000,
    libraryExerciseId,
    replacementSessionExerciseId: `${requestId}-exercise`,
    replacementSetId: `${requestId}-set`,
  };
}

function removeInput(
  sessionId: string,
  sessionRevision: number,
  exercise: Awaited<ReturnType<typeof sessionExercise>>,
  requestId = "remove-1",
) {
  return {
    requestId,
    requestSha256: hash,
    sessionId,
    expectedSessionRevision: sessionRevision,
    sessionExerciseId: exercise.id,
    expectedSessionExerciseRevision: exercise.revision,
    occurredAtMs: 2_000,
  };
}

async function sessionExercises(
  kernel: SqliteKernel,
  sessionId: string,
) {
  return kernel.queryAll<Readonly<{
    id: string;
    revision: number;
    ordinal: number;
    display_ordinal: number;
    exercise_id: string;
  }>>(
    `SELECT id, revision, ordinal, display_ordinal, exercise_id
     FROM session_exercises
     WHERE session_id = ?
     ORDER BY display_ordinal, id`,
    [sessionId],
  );
}

function reorderInput(
  sessionId: string,
  expectedSessionRevision: number,
  exercises: readonly Awaited<ReturnType<typeof sessionExercises>>[number][],
  requestId = "reorder-1",
) {
  return {
    requestId,
    requestSha256: hash,
    sessionId,
    expectedSessionRevision,
    occurredAtMs: 2_000,
    orderedSessionExerciseIds: exercises.map(({ id }) => id),
    expectedSessionExerciseRevisions: exercises.map(({ id, revision }) => ({
      sessionExerciseId: id,
      revision,
    })),
  };
}
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

  it("persists only contiguous display order and the independent immutable reorder receipt", async () => {
    const { kernel, repository, session, libraryExerciseId } = await setup();
    const added = await repository.addExercise!({
      requestId: "reorder-add", requestSha256: hash, sessionId: session.id,
      expectedSessionRevision: session.revision, occurredAtMs: 1_900,
      libraryExerciseId, sessionExerciseId: "reorder-added-exercise", setId: "reorder-added-set",
    });
    const before = await kernel.queryAll(
      `SELECT se.*, ss.id AS set_id, ss.status AS set_status,
              ss.observed_json, ss.completed_at_ms, su.snapshot_json
       FROM session_exercises se
       LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
       LEFT JOIN session_undo_snapshots su ON su.completed_set_id = ss.id
       WHERE se.session_id = ?
       ORDER BY se.id, ss.id`,
      [session.id],
    );
    const current = await sessionExercises(kernel, session.id);
    const input = reorderInput(
      session.id,
      added.sessionRevision,
      [...current].reverse(),
    );

    await expect(repository.reorderExercises!(input)).resolves.toEqual({
      outcome: "committed",
      sessionId: session.id,
      orderedSessionExerciseIds: input.orderedSessionExerciseIds,
      sessionRevision: added.sessionRevision + 1,
    });
    await expect(createWorkoutRepository(kernel).reorderExercises!(input))
      .resolves.toEqual({
        outcome: "already_committed",
        sessionId: session.id,
        orderedSessionExerciseIds: input.orderedSessionExerciseIds,
        sessionRevision: added.sessionRevision + 1,
      });
    await expect(createWorkoutRepository(kernel).reorderExercises!({
      ...input,
      expectedSessionExerciseRevisions: input.expectedSessionExerciseRevisions.map(
        (entry, index) => index === 0
          ? { ...entry, revision: entry.revision + 1 }
          : entry,
      ),
    })).rejects.toThrow("reorder_exercises_replay_conflict");
    expect(await sessionExercises(kernel, session.id)).toEqual(
      input.orderedSessionExerciseIds.map((id, display_ordinal) => ({
        ...current.find((exercise) => exercise.id === id)!,
        display_ordinal,
      })),
    );
    const after = await kernel.queryAll(
      `SELECT se.*, ss.id AS set_id, ss.status AS set_status,
              ss.observed_json, ss.completed_at_ms, su.snapshot_json
       FROM session_exercises se
       LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
       LEFT JOIN session_undo_snapshots su ON su.completed_set_id = ss.id
       WHERE se.session_id = ?
       ORDER BY se.id, ss.id`,
      [session.id],
    );
    expect(after).toEqual(before.map((row) => ({
      ...row,
      display_ordinal: input.orderedSessionExerciseIds.indexOf(String(row.id)),
    })));
    expect(await kernel.queryAll(
      `SELECT operation, ordered_session_exercise_ids_json, result_session_revision
       FROM workout_session_exercise_reorder_receipts
       WHERE request_id = ?`,
      [input.requestId],
    )).toEqual([{
      operation: "reorder_exercises",
      ordered_session_exercise_ids_json: JSON.stringify(input.orderedSessionExerciseIds),
      result_session_revision: added.sessionRevision + 1,
    }]);
    expect(await kernel.queryAll(
      "SELECT request_id FROM workout_session_exercise_edit_receipts WHERE request_id = ?",
      [input.requestId],
    )).toEqual([]);
    await expect(repository.getActiveWorkout(session.id)).resolves.toMatchObject({
      exercises: input.orderedSessionExerciseIds.map((id) => ({ id })),
    });
  });

  it("uses reordered display order for the next active set without rewriting immutable ordinal", async () => {
    const { kernel, repository, session, libraryExerciseId } = await setup();
    const added = await repository.addExercise!({
      requestId: "traversal-add", requestSha256: hash, sessionId: session.id,
      expectedSessionRevision: session.revision, occurredAtMs: 1_900,
      libraryExerciseId, sessionExerciseId: "traversal-added-exercise", setId: "traversal-added-set",
    });
    const current = await sessionExercises(kernel, session.id);
    const reordered = [
      current.find(({ id }) => id === "traversal-added-exercise")!,
      ...current.filter(({ id }) => id !== "traversal-added-exercise"),
    ];
    await repository.reorderExercises!(reorderInput(
      session.id, added.sessionRevision, reordered, "traversal-reorder",
    ));
    const [activeSet] = await kernel.queryAll<{ id: string; revision: number }>(
      `SELECT id, revision FROM session_sets
       WHERE session_exercise_id = ? AND set_kind = 'working'
       ORDER BY ordinal, id LIMIT 1`,
      [current[0]!.id],
    );

    const result = await repository.completeSet({
      sessionId: session.id,
      setId: activeSet!.id,
      expectedSessionRevision: added.sessionRevision + 1,
      expectedSetRevision: activeSet!.revision,
      completionIdempotencyKey: "traversal-complete",
      metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
      observation: { profile: "load_reps", version: 1, loadGrams: 10_000, reps: 8, source: "manual" },
      completedAtMs: 2_100,
    });
    expect(result.view.activeExerciseId).toBe("traversal-added-exercise");
    expect(result.view.activeSetId).toBe("traversal-added-set");
    expect(await kernel.queryAll(
      "SELECT id, ordinal, display_ordinal FROM session_exercises WHERE id = 'traversal-added-exercise'",
    )).toEqual([{ id: "traversal-added-exercise", ordinal: current.at(-1)!.ordinal, display_ordinal: 0 }]);
  });

  it("rejects no-op, stale, and skipped-only reorder requests without writing either receipt ledger", async () => {
    const { kernel, repository, session, libraryExerciseId } = await setup();
    const added = await repository.addExercise!({
      requestId: "reorder-guard-add", requestSha256: hash, sessionId: session.id,
      expectedSessionRevision: session.revision, occurredAtMs: 1_900,
      libraryExerciseId, sessionExerciseId: "reorder-guard-exercise", setId: "reorder-guard-set",
    });
    const current = await sessionExercises(kernel, session.id);
    const noOp = reorderInput(session.id, added.sessionRevision, current, "reorder-noop");
    const before = await Promise.all([
      kernel.queryAll("SELECT revision FROM workout_sessions WHERE id = ?", [session.id]),
      kernel.queryAll("SELECT * FROM workout_session_exercise_reorder_receipts ORDER BY request_id"),
      kernel.queryAll("SELECT * FROM workout_session_exercise_edit_receipts ORDER BY request_id"),
    ]);
    await expect(repository.reorderExercises!(noOp))
      .rejects.toThrow("reorder_exercises_noop");
    await expect(Promise.all([
      kernel.queryAll("SELECT revision FROM workout_sessions WHERE id = ?", [session.id]),
      kernel.queryAll("SELECT * FROM workout_session_exercise_reorder_receipts ORDER BY request_id"),
      kernel.queryAll("SELECT * FROM workout_session_exercise_edit_receipts ORDER BY request_id"),
    ])).resolves.toEqual(before);

    const winner = reorderInput(
      session.id, added.sessionRevision, [...current].reverse(), "reorder-winner",
    );
    await repository.reorderExercises!(winner);
    await expect(repository.reorderExercises!(reorderInput(
      session.id, added.sessionRevision, current, "reorder-stale",
    ))).rejects.toThrow("reorder_exercises_conflict");
    expect(await kernel.queryAll(
      "SELECT request_id FROM workout_session_exercise_reorder_receipts ORDER BY request_id",
    )).toEqual([{ request_id: "reorder-winner" }]);

    const [afterWinner] = await kernel.queryAll<{ revision: number }>(
      "SELECT revision FROM workout_sessions WHERE id = ?", [session.id],
    );
    await kernel.write(async (transaction) => {
      await transaction.execute(
        "UPDATE session_exercises SET status = 'skipped' WHERE session_id = ?",
        [session.id],
      );
    });
    const skipped = await sessionExercises(kernel, session.id);
    await expect(repository.reorderExercises!(reorderInput(
      session.id, afterWinner!.revision, [...skipped].reverse(), "reorder-skipped",
    ))).rejects.toThrow("reorder_exercises_membership_conflict");
    expect(await kernel.queryAll(
      "SELECT request_id FROM workout_session_exercise_reorder_receipts ORDER BY request_id",
    )).toEqual([{ request_id: "reorder-winner" }]);
  });

  it("preserves completed and undo-backed source facts across reorder", async () => {
    const { kernel, repository, session, libraryExerciseId } = await setup();
    const added = await repository.addExercise!({
      requestId: "reorder-history-add", requestSha256: hash, sessionId: session.id,
      expectedSessionRevision: session.revision, occurredAtMs: 1_900,
      libraryExerciseId, sessionExerciseId: "reorder-history-exercise", setId: "reorder-history-set",
    });
    const [activeSet] = await kernel.queryAll<{ id: string; revision: number }>(
      `SELECT id, revision FROM session_sets
       WHERE session_exercise_id = (
         SELECT active_session_exercise_id FROM workout_sessions WHERE id = ?
       ) AND set_kind = 'working'
       ORDER BY ordinal, id LIMIT 1`,
      [session.id],
    );
    const completed = await repository.completeSet({
      sessionId: session.id,
      setId: activeSet!.id,
      expectedSessionRevision: added.sessionRevision,
      expectedSetRevision: activeSet!.revision,
      completionIdempotencyKey: "reorder-history-complete",
      metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
      observation: { profile: "load_reps", version: 1, loadGrams: 10_000, reps: 8, source: "manual" },
      completedAtMs: 2_000,
    });
    const before = await Promise.all([
      kernel.queryAll(
        `SELECT id, ordinal, origin, exercise_name, metric_profile,
                metric_contract_version, exercise_metric_generation,
                default_rest_seconds, target_revision, status, revision
         FROM session_exercises WHERE session_id = ? ORDER BY id`,
        [session.id],
      ),
      kernel.queryAll(
        `SELECT ss.* FROM session_sets ss
         JOIN session_exercises se ON se.id = ss.session_exercise_id
         WHERE se.session_id = ? ORDER BY ss.id`,
        [session.id],
      ),
      kernel.queryAll(
        `SELECT su.* FROM session_undo_snapshots su
         JOIN session_sets ss ON ss.id = su.completed_set_id
         JOIN session_exercises se ON se.id = ss.session_exercise_id
         WHERE se.session_id = ? ORDER BY su.id`,
        [session.id],
      ),
    ]);
    const current = await sessionExercises(kernel, session.id);
    await repository.reorderExercises!(reorderInput(
      session.id, completed.view.revision, [...current].reverse(), "reorder-history",
    ));
    await expect(Promise.all([
      kernel.queryAll(
        `SELECT id, ordinal, origin, exercise_name, metric_profile,
                metric_contract_version, exercise_metric_generation,
                default_rest_seconds, target_revision, status, revision
         FROM session_exercises WHERE session_id = ? ORDER BY id`,
        [session.id],
      ),
      kernel.queryAll(
        `SELECT ss.* FROM session_sets ss
         JOIN session_exercises se ON se.id = ss.session_exercise_id
         WHERE se.session_id = ? ORDER BY ss.id`,
        [session.id],
      ),
      kernel.queryAll(
        `SELECT su.* FROM session_undo_snapshots su
         JOIN session_sets ss ON ss.id = su.completed_set_id
         JOIN session_exercises se ON se.id = ss.session_exercise_id
         WHERE se.session_id = ? ORDER BY su.id`,
        [session.id],
      ),
    ])).resolves.toEqual(before);
  });

  it("rolls back display order, session metadata, and reorder receipt on commit failure", async () => {
    let failCommit = false;
    const { kernel, repository, session, libraryExerciseId } = await setup({
      beforeCommit: async () => {
        if (failCommit) {
          failCommit = false;
          throw new Error("injected_reorder_commit_failure");
        }
      },
    });
    const added = await repository.addExercise!({
      requestId: "reorder-rollback-add", requestSha256: hash, sessionId: session.id,
      expectedSessionRevision: session.revision, occurredAtMs: 1_900,
      libraryExerciseId, sessionExerciseId: "reorder-rollback-exercise", setId: "reorder-rollback-set",
    });
    const current = await sessionExercises(kernel, session.id);
    const before = await Promise.all([
      kernel.queryAll("SELECT * FROM workout_sessions WHERE id = ?", [session.id]),
      kernel.queryAll("SELECT * FROM session_exercises WHERE session_id = ? ORDER BY id", [session.id]),
      kernel.queryAll("SELECT * FROM workout_session_exercise_reorder_receipts ORDER BY request_id"),
      kernel.queryAll("SELECT * FROM workout_session_exercise_edit_receipts ORDER BY request_id"),
    ]);
    failCommit = true;

    await expect(repository.reorderExercises!(reorderInput(
      session.id, added.sessionRevision, [...current].reverse(), "reorder-rollback",
    ))).rejects.toThrow("sqlite_commit_failed");
    await expect(Promise.all([
      kernel.queryAll("SELECT * FROM workout_sessions WHERE id = ?", [session.id]),
      kernel.queryAll("SELECT * FROM session_exercises WHERE session_id = ? ORDER BY id", [session.id]),
      kernel.queryAll("SELECT * FROM workout_session_exercise_reorder_receipts ORDER BY request_id"),
      kernel.queryAll("SELECT * FROM workout_session_exercise_edit_receipts ORDER BY request_id"),
    ])).resolves.toEqual(before);
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

  it("replaces a provisional exercise by deleting only its zero-completed rows and writing one scalar v20 receipt", async () => {
    const { kernel, repository, session, replacementLibraryExerciseId } = await setup();
    const original = await sessionExercise(kernel, session.id);
    const input = replaceInput(
      session.id,
      session.revision,
      original,
      replacementLibraryExerciseId,
    );

    await expect(repository.replaceExercise!(input)).resolves.toEqual({
      outcome: "committed",
      disposition: "deleted_provisional",
      sessionId: session.id,
      sessionExerciseId: original.id,
      replacementSessionExerciseId: input.replacementSessionExerciseId,
      replacementSetId: input.replacementSetId,
      sessionRevision: session.revision + 1,
    });
    expect(await kernel.queryAll(
      "SELECT id FROM session_exercises WHERE id = ?",
      [original.id],
    )).toEqual([]);
    expect(await kernel.queryAll(
      "SELECT id FROM session_sets WHERE session_exercise_id = ?",
      [original.id],
    )).toEqual([]);
    expect(await kernel.queryAll(
      `SELECT origin, source_plan_day_exercise_id, display_ordinal
       FROM session_exercises WHERE id = ?`,
      [input.replacementSessionExerciseId],
    )).toEqual([{
      origin: "added",
      source_plan_day_exercise_id: null,
      display_ordinal: original.display_ordinal,
    }]);
    expect(await kernel.queryAll(
      `SELECT operation, subject_session_exercise_id, replacement_session_exercise_id
       FROM workout_session_exercise_edit_receipts WHERE request_id = ?`,
      [input.requestId],
    )).toEqual([{
      operation: "replace_exercise",
      subject_session_exercise_id: original.id,
      replacement_session_exercise_id: input.replacementSessionExerciseId,
    }]);
    expect(await kernel.queryAll(
      "SELECT COUNT(*) AS count FROM workout_session_exercise_reorder_receipts",
    )).toEqual([{ count: 0 }]);
  });

  it("removes a provisional added exercise and replays its immutable v20 receipt after repository restart", async () => {
    const { kernel, repository, session, libraryExerciseId } = await setup();
    const added = await repository.addExercise!({
      requestId: "provisional-add", requestSha256: hash, sessionId: session.id,
      expectedSessionRevision: session.revision, occurredAtMs: 1_900,
      libraryExerciseId, sessionExerciseId: "provisional-exercise", setId: "provisional-set",
    });
    const original = await sessionExercise(kernel, session.id);
    const provisional = (await kernel.queryAll<{ id: string; revision: number; display_ordinal: number; exercise_id: string }>(
      "SELECT id, revision, display_ordinal, exercise_id FROM session_exercises WHERE id = 'provisional-exercise'",
    ))[0]!;
    const input = removeInput(session.id, added.sessionRevision, provisional);

    const first = await repository.removeExercise!(input);
    await expect(createWorkoutRepository(kernel).removeExercise!(input)).resolves.toEqual({
      ...first, outcome: "already_committed",
    });
    expect(await kernel.queryAll(
      "SELECT id FROM session_exercises WHERE id = 'provisional-exercise'",
    )).toEqual([]);
    expect(await kernel.queryAll(
      "SELECT request_id FROM workout_session_exercise_edit_receipts WHERE request_id IN ('provisional-add', 'remove-1') ORDER BY request_id",
    )).toEqual([{ request_id: "provisional-add" }, { request_id: "remove-1" }]);
    expect(await kernel.queryAll(
      "SELECT id FROM session_exercises WHERE id = ?",
      [original.id],
    )).toEqual([{ id: original.id }]);
  });

  it("moves active and rest-owned provisional work to stable display-order next work", async () => {
    const { kernel, repository, session, libraryExerciseId } = await setup();
    const added = await repository.addExercise!({
      requestId: "pointer-add", requestSha256: hash, sessionId: session.id,
      expectedSessionRevision: session.revision, occurredAtMs: 1_900,
      libraryExerciseId, sessionExerciseId: "pointer-provisional", setId: "pointer-provisional-set",
    });
    const original = await sessionExercise(kernel, session.id);
    const [originalWorking] = await kernel.queryAll<{ id: string }>(
      `SELECT id FROM session_sets
       WHERE session_exercise_id = ? AND set_kind = 'working'
       ORDER BY ordinal, id LIMIT 1`,
      [original.id],
    );
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE workout_sessions
         SET active_session_exercise_id = ?, active_set_id = ?
         WHERE id = ?`,
        ["pointer-provisional", "pointer-provisional-set", session.id],
      );
      await transaction.execute(
        `INSERT INTO session_rest_states
          (session_id, state_version, status, started_at_ms, ends_at_ms,
           remaining_ms, expired_at_ms, next_set_id, revision)
         VALUES (?, 1, 'running', 1_901, 1_961, NULL, NULL, ?, 3)`,
        [session.id, "pointer-provisional-set"],
      );
    });
    const provisional = (await kernel.queryAll<{ id: string; revision: number; display_ordinal: number; exercise_id: string }>(
      "SELECT id, revision, display_ordinal, exercise_id FROM session_exercises WHERE id = 'pointer-provisional'",
    ))[0]!;

    await expect(repository.removeExercise!(removeInput(
      session.id, added.sessionRevision, provisional, "pointer-remove",
    ))).resolves.toMatchObject({ disposition: "deleted_provisional" });
    expect(await kernel.queryAll(
      `SELECT active_session_exercise_id, active_set_id
       FROM workout_sessions WHERE id = ?`,
      [session.id],
    )).toEqual([{
      active_session_exercise_id: original.id,
      active_set_id: originalWorking!.id,
    }]);
    expect(await kernel.queryAll(
      `SELECT status, next_set_id, revision
       FROM session_rest_states WHERE session_id = ?`,
      [session.id],
    )).toEqual([{ status: "idle", next_set_id: null, revision: 4 }]);
    expect(await kernel.queryAll(
      `SELECT effect_type, idempotency_key, expected_revision
       FROM pending_effects
       WHERE subject_id = ? AND effect_type = 'reconcile_rest_notification'`,
      [session.id],
    )).toEqual([{
      effect_type: "reconcile_rest_notification",
      idempotency_key: "rest:exercise-edit:pointer-remove",
      expected_revision: 4,
    }]);
  });

  it("rejects a concurrent stale replace without creating rows or a receipt", async () => {
    const { kernel, repository, session, replacementLibraryExerciseId } = await setup();
    const original = await sessionExercise(kernel, session.id);
    const winner = replaceInput(
      session.id, session.revision, original, replacementLibraryExerciseId, "replace-winner",
    );
    const stale = replaceInput(
      session.id, session.revision, original, replacementLibraryExerciseId, "replace-stale",
    );

    await repository.replaceExercise!(winner);
    await expect(repository.replaceExercise!(stale)).rejects.toMatchObject({
      code: "replace_exercise_conflict",
    });
    expect(await kernel.queryAll(
      `SELECT id FROM session_exercises
       WHERE id IN (?, ?) ORDER BY id`,
      [winner.replacementSessionExerciseId, stale.replacementSessionExerciseId],
    )).toEqual([{ id: winner.replacementSessionExerciseId }]);
    expect(await kernel.queryAll(
      `SELECT request_id FROM workout_session_exercise_edit_receipts
       WHERE request_id IN (?, ?) ORDER BY request_id`,
      [winner.requestId, stale.requestId],
    )).toEqual([{ request_id: winner.requestId }]);
  });

  it("preserves completed facts and valid undo when replace or remove would otherwise destroy history", async () => {
    const { kernel, repository, session, replacementLibraryExerciseId } = await setup();
    const original = await sessionExercise(kernel, session.id);
    const [working] = await kernel.queryAll<{ id: string; revision: number }>(
      `SELECT id, revision FROM session_sets
       WHERE session_exercise_id = ? AND set_kind = 'working'
       ORDER BY ordinal LIMIT 1`,
      [original.id],
    );
    await repository.completeSet({
      sessionId: session.id, setId: working!.id, expectedSessionRevision: session.revision,
      expectedSetRevision: working!.revision, completionIdempotencyKey: "complete-protected",
      metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
      observation: { profile: "load_reps", version: 1, loadGrams: 10_000, reps: 8, source: "manual" },
      completedAtMs: 1_950,
    });
    const [afterCompletion] = await kernel.queryAll<{ revision: number }>(
      "SELECT revision FROM workout_sessions WHERE id = ?", [session.id],
    );
    const protectedRows = await kernel.queryAll(
      `SELECT ss.id, ss.status, ss.observed_json, ss.completed_at_ms, su.snapshot_json
       FROM session_sets ss
       LEFT JOIN session_undo_snapshots su ON su.completed_set_id = ss.id
       WHERE ss.session_exercise_id = ? ORDER BY ss.id`,
      [original.id],
    );
    const replace = replaceInput(
      session.id, afterCompletion!.revision, { ...original, revision: 2 },
      replacementLibraryExerciseId, "replace-protected",
    );

    await expect(repository.replaceExercise!(replace)).resolves.toMatchObject({
      disposition: "skipped_history_preserved",
    });
    expect(await kernel.queryAll(
      `SELECT ss.id, ss.status, ss.observed_json, ss.completed_at_ms, su.snapshot_json
       FROM session_sets ss
       LEFT JOIN session_undo_snapshots su ON su.completed_set_id = ss.id
       WHERE ss.session_exercise_id = ? ORDER BY ss.id`,
      [original.id],
    )).toEqual(protectedRows.map((row) => row.id === working!.id
      ? row
      : { ...row, status: "skipped" }));
    const [afterReplace] = await kernel.queryAll<{ revision: number }>(
      "SELECT revision FROM workout_sessions WHERE id = ?", [session.id],
    );
    const [exerciseAfterReplace] = await kernel.queryAll<{ revision: number }>(
      "SELECT revision FROM session_exercises WHERE id = ?", [original.id],
    );
    const protectedRemove = removeInput(
      session.id, afterReplace!.revision, { ...original, revision: exerciseAfterReplace!.revision }, "remove-protected",
    );
    await expect(repository.removeExercise!(protectedRemove)).resolves.toMatchObject({
      disposition: "skipped_history_preserved",
    });
    expect(await kernel.queryAll(
      "SELECT status FROM session_exercises WHERE id = ?", [original.id],
    )).toEqual([{ status: "skipped" }]);
    await expect(repository.undoCompletedSet({
      sessionId: session.id, completedSetId: working!.id, nowMs: 2_001,
    })).resolves.toMatchObject({ outcome: "undone" });
  });

  it("rolls every replace write back when the FIFO transaction commit fails", async () => {
    let failCommit = false;
    const { kernel, repository, session, replacementLibraryExerciseId } = await setup({
      beforeCommit: async () => {
        if (failCommit) {
          failCommit = false;
          throw new Error("injected_replace_commit_failure");
        }
      },
    });
    const original = await sessionExercise(kernel, session.id);
    const before = await Promise.all([
      kernel.queryAll("SELECT * FROM workout_sessions WHERE id = ?", [session.id]),
      kernel.queryAll("SELECT * FROM session_exercises WHERE session_id = ? ORDER BY id", [session.id]),
      kernel.queryAll("SELECT ss.* FROM session_sets ss JOIN session_exercises se ON se.id = ss.session_exercise_id WHERE se.session_id = ? ORDER BY ss.id", [session.id]),
      kernel.queryAll("SELECT * FROM workout_session_exercise_edit_receipts ORDER BY request_id"),
      kernel.queryAll("SELECT * FROM pending_effects ORDER BY id"),
    ]);
    failCommit = true;

    await expect(repository.replaceExercise!(replaceInput(
      session.id, session.revision, original, replacementLibraryExerciseId, "replace-rollback",
    ))).rejects.toMatchObject({ code: "sqlite_commit_failed" });
    await expect(Promise.all([
      kernel.queryAll("SELECT * FROM workout_sessions WHERE id = ?", [session.id]),
      kernel.queryAll("SELECT * FROM session_exercises WHERE session_id = ? ORDER BY id", [session.id]),
      kernel.queryAll("SELECT ss.* FROM session_sets ss JOIN session_exercises se ON se.id = ss.session_exercise_id WHERE se.session_id = ? ORDER BY ss.id", [session.id]),
      kernel.queryAll("SELECT * FROM workout_session_exercise_edit_receipts ORDER BY request_id"),
      kernel.queryAll("SELECT * FROM pending_effects ORDER BY id"),
    ])).resolves.toEqual(before);
  });
});
