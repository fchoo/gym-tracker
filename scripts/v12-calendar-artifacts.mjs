import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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

function isWithin(root, target, allowRoot = false) {
  const relative = path.relative(root, target);
  return (allowRoot && relative.length === 0)
    || (relative.length > 0 && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function trustedRoot(target) {
  const absolute = path.resolve(target);
  const roots = [path.resolve(process.cwd()), path.resolve(tmpdir())]
    .sort((left, right) => right.length - left.length);
  const root = roots.find((candidate) => isWithin(candidate, absolute, true));
  if (root === undefined) fail("path_escape");
  return root;
}

export function resolveV12CalendarPath(target, options = {}) {
  const root = path.resolve(options.root ?? trustedRoot(target));
  if (!existsSync(root) || lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) fail("path_unsafe");
  const absolute = path.resolve(target);
  if (!isWithin(root, absolute, options.allowRoot === true)) fail("path_escape");
  let current = root;
  const segments = path.relative(root, absolute).split(path.sep).filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    if (!existsSync(current)) {
      if (options.mustExist === true || index < segments.length - 1) fail("path_missing");
      continue;
    }
    const details = lstatSync(current);
    if (details.isSymbolicLink()) fail("path_unsafe");
    if (index < segments.length - 1 && !details.isDirectory()) fail("path_unsafe");
  }
  return absolute;
}

export function ensureV12CalendarDirectory(directory, options = {}) {
  const absolute = path.resolve(directory);
  const root = path.resolve(options.root ?? trustedRoot(absolute));
  resolveV12CalendarPath(root, { root, allowRoot: true, mustExist: true });
  if (!isWithin(root, absolute, options.allowRoot === true)) fail("path_escape");
  let current = root;
  const segments = path.relative(root, absolute).split(path.sep).filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    if (existsSync(current)) {
      const details = lstatSync(current);
      if (details.isSymbolicLink() || !details.isDirectory()) fail("path_unsafe");
      if (options.exclusive === true && index === segments.length - 1) fail(options.code ?? "output_exists");
      continue;
    }
    mkdirSync(current);
  }
  return absolute;
}

export function createExclusiveDirectory(directory, code = "output_exists", options = {}) {
  return ensureV12CalendarDirectory(directory, { ...options, exclusive: true, code });
}

export function writeExclusiveArtifact(file, bytes, options = {}) {
  const absolute = resolveV12CalendarPath(file, { ...options, mustExist: false });
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | constants.O_NOFOLLOW;
  const descriptor = openSync(absolute, flags, 0o600);
  try {
    writeFileSync(descriptor, bytes);
  } finally {
    closeSync(descriptor);
  }
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
  runDirectory(root, runId);
  const rootDirectory = ensureV12CalendarDirectory(root, { allowRoot: true });
  const directory = runDirectory(rootDirectory, runId);
  createExclusiveDirectory(directory, "run_exists", { root: rootDirectory });
  createExclusiveDirectory(path.join(directory, "stages"), "output_exists", { root: directory });
  writeExclusiveArtifact(path.join(directory, "run.json"), stableCanonicalJson({
    schema_version: 1,
    run_id: runId,
    stage_ids: stageIds,
  }), { root: directory });
  return readV12CalendarRunState({ root: rootDirectory, runId, stageIds });
}

function stageResultPath(directory, stageIds, stageId) {
  const index = stageIds.indexOf(stageId);
  if (index < 0) fail("stage_unknown");
  return path.join(directory, "stages", `${String(index + 1).padStart(3, "0")}-${stageId}.json`);
}

function readStageResults(directory, stageIds) {
  const stageDirectory = path.join(directory, "stages");
  resolveV12CalendarPath(stageDirectory, { root: directory, mustExist: true });
  const names = readdirSync(stageDirectory).sort();
  if (names.some((name) => !/^\d{3}-[a-z][a-z0-9_-]{2,63}\.json$/u.test(name))) fail("stage_file_invalid");
  return names.map((name) => {
    const resultPath = resolveV12CalendarPath(path.join(stageDirectory, name), { root: directory, mustExist: true });
    const result = JSON.parse(readFileSync(resultPath, "utf8"));
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
  const rootDirectory = resolveV12CalendarPath(root, { root, allowRoot: true, mustExist: true });
  const directory = resolveV12CalendarPath(runDirectory(rootDirectory, runId), { root: rootDirectory, mustExist: true });
  const runPath = resolveV12CalendarPath(path.join(directory, "run.json"), { root: directory, mustExist: true });
  const run = JSON.parse(readFileSync(runPath, "utf8"));
  if ([!exactKeys(run, ["schema_version", "run_id", "stage_ids"]), run.schema_version !== 1, run.run_id !== runId, JSON.stringify(run.stage_ids) !== JSON.stringify(stageIds)].some(Boolean)) fail("run_state_invalid");
  const results = readStageResults(directory, stageIds);
  const completed = results.filter(({ status }) => status === "COMPLETE").map(({ stage_id }) => stage_id);
  const failed = results.filter(({ status }) => status === "FAILED").map(({ stage_id }) => stage_id);
  const resolved = new Set([...completed, ...failed]);
  const pending = stageIds.filter((stageId) => !resolved.has(stageId));
  const status = failed.length > 0 ? "FAILED" : pending.length === 0 ? "COMPLETE" : "IN_PROGRESS";
  const terminalPath = path.join(directory, "terminal.json");
  if (existsSync(terminalPath)) {
    const terminal = JSON.parse(readFileSync(resolveV12CalendarPath(terminalPath, { root: directory, mustExist: true }), "utf8"));
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
  }), { root: directory });
  const next = readV12CalendarRunState({ root, runId, stageIds });
  if (next.status !== "IN_PROGRESS") {
    writeExclusiveArtifact(path.join(directory, "terminal.json"), stableCanonicalJson({
      schema_version: 1,
      run_id: runId,
      status: next.status,
      completed_stage_count: next.completed_stage_ids.length,
      failed_stage_count: next.failed_stage_ids.length,
    }), { root: directory });
  }
  return readV12CalendarRunState({ root, runId, stageIds });
}
