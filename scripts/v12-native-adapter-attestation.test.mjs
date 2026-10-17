import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import test from "node:test";
import { createControlledRunner } from "./testing/v12-production-launcher/controlled-runner.mjs";
import { V12_CALENDAR_STAGE_IDS } from "./v12-calendar-observation-contract.mjs";
import { V12_CALENDAR_REQUIREMENT_PROBE_COUNT } from "./v12-calendar-requirement-map.mjs";
import {
  V12_CALENDAR_ADAPTER_TIMEOUT_MS,
  V12_CALENDAR_ACTION_BUDGET,
  V12_CALENDAR_COMMAND_GRAPH,
  V12_GARMIN_ACTION_BUDGET,
  V12_GARMIN_COMMAND_GRAPH,
  V12_NATIVE_ACTION_TIMEOUT_MS,
  V12_NATIVE_ADAPTER_GRACE_MS,
  V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
  V12_NATIVE_CLEANUP_BUDGET,
  V12_NATIVE_COMMAND_GRAPH,
  V12_NATIVE_LEASE_ACTION_BUDGETS,
  V12_NATIVE_MAX_REQUEST_BYTES,
  V12_NATIVE_MAX_RESPONSE_BYTES,
  V12_NATIVE_PROCESS_TREE_KILL_GRACE_MS,
  V12_NATIVE_PROCESS_TREE_TERM_GRACE_MS,
  V12_QUALITY_ACTION_BUDGETS,
  V12_QUALITY_COMMAND_GRAPH,
  V12_QUALITY_WAIT_GRAPH,
  V12_RECOVERY_ACTION_BUDGET,
  V12_RECOVERY_COMMAND_GRAPH,
  V12_SQLITE_PRODUCER_BOUND_MS,
  V12_VISUAL_BATCH_PRODUCER_BOUND_MS,
  V12_VISUAL_CLEANUP_BUDGET,
  V12_VISUAL_COMMAND_GRAPH,
  V12_VISUAL_CAPTURE_PRODUCER_BOUND_MS,
  createV12NativeAdapter,
  invokeV12NativeAdapterEnvelope,
  superviseV12NativeProcess,
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
      "action", "adapter_source_sha256", "default_launcher", "domain_source_sha256", "kind", "launcher_source_sha256",
      "request_attestation_sha256", "schema_version", "test_only", "toolchain_origin",
    ]);
    assert.equal(result.execution_origin.action, "acquire-lease");
    assert.equal(result.execution_origin.kind, "test-fixture");
    assert.equal(result.execution_origin.default_launcher, false);
    assert.equal(result.execution_origin.test_only, true);
    assert.equal(result.execution_origin.toolchain_origin, "test-controlled/v1");
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
test("default launcher provenance preserves a controlled toolchain as test-only evidence", (t) => {
  const runner = fixture(t);
  const environment = {
    ...process.env,
    ...runner.executionEnvironment,
    NODE_ENV: "production",
    V12_DEVICE_SERIAL: "controlled-device-20",
    V12_CONTROLLED_STATE: runner.scratch,
  };
  for (const key of ["V12_NATIVE_ADAPTER_COMMAND", "V12_NATIVE_ADAPTER_TEST_MODE", "V12_NATIVE_ADAPTER_TEST_PROCESS", "NODE_TEST_CONTEXT"]) delete environment[key];
  const result = invokeV12NativeAdapterEnvelope("acquire-lease", { run_id: runner.build.run_id }, {
    root: runner.root,
    environment,
  });
  assert.equal(result.execution_origin.kind, "production-default-launcher");
  assert.equal(result.execution_origin.default_launcher, true);
  assert.equal(result.execution_origin.toolchain_origin, "test-controlled/v1");
  assert.doesNotMatch(JSON.stringify(result.execution_origin), /\/Users\/|\/private\//u);
});
test("default launcher provenance changes when controlled executable bytes change", (t) => {
  const runner = fixture(t);
  const environment = {
    ...process.env,
    ...runner.executionEnvironment,
    NODE_ENV: "production",
    V12_DEVICE_SERIAL: "controlled-device-20",
    V12_CONTROLLED_STATE: runner.scratch,
  };
  for (const key of ["V12_NATIVE_ADAPTER_COMMAND", "V12_NATIVE_ADAPTER_TEST_MODE", "V12_NATIVE_ADAPTER_TEST_PROCESS", "NODE_TEST_CONTEXT"]) delete environment[key];
  const first = invokeV12NativeAdapterEnvelope("acquire-lease", { run_id: runner.build.run_id }, { root: runner.root, environment });
  assert.equal(invokeV12NativeAdapterEnvelope("release-lease", { run_id: runner.build.run_id, lease: first.result }, { root: runner.root, environment }).result, true);
  const adb = runner.executionEnvironment.V12_ADB_PATH;
  writeFileSync(adb, `${readFileSync(adb, "utf8")}\n# immutable-byte-change\n`, { mode: 0o755 });
  const second = invokeV12NativeAdapterEnvelope("acquire-lease", { run_id: runner.build.run_id }, { root: runner.root, environment });
  assert.notEqual(first.execution_origin.request_attestation_sha256, second.execution_origin.request_attestation_sha256);
  assert.equal(invokeV12NativeAdapterEnvelope("release-lease", { run_id: runner.build.run_id, lease: second.result }, { root: runner.root, environment }).result, true);
});

test("supervisor gives a process tree TERM cleanup time before bounded KILL", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-supervisor-term-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cleaned = path.join(root, "cleaned");
  const program = `import fs from "node:fs"; process.on("SIGTERM",()=>{fs.writeFileSync(${JSON.stringify(cleaned)},"yes"); setTimeout(()=>process.exit(0),20)}); setInterval(()=>{},1000);`;
  const result = await superviseV12NativeProcess({
    executable: process.execPath,
    args: ["--input-type=module", "--eval", program],
    cwd: root,
    environment: process.env,
    input: "",
    timeoutMs: 150,
    termGraceMs: 250,
    killGraceMs: 250,
    maxBuffer: 1024,
  });
  assert.equal(readFileSync(cleaned, "utf8"), "yes");
  assert.equal(result.timed_out, true);
  assert.equal(result.termination, "SIGTERM");
  assert.equal(result.status, 0);
});

