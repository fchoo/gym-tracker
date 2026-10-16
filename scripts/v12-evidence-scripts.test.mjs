import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { PNG } from "pngjs";

import {
  V12_CALENDAR_DIAGNOSTIC_TARGETS,
  createV12CalendarDiagnostics,
  encodeV12CalendarDiagnosticsResult,
  executeV12CalendarDiagnostics,
  validateV12CalendarDiagnostics,
} from "./benchmark-v12-interactions.mjs";
import {
  v12CalendarCaseEvidenceBinding,
  validateV12CalendarComparison,
} from "./compare-v12-calendar.mjs";
import {
  createV12CalendarCaseEvidenceBundle,
  produceV12CalendarCaseEvidence,
  validateV12CalendarCaseSupportBytes,
  v12CalendarCaseEvidencePaths,
  v12CalendarCaseSourceArtifactPaths,
} from "./v12-calendar-case-evidence.mjs";
import {
  V12_CALENDAR_CASE_LEDGER_DESCRIPTOR,
  V12_CALENDAR_CASE_REGISTRY_DESCRIPTOR,
  V12_CALENDAR_REQUIRED_CASES,
  V12_CALENDAR_REQUIRED_CASE_IDS,
  validateV12CalendarCaseRegistryDescriptor,
} from "./v12-calendar-case-registry.mjs";
import {
  V12_MAESTRO_FLOW_CONTRACTS,
  executeV12Maestro,
  validateV12LiveSourceLineage,
  validateV12CalendarManifest,
} from "./run-v12-maestro.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { stableCanonicalJson } from "./v12-calendar-artifacts.mjs";
import { loadV12ContractInputs } from "./v12-evidence-contract.mjs";
import {
  CALENDAR_NATIVE_CASE_IDS,
  CALENDAR_ROUTE_JOURNEY_IDS,
  executeV12CalendarEvidenceVerifier,
  validateV12CalendarEvidence,
  validateV12CalendarPackageScripts,
  verifyV12CalendarArtifactSet,
  deriveV12Ledger,
  sealV12FinalEvidence,
  validateV12RunManifest,
} from "./verify-v12-native-evidence.mjs";
import { generateV12ParityReport } from "./generate-v12-parity-report.mjs";

