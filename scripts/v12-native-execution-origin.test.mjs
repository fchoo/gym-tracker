import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createV12NativeExecutionOriginAttestation,
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
