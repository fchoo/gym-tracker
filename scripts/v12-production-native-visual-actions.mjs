import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { closeSync, lstatSync, openSync, readFileSync, readSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { PNG } from "pngjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";
import { selectV12VisualReference } from "./v12-visual-authority.mjs";
import { V12_NATIVE_LEASE_PATH, V12_VISUAL_LEASE_PATH, V12_VISUAL_SYSTEM_SETTINGS } from "./v12-device-settings-contract.mjs";
import { resolveV12NativeExecutionTools } from "./v12-native-execution-origin.mjs";
import { iterateV12VisualJsonArray, readV12VisualJsonHeader } from "./v12-visual-streaming.mjs";
import {
  V12_VISUAL_ACTION_WINDOW,
  V12_VISUAL_ADB_CALL_TIMEOUT_MS,
  V12_VISUAL_CAPTURE_CLEANUP_TIMEOUT_MS,
  V12_VISUAL_CAPTURE_OPERATION_TIMEOUT_MS,
  V12_VISUAL_MARKER_POLL_DELAY_MS,
  V12_VISUAL_MARKER_WINDOW_MS,
  V12_VISUAL_NAVIGATION_COMMAND_TIMEOUT_MS,
} from "./v12-native-time-budgets.mjs";

export { V12_VISUAL_CAPTURE_CLEANUP_TIMEOUT_MS, V12_VISUAL_CAPTURE_OPERATION_TIMEOUT_MS };

const PACKAGE = "com.fchoo.gymtracker.devtest";
const FIXTURE = "v12-synthetic-fixtures-r18";
const ROUTE = "/__phase20-visual-probe";
const FLOW = "maestro/v1.2/visual-production-states.yaml";
const LOCK = V12_VISUAL_LEASE_PATH;
const LEASE = `${V12_NATIVE_LEASE_PATH}/owner.json`;
const HASH = /^[a-f0-9]{64}$/u;
const RUN = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const CONFIG = /^AP-(L|D|SL|SD)-(C360|C390|M600|X840)-(P|L)-F(100|200)$/u;
const ACTIONS = new Set(["visual-capture", "visual-capture-batch", "visual-compare"]);
export { V12_VISUAL_ACTION_WINDOW };
const SETTINGS = V12_VISUAL_SYSTEM_SETTINGS;
const MARKER_KEYS = ["schema_version", "nonce", "state_id", "configuration_id", "fixture_id", "mode", "status", "appearance", "color_scheme", "width_dp", "height_dp", "screen_width_dp", "screen_height_dp", "font_scale", "density", "registry_sha256", "readiness_sha256", "source_revision", "source_read_only", "source_receipt"];
// These are the retained Revision 18 images, not caller-selected paths or hashes.
// They exist only for the 390x844, portrait, 100% configuration. Never resize an
// approved PNG or label it as a reference for a different configuration.
const fail = (code) => { throw new Error(`v12_production_visual_${code}`); };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const quote = (v) => `'${String(v).replaceAll("'", "'\\''")}'`;
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v, required, optional = []) => object(v) && required.every((k) => Object.hasOwn(v, k))
  && Object.keys(v).every((k) => required.includes(k) || optional.includes(k));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function filePath(root, relative, code, maxBytes = 32 * 1024 * 1024) {
  try {
    if (typeof relative !== "string" || path.isAbsolute(relative) || relative.includes("\\")
      || relative.split("/").some((p) => !p || p === "." || p === "..")) fail(code);
    let cursor = root;
    for (const part of relative.split("/")) {
      cursor = path.join(cursor, part);
      if (lstatSync(cursor).isSymbolicLink()) fail(code);
    }
    if (!lstatSync(cursor).isFile() || lstatSync(cursor).size > maxBytes) fail(code);
    return cursor;
  } catch { fail(code); }
}
function file(root, relative, code) { return readFileSync(filePath(root, relative, code)); }
function json(root, relative, code) {
  try { return JSON.parse(file(root, relative, code)); } catch { fail(code); }
}
function png(bytes) {
  try {
    // Limit dimensions before decompression, as well as the subprocess buffer.
    if (!Buffer.isBuffer(bytes) || bytes.length < 33 || bytes.length > 16 * 1024 * 1024
      || !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
      || bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 8_000_000) fail("png_invalid");
    const image = PNG.sync.read(bytes, { checkCRC: true });
    if (image.width < 1 || image.height < 1) fail("png_invalid");
    return image;
  } catch { fail("png_invalid"); }
}
export function resolveV12ProductionVisualConfiguration(id) {
  const match = CONFIG.exec(id ?? "");
  if (!match) fail("payload_invalid");
  const [, appearance, size, orientation, scale] = match;
  const portrait = { C360: [360, 800], C390: [390, 844], M600: [600, 960], X840: [840, 1080] }[size];
  if (!portrait) fail("payload_invalid");
  return { id, appearance: appearance.startsWith("S") ? "System" : appearance === "L" ? "Light" : "Dark",
    scheme: appearance.endsWith("D") ? "dark" : "light", size, orientation,
    width: orientation === "P" ? portrait[0] : portrait[1],
    height: orientation === "P" ? portrait[1] : portrait[0], fontScale: Number(scale) / 100 };
}
function visualRegistry(root) {
  const entries = json(root, "src/testing/phase20VisualStateRegistry.json", "state_route_missing");
  if (!Array.isArray(entries) || entries.length !== 107 || new Set(entries.map((entry) => entry?.id)).size !== 107) fail("state_route_missing");
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!keys(entry, ["id", "name", "route", "component", "route_params", "fixture_id", "fixture_seed", "fixture_variant", "scenario", "scenario_steps", "fixture_facts", "interactions", "expected_visible_semantics", "focus_target", "readiness", "evidence_scope", "reference"])
      || entry.id !== `BW-${String(index + 1).padStart(3, "0")}` || entry.fixture_id !== FIXTURE
      || typeof entry.name !== "string" || !entry.name || typeof entry.route !== "string" || entry.route.startsWith("/__")
      || !object(entry.route_params) || typeof entry.fixture_seed !== "string" || !entry.fixture_seed || entry.scenario !== entry.name
      || !Array.isArray(entry.expected_visible_semantics) || !entry.expected_visible_semantics.length
      || !Array.isArray(entry.scenario_steps)
      || typeof entry.fixture_variant !== "string" || !entry.fixture_variant
      || !object(entry.readiness) || !keys(entry.readiness, ["status", "screen_test_id", "test_id", "test_ids", "semantics", "actions", "order", "non_color", "focus", "source_receipt"])
      || typeof entry.readiness.screen_test_id !== "string" || !entry.readiness.screen_test_id
      || typeof entry.readiness.test_id !== "string" || !entry.readiness.test_id || !["ready", "loading"].includes(entry.readiness.status)
      || !Array.isArray(entry.readiness.test_ids) || entry.readiness.test_ids.length < 2
      || !Array.isArray(entry.readiness.semantics) || entry.readiness.semantics.length < 2
      || !Array.isArray(entry.readiness.actions) || !entry.readiness.actions.length || !Array.isArray(entry.readiness.order) || entry.readiness.order.length < 2
      || !Array.isArray(entry.readiness.non_color) || !entry.readiness.non_color.length || !object(entry.readiness.focus)
      || !Array.isArray(entry.readiness.source_receipt?.assertions) || !entry.readiness.source_receipt.assertions.length
      || entry.evidence_scope !== (index >= 91 ? "visual_only" : "production_screen")
      || !object(entry.reference) || !["retained_png", "approved_source"].includes(entry.reference.kind)) fail("state_route_missing");
  }
  return entries;
}
function item(root, value, runId) {
  if (!keys(value, ["state_id", "configuration_id"], ["run_id", "fixture_id", "screenshot_id", "flow_id", "lease", "capture_index_offset", "capture_index_size"])
    || value.run_id !== undefined && value.run_id !== runId
    || value.fixture_id !== undefined && value.fixture_id !== FIXTURE
    || (value.capture_index_offset === undefined) !== (value.capture_index_size === undefined)
    || value.capture_index_offset !== undefined && (!Number.isSafeInteger(value.capture_index_offset) || value.capture_index_offset < 0
      || !Number.isSafeInteger(value.capture_index_size) || value.capture_index_size < 1 || value.capture_index_size > 16 * 1024 * 1024)) fail("payload_invalid");
  const state = visualRegistry(root).find((entry) => entry.id === value.state_id);
  if (!state) fail("state_route_missing");
  const config = resolveV12ProductionVisualConfiguration(value.configuration_id);
  if (value.screenshot_id !== undefined && value.screenshot_id !== `v12/${value.state_id}/${config.id}.png`) fail("payload_invalid");
  return { state_id: value.state_id, config, state,
    ...(value.capture_index_offset === undefined ? {} : { capture_index_offset: value.capture_index_offset, capture_index_size: value.capture_index_size }) };
}
function attest(root, action, payload, value) {
  const expected = ["schema_version", "action", "launcher_source_sha256", "run_id", "build_profile", "suite", "source_tree_sha256", "apk_sha256", "installed_apk_sha256", "apk_signature_sha256", "device_identity_sha256", "package"];
  if (!keys(value, expected) || value.schema_version !== 1 || value.action !== action
    || !RUN.test(value.run_id ?? "") || payload.run_id !== value.run_id
    || value.build_profile !== "development-test" || value.suite !== "v1.2-acceptance" || value.package !== PACKAGE
    || !expected.filter((k) => k.endsWith("sha256")).every((k) => HASH.test(value[k] ?? ""))
    || value.apk_sha256 !== value.installed_apk_sha256) fail("attestation_invalid");
  if (hash(file(root, "scripts/v12-production-native-adapter-launcher.mjs", "attestation_invalid")) !== value.launcher_source_sha256) fail("attestation_invalid");
  const build = json(root, `artifacts/native/v1.2/${value.run_id}/build.json`, "attestation_invalid");
  if (build.run_id !== value.run_id || build.mode !== "live" || build.build?.profile !== value.build_profile
    || build.build?.package !== PACKAGE || build.source?.tree_sha256 !== value.source_tree_sha256
    || build.build?.apk?.sha256 !== value.apk_sha256 || build.build?.apk?.signature_sha256 !== value.apk_signature_sha256
    || build.device?.identity_sha256 !== value.device_identity_sha256 || build.device?.installed_apk_sha256 !== value.installed_apk_sha256) fail("attestation_invalid");
  if (sourceTreeSha256(root) !== value.source_tree_sha256) fail("source_mismatch");
  if (hash(file(root, build.build.apk.path, "apk_mismatch")) !== value.apk_sha256) fail("apk_mismatch");
}

