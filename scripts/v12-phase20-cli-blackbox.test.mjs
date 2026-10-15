/**
 * Phase 20 subprocess contract test.
 *
 * It invokes production entrypoints only.  The fake adapter, adb and Maestro
 * programs are separate processes; no production helper is imported by this
 * test.  The expected publisher interface is documented by completion()
 * below: one completed, non-staging manifest per shard at
 * publication/<shard>.json, listing immutable members and their SHA-256s.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { PNG } from "pngjs";

const project = process.cwd();
let run = "phase20-20261014T000000Z-aaaaaaaaaaaa";
const sha = (letter) => letter.repeat(64);

function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "v12-phase20-blackbox-"));
  // Production CLIs use cwd as their source/run root. These are source inputs,
  // not production modules, and the entrypoints themselves remain absolute.
  for (const member of ["scripts", "src/testing/contracts", "maestro/v1.2", ".planning/design", ".planning/phases/20-native-acceptance", ".planning/REQUIREMENTS.md"]) {
    const source = path.join(project, member);
    if (existsSync(source)) cpSync(source, path.join(root, member), { recursive: true });
  }
  writeFileSync(path.join(root, "package.json"), readFileSync(path.join(project, "package.json")));
  writeFileSync(path.join(root, "package-lock.json"), readFileSync(path.join(project, "package-lock.json")));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "user.email", "phase20-test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Phase 20 test"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: root });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  run = `phase20-20261014T000000Z-${head.slice(0, 12)}`;
  const tree = spawnSync(process.execPath, [path.join(project, "scripts/source-tree-digest.mjs")], { cwd: root, encoding: "utf8" });
  assert.equal(tree.status, 0, tree.stderr);
  mkdirSync(path.join(root, "artifacts/native/v1.2", run), { recursive: true });
  writeFileSync(path.join(root, "artifacts/native/v1.2", run, "build.json"), `${JSON.stringify(buildManifest(head, tree.stdout.trim()))}\n`);
  return root;
}

function buildManifest(head, sourceTreeSha256) {
  return {
    schema_version: 1, run_id: run, mode: "live", created_at: "2026-10-14T00:00:00Z",
    source: { head, tree_sha256: sourceTreeSha256, dirty: false, package_json_sha256: sha("c"), package_lock_sha256: sha("d") },
    planning: { matrix_sha256: sha("e"), requirements_sha256: sha("f"), source_manifest_sha256: sha("1"), owner_brief_sha256: sha("2"), ui_spec_sha256: sha("3"), deviations_sha256: sha("4") },
    prototype: { revision: 18, approval_sha256: sha("5"), html_sha256: sha("6") }, fixtures: { registry_sha256: sha("7") },
    build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "0.1.0", version_code: 1, apk: { path: "artifacts/native/v1.2-acceptance/fake.apk", sha256: sha("8"), size_bytes: 1, page_alignment_verified: true, signature_sha256: sha("9"), certificate_sha256: sha("a") } },
    device: { identity_sha256: sha("b"), abi: "arm64-v8a", installed_apk_sha256: sha("8"), settings_sha256: sha("c"), restoration_sha256: sha("d") }, configuration: { id: "AP-SL-C390-P-F100" },
  };
}

function invoke(root, script, args, extra = {}) {
  const bins = path.join(root, "artifacts", "fake-bin"); mkdirSync(bins, { recursive: true });
  for (const command of ["adb", "maestro"]) writeFileSync(path.join(bins, command), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(project, "scripts/testing/v12-phase20-blackbox/fake-device-tool.mjs"))} --tool ${command} \"$@\"\n`, { mode: 0o755 });
  return spawnSync(process.execPath, [path.join(project, script), ...args], {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...extra, PATH: `${bins}:${process.env.PATH}`, NODE_ENV: "test", V12_NATIVE_ADAPTER_TEST_MODE: "phase20-native-adapter-subprocess", V12_NATIVE_ADAPTER_TEST_PROCESS: "1", V12_NATIVE_ADAPTER_COMMAND: path.join(project, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs"), V12_NATIVE_ADAPTER_BATCH: "1", V12_DEVICE_SERIAL: "fake-device-20" },
  });
}

function pass(root, script, args, extra) {
  const result = invoke(root, script, args, extra);
  assert.equal(result.status, 0, `${script} ${args.join(" ")}\n${result.stderr}\n${result.stdout}`);
  return result;
}

function completion(root, shard) {
  // Interface assumption for WR-01's publisher integration: publication is
  // the completed-manifest directory, staging is never observable as success.
  const file = path.join(root, "artifacts/native/v1.2", run, "publication", `${shard}.json`);
  assert.equal(lstatSync(file).isSymbolicLink(), false, `${shard} manifest must not be a symlink`);
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(manifest.run_id, run); assert.equal(manifest.shard, shard); assert.equal(manifest.completed, true);
  assert.ok(Array.isArray(manifest.members) && manifest.members.length > 0);
  assert.equal(existsSync(path.join(root, "artifacts/native/v1.2", run, ".staging")), false, `${shard} left staging behind`);
  return manifest;
}

function attendedIdentity(root) {
  const manifest = JSON.parse(readFileSync(path.join(root, "artifacts/native/v1.2", run, "build.json"), "utf8"));
  return {
    run_id: run, source_tree_sha256: manifest.source.tree_sha256, apk_sha256: manifest.build.apk.sha256,
    apk_signature_sha256: manifest.build.apk.signature_sha256, installed_apk_sha256: manifest.device.installed_apk_sha256,
    config_sha256: createHash("sha256").update(manifest.configuration.id).digest("hex"),
    device: { device_sha256: manifest.device.identity_sha256, model: "SM-S916B" },
  };
}

function attendedObservations(root) {
  return {
    schema_version: 2,
    suite: "v12-samsung-attended-observations",
    identity: attendedIdentity(root),
    settings_restored: true,
    rows: Array.from({ length: 7 }, (_, index) => {
      const image = new PNG({ width: 1, height: 1 }); image.data.set([index + 1, 0, 0, 255]);
      const bytes = PNG.sync.write(image); const id = `S20-0${index + 1}`;
      const relative = `artifacts/native/v1.2/${run}/attended/${id}.png`;
      const absolute = path.join(root, relative); mkdirSync(path.dirname(absolute), { recursive: true }); writeFileSync(absolute, bytes);
      return { id, status: "passed", png: { path: relative, sha256: createHash("sha256").update(bytes).digest("hex"), size_bytes: bytes.length, width: 1, height: 1 } };
    }),
  };
}

test("Phase 20 fake-device pipeline publishes a sealed, re-readable 172-row contract", (t) => {
  const root = fixtureRoot(); t.after(() => rmSync(root, { recursive: true, force: true }));
  // Every call below is the documented CLI order. The test intentionally does
  // not call exported production functions or manufacture final evidence.
  for (const script of ["scripts/v12-sqlite-shard.mjs", "scripts/v12-recovery-shard.mjs"]) for (const mode of ["--execute", "--verify"]) pass(root, script, ["--run", run, mode]);
  for (const script of ["scripts/v12-garmin-shard.mjs", "scripts/v12-calendar-shard.mjs"]) for (const mode of ["--execute", "--verify"]) pass(root, script, ["--run", run, mode]);
  for (const shard of ["multi-plan", "workout", "library-running"]) pass(root, "scripts/run-v12-maestro.mjs", ["--run", run, "--shard", shard]);
  for (const [script, execute, shard] of [["scripts/capture-v12-visual.mjs", "--all", "visual"], ["scripts/compare-v12-visual.mjs", "--all", "comparison"], ["scripts/v12-accessibility-shard.mjs", "--execute", "accessibility"], ["scripts/v12-performance-shard.mjs", "--execute", "performance"]]) {
    pass(root, script, ["--run", run, execute]); completion(root, shard); pass(root, script, ["--run", run, execute === "--all" ? "--verify" : "--verify"]);
  }
  for (const shard of ["sqlite", "recovery", "garmin", "calendar", "multi-plan", "workout", "library-running", "visual", "comparison", "accessibility", "performance"]) completion(root, shard);
  pass(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "shards-only", "--ids", "multi-plan,workout,library-running"]);
  pass(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "preseal", "--no-final-write"]);
  const checklist = path.join(root, "checklist.json"); const observations = path.join(root, "observations.json"); const record = path.join(root, "artifacts/native/v1.2", run, "attended-observations.json");
  writeFileSync(path.join(root, "identity.json"), JSON.stringify(attendedIdentity(root)));
  pass(root, "scripts/generate-v12-attended-checklist.mjs", ["prepare", "--identity", "identity.json", "--output", "checklist.json"]);
  writeFileSync(observations, JSON.stringify(attendedObservations(root)));
  pass(root, "scripts/generate-v12-attended-checklist.mjs", ["record", "--checklist", checklist, "--observations", observations, "--output", record]);
  pass(root, "scripts/generate-v12-attended-checklist.mjs", ["verify", "--checklist", checklist, "--observations", observations]);
  pass(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "final"]);
  const finalEvidence = JSON.parse(readFileSync(path.join(root, "artifacts/native/v1.2", run, "final-evidence.json"), "utf8"));
  assert.equal(finalEvidence.rows.length, 172); assert.equal(finalEvidence.release_authorized, false);
  assert.equal(finalEvidence.rows.some(({ verdict }) => ["FAIL", "NOT_RUN", "REVIEW_REQUIRED"].includes(verdict)), false);
  pass(root, "scripts/generate-v12-parity-report.mjs", ["--final-evidence", `artifacts/native/v1.2/${run}/final-evidence.json`]);
  assert.match(readFileSync(path.join(root, "artifacts/native/v1.2", run, "parity-report.md"), "utf8"), /Rows: 172/u);
  assert.equal(JSON.parse(readFileSync(path.join(root, ".planning/phases/20-native-acceptance/20-READINESS-HANDOFF.md"), "utf8")).release_authorized, false);
});

test("Phase 20 subprocesses fail closed without leaking device identity or publishing partial staging", (t) => {
  const root = fixtureRoot(); t.after(() => rmSync(root, { recursive: true, force: true }));
  const failed = invoke(root, "scripts/v12-calendar-shard.mjs", ["--run", run, "--execute"], { V12_FAKE_DEVICE_FAIL: "calendar" });
  assert.notEqual(failed.status, 0); assert.doesNotMatch(String(failed.stdout) + String(failed.stderr), new RegExp("fake-device-20|serial|/Users/", "iu"));
  const failure = path.join(root, "artifacts/native/v1.2", run, "failures", "calendar.json"); assert.ok(existsSync(failure));
  assert.equal(existsSync(path.join(root, "artifacts/native/v1.2", run, ".staging")), false);
  for (const mutation of ["stale-source", "stale-apk", "stale-device", "private-serial"]) {
    const result = invoke(root, "scripts/v12-garmin-shard.mjs", ["--run", run, "--execute"], { V12_FAKE_DEVICE_MUTATION: mutation });
    assert.notEqual(result.status, 0, mutation); assert.doesNotMatch(String(result.stdout) + String(result.stderr), /fake-device-20|secret|token/iu);
  }
  const escape = path.join(root, "escape"); writeFileSync(escape, "outside");
  symlinkSync(escape, path.join(root, "artifacts/native/v1.2", run, "screenshots"));
  const traversal = invoke(root, "scripts/capture-v12-visual.mjs", ["--run", run, "--all"]);
  assert.notEqual(traversal.status, 0); assert.match(String(traversal.stdout) + String(traversal.stderr), /symlink|path|unsafe|invalid|failed/iu);
  const preseal = invoke(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "preseal", "--no-final-write"]);
  assert.notEqual(preseal.status, 0, "partial staging/failure runs cannot preseal");
});

test("final CLI never lets exceptions promote FAIL, NOT_RUN, or REVIEW_REQUIRED to readiness", (t) => {
  const root = fixtureRoot(); t.after(() => rmSync(root, { recursive: true, force: true }));
  // The full fixture producer selects no blocking results. These modes force
  // one source result and must leave the run NOT_READY despite an exception.
  for (const state of ["FAIL", "NOT_RUN", "REVIEW_REQUIRED"]) {
    const result = invoke(root, "scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "final"], { V12_FAKE_EVIDENCE_RESULT: state, V12_FAKE_EXCEPTION: "1" });
    assert.notEqual(result.status, 0, state + " with exception must be rejected before sealing");
    assert.equal(existsSync(path.join(root, "artifacts/native/v1.2", run, "final-evidence.json")), false);
  }
});
