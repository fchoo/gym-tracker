import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createV12DirectMaestroToolAttestation, executeGenericV12Maestro, executeLiveV12GenericMaestro, readV12DirectMaestroDeviceMeasurement, runV12BoundedProcess, runV12MaestroCli, validateV12LiveSourceLineage } from "../run-v12-maestro.mjs";
import { fixture, runId, DEVICE_FACTS } from "./closeout-maestro-fixture.mjs";

test("caller cancellation terminates the owned tool tree and rejects the pending operation", async () => {
  const controller = new AbortController();
  const child = new EventEmitter();
  child.pid = 5001;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let alive = true;
  const signals = [];
  const pending = runV12BoundedProcess(process.execPath, ["--version"], {
    signal: controller.signal, timeoutMs: 3000, termGraceMs: 10, killGraceMs: 10,
    platform: "win32", spawnImplementation: () => child,
    windowsTreeProbeImplementation: () => ({ status: 0, signal: null, stdout: alive ? "5001\n" : "" }),
    taskkillImplementation: (program, args) => {
      signals.push([program, args]);
      alive = false;
      queueMicrotask(() => child.emit("close", null, "SIGTERM"));
      return { status: 0, signal: null, stdout: "", stderr: "" };
    },
  });
  controller.abort();
  await assert.rejects(pending, /v12_maestro_process_cancelled/u);
  assert.deepEqual(signals, [["taskkill", ["/PID", "5001", "/T"]]]);
});

test("the CLI cancellation handler stops before SDK dispatch and leaves no publication", async t => {
  const value = fixture(t, "multi-plan");
  let cancelled = false;
  const output = [];
  const errors = [];
  const originalListeners = process.listenerCount("SIGTERM");
  const execute = (program, args, options) => {
    if (!cancelled && program === value.tools.adb) {
      cancelled = true;
      process.emit("SIGTERM");
    }
    return value.execute(program, args, options);
  };
  const status = await runV12MaestroCli(["--run", runId, "--shard", "multi-plan"], {
    stdout: { write: value => output.push(value) }, stderr: { write: value => errors.push(value) },
  }, {
    root: value.root, serial: DEVICE_FACTS.serial, currentHead: value.build.source.head,
    sourceDigest: value.build.source.tree_sha256, isAncestor: () => true,
    currentIdentity: value.currentIdentity, executionTools: value.tools, execFileSync: execute,
  });
  assert.equal(cancelled, true);
  assert.equal(status, 1);
  assert.match(errors.join(""), /^v12_maestro_native_command_failed\n$/u);
  assert.equal(output.length, 0);
  assert.equal(value.maestroCaseIds.length, 0);
  assert.equal(existsSync(path.join(value.root, `artifacts/native/v1.2/${runId}/publication/multi-plan.json`)), false);
  assert.equal(process.listenerCount("SIGTERM"), originalListeners);
});

test("owned-process supervision rejects malformed arguments before spawning", async () => {
  for (const changes of [{ timeoutMs: 0 }, { termGraceMs: 0 }, { killGraceMs: 0 }, { platform: "unknown" }, { spawnImplementation: null }, { posixPidfdPythonExecutable: "" }]) {
    let calls = 0;
    await assert.rejects(runV12BoundedProcess(process.execPath, [], { timeoutMs: 1000, spawnImplementation: () => { calls += 1; assert.fail("invalid inputs must not spawn"); }, ...changes }), /v12_maestro_process_arguments_invalid/u);
    assert.equal(calls, 0);
  }
});

