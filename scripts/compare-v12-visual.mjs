import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createV12NativeAdapter } from "./v12-native-adapter.mjs";
import { V12_BROWSER_WALK_STATE_IDS, V12_CONFIG_IDS } from "./v12-evidence-contract.mjs";
import { selectV12VisualReference, validateV12VisualSourceBinding } from "./v12-visual-authority.mjs";
import {
  V12_VISUAL_BATCH_WINDOW,
  executeV12VisualStreamingShard,
  iterateV12VisualJsonArray,
  readV12VisualJsonHeader,
} from "./v12-visual-streaming.mjs";

const require = createRequire(import.meta.url);
const SHA256 = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const V12_RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const registryCache = new Map();
const captureCursorCache = new Map();
const fail = (code) => { throw new Error(`v12_visual_compare_${code}`); };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function safeRelative(value) {
  if (typeof value !== "string" || value.length < 1 || path.isAbsolute(value) || value.includes("\\") || path.posix.normalize(value) !== value || value.split("/").some((part) => !part || part === "." || part === "..")) fail("path_invalid");
  return value;
}
function safeFile(root, relative) {
  safeRelative(relative); const resolvedRoot = path.resolve(root); const resolved = path.resolve(resolvedRoot, relative);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) fail("path_invalid");
  let cursor = resolvedRoot;
  for (const part of relative.split("/")) { cursor = path.join(cursor, part); const stat = lstatSync(cursor, { throwIfNoEntry: false }); if (!stat || stat.isSymbolicLink()) fail("path_invalid"); }
  if (!lstatSync(resolved).isFile()) fail("path_invalid"); return resolved;
}
function registry(root) {
  let value = registryCache.get(path.resolve(root));
  try {
    if (value === undefined) {
      value = JSON.parse(readFileSync(safeFile(root, "src/testing/phase20VisualStateRegistry.json"), "utf8"));
      registryCache.set(path.resolve(root), value);
    }
  } catch { fail("registry_invalid"); }
  if (!Array.isArray(value) || value.length !== 107) fail("registry_invalid");
  return value;
}
function configuration(id) {
  const match = /^AP-(L|D|SL|SD)-(C360|C390|M600|X840)-(P|L)-F(100|200)$/u.exec(id ?? "");
  if (!match) fail("input_invalid");
  const [, appearance, size, orientation, font] = match;
  const portrait = { C360: [360, 800], C390: [390, 844], M600: [600, 960], X840: [840, 1080] }[size];
  return { appearance: appearance.startsWith("S") ? "System" : appearance === "L" ? "Light" : "Dark", scheme: appearance.endsWith("D") ? "dark" : "light", size, orientation, fontScale: Number(font) / 100, width: orientation === "P" ? portrait[0] : portrait[1], height: orientation === "P" ? portrait[1] : portrait[0] };
}
export function decodeV12ComparisonPng(bytes) {
  let image; try { image = require("pngjs").PNG.sync.read(bytes); } catch { fail("png_invalid"); }
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1) fail("png_invalid");
  return Object.freeze({ width: image.width, height: image.height, data: image.data });
}
function pngDescriptor(relative, bytes) { const image = decodeV12ComparisonPng(bytes); return Object.freeze({ path: relative, sha256: sha256(bytes), size_bytes: bytes.length, width: image.width, height: image.height }); }
function readPng(root, descriptor, { expectedPath } = {}) {
  if (!descriptor || typeof descriptor !== "object" || !SHA256.test(descriptor.sha256 ?? "") || !Number.isSafeInteger(descriptor.size_bytes) || descriptor.size_bytes < 1 || !Number.isSafeInteger(descriptor.width) || descriptor.width < 1 || !Number.isSafeInteger(descriptor.height) || descriptor.height < 1 || (expectedPath !== undefined && descriptor.path !== expectedPath)) fail("artifact_invalid");
  const bytes = readFileSync(safeFile(root, descriptor.path)); const actual = pngDescriptor(descriptor.path, bytes);
  if (!same(actual, descriptor)) fail("artifact_invalid"); return Object.freeze({ bytes, image: decodeV12ComparisonPng(bytes), descriptor: actual });
}
function validateSourceReceipt(receipt, state, runId, configurationId) {
  const expected = { state_id: state.id, fixture_variant: state.fixture_variant, assertions: state.readiness.source_receipt.assertions,
    production_instance_id: receipt?.production_instance_id, mount_id: receipt?.mount_id,
    scroll_offsets: receipt?.scroll_offsets, timer: receipt?.timer };
  const receiptKeys = ["schema_version", "nonce", "state_id", "fixture_variant", "assertions", "production_instance_id", "mount_id", "scroll_offsets", "timer", "digest"];
  const timer = receipt?.timer;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt) || Object.keys(receipt).length !== receiptKeys.length || receiptKeys.some((key) => !Object.hasOwn(receipt, key))
    || receipt.schema_version !== 2 || !NONCE.test(receipt.nonce ?? "") || receipt.state_id !== state.id
    || receipt.fixture_variant !== state.fixture_variant || !same(receipt.assertions, expected.assertions)
    || !/^phase20-production-instance-\d+$/u.test(receipt.production_instance_id ?? "")
    || !/^phase20-production-mount-\d+$/u.test(receipt.mount_id ?? "")
    || !Array.isArray(receipt.scroll_offsets) || receipt.scroll_offsets.length === 0
    || receipt.scroll_offsets.some((entry) => !entry || Object.keys(entry).length !== 3 || !["native_id", "x", "y"].every((key) => Object.hasOwn(entry, key))
      || typeof entry.native_id !== "string" || !entry.native_id || !Number.isFinite(entry.x) || entry.x < 0 || !Number.isFinite(entry.y) || entry.y < 0)
    || new Set(receipt.scroll_offsets.map(({ native_id: nativeId }) => nativeId)).size !== receipt.scroll_offsets.length
    || timer !== null && (!timer || typeof timer !== "object" || Array.isArray(timer) || Object.keys(timer).length !== 4 || !["state", "revision", "remaining_ms", "ends_at_ms"].every((key) => Object.hasOwn(timer, key))
      || !["idle", "running", "paused", "expired"].includes(timer.state) || !Number.isSafeInteger(timer.revision) || timer.revision < 0
      || timer.remaining_ms !== null && (!Number.isFinite(timer.remaining_ms) || timer.remaining_ms < 0)
      || timer.ends_at_ms !== null && (!Number.isFinite(timer.ends_at_ms) || timer.ends_at_ms < 0)
      || timer.state === "running" && (timer.remaining_ms !== null || timer.ends_at_ms === null)
      || timer.state === "paused" && (timer.remaining_ms === null || timer.ends_at_ms !== null)
      || ["idle", "expired"].includes(timer.state) && (timer.remaining_ms !== null || timer.ends_at_ms !== null))
    || receipt.digest !== sha256(JSON.stringify(expected))) fail("state_receipt_invalid");
  return receipt;
}
function validateStateReceipt(receipt, observation, state, runId, configurationId, pngSha256) {
  if (!receipt || receipt.schema_version !== 3 || !NONCE.test(receipt.nonce ?? "") || receipt.run_id !== runId
    || receipt.state_id !== state.id || receipt.configuration_id !== configurationId || receipt.fixture_id !== "v12-synthetic-fixtures-r18"
    || receipt.readiness_status !== state.readiness.status || receipt.png_sha256 !== pngSha256
    || receipt.observation_sha256 !== sha256(JSON.stringify(observation)) || receipt.source_receipt?.nonce !== receipt.nonce) fail("state_receipt_invalid");
  validateSourceReceipt(receipt.source_receipt, state, runId, configurationId);
  if (configurationId.startsWith("AP-SD-") && (!receipt.system_transition || receipt.system_transition.from !== "light" || receipt.system_transition.to !== "dark"
    || receipt.system_transition.mounted_nonce !== receipt.nonce || !same(receipt.system_transition.color_scheme, { before: "light", after: "dark" })
    || !same(receipt.system_transition.before, receipt.system_transition.after)
    || receipt.system_transition.after.production_instance_id !== receipt.source_receipt.production_instance_id
    || receipt.system_transition.after.mount_id !== receipt.source_receipt.mount_id
    || !same(receipt.system_transition.after.scroll_offsets, receipt.source_receipt.scroll_offsets)
    || !same(receipt.system_transition.after.timer, receipt.source_receipt.timer)
    || !same(receipt.system_transition.after.native_focus, observation.native_focus))) fail("system_transition_invalid");
  return receipt;
}
function captureOrdinal(id, configurationId) {
  const stateIndex = V12_BROWSER_WALK_STATE_IDS.indexOf(id);
  const configurationIndex = V12_CONFIG_IDS.indexOf(configurationId);
  if (stateIndex < 0 || configurationIndex < 0) fail("capture_invalid");
  return stateIndex * V12_CONFIG_IDS.length + configurationIndex;
}
function streamedCaptureRecord(indexFile, runId, id, configurationId) {
  const stat = lstatSync(indexFile);
  let cursor = captureCursorCache.get(indexFile);
  const target = captureOrdinal(id, configurationId);
  if (!cursor || cursor.size !== stat.size || cursor.mtimeMs !== stat.mtimeMs || cursor.ordinal > target) {
    cursor?.iterator.return?.();
    const header = readV12VisualJsonHeader({ file: indexFile, firstArrayKey: "windows" });
    if (header.schema_version !== 2 || header.producer !== "v12-visual-capture-index/v2" || header.run_id !== runId
      || !Number.isSafeInteger(header.capture_count) || header.capture_count < 1 || header.capture_count > V12_BROWSER_WALK_STATE_IDS.length * V12_CONFIG_IDS.length) fail("capture_invalid");
    if (header.capture_count < V12_BROWSER_WALK_STATE_IDS.length * V12_CONFIG_IDS.length) {
      let found;
      for (const entry of iterateV12VisualJsonArray({ file: indexFile, arrayKey: "records" })) {
        if (entry.value?.state_id === id && entry.value?.configuration_id === configurationId) {
          if (found !== undefined) fail("capture_invalid");
          found = entry.value;
        }
      }
      if (found === undefined) fail("capture_invalid");
      return found;
    }
    cursor = { iterator: iterateV12VisualJsonArray({ file: indexFile, arrayKey: "records" }), ordinal: -1, record: undefined, size: stat.size, mtimeMs: stat.mtimeMs };
    captureCursorCache.set(indexFile, cursor);
    if (captureCursorCache.size > 8) {
      const oldest = captureCursorCache.keys().next().value;
      if (oldest !== indexFile) { captureCursorCache.get(oldest)?.iterator.return?.(); captureCursorCache.delete(oldest); }
    }
  }
  while (cursor.ordinal < target) {
    const next = cursor.iterator.next(); if (next.done) fail("capture_invalid");
    cursor.ordinal += 1; cursor.record = next.value.value;
  }
  if (cursor.record?.state_id !== id || cursor.record?.configuration_id !== configurationId) fail("capture_invalid");
  return cursor.record;
}
function capture(root, artifactRoot, runId, id, configurationId, { trustPublishedNative = false, record: suppliedRecord } = {}) {
  const relative = `artifacts/native/v1.2/${runId}/screenshots/index.json`;
  let record = suppliedRecord;
  if (record === undefined) {
    const indexFile = safeFile(artifactRoot, relative);
    try { record = streamedCaptureRecord(indexFile, runId, id, configurationId); } catch { fail("capture_invalid"); }
  }
  if (record?.schema_version !== 3 || record.producer !== "v12-visual-capture/v3" || record.run_id !== runId || record.state_id !== id || record.configuration_id !== configurationId || record.fixture_id !== "v12-synthetic-fixtures-r18" || record.native_execution !== "EXECUTED" || record.settings?.restored !== true || record.settings?.privacy !== "synthetic-only") fail("capture_invalid");
  const expectedPath = `artifacts/native/v1.2/${runId}/screenshots/${id}/${configurationId}/native.png`;
  if (record.native_png?.path !== expectedPath || !SHA256.test(record.native_png?.sha256 ?? "") || !Number.isSafeInteger(record.native_png?.size_bytes)
    || !Number.isSafeInteger(record.native_png?.width) || !Number.isSafeInteger(record.native_png?.height)) fail("capture_invalid");
  const native = trustPublishedNative ? Object.freeze({ descriptor: record.native_png }) : readPng(artifactRoot, record.native_png, { expectedPath });
  const state = registry(root).find((entry) => entry.id === id); if (!state) fail("registry_invalid");
  validateStateReceipt(record.settings.state_receipt, record.settings.observation, state, runId, configurationId, native.descriptor.sha256);
  return Object.freeze({ record_path: relative, record, native, state });
}
function readinessPass(value, state) {
  const ready = value?.readiness;
  const nativeFocusResourceId = value?.native_focus?.resource_id;
  const nativeFocusMatchesTarget = typeof nativeFocusResourceId === "string"
    && (nativeFocusResourceId === state.readiness.focus.target
      || nativeFocusResourceId.endsWith(`/${state.readiness.focus.target}`));
  const exactChecks = (actual, expected, key = "value") => Array.isArray(actual) && actual.length === expected.length
    && actual.every((entry, index) => entry?.[key] === expected[index]?.[key] && entry.matched === true);
  if (!value || value.native_execution !== "EXECUTED" || value.state_id !== state.id || ready?.status !== state.readiness.status
    || !exactChecks(ready.semantics, state.readiness.semantics.map((value) => ({ value })))
    || !exactChecks(ready.test_ids, state.readiness.test_ids.map((value) => ({ value })))
    || !Array.isArray(ready.actions) || ready.actions.length !== state.readiness.actions.length
    || ready.actions.some((entry, index) => entry.id !== state.readiness.actions[index].id || entry.label !== state.readiness.actions[index].label || entry.order !== index || entry.matched !== true || entry.enabled !== true)
    || !Array.isArray(ready.order) || ready.order.length !== state.readiness.order.length || ready.order.some((entry, index) => entry.value !== state.readiness.order[index] || entry.observed_order < 0 || index > 0 && entry.observed_order < ready.order[index - 1].observed_order)
    || !exactChecks(ready.non_color, state.readiness.non_color.map((value) => ({ value })))
    || state.readiness.focus.required !== true
    || ready.focus?.target !== state.readiness.focus.target || ready.focus.matched !== true
    || ready.focus.focusable !== true || ready.focus.focused !== true
    || !nativeFocusMatchesTarget
    || !Array.isArray(value.targets) || value.targets.length === 0 || value.targets.some((target) => !Number.isFinite(target?.width_dp) || target.width_dp < 48 || !Number.isFinite(target?.height_dp) || target.height_dp < 48 || target.overlap !== false)) fail("observation_invalid");
  validateSourceReceipt(ready.source_receipt, state);
  const source = state.reference.kind === "retained_png" ? state.reference.source : state.reference;
  if (value.measurement?.kind !== "source_semantic" || value.measurement.renderer_digest !== source.renderer_digest
    || value.measurement.semantic_digest !== source.semantic_digest || value.measurement.layout_digest !== source.layout_digest) fail("observation_invalid");
  return true;
}

