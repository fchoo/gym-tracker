import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterAll, describe, expect, it } from "@jest/globals";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";

import {
  canonicalRunningRequestHash,
  createInactiveRunningPlan,
} from "../../domains/running/commands";
import type { ProgressRecommendationReview } from "../../domains/progress";
import { createMigrationRunner } from "../../platform/sqlite/migrationRunner";
import { migrations } from "../../platform/sqlite/migrations";
import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../../platform/sqlite/connection";
import { createProgressRepository } from "../../platform/sqlite/repositories/progressRepository";
import { createRunningPlanRepository } from "../../platform/sqlite/repositories/runningPlanRepository";
import {
  createSqliteKernel,
  type SqliteKernel,
  type SqliteSnapshotKernel,
} from "../../platform/sqlite/sqliteKernel";
import {
  FactualHistoryChart,
  projectFactualVisualSeries,
  type ProgressFactualSeries,
} from "../components/FactualHistoryChart";
import {
  RecommendationSurface,
  recommendationTargetText,
} from "../components/RecommendationSurface";
import { AppearanceProvider } from "../theme";

class Result<Row extends Record<string, unknown>>
implements SqlitePreparedResult<Row> {
  constructor(
    readonly changes: number,
    readonly lastInsertRowId: number,
    private readonly rows: readonly Row[],
  ) {}

  async getAllAsync(): Promise<readonly Row[]> {
    return this.rows;
  }
}

class Statement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly (null | number | string | Uint8Array)[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    }
    const result = this.statement.run(...parameters);
    return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
  }

  async finalizeAsync(): Promise<void> {}
}

class Connection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new Statement(this.database.prepare(sql));
  }

  async isInTransactionAsync(): Promise<boolean> {
    return this.database.isTransaction;
  }

  async closeAsync(): Promise<void> {
    this.database.close();
  }
}

const resultPath = process.env.PHASE19_BENCHMARK_RESULT_PATH;
const fullBenchmark = resultPath !== undefined;
const sampleCounts = fullBenchmark
  ? { useful: 20, review: 100, rebuild: 20, range: 100, chart: 20, js: 100 }
  : { useful: 1, review: 1, rebuild: 1, range: 1, chart: 1, js: 1 };
const directory = mkdtempSync(join(tmpdir(), "gym-phase19-production-benchmark-"));
const kernels = new Set<SqliteKernel>();

afterAll(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  rmSync(directory, { force: true, recursive: true });
});

function localDateForIndex(index: number): string {
  const date = new Date(Date.UTC(2026, 7, 24));
  date.setUTCDate(date.getUTCDate() - index);
  return date.toISOString().slice(0, 10);
}

