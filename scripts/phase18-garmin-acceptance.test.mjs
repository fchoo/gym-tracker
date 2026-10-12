import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT,
  createPhase18GarminAcceptanceRawReport,
  createPhase18GarminAcceptanceRunnerPlan,
  executePhase18GarminAcceptanceRunner,
  executePhase18GarminAcceptanceRunnerCli,
  parsePhase18GarminAcceptanceRunnerArgs,
  validatePhase18GarminAcceptanceManifest,
} from "./run-phase18-garmin-acceptance.mjs";
import { createPhase18GarminAdversarialRunnerPlan } from "./run-phase18-garmin-adversarial.mjs";
import { createPhase18GarminProofRunnerPlan } from "./run-phase18-garmin-proof.mjs";
import {
  executePhase18GarminAcceptanceVerifier,
  executePhase18GarminAcceptanceVerifierCli,
  validatePhase18GarminAcceptanceCurrentIdentity,
  validatePhase18GarminAcceptanceEvidence,
} from "./verify-phase18-garmin-acceptance.mjs";

const HASH = "a".repeat(64);
const HEAD = "b".repeat(40);
const MANIFEST_PATH = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`;
const RECORD_PATH = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/acceptance-record.json`;
const PROOF_PATH = "artifacts/native/phase18-garmin-proof/final-evidence.json";
const ADVERSARIAL_PATH = "artifacts/native/phase18-garmin-adversarial/final-evidence.json";

