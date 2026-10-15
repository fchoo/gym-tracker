import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createV12NativeAdapter } from "./v12-native-adapter.mjs";
import { publishV12AtomicShard } from "./v12-atomic-shard-publication.mjs";

const require = createRequire(import.meta.url);
const SHA256 = /^[a-f0-9]{64}$/u;
const V12_RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const REQUIRED_OBSERVATION = ["content", "actions", "copy", "state", "route", "focus", "order", "non_color_state", "commit_read_only"];
function fail(code) { throw new Error(`v12_visual_compare_${code}`); }
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function safeRelative(value) {
  if (typeof value !== "string" || value.length < 1 || path.isAbsolute(value) || value.includes("\\") || path.posix.normalize(value) !== value || value.split("/").some((part) => !part || part === "." || part === "..")) fail("path_invalid");
  return value;
}
function safeFile(root, relative) {
  safeRelative(relative); const resolvedRoot = path.resolve(root); const resolved = path.resolve(resolvedRoot, relative);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) fail("path_invalid");
  let cursor = resolvedRoot;
  for (const part of relative.split("/")) { cursor = path.join(cursor, part); const stat = lstatSync(cursor, { throwIfNoEntry: false }); if (!stat || stat.isSymbolicLink()) fail("path_invalid"); }
  if (!lstatSync(resolved).isFile()) fail("path_invalid"); return resolved;
}
export function decodeV12ComparisonPng(bytes) {
  let image; try { image = require("pngjs").PNG.sync.read(bytes); } catch { fail("png_invalid"); }
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1) fail("png_invalid");
  return Object.freeze({ width: image.width, height: image.height, data: image.data });
}
function pngDescriptor(relative, bytes) { const image = decodeV12ComparisonPng(bytes); return Object.freeze({ path: relative, sha256: sha256(bytes), size_bytes: bytes.length, width: image.width, height: image.height }); }
function readPng(root, descriptor, { expectedPath } = {}) {
  if (!descriptor || typeof descriptor !== "object" || !SHA256.test(descriptor.sha256 ?? "") || !Number.isSafeInteger(descriptor.size_bytes) || descriptor.size_bytes < 1 || !Number.isSafeInteger(descriptor.width) || descriptor.width < 1 || !Number.isSafeInteger(descriptor.height) || descriptor.height < 1 || (expectedPath !== undefined && descriptor.path !== expectedPath)) fail("artifact_invalid");
  const bytes = readFileSync(safeFile(root, descriptor.path)); const actual = pngDescriptor(descriptor.path, bytes);
  if (JSON.stringify(actual) !== JSON.stringify(descriptor)) fail("artifact_invalid"); return Object.freeze({ bytes, image: decodeV12ComparisonPng(bytes), descriptor: actual });
}
function capture(root, runId, id, configurationId) {
  const relative = `artifacts/native/v1.2/${runId}/screenshots/${id}/${configurationId}/capture.json`;
  let record; try { record = JSON.parse(readFileSync(safeFile(root, relative), "utf8")); } catch { fail("capture_invalid"); }
  if (record?.schema_version !== 2 || record.producer !== "v12-visual-capture/v2" || record.run_id !== runId || record.state_id !== id || record.configuration_id !== configurationId || record.fixture_id !== "v12-synthetic-fixtures-r18" || record.native_execution !== "EXECUTED" || record.settings?.restored !== true || record.settings?.privacy !== "synthetic-only") fail("capture_invalid");
  const expectedPath = `artifacts/native/v1.2/${runId}/screenshots/${id}/${configurationId}/native.png`;
  return Object.freeze({ record_path: relative, record, native: readPng(root, record.native_png, { expectedPath }) });
}
function validateObservation(value, id, configurationId) {
  if (!value || value.native_execution !== "EXECUTED" || value.state_id !== id || value.configuration_id !== configurationId || !Array.isArray(value.targets) || value.targets.length === 0 || REQUIRED_OBSERVATION.some((key) => value[key] !== true) || value.targets.some((target) => !Number.isFinite(target?.width_dp) || target.width_dp < 48 || !Number.isFinite(target?.height_dp) || target.height_dp < 48 || target.overlap !== false) || !Number.isFinite(value.geometry_dp) || !Number.isFinite(value.baseline_icon_dp) || value.token_exact !== true || !Number.isFinite(value.ciede2000)) fail("observation_invalid");
  return Object.freeze({ semantic_passed: true, measured_passed: value.geometry_dp <= 1 && value.baseline_icon_dp <= 2 && value.ciede2000 <= 2, observation: structuredClone(value) });
}
function derive(reference, native) {
  if (reference.width !== native.width || reference.height !== native.height) fail("dimensions_invalid");
  const { PNG } = require("pngjs"); const overlay = new PNG({ width: reference.width, height: reference.height }); const difference = new PNG({ width: reference.width, height: reference.height }); const mask = new PNG({ width: reference.width, height: reference.height });
  let changedPixels = 0; let delta = 0;
  for (let offset = 0; offset < reference.data.length; offset += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel += 1) { const d = Math.abs(reference.data[offset + channel] - native.data[offset + channel]); changed ||= d !== 0; delta += d; overlay.data[offset + channel] = channel === 3 ? 254 : Math.round((reference.data[offset + channel] + native.data[offset + channel]) / 2); difference.data[offset + channel] = channel === 3 ? 255 : d; mask.data[offset + channel] = channel === 3 ? 255 : (changed ? 255 : 0); }
    if (changed) changedPixels += 1;
  }
  const totalPixels = reference.width * reference.height;
  return Object.freeze({ bytes: Object.freeze({ overlay: PNG.sync.write(overlay), difference: PNG.sync.write(difference), mask: PNG.sync.write(mask) }), metrics: Object.freeze({ width: reference.width, height: reference.height, total_pixels: totalPixels, changed_pixels: changedPixels, pixel_percent: changedPixels / totalPixels * 100, mean_absolute_channel_delta: delta / (totalPixels * 4) }) });
}
function writeExclusive(root, relative, bytes, write) { safeRelative(relative); if (write) return write(relative, bytes); const target = path.resolve(root, relative); if (!target.startsWith(`${path.resolve(root)}${path.sep}`) || existsSync(target)) fail("immutable_output_invalid"); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, bytes, { flag: "wx" }); }
function classFor({ semantic_passed: semanticPassed, measured_passed: measuredPassed }, metrics) { if (!semanticPassed || !measuredPassed || metrics.pixel_percent > 2) return "FAIL"; return metrics.pixel_percent <= 0.5 ? "PASS" : "REVIEW_REQUIRED"; }

