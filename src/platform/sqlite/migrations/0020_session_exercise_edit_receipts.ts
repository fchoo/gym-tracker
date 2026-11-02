import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";
import {
  SESSION_EXERCISE_EDIT_RECEIPTS_TABLE,
} from "./0019_session_exercise_editing";

const LEGACY_TABLE = "workout_session_exercise_edit_receipts_v19";
export const SESSION_EXERCISE_REORDER_RECEIPTS_TABLE = "workout_session_exercise_reorder_receipts" as const;

export const SESSION_EXERCISE_EDIT_RECEIPT_SCHEMA_STATEMENTS = [
  `CREATE TABLE workout_session_exercise_edit_receipts (
    request_id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(request_id)) BETWEEN 1 AND 128),
    request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^a-f0-9]*'),
    operation TEXT NOT NULL CHECK(operation IN ('add_exercise', 'replace_exercise', 'remove_exercise')),
    session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE RESTRICT,
    subject_session_exercise_id TEXT NOT NULL CHECK(length(trim(subject_session_exercise_id)) BETWEEN 1 AND 256),
    replacement_session_exercise_id TEXT CHECK(replacement_session_exercise_id IS NULL OR length(trim(replacement_session_exercise_id)) BETWEEN 1 AND 256),
    expected_session_revision INTEGER NOT NULL CHECK(expected_session_revision >= 0),
    result_session_revision INTEGER NOT NULL CHECK(result_session_revision = expected_session_revision + 1),
    result_json TEXT NOT NULL CHECK(json_valid(result_json)),
    committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0),
    CHECK((operation = 'replace_exercise') = (replacement_session_exercise_id IS NOT NULL))
  ) STRICT`,
  "CREATE INDEX workout_session_exercise_edit_receipts_session_committed_request_idx ON workout_session_exercise_edit_receipts(session_id, committed_at_ms, request_id)",
  `CREATE TRIGGER workout_session_exercise_edit_receipts_immutable_update
   BEFORE UPDATE ON workout_session_exercise_edit_receipts
   BEGIN
     SELECT RAISE(ABORT, 'workout_session_exercise_edit_receipt_immutable');
   END`,
  `CREATE TRIGGER workout_session_exercise_edit_receipts_immutable_delete
   BEFORE DELETE ON workout_session_exercise_edit_receipts
   BEGIN
     SELECT RAISE(ABORT, 'workout_session_exercise_edit_receipt_immutable');
   END`,
] as const;

export const SESSION_EXERCISE_REORDER_RECEIPT_SCHEMA_STATEMENTS = [
  `CREATE TABLE workout_session_exercise_reorder_receipts (
    request_id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(request_id)) BETWEEN 1 AND 128),
    request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^a-f0-9]*'),
    operation TEXT NOT NULL CHECK(operation = 'reorder_exercises'),
    session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE RESTRICT,
    ordered_session_exercise_ids_json TEXT NOT NULL CHECK(json_valid(ordered_session_exercise_ids_json) AND json_type(ordered_session_exercise_ids_json) = 'array'),
    expected_session_revision INTEGER NOT NULL CHECK(expected_session_revision >= 0),
    result_session_revision INTEGER NOT NULL CHECK(result_session_revision = expected_session_revision + 1),
    result_json TEXT NOT NULL CHECK(json_valid(result_json)),
    committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0)
  ) STRICT`,
  "CREATE INDEX workout_session_exercise_reorder_receipts_session_committed_request_idx ON workout_session_exercise_reorder_receipts(session_id, committed_at_ms, request_id)",
  `CREATE TRIGGER workout_session_exercise_reorder_receipts_immutable_update
   BEFORE UPDATE ON workout_session_exercise_reorder_receipts
   BEGIN
     SELECT RAISE(ABORT, 'workout_session_exercise_reorder_receipt_immutable');
   END`,
  `CREATE TRIGGER workout_session_exercise_reorder_receipts_immutable_delete
   BEFORE DELETE ON workout_session_exercise_reorder_receipts
   BEGIN
     SELECT RAISE(ABORT, 'workout_session_exercise_reorder_receipt_immutable');
   END`,
] as const;

const COLUMNS = [
  ["request_id", "TEXT", 1, 1],
  ["request_sha256", "TEXT", 1, 0],
  ["operation", "TEXT", 1, 0],
  ["session_id", "TEXT", 1, 0],
  ["subject_session_exercise_id", "TEXT", 1, 0],
  ["replacement_session_exercise_id", "TEXT", 0, 0],
  ["expected_session_revision", "INTEGER", 1, 0],
  ["result_session_revision", "INTEGER", 1, 0],
  ["result_json", "TEXT", 1, 0],
  ["committed_at_ms", "INTEGER", 1, 0],
] as const;

function normalizedSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").trim();
}

