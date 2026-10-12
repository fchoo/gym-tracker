import assert from "node:assert/strict";
import test from "node:test";

import {
  PHASE19_PROGRESS_BUDGETS,
  PHASE19_PROGRESS_MEASUREMENTS,
  evaluatePhase19ProgressBenchmark,
  nearestRankP95,
  parsePhase19ProgressBenchmarkArgs,
} from "./benchmark-phase19-progress.mjs";

const repeated = (count, value) => Array.from({ length: count }, (_, index) => value + (index % 3));

function evidence(overrides = {}) {
  return {
    schema_version: 1,
    suite: "phase19-progress",
    producer: "phase19-progress-benchmark/v1",
    environment: "host-synthetic",
    status: "passed",
    native_status: "NOT_RUN",
    phase20_owned: true,
    budgets: PHASE19_PROGRESS_BUDGETS,
    measurements: {
      useful_content_ms: repeated(20, 10),
      review_open_ms: repeated(100, 8),
      targeted_rebuild_ms: repeated(20, 12),
      range_query_ms: repeated(100, 5),
      chart_data_render_ms: repeated(20, 4),
      js_task_ms: repeated(100, 2),
    },
    query_rows: {
      zero: [0],
      one: [1],
      many: [28, 84],
      long: [500],
      all_time: [500],
    },
    targeted_rebuild: {
      updating_visible: true,
      bounded_yield_count: 20,
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
    useful_content: { minimum_samples: 20, maximum_ms: 500 },
    review_open: { minimum_samples: 100, maximum_p95_ms: 200 },
    targeted_rebuild: { minimum_samples: 20, maximum_ms: 500 },
    ordinary_js_task: { minimum_samples: 100, maximum_ms: 50 },
    maximum_query_rows: 500,
  });
  assert.equal(nearestRankP95([1, 2, 3, 4, 5]), 5);

  const result = evaluatePhase19ProgressBenchmark(evidence());

  assert.equal(result.status, "passed");
  assert.equal(result.native_status, "NOT_RUN");
  assert.equal(result.sample_counts.review_open_ms, 100);
  assert.equal(result.statistics.review_open_ms.p95_ms, 10);
  assert.equal(result.statistics.useful_content_ms.maximum_ms, 12);
  assert.equal(result.statistics.js_task_ms.maximum_ms, 4);
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
  const rebuildSlowWithoutVisibleState = evidence();
  rebuildSlowWithoutVisibleState.measurements.targeted_rebuild_ms[19] = 501;
  rebuildSlowWithoutVisibleState.targeted_rebuild.updating_visible = false;
  variants.push(rebuildSlowWithoutVisibleState);
  const jsTaskSlow = evidence();
  jsTaskSlow.measurements.js_task_ms[99] = 51;
  variants.push(jsTaskSlow);
  const unboundedRows = evidence();
  unboundedRows.query_rows.long = [501];
  variants.push(unboundedRows);
  variants.push(evidence({ score: 100 }));
  variants.push(evidence({ native_status: "PASS" }));

  for (const variant of variants) {
    assert.throws(
      () => evaluatePhase19ProgressBenchmark(variant),
      /phase19_progress_benchmark_/u,
    );
  }
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
