import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { exactKeys, regexMatch } from "./node-evidence-utils.mjs";
import {
  assertPhase18PrivacySafe,
  assertPhase18PrivateTextSafe,
} from "./phase18-privacy-scan.mjs";

export const PHASE18_AGGREGATE_SUITE = "v1.2-acceptance";
export const PHASE18_AGGREGATE_ARTIFACT_ROOT =
  `artifacts/native/${PHASE18_AGGREGATE_SUITE}`;
export const PHASE18_AGGREGATE_MANIFEST =
  `${PHASE18_AGGREGATE_ARTIFACT_ROOT}/build.json`;
export const PHASE18_AGGREGATE_APK =
  `${PHASE18_AGGREGATE_ARTIFACT_ROOT}/gym-tracker-${PHASE18_AGGREGATE_SUITE}-devtest.apk`;

export const PHASE18_MAESTRO_CASE_IDS = Object.freeze([
  "P18-MAESTRO-GARMIN-SYNC-RECOVERY",
]);
export const PHASE18_PRIVACY_CASE_IDS = Object.freeze([
  "P18-PRIVACY-PROOF-REPORT",
  "P18-PRIVACY-ADVERSARIAL-REPORT",
  "P18-PRIVACY-MAESTRO-REPORT",
]);

export const PHASE18_ACCEPTANCE_OBSERVATIONS = Object.freeze({
  appearance: Object.freeze(["Light", "Dark", "System"]),
  viewports: Object.freeze([
    Object.freeze({ width: 360, height: 800 }),
    Object.freeze({ width: 390, height: 844 }),
    Object.freeze({ width: 600, height: 960 }),
    Object.freeze({ width: 840, height: 1080 }),
  ]),
  orientations: Object.freeze(["portrait", "landscape"]),
  font_scales: Object.freeze([1, 2]),
  input_methods: Object.freeze(["touch", "keyboard", "dpad"]),
  visible_focus: true,
  minimum_target_dp: 48,
  reduced_motion: true,
  process_restart: true,
});

const HASH = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const RUN_ID = /^phase18-[0-9]{8}-[a-f0-9]{7}$/u;
const PACKAGE = "com.fchoo.gymtracker.devtest";
const OWNER_SUITES = Object.freeze([
  "phase18-garmin-proof",
  "phase18-garmin-adversarial",
  "phase18-garmin-acceptance",
]);
const MANIFEST_KEYS = Object.freeze([
  "abi",
  "apk_sha256",
  "base_head",
  "device_identity_sha256",
  "js_bundle_embedded",
  "package",
  "profile",
  "python_lock_sha256",
  "schema_version",
  "signature_sha256",
  "source_tree_sha256",
  "suite",
]);
const IDENTITY_KEYS = Object.freeze([
  "apk_sha256",
  "base_head",
  "device_identity_sha256",
  "installed_apk_sha256",
  "run_id",
  "signature_sha256",
  "source_tree_sha256",
]);
const FLOW_PATH = "maestro/phase18/garmin-sync.yaml";
const JUNIT_PATH = `${PHASE18_AGGREGATE_ARTIFACT_ROOT}/maestro/garmin-sync.xml`;
const OBSERVATIONS_PATH = `${PHASE18_AGGREGATE_ARTIFACT_ROOT}/maestro/observations.json`;
const PROOF_PATH = "artifacts/native/phase18-garmin-proof/final-evidence.json";
const ADVERSARIAL_PATH = "artifacts/native/phase18-garmin-adversarial/final-evidence.json";
const ADVERSARIAL_NATIVE_PATH = "artifacts/native/phase18-garmin-adversarial/native-report.json";
export const PHASE18_MAESTRO_REPORT =
  `${PHASE18_AGGREGATE_ARTIFACT_ROOT}/maestro-report.json`;
export const PHASE18_PRIVACY_REPORT =
  `${PHASE18_AGGREGATE_ARTIFACT_ROOT}/privacy-report.json`;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fail(prefix, code) {
  throw new Error(`${prefix}_${code}`);
}