function srgb(value) { const normalized = value / 255; return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4; }
function lab(data, offset) {
  const r = srgb(data[offset]); const g = srgb(data[offset + 1]); const b = srgb(data[offset + 2]);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (v) => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
function ciede2000([l1, a1, b1], [l2, a2, b2]) {
  const radians = Math.PI / 180; const degrees = 180 / Math.PI;
  const c1 = Math.hypot(a1, b1); const c2 = Math.hypot(a2, b2); const meanC = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)));
  const ap1 = (1 + g) * a1; const ap2 = (1 + g) * a2;
  const cp1 = Math.hypot(ap1, b1); const cp2 = Math.hypot(ap2, b2);
  const hue = (a, b) => { const value = Math.atan2(b, a) * degrees; return value < 0 ? value + 360 : value; };
  const hp1 = hue(ap1, b1); const hp2 = hue(ap2, b2); const dl = l2 - l1; const dc = cp2 - cp1;
  const dhDegrees = cp1 * cp2 === 0 ? 0 : Math.abs(hp2 - hp1) <= 180 ? hp2 - hp1 : hp2 <= hp1 ? hp2 - hp1 + 360 : hp2 - hp1 - 360;
  const dh = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dhDegrees / 2) * radians);
  const meanL = (l1 + l2) / 2; const meanCp = (cp1 + cp2) / 2;
  const meanH = cp1 * cp2 === 0 ? hp1 + hp2 : Math.abs(hp1 - hp2) <= 180 ? (hp1 + hp2) / 2 : hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
  const t = 1 - 0.17 * Math.cos((meanH - 30) * radians) + 0.24 * Math.cos(2 * meanH * radians)
    + 0.32 * Math.cos((3 * meanH + 6) * radians) - 0.2 * Math.cos((4 * meanH - 63) * radians);
  const deltaTheta = 30 * Math.exp(-(((meanH - 275) / 25) ** 2)); const rc = 2 * Math.sqrt(meanCp ** 7 / (meanCp ** 7 + 25 ** 7));
  const sl = 1 + 0.015 * (meanL - 50) ** 2 / Math.sqrt(20 + (meanL - 50) ** 2); const sc = 1 + 0.045 * meanCp; const sh = 1 + 0.015 * meanCp * t;
  const rt = -Math.sin(2 * deltaTheta * radians) * rc; const l = dl / sl; const c = dc / sc; const h = dh / sh;
  return Math.sqrt(l * l + c * c + h * h + rt * c * h);
}

