import { describe, expect, it, jest } from "@jest/globals";

import { __progressRepositoryTestOnly, createProgressRepository } from "./progressRepository";
import type {
  SqliteReadTransactionExecutor,
  SqliteSnapshotKernel,
} from "../sqliteKernel";

jest.mock("./historyRepository", () => ({
  loadEffectiveHistoryProjectionSessions: jest.fn(async () => []),
}));

function snapshotKernel(
  queryAll: SqliteReadTransactionExecutor["queryAll"],
): SqliteSnapshotKernel {
  return {
    queryAll,
    readSnapshot: <Result>(
      query: (transaction: SqliteReadTransactionExecutor) => Promise<Result>,
    ) => query({ queryAll }),
  } as unknown as SqliteSnapshotKernel;
}

describe("progress repository factual source reads", () => {
  it("covers defensive source revision, goal parsing, and active-plan cardinality branches", async () => {
    const row = {
      id: "goal",
      plan_id: "plan",
      revision: 1,
      created_at_ms: 1,
      is_current: 1,
      goal_json: JSON.stringify({
        version: 1,
        id: "goal",
        planId: "plan",
        revision: 1,
        goalDistanceMeters: 10_000,
        targetDurationMs: 660_001,
        targetLocalDate: "2026-12-01",
        trainingDays: ["Monday"],
        createdAtMs: 1,
      }),
    };
    expect(__progressRepositoryTestOnly.dashboardGoalFromRow(row, 0)).toMatchObject({
      targetDurationSeconds: null,
      targetLocalDate: "2026-12-01",
    });
    expect(__progressRepositoryTestOnly.dashboardGoalFromRow({
      ...row,
      goal_json: "{",
    }, 0)).toBeNull();
    const exposure = __progressRepositoryTestOnly.exposureFromRow({
      exercise_id: "bench",
      identity_key: "load_reps:1:1",
      comparator_key: "identity",
      session_id: "session",
      local_date: "2026-11-01",
      set_id: "set",
      set_ordinal: 0,
      completed_at_ms: 1,
      target_json: "{}",
      observation_json: "{}",
    }, new Map([["session\u0000set", {
      exerciseId: "bench",
      exerciseName: "Bench Press",
      sessionId: "session",
      sourceRevision: undefined,
    } as never]]));
    expect(exposure.sourceRevision).toBeNull();
    expect(__progressRepositoryTestOnly.progressRecordFromExposure(exposure))
      .toMatchObject({ sourceRevision: null });
    const { sourceRevision: _sourceRevision, ...withoutSourceRevision } = exposure;
    expect(__progressRepositoryTestOnly.progressRecordFromExposure(withoutSourceRevision))
      .not.toHaveProperty("sourceRevision");

    const executor = {
      queryAll: jest.fn(async () => [{ plan_id: "one" }, { plan_id: "two" }]),
    } as unknown as SqliteReadTransactionExecutor;
    await expect(__progressRepositoryTestOnly.loadRunningTargetSources(executor))
      .rejects.toThrow("progress_running_active_plan_invalid");
  });

  it("requires the source-coherent snapshot kernel", () => {
    expect(() => createProgressRepository({ queryAll: jest.fn() } as never))
      .toThrow("progress_snapshot_kernel_required");
  });

  it("returns source-linked Running, goal, and current bodyweight facts without inventing zeroes", async () => {
    const queryAll = jest.fn(async (sql: string) => {
      if (sql.includes("FROM imported_activities activity")) return [{
        id: "activity-1", started_at_ms: 1_793_491_200_000,
        aggregate_json: JSON.stringify({ confirmed_local_date: "2026-11-01", normalized: { distance_meters: 5_000, duration_ms: 1_500_000 } }),
        opportunity_id: "opportunity-1",
      }];
      if (sql.includes("FROM running_goals")) return [{
        id: "goal-1", plan_id: "plan-1", revision: 1,
        goal_json: JSON.stringify({ version: 1, id: "goal-1", planId: "plan-1", revision: 1, goalDistanceMeters: 5_000, trainingDays: ["Monday"], createdAtMs: 1 }),
      }];
      if (sql.includes("FROM bodyweight_entries entry")) return [{
        id: "bodyweight-1", owner_id: "owner-1", current_revision: 2,
        local_date: "2026-11-01", timezone: "Asia/Singapore", grams: 72_100,
      }];
      return [];
    });
    const kernel = snapshotKernel(
      queryAll as unknown as SqliteReadTransactionExecutor["queryAll"],
    );

    const result = await createProgressRepository(kernel).load({
      period: "4_weeks",
      nowLocalDate: "2026-11-02",
    });

    expect(result).toMatchObject({
      freshness: "current",
      sourceFacts: {
        running: {
          kind: "available",
          activities: [{ id: "activity-1", opportunityId: "opportunity-1", distanceMeters: 5_000, durationMs: 1_500_000 }],
          goals: [{ id: "goal-1", planId: "plan-1" }],
        },
        bodyweight: {
          kind: "available",
          entries: [{ id: "bodyweight-1", grams: 72_100 }],
        },
      },
    });
    expect(queryAll.mock.calls.filter(([sql]) => /INSERT|UPDATE|DELETE/u.test(sql as string))).toHaveLength(0);
  });

  it("fails closed for malformed legacy source/evidence payloads and an exposure without an effective history set", async () => {
    const queryAll = jest.fn(async (sql: string) => {
      if (sql.includes("FROM history_projection_comparable_exposures")) return [{
        exercise_id: "missing-exercise", identity_key: "load_reps:1:1",
        comparator_key: "identity", session_id: "missing-session",
        local_date: "2026-11-01", set_id: "missing-set", set_ordinal: 0,
        completed_at_ms: 1, target_json: "{}", observation_json: "{}",
      }];
      if (sql.includes("FROM imported_activities activity")) return [{
        id: "legacy-malformed", started_at_ms: 1, aggregate_json: "not-json",
        opportunity_id: null,
      }];
      if (sql.includes("FROM running_goals")) return [{
        id: "malformed-goal",
        plan_id: "plan-1",
        revision: 1,
        goal_json: "not-json",
        created_at_ms: 1,
      }];
      if (sql.includes("FROM progression_recommendations recommendation")) return [{
        id: "legacy-malformed-evidence", exercise_id: "exercise", exercise_name: "Exercise",
        status: "pending", evidence_json: JSON.stringify({
          rule: { id: "load_reps.double_progression.v1" },
          revisions: { target: 1 }, reason: "reason", confidence: "high",
        }), current_target_json: "not-json", proposed_target_json: "{}",
        target_id: "target", evidence_version: 2, rule_type: "load_reps",
        rule_version: 1, metric_profile: "load_reps", metric_contract_version: 1,
        exercise_metric_generation: 1, source_revision: 1, target_revision: 1,
        created_at_ms: 1,
      }];
      return [];
    });
    const kernel = snapshotKernel(
      queryAll as unknown as SqliteReadTransactionExecutor["queryAll"],
    );

    await expect(createProgressRepository(kernel).load({
      period: "4_weeks",
      nowLocalDate: "2026-11-02",
    })).rejects.toThrow("progress_effective_exercise_name_unavailable");

    const withoutExposure = jest.fn(async (sql: string) =>
      sql.includes("FROM history_projection_comparable_exposures") ? [] : await queryAll(sql)
    );
    const result = await createProgressRepository(snapshotKernel(
      withoutExposure as unknown as SqliteReadTransactionExecutor["queryAll"],
    )).load({
      period: "4_weeks",
      nowLocalDate: "2026-11-02",
    });
    expect(result.sourceFacts?.running).toMatchObject({
      kind: "unavailable", activityKind: "unavailable", activities: [],
    });
    expect(result.projection?.recommendations).toEqual([]);
  });

  it("does not expose a persisted Running goal whose owner plan differs from its evidence", async () => {
    const queryAll = jest.fn(async (sql: string) => {
      if (sql.includes("FROM running_goals")) return [{
        id: "goal-unbound", plan_id: "plan-owned", revision: 1,
        goal_json: JSON.stringify({
          version: 1,
          id: "goal-unbound",
          planId: "different-plan",
          revision: 1,
          goalDistanceMeters: 5_000,
          trainingDays: ["Monday"],
          createdAtMs: 1,
        }),
      }];
      return [];
    });

    const result = await createProgressRepository(snapshotKernel(
      queryAll as unknown as SqliteReadTransactionExecutor["queryAll"],
    )).load({
      period: "4_weeks",
      nowLocalDate: "2026-11-02",
    });

    expect(result.sourceFacts?.running).toEqual(expect.objectContaining({
      kind: "unavailable",
      goalKind: "unavailable",
      goals: [],
    }));
  });

  it("drops structurally invalid bodyweight source rows", async () => {
    const queryAll = jest.fn(async (sql: string) =>
      sql.includes("FROM bodyweight_entries entry") ? [{
        id: "invalid-bodyweight", owner_id: "owner", current_revision: 1,
        local_date: "2026-11-01", timezone: "Asia/Singapore", grams: 1.5,
      }] : []
    );
    const result = await createProgressRepository(snapshotKernel(
      queryAll as unknown as SqliteReadTransactionExecutor["queryAll"],
    )).load({ period: "all_time", nowLocalDate: "2026-11-02" });
    expect(result.sourceFacts?.bodyweight).toEqual({ kind: "unavailable", entries: [] });
  });

  it("covers null freshness generations and both bounded refresh terminals", async () => {
    let rebuildable = false;
    const queryAll = jest.fn(async (sql: string) => {
      if (sql.includes("FROM history_subject_revisions subject")) return [{
        subject_id: 'history-subject/v1:["period","all"]',
        revision: 1,
        applied_revision: null,
      }];
      if (sql.includes("FROM history_rebuild_effects")) return rebuildable ? [{
        subject_id: 'history-subject/v1:["period","all"]',
      }] : [];
      return [];
    });
    const repository = createProgressRepository(snapshotKernel(
      queryAll as unknown as SqliteReadTransactionExecutor["queryAll"],
    ));
    await expect(repository.load({
      period: "all_time", nowLocalDate: "2026-11-02",
    })).resolves.toMatchObject({ freshness: "unavailable" });
    rebuildable = true;
    await expect(repository.load({
      sport: "Running", period: "all_time", nowLocalDate: "2026-11-02",
    })).resolves.toMatchObject({
      freshness: "updating",
      refresh: { automaticRefresh: { terminal: "updating" } },
    });

    const missingMetricQuery = jest.fn(async (sql: string) => {
      if (sql.includes("WHERE subject_id LIKE")) return [{ subject_id: "metric-subject" }];
      if (sql.includes("FROM history_subject_revisions subject")) return [{
        subject_id: 'history-subject/v1:["period","all"]', revision: 1, applied_revision: 1,
      }];
      return [];
    });
    await expect(createProgressRepository(snapshotKernel(
      missingMetricQuery as unknown as SqliteReadTransactionExecutor["queryAll"],
    )).load({
      sport: "Running", period: "all_time", nowLocalDate: "2026-11-02",
    })).resolves.toMatchObject({
      freshness: "unavailable",
      sport: "Running",
      dashboard: null,
    });
  });
});