function manifest(overrides = {}) {
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

function retainedManifest() {
  return {
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: HEAD,
    source_tree_sha256: HASH,
    package: "com.fchoo.gymtracker.devtest",
    apk: { path: `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-acceptance-devtest.apk`, sha256: HASH, page_alignment_verified: true },
    installed_apk: { sha256: HASH, matches_retained_apk: true },
    device: { abi: "arm64-v8a", identity_sha256: HASH },
  };
}

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

function proofPassedCase(id) {
  const base = { id, status: "passed", duration_ms: 1 };
  if (id === "PH18-PKG") return { ...base, result_sha256: HASH };
  if (id === "PH18-MFA") return { ...base, outcome: "not_requested" };
  if (["PH18-READ", "PH18-REFRESH", "PH18-PRIVACY"].includes(id)) {
    return { ...base, count: 1, result_sha256: HASH };
  }
  return base;
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

function validProofEvidence(current) {
  return {
    schema_version: 1,
    suite: "phase18-garmin-proof",
    status: "passed",
    manifest: {
      schema_version: 1,
      suite: "phase18-garmin-proof",
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
    case_ids: caseIds,
    raw_report_sha256: current.rawReportSha256 ?? HASH,
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
      path: "artifacts/native/phase18-garmin-adversarial/native-report.json",
      sha256: HASH,
    },
    privacy_scan: {
      status: "passed",
      scanned_artifact_count: 4,
      report_sha256: HASH,
    },
  };
}

function cases({ nativeStatus = "deferred" } = {}) {
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
}

function evidence(overrides = {}) {
  return createPhase18GarminAcceptanceRawReport({
    manifest: manifest(),
    cases: cases(),
    observations,
    native_flow: {
      path: "maestro/phase18/garmin-sync.yaml",
      source_sha256: HASH,
      report_sha256: HASH,
    },
    privacy_scan: {
      status: "passed",
      scanned_artifact_count: 4,
      report_sha256: HASH,
    },
    ...overrides,
  });
}

test("Phase 18 acceptance runner is inert without the explicit Phase 20 native gate", () => {
  assert.deepEqual(parsePhase18GarminAcceptanceRunnerArgs([
    "--manifest", MANIFEST_PATH,
    "--record", RECORD_PATH,
  ]), {
    manifest: MANIFEST_PATH,
    record: RECORD_PATH,
    execute: false,
    phase20Checkpoint: false,
  });
  assert.throws(
    () => parsePhase18GarminAcceptanceRunnerArgs([
      "--manifest", MANIFEST_PATH,
      "--record", RECORD_PATH,
      "--execute",
    ]),
    /phase18_acceptance_runner_arguments_invalid/u,
  );
  assert.throws(
    () => parsePhase18GarminAcceptanceRunnerArgs([
      "--manifest", MANIFEST_PATH,
      "--record", RECORD_PATH,
      "--unexpected",
    ]),
    /phase18_acceptance_runner_arguments_invalid/u,
  );
  const calls = [];
  const result = executePhase18GarminAcceptanceRunner([
    "--manifest", MANIFEST_PATH,
    "--record", RECORD_PATH,
  ], {
    readJson: (...args) => calls.push(args),
    writeReport: (...args) => calls.push(args),
  });
  assert.deepEqual(result, {
    status: "native_deferred",
    final_evidence_written: false,
  });
  assert.deepEqual(calls, []);
});

test("runner plan owns one ordered ledger and separate exact native prerequisites", () => {
  const plan = createPhase18GarminAcceptanceRunnerPlan();
  assert.equal(plan.case_ids.length, 19);
  assert.deepEqual(plan.case_ids, plan.cases.map(({ id }) => id));
  assert.deepEqual(plan.cases.slice(-2).map(({ id, ownerPlan }) => ({ id, ownerPlan })), [
    { id: "P18-NATIVE-18-03-REAL-ACCOUNT", ownerPlan: "18-03" },
    { id: "P18-NATIVE-18-13-ADVERSARIAL", ownerPlan: "18-13" },
  ]);
  assert.equal(plan.native_flow, "maestro/phase18/garmin-sync.yaml");
  assert.equal(plan.mock_to_real_relabeling, "prohibited");
});

test("manifest binds source, Python lock, APK, signature, package, profile, and ARM64 device", () => {
  assert.equal(validatePhase18GarminAcceptanceManifest(manifest(), {
    currentHead: HEAD,
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    retainedSignatureSha256: HASH,
    deviceIdentitySha256: HASH,
  }), true);
  for (const changed of [
    { base_head: "c".repeat(40) },
    { source_tree_sha256: "c".repeat(64) },
    { python_lock_sha256: "c".repeat(64) },
    { apk_sha256: "c".repeat(64) },
    { signature_sha256: "c".repeat(64) },
    { device_identity_sha256: "c".repeat(64) },
    { package: "com.example.wrong" },
    { profile: "production" },
    { abi: "x86_64" },
  ]) {
    assert.throws(
      () => validatePhase18GarminAcceptanceManifest(manifest(changed), {
        currentHead: HEAD,
        currentSourceTreeSha256: HASH,
        currentPythonLockSha256: HASH,
        retainedApkSha256: HASH,
        retainedSignatureSha256: HASH,
        deviceIdentitySha256: HASH,
      }),
      /phase18_acceptance_manifest_invalid/u,
    );
  }
});

test("verifier accepts deterministic host PASS with exact native work still deferred", () => {
  const result = evidence();
  assert.equal(result.status, "host-passed-native-deferred");
  assert.deepEqual(validatePhase18GarminAcceptanceEvidence(result), {
    status: "host-passed-native-deferred",
    host_cases: 17,
    native_prerequisites: 2,
  });
});

test("acceptance runner consumes the shared nested builder manifest", () => {
  const exact = evidence();
  const writes = [];
  const result = executePhase18GarminAcceptanceRunner([
    "--manifest", MANIFEST_PATH,
    "--record", RECORD_PATH,
    "--execute",
    "--phase20-native-checkpoint",
  ], {
    readJson: (path) => path === MANIFEST_PATH
      ? retainedManifest()
      : {
        cases: exact.cases,
        observations: exact.observations,
        native_flow: exact.native_flow,
        privacy_scan: exact.privacy_scan,
        current_identity: {
          currentHead: HEAD,
          currentSourceTreeSha256: HASH,
          currentPythonLockSha256: HASH,
          retainedApkSha256: HASH,
          retainedSignatureSha256: HASH,
          deviceIdentitySha256: HASH,
        },
      },
    writeReport: (report) => writes.push(report),
  });
  assert.equal(result.status, "host-passed-native-deferred");
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].manifest, manifest());
});

