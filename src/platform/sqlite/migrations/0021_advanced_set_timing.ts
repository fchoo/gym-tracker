import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

const OFF_CONFIG_JSON = '{"version":1,"mode":"off"}';

function exactObjectCheck(column: string, paths: readonly string[]): string {
  return "json_remove(" + column + ", "
    + paths.map((path) => "'" + path + "'").join(", ")
    + ") = '{}'";
}

function clusterGroupChecks(column: string): readonly string[] {
  return Array.from({ length: 12 }, (_, index) => {
    const path = "'$.groupSizes[" + index + "]'";
    const value = "json_extract(" + column + ", " + path + ")";
    const type = "json_type(" + column + ", " + path + ")";
    const boundedInteger = type + " = 'integer' AND " + value + " BETWEEN 1 AND 100";
    return index < 2
      ? "AND " + boundedInteger
      : "AND (" + type + " IS NULL OR (" + boundedInteger + "))";
  });
}

function clusterGroupTotal(column: string): string {
  return Array.from(
    { length: 12 },
    (_, index) => "COALESCE(json_extract(" + column + ", '$.groupSizes[" + index + "]'), 0)",
  ).join(" + " );
}

function configCheck(column: string): string {
  return [
    "json_valid(" + column + ")",
    "AND json_type(" + column + ", '$.version') = 'integer'",
    "AND json_extract(" + column + ", '$.version') = 1",
    "AND (",
    "  (json_extract(" + column + ", '$.mode') = 'off'",
    "   AND " + exactObjectCheck(column, ["$.version", "$.mode"]) + ")",
    "  OR",
    "  (json_extract(" + column + ", '$.mode') = 'per_rep'",
    "   AND json_type(" + column + ", '$.intervalMs') = 'integer'",
    "   AND json_extract(" + column + ", '$.intervalMs') BETWEEN 100 AND 60000",
    "   AND json_extract(" + column + ", '$.cueChannels') IN ('haptic', 'audio', 'both')",
    "   AND " + exactObjectCheck(column, ["$.version", "$.mode", "$.intervalMs", "$.cueChannels"]) + ")",
    "  OR",
    "  (json_extract(" + column + ", '$.mode') = 'cluster'",
    "   AND json_type(" + column + ", '$.groupSizes') = 'array'",
    "   AND json_array_length(" + column + ", '$.groupSizes') BETWEEN 2 AND 12",
    ...clusterGroupChecks(column).map((check) => "   " + check),
    "   AND (" + clusterGroupTotal(column) + ") <= 100",
    "   AND json_type(" + column + ", '$.intraRestMs') = 'integer'",
    "   AND json_extract(" + column + ", '$.intraRestMs') BETWEEN 100 AND 60000",
    "   AND json_extract(" + column + ", '$.cueChannels') IN ('haptic', 'audio', 'both')",
    "   AND " + exactObjectCheck(column, ["$.version", "$.mode", "$.groupSizes", "$.intraRestMs", "$.cueChannels"]) + ")",
    ")",
  ].join("\n");
}

function defaultConfigColumn(table: string): string {
  return [
    "ALTER TABLE " + table,
    "ADD COLUMN advanced_timing_default_json TEXT NOT NULL",
    "DEFAULT '" + OFF_CONFIG_JSON + "'",
    "CHECK(" + configCheck("advanced_timing_default_json") + ")",
  ].join(" ");
}

function nullableOverrideColumn(table: string): string {
  return [
    "ALTER TABLE " + table,
    "ADD COLUMN advanced_timing_override_json TEXT",
    "CHECK(advanced_timing_override_json IS NULL OR "
      + configCheck("advanced_timing_override_json") + ")",
  ].join(" ");
}

