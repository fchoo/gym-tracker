import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const root = process.cwd();
const script = path.join(root, "scripts/verify-phase9-v20-native-evidence.mjs");
const ids = ["migration-session-exercise-edit-receipts-v20"];
function fixture(overrides = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "phase9-evidence-"));
  const apkPath = path.join(directory, "test.apk"); writeFileSync(apkPath, "apk");
  const apk = { path: apkPath, sha256: createHash("sha256").update("apk").digest("hex"), size_bytes: 3, page_alignment_kib: 16, page_alignment_verified: true };
  const identity = { serial: "test-device", api: 36, abi: "arm64-v8a", model: "test", android_release: "16" };
  const manifest = { schema_version: 1, suite: "migrations-effects", profile: "development-test", build_variant: "release", js_bundle: { embedded: true }, base_head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), source_tree_sha256: sourceTreeSha256(root), package: "test.package", apk, device: identity, ...overrides.manifest };
  const result = { schema_version: 1, suite: "migrations-effects", status: "passed", build_manifest: path.join(directory, "build.json"), base_head: manifest.base_head, source_tree_sha256: manifest.source_tree_sha256, package: manifest.package, apk: manifest.apk, installed_apk: { device_path: "/data/test.apk", sha256: manifest.apk.sha256, matches_retained_apk: true }, device: manifest.device, contract: { expected_count: ids.length, total: ids.length, passed: ids.length, failed: 0, skipped: 0, cases: ids.map((id) => ({ id, status: "passed" })) }, ...overrides.result };
  const manifestPath = path.join(directory, "build.json"); const resultPath = path.join(directory, "result.json");
  writeFileSync(manifestPath, JSON.stringify(manifest)); writeFileSync(resultPath, JSON.stringify(result));
  return { directory, manifestPath, resultPath };
}
function run(item) { return execFileSync(process.execPath, [script, "--manifest", item.manifestPath, "--result", item.resultPath, "--skip-live-device-check"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
test("accepts one complete current manifest-bound v20 suite", () => { const item = fixture(); try { assert.equal(JSON.parse(run(item)).exact_cases, ids.length); } finally { rmSync(item.directory, { recursive: true, force: true }); } });
test("rejects missing, mismatched, stale, incomplete, and non-identical evidence", () => {
  const variants = [
    { result: { contract: { expected_count: ids.length, total: ids.length, passed: ids.length, failed: 0, skipped: 0, cases: ids.slice(1).map((id) => ({ id, status: "passed" })) } } },
    { result: { source_tree_sha256: "0".repeat(64) } }, { result: { device: { serial: "other" } } },
    { result: { contract: { expected_count: ids.length, total: ids.length, passed: ids.length, failed: 0, skipped: 0, cases: [...ids.slice(0, -1), ids.at(-1), ids.at(-1)].map((id) => ({ id, status: "passed" })) } } },
    { manifest: { apk: { path: "missing.apk", sha256: "0".repeat(64), size_bytes: 0, page_alignment_kib: 16, page_alignment_verified: true } } },
  ];
  for (const variant of variants) { const item = fixture(variant); try { assert.throws(() => run(item)); } finally { rmSync(item.directory, { recursive: true, force: true }); } }
});
