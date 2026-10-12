import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PNG } from "pngjs";

const ROOT = process.cwd();
const SHA256 = /^[a-f0-9]{64}$/u;
const PRIVATE_FIELDS = /serial|token|email|sessionid|eventid|latitude|longitude/iu;
const REVIEW_CLASSIFICATIONS = new Set(["NOT_RUN", "REVIEW_REQUIRED", "FAIL", "ACCEPTED_EXCEPTION"]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(value, Object.keys(value ?? {}).sort(), 2);

function fail(code) { throw new Error(`v12_calendar_${code}`); }
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
function safePath(value, root = ROOT, allowExternal = false) {
  if (typeof value !== "string" || value.length === 0) fail("path_invalid");
  const resolved = path.resolve(value);
  if (!allowExternal && resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) fail("path_escape");
  if (!existsSync(resolved) || lstatSync(resolved).isSymbolicLink()) fail("path_unsafe");
  return resolved;
}
function pngInfo(file) {
  const bytes = readFileSync(file);
  if (bytes.subarray(0, 8).compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0) fail("png_invalid");
  return { bytes, sha256: sha256(bytes), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
function scanPrivate(value) {
  if (typeof value === "string" && PRIVATE_FIELDS.test(value)) fail("privacy_leak");
  if (Array.isArray(value)) value.forEach(scanPrivate);
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, child]) => { if (PRIVATE_FIELDS.test(key)) fail("privacy_leak"); scanPrivate(child); });
}
function assertTrace(trace) {
  if (trace?.synthetic !== true || !Array.isArray(trace.samples)) fail("trace_invalid");
  const samples = trace.samples.filter((sample) => sample?.kind === "drag");
  const markers = [0.249, 0.25, 0.251].map((marker) => samples.find((sample) => finite(sample.dx) && finite(sample.viewportWidth) && Math.abs(Math.abs(sample.dx) / sample.viewportWidth - marker) < 0.00001));
  if (markers.some((sample) => sample === undefined)) fail("trace_25_percent_missing");
  const [below, exact, above] = markers;
  if (below.titleMonth !== below.semanticMonth || exact.titleMonth !== exact.semanticMonth || above.titleMonth !== above.semanticMonth || below.titleMonth === exact.titleMonth || exact.titleMonth !== above.titleMonth) fail("trace_25_percent_semantic");
}
function assertSemantics(semantics) {
  if (semantics?.focus_ring_dp !== 3 || semantics?.focus_clearance_dp !== 4 || semantics?.authority !== "read-only" || typeof semantics?.target !== "string") fail("semantic_mismatch");
}
function assertLedger(map) {
  if (!Array.isArray(map.case_ledger) || map.case_ledger.length === 0) fail("ledger_missing");
  const hasLight = map.case_ledger.some((entry) => entry.theme === "Light");
  const hasDark = map.case_ledger.some((entry) => entry.theme === "Dark");
  const hasAccessibility = map.case_ledger.some((entry) => entry.input === "keyboard" || entry.input === "dpad");
  const hasReducedMotion = map.case_ledger.some((entry) => entry.motion === "reduced");
  if (!hasLight || !hasDark || !hasAccessibility || !hasReducedMotion) fail("ledger_required_case_missing");
}

