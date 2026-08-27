#!/usr/bin/env node

import {
  execFileSync,
  spawn,
} from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
} from "node:fs";
import {
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  sourceTreeSha256,
} from "./source-tree-digest.mjs";

const RESULT_MARKER = "GYM_TRACKER_PHASE2_BENCHMARK_RESULT:";
export const PHASE2_BENCHMARK_RESULT_CHUNK_MARKER =
  "GYM_TRACKER_PHASE2_BENCHMARK_RESULT_CHUNK:";
const ERROR_MARKER = "GYM_TRACKER_PHASE2_BENCHMARK_ERROR:";
export const PHASE2_ADB_LOGCAT_TIMEOUT_MS = 15_000;
export const PHASE2_ADB_APK_READ_TIMEOUT_MS = 60_000;
export const PHASE2_BENCHMARK_WAIT_TIMEOUT_MS = 600_000;
const measurementIds = [
  "search-page",
  "working-set-commit",
];
const projectRoot = process.cwd();

function markerPayload(line, marker) {
  const markerIndex = line.indexOf(marker);
  return markerIndex === -1
    ? undefined
    : line.slice(markerIndex + marker.length);
}

function parseJson(value) {
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isPhase2BenchmarkResultChunk(value) {
  return (
    typeof value === "object"
    && value !== null
    && value.transportVersion === 1
    && typeof value.resultId === "string"
    && value.resultId.length > 0
    && Number.isInteger(value.index)
    && Number.isInteger(value.total)
    && typeof value.chunk === "string"
    && value.total > 0
    && value.total <= 1_024
    && value.index >= 0
    && value.index < value.total
  );
}

function percentile(values, percentileValue) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(
    0,
    Math.ceil((percentileValue / 100) * ordered.length) - 1,
  )];
}

export function validatePhase2BenchmarkResult(
  input,
  {
    samples,
    maxP95Ms,
    maxJsTaskMs,
  },
) {
  if (
    input?.schemaVersion !== 1
    || input?.suite !== "phase2"
    || input?.status !== "passed"
    || !Array.isArray(input.measurements)
    || input.measurements.length !== measurementIds.length
    || Number.isNaN(Date.parse(input.startedAt))
    || Number.isNaN(Date.parse(input.finishedAt))
  ) {
    throw new Error("phase2 benchmark result is invalid.");
  }
  const seen = new Set();
  const measurements = input.measurements.map((measurement) => {
    if (
      !measurementIds.includes(measurement?.id)
      || seen.has(measurement.id)
      || measurement.samplesRequested !== samples
      || measurement.samplesCompleted !== samples
      || !Array.isArray(measurement.durationsMs)
      || measurement.durationsMs.length !== samples
      || measurement.durationsMs.some(
        (value) => !Number.isFinite(value) || value < 0,
      )
      || !Number.isFinite(measurement.maxJsTaskMs)
      || measurement.maxJsTaskMs < 0
    ) {
      throw new Error(
        `phase2 benchmark samples are incomplete: ${String(measurement?.id)}`,
      );
    }
    seen.add(measurement.id);
    const p95Ms = percentile(measurement.durationsMs, 95);
    if (p95Ms > maxP95Ms || measurement.maxJsTaskMs > maxJsTaskMs) {
      throw new Error(
        `phase2 benchmark threshold failed: ${measurement.id}`,
      );
    }
    return {
      id: measurement.id,
      measurement: measurement.measurement,
      samples_requested: measurement.samplesRequested,
      samples_completed: measurement.samplesCompleted,
      durations_ms: measurement.durationsMs,
      p50_ms: percentile(measurement.durationsMs, 50),
      p95_ms: p95Ms,
      p99_ms: percentile(measurement.durationsMs, 99),
      maximum_ms: Math.max(...measurement.durationsMs),
      maximum_js_task_ms: measurement.maxJsTaskMs,
    };
  });
  if (measurementIds.some((id) => !seen.has(id))) {
    throw new Error("phase2 benchmark measurement is missing.");
  }
  return { measurements };
}

