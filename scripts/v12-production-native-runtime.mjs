import { spawnSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, lstatSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { parseNativeContractLogOutput, parseNativeContractLogFailure, parseNativeContractLogProgress } from "./native-contract-log-transport.mjs";
import { assertV12AcceptanceNativeContractResult } from "./v12-sqlite-producer-contract.mjs";
import { V12_NATIVE_LEASE_PATH, V12_NATIVE_RUNTIME_SETTINGS } from "./v12-device-settings-contract.mjs";
import { V12_NATIVE_ADB_CALL_TIMEOUT_MS } from "./v12-native-time-budgets.mjs";
import { normalizeV12AirplaneModeStatus } from "./v12-airplane-mode-status.mjs";
import { resolveV12NativeExecutionTools } from "./v12-native-execution-origin.mjs";

const HASH = /^[a-f0-9]{64}$/u;
const LEASE_ID = /^[a-f0-9]{48}$/u;
const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const PACKAGE = "com.fchoo.gymtracker.devtest";
// Device-side mkdir is atomic across launcher processes AND across ADB hosts.
// Never steal an orphaned lease: it may own settings that still need restoring.
const LOCK = V12_NATIVE_LEASE_PATH;
const SETTINGS = V12_NATIVE_RUNTIME_SETTINGS;
export const nativeFailure = (code) => { throw new Error(`v12_production_native_launcher_${code}`); };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const quote = (text) => `'${String(text).replaceAll("'", "'\\''")}'`;
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

function safeFile(root, relative) {
  if (typeof relative !== "string" || path.isAbsolute(relative) || relative.includes("\\")
    || relative.split("/").some((part) => !part || part === "." || part === "..")) nativeFailure("manifest_invalid");
  let file = root;
  for (const part of relative.split("/")) {
    file = path.join(file, part);
    if (lstatSync(file).isSymbolicLink()) nativeFailure("manifest_invalid");
  }
  if (!lstatSync(file).isFile()) nativeFailure("manifest_invalid");
  return file;
}

/** Fixed commands only. Neither stdout nor stderr from ADB may reach the protocol on failure. */
function command(executable, args, { input, timeout = V12_NATIVE_ADB_CALL_TIMEOUT_MS, maxBuffer = 8 * 1024 * 1024 } = {}) {
  const result = spawnSync(executable, args, { input, encoding: "utf8", timeout, maxBuffer });
  if (result.error || result.signal || result.status !== 0) nativeFailure("native_prerequisite_failed");
  return result.stdout.trim();
}

export function createProductionNativeRuntime(attestation, {
  root = process.cwd(),
  cleanup = false,
  executionTools = resolveV12NativeExecutionTools(),
} = {}) {
  if (!RUN_ID.test(attestation.run_id ?? "")) nativeFailure("attestation_invalid");
  const manifest = JSON.parse(readFileSync(safeFile(root, `artifacts/native/v1.2/${attestation.run_id}/build.json`), "utf8"));
  const build = manifest.build; const device = manifest.device;
  if (manifest.run_id !== attestation.run_id || manifest.mode !== "live" || build?.profile !== "development-test"
    || build?.package !== PACKAGE || manifest.source?.tree_sha256 !== attestation.source_tree_sha256
    || build.apk?.sha256 !== attestation.apk_sha256 || build.apk?.signature_sha256 !== attestation.apk_signature_sha256
    || device?.identity_sha256 !== attestation.device_identity_sha256
    || device?.installed_apk_sha256 !== attestation.installed_apk_sha256
    || attestation.apk_sha256 !== attestation.installed_apk_sha256) nativeFailure("identity_mismatch");
  if (!cleanup && sourceTreeSha256(root) !== attestation.source_tree_sha256) nativeFailure("source_identity_mismatch");

  const serial = process.env.V12_DEVICE_SERIAL;
  if (typeof serial !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/u.test(serial)) nativeFailure("device_binding_unavailable");
  const adb = (...args) => command(executionTools.adb, ["-s", serial, ...args]);
  const shell = (...args) => adb("shell", args.map(quote).join(" "));
  if (adb("get-state") !== "device") nativeFailure("device_unavailable");
  const identity = phase18DeviceIdentitySha256({ serial,
    abi: shell("getprop", "ro.product.cpu.abi"),
    apiLevel: shell("getprop", "ro.build.version.sdk"),
    model: shell("getprop", "ro.product.model"),
  });
  if (identity !== attestation.device_identity_sha256) nativeFailure("device_identity_mismatch");

  function verifyApk() {
    const installed = shell("pm", "path", PACKAGE);
    // This build is a standalone APK. Reject split sets rather than hash only a base APK.
    if (!/^package:\/data\/app\/[A-Za-z0-9_./=+~-]+\.apk$/u.test(installed)) nativeFailure("installed_apk_invalid");
    const digest = shell("sha256sum", installed.slice(8)).split(/\s/u)[0];
    if (!HASH.test(digest) || digest !== attestation.apk_sha256) nativeFailure("apk_identity_mismatch");
    const apk = readFileSync(safeFile(root, build.apk.path));
    if (sha256(apk) !== digest) nativeFailure("apk_identity_mismatch");
  }

  function leaseState(lease) {
    if (!exact(lease, ["lease_id", "native_execution"]) || !LEASE_ID.test(lease.lease_id ?? "") || lease.native_execution !== "EXECUTED") nativeFailure("lease_invalid");
    let state;
    try { state = JSON.parse(shell("cat", `${LOCK}/owner.json`)); } catch { nativeFailure("lease_invalid"); }
    if (state.lease_id !== lease.lease_id || state.run_id !== attestation.run_id
      || state.device_identity_sha256 !== identity) nativeFailure("lease_invalid");
    return state;
  }
  function writeLeaseState(state) {
    // stdin avoids any quoting or shell expansion of protocol material.
    command(executionTools.adb, ["-s", serial, "shell", `cat > ${quote(`${LOCK}/owner.json`)}`], { input: JSON.stringify(state) });
  }
  function acquireLease() {
    try { shell("mkdir", LOCK); } catch { nativeFailure("lease_busy"); }
    const lease = { lease_id: randomBytes(24).toString("hex"), native_execution: "EXECUTED" };
    try {
      verifyApk();
      writeLeaseState({ ...lease, run_id: attestation.run_id, device_identity_sha256: identity, settings: null, calendar_settings: null, calendar_restored: true });
      leaseState(lease);
      return lease;
    } catch (error) {
      // Initialization never mutates device settings. Release only this mkdir.
      try { shell("rm", "-f", `${LOCK}/owner.json`); shell("rmdir", LOCK); } catch { /* fail closed */ }
      if (error instanceof Error && /^v12_production_native_launcher_[a-z_]+$/u.test(error.message)) throw error;
      nativeFailure("lease_initialization_failed");
    }
  }
  function readSettings() {
    return Object.fromEntries(Object.entries(SETTINGS).map(([key, namespace]) => {
      const value = shell("settings", "get", namespace, key);
      if (!/^(?:null|[0-9]+(?:\.[0-9]+)?)$/u.test(value)) nativeFailure("settings_invalid");
      return [key, value];
    }));
  }
  function readWindowSetting(key) {
    const shape = key === "size" ? "[1-9][0-9]{1,4}x[1-9][0-9]{1,4}" : "[1-9][0-9]{1,3}";
    const match = new RegExp(`^Physical ${key}: (${shape})(?:\\r?\\nOverride ${key}: (${shape}))?$`, "u").exec(shell("wm", key));
    if (match === null) nativeFailure("settings_invalid");
    return Object.freeze({ physical: match[1], override: match[2] ?? null });
  }
  function readCalendarSettings() {
    const airplane = normalizeV12AirplaneModeStatus(shell("cmd", "connectivity", "airplane-mode"));
    const night = /^Night mode: (auto|yes|no|custom)$/u.exec(shell("cmd", "uimode", "night"))?.[1];
    if (!/^Airplane mode is (?:enabled|disabled)$/u.test(airplane) || night === undefined) nativeFailure("settings_invalid");
    return Object.freeze({ values: readSettings(), airplane, size: readWindowSetting("size"), density: readWindowSetting("density"), night });
  }
  function snapshotSettings(lease) {
    const state = leaseState(lease);
    if (state.settings !== null) nativeFailure("settings_already_snapshotted");
    const settings = readSettings();
    writeLeaseState({ ...state, settings });
    if (JSON.stringify(leaseState(lease).settings) !== JSON.stringify(settings)) nativeFailure("settings_snapshot_failed");
    return settings;
  }
  function snapshotCalendarSettings(lease) {
    const state = leaseState(lease);
    if (state.calendar_settings !== null && state.calendar_settings !== undefined) nativeFailure("settings_already_snapshotted");
    const calendarSettings = readCalendarSettings();
    writeLeaseState({ ...state, calendar_settings: calendarSettings, calendar_restored: false });
    const persisted = leaseState(lease).calendar_settings;
    if (JSON.stringify(persisted) !== JSON.stringify(calendarSettings)) nativeFailure("settings_snapshot_failed");
    return calendarSettings;
  }
  function restoreSettings(settings, lease) {
    const state = leaseState(lease);
    if (!exact(settings, Object.keys(SETTINGS)) || !state.settings
      || Object.keys(SETTINGS).some((key) => settings[key] !== state.settings[key])) nativeFailure("settings_invalid");
    let failed = false;
    for (const [key, namespace] of Object.entries(SETTINGS)) {
      try {
        if (settings[key] === "null") shell("settings", "delete", namespace, key);
        else shell("settings", "put", namespace, key, settings[key]);
      } catch { failed = true; }
    }
    // Check every value, including absent settings (delete, never put the text 'null').
    if (failed || JSON.stringify(readSettings()) !== JSON.stringify(state.settings)) nativeFailure("settings_restore_failed");
    // Keep the original snapshot until release so a later modification cannot be hidden.
    return true;
  }
  function restoreCalendarSettings(calendarSettings, lease) {
    const state = leaseState(lease);
    if (!state.calendar_settings || JSON.stringify(calendarSettings) !== JSON.stringify(state.calendar_settings)) nativeFailure("settings_invalid");
    let failed = false;
    try { shell("cmd", "connectivity", "airplane-mode", calendarSettings.airplane.endsWith(" enabled") ? "enable" : "disable"); } catch { failed = true; }
    for (const [key, namespace] of Object.entries(SETTINGS)) {
      try {
        if (calendarSettings.values[key] === "null") shell("settings", "delete", namespace, key);
        else shell("settings", "put", namespace, key, calendarSettings.values[key]);
      } catch { failed = true; }
    }
    for (const key of ["size", "density"]) {
      try { shell("wm", key, calendarSettings[key].override ?? "reset"); } catch { failed = true; }
    }
    try { shell("cmd", "uimode", "night", calendarSettings.night); } catch { failed = true; }
    let current;
    try { current = readCalendarSettings(); } catch { failed = true; }
    if (failed || JSON.stringify(current) !== JSON.stringify(calendarSettings)) nativeFailure("settings_restore_failed");
    writeLeaseState({ ...leaseState(lease), calendar_settings: calendarSettings, calendar_restored: true });
    return true;
  }
  function releaseLease(lease) {
    const state = leaseState(lease);
    if (state.settings !== null && JSON.stringify(readSettings()) !== JSON.stringify(state.settings)) nativeFailure("settings_restore_failed");
    if (state.calendar_settings !== null && state.calendar_settings !== undefined
      && (state.calendar_restored !== true || JSON.stringify(readCalendarSettings()) !== JSON.stringify(state.calendar_settings))) nativeFailure("settings_restore_failed");
    shell("rm", `${LOCK}/owner.json`);
    shell("rmdir", LOCK);
    return true;
  }
  async function withLease(payload, operation) {
    const owned = payload.lease === undefined;
    const lease = owned ? acquireLease() : payload.lease;
    leaseState(lease);
    let settings;
    try {
      verifyApk();
      settings = owned ? snapshotSettings(lease) : leaseState(lease).settings;
      if (!settings) nativeFailure("settings_snapshot_required");
      return await operation();
    } finally {
      // On a restoration failure retain the lease and snapshot for recovery.
      if (owned) {
        if (settings) restoreSettings(settings, lease);
        releaseLease(lease);
      }
    }
  }
  async function sqlite() {
    const runId = `v12-${randomBytes(16).toString("hex")}`;
    const link = `gymtracker-devtest://__native-contracts?runId=${runId}&suite=v1.2-acceptance`;
    // Fresh nonce-scoped results need no destructive logcat clear or app-data clear.
    shell("am", "force-stop", PACKAGE);
    shell("am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", link, PACKAGE);
    const source = readFileSync(path.join(root, "src/testing/contracts/v12Acceptance.contract.ts"), "utf8");
    const declaration = /export const V12_ACCEPTANCE_SQLITE_CASE_IDS = \[([\s\S]*?)\] as const;/u.exec(source)?.[1];
    const expected = [...(declaration ?? "").matchAll(/"([a-z0-9-]+)"/gu)].map((match) => match[1]);
    if (expected.length !== 10) nativeFailure("sqlite_contract_invalid");
    const started = Date.now();
    let lastProgress; let progressedAt = started;
    while (Date.now() - started < 20 * 60_000) {
      const logs = adb("logcat", "-d", "-v", "raw", "ReactNativeJS:I", "*:S");
      if (parseNativeContractLogFailure(logs, runId)) nativeFailure("route_error");
      const result = parseNativeContractLogOutput(logs, runId);
      if (result !== undefined) {
        try { return { status: "passed", contract: assertV12AcceptanceNativeContractResult(result, expected) }; }
        catch { nativeFailure("malformed_result"); }
      }
      const progress = parseNativeContractLogProgress(logs, runId);
      if (progress && progress !== lastProgress) { lastProgress = progress; progressedAt = Date.now(); }
      if (Date.now() - progressedAt >= 30_000) nativeFailure("marker_timeout");
      await delay(250);
    }
    nativeFailure("marker_timeout");
  }
  return Object.freeze({
    acquireLease, releaseLease, snapshotSettings, restoreSettings,
    snapshotCalendarSettings, restoreCalendarSettings, withLease, sqlite,
    executionOrigin: executionTools.execution_origin,
  });
}
