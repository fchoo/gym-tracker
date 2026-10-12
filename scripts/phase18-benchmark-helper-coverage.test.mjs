import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
} from "../tests/fixtures/garmin-json/fixture-manifest.ts";
import {
  PHASE18_GARMIN_BENCHMARK_METRICS,
  collectInstalledMeasurements,
  executePhase18GarminBenchmark,
  parsePhase18GarminBenchmarkArgs,
  resolvePhase18GarminBenchmarkCurrentIdentity,
  validatePhase18GarminBenchmarkEvidence,
} from "./benchmark-evidence-runner.mjs";

const HASH = "a".repeat(64);
const HEAD = "b".repeat(40);
const MANIFEST_PATH = "artifacts/native/phase18-garmin-acceptance/build.json";
const EVIDENCE_PATH = "artifacts/native/phase18-garmin-acceptance/benchmark.json";
const BASELINE_PATH = "tests/fixtures/garmin-json/phase18-performance-baseline.json";
const REPO_BASELINE_BYTES = readFileSync(BASELINE_PATH);

function withEnv(updates, callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function withFakeSdk({ adbScript, apksignerScript } = {}, callback) {
  const root = mkdtempSync(path.join(tmpdir(), "phase18-benchmark-sdk-"));
  const adbPath = path.join(root, "platform-tools", "adb");
  const apksignerPath = path.join(root, "build-tools", "35.0.0", "apksigner");
  if (adbScript !== undefined) {
    mkdirSync(path.dirname(adbPath), { recursive: true });
    writeFileSync(adbPath, adbScript);
    chmodSync(adbPath, 0o755);
  }
  if (apksignerScript !== undefined) {
    mkdirSync(path.dirname(apksignerPath), { recursive: true });
    writeFileSync(apksignerPath, apksignerScript);
    chmodSync(apksignerPath, 0o755);
  }
  try {
    return withEnv({ ANDROID_HOME: root, ANDROID_SDK_ROOT: root }, () => callback(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function withTempCwd(callback) {
  const previous = process.cwd();
  const tempRoot = mkdtempSync(path.join(tmpdir(), "phase18-benchmark-cwd-"));
  try {
    process.chdir(tempRoot);
    return callback(tempRoot);
  } finally {
    process.chdir(previous);
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function initializeTempRepo() {
  mkdirSync("modules/garmin-connect/python", { recursive: true });
  writeFileSync("modules/garmin-connect/python/garmin-python-lock.json", "{}\n");
  execFileSync("git", ["init"], { stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "TRAE CLI"], { stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "noreply@users.noreply.github.com"], { stdio: "ignore" });
  execFileSync("git", ["add", "."], { stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "temp repo"], { stdio: "ignore" });
}

function manifest(overrides = {}) {
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
    ...overrides,
  };
}

function baseline(overrides = {}) {
  return {
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    profile: "physical-arm64",
    metrics: Object.fromEntries(
      PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [
        metric,
        { minimum_samples: 1, maximum: 10, ...overrides[metric] },
      ]),
    ),
  };
}

function validEvidence(baselineBytes, metricValue = 1) {
  const baselineHash = createSha(baselineBytes);
  const measurements = Object.fromEntries(
    PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, [metricValue]]),
  );
  return {
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    producer: "phase18-garmin-benchmark/v2",
    status: "passed",
    skipped: 0,
    identity: {
      ...manifest(),
      installed_apk_sha256: HASH,
      fixture_manifest_sha256: GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
      workout_baseline_sha256: baselineHash,
    },
    budget_source: {
      kind: "source-owned-versioned-baseline",
      path: "tests/fixtures/garmin-json/phase18-performance-baseline.json",
      report_sha256: baselineHash,
    },
    measurements,
    measurement_context: {
      profile: "physical-arm64",
      device_identity_sha256: HASH,
      commands: Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, `collect:${metric}`])),
      sample_labels: Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, ["sample-1"]])),
    },
    producer_context: {
      kind: "installed-route-log",
      marker: "GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:",
      run_nonce: "c".repeat(32),
      source_pid: 4242,
    },
  };
}

