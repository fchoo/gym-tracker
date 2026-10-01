import { canonicalJson, parseDriveBackupManifestV1, type AutomaticBackupEnvironment, type DriveBackupManifestV1, type DriveBackupObjectDescriptorV1 } from "./automaticBackupContracts";
import type { GoogleAuthPort } from "./googleAuthPort";
type LogicalBackupSnapshot = any;

type RecoveryAdoptionGrant = Readonly<{
  receiptId: string;
  permissionId: string;
  connectionGeneration: number;
  environment: AutomaticBackupEnvironment;
  expiresAtMs: number;
}>;

type CapturedSnapshot = Readonly<{ generation: number; sourceDigest: string; bytes: Uint8Array; snapshotId?: string }>;
type ActiveManifestSummary = Readonly<{
  writerEpoch: number;
  latest?: DriveBackupObjectDescriptorV1;
  previous?: DriveBackupObjectDescriptorV1 | null;
}>;
type BackupState = Readonly<{
  environment: AutomaticBackupEnvironment; permissionId: string | null; connectionGeneration: number;
  writerEpoch: number; mutationGeneration: number; backedUpGeneration: number;
  manifestId?: string | null; manifestEtag?: string | null;
  authorityState?: "quarantine" | "active" | "stale_writer" | "deleted";
  deletionProgress?: "none" | "sweep_pending" | "complete";
}>;
type Receipt = Readonly<{
  environment: AutomaticBackupEnvironment; permissionId: string; connectionGeneration: number;
  writerEpoch: number; capturedGeneration: number; sourceDigest: string; snapshotId: string;
  manifestId: string; manifestEtag: string;
}>;
type BackupResult = Readonly<{ status: "backed_up" | "deferred" | "stale_writer"; generation?: number }>;
type PendingHandover = Readonly<{
  attemptId: string; environment: AutomaticBackupEnvironment; permissionId: string;
  connectionGeneration: number; manifestId: string; manifestEtag: string;
  remoteWriterEpoch: number; snapshotId: string; sourceDigest: string;
}>;
type DeletionFence = Readonly<{
  environment: AutomaticBackupEnvironment;
  permissionId: string;
  connectionGeneration: number;
  manifestId: string;
  manifestEtag: string;
  successorWriterEpoch: number;
}>;
export type RecoverySnapshotCandidate = Readonly<
  | { kind: "update_required"; schemaVersion: number; fileId: string }
  | { kind: "current"; ownerNamespace: string; writerEpoch: number; mutationGeneration: number; createdAtMs: number; snapshotId: string; fileId: string; objectSha256: string; byteLength: number }
>;
export type RecoveryLineageSelection = Readonly<
  | { kind: "quarantined" | "update_required" }
  | { kind: "verified"; latest: Extract<RecoverySnapshotCandidate, { kind: "current" }>; previous: Extract<RecoverySnapshotCandidate, { kind: "current" }> | null }
>;

export function selectRecoveryLineage(
  candidates: readonly RecoverySnapshotCandidate[],
): RecoveryLineageSelection {
  if (candidates.some((candidate) => candidate.kind === "update_required")) {
    return Object.freeze({ kind: "update_required" as const });
  }
  const current = candidates.filter((candidate): candidate is Extract<RecoverySnapshotCandidate, { kind: "current" }> => candidate.kind === "current");
  if (current.length === 0 || current.length > 8) return Object.freeze({ kind: "quarantined" as const });
  const lineages = new Set(current.map((candidate) => `${candidate.ownerNamespace}\0${candidate.writerEpoch}`));
  if (lineages.size !== 1) return Object.freeze({ kind: "quarantined" as const });
  const sorted = [...current].sort((left, right) => right.mutationGeneration - left.mutationGeneration
    || right.createdAtMs - left.createdAtMs || left.fileId.localeCompare(right.fileId));
  if (sorted[1]?.mutationGeneration === sorted[0]?.mutationGeneration) return Object.freeze({ kind: "quarantined" as const });
  return Object.freeze({ kind: "verified" as const, latest: sorted[0]!, previous: sorted[1] ?? null });
}
export type AutomaticBackupFailureStage =
  | "active_manifest"
  | "snapshot_capture"
  | "snapshot_generation"
  | "file_id_allocation"
  | "attempt_persistence"
  | "snapshot_upload"
  | "snapshot_download"
  | "snapshot_validation"
  | "manifest_write"
  | "manifest_conflict"
  | "manifest_reread"
  | "writer_activation";
export type AutomaticRecoveryCandidate = "latest" | "previous";
export type AutomaticRecoverySnapshotDescriptor = Readonly<{
  fileId: string;
  objectSha256: string;
  byteLength: number;
  snapshotId: string;
  writerEpoch: number;
  mutationGeneration: number;
}>;
export type AutomaticRecoveryPreparation = Readonly<{ kind: "empty_direct"; attemptId: string } | { kind: "merge"; attemptId: string; token: string; ownerSummary: string; adoptionRequired: boolean }>;
export type AutomaticRecoveryCommit = Readonly<{ kind: "empty_direct"; attemptId: string } | { kind: "merge"; attemptId: string; confirmation: "MERGE"; adoptIdentity?: true; adoptionGrant?: string }>;

