import {
  canonicalMergeValue,
  portableMergeArchiveSessionAggregate,
  portableMergeSessionAggregate,
  type MergeWriterPort,
  type StoredMergePreflight,
} from "../../../domains/portability/mergeCommands";
import type { LogicalBackupRow } from "../../../domains/portability/backupContracts";
import {
  readSqliteMergeLocalFacts,
} from "./restorePreflightAdapters";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

const SESSION_AGGREGATE_TABLES = Object.freeze([
  "workout_sessions",
  "session_exercises",
  "session_sets",
  "session_rest_states",
  "session_advanced_timing_states",
  "session_undo_snapshots",
  "history_session_overlays",
  "history_audit_events",
  "workout_session_exercise_edit_receipts",
  "workout_session_exercise_reorder_receipts",
] as const);

const MERGE_DELETE_TRIGGER_NAMES = Object.freeze([
  "history_audit_events_immutable_delete",
  "workout_session_exercise_edit_receipts_immutable_delete",
  "workout_session_exercise_reorder_receipts_immutable_delete",
] as const);

type SessionAggregateTable = (typeof SESSION_AGGREGATE_TABLES)[number];

export type LogicalMergeFaultStage =
  | "fingerprint_checked"
  | "verified"
  | "state_updated"
  | `trigger_drop:${typeof MERGE_DELETE_TRIGGER_NAMES[number]}`
  | `trigger_recreate:${typeof MERGE_DELETE_TRIGGER_NAMES[number]}`
  | `delete:${SessionAggregateTable}`
  | `insert:${SessionAggregateTable}`;

export class LogicalMergeRepositoryError extends Error {
  readonly kind = "storage" as const;
  readonly retryable = true;
  readonly correlationCode = "GT-MERGE02" as const;

  constructor(readonly code: "logical_merge_failed") {
    super(code);
    this.name = "LogicalMergeRepositoryError";
  }
}

function fail(): never {
  throw new LogicalMergeRepositoryError("logical_merge_failed");
}

function identifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/u.test(value)) fail();
  return `"${value}"`;
}

function scalar(value: unknown): string | number | null {
  if (value === null || typeof value === "string") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  return fail();
}

function aggregateRows(
  tables: Readonly<Record<string, readonly LogicalBackupRow[]>>,
  table: SessionAggregateTable,
): readonly LogicalBackupRow[] {
  const rows = tables[table];
  return rows === undefined ? [] : rows;
}

async function captureDeleteTriggers(
  transaction: SqliteTransactionExecutor,
): Promise<ReadonlyMap<string, string>> {
  const placeholders = MERGE_DELETE_TRIGGER_NAMES.map(() => "?").join(", " );
  const rows = await transaction.queryAll<{ name: string; sql: string }>(
    `SELECT name, sql FROM sqlite_master
     WHERE type = 'trigger' AND name IN (${placeholders})
     ORDER BY name`,
    MERGE_DELETE_TRIGGER_NAMES,
  );
  if (rows.length !== MERGE_DELETE_TRIGGER_NAMES.length
    || rows.some((row) => typeof row.sql !== "string" || row.sql.trim().length === 0)) {
    fail();
  }
  return new Map(rows.map(({ name, sql }) => [name, sql]));
}

async function dropDeleteTriggers(
  transaction: SqliteTransactionExecutor,
  triggers: ReadonlyMap<string, string>,
  faultAfter: ((stage: LogicalMergeFaultStage) => Promise<void>) | undefined,
): Promise<void> {
  for (const name of MERGE_DELETE_TRIGGER_NAMES) {
    if (!triggers.has(name)) fail();
    await transaction.execute(`DROP TRIGGER ${identifier(name)}`);
    await faultAfter?.(`trigger_drop:${name}`);
  }
}

