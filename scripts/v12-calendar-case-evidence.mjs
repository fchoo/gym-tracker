import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { PNG } from "pngjs";

import { exactKeys } from "./node-evidence-utils.mjs";
import {
  V12_CALENDAR_INPUT_IDS,
  V12_CALENDAR_MOTION_IDS,
  V12_CALENDAR_CASE_SUPPORT_EXPECTATIONS,
  V12_CALENDAR_REQUIRED_CASES,
  V12_CALENDAR_STATIC_CONFIGURATIONS,
} from "./v12-calendar-case-registry.mjs";
import {
  V12_CALENDAR_RUN_ID_PATTERN,
  ensureV12CalendarDirectory,
  resolveV12CalendarPath,
  stableCanonicalJson,
  writeExclusiveArtifact,
} from "./v12-calendar-artifacts.mjs";

export const V12_CALENDAR_CASE_EVIDENCE_PRODUCER = "v12-calendar-native-case/v1";
export const V12_CALENDAR_CASE_RECORD_FILES = Object.freeze({
  functional: "functional.junit.xml",
  trace: "trace.json",
  measurement: "measurement.json",
  capture: "capture-manifest.json",
});
export const V12_CALENDAR_CASE_SOURCE_FILES = Object.freeze({
  trace: "trace.json",
  measurement: "measurement.json",
  capture: "capture.png",
});

const SUPPORT_PRODUCERS = Object.freeze({
  functional: "v12-calendar-functional/v1",
  trace: "v12-calendar-trace/v1",
  measurement: "v12-calendar-measurement/v1",
  capture: "v12-calendar-capture/v1",
});
const SHA256 = /^[a-f0-9]{64}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const INPUTS = new Set(V12_CALENDAR_INPUT_IDS);
const MOTIONS = new Set(V12_CALENDAR_MOTION_IDS);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fail(code) { throw new Error(`v12_calendar_case_support_${code}`); }
function schema(value, keys, location) {
  if (!exactKeys(value, keys)) fail(`schema_invalid:${location}`);
}
function validTimestamp(value) {
  return typeof value === "string" && ISO.test(value) && new Date(value).toISOString() === value;
}
function validateRequiredCase(requiredCase) {
  const canonical = V12_CALENDAR_REQUIRED_CASES.find(({ id }) => id === requiredCase?.id);
  if (canonical === undefined || !isDeepStrictEqual(requiredCase, canonical)) fail("case_registry_invalid");
  return canonical;
}
function configurationFor(requiredCase) {
  validateRequiredCase(requiredCase);
  return V12_CALENDAR_STATIC_CONFIGURATIONS.find(
    ({ id }) => id === requiredCase.binding.configuration_id,
  );
}

export function v12CalendarCaseEvidenceBinding(requiredCase) {
  const configuration = configurationFor(requiredCase);
  let inputMotion;
  if (requiredCase.kind === "configuration") {
    inputMotion = V12_CALENDAR_INPUT_IDS.flatMap((input) => (
      V12_CALENDAR_MOTION_IDS.map((motion) => ({ input, motion }))
    ));
  } else if (requiredCase.kind === "input") {
    inputMotion = V12_CALENDAR_MOTION_IDS.map((motion) => ({ input: requiredCase.binding.input, motion }));
  } else if (requiredCase.kind === "motion") {
    inputMotion = V12_CALENDAR_INPUT_IDS.map((input) => ({ input, motion: requiredCase.binding.motion }));
  } else {
    inputMotion = [{ input: requiredCase.binding.input, motion: requiredCase.binding.motion }];
  }
  return {
    requested: requiredCase.binding,
    measured: {
      configuration: {
        id: configuration.id,
        appearance: configuration.appearance,
        os_scheme: configuration.os_scheme,
        viewport: configuration.viewport,
        orientation: configuration.orientation,
        font_scale: configuration.font_scale,
      },
      state_id: requiredCase.binding.state_id,
      input_motion: inputMotion,
    },
  };
}

export function v12CalendarCaseEvidencePaths(requiredCase, runId) {
  validateRequiredCase(requiredCase);
  if (!V12_CALENDAR_RUN_ID_PATTERN.test(runId)) fail("execution_invalid");
  const root = `artifacts/native/v1.2/${runId}/case-support/${requiredCase.case_sha256}`;
  return Object.fromEntries(
    Object.entries(V12_CALENDAR_CASE_RECORD_FILES).map(([kind, file]) => [kind, `${root}/${file}`]),
  );
}