test("supervisor escalates an uncooperative process tree from TERM to KILL", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-supervisor-kill-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const grandchild = `process.on("SIGTERM",()=>{}); setInterval(()=>{},1000);`;
  const program = `import {spawn} from "node:child_process"; process.on("SIGTERM",()=>{}); const child=spawn(process.execPath,["--input-type=module","--eval",${JSON.stringify(grandchild)}],{stdio:"ignore"}); process.stdout.write(process.pid+":"+child.pid+"\\n"); setInterval(()=>{},1000);`;
  const started = Date.now();
  const result = await superviseV12NativeProcess({
    executable: process.execPath,
    args: ["--input-type=module", "--eval", program],
    cwd: root,
    environment: process.env,
    input: "",
    timeoutMs: 150,
    termGraceMs: 40,
    killGraceMs: 250,
    maxBuffer: 1024,
  });
  const pids = result.stdout.trim().split(":").map(Number);
  assert.equal(result.timed_out, true);
  assert.equal(result.termination, "SIGKILL");
  assert.equal(result.signal, "SIGKILL");
  assert.ok(Date.now() - started < 2_000);
  assert.equal(pids.length, 2);
  for (const pid of pids) {
    let alive = true;
    for (let attempt = 0; attempt < 50 && alive; attempt += 1) {
      try { process.kill(pid, 0); await new Promise((resolve) => setTimeout(resolve, 10)); }
      catch { alive = false; }
    }
    assert.equal(alive, false, `process tree member ${pid} survived SIGKILL`);
  }
});