function validManifest(manifest) {
  return [
    exactKeys(manifest, MANIFEST_KEYS),
    manifest?.schema_version === 1,
    manifest?.suite === PHASE18_AGGREGATE_SUITE,
    manifest?.profile === "development-test",
    manifest?.package === PACKAGE,
    manifest?.abi === "arm64-v8a",
    manifest?.js_bundle_embedded === true,
    regexMatch(HEAD, manifest?.base_head),
    regexMatch(HASH, manifest?.source_tree_sha256),
    regexMatch(HASH, manifest?.python_lock_sha256),
    regexMatch(HASH, manifest?.apk_sha256),
    regexMatch(HASH, manifest?.signature_sha256),
    regexMatch(HASH, manifest?.device_identity_sha256),
  ].every(Boolean);
}

function validateIdentity(identity, manifest, installedApkSha256, prefix) {
  const invalid = [
    !exactKeys(identity, IDENTITY_KEYS),
    identity?.base_head !== manifest.base_head,
    identity?.source_tree_sha256 !== manifest.source_tree_sha256,
    identity?.apk_sha256 !== manifest.apk_sha256,
    identity?.installed_apk_sha256 !== installedApkSha256,
    identity?.installed_apk_sha256 !== manifest.apk_sha256,
    identity?.signature_sha256 !== manifest.signature_sha256,
    identity?.device_identity_sha256 !== manifest.device_identity_sha256,
    !RUN_ID.test(identity?.run_id ?? ""),
  ].some(Boolean);
  if (invalid) fail(prefix, "identity_invalid");
}

function bytesAt(readBytes, artifactPath, prefix) {
  const bytes = readBytes(artifactPath);
  if (!Buffer.isBuffer(bytes)) fail(prefix, "artifact_missing");
  return bytes;
}

function validateArtifact(record, expectedPath, readBytes, prefix) {
  if ([
    !exactKeys(record, ["path", "sha256"]),
    record?.path !== expectedPath,
    !regexMatch(HASH, record?.sha256),
  ].some(Boolean)) {
    fail(prefix, "artifact_invalid");
  }
  const bytes = bytesAt(readBytes, record.path, prefix);
  if (sha256(bytes) !== record.sha256) fail(prefix, "artifact_hash_invalid");
  return bytes;
}

function validateAttachment(record, expected, readBytes, prefix) {
  if ([
    !exactKeys(record, ["media_type", "path", "sha256"]),
    record?.path !== expected.path,
    record?.media_type !== expected.media_type,
    !regexMatch(HASH, record?.sha256),
  ].some(Boolean)) {
    fail(prefix, "attachment_invalid");
  }
  const bytes = bytesAt(readBytes, record.path, prefix);
  if (sha256(bytes) !== record.sha256) fail(prefix, "attachment_hash_invalid");
  return bytes;
}

export function validatePhase18AggregateApkIdentity(input) {
  const { manifest, installedApkSha256, ownerReports } = input ?? {};
  if ([
    !validManifest(manifest),
    installedApkSha256 !== manifest?.apk_sha256,
    !Array.isArray(ownerReports),
    ownerReports?.length !== OWNER_SUITES.length,
    !isDeepStrictEqual(ownerReports?.map(({ suite }) => suite), OWNER_SUITES),
  ].some(Boolean)) {
    fail("phase18_aggregate_apk", "identity_invalid");
  }
  for (const report of ownerReports) {
    const ownerManifest = report?.manifest;
    if ([
      !validManifest(ownerManifest),
      !isDeepStrictEqual(ownerManifest, manifest),
      report?.current_identity?.retainedApkSha256 !== undefined
        && report.current_identity.retainedApkSha256 !== manifest.apk_sha256,
      report?.current_identity?.retainedSignatureSha256 !== undefined
        && report.current_identity.retainedSignatureSha256 !== manifest.signature_sha256,
      report?.current_identity?.deviceIdentitySha256 !== undefined
        && report.current_identity.deviceIdentitySha256 !== manifest.device_identity_sha256,
      report?.producer_context?.installed_apk_sha256 !== undefined
        && report.producer_context.installed_apk_sha256 !== installedApkSha256,
    ].some(Boolean)) {
      fail("phase18_aggregate_apk", "identity_invalid");
    }
  }
  return Object.freeze({
    apk_sha256: manifest.apk_sha256,
    installed_apk_sha256: installedApkSha256,
    signature_sha256: manifest.signature_sha256,
    device_identity_sha256: manifest.device_identity_sha256,
  });
}

