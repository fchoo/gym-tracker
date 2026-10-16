import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { createControlledRunner } from "./testing/v12-production-launcher/controlled-runner.mjs";
import {
  V12_CALENDAR_ADAPTER_TIMEOUT_MS,
  V12_NATIVE_ACTION_TIMEOUT_MS,
  V12_NATIVE_ADAPTER_GRACE_MS,
  V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
  V12_NATIVE_CLEANUP_BUDGET,
  V12_NATIVE_COMMAND_GRAPH,
  V12_NATIVE_LEASE_ACTION_BUDGETS,
  V12_NATIVE_MAX_REQUEST_BYTES,
  V12_NATIVE_MAX_RESPONSE_BYTES,
  V12_QUALITY_ACTION_BUDGETS,
  V12_QUALITY_COMMAND_GRAPH,
  V12_SQLITE_PRODUCER_BOUND_MS,
  V12_VISUAL_BATCH_PRODUCER_BOUND_MS,
  V12_VISUAL_CLEANUP_BUDGET,
  V12_VISUAL_COMMAND_GRAPH,
  V12_VISUAL_CAPTURE_PRODUCER_BOUND_MS,
  invokeV12NativeAdapterEnvelope,
  v12CommandPathMaxMs,
} from "./v12-native-adapter.mjs";

