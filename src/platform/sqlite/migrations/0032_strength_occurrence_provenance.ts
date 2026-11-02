import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

const TABLES = [
  "workout_session_schedule_links",
  "workout_schedule_reconciliation_receipts",
] as const;

export const strengthOccurrenceProvenanceMigration: Migration = Object.freeze({
  version: 32,
  name: "strength-occurrence-provenance",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(
      `CREATE TABLE workout_session_schedule_links (
        workout_session_id TEXT PRIMARY KEY NOT NULL REFERENCES workout_sessions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
        opportunity_id TEXT NOT NULL REFERENCES owned_plan_schedule_opportunities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
        plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
        plan_day_id TEXT NOT NULL REFERENCES plan_days(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
        schedule_id TEXT NOT NULL REFERENCES owned_plan_schedules(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
        schedule_version_id TEXT NOT NULL REFERENCES owned_plan_schedule_versions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
        local_date TEXT NOT NULL,
        timezone TEXT NOT NULL,
        plan_revision INTEGER NOT NULL CHECK(plan_revision >= 1),
        day_revision INTEGER NOT NULL CHECK(day_revision >= 1),
        schedule_revision INTEGER NOT NULL CHECK(schedule_revision >= 1),
        opportunity_revision INTEGER NOT NULL CHECK(opportunity_revision >= 1),
        created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
        UNIQUE(opportunity_id)
      ) STRICT`,
    );
    await transaction.execute(
      `CREATE TABLE workout_schedule_reconciliation_receipts (
        id TEXT PRIMARY KEY NOT NULL,
        workout_session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
        request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64),
        committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0),
        UNIQUE(workout_session_id, request_sha256)
      ) STRICT`,
    );
    for (const table of TABLES) {
      await transaction.execute(`CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`);
      await transaction.execute(`CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`);
      for (const operation of ["INSERT", "UPDATE", "DELETE"] as const) {
        await transaction.execute(`CREATE TRIGGER automatic_backup_generation_${table}_${operation.toLowerCase()} AFTER ${operation} ON ${table} FOR EACH ROW BEGIN UPDATE automatic_backup_state SET mutation_generation = mutation_generation + 1, dirty_since_ms = COALESCE(dirty_since_ms, CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE id = 1; END`);
      }
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const rows = await transaction.queryAll<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?)`,
      TABLES,
    );
    if (rows.length !== TABLES.length) {
      throw new Error("strength_occurrence_provenance_schema_incomplete");
    }
  },
});
