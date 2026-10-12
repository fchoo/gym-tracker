import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
} from "../tests/fixtures/garmin-json/fixture-manifest.ts";
import {
  collectInstalledMeasurements,
  executePhase18GarminBenchmarkCli,
  resolvePhase18GarminBenchmarkCurrentIdentity,
  validatePhase18GarminBenchmarkEvidence,
} from "./benchmark-evidence-runner.mjs";
import {
  executePhase18GarminAcceptanceVerifier,
  executePhase18GarminAcceptanceVerifierCli,
  resolvePhase18GarminAcceptanceCurrentIdentity,
  validatePhase18GarminAcceptanceCurrentIdentity,
  validatePhase18GarminAcceptanceEvidence,
} from "./acceptance-verifier-evidence.mjs";
import {
  collectInstalledNativeReport,
  executePhase18GarminAdversarialRunnerCli,
} from "./adversarial-runner-evidence.mjs";
import {
  executePhase18GarminAdversarialVerifier,
  executePhase18GarminAdversarialVerifierCli,
  resolvePhase18GarminAdversarialCurrentIdentity,
  validatePhase18GarminAdversarialEvidence,
} from "./adversarial-verifier-evidence.mjs";
import {
  createPhase18GarminAcceptanceRunnerPlan,
  PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT,
} from "./run-phase18-garmin-acceptance.mjs";
import {
  createPhase18GarminAdversarialRunnerPlan,
} from "./run-phase18-garmin-adversarial.mjs";
import {
  classifyPhase18GarminProofRunnerFailure,
  createPhase18GarminProofRunnerPlan,
  executePhase18GarminProofRunner,
  executePhase18GarminProofRunnerCli,
} from "./run-phase18-garmin-proof.mjs";
import {
  PHASE18_LANGUAGE_COVERAGE_SPECS,
  loadPhase18LanguageCoverageReports,
  validatePhase18LanguageCoverageReport,
} from "./phase18-language-coverage.mjs";
import { sanitizePhase18BuildManifest } from "./phase18-build-manifest.mjs";
import {
  assertPhase18PrivacySafe,
} from "./privacy-scan-evidence.mjs";
import {
  createPhase18KotlinCoverageReport,
  executePhase18KotlinCoverage,
  executePhase18KotlinCoverageCli,
} from "./kotlin-coverage-evidence.mjs";
import {
  choose,
  cliArgValue,
  errorMessage,
  exactKeys,
  firstDefined,
  regexMatch,
  runCliIfMain,
} from "./node-evidence-utils.mjs";
import {
  createPhase18GarminProofFinalEvidence,
  executePhase18GarminProofVerifier,
  executePhase18GarminProofVerifierCli,
  resolvePhase18GarminProofCurrentIdentity,
  validatePhase18GarminProofEvidence,
} from "./proof-verifier-evidence.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import "./benchmark-phase18-garmin.mjs";
import "./run-phase18-kotlin-coverage.mjs";
import "./verify-phase18-garmin-acceptance.mjs";

const HASH = "a".repeat(64);
const HEAD = "b".repeat(40);
const PROOF_PATH = "artifacts/native/phase18-garmin-proof/final-evidence.json";
const ADVERSARIAL_PATH = "artifacts/native/phase18-garmin-adversarial/final-evidence.json";
const MAESTRO_SOURCE = "maestro/phase18/garmin-sync.yaml";
const MAESTRO_REPORT = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/maestro-report.json`;
const PRIVACY_REPORT = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/privacy-report.json`;

function captureCli(fn, argv, dependencies) {
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
    fn(dependencies);
  } finally {
    process.argv = originalArgv;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode;
  }
  return { stdout, stderr };
}

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
  const root = mkdtempSync(path.join(tmpdir(), "phase18-sdk-"));
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

function withWorkspaceFiles(files, callback) {
  const touched = [];
  try {
    for (const [relativePath, contents] of Object.entries(files)) {
      const absolutePath = path.resolve(relativePath);
      const previous = existsSync(absolutePath)
        ? readFileSync(absolutePath)
        : undefined;
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, contents);
      touched.push({ absolutePath, previous });
    }
    return callback();
  } finally {
    for (const { absolutePath, previous } of touched.reverse()) {
      if (previous === undefined) rmSync(absolutePath, { force: true });
      else writeFileSync(absolutePath, previous);
    }
  }
}

function acceptanceManifest(overrides = {}) {
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
    ...overrides,
  };
}

function retainedAcceptanceManifest(overrides = {}) {
  return {
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: HEAD,
    source_tree_sha256: HASH,
    package: "com.fchoo.gymtracker.devtest",
    apk: {
      path: `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-acceptance-devtest.apk`,
      sha256: HASH,
      page_alignment_verified: true,
    },
    installed_apk: { sha256: HASH, matches_retained_apk: true },
    device: { abi: "arm64-v8a", identity_sha256: HASH },
    ...overrides,
  };
}

