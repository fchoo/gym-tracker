import Constants from "expo-constants";
import { fetch as expoFetch } from "expo/fetch";

import {
  canonicalJson,
  AUTOMATIC_BACKUP_LIMITS,
  parseDriveBackupSnapshotEnvelopeV1,
  parseDriveBackupManifestV1,
  type AutomaticBackupEnvironment,
  type DriveBackupSnapshotHeaderV1,
} from "../domains/backup/automaticBackupContracts";
import { createAutomaticBackupCoordinator } from "../domains/backup/automaticBackupCoordinator";
import type { AutomaticRecoverySnapshotDescriptor } from "../domains/backup/automaticBackupCoordinator";
import { createAutomaticBackupScheduler, type AutomaticBackupScheduler } from "../domains/backup/automaticBackupScheduler";
import { createAutomaticPortableMergePort, createAutomaticPortableRestorePort } from "../domains/portability/automaticPortability";
import { parseLogicalBackupSnapshot, type LogicalBackupRow, type LogicalBackupSnapshot } from "../domains/portability/backupContracts";
import { buildPortableMergePlan, type PortableMergePlan } from "../domains/portability/mergePlan";
import type { AutomaticNamespaceAdoptionCommit } from "../domains/portability/mergeCommands";
import { createDriveBackupStoreAdapter, type DriveFetch } from "../platform/google/driveBackupStoreAdapter";
import { createFullPlanLogicalMergeWriter } from "../platform/sqlite/repositories/logicalMergeRepository";
import { createLogicalRestoreRepository } from "../platform/sqlite/repositories/logicalRestoreRepository";
import { createRestoreReconciliationRepository } from "../platform/sqlite/repositories/restoreReconciliationRepository";
import { createHistoryProjectionRepository } from "../platform/sqlite/repositories/historyProjectionRepository";
import { createExerciseSearchIndexRepository } from "../platform/sqlite/repositories/exerciseSearchIndexRepository";
import { createSqliteMergeLocalFactsPort, createSqliteRestoreCandidateProbe, createSqliteRestoreRetainedReferencePort, createSqliteRestoreSchemaPort } from "../platform/sqlite/repositories/restorePreflightAdapters";
import { createAutomaticBackupStateRepository } from "../platform/sqlite/repositories/automaticBackupStateRepository";
import type { AutomaticBackupState } from "../platform/sqlite/repositories/automaticBackupStateRepository";
import type { SqliteKernel } from "../platform/sqlite";
import { currentNetworkClass } from "../../modules/network-classifier/src";
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
export function assertAutomaticDriveSnapshotBytes(value: Uint8Array): Uint8Array {
  if (value.byteLength > AUTOMATIC_BACKUP_LIMITS.maxSnapshotBytes) {
    throw new Error("automatic_backup_snapshot_too_large");
  }
  return value;
}
export function productionAutomaticBackupPresentationInput(
  current: AutomaticBackupState,
  recoveryPrompt: ReturnType<ReturnType<typeof createAutomaticBackupCoordinator>["recoveryPrompt"]>,
  mergeReview: boolean,
  nowMs: number,
  cellularConfirmationRequired = false,
) {
  const deleted = current.authorityState === "deleted";
  const progressStage = current.statusCode === "checking" ? "Checking backup" as const
    : current.statusCode === "restoring" ? "Restoring on this phone" as const
      : current.statusCode === "finishing" ? "Finishing backup setup" as const : null;
  const status = current.permissionId === null ? "not_connected" as const
    : deleted ? "paused" as const
      : current.statusCode === "checking" || current.statusCode === "restore_pending" ? "restore_pending" as const
        : current.statusCode === "restoring" || current.statusCode === "finishing" ? "restoring" as const
          : current.authorityState === "stale_writer" || current.statusCode === "paused" ? "paused" as const
            : current.mutationGeneration > current.backedUpGeneration ? "backup_pending" as const : "idle" as const;
  const reason = deleted ? (current.deletionProgress === "complete" ? "deleted" as const : "deletion_partial" as const)
    : recoveryPrompt?.kind === "update_required" ? "update_required" as const
      : mergeReview ? "merge_review" as const
        : cellularConfirmationRequired ? "cellular_confirmation_required" as const
        : current.authorityState === "stale_writer" ? "stale_writer" as const
          : current.authorityState === "quarantine" && current.manifestId === null ? "no_cloud" as const
            : current.authorityState === "quarantine" && recoveryPrompt === null ? "invalid_artifacts" as const
              : current.statusCode === "restore_pending" ? "restore_required" as const : null;
  return {
    status,
    accountLabel: current.accountDisplayLabel,
    lastSuccessfulBackupAtMs: current.lastSuccessMs,
    mutationGeneration: current.mutationGeneration,
    backedUpGeneration: current.backedUpGeneration,
    pendingSinceMs: current.dirtySinceMs,
    nowMs,
    dataUsePolicy: current.dataUsePolicy === "wifi-only" ? "wifi_only" as const : "wifi_and_cellular" as const,
    recoveryPrompt,
    progressStage,
    reason,
  };
}
function packageIdentity(environment: AutomaticBackupEnvironment): string {
  return environment === "production"
    ? "com.fchoo.gymtracker"
    : "com.fchoo.gymtracker.devtest";
}

