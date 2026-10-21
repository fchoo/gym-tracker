import assert from "node:assert/strict";
import test from "node:test";
import { createV12PosixProcessTreeTracker, V12_POSIX_OWNERSHIP_ENV } from "./v12-posix-process-tree.mjs";

const token = "a".repeat(64);
const marker = `${V12_POSIX_OWNERSHIP_ENV}=${token}`;
const row = `100 S synthetic ${marker}`;
const table = (stdout = "") => ({ status: 0, signal: null, stdout });
const success = () => ({ status: 0, signal: null, stdout: "ok\n", stderr: "" });
const options = (extra = {}) => ({
  ownershipToken: token,
  platform: "linux",
  probeImplementation: () => table(),
  pidfdSignalImplementation: success,
  ...extra,
});

function rejects(value, code) {
  assert.throws(() => createV12PosixProcessTreeTracker(value), { message: `v12_posix_process_tree_${code}` });
}

test("tracker rejects invalid tokens, platforms, dependencies and deadlines", () => {
  rejects(undefined, "arguments_invalid");
  for (const extra of [
    { ownershipToken: "bad" }, { platform: "win32" },
    { probeImplementation: null }, { pidfdSignalImplementation: null },
    { pidfdPythonExecutable: null }, { pidfdPythonExecutable: "" },
    { probeTimeoutMs: 0 }, { probeTimeoutMs: 1.5 },
  ]) rejects(options(extra), "arguments_invalid");
});

test("default platform and subprocess dependencies can prove an empty ownership set", () => {
  // An opaque synthetic token is absent from real process environments.
  const tracker = createV12PosixProcessTreeTracker({ ownershipToken: "b".repeat(64) });
  assert.equal(tracker.treeState(), "empty");
  assert.equal(tracker.signal("SIGTERM"), true);
  assert.equal(tracker.treeState(), "empty");
  tracker.stop();
  assert.throws(() => tracker.treeState(), /v12_posix_process_tree_stopped/u);
});

test("empty sets permit both signals, require fresh emptiness and reject reuse after stop", () => {
  const tracker = createV12PosixProcessTreeTracker(options());
  assert.throws(() => tracker.stop(), /v12_posix_process_tree_not_empty/u);
  assert.throws(() => tracker.signal("SIGINT"), /v12_posix_process_tree_signal_invalid/u);
  assert.equal(tracker.signal("SIGTERM"), true);
  assert.equal(tracker.signal("SIGKILL"), true);
  assert.equal(tracker.treeState(), "empty");
  tracker.stop();
  assert.throws(() => tracker.signal("SIGTERM"), /v12_posix_process_tree_stopped/u);
});

test("a newly discovered process blocks stop even after a prior empty probe", () => {
  let content = "";
  const tracker = createV12PosixProcessTreeTracker(options({ probeImplementation: () => table(content) }));
  assert.equal(tracker.treeState(), "empty");
  content = row;
  assert.throws(() => tracker.stop(), /v12_posix_process_tree_not_empty/u);
  assert.equal(tracker.treeState(), "alive");
  content = "";
  assert.equal(tracker.treeState(), "empty");
  tracker.stop();
});

test("ownership matching is exact at both boundaries and ignores zombies", () => {
  const signals = [];
  const content = [
    `100 S ${marker}`,
    `101 S command ${marker} extra`,
    `102 S command prefix${marker}`,
    `103 S command ${marker}suffix`,
    `104 S command prefix${marker} ${marker}`,
    `105 Z ${marker}`,
    `106 S command unrelated=value`,
  ].join("\n");
  const tracker = createV12PosixProcessTreeTracker(options({
    probeImplementation: () => table(content),
    pidfdSignalImplementation: (_program, args, callOptions) => {
      signals.push({ args, callOptions });
      return success();
    },
  }));
  assert.equal(tracker.treeState(), "alive");
  assert.equal(tracker.signal("SIGKILL"), true);
  assert.deepEqual(signals[0].args.slice(3), ["100", "101", "104"]);
  assert.equal(signals[0].callOptions.input, `${token}\n`);
});

test("malformed, oversized and invalid-PID process tables fail closed", () => {
  for (const stdout of [
    null, "invalid", "0 S command", "9007199254740992 S command",
    Array.from({ length: 4097 }, () => "1 S command").join("\n"),
  ]) rejects(options({ probeImplementation: () => table(stdout) }), "enumeration_failed");
});

test("failed and thrown process probes reveal only fixed error codes", () => {
  for (const outcome of [undefined, { status: 1 }, { status: 0, signal: "SIGTERM" },
    { status: 0, signal: null, error: new Error("synthetic-private") }]) {
    rejects(options({ probeImplementation: () => outcome }), "enumeration_failed");
  }
  rejects(options({ probeImplementation: () => { throw new Error("synthetic-private"); } }), "enumeration_failed");
});