function createSha(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("benchmark validator returns maxima and rejects privacy-sensitive strings and keys", () => {
  const baselineReport = baseline();
  const baselineBytes = Buffer.from(JSON.stringify(baselineReport));
  const evidence = validEvidence(baselineBytes);

  const result = validatePhase18GarminBenchmarkEvidence(evidence, manifest(), baselineReport, baselineBytes);
  assert.deepEqual(result.sample_counts, Object.fromEntries(
    PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, 1]),
  ));
  assert.deepEqual(result.maxima, Object.fromEntries(
    PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, 1]),
  ));

  const stringLeak = structuredClone(evidence);
  stringLeak.measurement_context.commands.apk_size_bytes = "https://example.invalid";
  assert.throws(
    () => validatePhase18GarminBenchmarkEvidence(stringLeak, manifest(), baselineReport, baselineBytes),
    /phase18_garmin_benchmark_privacy_invalid/u,
  );

  const keyLeak = structuredClone(evidence);
  keyLeak.measurement_context.commands.secret_token = "bounded";
  assert.throws(
    () => validatePhase18GarminBenchmarkEvidence(keyLeak, manifest(), baselineReport, baselineBytes),
    /phase18_garmin_benchmark_privacy_invalid/u,
  );

  assert.throws(
    () => validatePhase18GarminBenchmarkEvidence(evidence, null, baselineReport, baselineBytes),
    /phase18_garmin_benchmark_identity_invalid/u,
  );

  assert.throws(
    () => validatePhase18GarminBenchmarkEvidence(
      evidence,
      manifest(),
      { ...baselineReport, metrics: {} },
      baselineBytes,
    ),
    /phase18_garmin_benchmark_measurement_schema_invalid/u,
  );

  const invalidBaseline = baseline({
    apk_size_bytes: { minimum_samples: 1, maximum: Number.NaN },
  });
  const invalidBaselineBytes = Buffer.from(JSON.stringify(invalidBaseline));
  const invalidEvidence = validEvidence(invalidBaselineBytes);
  assert.throws(
    () => validatePhase18GarminBenchmarkEvidence(
      invalidEvidence,
      manifest(),
      invalidBaseline,
      invalidBaselineBytes,
    ),
    /phase18_garmin_benchmark_samples_invalid:apk_size_bytes/u,
  );
});

test("benchmark parser rejects unknown switches and execution can defer without native work", () => {
  assert.throws(
    () => parsePhase18GarminBenchmarkArgs([
      "--manifest",
      MANIFEST_PATH,
      "--evidence",
      EVIDENCE_PATH,
      "--unknown",
    ]),
    /phase18_garmin_benchmark_arguments_invalid/u,
  );
  assert.throws(
    () => parsePhase18GarminBenchmarkArgs([
      "--manifest",
      MANIFEST_PATH,
      "--evidence",
      EVIDENCE_PATH,
      "--phase20-native-checkpoint",
    ]),
    /phase18_garmin_benchmark_arguments_invalid/u,
  );

  assert.deepEqual(
    executePhase18GarminBenchmark(["--manifest", MANIFEST_PATH, "--evidence", EVIDENCE_PATH]),
    {
      status: "native_measurements_deferred",
      fixture_manifest_sha256: GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
    },
  );
});

test("benchmark execution covers default manifest, baseline, and evidence file IO", () => {
  const baselineBytes = readFileSync(BASELINE_PATH);
  const baselineReport = JSON.parse(baselineBytes.toString("utf8"));
  const baselineHash = createSha(baselineBytes);
  const manifestBytes = JSON.stringify(manifest());
  const measurements = Object.fromEntries(
    PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [
      metric,
      Array.from({ length: baselineReport.metrics[metric].minimum_samples }, () => 1),
    ]),
  );
  const measurementContext = {
    profile: "physical-arm64",
    device_identity_sha256: HASH,
    commands: Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, `collect:${metric}`])),
    sample_labels: Object.fromEntries(
      PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [
        metric,
        Array.from({ length: measurements[metric].length }, (_, index) => `sample-${index + 1}`),
      ]),
    ),
  };
  withTempCwd(() => {
    mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
    mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    writeFileSync(MANIFEST_PATH, `${manifestBytes}\n`);
    writeFileSync(BASELINE_PATH, baselineBytes);
    rmSync(EVIDENCE_PATH, { force: true });
    const result = executePhase18GarminBenchmark(
      ["--manifest", MANIFEST_PATH, "--evidence", EVIDENCE_PATH, "--execute", "--phase20-native-checkpoint"],
      {
        collectMeasurements: () => ({
          measurements,
          measurement_context: measurementContext,
          producer_context: {
            kind: "installed-route-log",
            marker: "GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:",
            run_nonce: "d".repeat(32),
            source_pid: 9001,
          },
        }),
        resolveCurrentIdentity: () => ({
          ...manifest(),
          installed_apk_sha256: HASH,
          fixture_manifest_sha256: GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
          workout_baseline_sha256: baselineHash,
        }),
      },
    );
    assert.equal(result.sample_counts.frame_time_ms, baselineReport.metrics.frame_time_ms.minimum_samples);
    const written = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
    assert.equal(written.budget_source.report_sha256, baselineHash);
    assert.equal(written.producer_context.source_pid, 9001);
  });
});

