import {
  comparePortableMergeFreshness,
  isOpaquePortableId,
} from "./portableIdentity";
import type {
  LogicalBackupRow,
  LogicalBackupTableName,
} from "./backupContracts";
import {
  LOGICAL_BACKUP_REFERENCE_DEFINITIONS,
} from "./restoreCommands";

type MergeTables = Readonly<Record<string, readonly LogicalBackupRow[]>>;

export type PortableMergeTableClass =
  | "metadata"
  | "app_setting"
  | "custom_exercise"
  | "owned_plan"
  | "workout_session";

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
  plans: "owned_plan",
  plan_schedules: "owned_plan",
  plan_schedule_bindings: "owned_plan",
  plan_days: "owned_plan",
  plan_day_exercises: "owned_plan",
  plan_warmup_sets: "owned_plan",
  plan_working_set_targets: "owned_plan",
  progression_policies: "owned_plan",
  progression_recommendations: "owned_plan",
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
  workout_sessions: "workout_session",
  workout_session_exercise_edit_receipts: "workout_session",
  workout_session_exercise_reorder_receipts: "workout_session",
  session_exercises: "workout_session",
  session_sets: "workout_session",
  session_rest_states: "workout_session",
  session_advanced_timing_states: "workout_session",
  session_undo_snapshots: "workout_session",
  history_session_overlays: "workout_session",
  history_audit_events: "workout_session",
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
  }>;

export type PortableMergeIdRemap = Readonly<{
  recordClass: "workout_session" | "custom_exercise" | "owned_plan";
  archiveId: string;
  localId: string;
}>;

export type PortableMergeIdMapping = Readonly<{
  recordClass: "workout_session" | "custom_exercise" | "owned_plan";
  archiveId: string;
  localId: string;
}>;

