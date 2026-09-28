import assert from "node:assert/strict";
import test from "node:test";

import {
  MERGE_DIGEST_CONCURRENCY,
  PHASE12_BACKUP_BENCHMARK_THRESHOLDS,
  validatePhase12BackupBenchmark,
} from "./benchmark-phase12-backup.mjs";

const manifest = {
  schema_version: 1, suite: "phase12", profile: "development-test",
  package: "com.fchoo.gymtracker.devtest", base_head: "a".repeat(40),
  source_tree_sha256: "b".repeat(64), apk: { path: "fixture.apk", sha256: "c".repeat(64) },
};

function samples(count, value) { return Array.from({ length: count }, () => value); }

test("Phase 12 benchmark fixes the tested writer and maximum merge budgets", () => {
  assert.equal(MERGE_DIGEST_CONCURRENCY, 4);
  assert.deepEqual(PHASE12_BACKUP_BENCHMARK_THRESHOLDS, {
    dirty_trigger: { minimum_samples: 100, maximum_p95_ms: 16 },
    writer_occupancy: { minimum_samples: 20, maximum_p95_ms: 1000 },
    merge_preflight: { minimum_samples: 10, maximum_p95_ms: 10_000, maximum_peak_growth_bytes: 192 * 1024 * 1024, required_snapshot_bytes: 24 * 1024 * 1024, required_rows: 100_000 },
  });
});

test("Phase 12 benchmark rejects a stale manifest, missing samples, or a false merge result", () => {
  const evidence = {
    schema_version: 1, suite: "phase12", producer: "phase12-backup-benchmark/v1",
    status: "passed", mode: "automated-only", manifest: {
      base_head: manifest.base_head, source_tree_sha256: manifest.source_tree_sha256,
      apk_sha256: manifest.apk.sha256, package: manifest.package,
    },
    measurements: {
      dirty_trigger_ms: samples(100, 1), writer_occupancy_ms: samples(20, 2),
      merge_preflight_ms: samples(10, 3), merge_peak_growth_bytes: samples(10, 4),
      snapshot_bytes: 24 * 1024 * 1024, total_rows: 100_000,
      merge_digest_concurrency: 4, merge_output_equivalent: true,
      network_inside_writer: false, skipped: 0,
    },
  };
  assert.doesNotThrow(() => validatePhase12BackupBenchmark(evidence, manifest));
  assert.throws(() => validatePhase12BackupBenchmark({ ...evidence, measurements: { ...evidence.measurements, merge_output_equivalent: false } }, manifest));
  assert.throws(() => validatePhase12BackupBenchmark({ ...evidence, manifest: { ...evidence.manifest, apk_sha256: "d".repeat(64) } }, manifest));
  assert.throws(() => validatePhase12BackupBenchmark({ ...evidence, measurements: { ...evidence.measurements, dirty_trigger_ms: [] } }, manifest));
});
