import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

const TABLE = "custom_exercise_mutation_receipts";
const exactFixtureEnvelopeRequest = `EXISTS (
  SELECT 1 FROM app_settings envelope
  JOIN json_each(envelope.value_json, '$.cleanupManifest.requestIds') item
  WHERE envelope.key = 'development-test.phase17.action-envelope.v1'
    AND json_extract(envelope.value_json, '$.version') = 3
    AND json_extract(envelope.value_json, '$.cleanupManifest.family') = 'A'
    AND item.value = OLD.request_id
)`;

function backupTrigger(operation: "insert" | "update" | "delete"): string {
  return `CREATE TRIGGER automatic_backup_generation_${TABLE}_${operation}
    AFTER ${operation.toUpperCase()} ON ${TABLE} FOR EACH ROW
    BEGIN UPDATE automatic_backup_state
      SET mutation_generation = mutation_generation + 1,
          dirty_since_ms = COALESCE(dirty_since_ms, CAST(strftime('%s','now') AS INTEGER) * 1000)
      WHERE id = 1;
    END`;
}

/**
 * Custom-library writes previously replayed only while the repository object
 * remained alive. Persist their idempotency boundary with the mutation so a
 * retry after an app restart, backup restore, or Phase 17 fixture probe sees
 * the exact command and its committed result.
 */
export const customExerciseMutationReceiptsMigration: Migration = Object.freeze({
  version: 42,
  name: "custom-exercise-mutation-receipts",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(`CREATE TABLE ${TABLE} (
      request_id TEXT PRIMARY KEY NOT NULL,
      mutation_kind TEXT NOT NULL CHECK(mutation_kind IN ('create', 'edit', 'hidden', 'favorite', 'copy', 'archive')),
      request_json TEXT NOT NULL CHECK(json_valid(request_json)),
      result_json TEXT NOT NULL CHECK(json_valid(result_json)),
      committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0)
    ) STRICT`);
    for (const operation of ["insert", "update", "delete"] as const) {
      await transaction.execute(backupTrigger(operation));
    }
    await transaction.execute(`CREATE TRIGGER ${TABLE}_phase17_fixture_delete
      BEFORE DELETE ON ${TABLE}
      WHEN NOT (${exactFixtureEnvelopeRequest}
        OR OLD.request_id GLOB 'phase17:fixture:custom-exercise-create:*:setup')
      BEGIN SELECT RAISE(ABORT, '${TABLE}_immutable'); END`);
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const rows = await transaction.queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [TABLE],
    );
    if (rows.length !== 1) throw new Error("custom_exercise_mutation_receipts_schema_incomplete");
  },
});
