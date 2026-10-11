#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
} from "../tests/fixtures/garmin-json/fixture-manifest.ts";
import { PHASE18_GARMIN_ACCEPTANCE_CONFIRMATION } from "../src/testing/phase18GarminAcceptance.ts";
import {
  choose,
  cliArgValue,
  errorMessage,
  exactKeys,
  firstDefined,
  regexMatch,
  runCliIfMain,
} from "./node-evidence-utils.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const MANIFEST = "artifacts/native/phase18-garmin-acceptance/build.json";
const EVIDENCE = "artifacts/native/phase18-garmin-acceptance/benchmark.json";
const BASELINE = "tests/fixtures/garmin-json/phase18-performance-baseline.json";
const BENCHMARK_MARKER = "GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:";
const HASH = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
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
  const invalid = [
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
    ]),
    !regexMatch(HEAD, identity.base_head),
    !regexMatch(HASH, identity.source_tree_sha256),
    !regexMatch(HASH, identity.python_lock_sha256),
    !regexMatch(HASH, identity.apk_sha256),
    !regexMatch(HASH, identity.signature_sha256),
    !regexMatch(HASH, identity.device_identity_sha256),
    !regexMatch(HASH, identity.workout_baseline_sha256),
    identity.fixture_manifest_sha256 !== GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
    identity.package !== PACKAGE,
    identity.profile !== "development-test",
    identity.abi !== "arm64-v8a",
    identity.base_head !== manifest?.base_head,
    identity.source_tree_sha256 !== manifest?.source_tree_sha256,
    identity.python_lock_sha256 !== manifest?.python_lock_sha256,
    identity.apk_sha256 !== manifest?.apk_sha256,
    identity.signature_sha256 !== manifest?.signature_sha256,
    identity.device_identity_sha256 !== manifest?.device_identity_sha256,
    identity.package !== manifest?.package,
    identity.profile !== manifest?.profile,
    identity.abi !== manifest?.abi,
  ].some(Boolean);
  if (invalid) fail("identity_invalid");
}

function exactPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function validatePhase18GarminBenchmarkEvidence(evidence, manifest, baseline, baselineBytes) {
  privacySafe(evidence);
  const invalidEnvelope = [
    !exactKeys(evidence, [
      "budget_source",
      "identity",
      "measurement_context",
      "measurements",
      "producer",
      "producer_context",
      "schema_version",
      "skipped",
      "status",
      "suite",
    ]),
    evidence.schema_version !== 1,
    evidence.suite !== "phase18-garmin-acceptance",
    evidence.producer !== "phase18-garmin-benchmark/v2",
    evidence.status !== "passed",
    evidence.skipped !== 0,
  ].some(Boolean);
  if (invalidEnvelope) fail("envelope_invalid");
  validateIdentity(evidence.identity, manifest);
  const invalidMeasurementSchema = [
    !exactKeys(evidence.budget_source, ["kind", "path", "report_sha256"]),
    evidence.budget_source.kind !== "source-owned-versioned-baseline",
    evidence.budget_source.path !== BASELINE,
    !regexMatch(HASH, evidence.budget_source.report_sha256),
    evidence.budget_source.report_sha256 !== evidence.identity.workout_baseline_sha256,
    evidence.budget_source.report_sha256 !== createHash("sha256").update(baselineBytes).digest("hex"),
    baseline?.schema_version !== 1,
    baseline?.suite !== "phase18-garmin-acceptance",
    baseline?.profile !== "physical-arm64",
    !exactKeys(baseline.metrics, PHASE18_GARMIN_BENCHMARK_METRICS),
    !exactKeys(evidence.measurements, PHASE18_GARMIN_BENCHMARK_METRICS),
    !exactKeys(evidence.measurement_context, ["commands", "device_identity_sha256", "profile", "sample_labels"]),
    !exactKeys(evidence.producer_context, ["kind", "marker", "run_nonce", "source_pid"]),
    evidence.producer_context.kind !== "installed-route-log",
    evidence.producer_context.marker !== BENCHMARK_MARKER,
    !regexMatch(NONCE, evidence.producer_context.run_nonce),
    !exactPositiveInteger(evidence.producer_context.source_pid),
    evidence.measurement_context.profile !== "physical-arm64",
    evidence.measurement_context.device_identity_sha256 !== evidence.identity.device_identity_sha256,
    !exactKeys(evidence.measurement_context.commands, PHASE18_GARMIN_BENCHMARK_METRICS),
    !exactKeys(evidence.measurement_context.sample_labels, PHASE18_GARMIN_BENCHMARK_METRICS),
  ].some(Boolean);
  if (invalidMeasurementSchema) fail("measurement_schema_invalid");

  const sampleCounts = {};
  const maxima = {};
  for (const metric of PHASE18_GARMIN_BENCHMARK_METRICS) {
    const values = evidence.measurements[metric];
    const specification = baseline.metrics[metric];
    const labels = evidence.measurement_context.sample_labels[metric];
    const command = evidence.measurement_context.commands[metric];
    const invalidSamples = [
      !Array.isArray(values),
      !Array.isArray(labels),
      values.length !== labels.length,
      values.length < specification.minimum_samples,
      values.some((value) => !Number.isFinite(value) || value < 0),
      labels.some((label) => typeof label !== "string" || label.length < 1 || label.length > 64),
      typeof command !== "string" || command.length < 1 || command.length > 256,
      !Number.isFinite(specification.maximum),
      specification.maximum < 0,
    ].some(Boolean);
    if (invalidSamples) fail(`samples_invalid:${metric}`);
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
    if (argument === "--manifest") options.manifest = cliArgValue(args, ++index);
    else if (argument === "--evidence") options.evidence = cliArgValue(args, ++index);
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

function command(program, args, options = {}) {
  return execFileSync(program, args, { maxBuffer: 512 * 1024 * 1024, ...options });
}

function commandText(program, args) {
  return command(program, args, { encoding: "utf8" }).trim();
}

function resolveAndroidTool(name) {
  const sdk = firstDefined(process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT);
  if (sdk === undefined) fail("android_sdk_missing");
  if (name === "adb") {
    const executable = path.join(sdk, "platform-tools", "adb");
    if (!existsSync(executable)) fail("adb_missing");
    return executable;
  }
  const buildTools = path.join(sdk, "build-tools");
  const candidates = existsSync(buildTools)
    ? readdirSync(buildTools)
      .map((version) => path.join(buildTools, version, name))
      .filter((candidate) => existsSync(candidate))
      .sort()
    : [];
  const executable = candidates.at(-1);
  if (executable === undefined) fail(`${name}_missing`);
  return executable;
}

function retainedSignatureSha256(apkPath) {
  const output = commandText(resolveAndroidTool("apksigner"), [
    "verify",
    "--print-certs",
    apkPath,
  ]);
  const match = output.match(/certificate SHA-256 digest:\s*([A-Fa-f0-9:]{64,95})/u);
  if (match?.[1] === undefined) fail("signature_unreadable");
  const digest = match[1].replaceAll(":", "").toLowerCase();
  if (!HASH.test(digest)) fail("signature_unreadable");
  return digest;
}

function resolveCurrentIdentity() {
  const adb = resolveAndroidTool("adb");
  const devices = commandText(adb, ["devices"])
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/u))
    .filter(([, state]) => state === "device");
  if (devices.length !== 1 || devices[0]?.[0] === undefined) fail("device_identity_invalid");
  const serial = devices[0][0];
  const adbText = (...args) => commandText(adb, ["-s", serial, ...args]);
  const abi = adbText("shell", "getprop", "ro.product.cpu.abi");
  const apiLevel = adbText("shell", "getprop", "ro.build.version.sdk");
  const model = adbText("shell", "getprop", "ro.product.model");
  const installedPath = adbText("shell", "pm", "path", PACKAGE).replace(/^package:/u, "");
  if (abi !== "arm64-v8a" || !installedPath.startsWith("/data/app/")) fail("device_identity_invalid");
  const installedBytes = command(adb, ["-s", serial, "exec-out", "cat", installedPath]);
  const apkPath = path.join(process.cwd(), "artifacts/native/phase18-garmin-acceptance/gym-tracker-phase18-garmin-acceptance-devtest.apk");
  const retainedBytes = readFileSync(apkPath);
  return Object.freeze({
    base_head: commandText("git", ["rev-parse", "HEAD"]),
    source_tree_sha256: sourceTreeSha256(process.cwd()),
    python_lock_sha256: createHash("sha256").update(readFileSync("modules/garmin-connect/python/garmin-python-lock.json")).digest("hex"),
    apk_sha256: createHash("sha256").update(retainedBytes).digest("hex"),
    signature_sha256: retainedSignatureSha256(apkPath),
    device_identity_sha256: createHash("sha256").update(JSON.stringify({ serial, abi, apiLevel, model })).digest("hex"),
    package: PACKAGE,
    profile: "development-test",
    abi,
  });
}