test("verifier accepts native completion only from the two exact artifact identities", () => {
  const result = evidence({ cases: cases({ nativeStatus: "verified" }) });
  assert.equal(result.status, "passed");
  assert.deepEqual(validatePhase18GarminAcceptanceEvidence(result), {
    status: "passed",
    host_cases: 17,
    native_prerequisites: 2,
  });
  const relabeled = structuredClone(result);
  relabeled.cases.at(-1).status = "passed";
  delete relabeled.cases.at(-1).proof_kind;
  assert.throws(
    () => validatePhase18GarminAcceptanceEvidence(relabeled),
    /phase18_acceptance_evidence_native_case_invalid/u,
  );
});

test("verifier rejects missing, duplicate, reordered, failed, and skipped ledger rows", () => {
  const exact = evidence();
  const variants = [
    { ...exact, cases: exact.cases.slice(1) },
    { ...exact, cases: [...exact.cases.slice(0, -1), exact.cases[0]] },
    { ...exact, cases: [exact.cases[1], exact.cases[0], ...exact.cases.slice(2)] },
    { ...exact, cases: exact.cases.map((entry, index) => index === 2 ? { ...entry, status: "failed" } : entry) },
    { ...exact, cases: exact.cases.map((entry, index) => index === 2 ? { ...entry, status: "skipped" } : entry) },
    { ...exact, case_ids: [...exact.case_ids].reverse() },
  ];
  for (const variant of variants) {
    assert.throws(
      () => validatePhase18GarminAcceptanceEvidence(variant),
      /phase18_acceptance_evidence_/u,
    );
  }
});

test("verifier rejects stale report and artifact identities", () => {
  const exact = evidence();
  const current = {
    currentHead: HEAD,
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    installedApkSha256: HASH,
    retainedSignatureSha256: HASH,
    deviceIdentitySha256: HASH,
    nativeFlowSourceSha256: HASH,
    nativeFlowReportSha256: HASH,
    privacyReportSha256: HASH,
  };
  assert.equal(validatePhase18GarminAcceptanceCurrentIdentity(exact, current), true);
  for (const key of Object.keys(current)) {
    assert.throws(
      () => validatePhase18GarminAcceptanceCurrentIdentity(exact, {
        ...current,
        [key]: key === "currentHead" ? "c".repeat(40) : "c".repeat(64),
      }),
      /phase18_acceptance_evidence_current_identity_invalid/u,
    );
  }
});

test("CLI verifier resolves current identity and hashes every owner, Maestro, and privacy artifact", () => {
  const maestroSourcePath = "maestro/phase18/garmin-sync.yaml";
  const maestroReportPath = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/maestro-report.json`;
  const privacyReportPath = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/privacy-report.json`;
  const bytes = new Map([
    [maestroSourcePath, Buffer.from("flow")],
    [maestroReportPath, Buffer.from("maestro")],
    [privacyReportPath, Buffer.from("privacy")],
  ]);
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  const current = {
    currentHead: HEAD,
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    installedApkSha256: HASH,
    retainedSignatureSha256: HASH,
    deviceIdentitySha256: HASH,
  };
  const proofEvidence = validProofEvidence(current);
  const adversarialEvidence = validAdversarialEvidence(current);
  const proofBytes = Buffer.from(JSON.stringify(proofEvidence));
  const adversarialBytes = Buffer.from(JSON.stringify(adversarialEvidence));
  bytes.set(PROOF_PATH, proofBytes);
  bytes.set(ADVERSARIAL_PATH, adversarialBytes);
  const exact = evidence({
    cases: cases({ nativeStatus: "verified" }).map((entry) => entry.id === "P18-NATIVE-18-03-REAL-ACCOUNT"
      ? { ...entry, artifact_sha256: digest(bytes.get(PROOF_PATH)) }
      : entry.id === "P18-NATIVE-18-13-ADVERSARIAL"
        ? { ...entry, artifact_sha256: digest(bytes.get(ADVERSARIAL_PATH)) }
        : entry),
    native_flow: {
      path: maestroSourcePath,
      source_sha256: digest(bytes.get(maestroSourcePath)),
      report_sha256: digest(bytes.get(maestroReportPath)),
    },
    privacy_scan: {
      status: "passed",
      scanned_artifact_count: 4,
      report_sha256: digest(bytes.get(privacyReportPath)),
    },
  });
  const ownerCalls = [];

  assert.deepEqual(executePhase18GarminAcceptanceVerifier([
    "--manifest", MANIFEST_PATH,
  ], {
    resolveCurrentIdentity: () => current,
    readBytes: (artifactPath) => bytes.get(artifactPath),
    readJson: (artifactPath) => {
      if (artifactPath === MANIFEST_PATH) return retainedManifest();
      if (artifactPath.endsWith("raw-report.json")) return exact;
      if (artifactPath === maestroReportPath) return { status: "passed", observations };
      if (artifactPath === privacyReportPath) return { status: "passed", scanned_artifact_count: 4 };
      if (artifactPath === PROOF_PATH) return proofEvidence;
      if (artifactPath === ADVERSARIAL_PATH) return adversarialEvidence;
      throw new Error(`unexpected path: ${artifactPath}`);
    },
    verifyOwnerArtifact: (artifactPath) => ownerCalls.push(artifactPath),
  }), {
    status: "passed",
    host_cases: 17,
    native_prerequisites: 2,
  });
  assert.deepEqual(ownerCalls, [PROOF_PATH, ADVERSARIAL_PATH]);
});

