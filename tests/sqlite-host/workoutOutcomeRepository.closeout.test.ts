import { afterEach, describe, expect, it } from "@jest/globals";
import { DatabaseSync } from "node:sqlite";

import starterAsset from "../../assets/content/full-body-foundation.v1.json";
import { parseFullBodyFoundation } from "../../src/domains/content";
import { activateStarterPlan } from "../../src/domains/plans";
import { startWorkout } from "../../src/domains/workout";
import { configureSqliteConnection, type SqliteConnection, type SqlitePreparedResult, type SqlitePreparedStatement } from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createPlansWorkoutRepository } from "../../src/platform/sqlite/repositories/plansWorkoutRepository";
import { createWorkoutOutcomeRepository } from "../../src/platform/sqlite/repositories/workoutOutcomeRepository";
import { createSqliteKernel, type SqliteKernel, type SqliteTransactionExecutor } from "../../src/platform/sqlite/sqliteKernel";

class Statement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}
  async executeAsync<Row extends Record<string, unknown>>(parameters: readonly (null | number | string | Uint8Array)[] = []): Promise<SqlitePreparedResult<Row>> {
    const reading = this.statement.columns().length > 0;
    const rows = reading ? this.statement.all(...parameters) as Row[] : [];
    const result = reading ? { changes: 0, lastInsertRowid: 0 } : this.statement.run(...parameters);
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid), getAllAsync: async () => rows };
  }
  async finalizeAsync() {}
}
class Connection implements SqliteConnection {
  private closed = false;
  constructor(private readonly database: DatabaseSync) {}
  async execAsync(sql: string) { this.database.exec(sql); }
  async prepareAsync(sql: string) { return new Statement(this.database.prepare(sql)); }
  async isInTransactionAsync() { return this.database.isTransaction; }
  async closeAsync() { if (!this.closed) { this.database.close(); this.closed = true; } }
}
const kernels = new Set<SqliteKernel>();
afterEach(async () => { await Promise.all([...kernels].map((kernel) => kernel.close())); kernels.clear(); });

async function fixture() {
  const connection = new Connection(new DatabaseSync(":memory:"));
  await configureSqliteConnection(connection, { enableWal: false });
  const kernel = createSqliteKernel({ reader: connection, writer: connection });
  kernels.add(kernel);
  await createMigrationRunner({ databaseName: "outcome-closeout", kernel, migrations,
    recoveryBackup: { createAndValidate: async (request) => ({ backupId: "host", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true }) },
  }).run();
  const plans = createPlansWorkoutRepository(kernel);
  const activation = await activateStarterPlan({ fixture: parseFullBodyFoundation(starterAsset), repository: plans,
    activatedAtMs: 1_786_853_600_000, startLocalDate: "2026-08-17", timezone: "Asia/Singapore" });
  const session = await startWorkout({ repository: plans, request: {
    mode: "scheduled", planId: activation.plan.id, planDayId: activation.days[0]!.id,
    localDate: "2026-08-17", timezone: "Asia/Singapore", startedAtMs: 1_786_853_600_000,
  } });
  // Persist a completed source with recorded working-set facts. Recommendation
  // evaluation and every decision below execute the public production repository.
  await kernel.write(async (tx) => {
    await tx.execute(`UPDATE session_sets SET status = 'completed', observed_load_grams = 60000,
      observed_reps = 8, observed_json = '{"version":1,"profile":"load_reps","loadGrams":60000,"reps":8,"source":"manual"}',
      completed_at_ms = 1786853700000 WHERE session_exercise_id IN
      (SELECT id FROM session_exercises WHERE session_id = ?) AND set_kind = 'working' AND metric_profile = 'load_reps'`, [session.id]);
    await tx.execute("UPDATE session_exercises SET status = 'completed' WHERE session_id = ?", [session.id]);
    await tx.execute("UPDATE workout_sessions SET status = 'completed', completed_at_ms = 1786853700000 WHERE id = ?", [session.id]);
  });
  const repository = createWorkoutOutcomeRepository(kernel);
  await repository.generateRecommendationsForSession(session.id, session.revision, 1_786_853_710_000);
  const [recommendation] = await kernel.queryAll<{ id: string; evidence_version: number; source_revision: number; target_revision: number; plan_working_set_target_id: string; evidence_json: string; proposed_target_json: string }>(
    "SELECT * FROM progression_recommendations WHERE status = 'pending' ORDER BY id LIMIT 1");
  if (recommendation === undefined) throw new Error("closeout_recommendation_fixture_missing");
  const command = { recommendationId: recommendation.id, requestId: "closeout-decision", decision: "use_target" as const,
    expectedEvidenceVersion: recommendation.evidence_version, expectedSourceRevision: recommendation.source_revision,
    expectedTargetRevision: recommendation.target_revision, decidedAtMs: 1_786_853_720_000 };
  const [exercise] = await kernel.queryAll<{ id: string; revision: number }>(
    "SELECT id, revision FROM session_exercises WHERE session_id = ? AND metric_profile = 'load_reps' ORDER BY ordinal LIMIT 1", [session.id]);
  if (exercise === undefined) throw new Error("closeout_exercise_fixture_missing");
  return { kernel, repository, session, recommendation, command, exercise };
}

