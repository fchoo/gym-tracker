import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const HASH = "a".repeat(64);
const PACKAGE = "com.fchoo.gymtracker.devtest";
const ACCEPTANCE_MANIFEST = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`;
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
  const deviceIdentitySha256 = digest([
    deviceFacts.fingerprint,
    deviceFacts.abi,
    deviceFacts.model,
    deviceFacts.sdk,
    deviceFacts.release,
    "",
  ].join("\n"));
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
  const proofFileBytes = Buffer.from(`${JSON.stringify(
    syntheticOwner ? { manifest: validProof.manifest } : validProof,
    null,
    2,
  )}\n`);
  const adversarialFileBytes = Buffer.from(`${JSON.stringify(validAdversarial, null, 2)}\n`);
  writeFile(root, PROOF_FINAL_EVIDENCE, proofFileBytes);
  writeFile(root, "artifacts/native/phase18-garmin-adversarial/final-evidence.json", adversarialFileBytes);

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

  const sdkRoot = path.join(root, "fake-android-sdk");
  const platformTools = path.join(sdkRoot, "platform-tools");
  const buildTools = path.join(sdkRoot, "build-tools", "35.0.0");
  mkdirSync(platformTools, { recursive: true });
  mkdirSync(buildTools, { recursive: true });
  const installedApkPath = path.join(root, "installed.apk");
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
  const root = makeTempDir("phase18-adversarial-cli-");
  try {
    const manifest = { schema_version: 1, suite: "phase18-garmin-adversarial" };
    writeJson(root, ADVERSARIAL_MANIFEST, manifest);
    writeJson(root, ADVERSARIAL_RAW_REPORT, {
      manifest,
      native_report: { path: ADVERSARIAL_NATIVE_REPORT, sha256: "b".repeat(64) },
      privacy_scan: { status: "passed", scanned_artifact_count: 1, report_sha256: "c".repeat(64) },
    });
    writeFile(root, ADVERSARIAL_NATIVE_REPORT, "native-report");
    writeFile(root, ADVERSARIAL_PRIVACY_REPORT, "privacy-report");
    const result = runVerifier(adversarialScript, root, ["--manifest", ADVERSARIAL_MANIFEST]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /phase18_garmin_adversarial_evidence_report_identity_invalid/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
