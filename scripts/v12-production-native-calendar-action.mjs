import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import {
  V12_CALENDAR_FLOW_REVISION,
  V12_CALENDAR_RESULT_MARKER,
  V12_CALENDAR_STAGE_IDS,
  deriveV12CalendarStageResult,
  hashV12CalendarObservationBody,
  selectV12CalendarTerminalMarker,
  validateV12CalendarStageCoverage,
} from "./v12-calendar-observation-contract.mjs";
import { junitOutcome, worse } from "./v12-production-domain-receipts.mjs";
import { createProductionNativeRuntime } from "./v12-production-native-runtime.mjs";

const PACKAGE = "com.fchoo.gymtracker.devtest";
const FLOW = "maestro/v1.2/calendar.yaml";
const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const ATTESTATION_KEYS = Object.freeze([
  "schema_version", "action", "launcher_source_sha256", "run_id", "build_profile", "suite",
  "source_tree_sha256", "apk_sha256", "installed_apk_sha256", "apk_signature_sha256",
  "device_identity_sha256", "package",
]);
const PAYLOAD_KEYS = new Set(["run_id", "lease", "settings", "flow_sha256", "flow_revision"]);
const SETTINGS = Object.freeze({
  font_scale: "system",
  accelerometer_rotation: "system",
  user_rotation: "system",
  window_animation_scale: "global",
  transition_animation_scale: "global",
  animator_duration_scale: "global",
  airplane_mode_on: "global",
});
const LAUNCHER = fileURLToPath(new URL("./v12-production-native-adapter-launcher.mjs", import.meta.url));

const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const hashBytes = (value) => createHash("sha256").update(value).digest("hex");

function fail(code) {
  throw new Error(`calendar_action_${code}`);
}

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function validateProductionCalendarActionRequest(payload, attestation, { launcherSourceSha256 }) {
  if (!exact(attestation, ATTESTATION_KEYS)
    || attestation.schema_version !== 1
    || attestation.action !== "calendar"
    || attestation.launcher_source_sha256 !== launcherSourceSha256
    || attestation.run_id !== payload?.run_id
    || attestation.build_profile !== "development-test"
    || attestation.suite !== "v1.2-acceptance"
    || attestation.package !== PACKAGE
    || !RUN_ID.test(attestation.run_id ?? "")
    || !ATTESTATION_KEYS.filter((key) => key.endsWith("sha256")).every((key) => HASH.test(attestation[key] ?? ""))) fail("attestation_invalid");
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)
    || Object.keys(payload).some((key) => !PAYLOAD_KEYS.has(key))
    || payload.flow_revision !== V12_CALENDAR_FLOW_REVISION
    || !HASH.test(payload.flow_sha256 ?? "")) fail("request_invalid");
  return true;
}

export function createV12CalendarStageInvocation({ stageId, order, nonce, flowSha256 }) {
  if (V12_CALENDAR_STAGE_IDS[order] !== stageId || !NONCE.test(nonce ?? "") || !HASH.test(flowSha256 ?? "")) fail("stage_identity_invalid");
  return Object.freeze({
    stageId,
    order,
    nonce,
    flow: FLOW,
    variables: Object.freeze({
      V12_CALENDAR_STAGE: stageId,
      V12_CALENDAR_NONCE: nonce,
      V12_CALENDAR_FLOW_SHA256: flowSha256,
      V12_CALENDAR_FLOW_REVISION,
    }),
  });
}

