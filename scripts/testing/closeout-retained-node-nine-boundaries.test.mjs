import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import {
  assertV12GitExecutionAttestation, createV12NativeExecutionOriginAttestation,
  readV12RetainedGitExecution, resolveV12GitExecution, resolveV12NativeExecutionTools,
  V12_RETAINED_GIT_ATTESTATION_PATH,
} from "../v12-native-execution-origin.mjs";
import { createV12RunManifest } from "../create-v12-run-manifest.mjs";
import { executeV12SqliteShardCli, validateV12SqliteShard, V12_SQLITE_SHARD_CASE_IDS } from "../v12-sqlite-shard.mjs";
import { sourceTreeSha256 } from "../source-tree-digest.mjs";
import { createCloseoutRetainedNodeFixture } from "./closeout-retained-node-fixture.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
function scratch(t, label) {
  const storage = process.env.CLOSEOUT_RETAINED_NODE_WITNESS_DIRECTORY;
  assert.ok(path.isAbsolute(storage));
  fs.mkdirSync(storage, { recursive: true });
  const root = fs.mkdtempSync(path.join(storage, label + "-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function executable(root, name) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return file;
}
function restoreBuiltins(t) {
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

test("native tool resolution rejects conflicting SDK roots and non-executable tool objects", t => {
  const root = scratch(t, "origin-sdk");
  const sdk = path.join(root, "sdk");
  const other = path.join(root, "other");
  fs.mkdirSync(sdk); fs.mkdirSync(other);
  const adb = executable(sdk, "platform-tools/adb");
  const signer = executable(sdk, "build-tools/36.0.0/apksigner");
  const java = executable(sdk, "bin/java");
  const env = { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
  assert.equal(resolveV12NativeExecutionTools({ env }).adb, fs.realpathSync(adb));
  assert.equal(resolveV12NativeExecutionTools({ env: { ANDROID_SDK_ROOT: sdk } }).adb, fs.realpathSync(adb));
  for (const invalid of [
    { ANDROID_HOME: "relative", ANDROID_SDK_ROOT: sdk },
    { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: "relative" },
    { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: other },
    { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: path.join(root, "missing") },
    { ANDROID_HOME: "relative" },
  ]) assert.throws(() => resolveV12NativeExecutionTools({ env: invalid }), /android_sdk_invalid/);
  for (const names of [[], ["adb", "adb"], "adb", ["unknown"]]) {
    assert.throws(() => resolveV12NativeExecutionTools({ requiredTools: names, env }), /tool_requirement_invalid/);
  }
  const originEnv = { V12_EXECUTION_ORIGIN: "test-controlled/v1", V12_ADB_PATH: sdk };
  assert.throws(() => resolveV12NativeExecutionTools({ env: originEnv }), /test_toolchain_invalid/);
  fs.chmodSync(adb, 0o644);
  assert.throws(() => resolveV12NativeExecutionTools({ env }), /adb_missing/);
  fs.chmodSync(adb, 0o755);
  fs.unlinkSync(signer);
  assert.throws(() => resolveV12NativeExecutionTools({ requiredTools: ["apksigner"], env }), /apksigner_missing/);
  assert.equal(resolveV12NativeExecutionTools({ requiredTools: ["java"], env: { JAVA_HOME: sdk } }).java, fs.realpathSync(java));
  assert.equal(resolveV12NativeExecutionTools({ requiredTools: ["java"], env: {} }).java, fs.realpathSync("/usr/bin/java"));
  const git = resolveV12NativeExecutionTools({ requiredTools: ["git"], env: {} });
  assert.equal(git.git, fs.realpathSync("/usr/bin/git"));
});

test("tool attestations require the exact action tool set and a bounded successful version", t => {
  const root = scratch(t, "origin-attestation");
  const tools = { execution_origin: "production-attested/v1", test_only: false, adb: executable(root, "adb") };
  const good = { status: 0, stdout: "\n  adb version fixture-1.0  \n", stderr: "" };
  let calls = 0;
  const attestation = createV12NativeExecutionOriginAttestation({ action: "sqlite", executionTools: tools,
    runCommand: (file, args, options) => {
      calls++; assert.equal(file, tools.adb); assert.deepEqual(args, ["version"]); assert.equal(options.timeout, 10000);
      return good;
    } });
  assert.equal(calls, 1);
  assert.equal(attestation.tools[0].version, "adb version fixture-1.0");
  assert.equal(attestation.tools[0].executable_sha256, hash(fs.readFileSync(tools.adb)));
  assert.equal(attestation.tools[0].executable_realpath_sha256, hash(fs.realpathSync(tools.adb)));
  const stderrOnly = createV12NativeExecutionOriginAttestation({ action: "sqlite", executionTools: tools,
    runCommand: () => ({ status: 0, stderr: "stderr version" }) });
  assert.equal(stderrOnly.tools[0].version, "stderr version");
  for (const invalid of [undefined, null, { status: 1 }, { ...good, error: new Error("launch") },
    { ...good, signal: "SIGTERM" }, { status: 0 }, { ...good, stdout: " " },
    { ...good, stdout: "x".repeat(513) }, { ...good, stdout: "version\u0000secret" }]) {
    assert.throws(() => createV12NativeExecutionOriginAttestation({ action: "sqlite", executionTools: tools,
      runCommand: () => invalid }), /tool_version_invalid/);
  }
  for (const invalid of [null, {}, { ...tools, test_only: true }, { ...tools, execution_origin: "forged" },
    { ...tools, adb: 1 }, { ...tools, git: "/usr/bin/git" }]) {
    assert.throws(() => createV12NativeExecutionOriginAttestation({ action: "sqlite", executionTools: invalid }), /execution_origin_invalid/);
  }
  assert.throws(() => createV12NativeExecutionOriginAttestation({ action: "unknown", executionTools: tools }), /tool_requirement_invalid/);
  const gitExecution = resolveV12GitExecution({ env: {}, runCommand: () => ({ status: 0, stdout: "git version fixture" }) });
  assert.equal(assertV12GitExecutionAttestation(gitExecution.attestation, {
    env: {}, runCommand: () => ({ status: 0, stdout: "git version fixture" }) }), true);
  assert.throws(() => assertV12GitExecutionAttestation({ ...gitExecution.attestation, test_only: true }, { execution: gitExecution }), /git_attestation_invalid/);
});

test("retained Git rejects missing, malformed, symlinked and byte-mismatched bindings", t => {
  const root = scratch(t, "retained-git");
  const tool = executable(root, "git");
  const env = { V12_EXECUTION_ORIGIN: "test-controlled/v1", V12_GIT_PATH: tool };
  const runCommand = () => ({ status: 0, stdout: "git version retained-fixture" });
  const execution = resolveV12GitExecution({ env, runCommand });
  const directory = path.join(root, "artifacts/native/v1.2-acceptance");
  const buildPath = path.join(directory, "build.json");
  const receiptPath = path.join(root, V12_RETAINED_GIT_ATTESTATION_PATH);
  const bytes = Buffer.from(JSON.stringify(execution.attestation));
  const manifest = { source: { head: "a".repeat(40), tree_sha256: "b".repeat(64) }, build: { apk: { sha256: "c".repeat(64) } } };
  const build = { base_head: manifest.source.head, source_tree_sha256: manifest.source.tree_sha256, apk: manifest.build.apk,
    v12_evidence_identity: { git_attestation: { path: V12_RETAINED_GIT_ATTESTATION_PATH, sha256: hash(bytes) } } };
  const read = (extra = {}) => readV12RetainedGitExecution({ root, env, runCommand, ...extra });
  assert.throws(read, /git_attestation_invalid/);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(buildPath, "{"); assert.throws(read, /git_attestation_invalid/);
  for (const invalid of [{}, { ...build, v12_evidence_identity: { git_attestation: { path: "wrong", sha256: hash(bytes) } } },
    { ...build, v12_evidence_identity: { git_attestation: { path: V12_RETAINED_GIT_ATTESTATION_PATH, sha256: 1 } } }]) {
    fs.writeFileSync(buildPath, JSON.stringify(invalid)); assert.throws(read, /git_attestation_invalid/);
  }
  fs.writeFileSync(buildPath, JSON.stringify(build));
  fs.writeFileSync(receiptPath, bytes);
  assert.deepEqual(read({ runManifest: manifest }).attestation, execution.attestation);
  assert.equal(read().retained_sha256, hash(bytes));
  for (const invalid of [{ ...manifest, source: {} }, { ...manifest, source: { ...manifest.source, tree_sha256: "d".repeat(64) } },
    { ...manifest, build: { apk: { sha256: "e".repeat(64) } } }]) assert.throws(() => read({ runManifest: invalid }), /git_attestation_invalid/);
  fs.writeFileSync(receiptPath, "tampered"); assert.throws(read, /git_attestation_invalid/);
  fs.writeFileSync(receiptPath, "{");
  fs.writeFileSync(buildPath, JSON.stringify({ ...build, v12_evidence_identity: { git_attestation: { path: V12_RETAINED_GIT_ATTESTATION_PATH, sha256: hash("{") } } }));
  assert.throws(read, /git_attestation_invalid/);
  fs.unlinkSync(receiptPath); fs.mkdirSync(receiptPath); assert.throws(read, /git_attestation_invalid/);
  fs.rmdirSync(receiptPath); fs.symlinkSync(tool, receiptPath); assert.throws(read, /git_attestation_invalid/);
});

test("the real Git CLI returns an attestation and rejects extra or unknown arguments", t => {
  const subject = "scripts/v12-native-execution-origin.mjs";
  const execute = args => spawnSync(process.execPath, [subject, ...args], { encoding: "utf8", env: process.env });
  const git = execute(["--git-path"]); assert.equal(git.status, 0, git.stderr); assert.equal(git.stdout.trim(), fs.realpathSync("/usr/bin/git"));
  const attestation = execute(["--git-attestation"]); assert.equal(attestation.status, 0, attestation.stderr);
  assert.match(JSON.parse(attestation.stdout).tools[0].version, /^git version /);
  for (const args of [[], ["--unknown"], ["--git-path", "extra"]]) {
    const result = execute(args); assert.equal(result.status, 1); assert.match(result.stderr, /arguments_invalid/); assert.equal(result.stdout, "");
  }
});

function controlledFixture(t) {
  const directory = path.join(process.env.CLOSEOUT_RETAINED_NODE_WITNESS_DIRECTORY, "sqlite-cli-" + Math.random().toString(16).slice(2));
  const runner = createCloseoutRetainedNodeFixture({ artifactDirectory: directory });
  t.after(runner.cleanup);
  const base = runner.build;
  const apkPath = "artifacts/native/v1.2-acceptance/app.apk";
  const apk = fs.readFileSync(path.join(runner.scratch, "fixture.apk"));
  fs.mkdirSync(path.dirname(path.join(runner.root, apkPath)), { recursive: true });
  fs.writeFileSync(path.join(runner.root, apkPath), apk);
  const digest = "a".repeat(64);
  const manifest = createV12RunManifest({ input: {
    created_at: "2026-10-15T00:00:00Z", requested_run_id: base.run_id,
    source: { ...base.source, dirty: false, package_json_sha256: digest, package_lock_sha256: digest },
    fixtures: base.fixtures,
    build: { ...base.build, version_name: "1.2.0", version_code: 1, apk: { ...base.build.apk, path: apkPath,
      size_bytes: apk.length, page_alignment_verified: true, certificate_sha256: digest } },
    device: { ...base.device, abi: "arm64-v8a", settings_sha256: digest, restoration_sha256: digest },
    planning: { matrix_sha256: digest, requirements_sha256: digest, source_manifest_sha256: digest, owner_brief_sha256: digest, ui_spec_sha256: digest, deviations_sha256: digest },
    prototype: { revision: 18, approval_sha256: digest, html_sha256: digest }, configuration: { id: "AP-L-C390-P-F100" },
  } });
  assert.equal(sourceTreeSha256(runner.root), manifest.source.tree_sha256);
  fs.writeFileSync(runner.manifestPath, JSON.stringify(manifest));
  return { ...runner, manifest };
}

function sqliteInput(manifest) {
  const digest = "a".repeat(64);
  return { schema_version: 1, producer: "v12-sqlite-shard",
    identity: { source_digest: manifest.source.tree_sha256, fixture_digest: manifest.fixtures.registry_sha256,
      apk_digest: manifest.build.apk.sha256, installed_apk_digest: manifest.device.installed_apk_sha256, device_digest: manifest.device.identity_sha256 },
    cases: V12_SQLITE_SHARD_CASE_IDS.map((id, order) => ({ id, order, status: "passed",
      digests: { pre: digest, post: digest, reopen: digest, rebuild: digest },
      source_facts: [{ registry: "sqlite-kernel", cases: [{ id: "source-case", status: "passed" }] }] })),
  };
}

test("SQLite source facts reject duplicates, empty registries and invalid nested status before publication", t => {
  const runner = controlledFixture(t);
  const original = sqliteInput(runner.manifest);
  assert.equal(validateV12SqliteShard(original).ok, true);
  for (const mutate of [
    value => { value.cases[0].source_facts.push(structuredClone(value.cases[0].source_facts[0])); },
    value => { value.cases[0].source_facts[0].cases.push(structuredClone(value.cases[0].source_facts[0].cases[0])); },
    value => { value.cases[0].source_facts[0].cases[0].status = "failed"; },
    value => { value.cases[0].source_facts.push({ registry: "empty", cases: [] }); },
    value => { value.cases[0].source_facts.push(null); },
    value => { value.cases[0].source_facts[0].cases = {}; },
    value => { value.cases[0].source_facts[0].cases[0].id = "Bearer fixture"; },
  ]) {
    const value = structuredClone(original); mutate(value);
    assert.throws(() => validateV12SqliteShard(value), /v12_sqlite_(case_invalid|private_value)/);
  }
});

test("the real SQLite CLI publishes all ten source facts and verifies the atomic observation bytes", t => {
  const runner = controlledFixture(t);
  const args = ["--run", runner.manifest.run_id];
  const executed = runner.runCopiedCli("scripts/v12-sqlite-shard.mjs", [...args, "--execute", "--device", "controlled-device-20"]);
  assert.equal(executed.status, 0, executed.stderr);
  const result = JSON.parse(executed.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.observations.migration.cases + result.observations.portability.cases + result.observations.history.cases, 10);
  const verified = runner.runCopiedCli("scripts/v12-sqlite-shard.mjs", [...args, "--verify"]);
  assert.equal(verified.status, 0, verified.stderr);
  assert.deepEqual(JSON.parse(verified.stdout), { ok: true, mode: "verify", run_id: runner.manifest.run_id });
  const repeated = runner.runCopiedCli("scripts/v12-sqlite-shard.mjs", [...args, "--execute"]);
  assert.equal(repeated.status, 1);
  assert.match(repeated.stderr, /v12_sqlite_output_exists/);
});

test("SQLite verification rejects observation shape, recomputed fact hashes and each immutable identity mismatch", async t => {
  const runner = controlledFixture(t);
  const manifest = runner.manifest;
  await executeV12SqliteShardCli(["--run", manifest.run_id, "--execute"], { root: runner.root,
    sourceDigest: manifest.source.tree_sha256, executeNative: async () => ({ status: "passed", contract: runner.contract }) });
  const migration = path.join(runner.root, `artifacts/native/v1.2/${manifest.run_id}/sqlite/migration.json`);
  const bytes = fs.readFileSync(migration);
  const original = JSON.parse(bytes);
  const verify = () => executeV12SqliteShardCli(["--run", manifest.run_id, "--verify"], { root: runner.root });
  assert.equal((await verify()).ok, true);
  for (const mutate of [
    value => { value.all_passed = false; }, value => { value.case_facts[0].status = "failed"; },
    value => { value.case_facts[0].source_facts = []; }, value => { value.case_facts[0].digest = "bad"; },
    value => { value.digest = "b".repeat(64); },
    ...["source_digest", "fixture_digest", "apk_digest", "installed_apk_digest", "device_digest"].map(key => value => {
      value.identity[key] = "d".repeat(64);
      if (key === "apk_digest" || key === "installed_apk_digest") { value.identity.apk_digest = value.identity.installed_apk_digest = "d".repeat(64); }
    }),
    value => { value.verdict = "PASS"; },
  ]) {
    const value = structuredClone(original); mutate(value); fs.writeFileSync(migration, JSON.stringify(value));
    await assert.rejects(verify, /verify_migration_invalid/);
  }
  fs.writeFileSync(migration, bytes);
  fs.unlinkSync(migration);
  await assert.rejects(verify, /output_missing/);
  const failed = await assert.rejects(() => executeV12SqliteShardCli(["--run", manifest.run_id, "--execute"], {
    root: scratch(t, "sqlite-malformed"), readBuild: () => manifest, sourceDigest: manifest.source.tree_sha256,
    executeNative: async () => ({ status: "failed" }) }), /malformed_result/);
});

test("production default roots resolve the declared domain tools and reject a forged Git origin", t => {
  const root = scratch(t, "origin-default-roots");
  const sdk = path.join(root, "sdk");
  const adb = executable(sdk, "platform-tools/adb");
  const maestro = executable(root, ".local/bin/maestro");
  const realpath = fs.realpathSync;
  t.mock.method(fs, "realpathSync", (candidate, ...args) => candidate === "/opt/homebrew/share/android-commandlinetools" ? sdk : realpath(candidate, ...args));
  t.mock.method(os, "homedir", () => root);
  syncBuiltinESMExports(); restoreBuiltins(t);
  const tools = resolveV12NativeExecutionTools({ domain: true, env: {} });
  assert.deepEqual(Object.keys(tools), ["execution_origin", "test_only", "adb", "maestro", "unzip"]);
  assert.equal(tools.adb, realpath(adb)); assert.equal(tools.maestro, realpath(maestro));
  assert.equal(tools.unzip, realpath("/usr/bin/unzip")); assert.equal(tools.test_only, false);
  assert.throws(() => resolveV12GitExecution({ env: { V12_EXECUTION_ORIGIN: "forged" } }), /execution_origin_invalid/);
});

test("Git CLI sanitizes a transport that throws a non-Error value", t => {
  const root = scratch(t, "git-transport-fault");
  const preload = path.join(root, "transport-fault.mjs");
  fs.writeFileSync(preload, `import childProcess from "node:child_process";\nimport {syncBuiltinESMExports} from "node:module";\nchildProcess.spawnSync = () => { throw "bounded-transport-fixture"; };\nsyncBuiltinESMExports();\n`);
  const result = spawnSync(process.execPath, ["--import", preload, "scripts/v12-native-execution-origin.mjs", "--git-path"], { env: process.env, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "v12_production_native_launcher_failed\n");
});

test("SQLite default native execution selects the controlled device and writes the observed source contract", async t => {
  for (const deviceArgs of [[], ["--device", "controlled-device-20"]]) {
  const runner = controlledFixture(t);
  const updates = { ...runner.executionEnvironment, NODE_ENV: "production", V12_CONTROLLED_STATE: runner.scratch,
    V12_DEVICE_SERIAL: "controlled-device-20", NODE_TEST_CONTEXT: undefined };
  const prior = Object.fromEntries(Object.keys(updates).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(updates)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  try {
    const result = await executeV12SqliteShardCli(["--run", runner.manifest.run_id, "--execute", ...deviceArgs], { root: runner.root });
    assert.equal(result.ok, true);
    assert.equal(result.observations.history.cases, 2);
    assert.equal(result.observations.history.case_facts[0].source_facts[0].cases[0].id, "connection-configuration");
  } finally {
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
  }
});

test("SQLite CLI rejects invalid grammar and binds the loaded build to the requested immutable identity", async t => {
  const runner = controlledFixture(t);
  for (const args of [[], ["--run"], ["--run", "invalid", "--verify"], ["--run", runner.manifest.run_id, "--execute", "--unexpected"],
    ["--run", runner.manifest.run_id, "--execute", "--device", "bad\nserial"]]) {
    const result = runner.runCopiedCli("scripts/v12-sqlite-shard.mjs", args);
    assert.equal(result.status, 1); assert.match(result.stderr, /v12_sqlite_cli_invalid/);
  }
  await assert.rejects(() => executeV12SqliteShardCli(["--run", runner.manifest.run_id, "--execute"], {
    root: scratch(t, "sqlite-build-shape"), readBuild: () => ({}), sourceDigest: runner.manifest.source.tree_sha256 }), /build_invalid/);
  await assert.rejects(() => executeV12SqliteShardCli(["--run", runner.manifest.run_id, "--execute"], {
    root: scratch(t, "sqlite-build-identity"), readBuild: () => runner.manifest, sourceDigest: "f".repeat(64) }), /identity_mismatch/);
  fs.writeFileSync(path.join(runner.scratch, "native-marker.json"), JSON.stringify({ status: "failed", schemaVersion: 1 }));
  const failed = runner.runCopiedCli("scripts/v12-sqlite-shard.mjs", ["--run", runner.manifest.run_id, "--execute"]);
  assert.equal(failed.status, 1); assert.match(failed.stderr, /v12_sqlite_/);
  const receipt = JSON.parse(fs.readFileSync(path.join(runner.root, `artifacts/native/v1.2/${runner.manifest.run_id}/failures/sqlite.json`)));
  assert.equal(receipt.retry_allowed, false);
  assert.equal(receipt.privacy, "safe");
  assert.equal(fs.existsSync(path.join(runner.root, `artifacts/native/v1.2/${runner.manifest.run_id}/publication/sqlite.json`)), false);
});

test("SQLite rejects a mutable run argument before reading the build or creating output paths", async t => {
  const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
  let coercions = 0;
  const changedArgument = { toString: () => ++coercions === 1 ? runId : "invalid-after-coercion" };
  await assert.rejects(() => executeV12SqliteShardCli(["--run", changedArgument, "--execute"], {
    root: scratch(t, "sqlite-run-coercion"),
    readBuild: () => assert.fail("an invalid path must be rejected before reading a build"),
  }), /v12_sqlite_cli_invalid/);
});

test("SQLite CLI bounds a filesystem transport that throws a non-Error value", t => {
  const runner = controlledFixture(t);
  const preload = path.join(runner.artifactDirectory, "read-transport-fault.mjs");
  fs.writeFileSync(preload, `import fs from "node:fs";\nimport {syncBuiltinESMExports} from "node:module";\nconst read=fs.readFileSync; fs.readFileSync=(file,...args)=>{ if(String(file).endsWith("/build.json")) throw "bounded-read-fixture"; return read(file,...args); };\nsyncBuiltinESMExports();\n`);
  const result = runner.runCopiedCli("scripts/v12-sqlite-shard.mjs", ["--run", runner.manifest.run_id, "--execute"], { NODE_OPTIONS: "--import " + preload });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "v12_sqlite_cli_failed\n");
});
