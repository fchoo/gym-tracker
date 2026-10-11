import {
  canonicalMergeValue,
  type MergeLocalFacts,
} from "../../domains/portability/mergeCommands";
import {
  BACKUP_LIMITS,
  parseLogicalBackupSnapshot,
  type LogicalBackupSnapshot,
} from "../../domains/portability/backupContracts";
import {
  buildPortableMergePlan,
  type PortableMergePlan,
  type PortableMergePlanSnapshot,
} from "../../domains/portability/mergePlan";
import {
  createLogicalBackupRepository,
} from "../../platform/sqlite/repositories/logicalBackupRepository";
import {
  createFullPlanLogicalMergeWriter,
  type LogicalMergeFaultStage,
} from "../../platform/sqlite/repositories/logicalMergeRepository";
import {
  createExerciseSearchIndexRepository,
} from "../../platform/sqlite/repositories/exerciseSearchIndexRepository";
import {
  createHistoryProjectionRepository,
} from "../../platform/sqlite/repositories/historyProjectionRepository";
import {
  createImportedActivityRepository,
} from "../../platform/sqlite/repositories/importedActivityRepository";
import {
  createRunningActivityMatchRepository,
} from "../../platform/sqlite/repositories/runningActivityMatchRepository";
import {
  createRunningPlanRepository,
} from "../../platform/sqlite/repositories/runningPlanRepository";
import {
  createRestoreReconciliationRepository,
} from "../../platform/sqlite/repositories/restoreReconciliationRepository";
import {
  createSqliteMergeLocalFactsPort,
} from "../../platform/sqlite/repositories/restorePreflightAdapters";
import {
  createMigrationRunner,
} from "../../platform/sqlite/migrationRunner";
import { migrations } from "../../platform/sqlite/migrations";
import type {
  RecoveryBackupPort,
} from "../../platform/sqlite/recoveryBackup";
import type {
  SqliteKernel,
  SqliteKernelTestObserver,
} from "../../platform/sqlite/sqliteKernel";
import {
  createExpoMigrationsEffectsContractAdapter,
} from "./migrationsEffects.contract";

export const PORTABLE_MERGE_CONTRACT_VERSION = 1 as const;

export const PORTABLE_MERGE_CONTRACT_CASES = [
  "portable-merge-mixed-full-plan-success",
  "portable-merge-same-name-keep-both",
  "portable-merge-same-identity-dedup-remap",
  "portable-merge-session-history-newest-wins",
  "portable-merge-settings-existing-wins",
  "portable-merge-duplicate-only-ready",
  "portable-merge-stale-preview-rollback",
  "portable-merge-unmappable-graph",
  "portable-merge-insert-rollback",
  "portable-merge-replace-rollback",
  "portable-merge-verification-rollback",
  "portable-merge-commit-rollback",
  "portable-merge-deterministic-derivative-parity",
  "portable-merge-phase13-source-generation-once",
  "portable-merge-garmin-clean-restore",
  "portable-merge-garmin-exact-repeat-noop",
  "portable-merge-garmin-conflict-isolation",
  "portable-merge-garmin-remap-tombstone-match",
  "portable-merge-garmin-tamper-capacity-rollback",
] as const;

export type PortableMergeContractCaseId =
  (typeof PORTABLE_MERGE_CONTRACT_CASES)[number];

type PortableMergeContractRuntime = Readonly<{
  databaseName: string;
  kernel: SqliteKernel;
  recoveryBackup?: RecoveryBackupPort;
  close(): Promise<void>;
}>;

export type PortableMergeContractAdapter = Readonly<{
  createRuntime(
    databaseKey: string,
    observer?: SqliteKernelTestObserver,
  ): Promise<PortableMergeContractRuntime>;
  recoveryBackup: RecoveryBackupPort;
  cleanup?(): Promise<void>;
  sha256(value: string): Promise<string>;
}>;

export type PortableMergeContractCaseResult = Readonly<{
  id: PortableMergeContractCaseId;
  status: "passed" | "failed";
  durationMs: number;
  errorCode?: string;
}>;

export type PortableMergeContractResult = Readonly<{
  schemaVersion: 1;
  contractVersion: typeof PORTABLE_MERGE_CONTRACT_VERSION;
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: 0;
  cases: readonly PortableMergeContractCaseResult[];
  startedAt: string;
  finishedAt: string;
}>;

export async function createExpoPortableMergeContractAdapter(
  runId: string,
): Promise<PortableMergeContractAdapter> {
  const base = await createExpoMigrationsEffectsContractAdapter(
    `portable-merge-${runId}`,
  );
  const {
    CryptoDigestAlgorithm,
    digestStringAsync,
  } = require("expo-crypto") as typeof import("expo-crypto");
  return {
    createRuntime: base.createRuntime,
    recoveryBackup: base.recoveryBackup,
    ...(base.cleanup === undefined ? {} : { cleanup: base.cleanup }),
    sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
  };
}

function invariant(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function safeErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null
    && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 80);
  }
  if (error instanceof Error && /^[a-z0-9_:-]{3,80}$/iu.test(error.message)) {
    return error.message;
  }
  return "portable_merge_contract_failed";
}

async function migrate(
  runtime: PortableMergeContractRuntime,
  recoveryBackup: RecoveryBackupPort,
): Promise<void> {
  await createMigrationRunner({
    databaseName: runtime.databaseName,
    kernel: runtime.kernel,
    migrations,
    recoveryBackup,
  }).run();
}

async function seedBundledExercise(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO exercises (id, content_pack_id, origin, source_namespace, upstream_id, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision) VALUES ('portable-merge-bundled', NULL, 'bundled', 'catalog', 'portable-merge-bundled', 'Portable merge bundled', 'load_reps', 1, 1, 'Unspecified', 90, 1)",
    );
    await transaction.execute(
      "INSERT INTO exercise_library_entries (exercise_id, origin, canonical_name, exercise_type, movement_class, metric_profile, metric_contract_version, exercise_metric_generation, availability, revision) VALUES ('portable-merge-bundled', 'bundled', 'Portable merge bundled', 'strength', 'compound', 'load_reps', 1, 1, 'available', 1)",
    );
  });
}

async function seedCustomExercise(
  kernel: SqliteKernel,
  input: Readonly<{ id: string; portableId: string; name: string }>,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO exercises (id, content_pack_id, origin, source_namespace, upstream_id, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision, portable_id) VALUES (?, NULL, 'custom', NULL, NULL, ?, 'load_reps', 1, 1, 'Unspecified', 90, 1, ?)",
      [input.id, input.name, input.portableId],
    );
    await transaction.execute(
      "INSERT INTO exercise_library_entries (exercise_id, origin, canonical_name, exercise_type, movement_class, metric_profile, metric_contract_version, exercise_metric_generation, availability, revision) VALUES (?, 'custom', ?, 'strength', 'compound', 'load_reps', 1, 1, 'available', 1)",
      [input.id, input.name],
    );
    await transaction.execute(
      "INSERT INTO taxonomy_terms (kind, slug, display_name) VALUES ('exercise_type', 'strength', 'Strength'), ('movement_class', 'compound', 'Compound') ON CONFLICT(kind, slug) DO NOTHING",
    );
    await transaction.execute(
      "INSERT INTO exercise_taxonomy (exercise_id, kind, slug, relation, ordinal) VALUES (?, 'exercise_type', 'strength', 'type', 0), (?, 'movement_class', 'compound', 'movement', 0)",
      [input.id, input.id],
    );
    await transaction.execute(
      "INSERT INTO exercise_owner_preferences (exercise_id, favorite, hidden, archived, revision, updated_at_ms) VALUES (?, 1, 0, 0, 1, 1)",
      [input.id],
    );
    await transaction.execute(
      "INSERT INTO exercise_metric_baselines (exercise_id, metric_profile, metric_contract_version, exercise_metric_generation, status, established_at_ms) VALUES (?, 'load_reps', 1, 1, 'awaiting_comparable_observation', 1)",
      [input.id],
    );
  });
}

