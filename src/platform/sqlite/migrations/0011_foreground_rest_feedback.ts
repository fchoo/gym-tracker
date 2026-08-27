import type {
  Migration,
} from "../migrationRunner";
import type {
  SqliteTransactionExecutor,
} from "../sqliteKernel";

export const FOREGROUND_REST_FEEDBACK_SCHEMA_STATEMENTS = [
  `CREATE TABLE foreground_rest_feedback_consumptions (
    session_id TEXT NOT NULL
      REFERENCES workout_sessions(id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED,
    rest_revision INTEGER NOT NULL CHECK(rest_revision >= 0),
    consumed_at_ms INTEGER NOT NULL CHECK(consumed_at_ms >= 0),
    PRIMARY KEY(session_id, rest_revision)
  ) STRICT`,
] as const;

async function executeAll(
  transaction: SqliteTransactionExecutor,
  statements: readonly string[],
): Promise<void> {
  for (const statement of statements) {
    await transaction.execute(statement);
  }
}

export const foregroundRestFeedbackMigration: Migration = Object.freeze({
  version: 11,
  name: "foreground-rest-feedback",
  kind: "additive",
  async up(transaction) {
    await executeAll(transaction, FOREGROUND_REST_FEEDBACK_SCHEMA_STATEMENTS);
  },
  async verify(transaction) {
    const [table] = await transaction.queryAll<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name = 'foreground_rest_feedback_consumptions'`,
    );
    if (table === undefined) {
      throw new Error("foreground_rest_feedback_schema_incomplete");
    }
  },
});
