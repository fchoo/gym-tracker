import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const verifier = path.join(root, "scripts/verify-phase9-task1-boundary.mjs");
const digest = path.join(root, "scripts/source-tree-digest.mjs");
const paths = ["scripts/run-coverage-gate.mjs", "scripts/phase9-v20-native-evidence.test.mjs", "scripts/verify-phase9-v20-native-evidence.mjs", "scripts/phase9-task1-boundary.test.mjs", "scripts/verify-phase9-task1-boundary.mjs", "src/bootstrap/workoutAppRuntime.tsx", "src/bootstrap/workoutAppRuntime.test.tsx", "src/domains/portability/backupContracts.ts", "src/domains/portability/restoreCommands.test.ts", "src/domains/portability/restoreCommands.ts", "src/platform/sqlite/migrations/0020_session_exercise_edit_receipts.ts", "src/platform/sqlite/migrations/index.ts", "src/platform/sqlite/repositories/logicalBackupRepository.ts", "src/platform/sqlite/repositories/workoutRepository.ts", "src/platform/sqlite/sqliteKernel.ts", "src/testing/contracts/migrationsEffects.contract.ts", "tests/integration/session-exercise-editing.test.ts", "tests/sqlite-host/cleanInstallRestore.test.ts", "tests/sqlite-host/migrations-effects.test.ts", "tests/sqlite-host/portabilityMigration.test.ts"];
const run = (cwd, ...args) => execFileSync(process.execPath, [path.join(cwd, "scripts/verify-phase9-task1-boundary.mjs"), ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
function fixture() {
  const cwd = mkdtempSync(path.join(tmpdir(), "phase9-boundary-")); mkdirSync(path.join(cwd, "scripts"), { recursive: true });
  mkdirSync(path.join(cwd, "src/platform/sqlite/migrations"), { recursive: true });
  writeFileSync(path.join(cwd, "src/platform/sqlite/migrations/0019_session_exercise_editing.ts"), "protected\n");
  cpSync(digest, path.join(cwd, "scripts/source-tree-digest.mjs"));
  git(cwd, "init"); git(cwd, "config", "user.email", "test@example.com"); git(cwd, "config", "user.name", "Test"); git(cwd, "add", "."); git(cwd, "commit", "-m", "base");
  cpSync(verifier, path.join(cwd, "scripts/verify-phase9-task1-boundary.mjs"));
  for (const filePath of paths) { const absolute = path.join(cwd, filePath); mkdirSync(path.dirname(absolute), { recursive: true }); if (!absolute.includes("verify-phase9-task1-boundary.mjs")) writeFileSync(absolute, filePath.includes("migrationsEffects.contract") ? 'export const MIGRATIONS_EFFECTS_CONTRACT_CASES = ["migration-session-exercise-edit-receipts-v20"] as const;\n' : "x\n"); }
  return cwd;
}
function native(cwd, snapshot) {
  const sourceDigest = execFileSync(process.execPath, ["--input-type=module", "-e", `import { sourceTreeSha256AtHead } from ${JSON.stringify(path.join(cwd, "scripts/source-tree-digest.mjs"))}; process.stdout.write(sourceTreeSha256AtHead(process.argv[1]));`, snapshot], { cwd, encoding: "utf8" }).trim();
  assert.match(snapshot, /^[0-9a-f]{40}$/u); assert.match(sourceDigest, /^[0-9a-f]{64}$/u);
  const dir = path.join(cwd, "artifacts/native/migrations-effects"); mkdirSync(dir, { recursive: true });
  const manifest = { suite: "migrations-effects", base_head: snapshot, source_tree_sha256: sourceDigest, package: "test" };
  const result = { suite: "migrations-effects", status: "passed", build_manifest: "artifacts/native/migrations-effects/build.json", base_head: snapshot, source_tree_sha256: sourceDigest, package: "test", contract: { total: 1, passed: 1, failed: 0, skipped: 0, cases: [{ id: "migration-session-exercise-edit-receipts-v20", status: "passed" }] } };
  writeFileSync(path.join(dir, "build.json"), JSON.stringify(manifest)); writeFileSync(path.join(dir, "result.json"), JSON.stringify(result));
}
test("pre-commit accepts a matching clean snapshot and rejects unstaged scope drift", () => { const cwd = fixture(); try { git(cwd, "add", "."); const snapshot = git(cwd, "commit-tree", git(cwd, "write-tree"), "-p", "HEAD", "-m", "snapshot"); git(cwd, "update-ref", "refs/phase9-test-snapshot", snapshot); native(cwd, snapshot); assert.equal(JSON.parse(run(cwd, "pre-commit", "--snapshot", snapshot)).ok, true); writeFileSync(path.join(cwd, paths[0]), "drift\n"); assert.throws(() => run(cwd, "pre-commit", "--snapshot", snapshot)); } finally { rmSync(cwd, { force: true, recursive: true }); } });
test("post-commit, summary, and downstream enforce ancestry, trailer, scope, and preserved planning files", () => { const cwd = fixture(); try { git(cwd, "add", "."); const tree = git(cwd, "write-tree"); const commit = git(cwd, "commit-tree", tree, "-p", "HEAD", "-m", "feat(09-task1): finalize v20 exercise-edit compatibility\n\nCo-authored-by: TRAE CLI <noreply@users.noreply.github.com>"); git(cwd, "update-ref", "HEAD", commit); assert.equal(JSON.parse(run(cwd, "post-commit")).ok, true); const summary = path.join(cwd, ".planning/phases/09-in-workout-exercise-editing/09-03-SUMMARY.md"); mkdirSync(path.dirname(summary), { recursive: true }); writeFileSync(summary, `task1_boundary_commit: ${commit}\n`); assert.equal(JSON.parse(run(cwd, "summary", "--summary", summary)).ok, true); mkdirSync(path.join(cwd, ".planning/debug"), { recursive: true }); writeFileSync(path.join(cwd, ".planning/debug/keep.txt"), "preserved\n"); assert.equal(JSON.parse(run(cwd, "downstream", "--summary", summary, "--paths", "next.ts")).ok, true); } finally { rmSync(cwd, { force: true, recursive: true }); } });