async function recreateDeleteTriggers(
  transaction: SqliteTransactionExecutor,
  triggers: ReadonlyMap<string, string>,
  faultAfter: ((stage: LogicalMergeFaultStage) => Promise<void>) | undefined,
): Promise<void> {
  for (const name of MERGE_DELETE_TRIGGER_NAMES) {
    const statement = triggers.get(name);
    if (statement === undefined) fail();
    await transaction.execute(statement);
    await faultAfter?.(`trigger_recreate:${name}`);
  }
  const recreated = await captureDeleteTriggers(transaction);
  if ([...triggers].some(([name, sql]) => recreated.get(name) !== sql)) fail();
}

async function assertNoExternalSessionReferences(
  transaction: SqliteTransactionExecutor,
  sessionId: string,
): Promise<void> {
  const references = await transaction.queryAll<{ count: number }>(
    `SELECT (
      (SELECT COUNT(*) FROM owned_plan_schedule_opportunities WHERE session_id = ?)
      + (SELECT COUNT(*) FROM pending_effects WHERE json_extract(payload_json, '$.sessionId') = ?)
    ) AS count`,
    [sessionId, sessionId],
  );
  if (references.length !== 1 || references[0]?.count !== 0) fail();
}

async function deleteLocalAggregate(
  transaction: SqliteTransactionExecutor,
  sessionId: string,
  faultAfter: ((stage: LogicalMergeFaultStage) => Promise<void>) | undefined,
): Promise<void> {
  const setWhere = "session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id = ?)";
  const steps = [
    ["session_advanced_timing_states", `session_id = ? OR session_set_id IN (SELECT id FROM session_sets WHERE ${setWhere})`, [sessionId, sessionId]],
    ["session_undo_snapshots", `session_id = ? OR completed_set_id IN (SELECT id FROM session_sets WHERE ${setWhere})`, [sessionId, sessionId]],
    ["session_rest_states", `session_id = ? OR next_set_id IN (SELECT id FROM session_sets WHERE ${setWhere})`, [sessionId, sessionId]],
    ["history_session_overlays", "session_id = ?", [sessionId]],
    ["history_audit_events", "session_id = ?", [sessionId]],
    ["workout_session_exercise_edit_receipts", "session_id = ?", [sessionId]],
    ["workout_session_exercise_reorder_receipts", "session_id = ?", [sessionId]],
    ["session_sets", setWhere, [sessionId]],
    ["session_exercises", "session_id = ?", [sessionId]],
    ["workout_sessions", "id = ?", [sessionId]],
  ] as const;
  for (const [table, where, parameters] of steps) {
    await transaction.execute(`DELETE FROM ${identifier(table)} WHERE ${where}`, parameters);
    await faultAfter?.(`delete:${table}`);
  }
}

async function insertRow(
  transaction: SqliteTransactionExecutor,
  table: SessionAggregateTable,
  row: LogicalBackupRow,
): Promise<void> {
  const columns = Object.keys(row);
  if (columns.length === 0) fail();
  const result = await transaction.execute(
    `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(", ")})
     VALUES (${columns.map(() => "?").join(", ")})`,
    columns.map((column) => scalar(row[column])),
  );
  if (result.changes !== 1) fail();
}

async function insertArchiveAggregate(
  transaction: SqliteTransactionExecutor,
  tables: Readonly<Record<string, readonly LogicalBackupRow[]>>,
  faultAfter: ((stage: LogicalMergeFaultStage) => Promise<void>) | undefined,
): Promise<void> {
  for (const table of SESSION_AGGREGATE_TABLES) {
    for (const row of aggregateRows(tables, table)) {
      await insertRow(transaction, table, row);
    }
    await faultAfter?.(`insert:${table}`);
  }
}

