import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";

import {
  GARMIN_JSON_FIXTURE_MANIFEST,
  GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
  GARMIN_JSON_FIXTURE_PAYLOADS,
} from "../tests/fixtures/garmin-json/fixture-manifest.ts";
import { canonicalizeGarminPayload } from "../src/platform/garmin/canonicalGarminPayload.ts";
import {
  PHASE18_GARMIN_BENCHMARK_METRICS,
  executePhase18GarminBenchmark,
  executePhase18GarminBenchmarkCli,
  parsePhase18GarminBenchmarkArgs,
  validatePhase18GarminBenchmarkEvidence,
} from "./benchmark-phase18-garmin.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";

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
    installed_apk_sha256: HASH,
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
    producer_context: {
      kind: "installed-route-log",
      marker: "GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:",
      run_nonce: "c".repeat(32),
      source_pid: 123,
    },
    skipped: 0,
    ...overrides,
  };
}

function benchmarkMeasurements() {
  return Object.fromEntries(
    PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, samples(metric, 1)]),
  );
}

function benchmarkMeasurementContext(identitySha256) {
  const measurements = benchmarkMeasurements();
  return {
    profile: "physical-arm64",
    device_identity_sha256: identitySha256,
    commands: Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, `collect:${metric}`])),
    sample_labels: Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [
      metric,
      measurements[metric].map((_, index) => `${BASELINE.metrics[metric].mode}-${index + 1}`),
    ])),
  };
}

function writeExecutable(filePath, contents) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
  chmodSync(filePath, 0o755);
}

function captureCli(fn, argv) {
  const originalArgv = process.argv;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalExitCode = process.exitCode;
  let stdout = "";
  let stderr = "";
  process.argv = argv;
  process.stdout.write = ((chunk) => {
    stdout += String(chunk);
    return true;
  });
  process.stderr.write = ((chunk) => {
    stderr += String(chunk);
    return true;
  });
  process.exitCode = 0;
  try {
    fn();
  } finally {
    process.argv = originalArgv;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode;
  }
  return { stdout, stderr };
}