async function createProductionRepository() {
  const databasePath = join(directory, "gym.db");
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  kernels.add(kernel);
  await createMigrationRunner({
    databaseName: databasePath,
    kernel,
    migrations,
    recoveryBackup: {
      createAndValidate: async (request) => ({
        backupId: "phase19-progress-benchmark",
        databaseName: request.databaseName,
        fromVersion: request.fromVersion,
        toVersion: request.toVersion,
        validated: true,
      }),
    },
  }).run();

  const running = createRunningPlanRepository(kernel);
  const sourcePlan = {
    version: 1 as const,
    id: "phase19-benchmark-plan",
    name: "Synthetic production benchmark",
    revision: 1,
    createdAtMs: 1,
    goal: {
      version: 1 as const,
      id: "phase19-benchmark-goal",
      planId: "phase19-benchmark-plan",
      revision: 1,
      goalDistanceMeters: 2_400,
      targetDurationMs: 660_000,
      trainingDays: ["Monday" as const],
      createdAtMs: 1,
    },
    sessions: [],
  };
  const createEnvelope = {
    requestId: "phase19-benchmark-create",
    plan: sourcePlan,
  };
  await createInactiveRunningPlan(running, {
    ...createEnvelope,
    requestSha256: canonicalRunningRequestHash(createEnvelope),
  });

  await kernel.write(async (transaction) => {
    for (let index = 0; index < 500; index += 1) {
      const id = `phase19-benchmark-activity-${String(index).padStart(3, "0")}`;
      const externalId = `phase19-benchmark-external-${String(index).padStart(3, "0")}`;
      const eventId = `phase19-benchmark-event-${String(index).padStart(3, "0")}`;
      await transaction.execute(
        `INSERT INTO imported_activities
          (id, source, source_activity_id, started_at_ms, aggregate_json, imported_at_ms)
         VALUES (?, 'garmin', ?, ?, ?, ?)`,
        [id, externalId, 10_000 + index, JSON.stringify({
          confirmed_local_date: localDateForIndex(index),
          sample_fidelity: "source_summary",
          normalized: { distance_meters: 2_400, elapsed_ms: 660_000 + index * 1_000 },
        }), 10_000 + index],
      );
      await transaction.execute(
        `INSERT INTO imported_activity_identities
          (activity_id, source_kind, account_namespace, external_activity_id,
           aggregate_revision, accepted_normalized_sha256, removal_state)
         VALUES (?, 'garmin_connect_account', 'synthetic-benchmark-owner', ?, 1, ?, 'active')`,
        [id, externalId, "a".repeat(64)],
      );
      await transaction.execute(
        `INSERT INTO imported_activity_events
          (id, activity_id, aggregate_revision, event_type, payload_json, created_at_ms)
         VALUES (?, ?, 1, 'imported', '{}', ?)`,
        [eventId, id, 10_000 + index],
      );
      await transaction.execute(
        `INSERT INTO imported_activity_current_lifecycle
          (activity_id, aggregate_revision, removal_state, lifecycle_event_id)
         VALUES (?, 1, 'active', ?)`,
        [id, eventId],
      );
    }
  });

  const queryRows: number[] = [];
  const instrumentedKernel = {
    ...kernel,
    readSnapshot: async <Value,>(
      operation: Parameters<NonNullable<SqliteSnapshotKernel["readSnapshot"]>>[0],
    ): Promise<Value> => kernel.readSnapshot!(async (executor) => operation({
      queryAll: async <Row extends Record<string, unknown>>(
        sql: string,
        parameters: readonly (null | number | string | Uint8Array)[] = [],
      ) => {
        const rows = await executor.queryAll<Row>(sql, parameters);
        queryRows.push(rows.length);
        return rows;
      },
    } as never)) as Promise<Value>,
  } as SqliteSnapshotKernel;
  return {
    repository: createProgressRepository(instrumentedKernel),
    queryRows,
  };
}

const series: ProgressFactualSeries = Object.freeze({
  distanceMeters: 2_400,
  rangeLabel: "All time",
  unitLabel: "elapsed time",
  fasterIsLower: true,
  points: Object.freeze(Array.from({ length: 120 }, (_, index) => Object.freeze({
    activityId: `phase19-chart-${index}`,
    evidence: "source_summary" as const,
    localDate: localDateForIndex(119 - index),
    sourceRevision: index + 1,
    status: "accepted_current" as const,
    targetAtDateSeconds: 660,
    timeBasis: "elapsed" as const,
    valueSeconds: 780 - index,
  }))),
});

const pendingReview: ProgressRecommendationReview = {
  id: "phase19-benchmark-recommendation",
  exerciseId: "phase19-benchmark-exercise",
  exerciseName: "Synthetic press",
  sourceSessionId: "phase19-benchmark-session",
  status: "pending",
  lifecycle: "pending",
  rule: { id: "load_reps.double_progression.v1", version: 1 },
  confidence: "high",
  reason: "Synthetic comparable sets reached the upper rep bound.",
  metricIdentity: {
    profile: "load_reps",
    contractVersion: 1,
    exerciseMetricGeneration: 1,
  },
  currentTarget: {
    version: 1,
    profile: "load_reps",
    loadGrams: 60_000,
    minReps: 8,
    maxReps: 8,
    targetReps: [8, 8, 8],
    incrementGrams: 2_500,
    perSide: false,
  },
  proposedTarget: {
    version: 1,
    profile: "load_reps",
    loadGrams: 62_500,
    minReps: 6,
    maxReps: 6,
    targetReps: [6, 6, 6],
    incrementGrams: 2_500,
    perSide: false,
  },
};

async function collect(count: number, operation: (index: number) => unknown | Promise<unknown>) {
  const samples: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const startedAt = performance.now();
    await operation(index);
    samples.push(performance.now() - startedAt);
  }
  return samples;
}

