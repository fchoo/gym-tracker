import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";

import type { Phase12BackupBenchmarkResult } from "../bootstrap/phase12BackupBenchmark";
import type { Phase2BenchmarkResult } from "../bootstrap/phase2Benchmark";
import type { Phase20PerformanceOperation } from "./phase20QualityProtocol";

type GarminResult = Readonly<{
  database_name: string;
  normalization_ms: readonly number[];
  peak_rss_bytes: readonly number[];
}>;

type Dependencies = Readonly<{
  phase2(samples: number): Promise<Phase2BenchmarkResult>;
  phase12(): Promise<Phase12BackupBenchmarkResult>;
  garmin(nonce: string): Promise<GarminResult>;
}>;

export type Phase20HeavyWorkloadResult = Readonly<{
  operation: "ordinary-js-task" | "phase12-backup" | "garmin-json-normalization";
  producer: "phase2-benchmark/v1" | "phase12-backup-benchmark/v1" | "phase18-garmin-bounded-sync/v1";
  native_execution: "EXECUTED";
  database_name: string;
  command_receipt_sha256: string;
  samples: Readonly<Record<string, unknown>>;
}>;

function finiteSamples(value: unknown, minimum: number): value is readonly number[] {
  return Array.isArray(value) && value.length >= minimum
    && value.every((entry) => Number.isFinite(entry) && entry >= 0);
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
      const peakRssBytes: number[] = [];
      for (let sequence = 1; sequence <= 5; sequence += 1) {
        const startedAt = performance.now();
        await runBoundedSync(sequence);
        normalizationMs.push(performance.now() - startedAt);
        const runtime = await garmin.readGarminRuntimeInfo();
        if (runtime.benchmark.memoryRssBytes === undefined) {
          throw new Error("phase20_quality_garmin_rss_missing");
        }
        peakRssBytes.push(runtime.benchmark.memoryRssBytes);
      }
      return Object.freeze({
        database_name: databaseName,
        normalization_ms: Object.freeze(normalizationMs),
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
    const result = await dependencies.phase2(100);
    const search = result.measurements.find(({ id }) => id === "search-page");
    const commit = result.measurements.find(({ id }) => id === "working-set-commit");
    if (result.status !== "passed" || search === undefined || commit === undefined
      || !finiteSamples(search.durationsMs, 100) || !finiteSamples(commit.durationsMs, 100)
      || !Number.isFinite(search.maxJsTaskMs) || !Number.isFinite(commit.maxJsTaskMs)) {
      throw new Error("phase20_quality_phase2_result_invalid");
    }
    const samples = Object.freeze({
      search_repository_ms: search.durationsMs,
      working_set_commit_ms: commit.durationsMs,
      js_task_ms: commit.durationsMs,
      js_task_maxima_ms: Object.freeze([search.maxJsTaskMs, commit.maxJsTaskMs]),
    });
    return Object.freeze({
      operation,
      producer: "phase2-benchmark/v1",
      native_execution: "EXECUTED",
      database_name: "gym-tracker-phase2-benchmark.db",
      command_receipt_sha256: await receipt(result),
      samples,
    });
  }
  if (operation === "phase12-backup") {
    const result = await dependencies.phase12();
    const values = result.measurements;
    if (result.status !== "passed"
      || !finiteSamples(values.dirty_trigger_ms, 1)
      || !finiteSamples(values.writer_occupancy_ms, 1)
      || !finiteSamples(values.merge_preflight_ms, 1)
      || !finiteSamples(values.merge_materialization_ms, 1)
      || values.merge_output_equivalent !== true
      || values.network_inside_writer !== false) {
      throw new Error("phase20_quality_phase12_result_invalid");
    }
    return Object.freeze({
      operation,
      producer: "phase12-backup-benchmark/v1",
      native_execution: "EXECUTED",
      database_name: "gym-tracker-phase12-benchmark-isolated.db",
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
    });
  }
  if (operation === "garmin-json-normalization") {
    const result = await dependencies.garmin(nonce);
    if (!/^gym-tracker-phase18-garmin-benchmark-[a-f0-9]{32}\.db$/u.test(result.database_name)
      || !finiteSamples(result.normalization_ms, 5)
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
    });
  }
  return null;
}