function fixture(t) {
  const runner = createControlledRunner();
  t.after(runner.cleanup);
  return runner;
}
function markers(root, extra = {}) {
  return { NODE_ENV: "test", V12_NATIVE_ADAPTER_TEST_MODE: "phase20-native-adapter-subprocess", V12_NATIVE_ADAPTER_TEST_PROCESS: "1", V12_NATIVE_ADAPTER_COMMAND: path.join(root, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs"), ...extra };
}

test("unset adapter command reaches the default launcher and a real exclusive lease protocol", (t) => {
  const runner = fixture(t);
  const lease = runner.success("acquire-lease");
  assert.match(lease.lease_id, /^[a-f0-9]{48}$/u);
  assert.equal(lease.native_execution, "EXECUTED");
  assert.notEqual(runner.invoke("acquire-lease").status, 0);
  assert.equal(runner.success("release-lease", { lease }), true);
});
test("checked-in fake accepted only by the explicit test triplet", (t) => {
  const runner = fixture(t);
  const result = runner.invoke("acquire-lease", {}, markers(runner.root));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { id: "lease" });
});
test("adapter envelope labels the checked-in fake as test-only provenance", (t) => {
  const runner = fixture(t);
  const prior = Object.fromEntries(["NODE_ENV", "V12_NATIVE_ADAPTER_TEST_MODE", "V12_NATIVE_ADAPTER_TEST_PROCESS"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { NODE_ENV: "test", V12_NATIVE_ADAPTER_TEST_MODE: "phase20-native-adapter-subprocess", V12_NATIVE_ADAPTER_TEST_PROCESS: "1" });
  try {
    const result = invokeV12NativeAdapterEnvelope("acquire-lease", { run_id: runner.build.run_id }, {
      root: runner.root,
      command: path.join(runner.root, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs"),
    });
    assert.deepEqual(Object.keys(result.execution_origin).sort(), [
      "adapter_source_sha256", "default_launcher", "kind", "launcher_source_sha256",
      "request_attestation_sha256", "schema_version", "test_only",
    ]);
    assert.equal(result.execution_origin.kind, "test-fixture");
    assert.equal(result.execution_origin.default_launcher, false);
    assert.equal(result.execution_origin.test_only, true);
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
test("fake command rejected outside explicit test mode", (t) => {
  const runner = fixture(t);
  const result = runner.invoke("acquire-lease", {}, { V12_NATIVE_ADAPTER_COMMAND: path.join(runner.root, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs") });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /command_override_forbidden/u);
});
for (const field of ["NODE_ENV", "V12_NATIVE_ADAPTER_TEST_MODE", "V12_NATIVE_ADAPTER_TEST_PROCESS"]) {
  test(`partial test triplet rejected with and without override: ${field}`, (t) => {
    const runner = fixture(t);
    const partial = markers(runner.root, { [field]: undefined });
    for (const command of [partial.V12_NATIVE_ADAPTER_COMMAND, undefined]) {
      const result = runner.invoke("acquire-lease", {}, { ...partial, V12_NATIVE_ADAPTER_COMMAND: command });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /test_mode_inconsistent/u);
    }
  });
}
for (const field of ["source", "apk", "device"]) test(`forged ${field} response attestation rejected`, (t) => {
  const runner = fixture(t);
  const result = runner.invoke("acquire-lease", {}, markers(runner.root, { V12_FAKE_DEVICE_FORGE_ATTESTATION: field }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /attestation_invalid/u);
});
test("production rejects test markers even when the fake override is unset", (t) => {
  const runner = fixture(t);
  const result = runner.invoke("acquire-lease", {}, markers(runner.root, { V12_NATIVE_ADAPTER_COMMAND: undefined }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /test_environment_forbidden/u);
});

test("direct launcher rejects extra attestation fields without reflecting private data", (t) => {
  const runner = fixture(t);
  const launcher = path.join(runner.root, "scripts/v12-production-native-adapter-launcher.mjs");
  const build = runner.build;
  const request = { schema_version: 1, action: "acquire-lease", payload: { run_id: build.run_id }, attestation: {
    schema_version: 1, action: "acquire-lease", launcher_source_sha256: createHash("sha256").update(readFileSync(launcher)).digest("hex"),
    run_id: build.run_id, build_profile: "development-test", suite: "v1.2-acceptance", package: build.build.package,
    source_tree_sha256: build.source.tree_sha256, apk_sha256: build.build.apk.sha256, installed_apk_sha256: build.device.installed_apk_sha256,
    apk_signature_sha256: build.build.apk.signature_sha256, device_identity_sha256: build.device.identity_sha256,
    private_value: "must-never-be-reflected",
  } };
  const result = spawnSync(process.execPath, [launcher, "--action", "acquire-lease"], { cwd: runner.root, input: JSON.stringify(request), encoding: "utf8", timeout: 5_000 });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "v12_production_native_launcher_attestation_invalid\n");
});

test("every adapter action has an explicit bounded timeout and transport budget", () => {
  assert.deepEqual(Object.keys(V12_NATIVE_ACTION_TIMEOUT_MS).sort(), [
    "accessibility", "acquire-lease", "calendar", "garmin", "performance", "recovery",
    "release-lease", "restore-settings", "snapshot-settings", "sqlite",
    "visual-capture", "visual-capture-batch", "visual-compare",
  ]);
  assert.ok(Object.values(V12_NATIVE_ACTION_TIMEOUT_MS).every((value) => Number.isSafeInteger(value) && value >= 1_000 && value <= 4 * 60 * 60_000));
  assert.equal(V12_NATIVE_COMMAND_GRAPH.acquire_lease.success.length, 5);
  assert.equal(V12_NATIVE_COMMAND_GRAPH.acquire_lease.failure_after_owner_read.length, 7);
  assert.equal(V12_NATIVE_LEASE_ACTION_BUDGETS["acquire-lease"].adb_call_count,
    V12_NATIVE_COMMAND_GRAPH.runtime_initialization.length + V12_NATIVE_COMMAND_GRAPH.acquire_lease.failure_after_owner_read.length);
  assert.equal(V12_NATIVE_LEASE_ACTION_BUDGETS["acquire-lease"].max_ms, 220_000);
  assert.equal(V12_VISUAL_COMMAND_GRAPH.device_verification.length, 7);
  assert.equal(V12_VISUAL_CLEANUP_BUDGET.reset_bound_ms, 60_100);
  assert.equal(V12_QUALITY_COMMAND_GRAPH.performance.length, 75);
  assert.equal(V12_QUALITY_COMMAND_GRAPH.accessibility.length, 76);
  for (const action of ["performance", "accessibility"]) {
    const budget = V12_QUALITY_ACTION_BUDGETS[action];
    assert.equal(budget.adb_call_count, V12_QUALITY_COMMAND_GRAPH[action].length);
    assert.equal(budget.adb_max_ms, v12CommandPathMaxMs(V12_QUALITY_COMMAND_GRAPH[action]));
    assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS[action], budget.max_ms + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS);
  }
  assert.ok(V12_NATIVE_ACTION_TIMEOUT_MS.performance > 45 * 60_000);
  assert.ok(V12_NATIVE_ACTION_TIMEOUT_MS.accessibility > 45 * 60_000 + 20_000);
  assert.equal(V12_NATIVE_ADAPTER_GRACE_MS, V12_NATIVE_CLEANUP_BUDGET.max_ms + V12_NATIVE_CLEANUP_BUDGET.exit_margin_ms);
  assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS["visual-capture"], V12_VISUAL_CAPTURE_PRODUCER_BOUND_MS + V12_NATIVE_ADAPTER_GRACE_MS);
  assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS["visual-capture-batch"], V12_VISUAL_BATCH_PRODUCER_BOUND_MS + V12_NATIVE_ADAPTER_GRACE_MS);
  assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS["visual-compare"], V12_VISUAL_BATCH_PRODUCER_BOUND_MS + V12_NATIVE_ADAPTER_GRACE_MS);
  assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS.sqlite, V12_SQLITE_PRODUCER_BOUND_MS + V12_NATIVE_ADAPTER_GRACE_MS);
  for (const [action, budget] of Object.entries(V12_NATIVE_LEASE_ACTION_BUDGETS)) {
    assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS[action], budget.max_ms + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS);
  }
  assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS.calendar, V12_CALENDAR_ADAPTER_TIMEOUT_MS);
  assert.ok(V12_NATIVE_ACTION_TIMEOUT_MS.recovery >= 45 * 60_000);
  assert.equal(V12_NATIVE_MAX_REQUEST_BYTES, 1024 * 1024);
  assert.equal(V12_NATIVE_MAX_RESPONSE_BYTES, 32 * 1024 * 1024);
});

test("outer adapter survives maximum producers and every restoration/release call", () => {
  const simulateCommands = (elapsed, path) => elapsed + v12CommandPathMaxMs(path);

  const sqliteFinallyCompletedAt = simulateCommands(V12_SQLITE_PRODUCER_BOUND_MS, V12_NATIVE_COMMAND_GRAPH.runtime_cleanup);
  assert.ok(V12_NATIVE_ACTION_TIMEOUT_MS.sqlite > sqliteFinallyCompletedAt);
  assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS.sqlite - sqliteFinallyCompletedAt, V12_NATIVE_CLEANUP_BUDGET.exit_margin_ms);

  for (const [action, producerMs] of [
    ["visual-capture", V12_VISUAL_CAPTURE_PRODUCER_BOUND_MS],
    ["visual-capture-batch", V12_VISUAL_BATCH_PRODUCER_BOUND_MS],
    ["visual-compare", V12_VISUAL_BATCH_PRODUCER_BOUND_MS],
  ]) {
    const finallyCompletedAt = simulateCommands(producerMs, V12_NATIVE_COMMAND_GRAPH.runtime_cleanup);
    assert.ok(V12_NATIVE_ACTION_TIMEOUT_MS[action] > finallyCompletedAt, `${action} can be killed before runtime finally completes`);
    assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS[action] - finallyCompletedAt, V12_NATIVE_ADAPTER_EXIT_MARGIN_MS);
  }

  const visualRestoreCompletedAt = V12_VISUAL_CLEANUP_BUDGET.reset_bound_ms
    + v12CommandPathMaxMs(V12_VISUAL_COMMAND_GRAPH.cleanup);
  assert.ok(V12_VISUAL_CLEANUP_BUDGET.max_ms > visualRestoreCompletedAt);
  assert.equal(V12_VISUAL_CLEANUP_BUDGET.max_ms - visualRestoreCompletedAt, V12_NATIVE_ADAPTER_EXIT_MARGIN_MS);

  for (const action of ["performance", "accessibility"]) {
    const cleanupCompletedAt = V12_QUALITY_ACTION_BUDGETS[action].producer_max_ms
      + v12CommandPathMaxMs(V12_QUALITY_COMMAND_GRAPH[action]);
    assert.equal(cleanupCompletedAt, V12_QUALITY_ACTION_BUDGETS[action].max_ms);
    assert.ok(V12_NATIVE_ACTION_TIMEOUT_MS[action] > cleanupCompletedAt,
      `${action} can be killed before quality cleanup and lease release complete`);
    assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS[action] - cleanupCompletedAt, V12_NATIVE_ADAPTER_EXIT_MARGIN_MS);
  }
});
