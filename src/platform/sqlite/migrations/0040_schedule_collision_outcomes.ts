import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

const TABLES = Object.freeze([
  "schedule_collision_outcomes",
  "schedule_collision_receipts",
  "schedule_collision_projections",
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

/**
 * A collision is an auditable owner decision, not an update to either immutable
 * opportunity.  The projection is intentionally replaceable: it gives current
 * schedule readers the moved/acknowledged intent while the outcome/receipt
 * tables remain append-only source facts.
 */
export const scheduleCollisionOutcomesMigration: Migration = Object.freeze({
  version: 40,
  name: "schedule-collision-outcomes",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(`CREATE TABLE schedule_collision_outcomes (
      id TEXT PRIMARY KEY NOT NULL,
      request_id TEXT NOT NULL UNIQUE,
      request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64),
      choice TEXT NOT NULL CHECK(choice IN ('move_running','move_strength','keep_both')),
      strength_opportunity_id TEXT NOT NULL REFERENCES owned_plan_schedule_opportunities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      strength_schedule_id TEXT NOT NULL REFERENCES owned_plan_schedules(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      strength_schedule_revision INTEGER NOT NULL CHECK(strength_schedule_revision >= 1),
      strength_opportunity_revision INTEGER NOT NULL CHECK(strength_opportunity_revision >= 1),
      running_opportunity_id TEXT NOT NULL REFERENCES running_opportunities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      running_schedule_id TEXT NOT NULL REFERENCES owned_plan_schedules(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      running_schedule_revision INTEGER NOT NULL CHECK(running_schedule_revision >= 1),
      running_opportunity_revision INTEGER NOT NULL CHECK(running_opportunity_revision >= 1),
      shared_local_date TEXT NOT NULL,
      moved_local_date TEXT,
      confirmation_token TEXT NOT NULL,
      committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0),
      CHECK((choice = 'keep_both' AND moved_local_date IS NULL) OR (choice != 'keep_both' AND moved_local_date IS NOT NULL))
    ) STRICT`);
    await transaction.execute(`CREATE TABLE schedule_collision_receipts (
      request_id TEXT PRIMARY KEY NOT NULL REFERENCES schedule_collision_outcomes(request_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64),
      outcome_id TEXT NOT NULL REFERENCES schedule_collision_outcomes(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      result_json TEXT NOT NULL CHECK(json_valid(result_json)),
      committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0)
    ) STRICT`);
    await transaction.execute(`CREATE TABLE schedule_collision_projections (
      outcome_id TEXT PRIMARY KEY NOT NULL REFERENCES schedule_collision_outcomes(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      selected_kind TEXT NOT NULL CHECK(selected_kind IN ('running','strength','none')),
      selected_opportunity_id TEXT,
      effective_local_date TEXT NOT NULL,
      moved_local_date TEXT,
      acknowledged INTEGER NOT NULL CHECK(acknowledged IN (0, 1)),
      rebuilt_at_ms INTEGER NOT NULL CHECK(rebuilt_at_ms >= 0),
      CHECK((selected_kind = 'none' AND selected_opportunity_id IS NULL AND moved_local_date IS NULL AND acknowledged = 1) OR (selected_kind != 'none' AND selected_opportunity_id IS NOT NULL AND moved_local_date IS NOT NULL AND acknowledged = 0))
    ) STRICT`);
    await transaction.execute("CREATE INDEX schedule_collision_outcomes_strength_lookup ON schedule_collision_outcomes(strength_opportunity_id, committed_at_ms)");
    await transaction.execute("CREATE INDEX schedule_collision_outcomes_running_lookup ON schedule_collision_outcomes(running_opportunity_id, committed_at_ms)");
    for (const table of TABLES.slice(0, 2)) {
      for (const operation of ["update", "delete"] as const) {
        await transaction.execute(`CREATE TRIGGER ${table}_immutable_${operation}
          BEFORE ${operation.toUpperCase()} ON ${table}
          BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`);
      }
    }
    for (const table of TABLES) {
      for (const operation of ["insert", "update", "delete"] as const) {
        await transaction.execute(backupTrigger(table, operation));
      }
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const rows = await transaction.queryAll<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${TABLES.map(() => "?").join(",")})`,
      TABLES,
    );
    if (rows.length !== TABLES.length) throw new Error("schedule_collision_outcomes_schema_incomplete");
  },
});
