import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const PLAN_EXERCISE_REPLACEMENT_RECEIPTS_TABLE =
  "plan_exercise_replacement_receipts" as const;

const REQUIRED_OBJECTS = Object.freeze([
  PLAN_EXERCISE_REPLACEMENT_RECEIPTS_TABLE,
  "plan_exercise_replacement_receipts_plan_committed_request_idx",
  "plan_exercise_replacement_receipts_immutable_update",
  "plan_exercise_replacement_receipts_immutable_delete",
] as const);

/**
 * Exercise replacement is valid for inactive owner plans that have no schedule.
 * Keep its idempotency receipt independent from optional schedule event history.
 */
export const planExerciseReplacementReceiptsMigration: Migration = Object.freeze({
  version: 47,
  name: "plan-exercise-replacement-receipts",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(
      `CREATE TABLE ${PLAN_EXERCISE_REPLACEMENT_RECEIPTS_TABLE} (
        request_id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(request_id)) BETWEEN 1 AND 128),
        request_sha256 TEXT NOT NULL CHECK(
          length(request_sha256) = 64
          AND request_sha256 NOT GLOB '*[^a-f0-9]*'
        ),
        plan_id TEXT NOT NULL CHECK(length(trim(plan_id)) BETWEEN 1 AND 128),
        source_occurrence_id TEXT NOT NULL CHECK(length(trim(source_occurrence_id)) BETWEEN 1 AND 128),
        replacement_exercise_id TEXT NOT NULL CHECK(length(trim(replacement_exercise_id)) BETWEEN 1 AND 128),
        expected_plan_revision INTEGER NOT NULL CHECK(expected_plan_revision >= 1),
        result_plan_revision INTEGER NOT NULL CHECK(result_plan_revision = expected_plan_revision + 1),
        result_json TEXT NOT NULL CHECK(json_valid(result_json)),
        committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0)
      ) STRICT`,
    );
    await transaction.execute(
      `CREATE INDEX plan_exercise_replacement_receipts_plan_committed_request_idx
       ON ${PLAN_EXERCISE_REPLACEMENT_RECEIPTS_TABLE}
         (plan_id, committed_at_ms, request_id)`,
    );
    for (const operation of ["update", "delete"] as const) {
      await transaction.execute(
        `CREATE TRIGGER plan_exercise_replacement_receipts_immutable_${operation}
         BEFORE ${operation.toUpperCase()}
         ON ${PLAN_EXERCISE_REPLACEMENT_RECEIPTS_TABLE}
         BEGIN
           SELECT RAISE(ABORT, 'plan_exercise_replacement_receipt_immutable');
         END`,
      );
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const objects = await transaction.queryAll<{ name: string }>(
      `SELECT name
       FROM sqlite_master
       WHERE name IN (?, ?, ?, ?)`,
      REQUIRED_OBJECTS,
    );
    if (
      objects.length !== REQUIRED_OBJECTS.length
      || REQUIRED_OBJECTS.some((required) =>
        !objects.some(({ name }) => name === required)
      )
    ) {
      throw new Error("plan_exercise_replacement_receipts_schema_incomplete");
    }
  },
});
