import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  V12_BROWSER_WALK_STATE_IDS,
  V12_CONFIG_IDS,
  loadV12ContractInputs,
} from "./v12-evidence-contract.mjs";
import {
  V12_VISUAL_BATCH_WINDOW,
  executeV12VisualCapture,
  executeLiveV12VisualCapture,
  parseV12VisualCaptureCli,
  validateV12VisualCapture,
} from "./capture-v12-visual.mjs";
import "./testing/v12-visual-streaming.test.mjs";

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

test("production capture is fixed to four-item batches and single capture requires the diagnostic flag", () => {
  const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
  assert.equal(V12_VISUAL_BATCH_WINDOW, 4);
  assert.deepEqual(parseV12VisualCaptureCli(["--run", runId, "--all"]), { runId, command: "--all", diagnosticSingle: false });
  assert.deepEqual(parseV12VisualCaptureCli(["--run", runId, "--all", "--diagnostic-single"]), { runId, command: "--all", diagnosticSingle: true });
  assert.throws(() => parseV12VisualCaptureCli(["--run", runId, "--verify", "--diagnostic-single"]), /arguments_invalid/u);

  for (const diagnosticSingle of [false, true]) {
    const artifactRoot = mkdtempSync(path.join(tmpdir(), "v12-capture-mode-"));
    mkdirSync(path.join(artifactRoot, `artifacts/native/v1.2/${runId}`), { recursive: true });
    let batchCalls = 0; let singleCalls = 0;
    assert.throws(() => executeLiveV12VisualCapture({
      runId,
      root: ROOT,
      artifactRoot,
      diagnosticSingle,
      capture: () => { singleCalls += 1; return { native_execution: "NOT_RUN" }; },
      captureAll: ({ captures }) => { batchCalls += 1; assert.equal(captures.length, 4); return captures.map(() => ({ native_execution: "NOT_RUN" })); },
    }), /capture_invalid/u);
    assert.equal(batchCalls, diagnosticSingle ? 0 : 1);
    assert.equal(singleCalls, diagnosticSingle ? 4 : 0);
    assert.equal(existsSync(path.join(artifactRoot, `artifacts/native/v1.2/${runId}/failures/visual.json`)), true);
    rmSync(artifactRoot, { recursive: true, force: true });
  }
});
