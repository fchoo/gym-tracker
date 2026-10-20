import {
  createProductionWorkoutAppRuntimeDependencies,
  type WorkoutAppRuntimeDependencies,
} from "../bootstrap/workoutAppRuntime";
import { createScheduleRuntimePort } from "../bootstrap/scheduleRuntime";
import type {
  RestAlertPreferences,
  RestNotificationPort,
  RestNotificationScheduleInput,
} from "../domains/rest";
import {
  type V12ProductionRecoveryIdentity,
  v12ProductionRecoveryEnabled,
} from "./v12ProductionRecovery";

type PrepareRuntime = NonNullable<WorkoutAppRuntimeDependencies["prepareRuntime"]>;

export type StrictIsolatedWorkoutRuntimeOptions = Readonly<{
  databaseName: string;
  now?: () => Date;
  nowMs?: () => number;
  randomUUID?: () => string;
  prepareRuntime?: PrepareRuntime;
  onDisposed?: () => void;
  onDisposalFailure?: (error: unknown) => void;
}>;

export function resolveV12RecoveryIsolatedRuntime(
  identity: V12ProductionRecoveryIdentity,
  phase: unknown,
): Readonly<{ databaseName: string }> | null {
  if ((phase !== "arm" && phase !== "recover")
    || !v12ProductionRecoveryEnabled(identity)) {
    return null;
  }
  return Object.freeze({
    databaseName: `gym-tracker-phase20-recovery-shell-${identity.nonce as string}.db`,
  });
}

function createIsolatedNotificationPort(): RestNotificationPort {
  const scheduled = new Map<string, RestNotificationScheduleInput>();
  return Object.freeze({
    ensureChannel: async () => undefined,
    permission: async () => "granted" as const,
    requestPermission: async () => "granted" as const,
    listScheduled: async () => Object.freeze([...scheduled.values()]),
    cancel: async (identifier: string) => { scheduled.delete(identifier); },
    schedule: async (input: RestNotificationScheduleInput) => {
      scheduled.set(input.identifier, Object.freeze({ ...input }));
      return input.identifier;
    },
    openSettings: async () => undefined,
  });
}

/**
 * Builds a runtime that can use production repositories without reaching any
 * production database, notification, preference, or portability adapter.
 */
export function createStrictIsolatedWorkoutRuntimeDependencies({
  databaseName,
  now,
  nowMs,
  randomUUID,
  prepareRuntime,
  onDisposed,
  onDisposalFailure,
}: StrictIsolatedWorkoutRuntimeOptions): WorkoutAppRuntimeDependencies {
  if (!databaseName || databaseName.includes("/") || databaseName.includes("\\")) {
    throw new Error("isolated_runtime_database_name_invalid");
  }
  const production = createProductionWorkoutAppRuntimeDependencies(databaseName);
  const {
    createAutomaticBackupRuntime: _automaticBackupRuntime,
    createAutomaticBackupScheduler: _automaticBackupScheduler,
    createBackupCommands: _backupCommands,
    createCsvExportRepository: _csvRepository,
    createCsvFiles: _csvFiles,
    createMergeCommands: _mergeCommands,
    createRestoreCommands: _restoreCommands,
    reconcileRestore: _reconcileRestore,
    restAlertPreferenceStore: _restAlertPreferenceStore,
    ...isolated
  } = production;
  let opened = false;
  let preferences: RestAlertPreferences = Object.freeze({
    soundEnabled: true,
    vibrationEnabled: true,
  });

  return Object.freeze({
    ...isolated,
    openKernel: async () => {
      const kernel = await isolated.openKernel();
      opened = true;
      return kernel;
    },
    createNotifications: createIsolatedNotificationPort,
    restAlertPreferenceStore: Object.freeze({
      read: () => preferences,
      write: (next: RestAlertPreferences) => {
        preferences = Object.freeze({ ...next });
      },
    }),
    ...(now === undefined ? {} : { now }),
    ...(nowMs === undefined ? {} : { nowMs }),
    ...(randomUUID === undefined ? {} : {
      randomUUID,
      createScheduleRuntime: (
        kernel: Parameters<NonNullable<WorkoutAppRuntimeDependencies["createScheduleRuntime"]>>[0],
        ownedPlans: Parameters<NonNullable<WorkoutAppRuntimeDependencies["createScheduleRuntime"]>>[1],
      ) => createScheduleRuntimePort(kernel, ownedPlans, {
        now: now ?? (() => new Date()),
        nowMs: nowMs ?? (() => Date.now()),
        randomUUID,
        sha256: (value) => {
          const { CryptoDigestAlgorithm, digestStringAsync } = require("expo-crypto") as typeof import("expo-crypto");
          return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
        },
      }),
    }),
    ...(prepareRuntime === undefined ? {} : { prepareRuntime }),
    strictDisposal: true,
    ...(onDisposalFailure === undefined
      ? {}
      : { reportDisposalFailure: onDisposalFailure }),
    async disposeRuntime() {
      const { deleteDatabaseAsync } = require("expo-sqlite") as typeof import("expo-sqlite");
      const reportCompletion = opened;
      try {
        await deleteDatabaseAsync(databaseName);
        opened = false;
        if (reportCompletion) onDisposed?.();
      } catch (error) {
        onDisposalFailure?.(error);
        throw error;
      }
    },
  });
}
