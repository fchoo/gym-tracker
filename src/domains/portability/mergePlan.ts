import {
  comparePortableMergeFreshness,
  isOpaquePortableId,
} from "./portableIdentity";
import type {
  LogicalBackupRow,
} from "./backupContracts";
import {
  LOGICAL_BACKUP_REFERENCE_DEFINITIONS,
} from "./restoreCommands";

type MergeTables = Readonly<Record<string, readonly LogicalBackupRow[]>>;

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
  recordClass: "custom_exercise" | "owned_plan";
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

function sessionAggregate(
  snapshot: PortableMergePlanSnapshot,
  portableId: string,
): PortableMergeAggregate {
  const sessions = sessionRows(snapshot).filter((row) => row.portable_id === portableId);
  if (sessions.length !== 1) invalid();
  const sessionId = textId(sessions[0]!.id);
  const exerciseIds = new Set(rowsFor(snapshot, "session_exercises")
    .filter((row) => row.session_id === sessionId)
    .map((row) => textId(row.id)));
  const setIds = new Set(rowsFor(snapshot, "session_sets")
    .filter((row) => exerciseIds.has(textId(row.session_exercise_id)))
    .map((row) => textId(row.id)));
  const isKnown = (ids: ReadonlySet<string>, value: unknown): boolean =>
    value !== null && value !== undefined && ids.has(textId(value));
  const tables: Record<string, readonly LogicalBackupRow[]> = {};
  for (const [table, rows] of Object.entries(snapshot.tables)) {
    const selected = table === "workout_sessions"
      ? rows.filter((row) => row.id === sessionId)
      : rows.filter((row) => row.session_id === sessionId
        || isKnown(exerciseIds, row.session_exercise_id)
        || isKnown(setIds, row.session_set_id)
        || isKnown(setIds, row.completed_set_id));
    if (selected.length > 0) tables[table] = Object.freeze(selected);
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

function settingOperations(
  archive: PortableMergePlanSnapshot,
  local: PortableMergePlanSnapshot,
): readonly PortableMergeOperation[] {
  const localKeys = new Set<string>();
  for (const row of rowsFor(local, "app_settings")) {
    const key = textId(row.key);
    if (localKeys.has(key)) invalid();
    localKeys.add(key);
  }
  const archiveKeys = new Set<string>();
  return Object.freeze(rowsFor(archive, "app_settings").map((row) => {
    const key = textId(row.key);
    if (archiveKeys.has(key)) invalid();
    archiveKeys.add(key);
    return Object.freeze({
      aggregateClass: "app_setting" as const,
      kind: localKeys.has(key) ? "local_won" as const : "insert" as const,
      key,
    });
  }).sort((left, right) => left.key.localeCompare(right.key)));
}

function nextPhysicalId(
  recordClass: "custom_exercise" | "owned_plan",
  portableId: string,
  occupied: Set<string>,
): string {
  const prefix = recordClass === "custom_exercise"
    ? "merge_exercise_"
    : "merge_plan_";
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
      operations.push(Object.freeze({
        aggregateClass: input.aggregateClass,
        kind: "duplicate",
        portableId,
        archiveId,
        localId: textId(existing.id),
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
  operation: Extract<PortableMergeOperation, { aggregateClass: "custom_exercise" }>,
): PortableMergeAggregate {
  const archiveId = operation.archiveId;
  const localId = operation.localId;
  const tables: Record<string, readonly LogicalBackupRow[]> = {};
  for (const table of [
    "exercises",
    "exercise_library_entries",
    "exercise_aliases",
    "exercise_search_terms",
    "exercise_taxonomy",
    "exercise_owner_preferences",
    "exercise_metric_baselines",
    "metric_profile_migration_events",
  ]) {
    const rows = rowsFor(snapshot, table)
      .filter((row) => row.id === archiveId || row.exercise_id === archiveId)
      .map((row) => replaceScalar(row, "id", archiveId, localId))
      .map((row) => replaceScalar(row, "exercise_id", archiveId, localId));
    if (rows.length > 0) tables[table] = Object.freeze(rows);
  }
  const root = tables.exercises?.[0];
  if (root === undefined || root.id !== localId) invalid();
  return Object.freeze({
    aggregateClass: "custom_exercise",
    portableId: operation.portableId,
    tables: Object.freeze(tables),
  });
}

function tableOccupiedIds(
  snapshot: PortableMergePlanSnapshot,
  table: string,
): Set<string> {
  return new Set(rowsFor(snapshot, table).map((row) => textId(row.id)));
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
  rowMaps: readonly Readonly<{ column: string; ids: ReadonlyMap<string, string> }>[],
  remapIds: boolean,
  portableId: string,
): Readonly<{ rows: readonly LogicalBackupRow[]; ids: ReadonlyMap<string, string> }> {
  const occupied = tableOccupiedIds(snapshot, table);
  const ids = new Map<string, string>();
  for (const [index, row] of [...selected].sort((left, right) =>
    textId(left.id).localeCompare(textId(right.id))).entries()) {
    const sourceId = textId(row.id);
    const localId = remapIds && occupied.has(sourceId)
      ? remappedChildId(table, portableId, index, occupied)
      : sourceId;
    occupied.add(localId);
    ids.set(sourceId, localId);
  }
  const rows = selected.map((row) => {
    let mapped: LogicalBackupRow = Object.freeze({ ...row, id: ids.get(textId(row.id))! });
    for (const { column, ids: references } of rowMaps) {
      const value = mapped[column];
      if (value === null || value === undefined) continue;
      const replacement = references.get(textId(value));
      if (replacement === undefined) invalid();
      mapped = Object.freeze({ ...mapped, [column]: replacement });
    }
    return mapped;
  });
  return Object.freeze({ rows: Object.freeze(rows), ids });
}

function planAggregate(
  snapshot: PortableMergePlanSnapshot,
  local: PortableMergePlanSnapshot,
  operation: Extract<PortableMergeOperation, { aggregateClass: "owned_plan" }>,
): PortableMergeAggregate {
  const archivePlanId = operation.archiveId;
  const localPlanId = operation.localId;
  const tables: Record<string, readonly LogicalBackupRow[]> = {};
  const root = rowsFor(snapshot, "plans").filter((row) => row.id === archivePlanId);
  if (root.length !== 1) invalid();
  tables.plans = Object.freeze([Object.freeze({ ...root[0]!, id: localPlanId })]);

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
  ], operation.kind === "keep_both", operation.portableId);
  if (mappedOccurrences.rows.length > 0) {
    tables.plan_day_exercises = mappedOccurrences.rows;
  }

  for (const table of [
    "plan_warmup_sets",
    "plan_working_set_targets",
    "progression_policies",
  ]) {
    const rows = rowsFor(snapshot, table)
      .filter((row) => mappedOccurrences.ids.has(textId(row.plan_day_exercise_id)));
    const mapped = mappedRows(local, table, rows, [
      { column: "plan_day_exercise_id", ids: mappedOccurrences.ids },
    ], operation.kind === "keep_both", operation.portableId);
    if (mapped.rows.length > 0) tables[table] = mapped.rows;
  }
  return Object.freeze({
    aggregateClass: "owned_plan",
    portableId: operation.portableId,
    tables: Object.freeze(tables),
  });
}

function sessionOperation(
  archive: PortableMergePlanSnapshot,
  local: PortableMergePlanSnapshot,
  archiveSession: LogicalBackupRow,
  localSessions: readonly LogicalBackupRow[],
  payloadDigest: (value: string) => string,
): PortableMergeOperation {
  const portableId = archiveSession.portable_id;
  if (!isOpaquePortableId(portableId)) invalid();
  const archiveModifiedAtMs = nonNegativeInteger(
    archiveSession.merge_modified_at_ms,
  );
  if (localSessions.length === 0) {
    return Object.freeze({ aggregateClass: "workout_session", kind: "insert", portableId });
  }
  if (localSessions.length !== 1) invalid();
  const localSession = localSessions[0]!;
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
    return Object.freeze({ aggregateClass: "workout_session", kind: "archive_won", portableId });
  }
  if (freshness < 0) {
    return Object.freeze({ aggregateClass: "workout_session", kind: "local_won", portableId });
  }
  const archiveDigest = payloadDigest(sessionDigestInput(archive, archiveSession));
  const localDigest = payloadDigest(sessionDigestInput(local, localSession));
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
  });
}

