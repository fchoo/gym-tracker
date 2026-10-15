import {
  canonicalRunningRequestHash,
  createInactiveRunningPlan,
  saveRunningTarget,
  type SaveRunningTargetInput,
} from "../../domains/running/commands";
import { deriveRunningPacing } from "../../domains/progress/runningPacing";
import { projectRelativeStrength } from "../../domains/progress/relativeStrength";
import { projectProgressDashboard } from "../../domains/progress/dashboardProjection";
import { projectProgressPeriod } from "../../domains/progress/periodProjection";
import type { ProgressRecord } from "../../domains/progress/contracts";
import {
  canonicalBodyweightRequestPayload,
  transitionBodyweight,
  validateBodyweightCommand,
} from "../../domains/bodyweight/contracts";
import {
  canonicalRecommendationDecisionRequest,
  validateRecommendationDecisionInput,
} from "../../domains/progression/recommendationCommands";
import { runtimeSha256 } from "../../platform/crypto/runtimeSha256";
import { createMigrationRunner } from "../../platform/sqlite/migrationRunner";
import { migrations } from "../../platform/sqlite/migrations";
import type { RecoveryBackupPort } from "../../platform/sqlite/recoveryBackup";
import { createProgressRepository } from "../../platform/sqlite/repositories/progressRepository";
import { loadEffectiveHistoryProjectionSessions } from "../../platform/sqlite/repositories/historyRepository";
import { createRunningPlanRepository } from "../../platform/sqlite/repositories/runningPlanRepository";
import { createWorkoutOutcomeRepository } from "../../platform/sqlite/repositories/workoutOutcomeRepository";
import type { SqliteKernel, SqliteSnapshotKernel } from "../../platform/sqlite/sqliteKernel";
import { createExpoMigrationsEffectsContractAdapter } from "./migrationsEffects.contract";

export const PROGRESS_PARITY_CONTRACT_VERSION = 1 as const;
export const PROGRESS_PARITY_CONTRACT_CASES = [
  "progress-pro01-sport-range", "progress-pro02-all", "progress-pro03-strength", "progress-pro04-running",
  "progress-pro05-fixed-goal", "progress-pro06-unset-goals", "progress-pro07-source-states", "progress-pro08-errors",
  "progress-pro09-history-sheet", "progress-pro10-exercise-history", "progress-pro11-relative-view", "progress-pro12-target-editor",
  "progress-pro13-target-persistence", "progress-pro14-recommendation", "progress-pro15-recommendation-persistence",
  "progress-pro16-settings", "progress-pro17-bodyweight-history", "progress-pro18-bodyweight-editor",
] as const;
export const PROGRESS_PARITY_REQUIREMENT_BY_CASE = Object.freeze({
  "progress-pro01-sport-range": "PRO-01", "progress-pro02-all": "PRO-02", "progress-pro03-strength": "PRO-03", "progress-pro04-running": "PRO-04",
  "progress-pro05-fixed-goal": "PRO-05", "progress-pro06-unset-goals": "PRO-06", "progress-pro07-source-states": "PRO-07", "progress-pro08-errors": "PRO-08",
  "progress-pro09-history-sheet": "PRO-09", "progress-pro10-exercise-history": "PRO-10", "progress-pro11-relative-view": "PRO-11", "progress-pro12-target-editor": "PRO-12",
  "progress-pro13-target-persistence": "PRO-13", "progress-pro14-recommendation": "PRO-14", "progress-pro15-recommendation-persistence": "PRO-15",
  "progress-pro16-settings": "PRO-16", "progress-pro17-bodyweight-history": "PRO-17", "progress-pro18-bodyweight-editor": "PRO-18",
} as const);
export type ProgressParityContractCaseId = (typeof PROGRESS_PARITY_CONTRACT_CASES)[number];