function retainedAdversarialManifest(overrides = {}) {
  return {
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: HEAD,
    source_tree_sha256: HASH,
    package: "com.fchoo.gymtracker.devtest",
    apk: {
      path: "artifacts/native/phase18-garmin-adversarial/gym-tracker-phase18-garmin-adversarial-devtest.apk",
      sha256: HASH,
      page_alignment_verified: true,
    },
    installed_apk: { sha256: HASH, matches_retained_apk: true },
    device: { abi: "arm64-v8a", identity_sha256: HASH },
    ...overrides,
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

function proofManifest(overrides = {}) {
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

function proofEvidence(overrides = {}) {
  return {
    schema_version: 1,
    suite: "phase18-garmin-proof",
    status: "passed",
    manifest: proofManifest(),
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
    ...overrides,
  };
}

function repoHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

function repoPythonLockSha256() {
  return createHash("sha256")
    .update(readFileSync("modules/garmin-connect/python/garmin-python-lock.json"))
    .digest("hex");
}

function repoCurrentIdentity({ apkSha256, signatureSha256, deviceIdentitySha256 }) {
  return {
    currentHead: repoHead(),
    currentSourceTreeSha256: sourceTreeSha256(process.cwd()),
    currentPythonLockSha256: repoPythonLockSha256(),
    retainedApkSha256: apkSha256,
    installedApkSha256: apkSha256,
    retainedSignatureSha256: signatureSha256,
    deviceIdentitySha256,
    rawReportSha256: HASH,
  };
}

function retainedProofManifest(overrides = {}) {
  return {
    schema_version: 1,
    suite: "phase18-garmin-proof",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: HEAD,
    source_tree_sha256: HASH,
    package: "com.fchoo.gymtracker.devtest",
    apk: {
      path: "artifacts/native/phase18-garmin-proof/gym-tracker-phase18-garmin-proof-devtest.apk",
      sha256: HASH,
      page_alignment_verified: true,
    },
    installed_apk: { sha256: HASH, matches_retained_apk: true },
    device: { abi: "arm64-v8a", identity_sha256: HASH },
    ...overrides,
  };
}

function adversarialEvidence(current) {
  const plan = createPhase18GarminAdversarialRunnerPlan();
  const codes = [
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
  const calls = [1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 5, 3];
  const sessions = [
    "1".repeat(64),
    "2".repeat(64),
    "2".repeat(64),
    "3".repeat(64),
    "3".repeat(64),
    "3".repeat(64),
  ];
  return {
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    status: "passed",
    manifest: {
      schema_version: 1,
      suite: "phase18-garmin-adversarial",
      profile: "development-test",
      package: "com.fchoo.gymtracker.devtest",
      abi: "arm64-v8a",
      js_bundle_embedded: true,
      base_head: current.currentHead,
      source_tree_sha256: current.currentSourceTreeSha256,
      python_lock_sha256: current.currentPythonLockSha256,
      apk_sha256: current.retainedApkSha256,
      signature_sha256: current.retainedSignatureSha256,
      device_identity_sha256: current.deviceIdentitySha256,
    },
    case_ids: plan.case_ids,
    raw_report_sha256: current.rawReportSha256 ?? HASH,
    cases: plan.case_ids.map((id, index) => ({
      id,
      status: "passed",
      provenance: "native-exact-artifact",
      stage: id.toLowerCase().replaceAll("ph18-adv-", "").replaceAll("-", "_"),
      code: codes[index],
      duration_ms: 1,
      call_count: calls[index],
      automatic_retry_count: 0,
      retry_after_ms: id === "PH18-ADV-429" ? 900_000 : 0,
      source_write_count: index === 2 ? 3 : 0,
      connection_state: index === 3 || index === 5 ? "disconnected" : index === 4 ? "sign-in-required" : "connected",
      sync_state: index === 1 || index === 2
        ? "success"
        : index >= 6
          ? `${id === "PH18-ADV-PARTIAL-PAGE" ? "partial" : "failure"}-${codes[index].replaceAll("_", "-")}`
          : index === 5
            ? "failure-stale-generation"
            : "idle",
      session_digest: sessions[index] ?? "4".repeat(64),
      history_digest_before: (index <= 2 ? "5" : "8").repeat(64),
      history_digest_after: (index < 2 ? "5" : "8").repeat(64),
      source_digest_before: (index <= 2 ? "6" : "9").repeat(64),
      source_digest_after: (index < 2 ? "6" : "9").repeat(64),
      match_digest_before: "7".repeat(64),
      match_digest_after: "7".repeat(64),
      generation_before: index === 3 ? 7 : index === 4 ? 8 : index === 5 ? 20 : index >= 6 ? 30 : 7,
      generation_after: index === 3 ? 8 : index === 4 ? 8 : index === 5 ? 21 : index >= 6 ? 30 : 7,
    })),
    native_report: { path: "artifacts/native/phase18-garmin-adversarial/native-report.json", sha256: HASH },
    privacy_scan: { status: "passed", scanned_artifact_count: 4, report_sha256: HASH },
  };
}

function acceptanceEvidence({ nativeStatus = "deferred", status } = {}) {
  const plan = createPhase18GarminAcceptanceRunnerPlan();
  const cases = plan.cases.map((entry) => {
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
        artifact_sha256: HASH,
        proof_kind: "native-exact-artifact",
      }
      : {
        id: entry.id,
        status: "deferred",
        owner_plan: entry.ownerPlan,
        artifact: entry.artifact,
      };
  });
  const nativeVerified = cases.filter((entry) => entry.status === "verified").length;
  const nativeRequired = cases.filter((entry) => "owner_plan" in entry).length;
  return {
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    status: status ?? (nativeVerified === nativeRequired ? "passed" : "host-passed-native-deferred"),
    manifest: acceptanceManifest(),
    case_ids: plan.case_ids,
    cases,
    observations: {
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
    },
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

test("helper utilities cover defined and missing value branches", () => {
  assert.equal(exactKeys({ a: 1, b: 2 }, ["b", "a"]), true);
  assert.equal(exactKeys(["a"], ["0"]), false);
  assert.equal(regexMatch(/^ok$/u, "ok"), true);
  assert.equal(regexMatch(/^ok$/u, 42), false);
  assert.equal(cliArgValue(["--flag", "value"], 1), "value");
  assert.equal(cliArgValue(["--flag"], 1), "");
  assert.equal(choose("primary", "fallback"), "primary");
  assert.equal(choose(undefined, "fallback"), "fallback");
  assert.equal(firstDefined(undefined, undefined, "winner"), "winner");
  assert.equal(firstDefined(undefined, undefined), undefined);
  assert.equal(errorMessage(new Error("bounded")), "bounded");
  assert.equal(errorMessage("not-an-error", "fallback"), "fallback");
  let runs = 0;
  runCliIfMain("file:///tmp/phase18-helper.mjs", "/tmp/other.mjs", () => {
    runs += 1;
  });
  runCliIfMain("file:///tmp/phase18-helper.mjs", "/tmp/phase18-helper.mjs", () => {
    runs += 1;
  });
  assert.equal(runs, 1);
});

test("Kotlin helper default execution path writes the report from on-disk XML fixtures", () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), "phase18-kotlin-helper-"));
  const spec = PHASE18_LANGUAGE_COVERAGE_SPECS.kotlin;
  const suiteXml = `<testsuite tests="${spec.requiredCases.length}" skipped="0" failures="0" errors="0">${spec.requiredCases.map((name) => `<testcase name="${name}"/>`).join("")}</testsuite>`;
  const jacocoXml = '<report><counter type="LINE" missed="0" covered="10"/><counter type="BRANCH" missed="0" covered="10"/></report>';
  const calls = [];
  try {
    for (const sourcePath of [...spec.sourcePaths, spec.testPath]) {
      const absolutePath = path.join(projectRoot, sourcePath);
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, `${sourcePath}\n`);
    }
    mkdirSync(path.join(projectRoot, path.dirname("modules/garmin-connect/android/build/reports/jacoco/phase18-garmin-kotlin.xml")), { recursive: true });
    mkdirSync(path.join(projectRoot, path.dirname("modules/garmin-connect/android/build/test-results/testDebugUnitTest/TEST-expo.modules.garminconnect.GarminTokenStoreTest.xml")), { recursive: true });
    writeFileSync(path.join(projectRoot, "modules/garmin-connect/android/build/reports/jacoco/phase18-garmin-kotlin.xml"), jacocoXml);
    writeFileSync(path.join(projectRoot, "modules/garmin-connect/android/build/test-results/testDebugUnitTest/TEST-expo.modules.garminconnect.GarminTokenStoreTest.xml"), suiteXml);
    const report = executePhase18KotlinCoverage({
      projectRoot,
      execFileSync: (...args) => {
        calls.push(args);
        return Buffer.alloc(0);
      },
      env: { PHASE18: "yes" },
    });
    const saved = JSON.parse(readFileSync(path.join(projectRoot, spec.reportPath), "utf8"));
    assert.equal(report.status, "passed");
    assert.equal(saved.status, "passed");
    assert.equal(calls[0][0], path.join(projectRoot, "android/gradlew"));
    assert.deepEqual(calls[0][1], ["--no-daemon", "-p", "android", ":garmin-connect:phase18GarminKotlinCoverageReport"]);
    assert.equal(calls[0][2].cwd, projectRoot);
    assert.equal(calls[0][2].env.PHASE18, "yes");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("Kotlin helper writes no report when the local Gradle wrapper is unavailable", () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), "phase18-kotlin-fallback-"));
  const spec = PHASE18_LANGUAGE_COVERAGE_SPECS.kotlin;
  try {
    for (const sourcePath of [...spec.sourcePaths, spec.testPath]) {
      const absolutePath = path.join(projectRoot, sourcePath);
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, `${sourcePath}\n`);
    }
    assert.throws(
      () => executePhase18KotlinCoverage({ projectRoot }),
      /ENOENT|gradlew/u,
    );
    assert.equal(existsSync(path.join(projectRoot, spec.reportPath)), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("Kotlin helper fails closed for missing cases and CLI errors", () => {
  const spec = PHASE18_LANGUAGE_COVERAGE_SPECS.kotlin;
  const report = createPhase18KotlinCoverageReport({
    jacocoXml: '<report><counter type="LINE" missed="0" covered="10"/><counter type="BRANCH" missed="0" covered="10"/></report>',
    junitXml: `<testsuite tests="${spec.requiredCases.length}" skipped="1" failures="0" errors="0"><testcase name="${spec.requiredCases[0]}"/></testsuite>`,
    readBytes: () => Buffer.from("x"),
  });
  assert.equal(report.status, "failed");

  const success = captureCli(executePhase18KotlinCoverageCli, [
    "node",
    "scripts/run-phase18-kotlin-coverage.mjs",
  ], {
    runGradle: () => {},
    readText: (relativePath) => relativePath.includes("jacoco")
      ? '<report><counter type="LINE" missed="0" covered="10"/><counter type="BRANCH" missed="0" covered="10"/></report>'
      : `<testsuite tests="${spec.requiredCases.length}" skipped="0" failures="0" errors="0">${spec.requiredCases.map((name) => `<testcase name="${name}"/>`).join("")}</testsuite>`,
    readBytes: (relativePath) => Buffer.from(relativePath),
    writeReport: () => {},
  });
  assert.match(success.stdout, /"status":"passed"/u);

  const failure = captureCli(executePhase18KotlinCoverageCli, [
    "node",
    "scripts/run-phase18-kotlin-coverage.mjs",
  ], {
    runGradle: () => {
      throw "not-an-error";
    },
    fileExists: () => false,
  });
  assert.match(failure.stderr, /phase18_kotlin_coverage_failed/u);

  let falsyFailure = "not-thrown";
  try {
    executePhase18KotlinCoverage({
      runGradle: () => {
        throw null;
      },
      fileExists: () => false,
    });
  } catch (error) {
    falsyFailure = error;
  }
  assert.equal(falsyFailure, null);

  assert.throws(
    () => executePhase18KotlinCoverage({
      runGradle: () => {
        throw new Error("spawn ENOENT");
      },
      readBytes: (relativePath) => Buffer.from(relativePath),
      writeReport: () => {
        throw new Error("should not write");
      },
    }),
    /spawn ENOENT/u,
  );
});

test("acceptance helper rejects status drift and honors explicit owner current identity overrides", () => {
  assert.throws(
    () => validatePhase18GarminAcceptanceEvidence({}),
    /phase18_acceptance_evidence_schema_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminAcceptanceEvidence({
      ...acceptanceEvidence(),
      native_flow: {
        path: "wrong",
        source_sha256: HASH,
        report_sha256: HASH,
      },
    }),
    /phase18_acceptance_evidence_native_flow_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminAcceptanceEvidence({
      ...acceptanceEvidence(),
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
      ...acceptanceEvidence(),
      cases: acceptanceEvidence().cases.map((entry, index) => index === 0
        ? { ...entry, semantic_state: undefined }
        : entry),
    }),
    /phase18_acceptance_evidence_host_case_invalid/u,
  );
  assert.deepEqual(validatePhase18GarminAcceptanceEvidence(acceptanceEvidence()), {
    status: "host-passed-native-deferred",
    host_cases: 17,
    native_prerequisites: 2,
  });
  assert.throws(
    () => validatePhase18GarminAcceptanceEvidence(acceptanceEvidence({
      nativeStatus: "verified",
      status: "host-passed-native-deferred",
    })),
    /phase18_acceptance_evidence_status_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminAcceptanceEvidence(acceptanceEvidence({
      nativeStatus: "deferred",
      status: "passed",
    })),
    /phase18_acceptance_evidence_status_invalid/u,
  );

  const current = {
    currentHead: HEAD,
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    installedApkSha256: HASH,
    retainedSignatureSha256: HASH,
    deviceIdentitySha256: HASH,
  };
  const proof = proofEvidence();
  const adversarial = adversarialEvidence(current);
  const maestroBytes = Buffer.from("maestro-source");
  const maestroReportBytes = Buffer.from("maestro-report");
  const privacyBytes = Buffer.from("privacy");
  const proofBytes = Buffer.from(JSON.stringify(proof));
  const adversarialBytes = Buffer.from(JSON.stringify(adversarial));
  const bytes = new Map([
    [MAESTRO_SOURCE, maestroBytes],
    [MAESTRO_REPORT, maestroReportBytes],
    [PRIVACY_REPORT, privacyBytes],
    [PROOF_PATH, proofBytes],
    [ADVERSARIAL_PATH, adversarialBytes],
  ]);
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  const evidence = acceptanceEvidence({ nativeStatus: "verified" });
  evidence.cases = evidence.cases.map((entry) => entry.artifact === PROOF_PATH
    ? { ...entry, artifact_sha256: digest(proofBytes) }
    : entry.artifact === ADVERSARIAL_PATH
      ? { ...entry, artifact_sha256: digest(adversarialBytes) }
      : entry);
  evidence.native_flow = {
    path: MAESTRO_SOURCE,
    source_sha256: digest(maestroBytes),
    report_sha256: digest(maestroReportBytes),
  };
  evidence.privacy_scan = {
    status: "passed",
    scanned_artifact_count: 4,
    report_sha256: digest(privacyBytes),
  };
  assert.deepEqual(executePhase18GarminAcceptanceVerifier([
    "--manifest",
    `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`,
  ], {
    resolveCurrentIdentity: () => current,
    readBytes: (artifactPath) => bytes.get(artifactPath),
    readJson: (artifactPath) => {
      if (artifactPath === `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`) return retainedAcceptanceManifest();
      if (artifactPath.endsWith("raw-report.json")) return evidence;
      if (artifactPath === MAESTRO_REPORT) return { status: "passed", observations: evidence.observations };
      if (artifactPath === PRIVACY_REPORT) return { status: "passed", scanned_artifact_count: 4 };
      if (artifactPath === PROOF_PATH) return proof;
      if (artifactPath === ADVERSARIAL_PATH) return adversarial;
      throw new Error(`unexpected path:${artifactPath}`);
    },
    verifyOwnerArtifact: () => {},
    ownerCurrentIdentity: {
      [PROOF_PATH]: {
        ...current,
        retainedApkSha256: proof.manifest.apk_sha256,
        installedApkSha256: proof.manifest.apk_sha256,
        rawReportSha256: proof.raw_report_sha256,
      },
      [ADVERSARIAL_PATH]: {
        ...current,
        retainedApkSha256: adversarial.manifest.apk_sha256,
        installedApkSha256: adversarial.manifest.apk_sha256,
        rawReportSha256: adversarial.raw_report_sha256,
        nativeReportSha256: adversarial.native_report.sha256,
        privacyReportSha256: adversarial.privacy_scan.report_sha256,
      },
    },
  }), {
    status: "passed",
    host_cases: 17,
    native_prerequisites: 2,
  });
  assert.throws(
    () => executePhase18GarminAcceptanceVerifier([
      "--manifest",
      `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`,
    ], {
      resolveCurrentIdentity: () => current,
      readBytes: (artifactPath) => bytes.get(artifactPath),
      readJson: (artifactPath) => {
        if (artifactPath === `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`) return retainedAcceptanceManifest();
        if (artifactPath.endsWith("raw-report.json")) return evidence;
        if (artifactPath === MAESTRO_REPORT) return { status: "passed", observations: evidence.observations };
        if (artifactPath === PRIVACY_REPORT) return { status: "passed", scanned_artifact_count: 4 };
        if (artifactPath === PROOF_PATH) return { ...proof, manifest: { ...proof.manifest, package: "com.example.wrong" } };
        if (artifactPath === ADVERSARIAL_PATH) return adversarial;
        throw new Error(`unexpected path:${artifactPath}`);
      },
      verifyOwnerArtifact: () => {},
      ownerCurrentIdentity: {
        [PROOF_PATH]: {
          ...current,
          retainedApkSha256: proof.manifest.apk_sha256,
          installedApkSha256: proof.manifest.apk_sha256,
          rawReportSha256: proof.raw_report_sha256,
        },
        [ADVERSARIAL_PATH]: {
          ...current,
          retainedApkSha256: adversarial.manifest.apk_sha256,
          installedApkSha256: adversarial.manifest.apk_sha256,
          rawReportSha256: adversarial.raw_report_sha256,
          nativeReportSha256: adversarial.native_report.sha256,
          privacyReportSha256: adversarial.privacy_scan.report_sha256,
        },
      },
    }),
    /phase18_manifest_invalid/u,
  );
});

test("acceptance helper covers direct validator and argument rejection branches", () => {
  const deferredEvidence = acceptanceEvidence();
  assert.throws(
    () => validatePhase18GarminAcceptanceEvidence({
      ...deferredEvidence,
      case_ids: [...deferredEvidence.case_ids].reverse(),
    }),
    /phase18_acceptance_evidence_case_order_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminAcceptanceEvidence({
      ...deferredEvidence,
      observations: {
        ...deferredEvidence.observations,
        process_restart: false,
      },
    }),
    /phase18_acceptance_evidence_observations_invalid/u,
  );
  const verifiedEvidence = acceptanceEvidence({ nativeStatus: "verified", status: "passed" });
  assert.throws(
    () => validatePhase18GarminAcceptanceEvidence({
      ...verifiedEvidence,
      cases: verifiedEvidence.cases.map((entry) => entry.status === "verified"
        ? { ...entry, proof_kind: "wrong-proof-kind" }
        : entry),
    }),
    /phase18_acceptance_evidence_native_case_invalid/u,
  );
  assert.throws(
    () => executePhase18GarminAcceptanceVerifier([], {
      resolveCurrentIdentity: () => ({
        currentHead: HEAD,
        currentSourceTreeSha256: HASH,
        currentPythonLockSha256: HASH,
        retainedApkSha256: HASH,
        installedApkSha256: HASH,
        retainedSignatureSha256: HASH,
        deviceIdentitySha256: HASH,
      }),
    }),
    /phase18_acceptance_evidence_arguments_invalid/u,
  );
  assert.throws(
    () => resolvePhase18GarminAcceptanceCurrentIdentity(),
    /phase18_acceptance_evidence_android_sdk_missing/u,
  );
  assert.throws(
    () => validatePhase18GarminAcceptanceCurrentIdentity(verifiedEvidence, {
      currentHead: HEAD,
      currentSourceTreeSha256: HASH,
      currentPythonLockSha256: HASH,
      retainedApkSha256: HASH,
      installedApkSha256: HASH,
      retainedSignatureSha256: HASH,
      deviceIdentitySha256: HASH,
      nativeFlowSourceSha256: HASH,
      nativeFlowReportSha256: HASH,
      privacyReportSha256: "b".repeat(64),
    }),
    /phase18_acceptance_evidence_current_identity_invalid/u,
  );
});

test("acceptance verifier uses on-disk JSON and default owner verifiers without device execution", () => {
  withWorkspaceFiles({ [MAESTRO_SOURCE]: "maestro-source\n" }, () => {
    const apkBytes = Buffer.from("phase18-acceptance-owner-apk");
    const apkSha256 = createHash("sha256").update(apkBytes).digest("hex");
    const signatureSha256 = "a".repeat(64);
    const deviceIdentitySha256 = createHash("sha256").update(JSON.stringify({
      serial: "SERIAL123",
      abi: "arm64-v8a",
      apiLevel: "35",
      model: "Pixel 9",
    })).digest("hex");
    const current = repoCurrentIdentity({ apkSha256, signatureSha256, deviceIdentitySha256 });
    const proofFlatManifest = proofManifest({
      base_head: current.currentHead,
      source_tree_sha256: current.currentSourceTreeSha256,
      python_lock_sha256: current.currentPythonLockSha256,
      apk_sha256: apkSha256,
      signature_sha256: signatureSha256,
      device_identity_sha256: deviceIdentitySha256,
    });
    const proofRawReport = {
      schema_version: 1,
      suite: "phase18-garmin-proof",
      status: "passed",
      manifest: proofFlatManifest,
      cases: createPhase18GarminProofRunnerPlan().case_ids.map(proofPassedCase),
      standalone: proofEvidence().standalone,
      privacy_scan: {
        status: "passed",
        scanned_artifact_count: 2,
        report_sha256: HASH,
      },
    };
    const proofRawReportBytes = Buffer.from(JSON.stringify(proofRawReport));
    const proofFinalEvidence = createPhase18GarminProofFinalEvidence({
      manifest: proofFlatManifest,
      report: proofRawReport,
      rawReportBytes: proofRawReportBytes,
    });
    const nativeReportBytes = Buffer.from('{"status":"passed"}\n');
    const adversarialPrivacyBytes = Buffer.from('{"status":"passed","scanned_artifact_count":4}\n');
    const adversarialFinalBase = adversarialEvidence({
      currentHead: current.currentHead,
      currentSourceTreeSha256: current.currentSourceTreeSha256,
      currentPythonLockSha256: current.currentPythonLockSha256,
      retainedApkSha256: apkSha256,
      retainedSignatureSha256: signatureSha256,
      deviceIdentitySha256,
      installedApkSha256: apkSha256,
      nativeReportSha256: HASH,
      privacyReportSha256: HASH,
    });
    const { raw_report_sha256: ignoredRawHash, ...adversarialRawReport } = structuredClone(
      adversarialFinalBase,
    );
    assert.match(ignoredRawHash, /^[a-f0-9]{64}$/u);
    adversarialRawReport.native_report.sha256 = createHash("sha256").update(nativeReportBytes).digest("hex");
    adversarialRawReport.privacy_scan.report_sha256 = createHash("sha256").update(adversarialPrivacyBytes).digest("hex");
    const adversarialRawReportBytes = Buffer.from(`${JSON.stringify(adversarialRawReport, null, 2)}\n`);
    const adversarialFinalEvidence = {
      ...adversarialRawReport,
      raw_report_sha256: createHash("sha256").update(adversarialRawReportBytes).digest("hex"),
    };
    const proofBytes = Buffer.from(JSON.stringify(proofFinalEvidence, null, 2));
    const adversarialBytes = Buffer.from(JSON.stringify(adversarialFinalEvidence, null, 2));
    const maestroSourceBytes = Buffer.from("maestro-source\n");
    const maestroReportBytes = Buffer.from(JSON.stringify({
      status: "passed",
      observations: acceptanceEvidence().observations,
    }, null, 2));
    const acceptancePrivacyBytes = Buffer.from(JSON.stringify({
      status: "passed",
      scanned_artifact_count: 4,
    }, null, 2));
    const proofRawSha256 = createHash("sha256").update(proofRawReportBytes).digest("hex");
    const proofArtifactSha256 = createHash("sha256").update(proofBytes).digest("hex");
    const adversarialArtifactSha256 = createHash("sha256").update(adversarialBytes).digest("hex");
    const retainedAcceptance = retainedAcceptanceManifest({
      base_head: current.currentHead,
      source_tree_sha256: current.currentSourceTreeSha256,
      apk: {
        path: `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-acceptance-devtest.apk`,
        sha256: apkSha256,
        page_alignment_verified: true,
      },
      installed_apk: { sha256: apkSha256, matches_retained_apk: true },
      device: { abi: "arm64-v8a", identity_sha256: deviceIdentitySha256 },
    });
    const acceptanceReport = acceptanceEvidence({ nativeStatus: "verified", status: "passed" });
    acceptanceReport.manifest = sanitizePhase18BuildManifest(retainedAcceptance, {
      suite: "phase18-garmin-acceptance",
      pythonLockSha256: current.currentPythonLockSha256,
      signatureSha256,
    });
    acceptanceReport.native_flow = {
      path: MAESTRO_SOURCE,
      source_sha256: createHash("sha256").update(maestroSourceBytes).digest("hex"),
      report_sha256: createHash("sha256").update(maestroReportBytes).digest("hex"),
    };
    acceptanceReport.privacy_scan = {
      status: "passed",
      scanned_artifact_count: 4,
      report_sha256: createHash("sha256").update(acceptancePrivacyBytes).digest("hex"),
    };
    acceptanceReport.cases = acceptanceReport.cases.map((entry) => entry.artifact === PROOF_PATH
      ? { ...entry, artifact_sha256: proofArtifactSha256 }
      : entry.artifact === ADVERSARIAL_PATH
        ? { ...entry, artifact_sha256: adversarialArtifactSha256 }
        : entry);
    const jsonByPath = new Map([
      [`${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`, retainedAcceptance],
      [`${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/raw-report.json`, acceptanceReport],
      ["artifacts/native/phase18-garmin-proof/build.json", retainedProofManifest({
        base_head: current.currentHead,
        source_tree_sha256: current.currentSourceTreeSha256,
        apk: {
          path: "artifacts/native/phase18-garmin-proof/gym-tracker-phase18-garmin-proof-devtest.apk",
          sha256: apkSha256,
          page_alignment_verified: true,
        },
        installed_apk: { sha256: apkSha256, matches_retained_apk: true },
        device: { abi: "arm64-v8a", identity_sha256: deviceIdentitySha256 },
      })],
      ["artifacts/native/phase18-garmin-proof/raw-report.json", proofRawReport],
      ["artifacts/native/phase18-garmin-proof/final-evidence.json", proofFinalEvidence],
      ["artifacts/native/phase18-garmin-adversarial/build.json", retainedAdversarialManifest({
        base_head: current.currentHead,
        source_tree_sha256: current.currentSourceTreeSha256,
        apk: {
          path: "artifacts/native/phase18-garmin-adversarial/gym-tracker-phase18-garmin-adversarial-devtest.apk",
          sha256: apkSha256,
          page_alignment_verified: true,
        },
        installed_apk: { sha256: apkSha256, matches_retained_apk: true },
        device: { abi: "arm64-v8a", identity_sha256: deviceIdentitySha256 },
      })],
      ["artifacts/native/phase18-garmin-adversarial/raw-report.json", adversarialRawReport],
      ["artifacts/native/phase18-garmin-adversarial/final-evidence.json", adversarialFinalEvidence],
      [MAESTRO_REPORT, JSON.parse(maestroReportBytes.toString("utf8"))],
      [PRIVACY_REPORT, JSON.parse(acceptancePrivacyBytes.toString("utf8"))],
    ]);

    withWorkspaceFiles({
      [`${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`]: `${JSON.stringify(retainedAcceptance, null, 2)}\n`,
      [`${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/raw-report.json`]: `${JSON.stringify(acceptanceReport, null, 2)}\n`,
      [`${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-acceptance-devtest.apk`]: apkBytes,
      [MAESTRO_REPORT]: maestroReportBytes,
      [PRIVACY_REPORT]: acceptancePrivacyBytes,
      ["artifacts/native/phase18-garmin-proof/build.json"]: `${JSON.stringify(jsonByPath.get("artifacts/native/phase18-garmin-proof/build.json"), null, 2)}\n`,
      ["artifacts/native/phase18-garmin-proof/raw-report.json"]: proofRawReportBytes,
      ["artifacts/native/phase18-garmin-proof/final-evidence.json"]: proofBytes,
      ["artifacts/native/phase18-garmin-proof/gym-tracker-phase18-garmin-proof-devtest.apk"]: apkBytes,
      ["artifacts/native/phase18-garmin-adversarial/build.json"]: `${JSON.stringify(jsonByPath.get("artifacts/native/phase18-garmin-adversarial/build.json"), null, 2)}\n`,
      ["artifacts/native/phase18-garmin-adversarial/raw-report.json"]: adversarialRawReportBytes,
      ["artifacts/native/phase18-garmin-adversarial/final-evidence.json"]: adversarialBytes,
      ["artifacts/native/phase18-garmin-adversarial/gym-tracker-phase18-garmin-adversarial-devtest.apk"]: apkBytes,
      ["artifacts/native/phase18-garmin-adversarial/native-report.json"]: nativeReportBytes,
      ["artifacts/native/phase18-garmin-adversarial/privacy-report.json"]: adversarialPrivacyBytes,
    }, () => withFakeSdk({
    adbScript: `#!/bin/sh
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\nSERIAL123\\tdevice\\n'
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "getprop" ]; then
  case "$5" in
    ro.product.cpu.abi) printf 'arm64-v8a\\n' ;;
    ro.build.version.sdk) printf '35\\n' ;;
    ro.product.model) printf 'Pixel 9\\n' ;;
  esac
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "pm" ] && [ "$5" = "path" ]; then
  printf 'package:/data/app/com.fchoo.gymtracker.devtest/base.apk\\n'
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "pull" ]; then
  cp "$PHASE18_INSTALLED_APK" "$5"
  exit 0
fi
exit 1
`,
    apksignerScript: "#!/bin/sh\nprintf 'certificate SHA-256 digest: aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa\\n'\n",
  }, () => withEnv({
    PHASE18_INSTALLED_APK: path.resolve(`${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-acceptance-devtest.apk`),
  }, () => {
    assert.deepEqual(executePhase18GarminAcceptanceVerifier([
      "--manifest",
      `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`,
    ], {
	      readJson: (filePath) => {
	        const value = jsonByPath.get(filePath);
	        return value === undefined ? JSON.parse(readFileSync(filePath, "utf8")) : value;
	      },
      resolveCurrentIdentity: () => current,
    }), {
      status: "passed",
      host_cases: 17,
      native_prerequisites: 2,
    });

    assert.equal(
      executePhase18GarminProofVerifier(["--manifest", "artifacts/native/phase18-garmin-proof/build.json"]).status,
      "passed",
    );
    assert.equal(
      executePhase18GarminAdversarialVerifier(["--manifest", "artifacts/native/phase18-garmin-adversarial/build.json"]).status,
      "passed",
    );
    assert.equal(proofFinalEvidence.raw_report_sha256, proofRawSha256);
    })));
  });
});

test("proof helper rejects review case-count and failure classification drift", () => {
  const review = proofEvidence({
    status: "TECHNICAL_REVIEW_REQUIRED",
    cases: [
      proofPassedCase("PH18-PKG"),
      {
        id: "PH18-LOGIN",
        status: "TECHNICAL_REVIEW_REQUIRED",
        duration_ms: 0,
        code: "sign_in_required",
      },
    ],
    failure_stage: "PH18-LOGIN",
    failure_code: "sign_in_required",
  });
  assert.deepEqual(validatePhase18GarminProofEvidence(review), {
    status: "TECHNICAL_REVIEW_REQUIRED",
    cases: 2,
    stage: "PH18-LOGIN",
    code: "sign_in_required",
  });
  assert.throws(
    () => validatePhase18GarminProofEvidence({ ...review, cases: [] }),
    /phase18_evidence_case_count_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminProofEvidence({
      ...review,
      cases: [
        ...createPhase18GarminProofRunnerPlan().case_ids.map(proofPassedCase),
        {
          id: "PH18-PRIVACY",
          status: "TECHNICAL_REVIEW_REQUIRED",
          duration_ms: 0,
          code: "privacy_scan_failed",
        },
      ],
    }),
    /phase18_evidence_case_count_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminProofEvidence({
      ...review,
      failure_stage: "PH18-MFA",
    }),
    /phase18_evidence_failure_classification_invalid/u,
  );
  const rawReportBytes = Buffer.from(JSON.stringify({
    schema_version: 1,
    suite: "phase18-garmin-proof",
    status: "passed",
    manifest: proofManifest(),
    cases: createPhase18GarminProofRunnerPlan().case_ids.map(proofPassedCase),
    standalone: proofEvidence().standalone,
    privacy_scan: proofEvidence().privacy_scan,
  }));
  const finalEvidence = createPhase18GarminProofFinalEvidence({
    manifest: proofManifest(),
    report: JSON.parse(rawReportBytes.toString("utf8")),
    rawReportBytes,
  });
  assert.equal(finalEvidence.raw_report_sha256, createHash("sha256").update(rawReportBytes).digest("hex"));
});

test("default identity helpers also cover successful installed evidence collection", () => {
  const benchmarkApk = "artifacts/native/phase18-garmin-acceptance/gym-tracker-phase18-garmin-acceptance-devtest.apk";
  const acceptanceApk = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-acceptance-devtest.apk`;
  const adversarialApk = "artifacts/native/phase18-garmin-adversarial/gym-tracker-phase18-garmin-adversarial-devtest.apk";
  const proofApk = "artifacts/native/phase18-garmin-proof/gym-tracker-phase18-garmin-proof-devtest.apk";
  const nativeReport = "artifacts/native/phase18-garmin-adversarial/native-report.json";
  const privacyReport = "artifacts/native/phase18-garmin-adversarial/privacy-report.json";
  const installedRoot = mkdtempSync(path.join(tmpdir(), "phase18-installed-apk-"));
  const installedApk = path.join(installedRoot, "installed.apk");
  const installedBytes = Buffer.from("installed-apk");
  const sha = (value) => createHash("sha256").update(value).digest("hex");

  writeFileSync(installedApk, installedBytes);
  try {
    withWorkspaceFiles({
      [benchmarkApk]: installedBytes,
      [acceptanceApk]: installedBytes,
      [adversarialApk]: installedBytes,
      [proofApk]: installedBytes,
      [MAESTRO_SOURCE]: "maestro-source\n",
      [nativeReport]: '{"status":"passed"}\n',
      [privacyReport]: '{"status":"passed"}\n',
    }, () => withFakeSdk({
      adbScript: `#!/bin/sh
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\nSERIAL123\\tdevice\\n'
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "getprop" ]; then
  case "$5" in
    ro.product.cpu.abi) printf 'arm64-v8a\\n' ;;
    ro.build.version.sdk) printf '35\\n' ;;
    ro.product.model) printf 'Pixel 9\\n' ;;
  esac
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "pm" ] && [ "$5" = "path" ]; then
  printf 'package:/data/app/com.fchoo.gymtracker.devtest/base.apk\\n'
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "pull" ]; then
  cp "$PHASE18_INSTALLED_APK" "$5"
  exit 0
