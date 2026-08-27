import {
  LOGICAL_BACKUP_TABLE_DEFINITIONS,
  LOGICAL_BACKUP_TABLES,
  type LogicalBackupSnapshot,
} from "../../../domains/portability/backupContracts";
import {
  LOGICAL_BACKUP_REFERENCE_DEFINITIONS,
} from "../../../domains/portability/restoreCommands";
import {
  HISTORY_INTEGRITY_SCHEMA_STATEMENTS,
} from "../migrations/0013_history_integrity";
import {
  OWNED_PLAN_SCHEMA_STATEMENTS,
} from "../migrations/0009_owned_plans";
import {
  SCHEDULE_ACTIVATION_SCHEMA_STATEMENTS,
} from "../migrations/0008_schedule_activation";
import {
  LOGICAL_BACKUP_TABLE_FILTERS,
} from "./logicalBackupRepository";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

type LogicalTableName = keyof typeof LOGICAL_BACKUP_TABLE_DEFINITIONS;

export type LogicalRestoreRepository = Readonly<{
  /** Accepts only a snapshot already authenticated and validated by restoreCommands. */
  restore(snapshot: LogicalBackupSnapshot): Promise<Readonly<{
    state: "rebuild_pending";
  }>>;
}>;

export const LOGICAL_RESTORE_DELETE_TRIGGER_NAMES = Object.freeze([
  "owned_starter_sources_immutable_delete",
  "owned_day_sources_immutable_delete",
  "owned_occurrence_sources_immutable_delete",
  "activation_requests_immutable_delete",
  "schedule_versions_immutable_delete",
  "schedule_bindings_immutable_delete",
  "consumed_overrides_immutable_delete",
  "consumed_opportunities_immutable_delete",
  "schedule_events_immutable_delete",
  "owned_plan_requests_immutable_delete",
  "owned_plans_no_permanent_delete",
  "owned_plan_days_no_permanent_delete",
  "owned_plan_occurrences_no_permanent_delete",
  "owned_plan_warmups_no_permanent_delete",
  "owned_plan_targets_no_permanent_delete",
  "owned_plan_policies_no_permanent_delete",
  "history_audit_events_immutable_delete",
] as const);

export type LogicalRestoreFaultStage =
  | "captured_current_ownership"
  | "verified"
  | "state_updated"
  | `trigger_drop:${typeof LOGICAL_RESTORE_DELETE_TRIGGER_NAMES[number]}`
  | `trigger_recreate:${typeof LOGICAL_RESTORE_DELETE_TRIGGER_NAMES[number]}`
  | `delete:${LogicalTableName}`
  | `insert:${LogicalTableName}`;

export class LogicalRestoreRepositoryError extends Error {
  readonly kind = "storage" as const;
  readonly retryable = true;
  readonly correlationCode = "GT-RESTORE02" as const;

  constructor(readonly code: "logical_restore_failed") {
    super(code);
    this.name = "LogicalRestoreRepositoryError";
  }
}

function identifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/u.test(value)) {
    throw new LogicalRestoreRepositoryError("logical_restore_failed");
  }
  return `"${value}"`;
}

function triggerName(statement: string): string {
  return /^CREATE TRIGGER\s+([a-z0-9_]+)/u.exec(statement.trim())![1]!;
}

const TRIGGER_SOURCE_STATEMENTS = Object.freeze([
  ...SCHEDULE_ACTIVATION_SCHEMA_STATEMENTS,
  ...OWNED_PLAN_SCHEMA_STATEMENTS,
  ...HISTORY_INTEGRITY_SCHEMA_STATEMENTS,
].filter((statement) => /^CREATE TRIGGER /u.test(statement)));

/** Only delete blockers for facts replaced by this transaction. Insert validators stay active. */
const RESTORE_TRIGGER_SQL = Object.freeze(new Map(
  LOGICAL_RESTORE_DELETE_TRIGGER_NAMES.map((name) => [
    name,
    TRIGGER_SOURCE_STATEMENTS.find((statement) => triggerName(statement) === name)!,
  ] as const),
));

