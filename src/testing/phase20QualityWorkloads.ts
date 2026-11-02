import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";

import type { Phase12BackupBenchmarkResult } from "../bootstrap/phase12BackupBenchmark";
import type { Phase12BackupBenchmarkObserver } from "../bootstrap/phase12BackupBenchmark";
import type { Phase12BackupBenchmarkControls } from "../bootstrap/phase12BackupBenchmark";
import type { Phase20PerformanceOperation } from "./phase20QualityProtocol";
import { phase20QualityDatabaseName } from "./phase20QualityProtocol";
import { canonicalJson } from "../domains/activities/importContracts";
import { executePhase2OrdinaryJsTask } from "../bootstrap/phase2Benchmark";
import { PHASE18_GARMIN_BENCHMARK_MAX_FIXTURE } from "./phase18GarminAcceptance";
import type { Phase20QualityWorkloadProof } from "./phase20QualityWorkload";

const GARMIN_FIXTURE_PROFILE = Object.freeze({
  activity_count: 100,
  lap_count: 10,
  route_point_count: 64,
});

type GarminResult = Readonly<{
  database_name: string;
  normalization_ms: readonly number[];
  normalization_spans?: readonly Readonly<{ start_ms: number; end_ms: number }>[];
  peak_rss_bytes: readonly number[];
  transport: "chaquopy-python-garminconnect-0.3.17";
  fixture_sha256: string;
  payload_sha256: string;
  output_sha256: string;
  runtime_receipt_sha256: string;
  fixture_profile: typeof GARMIN_FIXTURE_PROFILE;
  baseline: Readonly<{
    source: "phase20-current-source-baseline/v1";
    fixture_sha256: string;
    payload_sha256: string;
    output_sha256: string;
    normalization_ms: readonly number[];
    peak_rss_bytes: readonly number[];
  }>;
}>;

type Dependencies = Readonly<{
  phase12(observe: Phase12BackupBenchmarkObserver | undefined, observeDatabaseName: ((databaseName: string) => void) | undefined,
    controls: Phase12BackupBenchmarkControls): Promise<Phase12BackupBenchmarkResult>;
  garmin(nonce: string, controls: Phase20QualityWorkloadControls): Promise<GarminResult>;
}>;

export type Phase20QualityWorkloadControls = Readonly<{
  signal?: Readonly<{ aborted: boolean }>;
  yieldControl?: () => Promise<void>;
}>;

export type Phase20HeavyWorkloadResult = Readonly<{
  operation: "ordinary-js-task" | "phase12-backup" | "garmin-json-normalization";
  producer: "phase20-ordinary-js-source-work/v1" | "phase12-backup-benchmark/v1" | "phase20-garmin-installed-normalization/v1";
  native_execution: "EXECUTED";
  database_name: string;
  command_receipt_sha256: string;
  samples: Readonly<Record<string, unknown>>;
  timings: Readonly<Record<string, readonly Readonly<{ start_ms: number; end_ms: number }>[]>>;
}>;

function finiteSamples(value: unknown, minimum: number): value is readonly number[] {
  return Array.isArray(value) && value.length >= minimum
    && value.every((entry) => Number.isFinite(entry) && entry >= 0);
}
const SHA256 = /^[a-f0-9]{64}$/u;
const ORDINARY_YIELD_INTERVAL = 10;

function assertActive(controls: Phase20QualityWorkloadControls): void {
  if (controls.signal?.aborted === true) throw new Error("phase20_quality_cancelled");
}

async function yieldControl(controls: Phase20QualityWorkloadControls): Promise<void> {
  assertActive(controls);
  await (controls.yieldControl ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0))))();
  assertActive(controls);
}

function validSpans(
  spans: readonly Readonly<{ start_ms: number; end_ms: number }>[],
  values: readonly number[],
): boolean {
  return spans.length === values.length && spans.every((span, index) =>
    Number.isFinite(span.start_ms) && Number.isFinite(span.end_ms)
    && span.end_ms >= span.start_ms
    && Math.abs(span.end_ms - span.start_ms - values[index]!) <= 0.000001);
}

