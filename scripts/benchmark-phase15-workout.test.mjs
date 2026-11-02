import assert from "node:assert/strict";
import test from "node:test";

import {
  PHASE15_WORKOUT_BENCHMARK_THRESHOLDS,
  validatePhase15WorkoutBenchmarkEvidence,
} from "./benchmark-phase15-workout.mjs";

const rawSamples = (count, value) => Array.from({ length: count }, () => value);

function validEvidence() {
  return {
    schema_version: 1,
    suite: "phase15",
    status: "passed",
    producer: "phase15-rendered-workout-benchmark/v1",
    identity: {
      base_head: "a".repeat(40),
      source_tree_sha256: "b".repeat(64),
      package: "com.fchoo.gymtracker.devtest",
      apk_sha256: "c".repeat(64),
      installed_apk_sha256: "c".repeat(64),
      device_serial: "emulator-5554",
    },
    measurements: {
      render_transition_ms: rawSamples(100, 120),
      active_js_task_ms: [8, 18, 32],
      long_session_render_ms: [20, 22],
      long_session_scroll_ms: [10, 12],
      long_session_interaction_ms: [8, 9],
    },
  };
}

const manifest = {
  base_head: "a".repeat(40),
  source_tree_sha256: "b".repeat(64),
  package: "com.fchoo.gymtracker.devtest",
  apk: { sha256: "c".repeat(64) },
  installed_apk: { sha256: "c".repeat(64) },
  device: { serial: "emulator-5554" },
};

test("Phase 15 benchmark validates exact identity and raw numeric measurements", () => {
  assert.deepEqual(validatePhase15WorkoutBenchmarkEvidence(validEvidence(), manifest), {
    active_js_task_max_ms: 32,
    render_transition_p95_ms: 120,
    sample_count: 100,
  });
  assert.equal(PHASE15_WORKOUT_BENCHMARK_THRESHOLDS.render_transition.maximum_p95_ms, 150);
});

test("Phase 15 benchmark rejects stale identity, privacy fields, missing samples, and threshold failures", () => {
  for (const mutate of [
    (value) => { value.identity.base_head = "d".repeat(40); },
    (value) => { value.measurements.render_transition_ms.pop(); },
    (value) => { value.measurements.active_js_task_ms.push(51); },
    (value) => { value.measurements.exercise_name = "Sensitive exercise"; },
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    assert.throws(() => validatePhase15WorkoutBenchmarkEvidence(evidence, manifest));
  }
});
