#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MERGE_DIGEST_CONCURRENCY = 4;
export const PHASE12_BACKUP_BENCHMARK_THRESHOLDS = Object.freeze({
  dirty_trigger: Object.freeze({ minimum_samples: 100, maximum_p95_ms: 16 }),
  writer_occupancy: Object.freeze({ minimum_samples: 20, maximum_p95_ms: 1000 }),
  merge_preflight: Object.freeze({
    minimum_samples: 10,
    maximum_p95_ms: 10_000,
    maximum_peak_growth_bytes: 192 * 1024 * 1024,
    required_snapshot_bytes: 24 * 1024 * 1024,
    required_rows: 100_000,
  }),
});

function p95(values) {
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1];
}

function samples(values, expected, limit, label) {
  if (!Array.isArray(values) || values.length < expected || values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error(`phase12_${label}_samples_invalid`);
  if (p95(values) > limit) throw new Error(`phase12_${label}_budget_exceeded`);
}

/** Fail-closed evidence validator; native measurement collection owns the raw samples. */
export function validatePhase12BackupBenchmark(evidence, manifest) {
  const expected = PHASE12_BACKUP_BENCHMARK_THRESHOLDS;
  if (evidence?.schema_version !== 1 || evidence.suite !== "phase12"
    || evidence.producer !== "phase12-backup-benchmark/v1" || evidence.status !== "passed"
    || evidence.mode !== "automated-only" || evidence.measurements?.skipped !== 0) throw new Error("phase12_benchmark_envelope_invalid");
  const identity = evidence.manifest;
  if (identity?.base_head !== manifest.base_head || identity.source_tree_sha256 !== manifest.source_tree_sha256
    || identity.apk_sha256 !== manifest.apk?.sha256 || identity.package !== manifest.package) throw new Error("phase12_benchmark_manifest_stale");
  const measured = evidence.measurements;
  samples(measured.dirty_trigger_ms, expected.dirty_trigger.minimum_samples, expected.dirty_trigger.maximum_p95_ms, "dirty_trigger");
  samples(measured.writer_occupancy_ms, expected.writer_occupancy.minimum_samples, expected.writer_occupancy.maximum_p95_ms, "writer_occupancy");
  samples(measured.merge_preflight_ms, expected.merge_preflight.minimum_samples, expected.merge_preflight.maximum_p95_ms, "merge_preflight");
  samples(measured.merge_peak_growth_bytes, expected.merge_preflight.minimum_samples, expected.merge_preflight.maximum_peak_growth_bytes, "merge_peak_growth");
  if (measured.snapshot_bytes !== expected.merge_preflight.required_snapshot_bytes
    || measured.total_rows !== expected.merge_preflight.required_rows
    || measured.merge_digest_concurrency !== MERGE_DIGEST_CONCURRENCY
    || measured.merge_output_equivalent !== true || measured.network_inside_writer !== false) throw new Error("phase12_benchmark_merge_contract_invalid");
  return true;
}

function parseArguments(args) {
  const index = args.indexOf("--manifest");
  const evidenceIndex = args.indexOf("--evidence");
  if (index < 0 || evidenceIndex < 0 || args[index + 1] === undefined || args[evidenceIndex + 1] === undefined) throw new Error("benchmark:phase12:backup requires --manifest and --evidence");
  return { manifest: args[index + 1], evidence: args[evidenceIndex + 1] };
}

export function executePhase12BackupBenchmark(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const manifest = JSON.parse(readFileSync(options.manifest, "utf8"));
  const evidence = JSON.parse(readFileSync(options.evidence, "utf8"));
  validatePhase12BackupBenchmark(evidence, manifest);
  return evidence;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify({ ok: true, suite: executePhase12BackupBenchmark().suite })}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
