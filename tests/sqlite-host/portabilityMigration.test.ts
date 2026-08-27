import { describe, expect, it } from "@jest/globals";

import { portabilityRestoreStateMigration, PORTABILITY_RESTORE_STATE_TABLE } from "../../src/platform/sqlite/migrations/0016_portability_restore_state";
import { migrations } from "../../src/platform/sqlite/migrations";
import type { SqliteTransactionExecutor } from "../../src/platform/sqlite/sqliteKernel";

describe("portability restore-state migration", () => {
  it("is the retained additive v16 migration and creates only a singleton non-secret rebuild state", async () => {
    expect(migrations.at(-1)).toBe(portabilityRestoreStateMigration);
    expect(portabilityRestoreStateMigration).toMatchObject({ version: 16, name: "portability-restore-state", kind: "additive" });
    const statements: string[] = [];
    let queryCount = 0;
    const transaction: SqliteTransactionExecutor = {
      execute: async (sql) => { statements.push(sql); return { changes: 0, lastInsertRowId: 0 }; },
      queryAll: async <Row extends Record<string, unknown>>() => {
        const result = queryCount === 0
          ? [
              { name: "id", type: "INTEGER", notnull: 1, pk: 1 },
              { name: "state", type: "TEXT", notnull: 1, pk: 0 },
              { name: "updated_at_ms", type: "INTEGER", notnull: 1, pk: 0 },
            ]
          : [{ id: 1, state: "ready", updated_at_ms: 0 }];
        queryCount += 1;
        return result as unknown as readonly Row[];
      },
    };
    await portabilityRestoreStateMigration.up(transaction);
    await portabilityRestoreStateMigration.verify(transaction);
    expect(statements).toHaveLength(2);
    expect(statements.join(" ")).toMatch(/rebuild_pending/u);
    expect(statements.join(" ")).toMatch(/ready/u);
    expect(statements.join(" ")).toMatch(/CHECK\s*\(id\s*=\s*1\)/u);
    expect(statements.join(" ")).not.toMatch(/password|archive|payload|cipher|nonce|salt|token/iu);
  });

  it("fails verification when the singleton restore state table is absent", async () => {
    const missing: SqliteTransactionExecutor = {
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      queryAll: async <Row extends Record<string, unknown>>() => [] as readonly Row[],
    };
    await expect(portabilityRestoreStateMigration.verify(missing)).rejects.toThrow("portability_restore_state_schema_incomplete");
  });

  it("fails verification when the state shape or required singleton row is malformed", async () => {
    const malformed: SqliteTransactionExecutor = {
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      queryAll: async <Row extends Record<string, unknown>>() => [] as readonly Row[],
    };
    await expect(portabilityRestoreStateMigration.verify(malformed)).rejects.toThrow("portability_restore_state_schema_incomplete");
  });

  it.each([
    { name: "id", type: "TEXT", notnull: 1, pk: 1 },
    { name: "id", type: "INTEGER", notnull: 0, pk: 1 },
    { name: "id", type: "INTEGER", notnull: 1, pk: 0 },
    { name: "state", type: "INTEGER", notnull: 1, pk: 0 },
    { name: "state", type: "TEXT", notnull: 0, pk: 0 },
    { name: "state", type: "TEXT", notnull: 1, pk: 1 },
    { name: "updated_at_ms", type: "TEXT", notnull: 1, pk: 0 },
    { name: "updated_at_ms", type: "INTEGER", notnull: 0, pk: 0 },
    { name: "updated_at_ms", type: "INTEGER", notnull: 1, pk: 1 },
  ])("rejects a singleton schema column with an invalid $name shape", async (replacement) => {
    const columns = [
      { name: "id", type: "INTEGER", notnull: 1, pk: 1 },
      { name: "state", type: "TEXT", notnull: 1, pk: 0 },
      { name: "updated_at_ms", type: "INTEGER", notnull: 1, pk: 0 },
    ];
    const index = columns.findIndex((column) => column.name === replacement.name);
    columns[index] = replacement;
    const transaction: SqliteTransactionExecutor = {
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      queryAll: async <Row extends Record<string, unknown>>() => columns as unknown as readonly Row[],
    };
    await expect(portabilityRestoreStateMigration.verify(transaction))
      .rejects.toThrow("portability_restore_state_schema_incomplete");
  });

  it.each([
    { rows: [] },
    { rows: [{ id: 2, state: "ready", updated_at_ms: 0 }] },
    { rows: [{ id: 1, state: "rebuild_pending", updated_at_ms: 0 }] },
    { rows: [{ id: 1, state: "ready", updated_at_ms: 1 }] },
    { rows: [
      { id: 1, state: "ready", updated_at_ms: 0 },
      { id: 1, state: "ready", updated_at_ms: 0 },
    ] },
  ])("rejects a malformed restore-state singleton row", async ({ rows }) => {
    let call = 0;
    const transaction: SqliteTransactionExecutor = {
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      queryAll: async <Row extends Record<string, unknown>>() => {
        call += 1;
        return (call === 1
          ? [
              { name: "id", type: "INTEGER", notnull: 1, pk: 1 },
              { name: "state", type: "TEXT", notnull: 1, pk: 0 },
              { name: "updated_at_ms", type: "INTEGER", notnull: 1, pk: 0 },
            ]
          : rows) as unknown as readonly Row[];
      },
    };
    await expect(portabilityRestoreStateMigration.verify(transaction))
      .rejects.toThrow("portability_restore_state_schema_incomplete");
  });
});
