import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

/**
 * Phase 13 is deliberately a single destructive boundary.  The prior schema
 * made plan activation globally singleton; this successor makes the sport a
 * durable source fact and installs every new source table before any future
 * repository is allowed to write it.
 */
export const MULTI_PLAN_RUNNING_FOUNDATION_TABLES = Object.freeze([
  "running_plans", "running_session_revisions", "running_goals",
  "running_session_slots", "running_opportunities", "workout_provenance",
  "workout_receipts", "imported_activities", "imported_activity_payloads",
  "imported_activity_references", "imported_activity_laps",
  "imported_activity_chunks", "imported_activity_receipts",
  "imported_activity_removal_events", "running_match_events",
  "running_current_matches", "bodyweight_revisions", "bodyweight_tombstones",
] as const);

const CREATE_STATEMENTS = [
  "ALTER TABLE plans ADD COLUMN plan_kind TEXT NOT NULL DEFAULT 'strength' CHECK(plan_kind IN ('strength', 'running'))",
  "ALTER TABLE owned_plan_schedules ADD COLUMN plan_kind TEXT NOT NULL DEFAULT 'strength' CHECK(plan_kind IN ('strength', 'running'))",
  "DROP INDEX IF EXISTS one_active_owned_plan",
  "DROP INDEX IF EXISTS one_active_owned_schedule",
  "CREATE UNIQUE INDEX one_active_owned_plan_per_sport ON plans(plan_kind) WHERE is_active = 1",
  "CREATE UNIQUE INDEX one_active_owned_schedule_per_sport ON owned_plan_schedules(plan_kind) WHERE lifecycle = 'active'",
  `CREATE TABLE running_plans (plan_id TEXT PRIMARY KEY NOT NULL REFERENCES plans(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, status TEXT NOT NULL CHECK(status IN ('draft','ready','retired')), revision INTEGER NOT NULL CHECK(revision >= 1), created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)) STRICT`,
  `CREATE TABLE running_session_revisions (id TEXT PRIMARY KEY NOT NULL, plan_id TEXT NOT NULL REFERENCES running_plans(plan_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, session_kind TEXT NOT NULL CHECK(session_kind IN ('recovery','long_run','progression','tempo','intervals','hills','fartlek')), revision INTEGER NOT NULL CHECK(revision >= 1), definition_json TEXT NOT NULL CHECK(json_valid(definition_json)), created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0), UNIQUE(plan_id, session_kind, revision)) STRICT`,
  `CREATE TABLE running_goals (id TEXT PRIMARY KEY NOT NULL, plan_id TEXT NOT NULL REFERENCES running_plans(plan_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, goal_json TEXT NOT NULL CHECK(json_valid(goal_json)), revision INTEGER NOT NULL CHECK(revision >= 1), created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)) STRICT`,
  `CREATE TABLE running_session_slots (id TEXT PRIMARY KEY NOT NULL, plan_id TEXT NOT NULL REFERENCES running_plans(plan_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, weekday TEXT NOT NULL CHECK(weekday IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')), ordinal INTEGER NOT NULL CHECK(ordinal >= 0), session_revision_id TEXT NOT NULL REFERENCES running_session_revisions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, revision INTEGER NOT NULL CHECK(revision >= 1), UNIQUE(plan_id, weekday, ordinal)) STRICT`,
  `CREATE TABLE running_opportunities (id TEXT PRIMARY KEY NOT NULL, plan_id TEXT NOT NULL REFERENCES running_plans(plan_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, schedule_id TEXT NOT NULL REFERENCES owned_plan_schedules(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, schedule_version_id TEXT NOT NULL REFERENCES owned_plan_schedule_versions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, slot_id TEXT NOT NULL REFERENCES running_session_slots(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, local_date TEXT NOT NULL, timezone TEXT NOT NULL, session_revision_id TEXT NOT NULL REFERENCES running_session_revisions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, state TEXT NOT NULL CHECK(state IN ('planned','fulfilled','skipped')), created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0), UNIQUE(schedule_id, schedule_version_id, slot_id, local_date, timezone)) STRICT`,
  `CREATE TABLE workout_provenance (workout_session_id TEXT PRIMARY KEY NOT NULL REFERENCES workout_sessions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, plan_id TEXT REFERENCES plans(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, plan_day_id TEXT REFERENCES plan_days(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, schedule_id TEXT REFERENCES owned_plan_schedules(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, schedule_version_id TEXT REFERENCES owned_plan_schedule_versions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, opportunity_id TEXT REFERENCES running_opportunities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, source_revision INTEGER NOT NULL CHECK(source_revision >= 1)) STRICT`,
  `CREATE TABLE workout_receipts (id TEXT PRIMARY KEY NOT NULL, workout_session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64), committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0), UNIQUE(workout_session_id, request_sha256)) STRICT`,
  `CREATE TABLE imported_activities (id TEXT PRIMARY KEY NOT NULL, source TEXT NOT NULL, source_activity_id TEXT NOT NULL, started_at_ms INTEGER NOT NULL CHECK(started_at_ms >= 0), aggregate_json TEXT NOT NULL CHECK(json_valid(aggregate_json)), imported_at_ms INTEGER NOT NULL CHECK(imported_at_ms >= 0), UNIQUE(source, source_activity_id)) STRICT`,
  `CREATE TABLE imported_activity_payloads (id TEXT PRIMARY KEY NOT NULL, activity_id TEXT NOT NULL REFERENCES imported_activities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), sha256 TEXT NOT NULL CHECK(length(sha256) = 64), UNIQUE(activity_id, sha256)) STRICT`,
  `CREATE TABLE imported_activity_references (id TEXT PRIMARY KEY NOT NULL, activity_id TEXT NOT NULL REFERENCES imported_activities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, reference_kind TEXT NOT NULL, reference_value TEXT NOT NULL, UNIQUE(activity_id, reference_kind, reference_value)) STRICT`,
  `CREATE TABLE imported_activity_laps (id TEXT PRIMARY KEY NOT NULL, activity_id TEXT NOT NULL REFERENCES imported_activities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, ordinal INTEGER NOT NULL CHECK(ordinal >= 0), lap_json TEXT NOT NULL CHECK(json_valid(lap_json)), UNIQUE(activity_id, ordinal)) STRICT`,
  `CREATE TABLE imported_activity_chunks (id TEXT PRIMARY KEY NOT NULL, activity_id TEXT NOT NULL REFERENCES imported_activities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, ordinal INTEGER NOT NULL CHECK(ordinal >= 0), chunk_json TEXT NOT NULL CHECK(json_valid(chunk_json)), UNIQUE(activity_id, ordinal)) STRICT`,
  `CREATE TABLE imported_activity_receipts (id TEXT PRIMARY KEY NOT NULL, activity_id TEXT NOT NULL REFERENCES imported_activities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64), committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0), UNIQUE(activity_id, request_sha256)) STRICT`,
  `CREATE TABLE imported_activity_removal_events (id TEXT PRIMARY KEY NOT NULL, activity_id TEXT NOT NULL REFERENCES imported_activities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, removed_at_ms INTEGER NOT NULL CHECK(removed_at_ms >= 0), reason TEXT NOT NULL) STRICT`,
  `CREATE TABLE running_match_events (id TEXT PRIMARY KEY NOT NULL, activity_id TEXT NOT NULL REFERENCES imported_activities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, opportunity_id TEXT NOT NULL REFERENCES running_opportunities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, action TEXT NOT NULL CHECK(action IN ('matched','unmatched','reassigned')), created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)) STRICT`,
  `CREATE TABLE running_current_matches (opportunity_id TEXT PRIMARY KEY NOT NULL REFERENCES running_opportunities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, activity_id TEXT NOT NULL UNIQUE REFERENCES imported_activities(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, event_id TEXT NOT NULL REFERENCES running_match_events(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED) STRICT`,
  `CREATE TABLE bodyweight_revisions (id TEXT PRIMARY KEY NOT NULL, measured_at_ms INTEGER NOT NULL CHECK(measured_at_ms >= 0), grams INTEGER NOT NULL CHECK(grams > 0), revision INTEGER NOT NULL CHECK(revision >= 1)) STRICT`,
  `CREATE TABLE bodyweight_tombstones (id TEXT PRIMARY KEY NOT NULL, bodyweight_revision_id TEXT NOT NULL REFERENCES bodyweight_revisions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, removed_at_ms INTEGER NOT NULL CHECK(removed_at_ms >= 0)) STRICT`,
] as const;