fi
printf 'unexpected adb args: %s\\n' "$*" >&2
exit 1
`,
      apksignerScript: "#!/bin/sh\nprintf 'certificate SHA-256 digest: aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa\\n'\n",
    }, () => withEnv({ PHASE18_INSTALLED_APK: installedApk }, () => {
      const benchmarkIdentity = resolvePhase18GarminBenchmarkCurrentIdentity();
      if (!readFileSync(path.resolve(acceptanceApk))) {
        throw new Error("acceptance_apk_fixture_missing");
      }
      const acceptanceIdentity = resolvePhase18GarminAcceptanceCurrentIdentity();
      const adversarialIdentity = resolvePhase18GarminAdversarialCurrentIdentity(Buffer.from("raw-report"));
      const rawReportBytes = Buffer.from('{"status":"passed"}');
      const proofIdentity = resolvePhase18GarminProofCurrentIdentity(rawReportBytes);

      assert.equal(benchmarkIdentity.package, "com.fchoo.gymtracker.devtest");
      assert.equal(benchmarkIdentity.abi, "arm64-v8a");
      assert.equal(benchmarkIdentity.signature_sha256, "a".repeat(64));
      assert.equal(acceptanceIdentity.installedApkSha256, sha(installedBytes));
      assert.equal(acceptanceIdentity.retainedSignatureSha256, "a".repeat(64));
      assert.equal(adversarialIdentity.installedApkSha256, sha(installedBytes));
      assert.equal(adversarialIdentity.nativeReportSha256, sha(Buffer.from('{"status":"passed"}\n')));
      assert.equal(adversarialIdentity.privacyReportSha256, sha(Buffer.from('{"status":"passed"}\n')));
      assert.equal(proofIdentity.installedApkSha256, sha(installedBytes));
      assert.equal(proofIdentity.rawReportSha256, sha(rawReportBytes));
    })));
  } finally {
    rmSync(installedRoot, { recursive: true, force: true });
  }
});

test("adversarial runner default IO paths and native collector stay bounded", () => {
  const manifestPath = "artifacts/native/phase18-garmin-adversarial/build.json";
  const rawReportPath = "artifacts/native/phase18-garmin-adversarial/raw-report.json";
  const nativeReportPath = "artifacts/native/phase18-garmin-adversarial/native-report.json";
  const privacyReportPath = "artifacts/native/phase18-garmin-adversarial/privacy-report.json";
  const current = {
    currentHead: HEAD,
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    retainedSignatureSha256: HASH,
    deviceIdentitySha256: HASH,
  };
  const exactCases = adversarialEvidence({
    ...current,
    installedApkSha256: HASH,
    nativeReportSha256: HASH,
    privacyReportSha256: HASH,
  }).cases;
  const collectedReport = {
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    status: "passed",
    cases: exactCases,
    current_identity: current,
  };

  withWorkspaceFiles({ [manifestPath]: `${JSON.stringify(retainedAdversarialManifest(), null, 2)}\n` }, () => {
    rmSync(path.resolve(rawReportPath), { force: true });
    rmSync(path.resolve(nativeReportPath), { force: true });
    rmSync(path.resolve(privacyReportPath), { force: true });
    const result = executePhase18GarminAdversarialRunnerCli;
    assert.deepEqual(captureCli(result, [
      "node",
      "scripts/run-phase18-garmin-adversarial.mjs",
      "--manifest",
      manifestPath,
      "--record",
      "artifacts/native/phase18-garmin-adversarial/native-record.json",
      "--execute",
      "--phase20-native-checkpoint",
    ], {
      collectNativeReport: () => ({
        report: collectedReport,
        logcat: "bounded native result markers only",
      }),
    }).stdout.includes("\"status\":\"passed\""), true);
    assert.equal(JSON.parse(readFileSync(path.resolve(rawReportPath), "utf8")).status, "passed");
    assert.equal(JSON.parse(readFileSync(path.resolve(nativeReportPath), "utf8")).status, "passed");
    assert.equal(JSON.parse(readFileSync(path.resolve(privacyReportPath), "utf8")).status, "passed");
    rmSync(path.resolve(rawReportPath), { force: true });
    rmSync(path.resolve(nativeReportPath), { force: true });
    rmSync(path.resolve(privacyReportPath), { force: true });
  });

  const invalidRecord = captureCli(executePhase18GarminAdversarialRunnerCli, [
    "node",
    "scripts/run-phase18-garmin-adversarial.mjs",
    "--manifest",
    manifestPath,
    "--record",
    "artifacts/native/phase18-garmin-adversarial/native-record.json",
    "--execute",
    "--phase20-native-checkpoint",
  ], {
    readJson: () => retainedAdversarialManifest(),
    collectNativeReport: () => ({
      report: { ...collectedReport, cases: collectedReport.cases.slice(1) },
      logcat: "bounded native result markers only",
    }),
    writeNativeReport: () => {},
    writePrivacyReport: () => {},
    writeRawReport: () => {},
  });
  assert.match(invalidRecord.stderr, /phase18_garmin_adversarial_record_invalid/u);

  const originalPath = process.env.PATH;
  const root = mkdtempSync(path.join(tmpdir(), "phase18-adv-collector-"));
  try {
    const adbPath = path.join(root, "adb");
    const noncePath = path.join(root, "nonce");
    const hostDeviceIdentitySha256 = createHash("sha256").update(JSON.stringify({
      serial: "SERIAL",
      abi: "arm64-v8a",
      apiLevel: "36",
      model: "Phase 18 Device",
    })).digest("hex");
    const collectedWithNonce = {
      ...collectedReport,
      current_identity: {
        ...collectedReport.current_identity,
        deviceIdentitySha256: hostDeviceIdentitySha256,
      },
      run_nonce: "__NONCE__",
    };
    writeFileSync(adbPath, `#!/bin/sh