export function validateV12CalendarReferenceMap(map, options = {}) {
  if (map?.schema_version !== 1 || map.prototype_revision !== 18 || !SHA256.test(map.source_manifest_sha256 ?? "") || !Array.isArray(map.captures) || map.captures.length === 0) fail("map_invalid");
  const ids = new Set();
  for (const capture of map.captures) {
    if (typeof capture?.id !== "string" || ids.has(capture.id) || !Array.isArray(capture.requirement_ids) || capture.requirement_ids.length === 0 || capture.requirement_ids.some((id) => !/^CAL-\d+$/u.test(id))) fail("map_capture_invalid");
    ids.add(capture.id);
    const reference = capture.reference;
    if (!reference || !SHA256.test(reference.sha256 ?? "") || !Number.isInteger(reference.width) || !Number.isInteger(reference.height) || reference.width < 1 || reference.height < 1) fail("map_reference_invalid");
    if (options.verifyFiles) {
      const info = pngInfo(safePath(reference.path, ROOT, options.allowExternal === true));
      if (info.sha256 !== reference.sha256 || info.width !== reference.width || info.height !== reference.height) fail("reference_stale");
    }
    const configuration = capture.configuration;
    if (!configuration || !["Light", "Dark", "System"].includes(configuration.theme) || !finite(configuration.viewport?.width) || !finite(configuration.viewport?.height) || !["portrait", "landscape"].includes(configuration.orientation) || !finite(configuration.font_scale) || !["normal", "reduced"].includes(configuration.motion) || !["touch", "keyboard", "dpad"].includes(configuration.input) || typeof configuration.fixture !== "string") fail("configuration_invalid");
  }
  assertLedger(map);
  const referenced = new Set(map.case_ledger.flatMap((entry) => Array.isArray(entry.capture_ids) ? entry.capture_ids : []));
  if (referenced.size !== ids.size || [...ids].some((id) => !referenced.has(id)) || [...referenced].some((id) => !ids.has(id))) fail("ledger_capture_set_mismatch");
  scanPrivate(map);
  return true;
}

function artifact(file, bytes) {
  writeFileSync(file, bytes);
  return { path: path.relative(ROOT, file), sha256: sha256(bytes) };
}
function imageArtifacts(referenceBytes, nativeBytes, output) {
  const reference = PNG.sync.read(referenceBytes);
  const native = PNG.sync.read(nativeBytes);
  if (reference.width !== native.width || reference.height !== native.height) fail("geometry_mismatch");
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
  return { overlay: artifact(path.join(output, "overlay.png"), PNG.sync.write(overlay)), difference: artifact(path.join(output, "difference.png"), PNG.sync.write(difference)), mask: artifact(path.join(output, "mask.png"), PNG.sync.write(mask)) };
}

export function compareV12Calendar({ map, run, outputDirectory }) {
  validateV12CalendarReferenceMap(map, { verifyFiles: true, allowExternal: map.host_only_fixture === true });
  if (run?.schema_version !== 1 || run.status !== "NOT_RUN" || run.source_manifest_sha256 !== map.source_manifest_sha256 || !SHA256.test(run.source_tree_sha256 ?? "") || !Array.isArray(run.captures)) fail("run_identity_invalid");
  scanPrivate(run);
  const mapById = new Map(map.captures.map((capture) => [capture.id, capture]));
  if (run.captures.length !== mapById.size || new Set(run.captures.map((capture) => capture.id)).size !== run.captures.length) fail("capture_set_invalid");
  const destination = path.resolve(outputDirectory);
  if (destination !== ROOT && !destination.startsWith(`${ROOT}${path.sep}`) && !destination.startsWith(`${tmpdir()}${path.sep}`)) fail("output_escape");
  mkdirSync(destination, { recursive: true });
  const records = [];
  for (const capture of run.captures) {
    const mapped = mapById.get(capture.id);
    if (!mapped) fail("capture_unknown");
    if (!REVIEW_CLASSIFICATIONS.has(capture.classification) || capture.classification === "PASS" || !Array.isArray(capture.differences)) fail("classification_invalid");
    assertTrace(capture.trace); assertSemantics(capture.semantics);
    const referenceFile = safePath(mapped.reference.path, ROOT, map.host_only_fixture === true);
    const nativeFile = safePath(capture.native?.path, ROOT, map.host_only_fixture === true);
    const referenceInfo = pngInfo(referenceFile); const nativeInfo = pngInfo(nativeFile);
    if (referenceInfo.sha256 !== mapped.reference.sha256 || nativeInfo.sha256 !== capture.native.sha256 || nativeInfo.width !== capture.native.width || nativeInfo.height !== capture.native.height || referenceInfo.width !== nativeInfo.width || referenceInfo.height !== nativeInfo.height) fail("image_identity_invalid");
    const output = path.join(destination, capture.id);
    mkdirSync(output, { recursive: true });
    const referenceArtifact = artifact(path.join(output, "reference.png"), referenceInfo.bytes);
    const nativeArtifact = artifact(path.join(output, "native.png"), nativeInfo.bytes);
    const generated = imageArtifacts(referenceInfo.bytes, nativeInfo.bytes, output);
    const record = { schema_version: 1, id: capture.id, requirement_ids: mapped.requirement_ids, classification: "REVIEW_REQUIRED", reference: referenceArtifact, native: nativeArtifact, ...generated, source_manifest_sha256: map.source_manifest_sha256, source_tree_sha256: run.source_tree_sha256 };
    const recordArtifact = artifact(path.join(output, "comparison.json"), Buffer.from(`${canonical(record)}\n`));
    records.push({ ...record, record: recordArtifact });
  }
  const result = { schema_version: 1, status: "REVIEW_REQUIRED", native_execution: "NOT_RUN", phase20_deferred: true, records };
  return Object.freeze(result);
}

