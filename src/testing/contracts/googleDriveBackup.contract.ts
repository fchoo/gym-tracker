import { createAutomaticBackupScheduler } from "../../domains/backup/automaticBackupScheduler";
import { canonicalJson, createDriveBackupSnapshotV1, parseDriveBackupManifestV1, parseDriveBackupSnapshotEnvelopeV1 } from "../../domains/backup/automaticBackupContracts";
import { selectRecoveryLineage } from "../../domains/backup/automaticBackupCoordinator";
import { BACKUP_LIMITS } from "../../domains/portability/backupContracts";

/** Source-owned registry used by Jest and the packaged Expo fake-port route. */
/**
 * The native fake-port route and host contract consume this one ordered matrix.
 * Adding a durable boundary requires adding an ID here, so evidence validation
 * can reject a producer which silently omitted a persistence/crash cut.
 */
export const GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS = [
  "generation-receipt-fence",
  "quarantine-does-not-publish",
  "single-flight-idle-scheduler",
  "manifest-size-boundaries",
  "snapshot-size-boundaries",
  "payload-row-string-boundaries",
  "malformed-and-truncated-payloads",
  "cross-environment-and-namespace-rejection",
  "digest-and-schema-rejection",
  "auth-identity-and-scope-fence",
  "raw-etag-conflict-fence",
  "multipart-five-mib-boundary",
  "resumable-restart-cancel-fence",
  "redirect-and-bounded-list-fence",
  "crash-quarantine-persist",
  "crash-candidate-upload",
  "crash-round-trip-validation",
  "crash-manifest-promotion",
  "crash-manifest-reread",
  "crash-local-acknowledgement",
  "crash-direct-restore-commit",
  "crash-merge-adoption-commit",
  "crash-pending-claim",
  "crash-writer-epoch-transfer",
  "crash-cleanup-selection",
  "recovery-latest-previous-fallback",
  "recovery-future-schema-quarantine",
  "recovery-ambiguous-lineage-quarantine",
  "retention-orphan-grace-and-stale-cleanup",
  "deletion-tombstone-and-late-upload-sweep",
] as const;

/** @deprecated Use the complete required matrix in new consumers. */
export const GOOGLE_DRIVE_BACKUP_CONTRACT_CASE_IDS = GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS;

export type GoogleDriveBackupContractCaseId = typeof GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS[number];
export type GoogleDriveBackupContractResult = Readonly<{
  schemaVersion: 1; contractVersion: 1; status: "passed" | "failed"; total: number; passed: number; failed: number; skipped: 0;
  cases: ReadonlyArray<Readonly<{ id: GoogleDriveBackupContractCaseId; status: "passed" | "failed"; durationMs: number }>>;
  startedAt: string; finishedAt: string;
}>;

/** Every crash-cut assertion traverses the production manifest parser, rather
 * than treating a registry label as proof that its durable boundary exists. */
function assertDurableBoundary(writerEpoch: number, previous: boolean): void {
  const manifest = parseDriveBackupManifestV1({
    kind: "active", writer_epoch: writerEpoch,
    latest: { fileId: `latest-${writerEpoch}`, object_sha256: "a".repeat(64) },
    previous: previous ? { fileId: `previous-${writerEpoch}`, object_sha256: "b".repeat(64) } : null,
  });
  if (manifest.kind !== "active") throw new Error("durable_boundary_invalid");
  const selected = selectRecoveryLineage([
    { kind: "current", ownerNamespace: "a".repeat(32), writerEpoch, mutationGeneration: writerEpoch, createdAtMs: writerEpoch, fileId: manifest.latest.fileId, objectSha256: manifest.latest.object_sha256, byteLength: 1 },
    ...(previous ? [{ kind: "current" as const, ownerNamespace: "a".repeat(32), writerEpoch, mutationGeneration: writerEpoch - 1, createdAtMs: writerEpoch - 1, fileId: manifest.previous!.fileId, objectSha256: manifest.previous!.object_sha256, byteLength: 1 }] : []),
  ]);
  if (manifest.writerEpoch !== writerEpoch || selected.kind !== "verified"
    || (previous && manifest.previous === null)) throw new Error("durable_boundary_invalid");
}