function junitSummary(bytes) {
  const text = bytes.toString("utf8");
  const value = (name) => Number(text.match(new RegExp(`\\b${name}="(\\d+)"`, "u"))?.[1]);
  const summary = {
    tests: value("tests"),
    failures: value("failures"),
    errors: value("errors"),
    skipped: value("skipped"),
  };
  if (!Object.values(summary).every(Number.isSafeInteger)) {
    fail("phase18_maestro_report", "junit_invalid");
  }
  return summary;
}

export function validatePhase18MaestroReport(report, input) {
  const { manifest, installedApkSha256, readBytes } = input ?? {};
  if ([
    !validManifest(manifest),
    typeof readBytes !== "function",
    !exactKeys(report, [
      "case_ids", "cases", "identity", "producer", "schema_version", "status", "suite",
    ]),
    report?.schema_version !== 1,
    report?.suite !== "phase18-garmin-acceptance",
    report?.producer !== "phase18-maestro/v1",
    report?.status !== "passed",
    !isDeepStrictEqual(report?.case_ids, PHASE18_MAESTRO_CASE_IDS),
    !Array.isArray(report?.cases),
    report?.cases?.length !== PHASE18_MAESTRO_CASE_IDS.length,
    !isDeepStrictEqual(report?.cases?.map(({ id }) => id), PHASE18_MAESTRO_CASE_IDS),
  ].some(Boolean)) {
    fail("phase18_maestro_report", "schema_invalid");
  }
  validateIdentity(report.identity, manifest, installedApkSha256, "phase18_maestro_report");
  const entry = report.cases[0];
  if ([
    !exactKeys(entry, ["artifact", "attachments", "id", "result", "source", "status"]),
    entry?.status !== "passed",
    !exactKeys(entry?.result, ["errors", "failures", "skipped", "tests"]),
    !Array.isArray(entry?.attachments),
    entry?.attachments?.length !== 1,
  ].some(Boolean)) {
    fail("phase18_maestro_report", "case_invalid");
  }
  validateArtifact(entry.source, FLOW_PATH, readBytes, "phase18_maestro_report");
  const junitBytes = validateArtifact(
    entry.artifact,
    JUNIT_PATH,
    readBytes,
    "phase18_maestro_report",
  );
  const observationBytes = validateAttachment(
    entry.attachments[0],
    { path: OBSERVATIONS_PATH, media_type: "application/json" },
    readBytes,
    "phase18_maestro_report",
  );
  const actualJunit = junitSummary(junitBytes);
  if ([
    !isDeepStrictEqual(actualJunit, entry.result),
    actualJunit.tests !== 1,
    actualJunit.failures !== 0,
    actualJunit.errors !== 0,
    actualJunit.skipped !== 0,
  ].some(Boolean)) {
    fail("phase18_maestro_report", "result_invalid");
  }
  let derivedObservations;
  try {
    derivedObservations = JSON.parse(observationBytes.toString("utf8"));
  } catch {
    fail("phase18_maestro_report", "observations_invalid");
  }
  if (!isDeepStrictEqual(derivedObservations, PHASE18_ACCEPTANCE_OBSERVATIONS)) {
    fail("phase18_maestro_report", "observations_invalid");
  }
  return Object.freeze({
    case_count: report.cases.length,
    attachment_count: 1,
    observations: structuredClone(derivedObservations),
    referenced_artifacts: Object.freeze([JUNIT_PATH, OBSERVATIONS_PATH]),
  });
}

function referenceRecords(value, found = []) {
  if (Array.isArray(value)) {
    value.forEach((entry) => referenceRecords(entry, found));
  } else if (value !== null && typeof value === "object") {
    if (typeof value.path === "string" && regexMatch(HASH, value.sha256)) {
      found.push({ path: value.path, sha256: value.sha256 });
    } else {
      Object.values(value).forEach((entry) => referenceRecords(entry, found));
    }
  }
  return found;
}

