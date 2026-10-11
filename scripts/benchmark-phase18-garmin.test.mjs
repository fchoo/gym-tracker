import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GARMIN_JSON_FIXTURE_MANIFEST,
  GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
  GARMIN_JSON_FIXTURE_PAYLOADS,
} from "../tests/fixtures/garmin-json/fixture-manifest.ts";
import {
  PHASE18_GARMIN_BENCHMARK_METRICS,
  parsePhase18GarminBenchmarkArgs,
  validatePhase18GarminBenchmarkEvidence,
} from "./benchmark-phase18-garmin.mjs";

const HASH = "a".repeat(64);
const HEAD = "b".repeat(40);
const MANIFEST_PATH = "artifacts/native/phase18-garmin-acceptance/build.json";
const EVIDENCE_PATH = "artifacts/native/phase18-garmin-acceptance/benchmark.json";

const samples = (value) => [value, value + 1];

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
    workout_baseline_sha256: HASH,
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
    PHASE18_GARMIN_BENCHMARK_METRICS.map((metric, index) => [metric, samples(index + 1)]),
  );
  const budgets = Object.fromEntries(
    PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, 100]),
  );
  return {
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    producer: "phase18-garmin-benchmark/v1",
    status: "passed",
    identity: identity(),
    budget_source: {
      kind: "phase20-exact-artifact-baseline",
      report_sha256: HASH,
    },
    measurements,
    budgets,
    skipped: 0,
    ...overrides,
  };
}

test("canonical manifest names bounded synthetic summary, splits, and detail fixtures", () => {
  assert.match(GARMIN_JSON_FIXTURE_MANIFEST_SHA256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(GARMIN_JSON_FIXTURE_MANIFEST.map(({ id }) => id), [
    "synthetic-outdoor-bounded-v1",
    "synthetic-treadmill-bounded-v1",
    "synthetic-revision-bounded-v1",
  ]);
  assert.equal(new Set(GARMIN_JSON_FIXTURE_MANIFEST.map(({ id }) => id)).size, 3);
  for (const entry of GARMIN_JSON_FIXTURE_MANIFEST) {
    assert.ok(GARMIN_JSON_FIXTURE_PAYLOADS[entry.id]);
    assert.match(entry.component_sha256.activity, /^[a-f0-9]{64}$/u);
    assert.match(entry.component_sha256.splits, /^[a-f0-9]{64}$/u);
    assert.match(entry.component_sha256.details, /^[a-f0-9]{64}$/u);
    assert.ok(["source_summary", "source_sampled"].includes(entry.fidelity));
    assert.equal(entry.expected_normalized_summary.sport, "running");
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
  const result = validatePhase18GarminBenchmarkEvidence(evidence(), manifest());
  assert.equal(result.sample_counts.apk_size_bytes, 2);
  assert.equal(result.maxima.apk_size_bytes, 2);
  assert.equal(result.maxima.offline_workout_commit_ms, 12);
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
  variants.push(empty);
  const nonFinite = evidence();
  nonFinite.measurements.js_task_ms = [Number.NaN];
  variants.push(nonFinite);
  const regression = evidence();
  regression.measurements.frame_time_ms = [101];
  variants.push(regression);
  variants.push({ ...evidence(), raw_json: { private: true } });
  variants.push({ ...evidence(), note: "owner@example.invalid" });

  for (const value of variants) {
    assert.throws(
      () => validatePhase18GarminBenchmarkEvidence(value, manifest()),
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

test("focused coverage gate registers every Phase 18 integrity-critical module", () => {
  const source = readFileSync("scripts/run-coverage-gate.mjs", "utf8");
  for (const file of [
    "src/domains/activities/garminActivitySourcePort.ts",
    "src/domains/activities/importCommands.ts",
    "src/domains/activities/importContracts.ts",
    "src/domains/activities/activityDetails.ts",
    "src/platform/garmin/canonicalGarminPayload.ts",
    "src/platform/garmin/normalizeGarminActivity.ts",
    "src/platform/garmin/garminActivityAdapter.ts",
    "src/platform/garmin/garminSyncCoordinator.ts",
    "src/bootstrap/garminImportRuntime.tsx",
    "src/ui/garmin/useGarminConnectionController.ts",
    "src/domains/running/activityMatchCommands.ts",
    "src/platform/sqlite/repositories/importedActivityRepository.ts",
    "src/platform/sqlite/repositories/runningActivityMatchRepository.ts",
  ]) assert.match(source, new RegExp(file.replace(/[./]/gu, "\\$&"), "u"));
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
    "node scripts/run-coverage-gate.mjs --focus-phase18 --runInBand",
  );
});
