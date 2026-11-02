import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  PHASE18_AGGREGATE_SUITE,
  PHASE18_MAESTRO_CASE_IDS,
  PHASE18_MAESTRO_REPORT,
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
  const proof = Buffer.from('{"schema_version":1,"suite":"phase18-garmin-proof","status":"passed","producer_context":{"kind":"fixture"}}\n');
  const native = Buffer.from('{"schema_version":1,"status":"passed"}\n');
  const adversarial = Buffer.from(`${JSON.stringify({
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    status: "passed",
    native_report: { path: NATIVE_PATH, sha256: sha256(native) },
  })}\n`);
  const maestro = maestroFixture();
  assert.throws(
    () => validatePhase18MaestroReport(maestro.report, null),
    /phase18_maestro_report_schema_invalid/u,
  );
  const maestroReportBytes = Buffer.from(`${JSON.stringify(maestro.report)}\n`);
  const bytes = new Map([
    [PROOF_PATH, proof],
    [ADVERSARIAL_PATH, adversarial],
    [NATIVE_PATH, native],
    [PHASE18_MAESTRO_REPORT, maestroReportBytes],
    ...maestro.bytes,
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
      {
        id: PHASE18_PRIVACY_CASE_IDS[2],
        status: "passed",
        artifact: { path: PHASE18_MAESTRO_REPORT, sha256: sha256(maestroReportBytes) },
        attachments: [
          { path: FLOW_PATH, sha256: sha256(bytes.get(FLOW_PATH)), media_type: "application/yaml" },
          { path: JUNIT_PATH, sha256: sha256(bytes.get(JUNIT_PATH)), media_type: "application/xml" },
          { path: OBSERVATIONS_PATH, sha256: sha256(bytes.get(OBSERVATIONS_PATH)), media_type: "application/json" },
        ],
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
    case_count: 3,
    scanned_artifact_count: 7,
    scanned_paths: [
      PROOF_PATH,
      ADVERSARIAL_PATH,
      NATIVE_PATH,
      PHASE18_MAESTRO_REPORT,
      FLOW_PATH,
      JUNIT_PATH,
      OBSERVATIONS_PATH,
    ],
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

test("aggregate schema validators fail closed across malformed identity, artifact, and attachment branches", () => {
  assert.throws(
    () => validatePhase18AggregateApkIdentity(null),
    /phase18_aggregate_apk_identity_invalid/u,
  );
  const aggregateReports = [
    ownerReport("phase18-garmin-proof", HASH),
    ownerReport("phase18-garmin-adversarial", HASH),
    ownerReport("phase18-garmin-acceptance", HASH),
  ];
  for (const ownerReports of [
    null,
    aggregateReports.slice(0, 2),
    [...aggregateReports].reverse(),
    aggregateReports.map((entry, index) => index === 0
      ? { ...entry, current_identity: { retainedApkSha256: "c".repeat(64) } }
      : entry),
    aggregateReports.map((entry, index) => index === 0
      ? { ...entry, current_identity: { retainedSignatureSha256: "c".repeat(64) } }
      : entry),
    aggregateReports.map((entry, index) => index === 1
      ? { ...entry, current_identity: { deviceIdentitySha256: "c".repeat(64) } }
      : entry),
    aggregateReports.map((entry, index) => index === 1
      ? { ...entry, producer_context: { installed_apk_sha256: "c".repeat(64) } }
      : entry),
  ]) {
    assert.throws(() => validatePhase18AggregateApkIdentity({
      manifest: manifest(HASH),
      installedApkSha256: HASH,
      ownerReports,
    }), /phase18_aggregate_apk_identity_invalid/u);
  }
  assert.throws(() => validatePhase18AggregateApkIdentity({
    manifest: manifest(HASH),
    installedApkSha256: "c".repeat(64),
    ownerReports: aggregateReports,
  }), /phase18_aggregate_apk_identity_invalid/u);

  const maestro = maestroFixture();
  assert.throws(() => validatePhase18MaestroReport(null, {
    manifest: manifest(HASH), installedApkSha256: HASH, readBytes: () => undefined,
  }), /phase18_maestro_report_schema_invalid/u);
  const malformedMaestroCases = [
    {
      report: {
        ...maestro.report,
        cases: [{ ...maestro.report.cases[0], artifact: null }],
      },
      bytes: maestro.bytes,
      error: /phase18_maestro_report_artifact_invalid/u,
    },
    {
      report: {
        ...maestro.report,
        cases: [{
          ...maestro.report.cases[0],
          artifact: { ...maestro.report.cases[0].artifact, path: "wrong.xml" },
        }],
      },
      bytes: maestro.bytes,
      error: /phase18_maestro_report_artifact_invalid/u,
    },
    {
      report: {
        ...maestro.report,
        cases: [{ ...maestro.report.cases[0], attachments: [null] }],
      },
      bytes: maestro.bytes,
      error: /phase18_maestro_report_attachment_invalid/u,
    },
    {
      report: {
        ...maestro.report,
        cases: [{
          ...maestro.report.cases[0],
          attachments: [{
            ...maestro.report.cases[0].attachments[0],
            media_type: "text/plain",
          }],
        }],
      },
      bytes: maestro.bytes,
      error: /phase18_maestro_report_attachment_invalid/u,
    },
    {
      report: maestro.report,
      bytes: new Map([...maestro.bytes].filter(([artifactPath]) => artifactPath !== JUNIT_PATH)),
      error: /phase18_maestro_report_artifact_missing/u,
    },
    {
      report: maestro.report,
      bytes: new Map(maestro.bytes).set(JUNIT_PATH, Buffer.from("not-junit")),
      error: /phase18_maestro_report_artifact_hash_invalid/u,
    },
    {
      report: maestro.report,
      bytes: new Map(maestro.bytes).set(OBSERVATIONS_PATH, Buffer.from("changed")),
      error: /phase18_maestro_report_attachment_hash_invalid/u,
    },
  ];
  for (const { report, bytes, error } of malformedMaestroCases) {
    assert.throws(() => validatePhase18MaestroReport(report, {
      manifest: manifest(HASH),
      installedApkSha256: HASH,
      readBytes: (artifactPath) => bytes.get(artifactPath),
    }), error);
  }
  const malformedJunit = Buffer.from("not-junit");
  const malformedJunitReport = structuredClone(maestro.report);
  malformedJunitReport.cases[0].artifact.sha256 = sha256(malformedJunit);
  assert.throws(() => validatePhase18MaestroReport(malformedJunitReport, {
    manifest: manifest(HASH), installedApkSha256: HASH,
    readBytes: (artifactPath) => artifactPath === JUNIT_PATH
      ? malformedJunit
      : maestro.bytes.get(artifactPath),
  }), /phase18_maestro_report_junit_invalid/u);
  for (const observationBytes of [Buffer.from("{"), Buffer.from('{"appearance":[]}')]) {
    const report = structuredClone(maestro.report);
    report.cases[0].attachments[0].sha256 = sha256(observationBytes);
    assert.throws(() => validatePhase18MaestroReport(report, {
      manifest: manifest(HASH), installedApkSha256: HASH,
      readBytes: (artifactPath) => artifactPath === OBSERVATIONS_PATH
        ? observationBytes
        : maestro.bytes.get(artifactPath),
    }), /phase18_maestro_report_observations_invalid/u);
  }
  assert.throws(() => validatePhase18MaestroReport({
    ...maestro.report,
    identity: { ...maestro.report.identity, run_id: undefined },
  }, {
    manifest: manifest(HASH), installedApkSha256: HASH,
    readBytes: (artifactPath) => maestro.bytes.get(artifactPath),
  }), /phase18_maestro_report_identity_invalid/u);

  const privacy = privacyFixture();
  assert.throws(
    () => validatePhase18PrivacyReport(privacy.report, null),
    /phase18_privacy_report_schema_invalid/u,
  );
  assert.throws(() => validatePhase18PrivacyReport(null, {
    manifest: manifest(HASH), installedApkSha256: HASH, readBytes: () => undefined,
  }), /phase18_privacy_report_schema_invalid/u);
  const malformedPrivacyCase = structuredClone(privacy.report);
  malformedPrivacyCase.cases[0].status = "skipped";
  assert.throws(() => validatePhase18PrivacyReport(malformedPrivacyCase, {
    manifest: manifest(HASH), installedApkSha256: HASH,
    readBytes: (artifactPath) => privacy.bytes.get(artifactPath),
  }), /phase18_privacy_report_case_invalid/u);
  const staleReferenceBytes = Buffer.from(`${JSON.stringify({
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    status: "passed",
    native_report: { path: NATIVE_PATH, sha256: "c".repeat(64) },
  })}\n`);
  const staleReference = structuredClone(privacy.report);
  staleReference.cases[1].artifact.sha256 = sha256(staleReferenceBytes);
  assert.throws(() => validatePhase18PrivacyReport(staleReference, {
    manifest: manifest(HASH), installedApkSha256: HASH,
    readBytes: (artifactPath) => artifactPath === ADVERSARIAL_PATH
      ? staleReferenceBytes
      : privacy.bytes.get(artifactPath),
  }), /phase18_privacy_report_recursive_reference_invalid/u);
  const priorReferenceBytes = Buffer.from(`${JSON.stringify({
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    status: "passed",
    prior_report: {
      path: PROOF_PATH,
      sha256: privacy.report.cases[0].artifact.sha256,
    },
    native_report: privacy.report.cases[1].attachments[0],
  })}\n`);
  const priorReference = structuredClone(privacy.report);
  priorReference.cases[1].artifact.sha256 = sha256(priorReferenceBytes);
  assert.throws(() => validatePhase18PrivacyReport(priorReference, {
    manifest: manifest(HASH), installedApkSha256: HASH,
    readBytes: (artifactPath) => artifactPath === ADVERSARIAL_PATH
      ? priorReferenceBytes
      : privacy.bytes.get(artifactPath),
  }), /phase18_privacy_report_recursive_reference_invalid/u);
});
