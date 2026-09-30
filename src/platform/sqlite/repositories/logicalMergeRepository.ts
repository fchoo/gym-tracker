import {
  canonicalMergeValue,
  type AutomaticNamespaceAdoptionCommit,
  type FullMergeWriterPort,
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

const FULL_PLAN_OWNED_PLAN_TABLES = Object.freeze([
  "plans",
  "plan_days",
  "plan_schedules",
  "plan_schedule_bindings",
  "plan_day_exercises",
  "plan_warmup_sets",
  "plan_working_set_targets",
  "progression_policies",
  "progression_recommendations",
  "owned_plan_aggregate_states",
  "owned_plan_starter_sources",
  "owned_plan_day_sources",
  "owned_plan_day_exercises",
  "owned_plan_warmup_sets",
  "owned_plan_working_set_targets",
  "owned_plan_progression_policies",
  "owned_plan_occurrence_sources",
  "owned_plan_schedules",
  "owned_plan_schedule_versions",
  "owned_plan_schedule_bindings",
  "owned_plan_schedule_overrides",
  "owned_plan_schedule_opportunities",
  "owned_plan_schedule_events",
  "owned_plan_mutation_requests",
  "starter_plan_activation_requests",
  "owned_progression_recommendations",
] as const satisfies readonly LogicalBackupTableName[]);

const OWNED_ORIGINS = new Set(["custom", "copied"]);
const CUSTOM_OPERATION_KINDS = new Set(["insert", "duplicate", "keep_both"]);
const SESSION_OPERATION_KINDS = new Set(["insert", "duplicate", "archive_won", "local_won"]);
const OWNED_PLAN_OPERATION_KINDS = new Set(["insert", "duplicate", "keep_both"]);
const ROOT_RECORD_CLASSES = new Set(["custom_exercise", "workout_session", "owned_plan"]);
const SQLITE_BATCH_PARAMETER_LIMIT = 900;

type FullPlanInsertTable = "app_settings"
  | (typeof FULL_PLAN_CUSTOM_EXERCISE_TABLES)[number]
  | (typeof FULL_PLAN_OWNED_PLAN_TABLES)[number];

export type LogicalMergeFaultStage =
  | "fingerprint_checked"
  | "adoption_consumed"
  | "verified"
  | "state_updated"
  | `trigger_drop:${typeof MERGE_DELETE_TRIGGER_NAMES[number]}`
  | `trigger_recreate:${typeof MERGE_DELETE_TRIGGER_NAMES[number]}`
  | `delete:${SessionAggregateTable}`
  | `insert:${SessionAggregateTable}`
  | `full_plan_insert:${FullPlanInsertTable}`
  | `full_plan_verify:${FullPlanInsertTable}`;

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

function ownedPlanTable(value: string): value is (typeof FULL_PLAN_OWNED_PLAN_TABLES)[number] {
  return (FULL_PLAN_OWNED_PLAN_TABLES as readonly string[]).includes(value);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function ownedOrigin(value: unknown): boolean {
  return OWNED_ORIGINS.has(value as string);
}

function requireValid(condition: boolean): void {
  if (!condition) fail();
}

function aggregateRequired(kind: string): boolean {
  return kind === "insert" || kind === "keep_both" || kind === "archive_won";
}

function remapRequired(operation: Exclude<PortableMergePlan["operations"][number], {
  aggregateClass: "app_setting";
}>): boolean {
  if (operation.aggregateClass === "workout_session") {
    return operation.kind === "insert" && operation.archiveId !== operation.localId;
  }
  return operation.kind === "keep_both";
}

function plannedRootOperationKey(
  operation: Exclude<PortableMergePlan["operations"][number], {
    aggregateClass: "app_setting";
  }>,
): string {
  return `${operation.aggregateClass}\u0000${operation.archiveId}\u0000${operation.localId}`;
}

function aggregateKey(aggregate: PortableMergeAggregate): string {
  return `${aggregate.aggregateClass}\u0000${aggregate.portableId}`;
}

function textId(value: unknown): string {
  if (!nonEmptyText(value)) fail();
  return value;
}

function assertCustomExerciseAggregate(
  aggregate: PortableMergeAggregate,
  operation: Extract<PortableMergePlan["operations"][number], {
    aggregateClass: "custom_exercise";
  }>,
): void {
  const roots = aggregate.tables.exercises;
  requireValid(roots?.length === 1);
  const [root] = roots!;
  requireValid(root!.id === operation.localId);
  requireValid(root!.portable_id === operation.portableId);
  requireValid(ownedOrigin(root!.origin));
  requireValid(aggregate.tables.exercise_library_entries?.length === 1);
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
    requireValid(fullPlanTable(table));
    requireValid(Array.isArray(rows));
  }
  for (const table of exerciseRows) {
    requireValid((aggregate.tables[table] ?? []).every((row) => row.exercise_id === operation.localId));
  }
  const taxonomyKeys = new Set((aggregate.tables.exercise_taxonomy ?? []).map((row) => {
    requireValid(nonEmptyText(row.kind));
    requireValid(nonEmptyText(row.slug));
    return `${row.kind}\u0000${row.slug}`;
  }));
  const termKeys = new Set((aggregate.tables.taxonomy_terms ?? []).map((row) => {
    requireValid(nonEmptyText(row.kind));
    requireValid(nonEmptyText(row.slug));
    return `${row.kind}\u0000${row.slug}`;
  }));
  requireValid(taxonomyKeys.size === termKeys.size);
  requireValid([...termKeys].every((key) => taxonomyKeys.has(key)));
}

function assertSessionAggregate(
  aggregate: PortableMergeAggregate,
  operation: Extract<PortableMergePlan["operations"][number], {
    aggregateClass: "workout_session";
  }>,
): void {
  const roots = aggregate.tables.workout_sessions;
  requireValid(roots?.length === 1);
  const [root] = roots!;
  requireValid(root!.id === operation.localId);
  requireValid(root!.portable_id === operation.portableId);
  for (const [table, rows] of Object.entries(aggregate.tables)) {
    requireValid((SESSION_AGGREGATE_TABLES as readonly string[]).includes(table));
    requireValid(Array.isArray(rows));
  }
  const exerciseIds = new Set<string>();
  for (const row of aggregate.tables.session_exercises ?? []) {
    requireValid(row.session_id === operation.localId);
    const exerciseId = textId(row.id);
    requireValid(!exerciseIds.has(exerciseId));
    exerciseIds.add(exerciseId);
  }
  const setIds = new Set<string>();
  for (const row of aggregate.tables.session_sets ?? []) {
    const setId = textId(row.id);
    requireValid(!setIds.has(setId));
    requireValid(exerciseIds.has(textId(row.session_exercise_id)));
    setIds.add(setId);
  }
  for (const row of roots!) {
    for (const [column, ids] of [
      ["active_session_exercise_id", exerciseIds],
      ["active_set_id", setIds],
    ] as const) {
      const value = row[column];
      if (value !== null && value !== undefined) requireValid(ids.has(textId(value)));
    }
  }
  for (const table of [
    "session_rest_states",
    "session_advanced_timing_states",
    "session_undo_snapshots",
    "history_session_overlays",
    "history_audit_events",
    "workout_session_exercise_edit_receipts",
    "workout_session_exercise_reorder_receipts",
  ] as const) {
    for (const row of aggregate.tables[table] ?? []) {
      requireValid(row.session_id === operation.localId);
    }
  }
  for (const [table, column] of [
    ["session_rest_states", "next_set_id"],
    ["session_advanced_timing_states", "session_set_id"],
    ["session_undo_snapshots", "completed_set_id"],
  ] as const) {
    for (const row of aggregate.tables[table] ?? []) {
      const value = row[column];
      if (value !== null && value !== undefined) requireValid(setIds.has(textId(value)));
    }
  }
}

function assertOwnedPlanAggregate(
  aggregate: PortableMergeAggregate,
  operation: Extract<PortableMergePlan["operations"][number], {
    aggregateClass: "owned_plan";
  }>,
): void {
  const roots = aggregate.tables.plans;
  requireValid(roots?.length === 1);
  const [root] = roots!;
  requireValid(root!.id === operation.localId);
  requireValid(root!.portable_id === operation.portableId);
  requireValid(ownedOrigin(root!.origin));
  for (const [table, rows] of Object.entries(aggregate.tables)) {
    requireValid(ownedPlanTable(table));
    requireValid(Array.isArray(rows));
  }
  for (const row of aggregate.tables.plan_days ?? []) {
    requireValid(row.plan_id === operation.localId);
  }
  for (const row of aggregate.tables.owned_plan_aggregate_states ?? []) {
    requireValid(row.plan_id === operation.localId);
  }
  const dayIds = new Set<string>();
  for (const row of aggregate.tables.plan_days ?? []) {
    const dayId = textId(row.id);
    requireValid(!dayIds.has(dayId));
    dayIds.add(dayId);
  }
  const legacyScheduleIds = new Set<string>();
  for (const row of aggregate.tables.plan_schedules ?? []) {
    requireValid(row.plan_id === operation.localId);
    const scheduleId = textId(row.id);
    requireValid(!legacyScheduleIds.has(scheduleId));
    legacyScheduleIds.add(scheduleId);
  }
  for (const row of aggregate.tables.plan_schedule_bindings ?? []) {
    requireValid(legacyScheduleIds.has(textId(row.schedule_id)));
    requireValid(dayIds.has(textId(row.plan_day_id)));
  }
  const legacyOccurrenceIds = new Set<string>();
  for (const row of aggregate.tables.plan_day_exercises ?? []) {
    const occurrenceId = textId(row.id);
    requireValid(!legacyOccurrenceIds.has(occurrenceId));
    requireValid(dayIds.has(textId(row.plan_day_id)));
    legacyOccurrenceIds.add(occurrenceId);
  }
  const legacyTargetIds = new Set<string>();
  for (const row of aggregate.tables.plan_working_set_targets ?? []) {
    const targetId = textId(row.id);
    requireValid(!legacyTargetIds.has(targetId));
    requireValid(legacyOccurrenceIds.has(textId(row.plan_day_exercise_id)));
    legacyTargetIds.add(targetId);
  }
  for (const table of ["plan_warmup_sets", "progression_policies"] as const) {
    for (const row of aggregate.tables[table] ?? []) {
      requireValid(legacyOccurrenceIds.has(textId(row.plan_day_exercise_id)));
    }
  }
  for (const row of aggregate.tables.progression_recommendations ?? []) {
    requireValid(legacyTargetIds.has(textId(row.plan_working_set_target_id)));
  }
  const ownedOccurrenceIds = new Set<string>();
  for (const row of aggregate.tables.owned_plan_day_exercises ?? []) {
    const occurrenceId = textId(row.id);
    requireValid(!ownedOccurrenceIds.has(occurrenceId));
    requireValid(dayIds.has(textId(row.plan_day_id)));
    ownedOccurrenceIds.add(occurrenceId);
  }
  const ownedTargetIds = new Set<string>();
  for (const row of aggregate.tables.owned_plan_working_set_targets ?? []) {
    const targetId = textId(row.id);
    requireValid(!ownedTargetIds.has(targetId));
    requireValid(ownedOccurrenceIds.has(textId(row.plan_day_exercise_id)));
    ownedTargetIds.add(targetId);
  }
  for (const table of ["owned_plan_warmup_sets", "owned_plan_progression_policies"] as const) {
    for (const row of aggregate.tables[table] ?? []) {
      requireValid(ownedOccurrenceIds.has(textId(row.plan_day_exercise_id)));
    }
  }
  for (const row of aggregate.tables.owned_progression_recommendations ?? []) {
    requireValid(ownedTargetIds.has(textId(row.owned_plan_working_set_target_id)));
  }
  const ownedScheduleIds = new Set<string>();
  for (const row of aggregate.tables.owned_plan_schedules ?? []) {
    requireValid(row.plan_id === operation.localId);
    const scheduleId = textId(row.id);
    requireValid(!ownedScheduleIds.has(scheduleId));
    ownedScheduleIds.add(scheduleId);
  }
  const ownedVersionIds = new Set<string>();
  for (const row of aggregate.tables.owned_plan_schedule_versions ?? []) {
    const versionId = textId(row.id);
    requireValid(!ownedVersionIds.has(versionId));
    requireValid(ownedScheduleIds.has(textId(row.schedule_id)));
    ownedVersionIds.add(versionId);
  }
  for (const row of aggregate.tables.owned_plan_schedule_bindings ?? []) {
    requireValid(ownedVersionIds.has(textId(row.schedule_version_id)));
    requireValid(dayIds.has(textId(row.plan_day_id)));
  }
  for (const table of [
    "owned_plan_schedule_overrides",
    "owned_plan_schedule_opportunities",
    "owned_plan_schedule_events",
  ] as const) {
    for (const row of aggregate.tables[table] ?? []) {
      requireValid(ownedScheduleIds.has(textId(row.schedule_id)));
    }
  }
  for (const row of aggregate.tables.owned_plan_day_sources ?? []) {
    requireValid(dayIds.has(textId(row.plan_day_id)));
    requireValid(row.plan_id === operation.localId);
  }
  for (const row of aggregate.tables.owned_plan_occurrence_sources ?? []) {
    requireValid(ownedOccurrenceIds.has(textId(row.plan_day_exercise_id)));
    requireValid(dayIds.has(textId(row.plan_day_id)));
  }
}

function assertFullPlanSlice(plan: PortableMergePlan): void {
  requireValid(plan.operations.length > 0);
  const settingInserts = new Set<string>();
  const settingLocalWins = new Set<string>();
  const customWrites = new Map<string, Extract<PortableMergePlan["operations"][number], {
    aggregateClass: "custom_exercise";
  }>>();
  const sessionWrites = new Map<string, Extract<PortableMergePlan["operations"][number], {
    aggregateClass: "workout_session";
  }>>();
  const ownedPlanWrites = new Map<string, Extract<PortableMergePlan["operations"][number], {
    aggregateClass: "owned_plan";
  }>>();
  for (const operation of plan.operations) {
    if (operation.aggregateClass === "app_setting") {
      requireValid(operation.kind === "insert" || operation.kind === "local_won");
      requireValid(nonEmptyText(operation.key));
      if (operation.kind === "insert") {
        requireValid(!settingInserts.has(operation.key));
        settingInserts.add(operation.key);
      } else {
        requireValid(!settingLocalWins.has(operation.key));
        settingLocalWins.add(operation.key);
      }
      continue;
    }
    if (operation.aggregateClass === "custom_exercise") {
      requireValid(CUSTOM_OPERATION_KINDS.has(operation.kind));
      requireValid(isOpaquePortableId(operation.portableId));
      requireValid(nonEmptyText(operation.archiveId));
      requireValid(nonEmptyText(operation.localId));
      requireValid(!customWrites.has(operation.portableId));
      customWrites.set(operation.portableId, operation);
      continue;
    }
    if (operation.aggregateClass === "workout_session") {
      requireValid(SESSION_OPERATION_KINDS.has(operation.kind));
      requireValid(isOpaquePortableId(operation.portableId));
      requireValid(nonEmptyText(operation.archiveId));
      requireValid(nonEmptyText(operation.localId));
      requireValid(!sessionWrites.has(operation.portableId));
      sessionWrites.set(operation.portableId, operation);
      continue;
    }
    if (operation.aggregateClass === "owned_plan") {
      requireValid(OWNED_PLAN_OPERATION_KINDS.has(operation.kind));
      requireValid(isOpaquePortableId(operation.portableId));
      requireValid(nonEmptyText(operation.archiveId));
      requireValid(nonEmptyText(operation.localId));
      requireValid(!ownedPlanWrites.has(operation.portableId));
      ownedPlanWrites.set(operation.portableId, operation);
      continue;
    }
    fail();
  }

  const settingKeys = new Set<string>();
  for (const row of plan.settings) {
    const key = textId(row.key);
    requireValid(!settingKeys.has(key));
    requireValid(settingInserts.has(key));
    settingKeys.add(key);
  }
  requireValid(settingKeys.size === settingInserts.size);

  const aggregates = new Map<string, PortableMergeAggregate>();
  for (const aggregate of plan.aggregates) {
    const key = aggregateKey(aggregate);
    requireValid(!aggregates.has(key));
    if (aggregate.aggregateClass === "custom_exercise") {
      const operation = customWrites.get(aggregate.portableId);
      requireValid(operation !== undefined);
      const admittedOperation = operation!;
      requireValid(admittedOperation.kind === "insert" || admittedOperation.kind === "keep_both");
      assertCustomExerciseAggregate(aggregate, admittedOperation);
    } else if (aggregate.aggregateClass === "workout_session") {
      const operation = sessionWrites.get(aggregate.portableId);
      requireValid(operation !== undefined);
      const admittedOperation = operation!;
      requireValid(admittedOperation.kind === "insert" || admittedOperation.kind === "archive_won");
      assertSessionAggregate(aggregate, admittedOperation);
    } else if (aggregate.aggregateClass === "owned_plan") {
      const operation = ownedPlanWrites.get(aggregate.portableId);
      requireValid(operation !== undefined);
      const admittedOperation = operation!;
      requireValid(admittedOperation.kind === "insert" || admittedOperation.kind === "keep_both");
      assertOwnedPlanAggregate(aggregate, admittedOperation);
    } else {
      fail();
    }
    aggregates.set(key, aggregate);
  }
  for (const operation of customWrites.values()) {
    const hasAggregate = aggregates.has(`custom_exercise\u0000${operation.portableId}`);
    requireValid(hasAggregate === aggregateRequired(operation.kind));
  }
  for (const operation of sessionWrites.values()) {
    const hasAggregate = aggregates.has(`workout_session\u0000${operation.portableId}`);
    requireValid(hasAggregate === aggregateRequired(operation.kind));
  }
  for (const operation of ownedPlanWrites.values()) {
    const hasAggregate = aggregates.has(`owned_plan\u0000${operation.portableId}`);
    requireValid(hasAggregate === aggregateRequired(operation.kind));
  }
  const admittedOperationsByPair = new Map(
    [...customWrites.values(), ...sessionWrites.values(), ...ownedPlanWrites.values()].map((operation) => [
      plannedRootOperationKey(operation),
      operation,
    ] as const),
  );
  const mappings = new Set<string>();
  for (const mapping of plan.idMappings) {
    const key = `${mapping.recordClass}\u0000${mapping.archiveId}\u0000${mapping.localId}`;
    requireValid(ROOT_RECORD_CLASSES.has(mapping.recordClass));
    requireValid(admittedOperationsByPair.has(key));
    requireValid(!mappings.has(key));
    mappings.add(key);
  }
  requireValid(mappings.size === customWrites.size + sessionWrites.size + ownedPlanWrites.size);
  const remaps = new Set<string>();
  for (const remap of plan.idRemaps) {
    const key = `${remap.recordClass}\u0000${remap.archiveId}\u0000${remap.localId}`;
    const operation = admittedOperationsByPair.get(key);
    requireValid(operation !== undefined);
    requireValid(remap.recordClass === operation!.aggregateClass);
    requireValid(remapRequired(operation!));
    requireValid(!remaps.has(key));
    remaps.add(key);
  }
  const expectedRemaps = [...customWrites.values(), ...sessionWrites.values(), ...ownedPlanWrites.values()]
    .filter(remapRequired)
    .map(plannedRootOperationKey);
  requireValid(remaps.size === expectedRemaps.length);
  requireValid(expectedRemaps.every((key) => remaps.has(key)));
}

/**
 * Exhaustive fail-closed plan validation is intentionally private to the
 * repository. This read-only test seam has no kernel or writer capability.
 */
export const __logicalMergeRepositoryTestOnly = Object.freeze({
  aggregateRows,
  aggregateKey,
  assertCustomExerciseAggregate,
  assertFullPlanSlice,
  assertFullPlanMatchesLocal,
  assertNoExternalSessionReferences,
  assertOwnedPlanAggregate,
  assertSessionAggregate,
  captureDeleteTriggers,
  dropDeleteTriggers,
  deleteLocalAggregate,
  fail,
  fullPlanTable,
  identifier,
  insertArchiveAggregate,
  insertCustomExerciseAggregate,
  insertFullPlanRow,
  insertFullPlanSessionAggregate,
  insertFullPlanSettings,
  insertFullPlanTaxonomyTerm,
  insertFullPlanTaxonomyTerms,
  insertOwnedPlanAggregate,
  insertRow,
  insertRows,
  markRebuildPending,
  ownedPlanAggregatesForFullPlan,
  ownedPlanTable,
  plannedRootOperationKey,
  readRowsByPrimaryKey,
  recreateDeleteTriggers,
  sessionAggregatesForFullPlan,
  scalar,
  requireValid,
  textId,
  snapshotFullPlan,
  verifyFullPlanSlice,
  verifyRows,
});

function assertFullPlanMatchesLocal(
  plan: PortableMergePlan,
  local: Awaited<ReturnType<typeof readSqliteMergeLocalFacts>>,
): void {
  const settings = new Set((local.tables.app_settings ?? []).map((row) => {
    if (!nonEmptyText(row.key)) fail();
    return row.key;
  }));
  const exercises = local.tables.exercises ?? [];
  const sessions = local.tables.workout_sessions ?? [];
  const plans = local.tables.plans ?? [];
  for (const operation of plan.operations) {
    if (operation.aggregateClass === "app_setting") {
      if ((operation.kind === "insert" && settings.has(operation.key))
        || (operation.kind === "local_won" && !settings.has(operation.key))) {
        fail();
      }
      continue;
    }
    if (operation.aggregateClass === "workout_session") {
      const sameIdentity = sessions.filter((row) => row.portable_id === operation.portableId);
      const localPhysicalIdTaken = sessions.some((row) => row.id === operation.localId);
      if (operation.kind === "insert") {
        if (sameIdentity.length !== 0 || localPhysicalIdTaken) fail();
        continue;
      }
      if (sameIdentity.length !== 1 || sameIdentity[0]?.id !== operation.localId) fail();
      continue;
    }
    if (operation.aggregateClass === "owned_plan") {
      const sameIdentity = plans.filter((row) =>
        (row.origin === "custom" || row.origin === "copied")
        && row.portable_id === operation.portableId,
      );
      const localPhysicalIdTaken = plans.some((row) => row.id === operation.localId);
      if (operation.kind === "duplicate") {
        if (sameIdentity.length !== 1 || sameIdentity[0]?.id !== operation.localId) fail();
        continue;
      }
      if (sameIdentity.length !== 0 || localPhysicalIdTaken
        || (operation.kind === "insert" && operation.archiveId !== operation.localId)
        || (operation.kind === "keep_both" && (!plans.some((row) => row.id === operation.archiveId)
          || operation.archiveId === operation.localId))) {
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

function ownedPlanAggregatesForFullPlan(
  plan: PortableMergePlan,
): readonly Readonly<{
  aggregate: PortableMergeAggregate;
  operation: Extract<PortableMergePlan["operations"][number], {
    aggregateClass: "owned_plan";
  }>;
}>[] {
  const operations = new Map(plan.operations.flatMap((operation) =>
    operation.aggregateClass === "owned_plan"
      ? [[operation.portableId, operation] as const]
      : [],
  ));
  return Object.freeze(plan.aggregates.flatMap((aggregate) => {
    if (aggregate.aggregateClass !== "owned_plan") return [];
    const operation = operations.get(aggregate.portableId);
    if (operation === undefined) fail();
    return [Object.freeze({ aggregate, operation })];
  }));
}

function sessionAggregatesForFullPlan(
  plan: PortableMergePlan,
): readonly Readonly<{
  aggregate: PortableMergeAggregate;
  operation: Extract<PortableMergePlan["operations"][number], {
    aggregateClass: "workout_session";
  }>;
}>[] {
  const operations = new Map(plan.operations.flatMap((operation) =>
    operation.aggregateClass === "workout_session"
      ? [[operation.portableId, operation] as const]
      : [],
  ));
  return Object.freeze(plan.aggregates.flatMap((aggregate) => {
    if (aggregate.aggregateClass !== "workout_session") return [];
    const operation = operations.get(aggregate.portableId);
    if (operation === undefined) fail();
    return [Object.freeze({ aggregate, operation })];
  }));
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

type MergeInsertTable = FullPlanInsertTable | SessionAggregateTable;

async function insertRows(
  transaction: SqliteTransactionExecutor,
  table: MergeInsertTable,
  rows: readonly LogicalBackupRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]!);
  if (columns.length === 0 || rows.some((row) => (
    Object.keys(row).length !== columns.length
    || columns.some((column) => !hasOwn(row, column))
  ))) fail();
  const rowsPerBatch = Math.max(
    1,
    Math.floor(SQLITE_BATCH_PARAMETER_LIMIT / columns.length),
  );
  for (let offset = 0; offset < rows.length; offset += rowsPerBatch) {
    const batch = rows.slice(offset, offset + rowsPerBatch);
    const result = await transaction.execute(
      `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(", ")})
       VALUES ${batch.map(() => `(${columns.map(() => "?").join(", ")})`).join(", ")}`,
      batch.flatMap((row) => columns.map((column) => scalar(row[column]))),
    );
    if (result.changes !== batch.length) fail();
  }
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

function primaryKeyValue(
  table: MergeInsertTable,
  row: LogicalBackupRow,
): string {
  return JSON.stringify(LOGICAL_BACKUP_TABLE_DEFINITIONS[table].primaryKey.map(
    (column) => scalar(row[column]),
  ));
}

function assertExactExpectedRow(
  expected: LogicalBackupRow,
  actual: LogicalBackupRow,
): void {
  for (const [column, value] of Object.entries(expected)) {
    if (!hasOwn(actual, column) || actual[column] !== value) fail();
  }
}

async function readRowsByPrimaryKey(
  transaction: SqliteTransactionExecutor,
  table: MergeInsertTable,
  rows: readonly LogicalBackupRow[],
): Promise<ReadonlyMap<string, LogicalBackupRow>> {
  if (rows.length === 0) return new Map();
  const primaryKey = LOGICAL_BACKUP_TABLE_DEFINITIONS[table].primaryKey;
  const rowsPerBatch = Math.max(
    1,
    Math.floor(SQLITE_BATCH_PARAMETER_LIMIT / primaryKey.length),
  );
  const output = new Map<string, LogicalBackupRow>();
  for (let offset = 0; offset < rows.length; offset += rowsPerBatch) {
    const batch = rows.slice(offset, offset + rowsPerBatch);
    const actualRows = await transaction.queryAll<LogicalBackupRow>(
      `SELECT * FROM ${identifier(table)} WHERE ${batch.map(() => (
        `(${primaryKey.map((column) => `${identifier(column)} = ?`).join(" AND ")})`
      )).join(" OR ")}`,
      batch.flatMap((row) => primaryKey.map((column) => scalar(row[column]))),
    );
    for (const actual of actualRows) {
      const key = primaryKeyValue(table, actual);
      if (output.has(key)) fail();
      output.set(key, actual);
    }
  }
  return output;
}

async function verifyRows(
  transaction: SqliteTransactionExecutor,
  table: MergeInsertTable,
  rows: readonly LogicalBackupRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const expected = new Map<string, LogicalBackupRow>();
  for (const row of rows) {
    const key = primaryKeyValue(table, row);
    if (expected.has(key)) fail();
    expected.set(key, row);
  }
  const actual = await readRowsByPrimaryKey(transaction, table, rows);
  if (actual.size !== expected.size) fail();
  for (const [key, expectedRow] of expected) {
    const actualRow = actual.get(key);
    if (actualRow === undefined) fail();
    assertExactExpectedRow(expectedRow, actualRow);
  }
}

async function insertFullPlanTaxonomyTerms(
  transaction: SqliteTransactionExecutor,
  rows: readonly LogicalBackupRow[],
): Promise<void> {
  const existing = await readRowsByPrimaryKey(transaction, "taxonomy_terms", rows);
  const inserts: LogicalBackupRow[] = [];
  for (const row of rows) {
    const retained = existing.get(primaryKeyValue("taxonomy_terms", row));
    if (retained === undefined) inserts.push(row);
    else assertExactExpectedRow(row, retained);
  }
  await insertRows(transaction, "taxonomy_terms", inserts);
}

async function insertArchiveAggregate(
  transaction: SqliteTransactionExecutor,
  tables: Readonly<Record<string, readonly LogicalBackupRow[]>>,
  faultAfter: ((stage: LogicalMergeFaultStage) => Promise<void>) | undefined,
): Promise<void> {
  for (const table of SESSION_AGGREGATE_TABLES) {
    await insertRows(transaction, table, aggregateRows(tables, table));
    await faultAfter?.(`insert:${table}`);
  }
}

async function insertFullPlanSettings(
  transaction: SqliteTransactionExecutor,
  plan: PortableMergePlan,
  faultAfter: ((stage: LogicalMergeFaultStage) => Promise<void>) | undefined,
): Promise<void> {
  await insertRows(transaction, "app_settings", plan.settings);
  await faultAfter?.("full_plan_insert:app_settings");
}

async function insertCustomExerciseAggregate(
  transaction: SqliteTransactionExecutor,
  aggregate: PortableMergeAggregate,
  faultAfter: ((stage: LogicalMergeFaultStage) => Promise<void>) | undefined,
): Promise<void> {
  for (const table of FULL_PLAN_CUSTOM_EXERCISE_TABLES) {
    const rows = aggregate.tables[table] ?? [];
    if (table === "taxonomy_terms") {
      await insertFullPlanTaxonomyTerms(transaction, rows);
    } else {
      await insertRows(transaction, table, rows);
    }
    await faultAfter?.(`full_plan_insert:${table}`);
  }
}

async function insertFullPlanSessionAggregate(
  transaction: SqliteTransactionExecutor,
  aggregate: PortableMergeAggregate,
  faultAfter: ((stage: LogicalMergeFaultStage) => Promise<void>) | undefined,
): Promise<void> {
  for (const table of SESSION_AGGREGATE_TABLES) {
    await insertRows(transaction, table, aggregate.tables[table] ?? []);
    await faultAfter?.(`insert:${table}`);
  }
}

async function insertOwnedPlanAggregate(
  transaction: SqliteTransactionExecutor,
  aggregate: PortableMergeAggregate,
  faultAfter: ((stage: LogicalMergeFaultStage) => Promise<void>) | undefined,
): Promise<void> {
  for (const table of FULL_PLAN_OWNED_PLAN_TABLES) {
    await insertRows(transaction, table, aggregate.tables[table] ?? []);
    await faultAfter?.(`full_plan_insert:${table}`);
  }
}

async function verifyFullPlanSlice(
  transaction: SqliteTransactionExecutor,
  plan: PortableMergePlan,
  faultAfter: ((stage: LogicalMergeFaultStage) => Promise<void>) | undefined,
): Promise<void> {
  await verifyRows(transaction, "app_settings", plan.settings);
  await faultAfter?.("full_plan_verify:app_settings");
  for (const aggregate of plan.aggregates) {
    if (aggregate.aggregateClass !== "custom_exercise") continue;
    const root = aggregate.tables.exercises?.[0];
    if (root === undefined || typeof root.id !== "string"
      || typeof root.portable_id !== "string") {
      fail();
    }
    for (const table of FULL_PLAN_CUSTOM_EXERCISE_TABLES) {
      await verifyRows(transaction, table, aggregate.tables[table] ?? []);
      await faultAfter?.(`full_plan_verify:${table}`);
    }
  }
  for (const { aggregate, operation } of ownedPlanAggregatesForFullPlan(plan)) {
    const root = aggregate.tables.plans?.[0];
    if (root?.id !== operation.localId || root.portable_id !== operation.portableId) fail();
    for (const table of FULL_PLAN_OWNED_PLAN_TABLES) {
      await verifyRows(transaction, table, aggregate.tables[table] ?? []);
      await faultAfter?.(`full_plan_verify:${table}`);
    }
  }
  for (const { aggregate, operation } of sessionAggregatesForFullPlan(plan)) {
    const root = aggregate.tables.workout_sessions?.[0];
    if (root?.id !== operation.localId) fail();
    const verified = await readSqliteMergeLocalFacts(transaction);
    const actual = verified.tables.workout_sessions!.find(
      (row) => row.id === operation.localId,
    );
    if (actual === undefined || actual.portable_id !== operation.portableId
      || canonicalMergeValue(portableMergeSessionAggregate(verified, actual).tables)
        !== canonicalMergeValue(aggregate.tables)) {
      fail();
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

async function applyNamespaceAdoption(
  transaction: SqliteTransactionExecutor,
  adoption: AutomaticNamespaceAdoptionCommit,
  nowMs: number,
): Promise<void> {
  requireValid(nonEmptyText(adoption.receiptId) && adoption.receiptId.length <= 128);
  requireValid(nonEmptyText(adoption.permissionId));
  requireValid(Number.isSafeInteger(adoption.connectionGeneration) && adoption.connectionGeneration >= 0);
  requireValid(adoption.environment === "production" || adoption.environment === "development-test");
  requireValid(isOpaquePortableId(adoption.oldNamespace) && isOpaquePortableId(adoption.newNamespace));
  requireValid(adoption.oldNamespace !== adoption.newNamespace);
  requireValid(/^[a-f0-9]{64}$/u.test(adoption.localFingerprint));
  requireValid(/^[a-f0-9]{64}$/u.test(adoption.remoteSnapshotSha256));
  requireValid(Number.isSafeInteger(adoption.expiresAtMs) && adoption.expiresAtMs >= nowMs);
  const [state] = await transaction.queryAll<{
    permission_id: string | null;
    connection_generation: number;
    environment: string;
  }>("SELECT permission_id, connection_generation, environment FROM automatic_backup_state WHERE id = 1");
  requireValid(state?.permission_id === adoption.permissionId
    && state.connection_generation === adoption.connectionGeneration
    && state.environment === adoption.environment);
  const [owner] = await transaction.queryAll<{ owner_namespace: string }>(
    "SELECT owner_namespace FROM portable_owner_identity WHERE id = 1",
  );
  requireValid(owner?.owner_namespace === adoption.oldNamespace);
  const inserted = await transaction.execute(
    `INSERT INTO automatic_backup_namespace_adoption (
      receipt_id, permission_id, environment, old_namespace, new_namespace,
      local_fingerprint, remote_snapshot_sha256, expires_at_ms, consumed_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      adoption.receiptId,
      adoption.permissionId,
      adoption.environment,
      adoption.oldNamespace,
      adoption.newNamespace,
      adoption.localFingerprint,
      adoption.remoteSnapshotSha256,
      adoption.expiresAtMs,
    ],
  );
  requireValid(inserted.changes === 1);
  const updated = await transaction.execute(
    "UPDATE portable_owner_identity SET owner_namespace = ? WHERE id = 1 AND owner_namespace = ?",
    [adoption.newNamespace, adoption.oldNamespace],
  );
  requireValid(updated.changes === 1);
  const consumed = await transaction.execute(
    "UPDATE automatic_backup_namespace_adoption SET consumed_at_ms = ? WHERE receipt_id = ? AND consumed_at_ms IS NULL",
    [nowMs, adoption.receiptId],
  );
  requireValid(consumed.changes === 1);
  const generation = await transaction.execute(
    `UPDATE automatic_backup_state
     SET mutation_generation = mutation_generation + 1,
       dirty_since_ms = COALESCE(dirty_since_ms, ?)
     WHERE id = 1 AND permission_id = ? AND connection_generation = ? AND environment = ?`,
    [nowMs, adoption.permissionId, adoption.connectionGeneration, adoption.environment],
  );
  requireValid(generation.changes === 1);
}

type LogicalMergeRepository = MergeWriterPort & Readonly<{
  /** Internal integration seam; SecureMergeCommands intentionally does not expose it. */
  commitFullPlan(input: Readonly<{
    localFingerprint: string;
    plan: PortableMergePlan;
    adoption?: AutomaticNamespaceAdoptionCommit;
  }>): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>>;
}>;

function createLogicalMergeRepositoryInternal(
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
          if (fullPlanInput.adoption !== undefined) {
            requireValid(fullPlanInput.adoption.localFingerprint === fullPlanInput.localFingerprint);
            await applyNamespaceAdoption(
              transaction,
              fullPlanInput.adoption,
              input.nowMs?.() ?? Date.now(),
            );
            await input.faultAfter?.("adoption_consumed");
          }
          if (plan.settings.length === 0 && plan.aggregates.length === 0
            && fullPlanInput.adoption === undefined) {
            return Object.freeze({ state: "ready" as const });
          }

          const foreignKeys = await transaction.queryAll<{ foreign_keys: number }>("PRAGMA foreign_keys");
          if (foreignKeys.length !== 1 || foreignKeys[0]?.foreign_keys !== 1) fail();
          await transaction.execute("PRAGMA defer_foreign_keys = ON");
          await insertFullPlanSettings(transaction, plan, input.faultAfter);
          for (const aggregate of plan.aggregates) {
            if (aggregate.aggregateClass === "custom_exercise") {
              await insertCustomExerciseAggregate(transaction, aggregate, input.faultAfter);
            }
          }
          const sessionAggregates = sessionAggregatesForFullPlan(plan);
          const archiveWins = sessionAggregates.filter(({ operation }) =>
            operation.kind === "archive_won");
          const triggers = archiveWins.length === 0
            ? undefined
            : await captureDeleteTriggers(transaction);
          if (triggers !== undefined) {
            await dropDeleteTriggers(transaction, triggers, input.faultAfter);
          }
          for (const { operation } of archiveWins) {
            await assertNoExternalSessionReferences(transaction, operation.localId);
            await deleteLocalAggregate(transaction, operation.localId, input.faultAfter);
          }
          for (const { aggregate } of sessionAggregates) {
            await insertFullPlanSessionAggregate(transaction, aggregate, input.faultAfter);
          }
          if (triggers !== undefined) {
            await recreateDeleteTriggers(transaction, triggers, input.faultAfter);
          }
          for (const { aggregate } of ownedPlanAggregatesForFullPlan(plan)) {
            await insertOwnedPlanAggregate(transaction, aggregate, input.faultAfter);
          }
          await verifyFullPlanSlice(transaction, plan, input.faultAfter);
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

          const localSessions = local.tables.workout_sessions!.filter(
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
          const mergedSession = verified.tables.workout_sessions!.find(
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

/**
 * Legacy single-session writer used only by the original tracer contract.
 * Full aggregate imports must pass through `createFullPlanLogicalMergeWriter`,
 * which is the capability supplied to secure merge commands.
 */
export function createLogicalMergeRepository(
  kernel: SqliteKernel,
  input: Readonly<{
    nowMs?(): number;
    sha256(value: string): Promise<string>;
    faultAfter?(stage: LogicalMergeFaultStage): Promise<void>;
  }>,
): MergeWriterPort {
  const repository = createLogicalMergeRepositoryInternal(kernel, input);
  return Object.freeze({ commit: repository.commit });
}

/**
 * Narrow full-plan capability. Production secure-merge commands receive this
 * interface only, so the private writer cannot be reached through the legacy
 * tracer repository surface.
 */
export function createFullPlanLogicalMergeWriter(
  kernel: SqliteKernel,
  input: Readonly<{
    nowMs?(): number;
    sha256(value: string): Promise<string>;
    faultAfter?(stage: LogicalMergeFaultStage): Promise<void>;
  }>,
): FullMergeWriterPort {
  const repository = createLogicalMergeRepositoryInternal(kernel, input);
  return Object.freeze({ commitFullPlan: repository.commitFullPlan });
}
