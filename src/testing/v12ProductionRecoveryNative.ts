import fullBodyFoundationAsset from "../../assets/content/full-body-foundation.v1.json";
import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { deleteDatabaseAsync } from "expo-sqlite";

import { normalizeGarminActivity } from "../platform/garmin/normalizeGarminActivity";
import {
  createGarminSharedImportCommitter,
  createGarminSyncCoordinator,
} from "../platform/garmin/garminSyncCoordinator";
import { createImportedActivityRepository } from "../platform/sqlite/repositories/importedActivityRepository";
import { createRunningActivityMatchRepository } from "../platform/sqlite/repositories/runningActivityMatchRepository";
import { createRunningPlanRepository } from "../platform/sqlite/repositories/runningPlanRepository";
import {
  confirmRunningActivityMatch,
  prepareRunningActivityMatchInput,
  queryRunningActivityMatchCandidates,
} from "../domains/running/activityMatchCommands";
import { parseFullBodyFoundation } from "../domains/content";
import { activateStarterPlan } from "../domains/plans";
import { createCustomExercise } from "../domains/library/customExerciseCommands";
import { completeSet, updateActiveSetDraft } from "../domains/workout/setCommands";
import { startWorkout } from "../domains/workout/startWorkout";
import {
  finishPartial,
  PARTIAL_CONFIRMATION,
} from "../domains/workout/finishWorkout";
import { expireRestWithForegroundFeedback, pauseRest, startManualRest } from "../domains/rest/restCommands";
import {
  createBackupCommands,
} from "../domains/portability/backupCommands";
import {
  createBackupEnvelopeCodec,
  type BackupEnvelopeCryptoPort,
} from "../domains/portability/backupFormat";
import {
  logicalBackupTablesForVersion,
  type LogicalBackupSnapshot,
} from "../domains/portability/backupContracts";
import {
  createRestoreCommands,
  createRestorePreflightStore,
} from "../domains/portability/restoreCommands";
import {
  createMergeCommands,
  createMergePreflightStore,
} from "../domains/portability/mergeCommands";
import { createLogicalBackupRepository } from "../platform/sqlite/repositories/logicalBackupRepository";
import { createLogicalRestoreRepository } from "../platform/sqlite/repositories/logicalRestoreRepository";
import { createFullPlanLogicalMergeWriter } from "../platform/sqlite/repositories/logicalMergeRepository";
import {
  createSqliteMergeLocalFactsPort,
  createSqliteRestoreCandidateProbe,
  createSqliteRestoreRetainedReferencePort,
  createSqliteRestoreSchemaPort,
} from "../platform/sqlite/repositories/restorePreflightAdapters";
import { createPlansWorkoutRepository } from "../platform/sqlite/repositories/plansWorkoutRepository";
import { createWorkoutOutcomeRepository } from "../platform/sqlite/repositories/workoutOutcomeRepository";
import { createWorkoutRepository } from "../platform/sqlite/repositories/workoutRepository";
import { createCustomExerciseRepository } from "../platform/sqlite/repositories/customExerciseRepository";
import { createRestRepository } from "../platform/sqlite/repositories/restRepository";
import { createEffectRunner } from "../platform/sqlite/effects/effectRunner";
import { createEffectStore, enqueuePendingEffect } from "../platform/sqlite/effects/effectStore";
import { createMigrationRunner } from "../platform/sqlite/migrationRunner";
import { migrations } from "../platform/sqlite/migrations";
import {
  openSqliteKernel,
  openSqliteKernelTestRuntime,
  type SqliteKernel,
  type SqliteKernelTestObserver,
} from "../platform/sqlite/sqliteKernel";
import type {
  V12ProductionRecoveryExecutor,
  V12RecoveryDurableSnapshot,
  V12RecoveryExecutionIdentity,
} from "./v12ProductionRecovery";
import {
  V12_RECOVERY_CUT_DEFINITIONS,
  V12_RECOVERY_SCENARIOS,
  V12_RECOVERY_UNCOMMITTED_CUTS,
} from "./contracts/v12Recovery.contract";

type OperationId =
  | "legacy-workout-start"
  | "legacy-workout-edit"
  | "foreground-rest-reconcile"
  | "queued-set-commit"
  | "relaunch-workout-finish"
  | "secure-restore-commit"
  | "restore-garmin-import"
  | "secure-merge-commit"
  | "merge-activity-match"
  | "zero-cue-workout-start"
  | "zero-cue-workout-edit"
  | "zero-cue-workout-finish"
  | "between-set-commit"
  | "between-set-rest-transition";

const UNCOMMITTED_CUTS = new Set<string>(V12_RECOVERY_UNCOMMITTED_CUTS);
const PASSWORD = "synthetic-recovery-password";
const TIMING_CONFIG = Object.freeze({
  version: 1,
  mode: "per_rep",
  intervalMs: 1_500,
  cueChannels: "haptic",
});
const TIMING_PROGRESS = Object.freeze({
  version: 1,
  completedRepetitions: 2,
  completedGroups: 0,
  currentGroupIndex: 0,
  currentGroupProgress: 2,
});

const sha256 = (value: string): Promise<string> =>
  digestStringAsync(CryptoDigestAlgorithm.SHA256, value);

function active(input: V12RecoveryExecutionIdentity): void {
  if (input.signal.aborted) throw new Error("v12_recovery_cancelled");
}

function databaseNames(input: V12RecoveryExecutionIdentity) {
  const suffix = `${input.nonce}-${input.caseId}-${input.stepId}-${input.cutId}`;
  return Object.freeze({
    target: `v12-recovery-${suffix}.db`,
    source: `v12-recovery-source-${suffix}.db`,
  });
}

function scenarioFor(caseId: string) {
  const scenario = V12_RECOVERY_SCENARIOS.find(({ id }) => id === caseId);
  if (scenario === undefined) throw new Error("v12_recovery_scenario_missing");
  return scenario;
}

function stepFor(caseId: string, stepId: string) {
  const step = scenarioFor(caseId).steps.find(({ id }) => id === stepId);
  if (step === undefined) throw new Error("v12_recovery_step_missing");
  return step;
}

