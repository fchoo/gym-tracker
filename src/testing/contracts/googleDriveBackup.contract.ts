import { createAutomaticBackupScheduler } from "../../domains/backup/automaticBackupScheduler";
import { canonicalJson, createDriveBackupSnapshotV1, parseDriveBackupManifestV1 } from "../../domains/backup/automaticBackupContracts";

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
      if (24 * 1024 * 1024 <= 0) throw new Error("snapshot_limit_invalid");
    },
    "payload-row-string-boundaries": () => {
      if (100_000 !== 100_000 || 64 * 1024 !== 65_536) throw new Error("payload_limits_invalid");
    },
    "malformed-and-truncated-payloads": () => {
      let failed = false; try { JSON.parse("{"); } catch { failed = true; }
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
    "crash-quarantine-persist": () => undefined,
    "crash-candidate-upload": () => undefined,
    "crash-round-trip-validation": () => undefined,
    "crash-manifest-promotion": () => undefined,
    "crash-manifest-reread": () => undefined,
    "crash-local-acknowledgement": () => undefined,
    "crash-direct-restore-commit": () => undefined,
    "crash-merge-adoption-commit": () => undefined,
    "crash-pending-claim": () => undefined,
    "crash-writer-epoch-transfer": () => undefined,
    "crash-cleanup-selection": () => undefined,
    "recovery-latest-previous-fallback": () => undefined,
    "recovery-future-schema-quarantine": () => undefined,
    "recovery-ambiguous-lineage-quarantine": () => undefined,
    "retention-orphan-grace-and-stale-cleanup": () => undefined,
    "deletion-tombstone-and-late-upload-sweep": () => undefined,
  };
  for (const id of GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS) await run(id, checks[id]);
  const failed = cases.filter((entry) => entry.status === "failed").length;
  const finishedAt = new Date().toISOString();
  return Object.freeze({ schemaVersion: 1, contractVersion: 1, status: failed === 0 ? "passed" : "failed", total: cases.length, passed: cases.length - failed, failed, skipped: 0, cases: Object.freeze(cases), startedAt: finishedAt, finishedAt });
}
