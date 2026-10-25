import {
  libraryPlanDeletionKey,
  type LibraryPlanDeletionEligibility,
  type LibraryPlanDeletionPort,
} from "../../../domains/library/planDeletion";
import type { SqliteKernel, SqliteReadTransactionExecutor } from "../sqliteKernel";

/** Every status counts, including sessions hidden by history removal overlays.
 * Definition rows belong to the plan; workout/source links refer to those rows.
 * Keep both legacy and owned occurrence/target identities in the guard.
 * Scheduling outcomes without a session/activity link are not workout use. */
const WORKOUT_LINKS_SQL = `WITH
  days AS (SELECT id FROM plan_days WHERE plan_id = ?1),
  occurrences AS (
    SELECT id FROM plan_day_exercises WHERE plan_day_id IN (SELECT id FROM days)
    UNION SELECT id FROM owned_plan_day_exercises WHERE plan_day_id IN (SELECT id FROM days)
  ),
  targets AS (
    SELECT id FROM plan_working_set_targets WHERE plan_day_exercise_id IN (SELECT id FROM occurrences)
    UNION SELECT id FROM owned_plan_working_set_targets WHERE plan_day_exercise_id IN (SELECT id FROM occurrences)
  ),
  schedules AS (SELECT id FROM owned_plan_schedules WHERE plan_id = ?1),
  versions AS (SELECT id FROM owned_plan_schedule_versions WHERE schedule_id IN (SELECT id FROM schedules)),
  running AS (SELECT id FROM running_opportunities WHERE plan_id = ?1
    OR schedule_id IN (SELECT id FROM schedules)),
  identifiers AS (SELECT ?1 AS id UNION SELECT id FROM days UNION SELECT id FROM occurrences
    UNION SELECT id FROM targets UNION SELECT id FROM schedules UNION SELECT id FROM versions
    UNION SELECT id FROM running),
  snapshots AS (
    SELECT snapshot_json AS value FROM history_session_overlays
    UNION ALL SELECT snapshot_json FROM session_undo_snapshots
    UNION ALL SELECT result_json FROM workout_session_exercise_edit_receipts
    UNION ALL SELECT result_json FROM workout_remove_receipts
  )
SELECT (
  EXISTS (SELECT 1 FROM workout_sessions WHERE plan_id = ?1 OR plan_day_id IN (SELECT id FROM days))
  OR EXISTS (SELECT 1 FROM session_exercises WHERE source_plan_day_exercise_id IN (SELECT id FROM occurrences))
  OR EXISTS (SELECT 1 FROM session_sets WHERE source_plan_working_set_target_id IN (SELECT id FROM targets)
    OR source_owned_plan_working_set_target_id IN (SELECT id FROM targets))
  OR EXISTS (SELECT 1 FROM workout_provenance WHERE plan_id = ?1 OR plan_day_id IN (SELECT id FROM days)
    OR schedule_id IN (SELECT id FROM schedules) OR schedule_version_id IN (SELECT id FROM versions)
    OR opportunity_id IN (SELECT id FROM running))
  OR EXISTS (SELECT 1 FROM workout_session_schedule_links WHERE plan_id = ?1
    OR plan_day_id IN (SELECT id FROM days) OR schedule_id IN (SELECT id FROM schedules)
    OR schedule_version_id IN (SELECT id FROM versions))
  OR EXISTS (SELECT 1 FROM owned_plan_schedule_opportunities
    WHERE (schedule_id IN (SELECT id FROM schedules) OR plan_day_id IN (SELECT id FROM days))
      AND session_id IS NOT NULL)
  OR EXISTS (SELECT 1 FROM running_match_events WHERE opportunity_id IN (SELECT id FROM running))
  OR EXISTS (SELECT 1 FROM running_current_matches WHERE opportunity_id IN (SELECT id FROM running))
  OR EXISTS (SELECT 1 FROM running_activity_match_events WHERE opportunity_id IN (SELECT id FROM running)
    OR prior_opportunity_id IN (SELECT id FROM running))
  OR EXISTS (SELECT 1 FROM running_activity_match_receipts WHERE opportunity_id IN (SELECT id FROM running))
  OR EXISTS (SELECT 1 FROM running_activity_current_matches WHERE opportunity_id IN (SELECT id FROM running))
  OR EXISTS (SELECT 1 FROM imported_activity_references WHERE reference_value IN (SELECT id FROM identifiers))
  OR EXISTS (SELECT 1 FROM snapshots, json_tree(snapshots.value) leaf
    WHERE leaf.type = 'text' AND leaf.atom IN (SELECT id FROM identifiers))
) AS linked`;

