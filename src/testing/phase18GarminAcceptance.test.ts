import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

import {
  PHASE18_GARMIN_ACCEPTANCE_CONFIRMATION,
  PHASE18_GARMIN_BENCHMARK_METRICS,
  PHASE18_GARMIN_BENCHMARK_MINIMUM_SAMPLES,
  PHASE18_GARMIN_BENCHMARK_MARKER,
  createPhase18GarminBenchmarkMarkerReport,
  createPhase18GarminAcceptanceHarness,
  phase18GarminAcceptanceBenchmarkEnabled,
  phase18GarminAcceptanceEnabled,
  type Phase18GarminBenchmarkMeasurementPort,
} from "./phase18GarminAcceptance";
import {
  GARMIN_ACCEPTANCE_HOST_CASE_IDS,
  GARMIN_ACCEPTANCE_NATIVE_PREREQUISITE_IDS,
} from "./contracts/garminImport.contract";

const HASH = "a".repeat(64);

const OPERATION_BY_METRIC = Object.freeze({
  apk_size_bytes: "native-runtime:apk-size",
  garmin_module_size_bytes: "native-runtime:garmin-module-size",
  python_cold_start_ms: "native-runtime:python-cold-start",
  python_warm_start_ms: "native-runtime:python-warm-start",
  bounded_sync_ms: "native-garmin:bounded-sync",
  route_render_ms: "react-native-layout:route",
  lap_render_ms: "react-native-layout:laps",
  memory_rss_bytes: "native-runtime:memory-rss",
  js_task_ms: "react-native:bounded-js-task",
  frame_time_ms: "react-native:animation-frame",
  offline_workout_commit_ms: "sqlite:offline-workout-commit",
} as const);

function observationPort(
  override: Partial<Phase18GarminBenchmarkMeasurementPort> = {},
): Phase18GarminBenchmarkMeasurementPort {
  return {
    kind: "installed-observation-port",
    processId: async () => 123,
    observe: async (metric, minimumSamples) => Array.from(
      { length: minimumSamples },
      (_, index) => ({
        value: index + 1,
        observed_at_monotonic_ms: 10_000 + (index * 2) + PHASE18_GARMIN_BENCHMARK_METRICS.indexOf(metric) / 10,
        operation: OPERATION_BY_METRIC[metric],
      }),
    ),
    ...override,
  };
}

