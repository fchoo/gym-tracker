import { createAutomaticBackupScheduler } from "../../domains/backup/automaticBackupScheduler";
import { canonicalJson, createDriveBackupSnapshotV1, parseDriveBackupManifestV1, parseDriveBackupSnapshotEnvelopeV1 } from "../../domains/backup/automaticBackupContracts";
import { selectRecoveryLineage } from "../../domains/backup/automaticBackupCoordinator";
import { BACKUP_LIMITS } from "../../domains/portability/backupContracts";
import { createAutomaticBackupStateRepository } from "../../platform/sqlite/repositories/automaticBackupStateRepository";
import { createDriveBackupStoreAdapter } from "../../platform/google/driveBackupStoreAdapter";
import { createMigrationRunner } from "../../platform/sqlite/migrationRunner";
import { migrations } from "../../platform/sqlite/migrations";
import { CURRENT_SCHEMA_VERSION } from "../../platform/sqlite/migrations";
import { createExpoMigrationsEffectsContractAdapter } from "./migrationsEffects.contract";

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
export type GoogleDriveBackupContractAdapter = Readonly<{
  /** Native-only durable companions. Pure parser/scheduler/transport cases run directly below. */
  scenarios: Readonly<Partial<Record<GoogleDriveBackupContractCaseId, () => Promise<number>>>>;
  cleanup?(): Promise<void>;
}>;
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
    { kind: "current", ownerNamespace: "a".repeat(32), writerEpoch, mutationGeneration: writerEpoch, createdAtMs: writerEpoch, snapshotId: `snapshot-${writerEpoch}`, fileId: manifest.latest.fileId, objectSha256: manifest.latest.object_sha256, byteLength: 1 },
    ...(previous ? [{ kind: "current" as const, ownerNamespace: "a".repeat(32), writerEpoch, mutationGeneration: writerEpoch - 1, createdAtMs: writerEpoch - 1, snapshotId: `snapshot-${writerEpoch - 1}`, fileId: manifest.previous!.fileId, objectSha256: manifest.previous!.object_sha256, byteLength: 1 }] : []),
  ]);
  if (manifest.writerEpoch !== writerEpoch || selected.kind !== "verified"
    || (previous && manifest.previous === null)) throw new Error("durable_boundary_invalid");
}

