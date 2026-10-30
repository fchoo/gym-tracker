import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const RUNNING_ACTIVITY_MATCH_LEDGER_TABLES = Object.freeze([
  "running_activity_match_events",
  "running_activity_match_receipts",
  "running_activity_current_matches",
] as const);

export const runningActivityMatchLedgerMigration: Migration = Object.freeze({
  version: 34,
  name: "running-activity-match-ledger",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(`CREATE TABLE running_activity_match_events (
      id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(id)) BETWEEN 1 AND 256),
      activity_id TEXT NOT NULL REFERENCES imported_activities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      opportunity_id TEXT NOT NULL REFERENCES running_opportunities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      prior_opportunity_id TEXT REFERENCES running_opportunities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      action TEXT NOT NULL CHECK(action IN ('matched','unmatched','reassigned','invalidated')),
      activity_revision INTEGER NOT NULL CHECK(activity_revision >= 1),
      opportunity_revision INTEGER NOT NULL CHECK(opportunity_revision >= 1),
      prior_relation_revision INTEGER NOT NULL CHECK(prior_relation_revision >= 0),
      relation_revision INTEGER NOT NULL CHECK(relation_revision = prior_relation_revision + 1),
      request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^a-f0-9]*'),
      created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)
    ) STRICT`);
    await transaction.execute(`CREATE TABLE running_activity_match_receipts (
      request_id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(request_id)) BETWEEN 1 AND 256),
      request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^a-f0-9]*'),
      activity_id TEXT NOT NULL REFERENCES imported_activities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      opportunity_id TEXT NOT NULL REFERENCES running_opportunities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      relation_revision INTEGER NOT NULL CHECK(relation_revision >= 0),
      result_kind TEXT NOT NULL CHECK(result_kind IN ('matched','unmatched','reassigned','invalidated')),
      committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0)
    ) STRICT`);
    await transaction.execute(`CREATE TABLE running_activity_current_matches (
      opportunity_id TEXT PRIMARY KEY NOT NULL REFERENCES running_opportunities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      activity_id TEXT NOT NULL UNIQUE REFERENCES imported_activities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      relation_revision INTEGER NOT NULL CHECK(relation_revision >= 1),
      event_id TEXT NOT NULL UNIQUE REFERENCES running_activity_match_events(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
    ) STRICT`);
    await transaction.execute("CREATE INDEX running_activity_match_events_activity_revision_idx ON running_activity_match_events(activity_id, relation_revision DESC, id DESC)");
    await transaction.execute("CREATE INDEX running_activity_match_events_opportunity_revision_idx ON running_activity_match_events(opportunity_id, relation_revision DESC, id DESC)");
    for (const table of ["running_activity_match_events", "running_activity_match_receipts"] as const) {
      await transaction.execute(`CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`);
      await transaction.execute(`CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`);
      for (const operation of ["INSERT", "UPDATE", "DELETE"] as const) await transaction.execute(`CREATE TRIGGER automatic_backup_generation_${table}_${operation.toLowerCase()} AFTER ${operation} ON ${table} FOR EACH ROW BEGIN UPDATE automatic_backup_state SET mutation_generation = mutation_generation + 1, dirty_since_ms = COALESCE(dirty_since_ms, CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE id = 1; END`);
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const rows = await transaction.queryAll<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${RUNNING_ACTIVITY_MATCH_LEDGER_TABLES.map(() => "?").join(",")})`, RUNNING_ACTIVITY_MATCH_LEDGER_TABLES);
    if (rows.length !== RUNNING_ACTIVITY_MATCH_LEDGER_TABLES.length) throw new Error("running_activity_match_ledger_schema_incomplete");
  },
});
