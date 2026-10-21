import {
  V12_QUALITY_RUNTIME_SETTINGS,
  V12_NATIVE_RUNTIME_SETTINGS,
  V12_VISUAL_SYSTEM_SETTINGS,
} from "./v12-device-settings-contract.mjs";
import { V12_CALENDAR_STAGE_IDS } from "./v12-calendar-observation-contract.mjs";
import { V12_CALENDAR_REQUIREMENT_PROBE_COUNT } from "./v12-calendar-requirement-map.mjs";

export const V12_NATIVE_ADB_CALL_TIMEOUT_MS = 20_000;
export const V12_VISUAL_ADB_CALL_TIMEOUT_MS = 15_000;
// A terminating launcher owns up to 16 local Recovery restoration calls plus
// the shared 25-call settings/lease cleanup. Keep that full bounded window
// outside every normal command graph before the supervisor escalates to KILL.
export const V12_NATIVE_PROCESS_TREE_TERM_GRACE_MS = 14 * 60_000;
export const V12_NATIVE_PROCESS_TREE_KILL_GRACE_MS = 5_000;
export const V12_NATIVE_ADAPTER_EXIT_MARGIN_MS = V12_NATIVE_PROCESS_TREE_TERM_GRACE_MS
  + V12_NATIVE_PROCESS_TREE_KILL_GRACE_MS
  + 1_000;
export const V12_VISUAL_NAVIGATION_COMMAND_TIMEOUT_MS = 40_000;
export const V12_VISUAL_MARKER_WINDOW_MS = 5_000;
export const V12_VISUAL_MARKER_POLL_DELAY_MS = 100;
export const V12_QUALITY_PRODUCER_TIMEOUT_MS = 20 * 60_000;

const command = (name, maxMs) => Object.freeze({ name, max_ms: maxMs });
const commands = (prefix, names, maxMs) => Object.freeze(names.map((name) => command(`${prefix}.${name}`, maxMs)));
const concat = (...paths) => Object.freeze(paths.flat());
export const v12CommandPathMaxMs = (path) => path.reduce((total, entry) => total + entry.max_ms, 0);

const nativeSettings = Object.keys(V12_NATIVE_RUNTIME_SETTINGS);
const nativeRuntimeInitialization = commands("native.runtime", [
  "get-state", "getprop-abi", "getprop-api-level", "getprop-model",
], V12_NATIVE_ADB_CALL_TIMEOUT_MS);
const nativeVerifyApk = commands("native.verify-apk", ["pm-path", "sha256sum"], V12_NATIVE_ADB_CALL_TIMEOUT_MS);
const nativeLeaseOwnerRead = commands("native.lease", ["owner-read"], V12_NATIVE_ADB_CALL_TIMEOUT_MS);
const nativeLeaseOwnerWrite = commands("native.lease", ["owner-write"], V12_NATIVE_ADB_CALL_TIMEOUT_MS);
const nativeLeaseAcquireSuccess = concat(
  commands("native.lease", ["mkdir"], V12_NATIVE_ADB_CALL_TIMEOUT_MS),
  nativeVerifyApk,
  nativeLeaseOwnerWrite,
  nativeLeaseOwnerRead,
);
const nativeLeaseAcquireFailureCleanup = commands(
  "native.lease-acquisition-failure-cleanup",
  ["owner-remove", "lock-rmdir"],
  V12_NATIVE_ADB_CALL_TIMEOUT_MS,
);
const nativeSnapshotSettings = concat(
  nativeLeaseOwnerRead,
  commands("native.snapshot", nativeSettings.map((key) => `settings-get-${key}`), V12_NATIVE_ADB_CALL_TIMEOUT_MS),
  nativeLeaseOwnerWrite,
  nativeLeaseOwnerRead,
);
const nativeRestoreSettings = concat(
  nativeLeaseOwnerRead,
  commands("native.restore", nativeSettings.map((key) => `settings-write-${key}`), V12_NATIVE_ADB_CALL_TIMEOUT_MS),
  commands("native.restore", nativeSettings.map((key) => `settings-read-${key}`), V12_NATIVE_ADB_CALL_TIMEOUT_MS),
);
const nativeReleaseLease = concat(
  nativeLeaseOwnerRead,
  commands("native.release", nativeSettings.map((key) => `settings-read-${key}`), V12_NATIVE_ADB_CALL_TIMEOUT_MS),
  commands("native.release", ["owner-remove", "lock-rmdir"], V12_NATIVE_ADB_CALL_TIMEOUT_MS),
);
const nativeBorrowedLeaseSetup = concat(nativeLeaseOwnerRead, nativeVerifyApk, nativeLeaseOwnerRead);
const nativeOwnedLeaseSetup = concat(
  nativeRuntimeInitialization,
  nativeLeaseAcquireSuccess,
  nativeSnapshotSettings,
  nativeBorrowedLeaseSetup,
);
const nativeRuntimeCleanup = concat(nativeRestoreSettings, nativeReleaseLease);