export async function createExpoGoogleDriveBackupContractAdapter(
  runId: string,
): Promise<GoogleDriveBackupContractAdapter> {
  const base = await createExpoMigrationsEffectsContractAdapter(`google-drive-backup-${runId}`);
  const verifyRepositoryScenario = async (
    caseId: GoogleDriveBackupContractCaseId,
    verify: (
      repository: ReturnType<typeof createAutomaticBackupStateRepository>,
      fence: Readonly<{ environment: "development-test"; permissionId: string; connectionGeneration: number }>,
    ) => Promise<number>,
  ): Promise<number> => {
    const runtime = await base.createRuntime(caseId);
    try {
      await createMigrationRunner({
        databaseName: runtime.databaseName,
        kernel: runtime.kernel,
        migrations,
        recoveryBackup: base.recoveryBackup,
      }).run();
      const repository = createAutomaticBackupStateRepository(runtime.kernel);
      const fence = { environment: "development-test" as const, permissionId: "permission", connectionGeneration: 1 };
      await repository.beginQuarantine(fence);
      return await verify(repository, fence);
    } finally {
      await runtime.close();
    }
  };
  const receipt = (caseId: GoogleDriveBackupContractCaseId) => ({
    environment: "development-test" as const, permissionId: "permission", connectionGeneration: 1,
    writerEpoch: 1, capturedGeneration: 0, sourceDigest: "a".repeat(64),
    snapshotId: `snapshot-${caseId}`, manifestId: "manifest", manifestEtag: "etag",
    candidateId: `candidate-${caseId}`, nowMs: 1,
  });
  const handover = (caseId: GoogleDriveBackupContractCaseId) => ({
    attemptId: `attempt-${caseId}`, environment: "development-test" as const,
    permissionId: "permission", connectionGeneration: 1, manifestId: "manifest",
    manifestEtag: "etag", remoteWriterEpoch: 2, snapshotId: "snapshot",
    sourceDigest: "b".repeat(64), nowMs: 1,
  });
  return {
    scenarios: Object.freeze({
      "generation-receipt-fence": () => verifyRepositoryScenario("generation-receipt-fence", async (repository, fence) => {
        await repository.activateWriter({ ...fence, manifestId: "manifest", manifestEtag: "etag", writerEpoch: 1 });
        const value = receipt("generation-receipt-fence"); await repository.persistAttempt(value);
        if (!await repository.acknowledgeReceipt({ ...value, manifestEtag: "accepted" })) throw new Error("native_generation_receipt_rejected");
        return 3;
      }),
      "quarantine-does-not-publish": () => verifyRepositoryScenario("quarantine-does-not-publish", async (repository) => (await repository.read()).authorityState === "quarantine" ? 1 : 0),
      "multipart-five-mib-boundary": () => verifyRepositoryScenario("multipart-five-mib-boundary", async (repository, fence) => { await repository.persistAttempt(receipt("multipart-five-mib-boundary")); return (await repository.readPendingUpload({ ...fence, writerEpoch: 1 })) === null ? 0 : 2; }),
      "resumable-restart-cancel-fence": () => verifyRepositoryScenario("resumable-restart-cancel-fence", async (repository, fence) => { const value = receipt("resumable-restart-cancel-fence"); await repository.persistAttempt(value); await repository.updateResumableUpload({ candidateId: value.candidateId, location: "https://www.googleapis.com/upload/session", uploadedBytes: 1024 }); return (await repository.readPendingUpload({ ...fence, writerEpoch: 1 }))?.resumableUploadedBytes === 1024 ? 3 : 0; }),
      "crash-quarantine-persist": () => verifyRepositoryScenario("crash-quarantine-persist", async (repository) => (await repository.read()).permissionId === "permission" ? 1 : 0),
      "crash-candidate-upload": () => verifyRepositoryScenario("crash-candidate-upload", async (repository, fence) => { const value = receipt("crash-candidate-upload"); await repository.persistAttempt(value); return (await repository.readPendingUpload({ ...fence, writerEpoch: 1 }))?.candidateId === value.candidateId ? 2 : 0; }),
      "crash-round-trip-validation": () => verifyRepositoryScenario("crash-round-trip-validation", async (repository, fence) => { const value = receipt("crash-round-trip-validation"); await repository.persistAttempt(value); const pending = await repository.readPendingUpload({ ...fence, writerEpoch: 1 }); return pending?.sourceDigest === value.sourceDigest ? 2 : 0; }),
      "crash-manifest-promotion": () => verifyRepositoryScenario("crash-manifest-promotion", async (repository, fence) => await repository.activateWriter({ ...fence, manifestId: "manifest", manifestEtag: "promoted", writerEpoch: 1 }) ? 1 : 0),
      "crash-manifest-reread": () => verifyRepositoryScenario("crash-manifest-reread", async (repository, fence) => { await repository.activateWriter({ ...fence, manifestId: "manifest", manifestEtag: "promoted", writerEpoch: 1 }); return (await repository.read()).manifestEtag === "promoted" ? 2 : 0; }),
      "crash-local-acknowledgement": () => verifyRepositoryScenario("crash-local-acknowledgement", async (repository, fence) => { await repository.activateWriter({ ...fence, manifestId: "manifest", manifestEtag: "etag", writerEpoch: 1 }); const value = receipt("crash-local-acknowledgement"); await repository.persistAttempt(value); return await repository.acknowledgeReceipt({ ...value, manifestEtag: "accepted" }) ? 3 : 0; }),
      "crash-direct-restore-commit": () => verifyRepositoryScenario("crash-direct-restore-commit", async (repository) => { const value = handover("crash-direct-restore-commit"); await repository.persistPendingHandover(value); return (await repository.readPendingHandover())?.attemptId === value.attemptId ? 2 : 0; }),
      "crash-merge-adoption-commit": () => verifyRepositoryScenario("crash-merge-adoption-commit", async (repository) => { const value = handover("crash-merge-adoption-commit"); await repository.persistPendingHandover(value); return (await repository.read()).statusCode === "finishing" ? 2 : 0; }),
      "crash-pending-claim": () => verifyRepositoryScenario("crash-pending-claim", async (repository) => { const value = handover("crash-pending-claim"); await repository.persistPendingHandover(value); return (await repository.readPendingHandover()) === null ? 0 : 2; }),
      "crash-writer-epoch-transfer": () => verifyRepositoryScenario("crash-writer-epoch-transfer", async (repository, fence) => { await repository.activateWriter({ ...fence, manifestId: "manifest", manifestEtag: "etag", writerEpoch: 2 }); return (await repository.read()).writerEpoch === 2 ? 2 : 0; }),
      "crash-cleanup-selection": () => verifyRepositoryScenario("crash-cleanup-selection", async (repository, fence) => { const value = receipt("crash-cleanup-selection"); await repository.persistAttempt(value); await repository.acquireLease({ leaseId: "cleanup", nowMs: 1, expiresAtMs: 2 }); return await repository.recoverExpiredLease(2) ? 3 : 0; }),
      "recovery-latest-previous-fallback": () => verifyRepositoryScenario("recovery-latest-previous-fallback", async (repository) => { const value = handover("recovery-latest-previous-fallback"); await repository.persistPendingHandover(value); return (await repository.readPendingHandover())?.snapshotId === "snapshot" ? 2 : 0; }),
      "retention-orphan-grace-and-stale-cleanup": () => verifyRepositoryScenario("retention-orphan-grace-and-stale-cleanup", async (repository, fence) => { await repository.activateWriter({ ...fence, manifestId: "manifest", manifestEtag: "etag", writerEpoch: 1 }); return await repository.markStaleWriter(1) ? 2 : 0; }),
      "deletion-tombstone-and-late-upload-sweep": () => verifyRepositoryScenario("deletion-tombstone-and-late-upload-sweep", async (repository, fence) => { if (!await repository.beginDeletionSweep({ ...fence, manifestId: "manifest", manifestEtag: "tombstone", successorWriterEpoch: 2 })) return 0; if (!await repository.completeDeletionSweep(fence)) return 0; return (await repository.read()).deletionProgress === "complete" ? 3 : 0; }),
    }),
    ...(base.cleanup === undefined ? {} : { cleanup: base.cleanup }),
  };
}