describe("Phase 18 deterministic acceptance harness", () => {
  it("opens only for the exact non-production profile, suite, and confirmation", () => {
    const exact = {
      buildProfile: "development-test",
      nativeContractsEnabled: true,
      suite: "phase18-garmin-acceptance",
      confirmation: PHASE18_GARMIN_ACCEPTANCE_CONFIRMATION,
    };
    expect(phase18GarminAcceptanceEnabled(exact)).toBe(true);
    for (const rejected of [
      { ...exact, buildProfile: "production" },
      { ...exact, buildProfile: "preview" },
      { ...exact, nativeContractsEnabled: false },
      { ...exact, suite: "phase18-garmin-proof" },
      { ...exact, confirmation: "wrong" },
      { ...exact, confirmation: undefined },
    ]) {
      expect(phase18GarminAcceptanceEnabled(rejected)).toBe(false);
    }
  });

  it("opens benchmark mode only for the guarded benchmark nonce path", async () => {
    const exact = {
      buildProfile: "development-test",
      nativeContractsEnabled: true,
      suite: "phase18-garmin-acceptance",
      confirmation: PHASE18_GARMIN_ACCEPTANCE_CONFIRMATION,
      mode: "benchmark",
      nonce: "a".repeat(32),
    };
    expect(phase18GarminAcceptanceBenchmarkEnabled(exact)).toBe(true);
    for (const rejected of [
      { ...exact, mode: "view" },
      { ...exact, nonce: "short" },
      { ...exact, confirmation: "wrong" },
    ]) {
      expect(phase18GarminAcceptanceBenchmarkEnabled(rejected)).toBe(false);
    }
    await expect(createPhase18GarminBenchmarkMarkerReport({
      nonce: "a".repeat(32),
      measurementPort: observationPort(),
    })).resolves.toEqual(expect.objectContaining({
      run_nonce: "a".repeat(32),
      process_id: 123,
      source: "installed-route-log",
      status: "passed",
    }));
  });

  it("builds minimum counts only from distinct timestamped raw observations", async () => {
    const report = await createPhase18GarminBenchmarkMarkerReport({
      nonce: "b".repeat(32),
      measurementPort: observationPort(),
    });

    expect(report.status).toBe("passed");
    expect(report.review_required).toEqual([]);
    for (const metric of PHASE18_GARMIN_BENCHMARK_METRICS) {
      const minimum = PHASE18_GARMIN_BENCHMARK_MINIMUM_SAMPLES[metric];
      expect(report.measurements[metric]).toHaveLength(minimum);
      expect(report.measurement_context.sample_labels[metric]).toHaveLength(minimum);
      expect(new Set(report.measurement_context.sample_labels[metric]).size).toBe(minimum);
      expect(report.measurement_context.commands[metric]).toBe(OPERATION_BY_METRIC[metric]);
    }
  });

  it("fails closed for unavailable metrics and duplicate observation timestamps", async () => {
    const report = await createPhase18GarminBenchmarkMarkerReport({
      nonce: "c".repeat(32),
      measurementPort: observationPort({
        observe: async (metric, minimumSamples) => {
          if (metric === "bounded_sync_ms") throw new Error("provider payload");
          return Array.from({ length: minimumSamples }, (_, index) => ({
            value: index + 1,
            observed_at_monotonic_ms: metric === "frame_time_ms" ? 20_000 : 20_000 + index,
            operation: OPERATION_BY_METRIC[metric],
          }));
        },
      }),
    });

    expect(report.status).toBe("REVIEW_REQUIRED");
    expect(report.review_required).toEqual([
      "bounded_sync_ms:measurement_unavailable",
      "frame_time_ms:observation_invalid",
    ]);
    expect(report.measurements.bounded_sync_ms).toEqual([]);
    expect(report.measurements.frame_time_ms).toHaveLength(1);
    expect(JSON.stringify(report)).not.toContain("provider payload");
  });

  it("rejects demo or constant producers instead of relabeling them installed", async () => {
    await expect(createPhase18GarminBenchmarkMarkerReport({
      nonce: "d".repeat(32),
      measurementPort: {
        ...observationPort(),
        kind: "demo-constant-port",
      } as unknown as Phase18GarminBenchmarkMeasurementPort,
    })).rejects.toThrow("phase18_garmin_benchmark_producer_invalid");

    const report = await createPhase18GarminBenchmarkMarkerReport({
      nonce: "e".repeat(32),
      measurementPort: observationPort({
        observe: async (metric, minimumSamples) => Array.from(
          { length: minimumSamples },
          (_, index) => ({
            value: 1,
            observed_at_monotonic_ms: 30_000 + index,
            operation: `constant:${metric}`,
          }),
        ),
      }),
    });
    expect(report.status).toBe("REVIEW_REQUIRED");
    expect(report.review_required).toContain("apk_size_bytes:observation_invalid");
  });

  it("runs every host case in ledger order and leaves native proof explicitly deferred", async () => {
    const calls: string[] = [];
    const harness = createPhase18GarminAcceptanceHarness({
      runCase: async (id) => {
        calls.push(id);
        return {
          duration_ms: 2,
          source_digest: HASH,
          match_digest: HASH,
          semantic_state: "ready",
        };
      },
    });

    const result = await harness.run();

    expect(calls).toEqual(GARMIN_ACCEPTANCE_HOST_CASE_IDS);
    expect(result).toEqual({
      schema_version: 1,
      suite: "phase18-garmin-acceptance",
      status: "host-passed-native-deferred",
      host: {
        expected_count: GARMIN_ACCEPTANCE_HOST_CASE_IDS.length,
        passed: GARMIN_ACCEPTANCE_HOST_CASE_IDS.length,
        failed: 0,
        skipped: 0,
        cases: GARMIN_ACCEPTANCE_HOST_CASE_IDS.map((id) => ({
          id,
          status: "passed",
          duration_ms: 2,
          source_digest: HASH,
          match_digest: HASH,
          semantic_state: "ready",
        })),
      },
      native_prerequisites: GARMIN_ACCEPTANCE_NATIVE_PREREQUISITE_IDS.map((id) => ({
        id,
        status: "deferred",
      })),
    });
  });

  it("fails closed without skipping later host cases or upgrading native prerequisites", async () => {
    const failedId = GARMIN_ACCEPTANCE_HOST_CASE_IDS[2]!;
    const result = await createPhase18GarminAcceptanceHarness({
      runCase: async (id) => {
        if (id === failedId) throw new Error("private provider payload");
        return { duration_ms: 1, semantic_state: "ready" };
      },
    }).run();

    expect(result.status).toBe("failed");
    expect(result.host.cases).toHaveLength(GARMIN_ACCEPTANCE_HOST_CASE_IDS.length);
    expect(result.host.skipped).toBe(0);
    expect(result.host.cases.find(({ id }) => id === failedId)).toEqual({
      id: failedId,
      status: "failed",
      duration_ms: 0,
      code: "acceptance_case_failed",
    });
    expect(JSON.stringify(result)).not.toMatch(/private provider payload/iu);
    expect(result.native_prerequisites.every(({ status }) => status === "deferred")).toBe(true);
  });

  it("rejects non-finite timings, malformed digests, private semantic text, and unknown result fields", async () => {
    for (const invalid of [
      { duration_ms: Number.NaN, semantic_state: "ready" },
      { duration_ms: 1, source_digest: "wrong", semantic_state: "ready" },
      { duration_ms: 1, semantic_state: "owner@example.invalid" },
      { duration_ms: 1, semantic_state: "ready", raw_json: {} },
    ]) {
      const result = await createPhase18GarminAcceptanceHarness({
        runCase: async () => invalid as never,
      }).run();
      expect(result.status).toBe("failed");
      expect(result.host.cases[0]).toEqual(expect.objectContaining({
        status: "failed",
        code: "acceptance_case_invalid",
      }));
    }
  });

  it("keeps the route source-owned, guarded, observed, and free of proof relabeling", () => {
    const route = readFileSync("app/__phase18-garmin-acceptance.tsx", "utf8");
    const producer = readFileSync("src/testing/phase18GarminAcceptance.ts", "utf8");
    const installedProducer = `${route}\n${producer}`;
    expect(route).toContain("phase18GarminAcceptanceEnabled");
    expect(route).toContain("phase18GarminAcceptanceBenchmarkEnabled");
    expect(route).toContain("createPhase18GarminBenchmarkMarkerReport");
    expect(route).toContain("PHASE18_GARMIN_BENCHMARK_MARKER");
    expect(installedProducer).toContain("performance.now");
    expect(installedProducer).toContain("requestAnimationFrame");
    expect(installedProducer).toContain("readGarminRuntimeInfo");
    expect(installedProducer).toContain("forceRefreshForTest");
    expect(installedProducer).toContain("performPhase1Benchmark");
    expect(route).toContain("synthetic-redacted-only");
    expect(route).toContain("host-passed-native-deferred");
    expect(route).not.toMatch(/status:\s*["']passed["']/u);
    expect(route).not.toMatch(/private-account|owner@|123456789/u);
    expect(producer).not.toContain("apk_size_bytes: [1]");
    expect(producer).not.toContain("installed:${metric}");
  });

  it("sources process, artifact, Python, and memory facts from native runtime identity", () => {
    const bridge = readFileSync("modules/garmin-connect/src/index.ts", "utf8");
    const native = readFileSync(
      "modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminConnectModule.kt",
      "utf8",
    );

    for (const field of [
      "processId",
      "installedApkSizeBytes",
      "garminModuleSizeBytes",
      "memoryRssBytes",
      "pythonStartupKind",
      "pythonStartupDurationMs",
      "observedAtMonotonicMs",
    ]) {
      expect(bridge).toContain(field);
      expect(native).toContain(field);
    }
    expect(native).toContain("SystemClock.elapsedRealtimeNanos");
    expect(native).toContain("/proc/self/status");
    expect(native).toContain("ZipFile");
  });
});