export const V12_NATIVE_COMMAND_GRAPH = Object.freeze({
  runtime_initialization: nativeRuntimeInitialization,
  verify_apk: nativeVerifyApk,
  acquire_lease: Object.freeze({
    success: nativeLeaseAcquireSuccess,
    failure_after_owner_read: concat(nativeLeaseAcquireSuccess, nativeLeaseAcquireFailureCleanup),
  }),
  snapshot_settings: nativeSnapshotSettings,
  restore_settings: nativeRestoreSettings,
  release_lease: nativeReleaseLease,
  borrowed_lease_setup: nativeBorrowedLeaseSetup,
  owned_lease_setup: nativeOwnedLeaseSetup,
  runtime_cleanup: nativeRuntimeCleanup,
});

const leaseActionPaths = Object.freeze({
  "acquire-lease": concat(nativeRuntimeInitialization, V12_NATIVE_COMMAND_GRAPH.acquire_lease.failure_after_owner_read),
  "snapshot-settings": concat(nativeRuntimeInitialization, nativeSnapshotSettings),
  "restore-settings": concat(nativeRuntimeInitialization, nativeRestoreSettings),
  "release-lease": concat(nativeRuntimeInitialization, nativeReleaseLease),
});
export const V12_NATIVE_LEASE_ACTION_BUDGETS = Object.freeze(Object.fromEntries(
  Object.entries(leaseActionPaths).map(([action, path]) => [action, Object.freeze({
    adb_call_count: path.length,
    max_ms: v12CommandPathMaxMs(path),
  })]),
));

export const V12_NATIVE_CLEANUP_BUDGET = Object.freeze({
  adb_call_timeout_ms: V12_NATIVE_ADB_CALL_TIMEOUT_MS,
  restore_adb_call_count: nativeRestoreSettings.length,
  release_adb_call_count: nativeReleaseLease.length,
  max_ms: v12CommandPathMaxMs(nativeRuntimeCleanup),
  exit_margin_ms: V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
});

export const V12_NATIVE_ADAPTER_GRACE_MS = V12_NATIVE_CLEANUP_BUDGET.max_ms
  + V12_NATIVE_CLEANUP_BUDGET.exit_margin_ms;

const recoveryProducer = commands("domain.recovery", ["producer"], 40 * 60_000);
const recoveryPostProducerCleanup = commands(
  "domain.recovery.post-producer",
  ["force-stop"],
  V12_NATIVE_ADB_CALL_TIMEOUT_MS,
);
const recoveryLocalCleanup = concat(
  commands("domain.recovery.cleanup", ["airplane-mode-write"], V12_NATIVE_ADB_CALL_TIMEOUT_MS),
  commands("domain.recovery.cleanup", nativeSettings.map((key) => `settings-write-${key}`), V12_NATIVE_ADB_CALL_TIMEOUT_MS),
  commands("domain.recovery.cleanup", nativeSettings.map((key) => `settings-read-${key}`), V12_NATIVE_ADB_CALL_TIMEOUT_MS),
  commands("domain.recovery.cleanup", ["airplane-mode-read"], V12_NATIVE_ADB_CALL_TIMEOUT_MS),
);
export const V12_RECOVERY_COMMAND_GRAPH = Object.freeze({
  shared_setup: nativeOwnedLeaseSetup,
  producer: recoveryProducer,
  post_producer_cleanup: recoveryPostProducerCleanup,
  local_cleanup: recoveryLocalCleanup,
  shared_cleanup: nativeRuntimeCleanup,
});
export const V12_RECOVERY_ACTION_BUDGET = Object.freeze({
  producer_max_ms: v12CommandPathMaxMs(recoveryProducer),
  local_cleanup_adb_call_count: recoveryLocalCleanup.length,
  max_ms: Object.values(V12_RECOVERY_COMMAND_GRAPH)
    .reduce((total, path) => total + v12CommandPathMaxMs(path), 0),
});

