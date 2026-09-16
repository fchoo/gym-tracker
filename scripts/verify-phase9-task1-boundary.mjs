#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { sourceTreeSha256, sourceTreeSha256AtHead } from "./source-tree-digest.mjs";

const root = process.cwd();
const TRAILER = "Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>";
const TITLE = "feat(09-task1): finalize v20 exercise-edit compatibility";
const PROTECTED_MIGRATION = "src/platform/sqlite/migrations/0019_session_exercise_editing.ts";
const TASK1_PATHS = Object.freeze([
  "scripts/run-coverage-gate.mjs",
  "scripts/phase9-v20-native-evidence.test.mjs",
  "scripts/verify-phase9-v20-native-evidence.mjs",
  "scripts/phase9-task1-boundary.test.mjs",
  "scripts/verify-phase9-task1-boundary.mjs",
  "src/bootstrap/workoutAppRuntime.tsx",
  "src/bootstrap/workoutAppRuntime.test.tsx",
  "src/domains/portability/backupContracts.ts",
  "src/domains/portability/restoreCommands.test.ts",
  "src/domains/portability/restoreCommands.ts",
  "src/platform/sqlite/migrations/0020_session_exercise_edit_receipts.ts",
  "src/platform/sqlite/migrations/index.ts",
  "src/platform/sqlite/repositories/logicalBackupRepository.ts",
  "src/platform/sqlite/repositories/workoutRepository.ts",
  "src/platform/sqlite/sqliteKernel.ts",
  "src/testing/contracts/migrationsEffects.contract.ts",
  "tests/integration/session-exercise-editing.test.ts",
  "tests/sqlite-host/cleanInstallRestore.test.ts",
  "tests/sqlite-host/migrations-effects.test.ts",
  "tests/sqlite-host/portabilityMigration.test.ts",
]);
const PRESERVED = [".gsd/", ".planning/"];

