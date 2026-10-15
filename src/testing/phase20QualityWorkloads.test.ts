import { describe, expect, it } from "@jest/globals";

import { runPhase20HeavyWorkload } from "./phase20QualityWorkloads";
import type { Phase12BackupBenchmarkResult } from "../bootstrap/phase12BackupBenchmark";
import type { Phase2BenchmarkResult } from "../bootstrap/phase2Benchmark";

const unused = async (): Promise<never> => { throw new Error("unused"); };

describe("Phase 20 real heavy workloads", () => {
  it("maps the existing Phase 12 producer without inventing timing samples", async () => {
    const result = await runPhase20HeavyWorkload("phase12-backup", {
      phase12: async (observe, observeDatabaseName) => {
        observeDatabaseName?.("gym-tracker-phase12-benchmark-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa.db");
        for (const [operation, count, duration] of [
          ["dirty-trigger", 1, 1],
          ["writer-occupancy", 1, 2],
          ["merge-preflight", 1, 4],
          ["merge-materialization", 1, 5],
        ] as const) {
          for (let sequence = 1; sequence <= count; sequence += 1) {
            observe?.({ operation, sequence, startMs: 10, endMs: 10 + duration });
          }
        }
        return ({
        schemaVersion: 1,
        suite: "phase12",
        status: "passed",
        measurements: {
          dirty_trigger_ms: [1],
          writer_occupancy_ms: [2],
          capture_total_ms: [3],
          merge_preflight_ms: [4],
          merge_materialization_ms: [5],
          merge_serialization_ms: [6],
          snapshot_bytes: 24 * 1024 * 1024,
          total_rows: 100_000,
          merge_digest_concurrency: 2,
          merge_output_equivalent: true,
          network_inside_writer: false,
          sqlite_max_variable_number: 4_000,
        },
        startedAt: "2026-10-15T00:00:00.000Z",
        finishedAt: "2026-10-15T00:00:01.000Z",
        }) as Phase12BackupBenchmarkResult;
      },
      phase2: unused,
      garmin: unused,
    });
    expect(result).toMatchObject({
      operation: "phase12-backup",
      producer: "phase12-backup-benchmark/v1",
      native_execution: "EXECUTED",
      samples: {
        dirty_trigger_ms: [1],
        writer_occupancy_ms: [2],
        merge_preflight_ms: [4],
        merge_materialization_ms: [5],
      },
    });
  });

  it("requires an executed SQLite or native receipt from every producer", async () => {
    await expect(runPhase20HeavyWorkload("ordinary-js-task", {
      phase12: unused,
      phase2: async () => ({
        schemaVersion: 1,
        suite: "phase2",
        status: "passed",
        measurements: [],
        startedAt: "",
        finishedAt: "",
      }) as unknown as Phase2BenchmarkResult,
      garmin: unused,
    })).rejects.toThrow("phase20_quality_phase2_result_invalid");
    await expect(runPhase20HeavyWorkload("garmin-json-normalization", {
      phase12: unused,
      phase2: unused,
      garmin: async () => ({ normalization_ms: [], normalization_spans: [], peak_rss_bytes: [], database_name: "" }),
    })).rejects.toThrow("phase20_quality_garmin_result_invalid");
  });
});
