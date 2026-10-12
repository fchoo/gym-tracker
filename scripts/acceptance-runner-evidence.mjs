#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

import {
  GARMIN_ACCEPTANCE_CASES,
  PHASE18_GARMIN_ACCEPTANCE_CASE_IDS,
} from "../src/testing/contracts/garminImport.contract.ts";
import {
  choose,
  cliArgValue,
  errorMessage,
  exactKeys,
  regexMatch,
  runCliIfMain,
} from "./node-evidence-utils.mjs";
import { sanitizePhase18BuildManifest } from "./phase18-build-manifest.mjs";
import { executePhase18GarminProofRunner } from "./run-phase18-garmin-proof.mjs";
import { executePhase18GarminProofVerifier } from "./verify-phase18-garmin-proof.mjs";
import { executePhase18GarminAdversarialRunner } from "./run-phase18-garmin-adversarial.mjs";
import { executePhase18GarminAdversarialVerifier } from "./verify-phase18-garmin-adversarial.mjs";
import {
  PHASE18_AGGREGATE_ARTIFACT_ROOT,
  PHASE18_AGGREGATE_MANIFEST,
  PHASE18_AGGREGATE_SUITE,
  PHASE18_MAESTRO_REPORT,
  PHASE18_PRIVACY_REPORT,
  validatePhase18MaestroReport,
  validatePhase18PrivacyReport,
} from "./phase18-aggregate-acceptance.mjs";

export const PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT =
  PHASE18_AGGREGATE_ARTIFACT_ROOT;
export const PHASE18_GARMIN_ACCEPTANCE_RAW_REPORT =
  `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/raw-report.json`;

const MANIFEST = PHASE18_AGGREGATE_MANIFEST;
const RECORD = `${PHASE18_GARMIN_ACCEPTANCE_ARTIFACT_ROOT}/acceptance-record.json`;
const PROOF_EVIDENCE = "artifacts/native/phase18-garmin-proof/final-evidence.json";
const ADVERSARIAL_EVIDENCE = "artifacts/native/phase18-garmin-adversarial/final-evidence.json";
const ADVERSARIAL_RECORD = "artifacts/native/phase18-garmin-adversarial/native-record.json";
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

