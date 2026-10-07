/** Version 3 is the Phase 13 successor graph.  Versions 1 and 2 stay frozen. */
/** Version 6 carries the complete schema-35 Phase 13 source graph. */
export const LOGICAL_BACKUP_FORMAT_VERSION = 6 as const;
export const LOGICAL_BACKUP_ACCEPTED_FORMAT_VERSIONS = Object.freeze([1, 2, 3, 4, 5, 6] as const);

export type LogicalBackupFormatVersion =
  (typeof LOGICAL_BACKUP_ACCEPTED_FORMAT_VERSIONS)[number];

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
  portable_owner_identity: { primaryKey: ["id"] },
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
  workout_session_exercise_edit_receipts: { primaryKey: ["request_id"] },
  workout_session_exercise_reorder_receipts: { primaryKey: ["request_id"] },
  session_exercises: { primaryKey: ["id"] },
  session_sets: { primaryKey: ["id"] },
  session_rest_states: { primaryKey: ["session_id"] },
  session_advanced_timing_states: { primaryKey: ["session_id"] },
  session_undo_snapshots: { primaryKey: ["id"] },
  history_session_overlays: { primaryKey: ["session_id"] },
  history_audit_events: { primaryKey: ["id"] },
  owned_progression_recommendations: { primaryKey: ["id"] },
  running_plans: { primaryKey: ["plan_id"] },
  running_session_revisions: { primaryKey: ["id"] },
  running_session_roots: { primaryKey: ["id"] },
  running_session_slot_roots: { primaryKey: ["id"] },
  running_session_slot_revisions: { primaryKey: ["id"] },
  running_plan_receipts: { primaryKey: ["request_id"] },
  running_plan_events: { primaryKey: ["id"] },
  running_goals: { primaryKey: ["id"] },
  running_session_slots: { primaryKey: ["id"] },
  running_opportunities: { primaryKey: ["id"] },
  workout_provenance: { primaryKey: ["workout_session_id"] },
  workout_receipts: { primaryKey: ["id"] },
  workout_session_schedule_links: { primaryKey: ["workout_session_id"] },
  workout_schedule_reconciliation_receipts: { primaryKey: ["id"] },
  workout_completed_set_correction_receipts: { primaryKey: ["request_id"] },
  imported_activities: { primaryKey: ["id"] },
  imported_activity_payloads: { primaryKey: ["id"] },
  imported_activity_references: { primaryKey: ["id"] },
  imported_activity_laps: { primaryKey: ["id"] },
  imported_activity_chunks: { primaryKey: ["id"] },
  imported_activity_receipts: { primaryKey: ["id"] },
  imported_activity_removal_events: { primaryKey: ["id"] },
  imported_activity_identities: { primaryKey: ["activity_id"] },
  imported_activity_events: { primaryKey: ["id"] },
  imported_activity_match_invalidations: { primaryKey: ["id"] },
  running_match_events: { primaryKey: ["id"] },
  running_current_matches: { primaryKey: ["opportunity_id"] },
  running_activity_match_events: { primaryKey: ["id"] },
  running_activity_match_receipts: { primaryKey: ["request_id"] },
  bodyweight_revisions: { primaryKey: ["id"] },
  bodyweight_tombstones: { primaryKey: ["id"] },
  bodyweight_entries: { primaryKey: ["id"] },
  bodyweight_entry_events: { primaryKey: ["id"] },
  bodyweight_command_receipts: { primaryKey: ["request_id"] },
} satisfies Readonly<Record<string, LogicalTableDefinition>>);

export type LogicalBackupTableName =
  keyof typeof LOGICAL_BACKUP_TABLE_DEFINITIONS;

export const LOGICAL_BACKUP_TABLES = Object.freeze(
  Object.keys(LOGICAL_BACKUP_TABLE_DEFINITIONS).sort(),
) as readonly LogicalBackupTableName[];

