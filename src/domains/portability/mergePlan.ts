import {
  comparePortableMergeFreshness,
  isOpaquePortableId,
} from "./portableIdentity";
import type {
  LogicalBackupRow,
  LogicalBackupTableName,
} from "./backupContracts";
import {
  LOGICAL_BACKUP_TABLE_DEFINITIONS,
} from "./backupContracts";
import {
  LOGICAL_BACKUP_REFERENCE_DEFINITIONS,
} from "./restoreCommands";

type MergeTables = Readonly<Record<string, readonly LogicalBackupRow[]>>;

function workoutPreferenceKey(planId: string): string {
  return `gym_tracker.workout_plan_preferences.v1:${planId}`;
}

export type PortableMergeTableClass =
  | "metadata"
  | "app_setting"
  | "custom_exercise"
  | "owned_plan"
  | "workout_session"
  | "source_graph";

/**
 * Every persisted v2 source table belongs to exactly one merge aggregate
 * class. The planner remains fail-closed when a future portability table is
 * added without extending this map.
 */
export const PORTABLE_MERGE_TABLE_CLASSES = Object.freeze({
  portable_owner_identity: "metadata",
  app_settings: "app_setting",
  exercises: "custom_exercise",
  exercise_library_entries: "custom_exercise",
  exercise_owner_preferences: "custom_exercise",
  exercise_aliases: "custom_exercise",
  exercise_search_terms: "custom_exercise",
  exercise_taxonomy: "custom_exercise",
  taxonomy_terms: "custom_exercise",
  metric_profile_migration_events: "custom_exercise",
  exercise_metric_baselines: "custom_exercise",
  custom_exercise_mutation_receipts: "custom_exercise",
  plans: "owned_plan",
  plan_schedules: "owned_plan",
  plan_schedule_bindings: "owned_plan",
  plan_days: "owned_plan",
  plan_day_exercises: "owned_plan",
  plan_warmup_sets: "owned_plan",
  plan_working_set_targets: "owned_plan",
  progression_policies: "owned_plan",
  progression_recommendations: "owned_plan",
  progression_recommendation_decision_receipts: "owned_plan",
  owned_plan_aggregate_states: "owned_plan",
  owned_plan_mutation_requests: "owned_plan",
  owned_plan_starter_sources: "owned_plan",
  owned_plan_day_sources: "owned_plan",
  owned_plan_day_exercises: "owned_plan",
  owned_plan_warmup_sets: "owned_plan",
  owned_plan_working_set_targets: "owned_plan",
  owned_plan_progression_policies: "owned_plan",
  owned_plan_occurrence_sources: "owned_plan",
  owned_plan_schedules: "owned_plan",
  owned_plan_schedule_versions: "owned_plan",
  owned_plan_schedule_bindings: "owned_plan",
  owned_plan_schedule_overrides: "owned_plan",
  owned_plan_schedule_opportunities: "owned_plan",
  owned_plan_schedule_events: "owned_plan",
  starter_plan_activation_requests: "owned_plan",
  owned_progression_recommendations: "owned_plan",
  owned_progression_recommendation_decision_receipts: "owned_plan",
  workout_sessions: "workout_session",
  workout_session_exercise_edit_receipts: "workout_session",
  workout_session_exercise_reorder_receipts: "workout_session",
  workout_session_exercise_rest_default_receipts: "workout_session",
  session_exercises: "workout_session",
  session_sets: "workout_session",
  session_rest_states: "workout_session",
  session_advanced_timing_states: "workout_session",
  session_undo_snapshots: "workout_session",
  history_session_overlays: "workout_session",
  history_audit_events: "workout_session",
  running_plans: "owned_plan",
  running_session_revisions: "owned_plan",
  running_session_roots: "owned_plan",
  running_session_slot_roots: "owned_plan",
  running_session_slot_revisions: "owned_plan",
  running_plan_receipts: "owned_plan",
  running_plan_events: "owned_plan",
  running_goals: "owned_plan",
  running_session_slots: "owned_plan",
  running_opportunities: "owned_plan",
  schedule_collision_outcomes: "source_graph",
  schedule_collision_receipts: "source_graph",
  schedule_collision_projections: "source_graph",
  workout_provenance: "workout_session",
  workout_receipts: "workout_session",
  workout_session_schedule_links: "workout_session",
  workout_schedule_reconciliation_receipts: "workout_session",
  workout_completed_set_correction_receipts: "workout_session",
  imported_activities: "source_graph",
  imported_activity_payloads: "source_graph",
  imported_activity_references: "source_graph",
  imported_activity_laps: "source_graph",
  imported_activity_chunks: "source_graph",
  imported_activity_receipts: "source_graph",
  imported_activity_removal_events: "source_graph",
  imported_activity_identities: "source_graph",
  imported_activity_events: "source_graph",
  imported_activity_match_invalidations: "source_graph",
  imported_activity_revision_proposals: "source_graph",
  imported_activity_revision_decisions: "source_graph",
  running_match_events: "source_graph",
  running_current_matches: "source_graph",
  running_activity_match_events: "source_graph",
  running_activity_match_receipts: "source_graph",
  bodyweight_revisions: "source_graph",
  bodyweight_tombstones: "source_graph",
  bodyweight_entries: "source_graph",
  bodyweight_entry_events: "source_graph",
  bodyweight_command_receipts: "source_graph",
} satisfies Readonly<Record<LogicalBackupTableName, PortableMergeTableClass>>);

export type PortableMergePlanSnapshot = Readonly<{
  version: 2;
  schemaVersion: number;
  tables: MergeTables;
}>;

export type PortableMergePreview = Readonly<{
  inserted: number;
  duplicates: number;
  archiveWon: number;
  localWon: number;
  keptBoth: number;
  remapped: number;
  conflicts: number;
}>;

export type PortableMergeOperation =
  | Readonly<{
    aggregateClass: "workout_session";
    kind: "insert" | "duplicate" | "archive_won" | "local_won";
    portableId: string;
    archiveId: string;
    localId: string;
  }>
  | Readonly<{
    aggregateClass: "app_setting";
    kind: "insert" | "local_won";
    key: string;
  }>
  | Readonly<{
    aggregateClass: "custom_exercise";
    kind: "insert" | "duplicate" | "keep_both";
    portableId: string;
    archiveId: string;
    localId: string;
  }>
  | Readonly<{
    aggregateClass: "owned_plan";
    kind: "insert" | "duplicate" | "keep_both";
    portableId: string;
    archiveId: string;
    localId: string;
  }>
  | Readonly<{
    /** One stable source identity and its dependency closure. */
    aggregateClass: "source_graph";
    kind: "insert" | "duplicate" | "conflict";
    portableId: string;
    archiveId: string;
    localId: string;
  }>;

export type PortableMergeIdRemap = Readonly<{
  recordClass: "workout_session" | "custom_exercise" | "owned_plan" | "source_graph";
  archiveId: string;
  localId: string;
}>;

export type PortableMergeIdMapping = Readonly<{
  recordClass: "workout_session" | "custom_exercise" | "owned_plan" | "source_graph";
  archiveId: string;
  localId: string;
}>;

export type PortableMergeAggregate = Readonly<{
  aggregateClass: "workout_session" | "custom_exercise" | "owned_plan" | "source_graph";
  portableId: string;
  tables: Readonly<Record<string, readonly LogicalBackupRow[]>>;
}>;

export type PortableMergePlan = Readonly<{
  operations: readonly PortableMergeOperation[];
  idRemaps: readonly PortableMergeIdRemap[];
  idMappings: readonly PortableMergeIdMapping[];
  settings: readonly LogicalBackupRow[];
  aggregates: readonly PortableMergeAggregate[];
  preview: PortableMergePreview;
}>;

const PLANNER_ISSUED_PLANS = new WeakSet<object>();

export function isPlannerIssuedPortableMergePlan(
  value: unknown,
): value is PortableMergePlan {
  return typeof value === "object" && value !== null
    && PLANNER_ISSUED_PLANS.has(value);
}

export class MergePlanError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-MERGE-PLAN01" as const;

  constructor(readonly code: "merge_plan_invalid") {
    super(code);
    this.name = "MergePlanError";
  }
}

