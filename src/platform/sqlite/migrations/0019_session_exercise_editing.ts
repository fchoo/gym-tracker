import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const SESSION_EXERCISE_EDIT_RECEIPTS_TABLE = "workout_session_exercise_edit_receipts" as const;

export const SESSION_EXERCISE_EDITING_SCHEMA_STATEMENTS = [
  "ALTER TABLE workout_sessions ADD COLUMN modified_from_plan INTEGER NOT NULL DEFAULT 0 CHECK(modified_from_plan IN (0, 1))",
  "ALTER TABLE session_exercises ADD COLUMN origin TEXT NOT NULL DEFAULT 'planned' CHECK(origin IN ('planned', 'added'))",
  "ALTER TABLE session_exercises ADD COLUMN display_ordinal INTEGER NOT NULL DEFAULT 0 CHECK(display_ordinal >= 0)",
  "UPDATE session_exercises SET display_ordinal = ordinal",
  "CREATE INDEX session_exercises_session_display_ordinal_idx ON session_exercises(session_id, display_ordinal)",
  `CREATE TABLE workout_session_exercise_edit_receipts (
    request_id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(request_id)) BETWEEN 1 AND 128),
    request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^a-f0-9]*'),
    operation TEXT NOT NULL CHECK(operation IN ('add_exercise')),
    session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE RESTRICT,
    session_exercise_id TEXT NOT NULL REFERENCES session_exercises(id) ON DELETE RESTRICT,
    expected_session_revision INTEGER NOT NULL CHECK(expected_session_revision >= 0),
    result_session_revision INTEGER NOT NULL CHECK(result_session_revision = expected_session_revision + 1),
    result_json TEXT NOT NULL CHECK(json_valid(result_json)),
    committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0)
  ) STRICT`,
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

function normalizedSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").trim();
}

export const sessionExerciseEditingMigration: Migration = Object.freeze({
  version: 19,
  name: "session-exercise-editing",
  kind: "additive",
  async up(transaction) {
    for (const statement of SESSION_EXERCISE_EDITING_SCHEMA_STATEMENTS) {
      await transaction.execute(statement);
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const sessionColumns = await transaction.queryAll<{ name: string; notnull: number }>("PRAGMA table_info(workout_sessions)");
    const exerciseColumns = await transaction.queryAll<{ name: string; notnull: number }>("PRAGMA table_info(session_exercises)");
    if (!sessionColumns.some((column) => column.name === "modified_from_plan" && column.notnull === 1)
      || !exerciseColumns.some((column) => column.name === "origin" && column.notnull === 1)
      || !exerciseColumns.some((column) => column.name === "display_ordinal" && column.notnull === 1)) {
      throw new Error("session_exercise_editing_schema_incomplete");
    }
    const indexes = await transaction.queryAll<{ name: string }>("PRAGMA index_list(session_exercises)");
    if (!indexes.some(({ name }) => name === "session_exercises_session_display_ordinal_idx")) {
      throw new Error("session_exercise_editing_schema_incomplete");
    }
    const objects = await transaction.queryAll<{ name: string; sql: string | null; type: string }>(
      `SELECT name, sql, type FROM sqlite_master WHERE name IN (
        'workout_session_exercise_edit_receipts',
        'workout_session_exercise_edit_receipts_immutable_update',
        'workout_session_exercise_edit_receipts_immutable_delete'
      )`,
    );
    const table = objects.find(({ name, type }) => name === SESSION_EXERCISE_EDIT_RECEIPTS_TABLE && type === "table");
    if (table?.sql === null || table === undefined
      || normalizedSql(table.sql) !== normalizedSql(SESSION_EXERCISE_EDITING_SCHEMA_STATEMENTS[5])) {
      throw new Error("session_exercise_editing_schema_incomplete");
    }
    const foreignKeys = await transaction.queryAll<{ table: string }>("PRAGMA foreign_key_list(workout_session_exercise_edit_receipts)");
    if (foreignKeys.length !== 2 || !foreignKeys.some(({ table }) => table === "workout_sessions")
      || !foreignKeys.some(({ table }) => table === "session_exercises")) {
      throw new Error("session_exercise_editing_schema_incomplete");
    }
    const triggers = objects.filter(({ type }) => type === "trigger");
    if (triggers.length !== 2 || triggers.some(({ name, sql }) => {
      const expected = name.endsWith("_update")
        ? SESSION_EXERCISE_EDITING_SCHEMA_STATEMENTS[6]
        : name.endsWith("_delete") ? SESSION_EXERCISE_EDITING_SCHEMA_STATEMENTS[7] : undefined;
      return expected === undefined || sql === null || normalizedSql(sql) !== normalizedSql(expected);
    })) {
      throw new Error("session_exercise_editing_schema_incomplete");
    }
  },
});
