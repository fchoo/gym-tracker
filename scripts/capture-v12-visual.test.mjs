import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PNG } from "pngjs";

import {
  V12_BROWSER_WALK_STATE_IDS,
  V12_CONFIG_IDS,
  loadV12ContractInputs,
} from "./v12-evidence-contract.mjs";
import {
  V12_VISUAL_BATCH_WINDOW,
  executeV12VisualCapture,
  executeLiveV12VisualCapture,
  verifyV12VisualCapture,
  validateV12VisualCapture,
} from "./capture-v12-visual.mjs";

const ROOT = process.cwd();
const visualStates = JSON.parse(readFileSync("src/testing/phase20VisualStateRegistry.json", "utf8"));
const receiptFor = (item, pngBytes, ordinal) => {
  const state = visualStates.find(({ id }) => id === item.state_id);
  const observation = { native_execution: "EXECUTED", state_id: item.state_id, configuration_id: item.configuration_id, readiness: { status: state.readiness.status }, native_focus: { resource_id: "focus-node", class_name: "android.view.View", bounds: "[0,0][48,48]" } };
  const sourceMaterial = { state_id: item.state_id, fixture_variant: state.fixture_variant, assertions: state.readiness.source_receipt.assertions };
  const nonce = ordinal.toString(16).padStart(32, "0");
  const runtimeSource = { ...sourceMaterial, production_instance_id: `phase20-production-instance-${ordinal}`, mount_id: `phase20-production-mount-${ordinal}`, scroll_offsets: [{ native_id: "adaptive-screen-scroll", x: 0, y: 12 }], timer: { state: "running", revision: 2, remaining_ms: null, ends_at_ms: 120_000 } };
  return {
    observation,
    state_receipt: {
      schema_version: 3,
      nonce,
      run_id: "phase20-20261014T000000Z-aaaaaaaaaaaa",
      state_id: item.state_id,
      configuration_id: item.configuration_id,
      fixture_id: "v12-synthetic-fixtures-r18",
      readiness_status: observation.readiness.status,
      source_tree_sha256: "a".repeat(64),
      apk_sha256: "b".repeat(64),
      device_identity_sha256: "c".repeat(64),
      png_sha256: createHash("sha256").update(pngBytes).digest("hex"),
      observation_sha256: createHash("sha256").update(JSON.stringify(observation)).digest("hex"),
      source_receipt: { schema_version: 2, nonce, ...runtimeSource, digest: createHash("sha256").update(JSON.stringify(runtimeSource)).digest("hex") },
      ...(item.configuration_id.startsWith("AP-SD-") ? { system_transition: { from: "light", to: "dark", mounted_nonce: nonce, color_scheme: { before: "light", after: "dark" }, before: { native_focus: { resource_id: "focus-node", class_name: "android.view.View", bounds: "[0,0][48,48]" }, scroll_offsets: runtimeSource.scroll_offsets, timer: runtimeSource.timer, production_instance_id: runtimeSource.production_instance_id, mount_id: runtimeSource.mount_id }, after: { native_focus: { resource_id: "focus-node", class_name: "android.view.View", bounds: "[0,0][48,48]" }, scroll_offsets: runtimeSource.scroll_offsets, timer: runtimeSource.timer, production_instance_id: runtimeSource.production_instance_id, mount_id: runtimeSource.mount_id } } } : {}),
    },
  };
};

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
  let captureOrdinal = 0;
  const index = executeLiveV12VisualCapture({
    runId,
    root: ROOT,
    capture: (item) => {
      const seed = captureOrdinal++;
      const png = PNG.sync.write({ width: 1, height: 1, data: Buffer.from([seed & 255, (seed >>> 8) & 255, (seed >>> 16) & 255, 255]) });
      return { native_execution: "EXECUTED", fixture_id: "v12-synthetic-fixtures-r18", png, settings: { restored: true, privacy: "synthetic-only", ...receiptFor(item, png, seed + 1) } };
    },
    write: (file, value) => written.set(file, value),
  });
  assert.equal(index.records.length, 107 * 64);
  assert.equal(written.size, 1 + 107 * 64);
  assert.equal(verifyV12VisualCapture({ runId, root: ROOT, readJson: (file) => written.get(file), readBytes: (file) => written.get(file) }), true);
  assert.throws(() => executeLiveV12VisualCapture({ runId, capture: () => ({ native_execution: "NOT_RUN" }) }), /capture_invalid/u);
});

