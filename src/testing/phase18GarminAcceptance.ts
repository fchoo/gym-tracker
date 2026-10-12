import {
  GARMIN_ACCEPTANCE_HOST_CASE_IDS,
  GARMIN_ACCEPTANCE_NATIVE_PREREQUISITE_IDS,
  type GarminAcceptanceHostCaseId,
} from "./contracts/garminImport.contract.ts";
import type {
  GarminConnectNativeModule,
  GarminRuntimeInfo,
} from "../../modules/garmin-connect/src/index.ts";

export const PHASE18_GARMIN_ACCEPTANCE_CONFIRMATION =
  "VERIFY-PHASE18-GARMIN-ACCEPTANCE";
export const PHASE18_GARMIN_BENCHMARK_MARKER =
  "GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:";

const HASH = /^[a-f0-9]{64}$/u;
const SAFE_SEMANTIC_STATE = /^[a-z][a-z0-9-]{0,63}$/u;
const PRIVATE_TEXT = /(?:@|account|credential|email|external|filename|heart|json|latitude|longitude|password|raw|route|serial|token)/iu;
const BENCHMARK_NONCE = /^[a-f0-9]{32}$/u;
const BENCHMARK_OPERATION = /^[a-z][a-z0-9-]*(?::[a-z0-9-]+){1,3}$/u;
const NON_OBSERVATION_PRODUCER = /(?:constant|demo|fixture|synthetic)/iu;
const RESULT_KEYS = new Set([
  "duration_ms",
  "source_digest",
  "match_digest",
  "semantic_state",
]);

export const PHASE18_GARMIN_BENCHMARK_METRICS = Object.freeze([
  "apk_size_bytes",
  "garmin_module_size_bytes",
  "python_cold_start_ms",
  "python_warm_start_ms",
  "bounded_sync_ms",
  "route_render_ms",
  "lap_render_ms",
  "memory_rss_bytes",
  "js_task_ms",
  "frame_time_ms",
  "offline_workout_commit_ms",
] as const);

export type Phase18GarminBenchmarkMetric =
  typeof PHASE18_GARMIN_BENCHMARK_METRICS[number];

export const PHASE18_GARMIN_BENCHMARK_MINIMUM_SAMPLES: Readonly<
  Record<Phase18GarminBenchmarkMetric, number>
> = Object.freeze({
  apk_size_bytes: 1,
  garmin_module_size_bytes: 1,
  python_cold_start_ms: 5,
  python_warm_start_ms: 10,
  bounded_sync_ms: 5,
  route_render_ms: 10,
  lap_render_ms: 10,
  memory_rss_bytes: 5,
  js_task_ms: 30,
  frame_time_ms: 30,
  offline_workout_commit_ms: 10,
});

export type Phase18GarminBenchmarkObservation = Readonly<{
  value: number;
  observed_at_monotonic_ms: number;
  operation: string;
}>;

export type Phase18GarminBenchmarkMeasurementPort = Readonly<{
  kind: "installed-observation-port";
  processId(): Promise<number>;
  observe(
    metric: Phase18GarminBenchmarkMetric,
    minimumSamples: number,
  ): Promise<readonly Phase18GarminBenchmarkObservation[]>;
}>;

export type Phase18GarminBenchmarkRenderProbeKind = "route" | "laps";
export type Phase18GarminBenchmarkRenderProbe = (
  kind: Phase18GarminBenchmarkRenderProbeKind,
) => Promise<Phase18GarminBenchmarkObservation>;

function benchmarkObservation(
  value: number,
  observedAtMonotonicMs: number,
  operation: string,
): Phase18GarminBenchmarkObservation {
  return Object.freeze({
    value,
    observed_at_monotonic_ms: observedAtMonotonicMs,
    operation,
  });
}