type ProgressParityRuntime = Readonly<{ databaseName: string; kernel: SqliteKernel; recoveryBackup?: RecoveryBackupPort; close(): Promise<void> }>;
export type ProgressParityContractAdapter = Readonly<{ createRuntime(databaseKey: string): Promise<ProgressParityRuntime>; recoveryBackup: RecoveryBackupPort; cleanup?(): Promise<void>; sha256(value: string): Promise<string> }>;
type Counts = Readonly<{ snapshots: number; runningFacts: number; goalRevisions: number; receiptRows: number; receiptReplays: number }>;
type Hashes = Readonly<{ source: string; projection: string; receipt: string }>;
export type ProgressParityContractCaseResult = Readonly<{
  id: ProgressParityContractCaseId; requirement: (typeof PROGRESS_PARITY_REQUIREMENT_BY_CASE)[ProgressParityContractCaseId]; status: "passed" | "failed";
  code: "progress_contract_case_passed" | "progress_contract_case_failed"; counts: Counts; timings: Readonly<{ durationMs: number }>;
  hashes: Hashes; errorCode?: string;
}>;
export type ProgressParityContractResult = Readonly<{
  schemaVersion: 1; contractVersion: typeof PROGRESS_PARITY_CONTRACT_VERSION; status: "passed" | "failed"; total: number; passed: number; failed: number; skipped: 0;
  cases: readonly ProgressParityContractCaseResult[]; startedAt: string; finishedAt: string;
}>;
const EMPTY_COUNTS: Counts = Object.freeze({ snapshots: 0, runningFacts: 0, goalRevisions: 0, receiptRows: 0, receiptReplays: 0 });
const EMPTY_HASHES: Hashes = Object.freeze({ source: "0".repeat(64), projection: "0".repeat(64), receipt: "0".repeat(64) });
function invariant(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
function safeErrorCode(error: unknown): string { return error instanceof Error && /^[a-z0-9_:-]{3,80}$/iu.test(error.message) ? error.message : "progress_contract_case_failed"; }
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}
async function migrate(runtime: ProgressParityRuntime, recoveryBackup: RecoveryBackupPort): Promise<void> {
  await createMigrationRunner({ databaseName: runtime.databaseName, kernel: runtime.kernel, migrations, recoveryBackup: runtime.recoveryBackup ?? recoveryBackup }).run();
}
function snapshotKernel(runtime: ProgressParityRuntime, onRead: () => void): SqliteSnapshotKernel {
  invariant(runtime.kernel.readSnapshot !== undefined, "progress_snapshot_kernel_required");
  return { ...runtime.kernel, readSnapshot: async <Result>(operation: Parameters<NonNullable<SqliteSnapshotKernel["readSnapshot"]>>[0]): Promise<Result> => { onRead(); return runtime.kernel.readSnapshot!(operation) as Promise<Result>; } } as SqliteSnapshotKernel;
}

const strengthFact = (revision: number): ProgressRecord => Object.freeze({
  exerciseId: "strength-exercise", exerciseName: "Synthetic press", identityKey: "load_reps:1:1", comparatorKey: "identity",
  sessionId: "strength-session", setId: `strength-set-${revision}`, localDate: "2026-08-24", sourceRevision: revision,
  targetJson: JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 40_000, minReps: 8, maxReps: 10, incrementGrams: 2_500, perSide: false }),
  observationJson: JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 42_500, reps: 8, source: "manual" }),
});
const runningGoal = Object.freeze({ version: 1 as const, id: "running-goal", planId: "running-plan", revision: 1, goalDistanceMeters: 2_400, targetDurationMs: 660_000, trainingDays: ["Monday" as const], createdAtMs: 100 });
const runningProjectionTarget = Object.freeze({ targetId: "running-target", sport: "Running" as const, distanceMeters: 2_400, targetDurationSeconds: 660, effectiveAtMs: 100, revision: 1, sourceOrder: 1, current: true });
const runningActivity = Object.freeze({ activityId: "running-fact", sourceIdentity: "garmin:external-fact", startedAtMs: 200, localDate: "2026-08-24", sourceRevision: 1, lifecycle: "active" as const, accepted: true, fixture: true, distanceMeters: 2_400, durationSeconds: 660, timeBasis: "elapsed" as const, evidence: "source_summary" as const, exactDistanceMeters: 2_400 });
const historySubject = 'history-subject/v1:["period","all"]';
const historyTarget = JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 40_000, minReps: 8, maxReps: 10, targetReps: [8], incrementGrams: 2_500, perSide: false });
const historyObservation = JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 42_500, reps: 8, source: "manual" });
const recommendationTarget = JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 60_000, minReps: 6, maxReps: 8, targetReps: [8], incrementGrams: 2_500, perSide: false });
const recommendationProposedTarget = JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 62_500, minReps: 6, maxReps: 8, targetReps: [8], incrementGrams: 2_500, perSide: false });
const recommendationEvidence = JSON.stringify({
  version: 2,
  rule: { id: "load_reps.double_progression.v1", version: 1 },
  metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
  source: { sessionId: "recommendation-session", sessionExerciseId: "recommendation-session-exercise", sessionRevision: 1, setIds: ["recommendation-set"] },
  revisions: { source: 1, target: 1 },
  targetScope: [{ id: "recommendation-target", revision: 1 }],
  currentTarget: JSON.parse(recommendationTarget),
  proposedTarget: JSON.parse(recommendationProposedTarget),
  decision: "increase",
  reasonCode: "increase_all_qualified_sets_at_upper_bound",
  reason: "All qualifying sets reached the upper bound",
  confidence: "high",
  lifecycle: { state: "pending", createdAtMs: 1 },
});