function command(name, commandArguments, options = {}) {
  const child = spawn(name, commandArguments, {
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

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function readInstalledApk(adbExecutable, manifest) {
  const installedPath = (await command(
    adbExecutable,
    ["-s", manifest.device.serial, "shell", "pm", "path", manifest.package],
    { timeoutMs: PHASE2_ADB_APK_READ_TIMEOUT_MS },
  )).split(/\r?\n/u)
    .find((line) => line.startsWith("package:"))
    ?.slice("package:".length);
  if (!installedPath) {
    throw new Error("installed package is unavailable.");
  }
  const bytes = await new Promise((resolve, reject) => {
    const child = spawn(
      adbExecutable,
      [
        "-s",
        manifest.device.serial,
        "exec-out",
        "cat",
        installedPath,
      ],
      { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
    const chunks = [];
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(
        `adb installed-byte read timed out after ${PHASE2_ADB_APK_READ_TIMEOUT_MS} ms`,
      ));
    }, PHASE2_ADB_APK_READ_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`adb installed-byte read failed: ${stderr}`));
      }
    });
  });
  return {
    device_path: installedPath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function waitForResult(adbExecutable, manifest) {
  const deadline = Date.now() + PHASE2_BENCHMARK_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const remainingMs = Math.max(1, deadline - Date.now());
    const output = await command(
      adbExecutable,
      [
        "-s",
        manifest.device.serial,
        "logcat",
        "-d",
        "-v",
        "raw",
        "ReactNativeJS:I",
        "*:S",
      ],
      {
        timeoutMs: Math.min(PHASE2_ADB_LOGCAT_TIMEOUT_MS, remainingMs),
      },
    );
    const outcome = phase2BenchmarkLogOutcome(output);
    if (outcome?.kind === "result") {
      return outcome.result;
    }
    if (outcome?.kind === "error") {
      throw new Error(outcome.message);
    }
    await new Promise((resolve) => setTimeout(
      resolve,
      Math.min(500, Math.max(0, deadline - Date.now())),
    ));
  }
  throw new Error("Phase 2 benchmark result was not logged within 10 minutes.");
}

export function phase2BenchmarkLogOutcome(output) {
  const lines = output.split(/\r?\n/u);
  const payload = lines.findLast((line) => line.includes(RESULT_MARKER));
  if (payload) {
    const result = parseJson(markerPayload(payload, RESULT_MARKER));
    if (result !== undefined) {
      return {
        kind: "result",
        result,
      };
    }
  }
  const chunks = lines
    .map((line) => parseJson(markerPayload(
      line,
      PHASE2_BENCHMARK_RESULT_CHUNK_MARKER,
    )))
    .filter(isPhase2BenchmarkResultChunk);
  const latestChunk = chunks.at(-1);
  if (latestChunk !== undefined) {
    const matching = chunks.filter((chunk) =>
      chunk.resultId === latestChunk.resultId
      && chunk.total === latestChunk.total
    );
    if (
      matching.length !== latestChunk.total
      || new Set(matching.map(({ index }) => index)).size !== matching.length
    ) {
      return null;
    }
    matching.sort((left, right) => left.index - right.index);
    const result = parseJson(matching.map(({ chunk }) => chunk).join(""));
    if (result === undefined) {
      return null;
    }
    return { kind: "result", result };
  }
  const errorPayload = lines.findLast((line) => line.includes(ERROR_MARKER));
  if (!errorPayload) {
    return null;
  }
  const error = parseJson(markerPayload(errorPayload, ERROR_MARKER));
  return {
    kind: "error",
    message: typeof error?.message === "string"
      ? error.message
      : "Phase 2 benchmark failed on device.",
  };
}