set -eu
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\nSERIAL\tdevice\n'
  exit 0
fi
if [ "$1" = "-s" ]; then shift 2; fi
if [ "$1" = "shell" ] && [ "$2" = "getprop" ]; then
  case "$3" in
    ro.product.cpu.abi) printf 'arm64-v8a\n' ;;
    ro.build.version.sdk) printf '36\n' ;;
    ro.product.model) printf 'Phase 18 Device\n' ;;
    *) exit 1 ;;
  esac
  exit 0
fi
if [ "$1" = "logcat" ] && [ "$2" = "-c" ]; then exit 0; fi
if [ "$1" = "shell" ] && [ "$2" = "am" ] && [ "$3" = "start" ]; then
  for argument in "$@"; do
    case "$argument" in
      *nonce=*)
        value="\${argument##*nonce=}"
        printf '%s' "\${value%%&*}" > "${noncePath}"
        ;;
    esac
  done
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "am" ]; then exit 0; fi
if [ "$1" = "shell" ] && [ "$2" = "pidof" ]; then printf '4242\n'; exit 0; fi
if [ "$1" = "logcat" ] && [ "$2" = "--pid" ] && [ "$4" = "-d" ]; then
  nonce=$(cat "${noncePath}")
  payload=$(printf '%s' '${JSON.stringify(collectedWithNonce)}' | sed "s/__NONCE__/$nonce/")
  printf 'GYM_TRACKER_PHASE18_GARMIN_ADVERSARIAL_REPORT:%s\\n' "$payload"
  exit 0
