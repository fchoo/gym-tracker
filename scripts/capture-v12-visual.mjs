import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createV12NativeAdapter } from "./v12-native-adapter.mjs";

import {
  V12_BROWSER_WALK_STATE_IDS,
  V12_CONFIG_IDS,
  loadV12ContractInputs,
} from "./v12-evidence-contract.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const require = createRequire(import.meta.url);
const V12_RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
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
export function executeLiveV12VisualCapture({ runId, root = process.cwd(), capture, write } = {}) {
  if (!V12_RUN_ID.test(runId ?? "") || typeof capture !== "function") fail("adapter_invalid");
  const plan = executeV12VisualCapture({ root, mode: "plan" });
  const records = [];
  for (const item of plan.captures) {
    const measured = capture(Object.freeze({ ...item, run_id: runId }));
    if (!measured || measured.native_execution !== "EXECUTED" || measured.fixture_id !== item.fixture_id
      || !Buffer.isBuffer(measured.png) || measured.png.length === 0 || !measured.settings
      || measured.settings.restored !== true || measured.settings.privacy !== "synthetic-only") fail("capture_invalid");
    const dimensions = decodeNativePng(measured.png);
    const pngSha256 = hash(measured.png);
    const pngPath = `artifacts/native/v1.2/${runId}/screenshots/${item.state_id}/${item.configuration_id}/native.png`;
    const recordPath = `artifacts/native/v1.2/${runId}/screenshots/${item.state_id}/${item.configuration_id}/capture.json`;
    if (typeof write === "function") write(pngPath, measured.png);
    else {
      const absolute = path.resolve(root, pngPath);
      if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`) || existsSync(absolute)) fail("immutable_output_invalid");
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, measured.png, { flag: "wx" });
    }
    const record = Object.freeze({ schema_version: 2, producer: "v12-visual-capture/v2", run_id: runId, state_id: item.state_id, configuration_id: item.configuration_id, fixture_id: item.fixture_id, native_execution: "EXECUTED", native_png: Object.freeze({ path: pngPath, sha256: pngSha256, size_bytes: measured.png.length, width: dimensions.width, height: dimensions.height }), settings: Object.freeze({ ...measured.settings }) });
    immutableJson(root, recordPath, record, write);
    records.push(record);
  }
  const index = Object.freeze({ schema_version: 1, producer: "v12-visual-capture-index/v1", run_id: runId, source_hashes: plan.source_hashes, records: Object.freeze(records) });
  immutableJson(root, `artifacts/native/v1.2/${runId}/screenshots/index.json`, index, write);
  return index;
}

export function verifyV12VisualCapture({ runId, root = process.cwd(), readJson, readBytes } = {}) {
  if (!V12_RUN_ID.test(runId ?? "")) fail("arguments_invalid");
  const read = readJson ?? ((file) => JSON.parse(readFileSync(path.join(root, file), "utf8")));
  const index = read(`artifacts/native/v1.2/${runId}/screenshots/index.json`);
  if (!index || index.producer !== "v12-visual-capture-index/v1" || index.run_id !== runId || !Array.isArray(index.records) || index.records.length !== 107 * 64) fail("index_invalid");
  const seen = new Set();
  const contents = new Set();
  const readPng = readBytes ?? ((file) => readFileSync(path.join(root, file)));
  for (const record of index.records) {
    const key = `${record?.state_id}\u0000${record?.configuration_id}`;
    if (!V12_BROWSER_WALK_STATE_IDS.includes(record?.state_id) || !V12_CONFIG_IDS.includes(record?.configuration_id)
      || seen.has(key) || record.native_execution !== "EXECUTED" || record.fixture_id !== "v12-synthetic-fixtures-r18"
      || !SHA256.test(record.native_png?.sha256 ?? "") || record.settings?.restored !== true || record.settings?.privacy !== "synthetic-only"
      || record.native_png.path !== `artifacts/native/v1.2/${runId}/screenshots/${record.state_id}/${record.configuration_id}/native.png`) fail("record_invalid");
    let png; try { png = readPng(record.native_png.path); } catch { fail("png_missing"); }
    const dimensions = decodeNativePng(png);
    if (hash(png) !== record.native_png.sha256 || png.length !== record.native_png.size_bytes
      || dimensions.width !== record.native_png.width || dimensions.height !== record.native_png.height || contents.has(record.native_png.sha256)) fail("png_lineage_invalid");
    contents.add(record.native_png.sha256);
    seen.add(key);
  }
  return true;
}

export function runV12VisualCaptureCli(args = process.argv.slice(2), io = process) {
  try {
    const { runId, command } = parseVisualCli(args);
    if (command === "--verify") verifyV12VisualCapture({ runId });
    else executeLiveV12VisualCapture({ runId, capture: createV12NativeAdapter().capture });
    io.stdout.write(`${JSON.stringify({ run_id: runId, command, ok: true })}\n`);
    return 0;
  } catch (error) { io.stderr.write(`${error.message}\n`); return 1; }
}

if (process.argv[1]?.endsWith("capture-v12-visual.mjs")) process.exitCode = runV12VisualCaptureCli();
