export const LOGICAL_BACKUP_FORMAT_VERSION = 1 as const;

export const BACKUP_LIMITS = Object.freeze({
  maxHeaderBytes: 16 * 1024,
  maxArchiveBytes: 32 * 1024 * 1024,
  maxPlaintextBytes: 24 * 1024 * 1024,
  maxRowsTotal: 100_000,
  maxRowsPerTable: 25_000,
  maxStringBytes: 64 * 1024,
  maxNestingDepth: 16,
});

type LogicalTableDefinition = Readonly<{
  /**
   * SQLite tables may use a scalar or a composite primary key.  The logical
   * backup carries the real source columns rather than inventing a synthetic
   * archive-only identity, so the validator needs the exact key tuple.
   */
  primaryKey: readonly string[];
}>;

/**
 * This is intentionally an allowlist rather than a sqlite_master query. The
 * collector added later must select only user-owned rows from mixed tables
 * such as exercises/plans and must never copy catalog/FTS/effect tables.
 */
export const LOGICAL_BACKUP_TABLE_DEFINITIONS = Object.freeze({
  app_settings: { primaryKey: ["key"] },
  exercise_owner_preferences: { primaryKey: ["exercise_id"] },
  exercises: { primaryKey: ["id"] },
  exercise_library_entries: { primaryKey: ["exercise_id"] },
  exercise_aliases: { primaryKey: ["id"] },
  exercise_search_terms: { primaryKey: ["id"] },
  exercise_taxonomy: {
    primaryKey: ["exercise_id", "kind", "relation", "ordinal"],
  },
  taxonomy_terms: { primaryKey: ["kind", "slug"] },
  metric_profile_migration_events: { primaryKey: ["idempotency_key"] },
  exercise_metric_baselines: {
    primaryKey: ["exercise_id", "exercise_metric_generation"],
  },
  plans: { primaryKey: ["id"] },
  plan_schedules: { primaryKey: ["id"] },
  plan_schedule_bindings: { primaryKey: ["id"] },
  plan_days: { primaryKey: ["id"] },
  plan_day_exercises: { primaryKey: ["id"] },
  plan_warmup_sets: { primaryKey: ["id"] },
  plan_working_set_targets: { primaryKey: ["id"] },
  progression_policies: { primaryKey: ["id"] },
  progression_recommendations: { primaryKey: ["id"] },
  owned_plan_aggregate_states: { primaryKey: ["plan_id"] },
  owned_plan_mutation_requests: { primaryKey: ["request_id"] },
  owned_plan_starter_sources: { primaryKey: ["plan_id"] },
  owned_plan_day_sources: { primaryKey: ["plan_day_id"] },
  owned_plan_day_exercises: { primaryKey: ["id"] },
  owned_plan_warmup_sets: { primaryKey: ["id"] },
  owned_plan_working_set_targets: { primaryKey: ["id"] },
  owned_plan_progression_policies: { primaryKey: ["id"] },
  owned_plan_occurrence_sources: { primaryKey: ["plan_day_exercise_id"] },
  owned_plan_schedules: { primaryKey: ["id"] },
  owned_plan_schedule_versions: { primaryKey: ["id"] },
  owned_plan_schedule_bindings: { primaryKey: ["id"] },
  owned_plan_schedule_overrides: { primaryKey: ["id"] },
  owned_plan_schedule_opportunities: { primaryKey: ["id"] },
  owned_plan_schedule_events: { primaryKey: ["id"] },
  starter_plan_activation_requests: { primaryKey: ["request_id"] },
  workout_sessions: { primaryKey: ["id"] },
  session_exercises: { primaryKey: ["id"] },
  session_sets: { primaryKey: ["id"] },
  session_rest_states: { primaryKey: ["session_id"] },
  session_undo_snapshots: { primaryKey: ["id"] },
  history_session_overlays: { primaryKey: ["session_id"] },
  history_audit_events: { primaryKey: ["id"] },
  owned_progression_recommendations: { primaryKey: ["id"] },
} satisfies Readonly<Record<string, LogicalTableDefinition>>);