export function deriveV12PixelComparison(reference, native, exclusionMask) {
  if (reference.width !== native.width || reference.height !== native.height || exclusionMask && (exclusionMask.width !== native.width || exclusionMask.height !== native.height)) fail("dimensions_invalid");
  const { PNG } = require("pngjs"); const overlay = new PNG({ width: reference.width, height: reference.height }); const difference = new PNG({ width: reference.width, height: reference.height }); const mask = new PNG({ width: reference.width, height: reference.height });
  let changedPixels = 0; let unmaskedPixels = 0; let delta = 0; let maxCie = 0;
  for (let offset = 0; offset < reference.data.length; offset += 4) {
    const excluded = exclusionMask !== undefined && exclusionMask.data[offset + 3] > 0;
    const channels = [0, 1, 2].map((channel) => Math.abs(reference.data[offset + channel] - native.data[offset + channel]));
    const changed = !excluded && channels.some((value) => value > 12);
    if (!excluded) { unmaskedPixels += 1; delta += channels.reduce((sum, value) => sum + value, 0); maxCie = Math.max(maxCie, ciede2000(lab(reference.data, offset), lab(native.data, offset))); }
    for (let channel = 0; channel < 4; channel += 1) {
      overlay.data[offset + channel] = channel === 3 ? 255 : Math.round((reference.data[offset + channel] + native.data[offset + channel]) / 2);
      difference.data[offset + channel] = channel === 3 ? 255 : excluded ? 0 : channels[channel];
      mask.data[offset + channel] = channel === 3 ? 255 : changed ? 255 : 0;
    }
    if (changed) changedPixels += 1;
  }
  if (unmaskedPixels === 0) fail("mask_invalid");
  return Object.freeze({ bytes: Object.freeze({ overlay: PNG.sync.write(overlay), difference: PNG.sync.write(difference), mask: PNG.sync.write(mask) }), metrics: Object.freeze({ kind: "pixel", width: reference.width, height: reference.height, total_pixels: reference.width * reference.height, masked_pixels: reference.width * reference.height - unmaskedPixels, unmasked_pixels: unmaskedPixels, changed_pixels: changedPixels, pixel_percent: changedPixels / unmaskedPixels * 100, mean_absolute_srgb_delta: delta / (unmaskedPixels * 3), max_ciede2000: maxCie }) });
}
function writeExclusive(root, relative, bytes, write) { safeRelative(relative); if (write) return write(relative, bytes); const target = path.resolve(root, relative); if (!target.startsWith(`${path.resolve(root)}${path.sep}`) || existsSync(target)) fail("immutable_output_invalid"); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, bytes, { flag: "wx" }); }
function classFor(execution, semanticPassed, metrics) { if (execution !== "EXECUTED") return "NOT_RUN"; if (!semanticPassed) return "FAIL"; if (metrics.kind === "source_semantic") return "PASS"; if (metrics.pixel_percent > 2) return "FAIL"; return metrics.pixel_percent <= 0.5 ? "PASS" : "REVIEW_REQUIRED"; }