test("supervision drains owned children after transport errors and output limits", async t => {
  const cases = [
    ["stdout limit", child => child.stdout.emit("data", "12345"), /v12_maestro_process_output_limit/u],
    ["stderr limit", child => child.stderr.emit("data", Buffer.from("12345")), /v12_maestro_process_output_limit/u],
    ["spawn error", child => child.emit("error", Error("controlled spawn error")), /v12_maestro_process_spawn_failed/u],
    ["nonzero exit", child => child.emit("close", 1, null), /v12_maestro_process_failed/u],
    ["signalled exit", child => child.emit("close", null, "SIGTERM"), /v12_maestro_process_failed/u],
  ];
  for (const [name, trigger, expected] of cases) await t.test(name, async () => {
    const child = new EventEmitter();
    child.pid = 7001;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    let alive = true;
    const calls = [];
    const pending = runV12BoundedProcess(process.execPath, [], {
      platform: "win32", timeoutMs: 1000, termGraceMs: 10, killGraceMs: 10, maxBuffer: 4,
      spawnImplementation: () => child,
      windowsTreeProbeImplementation: () => ({ status: 0, signal: null, stdout: alive ? "7001\n" : "" }),
      taskkillImplementation: (program, args) => {
        calls.push([program, args]);
        alive = false;
        if (!["nonzero exit", "signalled exit"].includes(name)) queueMicrotask(() => child.emit("close", 0, null));
        return { status: 0, signal: null, stdout: "", stderr: "" };
      },
    });
    trigger(child);
    await assert.rejects(pending, expected);
    assert.deepEqual(calls, [["taskkill", ["/PID", "7001", "/T"]]]);
    child.emit("close", 0, null);
    child.emit("error", Error("late controlled error"));
    assert.equal(calls.length, 1);
  });
});

test("task-tree enumeration and termination errors fail closed", async t => {
  const cases = [
    ["probe throws", () => { throw Error("probe failure"); }],
    ["probe reports error", () => ({ status: 1, signal: null, stdout: "" })],
    ["invalid PID", () => ({ status: 0, signal: null, stdout: "-1\n" })],
    ["too many PIDs", () => ({ status: 0, signal: null, stdout: Array(4097).fill("7001").join("\n") })],
  ];
  for (const [name, probe] of cases) await t.test(name, async () => {
    const child = new EventEmitter();
    child.pid = 7001;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    const calls = [];
    const pending = runV12BoundedProcess(process.execPath, [], {
      platform: "win32", timeoutMs: 1000, termGraceMs: 10, killGraceMs: 10,
      spawnImplementation: () => child, windowsTreeProbeImplementation: probe,
      taskkillImplementation: (program, args) => { calls.push([program, args]); throw Error("kill failure"); },
    });
    child.emit("close", 0, null);
    await assert.rejects(pending, /v12_maestro_process_tree_termination_failed/u);
    assert.deepEqual(calls, [["taskkill", ["/PID", "7001", "/T"]], ["taskkill", ["/PID", "7001", "/T", "/F"]]]);
  });
});

test("the alternate recovery CLI publishes its bounded execution result after every declared flow", async t => {
  const value = fixture(t, "multi-plan");
  const flow = path.join(value.root, "maestro/v1.2/recovery.yaml");
  mkdirSync(path.dirname(flow), { recursive: true });
  writeFileSync(flow, "appId: com.fchoo.gymtracker.devtest\n---\n- launchApp\n");
  const commands = [];
  const output = [];
  const errors = [];
  const execute = (program, args) => {
    assert.equal(path.isAbsolute(program), true);
    if (path.basename(program) === "maestro" && args[0] === "--version") return "2.8.0\n";
    if (path.basename(program) === "maestro") {
      assert.equal(args[0], "sdk-flow");
      commands.push(args);
      writeFileSync(args[args.indexOf("--junit") + 1], "<testsuite><testcase name='recovery'/></testsuite>\n");
      return "";
    }
    if (path.basename(program) === "adb" && args.includes("get")) return "0\n";
    return "";
  };
  const status = await runV12MaestroCli(["--run", runId, "--shard", "recovery"], {
    stdout: { write: value => output.push(value) }, stderr: { write: value => errors.push(value) },
  }, { root: value.root, currentHead: value.build.source.head,
    sourceDigest: value.build.source.tree_sha256, isAncestor: () => true,
    currentIdentity: value.currentIdentity, executionTools: value.tools,
    serial: DEVICE_FACTS.serial, execFileSync: execute });
  assert.equal(status, 0, errors.join(""));
  assert.equal(errors.length, 0);
  assert.equal(JSON.parse(output.join("")).executions, 224);
  assert.equal(commands.length, 224);
  for (const args of commands) assert.deepEqual(args.filter(arg => arg.startsWith("V12_")).map(arg => arg.split("=")[0]), ["V12_DOMAIN_NONCE", "V12_RECOVERY_CASE", "V12_RECOVERY_STEP", "V12_RECOVERY_STAGE", "V12_RECOVERY_PHASE"]);
});