fi
exit 0
`);
    chmodSync(adbPath, 0o755);
    process.env.PATH = `${root}:${originalPath ?? ""}`;
    const collected = collectInstalledNativeReport();
    assert.equal(collected.report.status, "passed");
    assert.match(collected.logcat, /GYM_TRACKER_PHASE18_GARMIN_ADVERSARIAL_REPORT/u);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test("default identity helpers fail closed for missing SDK tools and invalid devices", () => {
  const benchmarkApk = "artifacts/native/phase18-garmin-acceptance/gym-tracker-phase18-garmin-acceptance-devtest.apk";
  const adversarialApk = "artifacts/native/phase18-garmin-adversarial/gym-tracker-phase18-garmin-adversarial-devtest.apk";
  const proofApk = "artifacts/native/phase18-garmin-proof/gym-tracker-phase18-garmin-proof-devtest.apk";
  const nativeReport = "artifacts/native/phase18-garmin-adversarial/native-report.json";
  const privacyReport = "artifacts/native/phase18-garmin-adversarial/privacy-report.json";
  mkdirSync(path.dirname(path.resolve(proofApk)), { recursive: true });
  withWorkspaceFiles({
    [benchmarkApk]: "apk",
    [adversarialApk]: "apk",
    [proofApk]: "apk",
    [MAESTRO_SOURCE]: "maestro-source\n",
    [nativeReport]: "{}\n",
    [privacyReport]: "{}\n",
  }, () => {
    assert.throws(() => withEnv({ ANDROID_HOME: undefined, ANDROID_SDK_ROOT: undefined }, () => resolvePhase18GarminBenchmarkCurrentIdentity()), /phase18_garmin_benchmark_android_sdk_missing/u);
    assert.throws(() => withEnv({ ANDROID_HOME: undefined, ANDROID_SDK_ROOT: undefined }, () => resolvePhase18GarminAcceptanceCurrentIdentity()), /phase18_acceptance_evidence_android_sdk_missing/u);
    assert.throws(() => withEnv({ ANDROID_HOME: undefined, ANDROID_SDK_ROOT: undefined }, () => resolvePhase18GarminAdversarialCurrentIdentity(Buffer.from("raw-report"))), /phase18_garmin_adversarial_evidence_android_sdk_missing/u);
    assert.throws(() => withEnv({ ANDROID_HOME: undefined, ANDROID_SDK_ROOT: undefined }, () => resolvePhase18GarminProofCurrentIdentity(Buffer.from("{}"))), /phase18_evidence_android_sdk_missing/u);

    withFakeSdk({ adbScript: "#!/bin/sh\nexit 0\n" }, () => {
      assert.throws(() => resolvePhase18GarminBenchmarkCurrentIdentity(), /phase18_garmin_benchmark_device_identity_invalid/u);
      assert.throws(() => resolvePhase18GarminAcceptanceCurrentIdentity(), /phase18_acceptance_evidence_apksigner_missing/u);
      assert.throws(() => resolvePhase18GarminProofCurrentIdentity(Buffer.from("{}")), /phase18_evidence_apksigner_missing/u);
    });

    withFakeSdk({
      adbScript: "#!/bin/sh\nif [ \"$1\" = \"devices\" ]; then printf 'List of devices attached\\n'; exit 0; fi\nexit 0\n",
      apksignerScript: "#!/bin/sh\nprintf 'certificate SHA-256 digest: aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa\\n'\n",
    }, () => {
      assert.throws(() => resolvePhase18GarminBenchmarkCurrentIdentity(), /phase18_garmin_benchmark_device_identity_invalid/u);
      assert.throws(() => resolvePhase18GarminAdversarialCurrentIdentity(Buffer.from("raw-report")), /phase18_garmin_adversarial_evidence_device_selection_invalid/u);
      assert.throws(() => resolvePhase18GarminProofCurrentIdentity(Buffer.from("{}")), /phase18_evidence_device_selection_invalid/u);
    });

    withFakeSdk({
      adbScript: `#!/bin/sh
