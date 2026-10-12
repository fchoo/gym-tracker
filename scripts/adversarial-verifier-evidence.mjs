#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT,
  PHASE18_GARMIN_ADVERSARIAL_RAW_REPORT,
  createPhase18GarminAdversarialRunnerPlan,
  validatePhase18GarminAdversarialManifest,
} from "./run-phase18-garmin-adversarial.mjs";
import { assertPhase18PrivacySafe } from "./phase18-privacy-scan.mjs";
import { sanitizePhase18BuildManifest } from "./phase18-build-manifest.mjs";
import {
  choose,
  cliArgValue,
  errorMessage,
  exactKeys,
  firstDefined,
  regexMatch,
  runCliIfMain,
} from "./node-evidence-utils.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";
import { pullInstalledApkSha256 } from "./phase18-installed-apk.mjs";

const MANIFEST = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/build.json`;
const FINAL_EVIDENCE = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/final-evidence.json`;
const NATIVE_REPORT = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/native-report.json`;
const PRIVACY_REPORT = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/privacy-report.json`;
const PYTHON_LOCK = "modules/garmin-connect/python/garmin-python-lock.json";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const HASH = /^[a-f0-9]{64}$/u;
const SAFE_TEXT = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
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

export function assertPhase18GarminAdversarialPrivacySafe(value, context = "") {
  return assertPhase18PrivacySafe(value, {
    prefix: "phase18_garmin_adversarial_evidence_privacy",
    context,
    allowString: (entry, entryContext) => entryContext === "native_report.path" && entry === NATIVE_REPORT,
  });
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
    || !regexMatch(SAFE_TEXT, entry.stage)
    || !regexMatch(SAFE_TEXT, entry.code)
    || !regexMatch(SAFE_TEXT, entry.connection_state)
    || !regexMatch(SAFE_TEXT, entry.sync_state)
    || !validInteger(entry.duration_ms, 24 * 60 * 60 * 1_000)
    || !validInteger(entry.call_count, 100)
    || !validInteger(entry.automatic_retry_count, 10)
    || !validInteger(entry.retry_after_ms, 900_000)
    || !validInteger(entry.source_write_count, 100)
    || !validInteger(entry.generation_before)
    || !validInteger(entry.generation_after)
    || !regexMatch(HASH, entry.session_digest)
    || !regexMatch(HASH, entry.history_digest)
    || !regexMatch(HASH, entry.source_digest)
    || !regexMatch(HASH, entry.match_digest)
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
  const invalidSchema = [
    !exactKeys(evidence, [
      "case_ids",
      "cases",
      "manifest",
      "native_report",
      "privacy_scan",
      "raw_report_sha256",
      "schema_version",
      "status",
      "suite",
    ]),
    evidence.schema_version !== 1,
    evidence.suite !== "phase18-garmin-adversarial",
    !["passed", "TECHNICAL_REVIEW_REQUIRED"].includes(evidence.status),
    !Array.isArray(evidence.case_ids),
    !Array.isArray(evidence.cases),
    !regexMatch(HASH, evidence.raw_report_sha256),
  ].some(Boolean);
  if (invalidSchema) fail("schema_invalid");
  const plan = createPhase18GarminAdversarialRunnerPlan();
  const invalidOrder = [
    !isDeepStrictEqual(evidence.case_ids, plan.case_ids),
    evidence.cases.length !== plan.case_ids.length,
    !isDeepStrictEqual(evidence.cases.map(({ id }) => id), plan.case_ids),
  ].some(Boolean);
  if (invalidOrder) fail("case_order_invalid");
  selfValidateManifest(evidence.manifest);
  const invalidIdentity = [
    !exactKeys(evidence.native_report, ["path", "sha256"]),
    evidence.native_report.path !== NATIVE_REPORT,
    !regexMatch(HASH, evidence.native_report.sha256),
    !exactKeys(evidence.privacy_scan, ["report_sha256", "scanned_artifact_count", "status"]),
    evidence.privacy_scan.status !== "passed",
    !validInteger(evidence.privacy_scan.scanned_artifact_count, 100),
    evidence.privacy_scan.scanned_artifact_count < 1,
    !regexMatch(HASH, evidence.privacy_scan.report_sha256),
  ].some(Boolean);
  if (invalidIdentity) fail("identity_invalid");
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
  const invalid = [
    manifest?.base_head !== current.currentHead,
    manifest?.source_tree_sha256 !== current.currentSourceTreeSha256,
    manifest?.python_lock_sha256 !== current.currentPythonLockSha256,
    manifest?.apk_sha256 !== current.retainedApkSha256,
    manifest?.apk_sha256 !== current.installedApkSha256,
    manifest?.signature_sha256 !== current.retainedSignatureSha256,
    manifest?.device_identity_sha256 !== current.deviceIdentitySha256,
    evidence?.raw_report_sha256 !== current.rawReportSha256,
    evidence?.native_report?.sha256 !== current.nativeReportSha256,
    evidence?.privacy_scan?.report_sha256 !== current.privacyReportSha256,
  ].some(Boolean);
  if (invalid) fail("current_identity_invalid");
  return true;
}

