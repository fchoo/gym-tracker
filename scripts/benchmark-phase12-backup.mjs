#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const ROOT = process.cwd();
const START_MARKER = "GYM_TRACKER_PHASE12_BENCHMARK_START:";
const PROGRESS_MARKER = "GYM_TRACKER_PHASE12_BENCHMARK_PROGRESS:";
const RESULT_MARKER = "GYM_TRACKER_PHASE12_BENCHMARK_RESULT:";
const ERROR_MARKER = "GYM_TRACKER_PHASE12_BENCHMARK_ERROR:";
const RESULT_TIMEOUT_MS = 30 * 60_000;
const POLL_INTERVAL_MS = 500;

export const MERGE_DIGEST_CONCURRENCY = 4;
export const PHASE12_BACKUP_BENCHMARK_THRESHOLDS = Object.freeze({
  dirty_trigger: Object.freeze({ minimum_samples: 100, maximum_p95_ms: 16 }),
  writer_occupancy: Object.freeze({ minimum_samples: 20, maximum_p95_ms: 1000 }),
  merge_preflight: Object.freeze({
    minimum_samples: 10,
    maximum_p95_ms: 10_000,
    maximum_peak_growth_bytes: 192 * 1024 * 1024,
    required_snapshot_bytes: 24 * 1024 * 1024,
    required_rows: 100_000,
  }),
});

function p95(values) {
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1];
}

function samples(values, expected, limit, label) {
  if (!Array.isArray(values) || values.length < expected || values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error(`phase12_${label}_samples_invalid`);
  if (p95(values) > limit) throw new Error(`phase12_${label}_budget_exceeded`);
}

/** Fail-closed evidence validator; native measurement collection owns the raw samples. */
export function validatePhase12BackupBenchmark(evidence, manifest) {
  const expected = PHASE12_BACKUP_BENCHMARK_THRESHOLDS;
  if (evidence?.schema_version !== 1 || evidence.suite !== "phase12"
    || evidence.producer !== "phase12-backup-benchmark/v1" || evidence.status !== "passed"
    || evidence.mode !== "automated-only" || evidence.measurements?.skipped !== 0) throw new Error("phase12_benchmark_envelope_invalid");
  const identity = evidence.manifest;
  if (identity?.base_head !== manifest.base_head || identity.source_tree_sha256 !== manifest.source_tree_sha256
    || identity.apk_sha256 !== manifest.apk?.sha256 || identity.package !== manifest.package) throw new Error("phase12_benchmark_manifest_stale");
  const measured = evidence.measurements;
  samples(measured.dirty_trigger_ms, expected.dirty_trigger.minimum_samples, expected.dirty_trigger.maximum_p95_ms, "dirty_trigger");
  samples(measured.writer_occupancy_ms, expected.writer_occupancy.minimum_samples, expected.writer_occupancy.maximum_p95_ms, "writer_occupancy");
  samples(measured.capture_total_ms, expected.writer_occupancy.minimum_samples, Number.POSITIVE_INFINITY, "capture_total");
  samples(measured.merge_preflight_ms, expected.merge_preflight.minimum_samples, expected.merge_preflight.maximum_p95_ms, "merge_preflight");
  samples(measured.merge_peak_growth_bytes, expected.merge_preflight.minimum_samples, expected.merge_preflight.maximum_peak_growth_bytes, "merge_peak_growth");
  samples(measured.merge_serialization_ms, 2, Number.POSITIVE_INFINITY, "merge_serialization");
  if (measured.snapshot_bytes !== expected.merge_preflight.required_snapshot_bytes
    || measured.total_rows !== expected.merge_preflight.required_rows
    || measured.merge_digest_concurrency !== MERGE_DIGEST_CONCURRENCY
    || measured.merge_output_equivalent !== true || measured.network_inside_writer !== false) throw new Error("phase12_benchmark_merge_contract_invalid");
  return true;
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

function command(executable, args, { timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`phase12_command_timeout:${path.basename(executable)}`));
    }, timeoutMs);
    child.stdout.on("data", (value) => { stdout += value.toString("utf8"); });
    child.stderr.on("data", (value) => { stderr += value.toString("utf8"); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`phase12_command_failed:${path.basename(executable)}:${stderr.slice(-500)}`));
    });
  });
}