export const sessionExerciseEditReceiptsMigration: Migration = Object.freeze({
  version: 20,
  name: "session-exercise-edit-receipts",
  kind: "destructive",
  async up(transaction) {
    await transaction.execute("DROP TRIGGER workout_session_exercise_edit_receipts_immutable_update");
    await transaction.execute("DROP TRIGGER workout_session_exercise_edit_receipts_immutable_delete");
    await transaction.execute(`ALTER TABLE ${SESSION_EXERCISE_EDIT_RECEIPTS_TABLE} RENAME TO ${LEGACY_TABLE}`);
    await transaction.execute(SESSION_EXERCISE_EDIT_RECEIPT_SCHEMA_STATEMENTS[0]);
    await transaction.execute(`INSERT INTO workout_session_exercise_edit_receipts
      (request_id, request_sha256, operation, session_id, subject_session_exercise_id,
       replacement_session_exercise_id, expected_session_revision, result_session_revision,
       result_json, committed_at_ms)
      SELECT request_id, request_sha256, operation, session_id, session_exercise_id,
             NULL, expected_session_revision, result_session_revision, result_json, committed_at_ms
      FROM ${LEGACY_TABLE}`);
    await transaction.execute(`DROP TABLE ${LEGACY_TABLE}`);
    await transaction.execute(SESSION_EXERCISE_EDIT_RECEIPT_SCHEMA_STATEMENTS[1]);
    await transaction.execute(SESSION_EXERCISE_EDIT_RECEIPT_SCHEMA_STATEMENTS[2]);
    await transaction.execute(SESSION_EXERCISE_EDIT_RECEIPT_SCHEMA_STATEMENTS[3]);
    for (const statement of SESSION_EXERCISE_REORDER_RECEIPT_SCHEMA_STATEMENTS) {
      await transaction.execute(statement);
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const columns = await transaction.queryAll<{ name: string; type: string; notnull: number; pk: number }>(
      "PRAGMA table_info(workout_session_exercise_edit_receipts)",
    );
    if (columns.length !== COLUMNS.length || columns.some((column, index) => {
      const expected = COLUMNS[index]!;
      return column.name !== expected[0] || column.type.toUpperCase() !== expected[1]
        || column.notnull !== expected[2] || column.pk !== expected[3];
    })) throw new Error("session_exercise_edit_receipts_schema_incomplete");
    const foreignKeys = await transaction.queryAll<{ table: string }>(
      "PRAGMA foreign_key_list(workout_session_exercise_edit_receipts)",
    );
    if (foreignKeys.length !== 1 || foreignKeys[0]?.table !== "workout_sessions") {
      throw new Error("session_exercise_edit_receipts_schema_incomplete");
    }
    const indexes = await transaction.queryAll<{ name: string }>(
      "PRAGMA index_list(workout_session_exercise_edit_receipts)",
    );
    if (!indexes.some(({ name }) => name === "workout_session_exercise_edit_receipts_session_committed_request_idx")) {
      throw new Error("session_exercise_edit_receipts_schema_incomplete");
    }
    const objects = await transaction.queryAll<{ name: string; sql: string | null; type: string }>(
      `SELECT name, sql, type FROM sqlite_master WHERE name IN (
        'workout_session_exercise_edit_receipts', '${LEGACY_TABLE}',
        'workout_session_exercise_edit_receipts_immutable_update',
        'workout_session_exercise_edit_receipts_immutable_delete',
        'workout_session_exercise_reorder_receipts',
        'workout_session_exercise_reorder_receipts_immutable_update',
        'workout_session_exercise_reorder_receipts_immutable_delete'
      )`,
    );
    const table = objects.find(({ name, type }) => name === SESSION_EXERCISE_EDIT_RECEIPTS_TABLE && type === "table");
    if (table?.sql === null || table === undefined || normalizedSql(table.sql) !== normalizedSql(SESSION_EXERCISE_EDIT_RECEIPT_SCHEMA_STATEMENTS[0])
      || objects.some(({ name }) => name === LEGACY_TABLE)) {
      throw new Error("session_exercise_edit_receipts_schema_incomplete");
    }
    const triggerSql = new Map([
      ["workout_session_exercise_edit_receipts_immutable_update", SESSION_EXERCISE_EDIT_RECEIPT_SCHEMA_STATEMENTS[2]],
      ["workout_session_exercise_edit_receipts_immutable_delete", SESSION_EXERCISE_EDIT_RECEIPT_SCHEMA_STATEMENTS[3]],
    ]);
    const triggers = objects.filter(({ type, name }) => type === "trigger" && name.startsWith("workout_session_exercise_edit_receipts_"));
    if (triggers.length !== triggerSql.size || triggers.some(({ name, sql }) => {
      const expected = triggerSql.get(name);
      return expected === undefined || sql === null || normalizedSql(sql) !== normalizedSql(expected);
    })) throw new Error("session_exercise_edit_receipts_schema_incomplete");
    const reorderColumns = await transaction.queryAll<{ name: string; type: string; notnull: number; pk: number }>("PRAGMA table_info(workout_session_exercise_reorder_receipts)");
    if (reorderColumns.length !== 9 || reorderColumns.some((column, index) => column.name !== ["request_id", "request_sha256", "operation", "session_id", "ordered_session_exercise_ids_json", "expected_session_revision", "result_session_revision", "result_json", "committed_at_ms"][index])) throw new Error("session_exercise_edit_receipts_schema_incomplete");
    const reorderForeignKeys = await transaction.queryAll<{ table: string }>("PRAGMA foreign_key_list(workout_session_exercise_reorder_receipts)");
    const reorderIndexes = await transaction.queryAll<{ name: string }>("PRAGMA index_list(workout_session_exercise_reorder_receipts)");
    const reorderTable = objects.find(({ name, type }) => name === SESSION_EXERCISE_REORDER_RECEIPTS_TABLE && type === "table");
    const reorderTriggers = objects.filter(({ type, name }) => type === "trigger" && name.startsWith("workout_session_exercise_reorder_receipts_"));
    if (reorderForeignKeys.length !== 1 || reorderForeignKeys[0]?.table !== "workout_sessions" || !reorderIndexes.some(({ name }) => name === "workout_session_exercise_reorder_receipts_session_committed_request_idx") || reorderTable?.sql === null || reorderTable === undefined || normalizedSql(reorderTable.sql) !== normalizedSql(SESSION_EXERCISE_REORDER_RECEIPT_SCHEMA_STATEMENTS[0]) || reorderTriggers.length !== 2) throw new Error("session_exercise_edit_receipts_schema_incomplete");
  },
});
