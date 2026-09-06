import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const WORKOUT_REMOVE_RECEIPTS_TABLE = "workout_remove_receipts" as const;

export const WORKOUT_REMOVE_RECEIPT_SCHEMA_STATEMENTS = [
  `CREATE TABLE workout_remove_receipts (
    request_id TEXT PRIMARY KEY NOT NULL CHECK(
      length(trim(request_id)) BETWEEN 1 AND 128
    ),
    request_sha256 TEXT NOT NULL CHECK(
      length(request_sha256) = 64
      AND request_sha256 NOT GLOB '*[^a-f0-9]*'
    ),
    operation TEXT NOT NULL CHECK(
      operation IN ('remove_warmup', 'remove_working_set')
    ),
    session_id TEXT NOT NULL CHECK(
      length(trim(session_id)) BETWEEN 1 AND 128
    ),
    set_id TEXT NOT NULL CHECK(
      length(trim(set_id)) BETWEEN 1 AND 128
    ),
    expected_session_revision INTEGER NOT NULL CHECK(
      expected_session_revision >= 0
    ),
    expected_set_revision INTEGER NOT NULL CHECK(
      expected_set_revision >= 0
    ),
    result_session_revision INTEGER NOT NULL CHECK(
      result_session_revision = expected_session_revision + 1
    ),
    result_json TEXT NOT NULL CHECK(json_valid(result_json)),
    committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0)
  ) STRICT`,
  `CREATE TRIGGER workout_remove_receipts_immutable_update
   BEFORE UPDATE ON workout_remove_receipts
   BEGIN
     SELECT RAISE(ABORT, 'workout_remove_receipt_immutable');
   END`,
  `CREATE TRIGGER workout_remove_receipts_immutable_delete
   BEFORE DELETE ON workout_remove_receipts
   BEGIN
     SELECT RAISE(ABORT, 'workout_remove_receipt_immutable');
   END`,
] as const;

const WORKOUT_REMOVE_RECEIPT_COLUMNS = [
  ["request_id", "TEXT", 1, 1],
  ["request_sha256", "TEXT", 1, 0],
  ["operation", "TEXT", 1, 0],
  ["session_id", "TEXT", 1, 0],
  ["set_id", "TEXT", 1, 0],
  ["expected_session_revision", "INTEGER", 1, 0],
  ["expected_set_revision", "INTEGER", 1, 0],
  ["result_session_revision", "INTEGER", 1, 0],
  ["result_json", "TEXT", 1, 0],
  ["committed_at_ms", "INTEGER", 1, 0],
] as const;

const WORKOUT_REMOVE_RECEIPT_TRIGGER_NAMES = [
  "workout_remove_receipts_immutable_delete",
  "workout_remove_receipts_immutable_update",
] as const;

function normalizedSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").trim();
}

export const workoutRemoveReceiptsMigration: Migration = Object.freeze({
  version: 17,
  name: "workout-remove-receipts",
  kind: "additive",
  async up(transaction) {
    for (const statement of WORKOUT_REMOVE_RECEIPT_SCHEMA_STATEMENTS) {
      await transaction.execute(statement);
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const columns = await transaction.queryAll<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>("PRAGMA table_info(workout_remove_receipts)");
    if (columns.length !== WORKOUT_REMOVE_RECEIPT_COLUMNS.length || columns.some((column, index) => {
      const expected = WORKOUT_REMOVE_RECEIPT_COLUMNS[index]!;
      return column.name !== expected[0]
        || column.type.toUpperCase() !== expected[1]
        || column.notnull !== expected[2]
        || column.pk !== expected[3];
    })) {
      throw new Error("workout_remove_receipts_schema_incomplete");
    }

    const foreignKeys = await transaction.queryAll("PRAGMA foreign_key_list(workout_remove_receipts)");
    if (foreignKeys.length !== 0) {
      throw new Error("workout_remove_receipts_schema_incomplete");
    }

    const objects = await transaction.queryAll<{ name: string; sql: string; type: string }>(
      `SELECT name, sql, type
       FROM sqlite_master
       WHERE name IN (
         'workout_remove_receipts',
         'workout_remove_receipts_immutable_update',
         'workout_remove_receipts_immutable_delete'
       )`,
    );
    const table = objects.find(({ name, type }) => (
      name === WORKOUT_REMOVE_RECEIPTS_TABLE && type === "table"
    ));
    if (table === undefined
      || normalizedSql(table.sql) !== normalizedSql(WORKOUT_REMOVE_RECEIPT_SCHEMA_STATEMENTS[0])) {
      throw new Error("workout_remove_receipts_schema_incomplete");
    }
    const triggerNames = objects
      .filter(({ type }) => type === "trigger")
      .map(({ name }) => name)
      .sort();
    if (triggerNames.length !== WORKOUT_REMOVE_RECEIPT_TRIGGER_NAMES.length
      || triggerNames.some((name, index) => name !== WORKOUT_REMOVE_RECEIPT_TRIGGER_NAMES[index])) {
      throw new Error("workout_remove_receipts_schema_incomplete");
    }
  },
});
