import { describe, expect, it } from "@jest/globals";
import { projectAutomaticBackupPresentation } from "./automaticBackupPresentation";

describe("automatic backup presentation", () => {
  it("keeps the 24-hour stale warning bounded to verified receipt state", () => {
    const base = { status: "backup_pending" as const, mutationGeneration: 2, backedUpGeneration: 1, pendingSinceMs: 0, nowMs: 24 * 60 * 60 * 1000 };
    expect(projectAutomaticBackupPresentation({ ...base, nowMs: base.nowMs - 1 }).warning).toBeNull();
    expect(projectAutomaticBackupPresentation(base).warning).toBe("changes_not_backed_up_24h");
    expect(projectAutomaticBackupPresentation({ ...base, backedUpGeneration: 2 }).warning).toBeNull();
  });

  it("projects future schema recovery into a safe check-again state without provider details", () => {
    const model = projectAutomaticBackupPresentation({ status: "restore_pending", mutationGeneration: 1, backedUpGeneration: 0, nowMs: 1, reason: "update_required", accountLabel: "  Owner account  " });
    expect(model).toMatchObject({ accountLabel: "Owner account", reason: "update_required", primaryAction: "check_again" });
    expect(JSON.stringify(model)).not.toMatch(/token|etag|writer|manifest/i);
  });

  it("exposes only stage-appropriate recovery and deletion actions", () => {
    const base = { status: "restore_pending" as const, mutationGeneration: 1, backedUpGeneration: 0, nowMs: 1 };
    expect(projectAutomaticBackupPresentation({ ...base, progressStage: "Checking backup" }).primaryAction).toBe("cancel_check");
    expect(projectAutomaticBackupPresentation({ ...base, status: "restoring", progressStage: "Finishing backup setup" }).primaryAction).toBe("finish_setup");
    expect(projectAutomaticBackupPresentation({ ...base, status: "paused", reason: "deleted" }).primaryAction).toBeNull();
    expect(projectAutomaticBackupPresentation({ ...base, status: "paused", reason: "deletion_partial" }).primaryAction).toBeNull();
  });
});