async function seedOwnedPlan(
  kernel: SqliteKernel,
  input: Readonly<{ id: string; portableId: string; dayId: string; name: string }>,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO plans (id, content_pack_id, origin, source_namespace, upstream_id, name, days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision, portable_id) VALUES (?, NULL, 'custom', NULL, NULL, ?, 1, 'Owner', 'Strength', 30, 'Owner', 0, 1, ?)",
      [input.id, input.name, input.portableId],
    );
    await transaction.execute(
      "INSERT INTO plan_days (id, plan_id, ordinal, name, revision) VALUES (?, ?, 0, 'Day one', 1)",
      [input.dayId, input.id],
    );
    await transaction.execute(
      "INSERT INTO owned_plan_aggregate_states (plan_id, lifecycle, graph_status, missing_requirement_code, missing_requirement, created_at_ms, updated_at_ms, archived_at_ms) VALUES (?, 'draft', 'missing_valid_target', 'owned_plan_missing_valid_target', 'Add at least one exercise with valid targets before scheduling or activating.', 1, 1, NULL)",
      [input.id],
    );
  });
}

async function seedSession(
  kernel: SqliteKernel,
  input: Readonly<{ id: string; portableId: string; modifiedAtMs: number }>,
): Promise<void> {
  await seedBundledExercise(kernel);
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO workout_sessions (id, plan_id, plan_day_id, source, status, local_date, timezone, started_at_ms, completed_at_ms, active_session_exercise_id, active_set_id, revision, portable_id, merge_modified_at_ms) VALUES (?, NULL, NULL, 'manual', 'completed', '2026-09-20', 'Asia/Singapore', 1, 2, NULL, NULL, 1, ?, ?)",
      [input.id, input.portableId, input.modifiedAtMs],
    );
    await transaction.execute(
      "INSERT INTO session_exercises (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal, origin, display_ordinal, exercise_name, metric_profile, metric_contract_version, exercise_metric_generation, advanced_timing_default_json, default_rest_seconds, target_revision, status, revision) VALUES (?, ?, NULL, 'portable-merge-bundled', 0, 'planned', 0, 'Portable merge bundled', 'load_reps', 1, 1, '{\"version\":1,\"mode\":\"off\"}', 90, 1, 'completed', 1)",
      [`exercise-${input.id}`, input.id],
    );
    await transaction.execute(
      "INSERT INTO session_sets (id, session_exercise_id, set_kind, ordinal, source_plan_working_set_target_id, source_owned_plan_working_set_target_id, advanced_timing_override_json, advanced_timing_resolved_json, target_load_grams, target_min_reps, target_max_reps, target_json, unit_json, rule_type, rule_version, metric_profile, metric_contract_version, exercise_metric_generation, status, completed_at_ms, revision) VALUES (?, ?, 'working', 0, NULL, NULL, NULL, '{\"version\":1,\"mode\":\"off\"}', 10000, 8, 10, '{}', '{}', 'load_reps', 1, 'load_reps', 1, 1, 'completed', 2, 1)",
      [`set-${input.id}`, `exercise-${input.id}`],
    );
  });
}

async function seedHistoryRows(
  kernel: SqliteKernel,
  sessionId: string,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO history_session_overlays (session_id, effective_revision, lifecycle, snapshot_json, effective_local_date, effective_timezone, effective_started_at_ms, effective_completed_at_ms, created_at_ms, updated_at_ms) VALUES (?, 3, 'voided', '{}', '2026-09-20', 'Asia/Singapore', 1, 2, 2, 3)",
      [sessionId],
    );
    await transaction.execute(
      "INSERT INTO history_audit_events (id, session_id, effective_revision, event_type, field_identity, before_json, after_json, occurred_at_ms) VALUES (?, ?, 2, 'correction', 'session', '{}', '{}', 2)",
      [`audit-${sessionId}`, sessionId],
    );
    await transaction.execute(
      "INSERT INTO history_audit_events (id, session_id, effective_revision, event_type, field_identity, before_json, after_json, occurred_at_ms) VALUES (?, ?, 3, 'void', 'session', '{}', '{}', 3)",
      [`void-${sessionId}`, sessionId],
    );
  });
}

async function seedSettings(
  kernel: SqliteKernel,
  input: Readonly<{ appearance: string; units?: string }>,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms) VALUES ('appearance', 1, ?, 1, 1)",
      [JSON.stringify(input.appearance)],
    );
    if (input.units !== undefined) {
      await transaction.execute(
        "INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms) VALUES ('units', 1, ?, 1, 1)",
        [JSON.stringify(input.units)],
      );
    }
  });
}

async function seedPhase13SourceGraph(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute("INSERT INTO imported_activities (id, source, source_activity_id, started_at_ms, aggregate_json, imported_at_ms) VALUES ('archive-import', 'garmin', 'archive-external', 1, '{}', 2)");
    await transaction.execute("INSERT INTO imported_activity_identities (activity_id, source_kind, account_namespace, external_activity_id, aggregate_revision, accepted_normalized_sha256, removal_state) VALUES ('archive-import', 'garmin_connect_account', 'portable-owner', 'archive-external', 1, ?, 'active')", ["a".repeat(64)]);
    await transaction.execute("INSERT INTO imported_activity_events (id, activity_id, aggregate_revision, event_type, payload_json, created_at_ms) VALUES ('archive-import-event', 'archive-import', 1, 'imported', '{}', 2)");
    await transaction.execute("INSERT INTO bodyweight_entries (id, owner_id, current_revision, lifecycle, created_at_ms) VALUES ('archive-weight', 'portable-owner', 1, 'active', 1)");
    await transaction.execute("INSERT INTO bodyweight_entry_events (id, entry_id, owner_id, revision, event_id, operation, local_date, timezone, grams, occurred_at_ms) VALUES ('archive-weight-event', 'archive-weight', 'portable-owner', 1, 'archive-weight-event-id', 'create', '2026-10-07', 'Asia/Singapore', 70000, 2)");
  });
}

const GARMIN_PORTABLE_SOURCE_TABLES = Object.freeze([
  "imported_activities",
  "imported_activity_payloads",
  "imported_activity_references",
  "imported_activity_laps",
  "imported_activity_chunks",
  "imported_activity_receipts",
  "imported_activity_identities",
  "imported_activity_events",
  "running_activity_match_events",
  "running_activity_match_receipts",
] as const);

const GARMIN_ACTIVITY_ID = "portable-garmin-activity";
const GARMIN_OPPORTUNITY_ID = "portable-running-opportunity";
const GARMIN_ACCEPTED_SHA256 = "a".repeat(64);

