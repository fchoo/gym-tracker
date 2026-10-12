#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { PHASE18_GARMIN_PROOF_CASE_IDS } from "../src/testing/phase18GarminProof.ts";
import {
  PHASE18_GARMIN_PROOF_APK,
  PHASE18_GARMIN_PROOF_ARTIFACT_ROOT,
  PHASE18_GARMIN_PROOF_RAW_REPORT,
  sanitizePhase18GarminProofBuildManifest,
  validatePhase18GarminProofBuildManifest,
} from "./run-phase18-garmin-proof.mjs";
import { assertPhase18PrivacySafe } from "./phase18-privacy-scan.mjs";
import {
  cliArgValue,
  errorMessage,
  exactKeys,
  firstDefined,
  regexMatch,
  runCliIfMain,
} from "./node-evidence-utils.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";

const ROOT = process.cwd();
const MANIFEST = `${PHASE18_GARMIN_PROOF_ARTIFACT_ROOT}/build.json`;
const FINAL_EVIDENCE = `${PHASE18_GARMIN_PROOF_ARTIFACT_ROOT}/final-evidence.json`;
const PYTHON_LOCK = "modules/garmin-connect/python/garmin-python-lock.json";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const HASH = /^[a-f0-9]{64}$/u;
const SAFE_FAILURE_CODES = new Set([
  "arguments_rejected",
  "data_access_denied",
  "invalid_credentials",
  "malformed_response",
  "mfa_expired",
  "offline",
  "operation_rejected",
  "packaging_failed",
  "privacy_scan_failed",
  "rate_limited",
  "sign_in_required",
  "stale_generation",
  "temporary_failure",
  "timeout",
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code) => {
  throw new Error(`phase18_evidence_${code}`);
};

function privacySafe(value, location = "evidence") {
  assertPhase18PrivacySafe(value, {
    prefix: "phase18_evidence_privacy",
    context: location,
  });
}

function validateManifestShape(manifest) {
  validatePhase18GarminProofBuildManifest(manifest, {
    currentHead: manifest?.base_head,
    currentSourceTreeSha256: manifest?.source_tree_sha256,
    currentPythonLockSha256: manifest?.python_lock_sha256,
    retainedApkSha256: manifest?.apk_sha256,
    retainedSignatureSha256: manifest?.signature_sha256,
    deviceIdentitySha256: manifest?.device_identity_sha256,
  });
}

function validateDuration(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 24 * 60 * 60 * 1_000) {
    fail("case_duration_invalid");
  }
}

function validatePassedCase(entry, id) {
  let keys = ["duration_ms", "id", "status"];
  if (id === "PH18-PKG") keys = [...keys, "result_sha256"];
  else if (id === "PH18-MFA") keys = [...keys, "outcome"];
  else if (["PH18-READ", "PH18-REFRESH", "PH18-PRIVACY"].includes(id)) {
    keys = [...keys, "count", "result_sha256"];
  }
  const invalid = [
    !exactKeys(entry, keys),
    entry.id !== id,
    entry.status !== "passed",
  ].some(Boolean);
  if (invalid) fail(`case_invalid:${id}`);
  validateDuration(entry.duration_ms);
  if (keys.includes("result_sha256") && !regexMatch(HASH, entry.result_sha256)) {
    fail(`case_invalid:${id}`);
  }
  if (keys.includes("count") && entry.count !== 1) fail(`case_invalid:${id}`);
  if (
    id === "PH18-MFA"
    && !["completed", "not_requested"].includes(entry.outcome)
  ) fail(`case_invalid:${id}`);
}

function validateTechnicalReviewCase(entry, id) {
  const invalid = [
    !exactKeys(entry, ["code", "duration_ms", "id", "status"]),
    entry.id !== id,
    entry.status !== "TECHNICAL_REVIEW_REQUIRED",
    !SAFE_FAILURE_CODES.has(entry.code),
  ].some(Boolean);
  if (invalid) fail(`case_invalid:${id}`);
  validateDuration(entry.duration_ms);
}

function validateStandalone(value) {
  const invalid = [
    !exactKeys(value, [
      "downloaded_scripts",
      "embedded_js",
      "external_python",
      "metro",
      "runtime_agent",
    ]),
    value.embedded_js !== true,
    value.external_python !== false,
    value.metro !== false,
    value.downloaded_scripts !== false,
    value.runtime_agent !== false,
  ].some(Boolean);
  if (invalid) fail("standalone_invalid");
}

function validatePrivacyScan(value, review) {
  const notRun = value?.status === "not_run";
  if (notRun) {
    const invalidNotRun = [
      !review,
      !exactKeys(value, ["scanned_artifact_count", "status"]),
      value.scanned_artifact_count !== 0,
    ].some(Boolean);
    if (invalidNotRun) fail("privacy_scan_invalid");
    return;
  }
  const invalid = [
    !exactKeys(value, ["report_sha256", "scanned_artifact_count", "status"]),
    value.status !== "passed",
    !Number.isSafeInteger(value.scanned_artifact_count),
    value.scanned_artifact_count < 1,
    value.scanned_artifact_count > 100,
    !regexMatch(HASH, value.report_sha256),
  ].some(Boolean);
  if (invalid) fail("privacy_scan_invalid");
}

