import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PNG } from "pngjs";

import { comparePhase14PngBytes, validatePhase14VisualComparison } from "./phase14-evidence-observation.mjs";
import { PHASE14_NATIVE_MATRIX } from "./phase14-native-matrix.mjs";
import { parsePhase14FinalizeArgs } from "./finalize-phase14-evidence.mjs";
import {
  applyPhase14VisualAttestation,
  buildPhase14CaptureIndex,
  captureIdentitySha256,
  createPhase14VisualAttestation,
  derivePhase14RowVerdict,
  resolvePhase14VisualReference,
  validatePhase14CaptureIndex,
  validatePhase14VisualAttestation,
} from "./phase14-visual-review.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function png(pixel) {
  const image = new PNG({ width: 1, height: 1 });
  image.data.set(pixel);
  return PNG.sync.write(image);
}

function visualCell(id = "four-roots-light-390x844-portrait-font-1") {
  const comparison = comparePhase14PngBytes({
    reference: png([10, 20, 30, 255]),
    native: png([10, 20, 31, 255]),
  });
  return {
    id,
    case_id: "shell.four-roots",
    configuration_id: "light-390x844-portrait-font-1",
    state: { captureState: "workout-root" },
    theme_observation: { rendered_theme: "light", verdict: "PASS" },
    screenshot_sha256: comparison.hashes.native_sha256,
    semantic_tree_sha256: "9".repeat(64),
    focus_key_trace_sha256: "8".repeat(64),
    native_verdict: "PASS",
    visual_comparison: {
      verdict: "REVIEW_REQUIRED",
      classification: "DIFFERENT",
      record_sha256: "7".repeat(64),
      metrics: comparison.metrics,
      artifacts: comparison.record.artifacts,
    },
  };
}

function evidence() {
  const cell = visualCell();
  return {
    schema_version: 4,
    producer: "phase14-native-observation/v4",
    suite: "phase14",
    verdict: "REVIEW_REQUIRED",
    captured_started_at: "2026-10-10T01:00:00.000Z",
    captured_finished_at: "2026-10-10T01:10:00.000Z",
    source_tree_sha256: "1".repeat(64),
    package: "com.fchoo.gymtracker.devtest",
    profile: "development-test",
    device_identity_sha256: "2".repeat(64),
    apk: { sha256: "3".repeat(64), installed_sha256: "3".repeat(64), matches_retained_apk: true },
    evidence: [{
      id: "shell.four-roots",
      component_verdict: "PASS",
      native_verdict: "PASS",
      visual_verdict: "REVIEW_REQUIRED",
      verdict: "REVIEW_REQUIRED",
      matrix_cells: [cell],
    }],
    matrix_cells: [cell],
  };
}

function attestation(index, classification) {
  const entry = index.entries[0];
  return {
    schema_version: 1,
    producer: "phase14-independent-visual-review/v1",
    capture_set_sha256: index.capture_set_sha256,
    reviewed_at: "2026-10-10T02:00:00.000Z",
    reviewer: {
      identity: "independent-reviewer",
      fingerprint: "4".repeat(64),
      independence_attested: true,
    },
    comparisons: [{
      cell_id: entry.cell_id,
      hashes: entry.hashes,
      classification,
      rationale: "Reviewed the sealed reference/native/difference set and semantic contract.",
      semantic_zero_tolerance: { verdict: "PASS", semantic_sha256: entry.hashes.semantic_sha256 },
    }],
  };
}

test("Phase 14 maps only state-clean Workout-root captures and resolves live-switch by observed post-switch theme", () => {
  const comparableStates = PHASE14_NATIVE_MATRIX.states.filter(({ referencePolicy }) => referencePolicy.kind === "revision18-png");
  assert.deepEqual(comparableStates.map(({ caseId }) => caseId), ["shell.four-roots"]);
  assert.equal(comparableStates[0].referencePolicy.filesByRenderedTheme.light.file, ".planning/design/v1.2-browser-evidence/light-workout-root.png");
  assert.equal(comparableStates[0].referencePolicy.filesByRenderedTheme.dark.file, ".planning/design/v1.2-browser-evidence/dark-workout-root.png");
  const liveSwitch = PHASE14_NATIVE_MATRIX.cells.find(({ caseId, variant }) => caseId === "shell.four-roots" && variant === "system-live-switch");
  assert.equal(resolvePhase14VisualReference(liveSwitch, { rendered_theme: "dark" }).theme, "dark");
  assert.equal(resolvePhase14VisualReference(liveSwitch, { rendered_theme: "light" }).theme, "light");
  const toast = PHASE14_NATIVE_MATRIX.cells.find(({ caseId }) => caseId === "shell.toasts");
  assert.deepEqual(resolvePhase14VisualReference(toast, { rendered_theme: "dark" }), { kind: "native-only", verdict: "N_A_REVIEWED", rationale: toast.referencePolicy.rationale });
});

