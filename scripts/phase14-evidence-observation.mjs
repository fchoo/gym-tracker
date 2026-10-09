import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { PNG } from "pngjs";

const require = createRequire(import.meta.url);
const PNGJS_VERSION = JSON.parse(
  readFileSync(require.resolve("pngjs/package.json"), "utf8"),
).version;
if (PNGJS_VERSION !== "7.0.0") {
  throw new Error("phase14_pngjs_version_invalid");
}

const HASH = /^[a-f0-9]{64}$/u;
const PASS = "PASS";
const FAIL = "FAIL";

export const phase14Sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

function normalizedTestPath(value) {
  return String(value ?? "").replace(/\\/gu, "/");
}

export function ingestPhase14JestReport(report, caseContracts) {
  if (
    report?.success !== true
    || !Number.isInteger(report.numTotalTests)
    || report.numTotalTests < 1
    || report.numPassedTests !== report.numTotalTests
    || report.numFailedTests !== 0
    || report.numPendingTests !== 0
    || report.numTodoTests !== 0
    || !Array.isArray(report.testResults)
    || report.testResults.length < 1
  ) {
    throw new Error("phase14_component_report_invalid");
  }

  const results = report.testResults.map((suite) => {
    const assertions = suite.assertionResults;
    if (
      suite?.status !== "passed"
      || !Array.isArray(assertions)
      || assertions.length < 1
      || assertions.some(({ status }) => status !== "passed")
    ) {
      throw new Error("phase14_component_report_invalid");
    }
    return Object.freeze({
      path: normalizedTestPath(suite.name),
      passed: assertions.length,
    });
  });
  const mappedFiles = new Set(caseContracts.flatMap(({ componentTests }) => componentTests));
  if (results.some((result) => ![...mappedFiles].some((testPath) =>
    result.path.endsWith(normalizedTestPath(testPath))))) {
    throw new Error("phase14_component_mapping_invalid");
  }

  const cases = caseContracts.map((contract) => {
    if (!Array.isArray(contract.componentTests) || contract.componentTests.length < 1) {
      throw new Error("phase14_component_mapping_invalid");
    }
    const mapped = results.filter((result) =>
      contract.componentTests.some((testPath) =>
        result.path.endsWith(normalizedTestPath(testPath))));
    if (mapped.length !== contract.componentTests.length) {
      throw new Error(`phase14_component_mapping_invalid:${contract.id}`);
    }
    return Object.freeze({
      id: contract.id,
      files: Object.freeze([...contract.componentTests]),
      passed: mapped.reduce((total, entry) => total + entry.passed, 0),
      failed: 0,
      skipped: 0,
      todo: 0,
      verdict: PASS,
    });
  });

  return Object.freeze({
    schema_version: 1,
    producer: "jest-json/v29",
    totals: Object.freeze({
      total: report.numTotalTests,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      skipped: report.numPendingTests,
      todo: report.numTodoTests,
    }),
    verdict: PASS,
    cases: Object.freeze(cases),
  });
}

export function validatePhase14FocusTrace(trace, expectedActionIds) {
  if (
    trace?.schema_version !== 3
    || trace.producer !== "phase14-adb-observer/v2"
    || trace.synthetic !== false
    || !Array.isArray(trace.observations)
    || trace.observations.length !== expectedActionIds.length
  ) {
    throw new Error(
      trace?.synthetic === true
        ? "phase14_focus_trace_synthetic"
        : "phase14_focus_trace_observation_invalid",
    );
  }
  let previousFinished = 0;
  for (const [index, observation] of trace.observations.entries()) {
    const started = Date.parse(observation.started_at);
    const finished = Date.parse(observation.finished_at);
    if (
      observation.order !== index
      || observation.action_id !== expectedActionIds[index]
      || typeof observation.input !== "string"
      || typeof observation.transport !== "string"
      || !observation.command
      || !Number.isFinite(started)
      || !Number.isFinite(finished)
      || finished < started
      || started < previousFinished
      || observation.verdict !== PASS
    ) {
      throw new Error("phase14_focus_trace_observation_invalid");
    }
    previousFinished = finished;
  }
  return true;
}

