import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GARMIN_JSON_FIXTURE_MANIFEST,
  GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
  GARMIN_JSON_FIXTURE_PAYLOADS,
} from "../tests/fixtures/garmin-json/fixture-manifest.ts";
import { canonicalizeGarminPayload } from "../src/platform/garmin/canonicalGarminPayload.ts";
import {
  PHASE18_GARMIN_BENCHMARK_METRICS,
  executePhase18GarminBenchmark,
  parsePhase18GarminBenchmarkArgs,
  validatePhase18GarminBenchmarkEvidence,
} from "./benchmark-phase18-garmin.mjs";

const HASH = "a".repeat(64);
const HEAD = "b".repeat(40);
const MANIFEST_PATH = "artifacts/native/phase18-garmin-acceptance/build.json";
const EVIDENCE_PATH = "artifacts/native/phase18-garmin-acceptance/benchmark.json";
const BASELINE_PATH = "tests/fixtures/garmin-json/phase18-performance-baseline.json";
const BASELINE_BYTES = readFileSync(BASELINE_PATH);
const BASELINE = JSON.parse(BASELINE_BYTES.toString("utf8"));
const BASELINE_HASH = createHash("sha256").update(BASELINE_BYTES).digest("hex");

const samples = (metric, value) => Array.from(
  { length: BASELINE.metrics[metric].minimum_samples },
  (_, index) => value + index,
);

function identity(overrides = {}) {
  return {
    base_head: HEAD,
    source_tree_sha256: HASH,
    python_lock_sha256: HASH,
    apk_sha256: HASH,
    signature_sha256: HASH,
    device_identity_sha256: HASH,
    package: "com.fchoo.gymtracker.devtest",
    profile: "development-test",
    abi: "arm64-v8a",
    fixture_manifest_sha256: GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
    workout_baseline_sha256: BASELINE_HASH,
    ...overrides,
  };
}

function manifest() {
  return {
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    profile: "development-test",
    package: "com.fchoo.gymtracker.devtest",
    abi: "arm64-v8a",
    js_bundle_embedded: true,
    base_head: HEAD,
    source_tree_sha256: HASH,
    python_lock_sha256: HASH,
    apk_sha256: HASH,
    signature_sha256: HASH,
    device_identity_sha256: HASH,
  };
}

function evidence(overrides = {}) {
  const measurements = Object.fromEntries(
    PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, samples(metric, 1)]),
  );
  const commands = Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, `collect:${metric}`]));
  const sample_labels = Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [
    metric,
    measurements[metric].map((_, index) => `${BASELINE.metrics[metric].mode}-${index + 1}`),
  ]));
  return {
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    producer: "phase18-garmin-benchmark/v2",
    status: "passed",
    identity: identity(),
    budget_source: {
      kind: "source-owned-versioned-baseline",
      path: BASELINE_PATH,
      report_sha256: BASELINE_HASH,
    },
    measurements,
    measurement_context: {
      profile: "physical-arm64",
      device_identity_sha256: HASH,
      commands,
      sample_labels,
    },
    skipped: 0,
    ...overrides,
  };
}

