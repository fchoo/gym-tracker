import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createProductionNativeRuntime } from "./v12-production-native-runtime.mjs";
import { validateV12AccessibilityShard } from "./v12-accessibility-shard.mjs";
import { executeV12PerformanceShard } from "./v12-performance-shard.mjs";
import { V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD } from "./benchmark-v12-interactions.mjs";

const PACKAGE = "com.fchoo.gymtracker.devtest";
const COMPONENT = `${PACKAGE}/com.fchoo.gymtracker.Phase20QualityInstrumentation`;
const MARKER = "GYM_TRACKER_V12_QUALITY:";
const HASH = /^[a-f0-9]{64}$/u;
const ROOTS = ["workout", "calendar", "library", "progress"];
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
function number(value, min = 0) { if (!Number.isFinite(value) || value < min) fail("measurement_invalid"); }
function integer(value, min = 0) { if (!Number.isSafeInteger(value) || value < min) fail("measurement_invalid"); }
function label(value) {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9 .(),%_-]{0,79}$/u.test(value)
    || /(?:bearer|password|credential|token|serial|account|private)/iu.test(value)) fail("label_invalid");
}
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
function instrument(serial, action, identity, nonce) {
  return new Promise((resolve, reject) => {
    const arguments_ = ["am", "instrument", "-w", "-r", "-e", "qualityAction", action,
      "-e", "qualityNonce", nonce, "-e", "qualityIdentity", Buffer.from(JSON.stringify(identity)).toString("base64"),
      "-e", "qualityWorkload", Buffer.from(JSON.stringify(V12_PERFORMANCE_WORKLOAD)).toString("base64"),
      "-e", "qualityBudgets", Buffer.from(JSON.stringify(V12_PERFORMANCE_BUDGETS)).toString("base64"), COMPONENT];
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

function receipts(value, identity) {
  exact(value, ["source_tree_sha256", "fixture_sha256", "source_before_sha256", "source_after_sha256", "state_sha256", "configuration_sha256"]);
  Object.values(value).forEach(digest);
  if (value.source_tree_sha256 !== identity.source_tree_sha256 || value.fixture_sha256 !== identity.fixture_sha256) fail("receipt_identity_mismatch");
}
function validateAccessibility(observations, identity) {
  if (!Array.isArray(observations) || observations.length !== ROOTS.length * 2) fail("accessibility_coverage_invalid");
  const covered = new Set();
  for (const item of observations) {
    exact(item, ["root", "motion_mode", "fixture_id", "native_execution", "configuration", "targets", "interactions", "modal", "motion", "receipts"]);
    if (!ROOTS.includes(item.root) || !["normal", "reduced"].includes(item.motion_mode)
      || item.fixture_id !== "v12-synthetic-fixtures-r18" || item.native_execution !== "EXECUTED") fail("accessibility_coverage_invalid");
    const key = `${item.root}:${item.motion_mode}`;
    if (covered.has(key)) fail("accessibility_coverage_invalid"); covered.add(key);
    receipts(item.receipts, identity);
    const c = item.configuration;
    exact(c, ["font_scale", "density", "content_bounds", "insets", "ime_bounds"]);
    number(c.density, 0.1); exact(c.content_bounds, ["width", "height"]);
    number(c.content_bounds.width, 48); number(c.content_bounds.height, 48);
    for (const bounds of [c.insets, c.ime_bounds]) { exact(bounds, ["top", "bottom"]); Object.values(bounds).forEach((v) => number(v)); }
    if (c.ime_bounds.top >= c.ime_bounds.bottom || c.ime_bounds.bottom > c.content_bounds.height) fail("ime_invalid");
    if (!Array.isArray(item.targets) || item.targets.length === 0 || item.targets.length > 100) fail("targets_invalid");
    for (const target of item.targets) {
      exact(target, ["id", "name", "role", "state", "non_color_cue", "bounds_dp", "overlap"]);
      [target.id, target.name, target.role, target.state].forEach(label);
      exact(target.bounds_dp, ["left", "top", "width", "height"]);
      Object.values(target.bounds_dp).forEach((v) => number(v));
      const b = target.bounds_dp;
      if (b.left + b.width > c.content_bounds.width || b.top + b.height > c.content_bounds.height) fail("geometry_invalid");
      for (const other of item.targets) {
        if (other === target) continue;
        const a = other.bounds_dp;
        if (b.left < a.left + a.width && b.left + b.width > a.left && b.top < a.top + a.height && b.top + b.height > a.top) fail("geometry_overlap");
      }
    }
    if (!Array.isArray(item.interactions)) fail("interactions_invalid");
    for (const entry of item.interactions) {
      exact(entry, ["input", "focus_before", "action", "focus_after", "command_count", "image_hash"]);
      digest(entry.image_hash);
      if (![entry.focus_before, entry.focus_after].every((id) => item.targets.some((t) => t.id === id))) fail("focus_invalid");
    }
    exact(item.modal, ["focus_ring_dp", "focus_offset_dp", "back", "escape", "restores_invoker"]);
    exact(item.motion, ["normal", "reduced"]);
    for (const motion of Object.values(item.motion)) {
      exact(motion, ["destination", "callbacks", "source_facts"]); label(motion.destination); integer(motion.callbacks); digest(motion.source_facts);
    }
  }
  validateV12AccessibilityShard({ schema_version: 1, observations });
  for (const root of ROOTS) {
    const normal = observations.find((entry) => entry.root === root && entry.motion_mode === "normal");
    const reduced = observations.find((entry) => entry.root === root && entry.motion_mode === "reduced");
    if (!isDeepStrictEqual(normal.motion.normal, reduced.motion.reduced)) fail("motion_mismatch");
  }
  return observations;
}

const SERIES = {
  warm_launch_to_interactive_ms: [20, "process-resume-to-interactive"],
  cold_launch_to_interactive_ms: [20, "process-start-to-interactive"],
  committed_set_to_visible_dock_ms: [100, "authoritative-commit-to-visible-dock"],
  ordinary_js_task_ms: [100, "js-task-start-to-end"],
  search_after_debounce_ms: [100, "debounce-end-to-visible-results"],
  calendar_month_and_selection_ms: [100, "calendar-input-to-visible-selection"],
  progress_useful_content_ms: [20, "progress-start-to-useful-content"],
  progress_review_open_ms: [100, "progress-review-start-to-visible"],
  progress_targeted_rebuild_ms: [20, "progress-rebuild-start-to-useful-content"],
  phase12_dirty_trigger_ms: [100, "sqlite-dirty-trigger-start-to-end"],
  phase12_writer_occupancy_ms: [20, "sqlite-writer-acquire-to-release"],
  phase12_merge_preflight_ms: [10, "merge-preflight-start-to-end"],
  phase12_merge_materialization_ms: [5, "merge-materialization-start-to-end"],
};
function series(values, minimum) {
  if (!Array.isArray(values) || values.length < minimum || values.length > 10_000) fail("sample_count_invalid");
  values.forEach((value) => number(value));
}
function timing(values, receipt, minimum, endpoint, identity) {
  series(values, minimum);
  exact(receipt, ["clock", "endpoint", "source_tree_sha256", "spans"]);
  if (!["android-elapsed-realtime", "js-performance-now"].includes(receipt.clock)
    || receipt.endpoint !== endpoint || receipt.source_tree_sha256 !== identity.source_tree_sha256
    || !Array.isArray(receipt.spans) || receipt.spans.length !== values.length) fail("timing_receipt_invalid");
  receipt.spans.forEach((span, i) => {
    exact(span, ["start_ms", "end_ms"]); number(span.start_ms); number(span.end_ms, span.start_ms);
    if (Math.abs(span.end_ms - span.start_ms - values[i]) > 0.000001) fail("timing_receipt_mismatch");
  });
}
function validatePerformance(performance, identity) {
  exact(performance, ["schema_version", "suite", "producer", "native_execution", "sample_origin", "workload", "identity", "budgets", "samples"]);
  assertIdentity(performance.identity, identity);
  const samples = performance.samples;
  exact(samples, [...Object.keys(SERIES), "root_switch_to_useful_ms", "input_response_ms", "calendar_frame_sequences", "phase12_merge_peak_growth_bytes", "phase12_merge_fixture", "garmin_sync_normalization", "native_receipts"]);
  // The existing writer retains samples verbatim; top-level collector extensions
  // are discarded. Keep provenance here so published raw evidence retains it.
  const native = samples.native_receipts;
  exact(native, ["build_variant", "debugger_attached", "receipts", "timings", "frame_sequences_sha256", "merge_peak_growth_sha256"]);
  if (native.build_variant !== "release" || native.debugger_attached !== false) fail("release_required");
  receipts(native.receipts, identity);
  const timings = native.timings;
  exact(timings, [...Object.keys(SERIES), "root_switch_to_useful_ms", "input_response_ms"]);
  for (const [key, [minimum, endpoint]] of Object.entries(SERIES)) timing(samples[key], timings[key], minimum, endpoint, identity);
  for (const [key, budget] of [["warm_launch_to_interactive_ms", V12_PERFORMANCE_BUDGETS.warm_launch_to_interactive], ["cold_launch_to_interactive_ms", V12_PERFORMANCE_BUDGETS.cold_launch_to_interactive]]) {
    if (samples[key].some((value) => value > budget.maximum_ms)) fail("launch_budget_exceeded");
  }
  for (const [key, paths, endpoint] of [["root_switch_to_useful_ms", ROOTS, "root-input-to-useful-content"], ["input_response_ms", ["numeric_edit", "rest_control"], "input-to-visible-response"]]) {
    exact(samples[key], paths); exact(timings[key], paths);
    for (const name of paths) timing(samples[key][name], timings[key][name], 100, endpoint, identity);
  }
  if (!Array.isArray(samples.calendar_frame_sequences) || samples.calendar_frame_sequences.length < 100 || samples.calendar_frame_sequences.length > 500) fail("sample_count_invalid");
  for (const frame of samples.calendar_frame_sequences) {
    exact(frame, ["frame_work_ms", "missed_frames", "refresh_rate_hz", "profiler_overhead_ms"]);
    series(frame.frame_work_ms, 1); integer(frame.missed_frames); number(frame.refresh_rate_hz, 1); number(frame.profiler_overhead_ms);
  }
  if (native.frame_sequences_sha256 !== hash(JSON.stringify(samples.calendar_frame_sequences))
    || native.merge_peak_growth_sha256 !== hash(JSON.stringify(samples.phase12_merge_peak_growth_bytes))) fail("sample_digest_mismatch");
  series(samples.phase12_merge_peak_growth_bytes, 10);
  exact(samples.phase12_merge_fixture, ["snapshot_bytes", "rows", "writer_commits", "sqlite_max_variable_number"]);
  Object.values(samples.phase12_merge_fixture).forEach((v) => integer(v, 1));
  const garmin = samples.garmin_sync_normalization;
  exact(garmin, ["state", "limit_source", "fixture_sha256", "normalization_ms", "peak_rss_bytes", "baseline"]);
  digest(garmin.fixture_sha256); series(garmin.normalization_ms, 5); series(garmin.peak_rss_bytes, 5);
  exact(garmin.baseline, ["source", "identity", "artifact_sha256", "normalization_ms", "peak_rss_bytes"]);
  if (garmin.baseline.source !== "phase18-exact-artifact-baseline") fail("baseline_invalid");
  assertIdentity(garmin.baseline.identity, identity); digest(garmin.baseline.artifact_sha256);
  series(garmin.baseline.normalization_ms, 5); series(garmin.baseline.peak_rss_bytes, 5);
  // Existing V12 validation recomputes every summary and enforces Phase 12 fixture limits.
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
 * Integration prerequisite: the invoking adapter needs at least 26 minutes for
 * performance (20 minute native deadline plus bounded identity/settings cleanup).
 * Its current five minute non-SQLite timeout is insufficient; that file is owned
 * by the launcher worker and is deliberately not modified by this module.
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
          const measured = await instrument(serial, action, identity, randomBytes(24).toString("hex"));
          exact(measured, ["schema_version", "action", "identity", "build_variant", "debugger_attached", action === "accessibility" ? "observations" : "performance"]);
          if (measured.schema_version !== 1 || measured.action !== action || measured.build_variant !== "release" || measured.debugger_attached !== false) fail("release_required");
          assertIdentity(measured.identity, identity);
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
