import assert from "node:assert/strict";
import test from "node:test";

import {
  V12_PERFORMANCE_BUDGETS,
  executeV12InteractionBenchmark,
  nearestRankP95,
  validateV12PerformanceEvidence,
} from "./benchmark-v12-interactions.mjs";
import { performanceEvidence } from "./testing/v12-quality-evidence-fixture.mjs";

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
    sample_origin: "release-native-source-backed",
    workload: {
      full_calendar: true,
      set_count: 15_000,
      correction_count: 200,
      multi_plan_history: true,
      maximum_reviewed_garmin_json: true,
      merge_fixture: "phase12-24mib-100000-row",
    },
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
  assert.equal(V12_PERFORMANCE_BUDGETS.garmin_sync_normalization.limit_source, "phase20-current-source-baseline/v1");
});

test("validates retained raw samples and deterministic p95 without fabricated verdicts", () => {
  const result = validateV12PerformanceEvidence(evidence(), identity);
  assert.equal(result.root_switch_to_useful.workout.p95_ms, 40);
  assert.equal(nearestRankP95([1, 5, 2, 9]), 9);
  assert.equal(Object.hasOwn(result, "verdict"), false);
});

test("rejects missing or invalid samples, drifted budgets, and mismatched identity", () => {
  assert.throws(() => validateV12PerformanceEvidence(evidence({ samples: {} }), identity), /samples_invalid/);
  assert.throws(() => validateV12PerformanceEvidence(evidence({ samples: { ...evidence().samples, cold_launch_to_interactive_ms: samples(19, 200) } }), identity), /cold_launch_samples_invalid/);
  assert.throws(() => validateV12PerformanceEvidence(evidence({ samples: { ...evidence().samples, ordinary_js_task_ms: [Number.NaN] } }), identity), /ordinary_js_task_samples_invalid/);
  assert.throws(() => validateV12PerformanceEvidence(evidence({ budgets: {} }), identity), /budgets_invalid/);
  for (const key of ["source_tree_sha256", "apk_sha256", "device_identity_sha256", "fixture_sha256"]) {
    assert.throws(() => validateV12PerformanceEvidence(evidence({ identity: { ...identity, [key]: "f".repeat(64) } }), identity), /identity_invalid/);
  }
  assert.throws(() => validateV12PerformanceEvidence(evidence({ sample_origin: "host-jest" }), identity), /source_backing_invalid/);
});

test("collector stays deferred without a later authorized native execution", async () => {
  await assert.rejects(() => executeV12InteractionBenchmark(), /deferred/);
});

test("performance shard keeps the complete raw observation schema review-required", async () => {
  const {
    executeV12PerformanceShard,
    validateV12PerformanceShard,
  } = await import("./v12-performance-shard.mjs");
  const observation = executeV12PerformanceShard({
    identity,
    performance: performanceEvidence(identity),
  });
  assert.equal(observation.observation_state, "REVIEW_REQUIRED");
  assert.equal(observation.summary.classification, "REVIEW_REQUIRED");
  assert.equal(observation.summary.gates.warm_launch_to_interactive.result, "PASS");
  assert.equal(Object.hasOwn(observation, "verdict"), false);
  assert.equal(validateV12PerformanceShard(observation, identity).calendar_frame_sequences.samples, 100);
  const inventedGarminLimit = structuredClone(observation);
  inventedGarminLimit.raw_samples.garmin_sync_normalization = { state: "PASS" };
  assert.throws(() => validateV12PerformanceShard(inventedGarminLimit, identity), /garmin/);
});

test("release collector publishes immutable raw warm/cold and frame observations without a verdict", async () => {
  const { executeV12InteractionBenchmark } = await import("./benchmark-v12-interactions.mjs");
  const full = performanceEvidence(identity);
  const written = new Map();
  const output = await executeV12InteractionBenchmark({ runId: "phase20-20261014T000000Z-aaaaaaaaaaaa", identity, collect: () => full, write: (file, value) => written.set(file, value) });
  assert.equal(output.observation.raw_samples.cold_launch_to_interactive_ms.length, 20);
  assert.equal(output.observation.summary.calendar_frame_sequences.p95_ms,
    nearestRankP95(full.samples.calendar_frame_sequences.map((sequence) => Math.max(...sequence.frame_work_ms))));
  assert.equal(Object.hasOwn(output, "verdict"), false);
  assert.equal(written.size, 1);
});
