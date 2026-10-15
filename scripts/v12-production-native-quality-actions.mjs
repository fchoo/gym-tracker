import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createProductionNativeRuntime } from "./v12-production-native-runtime.mjs";
import { executeV12PerformanceShard } from "./v12-performance-shard.mjs";
import { V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD } from "./benchmark-v12-interactions.mjs";
import { validateV12AccessibilityProducer, validateV12PerformanceProducer } from "./v12-quality-evidence-contract.mjs";
import { canonicalV12QualityJson } from "./v12-quality-evidence-contract.mjs";

const PACKAGE = "com.fchoo.gymtracker.devtest";
const COMPONENT = `${PACKAGE}/com.fchoo.gymtracker.Phase20QualityInstrumentation`;
const MARKER = "GYM_TRACKER_V12_QUALITY:";
const HASH = /^[a-f0-9]{64}$/u;
const INPUTS = ["touch", "software-keyboard", "hardware-keyboard", "dpad"];
const SETTINGS = { font_scale: "system", window_animation_scale: "global", transition_animation_scale: "global", animator_duration_scale: "global", show_ime_with_hard_keyboard: "secure" };
const MAX_BYTES = 4 * 1024 * 1024;
const fail = (code) => { throw new Error(`v12_production_native_launcher_quality_${code}`); };
const hash = (value) => createHash("sha256").update(value).digest("hex");
const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function exact(value, keys, code = "schema_invalid") {
  if (!record(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail(code);
}
function digest(value) { if (typeof value !== "string" || !HASH.test(value)) fail("digest_invalid"); }
function integer(value, min = 0) { if (!Number.isSafeInteger(value) || value < min) fail("measurement_invalid"); }
function identityFromManifest(root, attestation) {
  const manifest = JSON.parse(readFileSync(path.join(root, `artifacts/native/v1.2/${attestation.run_id}/build.json`), "utf8"));
  const identity = {
    base_head: manifest.source.head, source_tree_sha256: manifest.source.tree_sha256,
    apk_sha256: manifest.build.apk.sha256, installed_apk_sha256: manifest.device.installed_apk_sha256,
    package: manifest.build.package, device_identity_sha256: manifest.device.identity_sha256,
    fixture_sha256: manifest.fixtures?.registry_sha256,
  };
  if (!/^[a-f0-9]{40}$/u.test(identity.base_head ?? "") || identity.package !== PACKAGE) fail("identity_invalid");
  for (const key of ["source_tree_sha256", "apk_sha256", "installed_apk_sha256", "device_identity_sha256", "fixture_sha256"]) digest(identity[key]);
  return identity;
}
function assertIdentity(actual, expected) {
  exact(actual, Object.keys(expected), "identity_invalid");
  if (!isDeepStrictEqual(actual, expected)) fail("identity_mismatch");
}

// The commands are fixed; neither executable paths nor shell fragments come from a request.
// https://nodejs.org/docs/latest-v24.x/api/child_process.html#child_processspawnsynccommand-args-options
function adb(serial, args) {
  const child = spawnSync("adb", ["-s", serial, ...args], { encoding: "utf8", timeout: 20_000, killSignal: "SIGKILL", maxBuffer: MAX_BYTES });
  if (child.error || child.signal || child.status !== 0) fail("device_command_failed");
  return child.stdout.trim();
}
function shell(serial, ...args) { return adb(serial, ["shell", args.map(quote).join(" ")]); }
function shellOptional(serial, ...args) {
  const child = spawnSync("adb", ["-s", serial, "shell", args.map(quote).join(" ")], { encoding: "utf8", timeout: 20_000, killSignal: "SIGKILL", maxBuffer: MAX_BYTES });
  if (child.error || child.signal || ![0, 1].includes(child.status)) fail("device_command_failed");
  return child.stdout.trim();
}
function settingsSnapshot(serial) {
  return Object.fromEntries(Object.entries(SETTINGS).map(([key, namespace]) => {
    const value = shell(serial, "settings", "get", namespace, key);
    if (!/^(?:null|\d+(?:\.\d+)?)$/u.test(value)) fail("settings_invalid");
    return [key, value];
  }));
}
function restore(serial, original) {
  let failed = false;
  for (const [key, namespace] of Object.entries(SETTINGS)) {
    try {
      if (original[key] === "null") shell(serial, "settings", "delete", namespace, key);
      else shell(serial, "settings", "put", namespace, key, original[key]);
    } catch { failed = true; }
  }
  try { if (!isDeepStrictEqual(settingsSnapshot(serial), original)) failed = true; } catch { failed = true; }
  if (failed) fail("settings_restore_failed");
}

/**
 * Installed instrumentation protocol (no host-produced measurement fallback).
 * The runner must be registered IN the identity-checked APK, target PACKAGE,
 * and execute the actual product workloads. A separate unbound test APK is rejected.
 * This module does not install or build that runner. An APK without it fails closed.
 * https://developer.android.com/studio/test/command-line#RunTestsDevice
 *
 * stdout lines: GYM_TRACKER_V12_QUALITY:{schema_version:1,nonce,action,kind,...}
 * progress: {sequence} strictly increasing; chunk: {sequence,total,payload}
 * payload is <= 3000 ASCII base64 characters; result: {sha256} hashes decoded JSON.
 * Chunk order/count/digest and one terminal marker are mandatory. No logcat clear,
 * polling stale files, user data clear, host timing samples, or environment overrides.
 */
function instrument(serial, action, identity, nonce, coldLaunchEvidence) {
  return new Promise((resolve, reject) => {
    const arguments_ = ["am", "instrument", "-w", "-r", "-e", "qualityAction", action,
      "-e", "qualityNonce", nonce, "-e", "qualityIdentity", Buffer.from(JSON.stringify(identity)).toString("base64"),
      "-e", "qualityWorkload", Buffer.from(JSON.stringify(V12_PERFORMANCE_WORKLOAD)).toString("base64"),
      "-e", "qualityBudgets", Buffer.from(JSON.stringify(V12_PERFORMANCE_BUDGETS)).toString("base64"),
      ...(coldLaunchEvidence === undefined ? [] : ["-e", "qualityColdLaunchEvidence", Buffer.from(JSON.stringify(coldLaunchEvidence)).toString("base64")]), COMPONENT];
    const child = spawn("adb", ["-s", serial, "shell", arguments_.map(quote).join(" ")], { stdio: ["ignore", "pipe", "pipe"] });
    let buffered = ""; let bytes = 0; let progress = 0; const chunks = []; let total; let resultHash; let problem; let completed = false;
    let idle;
    const abort = (code) => { problem ??= code; child.kill("SIGKILL"); };
    const resetIdle = () => { clearTimeout(idle); idle = setTimeout(() => abort("marker_timeout"), 30_000); };
    const deadline = setTimeout(() => abort("execution_timeout"), 20 * 60_000);
    resetIdle();
    const parseLine = (line) => {
      if (/^INSTRUMENTATION_(?:FAILED|ABORTED):/u.test(line)) fail("instrumentation_failed");
      if (line.startsWith("INSTRUMENTATION_CODE:")) {
        if (line.trim() !== "INSTRUMENTATION_CODE: -1" || completed || !resultHash) fail("instrumentation_failed");
        completed = true;
        return;
      }
      const at = line.indexOf(MARKER);
      if (at < 0) return;
      const message = JSON.parse(line.slice(at + MARKER.length));
      if (message.nonce !== nonce || message.action !== action || message.schema_version !== 1) fail("marker_identity_mismatch");
      const base = ["schema_version", "nonce", "action", "kind"];
      if (resultHash) fail("marker_after_result");
      if (message.kind === "progress") {
        exact(message, [...base, "sequence"]); integer(message.sequence, 1);
        if (message.sequence <= progress || message.sequence > 100_000) fail("progress_invalid");
        progress = message.sequence; resetIdle();
      } else if (message.kind === "chunk") {
        exact(message, [...base, "sequence", "total", "payload"]);
        integer(message.total, 1); integer(message.sequence, 1);
        if (message.total > 2_000 || message.sequence !== chunks.length + 1 || message.sequence > message.total
          || (total !== undefined && total !== message.total) || typeof message.payload !== "string"
          || !/^[A-Za-z0-9+/=]{1,3000}$/u.test(message.payload)) fail("chunk_invalid");
        total = message.total; chunks.push(message.payload); resetIdle();
      } else if (message.kind === "result") {
        exact(message, [...base, "sha256"]); digest(message.sha256);
        if (chunks.length === 0 || chunks.length !== total) fail("chunk_missing");
        resultHash = message.sha256;
      } else if (message.kind === "error") {
        // Do not propagate device error text, identifiers, or stack traces.
        fail("instrumentation_failed");
      } else fail("marker_invalid");
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (text) => {
      bytes += Buffer.byteLength(text);
      if (bytes > MAX_BYTES) { abort("output_limit"); return; }
      buffered += text;
      try {
        let newline;
        while ((newline = buffered.indexOf("\n")) >= 0) {
          const line = buffered.slice(0, newline); buffered = buffered.slice(newline + 1); parseLine(line);
        }
        if (buffered.length > 8_192) abort("line_limit");
      } catch { abort("marker_invalid"); }
    });
    child.stderr.on("data", (text) => { bytes += text.length; if (bytes > MAX_BYTES) abort("output_limit"); });
    child.on("error", () => { problem ??= "device_command_failed"; });
    child.on("close", (code, signal) => {
      clearTimeout(idle); clearTimeout(deadline);
      try {
        if (problem) fail(problem);
        if (code !== 0 || signal) fail("instrumentation_failed");
        if (buffered.trim()) parseLine(buffered);
        if (!resultHash) fail("marker_missing");
        if (!completed) fail("instrumentation_incomplete");
        const encoded = chunks.join(""); const decoded = Buffer.from(encoded, "base64");
        if (decoded.toString("base64") !== encoded || hash(decoded) !== resultHash) fail("marker_digest_invalid");
        resolve(JSON.parse(decoded.toString("utf8")));
      } catch (error) {
        reject(new Error(/^v12_production_native_launcher_quality_[a-z_]+$/u.test(error?.message ?? "") ? error.message : "v12_production_native_launcher_quality_marker_invalid"));
      }
    });
  });
}

function processFacts(serial) {
  const processId = Number(shellOptional(serial, "pidof", PACKAGE).split(/\s+/u)[0]);
  if (!Number.isSafeInteger(processId) || processId < 1) return undefined;
  const stat = shell(serial, "cat", `/proc/${processId}/stat`);
  const fields = stat.slice(stat.lastIndexOf(") ") + 2).trim().split(/\s+/u);
  const processStartTicks = Number(fields[19]);
  if (!Number.isSafeInteger(processStartTicks) || processStartTicks < 1) fail("cold_process_invalid");
  return { processId, processStartTicks };
}

async function waitForColdReady(serial, nonce, sequence) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const output = shell(serial, "logcat", "-d", "-v", "monotonic", "ReactNativeJS:I", "*:S");
    for (const line of output.split(/\r?\n/u)) {
      const markerAt = line.indexOf("GYM_TRACKER_PHASE20_WORKLOAD:");
      if (markerAt < 0) continue;
      let marker;
      try { marker = JSON.parse(line.slice(markerAt + "GYM_TRACKER_PHASE20_WORKLOAD:".length)); } catch { continue; }
      if (marker.nonce !== nonce || marker.action !== "performance" || marker.operation !== "launch-cold" || marker.sequence !== sequence || marker.kind !== "ready") continue;
      const timestamp = /^\s*\[?\s*(\d+(?:\.\d+)?)/u.exec(line)?.[1];
      const unsigned = { ...marker }; delete unsigned.receipt_sha256;
      if (timestamp === undefined || marker.receipt_sha256 !== hash(canonicalV12QualityJson(unsigned))
        || !HASH.test(marker.readiness_sha256 ?? "") || !HASH.test(marker.sqlite_receipt_sha256 ?? "")) fail("cold_marker_invalid");
      return { marker, readyMs: Number(timestamp) * 1_000 };
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  fail("cold_marker_timeout");
}

/** The Node launcher survives each app force-stop and binds process start to the app's ready marker. */
export async function collectV12ColdLaunchEvidence(serial, nonce, sourceTreeSha256, count = 20) {
  digest(sourceTreeSha256);
  const hertz = Number(shell(serial, "getconf", "CLK_TCK"));
  if (!Number.isFinite(hertz) || hertz <= 0) fail("cold_clock_invalid");
  let previous = processFacts(serial);
  if (previous === undefined) {
    shell(serial, "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d",
      `gymtracker-devtest://__phase20-quality-probe?nonce=${nonce}&action=performance&operation=launch-warm&sequence=1`, PACKAGE);
    previous = processFacts(serial);
  }
  if (previous === undefined) fail("cold_process_invalid");
  const cycles = [];
  for (let sequence = 1; sequence <= count; sequence += 1) {
    shell(serial, "logcat", "-c");
    shell(serial, "am", "force-stop", PACKAGE);
    if (processFacts(serial) !== undefined) fail("cold_force_stop_invalid");
    shell(serial, "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d",
      `gymtracker-devtest://__phase20-quality-probe?nonce=${nonce}&action=performance&operation=launch-cold&sequence=${sequence}`, PACKAGE);
    const ready = await waitForColdReady(serial, nonce, sequence);
    const current = processFacts(serial);
    if (current === undefined || (current.processId === previous.processId && current.processStartTicks === previous.processStartTicks)) fail("cold_process_not_restarted");
    const processStartMs = current.processStartTicks * 1_000 / hertz;
    if (ready.readyMs <= processStartMs) fail("cold_clock_invalid");
    cycles.push({ sequence, operation: "launch-cold", previous_process_id: previous.processId, process_id: current.processId,
      previous_process_start_ticks: previous.processStartTicks, process_start_ticks: current.processStartTicks,
      process_start_ms: processStartMs, ready_ms: ready.readyMs, database_name: ready.marker.database_name,
      readiness_sha256: ready.marker.readiness_sha256, source_receipt_sha256: ready.marker.sqlite_receipt_sha256 });
    previous = current;
  }
  const durations_ms = cycles.map(({ process_start_ms, ready_ms }) => ready_ms - process_start_ms);
  return Object.freeze({ durations_ms: Object.freeze(durations_ms), timing: Object.freeze({ clock: "android-elapsed-realtime", endpoint: "process-start-to-interactive", source_tree_sha256: sourceTreeSha256, spans: Object.freeze(cycles.map(({ process_start_ms, ready_ms }) => ({ start_ms: process_start_ms, end_ms: ready_ms }))) }), cycles: Object.freeze(cycles) });
}

function validateAccessibility(observations, identity) {
  validateV12AccessibilityProducer(observations, identity, fail);
  return observations;
}

function validatePerformance(performance, identity) {
  validateV12PerformanceProducer(performance, identity, V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD, fail);
  for (const [key, budget] of [["warm_launch_to_interactive_ms", V12_PERFORMANCE_BUDGETS.warm_launch_to_interactive], ["cold_launch_to_interactive_ms", V12_PERFORMANCE_BUDGETS.cold_launch_to_interactive]]) {
    if (performance.samples[key].some((value) => value > budget.maximum_ms)) fail("performance_launch_budget_exceeded");
  }
  executeV12PerformanceShard({ identity, performance });
  return performance;
}

/**
 * Launcher integration API: await executeProductionQualityAction(action, payload, attestation).
 * Returns undefined for other actions (without I/O). Accessibility returns the existing
 * observation array; performance returns the existing raw collector schema, or {identity}
 * for request:"identity". It never publishes artifacts or assigns an acceptance verdict.
 *
 * Instrumentation result JSON: {schema_version:1,action,identity,build_variant:"release",
 * debugger_attached:false,observations} or the same envelope with performance.
 * The strict validators above define the complete source/measurement receipt contract.
 * TalkBack and switch scanning remain attended and cannot appear in this schema.
 * The invoking adapter reserves 26 minutes for both quality actions: a bounded
 * 20-minute native deadline plus process-cycle and settings cleanup headroom.
 */
export async function executeProductionQualityAction(action, payload, attestation) {
  if (action !== "accessibility" && action !== "performance") return undefined;
  try {
    if (process.env.NODE_ENV === "test" || process.env.V12_NATIVE_ADAPTER_TEST_MODE !== undefined
      || process.env.V12_NATIVE_ADAPTER_TEST_PROCESS !== undefined || process.env.V12_NATIVE_ADAPTER_COMMAND !== undefined) fail("test_environment_forbidden");
    if (!record(payload) || payload.run_id !== attestation?.run_id || attestation?.action !== action) fail("request_invalid");
    exact(attestation, ["schema_version", "action", "launcher_source_sha256", "run_id", "build_profile", "suite", "source_tree_sha256", "apk_sha256", "installed_apk_sha256", "apk_signature_sha256", "device_identity_sha256", "package"], "attestation_invalid");
    if (attestation.schema_version !== 1 || attestation.build_profile !== "development-test" || attestation.suite !== "v1.2-acceptance" || attestation.package !== PACKAGE
      || attestation.launcher_source_sha256 !== hash(readFileSync(new URL("./v12-production-native-adapter-launcher.mjs", import.meta.url)))) fail("attestation_invalid");
    const allowed = action === "accessibility" ? ["run_id", "lease", "required_inputs", "font_scale", "focus_ring_dp", "excludes"]
      : ["run_id", "lease", "request", "workload", "budgets", "build_variant", "sample_origin"];
    if (Object.keys(payload).some((key) => !allowed.includes(key))) fail("request_invalid");
    const expected = action === "accessibility" ? { required_inputs: INPUTS, font_scale: 2, focus_ring_dp: 3, excludes: ["live-talkback", "switch-scanning"] }
      : { workload: V12_PERFORMANCE_WORKLOAD, budgets: V12_PERFORMANCE_BUDGETS, build_variant: "release", sample_origin: "release-native-source-backed", request: "identity" };
    for (const [key, value] of Object.entries(expected)) if (Object.hasOwn(payload, key) && !isDeepStrictEqual(payload[key], value)) fail("request_invalid");
    const root = process.cwd();
    const runtime = createProductionNativeRuntime(attestation);
    const identity = identityFromManifest(root, attestation);
    const serial = process.env.V12_DEVICE_SERIAL;
    const owned = payload.lease === undefined;
    const lease = owned ? runtime.acquireLease() : payload.lease;
    let baseSettings; let safeToRelease = true;
    try {
      if (owned) baseSettings = runtime.snapshotSettings(lease);
      return await runtime.withLease({ lease }, async () => {
        if (action === "performance" && payload.request === "identity") return { identity };
        const listing = shell(serial, "pm", "list", "instrumentation");
        if (!listing.split(/\r?\n/u).includes(`instrumentation:${COMPONENT} (target=${PACKAGE})`)) fail("instrumentation_missing");
        const original = settingsSnapshot(serial);
        let value;
        try {
          if (action === "accessibility") shell(serial, "settings", "put", "system", "font_scale", "2");
          const nonce = randomBytes(24).toString("hex");
          const coldLaunchEvidence = action === "performance"
            ? await collectV12ColdLaunchEvidence(serial, nonce, identity.source_tree_sha256)
            : undefined;
          const measured = await instrument(serial, action, identity, nonce, coldLaunchEvidence);
          exact(measured, ["schema_version", "action", "identity", "build_variant", "debugger_attached", action === "accessibility" ? "observations" : "performance"]);
          if (measured.schema_version !== 1 || measured.action !== action || measured.build_variant !== "release" || measured.debugger_attached !== false) fail("release_required");
          assertIdentity(measured.identity, identity);
          if (action === "performance") {
            measured.performance.samples.cold_launch_to_interactive_ms = coldLaunchEvidence.durations_ms;
            measured.performance.samples.native_receipts.timings.cold_launch_to_interactive_ms = coldLaunchEvidence.timing;
            measured.performance.samples.native_receipts.cold_launch_cycles = coldLaunchEvidence.cycles;
          }
          value = action === "accessibility" ? validateAccessibility(measured.observations, identity) : validatePerformance(measured.performance, identity);
          // Recheck source, device and installed bytes after native execution as well.
          createProductionNativeRuntime(attestation);
          const installed = shell(serial, "pm", "path", PACKAGE);
          if (!/^package:\/data\/app\/[A-Za-z0-9_./=+-]+\.apk$/u.test(installed)
            || shell(serial, "sha256sum", installed.slice(8)).split(/\s/u)[0] !== identity.apk_sha256) fail("identity_mismatch");
        } finally {
          // A killed host ADB process need not stop the device-side instrumentation.
          // Always stop it before restoring; a stop failure cannot yield a success receipt.
          let stopFailed = false;
          try { shell(serial, "am", "force-stop", PACKAGE); } catch { stopFailed = true; }
          try { restore(serial, original); } catch (error) { safeToRelease = false; throw error; }
          if (stopFailed) safeToRelease = false;
          if (stopFailed) fail("instrumentation_stop_failed");
        }
        if (action === "accessibility") return value.map((entry) => ({ ...entry, restored_settings: true }));
        return value;
      });
    } finally {
      if (owned) {
        // Preserve the lease on any local restoration failure, even when the
        // shared runtime's smaller settings snapshot can still be restored.
        if (baseSettings) runtime.restoreSettings(baseSettings, lease);
        if (safeToRelease) runtime.releaseLease(lease);
      }
    }
  } catch (error) {
    if (/^v12_production_(?:quality|native_launcher)_[a-z_]+$/u.test(error?.message ?? "")) throw error;
    fail("observation_invalid");
  }
}