// A storage-port fault intercepts one boundary; all other SQL and rollback use
// the real migrated SQLite kernel. This simulates a failed optimistic write or
// a corrupt row returned by storage without disabling any integrity guard.
function faulted(kernel: SqliteKernel, fault: Readonly<{
  query?: (sql: string, rows: readonly Record<string, unknown>[]) => readonly Record<string, unknown>[];
  failWrite?: (sql: string) => boolean;
}>): SqliteKernel {
  return {
    ...kernel,
    write: (command) => kernel.write((tx) => command({
      execute: (sql, parameters) => fault.failWrite?.(sql) ? Promise.resolve({ changes: 0, lastInsertRowId: 0 }) : tx.execute(sql, parameters),
      queryAll: async <Row extends Record<string, unknown>>(sql: string, parameters?: Parameters<SqliteTransactionExecutor["queryAll"]>[1]) => {
        const rows = await tx.queryAll<Row>(sql, parameters);
        return (fault.query?.(sql, rows) ?? rows) as readonly Row[];
      },
    })),
  };
}
async function expectConflict(operation: Promise<unknown>, code: string) {
  const error = await operation.then(() => null, (value: unknown) => value);
  const messages: string[] = [];
  for (let cause: any = error; cause != null; cause = cause.cause) messages.push(cause.message);
  expect(messages).toContain(code);
}
async function decisionFacts(kernel: SqliteKernel) {
  return {
    targets: await kernel.queryAll("SELECT id, target_json, revision FROM plan_working_set_targets ORDER BY id"),
    recommendations: await kernel.queryAll("SELECT id, status, target_revision, decided_at_ms FROM progression_recommendations ORDER BY id"),
    receipts: await kernel.queryAll("SELECT * FROM progression_recommendation_decision_receipts ORDER BY request_id"),
  };
}

