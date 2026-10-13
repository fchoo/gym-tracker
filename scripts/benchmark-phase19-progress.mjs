#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export const PHASE19_BENCHMARK_SUBPROCESS_TIMEOUT_MS = 180_000;
export const PHASE19_BENCHMARK_MAX_OUTPUT_BYTES = 1_048_576;

export const PHASE19_PROGRESS_MEASUREMENTS = Object.freeze([
  "useful_content_ms",
  "review_open_ms",
  "targeted_rebuild_ms",
  "range_query_ms",
  "chart_data_render_ms",
  "js_task_ms",
]);

export const PHASE19_PROGRESS_BUDGETS = Object.freeze({
  useful_content: Object.freeze({
    minimum_samples: 20,
    maximum_samples: 20,
    maximum_ms: 500,
  }),
  review_open: Object.freeze({
    minimum_samples: 100,
    maximum_samples: 100,
    maximum_p95_ms: 200,
  }),
  targeted_rebuild: Object.freeze({
    minimum_samples: 20,
    maximum_samples: 20,
    maximum_ms: 500,
  }),
  range_query: Object.freeze({ minimum_samples: 100, maximum_samples: 100 }),
  chart_render: Object.freeze({ minimum_samples: 20, maximum_samples: 20 }),
  ordinary_js_task: Object.freeze({
    minimum_samples: 100,
    maximum_samples: 100,
    maximum_ms: 50,
  }),
  maximum_query_rows: 500,
  maximum_query_samples: 4_096,
});

const SHA256 = /^[a-f0-9]{64}$/u;
const PRODUCTION_CASE_ID = "phase19-progress-production-workload";
const BENCHMARK_WORKER = "src/ui/__tests__/Phase19ProgressBenchmark.test.tsx";
const BENCHMARK_JEST_CONFIG = "scripts/benchmark-phase19-progress.jest.cjs";
const BENCHMARK_SOURCE_FILES = Object.freeze([
  "src/platform/sqlite/repositories/progressRepository.ts",
  "src/ui/components/FactualHistoryChart.tsx",
  "src/ui/components/RecommendationSurface.tsx",
  BENCHMARK_WORKER,
]);
const EXACT_EVIDENCE_KEYS = Object.freeze([
  "schema_version",
  "suite",
  "producer",
  "environment",
  "status",
  "native_status",
  "phase20_owned",
  "budgets",
  "production_artifact",
  "measurements",
  "query_rows",
  "targeted_rebuild",
]);

function fail(code) {
  throw new Error(code);
}

function resolveJestBin() {
  if (process.env.PHASE19_JEST_BIN !== undefined) {
    if (!existsSync(process.env.PHASE19_JEST_BIN)) {
      fail("phase19_progress_benchmark_jest_missing");
    }
    return process.env.PHASE19_JEST_BIN;
  }
  try {
    return createRequire(import.meta.url).resolve("jest/bin/jest");
  } catch {
    fail("phase19_progress_benchmark_jest_missing");
  }
}

function exactKeys(value, expected) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function containsScoreKey(value) {
  if (Array.isArray(value)) return value.some(containsScoreKey);
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(([key, entry]) =>
    /(?:^|[_-])score(?:$|[_-])/iu.test(key) || containsScoreKey(entry));
}

function validSamples(value) {
  return Array.isArray(value)
    && value.every((sample) => Number.isFinite(sample) && sample >= 0);
}

function maximum(samples) {
  return samples.reduce((current, sample) => Math.max(current, sample), 0);
}

function assertBoundedSamples(samples, budget, code) {
  if (
    !validSamples(samples)
    || samples.length < budget.minimum_samples
    || samples.length > budget.maximum_samples
  ) fail(code);
}