export function createInstalledPhase18GarminBenchmarkMeasurementPort(
  renderProbe: Phase18GarminBenchmarkRenderProbe,
): Phase18GarminBenchmarkMeasurementPort {
  let nativeModulePromise: Promise<GarminConnectNativeModule> | undefined;
  const nativeModule = () => {
    nativeModulePromise ??= import("../../modules/garmin-connect/src/index.ts")
      .then(({ getGarminConnectNativeModule }) => getGarminConnectNativeModule());
    return nativeModulePromise;
  };
  const runtimeSamples: GarminRuntimeInfo[] = [];
  const readRuntime = async () => {
    const [{ readGarminRuntimeInfo }, module] = await Promise.all([
      import("../../modules/garmin-connect/src/index.ts"),
      nativeModule(),
    ]);
    const sample = await readGarminRuntimeInfo(module);
    runtimeSamples.push(sample);
    return sample;
  };
  const firstRuntime = async () => runtimeSamples[0] ?? readRuntime();
  const nativeObservation = (
    sample: GarminRuntimeInfo,
    value: number,
    operationName: string,
  ) => benchmarkObservation(
    value,
    sample.benchmark.observedAtMonotonicMs,
    operationName,
  );
  const observeRuntimeSamples = async (
    minimumSamples: number,
    projectSample: (sample: GarminRuntimeInfo) => Phase18GarminBenchmarkObservation | null,
  ) => {
    const selected = () => runtimeSamples
      .map(projectSample)
      .filter((entry): entry is Phase18GarminBenchmarkObservation => entry !== null);
    let attempts = 0;
    while (selected().length < minimumSamples && attempts < minimumSamples + 2) {
      await readRuntime();
      attempts += 1;
    }
    return selected().slice(-minimumSamples);
  };
  const observeRepeated = async (
    minimumSamples: number,
    operationName: string,
    performOperation: () => Promise<void>,
  ) => {
    const observations: Phase18GarminBenchmarkObservation[] = [];
    for (let index = 0; index < minimumSamples; index += 1) {
      const startedAt = performance.now();
      await performOperation();
      const observedAt = performance.now();
      observations.push(benchmarkObservation(
        observedAt - startedAt,
        observedAt,
        operationName,
      ));
    }
    return observations;
  };

  return Object.freeze({
    kind: "installed-observation-port" as const,
    async processId() {
      return (await firstRuntime()).benchmark.processId;
    },
    async observe(metric: Phase18GarminBenchmarkMetric, minimumSamples: number) {
      switch (metric) {
        case "apk_size_bytes": {
          const sample = await firstRuntime();
          return [nativeObservation(
            sample,
            sample.benchmark.installedApkSizeBytes,
            "native-runtime:apk-size",
          )];
        }
        case "garmin_module_size_bytes": {
          const sample = await firstRuntime();
          return [nativeObservation(
            sample,
            sample.benchmark.garminModuleSizeBytes,
            "native-runtime:garmin-module-size",
          )];
        }
        case "python_cold_start_ms": {
          await firstRuntime();
          return runtimeSamples
            .filter(({ benchmark }) => benchmark.pythonStartupKind === "cold")
            .map((sample) => nativeObservation(
              sample,
              sample.benchmark.pythonStartupDurationMs,
              "native-runtime:python-cold-start",
            ));
        }
        case "python_warm_start_ms":
          return observeRuntimeSamples(minimumSamples, (sample) => (
            sample.benchmark.pythonStartupKind === "warm"
              ? nativeObservation(
                sample,
                sample.benchmark.pythonStartupDurationMs,
                "native-runtime:python-warm-start",
              )
              : null
          ));
        case "bounded_sync_ms":
          return observeRepeated(
            minimumSamples,
            "native-garmin:bounded-sync",
            async () => {
              await (await nativeModule()).forceRefreshForTest();
            },
          );
        case "route_render_ms": {
          const observations: Phase18GarminBenchmarkObservation[] = [];
          for (let index = 0; index < minimumSamples; index += 1) {
            observations.push(await renderProbe("route"));
          }
          return observations;
        }
        case "lap_render_ms": {
          const observations: Phase18GarminBenchmarkObservation[] = [];
          for (let index = 0; index < minimumSamples; index += 1) {
            observations.push(await renderProbe("laps"));
          }
          return observations;
        }
        case "memory_rss_bytes":
          return observeRuntimeSamples(minimumSamples, (sample) => (
            sample.benchmark.memoryRssBytes === undefined
              ? null
              : nativeObservation(
                sample,
                sample.benchmark.memoryRssBytes,
                "native-runtime:memory-rss",
              )
          ));
        case "js_task_ms": {
          const observations: Phase18GarminBenchmarkObservation[] = [];
          let checksum = 0;
          for (let index = 0; index < minimumSamples; index += 1) {
            const startedAt = performance.now();
            for (let step = 0; step < 4_096; step += 1) {
              checksum = Math.imul(checksum ^ step, 2_654_435_761);
            }
            const observedAt = performance.now();
            observations.push(benchmarkObservation(
              observedAt - startedAt,
              observedAt,
              "react-native:bounded-js-task",
            ));
          }
          if (!Number.isSafeInteger(checksum)) throw new Error("phase18_js_probe_invalid");
          return observations;
        }
        case "frame_time_ms": {
          const observations: Phase18GarminBenchmarkObservation[] = [];
          for (let index = 0; index < minimumSamples; index += 1) {
            const startedAt = performance.now();
            const observedAt = await new Promise<number>((resolve) => {
              requestAnimationFrame(resolve);
            });
            observations.push(benchmarkObservation(
              observedAt - startedAt,
              observedAt,
              "react-native:animation-frame",
            ));
          }
          return observations;
        }
        case "offline_workout_commit_ms": {
          const observations: Phase18GarminBenchmarkObservation[] = [];
          const { performPhase1Benchmark } = await import("../bootstrap/phase1Benchmark.ts");
          for (let index = 0; index < minimumSamples; index += 1) {
            const result = await performPhase1Benchmark(1);
            const duration = result.durationsMs[0];
            if (duration === undefined) throw new Error("phase18_offline_probe_invalid");
            observations.push(benchmarkObservation(
              duration,
              performance.now(),
              "sqlite:offline-workout-commit",
            ));
          }
          return observations;
        }
      }
    },
  });
}

