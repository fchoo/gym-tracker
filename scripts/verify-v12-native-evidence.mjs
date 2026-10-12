#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { validateV12CalendarComparison } from "./compare-v12-calendar.mjs";
import { validateV12CalendarDiagnostics } from "./benchmark-v12-interactions.mjs";
import { validateV12CalendarManifest } from "./run-v12-maestro.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { V12_CALENDAR_ROUTE_JOURNEY_IDS } from "./v12-calendar-case-registry.mjs";

const ROOT = process.cwd();
const HASH = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const PACKAGE = "com.fchoo.gymtracker.devtest";
const ALLOWED_RESULTS = new Set(["PASS", "FAIL", "REVIEW_REQUIRED"]);
const ALLOWED_CLASSIFICATIONS = new Set(["PASS", "FAIL", "REVIEW_REQUIRED", "accepted_deviation"]);

export const CALENDAR_NATIVE_CASE_IDS = Object.freeze(
  Array.from({ length: 9 }, (_, index) => `NV-CAL-${String(index + 1).padStart(2, "0")}`),
);

export const CALENDAR_ROUTE_JOURNEY_IDS = V12_CALENDAR_ROUTE_JOURNEY_IDS;

const REQUIRED_DEVIATIONS = Object.freeze(["DEV-01", "DEV-02"]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fail(code) {
  throw new Error(`v12_calendar_evidence_${code}`);
}

function descriptor(value, code) {
  if (typeof value?.path !== "string"
    || value.path.length === 0
    || path.isAbsolute(value.path)
    || value.path.split(/[\\/]+/u).includes("..")) fail(`${code}_path_invalid`);
  if (!HASH.test(value.sha256 ?? "")) fail(`${code}_descriptor_invalid`);
}

function exactIds(label, entries, expected) {
  if (!Array.isArray(entries)
    || entries.length !== expected.length
    || new Set(entries.map(({ id }) => id)).size !== entries.length
    || entries.some(({ id }, index) => id !== expected[index])) fail(`${label}_set_invalid`);
}

function monotonic(values) {
  return Array.isArray(values)
    && values.length >= 3
    && values.every((value, index) => Number.isFinite(value) && (index === 0 || value > values[index - 1]));
}

function noPrivateData(value, location = "evidence") {
  if (typeof value === "string") {
    if (/@|password|authorization|employee|raw[_ -]?payload|filename/iu.test(value)) fail(`privacy_unsafe:${location}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => noPrivateData(entry, `${location}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (/password|authorization|employee|raw[_ -]?payload|filename/iu.test(key)) fail(`privacy_unsafe:${location}.${key}`);
      noPrivateData(entry, `${location}.${key}`);
    }
  }
}

function validateIdentity(evidence) {
  validateV12CalendarManifest(evidence.manifest);
  const identity = evidence.identity;
  const manifest = evidence.manifest;
  if (!HEAD.test(identity?.base_head ?? "")
    || !HASH.test(identity?.source_tree_sha256 ?? "")
    || !HASH.test(identity?.source_manifest_sha256 ?? "")
    || !HASH.test(identity?.apk_sha256 ?? "")
    || !HASH.test(identity?.installed_apk_sha256 ?? "")
    || !HASH.test(identity?.device_identity_sha256 ?? "")
    || !HASH.test(identity?.report_sha256 ?? "")
    || identity.base_head !== manifest.base_head
    || identity.source_tree_sha256 !== manifest.source_tree_sha256
    || identity.source_manifest_sha256 !== manifest.source_manifest_sha256
    || identity.package !== PACKAGE
    || identity.package !== manifest.package
    || identity.apk_sha256 !== manifest.apk?.sha256
    || identity.installed_apk_sha256 !== manifest.installed_apk?.sha256
    || identity.device_identity_sha256 !== manifest.device?.identity_sha256
    || identity.report_sha256 !== manifest.report_sha256) fail("identity_invalid");
}

function validateFunctionalCases(evidence, fixtureMode) {
  exactIds("functional_case", evidence.functional_cases, CALENDAR_NATIVE_CASE_IDS);
  for (const entry of evidence.functional_cases) {
    if (!ALLOWED_RESULTS.has(entry.status)
      || entry.native_execution !== evidence.native_execution
      || !monotonic(entry.observations?.timestamps_ms)
      || entry.observations?.geometry_monotonic !== true
      || entry.observations?.semantics_monotonic !== true
      || entry.observations?.focus_ring_dp !== 3
      || entry.observations?.focus_clearance_dp !== 4) fail("functional_case_invalid");
    descriptor(entry.artifact, "functional_case_artifact");
    if (fixtureMode) {
      if (entry.status === "PASS" || entry.native_execution !== "NOT_RUN" || entry.observations.synthetic !== true) fail("fixture_case_invalid");
    } else if (entry.observations.synthetic === true) fail("live_case_synthetic");
  }
}

function validateRouteJourneys(evidence) {
  exactIds("route_journey", evidence.route_journeys, CALENDAR_ROUTE_JOURNEY_IDS);
  const activationKinds = new Set();
  for (const entry of evidence.route_journeys) {
    if (entry.status !== "PASS"
      || entry.execution !== "host-component"
      || entry.actual_route !== true
      || entry.actual_loader !== true
      || entry.back_restored !== true
      || entry.focus?.ring_dp !== 3
      || entry.focus?.clearance_dp !== 4
      || !HASH.test(entry.durable_identity_sha256 ?? "")
      || !HASH.test(entry.source_digest_before ?? "")
      || entry.source_digest_after !== entry.source_digest_before
      || !Array.isArray(entry.command_ledger)
      || entry.command_ledger.length !== 0
      || !["touch", "keyboard"].includes(entry.activation)) fail("route_journey_invalid");
    activationKinds.add(entry.activation);
    descriptor(entry.artifact, "route_journey_artifact");
  }
  if (!activationKinds.has("touch") || !activationKinds.has("keyboard")) fail("route_activation_matrix_invalid");
}

function validateDeviations(evidence) {
  exactIds("deviation", evidence.deviations, REQUIRED_DEVIATIONS);
  for (const entry of evidence.deviations) {
    if (entry.owner_decision !== "accepted"
      || entry.owner_decision_date !== "2026-10-07"
      || !ALLOWED_RESULTS.has(entry.technical_status)) fail("deviation_invalid");
    if (!entry.evidence_complete) {
      if (entry.technical_status !== "REVIEW_REQUIRED" || entry.classification !== "REVIEW_REQUIRED") fail("deviation_incomplete_status_invalid");
    } else if (!Array.isArray(entry.evidence_hashes)
      || entry.evidence_hashes.length === 0
      || entry.evidence_hashes.some((value) => !HASH.test(value))) fail("deviation_complete_status_invalid");
    else if (entry.technical_status === "PASS") {
      if (!["PASS", "accepted_deviation"].includes(entry.classification)) fail("deviation_complete_status_invalid");
    } else if (entry.technical_status === "FAIL") {
      if (entry.classification !== "FAIL" || !/^[a-z][a-z0-9_]{2,63}$/u.test(entry.measured_reason_code ?? "")) fail("deviation_complete_status_invalid");
    } else fail("deviation_complete_status_invalid");
  }
}

function referenceMap(root) {
  return JSON.parse(readFileSync(path.join(root, ".planning/phases/16-calendar-parity/16-REFERENCE-MAP.json"), "utf8"));
}

function validateComparison(evidence, map) {
  const expected = map.captures.map(({ id }) => id);
  if (evidence.comparison?.identity?.source_manifest_sha256 !== map.source_manifest_sha256
    || evidence.comparison?.native_execution !== evidence.native_execution) fail("comparison_identity_invalid");
  try {
    validateV12CalendarComparison(evidence.comparison, {
      expectedRunId: evidence.run_id,
      expectedIdentity: evidence.identity,
    });
  } catch (error) {
    fail(`comparison_schema_invalid:${error instanceof Error ? error.message : "unknown"}`);
  }
  exactIds("comparison", evidence.comparison?.records, expected);
  const statuses = [];
  for (const record of evidence.comparison.records) {
    if (!ALLOWED_CLASSIFICATIONS.has(record.classification)) fail("comparison_classification_invalid");
    if (!Array.isArray(record.differences) || record.differences.some((difference) => difference?.explained !== true)) fail("difference_unexplained");
    const artifacts = record.artifacts ?? record;
    for (const kind of ["reference", "native", "overlay", "difference", "mask", "record"]) descriptor(artifacts[kind], `comparison_${kind}`);
    if (record.classification === "accepted_deviation") {
      const deviation = evidence.deviations.find(({ id }) => id === record.deviation_id);
      if (deviation?.evidence_complete !== true || deviation.technical_status !== "PASS" || deviation.classification !== "accepted_deviation") fail("accepted_deviation_incomplete");
    } else if (record.deviation_id !== undefined) fail("comparison_deviation_invalid");
    statuses.push(record.classification === "accepted_deviation" ? "PASS" : record.classification);
  }
  const expectedStatus = statuses.includes("FAIL") ? "FAIL" : statuses.includes("REVIEW_REQUIRED") ? "REVIEW_REQUIRED" : "PASS";
  if (evidence.comparison.status !== expectedStatus) fail("comparison_status_invalid");
}

function derivedStatus(evidence) {
  const failed = evidence.functional_cases.some(({ status }) => status === "FAIL")
    || evidence.comparison.records.some(({ classification }) => classification === "FAIL")
    || evidence.deviations.some(({ technical_status }) => technical_status === "FAIL");
  if (failed) return "FAIL";
  const reviewRequired = evidence.native_execution !== "EXECUTED"
    || evidence.functional_cases.some(({ status }) => status === "REVIEW_REQUIRED")
    || evidence.comparison.records.some(({ classification }) => classification === "REVIEW_REQUIRED")
    || evidence.deviations.some(({ technical_status }) => technical_status === "REVIEW_REQUIRED")
    || evidence.diagnostics?.native_execution !== "EXECUTED";
  return reviewRequired ? "REVIEW_REQUIRED" : "PASS";
}

export function validateV12CalendarEvidence(evidence, { root = ROOT } = {}) {
  if (evidence?.schema_version !== 1
    || evidence.suite !== "v1.2-calendar"
    || (evidence.host_only_fixture === true
      ? evidence.run_id !== "phase16-host-deferred"
      : !/^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(evidence.run_id ?? ""))
    || !["NOT_RUN", "EXECUTED"].includes(evidence.native_execution)
    || evidence.acceptance_owner !== "phase20") fail("envelope_invalid");
  const fixtureMode = evidence.host_only_fixture === true;
  if (fixtureMode !== (evidence.native_execution === "NOT_RUN")) fail("fixture_mode_invalid");
  validateIdentity(evidence);
  validateFunctionalCases(evidence, fixtureMode);
  validateRouteJourneys(evidence);
  validateDeviations(evidence);
  validateComparison(evidence, referenceMap(root));
  if (fixtureMode) {
    if (evidence.diagnostics?.native_execution !== "NOT_RUN"
      || evidence.diagnostics?.status !== "REVIEW_REQUIRED"
      || evidence.diagnostics?.acceptance_owner !== "phase20"
      || Object.hasOwn(evidence.diagnostics, "verdict")) fail("fixture_diagnostics_invalid");
  } else {
    validateV12CalendarDiagnostics(evidence.diagnostics, evidence.manifest);
  }
  noPrivateData(evidence);
  const status = derivedStatus(evidence);
  if (evidence.status !== status || evidence.all_pass !== (status === "PASS")) fail("aggregate_status_mismatch");
  return Object.freeze({
    status,
    all_pass: status === "PASS",
    native_cases: evidence.functional_cases.length,
    route_journeys: evidence.route_journeys.length,
    comparisons: evidence.comparison.records.length,
  });
}

export function verifyV12CalendarArtifactSet(artifacts, { root = ROOT } = {}) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) fail("artifact_set_invalid");
  const rootReal = realpathSync(root);
  const seen = new Set();
  for (const artifact of artifacts) {
    descriptor(artifact, "artifact");
    if (seen.has(artifact.path)) fail("artifact_duplicate");
    seen.add(artifact.path);
    const absolute = path.resolve(rootReal, artifact.path);
    const relative = path.relative(rootReal, absolute);
    if (relative.length === 0 || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !existsSync(absolute)) fail("artifact_path_invalid");
    let current = rootReal;
    for (const segment of relative.split(path.sep)) {
      current = path.join(current, segment);
      if (lstatSync(current).isSymbolicLink()) fail("artifact_path_invalid");
    }
    const real = realpathSync(absolute);
    if (!real.startsWith(`${rootReal}${path.sep}`)) fail("artifact_path_invalid");
    const bytes = readFileSync(real);
    if (bytes.length === 0 || sha256(bytes) !== artifact.sha256 || (artifact.size_bytes !== undefined && artifact.size_bytes !== bytes.length)) fail("artifact_hash_invalid");
  }
  return true;
}

