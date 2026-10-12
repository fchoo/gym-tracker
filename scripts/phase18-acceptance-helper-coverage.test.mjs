import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  executePhase18GarminAcceptanceVerifier,
  resolvePhase18GarminAcceptanceCurrentIdentity,
  validatePhase18GarminAcceptanceEvidence,
} from "./acceptance-verifier-evidence.mjs";
import {
  PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT,
  createPhase18GarminAdversarialRawReport,
  createPhase18GarminAdversarialRunnerPlan,
  executePhase18GarminAdversarialRunner,
} from "./adversarial-runner-evidence.mjs";
import {
  executePhase18GarminAdversarialVerifier,
  resolvePhase18GarminAdversarialCurrentIdentity,
  validatePhase18GarminAdversarialEvidence,
} from "./adversarial-verifier-evidence.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { createPhase18GarminAcceptanceRunnerPlan } from "./run-phase18-garmin-acceptance.mjs";
import { createPhase18GarminProofRunnerPlan } from "./run-phase18-garmin-proof.mjs";

const HASH = "a".repeat(64);
const PACKAGE = "com.fchoo.gymtracker.devtest";
const PYTHON_LOCK = "modules/garmin-connect/python/garmin-python-lock.json";
const ACCEPTANCE_ROOT = "artifacts/native/phase18-garmin-acceptance";
const ACCEPTANCE_APK = `${ACCEPTANCE_ROOT}/gym-tracker-phase18-garmin-acceptance-devtest.apk`;
const ADVERSARIAL_APK =
  `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-adversarial-devtest.apk`;
const ADVERSARIAL_MANIFEST = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/build.json`;
const ADVERSARIAL_RAW_REPORT = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/raw-report.json`;
const ADVERSARIAL_NATIVE_REPORT = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/native-report.json`;
const ADVERSARIAL_PRIVACY_REPORT = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/privacy-report.json`;
const ADVERSARIAL_FINAL = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/final-evidence.json`;
const ACCEPTANCE_MANIFEST = `${ACCEPTANCE_ROOT}/build.json`;
const ACCEPTANCE_RAW_REPORT = `${ACCEPTANCE_ROOT}/raw-report.json`;
const ACCEPTANCE_MAESTRO_REPORT = `${ACCEPTANCE_ROOT}/maestro-report.json`;
const ACCEPTANCE_PRIVACY_REPORT = `${ACCEPTANCE_ROOT}/privacy-report.json`;
const PROOF_EVIDENCE = "artifacts/native/phase18-garmin-proof/final-evidence.json";
const ADVERSARIAL_EVIDENCE = "artifacts/native/phase18-garmin-adversarial/final-evidence.json";
const MAESTRO_SOURCE = "maestro/phase18/garmin-sync.yaml";

const acceptanceObservations = {
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

const expectedCodes = [
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

const expectedCalls = [1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 5, 3];

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
  writeFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeExecutable(filePath, contents) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
  chmodSync(filePath, 0o755);
}

function withProcessState({ cwd, env }, callback) {
  const originalCwd = process.cwd();
  const trackedKeys = Object.keys(env);
  const originals = new Map(trackedKeys.map((key) => [key, process.env[key]]));
  process.chdir(cwd);
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return callback();
  } finally {
    process.chdir(originalCwd);
    for (const [key, value] of originals) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function initRepo(root) {
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Phase18 Coverage"], { cwd: root });
}

function commitRepo(root) {
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: root });
}

function setupSourceRepo(root) {
  initRepo(root);
  writeFile(root, "README.md", "phase18 helper coverage fixture\n");
  writeFile(root, PYTHON_LOCK, '{"lock":"current"}\n');
  commitRepo(root);
}

function acceptanceAdbScript({ installedApkSource, devices = "ACCEPT123\tdevice", packagePath = "/data/app/phase18/base.apk" }) {
  return `#!/bin/sh
set -eu
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\n${devices}\\n'
  exit 0
fi
if [ "$1" = "-s" ]; then
  shift 2
fi
if [ "$1" = "shell" ] && [ "$2" = "getprop" ] && [ "$3" = "ro.product.cpu.abi" ]; then
  printf 'arm64-v8a\\n'
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "getprop" ] && [ "$3" = "ro.build.version.sdk" ]; then
  printf '36\\n'
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "getprop" ] && [ "$3" = "ro.product.model" ]; then
  printf 'phase18-acceptance-device\\n'
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "pm" ] && [ "$3" = "path" ] && [ "$4" = "${PACKAGE}" ]; then
  ${packagePath === null ? "exit 0" : `printf 'package:${packagePath}\\n'`}
  exit 0
fi
if [ "$1" = "pull" ]; then
  cp "${installedApkSource}" "$3"
  exit 0
