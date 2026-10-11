import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const IMPORTED_ACTIVITY_REVISION_REVIEW_TABLES = Object.freeze([
  "imported_activity_revision_proposals",
  "imported_activity_revision_decisions",
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

export const importedActivityRevisionReviewsMigration: Migration = Object.freeze({
  version: 43,
  name: "imported-activity-revision-reviews",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(`CREATE TABLE imported_activity_revision_proposals (
      request_id TEXT PRIMARY KEY NOT NULL,
      request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64),
      activity_id TEXT NOT NULL REFERENCES imported_activities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      proposed_revision INTEGER NOT NULL CHECK(proposed_revision >= 2),
      normalized_sha256 TEXT NOT NULL CHECK(length(normalized_sha256) = 64),
      envelope_json TEXT NOT NULL CHECK(json_valid(envelope_json)),
      confirmed_local_date TEXT NOT NULL CHECK(length(confirmed_local_date) = 10),
      created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
      UNIQUE(activity_id, proposed_revision),
      UNIQUE(activity_id, normalized_sha256)
    ) STRICT`);
    await transaction.execute(`CREATE TABLE imported_activity_revision_decisions (
      request_id TEXT PRIMARY KEY NOT NULL,
      request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64),
      activity_id TEXT NOT NULL,
      proposed_revision INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('accept','keep')),
      decided_at_ms INTEGER NOT NULL CHECK(decided_at_ms >= 0),
      UNIQUE(activity_id, proposed_revision),
      FOREIGN KEY(activity_id, proposed_revision)
        REFERENCES imported_activity_revision_proposals(activity_id, proposed_revision)
        ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
    ) STRICT`);
    await transaction.execute("DROP TRIGGER imported_activities_immutable_update");
    await transaction.execute(`CREATE TRIGGER imported_activities_identity_immutable
      BEFORE UPDATE OF id, source, source_activity_id, started_at_ms, imported_at_ms ON imported_activities
      BEGIN SELECT RAISE(ABORT, 'imported_activities_identity_immutable'); END`);
    await transaction.execute("DROP TRIGGER imported_activity_identities_immutable_update");
    await transaction.execute(`CREATE TRIGGER imported_activity_identity_key_immutable
      BEFORE UPDATE OF activity_id, source_kind, account_namespace, external_activity_id, removal_state ON imported_activity_identities
      BEGIN SELECT RAISE(ABORT, 'imported_activity_identity_key_immutable'); END`);
    for (const table of IMPORTED_ACTIVITY_REVISION_REVIEW_TABLES) {
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
      `SELECT name FROM sqlite_master WHERE type = 'table'
       AND name IN ('imported_activity_revision_proposals','imported_activity_revision_decisions')`,
    );
    if (rows.length !== 2) throw new Error("imported_activity_revision_reviews_schema_incomplete");
  },
});
