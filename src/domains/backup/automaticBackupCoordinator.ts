import { parseDriveBackupManifestV1, type AutomaticBackupEnvironment } from "./automaticBackupContracts";
import type { GoogleAuthPort } from "./googleAuthPort";
type LogicalBackupSnapshot = any;

type CapturedSnapshot = Readonly<{ generation: number; sourceDigest: string; bytes: Uint8Array }>;
type ActiveManifestSummary = Readonly<{
  writerEpoch: number;
  latest?: Readonly<{ fileId: string; object_sha256: string }>;
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
export type AutomaticRecoveryCandidate = "latest" | "previous";
export type AutomaticRecoveryPreparation = Readonly<{ kind: "empty_direct"; attemptId: string } | { kind: "merge"; attemptId: string; token: string; ownerSummary: string; adoptionRequired: boolean }>;
export type AutomaticRecoveryCommit = Readonly<{ kind: "empty_direct"; attemptId: string } | { kind: "merge"; attemptId: string; confirmation: "MERGE"; adoptIdentity?: true; adoptionGrant?: string }>;

export type AutomaticBackupCoordinator = Readonly<{
  backup(): Promise<BackupResult>;
  /** The only connection path: One-Tap identity validation then read-only quarantine discovery. */
  connect(): Promise<Readonly<{ status: "ready" | "needs_bootstrap" | "quarantined" | "stale_writer" | "cancelled" }>>;
  checkAgain(): Promise<Readonly<{ status: "ready" | "needs_bootstrap" | "quarantined" | "stale_writer" | "cancelled" }>>;
  deferRecovery(): Promise<void>;
  abortChecking(): Promise<void>;
  disconnect(): Promise<void>;
  /** Re-discovers only the currently authenticated namespace after a tombstone is durable. */
  finishDeletionSweep(): Promise<Readonly<{ status: "complete" | "partial" | "cancelled" }>>;
  /** Discovery is read-only; no quarantine path can publish or delete Drive data. */
  recover(): Promise<Readonly<{ status: "ready" | "needs_bootstrap" | "quarantined" | "stale_writer" }>>;
  prepareRecovery(input: Readonly<{ candidate: AutomaticRecoveryCandidate }>): Promise<AutomaticRecoveryPreparation>;
  commitRecovery(input: AutomaticRecoveryCommit): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>>;
}>;

/**
 * The coordinator is deliberately transport-neutral. It owns the durable ordering
 * fence (candidate -> bounded reread -> If-Match -> reread -> local receipt),
 * while the app boundary supplies authenticated Drive ports and the canonical
 * snapshot collector. No caller awaits this from a workout mutation.
 */
export function createAutomaticBackupCoordinator(input: Readonly<{
  isWorkoutActive(): boolean;
  auth?: Pick<GoogleAuthPort, "connect" | "disconnect">;
  capture(input: Readonly<{
    environment: AutomaticBackupEnvironment;
    writerEpoch: number;
  }>): Promise<CapturedSnapshot>;
  state: Readonly<{
    read(): Promise<BackupState>;
    persistAttempt(input: Receipt & Readonly<{ candidateId: string; nowMs: number }>): Promise<void>;
    acknowledgeReceipt(input: Receipt): Promise<boolean>;
    beginQuarantine?(value: Readonly<{ environment: AutomaticBackupEnvironment; permissionId: string; connectionGeneration: number; accountDisplayLabel?: string | null }>): Promise<void>;
    activateWriter?(value: Readonly<{ manifestId: string; manifestEtag: string; writerEpoch: number; permissionId: string; connectionGeneration: number }>): Promise<boolean>;
    markStaleWriter?(writerEpoch: number): Promise<boolean>;
    setRecoveryStatus?(status: "idle" | "checking" | "restore_pending" | "restoring" | "finishing" | "paused"): Promise<void>;
    disconnectLocal?(): Promise<void>;
    beginDeletionSweep?(value: Readonly<{ environment: AutomaticBackupEnvironment; permissionId: string; connectionGeneration: number }>): Promise<boolean>;
    completeDeletionSweep?(value: Readonly<{ environment: AutomaticBackupEnvironment; permissionId: string; connectionGeneration: number }>): Promise<boolean>;
  }>;
  drive: Readonly<{
    allocateFileId?(): Promise<string>;
    createSnapshot(candidateId: string, bytes: Uint8Array): Promise<string>;
    createManifest?(candidateId: string, bytes: Uint8Array): Promise<Readonly<{ fileId: string; etag: string }>>;
    download(fileId: string, maxBytes: number): Promise<Uint8Array>;
    updateManifest(manifestId: string, bytes: Uint8Array, etag: string): Promise<string>;
    readManifest(): Promise<Readonly<{ bytes: Uint8Array; etag: string }> | null>;
    discover?(): Promise<readonly unknown[]>;
    createResumableSnapshot?(candidateId: string, bytes: Uint8Array): Promise<Readonly<{ location: string; uploadedBytes: number }>>;
    resumeSnapshot?(session: Readonly<{ location: string; uploadedBytes: number }>, bytes: Uint8Array): Promise<Readonly<{ location: string; uploadedBytes: number }> | string>;
    discoverSnapshotsForDeletion?(): Promise<readonly Readonly<{ fileId: string }>[]>;
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
  recovery?: Readonly<{
    parseSnapshot(bytes: Uint8Array): Promise<LogicalBackupSnapshot>;
    localIsEmpty(): Promise<boolean>;
    prepareMerge(snapshot: LogicalBackupSnapshot): Promise<Readonly<{ token: string; ownerSummary: string; adoptionRequired: boolean }>>;
    restore(snapshot: LogicalBackupSnapshot): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>>;
    commitMerge(input: Readonly<{ token: string; adoptionGrant?: string }>): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>>;
    freshAdoptionGrant?(): Promise<string>;
  }>;
}>): AutomaticBackupCoordinator {
  let running: Promise<BackupResult> | null = null;
  let checkingGeneration = 0;
  let bootstrapFence: Readonly<{
    permissionId: string;
    connectionGeneration: number;
  }> | null = null;
  const recoveryAttempts = new Map<string, Readonly<{ snapshot: LogicalBackupSnapshot; preparation: AutomaticRecoveryPreparation }>>();
  const run = async (): Promise<BackupResult> => {
    if (input.isWorkoutActive()) return Object.freeze({ status: "deferred" as const });
    const state = await input.state.read();
    const bootstrapping = state.permissionId !== null
      && state.authorityState === "quarantine"
      && state.manifestId === null
      && bootstrapFence?.permissionId === state.permissionId
      && bootstrapFence.connectionGeneration === state.connectionGeneration;
    if (state.permissionId === null || (!bootstrapping && state.writerEpoch < 1)
      || state.authorityState === "stale_writer"
      || (state.authorityState === "quarantine" && !bootstrapping)
      || state.mutationGeneration <= state.backedUpGeneration) {
      return Object.freeze({ status: "deferred" as const });
    }
    if (bootstrapping && (input.drive.allocateFileId === undefined
      || input.drive.createManifest === undefined
      || input.state.activateWriter === undefined)) {
      return Object.freeze({ status: "deferred" as const });
    }
    const writerEpoch = bootstrapping ? Math.max(1, state.writerEpoch + 1) : state.writerEpoch;
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
        return Object.freeze({ status: "deferred" as const });
      }
    }
    let captured: CapturedSnapshot;
    try {
      captured = await input.capture({
        environment: state.environment,
        writerEpoch,
      });
    } catch {
      return Object.freeze({ status: "deferred" as const });
    }
    if (captured.generation > state.mutationGeneration || captured.generation <= state.backedUpGeneration) return Object.freeze({ status: "deferred" as const });
    let candidateId: string;
    let manifestId: string;
    try {
      candidateId = await input.drive.allocateFileId?.() ?? input.candidateId();
      manifestId = state.manifestId
        ?? (bootstrapping ? await input.drive.allocateFileId!() : "automatic-backup-manifest");
    } catch {
      return Object.freeze({ status: "deferred" as const });
    }
    const effectiveState = Object.freeze({ ...state, writerEpoch, manifestId });
    const receipt: Receipt = Object.freeze({ environment: state.environment, permissionId: state.permissionId, connectionGeneration: state.connectionGeneration, writerEpoch, capturedGeneration: captured.generation, sourceDigest: captured.sourceDigest, snapshotId: candidateId, manifestId, manifestEtag: state.manifestEtag ?? "pending" });
    try {
      await input.state.persistAttempt({ ...receipt, candidateId, nowMs: input.nowMs() });
    } catch {
      return Object.freeze({ status: "deferred" as const });
    }
    let fileId: string;
    try {
      if (captured.bytes.byteLength > 5 * 1024 * 1024 && input.drive.createResumableSnapshot !== undefined && input.drive.resumeSnapshot !== undefined) {
        const session = await input.drive.createResumableSnapshot(candidateId, captured.bytes);
        const completed = await input.drive.resumeSnapshot(session, captured.bytes);
        if (typeof completed !== "string") return Object.freeze({ status: "deferred" as const });
        fileId = completed;
      } else fileId = await input.drive.createSnapshot(candidateId, captured.bytes);
    } catch { return Object.freeze({ status: "deferred" as const }); }
    let downloaded: Uint8Array;
    let downloadedIsValid: boolean;
    try {
      downloaded = await input.drive.download(fileId, captured.bytes.byteLength);
      downloadedIsValid = downloaded.byteLength === captured.bytes.byteLength
        && !downloaded.some((value, index) => value !== captured.bytes[index])
        && await input.validate(downloaded);
    } catch {
      return Object.freeze({ status: "deferred" as const });
    }
    if (!downloadedIsValid) {
      return Object.freeze({ status: "deferred" as const });
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
        const created = await input.drive.createManifest!(manifestId, manifestBytes);
        if (created.fileId !== manifestId) return Object.freeze({ status: "deferred" as const });
        promotedEtag = created.etag;
      } else {
        promotedEtag = await input.drive.updateManifest(manifestId, manifestBytes, receipt.manifestEtag);
      }
    }
    catch (error) {
      if (error instanceof Error && error.message === "drive_manifest_conflict") {
        if (bootstrapping) {
          bootstrapFence = null;
          return Object.freeze({ status: "deferred" as const });
        }
        await input.state.markStaleWriter?.(state.writerEpoch);
        return Object.freeze({ status: "stale_writer" as const });
      }
      return Object.freeze({ status: "deferred" as const });
    }
    const reread = await input.drive.readManifest();
    const validatedManifest = reread === null
      ? null
      : input.validateManifest?.(reread.bytes);
    if (reread === null || reread.etag !== promotedEtag
      || (input.validateManifest === undefined
        ? !input.validate(reread.bytes)
        : validatedManifest?.writerEpoch !== writerEpoch)) {
      return Object.freeze({ status: "deferred" as const });
    }
    if (bootstrapping) {
      const activated = await input.state.activateWriter!({
        manifestId,
        manifestEtag: promotedEtag,
        writerEpoch,
        permissionId: state.permissionId,
        connectionGeneration: state.connectionGeneration,
      });
      if (!activated) return Object.freeze({ status: "deferred" as const });
      bootstrapFence = null;
    }
    const accepted = await input.state.acknowledgeReceipt({ ...receipt, snapshotId: fileId, manifestEtag: promotedEtag });
    return accepted ? Object.freeze({ status: "backed_up" as const, generation: captured.generation }) : Object.freeze({ status: "stale_writer" as const });
  };
  const check = async (identity?: Readonly<{ permissionId: string; displayEmail: string | null }>) => {
    const generation = ++checkingGeneration;
    const prior = await input.state.read();
    const permissionId = identity?.permissionId ?? prior.permissionId;
    if (permissionId === null) return Object.freeze({ status: "cancelled" as const });
    await input.state.beginQuarantine?.({ environment: prior.environment, permissionId, connectionGeneration: prior.connectionGeneration + (identity === undefined ? 0 : 1), ...(identity === undefined ? {} : { accountDisplayLabel: identity.displayEmail }) });
    await input.state.setRecoveryStatus?.("checking");
    const result = await recover();
    if (generation !== checkingGeneration) return Object.freeze({ status: "cancelled" as const });
    await input.state.setRecoveryStatus?.(result.status === "needs_bootstrap" || result.status === "ready" ? "idle" : "restore_pending");
    return result;
  };
  const recover = async (): Promise<Readonly<{ status: "ready" | "needs_bootstrap" | "quarantined" | "stale_writer" }>> => {
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
      return Object.freeze({ status: "quarantined" as const });
    }
    bootstrapFence = null;
    const parsed = input.validateManifest?.(manifest.bytes);
    if (parsed === null || parsed === undefined) return Object.freeze({ status: "quarantined" as const });
    if (parsed.writerEpoch < state.writerEpoch) {
      await input.state.markStaleWriter?.(state.writerEpoch);
      return Object.freeze({ status: "stale_writer" as const });
    }
    const activated = await input.state.activateWriter?.({ manifestId: state.manifestId ?? "automatic-backup-manifest", manifestEtag: manifest.etag, writerEpoch: parsed.writerEpoch, permissionId: state.permissionId, connectionGeneration: state.connectionGeneration });
    return Object.freeze({ status: activated === false ? "quarantined" as const : "ready" as const });
  };
  const finishDeletionSweep = async (): Promise<Readonly<{ status: "complete" | "partial" | "cancelled" }>> => {
    const state = await input.state.read();
    if (state.permissionId === null || state.authorityState !== "deleted") return Object.freeze({ status: "cancelled" as const });
    const fence = Object.freeze({ environment: state.environment, permissionId: state.permissionId, connectionGeneration: state.connectionGeneration });
    // A deletion marker is promoted before this method is callable.  Each pass
    // re-discovers the bounded namespace: cached ids and filenames are never a
    // deletion authority, and a missed snapshot remains retryable.
    if (state.deletionProgress !== "sweep_pending" && !(await input.state.beginDeletionSweep?.(fence))) return Object.freeze({ status: "cancelled" as const });
    if (input.drive.discoverSnapshotsForDeletion === undefined || input.drive.deleteTombstoned === undefined) return Object.freeze({ status: "partial" as const });
    try {
      const snapshots = await input.drive.discoverSnapshotsForDeletion();
      await Promise.all(snapshots.map((snapshot) => input.drive.deleteTombstoned!(snapshot.fileId)));
      // Repeat list/delete/list: Drive listing is the authority, not the first pass.
      const remaining = await input.drive.discoverSnapshotsForDeletion();
      if (remaining.length !== 0) return Object.freeze({ status: "partial" as const });
      return await input.state.completeDeletionSweep?.(fence) === false
        ? Object.freeze({ status: "cancelled" as const })
        : Object.freeze({ status: "complete" as const });
    } catch { return Object.freeze({ status: "partial" as const }); }
  };
  const prepareRecovery = async ({ candidate }: Readonly<{ candidate: AutomaticRecoveryCandidate }>): Promise<AutomaticRecoveryPreparation> => {
    if (input.recovery === undefined) throw new Error("automatic_recovery_unavailable");
    const state = await input.state.read();
    if (state.permissionId === null || state.authorityState !== "quarantine") throw new Error("automatic_recovery_not_quarantined");
    const rawManifest = await input.drive.readManifest();
    if (rawManifest === null) throw new Error("automatic_recovery_manifest_missing");
    const manifest = parseDriveBackupManifestV1(JSON.parse(new TextDecoder().decode(rawManifest.bytes)));
    if (manifest.kind !== "active" || manifest.writerEpoch < state.writerEpoch) throw new Error("automatic_recovery_manifest_invalid");
    const descriptor = candidate === "latest" ? manifest.latest : manifest.previous;
    if (descriptor === null) throw new Error("automatic_recovery_candidate_missing");
    await input.state.setRecoveryStatus?.("checking");
    const snapshot = await input.recovery.parseSnapshot(await input.drive.download(descriptor.fileId, 24 * 1024 * 1024));
    const attemptId = input.candidateId();
    const preparation = await input.recovery.localIsEmpty()
      ? Object.freeze({ kind: "empty_direct" as const, attemptId })
      : Object.freeze({ kind: "merge" as const, attemptId, ...await input.recovery.prepareMerge(snapshot) });
    recoveryAttempts.set(attemptId, Object.freeze({ snapshot, preparation }));
    await input.state.setRecoveryStatus?.("restore_pending");
    return preparation;
  };
  const commitRecovery = async (request: AutomaticRecoveryCommit): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>> => {
    if (input.recovery === undefined) throw new Error("automatic_recovery_unavailable");
    const attempt = recoveryAttempts.get(request.attemptId);
    if (attempt === undefined || attempt.preparation.kind !== request.kind) throw new Error("automatic_recovery_attempt_invalid");
    recoveryAttempts.delete(request.attemptId);
    await input.state.setRecoveryStatus?.("restoring");
    if (request.kind === "empty_direct") return input.recovery.restore(attempt.snapshot);
    const merge = attempt.preparation as Extract<AutomaticRecoveryPreparation, Readonly<{ kind: "merge" }>>;
    if (merge.adoptionRequired && request.adoptIdentity !== true) throw new Error("automatic_recovery_adoption_required");
    const grant = merge.adoptionRequired ? await input.recovery.freshAdoptionGrant?.() : undefined;
    if (merge.adoptionRequired && (grant === undefined || request.adoptionGrant !== grant)) throw new Error("automatic_recovery_adoption_grant_invalid");
    return input.recovery.commitMerge({ token: merge.token, ...(grant === undefined ? {} : { adoptionGrant: grant }) });
  };
  return Object.freeze({
    backup() {
      if (running === null) running = run().finally(() => { running = null; });
      return running;
    },
    recover,
    async connect() {
      const identity = await input.auth?.connect();
      return identity === undefined || identity === null
        ? Object.freeze({ status: "cancelled" as const })
        : check(identity);
    },
    checkAgain: () => check(),
    async deferRecovery() { ++checkingGeneration; await input.state.setRecoveryStatus?.("restore_pending"); },
    async abortChecking() { ++checkingGeneration; await input.state.setRecoveryStatus?.("restore_pending"); },
    async disconnect() { ++checkingGeneration; bootstrapFence = null; await input.auth?.disconnect(); await input.state.disconnectLocal?.(); },
    finishDeletionSweep,
    prepareRecovery,
    commitRecovery,
  });
}