/** Produces a comparison solely from a retained capture, approved reference bytes, and an executed instrumented observation. */
export function produceV12ComparisonRecord({ runId, root = process.cwd(), input, write } = {}) {
  if (!V12_RUN_ID.test(runId ?? "") || !input || !/^BW-\d{3}$/u.test(input.id ?? "") || typeof input.configuration_id !== "string") fail("input_invalid");
  const referenceSource = input.reference_path?.startsWith(".planning/design/v1.2-browser-evidence/")
    ? Object.freeze({ path: input.reference_path, bytes: readFileSync(safeFile(root, input.reference_path)) })
    : typeof input.approved_reference_png_base64 === "string" && /^[A-Za-z0-9+/]+={0,2}$/u.test(input.approved_reference_png_base64)
      ? Object.freeze({ path: "adapter-approved-reference", bytes: Buffer.from(input.approved_reference_png_base64, "base64") }) : fail("input_invalid");
  const nativeCapture = capture(root, runId, input.id, input.configuration_id); const observation = validateObservation(input.observation, input.id, input.configuration_id); const compared = derive(decodeV12ComparisonPng(referenceSource.bytes), nativeCapture.native.image);
  const base = `artifacts/native/v1.2/${runId}/comparison/${input.id}/${input.configuration_id}`;
  const referencePath = `${base}/reference.png`; writeExclusive(root, referencePath, referenceSource.bytes, write);
  const artifacts = { reference: pngDescriptor(referencePath, referenceSource.bytes), native: nativeCapture.native.descriptor };
  for (const [kind, bytes] of Object.entries(compared.bytes)) { const relative = `${base}/${kind}.png`; writeExclusive(root, relative, bytes, write); artifacts[kind] = pngDescriptor(relative, bytes); }
  const observationBytes = Buffer.from(`${JSON.stringify(observation.observation)}\n`); const observationPath = `${base}/instrumented-observation.json`; writeExclusive(root, observationPath, observationBytes, write);
  return Object.freeze({ schema_version: 2, id: input.id, configuration_id: input.configuration_id, classification: classFor(observation, compared.metrics), counts_as_pass: classFor(observation, compared.metrics) === "PASS", semantic_passed: observation.semantic_passed, measured_passed: observation.measured_passed, capture_record_path: nativeCapture.record_path, approved_reference_source: referenceSource.path, observation: Object.freeze({ path: observationPath, sha256: sha256(observationBytes), size_bytes: observationBytes.length }), artifacts: Object.freeze(artifacts), metrics: compared.metrics });
}
export function verifyV12ComparisonRecord({ runId, root = process.cwd(), result } = {}) {
  if (!V12_RUN_ID.test(runId ?? "") || !result || result.schema_version !== 2 || !/^BW-\d{3}$/u.test(result.id ?? "") || typeof result.configuration_id !== "string" || typeof result.approved_reference_source !== "string" || !["PASS", "FAIL", "REVIEW_REQUIRED"].includes(result.classification) || result.counts_as_pass !== (result.classification === "PASS")) fail("result_invalid");
  const nativeCapture = capture(root, runId, result.id, result.configuration_id); if (result.capture_record_path !== nativeCapture.record_path || JSON.stringify(result.artifacts?.native) !== JSON.stringify(nativeCapture.native.descriptor)) fail("capture_invalid");
  const observationBytes = readFileSync(safeFile(root, result.observation?.path)); if (sha256(observationBytes) !== result.observation.sha256 || observationBytes.length !== result.observation.size_bytes) fail("observation_invalid"); let observation; try { observation = JSON.parse(observationBytes); } catch { fail("observation_invalid"); } const checkedObservation = validateObservation(observation, result.id, result.configuration_id);
  const reference = readPng(root, result.artifacts?.reference); const native = readPng(root, result.artifacts?.native); const generated = derive(reference.image, native.image); const expectedArtifacts = { overlay: generated.bytes.overlay, difference: generated.bytes.difference, mask: generated.bytes.mask };
  if (result.approved_reference_source.startsWith(".planning/design/v1.2-browser-evidence/")) { const approved = readFileSync(safeFile(root, result.approved_reference_source)); if (approved.compare(reference.bytes) !== 0) fail("artifact_invalid"); }
  const contents = new Set([reference.descriptor.sha256, native.descriptor.sha256]);
  for (const [kind, bytes] of Object.entries(expectedArtifacts)) { const artifact = readPng(root, result.artifacts?.[kind]); if (artifact.descriptor.sha256 !== sha256(bytes) || artifact.bytes.compare(bytes) !== 0 || contents.has(artifact.descriptor.sha256)) fail("artifact_invalid"); contents.add(artifact.descriptor.sha256); }
  if (JSON.stringify(result.metrics) !== JSON.stringify(generated.metrics) || result.semantic_passed !== checkedObservation.semantic_passed || result.measured_passed !== checkedObservation.measured_passed || result.classification !== classFor(checkedObservation, generated.metrics)) fail("metrics_invalid"); return true;
}
export function validateV12ComparisonShard(shard, { root = process.cwd(), runId } = {}) { if (!shard || shard.schema_version !== 2 || !Array.isArray(shard.results) || shard.results.length === 0) fail("shard_invalid"); const seen = new Set(); for (const result of shard.results) { const key = `${result?.id}\u0000${result?.configuration_id}`; if (seen.has(key)) fail("duplicate_invalid"); verifyV12ComparisonRecord({ runId, root, result }); seen.add(key); } return true; }
function parseCli(args) { if (!Array.isArray(args) || args.length !== 3 || args[0] !== "--run" || !V12_RUN_ID.test(args[1] ?? "") || !["--all", "--verify"].includes(args[2])) fail("arguments_invalid"); return { runId: args[1], command: args[2] }; }
export function executeV12VisualComparison({ runId, root = process.cwd(), comparisons, write } = {}) { if (!V12_RUN_ID.test(runId ?? "") || !Array.isArray(comparisons) || comparisons.length !== 107 * 64) fail("input_invalid"); const results = comparisons.map((input) => produceV12ComparisonRecord({ runId, root, input, write })); const index = Object.freeze({ schema_version: 2, producer: "v12-visual-comparison-index/v2", run_id: runId, results: Object.freeze(results) }); writeExclusive(root, `artifacts/native/v1.2/${runId}/comparison/index.json`, Buffer.from(`${JSON.stringify(index)}\n`), write); return index; }
export function verifyV12VisualComparison({ runId, root = process.cwd(), readJson } = {}) { if (!V12_RUN_ID.test(runId ?? "")) fail("arguments_invalid"); const index = readJson ? readJson(`artifacts/native/v1.2/${runId}/comparison/index.json`) : JSON.parse(readFileSync(safeFile(root, `artifacts/native/v1.2/${runId}/comparison/index.json`), "utf8")); if (!index || index.schema_version !== 2 || index.producer !== "v12-visual-comparison-index/v2" || index.run_id !== runId || !Array.isArray(index.results) || index.results.length !== 107 * 64) fail("index_invalid"); return validateV12ComparisonShard(index, { runId, root }); }
export function runV12VisualComparisonCli(args = process.argv.slice(2), io = process) { try { const { runId, command } = parseCli(args); if (command === "--verify") verifyV12VisualComparison({ runId }); else publishV12AtomicShard({ runId, shard: "comparison", produce: ({ write }) => executeV12VisualComparison({ runId, comparisons: createV12NativeAdapter().compare({ run_id: runId }), write: (file, value) => write(file.replace(`artifacts/native/v1.2/${runId}/`, ""), value) }) }); io.stdout.write(`${JSON.stringify({ run_id: runId, command, ok: true })}\n`); return 0; } catch (error) { io.stderr.write(`${error.message}\n`); return 1; } }
if (process.argv[1]?.endsWith("compare-v12-visual.mjs")) process.exitCode = runV12VisualComparisonCli();