export function produceV12ComparisonRecord({ runId, root = process.cwd(), artifactRoot = root, input, captureRecord, write } = {}) {
  if (!V12_RUN_ID.test(runId ?? "") || !input || !/^BW-\d{3}$/u.test(input.id ?? "") || typeof input.configuration_id !== "string" || Object.hasOwn(input, "approved_reference_png_base64")) fail("input_invalid");
  const state = registry(root).find((entry) => entry.id === input.id); if (!state) fail("input_invalid");
  const config = configuration(input.configuration_id); const expectedBinding = selectV12VisualReference(state, config);
  if (!same(input.reference_binding, expectedBinding)) fail("reference_invalid");
  validateV12VisualSourceBinding(expectedBinding.kind === "retained_png" ? expectedBinding.source : expectedBinding, { root, stateId: state.id, stateName: state.name });
  const nativeCapture = capture(root, artifactRoot, runId, input.id, input.configuration_id, { record: captureRecord });
  validateStateReceipt(input.capture_state_receipt, nativeCapture.record.settings.observation, state, runId, input.configuration_id, nativeCapture.native.descriptor.sha256);
  validateStateReceipt(input.state_receipt, input.observation, state, runId, input.configuration_id, nativeCapture.native.descriptor.sha256);
  if (input.state_receipt.nonce === input.capture_state_receipt.nonce || input.observation.capture_nonce !== input.capture_state_receipt.nonce || input.observation.observation_nonce !== input.state_receipt.nonce || input.observation.capture_png_sha256 !== nativeCapture.native.descriptor.sha256) fail("state_receipt_invalid");
  const semanticPassed = input.observation.native_execution === "EXECUTED" ? readinessPass(input.observation, state) : false;
  const base = `artifacts/native/v1.2/${runId}/comparison/${input.id}/${input.configuration_id}`;
  const observationBytes = Buffer.from(`${JSON.stringify(input.observation)}\n`); const observationPath = `${base}/instrumented-observation.json`;
  const artifacts = { native: nativeCapture.native.descriptor };
  let metrics; let observationDescriptor;
  if (expectedBinding.kind === "retained_png") {
    writeExclusive(artifactRoot, observationPath, observationBytes, write);
    observationDescriptor = Object.freeze({ path: observationPath, sha256: sha256(observationBytes), size_bytes: observationBytes.length });
    const referenceBytes = readFileSync(safeFile(root, expectedBinding.path));
    if (sha256(referenceBytes) !== expectedBinding.sha256) fail("reference_invalid");
    const compared = deriveV12PixelComparison(decodeV12ComparisonPng(referenceBytes), nativeCapture.native.image);
    const referencePath = `${base}/reference.png`; writeExclusive(artifactRoot, referencePath, referenceBytes, write); artifacts.reference = pngDescriptor(referencePath, referenceBytes);
    for (const [kind, bytes] of Object.entries(compared.bytes)) { const relative = `${base}/${kind}.png`; writeExclusive(artifactRoot, relative, bytes, write); artifacts[kind] = pngDescriptor(relative, bytes); }
    metrics = compared.metrics;
  } else {
    observationDescriptor = Object.freeze({ inline: input.observation, sha256: sha256(observationBytes), size_bytes: observationBytes.length });
    metrics = Object.freeze({ kind: "source_semantic", renderer_digest: expectedBinding.renderer_digest, semantic_digest: expectedBinding.semantic_digest, layout_digest: expectedBinding.layout_digest });
  }
  const classification = classFor(input.observation.native_execution, semanticPassed, metrics);
  return Object.freeze({ schema_version: 3, id: input.id, configuration_id: input.configuration_id, comparison_mode: expectedBinding.kind, classification, counts_as_pass: classification === "PASS", capture_record_path: nativeCapture.record_path, reference_binding: expectedBinding, capture_state_receipt: input.capture_state_receipt, state_receipt: input.state_receipt, observation: observationDescriptor, artifacts: Object.freeze(artifacts), metrics });
}