test("verifier fails closed on report identity and Maestro or privacy observation drift", () => {
  const maestroSourcePath = "maestro/phase18/garmin-sync.yaml";
  const maestroReportPath = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/maestro-report.json`;
  const privacyReportPath = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/privacy-report.json`;
  const bytes = new Map([
    [maestroSourcePath, Buffer.from("flow")],
    [maestroReportPath, Buffer.from("maestro")],
    [privacyReportPath, Buffer.from("privacy")],
  ]);
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  const current = {
    currentHead: HEAD,
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    installedApkSha256: HASH,
    retainedSignatureSha256: HASH,
    deviceIdentitySha256: HASH,
  };
  const proofEvidence = validProofEvidence(current);
  const adversarialEvidence = validAdversarialEvidence(current);
  const proofBytes = Buffer.from(JSON.stringify(proofEvidence));
  const adversarialBytes = Buffer.from(JSON.stringify(adversarialEvidence));
  bytes.set(PROOF_PATH, proofBytes);
  bytes.set(ADVERSARIAL_PATH, adversarialBytes);
  const exact = evidence({
    cases: cases({ nativeStatus: "verified" }).map((entry) => entry.id === "P18-NATIVE-18-03-REAL-ACCOUNT"
      ? { ...entry, artifact_sha256: digest(bytes.get(PROOF_PATH)) }
      : entry.id === "P18-NATIVE-18-13-ADVERSARIAL"
        ? { ...entry, artifact_sha256: digest(bytes.get(ADVERSARIAL_PATH)) }
        : entry),
    native_flow: {
      path: maestroSourcePath,
      source_sha256: digest(bytes.get(maestroSourcePath)),
      report_sha256: digest(bytes.get(maestroReportPath)),
    },
    privacy_scan: {
      status: "passed",
      scanned_artifact_count: 4,
      report_sha256: digest(bytes.get(privacyReportPath)),
    },
  });
  const readJson = (artifactPath) => {
    if (artifactPath === MANIFEST_PATH) return retainedManifest();
    if (artifactPath.endsWith("raw-report.json")) return exact;
    if (artifactPath === maestroReportPath) return { status: "passed", observations };
    if (artifactPath === privacyReportPath) return { status: "passed", scanned_artifact_count: 4 };
    if (artifactPath === PROOF_PATH) return proofEvidence;
    if (artifactPath === ADVERSARIAL_PATH) return adversarialEvidence;
    throw new Error(`unexpected path: ${artifactPath}`);
  };

  assert.throws(
    () => executePhase18GarminAcceptanceVerifier([
      "--manifest", MANIFEST_PATH,
    ], {
      resolveCurrentIdentity: () => current,
      readBytes: (artifactPath) => bytes.get(artifactPath),
      readJson: (artifactPath) => artifactPath.endsWith("raw-report.json")
        ? { ...exact, manifest: manifest({ apk_sha256: "c".repeat(64) }) }
        : readJson(artifactPath),
      verifyOwnerArtifact: () => {},
    }),
    /phase18_acceptance_evidence_report_identity_invalid/u,
  );

  assert.throws(
    () => validatePhase18GarminAcceptanceEvidence({
      ...exact,
      observations: { ...observations, reduced_motion: false },
    }),
    /phase18_acceptance_evidence_observations_invalid/u,
  );

  assert.throws(
    () => executePhase18GarminAcceptanceVerifier([
      "--manifest", MANIFEST_PATH,
    ], {
      resolveCurrentIdentity: () => current,
      readBytes: (artifactPath) => bytes.get(artifactPath),
      readJson: (artifactPath) => {
        if (artifactPath === maestroReportPath) {
          return { status: "passed", observations: { ...observations, reduced_motion: false } };
        }
        return readJson(artifactPath);
      },
      verifyOwnerArtifact: () => {},
    }),
    /phase18_acceptance_evidence_observations_invalid/u,
  );
});