function registryBinding(state) {
  return [state.route, state.component, state.name, state.fixture_seed, state.fixture_variant,
    state.scenario, state.readiness.screen_test_id, state.readiness.test_ids,
    state.focus_target, state.evidence_scope];
}
function readinessBinding(state) {
  return [state.readiness.semantics, state.readiness.actions, state.readiness.order,
    state.readiness.non_color, state.readiness.source_receipt.assertions];
}

function nativeTransport(runCommand, root, serial, executionTools, now) {
  if (typeof serial !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/u.test(serial)) fail("device_invalid");
  let deadline = null;
  const command = (executable, args, options = {}) => {
    try {
      const remaining = deadline === null ? Number.POSITIVE_INFINITY : deadline - now();
      if (remaining <= 0) fail("deadline_exceeded");
      const result = runCommand(executable, args, { cwd: root, encoding: null, maxBuffer: 16 * 1024 * 1024, ...options,
        timeout: Math.min(options.timeout ?? V12_VISUAL_ADB_CALL_TIMEOUT_MS, remaining) });
      if (!result || result.status !== 0 || result.error || result.signal) fail("command_failed");
      return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? "");
    } catch (error) {
      if (error instanceof Error && error.message === "v12_production_visual_deadline_exceeded") throw error;
      fail("command_failed");
    }
  };
  const adb = (...args) => command(executionTools.adb, ["-s", serial, ...args]);
  const shell = (...args) => adb("shell", args.map(quote).join(" ")).toString("utf8").trim();
  return { command, adb, shell, adbPath: executionTools.adb, maestroPath: executionTools.maestro,
    setDeadline: (durationMs) => { deadline = now() + durationMs; } };
}
function verifyDevice(native, attestation, payload, serial) {
  const { adb, shell } = native;
  if (adb("get-state").toString().trim() !== "device") fail("device_invalid");
  const identity = phase18DeviceIdentitySha256({ serial, abi: shell("getprop", "ro.product.cpu.abi"), apiLevel: shell("getprop", "ro.build.version.sdk"), model: shell("getprop", "ro.product.model") });
  if (identity !== attestation.device_identity_sha256) fail("device_mismatch");
  const installed = shell("pm", "path", PACKAGE);
  if (!/^package:\/data\/app\/[A-Za-z0-9_./=+-]+\.apk$/u.test(installed)
    || shell("sha256sum", installed.slice(8)).split(/\s/u)[0] !== attestation.apk_sha256) fail("apk_mismatch");
  let lease;
  try { lease = JSON.parse(shell("cat", LEASE)); } catch { fail("lease_invalid"); }
  if (!lease || !/^[a-f0-9]{48}$/u.test(lease.lease_id ?? "") || lease.native_execution !== "EXECUTED"
    || lease.run_id !== attestation.run_id || lease.device_identity_sha256 !== identity || !object(lease.settings)
    || payload.lease !== undefined && (!keys(payload.lease, ["lease_id", "native_execution"])
      || payload.lease.lease_id !== lease.lease_id || payload.lease.native_execution !== "EXECUTED")) fail("lease_invalid");
}
function readSettings(shell) {
  const settings = Object.fromEntries(SETTINGS.map((key) => {
    const value = shell("settings", "get", "system", key);
    if (!/^(?:null|\d+(?:\.\d+)?)$/u.test(value)) fail("settings_invalid");
    return [key, value];
  }));
  const wm = (key) => {
    const output = shell("wm", key);
    const shape = key === "size" ? "[1-9][0-9]{1,4}x[1-9][0-9]{1,4}" : "[1-9][0-9]{1,3}";
    const match = new RegExp(`^Physical ${key}: (${shape})(?:\\r?\\nOverride ${key}: (${shape}))?$`, "u").exec(output);
    if (!match) fail("settings_invalid");
    return { physical: match[1], override: match[2] ?? null };
  };
  const night = /^Night mode: (auto|yes|no|custom)$/u.exec(shell("cmd", "uimode", "night"))?.[1];
  if (!night) fail("settings_invalid");
  return { settings, size: wm("size"), density: wm("density"), night };
}
function configure(shell, config, scheme = config.scheme) {
  shell("settings", "put", "system", "font_scale", String(config.fontScale));
  shell("settings", "put", "system", "accelerometer_rotation", "0");
  // Set the logical display dimensions directly; avoid device natural-orientation assumptions.
  shell("settings", "put", "system", "user_rotation", "0");
  shell("wm", "size", `${config.width}x${config.height}`);
  shell("wm", "density", "160");
  shell("cmd", "uimode", "night", scheme === "dark" ? "yes" : "no");
  const actual = readSettings(shell);
  if (actual.settings.font_scale !== String(config.fontScale) || actual.settings.accelerometer_rotation !== "0"
    || actual.settings.user_rotation !== "0" || actual.size.override !== `${config.width}x${config.height}`
    || actual.density.override !== "160" || actual.night !== (scheme === "dark" ? "yes" : "no")) fail("configuration_mismatch");
}
function restore(shell, snapshot) {
  let failed = false;
  const attempt = (fn) => { try { fn(); } catch { failed = true; } };
  for (const key of SETTINGS) attempt(() => snapshot.settings[key] === "null"
    ? shell("settings", "delete", "system", key) : shell("settings", "put", "system", key, snapshot.settings[key]));
  for (const key of ["size", "density"]) attempt(() => shell("wm", key, snapshot[key].override ?? "reset"));
  attempt(() => shell("cmd", "uimode", "night", snapshot.night));
  attempt(() => { if (!same(readSettings(shell), snapshot)) failed = true; });
  if (failed) fail("restoration_failed");
}