function createDeviceSession(root, runId) {
  const serial = process.env.V12_DEVICE_SERIAL;
  if (typeof serial !== "string" || serial.trim().length === 0) fail("device_missing");
  const deadline = Date.now() + 45 * 60_000;
  const command = (executable, args, { timeout = 180_000, binary = false, acceptFailure = false, cleanup = false } = {}) => {
    if (!cleanup && Date.now() >= deadline) fail("timeout");
    const result = spawnSync(executable, args, {
      cwd: root,
      encoding: binary ? undefined : "utf8",
      timeout: cleanup ? timeout : Math.min(timeout, Math.max(1, deadline - Date.now())),
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error || result.signal || (!acceptFailure && result.status !== 0)) fail("native_prerequisite_failed");
    return result;
  };
  const adb = (...args) => command("adb", ["-s", serial, ...args]).stdout.trim();
  const shell = (...args) => adb("shell", args.map(quote).join(" "));
  const cleanupShell = (...args) => command("adb", ["-s", serial, "shell", args.map(quote).join(" ")], { cleanup: true }).stdout.trim();
  let retainedDirectory;
  const retained = () => {
    if (retainedDirectory !== undefined) return retainedDirectory;
    let parent = root;
    for (const part of ["artifacts", "native", "v1.2", runId]) {
      parent = path.join(parent, part);
      mkdirSync(parent, { recursive: true, mode: 0o700 });
      const details = lstatSync(parent);
      if (details.isSymbolicLink() || !details.isDirectory()) fail("artifact_path_invalid");
    }
    retainedDirectory = mkdtempSync(path.join(parent, "calendar-"));
    chmodSync(retainedDirectory, 0o700);
    return retainedDirectory;
  };
  const logs = () => adb("logcat", "-d", "-v", "raw", "ReactNativeJS:I", "*:S");
  const clearLogs = () => { adb("logcat", "-c"); };
  const screenshot = () => command("adb", ["-s", serial, "exec-out", "screencap", "-p"], { binary: true }).stdout;
  const readWm = (execute, key) => {
    const shape = key === "size" ? "[1-9][0-9]{1,4}x[1-9][0-9]{1,4}" : "[1-9][0-9]{1,3}";
    const match = new RegExp(`^Physical ${key}: (${shape})(?:\\r?\\nOverride ${key}: (${shape}))?$`, "u").exec(execute("wm", key));
    if (match === null) fail("settings_invalid");
    return Object.freeze({ physical: match[1], override: match[2] ?? null });
  };
  const wm = (key) => readWm(shell, key);
  const settings = () => {
    const values = Object.fromEntries(Object.entries(SETTINGS).map(([key, namespace]) => {
    const value = shell("settings", "get", namespace, key);
    if (!/^(?:null|\d+(?:\.\d+)?)$/u.test(value)) fail("settings_invalid");
    return [key, value];
    }));
    const airplane = shell("cmd", "connectivity", "airplane-mode");
    const night = /^Night mode: (auto|yes|no|custom)$/u.exec(shell("cmd", "uimode", "night"))?.[1];
    if (!/^Airplane mode is (?:enabled|disabled)$/u.test(airplane) || night === undefined) fail("settings_invalid");
    return Object.freeze({ values, airplane, size: wm("size"), density: wm("density"), night });
  };
  const restore = (snapshot) => {
    let restored = true;
    try { cleanupShell("cmd", "connectivity", "airplane-mode", snapshot.airplane.endsWith(" enabled") ? "enable" : "disable"); }
    catch { restored = false; }
    for (const [key, namespace] of Object.entries(SETTINGS)) {
      try {
        cleanupShell("settings", snapshot.values[key] === "null" ? "delete" : "put", namespace, key, ...(snapshot.values[key] === "null" ? [] : [snapshot.values[key]]));
      } catch { restored = false; }
    }
    for (const key of ["size", "density"]) {
      try { cleanupShell("wm", key, snapshot[key].override ?? "reset"); }
      catch { restored = false; }
    }
    try { cleanupShell("cmd", "uimode", "night", snapshot.night); }
    catch { restored = false; }
    for (const [key, namespace] of Object.entries(SETTINGS)) {
      try { if (cleanupShell("settings", "get", namespace, key) !== snapshot.values[key]) restored = false; }
      catch { restored = false; }
    }
    try { if (cleanupShell("cmd", "connectivity", "airplane-mode") !== snapshot.airplane) restored = false; }
    catch { restored = false; }
    try {
      const restoredSize = readWm(cleanupShell, "size"); const restoredDensity = readWm(cleanupShell, "density");
      if (restoredSize.override !== snapshot.size.override || restoredDensity.override !== snapshot.density.override) restored = false;
    } catch { restored = false; }
    if (!restored) fail("settings_restore_failed");
  };
  const configureStage = (stageId) => {
    const size = stageId === "dev-01-padding" ? "360x800" : "390x844";
    shell("settings", "put", "system", "font_scale", "1");
    shell("settings", "put", "system", "accelerometer_rotation", "0");
    shell("settings", "put", "system", "user_rotation", "0");
    shell("wm", "size", size);
    shell("wm", "density", "160");
    shell("cmd", "uimode", "night", "no");
    shell("settings", "put", "global", "window_animation_scale", stageId === "reduced-motion" ? "0" : "1");
    shell("settings", "put", "global", "transition_animation_scale", stageId === "reduced-motion" ? "0" : "1");
    shell("settings", "put", "global", "animator_duration_scale", stageId === "reduced-motion" ? "0" : "1");
    const configured = settings();
    const animationScale = stageId === "reduced-motion" ? "0" : "1";
    if (Number(configured.values.font_scale) !== 1 || configured.values.accelerometer_rotation !== "0"
      || configured.values.user_rotation !== "0" || configured.size.override !== size
      || configured.density.override !== "160" || configured.night !== "no"
      || Number(configured.values.window_animation_scale) !== Number(animationScale)
      || Number(configured.values.transition_animation_scale) !== Number(animationScale)
      || Number(configured.values.animator_duration_scale) !== Number(animationScale)) fail("settings_invalid");
  };
  const maestro = (invocation) => {
    const report = path.join(retained(), `${String(invocation.order).padStart(2, "0")}-${invocation.stageId}.xml`);
    const debug = path.join(retained(), `${String(invocation.order).padStart(2, "0")}-${invocation.stageId}-maestro`);
    const args = ["test", "--device", serial,
      ...Object.entries(invocation.variables).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
      "--format", "junit", "--output", report, "--test-output-dir", debug,
      path.join(root, invocation.flow)];
    const result = command("maestro", args, { acceptFailure: true });
    let xml;
    try { xml = readFileSync(report, "utf8"); chmodSync(report, 0o600); }
    catch { fail("junit_missing"); }
    return Object.freeze({ status: junitOutcome(xml, result.status), xml });
  };
  const awaitMarker = async (beforeLogs, invocation) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 60_000) {
      const afterLogs = logs();
      try {
        return selectV12CalendarTerminalMarker({
          beforeLogs,
          afterLogs,
          nonce: invocation.nonce,
          flowSha256: invocation.variables.V12_CALENDAR_FLOW_SHA256,
          stageId: invocation.stageId,
        });
      } catch (error) {
        if (error?.message !== "calendar_observation_marker_missing") throw error;
      }
      await delay(200);
    }
    fail("marker_timeout");
  };
  return Object.freeze({ clearLogs, configureStage, logs, maestro, awaitMarker, retained, restore, screenshot, settings,
    version: () => { if (command("maestro", ["--version"]).stdout.trim() !== "2.8.0") fail("maestro_version_invalid"); },
    standalone: () => {
      const manifest = JSON.parse(readFileSync(path.join(root, "artifacts/native/v1.2", runId, "build.json"), "utf8"));
      const apk = path.join(root, manifest.build.apk.path);
      const entries = command("unzip", ["-Z1", apk]).stdout.split(/\r?\n/u);
      if (["assets/index.android.bundle", "assets/app.config"].some((entry) => entries.filter((candidate) => candidate === entry).length !== 1)) fail("standalone_required");
      let config;
      try { config = JSON.parse(command("unzip", ["-p", apk, "assets/app.config"]).stdout); }
      catch { fail("standalone_required"); }
      if (config?.android?.package !== PACKAGE || config?.scheme !== "gymtracker-devtest"
        || config?.extra?.buildProfile !== "development-test" || config?.extra?.nativeContractsEnabled !== true
        || config?.extra?.nativeContractSuite !== "v1.2-acceptance") fail("standalone_required");
    },
  });
}

