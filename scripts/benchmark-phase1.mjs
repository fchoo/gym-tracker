#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
} from "node:fs";
import {
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const RESULT_MARKER = "GYM_TRACKER_PHASE1_BENCHMARK_RESULT:";
const projectRoot = process.cwd();
const args = process.argv.slice(2);
let manifestArgument = "artifacts/native/phase1/build.json";
let samples = 100;
let maxP95Ms = 150;
let maxJsTaskMs = 50;
let deviceKind = "emulator";

function fail(message) {
  console.error(JSON.stringify({
    ok: false,
    error: "phase1_benchmark_failed",
    message,
  }));
  process.exit(1);
}

function numberArgument(value, label, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    fail(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--manifest") {
    manifestArgument = args[index + 1] ?? "";
    index += 1;
  } else if (argument.startsWith("--manifest=")) {
    manifestArgument = argument.slice("--manifest=".length);
  } else if (argument === "--samples") {
    samples = numberArgument(args[index + 1], "--samples", 100, 500);
    index += 1;
  } else if (argument.startsWith("--samples=")) {
    samples = numberArgument(
      argument.slice("--samples=".length),
      "--samples",
      100,
      500,
    );
  } else if (argument === "--max-p95-ms") {
    maxP95Ms = numberArgument(args[index + 1], "--max-p95-ms", 1, 10_000);
    index += 1;
  } else if (argument.startsWith("--max-p95-ms=")) {
    maxP95Ms = numberArgument(
      argument.slice("--max-p95-ms=".length),
      "--max-p95-ms",
      1,
      10_000,
    );
  } else if (argument === "--max-js-task-ms") {
    maxJsTaskMs = numberArgument(
      args[index + 1],
      "--max-js-task-ms",
      1,
      10_000,
    );
    index += 1;
  } else if (argument.startsWith("--max-js-task-ms=")) {
    maxJsTaskMs = numberArgument(
      argument.slice("--max-js-task-ms=".length),
      "--max-js-task-ms",
      1,
      10_000,
    );
  } else if (argument === "--device") {
    deviceKind = args[index + 1] ?? "";
    index += 1;
  } else if (argument.startsWith("--device=")) {
    deviceKind = argument.slice("--device=".length);
  } else {
    fail(`unknown argument: ${argument}`);
  }
}

if (!Number.isInteger(samples)) {
  fail("--samples must be an integer.");
}
if (deviceKind !== "emulator" && deviceKind !== "physical") {
  fail("--device must be emulator or physical.");
}

const manifestPath = path.resolve(projectRoot, manifestArgument);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const artifactDirectory = path.dirname(manifestPath);
const resultPath = path.join(
  artifactDirectory,
  deviceKind === "physical"
    ? "benchmark-physical.json"
    : "benchmark.json",
);
const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), "gym-phase1-benchmark-"),
);