test("Phase 14 independently recomputes overlay, difference, mask, and metrics", () => {
  const reference = png([10, 20, 30, 255]);
  const native = png([10, 20, 31, 255]);
  const comparison = comparePhase14PngBytes({ reference, native });
  assert.doesNotThrow(() => validatePhase14VisualComparison(comparison.record, (name) => comparison.bytes[name]));
  const forgedOverlay = png([250, 250, 250, 255]);
  const forged = {
    ...comparison.record,
    artifacts: {
      ...comparison.record.artifacts,
      overlay: { ...comparison.record.artifacts.overlay, sha256: sha256(forgedOverlay) },
    },
  };
  assert.throws(
    () => validatePhase14VisualComparison(forged, (name) => name === "overlay" ? forgedOverlay : comparison.bytes[name]),
    /phase14_visual_recomputation_invalid/u,
  );
});

test("Phase 14 exact pixel MATCH closes automatically without reviewer metadata", () => {
  const bytes = png([10, 20, 30, 255]);
  const comparison = comparePhase14PngBytes({ reference: bytes, native: bytes });
  assert.equal(comparison.classification, "MATCH");
  assert.equal(comparison.metrics.changed_pixels, 0);
  assert.equal(comparison.record.classification, "MATCH");
});

test("Phase 14 capture index seals capture identity and every comparison/semantic hash", () => {
  const captured = evidence();
  const index = buildPhase14CaptureIndex(captured);
  assert.match(index.capture_set_sha256, /^[a-f0-9]{64}$/u);
  assert.equal(index.entries[0].hashes.semantic_sha256, captured.matrix_cells[0].semantic_tree_sha256);
  assert.equal(index.entries[0].hashes.mask_sha256, captured.matrix_cells[0].visual_comparison.artifacts.mask.sha256);
  assert.doesNotThrow(() => validatePhase14CaptureIndex(index, captured));
  const mutated = structuredClone(captured);
  mutated.matrix_cells[0].semantic_tree_sha256 = "0".repeat(64);
  assert.throws(() => validatePhase14CaptureIndex(index, mutated), /phase14_capture_index_stale/u);
});

test("Phase 14 detached attestation is post-capture, independent, and hash-bound", () => {
  const captured = evidence();
  const index = buildPhase14CaptureIndex(captured);
  for (const classification of ["antialias_only", "platform_chrome_masked", "native_metric_within_tolerance", "product_mismatch", "accepted_deviation"]) {
    assert.doesNotThrow(() => validatePhase14VisualAttestation(attestation(index, classification), index));
  }
  const stale = attestation(index, "antialias_only");
  stale.capture_set_sha256 = "0".repeat(64);
  assert.throws(() => validatePhase14VisualAttestation(stale, index), /phase14_visual_attestation_capture_invalid/u);
  const unsignedIdentity = attestation(index, "antialias_only");
  unsignedIdentity.reviewer.fingerprint = "pending";
  assert.throws(() => validatePhase14VisualAttestation(unsignedIdentity, index), /phase14_visual_reviewer_invalid/u);
  const beforeCapture = attestation(index, "antialias_only");
  beforeCapture.reviewed_at = "2026-10-10T00:59:00.000Z";
  assert.throws(() => validatePhase14VisualAttestation(beforeCapture, index), /phase14_visual_attestation_time_invalid/u);
});

test("Phase 14 reviewer artifact is generated from the sealed post-capture index without a signing key", () => {
  const index = buildPhase14CaptureIndex(evidence());
  const generated = createPhase14VisualAttestation({
    index,
    reviewer: { identity: "reviewer-two", fingerprint: "5".repeat(64), independence_attested: true },
    reviewedAt: "2026-10-10T02:10:00.000Z",
    decisions: [{
      cell_id: index.entries[0].cell_id,
      classification: "antialias_only",
      rationale: "Only subpixel antialiasing differs in the sealed comparison artifacts.",
      semantic_verdict: "PASS",
    }],
  });
  assert.equal(generated.capture_set_sha256, index.capture_set_sha256);
  assert.equal(Object.hasOwn(generated, "signature"), false);
  assert.equal(generated.comparisons[0].hashes.semantic_sha256, index.entries[0].hashes.semantic_sha256);
});