function validPng(bytes) {
  return Buffer.isBuffer(bytes) && bytes.length >= 33
    && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    && bytes.toString("ascii", 12, 16) === "IHDR"
    && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0;
}

export async function collectV12ProductionCalendarStages({ root, payload, io }) {
  const flowSha256 = hashBytes(readFileSync(path.join(root, FLOW)));
  if (payload.flow_sha256 !== flowSha256 || payload.flow_revision !== V12_CALENDAR_FLOW_REVISION) fail("flow_invalid");
  io.version();
  io.standalone();
  const stages = [];
  const junitCases = [];
  for (const [order, stageId] of V12_CALENDAR_STAGE_IDS.entries()) {
    const nonce = randomBytes(16).toString("hex");
    const invocation = createV12CalendarStageInvocation({ stageId, order, nonce, flowSha256 });
    io.configureStage(stageId);
    io.clearLogs();
    const beforeLogs = io.logs();
    const junit = io.maestro(invocation);
    const marker = await io.awaitMarker(beforeLogs, invocation);
    const png = io.screenshot();
    if (!validPng(png)) fail("screenshot_invalid");
    const traceJson = JSON.stringify(marker.stage);
    const result = deriveV12CalendarStageResult({
      marker,
      expected: { nonce, flowSha256, stageId, order },
      screenshotSha256: hashBytes(png),
      traceSha256: hashBytes(traceJson),
    });
    const status = worse(junit.status, result.status);
    const stage = Object.freeze({ ...result, status });
    const stem = `${String(order).padStart(2, "0")}-${stageId}`;
    writeFileSync(path.join(io.retained(), `${stem}.png`), png, { flag: "wx", mode: 0o600 });
    writeFileSync(path.join(io.retained(), `${stem}.trace.json`), `${traceJson}\n`, { flag: "wx", mode: 0o600 });
    stages.push(stage);
    junitCases.push(Object.freeze({ id: stageId, order, status }));
  }
  validateV12CalendarStageCoverage(stages);
  return Object.freeze({
    flow_sha256: flowSha256,
    flow_revision: V12_CALENDAR_FLOW_REVISION,
    stages: Object.freeze(stages),
    junit_cases: Object.freeze(junitCases),
  });
}