if [ "$1" = "devices" ]; then printf 'List of devices attached\\nSERIAL\\tdevice\\n'; exit 0; fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "getprop" ]; then
  case "$5" in
    ro.product.cpu.abi) printf 'arm64-v8a\\n' ;;
    ro.build.version.sdk) printf '35\\n' ;;
    ro.product.model) printf 'Pixel 9\\n' ;;
  esac
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "pm" ] && [ "$5" = "path" ]; then
  printf 'not-a-package-line\\n'
  exit 0
fi
exit 0
`,
      apksignerScript: "#!/bin/sh\nprintf 'certificate SHA-256 digest: aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa\\n'\n",
    }, () => {
      assert.throws(() => resolvePhase18GarminAcceptanceCurrentIdentity(), /phase18_acceptance_evidence_installed_apk_missing/u);
    });

    withFakeSdk({
      adbScript: `#!/bin/sh
if [ "$1" = "devices" ]; then printf 'List of devices attached\\nSERIAL\\tdevice\\n'; exit 0; fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "getprop" ]; then
  case "$5" in
    ro.product.cpu.abi) printf 'arm64-v8a\\n' ;;
    ro.build.version.sdk) printf '35\\n' ;;
    ro.product.model) printf 'Pixel 9\\n' ;;
  esac
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "pm" ] && [ "$5" = "path" ]; then
  printf 'package:/data/app/com.fchoo.gymtracker.devtest/base.apk\\n'
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "pull" ]; then
  printf 'apk' > "$5"
  exit 0