fi
exit 1
`;
}

function verifierAdbScript({
  installedApkSource,
  devices = "ADV123\tdevice",
  abi = "arm64-v8a",
  packagePath = "/data/app/phase18/base.apk",
}) {
  return `#!/bin/sh
set -eu
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\n${devices}\\n'
  exit 0
fi
if [ "$1" = "-s" ]; then
  shift 2
fi
if [ "$1" = "shell" ] && [ "$2" = "getprop" ] && [ "$3" = "ro.product.cpu.abi" ]; then
  printf '${abi}\\n'
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "getprop" ] && [ "$3" = "ro.build.version.sdk" ]; then
  printf '36\\n'
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "getprop" ] && [ "$3" = "ro.product.model" ]; then
  printf 'phase18-adversarial-device\\n'
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "pm" ] && [ "$3" = "path" ] && [ "$4" = "${PACKAGE}" ]; then
  printf 'package:${packagePath}\\n'
  exit 0
fi
if [ "$1" = "exec-out" ] && [ "$2" = "cat" ] && [ "$3" = "${packagePath}" ]; then
  cat "${installedApkSource}"
  exit 0
fi
exit 1
`;
}

function createFakeSdk(root, {
  adbScript,
  apksignerOutput = "Signer #1 certificate SHA-256 digest: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n",
  includeAdb = true,
  includeApksigner = true,
  buildToolsVersion = "35.0.0",
  sdkName,
} = {}) {
  const sdkRoot = path.join(root, sdkName ?? `fake-android-sdk-${Math.random().toString(16).slice(2)}`);
  if (includeAdb) {
    writeExecutable(path.join(sdkRoot, "platform-tools", "adb"), adbScript);
  }
  if (includeApksigner) {
    writeExecutable(path.join(sdkRoot, "build-tools", buildToolsVersion, "apksigner"), `#!/bin/sh
set -eu
printf '%s' '${apksignerOutput.replaceAll("'", "'\"'\"'")}'
`);
  } else {
    mkdirSync(path.join(sdkRoot, "build-tools", buildToolsVersion), { recursive: true });
  }
  return sdkRoot;
}

function createRunnerAdb(root, payload) {
  const scriptPath = path.join(root, "fake-bin", "adb");
  const marker = `GYM_TRACKER_PHASE18_GARMIN_ADVERSARIAL_REPORT:${JSON.stringify(payload).replaceAll("'", "'\"'\"'")}`;
  writeExecutable(scriptPath, `#!/bin/sh
set -eu
if [ "$1" = "logcat" ] && [ "$2" = "-c" ]; then
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "am" ] && [ "$3" = "force-stop" ]; then
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "am" ] && [ "$3" = "start" ]; then
  exit 0
fi
if [ "$1" = "logcat" ] && [ "$2" = "-d" ]; then
  printf 'I/Test(0): ${marker}\\n'
  exit 0