async function receipt(value: unknown): Promise<string> {
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    typeof value === "string" ? value : canonicalJson(value),
  );
}

function maximumGarminFixture() {
  const activities = Array.from({ length: PHASE18_GARMIN_BENCHMARK_MAX_FIXTURE.activity_count }, (_, index) => ({
    activityId: 9_000_000 + index,
    activityTypeDTO: { typeKey: "running" },
    summaryDTO: { startTimeGMT: "2026-01-01T00:00:00.000Z", distance: 5_000, duration: 1_500,
      elapsedDuration: 1_560, movingDuration: 1_475, averageHR: 150 + (index % 5) },
  }));
  return Object.freeze({
    activities,
    activity: activities[0],
    splits: { lapDTOs: PHASE18_GARMIN_BENCHMARK_MAX_FIXTURE.laps },
    details: { metricDescriptors: [], activityDetailMetrics: [], geoPolylineDTO: { polyline: PHASE18_GARMIN_BENCHMARK_MAX_FIXTURE.route } },
  });
}

function validWorkloadProof(value: Readonly<Record<string, unknown>>): value is Phase20QualityWorkloadProof {
  return value.producer === "phase20-quality-workload-proof/v1"
    && value.set_count === 15_000
    && value.correction_count === 200
    && value.plan_count === 3
    && JSON.stringify(value.plan_kinds) === JSON.stringify(["running", "strength"])
    && [value.set_digest_sha256, value.correction_digest_sha256, value.plan_digest_sha256, value.workload_digest_sha256]
      .every((digest) => typeof digest === "string" && SHA256.test(digest));
}

async function productionGarmin(
  nonce: string,
  controls: Phase20QualityWorkloadControls,
): Promise<GarminResult> {
  const garmin = await import("../../modules/garmin-connect/src/index");
  const payloadJson = canonicalJson(maximumGarminFixture());
  const fixtureSha256 = await receipt(payloadJson);
  const baselineNormalizationMs: number[] = [];
  const baselinePeakRssBytes: number[] = [];
  const normalizationMs: number[] = [];
  const normalizationSpans: { start_ms: number; end_ms: number }[] = [];
  const peakRssBytes: number[] = [];
  let payloadSha256 = ""; let outputSha256 = ""; let transport: GarminResult["transport"] | undefined;
  for (let sequence = 1; sequence <= 10; sequence += 1) {
    await yieldControl(controls);
    const startedAt = performance.now();
    assertActive(controls);
    const result = await garmin.benchmarkGarminDeterministicJson(payloadJson);
    assertActive(controls);
    const endedAt = performance.now();
    const runtime = await garmin.readGarminRuntimeInfo();
    if (runtime.benchmark.memoryRssBytes === undefined || result.payloadSha256 !== fixtureSha256
      || await receipt(result.normalizedJson) !== result.outputSha256
      || (payloadSha256 !== "" && payloadSha256 !== result.payloadSha256)
      || (outputSha256 !== "" && outputSha256 !== result.outputSha256)) throw new Error("phase20_quality_garmin_native_result_invalid");
    payloadSha256 = result.payloadSha256; outputSha256 = result.outputSha256; transport = result.transport;
    if (sequence <= 5) {
      baselineNormalizationMs.push(endedAt - startedAt);
      baselinePeakRssBytes.push(runtime.benchmark.memoryRssBytes);
    } else {
      normalizationMs.push(endedAt - startedAt);
      normalizationSpans.push({ start_ms: startedAt, end_ms: endedAt });
      peakRssBytes.push(runtime.benchmark.memoryRssBytes);
    }
  }
  const baseline = Object.freeze({
    source: "phase20-current-source-baseline/v1" as const,
    fixture_sha256: fixtureSha256,
    payload_sha256: payloadSha256,
    output_sha256: outputSha256,
    normalization_ms: Object.freeze(baselineNormalizationMs),
    peak_rss_bytes: Object.freeze(baselinePeakRssBytes),
  });
  return Object.freeze({
    database_name: phase20QualityDatabaseName(nonce, "workout"), normalization_ms: Object.freeze(normalizationMs),
    normalization_spans: Object.freeze(normalizationSpans), peak_rss_bytes: Object.freeze(peakRssBytes),
    transport: transport!, fixture_sha256: fixtureSha256, payload_sha256: payloadSha256,
    fixture_profile: GARMIN_FIXTURE_PROFILE,
    output_sha256: outputSha256, runtime_receipt_sha256: await receipt({ payloadSha256, outputSha256, normalizationSpans, peakRssBytes }), baseline,
  });
}