export function validateV12CalendarComparison(result) {
  if (result?.schema_version !== 1 || result.status !== "REVIEW_REQUIRED" || result.native_execution !== "NOT_RUN" || result.phase20_deferred !== true || !Array.isArray(result.records) || result.records.length === 0) fail("result_invalid");
  for (const record of result.records) for (const field of ["reference", "native", "overlay", "difference", "mask", "record"]) if (!SHA256.test(record[field]?.sha256 ?? "")) fail("artifact_hash_invalid");
  scanPrivate(result);
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
  const map = { schema_version: 1, prototype_revision: 18, source_manifest_sha256: fixture.source_manifest_sha256, host_only_fixture: true, captures: [{ id: "calendar-month-light-390", requirement_ids: ["CAL-01"], reference: { path: reference, sha256: hash, width: 1, height: 1 }, configuration: { theme: "Light", viewport: { width: 390, height: 844 }, orientation: "portrait", font_scale: 1, motion: "normal", input: "touch", fixture: "synthetic-calendar-month-v1" } }], case_ledger: [{ id: "light", capture_ids: ["calendar-month-light-390"], theme: "Light", motion: "normal", input: "touch", viewport: "390x844" }, { id: "dark", capture_ids: ["calendar-month-light-390"], theme: "Dark", motion: "normal", input: "touch", viewport: "390x844" }, { id: "accessibility", capture_ids: ["calendar-month-light-390"], theme: "Light", motion: "normal", input: "keyboard", viewport: "390x844" }, { id: "reduced-motion", capture_ids: ["calendar-month-light-390"], theme: "Light", motion: "reduced", input: "touch", viewport: "390x844" }] };
  const run = { schema_version: 1, run_id: "host-fixture", source_tree_sha256: fixture.source_tree_sha256, source_manifest_sha256: fixture.source_manifest_sha256, status: "NOT_RUN", captures: [{ id: "calendar-month-light-390", native: { path: native, sha256: hash, width: 1, height: 1 }, trace: { synthetic: true, samples: [{ kind: "drag", dx: -89.64, viewportWidth: 360, transformX: -89.64, semanticMonth: "2026-10", titleMonth: "2026-10" }, { kind: "drag", dx: -90, viewportWidth: 360, transformX: -90, semanticMonth: "2026-11", titleMonth: "2026-11" }, { kind: "drag", dx: -90.36, viewportWidth: 360, transformX: -90.36, semanticMonth: "2026-11", titleMonth: "2026-11" }] }, semantics: { focus_ring_dp: 3, focus_clearance_dp: 4, authority: "read-only", target: "calendar-month" }, classification: "REVIEW_REQUIRED", differences: [] }] };
  return { directory, map, run };
}

if (process.argv[1]?.endsWith("compare-v12-calendar.mjs")) {
  const index = process.argv.indexOf("--fixture");
  if (index < 0 || process.argv[index + 1] === undefined) { process.stderr.write("--fixture is required\n"); process.exitCode = 1; }
  else {
    const input = fixtureInput(path.resolve(process.argv[index + 1]));
    try {
      const result = compareV12Calendar({ ...input, outputDirectory: path.join(input.directory, "comparison") });
      if (process.argv.includes("--verify")) validateV12CalendarComparison(result);
      process.stdout.write(`${JSON.stringify({ status: result.status, native_execution: result.native_execution, host_only: true })}\n`);
    } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
    finally { rmSync(input.directory, { recursive: true, force: true }); }
  }
}
