#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  PHASE18_GARMIN_PROOF_CASE_IDS,
  PHASE18_GARMIN_PROOF_CONFIRMATION,
  PHASE18_GARMIN_PROOF_RESULT_MARKER,
} from "../src/testing/phase18GarminProof.ts";
import {
  assertPhase18PrivacySafe,
  assertPhase18PrivateTextSafe,
} from "./phase18-privacy-scan.mjs";
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
import { sanitizePhase18BuildManifest } from "./phase18-build-manifest.mjs";
import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";
import { pullInstalledApkSha256 } from "./phase18-installed-apk.mjs";

const ROOT = process.cwd();
export const PHASE18_GARMIN_PROOF_ARTIFACT_ROOT =
  "artifacts/native/phase18-garmin-proof";
export const PHASE18_GARMIN_PROOF_APK =
  `${PHASE18_GARMIN_PROOF_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-proof-devtest.apk`;
export const PHASE18_GARMIN_PROOF_RAW_REPORT =
  `${PHASE18_GARMIN_PROOF_ARTIFACT_ROOT}/raw-report.json`;

const MANIFEST = `${PHASE18_GARMIN_PROOF_ARTIFACT_ROOT}/build.json`;
const PYTHON_LOCK = "modules/garmin-connect/python/garmin-python-lock.json";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const HASH = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const SAFE_CODE = /^[a-z][a-z0-9_]{0,63}$/u;
const TECHNICAL_REVIEW_CODES = new Set([
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
const PROOF_TIMEOUT_MS = 15 * 60 * 1_000;
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

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code) => {
  throw new Error(`phase18_${code}`);
};

export function parsePhase18GarminProofRunnerArgs(args) {
  const options = {
    manifest: "",
    execute: false,
    phase20Checkpoint: false,
  };
  let executeCount = 0;
  let checkpointCount = 0;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") options.manifest = cliArgValue(args, ++index);
    else if (argument === "--execute") {
      executeCount += 1;
      options.execute = true;
    } else if (argument === "--phase20-native-checkpoint") {
      checkpointCount += 1;
      options.phase20Checkpoint = true;
    } else fail(`runner_unknown_argument:${argument}`);
  }
  if (
    options.manifest !== MANIFEST
    || executeCount > 1
    || checkpointCount > 1
    || options.execute !== options.phase20Checkpoint
  ) fail("runner_arguments_invalid");
  return Object.freeze(options);
}

export function createPhase18GarminProofRunnerPlan() {
  return Object.freeze({
    schema_version: 1,
    suite: "phase18-garmin-proof",
    case_ids: PHASE18_GARMIN_PROOF_CASE_IDS,
    credentials: "installed-app-only",
    transport: "embedded-garmin-module-only",
    fallback_transport: "prohibited",
    package: PACKAGE,
    abi: "arm64-v8a",
    standalone: Object.freeze({
      embedded_js: true,
      external_python: false,
      metro: false,
      downloaded_scripts: false,
      runtime_agent: false,
    }),
    final_evidence_owner: "phase20-native-checkpoint",
    runner_writes_final_evidence: false,
  });
}

export function validatePhase18GarminProofBuildManifest(manifest, current) {
  const invalid = [
    !exactKeys(manifest, MANIFEST_KEYS),
    manifest.schema_version !== 1,
    manifest.suite !== "phase18-garmin-proof",
    manifest.profile !== "development-test",
    manifest.package !== PACKAGE,
    manifest.abi !== "arm64-v8a",
    manifest.js_bundle_embedded !== true,
    !regexMatch(HEAD, manifest.base_head),
    !regexMatch(HASH, manifest.source_tree_sha256),
    !regexMatch(HASH, manifest.python_lock_sha256),
    !regexMatch(HASH, manifest.apk_sha256),
    !regexMatch(HASH, manifest.signature_sha256),
    !regexMatch(HASH, manifest.device_identity_sha256),
    manifest.base_head !== current.currentHead,
    manifest.source_tree_sha256 !== current.currentSourceTreeSha256,
    manifest.python_lock_sha256 !== current.currentPythonLockSha256,
    manifest.apk_sha256 !== current.retainedApkSha256,
    manifest.signature_sha256 !== current.retainedSignatureSha256,
    (
      current.deviceIdentitySha256 !== undefined
      && manifest.device_identity_sha256 !== current.deviceIdentitySha256
    ),
  ].some(Boolean);
  if (invalid) fail("manifest_invalid");
  return true;
}

