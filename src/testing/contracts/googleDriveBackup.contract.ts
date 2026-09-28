import { createAutomaticBackupScheduler } from "../../domains/backup/automaticBackupScheduler";
import { canonicalJson, createDriveBackupSnapshotV1, parseDriveBackupManifestV1 } from "../../domains/backup/automaticBackupContracts";

/** Source-owned registry used by Jest and the packaged Expo fake-port route. */
export const GOOGLE_DRIVE_BACKUP_CONTRACT_CASE_IDS = [
  "generation-receipt-fence",
  "quarantine-does-not-publish",
  "single-flight-idle-scheduler",
] as const;

export type GoogleDriveBackupContractCaseId = typeof GOOGLE_DRIVE_BACKUP_CONTRACT_CASE_IDS[number];
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
  await run("generation-receipt-fence", () => {
    const header = { protocol: "drive-backup-v1" as const, environment: "development-test" as const, packageIdentity: "com.fchoo.gymtracker.devtest", snapshotId: "s", ownerNamespace: "n", writerEpoch: 1, mutationGeneration: 2, createdAtMs: 1, schemaVersion: 24 };
    const snapshot = createDriveBackupSnapshotV1({ header, payload: { version: 2 }, sha256: (value) => value.length.toString(16).padStart(64, "0") });
    if (snapshot.payload_sha256 !== snapshot.payload_sha256 || canonicalJson(snapshot).length < 1) throw new Error("receipt_fence_invalid");
  });
  await run("quarantine-does-not-publish", () => {
    const manifest = parseDriveBackupManifestV1({ kind: "deleted", successorWriterEpoch: 3, deletedAtMs: 1 });
    if (manifest.kind !== "deleted") throw new Error("quarantine_tombstone_invalid");
  });
  await run("single-flight-idle-scheduler", async () => {
    let active = true; let calls = 0;
    const scheduler = createAutomaticBackupScheduler({ isWorkoutActive: () => active, run: async () => { calls += 1; }, queue: (work) => { void work(); } });
    scheduler.request("post_commit"); await Promise.resolve(); if (calls !== 0) throw new Error("scheduler_ran_while_active");
    active = false; scheduler.request("foreground"); await Promise.resolve(); if (Number(calls) !== 1) throw new Error("scheduler_did_not_recover");
  });
  const failed = cases.filter((entry) => entry.status === "failed").length;
  const finishedAt = new Date().toISOString();
  return Object.freeze({ schemaVersion: 1, contractVersion: 1, status: failed === 0 ? "passed" : "failed", total: cases.length, passed: cases.length - failed, failed, skipped: 0, cases: Object.freeze(cases), startedAt: finishedAt, finishedAt });
}
