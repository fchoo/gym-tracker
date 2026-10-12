import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { exactKeys } from "./node-evidence-utils.mjs";

const HASH = /^[a-f0-9]{64}$/u;
const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const STAGE_ID = /^[a-z][a-z0-9_-]{2,63}$/u;

function fail(code) {
  throw new Error(`v12_calendar_${code}`);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableCanonicalJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

export function createExclusiveDirectory(directory, code = "output_exists") {
  try {
    mkdirSync(directory);
  } catch (error) {
    if (error.code === "EEXIST") fail(code);
    throw error;
  }
}

export function writeExclusiveArtifact(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx" });
}

function runDirectory(root, runId) {
  if (!RUN_ID.test(runId)) fail("run_id_invalid");
  return path.join(path.resolve(root), runId);
}

function validateStageIds(stageIds) {
  if ([!Array.isArray(stageIds), Array.isArray(stageIds) && stageIds.length === 0, Array.isArray(stageIds) && new Set(stageIds).size !== stageIds.length, Array.isArray(stageIds) && stageIds.some((stageId) => !STAGE_ID.test(stageId))].some(Boolean)) fail("stage_registry_invalid");
}

export function initializeV12CalendarRun({ root, runId, stageIds }) {
  validateStageIds(stageIds);
  mkdirSync(path.resolve(root), { recursive: true });
  const directory = runDirectory(root, runId);
  createExclusiveDirectory(directory, "run_exists");
  createExclusiveDirectory(path.join(directory, "stages"));
  writeExclusiveArtifact(path.join(directory, "run.json"), stableCanonicalJson({
    schema_version: 1,
    run_id: runId,
    stage_ids: stageIds,
  }));
  return readV12CalendarRunState({ root, runId, stageIds });
}

function stageResultPath(directory, stageIds, stageId) {
  const index = stageIds.indexOf(stageId);
  if (index < 0) fail("stage_unknown");
  return path.join(directory, "stages", `${String(index + 1).padStart(3, "0")}-${stageId}.json`);
}

function readStageResults(directory, stageIds) {
  const stageDirectory = path.join(directory, "stages");
  const names = readdirSync(stageDirectory).sort();
  if (names.some((name) => !/^\d{3}-[a-z][a-z0-9_-]{2,63}\.json$/u.test(name))) fail("stage_file_invalid");
  return names.map((name) => {
    const result = JSON.parse(readFileSync(path.join(stageDirectory, name), "utf8"));
    if ([
      !exactKeys(result, ["schema_version", "stage_id", "status", "artifact_sha256"]),
      result.schema_version !== 1,
      !stageIds.includes(result.stage_id),
      !["COMPLETE", "FAILED"].includes(result.status),
      !HASH.test(result.artifact_sha256),
      stageIds.includes(result.stage_id) && path.basename(stageResultPath(directory, stageIds, result.stage_id)) !== name,
    ].some(Boolean)) fail("stage_result_invalid");
    return result;
  });
}

export function readV12CalendarRunState({ root, runId, stageIds }) {
  validateStageIds(stageIds);
  const directory = runDirectory(root, runId);
  const run = JSON.parse(readFileSync(path.join(directory, "run.json"), "utf8"));
  if ([!exactKeys(run, ["schema_version", "run_id", "stage_ids"]), run.schema_version !== 1, run.run_id !== runId, JSON.stringify(run.stage_ids) !== JSON.stringify(stageIds)].some(Boolean)) fail("run_state_invalid");
  const results = readStageResults(directory, stageIds);
  const completed = results.filter(({ status }) => status === "COMPLETE").map(({ stage_id }) => stage_id);
  const failed = results.filter(({ status }) => status === "FAILED").map(({ stage_id }) => stage_id);
  const resolved = new Set([...completed, ...failed]);
  const pending = stageIds.filter((stageId) => !resolved.has(stageId));
  const status = failed.length > 0 ? "FAILED" : pending.length === 0 ? "COMPLETE" : "IN_PROGRESS";
  const terminalPath = path.join(directory, "terminal.json");
  if (existsSync(terminalPath)) {
    const terminal = JSON.parse(readFileSync(terminalPath, "utf8"));
    if ([!exactKeys(terminal, ["schema_version", "run_id", "status", "completed_stage_count", "failed_stage_count"]), terminal.schema_version !== 1, terminal.run_id !== runId, terminal.status !== status, terminal.completed_stage_count !== completed.length, terminal.failed_stage_count !== failed.length, status === "IN_PROGRESS"].some(Boolean)) fail("terminal_state_invalid");
  }
  return Object.freeze({
    status,
    completed_stage_ids: Object.freeze(completed),
    failed_stage_ids: Object.freeze(failed),
    pending_stage_ids: Object.freeze(pending),
  });
}

export function recordV12CalendarStageResult({ root, runId, stageIds, stageId, status, artifactSha256 }) {
  const current = readV12CalendarRunState({ root, runId, stageIds });
  if (current.status !== "IN_PROGRESS") fail("run_terminal");
  const directory = runDirectory(root, runId);
  const resultPath = stageResultPath(directory, stageIds, stageId);
  if (existsSync(resultPath)) fail("stage_exists");
  if ([!["COMPLETE", "FAILED"].includes(status), !HASH.test(artifactSha256)].some(Boolean)) fail("stage_result_invalid");
  writeExclusiveArtifact(resultPath, stableCanonicalJson({
    schema_version: 1,
    stage_id: stageId,
    status,
    artifact_sha256: artifactSha256,
  }));
  const next = readV12CalendarRunState({ root, runId, stageIds });
  if (next.status !== "IN_PROGRESS") {
    writeExclusiveArtifact(path.join(directory, "terminal.json"), stableCanonicalJson({
      schema_version: 1,
      run_id: runId,
      status: next.status,
      completed_stage_count: next.completed_stage_ids.length,
      failed_stage_count: next.failed_stage_ids.length,
    }));
  }
  return readV12CalendarRunState({ root, runId, stageIds });
}