export function sanitizePhase18GarminProofBuildManifest(retained, current) {
  let sanitized;
  try {
    sanitized = sanitizePhase18BuildManifest(retained, {
      suite: "phase18-garmin-proof",
      pythonLockSha256: current.currentPythonLockSha256,
      signatureSha256: current.retainedSignatureSha256,
    });
  } catch (error) {
    if (error instanceof Error && error.message.endsWith("privacy_invalid")) {
      fail("build_manifest_privacy_invalid");
    }
    fail("build_manifest_invalid");
  }
  validatePhase18GarminProofBuildManifest(sanitized, {
    currentHead: retained.base_head,
    currentSourceTreeSha256: retained.source_tree_sha256,
    currentPythonLockSha256: current.currentPythonLockSha256,
    retainedApkSha256: retained.apk.sha256,
    retainedSignatureSha256: current.retainedSignatureSha256,
    deviceIdentitySha256: retained.device.identity_sha256,
  });
  return sanitized;
}

export function parsePhase18GarminProofMarker(line) {
  const markerIndex = line.indexOf(PHASE18_GARMIN_PROOF_RESULT_MARKER);
  if (markerIndex < 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(line.slice(
      markerIndex + PHASE18_GARMIN_PROOF_RESULT_MARKER.length,
    ));
  } catch {
    fail("marker_invalid");
  }
  const baseKeys = ["duration_ms", "id", "status"];
  const allowedKeys = parsed?.status === "passed"
    ? [...baseKeys, "count", "outcome", "result_sha256"]
    : [...baseKeys, "code"];
  const invalidMarker = [
    !exactKeys(parsed, Object.keys(parsed ?? {}).filter((key) => allowedKeys.includes(key))),
    !Object.keys(parsed ?? {}).every((key) => allowedKeys.includes(key)),
    !PHASE18_GARMIN_PROOF_CASE_IDS.includes(parsed?.id),
    !Number.isSafeInteger(parsed?.duration_ms),
    parsed?.duration_ms < 0,
    !["passed", "TECHNICAL_REVIEW_REQUIRED"].includes(parsed?.status),
  ].some(Boolean);
  if (invalidMarker) fail("marker_invalid");
  const invalidTechnicalReviewCode = parsed.status === "TECHNICAL_REVIEW_REQUIRED"
    && (typeof parsed.code !== "string" || !SAFE_CODE.test(parsed.code));
  if (invalidTechnicalReviewCode) fail("marker_invalid");
  if (parsed.result_sha256 !== undefined && !regexMatch(HASH, parsed.result_sha256)) {
    fail("marker_invalid");
  }
  if (parsed.count !== undefined && parsed.count !== 1) fail("marker_invalid");
  if (
    parsed.outcome !== undefined
    && !["completed", "not_requested"].includes(parsed.outcome)
  ) fail("marker_invalid");
  assertPhase18PrivacySafe(parsed, { prefix: "phase18_marker_privacy" });
  return Object.freeze(parsed);
}

function defaultNative(program, args, options = {}) {
  return execFileSync(program, args, {
    cwd: ROOT,
    maxBuffer: 512 * 1024 * 1024,
    ...options,
  });
}

function defaultSleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function commandText(native, program, args) {
  const output = native(program, args, { encoding: "utf8" });
  return typeof output === "string" ? output.trim() : output.toString("utf8").trim();
}