fi
exit 1
`);
  return path.dirname(scriptPath);
}

function adversarialCases() {
  const sessionDigests = [
    "1".repeat(64),
    "2".repeat(64),
    "2".repeat(64),
    "3".repeat(64),
    "3".repeat(64),
    "3".repeat(64),
  ];
  return createPhase18GarminAdversarialRunnerPlan().case_ids.map((id, index) => ({
    id,
    status: "passed",
    provenance: "native-exact-artifact",
    stage: id.toLowerCase().replaceAll("ph18-adv-", "").replaceAll("-", "_"),
    code: expectedCodes[index],
    duration_ms: 1,
    call_count: expectedCalls[index],
    automatic_retry_count: 0,
    retry_after_ms: id === "PH18-ADV-429" ? 900_000 : 0,
    source_write_count: 0,
    connection_state: index === 3 || index === 5
      ? "disconnected"
      : index === 4 ? "sign-in-required" : "connected",
    sync_state: index === 1 || index === 2
      ? "success"
      : index >= 6
        ? `${id === "PH18-ADV-PARTIAL-PAGE" ? "partial" : "failure"}-${expectedCodes[index].replaceAll("_", "-")}`
        : index === 5 ? "failure-stale-generation" : "idle",
    session_digest: sessionDigests[index] ?? "4".repeat(64),
    history_digest: "5".repeat(64),
    source_digest: "6".repeat(64),
    match_digest: "7".repeat(64),
    generation_before: index === 3 ? 7 : index === 4 ? 8 : index === 5 ? 20 : index >= 6 ? 30 : 7,
    generation_after: index === 3 ? 8 : index === 4 ? 8 : index === 5 ? 21 : index >= 6 ? 30 : 7,
  }));
}

function adversarialManifest(identity) {
  return {
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

function validProofEvidence(current) {
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
      base_head: current.currentHead,
      source_tree_sha256: current.currentSourceTreeSha256,
      python_lock_sha256: current.currentPythonLockSha256,
      apk_sha256: current.retainedApkSha256,
      signature_sha256: current.retainedSignatureSha256,
      device_identity_sha256: current.deviceIdentitySha256,
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

function validAdversarialEvidence(current) {
  return {
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    status: "passed",
    manifest: adversarialManifest(current),
    case_ids: createPhase18GarminAdversarialRunnerPlan().case_ids,
    cases: adversarialCases(),
    native_report: {
      path: ADVERSARIAL_NATIVE_REPORT,
      sha256: HASH,
    },
    privacy_scan: {
      status: "passed",
      scanned_artifact_count: 4,
      report_sha256: HASH,
    },
  };
}

function acceptanceCases({ nativeStatus = "deferred", artifactSha256s = {} } = {}) {
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
    return nativeStatus === "verified"
      ? {
        id: entry.id,
        status: "verified",
        owner_plan: entry.ownerPlan,
        artifact: entry.artifact,
        artifact_sha256: artifactSha256s[entry.artifact] ?? HASH,
        proof_kind: "native-exact-artifact",
      }
      : {
        id: entry.id,
        status: "deferred",
        owner_plan: entry.ownerPlan,
        artifact: entry.artifact,
      };
  });
}

function acceptanceManifest(identity) {
  return {
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
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
  };
}

function retainedAcceptanceBuildManifest(identity) {
  return retainedBuildManifest(identity, "phase18-garmin-acceptance");
}

function acceptanceEvidence(identity, { nativeStatus = "deferred", artifactSha256s = {} } = {}) {
  return {
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    status: nativeStatus === "verified" ? "passed" : "host-passed-native-deferred",
    manifest: acceptanceManifest(identity),
    case_ids: createPhase18GarminAcceptanceRunnerPlan().case_ids,
    cases: acceptanceCases({ nativeStatus, artifactSha256s }),
    observations: acceptanceObservations,
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
}

function retainedBuildManifest(identity, suite) {
  return {
    schema_version: 1,
    suite,
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: identity.currentHead,
    source_tree_sha256: identity.currentSourceTreeSha256,
    package: PACKAGE,
    apk: {
      path: `artifacts/native/${suite}/gym-tracker-${suite}-devtest.apk`,
      sha256: identity.retainedApkSha256,
      page_alignment_verified: true,
    },
    installed_apk: {
      sha256: identity.retainedApkSha256,
      matches_retained_apk: true,
    },
    device: {
      abi: "arm64-v8a",
      identity_sha256: identity.deviceIdentitySha256,
    },
  };
}

test("acceptance current identity resolves from ANDROID_SDK_ROOT and rejects missing SDK branches", () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase18-acceptance-helper-"));
  try {
    setupSourceRepo(root);
    const apkBytes = Buffer.from("acceptance-apk");
    writeFile(root, ACCEPTANCE_APK, apkBytes);
    const installedApkSource = writeFile(root, "artifacts/installed-acceptance.apk", apkBytes);
    const sdkRoot = createFakeSdk(root, {
      adbScript: acceptanceAdbScript({ installedApkSource }),
      apksignerOutput: "Signer #1 certificate SHA-256 digest: BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB:BB\n",
    });
    const current = withProcessState({
      cwd: root,
      env: {
        ANDROID_HOME: undefined,
        ANDROID_SDK_ROOT: sdkRoot,
      },
    }, () => resolvePhase18GarminAcceptanceCurrentIdentity());
    assert.equal(current.currentHead, execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim());
    assert.equal(current.currentSourceTreeSha256, sourceTreeSha256(root));
    assert.equal(current.currentPythonLockSha256, digest(readFileSync(path.join(root, PYTHON_LOCK))));
    assert.equal(current.retainedApkSha256, digest(apkBytes));
    assert.equal(current.installedApkSha256, digest(apkBytes));
    assert.equal(current.retainedSignatureSha256, "b".repeat(64));
    assert.match(current.deviceIdentitySha256, /^[a-f0-9]{64}$/u);

    assert.throws(
      () => withProcessState({
        cwd: root,
        env: { ANDROID_HOME: undefined, ANDROID_SDK_ROOT: undefined },
      }, () => resolvePhase18GarminAcceptanceCurrentIdentity()),
      /phase18_acceptance_evidence_android_sdk_missing/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("acceptance current identity fails closed on missing apksigner, device identity, install path, and signature", () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase18-acceptance-failures-"));
  try {
    setupSourceRepo(root);
    const apkBytes = Buffer.from("acceptance-apk");
    writeFile(root, ACCEPTANCE_APK, apkBytes);
    const installedApkSource = writeFile(root, "artifacts/installed-acceptance.apk", apkBytes);

    const cases = [
      {
        code: /phase18_acceptance_evidence_apksigner_missing/u,
        sdkRoot: createFakeSdk(root, {
          adbScript: acceptanceAdbScript({ installedApkSource }),
          includeApksigner: false,
          sdkName: "sdk-apksigner-missing",
        }),
      },
      {
        code: /phase18_acceptance_evidence_apksigner_missing/u,
        sdkRoot: path.join(root, "sdk-without-build-tools"),
      },
      {
        code: /phase18_acceptance_evidence_device_identity_invalid/u,
        sdkRoot: createFakeSdk(root, {
          adbScript: acceptanceAdbScript({ installedApkSource, devices: "" }),
          sdkName: "sdk-device-invalid",
        }),
      },
      {
        code: /phase18_acceptance_evidence_installed_apk_missing/u,
        sdkRoot: createFakeSdk(root, {
          adbScript: acceptanceAdbScript({ installedApkSource, packagePath: null }),
          sdkName: "sdk-installed-missing",
        }),
      },
      {
        code: /phase18_acceptance_evidence_signature_unreadable/u,
        sdkRoot: createFakeSdk(root, {
          adbScript: acceptanceAdbScript({ installedApkSource }),
          apksignerOutput: "Signer #1 certificate SHA-256 digest: invalid\n",
          sdkName: "sdk-signature-invalid",
        }),
      },
    ];

    for (const { code, sdkRoot } of cases) {
      assert.throws(
        () => withProcessState({
          cwd: root,
          env: {
            ANDROID_HOME: undefined,
            ANDROID_SDK_ROOT: sdkRoot,
          },
        }, () => resolvePhase18GarminAcceptanceCurrentIdentity()),
        code,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("acceptance verifier hits schema, host, native, status, owner, and default identity branches", () => {
  const current = {
    currentHead: "b".repeat(40),
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    installedApkSha256: HASH,
    retainedSignatureSha256: HASH,
    deviceIdentitySha256: HASH,
  };

  assert.throws(
    () => validatePhase18GarminAcceptanceEvidence({
      ...acceptanceEvidence(current),
      suite: "wrong-suite",
    }),
    /phase18_acceptance_evidence_schema_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminAcceptanceEvidence({
      ...acceptanceEvidence(current),
      cases: acceptanceCases().map((entry, index) => index === 0
        ? { ...entry, source_digest: "bad-hash" }
        : entry),
    }),
    /phase18_acceptance_evidence_host_case_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminAcceptanceEvidence({
      ...acceptanceEvidence(current),
      cases: acceptanceCases().map((entry, index) => index === 0
        ? { ...entry, semantic_state: undefined }
        : entry),
    }),
    /phase18_acceptance_evidence_host_case_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminAcceptanceEvidence({
      ...acceptanceEvidence(current),
      native_flow: {
        path: MAESTRO_SOURCE,
        source_sha256: "bad-hash",
        report_sha256: HASH,
      },
    }),
    /phase18_acceptance_evidence_native_flow_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminAcceptanceEvidence({
      ...acceptanceEvidence(current),
      privacy_scan: {
        status: "passed",
        scanned_artifact_count: 0,
        report_sha256: HASH,
      },
    }),
    /phase18_acceptance_evidence_privacy_scan_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminAcceptanceEvidence({
      ...acceptanceEvidence(current),
      status: "passed",
    }),
    /phase18_acceptance_evidence_status_invalid/u,
  );

  const proofEvidence = validProofEvidence(current);
  const adversarialEvidence = validAdversarialEvidence(current);
  const proofBytes = Buffer.from(JSON.stringify(proofEvidence));
  const adversarialBytes = Buffer.from(JSON.stringify(adversarialEvidence));
  const flowBytes = Buffer.from("flow");
  const maestroBytes = Buffer.from("maestro");
  const privacyBytes = Buffer.from("privacy");
  const artifactSha256s = {
    [PROOF_EVIDENCE]: digest(proofBytes),
    [ADVERSARIAL_EVIDENCE]: digest(adversarialBytes),
  };
  const exact = {
    ...acceptanceEvidence(current, {
      nativeStatus: "verified",
      artifactSha256s,
    }),
    native_flow: {
      path: MAESTRO_SOURCE,
      source_sha256: digest(flowBytes),
      report_sha256: digest(maestroBytes),
    },
    privacy_scan: {
      status: "passed",
      scanned_artifact_count: 4,
      report_sha256: digest(privacyBytes),
    },
  };
  const bytes = new Map([
    [MAESTRO_SOURCE, flowBytes],
    [ACCEPTANCE_MAESTRO_REPORT, maestroBytes],
    [ACCEPTANCE_PRIVACY_REPORT, privacyBytes],
    [PROOF_EVIDENCE, proofBytes],
    [ADVERSARIAL_EVIDENCE, adversarialBytes],
  ]);
  assert.throws(
    () => executePhase18GarminAcceptanceVerifier([
      "--manifest", ACCEPTANCE_MANIFEST,
    ], {
      resolveCurrentIdentity: () => current,
      readBytes: (artifactPath) => bytes.get(artifactPath),
      readJson: (artifactPath) => {
        if (artifactPath === ACCEPTANCE_MANIFEST) return retainedAcceptanceBuildManifest(current);
        if (artifactPath === ACCEPTANCE_RAW_REPORT) {
          return {
            ...exact,
            cases: exact.cases.map((entry) => entry.artifact === PROOF_EVIDENCE
              ? { ...entry, artifact_sha256: HASH }
              : entry),
          };
        }
        if (artifactPath === ACCEPTANCE_MAESTRO_REPORT) return { status: "passed", observations: acceptanceObservations };
        if (artifactPath === ACCEPTANCE_PRIVACY_REPORT) return { status: "passed", scanned_artifact_count: 4 };
        if (artifactPath === PROOF_EVIDENCE) return proofEvidence;
        if (artifactPath === ADVERSARIAL_EVIDENCE) return adversarialEvidence;
        throw new Error(`unexpected path: ${artifactPath}`);
      },
      verifyOwnerArtifact: () => {},
    }),
    /phase18_acceptance_evidence_owner_artifact_invalid/u,
  );
  assert.throws(
    () => executePhase18GarminAcceptanceVerifier([
      "--manifest", ACCEPTANCE_MANIFEST,
    ], {
      resolveCurrentIdentity: () => current,
      readBytes: (artifactPath) => bytes.get(artifactPath),
      readJson: (artifactPath) => {
        if (artifactPath === ACCEPTANCE_MANIFEST) return retainedAcceptanceBuildManifest(current);
        if (artifactPath === ACCEPTANCE_RAW_REPORT) return exact;
        if (artifactPath === ACCEPTANCE_MAESTRO_REPORT) return { status: "passed", observations: acceptanceObservations };
        if (artifactPath === ACCEPTANCE_PRIVACY_REPORT) return { status: "passed", scanned_artifact_count: 4 };
        if (artifactPath === PROOF_EVIDENCE) {
          return {
            ...proofEvidence,
            manifest: { ...proofEvidence.manifest, python_lock_sha256: "c".repeat(64) },
          };
        }
        if (artifactPath === ADVERSARIAL_EVIDENCE) return adversarialEvidence;
        throw new Error(`unexpected path: ${artifactPath}`);
      },
      ownerCurrentIdentity: {
        [PROOF_EVIDENCE]: {
          ...current,
          currentPythonLockSha256: "c".repeat(64),
          retainedApkSha256: HASH,
          installedApkSha256: HASH,
          rawReportSha256: HASH,
          privacyReportSha256: HASH,
        },
        [ADVERSARIAL_EVIDENCE]: {
          ...current,
          retainedApkSha256: HASH,
          installedApkSha256: HASH,
          nativeReportSha256: HASH,
          privacyReportSha256: HASH,
        },
      },
      verifyOwnerArtifact: () => {},
    }),
    /phase18_acceptance_evidence_owner_manifest_invalid/u,
  );

  assert.deepEqual(executePhase18GarminAcceptanceVerifier([
    "--manifest", ACCEPTANCE_MANIFEST,
  ], {
    resolveCurrentIdentity: () => current,
    readBytes: (artifactPath) => bytes.get(artifactPath),
    readJson: (artifactPath) => {
      if (artifactPath === ACCEPTANCE_MANIFEST) return retainedAcceptanceBuildManifest(current);
      if (artifactPath === ACCEPTANCE_RAW_REPORT) return exact;
      if (artifactPath === ACCEPTANCE_MAESTRO_REPORT) return { status: "passed", observations: acceptanceObservations };
      if (artifactPath === ACCEPTANCE_PRIVACY_REPORT) return { status: "passed", scanned_artifact_count: 4 };
      if (artifactPath === PROOF_EVIDENCE) return proofEvidence;
      if (artifactPath === ADVERSARIAL_EVIDENCE) return adversarialEvidence;
      throw new Error(`unexpected path: ${artifactPath}`);
    },
    ownerCurrentIdentity: {
      [PROOF_EVIDENCE]: {
        ...current,
        retainedApkSha256: HASH,
        installedApkSha256: HASH,
        rawReportSha256: HASH,
        privacyReportSha256: HASH,
      },
      [ADVERSARIAL_EVIDENCE]: {
        ...current,
        retainedApkSha256: HASH,
        installedApkSha256: HASH,
        nativeReportSha256: HASH,
        privacyReportSha256: HASH,
      },
    },
    verifyOwnerArtifact: () => {},
  }), {
    status: "passed",
    host_cases: 17,
    native_prerequisites: 2,
  });
});

test("adversarial runner writes native, privacy, and raw reports through default I/O", () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase18-adv-runner-"));
  const originalPath = process.env.PATH;
  try {
    const manifestIdentity = {
      currentHead: "b".repeat(40),
      currentSourceTreeSha256: HASH,
      currentPythonLockSha256: HASH,
      retainedApkSha256: HASH,
      retainedSignatureSha256: HASH,
      deviceIdentitySha256: HASH,
    };
    writeJson(
      root,
      ADVERSARIAL_MANIFEST,
      retainedBuildManifest(manifestIdentity, "phase18-garmin-adversarial"),
    );
    const runnerPayload = {
      schema_version: 1,
      suite: "phase18-garmin-adversarial",
      status: "passed",
      cases: adversarialCases(),
      current_identity: manifestIdentity,
    };
    const binRoot = createRunnerAdb(root, runnerPayload);
    process.env.PATH = `${binRoot}:${originalPath ?? ""}`;

    const result = withProcessState({
      cwd: root,
      env: {},
    }, () => executePhase18GarminAdversarialRunner([
      "--manifest", ADVERSARIAL_MANIFEST,
      "--record", `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/native-record.json`,
      "--execute",
      "--phase20-native-checkpoint",
    ]));

    assert.deepEqual(result, { status: "passed", final_evidence_written: false });
    const nativeReport = JSON.parse(readFileSync(path.join(root, ADVERSARIAL_NATIVE_REPORT), "utf8"));
    const privacyReport = JSON.parse(readFileSync(path.join(root, ADVERSARIAL_PRIVACY_REPORT), "utf8"));
    const rawReport = JSON.parse(readFileSync(path.join(root, ADVERSARIAL_RAW_REPORT), "utf8"));
    assert.equal(nativeReport.status, "passed");
    assert.equal(privacyReport.status, "passed");
    assert.equal(rawReport.status, "passed");
    assert.equal(rawReport.cases.length, adversarialCases().length);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test("adversarial runner and verifier hit record and validation error branches", () => {
  const manifestIdentity = {
    currentHead: "b".repeat(40),
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    retainedSignatureSha256: HASH,
    deviceIdentitySha256: HASH,
  };
  assert.throws(
    () => executePhase18GarminAdversarialRunner([
      "--manifest", ADVERSARIAL_MANIFEST,
      "--record", `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/native-record.json`,
      "--execute",
      "--phase20-native-checkpoint",
    ], {
      readJson: () => retainedBuildManifest(manifestIdentity, "phase18-garmin-adversarial"),
      writeNativeReport: () => {},
      writePrivacyReport: () => {},
      writeRawReport: () => {},
      collectNativeReport: () => ({
        report: {
          schema_version: 1,
          suite: "phase18-garmin-adversarial",
          status: "passed",
          cases: adversarialCases(),
          current_identity: {
            currentHead: manifestIdentity.currentHead,
            currentSourceTreeSha256: manifestIdentity.currentSourceTreeSha256,
            currentPythonLockSha256: manifestIdentity.currentPythonLockSha256,
            retainedSignatureSha256: manifestIdentity.retainedSignatureSha256,
            deviceIdentitySha256: manifestIdentity.deviceIdentitySha256,
          },
        },
        logcat: "bounded markers",
      }),
    }),
    /phase18_garmin_adversarial_record_invalid/u,
  );

  const exact = createPhase18GarminAdversarialRawReport({
    manifest: adversarialManifest(manifestIdentity),
    status: "passed",
    cases: adversarialCases(),
    native_report: {
      path: ADVERSARIAL_NATIVE_REPORT,
      sha256: HASH,
    },
    privacy_scan: {
      status: "passed",
      scanned_artifact_count: 4,
      report_sha256: HASH,
    },
  });
  assert.throws(
    () => validatePhase18GarminAdversarialEvidence({
      ...exact,
      suite: "wrong-suite",
    }),
    /phase18_garmin_adversarial_evidence_schema_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminAdversarialEvidence({
      ...exact,
      cases: exact.cases.map((entry, index) => index === 10
        ? { ...entry, status: "TECHNICAL_REVIEW_REQUIRED", provenance: "native-exact-artifact" }
        : entry),
      status: "TECHNICAL_REVIEW_REQUIRED",
    }),
    /phase18_garmin_adversarial_evidence_case_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminAdversarialEvidence({
      ...exact,
      cases: exact.cases.map((entry, index) => index === 0
        ? { ...entry, history_digest: "8".repeat(64) }
        : entry),
    }),
    /phase18_garmin_adversarial_evidence_case_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminAdversarialEvidence({
      ...exact,
      cases: exact.cases.map((entry, index) => index === 3
        ? { ...entry, generation_after: entry.generation_before }
        : entry),
    }),
    /phase18_garmin_adversarial_evidence_case_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminAdversarialEvidence({
      ...exact,
      privacy_scan: {
        status: "passed",
        scanned_artifact_count: 0,
        report_sha256: HASH,
      },
    }),
    /phase18_garmin_adversarial_evidence_identity_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminAdversarialEvidence({
      ...exact,
      cases: exact.cases.map((entry, index) => index === 10
        ? { ...entry, status: "TECHNICAL_REVIEW_REQUIRED", provenance: "unexpected" }
        : entry),
      status: "passed",
    }),
    /phase18_garmin_adversarial_evidence_case_invalid/u,
  );
});

test("adversarial verifier resolves current identity and seals exact evidence through default helpers", () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase18-adv-verifier-"));
  try {
    setupSourceRepo(root);
    const apkBytes = Buffer.from("adversarial-apk");
    const nativeBytes = Buffer.from("native-report\n");
    const privacyBytes = Buffer.from("privacy-report\n");
    writeFile(root, ADVERSARIAL_APK, apkBytes);
    writeFile(root, ADVERSARIAL_NATIVE_REPORT, nativeBytes);
    writeFile(root, ADVERSARIAL_PRIVACY_REPORT, privacyBytes);
    const installedApkSource = writeFile(root, "artifacts/installed-adversarial.apk", apkBytes);
    const sdkRoot = createFakeSdk(root, {
      adbScript: verifierAdbScript({ installedApkSource }),
      apksignerOutput: "Signer #1 certificate SHA-256 digest: bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb:bb\n",
    });

    const identity = withProcessState({
      cwd: root,
      env: {
        ANDROID_HOME: undefined,
        ANDROID_SDK_ROOT: sdkRoot,
      },
    }, () => resolvePhase18GarminAdversarialCurrentIdentity());

    writeJson(
      root,
      ADVERSARIAL_MANIFEST,
      retainedBuildManifest(identity, "phase18-garmin-adversarial"),
    );
    writeJson(root, ADVERSARIAL_RAW_REPORT, createPhase18GarminAdversarialRawReport({
      manifest: adversarialManifest(identity),
      status: "passed",
      cases: adversarialCases(),
      native_report: {
        path: ADVERSARIAL_NATIVE_REPORT,
        sha256: digest(nativeBytes),
      },
      privacy_scan: {
        status: "passed",
        scanned_artifact_count: 4,
        report_sha256: digest(privacyBytes),
      },
    }));

    const result = withProcessState({
      cwd: root,
      env: {
        ANDROID_HOME: undefined,
        ANDROID_SDK_ROOT: sdkRoot,
      },
    }, () => executePhase18GarminAdversarialVerifier([
      "--manifest", ADVERSARIAL_MANIFEST,
      "--seal",
      "--phase20-native-checkpoint",
    ]));

    assert.deepEqual(result, {
      status: "passed",
      cases: 16,
      final_evidence_written: true,
    });
    const finalEvidence = JSON.parse(readFileSync(path.join(root, ADVERSARIAL_FINAL), "utf8"));
    assert.equal(finalEvidence.status, "passed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adversarial verifier current identity fails closed on missing SDK tools and installed identity drift", () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase18-adv-verifier-failures-"));
  try {
    setupSourceRepo(root);
    const apkBytes = Buffer.from("adversarial-apk");
    writeFile(root, ADVERSARIAL_APK, apkBytes);
    writeFile(root, ADVERSARIAL_NATIVE_REPORT, "native\n");
    writeFile(root, ADVERSARIAL_PRIVACY_REPORT, "privacy\n");
    const installedApkSource = writeFile(root, "artifacts/installed-adversarial.apk", apkBytes);

    const failureCases = [
      {
        code: /phase18_garmin_adversarial_evidence_android_sdk_missing/u,
        env: { ANDROID_HOME: undefined, ANDROID_SDK_ROOT: undefined },
      },
      {
        code: /phase18_garmin_adversarial_evidence_adb_missing/u,
        env: {
          ANDROID_HOME: undefined,
          ANDROID_SDK_ROOT: createFakeSdk(root, {
            adbScript: verifierAdbScript({ installedApkSource }),
            includeAdb: false,
            sdkName: "sdk-adb-missing",
          }),
        },
      },
      {
        code: /phase18_garmin_adversarial_evidence_apksigner_missing/u,
        env: {
          ANDROID_HOME: undefined,
          ANDROID_SDK_ROOT: createFakeSdk(root, {
            adbScript: verifierAdbScript({ installedApkSource }),
            includeApksigner: false,
            sdkName: "sdk-apksigner-missing",
          }),
        },
      },
      {
        code: /phase18_garmin_adversarial_evidence_apksigner_missing/u,
        env: {
          ANDROID_HOME: undefined,
          ANDROID_SDK_ROOT: path.join(root, "sdk-without-build-tools"),
        },
      },
      {
        code: /phase18_garmin_adversarial_evidence_signature_unreadable/u,
        env: {
          ANDROID_HOME: undefined,
          ANDROID_SDK_ROOT: createFakeSdk(root, {
            adbScript: verifierAdbScript({ installedApkSource }),
            apksignerOutput: "no digest here\n",
            sdkName: "sdk-signature-missing-capture",
          }),
        },
      },
      {
        code: /phase18_garmin_adversarial_evidence_signature_unreadable/u,
        env: {
          ANDROID_HOME: undefined,
          ANDROID_SDK_ROOT: createFakeSdk(root, {
            adbScript: verifierAdbScript({ installedApkSource }),
            apksignerOutput: `Signer #1 certificate SHA-256 digest: ${"b".repeat(65)}\n`,
            sdkName: "sdk-signature-invalid",
          }),
        },
      },
      {
        code: /phase18_garmin_adversarial_evidence_device_selection_invalid/u,
        env: {
          ANDROID_HOME: undefined,
          ANDROID_SDK_ROOT: createFakeSdk(root, {
            adbScript: verifierAdbScript({ installedApkSource, devices: "" }),
            sdkName: "sdk-device-selection-invalid",
          }),
        },
      },
      {
        code: /phase18_garmin_adversarial_evidence_installed_identity_invalid/u,
        env: {
          ANDROID_HOME: undefined,
          ANDROID_SDK_ROOT: createFakeSdk(root, {
            adbScript: verifierAdbScript({ installedApkSource, abi: "x86_64" }),
            sdkName: "sdk-installed-identity-invalid",
          }),
        },
      },
    ];

    for (const { code, env } of failureCases) {
      assert.throws(
        () => withProcessState({ cwd: root, env }, () => resolvePhase18GarminAdversarialCurrentIdentity()),
        code,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adversarial verifier hits unknown-argument and default report identity branches", () => {
  const current = {
    currentHead: "b".repeat(40),
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    installedApkSha256: HASH,
    retainedSignatureSha256: HASH,
    deviceIdentitySha256: HASH,
    nativeReportSha256: digest(Buffer.from("native")),
    privacyReportSha256: digest(Buffer.from("privacy")),
  };
  const exact = createPhase18GarminAdversarialRawReport({
    manifest: adversarialManifest(current),
    status: "passed",
    cases: adversarialCases(),
    native_report: {
      path: ADVERSARIAL_NATIVE_REPORT,
      sha256: digest(Buffer.from("native")),
    },
    privacy_scan: {
      status: "passed",
      scanned_artifact_count: 4,
      report_sha256: digest(Buffer.from("privacy")),
    },
  });
  assert.throws(
    () => executePhase18GarminAdversarialVerifier([
      "--manifest", ADVERSARIAL_MANIFEST,
      "--unexpected",
    ], {
      readJson: () => retainedBuildManifest(current, "phase18-garmin-adversarial"),
      resolveCurrentIdentity: () => current,
    }),
    /phase18_garmin_adversarial_evidence_arguments_invalid/u,
  );
  assert.deepEqual(executePhase18GarminAdversarialVerifier([
    "--manifest", ADVERSARIAL_MANIFEST,
  ], {
    readJson: (filePath) => filePath === ADVERSARIAL_MANIFEST
      ? retainedBuildManifest(current, "phase18-garmin-adversarial")
      : exact,
    readBytes: (filePath) => Buffer.from(
      filePath.endsWith("native-report.json") ? "native" : "privacy",
    ),
    resolveCurrentIdentity: () => current,
  }), {
    status: "passed",
    cases: 16,
    final_evidence_written: false,
  });
  assert.throws(
    () => executePhase18GarminAdversarialVerifier([
      "--manifest", ADVERSARIAL_MANIFEST,
    ], {
      readJson: (filePath) => {
        if (filePath === ADVERSARIAL_MANIFEST) {
          return retainedBuildManifest(current, "phase18-garmin-adversarial");
        }
        return {
          ...exact,
          manifest: { ...exact.manifest, package: "com.example.wrong" },
        };
      },
      readBytes: (filePath) => Buffer.from(
        filePath.endsWith("native-report.json") ? "native" : "privacy",
      ),
      resolveCurrentIdentity: () => current,
    }),
    /phase18_garmin_adversarial_evidence_report_identity_invalid/u,
  );
});
