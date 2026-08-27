#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { validatePhase5BenchmarkEvidence } from "./benchmark-phase5.mjs";
import {
  loadPhase5Candidate,
  parsePhase5CandidateArguments,
  phase5CandidateIdentity,
  SHA256_PATTERN,
  sha256File,
  validatePhase5CandidateIdentity,
  validatePhase5DeviceIdentity,
  validatePhase5EvidenceIdentity,
} from "./phase5-candidate-evidence.mjs";
import { validatePhase5MaestroEvidence } from "./run-phase5-maestro.mjs";

export { validatePhase5CandidateIdentity };

export const PHASE5_AUTOMATED_CASE_IDS = Object.freeze([
  "source-static-gates",
  "generated-cng-and-backup-rules",
  "native-sqlite-production-ui-persistence",
  "installed-core-workout-and-lifecycle",
  "installed-history-progress-and-data-recovery",
  "candidate-artifact-validation",
  "automated-adaptive-and-accessibility-contracts",
  "bounded-production-performance",
]);

const SOURCE_CASE_IDS = PHASE5_AUTOMATED_CASE_IDS.slice(0, 2);
const PRODUCERS = Object.freeze({
  source: "phase5-source-gates/v1",
  maestro: "phase5-maestro/v1",
  benchmark: "phase5-benchmark/v1",
});

