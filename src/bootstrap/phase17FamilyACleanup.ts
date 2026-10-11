import type { SqliteKernel, SqliteTransactionExecutor } from "../platform/sqlite/sqliteKernel";
import { PHASE17_FAMILY_A_MUTATION_RECEIPTS } from "../testing/contracts/phase17LibraryRunning.contract";

const TOKEN = /^phase17:[a-z0-9-]{16,128}$/u;
const requestIdFor = (caseId: string, fixtureToken: string) =>
  `phase17:${caseId}:${fixtureToken.slice("phase17:".length)}:action`;
const setupRequestIdFor = (
  kind: "owned-plan-create" | "owned-plan-save" | "custom-exercise-create",
  fixtureToken: string,
) =>
  `phase17:fixture:${kind}:${fixtureToken.slice("phase17:".length)}:setup`;

export type Phase17FamilyACleanupManifest = Readonly<{
  version: 1;
  family: "A";
  caseId: string;
  fixtureToken: string;
  /** Durable action receipts are the authority for every action-created row. */
  requestIds: readonly string[];
  /** Seed plus action-created owned plans, captured before teardown. */
  planIds: readonly string[];
  /** Seed plus action-created custom exercises, captured before teardown. */
  exerciseIds: readonly string[];
  scheduleIds: readonly string[];
  scheduleEventIds: readonly string[];
}>;

export type Phase17FamilyACleanupSelectors = Readonly<{
  ownedPlanId: string;
  customExerciseId: string;
}>;

const sorted = (values: readonly string[]) => Object.freeze([...new Set(values)].sort());
const receiptFor = (caseId: string) =>
  PHASE17_FAMILY_A_MUTATION_RECEIPTS.find(([id]) => id === caseId);
const HANDLED_RECEIPT_TABLES = new Set([
  "custom_exercise_mutation_receipts", "metric_profile_migration_events",
  "owned_plan_schedule_events", "starter_plan_activation_requests", "owned_plan_mutation_requests",
]);

/** Compile-time-adjacent guard for the ledger: a new Family A durable receipt
 * cannot land without entering the materializer/teardown handler set. */
export function assertPhase17FamilyACleanupCoverage(): true {
  if (PHASE17_FAMILY_A_MUTATION_RECEIPTS.some(([, table]) => !HANDLED_RECEIPT_TABLES.has(table))) {
    throw new Error("phase17_family_a_cleanup_handler_missing");
  }
  return true;
}

export function createPhase17FamilyACleanupManifest(
  caseId: string,
  fixtureToken: string,
  selectors: Phase17FamilyACleanupSelectors,
): Phase17FamilyACleanupManifest {
  if (!TOKEN.test(fixtureToken)) throw new Error("phase17_family_a_cleanup_token_invalid");
  const receipt = receiptFor(caseId);
  return Object.freeze({
    version: 1,
    family: "A",
    caseId,
    fixtureToken,
    requestIds: Object.freeze(receipt === undefined ? [] : [requestIdFor(caseId, fixtureToken)]),
    planIds: Object.freeze([selectors.ownedPlanId]),
    exerciseIds: Object.freeze([selectors.customExerciseId]),
    scheduleIds: Object.freeze([]),
    scheduleEventIds: Object.freeze([]),
  });
}

function validManifest(manifest: Phase17FamilyACleanupManifest): boolean {
  return manifest.version === 1 && manifest.family === "A" && TOKEN.test(manifest.fixtureToken)
    && manifest.requestIds.length === (receiptFor(manifest.caseId) === undefined ? 0 : 1)
    && (manifest.requestIds.length === 0 || manifest.requestIds[0] === requestIdFor(manifest.caseId, manifest.fixtureToken))
    && manifest.planIds.length >= 1 && manifest.exerciseIds.length >= 1
    && [manifest.requestIds, manifest.planIds, manifest.exerciseIds, manifest.scheduleIds, manifest.scheduleEventIds]
      .every((values) => values.every((value) => typeof value === "string" && value.length > 0));
}

/**
 * Reads only the row addressed by the exact action request ID.  The resulting
 * IDs are persisted into the dev-test action envelope before a guarded delete
 * is attempted, allowing Migration 41 to distinguish this one fixture graph
 * from ordinary immutable product history.
 */
