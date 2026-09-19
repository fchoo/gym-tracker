import {
  canonicalMergeValue,
  portableMergeArchiveSessionAggregate,
  portableMergeSessionAggregate,
  type MergeWriterPort,
  type StoredMergePreflight,
} from "../../../domains/portability/mergeCommands";
import {
  LOGICAL_BACKUP_TABLE_DEFINITIONS,
  type LogicalBackupRow,
  type LogicalBackupTableName,
} from "../../../domains/portability/backupContracts";
import type {
  PortableMergeAggregate,
  PortableMergePlan,
} from "../../../domains/portability/mergePlan";
import {
  isOpaquePortableId,
} from "../../../domains/portability/portableIdentity";
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

const FULL_PLAN_CUSTOM_EXERCISE_TABLES = Object.freeze([
  "taxonomy_terms",
  "exercises",
  "exercise_library_entries",
  "exercise_aliases",
  "exercise_search_terms",
  "exercise_taxonomy",
  "exercise_owner_preferences",
  "exercise_metric_baselines",
  "metric_profile_migration_events",
] as const satisfies readonly LogicalBackupTableName[]);

type FullPlanInsertTable = "app_settings" | (typeof FULL_PLAN_CUSTOM_EXERCISE_TABLES)[number];

export type LogicalMergeFaultStage =
  | "fingerprint_checked"
  | "verified"
  | "state_updated"
  | `trigger_drop:${typeof MERGE_DELETE_TRIGGER_NAMES[number]}`
  | `trigger_recreate:${typeof MERGE_DELETE_TRIGGER_NAMES[number]}`
  | `delete:${SessionAggregateTable}`
  | `insert:${SessionAggregateTable}`
  | `full_plan_insert:${FullPlanInsertTable}`;

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

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function fullPlanTable(value: string): value is (typeof FULL_PLAN_CUSTOM_EXERCISE_TABLES)[number] {
  return (FULL_PLAN_CUSTOM_EXERCISE_TABLES as readonly string[]).includes(value);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function customExerciseOperationKey(
  operation: Extract<PortableMergePlan["operations"][number], {
    aggregateClass: "custom_exercise";
  }>,
): string {
  return `${operation.archiveId}\u0000${operation.localId}`;
}

function assertCustomExerciseAggregate(
  aggregate: PortableMergeAggregate,
  operation: Extract<PortableMergePlan["operations"][number], {
    aggregateClass: "custom_exercise";
  }>,
): void {
  const roots = aggregate.tables.exercises;
  if (roots?.length !== 1 || roots[0]?.id !== operation.localId
    || roots[0]?.portable_id !== operation.portableId
    || (roots[0]?.origin !== "custom" && roots[0]?.origin !== "copied")) {
    fail();
  }
  if (aggregate.tables.exercise_library_entries?.length !== 1) fail();
  const exerciseRows = [
    "exercise_library_entries",
    "exercise_aliases",
    "exercise_search_terms",
    "exercise_taxonomy",
    "exercise_owner_preferences",
    "exercise_metric_baselines",
    "metric_profile_migration_events",
  ] as const;
  for (const [table, rows] of Object.entries(aggregate.tables)) {
    if (!fullPlanTable(table) || !Array.isArray(rows)) fail();
  }
  for (const table of exerciseRows) {
    if ((aggregate.tables[table] ?? []).some((row) => row.exercise_id !== operation.localId)) {
      fail();
    }
  }
  const taxonomyKeys = new Set((aggregate.tables.exercise_taxonomy ?? []).map((row) => {
    if (!nonEmptyText(row.kind) || !nonEmptyText(row.slug)) fail();
    return `${row.kind}\u0000${row.slug}`;
  }));
  const termKeys = new Set((aggregate.tables.taxonomy_terms ?? []).map((row) => {
    if (!nonEmptyText(row.kind) || !nonEmptyText(row.slug)) fail();
    return `${row.kind}\u0000${row.slug}`;
  }));
  if (taxonomyKeys.size !== termKeys.size
    || [...termKeys].some((key) => !taxonomyKeys.has(key))) {
    fail();
  }
}

function assertFullPlanSlice(plan: PortableMergePlan): void {
  const settingInserts = new Set<string>();
  const settingLocalWins = new Set<string>();
  const customWrites = new Map<string, Extract<PortableMergePlan["operations"][number], {
    aggregateClass: "custom_exercise";
  }>>();
  for (const operation of plan.operations) {
    if (operation.aggregateClass === "app_setting") {
      if ((operation.kind !== "insert" && operation.kind !== "local_won")
        || typeof operation.key !== "string" || operation.key.trim().length === 0) {
        fail();
      }
      if (operation.kind === "insert") {
        if (settingInserts.has(operation.key)) fail();
        settingInserts.add(operation.key);
      } else {
        if (settingLocalWins.has(operation.key)) fail();
        settingLocalWins.add(operation.key);
      }
      continue;
    }
    if (operation.aggregateClass === "custom_exercise") {
      if ((operation.kind !== "insert" && operation.kind !== "duplicate"
        && operation.kind !== "keep_both")
        || !isOpaquePortableId(operation.portableId)
        || !nonEmptyText(operation.archiveId) || !nonEmptyText(operation.localId)
        || customWrites.has(operation.portableId)) {
        fail();
      }
      customWrites.set(operation.portableId, operation);
      continue;
    }
    fail();
  }

  const settingKeys = new Set<string>();
  for (const row of plan.settings) {
    const key = row.key;
    if (typeof key !== "string" || key.trim().length === 0 || settingKeys.has(key)
      || !settingInserts.has(key)) {
      fail();
    }
    settingKeys.add(key);
  }
  if (settingKeys.size !== settingInserts.size) fail();

  const aggregates = new Map<string, PortableMergeAggregate>();
  for (const aggregate of plan.aggregates) {
    if (aggregate.aggregateClass !== "custom_exercise"
      || aggregates.has(aggregate.portableId)) {
      fail();
    }
    const operation = customWrites.get(aggregate.portableId);
    if (operation === undefined
      || (operation.kind !== "insert" && operation.kind !== "keep_both")) {
      fail();
    }
    assertCustomExerciseAggregate(aggregate, operation);
    aggregates.set(aggregate.portableId, aggregate);
  }
  for (const operation of customWrites.values()) {
    const hasAggregate = aggregates.has(operation.portableId);
    if (hasAggregate !== (operation.kind === "insert" || operation.kind === "keep_both")) {
      fail();
    }
  }
  if (plan.settings.length === 0 && plan.aggregates.length === 0) fail();
  const customOperationsByPair = new Map(
    [...customWrites.values()].map((operation) => [
      customExerciseOperationKey(operation),
      operation,
    ] as const),
  );
  const mappings = new Set<string>();
  for (const mapping of plan.idMappings) {
    const key = `${mapping.archiveId}\u0000${mapping.localId}`;
    if (mapping.recordClass !== "custom_exercise"
      || !customOperationsByPair.has(key) || mappings.has(key)) {
      fail();
    }
    mappings.add(key);
  }
  if (mappings.size !== customWrites.size) fail();
  const remaps = new Set<string>();
  for (const remap of plan.idRemaps) {
    const key = `${remap.archiveId}\u0000${remap.localId}`;
    const operation = customOperationsByPair.get(key);
    if (remap.recordClass !== "custom_exercise"
      || operation?.kind !== "keep_both" || remaps.has(key)) {
      fail();
    }
    remaps.add(key);
  }
  const expectedRemaps = [...customWrites.values()]
    .filter((operation) => operation.kind === "keep_both")
    .map(customExerciseOperationKey);
  if (remaps.size !== expectedRemaps.length
    || expectedRemaps.some((key) => !remaps.has(key))) {
    fail();
  }
}

function assertFullPlanMatchesLocal(
  plan: PortableMergePlan,
  local: Awaited<ReturnType<typeof readSqliteMergeLocalFacts>>,
): void {
  const settings = new Set((local.tables.app_settings ?? []).map((row) => {
    if (!nonEmptyText(row.key)) fail();
    return row.key;
  }));
  const exercises = local.tables.exercises ?? [];
  for (const operation of plan.operations) {
    if (operation.aggregateClass === "app_setting") {
      if ((operation.kind === "insert" && settings.has(operation.key))
        || (operation.kind === "local_won" && !settings.has(operation.key))) {
        fail();
      }
      continue;
    }
    const sameIdentity = exercises.filter((row) =>
      (row.origin === "custom" || row.origin === "copied")
      && row.portable_id === operation.portableId,
    );
    const localPhysicalIdTaken = exercises.some((row) => row.id === operation.localId);
    const archivePhysicalIdTaken = exercises.some((row) => row.id === operation.archiveId);
    if (operation.kind === "duplicate") {
      if (sameIdentity.length !== 1 || sameIdentity[0]?.id !== operation.localId) fail();
      continue;
    }
    if (sameIdentity.length !== 0 || localPhysicalIdTaken
      || (operation.kind === "insert" && operation.archiveId !== operation.localId)
      || (operation.kind === "keep_both" && (!archivePhysicalIdTaken
        || operation.archiveId === operation.localId))) {
      fail();
    }
  }
}

function snapshotFullPlan(plan: PortableMergePlan): PortableMergePlan {
  try {
    return JSON.parse(canonicalMergeValue(plan)) as PortableMergePlan;
  } catch {
    return fail();
  }
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
    `SELECT COUNT(*) AS count
     FROM owned_plan_schedule_opportunities
     WHERE session_id = ?`,
    [sessionId],
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

async function insertFullPlanRow(
  transaction: SqliteTransactionExecutor,
  table: FullPlanInsertTable,
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

async function insertFullPlanTaxonomyTerm(
  transaction: SqliteTransactionExecutor,
  row: LogicalBackupRow,
): Promise<void> {
  const kind = row.kind;
  const slug = row.slug;
  if (typeof kind !== "string" || typeof slug !== "string") fail();
  const existing = await transaction.queryAll<Record<string, unknown>>(
    "SELECT * FROM taxonomy_terms WHERE kind = ? AND slug = ?",
    [kind, slug],
  );
  if (existing.length > 1) fail();
  if (existing.length === 0) {
    await insertFullPlanRow(transaction, "taxonomy_terms", row);
    return;
  }
  for (const [column, value] of Object.entries(row)) {
    if (!hasOwn(existing[0]!, column) || existing[0]![column] !== value) fail();
  }
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

async function insertFullPlanSettings(
  transaction: SqliteTransactionExecutor,
  plan: PortableMergePlan,
  faultAfter: ((stage: LogicalMergeFaultStage) => Promise<void>) | undefined,
): Promise<void> {
  for (const row of plan.settings) {
    await insertFullPlanRow(transaction, "app_settings", row);
  }
  await faultAfter?.("full_plan_insert:app_settings");
}

async function insertCustomExerciseAggregate(
  transaction: SqliteTransactionExecutor,
  aggregate: PortableMergeAggregate,
  faultAfter: ((stage: LogicalMergeFaultStage) => Promise<void>) | undefined,
): Promise<void> {
  for (const table of FULL_PLAN_CUSTOM_EXERCISE_TABLES) {
    for (const row of aggregate.tables[table] ?? []) {
      if (table === "taxonomy_terms") {
        await insertFullPlanTaxonomyTerm(transaction, row);
      } else {
        await insertFullPlanRow(transaction, table, row);
      }
    }
    await faultAfter?.(`full_plan_insert:${table}`);
  }
}

async function verifyFullPlanSlice(
  transaction: SqliteTransactionExecutor,
  plan: PortableMergePlan,
): Promise<void> {
  const verifyRow = async (table: FullPlanInsertTable, row: LogicalBackupRow) => {
    const primaryKey = LOGICAL_BACKUP_TABLE_DEFINITIONS[table].primaryKey;
    const values = primaryKey.map((column) => scalar(row[column]));
    if (primaryKey.some((column) => !hasOwn(row, column))) fail();
    const actual = await transaction.queryAll<Record<string, unknown>>(
      `SELECT * FROM ${identifier(table)} WHERE ${primaryKey.map((column) =>
        `${identifier(column)} = ?`).join(" AND ")}`,
      values,
    );
    if (actual.length !== 1) fail();
    for (const [column, value] of Object.entries(row)) {
      if (!hasOwn(actual[0]!, column) || actual[0]![column] !== value) fail();
    }
  };
  for (const setting of plan.settings) await verifyRow("app_settings", setting);
  for (const aggregate of plan.aggregates) {
    const root = aggregate.tables.exercises?.[0];
    if (root === undefined || typeof root.id !== "string"
      || typeof root.portable_id !== "string") {
      fail();
    }
    for (const table of FULL_PLAN_CUSTOM_EXERCISE_TABLES) {
      for (const row of aggregate.tables[table] ?? []) {
        await verifyRow(table, row);
      }
    }
  }
  const foreignKeyCheck = await transaction.queryAll<Record<string, unknown>>(
    "PRAGMA foreign_key_check",
  );
  if (foreignKeyCheck.length !== 0) fail();
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

type LogicalMergeRepository = MergeWriterPort & Readonly<{
  /** Internal integration seam; SecureMergeCommands intentionally does not expose it. */
  commitFullPlan(input: Readonly<{
    localFingerprint: string;
    plan: PortableMergePlan;
  }>): Promise<Readonly<{ state: "rebuild_pending" }>>;
}>;

export function createLogicalMergeRepository(
  kernel: SqliteKernel,
  input: Readonly<{
    nowMs?(): number;
    sha256(value: string): Promise<string>;
    faultAfter?(stage: LogicalMergeFaultStage): Promise<void>;
  }>,
): LogicalMergeRepository {
  return Object.freeze({
    async commitFullPlan(fullPlanInput) {
      try {
        // This API is intentionally narrower than the planner. It stays
        // private until every aggregate class has a verified write path.
        const plan = snapshotFullPlan(fullPlanInput.plan);
        assertFullPlanSlice(plan);
        return await kernel.write(async (transaction) => {
          const local = await readSqliteMergeLocalFacts(transaction);
          const fingerprint = await input.sha256(canonicalMergeValue(local));
          if (fingerprint !== fullPlanInput.localFingerprint) fail();
          assertFullPlanSlice(plan);
          assertFullPlanMatchesLocal(plan, local);
          await input.faultAfter?.("fingerprint_checked");

          const foreignKeys = await transaction.queryAll<{ foreign_keys: number }>("PRAGMA foreign_keys");
          if (foreignKeys.length !== 1 || foreignKeys[0]?.foreign_keys !== 1) fail();
          await transaction.execute("PRAGMA defer_foreign_keys = ON");
          await insertFullPlanSettings(transaction, plan, input.faultAfter);
          for (const aggregate of plan.aggregates) {
            await insertCustomExerciseAggregate(transaction, aggregate, input.faultAfter);
          }
          await verifyFullPlanSlice(transaction, plan);
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