export type Phase18GarminAcceptanceCaseOutput = Readonly<{
  duration_ms: number;
  source_digest?: string;
  match_digest?: string;
  semantic_state?: string;
}>;

type PassedCase = Readonly<Phase18GarminAcceptanceCaseOutput & {
  id: GarminAcceptanceHostCaseId;
  status: "passed";
}>;

type FailedCase = Readonly<{
  id: GarminAcceptanceHostCaseId;
  status: "failed";
  duration_ms: 0;
  code: "acceptance_case_failed" | "acceptance_case_invalid";
}>;

class InvalidAcceptanceCaseOutput extends Error {}

export function phase18GarminAcceptanceEnabled(input: Readonly<{
  buildProfile?: unknown;
  nativeContractsEnabled?: unknown;
  suite?: unknown;
  confirmation?: unknown;
}>): boolean {
  return input.buildProfile === "development-test"
    && input.nativeContractsEnabled === true
    && input.suite === "phase18-garmin-acceptance"
    && input.confirmation === PHASE18_GARMIN_ACCEPTANCE_CONFIRMATION;
}

export function phase18GarminAcceptanceBenchmarkEnabled(input: Readonly<{
  buildProfile?: unknown;
  nativeContractsEnabled?: unknown;
  suite?: unknown;
  confirmation?: unknown;
  mode?: unknown;
  nonce?: unknown;
}>): input is Readonly<{
  buildProfile: "development-test";
  nativeContractsEnabled: true;
  suite: "phase18-garmin-acceptance";
  confirmation: string;
  mode: "benchmark";
  nonce: string;
}> {
  return phase18GarminAcceptanceEnabled(input)
    && input.mode === "benchmark"
    && typeof input.nonce === "string"
    && BENCHMARK_NONCE.test(input.nonce);
}

