import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const COMPLETED_SET_CORRECTION_RECEIPTS_TABLE =
  "workout_completed_set_correction_receipts" as const;

const TABLES = [COMPLETED_SET_CORRECTION_RECEIPTS_TABLE] as const;

export const completedSetCorrectionReceiptsMigration: Migration = Object.freeze({
  version: 33,
  name: "completed-set-correction-receipts",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(
      `CREATE TABLE ${COMPLETED_SET_CORRECTION_RECEIPTS_TABLE} (
        request_id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(request_id)) BETWEEN 1 AND 256),
        request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^a-f0-9]*'),
        session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
        set_id TEXT NOT NULL REFERENCES session_sets(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
        expected_session_revision INTEGER NOT NULL CHECK(expected_session_revision >= 0),
        expected_set_revision INTEGER NOT NULL CHECK(expected_set_revision >= 0),
        result_session_revision INTEGER NOT NULL CHECK(result_session_revision = expected_session_revision + 1),
        result_set_revision INTEGER NOT NULL CHECK(result_set_revision = expected_set_revision + 1),
        committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0)
      ) STRICT`,
    );
    await transaction.execute(
      `CREATE INDEX workout_completed_set_correction_receipts_session_committed_idx
       ON ${COMPLETED_SET_CORRECTION_RECEIPTS_TABLE}(session_id, committed_at_ms, request_id)`,
    );
    await transaction.execute(
      `CREATE TRIGGER workout_completed_set_correction_receipts_immutable_update
       BEFORE UPDATE ON ${COMPLETED_SET_CORRECTION_RECEIPTS_TABLE}
       BEGIN SELECT RAISE(ABORT, 'workout_completed_set_correction_receipt_immutable'); END`,
    );
    await transaction.execute(
      `CREATE TRIGGER workout_completed_set_correction_receipts_immutable_delete
       BEFORE DELETE ON ${COMPLETED_SET_CORRECTION_RECEIPTS_TABLE}
       BEGIN SELECT RAISE(ABORT, 'workout_completed_set_correction_receipt_immutable'); END`,
    );
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const rows = await transaction.queryAll<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?)`,
      TABLES,
    );
    if (rows.length !== TABLES.length) {
      throw new Error("completed_set_correction_receipts_schema_incomplete");
    }
  },
});