function invalid(): never {
  throw new MergePlanError("merge_plan_invalid");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalValueWithKeyCache(
  value: unknown,
  keyCache: Map<string, readonly string[]>,
): string {
  if (value === null || typeof value === "boolean"
    || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalValueWithKeyCache(entry, keyCache)).join(",")}]`;
  }
  if (!isPlainObject(value)) invalid();
  const naturalKeys = Object.keys(value);
  const shape = JSON.stringify(naturalKeys);
  let keys = keyCache.get(shape);
  if (keys === undefined) {
    keys = Object.freeze([...naturalKeys].sort());
    keyCache.set(shape, keys);
  }
  return `{${keys.map((key) => (
    `${JSON.stringify(key)}:${canonicalValueWithKeyCache(value[key], keyCache)}`
  )).join(",")}}`;
}

function canonicalValue(value: unknown): string {
  return canonicalValueWithKeyCache(value, new Map());
}

function ownerNamespace(snapshot: PortableMergePlanSnapshot): string {
  if (!Number.isSafeInteger(snapshot.schemaVersion) || snapshot.schemaVersion < 22) {
    invalid();
  }
  const rows = snapshot.tables.portable_owner_identity;
  if (rows === undefined || rows.length !== 1
    || rows[0]?.id !== 1
    || !isOpaquePortableId(rows[0]?.owner_namespace)) {
    invalid();
  }
  return rows[0]!.owner_namespace as string;
}

function nonNegativeInteger(value: unknown): number {
  if (typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 0) {
    invalid();
  }
  return value;
}

function sessionRows(snapshot: PortableMergePlanSnapshot): readonly LogicalBackupRow[] {
  const rows = snapshot.tables.workout_sessions;
  if (rows === undefined || !Array.isArray(rows)) invalid();
  return rows;
}

function assertSessionAggregateClosure(snapshot: PortableMergePlanSnapshot): void {
  const sessionIds = new Set(sessionRows(snapshot).map((row) => textId(row.id)));
  const exerciseIds = new Set<string>();
  for (const row of rowsFor(snapshot, "session_exercises")) {
    if (!sessionIds.has(textId(row.session_id))) invalid();
    exerciseIds.add(textId(row.id));
  }
  const setIds = new Set<string>();
  for (const row of rowsFor(snapshot, "session_sets")) {
    if (!exerciseIds.has(textId(row.session_exercise_id))) invalid();
    setIds.add(textId(row.id));
  }
  for (const table of [
    "session_rest_states",
    "session_advanced_timing_states",
    "session_undo_snapshots",
    "history_session_overlays",
    "history_audit_events",
    "workout_session_exercise_edit_receipts",
    "workout_session_exercise_reorder_receipts",
  ]) {
    for (const row of rowsFor(snapshot, table)) {
      if (!sessionIds.has(textId(row.session_id))) invalid();
    }
  }
  for (const row of rowsFor(snapshot, "session_rest_states")) {
    if (row.next_set_id !== null && row.next_set_id !== undefined
      && !setIds.has(textId(row.next_set_id))) invalid();
  }
  for (const row of rowsFor(snapshot, "session_advanced_timing_states")) {
    if (row.session_set_id !== null && row.session_set_id !== undefined
      && !setIds.has(textId(row.session_set_id))) invalid();
  }
  for (const row of rowsFor(snapshot, "session_undo_snapshots")) {
    if (!setIds.has(textId(row.completed_set_id))) invalid();
  }
}

function assertSessionMaterializationInputs(snapshot: PortableMergePlanSnapshot): void {
  const sessionIds = new Map(sessionRows(snapshot).map((row) => {
    const id = textId(row.id);
    return [id, id] as const;
  }));
  const exerciseIds = new Map(rowsFor(snapshot, "session_exercises").map((row) => {
    const id = textId(row.id);
    return [id, id] as const;
  }));
  const setIds = new Map(rowsFor(snapshot, "session_sets").map((row) => {
    const id = textId(row.id);
    return [id, id] as const;
  }));
  for (const session of sessionRows(snapshot)) {
    for (const [column, ids] of [
      ["active_session_exercise_id", exerciseIds],
      ["active_set_id", setIds],
    ] as const) {
      const value = session[column];
      if (value !== null && value !== undefined && !ids.has(textId(value))) invalid();
    }
  }
  for (const row of rowsFor(snapshot, "workout_session_exercise_edit_receipts")) {
    for (const column of ["subject_session_exercise_id", "replacement_session_exercise_id"] as const) {
      const value = row[column];
      if (value !== null && value !== undefined && !exerciseIds.has(textId(value))) invalid();
    }
    rewriteEditReceiptResult(
      row.result_json,
      row.operation,
      sessionIds,
      exerciseIds,
      setIds,
    );
  }
  for (const row of rowsFor(snapshot, "workout_session_exercise_reorder_receipts")) {
    rewriteReorderReceipt(row.ordered_session_exercise_ids_json, exerciseIds);
    rewriteReorderReceiptResult(row.result_json, sessionIds, exerciseIds);
  }
}

export const MERGE_DIGEST_CONCURRENCY = 4;

type SessionDigestIndex = ReadonlyMap<string, Readonly<Record<string, readonly LogicalBackupRow[]>>>;

/**
 * Builds the immutable session closure once per snapshot.  The former planner
 * re-filtered every table for every session, which became quadratic at the
 * supported archive bound.  Keeping this index private preserves the exact
 * canonical digest input while making each operation a lookup.
 */
function createSessionDigestIndex(snapshot: PortableMergePlanSnapshot): SessionDigestIndex {
  const sessions = sessionRows(snapshot);
  const bySession = new Map<string, Record<string, LogicalBackupRow[]>>();
  const exerciseSession = new Map<string, string>();
  const setSession = new Map<string, string>();
  for (const session of sessions) {
    const id = textId(session.id);
    bySession.set(id, { workout_sessions: [session] });
  }
  const append = (sessionId: string, table: string, row: LogicalBackupRow) => {
    const tables = bySession.get(sessionId);
    if (tables === undefined) return;
    (tables[table] ??= []).push(row);
  };
  for (const row of rowsFor(snapshot, "session_exercises")) {
    const sessionId = textId(row.session_id);
    exerciseSession.set(textId(row.id), sessionId);
    append(sessionId, "session_exercises", row);
  }
  for (const row of rowsFor(snapshot, "session_sets")) {
    const sessionId = exerciseSession.get(textId(row.session_exercise_id));
    if (sessionId !== undefined) {
      setSession.set(textId(row.id), sessionId);
      append(sessionId, "session_sets", row);
    }
  }
  for (const [table, rows] of Object.entries(snapshot.tables)) {
    if (table === "workout_sessions" || table === "session_exercises" || table === "session_sets") continue;
    for (const row of rows) {
      const candidates = new Set<string>();
      if (row.session_id !== null && row.session_id !== undefined) candidates.add(textId(row.session_id));
      if (row.session_exercise_id !== null && row.session_exercise_id !== undefined) {
        const id = exerciseSession.get(textId(row.session_exercise_id));
        if (id !== undefined) candidates.add(id);
      }
      for (const key of ["session_set_id", "completed_set_id"] as const) {
        if (row[key] !== null && row[key] !== undefined) {
          const id = setSession.get(textId(row[key]));
          if (id !== undefined) candidates.add(id);
        }
      }
      for (const sessionId of candidates) append(sessionId, table, row);
    }
  }
  return new Map([...bySession].map(([id, tables]) => [id, Object.freeze(
    Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, Object.freeze([...rows])])),
  )]));
}

function sessionDigestInput(
  snapshot: PortableMergePlanSnapshot,
  session: LogicalBackupRow,
  index?: SessionDigestIndex,
): string {
  const sessionId = session.id;
  if (typeof sessionId !== "string") invalid();
  const indexed = index?.get(sessionId);
  if (indexed !== undefined) return canonicalValue(indexed);
  const exercises = (snapshot.tables.session_exercises ?? []).filter(
    (row) => row.session_id === sessionId,
  );
  const exerciseIds = new Set(exercises.map((row) => row.id));
  const sets = (snapshot.tables.session_sets ?? []).filter(
    (row) => exerciseIds.has(row.session_exercise_id),
  );
  const setIds = new Set(sets.map((row) => row.id));
  const tables: Record<string, readonly LogicalBackupRow[]> = {};
  for (const [table, rows] of Object.entries(snapshot.tables)) {
    const selected = table === "workout_sessions"
      ? rows.filter((row) => row.id === sessionId)
      : rows.filter((row) => row.session_id === sessionId
        || exerciseIds.has(row.session_exercise_id)
        || setIds.has(row.session_set_id)
        || setIds.has(row.completed_set_id));
    if (selected.length > 0) tables[table] = selected;
  }
  return canonicalValue(tables);
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  map: (value: T) => Promise<R>,
): Promise<readonly R[]> {
  const output: R[] = new Array(values.length);
  let next = 0;
  const worker = async () => {
    while (next < values.length) {
      const index = next++;
      output[index] = await map(values[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

function parseJsonObject(serialized: unknown): Record<string, unknown> {
  if (typeof serialized !== "string") invalid();
  try {
    const parsed = JSON.parse(serialized);
    if (!isPlainObject(parsed)) invalid();
    return parsed;
  } catch {
    return invalid();
  }
}

function encodeJson(value: unknown): string {
  const encoded = JSON.stringify(value);
  return typeof encoded === "string" ? encoded : invalid();
}

function mappedIdentifier(
  mappings: ReadonlyMap<string, string>,
  value: unknown,
): string {
  const replacement = mappings.get(textId(value));
  return replacement === undefined ? invalid() : replacement;
}

function requiredMappedRow(
  rows: ReadonlyMap<string, LogicalBackupRow>,
  id: string,
): LogicalBackupRow {
  const row = rows.get(id);
  if (row === undefined) invalid();
  return row;
}

function rewriteEditReceiptResult(
  serialized: unknown,
  operation: unknown,
  sessionIds: ReadonlyMap<string, string>,
  exerciseIds: ReadonlyMap<string, string>,
  setIds: ReadonlyMap<string, string>,
): string {
  if (operation !== "replace_exercise" && operation !== "remove_exercise") invalid();
  const result = parseJsonObject(serialized);
  const rewritten: Record<string, unknown> = {
    ...result,
    sessionId: mappedIdentifier(sessionIds, result.sessionId),
    sessionExerciseId: mappedIdentifier(exerciseIds, result.sessionExerciseId),
  };
  if (operation === "replace_exercise") {
    rewritten.replacementSessionExerciseId = mappedIdentifier(
      exerciseIds,
      result.replacementSessionExerciseId,
    );
    rewritten.replacementSetId = mappedIdentifier(setIds, result.replacementSetId);
  }
  return encodeJson(rewritten);
}

function rewriteReorderReceipt(
  serialized: unknown,
  exerciseIds: ReadonlyMap<string, string>,
): string {
  if (typeof serialized !== "string") invalid();
  try {
    const values = JSON.parse(serialized);
    if (!Array.isArray(values)) invalid();
    return encodeJson(values.map((value) => mappedIdentifier(exerciseIds, value)));
  } catch {
    return invalid();
  }
}

function rewriteReorderReceiptResult(
  serialized: unknown,
  sessionIds: ReadonlyMap<string, string>,
  exerciseIds: ReadonlyMap<string, string>,
): string {
  const result = parseJsonObject(serialized);
  if (!Array.isArray(result.orderedSessionExerciseIds)
    || !Array.isArray(result.expectedSessionExerciseRevisions)) {
    invalid();
  }
  const rewritten: Record<string, unknown> = {
    ...result,
    sessionId: mappedIdentifier(sessionIds, result.sessionId),
    orderedSessionExerciseIds: result.orderedSessionExerciseIds.map((value) =>
      mappedIdentifier(exerciseIds, value)),
    expectedSessionExerciseRevisions: result.expectedSessionExerciseRevisions.map((value) => {
      if (!isPlainObject(value)) invalid();
      return {
        ...value,
        sessionExerciseId: mappedIdentifier(exerciseIds, value.sessionExerciseId),
      };
    }),
  };
  return encodeJson(rewritten);
}

function rewriteRestDefaultReceiptResult(
  serialized: unknown,
  sessionIds: ReadonlyMap<string, string>,
  exerciseIds: ReadonlyMap<string, string>,
): string {
  const result = parseJsonObject(serialized);
  if (result.version !== 1
    || typeof result.defaultRestSeconds !== "number"
    || !Number.isSafeInteger(result.defaultRestSeconds)
    || result.defaultRestSeconds < 0 || result.defaultRestSeconds > 86_400) {
    invalid();
  }
  return encodeJson({
    ...result,
    sessionId: mappedIdentifier(sessionIds, result.sessionId),
    sessionExerciseId: mappedIdentifier(exerciseIds, result.sessionExerciseId),
  });
}

function sessionAggregate(
  snapshot: PortableMergePlanSnapshot,
  local: PortableMergePlanSnapshot,
  portableId: string,
  localSessionId: string,
  indexed?: Readonly<{
    archiveSessionId: string;
    index: SessionDigestIndex;
    occupiedIdsFor(table: string, keyColumn?: string): Set<string>;
  }>,
): PortableMergeAggregate {
  const indexedTables = indexed === undefined
    ? undefined
    : indexed.index.get(indexed.archiveSessionId);
  const sessions = indexedTables?.workout_sessions
    ?? sessionRows(snapshot).filter((row) => row.portable_id === portableId);
  if (sessions.length !== 1 || sessions[0]?.portable_id !== portableId) invalid();
  const sessionId = textId(sessions[0]!.id);
  if (indexed !== undefined && sessionId !== indexed.archiveSessionId) invalid();
  const indexedRows = (table: string): readonly LogicalBackupRow[] | undefined =>
    indexedTables?.[table];
  const exercises = indexedRows("session_exercises")
    ?? rowsFor(snapshot, "session_exercises").filter((row) => row.session_id === sessionId);
  const mappedExercises = mappedRows(local, "session_exercises", exercises, [
    { column: "session_id", ids: new Map([[sessionId, localSessionId]]) },
  ], sessionId !== localSessionId, portableId, "id", undefined,
  indexed?.occupiedIdsFor("session_exercises"));
  const archiveExerciseIds = new Set(exercises.map((row) => textId(row.id)));
  const sets = indexedRows("session_sets")
    ?? rowsFor(snapshot, "session_sets")
      .filter((row) => archiveExerciseIds.has(textId(row.session_exercise_id)));
  const mappedSets = mappedRows(local, "session_sets", sets, [
    { column: "session_exercise_id", ids: mappedExercises.ids },
  ], sessionId !== localSessionId, portableId, "id", undefined,
  indexed?.occupiedIdsFor("session_sets"));
  const archiveSetIds = new Set(sets.map((row) => textId(row.id)));
  const immutableChildren = new Map<string, ReadonlyMap<string, string>>();
  for (const [table, keyColumn] of [
    ["session_undo_snapshots", "id"],
    ["history_audit_events", "id"],
    ["workout_session_exercise_edit_receipts", "request_id"],
    ["workout_session_exercise_reorder_receipts", "request_id"],
    ["workout_session_exercise_rest_default_receipts", "request_id"],
  ] as const) {
    const rows = indexedRows(table)
      ?? rowsFor(snapshot, table).filter((row) => row.session_id === sessionId);
    const mapped = mappedRows(local, table, rows, [
      { column: "session_id", ids: new Map([[sessionId, localSessionId]]) },
      { column: "completed_set_id", ids: mappedSets.ids, optional: true },
    ], sessionId !== localSessionId, portableId, keyColumn, undefined,
    indexed?.occupiedIdsFor(table, keyColumn));
    immutableChildren.set(table, mapped.ids);
  }
  const isKnown = (ids: ReadonlySet<string>, value: unknown): boolean =>
    value !== null && value !== undefined && ids.has(textId(value));
  const tables: Record<string, readonly LogicalBackupRow[]> = {};
  const sessionMap = new Map([[sessionId, localSessionId]]);
  const selectedEntries = indexedTables === undefined
    ? Object.entries(snapshot.tables).map(([table, rows]) => [
      table,
      table === "workout_sessions"
        ? rows.filter((row) => row.id === sessionId)
        : rows.filter((row) => row.session_id === sessionId
          || isKnown(archiveExerciseIds, row.session_exercise_id)
          || isKnown(archiveSetIds, row.session_set_id)
          || isKnown(archiveSetIds, row.completed_set_id)),
    ] as const)
    : Object.keys(snapshot.tables).flatMap((table) => {
      const rows = indexedTables[table];
      return rows === undefined ? [] : [[table, rows] as const];
    });
  const mappedExerciseRows = new Map(mappedExercises.rows.map((row) => [textId(row.id), row]));
  const mappedSetRows = new Map(mappedSets.rows.map((row) => [textId(row.id), row]));
  for (const [table, selected] of selectedEntries) {
    if (selected.length > 0) {
      tables[table] = Object.freeze(selected.map((row) => {
        let mapped: LogicalBackupRow = row;
        if (table === "workout_sessions") {
          mapped = Object.freeze({ ...mapped, id: localSessionId });
          for (const [column, ids] of [
            ["active_session_exercise_id", mappedExercises.ids],
            ["active_set_id", mappedSets.ids],
          ] as const) {
            const value = mapped[column];
            if (value === null || value === undefined) continue;
            const replacement = ids.get(textId(value));
            if (replacement === undefined) invalid();
            mapped = Object.freeze({ ...mapped, [column]: replacement });
          }
        }
        if (table === "session_exercises") {
          return requiredMappedRow(
            mappedExerciseRows,
            mappedIdentifier(mappedExercises.ids, row.id),
          );
        }
        if (table === "session_sets") {
          return requiredMappedRow(
            mappedSetRows,
            mappedIdentifier(mappedSets.ids, row.id),
          );
        }
        const immutableIds = immutableChildren.get(table);
        if (immutableIds !== undefined) {
          const keyColumn = table === "workout_session_exercise_edit_receipts"
            || table === "workout_session_exercise_reorder_receipts"
            || table === "workout_session_exercise_rest_default_receipts"
            ? "request_id"
            : "id";
          const replacement = mappedIdentifier(immutableIds, row[keyColumn]);
          if (replacement !== mapped[keyColumn]) {
            mapped = Object.freeze({ ...mapped, [keyColumn]: replacement });
          }
        }
        if (mapped.session_id === sessionId && localSessionId !== sessionId) {
          mapped = Object.freeze({ ...mapped, session_id: localSessionId });
        }
        if (mapped.session_exercise_id !== null && mapped.session_exercise_id !== undefined) {
          const replacement = mappedExercises.ids.get(textId(mapped.session_exercise_id));
          if (replacement !== undefined && replacement !== mapped.session_exercise_id) {
            mapped = Object.freeze({ ...mapped, session_exercise_id: replacement });
          }
        }
        if (table === "workout_session_exercise_edit_receipts") {
          for (const column of [
            "subject_session_exercise_id",
            "replacement_session_exercise_id",
          ] as const) {
            const value = mapped[column];
            if (value === null || value === undefined) continue;
            const replacement = mappedExercises.ids.get(textId(value));
            if (replacement === undefined) invalid();
            mapped = Object.freeze({ ...mapped, [column]: replacement });
          }
        }
        if (table === "workout_session_exercise_reorder_receipts") {
          mapped = Object.freeze({
            ...mapped,
            ordered_session_exercise_ids_json: rewriteReorderReceipt(
              mapped.ordered_session_exercise_ids_json,
              mappedExercises.ids,
            ),
          });
        }
        if (table === "workout_session_exercise_edit_receipts") {
          mapped = Object.freeze({
            ...mapped,
            result_json: rewriteEditReceiptResult(
              mapped.result_json,
              mapped.operation,
              sessionMap,
              mappedExercises.ids,
              mappedSets.ids,
            ),
          });
        }
        if (table === "workout_session_exercise_reorder_receipts") {
          mapped = Object.freeze({
            ...mapped,
            result_json: rewriteReorderReceiptResult(
              mapped.result_json,
              sessionMap,
              mappedExercises.ids,
            ),
          });
        }
        if (table === "workout_session_exercise_rest_default_receipts") {
          mapped = Object.freeze({
            ...mapped,
            result_json: rewriteRestDefaultReceiptResult(
              mapped.result_json,
              sessionMap,
              mappedExercises.ids,
            ),
          });
        }
        for (const column of ["session_set_id", "completed_set_id", "next_set_id"] as const) {
          const value = mapped[column];
          if (value === null || value === undefined) continue;
          const replacement = mappedSets.ids.get(textId(value));
          if (replacement !== undefined && replacement !== value) {
            mapped = Object.freeze({ ...mapped, [column]: replacement });
          }
        }
        return mapped;
      }));
    }
  }
  return Object.freeze({
    aggregateClass: "workout_session",
    portableId,
    tables: Object.freeze(tables),
  });
}

function countFor(
  operation: PortableMergeOperation,
): PortableMergePreview {
  return Object.freeze({
    inserted: operation.kind === "insert" ? 1 : 0,
    duplicates: operation.kind === "duplicate" ? 1 : 0,
    archiveWon: operation.kind === "archive_won" ? 1 : 0,
    localWon: operation.kind === "local_won" ? 1 : 0,
    keptBoth: operation.kind === "keep_both" ? 1 : 0,
    remapped: 0,
    conflicts: operation.kind === "conflict" ? 1 : 0,
  });
}

function addCounts(
  left: PortableMergePreview,
  right: PortableMergePreview,
): PortableMergePreview {
  return Object.freeze({
    inserted: left.inserted + right.inserted,
    duplicates: left.duplicates + right.duplicates,
    archiveWon: left.archiveWon + right.archiveWon,
    localWon: left.localWon + right.localWon,
    keptBoth: left.keptBoth + right.keptBoth,
    remapped: left.remapped + right.remapped,
    conflicts: left.conflicts + right.conflicts,
  });
}

function textId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) invalid();
  return value;
}

function rowsFor(
  snapshot: PortableMergePlanSnapshot,
  table: string,
): readonly LogicalBackupRow[] {
  const rows = snapshot.tables[table];
  return rows === undefined ? [] : rows;
}

function tupleKey(values: readonly unknown[]): string {
  return JSON.stringify(values);
}

function assertReferenceClosure(snapshot: PortableMergePlanSnapshot): void {
  for (const definition of LOGICAL_BACKUP_REFERENCE_DEFINITIONS) {
    const childRows = rowsFor(snapshot, definition.childTable);
    if (childRows.length === 0) continue;
    const parentRows = rowsFor(snapshot, definition.parentTable);
    const parentKeys = new Set(parentRows.map((row) => tupleKey(
      definition.parentColumns.map((column) => row[column]),
    )));
    for (const child of childRows) {
      const values = definition.childColumns.map((column) => child[column]);
      if (values.every((value) => value === null || value === undefined)) {
        continue;
      }
      if (values.some((value) => value === null || value === undefined)) invalid();
      if (parentKeys.has(tupleKey(values))) continue;
      if (definition.allowRetained === true) continue;
      invalid();
    }
  }
}

function settingPlan(
  archive: PortableMergePlanSnapshot,
  local: PortableMergePlanSnapshot,
  planMappings: ReadonlyMap<string, string>,
): Readonly<{
  operations: readonly PortableMergeOperation[];
  inserts: readonly LogicalBackupRow[];
}> {
  const localKeys = new Set<string>();
  for (const row of rowsFor(local, "app_settings")) {
    const key = textId(row.key);
    if (localKeys.has(key)) invalid();
    localKeys.add(key);
  }
  const archiveKeys = new Set<string>();
  const inserts: LogicalBackupRow[] = [];
  const operations = rowsFor(archive, "app_settings").map((source) => {
    let row = source;
    let key = textId(row.key);
    if (key.startsWith("gym_tracker.workout_plan_preferences.v1:")) {
      const archivePlanId = key.slice("gym_tracker.workout_plan_preferences.v1:".length);
      const localPlanId = planMappings.get(archivePlanId);
      if (localPlanId === undefined) invalid();
      let value: unknown;
      try { value = JSON.parse(textId(row.value_json)); } catch { invalid(); }
      if (typeof value !== "object" || value === null || Array.isArray(value)
        || (value as Record<string, unknown>).version !== 1
        || (value as Record<string, unknown>).planId !== archivePlanId) invalid();
      row = Object.freeze({ ...row, key: workoutPreferenceKey(localPlanId), value_json: JSON.stringify({
        ...(value as Record<string, unknown>), planId: localPlanId,
      }) });
      key = textId(row.key);
    }
    if (archiveKeys.has(key)) invalid();
    archiveKeys.add(key);
    const operation = Object.freeze({
      aggregateClass: "app_setting" as const,
      kind: localKeys.has(key) ? "local_won" as const : "insert" as const,
      key,
    });
    if (operation.kind === "insert") inserts.push(row);
    return operation;
  }).sort((left, right) => left.key.localeCompare(right.key));
  return Object.freeze({
    operations: Object.freeze(operations),
    inserts: Object.freeze(inserts.sort((left, right) =>
      textId(left.key).localeCompare(textId(right.key)))),
  });
}

function nextPhysicalId(
  recordClass: "workout_session" | "custom_exercise" | "owned_plan",
  portableId: string,
  occupied: Set<string>,
): string {
  const prefix = recordClass === "custom_exercise"
    ? "merge_exercise_"
    : recordClass === "owned_plan"
      ? "merge_plan_"
      : "merge_session_";
  let candidate = `${prefix}${portableId}`;
  let suffix = 1;
  while (occupied.has(candidate)) {
    candidate = `${prefix}${portableId}_${String(suffix)}`;
    suffix += 1;
  }
  occupied.add(candidate);
  return candidate;
}

function rootOperations(
  archive: PortableMergePlanSnapshot,
  local: PortableMergePlanSnapshot,
  input: Readonly<{
    aggregateClass: "custom_exercise" | "owned_plan";
    table: "exercises" | "plans";
  }>,
): Readonly<{
  operations: readonly PortableMergeOperation[];
  idRemaps: readonly PortableMergeIdRemap[];
  idMappings: readonly PortableMergeIdMapping[];
}> {
  const isOwned = (row: LogicalBackupRow) =>
    row.origin === "custom" || row.origin === "copied";
  const archiveRoots = rowsFor(archive, input.table).filter(isOwned);
  const localRoots = rowsFor(local, input.table).filter(isOwned);
  const localByPortableId = new Map<string, LogicalBackupRow>();
  const occupiedIds = new Set<string>();
  for (const row of rowsFor(local, input.table)) {
    occupiedIds.add(textId(row.id));
  }
  for (const row of localRoots) {
    const portableId = row.portable_id;
    if (!isOpaquePortableId(portableId) || localByPortableId.has(portableId)) {
      invalid();
    }
    localByPortableId.set(portableId, row);
  }
  const archivePortableIds = new Set<string>();
  const operations: PortableMergeOperation[] = [];
  const idRemaps: PortableMergeIdRemap[] = [];
  const idMappings: PortableMergeIdMapping[] = [];
  for (const root of [...archiveRoots].sort((left, right) =>
    textId(left.portable_id).localeCompare(textId(right.portable_id)))) {
    const archiveId = textId(root.id);
    const portableId = root.portable_id;
    if (!isOpaquePortableId(portableId) || archivePortableIds.has(portableId)) {
      invalid();
    }
    archivePortableIds.add(portableId);
    const existing = localByPortableId.get(portableId);
    if (existing !== undefined) {
      // Portable identity is owner-scoped, but a plan's sport is immutable
      // source meaning. Treat a changed kind as an unresolved preview
      // conflict instead of silently deduplicating incompatible aggregates.
      if (input.table === "plans" && existing.plan_kind !== root.plan_kind) {
        invalid();
      }
      const localId = textId(existing.id);
      operations.push(Object.freeze({
        aggregateClass: input.aggregateClass,
        kind: "duplicate",
        portableId,
        archiveId,
        localId,
      }));
      idMappings.push(Object.freeze({
        recordClass: input.aggregateClass,
        archiveId,
        localId,
      }));
      continue;
    }
    const physicalCollision = occupiedIds.has(archiveId);
    const localId = physicalCollision
      ? nextPhysicalId(input.aggregateClass, portableId, occupiedIds)
      : archiveId;
    if (!physicalCollision) occupiedIds.add(localId);
    operations.push(Object.freeze({
      aggregateClass: input.aggregateClass,
      kind: physicalCollision ? "keep_both" : "insert",
      portableId,
      archiveId,
      localId,
    }));
    idMappings.push(Object.freeze({
      recordClass: input.aggregateClass,
      archiveId,
      localId,
    }));
    if (physicalCollision) {
      idRemaps.push(Object.freeze({
        recordClass: input.aggregateClass,
        archiveId,
        localId,
      }));
    }
  }
  return Object.freeze({
    operations: Object.freeze(operations),
    idRemaps: Object.freeze(idRemaps),
    idMappings: Object.freeze(idMappings),
  });
}

function replaceScalar(
  row: LogicalBackupRow,
  column: string,
  oldValue: string,
  newValue: string,
): LogicalBackupRow {
  if (row[column] !== oldValue) return row;
  return Object.freeze({ ...row, [column]: newValue });
}

function exerciseAggregate(
  snapshot: PortableMergePlanSnapshot,
  local: PortableMergePlanSnapshot,
  operation: Extract<PortableMergeOperation, { aggregateClass: "custom_exercise" }>,
  numericAllocators?: Map<string, { occupied: Set<number>; nextId: number }>,
): PortableMergeAggregate {
  const archiveId = operation.archiveId;
  const localId = operation.localId;
  const tables: Record<string, readonly LogicalBackupRow[]> = {};
  const rowsForExercise = (table: string) => rowsFor(snapshot, table)
    .filter((row) => row.id === archiveId || row.exercise_id === archiveId)
    .map((row) => replaceScalar(row, "id", archiveId, localId))
    .map((row) => replaceScalar(row, "exercise_id", archiveId, localId));
  for (const table of [
    "exercises",
    "exercise_library_entries",
    "exercise_taxonomy",
    "exercise_owner_preferences",
    "exercise_metric_baselines",
  ]) {
    const rows = rowsForExercise(table);
    if (rows.length > 0) tables[table] = Object.freeze(rows);
  }
  for (const table of ["exercise_aliases", "exercise_search_terms"] as const) {
    const selected = rowsForExercise(table);
    let allocator = numericAllocators?.get(table);
    if (allocator === undefined) {
      const localIds = rowsFor(local, table).map((row) => {
        const id = row.id;
        if (typeof id !== "number" || !Number.isSafeInteger(id)) invalid();
        return id;
      });
      const archiveIds = rowsFor(snapshot, table).map((row) => {
        const id = row.id;
        if (typeof id !== "number" || !Number.isSafeInteger(id)) invalid();
        return id;
      });
      allocator = { occupied: new Set(localIds), nextId: Math.max(0, ...localIds, ...archiveIds) + 1 };
      numericAllocators?.set(table, allocator);
    }
    const rows = selected.map((row) => {
      const id = row.id;
      if (typeof id !== "number" || !Number.isSafeInteger(id)) invalid();
      if (!allocator!.occupied.has(id)) {
        allocator!.occupied.add(id);
        return row;
      }
      while (allocator!.occupied.has(allocator!.nextId)) allocator!.nextId += 1;
      const allocated = allocator!.nextId;
      allocator!.occupied.add(allocated);
      allocator!.nextId += 1;
      return Object.freeze({ ...row, id: allocated });
    });
    if (rows.length > 0) tables[table] = Object.freeze(rows);
  }
  const events = rowsForExercise("metric_profile_migration_events");
  const occupiedEventKeys = new Set(rowsFor(local, "metric_profile_migration_events").map(
    (row) => textId(row.idempotency_key),
  ));
  const eventRows = events.map((row, index) => {
    const key = textId(row.idempotency_key);
    if (!occupiedEventKeys.has(key)) {
      occupiedEventKeys.add(key);
      return row;
    }
    let candidate = `merge_metric_event_${operation.portableId}_${String(index)}`;
    let suffix = 1;
    while (occupiedEventKeys.has(candidate)) {
      candidate = `merge_metric_event_${operation.portableId}_${String(index)}_${String(suffix)}`;
      suffix += 1;
    }
    occupiedEventKeys.add(candidate);
    return Object.freeze({ ...row, idempotency_key: candidate });
  });
  if (eventRows.length > 0) {
    tables.metric_profile_migration_events = Object.freeze(eventRows);
  }
  const root = tables.exercises?.[0];
  if (root === undefined || root.id !== localId) invalid();
  const taxonomyKeys = new Set((tables.exercise_taxonomy ?? []).map((row) =>
    tupleKey([row.kind, row.slug]),
  ));
  const terms = rowsFor(snapshot, "taxonomy_terms").filter((row) =>
    taxonomyKeys.has(tupleKey([row.kind, row.slug])),
  );
  if (terms.length > 0) tables.taxonomy_terms = Object.freeze(terms);
  return Object.freeze({
    aggregateClass: "custom_exercise",
    portableId: operation.portableId,
    tables: Object.freeze(tables),
  });
}

function tableOccupiedIds(
  snapshot: PortableMergePlanSnapshot,
  table: string,
  keyColumn = "id",
): Set<string> {
  return new Set(rowsFor(snapshot, table).map((row) => textId(row[keyColumn])));
}

function remappedChildId(
  table: string,
  portableId: string,
  ordinal: number,
  occupied: Set<string>,
): string {
  const prefix = "merge_" + table + "_" + portableId + "_" + String(ordinal);
  let candidate = prefix;
  let suffix = 1;
  while (occupied.has(candidate)) {
    candidate = prefix + "_" + String(suffix);
    suffix += 1;
  }
  occupied.add(candidate);
  return candidate;
}

function mappedRows(
  snapshot: PortableMergePlanSnapshot,
  table: string,
  selected: readonly LogicalBackupRow[],
  rowMaps: readonly Readonly<{
    column: string;
    ids: ReadonlyMap<string, string>;
    optional?: true;
  }>[],
  remapIds: boolean,
  portableId: string,
  keyColumn = "id",
  keyIds?: ReadonlyMap<string, string>,
  occupiedIds?: Set<string>,
): Readonly<{ rows: readonly LogicalBackupRow[]; ids: ReadonlyMap<string, string> }> {
  const occupied = remapIds
    ? occupiedIds ?? tableOccupiedIds(snapshot, table, keyColumn)
    : undefined;
  const ids = new Map<string, string>();
  const ordered = remapIds
    ? [...selected].sort((left, right) =>
      textId(left[keyColumn]).localeCompare(textId(right[keyColumn])))
    : selected;
  for (const [index, row] of ordered.entries()) {
    const sourceId = textId(row[keyColumn]);
    const suppliedId = keyIds?.get(sourceId);
    if (keyIds !== undefined && suppliedId === undefined) invalid();
    const localId = suppliedId ?? (remapIds && occupied!.has(sourceId)
      ? remappedChildId(table, portableId, index, occupied!)
      : sourceId);
    occupied?.add(localId);
    ids.set(sourceId, localId);
  }
  const rows = selected.map((row) => {
    let mapped: LogicalBackupRow = row;
    for (const { column, ids: references, optional } of rowMaps) {
      const value = mapped[column];
      if (value === null || value === undefined) continue;
      const replacement = references.get(textId(value));
      if (replacement === undefined) {
        if (optional === true) continue;
        invalid();
      }
      if (replacement !== value) {
        mapped = Object.freeze({ ...mapped, [column]: replacement });
      }
    }
    const mappedId = ids.get(textId(row[keyColumn]))!;
    if (mapped[keyColumn] === mappedId && Object.isFrozen(mapped)) return mapped;
    return Object.freeze({ ...mapped, [keyColumn]: mappedId });
  });
  return Object.freeze({ rows: Object.freeze(rows), ids });
}

function planAggregate(
  snapshot: PortableMergePlanSnapshot,
  local: PortableMergePlanSnapshot,
  operation: Extract<PortableMergeOperation, { aggregateClass: "owned_plan" }>,
  exerciseMappings: ReadonlyMap<string, string>,
  planMappings: ReadonlyMap<string, string>,
  sessionMappings: ReadonlyMap<string, string>,
  referenceMaps?: Map<string, ReadonlyMap<string, string>>,
): PortableMergeAggregate {
  const archivePlanId = operation.archiveId;
  const localPlanId = operation.localId;
  const tables: Record<string, readonly LogicalBackupRow[]> = {};
  const recordMap = (table: string, ids: ReadonlyMap<string, string>): void => {
    referenceMaps?.set(table, ids);
  };
  const root = rowsFor(snapshot, "plans").filter((row) => row.id === archivePlanId);
  if (root.length !== 1) invalid();
  const planKind = root[0]!.plan_kind;
  const activeLocalPlanExists = rowsFor(local, "plans").some(
    (row) => row.is_active === 1 && (
      typeof planKind !== "string" || row.plan_kind === planKind
    ),
  );
  const importedRoot = Object.freeze({
    ...root[0]!,
    id: localPlanId,
    ...(root[0]!.is_active === 1 && activeLocalPlanExists ? { is_active: 0 } : {}),
  });
  tables.plans = Object.freeze([importedRoot]);

  if (planMappings.get(archivePlanId) !== localPlanId) invalid();
  const planMap = new Map([[archivePlanId, localPlanId]]);
  recordMap("plans", planMap);
  const days = rowsFor(snapshot, "plan_days").filter((row) => row.plan_id === archivePlanId);
  const mappedDays = mappedRows(local, "plan_days", days, [
    { column: "plan_id", ids: planMap },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedDays.rows.length > 0) tables.plan_days = mappedDays.rows;
  recordMap("plan_days", mappedDays.ids);

  const occurrences = rowsFor(snapshot, "plan_day_exercises")
    .filter((row) => mappedDays.ids.has(textId(row.plan_day_id)));
  const mappedOccurrences = mappedRows(local, "plan_day_exercises", occurrences, [
    { column: "plan_day_id", ids: mappedDays.ids },
    { column: "exercise_id", ids: exerciseMappings, optional: true },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedOccurrences.rows.length > 0) {
    tables.plan_day_exercises = mappedOccurrences.rows;
  }

  const legacySchedules = rowsFor(snapshot, "plan_schedules")
    .filter((row) => row.plan_id === archivePlanId);
  const mappedLegacySchedules = mappedRows(local, "plan_schedules", legacySchedules, [
    { column: "plan_id", ids: planMap },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedLegacySchedules.rows.length > 0) {
    tables.plan_schedules = mappedLegacySchedules.rows;
  }
  const legacyBindings = rowsFor(snapshot, "plan_schedule_bindings")
    .filter((row) => mappedLegacySchedules.ids.has(textId(row.schedule_id)));
  const mappedLegacyBindings = mappedRows(local, "plan_schedule_bindings", legacyBindings, [
    { column: "schedule_id", ids: mappedLegacySchedules.ids },
    { column: "plan_day_id", ids: mappedDays.ids },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedLegacyBindings.rows.length > 0) {
    tables.plan_schedule_bindings = mappedLegacyBindings.rows;
  }

  const ownedSchedules = rowsFor(snapshot, "owned_plan_schedules")
    .filter((row) => row.plan_id === archivePlanId);
  const mappedOwnedSchedules = mappedRows(local, "owned_plan_schedules", ownedSchedules, [
    { column: "plan_id", ids: planMap },
  ], operation.kind === "keep_both", operation.portableId);
  const activeLocalScheduleExists = rowsFor(local, "owned_plan_schedules")
    .some((row) => row.lifecycle === "active" && (
      typeof planKind !== "string" || row.plan_kind === planKind
    ));
  const normalizedOwnedSchedules = mappedOwnedSchedules.rows.map((row) =>
    row.lifecycle === "active" && activeLocalScheduleExists
      ? Object.freeze({
        ...row,
        lifecycle: "inactive",
        ...(row.deactivated_at_ms === null || row.deactivated_at_ms === undefined
          ? { deactivated_at_ms: row.activated_at_ms }
          : {}),
      })
      : row,
  );
  if (mappedOwnedSchedules.rows.length > 0) {
    tables.owned_plan_schedules = Object.freeze(normalizedOwnedSchedules);
  }
  recordMap("owned_plan_schedules", mappedOwnedSchedules.ids);

  const scheduleVersions = rowsFor(snapshot, "owned_plan_schedule_versions")
    .filter((row) => mappedOwnedSchedules.ids.has(textId(row.schedule_id)));
  const mappedScheduleVersions = mappedRows(local, "owned_plan_schedule_versions", scheduleVersions, [
    { column: "schedule_id", ids: mappedOwnedSchedules.ids },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedScheduleVersions.rows.length > 0) {
    tables.owned_plan_schedule_versions = mappedScheduleVersions.rows;
  }
  recordMap("owned_plan_schedule_versions", mappedScheduleVersions.ids);

  const scheduleBindings = rowsFor(snapshot, "owned_plan_schedule_bindings")
    .filter((row) => mappedScheduleVersions.ids.has(textId(row.schedule_version_id)));
  const mappedScheduleBindings = mappedRows(local, "owned_plan_schedule_bindings", scheduleBindings, [
    { column: "schedule_version_id", ids: mappedScheduleVersions.ids },
    { column: "plan_day_id", ids: mappedDays.ids },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedScheduleBindings.rows.length > 0) {
    tables.owned_plan_schedule_bindings = mappedScheduleBindings.rows;
  }

  for (const table of [
    "owned_plan_schedule_overrides",
    "owned_plan_schedule_opportunities",
    "owned_plan_schedule_events",
  ]) {
    const rows = rowsFor(snapshot, table)
      .filter((row) => mappedOwnedSchedules.ids.has(textId(row.schedule_id)));
    const maps = [
      { column: "schedule_id", ids: mappedOwnedSchedules.ids },
      { column: "plan_day_id", ids: mappedDays.ids, optional: true as const },
      { column: "schedule_version_id", ids: mappedScheduleVersions.ids, optional: true as const },
      { column: "session_id", ids: sessionMappings, optional: true as const },
    ];
    const mapped = mappedRows(local, table, rows, maps,
      operation.kind === "keep_both", operation.portableId);
    if (mapped.rows.length > 0) tables[table] = mapped.rows;
    recordMap(table, mapped.ids);
  }

  const runningRoots = rowsFor(snapshot, "running_plans")
    .filter((row) => row.plan_id === archivePlanId);
  const mappedRunningRoots = mappedRows(local, "running_plans", runningRoots, [
    { column: "plan_id", ids: planMap },
  ], operation.kind === "keep_both", operation.portableId, "plan_id", planMap);
  if (mappedRunningRoots.rows.length > 0) tables.running_plans = mappedRunningRoots.rows;
  recordMap("running_plans", mappedRunningRoots.ids);

  const runningRevisions = rowsFor(snapshot, "running_session_revisions")
    .filter((row) => row.plan_id === archivePlanId);
  const mappedRunningRevisions = mappedRows(local, "running_session_revisions", runningRevisions, [
    { column: "plan_id", ids: planMap },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedRunningRevisions.rows.length > 0) tables.running_session_revisions = mappedRunningRevisions.rows;
  recordMap("running_session_revisions", mappedRunningRevisions.ids);

  const runningSessionRoots = rowsFor(snapshot, "running_session_roots")
    .filter((row) => row.plan_id === archivePlanId);
  const mappedRunningSessionRoots = mappedRows(local, "running_session_roots", runningSessionRoots, [
    { column: "plan_id", ids: planMap },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedRunningSessionRoots.rows.length > 0) tables.running_session_roots = mappedRunningSessionRoots.rows;
  recordMap("running_session_roots", mappedRunningSessionRoots.ids);

  const runningSlotRoots = rowsFor(snapshot, "running_session_slot_roots")
    .filter((row) => row.plan_id === archivePlanId);
  const mappedRunningSlotRoots = mappedRows(local, "running_session_slot_roots", runningSlotRoots, [
    { column: "plan_id", ids: planMap },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedRunningSlotRoots.rows.length > 0) tables.running_session_slot_roots = mappedRunningSlotRoots.rows;
  recordMap("running_session_slot_roots", mappedRunningSlotRoots.ids);

  const runningSlotRevisions = rowsFor(snapshot, "running_session_slot_revisions")
    .filter((row) => mappedRunningSlotRoots.ids.has(textId(row.slot_root_id)));
  const mappedRunningSlotRevisions = mappedRows(local, "running_session_slot_revisions", runningSlotRevisions, [
    { column: "slot_root_id", ids: mappedRunningSlotRoots.ids },
    { column: "session_root_id", ids: mappedRunningSessionRoots.ids },
    { column: "session_revision_id", ids: mappedRunningRevisions.ids },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedRunningSlotRevisions.rows.length > 0) tables.running_session_slot_revisions = mappedRunningSlotRevisions.rows;
  recordMap("running_session_slot_revisions", mappedRunningSlotRevisions.ids);

  for (const table of ["running_plan_receipts", "running_plan_events", "running_goals"] as const) {
    const rows = rowsFor(snapshot, table).filter((row) => row.plan_id === archivePlanId);
    const mapped = mappedRows(local, table, rows, [
      { column: "plan_id", ids: planMap },
    ], operation.kind === "keep_both", operation.portableId,
    LOGICAL_BACKUP_TABLE_DEFINITIONS[table].primaryKey[0]!);
    if (mapped.rows.length > 0) tables[table] = mapped.rows;
    recordMap(table, mapped.ids);
  }

  const runningSlots = rowsFor(snapshot, "running_session_slots")
    .filter((row) => row.plan_id === archivePlanId);
  const mappedRunningSlots = mappedRows(local, "running_session_slots", runningSlots, [
    { column: "plan_id", ids: planMap },
    { column: "session_revision_id", ids: mappedRunningRevisions.ids },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedRunningSlots.rows.length > 0) tables.running_session_slots = mappedRunningSlots.rows;
  recordMap("running_session_slots", mappedRunningSlots.ids);

  const runningOpportunities = rowsFor(snapshot, "running_opportunities")
    .filter((row) => row.plan_id === archivePlanId);
  const mappedRunningOpportunities = mappedRows(local, "running_opportunities", runningOpportunities, [
    { column: "plan_id", ids: planMap },
    { column: "schedule_id", ids: mappedOwnedSchedules.ids },
    { column: "schedule_version_id", ids: mappedScheduleVersions.ids },
    { column: "slot_id", ids: mappedRunningSlots.ids },
    { column: "session_revision_id", ids: mappedRunningRevisions.ids },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedRunningOpportunities.rows.length > 0) tables.running_opportunities = mappedRunningOpportunities.rows;
  recordMap("running_opportunities", mappedRunningOpportunities.ids);

  const ownedDayExercises = rowsFor(snapshot, "owned_plan_day_exercises")
    .filter((row) => mappedDays.ids.has(textId(row.plan_day_id)));
  const mappedOwnedDayExercises = mappedRows(local, "owned_plan_day_exercises", ownedDayExercises, [
    { column: "plan_day_id", ids: mappedDays.ids },
    { column: "exercise_id", ids: exerciseMappings, optional: true },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedOwnedDayExercises.rows.length > 0) {
    tables.owned_plan_day_exercises = mappedOwnedDayExercises.rows;
  }

  const ownedWarmups = rowsFor(snapshot, "owned_plan_warmup_sets")
    .filter((row) => mappedOwnedDayExercises.ids.has(textId(row.plan_day_exercise_id)));
  const mappedOwnedWarmups = mappedRows(local, "owned_plan_warmup_sets", ownedWarmups, [
    { column: "plan_day_exercise_id", ids: mappedOwnedDayExercises.ids },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedOwnedWarmups.rows.length > 0) tables.owned_plan_warmup_sets = mappedOwnedWarmups.rows;

  const ownedTargets = rowsFor(snapshot, "owned_plan_working_set_targets")
    .filter((row) => mappedOwnedDayExercises.ids.has(textId(row.plan_day_exercise_id)));
  const mappedOwnedTargets = mappedRows(local, "owned_plan_working_set_targets", ownedTargets, [
    { column: "plan_day_exercise_id", ids: mappedOwnedDayExercises.ids },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedOwnedTargets.rows.length > 0) {
    tables.owned_plan_working_set_targets = mappedOwnedTargets.rows;
  }

  const ownedPolicies = rowsFor(snapshot, "owned_plan_progression_policies")
    .filter((row) => mappedOwnedDayExercises.ids.has(textId(row.plan_day_exercise_id)));
  const mappedOwnedPolicies = mappedRows(local, "owned_plan_progression_policies", ownedPolicies, [
    { column: "plan_day_exercise_id", ids: mappedOwnedDayExercises.ids },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedOwnedPolicies.rows.length > 0) {
    tables.owned_plan_progression_policies = mappedOwnedPolicies.rows;
  }

  const occurrenceSources = rowsFor(snapshot, "owned_plan_occurrence_sources")
    .filter((row) => mappedOwnedDayExercises.ids.has(textId(row.plan_day_exercise_id)));
  const mappedOccurrenceSources = mappedRows(local, "owned_plan_occurrence_sources", occurrenceSources, [
    { column: "plan_day_exercise_id", ids: mappedOwnedDayExercises.ids },
    { column: "plan_day_id", ids: mappedDays.ids },
  ], operation.kind === "keep_both", operation.portableId, "plan_day_exercise_id", mappedOwnedDayExercises.ids);
  if (mappedOccurrenceSources.rows.length > 0) {
    tables.owned_plan_occurrence_sources = mappedOccurrenceSources.rows;
  }

  for (const table of [
    "owned_plan_aggregate_states",
    "owned_plan_starter_sources",
  ]) {
    const rows = rowsFor(snapshot, table)
      .filter((row) => row.plan_id === archivePlanId);
    const mapped = mappedRows(local, table, rows, [
      { column: "plan_id", ids: planMap },
    ], operation.kind === "keep_both", operation.portableId, "plan_id", planMap);
    if (mapped.rows.length > 0) tables[table] = mapped.rows;
  }

  const daySources = rowsFor(snapshot, "owned_plan_day_sources")
    .filter((row) => mappedDays.ids.has(textId(row.plan_day_id)));
  const mappedDaySources = mappedRows(local, "owned_plan_day_sources", daySources, [
    { column: "plan_day_id", ids: mappedDays.ids },
    { column: "plan_id", ids: planMap },
  ], operation.kind === "keep_both", operation.portableId, "plan_day_id", mappedDays.ids);
  if (mappedDaySources.rows.length > 0) tables.owned_plan_day_sources = mappedDaySources.rows;

  const mutationRequests = rowsFor(snapshot, "owned_plan_mutation_requests")
    .filter((row) => row.result_plan_id === archivePlanId || row.source_plan_id === archivePlanId);
  const mappedMutationRequests = mappedRows(local, "owned_plan_mutation_requests", mutationRequests, [
    { column: "source_plan_id", ids: planMappings, optional: true },
    { column: "result_plan_id", ids: planMappings },
  ], operation.kind === "keep_both", operation.portableId, "request_id");
  if (mappedMutationRequests.rows.length > 0) {
    tables.owned_plan_mutation_requests = mappedMutationRequests.rows;
  }

  const activationRequests = rowsFor(snapshot, "starter_plan_activation_requests")
    .filter((row) => row.result_plan_id === archivePlanId || row.selected_plan_id === archivePlanId);
  const mappedActivationRequests = mappedRows(local, "starter_plan_activation_requests", activationRequests, [
    { column: "selected_plan_id", ids: planMappings, optional: true },
    { column: "result_plan_id", ids: planMappings },
    { column: "result_schedule_id", ids: mappedOwnedSchedules.ids },
  ], operation.kind === "keep_both", operation.portableId, "request_id");
  if (mappedActivationRequests.rows.length > 0) {
    tables.starter_plan_activation_requests = mappedActivationRequests.rows;
  }

  const legacyWarmups = rowsFor(snapshot, "plan_warmup_sets")
    .filter((row) => mappedOccurrences.ids.has(textId(row.plan_day_exercise_id)));
  const mappedLegacyWarmups = mappedRows(local, "plan_warmup_sets", legacyWarmups, [
    { column: "plan_day_exercise_id", ids: mappedOccurrences.ids },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedLegacyWarmups.rows.length > 0) tables.plan_warmup_sets = mappedLegacyWarmups.rows;

  const legacyTargets = rowsFor(snapshot, "plan_working_set_targets")
    .filter((row) => mappedOccurrences.ids.has(textId(row.plan_day_exercise_id)));
  const mappedLegacyTargets = mappedRows(local, "plan_working_set_targets", legacyTargets, [
    { column: "plan_day_exercise_id", ids: mappedOccurrences.ids },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedLegacyTargets.rows.length > 0) {
    tables.plan_working_set_targets = mappedLegacyTargets.rows;
  }

  const legacyPolicies = rowsFor(snapshot, "progression_policies")
    .filter((row) => mappedOccurrences.ids.has(textId(row.plan_day_exercise_id)));
  const mappedLegacyPolicies = mappedRows(local, "progression_policies", legacyPolicies, [
    { column: "plan_day_exercise_id", ids: mappedOccurrences.ids },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedLegacyPolicies.rows.length > 0) tables.progression_policies = mappedLegacyPolicies.rows;

  const recommendations = rowsFor(snapshot, "progression_recommendations")
    .filter((row) => mappedLegacyTargets.ids.has(textId(row.plan_working_set_target_id)));
  const mappedRecommendations = mappedRows(local, "progression_recommendations", recommendations, [
    { column: "plan_working_set_target_id", ids: mappedLegacyTargets.ids },
    { column: "exercise_id", ids: exerciseMappings, optional: true },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedRecommendations.rows.length > 0) {
    tables.progression_recommendations = mappedRecommendations.rows;
  }

  const ownedRecommendations = rowsFor(snapshot, "owned_progression_recommendations")
    .filter((row) => mappedOwnedTargets.ids.has(textId(row.owned_plan_working_set_target_id)));
  const mappedOwnedRecommendations = mappedRows(local, "owned_progression_recommendations", ownedRecommendations, [
    { column: "owned_plan_working_set_target_id", ids: mappedOwnedTargets.ids },
    { column: "exercise_id", ids: exerciseMappings, optional: true },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedOwnedRecommendations.rows.length > 0) {
    tables.owned_progression_recommendations = mappedOwnedRecommendations.rows;
  }
  return Object.freeze({
    aggregateClass: "owned_plan",
    portableId: operation.portableId,
    tables: Object.freeze(tables),
  });
}

async function sessionOperation(
  archive: PortableMergePlanSnapshot,
  local: PortableMergePlanSnapshot,
  archiveSession: LogicalBackupRow,
  localSessions: readonly LogicalBackupRow[],
  occupiedIds: Set<string>,
  payloadDigest: (value: string) => Promise<string>,
  archiveDigestIndex?: SessionDigestIndex,
  localDigestIndex?: SessionDigestIndex,
): Promise<Extract<PortableMergeOperation, {
  aggregateClass: "workout_session";
}>> {
  const archiveId = textId(archiveSession.id);
  const portableId = archiveSession.portable_id;
  if (!isOpaquePortableId(portableId)) invalid();
  const archiveModifiedAtMs = nonNegativeInteger(
    archiveSession.merge_modified_at_ms,
  );
  if (localSessions.length === 0) {
    const localId = occupiedIds.has(archiveId)
      ? nextPhysicalId("workout_session", portableId, occupiedIds)
      : archiveId;
    occupiedIds.add(localId);
    return Object.freeze({
      aggregateClass: "workout_session", kind: "insert", portableId, archiveId, localId,
    });
  }
  if (localSessions.length !== 1) invalid();
  const localSession = localSessions[0]!;
  const localId = textId(localSession.id);
  const localPortableId = localSession.portable_id;
  if (!isOpaquePortableId(localPortableId)) invalid();
  const localModifiedAtMs = nonNegativeInteger(
    localSession.merge_modified_at_ms,
  );
  const freshness = comparePortableMergeFreshness(
    { mergeModifiedAtMs: archiveModifiedAtMs, portableId },
    { mergeModifiedAtMs: localModifiedAtMs, portableId: localPortableId },
  );
  if (freshness > 0) {
    return Object.freeze({
      aggregateClass: "workout_session", kind: "archive_won", portableId, archiveId, localId,
    });
  }
  if (freshness < 0) {
    return Object.freeze({
      aggregateClass: "workout_session", kind: "local_won", portableId, archiveId, localId,
    });
  }
  const [archiveDigest, localDigest] = await Promise.all([
    payloadDigest(sessionDigestInput(archive, archiveSession, archiveDigestIndex)),
    payloadDigest(sessionDigestInput(local, localSession, localDigestIndex)),
  ]);
  if (!/^[a-f0-9]{64}$/u.test(archiveDigest)
    || !/^[a-f0-9]{64}$/u.test(localDigest)) {
    invalid();
  }
  return Object.freeze({
    aggregateClass: "workout_session",
    kind: archiveDigest === localDigest
      ? "duplicate"
      : archiveDigest > localDigest ? "archive_won" : "local_won",
    portableId,
    archiveId,
    localId,
  });
}

function operationKey(operation: PortableMergeOperation): string {
  return operation.aggregateClass === "app_setting"
    ? "app_setting:" + operation.key
    : operation.aggregateClass + ":" + operation.portableId;
}

/**
 * These are the authoritative Phase 13 facts.  Current match rows are a
 * rebuildable projection and deliberately never cross the archive boundary.
 * The order is the FK insertion order for an empty local database.
 */
const PHASE13_SOURCE_GRAPH_TABLES = Object.freeze([
  "imported_activities", "imported_activity_identities",
  "imported_activity_payloads", "imported_activity_references",
  "imported_activity_laps", "imported_activity_chunks",
  "imported_activity_receipts", "imported_activity_removal_events",
  "imported_activity_events", "imported_activity_match_invalidations",
  "imported_activity_revision_proposals", "imported_activity_revision_decisions",
  "bodyweight_revisions", "bodyweight_entries", "bodyweight_tombstones",
  "bodyweight_entry_events", "bodyweight_command_receipts",
  "running_match_events", "running_activity_match_events",
  "running_activity_match_receipts",
  "schedule_collision_outcomes", "schedule_collision_receipts",
  "schedule_collision_projections",
] as const satisfies readonly LogicalBackupTableName[]);

function sourceGraphRows(snapshot: PortableMergePlanSnapshot): Readonly<Record<string, readonly LogicalBackupRow[]>> {
  return Object.freeze(Object.fromEntries(PHASE13_SOURCE_GRAPH_TABLES.map((table) => [
    table, rowsFor(snapshot, table),
  ])));
}

const ACTIVITY_SOURCE_TABLES = new Set<string>([
  "imported_activities", "imported_activity_identities",
  "imported_activity_payloads", "imported_activity_references",
  "imported_activity_laps", "imported_activity_chunks",
  "imported_activity_receipts", "imported_activity_removal_events",
  "imported_activity_events", "imported_activity_match_invalidations",
  "imported_activity_revision_proposals", "imported_activity_revision_decisions",
  "running_match_events", "running_activity_match_events",
  "running_activity_match_receipts",
]);

const BODYWEIGHT_RESIDUAL_TABLES = new Set<string>([
  "bodyweight_entries",
  "bodyweight_entry_events",
  "bodyweight_command_receipts",
]);

const SCHEDULE_COLLISION_RESIDUAL_TABLES = new Set<string>([
  "schedule_collision_outcomes",
  "schedule_collision_receipts",
  "schedule_collision_projections",
]);

const SPLIT_RESIDUAL_SOURCE_TABLES = new Set<string>([
  ...BODYWEIGHT_RESIDUAL_TABLES,
  ...SCHEDULE_COLLISION_RESIDUAL_TABLES,
]);

const EMPTY_SOURCE_ROWS = Object.freeze(
  Object.fromEntries(PHASE13_SOURCE_GRAPH_TABLES.map((table) => [table, []])) as Record<string, readonly LogicalBackupRow[]>,
);

function sourceActivityRows(
  snapshot: PortableMergePlanSnapshot,
  activityId: string,
): Readonly<Record<string, readonly LogicalBackupRow[]>> {
  return Object.freeze(Object.fromEntries(PHASE13_SOURCE_GRAPH_TABLES.map((table) => {
    const rows = rowsFor(snapshot, table);
    if (!ACTIVITY_SOURCE_TABLES.has(table)) return [table, []];
    return [table, rows.filter((row) => table === "imported_activities"
      ? row.id === activityId
      : row.activity_id === activityId)];
  })));
}

function residualSourceRows(
  snapshot: PortableMergePlanSnapshot,
): Readonly<Record<string, readonly LogicalBackupRow[]>> {
  return Object.freeze(Object.fromEntries(PHASE13_SOURCE_GRAPH_TABLES.map((table) => [
    table,
    ACTIVITY_SOURCE_TABLES.has(table) || SPLIT_RESIDUAL_SOURCE_TABLES.has(table)
      ? []
      : rowsFor(snapshot, table),
  ])));
}

function sourceRowsSnapshot(
  snapshot: PortableMergePlanSnapshot,
  rows: Readonly<Record<string, readonly LogicalBackupRow[]>>,
): PortableMergePlanSnapshot {
  return Object.freeze({
    ...snapshot,
    tables: Object.freeze({ ...snapshot.tables, ...rows }),
  });
}

function sourceIdentityKey(row: LogicalBackupRow): string {
  if (typeof row.source_kind === "string" && typeof row.account_namespace === "string"
    && typeof row.external_activity_id === "string") {
    return `v6:${row.source_kind}:${row.account_namespace}:${row.external_activity_id}`;
  }
  return "legacy:" + textId(row.source) + ":" + textId(row.source_activity_id);
}

function sourceGraphHasRows(snapshot: PortableMergePlanSnapshot): boolean {
  return PHASE13_SOURCE_GRAPH_TABLES.some((table) => rowsFor(snapshot, table).length > 0);
}

function mappedGraphRows(
  archive: PortableMergePlanSnapshot,
  local: PortableMergePlanSnapshot,
  externalReferenceMaps: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map(),
): Readonly<Record<string, readonly LogicalBackupRow[]>> {
  const archiveIdentities = new Map(rowsFor(archive, "imported_activity_identities").map((row) => [
    sourceIdentityKey(row), textId(row.activity_id),
  ]));
  const localIdentities = new Map(rowsFor(local, "imported_activity_identities").map((row) => [
    sourceIdentityKey(row), textId(row.activity_id),
  ]));
  const activityMappings = new Map<string, string>();
  for (const [key, archiveActivityId] of archiveIdentities) {
    const localActivityId = localIdentities.get(key);
    if (localActivityId !== undefined) activityMappings.set(archiveActivityId, localActivityId);
  }

  const maps = new Map<string, Map<string, string>>(
    [...externalReferenceMaps].map(([table, ids]) => [table, new Map(ids)]),
  );
  maps.set("imported_activities", activityMappings);
  const result: Record<string, readonly LogicalBackupRow[]> = {};
  for (const table of PHASE13_SOURCE_GRAPH_TABLES) {
    const definition = LOGICAL_BACKUP_TABLE_DEFINITIONS[table];
    const keyColumn = definition.primaryKey[0]!;
    const occupied = tableOccupiedIds(local, table, keyColumn);
    const ids = new Map<string, string>();
    for (const [index, row] of rowsFor(archive, table).entries()) {
      const sourceId = textId(row[keyColumn]);
      const primaryReference = LOGICAL_BACKUP_REFERENCE_DEFINITIONS.find((reference) =>
        reference.childTable === table
        && reference.childColumns.length === 1
        && reference.childColumns[0] === keyColumn
        && reference.parentColumns.length === 1);
      const parentMappedId = primaryReference === undefined
        ? undefined
        : maps.get(primaryReference.parentTable)?.get(sourceId);
      const mappedActivityId = typeof row.activity_id === "string"
        ? activityMappings.get(row.activity_id)
        : undefined;
      const forcedId = maps.get(table)?.get(sourceId)
        ?? (mappedActivityId !== undefined && occupied.has(sourceId) ? sourceId : undefined);
      const localId = forcedId ?? parentMappedId ?? (occupied.has(sourceId)
        ? remappedChildId(table, ownerNamespace(archive), index, occupied)
        : sourceId);
      occupied.add(localId);
      ids.set(sourceId, localId);
    }
    maps.set(table, ids);
  }
  for (const table of PHASE13_SOURCE_GRAPH_TABLES) {
    const definition = LOGICAL_BACKUP_TABLE_DEFINITIONS[table];
    const keyColumn = definition.primaryKey[0]!;
    result[table] = Object.freeze(rowsFor(archive, table).map((row) => {
      let mapped: LogicalBackupRow = row;
      for (const reference of LOGICAL_BACKUP_REFERENCE_DEFINITIONS) {
        if (reference.childTable !== table || reference.childColumns.length !== 1
          || reference.parentColumns.length !== 1) continue;
        const value = mapped[reference.childColumns[0]!];
        if (value === null || value === undefined) continue;
        const replacement = maps.get(reference.parentTable)?.get(textId(value));
        if (replacement === undefined && table === "schedule_collision_outcomes") {
          // The graph owns immutable facts but is allowed to reference an
          // imported owned-plan row.  A missing mapping would leave an archive
          // physical ID in the receipt and violate the merged FK graph.
          invalid();
        }
        if (replacement !== undefined && replacement !== value) {
          mapped = Object.freeze({ ...mapped, [reference.childColumns[0]!]: replacement });
        }
      }
      const mappedId = maps.get(table)!.get(textId(row[keyColumn]))!;
      return Object.freeze({ ...mapped, [keyColumn]: mappedId });
    }));
  }
  for (const reference of LOGICAL_BACKUP_REFERENCE_DEFINITIONS) {
    if (reference.childColumns.length === 1 || reference.parentColumns.length === 1
      || !(PHASE13_SOURCE_GRAPH_TABLES as readonly string[]).includes(reference.childTable)
      || !(PHASE13_SOURCE_GRAPH_TABLES as readonly string[]).includes(reference.parentTable)) continue;
    const mappedChildren = result[reference.childTable]!;
    const sourceParents = rowsFor(archive, reference.parentTable);
    const mappedParents = result[reference.parentTable]!;
    const mappedParentTuples = new Map(sourceParents.map((row, index) => [
      tupleKey(reference.parentColumns.map((column) => row[column])),
      reference.parentColumns.map((column) => mappedParents[index]![column]),
    ]));
    const sourceChildren = rowsFor(archive, reference.childTable);
    result[reference.childTable] = Object.freeze(mappedChildren.map((row, index) => {
      const sourceTuple = reference.childColumns.map(
        (column) => sourceChildren[index]![column],
      );
      const mappedTuple = mappedParentTuples.get(tupleKey(sourceTuple));
      if (mappedTuple === undefined) invalid();
      return Object.freeze({
        ...row,
        ...Object.fromEntries(reference.childColumns.map(
          (column, columnIndex) => [column, mappedTuple[columnIndex]!],
        )),
      });
    }));
  }
  return Object.freeze(result);
}

type ResidualSourceAggregate = Readonly<{
  portableId: string;
  archiveId: string;
  localId: string;
  rows: Readonly<Record<string, readonly LogicalBackupRow[]>>;
}>;

function groupRowsByKey(
  rows: readonly LogicalBackupRow[],
  keyFor: (row: LogicalBackupRow) => string | undefined,
): ReadonlyMap<string, readonly LogicalBackupRow[]> {
  const groups = new Map<string, LogicalBackupRow[]>();
  for (const row of rows) {
    const key = keyFor(row);
    if (key === undefined) continue;
    const existing = groups.get(key);
    if (existing === undefined) groups.set(key, [row]);
    else existing.push(row);
  }
  return new Map([...groups].map(([key, group]) => [key, Object.freeze(group)]));
}

function bodyweightEntryPortableId(
  entry: LogicalBackupRow,
  events: readonly LogicalBackupRow[],
): string {
  const createEvent = events.find((event) => event.operation === "create" && typeof event.event_id === "string");
  return typeof entry.owner_id === "string" && typeof createEvent?.event_id === "string"
    ? `bodyweight:${entry.owner_id}:${createEvent.event_id}`
    : `bodyweight-entry:${textId(entry.id)}`;
}

function bodyweightResidualAggregates(snapshot: PortableMergePlanSnapshot): readonly ResidualSourceAggregate[] {
  const eventsByEntry = groupRowsByKey(rowsFor(snapshot, "bodyweight_entry_events"), (row) =>
    typeof row.entry_id === "string" ? textId(row.entry_id) : undefined);
  const receiptsByEntry = groupRowsByKey(rowsFor(snapshot, "bodyweight_command_receipts"), (row) =>
    typeof row.entry_id === "string" ? textId(row.entry_id) : undefined);
  return Object.freeze(rowsFor(snapshot, "bodyweight_entries").map((entry) => {
    const entryId = textId(entry.id);
    const events = eventsByEntry.get(entryId) ?? Object.freeze([]);
    const receipts = receiptsByEntry.get(entryId) ?? Object.freeze([]);
    return Object.freeze({
      portableId: bodyweightEntryPortableId(entry, events),
      archiveId: entryId,
      localId: entryId,
      rows: Object.freeze({
        ...EMPTY_SOURCE_ROWS,
        bodyweight_entries: Object.freeze([entry]),
        bodyweight_entry_events: events,
        bodyweight_command_receipts: receipts,
      }),
    });
  }));
}

function scheduleCollisionPortableId(outcome: LogicalBackupRow): string {
  return typeof outcome.request_id === "string"
    ? `schedule-collision:${outcome.request_id}`
    : `schedule-collision-outcome:${textId(outcome.id)}`;
}

function scheduleCollisionResidualAggregates(snapshot: PortableMergePlanSnapshot): readonly ResidualSourceAggregate[] {
  const receiptsByOutcome = groupRowsByKey(rowsFor(snapshot, "schedule_collision_receipts"), (row) =>
    typeof row.outcome_id === "string" ? textId(row.outcome_id) : undefined);
  const projectionsByOutcome = groupRowsByKey(rowsFor(snapshot, "schedule_collision_projections"), (row) =>
    typeof row.outcome_id === "string" ? textId(row.outcome_id) : undefined);
  return Object.freeze(rowsFor(snapshot, "schedule_collision_outcomes").map((outcome) => {
    const outcomeId = textId(outcome.id);
    return Object.freeze({
      portableId: scheduleCollisionPortableId(outcome),
      archiveId: outcomeId,
      localId: outcomeId,
      rows: Object.freeze({
        ...EMPTY_SOURCE_ROWS,
        schedule_collision_outcomes: Object.freeze([outcome]),
        schedule_collision_receipts: receiptsByOutcome.get(outcomeId) ?? Object.freeze([]),
        schedule_collision_projections: projectionsByOutcome.get(outcomeId) ?? Object.freeze([]),
      }),
    });
  }));
}

function residualSourceAggregates(snapshot: PortableMergePlanSnapshot): readonly ResidualSourceAggregate[] {
  return Object.freeze([
    ...bodyweightResidualAggregates(snapshot),
    ...scheduleCollisionResidualAggregates(snapshot),
  ]);
}

function residualReferenceMaps(
  archive: ResidualSourceAggregate,
  local: ResidualSourceAggregate,
): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const maps = new Map<string, ReadonlyMap<string, string>>();
  const archiveEntry = archive.rows.bodyweight_entries?.[0];
  const localEntry = local.rows.bodyweight_entries?.[0];
  if (archiveEntry !== undefined && localEntry !== undefined) {
    maps.set("bodyweight_entries", new Map([[textId(archiveEntry.id), textId(localEntry.id)]]));
    const localEvents = new Map(
      (local.rows.bodyweight_entry_events ?? [])
        .filter((row) => typeof row.event_id === "string")
        .map((row) => [textId(row.event_id), textId(row.id)]),
    );
    const eventMappings = (archive.rows.bodyweight_entry_events ?? [])
      .filter((row) => typeof row.event_id === "string")
      .flatMap((row) => {
        const localId = localEvents.get(textId(row.event_id));
        return localId === undefined ? [] : [[textId(row.id), localId] as const];
      });
    if (eventMappings.length > 0) maps.set("bodyweight_entry_events", new Map(eventMappings));
    const localReceipts = new Map(
      (local.rows.bodyweight_command_receipts ?? [])
        .filter((row) => typeof row.request_id === "string")
        .map((row) => [textId(row.request_id), textId(row.request_id)]),
    );
    const receiptMappings = (archive.rows.bodyweight_command_receipts ?? [])
      .filter((row) => typeof row.request_id === "string")
      .flatMap((row) => {
        const localId = localReceipts.get(textId(row.request_id));
        return localId === undefined ? [] : [[textId(row.request_id), localId] as const];
      });
    if (receiptMappings.length > 0) maps.set("bodyweight_command_receipts", new Map(receiptMappings));
  }
  const archiveOutcome = archive.rows.schedule_collision_outcomes?.[0];
  const localOutcome = local.rows.schedule_collision_outcomes?.[0];
  if (archiveOutcome !== undefined && localOutcome !== undefined) {
    maps.set("schedule_collision_outcomes", new Map([[textId(archiveOutcome.id), textId(localOutcome.id)]]));
    maps.set("schedule_collision_projections", new Map([[textId(archiveOutcome.id), textId(localOutcome.id)]]));
    if (typeof archiveOutcome.request_id === "string" && typeof localOutcome.request_id === "string") {
      maps.set("schedule_collision_receipts", new Map([[textId(archiveOutcome.request_id), textId(localOutcome.request_id)]]));
    }
  }
  return maps;
}

function mergeReferenceMaps(
  primary: ReadonlyMap<string, ReadonlyMap<string, string>>,
  secondary: ReadonlyMap<string, ReadonlyMap<string, string>>,
): ReadonlyMap<string, ReadonlyMap<string, string>> {
  if (secondary.size === 0) return primary;
  const merged = new Map<string, ReadonlyMap<string, string>>(primary);
  for (const [table, mappings] of secondary) {
    merged.set(table, new Map([...(primary.get(table)?.entries() ?? []), ...mappings.entries()]));
  }
  return merged;
}

async function sourceGraphPlan(
  archive: PortableMergePlanSnapshot,
  local: PortableMergePlanSnapshot,
  payloadDigest: (value: string) => Promise<string>,
  externalReferenceMaps: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map(),
): Promise<Readonly<{
  operations: readonly Extract<PortableMergeOperation, { aggregateClass: "source_graph" }>[];
  aggregates: readonly PortableMergeAggregate[];
}>> {
  if (!sourceGraphHasRows(archive)) return Object.freeze({ operations: [], aggregates: [] });
  const operations: Extract<PortableMergeOperation, { aggregateClass: "source_graph" }>[] = [];
  const aggregates: PortableMergeAggregate[] = [];
  const localIdentities = new Map(rowsFor(local, "imported_activity_identities").map((row) => [
    sourceIdentityKey(row), row,
  ]));
  for (const archiveIdentity of rowsFor(archive, "imported_activity_identities")) {
    const identityKey = sourceIdentityKey(archiveIdentity);
    const archiveActivityId = textId(archiveIdentity.activity_id);
    const localIdentity = localIdentities.get(identityKey);
    const localActivityId = localIdentity === undefined
      ? archiveActivityId
      : textId(localIdentity.activity_id);
    const portableId = `activity:${identityKey}`;
    const archiveSlice = sourceRowsSnapshot(archive, sourceActivityRows(archive, archiveActivityId));
    const localSlice = sourceRowsSnapshot(
      local,
      localIdentity === undefined
        ? Object.freeze(Object.fromEntries(PHASE13_SOURCE_GRAPH_TABLES.map((table) => [table, []])))
        : sourceActivityRows(local, localActivityId),
    );
    let mapped: Readonly<Record<string, readonly LogicalBackupRow[]>>;
    try {
      mapped = mappedGraphRows(archiveSlice, local, externalReferenceMaps);
    } catch {
      operations.push(Object.freeze({
        aggregateClass: "source_graph", kind: "conflict", portableId,
        archiveId: archiveActivityId, localId: localActivityId,
      }));
      continue;
    }
    const archiveCanonical = canonicalValue(mapped);
    const localCanonical = canonicalValue(sourceGraphRows(localSlice));
    const [archiveDigest, localDigest] = await Promise.all([
      payloadDigest(archiveCanonical), payloadDigest(localCanonical),
    ]);
    if (!/^[a-f0-9]{64}$/u.test(archiveDigest) || !/^[a-f0-9]{64}$/u.test(localDigest)) invalid();
    const kind = localIdentity === undefined
      ? "insert" as const
      : archiveCanonical === localCanonical ? "duplicate" as const : "conflict" as const;
    operations.push(Object.freeze({
      aggregateClass: "source_graph", kind, portableId,
      archiveId: archiveActivityId, localId: localActivityId,
    }));
    if (kind === "insert") {
      aggregates.push(Object.freeze({ aggregateClass: "source_graph", portableId, tables: mapped }));
    }
  }
  const localResiduals = new Map(residualSourceAggregates(local).map((aggregate) => [aggregate.portableId, aggregate] as const));
  for (const archiveResidual of residualSourceAggregates(archive)) {
    const localResidual = localResiduals.get(archiveResidual.portableId);
    const localRows = localResidual?.rows ?? EMPTY_SOURCE_ROWS;
    const localId = localResidual?.localId ?? archiveResidual.localId;
    const referenceMaps = mergeReferenceMaps(
      externalReferenceMaps,
      localResidual === undefined ? new Map() : residualReferenceMaps(archiveResidual, localResidual),
    );
    const archiveSlice = sourceRowsSnapshot(archive, archiveResidual.rows);
    const localSlice = sourceRowsSnapshot(local, localRows);
    let mapped: Readonly<Record<string, readonly LogicalBackupRow[]>>;
    try {
      mapped = mappedGraphRows(archiveSlice, local, referenceMaps);
    } catch {
      operations.push(Object.freeze({
        aggregateClass: "source_graph",
        kind: "conflict",
        portableId: archiveResidual.portableId,
        archiveId: archiveResidual.archiveId,
        localId,
      }));
      continue;
    }
    const archiveCanonical = canonicalValue(mapped);
    const localCanonical = canonicalValue(sourceGraphRows(localSlice));
    const [archiveDigest, localDigest] = await Promise.all([
      payloadDigest(archiveCanonical), payloadDigest(localCanonical),
    ]);
    if (!/^[a-f0-9]{64}$/u.test(archiveDigest) || !/^[a-f0-9]{64}$/u.test(localDigest)) invalid();
    const kind = localResidual === undefined
      ? "insert" as const
      : archiveCanonical === localCanonical ? "duplicate" as const : "conflict" as const;
    operations.push(Object.freeze({
      aggregateClass: "source_graph",
      kind,
      portableId: archiveResidual.portableId,
      archiveId: archiveResidual.archiveId,
      localId,
    }));
    if (kind === "insert") {
      aggregates.push(Object.freeze({
        aggregateClass: "source_graph",
        portableId: archiveResidual.portableId,
        tables: mapped,
      }));
    }
  }
  const archiveResidual = residualSourceRows(archive);
  if (Object.values(archiveResidual).some((rows) => rows.length > 0)) {
    const portableId = `residual:${ownerNamespace(archive)}`;
    const residualArchive = sourceRowsSnapshot(archive, archiveResidual);
    const residualLocal = sourceRowsSnapshot(local, residualSourceRows(local));
    const mapped = mappedGraphRows(residualArchive, local, externalReferenceMaps);
    const archiveCanonical = canonicalValue(mapped);
    const localCanonical = canonicalValue(sourceGraphRows(residualLocal));
    const [archiveDigest, localDigest] = await Promise.all([
      payloadDigest(archiveCanonical), payloadDigest(localCanonical),
    ]);
    if (!/^[a-f0-9]{64}$/u.test(archiveDigest) || !/^[a-f0-9]{64}$/u.test(localDigest)) invalid();
    const kind = archiveCanonical === localCanonical ? "duplicate" as const : "insert" as const;
    operations.push(Object.freeze({
      aggregateClass: "source_graph", kind, portableId,
      archiveId: "phase13-source-residual", localId: "phase13-source-residual",
    }));
    if (kind === "insert") {
      aggregates.push(Object.freeze({ aggregateClass: "source_graph", portableId, tables: mapped }));
    }
  }
  return Object.freeze({ operations: Object.freeze(operations), aggregates: Object.freeze(aggregates) });
}

function requiredSourceGraphAggregate(
  aggregates: readonly PortableMergeAggregate[],
  portableId: string,
): PortableMergeAggregate {
  const aggregate = aggregates.find((candidate) => candidate.portableId === portableId);
  if (aggregate === undefined) invalid();
  return aggregate;
}

export async function buildPortableMergePlan(input: Readonly<{
  archive: PortableMergePlanSnapshot;
  local: PortableMergePlanSnapshot;
  payloadDigest(value: string): Promise<string>;
}>): Promise<PortableMergePlan> {
  if (ownerNamespace(input.archive) !== ownerNamespace(input.local)) invalid();
  // Exercise the session aggregate's own closure contract before the generic
  // cross-table check. Both reject the same invalid input; this ordering keeps
  // the more specific invariant as the first fail-closed boundary.
  assertSessionAggregateClosure(input.archive);
  assertSessionAggregateClosure(input.local);
  assertReferenceClosure(input.archive);
  assertReferenceClosure(input.local);
  const localByPortableId = new Map<string, LogicalBackupRow[]>();
  const archiveDigestIndex = createSessionDigestIndex(input.archive);
  const localDigestIndex = createSessionDigestIndex(input.local);
  assertSessionMaterializationInputs(input.archive);
  const occupiedSessionIds = new Set(sessionRows(input.local).map((row) => textId(row.id)));
  for (const row of sessionRows(input.local)) {
    if (!isOpaquePortableId(row.portable_id)) invalid();
    const rows = localByPortableId.get(row.portable_id) ?? [];
    rows.push(row);
    localByPortableId.set(row.portable_id, rows);
  }
  const sessionOperations: readonly Extract<PortableMergeOperation, {
    aggregateClass: "workout_session";
  }>[] = Object.freeze(
    [...await mapWithConcurrency(sessionRows(input.archive), MERGE_DIGEST_CONCURRENCY, async (session) => sessionOperation(
      input.archive,
      input.local,
      session,
      localByPortableId.get(session.portable_id as string) ?? [],
      occupiedSessionIds,
      input.payloadDigest,
      archiveDigestIndex,
      localDigestIndex,
    ))].sort((left, right) => operationKey(left).localeCompare(operationKey(right))),
  );
  if (new Set(sessionOperations.map(operationKey)).size !== sessionOperations.length) {
    invalid();
  }
  const exercises = rootOperations(input.archive, input.local, {
    aggregateClass: "custom_exercise",
    table: "exercises",
  });
  const plans = rootOperations(input.archive, input.local, {
    aggregateClass: "owned_plan",
    table: "plans",
  });
  const settings = settingPlan(input.archive, input.local, new Map(
    plans.idMappings.map(({ archiveId, localId }) => [archiveId, localId]),
  ));
  const ownedReferenceMaps = new Map<string, ReadonlyMap<string, string>>();
  const exerciseMappings = new Map(
    exercises.idMappings.map(({ archiveId, localId }) => [archiveId, localId]),
  );
  const planMappings = new Map(
    plans.idMappings.map(({ archiveId, localId }) => [archiveId, localId]),
  );
  const emptySessionMappings = new Map<string, string>();
  for (const operation of plans.operations) {
    if (operation.aggregateClass !== "owned_plan") continue;
    planAggregate(
      input.archive,
      input.local,
      operation,
      exerciseMappings,
      planMappings,
      emptySessionMappings,
      ownedReferenceMaps,
    );
  }
  const sourceGraph = await sourceGraphPlan(
    input.archive,
    input.local,
    input.payloadDigest,
    ownedReferenceMaps,
  );
  const operations: readonly PortableMergeOperation[] = Object.freeze([
    ...sessionOperations,
    ...settings.operations,
    ...exercises.operations,
    ...plans.operations,
    ...sourceGraph.operations,
  ].sort((left, right) => operationKey(left).localeCompare(operationKey(right))));
  const sessionRemaps = sessionOperations
    .filter((operation): operation is Extract<PortableMergeOperation, {
      aggregateClass: "workout_session";
    }> => operation.aggregateClass === "workout_session"
      && operation.kind === "insert"
      && operation.archiveId !== operation.localId)
    .map((operation) => Object.freeze({
      recordClass: "workout_session" as const,
      archiveId: operation.archiveId,
      localId: operation.localId,
    }));
  const idRemaps = Object.freeze([
    ...sessionRemaps,
    ...exercises.idRemaps,
    ...plans.idRemaps,
  ]);
  const idMappings = Object.freeze([
    ...sessionOperations.filter((operation): operation is Extract<PortableMergeOperation, {
      aggregateClass: "workout_session";
    }> => operation.aggregateClass === "workout_session").map((operation) => Object.freeze({
      recordClass: "workout_session" as const,
      archiveId: operation.archiveId,
      localId: operation.localId,
    })),
    ...exercises.idMappings,
    ...plans.idMappings,
  ]);
  const basePreview = operations.reduce<PortableMergePreview>(
    (total, operation) => addCounts(total, countFor(operation)),
    Object.freeze({
      inserted: 0, duplicates: 0, archiveWon: 0, localWon: 0,
      keptBoth: 0, remapped: 0, conflicts: 0,
    } satisfies PortableMergePreview),
  );
  let materializedAggregates: readonly PortableMergeAggregate[] | undefined;
  const materializeAggregates = (): readonly PortableMergeAggregate[] => {
    if (materializedAggregates !== undefined) return materializedAggregates;
    const exerciseMappings = new Map(
      exercises.idMappings.map(({ archiveId, localId }) => [archiveId, localId]),
    );
    const planMappings = new Map(
      plans.idMappings.map(({ archiveId, localId }) => [archiveId, localId]),
    );
    const sessionMappings = new Map(
      sessionOperations.map((operation) => [operation.archiveId, operation.localId] as const),
    );
    const occupiedIds = new Map<string, Set<string>>();
    const numericChildAllocators = new Map<string, { occupied: Set<number>; nextId: number }>();
    const occupiedIdsFor = (table: string, keyColumn = "id"): Set<string> => {
      const key = `${table}:${keyColumn}`;
      const existing = occupiedIds.get(key);
      if (existing !== undefined) return existing;
      const created = tableOccupiedIds(input.local, table, keyColumn);
      occupiedIds.set(key, created);
      return created;
    };
    materializedAggregates = Object.freeze(operations.flatMap((operation) => {
      if (operation.aggregateClass === "workout_session"
        && (operation.kind === "insert" || operation.kind === "archive_won")) {
        return [sessionAggregate(
          input.archive,
          input.local,
          operation.portableId,
          operation.localId,
          {
            archiveSessionId: operation.archiveId,
            index: archiveDigestIndex,
            occupiedIdsFor,
          },
        )];
      }
      if (operation.aggregateClass === "custom_exercise"
        && (operation.kind === "insert" || operation.kind === "keep_both")) {
        return [exerciseAggregate(input.archive, input.local, operation, numericChildAllocators)];
      }
      if (operation.aggregateClass === "owned_plan"
        && (operation.kind === "insert" || operation.kind === "keep_both")) {
        return [planAggregate(
          input.archive,
          input.local,
          operation,
          exerciseMappings,
          planMappings,
          sessionMappings,
        )];
      }
      if (operation.aggregateClass === "source_graph" && operation.kind === "insert") {
        return [requiredSourceGraphAggregate(sourceGraph.aggregates, operation.portableId)];
      }
      return [];
    }));
    return materializedAggregates;
  };
  const plan = {
    operations,
    idRemaps,
    idMappings,
    settings: undefined as unknown as readonly LogicalBackupRow[],
    aggregates: undefined as unknown as readonly PortableMergeAggregate[],
    preview: Object.freeze({ ...basePreview, remapped: idRemaps.length }),
  } satisfies PortableMergePlan;
  Object.defineProperties(plan, {
    settings: {
      enumerable: true,
      get: () => settings.inserts,
    },
    aggregates: {
      enumerable: true,
      get: materializeAggregates,
    },
  });
  const issuedPlan = Object.freeze(plan);
  PLANNER_ISSUED_PLANS.add(issuedPlan);
  return issuedPlan;
}

/**
 * Pure planner helpers are kept private to production callers. This read-only
 * surface exists solely for exhaustive malformed-aggregate contract tests.
 */
export const __mergePlanTestOnly = Object.freeze({
  addCounts,
  assertReferenceClosure,
  assertSessionAggregateClosure,
  assertSessionMaterializationInputs,
  canonicalValue,
  countFor,
  encodeJson,
  exerciseAggregate,
  mappedIdentifier,
  mappedRows,
  nextPhysicalId,
  nonNegativeInteger,
  ownerNamespace,
  parseJsonObject,
  planAggregate,
  remappedChildId,
  replaceScalar,
  requiredMappedRow,
  rewriteEditReceiptResult,
  rewriteReorderReceipt,
  rewriteReorderReceiptResult,
  rootOperations,
  rowsFor,
  sessionAggregate,
  createSessionDigestIndex,
  sessionDigestInput,
  sessionOperation,
  mapWithConcurrency,
  sessionRows,
  mappedGraphRows,
  sourceGraphPlan,
  sourceGraphRows,
  sourceIdentityKey,
  requiredSourceGraphAggregate,
  settingPlan,
  tableOccupiedIds,
  textId,
  tupleKey,
});
