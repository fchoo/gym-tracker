import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PHASE14_SHELL_EVIDENCE_CASES } from "../src/testing/contracts/phase14Shell.contract.ts";
import {
  evaluatePhase14SemanticPredicate,
  parsePhase14SemanticSnapshot,
  validatePhase14ActionObservation,
} from "./phase14-action-observation.mjs";
import { validatePhase14CellCheckpoint } from "./phase14-cell-checkpoint.mjs";
import {
  derivePhase14NativeVerdict,
  ingestPhase14JestReport,
  validatePhase14Dev02Evidence,
  validatePhase14FocusTrace,
  validatePhase14RuntimeStatePair,
  validatePhase14VisualComparison,
} from "./phase14-evidence-observation.mjs";
import {
  PHASE14_NATIVE_MATRIX,
  phase14BehaviorCoverageForCells,
  phase14MatrixCellsForIds,
  validatePhase14NativeMatrix,
} from "./phase14-native-matrix.mjs";
import {
  canonicalJson,
  derivePhase14RowVerdict,
  phase14CellCaptureIdentitySha256,
  resolvePhase14VisualReference,
  validatePhase14CaptureIndex,
  validatePhase14VisualAttestation,
} from "./phase14-visual-review.mjs";
import { resolvePhase14DeviceSerial, validatePhase14Manifest } from "./run-phase14-maestro.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const ROOT = process.cwd();
const ARTIFACT_ROOT = "artifacts/native/phase14/";
const HASH = /^[a-f0-9]{64}$/u;
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const expectedIds = PHASE14_SHELL_EVIDENCE_CASES.map(({ id }) => id);
const caseById = Object.freeze(Object.fromEntries(PHASE14_SHELL_EVIDENCE_CASES.map((entry) => [entry.id, entry])));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const DEVICE_IDENTITY_PROPERTIES = Object.freeze([
  "ro.build.fingerprint", "ro.product.cpu.abi", "ro.product.model", "ro.build.version.sdk", "ro.build.version.release",
]);

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeArtifact(relativePath, prefix, suffix, code) {
  if (typeof relativePath !== "string" || relativePath.length === 0) throw new Error(code);
  const normalized = path.posix.normalize(relativePath.replace(/\\/gu, "/"));
  if (
    path.posix.isAbsolute(normalized)
    || normalized.startsWith("../")
    || normalized.includes("/../")
    || !normalized.startsWith(prefix)
    || !normalized.endsWith(suffix)
  ) {
    throw new Error(code);
  }
  return normalized;
}

function defaultArtifactReader(relativePath) {
  return readFileSync(path.join(ROOT, relativePath));
}