export const ADVANCED_SET_TIMING_SCHEMA_STATEMENTS = [
  defaultConfigColumn("plan_day_exercises"),
  defaultConfigColumn("owned_plan_day_exercises"),
  nullableOverrideColumn("plan_warmup_sets"),
  nullableOverrideColumn("plan_working_set_targets"),
  nullableOverrideColumn("owned_plan_warmup_sets"),
  nullableOverrideColumn("owned_plan_working_set_targets"),
  defaultConfigColumn("session_exercises"),
  nullableOverrideColumn("session_sets"),
  [
    "ALTER TABLE session_sets",
    "ADD COLUMN advanced_timing_resolved_json TEXT NOT NULL",
    "DEFAULT '" + OFF_CONFIG_JSON + "'",
    "CHECK(" + configCheck("advanced_timing_resolved_json") + ")",
  ].join(" "),
  [
    "CREATE TABLE session_advanced_timing_states (",
    "  session_id TEXT PRIMARY KEY NOT NULL REFERENCES workout_sessions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,",
    "  session_set_id TEXT REFERENCES session_sets(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,",
    "  state_version INTEGER NOT NULL CHECK(state_version = 1),",
    "  revision INTEGER NOT NULL CHECK(revision >= 0),",
    "  status TEXT NOT NULL CHECK(status IN ('idle', 'running', 'paused', 'stopped', 'expired')),",
    "  mode TEXT CHECK(mode IN ('per_rep', 'cluster')),",
    "  config_json TEXT NOT NULL CHECK(" + configCheck("config_json") + "),",
    "  progress_json TEXT NOT NULL CHECK(json_valid(progress_json)),",
    "  started_at_ms INTEGER CHECK(started_at_ms IS NULL OR started_at_ms >= 0),",
    "  next_boundary_at_ms INTEGER CHECK(next_boundary_at_ms IS NULL OR next_boundary_at_ms >= 0),",
    "  remaining_ms INTEGER CHECK(remaining_ms IS NULL OR remaining_ms >= 0),",
    "  stopped_at_ms INTEGER CHECK(stopped_at_ms IS NULL OR stopped_at_ms >= 0),",
    "  CHECK(",
    "    (status = 'idle' AND session_set_id IS NULL AND mode IS NULL",
    "     AND started_at_ms IS NULL AND next_boundary_at_ms IS NULL",
    "     AND remaining_ms IS NULL AND stopped_at_ms IS NULL)",
    "    OR",
    "    (status = 'running' AND session_set_id IS NOT NULL AND mode IS NOT NULL",
    "     AND started_at_ms IS NOT NULL AND next_boundary_at_ms IS NOT NULL",
    "     AND remaining_ms IS NULL AND stopped_at_ms IS NULL)",
    "    OR",
    "    (status = 'paused' AND session_set_id IS NOT NULL AND mode IS NOT NULL",
    "     AND started_at_ms IS NULL AND next_boundary_at_ms IS NULL",
    "     AND remaining_ms IS NOT NULL AND stopped_at_ms IS NULL)",
    "    OR",
    "    (status IN ('stopped', 'expired') AND session_set_id IS NOT NULL AND mode IS NOT NULL",
    "     AND started_at_ms IS NULL AND next_boundary_at_ms IS NULL",
    "     AND remaining_ms IS NULL AND stopped_at_ms IS NOT NULL)",
    "  )",
    "  CHECK(",
    "    (status = 'idle' AND mode IS NULL",
    "     AND json_extract(config_json, '$.mode') = 'off')",
    "    OR (mode = 'per_rep'",
    "        AND json_extract(config_json, '$.mode') = 'per_rep')",
    "    OR (mode = 'cluster'",
    "        AND json_extract(config_json, '$.mode') = 'cluster')",
    "  )",
    ") STRICT",
  ].join("\n"),
  "CREATE INDEX session_advanced_timing_states_target_idx ON session_advanced_timing_states(session_set_id)",
  [
    "CREATE TRIGGER session_advanced_timing_states_target_session_insert",
    "BEFORE INSERT ON session_advanced_timing_states",
    "WHEN NEW.session_set_id IS NOT NULL AND NOT EXISTS (",
    "  SELECT 1 FROM session_sets ss",
    "  JOIN session_exercises se ON se.id = ss.session_exercise_id",
    "  WHERE ss.id = NEW.session_set_id AND se.session_id = NEW.session_id",
    ") BEGIN",
    "  SELECT RAISE(ABORT, 'advanced_timing_target_session_mismatch');",
    "END",
  ].join("\n"),
  [
    "CREATE TRIGGER session_advanced_timing_states_target_session_update",
    "BEFORE UPDATE OF session_id, session_set_id ON session_advanced_timing_states",
    "WHEN NEW.session_set_id IS NOT NULL AND NOT EXISTS (",
    "  SELECT 1 FROM session_sets ss",
    "  JOIN session_exercises se ON se.id = ss.session_exercise_id",
    "  WHERE ss.id = NEW.session_set_id AND se.session_id = NEW.session_id",
    ") BEGIN",
    "  SELECT RAISE(ABORT, 'advanced_timing_target_session_mismatch');",
    "END",
  ].join("\n"),
] as const;

const REQUIRED_COLUMNS = new Map([
  ["plan_day_exercises", "advanced_timing_default_json"],
  ["owned_plan_day_exercises", "advanced_timing_default_json"],
  ["plan_warmup_sets", "advanced_timing_override_json"],
  ["plan_working_set_targets", "advanced_timing_override_json"],
  ["owned_plan_warmup_sets", "advanced_timing_override_json"],
  ["owned_plan_working_set_targets", "advanced_timing_override_json"],
  ["session_exercises", "advanced_timing_default_json"],
  ["session_sets", "advanced_timing_override_json"],
  ["session_sets", "advanced_timing_resolved_json"],
] as const);

export const advancedSetTimingMigration: Migration = Object.freeze({
  version: 21,
  name: "advanced-set-timing",
  kind: "additive",
  async up(transaction) {
    for (const statement of ADVANCED_SET_TIMING_SCHEMA_STATEMENTS) {
      await transaction.execute(statement);
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    for (const [table, column] of REQUIRED_COLUMNS) {
      const columns = await transaction.queryAll<{ name: string }>(
        "PRAGMA table_info(" + table + ")",
      );
      if (!columns.some(({ name }) => name === column)) {
        throw new Error("advanced_set_timing_schema_incomplete");
      }
    }
    const [state] = await transaction.queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_advanced_timing_states'",
    );
    const foreignKeys = await transaction.queryAll<{ table: string }>(
      "PRAGMA foreign_key_list(session_advanced_timing_states)",
    );
    const indexes = await transaction.queryAll<{ name: string }>(
      "PRAGMA index_list(session_advanced_timing_states)",
    );
    const triggers = await transaction.queryAll<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'trigger' AND name IN (
         'session_advanced_timing_states_target_session_insert',
         'session_advanced_timing_states_target_session_update'
       )`,
    );
    if (
      state === undefined
      || foreignKeys.length !== 2
      || !foreignKeys.some(({ table }) => table === "workout_sessions")
      || !foreignKeys.some(({ table }) => table === "session_sets")
      || !indexes.some(({ name }) => name === "session_advanced_timing_states_target_idx")
      || triggers.length !== 2
    ) throw new Error("advanced_set_timing_schema_incomplete");
  },
});