function canonicalSourceSha256(root) {
  const hash = createHash("sha256");
  for (const relativePath of BENCHMARK_SOURCE_FILES) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(readFileSync(path.join(root, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function nearestRankP95(samples) {
  if (!validSamples(samples) || samples.length === 0) {
    fail("phase19_progress_benchmark_samples_invalid");
  }
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1];
}

export function evaluatePhase19ProgressBenchmark(evidence) {
  if (
    !exactKeys(evidence, EXACT_EVIDENCE_KEYS)
    || containsScoreKey(evidence)
    || evidence.schema_version !== 3
    || evidence.suite !== "phase19-progress"
    || evidence.producer !== "phase19-progress-benchmark/v3"
    || evidence.environment !== "host-production-workload"
    || evidence.status !== "passed"
    || evidence.native_status !== "NOT_RUN"
    || evidence.phase20_owned !== true
    || JSON.stringify(evidence.budgets) !== JSON.stringify(PHASE19_PROGRESS_BUDGETS)
    || !exactKeys(evidence.production_artifact, [
      "case_id", "source_sha256", "result_sha256",
    ])
    || evidence.production_artifact.case_id !== PRODUCTION_CASE_ID
    || !SHA256.test(evidence.production_artifact.source_sha256 ?? "")
    || !SHA256.test(evidence.production_artifact.result_sha256 ?? "")
    || !exactKeys(evidence.measurements, PHASE19_PROGRESS_MEASUREMENTS)
  ) fail("phase19_progress_benchmark_schema_invalid");

  const { measurements } = evidence;
  assertBoundedSamples(
    measurements.useful_content_ms,
    PHASE19_PROGRESS_BUDGETS.useful_content,
    "phase19_progress_benchmark_useful_content_failed",
  );
  assertBoundedSamples(
    measurements.review_open_ms,
    PHASE19_PROGRESS_BUDGETS.review_open,
    "phase19_progress_benchmark_review_open_failed",
  );
  assertBoundedSamples(
    measurements.targeted_rebuild_ms,
    PHASE19_PROGRESS_BUDGETS.targeted_rebuild,
    "phase19_progress_benchmark_targeted_rebuild_failed",
  );
  assertBoundedSamples(
    measurements.range_query_ms,
    PHASE19_PROGRESS_BUDGETS.range_query,
    "phase19_progress_benchmark_range_query_failed",
  );
  assertBoundedSamples(
    measurements.chart_data_render_ms,
    PHASE19_PROGRESS_BUDGETS.chart_render,
    "phase19_progress_benchmark_chart_render_failed",
  );
  assertBoundedSamples(
    measurements.js_task_ms,
    PHASE19_PROGRESS_BUDGETS.ordinary_js_task,
    "phase19_progress_benchmark_js_task_failed",
  );

  if (maximum(measurements.useful_content_ms)
      > PHASE19_PROGRESS_BUDGETS.useful_content.maximum_ms) {
    fail("phase19_progress_benchmark_useful_content_failed");
  }
  if (nearestRankP95(measurements.review_open_ms)
      > PHASE19_PROGRESS_BUDGETS.review_open.maximum_p95_ms) {
    fail("phase19_progress_benchmark_review_open_failed");
  }
  const rebuildWithinBudget = maximum(measurements.targeted_rebuild_ms)
    <= PHASE19_PROGRESS_BUDGETS.targeted_rebuild.maximum_ms;
  const rebuildCompleted = exactKeys(evidence.targeted_rebuild, [
    "completed_rebuild_count", "updating_visible", "useful_content_visible",
  ])
    && evidence.targeted_rebuild.updating_visible === true
    && evidence.targeted_rebuild.useful_content_visible === true
    && Number.isSafeInteger(evidence.targeted_rebuild.completed_rebuild_count)
    && evidence.targeted_rebuild.completed_rebuild_count
      === PHASE19_PROGRESS_BUDGETS.targeted_rebuild.maximum_samples;
  if (!rebuildWithinBudget || !rebuildCompleted) {
    fail("phase19_progress_benchmark_targeted_rebuild_failed");
  }
  if (maximum(measurements.js_task_ms)
      > PHASE19_PROGRESS_BUDGETS.ordinary_js_task.maximum_ms) {
    fail("phase19_progress_benchmark_js_task_failed");
  }
  if (
    !exactKeys(evidence.query_rows, ["case_id", "samples"])
    || evidence.query_rows.case_id !== "progress-repository-query-rows"
    || !Array.isArray(evidence.query_rows.samples)
    || evidence.query_rows.samples.length < 1
    || evidence.query_rows.samples.length > PHASE19_PROGRESS_BUDGETS.maximum_query_samples
    || evidence.query_rows.samples.some((rows) => !Number.isSafeInteger(rows)
      || rows < 0 || rows > PHASE19_PROGRESS_BUDGETS.maximum_query_rows)
  ) fail("phase19_progress_benchmark_query_bounds_failed");

  const statistics = Object.fromEntries(PHASE19_PROGRESS_MEASUREMENTS.map((id) => [
    id,
    Object.freeze({
      p95_ms: nearestRankP95(measurements[id]),
      maximum_ms: maximum(measurements[id]),
    }),
  ]));
  return Object.freeze({
    schema_version: 3,
    suite: evidence.suite,
    producer: evidence.producer,
    environment: evidence.environment,
    status: "passed",
    native_status: "NOT_RUN",
    phase20_owned: true,
    budgets: PHASE19_PROGRESS_BUDGETS,
    production_artifact: evidence.production_artifact,
    measurements,
    query_rows: evidence.query_rows,
    targeted_rebuild: evidence.targeted_rebuild,
    sample_counts: Object.freeze(Object.fromEntries(
      PHASE19_PROGRESS_MEASUREMENTS.map((id) => [id, measurements[id].length]),
    )),
    statistics: Object.freeze(statistics),
  });
}

export function validatePhase19ProgressBenchmarkResult(result) {
  if (!exactKeys(result, [
    ...EXACT_EVIDENCE_KEYS,
    "sample_counts",
    "statistics",
  ])) fail("phase19_progress_benchmark_schema_invalid");
  const raw = Object.fromEntries(EXACT_EVIDENCE_KEYS.map((key) => [key, result[key]]));
  const evaluated = evaluatePhase19ProgressBenchmark(raw);
  if (JSON.stringify(evaluated) !== JSON.stringify(result)) {
    fail("phase19_progress_benchmark_result_invalid");
  }
  return true;
}

function runProductionBenchmarkWorker(root) {
  const directory = mkdtempSync(path.join(tmpdir(), "gym-phase19-progress-benchmark-"));
  const resultPath = path.join(directory, "production-result.json");
  try {
    const worker = spawnSync(
      process.execPath,
      [
        resolveJestBin(),
        "--config", BENCHMARK_JEST_CONFIG,
        "--runInBand",
        "--runTestsByPath", BENCHMARK_WORKER,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, PHASE19_BENCHMARK_RESULT_PATH: resultPath },
        timeout: PHASE19_BENCHMARK_SUBPROCESS_TIMEOUT_MS,
        maxBuffer: PHASE19_BENCHMARK_MAX_OUTPUT_BYTES,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    if (worker.error !== undefined) throw worker.error;
    if (worker.signal !== null || worker.status !== 0 || !existsSync(resultPath)) {
      fail("phase19_progress_benchmark_worker_failed");
    }
    const raw = readFileSync(resultPath);
    const result = JSON.parse(raw.toString("utf8"));
    return {
      result,
      resultSha256: createHash("sha256").update(raw).digest("hex"),
    };
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

export async function runSyntheticPhase19ProgressBenchmark(root = process.cwd()) {
  const worker = runProductionBenchmarkWorker(root);
  return evaluatePhase19ProgressBenchmark({
    ...worker.result,
    production_artifact: {
      case_id: PRODUCTION_CASE_ID,
      source_sha256: canonicalSourceSha256(root),
      result_sha256: worker.resultSha256,
    },
  });
}

export function parsePhase19ProgressBenchmarkArgs(args) {
  if (args.length !== 1 || args[0] !== "--synthetic") {
    fail("phase19_progress_benchmark_arguments_invalid");
  }
  return Object.freeze({ synthetic: true });
}

export async function executePhase19ProgressBenchmarkCli(args = process.argv.slice(2)) {
  parsePhase19ProgressBenchmarkArgs(args);
  const result = await runSyntheticPhase19ProgressBenchmark();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  executePhase19ProgressBenchmarkCli().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: "phase19_progress_benchmark_failed",
      message: error instanceof Error ? error.message : "phase19_progress_benchmark_failed",
    })}\n`);
    process.exitCode = 1;
  });
}