export type PortableMergeAggregate = Readonly<{
  aggregateClass: "workout_session" | "custom_exercise" | "owned_plan";
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

function canonicalValue(value: unknown): string {
  if (value === null || typeof value === "boolean"
    || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (!isPlainObject(value)) invalid();
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalValue(value[key])}`
  )).join(",")}}`;
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

function sessionDigestInput(
  snapshot: PortableMergePlanSnapshot,
  session: LogicalBackupRow,
): string {
  const sessionId = session.id;
  if (typeof sessionId !== "string") invalid();
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

function sessionAggregate(
  snapshot: PortableMergePlanSnapshot,
  local: PortableMergePlanSnapshot,
  portableId: string,
  localSessionId: string,
): PortableMergeAggregate {
  const sessions = sessionRows(snapshot).filter((row) => row.portable_id === portableId);
  if (sessions.length !== 1) invalid();
  const sessionId = textId(sessions[0]!.id);
  const exercises = rowsFor(snapshot, "session_exercises")
    .filter((row) => row.session_id === sessionId);
  const mappedExercises = mappedRows(local, "session_exercises", exercises, [
    { column: "session_id", ids: new Map([[sessionId, localSessionId]]) },
  ], sessionId !== localSessionId, portableId);
  const archiveExerciseIds = new Set(exercises.map((row) => textId(row.id)));
  const sets = rowsFor(snapshot, "session_sets")
    .filter((row) => archiveExerciseIds.has(textId(row.session_exercise_id)));
  const mappedSets = mappedRows(local, "session_sets", sets, [
    { column: "session_exercise_id", ids: mappedExercises.ids },
  ], sessionId !== localSessionId, portableId);
  const archiveSetIds = new Set(sets.map((row) => textId(row.id)));
  const immutableChildren = new Map<string, ReadonlyMap<string, string>>();
  for (const [table, keyColumn] of [
    ["session_undo_snapshots", "id"],
    ["history_audit_events", "id"],
    ["workout_session_exercise_edit_receipts", "request_id"],
    ["workout_session_exercise_reorder_receipts", "request_id"],
  ] as const) {
    const rows = rowsFor(snapshot, table).filter((row) => row.session_id === sessionId);
    const mapped = mappedRows(local, table, rows, [
      { column: "session_id", ids: new Map([[sessionId, localSessionId]]) },
      { column: "completed_set_id", ids: mappedSets.ids, optional: true },
    ], sessionId !== localSessionId, portableId, keyColumn);
    immutableChildren.set(table, mapped.ids);
  }
  const isKnown = (ids: ReadonlySet<string>, value: unknown): boolean =>
    value !== null && value !== undefined && ids.has(textId(value));
  const tables: Record<string, readonly LogicalBackupRow[]> = {};
  const sessionMap = new Map([[sessionId, localSessionId]]);
  for (const [table, rows] of Object.entries(snapshot.tables)) {
    const selected = table === "workout_sessions"
      ? rows.filter((row) => row.id === sessionId)
      : rows.filter((row) => row.session_id === sessionId
        || isKnown(archiveExerciseIds, row.session_exercise_id)
        || isKnown(archiveSetIds, row.session_set_id)
        || isKnown(archiveSetIds, row.completed_set_id));
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
          return mappedExercises.rows.find((candidate) => candidate.session_id === localSessionId
            && mappedExercises.ids.get(textId(row.id)) === candidate.id)!;
        }
        if (table === "session_sets") {
          return mappedSets.rows.find((candidate) =>
            mappedSets.ids.get(textId(row.id)) === candidate.id)!;
        }
        const immutableIds = immutableChildren.get(table);
        if (immutableIds !== undefined) {
          const keyColumn = table === "workout_session_exercise_edit_receipts"
            || table === "workout_session_exercise_reorder_receipts"
            ? "request_id"
            : "id";
          const replacement = immutableIds.get(textId(row[keyColumn]));
          if (replacement === undefined) invalid();
          mapped = Object.freeze({ ...mapped, [keyColumn]: replacement });
        }
        if (mapped.session_id === sessionId) {
          mapped = Object.freeze({ ...mapped, session_id: localSessionId });
        }
        if (mapped.session_exercise_id !== null && mapped.session_exercise_id !== undefined) {
          const replacement = mappedExercises.ids.get(textId(mapped.session_exercise_id));
          if (replacement !== undefined) {
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
        for (const column of ["session_set_id", "completed_set_id", "next_set_id"] as const) {
          const value = mapped[column];
          if (value === null || value === undefined) continue;
          const replacement = mappedSets.ids.get(textId(value));
          if (replacement !== undefined) mapped = Object.freeze({ ...mapped, [column]: replacement });
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
    conflicts: 0,
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
  const operations = rowsFor(archive, "app_settings").map((row) => {
    const key = textId(row.key);
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
    const occupied = new Set(rowsFor(local, table).map((row) => {
      const id = row.id;
      if (typeof id !== "number" || !Number.isSafeInteger(id)) invalid();
      return id;
    }));
    let nextId = Math.max(0, ...occupied) + 1;
    const rows = selected.map((row) => {
      const id = row.id;
      if (typeof id !== "number" || !Number.isSafeInteger(id)) invalid();
      if (!occupied.has(id)) {
        occupied.add(id);
        return row;
      }
      while (occupied.has(nextId)) nextId += 1;
      occupied.add(nextId);
      return Object.freeze({ ...row, id: nextId });
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
): Readonly<{ rows: readonly LogicalBackupRow[]; ids: ReadonlyMap<string, string> }> {
  const occupied = tableOccupiedIds(snapshot, table, keyColumn);
  const ids = new Map<string, string>();
  for (const [index, row] of [...selected].sort((left, right) =>
    textId(left[keyColumn]).localeCompare(textId(right[keyColumn]))).entries()) {
    const sourceId = textId(row[keyColumn]);
    const suppliedId = keyIds?.get(sourceId);
    if (keyIds !== undefined && suppliedId === undefined) invalid();
    const localId = suppliedId ?? (remapIds && occupied.has(sourceId)
      ? remappedChildId(table, portableId, index, occupied)
      : sourceId);
    occupied.add(localId);
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
      mapped = Object.freeze({ ...mapped, [column]: replacement });
    }
    return Object.freeze({
      ...mapped,
      [keyColumn]: ids.get(textId(row[keyColumn]))!,
    });
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
): PortableMergeAggregate {
  const archivePlanId = operation.archiveId;
  const localPlanId = operation.localId;
  const tables: Record<string, readonly LogicalBackupRow[]> = {};
  const root = rowsFor(snapshot, "plans").filter((row) => row.id === archivePlanId);
  if (root.length !== 1) invalid();
  const activeLocalPlanExists = rowsFor(local, "plans").some(
    (row) => row.is_active === 1,
  );
  const importedRoot = Object.freeze({
    ...root[0]!,
    id: localPlanId,
    ...(root[0]!.is_active === 1 && activeLocalPlanExists ? { is_active: 0 } : {}),
  });
  tables.plans = Object.freeze([importedRoot]);

  if (planMappings.get(archivePlanId) !== localPlanId) invalid();
  const planMap = new Map([[archivePlanId, localPlanId]]);
  const days = rowsFor(snapshot, "plan_days").filter((row) => row.plan_id === archivePlanId);
  const mappedDays = mappedRows(local, "plan_days", days, [
    { column: "plan_id", ids: planMap },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedDays.rows.length > 0) tables.plan_days = mappedDays.rows;

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
    .some((row) => row.lifecycle === "active");
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

  const scheduleVersions = rowsFor(snapshot, "owned_plan_schedule_versions")
    .filter((row) => mappedOwnedSchedules.ids.has(textId(row.schedule_id)));
  const mappedScheduleVersions = mappedRows(local, "owned_plan_schedule_versions", scheduleVersions, [
    { column: "schedule_id", ids: mappedOwnedSchedules.ids },
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedScheduleVersions.rows.length > 0) {
    tables.owned_plan_schedule_versions = mappedScheduleVersions.rows;
  }

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
  }

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
): Promise<PortableMergeOperation> {
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
    payloadDigest(sessionDigestInput(archive, archiveSession)),
    payloadDigest(sessionDigestInput(local, localSession)),
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
  const occupiedSessionIds = new Set(sessionRows(input.local).map((row) => textId(row.id)));
  for (const row of sessionRows(input.local)) {
    if (!isOpaquePortableId(row.portable_id)) invalid();
    const rows = localByPortableId.get(row.portable_id) ?? [];
    rows.push(row);
    localByPortableId.set(row.portable_id, rows);
  }
  const sessionOperations: readonly PortableMergeOperation[] = Object.freeze(
    (await Promise.all(sessionRows(input.archive).map((session) => sessionOperation(
      input.archive,
      input.local,
      session,
      localByPortableId.get(session.portable_id as string) ?? [],
      occupiedSessionIds,
      input.payloadDigest,
    )))).sort((left, right) => operationKey(left).localeCompare(operationKey(right))),
  );
  if (new Set(sessionOperations.map(operationKey)).size !== sessionOperations.length) {
    invalid();
  }
  const settings = settingPlan(input.archive, input.local);
  const exercises = rootOperations(input.archive, input.local, {
    aggregateClass: "custom_exercise",
    table: "exercises",
  });
  const plans = rootOperations(input.archive, input.local, {
    aggregateClass: "owned_plan",
    table: "plans",
  });
  const operations: readonly PortableMergeOperation[] = Object.freeze([
    ...sessionOperations,
    ...settings.operations,
    ...exercises.operations,
    ...plans.operations,
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
  const exerciseMappings = new Map(
    exercises.idMappings.map(({ archiveId, localId }) => [archiveId, localId]),
  );
  const planMappings = new Map(
    plans.idMappings.map(({ archiveId, localId }) => [archiveId, localId]),
  );
  const sessionMappings = new Map(
    sessionOperations.map((operation) => {
      if (operation.aggregateClass !== "workout_session") invalid();
      return [operation.archiveId, operation.localId] as const;
    }),
  );
  const aggregates = Object.freeze(operations.flatMap((operation) => {
    if (operation.aggregateClass === "workout_session"
      && (operation.kind === "insert" || operation.kind === "archive_won")) {
      return [sessionAggregate(input.archive, input.local, operation.portableId, operation.localId)];
    }
    if (operation.aggregateClass === "custom_exercise"
      && (operation.kind === "insert" || operation.kind === "keep_both")) {
      return [exerciseAggregate(input.archive, input.local, operation)];
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
    return [];
  }));
  const basePreview = operations.reduce<PortableMergePreview>(
    (total, operation) => addCounts(total, countFor(operation)),
    Object.freeze({
      inserted: 0, duplicates: 0, archiveWon: 0, localWon: 0,
      keptBoth: 0, remapped: 0, conflicts: 0,
    } satisfies PortableMergePreview),
  );
  return Object.freeze({
    operations,
    idRemaps,
    idMappings,
    settings: settings.inserts,
    aggregates,
    preview: Object.freeze({ ...basePreview, remapped: idRemaps.length }),
  });
}