test("Phase 14 review classifications close truthfully and preserve semantic zero tolerance", () => {
  const captured = evidence();
  const index = buildPhase14CaptureIndex(captured);
  for (const classification of ["antialias_only", "platform_chrome_masked", "native_metric_within_tolerance"]) {
    const finalized = applyPhase14VisualAttestation(captured, index, attestation(index, classification));
    assert.equal(finalized.evidence[0].visual_verdict, "PASS");
    assert.equal(finalized.evidence[0].verdict, "PASS");
  }
  const mismatch = applyPhase14VisualAttestation(captured, index, attestation(index, "product_mismatch"));
  assert.equal(mismatch.evidence[0].visual_verdict, "FAIL");
  assert.equal(mismatch.evidence[0].verdict, "FAIL");
  const exception = applyPhase14VisualAttestation(captured, index, attestation(index, "accepted_deviation"));
  assert.equal(exception.evidence[0].visual_verdict, "ACCEPTED_EXCEPTION");
  assert.equal(exception.evidence[0].verdict, "ACCEPTED_EXCEPTION");
  const brokenSemantic = attestation(index, "antialias_only");
  brokenSemantic.comparisons[0].semantic_zero_tolerance.verdict = "FAIL";
  assert.throws(() => applyPhase14VisualAttestation(captured, index, brokenSemantic), /phase14_visual_semantic_gate_invalid/u);
});

test("Phase 14 native-only and non-exact configurations are non-PASS but do not block a native row", () => {
  assert.deepEqual(derivePhase14RowVerdict({
    componentVerdict: "PASS",
    nativeVerdict: "PASS",
    visualVerdicts: ["N_A_REVIEWED", "NOT_RUN"],
    comparableRequired: 0,
  }), { visual_verdict: "N_A_REVIEWED", verdict: "PASS" });
  assert.deepEqual(derivePhase14RowVerdict({
    componentVerdict: "PASS",
    nativeVerdict: "PASS",
    visualVerdicts: ["PASS", "NOT_RUN", "N_A_REVIEWED"],
    comparableRequired: 1,
  }), { visual_verdict: "PASS", verdict: "PASS" });
  assert.deepEqual(derivePhase14RowVerdict({
    componentVerdict: "PASS",
    nativeVerdict: "PASS",
    visualVerdicts: ["REVIEW_REQUIRED", "NOT_RUN"],
    comparableRequired: 1,
  }), { visual_verdict: "REVIEW_REQUIRED", verdict: "REVIEW_REQUIRED" });
});

test("Phase 14 finalize-existing cannot mutate capture identity", () => {
  const captured = evidence();
  const index = buildPhase14CaptureIndex(captured);
  const before = captureIdentitySha256(captured);
  const finalized = applyPhase14VisualAttestation(captured, index, attestation(index, "antialias_only"));
  assert.equal(finalized.capture_index.capture_set_sha256, index.capture_set_sha256);
  assert.equal(captureIdentitySha256(finalized), before);
  assert.equal(finalized.finalization.mode, "finalize-existing");
});

test("Phase 14 finalize-existing is detached and cannot rerun device cells", () => {
  assert.deepEqual(parsePhase14FinalizeArgs([
    "--attestation", "artifacts/native/phase14/review/reviewer-1.json",
    "--ids", "shell.four-roots",
  ]), {
    ids: ["shell.four-roots"],
    all: false,
    attestation: "artifacts/native/phase14/review/reviewer-1.json",
    output: "artifacts/native/phase14/finalized-evidence.json",
  });
  assert.throws(
    () => parsePhase14FinalizeArgs(["--attestation", "review.json", "--ids", "shell.four-roots"]),
    /phase14_finalize_arguments_invalid/u,
  );
  const source = readFileSync("scripts/finalize-phase14-evidence.mjs", "utf8");
  assert.doesNotMatch(source, /execFileSync|spawnSync|run-phase14-maestro|["']adb["']|["']maestro["']/u);
  assert.match(source, /capture_set_sha256/u);
});
