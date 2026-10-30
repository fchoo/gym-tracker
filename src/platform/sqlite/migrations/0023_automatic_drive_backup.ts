import { LOGICAL_BACKUP_SCHEMA_23_TABLES } from "../../../domains/portability/backupContracts";
import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

const STATE_SQL = `CREATE TABLE automatic_backup_state (
  id INTEGER PRIMARY KEY NOT NULL CHECK(id = 1),
  environment TEXT NOT NULL CHECK(environment IN ('production', 'development-test')),
  permission_id TEXT, display_email TEXT,
  connection_generation INTEGER NOT NULL DEFAULT 0 CHECK(connection_generation >= 0),
  manifest_file_id TEXT, manifest_etag TEXT,
  writer_epoch INTEGER NOT NULL DEFAULT 0 CHECK(writer_epoch >= 0),
  authority_state TEXT NOT NULL DEFAULT 'quarantine' CHECK(authority_state IN ('quarantine', 'active', 'stale_writer', 'deleted')),
  mutation_generation INTEGER NOT NULL DEFAULT 0 CHECK(mutation_generation >= 0),
  backed_up_generation INTEGER NOT NULL DEFAULT 0 CHECK(backed_up_generation >= 0 AND backed_up_generation <= mutation_generation),
  dirty_since_ms INTEGER, last_attempt_ms INTEGER, last_success_ms INTEGER,
  data_use_policy TEXT NOT NULL DEFAULT 'any-network' CHECK(data_use_policy IN ('any-network', 'wifi-only')),
  status_code TEXT NOT NULL DEFAULT 'idle' CHECK(length(status_code) <= 96), error_code TEXT CHECK(error_code IS NULL OR length(error_code) <= 96),
  claim_id TEXT, claim_expires_at_ms INTEGER
) STRICT`;
const ADOPTION_SQL = `CREATE TABLE automatic_backup_namespace_adoption (
  receipt_id TEXT PRIMARY KEY NOT NULL CHECK(length(receipt_id) BETWEEN 1 AND 128),
  permission_id TEXT NOT NULL, environment TEXT NOT NULL CHECK(environment IN ('production', 'development-test')),
  old_namespace TEXT NOT NULL CHECK(length(old_namespace) = 32), new_namespace TEXT NOT NULL CHECK(length(new_namespace) = 32),
  local_fingerprint TEXT NOT NULL CHECK(length(local_fingerprint) = 64), remote_snapshot_sha256 TEXT NOT NULL CHECK(length(remote_snapshot_sha256) = 64),
  expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms >= 0), consumed_at_ms INTEGER
) STRICT`;
function trigger(table: string, operation: "INSERT" | "UPDATE" | "DELETE"): string {
  return `CREATE TRIGGER automatic_backup_generation_${table}_${operation.toLowerCase()}
    AFTER ${operation} ON ${table} FOR EACH ROW
    BEGIN UPDATE automatic_backup_state SET mutation_generation = mutation_generation + 1,
      dirty_since_ms = COALESCE(dirty_since_ms, CAST(strftime('%s','now') AS INTEGER) * 1000)
      WHERE id = 1; END`;
}
export const AUTOMATIC_BACKUP_GENERATION_TRIGGER_STATEMENTS = Object.freeze(
  LOGICAL_BACKUP_SCHEMA_23_TABLES.flatMap((table) => [trigger(table, "INSERT"), trigger(table, "UPDATE"), trigger(table, "DELETE")]),
);
const ADOPTION_TRIGGER = `CREATE TRIGGER portable_owner_identity_adoption_only
  BEFORE UPDATE OF owner_namespace ON portable_owner_identity FOR EACH ROW
  WHEN NEW.owner_namespace <> OLD.owner_namespace AND NOT EXISTS (
    SELECT 1 FROM automatic_backup_namespace_adoption receipt
    WHERE receipt.old_namespace = OLD.owner_namespace AND receipt.new_namespace = NEW.owner_namespace
      AND receipt.consumed_at_ms IS NULL AND receipt.expires_at_ms >= CAST(strftime('%s','now') AS INTEGER) * 1000
  ) BEGIN SELECT RAISE(ABORT, 'portable_identity_immutable'); END`;
export const automaticDriveBackupMigration: Migration = Object.freeze({
  version: 23, name: "automatic-drive-backup", kind: "additive",
  async up(transaction) {
    await transaction.execute(STATE_SQL);
    await transaction.execute("INSERT INTO automatic_backup_state(id, environment) VALUES (1, 'production')");
    await transaction.execute(ADOPTION_SQL);
    await transaction.execute("DROP TRIGGER portable_owner_identity_immutable");
    await transaction.execute(ADOPTION_TRIGGER);
    for (const statement of AUTOMATIC_BACKUP_GENERATION_TRIGGER_STATEMENTS) await transaction.execute(statement);
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const state = await transaction.queryAll<{ id: number; mutation_generation: number; backed_up_generation: number }>("SELECT id, mutation_generation, backed_up_generation FROM automatic_backup_state");
    if (state.length !== 1 || state[0]?.id !== 1 || state[0].mutation_generation < state[0].backed_up_generation) throw new Error("automatic_backup_schema_incomplete");
    const triggers = await transaction.queryAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'automatic_backup_generation_%'");
    if (triggers.length !== AUTOMATIC_BACKUP_GENERATION_TRIGGER_STATEMENTS.length) throw new Error("automatic_backup_schema_incomplete");
  },
});