const garminProducer = commands("domain.garmin", ["producer"], 12 * 60_000);
export const V12_GARMIN_COMMAND_GRAPH = Object.freeze({
  shared_setup: nativeOwnedLeaseSetup,
  producer: garminProducer,
  local_cleanup: recoveryLocalCleanup,
  shared_cleanup: nativeRuntimeCleanup,
});
export const V12_GARMIN_ACTION_BUDGET = Object.freeze({
  producer_max_ms: v12CommandPathMaxMs(garminProducer),
  local_cleanup_adb_call_count: recoveryLocalCleanup.length,
  max_ms: Object.values(V12_GARMIN_COMMAND_GRAPH)
    .reduce((total, path) => total + v12CommandPathMaxMs(path), 0),
});

const calendarReadSettings = concat(
  commands("calendar.settings", ["airplane-mode-read", "night-mode-read"], V12_NATIVE_ADB_CALL_TIMEOUT_MS),
  commands("calendar.settings", nativeSettings.map((key) => `settings-read-${key}`), V12_NATIVE_ADB_CALL_TIMEOUT_MS),
  commands("calendar.settings", ["wm-size-read", "wm-density-read"], V12_NATIVE_ADB_CALL_TIMEOUT_MS),
);
const calendarSettingsSnapshot = concat(
  nativeLeaseOwnerRead,
  calendarReadSettings,
  nativeLeaseOwnerWrite,
  nativeLeaseOwnerRead,
);
const calendarSettingsRestore = concat(
  nativeLeaseOwnerRead,
  commands("calendar.restore", ["airplane-mode-write"], V12_NATIVE_ADB_CALL_TIMEOUT_MS),
  commands("calendar.restore", nativeSettings.map((key) => `settings-write-${key}`), V12_NATIVE_ADB_CALL_TIMEOUT_MS),
  commands("calendar.restore", ["wm-size-write", "wm-density-write", "night-mode-write"], V12_NATIVE_ADB_CALL_TIMEOUT_MS),
  calendarReadSettings,
  nativeLeaseOwnerRead,
  nativeLeaseOwnerWrite,
);
const calendarProducer = commands("calendar", ["35-stages-and-69-requirement-probes"],
  (V12_CALENDAR_STAGE_IDS.length + V12_CALENDAR_REQUIREMENT_PROBE_COUNT) * (180_000 + 60_000));
export const V12_CALENDAR_COMMAND_GRAPH = Object.freeze({
  shared_setup: concat(nativeRuntimeInitialization, nativeBorrowedLeaseSetup),
  settings_snapshot: calendarSettingsSnapshot,
  producer: calendarProducer,
  settings_restore: calendarSettingsRestore,
});
export const V12_CALENDAR_ACTION_BUDGET = Object.freeze({
  producer_max_ms: v12CommandPathMaxMs(calendarProducer),
  max_ms: Object.values(V12_CALENDAR_COMMAND_GRAPH)
    .reduce((total, path) => total + v12CommandPathMaxMs(path), 0),
});

