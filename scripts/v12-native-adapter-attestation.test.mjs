import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const project = process.cwd();
const adapter = path.join(project, "scripts/v12-native-adapter.mjs");
const fixtureRun = "phase20-20261015T000000Z-aaaaaaaaaaaa";
const digest = (letter) => letter.repeat(64);

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "v12-native-adapter-"));
  cpSync(path.join(project, "scripts"), path.join(root, "scripts"), { recursive: true });
  symlinkSync(path.join(project, "node_modules"), path.join(root, "node_modules"), "dir");
  const build = { run_id: fixtureRun, source: { tree_sha256: digest("a") }, build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", apk: { sha256: digest("b"), signature_sha256: digest("c") } }, device: { installed_apk_sha256: digest("b"), identity_sha256: digest("d") } };
  const file = path.join(root, "artifacts/native/v1.2", fixtureRun, "build.json");
  mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(build)}\n`);
  return root;
}
function runner(root, environment = {}) {
  const program = `import { invokeV12NativeAdapter } from ${JSON.stringify(adapter)};\nprocess.stdout.write(JSON.stringify(invokeV12NativeAdapter('acquire-lease', { run_id: ${JSON.stringify(fixtureRun)} }, { root: process.cwd() })));\n`;
  return spawnSync(process.execPath, ["--input-type=module", "--eval", program], { cwd: root, encoding: "utf8", timeout: 35_000, env: { ...process.env, ...environment } });
}
function testMarkers(root, extra = {}) { return { NODE_ENV: "test", V12_NATIVE_ADAPTER_TEST_MODE: "phase20-native-adapter-subprocess", V12_NATIVE_ADAPTER_TEST_PROCESS: "1", V12_NATIVE_ADAPTER_COMMAND: path.join(root, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs"), ...extra }; }

test("unset adapter command selects the checked-in production launcher", (t) => {
  const root = fixture(); t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin"); mkdirSync(bin); writeFileSync(path.join(bin, "adb"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const result = runner(root, { V12_DEVICE_SERIAL: "device-test-20", PATH: `${bin}:${process.env.PATH}` });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /native_execution/);
});
test("explicit test process accepts the checked-in fake only in test mode", (t) => {
  const root = fixture(); t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = runner(root, testMarkers(root)); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /lease/);
});
test("fake command is rejected outside explicit test mode", (t) => {
  const root = fixture(); t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = runner(root, { V12_NATIVE_ADAPTER_COMMAND: path.join(root, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs") });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /command_override_forbidden/);
});
for (const field of ["source", "apk", "device"]) test(`forged ${field} attestation is rejected`, (t) => {
  const root = fixture(); t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = runner(root, testMarkers(root, { V12_FAKE_DEVICE_FORGE_ATTESTATION: field }));
  assert.notEqual(result.status, 0); assert.match(result.stderr, /attestation_invalid/);
});
test("production launcher fails bounded when adb is unavailable", (t) => {
  const root = fixture(); t.after(() => rmSync(root, { recursive: true, force: true }));
  const emptyPath = path.join(root, "empty-bin"); mkdirSync(emptyPath); const started = Date.now();
  const result = runner(root, { V12_DEVICE_SERIAL: "device-test-20", PATH: emptyPath });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /command_failed/); assert.ok(Date.now() - started < 5_000);
});
