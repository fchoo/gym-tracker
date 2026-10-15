import type { SqliteKernel, SqliteReadTransactionExecutor } from "../platform/sqlite/sqliteKernel";
import { canonicalJson } from "../domains/activities/importContracts";

export const PHASE20_QUALITY_SET_COUNT = 15_000;
export const PHASE20_QUALITY_CORRECTION_COUNT = 200;
export const PHASE20_QUALITY_PLAN_COUNT = 3;

const PREFIX = "phase20-quality-load-";

export type Phase20QualityWorkloadProof = Readonly<{
  producer: "phase20-quality-workload-proof/v1";
  set_count: 15_000;
  correction_count: 200;
  plan_count: 3;
  plan_kinds: readonly ["running", "strength"];
  set_digest_sha256: string;
  correction_digest_sha256: string;
  plan_digest_sha256: string;
  workload_digest_sha256: string;
}>;

type Sha256 = (value: string) => Promise<string>;

async function fixtureCounts(query: SqliteReadTransactionExecutor) {
  const [sets, corrections, plans, kinds] = await Promise.all([
    query.queryAll<{ count: number }>("SELECT COUNT(*) AS count FROM session_sets WHERE id LIKE ?", [`${PREFIX}set-%`]),
    query.queryAll<{ count: number }>("SELECT COUNT(*) AS count FROM history_audit_events WHERE id LIKE ?", [`${PREFIX}correction-%`]),
    query.queryAll<{ count: number }>("SELECT COUNT(*) AS count FROM plans WHERE id LIKE ?", [`${PREFIX}plan-%`]),
    query.queryAll<{ plan_kind: string }>("SELECT DISTINCT plan_kind FROM plans WHERE id LIKE ? ORDER BY plan_kind", [`${PREFIX}plan-%`]),
  ]);
  return Object.freeze({
    set_count: sets[0]?.count ?? -1,
    correction_count: corrections[0]?.count ?? -1,
    plan_count: plans[0]?.count ?? -1,
    plan_kinds: Object.freeze(kinds.map(({ plan_kind }) => plan_kind)),
  });
}

function assertCounts(counts: Awaited<ReturnType<typeof fixtureCounts>>): void {
  if (counts.set_count !== PHASE20_QUALITY_SET_COUNT
    || counts.correction_count !== PHASE20_QUALITY_CORRECTION_COUNT
    || counts.plan_count !== PHASE20_QUALITY_PLAN_COUNT
    || canonicalJson(counts.plan_kinds) !== canonicalJson(["running", "strength"])) {
    throw new Error("phase20_quality_workload_counts_invalid");
  }
}