test("benchmark collector retries after an empty pid poll and then parses the installed marker", () => {
  withFakeSdk({
    adbScript: `#!/bin/sh
STATE_DIR=$(dirname "$0")/../state
mkdir -p "$STATE_DIR"
NONCE_FILE="$STATE_DIR/nonce"
PID_FILE="$STATE_DIR/pidof-count"
if [ "$1" = "logcat" ] && [ "$2" = "-c" ]; then
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "am" ] && [ "$3" = "start" ]; then
  for arg in "$@"; do
    case "$arg" in
      *nonce=*) printf '%s' "\${arg##*nonce=}" > "$NONCE_FILE" ;;
    esac
  done
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "pidof" ]; then
  count=0
  [ -f "$PID_FILE" ] && count=$(cat "$PID_FILE")
  count=$((count + 1))
  printf '%s' "$count" > "$PID_FILE"
  if [ "$count" -eq 1 ]; then
    printf '\n'
  else
    printf '4242\n'
  fi
  exit 0
fi
if [ "$1" = "logcat" ] && [ "$2" = "--pid" ] && [ "$4" = "-d" ]; then
  nonce=$(cat "$NONCE_FILE")
  printf 'GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:{"run_nonce":"%s","source":"installed-route-log","measurements":{"apk_size_bytes":[1]},"measurement_context":{"profile":"physical-arm64"}}\n' "$nonce"
  exit 0
fi
exit 1
`,
  }, () => {
    const result = collectInstalledMeasurements();
    assert.equal(result.producer_context.source_pid, 4242);
    assert.equal(result.producer_context.kind, "installed-route-log");
    assert.deepEqual(result.measurements, { apk_size_bytes: [1] });
    assert.deepEqual(result.measurement_context, { profile: "physical-arm64" });
  });
});

test("benchmark identity helpers fail for malformed retained signatures and invalid installed paths", () => {
  const benchmarkApk = "artifacts/native/phase18-garmin-acceptance/gym-tracker-phase18-garmin-acceptance-devtest.apk";
  withTempCwd(() => {
    initializeTempRepo();
    mkdirSync(path.dirname(benchmarkApk), { recursive: true });
    mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    writeFileSync(benchmarkApk, "apk");
    writeFileSync(BASELINE_PATH, REPO_BASELINE_BYTES);
    assert.throws(
      () => withFakeSdk({
        adbScript: `#!/bin/sh
if [ "$1" = "devices" ]; then printf 'List of devices attached\nSERIAL\tdevice\n'; exit 0; fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "getprop" ]; then
  case "$5" in
    ro.product.cpu.abi) printf 'arm64-v8a\n' ;;
    ro.build.version.sdk) printf '35\n' ;;
    ro.product.model) printf 'Pixel 9\n' ;;
  esac
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "pm" ] && [ "$5" = "path" ]; then
  printf 'package:/data/app/com.fchoo.gymtracker.devtest/base.apk\n'
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "exec-out" ] && [ "$4" = "cat" ]; then
  printf 'apk'
  exit 0
fi
exit 0
`,
        apksignerScript: "#!/bin/sh\nprintf 'certificate SHA-256 digest: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:\\n'\n",
      }, () => executePhase18GarminBenchmark([
        "--manifest",
        MANIFEST_PATH,
        "--evidence",
        EVIDENCE_PATH,
        "--execute",
        "--phase20-native-checkpoint",
      ], {
        readJson: () => manifest(),
        readBytes: () => readFileSync(BASELINE_PATH),
        collectMeasurements: () => ({
          measurements: Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, [1]])),
          measurement_context: {
            profile: "physical-arm64",
            device_identity_sha256: HASH,
            commands: Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, metric])),
            sample_labels: Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, ["sample"]])),
          },
          producer_context: {
            kind: "installed-route-log",
            marker: "GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:",
            run_nonce: "e".repeat(32),
            source_pid: 99,
          },
        }),
      })),
      /phase18_garmin_benchmark_signature_unreadable/u,
    );

    assert.throws(
      () => withFakeSdk({
        adbScript: `#!/bin/sh
if [ "$1" = "devices" ]; then printf 'List of devices attached\nSERIAL\tdevice\n'; exit 0; fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "getprop" ]; then
  case "$5" in
    ro.product.cpu.abi) printf 'x86_64\n' ;;
    ro.build.version.sdk) printf '35\n' ;;
    ro.product.model) printf 'Pixel 9\n' ;;
  esac
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "pm" ] && [ "$5" = "path" ]; then
  printf 'package:/data/app/com.fchoo.gymtracker.devtest/base.apk\n'
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "exec-out" ] && [ "$4" = "cat" ]; then
  printf 'installed-apk'
  exit 0
fi
exit 0
`,
        apksignerScript: "#!/bin/sh\nprintf 'certificate SHA-256 digest: aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa\\n'\n",
      }, () => executePhase18GarminBenchmark([
        "--manifest",
        MANIFEST_PATH,
        "--evidence",
        EVIDENCE_PATH,
        "--execute",
        "--phase20-native-checkpoint",
      ], {
        readJson: () => manifest(),
        readBytes: () => readFileSync(BASELINE_PATH),
        collectMeasurements: () => ({
          measurements: Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, [1]])),
          measurement_context: {
            profile: "physical-arm64",
            device_identity_sha256: HASH,
            commands: Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, metric])),
            sample_labels: Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [metric, ["sample"]])),
          },
          producer_context: {
            kind: "installed-route-log",
            marker: "GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:",
            run_nonce: "f".repeat(32),
            source_pid: 100,
          },
        }),
      })),
      /phase18_garmin_benchmark_device_identity_invalid/u,
    );
  });
});

