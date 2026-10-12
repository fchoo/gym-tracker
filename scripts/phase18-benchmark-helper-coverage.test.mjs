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
  measurements.python_cold_start_ms = [1, 2, 3, 4, 5];
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
      sample_labels: Object.fromEntries(PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [
        metric,
        measurements[metric].map((_, index) => `sample-${index + 1}`),
      ])),
    },
    producer_context: {
      ...completedColdStartContext(4242, "c".repeat(32)),
      kind: "installed-route-log",
      marker: "GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:",
      process_id: 4242,
      review_required: [],
      run_nonce: "c".repeat(32),
      source_pid: 4242,
      status: "passed",
    },
  };
}

function createSha(value) {
  return createHash("sha256").update(value).digest("hex");
}

function coldStartSamples(processIds, count) {
  return Array.from({ length: count }, (_, index) => ({
    value: index + 1,
    observed_at_monotonic_ms: 40_000 + index,
    operation: "native-runtime:python-cold-start",
    process_id: processIds[index],
    sequence: index + 1,
  }));
}

function completedColdStartContext(finalProcessId, finalNonce, values = [1, 2, 3, 4, 5]) {
  const processIds = Array.from(
    { length: 5 },
    (_, index) => finalProcessId - 4 + index,
  );
  const samples = coldStartSamples(processIds, 5).map((sample, index) => ({
    ...sample,
    value: values[index],
  }));
  return {
    cold_start_handshake: {
      next_sequence: null,
      samples,
    },
    cold_start_runs: processIds.map((process_id, index) => ({
      process_id,
      run_nonce: index === 4 ? finalNonce : String(index + 1).repeat(32),
      sequence: index + 1,
    })),
  };
}

function coldStartMarkerPayload(sequence, processIds) {
  const samples = coldStartSamples(processIds, sequence);
  const complete = sequence === 5;
  return {
    run_nonce: "__NONCE__",
    process_id: processIds[sequence - 1],
    source: "installed-route-log",
    status: complete ? "passed" : "REVIEW_REQUIRED",
    review_required: complete ? [] : ["python_cold_start_ms:minimum_samples_missing"],
    cold_start_handshake: {
      next_sequence: complete ? null : sequence + 1,
      samples,
    },
    measurements: {
      python_cold_start_ms: samples.map(({ value }) => value),
    },
    measurement_context: { profile: "physical-arm64" },
  };
}

function withColdStartCollector({ processIds, mutatePayload }, callback) {
  return withFakeSdk({
    adbScript: `#!/bin/sh
set -eu
STATE_DIR=$(dirname "$0")/../state
mkdir -p "$STATE_DIR"
CURRENT_SEQUENCE="$STATE_DIR/current-sequence"
NONCE_FILE="$STATE_DIR/nonce"
LAUNCHES_FILE="$STATE_DIR/launches"
FORCE_STOPS_FILE="$STATE_DIR/force-stops"
if [ "$1" = "logcat" ] && [ "$2" = "-c" ]; then exit 0; fi
if [ "$1" = "shell" ] && [ "$2" = "am" ] && [ "$3" = "force-stop" ]; then
  printf 'force-stop\n' >> "$FORCE_STOPS_FILE"
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "am" ] && [ "$3" = "start" ]; then
  sequence=''
  nonce=''
  for arg in "$@"; do
    case "$arg" in
      *coldStartSequence=*) sequence=$(printf '%s' "$arg" | sed -n 's/.*coldStartSequence=\\([1-5]\\).*/\\1/p') ;;
    esac
    case "$arg" in *nonce=*) nonce_part=\${arg##*nonce=}; nonce=\${nonce_part%%&*} ;; esac
  done
  [ -n "$sequence" ] || sequence=1
  printf '%s' "$sequence" > "$CURRENT_SEQUENCE"
  printf '%s' "$nonce" > "$NONCE_FILE"
  printf '%s\n' "$*" >> "$LAUNCHES_FILE"
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "pidof" ]; then
  sequence=$(cat "$CURRENT_SEQUENCE")
  poll_file="$STATE_DIR/pid-poll-$sequence"
  count=0
  [ -f "$poll_file" ] && count=$(cat "$poll_file")
  count=$((count + 1))
  printf '%s' "$count" > "$poll_file"
  if [ -f "$STATE_DIR/empty-first-pid" ] && [ "$count" -eq 1 ]; then
    printf '\n'
    exit 0
  fi
  sed -n "\${sequence}p" "$STATE_DIR/pids"
  exit 0
fi
if [ "$1" = "logcat" ] && [ "$2" = "--pid" ] && [ "$4" = "-d" ]; then
  sequence=$(cat "$CURRENT_SEQUENCE")
  nonce=$(cat "$NONCE_FILE")
  payload=$(sed "s/__NONCE__/$nonce/g" "$STATE_DIR/payload-$sequence.json")
  printf 'GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:%s\n' "$payload"
  if [ -f "$STATE_DIR/extra-$sequence.json" ]; then
    extra=$(sed "s/__NONCE__/$nonce/g" "$STATE_DIR/extra-$sequence.json")
    printf 'GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:%s\n' "$extra"
  fi
  exit 0
fi
exit 1
`,
  }, (root) => {
    const state = path.join(root, "state");
    mkdirSync(state, { recursive: true });
    writeFileSync(path.join(state, "pids"), `${processIds.join("\n")}\n`);
    for (let sequence = 1; sequence <= 5; sequence += 1) {
      const payload = coldStartMarkerPayload(sequence, processIds);
      mutatePayload?.(payload, sequence);
      writeFileSync(
        path.join(state, `payload-${sequence}.json`),
        JSON.stringify(payload),
      );
    }
    return callback({ root, state });
  });
}

