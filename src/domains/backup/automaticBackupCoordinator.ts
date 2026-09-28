import type { AutomaticBackupEnvironment } from "./automaticBackupContracts";
import type { GoogleAuthPort } from "./googleAuthPort";

type CapturedSnapshot = Readonly<{ generation: number; sourceDigest: string; bytes: Uint8Array }>;
type BackupState = Readonly<{
  environment: AutomaticBackupEnvironment; permissionId: string | null; connectionGeneration: number;
  writerEpoch: number; mutationGeneration: number; backedUpGeneration: number;
  manifestId?: string | null; manifestEtag?: string | null;
  authorityState?: "quarantine" | "active" | "stale_writer" | "deleted";
}>;
type Receipt = Readonly<{
  environment: AutomaticBackupEnvironment; permissionId: string; connectionGeneration: number;
  writerEpoch: number; capturedGeneration: number; sourceDigest: string; snapshotId: string;
  manifestId: string; manifestEtag: string;
}>;
type BackupResult = Readonly<{ status: "backed_up" | "deferred" | "stale_writer"; generation?: number }>;

export type AutomaticBackupCoordinator = Readonly<{
  backup(): Promise<BackupResult>;
  /** The only connection path: One-Tap identity validation then read-only quarantine discovery. */
  connect(): Promise<Readonly<{ status: "ready" | "needs_bootstrap" | "quarantined" | "stale_writer" | "cancelled" }>>;
  checkAgain(): Promise<Readonly<{ status: "ready" | "needs_bootstrap" | "quarantined" | "stale_writer" | "cancelled" }>>;
  deferRecovery(): Promise<void>;
  abortChecking(): Promise<void>;
  disconnect(): Promise<void>;
  /** Discovery is read-only; no quarantine path can publish or delete Drive data. */
  recover(): Promise<Readonly<{ status: "ready" | "needs_bootstrap" | "quarantined" | "stale_writer" }>>;
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
  capture(): Promise<CapturedSnapshot>;
  state: Readonly<{
    read(): Promise<BackupState>;
    persistAttempt(input: Receipt & Readonly<{ candidateId: string; nowMs: number }>): Promise<void>;
    acknowledgeReceipt(input: Receipt): Promise<boolean>;
    beginQuarantine?(value: Readonly<{ environment: AutomaticBackupEnvironment; permissionId: string; connectionGeneration: number }>): Promise<void>;
    activateWriter?(value: Readonly<{ manifestId: string; manifestEtag: string; writerEpoch: number; permissionId: string; connectionGeneration: number }>): Promise<boolean>;
    markStaleWriter?(writerEpoch: number): Promise<boolean>;
    setRecoveryStatus?(status: "idle" | "checking" | "restore_pending" | "restoring" | "finishing" | "paused"): Promise<void>;
    disconnectLocal?(): Promise<void>;
  }>;
  drive: Readonly<{
    createSnapshot(candidateId: string, bytes: Uint8Array): Promise<string>;
    download(fileId: string, maxBytes: number): Promise<Uint8Array>;
    updateManifest(manifestId: string, bytes: Uint8Array, etag: string): Promise<string>;
    readManifest(): Promise<Readonly<{ bytes: Uint8Array; etag: string }> | null>;
    discover?(): Promise<readonly unknown[]>;
    createResumableSnapshot?(candidateId: string, bytes: Uint8Array): Promise<Readonly<{ location: string; uploadedBytes: number }>>;
    resumeSnapshot?(session: Readonly<{ location: string; uploadedBytes: number }>, bytes: Uint8Array): Promise<Readonly<{ location: string; uploadedBytes: number }> | string>;
  }>;
  validate(bytes: Uint8Array): boolean;
  nowMs(): number;
  candidateId(): string;
  validateManifest?(bytes: Uint8Array): Readonly<{ writerEpoch: number }> | null;
  buildManifest?(value: Readonly<{ candidateId: string; state: BackupState; captured: CapturedSnapshot }>): Uint8Array;
}>): AutomaticBackupCoordinator {
  let running: Promise<BackupResult> | null = null;
  let checkingGeneration = 0;
  const run = async (): Promise<BackupResult> => {
    if (input.isWorkoutActive()) return Object.freeze({ status: "deferred" as const });
    const state = await input.state.read();
    if (state.permissionId === null || state.writerEpoch < 1 || state.authorityState === "stale_writer" || state.authorityState === "quarantine" || state.mutationGeneration <= state.backedUpGeneration) return Object.freeze({ status: "deferred" as const });
    const captured = await input.capture();
    if (captured.generation > state.mutationGeneration || captured.generation <= state.backedUpGeneration) return Object.freeze({ status: "deferred" as const });
    const candidateId = input.candidateId();
    const manifestId = state.manifestId ?? "automatic-backup-manifest";
    const receipt: Receipt = Object.freeze({ environment: state.environment, permissionId: state.permissionId, connectionGeneration: state.connectionGeneration, writerEpoch: state.writerEpoch, capturedGeneration: captured.generation, sourceDigest: captured.sourceDigest, snapshotId: candidateId, manifestId, manifestEtag: state.manifestEtag ?? "pending" });
    await input.state.persistAttempt({ ...receipt, candidateId, nowMs: input.nowMs() });
    let fileId: string;
    try {
      if (captured.bytes.byteLength > 5 * 1024 * 1024 && input.drive.createResumableSnapshot !== undefined && input.drive.resumeSnapshot !== undefined) {
        const session = await input.drive.createResumableSnapshot(candidateId, captured.bytes);
        const completed = await input.drive.resumeSnapshot(session, captured.bytes);
        if (typeof completed !== "string") return Object.freeze({ status: "deferred" as const });
        fileId = completed;
      } else fileId = await input.drive.createSnapshot(candidateId, captured.bytes);
    } catch { return Object.freeze({ status: "deferred" as const }); }
    const downloaded = await input.drive.download(fileId, captured.bytes.byteLength);
    if (!input.validate(downloaded)) return Object.freeze({ status: "deferred" as const });
    const manifestBytes = input.buildManifest?.({ candidateId: fileId, state, captured }) ?? downloaded;
    let promotedEtag: string;
    try { promotedEtag = await input.drive.updateManifest(manifestId, manifestBytes, receipt.manifestEtag); }
    catch (error) {
      if (error instanceof Error && error.message === "drive_manifest_conflict") {
        await input.state.markStaleWriter?.(state.writerEpoch);
        return Object.freeze({ status: "stale_writer" as const });
      }
      return Object.freeze({ status: "deferred" as const });
    }
    const reread = await input.drive.readManifest();
    if (reread === null || reread.etag !== promotedEtag || !(input.validateManifest?.(reread.bytes) ?? input.validate(reread.bytes))) return Object.freeze({ status: "deferred" as const });
    const accepted = await input.state.acknowledgeReceipt({ ...receipt, snapshotId: fileId, manifestEtag: promotedEtag });
    return accepted ? Object.freeze({ status: "backed_up" as const, generation: captured.generation }) : Object.freeze({ status: "stale_writer" as const });
  };
  const check = async (identity?: Readonly<{ permissionId: string; displayEmail: string | null }>) => {
    const generation = ++checkingGeneration;
    const prior = await input.state.read();
    const permissionId = identity?.permissionId ?? prior.permissionId;
    if (permissionId === null) return Object.freeze({ status: "cancelled" as const });
    await input.state.beginQuarantine?.({ environment: prior.environment, permissionId, connectionGeneration: prior.connectionGeneration + (identity === undefined ? 0 : 1) });
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
      return Object.freeze({ status: artifacts.length === 0 ? "needs_bootstrap" as const : "quarantined" as const });
    }
    const parsed = input.validateManifest?.(manifest.bytes);
    if (parsed === null || parsed === undefined) return Object.freeze({ status: "quarantined" as const });
    if (parsed.writerEpoch < state.writerEpoch) {
      await input.state.markStaleWriter?.(state.writerEpoch);
      return Object.freeze({ status: "stale_writer" as const });
    }
    const activated = await input.state.activateWriter?.({ manifestId: state.manifestId ?? "automatic-backup-manifest", manifestEtag: manifest.etag, writerEpoch: parsed.writerEpoch, permissionId: state.permissionId, connectionGeneration: state.connectionGeneration });
    return Object.freeze({ status: activated === false ? "quarantined" as const : "ready" as const });
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
    async disconnect() { ++checkingGeneration; await input.auth?.disconnect(); await input.state.disconnectLocal?.(); },
  });
}