test("chunks all 6,848 captures into bounded ordered windows and rejects stale or duplicate receipts", () => {
  const written = new Map(); let ordinal = 0; const windows = [];
  const index = executeLiveV12VisualCapture({
    runId: "phase20-20261014T000000Z-aaaaaaaaaaaa",
    root: ROOT,
    capture: () => { throw new Error("single capture must not run"); },
    captureAll: ({ captures }) => {
      windows.push(captures.map(({ state_id, configuration_id }) => `${state_id}/${configuration_id}`));
      return captures.map((item) => {
        const sequence = ++ordinal;
        const png = PNG.sync.write({ width: 1, height: 1, data: Buffer.from([sequence & 255, (sequence >>> 8) & 255, (sequence >>> 16) & 255, (sequence >>> 24) & 255]) });
        return { native_execution: "EXECUTED", fixture_id: "v12-synthetic-fixtures-r18", png, settings: { restored: true, privacy: "synthetic-only", ...receiptFor(item, png, sequence) } };
      });
    },
    batchWindow: V12_VISUAL_BATCH_WINDOW,
    write: (file, value) => written.set(file, value),
  });
  assert.equal(index.records.length, 6_848);
  assert.equal(windows.every((window) => window.length <= V12_VISUAL_BATCH_WINDOW), true);
  assert.deepEqual(windows.flat(), executeV12VisualCapture({ root: ROOT }).captures.map(({ state_id, configuration_id }) => `${state_id}/${configuration_id}`));
  assert.equal(new Set(index.records.map(({ settings }) => settings.state_receipt.nonce)).size, 6_848);
  const duplicateReceipt = structuredClone(index);
  duplicateReceipt.records[1].settings.state_receipt.nonce = duplicateReceipt.records[0].settings.state_receipt.nonce;
  duplicateReceipt.records[1].settings.state_receipt.source_receipt.nonce = duplicateReceipt.records[0].settings.state_receipt.nonce;
  assert.throws(() => verifyV12VisualCapture({ runId: index.run_id, root: ROOT, readJson: () => duplicateReceipt, readBytes: (file) => written.get(file) }), /state_receipt_duplicate/u);
  const loadingAsReady = structuredClone(index);
  const loading = loadingAsReady.records.find(({ state_id }) => state_id === "BW-089");
  loading.settings.state_receipt.readiness_status = "ready";
  assert.throws(() => verifyV12VisualCapture({ runId: index.run_id, root: ROOT, readJson: () => loadingAsReady, readBytes: (file) => written.get(file) }), /state_receipt_invalid/u);
});

test("reduces realistic capture batches before requesting the next window", () => {
  const image = new PNG({ width: 128, height: 128 });
  let random = 0x5EED1234;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    random = (Math.imul(random, 1_664_525) + 1_013_904_223) >>> 0;
    image.data[offset] = random & 255;
    image.data[offset + 1] = (random >>> 8) & 255;
    image.data[offset + 2] = (random >>> 16) & 255;
    image.data[offset + 3] = 255;
  }
  const realisticPng = PNG.sync.write(image, { colorType: 6 });
  assert.ok(realisticPng.length >= 48 * 1024, `fixture must be realistic-sized, got ${realisticPng.length}`);

  const baselineRss = process.memoryUsage().rss;
  let firstWriteRss;
  let ordinal = 0;
  const index = executeLiveV12VisualCapture({
    runId: "phase20-20261014T000000Z-aaaaaaaaaaaa",
    root: ROOT,
    capture: () => { throw new Error("single capture must not run"); },
    captureAll: ({ captures }) => captures.map((item) => {
      const sequence = ++ordinal;
      const png = Buffer.from(realisticPng);
      return {
        native_execution: "EXECUTED",
        fixture_id: "v12-synthetic-fixtures-r18",
        png,
        settings: { restored: true, privacy: "synthetic-only", ...receiptFor(item, png, sequence) },
      };
    }),
    batchWindow: 8,
    write: () => { firstWriteRss ??= process.memoryUsage().rss; },
  });

  const retainedBeforeFirstWrite = firstWriteRss - baselineRss;
  assert.equal(index.records.length, 6_848);
  assert.ok(retainedBeforeFirstWrite < 192 * 1024 * 1024,
    `capture batches retained ${Math.round(retainedBeforeFirstWrite / 1024 / 1024)} MiB before the first write`);
});