function scanPrivacyBytes(bytes, allowedPaths, artifactPath) {
  try {
    const parsed = JSON.parse(bytes.toString("utf8"));
    assertPhase18PrivacySafe(parsed, {
      prefix: "phase18_privacy_report_privacy",
      allowString: (entry, context) => allowedPaths.has(entry)
        || context.endsWith("producer_context.kind") && entry === "installed-route-log",
    });
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      const text = artifactPath === FLOW_PATH
        ? bytes.toString("utf8").replace(/\$\{GARMIN_(?:EMAIL|PASSWORD|MFA_CODE)\}/gu, "fixture")
        : bytes.toString("utf8");
      assertPhase18PrivateTextSafe(
        text,
        "phase18_privacy_report_privacy",
      );
      return null;
    }
    throw error;
  }
}

export function validatePhase18PrivacyReport(report, input) {
  const { manifest, installedApkSha256, readBytes } = input ?? {};
  if ([
    !validManifest(manifest),
    typeof readBytes !== "function",
    !exactKeys(report, [
      "case_ids", "cases", "identity", "producer", "schema_version", "status", "suite",
    ]),
    report?.schema_version !== 1,
    report?.suite !== "phase18-garmin-acceptance",
    report?.producer !== "phase18-privacy-scan/v1",
    report?.status !== "passed",
    !isDeepStrictEqual(report?.case_ids, PHASE18_PRIVACY_CASE_IDS),
    !Array.isArray(report?.cases),
    report?.cases?.length !== PHASE18_PRIVACY_CASE_IDS.length,
    !isDeepStrictEqual(report?.cases?.map(({ id }) => id), PHASE18_PRIVACY_CASE_IDS),
  ].some(Boolean)) {
    fail("phase18_privacy_report", "schema_invalid");
  }
  validateIdentity(report.identity, manifest, installedApkSha256, "phase18_privacy_report");
  const expected = [
    { artifact: PROOF_PATH, attachments: [] },
    {
      artifact: ADVERSARIAL_PATH,
      attachments: [{ path: ADVERSARIAL_NATIVE_PATH, media_type: "application/json" }],
    },
    {
      artifact: PHASE18_MAESTRO_REPORT,
      attachments: [
        { path: FLOW_PATH, media_type: "application/yaml" },
        { path: JUNIT_PATH, media_type: "application/xml" },
        { path: OBSERVATIONS_PATH, media_type: "application/json" },
      ],
    },
  ];
  const paths = [];
  const records = [];
  report.cases.forEach((entry, index) => {
    const expectedCase = expected[index];
    if ([
      !exactKeys(entry, ["artifact", "attachments", "id", "status"]),
      entry?.status !== "passed",
      !Array.isArray(entry?.attachments),
      entry?.attachments?.length !== expectedCase.attachments.length,
    ].some(Boolean)) {
      fail("phase18_privacy_report", "case_invalid");
    }
    const artifactBytes = validateArtifact(
      entry.artifact,
      expectedCase.artifact,
      readBytes,
      "phase18_privacy_report",
    );
    records.push({ record: entry.artifact, bytes: artifactBytes });
    paths.push(entry.artifact.path);
    entry.attachments.forEach((attachment, attachmentIndex) => {
      const attachmentBytes = validateAttachment(
        attachment,
        expectedCase.attachments[attachmentIndex],
        readBytes,
        "phase18_privacy_report",
      );
      records.push({ record: attachment, bytes: attachmentBytes });
      paths.push(attachment.path);
    });
  });
  const allowedPaths = new Set(paths);
  assertPhase18PrivacySafe(report, {
    prefix: "phase18_privacy_report_privacy",
    allowString: (entry) => allowedPaths.has(entry),
  });
  for (const [index, { record, bytes }] of records.entries()) {
    const parsed = scanPrivacyBytes(bytes, allowedPaths, record.path);
    if (parsed === null) continue;
    const references = referenceRecords(parsed);
    for (const reference of references) {
      const listed = records.find(({ record: candidate }) => (
        candidate.path === reference.path && candidate.sha256 === reference.sha256
      ));
      if (listed === undefined || records.indexOf(listed) <= index) {
        fail("phase18_privacy_report", "recursive_reference_invalid");
      }
    }
  }
  return Object.freeze({
    case_count: report.cases.length,
    scanned_artifact_count: records.length,
    scanned_paths: Object.freeze(paths),
  });
}