function sourceDependencies(): ReadonlyMap<string, ReadonlySet<string>> {
  const tables = new Set(LOGICAL_BACKUP_TABLES);
  const parents = new Map<string, Set<string>>(
    LOGICAL_BACKUP_TABLES.map((table) => [table, new Set<string>()]),
  );
  for (const reference of LOGICAL_BACKUP_REFERENCE_DEFINITIONS) {
    // These nullable pointers point back into an already-owned graph. They are
    // deliberately excluded from ordering; their non-null values are checked
    // by SQLite at commit and by foreign_key_check below.
    const nullableBackReference = (
      reference.childTable === "workout_sessions"
      && (reference.childColumns[0] === "active_session_exercise_id"
        || reference.childColumns[0] === "active_set_id")
    ) || (
      reference.childTable === "session_rest_states"
      && reference.childColumns[0] === "next_set_id"
    );
    if (nullableBackReference) continue;
    if (tables.has(reference.childTable) && tables.has(reference.parentTable)) {
      parents.get(reference.childTable)?.add(reference.parentTable);
    }
  }
  return parents;
}

function insertOrder(): readonly LogicalTableName[] {
  const parents = sourceDependencies();
  const remaining = new Set(LOGICAL_BACKUP_TABLES);
  const resolved = new Set<string>();
  const result: LogicalTableName[] = [];
  while (remaining.size > 0) {
    const next = [...remaining].sort().find((table) =>
      [...parents.get(table)!].every((parent) => resolved.has(parent)),
    )!;
    remaining.delete(next);
    resolved.add(next);
    result.push(next as LogicalTableName);
  }
  return Object.freeze(result);
}

const INSERT_ORDER = insertOrder();
const DELETE_ORDER = Object.freeze([...INSERT_ORDER].reverse());

function stableIdentities(
  rows: readonly Record<string, unknown>[],
  table: LogicalTableName,
): readonly string[] {
  const primaryKey = LOGICAL_BACKUP_TABLE_DEFINITIONS[table].primaryKey;
  return rows.map((row) => JSON.stringify(primaryKey.map((column) => row[column])))
    .sort();
}

function sameValues(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index]
      && left[key] === right[key]);
}

async function capturedRestoreTriggers(
  transaction: SqliteTransactionExecutor,
): Promise<ReadonlyMap<string, string>> {
  const names = [...RESTORE_TRIGGER_SQL.keys()];
  const placeholders = names.map(() => "?").join(", ");
  const rows = await transaction.queryAll<{ name: string; sql: string }>(
    `SELECT name, sql FROM sqlite_master
     WHERE type = 'trigger' AND name IN (${placeholders})
     ORDER BY name`,
    names,
  );
  if (rows.length !== names.length
    || rows.some((row) => row.sql.trim().length === 0)) {
    throw new LogicalRestoreRepositoryError("logical_restore_failed");
  }
  return new Map(rows.map(({ name, sql }) => [name, sql]));
}

async function dropRestoreTriggers(
  transaction: SqliteTransactionExecutor,
  captured: ReadonlyMap<string, string>,
  fault?: (stage: LogicalRestoreFaultStage) => Promise<void>,
): Promise<void> {
  for (const name of captured.keys()) {
    await transaction.execute(`DROP TRIGGER ${identifier(name)}`);
    await fault?.(`trigger_drop:${name as typeof LOGICAL_RESTORE_DELETE_TRIGGER_NAMES[number]}`);
  }
}

async function recreateRestoreTriggers(
  transaction: SqliteTransactionExecutor,
  captured: ReadonlyMap<string, string>,
  fault?: (stage: LogicalRestoreFaultStage) => Promise<void>,
): Promise<void> {
  for (const [name, statement] of captured) {
    await transaction.execute(statement);
    await fault?.(`trigger_recreate:${name as typeof LOGICAL_RESTORE_DELETE_TRIGGER_NAMES[number]}`);
  }
  const restored = await capturedRestoreTriggers(transaction);
  if (restored.size !== captured.size
    || [...captured].some(([name, sql]) => restored.get(name) !== sql)) {
    throw new LogicalRestoreRepositoryError("logical_restore_failed");
  }
}

function primaryKeyJson(table: LogicalTableName, alias = ""): string {
  return `json_array(${LOGICAL_BACKUP_TABLE_DEFINITIONS[table].primaryKey
    .map((column) => `${alias}${identifier(column)}`).join(", ")})`;
}

