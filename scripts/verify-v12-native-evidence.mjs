#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  v12CalendarReferenceMapSha256,
  validateV12CalendarComparison,
} from "./compare-v12-calendar.mjs";
import { validateV12CalendarDiagnostics } from "./benchmark-v12-interactions.mjs";
import { validateV12CalendarManifest } from "./run-v12-maestro.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { V12_CALENDAR_ROUTE_JOURNEY_IDS } from "./v12-calendar-case-registry.mjs";
import { errorMessage, exactKeys } from "./node-evidence-utils.mjs";
import {
  resolveV12CalendarPath,
  stableCanonicalJson,
} from "./v12-calendar-artifacts.mjs";

const ROOT = process.cwd();
const HASH = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const PACKAGE = "com.fchoo.gymtracker.devtest";
const ALLOWED_RESULTS = new Set(["PASS", "FAIL", "REVIEW_REQUIRED"]);

export const CALENDAR_NATIVE_CASE_IDS = Object.freeze(
  Array.from({ length: 9 }, (_, index) => `NV-CAL-${String(index + 1).padStart(2, "0")}`),
);

export const CALENDAR_ROUTE_JOURNEY_IDS = V12_CALENDAR_ROUTE_JOURNEY_IDS;

const REQUIRED_DEVIATIONS = Object.freeze(["DEV-01", "DEV-02"]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fail(code) {
  throw new Error(`v12_calendar_evidence_${code}`);
}

function schema(value, keys, location) {
  if (!exactKeys(value, keys)) fail(`privacy_schema_invalid:${location}`);
}

function normalizedPath(value, code) {
  if ([typeof value !== "string", typeof value === "string" && (value.length === 0 || value.includes("\\") || path.isAbsolute(value) || path.posix.normalize(value) !== value || value.split("/").includes(".."))].some(Boolean)) fail(`${code}_path_invalid`);
  return value;
}

function descriptor(value, code, expectedPaths) {
  schema(value, value?.size_bytes === undefined ? ["path", "sha256"] : ["path", "sha256", "size_bytes"], code);
  const artifactPath = normalizedPath(value.path, code);
  if (expectedPaths !== undefined && !new Set(expectedPaths).has(artifactPath)) fail(`${code}_path_invalid`);
  if ([!HASH.test(value.sha256), value.size_bytes !== undefined && [!Number.isSafeInteger(value.size_bytes), value.size_bytes < 1].some(Boolean)].some(Boolean)) fail(`${code}_descriptor_invalid`);
}

function liveRoot(runId) {
  return `artifacts/native/v1.2/${runId}`;
}

function exactIds(label, entries, expected) {
  if ([!Array.isArray(entries), Array.isArray(entries) && entries.length !== expected.length, Array.isArray(entries) && new Set(entries.map(({ id }) => id)).size !== entries.length, Array.isArray(entries) && entries.some(({ id }, index) => id !== expected[index])].some(Boolean)) fail(`${label}_set_invalid`);
}

function monotonic(values) {
  return Array.isArray(values)
    && values.length >= 3
    && values.every((value, index) => Number.isFinite(value) && (index === 0 || value > values[index - 1]));
}

function validateIdentity(evidence, fixtureMode) {
  schema(evidence.manifest, ["schema_version", "suite", "profile", "package", "js_bundle", "base_head", "source_tree_sha256", "source_manifest_sha256", "reference_map_sha256", "apk", "installed_apk", "device", "report_sha256"], "manifest");
  schema(evidence.manifest.js_bundle, ["embedded"], "manifest.js_bundle");
  schema(evidence.manifest.apk, ["path", "sha256", "size_bytes"], "manifest.apk");
  schema(evidence.manifest.installed_apk, ["sha256", "matches_retained_apk"], "manifest.installed_apk");
  schema(evidence.manifest.device, ["identity_sha256"], "manifest.device");
  validateV12CalendarManifest(evidence.manifest);
  const identity = evidence.identity;
  const manifest = evidence.manifest;
  descriptor(manifest.apk, "manifest.apk", [fixtureMode
    ? "artifacts/native/v1.2-calendar/app.apk"
    : `${liveRoot(evidence.run_id)}/app.apk`]);
  schema(identity, ["base_head", "source_tree_sha256", "source_manifest_sha256", "reference_map_sha256", "package", "apk_sha256", "installed_apk_sha256", "device_identity_sha256", "report_sha256"], "identity");
  if ([
    !HEAD.test(identity.base_head),
    !HASH.test(identity.source_tree_sha256),
    !HASH.test(identity.source_manifest_sha256),
    !HASH.test(identity.reference_map_sha256),
    !HASH.test(identity.apk_sha256),
    !HASH.test(identity.installed_apk_sha256),
    !HASH.test(identity.device_identity_sha256),
    !HASH.test(identity.report_sha256),
    identity.base_head !== manifest.base_head,
    identity.source_tree_sha256 !== manifest.source_tree_sha256,
    identity.source_manifest_sha256 !== manifest.source_manifest_sha256,
    identity.reference_map_sha256 !== manifest.reference_map_sha256,
    identity.package !== PACKAGE,
    identity.package !== manifest.package,
    identity.apk_sha256 !== manifest.apk.sha256,
    identity.installed_apk_sha256 !== manifest.installed_apk.sha256,
    identity.device_identity_sha256 !== manifest.device.identity_sha256,
    identity.report_sha256 !== manifest.report_sha256,
  ].some(Boolean)) fail("identity_invalid");
}

function validateFunctionalCases(evidence, fixtureMode) {
  exactIds("functional_case", evidence.functional_cases, CALENDAR_NATIVE_CASE_IDS);
  for (const entry of evidence.functional_cases) {
    schema(entry, ["id", "status", "native_execution", "artifact", "observations"], "functional_case");
    schema(entry.observations, ["synthetic", "timestamps_ms", "geometry_monotonic", "semantics_monotonic", "focus_ring_dp", "focus_clearance_dp"], "functional_case.observations");
    if ([!ALLOWED_RESULTS.has(entry.status), entry.native_execution !== evidence.native_execution, !monotonic(entry.observations.timestamps_ms), entry.observations.geometry_monotonic !== true, entry.observations.semantics_monotonic !== true, entry.observations.focus_ring_dp !== 3, entry.observations.focus_clearance_dp !== 4].some(Boolean)) fail("functional_case_invalid");
    descriptor(entry.artifact, "functional_case_artifact", [fixtureMode
      ? `fixtures/${entry.id}.json`
      : `${liveRoot(evidence.run_id)}/cases/${entry.id}.json`]);
    if (fixtureMode) {
      if ([entry.status === "PASS", entry.native_execution !== "NOT_RUN", entry.observations.synthetic !== true].some(Boolean)) fail("fixture_case_invalid");
    } else if (entry.observations.synthetic === true) fail("live_case_synthetic");
  }
}

function validateRouteJourneys(evidence, fixtureMode) {
  exactIds("route_journey", evidence.route_journeys, CALENDAR_ROUTE_JOURNEY_IDS);
  const activationKinds = new Set();
  for (const entry of evidence.route_journeys) {
    schema(entry, ["id", "status", "execution", "activation", "actual_route", "actual_loader", "back_restored", "focus", "durable_identity_sha256", "source_digest_before", "source_digest_after", "command_ledger", "artifact"], "route_journey");
    schema(entry.focus, ["ring_dp", "clearance_dp", "measurement_status"], "route_journey.focus");
    const focusInvalid = fixtureMode
      ? entry.focus.clearance_dp !== null || entry.focus.measurement_status !== "NOT_RUN"
      : entry.focus.clearance_dp !== 4 || entry.focus.measurement_status !== "EXECUTED";
    if ([entry.status !== "PASS", entry.execution !== "host-component", entry.actual_route !== true, entry.actual_loader !== true, entry.back_restored !== true, entry.focus.ring_dp !== 3, focusInvalid, !HASH.test(entry.durable_identity_sha256), !HASH.test(entry.source_digest_before), entry.source_digest_after !== entry.source_digest_before, !Array.isArray(entry.command_ledger), Array.isArray(entry.command_ledger) && entry.command_ledger.length !== 0, !["touch", "keyboard"].includes(entry.activation)].some(Boolean)) fail("route_journey_invalid");
    activationKinds.add(entry.activation);
    descriptor(entry.artifact, "route_journey_artifact", [fixtureMode
      ? `fixtures/routes/${entry.id.replace(/^calendar-/u, "")}.json`
      : `${liveRoot(evidence.run_id)}/routes/${entry.id}.json`]);
  }
  if ([!activationKinds.has("touch"), !activationKinds.has("keyboard")].some(Boolean)) fail("route_activation_matrix_invalid");
}

function validateDeviations(evidence) {
  exactIds("deviation", evidence.deviations, REQUIRED_DEVIATIONS);
  for (const entry of evidence.deviations) {
    schema(entry, entry.technical_status === "FAIL"
      ? ["id", "owner_decision", "owner_decision_date", "technical_status", "evidence_complete", "classification", "evidence_hashes", "measured_reason_code"]
      : ["id", "owner_decision", "owner_decision_date", "technical_status", "evidence_complete", "classification", "evidence_hashes"], "deviation");
    if ([entry.owner_decision !== "accepted", entry.owner_decision_date !== "2026-10-07", !ALLOWED_RESULTS.has(entry.technical_status)].some(Boolean)) fail("deviation_invalid");
    if (!entry.evidence_complete) {
      if (entry.technical_status !== "REVIEW_REQUIRED" || entry.classification !== "REVIEW_REQUIRED") fail("deviation_incomplete_status_invalid");
    } else if ([!Array.isArray(entry.evidence_hashes), Array.isArray(entry.evidence_hashes) && entry.evidence_hashes.length === 0, Array.isArray(entry.evidence_hashes) && entry.evidence_hashes.some((value) => !HASH.test(value))].some(Boolean)) fail("deviation_complete_status_invalid");
    else if (entry.technical_status === "PASS") {
      if (!["PASS", "accepted_deviation"].includes(entry.classification)) fail("deviation_complete_status_invalid");
    } else if (entry.technical_status === "FAIL") {
      if ([entry.classification !== "FAIL", !/^[a-z][a-z0-9_]{2,63}$/u.test(entry.measured_reason_code)].some(Boolean)) fail("deviation_complete_status_invalid");
    } else fail("deviation_complete_status_invalid");
  }
}

function referenceMap(root, expectedSha256) {
  const mapPath = resolveV12CalendarPath(path.join(root, ".planning/phases/16-calendar-parity/16-REFERENCE-MAP.json"), { root, mustExist: true });
  const map = JSON.parse(readFileSync(mapPath, "utf8"));
  if (v12CalendarReferenceMapSha256(map) !== expectedSha256) fail("reference_map_identity_invalid");
  return map;
}

function validateComparison(evidence, map) {
  const expected = map.captures.map(({ id }) => id);
  if ([evidence.comparison?.identity?.source_manifest_sha256 !== map.source_manifest_sha256, evidence.comparison?.native_execution !== evidence.native_execution].some(Boolean)) fail("comparison_identity_invalid");
  try {
    validateV12CalendarComparison(evidence.comparison, {
      expectedRunId: evidence.run_id,
      expectedIdentity: evidence.identity,
    });
  } catch (error) {
    fail(`comparison_schema_invalid:${errorMessage(error, "unknown")}`);
  }
  exactIds("comparison", evidence.comparison?.records, expected);
  for (const record of evidence.comparison.records) {
    if (record.classification === "accepted_deviation") {
      const deviation = evidence.deviations.find(({ id }) => id === record.deviation_id);
      if ([deviation?.evidence_complete !== true, deviation?.technical_status !== "PASS", deviation?.classification !== "accepted_deviation"].some(Boolean)) fail("accepted_deviation_incomplete");
    }
  }
}

function derivedStatus(evidence) {
  const failed = [
    evidence.functional_cases.some(({ status }) => status === "FAIL"),
    evidence.comparison.status === "FAIL",
    evidence.comparison.records.some(({ classification }) => classification === "FAIL"),
    evidence.deviations.some(({ technical_status }) => technical_status === "FAIL"),
  ].some(Boolean);
  if (failed) return "FAIL";
  const reviewRequired = [
    evidence.native_execution !== "EXECUTED",
    evidence.functional_cases.some(({ status }) => status === "REVIEW_REQUIRED"),
    evidence.comparison.status === "REVIEW_REQUIRED",
    evidence.comparison.records.some(({ classification }) => ["REVIEW_REQUIRED", "accepted_deviation"].includes(classification)),
    evidence.deviations.some(({ technical_status, classification }) => technical_status === "REVIEW_REQUIRED" || classification === "accepted_deviation"),
  ].some(Boolean);
  return reviewRequired ? "REVIEW_REQUIRED" : "PASS";
}

export function validateV12CalendarEvidence(evidence, { root = ROOT } = {}) {
  schema(evidence, ["schema_version", "suite", "run_id", "host_only_fixture", "native_execution", "status", "all_pass", "acceptance_owner", "manifest", "identity", "functional_cases", "route_journeys", "deviations", "comparison", "diagnostics", "artifacts"], "evidence");
  if ([evidence.schema_version !== 1, evidence.suite !== "v1.2-calendar", evidence.host_only_fixture === true ? evidence.run_id !== "phase16-host-deferred" : !/^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(evidence.run_id), !["NOT_RUN", "EXECUTED"].includes(evidence.native_execution), evidence.acceptance_owner !== "phase20"].some(Boolean)) fail("envelope_invalid");
  const fixtureMode = evidence.host_only_fixture === true;
  if (fixtureMode !== (evidence.native_execution === "NOT_RUN")) fail("fixture_mode_invalid");
  validateIdentity(evidence, fixtureMode);
  validateFunctionalCases(evidence, fixtureMode);
  validateRouteJourneys(evidence, fixtureMode);
  validateDeviations(evidence);
  validateComparison(evidence, referenceMap(root, evidence.manifest.reference_map_sha256));
  if (fixtureMode) {
    schema(evidence.diagnostics, ["native_execution", "status", "acceptance_owner"], "diagnostics");
    if ([evidence.diagnostics.native_execution !== "NOT_RUN", evidence.diagnostics.status !== "REVIEW_REQUIRED", evidence.diagnostics.acceptance_owner !== "phase20", Object.hasOwn(evidence.diagnostics, "verdict")].some(Boolean)) fail("fixture_diagnostics_invalid");
  } else {
    validateV12CalendarDiagnostics(evidence.diagnostics, evidence.manifest);
  }
  schema(evidence.artifacts, ["manifest", "report", "comparison", "diagnostics"], "artifacts");
  const artifactPaths = fixtureMode ? {
    manifest: "fixtures/build.json",
    report: "fixtures/report.json",
    comparison: "fixtures/comparison.json",
    diagnostics: "fixtures/diagnostics.json",
  } : {
    manifest: `${liveRoot(evidence.run_id)}/build.json`,
    report: `${liveRoot(evidence.run_id)}/evidence/native-report.json`,
    comparison: `${liveRoot(evidence.run_id)}/comparison/calendar.json`,
    diagnostics: `${liveRoot(evidence.run_id)}/diagnostics/calendar.json`,
  };
  for (const [name, artifact] of Object.entries(evidence.artifacts)) descriptor(artifact, `artifacts.${name}`, [artifactPaths[name]]);
  if (evidence.artifacts.report.sha256 !== evidence.manifest.report_sha256) fail("report_identity_invalid");
  const status = derivedStatus(evidence);
  if ([evidence.status !== status, evidence.all_pass !== (status === "PASS")].some(Boolean)) fail("aggregate_status_mismatch");
  return Object.freeze({
    status,
    all_pass: status === "PASS",
    native_cases: evidence.functional_cases.length,
    route_journeys: evidence.route_journeys.length,
    comparisons: evidence.comparison.records.length,
  });
}

export function verifyV12CalendarArtifactSet(artifacts, { root = ROOT } = {}) {
  if ([!Array.isArray(artifacts), Array.isArray(artifacts) && artifacts.length === 0].some(Boolean)) fail("artifact_set_invalid");
  const seen = new Set();
  for (const artifact of artifacts) {
    descriptor(artifact, "artifact");
    if (seen.has(artifact.path)) fail("artifact_duplicate");
    seen.add(artifact.path);
    let absolute;
    try {
      absolute = resolveV12CalendarPath(path.resolve(root, artifact.path), { root, mustExist: true });
    } catch {
      fail("artifact_path_invalid");
    }
    const bytes = readFileSync(absolute);
    if ([bytes.length === 0, sha256(bytes) !== artifact.sha256, artifact.size_bytes !== undefined && artifact.size_bytes !== bytes.length].some(Boolean)) fail("artifact_hash_invalid");
  }
  return true;
}

export function validateV12CalendarPackageScripts(packageJson) {
  const scripts = packageJson?.scripts;
  const expected = {
    "test:maestro:v12:calendar": "node scripts/run-v12-maestro.mjs --diagnostic",
    "compare:v12:calendar": "node scripts/compare-v12-calendar.mjs",
    "diagnose:v12:calendar": "node scripts/benchmark-v12-interactions.mjs",
    "test:evidence:v12:calendar": "node --test scripts/v12-evidence-scripts.test.mjs scripts/v12-calendar-comparison.test.mjs scripts/v12-calendar-evidence-coverage.test.mjs",
    "verify:v12:calendar": "node scripts/verify-v12-native-evidence.mjs",
    "test:coverage:v12:calendar": "node scripts/run-coverage-gate.mjs --focus-phase16-evidence --runInBand",
  };
  for (const [name, command] of Object.entries(expected)) if (scripts?.[name] !== command) fail("package_scripts_invalid");
  return true;
}

function evidenceArtifactDescriptors(evidence) {
  return [
    evidence.manifest?.apk,
    evidence.artifacts?.manifest,
    evidence.artifacts?.report,
    evidence.artifacts?.comparison,
    evidence.artifacts?.diagnostics,
    ...evidence.functional_cases.map(({ artifact }) => artifact),
    ...evidence.route_journeys.map(({ artifact }) => artifact),
    ...evidence.comparison.case_results.map(({ artifact }) => artifact),
    ...evidence.comparison.case_results.flatMap(({ records }) => (
      Object.values(records).map(({ artifact }) => artifact)
    )),
    ...evidence.comparison.records.flatMap((record) => {
      return ["reference", "native", "overlay", "difference", "mask", "record"].map((kind) => record.artifacts[kind]);
    }),
  ];
}

function retainedJson(root, descriptorValue, expected, code) {
  const artifactPath = resolveV12CalendarPath(path.resolve(root, descriptorValue.path), { root, mustExist: true });
  const text = readFileSync(artifactPath, "utf8");
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { fail(`${code}_json_invalid`); }
  if (!isDeepStrictEqual(parsed, expected) || text !== stableCanonicalJson(parsed)) fail(`${code}_content_mismatch`);
}

function withoutArtifact(entry) {
  const { artifact, ...value } = entry;
  return value;
}

function comparisonRecordPayload(record, mapped, evidence) {
  return {
    schema_version: 2,
    id: record.id,
    requirement_ids: mapped.requirement_ids,
    classification: record.classification,
    differences: record.differences,
    reference: record.artifacts.reference,
    native: record.artifacts.native,
    overlay: record.artifacts.overlay,
    difference: record.artifacts.difference,
    mask: record.artifacts.mask,
    source_manifest_sha256: evidence.identity.source_manifest_sha256,
    source_tree_sha256: evidence.identity.source_tree_sha256,
  };
}

function parseArgs(args) {
  if (args.length === 2 && args[0] === "--fixture") return { fixturePath: args[1] };
  const manifestIndex = args.indexOf("--manifest");
  if ([manifestIndex >= 0, typeof args[manifestIndex + 1] === "string", args.includes("--automated-only")].every(Boolean)) return { manifestPath: args[manifestIndex + 1] };
  fail("argument_invalid");
}

export function executeV12CalendarEvidenceVerifier({ args = process.argv.slice(2), root = ROOT, currentIdentity } = {}) {
  const options = parseArgs(args);
  if (options.fixturePath !== undefined) {
    const evidence = JSON.parse(readFileSync(path.resolve(root, options.fixturePath), "utf8"));
    if (evidence.host_only_fixture !== true) fail("fixture_invalid");
    return validateV12CalendarEvidence(evidence, { root });
  }
  let manifestPath;
  try {
    manifestPath = resolveV12CalendarPath(path.resolve(root, options.manifestPath), { root, mustExist: true });
  } catch {
    fail("manifest_missing");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const head = currentIdentity?.head ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const source = currentIdentity?.source ?? sourceTreeSha256(root);
  validateV12CalendarManifest(manifest, { head, source });
  const evidencePath = path.join(path.dirname(manifestPath), "evidence", "calendar-evidence.json");
  let safeEvidencePath;
  try {
    safeEvidencePath = resolveV12CalendarPath(evidencePath, { root, mustExist: true });
  } catch {
    fail("evidence_missing");
  }
  const evidence = JSON.parse(readFileSync(safeEvidencePath, "utf8"));
  if ([evidence.host_only_fixture === true, !isDeepStrictEqual(evidence.manifest, manifest)].some(Boolean)) fail("live_evidence_identity_invalid");
  const result = validateV12CalendarEvidence(evidence, { root });
  verifyV12CalendarArtifactSet(evidenceArtifactDescriptors(evidence), { root });
  const comparisonPath = resolveV12CalendarPath(path.resolve(root, evidence.artifacts.comparison.path), { root, mustExist: true });
  const comparison = JSON.parse(readFileSync(comparisonPath, "utf8"));
  validateV12CalendarComparison(comparison, {
    expectedRunId: evidence.run_id,
    expectedIdentity: evidence.identity,
  });
  if (!isDeepStrictEqual(comparison, evidence.comparison)) fail("comparison_content_mismatch");
  retainedJson(root, evidence.artifacts.manifest, evidence.manifest, "manifest");
  retainedJson(root, evidence.artifacts.report, {
    schema_version: 1,
    suite: "v1.2-calendar-native-report",
    run_id: evidence.run_id,
    native_execution: "EXECUTED",
  }, "report");
  retainedJson(root, evidence.artifacts.comparison, evidence.comparison, "comparison");
  retainedJson(root, evidence.artifacts.diagnostics, evidence.diagnostics, "diagnostics");
  for (const entry of evidence.functional_cases) retainedJson(root, entry.artifact, withoutArtifact(entry), "functional_case");
  for (const entry of evidence.route_journeys) retainedJson(root, entry.artifact, withoutArtifact(entry), "route_journey");
  for (const entry of evidence.comparison.case_results) retainedJson(root, entry.artifact, withoutArtifact(entry), "case_result");
  const map = referenceMap(root, evidence.manifest.reference_map_sha256);
  const mappedById = new Map(map.captures.map((entry) => [entry.id, entry]));
  for (const record of evidence.comparison.records) {
    retainedJson(root, record.artifacts.record, comparisonRecordPayload(record, mappedById.get(record.id), evidence), "comparison_record");
  }
  return result;
}

export function runV12CalendarEvidenceVerifierCli(options = {}, io = process) {
  try {
    io.stdout.write(`${JSON.stringify({ ok: true, ...executeV12CalendarEvidenceVerifier(options) })}\n`);
    return 0;
  } catch (error) {
    io.stderr.write(`${error.message}\n`);
    return 1;
  }
}

/* node:coverage ignore next 4 */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runV12CalendarEvidenceVerifierCli();
}
