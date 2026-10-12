import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT,
  createPhase18GarminAcceptanceRawReport,
  createPhase18GarminAcceptanceRunnerPlan,
} from "./run-phase18-garmin-acceptance.mjs";
import {
  PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT,
  createPhase18GarminAdversarialRunnerPlan,
} from "./run-phase18-garmin-adversarial.mjs";
import {
  createPhase18GarminProofRunnerPlan,
} from "./run-phase18-garmin-proof.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { executePhase18GarminAdversarialVerifier } from "./verify-phase18-garmin-adversarial.mjs";

const HASH = "a".repeat(64);
const PACKAGE = "com.fchoo.gymtracker.devtest";
const benchmarkScript = path.resolve("scripts/benchmark-phase18-garmin.mjs");
const proofRunnerScript = path.resolve("scripts/run-phase18-garmin-proof.mjs");
const acceptanceRunnerScript = path.resolve("scripts/run-phase18-garmin-acceptance.mjs");
const adversarialRunnerScript = path.resolve("scripts/run-phase18-garmin-adversarial.mjs");
const ACCEPTANCE_MANIFEST = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`;
const ACCEPTANCE_RECORD = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/acceptance-record.json`;
const ACCEPTANCE_RAW_REPORT = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/raw-report.json`;
const ACCEPTANCE_APK = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-acceptance-devtest.apk`;
const ACCEPTANCE_MAESTRO_REPORT = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/maestro-report.json`;
const ACCEPTANCE_PRIVACY_REPORT = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/privacy-report.json`;
const PROOF_ROOT = "artifacts/native/phase18-garmin-proof";
const PROOF_MANIFEST = `${PROOF_ROOT}/build.json`;
const PROOF_FINAL_EVIDENCE = `${PROOF_ROOT}/final-evidence.json`;
const ADVERSARIAL_MANIFEST = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/build.json`;
const ADVERSARIAL_RAW_REPORT = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/raw-report.json`;
const ADVERSARIAL_NATIVE_REPORT = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/native-report.json`;
const ADVERSARIAL_PRIVACY_REPORT = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/privacy-report.json`;
const MAESTRO_SOURCE = "maestro/phase18/garmin-sync.yaml";
const PYTHON_LOCK = "modules/garmin-connect/python/garmin-python-lock.json";
const proofScript = path.resolve("scripts/verify-phase18-garmin-proof.mjs");
const adversarialScript = path.resolve("scripts/verify-phase18-garmin-adversarial.mjs");
const acceptanceScript = path.resolve("scripts/verify-phase18-garmin-acceptance.mjs");

const observations = {
  appearance: ["Light", "Dark", "System"],
  viewports: [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 600, height: 960 },
    { width: 840, height: 1080 },
  ],
  orientations: ["portrait", "landscape"],
  font_scales: [1, 2],
  input_methods: ["touch", "keyboard", "dpad"],
  visible_focus: true,
  minimum_target_dp: 48,
  reduced_motion: true,
  process_restart: true,
};

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeFile(root, relativePath, contents) {
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
  return absolutePath;
}