type GarminPortableSeed = Readonly<{
  accountNamespace?: string;
  acceptedSha256?: string;
  externalActivityId?: string;
  removed?: boolean;
}>;

async function seedGarminPortableGraph(
  kernel: SqliteKernel,
  options: GarminPortableSeed = {},
): Promise<void> {
  const accountNamespace = options.accountNamespace ?? "portable-account";
  const acceptedSha256 = options.acceptedSha256 ?? GARMIN_ACCEPTED_SHA256;
  const externalActivityId = options.externalActivityId ?? "4242";
  const runningPlans = createRunningPlanRepository(kernel);
  await runningPlans.createInactiveMinimum({
    planId: "portable-running-plan",
    planName: "Portable Running",
    anchorDayId: "portable-running-anchor",
    scheduleId: "portable-running-schedule",
    scheduleVersionId: "portable-running-version",
    scheduleBindingId: "portable-running-binding",
    createdAtMs: 1,
    effectiveLocalDate: "2026-10-05",
    timezone: "Asia/Singapore",
    recoveryRevisionId: "portable-running-session-v1",
    slots: [{
      id: "portable-running-slot",
      weekday: "Monday",
      ordinal: 0,
      sessionRevisionId: "portable-running-session-v1",
    }],
  });
  await runningPlans.activateMinimum({
    planId: "portable-running-plan",
    scheduleId: "portable-running-schedule",
    expectedPlanRevision: 1,
    expectedScheduleRevision: 1,
    activatedAtMs: 2,
  });
  await runningPlans.materializeOccurrences({
    planId: "portable-running-plan",
    scheduleId: "portable-running-schedule",
    scheduleVersionId: "portable-running-version",
    localDate: "2026-10-05",
    timezone: "Asia/Singapore",
    createdAtMs: 3,
    occurrenceIds: [GARMIN_OPPORTUNITY_ID],
  });

  await kernel.write(async (transaction) => {
    const aggregate = JSON.stringify({
      confirmed_local_date: "2026-10-05",
      source_kind: "garmin_connect_account",
      account_namespace: accountNamespace,
      external_activity_id: externalActivityId,
      normalization_version: 1,
      normalized_json_sha256: acceptedSha256,
      raw_component_sha256: {
        activity: "b".repeat(64),
        splits: "c".repeat(64),
        details: "d".repeat(64),
      },
      sample_fidelity: "source_summary",
    });
    await transaction.execute(
      "INSERT INTO imported_activities (id, source, source_activity_id, started_at_ms, aggregate_json, imported_at_ms) VALUES (?, ?, ?, 1, ?, 2)",
      [GARMIN_ACTIVITY_ID, `garmin_connect_account:${accountNamespace}`, externalActivityId, aggregate],
    );
    await transaction.execute(
      "INSERT INTO imported_activity_payloads (id, activity_id, payload_json, sha256) VALUES ('portable-garmin-payload', ?, ?, ?)",
      [GARMIN_ACTIVITY_ID, JSON.stringify({ version: 1, sport: "running", distance_meters: 5_000 }), acceptedSha256],
    );
    for (const [id, kind, value] of [
      ["portable-garmin-ref-activity", "raw_activity_sha256", "b".repeat(64)],
      ["portable-garmin-ref-splits", "raw_splits_sha256", "c".repeat(64)],
      ["portable-garmin-ref-details", "raw_details_sha256", "d".repeat(64)],
    ] as const) {
      await transaction.execute(
        "INSERT INTO imported_activity_references (id, activity_id, reference_kind, reference_value) VALUES (?, ?, ?, ?)",
        [id, GARMIN_ACTIVITY_ID, kind, value],
      );
    }
    await transaction.execute(
      "INSERT INTO imported_activity_laps (id, activity_id, ordinal, lap_json) VALUES ('portable-garmin-lap', ?, 0, ?)",
      [GARMIN_ACTIVITY_ID, JSON.stringify({ elapsed_ms: 1_500_000, distance_meters: 5_000 })],
    );
    await transaction.execute(
      "INSERT INTO imported_activity_chunks (id, activity_id, ordinal, chunk_json) VALUES ('portable-garmin-chunk', ?, 0, ?)",
      [GARMIN_ACTIVITY_ID, JSON.stringify({ sample_fidelity: "source_summary" })],
    );
    await transaction.execute(
      "INSERT INTO imported_activity_receipts (id, activity_id, request_sha256, committed_at_ms) VALUES ('portable-garmin-import-request', ?, ?, 4)",
      [GARMIN_ACTIVITY_ID, "e".repeat(64)],
    );
    await transaction.execute(
      "INSERT INTO imported_activity_identities (activity_id, source_kind, account_namespace, external_activity_id, aggregate_revision, accepted_normalized_sha256, removal_state) VALUES (?, 'garmin_connect_account', ?, ?, 1, ?, 'active')",
      [GARMIN_ACTIVITY_ID, accountNamespace, externalActivityId, acceptedSha256],
    );
    await transaction.execute(
      "INSERT INTO imported_activity_events (id, activity_id, aggregate_revision, event_type, payload_json, created_at_ms) VALUES ('portable-garmin-import-event', ?, 1, 'imported', ?, 4)",
      [GARMIN_ACTIVITY_ID, JSON.stringify({ accepted_normalized_sha256: acceptedSha256 })],
    );
    await transaction.execute(
      "INSERT INTO imported_activity_current_lifecycle (activity_id, aggregate_revision, removal_state, lifecycle_event_id) VALUES (?, 1, 'active', 'portable-garmin-import-event')",
      [GARMIN_ACTIVITY_ID],
    );
  });

  const matched = await createRunningActivityMatchRepository(kernel).confirm({
    requestId: "portable-garmin-match-request",
    requestSha256: "9".repeat(64),
    action: "match",
    activityId: GARMIN_ACTIVITY_ID,
    expectedActivityRevision: 1,
    expectedAcceptedPayloadSha256: acceptedSha256,
    opportunityId: GARMIN_OPPORTUNITY_ID,
    expectedOpportunityRevision: 1,
    expectedRelationRevision: 0,
    planId: "portable-running-plan",
    scheduleId: "portable-running-schedule",
    scheduleVersionId: "portable-running-version",
    expectedScheduleRevision: 2,
    planDayId: "portable-running-anchor",
    expectedPlanDayRevision: 1,
    slotId: "portable-running-slot",
    slotRevisionId: "portable-running-slot:revision:1",
    expectedSlotRevision: 1,
    sessionRevisionId: "portable-running-session-v1",
    expectedSessionRevision: 1,
    occurredAtMs: 5,
  });
  invariant(matched.kind === "matched", "portable_merge_garmin_match_seed_failed");
  if (options.removed === true) {
    const removed = await createImportedActivityRepository(kernel).changeGarminActivityLifecycle({
      requestId: "portable-garmin-remove-request",
      requestSha256: "8".repeat(64),
      operation: "remove",
      activityId: GARMIN_ACTIVITY_ID,
      expectedAggregateRevision: 1,
      reason: "owner_removed",
      occurredAtMs: 6,
    });
    invariant(removed.kind === "removed", "portable_merge_garmin_remove_seed_failed");
  }
}