function exactLedger(label, actual, expected) {
  if (!Array.isArray(actual)
    || actual.length !== expected.length
    || new Set(actual).size !== actual.length
    || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} ledger/order is incomplete or stale.`);
  }
}

function validateRawReports(entries, rawReports) {
  if (rawReports === undefined) {
    throw new Error("Phase 5 raw report bytes are required for recomputation.");
  }
  for (const entry of entries) {
    const bytes = rawReports[entry.id];
    if (!Buffer.isBuffer(bytes)
      || createHash("sha256").update(bytes).digest("hex") !== entry.raw_report_sha256) {
      throw new Error(`Phase 5 raw report hash does not match bytes: ${entry.id}`);
    }
  }
}

export function validatePhase5SourceEvidence(
  evidence, manifest, manifestSha256, rawReports,
) {
  validatePhase5EvidenceIdentity(
    evidence, manifest, manifestSha256, PRODUCERS.source,
  );
  validatePhase5DeviceIdentity(evidence.device, manifest);
  exactLedger(
    "Phase 5 source command",
    evidence.commands?.map(({ id }) => id),
    SOURCE_CASE_IDS,
  );
  for (const command of evidence.commands) {
    if (command.status !== "passed"
      || !SHA256_PATTERN.test(command.raw_report_sha256 ?? "")) {
      throw new Error(`Phase 5 source raw report failed: ${command.id}`);
    }
  }
  validateRawReports(evidence.commands, rawReports);
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function exactKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)) {
    throw new Error(`${label} contains missing, reordered, or extra fields.`);
  }
}

export function validatePhase5AutomatedAggregateShape(aggregate) {
  exactKeys(aggregate, [
    "schema_version", "suite", "status", "mode", "approval_status",
    "attended_scope", "producer", "candidate", "device",
    "case_ledger", "report_hashes",
  ], "Phase 5 automated aggregate");
  if (aggregate.schema_version !== 1 || aggregate.suite !== "phase5"
    || aggregate.status !== "passed" || aggregate.mode !== "automated-only"
    || aggregate.approval_status !== "evidence_pending"
    || aggregate.attended_scope !== "excluded"
    || aggregate.producer !== "phase5-aggregate-verifier/v1") {
    throw new Error("Phase 5 automated aggregate schema/status is invalid.");
  }
  exactLedger("Phase 5 aggregate case", aggregate.case_ledger, PHASE5_AUTOMATED_CASE_IDS);
  exactLedger(
    "Phase 5 aggregate report",
    aggregate.report_hashes?.map(({ name }) => name),
    Object.keys(PRODUCERS),
  );
  for (const report of aggregate.report_hashes) {
    exactKeys(report, ["name", "sha256"], "Phase 5 aggregate report hash");
    if (!SHA256_PATTERN.test(report.sha256 ?? "")) {
      throw new Error("Phase 5 aggregate report digest is malformed.");
    }
  }
}

export function validatePhase5AutomatedEvidence({
  manifest,
  manifestSha256,
  reports,
}) {
  validatePhase5CandidateIdentity({ manifest, manifestSha256 });
  exactLedger(
    "Phase 5 automated report",
    reports?.map(({ name }) => name),
    Object.keys(PRODUCERS),
  );
  const reportHashes = reports.map(({ name, file, value }) => {
    const bytes = readFileSync(file);
    if (bytes.toString("utf8") !== canonicalJson(value)) {
      throw new Error(`Phase 5 raw report bytes changed: ${name}`);
    }
    validatePhase5EvidenceIdentity(
      value, manifest, manifestSha256, PRODUCERS[name],
    );
    return {
      name,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
  const devices = reports.map(({ value }) => value.device);
  if (devices.some((device) => JSON.stringify(device) !== JSON.stringify(devices[0]))) {
    throw new Error("Phase 5 automated producer device identities differ.");
  }
  const covered = new Set([
    ...reports[0].value.commands.map(({ id }) => id),
    ...reports[1].value.flows.flatMap(({ coverage }) => coverage),
    "candidate-artifact-validation",
    "bounded-production-performance",
  ]);
  const missingCases = PHASE5_AUTOMATED_CASE_IDS.filter((id) => !covered.has(id));
  if (missingCases.length > 0) {
    throw new Error(`Phase 5 automated matrix is missing cases: ${missingCases.join(", ")}`);
  }
  return {
    schema_version: 1,
    suite: "phase5",
    status: "passed",
    mode: "automated-only",
    approval_status: "evidence_pending",
    attended_scope: "excluded",
    producer: "phase5-aggregate-verifier/v1",
    candidate: phase5CandidateIdentity(manifest, manifestSha256),
    device: devices[0],
    case_ledger: PHASE5_AUTOMATED_CASE_IDS,
    report_hashes: reportHashes,
  };
}

export function validatePhase5AutomatedEvidenceSet({
  manifest, manifestSha256, aggregate, aggregateBytes, reports,
}) {
  validatePhase5AutomatedAggregateShape(aggregate);
  if (canonicalJson(aggregate) !== aggregateBytes.toString("utf8")) {
    throw new Error("Phase 5 automated aggregate is not canonical.");
  }
  validatePhase5SourceEvidence(
    reports.source.value, manifest, manifestSha256, reports.source.rawReports,
  );
  validatePhase5MaestroEvidence(
    reports.maestro.value, manifest, manifestSha256, reports.maestro.rawReports,
  );
  validatePhase5BenchmarkEvidence(
    reports.benchmark.value, manifest, manifestSha256, reports.benchmark.rawReports,
  );
  const expected = validatePhase5AutomatedEvidence({
    manifest, manifestSha256,
    reports: Object.keys(PRODUCERS).map((name) => ({
      name, file: reports[name].file, value: reports[name].value,
    })),
  });
  if (canonicalJson(expected) !== aggregateBytes.toString("utf8")) {
    throw new Error("Phase 5 automated aggregate identity/case/report hashes are stale or fabricated.");
  }
  return expected;
}

function readStrictReport(evidenceDirectory, name) {
  const file = path.join(evidenceDirectory, `${name}.json`);
  const bytes = readFileSync(file);
  const value = JSON.parse(bytes.toString("utf8"));
  if (canonicalJson(value) !== bytes.toString("utf8")) {
    throw new Error(`Phase 5 ${name} producer report is not canonical.`);
  }
  const entries = value[name === "source" ? "commands" : name === "maestro" ? "flows" : "measurements"];
  if (!Array.isArray(entries)) {
    throw new Error(`Phase 5 ${name} producer report is malformed.`);
  }
  const rawReports = Object.fromEntries(entries.map((entry) => {
    if (typeof entry.raw_report_file !== "string"
      || path.basename(entry.raw_report_file) !== entry.raw_report_file) {
      throw new Error(`Phase 5 ${name} raw report path is unsafe.`);
    }
    return [entry.id, readFileSync(path.join(evidenceDirectory, entry.raw_report_file))];
  }));
  return { file, value, rawReports };
}

export function loadAndValidatePhase5AutomatedEvidenceSet({
  manifest, manifestSha256, aggregatePath,
}) {
  const aggregateBytes = readFileSync(aggregatePath);
  const aggregate = JSON.parse(aggregateBytes.toString("utf8"));
  const evidenceDirectory = path.dirname(path.resolve(aggregatePath));
  const reports = Object.fromEntries(
    Object.keys(PRODUCERS).map((name) => [name, readStrictReport(evidenceDirectory, name)]),
  );
  return validatePhase5AutomatedEvidenceSet({
    manifest, manifestSha256, aggregate, aggregateBytes, reports,
  });
}

export function executePhase5Verifier(args = process.argv.slice(2)) {
  const options = parsePhase5CandidateArguments(args, new Map([
    ["--source", "source"],
    ["--maestro", "maestro"],
    ["--benchmark", "benchmark"],
    ["--output", "output"],
  ]));
  for (const name of [...Object.keys(PRODUCERS), "output"]) {
    if (typeof options[name] !== "string" || options[name].length < 1) {
      throw new Error(`Phase 5 verifier requires --${name}.`);
    }
  }
  const candidate = loadPhase5Candidate(options);
  const reportsByName = Object.fromEntries(Object.keys(PRODUCERS).map((name) => {
    const file = path.resolve(options[name]);
    const value = JSON.parse(readFileSync(file, "utf8"));
    const entries = value[name === "source" ? "commands" : name === "maestro" ? "flows" : "measurements"];
    const rawReports = Object.fromEntries(entries.map((entry) => [
      entry.id, readFileSync(path.resolve(path.dirname(file), entry.raw_report_file)),
    ]));
    return [name, { file, value, rawReports }];
  }));
  const result = validatePhase5AutomatedEvidence({
    manifest: candidate.manifest,
    manifestSha256: candidate.manifest_sha256,
    reports: Object.keys(PRODUCERS).map((name) => ({
      name, file: reportsByName[name].file, value: reportsByName[name].value,
    })),
  });
  validatePhase5AutomatedEvidenceSet({
    manifest: candidate.manifest, manifestSha256: candidate.manifest_sha256,
    aggregate: result, aggregateBytes: Buffer.from(canonicalJson(result)), reports: reportsByName,
  });
  writeFileSync(options.output, canonicalJson(result));
  if (sha256File(options.output) === candidate.manifest_sha256) {
    throw new Error("aggregate output unexpectedly aliases the manifest.");
  }
  return result;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const result = executePhase5Verifier();
    process.stdout.write(`${JSON.stringify({ ok: true, cases: result.case_ledger.length })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
