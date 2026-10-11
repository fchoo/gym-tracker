import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT,
  createPhase18GarminAcceptanceRawReport,
  createPhase18GarminAcceptanceRunnerPlan,
  executePhase18GarminAcceptanceRunner,
  parsePhase18GarminAcceptanceRunnerArgs,
  validatePhase18GarminAcceptanceManifest,
} from "./run-phase18-garmin-acceptance.mjs";
import {
  validatePhase18GarminAcceptanceCurrentIdentity,
  validatePhase18GarminAcceptanceEvidence,
} from "./verify-phase18-garmin-acceptance.mjs";

const HASH = "a".repeat(64);
const HEAD = "b".repeat(40);
const MANIFEST_PATH = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`;
const RECORD_PATH = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/acceptance-record.json`;

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
