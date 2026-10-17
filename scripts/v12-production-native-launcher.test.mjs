import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createControlledRunner } from "./testing/v12-production-launcher/controlled-runner.mjs";
import { V12_NATIVE_ACTION_TIMEOUT_MS } from "./v12-native-adapter.mjs";
import { V12_NATIVE_ADAPTER_EXIT_MARGIN_MS, V12_NATIVE_COMMAND_GRAPH, V12_QUALITY_ACTION_BUDGETS } from "./v12-native-time-budgets.mjs";

function fixture(t) { const value = createControlledRunner(); t.after(value.cleanup); return value; }
function bounded(result, code = "command_failed") {
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(code, "u"));
  assert.equal(result.stdout, "");
  assert.doesNotMatch(result.stderr, /bearer|\/Users\/|private-native|device-private/u);
}

test("non-test harness exercises the default launcher without the fake adapter", () => {
  const result = spawnSync(process.execPath, ["scripts/testing/v12-production-launcher/controlled-runner.mjs"], { encoding: "utf8", timeout: 70_000 });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.node_env, "production");
  assert.equal(output.adapter_override, false);
  assert.equal(output.native_evidence, false);
  assert.deepEqual(output.verified_actions, ["acquire-lease", "snapshot-settings", "restore-settings", "release-lease", "sqlite"]);
});
test("default launcher dispatches production quality actions instead of the unavailable fallback", (t) => {
  const runner = fixture(t);
  assert.deepEqual(runner.success("performance", { request: "identity" }), {
    identity: {
      base_head: runner.build.source.head,
      source_tree_sha256: runner.build.source.tree_sha256,
      apk_sha256: runner.build.build.apk.sha256,
      installed_apk_sha256: runner.build.device.installed_apk_sha256,
      package: runner.build.build.package,
      device_identity_sha256: runner.build.device.identity_sha256,
      fixture_sha256: runner.build.fixtures.registry_sha256,
    },
  });
  bounded(runner.invoke("accessibility"), "quality_instrumentation_missing");
});
test("quality adapter subprocesses use the shared command-graph deadlines", () => {
  for (const action of ["accessibility", "performance"]) {
    assert.equal(V12_NATIVE_ACTION_TIMEOUT_MS[action], V12_QUALITY_ACTION_BUDGETS[action].max_ms + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS);
  }
});
test("wrong lease cannot read, restore or release settings", (t) => {
  const runner = fixture(t);
  const lease = runner.success("acquire-lease");
  const settings = runner.success("snapshot-settings", { lease });
  const other = { ...lease, lease_id: "a".repeat(48) };
  for (const action of ["snapshot-settings", "restore-settings", "release-lease"]) bounded(runner.invoke(action, { lease: other, settings }), "lease_invalid");
  assert.equal(runner.success("release-lease", { lease }), true);
});
test("only saved settings can be restored; absent settings are deleted", (t) => {
  const runner = fixture(t);
  const lease = runner.success("acquire-lease");
  const settings = runner.success("snapshot-settings", { lease });
  bounded(runner.invoke("snapshot-settings", { lease }), "already_snapshotted");
  bounded(runner.invoke("restore-settings", { lease, settings: { ...settings, font_scale: "2" } }), "settings_invalid");
  runner.updateState({ settings: { ...runner.readState().settings, font_scale: "2", transition_animation_scale: "0" } });
  bounded(runner.invoke("release-lease", { lease }), "settings_restore_failed");
  assert.equal(runner.success("restore-settings", { lease, settings }), true);
  assert.equal(runner.readState().settings.transition_animation_scale, undefined);
  assert.equal(runner.success("release-lease", { lease }), true);
});
test("Calendar snapshots every display setting under the lease and releases only after read-back", (t) => {
  const runner = fixture(t);
  const result = runner.calendarSettingsScenario();
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(output.calendar), ["values", "airplane", "size", "density", "night"]);
  assert.deepEqual(output.calendar.size, { physical: "1080x2340", override: null });
  assert.deepEqual(output.calendar.density, { physical: "420", override: null });
  assert.equal(output.calendar.night, "auto");
  assert.equal(output.restore_error, null);
  assert.equal(output.release_error, null);
  assert.equal(existsSync(path.join(runner.scratch, "lock")), false);
});
test("Calendar restoration failure keeps the persisted snapshot and lease", (t) => {
  const runner = fixture(t);
  runner.updateState({ ignoredCalendarSetting: "night" });
  const result = runner.calendarSettingsScenario();
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.match(output.restore_error, /settings_restore_failed/u);
  assert.match(output.release_error, /settings_restore_failed/u);
  const owner = JSON.parse(readFileSync(path.join(runner.scratch, "lock", "owner.json"), "utf8"));
  assert.equal(owner.calendar_restored, false);
  assert.deepEqual(owner.calendar_settings, output.calendar);
});
for (const failure of ["failedSetting", "ignoredSetting"]) test(`${failure}: restoration cannot report success or relinquish the lease`, (t) => {
  const runner = fixture(t);
  const lease = runner.success("acquire-lease");
  const settings = runner.success("snapshot-settings", { lease });
  runner.updateState({ [failure]: "font_scale", settings: { ...runner.readState().settings, font_scale: "2" } });
  bounded(runner.invoke("restore-settings", { lease, settings }), "settings_restore_failed");
  assert.equal(runner.readState().restorationAttempts.length, 7);
  bounded(runner.invoke("release-lease", { lease }), "settings_restore_failed");
  bounded(runner.invoke("acquire-lease"), "lease_busy");
  runner.updateState({ [failure]: null });
  runner.success("restore-settings", { lease, settings });
  runner.success("release-lease", { lease });
});
test("cleanup remains possible after a source change", (t) => {
  const runner = fixture(t);
  const lease = runner.success("acquire-lease");
  const settings = runner.success("snapshot-settings", { lease });
  runner.updateState({ settings: { ...runner.readState().settings, font_scale: "2" } });
  writeFileSync(path.join(runner.root, "changed-source.txt"), "source changed");
  bounded(runner.invoke("sqlite"), "source_identity_mismatch");
  runner.success("restore-settings", { lease, settings });
  runner.success("release-lease", { lease });
});
for (const [name, update, code] of [
  ["offline", { noDevice: true }, "device_unavailable"],
  ["identity mismatch", { props: { "ro.product.cpu.abi": "x86_64", "ro.build.version.sdk": "36", "ro.product.model": "different" } }, "device_identity_mismatch"],
  ["APK mismatch", { wrongApk: true }, "apk_identity_mismatch"],
]) test(`${name} is bounded before native execution`, (t) => {
  const runner = fixture(t); runner.updateState(update);
  const started = Date.now(); bounded(runner.invoke("acquire-lease"), code);
  assert.ok(Date.now() - started < 5_000);
  assert.equal(existsSync(path.join(runner.scratch, "lock")), false);
});
test("lease acquisition failure after owner read runs both cleanup commands", (t) => {
  const runner = fixture(t); runner.updateState({ invalidOwnerRead: true });
  bounded(runner.invoke("acquire-lease"), "lease_invalid");
  assert.equal(runner.readState().commands.length,
    V12_NATIVE_COMMAND_GRAPH.runtime_initialization.length + V12_NATIVE_COMMAND_GRAPH.acquire_lease.failure_after_owner_read.length);
  assert.equal(existsSync(path.join(runner.scratch, "lock")), false);
});
test("SQLite returns exact native counts and never reconstructs them", (t) => {
  const runner = fixture(t);
  assert.deepEqual(runner.success("sqlite"), { status: "passed", contract: runner.contract });
  assert.equal(existsSync(path.join(runner.scratch, "lock")), false);
  assert.match(runner.readState().nonce, /^v12-[a-f0-9]{32}$/u);
});
for (const mutation of ["failed", "private", "missing-case"]) test(`SQLite rejects ${mutation} marker and releases restored lease`, (t) => {
  const runner = fixture(t); const file = path.join(runner.scratch, "native-marker.json");
  const contract = JSON.parse(readFileSync(file));
  if (mutation === "failed") contract.cases[0].status = "failed";
  if (mutation === "private") contract.cases[0].counts.raw_sql = "private";
  if (mutation === "missing-case") { contract.cases.pop(); contract.total = 9; }
  writeFileSync(file, JSON.stringify(contract));
  bounded(runner.invoke("sqlite"), "malformed_result");
  assert.equal(existsSync(path.join(runner.scratch, "lock")), false);
});
for (const marker of ["missingMarker", "staleMarker", "routeError"]) test(`SQLite ${marker} failure is bounded and restores before returning`, (t) => {
  const runner = fixture(t); runner.updateState({ [marker]: true });
  const started = Date.now(); bounded(runner.invoke("sqlite"), marker === "routeError" ? "route_error" : "marker_timeout");
  assert.ok(Date.now() - started < 45_000);
  assert.equal(existsSync(path.join(runner.scratch, "lock")), false);
  assert.equal(runner.readState().settings.font_scale, "1.15");
});
for (const action of ["visual-capture", "visual-capture-batch", "visual-compare", "accessibility", "recovery", "garmin", "calendar"]) {
  test(`${action} reaches its checked-in production action module`, (t) => {
    const runner = fixture(t);
    const result = runner.invoke(action);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /action_contract_unavailable/u);
    assert.doesNotMatch(result.stderr, /bearer|\/Users\/|private-native|device-private/u);
  });
}
test("performance identity dispatches through the production quality module", (t) => {
  const runner = fixture(t);
  const result = runner.success("performance", { request: "identity" });
  assert.equal(result.identity.source_tree_sha256, runner.build.source.tree_sha256);
  assert.equal(result.identity.apk_sha256, runner.build.build.apk.sha256);
});
test("unknown actions fail closed before a module can run", (t) => {
  const runner = fixture(t);
  bounded(runner.invoke("unknown-action"), "action_invalid");
});
test("the launcher itself rejects undeclared actions before reading a request", () => {
  const launcher = path.join(process.cwd(), "scripts/v12-production-native-adapter-launcher.mjs");
  const environment = { ...process.env, NODE_ENV: "production" };
  for (const key of ["V12_NATIVE_ADAPTER_COMMAND", "V12_NATIVE_ADAPTER_TEST_MODE", "V12_NATIVE_ADAPTER_TEST_PROCESS", "NODE_TEST_CONTEXT"]) delete environment[key];
  const result = spawnSync(process.execPath, [launcher, "--action", "unknown-action"], {
    cwd: process.cwd(), env: environment, input: "{}", encoding: "utf8", timeout: 5_000,
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "v12_production_native_launcher_action_invalid\n");
});