function timestampLabel(
  metric: Phase18GarminBenchmarkMetric,
  observedAtMonotonicMs: number,
  index: number,
): string | null {
  const observedAtMonotonicMicros = Math.round(observedAtMonotonicMs * 1_000);
  if (!Number.isSafeInteger(observedAtMonotonicMicros) || observedAtMonotonicMicros < 0) {
    return null;
  }
  return `${metric}:${observedAtMonotonicMicros}:${index + 1}`;
}

export async function createPhase18GarminBenchmarkMarkerReport(input: Readonly<{
  nonce: string;
  measurementPort: Phase18GarminBenchmarkMeasurementPort;
}>) {
  if (!BENCHMARK_NONCE.test(input.nonce)) {
    throw new Error("phase18_garmin_benchmark_marker_invalid");
  }
  if (input.measurementPort.kind !== "installed-observation-port") {
    throw new Error("phase18_garmin_benchmark_producer_invalid");
  }
  const reviewRequired: string[] = [];
  let processId = 0;
  try {
    processId = await input.measurementPort.processId();
  } catch {
    reviewRequired.push("producer:measurement_unavailable");
  }
  if (!Number.isSafeInteger(processId) || processId < 1) {
    processId = 0;
    if (!reviewRequired.includes("producer:measurement_unavailable")) {
      reviewRequired.push("producer:observation_invalid");
    }
  }
  const producerObservationInvalid = processId === 0;

  const measurements = {} as Record<Phase18GarminBenchmarkMetric, readonly number[]>;
  const commands = {} as Record<Phase18GarminBenchmarkMetric, string>;
  const sampleLabels = {} as Record<Phase18GarminBenchmarkMetric, readonly string[]>;
  for (const metric of PHASE18_GARMIN_BENCHMARK_METRICS) {
    const minimumSamples = PHASE18_GARMIN_BENCHMARK_MINIMUM_SAMPLES[metric];
    let observations: readonly Phase18GarminBenchmarkObservation[];
    try {
      observations = await input.measurementPort.observe(metric, minimumSamples);
    } catch {
      measurements[metric] = Object.freeze([]);
      commands[metric] = `review-required:${metric.replaceAll("_", "-")}`;
      sampleLabels[metric] = Object.freeze([]);
      reviewRequired.push(`${metric}:measurement_unavailable`);
      continue;
    }

    const values: number[] = [];
    const labels: string[] = [];
    const timestampKeys: number[] = [];
    const operations = new Set<string>();
    let invalid = !Array.isArray(observations) || observations.length > 120;
    const observationList = Array.isArray(observations) ? observations : [];
    for (const [index, candidate] of observationList.entries()) {
      if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
        invalid = true;
        continue;
      }
      const observation = candidate as Phase18GarminBenchmarkObservation;
      const label = timestampLabel(metric, observation.observed_at_monotonic_ms, index);
      const timestampKey = Math.round(observation.observed_at_monotonic_ms * 1_000);
      if (
        !Number.isFinite(observation.value)
        || observation.value < 0
        || label === null
        || !BENCHMARK_OPERATION.test(observation.operation)
        || NON_OBSERVATION_PRODUCER.test(observation.operation)
      ) {
        invalid = true;
        continue;
      }
      if (timestampKeys.includes(timestampKey)) {
        invalid = true;
        continue;
      }
      if (operations.size === 1 && !operations.has(observation.operation)) {
        invalid = true;
        continue;
      }
      values.push(observation.value);
      labels.push(label);
      timestampKeys.push(timestampKey);
      operations.add(observation.operation);
    }
    if (operations.size !== 1) {
      invalid = true;
    }
    measurements[metric] = Object.freeze(values);
    sampleLabels[metric] = Object.freeze(labels);
    commands[metric] = !invalid && !producerObservationInvalid && operations.size === 1
      ? [...operations][0]!
      : "";
    if (invalid) {
      reviewRequired.push(`${metric}:observation_invalid`);
    } else if (values.length < minimumSamples) {
      reviewRequired.push(`${metric}:minimum_samples_missing`);
    }
  }

  return Object.freeze({
    run_nonce: input.nonce,
    process_id: processId,
    source: "installed-route-log",
    status: reviewRequired.length === 0
      ? "passed" as const
      : "REVIEW_REQUIRED" as const,
    review_required: Object.freeze(reviewRequired),
    measurement_context: Object.freeze({
      profile: "physical-arm64",
      commands: Object.freeze(commands),
      sample_labels: Object.freeze(sampleLabels),
    }),
    measurements: Object.freeze(measurements),
  });
}

