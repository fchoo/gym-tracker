#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { validateV12CalendarManifest } from "./run-v12-maestro.mjs";

const ROOT = process.cwd();
const RESULT_MARKER = "GYM_TRACKER_V12_CALENDAR_DIAGNOSTICS_RESULT:";
const HASH = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;

export const V12_CALENDAR_DIAGNOSTIC_TARGETS = Object.freeze({
  nv_perf_07: Object.freeze({ metric: "calendar_query_p95_ms", target_ms: 250, minimum_samples: 100 }),
  nv_perf_09: Object.freeze({ metric: "calendar_frame_work_p95_ms", target_ms: 16.67, minimum_sequences: 100 }),
});

function fail(code) {
  throw new Error(`v12_calendar_diagnostics_${code}`);
}

function finiteNonNegative(value, code) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(code);
}

function exactSequence(samples, code) {
  if (samples.some((sample, index) => sample?.sequence !== index + 1)) fail(code);
}

function percentile95(values) {
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1];
}

function noPrivateData(value, location = "diagnostics") {
  if (typeof value === "string") {
    if (/@|password|authorization|employee|raw[_ -]?payload|filename/iu.test(value)) fail(`privacy_unsafe:${location}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => noPrivateData(entry, `${location}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (/password|authorization|employee|raw[_ -]?payload|filename/iu.test(key)) fail(`privacy_unsafe:${location}.${key}`);
      noPrivateData(entry, `${location}.${key}`);
    }
  }
}

function identityFromManifest(manifest) {
  return Object.freeze({
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    source_manifest_sha256: manifest.source_manifest_sha256,
    package: manifest.package,
    apk_sha256: manifest.apk.sha256,
    installed_apk_sha256: manifest.installed_apk.sha256,
    device_identity_sha256: manifest.device.identity_sha256,
  });
}

function validateIdentity(identity, manifest) {
  if (!HEAD.test(identity?.base_head ?? "")
    || !HASH.test(identity?.source_tree_sha256 ?? "")
    || !HASH.test(identity?.source_manifest_sha256 ?? "")
    || !HASH.test(identity?.apk_sha256 ?? "")
    || !HASH.test(identity?.installed_apk_sha256 ?? "")
    || !HASH.test(identity?.device_identity_sha256 ?? "")
    || identity.base_head !== manifest?.base_head
    || identity.source_tree_sha256 !== manifest.source_tree_sha256
    || identity.source_manifest_sha256 !== manifest.source_manifest_sha256
    || identity.package !== manifest.package
    || identity.apk_sha256 !== manifest.apk?.sha256
    || identity.installed_apk_sha256 !== manifest.installed_apk?.sha256
    || identity.device_identity_sha256 !== manifest.device?.identity_sha256) {
    fail("identity_invalid");
  }
}

function validateRaw(raw) {
  if (raw?.producer !== "v12-calendar-native-diagnostics/v1" || raw.native_execution !== "EXECUTED") fail("producer_invalid");
  const queries = raw.query_samples;
  const interactions = raw.interaction_samples;
  if (!Array.isArray(queries) || queries.length < V12_CALENDAR_DIAGNOSTIC_TARGETS.nv_perf_07.minimum_samples) fail("query_count_invalid");
  if (!Array.isArray(interactions) || interactions.length < V12_CALENDAR_DIAGNOSTIC_TARGETS.nv_perf_09.minimum_sequences) fail("interaction_count_invalid");
  exactSequence(queries, "query_sequence_invalid");
  exactSequence(interactions, "interaction_sequence_invalid");
  for (const sample of queries) {
    finiteNonNegative(sample.duration_ms, "query_duration_invalid");
    if (sample.source_backed !== true || sample.synthetic === true || sample.fabricated === true || !Number.isInteger(sample.event_count) || sample.event_count < 0 || !Number.isInteger(sample.plan_count) || sample.plan_count < 0 || !Number.isInteger(sample.imported_count) || sample.imported_count < 0) fail("query_sample_invalid");
  }
  for (const sample of interactions) {
    if (sample.kind !== "drag-expand-collapse" || sample.complete !== true || sample.synthetic === true || sample.fabricated === true || !Array.isArray(sample.frame_work_ms) || sample.frame_work_ms.length === 0) fail("interaction_sample_invalid");
    sample.frame_work_ms.forEach((value) => finiteNonNegative(value, "frame_work_invalid"));
    if (!Number.isInteger(sample.missed_frames) || sample.missed_frames < 0) fail("missed_frames_invalid");
    if (typeof sample.refresh_rate_hz !== "number" || !Number.isFinite(sample.refresh_rate_hz) || sample.refresh_rate_hz <= 0) fail("refresh_rate_invalid");
    finiteNonNegative(sample.profiler_overhead_ms, "profiler_overhead_invalid");
  }
  noPrivateData(raw);
  return { queries, interactions };
}