/**
 * Calendar-owned production action. The shared launcher intentionally does not
 * import it in this branch; the integration owner can add that single dispatch.
 */
export async function executeProductionCalendarAction(payload, attestation) {
  try {
    if (process.env.NODE_ENV === "test" || process.env.V12_NATIVE_ADAPTER_TEST_MODE !== undefined
      || process.env.V12_NATIVE_ADAPTER_TEST_PROCESS !== undefined || process.env.V12_NATIVE_ADAPTER_COMMAND !== undefined) fail("test_environment_forbidden");
    const root = process.cwd();
    validateProductionCalendarActionRequest(payload, attestation, {
      launcherSourceSha256: hashBytes(readFileSync(LAUNCHER)),
    });
    const runtime = createProductionNativeRuntime(attestation, { root });
    const ownedLease = payload.lease === undefined;
    const lease = ownedLease ? runtime.acquireLease() : payload.lease;
    let runtimeSettings;
    try {
      if (ownedLease) runtimeSettings = runtime.snapshotSettings(lease);
      return await runtime.withLease({ ...payload, lease }, async () => {
        const io = createDeviceSession(root, attestation.run_id);
        const deviceSettings = io.settings();
        try { return await collectV12ProductionCalendarStages({ root, payload, io }); }
        finally { io.restore(deviceSettings); }
      });
    } finally {
      if (ownedLease) {
        if (runtimeSettings !== undefined) runtime.restoreSettings(runtimeSettings, lease);
        runtime.releaseLease(lease);
      }
    }
  } catch (error) {
    if (error instanceof Error && /^v12_production_native_launcher_calendar_[a-z_:.-]+$/u.test(error.message)) throw error;
    const code = error instanceof Error && /^calendar_(?:action|observation)_[a-z_:.-]+$/u.test(error.message)
      ? error.message.replace(/^calendar_/u, "") : "calendar_action_failed";
    throw new Error(`v12_production_native_launcher_calendar_${code}`);
  }
}

export { FLOW as V12_CALENDAR_FLOW_PATH, V12_CALENDAR_RESULT_MARKER };
