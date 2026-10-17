import {
  V12_PERFORMANCE_BUDGETS,
  V12_PERFORMANCE_WORKLOAD,
  nearestRankP95,
  validateV12PerformanceEvidence,
} from "./benchmark-v12-interactions.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createV12NativeAdapter } from "./v12-native-adapter.mjs";
import { publishV12AtomicShard } from "./v12-atomic-shard-publication.mjs";
import { validateV12PerformanceProducer } from "./v12-quality-evidence-contract.mjs";

const HASH = /^[a-f0-9]{64}$/u;
const V12_RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;

function fail(code) {
  throw new Error(`v12_performance_shard_${code}`);
}

function samples(values, minimum, label) {
  if (!Array.isArray(values) || values.length < minimum || values.some((value) => !Number.isFinite(value) || value < 0)) fail(`${label}_samples_invalid`);
}

function p95Summary(values, minimum, maximum, label) {
  samples(values, minimum, label);
  const p95 = nearestRankP95(values);
  if (p95 > maximum) fail(`${label}_budget_exceeded`);
  return Object.freeze({ samples: values.length, p95_ms: p95, max_ms: Math.max(...values) });
}

function maxSummary(values, minimum, maximum, label) {
  samples(values, minimum, label);
  const max = Math.max(...values);
  if (max > maximum) fail(`${label}_budget_exceeded`);
  return Object.freeze({ samples: values.length, max_ms: max });
}

function validateFrameSequences(sequences) {
  const budget = V12_PERFORMANCE_BUDGETS.calendar_frame_work;
  if (!Array.isArray(sequences) || sequences.length < budget.minimum_sequences) fail("calendar_frame_sequences_invalid");
  const maxima = sequences.map((sequence) => {
    if (!sequence || typeof sequence !== "object" || !Array.isArray(sequence.frame_work_ms) || sequence.frame_work_ms.length === 0 || !Number.isInteger(sequence.missed_frames) || sequence.missed_frames < 0 || !Number.isFinite(sequence.refresh_rate_hz) || sequence.refresh_rate_hz <= 0 || !Number.isFinite(sequence.profiler_overhead_ms) || sequence.profiler_overhead_ms < 0) fail("calendar_frame_sequence_invalid");
    samples(sequence.frame_work_ms, 1, "calendar_frame_work");
    return Math.max(...sequence.frame_work_ms);
  });
  const p95 = nearestRankP95(maxima);
  if (p95 > budget.maximum_p95_ms) fail("calendar_frame_budget_exceeded");
  return Object.freeze({
    samples: sequences.length,
    p95_ms: p95,
    missed_frames: sequences.reduce((sum, sequence) => sum + sequence.missed_frames, 0),
    refresh_rates_hz: Object.freeze([...new Set(sequences.map((sequence) => sequence.refresh_rate_hz))].sort((a, b) => a - b)),
    profiler_overhead_max_ms: Math.max(...sequences.map((sequence) => sequence.profiler_overhead_ms)),
  });
}

function validatePhase12(raw) {
  const fixture = raw.phase12_merge_fixture;
  const preflight = V12_PERFORMANCE_BUDGETS.phase12_merge_preflight;
  if (!fixture || fixture.snapshot_bytes !== preflight.required_snapshot_bytes || fixture.rows !== preflight.required_rows || fixture.writer_commits !== V12_PERFORMANCE_BUDGETS.phase12_merge_materialization.minimum_samples || fixture.sqlite_max_variable_number < 4_000) fail("phase12_fixture_invalid");
  const dirty = p95Summary(raw.phase12_dirty_trigger_ms, V12_PERFORMANCE_BUDGETS.phase12_dirty_trigger.minimum_samples, V12_PERFORMANCE_BUDGETS.phase12_dirty_trigger.maximum_p95_ms, "phase12_dirty_trigger");
  const writer = p95Summary(raw.phase12_writer_occupancy_ms, V12_PERFORMANCE_BUDGETS.phase12_writer_occupancy.minimum_samples, V12_PERFORMANCE_BUDGETS.phase12_writer_occupancy.maximum_p95_ms, "phase12_writer_occupancy");
  const preflightSummary = p95Summary(raw.phase12_merge_preflight_ms, preflight.minimum_samples, preflight.maximum_p95_ms, "phase12_merge_preflight");
  const growth = p95Summary(raw.phase12_merge_peak_growth_bytes, preflight.minimum_samples, preflight.maximum_peak_growth_bytes, "phase12_merge_peak_growth");
  const materialization = p95Summary(raw.phase12_merge_materialization_ms, V12_PERFORMANCE_BUDGETS.phase12_merge_materialization.minimum_samples, V12_PERFORMANCE_BUDGETS.phase12_merge_materialization.maximum_p95_ms, "phase12_merge_materialization");
  return Object.freeze({ dirty_trigger: dirty, writer_occupancy: writer, merge_preflight: preflightSummary, merge_peak_growth: growth, merge_materialization: materialization, fixture: Object.freeze({ ...fixture }) });
}

