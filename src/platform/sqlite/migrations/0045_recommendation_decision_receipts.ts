import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const RECOMMENDATION_DECISION_RECEIPT_TABLES = Object.freeze([
  "progression_recommendation_decision_receipts",
  "owned_progression_recommendation_decision_receipts",
] as const);

function backupTrigger(table: string, operation: "insert" | "update" | "delete"): string {
  return `CREATE TRIGGER automatic_backup_generation_${table}_${operation}
    AFTER ${operation.toUpperCase()} ON ${table} FOR EACH ROW
    BEGIN UPDATE automatic_backup_state
      SET mutation_generation = mutation_generation + 1,
          dirty_since_ms = COALESCE(dirty_since_ms, CAST(strftime('%s','now') AS INTEGER) * 1000)
      WHERE id = 1;
    END`;
}

/** A decision receipt is immutable source history, never actionable evidence. */
export const recommendationDecisionReceiptsMigration: Migration = Object.freeze({
  version: 45,
  name: "recommendation-decision-receipts",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(`CREATE TABLE progression_recommendation_decision_receipts (
      request_id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(request_id)) BETWEEN 1 AND 128),
      request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 = lower(request_sha256)),
      recommendation_id TEXT NOT NULL REFERENCES progression_recommendations(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      decision TEXT NOT NULL CHECK(decision IN ('use_target', 'keep_current_target')),
      result_json TEXT NOT NULL CHECK(json_valid(result_json)),
      committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0)
    ) STRICT`);
    await transaction.execute(`CREATE TABLE owned_progression_recommendation_decision_receipts (
      request_id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(request_id)) BETWEEN 1 AND 128),
      request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 = lower(request_sha256)),
      recommendation_id TEXT NOT NULL REFERENCES owned_progression_recommendations(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      decision TEXT NOT NULL CHECK(decision IN ('use_target', 'keep_current_target')),
      result_json TEXT NOT NULL CHECK(json_valid(result_json)),
      committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0)
    ) STRICT`);
    for (const table of RECOMMENDATION_DECISION_RECEIPT_TABLES) {
      await transaction.execute(`CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table}
        BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`);
      await transaction.execute(`CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table}
        BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`);
      for (const operation of ["insert", "update", "delete"] as const) {
        await transaction.execute(backupTrigger(table, operation));
      }
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const rows = await transaction.queryAll<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?)`,
      RECOMMENDATION_DECISION_RECEIPT_TABLES,
    );
    if (rows.length !== RECOMMENDATION_DECISION_RECEIPT_TABLES.length) {
      throw new Error("recommendation_decision_receipts_schema_incomplete");
    }
  },
});