test("legacy adapter failures restore settings and never write a successful record", t => {
  const value = fixture(t, "multi-plan");
  let restored = 0;
  const marker = Error("controlled adapter failure");
  assert.throws(() => executeGenericV12Maestro(["--run", runId, "--shard", "multi-plan"], {
    root: value.root, currentIdentity: value.currentIdentity,
    adapter: { snapshotSettings: () => ({ bounded: true }), execute: () => { throw marker; }, restoreSettings: () => { restored += 1; return true; } },
    writeImmutableJson: () => assert.fail("failed execution must not write"),
  }), error => error === marker);
  assert.equal(restored, 1);
  const observations = value.caseIds.map((case_id, index) => ({ case_id, ordinal: index + 1,
    fixture_id: "v12-synthetic-fixtures-r18", report_sha256: "a".repeat(64), execution_receipt: {} }));
  const output = executeGenericV12Maestro(["--run", runId, "--shard", "multi-plan"], {
    root: value.root, currentIdentity: value.currentIdentity,
    adapter: { snapshotSettings: () => ({ bounded: true }), execute: () => ({ observations }), restoreSettings: () => { restored += 1; return true; } },
  });
  assert.equal(output.case_ids.length, value.caseIds.length);
  assert.equal(restored, 2);
  assert.equal(existsSync(path.join(value.root, `artifacts/native/v1.2/${runId}/mapping/multi-plan.json`)), true);
});

test("tool attestation rejects absent or nonexecutable tool files", t => {
  const value = fixture(t, "multi-plan");
  for (const adb of [path.join(value.root, "missing-tool"), path.join(value.root, "tools")]) {
    assert.throws(() => createV12DirectMaestroToolAttestation({ executionTools: { ...value.tools, adb }, execute: value.execute, shard: "multi-plan" }), /v12_maestro_toolchain_invalid/u);
  }
});

test("source lineage rejects invalid identities and an unproven ancestor", () => {
  const manifest = { source: { head: "a".repeat(40), tree_sha256: "b".repeat(64) } };
  const dependencies = { currentHead: "c".repeat(40), sourceDigest: "b".repeat(64), isAncestor: () => true };
  assert.throws(() => validateV12LiveSourceLineage({ source: { ...manifest.source, head: "invalid" } }, dependencies), /v12_maestro_identity_mismatch/u);
  assert.throws(() => validateV12LiveSourceLineage(manifest, { ...dependencies, currentHead: "invalid" }), /v12_maestro_identity_mismatch/u);
  assert.throws(() => validateV12LiveSourceLineage(manifest, { ...dependencies, isAncestor: () => false }), /v12_maestro_source_lineage_mismatch/u);
  assert.throws(() => validateV12LiveSourceLineage(manifest, { currentHead: "f".repeat(40), sourceDigest: "b".repeat(64) }), /v12_maestro_source_lineage_mismatch/u);
  for (const args of [null, [], ["--run", runId], ["--run", "invalid", "--shard", "multi-plan"], ["--run", runId, "--shard", "unknown"]]) {
    assert.throws(() => executeGenericV12Maestro(args), /v12_maestro_arguments_invalid/u);
  }
});

test("a successfully closed owned process retains bounded stdout and stops its empty POSIX tracker", async () => {
  const child = new EventEmitter();
  child.pid = 7001;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let probes = 0;
  const pending = runV12BoundedProcess(process.execPath, [], {
    platform: "linux", timeoutMs: 1000, termGraceMs: 10, killGraceMs: 10,
    spawnImplementation: () => child,
    posixProcessProbeImplementation: () => { probes += 1; return { status: 0, signal: null, stdout: "" }; },
    posixPidfdSignalImplementation: () => assert.fail("empty owned process set must not be signalled"),
  });
  child.stdout.emit("data", "ok");
  child.emit("close", 0, null);
  assert.equal(await pending, "ok");
  assert.ok(probes > 0);
});