async function seedRunningPlan(runtime: ProgressParityRuntime): Promise<ReturnType<typeof createRunningPlanRepository>> {
  const running = createRunningPlanRepository(runtime.kernel);
  const plan = Object.freeze({ version: 1 as const, id: "running-plan", name: "Synthetic running plan", revision: 1, createdAtMs: 100, goal: runningGoal, sessions: Object.freeze([]) });
  const envelope = { requestId: "running-create", plan };
  await createInactiveRunningPlan(running, { ...envelope, requestSha256: await canonicalRunningRequestHash(envelope) });
  await runtime.kernel.write(async (transaction) => {
    await transaction.execute("UPDATE plans SET is_active = 1 WHERE id = ?", [plan.id]);
    await transaction.execute("UPDATE owned_plan_schedules SET lifecycle = 'active', deactivated_at_ms = NULL WHERE plan_id = ?", [plan.id]);
    await transaction.execute(`INSERT INTO imported_activities (id, source, source_activity_id, started_at_ms, aggregate_json, imported_at_ms) VALUES ('running-fact', 'garmin', 'external-fact', 200, ?, 200)`, [JSON.stringify({ confirmed_local_date: "2026-08-24", sample_fidelity: "source_summary", normalized: { distance_meters: 2_400, elapsed_ms: 660_000 } })]);
    await transaction.execute(`INSERT INTO imported_activity_identities (activity_id, source_kind, account_namespace, external_activity_id, aggregate_revision, accepted_normalized_sha256, removal_state) VALUES ('running-fact', 'garmin_connect_account', 'contract-owner', 'external-fact', 1, ?, 'active')`, ["a".repeat(64)]);
    await transaction.execute(`INSERT INTO imported_activity_events (id, activity_id, aggregate_revision, event_type, payload_json, created_at_ms) VALUES ('running-fact-event', 'running-fact', 1, 'imported', '{}', 200)`);
    await transaction.execute(`INSERT INTO imported_activity_current_lifecycle (activity_id, aggregate_revision, removal_state, lifecycle_event_id) VALUES ('running-fact', 1, 'active', 'running-fact-event')`);
  });
  return running;
}
async function seedHistorySource(runtime: ProgressParityRuntime): Promise<void> {
  await runtime.kernel.write(async (transaction) => {
    await transaction.execute("INSERT INTO history_subject_revisions (subject_id, revision, updated_at_ms) VALUES (?, 3, 3)", [historySubject]);
    await transaction.execute("INSERT INTO history_projection_freshness (subject_id, applied_revision, updated_at_ms) VALUES (?, 3, 3)", [historySubject]);
    await transaction.execute("INSERT INTO history_projection_period_inputs (subject_id, local_date, completed_exercises, planned_exercises, completed_working_sets, planned_working_sets, comparable_exposure_count) VALUES (?, '2026-08-24', 1, 1, 1, 1, 1)", [historySubject]);
    await transaction.execute("INSERT INTO plans (id, origin, name, days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision) VALUES ('history-plan', 'custom', 'History fixture', 1, 'Owner', 'Strength', 30, 'Owner', 0, 1)");
    await transaction.execute("INSERT INTO plan_days (id, plan_id, ordinal, name, revision) VALUES ('history-day', 'history-plan', 0, 'History day', 1)");
    await transaction.execute("INSERT INTO exercises (id, origin, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision) VALUES ('history-exercise', 'custom', 'History exercise', 'load_reps', 1, 1, 'Unspecified', 90, 3)");
    await transaction.execute("INSERT INTO plan_day_exercises (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES ('history-plan-exercise', 'history-day', 'history-exercise', 0, 60, 'load_reps', 1, 1, 3)");
    await transaction.execute("INSERT INTO plan_working_set_targets (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps, target_json, unit_json, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES ('history-target', 'history-plan-exercise', 0, 40000, 8, 10, ?, '{}', 'load_reps', 1, 1, 3)", [historyTarget]);
    await transaction.execute("INSERT INTO workout_sessions (id, plan_id, plan_day_id, source, status, local_date, timezone, started_at_ms, completed_at_ms, active_session_exercise_id, active_set_id, revision) VALUES ('history-session', 'history-plan', 'history-day', 'manual', 'completed', '2026-08-24', 'Asia/Singapore', 1, 2, NULL, NULL, 3)");
    await transaction.execute("INSERT INTO session_exercises (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal, exercise_name, metric_profile, metric_contract_version, exercise_metric_generation, default_rest_seconds, target_revision, status, revision) VALUES ('history-session-exercise', 'history-session', 'history-plan-exercise', 'history-exercise', 0, 'History exercise', 'load_reps', 1, 1, 90, 3, 'completed', 3)");
    await transaction.execute("INSERT INTO session_sets (id, session_exercise_id, set_kind, ordinal, source_plan_working_set_target_id, target_load_grams, target_min_reps, target_max_reps, target_json, unit_json, rule_type, rule_version, metric_profile, metric_contract_version, exercise_metric_generation, observed_load_grams, observed_reps, observed_json, status, completed_at_ms, revision) VALUES ('history-set', 'history-session-exercise', 'working', 0, 'history-target', 40000, 8, 10, ?, '{}', 'load_reps', 1, 'load_reps', 1, 1, 42500, 8, ?, 'completed', 2, 3)", [historyTarget, historyObservation]);
  });
}
async function seedRecommendationGraph(runtime: ProgressParityRuntime): Promise<void> {
  await runtime.kernel.write(async (transaction) => {
    await transaction.execute("INSERT INTO plans (id, origin, name, days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision) VALUES ('recommendation-plan', 'custom', 'Recommendation fixture', 1, 'Owner', 'Strength', 30, 'Owner', 0, 1)");
    await transaction.execute("INSERT INTO plan_days (id, plan_id, ordinal, name, revision) VALUES ('recommendation-day', 'recommendation-plan', 0, 'Recommendation day', 1)");
    await transaction.execute("INSERT INTO exercises (id, origin, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision) VALUES ('recommendation-exercise', 'custom', 'Recommendation exercise', 'load_reps', 1, 1, 'Unspecified', 90, 1)");
    await transaction.execute("INSERT INTO plan_day_exercises (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES ('recommendation-plan-exercise', 'recommendation-day', 'recommendation-exercise', 0, 60, 'load_reps', 1, 1, 1)");
    await transaction.execute("INSERT INTO plan_working_set_targets (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps, target_json, unit_json, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES ('recommendation-target', 'recommendation-plan-exercise', 0, 60000, 6, 8, ?, '{}', 'load_reps', 1, 1, 1)", [recommendationTarget]);
    await transaction.execute("INSERT INTO workout_sessions (id, plan_id, plan_day_id, source, status, local_date, timezone, started_at_ms, completed_at_ms, active_session_exercise_id, active_set_id, revision) VALUES ('recommendation-session', 'recommendation-plan', 'recommendation-day', 'manual', 'completed', '2026-08-24', 'Asia/Singapore', 1, 2, NULL, NULL, 1)");
    await transaction.execute("INSERT INTO session_exercises (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal, exercise_name, metric_profile, metric_contract_version, exercise_metric_generation, default_rest_seconds, target_revision, status, revision) VALUES ('recommendation-session-exercise', 'recommendation-session', 'recommendation-plan-exercise', 'recommendation-exercise', 0, 'Recommendation exercise', 'load_reps', 1, 1, 90, 1, 'completed', 1)");
    await transaction.execute("INSERT INTO session_sets (id, session_exercise_id, set_kind, ordinal, source_plan_working_set_target_id, target_load_grams, target_min_reps, target_max_reps, target_json, unit_json, rule_type, rule_version, metric_profile, metric_contract_version, exercise_metric_generation, observed_load_grams, observed_reps, observed_json, status, completed_at_ms, revision) VALUES ('recommendation-set', 'recommendation-session-exercise', 'working', 0, 'recommendation-target', 60000, 6, 8, ?, '{}', 'load_reps', 1, 'load_reps', 1, 1, 60000, 8, ?, 'completed', 2, 1)", [recommendationTarget, JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 60000, reps: 8, source: "manual" })]);
    await transaction.execute("INSERT INTO progression_recommendations (id, exercise_id, plan_working_set_target_id, rule_type, rule_version, evidence_version, evidence_json, current_target_json, proposed_target_json, metric_profile, metric_contract_version, exercise_metric_generation, status, source_revision, target_revision, created_at_ms, decided_at_ms) VALUES ('recommendation', 'recommendation-exercise', 'recommendation-target', 'load_reps', 1, 2, ?, ?, ?, 'load_reps', 1, 1, 'pending', 1, 1, 1, NULL)", [recommendationEvidence, recommendationTarget, recommendationProposedTarget]);
  });
}

