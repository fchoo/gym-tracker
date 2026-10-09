import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/u;
const REVIEW_CLASSIFICATIONS = Object.freeze([
  "antialias_only",
  "platform_chrome_masked",
  "native_metric_within_tolerance",
  "product_mismatch",
  "accepted_deviation",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

function comparisonHashes(cell) {
  const artifacts = cell.visual_comparison?.artifacts;
  if (artifacts === undefined) return Object.freeze({ semantic_sha256: cell.semantic_tree_sha256 });
  return Object.freeze({
    reference_sha256: artifacts.reference?.sha256,
    native_sha256: artifacts.native?.sha256,
    overlay_sha256: artifacts.overlay?.sha256,
    difference_sha256: artifacts.difference?.sha256,
    mask_sha256: artifacts.mask?.sha256,
    semantic_sha256: cell.semantic_tree_sha256,
  });
}

function captureEntry(cell) {
  return Object.freeze({
    cell_id: cell.id,
    case_id: cell.case_id,
    configuration_id: cell.configuration_id,
    capture_state: cell.state?.captureState,
    behavior: cell.behavior,
    capture_requirements: cell.capture_requirements,
    rendered_theme: cell.theme_observation?.rendered_theme,
    screenshot_sha256: cell.screenshot_sha256,
    maestro_report_sha256: cell.report_sha256,
    semantic_sha256: cell.semantic_tree_sha256,
    focus_trace_sha256: cell.focus_key_trace_sha256,
    runtime_state_sha256: cell.runtime_state?.sha256 ?? null,
    hashes: comparisonHashes(cell),
    comparison: cell.visual_comparison?.artifacts === undefined
      ? null
      : Object.freeze({
          raw_classification: cell.visual_comparison.classification,
          record_sha256: cell.visual_comparison.record_sha256,
          metrics: cell.visual_comparison.metrics,
        }),
  });
}

export function phase14CellCaptureIdentitySha256(cell) {
  return sha256(canonicalJson(captureEntry(cell)));
}

function capturePayload(evidence) {
  return Object.freeze({
    identity: Object.freeze({
      source_tree_sha256: evidence.source_tree_sha256,
      base_head: evidence.base_head,
      build_manifest: evidence.build_manifest,
      package: evidence.package,
      profile: evidence.profile,
      device_identity_sha256: evidence.device_identity_sha256,
      apk_sha256: evidence.apk?.sha256,
      installed_apk_sha256: evidence.apk?.installed_sha256,
      component_report_sha256: evidence.component_evidence?.report_sha256,
    }),
    captured_started_at: evidence.captured_started_at,
    captured_finished_at: evidence.captured_finished_at,
    entries: Object.freeze([...evidence.matrix_cells].map(captureEntry).sort((left, right) => left.cell_id.localeCompare(right.cell_id))),
  });
}

export function buildPhase14CaptureIndex(evidence) {
  const payload = capturePayload(evidence);
  return Object.freeze({
    schema_version: 1,
    producer: "phase14-capture-index/v1",
    ...payload,
    capture_set_sha256: sha256(canonicalJson(payload)),
  });
}

export function captureIdentitySha256(evidence) {
  return buildPhase14CaptureIndex(evidence).capture_set_sha256;
}

export function validatePhase14CaptureIndex(index, evidence) {
  const rebuilt = buildPhase14CaptureIndex(evidence);
  if (canonicalJson(index) !== canonicalJson(rebuilt)) throw new Error("phase14_capture_index_stale");
  return true;
}

export function resolvePhase14VisualReference(cell, observedTheme) {
  const policy = cell.referencePolicy;
  if (policy.kind === "native-only") {
    return Object.freeze({ kind: "native-only", verdict: "N_A_REVIEWED", rationale: policy.rationale });
  }
  const exact = policy.exactConfiguration;
  const reference = policy.filesByRenderedTheme?.[observedTheme.rendered_theme];
  if (
    cell.viewport.width !== exact.width
    || cell.viewport.height !== exact.height
    || cell.orientation !== exact.orientation
    || cell.fontScale !== exact.fontScale
    || cell.state.captureState !== policy.captureState
    || reference === undefined
  ) {
    return Object.freeze({
      kind: "not-exact",
      verdict: "NOT_RUN",
      rationale: "No authoritative reference exists for this exact state and rendered configuration.",
    });
  }
  return Object.freeze({ kind: "comparable", theme: observedTheme.rendered_theme, reference });
}

function reviewedEntries(index) {
  return index.entries.filter(({ comparison }) => comparison?.raw_classification === "DIFFERENT");
}

export function createPhase14VisualAttestation({ index, reviewer, reviewedAt, decisions }) {
  const expected = reviewedEntries(index);
  if (
    !Array.isArray(decisions)
    || decisions.length !== expected.length
    || new Set(decisions.map(({ cell_id: id }) => id)).size !== expected.length
  ) throw new Error("phase14_visual_review_decisions_invalid");
  const attestation = {
    schema_version: 1,
    producer: "phase14-independent-visual-review/v1",
    capture_set_sha256: index.capture_set_sha256,
    reviewed_at: reviewedAt,
    reviewer,
    comparisons: expected.map((entry) => {
      const decision = decisions.find(({ cell_id: id }) => id === entry.cell_id);
      if (decision === undefined) throw new Error("phase14_visual_review_decisions_invalid");
      return {
        cell_id: entry.cell_id,
        hashes: entry.hashes,
        classification: decision.classification,
        rationale: decision.rationale,
        semantic_zero_tolerance: {
          verdict: decision.semantic_verdict,
          semantic_sha256: entry.hashes.semantic_sha256,
        },
      };
    }),
  };
  validatePhase14VisualAttestation(attestation, index);
  return Object.freeze(attestation);
}

export function validatePhase14VisualAttestation(attestation, index) {
  if (
    attestation?.schema_version !== 1
    || attestation.producer !== "phase14-independent-visual-review/v1"
    || attestation.capture_set_sha256 !== index.capture_set_sha256
  ) throw new Error("phase14_visual_attestation_capture_invalid");
  if (
    typeof attestation.reviewer?.identity !== "string"
    || attestation.reviewer.identity.trim().length < 3
    || !HASH.test(attestation.reviewer?.fingerprint ?? "")
    || attestation.reviewer.independence_attested !== true
  ) throw new Error("phase14_visual_reviewer_invalid");
  const reviewedAt = Date.parse(attestation.reviewed_at);
  if (!Number.isFinite(reviewedAt) || reviewedAt <= Date.parse(index.captured_finished_at)) {
    throw new Error("phase14_visual_attestation_time_invalid");
  }
  const expected = reviewedEntries(index);
  if (
    !Array.isArray(attestation.comparisons)
    || attestation.comparisons.length !== expected.length
    || new Set(attestation.comparisons.map(({ cell_id: id }) => id)).size !== expected.length
  ) throw new Error("phase14_visual_attestation_mapping_invalid");
  for (const entry of expected) {
    const review = attestation.comparisons.find(({ cell_id: id }) => id === entry.cell_id);
    if (
      review === undefined
      || !REVIEW_CLASSIFICATIONS.includes(review.classification)
      || canonicalJson(review.hashes) !== canonicalJson(entry.hashes)
      || typeof review.rationale !== "string"
      || review.rationale.trim().length < 20
    ) throw new Error("phase14_visual_attestation_mapping_invalid");
    if (
      review.semantic_zero_tolerance?.verdict !== "PASS"
      || review.semantic_zero_tolerance.semantic_sha256 !== entry.hashes.semantic_sha256
    ) throw new Error("phase14_visual_semantic_gate_invalid");
    if (review.classification === "native_metric_within_tolerance") {
      const metrics = entry.comparison.metrics;
      if (
        !Number.isFinite(metrics?.mean_absolute_channel_delta)
        || metrics.mean_absolute_channel_delta > 1
        || !Number.isInteger(metrics.maximum_channel_delta)
        || metrics.maximum_channel_delta > 16
      ) throw new Error("phase14_visual_metric_tolerance_invalid");
    }
  }
  return true;
}

export function derivePhase14RowVerdict({ componentVerdict, nativeVerdict, visualVerdicts, comparableRequired }) {
  if (componentVerdict !== "PASS" || nativeVerdict !== "PASS" || visualVerdicts.includes("FAIL")) {
    return Object.freeze({ visual_verdict: visualVerdicts.includes("FAIL") ? "FAIL" : "N_A_REVIEWED", verdict: "FAIL" });
  }
  if (visualVerdicts.includes("REVIEW_REQUIRED")) {
    return Object.freeze({ visual_verdict: "REVIEW_REQUIRED", verdict: "REVIEW_REQUIRED" });
  }
  if (visualVerdicts.includes("ACCEPTED_EXCEPTION")) {
    return Object.freeze({ visual_verdict: "ACCEPTED_EXCEPTION", verdict: "ACCEPTED_EXCEPTION" });
  }
  if (comparableRequired > 0) {
    const passed = visualVerdicts.filter((verdict) => verdict === "PASS").length;
    if (passed < comparableRequired) return Object.freeze({ visual_verdict: "REVIEW_REQUIRED", verdict: "REVIEW_REQUIRED" });
    return Object.freeze({ visual_verdict: "PASS", verdict: "PASS" });
  }
  return Object.freeze({ visual_verdict: "N_A_REVIEWED", verdict: "PASS" });
}

function classificationVerdict(classification) {
  if (["antialias_only", "platform_chrome_masked", "native_metric_within_tolerance"].includes(classification)) return "PASS";
  if (classification === "product_mismatch") return "FAIL";
  if (classification === "accepted_deviation") return "ACCEPTED_EXCEPTION";
  throw new Error("phase14_visual_classification_invalid");
}

function overallVerdict(rows) {
  if (rows.some(({ verdict }) => verdict === "FAIL")) return "FAIL";
  if (rows.some(({ verdict }) => verdict === "REVIEW_REQUIRED")) return "REVIEW_REQUIRED";
  if (rows.some(({ verdict }) => verdict === "ACCEPTED_EXCEPTION")) return "ACCEPTED_EXCEPTION";
  return "PASS";
}

export function applyPhase14VisualAttestation(evidence, index, attestation) {
  validatePhase14CaptureIndex(index, evidence);
  validatePhase14VisualAttestation(attestation, index);
  const beforeIdentity = captureIdentitySha256(evidence);
  const finalized = structuredClone(evidence);
  const reviews = new Map(attestation.comparisons.map((entry) => [entry.cell_id, entry]));
  for (const cell of finalized.matrix_cells) {
    const review = reviews.get(cell.id);
    if (review !== undefined) {
      cell.visual_comparison.verdict = classificationVerdict(review.classification);
      cell.visual_comparison.review = {
        classification: review.classification,
        reviewer_fingerprint: attestation.reviewer.fingerprint,
        semantic_zero_tolerance: review.semantic_zero_tolerance,
      };
    }
  }
  const cellsById = new Map(finalized.matrix_cells.map((cell) => [cell.id, cell]));
  for (const row of finalized.evidence) {
    row.matrix_cells = row.matrix_cells.map((cell) => cellsById.get(cell.id));
    const visualVerdicts = row.matrix_cells.map(({ visual_comparison: comparison }) => comparison.verdict);
    const comparableRequired = row.matrix_cells.filter(({ visual_comparison: comparison }) => comparison.artifacts !== undefined).length;
    const derived = derivePhase14RowVerdict({
      componentVerdict: row.component_verdict,
      nativeVerdict: row.native_verdict,
      visualVerdicts,
      comparableRequired,
    });
    row.visual_verdict = derived.visual_verdict;
    row.verdict = derived.verdict;
  }
  finalized.schema_version = 4;
  finalized.producer = "phase14-native-evidence-finalized/v1";
  finalized.verdict = overallVerdict(finalized.evidence);
  finalized.capture_index = {
    ...finalized.capture_index,
    capture_set_sha256: index.capture_set_sha256,
    producer: index.producer,
  };
  finalized.finalization = {
    mode: "finalize-existing",
    capture_set_sha256: index.capture_set_sha256,
    attestation_sha256: sha256(canonicalJson(attestation)),
    reviewer: attestation.reviewer,
    reviewed_at: attestation.reviewed_at,
  };
  if (captureIdentitySha256(finalized) !== beforeIdentity) throw new Error("phase14_finalize_capture_identity_changed");
  return Object.freeze(finalized);
}
