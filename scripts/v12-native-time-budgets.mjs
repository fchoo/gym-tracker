import {
  V12_NATIVE_RUNTIME_SETTINGS,
  V12_VISUAL_SYSTEM_SETTINGS,
} from "./v12-device-settings-contract.mjs";

export const V12_NATIVE_ADB_CALL_TIMEOUT_MS = 20_000;
export const V12_VISUAL_ADB_CALL_TIMEOUT_MS = 15_000;
export const V12_NATIVE_ADAPTER_EXIT_MARGIN_MS = 1_000;

const runtimeSettingCount = Object.keys(V12_NATIVE_RUNTIME_SETTINGS).length;
const visualReadCallCount = V12_VISUAL_SYSTEM_SETTINGS.length + 3; // settings + wm size/density + night mode
const V12_NATIVE_RUNTIME_INITIALIZATION_ADB_CALL_COUNT = 4;
const nativeRestoreCallCount = 1 + runtimeSettingCount + runtimeSettingCount;
const nativeReleaseCallCount = 1 + runtimeSettingCount + 2;

const leaseActionCallCounts = Object.freeze({
  "acquire-lease": V12_NATIVE_RUNTIME_INITIALIZATION_ADB_CALL_COUNT + 5,
  "snapshot-settings": V12_NATIVE_RUNTIME_INITIALIZATION_ADB_CALL_COUNT + 1 + runtimeSettingCount + 1 + 1,
  "restore-settings": V12_NATIVE_RUNTIME_INITIALIZATION_ADB_CALL_COUNT + nativeRestoreCallCount,
  "release-lease": V12_NATIVE_RUNTIME_INITIALIZATION_ADB_CALL_COUNT + nativeReleaseCallCount,
});
export const V12_NATIVE_LEASE_ACTION_BUDGETS = Object.freeze(Object.fromEntries(
  Object.entries(leaseActionCallCounts).map(([action, adbCallCount]) => [action, Object.freeze({
    adb_call_count: adbCallCount,
    max_ms: adbCallCount * V12_NATIVE_ADB_CALL_TIMEOUT_MS,
  })]),
));

export const V12_NATIVE_CLEANUP_BUDGET = Object.freeze({
  adb_call_timeout_ms: V12_NATIVE_ADB_CALL_TIMEOUT_MS,
  restore_adb_call_count: nativeRestoreCallCount,
  release_adb_call_count: nativeReleaseCallCount,
  max_ms: (nativeRestoreCallCount + nativeReleaseCallCount) * V12_NATIVE_ADB_CALL_TIMEOUT_MS,
  exit_margin_ms: V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
});

export const V12_NATIVE_ADAPTER_GRACE_MS = V12_NATIVE_CLEANUP_BUDGET.max_ms
  + V12_NATIVE_CLEANUP_BUDGET.exit_margin_ms;

export const V12_VISUAL_CAPTURE_OPERATION_TIMEOUT_MS = 90_000;
const visualResetBoundMs = 40_000 + 5_000 + 100;
const visualRestoreCallCount = V12_VISUAL_SYSTEM_SETTINGS.length + 3 + visualReadCallCount;
const visualReleaseCallCount = 2;
export const V12_VISUAL_CLEANUP_BUDGET = Object.freeze({
  adb_call_timeout_ms: V12_VISUAL_ADB_CALL_TIMEOUT_MS,
  reset_bound_ms: visualResetBoundMs,
  restore_adb_call_count: visualRestoreCallCount,
  release_adb_call_count: visualReleaseCallCount,
  max_ms: visualResetBoundMs
    + (visualRestoreCallCount + visualReleaseCallCount) * V12_VISUAL_ADB_CALL_TIMEOUT_MS
    + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
});
export const V12_VISUAL_CAPTURE_CLEANUP_TIMEOUT_MS = V12_VISUAL_CLEANUP_BUDGET.max_ms;

// Runtime construction + lease acquisition/validation + APK verification +
// settings snapshot performs this many independently bounded ADB calls before
// the producer body starts.
const V12_NATIVE_WITH_LEASE_SETUP_ADB_CALL_COUNT = V12_NATIVE_RUNTIME_INITIALIZATION_ADB_CALL_COUNT
  + 5 + 1 + 2 + (1 + runtimeSettingCount + 1 + 1);
const V12_NATIVE_WITH_LEASE_SETUP_BOUND_MS = V12_NATIVE_WITH_LEASE_SETUP_ADB_CALL_COUNT * V12_NATIVE_ADB_CALL_TIMEOUT_MS;

const V12_SQLITE_MARKER_WINDOW_MS = 20 * 60_000;
const V12_SQLITE_POLL_DELAY_MS = 250;
export const V12_SQLITE_PRODUCER_BOUND_MS = V12_NATIVE_WITH_LEASE_SETUP_BOUND_MS
  + 2 * V12_NATIVE_ADB_CALL_TIMEOUT_MS
  + V12_SQLITE_MARKER_WINDOW_MS
  + V12_NATIVE_ADB_CALL_TIMEOUT_MS
  + V12_SQLITE_POLL_DELAY_MS;

export const V12_VISUAL_ACTION_WINDOW = 4;
const V12_VISUAL_DEVICE_VERIFICATION_ADB_CALL_COUNT = 6;
const V12_VISUAL_ACTION_SETUP_BOUND_MS = V12_NATIVE_WITH_LEASE_SETUP_BOUND_MS
  + V12_VISUAL_DEVICE_VERIFICATION_ADB_CALL_COUNT * V12_VISUAL_ADB_CALL_TIMEOUT_MS;
const V12_VISUAL_SINGLE_CAPTURE_BOUND_MS = V12_VISUAL_ADB_CALL_TIMEOUT_MS
  + V12_VISUAL_CAPTURE_OPERATION_TIMEOUT_MS
  + V12_VISUAL_CAPTURE_CLEANUP_TIMEOUT_MS;
export const V12_VISUAL_CAPTURE_PRODUCER_BOUND_MS = V12_VISUAL_ACTION_SETUP_BOUND_MS
  + V12_VISUAL_SINGLE_CAPTURE_BOUND_MS;
export const V12_VISUAL_BATCH_PRODUCER_BOUND_MS = V12_VISUAL_ACTION_SETUP_BOUND_MS
  + V12_VISUAL_ACTION_WINDOW * V12_VISUAL_SINGLE_CAPTURE_BOUND_MS;
