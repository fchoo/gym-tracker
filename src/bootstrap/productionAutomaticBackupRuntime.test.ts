import { describe, expect, it, jest } from "@jest/globals";
import { LOGICAL_BACKUP_TABLES } from "../domains/portability/backupContracts";

const mockCreateGoogleAuthAdapter = jest.fn(() => ({
  accessToken: () => null,
  reauthenticate: async () => null,
}));
const mockState = {
  read: jest.fn(async () => ({
    permissionId: "google-permission", statusCode: "idle", authorityState: "active",
    manifestId: "manifest" as string | null,
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
  snapshot: {
    version: 2,
    schemaVersion: 26,
    tables: {
      ...Object.fromEntries(LOGICAL_BACKUP_TABLES.map((table) => [table, []])),
      portable_owner_identity: [{ id: 1, owner_namespace: "a".repeat(32) }],
    },
    catalogReferences: [],
    manifest: {
      catalogReferenceCount: 0,
      rowCounts: {
        ...Object.fromEntries(LOGICAL_BACKUP_TABLES.map((table) => [table, 0])),
        portable_owner_identity: 1,
      },
      totalRows: 1,
    },
    snapshotId: "snapshot",
    createdAtMs: 1,
  },
}));
const mockCoordinatorConnect = jest.fn<() => Promise<{
  status: "ready" | "needs_bootstrap";
}>>(async () => ({ status: "ready" }));
const mockCoordinatorBackup = jest.fn(async () => ({ status: "backed_up" as const }));
const mockCoordinatorCheckAgain = jest.fn<() => Promise<{
  status: "ready" | "needs_bootstrap" | "quarantined";
}>>(async () => ({ status: "ready" }));
const mockCoordinatorTakeOver = jest.fn(async () => ({ status: "quarantined" as const }));
const mockCoordinatorDeleteCloudBackup = jest.fn(async () => ({ status: "complete" as const }));
const mockCoordinatorStartNewCloudBackup = jest.fn(async () => ({ status: "ready" as const }));
const mockCoordinatorPrepareRecovery = jest.fn<() => Promise<
  | Readonly<{ kind: "empty_direct"; attemptId: string }>
  | Readonly<{ kind: "merge"; attemptId: string; token: string; ownerSummary: string; adoptionRequired: boolean }>
>>(async () => ({
  kind: "empty_direct" as const,
  attemptId: "attempt",
}));
const mockCoordinatorCommitRecovery = jest.fn(async () => ({ state: "ready" as const }));
const mockCoordinatorDeferRecovery = jest.fn(async () => undefined);
const mockValidateLogicalRestoreSnapshot = jest.fn<(...args: any[]) => Promise<void>>(async () => undefined);
const mockValidateCandidate = jest.fn(async () => undefined);

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
jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (_algorithm: string, value: string) => require("node:crypto").createHash("sha256").update(value).digest("hex"),
  randomUUID: () => "00000000-0000-4000-8000-000000000000",
}));

