import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockOpenKernel = jest.fn(async () => ({ source: "isolated-kernel" }));
const mockMigrate = jest.fn(async () => undefined);
const mockDeleteDatabaseAsync = jest.fn<(databaseName: string) => Promise<void>>(async () => undefined);
const mockProductionDatabaseNames: string[] = [];
const mockProductionFactories = {
  createAutomaticBackupRuntime: jest.fn(),
  createAutomaticBackupScheduler: jest.fn(),
  createBackupCommands: jest.fn(),
  createCsvExportRepository: jest.fn(),
  createCsvFiles: jest.fn(),
  createMergeCommands: jest.fn(),
  createRestoreCommands: jest.fn(),
  reconcileRestore: jest.fn(),
};

jest.mock("../bootstrap/workoutAppRuntime", () => ({
  createProductionWorkoutAppRuntimeDependencies: (databaseName: string) => ({
    activateInitialStarter: jest.fn(),
    createLifecycle: jest.fn(),
    createNotifications: jest.fn(),
    createOutcomeRepository: jest.fn(),
    createRepository: jest.fn(),
    createRestRepository: jest.fn(),
    createWorkoutRepository: jest.fn(),
    installLibrary: jest.fn(),
    loadStarterPlans: jest.fn(),
    migrate: mockMigrate,
    now: () => new Date(0),
    nowMs: () => 0,
    openKernel: () => {
      mockProductionDatabaseNames.push(databaseName);
      return mockOpenKernel();
    },
    restAlertPreferenceStore: { read: jest.fn(), write: jest.fn() },
    ...mockProductionFactories,
  }),
}));

jest.mock("expo-sqlite", () => ({
  deleteDatabaseAsync: (databaseName: string) => mockDeleteDatabaseAsync(databaseName),
}));

import {
  createStrictIsolatedWorkoutRuntimeDependencies,
  resolveV12RecoveryIsolatedRuntime,
} from "./isolatedWorkoutRuntime";

describe("strict isolated workout runtime", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProductionDatabaseNames.length = 0;
  });

  it("keeps SQLite isolated and strips every production side-effect factory", async () => {
    const dependencies = createStrictIsolatedWorkoutRuntimeDependencies({
      databaseName: "isolated-evidence.db",
    });

    await expect(dependencies.openKernel()).resolves.toEqual({ source: "isolated-kernel" });
    expect(mockProductionDatabaseNames).toEqual(["isolated-evidence.db"]);
    expect(dependencies.strictDisposal).toBe(true);
    expect(dependencies.createAutomaticBackupRuntime).toBeUndefined();
    expect(dependencies.createAutomaticBackupScheduler).toBeUndefined();
    expect(dependencies.createBackupCommands).toBeUndefined();
    expect(dependencies.createCsvExportRepository).toBeUndefined();
    expect(dependencies.createCsvFiles).toBeUndefined();
    expect(dependencies.createMergeCommands).toBeUndefined();
    expect(dependencies.createRestoreCommands).toBeUndefined();
    expect(dependencies.reconcileRestore).toBeUndefined();

    const notifications = dependencies.createNotifications();
    await expect(notifications.permission()).resolves.toBe("granted");
    await expect(notifications.listScheduled()).resolves.toEqual([]);
    expect(mockProductionFactories.createAutomaticBackupRuntime).not.toHaveBeenCalled();
    expect(mockProductionFactories.createBackupCommands).not.toHaveBeenCalled();
  });

  it("keeps rest preferences in memory and reports disposal only after an opened database is deleted", async () => {
    const disposed = jest.fn();
    const dependencies = createStrictIsolatedWorkoutRuntimeDependencies({
      databaseName: "isolated-evidence.db",
      onDisposed: disposed,
    });

    expect(dependencies.restAlertPreferenceStore?.read()).toEqual({
      soundEnabled: true,
      vibrationEnabled: true,
    });
    dependencies.restAlertPreferenceStore?.write({
      soundEnabled: false,
      vibrationEnabled: false,
    });
    expect(dependencies.restAlertPreferenceStore?.read()).toEqual({
      soundEnabled: false,
      vibrationEnabled: false,
    });

    await dependencies.disposeRuntime?.();
    expect(disposed).not.toHaveBeenCalled();
    await dependencies.openKernel();
    await dependencies.disposeRuntime?.();
    expect(mockDeleteDatabaseAsync).toHaveBeenCalledTimes(2);
    expect(disposed).toHaveBeenCalledTimes(1);
  });

  it("loads only an exact Recovery v2 request into a nonce-scoped disposable database", () => {
    const identity = {
      packageName: "com.fchoo.gymtracker.devtest",
      buildProfile: "development-test",
      nativeContractsEnabled: true,
      suite: "v1.2-acceptance",
      nonce: "a".repeat(32),
      caseId: "queued-callback",
      stepId: "queued-set-commit",
      cutId: "post-commit-before-ack",
    } as const;

    expect(resolveV12RecoveryIsolatedRuntime(identity, "arm")).toEqual({
      databaseName: `gym-tracker-phase20-recovery-shell-${"a".repeat(32)}.db`,
    });
    expect(resolveV12RecoveryIsolatedRuntime(identity, "recover")).toEqual({
      databaseName: `gym-tracker-phase20-recovery-shell-${"a".repeat(32)}.db`,
    });
    expect(resolveV12RecoveryIsolatedRuntime({ ...identity, nonce: "malformed" }, "arm"))
      .toBeNull();
    expect(resolveV12RecoveryIsolatedRuntime({ ...identity, nativeContractsEnabled: false }, "arm"))
      .toBeNull();
    expect(resolveV12RecoveryIsolatedRuntime(identity, "unknown"))
      .toBeNull();
  });
});