const IMMUTABLE_TABLES = [
  "running_session_revisions", "running_session_slots", "running_opportunities",
  "imported_activities", "imported_activity_payloads", "imported_activity_references",
  "imported_activity_laps", "imported_activity_chunks", "imported_activity_receipts",
  "imported_activity_removal_events", "running_match_events", "bodyweight_revisions",
  "bodyweight_tombstones",
] as const;

export const MULTI_PLAN_RUNNING_FOUNDATION_TRIGGER_STATEMENTS = Object.freeze([
  ...IMMUTABLE_TABLES.map((table) => `CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`),
  ...IMMUTABLE_TABLES.map((table) => `CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, '${table}_immutable'); END`),
  `CREATE TRIGGER plans_plan_kind_immutable BEFORE UPDATE OF plan_kind ON plans BEGIN SELECT RAISE(ABORT, 'plan_kind_immutable'); END`,
  `CREATE TRIGGER owned_plan_schedules_plan_kind_immutable BEFORE UPDATE OF plan_kind ON owned_plan_schedules BEGIN SELECT RAISE(ABORT, 'schedule_plan_kind_immutable'); END`,
  ...MULTI_PLAN_RUNNING_FOUNDATION_TABLES.flatMap((table) => ["INSERT", "UPDATE", "DELETE"].map((operation) =>
    `CREATE TRIGGER automatic_backup_generation_${table}_${operation.toLowerCase()} AFTER ${operation} ON ${table} FOR EACH ROW BEGIN UPDATE automatic_backup_state SET mutation_generation = mutation_generation + 1, dirty_since_ms = COALESCE(dirty_since_ms, CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE id = 1; END`,
  )),
] as const);

export const multiPlanRunningFoundationMigration: Migration = Object.freeze({
  version: 28,
  name: "multi-plan-running-foundation",
  kind: "destructive",
  async up(transaction) {
    for (const statement of CREATE_STATEMENTS) await transaction.execute(statement);
    for (const statement of MULTI_PLAN_RUNNING_FOUNDATION_TRIGGER_STATEMENTS) await transaction.execute(statement);
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const tables = await transaction.queryAll<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${MULTI_PLAN_RUNNING_FOUNDATION_TABLES.map(() => "?").join(",")})`,
      MULTI_PLAN_RUNNING_FOUNDATION_TABLES,
    );
    if (tables.length !== MULTI_PLAN_RUNNING_FOUNDATION_TABLES.length) throw new Error("multi_plan_running_foundation_schema_incomplete");
    const indexes = await transaction.queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('one_active_owned_plan_per_sport', 'one_active_owned_schedule_per_sport')",
    );
    if (indexes.length !== 2) throw new Error("multi_plan_running_foundation_schema_incomplete");
  },
});