export function localPortableFactsAreEmpty(
  tables: Readonly<Record<string, readonly LogicalBackupRow[]>>,
): boolean {
  return Object.entries(tables).every(([table, rows]) =>
    table === "portable_owner_identity" || rows.length === 0);
}

async function snapshotFromDrive(
  value: Uint8Array,
  environment: AutomaticBackupEnvironment,
  descriptor?: AutomaticRecoverySnapshotDescriptor,
): Promise<LogicalBackupSnapshot> {
  const objectSha256 = descriptor?.objectSha256 ?? await digest(new TextDecoder().decode(value));
  const parsed = await parseDriveBackupSnapshotEnvelopeV1(value, {
    byteLength: descriptor?.byteLength ?? value.byteLength,
    objectSha256,
    environment,
    packageIdentity: packageIdentity(environment),
    currentSchemaVersion: 26,
    sha256: async (input) => digest(typeof input === "string" ? input : new TextDecoder().decode(input)),
  });
  if (parsed.kind === "update_required") throw new Error("automatic_recovery_update_required");
  const snapshot = parseLogicalBackupSnapshot(parsed.payload);
  const ownerNamespace = snapshot.tables.portable_owner_identity?.[0]?.owner_namespace;
  if (parsed.header.snapshotId !== snapshot.snapshotId
    || parsed.header.createdAtMs !== snapshot.createdAtMs
    || parsed.header.schemaVersion !== snapshot.schemaVersion
    || parsed.header.ownerNamespace !== ownerNamespace) {
    throw new Error("automatic_recovery_snapshot_invalid");
  }
  if (descriptor !== undefined && (parsed.header.snapshotId !== descriptor.snapshotId
    || parsed.header.writerEpoch !== descriptor.writerEpoch
    || parsed.header.mutationGeneration !== descriptor.mutationGeneration)) {
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
  const drive = createDriveBackupStoreAdapter({
    environment: settings.environment,
    token: () => auth.accessToken(),
    fetch: expoFetch as DriveFetch,
    reportFailure: (stage, status) => console.warn(`[automatic-backup] drive:${stage}:${status ?? "none"}`),
  });
  const reconciliation = createRestoreReconciliationRepository(kernel, { history: createHistoryProjectionRepository(kernel), search: createExerciseSearchIndexRepository(kernel), nowMs: () => Date.now() });
  const localFacts = createSqliteMergeLocalFactsPort(kernel);
  const localIsEmpty = async () => localPortableFactsAreEmpty((await localFacts.read()).tables);
  const isWorkoutActive = async () => (await kernel.queryAll(
    "SELECT 1 FROM workout_sessions WHERE status = 'in_progress' LIMIT 1",
  )).length !== 0;
  const restore = createAutomaticPortableRestorePort({
    schema: createSqliteRestoreSchemaPort(kernel), retainedReferences: createSqliteRestoreRetainedReferencePort(kernel), candidateProbe: createSqliteRestoreCandidateProbe(),
    isWorkoutActive, localIsEmpty,
    claimIsCurrent: async () => (await state.read()).authorityState === "quarantine",
    restore: createLogicalRestoreRepository(kernel, { nowMs: () => Date.now() }).restore,
    rebuild: async () => { await reconciliation.reconcileAndRebuild(); },
  });
  const mergeTokens = new Map<string, Readonly<{
    plan: PortableMergePlan;
    fingerprint: string;
    adoption?: Readonly<Pick<AutomaticNamespaceAdoptionCommit, "oldNamespace" | "newNamespace" | "remoteSnapshotSha256">>;
  }>>();
  const merge = createAutomaticPortableMergePort({
    schema: createSqliteRestoreSchemaPort(kernel), retainedReferences: createSqliteRestoreRetainedReferencePort(kernel), candidateProbe: createSqliteRestoreCandidateProbe(), isWorkoutActive,
    local: async () => { const local = await createSqliteMergeLocalFactsPort(kernel).read(); return { version: 2 as const, schemaVersion: local.schemaVersion, tables: local.tables }; },
    archive: (snapshot) => ({ version: 2 as const, schemaVersion: snapshot.schemaVersion, tables: snapshot.tables }),
    build: ({ archive, local }) => buildPortableMergePlan({ archive, local, payloadDigest: digest }),
    fingerprint: async () => digest(canonicalJson(await createSqliteMergeLocalFactsPort(kernel).read())),
    snapshotDigest: async (snapshot) => digest(canonicalJson(snapshot)),
    nowMs: () => Date.now(),
    issue: (value) => { const token = id("automatic-merge"); mergeTokens.set(token, value); return token; },
    consume: (token) => { const value = mergeTokens.get(token) ?? null; mergeTokens.delete(token); return value; },
    commitPlan: (value) => createFullPlanLogicalMergeWriter(kernel, { sha256: digest }).commitFullPlan({
      localFingerprint: value.fingerprint,
      plan: value.plan,
      ...(value.adoption === undefined ? {} : { adoption: value.adoption }),
    }),
    rebuild: async () => { await reconciliation.reconcileAndRebuild(); },
  });
  const coordinator = createAutomaticBackupCoordinator({
    isWorkoutActive, auth, state, drive, nowMs: () => Date.now(), candidateId: () => id("attempt"),
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
      const encoded = assertAutomaticDriveSnapshotBytes(new TextEncoder().encode(encodedJson));
      return {
        generation: captured.generation,
        sourceDigest: await digest(encodedJson),
        bytes: encoded,
        snapshotId: captured.snapshot.snapshotId,
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
          ? { writerEpoch: parsed.writerEpoch, latest: parsed.latest, previous: parsed.previous }
          : null;
      } catch { return null; }
    },
    buildManifest: ({ candidateId, state: current, captured, previous }) => bytes({
      kind: "active",
      writer_epoch: current.writerEpoch,
      latest: {
        fileId: candidateId,
        object_sha256: captured.sourceDigest,
        byteLength: captured.bytes.byteLength,
        snapshotId: captured.snapshotId,
        writerEpoch: current.writerEpoch,
        mutationGeneration: captured.generation,
      },
      previous,
    }),
    recovery: {
      parseSnapshot: (value, descriptor) => snapshotFromDrive(value, settings.environment, descriptor),
      localIsEmpty,
      prepareMerge: async (snapshot) => {
        const local = await createSqliteMergeLocalFactsPort(kernel).read();
        const remoteOwner = snapshot.tables.portable_owner_identity?.[0]?.owner_namespace;
        const adoptionRequired = typeof remoteOwner === "string" && remoteOwner !== local.ownerNamespace;
        const prepared = await merge.preflight(snapshot);
        return { token: prepared.token, ownerSummary: adoptionRequired ? "A different backup identity" : "This backup identity", adoptionRequired: prepared.adoptionRequired };
      },
      restore: (snapshot) => restore.restore(snapshot),
      commitMerge: ({ token, adoptionGrant }) => merge.commit(token, adoptionGrant),
      freshAdoptionGrant: async () => {
        const identity = await auth.reauthenticate();
        if (identity === null) throw new Error("automatic_recovery_reauthentication_cancelled");
        const current = await state.read();
        if (current.permissionId !== identity.permissionId) throw new Error("automatic_recovery_account_changed");
        return Object.freeze({
          receiptId: id("namespace-adoption"),
          permissionId: identity.permissionId,
          connectionGeneration: current.connectionGeneration,
          environment: current.environment,
          expiresAtMs: Date.now() + 5 * 60 * 1000,
        });
      },
      discoverCandidates: async () => {
        const objects = (await drive.discover()).filter((entry) => entry.appProperties.object_kind === "snapshot");
        const candidates = [];
        for (const object of objects) {
          const value = await drive.download(object.fileId, 24 * 1024 * 1024);
          const objectSha256 = await digest(new TextDecoder().decode(value));
          try {
            const parsed = await parseDriveBackupSnapshotEnvelopeV1(value, {
              byteLength: value.byteLength, objectSha256, environment: settings.environment,
              packageIdentity: packageIdentity(settings.environment), currentSchemaVersion: 26,
              sha256: async (input) => digest(typeof input === "string" ? input : new TextDecoder().decode(input)),
            });
            if (parsed.kind === "update_required") {
              candidates.push({ kind: "update_required" as const, schemaVersion: parsed.header.schemaVersion, fileId: object.fileId });
            } else {
              candidates.push({ kind: "current" as const, ownerNamespace: parsed.header.ownerNamespace,
                writerEpoch: parsed.header.writerEpoch, mutationGeneration: parsed.header.mutationGeneration,
                createdAtMs: parsed.header.createdAtMs, fileId: object.fileId, objectSha256, byteLength: value.byteLength });
            }
          } catch { /* malformed scan candidates remain quarantined */ }
        }
        return candidates;
      },
      reconstructManifest: async (selection, existing) => {
        const manifestId = existing?.fileId ?? await drive.allocateFileId();
        const manifestBytes = bytes({
          kind: "active", writer_epoch: selection.latest.writerEpoch,
          latest: { fileId: selection.latest.fileId, object_sha256: selection.latest.objectSha256, byteLength: selection.latest.byteLength },
          previous: selection.previous === null ? null : { fileId: selection.previous.fileId, object_sha256: selection.previous.objectSha256, byteLength: selection.previous.byteLength },
        });
        if (existing === null) await drive.createManifest(manifestId, manifestBytes);
        else await drive.updateManifest(manifestId, manifestBytes, existing.etag);
      },
    },
  });
  const backupAfterBootstrapDiscovery = async (): Promise<void> => {
    const current = await state.read();
    if (current.authorityState === "deleted" && current.deletionProgress === "sweep_pending") {
      await coordinator.finishDeletionSweep();
      return;
    }
    if (current.permissionId !== null && current.authorityState === "quarantine" && current.manifestId === null) {
      const recovery = await coordinator.checkAgain();
      if (recovery.status !== "needs_bootstrap" && recovery.status !== "ready") return;
    }
    await coordinator.backup();
  };
  let publishBackupState = async (): Promise<void> => undefined;
  let cellularConfirmationRequired = false;
  const scheduler = createAutomaticBackupScheduler({
    isWorkoutActive,
    networkClass: currentNetworkClass,
    dataUsePolicy: async () => (await state.read()).dataUsePolicy,
    eligible: async () => {
      const current = await state.read();
      return (current.authorityState === "deleted" && current.deletionProgress === "sweep_pending")
        || current.authorityState === "active"
        || (current.authorityState === "quarantine" && current.manifestId === null);
    },
    queue: (work) => queueMicrotask(work), run: async () => {
      cellularConfirmationRequired = false;
      await backupAfterBootstrapDiscovery();
      await publishBackupState();
    },
    onCellularConfirmationRequired: () => {
      cellularConfirmationRequired = true;
      void publishBackupState();
    },
  });
  let recoveryReviewPending = false;
  const runtime = createAutomaticBackupRuntime({ read: async () => {
    const current = await state.read();
    const recoveryPrompt = coordinator.recoveryPrompt?.() ?? null;
    return productionAutomaticBackupPresentationInput(current, recoveryPrompt, recoveryReviewPending, Date.now(), cellularConfirmationRequired);
  }, commands: {
    connect: async () => {
      const result = await coordinator.connect();
      await publishBackupState();
      if (result.status === "needs_bootstrap") await coordinator.backup();
    }, deferRestore: () => coordinator.deferRecovery(), cancelChecking: () => coordinator.abortChecking(), checkAgain: async () => { await coordinator.checkAgain(); }, continueRestore: async () => {
      try {
        const preparation = await coordinator.prepareRecovery({ candidate: "latest" });
        if (preparation.kind !== "empty_direct") throw new Error("automatic_recovery_review_required");
        await coordinator.commitRecovery({ kind: "empty_direct", attemptId: preparation.attemptId });
        scheduler.request("post_commit");
      } catch (error) {
        await coordinator.deferRecovery();
        console.warn(`[automatic-backup] recovery:${error instanceof Error ? error.message : "unknown"}`);
        throw error;
      }
    }, prepareRecovery: async (input) => { const result = await coordinator.prepareRecovery(input); recoveryReviewPending = result.kind === "merge"; return result; }, commitRecovery: async (input) => { await coordinator.commitRecovery(input); recoveryReviewPending = false; }, cancelRecovery: async (attemptId) => { await coordinator.cancelRecovery(attemptId); recoveryReviewPending = false; }, finishSetup: async () => { await coordinator.takeOver(); },
    backupNow: async () => { cellularConfirmationRequired = false; scheduler.request("manual"); }, retryBackup: async () => { cellularConfirmationRequired = false; scheduler.request("retry"); }, useCellularThisTime: async () => { cellularConfirmationRequired = false; scheduler.request("manual_cellular"); }, setDataUsePolicy: async (policy) => state.setDataUsePolicy(policy === "wifi_only" ? "wifi-only" : "any-network"), takeOver: async () => coordinator.takeOver().then(() => undefined), disconnect: () => coordinator.disconnect(),
    deleteCloudBackup: async () => { scheduler.cancel(); await coordinator.deleteCloudBackup(); }, finishDeletingCloudBackup: async () => { await coordinator.finishDeletionSweep(); }, startNewCloudBackup: async () => { const result = await coordinator.startNewCloudBackup(); if (result.status === "ready") scheduler.request("manual"); },
  } });
  publishBackupState = () => runtime.refresh();
  const services = Object.freeze({ runtime, scheduler }); cache.set(kernel as object, services); return services;
}
