import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  V12_PRODUCTION_NATIVE_MAX_REQUEST_BYTES,
  readV12ProductionNativeRequest,
} from "./v12-production-native-adapter-launcher.mjs";

const listenerCounts = (stream) => Object.fromEntries(
  ["data", "end", "error", "close"].map((event) => [event, stream.listenerCount(event)]),
);

async function rejectedRequest(trigger, pattern) {
  const stream = new PassThrough();
  const before = listenerCounts(stream);
  const controller = new AbortController();
  const request = readV12ProductionNativeRequest(stream, { signal: controller.signal });
  await trigger({ stream, controller });
  await assert.rejects(request, pattern);
  assert.deepEqual(listenerCounts(stream), before);
}

test("readRequest parses one bounded request and removes every listener", async () => {
  const stream = new PassThrough();
  const before = listenerCounts(stream);
  const request = readV12ProductionNativeRequest(stream);
  stream.end('{"ok":true}');
  assert.deepEqual(await request, { ok: true });
  assert.deepEqual(listenerCounts(stream), before);
});

test("readRequest handles abort, stream error, premature close, and oversize without listener leaks", async () => {
  await rejectedRequest(({ controller }) => controller.abort(), /termination_requested/u);
  await rejectedRequest(({ stream }) => stream.emit("error", new Error("untrusted-stream-error")), /request_read_failed/u);
  await rejectedRequest(({ stream }) => stream.emit("close"), /request_premature_close/u);
  await rejectedRequest(({ stream }) => stream.write("x".repeat(V12_PRODUCTION_NATIVE_MAX_REQUEST_BYTES + 1)), /request_too_large/u);
});

test("termination interrupts launcher stdin startup after a deterministic readiness handshake", { timeout: 10_000 }, async () => {
  const launcher = new URL("./v12-production-native-adapter-launcher.mjs", import.meta.url).pathname;
  const environment = { ...process.env, NODE_ENV: "production" };
  for (const key of ["V12_NATIVE_ADAPTER_COMMAND", "V12_NATIVE_ADAPTER_TEST_MODE", "V12_NATIVE_ADAPTER_TEST_PROCESS", "NODE_TEST_CONTEXT"]) delete environment[key];
  const child = spawn(process.execPath, [launcher, "--action", "acquire-lease"], {
    cwd: process.cwd(),
    env: environment,
    stdio: ["pipe", "pipe", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  await new Promise((resolve, reject) => {
    child.stdio[3].once("data", resolve);
    child.once("error", reject);
    child.once("close", () => reject(new Error("launcher_closed_before_ready")));
  });
  child.kill("SIGTERM");
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status, signal) => resolve({ status, signal }));
  });
  assert.deepEqual(result, { status: 1, signal: null });
  assert.equal(Buffer.concat(stdout).toString("utf8"), "");
  assert.equal(Buffer.concat(stderr).toString("utf8"), "v12_production_native_launcher_termination_requested\n");
});

test("controlled and fake tools use structured async exit and drain discipline", () => {
  for (const file of [
    "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs",
    "scripts/testing/v12-phase20-blackbox/fake-device-tool.mjs",
    "scripts/testing/v12-production-domain/controlled-domain-tool.mjs",
    "scripts/testing/v12-production-launcher/controlled-device-tool.mjs",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /process\.exit\(/u, file);
    assert.match(source, /async function main\(/u, file);
    assert.match(source, /process\.exitCode\s*=\s*await main\(\)/u, file);
    assert.match(source, /await drain\(\)/u, file);
  }
});
