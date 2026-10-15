import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";

import {
  deriveV12PixelComparison,
  produceV12ComparisonRecord,
  verifyV12ComparisonRecord,
} from "./compare-v12-visual.mjs";

const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
const configurationId = "AP-L-C390-P-F100";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const project = fileURLToPath(new URL("../", import.meta.url));

function png(red, green = 0, changed = false) {
  const image = new PNG({ width: 100, height: 100 });
  for (let offset = 0; offset < image.data.length; offset += 4) image.data.set([red, green, 0, 255], offset);
  if (changed) image.data.set([red + 13, green, 0, 255], 0);
  return PNG.sync.write(image);
}

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "v12-visual-compare-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const native = png(10, 0, true); const reference = png(10);
  cpSync(path.join(project, ".planning/design/v1.2-browser-evidence"), path.join(root, ".planning/design/v1.2-browser-evidence"), { recursive: true });
  mkdirSync(path.join(root, "src/testing"), { recursive: true });
  const registry = JSON.parse(readFileSync(path.join(project, "src/testing/phase20VisualStateRegistry.json"), "utf8"));
  const state = registry.find(({ id }) => id === "BW-002");
  const nativePath = `artifacts/native/v1.2/${runId}/screenshots/BW-002/${configurationId}/native.png`;
  const capturePath = `artifacts/native/v1.2/${runId}/screenshots/BW-002/${configurationId}/capture.json`;
  const referencePath = ".planning/design/v1.2-browser-evidence/reference-bw002.png";
  for (const [file, bytes] of [[nativePath, native], [referencePath, reference]]) {
    const absolute = path.join(root, file); mkdirSync(path.dirname(absolute), { recursive: true }); writeFileSync(absolute, bytes);
  }
  state.reference.light = { path: referencePath, sha256: sha256(reference) };
  writeFileSync(path.join(root, "src/testing/phase20VisualStateRegistry.json"), JSON.stringify(registry));
  const descriptor = { path: nativePath, sha256: sha256(native), size_bytes: native.length, width: 100, height: 100 };
  const sourceReceipt = { schema_version: 1, nonce: "a".repeat(32), state_id: state.id, fixture_variant: state.fixture_variant, assertions: state.readiness.source_receipt.assertions };
  sourceReceipt.digest = sha256(JSON.stringify({ state_id: state.id, fixture_variant: state.fixture_variant, assertions: sourceReceipt.assertions }));
  const readiness = {
    status: state.readiness.status,
    semantics: state.readiness.semantics.map((value) => ({ value, matched: true })),
    test_ids: state.readiness.test_ids.map((value) => ({ value, matched: true })),
    actions: state.readiness.actions.map((entry) => ({ ...entry, matched: true, enabled: true, observed_order: entry.order })),
    order: state.readiness.order.map((value, observed_order) => ({ value, observed_order })),
    non_color: state.readiness.non_color.map((value) => ({ value, matched: true })),
    focus: { target: state.readiness.focus.target, matched: true, focusable: true, focused: false },
    source_receipt: sourceReceipt,
  };
  const baseObservation = { native_execution: "EXECUTED", state_id: state.id, configuration_id: configurationId, readiness, targets: [{ width_dp: 48, height_dp: 48, overlap: false }], measurement: { kind: "source_semantic", renderer_digest: state.reference.source.renderer_digest, semantic_digest: state.reference.source.semantic_digest, layout_digest: state.reference.source.layout_digest } };
  const captureReceipt = { schema_version: 2, nonce: "a".repeat(32), run_id: runId, state_id: state.id, configuration_id: configurationId, fixture_id: "v12-synthetic-fixtures-r18", readiness_status: state.readiness.status, source_tree_sha256: "a".repeat(64), apk_sha256: "b".repeat(64), device_identity_sha256: "c".repeat(64), png_sha256: descriptor.sha256, observation_sha256: sha256(JSON.stringify(baseObservation)), source_receipt: sourceReceipt };
  const capture = { schema_version: 3, producer: "v12-visual-capture/v3", run_id: runId, state_id: state.id, configuration_id: configurationId, fixture_id: "v12-synthetic-fixtures-r18", native_execution: "EXECUTED", native_png: descriptor, settings: { restored: true, privacy: "synthetic-only", observation: baseObservation, state_receipt: captureReceipt } };
  writeFileSync(path.join(root, capturePath), `${JSON.stringify(capture)}\n`);
  writeFileSync(path.join(root, `artifacts/native/v1.2/${runId}/screenshots/index.json`), JSON.stringify({ schema_version: 2, producer: "v12-visual-capture-index/v2", run_id: runId, capture_count: 1, windows: [], records: [capture] }));
  const observedSourceReceipt = { ...sourceReceipt, nonce: "b".repeat(32) };
  const observation = { ...baseObservation, capture_png_sha256: descriptor.sha256, capture_nonce: captureReceipt.nonce, observation_nonce: "b".repeat(32), readiness: { ...readiness, source_receipt: observedSourceReceipt } };
  const stateReceipt = { ...captureReceipt, nonce: "b".repeat(32), observation_sha256: sha256(JSON.stringify(observation)), source_receipt: observedSourceReceipt };
  return {
    root, nativePath, capturePath, referencePath, state,
    request: {
      id: state.id, configuration_id: configurationId, reference_binding: { kind: "retained_png", ...state.reference.light, source: state.reference.source },
      capture_state_receipt: captureReceipt, state_receipt: stateReceipt, observation,
    },
  };
}

