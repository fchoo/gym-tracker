#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

import {
  PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT,
  PHASE18_GARMIN_ADVERSARIAL_RAW_REPORT,
  createPhase18GarminAdversarialRunnerPlan,
  validatePhase18GarminAdversarialManifest,
} from "./run-phase18-garmin-adversarial.mjs";

const MANIFEST = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/build.json`;
const FINAL_EVIDENCE = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/final-evidence.json`;
const NATIVE_REPORT = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/native-report.json`;
const PRIVACY_REPORT = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/privacy-report.json`;
const HASH = /^[a-f0-9]{64}$/u;
const SAFE_TEXT = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const FORBIDDEN_KEY = /(?:^|_)(?:account_namespace|authorization|ciphertext|cookie|credentials?|device_serial|email|external_activity_id|filename|heart_rate|latitude|longitude|mfa_code|password|raw_json|route|secret|serial|sql_param|token|url)(?:$|_)/iu;
const FORBIDDEN_VALUE = /(?:https?:\/\/|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\bauthorization\b|\bbearer\b|\bciphertext\b|\bcredentials?\b|\bmfa(?:[_ -]?code)?\b|\bpassword\b|\btoken\b)/iu;
const PRIVATE_FILENAME = /(?:^|[\\/])[^\\/]+\.(?:csv|fit|gpx|json|tcx)(?:$|[?#])/iu;
const EXPECTED_CODES = Object.freeze([
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
]);
const EXPECTED_CALLS = Object.freeze([1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 5, 3]);
const EXPECTED_CONNECTIONS = Object.freeze([
  "connected", "connected", "connected", "disconnected", "sign-in-required", "disconnected",
  ...Array.from({ length: 10 }, () => "connected"),
]);
const EXPECTED_SYNC_STATES = Object.freeze([
  "idle",
  "success",
  "success",
  "idle",
  "idle",
  "failure-stale-generation",
  "failure-data-access-denied",
  "failure-rate-limited",
  "failure-offline",
  "failure-timeout",
  "failure-temporary-failure",
  "failure-malformed-response",
  "failure-malformed-response",
  "failure-malformed-response",
  "partial-temporary-failure",
  "failure-stale-generation",
]);
const CASE_KEYS = Object.freeze([
  "automatic_retry_count",
  "call_count",
  "code",
  "connection_state",
  "duration_ms",
  "generation_after",
  "generation_before",
  "history_digest",
  "id",
  "match_digest",
  "provenance",
  "retry_after_ms",
  "session_digest",
  "source_digest",
  "source_write_count",
  "stage",
  "status",
  "sync_state",
]);

const fail = (code) => {
  throw new Error(`phase18_garmin_adversarial_evidence_${code}`);
};

function exactKeys(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

export function assertPhase18GarminAdversarialPrivacySafe(value, context = "") {
  if (typeof value === "string") {
    const fixedPath = context === "native_report.path" && value === NATIVE_REPORT;
    if (!fixedPath && (FORBIDDEN_VALUE.test(value) || PRIVATE_FILENAME.test(value))) {
      fail("privacy_invalid");
    }
    return true;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPhase18GarminAdversarialPrivacySafe(entry, `${context}[${index}]`));
    return true;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) fail("privacy_invalid");
      assertPhase18GarminAdversarialPrivacySafe(entry, context.length === 0 ? key : `${context}.${key}`);
    }
  }
  return true;
}

function validInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function expectedStage(id) {
  return id.toLowerCase().replaceAll("ph18-adv-", "").replaceAll("-", "_");
}