async function marker(native, nonce, selected, mode, expectedScheme = selected.config.scheme) {
  const deadline = Date.now() + V12_VISUAL_MARKER_WINDOW_MS;
  do {
    const output = native.adb("logcat", "-d", "-v", "raw", "ReactNativeJS:I", "*:S").toString("utf8");
    let found;
    for (const line of output.split(/\r?\n/u)) {
      const start = line.indexOf("PHASE20_VISUAL_RESULT ");
      if (start < 0) continue;
      let value;
      try { value = JSON.parse(line.slice(start + "PHASE20_VISUAL_RESULT ".length)); } catch { continue; }
      if (value.nonce === nonce && (mode === "reset" || value.color_scheme === expectedScheme)) found = value;
    }
    if (found) {
      if (!keys(found, MARKER_KEYS) || found.schema_version !== 3 || found.fixture_id !== FIXTURE
        || found.source_revision !== 18 || found.source_read_only !== true
        || !["width_dp", "height_dp", "screen_width_dp", "screen_height_dp", "font_scale", "density"].every((k) => Number.isFinite(found[k]) && found[k] > 0)) fail("marker_invalid");
      if (found.state_id !== selected.state_id
        || found.configuration_id !== selected.config.id || found.mode !== mode
        || found.registry_sha256 !== hash(JSON.stringify(registryBinding(selected.state)))
        || found.readiness_sha256 !== hash(JSON.stringify(readinessBinding(selected.state)))) fail("state_mismatch");
      const source = found.source_receipt;
      const timer = source?.timer;
      if (!keys(source, ["schema_version", "nonce", "state_id", "assertions_sha256", "production_instance_id", "mount_id", "scroll_offsets", "timer"])
        || source.schema_version !== 3 || source.nonce !== found.nonce || source.state_id !== selected.state_id
        || source.assertions_sha256 !== hash(JSON.stringify(selected.state.readiness.source_receipt.assertions))
        || !/^phase20-production-instance-\d+$/u.test(source.production_instance_id ?? "")
        || !/^phase20-production-mount-\d+$/u.test(source.mount_id ?? "") || !Array.isArray(source.scroll_offsets)
        || source.scroll_offsets.some((entry) => !keys(entry, ["native_id_sha256", "x", "y"]) || !HASH.test(entry.native_id_sha256 ?? "")
          || !Number.isFinite(entry.x) || entry.x < 0 || !Number.isFinite(entry.y) || entry.y < 0)
        || new Set(source.scroll_offsets.map(({ native_id_sha256: nativeId }) => nativeId)).size !== source.scroll_offsets.length
        || timer !== null && (!keys(timer, ["state", "revision", "remaining_ms", "ends_at_ms"])
          || !["idle", "running", "paused", "expired"].includes(timer.state) || !Number.isSafeInteger(timer.revision) || timer.revision < 0
          || timer.remaining_ms !== null && (!Number.isFinite(timer.remaining_ms) || timer.remaining_ms < 0)
          || timer.ends_at_ms !== null && (!Number.isFinite(timer.ends_at_ms) || timer.ends_at_ms < 0)
          || timer.state === "running" && (timer.remaining_ms !== null || timer.ends_at_ms === null)
          || timer.state === "paused" && (timer.remaining_ms === null || timer.ends_at_ms !== null)
          || ["idle", "expired"].includes(timer.state) && (timer.remaining_ms !== null || timer.ends_at_ms !== null))) fail("source_receipt_invalid");
      if (mode === "reset") {
        if (found.status !== "reset" || found.appearance !== "System") fail("restoration_failed");
      } else {
        if (found.status !== selected.state.readiness.status) fail("state_mismatch");
        if (found.appearance !== selected.config.appearance || found.color_scheme !== expectedScheme
          || found.font_scale !== selected.config.fontScale || found.density !== 1
          || found.screen_width_dp !== selected.config.width || found.screen_height_dp !== selected.config.height
          || found.width_dp !== selected.config.width || found.height_dp > found.screen_height_dp
          || source.scroll_offsets.length === 0) fail("configuration_mismatch");
      }
      return { ...found, source_receipt: {
        schema_version: 2,
        nonce: source.nonce,
        state_id: source.state_id,
        fixture_variant: selected.state.fixture_variant,
        assertions: selected.state.readiness.source_receipt.assertions,
        production_instance_id: source.production_instance_id,
        mount_id: source.mount_id,
        scroll_offsets: source.scroll_offsets,
        timer: source.timer,
      } };
    }
    await delay(V12_VISUAL_MARKER_POLL_DELAY_MS);
  } while (Date.now() < deadline);
  fail("marker_timeout");
}
async function navigate(native, root, serial, selected, mode, nonce = randomBytes(16).toString("hex"), expectedScheme = selected.config.scheme) {
  const params = new URLSearchParams({ nonce, state: selected.state_id, configuration: selected.config.id, fixture: FIXTURE, mode });
  for (const [key, value] of Object.entries(selected.state.route_params)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(key) || typeof value !== "string" || value.length < 1 || value.length > 256) fail("state_route_missing");
    params.set(key, value);
  }
  const link = `gymtracker-devtest://${ROUTE}?${params}`;
  native.command(native.maestroPath, ["--device", serial, "test", "-e", `VISUAL_LINK=${link}`, "-e", `VISUAL_STATE=${selected.state_id}`, "-e", `VISUAL_SCREEN_ID=${selected.state.readiness.screen_test_id}`, "-e", `VISUAL_READY_ID=${selected.state.readiness.test_id}`, "-e", `VISUAL_MODE=${mode}`, path.join(root, FLOW)], { timeout: V12_VISUAL_NAVIGATION_COMMAND_TIMEOUT_MS });
  if (mode === "capture") {
    params.set("ready", nonce);
    native.shell("am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", `gymtracker-devtest://${ROUTE}?${params}`, PACKAGE);
  }
  return marker(native, nonce, selected, mode, expectedScheme);
}