function validateGarmin(raw) {
  const expected = V12_PERFORMANCE_BUDGETS.garmin_sync_normalization;
  const value = raw.garmin_sync_normalization;
  if (!value || value.state !== "REVIEW_REQUIRED" || value.limit_source !== expected.limit_source || !HASH.test(value.fixture_sha256 ?? "") || Object.hasOwn(value, "limit_ms") || Object.hasOwn(value, "verdict")) fail("garmin_limit_invalid");
  return Object.freeze({ state: "REVIEW_REQUIRED", limit_source: expected.limit_source, fixture_sha256: value.fixture_sha256 });
}

function validateExtendedSamples(raw) {
  const inputs = raw.input_response_ms;
  if (!inputs || typeof inputs !== "object" || Object.keys(inputs).length === 0) fail("input_response_invalid");
  const input = Object.fromEntries(Object.entries(inputs).map(([name, values]) => [name, p95Summary(values, V12_PERFORMANCE_BUDGETS.input_response.minimum_samples_per_path, V12_PERFORMANCE_BUDGETS.input_response.maximum_p95_ms, `input_${name}`)]));
  return Object.freeze({
    input_response: Object.freeze(input),
    search_after_debounce: p95Summary(raw.search_after_debounce_ms, V12_PERFORMANCE_BUDGETS.search_after_debounce.minimum_samples, V12_PERFORMANCE_BUDGETS.search_after_debounce.maximum_p95_ms, "search_after_debounce"),
    calendar_month_and_selection: p95Summary(raw.calendar_month_and_selection_ms, V12_PERFORMANCE_BUDGETS.calendar_month_and_selection.minimum_samples, V12_PERFORMANCE_BUDGETS.calendar_month_and_selection.maximum_p95_ms, "calendar_month_and_selection"),
    progress_useful_content: maxSummary(raw.progress_useful_content_ms, V12_PERFORMANCE_BUDGETS.progress_useful_content.minimum_samples, V12_PERFORMANCE_BUDGETS.progress_useful_content.maximum_ms, "progress_useful_content"),
    progress_review_open: p95Summary(raw.progress_review_open_ms, V12_PERFORMANCE_BUDGETS.progress_review_open.minimum_samples, V12_PERFORMANCE_BUDGETS.progress_review_open.maximum_p95_ms, "progress_review_open"),
    progress_targeted_rebuild: maxSummary(raw.progress_targeted_rebuild_ms, V12_PERFORMANCE_BUDGETS.progress_targeted_rebuild.minimum_samples, V12_PERFORMANCE_BUDGETS.progress_targeted_rebuild.maximum_ms, "progress_targeted_rebuild"),
    calendar_frame_sequences: validateFrameSequences(raw.calendar_frame_sequences),
    phase12: validatePhase12(raw),
    garmin_sync_normalization: validateGarmin(raw),
  });
}

/** Creates a bounded, privacy-safe observation payload; it neither writes files nor assigns evidence verdicts. */
export function executeV12PerformanceShard({ identity, performance }) {
  validateV12PerformanceProducer(performance, identity, V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD, fail);
  const core = validateV12PerformanceEvidence(performance, identity);
  const extension = validateExtendedSamples(performance.samples ?? {});
  return Object.freeze({
    schema_version: 1,
    suite: "v1.2-performance",
    producer: "v12-performance-observation-shard/v1",
    observation_state: "REVIEW_REQUIRED",
    identity: Object.freeze({ ...identity }),
    budgets: V12_PERFORMANCE_BUDGETS,
    workload: V12_PERFORMANCE_WORKLOAD,
    raw_samples: Object.freeze(structuredClone(performance.samples)),
    summary: Object.freeze({ ...core, ...extension }),
  });
}