function resolveAndroidTool(name) {
  const sdk = firstDefined(process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT);
  if (sdk === undefined) fail(`android_sdk_missing:${name}`);
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

function certificateSha256(native, apkPath) {
  const output = commandText(native, resolveAndroidTool("apksigner"), [
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

function discoverDevice(native, adb) {
  const devices = commandText(native, adb, ["devices"])
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/u))
    .filter(([, state]) => state === "device");
  if (devices.length !== 1 || devices[0]?.[0] === undefined) {
    fail("device_selection_invalid");
  }
  const serial = devices[0][0];
  const getprop = (name) => commandText(native, adb, [
    "-s",
    serial,
    "shell",
    "getprop",
    name,
  ]);
  const abi = getprop("ro.product.cpu.abi");
  const apiLevel = getprop("ro.build.version.sdk");
  const model = getprop("ro.product.model");
  if (abi !== "arm64-v8a" || !/^\d{2,3}$/u.test(apiLevel) || model.length === 0) {
    fail("device_identity_invalid");
  }
  return Object.freeze({
    serial,
    identitySha256: phase18DeviceIdentitySha256({ serial, abi, apiLevel, model }),
  });
}

function adbText(native, adb, serial, ...args) {
  return commandText(native, adb, ["-s", serial, ...args]);
}

function readProofLog(native, adb, serial) {
  const processId = adbText(native, adb, serial, "shell", "pidof", PACKAGE);
  if (!/^\d+$/u.test(processId)) fail("app_process_missing");
  return adbText(native, adb, serial, "logcat", "-d", "--pid", processId);
}

export function markersFromLog(log) {
  const byId = new Map();
  for (const line of log.split("\n")) {
    const marker = parsePhase18GarminProofMarker(line);
    if (marker !== null) {
      if (byId.has(marker.id)) fail("case_duplicate");
      byId.set(marker.id, marker);
    }
  }
  return [...byId.values()];
}

function waitForCase(native, adb, serial, target, dependencies = {}) {
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? defaultSleep;
  const deadline = now() + PROOF_TIMEOUT_MS;
  while (now() < deadline) {
    const log = readProofLog(native, adb, serial);
    const cases = markersFromLog(log);
    const failure = cases.find(({ status }) => status === "TECHNICAL_REVIEW_REQUIRED");
    if (failure !== undefined || cases.some(({ id }) => id === target)) {
      return Object.freeze({ log, cases: Object.freeze(cases) });
    }
    sleep(1_000);
  }
  fail(`case_timeout:${target}`);
}

function launchRoute(native, adb, serial, operation) {
  const uri = `gymtracker-devtest://__phase18-garmin-proof?operation=${operation}&confirmation=${PHASE18_GARMIN_PROOF_CONFIRMATION}`;
  adbText(
    native,
    adb,
    serial,
    "shell",
    "am",
    "start",
    "-W",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    uri,
    PACKAGE,
  );
}

function orderedReportCases(cases) {
  const positions = new Map(PHASE18_GARMIN_PROOF_CASE_IDS.map((id, index) => [id, index]));
  const sorted = [...cases].sort((left, right) => positions.get(left.id) - positions.get(right.id));
  if (new Set(sorted.map(({ id }) => id)).size !== sorted.length) fail("case_duplicate");
  sorted.forEach((entry, index) => {
    if (entry.id !== PHASE18_GARMIN_PROOF_CASE_IDS[index]) fail("case_order_invalid");
    if (
      entry.status === "TECHNICAL_REVIEW_REQUIRED"
      && index !== sorted.length - 1
    ) fail("case_order_invalid");
  });
  return Object.freeze(sorted);
}

export function createPhase18GarminTechnicalReviewReport(input) {
  validatePhase18GarminProofBuildManifest(input.manifest, {
    currentHead: input.manifest?.base_head,
    currentSourceTreeSha256: input.manifest?.source_tree_sha256,
    currentPythonLockSha256: input.manifest?.python_lock_sha256,
    retainedApkSha256: input.manifest?.apk_sha256,
    retainedSignatureSha256: input.manifest?.signature_sha256,
    deviceIdentitySha256: input.manifest?.device_identity_sha256,
  });
  const stageIndex = PHASE18_GARMIN_PROOF_CASE_IDS.indexOf(input.stage);
  if (
    stageIndex < 0
    || stageIndex !== input.passedCases.length
    || !TECHNICAL_REVIEW_CODES.has(input.code)
    || input.passedCases.some((entry, index) => (
      entry.id !== PHASE18_GARMIN_PROOF_CASE_IDS[index]
      || entry.status !== "passed"
    ))
  ) fail("case_order_invalid");
  const cases = Object.freeze([
    ...input.passedCases,
    Object.freeze({
      id: input.stage,
      status: "TECHNICAL_REVIEW_REQUIRED",
      duration_ms: 0,
      code: input.code,
    }),
  ]);
  return Object.freeze({
    schema_version: 1,
    suite: "phase18-garmin-proof",
    status: "TECHNICAL_REVIEW_REQUIRED",
    manifest: Object.freeze({ ...input.manifest }),
    cases,
    standalone: createPhase18GarminProofRunnerPlan().standalone,
    privacy_scan: Object.freeze({
      status: "not_run",
      scanned_artifact_count: 0,
    }),
    failure_stage: input.stage,
    failure_code: input.code,
  });
}

export function classifyPhase18GarminProofRunnerFailure(stage, error) {
  const message = error instanceof Error ? error.message : "";
  if (/(?:privacy|backup_path)/u.test(message)) return "privacy_scan_failed";
  if (stage === "PH18-PKG") return "packaging_failed";
  if (/timeout/u.test(message)) return "timeout";
  return "temporary_failure";
}

function writeFreshReport(report) {
  const directory = path.resolve(ROOT, PHASE18_GARMIN_PROOF_ARTIFACT_ROOT);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.resolve(ROOT, PHASE18_GARMIN_PROOF_RAW_REPORT),
    `${JSON.stringify(report, null, 2)}\n`,
    { flag: "wx" },
  );
}

export function executePhase18GarminProofRunner(
  args = process.argv.slice(2),
  dependencies = {},
) {
  const options = parsePhase18GarminProofRunnerArgs(args);
  const plan = createPhase18GarminProofRunnerPlan();
  if (!options.execute) {
    return Object.freeze({ status: "native_deferred", plan });
  }

  const native = choose(dependencies.native, defaultNative);
  const reportWriter = choose(dependencies.writeEvidence, writeFreshReport);
  const retainedManifest = JSON.parse(readFileSync(path.resolve(ROOT, options.manifest), "utf8"));
  const apkPath = path.resolve(ROOT, PHASE18_GARMIN_PROOF_APK);
  if (!existsSync(apkPath)) fail("apk_missing");
  const retainedApkBytes = readFileSync(apkPath);
  const currentPythonLockSha256 = sha256(
    readFileSync(path.resolve(ROOT, PYTHON_LOCK)),
  );
  const currentSignatureSha256 = certificateSha256(native, apkPath);
  const manifest = sanitizePhase18GarminProofBuildManifest(retainedManifest, {
    currentPythonLockSha256,
    retainedSignatureSha256: currentSignatureSha256,
  });
  validatePhase18GarminProofBuildManifest(manifest, {
    currentHead: commandText(native, "git", ["rev-parse", "HEAD"]),
    currentSourceTreeSha256: sourceTreeSha256(ROOT),
    currentPythonLockSha256,
    retainedApkSha256: sha256(retainedApkBytes),
    retainedSignatureSha256: currentSignatureSha256,
  });
  let completedCases = [];
  let currentStage = "PH18-PKG";
  let report;
  try {
    const adb = resolveAndroidTool("adb");
    const device = discoverDevice(native, adb);
    if (device.identitySha256 !== manifest.device_identity_sha256) {
      fail("device_identity_invalid");
    }
    const packageStartedAt = Date.now();
    adbText(native, adb, device.serial, "install", "-r", apkPath);
    const installedPathOutput = adbText(
      native,
      adb,
      device.serial,
      "shell",
      "pm",
      "path",
      PACKAGE,
    );
    const installedPath = installedPathOutput.replace(/^package:/u, "");
    if (!installedPath.startsWith("/data/app/")) fail("installed_apk_path_invalid");
    const installedApkSha256 = pullInstalledApkSha256({
      adb,
      serial: device.serial,
      installedPath,
      expectedByteCount: retainedApkBytes.length,
    });
    if (installedApkSha256 !== manifest.apk_sha256) fail("installed_apk_mismatch");
    const packageCase = Object.freeze({
      id: "PH18-PKG",
      status: "passed",
      duration_ms: Date.now() - packageStartedAt,
      result_sha256: manifest.apk_sha256,
    });
    completedCases = [packageCase];
    currentStage = "PH18-LOGIN";

    adbText(native, adb, device.serial, "logcat", "-c");
    launchRoute(native, adb, device.serial, "login");
    const login = waitForCase(native, adb, device.serial, "PH18-READ", dependencies);
    const loginFailure = login.cases.some(
      ({ status }) => status === "TECHNICAL_REVIEW_REQUIRED",
    );
    completedCases = orderedReportCases([
      packageCase,
      ...login.cases.filter(({ status }) => status === "passed"),
    ]);
    let restore = Object.freeze({ log: "", cases: Object.freeze([]) });
    let rotatedRestoreLog = "";
    if (!loginFailure) {
      currentStage = "PH18-RESTART";
      adbText(native, adb, device.serial, "shell", "am", "force-stop", PACKAGE);
      adbText(native, adb, device.serial, "logcat", "-c");
      launchRoute(native, adb, device.serial, "restore");
      restore = waitForCase(native, adb, device.serial, "PH18-REFRESH", dependencies);
      if (!restore.cases.some(({ status }) => status === "TECHNICAL_REVIEW_REQUIRED")) {
        adbText(native, adb, device.serial, "shell", "am", "force-stop", PACKAGE);
        adbText(native, adb, device.serial, "logcat", "-c");
        launchRoute(native, adb, device.serial, "restore");
        const rotatedRestore = waitForCase(
          native,
          adb,
          device.serial,
          "PH18-REFRESH",
          dependencies,
        );
        if (rotatedRestore.cases.some(({ status }) => status === "TECHNICAL_REVIEW_REQUIRED")
          || !rotatedRestore.cases.some(({ id, status }) => id === "PH18-RESTART" && status === "passed")) {
          fail("rotated_session_restore_failed");
        }
        rotatedRestoreLog = rotatedRestore.log;
      }
    }
    const proofCases = orderedReportCases([
      packageCase,
      ...login.cases,
      ...restore.cases,
    ]);
    const failure = proofCases.find(
      ({ status }) => status === "TECHNICAL_REVIEW_REQUIRED",
    );
    completedCases = proofCases.filter(({ status }) => status === "passed");
    currentStage = failure?.id ?? "PH18-PRIVACY";

    const combinedLog = `${login.log}\n${restore.log}\n${rotatedRestoreLog}`;
    assertPhase18PrivateTextSafe(combinedLog, "phase18_privacy_scan");
    const backupFiles = adbText(
      native,
      adb,
      device.serial,
      "shell",
      "run-as",
      PACKAGE,
      "find",
      ".",
      "-type",
      "f",
    );
    const unsafePaths = backupFiles.split("\n").filter((entry) =>
      /(?:garmin|session|token|staging)/iu.test(entry)
      && !/^\.\/no_backup\/garmin-session\/garmin-di-session\.bin$/u.test(entry));
    if (unsafePaths.length > 0) fail("backup_path_invalid");
    if (failure === undefined) {
      adbText(
        native,
        adb,
        device.serial,
        "shell",
        "run-as",
        PACKAGE,
        "test",
        "-f",
        "no_backup/garmin-session/garmin-di-session.bin",
      );
    }
    const cases = failure === undefined
      ? orderedReportCases([
        ...proofCases,
        Object.freeze({
          id: "PH18-PRIVACY",
          status: "passed",
          duration_ms: 0,
          count: 1,
          result_sha256: sha256(combinedLog),
        }),
      ])
      : proofCases;
    report = Object.freeze({
      schema_version: 1,
      suite: "phase18-garmin-proof",
      status: failure === undefined ? "passed" : "TECHNICAL_REVIEW_REQUIRED",
      manifest: Object.freeze({ ...manifest }),
      cases,
      standalone: plan.standalone,
      privacy_scan: Object.freeze({
        status: "passed",
        scanned_artifact_count: 2,
        report_sha256: sha256(combinedLog),
      }),
      ...(failure === undefined
        ? {}
        : { failure_stage: failure.id, failure_code: failure.code }),
    });
  } catch (error) {
    report = createPhase18GarminTechnicalReviewReport({
      manifest,
      passedCases: completedCases,
      stage: currentStage,
      code: classifyPhase18GarminProofRunnerFailure(currentStage, error),
      privateError: error,
    });
  }
  reportWriter(report);
  return Object.freeze({
    status: report.status,
    report_sha256: sha256(JSON.stringify(report)),
    evidence_written: false,
  });
}

export function executePhase18GarminProofRunnerCli(dependencies = {}) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase18GarminProofRunner(process.argv.slice(2), dependencies))}\n`);
  } catch (error) {
    process.stderr.write(`${errorMessage(error, "phase18_runner_failed")}\n`);
    process.exitCode = 1;
  }
}

runCliIfMain(import.meta.url, process.argv[1], executePhase18GarminProofRunnerCli);