export function validatePhase18GarminProofEvidence(evidence) {
  privacySafe(evidence);
  const review = evidence?.status === "TECHNICAL_REVIEW_REQUIRED";
  const topKeys = [
    "case_ids",
    "cases",
    "manifest",
    "privacy_scan",
    "raw_report_sha256",
    "schema_version",
    "standalone",
    "status",
    "suite",
    ...(review ? ["failure_code", "failure_stage"] : []),
  ];
  const invalidSchema = [
    !exactKeys(evidence, topKeys),
    evidence.schema_version !== 1,
    evidence.suite !== "phase18-garmin-proof",
    !["passed", "TECHNICAL_REVIEW_REQUIRED"].includes(evidence.status),
    !Array.isArray(evidence.case_ids),
    !isDeepStrictEqual(evidence.case_ids, PHASE18_GARMIN_PROOF_CASE_IDS),
    !Array.isArray(evidence.cases),
    !regexMatch(HASH, evidence.raw_report_sha256),
  ].some(Boolean);
  if (invalidSchema) fail("schema_invalid");
  validateManifestShape(evidence.manifest);
  validateStandalone(evidence.standalone);
  validatePrivacyScan(evidence.privacy_scan, review);

  if (!review) {
    if (evidence.cases.length !== PHASE18_GARMIN_PROOF_CASE_IDS.length) {
      fail("case_count_invalid");
    }
    evidence.cases.forEach((entry, index) => {
      validatePassedCase(entry, PHASE18_GARMIN_PROOF_CASE_IDS[index]);
    });
    return Object.freeze({ status: "passed", cases: evidence.cases.length });
  }

  if ([evidence.cases.length < 1, evidence.cases.length > PHASE18_GARMIN_PROOF_CASE_IDS.length].some(Boolean)) {
    fail("case_count_invalid");
  }
  const lastIndex = evidence.cases.length - 1;
  evidence.cases.forEach((entry, index) => {
    const expectedId = PHASE18_GARMIN_PROOF_CASE_IDS[index];
    if (index === lastIndex) validateTechnicalReviewCase(entry, expectedId);
    else validatePassedCase(entry, expectedId);
  });
  const failure = evidence.cases[lastIndex];
  if ([failure.id !== evidence.failure_stage, failure.code !== evidence.failure_code].some(Boolean)) {
    fail("failure_classification_invalid");
  }
  return Object.freeze({
    status: "TECHNICAL_REVIEW_REQUIRED",
    cases: evidence.cases.length,
    stage: failure.id,
    code: failure.code,
  });
}

export function validatePhase18GarminProofCurrentIdentity(evidence, current) {
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
  ].some(Boolean);
  if (invalid) fail("current_identity_invalid");
  return true;
}

export function createPhase18GarminProofFinalEvidence(input) {
  privacySafe(input.report);
  if (!isDeepStrictEqual(input.manifest, input.report?.manifest)) {
    fail("report_identity_invalid");
  }
  const review = input.report?.status === "TECHNICAL_REVIEW_REQUIRED";
  const reportKeys = [
    "cases",
    "manifest",
    "privacy_scan",
    "schema_version",
    "standalone",
    "status",
    "suite",
    ...(review ? ["failure_code", "failure_stage"] : []),
  ];
  if (!exactKeys(input.report, reportKeys)) fail("report_schema_invalid");
  const evidence = Object.freeze({
    ...input.report,
    case_ids: PHASE18_GARMIN_PROOF_CASE_IDS,
    raw_report_sha256: sha256(input.rawReportBytes),
  });
  validatePhase18GarminProofEvidence(evidence);
  return evidence;
}

export function parsePhase18GarminProofVerifierArgs(args) {
  const options = {
    manifest: "",
    seal: false,
    phase20Checkpoint: false,
  };
  let sealCount = 0;
  let checkpointCount = 0;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") options.manifest = cliArgValue(args, ++index);
    else if (argument === "--seal") {
      sealCount += 1;
      options.seal = true;
    } else if (argument === "--phase20-native-checkpoint") {
      checkpointCount += 1;
      options.phase20Checkpoint = true;
    } else throw new Error(`phase18_verifier_unknown_argument:${argument}`);
  }
  if (
    options.manifest !== MANIFEST
    || sealCount > 1
    || checkpointCount > 1
    || options.seal !== options.phase20Checkpoint
  ) throw new Error("phase18_verifier_arguments_invalid");
  return Object.freeze(options);
}

function readRegularFile(relativePath, code) {
  const absolutePath = path.resolve(ROOT, relativePath);
  if (!existsSync(absolutePath) || lstatSync(absolutePath).isSymbolicLink()) {
    fail(`${code}_missing`);
  }
  return readFileSync(absolutePath);
}

function command(program, args, options = {}) {
  return execFileSync(program, args, {
    cwd: ROOT,
    maxBuffer: 512 * 1024 * 1024,
    ...options,
  });
}

function commandText(program, args) {
  return command(program, args, { encoding: "utf8" }).trim();
}

