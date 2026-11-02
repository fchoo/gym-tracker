import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PHASE19_PROGRESS_BUDGETS,
  PHASE19_PROGRESS_MEASUREMENTS,
  evaluatePhase19ProgressBenchmark,
  nearestRankP95,
  parsePhase19ProgressBenchmarkArgs,
  validatePhase19ProgressBenchmarkResult,
} from "./benchmark-phase19-progress.mjs";

const repeated = (count, value) => Array.from({ length: count }, (_, index) => value + (index % 3));

function evidence(overrides = {}) {
  return {
    schema_version: 3,
    suite: "phase19-progress",
    producer: "phase19-progress-benchmark/v3",
    environment: "host-production-workload",
    status: "passed",
    native_status: "NOT_RUN",
    phase20_owned: true,
    budgets: PHASE19_PROGRESS_BUDGETS,
    production_artifact: {
      case_id: "phase19-progress-production-workload",
      source_sha256: "a".repeat(64),
      result_sha256: "b".repeat(64),
    },
    measurements: {
      useful_content_ms: repeated(20, 10),
      review_open_ms: repeated(100, 8),
      targeted_rebuild_ms: repeated(20, 12),
      range_query_ms: repeated(100, 5),
      chart_data_render_ms: repeated(20, 4),
      js_task_ms: repeated(100, 2),
    },
    query_rows: {
      case_id: "progress-repository-query-rows",
      samples: [0, 1, 28, 84, 500],
    },
    targeted_rebuild: {
      updating_visible: true,
      useful_content_visible: true,
      completed_rebuild_count: 20,
    },
    ...overrides,
  };
}

test("Progress benchmark enforces only the named NV-PERF-08 and JS-task budgets", () => {
  assert.deepEqual(PHASE19_PROGRESS_MEASUREMENTS, [
    "useful_content_ms",
    "review_open_ms",
    "targeted_rebuild_ms",
    "range_query_ms",
    "chart_data_render_ms",
    "js_task_ms",
  ]);
  assert.deepEqual(PHASE19_PROGRESS_BUDGETS, {
    useful_content: { minimum_samples: 20, maximum_samples: 20, maximum_ms: 500 },
    review_open: { minimum_samples: 100, maximum_samples: 100, maximum_p95_ms: 200 },
    targeted_rebuild: { minimum_samples: 20, maximum_samples: 20, maximum_ms: 500 },
    range_query: { minimum_samples: 100, maximum_samples: 100 },
    chart_render: { minimum_samples: 20, maximum_samples: 20 },
    ordinary_js_task: { minimum_samples: 100, maximum_samples: 100, maximum_ms: 50 },
    maximum_query_rows: 500,
    maximum_query_samples: 4_096,
  });
  assert.equal(nearestRankP95([1, 2, 3, 4, 5]), 5);

  const result = evaluatePhase19ProgressBenchmark(evidence());

  assert.equal(result.status, "passed");
  assert.equal(result.native_status, "NOT_RUN");
  assert.equal(result.sample_counts.review_open_ms, 100);
  assert.equal(result.statistics.review_open_ms.p95_ms, 10);
  assert.equal(result.statistics.useful_content_ms.maximum_ms, 12);
  assert.equal(result.statistics.js_task_ms.maximum_ms, 4);
  assert.deepEqual(result.production_artifact, evidence().production_artifact);
  assert.equal(validatePhase19ProgressBenchmarkResult(result), true);
  assert.equal(Object.hasOwn(result, "score"), false);
  assert.doesNotMatch(JSON.stringify(result), /aggregate[_-]?score|baseline[_-]?score/iu);
});

test("Progress benchmark rejects under-sampling, non-finite data, invented scores, and failed named budgets", () => {
  const variants = [];
  const underSampled = evidence();
  underSampled.measurements.review_open_ms = underSampled.measurements.review_open_ms.slice(0, 99);
  variants.push(underSampled);
  const nonFinite = evidence();
  nonFinite.measurements.js_task_ms = [Number.NaN, ...nonFinite.measurements.js_task_ms.slice(1)];
  variants.push(nonFinite);
  const usefulContentSlow = evidence();
  usefulContentSlow.measurements.useful_content_ms[19] = 501;
  variants.push(usefulContentSlow);
  const reviewSlow = evidence();
  reviewSlow.measurements.review_open_ms.fill(201);
  variants.push(reviewSlow);
  const rebuildSlow = evidence();
  rebuildSlow.measurements.targeted_rebuild_ms[19] = 501;
  variants.push(rebuildSlow);
  const rebuildWithoutVisibleState = evidence();
  rebuildWithoutVisibleState.targeted_rebuild.updating_visible = false;
  variants.push(rebuildWithoutVisibleState);
  const rebuildWithoutUsefulContent = evidence();
  rebuildWithoutUsefulContent.targeted_rebuild.useful_content_visible = false;
  variants.push(rebuildWithoutUsefulContent);
  const jsTaskSlow = evidence();
  jsTaskSlow.measurements.js_task_ms[99] = 51;
  variants.push(jsTaskSlow);
  const unboundedRows = evidence();
  unboundedRows.query_rows.samples = [501];
  variants.push(unboundedRows);
  const unboundedQuerySamples = evidence();
  unboundedQuerySamples.query_rows.samples = Array(4_097).fill(1);
  variants.push(unboundedQuerySamples);
  variants.push(evidence({ score: 100 }));
  variants.push(evidence({ native_status: "PASS" }));
  const overSampled = evidence();
  overSampled.measurements.useful_content_ms.push(1);
  variants.push(overSampled);
  variants.push(evidence({ production_artifact: {
    case_id: "phase19-progress-production-workload",
    source_sha256: "not-a-hash",
    result_sha256: "b".repeat(64),
  } }));

  for (const variant of variants) {
    assert.throws(
      () => evaluatePhase19ProgressBenchmark(variant),
      /phase19_progress_benchmark_/u,
    );
  }
});

test("Progress benchmark executes the production repository and UI workload with bounded subprocesses", () => {
  const source = readFileSync("scripts/benchmark-phase19-progress.mjs", "utf8");
  const worker = readFileSync("src/ui/__tests__/Phase19ProgressBenchmark.test.tsx", "utf8");
  assert.doesNotMatch(source, /CREATE TABLE progress_facts|createSyntheticRuntime/u);
  assert.match(source, /Phase19ProgressBenchmark\.test\.tsx/u);
  assert.match(source, /timeout:\s*PHASE19_BENCHMARK_SUBPROCESS_TIMEOUT_MS/u);
  assert.match(source, /maxBuffer:\s*PHASE19_BENCHMARK_MAX_OUTPUT_BYTES/u);
  assert.match(worker, /fireEvent\.press[\s\S]*Review target for Synthetic press/u);
  assert.match(worker, /createHistoryProjectionEffectRunner/u);
  assert.match(worker, /Updating progress/u);
  assert.match(worker, /Nearest active goal/u);
  assert.doesNotMatch(worker, /recommendationTargetText|setImmediate/u);
});

test("Progress benchmark CLI is host-only and does not accept native or score flags", () => {
  assert.deepEqual(parsePhase19ProgressBenchmarkArgs(["--synthetic"]), {
    synthetic: true,
  });
  for (const args of [[], ["--native"], ["--score"], ["--synthetic", "--output", "native.json"]]) {
    assert.throws(
      () => parsePhase19ProgressBenchmarkArgs(args),
      /phase19_progress_benchmark_arguments_invalid/u,
    );
  }
});