function mergePlanSnapshot(
  backup: LogicalBackupSnapshot,
  owner: string,
  tables: LogicalBackupSnapshot["tables"] = backup.tables,
): PortableMergePlanSnapshot {
  return Object.freeze({
    version: 2 as const,
    schemaVersion: backup.schemaVersion,
    tables: Object.freeze({
      ...tables,
      portable_owner_identity: [{ id: 1, owner_namespace: owner }],
    }),
  });
}

function snapshotWithTables(
  backup: LogicalBackupSnapshot,
  tables: LogicalBackupSnapshot["tables"],
): LogicalBackupSnapshot {
  const rowCounts = Object.freeze(Object.fromEntries(
    Object.entries(tables).map(([table, rows]) => [table, rows.length]),
  ));
  return Object.freeze({
    ...backup,
    tables,
    manifest: Object.freeze({
      catalogReferenceCount: backup.catalogReferences.length,
      rowCounts,
      totalRows: Object.values(rowCounts).reduce((total, count) => total + count, 0),
    }),
  });
}

async function canonicalGarminPortableSource(kernel: SqliteKernel): Promise<string> {
  const backup = await snapshot(kernel, "portable-garmin-source");
  return canonicalMergeValue(Object.fromEntries(
    GARMIN_PORTABLE_SOURCE_TABLES.map((table) => [table, backup.tables[table] ?? []]),
  ));
}

async function snapshot(kernel: SqliteKernel, snapshotId: string) {
  return createLogicalBackupRepository(kernel).collect({
    createdAtMs: 1,
    snapshotId,
  });
}

async function canonicalState(kernel: SqliteKernel): Promise<string> {
  const [backup, state, schema, userVersion] = await Promise.all([
    snapshot(kernel, "portable-merge-canonical"),
    kernel.queryAll("SELECT state, updated_at_ms FROM portability_restore_state"),
    kernel.queryAll("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('trigger', 'index') ORDER BY type, name"),
    kernel.queryAll("PRAGMA user_version"),
  ]);
  return canonicalMergeValue({ backup, state, schema, userVersion });
}

type FullPlanInput = Readonly<{
  local: MergeLocalFacts;
  plan: PortableMergePlan;
}>;

async function plannedFullMerge(
  adapter: PortableMergeContractAdapter,
  archiveKernel: SqliteKernel,
  localKernel: SqliteKernel,
): Promise<FullPlanInput> {
  const [archive, local] = await Promise.all([
    snapshot(archiveKernel, "portable-merge-archive"),
    createSqliteMergeLocalFactsPort(localKernel).read(),
  ]);
  const archiveForPlan: PortableMergePlanSnapshot = {
    version: 2,
    schemaVersion: archive.schemaVersion,
    tables: {
      ...archive.tables,
      portable_owner_identity: [{ id: 1, owner_namespace: local.ownerNamespace }],
    },
  };
  const localForPlan: PortableMergePlanSnapshot = {
    version: 2,
    schemaVersion: local.schemaVersion,
    tables: {
      ...local.tables,
      portable_owner_identity: [{ id: 1, owner_namespace: local.ownerNamespace }],
    },
  };
  return {
    local,
    plan: await buildPortableMergePlan({
      archive: archiveForPlan,
      local: localForPlan,
      payloadDigest: adapter.sha256,
    }),
  };
}

async function commitFullPlan(
  adapter: PortableMergeContractAdapter,
  kernel: SqliteKernel,
  input: FullPlanInput,
  options: Readonly<{
    faultAfter?: (stage: LogicalMergeFaultStage) => Promise<void>;
    omitNowMs?: boolean;
  }> = {},
): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>> {
  return createFullPlanLogicalMergeWriter(kernel, {
    ...(options.omitNowMs === true ? {} : { nowMs: () => 99 }),
    sha256: adapter.sha256,
    ...(options.faultAfter === undefined ? {} : { faultAfter: options.faultAfter }),
  }).commitFullPlan({
    localFingerprint: await adapter.sha256(canonicalMergeValue(input.local)),
    plan: input.plan,
  });
}

function reconciliation(kernel: SqliteKernel) {
  return createRestoreReconciliationRepository(kernel, {
    history: createHistoryProjectionRepository(kernel),
    nowMs: () => 100,
    search: createExerciseSearchIndexRepository(kernel),
  });
}

async function derivativeState(kernel: SqliteKernel): Promise<string> {
  return canonicalMergeValue({
    history: await createHistoryProjectionRepository(kernel).dumpProjectionRows(),
    search: await createExerciseSearchIndexRepository(kernel).verifyParity(),
    restore: await kernel.queryAll(
      "SELECT state, updated_at_ms FROM portability_restore_state WHERE id = 1",
    ),
  });
}

async function seedMixedSourceFacts(
  archiveKernel: SqliteKernel,
  localKernel: SqliteKernel,
): Promise<void> {
  await seedSession(archiveKernel, {
    id: "archive-session", portableId: "a".repeat(32), modifiedAtMs: 20,
  });
  await seedCustomExercise(archiveKernel, {
    id: "archive-exercise", portableId: "b".repeat(32), name: "Same custom name",
  });
  await seedOwnedPlan(archiveKernel, {
    id: "archive-plan", portableId: "c".repeat(32), dayId: "archive-day", name: "Same plan name",
  });
  await seedSettings(archiveKernel, { appearance: "dark", units: "metric" });
  await seedPhase13SourceGraph(archiveKernel);

  await seedSession(localKernel, {
    id: "local-session", portableId: "a".repeat(32), modifiedAtMs: 10,
  });
  await seedCustomExercise(localKernel, {
    id: "local-exercise", portableId: "d".repeat(32), name: "Same custom name",
  });
  await seedOwnedPlan(localKernel, {
    id: "local-plan", portableId: "e".repeat(32), dayId: "local-day", name: "Same plan name",
  });
  await seedSettings(localKernel, { appearance: "light" });
}

async function withRuntimes(
  adapter: PortableMergeContractAdapter,
  caseId: PortableMergeContractCaseId,
  action: (archive: PortableMergeContractRuntime, local: PortableMergeContractRuntime) => Promise<void>,
  observers: Readonly<{ local?: SqliteKernelTestObserver }> = {},
): Promise<void> {
  const archive = await adapter.createRuntime(`${caseId}-archive`);
  const local = await adapter.createRuntime(`${caseId}-local`, observers.local);
  try {
    await migrate(archive, archive.recoveryBackup ?? adapter.recoveryBackup);
    await migrate(local, local.recoveryBackup ?? adapter.recoveryBackup);
    await action(archive, local);
  } finally {
    await Promise.all([archive.close(), local.close()]);
  }
}

type ContractCase = (
  adapter: PortableMergeContractAdapter,
  caseId: PortableMergeContractCaseId,
) => Promise<void>;

