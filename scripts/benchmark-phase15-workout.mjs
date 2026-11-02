#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { sourceTreeSha256 } from "./source-tree-digest.mjs";

export const PHASE15_WORKOUT_BENCHMARK_THRESHOLDS = Object.freeze({
  render_transition: Object.freeze({ minimum_samples: 100, maximum_p95_ms: 150 }),
  active_js_task: Object.freeze({ maximum_ms: 50 }),
  long_session: Object.freeze({ required_measurements: ["render", "scroll", "interaction"] }),
});

const HASH = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const PACKAGE = "com.fchoo.gymtracker.devtest";

function fail(code) { throw new Error(`phase15_${code}`); }
function samples(values, minimum, label) {
  if (!Array.isArray(values) || values.length < minimum || values.some((value) => !Number.isFinite(value) || value < 0)) fail(`${label}_samples_invalid`);
}
function p95(values) { return [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1]; }
function noPrivateData(value, location = "benchmark") {
  if (typeof value === "string") {
    if (/(?:@|exercise[_ -]?name|workout[_ -]?(?:row|name)|set[_ -]?(?:value|weight)|raw[_ -]?(?:row|payload)|filename)/iu.test(value)) fail(`privacy_unsafe:${location}`);
    return;
  }
  if (Array.isArray(value)) { value.forEach((entry, index) => noPrivateData(entry, `${location}[${index}]`)); return; }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (/(?:exercise[_ -]?name|workout[_ -]?(?:row|name)|set[_ -]?(?:value|weight)|raw[_ -]?(?:row|payload)|filename)/iu.test(key)) fail(`privacy_unsafe:${location}.${key}`);
      noPrivateData(entry, `${location}.${key}`);
    }
  }
}

export function validatePhase15WorkoutBenchmarkEvidence(evidence, manifest) {
  if (evidence?.schema_version !== 1 || evidence.suite !== "phase15" || evidence.status !== "passed" || evidence.producer !== "phase15-rendered-workout-benchmark/v1") fail("benchmark_envelope_invalid");
  const identity = evidence.identity;
  if (!HEAD.test(identity?.base_head ?? "") || !HASH.test(identity?.source_tree_sha256 ?? "") || !HASH.test(identity?.apk_sha256 ?? "") || identity?.base_head !== manifest?.base_head || identity.source_tree_sha256 !== manifest.source_tree_sha256 || identity.package !== PACKAGE || identity.package !== manifest.package || identity.apk_sha256 !== manifest.apk?.sha256 || identity.installed_apk_sha256 !== manifest.installed_apk?.sha256 || identity.device_serial !== manifest.device?.serial) fail("benchmark_identity_invalid");
  const measured = evidence.measurements;
  samples(measured?.render_transition_ms, PHASE15_WORKOUT_BENCHMARK_THRESHOLDS.render_transition.minimum_samples, "render_transition");
  samples(measured?.active_js_task_ms, 1, "active_js_task");
  for (const kind of PHASE15_WORKOUT_BENCHMARK_THRESHOLDS.long_session.required_measurements) samples(measured?.[`long_session_${kind}_ms`], 1, `long_session_${kind}`);
  const renderTransitionP95Ms = p95(measured.render_transition_ms);
  const activeJsTaskMaxMs = Math.max(...measured.active_js_task_ms);
  if (renderTransitionP95Ms > PHASE15_WORKOUT_BENCHMARK_THRESHOLDS.render_transition.maximum_p95_ms) fail("render_transition_budget_exceeded");
  if (activeJsTaskMaxMs > PHASE15_WORKOUT_BENCHMARK_THRESHOLDS.active_js_task.maximum_ms) fail("active_js_task_budget_exceeded");
  noPrivateData(evidence);
  return Object.freeze({ sample_count: measured.render_transition_ms.length, render_transition_p95_ms: renderTransitionP95Ms, active_js_task_max_ms: activeJsTaskMaxMs });
}