test("comparison derives retained descriptors and pixel metrics from the verified capture and reference bytes", (t) => {
  const input = fixture(t);
  const result = produceV12ComparisonRecord({ runId, root: input.root, input: input.request });
  assert.equal(result.classification, "PASS");
  assert.equal(result.artifacts.native.path, input.nativePath);
  assert.equal(result.metrics.pixel_percent, 0.01);
  for (const artifact of Object.values(result.artifacts)) assert.ok(existsSync(path.join(input.root, artifact.path)));
  assert.equal(verifyV12ComparisonRecord({ runId, root: input.root, result }), true);
});

test("comparison verification rejects missing or tampered output, duplicated bytes, forged metrics, and wrong native linkage", (t) => {
  const input = fixture(t);
  const result = produceV12ComparisonRecord({ runId, root: input.root, input: input.request });
  const overlay = path.join(input.root, result.artifacts.overlay.path); rmSync(overlay);
  assert.throws(() => verifyV12ComparisonRecord({ runId, root: input.root, result }), /v12_visual_compare_(path|artifact)_invalid/u);
  writeFileSync(overlay, png(80));
  assert.throws(() => verifyV12ComparisonRecord({ runId, root: input.root, result }), /v12_visual_compare_(artifact|metrics)_invalid/u);
  writeFileSync(overlay, readFileSync(path.join(input.root, result.artifacts.difference.path)));
  assert.throws(() => verifyV12ComparisonRecord({ runId, root: input.root, result }), /v12_visual_compare_(duplicate|artifact)_invalid/u);
  assert.throws(() => produceV12ComparisonRecord({ runId, root: input.root, input: { ...input.request, id: "BW-003", observation: { ...input.request.observation, state_id: "BW-003" } } }), /(?:capture|reference)/u);
});

test("comparison verification recomputes metrics and re-checks the approved reference source", (t) => {
  const input = fixture(t); const result = produceV12ComparisonRecord({ runId, root: input.root, input: input.request });
  assert.throws(() => verifyV12ComparisonRecord({ runId, root: input.root, result: { ...result, metrics: { ...result.metrics, pixel_percent: 9 } } }), /metrics/u);
  assert.throws(() => verifyV12ComparisonRecord({ runId, root: input.root, result: { ...result, state_receipt: { ...result.state_receipt, nonce: result.capture_state_receipt.nonce } } }), /state_receipt/u);
  writeFileSync(path.join(input.root, input.referencePath), png(90));
  assert.throws(() => verifyV12ComparisonRecord({ runId, root: input.root, result }), /(?:artifact|reference)/u);
});

