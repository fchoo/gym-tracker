import { describe, expect, it } from "@jest/globals";
import {
  GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS,
  runGoogleDriveBackupContract,
} from "./googleDriveBackup.contract";

describe("google Drive backup contract", () => {
  it("keeps a durable companion pending until its await rejects and propagates cleanup failure", async () => {
    const stages: string[] = [];
    let reject!: (error: Error) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const scenario = () => { entered(); return new Promise<number>((_resolve, fail) => { reject = fail; }); };
    const pending = runGoogleDriveBackupContract({ scenarios: { "generation-receipt-fence": scenario } }, (stage) => { stages.push(stage); throw new Error("observer_failed"); });
    await started;
    expect(stages.at(-1)).toBe("case-1:durable:start");
    expect(stages).not.toContain("case-1:passed");
    reject(new Error("durable_rejected"));
    const result = await pending;
    expect(result.failed).toBe(1);
    expect(stages).not.toContain("case-1:durable:done");
    expect(stages).toContain("case-1:failed");
    const cleanupFailure = new Error("cleanup_must_propagate");
    await expect(runGoogleDriveBackupContract({
      scenarios: {},
      cleanup: async () => { throw cleanupFailure; },
    }, () => { throw new Error("observer_failed"); })).rejects.toBe(cleanupFailure);
  });
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
    const stages: string[] = [];
    const result = await runGoogleDriveBackupContract(undefined, (stage) => { stages.push(stage); throw new Error("observer_failed"); });
    expect(stages).toEqual(GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS.flatMap((_id, index) => [
      `case-${index + 1}:start`, `case-${index + 1}:check:start`, `case-${index + 1}:check:done`, `case-${index + 1}:passed`,
    ]));
    expect(result.status).toBe("passed");
    expect(result.cases.map((entry) => entry.id)).toEqual(GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS);
    expect(result.skipped).toBe(0);
  });

  it("rejects a native adapter that does not execute the expected durable boundary", async () => {
    const stages: string[] = [];
    const result = await runGoogleDriveBackupContract({
      scenarios: Object.fromEntries(GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS.map((caseId) => [
        caseId,
        async () => caseId === "generation-receipt-fence" ? 0 : 1,
      ])) as never,
    }, (stage) => { stages.push(stage); throw new Error("observer_failed"); });
    expect(stages.slice(0, 6)).toEqual([
      "case-1:start", "case-1:check:start", "case-1:check:done", "case-1:durable:start", "case-1:durable:done", "case-1:failed",
    ]);
    expect(result.status).toBe("failed");
    expect(result.failed).toBeGreaterThan(0);
    expect(result.cases.find(({ id }) => id === "generation-receipt-fence")?.status).toBe("failed");
  });
});
