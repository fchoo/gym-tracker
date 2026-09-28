import type { AutomaticBackupEnvironment } from "./automaticBackupContracts";

type CapturedSnapshot = Readonly<{ generation: number; sourceDigest: string; bytes: Uint8Array }>;
type BackupState = Readonly<{
  environment: AutomaticBackupEnvironment; permissionId: string | null; connectionGeneration: number;
  writerEpoch: number; mutationGeneration: number; backedUpGeneration: number;
}>;
type Receipt = Readonly<{
  environment: AutomaticBackupEnvironment; permissionId: string; connectionGeneration: number;
  writerEpoch: number; capturedGeneration: number; sourceDigest: string; snapshotId: string;
  manifestId: string; manifestEtag: string;
}>;

export type AutomaticBackupCoordinator = Readonly<{
  backup(): Promise<Readonly<{ status: "backed_up" | "deferred" | "stale_writer"; generation?: number }>>;
}>;

/**
 * The coordinator deliberately exposes no mutation command for quarantine or
 * restore: those flows must establish a new writer epoch before they can call
 * this single-writer promotion path.
 */
export function createAutomaticBackupCoordinator(input: Readonly<{
  isWorkoutActive(): boolean;
  capture(): Promise<CapturedSnapshot>;
  state: Readonly<{
    read(): Promise<BackupState>;
    persistAttempt(input: Receipt & Readonly<{ candidateId: string; nowMs: number }>): Promise<void>;
    acknowledgeReceipt(input: Receipt): Promise<boolean>;
  }>;
  drive: Readonly<{
    createSnapshot(candidateId: string, bytes: Uint8Array): Promise<string>;
    download(fileId: string, maxBytes: number): Promise<Uint8Array>;
    updateManifest(manifestId: string, bytes: Uint8Array, etag: string): Promise<string>;
    readManifest(): Promise<Readonly<{ bytes: Uint8Array; etag: string }> | null>;
  }>;
  validate(bytes: Uint8Array): boolean;
  nowMs(): number;
  candidateId(): string;
}>): AutomaticBackupCoordinator {
  let running: Promise<Readonly<{ status: "backed_up" | "deferred" | "stale_writer"; generation?: number }>> | null = null;
  const run = async () => {
    if (input.isWorkoutActive()) return Object.freeze({ status: "deferred" as const });
    const state = await input.state.read();
    if (state.permissionId === null || state.writerEpoch < 1 || state.mutationGeneration <= state.backedUpGeneration) {
      return Object.freeze({ status: "deferred" as const });
    }
    const captured = await input.capture();
    if (captured.generation > state.mutationGeneration || captured.generation <= state.backedUpGeneration) {
      return Object.freeze({ status: "deferred" as const });
    }
    const candidateId = input.candidateId();
    const receipt: Receipt = Object.freeze({
      environment: state.environment, permissionId: state.permissionId,
      connectionGeneration: state.connectionGeneration, writerEpoch: state.writerEpoch,
      capturedGeneration: captured.generation, sourceDigest: captured.sourceDigest,
      snapshotId: candidateId, manifestId: "automatic-backup-manifest", manifestEtag: "pending",
    });
    await input.state.persistAttempt({ ...receipt, candidateId, nowMs: input.nowMs() });
    const fileId = await input.drive.createSnapshot(candidateId, captured.bytes);
    const downloaded = await input.drive.download(fileId, captured.bytes.byteLength);
    if (!input.validate(downloaded)) return Object.freeze({ status: "deferred" as const });
    const promotedEtag = await input.drive.updateManifest(receipt.manifestId, downloaded, receipt.manifestEtag);
    const reread = await input.drive.readManifest();
    if (reread === null || reread.etag !== promotedEtag || !input.validate(reread.bytes)) {
      return Object.freeze({ status: "deferred" as const });
    }
    const accepted = await input.state.acknowledgeReceipt({ ...receipt, snapshotId: fileId, manifestEtag: promotedEtag });
    return accepted
      ? Object.freeze({ status: "backed_up" as const, generation: captured.generation })
      : Object.freeze({ status: "stale_writer" as const });
  };
  return Object.freeze({
    backup() {
      if (running === null) {
        running = run().finally(() => { running = null; });
      }
      return running;
    },
  });
}
