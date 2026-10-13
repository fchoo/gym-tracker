import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SHA256 = /^[a-f0-9]{64}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

function fail(code) {
  throw new Error(`v12_visual_compare_${code}`);
}

function validHash(value) {
  return typeof value === "string" && SHA256.test(value);
}

function validateException(exception, configurationId) {
  if (!exception || typeof exception !== "object" || typeof exception.deviation_id !== "string"
    || exception.deviation_id.length < 3 || typeof exception.owner_decision !== "string"
    || exception.owner_decision.length < 3 || !DATE.test(exception.decided_at)
    || !Array.isArray(exception.configurations) || exception.configurations.length === 0
    || !exception.configurations.includes(configurationId) || typeof exception.rationale !== "string"
    || exception.rationale.length < 12 || !Array.isArray(exception.evidence_hashes)
    || exception.evidence_hashes.length === 0 || exception.evidence_hashes.some((entry) => !validHash(entry))) {
    fail("exception_scope_invalid");
  }
}

function validateInput(input) {
  if (!input || typeof input.id !== "string" || !/^BW-\d{3}$/u.test(input.id)
    || typeof input.configuration_id !== "string" || !input.identity?.fixture
    || !input.identity?.clock || !input.identity?.locale || !input.identity?.timezone
    || !Number.isFinite(input.identity?.content_bounds?.width) || !Number.isFinite(input.identity?.content_bounds?.height)) fail("identity_invalid");
  if (!input.artifacts || Object.values(input.artifacts).some((value) => !validHash(value))) fail("artifact_hash_invalid");
  if (!input.semantic || !Array.isArray(input.semantic.targets) || !input.visual) fail("input_invalid");
}

function semanticPass(semantic) {
  return ["content", "actions", "copy", "state", "route", "focus", "order", "non_color_state", "commit_read_only"].every((key) => semantic[key] === true)
    && semantic.targets.length > 0
    && semantic.targets.every((target) => Number.isFinite(target.width_dp) && Number.isFinite(target.height_dp)
      && target.width_dp >= 48 && target.height_dp >= 48 && target.overlap === false);
}

function visualPass(visual) {
  return Number.isFinite(visual.geometry_dp) && visual.geometry_dp <= 1
    && Number.isFinite(visual.baseline_icon_dp) && visual.baseline_icon_dp <= 2
    && visual.token_exact === true && Number.isFinite(visual.ciede2000) && visual.ciede2000 <= 2;
}

/** Decode only the retained PNG bytes; callers never rescale or stretch images. */
export function decodeV12ComparisonPng(bytes) {
  const { PNG } = require("pngjs");
  const image = PNG.sync.read(bytes);
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1) fail("png_invalid");
  return Object.freeze({ width: image.width, height: image.height, data: image.data });
}

export function compareV12Capture(input) {
  validateInput(input);
  const semanticPassed = semanticPass(input.semantic);
  const measuredPassed = visualPass(input.visual);
  const pixelPercent = input.visual.pixel_percent;
  if (!Number.isFinite(pixelPercent) || pixelPercent < 0 || pixelPercent > 100) fail("pixel_percent_invalid");
  let verdict = "FAIL";
  if (semanticPassed && measuredPassed && pixelPercent <= 0.5) verdict = "PASS";
  else if (semanticPassed && measuredPassed && pixelPercent <= 2) verdict = "REVIEW_REQUIRED";
  else if (semanticPassed && input.semantic.accepted_deviation !== null && input.semantic.accepted_deviation !== undefined) {
    validateException(input.semantic.accepted_deviation, input.configuration_id);
    verdict = "ACCEPTED_EXCEPTION";
  }
  return Object.freeze({
    schema_version: 1,
    id: input.id,
    configuration_id: input.configuration_id,
    verdict,
    counts_as_pass: verdict === "PASS",
    semantic_passed: semanticPassed,
    measured_passed: measuredPassed,
    pixel_percent: pixelPercent,
    artifacts: Object.freeze({ ...input.artifacts }),
    ...(verdict === "ACCEPTED_EXCEPTION" ? { accepted_deviation: Object.freeze({ ...input.semantic.accepted_deviation }) } : {}),
  });
}

export function validateV12ComparisonShard(shard) {
  if (!shard || shard.schema_version !== 1 || !Array.isArray(shard.results) || shard.results.length === 0) fail("shard_invalid");
  const ids = new Set();
  for (const result of shard.results) {
    if (!result || result.schema_version !== 1 || typeof result.id !== "string" || typeof result.configuration_id !== "string"
      || !["PASS", "FAIL", "REVIEW_REQUIRED", "ACCEPTED_EXCEPTION"].includes(result.verdict)
      || result.counts_as_pass !== (result.verdict === "PASS") || typeof result.semantic_passed !== "boolean"
      || typeof result.measured_passed !== "boolean" || !Number.isFinite(result.pixel_percent)
      || !result.artifacts || Object.values(result.artifacts).some((value) => !validHash(value))
      || ids.has(`${result.id}\u0000${result.configuration_id}`)) fail("result_invalid");
    if (result.verdict === "PASS" && (!result.semantic_passed || !result.measured_passed || result.pixel_percent > 0.5)) fail("result_invalid");
    if (result.verdict === "ACCEPTED_EXCEPTION") validateException(result.accepted_deviation, result.configuration_id);
    ids.add(`${result.id}\u0000${result.configuration_id}`);
  }
  return true;
}
