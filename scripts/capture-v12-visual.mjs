import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createV12NativeAdapter } from "./v12-native-adapter.mjs";
import { publishV12AtomicShard } from "./v12-atomic-shard-publication.mjs";

import {
  V12_BROWSER_WALK_STATE_IDS,
  V12_CONFIG_IDS,
  loadV12ContractInputs,
} from "./v12-evidence-contract.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const require = createRequire(import.meta.url);
const V12_RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
export const V12_VISUAL_BATCH_WINDOW = 4;
const registryCache = new Map();
const FLOW_SOURCES = Object.freeze([
  Object.freeze({ id: "multi-plan", sourcePath: "maestro/v1.2/multi-plan.yaml", contractPath: "src/testing/contracts/multiPlanRunning.contract.ts", prefix: "phase13-" }),
  Object.freeze({ id: "workout", sourcePath: "maestro/v1.2/workout.yaml", contractPath: "src/testing/contracts/phase15Workout.contract.ts", prefix: "workout." }),
  Object.freeze({ id: "library-running", sourcePath: "maestro/v1.2/library-running.yaml", contractPath: "src/testing/contracts/phase17LibraryRunning.contract.ts", prefix: "library." }),
]);

function fail(code) {
  throw new Error(`v12_visual_capture_${code}`);
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeNativePng(bytes) {
  let image;
  try { image = require("pngjs").PNG.sync.read(bytes); } catch { fail("png_invalid"); }
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1) fail("png_invalid");
  return Object.freeze({ width: image.width, height: image.height });
}

function visualState(root, stateId) {
  let states = registryCache.get(path.resolve(root));
  try {
    if (states === undefined) {
      states = JSON.parse(readFileSync(path.join(root, "src/testing/phase20VisualStateRegistry.json"), "utf8"));
      registryCache.set(path.resolve(root), states);
    }
  } catch { fail("state_receipt_invalid"); }
  const state = Array.isArray(states) ? states.find(({ id }) => id === stateId) : undefined;
  if (!state) fail("state_receipt_invalid");
  return state;
}

