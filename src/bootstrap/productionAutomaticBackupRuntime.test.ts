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
const mockCoordinator = {
  connect: jest.fn(async () => undefined), deferRecovery: jest.fn(async () => undefined),
  abortChecking: jest.fn(async () => undefined), checkAgain: jest.fn(async () => undefined),
  prepareRecovery: jest.fn(async () => ({ kind: "empty_direct" as const, attemptId: "attempt" })),
  commitRecovery: jest.fn(async () => undefined), disconnect: jest.fn(async () => undefined),
  finishDeletionSweep: jest.fn(async () => undefined), backup: jest.fn(async () => undefined),
};
const mockScheduler = { request: jest.fn(async () => undefined) };

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
  createAutomaticBackupCoordinator: () => mockCoordinator,
}));
jest.mock("../domains/backup/automaticBackupScheduler", () => ({
  createAutomaticBackupScheduler: () => mockScheduler,
}));

import { createProductionAutomaticBackupServices } from "./productionAutomaticBackupRuntime";

describe("production automatic-backup composition", () => {
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

    expect(mockState.setDataUsePolicy).toHaveBeenCalledWith("wifi-only");
    expect(mockCoordinator.prepareRecovery).toHaveBeenCalledWith({ candidate });
    expect(mockCoordinator.commitRecovery).toHaveBeenCalledWith(recovery);
    expect(mockScheduler.request).toHaveBeenNthCalledWith(1, "manual");
    expect(mockScheduler.request).toHaveBeenNthCalledWith(2, "retry");
    expect(mockScheduler.request).toHaveBeenNthCalledWith(3, "manual");
    expect(mockScheduler.request).toHaveBeenNthCalledWith(4, "manual");
  });
});