// Parse only UIAutomator's flat attributes. No XML entities/DOCTYPE expansion,
// raw text or arbitrary labels survive in the public result.
function observe(native, measured, selected) {
  native.shell("uiautomator", "dump", `${LOCK}/window.xml`);
  const xml = native.shell("cat", `${LOCK}/window.xml`);
  if (xml.includes("<!") || xml.length > 2 * 1024 * 1024) fail("state_mismatch");
  const nodes = [...xml.matchAll(/<node\s+([^>]+)>/gu)].map((match) => Object.fromEntries(
    [...match[1].matchAll(/([\w-]+)="([^"]*)"/gu)].map((a) => [a[1], a[2]]),
  ));
  const testIds = selected.state.readiness.test_ids.map((value) => ({ value, matched: nodes.some((node) => node["resource-id"]?.endsWith(value) && node.package === PACKAGE) }));
  if (!testIds.some(({ value, matched }) => value === selected.state.readiness.test_id && matched)) fail("state_mismatch");
  const semanticValues = nodes.flatMap((node) => [node.text, node["content-desc"]]).filter(Boolean);
  const semantics = selected.state.readiness.semantics.map((value) => ({ value, matched: semanticValues.some((actual) => actual === value || actual.includes(value)) }));
  if (!semantics.every(({ matched }) => matched)) fail("state_mismatch");
  const targetNodes = nodes.filter((node) => node.clickable === "true" && node.enabled === "true" && /^\[\d+,\d+\]\[\d+,\d+\]$/u.test(node.bounds ?? ""));
  if (targetNodes.length === 0) fail("state_mismatch");
  const targets = targetNodes.map((node, index) => {
    const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(node.bounds ?? "")?.slice(1).map(Number);
    if (!bounds || bounds[2] <= bounds[0] || bounds[3] <= bounds[1]
      || bounds[2] > measured.screen_width_dp * measured.density || bounds[3] > measured.screen_height_dp * measured.density
      || node.focusable !== "true") fail("state_mismatch");
    return { id: node["resource-id"] || node["content-desc"] || `target-${index + 1}`, x_dp: bounds[0] / measured.density, y_dp: bounds[1] / measured.density,
      width_dp: (bounds[2] - bounds[0]) / measured.density, height_dp: (bounds[3] - bounds[1]) / measured.density,
      selected: node.selected === "true", focusable: true, focused: node.focused === "true" };
  });
  const overlaps = targets.map((target, index) => targets.some((other, otherIndex) => otherIndex !== index
    && target.x_dp < other.x_dp + other.width_dp && other.x_dp < target.x_dp + target.width_dp
    && target.y_dp < other.y_dp + other.height_dp && other.y_dp < target.y_dp + target.height_dp));
  const actions = selected.state.readiness.actions.map((expected) => {
    const index = nodes.findIndex((node) => expected.id && node["resource-id"]?.endsWith(expected.id)
      || expected.label && [node.text, node["content-desc"]].some((value) => value === expected.label || value?.includes(expected.label)));
    const node = index < 0 ? undefined : nodes[index];
    return { ...expected, matched: index >= 0, enabled: node?.enabled !== "false", observed_order: index };
  });
  const order = selected.state.readiness.order.map((value) => ({ value, observed_order: semanticValues.findIndex((actual) => actual === value || actual.includes(value)) }));
  const nonColor = selected.state.readiness.non_color.map((value) => ({ value, matched: semanticValues.some((actual) => actual === value || actual.includes(value)) }));
  const focusNode = nodes.find((node) => node["resource-id"]?.endsWith(selected.state.readiness.focus.target)
    || node["content-desc"] === selected.state.readiness.focus.target || node.text === selected.state.readiness.focus.target);
  const productionNode = nodes.find((node) => node.package === PACKAGE && node["resource-id"]?.endsWith(measured.source_receipt.production_instance_id));
  const scrollOffsets = measured.source_receipt.scroll_offsets.map((offset) => {
    const matches = nodes.filter((node) => node.package === PACKAGE && node.scrollable === "true" && typeof node["resource-id"] === "string").flatMap((node) => {
      const resourceId = node["resource-id"];
      const candidates = [...new Set([resourceId, resourceId.split(":id/").at(-1), resourceId.split("/").at(-1)].filter(Boolean))];
      return candidates.filter((candidate) => hash(JSON.stringify(candidate)) === offset.native_id_sha256);
    });
    if (matches.length !== 1) fail("source_receipt_invalid");
    return { native_id: matches[0], x: offset.x, y: offset.y };
  });
  if (productionNode === undefined) fail("source_receipt_invalid");
  const sourceReceipt = { ...measured.source_receipt, scroll_offsets: scrollOffsets };
  const readiness = { status: measured.status, semantics, test_ids: testIds, actions, order, non_color: nonColor,
    focus: { target: selected.state.readiness.focus.target, matched: focusNode !== undefined, focusable: focusNode?.focusable === "true", focused: focusNode?.focused === "true" },
    source_receipt: (() => {
      const source = sourceReceipt;
      const material = { state_id: selected.state_id, fixture_variant: selected.state.fixture_variant, assertions: source.assertions,
        production_instance_id: source.production_instance_id, mount_id: source.mount_id, scroll_offsets: source.scroll_offsets, timer: source.timer };
      return { ...source, digest: hash(JSON.stringify(material)) };
    })() };
  const focusedNodes = nodes.filter((node) => node.package === PACKAGE && (node.focused === "true" || node["accessibility-focused"] === "true"));
  if (focusedNodes.length > 1) fail("focus_invalid");
  const nativeFocus = focusedNodes[0] === undefined ? null : {
    resource_id: focusedNodes[0]["resource-id"] || null,
    class_name: focusedNodes[0].class || null,
    bounds: focusedNodes[0].bounds || null,
  };
  return { native_execution: "EXECUTED", state_id: measured.state_id, configuration_id: measured.configuration_id,
    readiness, native_focus: nativeFocus, targets: targets.map((v, index) => ({ ...v, overlap: overlaps[index] })),
    viewport: { width_dp: measured.width_dp, height_dp: measured.height_dp, density: measured.density },
    measurement: { kind: "source_semantic", renderer_digest: selected.state.reference.kind === "retained_png" ? selected.state.reference.source.renderer_digest : selected.state.reference.renderer_digest,
      semantic_digest: selected.state.reference.kind === "retained_png" ? selected.state.reference.source.semantic_digest : selected.state.reference.semantic_digest,
      layout_digest: selected.state.reference.kind === "retained_png" ? selected.state.reference.source.layout_digest : selected.state.reference.layout_digest } };
}

