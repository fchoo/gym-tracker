#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { sanitizePhase18BuildManifest } from "./phase18-build-manifest.mjs";
import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";
import { pullInstalledApkSha256 } from "./phase18-installed-apk.mjs";
import {
  assertPhase18PrivacySafe,
  assertPhase18PrivateTextSafe,
} from "./phase18-privacy-scan.mjs";
import {
  choose,
  cliArgValue,
  errorMessage,
  exactKeys,
  regexMatch,
  runCliIfMain,
} from "./node-evidence-utils.mjs";

export const PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT =
  "artifacts/native/phase18-garmin-adversarial";
export const PHASE18_GARMIN_ADVERSARIAL_RAW_REPORT =
  `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/raw-report.json`;

const MANIFEST = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/build.json`;
const RECORD = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/native-record.json`;
const NATIVE_REPORT = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/native-report.json`;
const PRIVACY_REPORT = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/privacy-report.json`;
const PACKAGE = "com.fchoo.gymtracker.devtest";
const HASH = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const RUN_NONCE = /^[a-f0-9]{32}$/u;
const NATIVE_REPORT_MARKER = "GYM_TRACKER_PHASE18_GARMIN_ADVERSARIAL_REPORT:";
const COLLECTOR_OWNED = Symbol("phase18-garmin-adversarial-collector-owned");
const TEST_FIXTURE_LABEL = "phase18-garmin-adversarial-test-collector/v1";
const PRIVACY_SAFE_STRINGS_BY_PATH = new Map([
  ["native_report.path", new Set([NATIVE_REPORT])],
  ["producer_context.kind", new Set([
    "installed-route-log",
    "test-collector-fixture",
  ])],
]);
const MANIFEST_KEYS = [
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
];
const CURRENT_IDENTITY_KEYS = [
  "currentHead",
  "currentPythonLockSha256",
  "currentSourceTreeSha256",
  "deviceIdentitySha256",
  "retainedApkSha256",
  "retainedSignatureSha256",
];
const PHASE18_GARMIN_ADVERSARIAL_CASE_IDS = Object.freeze([
  "PH18-ADV-RESTORE",
  "PH18-ADV-REFRESH",
  "PH18-ADV-READ",
  "PH18-ADV-LOGOUT",
  "PH18-ADV-RESTART",
  "PH18-ADV-LATE-GENERATION",
  "PH18-ADV-403",
  "PH18-ADV-429",
  "PH18-ADV-OFFLINE",
  "PH18-ADV-TIMEOUT",
  "PH18-ADV-5XX",
  "PH18-ADV-MALFORMED",
  "PH18-ADV-OVERSIZED",
  "PH18-ADV-MISSING-COMPONENT",
  "PH18-ADV-PARTIAL-PAGE",
  "PH18-ADV-ROTATION",
]);

const fail = (code) => {
  throw new Error(`phase18_garmin_adversarial_${code}`);
};

function assertAdversarialRecordPrivacySafe(value, context = "") {
  return assertPhase18PrivacySafe(value, {
    prefix: "phase18_garmin_adversarial_record_privacy",
    context,
    allowString: (entry, entryContext) => (
      PRIVACY_SAFE_STRINGS_BY_PATH.get(entryContext)?.has(entry) ?? false
    ),
  });
}

function assertAdversarialLogPrivacySafe(logcat, record) {
  const sourceOwnedMarker = `${NATIVE_REPORT_MARKER}${JSON.stringify(record)}`;
  const scannableLog = typeof logcat === "string"
    ? logcat.replace(sourceOwnedMarker, "")
    : logcat;
  return assertPhase18PrivateTextSafe(
    scannableLog,
    "phase18_garmin_adversarial_record_privacy",
  );
}

export function validatePhase18GarminAdversarialManifest(manifest, current) {
  const invalid = [
    !exactKeys(manifest, MANIFEST_KEYS),
    manifest.schema_version !== 1,
    manifest.suite !== "phase18-garmin-adversarial",
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
    manifest.device_identity_sha256 !== current.deviceIdentitySha256,
  ].some(Boolean);
  if (invalid) fail("manifest_invalid");
  return true;
}

export function createPhase18GarminAdversarialRunnerPlan() {
  return Object.freeze({
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    case_ids: PHASE18_GARMIN_ADVERSARIAL_CASE_IDS,
    execution_authority: "phase20-native-checkpoint",
    final_evidence_owner: "phase20-native-checkpoint",
    runner_writes_final_evidence: false,
    real_account_required: true,
  });
}