function validateStateReceipt(root, runId, item, measured, pngSha256) {
  const state = visualState(root, item.state_id); const receipt = measured.settings.state_receipt; const observation = measured.settings.observation;
  const sourceReceipt = receipt?.source_receipt;
  const sourceMaterial = { state_id: item.state_id, fixture_variant: state.fixture_variant, assertions: state.readiness.source_receipt.assertions,
    production_instance_id: sourceReceipt?.production_instance_id, mount_id: sourceReceipt?.mount_id,
    scroll_offsets: sourceReceipt?.scroll_offsets, timer: sourceReceipt?.timer };
  if (!receipt || receipt.schema_version !== 3 || !/^[a-f0-9]{32}$/u.test(receipt.nonce ?? "")
    || receipt.run_id !== runId || receipt.state_id !== item.state_id || receipt.configuration_id !== item.configuration_id
    || receipt.fixture_id !== item.fixture_id || receipt.png_sha256 !== pngSha256
    || ![receipt.source_tree_sha256, receipt.apk_sha256, receipt.device_identity_sha256].every((value) => SHA256.test(value ?? ""))
    || receipt.observation_sha256 !== hash(JSON.stringify(observation)) || receipt.readiness_status !== state.readiness.status
    || observation?.state_id !== item.state_id || observation?.configuration_id !== item.configuration_id || observation?.readiness?.status !== state.readiness.status
    || !sourceReceipt || typeof sourceReceipt !== "object" || Array.isArray(sourceReceipt) || sourceReceipt.schema_version !== 2
    || Object.keys(sourceReceipt).length !== 10
    || ["schema_version", "nonce", "state_id", "fixture_variant", "assertions", "production_instance_id", "mount_id", "scroll_offsets", "timer", "digest"].some((key) => !Object.hasOwn(sourceReceipt, key))
    || sourceReceipt.nonce !== receipt.nonce
    || sourceReceipt.state_id !== item.state_id || sourceReceipt.fixture_variant !== state.fixture_variant
    || JSON.stringify(sourceReceipt.assertions) !== JSON.stringify(sourceMaterial.assertions)
    || !/^phase20-production-instance-\d+$/u.test(sourceReceipt.production_instance_id ?? "")
    || !/^phase20-production-mount-\d+$/u.test(sourceReceipt.mount_id ?? "")
    || !Array.isArray(sourceReceipt.scroll_offsets) || sourceReceipt.scroll_offsets.length === 0
    || sourceReceipt.scroll_offsets.some((entry) => !entry || Object.keys(entry).length !== 3 || !["native_id", "x", "y"].every((key) => Object.hasOwn(entry, key))
      || typeof entry.native_id !== "string" || !entry.native_id || !Number.isFinite(entry.x) || entry.x < 0 || !Number.isFinite(entry.y) || entry.y < 0)
    || new Set(sourceReceipt.scroll_offsets.map(({ native_id: nativeId }) => nativeId)).size !== sourceReceipt.scroll_offsets.length
    || sourceReceipt.timer !== null && (typeof sourceReceipt.timer !== "object" || Array.isArray(sourceReceipt.timer)
      || Object.keys(sourceReceipt.timer).length !== 4 || !["state", "revision", "remaining_ms", "ends_at_ms"].every((key) => Object.hasOwn(sourceReceipt.timer, key))
      || !["idle", "running", "paused", "expired"].includes(sourceReceipt.timer.state) || !Number.isSafeInteger(sourceReceipt.timer.revision) || sourceReceipt.timer.revision < 0
      || sourceReceipt.timer.remaining_ms !== null && (!Number.isFinite(sourceReceipt.timer.remaining_ms) || sourceReceipt.timer.remaining_ms < 0)
      || sourceReceipt.timer.ends_at_ms !== null && (!Number.isFinite(sourceReceipt.timer.ends_at_ms) || sourceReceipt.timer.ends_at_ms < 0)
      || sourceReceipt.timer.state === "running" && (sourceReceipt.timer.remaining_ms !== null || sourceReceipt.timer.ends_at_ms === null)
      || sourceReceipt.timer.state === "paused" && (sourceReceipt.timer.remaining_ms === null || sourceReceipt.timer.ends_at_ms !== null)
      || ["idle", "expired"].includes(sourceReceipt.timer.state) && (sourceReceipt.timer.remaining_ms !== null || sourceReceipt.timer.ends_at_ms !== null))
    || sourceReceipt.digest !== hash(JSON.stringify(sourceMaterial))) fail("state_receipt_invalid");
  if (item.configuration_id.startsWith("AP-SD-") && (!receipt.system_transition || receipt.system_transition.mounted_nonce !== receipt.nonce
    || receipt.system_transition.from !== "light" || receipt.system_transition.to !== "dark"
    || !receipt.system_transition.color_scheme || receipt.system_transition.color_scheme.before !== "light" || receipt.system_transition.color_scheme.after !== "dark"
    || JSON.stringify(receipt.system_transition.before) !== JSON.stringify(receipt.system_transition.after)
    || receipt.system_transition.after.production_instance_id !== sourceReceipt.production_instance_id
    || receipt.system_transition.after.mount_id !== sourceReceipt.mount_id
    || JSON.stringify(receipt.system_transition.after.scroll_offsets) !== JSON.stringify(sourceReceipt.scroll_offsets)
    || JSON.stringify(receipt.system_transition.after.timer) !== JSON.stringify(sourceReceipt.timer)
    || JSON.stringify(receipt.system_transition.after.native_focus) !== JSON.stringify(observation.native_focus))) fail("system_transition_invalid");
  return receipt;
}