function command(name, commandArgs, options = {}) {
  const child = spawn(name, commandArgs, {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          child.kill("SIGKILL");
          reject(new Error(
            `${name} timed out after ${options.timeoutMs} ms`,
          ));
        }, options.timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      options.onOutput?.(chunk.toString("utf8"));
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      options.onOutput?.(chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${name} exited ${code}: ${stderr || stdout}`));
      }
    });
  });
}

function git(...gitArgs) {
  return command("git", gitArgs);
}

function sourcePaths() {
  const output = readFileSync(
    path.join(temporaryDirectory, "source-files"),
  );
  const excluded = /^(?:android|ios|node_modules|artifacts|\.expo|\.gradle|\.kotlin|\.cache|coverage|dist|web-build)(?:\/|$)|^modules\/[^/]+\/android\/build(?:\/|$)|(?:^|\/)\.metro-health-check|\.tsbuildinfo$/;
  return output.toString("utf8").split("\0")
    .filter(Boolean)
    .filter((filePath) => !excluded.test(filePath))
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

function sourceTreeSha256() {
  const hash = createHash("sha256");
  for (const filePath of sourcePaths()) {
    const details = lstatSync(filePath);
    const type = details.isSymbolicLink()
      ? "symlink"
      : details.isFile()
        ? "file"
        : "other";
    const contents = details.isSymbolicLink()
      ? Buffer.from(readlinkSync(filePath))
      : details.isFile()
        ? readFileSync(filePath)
        : Buffer.alloc(0);
    const pathBytes = Buffer.from(filePath);
    hash.update(Buffer.from(
      `${pathBytes.length}\0${type}\0${(details.mode & 0o777).toString(8)}\0${contents.length}\0`,
    ));
    hash.update(pathBytes);
    hash.update(Buffer.from("\0"));
    hash.update(contents);
    hash.update(Buffer.from("\0"));
  }
  return hash.digest("hex");
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

const androidHome = process.env.ANDROID_HOME
  ?? process.env.ANDROID_SDK_ROOT
  ?? "/opt/homebrew/share/android-commandlinetools";
const adbExecutable = path.join(androidHome, "platform-tools", "adb");
const physicalAllowlistDurationMs = 300_000;
const physicalPollIntervalMs = 5_000;
let benchmarkSerial = manifest.device.serial;
let physicalAllowlistGranted = false;

function adb(...adbArgs) {
  return command(adbExecutable, ["-s", benchmarkSerial, ...adbArgs]);
}

async function attachedDevices() {
  const output = await command(adbExecutable, ["devices", "-l"]);
  return output
    .split(/\r?\n/u)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      serial: line.split(/\s+/u)[0],
      ready: /\sdevice(?:\s|$)/u.test(line),
      emulator: line.startsWith("emulator-")
        || /\bproduct:sdk_/u.test(line)
        || /\bdevice:emu/u.test(line),
    }))
    .filter((device) => device.ready);
}

async function selectPhysicalDevice() {
  const physicalDevices = (await attachedDevices()).filter(
    (device) => !device.emulator,
  );
  if (physicalDevices.length !== 1) {
    throw new Error(
      `exactly one ready physical Android device is required; found ${physicalDevices.length}.`,
    );
  }
  return physicalDevices[0].serial;
}

async function installExactApk(apkPath) {
  await command(
    adbExecutable,
    ["-s", benchmarkSerial, "install", "-r", apkPath],
    { timeoutMs: 180_000 },
  );
}

async function physicalDeviceMetadata() {
  const [
    api,
    abi,
    model,
    androidRelease,
    memory,
  ] = await Promise.all([
    adb("shell", "getprop", "ro.build.version.sdk"),
    adb("shell", "getprop", "ro.product.cpu.abi"),
    adb("shell", "getprop", "ro.product.model"),
    adb("shell", "getprop", "ro.build.version.release"),
    adb("shell", "cat", "/proc/meminfo"),
  ]);
  const memoryKiB = Number(memory.match(/^MemAvailable:\s+(\d+)\s+kB$/mu)?.[1]);
  if (!Number.isSafeInteger(memoryKiB) || memoryKiB < 1) {
    throw new Error("physical-device free memory could not be read.");
  }
  return {
    kind: "physical",
    serial_hash: createHash("sha256")
      .update(benchmarkSerial)
      .digest("hex"),
    api: Number(api.replace(/\r/gu, "")),
    abi: abi.replace(/\r/gu, ""),
    model: model.replace(/\r/gu, ""),
    android_release: androidRelease.replace(/\r/gu, ""),
    free_memory_bytes: memoryKiB * 1_024,
  };
}

async function assertPhysicalDisplayOff() {
  const display = await adb("shell", "dumpsys", "display");
  const state = display.match(/Display State=([A-Z]+)/u)?.[1];
  const brightness = display.match(/Display Brightness=([^\s]+)/u)?.[1];
  if (state !== "OFF" || brightness !== "-1.0") {
    throw new Error(
      `physical OLED must remain off; state=${state ?? "unknown"} brightness=${brightness ?? "unknown"}.`,
    );
  }
}

async function startPhysicalBenchmark() {
  const output = await adb(
    "shell",
    "am",
    "startservice",
    "--user",
    "0",
    "-n",
    `${manifest.package}/.GymTrackerPhysicalTestService`,
    "-e",
    "suite",
    "benchmark",
    "--ei",
    "samples",
    String(samples),
  );
  if (!/Starting service:/u.test(output)) {
    throw new Error(`physical Headless JS service did not start: ${output}`);
  }
}

async function preparePhysicalHeadlessExecution() {
  await adb("shell", "am", "force-stop", manifest.package);
  await adb(
    "shell",
    "pm",
    "unstop",
    "--user",
    "0",
    manifest.package,
  );
  await adb(
    "shell",
    "cmd",
    "deviceidle",
    "tempwhitelist",
    "-u",
    "0",
    "-d",
    String(physicalAllowlistDurationMs),
    manifest.package,
  );
  physicalAllowlistGranted = true;
}

async function releasePhysicalHeadlessExecution() {
  await adb(
    "shell",
    "cmd",
    "deviceidle",
    "tempwhitelist",
    "-u",
    "0",
    "-r",
    manifest.package,
  );
  physicalAllowlistGranted = false;
}

async function waitForResult() {
  const attempts = deviceKind === "physical" ? 60 : 1_200;
  const pollIntervalMs = deviceKind === "physical"
    ? physicalPollIntervalMs
    : 500;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (deviceKind === "physical") {
      await assertPhysicalDisplayOff();
    }
    const output = await adb(
      "logcat",
      "-d",
      "-v",
      "raw",
      "ReactNativeJS:I",
      "*:S",
    );
    const payload = output.split(/\r?\n/u)
      .findLast((line) => line.includes(RESULT_MARKER))
      ?.split(RESULT_MARKER, 2)[1];
    if (payload) {
      return JSON.parse(payload);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(
    `Benchmark result was not logged within ${
      deviceKind === "physical" ? "5" : "10"
    } minutes.`,
  );
}

function percentile(values, percentileValue) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(
    0,
    Math.ceil((percentileValue / 100) * ordered.length) - 1,
  )];
}

try {
  if (
    manifest.schema_version !== 1
    || manifest.profile !== "development-test"
    || manifest.build_variant !== "release"
    || manifest.js_bundle?.embedded !== true
    || !manifest.device?.serial
    || !manifest.package
    || manifest.suite !== "phase1"
  ) {
    throw new Error(
      "invalid embedded release development-test build manifest.",
    );
  }
  const apkPath = path.resolve(projectRoot, manifest.apk?.path ?? "");
  if (!existsSync(apkPath)) {
    throw new Error(`retained APK is missing: ${apkPath}`);
  }
  const sourceFileOutput = await command(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  );
  await writeFile(
    path.join(temporaryDirectory, "source-files"),
    Buffer.from(`${sourceFileOutput}\0`),
  );
  if (manifest.base_head !== await git("rev-parse", "HEAD")) {
    throw new Error("manifest HEAD does not match current HEAD.");
  }
  if (manifest.source_tree_sha256 !== sourceTreeSha256()) {
    throw new Error("manifest source digest does not match current source.");
  }
  if (manifest.apk.sha256 !== await sha256(apkPath)) {
    throw new Error("manifest APK digest does not match retained bytes.");
  }
  if (deviceKind === "physical") {
    await command(
      "node",
      [
        "scripts/verify-pr-artifact-roundtrip.mjs",
        path.relative(projectRoot, artifactDirectory),
      ],
      { timeoutMs: 180_000 },
    );
    benchmarkSerial = await selectPhysicalDevice();
    await assertPhysicalDisplayOff();
    await installExactApk(apkPath);
    await assertPhysicalDisplayOff();
  }
  const evidenceDevice = deviceKind === "physical"
    ? await physicalDeviceMetadata()
    : manifest.device;
  await adb("logcat", "-c");
  if (deviceKind === "physical") {
    await preparePhysicalHeadlessExecution();
    await assertPhysicalDisplayOff();
    await startPhysicalBenchmark();
  } else {
    await adb("shell", "am", "force-stop", manifest.package);
    await adb(
      "shell",
      "am",
      "start",
      "-W",
      "-a",
      "android.intent.action.VIEW",
      "-d",
      `gymtracker-devtest://__phase1-benchmark?samples=${samples}`,
      manifest.package,
    );
  }
  const nativeResult = await waitForResult();
  if (deviceKind === "physical") {
    await assertPhysicalDisplayOff();
  }
  const durations = nativeResult.durationsMs;
  if (
    nativeResult.status !== "passed"
    || nativeResult.samplesCompleted !== samples
    || !Array.isArray(durations)
    || durations.length !== samples
    || durations.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new Error("native benchmark result is incomplete.");
  }
  const p50Ms = percentile(durations, 50);
  const p95Ms = percentile(durations, 95);
  const p99Ms = percentile(durations, 99);
  const installedPath = (await adb(
    "shell",
    "pm",
    "path",
    manifest.package,
  )).split(/\r?\n/u)
    .find((line) => line.startsWith("package:"))
    ?.slice("package:".length);
  if (!installedPath) {
    throw new Error("installed package is unavailable.");
  }
  const installedBytes = await new Promise((resolve, reject) => {
    const child = spawn(
      adbExecutable,
      ["-s", benchmarkSerial, "exec-out", "cat", installedPath],
      { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
    const chunks = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`adb installed-byte read failed: ${stderr}`));
      }
    });
  });
  const installedSha256 = createHash("sha256")
    .update(installedBytes)
    .digest("hex");
  const report = {
    schema_version: 1,
    suite: "phase1",
    status: p95Ms <= maxP95Ms
      && nativeResult.maxJsTaskMs <= maxJsTaskMs
      && installedSha256 === manifest.apk.sha256
        ? "passed"
        : "failed",
    build_manifest: path.relative(projectRoot, manifestPath),
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk: manifest.apk,
    installed_apk: {
      device_path: installedPath,
      sha256: installedSha256,
      matches_retained_apk: installedSha256 === manifest.apk.sha256,
    },
    device: evidenceDevice,
    thresholds: {
      minimum_samples: 100,
      maximum_p95_ms: maxP95Ms,
      maximum_js_task_ms: maxJsTaskMs,
    },
    measurement: nativeResult.measurement,
    samples: {
      requested: samples,
      completed: durations.length,
      durations_ms: durations,
      p50_ms: p50Ms,
      p95_ms: p95Ms,
      p99_ms: p99Ms,
      maximum_ms: Math.max(...durations),
      maximum_js_task_ms: nativeResult.maxJsTaskMs,
    },
    started_at: nativeResult.startedAt,
    finished_at: nativeResult.finishedAt,
  };
  const temporaryResult = `${resultPath}.tmp`;
  await writeFile(temporaryResult, `${JSON.stringify(report, null, 2)}\n`);
  await rename(temporaryResult, resultPath);
  if (report.status !== "passed") {
    throw new Error(
      `benchmark failed: p95=${p95Ms} maxJsTask=${nativeResult.maxJsTaskMs}`,
    );
  }
  console.log(JSON.stringify({
    ok: true,
    report: path.relative(projectRoot, resultPath),
    samples: durations.length,
    p95_ms: p95Ms,
    maximum_js_task_ms: nativeResult.maxJsTaskMs,
    apk_sha256: manifest.apk.sha256,
  }));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: "phase1_benchmark_failed",
    message: error.message,
  }));
  process.exitCode = 1;
} finally {
  if (physicalAllowlistGranted) {
    try {
      await releasePhysicalHeadlessExecution();
      await assertPhysicalDisplayOff();
    } catch (error) {
      console.error(JSON.stringify({
        ok: false,
        error: "phase1_benchmark_cleanup_failed",
        message: error.message,
      }));
      process.exitCode = 1;
    }
  }
  await rm(temporaryDirectory, { force: true, recursive: true });
}
