import {
  comparePortableMergeFreshness,
  isOpaquePortableId,
} from "./portableIdentity";
import type {
  LogicalBackupRow,
} from "./backupContracts";

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
    aggregateClass: "custom_exercise" | "owned_plan";
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

export type PortableMergePlan = Readonly<{
  operations: readonly PortableMergeOperation[];
  idRemaps: readonly PortableMergeIdRemap[];
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
    preview: Object.freeze({ ...basePreview, remapped: idRemaps.length }),
  });
}