export type AutomaticBackupCoordinator = Readonly<{
  backup(): Promise<BackupResult>;
  /** The only connection path: One-Tap identity validation then read-only quarantine discovery. */
  connect(): Promise<Readonly<{ status: "ready" | "needs_bootstrap" | "quarantined" | "stale_writer" | "cancelled" }>>;
  checkAgain(): Promise<Readonly<{ status: "ready" | "needs_bootstrap" | "quarantined" | "stale_writer" | "cancelled" }>>;
  takeOver(): Promise<Readonly<{ status: "ready" | "needs_bootstrap" | "quarantined" | "stale_writer" | "cancelled" }>>;
  deferRecovery(): Promise<void>;
  abortChecking(): Promise<void>;
  disconnect(): Promise<void>;
  /** Re-discovers only the currently authenticated namespace after a tombstone is durable. */
  finishDeletionSweep(): Promise<Readonly<{ status: "complete" | "partial" | "cancelled" }>>;
  deleteCloudBackup(): Promise<Readonly<{ status: "complete" | "partial" | "cancelled" }>>;
  startNewCloudBackup(): Promise<Readonly<{ status: "ready" | "cancelled" }>>;
  /** Discovery is read-only; no quarantine path can publish or delete Drive data. */
  recover(): Promise<Readonly<{ status: "ready" | "needs_bootstrap" | "quarantined" | "stale_writer" }>>;
  prepareRecovery(input: Readonly<{ candidate: AutomaticRecoveryCandidate }>): Promise<AutomaticRecoveryPreparation>;
  commitRecovery(input: AutomaticRecoveryCommit): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>>;
  cancelRecovery(attemptId: string): Promise<void>;
  recoveryPrompt(): Readonly<{ kind: "latest" | "previous" | "update_required"; producedAtMs?: number; previousProducedAtMs?: number }> | null;
}>;

/**
 * The coordinator is deliberately transport-neutral. It owns the durable ordering
 * fence (candidate -> bounded reread -> If-Match -> reread -> local receipt),
 * while the app boundary supplies authenticated Drive ports and the canonical
 * snapshot collector. No caller awaits this from a workout mutation.
 */