export function verifyV12ComparisonRecord({ runId, root = process.cwd(), artifactRoot = root, result, captureRecord, trustPublishedNative = false } = {}) {
  if (!V12_RUN_ID.test(runId ?? "") || !result || result.schema_version !== 3 || !/^BW-\d{3}$/u.test(result.id ?? "") || typeof result.configuration_id !== "string" || !["retained_png", "approved_source"].includes(result.comparison_mode) || !["PASS", "FAIL", "REVIEW_REQUIRED", "NOT_RUN"].includes(result.classification) || result.counts_as_pass !== (result.classification === "PASS")) fail("result_invalid");
  const state = registry(root).find((entry) => entry.id === result.id); if (!state) fail("registry_invalid");
  const expectedBinding = selectV12VisualReference(state, configuration(result.configuration_id));
  if (!same(result.reference_binding, expectedBinding) || result.comparison_mode !== expectedBinding.kind) fail("reference_invalid");
  validateV12VisualSourceBinding(expectedBinding.kind === "retained_png" ? expectedBinding.source : expectedBinding, { root, stateId: state.id, stateName: state.name });
  const nativeCapture = capture(root, artifactRoot, runId, result.id, result.configuration_id, { record: captureRecord, trustPublishedNative: trustPublishedNative && result.comparison_mode === "approved_source" });
  if (result.capture_record_path !== nativeCapture.record_path || !same(result.artifacts?.native, nativeCapture.native.descriptor)) fail("capture_invalid");
  let observationBytes;
  if (result.comparison_mode === "approved_source") {
    if (!result.observation?.inline || Object.hasOwn(result.observation, "path")) fail("observation_invalid");
    observationBytes = Buffer.from(`${JSON.stringify(result.observation.inline)}\n`);
  } else {
    if (typeof result.observation?.path !== "string" || Object.hasOwn(result.observation, "inline")) fail("observation_invalid");
    observationBytes = readFileSync(safeFile(artifactRoot, result.observation.path));
  }
  if (sha256(observationBytes) !== result.observation.sha256 || observationBytes.length !== result.observation.size_bytes) fail("observation_invalid");
  let observation; try { observation = result.observation.inline ?? JSON.parse(observationBytes); } catch { fail("observation_invalid"); }
  validateStateReceipt(result.capture_state_receipt, nativeCapture.record.settings.observation, state, runId, result.configuration_id, nativeCapture.native.descriptor.sha256);
  validateStateReceipt(result.state_receipt, observation, state, runId, result.configuration_id, nativeCapture.native.descriptor.sha256);
  const semanticPassed = observation.native_execution === "EXECUTED" ? readinessPass(observation, state) : false;
  let metrics;
  if (expectedBinding.kind === "retained_png") {
    const approved = readFileSync(safeFile(root, expectedBinding.path)); if (sha256(approved) !== expectedBinding.sha256) fail("reference_invalid");
    const reference = readPng(artifactRoot, result.artifacts?.reference); if (!reference.bytes.equals(approved)) fail("artifact_invalid");
    const generated = deriveV12PixelComparison(reference.image, nativeCapture.native.image); metrics = generated.metrics;
    for (const [kind, bytes] of Object.entries(generated.bytes)) { const artifact = readPng(artifactRoot, result.artifacts?.[kind]); if (artifact.descriptor.sha256 !== sha256(bytes) || !artifact.bytes.equals(bytes)) fail("artifact_invalid"); }
  } else {
    if (!same(Object.keys(result.artifacts ?? {}).sort(), ["native"])) fail("artifact_invalid");
    metrics = { kind: "source_semantic", renderer_digest: expectedBinding.renderer_digest, semantic_digest: expectedBinding.semantic_digest, layout_digest: expectedBinding.layout_digest };
  }
  if (!same(result.metrics, metrics) || result.classification !== classFor(observation.native_execution, semanticPassed, metrics)) fail("metrics_invalid");
  return true;
}

