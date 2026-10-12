import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  PHASE18_AGGREGATE_SUITE,
  PHASE18_MAESTRO_CASE_IDS,
  PHASE18_PRIVACY_CASE_IDS,
  validatePhase18AggregateApkIdentity,
  validatePhase18MaestroReport,
  validatePhase18PrivacyReport,
} from "./phase18-aggregate-acceptance.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const HEAD = "b".repeat(40);
const HASH = "a".repeat(64);
const RUN_ID = "phase18-20261012-abcdef0";
const FLOW_PATH = "maestro/phase18/garmin-sync.yaml";
const JUNIT_PATH = "artifacts/native/v1.2-acceptance/maestro/garmin-sync.xml";
const OBSERVATIONS_PATH = "artifacts/native/v1.2-acceptance/maestro/observations.json";
const PROOF_PATH = "artifacts/native/phase18-garmin-proof/final-evidence.json";
const ADVERSARIAL_PATH = "artifacts/native/phase18-garmin-adversarial/final-evidence.json";
const NATIVE_PATH = "artifacts/native/phase18-garmin-adversarial/native-report.json";

function manifest(apkSha256) {
  return {
    schema_version: 1,
    suite: PHASE18_AGGREGATE_SUITE,
    profile: "development-test",
    package: "com.fchoo.gymtracker.devtest",
    abi: "arm64-v8a",
    js_bundle_embedded: true,
    base_head: HEAD,
    source_tree_sha256: HASH,
    python_lock_sha256: HASH,
    apk_sha256: apkSha256,
    signature_sha256: HASH,
    device_identity_sha256: HASH,
  };
}

function identity(apkSha256) {
  return {
    base_head: HEAD,
    source_tree_sha256: HASH,
    apk_sha256: apkSha256,
    installed_apk_sha256: apkSha256,
    signature_sha256: HASH,
    device_identity_sha256: HASH,
    run_id: RUN_ID,
  };
}