test("a later enumeration failure permanently blocks the tracker without signalling", () => {
  let fail = false;
  let calls = 0;
  const tracker = createV12PosixProcessTreeTracker(options({
    probeImplementation: () => fail ? table("invalid") : table(row),
    pidfdSignalImplementation: () => { calls += 1; return success(); },
  }));
  fail = true;
  assert.throws(() => tracker.treeState(), /v12_posix_process_tree_enumeration_failed/u);
  assert.throws(() => tracker.treeState(), /v12_posix_process_tree_failed/u);
  assert.throws(() => tracker.signal("SIGTERM"), /v12_posix_process_tree_failed/u);
  assert.equal(calls, 0);
});

test("Darwin uses its environment enumeration flag and sends no unsupported signal", () => {
  const probes = [];
  let helperCalls = 0;
  const tracker = createV12PosixProcessTreeTracker(options({
    platform: "darwin",
    probeImplementation: (program, args) => { probes.push([program, args]); return table(row); },
    pidfdSignalImplementation: () => { helperCalls += 1; return success(); },
  }));
  assert.deepEqual(probes[0], ["ps", ["-Eww", "-axo", "pid=,stat=,args="]]);
  assert.throws(() => tracker.signal("SIGTERM"), /v12_posix_process_tree_stable_signal_unavailable/u);
  assert.equal(helperCalls, 0);
});

test("Linux submits the complete candidate set to one bounded pidfd helper transaction", () => {
  const calls = [];
  const tracker = createV12PosixProcessTreeTracker(options({
    probeImplementation: (program, args) => {
      assert.equal(program, "ps");
      assert.deepEqual(args, ["eww", "-axo", "pid=,stat=,args="]);
      return table(`${row}\n101 S ${marker}`);
    },
    pidfdPythonExecutable: "/synthetic/python3",
    pidfdSignalImplementation: (program, args, callOptions) => {
      calls.push({ program, args, callOptions }); return success();
    },
  }));
  assert.equal(tracker.signal("SIGTERM"), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].program, "/synthetic/python3");
  assert.match(calls[0].args[0], /v12-linux-pidfd-signal\.py$/u);
  assert.equal(calls[0].args[1], "SIGTERM");
  assert.ok(Number(calls[0].args[2]) > 0);
  assert.deepEqual(calls[0].args.slice(3), ["100", "101"]);
  assert.equal(calls[0].callOptions.input, `${token}\n`);
  assert.equal(calls[0].callOptions.maxBuffer, 64 * 1024);
});

test("pidfd helper errors, missing outcomes and malformed acknowledgements fail closed", () => {
  for (const outcome of [
    undefined, { status: 1 }, { status: 0, signal: "SIGTERM" },
    { status: 0, signal: null, error: new Error("synthetic-private") },
    { status: 0, signal: null, stdout: "not-ok\n" },
    { status: 0, signal: null, stdout: "ok\n", stderr: "synthetic-private" },
  ]) {
    const tracker = createV12PosixProcessTreeTracker(options({
      probeImplementation: () => table(row), pidfdSignalImplementation: () => outcome,
    }));
    assert.throws(() => tracker.signal("SIGTERM"), /v12_posix_process_tree_stable_signal_failed/u);
  }
  const tracker = createV12PosixProcessTreeTracker(options({
    probeImplementation: () => table(row),
    pidfdSignalImplementation: () => { throw new Error("synthetic-private"); },
  }));
  assert.throws(() => tracker.signal("SIGTERM"), /v12_posix_process_tree_stable_signal_failed/u);
});

test("a pidfd helper acknowledgement may omit empty stderr", () => {
  const tracker = createV12PosixProcessTreeTracker(options({
    probeImplementation: () => table(row),
    pidfdSignalImplementation: () => ({ status: 0, signal: null, stdout: "ok\n" }),
  }));
  assert.equal(tracker.signal("SIGTERM"), true);
});

test("one end-to-end signal deadline covers discovery and helper acquisition", () => {
  const originalNow = Date.now;
  for (const timeline of [[100, 2000], [100, 100, 2000]]) {
    let helperCalls = 0;
    const tracker = createV12PosixProcessTreeTracker(options({
      probeImplementation: () => table(row),
      pidfdSignalImplementation: () => { helperCalls += 1; return success(); },
    }));
    let index = 0;
    try {
      Date.now = () => timeline[Math.min(index++, timeline.length - 1)];
      assert.throws(() => tracker.signal("SIGTERM"), /v12_posix_process_tree_enumeration_failed/u);
    } finally { Date.now = originalNow; }
    assert.equal(helperCalls, 0);
  }
});

