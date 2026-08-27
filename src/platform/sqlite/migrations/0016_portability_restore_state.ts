import type { Migration } from "../migrationRunner";
import type { SqliteTransactionExecutor } from "../sqliteKernel";

export const PORTABILITY_RESTORE_STATE_TABLE = "portability_restore_state" as const;

export const PORTABILITY_RESTORE_STATE_SCHEMA_STATEMENTS = [
  "CREATE TABLE portability_restore_state (id INTEGER PRIMARY KEY NOT NULL CHECK(id = 1), state TEXT NOT NULL CHECK(state IN ('ready', 'rebuild_pending')), updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0)) STRICT",
  "INSERT INTO portability_restore_state (id, state, updated_at_ms) VALUES (1, 'ready', 0)",
] as const;

export const portabilityRestoreStateMigration: Migration = Object.freeze({
  version: 16,
  name: "portability-restore-state",
  kind: "additive",
  async up(transaction) {
    for (const statement of PORTABILITY_RESTORE_STATE_SCHEMA_STATEMENTS) {
      await transaction.execute(statement);
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    const columns = await transaction.queryAll<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>("PRAGMA table_info(portability_restore_state)");
    const expected = [
      ["id", "INTEGER", 1, 1],
      ["state", "TEXT", 1, 0],
      ["updated_at_ms", "INTEGER", 1, 0],
    ];
    if (columns.length !== expected.length || columns.some((column, index) => (
      column.name !== expected[index]![0]
      || column.type.toUpperCase() !== expected[index]![1]
      || column.notnull !== expected[index]![2]
      || column.pk !== expected[index]![3]
    ))) throw new Error("portability_restore_state_schema_incomplete");
    const rows = await transaction.queryAll<{
      id: number;
      state: string;
      updated_at_ms: number;
    }>("SELECT id, state, updated_at_ms FROM portability_restore_state");
    if (rows.length !== 1 || rows[0]?.id !== 1 || rows[0]?.state !== "ready" || rows[0]?.updated_at_ms !== 0) {
      throw new Error("portability_restore_state_schema_incomplete");
    }
  },
});