function sourceCaseIds(root, { contractPath, prefix }) {
  const text = readFileSync(path.join(root, contractPath), "utf8");
  const ids = [...text.matchAll(/\[\s*["']([^"']+)["']/gu)].map(([, id]) => id)
    .filter((id) => id.startsWith(prefix));
  const ordered = [...new Set(ids)];
  // Source contracts reuse IDs in receipt/readback tables; the first lexical
  // contract occurrence establishes the executable semantic-stage order.
  if (ordered.length === 0) fail("source_case_ids_invalid");
  return Object.freeze(ordered);
}

function flowSnapshot(root, source) {
  const bytes = readFileSync(path.join(root, source.sourcePath));
  const text = bytes.toString("utf8");
  if (!text.includes("appId: com.fchoo.gymtracker.devtest") || !text.includes("V12_CASE_ID")) {
    fail("flow_source_invalid");
  }
  return Object.freeze({
    id: source.id,
    source_path: source.sourcePath,
    source_sha256: hash(bytes),
    stages: sourceCaseIds(root, source),
  });
}

export function executeV12VisualCapture({ root = process.cwd(), mode = "plan" } = {}) {
  if (mode !== "plan") fail("native_execution_forbidden");
  const inputs = loadV12ContractInputs({ root });
  const flows = FLOW_SOURCES.map((source) => flowSnapshot(root, source));
  const browserStateIds = Object.freeze([...V12_BROWSER_WALK_STATE_IDS]);
  const configurationIds = Object.freeze([...V12_CONFIG_IDS]);
  const captures = Object.freeze(browserStateIds.flatMap((stateId) => configurationIds.map((configurationId) => Object.freeze({
    state_id: stateId,
    configuration_id: configurationId,
    screenshot_id: `v12/${stateId}/${configurationId}.png`,
    flow_id: flows[(Number(stateId.slice(-3)) - 1) % flows.length].id,
    fixture_id: "v12-synthetic-fixtures-r18",
  }))));
  return Object.freeze({
    schema_version: 1,
    producer: "v12-visual-capture-plan/v1",
    mode,
    browser_state_ids: browserStateIds,
    configuration_ids: configurationIds,
    source_hashes: Object.freeze({ browser_walk: inputs.source_hashes.browser_walk, source_manifest: inputs.source_hashes.source_manifest }),
    fixtures: Object.freeze({ synthetic: true, fixture_id: "v12-synthetic-fixtures-r18", privacy: "no-production-or-personal-data" }),
    flows: Object.freeze(flows),
    captures,
    contact_sheet: Object.freeze({ role: "index-only", can_determine_verdict: false }),
  });
}

export function validateV12VisualCapture(plan) {
  if (!plan || plan.schema_version !== 1 || plan.producer !== "v12-visual-capture-plan/v1" || plan.mode !== "plan") fail("plan_invalid");
  if (JSON.stringify(plan.browser_state_ids) !== JSON.stringify(V12_BROWSER_WALK_STATE_IDS)) fail("browser_state_order_invalid");
  if (JSON.stringify(plan.configuration_ids) !== JSON.stringify(V12_CONFIG_IDS)) fail("configuration_order_invalid");
  if (!plan.fixtures?.synthetic || plan.fixtures.fixture_id !== "v12-synthetic-fixtures-r18" || plan.fixtures.privacy !== "no-production-or-personal-data") fail("privacy_fixture_invalid");
  if (!Array.isArray(plan.flows) || plan.flows.length !== FLOW_SOURCES.length || plan.flows.some((flow, index) => flow.id !== FLOW_SOURCES[index].id || !SHA256.test(flow.source_sha256) || !Array.isArray(flow.stages) || flow.stages.length < 1)) fail("flow_snapshot_invalid");
  if (!Array.isArray(plan.captures) || plan.captures.length !== 107 * 64) fail("capture_count_invalid");
  const screenshotIds = new Set();
  for (const capture of plan.captures) {
    if (!V12_BROWSER_WALK_STATE_IDS.includes(capture.state_id) || !V12_CONFIG_IDS.includes(capture.configuration_id)
      || !/^v12\/BW-\d{3}\/AP-[A-Z0-9-]+\.png$/u.test(capture.screenshot_id)) fail("capture_mapping_invalid");
    if (screenshotIds.has(capture.screenshot_id)) fail("duplicate_screenshot_id");
    screenshotIds.add(capture.screenshot_id);
  }
  if (plan.contact_sheet?.role !== "index-only" || plan.contact_sheet.can_determine_verdict !== false) fail("contact_sheet_invalid");
  return true;
}

function immutableJson(root, relativePath, value, write = undefined) {
  if (typeof write === "function") return write(relativePath, value);
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`) || existsSync(absolute)) fail("immutable_output_invalid");
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx" });
}

function parseVisualCli(args) {
  if (!Array.isArray(args) || args.length !== 3 || args[0] !== "--run" || !V12_RUN_ID.test(args[1] ?? "")
    || !["--all", "--verify"].includes(args[2])) fail("arguments_invalid");
  return Object.freeze({ runId: args[1], command: args[2] });
}

/**
 * Records every individual native capture through a supplied release-native adapter.
 * The adapter must return retained PNG bytes and measured settings; fixture-only
 * rows are refused so this path can never manufacture native evidence on host.
 */
export function executeLiveV12VisualCapture({ runId, root = process.cwd(), capture, captureAll, batchWindow = V12_VISUAL_BATCH_WINDOW, write } = {}) {
  if (!V12_RUN_ID.test(runId ?? "") || typeof capture !== "function") fail("adapter_invalid");
  const plan = executeV12VisualCapture({ root, mode: "plan" });
  if (!Number.isSafeInteger(batchWindow) || batchWindow < 1 || batchWindow > 512) fail("adapter_invalid");
  const records = [];
  const windows = [];
  const reduceCapture = (item, rawMeasured) => {
    const measured = rawMeasured && typeof rawMeasured === "object" && Object.hasOwn(rawMeasured, "png_base64")
      ? (({ png_base64: _discarded, ...retained }) => retained)(rawMeasured)
      : rawMeasured;
    if (!measured || measured.native_execution !== "EXECUTED" || measured.fixture_id !== item.fixture_id
      || !Buffer.isBuffer(measured.png) || measured.png.length === 0 || !measured.settings
      || measured.settings.restored !== true || measured.settings.privacy !== "synthetic-only") fail("capture_invalid");
    const dimensions = decodeNativePng(measured.png);
    const pngSha256 = hash(measured.png);
    const pngPath = `artifacts/native/v1.2/${runId}/screenshots/${item.state_id}/${item.configuration_id}/native.png`;
    if (typeof write === "function") write(pngPath, measured.png);
    else {
      const absolute = path.resolve(root, pngPath);
      if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`) || existsSync(absolute)) fail("immutable_output_invalid");
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, measured.png, { flag: "wx" });
    }
    const receipt = validateStateReceipt(root, runId, item, measured, pngSha256);
    records.push(Object.freeze({ schema_version: 3, producer: "v12-visual-capture/v3", run_id: runId, state_id: item.state_id, configuration_id: item.configuration_id, fixture_id: item.fixture_id, native_execution: "EXECUTED", native_png: Object.freeze({ path: pngPath, sha256: pngSha256, size_bytes: measured.png.length, width: dimensions.width, height: dimensions.height }), settings: Object.freeze({ ...measured.settings }) }));
    return receipt;
  };
  if (typeof captureAll === "function") {
    for (let offset = 0; offset < plan.captures.length; offset += batchWindow) {
      const requested = plan.captures.slice(offset, offset + batchWindow);
      const batch = captureAll(Object.freeze({ run_id: runId, captures: requested }));
      if (!Array.isArray(batch) || batch.length !== requested.length) fail("capture_invalid");
      const requestBytes = Buffer.byteLength(JSON.stringify({ run_id: runId, captures: requested }));
      const responseBytes = Buffer.byteLength(JSON.stringify(batch.map(({ png, ...entry }) => ({ ...entry, png_base64: entry.png_base64 ?? png?.toString("base64") }))));
      if (requestBytes > 1024 * 1024 || responseBytes > 32 * 1024 * 1024) fail("batch_transport_limit_invalid");
      const receipts = batch.map((measured, index) => reduceCapture(requested[index], measured));
      windows.push(Object.freeze({ ordinal: windows.length, offset, count: requested.length,
        first: `${requested[0].state_id}/${requested[0].configuration_id}`,
        last: `${requested.at(-1).state_id}/${requested.at(-1).configuration_id}`,
        request_bytes: requestBytes, response_bytes: responseBytes,
        request_sha256: hash(JSON.stringify(requested)),
        result_sha256: hash(JSON.stringify(receipts)) }));
    }
  } else {
    for (const item of plan.captures) reduceCapture(item, capture(Object.freeze({ ...item, run_id: runId })));
  }
  if (new Set(records.map(({ settings }) => settings.state_receipt.nonce)).size !== records.length) fail("state_receipt_duplicate");
  const effectiveWindows = windows.length > 0 ? windows : plan.captures.map((item, offset) => Object.freeze({ ordinal: offset, offset, count: 1, first: `${item.state_id}/${item.configuration_id}`, last: `${item.state_id}/${item.configuration_id}`,
    request_bytes: Buffer.byteLength(JSON.stringify({ run_id: runId, captures: [item] })), response_bytes: 0,
    request_sha256: hash(JSON.stringify([item])), result_sha256: hash(JSON.stringify([records[offset].settings.state_receipt])) }));
  const index = Object.freeze({ schema_version: 2, producer: "v12-visual-capture-index/v2", run_id: runId, source_hashes: plan.source_hashes, capture_count: records.length, windows: Object.freeze(effectiveWindows), records: Object.freeze(records) });
  immutableJson(root, `artifacts/native/v1.2/${runId}/screenshots/index.json`, index, write);
  return index;
}