function operationKey(operation: PortableMergeOperation): string {
  return operation.aggregateClass === "app_setting"
    ? "app_setting:" + operation.key
    : operation.aggregateClass + ":" + operation.portableId;
}

export function buildPortableMergePlan(input: Readonly<{
  archive: PortableMergePlanSnapshot;
  local: PortableMergePlanSnapshot;
  payloadDigest(value: string): string;
}>): PortableMergePlan {
  if (ownerNamespace(input.archive) !== ownerNamespace(input.local)) invalid();
  assertReferenceClosure(input.archive);
  assertReferenceClosure(input.local);
  assertSessionAggregateClosure(input.archive);
  assertSessionAggregateClosure(input.local);
  const localByPortableId = new Map<string, LogicalBackupRow[]>();
  for (const row of sessionRows(input.local)) {
    if (!isOpaquePortableId(row.portable_id)) invalid();
    const rows = localByPortableId.get(row.portable_id) ?? [];
    rows.push(row);
    localByPortableId.set(row.portable_id, rows);
  }
  const sessionOperations: readonly PortableMergeOperation[] = Object.freeze(
    sessionRows(input.archive).map((session) => sessionOperation(
    input.archive,
    input.local,
    session,
    localByPortableId.get(session.portable_id as string) ?? [],
    input.payloadDigest,
    )).sort((left, right) => operationKey(left).localeCompare(operationKey(right))),
  );
  if (new Set(sessionOperations.map(operationKey)).size !== sessionOperations.length) {
    invalid();
  }
  const settings = settingOperations(input.archive, input.local);
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
    ...settings,
    ...exercises.operations,
    ...plans.operations,
  ].sort((left, right) => operationKey(left).localeCompare(operationKey(right))));
  const idRemaps = Object.freeze([...exercises.idRemaps, ...plans.idRemaps]);
  const aggregates = Object.freeze(operations.flatMap((operation) => {
    if (operation.aggregateClass === "workout_session"
      && (operation.kind === "insert" || operation.kind === "archive_won")) {
      return [sessionAggregate(input.archive, operation.portableId)];
    }
    if (operation.aggregateClass === "custom_exercise"
      && (operation.kind === "insert" || operation.kind === "keep_both")) {
      return [exerciseAggregate(input.archive, operation)];
    }
    if (operation.aggregateClass === "owned_plan"
      && (operation.kind === "insert" || operation.kind === "keep_both")) {
      return [planAggregate(input.archive, input.local, operation)];
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
    aggregates,
    preview: Object.freeze({ ...basePreview, remapped: idRemaps.length }),
  });
}
