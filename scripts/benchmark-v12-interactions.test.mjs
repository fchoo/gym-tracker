import assert from "node:assert/strict";
import test from "node:test";

import {
  V12_PERFORMANCE_BUDGETS,
  executeV12InteractionBenchmark,
  nearestRankP95,
  validateV12PerformanceEvidence,
} from "./benchmark-v12-interactions.mjs";

const identity = Object.freeze({
  base_head: "a".repeat(40),
  source_tree_sha256: "b".repeat(64),
  apk_sha256: "c".repeat(64),
  installed_apk_sha256: "c".repeat(64),
  package: "com.fchoo.gymtracker.devtest",
  device_identity_sha256: "d".repeat(64),
  fixture_sha256: "e".repeat(64),
});

function samples(count, value) {
  return Array.from({ length: count }, () => value);
}

function evidence(overrides = {}) {
  return {
    schema_version: 1,
    suite: "v1.2-performance",
    producer: "v12-release-performance-collector/v1",
    native_execution: "EXECUTED",
    identity,
    budgets: V12_PERFORMANCE_BUDGETS,
    samples: {
      warm_launch_to_interactive_ms: samples(20, 100),
      cold_launch_to_interactive_ms: samples(20, 200),
      root_switch_to_useful_ms: { workout: samples(100, 40), calendar: samples(100, 40) },
      committed_set_to_visible_dock_ms: samples(100, 80),
      ordinary_js_task_ms: samples(100, 10),
    },
    ...overrides,
  };
}

test("locks D20-06 and Phase 12 budgets before any collection", () => {
  assert.equal(V12_PERFORMANCE_BUDGETS.root_switch_to_useful.maximum_p95_ms, 100);
  assert.equal(V12_PERFORMANCE_BUDGETS.committed_set_to_visible_dock.maximum_p95_ms, 150);
  assert.equal(V12_PERFORMANCE_BUDGETS.phase12_merge_preflight.required_rows, 100000);
  assert.equal(V12_PERFORMANCE_BUDGETS.garmin_sync_normalization.status, "REVIEW_REQUIRED");
});

test("validates retained raw samples and deterministic p95 without fabricated verdicts", () => {
  const result = validateV12PerformanceEvidence(evidence(), identity);
  assert.equal(result.root_switch_to_useful.workout.p95_ms, 40);
  assert.equal(nearestRankP95([1, 5, 2, 9]), 9);
  assert.equal(Object.hasOwn(result, "verdict"), false);
});

test("rejects missing or invalid samples, drifted budgets, and mismatched identity", () => {
  assert.throws(() => validateV12PerformanceEvidence(evidence({ samples: {} }), identity), /samples_invalid/);
  assert.throws(() => validateV12PerformanceEvidence(evidence({ budgets: {} }), identity), /budgets_invalid/);
  assert.throws(() => validateV12PerformanceEvidence(evidence({ identity: { ...identity, fixture_sha256: "f".repeat(64) } }), identity), /identity_invalid/);
});

test("collector stays deferred without a later authorized native execution", async () => {
  await assert.rejects(() => executeV12InteractionBenchmark(), /deferred/);
});
