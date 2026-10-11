#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

import {
  PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT,
  PHASE18_GARMIN_ACCEPTANCE_RAW_REPORT,
  createPhase18GarminAcceptanceRunnerPlan,
  validatePhase18GarminAcceptanceManifest,
} from "./run-phase18-garmin-acceptance.mjs";
import { sanitizePhase18BuildManifest } from "./phase18-build-manifest.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import {
  validatePhase18GarminProofCurrentIdentity,
  validatePhase18GarminProofEvidence,
} from "./verify-phase18-garmin-proof.mjs";
import {
  validatePhase18GarminAdversarialCurrentIdentity,
  validatePhase18GarminAdversarialEvidence,
} from "./verify-phase18-garmin-adversarial.mjs";

const MANIFEST = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`;
const APK = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-acceptance-devtest.apk`;
const PROOF_EVIDENCE = "artifacts/native/phase18-garmin-proof/final-evidence.json";
const ADVERSARIAL_EVIDENCE = "artifacts/native/phase18-garmin-adversarial/final-evidence.json";
const MAESTRO_SOURCE = "maestro/phase18/garmin-sync.yaml";
const MAESTRO_REPORT = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/maestro-report.json`;
const PRIVACY_REPORT = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/privacy-report.json`;
const HASH = /^[a-f0-9]{64}$/u;
const SEMANTIC_STATE = /^[a-z][a-z0-9-]{0,63}$/u;
const FORBIDDEN_KEY = /(?:^|_)(?:account|activity_id|authorization|ciphertext|cookie|credentials?|device_serial|email|external_activity_id|filename|heart_rate|latitude|longitude|mfa_code|password|raw_json|route|secret|serial|sql_param|token|url)(?:$|_)/iu;
const FORBIDDEN_VALUE = /(?:https?:\/\/|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/iu;
const EXPECTED_OBSERVATIONS = Object.freeze({
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
});

const fail = (code) => {
  throw new Error(`phase18_acceptance_evidence_${code}`);
};

function exactKeys(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

function privacySafe(value) {
  if (typeof value === "string" && FORBIDDEN_VALUE.test(value)) {
    fail("privacy_invalid");
  }
  if (Array.isArray(value)) {
    value.forEach(privacySafe);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) fail("privacy_invalid");
      privacySafe(entry);
    }
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function command(program, args) {
  return execFileSync(program, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

function resolveCurrentIdentity() {
  const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (androidHome === undefined) fail("android_sdk_missing");
  const adb = path.join(androidHome, "platform-tools", "adb");
  const buildTools = path.join(androidHome, "build-tools");
  const apksigner = existsSync(buildTools)
    ? readdirSync(buildTools).sort().reverse()
      .map((version) => path.join(buildTools, version, "apksigner"))
      .find(existsSync)
    : undefined;
  if (apksigner === undefined) fail("apksigner_missing");
  const devices = command(adb, ["devices"]).split("\n").slice(1)
    .map((line) => line.trim().split(/\s+/u)).filter(([, state]) => state === "device");
  if (devices.length !== 1 || devices[0]?.[0] === undefined) fail("device_identity_invalid");
  const serial = devices[0][0];
  const getprop = (name) => command(adb, ["-s", serial, "shell", "getprop", name]);
  const deviceIdentitySha256 = sha256([
    getprop("ro.build.fingerprint"), getprop("ro.product.cpu.abi"),
    getprop("ro.product.model"), getprop("ro.build.version.sdk"),
    getprop("ro.build.version.release"), "",
  ].join("\n"));
  const installedPath = command(adb, ["-s", serial, "shell", "pm", "path", "com.fchoo.gymtracker.devtest"])
    .split("\n").find((line) => line.startsWith("package:"))?.slice("package:".length);
  if (installedPath === undefined) fail("installed_apk_missing");
  const temporary = mkdtempSync(path.join(tmpdir(), "phase18-acceptance-"));
  try {
    const installedCopy = path.join(temporary, "installed.apk");
    execFileSync(adb, ["-s", serial, "pull", installedPath, installedCopy], { stdio: "ignore" });
    const signatureOutput = command(apksigner, ["verify", "--print-certs", APK]);
    const signature = signatureOutput.match(/certificate SHA-256 digest:\s*([A-Fa-f0-9:]{64,95})/u)?.[1]
      ?.replaceAll(":", "").toLowerCase();
    if (signature === undefined || !HASH.test(signature)) fail("signature_unreadable");
    return Object.freeze({
      currentHead: command("git", ["rev-parse", "HEAD"]),
      currentSourceTreeSha256: sourceTreeSha256(),
      currentPythonLockSha256: sha256(readFileSync("modules/garmin-connect/python/garmin-python-lock.json")),
      retainedApkSha256: sha256(readFileSync(APK)),
      installedApkSha256: sha256(readFileSync(installedCopy)),
      retainedSignatureSha256: signature,
      deviceIdentitySha256,
    });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function matchingArtifactIdentity(ownerManifest, acceptanceManifest) {
  for (const key of ["base_head", "source_tree_sha256", "python_lock_sha256", "signature_sha256", "device_identity_sha256", "package", "profile", "abi"]) {
    if (ownerManifest?.[key] !== acceptanceManifest?.[key]) fail("owner_manifest_invalid");
  }
}

function selfValidateManifest(manifest) {
  validatePhase18GarminAcceptanceManifest(manifest, {
    currentHead: manifest?.base_head,
    currentSourceTreeSha256: manifest?.source_tree_sha256,
    currentPythonLockSha256: manifest?.python_lock_sha256,
    retainedApkSha256: manifest?.apk_sha256,
    retainedSignatureSha256: manifest?.signature_sha256,
    deviceIdentitySha256: manifest?.device_identity_sha256,
  });
}

function validDuration(value) {
  return Number.isSafeInteger(value)
    && value >= 0
    && value <= 24 * 60 * 60 * 1_000;
}

function validateHostCase(entry, contract) {
  if (
    !exactKeys(entry, [
      "duration_ms",
      "id",
      "match_digest",
      "semantic_state",
      "source_digest",
      "status",
    ])
    || entry.id !== contract.id
    || entry.status !== "passed"
    || !validDuration(entry.duration_ms)
    || !HASH.test(entry.source_digest ?? "")
    || !HASH.test(entry.match_digest ?? "")
    || !SEMANTIC_STATE.test(entry.semantic_state ?? "")
  ) fail("host_case_invalid");
}

function validateNativeCase(entry, contract) {
  const deferred = entry?.status === "deferred";
  const keys = deferred
    ? ["artifact", "id", "owner_plan", "status"]
    : [
      "artifact",
      "artifact_sha256",
      "id",
      "owner_plan",
      "proof_kind",
      "status",
    ];
  if (
    !exactKeys(entry, keys)
    || entry.id !== contract.id
    || entry.owner_plan !== contract.ownerPlan
    || entry.artifact !== contract.artifact
    || !["deferred", "verified"].includes(entry.status)
    || (
      !deferred
      && (
        entry.proof_kind !== "native-exact-artifact"
        || !HASH.test(entry.artifact_sha256 ?? "")
      )
    )
  ) fail("native_case_invalid");
}

function validateNativeFlow(value) {
  if (
    !exactKeys(value, ["path", "report_sha256", "source_sha256"])
    || value.path !== "maestro/phase18/garmin-sync.yaml"
    || !HASH.test(value.source_sha256 ?? "")
    || !HASH.test(value.report_sha256 ?? "")
  ) fail("native_flow_invalid");
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

export function validatePhase18GarminAcceptanceEvidence(evidence) {
  privacySafe(evidence);
  if (
    !exactKeys(evidence, [
      "case_ids",
      "cases",
      "manifest",
      "native_flow",
      "observations",
      "privacy_scan",
      "schema_version",
      "status",
      "suite",
    ])
    || evidence.schema_version !== 1
    || evidence.suite !== "phase18-garmin-acceptance"
    || !["host-passed-native-deferred", "passed"].includes(evidence.status)
    || !Array.isArray(evidence.case_ids)
    || !Array.isArray(evidence.cases)
  ) fail("schema_invalid");
  const plan = createPhase18GarminAcceptanceRunnerPlan();
  if (
    !isDeepStrictEqual(evidence.case_ids, plan.case_ids)
    || evidence.cases.length !== plan.cases.length
    || !isDeepStrictEqual(evidence.cases.map(({ id }) => id), plan.case_ids)
  ) fail("case_order_invalid");
  selfValidateManifest(evidence.manifest);
  if (!isDeepStrictEqual(evidence.observations, EXPECTED_OBSERVATIONS)) {
    fail("observations_invalid");
  }
  validateNativeFlow(evidence.native_flow);
  validatePrivacyScan(evidence.privacy_scan);

  let hostCases = 0;
  let nativePrerequisites = 0;
  let nativeVerified = 0;
  plan.cases.forEach((contract, index) => {
    const entry = evidence.cases[index];
    if (contract.disposition === "execute-host") {
      validateHostCase(entry, contract);
      hostCases += 1;
    } else {
      validateNativeCase(entry, contract);
      nativePrerequisites += 1;
      if (entry.status === "verified") nativeVerified += 1;
    }
  });
  const expectedStatus = nativeVerified === nativePrerequisites
    ? "passed"
    : "host-passed-native-deferred";
  if (evidence.status !== expectedStatus) fail("status_invalid");
  return Object.freeze({
    status: expectedStatus,
    host_cases: hostCases,
    native_prerequisites: nativePrerequisites,
  });
}

export function validatePhase18GarminAcceptanceCurrentIdentity(evidence, current) {
  const manifest = evidence?.manifest;
  if (
    manifest?.base_head !== current.currentHead
    || manifest?.source_tree_sha256 !== current.currentSourceTreeSha256
    || manifest?.python_lock_sha256 !== current.currentPythonLockSha256
    || manifest?.apk_sha256 !== current.retainedApkSha256
    || manifest?.apk_sha256 !== current.installedApkSha256
    || manifest?.signature_sha256 !== current.retainedSignatureSha256
    || manifest?.device_identity_sha256 !== current.deviceIdentitySha256
    || evidence?.native_flow?.source_sha256 !== current.nativeFlowSourceSha256
    || evidence?.native_flow?.report_sha256 !== current.nativeFlowReportSha256
    || evidence?.privacy_scan?.report_sha256 !== current.privacyReportSha256
  ) fail("current_identity_invalid");
  return true;
}

export function executePhase18GarminAcceptanceVerifier(
  args = process.argv.slice(2),
  dependencies = {},
) {
  if (
    args.length !== 2
    || args[0] !== "--manifest"
    || args[1] !== MANIFEST
  ) fail("arguments_invalid");
  const readJson = dependencies.readJson
    ?? ((path) => JSON.parse(readFileSync(path, "utf8")));
  const readBytes = dependencies.readBytes ?? readFileSync;
  const current = (dependencies.resolveCurrentIdentity ?? resolveCurrentIdentity)();
  const retainedManifest = readJson(MANIFEST);
  const manifest = sanitizePhase18BuildManifest(retainedManifest, {
    suite: "phase18-garmin-acceptance",
    pythonLockSha256: current.currentPythonLockSha256,
    signatureSha256: current.retainedSignatureSha256,
  });
  const evidence = readJson(PHASE18_GARMIN_ACCEPTANCE_RAW_REPORT);
  if (!isDeepStrictEqual(evidence?.manifest, manifest)) {
    fail("report_identity_invalid");
  }
  const validated = validatePhase18GarminAcceptanceEvidence(evidence);
  validatePhase18GarminAcceptanceCurrentIdentity(evidence, {
    ...current,
    nativeFlowSourceSha256: sha256(readBytes(MAESTRO_SOURCE)),
    nativeFlowReportSha256: sha256(readBytes(MAESTRO_REPORT)),
    privacyReportSha256: sha256(readBytes(PRIVACY_REPORT)),
  });
  const ownerArtifacts = [
    [PROOF_EVIDENCE, validatePhase18GarminProofEvidence, validatePhase18GarminProofCurrentIdentity],
    [ADVERSARIAL_EVIDENCE, validatePhase18GarminAdversarialEvidence, validatePhase18GarminAdversarialCurrentIdentity],
  ];
  const ownerVerifier = dependencies.verifyOwnerArtifact;
  for (const [artifactPath, validateEvidence, validateIdentity] of ownerArtifacts) {
    const ownerEvidence = readJson(artifactPath);
    if (ownerVerifier === undefined) validateEvidence(ownerEvidence);
    else ownerVerifier(artifactPath, ownerEvidence);
    matchingArtifactIdentity(ownerEvidence.manifest, manifest);
    const artifactHash = sha256(readBytes(artifactPath));
    const row = evidence.cases.find(({ artifact }) => artifact === artifactPath);
    if (row?.status !== "verified" || row.artifact_sha256 !== artifactHash) fail("owner_artifact_invalid");
    if (ownerVerifier === undefined) {
      validateIdentity(ownerEvidence, dependencies.ownerCurrentIdentity?.[artifactPath] ?? {
        ...current,
        retainedApkSha256: ownerEvidence.manifest?.apk_sha256,
        installedApkSha256: ownerEvidence.manifest?.apk_sha256,
        nativeReportSha256: ownerEvidence.native_report?.sha256,
        privacyReportSha256: ownerEvidence.privacy_scan?.report_sha256,
        rawReportSha256: ownerEvidence.raw_report_sha256,
      });
    }
  }
  const maestro = readJson(MAESTRO_REPORT);
  const privacy = readJson(PRIVACY_REPORT);
  if (maestro?.status !== "passed" || privacy?.status !== "passed"
    || !isDeepStrictEqual(evidence.observations, maestro.observations)
    || evidence.privacy_scan.scanned_artifact_count !== privacy.scanned_artifact_count) {
    fail("observations_invalid");
  }
  return validated;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase18GarminAcceptanceVerifier())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "phase18_acceptance_verifier_failed"}\n`);
    process.exitCode = 1;
  }
}