export const LOGICAL_BACKUP_TABLES = Object.freeze(
  Object.keys(LOGICAL_BACKUP_TABLE_DEFINITIONS).sort(),
);

export type BackupContractErrorCode =
  | "backup_snapshot_invalid"
  | "backup_snapshot_limit_exceeded"
  | "backup_snapshot_unsupported_version";

export class BackupContractError extends Error {
  readonly kind: "validation" | "unsupported_version";
  readonly retryable = false;
  readonly correlationCode = "GT-BACKUP01" as const;

  constructor(readonly code: BackupContractErrorCode) {
    super(code);
    this.name = "BackupContractError";
    this.kind = code === "backup_snapshot_unsupported_version"
      ? "unsupported_version"
      : "validation";
  }
}

export interface LogicalBackupObject {
  readonly [key: string]: LogicalBackupValue;
}

export type LogicalBackupValue =
  | null
  | boolean
  | number
  | string
  | readonly LogicalBackupValue[]
  | LogicalBackupObject;

export type LogicalBackupRow = Readonly<Record<string, LogicalBackupValue>>;

export type LogicalCatalogReference = Readonly<{
  kind: "exercise" | "plan";
  sourceNamespace: string;
  upstreamId: string;
  sourceRevision: string;
}>;

export type LogicalBackupManifest = Readonly<{
  catalogReferenceCount: number;
  rowCounts: Readonly<Record<string, number>>;
  totalRows: number;
}>;

export type LogicalBackupSnapshot = Readonly<{
  version: typeof LOGICAL_BACKUP_FORMAT_VERSION;
  snapshotId: string;
  createdAtMs: number;
  schemaVersion: number;
  manifest: LogicalBackupManifest;
  tables: Readonly<Record<string, readonly LogicalBackupRow[]>>;
  catalogReferences: readonly LogicalCatalogReference[];
}>;

function invalid(): never {
  throw new BackupContractError("backup_snapshot_invalid");
}

function limitExceeded(): never {
  throw new BackupContractError("backup_snapshot_limit_exceeded");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function assertBoundedString(value: unknown): asserts value is string {
  if (typeof value !== "string") {
    invalid();
  }
  if (byteLength(value) > BACKUP_LIMITS.maxStringBytes) {
    limitExceeded();
  }
}

function assertSafeValue(value: unknown, depth: number): asserts value is LogicalBackupValue {
  if (depth > BACKUP_LIMITS.maxNestingDepth) {
    limitExceeded();
  }
  if (value === null || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      invalid();
    }
    return;
  }
  if (typeof value === "string") {
    assertBoundedString(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      assertSafeValue(item, depth + 1);
    }
    return;
  }
  if (!isPlainObject(value)) {
    invalid();
  }
  for (const [key, nested] of Object.entries(value)) {
    assertBoundedString(key);
    assertSafeValue(nested, depth + 1);
  }
}

function assertNonNegativeSafeInteger(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    invalid();
  }
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function assertCatalogReference(
  value: unknown,
): asserts value is LogicalCatalogReference {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "kind",
    "sourceNamespace",
    "sourceRevision",
    "upstreamId",
  ])) {
    invalid();
  }
  if (value.kind !== "exercise" && value.kind !== "plan") {
    invalid();
  }
  assertBoundedString(value.sourceNamespace);
  assertBoundedString(value.upstreamId);
  assertBoundedString(value.sourceRevision);
  if (
    value.sourceNamespace.trim().length === 0
    || value.upstreamId.trim().length === 0
    || value.sourceRevision.trim().length === 0
  ) {
    invalid();
  }
}