export function verifyPhase15WorkoutBenchmarkHostContract(root = process.cwd()) {
  const source = readFileSync(path.join(root, "src/bootstrap/phase15WorkoutBenchmark.ts"), "utf8");
  const route = readFileSync(path.join(root, "app/__phase15-benchmark.tsx"), "utf8");
  if (!source.includes("markFirstRestDockFrame") || !route.includes("<RestDock") || !route.includes("onLayout={showRestDock ? onRestDockLayout : undefined}")) fail("host_rendered_route_missing");
  return Object.freeze({ status: "host-contract-verified", minimum_samples: 100, p95_limit_ms: 150, js_task_limit_ms: 50 });
}

function command(executable, args, root) {
  const result = spawnSync(executable, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) fail(`command_failed:${path.basename(executable)}`);
  return result.stdout;
}

function newestResult(logs) {
  const marker = "GYM_TRACKER_PHASE15_WORKOUT_BENCHMARK_RESULT:";
  const line = logs.split(/\r?\n/u).findLast((entry) => entry.includes(marker));
  if (!line) return undefined;
  try { return JSON.parse(line.slice(line.indexOf(marker) + marker.length)); }
  catch { fail("benchmark_log_json_invalid"); }
}

/**
 * Device collection is intentionally separate from the host contract gate.
 * It can run only against a retained exact-HEAD development-test APK; callers
 * must not turn a historical manifest into current performance evidence.
 */
export async function executePhase15WorkoutBenchmark({ manifestPath, evidencePath, root = process.cwd() }) {
  if (manifestPath !== "artifacts/native/phase15/build.json" || evidencePath !== "artifacts/native/phase15/evidence/performance.json") fail("exact_paths_required");
  const manifestAbsolutePath = path.join(root, manifestPath);
  if (!existsSync(manifestAbsolutePath)) fail("manifest_missing");
  const manifest = JSON.parse(readFileSync(manifestAbsolutePath, "utf8"));
  if (manifest?.suite !== "phase15" || manifest.profile !== "development-test" || manifest.package !== PACKAGE || !HEAD.test(manifest.base_head ?? "") || !HASH.test(manifest.source_tree_sha256 ?? "") || !HASH.test(manifest.apk?.sha256 ?? "") || manifest.installed_apk?.matches_retained_apk !== true || manifest.installed_apk?.sha256 !== manifest.apk.sha256) fail("manifest_invalid");
  if (manifest.base_head !== command("git", ["rev-parse", "HEAD"], root).trim() || manifest.source_tree_sha256 !== sourceTreeSha256(root)) fail("artifact_stale");
  const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  const adb = androidHome === undefined ? undefined : path.join(androidHome, "platform-tools", "adb");
  if (adb === undefined || !existsSync(adb) || !manifest.device?.serial) fail("adb_missing");
  command(adb, ["-s", manifest.device.serial, "logcat", "-c"], root);
  command(adb, ["-s", manifest.device.serial, "shell", "am", "start", "-W", "-n", `${PACKAGE}/.MainActivity`, "-d", "gymtracker://__phase15-benchmark"], root);
  const deadline = Date.now() + 10 * 60_000;
  let result;
  while (Date.now() < deadline) {
    result = newestResult(command(adb, ["-s", manifest.device.serial, "logcat", "-d", "-v", "raw", "ReactNativeJS:I", "*:S"], root));
    if (result !== undefined) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (result === undefined) fail("benchmark_result_missing");
  const evidence = Object.freeze({
    schema_version: 1,
    suite: "phase15",
    status: "passed",
    producer: "phase15-rendered-workout-benchmark/v1",
    identity: Object.freeze({ base_head: manifest.base_head, source_tree_sha256: manifest.source_tree_sha256, package: manifest.package, apk_sha256: manifest.apk.sha256, installed_apk_sha256: manifest.installed_apk.sha256, device_serial: manifest.device.serial }),
    measurements: result.measurements,
  });
  const summary = validatePhase15WorkoutBenchmarkEvidence(evidence, manifest);
  await writeFile(path.join(root, evidencePath), `${JSON.stringify({ ...evidence, ...summary }, null, 2)}\n`);
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === "--host") process.stdout.write(`${JSON.stringify(verifyPhase15WorkoutBenchmarkHostContract())}\n`);
    else if (args.length === 4 && args[0] === "--manifest" && args[2] === "--evidence") executePhase15WorkoutBenchmark({ manifestPath: args[1], evidencePath: args[3] }).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
    else fail("argument_invalid");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
