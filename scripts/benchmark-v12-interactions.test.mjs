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
    performance: evidence({
      samples: {
        ...evidence().samples,
        input_response_ms: { numeric_edit: samples(100, 10), rest_control: samples(100, 10) },
        search_after_debounce_ms: samples(100, 20),
        calendar_month_and_selection_ms: samples(100, 50),
        progress_useful_content_ms: samples(20, 80),
        progress_review_open_ms: samples(100, 50),
        progress_targeted_rebuild_ms: samples(20, 80),
        calendar_frame_sequences: Array.from({ length: 100 }, () => ({ frame_work_ms: [10, 12], missed_frames: 0, refresh_rate_hz: 60, profiler_overhead_ms: 0.2 })),
        phase12_dirty_trigger_ms: samples(100, 1),
        phase12_writer_occupancy_ms: samples(20, 20),
        phase12_merge_preflight_ms: samples(10, 100),
        phase12_merge_peak_growth_bytes: samples(10, 1_024),
        phase12_merge_materialization_ms: samples(5, 100),
        phase12_merge_fixture: { snapshot_bytes: 24 * 1024 * 1024, rows: 100_000, writer_commits: 5, sqlite_max_variable_number: 4_000 },
        garmin_sync_normalization: { state: "REVIEW_REQUIRED", limit_source: "phase18-exact-artifact-baseline", fixture_sha256: "f".repeat(64) },
      },
    }),
  });
  assert.equal(observation.observation_state, "REVIEW_REQUIRED");
  assert.equal(Object.hasOwn(observation, "verdict"), false);
  assert.equal(validateV12PerformanceShard(observation, identity).calendar_frame_sequences.samples, 100);
  const inventedGarminLimit = structuredClone(observation);
  inventedGarminLimit.raw_samples.garmin_sync_normalization = { state: "PASS" };
  assert.throws(() => validateV12PerformanceShard(inventedGarminLimit, identity), /garmin/);
});

test("release collector publishes immutable raw warm/cold and frame observations without a verdict", async () => {
  const { executeV12InteractionBenchmark } = await import("./benchmark-v12-interactions.mjs");
  const full = evidence({
    samples: {
      ...evidence().samples,
      input_response_ms: { numeric_edit: samples(100, 10), rest_control: samples(100, 10) },
      search_after_debounce_ms: samples(100, 20),
      calendar_month_and_selection_ms: samples(100, 50),
      progress_useful_content_ms: samples(20, 80),
      progress_review_open_ms: samples(100, 50),
      progress_targeted_rebuild_ms: samples(20, 80),
      calendar_frame_sequences: Array.from({ length: 100 }, () => ({ frame_work_ms: [10, 12], missed_frames: 0, refresh_rate_hz: 60, profiler_overhead_ms: 0.2 })),
      phase12_dirty_trigger_ms: samples(100, 1), phase12_writer_occupancy_ms: samples(20, 20), phase12_merge_preflight_ms: samples(10, 100), phase12_merge_peak_growth_bytes: samples(10, 1024), phase12_merge_materialization_ms: samples(5, 100),
      phase12_merge_fixture: { snapshot_bytes: 24 * 1024 * 1024, rows: 100000, writer_commits: 5, sqlite_max_variable_number: 4000 },
      garmin_sync_normalization: { state: "REVIEW_REQUIRED", limit_source: "phase18-exact-artifact-baseline", fixture_sha256: "f".repeat(64) },
    },
  });
  const written = new Map();
  const output = await executeV12InteractionBenchmark({ runId: "phase20-20261014T000000Z-aaaaaaaaaaaa", identity, collect: () => full, write: (file, value) => written.set(file, value) });
  assert.equal(output.observation.raw_samples.cold_launch_to_interactive_ms.length, 20);
  assert.equal(output.observation.summary.calendar_frame_sequences.p95_ms, 12);
  assert.equal(Object.hasOwn(output, "verdict"), false);
  assert.equal(written.size, 1);
});
