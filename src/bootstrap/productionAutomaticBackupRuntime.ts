import Constants from "expo-constants";

import {
  canonicalJson,
  parseDriveBackupManifestV1,
  type AutomaticBackupEnvironment,
  type DriveBackupSnapshotHeaderV1,
} from "../domains/backup/automaticBackupContracts";
import { createAutomaticBackupCoordinator } from "../domains/backup/automaticBackupCoordinator";
import { createAutomaticBackupScheduler, type AutomaticBackupScheduler } from "../domains/backup/automaticBackupScheduler";
import { createAutomaticPortableMergePort, createAutomaticPortableRestorePort } from "../domains/portability/automaticPortability";
import { parseLogicalBackupSnapshot, type LogicalBackupSnapshot } from "../domains/portability/backupContracts";
import { buildPortableMergePlan, type PortableMergePlan } from "../domains/portability/mergePlan";
import { createDriveBackupStoreAdapter } from "../platform/google/driveBackupStoreAdapter";
import { createFullPlanLogicalMergeWriter } from "../platform/sqlite/repositories/logicalMergeRepository";
import { createLogicalRestoreRepository } from "../platform/sqlite/repositories/logicalRestoreRepository";
import { createRestoreReconciliationRepository } from "../platform/sqlite/repositories/restoreReconciliationRepository";
import { createHistoryProjectionRepository } from "../platform/sqlite/repositories/historyProjectionRepository";
import { createExerciseSearchIndexRepository } from "../platform/sqlite/repositories/exerciseSearchIndexRepository";
import { createSqliteMergeLocalFactsPort, createSqliteRestoreCandidateProbe, createSqliteRestoreRetainedReferencePort, createSqliteRestoreSchemaPort } from "../platform/sqlite/repositories/restorePreflightAdapters";
import { createAutomaticBackupStateRepository } from "../platform/sqlite/repositories/automaticBackupStateRepository";
import type { SqliteKernel } from "../platform/sqlite";
import { createAutomaticBackupRuntime, type AutomaticBackupRuntime } from "./automaticBackupRuntime";
import { createProductionAutomaticSnapshotCapture } from "./productionAutomaticSnapshotCapture";

type Services = Readonly<{ runtime: AutomaticBackupRuntime; scheduler: AutomaticBackupScheduler }>;
const cache = new WeakMap<object, Services>();

function config(): Readonly<{ environment: "production" | "development-test"; webClientId: string }> {
  const extra = Constants.expoConfig?.extra;
  const environment = extra?.buildProfile;
  const webClientId = extra?.googleOAuth?.webClientId;
  if ((environment !== "production" && environment !== "development-test") || typeof webClientId !== "string") throw new Error("automatic_backup_google_config_invalid");
  return { environment, webClientId };
}
async function digest(value: string): Promise<string> {
  const { CryptoDigestAlgorithm, digestStringAsync } = require("expo-crypto") as typeof import("expo-crypto");
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
}
function id(prefix: string): string {
  const { randomUUID } = require("expo-crypto") as typeof import("expo-crypto");
  return `${prefix}-${randomUUID()}`;
}
function bytes(value: unknown): Uint8Array { return new TextEncoder().encode(canonicalJson(value)); }
function packageIdentity(environment: AutomaticBackupEnvironment): string {
  return environment === "production"
    ? "com.fchoo.gymtracker"
    : "com.fchoo.gymtracker.devtest";
}

async function snapshotFromDrive(
  value: Uint8Array,
  environment: AutomaticBackupEnvironment,
): Promise<LogicalBackupSnapshot> {
  const decoded = JSON.parse(new TextDecoder().decode(value)) as {
    header?: Partial<DriveBackupSnapshotHeaderV1>;
    payload?: unknown;
    payload_sha256?: unknown;
  };
  if (decoded.header?.protocol !== "drive-backup-v1"
    || decoded.header.environment !== environment
    || decoded.header.packageIdentity !== packageIdentity(environment)
    || typeof decoded.payload_sha256 !== "string") {
    throw new Error("automatic_recovery_snapshot_invalid");
  }
  const snapshot = parseLogicalBackupSnapshot(decoded.payload);
  const ownerNamespace = snapshot.tables.portable_owner_identity?.[0]?.owner_namespace;
  if (decoded.header.snapshotId !== snapshot.snapshotId
    || decoded.header.createdAtMs !== snapshot.createdAtMs
    || decoded.header.schemaVersion !== snapshot.schemaVersion
    || decoded.header.mutationGeneration === undefined
    || !Number.isSafeInteger(decoded.header.mutationGeneration)
    || decoded.header.mutationGeneration < 0
    || decoded.header.writerEpoch === undefined
    || !Number.isSafeInteger(decoded.header.writerEpoch)
    || decoded.header.writerEpoch < 1
    || decoded.header.ownerNamespace !== ownerNamespace
    || decoded.payload_sha256 !== await digest(canonicalJson({
      header: decoded.header,
      payload: decoded.payload,
    }))) {
    throw new Error("automatic_recovery_snapshot_invalid");
  }
  return snapshot;
}