function writeJson(root, relativePath, value) {
  return writeFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeExecutable(filePath, contents) {
  writeFileSync(filePath, contents);
  chmodSync(filePath, 0o755);
}

function makeTempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function runVerifier(scriptPath, cwd, args, env = {}) {
  return spawnSync("node", [scriptPath, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function initRepo(root) {
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Phase18 Test"], { cwd: root });
}

function commitRepo(root) {
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: root });
}

function createFakeAndroidSdk(root, {
  packageName,
  retainedSignatureSha256,
  installedApkPath,
  deviceFacts,
  handlerBody,
} = {}) {
  const sdkRoot = path.join(root, "artifacts", "fake-android-sdk");
  const platformTools = path.join(sdkRoot, "platform-tools");
  const buildTools = path.join(sdkRoot, "build-tools", "35.0.0");
  mkdirSync(platformTools, { recursive: true });
  mkdirSync(buildTools, { recursive: true });
  writeExecutable(path.join(platformTools, "adb"), `#!/bin/sh
set -eu
serial="${deviceFacts.serial}"
package_name="${packageName}"
installed_apk_path="${installedApkPath}"
${handlerBody}
exit 1
`);
  writeExecutable(path.join(buildTools, "apksigner"), `#!/bin/sh
set -eu
printf 'Signer #1 certificate SHA-256 digest: ${retainedSignatureSha256}\\n'
`);
  return sdkRoot;
}

function benchmarkMeasurements() {
  return {
    apk_size_bytes: [1],
    garmin_module_size_bytes: [1],
    python_cold_start_ms: [1, 2, 3, 4, 5],
    python_warm_start_ms: Array.from({ length: 10 }, (_, index) => index + 1),
    bounded_sync_ms: [1, 2, 3, 4, 5],
    route_render_ms: Array.from({ length: 10 }, (_, index) => index + 1),
    lap_render_ms: Array.from({ length: 10 }, (_, index) => index + 1),
    memory_rss_bytes: [1, 2, 3, 4, 5],
    js_task_ms: Array.from({ length: 30 }, (_, index) => index + 1),
    frame_time_ms: Array.from({ length: 30 }, (_, index) => index + 1),
    offline_workout_commit_ms: Array.from({ length: 10 }, (_, index) => index + 1),
  };
}

function benchmarkMeasurementContext(identitySha256) {
  const measurements = benchmarkMeasurements();
  const metrics = Object.keys(measurements);
  return {
    profile: "physical-arm64",
    device_identity_sha256: identitySha256,
    commands: Object.fromEntries(metrics.map((metric) => [metric, `collect:${metric}`])),
    sample_labels: Object.fromEntries(metrics.map((metric) => [
      metric,
      measurements[metric].map((_, index) => `${metric}-${index + 1}`),
    ])),
  };
}

function createBenchmarkWorkspace({ invalidMarker = false } = {}) {
  const root = makeTempDir("phase18-benchmark-cli-");
  initRepo(root);
  const baselineBytes = readFileSync(path.resolve("tests/fixtures/garmin-json/phase18-performance-baseline.json"));
  writeFile(root, "tests/fixtures/garmin-json/phase18-performance-baseline.json", baselineBytes);
  writeFile(root, "modules/garmin-connect/python/garmin-python-lock.json", '{"lock":"current"}\n');
  commitRepo(root);
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const currentSourceTreeSha256 = sourceTreeSha256(root);
  const currentPythonLockSha256 = digest('{"lock":"current"}\n');
  const retainedSignatureSha256 = "b".repeat(64);
  const deviceFacts = {
    serial: "PHASE18BENCH",
    abi: "arm64-v8a",
    api: "36",
    model: "phase18-bench-device",
  };
  const deviceIdentitySha256 = digest(JSON.stringify({
    serial: deviceFacts.serial,
    abi: deviceFacts.abi,
    apiLevel: deviceFacts.api,
    model: deviceFacts.model,
  }));
  const retainedApkBytes = Buffer.from("benchmark-apk");
  const retainedApkSha256 = digest(retainedApkBytes);
  const apkPath = "artifacts/native/phase18-garmin-acceptance/gym-tracker-phase18-garmin-acceptance-devtest.apk";
  writeFile(root, apkPath, retainedApkBytes);
  writeJson(root, ACCEPTANCE_MANIFEST, {
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    profile: "development-test",
    package: PACKAGE,
    abi: "arm64-v8a",
    js_bundle_embedded: true,
    base_head: currentHead,
    source_tree_sha256: currentSourceTreeSha256,
    python_lock_sha256: currentPythonLockSha256,
    apk_sha256: retainedApkSha256,
    signature_sha256: retainedSignatureSha256,
    device_identity_sha256: deviceIdentitySha256,
  });
  const installedApkPath = path.join(root, "artifacts", "installed-benchmark.apk");
  writeFileSync(installedApkPath, retainedApkBytes);
  const markerPath = path.join(root, "artifacts", "benchmark-logcat-count.txt");
  const pidPath = path.join(root, "artifacts", "benchmark-pid-count.txt");
  const noncePath = path.join(root, "artifacts", "benchmark-nonce.txt");
  const measurementPayload = invalidMarker
    ? { run_nonce: "wrong", source: "installed-route-log", measurements: [], measurement_context: {} }
    : {
      run_nonce: "",
      source: "installed-route-log",
      measurements: benchmarkMeasurements(),
      measurement_context: benchmarkMeasurementContext(deviceIdentitySha256),
    };
  const sdkRoot = createFakeAndroidSdk(root, {
    packageName: PACKAGE,
    retainedSignatureSha256,
    installedApkPath,
    deviceFacts,
    handlerBody: `
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\n%s\\tdevice\\n' "$serial"
  exit 0
fi
if [ "$1" = "-s" ]; then
  shift 2
fi
if [ "$1" = "shell" ] && [ "$2" = "pidof" ] && [ "$3" = "$package_name" ]; then
  count=0
  [ -f "${pidPath}" ] && count=$(cat "${pidPath}")
  count=$((count + 1))
  printf '%s' "$count" > "${pidPath}"
  if [ "$count" -gt 1 ]; then
    printf '4242\\n'
  fi
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
if [ "$1" = "shell" ] && [ "$2" = "pm" ] && [ "$3" = "path" ] && [ "$4" = "$package_name" ]; then
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
    printf 'still waiting\\n'
  else
    nonce=""
    [ -f "${noncePath}" ] && nonce=$(cat "${noncePath}")
    printf 'I GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:%s\\n' "$(printf '%s' '${JSON.stringify(measurementPayload)}' | sed "s/\\\"run_nonce\\\":\\\"\\\"/\\\"run_nonce\\\":\\\"$nonce\\\"/")"
  fi
  exit 0
fi
`,
  });
  return {
    root,
    env: {
      ANDROID_HOME: sdkRoot,
      ANDROID_SDK_ROOT: sdkRoot,
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function createProofRunnerWorkspace({ unsafeBackup = false } = {}) {
  const root = makeTempDir("phase18-proof-runner-");
  initRepo(root);
  writeFile(root, PYTHON_LOCK, '{"lock":"current"}\n');
  commitRepo(root);
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const currentSourceTreeSha256 = sourceTreeSha256(root);
  const currentPythonLockSha256 = digest('{"lock":"current"}\n');
  const retainedSignatureSha256 = "b".repeat(64);
  const deviceFacts = {
    serial: "PHASE18PROOF",
    abi: "arm64-v8a",
    api: "36",
    model: "phase18-proof-device",
  };
  const deviceIdentitySha256 = digest(JSON.stringify({
    serial: deviceFacts.serial,
    abi: deviceFacts.abi,
    apiLevel: deviceFacts.api,
    model: deviceFacts.model,
  }));
  const retainedApkBytes = Buffer.from("proof-apk");
  const retainedApkSha256 = digest(retainedApkBytes);
  writeFile(root, `${PROOF_ROOT}/gym-tracker-phase18-garmin-proof-devtest.apk`, retainedApkBytes);
  writeJson(root, PROOF_MANIFEST, {
    schema_version: 1,
    suite: "phase18-garmin-proof",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: currentHead,
    source_tree_sha256: currentSourceTreeSha256,
    package: PACKAGE,
    apk: {
      path: `${PROOF_ROOT}/gym-tracker-phase18-garmin-proof-devtest.apk`,
      sha256: retainedApkSha256,
      page_alignment_verified: true,
    },
    installed_apk: {
      sha256: retainedApkSha256,
      matches_retained_apk: true,
    },
    device: {
      abi: "arm64-v8a",
      identity_sha256: deviceIdentitySha256,
    },
  });
  const installedApkPath = path.join(root, "artifacts", "installed-proof.apk");
  writeFileSync(installedApkPath, retainedApkBytes);
  const statePath = path.join(root, "artifacts", "proof-logcat-count.txt");
  const loginLog = [
    `I ${JSON.stringify({ id: "PH18-LOGIN", status: "passed", duration_ms: 1 }).slice(1, -1)}`,
    `I ${JSON.stringify({ id: "PH18-MFA", status: "passed", duration_ms: 1, outcome: "not_requested" }).slice(1, -1)}`,
    `I ${JSON.stringify({ id: "PH18-READ", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }).slice(1, -1)}`,
  ].map((json) => `D/Proof ${json}`).join("\\n").replaceAll('{"id"', `PHASE18_GARMIN_PROOF_RESULT:${'{"id"'}`);
  const restoreLog = [
    { id: "PH18-RESTART", status: "passed", duration_ms: 1 },
    { id: "PH18-REFRESH", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH },
  ].map((entry) => `D/Proof PHASE18_GARMIN_PROOF_RESULT:${JSON.stringify(entry)}`).join("\\n");
  const sdkRoot = createFakeAndroidSdk(root, {
    packageName: PACKAGE,
    retainedSignatureSha256,
    installedApkPath,
    deviceFacts,
    handlerBody: `
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\n%s\\tdevice\\n' "$serial"
  exit 0
fi
if [ "$1" = "-s" ]; then
  shift 2
fi
if [ "$1" = "shell" ] && [ "$2" = "getprop" ]; then
  case "$3" in
    ro.product.cpu.abi) printf '${deviceFacts.abi}\\n' ;;
    ro.build.version.sdk) printf '${deviceFacts.api}\\n' ;;
    ro.product.model) printf '${deviceFacts.model}\\n' ;;
    pidof) printf '4242\\n' ;;
    *) exit 1 ;;
  esac
  exit 0
fi
if [ "$1" = "install" ]; then
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "pm" ] && [ "$3" = "path" ] && [ "$4" = "$package_name" ]; then
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
if [ "$1" = "shell" ] && [ "$2" = "am" ]; then
  exit 0
fi
if [ "$1" = "logcat" ] && [ "$2" = "-d" ] && [ "$3" = "--pid" ]; then
  count=0
  [ -f "${statePath}" ] && count=$(cat "${statePath}")
  count=$((count + 1))
  printf '%s' "$count" > "${statePath}"
  if [ "$count" -eq 1 ]; then
    printf '${loginLog}\\n'
  else
    printf '${restoreLog}\\n'
  fi
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "run-as" ] && [ "$4" = "find" ]; then
  if ${unsafeBackup ? "true" : "false"}; then
    printf './private/session.json\\n'
  else
    printf './no_backup/garmin-session/garmin-di-session.bin\\n'
  fi
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "run-as" ] && [ "$4" = "test" ]; then
  exit 0
fi
`,
  });
  return {
    root,
    env: {
      ANDROID_HOME: sdkRoot,
      ANDROID_SDK_ROOT: sdkRoot,
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function createAcceptanceRunnerWorkspace({ invalidRecord = false } = {}) {
  const root = makeTempDir("phase18-acceptance-runner-");
  initRepo(root);
  writeFile(root, PYTHON_LOCK, '{"lock":"current"}\n');
  commitRepo(root);
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const currentSourceTreeSha256 = sourceTreeSha256(root);
  const currentPythonLockSha256 = digest('{"lock":"current"}\n');
  const retainedSignatureSha256 = "b".repeat(64);
  const deviceIdentitySha256 = "c".repeat(64);
  const retainedApkSha256 = "d".repeat(64);
  writeJson(root, ACCEPTANCE_MANIFEST, {
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: currentHead,
    source_tree_sha256: currentSourceTreeSha256,
    package: PACKAGE,
    apk: {
      path: ACCEPTANCE_APK,
      sha256: retainedApkSha256,
      page_alignment_verified: true,
    },
    installed_apk: {
      sha256: retainedApkSha256,
      matches_retained_apk: true,
    },
    device: {
      abi: "arm64-v8a",
      identity_sha256: deviceIdentitySha256,
    },
  });
  const plan = createPhase18GarminAcceptanceRunnerPlan();
  const record = invalidRecord
    ? { cases: [] }
    : {
      cases: plan.cases.map((entry) => entry.disposition === "execute-host"
        ? {
          id: entry.id,
          status: "passed",
          duration_ms: 1,
          semantic_state: "ready",
          source_digest: HASH,
          match_digest: HASH,
        }
        : {
          id: entry.id,
          status: "deferred",
          owner_plan: entry.ownerPlan,
          artifact: entry.artifact,
        }),
      current_identity: {
        currentHead,
        currentSourceTreeSha256,
        currentPythonLockSha256,
        retainedApkSha256,
        retainedSignatureSha256,
        deviceIdentitySha256,
      },
      observations,
      native_flow: {
        path: MAESTRO_SOURCE,
        source_sha256: HASH,
        report_sha256: HASH,
      },
      privacy_scan: {
        status: "passed",
        scanned_artifact_count: 4,
        report_sha256: HASH,
      },
    };
  writeJson(root, ACCEPTANCE_RECORD, record);
  return {
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function createAdversarialRunnerWorkspace() {
  const root = makeTempDir("phase18-adversarial-runner-");
  initRepo(root);
  writeFile(root, PYTHON_LOCK, '{"lock":"current"}\n');
  commitRepo(root);
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const currentSourceTreeSha256 = sourceTreeSha256(root);
  const currentPythonLockSha256 = digest('{"lock":"current"}\n');
  const retainedSignatureSha256 = "b".repeat(64);
  const deviceFacts = {
    serial: "PHASE18ADV",
    abi: "arm64-v8a",
    api: "36",
    model: "phase18-adv-device",
  };
  const deviceIdentitySha256 = digest(JSON.stringify({
    serial: deviceFacts.serial,
    abi: deviceFacts.abi,
    apiLevel: deviceFacts.api,
    model: deviceFacts.model,
  }));
  const retainedApkBytes = Buffer.from("adversarial-apk");
  const retainedApkSha256 = digest(retainedApkBytes);
  writeFile(root, `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-adversarial-devtest.apk`, retainedApkBytes);
  writeJson(root, ADVERSARIAL_MANIFEST, {
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: currentHead,
    source_tree_sha256: currentSourceTreeSha256,
    package: PACKAGE,
    apk: {
      path: `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-adversarial-devtest.apk`,
      sha256: retainedApkSha256,
      page_alignment_verified: true,
    },
    installed_apk: {
      sha256: retainedApkSha256,
      matches_retained_apk: true,
    },
    device: {
      abi: "arm64-v8a",
      identity_sha256: deviceIdentitySha256,
    },
  });
  const installedApkPath = path.join(root, "artifacts", "installed-adversarial.apk");
  writeFileSync(installedApkPath, retainedApkBytes);
  const nativeRecord = {
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    status: "passed",
    cases: createAdversarialEvidence({
      currentHead,
      currentSourceTreeSha256,
      currentPythonLockSha256,
      retainedApkSha256,
      retainedSignatureSha256,
      deviceIdentitySha256,
    }).cases,
    current_identity: {
      currentHead,
      currentSourceTreeSha256,
      currentPythonLockSha256,
      retainedApkSha256,
      retainedSignatureSha256,
      deviceIdentitySha256,
    },
  };
  const markerPath = path.join(root, "artifacts", "adversarial-logcat-count.txt");
  const noncePath = path.join(root, "artifacts", "adversarial-nonce.txt");
  const nativeRecordWithNonce = { ...nativeRecord, run_nonce: "__NONCE__" };
  const sdkRoot = createFakeAndroidSdk(root, {
    packageName: PACKAGE,
    retainedSignatureSha256,
    installedApkPath,
    deviceFacts,
    handlerBody: `
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\n%s\\tdevice\\n' "$serial"
  exit 0
fi
if [ "$1" = "-s" ]; then
  shift 2
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
if [ "$1" = "shell" ] && [ "$2" = "pm" ] && [ "$3" = "path" ] && [ "$4" = "$package_name" ]; then
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
  for argument in "$@"; do
    case "$argument" in *nonce=*) printf '%s' "\${argument##*nonce=}" > "${noncePath}" ;; esac
  done
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "am" ]; then exit 0; fi
if [ "$1" = "shell" ] && [ "$2" = "pidof" ]; then printf '4242\n'; exit 0; fi
if [ "$1" = "logcat" ] && [ "$2" = "--pid" ] && [ "$4" = "-d" ]; then
  count=0
  [ -f "${markerPath}" ] && count=$(cat "${markerPath}")
  count=$((count + 1))
  printf '%s' "$count" > "${markerPath}"
  nonce=$(cat "${noncePath}")
  payload=$(printf '%s' '${JSON.stringify(nativeRecordWithNonce)}' | sed "s/__NONCE__/$nonce/")
  printf 'D/Adv GYM_TRACKER_PHASE18_GARMIN_ADVERSARIAL_REPORT:%s\\n' "$payload"
  exit 0
fi
`,
  });
  return {
    root,
    env: {
      PATH: `${path.join(sdkRoot, "platform-tools")}:${process.env.PATH ?? ""}`,
      ANDROID_HOME: sdkRoot,
      ANDROID_SDK_ROOT: sdkRoot,
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function proofPassedCase(id) {
  const base = { id, status: "passed", duration_ms: 1 };
  if (id === "PH18-PKG") return { ...base, result_sha256: HASH };
  if (id === "PH18-MFA") return { ...base, outcome: "not_requested" };
  if (["PH18-READ", "PH18-REFRESH", "PH18-PRIVACY"].includes(id)) {
    return { ...base, count: 1, result_sha256: HASH };
  }
  return base;
}

function createProofEvidence(identity) {
  return {
    schema_version: 1,
    suite: "phase18-garmin-proof",
    status: "passed",
    manifest: {
      schema_version: 1,
      suite: "phase18-garmin-proof",
      profile: "development-test",
      package: PACKAGE,
      abi: "arm64-v8a",
      js_bundle_embedded: true,
      base_head: identity.currentHead,
      source_tree_sha256: identity.currentSourceTreeSha256,
      python_lock_sha256: identity.currentPythonLockSha256,
      apk_sha256: identity.retainedApkSha256,
      signature_sha256: identity.retainedSignatureSha256,
      device_identity_sha256: identity.deviceIdentitySha256,
    },
    case_ids: createPhase18GarminProofRunnerPlan().case_ids,
    cases: createPhase18GarminProofRunnerPlan().case_ids.map(proofPassedCase),
    standalone: {
      embedded_js: true,
      external_python: false,
      metro: false,
      downloaded_scripts: false,
      runtime_agent: false,
    },
    privacy_scan: {
      status: "passed",
      scanned_artifact_count: 2,
      report_sha256: HASH,
    },
    raw_report_sha256: HASH,
  };
}

const adversarialCodes = [
  "completed",
  "completed",
  "completed",
  "completed",
  "sign_in_required",
  "stale_generation",
  "data_access_denied",
  "rate_limited",
  "offline",
  "timeout",
  "temporary_failure",
  "malformed_response",
  "malformed_response",
  "malformed_response",
  "temporary_failure",
  "stale_generation",
];
const adversarialCalls = [1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 5, 3];

function createAdversarialEvidence(identity) {
  const sessionDigests = [
    "1".repeat(64),
    "2".repeat(64),
    "2".repeat(64),
    "3".repeat(64),
    "3".repeat(64),
    "3".repeat(64),
  ];
  const caseIds = createPhase18GarminAdversarialRunnerPlan().case_ids;
  return {
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    status: "passed",
    manifest: {
      schema_version: 1,
      suite: "phase18-garmin-adversarial",
      profile: "development-test",
      package: PACKAGE,
      abi: "arm64-v8a",
      js_bundle_embedded: true,
      base_head: identity.currentHead,
      source_tree_sha256: identity.currentSourceTreeSha256,
      python_lock_sha256: identity.currentPythonLockSha256,
      apk_sha256: identity.retainedApkSha256,
      signature_sha256: identity.retainedSignatureSha256,
      device_identity_sha256: identity.deviceIdentitySha256,
    },
    case_ids: caseIds,
    raw_report_sha256: identity.rawReportSha256 ?? HASH,
    cases: caseIds.map((id, index) => ({
      id,
      status: "passed",
      provenance: "native-exact-artifact",
      stage: id.toLowerCase().replaceAll("ph18-adv-", "").replaceAll("-", "_"),
      code: adversarialCodes[index],
      duration_ms: 1,
      call_count: adversarialCalls[index],
      automatic_retry_count: 0,
      retry_after_ms: id === "PH18-ADV-429" ? 900_000 : 0,
      source_write_count: 0,
      connection_state: index === 3 || index === 5
        ? "disconnected"
        : index === 4 ? "sign-in-required" : "connected",
      sync_state: index === 1 || index === 2
        ? "success"
        : index >= 6
          ? `${id === "PH18-ADV-PARTIAL-PAGE" ? "partial" : "failure"}-${adversarialCodes[index].replaceAll("_", "-")}`
          : index === 5 ? "failure-stale-generation" : "idle",
      session_digest: sessionDigests[index] ?? "4".repeat(64),
      history_digest: "5".repeat(64),
      source_digest: "6".repeat(64),
      match_digest: "7".repeat(64),
      generation_before: index === 3 ? 7 : index === 4 ? 8 : index === 5 ? 20 : index >= 6 ? 30 : 7,
      generation_after: index === 3 ? 8 : index === 4 ? 8 : index === 5 ? 21 : index >= 6 ? 30 : 7,
    })),
    native_report: {
      path: `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/native-report.json`,
      sha256: HASH,
    },
    privacy_scan: {
      status: "passed",
      scanned_artifact_count: 4,
      report_sha256: HASH,
    },
  };
}

function createAcceptanceCases(proofArtifactSha, adversarialArtifactSha) {
  return createPhase18GarminAcceptanceRunnerPlan().cases.map((entry) => {
    if (entry.disposition === "execute-host") {
      return {
        id: entry.id,
        status: "passed",
        duration_ms: 1,
        semantic_state: "ready",
        source_digest: HASH,
        match_digest: HASH,
      };
    }
    return {
      id: entry.id,
      status: "verified",
      owner_plan: entry.ownerPlan,
      artifact: entry.artifact,
      artifact_sha256: entry.artifact.includes("adversarial") ? adversarialArtifactSha : proofArtifactSha,
      proof_kind: "native-exact-artifact",
    };
  });
}

function createAcceptanceWorkspace({
  syntheticOwner = false,
  missingMaestroReport = false,
  missingPrivacyReport = false,
  installedApkMatches = true,
} = {}) {
  const root = makeTempDir("phase18-acceptance-cli-");
  initRepo(root);
  writeFile(root, PYTHON_LOCK, '{"lock":"current"}\n');
  writeFile(root, MAESTRO_SOURCE, "flow: phase18\n");
  commitRepo(root);

  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const currentSourceTreeSha256 = sourceTreeSha256(root);
  const currentPythonLockSha256 = digest('{"lock":"current"}\n');
  const retainedApkBytes = Buffer.from("retained-apk");
  const installedApkBytes = installedApkMatches ? retainedApkBytes : Buffer.from("installed-apk-mismatch");
  const retainedApkSha256 = digest(retainedApkBytes);
  const retainedSignatureSha256 = "b".repeat(64);
  const deviceFacts = {
    fingerprint: "phase18/fingerprint",
    abi: "arm64-v8a",
    model: "phase18-device",
    sdk: "36",
    release: "16",
  };
  const deviceIdentitySha256 = digest(JSON.stringify({
    serial: "PHASE18SERIAL",
    abi: deviceFacts.abi,
    apiLevel: deviceFacts.sdk,
    model: deviceFacts.model,
  }));
  const identity = {
    currentHead,
    currentSourceTreeSha256,
    currentPythonLockSha256,
    retainedApkSha256,
    retainedSignatureSha256,
    deviceIdentitySha256,
  };

  writeFile(root, ACCEPTANCE_APK, retainedApkBytes);

  const validProof = createProofEvidence(identity);
  const validAdversarial = createAdversarialEvidence(identity);
  const proofRawReport = structuredClone(validProof);
  delete proofRawReport.case_ids;
  delete proofRawReport.raw_report_sha256;
  const proofRawReportBytes = Buffer.from(`${JSON.stringify(proofRawReport, null, 2)}\n`);
  validProof.raw_report_sha256 = digest(proofRawReportBytes);
  const adversarialNativeBytes = Buffer.from('{\n  "status": "passed"\n}\n');
  const adversarialPrivacyBytes = Buffer.from('{\n  "status": "passed",\n  "scanned_artifact_count": 4\n}\n');
  validAdversarial.native_report.sha256 = digest(adversarialNativeBytes);
  validAdversarial.privacy_scan.report_sha256 = digest(adversarialPrivacyBytes);
  const adversarialRawReport = structuredClone(validAdversarial);
  delete adversarialRawReport.raw_report_sha256;
  const adversarialRawReportBytes = Buffer.from(`${JSON.stringify(adversarialRawReport, null, 2)}\n`);
  validAdversarial.raw_report_sha256 = digest(adversarialRawReportBytes);
  const proofFileBytes = Buffer.from(`${JSON.stringify(
    syntheticOwner ? { manifest: validProof.manifest } : validProof,
    null,
    2,
  )}\n`);
  const adversarialFileBytes = Buffer.from(`${JSON.stringify(validAdversarial, null, 2)}\n`);
  writeJson(root, PROOF_MANIFEST, {
    schema_version: 1,
    suite: "phase18-garmin-proof",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: currentHead,
    source_tree_sha256: currentSourceTreeSha256,
    package: PACKAGE,
    apk: {
      path: `${PROOF_ROOT}/gym-tracker-phase18-garmin-proof-devtest.apk`,
      sha256: retainedApkSha256,
      page_alignment_verified: true,
    },
    installed_apk: {
      sha256: retainedApkSha256,
      matches_retained_apk: true,
    },
    device: {
      abi: "arm64-v8a",
      identity_sha256: deviceIdentitySha256,
    },
  });
  writeFile(root, `${PROOF_ROOT}/gym-tracker-phase18-garmin-proof-devtest.apk`, retainedApkBytes);
  writeFile(root, `${PROOF_ROOT}/raw-report.json`, proofRawReportBytes);
  writeJson(root, ADVERSARIAL_MANIFEST, {
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: currentHead,
    source_tree_sha256: currentSourceTreeSha256,
    package: PACKAGE,
    apk: {
      path: `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-adversarial-devtest.apk`,
      sha256: retainedApkSha256,
      page_alignment_verified: true,
    },
    installed_apk: {
      sha256: retainedApkSha256,
      matches_retained_apk: true,
    },
    device: {
      abi: "arm64-v8a",
      identity_sha256: deviceIdentitySha256,
    },
  });
  writeFile(root, `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-adversarial-devtest.apk`, retainedApkBytes);
  writeFile(root, ADVERSARIAL_RAW_REPORT, adversarialRawReportBytes);
  writeFile(root, PROOF_FINAL_EVIDENCE, proofFileBytes);
  writeFile(root, "artifacts/native/phase18-garmin-adversarial/final-evidence.json", adversarialFileBytes);
  writeFile(root, ADVERSARIAL_NATIVE_REPORT, adversarialNativeBytes);
  writeFile(root, ADVERSARIAL_PRIVACY_REPORT, adversarialPrivacyBytes);

  const maestroReportBytes = Buffer.from(`${JSON.stringify({ status: "passed", observations }, null, 2)}\n`);
  const privacyReportBytes = Buffer.from(`${JSON.stringify({ status: "passed", scanned_artifact_count: 4 }, null, 2)}\n`);
  if (!missingMaestroReport) writeFile(root, ACCEPTANCE_MAESTRO_REPORT, maestroReportBytes);
  if (!missingPrivacyReport) writeFile(root, ACCEPTANCE_PRIVACY_REPORT, privacyReportBytes);

  const acceptanceEvidence = createPhase18GarminAcceptanceRawReport({
    manifest: {
      schema_version: 1,
      suite: "phase18-garmin-acceptance",
      profile: "development-test",
      package: PACKAGE,
      abi: "arm64-v8a",
      js_bundle_embedded: true,
      base_head: currentHead,
      source_tree_sha256: currentSourceTreeSha256,
      python_lock_sha256: currentPythonLockSha256,
      apk_sha256: retainedApkSha256,
      signature_sha256: retainedSignatureSha256,
      device_identity_sha256: deviceIdentitySha256,
    },
    cases: createAcceptanceCases(digest(proofFileBytes), digest(adversarialFileBytes)),
    observations,
    native_flow: {
      path: MAESTRO_SOURCE,
      source_sha256: digest("flow: phase18\n"),
      report_sha256: digest(maestroReportBytes),
    },
    privacy_scan: {
      status: "passed",
      scanned_artifact_count: 4,
      report_sha256: digest(privacyReportBytes),
    },
  });
  writeJson(root, ACCEPTANCE_RAW_REPORT, acceptanceEvidence);
  writeJson(root, ACCEPTANCE_MANIFEST, {
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: currentHead,
    source_tree_sha256: currentSourceTreeSha256,
    package: PACKAGE,
    apk: {
      path: ACCEPTANCE_APK,
      sha256: retainedApkSha256,
      page_alignment_verified: true,
    },
    installed_apk: {
      sha256: retainedApkSha256,
      matches_retained_apk: true,
    },
    device: {
      abi: "arm64-v8a",
      identity_sha256: deviceIdentitySha256,
    },
  });

  const sdkRoot = path.join(root, "artifacts", "fake-android-sdk");
  const platformTools = path.join(sdkRoot, "platform-tools");
  const buildTools = path.join(sdkRoot, "build-tools", "35.0.0");
  mkdirSync(platformTools, { recursive: true });
  mkdirSync(buildTools, { recursive: true });
  const installedApkPath = path.join(root, "artifacts", "installed.apk");
  writeFileSync(installedApkPath, installedApkBytes);
  writeExecutable(path.join(platformTools, "adb"), `#!/bin/sh
set -eu
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\nPHASE18SERIAL\\tdevice\\n'
  exit 0
fi
if [ "$1" = "-s" ]; then
  serial="$2"
  shift 2
fi
if [ "$1" = "shell" ] && [ "$2" = "getprop" ]; then
  case "$3" in
    ro.build.fingerprint) printf '${deviceFacts.fingerprint}\\n' ;;
    ro.product.cpu.abi) printf '${deviceFacts.abi}\\n' ;;
    ro.product.model) printf '${deviceFacts.model}\\n' ;;
    ro.build.version.sdk) printf '${deviceFacts.sdk}\\n' ;;
    ro.build.version.release) printf '${deviceFacts.release}\\n' ;;
    *) exit 1 ;;
  esac
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "pm" ] && [ "$3" = "path" ] && [ "$4" = "${PACKAGE}" ]; then
  printf 'package:/data/app/phase18/base.apk\\n'
  exit 0
fi
if [ "$1" = "pull" ] && [ "$2" = "/data/app/phase18/base.apk" ]; then
  cp "${installedApkPath}" "$3"
  exit 0
fi
if [ "$1" = "exec-out" ] && [ "$2" = "cat" ] && [ "$3" = "/data/app/phase18/base.apk" ]; then
  cat "${installedApkPath}"
  exit 0
fi
exit 1
`);
  writeExecutable(path.join(buildTools, "apksigner"), `#!/bin/sh
set -eu
printf 'Signer #1 certificate SHA-256 digest: ${retainedSignatureSha256}\\n'
`);

  return {
    root,
    env: {
      ANDROID_HOME: sdkRoot,
      ANDROID_SDK_ROOT: sdkRoot,
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("proof CLI verifier fails closed when the raw report is missing", () => {
  const root = makeTempDir("phase18-proof-cli-");
  try {
    writeJson(root, PROOF_MANIFEST, { schema_version: 1 });
    const result = runVerifier(proofScript, root, ["--manifest", PROOF_MANIFEST]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /phase18_evidence_raw_report_missing/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adversarial CLI verifier rejects self-reported native and privacy hashes", () => {
  assert.throws(
    () => executePhase18GarminAdversarialVerifier(["--manifest", ADVERSARIAL_MANIFEST], {
      readJson: (artifactPath) => artifactPath === ADVERSARIAL_MANIFEST
        ? {
          schema_version: 1,
          suite: "phase18-garmin-adversarial",
          profile: "development-test",
          build_variant: "release",
          js_bundle: { embedded: true },
          base_head: "b".repeat(40),
          source_tree_sha256: "a".repeat(64),
          package: PACKAGE,
          apk: {
            path: `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-adversarial-devtest.apk`,
            sha256: "a".repeat(64),
            page_alignment_verified: true,
          },
          installed_apk: {
            sha256: "a".repeat(64),
            matches_retained_apk: true,
          },
          device: {
            abi: "arm64-v8a",
            identity_sha256: "a".repeat(64),
          },
        }
        : {
          manifest: {
            schema_version: 1,
            suite: "phase18-garmin-adversarial",
            profile: "development-test",
            package: PACKAGE,
            abi: "arm64-v8a",
            js_bundle_embedded: true,
            base_head: "b".repeat(40),
            source_tree_sha256: "a".repeat(64),
            python_lock_sha256: "a".repeat(64),
            apk_sha256: "a".repeat(64),
            signature_sha256: "a".repeat(64),
            device_identity_sha256: "a".repeat(64),
          },
          schema_version: 1,
          suite: "phase18-garmin-adversarial",
          status: "passed",
          case_ids: createPhase18GarminAdversarialRunnerPlan().case_ids,
          cases: createAdversarialEvidence({
            currentHead: "b".repeat(40),
            currentSourceTreeSha256: "a".repeat(64),
            currentPythonLockSha256: "a".repeat(64),
            retainedApkSha256: "a".repeat(64),
            retainedSignatureSha256: "a".repeat(64),
            deviceIdentitySha256: "a".repeat(64),
          }).cases,
          native_report: { path: ADVERSARIAL_NATIVE_REPORT, sha256: "b".repeat(64) },
          privacy_scan: { status: "passed", scanned_artifact_count: 1, report_sha256: "c".repeat(64) },
        },
      readBytes: (artifactPath) => artifactPath === ADVERSARIAL_NATIVE_REPORT
        ? Buffer.from("native-report")
        : Buffer.from("privacy-report"),
      resolveCurrentIdentity: () => ({
        currentHead: "b".repeat(40),
        currentSourceTreeSha256: "a".repeat(64),
        currentPythonLockSha256: "a".repeat(64),
        retainedApkSha256: "a".repeat(64),
        installedApkSha256: "a".repeat(64),
        retainedSignatureSha256: "a".repeat(64),
        deviceIdentitySha256: "a".repeat(64),
        nativeReportSha256: "b".repeat(64),
        privacyReportSha256: "c".repeat(64),
      }),
    }),
    /phase18_garmin_adversarial_evidence_report_identity_invalid/u,
  );
});

test("acceptance CLI verifier rejects synthetic owner artifacts marked as native-exact-artifact", () => {
  const workspace = createAcceptanceWorkspace({ syntheticOwner: true });
  try {
    const result = runVerifier(acceptanceScript, workspace.root, ["--manifest", ACCEPTANCE_MANIFEST], workspace.env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /phase18_(evidence_schema_invalid|acceptance_evidence_current_identity_invalid)/u);
  } finally {
    workspace.cleanup();
  }
});

test("acceptance CLI verifier rejects stale installed identity mismatches", () => {
  const workspace = createAcceptanceWorkspace({ installedApkMatches: false });
  try {
    const result = runVerifier(acceptanceScript, workspace.root, ["--manifest", ACCEPTANCE_MANIFEST], workspace.env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /phase18_acceptance_evidence_current_identity_invalid/u);
  } finally {
    workspace.cleanup();
  }
});

test("acceptance CLI verifier fails closed when the Maestro or privacy report is missing", () => {
  const missingMaestro = createAcceptanceWorkspace({ missingMaestroReport: true });
  try {
    const maestroResult = runVerifier(missingMaestro.root ? acceptanceScript : acceptanceScript, missingMaestro.root, ["--manifest", ACCEPTANCE_MANIFEST], missingMaestro.env);
    assert.notEqual(maestroResult.status, 0);
    assert.match(maestroResult.stderr, /ENOENT|no such file/i);
  } finally {
    missingMaestro.cleanup();
  }

  const missingPrivacy = createAcceptanceWorkspace({ missingPrivacyReport: true });
  try {
    const privacyResult = runVerifier(acceptanceScript, missingPrivacy.root, ["--manifest", ACCEPTANCE_MANIFEST], missingPrivacy.env);
    assert.notEqual(privacyResult.status, 0);
    assert.match(privacyResult.stderr, /ENOENT|no such file/i);
  } finally {
    missingPrivacy.cleanup();
  }
});

test("benchmark CLI collects staged installed evidence and fails closed on malformed markers", () => {
  const workspace = createBenchmarkWorkspace();
  try {
    const result = runVerifier(benchmarkScript, workspace.root, [
      "--manifest",
      ACCEPTANCE_MANIFEST,
      "--evidence",
      "artifacts/native/phase18-garmin-acceptance/benchmark.json",
      "--execute",
      "--phase20-native-checkpoint",
    ], workspace.env);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(readFileSync(path.join(workspace.root, "artifacts/native/phase18-garmin-acceptance/benchmark.json"), "utf8"));
    assert.equal(report.status, "passed");
  } finally {
    workspace.cleanup();
  }

  const broken = createBenchmarkWorkspace({ invalidMarker: true });
  try {
    const result = runVerifier(benchmarkScript, broken.root, [
      "--manifest",
      ACCEPTANCE_MANIFEST,
      "--evidence",
      "artifacts/native/phase18-garmin-acceptance/benchmark.json",
      "--execute",
      "--phase20-native-checkpoint",
    ], broken.env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /phase18_garmin_benchmark_producer_invalid/u);
  } finally {
    broken.cleanup();
  }
});

test("proof runner CLI writes bounded raw reports on success and privacy-safe technical review", () => {
  const workspace = createProofRunnerWorkspace();
  try {
    const run = runVerifier(proofRunnerScript, workspace.root, [
      "--manifest",
      PROOF_MANIFEST,
      "--execute",
      "--phase20-native-checkpoint",
    ], workspace.env);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const verifySeal = runVerifier(proofScript, workspace.root, [
      "--manifest",
      PROOF_MANIFEST,
      "--seal",
      "--phase20-native-checkpoint",
    ], workspace.env);
    assert.equal(verifySeal.status, 0, verifySeal.stderr || verifySeal.stdout);
    const verifyRead = runVerifier(proofScript, workspace.root, [
      "--manifest",
      PROOF_MANIFEST,
    ], workspace.env);
    assert.equal(verifyRead.status, 0, verifyRead.stderr || verifyRead.stdout);
  } finally {
    workspace.cleanup();
  }

  const unsafe = createProofRunnerWorkspace({ unsafeBackup: true });
  try {
    const result = runVerifier(proofRunnerScript, unsafe.root, [
      "--manifest",
      PROOF_MANIFEST,
      "--execute",
      "--phase20-native-checkpoint",
    ], unsafe.env);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(readFileSync(path.join(unsafe.root, PROOF_ROOT, "raw-report.json"), "utf8"));
    assert.equal(report.status, "TECHNICAL_REVIEW_REQUIRED");
    assert.equal(report.failure_code, "temporary_failure");
  } finally {
    unsafe.cleanup();
  }
});

test("acceptance runner CLI writes raw reports and rejects malformed records", () => {
  const workspace = createAcceptanceRunnerWorkspace();
  try {
    const result = runVerifier(acceptanceRunnerScript, workspace.root, [
      "--manifest",
      ACCEPTANCE_MANIFEST,
      "--record",
      ACCEPTANCE_RECORD,
      "--execute",
      "--phase20-native-checkpoint",
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(readFileSync(path.join(workspace.root, ACCEPTANCE_RAW_REPORT), "utf8"));
    assert.equal(report.status, "host-passed-native-deferred");
  } finally {
    workspace.cleanup();
  }

  const invalid = createAcceptanceRunnerWorkspace({ invalidRecord: true });
  try {
    const result = runVerifier(acceptanceRunnerScript, invalid.root, [
      "--manifest",
      ACCEPTANCE_MANIFEST,
      "--record",
      ACCEPTANCE_RECORD,
      "--execute",
      "--phase20-native-checkpoint",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /phase18_acceptance_record_invalid/u);
  } finally {
    invalid.cleanup();
  }
});

test("adversarial runner and verifier CLI seal exact native evidence without device execution", () => {
  const workspace = createAdversarialRunnerWorkspace();
  try {
    const run = runVerifier(adversarialRunnerScript, workspace.root, [
      "--manifest",
      ADVERSARIAL_MANIFEST,
      "--record",
      "artifacts/native/phase18-garmin-adversarial/native-record.json",
      "--execute",
      "--phase20-native-checkpoint",
    ], workspace.env);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const missingFinal = runVerifier(adversarialScript, workspace.root, [
      "--manifest",
      ADVERSARIAL_MANIFEST,
    ], workspace.env);
    assert.notEqual(missingFinal.status, 0);
    assert.match(missingFinal.stderr, /ENOENT|no such file|final-evidence/iu);
    const seal = runVerifier(adversarialScript, workspace.root, [
      "--manifest",
      ADVERSARIAL_MANIFEST,
      "--seal",
      "--phase20-native-checkpoint",
    ], workspace.env);
    assert.equal(seal.status, 0, seal.stderr || seal.stdout);
    const verify = runVerifier(adversarialScript, workspace.root, [
      "--manifest",
      ADVERSARIAL_MANIFEST,
    ], workspace.env);
    assert.equal(verify.status, 0, verify.stderr || verify.stdout);
  } finally {
    workspace.cleanup();
  }
});

test("acceptance CLI verifier succeeds against the fully bounded synthetic workspace", () => {
  const workspace = createAcceptanceWorkspace();
  try {
    const result = runVerifier(acceptanceScript, workspace.root, ["--manifest", ACCEPTANCE_MANIFEST], workspace.env);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /"status":"passed"/u);
  } finally {
    workspace.cleanup();
  }
});
