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
import { completeSet, updateActiveSetDraft } from "../domains/workout/setCommands";
import { startWorkout } from "../domains/workout/startWorkout";
import {
  saveZeroSetWorkout,
  ZERO_SET_CONFIRMATION,
} from "../domains/workout/finishWorkout";
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

type OperationId =
  | "workout-complete-set"
  | "garmin-import"
  | "garmin-match"
  | "secure-restore"
  | "secure-merge";

const UNCOMMITTED_CUTS = new Set(["pre-transaction", "in-transaction"]);
const ACK_LOSS_CUTS = new Set(["post-commit-before-ack", "recovery"]);
const PASSWORD = "synthetic-recovery-password";

const sha256 = (value: string): Promise<string> =>
  digestStringAsync(CryptoDigestAlgorithm.SHA256, value);

function active(input: V12RecoveryExecutionIdentity): void {
  if (input.signal.aborted) throw new Error("v12_recovery_cancelled");
}

function databaseNames(input: V12RecoveryExecutionIdentity) {
  const suffix = `${input.nonce}-${input.caseId}-${input.cutId}`;
  return Object.freeze({
    target: `v12-recovery-${suffix}.db`,
    source: `v12-recovery-source-${suffix}.db`,
  });
}

function operationFor(caseId: string): OperationId {
  if (caseId === "restore") return "secure-restore";
  if (caseId === "merge") return "secure-merge";
  if (caseId === "zero-cue") return "garmin-import";
  if (caseId === "relaunch") return "garmin-match";
  return "workout-complete-set";
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

async function seedActiveWorkout(
  kernel: SqliteKernel,
  input: V12RecoveryExecutionIdentity,
): Promise<void> {
  const fixture = parseFullBodyFoundation(fullBodyFoundationAsset);
  const startedAtMs = baseTime(input.caseId);
  const plans = createPlansWorkoutRepository(kernel);
  const activation = await activateStarterPlan({
    fixture,
    repository: plans,
    activatedAtMs: startedAtMs - 1_000,
    startLocalDate: "2027-01-15",
    timezone: "UTC",
  });
  const session = await startWorkout({
    repository: plans,
    request: {
      mode: "scheduled",
      planId: activation.plan.id,
      planDayId: activation.days[0]!.id,
      localDate: "2027-01-15",
      timezone: "UTC",
      startedAtMs,
    },
  });
  const workout = createWorkoutRepository(kernel);
  const activeWorkout = await workout.getActiveWorkout(session.id);
  const set = activeWorkout.currentExercise.workingSets[0];
  if (set === undefined || set.metricIdentity.profile !== "load_reps") {
    throw new Error("v12_recovery_set_missing");
  }
  await updateActiveSetDraft({
    repository: workout,
    input: {
      sessionId: session.id,
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
  const session = await startWorkout({
    repository: createPlansWorkoutRepository(kernel),
    request: {
      mode: "empty",
      localDate: "2027-01-15",
      timezone: "UTC",
      startedAtMs,
    },
  });
  await saveZeroSetWorkout({
    repository: createWorkoutOutcomeRepository(kernel),
    input: {
      sessionId: session.id,
      expectedSessionRevision: 1,
      endedAtMs: startedAtMs + 1_000,
      confirmation: ZERO_SET_CONFIRMATION,
    },
  });
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO workout_receipts(id, workout_session_id, request_sha256, committed_at_ms) VALUES (?, ?, ?, ?)",
      [completionKey(input), session.id, await sha256(completionKey(input)), startedAtMs + 1_000],
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
  if (operation === "workout-complete-set") {
    await seedActiveWorkout(target, input);
    return;
  }
  if (operation === "garmin-match") {
    await seedGarminMatch(target, input);
    return;
  }
  if (operation === "secure-restore" || operation === "secure-merge") {
    if (source === undefined) throw new Error("v12_recovery_source_missing");
    await seedPortableArchiveSource(source, input);
  }
}

async function executeOperation(
  kernel: SqliteKernel,
  operation: OperationId,
  sourceName: string,
  input: V12RecoveryExecutionIdentity,
): Promise<string> {
  active(input);
  if (operation === "workout-complete-set") return completeWorkoutSet(kernel, input);
  if (operation === "garmin-import") return executeGarminImport(kernel, input);
  if (operation === "garmin-match") return executeGarminMatch(kernel, input);
  if (operation === "secure-restore") return executeRestore(kernel, sourceName, input);
  return executeMerge(kernel, sourceName, input);
}

async function observationRows(
  kernel: SqliteKernel,
  operation: OperationId,
): Promise<Readonly<{
  source: readonly Record<string, unknown>[];
  receipt: readonly Record<string, unknown>[];
  effect: readonly Record<string, unknown>[];
  pointer: readonly Record<string, unknown>[];
  rest: readonly Record<string, unknown>[];
  history: readonly Record<string, unknown>[];
  timing: readonly Record<string, unknown>[];
}>> {
  const common = Promise.all([
    kernel.queryAll<Record<string, unknown>>(
      "SELECT effect_type, subject_id, expected_revision, status FROM pending_effects ORDER BY id",
    ),
    kernel.queryAll<Record<string, unknown>>(
      "SELECT status, revision, active_session_exercise_id, active_set_id FROM workout_sessions ORDER BY id",
    ),
    kernel.queryAll<Record<string, unknown>>(
      "SELECT status, revision, next_set_id FROM session_rest_states ORDER BY session_id",
    ),
    kernel.queryAll<Record<string, unknown>>(
      "SELECT event_type, effective_revision FROM history_audit_events ORDER BY id",
    ),
    kernel.queryAll<Record<string, unknown>>(
      "SELECT state_version, mode, revision FROM session_advanced_timing_states ORDER BY session_id",
    ),
  ]);
  let source: readonly Record<string, unknown>[];
  let receipt: readonly Record<string, unknown>[];
  if (operation === "workout-complete-set") {
    [source, receipt] = await Promise.all([
      kernel.queryAll("SELECT status, revision FROM session_sets WHERE completion_idempotency_key IS NOT NULL ORDER BY id"),
      kernel.queryAll("SELECT completion_idempotency_key, completed_at_ms FROM session_sets WHERE completion_idempotency_key IS NOT NULL ORDER BY id"),
    ]);
  } else if (operation === "garmin-import") {
    [source, receipt] = await Promise.all([
      kernel.queryAll("SELECT aggregate_revision, removal_state FROM imported_activity_identities ORDER BY activity_id"),
      kernel.queryAll("SELECT request_sha256, committed_at_ms FROM imported_activity_receipts ORDER BY id"),
    ]);
  } else if (operation === "garmin-match") {
    [source, receipt] = await Promise.all([
      kernel.queryAll("SELECT relation_revision FROM running_activity_current_matches ORDER BY activity_id"),
      kernel.queryAll("SELECT request_sha256, relation_revision, result_kind FROM running_activity_match_receipts ORDER BY request_id"),
    ]);
  } else if (operation === "secure-restore") {
    [source, receipt] = await Promise.all([
      kernel.queryAll("SELECT status, revision, portable_id, merge_modified_at_ms FROM workout_sessions ORDER BY id"),
      kernel.queryAll("SELECT request_sha256, committed_at_ms FROM workout_receipts ORDER BY id"),
    ]);
  } else {
    source = await kernel.queryAll(
      "SELECT status, revision, portable_id, merge_modified_at_ms FROM workout_sessions ORDER BY id",
    );
    receipt = source.map((row) => ({
      portable_id: row.portable_id,
      merge_modified_at_ms: row.merge_modified_at_ms,
    }));
  }
  const [effect, pointer, rest, history, timing] = await common;
  return Object.freeze({ source, receipt, effect, pointer, rest, history, timing });
}

async function snapshot(
  kernel: SqliteKernel,
  operation: OperationId,
): Promise<V12RecoveryDurableSnapshot> {
  const rows = await observationRows(kernel, operation);
  const [sourceSha, receiptSha, effectSha, pointerSha, restSha, historySha, timingSha] =
    await Promise.all([
      digestRows(rows.source), digestRows(rows.receipt), digestRows(rows.effect),
      digestRows(rows.pointer), digestRows(rows.rest), digestRows(rows.history),
      digestRows(rows.timing),
    ]);
  return Object.freeze({
    source_count: rows.source.length,
    receipt_count: rows.receipt.length,
    effect_count: rows.effect.length,
    pointer_count: rows.pointer.length,
    rest_count: rows.rest.length,
    history_count: rows.history.length,
    timing_count: rows.timing.length,
    source_sha256: sourceSha,
    receipt_sha256: receiptSha,
    effect_sha256: effectSha,
    pointer_sha256: pointerSha,
    rest_sha256: restSha,
    history_sha256: historySha,
    timing_sha256: timingSha,
  });
}

function observerFor(cutId: string): SqliteKernelTestObserver {
  let injected = false;
  const once = async () => {
    if (!injected) {
      injected = true;
      throw new Error("v12_recovery_injected_cut");
    }
  };
  if (cutId === "in-transaction") return { beforeCommit: once };
  if (ACK_LOSS_CUTS.has(cutId)) return { afterCommit: once };
  return {};
}

export function createV12ProductionRecoveryNativeExecutor(): V12ProductionRecoveryExecutor {
  return Object.freeze({
    async arm(input) {
      const names = databaseNames(input);
      await Promise.all([
        deleteDatabaseAsync(names.target).catch(() => undefined),
        deleteDatabaseAsync(names.source).catch(() => undefined),
      ]);
      const operation = operationFor(input.caseId);
      const target = await migrate(names.target);
      const source = operation === "secure-restore" || operation === "secure-merge"
        ? await migrate(names.source)
        : undefined;
      try {
        await setup(target, source, operation, input);
      } finally {
        await source?.close();
        await target.close();
      }
      active(input);
      if (input.cutId === "pre-transaction") return;
      const runtime = await openSqliteKernelTestRuntime(
        names.target,
        observerFor(input.cutId),
      );
      try {
        await executeOperation(runtime.kernel, operation, names.source, input);
      } catch (error) {
        if (!UNCOMMITTED_CUTS.has(input.cutId)
          && !ACK_LOSS_CUTS.has(input.cutId)) {
          throw error;
        }
      } finally {
        await runtime.close();
      }
    },

    async recover(input) {
      const names = databaseNames(input);
      const operation = operationFor(input.caseId);
      const kernel = await openSqliteKernel(names.target);
      try {
        const afterReopen = await snapshot(kernel, operation);
        const retryCode = await executeOperation(kernel, operation, names.source, input);
        const afterRetry = await snapshot(kernel, operation);
        return Object.freeze({
          operation_id: operation,
          after_reopen: afterReopen,
          retry_code: retryCode,
          after_retry: afterRetry,
        });
      } finally {
        await kernel.close();
      }
    },

    async cleanup(input) {
      const names = databaseNames(input);
      await Promise.all([
        deleteDatabaseAsync(names.target),
        deleteDatabaseAsync(names.source).catch(() => undefined),
      ]);
    },
  });
}