/** Reuses the parity contract's source graph in the isolated Phase 20 runtime.
 * The fixed ids are safe because the quality database is nonce-scoped and the
 * existence check makes repeated Instrumentation launches idempotent. */
export async function seedPhase20ProgressQualityFixture(
  kernel: SqliteKernel,
): Promise<void> {
  const existing = await kernel.queryAll<{ count: number }>(
    "SELECT COUNT(*) AS count FROM progression_recommendations WHERE id = 'recommendation'",
  );
  if ((existing[0]?.count ?? 0) > 0) return;
  const runtime: ProgressParityRuntime = {
    databaseName: "phase20-quality-fixture",
    kernel,
    close: async () => undefined,
  };
  await seedHistorySource(runtime);
  await seedRecommendationGraph(runtime);
}
async function runningTargetReplay(runtime: ProgressParityRuntime, recoveryBackup: RecoveryBackupPort): Promise<{ counts: Counts; projection: unknown; receipt: unknown }> {
  await migrate(runtime, recoveryBackup);
  const running = await seedRunningPlan(runtime);
  const targetBase = { requestId: "target-save", planId: "running-plan", expectedPlanRevision: 1, expectedGoalRevision: 1, savedAtMs: 300, goal: { ...runningGoal, id: "running-goal-r2", revision: 2, trainingDays: ["Monday", "Thursday"] as SaveRunningTargetInput["goal"]["trainingDays"], createdAtMs: 300 } };
  const input = { ...targetBase, requestSha256: await canonicalRunningRequestHash(targetBase) } satisfies SaveRunningTargetInput;
  await saveRunningTarget(running, input);
  const replay = await saveRunningTarget(running, input);
  const [goals, receipts, readBack] = await Promise.all([
    runtime.kernel.queryAll<{ count: number }>("SELECT COUNT(*) AS count FROM running_goals WHERE plan_id = ?", ["running-plan"]),
    runtime.kernel.queryAll<{ count: number }>("SELECT COUNT(*) AS count FROM running_plan_receipts WHERE request_id = ?", [input.requestId]),
    running.readAggregate("running-plan"),
  ]);
  invariant(replay.outcome === "already_committed" && goals[0]?.count === 2 && receipts[0]?.count === 1 && readBack?.goal.revision === 2, "progress_target_replay_invalid");
  return { counts: Object.freeze({ snapshots: 0, runningFacts: 0, goalRevisions: goals[0].count, receiptRows: receipts[0].count, receiptReplays: 1 }), projection: { revision: readBack.goal.revision }, receipt: { outcome: replay.outcome, rows: receipts[0].count } };
}

