#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

import {
  GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
} from "../tests/fixtures/garmin-json/fixture-manifest.ts";

const MANIFEST = "artifacts/native/phase18-garmin-acceptance/build.json";
const EVIDENCE = "artifacts/native/phase18-garmin-acceptance/benchmark.json";
const BASELINE = "tests/fixtures/garmin-json/phase18-performance-baseline.json";
const BENCHMARK_MARKER = "GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:";
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

export function validatePhase18GarminBenchmarkEvidence(evidence, manifest, baseline, baselineBytes) {
  privacySafe(evidence);
  if (
    !exactKeys(evidence, [
      "budget_source",
      "identity",
      "measurement_context",
      "measurements",
      "producer",
      "schema_version",
      "skipped",
      "status",
      "suite",
    ])
    || evidence.schema_version !== 1
    || evidence.suite !== "phase18-garmin-acceptance"
    || evidence.producer !== "phase18-garmin-benchmark/v2"
    || evidence.status !== "passed"
    || evidence.skipped !== 0
  ) fail("envelope_invalid");
  validateIdentity(evidence.identity, manifest);
  if (
    !exactKeys(evidence.budget_source, ["kind", "path", "report_sha256"])
    || evidence.budget_source.kind !== "source-owned-versioned-baseline"
    || evidence.budget_source.path !== BASELINE
    || !HASH.test(evidence.budget_source.report_sha256 ?? "")
    || evidence.budget_source.report_sha256
      !== evidence.identity.workout_baseline_sha256
    || evidence.budget_source.report_sha256 !== createHash("sha256").update(baselineBytes).digest("hex")
    || baseline?.schema_version !== 1
    || baseline?.suite !== "phase18-garmin-acceptance"
    || baseline?.profile !== "physical-arm64"
    || !exactKeys(baseline.metrics, PHASE18_GARMIN_BENCHMARK_METRICS)
    || !exactKeys(evidence.measurements, PHASE18_GARMIN_BENCHMARK_METRICS)
    || !exactKeys(evidence.measurement_context, ["commands", "device_identity_sha256", "profile", "sample_labels"])
    || evidence.measurement_context.profile !== "physical-arm64"
    || evidence.measurement_context.device_identity_sha256 !== evidence.identity.device_identity_sha256
    || !exactKeys(evidence.measurement_context.commands, PHASE18_GARMIN_BENCHMARK_METRICS)
    || !exactKeys(evidence.measurement_context.sample_labels, PHASE18_GARMIN_BENCHMARK_METRICS)
  ) fail("measurement_schema_invalid");

  const sampleCounts = {};
  const maxima = {};
  for (const metric of PHASE18_GARMIN_BENCHMARK_METRICS) {
    const values = evidence.measurements[metric];
    const specification = baseline.metrics[metric];
    const labels = evidence.measurement_context.sample_labels[metric];
    const command = evidence.measurement_context.commands[metric];
    if (
      !Array.isArray(values)
      || !Array.isArray(labels)
      || values.length !== labels.length
      || values.length < specification.minimum_samples
      || values.some((value) => !Number.isFinite(value) || value < 0)
      || labels.some((label) => typeof label !== "string" || label.length < 1 || label.length > 64)
      || typeof command !== "string" || command.length < 1 || command.length > 256
      || !Number.isFinite(specification.maximum)
      || specification.maximum < 0
    ) fail(`samples_invalid:${metric}`);
    const maximum = Math.max(...values);
    if (maximum > specification.maximum) fail(`budget_exceeded:${metric}`);
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

function collectInstalledMeasurements() {
  execFileSync("adb", ["logcat", "-c"], { stdio: "ignore" });
  execFileSync("adb", ["shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", "gymtracker-devtest://__phase18-garmin-acceptance?mode=benchmark", PACKAGE], { stdio: "ignore" });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const log = execFileSync("adb", ["logcat", "-d"], { encoding: "utf8" });
    const line = log.split(/\r?\n/u).find((entry) => entry.includes(BENCHMARK_MARKER));
    if (line !== undefined) return JSON.parse(line.slice(line.indexOf(BENCHMARK_MARKER) + BENCHMARK_MARKER.length));
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  fail("collector_timeout");
}

export function executePhase18GarminBenchmark(args = process.argv.slice(2), dependencies = {}) {
  const options = parsePhase18GarminBenchmarkArgs(args);
  if (!options.execute) {
    return Object.freeze({
      status: "native_measurements_deferred",
      fixture_manifest_sha256: GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
    });
  }
  const readJson = dependencies.readJson ?? ((file) => JSON.parse(readFileSync(file, "utf8")));
  const readBytes = dependencies.readBytes ?? readFileSync;
  const collect = dependencies.collectMeasurements ?? collectInstalledMeasurements;
  const writeEvidence = dependencies.writeEvidence ?? ((value) => writeFileSync(options.evidence, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" }));
  const manifest = readJson(options.manifest);
  const baselineBytes = readBytes(BASELINE);
  const baseline = JSON.parse(Buffer.from(baselineBytes).toString("utf8"));
  const collected = collect();
  const baselineSha256 = createHash("sha256").update(baselineBytes).digest("hex");
  const evidence = Object.freeze({
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    producer: "phase18-garmin-benchmark/v2",
    status: "passed",
    identity: Object.freeze({
      ...collected.identity,
      fixture_manifest_sha256: GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
      workout_baseline_sha256: baselineSha256,
    }),
    budget_source: Object.freeze({ kind: "source-owned-versioned-baseline", path: BASELINE, report_sha256: baselineSha256 }),
    measurements: Object.freeze(collected.measurements),
    measurement_context: Object.freeze(collected.measurement_context),
    skipped: 0,
  });
  const result = validatePhase18GarminBenchmarkEvidence(evidence, manifest, baseline, baselineBytes);
  writeEvidence(evidence);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase18GarminBenchmark())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "phase18_garmin_benchmark_failed"}\n`);
    process.exitCode = 1;
  }
}