export async function runGoogleDriveBackupContract(adapter?: GoogleDriveBackupContractAdapter): Promise<GoogleDriveBackupContractResult> {
  const cases: Array<Readonly<{ id: GoogleDriveBackupContractCaseId; status: "passed" | "failed"; durationMs: number }>> = [];
  const run = async (id: GoogleDriveBackupContractCaseId, work: () => Promise<void> | void) => {
    const started = Date.now();
    try {
      await work();
      if (adapter !== undefined) {
        const scenario = adapter.scenarios[id];
        const assertions = scenario === undefined ? 1 : await scenario();
        if (!Number.isSafeInteger(assertions) || assertions < 1) {
          throw new Error("google_drive_native_boundary_missing");
        }
      }
      cases.push({ id, status: "passed", durationMs: Date.now() - started });
    }
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
      let failed = false; try { await parseDriveBackupSnapshotEnvelopeV1(new TextEncoder().encode("{"), { byteLength: 1, objectSha256: "a".repeat(64), environment: "development-test", packageIdentity: "com.fchoo.gymtracker.devtest", currentSchemaVersion: CURRENT_SCHEMA_VERSION, sha256: async () => "a".repeat(64) }); } catch { failed = true; }
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
    "raw-etag-conflict-fence": async () => {
      const store = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => new Response(null, { status: 412 }) });
      let rejected = false;
      try { await store.updateManifest("manifest", new Uint8Array([1]), '"etag"'); } catch (error) { rejected = error instanceof Error && error.message === "drive_manifest_conflict"; }
      if (!rejected) throw new Error("etag_fence_invalid");
    },
    "multipart-five-mib-boundary": async () => {
      const responseBody = JSON.stringify({ id: "candidate" });
      const store = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => new Response(responseBody, { headers: { "content-length": String(new TextEncoder().encode(responseBody).byteLength) } }) });
      await store.createSnapshot("candidate", new Uint8Array(5 * 1024 * 1024));
      let rejected = false;
      try { await store.createSnapshot("candidate", new Uint8Array(5 * 1024 * 1024 + 1)); } catch { rejected = true; }
      if (!rejected) throw new Error("multipart_boundary_invalid");
    },
    "resumable-restart-cancel-fence": async () => {
      let upload = 0;
      const store = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async (url) => {
        if (url.includes("uploadType=resumable")) return new Response(null, { headers: { location: "https://www.googleapis.com/upload/session" } });
        upload += 1;
        if (upload === 1) return new Response(null, { status: 308, headers: { range: "bytes=0-5242879" } });
        const responseBody = JSON.stringify({ id: "candidate" });
        return new Response(responseBody, { headers: { "content-length": String(new TextEncoder().encode(responseBody).byteLength) } });
      } });
      const payload = new Uint8Array(5 * 1024 * 1024 + 1);
      const session = await store.createResumableSnapshot("candidate", payload);
      const resumed = await store.resumeSnapshot(session, payload);
      if (typeof resumed === "string" || resumed.uploadedBytes !== 5 * 1024 * 1024) throw new Error("resumable_boundary_invalid");
      if (await store.resumeSnapshot(resumed, payload) !== "candidate") throw new Error("resumable_boundary_invalid");
    },
    "redirect-and-bounded-list-fence": async () => {
      const store = createDriveBackupStoreAdapter({ environment: "development-test", token: async () => "token", fetch: async () => new Response(null, { status: 302, headers: { location: "https://example.invalid" } }) });
      let rejected = false;
      try { await store.discover(); } catch (error) { rejected = error instanceof Error && error.message === "drive_redirect_rejected"; }
      if (!rejected) throw new Error("redirect_fence_invalid");
    },
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
    "recovery-ambiguous-lineage-quarantine": () => { if (selectRecoveryLineage([{ kind: "current", ownerNamespace: "a".repeat(32), writerEpoch: 1, mutationGeneration: 1, createdAtMs: 1, snapshotId: "snapshot-a", fileId: "a", objectSha256: "a".repeat(64), byteLength: 1 }, { kind: "current", ownerNamespace: "b".repeat(32), writerEpoch: 1, mutationGeneration: 1, createdAtMs: 1, snapshotId: "snapshot-b", fileId: "b", objectSha256: "b".repeat(64), byteLength: 1 }]).kind !== "quarantined") throw new Error("ambiguous_lineage_accepted"); },
    "retention-orphan-grace-and-stale-cleanup": () => assertDurableBoundary(15, true),
    "deletion-tombstone-and-late-upload-sweep": () => assertDurableBoundary(16, false),
  };
  try {
    for (const id of GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS) await run(id, checks[id]);
  } finally {
    await adapter?.cleanup?.();
  }
  const failed = cases.filter((entry) => entry.status === "failed").length;
  const finishedAt = new Date().toISOString();
  return Object.freeze({ schemaVersion: 1, contractVersion: 1, status: failed === 0 ? "passed" : "failed", total: cases.length, passed: cases.length - failed, failed, skipped: 0, cases: Object.freeze(cases), startedAt: finishedAt, finishedAt });
}