function parseBenchmarkMarker(payload, expectedNonce) {
  const invalidPayload = [
    payload === null,
    typeof payload !== "object",
    Array.isArray(payload),
    payload.run_nonce !== expectedNonce,
    payload.source !== "installed-route-log",
    payload.measurements === null,
    typeof payload.measurements !== "object",
    Array.isArray(payload.measurements),
    payload.measurement_context === null,
    typeof payload.measurement_context !== "object",
    Array.isArray(payload.measurement_context),
  ].some(Boolean);
  if (invalidPayload) fail("producer_invalid");
  return Object.freeze({
    measurements: Object.freeze(payload.measurements),
    measurement_context: Object.freeze(payload.measurement_context),
  });
}

function collectInstalledMeasurements() {
  const adb = resolveAndroidTool("adb");
  const runNonce = randomBytes(16).toString("hex");
  execFileSync(adb, ["logcat", "-c"], { stdio: "ignore" });
  execFileSync(adb, [
    "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d",
    `gymtracker-devtest://__phase18-garmin-acceptance?mode=benchmark&confirmation=${PHASE18_GARMIN_ACCEPTANCE_CONFIRMATION}&nonce=${runNonce}`,
    PACKAGE,
  ], { stdio: "ignore" });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const pid = commandText(adb, ["shell", "pidof", PACKAGE]);
    if (!/^\d+$/u.test(pid)) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      continue;
    }
    const log = execFileSync(adb, ["logcat", "--pid", pid, "-d"], { encoding: "utf8" });
    const line = log.split(/\r?\n/u).find((entry) => entry.includes(BENCHMARK_MARKER));
    if (line !== undefined) {
      return Object.freeze({
        producer_context: Object.freeze({
          kind: "installed-route-log",
          marker: BENCHMARK_MARKER,
          run_nonce: runNonce,
          source_pid: Number(pid),
        }),
        ...parseBenchmarkMarker(
          JSON.parse(line.slice(line.indexOf(BENCHMARK_MARKER) + BENCHMARK_MARKER.length)),
          runNonce,
        ),
      });
    }
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
  const readJson = choose(dependencies.readJson, (file) => JSON.parse(readFileSync(file, "utf8")));
  const readBytes = choose(dependencies.readBytes, readFileSync);
  const collect = choose(dependencies.collectMeasurements, collectInstalledMeasurements);
  const currentIdentity = choose(dependencies.resolveCurrentIdentity, resolveCurrentIdentity);
  const writeEvidence = choose(
    dependencies.writeEvidence,
    (value) => writeFileSync(options.evidence, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" }),
  );
  const manifest = readJson(options.manifest);
  const baselineBytes = readBytes(BASELINE);
  const baseline = JSON.parse(Buffer.from(baselineBytes).toString("utf8"));
  const collected = collect();
  const baselineSha256 = createHash("sha256").update(baselineBytes).digest("hex");
  const identity = currentIdentity();
  const evidence = Object.freeze({
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    producer: "phase18-garmin-benchmark/v2",
    producer_context: Object.freeze(collected.producer_context),
    status: "passed",
    identity: Object.freeze({
      ...identity,
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

export function executePhase18GarminBenchmarkCli() {
  try {
    process.stdout.write(`${JSON.stringify(executePhase18GarminBenchmark())}\n`);
  } catch (error) {
    process.stderr.write(`${errorMessage(error, "phase18_garmin_benchmark_failed")}\n`);
    process.exitCode = 1;
  }
}

runCliIfMain(import.meta.url, process.argv[1], executePhase18GarminBenchmarkCli);