function artifactBytes(relativePath, expectedSha256, options, readArtifact) {
  const normalized = normalizeArtifact(relativePath, options.prefix, options.suffix, options.pathCode);
  let bytes;
  try {
    const value = readArtifact(normalized);
    bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  } catch {
    throw new Error(options.missingCode);
  }
  if (!HASH.test(expectedSha256 ?? "") || sha256(bytes) !== expectedSha256) throw new Error(options.hashCode);
  if (options.png && !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new Error(options.contentCode);
  return Object.freeze({ path: normalized, sha256: expectedSha256, bytes });
}

function passingJunit(bytes) {
  const text = bytes.toString("utf8");
  const summary = {
    tests: Number(text.match(/\btests="(\d+)"/u)?.[1] ?? 0),
    failures: Number(text.match(/\bfailures="(\d+)"/u)?.[1] ?? 0),
    errors: Number(text.match(/\berrors="(\d+)"/u)?.[1] ?? 0),
    skipped: Number(text.match(/\bskipped="(\d+)"/u)?.[1] ?? 0),
  };
  if (summary.tests < 1 || summary.failures !== 0 || summary.errors !== 0 || summary.skipped !== 0) {
    throw new Error("phase14_report_content_invalid");
  }
  return Object.freeze({ ...summary, verdict: "PASS" });
}

function reportArtifact(relativePath, expectedSha256, readArtifact) {
  const artifact = artifactBytes(relativePath, expectedSha256, {
    prefix: `${ARTIFACT_ROOT}maestro/`, suffix: ".xml", pathCode: "phase14_report_path_invalid",
    missingCode: "phase14_report_missing", hashCode: "phase14_report_hash_invalid",
  }, readArtifact);
  return Object.freeze({ ...artifact, summary: passingJunit(artifact.bytes) });
}

function verifyTraceTrees(trace, expectedCell, readArtifact) {
  for (const [index, observation] of trace.observations.entries()) {
    const actionId = expectedCell.behavior.actionIds[index];
    const action = expectedCell.actions.find(({ id }) => id === actionId);
    if (action === undefined) throw new Error("phase14_behavior_action_missing");
    const snapshots = {};
    for (const [sideName, side] of [["pre", observation.pre], ["post", observation.post]]) {
      if (side.semantic_tree === null) {
        if (action[sideName].semanticRequired !== false || side.semantic_tree_sha256 !== null || side.focused_node !== null) {
          throw new Error("phase14_focus_tree_missing");
        }
        snapshots[sideName] = null;
        continue;
      }
      const tree = artifactBytes(side.semantic_tree, side.semantic_tree_sha256, {
        prefix: `${ARTIFACT_ROOT}traces/`, suffix: ".xml", pathCode: "phase14_focus_tree_path_invalid",
        missingCode: "phase14_focus_tree_missing", hashCode: "phase14_focus_tree_hash_invalid",
      }, readArtifact);
      const snapshot = parsePhase14SemanticSnapshot(tree.bytes);
      if (snapshot.focused_node !== side.focused_node) throw new Error("phase14_focused_node_invalid");
      snapshots[sideName] = snapshot;
    }
    if (action.transport === "adb-launch") {
      if (observation.preparation?.kind !== "adb-force-stop") throw new Error("phase14_action_preparation_invalid");
    } else {
      if (observation.preparation?.kind !== "maestro") throw new Error("phase14_action_preparation_invalid");
      reportArtifact(observation.preparation.report, observation.preparation.report_sha256, readArtifact);
    }
    validatePhase14ActionObservation(observation, action, snapshots);
  }
}

function expectedTheme(cell) {
  const osScheme = cell.liveOsSwitch ? (cell.systemNightAfter ? "dark" : "light") : cell.osScheme;
  const renderedTheme = cell.appearanceSelection === "System" ? osScheme : cell.renderedTheme;
  return { osScheme, renderedTheme: cell.expectedRenderedThemeAfterSwitch ?? renderedTheme };
}

function verifyTheme(observation, expectedCell, observedCell, readArtifact) {
  const expected = expectedTheme(expectedCell);
  if (
    observation?.selected_option !== expectedCell.appearanceSelection
    || observation.selection_observed_via !== "maestro-tap-and-assert"
    || observation.os_scheme !== expected.osScheme
    || observation.rendered_theme !== expected.renderedTheme
    || observation.expected_rendered_theme !== expected.renderedTheme
    || observation.verdict !== "PASS"
    || observation.selection_report !== observedCell.report
    || observation.selection_report_sha256 !== observedCell.report_sha256
  ) {
    throw new Error("phase14_rendered_theme_invalid");
  }
  reportArtifact(observation.selection_report, observation.selection_report_sha256, readArtifact);
}

function verifyVisual(comparison, expectedCell, observedCell, readArtifact) {
  const policy = expectedCell.referencePolicy;
  const resolution = resolvePhase14VisualReference(expectedCell, observedCell.theme_observation);
  if (resolution.kind === "native-only") {
    if (
      comparison?.verdict !== "N_A_REVIEWED"
      || comparison.rationale !== policy.rationale
      || comparison.reference_policy !== "native-only"
    ) {
      throw new Error("phase14_native_only_reference_invalid");
    }
    return;
  }
  if (resolution.kind === "not-exact") {
    if (comparison?.verdict !== "NOT_RUN" || comparison.reference_policy !== "authoritative-only") {
      throw new Error("phase14_visual_mapping_invalid");
    }
    return;
  }
  const recordArtifact = artifactBytes(comparison?.record, comparison?.record_sha256, {
    prefix: `${ARTIFACT_ROOT}comparison/${expectedCell.id}/`, suffix: ".json", pathCode: "phase14_visual_record_path_invalid",
    missingCode: "phase14_visual_record_missing", hashCode: "phase14_visual_record_hash_invalid",
  }, readArtifact);
  const record = JSON.parse(recordArtifact.bytes.toString("utf8"));
  const reviewedVerdict = comparison.review?.classification === "product_mismatch"
    ? "FAIL"
    : comparison.review?.classification === "accepted_deviation"
      ? "ACCEPTED_EXCEPTION"
      : comparison.review === undefined
        ? "REVIEW_REQUIRED"
        : "PASS";
  const expectedVerdict = record.classification === "MATCH" ? "PASS" : reviewedVerdict;
  if (
    record.reference_id !== policy.referenceId
    || !same(record.reference_source, policy.source)
    || record.configuration_id !== expectedCell.configurationId
    || record.capture_state !== policy.captureState
    || record.observed_rendered_theme !== observedCell.theme_observation.rendered_theme
    || !same(record.artifacts, comparison.artifacts)
    || !same(record.metrics, comparison.metrics)
    || comparison.classification !== record.classification
    || comparison.verdict !== expectedVerdict
    || record.artifacts.reference?.sha256 !== resolution.reference.sha256
    || record.artifacts.native?.sha256 !== observedCell.screenshot_sha256
  ) {
    throw new Error("phase14_visual_mapping_invalid");
  }
  validatePhase14VisualComparison(record, (name, artifactPath) => {
    const artifact = record.artifacts[name];
    return artifactBytes(artifactPath, artifact.sha256, {
      prefix: `${ARTIFACT_ROOT}comparison/${expectedCell.id}/`, suffix: ".png", pathCode: "phase14_visual_artifact_invalid",
      missingCode: "phase14_visual_artifact_missing", hashCode: "phase14_visual_artifact_hash_invalid",
      contentCode: "phase14_visual_artifact_invalid", png: true,
    }, readArtifact).bytes;
  });
}

function verifyRuntimeState(runtimeState, expectedCell, readArtifact) {
  if (!expectedCell.behavior.logicalStateProbe) {
    const expectedRationale = expectedCell.runtimeStatePolicy === "preference-write-reviewed"
      ? /intentionally writes/iu
      : /explicit representative behavior configurations/iu;
    if (runtimeState?.verdict !== "N_A_REVIEWED" || !expectedRationale.test(runtimeState.rationale ?? "")) {
      throw new Error("phase14_runtime_state_invalid");
    }
    return;
  }
  const artifact = artifactBytes(runtimeState?.path, runtimeState?.sha256, {
    prefix: `${ARTIFACT_ROOT}runtime-state/`, suffix: ".json", pathCode: "phase14_runtime_state_path_invalid",
    missingCode: "phase14_runtime_state_missing", hashCode: "phase14_runtime_state_hash_invalid",
  }, readArtifact);
  const pair = JSON.parse(artifact.bytes.toString("utf8"));
  if (runtimeState.verdict !== "PASS" || !same(pair.pre, runtimeState.pre) || !same(pair.post, runtimeState.post)) {
    throw new Error("phase14_runtime_state_invalid");
  }
  validatePhase14RuntimeStatePair(pair);
}

function verifyCell(cell, expectedCell, readArtifact) {
  if (
    cell?.id !== expectedCell.id
    || cell.configuration_id !== expectedCell.configurationId
    || cell.variant !== expectedCell.variant
    || cell.case_id !== expectedCell.caseId
    || cell.stage !== expectedCell.stage
    || !same(cell.state, expectedCell.state)
    || cell.appearance !== expectedCell.appearance
    || cell.appearance_selection !== expectedCell.appearanceSelection
    || cell.rendered_theme !== expectedCell.renderedTheme
    || cell.os_scheme !== expectedCell.osScheme
    || !same(cell.viewport, expectedCell.viewport)
    || cell.orientation !== expectedCell.orientation
    || cell.font_scale !== expectedCell.fontScale
    || cell.reduced_motion !== expectedCell.reducedMotion
    || cell.live_os_switch !== expectedCell.liveOsSwitch
    || !same(cell.behavior, expectedCell.behavior)
    || !same(cell.capture_requirements, expectedCell.captureRequirements)
  ) {
    throw new Error("phase14_matrix_cells_invalid");
  }
  const report = reportArtifact(cell.report, cell.report_sha256, readArtifact);
  if (!same(cell.maestro, report.summary)) throw new Error("phase14_maestro_summary_invalid");
  artifactBytes(cell.screenshot, cell.screenshot_sha256, {
    prefix: `${ARTIFACT_ROOT}screenshots/`, suffix: ".png", pathCode: "phase14_screenshot_path_invalid",
    missingCode: "phase14_screenshot_missing", hashCode: "phase14_screenshot_hash_invalid",
    contentCode: "phase14_screenshot_content_invalid", png: true,
  }, readArtifact);
  const semanticArtifact = artifactBytes(cell.semantic_tree, cell.semantic_tree_sha256, {
    prefix: `${ARTIFACT_ROOT}semantic/`, suffix: ".xml", pathCode: "phase14_semantic_tree_path_invalid",
    missingCode: "phase14_semantic_tree_missing", hashCode: "phase14_semantic_tree_hash_invalid",
  }, readArtifact);
  const semanticSnapshot = parsePhase14SemanticSnapshot(semanticArtifact.bytes);
  const semanticEvaluation = evaluatePhase14SemanticPredicate(semanticSnapshot, expectedCell.state.capture, true);
  if (
    !semanticEvaluation.ok
    || cell.semantic_observation?.capture_state !== expectedCell.state.captureState
    || cell.semantic_observation.package !== expectedCell.state.capture.package
    || cell.semantic_observation.focused_node !== semanticSnapshot.focused_node
    || cell.semantic_observation.verdict !== "PASS"
  ) {
    throw new Error("phase14_capture_state_invalid");
  }
  const traceArtifact = artifactBytes(cell.focus_key_trace, cell.focus_key_trace_sha256, {
    prefix: `${ARTIFACT_ROOT}traces/`, suffix: ".json", pathCode: "phase14_focus_trace_path_invalid",
    missingCode: "phase14_focus_trace_missing", hashCode: "phase14_focus_trace_hash_invalid",
  }, readArtifact);
  const trace = JSON.parse(traceArtifact.bytes.toString("utf8"));
  validatePhase14FocusTrace(trace, expectedCell.behavior.actionIds);
  verifyTraceTrees(trace, expectedCell, readArtifact);
  if (!same(cell.actions, trace.observations)) throw new Error("phase14_focus_trace_binding_invalid");
  if (
    !Array.isArray(cell.checkpoints)
    || cell.checkpoints.length !== expectedCell.checkpoints.length
    || cell.checkpoints.some((checkpoint, index) =>
      checkpoint.id !== expectedCell.checkpoints[index].id
      || checkpoint.observed_via !== "passing-maestro-assertion"
      || checkpoint.report_sha256 !== cell.report_sha256
      || checkpoint.verdict !== "PASS")
  ) {
    throw new Error("phase14_checkpoint_observation_invalid");
  }
  if (
    cell.target_window_bounds?.requested_viewport?.width !== expectedCell.viewport.width
    || cell.target_window_bounds?.requested_viewport?.height !== expectedCell.viewport.height
    || cell.target_window_bounds?.requested_orientation !== expectedCell.orientation
    || cell.target_window_bounds?.requested_font_scale !== expectedCell.fontScale
    || cell.target_window_bounds?.requested_appearance !== expectedCell.appearance
  ) {
    throw new Error("phase14_window_bounds_invalid");
  }
  verifyRuntimeState(cell.runtime_state, expectedCell, readArtifact);
  verifyTheme(cell.theme_observation, expectedCell, cell, readArtifact);
  verifyVisual(cell.visual_comparison, expectedCell, cell, readArtifact);
  const derived = derivePhase14NativeVerdict({
    maestro: cell.maestro,
    actions: cell.actions,
    expectedActionCount: expectedCell.behavior.actionIds.length,
    checkpoints: cell.checkpoints,
    runtimeState: cell.runtime_state,
    theme: cell.theme_observation,
  });
  if (cell.native_verdict !== derived) throw new Error("phase14_native_verdict_invalid");
  return cell;
}

export function stableDeviceIdentitySha256(values) {
  return sha256(`${values.join("\n")}\n`);
}

export function validatePhase14Privacy(value, pathName = "evidence") {
  const safePublicUiLabel = value === "Restore password" || value === "Merge password";
  if (
    typeof value === "string"
    && !safePublicUiLabel
    && /(?:^\/(?!Users\/bytedance\/\.gstack\/projects\/fchoo-gym-tracker\/designs\/push-inspired-workout-20261001$)|\\\\|\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|access[_-]?token|refresh[_-]?token|password(?!-settings)|archive[_-]?bytes|@[a-z0-9.-]+\.[a-z]{2,})/iu.test(value)
  ) {
    throw new Error(`phase14_privacy_invalid:${pathName}`);
  }
  if (Array.isArray(value)) value.forEach((entry, index) => validatePhase14Privacy(entry, `${pathName}[${index}]`));
  else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      const safeNegativeMarker = key === "contains_raw_rows" && entry === false;
      if (!safeNegativeMarker && /(?:raw[_-]?(?:row|payload)|sql[_-]?parameter|access[_-]?token|refresh[_-]?token|account[_-]?identifier|personal[_-]?filename)/iu.test(key)) {
        throw new Error(`phase14_privacy_invalid:${pathName}.${key}`);
      }
      validatePhase14Privacy(entry, `${pathName}.${key}`);
    }
  }
  return true;
}

