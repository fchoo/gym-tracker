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
import { pathToFileURL } from "node:url";

import { PHASE18_GARMIN_PROOF_CASE_IDS } from "../src/testing/phase18GarminProof.ts";
import {
  PHASE18_GARMIN_PROOF_APK,
  PHASE18_GARMIN_PROOF_ARTIFACT_ROOT,
  PHASE18_GARMIN_PROOF_RAW_REPORT,
  validatePhase18GarminProofBuildManifest,
} from "./run-phase18-garmin-proof.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";

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
  "rate_limited",
  "sign_in_required",
  "stale_generation",
  "temporary_failure",
  "timeout",
]);
const FORBIDDEN_KEY = /(?:account|activity[_-]?id|authorization|body[_-]?weight|cookie|credential|email|file[_-]?name|heart[_-]?rate|latitude|longitude|mfa[_-]?code|password|route|secret|sql[_-]?param|token|url)/iu;
const FORBIDDEN_VALUE = /(?:https?:\/\/|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/iu;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code) => {
  throw new Error(`phase18_evidence_${code}`);
};

function exactKeys(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function privacySafe(value, location = "evidence") {
  if (typeof value === "string" && FORBIDDEN_VALUE.test(value)) {
    fail("privacy_invalid");
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => privacySafe(entry, `${location}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) fail("privacy_invalid");
      privacySafe(entry, `${location}.${key}`);
    }
  }
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
  if (
    !exactKeys(entry, keys)
    || entry.id !== id
    || entry.status !== "passed"
  ) fail(`case_invalid:${id}`);
  validateDuration(entry.duration_ms);
  if (keys.includes("result_sha256") && !HASH.test(entry.result_sha256 ?? "")) {
    fail(`case_invalid:${id}`);
  }
  if (keys.includes("count") && entry.count !== 1) fail(`case_invalid:${id}`);
  if (
    id === "PH18-MFA"
    && !["completed", "not_requested"].includes(entry.outcome)
  ) fail(`case_invalid:${id}`);
}

function validateTechnicalReviewCase(entry, id) {
  if (
    !exactKeys(entry, ["code", "duration_ms", "id", "status"])
    || entry.id !== id
    || entry.status !== "TECHNICAL_REVIEW_REQUIRED"
    || !SAFE_FAILURE_CODES.has(entry.code)
  ) fail(`case_invalid:${id}`);
  validateDuration(entry.duration_ms);
}

function validateStandalone(value) {
  if (
    !exactKeys(value, [
      "downloaded_scripts",
      "embedded_js",
      "external_python",
      "metro",
      "runtime_agent",
    ])
    || value.embedded_js !== true
    || value.external_python !== false
    || value.metro !== false
    || value.downloaded_scripts !== false
    || value.runtime_agent !== false
  ) fail("standalone_invalid");
}

function validatePrivacyScan(value) {
  if (
    !exactKeys(value, ["report_sha256", "scanned_artifact_count", "status"])
    || value.status !== "passed"
    || !Number.isSafeInteger(value.scanned_artifact_count)
    || value.scanned_artifact_count < 1
    || value.scanned_artifact_count > 100
    || !HASH.test(value.report_sha256 ?? "")
  ) fail("privacy_scan_invalid");
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
  if (
    !exactKeys(evidence, topKeys)
    || evidence.schema_version !== 1
    || evidence.suite !== "phase18-garmin-proof"
    || !["passed", "TECHNICAL_REVIEW_REQUIRED"].includes(evidence.status)
    || !Array.isArray(evidence.case_ids)
    || !isDeepStrictEqual(evidence.case_ids, PHASE18_GARMIN_PROOF_CASE_IDS)
    || !Array.isArray(evidence.cases)
    || !HASH.test(evidence.raw_report_sha256 ?? "")
  ) fail("schema_invalid");
  validateManifestShape(evidence.manifest);
  validateStandalone(evidence.standalone);
  validatePrivacyScan(evidence.privacy_scan);

  if (!review) {
    if (evidence.cases.length !== PHASE18_GARMIN_PROOF_CASE_IDS.length) {
      fail("case_count_invalid");
    }
    evidence.cases.forEach((entry, index) => {
      validatePassedCase(entry, PHASE18_GARMIN_PROOF_CASE_IDS[index]);
    });
    return Object.freeze({ status: "passed", cases: evidence.cases.length });
  }

  if (
    evidence.cases.length < 1
    || evidence.cases.length > PHASE18_GARMIN_PROOF_CASE_IDS.length
  ) fail("case_count_invalid");
  const lastIndex = evidence.cases.length - 1;
  evidence.cases.forEach((entry, index) => {
    const expectedId = PHASE18_GARMIN_PROOF_CASE_IDS[index];
    if (index === lastIndex) validateTechnicalReviewCase(entry, expectedId);
    else validatePassedCase(entry, expectedId);
  });
  const failure = evidence.cases[lastIndex];
  if (
    failure.id !== evidence.failure_stage
    || failure.code !== evidence.failure_code
  ) fail("failure_classification_invalid");
  return Object.freeze({
    status: "TECHNICAL_REVIEW_REQUIRED",
    cases: evidence.cases.length,
    stage: failure.id,
    code: failure.code,
  });
}

export function validatePhase18GarminProofCurrentIdentity(evidence, current) {
  const manifest = evidence?.manifest;
  if (
    manifest?.base_head !== current.currentHead
    || manifest?.source_tree_sha256 !== current.currentSourceTreeSha256
    || manifest?.python_lock_sha256 !== current.currentPythonLockSha256
    || manifest?.apk_sha256 !== current.retainedApkSha256
    || manifest?.apk_sha256 !== current.installedApkSha256
    || manifest?.signature_sha256 !== current.retainedSignatureSha256
    || manifest?.device_identity_sha256 !== current.deviceIdentitySha256
    || evidence?.raw_report_sha256 !== current.rawReportSha256
  ) fail("current_identity_invalid");
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
    if (argument === "--manifest") options.manifest = args[++index] ?? "";
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
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
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
    deviceIdentitySha256: sha256(JSON.stringify({ serial, abi, apiLevel, model })),
  });
}

function currentIdentity(rawReportBytes) {
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

export function executePhase18GarminProofVerifier(args = process.argv.slice(2)) {
  const options = parsePhase18GarminProofVerifierArgs(args);
  const manifest = JSON.parse(readRegularFile(options.manifest, "manifest").toString("utf8"));
  const rawReportBytes = readRegularFile(PHASE18_GARMIN_PROOF_RAW_REPORT, "raw_report");
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
      currentIdentity(rawReportBytes),
    );
    writeFileSync(
      path.resolve(ROOT, FINAL_EVIDENCE),
      `${JSON.stringify(evidence, null, 2)}\n`,
      { flag: "wx" },
    );
  } else {
    evidence = JSON.parse(readRegularFile(FINAL_EVIDENCE, "final").toString("utf8"));
    validatePhase18GarminProofEvidence(evidence);
    validatePhase18GarminProofCurrentIdentity(
      evidence,
      currentIdentity(rawReportBytes),
    );
  }
  return validatePhase18GarminProofEvidence(evidence);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase18GarminProofVerifier())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "phase18_evidence_failed"}\n`);
    process.exitCode = 1;
  }
}
