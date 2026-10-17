import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
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
  };
  const tools = resolveV12NativeExecutionTools({ domain: true, env });
  assert.equal(tools.execution_origin, V12_TEST_EXECUTION_ORIGIN);
  assert.deepEqual(Object.keys(tools), ["execution_origin", "adb", "maestro", "unzip"]);
  assert.throws(() => resolveV12NativeExecutionTools({
    domain: true,
    env: { ...env, V12_EXECUTION_ORIGIN: undefined },
  }), /v12_production_native_launcher_execution_origin_invalid/u);
  assert.throws(() => resolveV12NativeExecutionTools({
    domain: true,
    env: { ...env, V12_ADB_PATH: "relative-adb" },
  }), /v12_production_native_launcher_test_toolchain_invalid/u);
});