export function createV12CalendarDiagnostics({ manifest, raw }) {
  validateV12CalendarManifest(manifest);
  const { queries, interactions } = validateRaw(raw);
  const queryP95 = percentile95(queries.map(({ duration_ms }) => duration_ms));
  const interactionMaxima = interactions.map(({ frame_work_ms }) => Math.max(...frame_work_ms));
  return Object.freeze({
    schema_version: 1,
    suite: "v1.2-calendar",
    producer: raw.producer,
    native_execution: "EXECUTED",
    acceptance_owner: "phase20",
    identity: identityFromManifest(manifest),
    targets: V12_CALENDAR_DIAGNOSTIC_TARGETS,
    measurements: Object.freeze({
      query_samples: Object.freeze(queries.map((sample) => Object.freeze({ ...sample }))),
      interaction_samples: Object.freeze(interactions.map((sample) => Object.freeze({ ...sample, frame_work_ms: Object.freeze([...sample.frame_work_ms]) }))),
    }),
    summary: Object.freeze({
      query_p95_ms: queryP95,
      frame_work_p95_ms: percentile95(interactionMaxima),
      missed_frames: interactions.reduce((total, sample) => total + sample.missed_frames, 0),
      refresh_rates_hz: Object.freeze([...new Set(interactions.map(({ refresh_rate_hz }) => refresh_rate_hz))].sort((left, right) => left - right)),
      profiler_overhead_max_ms: Math.max(...interactions.map(({ profiler_overhead_ms }) => profiler_overhead_ms)),
    }),
  });
}

export function validateV12CalendarDiagnostics(evidence, manifest) {
  if (evidence?.schema_version !== 1
    || evidence.suite !== "v1.2-calendar"
    || evidence.producer !== "v12-calendar-native-diagnostics/v1"
    || evidence.native_execution !== "EXECUTED"
    || evidence.acceptance_owner !== "phase20"
    || Object.hasOwn(evidence, "verdict")
    || Object.hasOwn(evidence, "status")
    || JSON.stringify(evidence.targets) !== JSON.stringify(V12_CALENDAR_DIAGNOSTIC_TARGETS)) fail("envelope_invalid");
  validateIdentity(evidence.identity, manifest);
  const { queries, interactions } = validateRaw({
    producer: evidence.producer,
    native_execution: evidence.native_execution,
    query_samples: evidence.measurements?.query_samples,
    interaction_samples: evidence.measurements?.interaction_samples,
  });
  const expectedQueryP95 = percentile95(queries.map(({ duration_ms }) => duration_ms));
  const expectedFrameP95 = percentile95(interactions.map(({ frame_work_ms }) => Math.max(...frame_work_ms)));
  const expectedMissedFrames = interactions.reduce((total, sample) => total + sample.missed_frames, 0);
  const expectedRefreshRates = [...new Set(interactions.map(({ refresh_rate_hz }) => refresh_rate_hz))].sort((left, right) => left - right);
  const expectedOverhead = Math.max(...interactions.map(({ profiler_overhead_ms }) => profiler_overhead_ms));
  if (evidence.summary?.query_p95_ms !== expectedQueryP95
    || evidence.summary?.frame_work_p95_ms !== expectedFrameP95
    || evidence.summary?.missed_frames !== expectedMissedFrames
    || JSON.stringify(evidence.summary?.refresh_rates_hz) !== JSON.stringify(expectedRefreshRates)
    || evidence.summary?.profiler_overhead_max_ms !== expectedOverhead) fail("summary_invalid");
  noPrivateData(evidence);
  return Object.freeze({
    query_samples: queries.length,
    interaction_samples: interactions.length,
    query_p95_ms: expectedQueryP95,
    frame_work_p95_ms: expectedFrameP95,
  });
}