test("benchmark current identity rejects installed APK bytes that differ from the retained APK", () => {
  const benchmarkApk = "artifacts/native/phase18-garmin-acceptance/gym-tracker-phase18-garmin-acceptance-devtest.apk";
  withTempCwd(() => {
    initializeTempRepo();
    mkdirSync(path.dirname(benchmarkApk), { recursive: true });
    writeFileSync(benchmarkApk, "retained-apk");

    assert.throws(
      () => withFakeSdk({
        adbScript: `#!/bin/sh
if [ "$1" = "devices" ]; then printf 'List of devices attached\nSERIAL\tdevice\n'; exit 0; fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "getprop" ]; then
  case "$5" in
    ro.product.cpu.abi) printf 'arm64-v8a\n' ;;
    ro.build.version.sdk) printf '35\n' ;;
    ro.product.model) printf 'Pixel 9\n' ;;
  esac
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "pm" ] && [ "$5" = "path" ]; then
  printf 'package:/data/app/com.fchoo.gymtracker.devtest/base.apk\n'
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "exec-out" ] && [ "$4" = "cat" ]; then
  printf 'different-installed-apk'
  exit 0
fi
exit 1
`,
        apksignerScript: "#!/bin/sh\nprintf 'certificate SHA-256 digest: aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa\\n'\n",
      }, () => resolvePhase18GarminBenchmarkCurrentIdentity()),
      /phase18_garmin_benchmark_installed_apk_mismatch/u,
    );
  });
});

test("benchmark collector rejects structurally invalid marker payloads", () => {
  withFakeSdk({
    adbScript: `#!/bin/sh
STATE_DIR=$(dirname "$0")/../state
mkdir -p "$STATE_DIR"
NONCE_FILE="$STATE_DIR/nonce"
if [ "$1" = "logcat" ] && [ "$2" = "-c" ]; then exit 0; fi
if [ "$1" = "shell" ] && [ "$2" = "am" ] && [ "$3" = "start" ]; then
  for arg in "$@"; do
    case "$arg" in
      *nonce=*) printf '%s' "\${arg##*nonce=}" > "$NONCE_FILE" ;;
    esac
  done
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "pidof" ]; then printf '4242\n'; exit 0; fi
if [ "$1" = "logcat" ] && [ "$2" = "--pid" ] && [ "$4" = "-d" ]; then
  nonce=$(cat "$NONCE_FILE")
  printf 'GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:{"run_nonce":"%s","source":"installed-route-log","measurements":[],"measurement_context":[]}\n' "$nonce"
  exit 0
fi
exit 1
`,
  }, () => {
    assert.throws(() => collectInstalledMeasurements(), /phase18_garmin_benchmark_producer_invalid/u);
  });
});

test("benchmark collector fails closed after a bounded timeout when no marker is emitted", () => {
  const originalNow = Date.now;
  const originalWait = Atomics.wait;
  const ticks = [0, 1, 60_001];
  Date.now = () => ticks.shift() ?? 60_001;
  Atomics.wait = () => "timed-out";
  try {
    withFakeSdk({
      adbScript: `#!/bin/sh
if [ "$1" = "logcat" ] && [ "$2" = "-c" ]; then exit 0; fi
if [ "$1" = "shell" ] && [ "$2" = "am" ] && [ "$3" = "start" ]; then exit 0; fi
if [ "$1" = "shell" ] && [ "$2" = "pidof" ]; then printf '4242\n'; exit 0; fi
if [ "$1" = "logcat" ] && [ "$2" = "--pid" ] && [ "$4" = "-d" ]; then printf 'no marker here\n'; exit 0; fi
exit 1
`,
    }, () => {
      assert.throws(() => collectInstalledMeasurements(), /phase18_garmin_benchmark_collector_timeout/u);
    });
  } finally {
    Date.now = originalNow;
    Atomics.wait = originalWait;
  }
});
