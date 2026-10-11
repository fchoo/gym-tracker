import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PHASE18_GARMIN_PROOF_RESULT_MARKER } from "../src/testing/phase18GarminProof.ts";
import {
  PHASE18_GARMIN_PROOF_ARTIFACT_ROOT,
  PHASE18_GARMIN_PROOF_RAW_REPORT,
  createPhase18GarminTechnicalReviewReport,
  createPhase18GarminProofRunnerPlan,
  executePhase18GarminProofRunner,
  executePhase18GarminProofRunnerCli,
  parsePhase18GarminProofRunnerArgs,
  parsePhase18GarminProofMarker,
  sanitizePhase18GarminProofBuildManifest,
  validatePhase18GarminProofBuildManifest,
} from "./run-phase18-garmin-proof.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import {
  createPhase18GarminProofFinalEvidence,
  executePhase18GarminProofVerifier,
  executePhase18GarminProofVerifierCli,
  parsePhase18GarminProofVerifierArgs,
  validatePhase18GarminProofCurrentIdentity,
  validatePhase18GarminProofEvidence,
} from "./verify-phase18-garmin-proof.mjs";

const HASH = "a".repeat(64);
const HEAD = "b".repeat(40);
const MANIFEST = `${PHASE18_GARMIN_PROOF_ARTIFACT_ROOT}/build.json`;
const APK_PATH = `${PHASE18_GARMIN_PROOF_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-proof-devtest.apk`;
const PYTHON_LOCK = "modules/garmin-connect/python/garmin-python-lock.json";

function manifest(overrides = {}) {
  return {
    schema_version: 1,
    suite: "phase18-garmin-proof",
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
    ...overrides,
  };
}

function passedCase(id) {
  const base = { id, status: "passed", duration_ms: 1 };
  if (id === "PH18-PKG") return { ...base, result_sha256: HASH };
  if (id === "PH18-MFA") return { ...base, outcome: "not_requested" };
  if (["PH18-READ", "PH18-REFRESH", "PH18-PRIVACY"].includes(id)) {
    return { ...base, count: 1, result_sha256: HASH };
  }
  return base;
}

function passedEvidence(overrides = {}) {
  return {
    schema_version: 1,
    suite: "phase18-garmin-proof",
    status: "passed",
    manifest: manifest(),
    case_ids: [...createPhase18GarminProofRunnerPlan().case_ids],
    cases: createPhase18GarminProofRunnerPlan().case_ids.map(passedCase),
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
    ...overrides,
  };
}

function currentProofFixture(overrides = {}) {
  const apkBytes = Buffer.from("proof-apk");
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const currentSourceTreeSha256 = sourceTreeSha256(process.cwd());
  const currentPythonLockSha256 = createHash("sha256")
    .update(readFileSync(PYTHON_LOCK))
    .digest("hex");
  const device = {
    serial: "PHASE18PROOF",
    abi: "arm64-v8a",
    apiLevel: "36",
    model: "phase18-proof-device",
  };
  const deviceIdentitySha256 = createHash("sha256")
    .update(JSON.stringify(device))
    .digest("hex");
  return {
    apkBytes,
    currentHead,
    currentSourceTreeSha256,
    currentPythonLockSha256,
    retainedApkSha256: createHash("sha256").update(apkBytes).digest("hex"),
    retainedSignatureSha256: "b".repeat(64),
    device,
    deviceIdentitySha256,
    ...overrides,
  };
}