export function validateV12ComparisonShard(shard, { root = process.cwd(), artifactRoot = root, runId } = {}) {
  if (!shard || shard.schema_version !== 3 || !Array.isArray(shard.results) || shard.results.length === 0) fail("shard_invalid");
  const seen = new Set(); for (const result of shard.results) { const key = `${result?.id}\u0000${result?.configuration_id}`; if (seen.has(key)) fail("duplicate_invalid"); verifyV12ComparisonRecord({ runId, root, artifactRoot, result }); seen.add(key); } return true;
}
function parseCli(args) { if (!Array.isArray(args) || args.length !== 3 || args[0] !== "--run" || !V12_RUN_ID.test(args[1] ?? "") || !["--all", "--verify"].includes(args[2])) fail("arguments_invalid"); return { runId: args[1], command: args[2] }; }
const comparisonCount = V12_BROWSER_WALK_STATE_IDS.length * V12_CONFIG_IDS.length;
function comparisonIdentity(index) {
  const stateId = V12_BROWSER_WALK_STATE_IDS[Math.floor(index / V12_CONFIG_IDS.length)];
  const configurationId = V12_CONFIG_IDS[index % V12_CONFIG_IDS.length];
  if (stateId === undefined || configurationId === undefined) fail("input_order_invalid");
  return Object.freeze({ state_id: stateId, configuration_id: configurationId });
}
function testBatchWindow() {
  return process.env.NODE_ENV === "test" && process.env.V12_NATIVE_ADAPTER_TEST_MODE === "phase20-native-adapter-subprocess"
    && process.env.V12_NATIVE_ADAPTER_TEST_PROCESS === "1" && typeof process.env.V12_NATIVE_ADAPTER_COMMAND === "string";
}

