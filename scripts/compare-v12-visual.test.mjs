import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { PNG } from "pngjs";

import {
  produceV12ComparisonRecord,
  verifyV12ComparisonRecord,
} from "./compare-v12-visual.mjs";

const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
const configurationId = "AP-L-C360-P-F100";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function png(red, green = 0) {
  const image = new PNG({ width: 2, height: 1 });
  image.data.set([red, green, 0, 255, red, green, 0, 255]);
  return PNG.sync.write(image);
}

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "v12-visual-compare-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const native = png(10); const reference = png(10);
  const nativePath = `artifacts/native/v1.2/${runId}/screenshots/BW-001/${configurationId}/native.png`;
  const capturePath = `artifacts/native/v1.2/${runId}/screenshots/BW-001/${configurationId}/capture.json`;
  const referencePath = ".planning/design/v1.2-browser-evidence/reference-bw001.png";
  for (const [file, bytes] of [[nativePath, native], [referencePath, reference]]) {
    const absolute = path.join(root, file); mkdirSync(path.dirname(absolute), { recursive: true }); writeFileSync(absolute, bytes);
  }
  const descriptor = { path: nativePath, sha256: sha256(native), size_bytes: native.length, width: 2, height: 1 };
  const capture = { schema_version: 2, producer: "v12-visual-capture/v2", run_id: runId, state_id: "BW-001", configuration_id: configurationId, fixture_id: "v12-synthetic-fixtures-r18", native_execution: "EXECUTED", native_png: descriptor, settings: { restored: true, privacy: "synthetic-only" } };
  writeFileSync(path.join(root, capturePath), `${JSON.stringify(capture)}\n`);
  return {
    root, nativePath, capturePath, referencePath,
    request: {
      id: "BW-001", configuration_id: configurationId, reference_path: referencePath,
      observation: { native_execution: "EXECUTED", state_id: "BW-001", configuration_id: configurationId, content: true, actions: true, copy: true, state: true, route: true, focus: true, order: true, non_color_state: true, commit_read_only: true, targets: [{ width_dp: 48, height_dp: 48, overlap: false }], geometry_dp: 0, baseline_icon_dp: 0, token_exact: true, ciede2000: 0 },
    },
  };
}

test("comparison derives retained descriptors and pixel metrics from the verified capture and reference bytes", (t) => {
  const input = fixture(t);
  const result = produceV12ComparisonRecord({ runId, root: input.root, input: input.request });
  assert.equal(result.classification, "PASS");
  assert.equal(result.artifacts.native.path, input.nativePath);
  assert.equal(result.metrics.pixel_percent, 0);
  for (const artifact of Object.values(result.artifacts)) assert.ok(existsSync(path.join(input.root, artifact.path)));
  assert.equal(verifyV12ComparisonRecord({ runId, root: input.root, result }), true);
});

test("comparison verification rejects missing or tampered output, duplicated bytes, forged metrics, and wrong native linkage", (t) => {
  const input = fixture(t);
  const result = produceV12ComparisonRecord({ runId, root: input.root, input: input.request });
  const overlay = path.join(input.root, result.artifacts.overlay.path); writeFileSync(overlay, png(80));
  assert.throws(() => verifyV12ComparisonRecord({ runId, root: input.root, result }), /v12_visual_compare_(artifact|metrics)_invalid/u);
  writeFileSync(overlay, readFileSync(path.join(input.root, result.artifacts.difference.path)));
  assert.throws(() => verifyV12ComparisonRecord({ runId, root: input.root, result }), /v12_visual_compare_(duplicate|artifact)_invalid/u);
  const restored = produceV12ComparisonRecord({ runId, root: input.root, input: { ...input.request, id: "BW-002", observation: { ...input.request.observation, state_id: "BW-002" } } });
  assert.equal(restored, undefined, "a comparison cannot use a capture belonging to another browser state");
});