export function verifyV12VisualCapture({ runId, root = process.cwd(), readJson, readBytes } = {}) {
  if (!V12_RUN_ID.test(runId ?? "")) fail("arguments_invalid");
  const read = readJson ?? ((file) => JSON.parse(readFileSync(path.join(root, file), "utf8")));
  const index = read(`artifacts/native/v1.2/${runId}/screenshots/index.json`);
  if (!index || index.schema_version !== 2 || index.producer !== "v12-visual-capture-index/v2" || index.run_id !== runId || index.capture_count !== 107 * 64 || !Array.isArray(index.records) || index.records.length !== 107 * 64 || !Array.isArray(index.windows) || index.windows.length < 1) fail("index_invalid");
  const seen = new Set();
  const receiptNonces = new Set();
  const readPng = readBytes ?? ((file) => readFileSync(path.join(root, file)));
  for (const record of index.records) {
    const key = `${record?.state_id}\u0000${record?.configuration_id}`;
    const receipt = record?.settings?.state_receipt;
    if (!V12_BROWSER_WALK_STATE_IDS.includes(record?.state_id) || !V12_CONFIG_IDS.includes(record?.configuration_id)
      || seen.has(key) || record.schema_version !== 3 || record.producer !== "v12-visual-capture/v3" || record.native_execution !== "EXECUTED" || record.fixture_id !== "v12-synthetic-fixtures-r18"
      || !SHA256.test(record.native_png?.sha256 ?? "") || record.settings?.restored !== true || record.settings?.privacy !== "synthetic-only"
      || record.native_png.path !== `artifacts/native/v1.2/${runId}/screenshots/${record.state_id}/${record.configuration_id}/native.png`) fail("record_invalid");
    let png; try { png = readPng(record.native_png.path); } catch { fail("png_missing"); }
    const dimensions = decodeNativePng(png);
    validateStateReceipt(root, runId, record, { settings: record.settings }, record.native_png.sha256);
    if (receiptNonces.has(receipt.nonce)) fail("state_receipt_duplicate");
    receiptNonces.add(receipt.nonce);
    if (hash(png) !== record.native_png.sha256 || png.length !== record.native_png.size_bytes
      || receipt.png_sha256 !== record.native_png.sha256 || dimensions.width !== record.native_png.width || dimensions.height !== record.native_png.height) fail("png_lineage_invalid");
    seen.add(key);
  }
  const ordered = index.records.map((record) => `${record.state_id}/${record.configuration_id}`);
  const expected = V12_BROWSER_WALK_STATE_IDS.flatMap((state) => V12_CONFIG_IDS.map((configuration) => `${state}/${configuration}`));
  if (JSON.stringify(ordered) !== JSON.stringify(expected)) fail("capture_order_invalid");
  const plan = executeV12VisualCapture({ root, mode: "plan" });
  let offset = 0;
  for (const [ordinal, window] of index.windows.entries()) {
    if (window.ordinal !== ordinal || window.offset !== offset || !Number.isSafeInteger(window.count) || window.count < 1 || window.count > 512
      || window.first !== ordered[offset] || window.last !== ordered[offset + window.count - 1]) fail("window_manifest_invalid");
    if (window.request_bytes !== undefined && (!Number.isSafeInteger(window.request_bytes) || window.request_bytes > 1024 * 1024
      || !Number.isSafeInteger(window.response_bytes) || window.response_bytes > 32 * 1024 * 1024)) fail("window_manifest_invalid");
    const planSlice = plan.captures.slice(window.offset, window.offset + window.count);
    const recordSlice = index.records.slice(window.offset, window.offset + window.count);
    if (window.request_sha256 !== hash(JSON.stringify(planSlice)) || window.result_sha256 !== hash(JSON.stringify(recordSlice.map(({ settings }) => settings.state_receipt)))) fail("window_manifest_invalid");
    offset += window.count;
  }
  if (offset !== expected.length) fail("window_manifest_invalid");
  return true;
}

