import { expect, test } from "@jest/globals";
import { phase12BackupFixtureFromNativeContract, phase12BackupFixtureViewModel } from "./phase12BackupTestControls";

test("Phase 12 controls reject production and unknown fixture activation", () => {
  expect(phase12BackupFixtureFromNativeContract({ suite: "phase12", fixture: "restore_required", nativeContractsEnabled: false, buildProfile: "production" })).toBeNull();
  expect(phase12BackupFixtureFromNativeContract({ suite: "production", fixture: "restore_required", nativeContractsEnabled: true, buildProfile: "development-test" })).toBeNull();
  expect(phase12BackupFixtureFromNativeContract({ suite: "phase12", fixture: "real-account", nativeContractsEnabled: true, buildProfile: "development-test" })).toBeNull();
  expect(phase12BackupFixtureFromNativeContract({ suite: "phase12", fixture: "restore_required", nativeContractsEnabled: true, buildProfile: "development-test" })).toBe("restore_required");
});

test("every Phase 12 stage projects a distinct bounded production facade model", () => {
  const stages = ["disconnected", "no_cloud", "backup_pending", "backing_up", "backed_up", "auth_attention", "checking", "restoring", "finishing", "restore_required", "merge_review", "previous_available", "update_required", "invalid_artifacts", "pending_24h", "stale_writer", "deleted", "deletion_partial"] as const;
  const models = stages.map((stage) => JSON.stringify(phase12BackupFixtureViewModel(stage)));
  expect(new Set(models).size).toBe(stages.length);
  expect(models.join("\n")).not.toMatch(/token|etag|permissionId|fileId|ownerNamespace/u);
});