const contractCases: Record<PortableMergeContractCaseId, ContractCase> = {
  async "portable-merge-mixed-full-plan-success"(adapter, caseId) {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedMixedSourceFacts(archive.kernel, local.kernel);
      const input = await plannedFullMerge(adapter, archive.kernel, local.kernel);
      const result = await commitFullPlan(adapter, local.kernel, input);
      invariant(result.state === "rebuild_pending", "portable_merge_pending_missing");
      invariant(input.plan.preview.archiveWon === 1
        && input.plan.preview.localWon === 1
        && input.plan.preview.inserted === 4, "portable_merge_mixed_preview_invalid");
      const [session, settings, exercises, plans] = await Promise.all([
        local.kernel.queryAll<{ id: string; merge_modified_at_ms: number }>(
          "SELECT id, merge_modified_at_ms FROM workout_sessions",
        ),
        local.kernel.queryAll<{ key: string; value_json: string }>(
          "SELECT key, value_json FROM app_settings ORDER BY key",
        ),
        local.kernel.queryAll<{ id: string }>(
          "SELECT id FROM exercises WHERE origin = 'custom' ORDER BY id",
        ),
        local.kernel.queryAll<{ id: string }>(
          "SELECT id FROM plans WHERE origin = 'custom' ORDER BY id",
        ),
      ]);
      invariant(session.length === 1 && session[0]?.id === "local-session"
        && session[0]?.merge_modified_at_ms === 20, "portable_merge_mixed_session_missing");
      invariant(canonicalMergeValue(settings) === canonicalMergeValue([
        { key: "appearance", value_json: '"light"' },
        { key: "units", value_json: '"metric"' },
      ]), "portable_merge_settings_policy_invalid");
      invariant(canonicalMergeValue(exercises) === canonicalMergeValue([
        { id: "archive-exercise" },
        { id: "local-exercise" },
      ]), "portable_merge_custom_keep_both_missing");
      invariant(canonicalMergeValue(plans) === canonicalMergeValue([
        { id: "archive-plan" },
        { id: "local-plan" },
      ]), "portable_merge_plan_keep_both_missing");
      const [imported, weightEvents] = await Promise.all([
        local.kernel.queryAll<{ id: string }>("SELECT id FROM imported_activities"),
        local.kernel.queryAll<{ entry_id: string }>("SELECT entry_id FROM bodyweight_entry_events"),
      ]);
      invariant(imported.length === 1 && imported[0]?.id === "archive-import"
        && weightEvents.length === 1 && weightEvents[0]?.entry_id === "archive-weight",
      "portable_merge_phase13_source_graph_missing");
    });
  },

  async "portable-merge-same-name-keep-both"(adapter, caseId) {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedCustomExercise(archive.kernel, {
        id: "shared-exercise", portableId: "b".repeat(32), name: "Same name",
      });
      await seedOwnedPlan(archive.kernel, {
        id: "shared-plan", portableId: "c".repeat(32), dayId: "archive-day", name: "Same name",
      });
      await seedSettings(archive.kernel, { appearance: "dark" });
      await seedCustomExercise(local.kernel, {
        id: "shared-exercise", portableId: "d".repeat(32), name: "Same name",
      });
      await seedOwnedPlan(local.kernel, {
        id: "shared-plan", portableId: "e".repeat(32), dayId: "local-day", name: "Same name",
      });
      const input = await plannedFullMerge(adapter, archive.kernel, local.kernel);
      invariant(input.plan.preview.keptBoth === 2 && input.plan.preview.remapped === 2,
        "portable_merge_keep_both_preview_invalid");
      await commitFullPlan(adapter, local.kernel, input);
      const [exercises, plans] = await Promise.all([
        local.kernel.queryAll<{ id: string; portable_id: string }>(
          "SELECT id, portable_id FROM exercises WHERE origin = 'custom' ORDER BY portable_id",
        ),
        local.kernel.queryAll<{ id: string; portable_id: string }>(
          "SELECT id, portable_id FROM plans WHERE origin = 'custom' ORDER BY portable_id",
        ),
      ]);
      invariant(exercises.length === 2 && exercises.some((row) => row.id === "shared-exercise"
        && row.portable_id === "d".repeat(32))
        && exercises.some((row) => row.id === `merge_exercise_${"b".repeat(32)}`
          && row.portable_id === "b".repeat(32)), "portable_merge_exercise_collision_not_remapped");
      invariant(plans.length === 2 && plans.some((row) => row.id === "shared-plan"
        && row.portable_id === "e".repeat(32))
        && plans.some((row) => row.id === `merge_plan_${"c".repeat(32)}`
          && row.portable_id === "c".repeat(32)), "portable_merge_plan_collision_not_remapped");
    });
  },

  async "portable-merge-same-identity-dedup-remap"(adapter, caseId) {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedCustomExercise(archive.kernel, {
        id: "archive-exercise", portableId: "b".repeat(32), name: "Archive duplicate",
      });
      await seedOwnedPlan(archive.kernel, {
        id: "archive-plan", portableId: "c".repeat(32), dayId: "archive-day", name: "Archive duplicate",
      });
      await seedSettings(archive.kernel, { appearance: "dark", units: "metric" });
      await seedCustomExercise(local.kernel, {
        id: "local-exercise", portableId: "b".repeat(32), name: "Local duplicate",
      });
      await seedOwnedPlan(local.kernel, {
        id: "local-plan", portableId: "c".repeat(32), dayId: "local-day", name: "Local duplicate",
      });
      const input = await plannedFullMerge(adapter, archive.kernel, local.kernel);
      invariant(input.plan.preview.duplicates === 2 && input.plan.idRemaps.length === 0,
        "portable_merge_identity_dedup_preview_invalid");
      invariant(input.plan.idMappings.some((mapping) => mapping.recordClass === "custom_exercise"
        && mapping.archiveId === "archive-exercise" && mapping.localId === "local-exercise")
        && input.plan.idMappings.some((mapping) => mapping.recordClass === "owned_plan"
          && mapping.archiveId === "archive-plan" && mapping.localId === "local-plan"),
      "portable_merge_identity_mapping_invalid");
      await commitFullPlan(adapter, local.kernel, input);
      const [exercises, plans] = await Promise.all([
        local.kernel.queryAll<{ id: string }>("SELECT id FROM exercises WHERE origin = 'custom'"),
        local.kernel.queryAll<{ id: string }>("SELECT id FROM plans WHERE origin = 'custom'"),
      ]);
      invariant(exercises.length === 1 && exercises[0]?.id === "local-exercise"
        && plans.length === 1 && plans[0]?.id === "local-plan",
      "portable_merge_identity_dedup_mutated_local");
    });
  },

  async "portable-merge-session-history-newest-wins"(adapter, caseId) {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedSession(archive.kernel, {
        id: "archive-session", portableId: "a".repeat(32), modifiedAtMs: 20,
      });
      await seedHistoryRows(archive.kernel, "archive-session");
      await seedSession(local.kernel, {
        id: "local-session", portableId: "a".repeat(32), modifiedAtMs: 10,
      });
      const input = await plannedFullMerge(adapter, archive.kernel, local.kernel);
      invariant(input.plan.preview.archiveWon === 1, "portable_merge_session_winner_invalid");
      await commitFullPlan(adapter, local.kernel, input);
      const [overlay, audit] = await Promise.all([
        local.kernel.queryAll<{ session_id: string; effective_revision: number; lifecycle: string }>(
          "SELECT session_id, effective_revision, lifecycle FROM history_session_overlays",
        ),
        local.kernel.queryAll<{ session_id: string; event_type: string }>(
          "SELECT session_id, event_type FROM history_audit_events ORDER BY event_type",
        ),
      ]);
      invariant(overlay[0]?.session_id === "local-session"
        && overlay[0]?.effective_revision === 3
        && overlay[0]?.lifecycle === "voided"
        && canonicalMergeValue(audit) === canonicalMergeValue([
          { session_id: "local-session", event_type: "correction" },
          { session_id: "local-session", event_type: "void" },
        ]), "portable_merge_session_history_missing");
    });
  },

  async "portable-merge-settings-existing-wins"(adapter, caseId) {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedSettings(archive.kernel, { appearance: "dark", units: "metric" });
      await seedSettings(local.kernel, { appearance: "light" });
      const input = await plannedFullMerge(adapter, archive.kernel, local.kernel);
      invariant(input.plan.preview.localWon === 1 && input.plan.preview.inserted === 1,
        "portable_merge_settings_preview_invalid");
      await commitFullPlan(adapter, local.kernel, input);
      const settings = await local.kernel.queryAll<{ key: string; value_json: string }>(
        "SELECT key, value_json FROM app_settings ORDER BY key",
      );
      invariant(canonicalMergeValue(settings) === canonicalMergeValue([
        { key: "appearance", value_json: '"light"' },
        { key: "units", value_json: '"metric"' },
      ]), "portable_merge_settings_existing_winner_missing");
    });
  },

  async "portable-merge-duplicate-only-ready"(adapter, caseId) {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedSession(archive.kernel, {
        id: "same-session", portableId: "a".repeat(32), modifiedAtMs: 20,
      });
      await seedSession(local.kernel, {
        id: "same-session", portableId: "a".repeat(32), modifiedAtMs: 20,
      });
      const input = await plannedFullMerge(adapter, archive.kernel, local.kernel);
      invariant(input.plan.settings.length === 0 && input.plan.aggregates.length === 0
        && input.plan.preview.duplicates === 1, "portable_merge_duplicate_only_plan_invalid");
      const before = await canonicalState(local.kernel);
      const result = await commitFullPlan(adapter, local.kernel, input);
      invariant(result.state === "ready", "portable_merge_duplicate_only_not_ready");
      invariant(await canonicalState(local.kernel) === before,
        "portable_merge_duplicate_only_changed_source");
    });
  },

  async "portable-merge-stale-preview-rollback"(adapter, caseId) {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedMixedSourceFacts(archive.kernel, local.kernel);
      const input = await plannedFullMerge(adapter, archive.kernel, local.kernel);
      await local.kernel.write((transaction) => transaction.execute(
        "UPDATE app_settings SET revision = revision + 1 WHERE key = 'appearance'",
      ));
      const before = await canonicalState(local.kernel);
      let rejected = false;
      try {
        await commitFullPlan(adapter, local.kernel, input);
      } catch {
        rejected = true;
      }
      invariant(rejected, "portable_merge_stale_preview_not_rejected");
      invariant(await canonicalState(local.kernel) === before,
        "portable_merge_stale_preview_changed_source");
    });
  },

  async "portable-merge-unmappable-graph"(adapter, caseId) {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedSession(archive.kernel, {
        id: "archive-session", portableId: "a".repeat(32), modifiedAtMs: 20,
      });
      const [archiveSnapshot, localFacts] = await Promise.all([
        snapshot(archive.kernel, "portable-merge-unmappable"),
        createSqliteMergeLocalFactsPort(local.kernel).read(),
      ]);
      const before = await canonicalState(local.kernel);
      let rejected = false;
      try {
        await buildPortableMergePlan({
          archive: {
            version: 2,
            schemaVersion: archiveSnapshot.schemaVersion,
            tables: {
              ...archiveSnapshot.tables,
              portable_owner_identity: [{ id: 1, owner_namespace: localFacts.ownerNamespace }],
              session_sets: archiveSnapshot.tables.session_sets!.map((row) => ({
                ...row, session_exercise_id: "missing-session-exercise",
              })),
            },
          },
          local: {
            version: 2,
            schemaVersion: localFacts.schemaVersion,
            tables: {
              ...localFacts.tables,
              portable_owner_identity: [{ id: 1, owner_namespace: localFacts.ownerNamespace }],
            },
          },
          payloadDigest: adapter.sha256,
        });
      } catch {
        rejected = true;
      }
      invariant(rejected, "portable_merge_unmappable_graph_not_rejected");
      invariant(await canonicalState(local.kernel) === before,
        "portable_merge_unmappable_graph_changed_source");
    });
  },

  async "portable-merge-insert-rollback"(adapter, caseId) {
    await assertRollback(adapter, caseId, "full_plan_insert:exercises");
  },

  async "portable-merge-replace-rollback"(adapter, caseId) {
    await assertRollback(adapter, caseId, "delete:workout_sessions");
  },

  async "portable-merge-verification-rollback"(adapter, caseId) {
    await assertRollback(adapter, caseId, "verified");
  },

  async "portable-merge-commit-rollback"(adapter, caseId) {
    let failCommit = false;
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedMixedSourceFacts(archive.kernel, local.kernel);
      const input = await plannedFullMerge(adapter, archive.kernel, local.kernel);
      const before = await canonicalState(local.kernel);
      failCommit = true;
      let rejected = false;
      try {
        await commitFullPlan(adapter, local.kernel, input);
      } catch {
        rejected = true;
      } finally {
        failCommit = false;
      }
      invariant(rejected, "portable_merge_commit_fault_not_observed");
      invariant(await canonicalState(local.kernel) === before,
        "portable_merge_commit_rollback_changed_source");
    }, {
      local: {
        beforeCommit: async () => {
          if (failCommit) throw new Error("portable_merge_injected_commit_fault");
        },
      },
    });
  },

  async "portable-merge-deterministic-derivative-parity"(adapter, caseId) {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedMixedSourceFacts(archive.kernel, local.kernel);
      const input = await plannedFullMerge(adapter, archive.kernel, local.kernel);
      await commitFullPlan(adapter, local.kernel, input);
      const repository = reconciliation(local.kernel);
      const firstResult = await repository.reconcileAndRebuild();
      const first = await derivativeState(local.kernel);
      const secondResult = await repository.reconcileAndRebuild();
      const second = await derivativeState(local.kernel);
      invariant(firstResult.outcome === "rebuilt" && firstResult.state === "ready"
        && secondResult.outcome === "already_ready" && secondResult.state === "ready",
      "portable_merge_derivative_rebuild_state_invalid");
      invariant(first === second, "portable_merge_derivative_parity_changed");
    });
  },

  async "portable-merge-phase13-source-generation-once"(adapter, caseId) {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedPhase13SourceGraph(archive.kernel);
      const input = await plannedFullMerge(adapter, archive.kernel, local.kernel);
      const [before] = await local.kernel.queryAll<{ mutation_generation: number }>(
        "SELECT mutation_generation FROM automatic_backup_state WHERE id = 1",
      );
      await commitFullPlan(adapter, local.kernel, input, { omitNowMs: true });
      const [after] = await local.kernel.queryAll<{ mutation_generation: number }>(
        "SELECT mutation_generation FROM automatic_backup_state WHERE id = 1",
      );
      invariant(after?.mutation_generation === (before?.mutation_generation ?? -1) + 1,
        "portable_merge_phase13_source_generation_not_once");
    });
  },

  async "portable-merge-garmin-clean-restore"(adapter, caseId) {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedGarminPortableGraph(archive.kernel);
      const archivedSource = await canonicalGarminPortableSource(archive.kernel);
      const archivedSnapshot = await snapshot(archive.kernel, "portable-garmin-clean-restore");
      const archiveJson = JSON.stringify(archivedSnapshot);
      invariant(!/(garmin-di-session|connection_generation|sync_cursor|native_raw_json|garmin_evidence)/iu.test(archiveJson),
        "portable_merge_garmin_authorization_became_portable");

      const input = await plannedFullMerge(adapter, archive.kernel, local.kernel);
      const result = await commitFullPlan(adapter, local.kernel, input);
      invariant(result.state === "rebuild_pending", "portable_merge_garmin_rebuild_not_pending");
      invariant(await canonicalGarminPortableSource(local.kernel) === archivedSource,
        "portable_merge_garmin_source_round_trip_changed");
      const currentBefore = await local.kernel.queryAll(
        "SELECT activity_id FROM running_activity_current_matches",
      );
      invariant(currentBefore.length === 0, "portable_merge_garmin_projection_was_imported");

      const [identity] = await local.kernel.queryAll<{
        source_kind: string;
        account_namespace: string;
        external_activity_id: string;
        aggregate_revision: number;
        accepted_normalized_sha256: string;
        removal_state: string;
      }>(`SELECT source_kind, account_namespace, external_activity_id,
                 aggregate_revision, accepted_normalized_sha256, removal_state
            FROM imported_activity_identities WHERE activity_id = ?`, [GARMIN_ACTIVITY_ID]);
      invariant(identity?.source_kind === "garmin_connect_account"
        && identity.account_namespace === "portable-account"
        && identity.external_activity_id === "4242"
        && identity.aggregate_revision === 1
        && identity.accepted_normalized_sha256 === GARMIN_ACCEPTED_SHA256
        && identity.removal_state === "active",
      "portable_merge_garmin_identity_changed");

      const rebuilt = await reconciliation(local.kernel).reconcileAndRebuild();
      invariant(rebuilt.outcome === "rebuilt" && rebuilt.state === "ready",
        "portable_merge_garmin_projection_rebuild_failed");
      const currentAfter = await local.kernel.queryAll<{
        activity_id: string;
        opportunity_id: string;
        relation_revision: number;
      }>("SELECT activity_id, opportunity_id, relation_revision FROM running_activity_current_matches");
      invariant(currentAfter.length === 1
        && currentAfter[0]?.activity_id === GARMIN_ACTIVITY_ID
        && currentAfter[0]?.opportunity_id === GARMIN_OPPORTUNITY_ID
        && currentAfter[0]?.relation_revision === 1,
      "portable_merge_garmin_projection_rebuild_changed_match");
      invariant(await canonicalGarminPortableSource(local.kernel) === archivedSource,
        "portable_merge_garmin_rebuild_changed_source");
    });
  },

  async "portable-merge-garmin-exact-repeat-noop"(adapter, caseId) {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedGarminPortableGraph(archive.kernel);
      const first = await plannedFullMerge(adapter, archive.kernel, local.kernel);
      await commitFullPlan(adapter, local.kernel, first);
      await reconciliation(local.kernel).reconcileAndRebuild();
      const before = await canonicalState(local.kernel);
      const [generationBefore] = await local.kernel.queryAll<{ mutation_generation: number }>(
        "SELECT mutation_generation FROM automatic_backup_state WHERE id = 1",
      );

      const replay = await plannedFullMerge(adapter, archive.kernel, local.kernel);
      const sourceOperation = replay.plan.operations.find(
        (operation) => operation.aggregateClass === "source_graph",
      );
      invariant(sourceOperation?.kind === "duplicate"
        && replay.plan.aggregates.length === 0
        && replay.plan.preview.conflicts === 0,
      "portable_merge_garmin_repeat_not_noop");
      const replayResult = await commitFullPlan(adapter, local.kernel, replay);
      const [generationAfter] = await local.kernel.queryAll<{ mutation_generation: number }>(
        "SELECT mutation_generation FROM automatic_backup_state WHERE id = 1",
      );
      invariant(replayResult.state === "ready"
        && generationAfter?.mutation_generation === generationBefore?.mutation_generation
        && await canonicalState(local.kernel) === before,
      "portable_merge_garmin_repeat_changed_local");
    });
  },

  async "portable-merge-garmin-conflict-isolation"(adapter, caseId) {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedGarminPortableGraph(archive.kernel);
      const first = await plannedFullMerge(adapter, archive.kernel, local.kernel);
      await commitFullPlan(adapter, local.kernel, first);
      await reconciliation(local.kernel).reconcileAndRebuild();
      const before = await canonicalState(local.kernel);
      const [archiveBackup, localFacts] = await Promise.all([
        snapshot(archive.kernel, "portable-garmin-changed-revision"),
        createSqliteMergeLocalFactsPort(local.kernel).read(),
      ]);
      const changedDigest = "7".repeat(64);
      const changedTables = Object.freeze({
        ...archiveBackup.tables,
        imported_activities: archiveBackup.tables.imported_activities!.map((row) => ({
          ...row,
          aggregate_json: JSON.stringify({
            ...(JSON.parse(String(row.aggregate_json)) as Record<string, unknown>),
            normalized_json_sha256: changedDigest,
          }),
        })),
        imported_activity_payloads: archiveBackup.tables.imported_activity_payloads!.map((row) => ({
          ...row,
          sha256: changedDigest,
        })),
        imported_activity_identities: archiveBackup.tables.imported_activity_identities!.map((row) => ({
          ...row,
          accepted_normalized_sha256: changedDigest,
        })),
      });
      const conflictPlan = await buildPortableMergePlan({
        archive: mergePlanSnapshot(archiveBackup, localFacts.ownerNamespace, changedTables),
        local: mergePlanSnapshot({
          ...archiveBackup,
          schemaVersion: localFacts.schemaVersion,
          tables: localFacts.tables,
        }, localFacts.ownerNamespace, localFacts.tables),
        payloadDigest: adapter.sha256,
      });
      const sourceConflict = conflictPlan.operations.find(
        (operation) => operation.aggregateClass === "source_graph",
      );
      invariant(sourceConflict?.kind === "conflict"
        && conflictPlan.preview.conflicts === 1
        && !conflictPlan.aggregates.some(({ aggregateClass }) => aggregateClass === "source_graph"),
      "portable_merge_garmin_changed_revision_not_previewed");
      let conflictRejected = false;
      try {
        await createFullPlanLogicalMergeWriter(local.kernel, {
          nowMs: () => 99,
          sha256: adapter.sha256,
        }).commitFullPlan({
          localFingerprint: await adapter.sha256(canonicalMergeValue(localFacts)),
          plan: conflictPlan,
        });
      } catch {
        conflictRejected = true;
      }
      invariant(conflictRejected && await canonicalState(local.kernel) === before,
        "portable_merge_garmin_conflict_mutated_local");

      const foreignBackup = await snapshot(archive.kernel, "portable-garmin-foreign-owner");
      let foreignOwnerRejected = false;
      try {
        await buildPortableMergePlan({
          archive: mergePlanSnapshot(foreignBackup, foreignBackup.tables.portable_owner_identity![0]!.owner_namespace as string),
          local: mergePlanSnapshot({
            ...foreignBackup,
            schemaVersion: localFacts.schemaVersion,
            tables: localFacts.tables,
          }, localFacts.ownerNamespace, localFacts.tables),
          payloadDigest: adapter.sha256,
        });
      } catch {
        foreignOwnerRejected = true;
      }
      invariant(foreignOwnerRejected && await canonicalState(local.kernel) === before,
        "portable_merge_garmin_foreign_owner_not_isolated");
    });
  },

  async "portable-merge-garmin-remap-tombstone-match"(adapter, caseId) {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedGarminPortableGraph(local.kernel, { accountNamespace: "local-account" });
      await seedGarminPortableGraph(archive.kernel, {
        accountNamespace: "portable-account",
        removed: true,
      });
      const input = await plannedFullMerge(adapter, archive.kernel, local.kernel);
      invariant(input.plan.preview.keptBoth >= 1
        && input.plan.preview.remapped >= 1
        && input.plan.preview.conflicts === 0,
      "portable_merge_garmin_remap_preview_invalid");
      await commitFullPlan(adapter, local.kernel, input);
      const rebuilt = await reconciliation(local.kernel).reconcileAndRebuild();
      invariant(rebuilt.outcome === "rebuilt" && rebuilt.state === "ready",
        "portable_merge_garmin_remap_rebuild_failed");

      const identities = await local.kernel.queryAll<{
        activity_id: string;
        account_namespace: string;
        external_activity_id: string;
        accepted_normalized_sha256: string;
      }>(`SELECT activity_id, account_namespace, external_activity_id,
                 accepted_normalized_sha256
            FROM imported_activity_identities ORDER BY account_namespace`);
      invariant(identities.length === 2
        && identities.every((row) => row.external_activity_id === "4242"
          && row.accepted_normalized_sha256 === GARMIN_ACCEPTED_SHA256)
        && identities[0]?.account_namespace === "local-account"
        && identities[1]?.account_namespace === "portable-account"
        && identities[1]?.activity_id !== GARMIN_ACTIVITY_ID,
      "portable_merge_garmin_account_identity_coalesced");
      const portableActivityId = identities[1]!.activity_id;
      const portableEvents = await local.kernel.queryAll<{
        action: string;
        activity_revision: number;
        opportunity_id: string;
        relation_revision: number;
      }>(`SELECT action, activity_revision, opportunity_id, relation_revision
            FROM running_activity_match_events WHERE activity_id = ?
           ORDER BY relation_revision`, [portableActivityId]);
      invariant(canonicalMergeValue(portableEvents.map(({ action, activity_revision, relation_revision }) => ({
        action,
        activity_revision,
        relation_revision,
      }))) === canonicalMergeValue([
        { action: "matched", activity_revision: 1, relation_revision: 1 },
        { action: "invalidated", activity_revision: 1, relation_revision: 2 },
      ])
        && portableEvents.every(({ opportunity_id }) => opportunity_id !== GARMIN_OPPORTUNITY_ID),
      "portable_merge_garmin_pinned_match_changed");
      const [removal] = await local.kernel.queryAll<{ activity_id: string }>(
        "SELECT activity_id FROM imported_activity_removal_events WHERE activity_id = ?",
        [portableActivityId],
      );
      const current = await local.kernel.queryAll<{ account_namespace: string }>(
        `SELECT identity.account_namespace FROM running_activity_current_matches current
         JOIN imported_activity_identities identity ON identity.activity_id = current.activity_id`,
      );
      invariant(removal?.activity_id === portableActivityId
        && current.length === 1
        && current[0]?.account_namespace === "local-account",
      "portable_merge_garmin_tombstone_or_projection_invalid");
    });
  },

  async "portable-merge-garmin-tamper-capacity-rollback"(adapter, caseId) {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedGarminPortableGraph(archive.kernel);
      const [archiveBackup, localFacts] = await Promise.all([
        snapshot(archive.kernel, "portable-garmin-adversarial"),
        createSqliteMergeLocalFactsPort(local.kernel).read(),
      ]);
      const before = await canonicalState(local.kernel);
      const danglingTables = Object.freeze({
        ...archiveBackup.tables,
        running_activity_match_events: archiveBackup.tables.running_activity_match_events!.map((row) => ({
          ...row,
          opportunity_id: "dangling-opportunity",
        })),
      });
      let danglingRejected = false;
      try {
        await buildPortableMergePlan({
          archive: mergePlanSnapshot(archiveBackup, localFacts.ownerNamespace, danglingTables),
          local: mergePlanSnapshot({
            ...archiveBackup,
            schemaVersion: localFacts.schemaVersion,
            tables: localFacts.tables,
          }, localFacts.ownerNamespace, localFacts.tables),
          payloadDigest: adapter.sha256,
        });
      } catch {
        danglingRejected = true;
      }
      invariant(danglingRejected, "portable_merge_garmin_dangling_match_not_rejected");

      const overflowEvents = Object.freeze(Array.from(
        { length: BACKUP_LIMITS.maxRowsPerTable + 1 },
        (_, index) => Object.freeze({
          id: `overflow-event-${index}`,
          activity_id: GARMIN_ACTIVITY_ID,
          aggregate_revision: 1,
          event_type: "imported",
          payload_json: "{}",
          created_at_ms: index,
        }),
      ));
      const overflow = snapshotWithTables(archiveBackup, Object.freeze({
        ...archiveBackup.tables,
        imported_activity_events: overflowEvents,
      }));
      let capacityRejected = false;
      try {
        parseLogicalBackupSnapshot(overflow);
      } catch (error) {
        capacityRejected = typeof error === "object" && error !== null
          && "code" in error && error.code === "backup_snapshot_limit_exceeded";
      }
      invariant(capacityRejected && await canonicalState(local.kernel) === before,
        "portable_merge_garmin_adversarial_input_mutated_local");
    });
  },
};