fi
exit 0
`,
      apksignerScript: "#!/bin/sh\nprintf 'invalid-signature\\n'\n",
    }, () => {
      assert.throws(() => resolvePhase18GarminAcceptanceCurrentIdentity(), /phase18_acceptance_evidence_signature_unreadable/u);
    });
  });
});

test("helper-only branches classify proof failures and verifier-specific rejection paths", () => {
  const current = {
    currentHead: HEAD,
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    installedApkSha256: HASH,
    retainedSignatureSha256: HASH,
    deviceIdentitySha256: HASH,
  };
  const reviewAdversarial = adversarialEvidence(current);
  reviewAdversarial.cases = reviewAdversarial.cases.map((entry, index, list) => index === list.length - 1
    ? { ...entry, status: "TECHNICAL_REVIEW_REQUIRED", provenance: "unexpected" }
    : entry);
  reviewAdversarial.status = "TECHNICAL_REVIEW_REQUIRED";
  assert.deepEqual(validatePhase18GarminAdversarialEvidence(reviewAdversarial), {
    status: "TECHNICAL_REVIEW_REQUIRED",
    cases: reviewAdversarial.cases.length,
  });

  assert.equal(classifyPhase18GarminProofRunnerFailure("PH18-PKG", new Error("anything")), "packaging_failed");
  assert.equal(classifyPhase18GarminProofRunnerFailure("PH18-LOGIN", new Error("timeout while waiting")), "timeout");
  assert.equal(classifyPhase18GarminProofRunnerFailure("PH18-LOGIN", new Error("privacy issue")), "privacy_scan_failed");
  assert.equal(classifyPhase18GarminProofRunnerFailure("PH18-LOGIN", "not-an-error"), "temporary_failure");

  const proof = proofEvidence();
  const adversarial = adversarialEvidence(current);
  const maestroSourceBytes = Buffer.from("maestro-source");
  const maestroReportBytes = Buffer.from("maestro-report");
  const privacyBytes = Buffer.from("privacy");
  const proofBytes = Buffer.from(JSON.stringify(proof));
  const adversarialBytes = Buffer.from(JSON.stringify(adversarial));
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const evidence = {
    ...acceptanceEvidence({ nativeStatus: "verified" }),
    cases: acceptanceEvidence({ nativeStatus: "verified" }).cases.map((entry) => entry.artifact === PROOF_PATH
      ? { ...entry, artifact_sha256: hash(proofBytes) }
      : entry.artifact === ADVERSARIAL_PATH
        ? { ...entry, artifact_sha256: hash(adversarialBytes) }
        : entry),
    native_flow: {
      path: MAESTRO_SOURCE,
      source_sha256: hash(maestroSourceBytes),
      report_sha256: hash(maestroReportBytes),
    },
    privacy_scan: {
      status: "passed",
      scanned_artifact_count: 4,
      report_sha256: hash(privacyBytes),
    },
  };
  assert.throws(
    () => executePhase18GarminAcceptanceVerifier([
      "--manifest",
      `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`,
    ], {
      resolveCurrentIdentity: () => current,
      readBytes: (artifactPath) => artifactPath === MAESTRO_SOURCE
        ? maestroSourceBytes
        : artifactPath === MAESTRO_REPORT
          ? maestroReportBytes
          : artifactPath === PRIVACY_REPORT
            ? privacyBytes
            : artifactPath === PROOF_PATH
              ? proofBytes
              : artifactPath === ADVERSARIAL_PATH
                ? adversarialBytes
                : Buffer.from("x"),
      readJson: (artifactPath) => {
        if (artifactPath === `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`) return retainedAcceptanceManifest();
        if (artifactPath.endsWith("raw-report.json")) return evidence;
        if (artifactPath === MAESTRO_REPORT) return { status: "failed", observations: evidence.observations };
        if (artifactPath === PRIVACY_REPORT) return { status: "passed", scanned_artifact_count: 4 };
        if (artifactPath === PROOF_PATH) return proof;
        if (artifactPath === ADVERSARIAL_PATH) return adversarial;
        throw new Error(`unexpected:${artifactPath}`);
      },
      verifyOwnerArtifact: () => {},
    }),
    /phase18_acceptance_evidence_observations_invalid/u,
  );
  assert.throws(
    () => executePhase18GarminAcceptanceVerifier([
      "--manifest",
      `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`,
    ], {
      resolveCurrentIdentity: () => current,
      readBytes: (artifactPath) => artifactPath === MAESTRO_SOURCE
        ? maestroSourceBytes
        : artifactPath === MAESTRO_REPORT
          ? maestroReportBytes
          : artifactPath === PRIVACY_REPORT
            ? privacyBytes
            : artifactPath === PROOF_PATH
              ? Buffer.from("proof")
              : Buffer.from("x"),
      readJson: (artifactPath) => {
        if (artifactPath === `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`) return retainedAcceptanceManifest();
        if (artifactPath.endsWith("raw-report.json")) {
          return {
            ...evidence,
            cases: evidence.cases.map((entry) => entry.artifact === PROOF_PATH
              ? { ...entry, status: "verified", proof_kind: "native-exact-artifact", artifact_sha256: HASH }
              : entry.artifact === ADVERSARIAL_PATH
                ? { ...entry, status: "verified", proof_kind: "native-exact-artifact", artifact_sha256: HASH }
                : entry),
          };
        }
        if (artifactPath === MAESTRO_REPORT) return { status: "passed", observations: evidence.observations };
        if (artifactPath === PRIVACY_REPORT) return { status: "passed", scanned_artifact_count: 4 };
        if (artifactPath === PROOF_PATH) return proof;
        if (artifactPath === ADVERSARIAL_PATH) return adversarial;
        throw new Error(`unexpected:${artifactPath}`);
      },
      verifyOwnerArtifact: () => {},
    }),
    /phase18_acceptance_evidence_owner_artifact_invalid/u,
  );
});

test("benchmark helper rejects malformed envelopes, budget drift, and malformed installed markers", () => {
  const manifest = {
    base_head: HEAD,
    source_tree_sha256: HASH,
    python_lock_sha256: HASH,
    apk_sha256: HASH,
    signature_sha256: HASH,
    device_identity_sha256: HASH,
    package: "com.fchoo.gymtracker.devtest",
    profile: "development-test",
    abi: "arm64-v8a",
  };
  const metricNames = [
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
  ];
  const baseline = {
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    profile: "physical-arm64",
    metrics: Object.fromEntries(metricNames.map((metric) => [metric, { minimum_samples: 1, maximum: 1 }])),
  };
  const baselineBytes = Buffer.from(JSON.stringify(baseline));
  const coldStartSamples = Array.from({ length: 5 }, (_, index) => ({
    value: 2,
    observed_at_monotonic_ms: 60_000 + index,
    operation: "native-runtime:python-cold-start",
    process_id: index + 1,
    sequence: index + 1,
  }));
  const measurements = Object.fromEntries(metricNames.map((metric) => [metric, [2]]));
  measurements.python_cold_start_ms = coldStartSamples.map(({ value }) => value);
  assert.throws(
    () => validatePhase18GarminBenchmarkEvidence({}, manifest, baseline, baselineBytes),
    /phase18_garmin_benchmark_envelope_invalid/u,
  );
  assert.throws(
    () => validatePhase18GarminBenchmarkEvidence({
      schema_version: 1,
      suite: "phase18-garmin-acceptance",
      producer: "phase18-garmin-benchmark/v2",
      producer_context: {
        cold_start_handshake: { next_sequence: null, samples: coldStartSamples },
        cold_start_runs: coldStartSamples.map(({ process_id, sequence }) => ({
          process_id,
          run_nonce: sequence === 5 ? "a".repeat(32) : String(sequence).repeat(32),
          sequence,
        })),
        kind: "installed-route-log",
        marker: "GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:",
        process_id: 5,
        review_required: [],
        run_nonce: "a".repeat(32),
        source_pid: 5,
        status: "passed",
      },
      status: "passed",
      identity: {
        ...manifest,
        installed_apk_sha256: HASH,
        fixture_manifest_sha256: GARMIN_JSON_FIXTURE_MANIFEST_SHA256,
        workout_baseline_sha256: createHash("sha256").update(baselineBytes).digest("hex"),
      },
      budget_source: {
        kind: "source-owned-versioned-baseline",
        path: "tests/fixtures/garmin-json/phase18-performance-baseline.json",
        report_sha256: createHash("sha256").update(baselineBytes).digest("hex"),
      },
      measurements,
      measurement_context: {
        profile: "physical-arm64",
        device_identity_sha256: HASH,
        commands: Object.fromEntries(metricNames.map((metric) => [metric, metric])),
        sample_labels: Object.fromEntries(metricNames.map((metric) => [metric, ["sample"]])),
      },
      skipped: 0,
    }, manifest, baseline, baselineBytes),
    /phase18_garmin_benchmark_budget_exceeded:apk_size_bytes/u,
  );

  const benchmarkApk = "artifacts/native/phase18-garmin-acceptance/gym-tracker-phase18-garmin-acceptance-devtest.apk";
  withWorkspaceFiles({ [benchmarkApk]: "apk", [MAESTRO_SOURCE]: "maestro-source\n" }, () => withFakeSdk({
    adbScript: `#!/bin/sh
if [ "$1" = "devices" ]; then printf 'List of devices attached\\nSERIAL\\tdevice\\n'; exit 0; fi
if [ "$1" = "logcat" ] && [ "$2" = "-c" ]; then exit 0; fi
	if [ "$1" = "shell" ] && [ "$2" = "am" ]; then exit 0; fi
	if [ "$1" = "shell" ] && [ "$2" = "pidof" ]; then printf '1234\\n'; exit 0; fi
if [ "$1" = "logcat" ] && [ "$2" = "--pid" ] && [ "$4" = "-d" ]; then
  printf 'GYM_TRACKER_PHASE18_GARMIN_BENCHMARK:%s\\n' '{"run_nonce":"wrong","source":"installed-route-log","measurements":{},"measurement_context":{}}'
  exit 0
fi
exit 0
`,
    apksignerScript: "#!/bin/sh\nprintf 'certificate SHA-256 digest: aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa\\n'\n",
  }, () => {
    assert.throws(() => collectInstalledMeasurements(), /phase18_garmin_benchmark_producer_invalid/u);
  }));

  withWorkspaceFiles({ [benchmarkApk]: "apk", [MAESTRO_SOURCE]: "maestro-source\n" }, () => {
    assert.throws(
      () => withFakeSdk({
        apksignerScript: "#!/bin/sh\nprintf 'certificate SHA-256 digest: aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa\\n'\n",
      }, () => resolvePhase18GarminBenchmarkCurrentIdentity()),
      /phase18_garmin_benchmark_adb_missing/u,
    );

    assert.throws(
      () => withFakeSdk({
        adbScript: `#!/bin/sh
if [ "$1" = "devices" ]; then printf 'List of devices attached\\nSERIAL\\tdevice\\n'; exit 0; fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "getprop" ]; then
  case "$5" in
    ro.product.cpu.abi) printf 'arm64-v8a\\n' ;;
    ro.build.version.sdk) printf '35\\n' ;;
    ro.product.model) printf 'Pixel 9\\n' ;;
  esac
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "pm" ] && [ "$5" = "path" ]; then
  printf 'package:/data/app/com.fchoo.gymtracker.devtest/base.apk\\n'
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "pull" ]; then
  printf 'apk' > "$5"
  exit 0
