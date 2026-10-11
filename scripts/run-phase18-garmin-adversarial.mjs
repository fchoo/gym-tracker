#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT =
  "artifacts/native/phase18-garmin-adversarial";
export const PHASE18_GARMIN_ADVERSARIAL_RAW_REPORT =
  `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/raw-report.json`;

const MANIFEST = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/build.json`;
const RECORD = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/native-record.json`;
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

function writeRawReport(report) {
  writeFileSync(
    PHASE18_GARMIN_ADVERSARIAL_RAW_REPORT,
    `${JSON.stringify(report, null, 2)}\n`,
    { flag: "wx" },
  );
}

export function executePhase18GarminAdversarialRunner(
  args = process.argv.slice(2),
  dependencies = {},
) {
  const options = parsePhase18GarminAdversarialRunnerArgs(args);
  if (!options.execute) {
    return Object.freeze({ status: "native_deferred", final_evidence_written: false });
  }
  const jsonReader = dependencies.readJson ?? readJson;
  const reportWriter = dependencies.writeRawReport ?? writeRawReport;
  const manifest = jsonReader(options.manifest);
  const record = jsonReader(options.record);
  const report = Object.freeze({
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    status: record.status,
    manifest,
    case_ids: PHASE18_GARMIN_ADVERSARIAL_CASE_IDS,
    cases: record.cases,
    native_report: record.native_report,
    privacy_scan: record.privacy_scan,
  });
  reportWriter(report);
  return Object.freeze({ status: report.status, final_evidence_written: false });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase18GarminAdversarialRunner())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "phase18_garmin_adversarial_runner_failed"}\n`);
    process.exitCode = 1;
  }
}