export function runV12VisualCaptureCli(args = process.argv.slice(2), io = process) {
  try {
    const { runId, command } = parseVisualCli(args);
    if (command === "--verify") verifyV12VisualCapture({ runId });
    else {
      const adapter = createV12NativeAdapter();
      const visualAction = process.env.V12_NATIVE_ADAPTER_BATCH === "1" ? "visual-capture-batch" : "visual-capture";
      publishV12AtomicShard({ runId, shard: "visual", executionOrigin: () => adapter.executionOrigin(visualAction), produce: ({ write }) => {
      const testWindow = process.env.NODE_ENV === "test" && process.env.V12_NATIVE_ADAPTER_TEST_PROCESS === "1" ? 512 : V12_VISUAL_BATCH_WINDOW;
      return executeLiveV12VisualCapture({ runId, capture: adapter.capture, ...(process.env.V12_NATIVE_ADAPTER_BATCH === "1" ? { captureAll: adapter.captureBatch, batchWindow: testWindow } : {}), write: (file, value) => write(file.replace(`artifacts/native/v1.2/${runId}/`, ""), value) });
      } });
    }
    io.stdout.write(`${JSON.stringify({ run_id: runId, command, ok: true })}\n`);
    return 0;
  } catch (error) { io.stderr.write(`${error.message}\n`); return 1; }
}

if (process.argv[1]?.endsWith("capture-v12-visual.mjs")) process.exitCode = runV12VisualCaptureCli();
