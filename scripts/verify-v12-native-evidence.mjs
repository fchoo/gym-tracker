#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
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
import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";
import {
  V12_CALENDAR_REQUIRED_CASES,
  V12_CALENDAR_ROUTE_JOURNEY_IDS,
} from "./v12-calendar-case-registry.mjs";
import { validateV12CalendarCaseSupportBytes } from "./v12-calendar-case-evidence.mjs";
import { errorMessage, exactKeys } from "./node-evidence-utils.mjs";
import {
  resolveV12CalendarPath,
  stableCanonicalJson,
} from "./v12-calendar-artifacts.mjs";
import { validateV12RunManifest as validateGenericRunManifest } from "./create-v12-run-manifest.mjs";
import { publishV12AtomicShard, validateV12ExecutionOrigin, verifyV12AtomicShard } from "./v12-atomic-shard-publication.mjs";
import {
  deriveV12Ledger as deriveContractLedger,
  loadV12ContractInputs,
  V12_VERDICTS as CONTRACT_VERDICTS,
} from "./v12-evidence-contract.mjs";
import { generateV12ParityReport } from "./generate-v12-parity-report.mjs";
import { resolveV12SourceRows, combineV12SourceResults, validateV12CalendarExecutionOrigin } from "./v12-blocker-row-resolver.mjs";
import { validateV12AttendedObservations } from "./generate-v12-attended-checklist.mjs";
import {
  V12_DEVICE_LEASE_PATHS,
  digestV12CanonicalRestorationSnapshot,
  readV12CanonicalRestorationSnapshot,
} from "./v12-device-settings-contract.mjs";

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