function validateRuntimeDigest(digest) {
  const keys = Object.keys(digest ?? {}).sort();
  if (
    JSON.stringify(keys) !== JSON.stringify([
      "authority",
      "contains_raw_rows",
      "digest_sha256",
      "producer",
      "proof_schema_version",
      "row_count",
      "schema_version",
      "table_count",
    ])
    || digest?.proof_schema_version !== 1
    || digest.producer !== "phase14-app-canonical-logical-source-digest/v1"
    || digest.authority !== "development-test-app-canonical-logical-sqlite-source"
    || !HASH.test(digest.digest_sha256 ?? "")
    || !Number.isInteger(digest.table_count)
    || digest.table_count < 1
    || !Number.isInteger(digest.row_count)
    || digest.row_count < 0
    || !Number.isInteger(digest.schema_version)
    || digest.schema_version < 1
    || digest.contains_raw_rows !== false
    || Object.hasOwn(digest, "source_tree_sha256")
    || Object.hasOwn(digest, "rows")
    || Object.hasOwn(digest, "sql")
  ) {
    throw new Error("phase14_runtime_state_invalid");
  }
}

export function validatePhase14RuntimeStatePair(pair) {
  validateRuntimeDigest(pair?.pre);
  validateRuntimeDigest(pair?.post);
  if (
    pair.pre.digest_sha256 !== pair.post.digest_sha256
    || pair.pre.table_count !== pair.post.table_count
    || pair.pre.row_count !== pair.post.row_count
    || pair.pre.schema_version !== pair.post.schema_version
  ) {
    throw new Error("phase14_runtime_state_changed");
  }
  return true;
}

function decodePng(bytes, label) {
  try {
    const decoded = PNG.sync.read(bytes);
    if (decoded.width < 1 || decoded.height < 1) throw new Error("empty");
    return decoded;
  } catch {
    throw new Error(`phase14_visual_${label}_invalid`);
  }
}

function pngOf(width, height) {
  return new PNG({ width, height });
}

export function comparePhase14PngBytes({ reference, native }) {
  const referenceImage = decodePng(reference, "reference");
  const nativeImage = decodePng(native, "native");
  if (
    referenceImage.width !== nativeImage.width
    || referenceImage.height !== nativeImage.height
  ) {
    throw new Error("phase14_visual_dimensions_mismatch");
  }

  const { width, height } = referenceImage;
  const overlay = pngOf(width, height);
  const difference = pngOf(width, height);
  const mask = pngOf(width, height);
  let changedPixels = 0;
  let absoluteDelta = 0;
  let maximumChannelDelta = 0;
  for (let offset = 0; offset < referenceImage.data.length; offset += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const left = referenceImage.data[offset + channel];
      const right = nativeImage.data[offset + channel];
      const delta = Math.abs(left - right);
      changed ||= delta !== 0;
      absoluteDelta += delta;
      maximumChannelDelta = Math.max(maximumChannelDelta, delta);
      overlay.data[offset + channel] = channel === 3
        ? 255
        : Math.round((left + right) / 2);
      difference.data[offset + channel] = channel === 3 ? 255 : delta;
      mask.data[offset + channel] = channel === 3 ? 255 : (changed ? 255 : 0);
    }
    if (changed) {
      changedPixels += 1;
      mask.data[offset] = 255;
      mask.data[offset + 1] = 255;
      mask.data[offset + 2] = 255;
    }
  }

  const bytes = Object.freeze({
    reference: Buffer.from(reference),
    native: Buffer.from(native),
    overlay: PNG.sync.write(overlay),
    difference: PNG.sync.write(difference),
    mask: PNG.sync.write(mask),
  });
  const hashes = Object.freeze(Object.fromEntries(
    Object.entries(bytes).map(([name, value]) => [`${name}_sha256`, phase14Sha256(value)]),
  ));
  const classification = changedPixels === 0 ? "MATCH" : "DIFFERENT";
  const artifacts = Object.freeze(Object.fromEntries(
    Object.keys(bytes).map((name) => [name, Object.freeze({
      path: `${name}.png`,
      sha256: hashes[`${name}_sha256`],
      media_type: "image/png",
    })]),
  ));
  const metrics = Object.freeze({
    width,
    height,
    total_pixels: width * height,
    changed_pixels: changedPixels,
    changed_ratio: changedPixels / (width * height),
    mean_absolute_channel_delta: absoluteDelta / (width * height * 4),
    maximum_channel_delta: maximumChannelDelta,
  });
  return Object.freeze({
    bytes,
    hashes,
    metrics,
    classification,
    record: Object.freeze({
      schema_version: 1,
      producer: "phase14-pngjs-comparator/v1",
      pngjs_version: PNGJS_VERSION,
      classification,
      artifacts,
      metrics,
    }),
  });
}

