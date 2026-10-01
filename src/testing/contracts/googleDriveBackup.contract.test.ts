import { describe, expect, it } from "@jest/globals";
import {
  GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS,
  runGoogleDriveBackupContract,
} from "./googleDriveBackup.contract";

describe("google Drive backup contract", () => {
  it("keeps the host and Expo persistence matrix exhaustive and source-owned", async () => {
    expect(GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS).toEqual([
      "generation-receipt-fence", "quarantine-does-not-publish", "single-flight-idle-scheduler",
      "manifest-size-boundaries", "snapshot-size-boundaries", "payload-row-string-boundaries",
      "malformed-and-truncated-payloads", "cross-environment-and-namespace-rejection",
      "digest-and-schema-rejection", "auth-identity-and-scope-fence", "raw-etag-conflict-fence",
      "multipart-five-mib-boundary", "resumable-restart-cancel-fence", "redirect-and-bounded-list-fence",
      "crash-quarantine-persist", "crash-candidate-upload", "crash-round-trip-validation",
      "crash-manifest-promotion", "crash-manifest-reread", "crash-local-acknowledgement",
      "crash-direct-restore-commit", "crash-merge-adoption-commit", "crash-pending-claim",
      "crash-writer-epoch-transfer", "crash-cleanup-selection", "recovery-latest-previous-fallback",
      "recovery-future-schema-quarantine", "recovery-ambiguous-lineage-quarantine",
      "retention-orphan-grace-and-stale-cleanup", "deletion-tombstone-and-late-upload-sweep",
    ]);
    const result = await runGoogleDriveBackupContract();
    expect(result.status).toBe("passed");
    expect(result.cases.map((entry) => entry.id)).toEqual(GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS);
    expect(result.skipped).toBe(0);
  });

  it("rejects a native adapter that does not execute the expected durable boundary", async () => {
    const result = await runGoogleDriveBackupContract({
      scenarios: Object.fromEntries(GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS.map((caseId) => [
        caseId,
        async () => caseId === "generation-receipt-fence" ? 0 : 1,
      ])) as never,
    });
    expect(result.status).toBe("failed");
    expect(result.failed).toBeGreaterThan(0);
    expect(result.cases.find(({ id }) => id === "generation-receipt-fence")?.status).toBe("failed");
  });
});