function parseArgs(args) {
  const options = { querySamples: 100, interactionSamples: 100 };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];
    if (["--manifest", "--output", "--query-samples", "--interaction-samples"].includes(argument) && next !== undefined) {
      const key = argument === "--manifest" ? "manifestPath" : argument === "--output" ? "outputPath" : argument === "--query-samples" ? "querySamples" : "interactionSamples";
      options[key] = key.endsWith("Samples") ? Number(next) : next;
      index += 1;
    } else fail("argument_invalid");
  }
  if (typeof options.manifestPath !== "string" || !Number.isInteger(options.querySamples) || options.querySamples < 100 || !Number.isInteger(options.interactionSamples) || options.interactionSamples < 100) fail("argument_invalid");
  return options;
}

function adb(serial, ...args) {
  const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  const executable = androidHome === undefined ? undefined : path.join(androidHome, "platform-tools", "adb");
  if (executable === undefined || !existsSync(executable) || typeof serial !== "string" || serial.length === 0) fail("adb_unavailable");
  const result = spawnSync(executable, ["-s", serial, ...args], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) fail("adb_command_failed");
  return result.stdout.trim();
}

function newestResult(logs) {
  const line = logs.split(/\r?\n/u).findLast((entry) => entry.includes(RESULT_MARKER));
  if (line === undefined) return undefined;
  try { return JSON.parse(line.slice(line.indexOf(RESULT_MARKER) + RESULT_MARKER.length)); }
  catch { fail("result_json_invalid"); }
}

export async function executeV12CalendarDiagnostics(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const manifestPath = path.resolve(ROOT, options.manifestPath);
  if (!existsSync(manifestPath)) fail("manifest_missing");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  validateV12CalendarManifest(manifest, { head, source: sourceTreeSha256(ROOT) });
  const serial = process.env.ANDROID_SERIAL;
  adb(serial, "logcat", "-c");
  const uri = `gymtracker-devtest://calendar?phase16CalendarDiagnostics=true&querySamples=${options.querySamples}&interactionSamples=${options.interactionSamples}`;
  adb(serial, "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", uri, manifest.package);
  const deadline = Date.now() + 10 * 60_000;
  let raw;
  while (Date.now() < deadline && raw === undefined) {
    raw = newestResult(adb(serial, "logcat", "-d", "-v", "raw", "ReactNativeJS:I", "*:S"));
    if (raw === undefined) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (raw === undefined) fail("result_missing");
  if (raw.query_samples?.length !== options.querySamples || raw.interaction_samples?.length !== options.interactionSamples) fail("requested_sample_count_mismatch");
  const evidence = createV12CalendarDiagnostics({ manifest, raw });
  validateV12CalendarDiagnostics(evidence, manifest);
  const outputPath = path.resolve(ROOT, options.outputPath ?? path.join(path.dirname(options.manifestPath), "diagnostics", "calendar.json"));
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  return Object.freeze({ output: path.relative(ROOT, outputPath), query_samples: options.querySamples, interaction_samples: options.interactionSamples, acceptance_owner: "phase20" });
}

// Phase 20 expands this same source into the complete release/profile registry.
export const V12_PERFORMANCE_BUDGETS = V12_CALENDAR_DIAGNOSTIC_TARGETS;
export const validateV12PerformanceEvidence = validateV12CalendarDiagnostics;
export const executeV12InteractionBenchmark = executeV12CalendarDiagnostics;

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  executeV12CalendarDiagnostics().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
