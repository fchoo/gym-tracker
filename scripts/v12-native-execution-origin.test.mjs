import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertV12GitExecutionAttestation,
  createV12NativeExecutionOriginAttestation,
  readV12RetainedGitExecution,
  resolveV12GitExecution,
  resolveV12NativeExecutionTools,
  V12_TEST_EXECUTION_ORIGIN,
} from "./v12-native-execution-origin.mjs";

function executable(root, name) {
  const file = path.join(root, name);
  writeFileSync(file, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return file;
}

test("production tool resolution ignores PATH binaries and requires an absolute SDK", () => {
  const fake = mkdtempSync(path.join(tmpdir(), "v12-path-fake-"));
  executable(fake, "adb");
  assert.throws(() => resolveV12NativeExecutionTools({
    env: { PATH: fake, ANDROID_HOME: path.join(fake, "missing-sdk") },
  }), /v12_production_native_launcher_android_sdk_missing/u);
});

test("controlled tools require explicit test origin and absolute executable paths", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-test-tools-"));
  mkdirSync(root, { recursive: true });
  const env = {
    V12_EXECUTION_ORIGIN: V12_TEST_EXECUTION_ORIGIN,
    V12_ADB_PATH: executable(root, "adb"),
    V12_MAESTRO_PATH: executable(root, "maestro"),
    V12_UNZIP_PATH: executable(root, "unzip"),
    V12_JAVA_PATH: executable(root, "java"),
    V12_APKSIGNER_PATH: executable(root, "apksigner"),
  };
  const tools = resolveV12NativeExecutionTools({ requiredTools: ["adb", "maestro", "java", "unzip", "apksigner"], env });
  assert.equal(tools.execution_origin, V12_TEST_EXECUTION_ORIGIN);
  assert.equal(tools.test_only, true);
  assert.deepEqual(Object.keys(tools), ["execution_origin", "test_only", "adb", "maestro", "java", "unzip", "apksigner"]);
  assert.ok(["adb", "maestro", "java", "unzip", "apksigner"].every((name) => tools[name] === realpathSync(env[`V12_${name.toUpperCase()}_PATH`])));
  const origin = createV12NativeExecutionOriginAttestation({
    action: "recovery",
    executionTools: Object.freeze({
      execution_origin: tools.execution_origin,
      test_only: tools.test_only,
      adb: tools.adb,
      maestro: tools.maestro,
      unzip: tools.unzip,
    }),
  });
  assert.deepEqual(Object.keys(origin), ["schema_version", "action", "execution_origin", "test_only", "tools"]);
  assert.deepEqual(origin.tools.map(({ name }) => name), ["adb", "maestro", "unzip"]);
  for (const descriptor of origin.tools) {
    assert.deepEqual(Object.keys(descriptor), ["name", "executable_realpath_sha256", "executable_sha256", "version"]);
    assert.equal(descriptor.executable_realpath_sha256, createHash("sha256").update(tools[descriptor.name]).digest("hex"));
    assert.match(descriptor.executable_sha256, /^[a-f0-9]{64}$/u);
    assert.equal(descriptor.version, "test-controlled");
  }
  assert.doesNotMatch(JSON.stringify(origin), new RegExp(root.replaceAll("/", "\\/"), "u"));
  assert.throws(() => resolveV12NativeExecutionTools({
    requiredTools: ["adb", "maestro", "java", "unzip", "apksigner"],
    env: { ...env, V12_EXECUTION_ORIGIN: undefined },
  }), /v12_production_native_launcher_execution_origin_invalid/u);
  assert.throws(() => resolveV12NativeExecutionTools({
    requiredTools: ["adb", "maestro", "java", "unzip", "apksigner"],
    env: { ...env, V12_ADB_PATH: "relative-adb" },
  }), /v12_production_native_launcher_test_toolchain_invalid/u);
});

test("tool requirements reject unknown names instead of consulting PATH", () => {
  assert.throws(() => resolveV12NativeExecutionTools({
    requiredTools: ["adb", "shell-from-path"],
    env: { PATH: "/private/untrusted" },
  }), /v12_production_native_launcher_tool_requirement_invalid/u);
});