test("pixel triage counts only unmasked RGB deltas greater than twelve", () => {
  const reference = new PNG({ width: 4, height: 1 });
  const native = new PNG({ width: 4, height: 1 });
  const exclusion = new PNG({ width: 4, height: 1 });
  for (let index = 0; index < 4; index += 1) {
    reference.data.set([10, 20, 30, 255], index * 4);
    native.data.set([10, 20, 30, 255], index * 4);
    exclusion.data.set([0, 0, 0, 0], index * 4);
  }
  native.data[0] += 12;
  native.data[5] += 13;
  native.data[11] = 0;
  native.data[15] = 0;
  exclusion.data[11] = 255;
  const result = deriveV12PixelComparison(reference, native, exclusion);
  assert.equal(result.metrics.total_pixels, 4);
  assert.equal(result.metrics.unmasked_pixels, 3);
  assert.equal(result.metrics.changed_pixels, 1);
  assert.ok(Math.abs(result.metrics.pixel_percent - 100 / 3) < Number.EPSILON * 100);
  assert.ok(result.metrics.max_ciede2000 > 0);
});

test("arbitrary approved reference bytes are never accepted as authority", (t) => {
  const input = fixture(t);
  assert.throws(() => produceV12ComparisonRecord({
    runId,
    root: input.root,
    input: { ...input.request, reference_path: undefined, approved_reference_png_base64: png(10).toString("base64") },
  }), /v12_visual_compare_(input|reference)_invalid/u);
});

test("non-oracle configurations use the exact source semantic contract without invented PNG bytes", (t) => {
  const input = fixture(t); const sourceConfig = "AP-L-C360-P-F100";
  const original = JSON.parse(readFileSync(path.join(input.root, input.capturePath), "utf8"));
  const nativePath = `artifacts/native/v1.2/${runId}/screenshots/BW-002/${sourceConfig}/native.png`;
  const capturePath = `artifacts/native/v1.2/${runId}/screenshots/BW-002/${sourceConfig}/capture.json`;
  const native = readFileSync(path.join(input.root, input.nativePath));
  mkdirSync(path.dirname(path.join(input.root, nativePath)), { recursive: true }); writeFileSync(path.join(input.root, nativePath), native);
  const captureObservation = { ...original.settings.observation, configuration_id: sourceConfig };
  const captureReceipt = { ...original.settings.state_receipt, configuration_id: sourceConfig, observation_sha256: sha256(JSON.stringify(captureObservation)) };
  const capture = { ...original, configuration_id: sourceConfig, native_png: { ...original.native_png, path: nativePath }, settings: { ...original.settings, observation: captureObservation, state_receipt: captureReceipt } };
  writeFileSync(path.join(input.root, capturePath), JSON.stringify(capture));
  const indexPath = path.join(input.root, `artifacts/native/v1.2/${runId}/screenshots/index.json`);
  const index = JSON.parse(readFileSync(indexPath, "utf8")); index.records.push(capture); writeFileSync(indexPath, JSON.stringify(index));
  const observation = { ...captureObservation, capture_png_sha256: capture.native_png.sha256, capture_nonce: captureReceipt.nonce, observation_nonce: "b".repeat(32), readiness: { ...captureObservation.readiness, source_receipt: { ...captureObservation.readiness.source_receipt, nonce: "b".repeat(32) } } };
  const stateReceipt = { ...captureReceipt, nonce: "b".repeat(32), source_receipt: observation.readiness.source_receipt, observation_sha256: sha256(JSON.stringify(observation)) };
  const result = produceV12ComparisonRecord({ runId, root: input.root, input: { id: "BW-002", configuration_id: sourceConfig, reference_binding: { kind: "approved_source", ...input.state.reference.source }, capture_state_receipt: captureReceipt, state_receipt: stateReceipt, observation } });
  assert.equal(result.comparison_mode, "approved_source");
  assert.equal(result.metrics.kind, "source_semantic");
  assert.deepEqual(Object.keys(result.artifacts), ["native"]);
  assert.equal(JSON.stringify(result.metrics).includes(":null"), false);
  assert.equal(verifyV12ComparisonRecord({ runId, root: input.root, result }), true);
});