fi
exit 0
`,
      }, () => resolvePhase18GarminBenchmarkCurrentIdentity()),
      /phase18_garmin_benchmark_apksigner_missing/u,
    );

    assert.throws(
      () => withFakeSdk({
        adbScript: `#!/bin/sh
if [ "$1" = "devices" ]; then printf 'List of devices attached\\nSERIAL\\tdevice\\n'; exit 0; fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "getprop" ]; then
  case "$5" in
    ro.product.cpu.abi) printf 'arm64-v8a\\n' ;;
    ro.build.version.sdk) printf '35\\n' ;;
    ro.product.model) printf 'Pixel 9\\n' ;;
  esac
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "pm" ] && [ "$5" = "path" ]; then
  printf 'package:/data/app/com.fchoo.gymtracker.devtest/base.apk\\n'
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "pull" ]; then
  printf 'apk' > "$5"
  exit 0
fi
exit 0
`,
        apksignerScript: "#!/bin/sh\nprintf 'invalid-signature\\n'\n",
      }, () => resolvePhase18GarminBenchmarkCurrentIdentity()),
      /phase18_garmin_benchmark_signature_unreadable/u,
    );
  });

});

test("helper CLIs expose bounded fallback error paths", () => {
  const clis = [
    [executePhase18GarminBenchmarkCli, ["node", "scripts/benchmark-phase18-garmin.mjs", "--manifest", "artifacts/native/phase18-garmin-acceptance/build.json", "--evidence", "artifacts/native/phase18-garmin-acceptance/benchmark.json", "--execute", "--phase20-native-checkpoint"], { readJson: () => acceptanceManifest(), readBytes: (relativePath) => relativePath.endsWith(".json") ? Buffer.from('{"schema_version":1,"suite":"phase18-garmin-acceptance","profile":"physical-arm64","metrics":{"apk_size_bytes":{"minimum_samples":1,"maximum":1},"garmin_module_size_bytes":{"minimum_samples":1,"maximum":1},"python_cold_start_ms":{"minimum_samples":1,"maximum":1},"python_warm_start_ms":{"minimum_samples":1,"maximum":1},"bounded_sync_ms":{"minimum_samples":1,"maximum":1},"route_render_ms":{"minimum_samples":1,"maximum":1},"lap_render_ms":{"minimum_samples":1,"maximum":1},"memory_rss_bytes":{"minimum_samples":1,"maximum":1},"js_task_ms":{"minimum_samples":1,"maximum":1},"frame_time_ms":{"minimum_samples":1,"maximum":1},"offline_workout_commit_ms":{"minimum_samples":1,"maximum":1}}}') : Buffer.from(relativePath), resolveCurrentIdentity: () => acceptanceManifest({ fixture_manifest_sha256: HASH, workout_baseline_sha256: HASH }), collectMeasurements: () => { throw "boom"; } }, /phase18_garmin_benchmark_failed/u],
    [executePhase18GarminAcceptanceVerifierCli, ["node", "scripts/verify-phase18-garmin-acceptance.mjs", "--manifest", `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`], { resolveCurrentIdentity: () => { throw "boom"; } }, /phase18_acceptance_verifier_failed/u],
    [executePhase18GarminAdversarialRunnerCli, ["node", "scripts/run-phase18-garmin-adversarial.mjs", "--manifest", "artifacts/native/phase18-garmin-adversarial/build.json", "--record", "artifacts/native/phase18-garmin-adversarial/native-record.json", "--execute", "--phase20-native-checkpoint"], { collectNativeReport: () => { throw "boom"; } }, /phase18_garmin_adversarial_runner_failed/u],
    [executePhase18GarminAdversarialVerifierCli, ["node", "scripts/verify-phase18-garmin-adversarial.mjs", "--manifest", "artifacts/native/phase18-garmin-adversarial/build.json"], { readJson: () => { throw "boom"; } }, /phase18_garmin_adversarial_verifier_failed/u],
    [executePhase18GarminProofRunnerCli, ["node", "scripts/run-phase18-garmin-proof.mjs", "--manifest", "artifacts/native/phase18-garmin-proof/build.json", "--execute", "--phase20-native-checkpoint"], { native: () => { throw "boom"; } }, /ENOENT|phase18_runner_failed|phase18_android_sdk_missing/u],
    [executePhase18GarminProofVerifierCli, ["node", "scripts/verify-phase18-garmin-proof.mjs", "--manifest", "artifacts/native/phase18-garmin-proof/build.json"], { readRegularFile: () => { throw "boom"; } }, /phase18_evidence_failed/u],
  ];
  for (const [cli, argv, dependencies, pattern] of clis) {
    const result = captureCli(cli, argv, dependencies);
    assert.match(result.stderr, pattern);
  }
});

test("Kotlin helper covers invalid XML, empty counters, and default CLI error messaging", () => {
  assert.throws(
    () => createPhase18KotlinCoverageReport({
      jacocoXml: '<report><counter type="LINE" missed="0" covered="10"/><counter type="BRANCH" missed="0" covered="10"/></report>',
      junitXml: "<not-a-testsuite />",
      readBytes: () => Buffer.from("x"),
    }),
    /phase18_kotlin_coverage_xml_invalid/u,
  );
  assert.throws(
    () => createPhase18KotlinCoverageReport({
      jacocoXml: '<report><counter type="LINE" missed="1" covered="0"/><counter type="BRANCH" missed="0" covered="10"/></report>',
      junitXml: '<testsuite tests="1" skipped="0" failures="0" errors="0"><testcase name="stores Garmin tokens in encrypted shared preferences"/></testsuite>',
      readBytes: () => Buffer.from("x"),
    }),
    /phase18_kotlin_coverage_empty/u,
  );

  const projectRoot = mkdtempSync(path.join(tmpdir(), "phase18-kotlin-default-cli-"));
  const spec = PHASE18_LANGUAGE_COVERAGE_SPECS.kotlin;
  try {
    mkdirSync(path.join(projectRoot, "android"), { recursive: true });
    writeFileSync(path.join(projectRoot, "android/gradlew"), "#!/bin/sh\nexit 0\n");
    chmodSync(path.join(projectRoot, "android/gradlew"), 0o755);
    for (const sourcePath of [...spec.sourcePaths, spec.testPath]) {
      const absolutePath = path.join(projectRoot, sourcePath);
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, sourcePath);
    }
    mkdirSync(path.join(projectRoot, path.dirname("modules/garmin-connect/android/build/reports/jacoco/phase18-garmin-kotlin.xml")), { recursive: true });
    mkdirSync(path.join(projectRoot, path.dirname("modules/garmin-connect/android/build/test-results/testDebugUnitTest/TEST-expo.modules.garminconnect.GarminTokenStoreTest.xml")), { recursive: true });
    writeFileSync(path.join(projectRoot, "modules/garmin-connect/android/build/reports/jacoco/phase18-garmin-kotlin.xml"), '<report><counter type="LINE" missed="0" covered="10"/><counter type="BRANCH" missed="0" covered="10"/></report>');
    writeFileSync(path.join(projectRoot, "modules/garmin-connect/android/build/test-results/testDebugUnitTest/TEST-expo.modules.garminconnect.GarminTokenStoreTest.xml"), `<testsuite tests="${spec.requiredCases.length}" skipped="0" failures="0" errors="0">${spec.requiredCases.map((name) => `<testcase name="${name}"/>`).join("")}</testsuite>`);
    assert.equal(executePhase18KotlinCoverage({ projectRoot }).status, "passed");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }

  const failure = captureCli(executePhase18KotlinCoverageCli, [
    "node",
    "scripts/run-phase18-kotlin-coverage.mjs",
  ], {
    runGradle: () => {
      throw new Error("bounded-error");
    },
  });
  assert.match(failure.stderr, /bounded-error/u);
  assert.throws(
    () => createPhase18KotlinCoverageReport({
      jacocoXml: '<report><counter type="LINE" missed="0" covered="10"/><counter type="BRANCH" missed="0" covered="10"/></report>',
      junitXml: '<testsuite tests="x" skipped="0" failures="0" errors="0"><testcase name="stores Garmin tokens in encrypted shared preferences"/></testsuite>',
      readBytes: () => Buffer.from("x"),
    }),
    /phase18_kotlin_coverage_xml_invalid/u,
  );
  assert.throws(
    () => createPhase18KotlinCoverageReport({
      jacocoXml: '<report><counter type="LINE" missed="0" covered="10"/><counter type="BRANCH" missed="0" covered="10"/></report>',
      junitXml: '<testsuite tests="1" skipped="0" failures="0" errors="0"><testcase /></testsuite>',
      readBytes: () => Buffer.from("x"),
    }),
    /phase18_kotlin_coverage_xml_invalid/u,
  );
  assert.throws(
    () => executePhase18KotlinCoverage({
      runGradle: () => {},
      readText: (relativePath) => relativePath.includes("jacoco")
        ? '<report><counter type="LINE" missed="1" covered="9"/><counter type="BRANCH" missed="0" covered="10"/></report>'
        : '<testsuite tests="1" skipped="0" failures="0" errors="0"><testcase name="stores Garmin tokens in encrypted shared preferences"/></testsuite>',
      readBytes: () => Buffer.from("x"),
      writeReport: () => {
        throw new Error("should not write");
      },
    }),
    /phase18_kotlin_coverage_tests_failed/u,
  );
});