function validateCase(entry, id, index) {
  if (
    !exactKeys(entry, CASE_KEYS)
    || entry.id !== id
    || !["passed", "TECHNICAL_REVIEW_REQUIRED"].includes(entry.status)
    || !["native-exact-artifact", "unexpected"].includes(entry.provenance)
    || !SAFE_TEXT.test(entry.stage ?? "")
    || !SAFE_TEXT.test(entry.code ?? "")
    || !SAFE_TEXT.test(entry.connection_state ?? "")
    || !SAFE_TEXT.test(entry.sync_state ?? "")
    || !validInteger(entry.duration_ms, 24 * 60 * 60 * 1_000)
    || !validInteger(entry.call_count, 100)
    || !validInteger(entry.automatic_retry_count, 10)
    || !validInteger(entry.retry_after_ms, 900_000)
    || !validInteger(entry.source_write_count, 100)
    || !validInteger(entry.generation_before)
    || !validInteger(entry.generation_after)
    || !HASH.test(entry.session_digest ?? "")
    || !HASH.test(entry.history_digest ?? "")
    || !HASH.test(entry.source_digest ?? "")
    || !HASH.test(entry.match_digest ?? "")
    || entry.call_count !== EXPECTED_CALLS[index]
    || entry.automatic_retry_count !== 0
    || entry.retry_after_ms !== (id === "PH18-ADV-429" ? 900_000 : 0)
    || entry.source_write_count !== 0
    || entry.connection_state !== EXPECTED_CONNECTIONS[index]
    || entry.sync_state !== EXPECTED_SYNC_STATES[index]
  ) fail("case_invalid");

  if (entry.status === "passed") {
    if (
      entry.provenance !== "native-exact-artifact"
      || entry.stage !== expectedStage(id)
      || entry.code !== EXPECTED_CODES[index]
    ) fail("case_invalid");
  } else if (entry.provenance !== "unexpected") {
    fail("case_invalid");
  }
}

function validateDigestAndGenerationRelationships(cases) {
  const [first] = cases;
  if (first === undefined) fail("case_invalid");
  for (const entry of cases) {
    if (
      entry.history_digest !== first.history_digest
      || entry.source_digest !== first.source_digest
      || entry.match_digest !== first.match_digest
    ) fail("case_invalid");
  }
  if (
    cases[0].session_digest === cases[1].session_digest
    || cases[1].session_digest !== cases[2].session_digest
    || cases[3].session_digest !== cases[4].session_digest
    || cases[4].session_digest !== cases[5].session_digest
    || cases[2].session_digest === cases[3].session_digest
    || cases.slice(7).some((entry) => entry.session_digest !== cases[6].session_digest)
    || cases[3].generation_after <= cases[3].generation_before
    || cases[5].generation_after <= cases[5].generation_before
    || cases.some((entry, index) => index !== 3 && index !== 5
      && entry.generation_after !== entry.generation_before)
  ) fail("case_invalid");
}

function selfValidateManifest(manifest) {
  return validatePhase18GarminAdversarialManifest(manifest, {
    currentHead: manifest?.base_head,
    currentSourceTreeSha256: manifest?.source_tree_sha256,
    currentPythonLockSha256: manifest?.python_lock_sha256,
    retainedApkSha256: manifest?.apk_sha256,
    retainedSignatureSha256: manifest?.signature_sha256,
    deviceIdentitySha256: manifest?.device_identity_sha256,
  });
}

