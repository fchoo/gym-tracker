import { describe, expect, it, jest } from "@jest/globals";

const mockCreateGoogleAuthAdapter = jest.fn(() => ({
  accessToken: () => null,
  reauthenticate: async () => null,
}));
const mockState = {
  read: jest.fn(async () => ({
    permissionId: "google-permission", statusCode: "idle", authorityState: "active",
    mutationGeneration: 4, backedUpGeneration: 4, dirtySinceMs: null,
    dataUsePolicy: "any-network", accountDisplayLabel: "Owner",
  })),
  setDataUsePolicy: jest.fn(async () => undefined),
};
const mockLocalFacts = {
  read: jest.fn(async () => ({
    schemaVersion: 26, ownerNamespace: "local-owner", tables: { workout_sessions: [], portable_owner_identity: [] },
  })),
};
const mockCapture = jest.fn(async () => ({
  generation: 7,
  snapshot: { version: 2, schemaVersion: 26, tables: {}, catalogReferences: [], manifest: {}, snapshotId: "snapshot", createdAtMs: 1 },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        buildProfile: "development-test",
        googleOAuth: { webClientId: "1234567890-test.apps.googleusercontent.com" },
      },
    },
  },
}));

jest.mock("../platform/google/googleAuthAdapter", () => ({ createGoogleAuthAdapter: mockCreateGoogleAuthAdapter }));
jest.mock("../platform/sqlite/repositories/automaticBackupStateRepository", () => ({
  createAutomaticBackupStateRepository: () => mockState,
}));
jest.mock("../domains/backup/automaticBackupCoordinator", () => ({
  createAutomaticBackupCoordinator: jest.fn(() => ({
    connect: jest.fn(async () => undefined), deferRecovery: jest.fn(async () => undefined),
    abortChecking: jest.fn(async () => undefined), checkAgain: jest.fn(async () => undefined),
    prepareRecovery: jest.fn(async () => ({ kind: "empty_direct" as const, attemptId: "attempt" })),
    commitRecovery: jest.fn(async () => undefined), disconnect: jest.fn(async () => undefined),
    finishDeletionSweep: jest.fn(async () => undefined), backup: jest.fn(async () => undefined),
  })),
}));
jest.mock("../domains/backup/automaticBackupScheduler", () => ({
  createAutomaticBackupScheduler: jest.fn(() => ({ request: jest.fn(async () => undefined) })),
}));
jest.mock("../domains/portability/automaticPortability", () => ({
  createAutomaticPortableRestorePort: jest.fn(() => ({ restore: async () => ({ state: "ready" as const }) })),
  createAutomaticPortableMergePort: jest.fn(() => ({
    preflight: async () => ({ token: "merge-token" }),
    commit: async () => ({ state: "ready" as const }),
  })),
}));
jest.mock("../platform/sqlite/repositories/restorePreflightAdapters", () => ({
  createSqliteRestoreSchemaPort: () => ({ columnsFor: async () => [] }),
  createSqliteRestoreRetainedReferencePort: () => ({ hasRetainedIdentity: async () => false }),
  createSqliteRestoreCandidateProbe: () => ({ validateCandidate: async () => undefined }),
  createSqliteMergeLocalFactsPort: () => mockLocalFacts,
}));
jest.mock("./productionAutomaticSnapshotCapture", () => ({
  createProductionAutomaticSnapshotCapture: jest.fn(() => ({
    capture: mockCapture,
    sweepOrphans: async () => 0,
  })),
}));
jest.mock("../platform/sqlite/repositories/logicalMergeRepository", () => ({
  createFullPlanLogicalMergeWriter: () => ({ commitFullPlan: async () => ({ state: "ready" as const }) }),
}));
jest.mock("../domains/portability/mergePlan", () => ({
  buildPortableMergePlan: async () => ({}),
}));
jest.mock("../platform/sqlite/repositories/restoreReconciliationRepository", () => ({
  createRestoreReconciliationRepository: () => ({ reconcileAndRebuild: async () => undefined }),
}));