export function v12CalendarCaseSourceArtifactPaths(requiredCase, runId, input, motion) {
  validateRequiredCase(requiredCase);
  if (!V12_CALENDAR_RUN_ID_PATTERN.test(runId) || !INPUTS.has(input) || !MOTIONS.has(motion)) {
    fail("source_artifact_identity_invalid");
  }
  const root = `artifacts/native/v1.2/${runId}/case-source/${requiredCase.case_sha256}/${input}-${motion}`;
  return Object.fromEntries(
    Object.entries(V12_CALENDAR_CASE_SOURCE_FILES).map(([kind, file]) => [kind, `${root}/${file}`]),
  );
}

function validateExecution(execution) {
  schema(execution, ["schema_version", "producer", "run_id", "package", "build_profile", "source_tree_sha256", "device_identity_sha256", "started_at", "finished_at"], "execution");
  if ([
    execution.schema_version !== 1,
    execution.producer !== V12_CALENDAR_CASE_EVIDENCE_PRODUCER,
    !V12_CALENDAR_RUN_ID_PATTERN.test(execution.run_id),
    execution.package !== "com.fchoo.gymtracker.devtest",
    execution.build_profile !== "development-test",
    !SHA256.test(execution.source_tree_sha256),
    !SHA256.test(execution.device_identity_sha256),
    !validTimestamp(execution.started_at),
    !validTimestamp(execution.finished_at),
    Date.parse(execution.finished_at) <= Date.parse(execution.started_at),
  ].some(Boolean)) fail("execution_invalid");
}

function sourceArtifactBytes(descriptor, expectedPath, readArtifactBytes, location) {
  schema(descriptor, ["path", "sha256", "size_bytes"], `${location}.artifact`);
  if ([
    descriptor.path !== expectedPath,
    !SHA256.test(descriptor.sha256),
    !Number.isSafeInteger(descriptor.size_bytes),
    descriptor.size_bytes < 1,
    typeof readArtifactBytes !== "function",
  ].some(Boolean)) fail(`schema_invalid:${location}.artifact`);
  let bytes;
  try { bytes = readArtifactBytes(descriptor.path); }
  catch { fail("source_artifact_missing"); }
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) fail("source_artifact_missing");
  if (bytes.length !== descriptor.size_bytes || sha256(bytes) !== descriptor.sha256) {
    fail("source_artifact_invalid");
  }
  return bytes;
}

function parseCanonicalJson(bytes, location) {
  let payload;
  try { payload = JSON.parse(bytes.toString("utf8")); }
  catch { fail(`schema_invalid:${location}`); }
  if (bytes.toString("utf8") !== stableCanonicalJson(payload)) fail(`schema_invalid:${location}`);
  return payload;
}

function expectedMeasurements(requiredCase) {
  const configuration = configurationFor(requiredCase);
  return [
    { id: "viewport-width", value: configuration.viewport.width, unit: "dp" },
    { id: "viewport-height", value: configuration.viewport.height, unit: "dp" },
    { id: "font-scale", value: configuration.font_scale, unit: "ratio" },
  ];
}