export function validatePhase18GarminAdversarialEvidence(evidence) {
  assertPhase18GarminAdversarialPrivacySafe(evidence);
  if (
    !exactKeys(evidence, [
      "case_ids",
      "cases",
      "manifest",
      "native_report",
      "privacy_scan",
      "schema_version",
      "status",
      "suite",
    ])
    || evidence.schema_version !== 1
    || evidence.suite !== "phase18-garmin-adversarial"
    || !["passed", "TECHNICAL_REVIEW_REQUIRED"].includes(evidence.status)
    || !Array.isArray(evidence.case_ids)
    || !Array.isArray(evidence.cases)
  ) fail("schema_invalid");
  const plan = createPhase18GarminAdversarialRunnerPlan();
  if (
    !isDeepStrictEqual(evidence.case_ids, plan.case_ids)
    || evidence.cases.length !== plan.case_ids.length
    || !isDeepStrictEqual(evidence.cases.map(({ id }) => id), plan.case_ids)
  ) fail("case_order_invalid");
  selfValidateManifest(evidence.manifest);
  if (
    !exactKeys(evidence.native_report, ["path", "sha256"])
    || evidence.native_report.path !== NATIVE_REPORT
    || !HASH.test(evidence.native_report.sha256 ?? "")
    || !exactKeys(evidence.privacy_scan, ["report_sha256", "scanned_artifact_count", "status"])
    || evidence.privacy_scan.status !== "passed"
    || !validInteger(evidence.privacy_scan.scanned_artifact_count, 100)
    || evidence.privacy_scan.scanned_artifact_count < 1
    || !HASH.test(evidence.privacy_scan.report_sha256 ?? "")
  ) fail("identity_invalid");
  evidence.cases.forEach((entry, index) => validateCase(entry, plan.case_ids[index], index));
  validateDigestAndGenerationRelationships(evidence.cases);
  const expectedStatus = evidence.cases.some(({ status }) => status === "TECHNICAL_REVIEW_REQUIRED")
    ? "TECHNICAL_REVIEW_REQUIRED"
    : "passed";
  if (evidence.status !== expectedStatus) fail("case_invalid");
  return Object.freeze({ status: expectedStatus, cases: evidence.cases.length });
}

export function validatePhase18GarminAdversarialCurrentIdentity(evidence, current) {
  const manifest = evidence?.manifest;
  if (
    manifest?.base_head !== current.currentHead
    || manifest?.source_tree_sha256 !== current.currentSourceTreeSha256
    || manifest?.python_lock_sha256 !== current.currentPythonLockSha256
    || manifest?.apk_sha256 !== current.retainedApkSha256
    || manifest?.apk_sha256 !== current.installedApkSha256
    || manifest?.signature_sha256 !== current.retainedSignatureSha256
    || manifest?.device_identity_sha256 !== current.deviceIdentitySha256
    || evidence?.native_report?.sha256 !== current.nativeReportSha256
    || evidence?.privacy_scan?.report_sha256 !== current.privacyReportSha256
  ) fail("current_identity_invalid");
  return true;
}

function parseVerifierArgs(args) {
  const options = { manifest: "", seal: false, phase20Checkpoint: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") options.manifest = args[++index] ?? "";
    else if (argument === "--seal") options.seal = true;
    else if (argument === "--phase20-native-checkpoint") options.phase20Checkpoint = true;
    else fail("arguments_invalid");
  }
  if (
    options.manifest !== MANIFEST
    || options.seal !== options.phase20Checkpoint
  ) fail("arguments_invalid");
  return options;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeFinalEvidence(evidence) {
  writeFileSync(FINAL_EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
}

export function executePhase18GarminAdversarialVerifier(
  args = process.argv.slice(2),
  dependencies = {},
) {
  const options = parseVerifierArgs(args);
  const jsonReader = dependencies.readJson ?? readJson;
  const bytesReader = dependencies.readBytes ?? readFileSync;
  const finalWriter = dependencies.writeFinalEvidence ?? writeFinalEvidence;
  const manifest = jsonReader(MANIFEST);
  const evidence = jsonReader(PHASE18_GARMIN_ADVERSARIAL_RAW_REPORT);
  if (!isDeepStrictEqual(evidence?.manifest, manifest)) fail("report_identity_invalid");
  const nativeReportSha256 = createHash("sha256").update(bytesReader(NATIVE_REPORT)).digest("hex");
  const privacyReportSha256 = createHash("sha256").update(bytesReader(PRIVACY_REPORT)).digest("hex");
  if (evidence?.native_report?.sha256 !== nativeReportSha256
    || evidence?.privacy_scan?.report_sha256 !== privacyReportSha256) {
    fail("report_identity_invalid");
  }
  const result = validatePhase18GarminAdversarialEvidence(evidence);
  if (options.seal) finalWriter(evidence, FINAL_EVIDENCE);
  return Object.freeze({ ...result, final_evidence_written: options.seal });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase18GarminAdversarialVerifier())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "phase18_garmin_adversarial_verifier_failed"}\n`);
    process.exitCode = 1;
  }
}
