import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import garminBaselineAsset from "../../artifacts/review/phase18/garmin-normalization-baseline.json";
import garminFixtureAsset from "../../artifacts/review/phase18/garmin-normalization-input.json";

import type { Phase12BackupBenchmarkResult } from "../bootstrap/phase12BackupBenchmark";
import type { Phase12BackupBenchmarkObserver } from "../bootstrap/phase12BackupBenchmark";
import type { Phase20PerformanceOperation } from "./phase20QualityProtocol";
import { phase20QualityDatabaseName } from "./phase20QualityProtocol";
import { canonicalJson } from "../domains/activities/importContracts";
import { executePhase2OrdinaryJsTask } from "../bootstrap/phase2Benchmark";

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
  baseline: Readonly<{
    source: "phase18-pinned-artifact/v1";
    phase18_source_tree_sha256: string;
    artifact_sha256: string;
    fixture_sha256: string;
    normalization_ms: readonly number[];
    peak_rss_bytes: readonly number[];
  }>;
}>;

type Dependencies = Readonly<{
  phase12(observe?: Phase12BackupBenchmarkObserver, observeDatabaseName?: (databaseName: string) => void): Promise<Phase12BackupBenchmarkResult>;
  garmin(nonce: string): Promise<GarminResult>;
}>;

export type Phase20HeavyWorkloadResult = Readonly<{
  operation: "ordinary-js-task" | "phase12-backup" | "garmin-json-normalization";
  producer: "phase20-ordinary-js-source-work/v1" | "phase12-backup-benchmark/v1" | "phase18-garmin-bounded-sync/v1";
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
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(value));
}

async function productionGarmin(nonce: string): Promise<GarminResult> {
  const garmin = await import("../../modules/garmin-connect/src/index");
  const payloadJson = canonicalJson(garminFixtureAsset);
  const fixtureSha256 = await receipt(payloadJson);
  const normalizationMs: number[] = [];
  const normalizationSpans: { start_ms: number; end_ms: number }[] = [];
  const peakRssBytes: number[] = [];
  let payloadSha256 = ""; let outputSha256 = ""; let transport: GarminResult["transport"] | undefined;
  for (let sequence = 1; sequence <= 5; sequence += 1) {
    const startedAt = performance.now();
    const result = await garmin.benchmarkGarminDeterministicJson(payloadJson);
    const endedAt = performance.now();
    const runtime = await garmin.readGarminRuntimeInfo();
    if (runtime.benchmark.memoryRssBytes === undefined || result.payloadSha256 !== fixtureSha256
      || await receipt(result.normalizedJson) !== result.outputSha256
      || (payloadSha256 !== "" && payloadSha256 !== result.payloadSha256)
      || (outputSha256 !== "" && outputSha256 !== result.outputSha256)) throw new Error("phase20_quality_garmin_native_result_invalid");
    payloadSha256 = result.payloadSha256; outputSha256 = result.outputSha256; transport = result.transport;
    normalizationMs.push(endedAt - startedAt); normalizationSpans.push({ start_ms: startedAt, end_ms: endedAt });
    peakRssBytes.push(runtime.benchmark.memoryRssBytes);
  }
  const baseline = Object.freeze({
    source: "phase18-pinned-artifact/v1" as const,
    phase18_source_tree_sha256: await receipt(garminBaselineAsset.phase18_source_head),
    artifact_sha256: await receipt(canonicalJson(garminBaselineAsset)),
    fixture_sha256: fixtureSha256,
    normalization_ms: Object.freeze([...garminBaselineAsset.normalization_ms]),
    peak_rss_bytes: Object.freeze([...garminBaselineAsset.peak_rss_bytes]),
  });
  return Object.freeze({
    database_name: phase20QualityDatabaseName(nonce, "workout"), normalization_ms: Object.freeze(normalizationMs),
    normalization_spans: Object.freeze(normalizationSpans), peak_rss_bytes: Object.freeze(peakRssBytes),
    transport: transport!, fixture_sha256: fixtureSha256, payload_sha256: payloadSha256,
    output_sha256: outputSha256, runtime_receipt_sha256: await receipt({ payloadSha256, outputSha256, normalizationSpans, peakRssBytes }), baseline,
  });
}

const productionDependencies: Dependencies = Object.freeze({
  phase12: async () => {
    const { performPhase12BackupBenchmark } = await import("../bootstrap/phase12BackupBenchmark");
    return performPhase12BackupBenchmark();
  },
  garmin: productionGarmin,
});

export async function runPhase20HeavyWorkload(
  operation: Phase20PerformanceOperation,
  dependencies: Dependencies = productionDependencies,
  nonce = "0".repeat(48),
  sourceFacts?: Readonly<Record<string, unknown>>,
): Promise<Phase20HeavyWorkloadResult | null> {
  if (operation === "ordinary-js-task") {
    if (sourceFacts === undefined) throw new Error("phase20_quality_source_facts_missing");
    const jsSpans: { start_ms: number; end_ms: number }[] = [];
    const jsTaskMs: number[] = [];
    let checksum = 0;
    for (let sequence = 1; sequence <= 100; sequence += 1) {
      const start_ms = performance.now();
      checksum ^= executePhase2OrdinaryJsTask(sourceFacts, sequence);
      const end_ms = performance.now();
      jsSpans.push({ start_ms, end_ms });
      jsTaskMs.push(end_ms - start_ms);
    }
    if (!Number.isSafeInteger(checksum) || !finiteSamples(jsTaskMs, 100) || !validSpans(jsSpans, jsTaskMs)) throw new Error("phase20_quality_ordinary_js_result_invalid");
    const samples = Object.freeze({
      js_task_ms: Object.freeze(jsTaskMs),
      work_units: 100,
      source_facts_sha256: await receipt(sourceFacts),
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
    const result = await dependencies.phase12((sample) => {
      const key = `${sample.operation.replaceAll("-", "_")}_ms`;
      spans[key]?.push({ start_ms: sample.startMs, end_ms: sample.endMs });
    }, (value) => { databaseName = value; });
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
    const result = await dependencies.garmin(nonce);
    if (!/^gym-tracker-phase20-quality-[a-f0-9]{48}-workout\.db$/u.test(result.database_name)
      || !finiteSamples(result.normalization_ms, 5)
      || !Array.isArray(result.normalization_spans)
      || result.normalization_spans.length !== result.normalization_ms.length
      || !finiteSamples(result.peak_rss_bytes, 5)
      || result.transport !== "chaquopy-python-garminconnect-0.3.17"
      || ![result.fixture_sha256, result.payload_sha256, result.output_sha256, result.runtime_receipt_sha256,
        result.baseline.phase18_source_tree_sha256, result.baseline.artifact_sha256].every((value) => SHA256.test(value))
      || result.baseline.source !== "phase18-pinned-artifact/v1"
      || result.baseline.fixture_sha256 !== result.fixture_sha256
      || JSON.stringify(result.baseline.normalization_ms) === JSON.stringify(result.normalization_ms)
      || JSON.stringify(result.baseline.peak_rss_bytes) === JSON.stringify(result.peak_rss_bytes)) {
      throw new Error("phase20_quality_garmin_result_invalid");
    }
    return Object.freeze({
      operation,
      producer: "phase18-garmin-bounded-sync/v1",
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
        baseline: result.baseline,
      }),
      timings: Object.freeze({
        normalization_ms: Object.freeze(result.normalization_spans),
      }),
    });
  }
  return null;
}