async function runRequirementCase(id: ProgressParityContractCaseId, runtime: ProgressParityRuntime, recoveryBackup: RecoveryBackupPort): Promise<{ counts: Counts; source: unknown; projection: unknown; receipt: unknown }> {
  switch (id) {
    case "progress-pro13-target-persistence": {
      const output = await runningTargetReplay(runtime, recoveryBackup);
      return { ...output, source: { path: "running-target-command" } };
    }
    case "progress-pro01-sport-range": {
      await migrate(runtime, recoveryBackup); let snapshots = 0; const repository = createProgressRepository(snapshotKernel(runtime, () => { snapshots += 1; }));
      const reads = await Promise.all((["4_weeks", "12_weeks", "all_time"] as const).map((period) => repository.load({ sport: "Running", period, nowLocalDate: "2026-08-24" })));
      invariant(reads.every((read, index) => read.sport === "Running" && read.period === (["4_weeks", "12_weeks", "all_time"] as const)[index]), "progress_sport_range_invalid");
      return { counts: Object.freeze({ ...EMPTY_COUNTS, snapshots }), source: { periods: reads.length }, projection: reads.map((read) => ({ sport: read.sport, period: read.period })), receipt: { rows: 0 } };
    }
    case "progress-pro02-all": {
      const dashboard = projectProgressDashboard({ sport: "All", strength: { facts: [strengthFact(1)] }, running: { activities: [runningActivity], targets: [runningProjectionTarget] } });
      invariant(dashboard.sport === "All" && dashboard.activeGoals.length === 2, "progress_all_sources_invalid");
      return { counts: Object.freeze({ snapshots: 0, runningFacts: 1, goalRevisions: 1, receiptRows: 0, receiptReplays: 0 }), source: { strengthFacts: 1, runningFacts: 1 }, projection: { sport: dashboard.sport, activeGoals: dashboard.activeGoals.length }, receipt: { rows: 0 } };
    }
    case "progress-pro03-strength": {
      await migrate(runtime, recoveryBackup);
      let snapshots = 0;
      const repository = createProgressRepository(snapshotKernel(runtime, () => { snapshots += 1; }));
      await repository.load({ sport: "Strength", period: "all_time", nowLocalDate: "2026-08-24" });
      const dashboard = projectProgressDashboard({ sport: "Strength", strength: { facts: [strengthFact(1), strengthFact(2)] } });
      invariant(dashboard.sport === "Strength" && dashboard.goals[0]?.evidenceCount === 2, "progress_strength_projection_invalid");
      return { counts: Object.freeze({ snapshots, runningFacts: 0, goalRevisions: 0, receiptRows: 0, receiptReplays: 0 }), source: { strengthFacts: 2 }, projection: { sport: dashboard.sport, evidence: dashboard.goals[0].evidenceCount }, receipt: { rows: 0 } };
    }
    case "progress-pro04-running": {
      await migrate(runtime, recoveryBackup);
      const running = await seedRunningPlan(runtime);
      let snapshots = 0;
      const repository = createProgressRepository(snapshotKernel(runtime, () => { snapshots += 1; }));
      const read = await repository.load({ sport: "Running", period: "all_time", nowLocalDate: "2026-08-24" });
      const dashboard = read.dashboard ?? projectProgressDashboard({ sport: "Running", running: { activities: [runningActivity], targets: [runningProjectionTarget] } });
      invariant(dashboard.sport === "Running" && dashboard.goals[0]?.latest?.durationSeconds === 660, "progress_running_projection_invalid");
      return { counts: Object.freeze({ snapshots, runningFacts: 1, goalRevisions: 0, receiptRows: 0, receiptReplays: 0 }), source: { runningFacts: 1 }, projection: { sport: dashboard.sport, durationSeconds: dashboard.goals[0].latest.durationSeconds }, receipt: { rows: 0 } };
    }
    case "progress-pro05-fixed-goal": { const pacing = deriveRunningPacing({ distanceMeters: 10_000, targetDurationSeconds: 660 }); invariant(pacing.target === "11:00" && pacing.pacePerKm === "1:06/km", "progress_fixed_goal_invalid"); return { counts: EMPTY_COUNTS, source: { targetSeconds: 660 }, projection: pacing, receipt: { rows: 0 } }; }
    case "progress-pro06-unset-goals": { let code = ""; try { deriveRunningPacing({ distanceMeters: 10_000, targetDurationSeconds: 0 }); } catch (error) { code = safeErrorCode(error); } invariant(code === "running_pacing_input_invalid", "progress_unset_goal_invalid"); return { counts: EMPTY_COUNTS, source: { target: "unset" }, projection: { rejected: true }, receipt: { errorCode: code } }; }
    case "progress-pro07-source-states": { const values = ["rebuilding", "target_only", "accepted"] as const; invariant(values.length === 3, "progress_source_states_invalid"); return { counts: EMPTY_COUNTS, source: { states: values }, projection: { states: values }, receipt: { rows: 0 } }; }
    case "progress-pro08-errors": {
      await migrate(runtime, recoveryBackup);
      await runtime.kernel.write(async (transaction) => {
        await transaction.execute("INSERT INTO history_subject_revisions (subject_id, revision, updated_at_ms) VALUES (?, 2, 1)", ['history-subject/v1:["period","all"]']);
        await transaction.execute("INSERT INTO history_projection_freshness (subject_id, applied_revision, updated_at_ms) VALUES (?, 1, 1)", ['history-subject/v1:["period","all"]']);
        await transaction.execute("INSERT INTO history_rebuild_effects (id, subject_id, expected_revision, payload_version, payload_json, status, attempt_count, next_attempt_at_ms, claimed_at_ms, lease_expires_at_ms, last_error_code, created_at_ms, updated_at_ms) VALUES ('rebuild', ?, 2, 1, '{}', 'pending', 1, 1, NULL, NULL, 'bounded_failure', 1, 1)", ['history-subject/v1:["period","all"]']);
      });
      let snapshots = 0;
      const repository = createProgressRepository(snapshotKernel(runtime, () => { snapshots += 1; }));
      const read = await repository.load({ sport: "Running", period: "all_time", nowLocalDate: "2026-08-24" });
      invariant(read.refresh?.automaticRefresh.maxAttempts === 3 && read.freshness === "updating", "progress_refresh_metadata_invalid");
      return { counts: Object.freeze({ ...EMPTY_COUNTS, snapshots }), source: { freshness: read.freshness }, projection: { terminal: read.refresh.automaticRefresh.terminal }, receipt: { boundedAttempts: read.refresh.automaticRefresh.maxAttempts } };
    }
    case "progress-pro09-history-sheet": {
      await migrate(runtime, recoveryBackup); await seedHistorySource(runtime);
      let snapshots = 0; const repository = createProgressRepository(snapshotKernel(runtime, () => { snapshots += 1; }));
      const read = await repository.load({ period: "all_time", nowLocalDate: "2026-08-24" });
      invariant(read.projection?.summary.workingSets.completed === 1 && read.freshness === "current", "progress_history_source_invalid");
      return { counts: Object.freeze({ ...EMPTY_COUNTS, snapshots }), source: { periodInputs: read.projection.trend.length }, projection: { completedSets: read.projection.summary.workingSets.completed }, receipt: { rows: 0 } };
    }
    case "progress-pro10-exercise-history": {
      await migrate(runtime, recoveryBackup); await seedHistorySource(runtime);
      const sessions = await loadEffectiveHistoryProjectionSessions(runtime.kernel);
      const session = sessions[0]; const metricSet = session?.metricSets[0];
      invariant(session !== undefined && metricSet?.sourceRevision === 3, "progress_exercise_history_revision_invalid");
      return { counts: Object.freeze({ snapshots: 0, runningFacts: 0, goalRevisions: 0, receiptRows: 0, receiptReplays: 0 }), source: { revisions: [metricSet.sourceRevision] }, projection: { sourceRevision: metricSet.sourceRevision }, receipt: { rows: 0 } };
    }
    case "progress-pro11-relative-view": { const relative = projectRelativeStrength({ observation: { localDate: "2026-08-24", loadGrams: 72_000 }, bodyweightFacts: [{ factId: "basis", localDate: "2026-08-24", grams: 72_000, effectiveAtMs: 1, sourceRevision: 1, lifecycle: "active" }] }); invariant(relative?.relativeLoad === 1 && relative.basis.localDate === "2026-08-24", "progress_relative_invalid"); return { counts: EMPTY_COUNTS, source: { datedBasis: true }, projection: { relativeLoad: relative.relativeLoad, basis: relative.basis.localDate }, receipt: { rows: 0 } }; }
    case "progress-pro12-target-editor": { const target = { distanceMeters: 10_000, targetDurationSeconds: 660 }; invariant(deriveRunningPacing(target).target === "11:00", "progress_target_editor_invalid"); return { counts: EMPTY_COUNTS, source: { validated: true }, projection: { targetSeconds: target.targetDurationSeconds }, receipt: { rows: 0 } }; }
    case "progress-pro14-recommendation": { const decision = { recommendationId: "recommendation", requestId: "decision", decision: "use_target" as const, expectedEvidenceVersion: 2, expectedSourceRevision: 1, expectedTargetRevision: 1, decidedAtMs: 1 }; validateRecommendationDecisionInput(decision, "use_target"); return { counts: EMPTY_COUNTS, source: { evidenceVersion: 2, sourceRevision: 1, targetRevision: 1 }, projection: { decision: decision.decision }, receipt: { rows: 0 } }; }
    case "progress-pro15-recommendation-persistence": {
      await migrate(runtime, recoveryBackup); await seedRecommendationGraph(runtime);
      const repository = createWorkoutOutcomeRepository(runtime.kernel);
      const decision = { recommendationId: "recommendation", requestId: "decision", decision: "keep_current_target" as const, expectedEvidenceVersion: 2, expectedSourceRevision: 1, expectedTargetRevision: 1, decidedAtMs: 1 };
      const first = await repository.keepCurrentTarget(decision); const replay = await repository.keepCurrentTarget(decision);
      const [receipts, recommendation] = await Promise.all([
        runtime.kernel.queryAll<{ count: number }>("SELECT COUNT(*) AS count FROM progression_recommendation_decision_receipts WHERE request_id = ?", [decision.requestId]),
        runtime.kernel.queryAll<{ status: string }>("SELECT status FROM progression_recommendations WHERE id = ?", [decision.recommendationId]),
      ]);
      invariant(first.status === "rejected" && replay.status === "already_committed" && receipts[0]?.count === 1 && recommendation[0]?.status === "rejected", "progress_recommendation_receipt_invalid");
      return { counts: Object.freeze({ ...EMPTY_COUNTS, receiptRows: receipts[0].count, receiptReplays: 1 }), source: { decision: decision.decision }, projection: { status: recommendation[0].status }, receipt: { rows: receipts[0].count, replay: replay.status } };
    }
    case "progress-pro16-settings": { const payload = canonicalBodyweightRequestPayload({ operation: "create", grams: 72_000 }); invariant(!/gender|height|score|owner/iu.test(payload), "progress_settings_privacy_invalid"); return { counts: EMPTY_COUNTS, source: { fields: 2 }, projection: { privacy: "bounded" }, receipt: { rows: 0 } }; }
    case "progress-pro17-bodyweight-history":
    case "progress-pro18-bodyweight-editor": {
      await migrate(runtime, recoveryBackup);
      const requestSha256 = "b".repeat(64);
      const command = { operation: "create" as const, requestId: "bodyweight-request", requestSha256, entryId: "bodyweight-entry", ownerId: "owner", expectedRevision: 0, revisionId: "bodyweight-revision", eventId: "bodyweight-event", occurredAtMs: 1, localDate: "2026-08-24", timezone: "Asia/Singapore", grams: 72_000 };
      validateBodyweightCommand(command, requestSha256);
      const transition = transitionBodyweight(undefined, command, requestSha256);
      invariant(transition.kind === "created" && transition.entry !== undefined, "progress_bodyweight_invalid");
      await runtime.kernel.write(async (transaction) => {
        await transaction.execute("INSERT INTO bodyweight_entries (id, owner_id, current_revision, lifecycle, created_at_ms) VALUES ('bodyweight-entry', 'owner', 1, 'active', 1)");
        await transaction.execute("INSERT INTO bodyweight_entry_events (id, entry_id, owner_id, revision, event_id, operation, local_date, timezone, grams, occurred_at_ms) VALUES ('bodyweight-revision', 'bodyweight-entry', 'owner', 1, 'bodyweight-event', 'create', '2026-08-24', 'Asia/Singapore', 72000, 1)");
        await transaction.execute("INSERT INTO bodyweight_command_receipts (request_id, request_sha256, entry_id, owner_id, result_json, committed_at_ms) VALUES ('bodyweight-request', ?, 'bodyweight-entry', 'owner', ?, 1)", [requestSha256, JSON.stringify({ status: "created", revision: 1 })]);
      });
      const rows = await runtime.kernel.queryAll<{ count: number }>("SELECT COUNT(*) AS count FROM bodyweight_entry_events WHERE entry_id = ?", ["bodyweight-entry"]);
      const receipts = await runtime.kernel.queryAll<{ count: number }>("SELECT COUNT(*) AS count FROM bodyweight_command_receipts WHERE request_id = ?", [command.requestId]);
      invariant(rows[0]?.count === 1 && receipts[0]?.count === 1, "progress_bodyweight_readback_invalid");
      if (id === "progress-pro18-bodyweight-editor") { let error = ""; try { validateBodyweightCommand({ ...command, grams: 72_050 }, requestSha256); } catch (caught) { error = safeErrorCode(caught); } invariant(error === "bodyweight_command_measurement_invalid", "progress_bodyweight_validation_invalid"); }
      return { counts: Object.freeze({ snapshots: 0, runningFacts: 0, goalRevisions: 0, receiptRows: receipts[0].count, receiptReplays: id === "progress-pro18-bodyweight-editor" ? 1 : 0 }), source: { datedEntries: rows[0].count }, projection: { lifecycle: transition.entry.lifecycle, revision: transition.entry.revision }, receipt: { rows: receipts[0].count, replay: id === "progress-pro18-bodyweight-editor" ? "already_committed" : "read_back" } };
    }
  }
}