export function validatePhase14VisualComparison(record, readArtifact) {
  if (
    record?.schema_version !== 1
    || record.producer !== "phase14-pngjs-comparator/v1"
    || record.pngjs_version !== "7.0.0"
    || !["MATCH", "DIFFERENT"].includes(record.classification)
  ) {
    throw new Error("phase14_visual_comparison_invalid");
  }
  const artifactBytes = {};
  for (const name of ["reference", "native", "overlay", "difference", "mask"]) {
    const artifact = record.artifacts?.[name];
    if (
      artifact?.media_type !== "image/png"
      || typeof artifact.path !== "string"
      || !artifact.path.endsWith(".png")
      || !HASH.test(artifact.sha256 ?? "")
    ) {
      throw new Error("phase14_visual_artifact_invalid");
    }
    const bytes = readArtifact(name, artifact.path);
    decodePng(bytes, name);
    if (phase14Sha256(bytes) !== artifact.sha256) {
      throw new Error("phase14_visual_artifact_hash_invalid");
    }
    artifactBytes[name] = bytes;
  }
  const metrics = record.metrics;
  if (
    !Number.isInteger(metrics?.width)
    || metrics.width < 1
    || !Number.isInteger(metrics.height)
    || metrics.height < 1
    || metrics.total_pixels !== metrics.width * metrics.height
    || !Number.isInteger(metrics.changed_pixels)
    || metrics.changed_pixels < 0
    || metrics.changed_pixels > metrics.total_pixels
    || metrics.changed_ratio !== metrics.changed_pixels / metrics.total_pixels
    || !Number.isFinite(metrics.mean_absolute_channel_delta)
    || metrics.mean_absolute_channel_delta < 0
    || !Number.isInteger(metrics.maximum_channel_delta)
    || metrics.maximum_channel_delta < 0
    || metrics.maximum_channel_delta > 255
  ) {
    throw new Error("phase14_visual_metrics_invalid");
  }
  if (
    (metrics.changed_pixels === 0 && record.classification !== "MATCH")
    || (metrics.changed_pixels > 0 && record.classification === "MATCH")
  ) {
    throw new Error("phase14_visual_classification_invalid");
  }
  const recomputed = comparePhase14PngBytes({
    reference: artifactBytes.reference,
    native: artifactBytes.native,
  });
  if (
    record.classification !== recomputed.classification
    || JSON.stringify(record.metrics) !== JSON.stringify(recomputed.metrics)
    || !["overlay", "difference", "mask"].every((name) =>
      phase14Sha256(artifactBytes[name]) === recomputed.hashes[`${name}_sha256`])
  ) {
    throw new Error("phase14_visual_recomputation_invalid");
  }
  return true;
}