export function validatePhase14SourceInventory({ confirmationSheet, appearanceSheet, consumers }) {
  if (
    !/BottomSheet/u.test(confirmationSheet ?? "") || /<Modal\b/u.test(confirmationSheet ?? "")
    || !/BottomSheet/u.test(appearanceSheet ?? "") || /<Modal\b/u.test(appearanceSheet ?? "")
  ) throw new Error("phase14_sheet_delegation_invalid");
  for (const consumer of consumers ?? []) {
    if (/<Modal\b/u.test(consumer.source ?? "") && !["shared-frame", "platform-overlay"].includes(consumer.exception)) {
      throw new Error("phase14_legacy_modal_owner");
    }
  }
  return true;
}

export function validatePhase14Dev02(dev02) {
  return validatePhase14Dev02Evidence(dev02);
}

function validateCurrentDev02Sources(dev02) {
  const sourceHashes = {
    theme_sha256: sha256(readFileSync(path.join(ROOT, "src/ui/theme/index.ts"))),
    prototype_sha256: sha256(readFileSync("/Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001/approved-hybrid.html")),
    owner_record_sha256: sha256(readFileSync(path.join(ROOT, ".planning/v1.2-OWNER-DECISIONS.md"))),
  };
  if (!same(dev02?.source_hashes, sourceHashes)) throw new Error("phase14_dev02_source_hash_invalid");
}

