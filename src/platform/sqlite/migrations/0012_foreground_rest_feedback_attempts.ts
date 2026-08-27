import type {
  Migration,
} from "../migrationRunner";
import type {
  SqliteTransactionExecutor,
} from "../sqliteKernel";

export const FOREGROUND_REST_FEEDBACK_ATTEMPTS_SCHEMA_STATEMENTS = [
  `CREATE TABLE foreground_rest_feedback_attempts (
    session_id TEXT NOT NULL
      REFERENCES workout_sessions(id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED,
    rest_revision INTEGER NOT NULL CHECK(rest_revision >= 0),
    enqueued_at_ms INTEGER NOT NULL CHECK(enqueued_at_ms >= 0),
    sound_enabled INTEGER NOT NULL CHECK(sound_enabled IN (0, 1)),
    vibration_enabled INTEGER NOT NULL CHECK(vibration_enabled IN (0, 1)),
    sound_status TEXT NOT NULL
      CHECK(sound_status IN ('pending', 'attempted', 'completed')),
    vibration_status TEXT NOT NULL
      CHECK(vibration_status IN ('pending', 'attempted', 'completed')),
    PRIMARY KEY(session_id, rest_revision)
  ) STRICT`,
  `INSERT INTO foreground_rest_feedback_attempts (
    session_id, rest_revision, enqueued_at_ms, sound_enabled, vibration_enabled,
    sound_status, vibration_status
  )
  SELECT session_id, rest_revision, consumed_at_ms, 0, 0, 'attempted', 'attempted'
  FROM foreground_rest_feedback_consumptions`,
] as const;

async function executeAll(
  transaction: SqliteTransactionExecutor,
  statements: readonly string[],
): Promise<void> {
  for (const statement of statements) {
    await transaction.execute(statement);
  }
}

export const foregroundRestFeedbackAttemptsMigration: Migration = Object.freeze({
  version: 12,
  name: "foreground-rest-feedback-attempts",
  kind: "additive",
  async up(transaction) {
    await executeAll(transaction, FOREGROUND_REST_FEEDBACK_ATTEMPTS_SCHEMA_STATEMENTS);
  },
  async verify(transaction) {
    const [table] = await transaction.queryAll<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name = 'foreground_rest_feedback_attempts'`,
    );
    if (table === undefined) {
      throw new Error("foreground_rest_feedback_attempt_schema_incomplete");
    }
  },
});