function evidenceChecks(kind, evidence, context = {}) {
  if (kind === "functional") {
    schema(evidence, ["assertions"], "functional.evidence");
    if (!Array.isArray(evidence.assertions)) fail("schema_invalid:functional.assertions");
    if (evidence.assertions.length > V12_CALENDAR_CASE_SUPPORT_EXPECTATIONS.functional.assertions.length) {
      fail("schema_invalid:functional.assertions");
    }
    for (const [index, assertion] of evidence.assertions.entries()) {
      schema(assertion, ["id", "actual"], "functional.assertion");
      const expected = V12_CALENDAR_CASE_SUPPORT_EXPECTATIONS.functional.assertions[index];
      if (assertion.id !== expected?.id || typeof assertion.actual !== "boolean") {
        fail("schema_invalid:functional.assertion");
      }
    }
    return {
      checks: evidence.assertions.map(({ actual }, index) => ({
        passed: actual === V12_CALENDAR_CASE_SUPPORT_EXPECTATIONS.functional.assertions[index].expected,
      })),
      sampleCount: evidence.assertions.length,
      sourceArtifacts: [],
    };
  }
  if (kind === "trace") {
    schema(evidence, ["artifact"], "trace.evidence");
    const bytes = sourceArtifactBytes(
      evidence.artifact,
      context.sourcePaths.trace,
      context.readArtifactBytes,
      "trace",
    );
    const payload = parseCanonicalJson(bytes, "trace.source");
    schema(payload, ["schema_version", "producer", "run_id", "case_sha256", "input", "motion", "source_tree_sha256", "samples"], "trace.source");
    if ([
      payload.schema_version !== V12_CALENDAR_CASE_SUPPORT_EXPECTATIONS.trace.schema_version,
      payload.producer !== V12_CALENDAR_CASE_SUPPORT_EXPECTATIONS.trace.producer,
      payload.run_id !== context.execution.run_id,
      payload.case_sha256 !== context.requiredCase.case_sha256,
      payload.input !== context.record.input,
      payload.motion !== context.record.motion,
      payload.source_tree_sha256 !== context.execution.source_tree_sha256,
      !Array.isArray(payload.samples),
      Array.isArray(payload.samples) && payload.samples.length === 0,
    ].some(Boolean)) fail("schema_invalid:trace.source");
    for (const [index, sample] of payload.samples.entries()) {
      schema(sample, ["sequence", "elapsed_ms", "event"], "trace.sample");
      if ([
        sample.sequence !== index + 1,
        !Number.isFinite(sample.elapsed_ms),
        sample.elapsed_ms < 0,
        index > 0 && sample.elapsed_ms <= payload.samples[index - 1].elapsed_ms,
        !/^[a-z][a-z0-9-]{2,63}$/u.test(sample.event),
      ].some(Boolean)) fail("schema_invalid:trace.sample_order");
    }
    const expectedEvents = V12_CALENDAR_CASE_SUPPORT_EXPECTATIONS.trace.events;
    return {
      checks: expectedEvents.map((event, index) => ({ passed: payload.samples[index]?.event === event }))
        .concat(payload.samples.length === expectedEvents.length ? [] : [{ passed: false }]),
      sampleCount: payload.samples.length,
      sourceArtifacts: [evidence.artifact],
    };
  }
  if (kind === "measurement") {
    schema(evidence, ["artifact"], "measurement.evidence");
    const bytes = sourceArtifactBytes(
      evidence.artifact,
      context.sourcePaths.measurement,
      context.readArtifactBytes,
      "measurement",
    );
    const payload = parseCanonicalJson(bytes, "measurement.source");
    schema(payload, ["schema_version", "producer", "run_id", "case_sha256", "input", "motion", "source_tree_sha256", "samples"], "measurement.source");
    if ([
      payload.schema_version !== V12_CALENDAR_CASE_SUPPORT_EXPECTATIONS.measurement.schema_version,
      payload.producer !== V12_CALENDAR_CASE_SUPPORT_EXPECTATIONS.measurement.producer,
      payload.run_id !== context.execution.run_id,
      payload.case_sha256 !== context.requiredCase.case_sha256,
      payload.input !== context.record.input,
      payload.motion !== context.record.motion,
      payload.source_tree_sha256 !== context.execution.source_tree_sha256,
      !Array.isArray(payload.samples),
    ].some(Boolean)) fail("schema_invalid:measurement.source");
    for (const [index, sample] of payload.samples.entries()) {
      schema(sample, ["sequence", "id", "value", "unit"], "measurement.sample");
      if ([sample.sequence !== index + 1, !Number.isFinite(sample.value), !/^[a-z][a-z0-9-]{1,63}$/u.test(sample.id), !/^[a-z][a-z0-9_-]{1,31}$/u.test(sample.unit)].some(Boolean)) fail("schema_invalid:measurement.sample");
    }
    const expected = expectedMeasurements(context.requiredCase);
    return {
      checks: expected.map((item, index) => ({ passed: isDeepStrictEqual(payload.samples[index], { sequence: index + 1, ...item }) }))
        .concat(payload.samples.length === expected.length ? [] : [{ passed: false }]),
      sampleCount: payload.samples.length,
      sourceArtifacts: [evidence.artifact],
    };
  }
  schema(evidence, ["captures"], "capture.evidence");
  if (!Array.isArray(evidence.captures) || evidence.captures.length !== 1) fail("schema_invalid:capture.captures");
  for (const capture of evidence.captures) {
    schema(capture, ["path", "sha256", "size_bytes"], "capture.item");
    const normalized = typeof capture.path === "string" ? path.posix.normalize(capture.path) : "";
    if ([normalized.length === 0, normalized !== capture.path, normalized !== context.sourcePaths.capture, normalized.startsWith("../"), normalized.includes("\\"), path.posix.isAbsolute(normalized)].some(Boolean)) fail("schema_invalid:capture.item");
    const bytes = sourceArtifactBytes(capture, context.sourcePaths.capture, context.readArtifactBytes, "capture");
    try { PNG.sync.read(bytes, { checkCRC: true }); }
    catch { fail("source_artifact_invalid:capture"); }
  }
  return { checks: [{ passed: true }], sampleCount: 1, sourceArtifacts: evidence.captures };
}

