import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const AUTOMATIC_BACKUP_RECEIPT_SCHEMA_STATEMENTS = Object.freeze([
  `CREATE TABLE automatic_backup_receipt_state (
    id INTEGER PRIMARY KEY NOT NULL CHECK(id = 1),
    permission_id TEXT, environment TEXT NOT NULL CHECK(environment IN ('production', 'development-test')),
    connection_generation INTEGER NOT NULL DEFAULT 0 CHECK(connection_generation >= 0),
    writer_epoch INTEGER NOT NULL DEFAULT 0 CHECK(writer_epoch >= 0),
    captured_generation INTEGER, source_digest TEXT CHECK(source_digest IS NULL OR length(source_digest) = 64),
    snapshot_id TEXT CHECK(snapshot_id IS NULL OR length(snapshot_id) BETWEEN 1 AND 128),
    manifest_file_id TEXT, accepted_manifest_etag TEXT,
    candidate_id TEXT CHECK(candidate_id IS NULL OR length(candidate_id) BETWEEN 1 AND 128),
    resumable_location TEXT, resumable_uploaded_bytes INTEGER NOT NULL DEFAULT 0 CHECK(resumable_uploaded_bytes >= 0),
    lease_id TEXT CHECK(lease_id IS NULL OR length(lease_id) BETWEEN 1 AND 128),
    lease_expires_at_ms INTEGER, updated_at_ms INTEGER NOT NULL DEFAULT 0 CHECK(updated_at_ms >= 0)
  ) STRICT`,
  "INSERT INTO automatic_backup_receipt_state(id, environment) SELECT 1, environment FROM automatic_backup_state WHERE id = 1",
  "CREATE INDEX automatic_backup_receipt_lease_idx ON automatic_backup_receipt_state(lease_expires_at_ms)",
] as const);

export const automaticBackupReceiptsMigration: Migration = Object.freeze({
  version: 24,
  name: "automatic-backup-receipts",
  kind: "additive",
  async up(transaction) {
    for (const statement of AUTOMATIC_BACKUP_RECEIPT_SCHEMA_STATEMENTS) {
      await transaction.execute(statement);
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const rows = await transaction.queryAll<{ id: number; environment: string }>(
      "SELECT id, environment FROM automatic_backup_receipt_state",
    );
    if (rows.length !== 1 || rows[0]?.id !== 1
      || (rows[0].environment !== "production" && rows[0].environment !== "development-test")) {
      throw new Error("automatic_backup_receipt_schema_incomplete");
    }
  },
});