async function captureCurrentSourceOwnership(
  transaction: SqliteTransactionExecutor,
): Promise<void> {
  await transaction.execute(`CREATE TEMP TABLE IF NOT EXISTS logical_restore_current_rows (
    table_name TEXT NOT NULL, identity_json TEXT NOT NULL,
    PRIMARY KEY(table_name, identity_json)
  ) WITHOUT ROWID`);
  await transaction.execute("DELETE FROM logical_restore_current_rows");
  for (const table of LOGICAL_BACKUP_TABLES as readonly LogicalTableName[]) {
    await transaction.execute(`INSERT INTO logical_restore_current_rows(table_name, identity_json)
      SELECT ?, ${primaryKeyJson(table)} FROM ${identifier(table)}
      WHERE ${LOGICAL_BACKUP_TABLE_FILTERS[table]}`, [table]);
  }
}

function capturedWhere(table: LogicalTableName): string {
  return `${primaryKeyJson(table)} IN (
    SELECT identity_json FROM logical_restore_current_rows WHERE table_name = '${table}'
  )`;
}

async function deleteCurrentSources(
  transaction: SqliteTransactionExecutor,
  fault?: (stage: LogicalRestoreFaultStage) => Promise<void>,
): Promise<void> {
  for (const table of DELETE_ORDER) {
    if (table === "taxonomy_terms") continue;
    await transaction.execute(`DELETE FROM ${identifier(table)} WHERE ${capturedWhere(table)}`);
    await fault?.(`delete:${table}`);
  }
  // Only terms captured from the old owned graph may be removed. A term shared
  // with retained taxonomy stays even if its snapshot counterpart differs.
  await transaction.execute(`DELETE FROM taxonomy_terms
    WHERE ${capturedWhere("taxonomy_terms")} AND NOT EXISTS (
      SELECT 1 FROM exercise_taxonomy taxonomy
      WHERE taxonomy.kind = taxonomy_terms.kind
        AND taxonomy.slug = taxonomy_terms.slug
    )`);
  await fault?.("delete:taxonomy_terms");
}

async function insertTaxonomyTerms(
  transaction: SqliteTransactionExecutor,
  rows: readonly Record<string, unknown>[],
): Promise<void> {
  for (const row of rows) {
    const existing = await transaction.queryAll<Record<string, unknown>>(
      "SELECT * FROM taxonomy_terms WHERE kind = ? AND slug = ?",
      [row.kind as string, row.slug as string],
    );
    if (existing.length > 1 || (existing[0] !== undefined && !sameValues(existing[0], row))) {
      throw new LogicalRestoreRepositoryError("logical_restore_failed");
    }
    if (existing.length === 0) {
      await insertRow(transaction, "taxonomy_terms", row);
    }
  }
}

async function insertRow(
  transaction: SqliteTransactionExecutor,
  table: LogicalTableName,
  row: Record<string, unknown>,
): Promise<void> {
  const columns = Object.keys(row);
  if (columns.length === 0) throw new LogicalRestoreRepositoryError("logical_restore_failed");
  const result = await transaction.execute(
    `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(", ")})
     VALUES (${columns.map(() => "?").join(", ")})`,
    columns.map((column) => {
      const value = row[column];
      if (value === null || typeof value === "string" || typeof value === "number") return value;
      throw new LogicalRestoreRepositoryError("logical_restore_failed");
    }),
  );
  if (result.changes !== 1) throw new LogicalRestoreRepositoryError("logical_restore_failed");
}

async function insertSnapshot(
  transaction: SqliteTransactionExecutor,
  snapshot: LogicalBackupSnapshot,
  fault?: (stage: LogicalRestoreFaultStage) => Promise<void>,
): Promise<void> {
  for (const table of INSERT_ORDER) {
    const rows = snapshot.tables[table] as readonly Record<string, unknown>[];
    if (table === "taxonomy_terms") {
      await insertTaxonomyTerms(transaction, rows);
      await fault?.(`insert:${table}`);
      continue;
    }
    for (const row of rows) await insertRow(transaction, table, row);
    await fault?.(`insert:${table}`);
  }
}

