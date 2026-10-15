import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createControlledRunner } from "./testing/v12-production-launcher/controlled-runner.mjs";

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
for (const action of ["visual-capture", "visual-capture-batch", "visual-compare", "accessibility", "performance"]) {
  test(`${action} cannot return invented native observations`, (t) => {
    const runner = fixture(t);
    bounded(runner.invoke(action), "action_contract_unavailable");
  });
}
for (const action of ["recovery", "garmin", "calendar"]) {
  test(`${action} is dispatched to its production domain action`, (t) => {
    const runner = fixture(t);
    const result = runner.invoke(action);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /action_contract_unavailable/u);
  });
}