/** The historical v2 graph must never grow when successor source tables land. */
export const LOGICAL_BACKUP_V2_TABLES = Object.freeze(
  LOGICAL_BACKUP_TABLES.filter((table) => ![
    "running_plans", "running_session_revisions", "running_goals",
    "running_session_slots", "running_opportunities", "workout_provenance",
    "workout_receipts", "imported_activities", "imported_activity_payloads",
    "imported_activity_references", "imported_activity_laps",
    "imported_activity_chunks", "imported_activity_receipts",
    "imported_activity_removal_events", "running_match_events",
    "running_current_matches", "bodyweight_revisions", "bodyweight_tombstones",
    "running_session_roots", "running_session_slot_roots",
    "running_session_slot_revisions", "running_plan_receipts", "running_plan_events",
    "bodyweight_entries", "bodyweight_entry_events", "bodyweight_command_receipts",
    "imported_activity_identities", "imported_activity_events",
    "imported_activity_match_invalidations", "workout_session_schedule_links",
    "workout_schedule_reconciliation_receipts", "workout_completed_set_correction_receipts",
    "running_activity_match_events", "running_activity_match_receipts",
  ].includes(table)),
) as readonly LogicalBackupTableName[];

/** Schema 29 stable-root data is a v4 successor only; v1-v3 stay frozen. */
export const LOGICAL_BACKUP_V3_TABLES = Object.freeze(
  LOGICAL_BACKUP_TABLES.filter((table) => ![
    "running_session_roots", "running_session_slot_roots",
    "running_session_slot_revisions", "running_plan_receipts", "running_plan_events",
    "bodyweight_entries", "bodyweight_entry_events", "bodyweight_command_receipts",
    "imported_activity_identities", "imported_activity_events",
    "imported_activity_match_invalidations", "workout_session_schedule_links",
    "workout_schedule_reconciliation_receipts", "workout_completed_set_correction_receipts",
    "running_activity_match_events", "running_activity_match_receipts",
  ].includes(table)),
) as readonly LogicalBackupTableName[];

/** v4 is frozen before the bodyweight aggregate successor landed. */
export const LOGICAL_BACKUP_V4_TABLES = Object.freeze(
  LOGICAL_BACKUP_TABLES.filter((table) => ![
    "bodyweight_entries", "bodyweight_entry_events", "bodyweight_command_receipts",
    "imported_activity_identities", "imported_activity_events",
    "imported_activity_match_invalidations", "workout_session_schedule_links",
    "workout_schedule_reconciliation_receipts", "workout_completed_set_correction_receipts",
    "running_activity_match_events", "running_activity_match_receipts",
  ].includes(table)),
) as readonly LogicalBackupTableName[];

/** v5 is frozen at schema 31, before the remaining Phase 13 source successors. */
export const LOGICAL_BACKUP_V5_TABLES = Object.freeze(
  LOGICAL_BACKUP_TABLES.filter((table) => ![
    "imported_activity_identities", "imported_activity_events",
    "imported_activity_match_invalidations", "workout_session_schedule_links",
    "workout_schedule_reconciliation_receipts", "workout_completed_set_correction_receipts",
    "running_activity_match_events", "running_activity_match_receipts",
  ].includes(table)),
) as readonly LogicalBackupTableName[];

/** v6 excludes mutable projections which deterministic reconciliation rebuilds. */
export const LOGICAL_BACKUP_V6_TABLES = Object.freeze(
  LOGICAL_BACKUP_TABLES.filter((table) => table !== "running_current_matches"),
) as readonly LogicalBackupTableName[];

/**
 * Migration 23 was shipped before the Phase 13 source graph existed. Its
 * generation triggers must keep addressing this exact schema-23 table set on
 * a fresh install, rather than observing the latest logical-backup registry.
 */
export const LOGICAL_BACKUP_SCHEMA_23_TABLES = Object.freeze([
  "app_settings",
  "exercise_aliases",
  "exercise_library_entries",
  "exercise_metric_baselines",
  "exercise_owner_preferences",
  "exercise_search_terms",
  "exercise_taxonomy",
  "exercises",
  "history_audit_events",
  "history_session_overlays",
  "metric_profile_migration_events",
  "owned_plan_aggregate_states",
  "owned_plan_day_exercises",
  "owned_plan_day_sources",
  "owned_plan_mutation_requests",
  "owned_plan_occurrence_sources",
  "owned_plan_progression_policies",
  "owned_plan_schedule_bindings",
  "owned_plan_schedule_events",
  "owned_plan_schedule_opportunities",
  "owned_plan_schedule_overrides",
  "owned_plan_schedule_versions",
  "owned_plan_schedules",
  "owned_plan_starter_sources",
  "owned_plan_warmup_sets",
  "owned_plan_working_set_targets",
  "owned_progression_recommendations",
  "plan_day_exercises",
  "plan_days",
  "plan_schedule_bindings",
  "plan_schedules",
  "plan_warmup_sets",
  "plan_working_set_targets",
  "plans",
  "progression_policies",
  "progression_recommendations",
  "session_advanced_timing_states",
  "session_exercises",
  "session_rest_states",
  "session_sets",
  "session_undo_snapshots",
  "starter_plan_activation_requests",
  "taxonomy_terms",
  "workout_session_exercise_edit_receipts",
  "workout_session_exercise_reorder_receipts",
  "workout_sessions",
] as const satisfies readonly LogicalBackupTableName[]);

