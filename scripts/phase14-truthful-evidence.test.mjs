import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { PNG } from "pngjs";

import {
  buildPhase14Dev02Evidence,
  comparePhase14PngBytes,
  derivePhase14NativeVerdict,
  ingestPhase14JestReport,
  validatePhase14FocusTrace,
  validatePhase14RuntimeStatePair,
  validatePhase14VisualComparison,
} from "./phase14-evidence-observation.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function png(pixel) {
  const image = new PNG({ width: 1, height: 1 });
  image.data.set(pixel);
  return PNG.sync.write(image);
}

test("Phase 14 derives component verdicts only from mapped real Jest JSON with no failures, skips, or todos", () => {
  const report = {
    success: true,
    numTotalTests: 2,
    numPassedTests: 2,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: [{
      name: "/repo/src/ui/__tests__/foundation.test.tsx",
      status: "passed",
      assertionResults: [
        { fullName: "shell token contract", status: "passed" },
        { fullName: "appearance contract", status: "passed" },
      ],
    }],
  };
  const result = ingestPhase14JestReport(report, [{
    id: "shell.tokens",
    componentTests: ["src/ui/__tests__/foundation.test.tsx"],
  }]);
  assert.equal(result.cases[0].verdict, "PASS");
  assert.equal(result.cases[0].passed, 2);

  for (const mutation of [
    { numPendingTests: 1 },
    { numTodoTests: 1 },
    { numFailedTests: 1, success: false },
  ]) {
    assert.throws(
      () => ingestPhase14JestReport({ ...report, ...mutation }, [{
        id: "shell.tokens",
        componentTests: ["src/ui/__tests__/foundation.test.tsx"],
      }]),
      /phase14_component_report_invalid/u,
    );
  }
});

test("Phase 14 focus traces require ordered observed pre/post trees, focus, timestamps, and postcondition verdicts", () => {
  const trace = {
    schema_version: 2,
    producer: "phase14-adb-observer/v1",
    synthetic: false,
    cell_id: "cell",
    observations: [{
      order: 0,
      action_id: "dpad-down",
      input: "DPAD_DOWN",
      transport: "adb-keyevent",
      command: { key_code: 20 },
      started_at: "2026-10-10T01:00:00.000Z",
      finished_at: "2026-10-10T01:00:00.100Z",
      pre: { semantic_tree_sha256: "a".repeat(64), focused_node: "Open App Settings" },
      post: { semantic_tree_sha256: "b".repeat(64), focused_node: "Calendar" },
      postcondition: { id: "focus-moved", verdict: "PASS", observed: true },
    }],
  };
  assert.doesNotThrow(() => validatePhase14FocusTrace(trace, ["dpad-down"]));
  assert.throws(
    () => validatePhase14FocusTrace({ ...trace, synthetic: true }, ["dpad-down"]),
    /phase14_focus_trace_synthetic/u,
  );
  assert.throws(
    () => validatePhase14FocusTrace({
      ...trace,
      observations: [{ ...trace.observations[0], post: trace.observations[0].pre }],
    }, ["dpad-down"]),
    /phase14_focus_trace_observation_invalid/u,
  );
});

test("Phase 14 no-write state proof accepts aggregate runtime digests and rejects source-tree substitution", () => {
  const digest = {
    proof_schema_version: 1,
    producer: "phase14-app-canonical-logical-source-digest/v1",
    authority: "development-test-app-canonical-logical-sqlite-source",
    digest_sha256: "c".repeat(64),
    table_count: 48,
    row_count: 321,
    schema_version: 30,
    contains_raw_rows: false,
  };
  assert.doesNotThrow(() => validatePhase14RuntimeStatePair({ pre: digest, post: digest }));
  assert.throws(
    () => validatePhase14RuntimeStatePair({
      pre: { ...digest, authority: "source-tree" },
      post: digest,
    }),
    /phase14_runtime_state_invalid/u,
  );
  assert.throws(
    () => validatePhase14RuntimeStatePair({
      pre: { ...digest, row_sample: "private" },
      post: digest,
    }),
    /phase14_runtime_state_invalid/u,
  );
  assert.throws(
    () => validatePhase14RuntimeStatePair({
      pre: digest,
      post: { ...digest, digest_sha256: "d".repeat(64) },
    }),
    /phase14_runtime_state_changed/u,
  );
});

test("Phase 14 visual comparison retains real PNG constituents and rejects metadata-only overlays", () => {
  const reference = png([10, 20, 30, 255]);
  const native = png([10, 20, 31, 255]);
  const comparison = comparePhase14PngBytes({ reference, native });
  assert.equal(comparison.metrics.changed_pixels, 1);
  assert.equal(comparison.classification, "REVIEW_REQUIRED");
  for (const key of ["reference", "native", "overlay", "difference", "mask"]) {
    assert.equal(PNG.sync.read(comparison.bytes[key]).width, 1);
    assert.equal(comparison.hashes[`${key}_sha256`], sha256(comparison.bytes[key]));
  }
  assert.doesNotThrow(() => validatePhase14VisualComparison(comparison.record, (name) => comparison.bytes[name]));
  assert.throws(
    () => validatePhase14VisualComparison({
      ...comparison.record,
      artifacts: { ...comparison.record.artifacts, overlay: { path: "overlay.json", sha256: "a".repeat(64) } },
    }, (name) => comparison.bytes[name]),
    /phase14_visual_artifact_invalid/u,
  );
});

test("Phase 14 DEV-02 computes exact blended contrast and cannot close Calendar adoption from Maestro", () => {
  const evidence = buildPhase14Dev02Evidence({
    titleHex: "#9B470B",
    sportHex: "#D97820",
    surfaceHex: "#FFFAF0",
    blendAlpha: 0.14,
    sourceHashes: {
      theme_sha256: "1".repeat(64),
      prototype_sha256: "2".repeat(64),
      owner_record_sha256: "3".repeat(64),
    },
  });
  assert.equal(evidence.blended_fill_hex, "#F1E1D0");
  assert.ok(Math.abs(evidence.contrast_ratio - 4.976317758929604) < 1e-12);
  assert.equal(evidence.token_measurement_verdict, "PASS");
  assert.equal(evidence.calendar_adoption.verdict, "NOT_RUN");
  assert.equal(evidence.verdict, "REVIEW_REQUIRED");

  assert.throws(
    () => buildPhase14Dev02Evidence({
      titleHex: "#D97820",
      sportHex: "#D97820",
      surfaceHex: "#FFFAF0",
      blendAlpha: 0.14,
      sourceHashes: evidence.source_hashes,
    }),
    /phase14_dev02_token_invalid/u,
  );
});

test("Phase 14 native verdict is derived from observations and never from ordinary Maestro PASS metadata", () => {
  assert.equal(derivePhase14NativeVerdict({
    maestro: { verdict: "PASS" },
    actions: [{ postcondition: { verdict: "PASS" } }],
    checkpoints: [{ verdict: "PASS" }],
    runtimeState: { verdict: "PASS" },
    theme: { verdict: "PASS" },
  }), "PASS");
  assert.equal(derivePhase14NativeVerdict({
    maestro: { verdict: "PASS" },
    actions: [],
    checkpoints: [{ verdict: "PASS" }],
    runtimeState: { verdict: "PASS" },
    theme: { verdict: "PASS" },
  }), "FAIL");
});