import {
  createProductionAutomaticBackupServices,
  fetchGoogleDriveIdentity,
} from "./productionAutomaticBackupRuntime";

describe("production automatic-backup composition", () => {
  it("verifies identity through the Drive about permission schema", async () => {
    const payload = {
      user: {
        permissionId: "permission",
        emailAddress: "owner@example.com",
      },
    };
    const request = jest.fn(async () => ({
      ok: true,
      json: async () => payload,
    } as Response));

    await expect(fetchGoogleDriveIdentity("access-token", request))
      .resolves.toEqual(payload);
    expect(request).toHaveBeenCalledWith(
      "https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress)",
      { headers: { Authorization: "Bearer access-token" } },
    );
    await expect(fetchGoogleDriveIdentity("access-token", async () => ({
      ok: false,
    } as Response))).rejects.toThrow("google_identity_lookup_failed");
  });

  it("constructs one cached Drive-only runtime for the SQLite kernel", () => {
    const kernel = {
      queryAll: jest.fn(async () => []),
      queryFirst: jest.fn(async () => null),
      execute: jest.fn(async () => undefined),
      transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work(kernel)),
    } as never;

    const first = createProductionAutomaticBackupServices(kernel);
    const second = createProductionAutomaticBackupServices(kernel);

    expect(first).toBe(second);
    expect(mockCreateGoogleAuthAdapter).toHaveBeenCalledWith(expect.objectContaining({
      webClientId: "1234567890-test.apps.googleusercontent.com",
    }));
    expect(first.runtime.current()).toMatchObject({ status: "paused", reason: "unavailable" });
  });

  it("routes every owner command through the production state, coordinator, and scheduler seams", async () => {
    const kernel = {} as never;
    const { runtime } = createProductionAutomaticBackupServices(kernel);
    const candidate = { fileId: "snapshot", createdAtMs: 1, schemaVersion: 26, sourceDigest: "digest" } as never;
    const recovery = { attemptId: "attempt", mode: "restore" as const } as never;

    await runtime.start(); await runtime.connect(); await runtime.deferRestore(); await runtime.cancelChecking();
    await runtime.checkAgain(); await runtime.continueRestore();
    await expect(runtime.prepareRecovery({ candidate })).resolves.toEqual({ kind: "empty_direct", attemptId: "attempt" });
    await runtime.commitRecovery(recovery); await runtime.finishSetup(); await runtime.backupNow(); await runtime.retryBackup();
    await runtime.useCellularThisTime(); await runtime.setDataUsePolicy("wifi_only"); await runtime.takeOver();
    await runtime.disconnect(); await expect(runtime.deleteCloudBackup()).rejects.toThrow("automatic_delete_requires_tombstone_confirmation");
    await runtime.finishDeletingCloudBackup(); await runtime.startNewCloudBackup();

    const coordinatorModule = jest.requireMock("../domains/backup/automaticBackupCoordinator") as { createAutomaticBackupCoordinator: jest.Mock };
    const schedulerModule = jest.requireMock("../domains/backup/automaticBackupScheduler") as { createAutomaticBackupScheduler: jest.Mock };
    const activeCoordinator = coordinatorModule.createAutomaticBackupCoordinator.mock.results.at(-1)?.value as {
      prepareRecovery: jest.Mock; commitRecovery: jest.Mock;
    };
    const activeScheduler = schedulerModule.createAutomaticBackupScheduler.mock.results.at(-1)?.value as { request: jest.Mock };
    expect(mockState.setDataUsePolicy).toHaveBeenCalledWith("wifi-only");
    expect(activeCoordinator.prepareRecovery).toHaveBeenCalledWith({ candidate });
    expect(activeCoordinator.commitRecovery).toHaveBeenCalledWith(recovery);
    expect(activeScheduler.request).toHaveBeenNthCalledWith(1, "manual");
    expect(activeScheduler.request).toHaveBeenNthCalledWith(2, "retry");
    expect(activeScheduler.request).toHaveBeenNthCalledWith(3, "manual");
    expect(activeScheduler.request).toHaveBeenNthCalledWith(4, "manual");
  });

  it("binds recovery, merge, capture, and scheduling callbacks to the active local facts", async () => {
    const kernel = { queryAll: jest.fn(async () => []) } as never;
    createProductionAutomaticBackupServices(kernel);
    const portability = jest.requireMock("../domains/portability/automaticPortability") as {
      createAutomaticPortableRestorePort: jest.Mock;
      createAutomaticPortableMergePort: jest.Mock;
    };
    const restore = portability.createAutomaticPortableRestorePort.mock.calls.at(-1)?.[0] as any;
    const merge = portability.createAutomaticPortableMergePort.mock.calls.at(-1)?.[0] as any;
    const coordinator = (jest.requireMock("../domains/backup/automaticBackupCoordinator") as { createAutomaticBackupCoordinator: jest.Mock }).createAutomaticBackupCoordinator.mock.calls.at(-1)?.[0] as any;
    const scheduler = (jest.requireMock("../domains/backup/automaticBackupScheduler") as { createAutomaticBackupScheduler: jest.Mock }).createAutomaticBackupScheduler.mock.calls.at(-1)?.[0] as any;
    const remote = { schemaVersion: 26, tables: { portable_owner_identity: [{ owner_namespace: "remote-owner" }] } };

    await expect(restore.localIsEmpty()).resolves.toBe(true);
    await expect(restore.claimIsCurrent()).resolves.toBe(false);
    await restore.rebuild();
    await expect(merge.local()).resolves.toEqual({ version: 2, schemaVersion: 26, tables: mockLocalFacts.read.mock.results[0]?.value === undefined ? {} : expect.anything() });
    expect(merge.archive(remote as never)).toEqual({ version: 2, schemaVersion: 26, tables: remote.tables });
    await merge.build({ archive: { version: 2, schemaVersion: 26, tables: {} }, local: { version: 2, schemaVersion: 26, tables: {} } });
    await merge.fingerprint();
    const token = merge.issue({ plan: {}, fingerprint: "fingerprint" });
    expect(merge.consume(token)).toEqual({ plan: {}, fingerprint: "fingerprint" });
    expect(merge.consume(token)).toBeNull();
    await merge.commitPlan({ plan: {}, fingerprint: "fingerprint" }); await merge.rebuild();
    expect(coordinator.isWorkoutActive()).toBe(false); expect(coordinator.validate()).toBe(true);
    await expect(coordinator.capture()).resolves.toEqual(expect.objectContaining({ generation: 7 }));
    expect(mockCapture).toHaveBeenCalledWith(expect.objectContaining({ snapshotId: expect.stringContaining("snapshot-") }));
    expect(coordinator.validateManifest(new TextEncoder().encode("invalid"))).toBeNull();
    expect(new TextDecoder().decode(coordinator.buildManifest({ candidateId: "candidate", state: { writerEpoch: 2 }, captured: { sourceDigest: "digest" } }))).toContain("candidate");
    await expect(coordinator.recovery.parseSnapshot(new TextEncoder().encode("{}"))).rejects.toThrow("automatic_recovery_snapshot_invalid");
    await expect(coordinator.recovery.localIsEmpty()).resolves.toBe(true);
    await expect(coordinator.recovery.prepareMerge(remote as never)).resolves.toEqual({ token: "merge-token", ownerSummary: "A different backup identity", adoptionRequired: true });
    await coordinator.recovery.restore(remote as never); await coordinator.recovery.commitMerge({ token: "merge-token" });
    await expect(coordinator.recovery.freshAdoptionGrant()).rejects.toThrow("automatic_recovery_reauthentication_cancelled");
    await expect(scheduler.isWorkoutActive()).resolves.toBe(false); await expect(scheduler.eligible()).resolves.toBe(true);
    scheduler.queue(() => undefined); await scheduler.run();
  });
});