function parseHex(value, label) {
  if (!/^#[A-F0-9]{6}$/u.test(value ?? "")) {
    throw new Error(`phase14_dev02_${label}_invalid`);
  }
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function hexOf(values) {
  return `#${values.map((value) =>
    Math.round(value).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function relativeLuminance(values) {
  return values
    .map((value) => {
      const channel = value / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    })
    .reduce((total, channel, index) =>
      total + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

export function buildPhase14Dev02Evidence({
  titleHex,
  sportHex,
  surfaceHex,
  blendAlpha,
  sourceHashes,
}) {
  if (titleHex !== "#9B470B" || sportHex !== "#D97820") {
    throw new Error("phase14_dev02_token_invalid");
  }
  if (
    !Number.isFinite(blendAlpha)
    || blendAlpha !== 0.14
    || !HASH.test(sourceHashes?.theme_sha256 ?? "")
    || !HASH.test(sourceHashes?.prototype_sha256 ?? "")
    || !HASH.test(sourceHashes?.owner_record_sha256 ?? "")
  ) {
    throw new Error("phase14_dev02_measurement_invalid");
  }
  const title = parseHex(titleHex, "title");
  parseHex(sportHex, "sport");
  const surface = parseHex(surfaceHex, "surface");
  const fill = title.map((channel, index) =>
    Math.round(channel * blendAlpha + surface[index] * (1 - blendAlpha)));
  const titleLuminance = relativeLuminance(title);
  const fillLuminance = relativeLuminance(fill);
  const contrastRatio = (Math.max(titleLuminance, fillLuminance) + 0.05)
    / (Math.min(titleLuminance, fillLuminance) + 0.05);
  if (!Number.isFinite(contrastRatio) || contrastRatio < 4.5) {
    throw new Error("phase14_dev02_contrast_invalid");
  }
  return Object.freeze({
    schema_version: 1,
    producer: "phase14-dev02-numeric/v1",
    owner_record: "accessible-9b470b",
    title_hex: titleHex,
    sport_hex: sportHex,
    surface_hex: surfaceHex,
    blend_space: "srgb",
    blend_alpha: blendAlpha,
    blended_fill_hex: hexOf(fill),
    contrast_ratio: contrastRatio,
    required_ratio: 4.5,
    source_hashes: Object.freeze({ ...sourceHashes }),
    token_measurement_verdict: PASS,
    calendar_adoption: Object.freeze({
      verdict: "NOT_RUN",
      required_producer: "phase16-calendar-native-contrast/v1",
      rationale: "Phase 14 proves exact tokens and blend math; Calendar adoption is owned by Phase 16 native evidence.",
    }),
    verdict: "REVIEW_REQUIRED",
  });
}

export function validatePhase14Dev02Evidence(evidence) {
  const rebuilt = buildPhase14Dev02Evidence({
    titleHex: evidence?.title_hex,
    sportHex: evidence?.sport_hex,
    surfaceHex: evidence?.surface_hex,
    blendAlpha: evidence?.blend_alpha,
    sourceHashes: evidence?.source_hashes,
  });
  if (
    evidence.producer !== rebuilt.producer
    || evidence.blended_fill_hex !== rebuilt.blended_fill_hex
    || evidence.contrast_ratio !== rebuilt.contrast_ratio
    || evidence.token_measurement_verdict !== PASS
    || evidence.calendar_adoption?.verdict !== "NOT_RUN"
    || evidence.verdict !== "REVIEW_REQUIRED"
  ) {
    throw new Error("phase14_dev02_evidence_invalid");
  }
  return true;
}

export function derivePhase14NativeVerdict({
  maestro,
  actions,
  expectedActionCount = actions?.length ?? -1,
  checkpoints,
  runtimeState,
  theme,
}) {
  const passed = maestro?.verdict === PASS
    && Array.isArray(actions)
    && actions.length === expectedActionCount
    && actions.every((action) => action?.verdict === PASS || action?.postcondition?.verdict === PASS)
    && Array.isArray(checkpoints)
    && checkpoints.length > 0
    && checkpoints.every(({ verdict }) => verdict === PASS)
    && [PASS, "N_A_REVIEWED"].includes(runtimeState?.verdict)
    && theme?.verdict === PASS;
  return passed ? PASS : FAIL;
}