export function validatePhase18GarminAcceptanceManifest(manifest, current) {
  const invalid = [
    !exactKeys(manifest, MANIFEST_KEYS),
    manifest.schema_version !== 1,
    manifest.suite !== PHASE18_AGGREGATE_SUITE,
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
    run_identity: Object.freeze({ ...input.run_identity }),
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

export function collectPhase18OwnerRoutes(dependencies = {}) {
  const runProof = choose(dependencies.runProof, executePhase18GarminProofRunner);
  const verifyProof = choose(dependencies.verifyProof, executePhase18GarminProofVerifier);
  const runAdversarial = choose(
    dependencies.runAdversarial,
    executePhase18GarminAdversarialRunner,
  );
  const verifyAdversarial = choose(
    dependencies.verifyAdversarial,
    executePhase18GarminAdversarialVerifier,
  );
  const jsonReader = choose(dependencies.readJson, readJson);
  const bytesReader = choose(dependencies.readBytes, readFileSync);
  const steps = [
    () => runProof([
      "--manifest", MANIFEST,
      "--execute",
      "--phase20-native-checkpoint",
    ]),
    () => verifyProof([
      "--manifest", MANIFEST,
      "--seal",
      "--phase20-native-checkpoint",
    ]),
    () => runAdversarial([
      "--manifest", MANIFEST,
      "--record", ADVERSARIAL_RECORD,
      "--execute",
      "--phase20-native-checkpoint",
    ]),
    () => verifyAdversarial([
      "--manifest", MANIFEST,
      "--seal",
      "--phase20-native-checkpoint",
    ]),
  ];
  for (const execute of steps) {
    if (execute().status !== "passed") fail("owner_route_failed");
  }
  const owners = [PROOF_EVIDENCE, ADVERSARIAL_EVIDENCE].map((artifact) => {
    const evidence = jsonReader(artifact);
    const bytes = bytesReader(artifact);
    if (!Buffer.isBuffer(bytes)
      || evidence?.status !== "passed"
      || evidence?.manifest?.suite !== PHASE18_AGGREGATE_SUITE) {
      fail("owner_route_invalid");
    }
    return Object.freeze({ artifact, evidence, bytes });
  });
  if (!isDeepStrictEqual(owners[0].evidence.manifest, owners[1].evidence.manifest)) {
    fail("owner_route_identity_invalid");
  }
  return Object.freeze(owners);
}

function validateRecord(record, plan) {
  const invalid = [
    !exactKeys(record, [
      "cases",
      "current_identity",
    ]),
    !Array.isArray(record.cases),
    !isDeepStrictEqual(record.cases.map(({ id }) => id), plan.case_ids),
  ].some(Boolean);
  if (invalid) fail("record_invalid");
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
  const jsonReader = choose(dependencies.readJson, readJson);
  const bytesReader = choose(dependencies.readBytes, readFileSync);
  const reportWriter = choose(dependencies.writeReport, writeReport);
  const retainedManifest = jsonReader(options.manifest);
  const record = jsonReader(options.record);
  const plan = createPhase18GarminAcceptanceRunnerPlan();
  validateRecord(record, plan);
  const collectOwnerRoutes = choose(
    dependencies.collectOwnerRoutes,
    collectPhase18OwnerRoutes,
  );
  const owners = collectOwnerRoutes(dependencies.ownerRouteDependencies);
  const manifest = sanitizePhase18BuildManifest(retainedManifest, {
    suite: PHASE18_AGGREGATE_SUITE,
    pythonLockSha256: record.current_identity.currentPythonLockSha256,
    signatureSha256: record.current_identity.retainedSignatureSha256,
  });
  validatePhase18GarminAcceptanceManifest(manifest, record.current_identity);
  if (record.current_identity.installedApkSha256 !== manifest.apk_sha256) {
    fail("installed_apk_identity_invalid");
  }
  if (!owners.every(({ evidence }) => isDeepStrictEqual(evidence.manifest, manifest))) {
    fail("owner_route_identity_invalid");
  }
  const ownerCases = new Map([
    ["P18-NATIVE-18-03-REAL-ACCOUNT", owners[0]],
    ["P18-NATIVE-18-13-ADVERSARIAL", owners[1]],
  ]);
  const contractsById = new Map(plan.cases.map((contract) => [contract.id, contract]));
  const reportCases = record.cases.map((entry) => {
    const owner = ownerCases.get(entry.id);
    if (owner === undefined) return entry;
    const contract = contractsById.get(entry.id);
    return Object.freeze({
      id: entry.id,
      status: "verified",
      owner_plan: contract.ownerPlan,
      artifact: owner.artifact,
      artifact_sha256: createHash("sha256").update(owner.bytes).digest("hex"),
      proof_kind: "native-exact-artifact",
    });
  });
  const maestroReport = jsonReader(PHASE18_MAESTRO_REPORT);
  const maestro = validatePhase18MaestroReport(maestroReport, {
    manifest,
    installedApkSha256: record.current_identity.installedApkSha256,
    readBytes: bytesReader,
  });
  const privacyReport = jsonReader(PHASE18_PRIVACY_REPORT);
  const privacy = validatePhase18PrivacyReport(privacyReport, {
    manifest,
    installedApkSha256: record.current_identity.installedApkSha256,
    readBytes: bytesReader,
  });
  if (maestroReport.identity.run_id !== privacyReport.identity.run_id) {
    fail("run_identity_invalid");
  }
  const report = createPhase18GarminAcceptanceRawReport({
    manifest,
    cases: reportCases,
    observations: maestro.observations,
    run_identity: { run_id: maestroReport.identity.run_id },
    native_flow: {
      path: "maestro/phase18/garmin-sync.yaml",
      source_sha256: createHash("sha256").update(
        bytesReader("maestro/phase18/garmin-sync.yaml"),
      ).digest("hex"),
      report_sha256: createHash("sha256").update(
        bytesReader(PHASE18_MAESTRO_REPORT),
      ).digest("hex"),
    },
    privacy_scan: {
      status: "passed",
      scanned_artifact_count: privacy.scanned_artifact_count,
      report_sha256: createHash("sha256").update(
        bytesReader(PHASE18_PRIVACY_REPORT),
      ).digest("hex"),
    },
  });
  reportWriter(report);
  return Object.freeze({
    status: report.status,
    final_evidence_written: false,
  });
}

export function executePhase18GarminAcceptanceRunnerCli() {
  try {
    process.stdout.write(`${JSON.stringify(executePhase18GarminAcceptanceRunner())}\n`);
  } catch (error) {
    process.stderr.write(`${errorMessage(error, "phase18_acceptance_runner_failed")}\n`);
    process.exitCode = 1;
  }
}

runCliIfMain(import.meta.url, process.argv[1], executePhase18GarminAcceptanceRunnerCli);