function command(program, args, options = {}) {
  return execFileSync(program, args, {
    cwd: process.cwd(),
    maxBuffer: 512 * 1024 * 1024,
    ...options,
  });
}

function commandText(program, args) {
  return command(program, args, { encoding: "utf8" }).trim();
}

function resolveAndroidTool(name) {
  const sdk = firstDefined(process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT);
  if (sdk === undefined) fail("android_sdk_missing");
  if (name === "adb") {
    const executable = path.join(sdk, "platform-tools", "adb");
    if (!existsSync(executable)) fail("adb_missing");
    return executable;
  }
  const buildTools = path.join(sdk, "build-tools");
  const candidates = existsSync(buildTools)
    ? readdirSync(buildTools)
      .map((version) => path.join(buildTools, version, name))
      .filter((candidate) => existsSync(candidate))
      .sort()
    : [];
  const executable = candidates.at(-1);
  if (executable === undefined) fail(`${name}_missing`);
  return executable;
}

function retainedSignatureSha256(apkPath) {
  const output = commandText(resolveAndroidTool("apksigner"), [
    "verify",
    "--print-certs",
    apkPath,
  ]);
  const match = output.match(/certificate SHA-256 digest:\s*([A-Fa-f0-9:]{64,95})/u);
  if (match?.[1] === undefined) fail("signature_unreadable");
  const digest = match[1].replaceAll(":", "").toLowerCase();
  if (!HASH.test(digest)) fail("signature_unreadable");
  return digest;
}

function installedIdentity(expectedByteCount) {
  const adb = resolveAndroidTool("adb");
  const devices = commandText(adb, ["devices"])
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/u))
    .filter(([, state]) => state === "device");
  if (devices.length !== 1 || devices[0]?.[0] === undefined) fail("device_selection_invalid");
  const serial = devices[0][0];
  const adbText = (...args) => commandText(adb, ["-s", serial, ...args]);
  const abi = adbText("shell", "getprop", "ro.product.cpu.abi");
  const apiLevel = adbText("shell", "getprop", "ro.build.version.sdk");
  const model = adbText("shell", "getprop", "ro.product.model");
  const installedPath = adbText("shell", "pm", "path", PACKAGE).replace(/^package:/u, "");
  if (abi !== "arm64-v8a" || !installedPath.startsWith("/data/app/")) fail("installed_identity_invalid");
  return Object.freeze({
    installedApkSha256: pullInstalledApkSha256({
      adb,
      serial,
      installedPath,
      expectedByteCount,
    }),
    deviceIdentitySha256: phase18DeviceIdentitySha256({ serial, abi, apiLevel, model }),
  });
}

