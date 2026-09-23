import {
  canonicalMergeValue,
  type MergeLocalFacts,
} from "../../domains/portability/mergeCommands";
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
  }> = {},
): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>> {
  return createFullPlanLogicalMergeWriter(kernel, {
    nowMs: () => 99,
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
        && input.plan.preview.inserted === 3, "portable_merge_mixed_preview_invalid");
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
