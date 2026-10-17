#!/usr/bin/env node
/**
 * Non-test-process default-launcher integration harness. It supplies controlled
 * ADB and native markers, never V12_NATIVE_ADAPTER_COMMAND or the adapter fake.
 * Success proves subprocess wiring for lease/settings/SQLite ONLY. It must not
 * be reported as acceptance evidence or as coverage of unimplemented actions.
 */
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sourceTreeSha256 } from "../../source-tree-digest.mjs";
import { phase18DeviceIdentitySha256 } from "../../phase18-device-identity.mjs";

const project = fileURLToPath(new URL("../../../", import.meta.url));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fixtureRun = "phase20-20261015T000000Z-aaaaaaaaaaaa";
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

export function createControlledRunner() {
  const root = mkdtempSync(path.join(tmpdir(), "v12-production-launcher-"));
  cpSync(path.join(project, "scripts"), path.join(root, "scripts"), { recursive: true });
  mkdirSync(path.join(root, "src/testing/contracts"), { recursive: true });
  cpSync(path.join(project, "src/testing/contracts/v12Acceptance.contract.ts"), path.join(root, "src/testing/contracts/v12Acceptance.contract.ts"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  symlinkSync(path.join(project, "node_modules"), path.join(root, "node_modules"), "dir");
  const digest = sourceTreeSha256(root);
  const scratch = path.join(root, "artifacts", "controlled");
  const bin = path.join(scratch, "bin"); mkdirSync(bin, { recursive: true });
  const tool = path.join(root, "scripts/testing/v12-production-launcher/controlled-device-tool.mjs");
  writeFileSync(path.join(bin, "adb"), `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(tool)} "$@"\n`, { mode: 0o755 });
  // If an unimplemented branch tries to treat Maestro --version as evidence it fails.
  writeFileSync(path.join(bin, "maestro"), "#!/bin/sh\nexit 71\n", { mode: 0o755 });
  writeFileSync(path.join(bin, "unzip"), "#!/bin/sh\nexit 71\n", { mode: 0o755 });
  const serial = "controlled-device-20";
  const facts = { serial, abi: "arm64-v8a", apiLevel: "36", model: "controlled" };
  const apk = Buffer.from("controlled-APK-bytes-not-a-real-APK");
  const apkHash = hash(apk);
  writeFileSync(path.join(scratch, "fixture.apk"), apk);
  const stateFile = path.join(scratch, "state.json");
  writeFileSync(stateFile, JSON.stringify({ apkHash, props: { "ro.product.cpu.abi": facts.abi, "ro.build.version.sdk": facts.apiLevel, "ro.product.model": facts.model }, settings: { font_scale: "1.15", user_rotation: "0", accelerometer_rotation: "1", animator_duration_scale: "0.5", window_animation_scale: "1", airplane_mode_on: "0" } }));
  const ids = ["fresh-migration", "schema27-upgrade", "supported-legacy-upgrade", "failure-reopen", "backup", "restore", "merge", "noop-replay", "rebuild", "immutable-history"];
  const contract = { schemaVersion: 1, contractVersion: 1, status: "passed", total: 10, passed: 10, failed: 0, skipped: 0, cases: ids.map((id, index) => ({ id, status: "passed", code: "v12_acceptance_case_passed", counts: { sourceCases: index + 1 } })) };
  writeFileSync(path.join(scratch, "native-marker.json"), JSON.stringify(contract));
  const build = { run_id: fixtureRun, mode: "live", source: { head: "a".repeat(40), tree_sha256: digest }, fixtures: { registry_sha256: hash("controlled-fixtures") }, build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", apk: { path: "artifacts/controlled/fixture.apk", sha256: apkHash, signature_sha256: hash("controlled-signature") } }, device: { installed_apk_sha256: apkHash, identity_sha256: phase18DeviceIdentitySha256(facts) } };
  const manifestPath = path.join(root, "artifacts/native/v1.2", fixtureRun, "build.json");
  mkdirSync(path.dirname(manifestPath), { recursive: true }); writeFileSync(manifestPath, JSON.stringify(build));
  const executionEnvironment = {
    V12_EXECUTION_ORIGIN: "test-controlled/v1",
    V12_ADB_PATH: path.join(bin, "adb"),
    V12_MAESTRO_PATH: path.join(bin, "maestro"),
    V12_UNZIP_PATH: path.join(bin, "unzip"),
  };
  const environment = { ...process.env, PATH: `${bin}:${process.env.PATH}`, V12_DEVICE_SERIAL: serial, V12_CONTROLLED_STATE: scratch, NODE_ENV: "production", ...executionEnvironment };
  for (const name of ["V12_NATIVE_ADAPTER_COMMAND", "V12_NATIVE_ADAPTER_TEST_MODE", "V12_NATIVE_ADAPTER_TEST_PROCESS", "NODE_TEST_CONTEXT"]) delete environment[name];
  function invoke(action, payload = {}, extra = {}) {
    const input = { action, payload: { run_id: fixtureRun, ...payload } };
    const program = `import fs from 'node:fs'; import {invokeV12NativeAdapter} from './scripts/v12-native-adapter.mjs'; const {action,payload}=JSON.parse(fs.readFileSync(0,'utf8')); try { process.stdout.write(JSON.stringify(invokeV12NativeAdapter(action,payload))); } catch(e) { process.stderr.write(e.message); process.exitCode=1; }`;
    return spawnSync(process.execPath, ["--input-type=module", "--eval", program], { cwd: root, env: { ...environment, ...extra }, input: JSON.stringify(input), encoding: "utf8", timeout: 70_000, maxBuffer: 2 * 1024 * 1024 });
  }
  function success(action, payload) {
    const result = invoke(action, payload);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  const readState = () => JSON.parse(readFileSync(stateFile, "utf8"));
  const updateState = (update) => writeFileSync(stateFile, JSON.stringify({ ...readState(), ...update }));
  return { root, scratch, build, manifestPath, contract, executionEnvironment, invoke, success, readState, updateState, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export function runControlledIntegration() {
  const runner = createControlledRunner();
  try {
    const lease = runner.success("acquire-lease");
    const prior = runner.success("snapshot-settings", { lease });
    assert.notEqual(runner.invoke("acquire-lease").status, 0);
    assert.equal(prior.transition_animation_scale, "null");
    runner.updateState({ settings: { ...runner.readState().settings, font_scale: "2", transition_animation_scale: "0" } });
    assert.equal(runner.success("restore-settings", { lease, settings: prior }), true);
    assert.equal(runner.success("release-lease", { lease }), true);
    assert.deepEqual(runner.success("sqlite"), { status: "passed", contract: runner.contract });
    assert.equal(runner.readState().suite, "v1.2-acceptance");
    assert.equal(runner.readState().settings.font_scale, "1.15");
    return { default_launcher: true, adapter_override: false, node_env: "production", verified_actions: ["acquire-lease", "snapshot-settings", "restore-settings", "release-lease", "sqlite"], native_evidence: false };
  } finally { runner.cleanup(); }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { process.stdout.write(`${JSON.stringify(runControlledIntegration())}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