export function parsePhase18GarminAdversarialRunnerArgs(args) {
  const options = { manifest: "", record: "", execute: false, phase20Checkpoint: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") options.manifest = cliArgValue(args, ++index);
    else if (argument === "--record") options.record = cliArgValue(args, ++index);
    else if (argument === "--execute") options.execute = true;
    else if (argument === "--phase20-native-checkpoint") options.phase20Checkpoint = true;
    else fail("runner_arguments_invalid");
  }
  if (
    options.manifest !== MANIFEST
    || options.record !== RECORD
    || options.execute !== options.phase20Checkpoint
  ) fail("runner_arguments_invalid");
  return options;
}

export function createPhase18GarminAdversarialRawReport(input) {
  return Object.freeze({
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    status: input.status,
    manifest: Object.freeze({ ...input.manifest }),
    current_identity: Object.freeze({ ...input.current_identity }),
    producer_context: Object.freeze({ ...input.producer_context }),
    case_ids: PHASE18_GARMIN_ADVERSARIAL_CASE_IDS,
    cases: Object.freeze(input.cases.map((entry) => Object.freeze({ ...entry }))),
    native_report: Object.freeze({ ...input.native_report }),
    privacy_scan: Object.freeze({ ...input.privacy_scan }),
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeRawReport(report) {
  writeFileSync(
    PHASE18_GARMIN_ADVERSARIAL_RAW_REPORT,
    `${JSON.stringify(report, null, 2)}\n`,
    { flag: "wx" },
  );
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function serializedNativeReport(report) {
  return Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
}

function currentIdentitySha256(identity) {
  return sha256Bytes(Buffer.from(JSON.stringify(Object.fromEntries(
    CURRENT_IDENTITY_KEYS.map((key) => [key, identity?.[key]]),
  ))));
}

function collectedCases(cases) {
  return cases.map((entry) => Object.freeze({
    ...entry,
    provenance: entry.status === "passed" ? "native-exact-artifact" : "unexpected",
  }));
}

function fixtureSha256(context) {
  return sha256Bytes(Buffer.from(JSON.stringify({
    label: TEST_FIXTURE_LABEL,
    current_identity_sha256: context.current_identity_sha256,
    device_identity_sha256: context.device_identity_sha256,
    installed_apk_sha256: context.installed_apk_sha256,
    native_report_sha256: context.native_report_sha256,
    run_nonce: context.run_nonce,
    source_pid: context.source_pid,
  })));
}

function collectorOwned(report, logcat, producerContext) {
  return Object.freeze({
    [COLLECTOR_OWNED]: true,
    report: Object.freeze(report),
    logcat,
    nativeReportBytes: serializedNativeReport(report),
    producerContext: Object.freeze(producerContext),
  });
}

export function createPhase18GarminAdversarialTestCollectorFixture(input) {
  const runNonce = input?.run_nonce;
  const sourcePid = input?.source_pid;
  const source = input?.report;
  if (!RUN_NONCE.test(runNonce ?? "") || !Number.isSafeInteger(sourcePid) || sourcePid <= 0) {
    fail("collector_fixture_invalid");
  }
  const report = {
    status: "TECHNICAL_REVIEW_REQUIRED",
    run_nonce: runNonce,
    current_identity: source?.current_identity,
    cases: Array.isArray(source?.cases)
      ? source.cases.map((entry) => ({
        ...entry,
        status: "TECHNICAL_REVIEW_REQUIRED",
        provenance: "unexpected",
      }))
      : source?.cases,
  };
  const nativeReportSha256 = sha256Bytes(serializedNativeReport(report));
  const context = {
    kind: "test-collector-fixture",
    marker: NATIVE_REPORT_MARKER,
    package: PACKAGE,
    run_nonce: runNonce,
    source_pid: sourcePid,
    device_identity_sha256: report?.current_identity?.deviceIdentitySha256,
    installed_apk_sha256: report?.current_identity?.retainedApkSha256,
    native_report_sha256: nativeReportSha256,
    current_identity_sha256: currentIdentitySha256(report?.current_identity),
    fixture_sha256: null,
  };
  context.fixture_sha256 = fixtureSha256(context);
  return collectorOwned(report, input.logcat ?? TEST_FIXTURE_LABEL, context);
}

function nativeReportFromPidLog(logcat, expectedNonce, expectedDeviceIdentitySha256) {
  const lines = logcat
    .split(/\r?\n/u)
    .filter((entry) => entry.includes(NATIVE_REPORT_MARKER));
  if (lines.length === 0) return null;
  if (lines.length !== 1) fail("native_report_cardinality_invalid");
  const line = lines[0];
  let report;
  try {
    report = JSON.parse(
      line.slice(line.indexOf(NATIVE_REPORT_MARKER) + NATIVE_REPORT_MARKER.length),
    );
  } catch {
    fail("native_report_nonce_invalid");
  }
  if (!RUN_NONCE.test(report?.run_nonce ?? "") || report.run_nonce !== expectedNonce) {
    fail("native_report_nonce_invalid");
  }
  if (!exactKeys(report, ["cases", "current_identity", "run_nonce", "status"])) {
    fail("native_report_schema_invalid");
  }
  if (report?.current_identity?.deviceIdentitySha256 !== expectedDeviceIdentitySha256) {
    fail("native_report_device_identity_invalid");
  }
  return report;
}

export function collectInstalledNativeReport() {
  const devices = execFileSync("adb", ["devices"], { encoding: "utf8" })
    .split(/\r?\n/u)
    .slice(1)
    .map((line) => line.trim().split(/\s+/u))
    .filter(([, state]) => state === "device");
  if (devices.length !== 1 || devices[0]?.[0] === undefined) fail("device_selection_invalid");
  const serial = devices[0][0];
  const adb = (args, options) => execFileSync("adb", ["-s", serial, ...args], options);
  const adbText = (...args) => adb(args, { encoding: "utf8" }).trim();
  const deviceIdentitySha256 = phase18DeviceIdentitySha256({
    serial,
    abi: adbText("shell", "getprop", "ro.product.cpu.abi"),
    apiLevel: adbText("shell", "getprop", "ro.build.version.sdk"),
    model: adbText("shell", "getprop", "ro.product.model"),
  });
  const installedPath = adbText("shell", "pm", "path", PACKAGE).replace(/^package:/u, "");
  const installedByteCount = Number(adbText("shell", "stat", "-c", "%s", installedPath));
  if (!installedPath.startsWith("/data/app/")
    || !Number.isSafeInteger(installedByteCount)
    || installedByteCount <= 0) {
    fail("installed_apk_invalid");
  }
  const installedApkSha256 = pullInstalledApkSha256({
    adb: "adb",
    serial,
    installedPath,
    expectedByteCount: installedByteCount,
  });
  const runNonce = randomBytes(16).toString("hex");
  adb(["logcat", "-c"], { stdio: "ignore" });
  adb(["shell", "am", "force-stop", PACKAGE], { stdio: "ignore" });
  adb([
    "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d",
    `gymtracker-devtest://__phase18-garmin-adversarial?confirmation=VERIFY-PHASE18-GARMIN-ADVERSARIAL&nonce=${runNonce}&device_identity_sha256=${deviceIdentitySha256}`,
    PACKAGE,
  ], { stdio: "ignore" });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const processId = adb(["shell", "pidof", PACKAGE], { encoding: "utf8" }).trim();
    if (!/^\d+$/u.test(processId)) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      continue;
    }
    const logcat = adb(["logcat", "--pid", processId, "-d"], { encoding: "utf8" });
    const report = nativeReportFromPidLog(logcat, runNonce, deviceIdentitySha256);
    if (report !== null) {
      if (report?.current_identity?.retainedApkSha256 !== installedApkSha256) {
        fail("native_report_apk_identity_invalid");
      }
      const nativeReportSha256 = sha256Bytes(serializedNativeReport(report));
      return collectorOwned(report, logcat, {
        kind: "installed-route-log",
        marker: NATIVE_REPORT_MARKER,
        package: PACKAGE,
        run_nonce: runNonce,
        source_pid: Number(processId),
        device_identity_sha256: deviceIdentitySha256,
        installed_apk_sha256: installedApkSha256,
        native_report_sha256: nativeReportSha256,
        current_identity_sha256: currentIdentitySha256(report.current_identity),
        fixture_sha256: null,
      });
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  fail("native_report_timeout");
}

function validateRecord(record, manifest) {
  assertAdversarialRecordPrivacySafe(record);
  if (!exactKeys(record.current_identity, CURRENT_IDENTITY_KEYS)) {
    fail("record_invalid");
  }
  const invalid = [
    !["passed", "TECHNICAL_REVIEW_REQUIRED"].includes(record.status),
    !Array.isArray(record.cases),
    record.cases.length !== PHASE18_GARMIN_ADVERSARIAL_CASE_IDS.length,
    !isDeepStrictEqual(
      record.cases.map(({ id }) => id),
      PHASE18_GARMIN_ADVERSARIAL_CASE_IDS,
    ),
    !regexMatch(HEAD, record.current_identity.currentHead),
    !regexMatch(HASH, record.current_identity.currentSourceTreeSha256),
    !regexMatch(HASH, record.current_identity.currentPythonLockSha256),
    !regexMatch(HASH, record.current_identity.retainedApkSha256),
    !regexMatch(HASH, record.current_identity.retainedSignatureSha256),
    !regexMatch(HASH, record.current_identity.deviceIdentitySha256),
    !["installed-route-log", "test-collector-fixture"].includes(record.producer_context.kind),
    record.producer_context.marker !== NATIVE_REPORT_MARKER,
    record.producer_context.package !== PACKAGE,
    !regexMatch(RUN_NONCE, record.producer_context.run_nonce),
    !Number.isSafeInteger(record.producer_context.source_pid),
    record.producer_context.source_pid <= 0,
    !regexMatch(HASH, record.producer_context.device_identity_sha256),
    !regexMatch(HASH, record.producer_context.installed_apk_sha256),
    !regexMatch(HASH, record.producer_context.native_report_sha256),
    !regexMatch(HASH, record.producer_context.current_identity_sha256),
    record.producer_context.device_identity_sha256
      !== record.current_identity.deviceIdentitySha256,
    record.producer_context.installed_apk_sha256 !== record.current_identity.retainedApkSha256,
    record.producer_context.native_report_sha256 !== record.native_report.sha256,
    record.producer_context.current_identity_sha256
      !== currentIdentitySha256(record.current_identity),
    !exactKeys(record.native_report, ["path", "sha256"]),
    record.native_report.path !== `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/native-report.json`,
    !regexMatch(HASH, record.native_report.sha256),
    !exactKeys(record.privacy_scan, ["report_sha256", "scanned_artifact_count", "status"]),
    record.privacy_scan.status !== "passed",
    !Number.isSafeInteger(record.privacy_scan.scanned_artifact_count),
    record.privacy_scan.scanned_artifact_count < 1,
    record.privacy_scan.scanned_artifact_count > 100,
    !regexMatch(HASH, record.privacy_scan.report_sha256),
  ].some(Boolean);
  if (invalid) fail("record_invalid");
  validatePhase18GarminAdversarialManifest(manifest, record.current_identity);
}

export function executePhase18GarminAdversarialRunner(
  args = process.argv.slice(2),
  dependencies = {},
) {
  const options = parsePhase18GarminAdversarialRunnerArgs(args);
  if (!options.execute) {
    return Object.freeze({ status: "native_deferred", final_evidence_written: false });
  }
  const jsonReader = choose(dependencies.readJson, readJson);
  const reportWriter = choose(dependencies.writeRawReport, writeRawReport);
  const nativeWriter = choose(dependencies.writeNativeReport, writeJson);
  const privacyWriter = choose(dependencies.writePrivacyReport, writeJson);
  const collectNativeReport = choose(dependencies.collectNativeReport, collectInstalledNativeReport);
  const collected = collectNativeReport();
  if (collected?.[COLLECTOR_OWNED] !== true) fail("collector_provenance_invalid");
  const record = collected.report;
  assertAdversarialRecordPrivacySafe(record);
  assertAdversarialLogPrivacySafe(collected.logcat, record);
  const expectedNativeReportBytes = serializedNativeReport(record);
  if (!Buffer.isBuffer(collected.nativeReportBytes)
    || !collected.nativeReportBytes.equals(expectedNativeReportBytes)) {
    fail("collector_provenance_invalid");
  }
  const nativeReportSha256 = sha256Bytes(collected.nativeReportBytes);
  const privacyReport = Object.freeze({
    status: "passed",
    scanned_artifact_count: 2,
  });
  const privacyReportSha256 = sha256Bytes(Buffer.from(`${JSON.stringify(privacyReport, null, 2)}\n`));
  const boundRecord = {
    status: record.status,
    cases: collectedCases(record.cases),
    current_identity: record.current_identity,
    producer_context: collected.producerContext,
    native_report: { path: NATIVE_REPORT, sha256: nativeReportSha256 },
    privacy_scan: {
      status: "passed",
      scanned_artifact_count: 2,
      report_sha256: privacyReportSha256,
    },
  };
  const manifest = sanitizePhase18BuildManifest(jsonReader(options.manifest), {
    suite: "phase18-garmin-adversarial",
    pythonLockSha256: boundRecord.current_identity.currentPythonLockSha256,
    signatureSha256: boundRecord.current_identity.retainedSignatureSha256,
  });
  validateRecord(boundRecord, manifest);
  nativeWriter(NATIVE_REPORT, record);
  privacyWriter(PRIVACY_REPORT, privacyReport);
  const report = createPhase18GarminAdversarialRawReport({
    manifest,
    cases: boundRecord.cases,
    status: boundRecord.status,
    current_identity: boundRecord.current_identity,
    producer_context: boundRecord.producer_context,
    native_report: boundRecord.native_report,
    privacy_scan: boundRecord.privacy_scan,
  });
  reportWriter(report);
  return Object.freeze({ status: report.status, final_evidence_written: false });
}

export function executePhase18GarminAdversarialRunnerCli(dependencies = {}) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase18GarminAdversarialRunner(process.argv.slice(2), dependencies))}\n`);
  } catch (error) {
    process.stderr.write(`${errorMessage(error, "phase18_garmin_adversarial_runner_failed")}\n`);
    process.exitCode = 1;
  }
}

runCliIfMain(import.meta.url, process.argv[1], executePhase18GarminAdversarialRunnerCli);