test("acceptance CLI helpers emit bounded stdout and stderr", () => {
  const runner = captureCli(executePhase18GarminAcceptanceRunnerCli, [
    "node",
    "scripts/run-phase18-garmin-acceptance.mjs",
    "--manifest", MANIFEST_PATH,
    "--record", RECORD_PATH,
  ]);
  assert.match(runner.stdout, /"status":"native_deferred"/u);

  const verifier = captureCli(executePhase18GarminAcceptanceVerifierCli, [
    "node",
    "scripts/verify-phase18-garmin-acceptance.mjs",
    "--manifest",
    "wrong.json",
  ]);
  assert.match(verifier.stderr, /phase18_acceptance_evidence_arguments_invalid/u);
});

test("verifier rejects private provider, account, health, location, file, URL, and device data", () => {
  for (const forbidden of [
    { credentials: "secret" },
    { mfa_code: "123456" },
    { token: "secret" },
    { ciphertext: "secret" },
    { account_namespace: "private" },
    { external_activity_id: "123456789" },
    { raw_json: {} },
    { route: [{ latitude: 1, longitude: 2 }] },
    { heart_rate: 151 },
    { filename: "personal.fit" },
    { device_serial: "personal-device" },
    { url: "https://example.invalid" },
    { note: "owner@example.invalid" },
  ]) {
    assert.throws(
      () => validatePhase18GarminAcceptanceEvidence({ ...evidence(), ...forbidden }),
      /phase18_acceptance_evidence_privacy_invalid/u,
    );
  }
});

test("source-owned Maestro flow covers the native journey without embedded secrets", () => {
  const flow = readFileSync("maestro/phase18/garmin-sync.yaml", "utf8");
  for (const required of [
    "${GARMIN_EMAIL}",
    "${GARMIN_PASSWORD}",
    "${GARMIN_MFA_CODE}",
    "Connect Garmin",
    "Sync now",
    "Retry Garmin sync",
    "Imported activities",
    "Match to scheduled workout",
    "stopApp",
    "launchApp",
    "Disconnect Garmin",
  ]) assert.match(flow, new RegExp(required.replace(/[${}]/gu, "\\$&"), "u"));
  assert.doesNotMatch(flow, /owner@|private-account|123456789|latitude|longitude|heart.?rate/iu);
});

test("package scripts expose planning-safe runner, verifier, and focused tests", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  assert.equal(
    scripts["acceptance:phase18:garmin"],
    `node scripts/run-phase18-garmin-acceptance.mjs --manifest ${MANIFEST_PATH} --record ${RECORD_PATH}`,
  );
  assert.equal(
    scripts["verify:phase18:garmin-acceptance"],
    `node scripts/verify-phase18-garmin-acceptance.mjs --manifest ${MANIFEST_PATH}`,
  );
  assert.equal(
    scripts["test:evidence:phase18:garmin-acceptance"],
    "node --test scripts/phase18-garmin-acceptance.test.mjs",
  );
});