export async function materializePhase17FamilyACleanupManifest(
  kernel: SqliteKernel,
  manifest: Phase17FamilyACleanupManifest,
): Promise<Phase17FamilyACleanupManifest> {
  if (!validManifest(manifest)) throw new Error("phase17_family_a_cleanup_manifest_invalid");
  const requestId = manifest.requestIds[0];
  let planIds = [...manifest.planIds];
  let exerciseIds = [...manifest.exerciseIds];
  let scheduleIds = [...manifest.scheduleIds];
  let scheduleEventIds = [...manifest.scheduleEventIds];
  const receipt = receiptFor(manifest.caseId);
  if (receipt === undefined || requestId === undefined) return manifest;
  if (receipt[1] === "owned_plan_mutation_requests") {
    const [row] = await kernel.queryAll<Readonly<{ source_plan_id: string | null; result_plan_id: string }>>(
      "SELECT source_plan_id, result_plan_id FROM owned_plan_mutation_requests WHERE request_id = ?", [requestId],
    );
    if (row === undefined) throw new Error("phase17_family_a_cleanup_receipt_missing");
    planIds = [...planIds, row.result_plan_id, ...(row.source_plan_id === null ? [] : [row.source_plan_id])];
  } else if (receipt[1] === "starter_plan_activation_requests") {
    const [row] = await kernel.queryAll<Readonly<{ selected_plan_id: string | null; result_plan_id: string; result_schedule_id: string }>>(
      "SELECT selected_plan_id, result_plan_id, result_schedule_id FROM starter_plan_activation_requests WHERE request_id = ?", [requestId],
    );
    if (row === undefined) throw new Error("phase17_family_a_cleanup_receipt_missing");
    planIds = [...planIds, row.result_plan_id, ...(row.selected_plan_id === null ? [] : [row.selected_plan_id])];
    scheduleIds = [...scheduleIds, row.result_schedule_id];
    const events = await kernel.queryAll<Readonly<{ id: string }>>(
      `SELECT id
       FROM owned_plan_schedule_events
       WHERE schedule_id = ?
         AND json_extract(payload_json, '$.requestId') = ?
       ORDER BY id`,
      [row.result_schedule_id, requestId],
    );
    scheduleEventIds = [...scheduleEventIds, ...events.map(({ id }) => id)];
  } else if (receipt[1] === "owned_plan_schedule_events") {
    const eventId = manifest.caseId === "library.schedule-editor"
      ? `schedule-command:${requestId}` : `plan-impact-command:${requestId}`;
    const [row] = await kernel.queryAll<Readonly<{ schedule_id: string; payload_json: string }>>(
      "SELECT schedule_id, payload_json FROM owned_plan_schedule_events WHERE id = ?", [eventId],
    );
    if (row === undefined) throw new Error("phase17_family_a_cleanup_receipt_missing");
    const result = JSON.parse(row.payload_json) as { result?: { planId?: unknown } };
    if (typeof result.result?.planId !== "string") throw new Error("phase17_family_a_cleanup_receipt_invalid");
    planIds = [...planIds, result.result.planId]; scheduleIds = [...scheduleIds, row.schedule_id]; scheduleEventIds = [...scheduleEventIds, eventId];
  } else if (receipt[1] === "metric_profile_migration_events") {
    const [row] = await kernel.queryAll<Readonly<{ exercise_id: string }>>(
      "SELECT exercise_id FROM metric_profile_migration_events WHERE idempotency_key = ?", [requestId],
    );
    if (row === undefined) throw new Error("phase17_family_a_cleanup_receipt_missing");
    exerciseIds = [...exerciseIds, row.exercise_id];
  } else {
    const [row] = await kernel.queryAll<Readonly<{ result_json: string }>>(
      "SELECT result_json FROM custom_exercise_mutation_receipts WHERE request_id = ?", [requestId],
    );
    if (row === undefined) throw new Error("phase17_family_a_cleanup_receipt_missing");
    const result = JSON.parse(row.result_json) as { exercise?: { exerciseId?: unknown }; exerciseId?: unknown };
    const exerciseId = result.exercise?.exerciseId ?? result.exerciseId;
    if (typeof exerciseId !== "string") throw new Error("phase17_family_a_cleanup_receipt_invalid");
    exerciseIds = [...exerciseIds, exerciseId];
  }
  return Object.freeze({ ...manifest, planIds: sorted(planIds), exerciseIds: sorted(exerciseIds), scheduleIds: sorted(scheduleIds), scheduleEventIds: sorted(scheduleEventIds) });
}

const placeholders = (values: readonly string[]) => values.map(() => "?").join(", ");
async function removeByIds(transaction: SqliteTransactionExecutor, table: string, column: string, values: readonly string[]): Promise<void> {
  if (values.length === 0) return;
  await transaction.execute(`DELETE FROM ${table} WHERE ${column} IN (${placeholders(values)})`, values);
}

