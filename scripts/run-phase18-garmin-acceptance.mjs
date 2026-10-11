#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

import {
  GARMIN_ACCEPTANCE_CASES,
  PHASE18_GARMIN_ACCEPTANCE_CASE_IDS,
} from "../src/testing/contracts/garminImport.contract.ts";
import { sanitizePhase18BuildManifest } from "./phase18-build-manifest.mjs";

export const PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT =
  "artifacts/native/phase18-garmin-acceptance";
export const PHASE18_GARMIN_ACCEPTANCE_RAW_REPORT =
  `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/raw-report.json`;

const MANIFEST = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/build.json`;
const RECORD = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/acceptance-record.json`;
const PACKAGE = "com.fchoo.gymtracker.devtest";
const HASH = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
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

const fail = (code) => {
  throw new Error(`phase18_acceptance_${code}`);
};

function exactKeys(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

export function validatePhase18GarminAcceptanceManifest(manifest, current) {
  if (
    !exactKeys(manifest, MANIFEST_KEYS)
    || manifest.schema_version !== 1
    || manifest.suite !== "phase18-garmin-acceptance"
    || manifest.profile !== "development-test"
    || manifest.package !== PACKAGE
    || manifest.abi !== "arm64-v8a"
    || manifest.js_bundle_embedded !== true
    || !HEAD.test(manifest.base_head ?? "")
    || !HASH.test(manifest.source_tree_sha256 ?? "")
    || !HASH.test(manifest.python_lock_sha256 ?? "")
    || !HASH.test(manifest.apk_sha256 ?? "")
    || !HASH.test(manifest.signature_sha256 ?? "")
    || !HASH.test(manifest.device_identity_sha256 ?? "")
    || manifest.base_head !== current.currentHead
    || manifest.source_tree_sha256 !== current.currentSourceTreeSha256
    || manifest.python_lock_sha256 !== current.currentPythonLockSha256
    || manifest.apk_sha256 !== current.retainedApkSha256
    || manifest.signature_sha256 !== current.retainedSignatureSha256
    || manifest.device_identity_sha256 !== current.deviceIdentitySha256
  ) fail("manifest_invalid");
  return true;
}

export function createPhase18GarminAcceptanceRunnerPlan() {
  return Object.freeze({
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    case_ids: PHASE18_GARMIN_ACCEPTANCE_CASE_IDS,
    cases: GARMIN_ACCEPTANCE_CASES,
    native_flow: "maestro/phase18/garmin-sync.yaml",
    final_evidence_owner: "phase20-native-checkpoint",
    mock_to_real_relabeling: "prohibited",
    credentials: "runtime-environment-only",
    runner_writes_final_evidence: false,
  });
}

export function createPhase18GarminAcceptanceRawReport(input) {
  const nativeCases = input.cases.filter(({ id }) => id.startsWith("P18-NATIVE-"));
  const nativeVerified = nativeCases.length > 0
    && nativeCases.every(({ status }) => status === "verified");
  return Object.freeze({
    schema_version: 1,
    suite: "phase18-garmin-acceptance",
    status: nativeVerified ? "passed" : "host-passed-native-deferred",
    manifest: Object.freeze({ ...input.manifest }),
    case_ids: PHASE18_GARMIN_ACCEPTANCE_CASE_IDS,
    cases: Object.freeze(input.cases.map((entry) => Object.freeze({ ...entry }))),
    observations: Object.freeze(structuredClone(input.observations)),
    native_flow: Object.freeze({ ...input.native_flow }),
    privacy_scan: Object.freeze({ ...input.privacy_scan }),
  });
}

export function parsePhase18GarminAcceptanceRunnerArgs(args) {
  const options = {
    manifest: "",
    record: "",
    execute: false,
    phase20Checkpoint: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") options.manifest = args[++index] ?? "";
    else if (argument === "--record") options.record = args[++index] ?? "";
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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeReport(report) {
  writeFileSync(
    PHASE18_GARMIN_ACCEPTANCE_RAW_REPORT,
    `${JSON.stringify(report, null, 2)}\n`,
    { flag: "wx" },
  );
}

function validateRecord(record, plan) {
  if (
    !exactKeys(record, [
      "cases",
      "current_identity",
      "native_flow",
      "observations",
      "privacy_scan",
    ])
    || !Array.isArray(record.cases)
    || !isDeepStrictEqual(record.cases.map(({ id }) => id), plan.case_ids)
  ) fail("record_invalid");
}

export function executePhase18GarminAcceptanceRunner(
  args = process.argv.slice(2),
  dependencies = {},
) {
  const options = parsePhase18GarminAcceptanceRunnerArgs(args);
  if (!options.execute) {
    return Object.freeze({
      status: "native_deferred",
      final_evidence_written: false,
    });
  }
  const jsonReader = dependencies.readJson ?? readJson;
  const reportWriter = dependencies.writeReport ?? writeReport;
  const retainedManifest = jsonReader(options.manifest);
  const record = jsonReader(options.record);
  const plan = createPhase18GarminAcceptanceRunnerPlan();
  validateRecord(record, plan);
  const manifest = sanitizePhase18BuildManifest(retainedManifest, {
    suite: "phase18-garmin-acceptance",
    pythonLockSha256: record.current_identity.currentPythonLockSha256,
    signatureSha256: record.current_identity.retainedSignatureSha256,
  });
  validatePhase18GarminAcceptanceManifest(manifest, record.current_identity);
  const report = createPhase18GarminAcceptanceRawReport({
    manifest,
    cases: record.cases,
    observations: record.observations,
    native_flow: record.native_flow,
    privacy_scan: record.privacy_scan,
  });
  reportWriter(report);
  return Object.freeze({
    status: report.status,
    final_evidence_written: false,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase18GarminAcceptanceRunner())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "phase18_acceptance_runner_failed"}\n`);
    process.exitCode = 1;
  }
}
