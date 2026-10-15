import { describe, expect, it } from "@jest/globals";

import { runPhase20HeavyWorkload } from "./phase20QualityWorkloads";
import type { Phase12BackupBenchmarkResult } from "../bootstrap/phase12BackupBenchmark";

const unused = async (): Promise<never> => { throw new Error("unused"); };

describe("Phase 20 real heavy workloads", () => {
  it("binds ordinary JS spans to real work in the nonce-scoped Workout database", async () => {
    const nonce = "a".repeat(48);
    const result = await runPhase20HeavyWorkload("ordinary-js-task", {
      phase12: unused,
      garmin: unused,
    }, nonce, { activeWorkout: { revision: 3, exerciseCount: 4 }, source: "sqlite" });
    expect(result).toMatchObject({ producer: "phase20-ordinary-js-source-work/v1", database_name: `gym-tracker-phase20-quality-${nonce}-workout.db` });
    expect(result?.samples.js_task_ms).toHaveLength(100);
  });

  it("retains installed Chaquopy transport hashes and an independent pinned Phase 18 baseline", async () => {
    const actual = [1, 2, 3, 4, 5];
    const baseline = [6, 7, 8, 9, 10];
    const result = await runPhase20HeavyWorkload("garmin-json-normalization", {
      phase12: unused,
      garmin: async () => ({
        database_name: "gym-tracker-phase20-quality-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-workout.db",
        normalization_ms: actual, normalization_spans: actual.map((value, index) => ({ start_ms: index * 10, end_ms: index * 10 + value })),
        peak_rss_bytes: actual.map((value) => value * 1024), transport: "chaquopy-python-garminconnect-0.3.17",
        fixture_sha256: "1".repeat(64), payload_sha256: "2".repeat(64), output_sha256: "3".repeat(64), runtime_receipt_sha256: "4".repeat(64),
        baseline: { source: "phase18-pinned-artifact/v1", phase18_source_tree_sha256: "5".repeat(64), artifact_sha256: "6".repeat(64), fixture_sha256: "1".repeat(64), normalization_ms: baseline, peak_rss_bytes: baseline.map((value) => value * 2048) },
      }),
    });
    expect(result?.samples).toMatchObject({ transport: "chaquopy-python-garminconnect-0.3.17", baseline: { source: "phase18-pinned-artifact/v1" } });
    const samples = result?.samples as Readonly<{ normalization_ms: readonly number[]; baseline: Readonly<{ normalization_ms: readonly number[] }> }>;
    expect(samples.normalization_ms).not.toEqual(samples.baseline.normalization_ms);
  });
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
      garmin: unused,
    })).rejects.toThrow("phase20_quality_source_facts_missing");
    await expect(runPhase20HeavyWorkload("garmin-json-normalization", {
      phase12: unused,
      garmin: (async () => ({ normalization_ms: [], normalization_spans: [], peak_rss_bytes: [], database_name: "" })) as never,
    })).rejects.toThrow("phase20_quality_garmin_result_invalid");
  });
});