export function executeV12VisualComparison({
  runId,
  root = process.cwd(),
  artifactRoot = root,
  compare,
  batchWindow = V12_VISUAL_BATCH_WINDOW,
  executionOrigin,
  produceRecord = produceV12ComparisonRecord,
  onWindowCommitted,
} = {}) {
  if (!V12_RUN_ID.test(runId ?? "") || typeof compare !== "function" || typeof produceRecord !== "function"
    || !Number.isSafeInteger(batchWindow) || batchWindow < 1 || batchWindow > 512
    || (batchWindow !== V12_VISUAL_BATCH_WINDOW && !testBatchWindow())) fail("input_invalid");
  const captureIndex = safeFile(artifactRoot, `artifacts/native/v1.2/${runId}/screenshots/index.json`);
  const captureHeader = readV12VisualJsonHeader({ file: captureIndex, firstArrayKey: "windows" });
  if (captureHeader.schema_version !== 2 || captureHeader.producer !== "v12-visual-capture-index/v2"
    || captureHeader.run_id !== runId || captureHeader.capture_count !== comparisonCount) fail("capture_invalid");
  const captures = iterateV12VisualJsonArray({ file: captureIndex, arrayKey: "records" });
  let captureOffset = 0;
  const takeCaptureWindow = (offset, count) => {
    if (offset !== captureOffset) fail("input_order_invalid");
    const items = [];
    for (let index = 0; index < count; index += 1) {
      const next = captures.next(); if (next.done) fail("input_order_invalid");
      const expected = comparisonIdentity(offset + index); const record = next.value.value;
      if (record?.state_id !== expected.state_id || record?.configuration_id !== expected.configuration_id) fail("input_order_invalid");
      items.push(Object.freeze({ ...expected, capture_record: record, capture_index_offset: next.value.offset, capture_index_size: next.value.size }));
    }
    captureOffset += count;
    return Object.freeze(items);
  };
  // The streamed publisher preserves the v12-atomic-shard-publication/v1
  // manifest while avoiding capture, adapter-result, and comparison arrays.
  return executeV12VisualStreamingShard({
    root: artifactRoot,
    runId,
    shard: "comparison",
    totalCount: comparisonCount,
    batchWindow,
    indexRelative: "comparison/index.json",
    indexHeader: Object.freeze({ schema_version: 3, producer: "v12-visual-comparison-index/v3", run_id: runId, comparison_count: comparisonCount }),
    resultKey: "results",
    expectedWindow: takeCaptureWindow,
    cleanupPending: ({ items, remove }) => {
      for (const item of items) remove(`comparison/${item.state_id}/${item.configuration_id}`, { recursive: true });
    },
    processWindow: ({ items, offset, ordinal, write }) => {
      const requested = items.map(({ state_id, configuration_id, capture_index_offset, capture_index_size }) => ({ state_id, configuration_id, capture_index_offset, capture_index_size }));
      const identities = requested.map(({ state_id, configuration_id }) => ({ state_id, configuration_id }));
      const compared = compare(Object.freeze({ run_id: runId, captures: Object.freeze(requested) }));
      if (!Array.isArray(compared) || compared.length !== requested.length
        || compared.some((entry, index) => entry?.id !== requested[index].state_id || entry?.configuration_id !== requested[index].configuration_id)) fail("window_invalid");
      const requestBytes = Buffer.byteLength(JSON.stringify({ run_id: runId, captures: requested }));
      const responseBytes = Buffer.byteLength(JSON.stringify(compared));
      if (requestBytes > 1024 * 1024 || responseBytes > 32 * 1024 * 1024) fail("window_transport_limit_invalid");
      const results = compared.map((input, index) => {
        try {
          return produceRecord({ runId, root, artifactRoot, input, captureRecord: items[index].capture_record,
            write: (file, value) => write(file.replace(`artifacts/native/v1.2/${runId}/`, ""), value) });
        } catch (error) {
          throw new Error(`${error instanceof Error ? error.message : "v12_visual_compare_failed"}:${input?.id ?? "unknown"}:${input?.configuration_id ?? "unknown"}`);
        }
      });
      return Object.freeze({
        records: results,
        window: Object.freeze({ ordinal, offset, count: results.length,
          first: `${results[0].id}/${results[0].configuration_id}`,
          last: `${results.at(-1).id}/${results.at(-1).configuration_id}`,
          request_bytes: requestBytes,
          response_bytes: responseBytes,
          request_sha256: sha256(JSON.stringify(identities)),
          result_sha256: sha256(JSON.stringify(results.map(({ state_receipt }) => state_receipt))) }),
        execution_origin: typeof executionOrigin === "function" ? executionOrigin() : executionOrigin,
      });
    },
    validateBatch: (entry, offset) => {
      const items = takeCaptureWindow(offset, entry.count);
      const identities = items.map(({ state_id, configuration_id }) => ({ state_id, configuration_id }));
      return entry.records.every((result, index) => result?.id === identities[index].state_id && result?.configuration_id === identities[index].configuration_id)
        && entry.window.request_sha256 === sha256(JSON.stringify(identities))
        && entry.window.result_sha256 === sha256(JSON.stringify(entry.records.map(({ state_receipt }) => state_receipt)));
    },
    validateComplete: () => captureOffset === comparisonCount && captures.next().done,
    onWindowCommitted,
  });
}