test("Git resolution ignores poisoned PATH and records realpath, bytes, and live version", () => {
  const poison = mkdtempSync(path.join(tmpdir(), "v12-git-poison-"));
  const poisonedGit = executable(poison, "git");
  const execution = resolveV12GitExecution({ env: { PATH: poison } });

  assert.notEqual(execution.executable, realpathSync(poisonedGit));
  assert.equal(execution.attestation.action, "source-control");
  assert.equal(execution.attestation.execution_origin, "production-attested/v1");
  assert.equal(execution.attestation.test_only, false);
  assert.deepEqual(execution.attestation.tools.map(({ name }) => name), ["git"]);
  assert.match(execution.attestation.tools[0].executable_realpath_sha256, /^[a-f0-9]{64}$/u);
  assert.match(execution.attestation.tools[0].executable_sha256, /^[a-f0-9]{64}$/u);
  assert.match(execution.attestation.tools[0].version, /^git version /u);
  assert.equal(assertV12GitExecutionAttestation(execution.attestation, { execution }), true);
});

test("controlled Git requires explicit test origin and still records its live version", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-git-controlled-"));
  const controlledGit = path.join(root, "git");
  writeFileSync(controlledGit, "#!/bin/sh\nprintf 'git version controlled-1.0\\n'\n", { mode: 0o755 });
  const env = { PATH: root, V12_EXECUTION_ORIGIN: V12_TEST_EXECUTION_ORIGIN, V12_GIT_PATH: controlledGit };
  const execution = resolveV12GitExecution({ env });

  assert.equal(execution.executable, realpathSync(controlledGit));
  assert.equal(execution.attestation.execution_origin, V12_TEST_EXECUTION_ORIGIN);
  assert.equal(execution.attestation.test_only, true);
  assert.equal(execution.attestation.tools[0].version, "git version controlled-1.0");
  assert.throws(
    () => resolveV12GitExecution({ env: { PATH: root, V12_GIT_PATH: controlledGit } }),
    /v12_production_native_launcher_execution_origin_invalid/u,
  );
  assert.throws(
    () => assertV12GitExecutionAttestation({ ...execution.attestation, tools: [{ ...execution.attestation.tools[0], executable_sha256: "0".repeat(64) }] }, { execution }),
    /v12_production_native_launcher_git_attestation_invalid/u,
  );
});

test("retained Git execution is hash-bound to the build and run identities", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-git-retained-"));
  const tools = path.join(root, "tools");
  mkdirSync(tools, { recursive: true });
  const controlledGit = path.join(tools, "git");
  writeFileSync(controlledGit, "#!/bin/sh\nprintf 'git version retained-1.0\\n'\n", { mode: 0o755 });
  const env = { V12_EXECUTION_ORIGIN: V12_TEST_EXECUTION_ORIGIN, V12_GIT_PATH: controlledGit };
  const execution = resolveV12GitExecution({ env });
  const relative = "artifacts/native/v1.2-acceptance/git-execution-origin.json";
  const bytes = Buffer.from(`${JSON.stringify(execution.attestation)}\n`);
  mkdirSync(path.join(root, "artifacts/native/v1.2-acceptance"), { recursive: true });
  writeFileSync(path.join(root, relative), bytes);
  const runManifest = { source: { head: "a".repeat(40), tree_sha256: "b".repeat(64) }, build: { apk: { sha256: "c".repeat(64) } } };
  writeFileSync(path.join(root, "artifacts/native/v1.2-acceptance/build.json"), JSON.stringify({
    base_head: runManifest.source.head,
    source_tree_sha256: runManifest.source.tree_sha256,
    apk: { sha256: runManifest.build.apk.sha256 },
    v12_evidence_identity: { git_attestation: { path: relative, sha256: createHash("sha256").update(bytes).digest("hex") } },
  }));

  const retained = readV12RetainedGitExecution({ root, runManifest, env });
  assert.deepEqual(retained.attestation, execution.attestation);
  assert.equal(retained.executable, execution.executable);
  assert.throws(
    () => readV12RetainedGitExecution({ root, runManifest: { ...runManifest, source: { ...runManifest.source, head: "d".repeat(40) } }, env }),
    /git_attestation_invalid/u,
  );
});
