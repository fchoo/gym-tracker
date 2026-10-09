import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildPhase14CellCheckpoint,
  mergePhase14CellCheckpoints,
  phase14CellCheckpointPath,
  validatePhase14CellCheckpoint,
} from "./phase14-cell-checkpoint.mjs";
import { PHASE14_NATIVE_MATRIX } from "./phase14-native-matrix.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const identity = Object.freeze({
  source_tree_sha256: "1".repeat(64),
  apk_sha256: "2".repeat(64),
  package: "com.fchoo.gymtracker.devtest",
  profile: "development-test",
  device_identity_sha256: "3".repeat(64),
  matrix_schema_version: PHASE14_NATIVE_MATRIX.schemaVersion,
});

function observation(cell) {
  return {
    id: cell.id,
    case_id: cell.caseId,
    configuration_id: cell.configurationId,
    behavior: cell.behavior,
    report: `artifacts/native/phase14/maestro/${cell.id}.xml`,
    report_sha256: sha256(`report:${cell.id}`),
    screenshot: `artifacts/native/phase14/screenshots/${cell.id}.png`,
    screenshot_sha256: sha256(`screen:${cell.id}`),
    semantic_tree: `artifacts/native/phase14/semantic/${cell.id}.xml`,
    semantic_tree_sha256: sha256(`semantic:${cell.id}`),
    focus_key_trace: `artifacts/native/phase14/traces/${cell.id}.json`,
    focus_key_trace_sha256: sha256(`trace:${cell.id}`),
    runtime_state: { verdict: "N_A_REVIEWED" },
    theme_observation: { verdict: "PASS" },
    visual_comparison: { verdict: "N_A_REVIEWED" },
    native_verdict: "PASS",
  };
}

function artifactsFor(value) {
  const map = new Map([
    [value.report, Buffer.from(`report:${value.id}`)],
    [value.screenshot, Buffer.from(`screen:${value.id}`)],
    [value.semantic_tree, Buffer.from(`semantic:${value.id}`)],
    [value.focus_key_trace, Buffer.from(`trace:${value.id}`)],
  ]);
  return (artifactPath) => {
    const bytes = map.get(artifactPath);
    if (bytes === undefined) throw new Error("missing");
    return bytes;
  };
}

test("Phase 14 per-cell checkpoints bind exact matrix and capture identity", () => {
  const cell = PHASE14_NATIVE_MATRIX.cells[0];
  const value = observation(cell);
  const checkpoint = buildPhase14CellCheckpoint({
    expectedCell: cell,
    identity,
    observation: value,
    capturedStartedAt: "2026-10-10T01:00:00.000Z",
    capturedFinishedAt: "2026-10-10T01:01:00.000Z",
  });
  assert.equal(checkpoint.status, "complete");
  assert.equal(checkpoint.cell_id, cell.id);
  assert.match(checkpoint.observation_sha256, /^[a-f0-9]{64}$/u);
  assert.doesNotThrow(() => validatePhase14CellCheckpoint(checkpoint, {
    expectedCell: cell,
    identity,
    readArtifact: artifactsFor(value),
  }));
  assert.throws(
    () => validatePhase14CellCheckpoint({ ...checkpoint, status: "partial" }, { expectedCell: cell, identity, readArtifact: artifactsFor(value) }),
    /phase14_cell_checkpoint_incomplete/u,
  );
  assert.throws(
    () => validatePhase14CellCheckpoint({ ...checkpoint, identity: { ...identity, apk_sha256: "0".repeat(64) } }, { expectedCell: cell, identity, readArtifact: artifactsFor(value) }),
    /phase14_cell_checkpoint_stale/u,
  );
});

test("Phase 14 checkpoint merge requires every expected cell exactly once in matrix order", () => {
  const expectedCells = PHASE14_NATIVE_MATRIX.cells.slice(0, 3);
  const checkpoints = expectedCells.map((cell, index) => {
    const value = observation(cell);
    return buildPhase14CellCheckpoint({
      expectedCell: cell,
      identity,
      observation: value,
      capturedStartedAt: `2026-10-10T01:0${index}:00.000Z`,
      capturedFinishedAt: `2026-10-10T01:0${index}:30.000Z`,
    });
  });
  assert.deepEqual(
    mergePhase14CellCheckpoints(checkpoints.toReversed(), expectedCells, identity, (artifactPath) => {
      const checkpoint = checkpoints.find(({ artifacts }) => artifacts.some(({ path }) => path === artifactPath));
      return artifactsFor(checkpoint.observation)(artifactPath);
    }).observations.map(({ id }) => id),
    expectedCells.map(({ id }) => id),
  );
  assert.throws(
    () => mergePhase14CellCheckpoints(checkpoints.slice(1), expectedCells, identity, () => Buffer.alloc(0)),
    /phase14_cell_checkpoint_coverage_invalid/u,
  );
  assert.throws(
    () => mergePhase14CellCheckpoints([...checkpoints, checkpoints[0]], expectedCells, identity, () => Buffer.alloc(0)),
    /phase14_cell_checkpoint_coverage_invalid/u,
  );
});

test("Phase 14 checkpoint paths stay inside the selected output root", () => {
  assert.equal(
    phase14CellCheckpointPath("artifacts/native/phase14", "four-roots-light-390x844-portrait-font-1"),
    "artifacts/native/phase14/cells/four-roots-light-390x844-portrait-font-1.json",
  );
  assert.equal(
    phase14CellCheckpointPath("artifacts/native/phase14/smoke/cell", "cell"),
    "artifacts/native/phase14/smoke/cell/cells/cell.json",
  );
  assert.throws(() => phase14CellCheckpointPath("artifacts/native/phase14", "../escape"), /phase14_cell_checkpoint_path_invalid/u);
});

test("Phase 14 runner resumes canonical cells without deleting prior cell artifacts", () => {
  const source = readFileSync("scripts/run-phase14-maestro.mjs", "utf8");
  assert.match(source, /validatePhase14CellCheckpoint/u);
  assert.match(source, /mergePhase14CellCheckpoints/u);
  assert.match(source, /renameSync/u);
  assert.doesNotMatch(source, /rmSync\(maestroDirectory/u);
  assert.match(source, /mode === "cell-smoke"[\s\S]*?rmSync\(outputDirectory/u);
  assert.ok(source.indexOf("restoreCellDeviceState(adbPath, serial, applied)")
    < source.indexOf("writeJsonAtomic(absoluteCellCheckpointPath(outputDirectory, cell.id), completedCheckpoint)"));
});
