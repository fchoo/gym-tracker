import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  V12_BROWSER_WALK_STATE_IDS,
  V12_CONFIG_IDS,
  loadV12ContractInputs,
} from "./v12-evidence-contract.mjs";
import {
  executeV12VisualCapture,
  executeLiveV12VisualCapture,
  verifyV12VisualCapture,
  validateV12VisualCapture,
} from "./capture-v12-visual.mjs";

const ROOT = process.cwd();

test("derives every ordered browser occurrence and every required configuration without sampling", () => {
  const plan = executeV12VisualCapture({ root: ROOT, mode: "plan" });

  assert.deepEqual(plan.browser_state_ids, V12_BROWSER_WALK_STATE_IDS);
  assert.deepEqual(plan.configuration_ids, V12_CONFIG_IDS);
  assert.equal(plan.browser_state_ids.length, 107);
  assert.equal(plan.configuration_ids.length, 64);
  assert.equal(new Set(plan.browser_state_ids).size, 107);
  assert.equal(plan.captures.length, 107 * 64);
  assert.equal(plan.captures.filter(({ state_id }) => state_id === "BW-001").length, 64);
  assert.equal(plan.captures.filter(({ state_id }) => state_id === "BW-107").length, 64);
  assert.equal(plan.captures.every(({ screenshot_id }) => /^v12\/BW-\d{3}\/AP-[A-Z0-9-]+\.png$/u.test(screenshot_id)), true);
  assert.equal(validateV12VisualCapture(plan), true);
});

test("rejects state/config mapping drift, duplicate screenshot identities, and privacy-unsafe fixture claims", () => {
  const plan = executeV12VisualCapture({ root: ROOT, mode: "plan" });
  const duplicate = structuredClone(plan);
  duplicate.captures[1].screenshot_id = duplicate.captures[0].screenshot_id;
  assert.throws(() => validateV12VisualCapture(duplicate), /v12_visual_capture_duplicate_screenshot_id/u);

  const reordered = structuredClone(plan);
  [reordered.browser_state_ids[0], reordered.browser_state_ids[1]] = [reordered.browser_state_ids[1], reordered.browser_state_ids[0]];
  assert.throws(() => validateV12VisualCapture(reordered), /v12_visual_capture_browser_state_order_invalid/u);

  const unsafe = structuredClone(plan);
  unsafe.fixtures.synthetic = false;
  assert.throws(() => validateV12VisualCapture(unsafe), /v12_visual_capture_privacy_fixture_invalid/u);
});

test("binds each source-owned flow to immutable source content and semantic stages", () => {
  const plan = executeV12VisualCapture({ root: ROOT, mode: "plan" });
  const inputs = loadV12ContractInputs({ root: ROOT });

  assert.equal(plan.source_hashes.browser_walk, inputs.source_hashes.browser_walk);
  assert.deepEqual(plan.flows.map(({ id }) => id), ["multi-plan", "workout", "library-running"]);
  assert.equal(plan.flows.every(({ stages, source_sha256 }) => stages.length > 0 && /^[a-f0-9]{64}$/u.test(source_sha256)), true);
  assert.equal(plan.flows.every(({ source_path }) => readFileSync(source_path, "utf8").includes("appId:")), true);
});

test("writes every live native capture once and rejects fixture-only or un-restored state", () => {
  const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
  const written = new Map();
  const index = executeLiveV12VisualCapture({
    runId,
    root: ROOT,
    capture: () => ({ native_execution: "EXECUTED", fixture_id: "v12-synthetic-fixtures-r18", png: Buffer.from("native-png"), settings: { restored: true, privacy: "synthetic-only" } }),
    write: (file, value) => written.set(file, value),
  });
  assert.equal(index.records.length, 107 * 64);
  assert.equal(written.size, 1 + 2 * 107 * 64);
  assert.equal(verifyV12VisualCapture({ runId, root: ROOT, readJson: (file) => written.get(file) }), true);
  assert.throws(() => executeLiveV12VisualCapture({ runId, capture: () => ({ native_execution: "NOT_RUN" }) }), /capture_invalid/u);
});