test("canonical manifest uses production component hashing and fidelity values", { concurrency: false }, () => {
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

test("benchmark retains every required raw measurement and reports exact maxima", { concurrency: false }, () => {
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

test("benchmark rejects stale identities, missing/non-finite samples, regressions, and private fields", { concurrency: false }, () => {
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

test("benchmark schema binds installed APK bytes and rejects retained/installed drift", { concurrency: false }, () => {
  const matching = evidence();
  assert.equal(matching.identity.installed_apk_sha256, matching.identity.apk_sha256);
  assert.doesNotThrow(
    () => validatePhase18GarminBenchmarkEvidence(matching, manifest(), BASELINE, BASELINE_BYTES),
  );

  const staleInstalled = evidence();
  staleInstalled.identity.installed_apk_sha256 = "c".repeat(64);
  assert.throws(
    () => validatePhase18GarminBenchmarkEvidence(staleInstalled, manifest(), BASELINE, BASELINE_BYTES),
    /phase18_garmin_benchmark_identity_invalid/u,
  );
});

test("benchmark execution requires exact paths and explicit Phase 20 authority", { concurrency: false }, () => {
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
  assert.throws(
    () => parsePhase18GarminBenchmarkArgs([
      "--manifest", MANIFEST_PATH,
      "--evidence", EVIDENCE_PATH,
      "--unknown",
    ]),
    /phase18_garmin_benchmark_arguments_invalid/u,
  );
});

test("benchmark CLI helper emits deferred success and bounded argument errors", { concurrency: false }, () => {
  const success = captureCli(executePhase18GarminBenchmarkCli, [
    "node",
    "scripts/benchmark-phase18-garmin.mjs",
    "--manifest", MANIFEST_PATH,
    "--evidence", EVIDENCE_PATH,
  ]);
  assert.match(success.stdout, /"status":"native_measurements_deferred"/u);

  const failure = captureCli(executePhase18GarminBenchmarkCli, [
    "node",
    "scripts/benchmark-phase18-garmin.mjs",
    "--manifest", MANIFEST_PATH,
    "--evidence", EVIDENCE_PATH,
    "--bad",
  ]);
  assert.match(failure.stderr, /phase18_garmin_benchmark_arguments_invalid/u);
});

test("execute collects installed samples and writes evidence with source-owned budgets", { concurrency: false }, () => {
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
      measurements: collected.measurements,
      measurement_context: collected.measurement_context,
      producer_context: collected.producer_context,
    }),
    resolveCurrentIdentity: () => collected.identity,
    writeEvidence: (value) => writes.push(value),
  });
  assert.equal(result.sample_counts.python_cold_start_ms, 5);
  assert.equal(writes.length, 1);
  assert.equal("budgets" in writes[0], false);
  assert.deepEqual(writes[0].producer_context, collected.producer_context);
  assert.deepEqual(executePhase18GarminBenchmark([
    "--manifest", MANIFEST_PATH,
    "--evidence", EVIDENCE_PATH,
  ]), {
    status: "native_measurements_deferred",
    fixture_manifest_sha256: GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
  });
});

test("execute follows the installed-route benchmark path in-process", { concurrency: false }, () => {
  const artifactRoot = path.resolve("artifacts/native/phase18-garmin-acceptance");
  const sdkRoot = path.resolve("artifacts/fake-android-sdk-benchmark");
  const apkPath = path.join(artifactRoot, "gym-tracker-phase18-garmin-acceptance-devtest.apk");
  const installedApkPath = path.resolve("artifacts/installed-benchmark.apk");
  const markerPath = path.resolve("artifacts/benchmark-logcat-count.txt");
  const pidPath = path.resolve("artifacts/benchmark-pid-count.txt");
  const noncePath = path.resolve("artifacts/benchmark-nonce.txt");
  const retainedApkBytes = Buffer.from("benchmark-apk");
  const deviceFacts = {
    serial: "PHASE18BENCH",
    abi: "arm64-v8a",
    api: "36",
    model: "phase18-bench-device",
  };
  const retainedSignatureSha256 = "b".repeat(64);
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const currentPythonLockSha256 = createHash("sha256").update(readFileSync("modules/garmin-connect/python/garmin-python-lock.json")).digest("hex");
  const retainedApkSha256 = createHash("sha256").update(retainedApkBytes).digest("hex");
  const deviceIdentitySha256 = createHash("sha256").update(JSON.stringify({
    serial: deviceFacts.serial,
    abi: deviceFacts.abi,
    apiLevel: deviceFacts.api,
    model: deviceFacts.model,
  })).digest("hex");
  const originalAndroidHome = process.env.ANDROID_HOME;
  const originalAndroidSdkRoot = process.env.ANDROID_SDK_ROOT;
  try {
    rmSync(artifactRoot, { recursive: true, force: true });
    rmSync(sdkRoot, { recursive: true, force: true });
    rmSync(path.resolve("artifacts/installed-benchmark.apk"), { force: true });
    mkdirSync(artifactRoot, { recursive: true });
    writeFileSync(apkPath, retainedApkBytes);
    writeFileSync(installedApkPath, retainedApkBytes);
    writeFileSync(path.join(artifactRoot, "build.json"), `${JSON.stringify({
      schema_version: 1,
      suite: "phase18-garmin-acceptance",
      profile: "development-test",
      package: "com.fchoo.gymtracker.devtest",
      abi: "arm64-v8a",
      js_bundle_embedded: true,
      base_head: currentHead,
      source_tree_sha256: sourceTreeSha256(process.cwd()),
      python_lock_sha256: currentPythonLockSha256,
      apk_sha256: retainedApkSha256,
      signature_sha256: retainedSignatureSha256,
      device_identity_sha256: deviceIdentitySha256,
    }, null, 2)}\n`);
    writeExecutable(path.join(sdkRoot, "platform-tools", "adb"), `#!/bin/sh
set -eu
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\n${deviceFacts.serial}\\tdevice\\n'
  exit 0
fi
if [ "$1" = "-s" ]; then
  shift 2
fi
if [ "$1" = "shell" ] && [ "$2" = "pidof" ] && [ "$3" = "com.fchoo.gymtracker.devtest" ]; then
  count=0
  [ -f "${pidPath}" ] && count=$(cat "${pidPath}")
  count=$((count + 1))
  printf '%s' "$count" > "${pidPath}"
  if [ "$count" -gt 1 ]; then printf '4242\\n'; fi
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "getprop" ]; then
  case "$3" in
    ro.product.cpu.abi) printf '${deviceFacts.abi}\\n' ;;
    ro.build.version.sdk) printf '${deviceFacts.api}\\n' ;;
    ro.product.model) printf '${deviceFacts.model}\\n' ;;
    *) exit 1 ;;
  esac
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "pm" ] && [ "$3" = "path" ] && [ "$4" = "com.fchoo.gymtracker.devtest" ]; then
  printf 'package:/data/app/phase18/base.apk\\n'
  exit 0
fi
if [ "$1" = "exec-out" ] && [ "$2" = "cat" ] && [ "$3" = "/data/app/phase18/base.apk" ]; then
  cat "${installedApkPath}"
  exit 0
fi
if [ "$1" = "logcat" ] && [ "$2" = "-c" ]; then
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "am" ] && [ "$3" = "start" ]; then
  nonce=$(printf '%s' "$8" | sed -n 's/.*nonce=\\([a-f0-9]*\\).*/\\1/p')
  printf '%s' "$nonce" > "${noncePath}"
  exit 0
fi
if [ "$1" = "logcat" ] && [ "$2" = "--pid" ] && [ "$4" = "-d" ]; then
  count=0
  [ -f "${markerPath}" ] && count=$(cat "${markerPath}")
  count=$((count + 1))
  printf '%s' "$count" > "${markerPath}"
  if [ "$count" -eq 1 ]; then
    printf 'waiting\\n'
  else
    nonce=$(cat "${noncePath}")
    printf 'I GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:%s\\n' "$(printf '%s' '${JSON.stringify({
      run_nonce: "",
      source: "installed-route-log",
      measurements: benchmarkMeasurements(),
      measurement_context: benchmarkMeasurementContext(deviceIdentitySha256),
    })}' | sed "s/\\\"run_nonce\\\":\\\"\\\"/\\\"run_nonce\\\":\\\"$nonce\\\"/")"
  fi
  exit 0
fi
exit 1
`);
    writeExecutable(path.join(sdkRoot, "build-tools", "35.0.0", "apksigner"), `#!/bin/sh
set -eu
printf 'Signer #1 certificate SHA-256 digest: ${retainedSignatureSha256}\\n'
`);
    writeFileSync(path.join(artifactRoot, "build.json"), `${JSON.stringify({
      schema_version: 1,
      suite: "phase18-garmin-acceptance",
      profile: "development-test",
      package: "com.fchoo.gymtracker.devtest",
      abi: "arm64-v8a",
      js_bundle_embedded: true,
      base_head: currentHead,
      source_tree_sha256: sourceTreeSha256(process.cwd()),
      python_lock_sha256: currentPythonLockSha256,
      apk_sha256: retainedApkSha256,
      signature_sha256: retainedSignatureSha256,
      device_identity_sha256: deviceIdentitySha256,
    }, null, 2)}\n`);
    process.env.ANDROID_HOME = sdkRoot;
    process.env.ANDROID_SDK_ROOT = sdkRoot;
    const report = executePhase18GarminBenchmark([
      "--manifest", MANIFEST_PATH,
      "--evidence", EVIDENCE_PATH,
      "--execute",
      "--phase20-native-checkpoint",
    ], {
      resolveCurrentIdentity: () => ({
        base_head: currentHead,
        source_tree_sha256: sourceTreeSha256(process.cwd()),
        python_lock_sha256: currentPythonLockSha256,
        apk_sha256: retainedApkSha256,
        installed_apk_sha256: retainedApkSha256,
        signature_sha256: retainedSignatureSha256,
        device_identity_sha256: deviceIdentitySha256,
        package: "com.fchoo.gymtracker.devtest",
        profile: "development-test",
        abi: "arm64-v8a",
      }),
    });
    assert.equal(report.sample_counts.python_warm_start_ms, 10);
    assert.equal(report.maxima.frame_time_ms, 30);
  } finally {
    if (originalAndroidHome === undefined) delete process.env.ANDROID_HOME;
    else process.env.ANDROID_HOME = originalAndroidHome;
    if (originalAndroidSdkRoot === undefined) delete process.env.ANDROID_SDK_ROOT;
    else process.env.ANDROID_SDK_ROOT = originalAndroidSdkRoot;
    rmSync(artifactRoot, { recursive: true, force: true });
    rmSync(sdkRoot, { recursive: true, force: true });
    rmSync(path.resolve("artifacts/installed-benchmark.apk"), { force: true });
    rmSync(markerPath, { force: true });
    rmSync(pidPath, { force: true });
    rmSync(noncePath, { force: true });
  }
});

test("installed-route benchmark fails closed on collector timeout", { concurrency: false }, () => {
  const sdkRoot = path.resolve("artifacts/fake-android-sdk-benchmark-timeout");
  const artifactRoot = path.resolve("artifacts/native/phase18-garmin-acceptance");
  const apkPath = path.join(artifactRoot, "gym-tracker-phase18-garmin-acceptance-devtest.apk");
  const installedApkPath = path.resolve("artifacts/installed-benchmark-timeout.apk");
  const retainedApkBytes = Buffer.from("benchmark-apk");
  const retainedSignatureSha256 = "b".repeat(64);
  const originalAndroidHome = process.env.ANDROID_HOME;
  const originalAndroidSdkRoot = process.env.ANDROID_SDK_ROOT;
  const originalDateNow = Date.now;
  let now = 0;
  try {
    mkdirSync(artifactRoot, { recursive: true });
    writeFileSync(apkPath, retainedApkBytes);
    writeFileSync(installedApkPath, retainedApkBytes);
    writeExecutable(path.join(sdkRoot, "platform-tools", "adb"), `#!/bin/sh
set -eu
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\nTIMEOUT\\tdevice\\n'
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "pidof" ]; then
  printf '1234\\n'
  exit 0
fi
if [ "$1" = "logcat" ] && [ "$2" = "--pid" ]; then
  printf 'no marker yet\\n'
  exit 0
fi
if [ "$1" = "logcat" ] && [ "$2" = "-c" ]; then exit 0; fi
if [ "$1" = "shell" ] && [ "$2" = "am" ]; then exit 0; fi
if [ "$1" = "-s" ]; then
  shift 2
  if [ "$1" = "shell" ] && [ "$2" = "pidof" ]; then printf '1234\\n'; exit 0; fi
fi
exit 0
`);
    writeExecutable(path.join(sdkRoot, "build-tools", "35.0.0", "apksigner"), `#!/bin/sh
set -eu
printf 'Signer #1 certificate SHA-256 digest: ${retainedSignatureSha256}\\n'
`);
    process.env.ANDROID_HOME = sdkRoot;
    process.env.ANDROID_SDK_ROOT = sdkRoot;
    Date.now = () => {
      now += 61_000;
      return now;
    };
    assert.throws(
      () => executePhase18GarminBenchmark([
        "--manifest", MANIFEST_PATH,
        "--evidence", EVIDENCE_PATH,
        "--execute",
        "--phase20-native-checkpoint",
      ], {
        readJson: () => manifest(),
        readBytes: () => BASELINE_BYTES,
        resolveCurrentIdentity: () => identity(),
        writeEvidence: () => {
          throw new Error("should not write");
        },
      }),
      /phase18_garmin_benchmark_collector_timeout/u,
    );
  } finally {
    Date.now = originalDateNow;
    if (originalAndroidHome === undefined) delete process.env.ANDROID_HOME;
    else process.env.ANDROID_HOME = originalAndroidHome;
    if (originalAndroidSdkRoot === undefined) delete process.env.ANDROID_SDK_ROOT;
    else process.env.ANDROID_SDK_ROOT = originalAndroidSdkRoot;
    rmSync(sdkRoot, { recursive: true, force: true });
    rmSync(installedApkPath, { force: true });
  }
});

test("focused coverage gate registers every Phase 18 integrity-critical module", { concurrency: false }, () => {
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
    "scripts/benchmark-phase18-garmin.test.mjs",
    "scripts/phase18-garmin-proof.test.mjs",
    "scripts/phase18-build-manifest.test.mjs",
    "scripts/phase18-device-identity.test.mjs",
    "scripts/phase18-garmin-acceptance.test.mjs",
    "scripts/phase18-garmin-adversarial.test.mjs",
    "scripts/run-phase18-python-coverage.test.mjs",
    "scripts/run-phase18-kotlin-coverage.test.mjs",
    "scripts/phase18-language-coverage.test.mjs",
    "scripts/phase18-verifier-cli.test.mjs",
    "tests/integration/garmin-import-portability.test.ts",
    "tests/integration/imported-activity-facts.test.ts",
    "tests/integration/running-activity-match.test.ts",
    "tests/sqlite-host/garminSyncSummaryRepository.test.ts",
    "tests/sqlite-host/logicalMergeRepository.test.ts",
  ]) assert.match(source, new RegExp(testFile.replace(/[./]/gu, "\\$&"), "u"));
  assert.match(languageCoverage, /phase18\/python-coverage\.json/u);
  assert.match(languageCoverage, /phase18\/kotlin-coverage\.json/u);
  assert.match(source, /loadPhase18LanguageCoverageReports/u);
  for (const evidenceFile of [
    "scripts/benchmark-phase18-garmin.mjs",
    "scripts/phase18-build-manifest.mjs",
    "scripts/phase18-device-identity.mjs",
    "scripts/phase18-language-coverage.mjs",
    "scripts/phase18-privacy-scan.mjs",
    "scripts/run-phase18-kotlin-coverage.mjs",
    "scripts/verify-phase18-garmin-acceptance.mjs",
    "scripts/verify-phase18-garmin-adversarial.mjs",
    "scripts/verify-phase18-garmin-proof.mjs",
  ]) assert.match(source, new RegExp(evidenceFile.replace(/[./]/gu, "\\$&"), "u"));
  assert.match(source, /--test-coverage-lines=100/u);
  assert.match(source, /--test-coverage-branches=100/u);
  assert.match(source, /--test-coverage-functions=100/u);
  assert.match(source, /--focus-phase18/u);
  assert.match(source, /delete evidenceEnvironment\.ANDROID_HOME/u);
  assert.match(source, /delete evidenceEnvironment\.ANDROID_SDK_ROOT/u);
  assert.match(source, /delete evidenceEnvironment\.ANDROID_SERIAL/u);
  assert.match(source, /env: evidenceEnvironment/u);
});

test("package scripts expose the guarded benchmark and focused coverage gate", { concurrency: false }, () => {
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