export function validateV12CalendarPackageScripts(packageJson) {
  const scripts = packageJson?.scripts;
  const expected = {
    "test:maestro:v12:calendar": "node scripts/run-v12-maestro.mjs --diagnostic",
    "compare:v12:calendar": "node scripts/compare-v12-calendar.mjs",
    "diagnose:v12:calendar": "node scripts/benchmark-v12-interactions.mjs",
    "test:evidence:v12:calendar": "node --test scripts/v12-evidence-scripts.test.mjs scripts/v12-calendar-comparison.test.mjs",
    "verify:v12:calendar": "node scripts/verify-v12-native-evidence.mjs",
    "test:coverage:v12:calendar": "node scripts/run-coverage-gate.mjs --focus-integrity=src/bootstrap/phase16CalendarTestControls.ts --focus-project=unit --runInBand src/bootstrap/phase16CalendarTestControls.test.ts",
  };
  for (const [name, command] of Object.entries(expected)) if (scripts?.[name] !== command) fail("package_scripts_invalid");
  return true;
}

function evidenceArtifactDescriptors(evidence) {
  return [
    evidence.artifacts?.manifest,
    evidence.artifacts?.report,
    evidence.artifacts?.comparison,
    evidence.artifacts?.diagnostics,
    ...evidence.functional_cases.map(({ artifact }) => artifact),
    ...evidence.route_journeys.map(({ artifact }) => artifact),
    ...evidence.comparison.records.flatMap((record) => {
      const artifacts = record.artifacts ?? record;
      return ["reference", "native", "overlay", "difference", "mask", "record"].map((kind) => artifacts[kind]);
    }),
  ];
}