export const LOGICAL_BACKUP_V1_TABLES = Object.freeze(
  LOGICAL_BACKUP_V2_TABLES.filter((table) => table !== "portable_owner_identity"),
) as readonly LogicalBackupTableName[];

export const LOGICAL_BACKUP_PRE_PHASE10_V1_TABLES = Object.freeze(
  LOGICAL_BACKUP_V1_TABLES.filter(
    (table) => table !== "session_advanced_timing_states",
  ),
) as readonly LogicalBackupTableName[];

export function logicalBackupTablesForVersion(
  version: LogicalBackupFormatVersion,
  schemaVersion = Number.POSITIVE_INFINITY,
): readonly (keyof typeof LOGICAL_BACKUP_TABLE_DEFINITIONS)[] {
  if (version === 6) return LOGICAL_BACKUP_V6_TABLES;
  if (version === 5) return LOGICAL_BACKUP_V5_TABLES;
  if (version === 4) return LOGICAL_BACKUP_V4_TABLES;
  if (version === 3) return LOGICAL_BACKUP_V3_TABLES;
  if (version === 2) return LOGICAL_BACKUP_V2_TABLES;
  return schemaVersion < 21
    ? LOGICAL_BACKUP_PRE_PHASE10_V1_TABLES
    : LOGICAL_BACKUP_V1_TABLES;
}

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
  version: LogicalBackupFormatVersion;
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
  version: LogicalBackupFormatVersion,
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

function assertV2PortableOwnerIdentity(
  tables: Record<string, unknown>,
): void {
  const rows = tables.portable_owner_identity;
  if (!Array.isArray(rows) || rows.length !== 1 || !isPlainObject(rows[0])) {
    invalid();
  }
  const row = rows[0];
  if (!hasExactKeys(row, ["id", "owner_namespace"])
    || row.id !== 1
    || typeof row.owner_namespace !== "string"
    || !/^[a-f0-9]{32}$/u.test(row.owner_namespace)) {
    invalid();
  }
}

function assertV2RootIdentities(
  tables: Record<string, unknown>,
): void {
  const roots = [
    ["exercises", (row: Record<string, unknown>) => (
      row.origin === "custom" || row.origin === "copied"
    )],
    ["plans", (row: Record<string, unknown>) => (
      row.origin === "custom" || row.origin === "copied"
    )],
    ["workout_sessions", () => true],
  ] as const;
  for (const [table, requiresIdentity] of roots) {
    const rows = tables[table];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!isPlainObject(row) || !requiresIdentity(row)) continue;
      if (typeof row.portable_id !== "string"
        || !/^[a-f0-9]{32}$/u.test(row.portable_id)) {
        invalid();
      }
      if (table === "workout_sessions"
        && (!Number.isSafeInteger(row.merge_modified_at_ms)
          || (row.merge_modified_at_ms as number) < 0)) {
        invalid();
      }
    }
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
  if (!(LOGICAL_BACKUP_ACCEPTED_FORMAT_VERSIONS as readonly unknown[]).includes(input.version)) {
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

  const version = input.version as LogicalBackupFormatVersion;
  assertExactManifest(
    input.manifest,
    input.tables,
    input.catalogReferences,
    version,
  );
  if (version >= 2) {
    assertV2PortableOwnerIdentity(input.tables);
    assertV2RootIdentities(input.tables);
  } else if (Object.prototype.hasOwnProperty.call(input.tables, "portable_owner_identity")) {
    invalid();
  }
  return input as LogicalBackupSnapshot;
}
