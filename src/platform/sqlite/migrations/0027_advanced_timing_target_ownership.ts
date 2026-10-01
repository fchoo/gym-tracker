import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const ADVANCED_TIMING_TARGET_OWNERSHIP_TRIGGER_STATEMENTS = Object.freeze([
  `CREATE TRIGGER session_advanced_timing_states_target_session_insert
    BEFORE INSERT ON session_advanced_timing_states
    WHEN NEW.session_set_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM session_sets ss
      JOIN session_exercises se ON se.id = ss.session_exercise_id
      WHERE ss.id = NEW.session_set_id AND se.session_id = NEW.session_id
    ) BEGIN
      SELECT RAISE(ABORT, 'advanced_timing_target_session_mismatch');
    END`,
  `CREATE TRIGGER session_advanced_timing_states_target_session_update
    BEFORE UPDATE OF session_id, session_set_id ON session_advanced_timing_states
    WHEN NEW.session_set_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM session_sets ss
      JOIN session_exercises se ON se.id = ss.session_exercise_id
      WHERE ss.id = NEW.session_set_id AND se.session_id = NEW.session_id
    ) BEGIN
      SELECT RAISE(ABORT, 'advanced_timing_target_session_mismatch');
    END`,
] as const);

const TRIGGER_NAMES = Object.freeze([
  "session_advanced_timing_states_target_session_insert",
  "session_advanced_timing_states_target_session_update",
] as const);

export const advancedTimingTargetOwnershipMigration: Migration = Object.freeze({
  version: 27,
  name: "advanced-timing-target-ownership",
  kind: "additive",
  async up(transaction) {
    for (const statement of ADVANCED_TIMING_TARGET_OWNERSHIP_TRIGGER_STATEMENTS) {
      await transaction.execute(statement);
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const rows = await transaction.queryAll<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'trigger' AND name IN (?, ?)`,
      TRIGGER_NAMES,
    );
    const names = new Set(rows.map(({ name }) => name));
    if (!TRIGGER_NAMES.every((name) => names.has(name))) {
      throw new Error("advanced_timing_target_ownership_schema_incomplete");
    }
  },
});