export function validatePhase14CurrentArtifacts({ manifest, currentSourceTreeSha256, apkBytes, installedApkSha256, deviceIdentitySha256 }) {
  if (manifest.source_tree_sha256 !== currentSourceTreeSha256 || sha256(apkBytes) !== manifest.apk?.sha256) throw new Error("phase14_manifest_stale");
  if (installedApkSha256 !== manifest.apk.sha256) throw new Error("phase14_installed_apk_stale");
  if (deviceIdentitySha256 !== manifest.device?.identity_sha256) throw new Error("phase14_device_identity_stale");
  return true;
}

export function validatePhase14Evidence(evidence, manifest, ids = expectedIds, options = {}) {
  validatePhase14Manifest(manifest, manifest.base_head, manifest.source_tree_sha256);
  validatePhase14NativeMatrix(PHASE14_NATIVE_MATRIX);
  const readArtifact = options.readArtifact ?? defaultArtifactReader;
  if (
    evidence?.schema_version !== 4
    || !["phase14-native-observation/v4", "phase14-native-evidence-finalized/v1"].includes(evidence.producer)
    || evidence.suite !== "phase14"
    || !["PASS", "FAIL", "REVIEW_REQUIRED", "ACCEPTED_EXCEPTION"].includes(evidence.verdict)
    || evidence.build_manifest !== `${ARTIFACT_ROOT}build.json`
    || evidence.base_head !== manifest.base_head
    || evidence.source_tree_sha256 !== manifest.source_tree_sha256
    || evidence.package !== manifest.package
    || evidence.profile !== manifest.profile
    || evidence.device_identity_sha256 !== manifest.device.identity_sha256
    || evidence.apk?.sha256 !== manifest.apk.sha256
    || evidence.apk?.installed_sha256 !== manifest.apk.sha256
    || evidence.apk?.matches_retained_apk !== true
    || !Number.isFinite(Date.parse(evidence.captured_started_at))
    || !Number.isFinite(Date.parse(evidence.captured_finished_at))
    || Date.parse(evidence.captured_finished_at) < Date.parse(evidence.captured_started_at)
    || !same(evidence.matrix, PHASE14_NATIVE_MATRIX)
  ) {
    throw new Error("phase14_evidence_identity_invalid");
  }
  const contracts = PHASE14_SHELL_EVIDENCE_CASES.filter(({ id }) => ids.includes(id));
  const expectedCells = phase14MatrixCellsForIds(ids);
  const expectedCoverageMode = options.coverageMode ?? "ids";
  if (
    evidence.coverage?.mode !== expectedCoverageMode
    || evidence.coverage.complete !== true
    || !same(evidence.coverage.requested_ids, ids)
    || evidence.coverage.requested_cell !== null
    || evidence.coverage.expected_cell_count !== expectedCells.length
    || evidence.coverage.observed_cell_count !== expectedCells.length
    || evidence.coverage.checkpoint_cell_count !== expectedCells.length
    || !Array.isArray(evidence.coverage.checkpoint_cell_ids)
    || !same(evidence.coverage.checkpoint_cell_ids, expectedCells.map(({ id }) => id))
    || !Number.isInteger(evidence.coverage.resumed_cell_count)
    || evidence.coverage.resumed_cell_count < 0
    || evidence.coverage.resumed_cell_count > expectedCells.length
  ) {
    throw new Error("phase14_evidence_coverage_invalid");
  }
  if (!Array.isArray(evidence.evidence) || evidence.evidence.length !== contracts.length) throw new Error("phase14_evidence_mapping_invalid");
  if (!Array.isArray(evidence.matrix_cells) || evidence.matrix_cells.length !== expectedCells.length) throw new Error("phase14_matrix_cells_invalid");
  const checkpointSet = evidence.matrix_cells.map((cell) => ({
    cell_id: cell.id,
    observation_sha256: phase14CellCaptureIdentitySha256(cell),
  }));
  if (evidence.coverage.checkpoint_set_sha256 !== sha256(canonicalJson(checkpointSet))) {
    throw new Error("phase14_cell_checkpoint_set_invalid");
  }
  if (
    !Array.isArray(evidence.coverage.cell_checkpoints)
    || evidence.coverage.cell_checkpoints.length !== expectedCells.length
    || !same(evidence.coverage.cell_checkpoints.map(({ cell_id: cellId }) => cellId), expectedCells.map(({ id }) => id))
  ) throw new Error("phase14_cell_checkpoint_coverage_invalid");
  const checkpointIdentity = {
    source_tree_sha256: evidence.source_tree_sha256,
    apk_sha256: evidence.apk.sha256,
    package: evidence.package,
    profile: evidence.profile,
    device_identity_sha256: evidence.device_identity_sha256,
    matrix_schema_version: PHASE14_NATIVE_MATRIX.schemaVersion,
  };
  for (const [index, binding] of evidence.coverage.cell_checkpoints.entries()) {
    const checkpointArtifact = artifactBytes(binding.path, binding.sha256, {
      prefix: `${ARTIFACT_ROOT}cells/`, suffix: ".json", pathCode: "phase14_cell_checkpoint_path_invalid",
      missingCode: "phase14_cell_checkpoint_missing", hashCode: "phase14_cell_checkpoint_hash_invalid",
    }, readArtifact);
    const checkpoint = JSON.parse(checkpointArtifact.bytes.toString("utf8"));
    validatePhase14CellCheckpoint(checkpoint, {
      expectedCell: expectedCells[index],
      identity: checkpointIdentity,
      readArtifact,
    });
    if (phase14CellCaptureIdentitySha256(checkpoint.observation)
      !== phase14CellCaptureIdentitySha256(evidence.matrix_cells[index])) {
      throw new Error("phase14_cell_checkpoint_merge_invalid");
    }
  }
  if (!same(evidence.behavior_coverage, phase14BehaviorCoverageForCells(expectedCells))) {
    throw new Error("phase14_behavior_coverage_invalid");
  }

  const captureIndexArtifact = artifactBytes(evidence.capture_index?.path, evidence.capture_index?.sha256, {
    prefix: ARTIFACT_ROOT, suffix: "capture-index.json", pathCode: "phase14_capture_index_path_invalid",
    missingCode: "phase14_capture_index_missing", hashCode: "phase14_capture_index_hash_invalid",
  }, readArtifact);
  const captureIndex = JSON.parse(captureIndexArtifact.bytes.toString("utf8"));
  if (captureIndex.capture_set_sha256 !== evidence.capture_index.capture_set_sha256) {
    throw new Error("phase14_capture_index_stale");
  }
  validatePhase14CaptureIndex(captureIndex, evidence);
  let finalizationAttestation = null;
  if (evidence.producer === "phase14-native-evidence-finalized/v1") {
    const attestationArtifact = artifactBytes(
      evidence.finalization?.attestation?.path,
      evidence.finalization?.attestation?.file_sha256,
      {
        prefix: `${ARTIFACT_ROOT}review/`, suffix: ".json", pathCode: "phase14_visual_attestation_path_invalid",
        missingCode: "phase14_visual_attestation_missing", hashCode: "phase14_visual_attestation_hash_invalid",
      },
      readArtifact,
    );
    const attestation = JSON.parse(attestationArtifact.bytes.toString("utf8"));
    if (
      evidence.finalization.mode !== "finalize-existing"
      || evidence.finalization.capture_set_sha256 !== captureIndex.capture_set_sha256
      || evidence.finalization.attestation.content_sha256 !== sha256(canonicalJson(attestation))
      || evidence.finalization.attestation_sha256 !== evidence.finalization.attestation.content_sha256
    ) throw new Error("phase14_finalize_identity_invalid");
    validatePhase14VisualAttestation(attestation, captureIndex);
    finalizationAttestation = attestation;
  }

  const componentArtifact = artifactBytes(evidence.component_evidence?.report, evidence.component_evidence?.report_sha256, {
    prefix: `${ARTIFACT_ROOT}components/`, suffix: ".json", pathCode: "phase14_component_report_path_invalid",
    missingCode: "phase14_component_report_missing", hashCode: "phase14_component_report_hash_invalid",
  }, readArtifact);
  const ingested = ingestPhase14JestReport(JSON.parse(componentArtifact.bytes.toString("utf8")), contracts);
  if (
    !same(evidence.component_evidence.cases, ingested.cases)
    || !same(evidence.component_evidence.totals, ingested.totals)
    || evidence.component_evidence.verdict !== "PASS"
  ) throw new Error("phase14_component_report_binding_invalid");

  const flattened = [];
  for (const [index, contract] of contracts.entries()) {
    const row = evidence.evidence[index];
    const rowExpectedCells = expectedCells.filter(({ caseId }) => caseId === contract.id);
    const component = ingested.cases.find(({ id }) => id === contract.id);
    if (
      row?.id !== contract.id
      || row.requirement !== contract.requirement
      || row.path !== contract.evidencePath
      || !same(row.component_evidence, component)
      || row.component_verdict !== "PASS"
      || !Array.isArray(row.matrix_cells)
      || row.matrix_cells.length !== rowExpectedCells.length
    ) throw new Error("phase14_evidence_mapping_invalid");
    const verified = row.matrix_cells.map((cell, cellIndex) => verifyCell(cell, rowExpectedCells[cellIndex], readArtifact));
    flattened.push(...verified);
    const nativeVerdict = verified.every(({ native_verdict: verdict }) => verdict === "PASS") ? "PASS" : "FAIL";
    const visualVerdicts = verified.map(({ visual_comparison: comparison }) => comparison.verdict);
    const comparableRequired = verified.filter(({ visual_comparison: comparison }) => comparison.artifacts !== undefined).length;
    const derivedRow = derivePhase14RowVerdict({
      componentVerdict: row.component_verdict,
      nativeVerdict,
      visualVerdicts,
      comparableRequired,
    });
    if (row.native_verdict !== nativeVerdict || row.visual_verdict !== derivedRow.visual_verdict || row.verdict !== derivedRow.verdict) {
      throw new Error("phase14_derived_verdict_invalid");
    }
  }
  if (!same(evidence.matrix_cells, flattened)) throw new Error("phase14_matrix_cells_invalid");
  if (finalizationAttestation !== null) {
    const reviews = new Map(finalizationAttestation.comparisons.map((review) => [review.cell_id, review]));
    for (const cell of flattened) {
      const review = reviews.get(cell.id);
      if (review === undefined) {
        if (cell.visual_comparison.review !== undefined) throw new Error("phase14_visual_review_binding_invalid");
        continue;
      }
      if (
        cell.visual_comparison.review?.classification !== review.classification
        || cell.visual_comparison.review.reviewer_fingerprint !== finalizationAttestation.reviewer.fingerprint
        || !same(cell.visual_comparison.review.semantic_zero_tolerance, review.semantic_zero_tolerance)
      ) throw new Error("phase14_visual_review_binding_invalid");
    }
  }
  const overall = evidence.evidence.some(({ verdict }) => verdict === "FAIL")
    ? "FAIL"
    : evidence.evidence.some(({ verdict }) => verdict === "REVIEW_REQUIRED")
      ? "REVIEW_REQUIRED"
      : evidence.evidence.some(({ verdict }) => verdict === "ACCEPTED_EXCEPTION")
        ? "ACCEPTED_EXCEPTION"
        : "PASS";
  if (evidence.verdict !== overall) throw new Error("phase14_derived_verdict_invalid");
  if (ids.includes("shell.tokens")) {
    validatePhase14Dev02Evidence(evidence.dev02);
    validateCurrentDev02Sources(evidence.dev02);
  }
  validatePhase14Privacy(evidence);
  return true;
}