export function resolvePhase18GarminAdversarialCurrentIdentity(
  rawReportBytes = readFileSync(PHASE18_GARMIN_ADVERSARIAL_RAW_REPORT),
) {
  const apkPath = path.resolve(process.cwd(), `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-adversarial-devtest.apk`);
  const apkBytes = readFileSync(apkPath);
  return Object.freeze({
    currentHead: commandText("git", ["rev-parse", "HEAD"]),
    currentSourceTreeSha256: sourceTreeSha256(process.cwd()),
    currentPythonLockSha256: createHash("sha256").update(readFileSync(PYTHON_LOCK)).digest("hex"),
    retainedApkSha256: createHash("sha256").update(apkBytes).digest("hex"),
    retainedSignatureSha256: retainedSignatureSha256(apkPath),
    ...installedIdentity(apkBytes.length),
    rawReportSha256: createHash("sha256").update(rawReportBytes).digest("hex"),
    nativeReportSha256: createHash("sha256").update(readFileSync(NATIVE_REPORT)).digest("hex"),
    privacyReportSha256: createHash("sha256").update(readFileSync(PRIVACY_REPORT)).digest("hex"),
  });
}

function parseVerifierArgs(args) {
  const options = { manifest: "", seal: false, phase20Checkpoint: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") options.manifest = cliArgValue(args, ++index);
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

export function createPhase18GarminAdversarialFinalEvidence(input) {
  assertPhase18GarminAdversarialPrivacySafe(input.report);
  if (!isDeepStrictEqual(input.manifest, input.report?.manifest)) {
    fail("report_identity_invalid");
  }
  if (!exactKeys(input.report, [
    "case_ids",
    "cases",
    "manifest",
    "native_report",
    "privacy_scan",
    "schema_version",
    "status",
    "suite",
  ])) fail("report_schema_invalid");
  const evidence = Object.freeze({
    ...input.report,
    raw_report_sha256: createHash("sha256").update(input.rawReportBytes).digest("hex"),
  });
  validatePhase18GarminAdversarialEvidence(evidence);
  return evidence;
}

export function executePhase18GarminAdversarialVerifier(
  args = process.argv.slice(2),
  dependencies = {},
) {
  const options = parseVerifierArgs(args);
  const jsonReader = choose(dependencies.readJson, readJson);
  const bytesReader = choose(dependencies.readBytes, readFileSync);
  const finalWriter = choose(dependencies.writeFinalEvidence, writeFinalEvidence);
  const retainedManifest = jsonReader(MANIFEST);
  const persistedFinalEvidence = options.seal ? undefined : jsonReader(FINAL_EVIDENCE);
  const rawReportBytes = bytesReader(PHASE18_GARMIN_ADVERSARIAL_RAW_REPORT);
  const current = choose(
    dependencies.resolveCurrentIdentity,
    resolvePhase18GarminAdversarialCurrentIdentity,
  )(rawReportBytes);
  const manifest = sanitizePhase18BuildManifest(retainedManifest, {
    suite: "phase18-garmin-adversarial",
    pythonLockSha256: current.currentPythonLockSha256,
    signatureSha256: current.retainedSignatureSha256,
  });
  const evidence = options.seal
    ? createPhase18GarminAdversarialFinalEvidence({
      manifest,
      report: JSON.parse(Buffer.from(rawReportBytes).toString("utf8")),
      rawReportBytes,
    })
    : persistedFinalEvidence;
  if (!isDeepStrictEqual(evidence?.manifest, manifest)) fail("report_identity_invalid");
  const nativeReportSha256 = createHash("sha256").update(bytesReader(NATIVE_REPORT)).digest("hex");
  const privacyReportSha256 = createHash("sha256").update(bytesReader(PRIVACY_REPORT)).digest("hex");
  if (evidence?.native_report?.sha256 !== nativeReportSha256
    || evidence?.privacy_scan?.report_sha256 !== privacyReportSha256) {
    fail("report_identity_invalid");
  }
  const result = validatePhase18GarminAdversarialEvidence(evidence);
  validatePhase18GarminAdversarialCurrentIdentity(evidence, current);
  if (options.seal) finalWriter(evidence, FINAL_EVIDENCE);
  return Object.freeze({ ...result, final_evidence_written: options.seal });
}

export function executePhase18GarminAdversarialVerifierCli(dependencies = {}) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase18GarminAdversarialVerifier(process.argv.slice(2), dependencies))}\n`);
  } catch (error) {
    process.stderr.write(`${errorMessage(error, "phase18_garmin_adversarial_verifier_failed")}\n`);
    process.exitCode = 1;
  }
}

runCliIfMain(import.meta.url, process.argv[1], executePhase18GarminAdversarialVerifierCli);