function validateRecords(payload, requiredCase, kind, readArtifactBytes) {
  const binding = v12CalendarCaseEvidenceBinding(requiredCase);
  if (!Array.isArray(payload.records) || payload.records.length !== binding.measured.input_motion.length) fail("record_set_invalid");
  const statuses = [];
  let sampleCount = 0;
  const sourceArtifacts = [];
  for (const [index, record] of payload.records.entries()) {
    schema(record, ["sequence", "input", "motion", "started_at", "finished_at", "evidence"], `${kind}.record`);
    const expected = binding.measured.input_motion[index];
    if ([record.sequence !== index + 1, !INPUTS.has(record.input), !MOTIONS.has(record.motion), record.input !== expected.input, record.motion !== expected.motion, !validTimestamp(record.started_at), !validTimestamp(record.finished_at), Date.parse(record.finished_at) <= Date.parse(record.started_at)].some(Boolean)) fail("record_identity_invalid");
    const sourcePaths = v12CalendarCaseSourceArtifactPaths(
      requiredCase,
      payload.execution.run_id,
      record.input,
      record.motion,
    );
    const result = evidenceChecks(kind, record.evidence, {
      execution: payload.execution,
      readArtifactBytes,
      record,
      requiredCase,
      sourcePaths,
    });
    sampleCount += result.sampleCount;
    sourceArtifacts.push(...result.sourceArtifacts);
    statuses.push(result.checks.length === 0 ? "REVIEW_REQUIRED" : result.checks.some(({ passed }) => !passed) ? "FAIL" : "PASS");
  }
  return {
    passed: statuses.filter((status) => status === "PASS").length,
    failed: statuses.filter((status) => status === "FAIL").length,
    skipped: statuses.filter((status) => status === "REVIEW_REQUIRED").length,
    sample_count: sampleCount,
    source_artifacts: sourceArtifacts,
  };
}

function validatePayload(payload, { requiredCase, execution, kind, readArtifactBytes }) {
  schema(payload, ["schema_version", "producer", "case_sha256", "execution", "binding", "records"], `${kind}.payload`);
  if ([payload.schema_version !== 1, payload.producer !== SUPPORT_PRODUCERS[kind], payload.case_sha256 !== requiredCase.case_sha256, !isDeepStrictEqual(payload.execution, execution), !isDeepStrictEqual(payload.binding, v12CalendarCaseEvidenceBinding(requiredCase))].some(Boolean)) fail("content_invalid");
  return validateRecords(payload, requiredCase, kind, readArtifactBytes);
}

