import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

const RECEIPT_TABLE = "running_plan_receipts";
const EVENT_TABLE = "running_plan_events";
const LIFECYCLE_OPERATIONS = "'create','edit','copy','activate','archive','reactivate'";
const LIFECYCLE_EVENTS = "'created','revised','copied','activated','archived','reactivated'";

function automaticBackupTrigger(table: string, operation: "insert" | "update" | "delete"): string {
  return `CREATE TRIGGER automatic_backup_generation_${table}_${operation}
    AFTER ${operation.toUpperCase()} ON ${table} FOR EACH ROW
    BEGIN UPDATE automatic_backup_state
      SET mutation_generation = mutation_generation + 1,
          dirty_since_ms = COALESCE(dirty_since_ms, CAST(strftime('%s','now') AS INTEGER) * 1000)
      WHERE id = 1;
    END`;
}

export const runningPlanLifecycleReceiptsMigration: Migration = Object.freeze({
  version: 38,
  name: "running-plan-lifecycle-receipts",
  kind: "additive",
  async up(transaction) {
    for (const table of [RECEIPT_TABLE, EVENT_TABLE]) {
      for (const operation of ["insert", "update", "delete"] as const) {
        await transaction.execute(`DROP TRIGGER IF EXISTS automatic_backup_generation_${table}_${operation}`);
      }
    }
    for (const operation of ["update", "delete"] as const) {
      await transaction.execute(`DROP TRIGGER IF EXISTS ${EVENT_TABLE}_immutable_${operation}`);
    }
    await transaction.execute(`ALTER TABLE ${RECEIPT_TABLE} RENAME TO ${RECEIPT_TABLE}_legacy`);
    await transaction.execute(`CREATE TABLE ${RECEIPT_TABLE} (
      request_id TEXT PRIMARY KEY NOT NULL,
      request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64),
      operation TEXT NOT NULL CHECK(operation IN (${LIFECYCLE_OPERATIONS})),
      plan_id TEXT NOT NULL REFERENCES running_plans(plan_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      expected_plan_revision INTEGER NOT NULL CHECK(expected_plan_revision >= 0),
      result_json TEXT NOT NULL CHECK(json_valid(result_json)),
      committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0)
    ) STRICT`);
    await transaction.execute(`INSERT INTO ${RECEIPT_TABLE}
      SELECT request_id, request_sha256, operation, plan_id, expected_plan_revision, result_json, committed_at_ms
      FROM ${RECEIPT_TABLE}_legacy`);
    await transaction.execute(`DROP TABLE ${RECEIPT_TABLE}_legacy`);

    await transaction.execute(`ALTER TABLE ${EVENT_TABLE} RENAME TO ${EVENT_TABLE}_legacy`);
    await transaction.execute(`CREATE TABLE ${EVENT_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      plan_id TEXT NOT NULL REFERENCES running_plans(plan_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      event_type TEXT NOT NULL CHECK(event_type IN (${LIFECYCLE_EVENTS})),
      payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
      created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)
    ) STRICT`);
    await transaction.execute(`INSERT INTO ${EVENT_TABLE}
      SELECT id, plan_id, event_type, payload_json, created_at_ms FROM ${EVENT_TABLE}_legacy`);
    await transaction.execute(`DROP TABLE ${EVENT_TABLE}_legacy`);
    for (const operation of ["update", "delete"] as const) {
      await transaction.execute(`CREATE TRIGGER ${EVENT_TABLE}_immutable_${operation}
        BEFORE ${operation.toUpperCase()} ON ${EVENT_TABLE}
        BEGIN SELECT RAISE(ABORT, '${EVENT_TABLE}_immutable'); END`);
    }
    for (const table of [RECEIPT_TABLE, EVENT_TABLE]) {
      for (const operation of ["insert", "update", "delete"] as const) {
        await transaction.execute(automaticBackupTrigger(table, operation));
      }
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const tables = await transaction.queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?)",
      [RECEIPT_TABLE, EVENT_TABLE],
    );
    if (tables.length !== 2) throw new Error("running_plan_lifecycle_receipts_schema_incomplete");
  },
});