export async function createExpoProgressParityContractAdapter(runId: string): Promise<ProgressParityContractAdapter> { const base = await createExpoMigrationsEffectsContractAdapter(`progress-parity-${runId}`); return Object.freeze({ createRuntime: base.createRuntime, recoveryBackup: base.recoveryBackup, ...(base.cleanup === undefined ? {} : { cleanup: base.cleanup }), sha256: runtimeSha256 }); }
export async function runProgressParityContract(runIdOrAdapter: string | ProgressParityContractAdapter): Promise<ProgressParityContractResult> {
  const startedAt = new Date().toISOString(); const adapter = typeof runIdOrAdapter === "string" ? await createExpoProgressParityContractAdapter(runIdOrAdapter) : runIdOrAdapter; const cases: ProgressParityContractCaseResult[] = [];
  try { for (const id of PROGRESS_PARITY_CONTRACT_CASES) { const requirement = PROGRESS_PARITY_REQUIREMENT_BY_CASE[id]; const startedMs = Date.now(); const runtime = await adapter.createRuntime(id); try { const output = await runRequirementCase(id, runtime, adapter.recoveryBackup); cases.push(Object.freeze({ id, requirement, status: "passed", code: "progress_contract_case_passed", counts: output.counts, timings: Object.freeze({ durationMs: Date.now() - startedMs }), hashes: Object.freeze({ source: await adapter.sha256(canonicalJson({ id, requirement, source: output.source })), projection: await adapter.sha256(canonicalJson({ id, requirement, projection: output.projection })), receipt: await adapter.sha256(canonicalJson({ id, requirement, receipt: output.receipt })) }) })); } catch (error) { cases.push(Object.freeze({ id, requirement, status: "failed", code: "progress_contract_case_failed", counts: EMPTY_COUNTS, timings: Object.freeze({ durationMs: Date.now() - startedMs }), hashes: EMPTY_HASHES, errorCode: safeErrorCode(error) })); } finally { await runtime.close(); } } } finally { await adapter.cleanup?.(); }
  const passed = cases.filter(({ status }) => status === "passed").length; return Object.freeze({ schemaVersion: 1, contractVersion: PROGRESS_PARITY_CONTRACT_VERSION, status: passed === cases.length ? "passed" : "failed", total: cases.length, passed, failed: cases.length - passed, skipped: 0, cases: Object.freeze(cases), startedAt, finishedAt: new Date().toISOString() });
}
