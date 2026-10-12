#!/usr/bin/env node

import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const PHASE19_PROGRESS_MEASUREMENTS = Object.freeze([
  "useful_content_ms",
  "review_open_ms",
  "targeted_rebuild_ms",
  "range_query_ms",
  "chart_data_render_ms",
  "js_task_ms",
]);

export const PHASE19_PROGRESS_BUDGETS = Object.freeze({
  useful_content: Object.freeze({ minimum_samples: 20, maximum_ms: 500 }),
  review_open: Object.freeze({ minimum_samples: 100, maximum_p95_ms: 200 }),
  targeted_rebuild: Object.freeze({ minimum_samples: 20, maximum_ms: 500 }),
  ordinary_js_task: Object.freeze({ minimum_samples: 100, maximum_ms: 50 }),
  maximum_query_rows: 500,
});

const EXACT_EVIDENCE_KEYS = Object.freeze([
  "schema_version",
  "suite",
  "producer",
  "environment",
  "status",
  "native_status",
  "phase20_owned",
  "budgets",
  "measurements",
  "query_rows",
  "targeted_rebuild",
]);

function fail(code) {
  throw new Error(code);
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
    || evidence.schema_version !== 1
    || evidence.suite !== "phase19-progress"
    || evidence.producer !== "phase19-progress-benchmark/v1"
    || evidence.environment !== "host-synthetic"
    || evidence.status !== "passed"
    || evidence.native_status !== "NOT_RUN"
    || evidence.phase20_owned !== true
    || JSON.stringify(evidence.budgets) !== JSON.stringify(PHASE19_PROGRESS_BUDGETS)
    || !exactKeys(evidence.measurements, PHASE19_PROGRESS_MEASUREMENTS)
  ) {
    fail("phase19_progress_benchmark_schema_invalid");
  }
  for (const id of PHASE19_PROGRESS_MEASUREMENTS) {
    if (!validSamples(evidence.measurements[id])) {
      fail("phase19_progress_benchmark_samples_invalid");
    }
  }
  const { measurements } = evidence;
  if (
    measurements.useful_content_ms.length
      < PHASE19_PROGRESS_BUDGETS.useful_content.minimum_samples
    || maximum(measurements.useful_content_ms)
      > PHASE19_PROGRESS_BUDGETS.useful_content.maximum_ms
  ) fail("phase19_progress_benchmark_useful_content_failed");
  if (
    measurements.review_open_ms.length
      < PHASE19_PROGRESS_BUDGETS.review_open.minimum_samples
    || nearestRankP95(measurements.review_open_ms)
      > PHASE19_PROGRESS_BUDGETS.review_open.maximum_p95_ms
  ) fail("phase19_progress_benchmark_review_open_failed");
  const rebuildWithinBudget = maximum(measurements.targeted_rebuild_ms)
    <= PHASE19_PROGRESS_BUDGETS.targeted_rebuild.maximum_ms;
  const rebuildYielded = evidence.targeted_rebuild?.updating_visible === true
    && Number.isSafeInteger(evidence.targeted_rebuild?.bounded_yield_count)
    && evidence.targeted_rebuild.bounded_yield_count
      >= PHASE19_PROGRESS_BUDGETS.targeted_rebuild.minimum_samples;
  if (
    measurements.targeted_rebuild_ms.length
      < PHASE19_PROGRESS_BUDGETS.targeted_rebuild.minimum_samples
    || (!rebuildWithinBudget && !rebuildYielded)
  ) fail("phase19_progress_benchmark_targeted_rebuild_failed");
  if (
    measurements.js_task_ms.length
      < PHASE19_PROGRESS_BUDGETS.ordinary_js_task.minimum_samples
    || maximum(measurements.js_task_ms)
      > PHASE19_PROGRESS_BUDGETS.ordinary_js_task.maximum_ms
  ) fail("phase19_progress_benchmark_js_task_failed");
  if (
    !exactKeys(evidence.query_rows, ["zero", "one", "many", "long", "all_time"])
    || Object.values(evidence.query_rows).some((samples) =>
      !Array.isArray(samples)
      || samples.length === 0
      || samples.some((rows) => !Number.isSafeInteger(rows)
        || rows < 0 || rows > PHASE19_PROGRESS_BUDGETS.maximum_query_rows))
  ) fail("phase19_progress_benchmark_query_bounds_failed");

  const statistics = Object.fromEntries(PHASE19_PROGRESS_MEASUREMENTS.map((id) => [
    id,
    Object.freeze({
      p95_ms: nearestRankP95(measurements[id]),
      maximum_ms: maximum(measurements[id]),
    }),
  ]));
  return Object.freeze({
    schema_version: 1,
    suite: evidence.suite,
    producer: evidence.producer,
    environment: evidence.environment,
    status: "passed",
    native_status: "NOT_RUN",
    phase20_owned: true,
    budgets: PHASE19_PROGRESS_BUDGETS,
    measurements,
    query_rows: evidence.query_rows,
    targeted_rebuild: evidence.targeted_rebuild,
    sample_counts: Object.freeze(Object.fromEntries(
      PHASE19_PROGRESS_MEASUREMENTS.map((id) => [id, measurements[id].length]),
    )),
    statistics: Object.freeze(statistics),
  });
}

