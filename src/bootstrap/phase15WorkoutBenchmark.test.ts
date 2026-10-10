import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  PHASE15_BENCHMARK_MINIMUM_SAMPLES,
  createPhase15WorkoutBenchmarkRecorder,
  percentile,
  validatePhase15WorkoutBenchmarkResult,
} from "./phase15WorkoutBenchmark";

describe("Phase 15 rendered workout benchmark", () => {
  const validResult = () => ({
    schemaVersion: 1 as const,
    suite: "phase15" as const,
    status: "passed" as const,
    producer: "phase15-rendered-workout-benchmark/v1" as const,
    measurements: {
      render_transition_ms: Array.from({ length: PHASE15_BENCHMARK_MINIMUM_SAMPLES }, () => 100),
      active_js_task_ms: [4, 12, 18],
      long_session_render_ms: [12, 16],
      long_session_scroll_ms: [8, 10],
      long_session_interaction_ms: [6, 9],
    },
  });

  it("retains raw rendered transition and long-session measurements", () => {
    expect(validatePhase15WorkoutBenchmarkResult(validResult())).toEqual({
      activeJsTaskMaxMs: 18,
      renderTransitionP95Ms: 100,
      samples: PHASE15_BENCHMARK_MINIMUM_SAMPLES,
    });
  });

  it("calculates nearest-rank percentiles without reordering the evidence", () => {
    expect(percentile([30, 10, 20, 40], 0.95)).toBe(40);
    expect(percentile([30, 10, 20, 40], 0.5)).toBe(20);
  });

  it("records activation, authoritative commit, rendered frame, and long-session work in order", () => {
    let now = 0;
    const recorder = createPhase15WorkoutBenchmarkRecorder(() => now);
    for (let index = 0; index < PHASE15_BENCHMARK_MINIMUM_SAMPLES; index += 1) {
      recorder.markActivation();
      now += 2;
      recorder.markAuthoritativeCommit();
      now += 18;
      recorder.markFirstRestDockFrame();
    }
    const renderStarted = now;
    now += 4;
    recorder.markLongSessionWork("render", renderStarted);
    const scrollStarted = now;
    now += 3;
    recorder.markLongSessionWork("scroll", scrollStarted);
    const interactionStarted = now;
    now += 2;
    recorder.markLongSessionWork("interaction", interactionStarted);
    recorder.measureActiveJsTask(() => { now += 5; });

    expect(recorder.result().measurements).toMatchObject({
      render_transition_ms: Array.from({ length: PHASE15_BENCHMARK_MINIMUM_SAMPLES }, () => 20),
      active_js_task_ms: [5],
      long_session_render_ms: [4],
      long_session_scroll_ms: [3],
      long_session_interaction_ms: [2],
    });
  });

  it("rejects incomplete, non-finite, and over-budget raw measurements", () => {
    const incomplete = validResult();
    incomplete.measurements.render_transition_ms.pop();
    expect(() => validatePhase15WorkoutBenchmarkResult(incomplete)).toThrow(
      "phase15_render_transition_samples_invalid",
    );

    const nonFinite = validResult();
    nonFinite.measurements.long_session_scroll_ms[0] = Number.NaN;
    expect(() => validatePhase15WorkoutBenchmarkResult(nonFinite)).toThrow(
      "phase15_long_session_scroll_samples_invalid",
    );

    const slow = validResult();
    for (let index = 94; index < 100; index += 1) {
      slow.measurements.render_transition_ms[index] = 151;
    }
    expect(() => validatePhase15WorkoutBenchmarkResult(slow)).toThrow(
      "phase15_render_transition_budget_exceeded",
    );
  });
});
