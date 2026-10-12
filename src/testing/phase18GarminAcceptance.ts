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
  process_id: number;
  sequence: number;
}>;

export type Phase18GarminColdStartHandshake = Readonly<{
  sequence: number;
  prior_samples: readonly Phase18GarminBenchmarkObservation[];
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
) => Promise<Pick<
  Phase18GarminBenchmarkObservation,
  "value" | "observed_at_monotonic_ms"
>>;

const COLD_START_OPERATION = "native-runtime:python-cold-start";

function validObservationIdentity(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function validColdStartSample(
  value: unknown,
  expectedSequence: number,
): value is Phase18GarminBenchmarkObservation {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const sample = value as Record<string, unknown>;
  return Object.keys(sample).length === 5
    && Object.keys(sample).every((key) => [
      "value",
      "observed_at_monotonic_ms",
      "operation",
      "process_id",
      "sequence",
    ].includes(key))
    && Number.isFinite(sample.value)
    && (sample.value as number) >= 0
    && Number.isFinite(sample.observed_at_monotonic_ms)
    && (sample.observed_at_monotonic_ms as number) >= 0
    && sample.operation === COLD_START_OPERATION
    && validObservationIdentity(sample.process_id)
    && sample.sequence === expectedSequence;
}

export function parsePhase18GarminColdStartHandshake(input: Readonly<{
  sequence?: unknown;
  samples?: unknown;
}>): Phase18GarminColdStartHandshake | null {
  if (input.sequence === undefined && input.samples === undefined) {
    return Object.freeze({ sequence: 1, prior_samples: Object.freeze([]) });
  }
  const sequence = typeof input.sequence === "string" && /^[1-5]$/u.test(input.sequence)
    ? Number(input.sequence)
    : null;
  if (sequence === null || (sequence === 1 && input.samples === undefined)) {
    return sequence === 1
      ? Object.freeze({ sequence, prior_samples: Object.freeze([]) })
      : null;
  }
  if (typeof input.samples !== "string" || input.samples.length > 2_048) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.samples);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== sequence - 1) return null;
  const samples = parsed.filter((sample, index) => validColdStartSample(sample, index + 1));
  if (samples.length !== parsed.length
    || new Set(samples.map(({ process_id }) => process_id)).size !== samples.length) {
    return null;
  }
  return Object.freeze({
    sequence,
    prior_samples: Object.freeze(samples),
  });
}

function benchmarkObservation(
  value: number,
  observedAtMonotonicMs: number,
  operation: string,
  processId: number,
  sequence: number,
): Phase18GarminBenchmarkObservation {
  return Object.freeze({
    value,
    observed_at_monotonic_ms: observedAtMonotonicMs,
    operation,
    process_id: processId,
    sequence,
  });
}