export function verifyV12VisualComparison({ runId, root = process.cwd(), artifactRoot = root } = {}) {
  if (!V12_RUN_ID.test(runId ?? "")) fail("arguments_invalid");
  const indexFile = safeFile(artifactRoot, `artifacts/native/v1.2/${runId}/comparison/index.json`);
  const captureFile = safeFile(artifactRoot, `artifacts/native/v1.2/${runId}/screenshots/index.json`);
  const index = readV12VisualJsonHeader({ file: indexFile, firstArrayKey: "windows" });
  const captureIndex = readV12VisualJsonHeader({ file: captureFile, firstArrayKey: "windows" });
  if (index.schema_version !== 3 || index.producer !== "v12-visual-comparison-index/v3" || index.run_id !== runId || index.comparison_count !== comparisonCount
    || captureIndex.schema_version !== 2 || captureIndex.producer !== "v12-visual-capture-index/v2" || captureIndex.run_id !== runId || captureIndex.capture_count !== comparisonCount) fail("index_invalid");
  const windows = iterateV12VisualJsonArray({ file: indexFile, arrayKey: "windows" });
  const results = iterateV12VisualJsonArray({ file: indexFile, arrayKey: "results" });
  const captures = iterateV12VisualJsonArray({ file: captureFile, arrayKey: "records" });
  let offset = 0;
  let ordinal = 0;
  for (const { value: window } of windows) {
    if (window.ordinal !== ordinal || window.offset !== offset || !Number.isSafeInteger(window.count) || window.count < 1 || window.count > 512
      || !Number.isSafeInteger(window.request_bytes) || window.request_bytes > 1024 * 1024
      || !Number.isSafeInteger(window.response_bytes) || window.response_bytes > 32 * 1024 * 1024) fail("window_invalid");
    const identities = []; const receipts = [];
    for (let indexInWindow = 0; indexInWindow < window.count; indexInWindow += 1) {
      const expected = comparisonIdentity(offset + indexInWindow);
      const resultNext = results.next(); const captureNext = captures.next();
      if (resultNext.done || captureNext.done) fail("index_invalid");
      const result = resultNext.value.value; const captureRecord = captureNext.value.value;
      if (result?.id !== expected.state_id || result?.configuration_id !== expected.configuration_id
        || captureRecord?.state_id !== expected.state_id || captureRecord?.configuration_id !== expected.configuration_id) fail("input_order_invalid");
      verifyV12ComparisonRecord({ runId, root, artifactRoot, result, captureRecord });
      identities.push(expected); receipts.push(result.state_receipt);
    }
    if (window.first !== `${identities[0].state_id}/${identities[0].configuration_id}`
      || window.last !== `${identities.at(-1).state_id}/${identities.at(-1).configuration_id}`
      || window.request_sha256 !== sha256(JSON.stringify(identities))
      || window.result_sha256 !== sha256(JSON.stringify(receipts))) fail("window_invalid");
    offset += window.count; ordinal += 1;
  }
  if (offset !== comparisonCount || ordinal < 1 || !results.next().done || !captures.next().done) fail("window_invalid");
  return true;
}
export function runV12VisualComparisonCli(args = process.argv.slice(2), io = process) {
  try {
    const { runId, command } = parseCli(args);
    if (command === "--verify") verifyV12VisualComparison({ runId });
    else {
      const adapter = createV12NativeAdapter();
      const batchWindow = testBatchWindow() ? 512 : V12_VISUAL_BATCH_WINDOW;
      executeV12VisualComparison({ runId, compare: adapter.compare, batchWindow, executionOrigin: () => adapter.executionOrigin("visual-compare") });
    }
    io.stdout.write(`${JSON.stringify({ run_id: runId, command, ok: true })}\n`); return 0;
  } catch (error) { io.stderr.write(`${error.message}\n`); return 1; }
}
if (process.argv[1]?.endsWith("compare-v12-visual.mjs")) process.exitCode = runV12VisualComparisonCli();
