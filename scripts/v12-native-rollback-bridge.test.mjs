import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runV12NativeRollbackBridge, authenticateV12RollbackOnDevice, executeRollbackBridgeCli, rollbackBridgeError, rollbackBridgeMain } from "./v12-native-rollback-bridge.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const runId = "phase20-20261023T000000Z-aaaaaaaaaaaa";
const nonce = "a".repeat(32);
function inspection(archive) {
  const facts = { schema_version: 1, producer: "v12-canonical-post-restore-facts/v1", archive_sha256: hash(archive), source_schema_version: 22,
    table_count: 2, row_count: 2, source_facts_sha256: "f".repeat(64), reopened_facts_sha256: "f".repeat(64), integrity_check: "ok", foreign_key_violations: 0 };
  return { format_version: 2, schema_version: 22, canonical_post_restore_facts: facts,
    clean_restore_receipt: { schema_version: 1, producer: "v12-production-clean-restore-receipt/v1", parser: "src/domains/portability/restoreCommands.ts#createRestoreCommands",
      outcome: "restored", clean_target: true, archive_sha256: hash(archive), archive_format_version: 2, archive_schema_version: 22,
      post_restore_facts_sha256: hash(`${JSON.stringify(facts)}\n`), reopened_post_restore_facts_sha256: hash(`${JSON.stringify(facts)}\n`) } };
}
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "rollback-transport-host-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const operational = path.join(root, "artifacts/native/phase20-operations", runId);
  mkdirSync(operational, { recursive: true });
  const requestPath = path.join(operational, "request.json");
  const request = { schema_version: 1, producer: "v12-rollback-native-request/v1", run_id: runId,
    lease: { lease_id: "b".repeat(48), native_execution: "EXECUTED" } };
  writeFileSync(requestPath, JSON.stringify(request));
  const build = path.join(root, "artifacts/native/v1.2", runId, "build.json"); mkdirSync(path.dirname(build), { recursive: true });
  const apk = path.join(root, "input.apk"); writeFileSync(apk, "APK-host-unit-fixture");
  const manifest = { run_id: runId, mode: "live", source: { tree_sha256: "c".repeat(64) },
    build: { package: "com.fchoo.gymtracker.devtest", profile: "development-test", apk: { path: "input.apk", sha256: hash(readFileSync(apk)), signature_sha256: "d".repeat(64) } },
    device: { identity_sha256: "e".repeat(64), installed_apk_sha256: hash(readFileSync(apk)) } };
  writeFileSync(build, JSON.stringify(manifest));
  const archive = Buffer.alloc(26, 1); archive[4] = 2;
  const config = { android: { package: "com.fchoo.gymtracker.devtest" }, scheme: "gymtracker-devtest",
    extra: { buildProfile: "development-test", nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance" } };
  const env = { V12_ROLLBACK_REQUEST_PATH: requestPath, V12_DEVICE_SERIAL: "host-unit-device" };
  const controls = { arm: undefined, result: undefined, returnedArchive: archive, offline: true, wifi: "0", mobile: "0", date: "1000000", absent: 0, timeout: false };
  const calls = []; let clock = 1_000;
  const dependencies = {
    resolveTools: () => ({ execution_origin: "production-attested/v1", test_only: false, adb: "host-unit-adb", unzip: "host-unit-unzip" }),
    runtime: () => ({ async withLease(value, operation) { assert.deepEqual(value.lease, request.lease); return operation(); } }),
    nonce: () => nonce, now: () => clock, wait: async () => { clock += 250; },
    command(exe, args, opts) {
      calls.push({ exe, args, input: opts.input });
      const text = args.join(" "); let stdout = Buffer.alloc(0); let status = 0;
      if (exe === "host-unit-unzip") stdout = Buffer.from(JSON.stringify(config));
      else if (text.includes("arm.json") && opts.input !== undefined) controls.arm = JSON.parse(opts.input);
      else if (text.includes("airplane-mode")) stdout = Buffer.from(controls.offline ? "Airplane mode is enabled" : "Airplane mode is disabled");
      else if (text.includes("wifi_on")) stdout = Buffer.from(controls.wifi);
      else if (text.includes("mobile_data")) stdout = Buffer.from(controls.mobile);
      else if (text.includes("date")) stdout = Buffer.from(controls.date);
      else if (text.includes("result.json")) {
        if (controls.timeout || controls.absent-- > 0) status = 1;
        else stdout = Buffer.from(typeof controls.result === "string" ? controls.result : JSON.stringify(controls.result ?? {
          schema_version: 1, producer: "v12-native-rollback-bridge/v1", arm: controls.arm, inspection: inspection(archive),
        }));
      } else if (text.includes("archive.gtbk")) stdout = controls.returnedArchive;
      return { status, stdout };
    },
  };
  const options = { root, runId, phase: "create", environment: env };
  const operationDir = path.join(operational, `rollback-${nonce}`);
  return { options, dependencies, request, requestPath, root, operational, controls, config, manifest, build, archive, calls, operationDir };
}

test("source-owned transport binds private arm and exact bytes outside immutable run root (HOST UNIT ONLY)", async t => {
  const f = fixture(t); const result = await runV12NativeRollbackBridge(f.options, f.dependencies);
  assert.deepEqual(result.archiveBytes, f.archive);
  assert.equal(result.inspection.schema_version, 22);
  assert.equal(existsSync(path.join(f.operationDir, "native-result.json")), true);
  assert.equal(existsSync(path.join(f.root, `artifacts/native/v1.2/${runId}/rollback`)), false);
  for (const call of f.calls.filter(call => call.exe === "host-unit-adb")) assert.deepEqual(call.args.slice(0, 2), ["-s", "host-unit-device"]);
  assert.ok(!f.calls.some(call => /kill-server|start-server|logcat|force-stop|clear/u.test(call.args.join(" "))));
});

test("host never reads a partially copied result before the private readiness barrier (HOST UNIT ONLY)", async t => {
  const f = fixture(t);
  let polls = 0;
  const original = f.dependencies.command;
  f.dependencies.command = (exe, args, opts) => {
    if (args.join(" ").includes("result.json")) {
      assert.match(args.join(" "), /test -f [^ ]+\/result\.ready && test "\$\(cat [^ ]+\/result\.ready\)" = ready && test -f [^ ]+\/result\.json/u);
      if (polls++ === 0) return { status: 1, stdout: Buffer.alloc(0) };
    }
    return original(exe, args, opts);
  };
  const result = await runV12NativeRollbackBridge(f.options, f.dependencies);
  assert.equal(polls, 2);
  assert.equal(result.inspection.clean_restore_receipt.outcome, "restored");
});

test("async archive callback performs the native transport before returning parser inspection (HOST UNIT ONLY)", async t => {
  const f = fixture(t);
  const result = await authenticateV12RollbackOnDevice({ root: f.root, runId, environment: f.options.environment,
    request: { required_parser: "src/domains/portability/restoreCommands.ts#createRestoreCommands", operation: "clean_restore", declared_schema_version: 22,
      archive_bytes: f.archive } }, f.dependencies);
  assert.equal(result.clean_restore_receipt.outcome, "restored");
  assert.equal(f.controls.arm.archive_sha256, hash(f.archive));
  assert.ok(f.calls.some(call => call.input === f.archive));
});

test("prepare CLI returns only hashes/format/schema, not paths or payload (HOST UNIT ONLY)", async t => {
  const f = fixture(t);
  const result = await executeRollbackBridgeCli(["--prepare", "--run", runId], { ...f.dependencies, root: f.root, environment: f.options.environment });
  assert.deepEqual(result, { archive_sha256: hash(f.archive), format_version: 2, schema_version: 22 });
});

test("denies invalid CLI and callback requests before any device access", async () => {
  await assert.rejects(runV12NativeRollbackBridge(), /arguments_invalid/u);
  for (const args of [[], ["--wrong", "--run", runId], ["--prepare", "--wrong", runId]]) await assert.rejects(executeRollbackBridgeCli(args), /arguments_invalid/u);
  await assert.rejects(authenticateV12RollbackOnDevice(), /restore_parser_required/u);
  for (const request of [undefined, { required_parser: "wrong" }, { required_parser: "src/domains/portability/restoreCommands.ts#createRestoreCommands", operation: "wrong" },
    { required_parser: "src/domains/portability/restoreCommands.ts#createRestoreCommands", operation: "clean_restore", declared_schema_version: 45 }]) {
    await assert.rejects(authenticateV12RollbackOnDevice({ request, environment: { V12_ROLLBACK_REQUEST_PATH: "unused" } }), /schema_boundary_invalid/u);
  }
  assert.equal(rollbackBridgeError(new Error("private text")), "v12_rollback_native_failed");
  assert.equal(rollbackBridgeError("private text"), "v12_rollback_native_failed");
});

test("denies invalid binding arguments and test-origin environments", async t => {
  for (const patch of [{ runId: "wrong" }, { phase: "wrong" }, { phase: "restore", archive: "wrong" },
    { phase: "restore", archive: Buffer.alloc(25) }, { phase: "restore", archive: Buffer.alloc(32 * 1024 * 1024 + 1) }]) {
    const f = fixture(t); await assert.rejects(runV12NativeRollbackBridge({ ...f.options, ...patch }, f.dependencies)); assert.equal(f.calls.length, 0);
  }
  for (const env of [{}, { NODE_ENV: "test" }, { V12_NATIVE_ADAPTER_TEST_MODE: "test" }, { V12_NATIVE_ADAPTER_COMMAND: "fake" }, { V12_EXECUTION_ORIGIN: "test-controlled/v1" }]) {
    const f = fixture(t);
    await assert.rejects(runV12NativeRollbackBridge({ ...f.options, environment: Object.keys(env).length ? { ...f.options.environment, ...env } : {} }, f.dependencies));
    assert.equal(f.calls.length, 0);
  }
});

test("rejects request path escapes, symlinks, directories and malformed metadata", async t => {
  const f = fixture(t);
  for (const file of [42, "relative", f.operational]) await assert.rejects(runV12NativeRollbackBridge({ ...f.options, environment: { ...f.options.environment, V12_ROLLBACK_REQUEST_PATH: file } }, f.dependencies));
  const outside = path.join(f.root, "outside.json"); writeFileSync(outside, JSON.stringify(f.request));
  await assert.rejects(runV12NativeRollbackBridge({ ...f.options, environment: { ...f.options.environment, V12_ROLLBACK_REQUEST_PATH: outside } }, f.dependencies), /native_request_invalid/u);
  const link = path.join(f.operational, "link.json"); symlinkSync(f.requestPath, link);
  await assert.rejects(runV12NativeRollbackBridge({ ...f.options, environment: { ...f.options.environment, V12_ROLLBACK_REQUEST_PATH: link } }, f.dependencies), /native_request_invalid/u);
  for (const value of [null, {}, { ...f.request, schema_version: 2 }, { ...f.request, producer: "wrong" }, { ...f.request, run_id: "wrong" },
    { ...f.request, lease: {} }, { ...f.request, lease: { lease_id: "bad", native_execution: "EXECUTED" } }, { ...f.request, lease: { lease_id: "b".repeat(48), native_execution: "SKIPPED" } }]) {
    writeFileSync(f.requestPath, JSON.stringify(value)); await assert.rejects(runV12NativeRollbackBridge(f.options, f.dependencies), /native_request_invalid/u);
  }
});

test("rejects invalid origin/device/identity before arming", async t => {
  for (const device of [undefined, "bad/device"]) {
    const f = fixture(t); await assert.rejects(runV12NativeRollbackBridge({ ...f.options, environment: { ...f.options.environment, V12_DEVICE_SERIAL: device } }, f.dependencies), /device_binding_unavailable/u);
  }
  const f = fixture(t);
  await assert.rejects(runV12NativeRollbackBridge(f.options, { ...f.dependencies, resolveTools: () => ({ execution_origin: "test-controlled/v1", test_only: true }) }), /test_environment_forbidden/u);
  await assert.rejects(runV12NativeRollbackBridge(f.options, { ...f.dependencies, resolveTools: () => ({ execution_origin: "production-attested/v1", test_only: true }) }), /test_environment_forbidden/u);
  await assert.rejects(runV12NativeRollbackBridge(f.options, { ...f.dependencies, nonce: () => "wrong" }), /arguments_invalid/u);
  f.manifest.source.tree_sha256 = "wrong"; writeFileSync(f.build, JSON.stringify(f.manifest));
  await assert.rejects(runV12NativeRollbackBridge(f.options, f.dependencies), /identity_invalid/u);
});

for (const mode of ["offline", "wifi", "mobile", "config", "date", "timeout", "malformed", "shape", "schema", "producer", "arm", "failure", "private-failure", "archive-small", "archive-large", "archive-version", "archive-swapped", "archive-hash", "facts", "command-error", "command-signal", "command-status", "command-throw"]) {
  test(`preserves fixed-code first failure without publishing: ${mode} (HOST UNIT ONLY)`, async t => {
    const f = fixture(t);
    if (mode === "offline") f.controls.offline = false;
    if (mode === "wifi") f.controls.wifi = "1";
    if (mode === "mobile") f.controls.mobile = "1";
    if (mode === "config") f.config.extra.buildProfile = "production";
    if (mode === "date") f.controls.date = "bad";
    if (mode === "timeout") f.controls.timeout = true;
    const original = f.dependencies.command;
    f.dependencies.command = (exe, args, opts) => {
      if (mode === "command-error") return { error: new Error("private"), status: 0 };
      if (mode === "command-signal") return { signal: "SIGKILL", status: 0 };
      if (mode === "command-status") return { status: 1 };
      if (mode === "command-throw") throw "private detail";
      if (args.join(" ").includes("result.json")) {
        const result = { schema_version: 1, producer: "v12-native-rollback-bridge/v1", arm: f.controls.arm, inspection: inspection(f.archive) };
        if (mode === "malformed") f.controls.result = "not-json";
        if (mode === "shape") f.controls.result = {};
        if (mode === "schema") f.controls.result = { ...result, schema_version: 2 };
        if (mode === "producer") f.controls.result = { ...result, producer: "wrong" };
        if (mode === "arm") f.controls.result = { ...result, arm: { ...f.controls.arm, nonce: "b".repeat(32) } };
        if (mode === "failure" || mode === "private-failure") f.controls.result = { schema_version: 1, producer: result.producer, arm: result.arm,
          failure: mode === "failure" ? "v12_rollback_archive_invalid" : "private source text" };
        if (mode === "archive-hash") { result.inspection.canonical_post_restore_facts.archive_sha256 = "c".repeat(64); f.controls.result = result; }
        if (mode === "facts") { result.inspection.canonical_post_restore_facts.integrity_check = "bad"; f.controls.result = result; }
      }
      return original(exe, args, opts);
    };
    if (mode === "archive-small") f.controls.returnedArchive = Buffer.alloc(25);
    if (mode === "archive-large") f.controls.returnedArchive = Buffer.alloc(32 * 1024 * 1024 + 1);
    if (mode === "archive-version") f.controls.returnedArchive = Buffer.alloc(26);
    if (mode === "archive-swapped") f.controls.returnedArchive = Buffer.alloc(26, 2);
    await assert.rejects(runV12NativeRollbackBridge({ ...f.options, ...(mode === "archive-swapped" ? { phase: "restore", archive: f.archive } : {}) }, f.dependencies), /^Error: v12_rollback_[a-z_]+$/u);
    const failed = JSON.parse(readFileSync(path.join(f.operationDir, "failure.json")));
    assert.match(failed.code, /^v12_rollback_[a-z_]+$/u);
    assert.equal(existsSync(path.join(f.root, `artifacts/native/v1.2/${runId}/rollback`)), false);
    assert.equal(existsSync(path.join(f.operationDir, "compatible-archive.gtbk")), false);
  });
}

test("does not overwrite an earlier operational attempt or follow an operations symlink", async t => {
  const f = fixture(t); await runV12NativeRollbackBridge(f.options, f.dependencies);
  const before = readFileSync(path.join(f.operationDir, "native-result.json"));
  await assert.rejects(runV12NativeRollbackBridge(f.options, f.dependencies));
  assert.deepEqual(readFileSync(path.join(f.operationDir, "native-result.json")), before);
  const g = fixture(t); rmSync(g.operational, { recursive: true }); symlinkSync(f.operational, g.operational);
  await assert.rejects(runV12NativeRollbackBridge(g.options, g.dependencies), /native_request_invalid/u);
});

test("default runtime rejects wrong-profile manifest before ANY actual ADB; default command runs only Node to prove failure", async t => {
  const f = fixture(t); f.manifest.build.profile = "production"; writeFileSync(f.build, JSON.stringify(f.manifest));
  const runtimeDependencies = { ...f.dependencies }; delete runtimeDependencies.runtime;
  await assert.rejects(runV12NativeRollbackBridge(f.options, runtimeDependencies), /identity_invalid/u);
  const sourceFixture = fixture(t);
  assert.equal(spawnSync("/usr/bin/git", ["init", "--quiet", sourceFixture.root]).status, 0);
  const sourceDependencies = { ...sourceFixture.dependencies }; delete sourceDependencies.runtime;
  await assert.rejects(runV12NativeRollbackBridge(sourceFixture.options, sourceDependencies), /source_identity_mismatch/u);
  const g = fixture(t); const commandDependencies = { ...g.dependencies,
    resolveTools: () => ({ execution_origin: "production-attested/v1", test_only: false, adb: process.execPath, unzip: process.execPath }) };
  delete commandDependencies.command;
  await assert.rejects(runV12NativeRollbackBridge(g.options, commandDependencies), /native_prerequisite_failed/u);
  const h = fixture(t); const toolDependencies = { ...h.dependencies }; delete toolDependencies.resolveTools;
  await assert.rejects(runV12NativeRollbackBridge({ ...h.options, environment: { ...h.options.environment, ANDROID_HOME: path.join(h.root, "absent-sdk") } }, toolDependencies));
});

test("default nonce/clock/wait functions remain executable without fake native claims", async t => {
  const f = fixture(t); const dependencies = { ...f.dependencies }; delete dependencies.nonce; delete dependencies.now; delete dependencies.wait;
  f.controls.absent = 1;
  const result = await runV12NativeRollbackBridge(f.options, dependencies);
  assert.equal(result.inspection.schema_version, 22);
  assert.equal(readdirSync(f.operational).filter(name => name.startsWith("rollback-")).length, 1);
});

test("rejects a result fetched after the arm deadline and preserves the failed attempt", async t => {
  const f = fixture(t); let clock = 1_000;
  f.dependencies.now = () => clock;
  const execute = f.dependencies.command;
  f.dependencies.command = (exe, args, options) => {
    const result = execute(exe, args, options);
    if (args.join(" ").includes("result.json")) clock = 181_001;
    return result;
  };
  await assert.rejects(runV12NativeRollbackBridge(f.options, f.dependencies), /native_timeout/u);
  assert.equal(existsSync(path.join(f.operationDir, "compatible-archive.gtbk")), false);
});

test("revalidates source/APK/device/lease ownership before retaining a successful result", async t => {
  const f = fixture(t); let constructors = 0;
  f.dependencies.runtime = () => {
    if (++constructors === 2) throw new Error("v12_production_native_launcher_source_identity_mismatch");
    return { withLease: async (_payload, operation) => operation() };
  };
  await assert.rejects(runV12NativeRollbackBridge(f.options, f.dependencies), /native_failed/u);
  assert.equal(constructors, 2);
  assert.equal(existsSync(path.join(f.operationDir, "compatible-archive.gtbk")), false);
});

test("rejects non-live, unrelated-run or mismatched APK manifests before transport", async t => {
  for (const patch of [{ run_id: "phase20-20261023T000000Z-bbbbbbbbbbbb" }, { mode: "fixture" },
    { build: { profile: "production" } }, { build: { profile: "development-test", package: "wrong" } },
    { device: { identity_sha256: "e".repeat(64), installed_apk_sha256: "f".repeat(64) } }]) {
    const f = fixture(t); writeFileSync(f.build, JSON.stringify({ ...f.manifest, ...patch }));
    await assert.rejects(runV12NativeRollbackBridge(f.options, f.dependencies), /identity_invalid/u);
    assert.equal(f.calls.length, 0);
  }
});

test("does not mistake a transport exit error for an absent private result", async t => {
  const f = fixture(t); const execute = f.dependencies.command;
  f.dependencies.command = (exe, args, options) => args.join(" ").includes("result.json")
    ? { status: 2, stdout: Buffer.alloc(0) } : execute(exe, args, options);
  await assert.rejects(runV12NativeRollbackBridge(f.options, f.dependencies), /native_prerequisite_failed/u);
});

test("CLI output wrapper awaits its result and sanitizes errors (HOST UNIT ONLY)", async t => {
  const writes = [];
  t.mock.method(process.stdout, "write", line => { writes.push(line); return true; });
  t.mock.method(process.stderr, "write", line => { writes.push(line); return true; });
  const previous = process.exitCode;
  await rollbackBridgeMain([], async () => ({ host_unit_only: true }));
  assert.deepEqual(writes, ['{"host_unit_only":true}\n']);
  await rollbackBridgeMain([], async () => { throw new Error("private detail"); });
  assert.equal(writes[1], "v12_rollback_native_failed\n");
  process.exitCode = previous;
});

test("CLI subprocess errors are bounded and never execute device work", () => {
  const script = new URL("./v12-native-rollback-bridge.mjs", import.meta.url).pathname;
  for (const args of [["--invalid"], ["--prepare", "--run", runId]]) {
    const env = { ...process.env }; delete env.V12_ROLLBACK_REQUEST_PATH;
    const result = spawnSync(process.execPath, [script, ...args], { env, encoding: "utf8" });
    assert.equal(result.status, 1); assert.match(result.stderr, /^v12_rollback_[a-z_]+\s*$/u);
  }
});