export function createInstalledPhase18GarminBenchmarkMeasurementPort(
  renderProbe: Phase18GarminBenchmarkRenderProbe,
  coldStartHandshake: Phase18GarminColdStartHandshake = Object.freeze({
    sequence: 1,
    prior_samples: Object.freeze([]),
  }),
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
    sequence: number,
  ) => benchmarkObservation(
    value,
    sample.benchmark.observedAtMonotonicMs,
    operationName,
    sample.benchmark.processId,
    sequence,
  );
  const observeRuntimeSamples = async (
    minimumSamples: number,
    projectSample: (
      sample: GarminRuntimeInfo,
      sequence: number,
    ) => Phase18GarminBenchmarkObservation | null,
  ) => {
    const selected = () => runtimeSamples
      .map((sample, index) => projectSample(sample, index + 1))
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
    const processId = (await firstRuntime()).benchmark.processId;
    const observations: Phase18GarminBenchmarkObservation[] = [];
    for (let index = 0; index < minimumSamples; index += 1) {
      const startedAt = performance.now();
      await performOperation();
      const observedAt = performance.now();
      observations.push(benchmarkObservation(
        observedAt - startedAt,
        observedAt,
        operationName,
        processId,
        index + 1,
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
            1,
          )];
        }
        case "garmin_module_size_bytes": {
          const sample = await firstRuntime();
          return [nativeObservation(
            sample,
            sample.benchmark.garminModuleSizeBytes,
            "native-runtime:garmin-module-size",
            1,
          )];
        }
        case "python_cold_start_ms": {
          const sample = await firstRuntime();
          return Object.freeze([
            ...coldStartHandshake.prior_samples,
            ...(sample.benchmark.pythonStartupKind === "cold"
              ? [nativeObservation(
                sample,
                sample.benchmark.pythonStartupDurationMs,
                COLD_START_OPERATION,
                coldStartHandshake.sequence,
              )]
              : []),
          ]);
        }
        case "python_warm_start_ms":
          return observeRuntimeSamples(minimumSamples, (sample, sequence) => (
            sample.benchmark.pythonStartupKind === "warm"
              ? nativeObservation(
                sample,
                sample.benchmark.pythonStartupDurationMs,
                "native-runtime:python-warm-start",
                sequence,
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
          const processId = (await firstRuntime()).benchmark.processId;
          const observations: Phase18GarminBenchmarkObservation[] = [];
          for (let index = 0; index < minimumSamples; index += 1) {
            const rendered = await renderProbe("route");
            observations.push(benchmarkObservation(
              rendered.value,
              rendered.observed_at_monotonic_ms,
              "react-native-layout:route",
              processId,
              index + 1,
            ));
          }
          return observations;
        }
        case "lap_render_ms": {
          const processId = (await firstRuntime()).benchmark.processId;
          const observations: Phase18GarminBenchmarkObservation[] = [];
          for (let index = 0; index < minimumSamples; index += 1) {
            const rendered = await renderProbe("laps");
            observations.push(benchmarkObservation(
              rendered.value,
              rendered.observed_at_monotonic_ms,
              "react-native-layout:laps",
              processId,
              index + 1,
            ));
          }
          return observations;
        }
        case "memory_rss_bytes":
          return observeRuntimeSamples(minimumSamples, (sample, sequence) => (
            sample.benchmark.memoryRssBytes === undefined
              ? null
              : nativeObservation(
                sample,
                sample.benchmark.memoryRssBytes,
                "native-runtime:memory-rss",
                sequence,
              )
          ));
        case "js_task_ms": {
          const processId = (await firstRuntime()).benchmark.processId;
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
              processId,
              index + 1,
            ));
          }
          if (!Number.isSafeInteger(checksum)) throw new Error("phase18_js_probe_invalid");
          return observations;
        }
        case "frame_time_ms": {
          const processId = (await firstRuntime()).benchmark.processId;
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
              processId,
              index + 1,
            ));
          }
          return observations;
        }
        case "offline_workout_commit_ms": {
          const processId = (await firstRuntime()).benchmark.processId;
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
              processId,
              index + 1,
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
  observation: Phase18GarminBenchmarkObservation,
): string | null {
  const observedAtMonotonicMicros = Math.round(observation.observed_at_monotonic_ms * 1_000);
  if (!Number.isSafeInteger(observedAtMonotonicMicros) || observedAtMonotonicMicros < 0) {
    return null;
  }
  return `p${observation.process_id}:s${observation.sequence}:t${observedAtMonotonicMicros}`;
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

  const measurements = Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, Object.freeze([])])) as unknown as Record<Phase18GarminBenchmarkMetric, readonly number[]>;
  const commands = Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, `review-required:${metric.replaceAll("_", "-")}`])) as Record<Phase18GarminBenchmarkMetric, string>;
  const sampleLabels = Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, Object.freeze([])])) as unknown as Record<Phase18GarminBenchmarkMetric, readonly string[]>;
  let coldStartSamples: readonly Phase18GarminBenchmarkObservation[] = Object.freeze([]);
  const collectMetric = async (metric: Phase18GarminBenchmarkMetric): Promise<boolean> => {
    const minimumSamples = PHASE18_GARMIN_BENCHMARK_MINIMUM_SAMPLES[metric];
    let observations: readonly Phase18GarminBenchmarkObservation[];
    try {
      observations = await input.measurementPort.observe(metric, minimumSamples);
    } catch {
      measurements[metric] = Object.freeze([]);
      commands[metric] = `review-required:${metric.replaceAll("_", "-")}`;
      sampleLabels[metric] = Object.freeze([]);
      reviewRequired.push(`${metric}:measurement_unavailable`);
      return false;
    }

    const values: number[] = [];
    const labels: string[] = [];
    const observationKeys = new Set<string>();
    const timestampKeys = new Set<number>();
    const operations = new Set<string>();
    let invalid = !Array.isArray(observations) || observations.length > 120;
    const observationList = Array.isArray(observations) ? observations : [];
    for (const [index, candidate] of observationList.entries()) {
      if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
        invalid = true;
        continue;
      }
      const observation = candidate as Phase18GarminBenchmarkObservation;
      const label = timestampLabel(observation);
      const timestampKey = Math.round(observation.observed_at_monotonic_ms * 1_000);
      const observationKey = `${observation.process_id}:${observation.sequence}:${timestampKey}`;
      if (
        !Number.isFinite(observation.value)
        || observation.value < 0
        || label === null
        || !BENCHMARK_OPERATION.test(observation.operation)
        || NON_OBSERVATION_PRODUCER.test(observation.operation)
        || !validObservationIdentity(observation.process_id)
        || !validObservationIdentity(observation.sequence)
        || observation.sequence !== index + 1
        || (metric !== "python_cold_start_ms" && observation.process_id !== processId)
      ) {
        invalid = true;
        continue;
      }
      if (observationKeys.has(observationKey)) {
        invalid = true;
        continue;
      }
      if (metric !== "python_cold_start_ms" && timestampKeys.has(timestampKey)) {
        invalid = true;
        continue;
      }
      if (operations.size === 1 && !operations.has(observation.operation)) {
        invalid = true;
        continue;
      }
      values.push(observation.value);
      labels.push(label);
      observationKeys.add(observationKey);
      timestampKeys.add(timestampKey);
      operations.add(observation.operation);
    }
    if (metric === "python_cold_start_ms") {
      const processIds = observationList.map((observation) => observation.process_id);
      if (new Set(processIds).size !== processIds.length
        || (observationList.length > 0 && observationList.at(-1)?.process_id !== processId)) {
        invalid = true;
      }
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
    if (metric === "python_cold_start_ms" && !invalid) {
      coldStartSamples = Object.freeze([...observationList]);
    }
    return !invalid && values.length >= minimumSamples;
  };

  const coldStartReady = await collectMetric("python_cold_start_ms");
  if (coldStartReady) {
    for (const metric of PHASE18_GARMIN_BENCHMARK_METRICS) {
      if (metric !== "python_cold_start_ms") await collectMetric(metric);
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
    cold_start_handshake: Object.freeze({
      next_sequence: coldStartSamples.length >= PHASE18_GARMIN_BENCHMARK_MINIMUM_SAMPLES.python_cold_start_ms
        ? null
        : coldStartSamples.length + 1,
      samples: coldStartSamples,
    }),
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