function commandBytes(executable, args, { timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`phase12_command_timeout:${path.basename(executable)}`));
    }, timeoutMs);
    child.stdout.on("data", (value) => { chunks.push(value); });
    child.stderr.on("data", (value) => { stderr += value.toString("utf8"); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`phase12_command_failed:${path.basename(executable)}:${stderr.slice(-500)}`));
    });
  });
}

function parseArguments(args) {
  const output = { manifest: undefined, evidence: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--manifest" || value === "--evidence") {
      const next = args[++index];
      if (!next || next.startsWith("--")) throw new Error(`phase12_${value.slice(2)}_argument_invalid`);
      output[value.slice(2)] = next;
    } else throw new Error(`phase12_unknown_argument:${value}`);
  }
  if (output.manifest !== "artifacts/native/phase12/build.json" || output.evidence !== "artifacts/native/phase12/benchmark.json") {
    throw new Error("phase12_benchmark_exact_paths_required");
  }
  return output;
}

function validatedAdb() {
  const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? "/opt/homebrew/share/android-commandlinetools";
  if (!path.isAbsolute(androidHome)) throw new Error("phase12_android_home_not_absolute");
  const adb = path.join(androidHome, "platform-tools", "adb");
  if (!existsSync(adb)) throw new Error("phase12_adb_missing");
  return adb;
}

function validateManifest(manifest) {
  if (manifest?.schema_version !== 1 || manifest.suite !== "phase12" || manifest.profile !== "development-test"
    || manifest.package !== "com.fchoo.gymtracker.devtest" || manifest.js_bundle?.embedded !== true
    || typeof manifest.device?.serial !== "string" || !/^[a-f0-9]{40}$/u.test(manifest.base_head ?? "")
    || !/^[a-f0-9]{64}$/u.test(manifest.source_tree_sha256 ?? "") || !/^[a-f0-9]{64}$/u.test(manifest.apk?.sha256 ?? "")) throw new Error("phase12_benchmark_manifest_invalid");
}

async function assertExactIdentity(manifest) {
  validateManifest(manifest);
  const head = (await command("git", ["rev-parse", "HEAD"])).trim();
  if (head !== manifest.base_head || sourceTreeSha256(ROOT) !== manifest.source_tree_sha256) throw new Error("phase12_benchmark_source_stale");
  const apk = path.resolve(ROOT, manifest.apk.path);
  if (!apk.startsWith(`${ROOT}${path.sep}`) || !existsSync(apk) || sha256(readFileSync(apk)) !== manifest.apk.sha256) throw new Error("phase12_benchmark_apk_stale");
  return apk;
}

async function installedApk(adb, manifest) {
  const packagePath = (await command(adb, ["-s", manifest.device.serial, "shell", "pm", "path", manifest.package])).split(/\r?\n/u)
    .find((line) => line.startsWith("package:"))?.slice("package:".length);
  if (!packagePath) throw new Error("phase12_installed_apk_missing");
  const bytes = await commandBytes(adb, ["-s", manifest.device.serial, "exec-out", "cat", packagePath], { timeoutMs: 90_000 });
  return { sha256: sha256(bytes), path: packagePath };
}

async function readRssBytes(adb, serial, packageName) {
  const pid = (await command(adb, ["-s", serial, "shell", "pidof", packageName])).trim().split(/\s+/u)[0];
  if (!pid || !/^\d+$/u.test(pid)) return undefined;
  const status = await command(adb, ["-s", serial, "shell", "cat", `/proc/${pid}/status`]);
  const kib = Number(status.match(/^VmRSS:\s+(\d+)\s+kB$/mu)?.[1]);
  return Number.isSafeInteger(kib) && kib > 0 ? kib * 1024 : undefined;
}