function validOutput(value: unknown): Phase18GarminAcceptanceCaseOutput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidAcceptanceCaseOutput();
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !RESULT_KEYS.has(key))) {
    throw new InvalidAcceptanceCaseOutput();
  }
  if (
    !Number.isFinite(record.duration_ms)
    || (record.duration_ms as number) < 0
    || !Number.isInteger(record.duration_ms)
  ) {
    throw new InvalidAcceptanceCaseOutput();
  }
  for (const key of ["source_digest", "match_digest"] as const) {
    const digest = record[key];
    if (digest !== undefined && (typeof digest !== "string" || !HASH.test(digest))) {
      throw new InvalidAcceptanceCaseOutput();
    }
  }
  const semanticState = record.semantic_state;
  if (
    semanticState !== undefined
    && (
      typeof semanticState !== "string"
      || !SAFE_SEMANTIC_STATE.test(semanticState)
      || PRIVATE_TEXT.test(semanticState)
    )
  ) {
    throw new InvalidAcceptanceCaseOutput();
  }
  return Object.freeze({
    duration_ms: record.duration_ms as number,
    ...(record.source_digest === undefined
      ? {}
      : { source_digest: record.source_digest as string }),
    ...(record.match_digest === undefined
      ? {}
      : { match_digest: record.match_digest as string }),
    ...(semanticState === undefined ? {} : { semantic_state: semanticState }),
  });
}

export function createPhase18GarminAcceptanceHarness(input: Readonly<{
  runCase(
    id: GarminAcceptanceHostCaseId,
  ): Promise<Phase18GarminAcceptanceCaseOutput>;
}>) {
  return Object.freeze({
    async run() {
      const cases: (PassedCase | FailedCase)[] = [];
      for (const id of GARMIN_ACCEPTANCE_HOST_CASE_IDS) {
        try {
          const output = validOutput(await input.runCase(id));
          cases.push(Object.freeze({ id, status: "passed", ...output }));
        } catch (error) {
          cases.push(Object.freeze({
            id,
            status: "failed",
            duration_ms: 0,
            code: error instanceof InvalidAcceptanceCaseOutput
              ? "acceptance_case_invalid"
              : "acceptance_case_failed",
          }));
        }
      }
      const passed = cases.filter(({ status }) => status === "passed").length;
      const failed = cases.length - passed;
      return Object.freeze({
        schema_version: 1 as const,
        suite: "phase18-garmin-acceptance" as const,
        status: failed === 0
          ? "host-passed-native-deferred" as const
          : "failed" as const,
        host: Object.freeze({
          expected_count: GARMIN_ACCEPTANCE_HOST_CASE_IDS.length,
          passed,
          failed,
          skipped: 0 as const,
          cases: Object.freeze(cases),
        }),
        native_prerequisites: Object.freeze(
          GARMIN_ACCEPTANCE_NATIVE_PREREQUISITE_IDS.map((id) =>
            Object.freeze({ id, status: "deferred" as const })
          ),
        ),
      });
    },
  });
}
