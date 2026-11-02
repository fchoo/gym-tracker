import { describe, expect, it, jest } from "@jest/globals";

import {
  createHistoryRepository,
  loadEffectiveHistoryProjectionSessions,
  metricSetsFromEffectiveSnapshot,
  type EffectiveSnapshot,
} from "../../platform/sqlite/repositories/historyRepository";

const session = {
  id: "session-1",
  source: "manual",
  status: "completed",
  localDate: "2026-08-24",
  timezone: "Asia/Singapore",
  startedAtMs: 1,
  completedAtMs: 2,
  planName: null,
  dayName: null,
};

function snapshot(overrides: Record<string, unknown> = {}): EffectiveSnapshot {
  return {
    version: 1,
    session: { ...session },
    exercises: [],
    ...overrides,
  } as never;
}

function row(snapshotJson: string | null, overrides: Record<string, unknown> = {}) {
  return {
    ...session,
    local_date: session.localDate,
    started_at_ms: session.startedAtMs,
    completed_at_ms: session.completedAtMs,
    creation_timezone_offset_minutes: 480,
    revision: 1,
    plan_name: null,
    day_name: null,
    effective_revision: snapshotJson === null ? null : 2,
    lifecycle: snapshotJson === null ? null : "active",
    snapshot_json: snapshotJson,
    effective_local_date: snapshotJson === null ? null : session.localDate,
    effective_timezone: snapshotJson === null ? null : session.timezone,
    effective_started_at_ms: snapshotJson === null ? null : session.startedAtMs,
    effective_completed_at_ms: snapshotJson === null ? null : session.completedAtMs,
    ...overrides,
  };
}

function projectionExecutor(rows: readonly unknown[], counts: readonly unknown[] = [], metrics: readonly unknown[] = [], scopes: readonly unknown[] = []) {
  return {
    queryAll: jest.fn(async (sql: string) => {
      if (sql.includes("COUNT(DISTINCT")) return counts;
      if (sql.includes("source_plan_working_set_target_id")) return scopes;
      if (sql.includes("FROM workout_sessions session")) return metrics;
      return rows;
    }),
  };
}