async function assertRollback(
  adapter: PortableMergeContractAdapter,
  caseId: PortableMergeContractCaseId,
  faultStage: LogicalMergeFaultStage,
): Promise<void> {
  await withRuntimes(adapter, caseId, async (archive, local) => {
    await seedMixedSourceFacts(archive.kernel, local.kernel);
    const input = await plannedFullMerge(adapter, archive.kernel, local.kernel);
    const before = await canonicalState(local.kernel);
    let rejected = false;
    try {
      await commitFullPlan(adapter, local.kernel, input, {
        faultAfter: async (stage) => {
          if (stage === faultStage) throw new Error("portable_merge_injected_fault");
        },
      });
    } catch {
      rejected = true;
    }
    invariant(rejected, "portable_merge_fault_not_observed");
    invariant(await canonicalState(local.kernel) === before,
      "portable_merge_rollback_changed_source");
  });
}

export async function runPortableMergeContract(
  adapter: PortableMergeContractAdapter,
): Promise<PortableMergeContractResult> {
  const startedAt = new Date().toISOString();
  const cases: PortableMergeContractCaseResult[] = [];
  try {
    for (const id of PORTABLE_MERGE_CONTRACT_CASES) {
      const started = Date.now();
      try {
        await contractCases[id](adapter, id);
        cases.push({ id, status: "passed", durationMs: Date.now() - started });
      } catch (error) {
        cases.push({
          id,
          status: "failed",
          durationMs: Date.now() - started,
          errorCode: safeErrorCode(error),
        });
      }
    }
  } finally {
    await adapter.cleanup?.().catch(() => undefined);
  }
  const failed = cases.filter((item) => item.status === "failed").length;
  return {
    schemaVersion: 1,
    contractVersion: PORTABLE_MERGE_CONTRACT_VERSION,
    status: failed === 0 ? "passed" : "failed",
    total: cases.length,
    passed: cases.length - failed,
    failed,
    skipped: 0,
    cases,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