function evidenceArtifactDescriptors(evidence, sourceArtifacts = []) {
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
    ...sourceArtifacts,
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

function validateRetainedCaseSupport(root, caseResults) {
  const sourceArtifacts = [];
  for (const [index, caseResult] of caseResults.entries()) {
    const requiredCase = V12_CALENDAR_REQUIRED_CASES[index];
    const bytesByKind = Object.fromEntries(Object.entries(caseResult.records).map(([kind, record]) => {
      const artifactPath = resolveV12CalendarPath(path.resolve(root, record.artifact.path), {
        root,
        mustExist: true,
      });
      return [kind, readFileSync(artifactPath)];
    }));
    const runRoot = path.resolve(root, liveRoot(caseResult.execution.run_id));
    const validated = validateV12CalendarCaseSupportBytes({
      requiredCase,
      caseResult,
      bytesByKind,
      readArtifactBytes: (artifactPath) => readFileSync(resolveV12CalendarPath(
        path.resolve(root, artifactPath),
        { root: runRoot, mustExist: true },
      )),
    });
    sourceArtifacts.push(...validated.sourceArtifacts);
  }
  return sourceArtifacts;
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
  const sourceArtifacts = validateRetainedCaseSupport(root, evidence.comparison.case_results);
  verifyV12CalendarArtifactSet(evidenceArtifactDescriptors(evidence, sourceArtifacts), { root });
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
// Phase 20's v1.2 ledger is intentionally separate from the retained Calendar
// verifier above.  Shards can state only measured observations; this module is
// the sole place that turns those observations into row verdicts or writes the
// two canonical final artifacts.
const V12_FINAL_RUN = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const FINAL_RESULTS = new Set(["NOT_RUN", "PASS", "FAIL", "REVIEW_REQUIRED", "N_A_REVIEWED"]);
const SETTLED_BASELINES = new Set(["MAP-01", "TIM-01", "DEV-01", "DEV-02", "GARMIN_TRANSPORT"]);

function finalFail(code) {
  throw new Error(`v12_final_${code}`);
}

function finalPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function finalExact(value, keys) {
  return finalPlainObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function finalSafeArtifactPath(value, runId) {
  const prefix = `artifacts/native/v1.2/${runId}/`;
  if (typeof value !== "string" || !value.startsWith(prefix) || value.includes("\\") || value.includes("//")
    || value.split("/").some((part) => part === "" || part === "." || part === "..")) finalFail("artifact_path_invalid");
}

function finalHasPrivateValue(value) {
  if (Array.isArray(value)) return value.some(finalHasPrivateValue);
  if (finalPlainObject(value)) return Object.entries(value).some(([key, child]) => (
    /(?:serial|token|secret|password|email|absolute_path|device_path)/iu.test(key) || finalHasPrivateValue(child)
  ));
  return typeof value === "string" && (path.isAbsolute(value) || /(?:\/Users\/|C:\\Users\\|content:\/\/)/iu.test(value));
}

export const V12_FINAL_VERDICTS = CONTRACT_VERDICTS;

export function validateV12RunManifest(manifest, currentIdentity = undefined) {
  let validated;
  try { validated = validateGenericRunManifest(manifest); }
  catch { finalFail("run_manifest_invalid"); }
  if (validated.mode !== "live" || !V12_FINAL_RUN.test(validated.run_id)) finalFail("run_manifest_invalid");
  if (currentIdentity !== undefined) {
    const expected = {
      head: validated.source.head,
      tree_sha256: validated.source.tree_sha256,
      package: validated.build.package,
      apk_sha256: validated.build.apk.sha256,
      installed_apk_sha256: validated.device.installed_apk_sha256,
      certificate_sha256: validated.build.apk.certificate_sha256,
      device_identity_sha256: validated.device.identity_sha256,
      settings_sha256: validated.device.settings_sha256,
      configuration_id: validated.configuration.id,
    };
    if (Object.entries(expected).some(([key, value]) => currentIdentity[key] !== value)) finalFail("run_identity_stale");
  }
  return validated;
}

function finalEvidenceIndex(inputs, manifest, evidence, readArtifact) {
  const expectedIds = inputs.matrix.rows.map(({ requirement_id }) => requirement_id);
  if (!Array.isArray(evidence) || evidence.length !== expectedIds.length) finalFail("evidence_set_invalid");
  const indexed = new Map();
  for (const [index, item] of evidence.entries()) {
    const expectedKeys = item?.result === "N_A_REVIEWED"
      ? ["row_id", "artifact", "sha256", "result", "configuration_id", "na"]
      : ["row_id", "artifact", "sha256", "result", "configuration_id", "selector", "bindings"];
    if (!finalExact(item, expectedKeys) || Object.hasOwn(item, "verdict")) finalFail(Object.hasOwn(item ?? {}, "verdict") ? "producer_verdict_forbidden" : "evidence_schema_invalid");
    if (item.row_id !== expectedIds[index] || indexed.has(item.row_id) || !FINAL_RESULTS.has(item.result)
      || !HASH.test(item.sha256) || typeof item.configuration_id !== "string" || finalHasPrivateValue(item)) finalFail("evidence_schema_invalid");
    finalSafeArtifactPath(item.artifact, manifest.run_id);
    let artifactBytes;
    try { artifactBytes = readArtifact(item.artifact); }
    catch { finalFail("artifact_read_failed"); }
    if (!Buffer.isBuffer(artifactBytes) || artifactBytes.length === 0 || sha256(artifactBytes) !== item.sha256) finalFail("artifact_hash_invalid");
    if (item.result === "N_A_REVIEWED") {
      if (!finalExact(item.na, ["reason", "reviewer", "reviewed_at"])) finalFail("na_metadata_invalid");
    }
    indexed.set(item.row_id, item);
  }
  return indexed;
}

function finalExceptionIndex(exceptions, inputs) {
  if (!Array.isArray(exceptions)) finalFail("exception_set_invalid");
  const rowIds = new Set(inputs.matrix.rows.map(({ requirement_id }) => requirement_id));
  const indexed = new Map();
  for (const exception of exceptions) {
    if (!finalExact(exception, ["row_id", "deviation_id", "owner_decision", "decided_at", "scope", "configurations", "rationale", "evidence_hashes"])
      || !rowIds.has(exception.row_id) || indexed.has(exception.row_id) || typeof exception.deviation_id !== "string"
      || SETTLED_BASELINES.has(exception.deviation_id) || typeof exception.owner_decision !== "string"
      || !/^\d{4}-\d{2}-\d{2}$/u.test(exception.decided_at ?? "") || typeof exception.scope !== "string"
      || typeof exception.rationale !== "string" || !Array.isArray(exception.configurations) || exception.configurations.length === 0
      || !Array.isArray(exception.evidence_hashes) || exception.evidence_hashes.length === 0
      || exception.evidence_hashes.some((hash) => !HASH.test(hash)) || finalHasPrivateValue(exception)) finalFail("exception_metadata_invalid");
    indexed.set(exception.row_id, exception);
  }
  return indexed;
}

function finalReadinessPolicy(policy) {
  if (policy === null || policy === undefined) return undefined;
  if (!finalExact(policy, ["policy_id", "reviewed_by", "reviewed_at", "permits_accepted_exceptions"])
    || typeof policy.policy_id !== "string" || typeof policy.reviewed_by !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/u.test(policy.reviewed_at ?? "") || policy.permits_accepted_exceptions !== true) finalFail("readiness_policy_invalid");
  return Object.freeze({ ...policy });
}

function validateV12AttendedBinding(attended, manifest, root) {
  if (!finalPlainObject(attended) || attended.schema_version !== 2 || attended.suite !== "v12-samsung-attended"
    || attended.mode !== "observation-only" || attended.release_authorized !== false || !["passed", "failed"].includes(attended.status)
    || !Array.isArray(attended.rows) || attended.rows.length !== 7 || !finalPlainObject(attended.identity)) finalFail("attended_invalid");
  if (!finalExact(attended, ["schema_version", "suite", "mode", "status", "release_authorized", "identity", "checklist_sha256", "recorded_at", "rows"])) finalFail("attended_schema_invalid");
  const identity = attended.identity;
  if (identity.run_id !== manifest.run_id || identity.source_tree_sha256 !== manifest.source.tree_sha256
    || identity.apk_sha256 !== manifest.build.apk.sha256 || identity.apk_signature_sha256 !== manifest.build.apk.signature_sha256
    || identity.installed_apk_sha256 !== manifest.device.installed_apk_sha256 || identity.config_sha256 !== sha256(manifest.configuration.id)
    || identity.device?.device_sha256 !== manifest.device.identity_sha256) finalFail("attended_identity_invalid");
  try { validateV12AttendedObservations({ schema_version: 2, suite: "v12-samsung-attended-observations", identity, settings_restored: true, rows: attended.rows.map(({ id, status, png }) => ({ id, status, png })) }, { identity, root }); }
  catch { finalFail("attended_row_invalid"); }
  if (attended.status !== (attended.rows.every(({ status }) => status === "passed") ? "passed" : "failed")) finalFail("attended_status_invalid");
  return attended;
}

export function deriveV12Ledger({ inputs, manifest, evidence, exceptions = [], readiness_policy = undefined, readArtifact, attended = undefined, root = ROOT, allowTestCalendarFixture = false } = {}) {
  const validatedManifest = validateV12RunManifest(manifest);
  if (finalHasPrivateValue(evidence) || finalHasPrivateValue(exceptions)) finalFail("privacy_invalid");
  if (typeof readArtifact !== "function") finalFail("artifact_reader_required");
  // One immutable byte snapshot per derivation: the attended overlay reuses
  // these validated bytes, never a cache from an earlier preseal/final call.
  const artifactSnapshot = new Map();
  const readSource = relative => {
    if (!artifactSnapshot.has(relative)) artifactSnapshot.set(relative, readArtifact(relative));
    return artifactSnapshot.get(relative);
  };
  finalEvidenceIndex(inputs, validatedManifest, evidence, readSource);
  const sourceEvidence = resolveV12SourceRows({ inputs, manifest: validatedManifest, root, readArtifact: readSource, allowTestCalendarFixture });
  if (!isDeepStrictEqual(evidence, sourceEvidence)) finalFail("source_resolution_mismatch");
  const attendedRecord = attended === undefined ? null : validateV12AttendedBinding(attended, validatedManifest, root);
  const resolvedEvidence = attendedRecord === null ? sourceEvidence
    : resolveV12SourceRows({ inputs, manifest: validatedManifest, root, readArtifact: readSource, attended: attendedRecord, allowTestCalendarFixture });
  const evidenceByRow = new Map(resolvedEvidence.map(item => [item.row_id, item]));
  const exceptionsByRow = finalExceptionIndex(exceptions, inputs);
  const verdicts = inputs.matrix.rows.map(({ requirement_id }) => {
    const item = evidenceByRow.get(requirement_id);
    const exception = exceptionsByRow.get(requirement_id);
    // An exception records an accepted deviation from otherwise successful
    // evidence. It is never allowed to rewrite a missing, failed, or
    // human-review-required result into a softer ledger state.
    if (exception !== undefined) {
      if (["FAIL", "NOT_RUN", "REVIEW_REQUIRED"].includes(item.result)) return { row_id: requirement_id, verdict: item.result };
      return { row_id: requirement_id, verdict: "ACCEPTED_EXCEPTION", ...exception };
    }
    return item.result === "N_A_REVIEWED"
      ? { row_id: requirement_id, verdict: item.result, ...item.na }
      : { row_id: requirement_id, verdict: item.result };
  });
  const baseLedger = deriveContractLedger(inputs, { observations: resolvedEvidence.map((item) => ({ row_id: item.row_id, source: "final-validator", status: item.result })), verdicts });
  const policy = finalReadinessPolicy(readiness_policy);
  const counts = baseLedger.verdict_counts;
  const attendedBlocked = attendedRecord !== null && attendedRecord.status !== "passed";
  const hardBlock = counts.NOT_RUN > 0 || counts.FAIL > 0 || counts.REVIEW_REQUIRED > 0 || attendedBlocked;
  const readiness = hardBlock ? "NOT_READY"
    : counts.ACCEPTED_EXCEPTION > 0 ? (policy === undefined ? "NOT_READY" : "CONDITIONALLY_READY")
      : "READY";
  return Object.freeze({
    ...baseLedger,
    run_id: validatedManifest.run_id,
    evidence_origin: validatedManifest.evidence_origin ?? "unspecified",
    identity: Object.freeze({
      run_id: validatedManifest.run_id,
      source_tree_sha256: validatedManifest.source.tree_sha256,
      apk_sha256: validatedManifest.build.apk.sha256,
      apk_signature_sha256: validatedManifest.build.apk.signature_sha256,
      installed_apk_sha256: validatedManifest.device.installed_apk_sha256,
      device_sha256: validatedManifest.device.identity_sha256,
      config_sha256: sha256(validatedManifest.configuration.id),
    }),
    source_results: Object.freeze(resolvedEvidence.map(({ sha256: evidence_sha256, ...item }) => Object.freeze({ ...item, evidence_sha256 }))),
    evidence_hashes: Object.freeze(resolvedEvidence.map(({ sha256: evidence_sha256 }) => evidence_sha256)),
    gates: Object.freeze([
      Object.freeze({ id: "identity", verdict: "PASS", evidence_sha256: sha256(JSON.stringify(validatedManifest)) }),
      Object.freeze({ id: "automated", verdict: combineV12SourceResults(resolvedEvidence.map(item => item.result)), evidence_sha256: sha256(JSON.stringify(resolvedEvidence)) }),
      ...(attendedRecord === null ? [] : [Object.freeze({ id: "attended", verdict: attendedRecord.status === "passed" ? "PASS" : "FAIL", evidence_sha256: sha256(JSON.stringify(attendedRecord)) })]),
    ]),
    readiness,
    accepted_exception_count: counts.ACCEPTED_EXCEPTION,
    policy: policy ?? null,
  });
}

export function sealV12FinalEvidence({ mode, run_id, ledger, writeImmutableJson } = {}) {
  if (mode !== "final") finalFail("explicit_final_mode_required");
  if (ledger?.evidence_origin !== "native") finalFail("test_origin_forbidden");
  if (!V12_FINAL_RUN.test(run_id ?? "") || ledger?.run_id !== run_id || ledger?.rows?.length !== 172
    || typeof writeImmutableJson !== "function") finalFail("seal_input_invalid");
  if (!Array.isArray(ledger.source_results) || ledger.source_results.length !== 172
    || ledger.source_results.some((item, index) => !item.selector || item.row_id !== ledger.rows[index].requirement_id
      || (["FAIL", "NOT_RUN", "REVIEW_REQUIRED"].includes(item.result) && (ledger.rows[index].verdict !== item.result || ledger.readiness !== "NOT_READY")))) finalFail("seal_source_results_invalid");
  const base = `artifacts/native/v1.2/${run_id}`;
  const matrix = Object.freeze({ schema_version: 3, run_id, evidence_origin: ledger.evidence_origin, rows: ledger.rows, verdict_counts: ledger.verdict_counts, readiness: ledger.readiness, release_authorized: false });
  const finalEvidence = Object.freeze({
    schema_version: 3,
    run_id,
    evidence_origin: ledger.evidence_origin,
    identity: ledger.identity ?? null,
    rows: ledger.rows,
    source_results: ledger.source_results ?? [],
    evidence_hashes: ledger.evidence_hashes ?? [],
    gates: ledger.gates ?? [],
    readiness: ledger.readiness,
    verdict_counts: ledger.verdict_counts,
    accepted_exception_count: ledger.accepted_exception_count,
    release_authorized: false,
    policy: ledger.policy,
  });
  writeImmutableJson(`${base}/ui-state-matrix.json`, matrix);
  writeImmutableJson(`${base}/final-evidence.json`, finalEvidence);
  return finalEvidence;
}

// The Phase 20 interface is deliberately distinct from the Calendar verifier
// above. Calendar's legacy flags remain available only when no unified mode is
// supplied; accepting a mixture would silently validate the wrong contract.
// This is the sole Phase 20 artifact registry.  Do not add a convenient
// aggregate here: every plan-declared output has an identity-bearing entry so
// preseal cannot be satisfied by a substitute sqlite.json/recovery.json pair.
export const V12_ARTIFACT_REGISTRY = Object.freeze({
  sqlite: Object.freeze(["sqlite/migration.json", "sqlite/portability.json", "sqlite/history.json"]),
  recovery: Object.freeze(["recovery/lifecycle.json", "maestro/recovery.xml"]),
  garmin: Object.freeze(["garmin/packaging-auth.json", "garmin/sync-read.json", "garmin/dedupe.json", "garmin/matching.json", "maestro/garmin-progress.xml"]),
  calendar: Object.freeze(["calendar-transitions.json", "calendar-requirements.json", "maestro/calendar.xml", "maestro/calendar-requirements.xml", "calendar/artifact-registry.json"]),
  "multi-plan": Object.freeze(["maestro/multi-plan.xml", "mapping/multi-plan.json"]),
  workout: Object.freeze(["maestro/workout.xml", "mapping/workout.json"]),
  "library-running": Object.freeze(["maestro/library-running.xml", "mapping/library-running.json"]),
  visual: Object.freeze(["screenshots/index.json", "comparison/index.json"]),
  accessibility: Object.freeze(["semantics/accessibility.json", "geometry/hit-targets.json"]),
  performance: Object.freeze(["performance.json"]),
});
const V12_PREFLIGHT_SHARDS = V12_ARTIFACT_REGISTRY;
const V12_PREFLIGHT_FINAL_OUTPUTS = Object.freeze(["ui-state-matrix.json", "final-evidence.json", "parity-report.md", "readiness-handoff.md"]);
const V12_ADAPTER_SHARDS = Object.freeze(["sqlite", "recovery", "garmin", "calendar", "visual", "comparison", "accessibility", "performance"]);
const V12_ADAPTER_SHARD_ORIGINS = Object.freeze({
  sqlite: Object.freeze({ action: "sqlite", domain: "scripts/v12-production-native-runtime.mjs" }),
  recovery: Object.freeze({ action: "recovery", domain: "scripts/v12-production-native-domain-actions.mjs" }),
  garmin: Object.freeze({ action: "garmin", domain: "scripts/v12-production-native-domain-actions.mjs" }),
  calendar: Object.freeze({ action: "calendar", domain: "scripts/v12-production-native-calendar-action.mjs" }),
  visual: Object.freeze({ action: "visual-capture", domain: "scripts/v12-production-native-visual-actions.mjs" }),
  comparison: Object.freeze({ action: "visual-compare", domain: "scripts/v12-production-native-visual-actions.mjs" }),
  accessibility: Object.freeze({ action: "accessibility", domain: "scripts/v12-production-native-quality-actions.mjs" }),
  performance: Object.freeze({ action: "performance", domain: "scripts/v12-production-native-quality-actions.mjs" }),
});

function preflightFail(code) { throw new Error(`v12_preflight_${code}`); }

function preflightRunId(value) {
  if (!V12_FINAL_RUN.test(value ?? "")) preflightFail("run_id_invalid");
  return value;
}

function preflightSafeRelative(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || path.isAbsolute(value)
    || path.posix.normalize(value) !== value || value.split("/").some((part) => part === "" || part === "." || part === "..")) preflightFail("path_invalid");
  return value;
}

function preflightSafeFile(root, relative, { required = true } = {}) {
  const projectRoot = path.resolve(root);
  const safe = preflightSafeRelative(relative);
  const resolved = path.resolve(projectRoot, safe);
  if (!(resolved === projectRoot || resolved.startsWith(`${projectRoot}${path.sep}`))) preflightFail("path_invalid");
  if (!existsSync(resolved)) { if (required) preflightFail("artifact_missing"); return null; }
  let cursor = projectRoot;
  for (const part of safe.split("/")) {
    cursor = path.join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) preflightFail("symlink_forbidden");
  }
  const real = realpathSync(resolved);
  if (!(real === projectRoot || real.startsWith(`${projectRoot}${path.sep}`)) || !lstatSync(real).isFile()) preflightFail("artifact_invalid");
  return real;
}

function preflightHashFile(root, relative, options) {
  const file = preflightSafeFile(root, relative, options);
  if (file === null) return null;
  return sha256(readFileSync(file));
}

export function validateV12FinalNativeIdentity(manifest, observed) {
  if (!finalPlainObject(manifest) || manifest.evidence_origin === "test") finalFail("test_origin_forbidden");
  if (manifest.evidence_origin !== "native") finalFail("native_identity_invalid");
  if (!finalExact(observed, ["source_head", "source_tree_sha256", "apk_sha256", "apk_size_bytes", "signature_sha256", "certificate_sha256", "installed_apk_sha256", "device_identity_sha256", "settings_sha256"])) finalFail("native_identity_invalid");
  const expected = {
    source_head: manifest.source?.head,
    source_tree_sha256: manifest.source?.tree_sha256,
    apk_sha256: manifest.build?.apk?.sha256,
    apk_size_bytes: manifest.build?.apk?.size_bytes,
    signature_sha256: manifest.build?.apk?.signature_sha256,
    certificate_sha256: manifest.build?.apk?.certificate_sha256,
    installed_apk_sha256: manifest.device?.installed_apk_sha256,
    device_identity_sha256: manifest.device?.identity_sha256,
    settings_sha256: manifest.device?.settings_sha256,
  };
  if (!isDeepStrictEqual(observed, expected) || manifest.device?.restoration_sha256 !== observed.settings_sha256) finalFail("native_identity_invalid");
  return true;
}

function finalNativeCommand(program, args, options = {}) {
  try { return execFileSync(program, args, { maxBuffer: 1024 * 1024 * 1024, ...options }); }
  catch { preflightFail("native_identity_invalid"); }
}

function finalAndroidTool(name) {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (typeof sdk !== "string" || sdk.length === 0) preflightFail("native_identity_invalid");
  const file = name === "adb" ? path.join(sdk, "platform-tools", "adb") : path.join(sdk, "build-tools", "36.0.0", name);
  if (!existsSync(file) || !lstatSync(file).isFile()) preflightFail("native_identity_invalid");
  return file;
}

export function verifyV12FinalNativeIdentity(manifest, { root = ROOT } = {}) {
  if (manifest.evidence_origin === "test") preflightFail("test_origin_forbidden");
  if (manifest.evidence_origin !== "native") preflightFail("native_origin_required");
  const apkFile = preflightSafeFile(root, manifest.build?.apk?.path);
  const apkBytes = readFileSync(apkFile);
  const apksigner = finalAndroidTool("apksigner"); const adb = finalAndroidTool("adb");
  const signatureReport = finalNativeCommand(apksigner, ["verify", "--verbose", "--print-certs", apkFile]);
  const certificate = /certificate SHA-256 digest:\s*([A-Fa-f0-9:]{64,95})/u.exec(signatureReport.toString("utf8"))?.[1]?.replaceAll(":", "").toLowerCase();
  if (!HASH.test(certificate ?? "")) preflightFail("native_identity_invalid");
  const serial = process.env.V12_DEVICE_SERIAL;
  if (typeof serial !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/u.test(serial)) preflightFail("native_identity_invalid");
  const adbText = (...args) => finalNativeCommand(adb, ["-s", serial, ...args], { encoding: "utf8" }).trim();
  if (adbText("get-state") !== "device") preflightFail("native_identity_invalid");
  const abi = adbText("shell", "getprop", "ro.product.cpu.abi");
  const apiLevel = adbText("shell", "getprop", "ro.build.version.sdk");
  const model = adbText("shell", "getprop", "ro.product.model");
  const installedPaths = adbText("shell", "pm", "path", manifest.build.package).split(/\r?\n/u).filter(Boolean);
  if (installedPaths.length !== 1 || !/^package:\/data\/app\/[A-Za-z0-9_./=+-]+\.apk$/u.test(installedPaths[0])) preflightFail("native_identity_invalid");
  const installedBytes = finalNativeCommand(adb, ["-s", serial, "exec-out", "cat", installedPaths[0].slice("package:".length)]);
  const settings = [adbText("shell", "settings", "get", "system", "font_scale"), adbText("shell", "settings", "get", "secure", "ui_night_mode"), adbText("shell", "settings", "get", "global", "animator_duration_scale")];
  validateV12FinalNativeIdentity(manifest, {
    source_head: finalNativeCommand("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    source_tree_sha256: sourceTreeSha256(root), apk_sha256: sha256(apkBytes), apk_size_bytes: apkBytes.length,
    signature_sha256: sha256(signatureReport), certificate_sha256: certificate,
    installed_apk_sha256: sha256(installedBytes), device_identity_sha256: phase18DeviceIdentitySha256({ serial, abi, apiLevel, model }),
    settings_sha256: sha256(`${settings.join("\n")}\n`),
  });
  return true;
}

function preflightCollectFiles(root, runId) {
  const runPrefix = `artifacts/native/v1.2/${runId}`;
  const directory = preflightSafeFile(root, `${runPrefix}/build.json`).slice(0, -"build.json".length);
  const result = [];
  const walk = (absolute, relative) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const childRelative = `${relative}/${entry.name}`;
      const childAbsolute = path.join(absolute, entry.name);
      if (entry.isSymbolicLink()) preflightFail("symlink_forbidden");
      if (entry.isDirectory()) walk(childAbsolute, childRelative);
      else if (entry.isFile()) result.push(childRelative);
      else preflightFail("artifact_invalid");
    }
  };
  walk(directory, runPrefix);
  return result.sort();
}