describe("Phase 19 history repository defensive coverage", () => {
  it("rejects every malformed effective snapshot envelope before projection", async () => {
    const invalid = [
      "not-json",
      "[]",
      JSON.stringify(snapshot({ version: 2 })),
      JSON.stringify(snapshot({ session: null })),
      JSON.stringify(snapshot({ session: { ...session, id: "other" } })),
      JSON.stringify(snapshot({ session: { ...session, source: "invalid" } })),
      JSON.stringify(snapshot({ session: { ...session, status: "invalid" } })),
      JSON.stringify(snapshot({ session: { ...session, localDate: 1 } })),
      JSON.stringify(snapshot({ session: { ...session, timezone: "" } })),
      JSON.stringify(snapshot({ session: { ...session, startedAtMs: -1 } })),
      JSON.stringify(snapshot({ session: { ...session, completedAtMs: -1 } })),
      JSON.stringify(snapshot({ session: { ...session, completedAtMs: 0 } })),
      JSON.stringify(snapshot({ exercises: null })),
      JSON.stringify(snapshot({ exercises: [null] })),
      JSON.stringify(snapshot({ exercises: [{ status: "completed", sets: null }] })),
      JSON.stringify(snapshot({ exercises: [{ status: "completed", sets: [null] }] })),
      JSON.stringify(snapshot({ exercises: [{ status: "completed", sets: [{ kind: "invalid" }] }] })),
    ];
    for (const value of invalid) {
      await expect(loadEffectiveHistoryProjectionSessions(projectionExecutor([
        row(value),
      ]) as never)).rejects.toThrow("history_effective_snapshot_invalid");
    }
  });

  it("covers effective metric filtering, parsing, and recommendation scopes", async () => {
    expect(metricSetsFromEffectiveSnapshot(snapshot({
      session: { ...session, status: "manual_visit" },
    }))).toEqual([]);
    expect(metricSetsFromEffectiveSnapshot(snapshot({ exercises: [{
      exerciseId: "bench", name: "Bench", status: "completed", sets: [],
    }] }))).toEqual([]);
    expect(() => metricSetsFromEffectiveSnapshot(snapshot({ exercises: [{
      exerciseId: "bench", name: "Bench", status: "completed",
      metricIdentity: { profile: "invalid", contractVersion: 1, exerciseMetricGeneration: 1 },
      sets: [],
    }] }))).toThrow("history_effective_snapshot_invalid");

    const baseSet = {
      id: "set-1", kind: "working", status: "completed", ordinal: 0,
      target: { version: 1, profile: "load_reps", loadGrams: 40_000, minReps: 8, maxReps: 10, incrementGrams: 2_500, perSide: false },
      observation: { version: 1, profile: "load_reps", loadGrams: 40_000, reps: 8, source: "manual" },
      completedAtMs: 2,
      sourcePlanWorkingSetTargetId: "legacy-target",
      sourceOwnedPlanWorkingSetTargetId: "owned-target",
    };
    const exercise = {
      exerciseId: "bench", name: "Bench", status: "completed",
      metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
      sets: [baseSet, { ...baseSet, id: "planned", status: "planned", target: undefined }],
    };
    expect(metricSetsFromEffectiveSnapshot(snapshot({ exercises: [exercise] }))).toHaveLength(1);
    expect(() => metricSetsFromEffectiveSnapshot(snapshot({ exercises: [{ ...exercise, name: "" }] })))
      .toThrow("history_effective_snapshot_invalid");
    expect(() => metricSetsFromEffectiveSnapshot(snapshot({ exercises: [{
      ...exercise, sets: [{ ...baseSet, target: { profile: "invalid" } }],
    }] }))).toThrow("history_effective_snapshot_invalid");

    const projected = await loadEffectiveHistoryProjectionSessions(projectionExecutor([
      row(JSON.stringify(snapshot({ exercises: [exercise] }))),
      row(null, { id: "ignored", status: "in_progress" }),
    ]) as never);
    expect(projected[0]?.recommendationScopes).toEqual(["legacy:legacy-target", "owned:owned-target"]);
    const nonWorking = {
      ...exercise,
      sets: [{ ...baseSet, kind: "warmup" }],
    };
    expect((await loadEffectiveHistoryProjectionSessions(projectionExecutor([
      row(JSON.stringify(snapshot({ exercises: [nonWorking] }))),
    ]) as never))[0]?.recommendationScopes).toEqual([]);
    expect((await loadEffectiveHistoryProjectionSessions(projectionExecutor([
      row(JSON.stringify(snapshot({ exercises: [{ ...exercise, status: "planned", sets: [{
        ...baseSet,
        sourcePlanWorkingSetTargetId: undefined,
        sourceOwnedPlanWorkingSetTargetId: undefined,
      }] }] }))),
    ]) as never))[0]?.recommendationScopes).toEqual([]);
    expect(await loadEffectiveHistoryProjectionSessions(projectionExecutor([
      row(JSON.stringify(snapshot({ session: { ...session, status: "manual_visit" } }))),
    ]) as never)).toEqual([]);
  });

  it("covers raw defaults, invalid freshness IDs, and revision fences", async () => {
    const raw = await loadEffectiveHistoryProjectionSessions(projectionExecutor([
      row(null),
      row(null, { id: "ignored", status: "in_progress" }),
    ]) as never);
    expect(raw[0]).toMatchObject({
      completedExercises: 0,
      plannedExercises: 0,
      completedWorkingSets: 0,
      plannedWorkingSets: 0,
      metricSets: [],
      recommendationScopes: [],
    });

    const fakeKernel = (responses: Record<string, readonly unknown[]>) => ({
      queryAll: jest.fn(),
      readSnapshot: async (operation: (executor: unknown) => Promise<unknown>) => operation({
        queryAll: async (sql: string) => {
          if (sql.includes("history_subject_revisions")) return responses.freshness ?? [];
          if (sql.includes("history_rebuild_effects")) return responses.rebuild ?? [];
          if (sql.includes("bodyweight_entries")) return responses.bodyweight ?? [];
          if (sql.includes("JOIN session_exercises")) return responses.metrics ?? [];
          return responses.rows ?? [];
        },
      }),
    });
    await expect(createHistoryRepository(fakeKernel({
      freshness: [{ subject_id: "malformed", revision: 1, applied_revision: 1 }],
    }) as never).loadExerciseMetricHistory({ exerciseId: "bench" }))
      .resolves.toMatchObject({ freshness: "unavailable" });
    await expect(createHistoryRepository(fakeKernel({
      rows: [row(JSON.stringify(snapshot()), { effective_revision: 0 })],
    }) as never).loadExerciseMetricHistory({ exerciseId: "bench" }))
      .rejects.toThrow("history_source_revision_invalid");
    await expect(createHistoryRepository(fakeKernel({
      metrics: [{ source_revision: 0 }],
    }) as never).loadExerciseMetricHistory({ exerciseId: "bench" }))
      .rejects.toThrow("history_source_revision_invalid");
    const subject = 'history-subject/v1:["exercise_metric","bench","load_reps:1:1","identity"]';
    await expect(createHistoryRepository(fakeKernel({
      freshness: [
        { subject_id: 'history-subject/v1:["exercise_metric","other","load_reps:1:1","identity"]', revision: 1, applied_revision: 1 },
        { subject_id: subject, revision: 2, applied_revision: 1 },
      ],
      rebuild: [{ subject_id: subject }],
    }) as never).loadExerciseMetricHistory({ exerciseId: "bench" }))
      .resolves.toMatchObject({ freshness: "updating" });

    const fixedMetric = {
      session_id: "fixed-session", source_revision: 1, local_date: "2026-08-24",
      session_status: "completed", exercise_id: "bench", exercise_name: "Bench",
      metric_profile: "fixed_distance", metric_contract_version: 1,
      exercise_metric_generation: 1, set_id: "fixed-set", set_kind: "working",
      set_ordinal: 0, set_status: "completed",
      target_json: JSON.stringify({ version: 1, profile: "fixed_distance", plannedDistanceMeters: 2_000 }),
      observed_json: JSON.stringify({ version: 1, profile: "fixed_distance", distanceMeters: 2_000, durationMs: 600_000, source: "manual" }),
      completed_at_ms: 2, planned_working_sets: 1, completed_working_sets: 1,
    };
    await expect(createHistoryRepository(fakeKernel({ metrics: [fixedMetric] }) as never)
      .loadExerciseMetricHistory({ exerciseId: "bench" }))
      .resolves.toMatchObject({ freshness: "current" });
  });

  it("covers public calendar, removed-session, and snapshot failure boundaries", async () => {
    await expect(createHistoryRepository({ queryAll: jest.fn() } as never)
      .loadExerciseMetricHistory({ exerciseId: "bench" }))
      .rejects.toThrow("history_snapshot_kernel_required");

    const kernelFor = (rows: readonly unknown[], opportunities: readonly unknown[] = []) => ({
      queryAll: jest.fn(async (sql: string) => {
        if (sql.includes("owned_plan_schedule_opportunities")) return opportunities;
        if (sql.includes("COUNT(DISTINCT")) return [];
        return rows;
      }),
    });
    await expect(createHistoryRepository(kernelFor([]) as never).loadCalendarMonth({
      month: "2026-08-02", selectedDate: "2026-08-02", today: "2026-08-02",
    })).rejects.toThrow("history_month_must_start_on_first");
    await expect(createHistoryRepository(kernelFor([
      row(null, { status: "in_progress" }),
    ]) as never).loadCalendarMonth({
      month: "2026-08-01", selectedDate: "2026-08-01", today: "2026-08-01",
    })).resolves.toMatchObject({ sessions: [] });
    await expect(createHistoryRepository(kernelFor([
      row(null, { lifecycle: "voided", effective_revision: null }),
    ]) as never).loadCalendarMonth({
      month: "2026-08-01", selectedDate: "2026-08-24", today: "2026-09-01",
    })).resolves.toMatchObject({ sessions: [] });
    await expect(createHistoryRepository(kernelFor([
      row(null, { source: "invalid", status: "completed" }),
    ]) as never).loadCalendarMonth({
      month: "2026-08-01", selectedDate: "2026-08-01", today: "2026-08-01",
    })).rejects.toThrow("history_source_session_invalid");
    await expect(createHistoryRepository(kernelFor([
      row(JSON.stringify(snapshot()), { effective_timezone: "UTC" }),
    ]) as never).loadCalendarMonth({
      month: "2026-08-01", selectedDate: "2026-08-24", today: "2026-08-24",
    })).rejects.toThrow("history_effective_snapshot_mismatch");
    await expect(createHistoryRepository(kernelFor([
      row(null, { status: "in_progress", lifecycle: "voided", removed_at_ms: 10 }),
    ]) as never).listRemovedSessions()).rejects.toThrow("history_removed_session_invalid");

    await expect(createHistoryRepository(kernelFor([
      row(JSON.stringify(snapshot()), {
        lifecycle: "voided", effective_revision: null, removed_at_ms: 10,
      }),
    ]) as never).listRemovedSessions()).resolves.toMatchObject([{ effectiveRevision: 1 }]);
    await expect(createHistoryRepository(kernelFor([
      row(JSON.stringify(snapshot()), { effective_local_date: null }),
    ]) as never).loadCalendarMonth({
      month: "2026-08-01", selectedDate: "2026-08-24", today: "2026-08-24",
    })).rejects.toThrow();
    await expect(createHistoryRepository(kernelFor([
      row(JSON.stringify(snapshot()), { lifecycle: null, effective_revision: null }),
    ]) as never).loadCalendarMonth({
      month: "2026-08-01", selectedDate: "2026-08-24", today: "2026-09-01",
    })).resolves.toMatchObject({ sessions: [{ effective: { lifecycle: "active", revision: 1 } }] });

    const calendar = await createHistoryRepository(kernelFor([
      row(null, { id: "z-session", local_date: "2026-08-20" }),
      row(null, { id: "a-session", local_date: "2026-08-20" }),
      row(null, { id: "other-date", local_date: "2026-08-21" }),
    ], [{ local_date: "2026-08-22" }]) as never).loadCalendarMonth({
      month: "2026-08-01", selectedDate: "2026-08-20", today: "2026-08-22",
    });
    expect(calendar.sessions.map(({ id }) => id)).toEqual(["a-session", "z-session"]);
    expect(calendar.days.map(({ localDate }) => localDate)).toEqual([
      "2026-08-20", "2026-08-21", "2026-08-22",
    ]);
    await expect(createHistoryRepository(kernelFor([]) as never).loadCalendarMonth({
      month: "2026-12-01", selectedDate: "2026-12-01", today: "2027-01-01",
    })).resolves.toMatchObject({ month: "2026-12-01" });

    const otherExerciseSnapshot = snapshot({ exercises: [{
      exerciseId: "other", name: "Other", status: "completed",
      metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
      sets: [{
        id: "other-set", kind: "working", status: "completed", ordinal: 0,
        target: { version: 1, profile: "load_reps", loadGrams: 40_000, minReps: 8, maxReps: 10, incrementGrams: 2_500, perSide: false },
        observation: { version: 1, profile: "load_reps", loadGrams: 40_000, reps: 8, source: "manual" },
        completedAtMs: 2,
      }],
    }] });
    const overlayKernel = {
      queryAll: jest.fn(),
      readSnapshot: async (operation: (executor: unknown) => Promise<unknown>) => operation({
        queryAll: async (sql: string) => sql.includes("FROM workout_sessions ws")
          ? [row(JSON.stringify(otherExerciseSnapshot))] : [],
      }),
    };
    await expect(createHistoryRepository(overlayKernel as never)
      .loadExerciseMetricHistory({ exerciseId: "bench" }))
      .resolves.toMatchObject({ segments: [] });
  });
});