function newestMarker(output, marker) {
  const line = output.split(/\r?\n/u).findLast((value) => value.includes(marker));
  if (!line) return undefined;
  try { return JSON.parse(line.slice(line.indexOf(marker) + marker.length)); }
  catch { throw new Error("phase12_benchmark_log_json_invalid"); }
}

async function waitForNativeResult(adb, manifest) {
  const deadline = Date.now() + RESULT_TIMEOUT_MS;
  let started = false;
  const seenProgress = new Set();
  const mergeGrowth = [];
  let activeMerge;
  while (Date.now() < deadline) {
    const output = await command(adb, ["-s", manifest.device.serial, "logcat", "-d", "-v", "raw", "ReactNativeJS:I", "*:S"]);
    if (newestMarker(output, ERROR_MARKER)) throw new Error("phase12_native_benchmark_failed");
    started ||= newestMarker(output, START_MARKER)?.suite === "phase12";
    for (const line of output.split(/\r?\n/u)) {
      if (!line.includes(PROGRESS_MARKER)) continue;
      const progress = JSON.parse(line.slice(line.indexOf(PROGRESS_MARKER) + PROGRESS_MARKER.length));
      const key = `${progress.stage}:${progress.sample}`;
      if (seenProgress.has(key) || progress.stage !== "merge") continue;
      seenProgress.add(key);
      const rss = await readRssBytes(adb, manifest.device.serial, manifest.package);
      if (rss === undefined) throw new Error("phase12_process_memory_unavailable");
      if (activeMerge) mergeGrowth.push(activeMerge.peak - activeMerge.baseline);
      activeMerge = { baseline: rss, peak: rss };
    }
    if (activeMerge) {
      const rss = await readRssBytes(adb, manifest.device.serial, manifest.package);
      if (rss !== undefined) activeMerge.peak = Math.max(activeMerge.peak, rss);
    }
    const result = newestMarker(output, RESULT_MARKER);
    if (result) {
      if (!started || !activeMerge) throw new Error("phase12_benchmark_markers_missing");
      mergeGrowth.push(activeMerge.peak - activeMerge.baseline);
      return { result, mergeGrowth };
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("phase12_benchmark_result_timeout");
}

export async function executePhase12BackupBenchmark(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const manifest = JSON.parse(readFileSync(path.join(ROOT, options.manifest), "utf8"));
  await assertExactIdentity(manifest);
  const adb = validatedAdb();
  await command(adb, ["-s", manifest.device.serial, "logcat", "-c"]);
  await command(adb, ["-s", manifest.device.serial, "shell", "am", "force-stop", manifest.package]);
  await command(adb, ["-s", manifest.device.serial, "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", "gymtracker-devtest://__phase12-benchmark", manifest.package]);
  const { result, mergeGrowth } = await waitForNativeResult(adb, manifest);
  const installed = await installedApk(adb, manifest);
  if (installed.sha256 !== manifest.apk.sha256) throw new Error("phase12_installed_apk_stale");
  const report = {
    schema_version: 1,
    suite: "phase12",
    producer: "phase12-backup-benchmark/v1",
    status: "passed",
    mode: "automated-only",
    manifest: { base_head: manifest.base_head, source_tree_sha256: manifest.source_tree_sha256, apk_sha256: manifest.apk.sha256, package: manifest.package },
    installed_apk: { sha256: installed.sha256, matches_retained_apk: true },
    measurements: { ...result.measurements, merge_peak_growth_bytes: mergeGrowth, skipped: 0 },
  };
  validatePhase12BackupBenchmark(report, manifest);
  const destination = path.join(ROOT, options.evidence);
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`);
  await rename(temporary, destination);
  return report;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  executePhase12BackupBenchmark().then((report) => {
    process.stdout.write(`${JSON.stringify({ ok: true, suite: report.suite })}\n`);
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "phase12_benchmark_failed"}\n`);
    process.exitCode = 1;
  });
}
