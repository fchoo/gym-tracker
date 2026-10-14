import assert from "node:assert/strict";
import test from "node:test";

import { compareV12Capture, validateV12ComparisonShard } from "./compare-v12-visual.mjs";

const hash = "a".repeat(64);
const base = () => ({
  id: "BW-001",
  configuration_id: "AP-L-C360-P-F100",
  identity: { fixture: "v12-synthetic-fixtures-r18", clock: "2026-10-06T00:00:00Z", locale: "en-SG", timezone: "Asia/Singapore", content_bounds: { width: 360, height: 800 } },
  artifacts: { reference_sha256: hash, native_sha256: hash, overlay_sha256: hash, difference_sha256: hash, mask_sha256: hash },
  semantic: { content: true, actions: true, copy: true, state: true, route: true, focus: true, order: true, targets: [{ width_dp: 48, height_dp: 48, overlap: false }], non_color_state: true, commit_read_only: true, accepted_deviation: null },
  visual: { geometry_dp: 1, baseline_icon_dp: 2, token_exact: true, ciede2000: 2, pixel_percent: 0.4 },
});

test("returns a comparison classification only after semantic and measured gates pass", () => {
  const result = compareV12Capture(base());
  assert.equal(result.classification, "PASS");
  assert.equal(Object.hasOwn(result, "verdict"), false);
  assert.equal(validateV12ComparisonShard({ schema_version: 1, results: [result] }), true);
});

test("semantic failure always wins over a clean pixel score", () => {
  const input = base(); input.semantic.route = false;
  assert.equal(compareV12Capture(input).classification, "FAIL");
  input.semantic.route = true; input.semantic.targets[0].width_dp = 47;
  assert.equal(compareV12Capture(input).classification, "FAIL");
  input.semantic.targets[0].width_dp = 48; input.semantic.commit_read_only = false;
  assert.equal(compareV12Capture(input).classification, "FAIL");
});

test("accepted deviations require exact owner metadata and remain non-PASS", () => {
  const input = base();
  input.visual.pixel_percent = 3;
  input.semantic.accepted_deviation = { deviation_id: "DEV-01", owner_decision: "adaptive layout approved", decided_at: "2026-10-07", configurations: [input.configuration_id], rationale: "48dp targets require the recorded adaptive layout.", evidence_hashes: [hash] };
  const result = compareV12Capture(input);
  assert.equal(result.classification, "ACCEPTED_EXCEPTION");
  assert.equal(result.counts_as_pass, false);
  input.semantic.accepted_deviation.configurations = ["AP-D-C360-P-F100"];
  assert.throws(() => compareV12Capture(input), /v12_visual_compare_exception_scope_invalid/u);
});

test("rejects identity drift, malformed masks, unaccepted mismatch, and forged PASS", () => {
  const drift = base(); drift.artifacts.mask_sha256 = "bad";
  assert.throws(() => compareV12Capture(drift), /v12_visual_compare_artifact_hash_invalid/u);
  const review = base(); review.visual.pixel_percent = 1;
  assert.equal(compareV12Capture(review).classification, "REVIEW_REQUIRED");
  const forged = { ...compareV12Capture(base()), classification: "PASS", semantic_passed: false, verdict: "PASS" };
  assert.throws(() => validateV12ComparisonShard({ schema_version: 1, results: [forged] }), /v12_visual_compare_result_invalid/u);
});