test("canonical manifest uses production component hashing and fidelity values", () => {
  assert.match(GARMIN_JSON_FIXTURE_MANIFEST_SHA256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(GARMIN_JSON_FIXTURE_MANIFEST.map(({ id }) => id), [
    "synthetic-outdoor-bounded-v1",
    "synthetic-treadmill-bounded-v1",
    "synthetic-revision-bounded-v1",
  ]);
  assert.equal(new Set(GARMIN_JSON_FIXTURE_MANIFEST.map(({ id }) => id)).size, 3);
  for (const entry of GARMIN_JSON_FIXTURE_MANIFEST) {
    const payload = GARMIN_JSON_FIXTURE_PAYLOADS[entry.id];
    assert.ok(["source_summary", "source_laps", "sampled"].includes(entry.expected_sample_fidelity));
    assert.equal(entry.expected_normalized.sport, "running");
    assert.equal(entry.component_sha256.activity, createHash("sha256").update(canonicalizeGarminPayload(payload.activity)).digest("hex"));
    assert.equal(entry.component_sha256.splits, createHash("sha256").update(canonicalizeGarminPayload(payload.splits)).digest("hex"));
    assert.equal(entry.component_sha256.details, createHash("sha256").update(canonicalizeGarminPayload(payload.details)).digest("hex"));
    assert.equal(entry.normalized_sha256, createHash("sha256").update(canonicalizeGarminPayload({
      normalization_version: 1,
      normalized: entry.expected_normalized,
    })).digest("hex"));
    assert.doesNotMatch(JSON.stringify(entry), /email|password|token|account_namespace|owner@/iu);
  }
});

test("benchmark retains every required raw measurement and reports exact maxima", () => {
  assert.deepEqual(PHASE18_GARMIN_BENCHMARK_METRICS, [
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
  ]);
  const result = validatePhase18GarminBenchmarkEvidence(evidence(), manifest(), BASELINE, BASELINE_BYTES);
  assert.equal(result.sample_counts.apk_size_bytes, 1);
  assert.equal(result.maxima.apk_size_bytes, 1);
  assert.equal(result.sample_counts.frame_time_ms, 30);
});

test("benchmark rejects stale identities, missing/non-finite samples, regressions, and private fields", () => {
  const variants = [];
  for (const key of Object.keys(identity())) {
    const value = evidence();
    value.identity[key] = key === "base_head" ? "c".repeat(40) : key === "package"
      ? "com.example.wrong"
      : key === "profile"
        ? "production"
        : key === "abi"
          ? "x86_64"
          : "c".repeat(64);
    variants.push(value);
  }
  const missing = evidence();
  delete missing.measurements.route_render_ms;
  variants.push(missing);
  const empty = evidence();
  empty.measurements.lap_render_ms = [];
  empty.measurement_context.sample_labels.lap_render_ms = [];
  variants.push(empty);
  const nonFinite = evidence();
  nonFinite.measurements.js_task_ms = [Number.NaN];
  variants.push(nonFinite);
  const regression = evidence();
  regression.measurements.frame_time_ms = [101];
  variants.push(regression);
  variants.push({ ...evidence(), raw_json: { private: true } });
  variants.push({ ...evidence(), route_points: [{ latitude: 1, longitude: 2 }] });
  variants.push({ ...evidence(), note: "owner@example.invalid" });

  for (const value of variants) {
    assert.throws(
      () => validatePhase18GarminBenchmarkEvidence(value, manifest(), BASELINE, BASELINE_BYTES),
      /phase18_garmin_benchmark_/u,
    );
  }
});

test("benchmark execution requires exact paths and explicit Phase 20 authority", () => {
  assert.deepEqual(parsePhase18GarminBenchmarkArgs([
    "--manifest", MANIFEST_PATH,
    "--evidence", EVIDENCE_PATH,
  ]), {
    manifest: MANIFEST_PATH,
    evidence: EVIDENCE_PATH,
    execute: false,
    phase20Checkpoint: false,
  });
  assert.throws(
    () => parsePhase18GarminBenchmarkArgs([
      "--manifest", MANIFEST_PATH,
      "--evidence", EVIDENCE_PATH,
      "--execute",
    ]),
    /phase18_garmin_benchmark_arguments_invalid/u,
  );
});

test("execute collects installed samples and writes evidence with source-owned budgets", () => {
  const writes = [];
  const collected = evidence();
  const result = executePhase18GarminBenchmark([
    "--manifest", MANIFEST_PATH,
    "--evidence", EVIDENCE_PATH,
    "--execute",
    "--phase20-native-checkpoint",
  ], {
    readJson: () => manifest(),
    readBytes: () => BASELINE_BYTES,
    collectMeasurements: () => ({
      identity: collected.identity,
      measurements: collected.measurements,
      measurement_context: collected.measurement_context,
    }),
    writeEvidence: (value) => writes.push(value),
  });
  assert.equal(result.sample_counts.python_cold_start_ms, 5);
  assert.equal(writes.length, 1);
  assert.equal("budgets" in writes[0], false);
});

test("focused coverage gate registers every Phase 18 integrity-critical module", () => {
  const source = readFileSync("scripts/run-coverage-gate.mjs", "utf8");
  const languageCoverage = readFileSync("scripts/phase18-language-coverage.mjs", "utf8");
  for (const file of [
    "src/domains/activities/activityDetails.ts",
    "src/domains/activities/importCommands.ts",
    "src/domains/portability/mergePlan.ts",
    "src/platform/garmin/garminActivityAdapter.ts",
    "src/platform/garmin/canonicalGarminPayload.ts",
    "src/platform/garmin/normalizeGarminActivity.ts",
    "src/platform/garmin/garminSyncCoordinator.ts",
    "src/platform/sqlite/repositories/garminSyncSummaryRepository.ts",
    "src/platform/sqlite/repositories/importedActivityRepository.ts",
    "src/platform/sqlite/repositories/logicalMergeRepository.ts",
    "src/platform/sqlite/repositories/runningActivityMatchRepository.ts",
    "src/bootstrap/garminImportRuntime.tsx",
    "src/domains/running/activityMatchCommands.ts",
    "src/ui/garmin/useGarminConnectionController.ts",
  ]) assert.match(source, new RegExp(file.replace(/[./]/gu, "\\$&"), "u"));
  for (const testFile of [
    "scripts/phase18-garmin-proof.test.mjs",
    "scripts/phase18-build-manifest.test.mjs",
    "scripts/phase18-garmin-acceptance.test.mjs",
    "scripts/phase18-garmin-adversarial.test.mjs",
    "tests/integration/garmin-import-portability.test.ts",
    "tests/integration/imported-activity-facts.test.ts",
    "tests/integration/running-activity-match.test.ts",
    "tests/sqlite-host/garminSyncSummaryRepository.test.ts",
    "tests/sqlite-host/logicalMergeRepository.test.ts",
  ]) assert.match(source, new RegExp(testFile.replace(/[./]/gu, "\\$&"), "u"));
  assert.match(languageCoverage, /phase18\/python-coverage\.json/u);
  assert.match(languageCoverage, /phase18\/kotlin-coverage\.json/u);
  assert.match(source, /loadPhase18LanguageCoverageReports/u);
  assert.match(source, /--test-coverage-lines=100/u);
  assert.match(source, /--test-coverage-branches=100/u);
  assert.match(source, /--test-coverage-functions=100/u);
  assert.match(source, /--focus-phase18/u);
});

test("package scripts expose the guarded benchmark and focused coverage gate", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  assert.equal(
    scripts["benchmark:phase18:garmin"],
    `node scripts/benchmark-phase18-garmin.mjs --manifest ${MANIFEST_PATH} --evidence ${EVIDENCE_PATH}`,
  );
  assert.equal(
    scripts["test:coverage:phase18"],
    "npm run test:coverage:phase18:python && npm run test:coverage:phase18:kotlin && node scripts/run-coverage-gate.mjs --focus-phase18 --runInBand",
  );
  assert.equal(scripts["test:coverage:phase18:python"], "python3 scripts/run-phase18-python-coverage.py");
  assert.equal(scripts["test:coverage:phase18:kotlin"], "node scripts/run-phase18-kotlin-coverage.mjs");
});