function preflightWriteOnce(root, relative, value) {
  const target = path.resolve(root, preflightSafeRelative(relative));
  const projectRoot = path.resolve(root);
  if (!target.startsWith(`${projectRoot}${path.sep}`)) preflightFail("path_invalid");
  if (existsSync(target)) preflightFail("output_exists");
  const directory = path.dirname(target);
  mkdirSync(directory, { recursive: true });
  const temporary = `${target}.partial-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    if (existsSync(target)) preflightFail("output_exists");
    renameSync(temporary, target);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

export function parseV12EvidenceCliArgs(args) {
  if (!Array.isArray(args) || args[0] !== "--run" || args[2] !== "--mode" || args.length < 4) preflightFail("cli_invalid");
  const run_id = preflightRunId(args[1]);
  const mode = args[3];
  if (mode === "shards-only" && args.length === 6 && args[4] === "--ids") {
    const ids = args[5].split(",");
    if (ids.length === 0 || ids.some((id) => !Object.hasOwn(V12_PREFLIGHT_SHARDS, id)) || new Set(ids).size !== ids.length) preflightFail("cli_invalid");
    return Object.freeze({ run_id, mode, ids, no_final_write: false });
  }
  if (mode === "preseal" && args.length === 5 && args[4] === "--no-final-write") return Object.freeze({ run_id, mode, ids: null, no_final_write: true });
  if (mode === "final" && args.length === 4) return Object.freeze({ run_id, mode, ids: null, no_final_write: false });
  if (mode === "test-resolve" && args.length === 4) return Object.freeze({ run_id, mode, ids: null, no_final_write: true });
  preflightFail("cli_invalid");
}

function preflightManifest(root, runId) {
  const relative = `artifacts/native/v1.2/${runId}/build.json`;
  const file = preflightSafeFile(root, relative);
  let manifest;
  try { manifest = JSON.parse(readFileSync(file, "utf8")); } catch { preflightFail("build_invalid"); }
  validateV12RunManifest(manifest);
  if (manifest.run_id !== runId) preflightFail("build_invalid");
  return { manifest, build_sha256: sha256(readFileSync(file)) };
}

function preflightPng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) preflightFail("png_invalid");
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1) preflightFail("png_invalid");
}

function preflightIdentityText(text, manifest) {
  const required = [manifest.source.tree_sha256, manifest.build.apk.sha256, manifest.device.installed_apk_sha256, manifest.device.identity_sha256];
  if (required.some((value) => !text.includes(value))) preflightFail("artifact_identity_invalid");
}

function preflightVerifyArtifact(root, runId, relative, manifest, allowTestCalendarFixture = false) {
  const full = `artifacts/native/v1.2/${runId}/${relative}`;
  const file = preflightSafeFile(root, full); const bytes = readFileSync(file);
  if (relative.endsWith(".xml")) {
    const text = bytes.toString("utf8");
    if (!/<testsuite[ >]/u.test(text) || !/<testcase[ >]/u.test(text)) preflightFail("xml_schema_invalid");
  } else {
    let value; try { value = JSON.parse(bytes.toString("utf8")); } catch { preflightFail("json_schema_invalid"); }
    if (!finalPlainObject(value) || (value.run_id !== undefined && value.run_id !== runId) || typeof value.producer !== "string") preflightFail("json_schema_invalid");
    if (relative === "calendar-transitions.json") {
      try { validateV12CalendarExecutionOrigin(value.execution_origin, root, allowTestCalendarFixture); } catch { preflightFail("calendar_origin_invalid"); }
    }
    if (relative === "screenshots/index.json") {
      if (value.schema_version !== 2 || value.producer !== "v12-visual-capture-index/v2" || value.capture_count !== 107 * 64
        || !Array.isArray(value.windows) || value.windows.length < 1 || !Array.isArray(value.records) || value.records.length !== 107 * 64) preflightFail("visual_index_invalid");
      const nonces = new Set();
      for (const record of value.records) {
        const descriptor = record?.native_png;
        const receipt = record?.settings?.state_receipt;
        if (record?.schema_version !== 3 || record.producer !== "v12-visual-capture/v3" || !descriptor || typeof descriptor.path !== "string" || !HASH.test(descriptor.sha256)
          || receipt?.schema_version !== 3 || !/^[a-f0-9]{32}$/u.test(receipt.nonce ?? "") || nonces.has(receipt.nonce)
          || receipt.run_id !== runId || receipt.state_id !== record.state_id || receipt.configuration_id !== record.configuration_id
          || receipt.png_sha256 !== descriptor.sha256 || receipt.source_receipt?.nonce !== receipt.nonce || !HASH.test(receipt.source_receipt?.digest ?? "")) preflightFail("visual_record_invalid");
        nonces.add(receipt.nonce);
        const pngFile = preflightSafeFile(root, descriptor.path);
        const png = readFileSync(pngFile); preflightPng(png);
        if (sha256(png) !== descriptor.sha256) preflightFail("visual_png_hash_invalid");
      }
    }
    if (relative === "comparison/index.json" && (value.schema_version !== 3 || value.producer !== "v12-visual-comparison-index/v3" || value.comparison_count !== 107 * 64
      || !Array.isArray(value.windows) || value.windows.length < 1 || !Array.isArray(value.results) || value.results.length !== 107 * 64
      || value.results.some((entry) => entry.state_receipt?.schema_version !== 3 || entry.capture_state_receipt?.schema_version !== 3
        || entry.state_receipt.nonce === entry.capture_state_receipt.nonce))) preflightFail("comparison_index_invalid");
    if (relative === "performance.json" && (!value.observation || !Array.isArray(value.observation.raw_samples?.warm_launch_to_interactive_ms))) preflightFail("performance_schema_invalid");
    if (relative === "semantics/accessibility.json" && (!Array.isArray(value.observations) || value.observations.length === 0)) preflightFail("accessibility_schema_invalid");
  }
  return { path: full, sha256: sha256(bytes) };
}

function assertNonTestEvidenceEnvironment() {
  if (process.env.NODE_ENV === "test" || process.env.V12_PHASE20_BLACKBOX !== undefined
    || process.env.V12_NATIVE_ADAPTER_TEST_MODE !== undefined
    || process.env.V12_NATIVE_ADAPTER_TEST_PROCESS !== undefined
    || process.env.V12_NATIVE_ADAPTER_COMMAND !== undefined) preflightFail("test_provenance_forbidden");
}

export function validateV12ProductionPublicationOrigins(root, runId) {
  const adapterSha256 = sha256(readFileSync(preflightSafeFile(root, "scripts/v12-native-adapter.mjs")));
  const launcherSha256 = sha256(readFileSync(preflightSafeFile(root, "scripts/v12-production-native-adapter-launcher.mjs")));
  for (const shard of V12_ADAPTER_SHARDS) {
    const expected = V12_ADAPTER_SHARD_ORIGINS[shard];
    let publication;
    try { publication = JSON.parse(readFileSync(preflightSafeFile(root, `artifacts/native/v1.2/${runId}/publication/${shard}.json`), "utf8")); }
    catch { preflightFail("adapter_provenance_missing"); }
    let origin;
    try { origin = validateV12ExecutionOrigin(publication.execution_origin); }
    catch { preflightFail("adapter_provenance_invalid"); }
    if (origin.kind === "test-fixture" || origin.test_only === true || origin.default_launcher !== true) preflightFail("test_provenance_forbidden");
    const domainSha256 = sha256(readFileSync(preflightSafeFile(root, expected.domain)));
    if (origin.action !== expected.action || origin.adapter_source_sha256 !== adapterSha256
      || origin.launcher_source_sha256 !== launcherSha256 || origin.domain_source_sha256 !== domainSha256) preflightFail("adapter_provenance_stale");
  }
  return true;
}

function defaultApkSignature(apkPath) {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (typeof sdk !== "string" || sdk.length === 0) preflightFail("final_identity_invalid");
  const apksigner = path.join(sdk, "build-tools", "36.0.0", "apksigner");
  if (!existsSync(apksigner)) preflightFail("final_identity_invalid");
  let report;
  try { report = execFileSync(apksigner, ["verify", "--verbose", "--print-certs", apkPath], { maxBuffer: 16 * 1024 * 1024 }); }
  catch { preflightFail("final_identity_invalid"); }
  const text = report.toString("utf8");
  const certificate = /certificate SHA-256 digest:\s*([A-Fa-f0-9:]{64,95})/u.exec(text)?.[1]?.replaceAll(":", "").toLowerCase();
  if (!text.includes("Verified using v2 scheme (APK Signature Scheme v2): true") || !HASH.test(certificate ?? "")) preflightFail("final_identity_invalid");
  return { signature_sha256: sha256(report), certificate_sha256: certificate };
}

export function readV12FinalDeviceState(manifest, {
  serial = process.env.V12_DEVICE_SERIAL,
  executeAdb = (...args) => execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 20_000 }),
} = {}) {
  if (typeof serial !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/u.test(serial)) preflightFail("final_identity_invalid");
  const adb = (...args) => {
    try { return String(executeAdb(...args)).trim(); }
    catch { preflightFail("final_identity_invalid"); }
  };
  if (adb("get-state") !== "device") preflightFail("final_identity_invalid");
  const abi = adb("shell", "getprop", "ro.product.cpu.abi");
  const identity_sha256 = phase18DeviceIdentitySha256({ serial, abi, apiLevel: adb("shell", "getprop", "ro.build.version.sdk"), model: adb("shell", "getprop", "ro.product.model") });
  const installed = adb("shell", "pm", "path", manifest.build.package);
  if (!/^package:\/data\/app\/[A-Za-z0-9_./=+-]+\.apk$/u.test(installed)) preflightFail("final_identity_invalid");
  const installed_apk_sha256 = adb("shell", "sha256sum", installed.slice(8)).split(/\s/u)[0];
  const restoration = readV12CanonicalRestorationSnapshot((args) => adb(...args));
  const leaseCommand = `${V12_DEVICE_LEASE_PATHS.map((leasePath) => `[ ! -e '${leasePath}' ]`).join(" && ")} && printf clear || printf active`;
  const lease_state = adb("shell", "sh", "-c", leaseCommand);
  return {
    identity_sha256,
    installed_apk_sha256,
    abi,
    restoration_sha256: digestV12CanonicalRestorationSnapshot(restoration),
    lease_state,
  };
}

export function validateV12FinalProductionIdentity(manifest, {
  root = ROOT,
  currentHead = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  currentSourceTreeSha256 = () => sourceTreeSha256(root),
  verifyApkSignature = defaultApkSignature,
  readDeviceIdentity = () => readV12FinalDeviceState(manifest),
} = {}) {
  const validated = validateV12RunManifest(manifest);
  const apkPath = preflightSafeFile(root, validated.build.apk.path);
  const apkBytes = readFileSync(apkPath);
  if (apkBytes.length < 4 || !apkBytes.subarray(0, 4).equals(Buffer.from("504b0304", "hex"))) preflightFail("final_identity_invalid");
  let signature; let device; let head; let source;
  try {
    signature = verifyApkSignature(apkPath);
    device = readDeviceIdentity();
    head = currentHead();
    source = currentSourceTreeSha256();
  }
  catch (error) { if (error instanceof Error && error.message.startsWith("v12_preflight_")) throw error; preflightFail("final_identity_invalid"); }
  if (device?.lease_state !== "clear") preflightFail("final_lease_active");
  if (device?.restoration_sha256 !== validated.device.restoration_sha256) preflightFail("final_restoration_invalid");
  if (apkBytes.length !== validated.build.apk.size_bytes || sha256(apkBytes) !== validated.build.apk.sha256
    || head !== validated.source.head || source !== validated.source.tree_sha256
    || signature?.signature_sha256 !== validated.build.apk.signature_sha256 || signature?.certificate_sha256 !== validated.build.apk.certificate_sha256
    || device?.identity_sha256 !== validated.device.identity_sha256 || device?.installed_apk_sha256 !== validated.device.installed_apk_sha256
    || device?.installed_apk_sha256 !== validated.build.apk.sha256 || device?.abi !== validated.device.abi) preflightFail("final_identity_invalid");
  return true;
}

function preflightValidateArtifacts(root, runId, shardIds, allowTestCalendarFixture = false) {
  const required = shardIds.flatMap((id) => V12_PREFLIGHT_SHARDS[id]);
  const manifest = preflightManifest(root, runId).manifest;
  const publicationShards = shardIds.flatMap((id) => id === "visual" ? ["visual", "comparison"] : [id]);
  for (const shard of publicationShards) {
    try { verifyV12AtomicShard({ root, runId, shard }); } catch { preflightFail("publication_invalid"); }
  }
  const hashes = required.map((relative) => preflightVerifyArtifact(root, runId, relative, manifest, allowTestCalendarFixture));
  return { required, hashes };
}

function preflightRowEvidence(root, runId) {
  return resolveV12SourceRows({ inputs: loadV12ContractInputs({ root }), manifest: preflightManifest(root, runId).manifest,
    root, readArtifact: relative => readFileSync(preflightSafeFile(root, relative)) });
}

export function executeV12EvidenceCli(args, { root = ROOT } = {}) {
  const options = parseV12EvidenceCliArgs(args);
  const { manifest, build_sha256 } = preflightManifest(root, options.run_id);
  if (options.mode === "shards-only") return Object.freeze({ ok: true, ...options, build_sha256, artifacts: preflightValidateArtifacts(root, options.run_id, options.ids).hashes });
  if (options.mode === "test-resolve") {
    if (process.env.NODE_ENV !== "test" || process.env.V12_NATIVE_ADAPTER_TEST_MODE !== "phase20-native-adapter-subprocess" || process.env.V12_NATIVE_ADAPTER_TEST_PROCESS !== "1") preflightFail("test_mode_forbidden");
    preflightValidateArtifacts(root, options.run_id, Object.keys(V12_PREFLIGHT_SHARDS), true);
    const attendedPath = `${liveRoot(options.run_id)}/attended-observations.json`;
    const attendedFile = preflightSafeFile(root, attendedPath, { required: false });
    const attended = attendedFile === null ? undefined : JSON.parse(readFileSync(attendedFile, "utf8"));
    const row_evidence = resolveV12SourceRows({ inputs: loadV12ContractInputs({ root }), manifest, root,
      readArtifact: (relative) => readFileSync(preflightSafeFile(root, relative)), allowTestCalendarFixture: true, attended });
    return Object.freeze({ schema_version: 1, producer: "v12-test-resolution/v1", run_id: options.run_id, sealable: false, row_evidence });
  }
  if (manifest.evidence_origin === "test") preflightFail("test_origin_forbidden");

  const runPrefix = `artifacts/native/v1.2/${options.run_id}`;
  if (options.mode === "preseal") {
    assertNonTestEvidenceEnvironment();
    validateV12ProductionPublicationOrigins(root, options.run_id);
    for (const output of V12_PREFLIGHT_FINAL_OUTPUTS) if (preflightSafeFile(root, `${runPrefix}/${output}`, { required: false }) !== null) preflightFail("final_output_present");
    const artifacts = preflightValidateArtifacts(root, options.run_id, Object.keys(V12_PREFLIGHT_SHARDS));
    const allFiles = preflightCollectFiles(root, options.run_id);
    const requiredPaths = new Set([`${runPrefix}/build.json`, ...artifacts.required.map((item) => `${runPrefix}/${item}`)]);
    const shadow = allFiles.filter((item) => V12_PREFLIGHT_FINAL_OUTPUTS.some((output) => item === `${runPrefix}/${output}`) || item.endsWith(".partial") || item.includes("/.staging/") || item.includes("/failures/"));
    if (shadow.length > 0) preflightFail("shadow_or_partial_artifact");
    const report = Object.freeze({ schema_version: 3, producer: "v12-preseal-validation/v3", run_id: options.run_id, evidence_origin: "native", mode: "preseal", release_authorized: false, build_sha256, required_artifact_count: requiredPaths.size - 1, artifacts: artifacts.hashes, row_evidence: preflightRowEvidence(root, options.run_id), all_artifact_hashes: allFiles.map((item) => ({ path: item, sha256: preflightHashFile(root, item) })) });
    publishV12AtomicShard({ root, runId: options.run_id, shard: "preseal", produce: ({ write }) => write("preseal-validation.json", report) });
    return report;
  }
  assertNonTestEvidenceEnvironment();
  validateV12ProductionPublicationOrigins(root, options.run_id);
  validateV12FinalProductionIdentity(manifest, { root });
  verifyV12FinalNativeIdentity(manifest, { root });
  let preseal; try { preseal = JSON.parse(readFileSync(preflightSafeFile(root, `${runPrefix}/preseal-validation.json`), "utf8")); } catch { preflightFail("preseal_invalid"); }
  if (preseal?.schema_version !== 3 || preseal.producer !== "v12-preseal-validation/v3" || preseal.run_id !== options.run_id || !Array.isArray(preseal.row_evidence)) preflightFail("preseal_invalid");
  try { verifyV12AtomicShard({ root, runId: options.run_id, shard: "preseal" }); } catch { preflightFail("publication_invalid"); }
  if (preseal.build_sha256 !== build_sha256 || !Array.isArray(preseal.all_artifact_hashes)
    || preseal.all_artifact_hashes.some(item => preflightHashFile(root, item.path) !== item.sha256)) preflightFail("source_hash_invalid");
  // A final seal repeats the full shard validation after the owner checkpoint.
  preflightValidateArtifacts(root, options.run_id, Object.keys(V12_ARTIFACT_REGISTRY));
  let attended; try { attended = JSON.parse(readFileSync(preflightSafeFile(root, `${runPrefix}/attended-observations.json`), "utf8")); } catch { preflightFail("attended_invalid"); }
  const ledger = deriveV12Ledger({ inputs: loadV12ContractInputs({ root }), manifest, evidence: preseal.row_evidence, attended, root, readArtifact: (relative) => readFileSync(preflightSafeFile(root, relative)) });
  const finalWrites = [];
  const write = (relative, value) => finalWrites.push([relative, value]);
  const finalEvidence = sealV12FinalEvidence({ mode: "final", run_id: options.run_id, ledger, writeImmutableJson: write });
  finalWrites.push([`${runPrefix}/parity-report.md`, generateV12ParityReport({ ledger: finalEvidence })]);
  const readinessHandoff = Object.freeze({ schema_version: 2, producer: "v12-readiness-handoff/v2", run_id: options.run_id, readiness: finalEvidence.readiness, release_authorized: false, final_evidence_sha256: sha256(JSON.stringify(finalEvidence)) });
  finalWrites.push([`${runPrefix}/readiness-handoff.md`, readinessHandoff]);
  publishV12AtomicShard({ root, runId: options.run_id, shard: "final", produce: ({ write: publish }) => finalWrites.forEach(([relative, value]) => publish(relative.replace(`${runPrefix}/`, ""), value)) });
  preflightWriteOnce(root, ".planning/phases/20-native-acceptance/20-READINESS-HANDOFF.md", readinessHandoff);
  for (const output of ["ui-state-matrix.json", "final-evidence.json", "parity-report.md", "readiness-handoff.md"]) preflightSafeFile(root, `${runPrefix}/${output}`);
  return Object.freeze({ ok: true, run_id: options.run_id, mode: "final", rows: ledger.rows.length, readiness: ledger.readiness, release_authorized: false });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const unified = process.argv.slice(2);
    if (unified.includes("--mode") || unified.includes("--run")) process.stdout.write(`${JSON.stringify(executeV12EvidenceCli(unified))}\n`);
    else process.exitCode = runV12CalendarEvidenceVerifierCli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "v12_preflight_failed"}\n`);
    process.exitCode = 1;
  }
}
