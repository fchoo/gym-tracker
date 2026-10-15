import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { PNG } from "pngjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";

const PACKAGE = "com.fchoo.gymtracker.devtest";
const FIXTURE = "v12-synthetic-fixtures-r18";
const ROUTE = "/__phase20-visual-probe";
const FLOW = "maestro/v1.2/visual-plan-type-chooser.yaml";
const LOCK = "/data/local/tmp/gym-tracker-v12-visual";
const LEASE = "/data/local/tmp/gym-tracker-v12-native-lease/owner.json";
const HASH = /^[a-f0-9]{64}$/u;
const RUN = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const CONFIG = /^AP-(L|D|SL|SD)-(C360|C390|M600|X840)-(P|L)-F(100|200)$/u;
const ACTIONS = new Set(["visual-capture", "visual-capture-batch", "visual-compare"]);
const SETTINGS = ["font_scale", "accelerometer_rotation", "user_rotation"];
const MARKER_KEYS = ["schema_version", "nonce", "state_id", "configuration_id", "fixture_id", "mode", "status", "appearance", "color_scheme", "width_dp", "height_dp", "screen_width_dp", "screen_height_dp", "font_scale", "density", "route", "source_state", "source_revision", "source_read_only"];
// These are the retained Revision 18 images, not caller-selected paths or hashes.
// They exist only for the 390x844, portrait, 100% configuration. Never resize an
// approved PNG or label it as a reference for a different configuration.
const REFERENCES = Object.freeze({
  "AP-L-C390-P-F100": ["light-plan-type-chooser.png", "4641fd75617c071766c628ee1569233cda27db98e3c8ff3a41edf48bb049693d"],
  "AP-D-C390-P-F100": ["dark-plan-type-chooser.png", "9adf83197bb3d0f32d63bb092a57020877feead3008929141133c64e9e5b835f"],
});
const fail = (code) => { throw new Error(`v12_production_visual_${code}`); };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const quote = (v) => `'${String(v).replaceAll("'", "'\\''")}'`;
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v, required, optional = []) => object(v) && required.every((k) => Object.hasOwn(v, k))
  && Object.keys(v).every((k) => required.includes(k) || optional.includes(k));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function file(root, relative, code) {
  try {
    if (typeof relative !== "string" || path.isAbsolute(relative) || relative.includes("\\")
      || relative.split("/").some((p) => !p || p === "." || p === "..")) fail(code);
    let cursor = root;
    for (const part of relative.split("/")) {
      cursor = path.join(cursor, part);
      if (lstatSync(cursor).isSymbolicLink()) fail(code);
    }
    if (!lstatSync(cursor).isFile() || lstatSync(cursor).size > 32 * 1024 * 1024) fail(code);
    return readFileSync(cursor);
  } catch { fail(code); }
}
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
function configuration(id) {
  const match = CONFIG.exec(id ?? "");
  if (!match) fail("payload_invalid");
  const [, appearance, size, orientation, scale] = match;
  const short = Number(size.slice(1));
  const long = Math.round(short * 844 / 390);
  return { id, appearance: appearance.startsWith("S") ? "System" : appearance === "L" ? "Light" : "Dark",
    scheme: appearance.endsWith("D") ? "dark" : "light", width: orientation === "P" ? short : long,
    height: orientation === "P" ? long : short, fontScale: Number(scale) / 100 };
}
function item(value, runId) {
  if (!keys(value, ["state_id", "configuration_id"], ["run_id", "fixture_id", "screenshot_id", "flow_id", "lease"])
    || value.run_id !== undefined && value.run_id !== runId
    || value.fixture_id !== undefined && value.fixture_id !== FIXTURE) fail("payload_invalid");
  // The source screen and flow are explicit. Other BW states require their own
  // implementation; a modulo mapping to an arbitrary flow is not navigation.
  if (value.state_id !== "BW-054") fail("state_route_missing");
  const config = configuration(value.configuration_id);
  if (value.screenshot_id !== undefined && value.screenshot_id !== `v12/${value.state_id}/${config.id}.png`) fail("payload_invalid");
  return { state_id: value.state_id, config };
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

function nativeTransport(runCommand, root, serial) {
  if (typeof serial !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/u.test(serial)) fail("device_invalid");
  const command = (executable, args, options = {}) => {
    try {
      const result = runCommand(executable, args, { cwd: root, encoding: null, timeout: 15_000, maxBuffer: 16 * 1024 * 1024, ...options });
      if (!result || result.status !== 0 || result.error || result.signal) fail("command_failed");
      return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? "");
    } catch { fail("command_failed"); }
  };
  const adb = (...args) => command("adb", ["-s", serial, ...args]);
  const shell = (...args) => adb("shell", args.map(quote).join(" ")).toString("utf8").trim();
  return { command, adb, shell };
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
function configure(shell, config) {
  shell("settings", "put", "system", "font_scale", String(config.fontScale));
  shell("settings", "put", "system", "accelerometer_rotation", "0");
  // Set the logical display dimensions directly; avoid device natural-orientation assumptions.
  shell("settings", "put", "system", "user_rotation", "0");
  shell("wm", "size", `${config.width}x${config.height}`);
  shell("wm", "density", "160");
  shell("cmd", "uimode", "night", config.scheme === "dark" ? "yes" : "no");
  const actual = readSettings(shell);
  if (actual.settings.font_scale !== String(config.fontScale) || actual.settings.accelerometer_rotation !== "0"
    || actual.settings.user_rotation !== "0" || actual.size.override !== `${config.width}x${config.height}`
    || actual.density.override !== "160" || actual.night !== (config.scheme === "dark" ? "yes" : "no")) fail("configuration_mismatch");
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

async function marker(native, nonce, selected, mode) {
  const deadline = Date.now() + 5_000;
  do {
    const output = native.adb("logcat", "-d", "-v", "raw", "ReactNativeJS:I", "*:S").toString("utf8");
    let found;
    for (const line of output.split(/\r?\n/u)) {
      const start = line.indexOf("PHASE20_VISUAL_RESULT ");
      if (start < 0) continue;
      let value;
      try { value = JSON.parse(line.slice(start + "PHASE20_VISUAL_RESULT ".length)); } catch { continue; }
      if (value.nonce === nonce) found = value;
    }
    if (found) {
      if (!keys(found, MARKER_KEYS) || found.schema_version !== 1 || found.fixture_id !== FIXTURE
        || found.route !== ROUTE || found.source_revision !== 18 || found.source_read_only !== true
        || !["width_dp", "height_dp", "screen_width_dp", "screen_height_dp", "font_scale", "density"].every((k) => Number.isFinite(found[k]) && found[k] > 0)) fail("marker_invalid");
      if (found.state_id !== selected.state_id || found.source_state !== "plan-type-chooser"
        || found.configuration_id !== selected.config.id || found.mode !== mode) fail("state_mismatch");
      if (mode === "reset") {
        if (found.status !== "reset" || found.appearance !== "System") fail("restoration_failed");
      } else {
        if (found.status !== "ready") fail("state_mismatch");
        if (found.appearance !== selected.config.appearance || found.color_scheme !== selected.config.scheme
          || found.font_scale !== selected.config.fontScale || found.density !== 1
          || found.screen_width_dp !== selected.config.width || found.screen_height_dp !== selected.config.height
          || found.width_dp !== selected.config.width || found.height_dp > found.screen_height_dp) fail("configuration_mismatch");
      }
      return found;
    }
    await delay(100);
  } while (Date.now() < deadline);
  fail("marker_timeout");
}
async function navigate(native, root, serial, selected, mode) {
  const nonce = randomBytes(16).toString("hex");
  const params = new URLSearchParams({ nonce, state: selected.state_id, configuration: selected.config.id, fixture: FIXTURE, mode });
  const link = `gymtracker-devtest://${ROUTE}?${params}`;
  native.command("maestro", ["--device", serial, "test", "-e", `VISUAL_LINK=${link}`, "-e", `VISUAL_MODE=${mode}`, path.join(root, FLOW)], { timeout: 40_000 });
  return marker(native, nonce, selected, mode);
}

// Parse only UIAutomator's flat attributes. No XML entities/DOCTYPE expansion,
// raw text or arbitrary labels survive in the public result.
function observe(native, measured) {
  native.shell("uiautomator", "dump", `${LOCK}/window.xml`);
  const xml = native.shell("cat", `${LOCK}/window.xml`);
  if (xml.includes("<!") || xml.length > 2 * 1024 * 1024) fail("state_mismatch");
  const nodes = [...xml.matchAll(/<node\s+([^>]+)>/gu)].map((match) => Object.fromEntries(
    [...match[1].matchAll(/([\w-]+)="([^"]*)"/gu)].map((a) => [a[1], a[2]]),
  ));
  if (!nodes.some((n) => n["resource-id"]?.endsWith("plan-type-chooser") && n.package === PACKAGE)
    || !nodes.some((n) => n.text === "What are you training for?")
    || !nodes.some((n) => n.text === "Choose the plan structure first. Creating a plan does not activate it.")) fail("state_mismatch");
  const targets = ["Strength", "Running"].map((label) => {
    const candidates = nodes.filter((n) => n["content-desc"] === label && n.clickable === "true" && n.enabled === "true");
    if (candidates.length !== 1) fail("state_mismatch");
    const node = candidates[0];
    const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(node.bounds ?? "")?.slice(1).map(Number);
    if (!bounds || bounds[2] <= bounds[0] || bounds[3] <= bounds[1]
      || bounds[2] > measured.screen_width_dp * measured.density || bounds[3] > measured.screen_height_dp * measured.density
      || node.selected !== "false" || node.focusable !== "true") fail("state_mismatch");
    return { id: label.toLowerCase(), x_dp: bounds[0] / measured.density, y_dp: bounds[1] / measured.density,
      width_dp: (bounds[2] - bounds[0]) / measured.density, height_dp: (bounds[3] - bounds[1]) / measured.density,
      selected: false, focusable: true, focused: node.focused === "true" };
  });
  const [a, b] = targets;
  const overlap = a.x_dp < b.x_dp + b.width_dp && b.x_dp < a.x_dp + a.width_dp
    && a.y_dp < b.y_dp + b.height_dp && b.y_dp < a.y_dp + a.height_dp;
  return { native_execution: "EXECUTED", state_id: measured.state_id, configuration_id: measured.configuration_id,
    content: true, actions: true, copy: true, state: true, route: true,
    focus: targets.every((v) => v.focusable), order: a.y_dp < b.y_dp, non_color_state: true,
    commit_read_only: measured.source_read_only, targets: targets.map((v) => ({ ...v, overlap })),
    viewport: { width_dp: measured.width_dp, height_dp: measured.height_dp, density: measured.density },
    // These retained PNGs contain no approved instrumented bounds, baselines,
    // token map or CIEDE2000 observations. Returning zero/true would manufacture
    // a PASS. The aggregate comparison verifier deliberately rejects nulls.
    geometry_dp: null, baseline_icon_dp: null, token_exact: null, ciede2000: null,
    measurement_status: "approved_reference_instrumentation_missing" };
}

async function capture(native, root, serial, selected, attestation) {
  const { shell } = native;
  // Separate device-side exclusion prevents two actions borrowing the same
  // runtime lease from interleaving size/night-mode changes.
  shell("mkdir", LOCK);
  let snapshot; let configured = false; let routeAttempted = false; let result;
  try {
    snapshot = readSettings(shell);
    const savedState = { run_id: attestation.run_id, device_identity_sha256: attestation.device_identity_sha256, snapshot };
    native.command("adb", ["-s", serial, "shell", `cat > ${quote(`${LOCK}/restore.json`)}`], {
      input: JSON.stringify(savedState),
    });
    let saved;
    try { saved = JSON.parse(shell("cat", `${LOCK}/restore.json`)); } catch { fail("snapshot_failed"); }
    if (!same(saved, savedState)) fail("snapshot_failed");
    configured = true; configure(shell, selected.config);
    routeAttempted = true;
    const measured = await navigate(native, root, serial, selected, "capture");
    const observation = observe(native, measured);
    const bytes = native.adb("exec-out", "screencap", "-p");
    const image = png(bytes);
    if (image.width !== selected.config.width || image.height !== selected.config.height) fail("configuration_mismatch");
    const after = await marker(native, measured.nonce, selected, "capture");
    if (!same(measured, after) || !same(observation, observe(native, after))) fail("state_mismatch");
    const receipt = { schema_version: 1, nonce: measured.nonce, run_id: attestation.run_id, state_id: selected.state_id,
      configuration_id: selected.config.id, fixture_id: FIXTURE, source_tree_sha256: attestation.source_tree_sha256,
      apk_sha256: attestation.apk_sha256, device_identity_sha256: attestation.device_identity_sha256,
      png_sha256: hash(bytes), observation_sha256: hash(JSON.stringify(observation)) };
    result = { native_execution: "EXECUTED", fixture_id: FIXTURE, png_base64: bytes.toString("base64"),
      settings: { restored: false, privacy: "synthetic-only", state_receipt: receipt, observation } };
  } finally {
    let restorationFailed = false;
    // Reset in the configured viewport first. This unmounts the production
    // screen and reads back the isolated appearance store through useAppTheme.
    if (routeAttempted) {
      try { await navigate(native, root, serial, selected, "reset"); } catch { restorationFailed = true; }
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
  const entry = REFERENCES[selected.config.id];
  if (!entry) fail("reference_missing");
  const bytes = file(root, `.planning/design/v1.2-browser-evidence/${entry[0]}`, "reference_missing");
  if (hash(bytes) !== entry[1]) fail("reference_invalid");
  png(bytes);
  return bytes;
}
function retained(root, attestation) {
  const base = `artifacts/native/v1.2/${attestation.run_id}/screenshots`;
  const index = json(root, `${base}/index.json`, "capture_invalid");
  if (!keys(index, ["schema_version", "producer", "run_id", "records"], ["source_hashes"])
    || index.schema_version !== 1 || index.producer !== "v12-visual-capture-index/v1" || index.run_id !== attestation.run_id
    || !Array.isArray(index.records) || !index.records.length || index.records.length > 107 * 64) fail("capture_invalid");
  const seen = new Set();
  return index.records.map((entry) => {
    const selected = item({ state_id: entry.state_id, configuration_id: entry.configuration_id }, attestation.run_id);
    const key = `${selected.state_id}/${selected.config.id}`;
    if (seen.has(key)) fail("capture_invalid"); seen.add(key);
    const record = json(root, `${base}/${key}/capture.json`, "capture_invalid");
    if (!same(entry, record) || record.schema_version !== 2 || record.producer !== "v12-visual-capture/v2"
      || record.run_id !== attestation.run_id || record.native_execution !== "EXECUTED" || record.fixture_id !== FIXTURE
      || record.settings?.restored !== true || record.settings?.privacy !== "synthetic-only") fail("capture_invalid");
    const receipt = record.settings.state_receipt;
    if (!receipt || receipt.schema_version !== 1 || !/^[a-f0-9]{32}$/u.test(receipt.nonce ?? "")
      || receipt.run_id !== attestation.run_id || receipt.state_id !== selected.state_id || receipt.configuration_id !== selected.config.id
      || receipt.fixture_id !== FIXTURE || receipt.source_tree_sha256 !== attestation.source_tree_sha256
      || receipt.apk_sha256 !== attestation.apk_sha256 || receipt.device_identity_sha256 !== attestation.device_identity_sha256
      || receipt.observation_sha256 !== hash(JSON.stringify(record.settings.observation))) fail("capture_invalid");
    const expected = `${base}/${key}/native.png`;
    if (record.native_png?.path !== expected) fail("capture_invalid");
    const bytes = file(root, expected, "capture_invalid"); const image = png(bytes);
    if (hash(bytes) !== receipt.png_sha256 || record.native_png.sha256 !== receipt.png_sha256 || record.native_png.size_bytes !== bytes.length
      || record.native_png.width !== image.width || record.native_png.height !== image.height) fail("capture_invalid");
    return { selected, receipt, bytes, approved: reference(root, selected) };
  });
}

/**
 * Production visual action plugin. Call inside runtime.withLease(payload, ...).
 * runCommand is spawnSync-compatible; the default invokes real adb/Maestro.
 * No caller observations, reference paths, serials or arbitrary route names are
 * accepted. Unknown actions return undefined without inspecting other inputs.
 * Capture returns the native adapter's png_base64 shape; batch preserves order.
 * Compare reads retained captures and returns approved_reference_png_base64 plus
 * newly executed UI geometry tied to the *same PNG bytes*. Missing reference
 * measurements remain null (not aggregate PASS evidence).
 */
export async function executeProductionVisualAction({ action, payload, attestation, root = process.cwd(), serial = process.env.V12_DEVICE_SERIAL, runCommand = spawnSync } = {}) {
  if (!ACTIONS.has(action)) return undefined;
  try {
    if (!object(payload) || !RUN.test(payload.run_id ?? "") || payload.run_id !== attestation?.run_id) fail("payload_invalid");
    let selected;
    if (action === "visual-capture") selected = [item(payload, payload.run_id)];
    else if (action === "visual-capture-batch") {
      if (!keys(payload, ["run_id", "captures"], ["lease"]) || !Array.isArray(payload.captures)
        || !payload.captures.length || payload.captures.length > 107 * 64) fail("payload_invalid");
      selected = payload.captures.map((v) => item(v, payload.run_id));
      if (new Set(selected.map((v) => `${v.state_id}/${v.config.id}`)).size !== selected.length) fail("payload_invalid");
    } else if (!keys(payload, ["run_id"], ["lease"])) fail("payload_invalid");
    attest(root, action, payload, attestation);
    file(root, FLOW, "state_route_missing");
    file(root, `app${ROUTE}.tsx`, "state_route_missing");
    const comparisons = action === "visual-compare" ? retained(root, attestation) : undefined;
    const native = nativeTransport(runCommand, root, serial);
    verifyDevice(native, attestation, payload, serial);
    if (comparisons) {
      const results = [];
      for (const previous of comparisons) {
        const fresh = await capture(native, root, serial, previous.selected, attestation);
        if (!Buffer.from(fresh.png_base64, "base64").equals(previous.bytes)) fail("capture_mismatch");
        results.push({ id: previous.selected.state_id, configuration_id: previous.selected.config.id,
          approved_reference_png_base64: previous.approved.toString("base64"),
          observation: { ...fresh.settings.observation, capture_png_sha256: previous.receipt.png_sha256,
            capture_nonce: previous.receipt.nonce, observation_nonce: fresh.settings.state_receipt.nonce } });
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