export const V12_VISUAL_CAPTURE_OPERATION_TIMEOUT_MS = 90_000;
const visualReadSettings = concat(
  commands("visual.read", V12_VISUAL_SYSTEM_SETTINGS.map((key) => `settings-${key}`), V12_VISUAL_ADB_CALL_TIMEOUT_MS),
  commands("visual.read", ["wm-size", "wm-density", "ui-night-mode"], V12_VISUAL_ADB_CALL_TIMEOUT_MS),
);
const visualVerifyDevice = commands("visual.verify-device", [
  "get-state", "getprop-abi", "getprop-api-level", "getprop-model", "pm-path", "sha256sum", "lease-owner-read",
], V12_VISUAL_ADB_CALL_TIMEOUT_MS);
const visualRestoreSettings = concat(
  commands("visual.restore", V12_VISUAL_SYSTEM_SETTINGS.map((key) => `settings-write-${key}`), V12_VISUAL_ADB_CALL_TIMEOUT_MS),
  commands("visual.restore", ["wm-size", "wm-density", "ui-night-mode"], V12_VISUAL_ADB_CALL_TIMEOUT_MS),
  visualReadSettings,
);
const visualReleaseLease = commands("visual.release", ["restore-file-remove", "lock-rmdir"], V12_VISUAL_ADB_CALL_TIMEOUT_MS);
const visualResetBoundMs = V12_VISUAL_NAVIGATION_COMMAND_TIMEOUT_MS
  + V12_VISUAL_MARKER_WINDOW_MS
  + V12_VISUAL_ADB_CALL_TIMEOUT_MS
  + V12_VISUAL_MARKER_POLL_DELAY_MS;

export const V12_VISUAL_COMMAND_GRAPH = Object.freeze({
  device_verification: visualVerifyDevice,
  read_settings: visualReadSettings,
  restore_settings: visualRestoreSettings,
  release_lease: visualReleaseLease,
  cleanup: concat(visualRestoreSettings, visualReleaseLease),
});
export const V12_VISUAL_CLEANUP_BUDGET = Object.freeze({
  adb_call_timeout_ms: V12_VISUAL_ADB_CALL_TIMEOUT_MS,
  reset_bound_ms: visualResetBoundMs,
  restore_adb_call_count: visualRestoreSettings.length,
  release_adb_call_count: visualReleaseLease.length,
  max_ms: visualResetBoundMs
    + v12CommandPathMaxMs(V12_VISUAL_COMMAND_GRAPH.cleanup)
    + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
});
export const V12_VISUAL_CAPTURE_CLEANUP_TIMEOUT_MS = V12_VISUAL_CLEANUP_BUDGET.max_ms;

const V12_NATIVE_WITH_LEASE_SETUP_BOUND_MS = v12CommandPathMaxMs(nativeOwnedLeaseSetup);

const V12_SQLITE_MARKER_WINDOW_MS = 20 * 60_000;
const V12_SQLITE_POLL_DELAY_MS = 250;
export const V12_SQLITE_PRODUCER_BOUND_MS = V12_NATIVE_WITH_LEASE_SETUP_BOUND_MS
  + 2 * V12_NATIVE_ADB_CALL_TIMEOUT_MS
  + V12_SQLITE_MARKER_WINDOW_MS
  + V12_NATIVE_ADB_CALL_TIMEOUT_MS
  + V12_SQLITE_POLL_DELAY_MS;

export const V12_VISUAL_ACTION_WINDOW = 4;
const V12_VISUAL_ACTION_SETUP_BOUND_MS = V12_NATIVE_WITH_LEASE_SETUP_BOUND_MS
  + v12CommandPathMaxMs(visualVerifyDevice);
const V12_VISUAL_SINGLE_CAPTURE_BOUND_MS = V12_VISUAL_ADB_CALL_TIMEOUT_MS
  + V12_VISUAL_CAPTURE_OPERATION_TIMEOUT_MS
  + V12_VISUAL_CAPTURE_CLEANUP_TIMEOUT_MS;
export const V12_VISUAL_CAPTURE_PRODUCER_BOUND_MS = V12_VISUAL_ACTION_SETUP_BOUND_MS
  + V12_VISUAL_SINGLE_CAPTURE_BOUND_MS;
export const V12_VISUAL_BATCH_PRODUCER_BOUND_MS = V12_VISUAL_ACTION_SETUP_BOUND_MS
  + V12_VISUAL_ACTION_WINDOW * V12_VISUAL_SINGLE_CAPTURE_BOUND_MS;