function functionalXml(payload, summary) {
  const payloadBytes = Buffer.from(stableCanonicalJson(payload));
  const cases = payload.records.map((record) => {
    const { checks } = evidenceChecks("functional", record.evidence);
    const outcome = checks.length === 0
      ? '<skipped message="evidence not collected"/>'
      : checks.some(({ passed }) => !passed) ? '<failure message="functional assertion failed"/>' : "";
    return `<testcase classname="v12.calendar.${record.input}" name="${record.motion}" timestamp="${record.started_at}">${outcome}</testcase>`;
  }).join("");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="v12-calendar-${payload.case_sha256}" tests="${payload.records.length}" failures="${summary.failed}" skipped="${summary.skipped}" timestamp="${payload.records[0].started_at}">`,
    `<properties><property name="schema" value="${SUPPORT_PRODUCERS.functional}"/><property name="payload_sha256" value="${sha256(payloadBytes)}"/></properties>`,
    cases,
    `<system-out>${payloadBytes.toString("base64")}</system-out>`,
    "</testsuite>",
  ].join("") + "\n";
}

function parseFunctionalXml(bytes) {
  const match = bytes.toString("utf8").match(/<system-out>([A-Za-z0-9+/=]+)<\/system-out>/u);
  if (match === null) fail("schema_invalid:functional.xml");
  try { return JSON.parse(Buffer.from(match[1], "base64").toString("utf8")); }
  catch { fail("schema_invalid:functional.xml"); }
}

function payloadFor({ requiredCase, execution, observations, kind }) {
  return {
    schema_version: 1,
    producer: SUPPORT_PRODUCERS[kind],
    case_sha256: requiredCase.case_sha256,
    execution,
    binding: v12CalendarCaseEvidenceBinding(requiredCase),
    records: observations.map((observation, index) => ({
      sequence: index + 1,
      input: observation.input,
      motion: observation.motion,
      started_at: observation.started_at,
      finished_at: observation.finished_at,
      evidence: observation[kind],
    })),
  };
}

export function createV12CalendarCaseEvidenceBundle({
  requiredCase,
  execution,
  observations,
  readArtifactBytes,
}) {
  validateExecution(execution);
  const artifacts = {};
  const records = {};
  const paths = v12CalendarCaseEvidencePaths(requiredCase, execution.run_id);
  for (const kind of Object.keys(V12_CALENDAR_CASE_RECORD_FILES)) {
    const payload = payloadFor({ requiredCase, execution, observations, kind });
    const summary = validatePayload(payload, {
      requiredCase,
      execution,
      kind,
      readArtifactBytes,
    });
    const bytes = kind === "functional" ? Buffer.from(functionalXml(payload, summary)) : Buffer.from(stableCanonicalJson(payload));
    artifacts[kind] = Object.freeze({ bytes, payload });
    records[kind] = {
      passed: summary.passed,
      failed: summary.failed,
      skipped: summary.skipped,
      ...(kind === "trace" || kind === "measurement" ? { sample_count: summary.sample_count } : {}),
      artifact: { path: paths[kind], sha256: sha256(bytes), size_bytes: bytes.length },
    };
  }
  return Object.freeze({ records: Object.freeze(records), artifacts: Object.freeze(artifacts) });
}

export function validateV12CalendarCaseSupportBytes({
  requiredCase,
  caseResult,
  bytesByKind,
  readArtifactBytes,
}) {
  validateExecution(caseResult.execution);
  const summaries = {};
  const sourceArtifacts = [];
  for (const kind of Object.keys(V12_CALENDAR_CASE_RECORD_FILES)) {
    const bytes = bytesByKind[kind];
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) fail("content_invalid");
    let payload;
    try { payload = kind === "functional" ? parseFunctionalXml(bytes) : JSON.parse(bytes.toString("utf8")); }
    catch { fail("schema_invalid"); }
    const summary = validatePayload(payload, {
      requiredCase,
      execution: caseResult.execution,
      kind,
      readArtifactBytes,
    });
    const canonical = kind === "functional" ? functionalXml(payload, summary) : stableCanonicalJson(payload);
    if (bytes.toString("utf8") !== canonical) fail("content_invalid");
    const expected = {
      passed: summary.passed,
      failed: summary.failed,
      skipped: summary.skipped,
      ...(kind === "trace" || kind === "measurement" ? { sample_count: summary.sample_count } : {}),
      artifact: caseResult.records[kind].artifact,
    };
    if (!isDeepStrictEqual(caseResult.records[kind], expected)) fail("content_invalid");
    summaries[kind] = summary;
    sourceArtifacts.push(...summary.source_artifacts);
  }
  return Object.freeze({ summaries: Object.freeze(summaries), sourceArtifacts: Object.freeze(sourceArtifacts) });
}

export function produceV12CalendarCaseEvidence({ root, requiredCase, execution, observations }) {
  validateExecution(execution);
  const repositoryRoot = path.resolve(root);
  const runRoot = path.join(repositoryRoot, "artifacts/native/v1.2", execution.run_id);
  ensureV12CalendarDirectory(runRoot, { root: repositoryRoot });
  const readArtifactBytes = (artifactPath) => {
    const absolute = resolveV12CalendarPath(path.resolve(repositoryRoot, artifactPath), {
      root: runRoot,
      mustExist: true,
    });
    return readFileSync(absolute);
  };
  const bundle = createV12CalendarCaseEvidenceBundle({
    requiredCase,
    execution,
    observations,
    readArtifactBytes,
  });
  const resultWithoutArtifact = {
    id: requiredCase.id,
    case_sha256: requiredCase.case_sha256,
    native_execution: "EXECUTED",
    binding: v12CalendarCaseEvidenceBinding(requiredCase),
    execution,
    records: bundle.records,
  };
  for (const [kind, { bytes }] of Object.entries(bundle.artifacts)) {
    const absolute = path.join(repositoryRoot, bundle.records[kind].artifact.path);
    ensureV12CalendarDirectory(path.dirname(absolute), { root: runRoot });
    writeExclusiveArtifact(absolute, bytes, { root: runRoot });
  }
  const caseBytes = Buffer.from(stableCanonicalJson(resultWithoutArtifact));
  const artifact = {
    path: `artifacts/native/v1.2/${execution.run_id}/cases/${requiredCase.case_sha256}.json`,
    sha256: sha256(caseBytes),
    size_bytes: caseBytes.length,
  };
  const absolute = path.join(repositoryRoot, artifact.path);
  ensureV12CalendarDirectory(path.dirname(absolute), { root: runRoot });
  writeExclusiveArtifact(absolute, caseBytes, { root: runRoot });
  return Object.freeze({ ...resultWithoutArtifact, artifact });
}