export function createAutomaticBackupCoordinator(input: Readonly<{
  isWorkoutActive(): boolean | Promise<boolean>;
  auth?: Pick<GoogleAuthPort, "connect" | "disconnect"> & Partial<Pick<GoogleAuthPort, "reauthenticate">>;
  capture(input: Readonly<{
    environment: AutomaticBackupEnvironment;
    writerEpoch: number;
    snapshotId?: string;
  }>): Promise<CapturedSnapshot>;
  state: Readonly<{
    read(): Promise<BackupState>;
    persistAttempt(input: Receipt & Readonly<{ candidateId: string; nowMs: number }>): Promise<void>;
    readPendingUpload?(input: Readonly<{ environment: AutomaticBackupEnvironment; permissionId: string; connectionGeneration: number; writerEpoch: number }>): Promise<Readonly<Receipt & { candidateId: string; resumableLocation: string | null; resumableUploadedBytes: number; updatedAtMs: number }> | null>;
    updateResumableUpload?(input: Readonly<{ candidateId: string; location: string; uploadedBytes: number; nowMs: number }>): Promise<boolean>;
    acquireLease?(input: Readonly<{ leaseId: string; nowMs: number; expiresAtMs: number }>): Promise<boolean>;
    recoverExpiredLease?(nowMs: number): Promise<boolean>;
    releaseLease?(leaseId: string): Promise<boolean>;
    acknowledgeReceipt(input: Receipt): Promise<boolean>;
    beginQuarantine?(value: Readonly<{ environment: AutomaticBackupEnvironment; permissionId: string; connectionGeneration: number; accountDisplayLabel?: string | null }>): Promise<void>;
    activateWriter?(value: Readonly<{ manifestId: string; manifestEtag: string; writerEpoch: number; permissionId: string; connectionGeneration: number }>): Promise<boolean>;
    markStaleWriter?(writerEpoch: number): Promise<boolean>;
    setRecoveryStatus?(status: "idle" | "checking" | "restore_pending" | "restoring" | "finishing" | "paused"): Promise<void>;
    disconnectLocal?(): Promise<void>;
    beginDeletionSweep?(value: DeletionFence): Promise<boolean>;
    completeDeletionSweep?(value: Pick<DeletionFence, "environment" | "permissionId" | "connectionGeneration">): Promise<boolean>;
    persistPendingHandover?(value: PendingHandover & Readonly<{ nowMs: number }>): Promise<void>;
    readPendingHandover?(): Promise<PendingHandover | null>;
  }>;
  drive: Readonly<{
    environment?: AutomaticBackupEnvironment;
    allocateFileId?(): Promise<string>;
    createSnapshot(candidateId: string, bytes: Uint8Array): Promise<string>;
    createManifest?(candidateId: string, bytes: Uint8Array): Promise<Readonly<{ fileId: string; etag: string }>>;
    download(fileId: string, maxBytes: number): Promise<Uint8Array>;
    updateManifest(manifestId: string, bytes: Uint8Array, etag: string): Promise<string>;
    readManifest(): Promise<Readonly<{ fileId?: string; bytes: Uint8Array; etag: string }> | null>;
    discover?(): Promise<readonly unknown[]>;
    createResumableSnapshot?(candidateId: string, bytes: Uint8Array): Promise<Readonly<{ location: string; uploadedBytes: number }>>;
    resumeSnapshot?(session: Readonly<{ location: string; uploadedBytes: number }>, bytes: Uint8Array): Promise<Readonly<{ location: string; uploadedBytes: number }> | string>;
    discoverSnapshotsForDeletion?(): Promise<readonly Readonly<{ fileId: string }>[]>;
    discoverSnapshotsForRetention?(): Promise<readonly Readonly<{ fileId: string; createdAtMs: number; etag: string }>[]>;
    trash?(fileId: string, expectedWriterEpoch: number, etag: string): Promise<void>;
    deleteTombstoned?(fileId: string): Promise<void>;
  }>;
  validate(bytes: Uint8Array): boolean | Promise<boolean>;
  nowMs(): number;
  candidateId(): string;
  validateManifest?(bytes: Uint8Array): ActiveManifestSummary | null;
  buildManifest?(value: Readonly<{
    candidateId: string;
    state: BackupState;
    captured: CapturedSnapshot;
    previous: ActiveManifestSummary["latest"] | null;
  }>): Uint8Array;
  reportFailure?(stage: AutomaticBackupFailureStage): void;
  recovery?: Readonly<{
    parseSnapshot(bytes: Uint8Array, descriptor: AutomaticRecoverySnapshotDescriptor): Promise<LogicalBackupSnapshot>;
    localIsEmpty(): Promise<boolean>;
    prepareMerge(snapshot: LogicalBackupSnapshot): Promise<Readonly<{ token: string; ownerSummary: string; adoptionRequired: boolean }>>;
    restore(snapshot: LogicalBackupSnapshot): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>>;
    commitMerge(input: Readonly<{ token: string; adoptionGrant?: RecoveryAdoptionGrant }>): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>>;
    freshAdoptionGrant?(): Promise<RecoveryAdoptionGrant>;
    discoverCandidates?(): Promise<readonly RecoverySnapshotCandidate[]>;
    reconstructManifest?(selection: Extract<RecoveryLineageSelection, { kind: "verified" }>, existing: Readonly<{ fileId: string; etag: string }> | null): Promise<void>;
  }>;
}>): AutomaticBackupCoordinator {
  let running: Promise<BackupResult> | null = null;
  let deleting = false;
  let checkingGeneration = 0;
  let bootstrapFence: Readonly<{
    permissionId: string;
    connectionGeneration: number;
    writerEpoch?: number;
    manifestEtag?: string;
  }> | null = null;
  let currentRecoveryPrompt: ReturnType<AutomaticBackupCoordinator["recoveryPrompt"]> = null;
  const recoverCandidates = async (
    existing: Readonly<{ fileId: string; etag: string }> | null,
    promptKind: "latest" | "previous",
  ): Promise<void> => {
    if (input.recovery?.discoverCandidates === undefined) return;
    const selection = selectRecoveryLineage(await input.recovery.discoverCandidates());
    if (selection.kind === "update_required") {
      currentRecoveryPrompt = Object.freeze({ kind: "update_required" as const });
      return;
    }
    if (selection.kind === "verified" && input.recovery.reconstructManifest !== undefined) {
      await input.recovery.reconstructManifest(selection, existing);
      currentRecoveryPrompt = Object.freeze({
        kind: promptKind,
        producedAtMs: selection.latest.createdAtMs,
        ...(selection.previous === null ? {} : { previousProducedAtMs: selection.previous.createdAtMs }),
      });
    }
  };
  const recoveryAttempts = new Map<string, Readonly<{
    snapshot: LogicalBackupSnapshot;
    preparation: AutomaticRecoveryPreparation;
    claim: Readonly<{
      manifestId: string;
      manifestEtag: string;
      manifest: Extract<DriveBackupManifestV1, Readonly<{ kind: "active" }>>;
      permissionId: string;
      connectionGeneration: number;
    }>;
  }>>();
  const deferred = (stage: AutomaticBackupFailureStage): BackupResult => {
    input.reportFailure?.(stage);
    return Object.freeze({ status: "deferred" as const });
  };
  const run = async (): Promise<BackupResult> => {
    if (await input.isWorkoutActive()) return Object.freeze({ status: "deferred" as const });
    const state = await input.state.read();
    const bootstrapping = state.permissionId !== null
      && state.authorityState === "quarantine"
      && bootstrapFence?.permissionId === state.permissionId
      && bootstrapFence.connectionGeneration === state.connectionGeneration;
    if (state.permissionId === null || (!bootstrapping && state.writerEpoch < 1)
      || state.authorityState === "stale_writer"
      || (state.authorityState === "quarantine" && !bootstrapping)
      || (!bootstrapping && state.mutationGeneration <= state.backedUpGeneration)) {
      return Object.freeze({ status: "deferred" as const });
    }
    if (bootstrapping && (input.state.activateWriter === undefined
      || (state.manifestId === null && (input.drive.allocateFileId === undefined || input.drive.createManifest === undefined)))) {
      return Object.freeze({ status: "deferred" as const });
    }
    const writerEpoch = bootstrapping ? bootstrapFence?.writerEpoch ?? Math.max(1, state.writerEpoch + 1) : state.writerEpoch;
    let previous: ActiveManifestSummary["latest"] | null = null;
    if (!bootstrapping && input.validateManifest !== undefined
      && input.buildManifest !== undefined) {
      try {
        const currentManifest = await input.drive.readManifest();
        const parsed = currentManifest === null
          ? null
          : input.validateManifest(currentManifest.bytes);
        if (currentManifest === null || currentManifest.etag !== state.manifestEtag
          || parsed?.writerEpoch !== state.writerEpoch || parsed.latest === undefined) {
          await input.state.markStaleWriter?.(state.writerEpoch);
          return Object.freeze({ status: "stale_writer" as const });
        }
        previous = parsed.latest;
      } catch {
        return deferred("active_manifest");
      }
    }
    let pendingUpload: Awaited<ReturnType<NonNullable<typeof input.state.readPendingUpload>>> | null = null;
    try {
      pendingUpload = await input.state.readPendingUpload?.({
        environment: state.environment,
        permissionId: state.permissionId,
        connectionGeneration: state.connectionGeneration,
        writerEpoch,
      }) ?? null;
    } catch {
      return deferred("attempt_persistence");
    }
    let candidateId: string;
    let manifestId: string;
    try {
      candidateId = pendingUpload?.candidateId ?? await input.drive.allocateFileId?.() ?? input.candidateId();
      manifestId = pendingUpload?.manifestId ?? state.manifestId
        ?? (bootstrapping ? await input.drive.allocateFileId!() : "automatic-backup-manifest");
    } catch {
      return deferred("file_id_allocation");
    }
    let captured: CapturedSnapshot;
    try {
      captured = await input.capture({
        environment: state.environment,
        writerEpoch,
        snapshotId: candidateId,
      });
    } catch {
      return deferred("snapshot_capture");
    }
    if (captured.generation > state.mutationGeneration
      || captured.generation < state.backedUpGeneration
      || (!bootstrapping && captured.generation === state.backedUpGeneration)) {
      return deferred("snapshot_generation");
    }
    if (pendingUpload !== null && (pendingUpload.capturedGeneration !== captured.generation
      || pendingUpload.sourceDigest !== captured.sourceDigest || pendingUpload.snapshotId !== candidateId
      || pendingUpload.manifestId !== manifestId)) {
      pendingUpload = null;
      try {
        candidateId = await input.drive.allocateFileId?.() ?? input.candidateId();
        captured = await input.capture({ environment: state.environment, writerEpoch, snapshotId: candidateId });
      } catch {
        return deferred("snapshot_capture");
      }
    }
    const effectiveState = Object.freeze({ ...state, writerEpoch, manifestId });
    const receipt: Receipt = Object.freeze({ environment: state.environment, permissionId: state.permissionId, connectionGeneration: state.connectionGeneration, writerEpoch, capturedGeneration: captured.generation, sourceDigest: captured.sourceDigest, snapshotId: candidateId, manifestId, manifestEtag: state.manifestEtag ?? "pending" });
    try {
      if (pendingUpload === null) await input.state.persistAttempt({ ...receipt, candidateId, nowMs: input.nowMs() });
    } catch {
      return deferred("attempt_persistence");
    }
    let fileId: string;
    try {
      if (captured.bytes.byteLength > 5 * 1024 * 1024 && input.drive.createResumableSnapshot !== undefined && input.drive.resumeSnapshot !== undefined) {
        const nowMs = input.nowMs();
        await input.state.recoverExpiredLease?.(nowMs);
        const leaseId = `upload-${input.candidateId()}`;
        if (input.state.acquireLease !== undefined
          && !await input.state.acquireLease({ leaseId, nowMs, expiresAtMs: nowMs + 60_000 })) {
          return deferred("snapshot_upload");
        }
        try {
          let session = pendingUpload?.resumableLocation === null || pendingUpload?.resumableLocation === undefined
            ? await input.drive.createResumableSnapshot(candidateId, captured.bytes)
            : { location: pendingUpload.resumableLocation, uploadedBytes: pendingUpload.resumableUploadedBytes };
          if (pendingUpload?.resumableLocation === null || pendingUpload?.resumableLocation === undefined) {
            if (await input.state.updateResumableUpload?.({ candidateId, location: session.location, uploadedBytes: session.uploadedBytes, nowMs: input.nowMs() }) === false) {
              return deferred("snapshot_upload");
            }
          }
          let completed: string | null = null;
          for (let attempt = 0; attempt < 64 && completed === null; attempt += 1) {
            const result = await input.drive.resumeSnapshot(session, captured.bytes);
            if (typeof result === "string") completed = result;
            else {
              session = result;
              if (await input.state.updateResumableUpload?.({ candidateId, location: session.location, uploadedBytes: session.uploadedBytes, nowMs: input.nowMs() }) === false) {
                return deferred("snapshot_upload");
              }
            }
          }
          if (completed === null) return deferred("snapshot_upload");
          fileId = completed;
        } finally {
          await input.state.releaseLease?.(leaseId);
        }
      } else fileId = await input.drive.createSnapshot(candidateId, captured.bytes);
    } catch { return deferred("snapshot_upload"); }
    let downloaded: Uint8Array;
    let downloadedIsValid: boolean;
    try {
      downloaded = await input.drive.download(fileId, captured.bytes.byteLength);
      downloadedIsValid = downloaded.byteLength === captured.bytes.byteLength
        && !downloaded.some((value, index) => value !== captured.bytes[index])
        && await input.validate(downloaded);
    } catch {
      return deferred("snapshot_download");
    }
    if (!downloadedIsValid) {
      return deferred("snapshot_validation");
    }
    const manifestBytes = input.buildManifest?.({
      candidateId: fileId,
      state: effectiveState,
      captured,
      previous,
    }) ?? downloaded;
    let promotedEtag: string;
    try {
      if (bootstrapping) {
        if (state.manifestId === null) {
          const created = await input.drive.createManifest!(manifestId, manifestBytes);
          if (created.fileId !== manifestId) return deferred("manifest_write");
          promotedEtag = created.etag;
        } else {
          promotedEtag = await input.drive.updateManifest(manifestId, manifestBytes, bootstrapFence!.manifestEtag!);
        }
      } else {
        promotedEtag = await input.drive.updateManifest(manifestId, manifestBytes, receipt.manifestEtag);
      }
    }
    catch (error) {
      if (error instanceof Error && error.message === "drive_manifest_conflict") {
        if (bootstrapping) {
          bootstrapFence = null;
          return deferred("manifest_conflict");
        }
        await input.state.markStaleWriter?.(state.writerEpoch);
        return Object.freeze({ status: "stale_writer" as const });
      }
      return deferred("manifest_write");
    }
    let reread: Readonly<{ bytes: Uint8Array; etag: string }> | null;
    try {
      reread = await input.drive.readManifest();
    } catch {
      return deferred("manifest_reread");
    }
    const validatedManifest = reread === null
      ? null
      : input.validateManifest?.(reread.bytes);
    if (reread === null || reread.etag !== promotedEtag
      || (input.validateManifest === undefined
        ? !input.validate(reread.bytes)
        : validatedManifest?.writerEpoch !== writerEpoch)) {
      return deferred("manifest_reread");
    }
    if (bootstrapping) {
      const activated = await input.state.activateWriter!({
        manifestId,
        manifestEtag: promotedEtag,
        writerEpoch,
        permissionId: state.permissionId,
        connectionGeneration: state.connectionGeneration,
      });
      if (!activated) return deferred("writer_activation");
      bootstrapFence = null;
    }
    const accepted = await input.state.acknowledgeReceipt({ ...receipt, snapshotId: fileId, manifestEtag: promotedEtag });
    if (accepted && input.drive.discoverSnapshotsForRetention !== undefined && input.drive.trash !== undefined) {
      try {
        const candidates = await input.drive.discoverSnapshotsForRetention();
        for (const candidate of candidates) {
          const fence = await input.drive.readManifest();
          const parsedFence = fence === null ? null : input.validateManifest?.(fence.bytes);
          if (fence === null || fence.etag !== promotedEtag || parsedFence?.writerEpoch !== writerEpoch) break;
          const protectedIds = new Set([parsedFence.latest?.fileId, parsedFence.previous?.fileId].filter((value): value is string => typeof value === "string"));
          if (protectedIds.has(candidate.fileId) || input.nowMs() - candidate.createdAtMs < 24 * 60 * 60 * 1000) continue;
          await input.drive.trash(candidate.fileId, writerEpoch, candidate.etag);
        }
      } catch {
        // Retention is best-effort and never revokes an accepted backup.
      }
    }
    return accepted ? Object.freeze({ status: "backed_up" as const, generation: captured.generation }) : Object.freeze({ status: "stale_writer" as const });
  };
  const check = async (
    identity?: Readonly<{ permissionId: string; displayEmail: string | null }>,
    allowHigherEpochRecovery = false,
  ) => {
    recoveryAttempts.clear();
    currentRecoveryPrompt = null;
    const generation = ++checkingGeneration;
    const prior = await input.state.read();
    const permissionId = identity?.permissionId ?? prior.permissionId;
    if (permissionId === null) return Object.freeze({ status: "cancelled" as const });
    await input.state.beginQuarantine?.({ environment: input.drive.environment ?? prior.environment, permissionId, connectionGeneration: prior.connectionGeneration + (identity === undefined ? 0 : 1), ...(identity === undefined ? {} : { accountDisplayLabel: identity.displayEmail }) });
    await input.state.setRecoveryStatus?.("checking");
    let result: Awaited<ReturnType<typeof recover>>;
    try {
      result = await recover(allowHigherEpochRecovery);
    } catch {
      if (generation !== checkingGeneration) return Object.freeze({ status: "cancelled" as const });
      await input.state.setRecoveryStatus?.("idle");
      return Object.freeze({ status: "quarantined" as const });
    }
    if (generation !== checkingGeneration) return Object.freeze({ status: "cancelled" as const });
    await input.state.setRecoveryStatus?.(result.status === "needs_bootstrap" || result.status === "ready" ? "idle" : "restore_pending");
    return result;
  };
  const recover = async (allowHigherEpochRecovery = false): Promise<Readonly<{ status: "ready" | "needs_bootstrap" | "quarantined" | "stale_writer" }>> => {
    const state = await input.state.read();
    if (state.permissionId === null) return Object.freeze({ status: "quarantined" as const });
    await input.state.beginQuarantine?.({ environment: state.environment, permissionId: state.permissionId, connectionGeneration: state.connectionGeneration });
    const manifest = await input.drive.readManifest();
    if (manifest === null) {
      const artifacts = await input.drive.discover?.() ?? [];
      if (artifacts.length === 0) {
        bootstrapFence = Object.freeze({
          permissionId: state.permissionId,
          connectionGeneration: state.connectionGeneration,
        });
        return Object.freeze({ status: "needs_bootstrap" as const });
      }
      bootstrapFence = null;
      await recoverCandidates(null, "latest");
      return Object.freeze({ status: "quarantined" as const });
    }
    bootstrapFence = null;
    let authoritativeManifest: DriveBackupManifestV1 | null = null;
    try {
      authoritativeManifest = parseDriveBackupManifestV1(JSON.parse(new TextDecoder().decode(manifest.bytes)));
    } catch { /* Legacy test ports still supply an explicit active-manifest validator. */ }
    if (authoritativeManifest?.kind === "deleted") {
      const manifestId = manifest.fileId ?? state.manifestId;
      if (manifestId === null || manifestId === undefined) return Object.freeze({ status: "quarantined" as const });
      await input.state.beginDeletionSweep?.({
        environment: state.environment,
        permissionId: state.permissionId,
        connectionGeneration: state.connectionGeneration,
        manifestId,
        manifestEtag: manifest.etag,
        successorWriterEpoch: authoritativeManifest.successorWriterEpoch,
      });
      currentRecoveryPrompt = null;
      return Object.freeze({ status: "quarantined" as const });
    }
    const parsed = input.validateManifest?.(manifest.bytes);
    if (parsed === null || parsed === undefined) {
      const fileId = manifest.fileId ?? state.manifestId;
      if (fileId !== null && fileId !== undefined) await recoverCandidates({ fileId, etag: manifest.etag }, "previous");
      return Object.freeze({ status: "quarantined" as const });
    }
    if (parsed.writerEpoch > state.writerEpoch) {
      if (allowHigherEpochRecovery) {
        currentRecoveryPrompt = Object.freeze({ kind: "latest" as const });
        return Object.freeze({ status: "quarantined" as const });
      }
      await input.state.markStaleWriter?.(state.writerEpoch);
      return Object.freeze({ status: "stale_writer" as const });
    }
    if (parsed.writerEpoch < state.writerEpoch) return Object.freeze({ status: "quarantined" as const });
    if (state.manifestId === null || state.manifestId === undefined
      || (manifest.fileId !== undefined && manifest.fileId !== state.manifestId)) {
      return Object.freeze({ status: "quarantined" as const });
    }
    const activated = await input.state.activateWriter?.({ manifestId: state.manifestId, manifestEtag: manifest.etag, writerEpoch: parsed.writerEpoch, permissionId: state.permissionId, connectionGeneration: state.connectionGeneration });
    return Object.freeze({ status: activated === false ? "quarantined" as const : "ready" as const });
  };
  const finishDeletionSweep = async (): Promise<Readonly<{ status: "complete" | "partial" | "cancelled" }>> => {
    const state = await input.state.read();
    if (state.permissionId === null || state.authorityState !== "deleted") return Object.freeze({ status: "cancelled" as const });
    if (state.manifestId === null || state.manifestId === undefined
      || state.manifestEtag === null || state.manifestEtag === undefined) {
      return Object.freeze({ status: "cancelled" as const });
    }
    const fence = Object.freeze({
      environment: state.environment,
      permissionId: state.permissionId,
      connectionGeneration: state.connectionGeneration,
      manifestId: state.manifestId,
      manifestEtag: state.manifestEtag,
      successorWriterEpoch: state.writerEpoch,
    });
    // A deletion marker is promoted before this method is callable.  Each pass
    // re-discovers the bounded namespace: cached ids and filenames are never a
    // deletion authority, and a missed snapshot remains retryable.
    if (state.deletionProgress === "complete") return Object.freeze({ status: "complete" as const });
    if (state.deletionProgress !== "sweep_pending" && !(await input.state.beginDeletionSweep?.(fence))) return Object.freeze({ status: "cancelled" as const });
    if (input.drive.discoverSnapshotsForDeletion === undefined || input.drive.deleteTombstoned === undefined) return Object.freeze({ status: "partial" as const });
    try {
      for (let batch = 0; batch < 8; batch += 1) {
        const identity = await input.auth?.reauthenticate?.();
        if (identity === undefined || identity === null || identity.permissionId !== fence.permissionId) {
          return Object.freeze({ status: "cancelled" as const });
        }
        const currentManifest = await input.drive.readManifest();
        if (currentManifest === null || currentManifest.fileId !== fence.manifestId
          || currentManifest.etag !== fence.manifestEtag) {
          return Object.freeze({ status: "cancelled" as const });
        }
        const currentTombstone = parseDriveBackupManifestV1(JSON.parse(new TextDecoder().decode(currentManifest.bytes)));
        if (currentTombstone.kind !== "deleted"
          || currentTombstone.successorWriterEpoch !== fence.successorWriterEpoch) {
          return Object.freeze({ status: "cancelled" as const });
        }
        const snapshots = await input.drive.discoverSnapshotsForDeletion();
        if (snapshots.length === 0) {
          return await input.state.completeDeletionSweep?.(fence) === false
            ? Object.freeze({ status: "cancelled" as const })
            : Object.freeze({ status: "complete" as const });
        }
        await Promise.all(snapshots.map((snapshot) => input.drive.deleteTombstoned!(snapshot.fileId)));
      }
      return Object.freeze({ status: "partial" as const });
    } catch { return Object.freeze({ status: "partial" as const }); }
  };
  const deleteCloudBackupUnderFence = async (): Promise<Readonly<{ status: "complete" | "partial" | "cancelled" }>> => {
    const identity = await input.auth?.reauthenticate?.();
    if (identity === undefined || identity === null) return Object.freeze({ status: "cancelled" as const });
    const state = await input.state.read();
    if (state.permissionId !== identity.permissionId || state.authorityState !== "active"
      || state.manifestId === null || state.manifestId === undefined
      || state.manifestEtag === null || state.manifestEtag === undefined) {
      return Object.freeze({ status: "cancelled" as const });
    }
    const current = await input.drive.readManifest();
    if (current === null || current.fileId !== state.manifestId || current.etag !== state.manifestEtag) {
      return Object.freeze({ status: "cancelled" as const });
    }
    const manifest = parseDriveBackupManifestV1(JSON.parse(new TextDecoder().decode(current.bytes)));
    if (manifest.kind !== "active" || manifest.writerEpoch !== state.writerEpoch) {
      return Object.freeze({ status: "cancelled" as const });
    }
    const successorWriterEpoch = manifest.writerEpoch + 1;
    if (!Number.isSafeInteger(successorWriterEpoch)) return Object.freeze({ status: "cancelled" as const });
    const tombstone = new TextEncoder().encode(canonicalJson({
      deletedAtMs: input.nowMs(), kind: "deleted", successorWriterEpoch,
    }));
    const promotedEtag = await input.drive.updateManifest(state.manifestId, tombstone, current.etag);
    const reread = await input.drive.readManifest();
    if (reread === null || reread.fileId !== state.manifestId || reread.etag !== promotedEtag) {
      return Object.freeze({ status: "cancelled" as const });
    }
    const promoted = parseDriveBackupManifestV1(JSON.parse(new TextDecoder().decode(reread.bytes)));
    if (promoted.kind !== "deleted" || promoted.successorWriterEpoch !== successorWriterEpoch) {
      return Object.freeze({ status: "cancelled" as const });
    }
    const began = await input.state.beginDeletionSweep?.({
      environment: state.environment, permissionId: state.permissionId,
      connectionGeneration: state.connectionGeneration,
      manifestId: state.manifestId,
      manifestEtag: promotedEtag,
      successorWriterEpoch,
    });
    if (began !== true) return Object.freeze({ status: "cancelled" as const });
    return finishDeletionSweep();
  };
  const deleteCloudBackup = async (): Promise<Readonly<{ status: "complete" | "partial" | "cancelled" }>> => {
    if (deleting) return Object.freeze({ status: "cancelled" as const });
    deleting = true;
    try {
      const inFlightBackup = running;
      if (inFlightBackup !== null) await inFlightBackup.catch(() => undefined);
      return await deleteCloudBackupUnderFence();
    } finally {
      deleting = false;
    }
  };
  const startNewCloudBackup = async (): Promise<Readonly<{ status: "ready" | "cancelled" }>> => {
    const identity = await input.auth?.reauthenticate?.();
    if (identity === undefined || identity === null) return Object.freeze({ status: "cancelled" as const });
    const state = await input.state.read();
    if (state.permissionId !== identity.permissionId || state.authorityState !== "deleted"
      || state.manifestId === null || state.manifestId === undefined) return Object.freeze({ status: "cancelled" as const });
    const manifest = await input.drive.readManifest();
    if (manifest === null || manifest.fileId !== state.manifestId) return Object.freeze({ status: "cancelled" as const });
    const tombstone = parseDriveBackupManifestV1(JSON.parse(new TextDecoder().decode(manifest.bytes)));
    if (tombstone.kind !== "deleted") return Object.freeze({ status: "cancelled" as const });
    const connectionGeneration = state.connectionGeneration + 1;
    if (!Number.isSafeInteger(connectionGeneration)) return Object.freeze({ status: "cancelled" as const });
    await input.state.beginQuarantine?.({ environment: state.environment, permissionId: identity.permissionId, connectionGeneration, accountDisplayLabel: identity.displayEmail });
    bootstrapFence = Object.freeze({ permissionId: identity.permissionId, connectionGeneration, writerEpoch: tombstone.successorWriterEpoch, manifestEtag: manifest.etag });
    return Object.freeze({ status: "ready" as const });
  };
  const prepareRecovery = async ({ candidate }: Readonly<{ candidate: AutomaticRecoveryCandidate }>): Promise<AutomaticRecoveryPreparation> => {
    if (input.recovery === undefined) throw new Error("automatic_recovery_unavailable");
    if (await input.isWorkoutActive()) throw new Error("automatic_recovery_workout_active");
    const state = await input.state.read();
    if (state.permissionId === null || state.authorityState !== "quarantine") throw new Error("automatic_recovery_not_quarantined");
    const rawManifest = await input.drive.readManifest();
    if (rawManifest === null) throw new Error("automatic_recovery_manifest_missing");
    const manifest = parseDriveBackupManifestV1(JSON.parse(new TextDecoder().decode(rawManifest.bytes)));
    if (manifest.kind !== "active" || manifest.writerEpoch < state.writerEpoch) throw new Error("automatic_recovery_manifest_invalid");
    const manifestId = rawManifest.fileId ?? state.manifestId;
    if (manifestId === null || manifestId === undefined) throw new Error("automatic_recovery_manifest_invalid");
    const descriptor = candidate === "latest" ? manifest.latest : manifest.previous;
    if (descriptor === null) throw new Error("automatic_recovery_candidate_missing");
    if (descriptor.byteLength === undefined || descriptor.snapshotId === undefined
      || descriptor.writerEpoch === undefined || descriptor.mutationGeneration === undefined) {
      throw new Error("automatic_recovery_manifest_invalid");
    }
    const selectedDescriptor = Object.freeze({
      fileId: descriptor.fileId,
      objectSha256: descriptor.object_sha256,
      byteLength: descriptor.byteLength,
      snapshotId: descriptor.snapshotId,
      writerEpoch: descriptor.writerEpoch,
      mutationGeneration: descriptor.mutationGeneration,
    });
    await input.state.setRecoveryStatus?.("checking");
    const snapshotBytes = await input.drive.download(descriptor.fileId, descriptor.byteLength + 1);
    if (snapshotBytes.byteLength !== descriptor.byteLength) throw new Error("automatic_recovery_snapshot_invalid");
    const snapshot = await input.recovery.parseSnapshot(snapshotBytes, selectedDescriptor);
    const attemptId = input.candidateId();
    const preparation = await input.recovery.localIsEmpty()
      ? Object.freeze({ kind: "empty_direct" as const, attemptId })
      : Object.freeze({ kind: "merge" as const, attemptId, ...await input.recovery.prepareMerge(snapshot) });
    recoveryAttempts.set(attemptId, Object.freeze({
      snapshot,
      preparation,
      claim: Object.freeze({
        manifestId,
        manifestEtag: rawManifest.etag,
        manifest,
        permissionId: state.permissionId,
        connectionGeneration: state.connectionGeneration,
      }),
    }));
    await input.state.setRecoveryStatus?.("restore_pending");
    return preparation;
  };
  const commitRecovery = async (request: AutomaticRecoveryCommit): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>> => {
    if (input.recovery === undefined) throw new Error("automatic_recovery_unavailable");
    if (await input.isWorkoutActive()) throw new Error("automatic_recovery_workout_active");
    const attempt = recoveryAttempts.get(request.attemptId);
    if (attempt === undefined || attempt.preparation.kind !== request.kind) throw new Error("automatic_recovery_attempt_invalid");
    recoveryAttempts.delete(request.attemptId);
    const current = await input.state.read();
    if (current.permissionId !== attempt.claim.permissionId
      || current.connectionGeneration !== attempt.claim.connectionGeneration
      || current.authorityState !== "quarantine") {
      throw new Error("automatic_recovery_claim_stale");
    }
    await input.state.setRecoveryStatus?.("restoring");
    let result: Readonly<{ state: "ready" | "rebuild_pending" }>;
    if (request.kind === "empty_direct") {
      result = await input.recovery.restore(attempt.snapshot);
    } else {
      const merge = attempt.preparation as Extract<AutomaticRecoveryPreparation, Readonly<{ kind: "merge" }>>;
      if (merge.adoptionRequired && request.adoptIdentity !== true) throw new Error("automatic_recovery_adoption_required");
      const grant = merge.adoptionRequired ? await input.recovery.freshAdoptionGrant?.() : undefined;
      if (merge.adoptionRequired && grant === undefined) throw new Error("automatic_recovery_adoption_grant_invalid");
      if (grant !== undefined && request.adoptionGrant !== undefined && request.adoptionGrant !== grant.receiptId) throw new Error("automatic_recovery_adoption_grant_invalid");
      result = await input.recovery.commitMerge({ token: merge.token, ...(grant === undefined ? {} : { adoptionGrant: grant }) });
    }
    await input.state.setRecoveryStatus?.("finishing");
    const latest = attempt.claim.manifest.latest;
    await input.state.persistPendingHandover?.({
      attemptId: request.attemptId,
      environment: current.environment,
      permissionId: attempt.claim.permissionId,
      connectionGeneration: attempt.claim.connectionGeneration,
      manifestId: attempt.claim.manifestId,
      manifestEtag: attempt.claim.manifestEtag,
      remoteWriterEpoch: attempt.claim.manifest.writerEpoch,
      snapshotId: latest.fileId,
      sourceDigest: latest.object_sha256,
      nowMs: input.nowMs(),
    });
    await claimSuccessor({
      attemptId: request.attemptId,
      environment: current.environment,
      permissionId: attempt.claim.permissionId,
      connectionGeneration: attempt.claim.connectionGeneration,
      manifestId: attempt.claim.manifestId,
      manifestEtag: attempt.claim.manifestEtag,
      remoteWriterEpoch: attempt.claim.manifest.writerEpoch,
      snapshotId: latest.fileId,
      sourceDigest: latest.object_sha256,
    }, attempt.claim.manifest);
    return result;
  };
  const claimSuccessor = async (
    pending: PendingHandover,
    preparedManifest?: Extract<DriveBackupManifestV1, Readonly<{ kind: "active" }>>,
  ): Promise<void> => {
    const current = await input.state.read();
    if (current.permissionId !== pending.permissionId
      || current.connectionGeneration !== pending.connectionGeneration
      || current.authorityState !== "quarantine") throw new Error("automatic_recovery_claim_stale");
    const authoritative = preparedManifest === undefined ? await input.drive.readManifest() : null;
    if (preparedManifest === undefined && (authoritative === null
      || (authoritative.fileId !== undefined && authoritative.fileId !== pending.manifestId)
      || authoritative.etag !== pending.manifestEtag)) throw new Error("automatic_recovery_claim_stale");
    const manifest = preparedManifest ?? parseDriveBackupManifestV1(JSON.parse(new TextDecoder().decode(authoritative!.bytes)));
    if (manifest.kind !== "active"
      || manifest.writerEpoch !== pending.remoteWriterEpoch
      || manifest.latest.fileId !== pending.snapshotId
      || manifest.latest.object_sha256 !== pending.sourceDigest) throw new Error("automatic_recovery_claim_stale");
    const successorWriterEpoch = manifest.writerEpoch + 1;
    if (!Number.isSafeInteger(successorWriterEpoch)) throw new Error("automatic_recovery_claim_invalid");
    const claimedBytes = new TextEncoder().encode(canonicalJson({
      kind: "active",
      writer_epoch: successorWriterEpoch,
      latest: manifest.latest,
      previous: manifest.previous,
    }));
    const claimedEtag = await input.drive.updateManifest(
      pending.manifestId,
      claimedBytes,
      pending.manifestEtag,
    );
    const reread = await input.drive.readManifest();
    const claimed = reread === null
      ? null
      : parseDriveBackupManifestV1(JSON.parse(new TextDecoder().decode(reread.bytes)));
    if (reread === null
      || (reread.fileId !== undefined && reread.fileId !== pending.manifestId)
      || reread.etag !== claimedEtag
      || claimed?.kind !== "active"
      || claimed.writerEpoch !== successorWriterEpoch
      || canonicalJson([claimed.latest, claimed.previous])
        !== canonicalJson([manifest.latest, manifest.previous])) {
      throw new Error("automatic_recovery_claim_invalid");
    }
    const activated = await input.state.activateWriter?.({
      manifestId: pending.manifestId,
      manifestEtag: claimedEtag,
      writerEpoch: successorWriterEpoch,
      permissionId: pending.permissionId,
      connectionGeneration: pending.connectionGeneration,
    });
    if (activated !== true) throw new Error("automatic_recovery_claim_stale");
    await input.state.setRecoveryStatus?.("idle");
  };
  return Object.freeze({
    backup() {
      if (deleting) return Promise.resolve(Object.freeze({ status: "deferred" as const }));
      if (running === null) running = run().finally(() => { running = null; });
      return running;
    },
    recover: () => recover(),
    async connect() {
      const identity = await input.auth?.connect();
      return identity === undefined || identity === null
        ? Object.freeze({ status: "cancelled" as const })
        : check(identity, true);
    },
    checkAgain: () => check(),
    async takeOver() {
      const identity = await input.auth?.reauthenticate?.();
      if (identity === undefined || identity === null) return Object.freeze({ status: "cancelled" as const });
      const pending = await input.state.readPendingHandover?.();
      if (pending !== undefined && pending !== null) {
        if (pending.permissionId !== identity.permissionId) throw new Error("automatic_recovery_claim_stale");
        await claimSuccessor(pending);
        return Object.freeze({ status: "ready" as const });
      }
      return check(identity, true);
    },
    async deferRecovery() { ++checkingGeneration; await input.state.setRecoveryStatus?.("restore_pending"); },
    async abortChecking() { ++checkingGeneration; await input.state.setRecoveryStatus?.("restore_pending"); },
    async disconnect() { ++checkingGeneration; bootstrapFence = null; await input.auth?.disconnect(); await input.state.disconnectLocal?.(); },
    finishDeletionSweep,
    deleteCloudBackup,
    startNewCloudBackup,
    prepareRecovery,
    commitRecovery,
    async cancelRecovery(attemptId) {
      recoveryAttempts.delete(attemptId);
      await input.state.setRecoveryStatus?.("restore_pending");
    },
    recoveryPrompt: () => currentRecoveryPrompt,
  });
}
