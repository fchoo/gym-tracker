import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  V12_BROWSER_WALK_STATE_IDS,
  V12_CONFIG_IDS,
  loadV12ContractInputs,
} from "./v12-evidence-contract.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
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