function preservationSnapshot(measured, observation) {
  return {
    native_focus: observation.native_focus,
    scroll_offsets: observation.readiness.source_receipt.scroll_offsets,
    timer: measured.source_receipt.timer,
    production_instance_id: measured.source_receipt.production_instance_id,
    mount_id: measured.source_receipt.mount_id,
  };
}

async function capture(native, root, serial, selected, attestation) {
  const { shell } = native;
  // Separate device-side exclusion prevents two actions borrowing the same
  // runtime lease from interleaving size/night-mode changes.
  native.setDeadline(V12_VISUAL_CAPTURE_OPERATION_TIMEOUT_MS);
  shell("mkdir", LOCK);
  const captureNonce = randomBytes(16).toString("hex");
  let snapshot; let configured = false; let routeAttempted = false; let result;
  try {
    snapshot = readSettings(shell);
    const savedState = { run_id: attestation.run_id, device_identity_sha256: attestation.device_identity_sha256, snapshot };
    native.command(native.adbPath, ["-s", serial, "shell", `cat > ${quote(`${LOCK}/restore.json`)}`], {
      input: JSON.stringify(savedState),
    });
    let saved;
    try { saved = JSON.parse(shell("cat", `${LOCK}/restore.json`)); } catch { fail("snapshot_failed"); }
    if (!same(saved, savedState)) fail("snapshot_failed");
    configured = true;
    const transitionFromLight = selected.config.appearance === "System" && selected.config.scheme === "dark";
    configure(shell, selected.config, transitionFromLight ? "light" : selected.config.scheme);
    routeAttempted = true;
    let measured = await navigate(native, root, serial, selected, "capture", captureNonce, transitionFromLight ? "light" : selected.config.scheme);
    let observation = observe(native, measured, selected);
    let system_transition;
    if (transitionFromLight) {
      const beforeMeasured = measured;
      const before = preservationSnapshot(measured, observation);
      shell("cmd", "uimode", "night", "yes");
      measured = await marker(native, measured.nonce, selected, "capture", "dark");
      observation = observe(native, measured, selected);
      const after = preservationSnapshot(measured, observation);
      if (beforeMeasured.color_scheme !== "light" || measured.color_scheme !== "dark" || !same(before, after)) fail("system_transition_state_changed");
      system_transition = { from: "light", to: "dark", mounted_nonce: measured.nonce,
        color_scheme: { before: beforeMeasured.color_scheme, after: measured.color_scheme }, before, after };
    }
    const bytes = native.adb("exec-out", "screencap", "-p");
    const image = png(bytes);
    if (image.width !== selected.config.width || image.height !== selected.config.height) fail("configuration_mismatch");
    const after = await marker(native, measured.nonce, selected, "capture");
    if (!same(measured, after) || !same(observation, observe(native, after, selected))) fail("state_mismatch");
    const receipt = { schema_version: 3, nonce: measured.nonce, run_id: attestation.run_id, state_id: selected.state_id,
      configuration_id: selected.config.id, fixture_id: FIXTURE, source_tree_sha256: attestation.source_tree_sha256,
      apk_sha256: attestation.apk_sha256, device_identity_sha256: attestation.device_identity_sha256,
      readiness_status: selected.state.readiness.status, png_sha256: hash(bytes), observation_sha256: hash(JSON.stringify(observation)),
      source_receipt: observation.readiness.source_receipt, ...(system_transition === undefined ? {} : { system_transition }) };
    result = { native_execution: "EXECUTED", fixture_id: FIXTURE, png_base64: bytes.toString("base64"),
      settings: { restored: false, privacy: "synthetic-only", state_receipt: receipt, observation } };
  } finally {
    native.setDeadline(V12_VISUAL_CAPTURE_CLEANUP_TIMEOUT_MS);
    let restorationFailed = false;
    // Reset in the configured viewport first. This unmounts the production
    // screen and reads back the isolated appearance store through useAppTheme.
    if (routeAttempted) {
      try { await navigate(native, root, serial, selected, "reset", captureNonce); } catch { restorationFailed = true; }
    }
    if (configured) { try { restore(shell, snapshot); } catch { restorationFailed = true; } }
    if (restorationFailed) fail("restoration_failed");
    // On failure retain restore.json + lock for explicit device recovery. Never
    // discard the only saved display overrides or mark restoration successful.
    shell("rm", "-f", `${LOCK}/restore.json`, `${LOCK}/window.xml`);
    shell("rmdir", LOCK);
  }
  result.settings.restored = true;
  return result;
}

