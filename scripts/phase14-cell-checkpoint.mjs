import { createHash } from "node:crypto";
import path from "node:path";

import { canonicalJson } from "./phase14-visual-review.mjs";

const HASH = /^[a-f0-9]{64}$/u;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function addArtifact(output, artifactPath, digest) {
  if (typeof artifactPath === "string" && HASH.test(digest ?? "")) {
    output.push({ path: artifactPath, sha256: digest });
  }
}

export function collectPhase14CellArtifacts(observation) {
  const artifacts = [];
  addArtifact(artifacts, observation.report, observation.report_sha256);
  addArtifact(artifacts, observation.screenshot, observation.screenshot_sha256);
  addArtifact(artifacts, observation.semantic_tree, observation.semantic_tree_sha256);
  addArtifact(artifacts, observation.focus_key_trace, observation.focus_key_trace_sha256);
  addArtifact(artifacts, observation.runtime_state?.path, observation.runtime_state?.sha256);
  addArtifact(artifacts, observation.theme_observation?.selection_report, observation.theme_observation?.selection_report_sha256);
  addArtifact(artifacts, observation.visual_comparison?.record, observation.visual_comparison?.record_sha256);
  for (const artifact of Object.values(observation.visual_comparison?.artifacts ?? {})) {
    addArtifact(artifacts, artifact?.path, artifact?.sha256);
  }
  for (const action of observation.actions ?? []) {
    addArtifact(artifacts, action.preparation?.report, action.preparation?.report_sha256);
    for (const side of [action.pre, action.post]) addArtifact(artifacts, side?.semantic_tree, side?.semantic_tree_sha256);
  }
  return Object.freeze([...new Map(artifacts.map((artifact) => [artifact.path, Object.freeze(artifact)])).values()]
    .sort((left, right) => left.path.localeCompare(right.path)));
}

export function phase14CellCheckpointPath(outputRoot, cellId) {
  if (
    typeof outputRoot !== "string"
    || outputRoot.length === 0
    || typeof cellId !== "string"
    || !/^[a-z0-9][a-z0-9.-]*$/u.test(cellId)
  ) throw new Error("phase14_cell_checkpoint_path_invalid");
  return path.posix.join(outputRoot.replace(/\\/gu, "/"), "cells", `${cellId}.json`);
}

export function buildPhase14CellCheckpoint({ expectedCell, identity, observation, capturedStartedAt, capturedFinishedAt }) {
  if (
    !Number.isFinite(Date.parse(capturedStartedAt))
    || !Number.isFinite(Date.parse(capturedFinishedAt))
    || Date.parse(capturedFinishedAt) < Date.parse(capturedStartedAt)
  ) throw new Error("phase14_cell_checkpoint_time_invalid");
  const storedObservation = structuredClone(observation);
  return Object.freeze({
    schema_version: 1,
    producer: "phase14-cell-checkpoint/v1",
    status: "complete",
    cell_id: expectedCell.id,
    configuration_id: expectedCell.configurationId,
    expected_cell_sha256: sha256(canonicalJson(expectedCell)),
    identity: Object.freeze({ ...identity }),
    captured_started_at: capturedStartedAt,
    captured_finished_at: capturedFinishedAt,
    observation_sha256: sha256(canonicalJson(storedObservation)),
    artifacts: collectPhase14CellArtifacts(storedObservation),
    observation: storedObservation,
  });
}

export function validatePhase14CellCheckpoint(checkpoint, { expectedCell, identity, readArtifact }) {
  if (checkpoint?.status !== "complete") throw new Error("phase14_cell_checkpoint_incomplete");
  if (checkpoint.schema_version !== 1 || checkpoint.producer !== "phase14-cell-checkpoint/v1") {
    throw new Error("phase14_cell_checkpoint_schema_invalid");
  }
  if (checkpoint.cell_id !== expectedCell.id || checkpoint.configuration_id !== expectedCell.configurationId) {
    throw new Error("phase14_cell_checkpoint_cell_invalid");
  }
  if (checkpoint.expected_cell_sha256 !== sha256(canonicalJson(expectedCell))) {
    throw new Error("phase14_cell_checkpoint_matrix_stale");
  }
  if (!same(checkpoint.identity, identity)) throw new Error("phase14_cell_checkpoint_stale");
  if (
    !Number.isFinite(Date.parse(checkpoint.captured_started_at))
    || !Number.isFinite(Date.parse(checkpoint.captured_finished_at))
    || Date.parse(checkpoint.captured_finished_at) < Date.parse(checkpoint.captured_started_at)
  ) throw new Error("phase14_cell_checkpoint_time_invalid");
  if (
    checkpoint.observation?.id !== expectedCell.id
    || checkpoint.observation.case_id !== expectedCell.caseId
    || checkpoint.observation.configuration_id !== expectedCell.configurationId
    || !same(checkpoint.observation.behavior, expectedCell.behavior)
    || checkpoint.observation_sha256 !== sha256(canonicalJson(checkpoint.observation))
    || !same(checkpoint.artifacts, collectPhase14CellArtifacts(checkpoint.observation))
  ) throw new Error("phase14_cell_checkpoint_observation_invalid");
  for (const artifact of checkpoint.artifacts) {
    let bytes;
    try {
      const value = readArtifact(artifact.path);
      bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    } catch {
      throw new Error("phase14_cell_checkpoint_artifact_missing");
    }
    if (sha256(bytes) !== artifact.sha256) throw new Error("phase14_cell_checkpoint_artifact_stale");
  }
  return true;
}

export function mergePhase14CellCheckpoints(checkpoints, expectedCells, identity, readArtifact) {
  if (
    !Array.isArray(checkpoints)
    || checkpoints.length !== expectedCells.length
    || new Set(checkpoints.map(({ cell_id: id }) => id)).size !== expectedCells.length
    || expectedCells.some(({ id }) => !checkpoints.some(({ cell_id: cellId }) => cellId === id))
  ) throw new Error("phase14_cell_checkpoint_coverage_invalid");
  const ordered = expectedCells.map((expectedCell) => {
    const checkpoint = checkpoints.find(({ cell_id: id }) => id === expectedCell.id);
    validatePhase14CellCheckpoint(checkpoint, { expectedCell, identity, readArtifact });
    return checkpoint;
  });
  return Object.freeze({
    observations: Object.freeze(ordered.map(({ observation }) => observation)),
    captured_started_at: ordered.map(({ captured_started_at: value }) => value).sort()[0],
    captured_finished_at: ordered.map(({ captured_finished_at: value }) => value).sort().at(-1),
  });
}
