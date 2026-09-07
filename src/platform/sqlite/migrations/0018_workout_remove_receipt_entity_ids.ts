import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";
import {
  WORKOUT_REMOVE_RECEIPT_SCHEMA_STATEMENTS,
  WORKOUT_REMOVE_RECEIPTS_TABLE,
} from "./0017_workout_remove_receipts";

const LEGACY_TABLE = "workout_remove_receipts_v17";

export const WORKOUT_REMOVE_RECEIPT_ENTITY_ID_SCHEMA_STATEMENTS = [
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
      length(trim(session_id)) BETWEEN 1 AND 256
    ),
    set_id TEXT NOT NULL CHECK(
      length(trim(set_id)) BETWEEN 1 AND 256
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
  WORKOUT_REMOVE_RECEIPT_SCHEMA_STATEMENTS[1],
  WORKOUT_REMOVE_RECEIPT_SCHEMA_STATEMENTS[2],
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

const TRIGGER_SQL_BY_NAME: ReadonlyMap<string, string> = new Map([
  [
    "workout_remove_receipts_immutable_update",
    WORKOUT_REMOVE_RECEIPT_ENTITY_ID_SCHEMA_STATEMENTS[1],
  ],
  [
    "workout_remove_receipts_immutable_delete",
    WORKOUT_REMOVE_RECEIPT_ENTITY_ID_SCHEMA_STATEMENTS[2],
  ],
] as const);

function normalizedSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").trim();
}

export const workoutRemoveReceiptEntityIdsMigration: Migration = Object.freeze({
  version: 18,
  name: "workout-remove-receipt-entity-ids",
  kind: "destructive",
  async up(transaction) {
    await transaction.execute(
      "DROP TRIGGER workout_remove_receipts_immutable_update",
    );
    await transaction.execute(
      "DROP TRIGGER workout_remove_receipts_immutable_delete",
    );
    await transaction.execute(
      `ALTER TABLE ${WORKOUT_REMOVE_RECEIPTS_TABLE} RENAME TO ${LEGACY_TABLE}`,
    );
    await transaction.execute(
      WORKOUT_REMOVE_RECEIPT_ENTITY_ID_SCHEMA_STATEMENTS[0],
    );
    await transaction.execute(
      `INSERT INTO workout_remove_receipts
        (request_id, request_sha256, operation, session_id, set_id,
         expected_session_revision, expected_set_revision,
         result_session_revision, result_json, committed_at_ms)
       SELECT request_id, request_sha256, operation, session_id, set_id,
              expected_session_revision, expected_set_revision,
              result_session_revision, result_json, committed_at_ms
       FROM ${LEGACY_TABLE}`,
    );
    await transaction.execute(`DROP TABLE ${LEGACY_TABLE}`);
    await transaction.execute(
      WORKOUT_REMOVE_RECEIPT_ENTITY_ID_SCHEMA_STATEMENTS[1],
    );
    await transaction.execute(
      WORKOUT_REMOVE_RECEIPT_ENTITY_ID_SCHEMA_STATEMENTS[2],
    );
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const columns = await transaction.queryAll<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>("PRAGMA table_info(workout_remove_receipts)");
    if (columns.length !== WORKOUT_REMOVE_RECEIPT_COLUMNS.length
      || columns.some((column, index) => {
        const expected = WORKOUT_REMOVE_RECEIPT_COLUMNS[index]!;
        return column.name !== expected[0]
          || column.type.toUpperCase() !== expected[1]
          || column.notnull !== expected[2]
          || column.pk !== expected[3];
      })) {
      throw new Error("workout_remove_receipt_entity_ids_schema_incomplete");
    }

    const foreignKeys = await transaction.queryAll(
      "PRAGMA foreign_key_list(workout_remove_receipts)",
    );
    if (foreignKeys.length !== 0) {
      throw new Error("workout_remove_receipt_entity_ids_schema_incomplete");
    }

    const objects = await transaction.queryAll<{
      name: string;
      sql: string;
      type: string;
    }>(
      `SELECT name, sql, type
       FROM sqlite_master
       WHERE name IN (
         'workout_remove_receipts',
         'workout_remove_receipts_v17',
         'workout_remove_receipts_immutable_update',
         'workout_remove_receipts_immutable_delete'
       )`,
    );
    const table = objects.find(({ name, type }) => (
      name === WORKOUT_REMOVE_RECEIPTS_TABLE && type === "table"
    ));
    const legacyTable = objects.find(({ name }) => name === LEGACY_TABLE);
    if (legacyTable !== undefined
      || table === undefined
      || normalizedSql(table.sql) !== normalizedSql(
        WORKOUT_REMOVE_RECEIPT_ENTITY_ID_SCHEMA_STATEMENTS[0],
      )) {
      throw new Error("workout_remove_receipt_entity_ids_schema_incomplete");
    }
    const triggers = objects.filter(({ type }) => type === "trigger");
    if (triggers.length !== TRIGGER_SQL_BY_NAME.size
      || triggers.some(({ name, sql }) => {
        const expectedSql = TRIGGER_SQL_BY_NAME.get(name);
        return expectedSql === undefined
          || normalizedSql(sql) !== normalizedSql(expectedSql);
      })) {
      throw new Error("workout_remove_receipt_entity_ids_schema_incomplete");
    }
  },
});