function ownerReport(suite, apkSha256, extra = {}) {
  return {
    schema_version: 1,
    suite,
    status: "passed",
    manifest: manifest(apkSha256),
    ...extra,
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

function maestroFixture() {
  const bytes = new Map([
    [FLOW_PATH, Buffer.from("appId: com.fchoo.gymtracker.devtest\n")],
    [JUNIT_PATH, Buffer.from('<testsuite tests="1" failures="0" errors="0" skipped="0"><testcase name="garmin-sync"/></testsuite>')],
    [OBSERVATIONS_PATH, Buffer.from(`${JSON.stringify(observations)}\n`)],
  ]);
  const report = {
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    producer: "phase18-maestro/v1",
    status: "passed",
    identity: identity(HASH),
    case_ids: PHASE18_MAESTRO_CASE_IDS,
    cases: [{
      id: PHASE18_MAESTRO_CASE_IDS[0],
      status: "passed",
      source: { path: FLOW_PATH, sha256: sha256(bytes.get(FLOW_PATH)) },
      result: { tests: 1, failures: 0, errors: 0, skipped: 0 },
      artifact: { path: JUNIT_PATH, sha256: sha256(bytes.get(JUNIT_PATH)) },
      attachments: [{
        path: OBSERVATIONS_PATH,
        sha256: sha256(bytes.get(OBSERVATIONS_PATH)),
        media_type: "application/json",
      }],
    }],
  };
  return { bytes, report };
}

function privacyFixture() {
  const proof = Buffer.from('{"schema_version":1,"suite":"phase18-garmin-proof","status":"passed"}\n');
  const native = Buffer.from('{"schema_version":1,"status":"passed"}\n');
  const adversarial = Buffer.from(`${JSON.stringify({
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    status: "passed",
    native_report: { path: NATIVE_PATH, sha256: sha256(native) },
  })}\n`);
  const bytes = new Map([
    [PROOF_PATH, proof],
    [ADVERSARIAL_PATH, adversarial],
    [NATIVE_PATH, native],
  ]);
  const report = {
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    producer: "phase18-privacy-scan/v1",
    status: "passed",
    identity: identity(HASH),
    case_ids: PHASE18_PRIVACY_CASE_IDS,
    cases: [
      {
        id: PHASE18_PRIVACY_CASE_IDS[0],
        status: "passed",
        artifact: { path: PROOF_PATH, sha256: sha256(proof) },
        attachments: [],
      },
      {
        id: PHASE18_PRIVACY_CASE_IDS[1],
        status: "passed",
        artifact: { path: ADVERSARIAL_PATH, sha256: sha256(adversarial) },
        attachments: [{ path: NATIVE_PATH, sha256: sha256(native), media_type: "application/json" }],
      },
    ],
  };
  return { bytes, report };
}

test("rejects the old three-APK owner model and accepts one immutable aggregate APK", () => {
  const proofBytes = Buffer.from("previous-proof-suite-apk-bytes");
  const adversarialBytes = Buffer.from("previous-adversarial-suite-apk-bytes");
  const acceptanceBytes = Buffer.from("previous-acceptance-suite-apk-bytes");
  assert.throws(() => validatePhase18AggregateApkIdentity({
    manifest: manifest(sha256(acceptanceBytes)),
    installedApkSha256: sha256(acceptanceBytes),
    ownerReports: [
      ownerReport("phase18-garmin-proof", sha256(proofBytes)),
      ownerReport("phase18-garmin-adversarial", sha256(adversarialBytes)),
      ownerReport("phase18-garmin-acceptance", sha256(acceptanceBytes)),
    ],
  }), /phase18_aggregate_apk_identity_invalid/u);

  const aggregateBytes = Buffer.from("one-immutable-v1.2-acceptance-apk");
  const aggregateSha256 = sha256(aggregateBytes);
  assert.deepEqual(validatePhase18AggregateApkIdentity({
    manifest: manifest(aggregateSha256),
    installedApkSha256: aggregateSha256,
    ownerReports: [
      ownerReport("phase18-garmin-proof", aggregateSha256),
      ownerReport("phase18-garmin-adversarial", aggregateSha256, {
        current_identity: {
          currentHead: HEAD,
          currentSourceTreeSha256: HASH,
          currentPythonLockSha256: HASH,
          retainedApkSha256: aggregateSha256,
          retainedSignatureSha256: HASH,
          deviceIdentitySha256: HASH,
        },
        producer_context: { installed_apk_sha256: aggregateSha256 },
      }),
      ownerReport("phase18-garmin-acceptance", aggregateSha256),
    ],
  }), {
    apk_sha256: aggregateSha256,
    installed_apk_sha256: aggregateSha256,
    signature_sha256: HASH,
    device_identity_sha256: HASH,
  });
});

test("validates the source-owned Maestro ledger and derives observations from attachment bytes", () => {
  const { bytes, report } = maestroFixture();
  assert.deepEqual(validatePhase18MaestroReport(report, {
    manifest: manifest(HASH),
    installedApkSha256: HASH,
    readBytes: (artifactPath) => bytes.get(artifactPath),
  }), {
    case_count: 1,
    attachment_count: 1,
    observations,
    referenced_artifacts: [JUNIT_PATH, OBSERVATIONS_PATH],
  });

  for (const invalid of [
    { ...report, case_ids: [] },
    { ...report, cases: [{ ...report.cases[0], status: "skipped" }] },
    { ...report, cases: [{ ...report.cases[0], result: { ...report.cases[0].result, skipped: 1 } }] },
    { ...report, identity: { ...report.identity, installed_apk_sha256: "c".repeat(64) } },
    { ...report, cases: [{ ...report.cases[0], artifact: { ...report.cases[0].artifact, sha256: "c".repeat(64) } }] },
  ]) {
    assert.throws(() => validatePhase18MaestroReport(invalid, {
      manifest: manifest(HASH),
      installedApkSha256: HASH,
      readBytes: (artifactPath) => bytes.get(artifactPath),
    }), /phase18_maestro_report_/u);
  }
});

test("validates the ordered privacy ledger and recursively scans referenced attachment bytes", () => {
  const { bytes, report } = privacyFixture();
  assert.deepEqual(validatePhase18PrivacyReport(report, {
    manifest: manifest(HASH),
    installedApkSha256: HASH,
    readBytes: (artifactPath) => bytes.get(artifactPath),
  }), {
    case_count: 2,
    scanned_artifact_count: 3,
    scanned_paths: [PROOF_PATH, ADVERSARIAL_PATH, NATIVE_PATH],
  });

  const privateBytes = new Map(bytes);
  privateBytes.set(NATIVE_PATH, Buffer.from('{"email":"owner@example.invalid"}\n'));
  const privateReport = structuredClone(report);
  const privateHash = sha256(privateBytes.get(NATIVE_PATH));
  privateReport.cases[1].attachments[0].sha256 = privateHash;
  const adversarial = Buffer.from(`${JSON.stringify({
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    status: "passed",
    native_report: { path: NATIVE_PATH, sha256: privateHash },
  })}\n`);
  privateBytes.set(ADVERSARIAL_PATH, adversarial);
  privateReport.cases[1].artifact.sha256 = sha256(adversarial);
  assert.throws(() => validatePhase18PrivacyReport(privateReport, {
    manifest: manifest(HASH),
    installedApkSha256: HASH,
    readBytes: (artifactPath) => privateBytes.get(artifactPath),
  }), /phase18_privacy_report_privacy_invalid/u);
});
