import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

/**
 * Schema 29 deliberately leaves schema 28 untouched.  The original tracer
 * persisted a revision as if it were the session identity; this successor
 * introduces stable roots and append-only child revisions for real authoring.
 */
export const RUNNING_SESSION_ROOT_TABLES = Object.freeze([
  "running_session_roots",
  "running_session_slot_roots",
  "running_session_slot_revisions",
  "running_plan_receipts",
  "running_plan_events",
] as const);

const statements = [
  `CREATE TABLE running_session_roots (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT NOT NULL REFERENCES running_plans(plan_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    session_kind TEXT NOT NULL CHECK(session_kind IN ('recovery','long_run','progression','tempo','intervals','hills','fartlek')),
    current_revision INTEGER NOT NULL CHECK(current_revision >= 1),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    UNIQUE(plan_id, session_kind)
  ) STRICT`,
  `CREATE TABLE running_session_slot_roots (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT NOT NULL REFERENCES running_plans(plan_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    weekday TEXT NOT NULL CHECK(weekday IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)
  ) STRICT`,
  `CREATE TABLE running_session_slot_revisions (
    id TEXT PRIMARY KEY NOT NULL,
    slot_root_id TEXT NOT NULL REFERENCES running_session_slot_roots(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    revision INTEGER NOT NULL CHECK(revision >= 1),
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    session_root_id TEXT NOT NULL REFERENCES running_session_roots(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    session_revision_id TEXT NOT NULL REFERENCES running_session_revisions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    UNIQUE(slot_root_id, revision),
    UNIQUE(slot_root_id, ordinal, revision)
  ) STRICT`,
  `CREATE TABLE running_plan_receipts (
    request_id TEXT PRIMARY KEY NOT NULL,
    request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64),
    operation TEXT NOT NULL CHECK(operation IN ('create','edit','copy')),
    plan_id TEXT NOT NULL REFERENCES running_plans(plan_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    expected_plan_revision INTEGER NOT NULL CHECK(expected_plan_revision >= 0),
    result_json TEXT NOT NULL CHECK(json_valid(result_json)),
    committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0)
  ) STRICT`,
  `CREATE TABLE running_plan_events (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT NOT NULL REFERENCES running_plans(plan_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    event_type TEXT NOT NULL CHECK(event_type IN ('created','revised','copied')),
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)
  ) STRICT`,
  "CREATE UNIQUE INDEX running_session_slot_active_ordinal ON running_session_slot_revisions(slot_root_id, ordinal) WHERE revision = 1",
] as const;

const immutable = [
  "running_session_slot_roots",
  "running_session_slot_revisions",
  "running_plan_events",
] as const;

export const runningSessionRootsMigration: Migration = Object.freeze({
  version: 29,
  name: "running-session-stable-roots",
  kind: "additive",
  async up(transaction) {
    for (const statement of statements) await transaction.execute(statement);
    for (const table of immutable) {
      await transaction.execute(`CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`);
      await transaction.execute(`CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`);
    }
    for (const table of RUNNING_SESSION_ROOT_TABLES) {
      for (const operation of ["INSERT", "UPDATE", "DELETE"] as const) {
        await transaction.execute(`CREATE TRIGGER automatic_backup_generation_${table}_${operation.toLowerCase()} AFTER ${operation} ON ${table} FOR EACH ROW BEGIN UPDATE automatic_backup_state SET mutation_generation = mutation_generation + 1, dirty_since_ms = COALESCE(dirty_since_ms, CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE id = 1; END`);
      }
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const rows = await transaction.queryAll<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${RUNNING_SESSION_ROOT_TABLES.map(() => "?").join(",")})`,
      RUNNING_SESSION_ROOT_TABLES,
    );
    if (rows.length !== RUNNING_SESSION_ROOT_TABLES.length) throw new Error("running_session_roots_schema_incomplete");
  },
});
