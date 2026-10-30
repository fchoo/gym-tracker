export const PHASE15_BENCHMARK_RESULT_MARKER =
  "GYM_TRACKER_PHASE15_WORKOUT_BENCHMARK_RESULT:" as const;

export const PHASE15_BENCHMARK_MINIMUM_SAMPLES = 100;
export const PHASE15_RENDER_TRANSITION_P95_LIMIT_MS = 150;
export const PHASE15_ACTIVE_JS_TASK_LIMIT_MS = 50;

export type Phase15WorkoutBenchmarkMeasurements = Readonly<{
  render_transition_ms: readonly number[];
  active_js_task_ms: readonly number[];
  long_session_render_ms: readonly number[];
  long_session_scroll_ms: readonly number[];
  long_session_interaction_ms: readonly number[];
}>;

export type Phase15WorkoutBenchmarkResult = Readonly<{
  schemaVersion: 1;
  suite: "phase15";
  status: "passed";
  producer: "phase15-rendered-workout-benchmark/v1";
  measurements: Phase15WorkoutBenchmarkMeasurements;
}>;

function validSamples(
  values: readonly number[],
  minimum: number,
  label: string,
): void {
  if (
    !Array.isArray(values)
    || values.length < minimum
    || values.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new Error(`phase15_${label}_samples_invalid`);
  }
}

export function percentile(
  values: readonly number[],
  percentileValue: number,
): number {
  if (values.length === 0 || percentileValue <= 0 || percentileValue > 1) {
    throw new Error("phase15_percentile_input_invalid");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * percentileValue) - 1]!;
}

/**
 * Validates the only performance evidence shape accepted by the Phase 15
 * final verifier. The native route owns the timestamps; this module never
 * substitutes a domain invalidation callback for a rendered frame.
 */
export function validatePhase15WorkoutBenchmarkResult(
  result: Phase15WorkoutBenchmarkResult,
): Readonly<{
  samples: number;
  renderTransitionP95Ms: number;
  activeJsTaskMaxMs: number;
}> {
  if (
    result.schemaVersion !== 1
    || result.suite !== "phase15"
    || result.status !== "passed"
    || result.producer !== "phase15-rendered-workout-benchmark/v1"
  ) {
    throw new Error("phase15_benchmark_envelope_invalid");
  }
  const measurements = result.measurements;
  validSamples(
    measurements.render_transition_ms,
    PHASE15_BENCHMARK_MINIMUM_SAMPLES,
    "render_transition",
  );
  validSamples(measurements.active_js_task_ms, 1, "active_js_task");
  validSamples(measurements.long_session_render_ms, 1, "long_session_render");
  validSamples(measurements.long_session_scroll_ms, 1, "long_session_scroll");
  validSamples(
    measurements.long_session_interaction_ms,
    1,
    "long_session_interaction",
  );
  const renderTransitionP95Ms = percentile(
    measurements.render_transition_ms,
    0.95,
  );
  const activeJsTaskMaxMs = Math.max(...measurements.active_js_task_ms);
  if (renderTransitionP95Ms > PHASE15_RENDER_TRANSITION_P95_LIMIT_MS) {
    throw new Error("phase15_render_transition_budget_exceeded");
  }
  if (activeJsTaskMaxMs > PHASE15_ACTIVE_JS_TASK_LIMIT_MS) {
    throw new Error("phase15_active_js_task_budget_exceeded");
  }
  return Object.freeze({
    samples: measurements.render_transition_ms.length,
    renderTransitionP95Ms,
    activeJsTaskMaxMs,
  });
}

export function createPhase15WorkoutBenchmarkRecorder(
  now: () => number,
) {
  const measurements: {
    render_transition_ms: number[];
    active_js_task_ms: number[];
    long_session_render_ms: number[];
    long_session_scroll_ms: number[];
    long_session_interaction_ms: number[];
  } = {
    render_transition_ms: [],
    active_js_task_ms: [],
    long_session_render_ms: [],
    long_session_scroll_ms: [],
    long_session_interaction_ms: [],
  };
  let activationAt: number | null = null;
  let authoritativeCommitAt: number | null = null;

  return Object.freeze({
    markActivation() {
      activationAt = now();
    },
    markAuthoritativeCommit() {
      if (activationAt === null) throw new Error("phase15_activation_missing");
      authoritativeCommitAt = now();
    },
    markFirstRestDockFrame() {
      if (activationAt === null || authoritativeCommitAt === null) {
        throw new Error("phase15_authoritative_commit_missing");
      }
      measurements.render_transition_ms.push(now() - activationAt);
      activationAt = null;
      authoritativeCommitAt = null;
    },
    measureActiveJsTask<T>(task: () => T): T {
      const startedAt = now();
      const result = task();
      measurements.active_js_task_ms.push(now() - startedAt);
      return result;
    },
    markLongSessionWork(
      kind: "render" | "scroll" | "interaction",
      startedAt: number,
    ) {
      measurements[`long_session_${kind}_ms`].push(now() - startedAt);
    },
    result(): Phase15WorkoutBenchmarkResult {
      const result: Phase15WorkoutBenchmarkResult = {
        schemaVersion: 1,
        suite: "phase15",
        status: "passed",
        producer: "phase15-rendered-workout-benchmark/v1",
        measurements: Object.freeze({
          render_transition_ms: [...measurements.render_transition_ms],
          active_js_task_ms: [...measurements.active_js_task_ms],
          long_session_render_ms: [...measurements.long_session_render_ms],
          long_session_scroll_ms: [...measurements.long_session_scroll_ms],
          long_session_interaction_ms: [...measurements.long_session_interaction_ms],
        }),
      };
      validatePhase15WorkoutBenchmarkResult(result);
      return result;
    },
  });
}