export function validateV12PerformanceShard(observation, identity) {
  if (!observation || observation.schema_version !== 1 || observation.suite !== "v1.2-performance" || observation.producer !== "v12-performance-observation-shard/v1" || observation.observation_state !== "REVIEW_REQUIRED" || Object.hasOwn(observation, "verdict") || Object.hasOwn(observation, "status") || JSON.stringify(observation.budgets) !== JSON.stringify(V12_PERFORMANCE_BUDGETS) || JSON.stringify(observation.workload) !== JSON.stringify(V12_PERFORMANCE_WORKLOAD)) fail("envelope_invalid");
  const performance = {
    schema_version: 1,
    suite: "v1.2-performance",
    producer: "v12-release-performance-collector/v1",
    native_execution: "EXECUTED",
    sample_origin: "release-native-source-backed",
    workload: observation.workload,
    identity: observation.identity,
    budgets: observation.budgets,
    samples: observation.raw_samples,
  };
  validateV12PerformanceProducer(performance, identity, V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD, fail);
  const core = validateV12PerformanceEvidence(performance, identity);
  const extension = validateExtendedSamples(observation.raw_samples);
  return Object.freeze({ ...core, ...extension });
}

function immutableWrite(root, relativePath, value, write = undefined) {
  if (typeof write === "function") return write(relativePath, value);
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`) || existsSync(absolute)) fail("immutable_output_invalid");
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value)}\n`, { flag: "wx" });
}

/**
 * Persists a complete release-native collection exactly once. The collector must
 * expose every warm/cold/raw/frame sample; summaries are recomputed here rather
 * than trusted from the device process, so outliers cannot be silently removed.
 */
export function writeV12PerformanceObservation({ runId, identity, collect, root = process.cwd(), write } = {}) {
  if (!V12_RUN_ID.test(runId ?? "") || typeof collect !== "function") fail("collector_invalid");
  const performance = collect(Object.freeze({ run_id: runId, workload: V12_PERFORMANCE_WORKLOAD, budgets: V12_PERFORMANCE_BUDGETS, build_variant: "release", sample_origin: "release-native-source-backed" }));
  const observation = executeV12PerformanceShard({ identity, performance });
  validateV12PerformanceShard(observation, identity);
  const output = Object.freeze({ schema_version: 1, producer: "v12-release-performance-writer/v1", run_id: runId, build_variant: "release", sample_origin: "release-native-source-backed", observation });
  immutableWrite(root, `artifacts/native/v1.2/${runId}/performance.json`, output, write);
  return output;
}

export function verifyV12PerformanceObservation({ runId, root = process.cwd(), readJson, identity } = {}) {
  if (!V12_RUN_ID.test(runId ?? "") || !identity) fail("arguments_invalid");
  const read = readJson ?? ((file) => JSON.parse(readFileSync(path.join(root, file), "utf8")));
  const output = read(`artifacts/native/v1.2/${runId}/performance.json`);
  if (!output || output.run_id !== runId || output.producer !== "v12-release-performance-writer/v1" || output.build_variant !== "release" || output.sample_origin !== "release-native-source-backed" || Object.hasOwn(output, "verdict") || Object.hasOwn(output, "readiness")) fail("output_invalid");
  return validateV12PerformanceShard(output.observation, identity);
}

export function runV12PerformanceCli(args = process.argv.slice(2), io = process) {
  try {
    if (args.length !== 3 || args[0] !== "--run" || !V12_RUN_ID.test(args[1] ?? "") || !["--execute", "--verify"].includes(args[2])) fail("arguments_invalid");
    const adapter = createV12NativeAdapter();
    const identity = adapter.collectPerformance({ run_id: args[1], request: "identity" }).identity;
    if (args[2] === "--execute") publishV12AtomicShard({ runId: args[1], shard: "performance", executionOrigin: adapter.executionOrigin, produce: ({ write }) => writeV12PerformanceObservation({ runId: args[1], identity, collect: adapter.collectPerformance, write: (file, value) => write(file.replace(`artifacts/native/v1.2/${args[1]}/`, ""), value) }) });
    else verifyV12PerformanceObservation({ runId: args[1], identity });
    io.stdout.write(`${JSON.stringify({ run_id: args[1], command: args[2], ok: true })}\n`);
    return 0;
  } catch (error) { io.stderr.write(`${error.message}\n`); return 1; }
}

if (process.argv[1]?.endsWith("v12-performance-shard.mjs")) process.exitCode = runV12PerformanceCli();