/** Seeds the declared performance workload into the same migrated SQLite kernel used by the native screens. */
export async function seedPhase20QualityWorkloadFixture(kernel: SqliteKernel): Promise<void> {
  const existing = await fixtureCounts(kernel);
  if (existing.set_count > 0 || existing.correction_count > 0 || existing.plan_count > 0) {
    assertCounts(existing);
    return;
  }
  const target = JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 40_000, minReps: 8, maxReps: 10, incrementGrams: 2_500, perSide: false });
  const observation = JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 40_000, reps: 8, source: "manual" });
  await kernel.write(async (transaction) => {
    await transaction.execute(`INSERT INTO plans
      (id, origin, name, days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision, plan_kind)
      VALUES
      (?, 'custom', 'Phase 20 load strength A', 1, 'Owner', 'Quality workload', 30, 'Owner', 0, 1, 'strength'),
      (?, 'custom', 'Phase 20 load strength B', 1, 'Owner', 'Quality workload', 30, 'Owner', 0, 1, 'strength'),
      (?, 'custom', 'Phase 20 load running', 1, 'Owner', 'Quality workload', 30, 'Owner', 0, 1, 'running')`,
    [`${PREFIX}plan-strength-a`, `${PREFIX}plan-strength-b`, `${PREFIX}plan-running`]);
    await transaction.execute("INSERT INTO running_plans (plan_id, status, revision, created_at_ms) VALUES (?, 'ready', 1, 1)", [`${PREFIX}plan-running`]);
    await transaction.execute("INSERT INTO plan_days (id, plan_id, ordinal, name, revision) VALUES (?, ?, 0, 'Quality day', 1)", [`${PREFIX}day`, `${PREFIX}plan-strength-a`]);
    await transaction.execute("INSERT INTO exercises (id, origin, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision) VALUES (?, 'custom', 'Phase 20 load exercise', 'load_reps', 1, 1, 'Barbell', 90, 1)", [`${PREFIX}exercise`]);
    await transaction.execute("INSERT INTO plan_day_exercises (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES (?, ?, ?, 0, 90, 'load_reps', 1, 1, 1)", [`${PREFIX}plan-exercise`, `${PREFIX}day`, `${PREFIX}exercise`]);
    await transaction.execute("INSERT INTO plan_working_set_targets (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps, target_json, unit_json, metric_profile, metric_contract_version, exercise_metric_generation, revision) VALUES (?, ?, 0, 40000, 8, 10, ?, '{}', 'load_reps', 1, 1, 1)", [`${PREFIX}target`, `${PREFIX}plan-exercise`, target]);
    await transaction.execute("INSERT INTO workout_sessions (id, plan_id, plan_day_id, source, status, local_date, timezone, started_at_ms, completed_at_ms, revision) VALUES (?, ?, ?, 'manual', 'completed', '2026-08-24', 'Asia/Singapore', 1, 2, 201)", [`${PREFIX}session`, `${PREFIX}plan-strength-a`, `${PREFIX}day`]);
    await transaction.execute("INSERT INTO session_exercises (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal, exercise_name, metric_profile, metric_contract_version, exercise_metric_generation, default_rest_seconds, target_revision, status, revision) VALUES (?, ?, ?, ?, 0, 'Phase 20 load exercise', 'load_reps', 1, 1, 90, 1, 'completed', 201)", [`${PREFIX}session-exercise`, `${PREFIX}session`, `${PREFIX}plan-exercise`, `${PREFIX}exercise`]);
    for (let offset = 0; offset < PHASE20_QUALITY_SET_COUNT; offset += 500) {
      const size = Math.min(500, PHASE20_QUALITY_SET_COUNT - offset);
      const placeholders = Array.from({ length: size }, () => "(?, ?, 'working', ?, ?, 40000, 8, 10, ?, '{}', 'load_reps', 1, 'load_reps', 1, 1, 40000, 8, ?, 'completed', 2, ?)").join(",");
      const parameters = Array.from({ length: size }, (_, index) => {
        const sequence = offset + index + 1;
        return [`${PREFIX}set-${String(sequence).padStart(5, "0")}`, `${PREFIX}session-exercise`, sequence - 1,
          `${PREFIX}target`, target, observation, sequence <= PHASE20_QUALITY_CORRECTION_COUNT ? 2 : 1];
      }).flat();
      await transaction.execute(`INSERT INTO session_sets
        (id, session_exercise_id, set_kind, ordinal, source_plan_working_set_target_id, target_load_grams,
         target_min_reps, target_max_reps, target_json, unit_json, rule_type, rule_version, metric_profile,
         metric_contract_version, exercise_metric_generation, observed_load_grams, observed_reps, observed_json,
         status, completed_at_ms, revision) VALUES ${placeholders}`, parameters);
    }
    const correctionRows = Array.from({ length: PHASE20_QUALITY_CORRECTION_COUNT }, () => "(?, ?, ?, 'correction', ?, ?, ?, ?)").join(",");
    const correctionParameters = Array.from({ length: PHASE20_QUALITY_CORRECTION_COUNT }, (_, index) => {
      const sequence = index + 1;
      return [`${PREFIX}correction-${String(sequence).padStart(3, "0")}`, `${PREFIX}session`, sequence + 1,
        `session_sets:${PREFIX}set-${String(sequence).padStart(5, "0")}:observation`, observation,
        JSON.stringify({ ...JSON.parse(observation), reps: 9 }), sequence + 2];
    }).flat();
    await transaction.execute(`INSERT INTO history_audit_events
      (id, session_id, effective_revision, event_type, field_identity, before_json, after_json, occurred_at_ms)
      VALUES ${correctionRows}`, correctionParameters);
  });
  assertCounts(await fixtureCounts(kernel));
}

/** Re-reads the real source tables and binds counts plus ordered facts to stable digests. */
export async function collectPhase20QualityWorkloadProof(input: Readonly<{
  kernel: SqliteKernel;
  sha256: Sha256;
}>): Promise<Phase20QualityWorkloadProof> {
  if (input.kernel.readSnapshot === undefined) throw new Error("phase20_quality_workload_snapshot_unavailable");
  const snapshot = await input.kernel.readSnapshot(async (transaction) => {
    const counts = await fixtureCounts(transaction);
    assertCounts(counts);
    const [sets, corrections, plans] = await Promise.all([
      transaction.queryAll("SELECT id, ordinal, observed_json, revision FROM session_sets WHERE id LIKE ? ORDER BY id", [`${PREFIX}set-%`]),
      transaction.queryAll("SELECT id, effective_revision, field_identity, before_json, after_json, occurred_at_ms FROM history_audit_events WHERE id LIKE ? ORDER BY id", [`${PREFIX}correction-%`]),
      transaction.queryAll("SELECT plan.id, plan.plan_kind, plan.revision, running.status AS running_status, running.revision AS running_revision FROM plans plan LEFT JOIN running_plans running ON running.plan_id = plan.id WHERE plan.id LIKE ? ORDER BY plan.id", [`${PREFIX}plan-%`]),
    ]);
    return { counts, sets, corrections, plans };
  });
  const base = Object.freeze({
    producer: "phase20-quality-workload-proof/v1" as const,
    set_count: PHASE20_QUALITY_SET_COUNT as 15_000,
    correction_count: PHASE20_QUALITY_CORRECTION_COUNT as 200,
    plan_count: PHASE20_QUALITY_PLAN_COUNT as 3,
    plan_kinds: Object.freeze(["running", "strength"] as const),
    set_digest_sha256: await input.sha256(canonicalJson(snapshot.sets)),
    correction_digest_sha256: await input.sha256(canonicalJson(snapshot.corrections)),
    plan_digest_sha256: await input.sha256(canonicalJson(snapshot.plans)),
  });
  return Object.freeze({ ...base, workload_digest_sha256: await input.sha256(canonicalJson(base)) });
}