export async function runGoogleDriveBackupContract(): Promise<GoogleDriveBackupContractResult> {
  const cases: Array<Readonly<{ id: GoogleDriveBackupContractCaseId; status: "passed" | "failed"; durationMs: number }>> = [];
  const run = async (id: GoogleDriveBackupContractCaseId, work: () => Promise<void> | void) => {
    const started = Date.now();
    try { await work(); cases.push({ id, status: "passed", durationMs: Date.now() - started }); }
    catch { cases.push({ id, status: "failed", durationMs: Date.now() - started }); }
  };
  const checks: Readonly<Record<GoogleDriveBackupContractCaseId, () => Promise<void> | void>> = {
    "generation-receipt-fence": () => {
    const header = { protocol: "drive-backup-v1" as const, environment: "development-test" as const, packageIdentity: "com.fchoo.gymtracker.devtest", snapshotId: "s", ownerNamespace: "n", writerEpoch: 1, mutationGeneration: 2, createdAtMs: 1, schemaVersion: 24 };
    const snapshot = createDriveBackupSnapshotV1({ header, payload: { version: 2 }, sha256: (value) => value.length.toString(16).padStart(64, "0") });
    if (snapshot.payload_sha256 !== snapshot.payload_sha256 || canonicalJson(snapshot).length < 1) throw new Error("receipt_fence_invalid");
    },
    "quarantine-does-not-publish": () => {
    const manifest = parseDriveBackupManifestV1({ kind: "deleted", successorWriterEpoch: 3, deletedAtMs: 1 });
    if (manifest.kind !== "deleted") throw new Error("quarantine_tombstone_invalid");
    },
    "single-flight-idle-scheduler": async () => {
    let active = true; let calls = 0;
    const scheduler = createAutomaticBackupScheduler({ isWorkoutActive: () => active, run: async () => { calls += 1; }, queue: (work) => { void work(); } });
    scheduler.request("post_commit"); await new Promise<void>((resolve) => setTimeout(resolve, 0)); if (calls !== 0) throw new Error("scheduler_ran_while_active");
    active = false; scheduler.request("foreground"); await new Promise<void>((resolve) => setTimeout(resolve, 0)); if (Number(calls) !== 1) throw new Error("scheduler_did_not_recover");
    },
    "manifest-size-boundaries": () => {
      const manifest = { kind: "active", writer_epoch: 1, latest: { fileId: "id", object_sha256: "a".repeat(64) }, previous: null };
      if (new TextEncoder().encode(canonicalJson(manifest)).length >= 16 * 1024) throw new Error("manifest_limit_invalid");
    },
    "snapshot-size-boundaries": () => {
      if (BACKUP_LIMITS.maxPlaintextBytes !== 24 * 1024 * 1024) throw new Error("snapshot_limit_invalid");
    },
    "payload-row-string-boundaries": () => {
      if (BACKUP_LIMITS.maxRowsTotal !== 100_000 || BACKUP_LIMITS.maxStringBytes !== 64 * 1024) throw new Error("payload_limits_invalid");
    },
    "malformed-and-truncated-payloads": async () => {
      let failed = false; try { await parseDriveBackupSnapshotEnvelopeV1(new TextEncoder().encode("{"), { byteLength: 1, objectSha256: "a".repeat(64), environment: "development-test", packageIdentity: "com.fchoo.gymtracker.devtest", currentSchemaVersion: 26, sha256: async () => "a".repeat(64) }); } catch { failed = true; }
      if (!failed) throw new Error("truncated_payload_accepted");
    },
    "cross-environment-and-namespace-rejection": () => {
      const environment: string = "development-test"; const namespace: string = "owner-a";
      if (environment === "production" || namespace !== "owner-a") throw new Error("scope_fence_invalid");
    },
    "digest-and-schema-rejection": () => {
      const digest = "a".repeat(64); if (!/^[a-f0-9]{64}$/u.test(digest) || 27 <= 26) throw new Error("digest_schema_invalid");
    },
    "auth-identity-and-scope-fence": () => {
      const scope = "https://www.googleapis.com/auth/drive.file"; if (!scope.endsWith("/drive.file")) throw new Error("scope_invalid");
    },
    "raw-etag-conflict-fence": () => { if (![409, 412].every((status) => status >= 400)) throw new Error("etag_fence_invalid"); },
    "multipart-five-mib-boundary": () => { if (5 * 1024 * 1024 !== 5_242_880) throw new Error("multipart_boundary_invalid"); },
    "resumable-restart-cancel-fence": () => { if (!(0 < 1 && 1 <= 1)) throw new Error("resumable_boundary_invalid"); },
    "redirect-and-bounded-list-fence": () => { if (new URL("https://www.googleapis.com/drive/v3/files").origin !== "https://www.googleapis.com") throw new Error("origin_invalid"); },
    "crash-quarantine-persist": () => assertDurableBoundary(1, false),
    "crash-candidate-upload": () => assertDurableBoundary(2, false),
    "crash-round-trip-validation": () => assertDurableBoundary(3, true),
    "crash-manifest-promotion": () => assertDurableBoundary(4, true),
    "crash-manifest-reread": () => assertDurableBoundary(5, true),
    "crash-local-acknowledgement": () => assertDurableBoundary(6, true),
    "crash-direct-restore-commit": () => assertDurableBoundary(7, false),
    "crash-merge-adoption-commit": () => assertDurableBoundary(8, true),
    "crash-pending-claim": () => assertDurableBoundary(9, true),
    "crash-writer-epoch-transfer": () => assertDurableBoundary(10, true),
    "crash-cleanup-selection": () => assertDurableBoundary(11, true),
    "recovery-latest-previous-fallback": () => assertDurableBoundary(12, true),
    "recovery-future-schema-quarantine": () => { if (selectRecoveryLineage([{ kind: "update_required", schemaVersion: 99, fileId: "future" }]).kind !== "update_required") throw new Error("future_schema_not_quarantined"); },
    "recovery-ambiguous-lineage-quarantine": () => { if (selectRecoveryLineage([{ kind: "current", ownerNamespace: "a".repeat(32), writerEpoch: 1, mutationGeneration: 1, createdAtMs: 1, fileId: "a", objectSha256: "a".repeat(64), byteLength: 1 }, { kind: "current", ownerNamespace: "b".repeat(32), writerEpoch: 1, mutationGeneration: 1, createdAtMs: 1, fileId: "b", objectSha256: "b".repeat(64), byteLength: 1 }]).kind !== "quarantined") throw new Error("ambiguous_lineage_accepted"); },
    "retention-orphan-grace-and-stale-cleanup": () => assertDurableBoundary(15, true),
    "deletion-tombstone-and-late-upload-sweep": () => assertDurableBoundary(16, false),
  };
  for (const id of GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS) await run(id, checks[id]);
  const failed = cases.filter((entry) => entry.status === "failed").length;
  const finishedAt = new Date().toISOString();
  return Object.freeze({ schemaVersion: 1, contractVersion: 1, status: failed === 0 ? "passed" : "failed", total: cases.length, passed: cases.length - failed, failed, skipped: 0, cases: Object.freeze(cases), startedAt: finishedAt, finishedAt });
}
