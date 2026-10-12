#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { validateV12CalendarManifest } from "./run-v12-maestro.mjs";
import { exactKeys } from "./node-evidence-utils.mjs";
import {
  ensureV12CalendarDirectory,
  resolveV12CalendarPath,
  stableCanonicalJson,
  writeExclusiveArtifact,
} from "./v12-calendar-artifacts.mjs";

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

function schema(value, keys, location) {
  if (!exactKeys(value, keys)) fail(`privacy_schema_invalid:${location}`);
}

function finiteNonNegative(value, code) {
  if ([typeof value !== "number", !Number.isFinite(value), value < 0].some(Boolean)) fail(code);
}

function exactSequence(samples, code) {
  if (samples.some((sample, index) => sample?.sequence !== index + 1)) fail(code);
}

function percentile95(values) {
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1];
}

function identityFromManifest(manifest) {
  return Object.freeze({
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    source_manifest_sha256: manifest.source_manifest_sha256,
    reference_map_sha256: manifest.reference_map_sha256,
    package: manifest.package,
    apk_sha256: manifest.apk.sha256,
    installed_apk_sha256: manifest.installed_apk.sha256,
    device_identity_sha256: manifest.device.identity_sha256,
  });
}

function validateIdentity(identity, manifest) {
  schema(identity, ["base_head", "source_tree_sha256", "source_manifest_sha256", "reference_map_sha256", "package", "apk_sha256", "installed_apk_sha256", "device_identity_sha256"], "identity");
  if ([
    !HEAD.test(identity.base_head),
    !HASH.test(identity.source_tree_sha256),
    !HASH.test(identity.source_manifest_sha256),
    !HASH.test(identity.reference_map_sha256),
    !HASH.test(identity.apk_sha256),
    !HASH.test(identity.installed_apk_sha256),
    !HASH.test(identity.device_identity_sha256),
    identity.base_head !== manifest.base_head,
    identity.source_tree_sha256 !== manifest.source_tree_sha256,
    identity.source_manifest_sha256 !== manifest.source_manifest_sha256,
    identity.reference_map_sha256 !== manifest.reference_map_sha256,
    identity.package !== manifest.package,
    identity.apk_sha256 !== manifest.apk.sha256,
    identity.installed_apk_sha256 !== manifest.installed_apk.sha256,
    identity.device_identity_sha256 !== manifest.device.identity_sha256,
  ].some(Boolean)) fail("identity_invalid");
}

function validateRaw(raw) {
  schema(raw, ["producer", "native_execution", "query_samples", "interaction_samples"], "raw");
  if ([raw.producer !== "v12-calendar-native-diagnostics/v1", raw.native_execution !== "EXECUTED"].some(Boolean)) fail("producer_invalid");
  const queries = raw.query_samples;
  const interactions = raw.interaction_samples;
  if (!Array.isArray(queries) || queries.length < V12_CALENDAR_DIAGNOSTIC_TARGETS.nv_perf_07.minimum_samples) fail("query_count_invalid");
  if (!Array.isArray(interactions) || interactions.length < V12_CALENDAR_DIAGNOSTIC_TARGETS.nv_perf_09.minimum_sequences) fail("interaction_count_invalid");
  exactSequence(queries, "query_sequence_invalid");
  exactSequence(interactions, "interaction_sequence_invalid");
  for (const sample of queries) {
    schema(sample, ["sequence", "duration_ms", "source_backed", "event_count", "plan_count", "imported_count"], "query_sample");
    finiteNonNegative(sample.duration_ms, "query_duration_invalid");
    if ([sample.source_backed !== true, !Number.isInteger(sample.event_count), sample.event_count < 0, !Number.isInteger(sample.plan_count), sample.plan_count < 0, !Number.isInteger(sample.imported_count), sample.imported_count < 0].some(Boolean)) fail("query_sample_invalid");
  }
  for (const sample of interactions) {
    schema(sample, ["sequence", "kind", "complete", "frame_work_ms", "missed_frames", "refresh_rate_hz", "profiler_overhead_ms"], "interaction_sample");
    if ([sample.kind !== "drag-expand-collapse", sample.complete !== true, !Array.isArray(sample.frame_work_ms), sample.frame_work_ms?.length === 0].some(Boolean)) fail("interaction_sample_invalid");
    sample.frame_work_ms.forEach((value) => finiteNonNegative(value, "frame_work_invalid"));
    if ([!Number.isInteger(sample.missed_frames), sample.missed_frames < 0].some(Boolean)) fail("missed_frames_invalid");
    if ([typeof sample.refresh_rate_hz !== "number", !Number.isFinite(sample.refresh_rate_hz), sample.refresh_rate_hz <= 0].some(Boolean)) fail("refresh_rate_invalid");
    finiteNonNegative(sample.profiler_overhead_ms, "profiler_overhead_invalid");
  }
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
  schema(evidence, ["schema_version", "suite", "producer", "native_execution", "acceptance_owner", "identity", "targets", "measurements", "summary"], "evidence");
  schema(evidence?.measurements, ["query_samples", "interaction_samples"], "measurements");
  schema(evidence?.summary, ["query_p95_ms", "frame_work_p95_ms", "missed_frames", "refresh_rates_hz", "profiler_overhead_max_ms"], "summary");
  if ([
    evidence.schema_version !== 1,
    evidence.suite !== "v1.2-calendar",
    evidence.producer !== "v12-calendar-native-diagnostics/v1",
    evidence.native_execution !== "EXECUTED",
    evidence.acceptance_owner !== "phase20",
    Object.hasOwn(evidence, "verdict"),
    Object.hasOwn(evidence, "status"),
    JSON.stringify(evidence.targets) !== JSON.stringify(V12_CALENDAR_DIAGNOSTIC_TARGETS),
  ].some(Boolean)) fail("envelope_invalid");
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
  if ([
    evidence.summary.query_p95_ms !== expectedQueryP95,
    evidence.summary.frame_work_p95_ms !== expectedFrameP95,
    evidence.summary.missed_frames !== expectedMissedFrames,
    JSON.stringify(evidence.summary.refresh_rates_hz) !== JSON.stringify(expectedRefreshRates),
    evidence.summary.profiler_overhead_max_ms !== expectedOverhead,
  ].some(Boolean)) fail("summary_invalid");
  return Object.freeze({
    query_samples: queries.length,
    interaction_samples: interactions.length,
    query_p95_ms: expectedQueryP95,
    frame_work_p95_ms: expectedFrameP95,
  });
}