function reference(root, selected) {
  const binding = selectV12VisualReference(selected.state, selected.config);
  if (binding.kind === "retained_png") {
    const bytes = file(root, binding.path, "reference_missing");
    if (hash(bytes) !== binding.sha256) fail("reference_invalid");
    png(bytes);
  }
  return binding;
}
function retained(root, attestation, requested) {
  const base = `artifacts/native/v1.2/${attestation.run_id}/screenshots`;
  const indexFile = filePath(root, `${base}/index.json`, "capture_invalid", 512 * 1024 * 1024);
  let index;
  try { index = readV12VisualJsonHeader({ file: indexFile, firstArrayKey: "windows" }); } catch { fail("capture_invalid"); }
  if (index.schema_version !== 2 || index.producer !== "v12-visual-capture-index/v2" || index.run_id !== attestation.run_id
    || !Number.isSafeInteger(index.capture_count) || index.capture_count < 1 || index.capture_count > 107 * 64) fail("capture_invalid");
  const requestedKeys = new Map(requested.map((entry, index) => [`${entry.state_id}/${entry.config.id}`, index]));
  const records = Array(requested.length);
  if (requested.every((entry) => entry.capture_index_offset !== undefined)) {
    const descriptor = openSync(indexFile, "r");
    try {
      for (const [indexInWindow, entry] of requested.entries()) {
        const bytes = Buffer.allocUnsafe(entry.capture_index_size);
        if (readSync(descriptor, bytes, 0, bytes.length, entry.capture_index_offset) !== bytes.length) fail("capture_invalid");
        try { records[indexInWindow] = JSON.parse(bytes); } catch { fail("capture_invalid"); }
      }
    } finally { closeSync(descriptor); }
  } else {
    try {
      for (const { value } of iterateV12VisualJsonArray({ file: indexFile, arrayKey: "records" })) {
        const selectedIndex = requestedKeys.get(`${value?.state_id}/${value?.configuration_id}`);
        if (selectedIndex !== undefined) {
          if (records[selectedIndex] !== undefined) fail("capture_invalid");
          records[selectedIndex] = value;
        }
      }
    } catch { fail("capture_invalid"); }
  }
  const seen = new Set();
  const retainedRecords = records.map((entry) => {
    if (!entry) fail("capture_invalid");
    const selected = item(root, { state_id: entry.state_id, configuration_id: entry.configuration_id }, attestation.run_id);
    const key = `${selected.state_id}/${selected.config.id}`;
    if (seen.has(key)) fail("capture_invalid"); seen.add(key);
    const record = entry;
    if (!same(entry, record) || record.schema_version !== 3 || record.producer !== "v12-visual-capture/v3"
      || record.run_id !== attestation.run_id || record.native_execution !== "EXECUTED" || record.fixture_id !== FIXTURE
      || record.settings?.restored !== true || record.settings?.privacy !== "synthetic-only") fail("capture_invalid");
    const receipt = record.settings.state_receipt;
    if (!receipt || receipt.schema_version !== 3 || !/^[a-f0-9]{32}$/u.test(receipt.nonce ?? "")
      || receipt.run_id !== attestation.run_id || receipt.state_id !== selected.state_id || receipt.configuration_id !== selected.config.id
      || receipt.fixture_id !== FIXTURE || receipt.source_tree_sha256 !== attestation.source_tree_sha256
      || receipt.apk_sha256 !== attestation.apk_sha256 || receipt.device_identity_sha256 !== attestation.device_identity_sha256
      || receipt.readiness_status !== selected.state.readiness.status || receipt.observation_sha256 !== hash(JSON.stringify(record.settings.observation))
      || receipt.source_receipt?.nonce !== receipt.nonce || receipt.source_receipt?.state_id !== selected.state_id) fail("capture_invalid");
    const expected = `${base}/${key}/native.png`;
    if (record.native_png?.path !== expected) fail("capture_invalid");
    const bytes = file(root, expected, "capture_invalid"); const image = png(bytes);
    if (hash(bytes) !== receipt.png_sha256 || record.native_png.sha256 !== receipt.png_sha256 || record.native_png.size_bytes !== bytes.length
      || record.native_png.width !== image.width || record.native_png.height !== image.height) fail("capture_invalid");
    return { selected, receipt, bytes, reference: reference(root, selected) };
  });
  if (retainedRecords.length !== requested.length || !same(retainedRecords.map(({ selected }) => `${selected.state_id}/${selected.config.id}`), requested.map((entry) => `${entry.state_id}/${entry.config.id}`))) fail("capture_invalid");
  return retainedRecords;
}