function withProofArtifacts(overrides = {}) {
  const fixture = currentProofFixture(overrides);
  const artifactRoot = path.resolve(PHASE18_GARMIN_PROOF_ARTIFACT_ROOT);
  const sdkRoot = path.resolve("artifacts/fake-phase18-proof-sdk");
  const previousAndroidHome = process.env.ANDROID_HOME;
  const previousAndroidSdkRoot = process.env.ANDROID_SDK_ROOT;
  rmSync(artifactRoot, { recursive: true, force: true });
  rmSync(sdkRoot, { recursive: true, force: true });
  mkdirSync(artifactRoot, { recursive: true });
  mkdirSync(path.join(sdkRoot, "platform-tools"), { recursive: true });
  mkdirSync(path.join(sdkRoot, "build-tools", "35.0.0"), { recursive: true });
  writeFileSync(path.resolve(APK_PATH), fixture.apkBytes);
  writeFileSync(
    path.join(sdkRoot, "platform-tools", "adb"),
    `#!/bin/sh
set -eu
serial="${fixture.device.serial}"
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\n%s\\tdevice\\n' "$serial"
  exit 0
fi
if [ "$1" = "-s" ]; then
  shift 2
fi
if [ "$1" = "shell" ] && [ "$2" = "getprop" ]; then
  case "$3" in
    ro.product.cpu.abi) printf '${fixture.device.abi}\\n' ;;
    ro.build.version.sdk) printf '${fixture.device.apiLevel}\\n' ;;
    ro.product.model) printf '${fixture.device.model}\\n' ;;
    *) exit 1 ;;
  esac
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "pm" ] && [ "$3" = "path" ]; then
  printf 'package:/data/app/phase18/base.apk\\n'
  exit 0
fi
if [ "$1" = "exec-out" ] && [ "$2" = "cat" ]; then
  cat '${path.resolve(APK_PATH)}'
  exit 0
fi
exit 0
`,
  );
  chmodSync(path.join(sdkRoot, "platform-tools", "adb"), 0o755);
  writeFileSync(
    path.join(sdkRoot, "build-tools", "35.0.0", "apksigner"),
    `#!/bin/sh\nprintf 'Signer #1 certificate SHA-256 digest: ${fixture.retainedSignatureSha256}\\n'\n`,
  );
  chmodSync(path.join(sdkRoot, "build-tools", "35.0.0", "apksigner"), 0o755);
  writeFileSync(path.resolve(MANIFEST), `${JSON.stringify({
    schema_version: 1,
    suite: "phase18-garmin-proof",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: fixture.currentHead,
    source_tree_sha256: fixture.currentSourceTreeSha256,
    package: "com.fchoo.gymtracker.devtest",
    apk: {
      path: APK_PATH,
      sha256: fixture.retainedApkSha256,
      page_alignment_verified: true,
    },
    installed_apk: {
      sha256: fixture.retainedApkSha256,
      matches_retained_apk: true,
    },
    device: {
      abi: "arm64-v8a",
      identity_sha256: fixture.manifestDeviceIdentitySha256
        ?? fixture.deviceIdentitySha256,
    },
  }, null, 2)}\n`);
  process.env.ANDROID_HOME = sdkRoot;
  process.env.ANDROID_SDK_ROOT = sdkRoot;
  return {
    fixture,
    cleanup() {
      rmSync(artifactRoot, { recursive: true, force: true });
      rmSync(sdkRoot, { recursive: true, force: true });
      if (previousAndroidHome === undefined) delete process.env.ANDROID_HOME;
      else process.env.ANDROID_HOME = previousAndroidHome;
      if (previousAndroidSdkRoot === undefined) delete process.env.ANDROID_SDK_ROOT;
      else process.env.ANDROID_SDK_ROOT = previousAndroidSdkRoot;
    },
  };
}