const clone = (value) => {
  const copy = structuredClone(value);
  if (Array.isArray(value) && value.sourceBytes instanceof Map) {
    Object.defineProperty(copy, "sourceBytes", { value: new Map(value.sourceBytes) });
  }
  return copy;
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fixture = () => JSON.parse(readFileSync(
  "scripts/fixtures/v12-calendar-evidence/complete.json",
  "utf8",
));

function v12LiveManifest(runId = "phase20-20261014T000000Z-aaaaaaaaaaaa") {
  return {
    schema_version: 1,
    run_id: runId,
    mode: "live",
    created_at: "2026-10-14T00:00:00Z",
    source: {
      head: "a".repeat(40), tree_sha256: "b".repeat(64), dirty: false,
      package_json_sha256: "c".repeat(64), package_lock_sha256: "d".repeat(64),
    },
    planning: {
      matrix_sha256: "e".repeat(64), requirements_sha256: "f".repeat(64),
      source_manifest_sha256: "1".repeat(64), owner_brief_sha256: "2".repeat(64),
      ui_spec_sha256: "3".repeat(64), deviations_sha256: "4".repeat(64),
    },
    prototype: { revision: 18, approval_sha256: "5".repeat(64), html_sha256: "6".repeat(64) },
    fixtures: { registry_sha256: "7".repeat(64) },
    build: {
      profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "1.2.0", version_code: 12,
      apk: { path: "artifacts/native/v1.2-acceptance/app.apk", sha256: "8".repeat(64), size_bytes: 1, page_alignment_verified: true, signature_sha256: "9".repeat(64), certificate_sha256: "a".repeat(64) },
    },
    device: { identity_sha256: "b".repeat(64), abi: "arm64-v8a", installed_apk_sha256: "8".repeat(64), settings_sha256: "c".repeat(64), restoration_sha256: "d".repeat(64) },
    configuration: { id: "AP-L-C390-P-F100" },
  };
}

function manifest() {
  return {
    schema_version: 1,
    suite: "v1.2-calendar",
    profile: "development-test",
    package: "com.fchoo.gymtracker.devtest",
    js_bundle: { embedded: true },
    base_head: "a".repeat(40),
    source_tree_sha256: "b".repeat(64),
    source_manifest_sha256: "ab954ba93d08751a6d2619a7336259467f02c065ce9dd5ffaaa7634cb7e7abfd",
    reference_map_sha256: "9903fe7cb8cb8b8b612f32727697db3b361a8851ceca97e14acb04a52d98ae86",
    apk: { path: "artifacts/native/v1.2-calendar/app.apk", sha256: "c".repeat(64), size_bytes: 1 },
    installed_apk: { sha256: "c".repeat(64), matches_retained_apk: true },
    device: { identity_sha256: "d".repeat(64) },
    report_sha256: "e".repeat(64),
  };
}

function rawDiagnostics() {
  return {
    producer: "v12-calendar-native-diagnostics/v1",
    native_execution: "EXECUTED",
    query_samples: Array.from({ length: 100 }, (_, index) => ({
      sequence: index + 1,
      duration_ms: 10 + index / 10,
      source_backed: true,
      event_count: 6,
      plan_count: 2,
      imported_count: 2,
    })),
    interaction_samples: Array.from({ length: 100 }, (_, index) => ({
      sequence: index + 1,
      kind: "drag-expand-collapse",
      complete: true,
      frame_work_ms: [8 + index / 100, 9 + index / 100],
      missed_frames: index % 7 === 0 ? 1 : 0,
      refresh_rate_hz: 60,
      profiler_overhead_ms: 0.2,
    })),
  };
}

function passingCaseObservations(
  requiredCase,
  binding,
  runId,
  startedAt,
  sourceTreeSha256 = "b".repeat(64),
) {
  const sourceBytes = new Map();
  const captureBytes = PNG.sync.write({
    width: 1,
    height: 1,
    data: Buffer.from([0, 0, 0, 255]),
  });
  const descriptor = (artifactPath, bytes) => {
    sourceBytes.set(artifactPath, bytes);
    return { path: artifactPath, sha256: hash(bytes), size_bytes: bytes.length };
  };
  const observations = binding.measured.input_motion.map(({ input, motion }, observationIndex) => {
    const paths = v12CalendarCaseSourceArtifactPaths(requiredCase, runId, input, motion);
    const traceBytes = Buffer.from(stableCanonicalJson({
      schema_version: 1,
      producer: "v12-calendar-native-trace/v1",
      run_id: runId,
      case_sha256: requiredCase.case_sha256,
      input,
      motion,
      source_tree_sha256: sourceTreeSha256,
      samples: [
        { sequence: 1, elapsed_ms: 1, event: "observation-started" },
        { sequence: 2, elapsed_ms: 2, event: "observation-finished" },
      ],
    }));
    const measurementBytes = Buffer.from(stableCanonicalJson({
      schema_version: 1,
      producer: "v12-calendar-native-measurement/v1",
      run_id: runId,
      case_sha256: requiredCase.case_sha256,
      input,
      motion,
      source_tree_sha256: sourceTreeSha256,
      samples: [
        { sequence: 1, id: "viewport-width", value: binding.measured.configuration.viewport.width, unit: "dp" },
        { sequence: 2, id: "viewport-height", value: binding.measured.configuration.viewport.height, unit: "dp" },
        { sequence: 3, id: "font-scale", value: binding.measured.configuration.font_scale, unit: "ratio" },
      ],
    }));
    return {
      input,
      motion,
      started_at: new Date(Date.parse(startedAt) + observationIndex * 10).toISOString(),
      finished_at: new Date(Date.parse(startedAt) + observationIndex * 10 + 5).toISOString(),
      functional: { assertions: [{ id: "functional-result", actual: true }] },
      trace: { artifact: descriptor(paths.trace, traceBytes) },
      measurement: { artifact: descriptor(paths.measurement, measurementBytes) },
      capture: { captures: [descriptor(paths.capture, captureBytes)] },
    };
  });
  Object.defineProperty(observations, "sourceBytes", { value: sourceBytes });
  return observations;
}

function completeCaseResult(requiredCase, runId, identity, index) {
  const binding = v12CalendarCaseEvidenceBinding(requiredCase);
  const startedAt = new Date(Date.UTC(2026, 9, 13, 0, 0, index * 2)).toISOString();
  const finishedAt = new Date(Date.parse(startedAt) + 1_000).toISOString();
  const execution = {
    schema_version: 1,
    producer: "v12-calendar-native-case/v1",
    run_id: runId,
    package: identity.package,
    build_profile: "development-test",
    source_tree_sha256: identity.source_tree_sha256,
    device_identity_sha256: identity.device_identity_sha256,
    started_at: startedAt,
    finished_at: finishedAt,
  };
  const observations = passingCaseObservations(
    requiredCase,
    binding,
    runId,
    startedAt,
    execution.source_tree_sha256,
  );
  const bundle = createV12CalendarCaseEvidenceBundle({
    requiredCase,
    execution,
    observations,
    readArtifactBytes: (artifactPath) => observations.sourceBytes.get(artifactPath),
  });
  const result = {
    id: requiredCase.id,
    case_sha256: requiredCase.case_sha256,
    native_execution: "EXECUTED",
    binding,
    execution,
    records: bundle.records,
    artifact: { path: `artifacts/native/v1.2/${runId}/cases/${requiredCase.case_sha256}.json`, sha256: "a".repeat(64) },
  };
  Object.defineProperty(result, "supportBytes", {
    value: Object.fromEntries(Object.entries(bundle.artifacts).map(([kind, artifact]) => [kind, artifact.bytes])),
    enumerable: false,
  });
  Object.defineProperty(result, "sourceBytes", {
    value: observations.sourceBytes,
    enumerable: false,
  });
  return result;
}

function caseSupportArtifacts(entry) {
  return Object.values(entry.records).map(({ artifact }) => artifact);
}

function completeLiveEvidence(runId = "phase20-20261013T000000Z-abcdef123456") {
  const evidence = fixture();
  const artifactRoot = `artifacts/native/v1.2/${runId}`;
  evidence.run_id = runId;
  evidence.host_only_fixture = false;
  evidence.native_execution = "EXECUTED";
  evidence.functional_cases.forEach((entry) => {
    entry.status = "PASS";
    entry.native_execution = "EXECUTED";
    entry.observations.synthetic = false;
  });
  evidence.route_journeys.forEach((entry) => {
    entry.focus.clearance_dp = 4;
    entry.focus.measurement_status = "EXECUTED";
  });
  evidence.deviations.forEach((entry) => {
    entry.technical_status = "PASS";
    entry.evidence_complete = true;
    entry.classification = "PASS";
    entry.evidence_hashes = ["a".repeat(64)];
  });
  evidence.comparison.native_execution = "EXECUTED";
  evidence.comparison.mode = "live-executed";
  evidence.comparison.run_id = evidence.run_id;
  evidence.comparison.phase20_deferred = false;
  evidence.comparison.identity = clone(evidence.identity);
  evidence.comparison.case_registry = clone(V12_CALENDAR_CASE_REGISTRY_DESCRIPTOR);
  evidence.comparison.case_ledger = clone(V12_CALENDAR_CASE_LEDGER_DESCRIPTOR);
  evidence.comparison.status = "PASS";
  evidence.comparison.case_results = V12_CALENDAR_REQUIRED_CASES.map((entry, index) => (
    completeCaseResult(entry, runId, evidence.identity, index)
  ));
  evidence.comparison.records.forEach((entry, index) => {
    entry.classification = "PASS";
    entry.differences = [];
    for (const kind of ["reference", "native", "overlay", "difference", "mask", "record"]) {
      entry.artifacts[kind].path = `${artifactRoot}/comparison/${entry.id}/${kind === "record" ? "comparison.json" : `${kind}.png`}`;
    }
  });
  evidence.diagnostics = createV12CalendarDiagnostics({ manifest: evidence.manifest, raw: rawDiagnostics() });
  evidence.manifest.apk.path = `${artifactRoot}/app.apk`;
  evidence.functional_cases.forEach((entry) => { entry.artifact.path = `${artifactRoot}/cases/${entry.id}.json`; });
  evidence.route_journeys.forEach((entry) => { entry.artifact.path = `${artifactRoot}/routes/${entry.id}.json`; });
  evidence.artifacts.manifest.path = `${artifactRoot}/build.json`;
  evidence.artifacts.report.path = `${artifactRoot}/evidence/native-report.json`;
  evidence.artifacts.comparison.path = `${artifactRoot}/comparison/calendar.json`;
  evidence.artifacts.diagnostics.path = `${artifactRoot}/diagnostics/calendar.json`;
  evidence.status = "PASS";
  evidence.all_pass = true;
  return evidence;
}

function writeDescriptor(root, descriptor, bytes = Buffer.from(`bounded:${descriptor.path}`)) {
  const absolute = path.join(root, descriptor.path);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
  descriptor.sha256 = hash(bytes);
  descriptor.size_bytes = bytes.length;
}

function writeJsonDescriptor(root, descriptor, value) {
  writeDescriptor(root, descriptor, Buffer.from(stableCanonicalJson(value)));
}

function writeCaseSourceBytes(root, sourceBytes) {
  for (const [artifactPath, bytes] of sourceBytes) {
    const absolute = path.join(root, artifactPath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes);
  }
}

function replaceObservationSourceBytes(observations, descriptor, bytes) {
  observations.sourceBytes.set(descriptor.path, bytes);
  descriptor.sha256 = hash(bytes);
  descriptor.size_bytes = bytes.length;
}

function withoutArtifact(entry) {
  const { artifact, ...value } = entry;
  return value;
}

function materializeLiveEvidence(root, currentIdentity, runId) {
  const evidence = completeLiveEvidence(runId);
  if (currentIdentity !== undefined) {
    evidence.manifest.base_head = currentIdentity.head;
    evidence.manifest.source_tree_sha256 = currentIdentity.source;
    evidence.identity.base_head = currentIdentity.head;
    evidence.identity.source_tree_sha256 = currentIdentity.source;
    evidence.comparison.identity.base_head = currentIdentity.head;
    evidence.comparison.identity.source_tree_sha256 = currentIdentity.source;
    evidence.comparison.case_results = V12_CALENDAR_REQUIRED_CASES.map((entry, index) => (
      completeCaseResult(entry, evidence.run_id, evidence.identity, index)
    ));
    evidence.diagnostics = createV12CalendarDiagnostics({ manifest: evidence.manifest, raw: rawDiagnostics() });
  }
  const runDirectory = path.join(root, "artifacts/native/v1.2", evidence.run_id);
  const manifestPath = path.join(runDirectory, "build.json");
  const evidencePath = path.join(runDirectory, "evidence/calendar-evidence.json");
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  mkdirSync(path.join(root, ".planning/phases/16-calendar-parity"), { recursive: true });
  const destinationMap = path.join(root, ".planning/phases/16-calendar-parity/16-REFERENCE-MAP.json");
  const sourceMap = path.resolve(".planning/phases/16-calendar-parity/16-REFERENCE-MAP.json");
  if (path.resolve(destinationMap) !== sourceMap) writeFileSync(destinationMap, readFileSync(sourceMap));

  writeDescriptor(root, evidence.manifest.apk, Buffer.from("synthetic-apk"));
  evidence.manifest.installed_apk.sha256 = evidence.manifest.apk.sha256;
  evidence.identity.apk_sha256 = evidence.manifest.apk.sha256;
  evidence.identity.installed_apk_sha256 = evidence.manifest.apk.sha256;

  writeJsonDescriptor(root, evidence.artifacts.report, {
    schema_version: 1,
    suite: "v1.2-calendar-native-report",
    run_id: evidence.run_id,
    native_execution: "EXECUTED",
  });
  evidence.manifest.report_sha256 = evidence.artifacts.report.sha256;
  evidence.identity.report_sha256 = evidence.artifacts.report.sha256;
  evidence.comparison.identity = clone(evidence.identity);
  evidence.diagnostics = createV12CalendarDiagnostics({ manifest: evidence.manifest, raw: rawDiagnostics() });

  for (const entry of evidence.functional_cases) writeJsonDescriptor(root, entry.artifact, withoutArtifact(entry));
  for (const entry of evidence.route_journeys) writeJsonDescriptor(root, entry.artifact, withoutArtifact(entry));
  for (const entry of evidence.comparison.case_results) {
    writeCaseSourceBytes(root, entry.sourceBytes);
    for (const [kind, record] of Object.entries(entry.records)) {
      writeDescriptor(root, record.artifact, entry.supportBytes[kind]);
    }
    writeJsonDescriptor(root, entry.artifact, withoutArtifact(entry));
  }

  const map = JSON.parse(readFileSync(destinationMap, "utf8"));
  const mappedById = new Map(map.captures.map((entry) => [entry.id, entry]));
  for (const record of evidence.comparison.records) {
    for (const kind of ["reference", "native", "overlay", "difference", "mask"]) {
      writeDescriptor(root, record.artifacts[kind]);
    }
    writeJsonDescriptor(root, record.artifacts.record, {
      schema_version: 2,
      id: record.id,
      requirement_ids: mappedById.get(record.id).requirement_ids,
      classification: record.classification,
      differences: record.differences,
      reference: record.artifacts.reference,
      native: record.artifacts.native,
      overlay: record.artifacts.overlay,
      difference: record.artifacts.difference,
      mask: record.artifacts.mask,
      source_manifest_sha256: evidence.identity.source_manifest_sha256,
      source_tree_sha256: evidence.identity.source_tree_sha256,
    });
  }
  writeJsonDescriptor(root, evidence.artifacts.diagnostics, evidence.diagnostics);

  writeJsonDescriptor(root, evidence.artifacts.comparison, evidence.comparison);
  writeJsonDescriptor(root, evidence.artifacts.manifest, evidence.manifest);
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return { evidence, manifestPath: path.relative(root, manifestPath) };
}

function rewriteRetainedCaseSource(root, evidence, kind, replaceBytes) {
  const caseResult = evidence.comparison.case_results[0];
  const supportPath = path.join(root, caseResult.records[kind].artifact.path);
  const supportPayload = JSON.parse(readFileSync(supportPath, "utf8"));
  const sourceDescriptor = kind === "capture"
    ? supportPayload.records[0].evidence.captures[0]
    : supportPayload.records[0].evidence.artifact;
  const sourcePath = path.join(root, sourceDescriptor.path);
  const nextSourceBytes = replaceBytes(readFileSync(sourcePath));
  writeFileSync(sourcePath, nextSourceBytes);
  sourceDescriptor.sha256 = hash(nextSourceBytes);
  sourceDescriptor.size_bytes = nextSourceBytes.length;
  writeDescriptor(
    root,
    caseResult.records[kind].artifact,
    Buffer.from(stableCanonicalJson(supportPayload)),
  );
  writeJsonDescriptor(root, caseResult.artifact, withoutArtifact(caseResult));
  writeJsonDescriptor(root, evidence.artifacts.comparison, evidence.comparison);
  writeFileSync(
    path.join(root, `artifacts/native/v1.2/${evidence.run_id}/evidence/calendar-evidence.json`),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}

test("Calendar evidence fixture carries the exact native, route, comparison, and owner-gate sets without claiming PASS", () => {
  const evidence = fixture();
  const result = validateV12CalendarEvidence(evidence);
  assert.deepEqual(evidence.functional_cases.map(({ id }) => id), CALENDAR_NATIVE_CASE_IDS);
  assert.deepEqual(evidence.route_journeys.map(({ id }) => id), CALENDAR_ROUTE_JOURNEY_IDS);
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.equal(result.all_pass, false);
  assert.equal(evidence.native_execution, "NOT_RUN");
  assert.equal(evidence.acceptance_owner, "phase20");
  assert.equal(evidence.route_journeys.every(({ focus }) => focus.clearance_dp === null && focus.measurement_status === "NOT_RUN"), true);
});

test("the live verifier rejects all 96 required cases when they contain status-only claims", () => {
  const evidence = completeLiveEvidence();
  const artifactRoot = `artifacts/native/v1.2/${evidence.run_id}`;
  evidence.comparison.case_results = V12_CALENDAR_REQUIRED_CASES.map((entry) => ({
    id: entry.id,
    case_sha256: entry.case_sha256,
    status: "PASS",
    native_execution: "EXECUTED",
    artifact: { path: `${artifactRoot}/cases/${entry.case_sha256}.json`, sha256: "a".repeat(64) },
  }));

  assert.equal(evidence.comparison.case_results.length, 96);
  assert.equal(evidence.comparison.case_results.every((entry) => entry.status === "PASS"), true);
  assert.throws(
    () => validateV12CalendarEvidence(evidence),
    /privacy_schema_invalid:case_result/u,
  );
});

test("all 96 live case records bind measured configuration and source-owned input-motion coverage", () => {
  const evidence = completeLiveEvidence();
  const configurationCases = evidence.comparison.case_results.filter(({ id }) => id.startsWith("configuration:"));
  const requiredCombinations = new Set([
    "touch:normal",
    "touch:reduced",
    "software-keyboard:normal",
    "software-keyboard:reduced",
    "hardware-keyboard:normal",
    "hardware-keyboard:reduced",
    "dpad:normal",
    "dpad:reduced",
  ]);

  assert.equal(evidence.comparison.case_results.length, 96);
  assert.equal(evidence.comparison.case_results.every((entry) => !Object.hasOwn(entry, "status")), true);
  assert.equal(configurationCases.length, 64);
  assert.equal(configurationCases.every((entry) => (
    entry.binding.measured.configuration.id === entry.binding.requested.configuration_id
      && entry.binding.measured.input_motion.length === 8
      && new Set(entry.binding.measured.input_motion.map(({ input, motion }) => `${input}:${motion}`)).size === requiredCombinations.size
      && entry.binding.measured.input_motion.every(({ input, motion }) => requiredCombinations.has(`${input}:${motion}`))
  )), true);
});

test("the production case producer writes immutable configuration-bound support bytes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-case-producer-"));
  try {
    const requiredCase = V12_CALENDAR_REQUIRED_CASES[0];
    const binding = v12CalendarCaseEvidenceBinding(requiredCase);
    const runId = "phase20-20261013T101010Z-abcdef123456";
    const startedAt = "2026-10-13T10:10:10.000Z";
    const execution = {
      schema_version: 1,
      producer: "v12-calendar-native-case/v1",
      run_id: runId,
      package: "com.fchoo.gymtracker.devtest",
      build_profile: "development-test",
      source_tree_sha256: "b".repeat(64),
      device_identity_sha256: "d".repeat(64),
      started_at: startedAt,
      finished_at: "2026-10-13T10:10:11.000Z",
    };
    const observations = passingCaseObservations(requiredCase, binding, runId, startedAt);
    writeCaseSourceBytes(root, observations.sourceBytes);
    const result = produceV12CalendarCaseEvidence({
      root,
      requiredCase,
      execution,
      observations,
    });

    assert.equal(result.records.functional.passed, binding.measured.input_motion.length);
    assert.equal(result.records.trace.sample_count, binding.measured.input_motion.length * 2);
    assert.match(readFileSync(path.join(root, result.records.functional.artifact.path), "utf8"), /<testsuite/u);
    assert.equal(JSON.parse(readFileSync(path.join(root, result.records.trace.artifact.path), "utf8")).case_sha256, requiredCase.case_sha256);
    assert.throws(() => produceV12CalendarCaseEvidence({
      root,
      requiredCase,
      execution,
      observations,
    }), /EEXIST/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the case producer rejects non-canonical run, case, and capture identities", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-case-boundary-"));
  try {
    const requiredCase = V12_CALENDAR_REQUIRED_CASES[0];
    const binding = v12CalendarCaseEvidenceBinding(requiredCase);
    const runId = "phase20-20261013T101010Z-abcdef123456";
    const startedAt = "2026-10-13T10:10:10.000Z";
    const execution = {
      schema_version: 1,
      producer: "v12-calendar-native-case/v1",
      run_id: runId,
      package: "com.fchoo.gymtracker.devtest",
      build_profile: "development-test",
      source_tree_sha256: "b".repeat(64),
      device_identity_sha256: "d".repeat(64),
      started_at: startedAt,
      finished_at: "2026-10-13T10:10:11.000Z",
    };

    const traversalExecution = { ...execution, run_id: "../../../rogue" };
    assert.throws(() => produceV12CalendarCaseEvidence({
      root,
      requiredCase,
      execution: traversalExecution,
      observations: passingCaseObservations(
        requiredCase,
        binding,
        runId,
        startedAt,
      ),
    }), /execution_invalid/u);
    assert.equal(existsSync(path.join(root, "rogue")), false);

    assert.throws(() => createV12CalendarCaseEvidenceBundle({
      requiredCase: {
        ...requiredCase,
        binding: { ...requiredCase.binding, state_id: "calendar-private-state" },
      },
      execution,
      observations: passingCaseObservations(requiredCase, binding, runId, startedAt),
    }), /case_registry_invalid/u);

    const privacyBearing = passingCaseObservations(requiredCase, binding, runId, startedAt);
    privacyBearing[0].capture.captures[0].path =
      `artifacts/native/v1.2/${runId}/captures/${requiredCase.case_sha256}/Alice-private-rehab.png`;
    assert.throws(() => createV12CalendarCaseEvidenceBundle({
      requiredCase,
      execution,
      observations: privacyBearing,
      readArtifactBytes: (artifactPath) => privacyBearing.sourceBytes.get(artifactPath),
    }), /schema_invalid:capture\.item/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("case support rejects malformed source records and derives every outcome from their bytes", () => {
  const requiredCase = V12_CALENDAR_REQUIRED_CASES[0];
  const binding = v12CalendarCaseEvidenceBinding(requiredCase);
  const runId = "phase20-20261013T111111Z-abcdef123456";
  const startedAt = "2026-10-13T11:11:11.000Z";
  const execution = {
    schema_version: 1,
    producer: "v12-calendar-native-case/v1",
    run_id: runId,
    package: "com.fchoo.gymtracker.devtest",
    build_profile: "development-test",
    source_tree_sha256: "b".repeat(64),
    device_identity_sha256: "d".repeat(64),
    started_at: startedAt,
    finished_at: "2026-10-13T11:11:12.000Z",
  };
  const observations = passingCaseObservations(requiredCase, binding, runId, startedAt);
  const create = (overrides = {}) => {
    const selectedObservations = overrides.observations ?? observations;
    return createV12CalendarCaseEvidenceBundle({
      requiredCase: overrides.requiredCase ?? requiredCase,
      execution: overrides.execution ?? execution,
      observations: selectedObservations,
      readArtifactBytes: (artifactPath) => (
        selectedObservations.sourceBytes ?? observations.sourceBytes
      ).get(artifactPath),
    });
  };

  assert.throws(() => create({ execution: { ...execution, unexpected: true } }), /schema_invalid:execution/u);
  assert.throws(() => create({ execution: { ...execution, schema_version: 2 } }), /execution_invalid/u);
  assert.throws(() => create({ requiredCase: { ...requiredCase, binding: { ...requiredCase.binding, configuration_id: "missing" } } }), /case_registry_invalid/u);
  assert.throws(() => create({ observations: observations.slice(1) }), /record_set_invalid/u);
  assert.throws(() => create({ observations: observations.map((value, index) => index === 0 ? { ...value, input: "keyboard" } : value) }), /record_identity_invalid/u);
  assert.throws(() => v12CalendarCaseSourceArtifactPaths(requiredCase, "bad-run", "touch", "normal"), /source_artifact_identity_invalid/u);
  assert.throws(() => v12CalendarCaseSourceArtifactPaths(requiredCase, runId, "private-input", "normal"), /source_artifact_identity_invalid/u);
  assert.throws(() => v12CalendarCaseSourceArtifactPaths(requiredCase, runId, "touch", "slow"), /source_artifact_identity_invalid/u);
  assert.throws(() => v12CalendarCaseEvidencePaths(requiredCase, "bad-run"), /execution_invalid/u);

  const malformedEvidence = [
    ["functional", { assertions: null }, /functional\.assertions/u],
    ["functional", { assertions: [{ id: "?", actual: true }] }, /functional\.assertion/u],
    ["trace", { artifact: null }, /trace\.artifact/u],
    ["trace", { artifact: { path: "wrong", sha256: "b".repeat(64), size_bytes: 1 } }, /trace\.artifact/u],
    ["measurement", { artifact: null }, /measurement\.artifact/u],
    ["measurement", { artifact: { path: "wrong", sha256: "b".repeat(64), size_bytes: 1 } }, /measurement\.artifact/u],
    ["capture", { captures: null }, /capture\.captures/u],
    ["capture", { captures: [{ path: null, sha256: "b".repeat(64), size_bytes: 1 }] }, /capture\.item/u],
  ];
  for (const [kind, evidence, expected] of malformedEvidence) {
    const mutated = clone(observations);
    mutated[0][kind] = evidence;
    assert.throws(() => create({ observations: mutated }), expected);
  }

  const tooManyAssertions = clone(observations);
  tooManyAssertions[0].functional.assertions.push({ id: "functional-result", actual: true });
  assert.throws(() => create({ observations: tooManyAssertions }), /functional\.assertions/u);

  const selfCertified = clone(observations);
  selfCertified[0].functional.assertions[0] = {
    id: "functional-result",
    expected: false,
    actual: false,
  };
  assert.throws(() => create({ observations: selfCertified }), /functional\.assertion/u);

  const unorderedTrace = clone(observations);
  const traceDescriptor = unorderedTrace[0].trace.artifact;
  const tracePayload = JSON.parse(unorderedTrace.sourceBytes.get(traceDescriptor.path).toString("utf8"));
  tracePayload.samples = [
    { sequence: 1, elapsed_ms: 9, event: "observation-started" },
    { sequence: 1, elapsed_ms: 1, event: "observation-finished" },
  ];
  const unorderedTraceBytes = Buffer.from(stableCanonicalJson(tracePayload));
  replaceObservationSourceBytes(unorderedTrace, traceDescriptor, unorderedTraceBytes);
  assert.throws(() => create({ observations: unorderedTrace }), /trace\.sample_order/u);

  const missingTrace = clone(observations);
  missingTrace.sourceBytes.delete(missingTrace[0].trace.artifact.path);
  assert.throws(() => create({ observations: missingTrace }), /source_artifact_missing/u);

  const replacedTrace = clone(observations);
  const replacedTracePath = replacedTrace[0].trace.artifact.path;
  replacedTrace.sourceBytes.set(replacedTracePath, Buffer.from("replaced"));
  assert.throws(() => create({ observations: replacedTrace }), /source_artifact_invalid/u);

  const malformedMeasurement = clone(observations);
  const measurementDescriptor = malformedMeasurement[0].measurement.artifact;
  replaceObservationSourceBytes(
    malformedMeasurement,
    measurementDescriptor,
    Buffer.from('{"schema_version":1}\n'),
  );
  assert.throws(() => create({ observations: malformedMeasurement }), /measurement\.source/u);

  const invalidJsonTrace = clone(observations);
  const invalidJsonTraceDescriptor = invalidJsonTrace[0].trace.artifact;
  replaceObservationSourceBytes(
    invalidJsonTrace,
    invalidJsonTraceDescriptor,
    Buffer.from("not-json"),
  );
  assert.throws(() => create({ observations: invalidJsonTrace }), /trace\.source/u);

  const emptyTrace = clone(observations);
  const emptyTraceDescriptor = emptyTrace[0].trace.artifact;
  const emptyTracePayload = JSON.parse(
    emptyTrace.sourceBytes.get(emptyTraceDescriptor.path).toString("utf8"),
  );
  emptyTracePayload.samples = [];
  replaceObservationSourceBytes(
    emptyTrace,
    emptyTraceDescriptor,
    Buffer.from(stableCanonicalJson(emptyTracePayload)),
  );
  assert.throws(() => create({ observations: emptyTrace }), /trace\.source/u);

  const malformedCapture = clone(observations);
  const captureDescriptor = malformedCapture[0].capture.captures[0];
  replaceObservationSourceBytes(
    malformedCapture,
    captureDescriptor,
    Buffer.from("not-a-png"),
  );
  assert.throws(() => create({ observations: malformedCapture }), /source_artifact_invalid:capture/u);

  const semanticallyWrongMeasurement = clone(observations);
  const semanticDescriptor = semanticallyWrongMeasurement[0].measurement.artifact;
  const semanticPayload = JSON.parse(
    semanticallyWrongMeasurement.sourceBytes.get(semanticDescriptor.path).toString("utf8"),
  );
  semanticPayload.samples[0].value += 1;
  replaceObservationSourceBytes(
    semanticallyWrongMeasurement,
    semanticDescriptor,
    Buffer.from(stableCanonicalJson(semanticPayload)),
  );
  assert.equal(create({ observations: semanticallyWrongMeasurement }).records.measurement.failed, 1);

  const semanticallyWrongTrace = clone(observations);
  const semanticTraceDescriptor = semanticallyWrongTrace[0].trace.artifact;
  const semanticTracePayload = JSON.parse(
    semanticallyWrongTrace.sourceBytes.get(semanticTraceDescriptor.path).toString("utf8"),
  );
  semanticTracePayload.samples[1].event = "observation-aborted";
  replaceObservationSourceBytes(
    semanticallyWrongTrace,
    semanticTraceDescriptor,
    Buffer.from(stableCanonicalJson(semanticTracePayload)),
  );
  assert.equal(create({ observations: semanticallyWrongTrace }).records.trace.failed, 1);

  const extraTrace = clone(observations);
  const extraTraceDescriptor = extraTrace[0].trace.artifact;
  const extraTracePayload = JSON.parse(
    extraTrace.sourceBytes.get(extraTraceDescriptor.path).toString("utf8"),
  );
  extraTracePayload.samples.push({ sequence: 3, elapsed_ms: 3, event: "observation-extra" });
  replaceObservationSourceBytes(
    extraTrace,
    extraTraceDescriptor,
    Buffer.from(stableCanonicalJson(extraTracePayload)),
  );
  assert.equal(create({ observations: extraTrace }).records.trace.failed, 1);

  const invalidMeasurementSamples = clone(observations);
  const invalidMeasurementDescriptor = invalidMeasurementSamples[0].measurement.artifact;
  const invalidMeasurementPayload = JSON.parse(
    invalidMeasurementSamples.sourceBytes.get(invalidMeasurementDescriptor.path).toString("utf8"),
  );
  invalidMeasurementPayload.samples = null;
  replaceObservationSourceBytes(
    invalidMeasurementSamples,
    invalidMeasurementDescriptor,
    Buffer.from(stableCanonicalJson(invalidMeasurementPayload)),
  );
  assert.throws(() => create({ observations: invalidMeasurementSamples }), /measurement\.source/u);

  const invalidMeasurementUnit = clone(observations);
  const invalidUnitDescriptor = invalidMeasurementUnit[0].measurement.artifact;
  const invalidUnitPayload = JSON.parse(
    invalidMeasurementUnit.sourceBytes.get(invalidUnitDescriptor.path).toString("utf8"),
  );
  invalidUnitPayload.samples[0].unit = "?";
  replaceObservationSourceBytes(
    invalidMeasurementUnit,
    invalidUnitDescriptor,
    Buffer.from(stableCanonicalJson(invalidUnitPayload)),
  );
  assert.throws(() => create({ observations: invalidMeasurementUnit }), /measurement\.sample/u);

  const extraMeasurement = clone(observations);
  const extraMeasurementDescriptor = extraMeasurement[0].measurement.artifact;
  const extraMeasurementPayload = JSON.parse(
    extraMeasurement.sourceBytes.get(extraMeasurementDescriptor.path).toString("utf8"),
  );
  extraMeasurementPayload.samples.push({ sequence: 4, id: "extra", value: 1, unit: "ratio" });
  replaceObservationSourceBytes(
    extraMeasurement,
    extraMeasurementDescriptor,
    Buffer.from(stableCanonicalJson(extraMeasurementPayload)),
  );
  assert.equal(create({ observations: extraMeasurement }).records.measurement.failed, 1);

  const reviewObservations = clone(observations);
  reviewObservations[0].functional.assertions = [];
  const review = create({ observations: reviewObservations });
  assert.equal(review.records.functional.skipped, 1);
  assert.match(review.artifacts.functional.bytes.toString("utf8"), /<skipped/u);
  const failedObservations = clone(observations);
  failedObservations[0].functional.assertions[0].actual = false;
  const failed = create({ observations: failedObservations });
  assert.equal(failed.records.functional.failed, 1);
  assert.match(failed.artifacts.functional.bytes.toString("utf8"), /<failure/u);

  const bundle = create();
  const caseResult = {
    execution,
    records: clone(bundle.records),
  };
  const bytesByKind = Object.fromEntries(Object.entries(bundle.artifacts).map(([kind, value]) => [kind, value.bytes]));
  const readArtifactBytes = (artifactPath) => observations.sourceBytes.get(artifactPath);
  assert.throws(() => validateV12CalendarCaseSupportBytes({ requiredCase, caseResult, bytesByKind: { ...bytesByKind, trace: Buffer.alloc(0) }, readArtifactBytes }), /content_invalid/u);
  assert.throws(() => validateV12CalendarCaseSupportBytes({ requiredCase, caseResult, bytesByKind: { ...bytesByKind, functional: Buffer.from(bytesByKind.functional.toString("utf8").replace(/<system-out>[^<]+/u, "<system-out>eA==")) }, readArtifactBytes }), /schema_invalid/u);
  const invalidPayload = clone(bundle.artifacts.trace.payload);
  invalidPayload.producer = "untrusted";
  assert.throws(() => validateV12CalendarCaseSupportBytes({ requiredCase, caseResult, bytesByKind: { ...bytesByKind, trace: Buffer.from(stableCanonicalJson(invalidPayload)) }, readArtifactBytes }), /content_invalid/u);
  assert.throws(() => validateV12CalendarCaseSupportBytes({ requiredCase, caseResult, bytesByKind: { ...bytesByKind, trace: Buffer.concat([bytesByKind.trace, Buffer.from(" ")]) }, readArtifactBytes }), /content_invalid/u);
  const mismatchedResult = clone(caseResult);
  mismatchedResult.records.trace.passed = 0;
  assert.throws(() => validateV12CalendarCaseSupportBytes({ requiredCase, caseResult: mismatchedResult, bytesByKind, readArtifactBytes }), /content_invalid/u);
});

test("Calendar evidence rejects missing, duplicate, stale, mutating, non-monotonic, and weak-focus records", () => {
  const mutations = [
    (value) => { value.functional_cases.pop(); },
    (value) => { value.functional_cases[1].id = value.functional_cases[0].id; },
    (value) => { value.functional_cases[0].observations.timestamps_ms = [2, 1]; },
    (value) => { value.functional_cases[0].observations.focus_ring_dp = 2; },
    (value) => { value.route_journeys.pop(); },
    (value) => { value.route_journeys[0].source_digest_after = "f".repeat(64); },
    (value) => { value.route_journeys[0].command_ledger = ["complete_set"]; },
    (value) => { value.route_journeys[0].actual_route = false; },
    (value) => { value.route_journeys[0].actual_loader = false; },
    (value) => { value.identity.source_tree_sha256 = "0".repeat(64); },
    (value) => { value.manifest.reference_map_sha256 = "0".repeat(64); value.identity.reference_map_sha256 = "0".repeat(64); value.comparison.identity.reference_map_sha256 = "0".repeat(64); },
    (value) => { value.artifacts.report.sha256 = "0".repeat(64); },
  ];
  for (const mutate of mutations) {
    const evidence = fixture();
    mutate(evidence);
    assert.throws(() => validateV12CalendarEvidence(evidence));
  }
});

test("Calendar evidence derives FAIL and REVIEW_REQUIRED and permits accepted deviations only after complete passing proof", () => {
  const complete = completeLiveEvidence();
  assert.deepEqual(validateV12CalendarEvidence(complete), {
    status: "PASS",
    all_pass: true,
    native_cases: 9,
    route_journeys: 8,
    comparisons: 14,
  });

  const unexplained = fixture();
  unexplained.comparison.records[0].differences = [{ kind: "visual", explained: false }];
  assert.throws(() => validateV12CalendarEvidence(unexplained), /difference_unexplained/u);

  const premature = fixture();
  premature.comparison.records[0].classification = "accepted_deviation";
  premature.comparison.records[0].deviation_id = "DEV-01";
  assert.throws(() => validateV12CalendarEvidence(premature), /accepted_deviation_incomplete/u);

  const failed = fixture();
  failed.functional_cases[0].status = "FAIL";
  failed.status = "FAIL";
  assert.equal(validateV12CalendarEvidence(failed).status, "FAIL");

  const failedDeviation = completeLiveEvidence();
  failedDeviation.deviations[0] = {
    id: "DEV-01",
    owner_decision: "accepted",
    owner_decision_date: "2026-10-07",
    technical_status: "FAIL",
    evidence_complete: true,
    classification: "FAIL",
    evidence_hashes: ["a".repeat(64)],
    measured_reason_code: "target_geometry_mismatch",
  };
  failedDeviation.status = "FAIL";
  failedDeviation.all_pass = false;
  assert.equal(validateV12CalendarEvidence(failedDeviation).status, "FAIL");

  const falsePass = fixture();
  falsePass.status = "PASS";
  assert.throws(() => validateV12CalendarEvidence(falsePass), /aggregate_status_mismatch/u);

  const failedRequiredCase = completeLiveEvidence();
  failedRequiredCase.comparison.case_results[0].records.functional.passed -= 1;
  failedRequiredCase.comparison.case_results[0].records.functional.failed = 1;
  failedRequiredCase.comparison.status = "FAIL";
  assert.throws(() => validateV12CalendarEvidence(failedRequiredCase), /aggregate_status_mismatch/u);
  failedRequiredCase.status = "FAIL";
  failedRequiredCase.all_pass = false;
  assert.equal(validateV12CalendarEvidence(failedRequiredCase).status, "FAIL");

  const wrongCaseIdentity = completeLiveEvidence();
  wrongCaseIdentity.comparison.case_results[0].case_sha256 = "0".repeat(64);
  assert.throws(() => validateV12CalendarEvidence(wrongCaseIdentity), /case_result_invalid/u);
});

test("the final CLI verifier accepts a complete live comparison on the same run and manifest identity", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-live-"));
  try {
    const { evidence, manifestPath } = materializeLiveEvidence(root);
    assert.equal(validateV12CalendarComparison(evidence.comparison), true);
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(root, evidence.artifacts.comparison.path), "utf8")),
      evidence.comparison,
    );
    assert.equal(validateV12CalendarEvidence(evidence, { root }).status, "PASS");
    verifyV12CalendarArtifactSet([
      evidence.manifest.apk,
      evidence.artifacts.manifest,
      evidence.artifacts.report,
      evidence.artifacts.comparison,
      evidence.artifacts.diagnostics,
      ...evidence.functional_cases.map(({ artifact }) => artifact),
      ...evidence.route_journeys.map(({ artifact }) => artifact),
      ...evidence.comparison.case_results.map(({ artifact }) => artifact),
      ...evidence.comparison.case_results.flatMap(caseSupportArtifacts),
      ...evidence.comparison.records.flatMap(({ artifacts }) => Object.values(artifacts)),
    ], { root });
    const retainedComparison = JSON.parse(readFileSync(path.join(root, evidence.artifacts.comparison.path), "utf8"));
    assert.deepEqual(retainedComparison.case_registry, evidence.comparison.case_registry);
    assert.equal(validateV12CalendarCaseRegistryDescriptor(retainedComparison.case_registry), true);
    assert.equal(validateV12CalendarComparison(
      retainedComparison,
      { expectedRunId: evidence.run_id, expectedIdentity: evidence.identity },
    ), true);
    assert.deepEqual(executeV12CalendarEvidenceVerifier({
      args: ["--manifest", manifestPath, "--automated-only"],
      root,
      currentIdentity: {
        head: evidence.manifest.base_head,
        source: evidence.manifest.source_tree_sha256,
      },
    }), {
      status: "PASS",
      all_pass: true,
      native_cases: 9,
      route_journeys: 8,
      comparisons: 14,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the final CLI verifier rejects a missing nested case capture", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-missing-case-capture-"));
  try {
    const { evidence, manifestPath } = materializeLiveEvidence(root);
    const capturePayload = JSON.parse(
      evidence.comparison.case_results[0].supportBytes.capture.toString("utf8"),
    );
    const capturePath = path.join(root, capturePayload.records[0].evidence.captures[0].path);
    if (existsSync(capturePath)) unlinkSync(capturePath);

    assert.throws(() => executeV12CalendarEvidenceVerifier({
      args: ["--manifest", manifestPath, "--automated-only"],
      root,
      currentIdentity: {
        head: evidence.manifest.base_head,
        source: evidence.manifest.source_tree_sha256,
      },
    }), /source_artifact_(?:missing|invalid)|artifact_path_invalid/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the final CLI verifier rejects malformed capture bytes and unordered trace bytes", () => {
  const scenarios = [
    {
      runId: "phase20-20261013T121212Z-abcdef123456",
      kind: "capture",
      replaceBytes: () => Buffer.from("not-a-png"),
      expected: /source_artifact_invalid:capture/u,
    },
    {
      runId: "phase20-20261013T131313Z-abcdef123456",
      kind: "trace",
      replaceBytes: (bytes) => {
        const payload = JSON.parse(bytes.toString("utf8"));
        payload.samples = [
          { sequence: 1, elapsed_ms: 9, event: "observation-started" },
          { sequence: 1, elapsed_ms: 1, event: "observation-finished" },
        ];
        return Buffer.from(stableCanonicalJson(payload));
      },
      expected: /trace\.sample_order/u,
    },
  ];

  for (const scenario of scenarios) {
    const root = mkdtempSync(path.join(tmpdir(), `v12-calendar-${scenario.kind}-bytes-`));
    try {
      const { evidence, manifestPath } = materializeLiveEvidence(
        root,
        undefined,
        scenario.runId,
      );
      rewriteRetainedCaseSource(root, evidence, scenario.kind, scenario.replaceBytes);
      assert.throws(() => executeV12CalendarEvidenceVerifier({
        args: ["--manifest", manifestPath, "--automated-only"],
        root,
        currentIdentity: {
          head: evidence.manifest.base_head,
          source: evidence.manifest.source_tree_sha256,
        },
      }), scenario.expected);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("the final CLI verifier rejects hashed arbitrary case-support bytes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-arbitrary-case-support-"));
  try {
    const { evidence, manifestPath } = materializeLiveEvidence(root);
    const caseResult = evidence.comparison.case_results[0];
    for (const record of Object.values(caseResult.records)) {
      writeDescriptor(root, record.artifact, Buffer.from(`bounded:${record.artifact.path}`));
    }
    writeJsonDescriptor(root, caseResult.artifact, withoutArtifact(caseResult));
    writeJsonDescriptor(root, evidence.artifacts.comparison, evidence.comparison);
    writeFileSync(
      path.join(root, path.dirname(manifestPath), "evidence/calendar-evidence.json"),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );

    assert.throws(() => executeV12CalendarEvidenceVerifier({
      args: ["--manifest", manifestPath, "--automated-only"],
      root,
      currentIdentity: {
        head: evidence.manifest.base_head,
        source: evidence.manifest.source_tree_sha256,
      },
    }), /case_support_(?:content|schema)_invalid/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the final CLI verifier cannot pass a retained 96-row status-only ledger", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-status-only-"));
  try {
    const { evidence, manifestPath } = materializeLiveEvidence(root);
    const artifactRoot = `artifacts/native/v1.2/${evidence.run_id}`;
    evidence.comparison.case_results = V12_CALENDAR_REQUIRED_CASES.map((entry) => ({
      id: entry.id,
      case_sha256: entry.case_sha256,
      status: "PASS",
      native_execution: "EXECUTED",
      artifact: { path: `${artifactRoot}/cases/${entry.case_sha256}.json`, sha256: "a".repeat(64) },
    }));
    for (const entry of evidence.comparison.case_results) {
      writeJsonDescriptor(root, entry.artifact, withoutArtifact(entry));
    }
    writeJsonDescriptor(root, evidence.artifacts.comparison, evidence.comparison);
    writeFileSync(
      path.join(root, path.dirname(manifestPath), "evidence/calendar-evidence.json"),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );

    assert.throws(() => executeV12CalendarEvidenceVerifier({
      args: ["--manifest", manifestPath, "--automated-only"],
      root,
      currentIdentity: {
        head: evidence.manifest.base_head,
        source: evidence.manifest.source_tree_sha256,
      },
    }), /privacy_schema_invalid:case_result/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the live verifier requires retained APK, case artifacts, and exact embedded JSON", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-live-binding-"));
  try {
    const first = materializeLiveEvidence(root, undefined, "phase20-20261013T010101Z-abcdef123456");
    assert.equal(existsSync(path.join(root, first.evidence.manifest.apk.path)), true);
    assert.equal(existsSync(path.join(root, first.evidence.comparison.case_results[0].artifact.path)), true);
    unlinkSync(path.join(root, first.evidence.comparison.case_results[0].artifact.path));
    assert.throws(() => executeV12CalendarEvidenceVerifier({
      args: ["--manifest", first.manifestPath, "--automated-only"],
      root,
      currentIdentity: { head: first.evidence.manifest.base_head, source: first.evidence.manifest.source_tree_sha256 },
    }), /artifact_path_invalid/u);

    const second = materializeLiveEvidence(root, undefined, "phase20-20261013T020202Z-abcdef123456");
    unlinkSync(path.join(root, second.evidence.manifest.apk.path));
    assert.throws(() => executeV12CalendarEvidenceVerifier({
      args: ["--manifest", second.manifestPath, "--automated-only"],
      root,
      currentIdentity: { head: second.evidence.manifest.base_head, source: second.evidence.manifest.source_tree_sha256 },
    }), /artifact_path_invalid/u);

    const third = materializeLiveEvidence(root, undefined, "phase20-20261013T030303Z-abcdef123456");
    const retainedManifest = clone(third.evidence.manifest);
    retainedManifest.apk.size_bytes += 1;
    const retainedBytes = Buffer.from(`${JSON.stringify(retainedManifest, null, 2)}\n`);
    writeFileSync(path.join(root, third.manifestPath), retainedBytes);
    third.evidence.artifacts.manifest.sha256 = hash(retainedBytes);
    third.evidence.artifacts.manifest.size_bytes = retainedBytes.length;
    writeFileSync(path.join(root, path.dirname(third.manifestPath), "evidence/calendar-evidence.json"), `${JSON.stringify(third.evidence, null, 2)}\n`);
    assert.throws(() => executeV12CalendarEvidenceVerifier({
      args: ["--manifest", third.manifestPath, "--automated-only"],
      root,
      currentIdentity: { head: third.evidence.manifest.base_head, source: third.evidence.manifest.source_tree_sha256 },
    }), /live_evidence_identity_invalid/u);

    const fourth = materializeLiveEvidence(root, undefined, "phase20-20261013T040404Z-abcdef123456");
    const retainedComparison = clone(fourth.evidence.comparison);
    retainedComparison.records[0].differences = [{ kind: "visual", explained: true }];
    const retainedComparisonBytes = Buffer.from(stableCanonicalJson(retainedComparison));
    writeFileSync(path.join(root, fourth.evidence.artifacts.comparison.path), retainedComparisonBytes);
    fourth.evidence.artifacts.comparison.sha256 = hash(retainedComparisonBytes);
    fourth.evidence.artifacts.comparison.size_bytes = retainedComparisonBytes.length;
    writeFileSync(path.join(root, path.dirname(fourth.manifestPath), "evidence/calendar-evidence.json"), `${JSON.stringify(fourth.evidence, null, 2)}\n`);
    assert.throws(() => executeV12CalendarEvidenceVerifier({
      args: ["--manifest", fourth.manifestPath, "--automated-only"],
      root,
      currentIdentity: { head: fourth.evidence.manifest.base_head, source: fourth.evidence.manifest.source_tree_sha256 },
    }), /comparison_content_mismatch/u);

    const fifth = materializeLiveEvidence(root, undefined, "phase20-20261013T050505Z-abcdef123456");
    const diagnosticsPath = path.join(root, fifth.evidence.artifacts.diagnostics.path);
    writeFileSync(diagnosticsPath, "{");
    fifth.evidence.artifacts.diagnostics.sha256 = hash("{");
    fifth.evidence.artifacts.diagnostics.size_bytes = 1;
    writeFileSync(path.join(root, path.dirname(fifth.manifestPath), "evidence/calendar-evidence.json"), `${JSON.stringify(fifth.evidence, null, 2)}\n`);
    assert.throws(() => executeV12CalendarEvidenceVerifier({
      args: ["--manifest", fifth.manifestPath, "--automated-only"],
      root,
      currentIdentity: { head: fifth.evidence.manifest.base_head, source: fifth.evidence.manifest.source_tree_sha256 },
    }), /diagnostics_json_invalid/u);

    const sixth = materializeLiveEvidence(root, undefined, "phase20-20261013T060606Z-abcdef123456");
    const nonCanonicalDiagnostics = JSON.stringify(sixth.evidence.diagnostics);
    writeFileSync(path.join(root, sixth.evidence.artifacts.diagnostics.path), nonCanonicalDiagnostics);
    sixth.evidence.artifacts.diagnostics.sha256 = hash(nonCanonicalDiagnostics);
    sixth.evidence.artifacts.diagnostics.size_bytes = Buffer.byteLength(nonCanonicalDiagnostics);
    writeFileSync(path.join(root, path.dirname(sixth.manifestPath), "evidence/calendar-evidence.json"), `${JSON.stringify(sixth.evidence, null, 2)}\n`);
    assert.throws(() => executeV12CalendarEvidenceVerifier({
      args: ["--manifest", sixth.manifestPath, "--automated-only"],
      root,
      currentIdentity: { head: sixth.evidence.manifest.base_head, source: sixth.evidence.manifest.source_tree_sha256 },
    }), /diagnostics_content_mismatch/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the live verifier resolves current git and source identity when no test override is supplied", () => {
  const root = process.cwd();
  const runId = "phase20-20261013T090909Z-fedcba654321";
  const runDirectory = path.join(root, "artifacts/native/v1.2", runId);
  try {
    assert.equal(existsSync(runDirectory), false);
    const currentIdentity = {
      head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      source: sourceTreeSha256(root),
    };
    const { manifestPath } = materializeLiveEvidence(root, currentIdentity, runId);
    assert.equal(executeV12CalendarEvidenceVerifier({
      args: ["--manifest", manifestPath, "--automated-only"],
      root,
    }).status, "PASS");
  } finally {
    rmSync(runDirectory, { recursive: true, force: true });
  }
});

test("Calendar evidence rejects unsafe paths, symlinks, replaced bytes, and privacy-bearing payloads", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-evidence-"));
  const external = mkdtempSync(path.join(tmpdir(), "v12-calendar-external-"));
  try {
    mkdirSync(path.join(root, "evidence"));
    const bytes = Buffer.from("bounded synthetic verifier bytes");
    const descriptor = { path: "evidence/trace.json", sha256: hash(bytes) };
    writeFileSync(path.join(root, descriptor.path), bytes);
    assert.equal(verifyV12CalendarArtifactSet([descriptor], { root }), true);

    writeFileSync(path.join(root, descriptor.path), "replaced");
    assert.throws(() => verifyV12CalendarArtifactSet([descriptor], { root }), /artifact_hash_invalid/u);
    writeFileSync(path.join(root, descriptor.path), bytes);
    assert.throws(() => verifyV12CalendarArtifactSet([{ ...descriptor, path: "../escape.json" }], { root }), /artifact_path_invalid/u);

    const externalFile = path.join(external, "trace.json");
    writeFileSync(externalFile, bytes);
    unlinkSync(path.join(root, descriptor.path));
    symlinkSync(externalFile, path.join(root, descriptor.path));
    assert.throws(() => verifyV12CalendarArtifactSet([descriptor], { root }), /artifact_path_invalid/u);

    const privateFields = [
      ["workout_name", "Alice private rehab session"],
      ["plan_name", "Private marathon plan"],
      ["local_date", "2026-10-13"],
      ["activity_id", "garmin-owner-real-id-123"],
      ["account_namespace", "owner-account"],
      ["route", "encoded-private-route"],
      ["employee_email", "owner@example.com"],
    ];
    for (const [key, value] of privateFields) {
      const privateEvidence = fixture();
      privateEvidence.route_journeys[0][key] = value;
      assert.throws(() => validateV12CalendarEvidence(privateEvidence), /privacy_schema_invalid/u);
    }

    const privatePathMutations = [
      (value) => { value.manifest.apk.path = "artifacts/native/v1.2-calendar/Alice-private.apk"; },
      (value) => { value.functional_cases[0].artifact.path = "fixtures/Alice-private-rehab-session.json"; },
      (value) => { value.route_journeys[0].artifact.path = "fixtures/routes/Alice-private-route.json"; },
      (value) => { value.comparison.records[0].artifacts.native.path = "fixtures/comparison/Alice-private-native.png"; },
      (value) => { value.artifacts.report.path = "fixtures/Alice-private-rehab-session.json"; },
    ];
    for (const mutate of privatePathMutations) {
      const privateEvidence = fixture();
      mutate(privateEvidence);
      assert.throws(() => validateV12CalendarEvidence(privateEvidence), /path_invalid/u);
    }

    const privateLiveCase = completeLiveEvidence();
    privateLiveCase.comparison.case_results[0].artifact.path = "fixtures/cases/Alice-private-case.json";
    assert.throws(() => validateV12CalendarEvidence(privateLiveCase), /path_invalid/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});

test("Calendar diagnostics and live verification reject symlinked parent directories", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-parent-link-"));
  const outside = mkdtempSync(path.join(tmpdir(), "v12-calendar-parent-target-"));
  const linked = path.join(root, "linked");
  symlinkSync(outside, linked, "dir");
  try {
    const currentManifest = manifest();
    writeFileSync(path.join(root, "build.json"), `${JSON.stringify(currentManifest)}\n`);
    const raw = rawDiagnostics();
    const adb = (...args) => args[0] === "shell" && args[1] === "wm"
      ? "Physical size: 1080x2400"
      : args[0] === "logcat" && args[1] === "-d"
        ? encodeV12CalendarDiagnosticsResult(raw, "p16diag-bbbbbbbbbbbb-dddddddddddd").join("\n")
        : "";
    await assert.rejects(
      executeV12CalendarDiagnostics([
        "--manifest", "build.json",
        "--output", "linked/calendar.json",
      ], {
        root,
        head: currentManifest.base_head,
        source: currentManifest.source_tree_sha256,
        serial: "synthetic-device",
        adb,
      }),
      /path_unsafe/u,
    );
    assert.equal(existsSync(path.join(outside, "calendar.json")), false);

    writeFileSync(path.join(outside, "build.json"), "not-json");
    assert.throws(
      () => executeV12CalendarEvidenceVerifier({
        args: ["--manifest", "linked/build.json", "--automated-only"],
        root,
      }),
      /manifest_missing/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("Calendar diagnostics retain 100 source-backed queries and complete frame sequences without a Phase 16 verdict", () => {
  const evidence = createV12CalendarDiagnostics({ manifest: manifest(), raw: rawDiagnostics() });
  const result = validateV12CalendarDiagnostics(evidence, manifest());
  assert.equal(result.query_samples, 100);
  assert.equal(result.interaction_samples, 100);
  assert.equal(result.query_p95_ms, 19.4);
  assert.equal(result.frame_work_p95_ms, 9.94);
  assert.equal(evidence.acceptance_owner, "phase20");
  assert.equal(Object.hasOwn(evidence, "verdict"), false);
  assert.deepEqual(evidence.targets, V12_CALENDAR_DIAGNOSTIC_TARGETS);
});

test("Calendar diagnostics reject deferred, fabricated, incomplete, recomputed-summary, and verdict-bearing samples", () => {
  const valid = createV12CalendarDiagnostics({ manifest: manifest(), raw: rawDiagnostics() });
  const mutations = [
    (value) => { value.native_execution = "NOT_RUN"; },
    (value) => { value.measurements.query_samples[0].source_backed = false; },
    (value) => { value.measurements.query_samples.pop(); },
    (value) => { value.measurements.interaction_samples[0].complete = false; },
    (value) => { value.measurements.interaction_samples[0].frame_work_ms = []; },
    (value) => { value.measurements.interaction_samples[0].missed_frames = -1; },
    (value) => { value.measurements.interaction_samples[0].refresh_rate_hz = 0; },
    (value) => { value.measurements.interaction_samples[0].profiler_overhead_ms = -1; },
    (value) => { value.summary.query_p95_ms = 0; },
    (value) => { value.verdict = "PASS"; },
    (value) => { value.measurements.query_samples[0].raw_payload = "private"; },
  ];
  for (const mutate of mutations) {
    const evidence = clone(valid);
    mutate(evidence);
    assert.throws(() => validateV12CalendarDiagnostics(evidence, manifest()));
  }
});

test("Calendar diagnostics reject every unknown or privacy-bearing field instead of relying on keywords", () => {
  const rawFields = [
    ["workout_name", "Alice private rehab session"],
    ["plan_name", "Private marathon plan"],
    ["local_date", "2026-10-13"],
    ["activity_id", "garmin-owner-real-id-123"],
    ["account_namespace", "owner-account"],
    ["route", "encoded-private-route"],
  ];
  for (const [key, value] of rawFields) {
    const raw = rawDiagnostics();
    raw.query_samples[0][key] = value;
    assert.throws(() => createV12CalendarDiagnostics({ manifest: manifest(), raw }), /privacy_schema_invalid/u);
  }
});

test("Calendar manifest, package commands, and focused integrity registration are exact", () => {
  assert.equal(validateV12CalendarManifest(manifest()), true);
  assert.throws(() => validateV12CalendarManifest({ ...manifest(), base_head: "a".repeat(64) }));
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(validateV12CalendarPackageScripts(packageJson), true);
  assert.equal(
    packageJson.scripts["test:coverage:v12:calendar"],
    "node scripts/run-coverage-gate.mjs --focus-phase16-evidence --runInBand",
  );
  const coverage = readFileSync("scripts/run-coverage-gate.mjs", "utf8");
  assert.match(coverage, /src\/bootstrap\/phase16CalendarTestControls\.ts/u);
  for (const file of [
    "benchmark-v12-interactions.mjs",
    "compare-v12-calendar.mjs",
    "run-v12-maestro.mjs",
    "verify-v12-native-evidence.mjs",
    "v12-calendar-case-registry.mjs",
    "v12-calendar-artifacts.mjs",
  ]) assert.match(coverage, new RegExp(file.replaceAll(".", "\\."), "u"));
});

test("default strict coverage keeps the complete integrity registry while Phase 20 focus stays narrow", () => {
  const coverage = readFileSync("scripts/run-coverage-gate.mjs", "utf8");
  assert.match(coverage, /const collectionFiles = focusedIntegrityFiles\.length > 0\s*\? focusedIntegrityFiles\s*:\s*integrityCriticalFiles;/u);
  assert.match(coverage, /if \(focusPhase20\) \{[\s\S]*?focusedIntegrityFiles\.push\(\.\.\.phase20IntegrityCriticalFiles\);/u);
});

test("the generic v1.2 runner binds one synthetic shard to the canonical build-only manifest without verdict authority", () => {
  const manifest = v12LiveManifest();
  const flowBytes = Buffer.from("appId: com.fchoo.gymtracker.devtest\n---\n- launchApp\n");
  const sourceBytes = Buffer.from("export const source = 'fixed';\n");
  const writes = new Map();
  const result = executeV12Maestro([
    "--run", manifest.run_id,
    "--shard", "sqlite",
  ], {
    root: "/synthetic-root",
    readJson: () => manifest,
    readBytes: (file) => file.endsWith("sqlite.yaml") ? flowBytes : sourceBytes,
    exists: () => true,
    currentIdentity: {
      head: manifest.source.head,
      tree_sha256: manifest.source.tree_sha256,
      package: manifest.build.package,
      apk_sha256: manifest.build.apk.sha256,
      installed_apk_sha256: manifest.device.installed_apk_sha256,
      certificate_sha256: manifest.build.apk.certificate_sha256,
      device_identity_sha256: manifest.device.identity_sha256,
      settings_sha256: manifest.device.settings_sha256,
      configuration_id: manifest.configuration.id,
    },
    adapter: {
      snapshotSettings: () => ({ scheme: "light" }),
      execute: () => ({ observations: [{ id: "synthetic-row", status: "observed" }] }),
      restoreSettings: () => true,
    },
    writeImmutableJson: (file, value) => writes.set(file, value),
  });
  assert.equal(result.producer, "v12-maestro-runner/v1");
  assert.equal(result.shard, "sqlite");
  assert.equal(Object.hasOwn(result, "verdict"), false);
  assert.equal(writes.size, 1);
  assert.equal(V12_MAESTRO_FLOW_CONTRACTS.sqlite.flow, "maestro/v1.2/sqlite.yaml");

  let reads = 0;
  assert.throws(() => executeV12Maestro(["--run", manifest.run_id, "--shard", "sqlite"], {
    root: "/synthetic-root", readJson: () => manifest,
    readBytes: (file) => file.endsWith("sqlite.yaml") && reads++ > 0 ? Buffer.from("drift") : (file.endsWith("sqlite.yaml") ? flowBytes : sourceBytes),
    exists: () => true,
    currentIdentity: {
      head: manifest.source.head, tree_sha256: manifest.source.tree_sha256, package: manifest.build.package,
      apk_sha256: manifest.build.apk.sha256, installed_apk_sha256: manifest.device.installed_apk_sha256,
      certificate_sha256: manifest.build.apk.certificate_sha256, device_identity_sha256: manifest.device.identity_sha256,
      settings_sha256: manifest.device.settings_sha256, configuration_id: manifest.configuration.id,
    }, adapter: { snapshotSettings: () => ({}), execute: () => ({ observations: [] }), restoreSettings: () => true },
  }), /v12_maestro_flow_hash_mismatch/u);

  const root = mkdtempSync(path.join(tmpdir(), "gym-v12-runner-"));
  try {
    const manifestPath = path.join(root, "artifacts/native/v1.2", manifest.run_id, "build.json");
    mkdirSync(path.dirname(manifestPath), { recursive: true });
    mkdirSync(path.join(root, "maestro/v1.2"), { recursive: true });
    mkdirSync(path.join(root, "scripts"), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest));
    writeFileSync(path.join(root, "maestro/v1.2/sqlite.yaml"), flowBytes);
    writeFileSync(path.join(root, "scripts/v12-sqlite-shard.mjs"), sourceBytes);
    executeV12Maestro(["--run", manifest.run_id, "--shard", "sqlite"], {
      root,
      currentIdentity: {
        head: manifest.source.head, tree_sha256: manifest.source.tree_sha256, package: manifest.build.package,
        apk_sha256: manifest.build.apk.sha256, installed_apk_sha256: manifest.device.installed_apk_sha256,
        certificate_sha256: manifest.build.apk.certificate_sha256, device_identity_sha256: manifest.device.identity_sha256,
        settings_sha256: manifest.device.settings_sha256, configuration_id: manifest.configuration.id,
      },
      adapter: { snapshotSettings: () => ({}), execute: () => ({ observations: [] }), restoreSettings: () => true },
    });
    assert.equal(existsSync(path.join(root, "artifacts/native/v1.2", manifest.run_id, "shards/sqlite.json")), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the live v1.2 Maestro runner accepts a documentation-only descendant while preserving frozen artifact identity", () => {
  const manifest = v12LiveManifest();
  const descendant = "f".repeat(40);
  const identity = validateV12LiveSourceLineage(manifest, {
    currentHead: descendant,
    sourceDigest: manifest.source.tree_sha256,
    isAncestor: (ancestor, head) => ancestor === manifest.source.head && head === descendant,
  });
  assert.deepEqual(identity, {
    head: manifest.source.head,
    tree_sha256: manifest.source.tree_sha256,
  });
  assert.notEqual(identity.head, descendant);
});

test("the live v1.2 Maestro runner rejects implementation drift and rewritten source lineage", () => {
  const manifest = v12LiveManifest();
  const descendant = "f".repeat(40);
  assert.throws(() => validateV12LiveSourceLineage(manifest, {
    currentHead: descendant,
    sourceDigest: "e".repeat(64),
    isAncestor: () => true,
  }), /v12_maestro_source_tree_mismatch/u);
  assert.throws(() => validateV12LiveSourceLineage(manifest, {
    currentHead: descendant,
    sourceDigest: manifest.source.tree_sha256,
    isAncestor: () => false,
  }), /v12_maestro_source_lineage_mismatch/u);
});

test("the v1.2 build branch publishes bounded identity fields without changing historical manifest schemas", () => {
  const script = readFileSync("scripts/build-current-native-test-apk.sh", "utf8");
  assert.match(script, /v1\.2-acceptance/u);
  assert.match(script, /certificate_sha256/u);
  assert.match(script, /installed_apk_sha256/u);
  assert.match(script, /settings_sha256/u);
  assert.match(script, /restoration_sha256/u);
  assert.match(script, /manifest_version: 2/u);
});

test("the sole v1.2 validator rejects untyped row claims and seals only a validator-owned 172-row ledger", () => {
  const inputs = loadV12ContractInputs();
  const manifest = v12LiveManifest();
  const evidence = inputs.matrix.rows.map((row) => ({
    row_id: row.requirement_id,
    artifact: `artifacts/native/v1.2/${manifest.run_id}/proof/${row.requirement_id}.json`,
    sha256: hash(row.requirement_id),
    result: "PASS",
    configuration_id: "AP-L-C390-P-F100",
  }));
  const readArtifact = (artifact) => Buffer.from(path.basename(artifact, ".json"));
  assert.throws(() => deriveV12Ledger({ inputs, manifest, evidence, readiness_policy: null, readArtifact }), /v12_final_evidence_schema_invalid/u);
  assert.throws(() => validateV12RunManifest(manifest, { head: "stale" }), /v12_final_run_identity_stale/u);
  const sealedRows = Object.freeze(inputs.matrix.rows.map((row) => Object.freeze({ ...row, verdict: "PASS", observations: Object.freeze([]) })));
  const sourceResults = Object.freeze(sealedRows.map((row, index) => Object.freeze({ row_id: row.requirement_id, result: "PASS", selector: Object.freeze({ type: "validator-owned-test", id: row.requirement_id }), evidence_sha256: hash(`source-${index}`) })));
  const normal = Object.freeze({
    schema_version: 1,
    run_id: manifest.run_id,
    rows: sealedRows,
    verdict_counts: Object.freeze({ PASS: 172, FAIL: 0, NOT_RUN: 0, REVIEW_REQUIRED: 0, N_A_REVIEWED: 0, ACCEPTED_EXCEPTION: 0 }),
    readiness: "READY",
    accepted_exception_count: 0,
    policy: null,
    identity: Object.freeze({ run_id: manifest.run_id }),
    source_results: sourceResults,
    evidence_hashes: Object.freeze(sourceResults.map((item) => item.evidence_sha256)),
    gates: Object.freeze([]),
  });
  assert.throws(() => sealV12FinalEvidence({ mode: "preseal", run_id: manifest.run_id, ledger: normal, writeImmutableJson: () => {} }), /v12_final_explicit_final_mode_required/u);
  const writes = new Map();
  const final = sealV12FinalEvidence({ mode: "final", run_id: manifest.run_id, ledger: normal, writeImmutableJson: (file, value) => writes.set(file, value) });
  assert.equal(writes.size, 2);
  assert.equal(final.release_authorized, false);
  assert.match(generateV12ParityReport({ ledger: normal }), /READY/u);
});