const [mode, ...argumentsList] = process.argv.slice(2);
const option = (name) => { const index = argumentsList.indexOf(name); return index < 0 ? undefined : argumentsList[index + 1]; };
const optionPaths = () => { const index = argumentsList.indexOf("--paths"); return index < 0 ? [] : argumentsList.slice(index + 1).filter((value) => !value.startsWith("--")); };
const failures = [];
const fail = (code) => failures.push(code);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const fullHash = (value) => typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
const isPreserved = (filePath) => PRESERVED.some((prefix) => filePath === prefix.slice(0, -1) || filePath.startsWith(prefix));
const changed = (cached) => git("diff", "--name-only", ...(cached ? ["--cached"] : []), "--").split(/\r?\n/u).filter(Boolean);
function requireClean(pathnames, label) {
  for (const filePath of pathnames) {
    if (changed(false).includes(filePath) || changed(true).includes(filePath)) fail(`${label}:${filePath}`);
  }
}
function assertProtectedMigration() {
  if (changed(false).includes(PROTECTED_MIGRATION) || changed(true).includes(PROTECTED_MIGRATION)) fail("migration_0019_changed");
}
function expectedCases() {
  const source = readFileSync(path.join(root, "src/testing/contracts/migrationsEffects.contract.ts"), "utf8");
  const block = source.match(/export const MIGRATIONS_EFFECTS_CONTRACT_CASES = \[([\s\S]*?)\] as const;/u)?.[1] ?? "";
  return [...block.matchAll(/"([a-z0-9-]+)"/gu)].map((match) => match[1]);
}
function nativeEvidence(manifestArgument, resultArgument, snapshot) {
  const manifestPath = path.resolve(root, manifestArgument ?? "artifacts/native/migrations-effects/build.json");
  const resultPath = path.resolve(root, resultArgument ?? "artifacts/native/migrations-effects/result.json");
  if (!existsSync(manifestPath) || !existsSync(resultPath)) return fail("native_evidence_missing");
  let manifest; let result;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); result = JSON.parse(readFileSync(resultPath, "utf8")); } catch { return fail("native_evidence_unreadable"); }
  if (manifest.suite !== "migrations-effects" || result.suite !== manifest.suite || result.status !== "passed") fail("native_suite_invalid");
  if (path.resolve(root, result.build_manifest ?? "") !== manifestPath) fail("native_manifest_binding_invalid");
  for (const key of ["base_head", "source_tree_sha256", "package"]) if (manifest[key] !== result[key]) fail(`native_${key}_mismatch`);
  if (!fullHash(manifest.base_head) || !/^[0-9a-f]{64}$/u.test(manifest.source_tree_sha256 ?? "")) fail("native_identity_invalid");
  const cases = result.contract?.cases; const expected = expectedCases();
  if (result.contract?.failed !== 0 || result.contract?.skipped !== 0 || result.contract?.total !== expected.length || result.contract?.passed !== expected.length || !Array.isArray(cases) || cases.length !== expected.length) fail("native_case_count_invalid");
  else {
    const actual = new Set(cases.map((entry) => entry?.id));
    if (actual.size !== expected.length || expected.some((id) => !actual.has(id)) || cases.some((entry) => entry?.status !== "passed")) fail("native_case_set_invalid");
  }
  if (!snapshot || !fullHash(snapshot)) return fail("native_snapshot_required");
  try {
    if (manifest.base_head !== snapshot || sourceTreeSha256AtHead(snapshot, root) !== manifest.source_tree_sha256) fail("native_snapshot_mismatch");
  } catch { fail("native_snapshot_unavailable"); }
}
function summaryHash(summaryPath) {
  if (!existsSync(summaryPath)) { fail("summary_missing"); return undefined; }
  const matches = readFileSync(summaryPath, "utf8").match(/^task1_boundary_commit: ([0-9a-f]{40})$/gmu) ?? [];
  if (matches.length !== 1) { fail("summary_boundary_hash_invalid"); return undefined; }
  return matches[0].slice("task1_boundary_commit: ".length);
}
function verifyCommit(commit) {
  if (!fullHash(commit)) return fail("commit_hash_invalid");
  let head;
  try { head = git("rev-parse", "HEAD"); } catch { return fail("head_unavailable"); }
  if (head !== commit) fail("commit_not_head");
  try { execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], { cwd: root }); } catch { fail("commit_not_ancestor"); }
  let parent = ""; try { parent = git("rev-parse", `${commit}^`); } catch { fail("commit_parent_missing"); }
  const commitPaths = parent ? git("diff-tree", "--no-commit-id", "--name-only", "-r", parent, commit).split(/\r?\n/u).filter(Boolean) : [];
  if (commitPaths.includes(PROTECTED_MIGRATION)) fail("commit_changed_migration_0019");
  for (const filePath of commitPaths) if (!TASK1_PATHS.includes(filePath)) fail(`commit_path_outside_scope:${filePath}`);
  for (const filePath of TASK1_PATHS) if (!commitPaths.includes(filePath)) fail(`commit_path_missing:${filePath}`);
  const message = git("show", "-s", "--format=%B", commit).replace(/\n+$/u, "");
  const trailerCount = message.split(/\r?\n/u).filter((line) => line === TRAILER).length;
  if (!message.startsWith(`${TITLE}\n\n`) || trailerCount !== 1 || !message.endsWith(`\n${TRAILER}`)) fail("commit_message_invalid");
}
function preCommit() {
  assertProtectedMigration();
  const staged = changed(true); const unstaged = changed(false);
  for (const filePath of TASK1_PATHS) if (!existsSync(path.join(root, filePath))) fail(`required_path_missing:${filePath}`);
  for (const filePath of staged) if (!TASK1_PATHS.includes(filePath)) fail(`staged_path_outside_scope:${filePath}`);
  for (const filePath of TASK1_PATHS) { if (!staged.includes(filePath)) fail(`required_path_unstaged:${filePath}`); }
  for (const filePath of unstaged) if (TASK1_PATHS.includes(filePath)) fail(`task1_path_unstaged:${filePath}`);
  nativeEvidence(option("--manifest"), option("--result"), option("--snapshot"));
}
function downstream() {
  const summary = path.resolve(root, option("--summary") ?? ".planning/phases/09-in-workout-exercise-editing/09-03-SUMMARY.md");
  const boundary = summaryHash(summary);
  if (boundary && fullHash(boundary)) { try { execFileSync("git", ["merge-base", "--is-ancestor", boundary, "HEAD"], { cwd: root }); } catch { fail("boundary_not_ancestor"); } }
  assertProtectedMigration();
  const paths = optionPaths(); if (paths.length === 0) fail("downstream_paths_required");
  requireClean(paths, "successor_path_dirty");
  const status = git("status", "--porcelain", "--untracked-files=all").split(/\r?\n/u).filter(Boolean).map((line) => line.slice(3));
  for (const filePath of status) if (!isPreserved(filePath) && !paths.includes(filePath)) fail(`downstream_path_outside_scope:${filePath}`);
}

if (mode === "pre-commit") preCommit();
else if (mode === "post-commit") verifyCommit(option("--commit") ?? git("rev-parse", "HEAD"));
else if (mode === "summary") { const hash = summaryHash(path.resolve(root, option("--summary") ?? ".planning/phases/09-in-workout-exercise-editing/09-03-SUMMARY.md")); if (hash) verifyCommit(hash); }
else if (mode === "downstream") downstream();
else fail("mode_invalid");
if (failures.length > 0) { process.stderr.write(JSON.stringify({ ok: false, failures: [...new Set(failures)] }) + "\n"); process.exit(1); }
process.stdout.write(JSON.stringify({ ok: true, mode }) + "\n");
