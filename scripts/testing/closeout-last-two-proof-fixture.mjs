import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import childProcess, { spawnSync as actualSpawnSync } from "node:child_process";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { syncBuiltinESMExports } from "node:module";
import { createControlledRunner as actualCreateControlledRunner } from "./v12-production-launcher/controlled-runner.mjs";

const project = process.cwd();
const originalSpawnSync = actualSpawnSync;
const output = process.env.CLOSEOUT_LAST_TWO_PROOF_DIRECTORY;
if (!output || !path.isAbsolute(output)) throw new Error("last_two_proof_directory_required");
const subjects = ["scripts/v12-production-native-quality-actions.mjs", "scripts/v12-calendar-artifact-transport.mjs"];
const roots = new Map();
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
let sequence = 0;
function capture(root) {
  return subjects.map(id => {
    const original = readFileSync(path.join(project, id));
    const copied = readFileSync(path.join(root, id));
    assert.deepEqual(copied, original, `copied subject bytes must match production: ${id}`);
    return { id, production_sha256: digest(original), copied_sha256: digest(copied), url: pathToFileURL(realpathSync(path.join(root, id))).href };
  });
}
function record(value) { mkdirSync(output, { recursive: true }); appendFileSync(path.join(output, "copied-source-witnesses.ndjson"), JSON.stringify(value) + "\n"); }
function snapshot(file) {
  const bytes = readFileSync(file); const sha256 = digest(bytes);
  const directory = path.join(output, "content-addressed-inputs"); mkdirSync(directory, { recursive: true });
  const storage = path.join(directory, sha256 + ".blob");
  if (!existsSync(storage)) writeFileSync(storage, bytes, { flag: "wx" });
  return { path: realpathSync(file), sha256, bytes: bytes.length, mode: lstatSync(file).mode, snapshot: storage };
}
function snapshotBytes(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value ?? ""); const sha256 = digest(bytes);
  const directory = path.join(output, "content-addressed-inputs"); mkdirSync(directory, { recursive: true });
  const storage = path.join(directory, sha256 + ".blob");
  if (!existsSync(storage)) writeFileSync(storage, bytes, { flag: "wx" });
  return { sha256, bytes: bytes.length, snapshot: storage };
}
function inputs(root) {
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== ".git") walk(file);
      else if (entry.isFile()) files.push(snapshot(file));
    }
  }
  for (const directory of ["scripts", "src", ".planning/design/v1.2-browser-evidence", "maestro", "artifacts"]) {
    const full = path.join(root, directory); if (existsSync(full)) walk(full);
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
function rawDescriptors(directory) {
  if (!directory || !existsSync(directory)) return [];
  return readdirSync(directory).filter(name => name.endsWith(".json")).map(name => {
    const file = path.join(directory, name); return { path: file, sha256: digest(readFileSync(file)) };
  });
}

export function createControlledRunner(...args) {
  const runner = actualCreateControlledRunner(...args);
  const root = realpathSync(runner.root);
  const initial = capture(root);
  roots.set(root, initial);
  record({ kind: "controlled-copy-created", root, subjects: initial, source_digest_inputs: inputs(root), native_acceptance_proof: false });
  const cleanup = runner.cleanup;
  return { ...runner, cleanup() {
    try { const final = capture(root); assert.deepEqual(final, initial); record({ kind: "controlled-copy-closed", root, subjects: final, native_acceptance_proof: false }); }
    finally { roots.delete(root); cleanup(); }
  } };
}

export function spawnSync(executable, argv, options) {
  const root = options?.cwd ? realpathSync(options.cwd) : null;
  if (!root || !roots.has(root)) return originalSpawnSync(executable, argv, options);
  const before = capture(root); const id = ++sequence;
  const started_at = new Date().toISOString();
  const input_before = inputs(root); const previousRaw = new Set(rawDescriptors(options?.env?.NODE_V8_COVERAGE).map(entry => entry.path));
  record({ kind: "child-before", id, root, subjects: before, input_before, node: snapshot(executable), environment: options?.env, stdin: options?.input === undefined ? null : snapshotBytes(options.input), started_at, executable, argv, test_process_pid: process.pid, native_acceptance_proof: false });
  const result = originalSpawnSync(executable, argv, options);
  const after = capture(root);
  assert.deepEqual(after, before, "copied production subjects cannot mutate during child execution");
  const raw = rawDescriptors(options?.env?.NODE_V8_COVERAGE).filter(entry => !previousRaw.has(entry.path));
  record({ kind: "child-after", id, root, subjects: after, input_after: inputs(root), finished_at: new Date().toISOString(), child_pid: result.pid, raw, stdout: snapshotBytes(result.stdout), stderr: snapshotBytes(result.stderr), exit_code: result.status, signal: result.signal, error_code: result.error?.code ?? null, native_acceptance_proof: false });
  return result;
}

// Observe the controlled factory's public methods as well as the test's direct
// wrapper calls. Every child still executes through the original Node API.
childProcess.spawnSync = spawnSync;
syncBuiltinESMExports();