function numberArgument(value, label, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

async function executeMain() {
  const args = process.argv.slice(2);
  let manifestArgument = "artifacts/native/phase2/build.json";
  let samples = 100;
  let maxP95Ms = 150;
  let maxJsTaskMs = 50;
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
      maxP95Ms = numberArgument(
        args[index + 1],
        "--max-p95-ms",
        1,
        10_000,
      );
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
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (!Number.isInteger(samples)) {
    throw new Error("--samples must be an integer.");
  }

  const manifestPath = path.resolve(projectRoot, manifestArgument);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    manifest.schema_version !== 1
    || manifest.suite !== "phase2"
    || manifest.profile !== "development-test"
    || manifest.build_variant !== "release"
    || manifest.js_bundle?.embedded !== true
    || !manifest.device?.serial
    || !manifest.package
  ) {
    throw new Error(
      "invalid Phase 2 embedded release development-test manifest.",
    );
  }
  const apkPath = path.resolve(projectRoot, manifest.apk?.path ?? "");
  if (!existsSync(apkPath)) {
    throw new Error(`retained APK is missing: ${apkPath}`);
  }
  if (
    manifest.base_head !== await command("git", ["rev-parse", "HEAD"])
    || manifest.source_tree_sha256 !== sourceTreeSha256(projectRoot)
    || manifest.apk.sha256 !== await sha256(apkPath)
  ) {
    throw new Error("manifest HEAD, source, or APK identity is stale.");
  }

  const androidHome = process.env.ANDROID_HOME
    ?? process.env.ANDROID_SDK_ROOT
    ?? "/opt/homebrew/share/android-commandlinetools";
  const adbExecutable = path.join(androidHome, "platform-tools", "adb");
  await command(
    adbExecutable,
    ["-s", manifest.device.serial, "logcat", "-c"],
    { timeoutMs: PHASE2_ADB_LOGCAT_TIMEOUT_MS },
  );
  await command(
    adbExecutable,
    [
      "-s",
      manifest.device.serial,
      "shell",
      "am",
      "force-stop",
      manifest.package,
    ],
    { timeoutMs: PHASE2_ADB_APK_READ_TIMEOUT_MS },
  );
  await command(
    adbExecutable,
    [
      "-s",
      manifest.device.serial,
      "shell",
      "am",
      "start",
      "-W",
      "-a",
      "android.intent.action.VIEW",
      "-d",
      `gymtracker-devtest://__phase2-benchmark?samples=${samples}`,
      manifest.package,
    ],
    { timeoutMs: PHASE2_ADB_APK_READ_TIMEOUT_MS },
  );
  let nativeResult;
  try {
    nativeResult = await waitForResult(adbExecutable, manifest);
  } finally {
    await command(
      adbExecutable,
      [
        "-s",
        manifest.device.serial,
        "shell",
        "am",
        "force-stop",
        manifest.package,
      ],
      { timeoutMs: PHASE2_ADB_APK_READ_TIMEOUT_MS },
    ).catch(() => undefined);
  }
  const validated = validatePhase2BenchmarkResult(nativeResult, {
    samples,
    maxP95Ms,
    maxJsTaskMs,
  });
  const installed = await readInstalledApk(adbExecutable, manifest);
  const report = {
    schema_version: 1,
    suite: "phase2",
    status: installed.sha256 === manifest.apk.sha256 ? "passed" : "failed",
    build_manifest: path.relative(projectRoot, manifestPath),
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk: manifest.apk,
    installed_apk: {
      ...installed,
      matches_retained_apk: installed.sha256 === manifest.apk.sha256,
    },
    device: manifest.device,
    thresholds: {
      minimum_samples: 100,
      maximum_p95_ms: maxP95Ms,
      maximum_js_task_ms: maxJsTaskMs,
    },
    measurements: validated.measurements,
    started_at: nativeResult.startedAt,
    finished_at: nativeResult.finishedAt,
  };
  const resultPath = path.join(path.dirname(manifestPath), "benchmark.json");
  const temporaryResult = `${resultPath}.tmp`;
  await writeFile(temporaryResult, `${JSON.stringify(report, null, 2)}\n`);
  await rename(temporaryResult, resultPath);
  if (report.status !== "passed") {
    throw new Error("installed APK bytes differ from retained Phase 2 APK.");
  }
  console.log(JSON.stringify({
    ok: true,
    report: path.relative(projectRoot, resultPath),
    measurements: report.measurements.map(({ id, p95_ms }) => ({
      id,
      samples,
      p95_ms,
    })),
    apk_sha256: manifest.apk.sha256,
  }));
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  executeMain().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: "phase2_benchmark_failed",
      message: error.message,
    }));
    process.exitCode = 1;
  });
}