export function parseV12CalendarDiagnosticsArgs(args) {
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
  if ([typeof options.manifestPath !== "string", !Number.isInteger(options.querySamples), options.querySamples < 100, !Number.isInteger(options.interactionSamples), options.interactionSamples < 100].some(Boolean)) fail("argument_invalid");
  return options;
}

export function runV12CalendarAdb(serial, args, dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  const androidHome = environment.ANDROID_HOME ?? environment.ANDROID_SDK_ROOT;
  const executable = androidHome === undefined ? undefined : path.join(androidHome, "platform-tools", "adb");
  const fileExists = dependencies.exists ?? existsSync;
  if ([executable === undefined, executable !== undefined && !fileExists(executable), typeof serial !== "string", typeof serial === "string" && serial.length === 0].some(Boolean)) fail("adb_unavailable");
  const spawn = dependencies.spawn ?? spawnSync;
  const result = spawn(executable, ["-s", serial, ...args], { cwd: dependencies.root ?? ROOT, encoding: "utf8" });
  if (result.status !== 0) fail("adb_command_failed");
  return result.stdout.trim();
}

export function extractV12CalendarDiagnosticsResult(logs) {
  const line = logs.split(/\r?\n/u).findLast((entry) => entry.includes(RESULT_MARKER));
  if (line === undefined) return undefined;
  try { return JSON.parse(line.slice(line.indexOf(RESULT_MARKER) + RESULT_MARKER.length)); }
  catch { fail("result_json_invalid"); }
}

export async function executeV12CalendarDiagnostics(args = process.argv.slice(2), dependencies = {}) {
  const options = parseV12CalendarDiagnosticsArgs(args);
  const root = dependencies.root ?? ROOT;
  const manifestPath = path.resolve(root, options.manifestPath);
  const fileExists = dependencies.exists ?? existsSync;
  if (!fileExists(manifestPath)) fail("manifest_missing");
  const readText = dependencies.readText ?? ((file) => readFileSync(file, "utf8"));
  const manifest = JSON.parse(readText(resolveV12CalendarPath(manifestPath, { root, mustExist: true })));
  const head = dependencies.head ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const source = dependencies.source ?? sourceTreeSha256(root);
  validateV12CalendarManifest(manifest, { head, source });
  const serial = dependencies.serial ?? process.env.ANDROID_SERIAL;
  const adb = dependencies.adb ?? ((...adbArgs) => runV12CalendarAdb(serial, adbArgs, { root }));
  adb("logcat", "-c");
  const uri = `gymtracker-devtest://calendar?phase16CalendarDiagnostics=true&querySamples=${options.querySamples}&interactionSamples=${options.interactionSamples}`;
  adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", uri, manifest.package);
  const now = dependencies.now ?? Date.now;
  const wait = dependencies.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = now() + 10 * 60_000;
  let raw;
  while (now() < deadline && raw === undefined) {
    raw = extractV12CalendarDiagnosticsResult(adb("logcat", "-d", "-v", "raw", "ReactNativeJS:I", "*:S"));
    if (raw === undefined) await wait(500);
  }
  if (raw === undefined) fail("result_missing");
  if (raw.query_samples?.length !== options.querySamples || raw.interaction_samples?.length !== options.interactionSamples) fail("requested_sample_count_mismatch");
  const evidence = createV12CalendarDiagnostics({ manifest, raw });
  validateV12CalendarDiagnostics(evidence, manifest);
  const outputPath = path.resolve(root, options.outputPath ?? path.join(path.dirname(options.manifestPath), "diagnostics", "calendar.json"));
  if (outputPath !== root && !outputPath.startsWith(`${root}${path.sep}`)) fail("output_path_invalid");
  ensureV12CalendarDirectory(path.dirname(outputPath), { root, allowRoot: true });
  const write = dependencies.write ?? writeExclusiveArtifact;
  if (dependencies.write === undefined) write(outputPath, stableCanonicalJson(evidence), { root });
  else write(outputPath, stableCanonicalJson(evidence));
  return Object.freeze({ output: path.relative(root, outputPath), query_samples: options.querySamples, interaction_samples: options.interactionSamples, acceptance_owner: "phase20" });
}

// Phase 20 expands this same source into the complete release/profile registry.
export const V12_PERFORMANCE_BUDGETS = V12_CALENDAR_DIAGNOSTIC_TARGETS;
export const validateV12PerformanceEvidence = validateV12CalendarDiagnostics;
export const executeV12InteractionBenchmark = executeV12CalendarDiagnostics;

export async function runV12CalendarDiagnosticsCli(args = process.argv.slice(2), io = process, dependencies = {}) {
  try {
    const result = await executeV12CalendarDiagnostics(args, dependencies);
    io.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    io.stderr.write(`${error.message}\n`);
    return 1;
  }
}

/* node:coverage ignore next 4 */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runV12CalendarDiagnosticsCli();
}