function localDateForIndex(index) {
  const date = new Date(Date.UTC(2026, 7, 24));
  date.setUTCDate(date.getUTCDate() - index);
  return date.toISOString().slice(0, 10);
}

async function createSyntheticRuntime() {
  const directory = mkdtempSync(path.join(tmpdir(), "gym-phase19-progress-benchmark-"));
  const databasePath = path.join(directory, "gym.db");
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE progress_facts (
      id TEXT PRIMARY KEY NOT NULL,
      local_date TEXT NOT NULL,
      started_at_ms INTEGER NOT NULL,
      source_revision INTEGER NOT NULL,
      distance_meters INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX progress_facts_range_idx
      ON progress_facts(local_date, started_at_ms, id);
    CREATE TABLE progress_reviews (
      id TEXT PRIMARY KEY NOT NULL,
      source_revision INTEGER NOT NULL,
      target_revision INTEGER NOT NULL,
      status TEXT NOT NULL
    ) STRICT;
    INSERT INTO progress_reviews
      (id, source_revision, target_revision, status)
      VALUES ('synthetic-review', 1, 1, 'pending');
  `);
  const insert = database.prepare(
    `INSERT INTO progress_facts
      (id, local_date, started_at_ms, source_revision, distance_meters, duration_seconds)
     VALUES (?, ?, ?, ?, 2400, ?)`,
  );
  database.exec("BEGIN IMMEDIATE");
  try {
    for (let index = 0; index < 500; index += 1) {
      insert.run(
        `phase19-benchmark-fact-${String(index).padStart(3, "0")}`,
        localDateForIndex(index),
        10_000 + index,
        index + 1,
        660 + index,
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  const rangeStatement = database.prepare(
    `SELECT local_date, source_revision, distance_meters, duration_seconds
       FROM progress_facts
      WHERE (? IS NULL OR local_date >= ?)
      ORDER BY local_date, started_at_ms, id
      LIMIT 500`,
  );
  const reviewStatement = database.prepare(
    `SELECT source_revision, target_revision, status
       FROM progress_reviews
      WHERE id = 'synthetic-review'`,
  );
  const rangeStart = (period) => period === "4_weeks"
    ? "2026-07-28"
    : period === "12_weeks" ? "2026-06-02" : null;
  const load = (period = "all_time") => {
    const start = rangeStart(period);
    const rows = rangeStatement.all(start, start);
    const latest = rows.at(-1) ?? null;
    const best = rows.reduce((current, row) =>
      current === null || row.duration_seconds < current.duration_seconds ? row : current, null);
    return Object.freeze({
      state: rows.length === 0 ? "empty" : rows.length === 1 ? "sparse" : "ready",
      latest,
      best,
      target: Object.freeze({ distance_meters: 2_400, duration_seconds: 660 }),
      history: Object.freeze(rows),
    });
  };
  return {
    database,
    load,
    openReview: () => reviewStatement.get(),
    close: async () => {
      database.close();
      rmSync(directory, { force: true, recursive: true });
    },
  };
}

function runProductionRepositoryPreflight() {
  execFileSync(
    process.execPath,
    [
      path.join(process.cwd(), "node_modules/jest/bin/jest.js"),
      "--config", "jest.config.js",
      "--selectProjects", "unit",
      "--runInBand",
      "src/testing/contracts/progressParity.contract.test.ts",
    ],
    { cwd: process.cwd(), stdio: "ignore" },
  );
}

async function duration(operation) {
  const started = performance.now();
  const value = await operation();
  return { elapsed: performance.now() - started, value };
}

async function collectSamples(count, operation) {
  const values = [];
  const outputs = [];
  for (let index = 0; index < count; index += 1) {
    const measured = await duration(() => operation(index));
    values.push(measured.elapsed);
    outputs.push(measured.value);
  }
  return { values, outputs };
}

export async function runSyntheticPhase19ProgressBenchmark() {
  runProductionRepositoryPreflight();
  const runtime = await createSyntheticRuntime();
  try {
    const load = (period = "all_time") => runtime.load(period);
    const useful = await collectSamples(20, async () => {
      const result = await load();
      if (result.state !== "ready" || result.history.length === 0) {
        fail("phase19_progress_benchmark_fixture_invalid");
      }
      return result.history.length;
    });
    const review = await collectSamples(100, async () => {
      const result = runtime.openReview();
      if (result?.status !== "pending") fail("phase19_progress_benchmark_fixture_invalid");
      return result.target_revision;
    });
    let boundedYieldCount = 0;
    const rebuild = await collectSamples(20, async () => {
      await new Promise((resolve) => setImmediate(resolve));
      boundedYieldCount += 1;
      const result = await load();
      return result.history.length;
    });
    const periods = ["4_weeks", "12_weeks", "all_time"];
    const range = await collectSamples(100, async (index) => {
      const result = await load(periods[index % periods.length]);
      return result.history.length;
    });
    const chart = await collectSamples(20, async () => {
      const result = await load();
      const rows = result.history.map((row) => ({
        date: row.local_date,
        duration: row.duration_seconds,
        target: result.target.duration_seconds,
      }));
      JSON.stringify(rows);
      return rows.length;
    });
    const source = Array.from({ length: 500 }, (_, index) => 500 - index);
    const jsTask = await collectSamples(100, async () => {
      const rows = source.slice().sort((left, right) => left - right).slice(0, 84);
      return rows.reduce((sum, value) => sum + value, 0);
    });
    const rows = (where, limit) => runtime.database.prepare(
      `SELECT id FROM progress_facts ${where} ORDER BY id LIMIT ${limit}`,
    ).all();
    const queryRows = [
      rows("WHERE started_at_ms < 0", 500),
      rows("", 1),
      rows("", 28),
      rows("", 84),
      rows("", 500),
    ];
    return evaluatePhase19ProgressBenchmark({
      schema_version: 1,
      suite: "phase19-progress",
      producer: "phase19-progress-benchmark/v1",
      environment: "host-synthetic",
      status: "passed",
      native_status: "NOT_RUN",
      phase20_owned: true,
      budgets: PHASE19_PROGRESS_BUDGETS,
      measurements: {
        useful_content_ms: useful.values,
        review_open_ms: review.values,
        targeted_rebuild_ms: rebuild.values,
        range_query_ms: range.values,
        chart_data_render_ms: chart.values,
        js_task_ms: jsTask.values,
      },
      query_rows: {
        zero: [queryRows[0].length],
        one: [queryRows[1].length],
        many: [queryRows[2].length, queryRows[3].length],
        long: [queryRows[4].length],
        all_time: [Math.max(...range.outputs)],
      },
      targeted_rebuild: {
        updating_visible: false,
        bounded_yield_count: boundedYieldCount,
      },
    });
  } finally {
    await runtime.close();
  }
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