const qualitySettings = Object.keys(V12_QUALITY_RUNTIME_SETTINGS);
const qualitySettingsSnapshot = commands(
  "quality.snapshot",
  qualitySettings.map((key) => `settings-get-${key}`),
  V12_NATIVE_ADB_CALL_TIMEOUT_MS,
);
const qualitySettingsRestore = concat(
  commands("quality.restore", qualitySettings.map((key) => `settings-write-${key}`), V12_NATIVE_ADB_CALL_TIMEOUT_MS),
  commands("quality.restore", qualitySettings.map((key) => `settings-read-${key}`), V12_NATIVE_ADB_CALL_TIMEOUT_MS),
);
const qualityCommonBeforeProducer = concat(
  nativeRuntimeInitialization,
  nativeLeaseAcquireSuccess,
  nativeSnapshotSettings,
  nativeBorrowedLeaseSetup,
  commands("quality", ["instrumentation-list"], V12_NATIVE_ADB_CALL_TIMEOUT_MS),
  qualitySettingsSnapshot,
);
const qualityCommonAfterProducer = concat(
  nativeRuntimeInitialization,
  nativeVerifyApk,
  commands("quality.cleanup", ["force-stop"], V12_NATIVE_ADB_CALL_TIMEOUT_MS),
  qualitySettingsRestore,
  nativeRestoreSettings,
  nativeReleaseLease,
);
const qualityColdLaunchInitialization = commands("quality.performance.cold-initialization", [
  "clock-ticks-read", "prior-process-id-read", "warm-launch-if-needed",
  "warm-process-id-read", "warm-process-stat-read",
], V12_NATIVE_ADB_CALL_TIMEOUT_MS);
const qualityColdLaunchCycle = commands("quality.performance.cold-cycle", [
  "logcat-clear", "force-stop", "stopped-process-id-read", "cold-launch",
  "readiness-logcat-tail", "current-process-id-read", "current-process-stat-read",
], V12_NATIVE_ADB_CALL_TIMEOUT_MS);
const qualityColdLaunchProcessCycles = concat(...Array.from({ length: 20 }, () => qualityColdLaunchCycle));
const qualityColdLaunchReadiness = commands(
  "quality.performance",
  Array.from({ length: 20 }, (_, index) => `cold-launch-${index + 1}-readiness-window`),
  60_000,
);
const qualityPerformance = concat(
  qualityCommonBeforeProducer,
  qualityColdLaunchInitialization,
  qualityColdLaunchProcessCycles,
  qualityCommonAfterProducer,
);
const qualityAccessibility = concat(
  qualityCommonBeforeProducer,
  commands("quality.accessibility", ["font-scale-put"], V12_NATIVE_ADB_CALL_TIMEOUT_MS),
  qualityCommonAfterProducer,
);

export const V12_QUALITY_COMMAND_GRAPH = Object.freeze({
  performance: qualityPerformance,
  accessibility: qualityAccessibility,
  performance_cold_initialization: qualityColdLaunchInitialization,
  performance_cold_cycle: qualityColdLaunchCycle,
  settings_snapshot: qualitySettingsSnapshot,
  settings_restore: qualitySettingsRestore,
});
export const V12_QUALITY_WAIT_GRAPH = Object.freeze({
  performance: qualityColdLaunchReadiness,
  accessibility: Object.freeze([]),
  performance_cold_readiness: qualityColdLaunchReadiness,
});
export const V12_QUALITY_ACTION_BUDGETS = Object.freeze(Object.fromEntries(
  Object.entries({ performance: qualityPerformance, accessibility: qualityAccessibility }).map(([action, path]) => {
    const adbMaxMs = v12CommandPathMaxMs(path);
    const readinessMaxMs = v12CommandPathMaxMs(V12_QUALITY_WAIT_GRAPH[action]);
    return [action, Object.freeze({
      adb_call_count: path.length,
      adb_max_ms: adbMaxMs,
      readiness_max_ms: readinessMaxMs,
      producer_max_ms: V12_QUALITY_PRODUCER_TIMEOUT_MS,
      max_ms: V12_QUALITY_PRODUCER_TIMEOUT_MS + readinessMaxMs + adbMaxMs,
    })];
  }),
));