function assertExactManifest(
  value: unknown,
  tables: Record<string, unknown>,
  catalogReferences: readonly unknown[],
): asserts value is LogicalBackupManifest {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "catalogReferenceCount",
    "rowCounts",
    "totalRows",
  ]) || !isPlainObject(value.rowCounts)) {
    invalid();
  }
  assertNonNegativeSafeInteger(value.catalogReferenceCount);
  assertNonNegativeSafeInteger(value.totalRows);
  if (value.catalogReferenceCount !== catalogReferences.length) {
    invalid();
  }

  const tableNames = Object.keys(tables).sort();
  const manifestNames = Object.keys(value.rowCounts).sort();
  if (tableNames.length !== manifestNames.length
    || tableNames.some((name, index) => name !== manifestNames[index])) {
    invalid();
  }

  let countedRows = 0;
  for (const table of tableNames) {
    const count = value.rowCounts[table];
    assertNonNegativeSafeInteger(count);
    if (!Array.isArray(tables[table]) || count !== tables[table].length) {
      invalid();
    }
    countedRows += count;
  }
  if (countedRows !== value.totalRows) {
    invalid();
  }
}

function assertRows(
  table: keyof typeof LOGICAL_BACKUP_TABLE_DEFINITIONS,
  value: unknown,
): asserts value is readonly LogicalBackupRow[] {
  if (!Array.isArray(value)) {
    invalid();
  }
  if (value.length > BACKUP_LIMITS.maxRowsPerTable) {
    limitExceeded();
  }
  const definition = LOGICAL_BACKUP_TABLE_DEFINITIONS[table];
  const identities = new Set<string>();
  for (const row of value) {
    if (!isPlainObject(row)) {
      invalid();
    }
    assertSafeValue(row, 1);
    const identity = definition.primaryKey.map((key) => {
      const value = row[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
      if (typeof value === "number" && Number.isSafeInteger(value)) {
        return value;
      }
      invalid();
    });
    const serializedIdentity = JSON.stringify(identity);
    if (identities.has(serializedIdentity)) {
      invalid();
    }
    identities.add(serializedIdentity);
  }
}

/**
 * Validates a decoded logical payload before any restore writer can receive it.
 * It does not touch SQLite and intentionally returns no raw parsing details.
 */
export function parseLogicalBackupSnapshot(
  input: unknown,
): LogicalBackupSnapshot {
  if (!isPlainObject(input) || !hasExactKeys(input, [
    "catalogReferences",
    "createdAtMs",
    "manifest",
    "schemaVersion",
    "snapshotId",
    "tables",
    "version",
  ])) {
    invalid();
  }
  if (input.version !== LOGICAL_BACKUP_FORMAT_VERSION) {
    throw new BackupContractError("backup_snapshot_unsupported_version");
  }
  assertBoundedString(input.snapshotId);
  if (input.snapshotId.trim().length === 0) {
    invalid();
  }
  assertNonNegativeSafeInteger(input.createdAtMs);
  if (typeof input.schemaVersion !== "number"
    || !Number.isSafeInteger(input.schemaVersion)
    || input.schemaVersion < 1) {
    invalid();
  }
  if (!isPlainObject(input.tables)) {
    invalid();
  }

  let totalRows = 0;
  for (const [table, rows] of Object.entries(input.tables)) {
    if (!Object.prototype.hasOwnProperty.call(LOGICAL_BACKUP_TABLE_DEFINITIONS, table)) {
      invalid();
    }
    assertRows(table as keyof typeof LOGICAL_BACKUP_TABLE_DEFINITIONS, rows);
    totalRows += rows.length;
    if (totalRows > BACKUP_LIMITS.maxRowsTotal) {
      limitExceeded();
    }
  }

  if (!Array.isArray(input.catalogReferences)) {
    invalid();
  }
  if (input.catalogReferences.length > BACKUP_LIMITS.maxRowsPerTable) {
    limitExceeded();
  }
  const catalogIdentities = new Set<string>();
  for (const reference of input.catalogReferences) {
    assertCatalogReference(reference);
    const identity = JSON.stringify([
      reference.kind,
      reference.sourceNamespace,
      reference.upstreamId,
      reference.sourceRevision,
    ]);
    if (catalogIdentities.has(identity)) {
      invalid();
    }
    catalogIdentities.add(identity);
  }

  assertExactManifest(input.manifest, input.tables, input.catalogReferences);

  return input as LogicalBackupSnapshot;
}