async function verifySourceTables(
  transaction: SqliteTransactionExecutor,
  snapshot: LogicalBackupSnapshot,
): Promise<void> {
  for (const table of LOGICAL_BACKUP_TABLES as readonly LogicalTableName[]) {
    const expected = snapshot.tables[table] as readonly Record<string, unknown>[];
    const actual = table === "taxonomy_terms"
      ? await transaction.queryAll<Record<string, unknown>>(
        "SELECT * FROM taxonomy_terms WHERE EXISTS (SELECT 1 FROM exercise_taxonomy taxonomy WHERE taxonomy.kind = taxonomy_terms.kind AND taxonomy.slug = taxonomy_terms.slug)",
      )
      : await transaction.queryAll<Record<string, unknown>>(
        `SELECT * FROM ${identifier(table)} WHERE ${LOGICAL_BACKUP_TABLE_FILTERS[table]}`,
      );
    const expectedIdentities = stableIdentities(expected, table);
    const actualIdentities = stableIdentities(actual, table);
    if (table === "taxonomy_terms") {
      if (!expectedIdentities.every((identity) => actualIdentities.includes(identity))) {
        throw new LogicalRestoreRepositoryError("logical_restore_failed");
      }
    } else if (JSON.stringify(actualIdentities) !== JSON.stringify(expectedIdentities)) {
      throw new LogicalRestoreRepositoryError("logical_restore_failed");
    }
  }
  const foreignKeys = await transaction.queryAll<Record<string, unknown>>("PRAGMA foreign_key_check");
  if (foreignKeys.length !== 0) throw new LogicalRestoreRepositoryError("logical_restore_failed");
}

export function createLogicalRestoreRepository(
  kernel: SqliteKernel,
  input: Readonly<{
    nowMs(): number;
    faultAfter?(stage: LogicalRestoreFaultStage): Promise<void>;
  }> = { nowMs: () => Date.now() },
): LogicalRestoreRepository {
  return Object.freeze({
    async restore(snapshot) {
      try {
        return await kernel.write(async (transaction) => {
          const foreignKeys = await transaction.queryAll<{ foreign_keys: number }>("PRAGMA foreign_keys");
          if (foreignKeys[0]?.foreign_keys !== 1) {
            throw new LogicalRestoreRepositoryError("logical_restore_failed");
          }
          await transaction.execute("PRAGMA defer_foreign_keys = ON");
          await captureCurrentSourceOwnership(transaction);
          await input.faultAfter?.("captured_current_ownership");
          const triggers = await capturedRestoreTriggers(transaction);
          await dropRestoreTriggers(transaction, triggers, input.faultAfter);
          await deleteCurrentSources(transaction, input.faultAfter);
          await insertSnapshot(transaction, snapshot, input.faultAfter);
          await recreateRestoreTriggers(transaction, triggers, input.faultAfter);
          await verifySourceTables(transaction, snapshot);
          await input.faultAfter?.("verified");
          const [previousRestoreState] = await transaction.queryAll<{
            updated_at_ms: number;
          }>(
            "SELECT updated_at_ms FROM portability_restore_state WHERE id = 1",
          );
          if (previousRestoreState === undefined
            || !Number.isSafeInteger(previousRestoreState.updated_at_ms)
            || previousRestoreState.updated_at_ms < 0) {
            throw new LogicalRestoreRepositoryError("logical_restore_failed");
          }
          const stateUpdatedAtMs = Math.max(
            input.nowMs(),
            previousRestoreState.updated_at_ms + 1,
          );
          const state = await transaction.execute(
            "UPDATE portability_restore_state SET state = 'rebuild_pending', updated_at_ms = ? WHERE id = 1",
            [stateUpdatedAtMs],
          );
          if (state.changes !== 1) throw new LogicalRestoreRepositoryError("logical_restore_failed");
          await input.faultAfter?.("state_updated");
          const restoreState = await transaction.queryAll<{ state: string }>(
            "SELECT state FROM portability_restore_state WHERE id = 1",
          );
          if (restoreState.length !== 1 || restoreState[0]?.state !== "rebuild_pending") {
            throw new LogicalRestoreRepositoryError("logical_restore_failed");
          }
          return Object.freeze({ state: "rebuild_pending" as const });
        });
      } catch (error) {
        if (error instanceof LogicalRestoreRepositoryError) throw error;
        const restoreError = new LogicalRestoreRepositoryError("logical_restore_failed");
        Object.defineProperty(restoreError, "cause", { value: error });
        throw restoreError;
      }
    },
  });
}
