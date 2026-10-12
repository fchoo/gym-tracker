import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { PNG } from "pngjs";

import {
  V12_CALENDAR_CASE_LEDGER_DESCRIPTOR,
  V12_CALENDAR_CASE_REGISTRY_DESCRIPTOR,
  V12_CALENDAR_REQUIRED_CASES,
  V12_CALENDAR_REQUIRED_CASE_IDS,
  validateV12CalendarCaseLedgerDescriptor,
  validateV12CalendarCaseRegistryDescriptor,
} from "./v12-calendar-case-registry.mjs";
import { exactKeys } from "./node-evidence-utils.mjs";
import {
  createExclusiveDirectory,
  ensureV12CalendarDirectory,
  resolveV12CalendarPath,
  stableCanonicalJson,
  writeExclusiveArtifact,
} from "./v12-calendar-artifacts.mjs";

const ROOT = process.cwd();
const SHA256 = /^[a-f0-9]{64}$/u;
const CASE_RESULTS = new Set(["PASS", "FAIL", "REVIEW_REQUIRED"]);
const RECORD_CLASSIFICATIONS = new Set(["PASS", "FAIL", "REVIEW_REQUIRED", "accepted_deviation"]);
const SEMANTIC_TARGETS = new Set(["calendar-month", "calendar-key", "calendar-agenda", "calendar-strength-detail"]);
const SYNTHETIC_FIXTURES = new Set(["synthetic-calendar-month-v1", "synthetic-calendar-key-v1", "synthetic-calendar-agenda-v1", "synthetic-calendar-focus-v1", "synthetic-calendar-planned-detail-v1", "synthetic-calendar-accessibility-v1", "synthetic-calendar-system-light-v1", "synthetic-calendar-system-dark-v1"]);
const DIFFERENCE_KINDS = new Set(["approved", "visual", "antialias_only", "platform_chrome_masked", "native_metric_within_tolerance", "product_mismatch"]);
const REFERENCE_PATHS = new Set([
  ".planning/design/v1.2-browser-evidence/light-calendar-month.png",
  ".planning/design/v1.2-browser-evidence/dark-calendar-month.png",
  ".planning/design/v1.2-browser-evidence/light-calendar-key.png",
  ".planning/design/v1.2-browser-evidence/dark-calendar-key.png",
  ".planning/design/v1.2-browser-evidence/light-calendar-agenda-2026-10-07.png",
  ".planning/design/v1.2-browser-evidence/dark-calendar-agenda-2026-10-07.png",
  ".planning/design/v1.2-browser-evidence/light-calendar-focus-rest.png",
  ".planning/design/v1.2-browser-evidence/light-calendar-planned-strength-detail.png",
  ".planning/design/v1.2-browser-evidence/dark-calendar-planned-strength-detail.png",
  ".planning/design/v1.2-browser-evidence/calendar-360-prototype.png",
  ".planning/design/v1.2-browser-evidence/calendar-360-accessibility-proposal.png",
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fail(code) { throw new Error(`v12_calendar_${code}`); }
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
function schema(value, keys, location) {
  if (!exactKeys(value, keys)) fail(`privacy_schema_invalid:${location}`);
}
function normalizedPath(value) {
  if ([typeof value !== "string", typeof value === "string" && (value.length === 0 || value.includes("\\") || path.isAbsolute(value) || path.posix.normalize(value) !== value || value.split("/").includes(".."))].some(Boolean)) fail("path_invalid");
  return value;
}
function comparisonArtifactName(kind) {
  return kind === "record" ? "comparison.json" : `${kind}.png`;
}
function assertComparisonArtifactPath(value, { host, runId, recordId, kind }) {
  const actual = normalizedPath(value);
  const suffix = `comparison/${recordId}/${comparisonArtifactName(kind)}`;
  const legacyHostName = `fixtures/comparison/${recordId}-${kind}.${kind === "record" ? "json" : "png"}`;
  const expected = host ? new Set([suffix, `fixtures/${suffix}`, legacyHostName]) : new Set([`artifacts/native/v1.2/${runId}/${suffix}`]);
  if (!expected.has(actual)) fail("path_invalid");
}
function safePath(value, root = ROOT, allowExternal = false) {
  if ([typeof value !== "string", typeof value === "string" && value.length === 0].some(Boolean)) fail("path_invalid");
  const resolved = path.resolve(value);
  const roots = (allowExternal ? [root, tmpdir()] : [root]).filter((candidate) => {
    const relative = path.relative(path.resolve(candidate), resolved);
    return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });
  if (roots.length === 0) fail("path_escape");
  for (const candidate of roots) {
    try {
      return resolveV12CalendarPath(resolved, { root: candidate, mustExist: true });
    } catch {}
  }
  fail("path_unsafe");
}
function pngInfo(file) {
  const bytes = readFileSync(file);
  if (bytes.subarray(0, 8).compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0) fail("png_invalid");
  return { bytes, sha256: sha256(bytes), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
function assertTrace(trace) {
  schema(trace, Object.hasOwn(trace, "schemaVersion")
    ? ["schemaVersion", "stage", "synthetic", "samples"]
    : ["synthetic", "samples"], "trace");
  if ([trace.synthetic !== true, !Array.isArray(trace.samples)].some(Boolean)) fail("trace_invalid");
  for (const sample of trace.samples) {
    const evidenceKeys = Object.hasOwn(sample, "elapsedMs") ? ["elapsedMs", "synthetic"] : [];
    if (sample.kind === "drag") schema(sample, ["kind", "dx", "viewportWidth", "transformX", "semanticOffset", "titleOffset", ...evidenceKeys], "trace.drag");
    else if (sample.kind === "release") schema(sample, ["kind", "dx", "viewportWidth", "semanticOffset", "titleOffset", ...evidenceKeys], "trace.release");
    else fail("trace_invalid");
  }
  const samples = trace.samples.filter((sample) => sample?.kind === "drag");
  const markers = [0.249, 0.25, 0.251].map((marker) => samples.find((sample) => finite(sample.dx) && finite(sample.viewportWidth) && Math.abs(Math.abs(sample.dx) / sample.viewportWidth - marker) < 0.00001));
  if (markers.some((sample) => sample === undefined)) fail("trace_25_percent_missing");
  const [below, exact, above] = markers;
  const direction = Math.sign(exact.dx) * -1;
  const release = trace.samples.find((sample) => sample?.kind === "release");
  if ([
    below.semanticOffset !== 0,
    exact.semanticOffset !== 0,
    above.semanticOffset !== 0,
    below.titleOffset !== 0,
    exact.titleOffset !== direction,
    above.titleOffset !== direction,
    release?.semanticOffset !== direction,
    release?.titleOffset !== direction,
  ].some(Boolean)) fail("trace_25_percent_semantic");
}
function assertSemantics(semantics) {
  schema(semantics, ["focus_ring_dp", "focus_clearance_dp", "authority", "target"], "semantics");
  if (typeof semantics.target !== "string" || !SEMANTIC_TARGETS.has(semantics.target)) fail("privacy_schema_invalid:semantics.target");
  if ([semantics.focus_ring_dp !== 3, semantics.focus_clearance_dp !== 4, semantics.authority !== "read-only"].some(Boolean)) fail("semantic_mismatch");
}
function assertLedger(map) {
  try { validateV12CalendarCaseLedgerDescriptor(map.case_ledger); }
  catch { fail("ledger_required_case_missing"); }
}

function assertCaseResults(entries, nativeExecution, runId) {
  if (nativeExecution === "NOT_RUN") {
    schema(entries, ["status", "native_execution", "required_case_count"], "case_results");
    if ([entries.status !== "REVIEW_REQUIRED", entries.native_execution !== "NOT_RUN", entries.required_case_count !== V12_CALENDAR_REQUIRED_CASE_IDS.length].some(Boolean)) fail("case_result_invalid");
    return ["REVIEW_REQUIRED"];
  }
  if ([!Array.isArray(entries), Array.isArray(entries) && entries.length !== V12_CALENDAR_REQUIRED_CASE_IDS.length, Array.isArray(entries) && entries.some((entry, index) => entry?.id !== V12_CALENDAR_REQUIRED_CASE_IDS[index])].some(Boolean)) fail("case_result_set_invalid");
  for (const [index, entry] of entries.entries()) {
    schema(entry, ["id", "case_sha256", "status", "native_execution", "artifact"], "case_result");
    const requiredCase = V12_CALENDAR_REQUIRED_CASES[index];
    if ([!CASE_RESULTS.has(entry.status), entry.native_execution !== nativeExecution, entry.case_sha256 !== requiredCase.case_sha256].some(Boolean)) fail("case_result_invalid");
    schema(entry.artifact, entry.artifact.size_bytes === undefined ? ["path", "sha256"] : ["path", "sha256", "size_bytes"], "case_result.artifact");
    if (!SHA256.test(entry.artifact.sha256)) fail("case_result_invalid");
    if (normalizedPath(entry.artifact.path) !== `artifacts/native/v1.2/${runId}/cases/${entry.case_sha256}.json`) fail("path_invalid");
  }
  return entries.map(({ status }) => status);
}

function assertIdentity(identity) {
  schema(identity, ["base_head", "source_tree_sha256", "source_manifest_sha256", "reference_map_sha256", "package", "apk_sha256", "installed_apk_sha256", "device_identity_sha256", "report_sha256"], "identity");
  if ([
    !/^[a-f0-9]{40}$/u.test(identity.base_head),
    !SHA256.test(identity.source_tree_sha256),
    !SHA256.test(identity.source_manifest_sha256),
    !SHA256.test(identity.reference_map_sha256),
    identity.package !== "com.fchoo.gymtracker.devtest",
    !SHA256.test(identity.apk_sha256),
    identity.installed_apk_sha256 !== identity.apk_sha256,
    !SHA256.test(identity.device_identity_sha256),
    !SHA256.test(identity.report_sha256),
  ].some(Boolean)) fail("result_identity_invalid");
}

export function v12CalendarReferenceMapSha256(map) {
  return sha256(Buffer.from(stableCanonicalJson(map)));
}

export function validateV12CalendarReferenceMap(map, options = {}) {
  schema(map, map.host_only_fixture === true
    ? ["schema_version", "prototype_revision", "source_manifest_sha256", "host_only_fixture", "case_registry", "captures", "case_ledger"]
    : ["schema_version", "prototype_revision", "source_manifest", "source_manifest_sha256", "case_registry", "captures", "case_ledger"], "reference_map");
  if ([map.schema_version !== 1, map.prototype_revision !== 18, !SHA256.test(map.source_manifest_sha256), !Array.isArray(map.captures), Array.isArray(map.captures) && map.captures.length === 0].some(Boolean)) fail("map_invalid");
  try { validateV12CalendarCaseRegistryDescriptor(map.case_registry); }
  catch { fail("case_registry_invalid"); }
  const ids = new Set();
  for (const capture of map.captures) {
    schema(capture, ["id", "requirement_ids", "reference", "configuration"], "reference_capture");
    if ([typeof capture.id !== "string", typeof capture.id === "string" && !/^calendar-[a-z0-9-]{3,63}$/u.test(capture.id), ids.has(capture.id), !Array.isArray(capture.requirement_ids), Array.isArray(capture.requirement_ids) && capture.requirement_ids.length === 0, Array.isArray(capture.requirement_ids) && capture.requirement_ids.some((id) => !/^CAL-\d+$/u.test(id))].some(Boolean)) fail("map_capture_invalid");
    ids.add(capture.id);
    const reference = capture.reference;
    schema(reference, ["path", "sha256", "width", "height"], "reference_descriptor");
    if ([!SHA256.test(reference.sha256), !Number.isInteger(reference.width), !Number.isInteger(reference.height), reference.width < 1, reference.height < 1].some(Boolean)) fail("map_reference_invalid");
    if (map.host_only_fixture === true) {
      const relative = path.relative(tmpdir(), path.resolve(reference.path)).split(path.sep).join("/");
      if (!/^v12-calendar-[a-zA-Z0-9_-]+\/(?:reference|native)\.png$/u.test(relative)) fail("path_invalid");
    } else if (!REFERENCE_PATHS.has(normalizedPath(reference.path))) fail("path_invalid");
    if (options.verifyFiles) {
      const info = pngInfo(safePath(reference.path, ROOT, options.allowExternal === true));
      if ([info.sha256 !== reference.sha256, info.width !== reference.width, info.height !== reference.height].some(Boolean)) fail("reference_stale");
    }
    const configuration = capture.configuration;
    schema(configuration, ["theme", "viewport", "orientation", "font_scale", "motion", "input", "fixture"], "reference_configuration");
    schema(configuration.viewport, ["width", "height"], "reference_viewport");
    if ([!["Light", "Dark", "System"].includes(configuration.theme), !finite(configuration.viewport.width), !finite(configuration.viewport.height), !["portrait", "landscape"].includes(configuration.orientation), !finite(configuration.font_scale), !["normal", "reduced"].includes(configuration.motion), !["touch", "keyboard", "dpad"].includes(configuration.input), !SYNTHETIC_FIXTURES.has(configuration.fixture)].some(Boolean)) fail("configuration_invalid");
  }
  assertLedger(map);
  return true;
}

function artifact(file, bytes, root, descriptorRoot) {
  writeExclusiveArtifact(file, bytes, { root });
  return { path: path.relative(descriptorRoot, file).split(path.sep).join("/"), sha256: sha256(bytes) };
}
function imageArtifacts(referenceBytes, nativeBytes, output, descriptorRoot) {
  const reference = PNG.sync.read(referenceBytes);
  const native = PNG.sync.read(nativeBytes);
  const overlay = new PNG({ width: reference.width, height: reference.height });
  const difference = new PNG({ width: reference.width, height: reference.height });
  const mask = new PNG({ width: reference.width, height: reference.height });
  for (let index = 0; index < reference.data.length; index += 4) {
    const changed = reference.data[index] !== native.data[index] || reference.data[index + 1] !== native.data[index + 1] || reference.data[index + 2] !== native.data[index + 2] || reference.data[index + 3] !== native.data[index + 3];
    for (let channel = 0; channel < 3; channel += 1) {
      overlay.data[index + channel] = Math.round((reference.data[index + channel] + native.data[index + channel]) / 2);
      difference.data[index + channel] = Math.abs(reference.data[index + channel] - native.data[index + channel]);
      mask.data[index + channel] = changed ? 255 : 0;
    }
    overlay.data[index + 3] = 255; difference.data[index + 3] = 255; mask.data[index + 3] = 255;
  }
  return { overlay: artifact(path.join(output, "overlay.png"), PNG.sync.write(overlay), output, descriptorRoot), difference: artifact(path.join(output, "difference.png"), PNG.sync.write(difference), output, descriptorRoot), mask: artifact(path.join(output, "mask.png"), PNG.sync.write(mask), output, descriptorRoot) };
}

export function compareV12Calendar({ map, run, outputDirectory }) {
  validateV12CalendarReferenceMap(map, { verifyFiles: true, allowExternal: map.host_only_fixture === true });
  schema(run, ["schema_version", "run_id", "identity", "source_tree_sha256", "source_manifest_sha256", "status", "captures"], "run");
  if ([run.schema_version !== 1, run.status !== "NOT_RUN", run.run_id !== "phase16-host-deferred", run.source_manifest_sha256 !== map.source_manifest_sha256, !SHA256.test(run.source_tree_sha256), !Array.isArray(run.captures)].some(Boolean)) fail("run_identity_invalid");
  assertIdentity(run.identity);
  if ([run.identity.source_tree_sha256 !== run.source_tree_sha256, run.identity.source_manifest_sha256 !== run.source_manifest_sha256, run.identity.reference_map_sha256 !== v12CalendarReferenceMapSha256(map)].some(Boolean)) fail("run_identity_invalid");
  const mapById = new Map(map.captures.map((capture) => [capture.id, capture]));
  if ([run.captures.length !== mapById.size, new Set(run.captures.map((capture) => capture.id)).size !== run.captures.length].some(Boolean)) fail("capture_set_invalid");
  const destination = path.resolve(outputDirectory);
  const outputRoot = [ROOT, tmpdir()].find((candidate) => {
    const relative = path.relative(path.resolve(candidate), destination);
    return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });
  if (outputRoot === undefined) fail("output_escape");
  ensureV12CalendarDirectory(path.dirname(destination), { root: outputRoot, allowRoot: true });
  createExclusiveDirectory(destination, "output_exists", { root: outputRoot });
  const descriptorRoot = path.resolve(outputRoot) === path.resolve(ROOT) ? ROOT : path.dirname(destination);
  const records = [];
  for (const capture of run.captures) {
    schema(capture, ["id", "native", "trace", "semantics", "classification", "differences"], "run_capture");
    const mapped = mapById.get(capture.id);
    if (!mapped) fail("capture_unknown");
    if ([capture.classification !== "REVIEW_REQUIRED", !Array.isArray(capture.differences)].some(Boolean)) fail("classification_invalid");
    assertTrace(capture.trace); assertSemantics(capture.semantics);
    schema(capture.native, ["path", "sha256", "width", "height"], "native_descriptor");
    const referenceFile = safePath(mapped.reference.path, ROOT, map.host_only_fixture === true);
    const nativeFile = safePath(capture.native?.path, ROOT, map.host_only_fixture === true);
    const referenceInfo = pngInfo(referenceFile); const nativeInfo = pngInfo(nativeFile);
    if ([referenceInfo.sha256 !== mapped.reference.sha256, nativeInfo.sha256 !== capture.native.sha256, nativeInfo.width !== capture.native.width, nativeInfo.height !== capture.native.height, referenceInfo.width !== nativeInfo.width, referenceInfo.height !== nativeInfo.height].some(Boolean)) fail("image_identity_invalid");
    const output = path.join(destination, capture.id);
    createExclusiveDirectory(output, "output_exists", { root: destination });
    const referenceArtifact = artifact(path.join(output, "reference.png"), referenceInfo.bytes, output, descriptorRoot);
    const nativeArtifact = artifact(path.join(output, "native.png"), nativeInfo.bytes, output, descriptorRoot);
    const generated = imageArtifacts(referenceInfo.bytes, nativeInfo.bytes, output, descriptorRoot);
    const record = { schema_version: 2, id: capture.id, requirement_ids: mapped.requirement_ids, classification: "REVIEW_REQUIRED", differences: capture.differences, reference: referenceArtifact, native: nativeArtifact, ...generated, source_manifest_sha256: map.source_manifest_sha256, source_tree_sha256: run.source_tree_sha256 };
    const recordArtifact = artifact(path.join(output, "comparison.json"), Buffer.from(stableCanonicalJson(record)), output, descriptorRoot);
    records.push({
      id: capture.id,
      classification: "REVIEW_REQUIRED",
      differences: capture.differences,
      artifacts: { reference: referenceArtifact, native: nativeArtifact, ...generated, record: recordArtifact },
    });
  }
  const caseResults = Object.freeze({
    status: "REVIEW_REQUIRED",
    native_execution: "NOT_RUN",
    required_case_count: V12_CALENDAR_REQUIRED_CASE_IDS.length,
  });
  const result = { schema_version: 2, suite: "v1.2-calendar-comparison", mode: "host-deferred", run_id: run.run_id, status: "REVIEW_REQUIRED", native_execution: "NOT_RUN", phase20_deferred: true, identity: run.identity, case_registry: V12_CALENDAR_CASE_REGISTRY_DESCRIPTOR, case_ledger: V12_CALENDAR_CASE_LEDGER_DESCRIPTOR, case_results: caseResults, records };
  return Object.freeze(result);
}

export function validateV12CalendarComparison(result, options = {}) {
  schema(result, ["schema_version", "suite", "mode", "run_id", "status", "native_execution", "phase20_deferred", "identity", "case_registry", "case_ledger", "case_results", "records"], "comparison");
  const host = result.mode === "host-deferred";
  const live = result.mode === "live-executed";
  if ([result.schema_version !== 2, result.suite !== "v1.2-calendar-comparison", !host && !live, result.native_execution !== (host ? "NOT_RUN" : "EXECUTED"), result.phase20_deferred !== host, !Array.isArray(result.records), Array.isArray(result.records) && result.records.length === 0].some(Boolean)) fail("result_invalid");
  if ([host && result.run_id !== "phase16-host-deferred", live && !/^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(result.run_id)].some(Boolean)) fail("result_identity_invalid");
  assertIdentity(result.identity);
  if ([options.expectedRunId !== undefined && result.run_id !== options.expectedRunId, options.expectedIdentity !== undefined && !isDeepStrictEqual(result.identity, options.expectedIdentity)].some(Boolean)) fail("result_identity_invalid");
  try { validateV12CalendarCaseRegistryDescriptor(result.case_registry); }
  catch { fail("case_registry_invalid"); }
  try { validateV12CalendarCaseLedgerDescriptor(result.case_ledger); }
  catch { fail("case_ledger_invalid"); }
  const statuses = assertCaseResults(result.case_results, result.native_execution, result.run_id);
  for (const record of result.records) {
    schema(record, ["id", "classification", "differences", "artifacts", ...(record.classification === "accepted_deviation" ? ["deviation_id"] : [])], "comparison_record");
    if ([!RECORD_CLASSIFICATIONS.has(record.classification), !Array.isArray(record.differences)].some(Boolean)) fail("classification_invalid");
    for (const difference of record.differences) {
      schema(difference, ["kind", "explained"], "comparison_difference");
      if (!DIFFERENCE_KINDS.has(difference.kind)) fail("privacy_schema_invalid:comparison_difference.kind");
      if (difference.explained !== true) fail("difference_unexplained");
    }
    const artifacts = record.artifacts;
    schema(artifacts, ["reference", "native", "overlay", "difference", "mask", "record"], "comparison_artifacts");
    for (const field of ["reference", "native", "overlay", "difference", "mask", "record"]) {
      schema(artifacts[field], artifacts[field].size_bytes === undefined ? ["path", "sha256"] : ["path", "sha256", "size_bytes"], `comparison_${field}`);
      if (!SHA256.test(artifacts[field].sha256)) fail("artifact_hash_invalid");
      assertComparisonArtifactPath(artifacts[field].path, { host, runId: result.run_id, recordId: record.id, kind: field });
    }
    statuses.push(record.classification === "accepted_deviation" ? "REVIEW_REQUIRED" : record.classification);
  }
  const expectedStatus = statuses.includes("FAIL") ? "FAIL" : statuses.includes("REVIEW_REQUIRED") ? "REVIEW_REQUIRED" : "PASS";
  if ([result.status !== expectedStatus, host && expectedStatus !== "REVIEW_REQUIRED"].some(Boolean)) fail("result_status_invalid");
  return true;
}

function fixtureInput(file) {
  const fixture = JSON.parse(readFileSync(file, "utf8"));
  if (fixture?.mode !== "host-only-synthetic" || typeof fixture.png_base64 !== "string") fail("fixture_invalid");
  const directory = mkdtempSync(path.join(tmpdir(), "v12-calendar-host-"));
  const bytes = Buffer.from(fixture.png_base64, "base64");
  const reference = path.join(directory, "reference.png"); const native = path.join(directory, "native.png");
  writeFileSync(reference, bytes); writeFileSync(native, bytes);
  const hash = sha256(bytes);
  const map = { schema_version: 1, prototype_revision: 18, source_manifest_sha256: fixture.source_manifest_sha256, host_only_fixture: true, case_registry: V12_CALENDAR_CASE_REGISTRY_DESCRIPTOR, captures: [{ id: "calendar-month-light-390", requirement_ids: ["CAL-01"], reference: { path: reference, sha256: hash, width: 1, height: 1 }, configuration: { theme: "Light", viewport: { width: 390, height: 844 }, orientation: "portrait", font_scale: 1, motion: "normal", input: "touch", fixture: "synthetic-calendar-month-v1" } }], case_ledger: V12_CALENDAR_CASE_LEDGER_DESCRIPTOR };
  const identity = { base_head: "a".repeat(40), source_tree_sha256: fixture.source_tree_sha256, source_manifest_sha256: fixture.source_manifest_sha256, reference_map_sha256: v12CalendarReferenceMapSha256(map), package: "com.fchoo.gymtracker.devtest", apk_sha256: "c".repeat(64), installed_apk_sha256: "c".repeat(64), device_identity_sha256: "d".repeat(64), report_sha256: "e".repeat(64) };
  const run = { schema_version: 1, run_id: "phase16-host-deferred", identity, source_tree_sha256: fixture.source_tree_sha256, source_manifest_sha256: fixture.source_manifest_sha256, status: "NOT_RUN", captures: [{ id: "calendar-month-light-390", native: { path: native, sha256: hash, width: 1, height: 1 }, trace: { synthetic: true, samples: [{ kind: "drag", dx: -89.64, viewportWidth: 360, transformX: -89.64, semanticOffset: 0, titleOffset: 0 }, { kind: "drag", dx: -90, viewportWidth: 360, transformX: -90, semanticOffset: 0, titleOffset: 1 }, { kind: "drag", dx: -90.36, viewportWidth: 360, transformX: -90.36, semanticOffset: 0, titleOffset: 1 }, { kind: "release", dx: -90.36, viewportWidth: 360, semanticOffset: 1, titleOffset: 1 }] }, semantics: { focus_ring_dp: 3, focus_clearance_dp: 4, authority: "read-only", target: "calendar-month" }, classification: "REVIEW_REQUIRED", differences: [] }] };
  return { directory, map, run };
}

export function executeV12CalendarComparisonFixture(args = process.argv.slice(2)) {
  const index = args.indexOf("--fixture");
  if (index < 0 || args[index + 1] === undefined) fail("fixture_argument_invalid");
  const input = fixtureInput(path.resolve(args[index + 1]));
  try {
    const result = compareV12Calendar({ ...input, outputDirectory: path.join(input.directory, "comparison") });
    if (args.includes("--verify")) validateV12CalendarComparison(result);
    return Object.freeze({ status: result.status, native_execution: result.native_execution, host_only: true });
  } finally { rmSync(input.directory, { recursive: true, force: true }); }
}

export function runV12CalendarComparisonCli(args = process.argv.slice(2), io = process) {
  try {
    io.stdout.write(`${JSON.stringify(executeV12CalendarComparisonFixture(args))}\n`);
    return 0;
  } catch (error) {
    io.stderr.write(`${error.message}\n`);
    return 1;
  }
}

/* node:coverage ignore next 4 */
if (process.argv[1]?.endsWith("compare-v12-calendar.mjs")) {
  process.exitCode = runV12CalendarComparisonCli();
}