function parseArgs(args) {
  if (args.length === 2 && args[0] === "--fixture") return { fixturePath: args[1] };
  const manifestIndex = args.indexOf("--manifest");
  if (manifestIndex >= 0 && typeof args[manifestIndex + 1] === "string" && args.includes("--automated-only")) return { manifestPath: args[manifestIndex + 1] };
  fail("argument_invalid");
}

export function executeV12CalendarEvidenceVerifier({ args = process.argv.slice(2), root = ROOT, currentIdentity } = {}) {
  const options = parseArgs(args);
  if (options.fixturePath !== undefined) {
    const evidence = JSON.parse(readFileSync(path.resolve(root, options.fixturePath), "utf8"));
    if (evidence.host_only_fixture !== true) fail("fixture_invalid");
    return validateV12CalendarEvidence(evidence, { root });
  }
  const manifestPath = path.resolve(root, options.manifestPath);
  if (!existsSync(manifestPath) || lstatSync(manifestPath).isSymbolicLink()) fail("manifest_missing");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const head = currentIdentity?.head ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const source = currentIdentity?.source ?? sourceTreeSha256(root);
  validateV12CalendarManifest(manifest, { head, source });
  const evidencePath = path.join(path.dirname(manifestPath), "evidence", "calendar-evidence.json");
  if (!existsSync(evidencePath) || lstatSync(evidencePath).isSymbolicLink()) fail("evidence_missing");
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  if (evidence.host_only_fixture === true || evidence.manifest?.source_tree_sha256 !== manifest.source_tree_sha256) fail("live_evidence_identity_invalid");
  const result = validateV12CalendarEvidence(evidence, { root });
  verifyV12CalendarArtifactSet(evidenceArtifactDescriptors(evidence), { root });
  const comparison = JSON.parse(readFileSync(path.resolve(root, evidence.artifacts.comparison.path), "utf8"));
  validateV12CalendarComparison(comparison, {
    expectedRunId: evidence.run_id,
    expectedIdentity: evidence.identity,
  });
  return result;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify({ ok: true, ...executeV12CalendarEvidenceVerifier() })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
