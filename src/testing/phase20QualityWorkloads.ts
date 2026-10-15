import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";

import type { Phase12BackupBenchmarkResult } from "../bootstrap/phase12BackupBenchmark";
import type { Phase12BackupBenchmarkObserver } from "../bootstrap/phase12BackupBenchmark";
import type { Phase2BenchmarkResult } from "../bootstrap/phase2Benchmark";
import type { Phase20PerformanceOperation } from "./phase20QualityProtocol";

type GarminResult = Readonly<{
  database_name: string;
  normalization_ms: readonly number[];
  normalization_spans?: readonly Readonly<{ start_ms: number; end_ms: number }>[];
  peak_rss_bytes: readonly number[];
}>;

type Dependencies = Readonly<{
  phase2(samples: number, observe?: Parameters<typeof import("../bootstrap/phase2Benchmark").performPhase2Benchmark>[1]): Promise<Phase2BenchmarkResult>;
  phase12(observe?: Phase12BackupBenchmarkObserver, observeDatabaseName?: (databaseName: string) => void): Promise<Phase12BackupBenchmarkResult>;
  garmin(nonce: string): Promise<GarminResult>;
}>;

export type Phase20HeavyWorkloadResult = Readonly<{
  operation: "ordinary-js-task" | "phase12-backup" | "garmin-json-normalization";
  producer: "phase2-benchmark/v1" | "phase12-backup-benchmark/v1" | "phase18-garmin-bounded-sync/v1";
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
  const [{ withPhase18GarminBenchmarkTemporaryDatabase }, garmin] = await Promise.all([
    import("../bootstrap/phase18GarminBenchmarkRuntime"),
    import("../../modules/garmin-connect/src/index"),
  ]);
  return withPhase18GarminBenchmarkTemporaryDatabase({
    nonce: nonce.slice(0, 32),
    sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
    run: async ({ databaseName, runBoundedSync }) => {
      const normalizationMs: number[] = [];
      const normalizationSpans: { start_ms: number; end_ms: number }[] = [];
      const peakRssBytes: number[] = [];
      for (let sequence = 1; sequence <= 5; sequence += 1) {
        const startedAt = performance.now();
        await runBoundedSync(sequence);
        const endedAt = performance.now();
        normalizationMs.push(endedAt - startedAt);
        normalizationSpans.push({ start_ms: startedAt, end_ms: endedAt });
        const runtime = await garmin.readGarminRuntimeInfo();
        if (runtime.benchmark.memoryRssBytes === undefined) {
          throw new Error("phase20_quality_garmin_rss_missing");
        }
        peakRssBytes.push(runtime.benchmark.memoryRssBytes);
      }
      return Object.freeze({
        database_name: databaseName,
        normalization_ms: Object.freeze(normalizationMs),
        normalization_spans: Object.freeze(normalizationSpans),
        peak_rss_bytes: Object.freeze(peakRssBytes),
      });
    },
  });
}

const productionDependencies: Dependencies = Object.freeze({
  phase2: async (samples) => {
    const { performPhase2Benchmark } = await import("../bootstrap/phase2Benchmark");
    return performPhase2Benchmark(samples);
  },
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
): Promise<Phase20HeavyWorkloadResult | null> {
  if (operation === "ordinary-js-task") {
    const jsSpans: { start_ms: number; end_ms: number }[] = [];
    const result = await dependencies.phase2(100, (sample) => {
      if (sample.operation === "ordinary-js-task") {
        jsSpans.push({ start_ms: sample.startMs, end_ms: sample.endMs });
      }
    });
    const search = result.measurements.find(({ id }) => id === "search-page");
    const commit = result.measurements.find(({ id }) => id === "working-set-commit");
    if (result.status !== "passed" || search === undefined || commit === undefined
      || !finiteSamples(search.durationsMs, 100) || !finiteSamples(commit.durationsMs, 100)
      || jsSpans.length !== 100
      || !Number.isFinite(search.maxJsTaskMs) || !Number.isFinite(commit.maxJsTaskMs)) {
      throw new Error("phase20_quality_phase2_result_invalid");
    }
    const samples = Object.freeze({
      search_repository_ms: search.durationsMs,
      working_set_commit_ms: commit.durationsMs,
      js_task_ms: Object.freeze(jsSpans.map(({ start_ms, end_ms }) => end_ms - start_ms)),
      js_task_maxima_ms: Object.freeze([search.maxJsTaskMs, commit.maxJsTaskMs]),
    });
    return Object.freeze({
      operation,
      producer: "phase2-benchmark/v1",
      native_execution: "EXECUTED",
      database_name: "gym-tracker-phase2-benchmark.db",
      command_receipt_sha256: await receipt(result),
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
    if (!/^gym-tracker-phase18-garmin-benchmark-[a-f0-9]{32}\.db$/u.test(result.database_name)
      || !finiteSamples(result.normalization_ms, 5)
      || !Array.isArray(result.normalization_spans)
      || result.normalization_spans.length !== result.normalization_ms.length
      || !finiteSamples(result.peak_rss_bytes, 5)) {
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
      }),
      timings: Object.freeze({
        normalization_ms: Object.freeze(result.normalization_spans),
      }),
    });
  }
  return null;
}