test("supervisor forwards host cancellation through the same bounded TERM path", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-supervisor-signal-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cleaned = path.join(root, "signal-cleaned");
  const program = `import fs from "node:fs"; process.on("SIGTERM",()=>{fs.writeFileSync(${JSON.stringify(cleaned)},"yes"); process.exit(0)}); setInterval(()=>{},1000);`;
  const controller = new AbortController();
  const running = superviseV12NativeProcess({
    executable: process.execPath,
    args: ["--input-type=module", "--eval", program],
    cwd: root,
    environment: process.env,
    input: "",
    timeoutMs: 5_000,
    termGraceMs: 250,
    killGraceMs: 250,
    maxBuffer: 1024,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 150);
  const result = await running;
  assert.equal(readFileSync(cleaned, "utf8"), "yes");
  assert.equal(result.cancelled, true);
  assert.equal(result.termination, "SIGTERM");
});
test("adapter provenance is immutable and action-scoped across borrowed-lease cleanup", (t) => {
  const runner = fixture(t);
  const environment = markers(runner.root);
  const adapter = createV12NativeAdapter({
    command: environment.V12_NATIVE_ADAPTER_COMMAND,
    environment,
    root: runner.root,
    runId: runner.build.run_id,
  });
  const lease = adapter.acquireLease();
  const settings = adapter.snapshotSettings(lease);
  const calendar = adapter.executeCalendar(lease, settings, {
    flow_sha256: "a".repeat(64),
    flow_revision: 6,
  });
  const captured = calendar.execution_origin;
  adapter.restoreSettings(settings, lease);
  adapter.releaseLease(lease);

  assert.equal(captured.action, "calendar");
  assert.deepEqual(adapter.executionOrigin("calendar"), captured);
  assert.equal(adapter.executionOrigin("release-lease").action, "release-lease");
  assert.notEqual(captured.request_attestation_sha256, adapter.executionOrigin("release-lease").request_attestation_sha256);
});
test("Calendar adapter labels the checked-in subprocess fixture as test-only", (t) => {
  const runner = fixture(t);
  const result = runner.invokeCalendar(markers(runner.root));
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.execution_origin.kind, "test-fixture");
  assert.equal(value.execution_origin.default_launcher, false);
  assert.equal(value.execution_origin.test_only, true);
});
test("Calendar timeout covers all source-derived stages, probes, and runtime restoration", () => {
  assert.equal(V12_CALENDAR_STAGE_IDS.length, 35);
  assert.equal(V12_CALENDAR_REQUIREMENT_PROBE_COUNT, 69);
  assert.equal(V12_CALENDAR_COMMAND_GRAPH.shared_setup.length, 8);
  assert.equal(V12_CALENDAR_COMMAND_GRAPH.settings_snapshot.length, 14);
  assert.equal(V12_CALENDAR_COMMAND_GRAPH.producer.length, 1);
  assert.equal(V12_CALENDAR_COMMAND_GRAPH.producer[0].max_ms,
    (V12_CALENDAR_STAGE_IDS.length + V12_CALENDAR_REQUIREMENT_PROBE_COUNT) * (180_000 + 60_000));
  assert.equal(V12_CALENDAR_COMMAND_GRAPH.settings_restore.length, 25);
  assert.equal(V12_CALENDAR_ACTION_BUDGET.max_ms,
    Object.values(V12_CALENDAR_COMMAND_GRAPH).reduce((total, path) => total + v12CommandPathMaxMs(path), 0));
  assert.equal(V12_CALENDAR_ADAPTER_TIMEOUT_MS, V12_CALENDAR_ACTION_BUDGET.max_ms + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS);
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
  assert.ok(Object.values(V12_NATIVE_ACTION_TIMEOUT_MS).every((value) => Number.isSafeInteger(value) && value >= 1_000 && value <= 8 * 60 * 60_000));
  assert.equal(V12_NATIVE_COMMAND_GRAPH.acquire_lease.success.length, 5);
  assert.equal(V12_NATIVE_COMMAND_GRAPH.acquire_lease.failure_after_owner_read.length, 7);
  assert.equal(V12_NATIVE_LEASE_ACTION_BUDGETS["acquire-lease"].adb_call_count,
    V12_NATIVE_COMMAND_GRAPH.runtime_initialization.length + V12_NATIVE_COMMAND_GRAPH.acquire_lease.failure_after_owner_read.length);
  assert.equal(V12_NATIVE_LEASE_ACTION_BUDGETS["acquire-lease"].max_ms, 220_000);
  assert.equal(V12_VISUAL_COMMAND_GRAPH.device_verification.length, 7);
  assert.equal(V12_VISUAL_CLEANUP_BUDGET.reset_bound_ms, 60_100);
  assert.equal(V12_RECOVERY_COMMAND_GRAPH.producer[0].max_ms, 40 * 60_000);
  assert.equal(V12_RECOVERY_COMMAND_GRAPH.post_producer_cleanup.length, 1);
  assert.equal(V12_RECOVERY_COMMAND_GRAPH.post_producer_cleanup[0].name, "domain.recovery.post-producer.force-stop");
  assert.equal(V12_RECOVERY_COMMAND_GRAPH.local_cleanup.length, 16);
  assert.equal(V12_RECOVERY_ACTION_BUDGET.max_ms,
    Object.values(V12_RECOVERY_COMMAND_GRAPH).reduce((total, path) => total + v12CommandPathMaxMs(path), 0));
  assert.equal(V12_QUALITY_COMMAND_GRAPH.performance_cold_initialization.length, 5);
  assert.equal(V12_QUALITY_COMMAND_GRAPH.performance_cold_cycle.length, 7);
  assert.equal(V12_QUALITY_WAIT_GRAPH.performance_cold_readiness.length, 20);
  assert.ok(V12_QUALITY_WAIT_GRAPH.performance_cold_readiness.every(({ max_ms: maxMs }) => maxMs === 60_000));
  assert.equal(V12_QUALITY_COMMAND_GRAPH.performance.length, 216);
  assert.equal(V12_QUALITY_COMMAND_GRAPH.accessibility.length, 72);
  for (const action of ["performance", "accessibility"]) {
    const budget = V12_QUALITY_ACTION_BUDGETS[action];
    assert.equal(budget.adb_call_count, V12_QUALITY_COMMAND_GRAPH[action].length);
    assert.equal(budget.adb_max_ms, v12CommandPathMaxMs(V12_QUALITY_COMMAND_GRAPH[action]));
    assert.equal(budget.readiness_max_ms, v12CommandPathMaxMs(V12_QUALITY_WAIT_GRAPH[action]));
    assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS[action], budget.max_ms + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS);
  }
  assert.ok(V12_NATIVE_ACTION_TIMEOUT_MS.performance > 110 * 60_000);
  assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS.accessibility, 44 * 60_000 + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS);
  assert.equal(V12_NATIVE_ADAPTER_GRACE_MS, V12_NATIVE_CLEANUP_BUDGET.max_ms + V12_NATIVE_CLEANUP_BUDGET.exit_margin_ms);
  assert.equal(V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
    V12_NATIVE_PROCESS_TREE_TERM_GRACE_MS + V12_NATIVE_PROCESS_TREE_KILL_GRACE_MS + 1_000);
  assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS["visual-capture"], V12_VISUAL_CAPTURE_PRODUCER_BOUND_MS + V12_NATIVE_ADAPTER_GRACE_MS);
  assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS["visual-capture-batch"], V12_VISUAL_BATCH_PRODUCER_BOUND_MS + V12_NATIVE_ADAPTER_GRACE_MS);
  assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS["visual-compare"], V12_VISUAL_BATCH_PRODUCER_BOUND_MS + V12_NATIVE_ADAPTER_GRACE_MS);
  assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS.sqlite, V12_SQLITE_PRODUCER_BOUND_MS + V12_NATIVE_ADAPTER_GRACE_MS);
  for (const [action, budget] of Object.entries(V12_NATIVE_LEASE_ACTION_BUDGETS)) {
    assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS[action], budget.max_ms + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS);
  }
  assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS.calendar, V12_CALENDAR_ADAPTER_TIMEOUT_MS);
  assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS.recovery, V12_RECOVERY_ACTION_BUDGET.max_ms + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS);
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
      + v12CommandPathMaxMs(V12_QUALITY_COMMAND_GRAPH[action])
      + v12CommandPathMaxMs(V12_QUALITY_WAIT_GRAPH[action]);
    assert.equal(cleanupCompletedAt, V12_QUALITY_ACTION_BUDGETS[action].max_ms);
    assert.ok(V12_NATIVE_ACTION_TIMEOUT_MS[action] > cleanupCompletedAt,
      `${action} can be killed before quality cleanup and lease release complete`);
    assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS[action] - cleanupCompletedAt, V12_NATIVE_ADAPTER_EXIT_MARGIN_MS);
  }

  for (const [action, budget, graph] of [
    ["recovery", V12_RECOVERY_ACTION_BUDGET, V12_RECOVERY_COMMAND_GRAPH],
    ["calendar", V12_CALENDAR_ACTION_BUDGET, V12_CALENDAR_COMMAND_GRAPH],
    ["garmin", V12_GARMIN_ACTION_BUDGET, V12_GARMIN_COMMAND_GRAPH],
  ]) {
    const completedAt = Object.values(graph).reduce((total, path) => total + v12CommandPathMaxMs(path), 0);
    assert.equal(completedAt, budget.max_ms);
    assert.ok(V12_NATIVE_ACTION_TIMEOUT_MS[action] > completedAt, `${action} outer spawnSync can kill its real command graph`);
    assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS[action] - completedAt, V12_NATIVE_ADAPTER_EXIT_MARGIN_MS);
  }
});