describe("workout outcome closeout behavior", () => {
  it("reads one authoritative completed session at the requested revision through a real snapshot", async () => {
    const { repository, session } = await fixture();
    await expect(repository.getSessionDetailAtRevision!(session.id, session.revision))
      .resolves.toMatchObject({ id: session.id, revision: session.revision, status: "completed" });
    await expect(repository.getCalendarSessionDetail(session.id))
      .resolves.toMatchObject({ id: session.id, revision: session.revision, status: "completed" });
  });

  it("records effort once, rejects a stale exercise revision, and preserves the first effort", async () => {
    const { repository, kernel, session, exercise } = await fixture();
    const input = { sessionId: session.id, sessionExerciseId: exercise.id, expectedExerciseRevision: exercise.revision, effort: "on_target" as const, recordedAtMs: 1_786_853_720_000 };
    await expectConflict(repository.recordExerciseEffort({ ...input, expectedExerciseRevision: exercise.revision + 1 }), "exercise_effort_conflict");
    await expect(repository.recordExerciseEffort(input)).resolves.toEqual({ sessionExerciseId: exercise.id, effort: "on_target", revision: exercise.revision + 1 });
    await expectConflict(repository.recordExerciseEffort({ ...input, effort: "too_easy" }), "exercise_effort_already_recorded");
    expect(await kernel.queryAll("SELECT effort, revision FROM session_exercises WHERE id = ?", [exercise.id]))
      .toEqual([{ effort: "on_target", revision: exercise.revision + 1 }]);
  });

  it("rolls back effort and effects when the session revision update fails", async () => {
    const { kernel, session, exercise } = await fixture();
    const before = await kernel.queryAll("SELECT * FROM session_exercises ORDER BY id");
    const effects = await kernel.queryAll("SELECT * FROM pending_effects ORDER BY id");
    const repository = createWorkoutOutcomeRepository(faulted(kernel, { failWrite: (sql) => sql.includes("UPDATE workout_sessions") }));
    await expectConflict(repository.recordExerciseEffort({ sessionId: session.id, sessionExerciseId: exercise.id, expectedExerciseRevision: exercise.revision, effort: "on_target", recordedAtMs: 1_786_853_720_000 }), "exercise_effort_session_update_failed");
    expect(await kernel.queryAll("SELECT * FROM session_exercises ORDER BY id")).toEqual(before);
    expect(await kernel.queryAll("SELECT * FROM pending_effects ORDER BY id")).toEqual(effects);
  });

  it.each(["use_target", "keep_current_target"] as const)("replays %s exactly and rejects a changed request hash or opposite decision", async (decision) => {
    const { kernel, repository, command } = await fixture();
    const input = { ...command, decision };
    const act = decision === "use_target" ? repository.acceptRecommendation : repository.keepCurrentTarget;
    const result = await act(input);
    expect(result.status).toBe(decision === "use_target" ? "accepted" : "rejected");
    const committed = await decisionFacts(kernel);
    await expect(act(input)).resolves.toEqual({ recommendationId: command.recommendationId, status: "already_committed" });
    await expect(act({ ...input, requestId: "same-decision-new-request" }))
      .resolves.toEqual({ recommendationId: command.recommendationId, status: "already_committed" });
    await expectConflict(act({ ...input, decidedAtMs: input.decidedAtMs + 1 }), "recommendation_request_identity_conflict");
    const opposite = decision === "use_target" ? repository.keepCurrentTarget : repository.acceptRecommendation;
    await expectConflict(opposite({ ...input, requestId: "opposite-decision", decision: decision === "use_target" ? "keep_current_target" : "use_target" }), "recommendation_request_identity_conflict");
    expect(await decisionFacts(kernel)).toEqual(committed);
  });

  it("supersedes a keep-current decision with stale source fences and replays that committed result", async () => {
    const { kernel, repository, command } = await fixture();
    const beforeTargets = (await decisionFacts(kernel)).targets;
    const input = { ...command, decision: "keep_current_target" as const, expectedSourceRevision: command.expectedSourceRevision + 1 };
    await expect(repository.keepCurrentTarget(input)).resolves.toEqual({ recommendationId: command.recommendationId, status: "superseded" });
    await expect(repository.keepCurrentTarget(input)).resolves.toEqual({ recommendationId: command.recommendationId, status: "already_committed" });
    expect((await decisionFacts(kernel)).targets).toEqual(beforeTargets);
  });

  it.each(["use_target", "keep_current_target"] as const)("rejects %s for an absent recommendation", async (decision) => {
    const { repository, command } = await fixture();
    const act = decision === "use_target" ? repository.acceptRecommendation : repository.keepCurrentTarget;
    await expectConflict(act({ ...command, recommendationId: "missing-recommendation", decision }), "recommendation_decision_conflict");
  });

  it.each(["target", "accept", "reject", "supersede"] as const)("rolls back the complete decision when its %s optimistic write fails", async (stage) => {
    const { kernel, command } = await fixture();
    const before = await decisionFacts(kernel);
    const repository = createWorkoutOutcomeRepository(faulted(kernel, { failWrite: (sql) => stage === "target"
      ? sql.includes("UPDATE plan_working_set_targets") : sql.includes(`SET status = '${stage === "accept" ? "accepted" : stage === "reject" ? "rejected" : "superseded"}'`) }));
    const input = { ...command, decision: stage === "reject" || stage === "supersede" ? "keep_current_target" as const : "use_target" as const,
      expectedSourceRevision: command.expectedSourceRevision + (stage === "supersede" ? 1 : 0) };
    const act = input.decision === "use_target" ? repository.acceptRecommendation : repository.keepCurrentTarget;
    await expectConflict(act(input), stage === "target" ? "recommendation_target_compare_and_swap_failed" : "recommendation_decision_conflict");
    expect(await decisionFacts(kernel)).toEqual(before);
  });

  it.each(["source", "scope-size", "scope-member", "evidence"] as const)("supersedes a recommendation with a stale %s without changing targets", async (boundary) => {
    const { kernel, command } = await fixture();
    const before = (await decisionFacts(kernel)).targets;
    const repository = createWorkoutOutcomeRepository(faulted(kernel, { query: (sql, rows) => {
      if (boundary === "source" && sql.includes("SELECT revision, status") && sql.includes("FROM workout_sessions")) return [];
      if (boundary === "evidence" && sql.includes("FROM progression_recommendations") && sql.includes("WHERE id = ?"))
        return rows.map((row) => ({ ...row, evidence_json: "{}" }));
      if (sql.includes("FROM plan_working_set_targets target")) {
        if (boundary === "scope-size") return [...rows, { ...rows[0], id: "unexpected-target" }];
        if (boundary === "scope-member") return rows.map((row, index) => index === rows.length - 1 ? { ...row, id: "unexpected-target" } : row);
      }
      return rows;
    } }));
    await expect(repository.acceptRecommendation(command)).resolves.toEqual({ recommendationId: command.recommendationId, status: "superseded" });
    expect((await decisionFacts(kernel)).targets).toEqual(before);
  });

  it("rejects recommendation generation against a stale completed source revision", async () => {
    const { repository, session } = await fixture();
    await expectConflict(repository.generateRecommendationsForSession(session.id, session.revision + 1, 1_786_853_730_000), "recommendation_source_stale");
  });

  it("supersedes acceptance with stale source fences before changing any working-set target", async () => {
    const { kernel, repository, command } = await fixture();
    const targets = (await decisionFacts(kernel)).targets;
    await expect(repository.acceptRecommendation({ ...command, expectedSourceRevision: command.expectedSourceRevision + 1 }))
      .resolves.toEqual({ recommendationId: command.recommendationId, status: "superseded" });
    expect((await decisionFacts(kernel)).targets).toEqual(targets);
  });

  it("omits skipped exercises from recommendation generation", async () => {
    const { kernel, repository, session } = await fixture();
    await kernel.write((tx) => tx.execute("UPDATE session_exercises SET status = 'skipped' WHERE session_id = ?", [session.id]));
    const before = await kernel.queryAll("SELECT * FROM progression_recommendations ORDER BY id");
    await expect(repository.generateRecommendationsForSession(session.id, session.revision, 1_786_853_730_000)).resolves.toBe(0);
    expect(await kernel.queryAll("SELECT * FROM progression_recommendations ORDER BY id")).toEqual(before);
  });

  it("reads legacy completed sets with absent observations as unrecorded and counts zero observed reps", async () => {
    const { kernel, repository, session } = await fixture();
    await kernel.write((tx) => tx.execute(`UPDATE session_sets SET target_json = '{}',
      observed_load_grams = NULL, observed_reps = NULL, observed_json = NULL
      WHERE session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id = ?)`, [session.id]));
    const detail = await repository.getSessionDetail(session.id);
    const exercise = detail.exercises.find((item) => item.metricProfile === "load_reps")!;
    expect(exercise.totalWorkingReps).toBe(0);
    expect(exercise.workingSets).not.toHaveLength(0);
    for (const set of exercise.workingSets) {
      expect(set.observation).toBeNull();
      expect(set.target).toMatchObject({ profile: "load_reps", loadGrams: 0, minReps: 1, maxReps: 1 });
    }
  });

  it.each(["empty", "mixed-revision"] as const)("rejects generation for a %s target scope without storing a recommendation", async (boundary) => {
    const { kernel, session } = await fixture();
    const before = await kernel.queryAll("SELECT * FROM progression_recommendations ORDER BY id");
    const repository = createWorkoutOutcomeRepository(faulted(kernel, { query: (sql, rows) => {
      if (sql.includes("SELECT exercise_id,") && sql.includes("evidence_json")) return [];
      if (sql.includes("SELECT id, target_json, revision") && sql.includes("ORDER BY ordinal")) return boundary === "empty" ? [] : rows.map((row) => ({ ...row, revision: Number(row.revision) + 1 }));
      return rows;
    } }));
    await expectConflict(repository.generateRecommendationsForSession(session.id, session.revision, 1_786_853_730_000), "recommendation_target_scope_stale");
    expect(await kernel.queryAll("SELECT * FROM progression_recommendations ORDER BY id")).toEqual(before);
  });
});