const productionDependencies: Dependencies = Object.freeze({
  phase12: async (observe, observeDatabaseName, controls) => {
    const { performPhase12BackupBenchmark } = await import("../bootstrap/phase12BackupBenchmark");
    return performPhase12BackupBenchmark(observe, observeDatabaseName, controls);
  },
  garmin: productionGarmin,
});

export async function runPhase20HeavyWorkload(
  operation: Phase20PerformanceOperation,
  dependencies: Dependencies = productionDependencies,
  nonce = "0".repeat(48),
  sourceFacts?: Readonly<Record<string, unknown>>,
  controls: Phase20QualityWorkloadControls = {},
): Promise<Phase20HeavyWorkloadResult | null> {
  assertActive(controls);
  if (operation === "ordinary-js-task") {
    if (sourceFacts === undefined || !validWorkloadProof(sourceFacts)) throw new Error("phase20_quality_source_facts_missing");
    const jsSpans: { start_ms: number; end_ms: number }[] = [];
    const jsTaskMs: number[] = [];
    let checksum = 0;
    for (let sequence = 1; sequence <= 100; sequence += 1) {
      assertActive(controls);
      const start_ms = performance.now();
      checksum ^= executePhase2OrdinaryJsTask(sourceFacts, sequence);
      const end_ms = performance.now();
      jsSpans.push({ start_ms, end_ms });
      jsTaskMs.push(end_ms - start_ms);
      if (sequence % ORDINARY_YIELD_INTERVAL === 0) await yieldControl(controls);
    }
    if (!Number.isSafeInteger(checksum) || !finiteSamples(jsTaskMs, 100) || !validSpans(jsSpans, jsTaskMs)) throw new Error("phase20_quality_ordinary_js_result_invalid");
    const samples = Object.freeze({
      js_task_ms: Object.freeze(jsTaskMs),
      work_units: 100,
      source_facts_sha256: await receipt(sourceFacts),
      workload: sourceFacts,
      checksum,
    });
    return Object.freeze({
      operation,
      producer: "phase20-ordinary-js-source-work/v1",
      native_execution: "EXECUTED",
      database_name: phase20QualityDatabaseName(nonce, "workout"),
      command_receipt_sha256: await receipt(samples),
      samples,
      timings: Object.freeze({ ordinary_js_task_ms: Object.freeze(jsSpans) }),
    });
  }
  if (operation === "phase12-backup") {
    const spans: Record<string, { start_ms: number; end_ms: number }[]> = {
      dirty_trigger_ms: [],
      writer_occupancy_ms: [],
      merge_preflight_ms: [],
      merge_materialization_ms: [],
    };
    let databaseName = "";
    const resolvedControls = Object.freeze({
      ...(controls.signal === undefined ? {} : { signal: controls.signal }),
      yieldControl: controls.yieldControl ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0))),
    });
    const result = await dependencies.phase12((sample) => {
      const key = `${sample.operation.replaceAll("-", "_")}_ms`;
      spans[key]?.push({ start_ms: sample.startMs, end_ms: sample.endMs });
    }, (value) => { databaseName = value; }, resolvedControls);
    assertActive(controls);
    const values = result.measurements;
    if (result.status !== "passed"
      || !finiteSamples(values.dirty_trigger_ms, 1)
      || !finiteSamples(values.writer_occupancy_ms, 1)
      || !finiteSamples(values.merge_preflight_ms, 1)
      || !finiteSamples(values.merge_materialization_ms, 1)
      || !validSpans(spans.dirty_trigger_ms!, values.dirty_trigger_ms)
      || !validSpans(spans.writer_occupancy_ms!, values.writer_occupancy_ms)
      || !validSpans(spans.merge_preflight_ms!, values.merge_preflight_ms)
      || !validSpans(spans.merge_materialization_ms!, values.merge_materialization_ms)
      || !/^gym-tracker-phase12-benchmark-[a-f0-9-]+\.db$/u.test(databaseName)
      || values.merge_output_equivalent !== true
      || values.network_inside_writer !== false) {
      throw new Error("phase20_quality_phase12_result_invalid");
    }
    return Object.freeze({
      operation,
      producer: "phase12-backup-benchmark/v1",
      native_execution: "EXECUTED",
      database_name: databaseName,
      command_receipt_sha256: await receipt(result),
      samples: Object.freeze({
        dirty_trigger_ms: values.dirty_trigger_ms,
        writer_occupancy_ms: values.writer_occupancy_ms,
        merge_preflight_ms: values.merge_preflight_ms,
        merge_materialization_ms: values.merge_materialization_ms,
        snapshot_bytes: values.snapshot_bytes,
        total_rows: values.total_rows,
        sqlite_max_variable_number: values.sqlite_max_variable_number,
      }),
      timings: Object.freeze(Object.fromEntries(
        Object.entries(spans).map(([key, value]) => [key, Object.freeze(value)]),
      )),
    });
  }
  if (operation === "garmin-json-normalization") {
    const result = await dependencies.garmin(nonce, controls);
    assertActive(controls);
    if (!/^gym-tracker-phase20-quality-[a-f0-9]{48}-workout\.db$/u.test(result.database_name)
      || !finiteSamples(result.normalization_ms, 5)
      || !Array.isArray(result.normalization_spans)
      || result.normalization_spans.length !== result.normalization_ms.length
      || !finiteSamples(result.peak_rss_bytes, 5)
      || result.transport !== "chaquopy-python-garminconnect-0.3.17"
      || JSON.stringify(result.fixture_profile) !== JSON.stringify(GARMIN_FIXTURE_PROFILE)
      || ![result.fixture_sha256, result.payload_sha256, result.output_sha256, result.runtime_receipt_sha256,
      ].every((value) => SHA256.test(value))
      || result.baseline.source !== "phase20-current-source-baseline/v1"
      || result.baseline.fixture_sha256 !== result.fixture_sha256
      || result.baseline.payload_sha256 !== result.payload_sha256
      || result.baseline.output_sha256 !== result.output_sha256
      || !finiteSamples(result.baseline.normalization_ms, 5)
      || !finiteSamples(result.baseline.peak_rss_bytes, 5)) {
      throw new Error("phase20_quality_garmin_result_invalid");
    }
    return Object.freeze({
      operation,
      producer: "phase20-garmin-installed-normalization/v1",
      native_execution: "EXECUTED",
      database_name: result.database_name,
      command_receipt_sha256: await receipt(result),
      samples: Object.freeze({
        normalization_ms: result.normalization_ms,
        peak_rss_bytes: result.peak_rss_bytes,
        transport: result.transport,
        fixture_sha256: result.fixture_sha256,
        payload_sha256: result.payload_sha256,
        output_sha256: result.output_sha256,
        runtime_receipt_sha256: result.runtime_receipt_sha256,
        fixture_profile: result.fixture_profile,
        baseline: result.baseline,
      }),
      timings: Object.freeze({
        normalization_ms: Object.freeze(result.normalization_spans),
      }),
    });
  }
  return null;
}