function validatePlanId(planId: string): void {
  if (planId.trim().length === 0 || planId.length > 128) throw new Error("library_plan_id_invalid");
}

export async function isLibraryPlanDeleted(
  executor: SqliteReadTransactionExecutor,
  planId: string,
): Promise<boolean> {
  const rows = await executor.queryAll<{ key: string }>(
    "SELECT key FROM app_settings WHERE key = ?", [libraryPlanDeletionKey(planId)],
  );
  return rows.length > 0;
}

export async function assertLibraryPlanNotDeleted(
  executor: SqliteReadTransactionExecutor,
  planId: string,
): Promise<void> {
  if (await isLibraryPlanDeleted(executor, planId)) throw new Error("library_plan_deleted");
}

export async function readLibraryPlanDeletionEligibility(
  executor: SqliteReadTransactionExecutor,
  planId: string,
): Promise<LibraryPlanDeletionEligibility> {
  validatePlanId(planId);
  const [plan] = await executor.queryAll<{ origin: string }>("SELECT origin FROM plans WHERE id = ?", [planId]);
  const reason = plan === undefined ? "not_found"
    : !["custom", "copied"].includes(plan.origin) ? "bundled"
    : await isLibraryPlanDeleted(executor, planId) ? "already_deleted"
    : (await executor.queryAll<{ linked: number }>(WORKOUT_LINKS_SQL, [planId]))[0]?.linked !== 0
      ? "workout_linked" : null;
  return Object.freeze({ planId, eligible: reason === null, reason });
}

/** Logical deletion preserves immutable receipts and plan source graphs.
 * Eligibility, unused schedule retirement and the marker commit together under
 * the exclusive writer. A browse-time eligibility result is never trusted. */
export function createLibraryPlanDeletionPort(
  kernel: SqliteKernel,
  dependencies: Readonly<{ nowMs(): number }>,
): LibraryPlanDeletionPort {
  return Object.freeze({
    readEligibility: (planId) => kernel.readSnapshot === undefined
      ? readLibraryPlanDeletionEligibility(kernel, planId)
      : kernel.readSnapshot((transaction) => readLibraryPlanDeletionEligibility(transaction, planId)),
    deletePlan: ({ planId }) => kernel.write(async (transaction) => {
      const eligibility = await readLibraryPlanDeletionEligibility(transaction, planId);
      if (!eligibility.eligible) return Object.freeze({ outcome: "ineligible" as const, planId, reason: eligibility.reason! });
      const deletedAtMs = dependencies.nowMs();
      if (!Number.isSafeInteger(deletedAtMs) || deletedAtMs < 0) throw new Error("library_plan_deletion_time_invalid");
      await transaction.execute("UPDATE plans SET is_active = 0, revision = revision + 1 WHERE id = ?", [planId]);
      await transaction.execute(`UPDATE owned_plan_schedules SET lifecycle = 'inactive', revision = revision + 1,
        deactivated_at_ms = ? WHERE plan_id = ? AND lifecycle = 'active'`, [deletedAtMs, planId]);
      await transaction.execute(`UPDATE owned_plan_aggregate_states SET lifecycle = 'archived',
        updated_at_ms = ?, archived_at_ms = ? WHERE plan_id = ?`, [deletedAtMs, deletedAtMs, planId]);
      await transaction.execute("UPDATE running_plans SET status = 'retired', revision = revision + 1 WHERE plan_id = ?", [planId]);
      await transaction.execute(`INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms)
        VALUES (?, 1, ?, 1, ?)`, [libraryPlanDeletionKey(planId), JSON.stringify({ version: 1, planId, deletedAtMs }), deletedAtMs]);
      return Object.freeze({ outcome: "deleted" as const, planId });
    }),
  });
}