jest.mock("../platform/google/googleAuthAdapter", () => ({ createGoogleAuthAdapter: mockCreateGoogleAuthAdapter }));
jest.mock("../platform/sqlite/repositories/automaticBackupStateRepository", () => ({
  createAutomaticBackupStateRepository: () => mockState,
}));
jest.mock("../domains/backup/automaticBackupCoordinator", () => ({
  createAutomaticBackupCoordinator: jest.fn(() => ({
    connect: mockCoordinatorConnect, deferRecovery: mockCoordinatorDeferRecovery,
    abortChecking: jest.fn(async () => undefined), checkAgain: mockCoordinatorCheckAgain, takeOver: mockCoordinatorTakeOver,
    prepareRecovery: mockCoordinatorPrepareRecovery,
    commitRecovery: mockCoordinatorCommitRecovery, cancelRecovery: jest.fn(async () => undefined), disconnect: jest.fn(async () => undefined),
    deleteCloudBackup: mockCoordinatorDeleteCloudBackup, startNewCloudBackup: mockCoordinatorStartNewCloudBackup, finishDeletionSweep: jest.fn(async () => undefined), backup: mockCoordinatorBackup,
    recoveryOutcome: jest.fn(() => "unknown"),
  })),
}));
jest.mock("../domains/backup/automaticBackupScheduler", () => ({
  createAutomaticBackupScheduler: jest.fn(() => ({ request: jest.fn(async () => undefined), cancel: jest.fn() })),
}));
jest.mock("../domains/portability/automaticPortability", () => ({
  createAutomaticPortableRestorePort: jest.fn(() => ({ restore: async () => ({ state: "ready" as const }) })),
  createAutomaticPortableMergePort: jest.fn(() => ({
    preflight: async () => ({ token: "merge-token", adoptionRequired: true }),
    commit: async () => ({ state: "ready" as const }),
  })),
}));
jest.mock("../platform/sqlite/repositories/restorePreflightAdapters", () => ({
  createSqliteRestoreSchemaPort: () => ({ columnsFor: async () => [] }),
  createSqliteRestoreRetainedReferencePort: () => ({ hasRetainedIdentity: async () => false }),
  createSqliteRestoreCandidateProbe: () => ({ validateCandidate: mockValidateCandidate }),
  createSqliteMergeLocalFactsPort: () => mockLocalFacts,
}));
jest.mock("../domains/portability/restoreCommands", () => ({
  ...(jest.requireActual("../domains/portability/restoreCommands") as object),
  validateLogicalRestoreSnapshot: (...args: unknown[]) => mockValidateLogicalRestoreSnapshot(...args),
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
  assertAutomaticDriveSnapshotBytes,
  productionAutomaticBackupPresentationInput,
  validatedRecoveryCandidateFromDriveObject,
  localPortableFactsAreEmpty,
} from "./productionAutomaticBackupRuntime";

describe("production automatic-backup composition", () => {
  it("projects durable recovery and deletion states into production UI states", () => {
    const current = {
      environment: "development-test" as const, permissionId: "permission", displayEmail: null,
      accountDisplayLabel: "Owner", connectionGeneration: 1, writerEpoch: 2,
      mutationGeneration: 4, backedUpGeneration: 4, manifestId: "manifest", manifestEtag: "etag",
      authorityState: "quarantine" as const, dirtySinceMs: null, lastAttemptMs: null,
      lastSuccessMs: null, dataUsePolicy: "any-network" as const, claimId: null,
      claimExpiresAtMs: null, statusCode: "checking" as const, deletionProgress: "none" as const,
    };
    expect(productionAutomaticBackupPresentationInput(current, { kind: "latest" }, false, 1))
      .toMatchObject({ status: "restore_pending", progressStage: "Checking backup", reason: null });
    expect(productionAutomaticBackupPresentationInput({ ...current, statusCode: "finishing" }, { kind: "latest" }, false, 1))
      .toMatchObject({ status: "restoring", progressStage: "Finishing backup setup" });
    expect(productionAutomaticBackupPresentationInput({ ...current, statusCode: "restore_pending" }, { kind: "latest" }, true, 1))
      .toMatchObject({ reason: "merge_review" });
    expect(productionAutomaticBackupPresentationInput({ ...current, authorityState: "deleted", deletionProgress: "complete", statusCode: "idle" }, null, false, 1))
      .toMatchObject({ status: "paused", reason: "deleted" });
    expect(productionAutomaticBackupPresentationInput({ ...current, authorityState: "deleted", deletionProgress: "sweep_pending", statusCode: "paused" }, null, false, 1))
      .toMatchObject({ status: "paused", reason: "deletion_partial" });
    expect(productionAutomaticBackupPresentationInput({ ...current, manifestId: null, statusCode: "idle" }, null, false, 1, false, "needs_bootstrap"))
      .toMatchObject({ reason: "no_cloud" });
    expect(productionAutomaticBackupPresentationInput({ ...current, manifestId: null, statusCode: "restore_pending" }, { kind: "latest" }, false, 1, false, "restore_required"))
      .toMatchObject({ reason: "restore_required" });
    expect(productionAutomaticBackupPresentationInput({ ...current, manifestId: null, statusCode: "restore_pending" }, null, false, 1, false, "invalid_artifacts"))
      .toMatchObject({ reason: "invalid_artifacts" });
  });
  it("applies the 24 MiB limit to the final encoded Drive object", () => {
    expect(assertAutomaticDriveSnapshotBytes(new Uint8Array(24 * 1024 * 1024))).toHaveLength(24 * 1024 * 1024);
    expect(() => assertAutomaticDriveSnapshotBytes(new Uint8Array(24 * 1024 * 1024 + 1)))
      .toThrow("automatic_backup_snapshot_too_large");
  });
  it("re-encodes a persisted candidate identically across different wall-clock retries", async () => {
    const baseline = await mockCapture();
    const capturePersisted = async (input: { snapshotId?: string; createdAtMs: number }) => ({
      ...baseline,
      snapshot: { ...baseline.snapshot, snapshotId: input.snapshotId!, createdAtMs: input.createdAtMs },
    });
    mockCapture.mockImplementationOnce(capturePersisted).mockImplementationOnce(capturePersisted);
    createProductionAutomaticBackupServices({ queryAll: jest.fn(async () => []) } as never);
    const coordinator = (jest.requireMock("../domains/backup/automaticBackupCoordinator") as { createAutomaticBackupCoordinator: jest.Mock }).createAutomaticBackupCoordinator.mock.calls.at(-1)?.[0] as any;

    const first = await coordinator.capture({ environment: "development-test", writerEpoch: 2, snapshotId: "candidate", createdAtMs: 123 });
    const second = await coordinator.capture({ environment: "development-test", writerEpoch: 2, snapshotId: "candidate", createdAtMs: 123 });

    expect(second.sourceDigest).toBe(first.sourceDigest);
    expect(second.bytes).toEqual(first.bytes);
    expect(mockCapture).toHaveBeenNthCalledWith(mockCapture.mock.calls.length - 1, { snapshotId: "candidate", createdAtMs: 123 });
    expect(mockCapture).toHaveBeenLastCalledWith({ snapshotId: "candidate", createdAtMs: 123 });
  });
  it("classifies every owner-created logical fact as non-empty", () => {
    expect(localPortableFactsAreEmpty({
      portable_owner_identity: [{ id: 1, owner_namespace: "a".repeat(32) }],
    })).toBe(true);
    expect(localPortableFactsAreEmpty({
      portable_owner_identity: [{ id: 1, owner_namespace: "a".repeat(32) }],
      plans: [{ id: "owner-plan" }],
    })).toBe(false);
    expect(localPortableFactsAreEmpty({
      portable_owner_identity: [{ id: 1, owner_namespace: "a".repeat(32) }],
      app_settings: [{ key: "units", value_json: '"metric"' }],
    })).toBe(false);
  });

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

  it("publishes the first validated backup after empty-namespace discovery", async () => {
    const priorBackups = mockCoordinatorBackup.mock.calls.length;
    mockCoordinatorConnect.mockResolvedValueOnce({ status: "needs_bootstrap" });
    const kernel = {} as never;
    const { runtime } = createProductionAutomaticBackupServices(kernel);

    await runtime.connect();

    expect(mockCoordinatorBackup).toHaveBeenCalledTimes(priorBackups + 1);
  });

  it("publishes the pending first backup after discovery before upload completes", async () => {
    const disconnected = {
      permissionId: null, statusCode: "idle", authorityState: "quarantine",
      manifestId: null, mutationGeneration: 4, backedUpGeneration: 0, dirtySinceMs: 1,
      dataUsePolicy: "any-network", accountDisplayLabel: null, lastSuccessMs: null,
    };
    const pending = {
      ...disconnected,
      permissionId: "google-permission",
      accountDisplayLabel: "Owner",
    };
    const complete = {
      ...pending,
      authorityState: "active",
      manifestId: "manifest",
      backedUpGeneration: 4,
      lastSuccessMs: 2,
    };
    mockState.read
      .mockResolvedValueOnce(disconnected as never)
      .mockResolvedValueOnce(pending as never)
      .mockResolvedValueOnce(complete as never);
    mockCoordinatorConnect.mockResolvedValueOnce({ status: "needs_bootstrap" });
    let finishBackup: (() => void) | undefined;
    mockCoordinatorBackup.mockImplementationOnce(() => new Promise((resolve) => {
      finishBackup = () => resolve({ status: "backed_up" as const });
    }));
    const { runtime } = createProductionAutomaticBackupServices({} as never);
    const seen: string[] = [];
    await runtime.start();
    runtime.subscribe((model) => seen.push(model.status));

    const connecting = runtime.connect();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(finishBackup).toBeDefined();
    expect(seen).toContain("backup_pending");
    finishBackup?.();
    await connecting;
    expect(runtime.current().status).toBe("idle");
  });

  it("keeps a non-empty recovery quarantined for an explicit merge review", async () => {
    const commitsBefore = mockCoordinatorCommitRecovery.mock.calls.length;
    mockCoordinatorPrepareRecovery.mockResolvedValueOnce({
      kind: "merge",
      attemptId: "merge-attempt",
      token: "merge-token",
      ownerSummary: "This backup identity",
      adoptionRequired: false,
    });
    const { runtime } = createProductionAutomaticBackupServices({} as never);

    await expect(runtime.continueRestore())
      .rejects.toThrow("automatic_recovery_review_required");

    expect(mockCoordinatorCommitRecovery).toHaveBeenCalledTimes(commitsBefore);
  });

  it("returns a failed direct restore to the retryable quarantine state", async () => {
    mockCoordinatorPrepareRecovery.mockResolvedValueOnce({
      kind: "empty_direct",
      attemptId: "failed-attempt",
    });
    mockCoordinatorCommitRecovery.mockRejectedValueOnce(new Error("logical_restore_failed"));
    const deferralsBefore = mockCoordinatorDeferRecovery.mock.calls.length;
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const { runtime } = createProductionAutomaticBackupServices({} as never);

    await expect(runtime.continueRestore()).rejects.toThrow("logical_restore_failed");

    expect(mockCoordinatorDeferRecovery).toHaveBeenCalledTimes(deferralsBefore + 1);
    expect(warn).toHaveBeenCalledWith("[automatic-backup] recovery:logical_restore_failed");
    warn.mockRestore();
  });

  it("re-discovers an interrupted first backup before manual retry", async () => {
    const priorBackups = mockCoordinatorBackup.mock.calls.length;
    const priorChecks = mockCoordinatorCheckAgain.mock.calls.length;
    mockState.read.mockResolvedValueOnce({
      permissionId: "google-permission", statusCode: "idle", authorityState: "quarantine",
      manifestId: null, mutationGeneration: 4, backedUpGeneration: 0, dirtySinceMs: null,
      dataUsePolicy: "any-network", accountDisplayLabel: "Owner",
    });
    mockCoordinatorCheckAgain.mockResolvedValueOnce({ status: "needs_bootstrap" });
    const { runtime } = createProductionAutomaticBackupServices({} as never);

    await runtime.retryBackup();

    expect(mockCoordinatorCheckAgain).toHaveBeenCalledTimes(priorChecks);
    expect(mockCoordinatorBackup).toHaveBeenCalledTimes(priorBackups);

    mockState.read.mockResolvedValueOnce({
      permissionId: "google-permission", statusCode: "idle", authorityState: "quarantine",
      manifestId: null, mutationGeneration: 4, backedUpGeneration: 0, dirtySinceMs: null,
      dataUsePolicy: "any-network", accountDisplayLabel: "Owner",
    });
    mockCoordinatorCheckAgain.mockResolvedValueOnce({ status: "quarantined" });
    await runtime.backupNow();
    expect(mockCoordinatorBackup).toHaveBeenCalledTimes(priorBackups);

    const schedulerModule = jest.requireMock("../domains/backup/automaticBackupScheduler") as { createAutomaticBackupScheduler: jest.Mock };
    const schedulerInput = schedulerModule.createAutomaticBackupScheduler.mock.calls.at(-1)?.[0] as { run(): Promise<void> };
    mockState.read.mockResolvedValueOnce({
      permissionId: "google-permission", statusCode: "idle", authorityState: "quarantine",
      manifestId: null, mutationGeneration: 4, backedUpGeneration: 0, dirtySinceMs: null,
      dataUsePolicy: "any-network", accountDisplayLabel: "Owner",
    });
    mockCoordinatorCheckAgain.mockResolvedValueOnce({ status: "ready" });
    const readsBeforeScheduler = mockState.read.mock.calls.length;
    await schedulerInput.run();
    expect(mockCoordinatorBackup).toHaveBeenCalledTimes(priorBackups + 1);
    expect(mockState.read.mock.calls.length).toBe(readsBeforeScheduler + 2);
  });

  it("routes every owner command through the production state, coordinator, and scheduler seams", async () => {
    const priorBackups = mockCoordinatorBackup.mock.calls.length;
    const kernel = {} as never;
    const { runtime } = createProductionAutomaticBackupServices(kernel);
    const candidate = { fileId: "snapshot", createdAtMs: 1, schemaVersion: 26, sourceDigest: "digest" } as never;
    const recovery = { attemptId: "attempt", mode: "restore" as const } as never;

    await runtime.start(); await runtime.connect(); await runtime.deferRestore(); await runtime.cancelChecking();
    await runtime.checkAgain(); await runtime.continueRestore();
    await expect(runtime.prepareRecovery({ candidate })).resolves.toEqual({ kind: "empty_direct", attemptId: "attempt" });
    await runtime.commitRecovery(recovery); await runtime.finishSetup(); await runtime.backupNow(); await runtime.retryBackup();
    await runtime.useCellularThisTime(); await runtime.setDataUsePolicy("wifi_only"); await runtime.takeOver();
    await runtime.dismissCellularConfirmation();
    await runtime.disconnect(); await runtime.deleteCloudBackup();
    await runtime.finishDeletingCloudBackup(); await runtime.startNewCloudBackup();

    const coordinatorModule = jest.requireMock("../domains/backup/automaticBackupCoordinator") as { createAutomaticBackupCoordinator: jest.Mock };
    const schedulerModule = jest.requireMock("../domains/backup/automaticBackupScheduler") as { createAutomaticBackupScheduler: jest.Mock };
    const activeCoordinator = coordinatorModule.createAutomaticBackupCoordinator.mock.results.at(-1)?.value as {
      prepareRecovery: jest.Mock; commitRecovery: jest.Mock;
    };
    const activeScheduler = schedulerModule.createAutomaticBackupScheduler.mock.results.at(-1)?.value as { request: jest.Mock; cancel: jest.Mock };
    expect(mockState.setDataUsePolicy).toHaveBeenCalledWith("wifi-only");
    expect(activeCoordinator.prepareRecovery).toHaveBeenCalledWith({ candidate });
    expect(activeCoordinator.commitRecovery).toHaveBeenCalledWith(recovery);
    expect(mockCoordinatorTakeOver).toHaveBeenCalled();
    expect(mockCoordinatorPrepareRecovery).toHaveBeenCalledWith({ candidate: "latest" });
    expect(mockCoordinatorCommitRecovery).toHaveBeenCalledWith({ kind: "empty_direct", attemptId: "attempt" });
    expect(mockCoordinatorBackup).toHaveBeenCalledTimes(priorBackups);
    expect(activeScheduler.request).toHaveBeenCalledWith("post_commit");
    expect(activeScheduler.request).toHaveBeenCalledWith("manual");
    expect(activeScheduler.request).toHaveBeenCalledWith("retry");
    expect(activeScheduler.request).toHaveBeenCalledWith("manual_cellular");
    expect(activeScheduler.cancel).toHaveBeenCalledTimes(1);
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
    await expect(coordinator.isWorkoutActive()).resolves.toBe(false);
    await expect(coordinator.validate(new Uint8Array())).resolves.toBe(false);
    const captured = await coordinator.capture({
      environment: "development-test",
      writerEpoch: 2,
    });
    expect(captured).toEqual(expect.objectContaining({ generation: 7 }));
    expect(JSON.parse(new TextDecoder().decode(captured.bytes))).toMatchObject({
      payload_sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    await expect(coordinator.recovery.parseSnapshot(captured.bytes, {
      fileId: "candidate",
      objectSha256: captured.sourceDigest,
      byteLength: captured.bytes.byteLength,
      snapshotId: "snapshot",
      writerEpoch: 2,
      mutationGeneration: 7,
    })).resolves.toMatchObject({ snapshotId: "snapshot" });
    await expect(coordinator.validate(captured.bytes)).resolves.toBe(true);
    expect(mockCapture).toHaveBeenCalledWith(expect.objectContaining({ snapshotId: expect.stringContaining("snapshot-") }));
    await expect(validatedRecoveryCandidateFromDriveObject({
      fileId: "candidate",
      value: captured.bytes,
      environment: "development-test",
      schema: {} as never,
      retainedReferences: {} as never,
      candidateProbe: { validateCandidate: mockValidateCandidate },
      sha256: async (value) => require("node:crypto").createHash("sha256").update(value).digest("hex"),
    })).resolves.toMatchObject({
      kind: "current",
      snapshotId: "snapshot",
      mutationGeneration: 7,
      writerEpoch: 2,
    });
    expect(mockValidateLogicalRestoreSnapshot).toHaveBeenCalled();
    expect(mockValidateCandidate).toHaveBeenCalled();
    expect(coordinator.validateManifest(new TextEncoder().encode("invalid"))).toBeNull();
    expect(JSON.parse(new TextDecoder().decode(coordinator.buildManifest({
      candidateId: "candidate",
      state: { writerEpoch: 2 },
      captured: { generation: 7, snapshotId: "snapshot", sourceDigest: "digest", bytes: new Uint8Array([1]) },
      previous: { fileId: "previous", object_sha256: "b".repeat(64) },
    })))).toMatchObject({
      latest: { fileId: "candidate" },
      previous: { fileId: "previous" },
    });
    await expect(coordinator.recovery.parseSnapshot(new TextEncoder().encode("{}"), {
      fileId: "candidate", objectSha256: "a".repeat(64), byteLength: 2,
      snapshotId: "snapshot", writerEpoch: 2, mutationGeneration: 7,
    })).rejects.toThrow("automatic_recovery_snapshot_invalid");
    await expect(coordinator.recovery.localIsEmpty()).resolves.toBe(true);
    await expect(coordinator.recovery.prepareMerge(remote as never)).resolves.toEqual({ token: "merge-token", ownerSummary: "A different backup identity", adoptionRequired: true });
    await coordinator.recovery.restore(remote as never); await coordinator.recovery.commitMerge({ token: "merge-token" });
    await expect(coordinator.recovery.freshAdoptionGrant()).rejects.toThrow("automatic_recovery_reauthentication_cancelled");
    await expect(scheduler.isWorkoutActive()).resolves.toBe(false); await expect(scheduler.eligible()).resolves.toBe(true);
    scheduler.queue(() => undefined); await scheduler.run();
  });
});