test("failed cooperative Windows termination escalates once and verifies the drained tree", async () => {
  const child = new EventEmitter();
  child.pid = 7001;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let alive = true;
  const calls = [];
  const pending = runV12BoundedProcess(process.execPath, [], {
    platform: "win32", timeoutMs: 1000, termGraceMs: 10, killGraceMs: 10,
    spawnImplementation: () => child,
    windowsTreeProbeImplementation: () => ({ status: 0, signal: null, stdout: alive ? "7001\n" : "" }),
    taskkillImplementation: (program, args) => {
      calls.push(args);
      if (!args.includes("/F")) return { status: 1, signal: null, stdout: "", stderr: "controlled cooperative failure" };
      alive = false;
      return { status: 0, signal: null, stdout: "", stderr: "" };
    },
  });
  child.emit("close", 0, null);
  assert.equal(await pending, "");
  assert.deepEqual(calls, [["/PID", "7001", "/T"], ["/PID", "7001", "/T", "/F"]]);
});

test("the production default subprocess route rejects an invalid tool before SDK execution", async t => {
  const value = fixture(t, "multi-plan");
  writeFileSync(value.tools.maestro, "#!/bin/sh\nexit 1\n");
  await assert.rejects(executeLiveV12GenericMaestro(["--run", runId, "--shard", "multi-plan"], {
    root: value.root, serial: DEVICE_FACTS.serial, currentHead: value.build.source.head,
    sourceDigest: value.build.source.tree_sha256, isAncestor: () => true,
    executionTools: { ...value.tools, execution_origin: "production-attested/v1", test_only: false },
  }), /v12_maestro_maestro_version_invalid/u);
  assert.equal(value.maestroCaseIds.length, 0);
  assert.equal(existsSync(path.join(value.root, `artifacts/native/v1.2/${runId}/mapping/multi-plan.json`)), false);
});

test("generic execution rejects a missing or non-file retained APK before dispatch", async t => {
  for (const kind of ["missing", "directory"]) await t.test(kind, async () => {
    const value = fixture(t, "multi-plan");
    const apk = path.join(value.root, value.build.build.apk.path);
    rmSync(apk);
    if (kind === "directory") mkdirSync(apk);
    await assert.rejects(executeLiveV12GenericMaestro(["--run", runId, "--shard", "multi-plan"], {
      root: value.root, serial: DEVICE_FACTS.serial, currentHead: value.build.source.head,
      sourceDigest: value.build.source.tree_sha256, isAncestor: () => true,
      executionTools: value.tools, execFileSync: value.execute,
    }), /v12_maestro_identity_mismatch/u);
    assert.equal(value.maestroCaseIds.length, 0);
  });
});

test("direct generic execution retains actual JUnit and mapping outputs without a writer override", async t => {
  const value = fixture(t, "multi-plan");
  const result = await executeLiveV12GenericMaestro(["--run", runId, "--shard", "multi-plan"], {
    root: value.root, serial: DEVICE_FACTS.serial, currentHead: value.build.source.head,
    sourceDigest: value.build.source.tree_sha256, isAncestor: () => true,
    executionTools: value.tools, execFileSync: value.execute,
  });
  assert.equal(result.shard, "multi-plan");
  assert.equal(existsSync(path.join(value.root, `artifacts/native/v1.2/${runId}/maestro/multi-plan.xml`)), true);
  assert.equal(existsSync(path.join(value.root, `artifacts/native/v1.2/${runId}/mapping/multi-plan.json`)), true);
});

test("an unresolved process-tree error at the publication boundary preserves the device lease", async t => {
  const value = fixture(t, "multi-plan");
  const failure = Error("v12_maestro_process_tree_termination_failed");
  await assert.rejects(executeLiveV12GenericMaestro(["--run", runId, "--shard", "multi-plan"], {
    root: value.root, serial: DEVICE_FACTS.serial, currentHead: value.build.source.head,
    sourceDigest: value.build.source.tree_sha256, isAncestor: () => true,
    executionTools: value.tools, execFileSync: value.execute,
    writeReport: () => { throw failure; },
  }), error => error === failure);
  const leaseDirectory = path.join(value.root, `artifacts/native/v1.2/${runId}/.leases`);
  assert.equal(existsSync(leaseDirectory), true);
  assert.equal(existsSync(path.join(value.root, `artifacts/native/v1.2/${runId}/mapping/multi-plan.json`)), false);
});
