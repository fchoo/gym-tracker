import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

/**
 * Schema 28 shipped only an early, revision-shaped bodyweight record.  Do not
 * reinterpret it: a dated owner measurement needs a stable aggregate root,
 * append-only correction events, and an idempotency receipt in one graph.
 */
export const BODYWEIGHT_SOURCE_HISTORY_TABLES = Object.freeze([
  "bodyweight_entries",
  "bodyweight_entry_events",
  "bodyweight_command_receipts",
] as const);

const statements = [
  `CREATE TABLE bodyweight_entries (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    current_revision INTEGER NOT NULL CHECK(current_revision >= 1),
    lifecycle TEXT NOT NULL CHECK(lifecycle IN ('active', 'deleted')),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    UNIQUE(owner_id, id)
  ) STRICT`,
  `CREATE TABLE bodyweight_entry_events (
    id TEXT PRIMARY KEY NOT NULL,
    entry_id TEXT NOT NULL REFERENCES bodyweight_entries(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    owner_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision >= 1),
    event_id TEXT NOT NULL UNIQUE,
    operation TEXT NOT NULL CHECK(operation IN ('create', 'edit', 'delete', 'restore')),
    local_date TEXT,
    timezone TEXT,
    grams INTEGER,
    occurred_at_ms INTEGER NOT NULL CHECK(occurred_at_ms >= 0),
    UNIQUE(entry_id, revision),
    CHECK((operation IN ('create', 'edit', 'restore') AND local_date IS NOT NULL AND timezone IS NOT NULL AND grams > 0)
      OR (operation = 'delete' AND local_date IS NULL AND timezone IS NULL AND grams IS NULL))
  ) STRICT`,
  `CREATE TABLE bodyweight_command_receipts (
    request_id TEXT PRIMARY KEY NOT NULL,
    request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64),
    entry_id TEXT NOT NULL REFERENCES bodyweight_entries(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    owner_id TEXT NOT NULL,
    result_json TEXT NOT NULL CHECK(json_valid(result_json)),
    committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0)
  ) STRICT`,
  "CREATE INDEX bodyweight_entry_events_history ON bodyweight_entry_events(owner_id, occurred_at_ms DESC, id DESC)",
] as const;

const immutableTables = ["bodyweight_entry_events", "bodyweight_command_receipts"] as const;

export const bodyweightSourceHistoryMigration: Migration = Object.freeze({
  version: 31,
  name: "bodyweight-source-history",
  kind: "additive",
  async up(transaction) {
    for (const statement of statements) await transaction.execute(statement);
    for (const table of immutableTables) {
      await transaction.execute(`CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`);
      await transaction.execute(`CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`);
    }
    for (const table of BODYWEIGHT_SOURCE_HISTORY_TABLES) {
      for (const operation of ["INSERT", "UPDATE", "DELETE"] as const) {
        await transaction.execute(`CREATE TRIGGER automatic_backup_generation_${table}_${operation.toLowerCase()} AFTER ${operation} ON ${table} FOR EACH ROW BEGIN UPDATE automatic_backup_state SET mutation_generation = mutation_generation + 1, dirty_since_ms = COALESCE(dirty_since_ms, CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE id = 1; END`);
      }
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const rows = await transaction.queryAll<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${BODYWEIGHT_SOURCE_HISTORY_TABLES.map(() => "?").join(",")})`,
      BODYWEIGHT_SOURCE_HISTORY_TABLES,
    );
    if (rows.length !== BODYWEIGHT_SOURCE_HISTORY_TABLES.length) {
      throw new Error("bodyweight_source_history_schema_incomplete");
    }
  },
});