function marker(entry) {
  return `D/Proof ${PHASE18_GARMIN_PROOF_RESULT_MARKER}${JSON.stringify(entry)}`;
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

test("Phase 18 runner is a Phase 20-only explicit native execution gate", () => {
  assert.deepEqual(parsePhase18GarminProofRunnerArgs([
    "--manifest",
    MANIFEST,
  ]), {
    manifest: MANIFEST,
    execute: false,
    phase20Checkpoint: false,
  });
  assert.deepEqual(parsePhase18GarminProofRunnerArgs([
    "--manifest",
    MANIFEST,
    "--execute",
    "--phase20-native-checkpoint",
  ]), {
    manifest: MANIFEST,
    execute: true,
    phase20Checkpoint: true,
  });
  assert.throws(
    () => parsePhase18GarminProofRunnerArgs(["--manifest", MANIFEST, "--execute"]),
    /phase18_runner_arguments_invalid/u,
  );
  assert.throws(
    () => parsePhase18GarminProofRunnerArgs(["--manifest", "other.json"]),
    /phase18_runner_arguments_invalid/u,
  );
});

test("Phase 18 runner plan preserves ordered proof, privacy, and no-fallback contracts", () => {
  const plan = createPhase18GarminProofRunnerPlan();
  assert.deepEqual(plan.case_ids, [
    "PH18-PKG",
    "PH18-LOGIN",
    "PH18-MFA",
    "PH18-READ",
    "PH18-RESTART",
    "PH18-REFRESH",
    "PH18-PRIVACY",
  ]);
  assert.equal(plan.credentials, "installed-app-only");
  assert.equal(plan.transport, "embedded-garmin-module-only");
  assert.equal(plan.fallback_transport, "prohibited");
  assert.equal(plan.final_evidence_owner, "phase20-native-checkpoint");
  assert.equal(plan.runner_writes_final_evidence, false);
});

test("Phase 18 manifest binds only fresh hashed identity fields", () => {
  assert.equal(validatePhase18GarminProofBuildManifest(manifest(), {
    currentHead: HEAD,
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    retainedSignatureSha256: HASH,
  }), true);
  for (const changed of [
    { base_head: "c".repeat(40) },
    { source_tree_sha256: "c".repeat(64) },
    { python_lock_sha256: "c".repeat(64) },
    { apk_sha256: "c".repeat(64) },
    { signature_sha256: "c".repeat(64) },
    { profile: "production" },
    { abi: "x86_64" },
    { serial: "personal-device" },
  ]) {
    assert.throws(
      () => validatePhase18GarminProofBuildManifest(manifest(changed), {
        currentHead: HEAD,
        currentSourceTreeSha256: HASH,
        currentPythonLockSha256: HASH,
        retainedApkSha256: HASH,
        retainedSignatureSha256: HASH,
      }),
      /phase18_manifest_invalid/u,
    );
  }
});

test("Phase 18 marker parser accepts exact pass and review markers and rejects malformed payloads", () => {
  assert.equal(parsePhase18GarminProofMarker("noise"), null);
  assert.deepEqual(
    parsePhase18GarminProofMarker(marker({
      id: "PH18-READ",
      status: "passed",
      duration_ms: 1,
      count: 1,
      result_sha256: HASH,
    })),
    {
      id: "PH18-READ",
      status: "passed",
      duration_ms: 1,
      count: 1,
      result_sha256: HASH,
    },
  );
  assert.deepEqual(
    parsePhase18GarminProofMarker(marker({
      id: "PH18-LOGIN",
      status: "TECHNICAL_REVIEW_REQUIRED",
      duration_ms: 0,
      code: "timeout",
    })),
    {
      id: "PH18-LOGIN",
      status: "TECHNICAL_REVIEW_REQUIRED",
      duration_ms: 0,
      code: "timeout",
    },
  );
  for (const line of [
    `${PHASE18_GARMIN_PROOF_RESULT_MARKER}{`,
    marker({ id: "PH18-LOGIN", status: "passed", duration_ms: -1 }),
    marker({ id: "PH18-LOGIN", status: "TECHNICAL_REVIEW_REQUIRED", duration_ms: 0, code: "bad code" }),
    marker({ id: "PH18-PKG", status: "passed", duration_ms: 1, result_sha256: "short" }),
    marker({ id: "PH18-READ", status: "passed", duration_ms: 1, count: 2, result_sha256: HASH }),
    marker({ id: "PH18-MFA", status: "passed", duration_ms: 1, outcome: "unexpected" }),
  ]) {
    assert.throws(
      () => parsePhase18GarminProofMarker(line),
      /phase18_marker_invalid/u,
    );
  }
});

test("Phase 18 runner sanitizes the repository native-build manifest without manual evidence fabrication", () => {
  const retained = {
    schema_version: 1,
    suite: "phase18-garmin-proof",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: HEAD,
    source_tree_sha256: HASH,
    package: "com.fchoo.gymtracker.devtest",
    apk: {
      path: `${PHASE18_GARMIN_PROOF_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-proof-devtest.apk`,
      sha256: HASH,
      size_bytes: 1,
      page_alignment_kib: 16,
      page_alignment_verified: true,
    },
    installed_apk: { sha256: HASH, matches_retained_apk: true },
    package_launch: { component: "safe-component", succeeded: true },
    device: {
      role: "automated-test-device",
      api: 36,
      abi: "arm64-v8a",
      model: "bounded-device-class",
      android_release: "16",
      identity_sha256: HASH,
    },
    toolchain: {},
    started_at: "bounded-time",
    finished_at: "bounded-time",
  };
  assert.deepEqual(sanitizePhase18GarminProofBuildManifest(retained, {
    currentPythonLockSha256: HASH,
    retainedSignatureSha256: HASH,
  }), manifest());
  assert.throws(
    () => sanitizePhase18GarminProofBuildManifest({
      ...retained,
      device: { ...retained.device, serial: "personal-device" },
    }, {
      currentPythonLockSha256: HASH,
      retainedSignatureSha256: HASH,
    }),
    /phase18_build_manifest_privacy_invalid/u,
  );
  const buildScript = readFileSync("scripts/build-current-native-test-apk.sh", "utf8");
  assert.match(buildScript, /phase18-garmin-proof/u);
  assert.match(buildScript, /device_identity_sha256/u);
});

test("Phase 18 host plan mode never resolves adb, installs, launches, or writes evidence", () => {
  const calls = [];
  const result = executePhase18GarminProofRunner([
    "--manifest",
    MANIFEST,
  ], {
    native: (...args) => calls.push(args),
    writeEvidence: (...args) => calls.push(args),
  });
  assert.equal(result.status, "native_deferred");
  assert.deepEqual(calls, []);
});

test("Phase 18 runner classifies post-manifest failures without leaking exception details", () => {
  const report = createPhase18GarminTechnicalReviewReport({
    manifest: manifest(),
    passedCases: [],
    stage: "PH18-PKG",
    code: "packaging_failed",
    privateError: new Error("private path token account activity 123456789"),
  });
  assert.equal(report.status, "TECHNICAL_REVIEW_REQUIRED");
  assert.deepEqual(report.cases, [{
    id: "PH18-PKG",
    status: "TECHNICAL_REVIEW_REQUIRED",
    duration_ms: 0,
    code: "packaging_failed",
  }]);
  assert.equal(report.failure_stage, "PH18-PKG");
  assert.deepEqual(report.privacy_scan, {
    status: "not_run",
    scanned_artifact_count: 0,
  });
  assert.doesNotMatch(JSON.stringify(report), /private|path|token|account|123456789/iu);
  assert.throws(
    () => createPhase18GarminTechnicalReviewReport({
      manifest: manifest(),
      passedCases: [passedCase("PH18-PKG")],
      stage: "PH18-READ",
      code: "temporary_failure",
    }),
    /phase18_case_order_invalid/u,
  );
});

test("Phase 18 runner executes ordered login, restore, rotation, and privacy checks in process", () => {
  const workspace = withProofArtifacts();
  const writes = [];
  const logs = [
    "",
    [
      marker({ id: "PH18-LOGIN", status: "passed", duration_ms: 1 }),
      marker({ id: "PH18-MFA", status: "passed", duration_ms: 1, outcome: "not_requested" }),
      marker({ id: "PH18-READ", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
    ].join("\n"),
    [
      marker({ id: "PH18-RESTART", status: "passed", duration_ms: 1 }),
      marker({ id: "PH18-REFRESH", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
    ].join("\n"),
    [
      marker({ id: "PH18-RESTART", status: "passed", duration_ms: 1 }),
      marker({ id: "PH18-REFRESH", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
    ].join("\n"),
  ];
  const commands = [];
  try {
    const result = executePhase18GarminProofRunner([
      "--manifest",
      MANIFEST,
      "--execute",
      "--phase20-native-checkpoint",
    ], {
      native(program, args, options = {}) {
        commands.push([path.basename(program), ...args]);
        if (path.basename(program) === "git") return `${workspace.fixture.currentHead}\n`;
        if (path.basename(program) === "apksigner") {
          return `Signer #1 certificate SHA-256 digest: ${workspace.fixture.retainedSignatureSha256}\n`;
        }
        if (args[0] === "devices") {
          return `List of devices attached\n${workspace.fixture.device.serial}\tdevice\n`;
        }
        if (args[2] === "shell" && args[3] === "getprop") {
          const property = args[4];
          if (property === "ro.product.cpu.abi") return `${workspace.fixture.device.abi}\n`;
          if (property === "ro.build.version.sdk") return `${workspace.fixture.device.apiLevel}\n`;
          if (property === "ro.product.model") return `${workspace.fixture.device.model}\n`;
        }
        if (args[2] === "install") return "";
        if (args[2] === "shell" && args[3] === "pm" && args[4] === "path") {
          return "package:/data/app/phase18/base.apk\n";
        }
        if (args[2] === "exec-out" && args[3] === "cat") return workspace.fixture.apkBytes;
        if (args[2] === "logcat" && args[3] === "-c") return "";
        if (args[2] === "shell" && args[3] === "am" && args[4] === "start") return "";
        if (args[2] === "shell" && args[3] === "am" && args[4] === "force-stop") return "";
        if (args[2] === "shell" && args[3] === "pidof") return "4242\n";
        if (args[2] === "logcat" && args[3] === "-d") return logs.shift() ?? "";
        if (args[2] === "shell" && args[3] === "run-as" && args[5] === "find") {
          return "./no_backup/garmin-session/garmin-di-session.bin\n";
        }
        if (args[2] === "shell" && args[3] === "run-as" && args[5] === "test") return "";
        throw new Error(`unexpected_command:${[path.basename(program), ...args].join(" ")}`);
      },
      writeEvidence(report) {
        writes.push(report);
      },
    });
    assert.equal(result.status, "passed");
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].cases.map(({ id }) => id), createPhase18GarminProofRunnerPlan().case_ids);
    assert.equal(writes[0].privacy_scan.status, "passed");
    assert.ok(commands.some((entry) => entry.includes("install")));
  } finally {
    workspace.cleanup();
  }
});

test("Phase 18 runner records bounded review reports for technical stop, rotation failure, identity drift, and log failures", () => {
  const scenarios = [
    {
      name: "technical stop preserves ordered failure stage",
      logLines: [marker({ id: "PH18-LOGIN", status: "TECHNICAL_REVIEW_REQUIRED", duration_ms: 0, code: "sign_in_required" })],
      expected: { stage: "PH18-LOGIN", code: "sign_in_required" },
    },
    {
      name: "rotated restore failure fails closed",
      logLines: [
        [
          marker({ id: "PH18-LOGIN", status: "passed", duration_ms: 1 }),
          marker({ id: "PH18-MFA", status: "passed", duration_ms: 1, outcome: "not_requested" }),
          marker({ id: "PH18-READ", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
        ].join("\n"),
        [
          marker({ id: "PH18-RESTART", status: "passed", duration_ms: 1 }),
          marker({ id: "PH18-REFRESH", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
        ].join("\n"),
        marker({ id: "PH18-REFRESH", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
      ],
      expected: { stage: "PH18-RESTART", code: "temporary_failure" },
    },
    {
      name: "pid lookup failure is captured without leaking logs",
      logLines: [],
      pid: "missing",
      expected: { stage: "PH18-LOGIN", code: "temporary_failure" },
    },
  ];
  for (const scenario of scenarios) {
    const workspace = withProofArtifacts();
    const writes = [];
    try {
      const result = executePhase18GarminProofRunner([
        "--manifest",
        MANIFEST,
        "--execute",
        "--phase20-native-checkpoint",
      ], {
        native(program, args) {
          if (path.basename(program) === "git") return `${workspace.fixture.currentHead}\n`;
          if (path.basename(program) === "apksigner") {
            return `Signer #1 certificate SHA-256 digest: ${workspace.fixture.retainedSignatureSha256}\n`;
          }
          if (args[0] === "devices") {
            return `List of devices attached\n${workspace.fixture.device.serial}\tdevice\n`;
          }
          if (args[2] === "shell" && args[3] === "getprop") {
            const property = args[4];
            if (property === "ro.product.cpu.abi") return `${workspace.fixture.device.abi}\n`;
            if (property === "ro.build.version.sdk") return `${workspace.fixture.device.apiLevel}\n`;
            if (property === "ro.product.model") return `${workspace.fixture.device.model}\n`;
          }
          if (args[2] === "install") return "";
          if (args[2] === "shell" && args[3] === "pm" && args[4] === "path") {
            return "package:/data/app/phase18/base.apk\n";
          }
          if (args[2] === "exec-out" && args[3] === "cat") return workspace.fixture.apkBytes;
          if (args[2] === "logcat" && args[3] === "-c") return "";
          if (args[2] === "shell" && args[3] === "am" && args[4] === "start") return "";
          if (args[2] === "shell" && args[3] === "am" && args[4] === "force-stop") return "";
          if (args[2] === "shell" && args[3] === "pidof") return scenario.pid ?? "4242\n";
          if (args[2] === "logcat" && args[3] === "-d") return scenario.logLines.shift() ?? "";
          if (args[2] === "shell" && args[3] === "run-as" && args[5] === "find") {
            return "./no_backup/garmin-session/garmin-di-session.bin\n";
          }
          if (args[2] === "shell" && args[3] === "run-as" && args[5] === "test") return "";
          throw new Error(`unexpected_command:${[path.basename(program), ...args].join(" ")}`);
        },
        writeEvidence(report) {
          writes.push(report);
        },
      });
      assert.equal(result.status, "TECHNICAL_REVIEW_REQUIRED", scenario.name);
      assert.equal(writes[0].failure_stage, scenario.expected.stage, scenario.name);
      assert.equal(writes[0].failure_code, scenario.expected.code, scenario.name);
    } finally {
      workspace.cleanup();
    }
  }
});

test("Phase 18 runner rejects device selection, malformed device identity, manifest identity drift, backup leakage, timeout, and out-of-order review logs", () => {
  const originalDateNow = Date.now;
  const scenarios = [
    {
      name: "device selection",
      deviceList: "List of devices attached\n",
      expected: { stage: "PH18-PKG", code: "packaging_failed" },
    },
    {
      name: "device identity",
      deviceAbi: "x86_64",
      expected: { stage: "PH18-PKG", code: "packaging_failed" },
    },
    {
      name: "manifest drift",
      manifestDeviceIdentitySha256: "c".repeat(64),
      expected: { stage: "PH18-PKG", code: "packaging_failed" },
    },
    {
      name: "backup leakage",
      backupFiles: "./private/session.json\n",
      logLines: [
        [
          marker({ id: "PH18-LOGIN", status: "passed", duration_ms: 1 }),
          marker({ id: "PH18-MFA", status: "passed", duration_ms: 1, outcome: "not_requested" }),
          marker({ id: "PH18-READ", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
        ].join("\n"),
        [
          marker({ id: "PH18-RESTART", status: "passed", duration_ms: 1 }),
          marker({ id: "PH18-REFRESH", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
        ].join("\n"),
        [
          marker({ id: "PH18-RESTART", status: "passed", duration_ms: 1 }),
          marker({ id: "PH18-REFRESH", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
        ].join("\n"),
      ],
      expected: { stage: "PH18-PRIVACY", code: "privacy_scan_failed" },
    },
    {
      name: "timeout",
      logLines: [],
      timeoutNow: [0, 0, 0, 10_000_000],
      expected: { stage: "PH18-LOGIN", code: "timeout" },
    },
    {
      name: "review not last",
      logLines: [[
        marker({ id: "PH18-LOGIN", status: "TECHNICAL_REVIEW_REQUIRED", duration_ms: 0, code: "sign_in_required" }),
        marker({ id: "PH18-MFA", status: "passed", duration_ms: 1, outcome: "not_requested" }),
      ].join("\n")],
      expected: { stage: "PH18-LOGIN", code: "temporary_failure" },
    },
  ];
  for (const scenario of scenarios) {
    const workspace = withProofArtifacts(scenario);
    const writes = [];
    if (scenario.timeoutNow) {
      let index = 0;
      Date.now = () => scenario.timeoutNow[Math.min(index++, scenario.timeoutNow.length - 1)];
    }
    try {
      executePhase18GarminProofRunner([
        "--manifest",
        MANIFEST,
        "--execute",
        "--phase20-native-checkpoint",
      ], {
        native(program, args) {
          if (path.basename(program) === "git") return `${workspace.fixture.currentHead}\n`;
          if (path.basename(program) === "apksigner") {
            return `Signer #1 certificate SHA-256 digest: ${workspace.fixture.retainedSignatureSha256}\n`;
          }
          if (args[0] === "devices") {
            return scenario.deviceList
              ?? `List of devices attached\n${workspace.fixture.device.serial}\tdevice\n`;
          }
          if (args[2] === "shell" && args[3] === "getprop") {
            const property = args[4];
            if (property === "ro.product.cpu.abi") return `${scenario.deviceAbi ?? workspace.fixture.device.abi}\n`;
            if (property === "ro.build.version.sdk") return `${workspace.fixture.device.apiLevel}\n`;
            if (property === "ro.product.model") return `${workspace.fixture.device.model}\n`;
          }
          if (args[2] === "install") return "";
          if (args[2] === "shell" && args[3] === "pm" && args[4] === "path") {
            return "package:/data/app/phase18/base.apk\n";
          }
          if (args[2] === "exec-out" && args[3] === "cat") return workspace.fixture.apkBytes;
          if (args[2] === "logcat" && args[3] === "-c") return "";
          if (args[2] === "shell" && args[3] === "am" && args[4] === "start") return "";
          if (args[2] === "shell" && args[3] === "am" && args[4] === "force-stop") return "";
          if (args[2] === "shell" && args[3] === "pidof") return "4242\n";
          if (args[2] === "logcat" && args[3] === "-d") return scenario.logLines?.shift() ?? "";
          if (args[2] === "shell" && args[3] === "run-as" && args[5] === "find") {
            return scenario.backupFiles ?? "./no_backup/garmin-session/garmin-di-session.bin\n";
          }
          if (args[2] === "shell" && args[3] === "run-as" && args[5] === "test") return "";
          throw new Error(`unexpected_command:${[path.basename(program), ...args].join(" ")}`);
        },
        writeEvidence(report) {
          writes.push(report);
        },
      });
      assert.equal(writes[0].failure_stage, scenario.expected.stage, scenario.name);
      assert.equal(writes[0].failure_code, scenario.expected.code, scenario.name);
    } finally {
      Date.now = originalDateNow;
      workspace.cleanup();
    }
  }
});

test("Phase 18 route is guarded, uses the real adapter/module, and keeps secrets in secure fields", () => {
  const route = readFileSync("app/__phase18-garmin-proof.tsx", "utf8");
  const bootstrap = readFileSync("src/bootstrap/phase18GarminProof.ts", "utf8");
  const layout = readFileSync("app/_layout.tsx", "utf8");
  assert.match(route, /phase18GarminProofEnabled/u);
  assert.match(route, /createProductionPhase18GarminProofHarness/u);
  assert.match(bootstrap, /createGarminActivityAdapter/u);
  assert.match(bootstrap, /getGarminConnectNativeModule/u);
  assert.match(route, /secureTextEntry/u);
  assert.doesNotMatch(route, /fetch\(|axios|child_process|python-shell|localhost|http:\/\//u);
  assert.doesNotMatch(route, /final-evidence\.json/u);
  assert.match(layout, /Phase18GarminProofNavigator/u);
  assert.match(layout, /nativeContractSuite === "phase18-garmin-proof"/u);
  assert.match(layout, /pathname === "\/__phase18-garmin-proof"/u);
});

test("Phase 18 package scripts expose only planning, focused tests, and strict verification", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  assert.equal(
    scripts["proof:phase18:garmin"],
    `node scripts/run-phase18-garmin-proof.mjs --manifest ${MANIFEST}`,
  );
  assert.equal(
    scripts["verify:phase18:garmin-proof"],
    `node scripts/verify-phase18-garmin-proof.mjs --manifest ${MANIFEST}`,
  );
  assert.equal(
    scripts["test:evidence:phase18:garmin-proof"],
    "node --test scripts/phase18-garmin-proof.test.mjs",
  );
});

test("Phase 18 verifier accepts one exact ordered pass and binds current source/artifacts", () => {
  const evidence = passedEvidence();
  assert.deepEqual(validatePhase18GarminProofEvidence(evidence), {
    status: "passed",
    cases: 7,
  });
  assert.equal(validatePhase18GarminProofCurrentIdentity(evidence, {
    currentHead: HEAD,
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    installedApkSha256: HASH,
    retainedSignatureSha256: HASH,
    deviceIdentitySha256: HASH,
    rawReportSha256: HASH,
  }), true);
});

test("Phase 18 verifier rejects missing, skipped, duplicated, and reordered cases", () => {
  const exact = passedEvidence();
  const variants = [
    { ...exact, cases: exact.cases.slice(0, -1) },
    { ...exact, cases: exact.cases.map((entry, index) => index === 3 ? { ...entry, status: "skipped" } : entry) },
    { ...exact, cases: [...exact.cases.slice(0, -1), exact.cases[0]] },
    { ...exact, cases: [exact.cases[1], exact.cases[0], ...exact.cases.slice(2)] },
    { ...exact, case_ids: [...exact.case_ids].reverse() },
  ];
  for (const evidence of variants) {
    assert.throws(
      () => validatePhase18GarminProofEvidence(evidence),
      /phase18_evidence_/u,
    );
  }
});

test("Phase 18 verifier rejects stale or wrong artifact bindings", () => {
  const evidence = passedEvidence();
  const current = {
    currentHead: HEAD,
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    installedApkSha256: HASH,
    retainedSignatureSha256: HASH,
    deviceIdentitySha256: HASH,
    rawReportSha256: HASH,
  };
  for (const key of Object.keys(current)) {
    const wrong = {
      ...current,
      [key]: key === "currentHead" ? "c".repeat(40) : "c".repeat(64),
    };
    assert.throws(
      () => validatePhase18GarminProofCurrentIdentity(evidence, wrong),
      /phase18_evidence_current_identity_invalid/u,
    );
  }
});

test("Phase 18 verifier rejects invalid durations, result hashes, installed identity drift, and mismatched final evidence", () => {
  const invalidPackage = passedEvidence({
    cases: [
      { id: "PH18-PKG", status: "passed", duration_ms: -1, result_sha256: HASH },
      ...createPhase18GarminProofRunnerPlan().case_ids.slice(1).map(passedCase),
    ],
  });
  assert.throws(
    () => validatePhase18GarminProofEvidence(invalidPackage),
    /phase18_evidence_case_duration_invalid/u,
  );
  const invalidHash = passedEvidence({
    cases: [
      { id: "PH18-PKG", status: "passed", duration_ms: 1, result_sha256: "short" },
      ...createPhase18GarminProofRunnerPlan().case_ids.slice(1).map(passedCase),
    ],
  });
  assert.throws(
    () => validatePhase18GarminProofEvidence(invalidHash),
    /phase18_evidence_case_invalid:PH18-PKG/u,
  );
  assert.throws(
    () => validatePhase18GarminProofCurrentIdentity(passedEvidence(), {
      currentHead: HEAD,
      currentSourceTreeSha256: HASH,
      currentPythonLockSha256: HASH,
      retainedApkSha256: HASH,
      installedApkSha256: "c".repeat(64),
      retainedSignatureSha256: HASH,
      deviceIdentitySha256: HASH,
      rawReportSha256: HASH,
    }),
    /phase18_evidence_current_identity_invalid/u,
  );
  const workspace = withProofArtifacts();
  try {
    const report = passedEvidence();
    delete report.raw_report_sha256;
    delete report.case_ids;
    writeFileSync(path.resolve(PHASE18_GARMIN_PROOF_RAW_REPORT), `${JSON.stringify(report, null, 2)}\n`);
    const finalEvidence = passedEvidence({ manifest: manifest({ apk_sha256: "c".repeat(64) }) });
    writeFileSync(
      path.resolve(PHASE18_GARMIN_PROOF_ARTIFACT_ROOT, "final-evidence.json"),
      `${JSON.stringify(finalEvidence, null, 2)}\n`,
    );
    assert.throws(
      () => executePhase18GarminProofVerifier(["--manifest", MANIFEST]),
      /phase18_evidence_report_identity_invalid/u,
    );
  } finally {
    workspace.cleanup();
  }

  const missingDeviceWorkspace = withProofArtifacts();
  try {
    writeFileSync(
      path.join(process.env.ANDROID_HOME, "platform-tools", "adb"),
      "#!/bin/sh\nset -eu\nif [ \"$1\" = \"devices\" ]; then printf 'List of devices attached\\n'; exit 0; fi\nexit 0\n",
    );
    chmodSync(path.join(process.env.ANDROID_HOME, "platform-tools", "adb"), 0o755);
    const report = passedEvidence();
    delete report.raw_report_sha256;
    delete report.case_ids;
    writeFileSync(path.resolve(PHASE18_GARMIN_PROOF_RAW_REPORT), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(
      path.resolve(PHASE18_GARMIN_PROOF_ARTIFACT_ROOT, "final-evidence.json"),
      `${JSON.stringify(passedEvidence(), null, 2)}\n`,
    );
    assert.throws(
      () => executePhase18GarminProofVerifier(["--manifest", MANIFEST]),
      /phase18_evidence_device_selection_invalid/u,
    );
  } finally {
    missingDeviceWorkspace.cleanup();
  }

  const invalidInstalledIdentityWorkspace = withProofArtifacts();
  try {
    writeFileSync(
      path.join(process.env.ANDROID_HOME, "platform-tools", "adb"),
      `#!/bin/sh
set -eu
serial="${invalidInstalledIdentityWorkspace.fixture.device.serial}"
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\n%s\\tdevice\\n' "$serial"
  exit 0
fi
if [ "$1" = "-s" ]; then
  shift 2
fi
if [ "$1" = "shell" ] && [ "$2" = "getprop" ]; then
  case "$3" in
    ro.product.cpu.abi) printf 'x86_64\\n' ;;
    ro.build.version.sdk) printf '${invalidInstalledIdentityWorkspace.fixture.device.apiLevel}\\n' ;;
    ro.product.model) printf '${invalidInstalledIdentityWorkspace.fixture.device.model}\\n' ;;
    *) exit 1 ;;
  esac
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "pm" ] && [ "$3" = "path" ]; then
  printf 'package:/system/app/base.apk\\n'
  exit 0
fi
exit 0
`,
    );
    chmodSync(path.join(process.env.ANDROID_HOME, "platform-tools", "adb"), 0o755);
    const report = passedEvidence();
    delete report.raw_report_sha256;
    delete report.case_ids;
    writeFileSync(path.resolve(PHASE18_GARMIN_PROOF_RAW_REPORT), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(
      path.resolve(PHASE18_GARMIN_PROOF_ARTIFACT_ROOT, "final-evidence.json"),
      `${JSON.stringify(passedEvidence(), null, 2)}\n`,
    );
    assert.throws(
      () => executePhase18GarminProofVerifier(["--manifest", MANIFEST]),
      /phase18_evidence_installed_identity_invalid/u,
    );
  } finally {
    invalidInstalledIdentityWorkspace.cleanup();
  }
});

test("Phase 18 verifier accepts a bounded technical stop but never mistakes it for PASS", () => {
  const cases = createPhase18GarminProofRunnerPlan().case_ids
    .slice(0, 5)
    .map(passedCase);
  cases[4] = {
    id: "PH18-RESTART",
    status: "TECHNICAL_REVIEW_REQUIRED",
    duration_ms: 1,
    code: "sign_in_required",
  };
  const evidence = passedEvidence({
    status: "TECHNICAL_REVIEW_REQUIRED",
    cases,
    failure_stage: "PH18-RESTART",
    failure_code: "sign_in_required",
  });
  assert.deepEqual(validatePhase18GarminProofEvidence(evidence), {
    status: "TECHNICAL_REVIEW_REQUIRED",
    cases: 5,
    stage: "PH18-RESTART",
    code: "sign_in_required",
  });
  assert.throws(
    () => validatePhase18GarminProofEvidence({ ...evidence, status: "passed" }),
    /phase18_evidence_/u,
  );
});

test("Phase 18 verifier rejects secret, account, activity, route, health, filename, URL, and SQL data", () => {
  const forbidden = [
    { credentials: "secret" },
    { account_namespace: "private" },
    { external_activity_id: "123456789" },
    { route: [{ latitude: 1 }] },
    { heart_rate: 151 },
    { bodyweight: 70 },
    { filename: "personal.fit" },
    { url: "https://example.invalid" },
    { sql_params: ["private"] },
    { note: "owner@example.invalid" },
  ];
  for (const extra of forbidden) {
    assert.throws(
      () => validatePhase18GarminProofEvidence({ ...passedEvidence(), ...extra }),
      /phase18_evidence_privacy_invalid/u,
    );
  }
});

test("Phase 18 final evidence can only be sealed from a matching bounded raw report", () => {
  const report = passedEvidence();
  delete report.raw_report_sha256;
  delete report.case_ids;
  const rawReportBytes = Buffer.from(`${JSON.stringify(report)}\n`);
  const finalEvidence = createPhase18GarminProofFinalEvidence({
    manifest: manifest(),
    report,
    rawReportBytes,
  });
  assert.equal(finalEvidence.raw_report_sha256, createHash("sha256").update(rawReportBytes).digest("hex"));
  assert.deepEqual(finalEvidence.case_ids, createPhase18GarminProofRunnerPlan().case_ids);
  assert.deepEqual(validatePhase18GarminProofEvidence(finalEvidence), {
    status: "passed",
    cases: 7,
  });
  assert.throws(
    () => createPhase18GarminProofFinalEvidence({
      manifest: manifest({ apk_sha256: "c".repeat(64) }),
      report,
      rawReportBytes,
    }),
    /phase18_evidence_report_identity_invalid/u,
  );
});

test("Phase 18 CLI helpers emit bounded stdout and stderr", () => {
  const runner = captureCli(executePhase18GarminProofRunnerCli, [
    "node",
    "scripts/run-phase18-garmin-proof.mjs",
    "--manifest",
    MANIFEST,
  ]);
  assert.match(runner.stdout, /"status":"native_deferred"/u);

  const verifier = captureCli(executePhase18GarminProofVerifierCli, [
    "node",
    "scripts/verify-phase18-garmin-proof.mjs",
    "--manifest",
    "wrong.json",
  ]);
  assert.match(verifier.stderr, /phase18_verifier_arguments_invalid/u);

  const runnerFailure = captureCli(executePhase18GarminProofRunnerCli, [
    "node",
    "scripts/run-phase18-garmin-proof.mjs",
    "--manifest",
    "wrong.json",
  ]);
  assert.match(runnerFailure.stderr, /phase18_runner_arguments_invalid/u);
});

test("Phase 18 sealing requires the explicit comprehensive Phase 20 checkpoint", () => {
  assert.deepEqual(parsePhase18GarminProofVerifierArgs([
    "--manifest",
    MANIFEST,
  ]), {
    manifest: MANIFEST,
    seal: false,
    phase20Checkpoint: false,
  });
  assert.deepEqual(parsePhase18GarminProofVerifierArgs([
    "--manifest",
    MANIFEST,
    "--seal",
    "--phase20-native-checkpoint",
  ]), {
    manifest: MANIFEST,
    seal: true,
    phase20Checkpoint: true,
  });
  assert.throws(
    () => parsePhase18GarminProofVerifierArgs(["--manifest", MANIFEST, "--seal"]),
    /phase18_verifier_arguments_invalid/u,
  );
});