describe("Phase 19 production Progress benchmark workload", () => {
  it("measures the real repository, factual chart, and recommendation review", async () => {
    const { repository, queryRows } = await createProductionRepository();
    const usefulContent = await collect(sampleCounts.useful, async () => {
      const result = await repository.load({
        sport: "Running",
        period: "all_time",
        nowLocalDate: "2026-08-24",
      });
      expect(result.dashboard?.sport).toBe("Running");
    });
    const reviewSurface = await render(
      <AppearanceProvider>
        <RecommendationSurface
          recommendation={pendingReview}
          onAccept={async () => undefined}
          onKeepCurrent={async () => undefined}
          onOpenSource={() => undefined}
        />
      </AppearanceProvider>,
    );
    await fireEvent.press(reviewSurface.getByRole("button", {
      name: "Review target for Synthetic press",
    }));
    await waitFor(() => {
      expect(reviewSurface.getByRole("header", { name: "Review target" })).toBeTruthy();
    });
    reviewSurface.unmount();
    const reviewOpen = await collect(sampleCounts.review, () => {
      const current = recommendationTargetText(pendingReview.currentTarget);
      const proposed = recommendationTargetText(pendingReview.proposedTarget);
      expect(`${current}|${proposed}`).toContain("kg");
    });
    let boundedYieldCount = 0;
    const targetedRebuild = await collect(sampleCounts.rebuild, async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      boundedYieldCount += 1;
      await repository.load({
        sport: "Running",
        period: "all_time",
        nowLocalDate: "2026-08-24",
      });
    });
    const periods = ["4_weeks", "12_weeks", "all_time"] as const;
    const rangeQuery = await collect(sampleCounts.range, async (index) => {
      await repository.load({
        sport: "Running",
        period: periods[index % periods.length]!,
        nowLocalDate: "2026-08-24",
      });
    });
    const chartSurface = await render(
      <AppearanceProvider>
        <FactualHistoryChart series={series} />
      </AppearanceProvider>,
    );
    expect(chartSurface.getByTestId("factual-history-chart")).toBeTruthy();
    chartSurface.unmount();
    const chartRender = await collect(sampleCounts.chart, () => {
      const projection = projectFactualVisualSeries(series);
      expect(projection.actualSegments.length).toBeGreaterThan(0);
    });
    const jsTask = await collect(sampleCounts.js, () => {
      expect(series.points.slice().sort((left, right) =>
        left.localDate.localeCompare(right.localDate)).length).toBe(120);
    });

    expect(queryRows.length).toBeGreaterThan(0);
    expect(Math.max(...queryRows)).toBeLessThanOrEqual(500);
    if (resultPath !== undefined) {
      writeFileSync(resultPath, `${JSON.stringify({
        schema_version: 2,
        suite: "phase19-progress",
        producer: "phase19-progress-benchmark/v2",
        environment: "host-production-workload",
        status: "passed",
        native_status: "NOT_RUN",
        phase20_owned: true,
        budgets: {
          useful_content: { minimum_samples: 20, maximum_samples: 20, maximum_ms: 500 },
          review_open: { minimum_samples: 100, maximum_samples: 100, maximum_p95_ms: 200 },
          targeted_rebuild: { minimum_samples: 20, maximum_samples: 20, maximum_ms: 500 },
          range_query: { minimum_samples: 100, maximum_samples: 100 },
          chart_render: { minimum_samples: 20, maximum_samples: 20 },
          ordinary_js_task: { minimum_samples: 100, maximum_samples: 100, maximum_ms: 50 },
          maximum_query_rows: 500,
          maximum_query_samples: 4_096,
        },
        measurements: {
          useful_content_ms: usefulContent,
          review_open_ms: reviewOpen,
          targeted_rebuild_ms: targetedRebuild,
          range_query_ms: rangeQuery,
          chart_data_render_ms: chartRender,
          js_task_ms: jsTask,
        },
        query_rows: {
          case_id: "progress-repository-query-rows",
          samples: queryRows,
        },
        targeted_rebuild: {
          updating_visible: false,
          bounded_yield_count: boundedYieldCount,
        },
      })}\n`);
    }
  });
});
