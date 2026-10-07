import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const IMPORTED_ACTIVITY_EVIDENCE_TABLES = Object.freeze([
  "imported_activity_identities", "imported_activity_events", "imported_activity_match_invalidations",
] as const);

const statements = [
  `CREATE TABLE imported_activity_identities (
    activity_id TEXT PRIMARY KEY NOT NULL REFERENCES imported_activities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    source_kind TEXT NOT NULL CHECK(source_kind = 'garmin_connect_account'),
    account_namespace TEXT NOT NULL CHECK(length(account_namespace) BETWEEN 1 AND 128),
    external_activity_id TEXT NOT NULL CHECK(length(external_activity_id) BETWEEN 1 AND 128),
    aggregate_revision INTEGER NOT NULL CHECK(aggregate_revision >= 1),
    accepted_normalized_sha256 TEXT NOT NULL CHECK(length(accepted_normalized_sha256) = 64),
    removal_state TEXT NOT NULL CHECK(removal_state IN ('active','removed')),
    UNIQUE(source_kind, account_namespace, external_activity_id)
  ) STRICT`,
  `CREATE TABLE imported_activity_events (
    id TEXT PRIMARY KEY NOT NULL, activity_id TEXT NOT NULL REFERENCES imported_activities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    aggregate_revision INTEGER NOT NULL CHECK(aggregate_revision >= 1), event_type TEXT NOT NULL CHECK(event_type IN ('imported','removed','restored')),
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)
  ) STRICT`,
  `CREATE TABLE imported_activity_match_invalidations (
    id TEXT PRIMARY KEY NOT NULL, activity_id TEXT NOT NULL REFERENCES imported_activities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    aggregate_revision INTEGER NOT NULL CHECK(aggregate_revision >= 1), reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 64), created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    UNIQUE(activity_id, aggregate_revision, reason)
  ) STRICT`,
  "CREATE UNIQUE INDEX imported_activity_receipts_request_id ON imported_activity_receipts(id)",
] as const;

export const importedActivityEvidenceMigration: Migration = Object.freeze({
  version: 30, name: "imported-activity-immutable-evidence", kind: "additive",
  async up(transaction) {
    for (const statement of statements) await transaction.execute(statement);
    for (const table of IMPORTED_ACTIVITY_EVIDENCE_TABLES) {
      await transaction.execute(`CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`);
      await transaction.execute(`CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`);
      for (const operation of ["INSERT", "UPDATE", "DELETE"] as const) await transaction.execute(`CREATE TRIGGER automatic_backup_generation_${table}_${operation.toLowerCase()} AFTER ${operation} ON ${table} FOR EACH ROW BEGIN UPDATE automatic_backup_state SET mutation_generation = mutation_generation + 1, dirty_since_ms = COALESCE(dirty_since_ms, CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE id = 1; END`);
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const rows = await transaction.queryAll<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${IMPORTED_ACTIVITY_EVIDENCE_TABLES.map(() => "?").join(",")})`, IMPORTED_ACTIVITY_EVIDENCE_TABLES);
    if (rows.length !== IMPORTED_ACTIVITY_EVIDENCE_TABLES.length) throw new Error("imported_activity_evidence_schema_incomplete");
  },
});