async function markRebuildPending(
  transaction: SqliteTransactionExecutor,
  nowMs: number,
): Promise<void> {
  const [previous] = await transaction.queryAll<{ updated_at_ms: number }>(
    "SELECT updated_at_ms FROM portability_restore_state WHERE id = 1",
  );
  const previousUpdatedAtMs = previous?.updated_at_ms;
  if (typeof previousUpdatedAtMs !== "number"
    || !Number.isSafeInteger(previousUpdatedAtMs)
    || previousUpdatedAtMs < 0) fail();
  const updatedAtMs = Math.max(nowMs, previousUpdatedAtMs + 1);
  const update = await transaction.execute(
    "UPDATE portability_restore_state SET state = 'rebuild_pending', updated_at_ms = ? WHERE id = 1",
    [updatedAtMs],
  );
  if (update.changes !== 1) fail();
  const state = await transaction.queryAll<{ state: string }>(
    "SELECT state FROM portability_restore_state WHERE id = 1",
  );
  if (state.length !== 1 || state[0]?.state !== "rebuild_pending") fail();
}

export function createLogicalMergeRepository(
  kernel: SqliteKernel,
  input: Readonly<{
    nowMs?(): number;
    sha256(value: string): Promise<string>;
    faultAfter?(stage: LogicalMergeFaultStage): Promise<void>;
  }>,
): MergeWriterPort {
  return Object.freeze({
    async commit(preflight) {
      try {
        return await kernel.write(async (transaction) => {
          const local = await readSqliteMergeLocalFacts(transaction);
          const fingerprint = await input.sha256(canonicalMergeValue(local));
          if (fingerprint !== preflight.localFingerprint) fail();
          await input.faultAfter?.("fingerprint_checked");
          if (preflight.operation.kind === "duplicate" || preflight.operation.kind === "local_won") {
            return Object.freeze({ state: "ready" as const });
          }
          const archive = portableMergeArchiveSessionAggregate(preflight.snapshot);

          const localSessions = (local.tables.workout_sessions ?? []).filter(
            (row) => row.portable_id === preflight.operation.portableId,
          );
          if (localSessions.length > 1) fail();
          if (preflight.operation.kind === "archive_won" && localSessions.length !== 1) fail();
          if (preflight.operation.kind === "insert" && localSessions.length !== 0) fail();
          if (archive.session.portable_id !== preflight.operation.portableId) fail();

          const foreignKeys = await transaction.queryAll<{ foreign_keys: number }>("PRAGMA foreign_keys");
          if (foreignKeys.length !== 1 || foreignKeys[0]?.foreign_keys !== 1) fail();
          await transaction.execute("PRAGMA defer_foreign_keys = ON");
          const triggers = await captureDeleteTriggers(transaction);
          await dropDeleteTriggers(transaction, triggers, input.faultAfter);
          if (localSessions[0]?.id !== undefined) {
            if (typeof localSessions[0].id !== "string") fail();
            await assertNoExternalSessionReferences(transaction, localSessions[0].id);
            await deleteLocalAggregate(transaction, localSessions[0].id, input.faultAfter);
          }
          await insertArchiveAggregate(transaction, archive.tables, input.faultAfter);
          await recreateDeleteTriggers(transaction, triggers, input.faultAfter);

          const verified = await readSqliteMergeLocalFacts(transaction);
          const mergedSession = (verified.tables.workout_sessions ?? []).find(
            (row) => row.id === archive.session.id,
          );
          if (mergedSession === undefined
            || canonicalMergeValue(portableMergeSessionAggregate(verified, mergedSession).tables)
              !== canonicalMergeValue(archive.tables)) {
            fail();
          }
          const foreignKeyCheck = await transaction.queryAll<Record<string, unknown>>("PRAGMA foreign_key_check");
          if (foreignKeyCheck.length !== 0) fail();
          await input.faultAfter?.("verified");
          await markRebuildPending(transaction, input.nowMs?.() ?? Date.now());
          await input.faultAfter?.("state_updated");
          return Object.freeze({ state: "rebuild_pending" as const });
        });
      } catch (error) {
        if (error instanceof LogicalMergeRepositoryError) throw error;
        const wrapped = new LogicalMergeRepositoryError("logical_merge_failed");
        Object.defineProperty(wrapped, "cause", { value: error });
        throw wrapped;
      }
    },
  });
}
