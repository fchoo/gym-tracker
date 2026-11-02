import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const IMPORTED_ACTIVITY_LIFECYCLE_STATE_TABLE = "imported_activity_current_lifecycle" as const;

export const importedActivityLifecycleStateMigration: Migration = Object.freeze({
  version: 35,
  name: "imported-activity-lifecycle-state",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(`CREATE TABLE ${IMPORTED_ACTIVITY_LIFECYCLE_STATE_TABLE} (
      activity_id TEXT PRIMARY KEY NOT NULL REFERENCES imported_activities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      aggregate_revision INTEGER NOT NULL CHECK(aggregate_revision >= 1),
      removal_state TEXT NOT NULL CHECK(removal_state IN ('active','removed')),
      lifecycle_event_id TEXT NOT NULL REFERENCES imported_activity_events(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
    ) STRICT`);
    await transaction.execute(`INSERT INTO ${IMPORTED_ACTIVITY_LIFECYCLE_STATE_TABLE}(activity_id, aggregate_revision, removal_state, lifecycle_event_id)
      SELECT identity.activity_id, identity.aggregate_revision, identity.removal_state, event.id
      FROM imported_activity_identities identity
      JOIN imported_activity_events event ON event.activity_id = identity.activity_id
      WHERE event.id = (SELECT latest.id FROM imported_activity_events latest WHERE latest.activity_id = identity.activity_id ORDER BY latest.created_at_ms DESC, latest.id DESC LIMIT 1)`);
    await transaction.execute(`CREATE TRIGGER automatic_backup_generation_${IMPORTED_ACTIVITY_LIFECYCLE_STATE_TABLE}_insert AFTER INSERT ON ${IMPORTED_ACTIVITY_LIFECYCLE_STATE_TABLE} FOR EACH ROW BEGIN UPDATE automatic_backup_state SET mutation_generation = mutation_generation + 1, dirty_since_ms = COALESCE(dirty_since_ms, CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE id = 1; END`);
    await transaction.execute(`CREATE TRIGGER automatic_backup_generation_${IMPORTED_ACTIVITY_LIFECYCLE_STATE_TABLE}_update AFTER UPDATE ON ${IMPORTED_ACTIVITY_LIFECYCLE_STATE_TABLE} FOR EACH ROW BEGIN UPDATE automatic_backup_state SET mutation_generation = mutation_generation + 1, dirty_since_ms = COALESCE(dirty_since_ms, CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE id = 1; END`);
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const rows = await transaction.queryAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [IMPORTED_ACTIVITY_LIFECYCLE_STATE_TABLE]);
    if (rows.length !== 1) throw new Error("imported_activity_lifecycle_state_schema_incomplete");
  },
});