function androidSdk() {
  const sdk = firstDefined(process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT);
  if (sdk === undefined) fail("android_sdk_missing");
  return sdk;
}

function resolveAdb() {
  const adb = path.join(androidSdk(), "platform-tools", "adb");
  if (!existsSync(adb)) fail("adb_missing");
  return adb;
}

function resolveApksigner() {
  const root = path.join(androidSdk(), "build-tools");
  const candidates = existsSync(root)
    ? readdirSync(root)
      .map((version) => path.join(root, version, "apksigner"))
      .filter((candidate) => existsSync(candidate))
      .sort()
    : [];
  const executable = candidates.at(-1);
  if (executable === undefined) fail("apksigner_missing");
  return executable;
}

function retainedSignatureSha256(apkPath) {
  const output = commandText(resolveApksigner(), [
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

function installedIdentity() {
  const adb = resolveAdb();
  const devices = commandText(adb, ["devices"])
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/u))
    .filter(([, state]) => state === "device");
  if (devices.length !== 1 || devices[0]?.[0] === undefined) {
    fail("device_selection_invalid");
  }
  const serial = devices[0][0];
  const adbText = (...args) => commandText(adb, ["-s", serial, ...args]);
  const abi = adbText("shell", "getprop", "ro.product.cpu.abi");
  const apiLevel = adbText("shell", "getprop", "ro.build.version.sdk");
  const model = adbText("shell", "getprop", "ro.product.model");
  const installedPath = adbText("shell", "pm", "path", PACKAGE).replace(/^package:/u, "");
  if (abi !== "arm64-v8a" || !installedPath.startsWith("/data/app/")) {
    fail("installed_identity_invalid");
  }
  const installedBytes = command(adb, [
    "-s",
    serial,
    "exec-out",
    "cat",
    installedPath,
  ]);
  return Object.freeze({
    installedApkSha256: sha256(installedBytes),
    deviceIdentitySha256: phase18DeviceIdentitySha256({ serial, abi, apiLevel, model }),
  });
}

export function resolvePhase18GarminProofCurrentIdentity(rawReportBytes) {
  const apkPath = path.resolve(ROOT, PHASE18_GARMIN_PROOF_APK);
  const apkBytes = readRegularFile(PHASE18_GARMIN_PROOF_APK, "apk");
  return Object.freeze({
    currentHead: commandText("git", ["rev-parse", "HEAD"]),
    currentSourceTreeSha256: sourceTreeSha256(ROOT),
    currentPythonLockSha256: sha256(readRegularFile(PYTHON_LOCK, "python_lock")),
    retainedApkSha256: sha256(apkBytes),
    retainedSignatureSha256: retainedSignatureSha256(apkPath),
    rawReportSha256: sha256(rawReportBytes),
    ...installedIdentity(),
  });
}

export function executePhase18GarminProofVerifier(args = process.argv.slice(2), dependencies = {}) {
  const options = parsePhase18GarminProofVerifierArgs(args);
  const readRequired = dependencies.readRegularFile ?? readRegularFile;
  const resolveCurrentIdentity = dependencies.currentIdentity ?? resolvePhase18GarminProofCurrentIdentity;
  const fileWriter = dependencies.writeFileSync ?? writeFileSync;
  const retainedManifest = JSON.parse(
    readRequired(options.manifest, "manifest").toString("utf8"),
  );
  const rawReportBytes = readRequired(PHASE18_GARMIN_PROOF_RAW_REPORT, "raw_report");
  const identity = resolveCurrentIdentity(rawReportBytes);
  const manifest = sanitizePhase18GarminProofBuildManifest(retainedManifest, {
    currentPythonLockSha256: identity.currentPythonLockSha256,
    retainedSignatureSha256: identity.retainedSignatureSha256,
  });
  let evidence;
  if (options.seal) {
    const report = JSON.parse(rawReportBytes.toString("utf8"));
    evidence = createPhase18GarminProofFinalEvidence({
      manifest,
      report,
      rawReportBytes,
    });
    validatePhase18GarminProofCurrentIdentity(
      evidence,
      identity,
    );
    fileWriter(
      path.resolve(ROOT, FINAL_EVIDENCE),
      `${JSON.stringify(evidence, null, 2)}\n`,
      { flag: "wx" },
    );
  } else {
    evidence = JSON.parse(readRequired(FINAL_EVIDENCE, "final").toString("utf8"));
    validatePhase18GarminProofEvidence(evidence);
    if (!isDeepStrictEqual(evidence.manifest, manifest)) {
      fail("report_identity_invalid");
    }
    validatePhase18GarminProofCurrentIdentity(
      evidence,
      identity,
    );
  }
  return validatePhase18GarminProofEvidence(evidence);
}

export function executePhase18GarminProofVerifierCli(dependencies = {}) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase18GarminProofVerifier(process.argv.slice(2), dependencies))}\n`);
  } catch (error) {
    process.stderr.write(`${errorMessage(error, "phase18_evidence_failed")}\n`);
    process.exitCode = 1;
  }
}

runCliIfMain(import.meta.url, process.argv[1], executePhase18GarminProofVerifierCli);