/**
 * Production visual action plugin. Call inside runtime.withLease(payload, ...).
 * runCommand is spawnSync-compatible; the default invokes real adb/Maestro.
 * No caller observations, reference paths, serials or arbitrary route names are
 * accepted. Unknown actions return undefined without inspecting other inputs.
 * Capture returns the native adapter's png_base64 shape; batch preserves order.
 * Compare reads retained captures and returns a manifest-bound reference plus
 * a newly executed state receipt tied to the same PNG bytes.
 */
export async function executeProductionVisualAction({ action, payload, attestation, root = process.cwd(), serial = process.env.V12_DEVICE_SERIAL,
  runCommand = spawnSync, executionTools, environment = process.env, now = Date.now } = {}) {
  if (!ACTIONS.has(action)) return undefined;
  try {
    if (!object(payload) || !RUN.test(payload.run_id ?? "") || payload.run_id !== attestation?.run_id) fail("payload_invalid");
    let selected;
    if (action === "visual-capture") selected = [item(root, payload, payload.run_id)];
    else if (action === "visual-capture-batch") {
      if (!keys(payload, ["run_id", "captures"], ["lease"]) || !Array.isArray(payload.captures)
        || !payload.captures.length || payload.captures.length > V12_VISUAL_ACTION_WINDOW) fail("payload_invalid");
      selected = payload.captures.map((v) => item(root, v, payload.run_id));
      if (new Set(selected.map((v) => `${v.state_id}/${v.config.id}`)).size !== selected.length) fail("payload_invalid");
    } else if (action === "visual-compare") {
      if (!keys(payload, ["run_id", "captures"], ["lease"]) || !Array.isArray(payload.captures)
        || !payload.captures.length || payload.captures.length > V12_VISUAL_ACTION_WINDOW) fail("payload_invalid");
      selected = payload.captures.map((v) => item(root, v, payload.run_id));
    }
    attest(root, action, payload, attestation);
    file(root, FLOW, "state_route_missing");
    file(root, `app${ROUTE}.tsx`, "state_route_missing");
    const comparisons = action === "visual-compare" ? retained(root, attestation, selected) : undefined;
    const resolvedExecutionTools = executionTools ?? resolveV12NativeExecutionTools({ requiredTools: ["adb", "maestro"], env: environment });
    const native = nativeTransport(runCommand, root, serial, resolvedExecutionTools, now);
    verifyDevice(native, attestation, payload, serial);
    if (comparisons) {
      const results = [];
      for (const previous of comparisons) {
        const fresh = await capture(native, root, serial, previous.selected, attestation);
        if (!Buffer.from(fresh.png_base64, "base64").equals(previous.bytes)) fail("capture_mismatch");
        const observation = { ...fresh.settings.observation, capture_png_sha256: previous.receipt.png_sha256,
          capture_nonce: previous.receipt.nonce, observation_nonce: fresh.settings.state_receipt.nonce };
        results.push({ id: previous.selected.state_id, configuration_id: previous.selected.config.id,
          reference_binding: previous.reference,
          capture_state_receipt: previous.receipt,
          state_receipt: { ...fresh.settings.state_receipt, observation_sha256: hash(JSON.stringify(observation)) },
          observation });
      }
      return results;
    }
    const results = [];
    for (const entry of selected) results.push(await capture(native, root, serial, entry, attestation));
    return action === "visual-capture" ? results[0] : results;
  } catch (error) {
    if (error instanceof Error && /^v12_production_visual_[a-z_]+$/u.test(error.message)) throw error;
    fail("failed");
  }
}
