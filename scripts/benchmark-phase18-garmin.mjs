#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

import {
  GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
} from "../tests/fixtures/garmin-json/fixture-manifest.ts";

const MANIFEST = "artifacts/native/phase18-garmin-acceptance/build.json";
const EVIDENCE = "artifacts/native/phase18-garmin-acceptance/benchmark.json";
const HASH = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const PACKAGE = "com.fchoo.gymtracker.devtest";
const FORBIDDEN_KEY = /(?:^|_)(?:account|activity_id|authorization|ciphertext|cookie|credentials?|email|external_activity_id|filename|heart_rate|latitude|longitude|mfa_code|password|raw_json|secret|serial|token|url)(?:$|_)/iu;
const FORBIDDEN_ROUTE_KEY = /(?:^|_)route(?:$|_points?$)/iu;
const FORBIDDEN_VALUE = /(?:https?:\/\/|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/iu;

export const PHASE18_GARMIN_BENCHMARK_METRICS = Object.freeze([
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

const fail = (code) => {
  throw new Error(`phase18_garmin_benchmark_${code}`);
};

function exactKeys(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

function privacySafe(value) {
  if (typeof value === "string" && FORBIDDEN_VALUE.test(value)) {
    fail("privacy_invalid");
  }
  if (Array.isArray(value)) {
    value.forEach(privacySafe);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key) || FORBIDDEN_ROUTE_KEY.test(key)) {
        fail("privacy_invalid");
      }
      privacySafe(entry);
    }
  }
}

function validateIdentity(identity, manifest) {
  if (
    !exactKeys(identity, [
      "abi",
      "apk_sha256",
      "base_head",
      "device_identity_sha256",
      "fixture_manifest_sha256",
      "package",
      "profile",
      "python_lock_sha256",
      "signature_sha256",
      "source_tree_sha256",
      "workout_baseline_sha256",
    ])
    || !HEAD.test(identity.base_head ?? "")
    || !HASH.test(identity.source_tree_sha256 ?? "")
    || !HASH.test(identity.python_lock_sha256 ?? "")
    || !HASH.test(identity.apk_sha256 ?? "")
    || !HASH.test(identity.signature_sha256 ?? "")
    || !HASH.test(identity.device_identity_sha256 ?? "")
    || !HASH.test(identity.workout_baseline_sha256 ?? "")
    || identity.fixture_manifest_sha256 !== GARMIN_JSON_FIXTURE_MANIFEST_SHA256
    || identity.package !== PACKAGE
    || identity.profile !== "development-test"
    || identity.abi !== "arm64-v8a"
    || identity.base_head !== manifest?.base_head
    || identity.source_tree_sha256 !== manifest?.source_tree_sha256
    || identity.python_lock_sha256 !== manifest?.python_lock_sha256
    || identity.apk_sha256 !== manifest?.apk_sha256
    || identity.signature_sha256 !== manifest?.signature_sha256
    || identity.device_identity_sha256 !== manifest?.device_identity_sha256
    || identity.package !== manifest?.package
    || identity.profile !== manifest?.profile
    || identity.abi !== manifest?.abi
  ) fail("identity_invalid");
}

export function validatePhase18GarminBenchmarkEvidence(evidence, manifest) {
  privacySafe(evidence);
  if (
    !exactKeys(evidence, [
      "budget_source",
      "budgets",
      "identity",
      "measurements",
      "producer",
      "schema_version",
      "skipped",
      "status",
      "suite",
    ])
    || evidence.schema_version !== 1
    || evidence.suite !== "phase18-garmin-acceptance"
    || evidence.producer !== "phase18-garmin-benchmark/v1"
    || evidence.status !== "passed"
    || evidence.skipped !== 0
  ) fail("envelope_invalid");
  validateIdentity(evidence.identity, manifest);
  if (
    !exactKeys(evidence.budget_source, ["kind", "report_sha256"])
    || evidence.budget_source.kind !== "phase20-exact-artifact-baseline"
    || !HASH.test(evidence.budget_source.report_sha256 ?? "")
    || evidence.budget_source.report_sha256
      !== evidence.identity.workout_baseline_sha256
    || !exactKeys(evidence.measurements, PHASE18_GARMIN_BENCHMARK_METRICS)
    || !exactKeys(evidence.budgets, PHASE18_GARMIN_BENCHMARK_METRICS)
  ) fail("measurement_schema_invalid");

  const sampleCounts = {};
  const maxima = {};
  for (const metric of PHASE18_GARMIN_BENCHMARK_METRICS) {
    const values = evidence.measurements[metric];
    const budget = evidence.budgets[metric];
    if (
      !Array.isArray(values)
      || values.length === 0
      || values.some((value) => !Number.isFinite(value) || value < 0)
      || !Number.isFinite(budget)
      || budget < 0
    ) fail(`samples_invalid:${metric}`);
    const maximum = Math.max(...values);
    if (maximum > budget) fail(`budget_exceeded:${metric}`);
    sampleCounts[metric] = values.length;
    maxima[metric] = maximum;
  }
  return Object.freeze({
    sample_counts: Object.freeze(sampleCounts),
    maxima: Object.freeze(maxima),
  });
}

export function parsePhase18GarminBenchmarkArgs(args) {
  const options = {
    manifest: "",
    evidence: "",
    execute: false,
    phase20Checkpoint: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") options.manifest = args[++index] ?? "";
    else if (argument === "--evidence") options.evidence = args[++index] ?? "";
    else if (argument === "--execute") options.execute = true;
    else if (argument === "--phase20-native-checkpoint") options.phase20Checkpoint = true;
    else fail("arguments_invalid");
  }
  if (
    options.manifest !== MANIFEST
    || options.evidence !== EVIDENCE
    || options.execute !== options.phase20Checkpoint
  ) fail("arguments_invalid");
  return options;
}

export function executePhase18GarminBenchmark(args = process.argv.slice(2)) {
  const options = parsePhase18GarminBenchmarkArgs(args);
  if (!options.execute) {
    return Object.freeze({
      status: "native_measurements_deferred",
      fixture_manifest_sha256: GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
    });
  }
  const manifest = JSON.parse(readFileSync(options.manifest, "utf8"));
  const evidence = JSON.parse(readFileSync(options.evidence, "utf8"));
  return validatePhase18GarminBenchmarkEvidence(evidence, manifest);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase18GarminBenchmark())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "phase18_garmin_benchmark_failed"}\n`);
    process.exitCode = 1;
  }
}