export async function fetchGoogleDriveIdentity(
  token: string,
  request: typeof fetch = fetch,
): Promise<unknown> {
  const response = await request(
    "https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress)",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error("google_identity_lookup_failed");
  return response.json();
}

export function createProductionAutomaticBackupServices(kernel: SqliteKernel): Services {
  const previous = cache.get(kernel as object); if (previous !== undefined) return previous;
  const settings = config();
  const { createGoogleAuthAdapter } = require("../platform/google/googleAuthAdapter") as typeof import("../platform/google/googleAuthAdapter");
  const auth = createGoogleAuthAdapter({
    webClientId: settings.webClientId,
    about: fetchGoogleDriveIdentity,
  });
  const state = createAutomaticBackupStateRepository(kernel);
  const snapshotCapture = createProductionAutomaticSnapshotCapture({
    kernel,
  });
  const drive = createDriveBackupStoreAdapter({ environment: settings.environment, token: () => auth.accessToken() });
  const reconciliation = createRestoreReconciliationRepository(kernel, { history: createHistoryProjectionRepository(kernel), search: createExerciseSearchIndexRepository(kernel), nowMs: () => Date.now() });
  const restore = createAutomaticPortableRestorePort({
    schema: createSqliteRestoreSchemaPort(kernel), retainedReferences: createSqliteRestoreRetainedReferencePort(kernel), candidateProbe: createSqliteRestoreCandidateProbe(),
    localIsEmpty: async () => ((await createSqliteMergeLocalFactsPort(kernel).read()).tables.workout_sessions?.length ?? 0) === 0,
    claimIsCurrent: async () => (await state.read()).authorityState === "quarantine",
    restore: createLogicalRestoreRepository(kernel, { nowMs: () => Date.now() }).restore,
    rebuild: async () => { await reconciliation.reconcileAndRebuild(); },
  });
  const mergeTokens = new Map<string, Readonly<{ plan: PortableMergePlan; fingerprint: string; grant?: string }>>();
  const merge = createAutomaticPortableMergePort({
    schema: createSqliteRestoreSchemaPort(kernel), retainedReferences: createSqliteRestoreRetainedReferencePort(kernel), candidateProbe: createSqliteRestoreCandidateProbe(), isWorkoutActive: () => false,
    local: async () => { const local = await createSqliteMergeLocalFactsPort(kernel).read(); return { version: 2 as const, schemaVersion: local.schemaVersion, tables: local.tables }; },
    archive: (snapshot) => ({ version: 2 as const, schemaVersion: snapshot.schemaVersion, tables: snapshot.tables }),
    build: ({ archive, local }) => buildPortableMergePlan({ archive, local, payloadDigest: digest }),
    fingerprint: async () => digest(canonicalJson(await createSqliteMergeLocalFactsPort(kernel).read())),
    issue: (value) => { const token = id("automatic-merge"); mergeTokens.set(token, value); return token; },
    consume: (token) => { const value = mergeTokens.get(token) ?? null; mergeTokens.delete(token); return value; },
    commitPlan: (value) => createFullPlanLogicalMergeWriter(kernel, { sha256: digest }).commitFullPlan({ localFingerprint: value.fingerprint, plan: value.plan }),
    rebuild: async () => { await reconciliation.reconcileAndRebuild(); },
  });
  const coordinator = createAutomaticBackupCoordinator({
    isWorkoutActive: () => false, auth, state, drive, nowMs: () => Date.now(), candidateId: () => id("attempt"),
    reportFailure: (stage) => console.warn(`[automatic-backup] deferred:${stage}`),
    capture: async ({ environment, writerEpoch }) => {
      const captured = await snapshotCapture.capture({ snapshotId: id("snapshot"), createdAtMs: Date.now() });
      const ownerNamespace = captured.snapshot.tables.portable_owner_identity?.[0]?.owner_namespace;
      if (typeof ownerNamespace !== "string") throw new Error("automatic_backup_owner_missing");
      const header: DriveBackupSnapshotHeaderV1 = Object.freeze({
        protocol: "drive-backup-v1",
        environment,
        packageIdentity: packageIdentity(environment),
        snapshotId: captured.snapshot.snapshotId,
        ownerNamespace,
        writerEpoch,
        mutationGeneration: captured.generation,
        createdAtMs: captured.snapshot.createdAtMs,
        schemaVersion: captured.snapshot.schemaVersion,
      });
      const payload = captured.snapshot;
      const envelope = Object.freeze({
        header,
        payload,
        payload_sha256: await digest(canonicalJson({ header, payload })),
      });
      const encodedJson = canonicalJson(envelope);
      return {
        generation: captured.generation,
        sourceDigest: await digest(encodedJson),
        bytes: new TextEncoder().encode(encodedJson),
      };
    },
    validate: async (value) => {
      try { await snapshotFromDrive(value, settings.environment); return true; }
      catch { return false; }
    },
    validateManifest: (value) => {
      try {
        const parsed = parseDriveBackupManifestV1(JSON.parse(new TextDecoder().decode(value)));
        return parsed.kind === "active"
          ? { writerEpoch: parsed.writerEpoch, latest: parsed.latest }
          : null;
      } catch { return null; }
    },
    buildManifest: ({ candidateId, state: current, captured, previous }) => bytes({ kind: "active", writer_epoch: current.writerEpoch, latest: { fileId: candidateId, object_sha256: captured.sourceDigest }, previous }),
    recovery: {
      parseSnapshot: (value) => snapshotFromDrive(value, settings.environment),
      localIsEmpty: async () => ((await createSqliteMergeLocalFactsPort(kernel).read()).tables.workout_sessions?.length ?? 0) === 0,
      prepareMerge: async (snapshot) => {
        const local = await createSqliteMergeLocalFactsPort(kernel).read();
        const remoteOwner = snapshot.tables.portable_owner_identity?.[0]?.owner_namespace;
        const adoptionRequired = typeof remoteOwner === "string" && remoteOwner !== local.ownerNamespace;
        const prepared = await merge.preflight(snapshot, adoptionRequired ? { token: "fresh-auth-required" } : undefined);
        return { token: prepared.token, ownerSummary: adoptionRequired ? "A different backup identity" : "This backup identity", adoptionRequired };
      },
      restore: (snapshot) => restore.restore(snapshot),
      commitMerge: ({ token, adoptionGrant }) => merge.commit(token),
      freshAdoptionGrant: async () => { const identity = await auth.reauthenticate(); if (identity === null) throw new Error("automatic_recovery_reauthentication_cancelled"); return "fresh-auth-required"; },
    },
  });
  const backupAfterBootstrapDiscovery = async (): Promise<void> => {
    const current = await state.read();
    if (current.permissionId !== null && current.authorityState === "quarantine" && current.manifestId === null) {
      const recovery = await coordinator.checkAgain();
      if (recovery.status !== "needs_bootstrap" && recovery.status !== "ready") return;
    }
    await coordinator.backup();
  };
  const scheduler = createAutomaticBackupScheduler({
    isWorkoutActive: async () => (await kernel.queryAll("SELECT 1 FROM workout_sessions WHERE status = 'in_progress' LIMIT 1")).length !== 0,
    eligible: async () => {
      const current = await state.read();
      return current.authorityState === "active"
        || (current.authorityState === "quarantine" && current.manifestId === null);
    },
    queue: (work) => queueMicrotask(work), run: backupAfterBootstrapDiscovery,
  });
  const runtime = createAutomaticBackupRuntime({ read: async () => {
    const current = await state.read();
    return { status: current.permissionId === null ? "not_connected" as const : current.statusCode === "restore_pending" ? "restore_pending" as const : current.statusCode === "restoring" ? "restoring" as const : current.authorityState === "stale_writer" || current.statusCode === "paused" ? "paused" as const : current.mutationGeneration > current.backedUpGeneration ? "backup_pending" as const : "idle" as const, accountLabel: current.accountDisplayLabel, lastSuccessfulBackupAtMs: current.lastSuccessMs, mutationGeneration: current.mutationGeneration, backedUpGeneration: current.backedUpGeneration, pendingSinceMs: current.dirtySinceMs, nowMs: Date.now(), dataUsePolicy: current.dataUsePolicy === "wifi-only" ? "wifi_only" as const : "wifi_and_cellular" as const, reason: current.authorityState === "stale_writer" ? "stale_writer" as const : null };
  }, commands: {
    connect: async () => {
      const result = await coordinator.connect();
      if (result.status === "needs_bootstrap") await coordinator.backup();
    }, deferRestore: () => coordinator.deferRecovery(), cancelChecking: () => coordinator.abortChecking(), checkAgain: async () => { await coordinator.checkAgain(); }, continueRestore: async () => undefined, prepareRecovery: (input) => coordinator.prepareRecovery(input), commitRecovery: async (input) => { await coordinator.commitRecovery(input); }, finishSetup: async () => undefined,
    backupNow: backupAfterBootstrapDiscovery, retryBackup: backupAfterBootstrapDiscovery, useCellularThisTime: backupAfterBootstrapDiscovery, setDataUsePolicy: async (policy) => state.setDataUsePolicy(policy === "wifi_only" ? "wifi-only" : "any-network"), takeOver: async () => coordinator.checkAgain().then(() => undefined), disconnect: () => coordinator.disconnect(),
    deleteCloudBackup: async () => { throw new Error("automatic_delete_requires_tombstone_confirmation"); }, finishDeletingCloudBackup: async () => { await coordinator.finishDeletionSweep(); }, startNewCloudBackup: async () => { await coordinator.checkAgain(); scheduler.request("manual"); },
  } });
  const services = Object.freeze({ runtime, scheduler }); cache.set(kernel as object, services); return services;
}