/** Deletes only IDs previously materialized from the exact action receipt. */
export async function cleanupPhase17FamilyAManifest(
  kernel: SqliteKernel,
  manifest: Phase17FamilyACleanupManifest,
): Promise<void> {
  if (!validManifest(manifest)) throw new Error("phase17_family_a_cleanup_manifest_invalid");
  const exact = await materializePhase17FamilyACleanupManifest(kernel, manifest);
  await kernel.write(async (transaction) => {
    // Receipt/event rows first: they are immutable and/or FK-restrict their product graph.
    await removeByIds(transaction, "custom_exercise_mutation_receipts", "request_id", exact.requestIds);
    await removeByIds(transaction, "metric_profile_migration_events", "idempotency_key", exact.requestIds);
    await removeByIds(transaction, "owned_plan_schedule_events", "id", exact.scheduleEventIds);
    await removeByIds(transaction, "starter_plan_activation_requests", "request_id", exact.requestIds);
    await removeByIds(transaction, "owned_plan_mutation_requests", "request_id", exact.requestIds);
    // Setup is also a real product command. Its exact, token-bound receipts
    // must disappear before the seed graph or logical snapshot is restored.
    await removeByIds(transaction, "custom_exercise_mutation_receipts", "request_id", [setupRequestIdFor("custom-exercise-create", exact.fixtureToken)]);
    await removeByIds(transaction, "owned_plan_mutation_requests", "request_id", [setupRequestIdFor("owned-plan-create", exact.fixtureToken)]);
    await removeByIds(transaction, "owned_plan_mutation_requests", "request_id", [setupRequestIdFor("owned-plan-save", exact.fixtureToken)]);

    // Schedule descendants must precede versions and schedules; all lists are exact manifest IDs.
    await removeByIds(transaction, "owned_plan_schedule_overrides", "schedule_id", exact.scheduleIds);
    await removeByIds(transaction, "owned_plan_schedule_opportunities", "schedule_id", exact.scheduleIds);
    if (exact.scheduleIds.length > 0) {
      await transaction.execute(`DELETE FROM owned_plan_schedule_bindings
        WHERE schedule_version_id IN (SELECT id FROM owned_plan_schedule_versions WHERE schedule_id IN (${placeholders(exact.scheduleIds)}))`, exact.scheduleIds);
    }
    await removeByIds(transaction, "owned_plan_schedule_versions", "schedule_id", exact.scheduleIds);
    await removeByIds(transaction, "owned_plan_schedules", "id", exact.scheduleIds);

    // Rebuildable and dependent plan rows before aggregate state, plan days, and plans.
    if (exact.planIds.length > 0) {
      const plans = placeholders(exact.planIds);
      await transaction.execute(`DELETE FROM owned_plan_starter_sources WHERE plan_id IN (${plans})`, exact.planIds);
      await transaction.execute(`DELETE FROM owned_plan_day_sources WHERE plan_id IN (${plans})`, exact.planIds);
      await transaction.execute(`DELETE FROM owned_plan_occurrence_sources WHERE plan_day_id IN (SELECT id FROM plan_days WHERE plan_id IN (${plans}))`, exact.planIds);
      await transaction.execute(`DELETE FROM owned_plan_warmup_sets WHERE plan_day_exercise_id IN (SELECT id FROM owned_plan_day_exercises WHERE plan_day_id IN (SELECT id FROM plan_days WHERE plan_id IN (${plans})))`, exact.planIds);
      await transaction.execute(`DELETE FROM owned_plan_working_set_targets WHERE plan_day_exercise_id IN (SELECT id FROM owned_plan_day_exercises WHERE plan_day_id IN (SELECT id FROM plan_days WHERE plan_id IN (${plans})))`, exact.planIds);
      await transaction.execute(`DELETE FROM owned_plan_progression_policies WHERE plan_day_exercise_id IN (SELECT id FROM owned_plan_day_exercises WHERE plan_day_id IN (SELECT id FROM plan_days WHERE plan_id IN (${plans})))`, exact.planIds);
      await transaction.execute(`DELETE FROM owned_plan_day_exercises WHERE plan_day_id IN (SELECT id FROM plan_days WHERE plan_id IN (${plans}))`, exact.planIds);
    }
    await removeByIds(transaction, "owned_plan_aggregate_states", "plan_id", exact.planIds);
    await removeByIds(transaction, "plan_schedules", "plan_id", exact.planIds);
    await removeByIds(transaction, "plan_days", "plan_id", exact.planIds);
    await removeByIds(transaction, "plans", "id", exact.planIds);

    // Owner preferences are source facts rather than FK-cascaded library rows.
    // Remove only the fixture manifest's exact exercise preferences before
    // deleting the roots so the logical v8 backup returns to its baseline.
    await removeByIds(transaction, "exercise_owner_preferences", "exercise_id", exact.exerciseIds);
    // Custom-library children cascade from exercise_library_entries/exercises; delete exact roots only.
    await removeByIds(transaction, "exercises", "id", exact.exerciseIds);
  });
}
