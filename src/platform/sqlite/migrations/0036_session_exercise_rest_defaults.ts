import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const SESSION_EXERCISE_REST_DEFAULT_RECEIPTS_TABLE =
  "workout_session_exercise_rest_default_receipts" as const;

export const sessionExerciseRestDefaultsMigration: Migration = Object.freeze({
  version: 36,
  name: "session-exercise-rest-defaults",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(
      `ALTER TABLE session_exercises
       ADD COLUMN default_rest_seconds_is_override INTEGER NOT NULL DEFAULT 0
       CHECK(default_rest_seconds_is_override IN (0, 1))`,
    );
    await transaction.execute(
      `CREATE TABLE ${SESSION_EXERCISE_REST_DEFAULT_RECEIPTS_TABLE} (
        request_id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(request_id)) BETWEEN 1 AND 128),
        request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^a-f0-9]*'),
        session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
        session_exercise_id TEXT NOT NULL REFERENCES session_exercises(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
        default_rest_seconds INTEGER NOT NULL CHECK(default_rest_seconds >= 0 AND default_rest_seconds <= 86400),
        expected_session_revision INTEGER NOT NULL CHECK(expected_session_revision >= 0),
        expected_session_exercise_revision INTEGER NOT NULL CHECK(expected_session_exercise_revision >= 0),
        result_session_revision INTEGER NOT NULL CHECK(result_session_revision = expected_session_revision + 1),
        result_session_exercise_revision INTEGER NOT NULL CHECK(result_session_exercise_revision = expected_session_exercise_revision + 1),
        result_json TEXT NOT NULL CHECK(json_valid(result_json)),
        committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0)
      ) STRICT`,
    );
    await transaction.execute(
      `CREATE INDEX workout_session_exercise_rest_default_receipts_session_committed_idx
       ON ${SESSION_EXERCISE_REST_DEFAULT_RECEIPTS_TABLE}(session_id, committed_at_ms, request_id)`,
    );
    await transaction.execute(
      `CREATE TRIGGER workout_session_exercise_rest_default_receipts_immutable_update
       BEFORE UPDATE ON ${SESSION_EXERCISE_REST_DEFAULT_RECEIPTS_TABLE}
       BEGIN SELECT RAISE(ABORT, 'workout_session_exercise_rest_default_receipt_immutable'); END`,
    );
    await transaction.execute(
      `CREATE TRIGGER workout_session_exercise_rest_default_receipts_immutable_delete
       BEFORE DELETE ON ${SESSION_EXERCISE_REST_DEFAULT_RECEIPTS_TABLE}
       BEGIN SELECT RAISE(ABORT, 'workout_session_exercise_rest_default_receipt_immutable'); END`,
    );
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const [table] = await transaction.queryAll<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name = ?`,
      [SESSION_EXERCISE_REST_DEFAULT_RECEIPTS_TABLE],
    );
    const columns = await transaction.queryAll<{ name: string }>(
      "PRAGMA table_info(session_exercises)",
    );
    if (table === undefined
      || !columns.some(({ name }) => name === "default_rest_seconds_is_override")) {
      throw new Error("session_exercise_rest_defaults_schema_incomplete");
    }
  },
});