export function parsePhase14VerifierArgs(args) {
  const options = {
    manifest: `${ARTIFACT_ROOT}build.json`,
    evidence: `${ARTIFACT_ROOT}maestro/phase14-evidence.json`,
    all: false,
    ids: [],
  };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--manifest") options.manifest = args[++index] ?? "";
    else if (args[index] === "--evidence") options.evidence = args[++index] ?? "";
    else if (args[index] === "--all") options.all = true;
    else if (args[index] === "--ids") options.ids = (args[++index] ?? "").split(",").filter(Boolean);
    else throw new Error(`phase14_unknown_argument:${args[index]}`);
  }
  if (
    options.manifest !== `${ARTIFACT_ROOT}build.json`
    || ![`${ARTIFACT_ROOT}maestro/phase14-evidence.json`, `${ARTIFACT_ROOT}finalized-evidence.json`].includes(options.evidence)
    || (options.all === (options.ids.length > 0))
    || new Set(options.ids).size !== options.ids.length
    || options.ids.some((id) => !expectedIds.includes(id))
  ) throw new Error("phase14_verifier_arguments_invalid");
  return options;
}

function installedApkBytes(serial, installedPath) {
  const directory = mkdtempSync(path.join(tmpdir(), "phase14-evidence-"));
  const output = path.join(directory, "installed.apk");
  try {
    execFileSync("adb", ["-s", serial, "pull", installedPath, output], { cwd: ROOT, stdio: "ignore" });
    return readFileSync(output);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function deviceIdentity(serial) {
  return stableDeviceIdentitySha256(DEVICE_IDENTITY_PROPERTIES.map((property) =>
    execFileSync("adb", ["-s", serial, "shell", "getprop", property], { cwd: ROOT, encoding: "utf8" }).trim()));
}

export function executePhase14EvidenceVerifier(args = process.argv.slice(2)) {
  const options = parsePhase14VerifierArgs(args);
  const manifest = JSON.parse(readFileSync(path.join(ROOT, options.manifest), "utf8"));
  const serial = resolvePhase14DeviceSerial();
  const apkPath = path.resolve(ROOT, manifest.apk.path);
  if (!existsSync(apkPath)) throw new Error("phase14_apk_missing");
  const installedPath = execFileSync("adb", ["-s", serial, "shell", "pm", "path", manifest.package], { cwd: ROOT, encoding: "utf8" }).trim().replace(/^package:/u, "");
  validatePhase14CurrentArtifacts({
    manifest,
    currentSourceTreeSha256: sourceTreeSha256(ROOT),
    apkBytes: readFileSync(apkPath),
    installedApkSha256: sha256(installedApkBytes(serial, installedPath)),
    deviceIdentitySha256: deviceIdentity(serial),
  });
  const ids = options.all ? expectedIds : options.ids;
  const evidencePath = path.join(ROOT, options.evidence);
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  validatePhase14Evidence(evidence, manifest, ids, {
    coverageMode: options.all ? "all" : "ids",
  });
  const result = {
    schema_version: 4,
    suite: "phase14",
    verdict: evidence.verdict,
    ids,
    evidence_sha256: sha256(readFileSync(evidencePath)),
  };
  writeFileSync(path.join(ROOT, ARTIFACT_ROOT, "verified-evidence.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1]?.endsWith("verify-phase14-evidence.mjs")) {
  try {
    process.stdout.write(`${JSON.stringify({ ok: true, ...executePhase14EvidenceVerifier() })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