test("benchmark validator returns maxima and rejects privacy-sensitive strings and keys", () => {
  const baselineReport = baseline();
  const baselineBytes = Buffer.from(JSON.stringify(baselineReport));
  const evidence = validEvidence(baselineBytes);

  const result = validatePhase18GarminBenchmarkEvidence(evidence, manifest(), baselineReport, baselineBytes);
  assert.deepEqual(result.sample_counts, Object.fromEntries(
    PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [
      metric,
      metric === "python_cold_start_ms" ? 5 : 1,
    ]),
  ));
  assert.deepEqual(result.maxima, Object.fromEntries(
    PHASE18_GARMIN_BENCHMARK_METRICS.map((metric) => [
      metric,
      metric === "python_cold_start_ms" ? 5 : 1,
    ]),
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

  for (const mutate of [
    (candidate) => { delete candidate.producer_context.review_required; },
    (candidate) => { candidate.producer_context.status = "REVIEW_REQUIRED"; },
    (candidate) => { candidate.producer_context.review_required = ["apk_size_bytes:measurement_unavailable"]; },
    (candidate) => { candidate.producer_context.process_id = 7; },
    (candidate) => { candidate.producer_context.cold_start_handshake.samples.pop(); },
    (candidate) => { candidate.producer_context.cold_start_runs[0].sequence = 2; },
  ]) {
    const invalidProducerVerdict = structuredClone(evidence);
    mutate(invalidProducerVerdict);
    assert.throws(
      () => validatePhase18GarminBenchmarkEvidence(
        invalidProducerVerdict,
        manifest(),
        baselineReport,
        baselineBytes,
      ),
      /phase18_garmin_benchmark_measurement_schema_invalid/u,
    );
  }

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
            ...completedColdStartContext(
              9001,
              "d".repeat(32),
              measurements.python_cold_start_ms,
            ),
            kind: "installed-route-log",
            marker: "GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:",
            process_id: 9001,
            review_required: [],
            run_nonce: "d".repeat(32),
            source_pid: 9001,
            status: "passed",
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
  const processIds = [4701, 4702, 4703, 4704, 4705];
  withColdStartCollector({ processIds }, ({ state }) => {
    writeFileSync(path.join(state, "empty-first-pid"), "enabled");
    const result = collectInstalledMeasurements();
    assert.equal(result.producer_context.source_pid, 4705);
    assert.equal(result.producer_context.kind, "installed-route-log");
    assert.deepEqual(result.measurements, { python_cold_start_ms: [1, 2, 3, 4, 5] });
    assert.deepEqual(result.measurement_context, { profile: "physical-arm64" });
  });
});

test("benchmark collector completes five nonce-bound fresh-process cold starts before the remaining producer stage", () => {
  const processIds = [4101, 4102, 4103, 4104, 4105];
  withColdStartCollector({ processIds }, ({ state }) => {
    const result = collectInstalledMeasurements();
    assert.equal(result.producer_context.status, "passed");
    assert.equal(result.producer_context.process_id, 4105);
    assert.deepEqual(
      result.producer_context.cold_start_handshake.samples.map(({ process_id, sequence }) => ({
        process_id,
        sequence,
      })),
      processIds.map((process_id, index) => ({ process_id, sequence: index + 1 })),
    );
    assert.deepEqual(
      result.producer_context.cold_start_runs.map(({ process_id, sequence }) => ({
        process_id,
        sequence,
      })),
      processIds.map((process_id, index) => ({ process_id, sequence: index + 1 })),
    );
    assert.equal(new Set(result.producer_context.cold_start_runs.map(({ run_nonce }) => run_nonce)).size, 5);

    const launches = readFileSync(path.join(state, "launches"), "utf8").trim().split("\n");
    assert.equal(launches.length, 5);
    assert.equal(readFileSync(path.join(state, "force-stops"), "utf8").trim().split("\n").length, 5);
    for (const [index, launch] of launches.entries()) {
      const sequence = index + 1;
      assert.match(launch, new RegExp(`coldStartSequence=${sequence}(?:&|\\s|$)`, "u"));
      assert.match(launch, /nonce=[a-f0-9]{32}(?:&|\s|$)/u);
      const encodedSamples = launch.match(/[?&]coldStartSamples=([^&\s]+)/u)?.[1];
      if (sequence === 1) {
        assert.equal(encodedSamples, undefined);
      } else {
        const samples = JSON.parse(decodeURIComponent(encodedSamples));
        assert.deepEqual(samples, coldStartSamples(processIds, sequence - 1));
      }
    }
  });
});

test("benchmark cold-start handshake rejects repeated PIDs, gaps, order drift, stale nonces, and incompleteness", () => {
  const cases = [
    {
      name: "repeated-pid",
      processIds: [4201, 4202, 4202, 4204, 4205],
    },
    {
      name: "sequence-gap",
      processIds: [4301, 4302, 4303, 4304, 4305],
      mutatePayload(payload, sequence) {
        if (sequence === 3) payload.cold_start_handshake.samples[1].sequence = 3;
      },
    },
    {
      name: "order-drift",
      processIds: [4401, 4402, 4403, 4404, 4405],
      mutatePayload(payload, sequence) {
        if (sequence === 3) payload.cold_start_handshake.samples.reverse();
      },
    },
    {
      name: "stale-nonce",
      processIds: [4501, 4502, 4503, 4504, 4505],
      mutatePayload(payload, sequence) {
        if (sequence === 2) payload.run_nonce = "0".repeat(32);
      },
    },
    {
      name: "process-id-mismatch",
      processIds: [4551, 4552, 4553, 4554, 4555],
      mutatePayload(payload, sequence) {
        if (sequence === 3) payload.process_id = 9999;
      },
    },
    {
      name: "final-review",
      processIds: [4571, 4572, 4573, 4574, 4575],
      mutatePayload(payload, sequence) {
        if (sequence === 5) {
          payload.status = "REVIEW_REQUIRED";
          payload.review_required = ["python_cold_start_ms:minimum_samples_missing"];
        }
      },
    },
    {
      name: "incomplete",
      processIds: [4601, 4602, 4603, 4604, 4605],
      mutatePayload(payload, sequence) {
        if (sequence === 5) {
          payload.status = "REVIEW_REQUIRED";
          payload.review_required = ["python_cold_start_ms:minimum_samples_missing"];
          payload.cold_start_handshake.samples.pop();
          payload.cold_start_handshake.next_sequence = 5;
          payload.measurements.python_cold_start_ms.pop();
        }
      },
    },
  ];
  for (const scenario of cases) {
    withColdStartCollector(scenario, () => {
      assert.throws(
        () => collectInstalledMeasurements(),
        /phase18_garmin_benchmark_producer_(?:invalid|process_reused)/u,
        scenario.name,
      );
    });
  }
});

test("benchmark collector retains producer verdict metadata and rejects ambiguous or unpassed PID markers", () => {
  const processIds = [4801, 4802, 4803, 4804, 4805];
  for (const { name, extra } of [
    { name: "duplicate-pass", extra: coldStartMarkerPayload(5, processIds) },
    {
      name: "pass-failure",
      extra: {
        ...coldStartMarkerPayload(5, processIds),
        status: "REVIEW_REQUIRED",
        review_required: ["python_cold_start_ms:minimum_samples_missing"],
      },
    },
    { name: "malformed-valid", extra: "{malformed" },
  ]) {
    withColdStartCollector({ processIds }, ({ state }) => {
      writeFileSync(
        path.join(state, "extra-5.json"),
        typeof extra === "string" ? extra : JSON.stringify(extra),
      );
      assert.throws(
        () => collectInstalledMeasurements(),
        /phase18_garmin_benchmark_producer_cardinality_invalid/u,
        name,
      );
    });
  }
  withColdStartCollector({ processIds }, ({ state }) => {
    writeFileSync(path.join(state, "payload-1.json"), "{malformed");
    assert.throws(
      () => collectInstalledMeasurements(),
      /phase18_garmin_benchmark_producer_invalid/u,
      "malformed",
    );
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
if [ "$1" = "-s" ] && [ "$3" = "pull" ]; then
  printf 'apk' > "$5"
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
            ...completedColdStartContext(99, "e".repeat(32)),
            kind: "installed-route-log",
            marker: "GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:",
            process_id: 99,
            review_required: [],
            run_nonce: "e".repeat(32),
            source_pid: 99,
            status: "passed",
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
if [ "$1" = "-s" ] && [ "$3" = "pull" ]; then
  printf 'installed-apk' > "$5"
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
            ...completedColdStartContext(100, "f".repeat(32)),
            kind: "installed-route-log",
            marker: "GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:",
            process_id: 100,
            review_required: [],
            run_nonce: "f".repeat(32),
            source_pid: 100,
            status: "passed",
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
if [ "$1" = "-s" ] && [ "$3" = "pull" ]; then
  printf 'replaced-apk' > "$5"
  exit 0
fi
exit 1
`,
        apksignerScript: "#!/bin/sh\nprintf 'certificate SHA-256 digest: aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa\\n'\n",
      }, () => resolvePhase18GarminBenchmarkCurrentIdentity()),
      /phase18_garmin_benchmark_installed_apk_mismatch/u,
    );

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
if [ "$1" = "-s" ] && [ "$3" = "pull" ]; then exit 9; fi
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
if [ "$1" = "shell" ] && [ "$2" = "am" ] && [ "$3" = "force-stop" ]; then exit 0; fi
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
if [ "$1" = "shell" ] && [ "$2" = "am" ] && [ "$3" = "force-stop" ]; then exit 0; fi
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