function operationForStep(caseId: string, stepId: string): OperationId {
  return stepFor(caseId, stepId).operationId;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean"
    || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => (
    `${JSON.stringify(key)}:${stableJson(object[key])}`
  )).join(",")}}`;
}

async function digestRows(rows: readonly Record<string, unknown>[]) {
  return sha256(stableJson(rows));
}

async function migrate(databaseName: string): Promise<SqliteKernel> {
  const kernel = await openSqliteKernel(databaseName);
  try {
    await createMigrationRunner({
      databaseName,
      kernel,
      migrations,
      recoveryBackup: {
        async createAndValidate(request) {
          return Object.freeze({
            ...request,
            backupId: `v12-recovery-${request.fromVersion}-${request.toVersion}`,
            validated: true as const,
          });
        },
      },
    }).run();
    return kernel;
  } catch (error) {
    await kernel.close();
    throw error;
  }
}

function baseTime(caseId: string): number {
  const order = [
    "legacy-playback", "foreground-reconciliation", "queued-callback",
    "relaunch", "restore", "merge", "zero-cue",
    "between-set-rest-pointer",
  ].indexOf(caseId);
  return 1_800_000_000_000 + Math.max(order, 0) * 100_000;
}

function completionKey(input: V12RecoveryExecutionIdentity): string {
  return `v12-recovery:${input.nonce}:${input.caseId}`;
}

async function seedWorkoutPlan(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<void> {
  const fixture = parseFullBodyFoundation(fullBodyFoundationAsset);
  const startedAtMs = baseTime(input.caseId);
  const plans = createPlansWorkoutRepository(kernel);
  await activateStarterPlan({
    fixture,
    repository: plans,
    activatedAtMs: startedAtMs - 1_000,
    startLocalDate: "2027-01-15",
    timezone: "UTC",
  });
}

async function executeWorkoutStart(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<string> {
  const plans = createPlansWorkoutRepository(kernel);
  const startedAtMs = baseTime(input.caseId);
  const [existing] = await kernel.queryAll<{ id: string }>(
    "SELECT id FROM workout_sessions WHERE status = 'in_progress' LIMIT 1",
  );
  if (existing !== undefined) return "already-started";
  const [plan] = await kernel.queryAll<{ plan_id: string; day_id: string }>(
    `SELECT plans.id AS plan_id, days.id AS day_id
     FROM plans
     JOIN plan_days days ON days.plan_id = plans.id
     WHERE plans.is_active = 1
     ORDER BY days.ordinal LIMIT 1`,
  );
  if (plan === undefined) throw new Error("v12_recovery_plan_missing");
  await startWorkout({
    repository: plans,
    request: {
      mode: "scheduled",
      planId: plan.plan_id,
      planDayId: plan.day_id,
      localDate: "2027-01-15",
      timezone: "UTC",
      startedAtMs,
    },
  });
  return "started";
}

async function executeWorkoutEdit(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<string> {
  const workout = createWorkoutRepository(kernel);
  const startedAtMs = baseTime(input.caseId);
  const identity = await activeWorkoutIdentity(kernel);
  const activeWorkout = await workout.getActiveWorkout(identity.session_id);
  const set = activeWorkout.currentExercise.workingSets[0];
  if (set === undefined || set.metricIdentity.profile !== "load_reps") {
    throw new Error("v12_recovery_set_missing");
  }
  if (set.revision >= 2) return "already-edited";
  await updateActiveSetDraft({
    repository: workout,
    input: {
      sessionId: identity.session_id,
      setId: set.id,
      expectedSetRevision: set.revision,
      metricIdentity: set.metricIdentity,
      observation: {
        version: 1,
        profile: "load_reps",
        loadGrams: 10_000,
        reps: 5,
        source: "manual",
      },
      updatedAtMs: startedAtMs + 500,
    },
  });
  return "edited";
}

async function seedActiveWorkout(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<void> {
  await seedWorkoutPlan(kernel, input);
  await executeWorkoutStart(kernel, input);
  await executeWorkoutEdit(kernel, input);
}

async function activeWorkoutIdentity(kernel: SqliteKernel) {
  const [value] = await kernel.queryAll<{
    session_id: string;
    session_revision: number;
    exercise_id: string;
    set_id: string;
  }>(`SELECT ws.id AS session_id, ws.revision AS session_revision,
      ws.active_session_exercise_id AS exercise_id, ws.active_set_id AS set_id
    FROM workout_sessions ws
    WHERE ws.status = 'in_progress'
    ORDER BY ws.started_at_ms LIMIT 1`);
  if (value === undefined || value.exercise_id === null || value.set_id === null) {
    throw new Error("v12_recovery_active_identity_missing");
  }
  return value;
}

async function seedRetiredTimingHistory(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<void> {
  const identity = await activeWorkoutIdentity(kernel);
  const configuration = JSON.stringify(TIMING_CONFIG);
  const progress = JSON.stringify(TIMING_PROGRESS);
  const occurredAtMs = baseTime(input.caseId) + 700;
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `UPDATE session_sets
       SET advanced_timing_resolved_json = ?
       WHERE id = ?`,
      [configuration, identity.set_id],
    );
    await transaction.execute(
      `INSERT INTO session_advanced_timing_states
        (session_id, session_set_id, state_version, revision, status, mode,
         config_json, progress_json, started_at_ms, next_boundary_at_ms,
         remaining_ms, stopped_at_ms)
       VALUES (?, ?, 1, 1, 'stopped', 'per_rep', ?, ?, NULL, NULL, NULL, ?)`,
      [identity.session_id, identity.set_id, configuration, progress, occurredAtMs],
    );
    await transaction.execute(
      `INSERT INTO history_audit_events
        (id, session_id, effective_revision, event_type, field_identity,
         before_json, after_json, occurred_at_ms)
       VALUES (?, ?, ?, 'correction', 'advanced_timing_resolved_json', ?, ?, ?)`,
      [
        `v12-timing-history-${input.nonce}`,
        identity.session_id,
        identity.session_revision,
        JSON.stringify({ version: 1, mode: "off" }),
        configuration,
        occurredAtMs,
      ],
    );
  });
}

async function seedRestReconciliation(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<void> {
  const identity = await activeWorkoutIdentity(kernel);
  await startManualRest({
    repository: createRestRepository(kernel),
    input: {
      sessionId: identity.session_id,
      expectedSessionRevision: identity.session_revision,
      expectedRestRevision: 0,
      nowMs: baseTime(input.caseId) + 800,
    },
  });
}

async function seedScenarioWorkoutFacts(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<void> {
  await seedActiveWorkout(kernel, input);
  await seedRetiredTimingHistory(kernel, input);
  if (["restore", "merge"].includes(input.caseId)) {
    await seedRestReconciliation(kernel, input);
  }
}

async function completeWorkoutSet(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<string> {
  const [session] = await kernel.queryAll<{ id: string }>(
    "SELECT id FROM workout_sessions ORDER BY started_at_ms LIMIT 1",
  );
  if (session === undefined) throw new Error("v12_recovery_session_missing");
  const [set] = await kernel.queryAll<{
    id: string;
    metric_profile: "load_reps";
    metric_contract_version: number;
    exercise_metric_generation: number;
  }>(`SELECT sets.id, sets.metric_profile, sets.metric_contract_version,
      sets.exercise_metric_generation
    FROM session_sets sets
    JOIN session_exercises exercise ON exercise.id = sets.session_exercise_id
    WHERE exercise.session_id = ? AND sets.set_kind = 'working'
    ORDER BY exercise.ordinal, sets.ordinal LIMIT 1`, [session.id]);
  if (set === undefined || set.metric_profile !== "load_reps") {
    throw new Error("v12_recovery_set_missing");
  }
  const result = await completeSet({
    repository: createWorkoutRepository(kernel),
    haptics: {
      committed: async () => undefined,
      cue: async () => undefined,
    },
    invalidate: async () => undefined,
    drainEffects: async () => undefined,
    input: {
      sessionId: session.id,
      setId: set.id,
      expectedSessionRevision: 2,
      expectedSetRevision: 2,
      completionIdempotencyKey: completionKey(input),
      metricIdentity: {
        profile: set.metric_profile,
        contractVersion: set.metric_contract_version,
        exerciseMetricGeneration: set.exercise_metric_generation,
      },
      observation: {
        version: 1,
        profile: "load_reps",
        loadGrams: 10_000,
        reps: 5,
        source: "manual",
      },
      completedAtMs: baseTime(input.caseId) + 1_000,
    },
  });
  return result.outcome === "committed" ? "committed" : "already-completed";
}

async function seedPortableArchiveSource(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<void> {
  const startedAtMs = baseTime(input.caseId);
  await seedScenarioWorkoutFacts(kernel, input);
  const session = await activeWorkoutIdentity(kernel);
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO workout_receipts(id, workout_session_id, request_sha256, committed_at_ms) VALUES (?, ?, ?, ?)",
      [completionKey(input), session.session_id, await sha256(completionKey(input)), startedAtMs + 1_000],
    );
  });
}

async function seedMergeIdempotencyReceipt(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<void> {
  const exerciseId = `v12-merge-proof-${input.nonce}`;
  const migratedAtMs = baseTime(input.caseId) + 1_500;
  await createCustomExercise({
    repository: createCustomExerciseRepository(kernel),
    invalidate: async () => undefined,
    input: {
      requestId: `v12-merge-create-${input.nonce}`,
      exerciseId,
      name: `Merge proof ${input.nonce}`,
      aliases: [],
      exerciseType: "strength",
      movementClass: "compound",
      primaryMuscles: ["quadriceps"],
      secondaryMuscles: ["glutes"],
      equipment: ["sled"],
      metricIdentity: {
        profile: "timed_hold",
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      defaultRestSeconds: 60,
      createdAtMs: baseTime(input.caseId) + 1_000,
    },
  });
  const request = JSON.stringify({
    kind: "v12-merge-idempotency-proof",
    exerciseId,
    fromGeneration: 1,
    toGeneration: 2,
  });
  const result = JSON.stringify({
    outcome: "committed",
    exerciseId,
    exerciseRevision: 2,
    metricIdentity: {
      profile: "timed_hold",
      contractVersion: 2,
      exerciseMetricGeneration: 2,
    },
    migratedTargetIds: [],
    invalidatedRecommendationIds: [],
    invalidatedPolicyIds: [],
    baselineStatus: "awaiting_comparable_observation",
  });
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `UPDATE exercises
       SET metric_contract_version = 2,
           exercise_metric_generation = 2,
           revision = revision + 1
       WHERE id = ? AND metric_profile = 'timed_hold'
         AND metric_contract_version = 1 AND exercise_metric_generation = 1`,
      [exerciseId],
    );
    await transaction.execute(
      `UPDATE exercise_library_entries
       SET metric_contract_version = 2,
           exercise_metric_generation = 2,
           revision = revision + 1
       WHERE exercise_id = ? AND metric_profile = 'timed_hold'
         AND metric_contract_version = 1 AND exercise_metric_generation = 1`,
      [exerciseId],
    );
    await transaction.execute(
      `INSERT INTO exercise_metric_baselines
        (exercise_id, metric_profile, metric_contract_version,
         exercise_metric_generation, status, established_at_ms)
       VALUES (?, 'timed_hold', 2, 2, 'awaiting_comparable_observation', ?)`,
      [exerciseId, migratedAtMs],
    );
    await transaction.execute(
      `INSERT INTO metric_profile_migration_events
        (idempotency_key, exercise_id, from_metric_profile,
         from_metric_contract_version, from_exercise_metric_generation,
         to_metric_profile, to_metric_contract_version,
         to_exercise_metric_generation, migrated_target_count,
         invalidated_recommendation_count, invalidated_policy_count,
         invalidated_effect_count, exercise_revision, request_json, result_json,
         acknowledged_history_immutable, migrated_at_ms)
       VALUES (?, ?, 'timed_hold', 1, 1, 'timed_hold', 2, 2,
               0, 0, 0, 0, 2, ?, ?, 1, ?)`,
      [`v12-merge-receipt-${input.nonce}`, exerciseId, request, result, migratedAtMs],
    );
  });
}

function crypto(): BackupEnvelopeCryptoPort {
  return Object.freeze({
    async deriveKey() {
      return { key: new Uint8Array(32).fill(7) };
    },
    async encrypt(value) {
      return {
        ciphertext: value.plaintext.map((byte) => byte ^ 0xaa),
        tag: new Uint8Array(16).fill(value.aad.byteLength & 0xff),
      };
    },
    async decrypt(value) {
      if (!value.tag.every((byte) => byte === (value.aad.byteLength & 0xff))) {
        throw new Error("v12_recovery_archive_auth_failed");
      }
      return value.ciphertext.map((byte) => byte ^ 0xaa);
    },
  });
}

const kdf = Object.freeze({
  async derive() {
    return Object.freeze({
      algorithm: "argon2id" as const,
      bytes: new Uint8Array(32).fill(7),
      durationMs: 0,
      provider: "Bouncy Castle" as const,
      providerVersion: "1.85.2" as const,
    });
  },
});

async function createArchive(
  source: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
  merge: boolean,
  local?: SqliteKernel,
): Promise<Uint8Array> {
  let bytes: Uint8Array | undefined;
  const commands = createBackupCommands({
    collector: createLogicalBackupRepository(source),
    crypto: crypto(),
    files: {
      async writeArchive(value) {
        bytes = value.archive.slice();
        return { archiveId: value.archiveId };
      },
      shareArchive: async () => undefined,
      deleteArchive: async () => undefined,
    },
    kdf,
    nowMs: () => baseTime(input.caseId) + 2_000,
    randomBytes: (length) => new Uint8Array(length).fill(length),
    snapshotId: () => `v12-recovery-${input.nonce}`,
  });
  await commands.createSecureBackup({ password: PASSWORD });
  if (bytes === undefined) throw new Error("v12_recovery_archive_missing");
  if (!merge) return bytes;
  if (local === undefined) throw new Error("v12_recovery_local_missing");

  const snapshot = await createLogicalBackupRepository(source).collect({
    createdAtMs: baseTime(input.caseId) + 2_000,
    snapshotId: `v12-recovery-merge-${input.nonce}`,
  });
  const localFacts = await createSqliteMergeLocalFactsPort(local).read();
  const tablesForV2 = logicalBackupTablesForVersion(2, 27);
  const tables = Object.freeze(Object.fromEntries(tablesForV2.map((table) => [
    table,
    table === "portable_owner_identity"
      ? [Object.freeze({ id: 1, owner_namespace: localFacts.ownerNamespace })]
      : snapshot.tables[table] ?? [],
  ])));
  const rowCounts = Object.freeze(Object.fromEntries(
    tablesForV2.map((table) => [table, tables[table]!.length]),
  ));
  const portable = Object.freeze({
    ...snapshot,
    version: 2 as const,
    schemaVersion: 27,
    tables,
    manifest: Object.freeze({
      catalogReferenceCount: snapshot.catalogReferences.length,
      rowCounts,
      totalRows: Object.values(rowCounts).reduce((total, count) => total + count, 0),
    }),
  }) satisfies LogicalBackupSnapshot;
  return createBackupEnvelopeCodec(crypto()).seal({
    snapshot: portable,
    password: new TextEncoder().encode(PASSWORD),
    salt: new Uint8Array(16).fill(1),
    nonce: new Uint8Array(12).fill(2),
  });
}

async function executeRestore(
  target: SqliteKernel,
  sourceName: string,
  input: V12RecoveryExecutionIdentity,
): Promise<string> {
  const source = await openSqliteKernel(sourceName);
  try {
    const archive = await createArchive(source, input, false);
    const commands = createRestoreCommands({
      crypto: crypto(),
      files: { readSelectedArchiveAtMost: async () => archive.slice() },
      kdf,
      schema: createSqliteRestoreSchemaPort(target),
      retainedReferences: createSqliteRestoreRetainedReferencePort(target),
      candidateProbe: createSqliteRestoreCandidateProbe(),
      restorer: createLogicalRestoreRepository(target, {
        nowMs: () => baseTime(input.caseId) + 3_000,
      }),
      store: createRestorePreflightStore({
        tokenFactory: () => `restore-${input.nonce}`,
      }),
    });
    const preflight = await commands.preflightSecureRestore({ password: PASSWORD });
    if (preflight.outcome !== "ready") throw new Error("v12_recovery_restore_cancelled");
    const result = await commands.commitSecureRestore({
      token: preflight.token,
      confirmation: "REPLACE",
    });
    return result.state.replaceAll("_", "-");
  } finally {
    await source.close();
  }
}

async function executeMerge(
  target: SqliteKernel,
  sourceName: string,
  input: V12RecoveryExecutionIdentity,
): Promise<string> {
  const source = await openSqliteKernel(sourceName);
  try {
    const archive = await createArchive(source, input, true, target);
    const commands = createMergeCommands({
      crypto: crypto(),
      files: { readSelectedArchiveAtMost: async () => archive.slice() },
      kdf,
      schema: createSqliteRestoreSchemaPort(target),
      retainedReferences: createSqliteRestoreRetainedReferencePort(target),
      candidateProbe: createSqliteRestoreCandidateProbe(),
      local: createSqliteMergeLocalFactsPort(target),
      sha256,
      store: createMergePreflightStore({
        tokenFactory: () => `merge-${input.nonce}-${Date.now()}`,
      }),
      writer: createFullPlanLogicalMergeWriter(target, {
        nowMs: () => baseTime(input.caseId) + 3_000,
        sha256,
      }),
    });
    const preflight = await commands.preflightSecureMerge({ password: PASSWORD });
    if (preflight.outcome !== "ready") throw new Error("v12_recovery_merge_cancelled");
    const result = await commands.commitSecureMerge({
      token: preflight.token,
      confirmation: "MERGE",
    });
    return result.state.replaceAll("_", "-");
  } finally {
    await source.close();
  }
}

async function garminEnvelope(input: V12RecoveryExecutionIdentity) {
  const externalActivityId = String(700_000 + baseTime(input.caseId) % 10_000);
  const accountNamespace = `recovery-${input.nonce}`;
  const activity = {
    activityId: Number(externalActivityId),
    activityTypeDTO: { typeKey: "running" },
    summaryDTO: {
      startTimeGMT: "2027-01-15T01:00:00.000Z",
      startTimeLocal: "2027-01-15T01:00:00",
      timeZoneId: "UTC",
      distance: 5_000,
      duration: 1_500,
      elapsedDuration: 1_500,
      movingDuration: 1_490,
    },
  };
  return normalizeGarminActivity({
    account_namespace: accountNamespace,
    external_activity_id: externalActivityId,
    activity,
    splits: { lapDTOs: [] },
    details: { metricDescriptors: [], activityDetailMetrics: [] },
  }, sha256);
}

async function executeGarminImport(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<string> {
  const envelope = await garminEnvelope(input);
  const source = Object.freeze({
    connectionState: async () => ({
      kind: "connected" as const,
      account_namespace: envelope.account_namespace,
      generation: 1,
    }),
    restoreSession: async () => ({
      kind: "connected" as const,
      account_namespace: envelope.account_namespace,
      generation: 1,
    }),
    login: async () => ({
      kind: "connected" as const,
      account_namespace: envelope.account_namespace,
      generation: 1,
    }),
    resumeMfa: async () => ({
      kind: "connected" as const,
      account_namespace: envelope.account_namespace,
      generation: 1,
    }),
    logout: async () => undefined,
    listRunningSummaries: async () => ({ items: [envelope] }),
    readActivity: async () => envelope,
  });
  const coordinator = createGarminSyncCoordinator({
    source,
    limits: { pageSize: 1, maxPages: 1, maxActivities: 1 },
    importActivity: createGarminSharedImportCommitter({
      repository: createImportedActivityRepository(kernel),
      sha256,
      requestFor: async (prepared) => ({
        requestId: `import-${input.nonce}`,
        requestSha256: await sha256(stableJson(prepared.envelope)),
        activityId: `activity-${input.nonce}`,
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2027-01-15",
      }),
    }),
  });
  const result = await coordinator.syncNow({ isCancelled: () => input.signal.aborted });
  if (result.kind !== "success") return result.kind.replaceAll("_", "-");
  if (result.counts.newActivities === 1) return "imported";
  if (result.counts.unchangedActivities === 1) return "unchanged";
  return "sync-observed";
}

async function seedGarminMatch(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<void> {
  await executeGarminImport(kernel, input);
  const plans = createRunningPlanRepository(kernel);
  await plans.createInactiveMinimum({
    planId: `running-plan-${input.nonce}`,
    planName: "Recovery Running",
    anchorDayId: `running-day-${input.nonce}`,
    scheduleId: `running-schedule-${input.nonce}`,
    scheduleVersionId: `running-version-${input.nonce}`,
    scheduleBindingId: `running-binding-${input.nonce}`,
    createdAtMs: baseTime(input.caseId),
    effectiveLocalDate: "2027-01-15",
    timezone: "UTC",
    recoveryRevisionId: `running-session-${input.nonce}`,
    slots: [{
      id: `running-slot-${input.nonce}`,
      weekday: "Friday",
      ordinal: 0,
      sessionRevisionId: `running-session-${input.nonce}`,
    }],
  });
  await plans.activateMinimum({
    planId: `running-plan-${input.nonce}`,
    scheduleId: `running-schedule-${input.nonce}`,
    expectedPlanRevision: 1,
    expectedScheduleRevision: 1,
    activatedAtMs: baseTime(input.caseId) + 1_000,
  });
  await plans.materializeOccurrences({
    planId: `running-plan-${input.nonce}`,
    scheduleId: `running-schedule-${input.nonce}`,
    scheduleVersionId: `running-version-${input.nonce}`,
    localDate: "2027-01-15",
    timezone: "UTC",
    createdAtMs: baseTime(input.caseId) + 2_000,
    occurrenceIds: [`running-opportunity-${input.nonce}`],
  });
}

async function executeGarminMatch(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<string> {
  const repository = createRunningActivityMatchRepository(kernel);
  const activityId = `activity-${input.nonce}`;
  const candidates = await queryRunningActivityMatchCandidates(repository, activityId);
  const candidate = candidates.kind === "ready"
    ? candidates.candidates[0]
    : candidates.kind === "already_matched"
      ? { ...candidates.currentCandidate, expectedRelationRevision: 0 }
      : undefined;
  if (candidate === undefined) throw new Error("v12_recovery_match_candidate_missing");
  const command = await prepareRunningActivityMatchInput({
    action: "match",
    candidate,
    requestId: `match-${input.nonce}`,
    occurredAtMs: baseTime(input.caseId) + 3_000,
  }, sha256);
  const result = await confirmRunningActivityMatch(repository, command);
  return result.kind.replaceAll("_", "-");
}

async function setup(
  target: SqliteKernel,
  source: SqliteKernel | undefined,
  operation: OperationId,
  input: V12RecoveryExecutionIdentity,
): Promise<void> {
  if (["legacy-workout-start", "zero-cue-workout-start"].includes(operation)) {
    await seedWorkoutPlan(target, input);
    return;
  }
  if (["legacy-workout-edit", "zero-cue-workout-edit"].includes(operation)) {
    await seedWorkoutPlan(target, input);
    await executeWorkoutStart(target, input);
    await seedRetiredTimingHistory(target, input);
    return;
  }
  if (operation === "foreground-rest-reconcile") {
    await seedScenarioWorkoutFacts(target, input);
    await seedRestReconciliation(target, input);
    return;
  }
  if (["queued-set-commit", "between-set-commit"].includes(operation)) {
    await seedScenarioWorkoutFacts(target, input);
    return;
  }
  if (["relaunch-workout-finish", "zero-cue-workout-finish"].includes(operation)) {
    await seedScenarioWorkoutFacts(target, input);
    await completeWorkoutSet(target, input);
    return;
  }
  if (operation === "between-set-rest-transition") {
    await seedScenarioWorkoutFacts(target, input);
    await completeWorkoutSet(target, input);
    return;
  }
  if (operation === "restore-garmin-import") {
    await seedScenarioWorkoutFacts(target, input);
    return;
  }
  if (operation === "merge-activity-match") {
    await seedScenarioWorkoutFacts(target, input);
    await seedGarminMatch(target, input);
    return;
  }
  if (["secure-restore-commit", "secure-merge-commit"].includes(operation)) {
    if (source === undefined) throw new Error("v12_recovery_source_missing");
    await seedPortableArchiveSource(source, input);
    if (operation === "secure-restore-commit") {
      await executeGarminImport(source, input);
    } else {
      await seedMergeIdempotencyReceipt(source, input);
      await seedScenarioWorkoutFacts(target, input);
      await seedGarminMatch(target, input);
      await executeGarminMatch(target, input);
    }
  }
}

async function finishWorkoutScenario(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<string> {
  const [existing] = await kernel.queryAll<{ id: string; status: string; revision: number }>(
    "SELECT id, status, revision FROM workout_sessions ORDER BY started_at_ms LIMIT 1",
  );
  if (existing === undefined) throw new Error("v12_recovery_session_missing");
  if (existing.status !== "in_progress") return "replayed";
  await finishPartial({
    repository: createWorkoutOutcomeRepository(kernel),
    input: {
      sessionId: existing.id,
      expectedSessionRevision: existing.revision,
      endedAtMs: baseTime(input.caseId) + 2_000,
      confirmation: PARTIAL_CONFIRMATION,
    },
  });
  return "finished";
}

async function reconcileForegroundRest(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<string> {
  const [row] = await kernel.queryAll<{
    session_id: string;
    session_revision: number;
    rest_revision: number;
    status: string;
  }>(`SELECT ws.id AS session_id, ws.revision AS session_revision,
      rest.revision AS rest_revision, rest.status
    FROM workout_sessions ws
    JOIN session_rest_states rest ON rest.session_id = ws.id
    ORDER BY ws.started_at_ms LIMIT 1`);
  if (row === undefined) throw new Error("v12_recovery_rest_missing");
  if (row.status === "expired") return "already-reconciled";
  await expireRestWithForegroundFeedback({
    repository: createRestRepository(kernel),
    input: {
      sessionId: row.session_id,
      expectedSessionRevision: row.session_revision,
      expectedRestRevision: row.rest_revision,
      nowMs: baseTime(input.caseId) + 200_000,
      preferences: { soundEnabled: false, vibrationEnabled: false },
    },
  });
  return "foreground-reconciled";
}

async function pauseBetweenSetRest(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<string> {
  const [row] = await kernel.queryAll<{
    session_id: string;
    session_revision: number;
    rest_revision: number;
    status: string;
  }>(`SELECT ws.id AS session_id, ws.revision AS session_revision,
      rest.revision AS rest_revision, rest.status
    FROM workout_sessions ws
    JOIN session_rest_states rest ON rest.session_id = ws.id
    ORDER BY ws.started_at_ms LIMIT 1`);
  if (row === undefined) throw new Error("v12_recovery_rest_missing");
  if (row.status === "paused") return "already-paused";
  await pauseRest({
    repository: createRestRepository(kernel),
    input: {
      sessionId: row.session_id,
      expectedSessionRevision: row.session_revision,
      expectedRestRevision: row.rest_revision,
      nowMs: baseTime(input.caseId) + 1_500,
    },
  });
  return "rest-paused";
}

async function drainScenarioEffects(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<string> {
  const runner = createEffectRunner({
    store: createEffectStore(kernel),
    async currentRevision(subjectId, effectType) {
      if (effectType === "reconcile_rest_notification") {
        const [row] = await kernel.queryAll<{ revision: number }>(
          "SELECT revision FROM session_rest_states WHERE session_id = ?",
          [subjectId],
        );
        return row?.revision ?? null;
      }
      const [row] = await kernel.queryAll<{ revision: number }>(
        "SELECT revision FROM workout_sessions WHERE id = ?",
        [subjectId],
      );
      return row?.revision ?? null;
    },
    handlers: {
      reconcile_rest_notification: async () => undefined,
      regenerate_load_reps_recommendation: async () => undefined,
    },
  });
  const result = await runner.drain({ nowMs: baseTime(input.caseId) + 300_000, limit: 32 });
  return result.completed > 0 ? "effects-reconciled" : "effects-already-reconciled";
}

async function executeOperation(
  kernel: SqliteKernel,
  operation: OperationId,
  sourceName: string,
  input: V12RecoveryExecutionIdentity,
): Promise<string> {
  active(input);
  if (["legacy-workout-start", "zero-cue-workout-start"].includes(operation)) {
    return executeWorkoutStart(kernel, input);
  }
  if (["legacy-workout-edit", "zero-cue-workout-edit"].includes(operation)) {
    return executeWorkoutEdit(kernel, input);
  }
  if (operation === "foreground-rest-reconcile") {
    return reconcileForegroundRest(kernel, input);
  }
  if (["queued-set-commit", "between-set-commit"].includes(operation)) {
    return completeWorkoutSet(kernel, input);
  }
  if (["relaunch-workout-finish", "zero-cue-workout-finish"].includes(operation)) {
    return finishWorkoutScenario(kernel, input);
  }
  if (operation === "between-set-rest-transition") {
    return pauseBetweenSetRest(kernel, input);
  }
  if (operation === "restore-garmin-import") return executeGarminImport(kernel, input);
  if (operation === "merge-activity-match") return executeGarminMatch(kernel, input);
  if (operation === "secure-restore-commit") return executeRestore(kernel, sourceName, input);
  if (operation === "secure-merge-commit") return executeMerge(kernel, sourceName, input);
  throw new Error("v12_recovery_operation_missing");
}

async function executeDomainRecovery(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<string> {
  if (input.caseId === "foreground-reconciliation") return reconcileForegroundRest(kernel, input);
  const code = await drainScenarioEffects(kernel, input);
  if (input.caseId === "queued-callback") return "queued-callback-reconciled";
  return code === "effects-reconciled" ? "domain-reconciled" : "domain-recovery-observed";
}

async function ensureRecoveryEffect(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<void> {
  if (["foreground-reconciliation", "queued-callback"].includes(input.caseId)) return;
  const [session] = await kernel.queryAll<{ id: string; revision: number }>(
    "SELECT id, revision FROM workout_sessions ORDER BY started_at_ms LIMIT 1",
  );
  if (session === undefined) throw new Error("v12_recovery_session_missing");
  const nowMs = baseTime(input.caseId) + 4_000;
  await kernel.write((transaction) => enqueuePendingEffect(transaction, {
    id: `v12-recovery-effect-${input.nonce}-${input.stepId}`,
    type: "regenerate_load_reps_recommendation",
    payloadVersion: 1,
    payload: { reason: "v12-recovery" },
    idempotencyKey: `v12-recovery-effect:${input.nonce}:${input.stepId}`,
    subjectId: session.id,
    expectedRevision: session.revision,
    nowMs,
  }));
}

async function observationRows(
  kernel: SqliteKernel,
  operation: OperationId,
  input: V12RecoveryExecutionIdentity,
): Promise<Readonly<{
  source: readonly Record<string, unknown>[];
  commandReceipts: readonly Record<string, unknown>[];
  effect: readonly Record<string, unknown>[];
  pointer: readonly Record<string, unknown>[];
  rest: readonly Record<string, unknown>[];
  history: readonly Record<string, unknown>[];
  timing: readonly Record<string, unknown>[];
  restore: readonly Record<string, unknown>[];
  workoutReceipts: readonly Record<string, unknown>[];
  importedReceipts: readonly Record<string, unknown>[];
  matchReceipts: readonly Record<string, unknown>[];
  metricReceipts: readonly Record<string, unknown>[];
}>> {
  const [effect, pointer, rest, history, timing, restore, workoutReceipts,
    importedReceipts, matchReceipts, metricReceipts] = await Promise.all([
    kernel.queryAll<Record<string, unknown>>(
      `SELECT effects.idempotency_key, effects.effect_type,
              COALESCE(ws.portable_id, effects.subject_id) AS subject_identity,
              effects.expected_revision, effects.status, effects.attempt_count,
              effects.next_attempt_at_ms, effects.last_error_code
       FROM pending_effects effects
       LEFT JOIN workout_sessions ws ON ws.id = effects.subject_id
       ORDER BY effects.id`,
    ),
    kernel.queryAll<Record<string, unknown>>(
      `SELECT COALESCE(ws.portable_id, ws.id) AS session_identity, ws.status, ws.revision,
              active_exercise.ordinal AS active_exercise_ordinal,
              active_set_exercise.ordinal AS active_set_exercise_ordinal,
              active_set.set_kind AS active_set_kind, active_set.ordinal AS active_set_ordinal,
              committed_exercise.ordinal AS committed_set_exercise_ordinal,
              committed_set.set_kind AS committed_set_kind, committed_set.ordinal AS committed_set_ordinal
       FROM workout_sessions ws
       LEFT JOIN session_exercises active_exercise ON active_exercise.id = ws.active_session_exercise_id
       LEFT JOIN session_sets active_set ON active_set.id = ws.active_set_id
       LEFT JOIN session_exercises active_set_exercise ON active_set_exercise.id = active_set.session_exercise_id
       LEFT JOIN session_sets committed_set ON committed_set.id =
              (SELECT sets.id FROM session_sets sets
               JOIN session_exercises exercise ON exercise.id = sets.session_exercise_id
               WHERE exercise.session_id = ws.id AND sets.status = 'completed'
               ORDER BY sets.completed_at_ms DESC, sets.id LIMIT 1)
       LEFT JOIN session_exercises committed_exercise ON committed_exercise.id = committed_set.session_exercise_id
       ORDER BY session_identity`,
    ),
    kernel.queryAll<Record<string, unknown>>(
      `SELECT COALESCE(ws.portable_id, ws.id) AS session_identity,
              rest.status, rest.revision, rest.started_at_ms, rest.ends_at_ms,
              rest.remaining_ms, rest.expired_at_ms,
              next_exercise.ordinal AS next_exercise_ordinal,
              next_set.set_kind AS next_set_kind, next_set.ordinal AS next_set_ordinal
       FROM session_rest_states rest
       JOIN workout_sessions ws ON ws.id = rest.session_id
       LEFT JOIN session_sets next_set ON next_set.id = rest.next_set_id
       LEFT JOIN session_exercises next_exercise ON next_exercise.id = next_set.session_exercise_id
       ORDER BY session_identity`,
    ),
    kernel.queryAll<Record<string, unknown>>(
      `SELECT history.id, COALESCE(ws.portable_id, ws.id) AS session_identity,
              history.effective_revision, history.event_type, history.field_identity,
              history.before_json, history.after_json, history.occurred_at_ms
       FROM history_audit_events history
       JOIN workout_sessions ws ON ws.id = history.session_id
       ORDER BY history.id`,
    ),
    kernel.queryAll<Record<string, unknown>>(
      `SELECT COALESCE(ws.portable_id, ws.id) AS session_identity,
              exercise.ordinal AS exercise_ordinal, sets.set_kind, sets.ordinal AS set_ordinal,
              timing.state_version, timing.revision, timing.status, timing.mode,
              timing.config_json, timing.progress_json, timing.started_at_ms,
              timing.next_boundary_at_ms, timing.remaining_ms, timing.stopped_at_ms
       FROM session_advanced_timing_states timing
       JOIN workout_sessions ws ON ws.id = timing.session_id
       LEFT JOIN session_sets sets ON sets.id = timing.session_set_id
       LEFT JOIN session_exercises exercise ON exercise.id = sets.session_exercise_id
       ORDER BY session_identity`,
    ),
    kernel.queryAll<Record<string, unknown>>(
      "SELECT state, updated_at_ms FROM portability_restore_state ORDER BY id",
    ),
    kernel.queryAll<Record<string, unknown>>(
      "SELECT id, request_sha256, committed_at_ms FROM workout_receipts ORDER BY id",
    ),
    kernel.queryAll<Record<string, unknown>>(
      "SELECT id, request_sha256, committed_at_ms FROM imported_activity_receipts ORDER BY id",
    ),
    kernel.queryAll<Record<string, unknown>>(
      `SELECT request_id AS id, request_sha256, committed_at_ms, result_kind
       FROM running_activity_match_receipts ORDER BY request_id`,
    ),
    kernel.queryAll<Record<string, unknown>>(
      `SELECT idempotency_key AS id, migrated_at_ms AS committed_at_ms,
              'metric-migrated' AS result_kind
       FROM metric_profile_migration_events ORDER BY idempotency_key`,
    ),
  ]);
  let source: readonly Record<string, unknown>[] = [];
  let commandReceipts: readonly Record<string, unknown>[] = [];
  if (["legacy-workout-start", "zero-cue-workout-start"].includes(operation)) {
    source = await kernel.queryAll("SELECT status, revision, started_at_ms FROM workout_sessions WHERE status = 'in_progress' ORDER BY id");
    commandReceipts = source.map((row) => ({ id: `start:${String(row.started_at_ms)}`, request_sha256: "", committed_at_ms: row.started_at_ms, result_kind: "started" }));
  } else if (["legacy-workout-edit", "zero-cue-workout-edit"].includes(operation)) {
    source = await kernel.queryAll("SELECT status, revision, draft_updated_at_ms, observed_json FROM session_sets WHERE observed_json IS NOT NULL ORDER BY id");
    commandReceipts = source.map((row) => ({ id: `edit:${String(row.draft_updated_at_ms)}`, request_sha256: "", committed_at_ms: row.draft_updated_at_ms, result_kind: "edited" }));
  } else if (operation === "foreground-rest-reconcile") {
    source = await kernel.queryAll("SELECT status, revision, expired_at_ms FROM session_rest_states WHERE status = 'expired' ORDER BY session_id");
    commandReceipts = source.map((row) => ({ id: `foreground:${String(row.expired_at_ms)}`, request_sha256: "", committed_at_ms: row.expired_at_ms, result_kind: "foreground-reconciled" }));
  } else if (["queued-set-commit", "between-set-commit"].includes(operation)) {
    source = await kernel.queryAll("SELECT status, revision, completion_idempotency_key, completed_at_ms FROM session_sets WHERE completion_idempotency_key IS NOT NULL ORDER BY id");
    commandReceipts = source.map((row) => ({ id: row.completion_idempotency_key, request_sha256: "", committed_at_ms: row.completed_at_ms, result_kind: "set-completed" }));
  } else if (["relaunch-workout-finish", "zero-cue-workout-finish"].includes(operation)) {
    source = await kernel.queryAll("SELECT status, revision, completed_at_ms FROM workout_sessions WHERE status != 'in_progress' ORDER BY id");
    commandReceipts = workoutReceipts.map((row) => ({ ...row, result_kind: "workout-finished" }));
  } else if (operation === "between-set-rest-transition") {
    source = await kernel.queryAll("SELECT status, revision, remaining_ms FROM session_rest_states WHERE status = 'paused' ORDER BY session_id");
    commandReceipts = source.map((row) => ({ id: `rest:${input.nonce}`, request_sha256: "", committed_at_ms: baseTime(input.caseId) + 1_500, result_kind: "rest-paused", ...row }));
  } else if (operation === "restore-garmin-import") {
    source = await kernel.queryAll("SELECT revision, lifecycle_state FROM imported_activities ORDER BY id");
    commandReceipts = importedReceipts.map((row) => ({ ...row, result_kind: "imported" }));
  } else if (operation === "merge-activity-match") {
    source = await kernel.queryAll("SELECT relation_revision FROM running_activity_current_matches ORDER BY opportunity_id");
    commandReceipts = matchReceipts.map((row) => ({ ...row, result_kind: row.result_kind ?? "matched" }));
  } else if (operation === "secure-restore-commit") {
    source = await kernel.queryAll("SELECT status, revision, portable_id, merge_modified_at_ms FROM workout_sessions ORDER BY id");
    commandReceipts = restore.filter((row) => row.state === "rebuild_pending").map((row) => ({ id: `restore:${input.nonce}`, request_sha256: "", committed_at_ms: row.updated_at_ms, result_kind: "restored" }));
  } else if (operation === "secure-merge-commit") {
    source = await kernel.queryAll("SELECT status, revision, portable_id, merge_modified_at_ms FROM workout_sessions ORDER BY id");
    commandReceipts = source.length > 1 ? [{
      id: `merge:${input.nonce}`,
      request_sha256: await sha256(`merge:${input.nonce}`),
      committed_at_ms: baseTime(input.caseId) + 3_000,
      result_kind: "merge-idempotent",
    }] : [];
  }
  return Object.freeze({ source, commandReceipts, effect, pointer, rest, history, timing,
    restore, workoutReceipts, importedReceipts, matchReceipts, metricReceipts });
}

async function snapshot(
  kernel: SqliteKernel,
  operation: OperationId,
  input: V12RecoveryExecutionIdentity,
): Promise<V12RecoveryDurableSnapshot> {
  const rows = await observationRows(kernel, operation, input);
  const step = stepFor(input.caseId, input.stepId);
  const commandReceiptFacts = await Promise.all(rows.commandReceipts.map(async (row) => Object.freeze({
    step_id: step.id,
    boundary_id: step.boundaryId,
    kind: step.receiptKind,
    receipt_sha256: await sha256(stableJson(row)),
    request_sha256: typeof row.request_sha256 === "string" && row.request_sha256.length === 64
      ? row.request_sha256 : await sha256(`${step.id}:${String(row.id)}`),
    committed_at_ms: Number(row.committed_at_ms),
    result: String(row.result_kind),
  })));
  const effectFacts = await Promise.all(rows.effect.map(async (row) => Object.freeze({
    effect_sha256: await sha256(String(row.idempotency_key)),
    type: row.effect_type as "reconcile_rest_notification" | "regenerate_load_reps_recommendation",
    subject_sha256: await sha256(String(row.subject_identity)),
    expected_revision: Number(row.expected_revision),
    status: row.status as "pending" | "processing" | "completed" | "superseded" | "permanent_failure",
    attempt_count: Number(row.attempt_count),
    next_attempt_at_ms: Number(row.next_attempt_at_ms),
    last_error_code: row.last_error_code === null ? null : String(row.last_error_code),
  })));
  const pointerRows = new Map(rows.pointer.map((row) => [String(row.session_identity), row]));
  const pointerFacts = await Promise.all(rows.pointer.map(async (row) => {
    const session = String(row.session_identity);
    const activeExercise = row.active_exercise_ordinal === null ? null : await sha256(`${session}:exercise:${String(row.active_exercise_ordinal)}`);
    const activeSetExercise = row.active_set_exercise_ordinal === null ? null : await sha256(`${session}:exercise:${String(row.active_set_exercise_ordinal)}`);
    const committedSetExercise = row.committed_set_exercise_ordinal === null ? null : await sha256(`${session}:exercise:${String(row.committed_set_exercise_ordinal)}`);
    const transition = row.committed_set_ordinal === null || row.active_set_ordinal === null || row.active_set_exercise_ordinal === null
      ? null : await sha256(`${session}:exercise:${String(row.active_set_exercise_ordinal)}:set:${String(row.committed_set_kind)}:${String(row.committed_set_ordinal)}->${String(row.active_set_kind)}:${String(row.active_set_ordinal)}`);
    return Object.freeze({
      session_sha256: await sha256(session),
      status: String(row.status),
      revision: Number(row.revision),
      active_exercise_sha256: activeExercise,
      active_set_exercise_sha256: activeSetExercise,
      active_set_sha256: row.active_set_ordinal === null || row.active_set_exercise_ordinal === null ? null : await sha256(`${session}:exercise:${String(row.active_set_exercise_ordinal)}:set:${String(row.active_set_kind)}:${String(row.active_set_ordinal)}`),
      active_set_ordinal: row.active_set_ordinal === null ? null : Number(row.active_set_ordinal),
      committed_set_exercise_sha256: committedSetExercise,
      committed_set_sha256: row.committed_set_ordinal === null || row.committed_set_exercise_ordinal === null ? null : await sha256(`${session}:exercise:${String(row.committed_set_exercise_ordinal)}:set:${String(row.committed_set_kind)}:${String(row.committed_set_ordinal)}`),
      committed_set_ordinal: row.committed_set_ordinal === null ? null : Number(row.committed_set_ordinal),
      transition_sha256: transition,
    });
  }));
  const restFacts = await Promise.all(rows.rest.map(async (row) => {
    const session = String(row.session_identity);
    const pointer = pointerRows.get(session);
    const transition = pointer?.committed_set_ordinal === null || pointer?.active_set_ordinal === null
      || pointer?.active_set_exercise_ordinal === null || pointer === undefined
      ? null : await sha256(`${session}:exercise:${String(pointer.active_set_exercise_ordinal)}:set:${String(pointer.committed_set_kind)}:${String(pointer.committed_set_ordinal)}->${String(pointer.active_set_kind)}:${String(pointer.active_set_ordinal)}`);
    return Object.freeze({
      session_sha256: await sha256(session),
      status: row.status as "idle" | "running" | "paused" | "expired",
      revision: Number(row.revision),
      started_at_ms: row.started_at_ms as number | null,
      ends_at_ms: row.ends_at_ms as number | null,
      deadline_at_ms: row.ends_at_ms as number | null,
      paused_remaining_ms: row.remaining_ms as number | null,
      expired_at_ms: row.expired_at_ms as number | null,
      next_set_exercise_sha256: row.next_exercise_ordinal === null ? null : await sha256(`${session}:exercise:${String(row.next_exercise_ordinal)}`),
      next_set_sha256: row.next_set_ordinal === null || row.next_exercise_ordinal === null ? null : await sha256(`${session}:exercise:${String(row.next_exercise_ordinal)}:set:${String(row.next_set_kind)}:${String(row.next_set_ordinal)}`),
      next_set_ordinal: row.next_set_ordinal === null ? null : Number(row.next_set_ordinal),
      transition_sha256: transition,
    });
  }));
  const timingFacts = await Promise.all(rows.timing.map(async (row) => Object.freeze({
    session_sha256: await sha256(String(row.session_identity)),
    set_sha256: row.set_ordinal === null ? null : await sha256(`${String(row.session_identity)}:set:${String(row.set_kind)}:${String(row.exercise_ordinal)}:${String(row.set_ordinal)}`),
    state_version: Number(row.state_version),
    revision: Number(row.revision),
    status: row.status as "idle" | "running" | "paused" | "stopped" | "expired",
    mode: row.mode as "per_rep" | "cluster" | null,
    configuration: JSON.parse(String(row.config_json)) as Record<string, unknown>,
    progress: JSON.parse(String(row.progress_json)) as Record<string, unknown>,
    started_at_ms: row.started_at_ms as number | null,
    next_boundary_at_ms: row.next_boundary_at_ms as number | null,
    remaining_ms: row.remaining_ms as number | null,
    stopped_at_ms: row.stopped_at_ms as number | null,
  })));
  const historyFacts = await Promise.all(rows.history.map(async (row) => Object.freeze({
    event_sha256: await sha256(`${String(row.session_identity)}:${String(row.field_identity)}:${String(row.occurred_at_ms)}`),
    session_sha256: await sha256(String(row.session_identity)),
    effective_revision: Number(row.effective_revision),
    event_type: row.event_type as "correction" | "void" | "restore",
    field_identity: String(row.field_identity),
    before_sha256: await sha256(String(row.before_json)),
    after_sha256: await sha256(String(row.after_json)),
    occurred_at_ms: Number(row.occurred_at_ms),
  })));
  const restoreFacts = rows.restore.map((row) => Object.freeze({
    state: row.state as "ready" | "rebuild_pending",
    updated_at_ms: Number(row.updated_at_ms),
  }));
  const mergeRows: Array<Record<string, unknown> & Readonly<{ table: "workout_receipts" | "imported_activity_receipts" | "running_activity_match_receipts" | "metric_profile_migration_events" }>> = [
    ...rows.workoutReceipts.map((row) => ({ ...row, table: "workout_receipts" as const, result_kind: "committed" })),
    ...rows.importedReceipts.map((row) => ({ ...row, table: "imported_activity_receipts" as const, result_kind: "committed" })),
    ...rows.matchReceipts.map((row) => ({ ...row, table: "running_activity_match_receipts" as const })),
    ...rows.metricReceipts.map((row) => ({ ...row, table: "metric_profile_migration_events" as const, request_sha256: "" })),
  ];
  const mergeReceiptFacts = await Promise.all(mergeRows.map(async (row) => Object.freeze({
    table: row.table,
    receipt_sha256: await sha256(stableJson(row)),
    request_sha256: typeof row.request_sha256 === "string" && row.request_sha256.length === 64
      ? row.request_sha256 : await sha256(String(row.id)),
    idempotency_sha256: await sha256(String(row.id)),
    committed_at_ms: Number(row.committed_at_ms),
    result: String(row.result_kind ?? "committed"),
  })));
  const cueFacts: readonly Record<string, unknown>[] = [];
  const [sourceSha, receiptSha, effectSha, pointerSha, restSha, historySha, timingSha,
    restoreSha, mergeReceiptSha, cueSha] =
    await Promise.all([
      digestRows(rows.source), digestRows(rows.commandReceipts), digestRows(rows.effect),
      digestRows(rows.pointer), digestRows(rows.rest), digestRows(rows.history),
      digestRows(rows.timing), digestRows(rows.restore),
      digestRows(mergeRows), digestRows(cueFacts),
    ]);
  return Object.freeze({
    source_count: rows.source.length,
    receipt_count: commandReceiptFacts.length,
    effect_count: rows.effect.length,
    pointer_count: rows.pointer.length,
    rest_count: rows.rest.length,
    history_count: rows.history.length,
    timing_count: rows.timing.length,
    restore_count: rows.restore.length,
    merge_receipt_count: mergeReceiptFacts.length,
    cue_count: cueFacts.length,
    source_sha256: sourceSha,
    receipt_sha256: receiptSha,
    effect_sha256: effectSha,
    pointer_sha256: pointerSha,
    rest_sha256: restSha,
    history_sha256: historySha,
    timing_sha256: timingSha,
    restore_sha256: restoreSha,
    merge_receipt_sha256: mergeReceiptSha,
    cue_sha256: cueSha,
    command_receipt_facts: Object.freeze(commandReceiptFacts),
    effect_facts: Object.freeze(effectFacts),
    pointer_facts: Object.freeze(pointerFacts),
    rest_facts: Object.freeze(restFacts),
    timing_facts: Object.freeze(timingFacts),
    history_facts: Object.freeze(historyFacts),
    restore_facts: Object.freeze(restoreFacts),
    merge_receipt_facts: Object.freeze(mergeReceiptFacts),
  });
}

function holdOpen(): Promise<never> {
  return new Promise(() => undefined);
}

function cutDefinition(cutId: string) {
  const cut = V12_RECOVERY_CUT_DEFINITIONS.find(({ id }) => id === cutId);
  if (cut === undefined) throw new Error("v12_recovery_cut_missing");
  return cut;
}

async function emitArmed(
  input: V12RecoveryExecutionIdentity,
  before: V12RecoveryDurableSnapshot,
  afterCut: V12RecoveryDurableSnapshot,
  firstAttemptCode: string,
): Promise<void> {
  const cut = cutDefinition(input.cutId);
  await input.progress({
    barrier_id: cut.barrierId,
    process_state: cut.processState,
    acknowledgement: cut.acknowledgement,
    connectivity: cut.connectivity,
    first_attempt: cut.firstAttempt,
    provenance: cut.provenance,
    first_attempt_code: firstAttemptCode,
    before,
    after_cut: afterCut,
  });
}

type RecoveryClosable = Readonly<{ close(): Promise<void> }>;

async function closeRecoveryResources(
  resources: Set<RecoveryClosable>,
): Promise<void> {
  const pending = [...resources].reverse();
  resources.clear();
  const results = await Promise.allSettled(pending.map((resource) => resource.close()));
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

async function deleteRecoveryDatabases(names: Readonly<{
  target: string;
  source: string;
}>, removeDatabase: (name: string) => Promise<void>): Promise<void> {
  const removeIfPresent = async (name: string): Promise<void> => {
    try {
      await removeDatabase(name);
    } catch (error) {
      // A fresh nonce has no database yet, and some scenarios never create a
      // source database. Open/cached databases and failed unlinks stay errors.
      if (!(error instanceof Error)
        || (error as Error & Readonly<{ code?: unknown }>).code !== "ERR_DATABASE_NOT_FOUND") throw error;
    }
  };
  const results = await Promise.allSettled([
    removeIfPresent(names.target),
    removeIfPresent(names.source),
  ]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

type V12ProductionRecoveryNativeDependencies = Readonly<{
  deleteDatabase(name: string): Promise<void>;
  migrateDatabase: typeof migrate;
  setupDatabase: typeof setup;
  openKernel: typeof openSqliteKernel;
  openTestRuntime: typeof openSqliteKernelTestRuntime;
  readSnapshot: typeof snapshot;
  runOperation: typeof executeOperation;
  runDomainRecovery: typeof executeDomainRecovery;
  seedRecoveryEffect: typeof ensureRecoveryEffect;
}>;

const productionDependencies: V12ProductionRecoveryNativeDependencies = Object.freeze({
  deleteDatabase: deleteDatabaseAsync,
  migrateDatabase: migrate,
  setupDatabase: setup,
  openKernel: openSqliteKernel,
  openTestRuntime: openSqliteKernelTestRuntime,
  readSnapshot: snapshot,
  runOperation: executeOperation,
  runDomainRecovery: executeDomainRecovery,
  seedRecoveryEffect: ensureRecoveryEffect,
});

export function createV12ProductionRecoveryNativeExecutor(
  overrides: Partial<V12ProductionRecoveryNativeDependencies> = {},
): V12ProductionRecoveryExecutor {
  const dependencies = Object.freeze({ ...productionDependencies, ...overrides });
  return Object.freeze({
    async arm(input) {
      const names = databaseNames(input);
      const resources = new Set<RecoveryClosable>();
      let armed = false;
      const observeSetup = async <Result>(stage: string, work: () => Promise<Result>): Promise<Result> => {
        const report = (status: string) => { try { input.setupStage?.(`${stage}:${status}`); } catch { /* observation only */ } };
        report("start");
        try { const result = await work(); report("done"); return result; }
        catch (error) { report("failed"); throw error; }
      };
      try {
        await observeSetup("delete", () => deleteRecoveryDatabases(names, dependencies.deleteDatabase));
        const operation = operationForStep(input.caseId, input.stepId);
        const target = await observeSetup("migrate-target", () => dependencies.migrateDatabase(names.target));
        resources.add(target);
        const source = operation === "secure-restore-commit" || operation === "secure-merge-commit"
          ? await observeSetup("migrate-source", () => dependencies.migrateDatabase(names.source))
          : undefined;
        if (source !== undefined) resources.add(source);
        await observeSetup("seed", () => dependencies.setupDatabase(target, source, operation, input));
        await observeSetup("close-seed", () => closeRecoveryResources(resources));
        active(input);
        const baseline = await observeSetup("open-baseline", () => dependencies.openKernel(names.target));
        resources.add(baseline);
        const before = await observeSetup("read-baseline", () => dependencies.readSnapshot(baseline, operation, input));
        await observeSetup("close-baseline", () => closeRecoveryResources(resources));
        let runtime: Awaited<ReturnType<typeof openSqliteKernelTestRuntime>>;
        const armOnce = async (code: string) => {
          if (armed) throw new Error("v12_recovery_barrier_duplicate");
          const afterCut = await dependencies.readSnapshot(runtime.kernel, operation, input);
          await emitArmed(input, before, afterCut, code);
          armed = true;
          return holdOpen();
        };
        const observer: SqliteKernelTestObserver = UNCOMMITTED_CUTS.has(input.cutId)
          && !["pre-transaction", "retry"].includes(input.cutId)
          ? { beforeCommit: () => armOnce("transaction-open") }
          : input.cutId === "post-commit-before-ack"
            ? { afterCommit: () => armOnce("commit-durable-command-pending") }
            : input.cutId === "retry"
              ? { beforeCommit: async () => { throw new Error("v12_recovery_first_attempt_failed"); } }
              : {};
        runtime = await observeSetup("open-test-runtime", () => dependencies.openTestRuntime(names.target, observer));
        resources.add(runtime);
        if (input.cutId === "pre-transaction") {
          return await armOnce("writer-not-entered");
        }
        try {
          await dependencies.runOperation(runtime.kernel, operation, names.source, input);
        } catch (error) {
          if (input.cutId !== "retry" || !(error instanceof Error)
            || !String(error.cause ?? error.message).includes("v12_recovery_first_attempt_failed")) {
            throw error;
          }
          const afterCut = await dependencies.readSnapshot(runtime.kernel, operation, input);
          await emitArmed(input, before, afterCut, "first-attempt-failed");
          armed = true;
          return holdOpen();
        }
        if (input.cutId === "relaunch") {
          await closeRecoveryResources(resources);
          runtime = await dependencies.openTestRuntime(names.target);
          resources.add(runtime);
          return await armOnce("relaunch-runtime-open");
        }
        if (input.cutId === "recovery") {
          await dependencies.seedRecoveryEffect(runtime.kernel, input);
          await closeRecoveryResources(resources);
          runtime = await dependencies.openTestRuntime(names.target, {
            beforeCommit: () => armOnce("recovery-reconciliation-open"),
          });
          resources.add(runtime);
          await dependencies.runDomainRecovery(runtime.kernel, input);
          throw new Error("v12_recovery_barrier_not_reached");
        }
        if (input.cutId === "post-acknowledgement") {
          return await armOnce("acknowledgement-returned");
        }
        throw new Error("v12_recovery_barrier_not_reached");
      } finally {
        // A successful arm never reaches this close: the host kills the open
        // process at the nonce-bound ARMED barrier. Error paths close normally.
        if (!armed) await closeRecoveryResources(resources);
      }
    },

    async recover(input) {
      const names = databaseNames(input);
      const operation = operationForStep(input.caseId, input.stepId);
      const kernel = await openSqliteKernel(names.target);
      try {
        const afterReopen = await snapshot(kernel, operation, input);
        const recoveryCode = input.cutId === "recovery"
          ? await executeDomainRecovery(kernel, input)
          : "not-required";
        const afterRecovery = await snapshot(kernel, operation, input);
        const retryCode = await executeOperation(kernel, operation, names.source, input);
        const afterRetry = await snapshot(kernel, operation, input);
        const step = stepFor(input.caseId, input.stepId);
        return Object.freeze({
          step_id: step.id,
          boundary_id: step.boundaryId,
          receipt_kind: step.receiptKind,
          operation_id: operation,
          after_reopen: afterReopen,
          recovery_code: recoveryCode,
          after_recovery: afterRecovery,
          retry_code: retryCode,
          after_retry: afterRetry,
        });
      } finally {
        await kernel.close();
      }
    },

    async cleanup(input) {
      const names = databaseNames(input);
      await deleteRecoveryDatabases(names, dependencies.deleteDatabase);
    },
  });
}
