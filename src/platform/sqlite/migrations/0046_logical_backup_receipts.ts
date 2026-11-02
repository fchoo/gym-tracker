import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

const RECEIPT_TABLE = "logical_backup_receipts";

function automaticBackupTrigger(operation: "insert" | "update" | "delete"): string {
  return `CREATE TRIGGER automatic_backup_generation_${RECEIPT_TABLE}_${operation}
    AFTER ${operation.toUpperCase()} ON ${RECEIPT_TABLE} FOR EACH ROW
    BEGIN UPDATE automatic_backup_state
      SET mutation_generation = mutation_generation + 1,
          dirty_since_ms = COALESCE(dirty_since_ms, CAST(strftime('%s','now') AS INTEGER) * 1000)
      WHERE id = 1;
    END`;
}

/**
 * A logical snapshot capture is an owner command, not a best-effort export.
 * Its immutable receipt binds the caller request to the exact collected source
 * digest without putting backup bookkeeping into the portable snapshot itself.
 */
export const logicalBackupReceiptsMigration: Migration = Object.freeze({
  version: 46,
  name: "logical-backup-receipts",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(`CREATE TABLE ${RECEIPT_TABLE} (
      request_id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(request_id)) BETWEEN 1 AND 128),
      request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 = lower(request_sha256)),
      snapshot_id TEXT NOT NULL UNIQUE CHECK(length(trim(snapshot_id)) BETWEEN 1 AND 128),
      snapshot_sha256 TEXT NOT NULL CHECK(length(snapshot_sha256) = 64 AND snapshot_sha256 = lower(snapshot_sha256)),
      total_rows INTEGER NOT NULL CHECK(total_rows >= 1),
      committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0)
    ) STRICT`);
    for (const operation of ["update", "delete"] as const) {
      await transaction.execute(`CREATE TRIGGER ${RECEIPT_TABLE}_immutable_${operation}
        BEFORE ${operation.toUpperCase()} ON ${RECEIPT_TABLE}
        BEGIN SELECT RAISE(ABORT, '${RECEIPT_TABLE}_immutable'); END`);
    }
    for (const operation of ["insert", "update", "delete"] as const) {
      await transaction.execute(automaticBackupTrigger(operation));
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const [table] = await transaction.queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [RECEIPT_TABLE],
    );
    if (table?.name !== RECEIPT_TABLE) throw new Error("logical_backup_receipts_schema_incomplete");
  },
});
