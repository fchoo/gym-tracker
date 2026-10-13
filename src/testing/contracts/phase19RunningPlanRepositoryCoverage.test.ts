import { describe, expect, it, jest } from "@jest/globals";

import { runningLifecycleToken } from "../../domains/running/lifecycle";
import { createRunningPlanRepository } from "../../platform/sqlite/repositories/runningPlanRepository";

const plan = {
  version: 1,
  id: "plan",
  name: "Plan",
  revision: 1,
  active: false,
  lifecycle: "inactive",
  createdAtMs: 1,
  goal: { version: 1, id: "goal", planId: "plan", revision: 1, goalDistanceMeters: 2_400, trainingDays: ["Monday"], createdAtMs: 1 },
  sessions: [],
} as const;

const previewFacts = {
  action: "activate" as const,
  planId: "plan",
  planName: "Plan",
  expectedPlanRevision: 1,
  expectedScheduleRevision: 1,
  lifecycle: "inactive" as const,
  activeWorkout: false,
  activeRunning: null,
};
const preview = { ...previewFacts, confirmationToken: runningLifecycleToken(previewFacts) };

function lifecycleQuery(sql: string, options: Record<string, unknown> = {}) {
  if (sql.includes("FROM plans plan\n       JOIN running_plans")) return options.target === false ? [] : [{
    plan_id: "plan", plan_name: options.name ?? "Plan", plan_revision: 1, plan_active: options.active ? 1 : 0,
    running_status: options.retired ? "retired" : "ready", schedule_id: "schedule", schedule_revision: 1,
  }];
  if (sql.includes("LEFT JOIN owned_plan_schedules")) return options.activePairInvalid ? [{ plan_id: "plan", schedule_id: null }] : [];
  if (sql.includes("plan.plan_kind = 'running' AND plan.is_active = 1")) {
    if (options.multipleActive) return [{}, {}];
    if (options.activeOther) return [{ plan_id: "other", plan_name: "Other", plan_revision: 1, schedule_id: "other-schedule", schedule_revision: 1 }];
    return [];
  }
  if (sql.includes("workout_sessions")) return [{ count: options.workout ? 1 : 0 }];
  if (sql.includes("revision.session_kind = 'recovery'")) return [{ count: options.ready === false ? 0 : 1 }];
  if (sql.includes("running_session_slots WHERE")) return [{ count: options.ready === false ? 0 : 1 }];
  return [];
}

function kernel(
  query: (sql: string) => unknown[],
  execute: (sql: string, parameters?: readonly unknown[]) => Promise<{ changes: number }> = async () => ({ changes: 1 }),
) {
  const transaction = { queryAll: async (sql: string) => query(sql), execute };
  return {
    queryAll: transaction.queryAll,
    readSnapshot: async (operation: (value: unknown) => Promise<unknown>) => operation(transaction),
    write: async (operation: (value: unknown) => Promise<unknown>) => operation(transaction),
  };
}

describe("Phase 19 Running repository defensive coverage", () => {
  it("covers missing aggregate and lifecycle preview guards", async () => {
    const missing = createRunningPlanRepository(kernel(() => [] as unknown[] as never) as never);
    await expect(missing.readAggregate("plan")).resolves.toBeNull();
    await expect(missing.previewLifecycle("plan", "activate")).rejects.toThrow("running_lifecycle_plan_missing");

    const missingGoal = createRunningPlanRepository(kernel((sql) =>
      sql.includes("FROM plans plan JOIN running_plans") ? [{
        id: "plan", name: "Plan", revision: 1, created_at_ms: 1, is_active: 0, status: "ready",
      }] : []) as never);
    await expect(missingGoal.readAggregate("plan")).resolves.toBeNull();

    await expect(createRunningPlanRepository(kernel((sql) => lifecycleQuery(sql, { multipleActive: true })) as never)
      .previewLifecycle("plan", "activate")).rejects.toThrow("running_lifecycle_active_state_invalid");
    await expect(createRunningPlanRepository(kernel((sql) => lifecycleQuery(sql, { ready: false })) as never)
      .previewLifecycle("plan", "activate")).rejects.toThrow("running_lifecycle_action_invalid");
    await expect(createRunningPlanRepository(kernel((sql) => lifecycleQuery(sql, { active: true })) as never)
      .previewLifecycle("plan", "archive")).resolves.toMatchObject({ lifecycle: "active" });
    await expect(createRunningPlanRepository(kernel((sql) => lifecycleQuery(sql)) as never)
      .previewLifecycle("plan", "reactivate")).rejects.toThrow("running_lifecycle_action_invalid");
    const noSnapshot = { queryAll: async (sql: string) => lifecycleQuery(sql) };
    await expect(createRunningPlanRepository(noSnapshot as never).previewLifecycle("plan", "activate"))
      .resolves.toMatchObject({ activeWorkout: false });
    await expect(createRunningPlanRepository(kernel((sql) =>
      sql.includes("workout_sessions") ? [] : lifecycleQuery(sql)) as never)
      .previewLifecycle("plan", "activate")).resolves.toMatchObject({ activeWorkout: false });
  });

  it("covers lifecycle receipt, preview, active-workout, and writer conflicts", async () => {
    const receiptConflict = createRunningPlanRepository(kernel((sql) =>
      sql.includes("running_plan_receipts") ? [{ request_sha256: "other", operation: "activate", result_json: "{}" }] : []) as never);
    await expect(receiptConflict.confirmLifecycle({
      action: "activate", requestId: "request", requestSha256: "hash", confirmationToken: preview.confirmationToken, preview, committedAtMs: 1,
    })).rejects.toThrow("running_lifecycle_receipt_conflict");

    const base = (options: Record<string, unknown> = {}, failSql = "") => createRunningPlanRepository(kernel(
      (sql) => sql.includes("running_plan_receipts") ? [] : lifecycleQuery(sql, options),
      async (sql: string) => ({ changes: failSql !== "" && sql.includes(failSql) ? 0 : 1 }),
    ) as never);
    await expect(base().confirmLifecycle({
      action: "activate", requestId: "request", requestSha256: "hash", confirmationToken: "wrong", preview, committedAtMs: 1,
    })).rejects.toThrow("running_lifecycle_preview_invalid");
    const workoutFacts = { ...previewFacts, activeWorkout: true };
    const workoutPreview = { ...workoutFacts, confirmationToken: runningLifecycleToken(workoutFacts) };
    await expect(base({ workout: true }).confirmLifecycle({
      action: "activate", requestId: "request", requestSha256: "hash", confirmationToken: workoutPreview.confirmationToken, preview: workoutPreview, committedAtMs: 1,
    })).rejects.toThrow("running_lifecycle_active_workout_blocked");
    await expect(base({ name: "Changed" }).confirmLifecycle({
      action: "activate", requestId: "request", requestSha256: "hash", confirmationToken: preview.confirmationToken, preview, committedAtMs: 1,
    })).rejects.toThrow("running_lifecycle_preview_stale");
    await expect(base({}, "UPDATE plans SET is_active = 1").confirmLifecycle({
      action: "activate", requestId: "request", requestSha256: "hash", confirmationToken: preview.confirmationToken, preview, committedAtMs: 1,
    })).rejects.toThrow("running_lifecycle_preview_stale");

    const activeOtherFacts = {
      ...previewFacts,
      activeRunning: { planId: "other", planName: "Other", planRevision: 1, scheduleId: "other-schedule", scheduleRevision: 1 },
    };
    const activeOtherPreview = { ...activeOtherFacts, confirmationToken: runningLifecycleToken(activeOtherFacts) };
    await expect(base({ activeOther: true }, "UPDATE plans SET is_active = 0").confirmLifecycle({
      action: "activate", requestId: "request", requestSha256: "hash", confirmationToken: activeOtherPreview.confirmationToken, preview: activeOtherPreview, committedAtMs: 1,
    })).rejects.toThrow("running_lifecycle_preview_stale");
    await expect(base({ activeOther: true }, "UPDATE owned_plan_schedules SET lifecycle = 'inactive'").confirmLifecycle({
      action: "activate", requestId: "request", requestSha256: "hash", confirmationToken: activeOtherPreview.confirmationToken, preview: activeOtherPreview, committedAtMs: 1,
    })).rejects.toThrow("running_lifecycle_preview_stale");
    await expect(base({ activeOther: true }).confirmLifecycle({
      action: "activate", requestId: "request", requestSha256: "hash", confirmationToken: activeOtherPreview.confirmationToken, preview: activeOtherPreview, committedAtMs: 1,
    })).resolves.toEqual({ planId: "plan", lifecycle: "active" });

    const archiveFacts = { ...previewFacts, action: "archive" as const };
    const archivePreview = { ...archiveFacts, confirmationToken: runningLifecycleToken(archiveFacts) };
    await expect(base({}, "UPDATE plans SET revision = revision + 1").confirmLifecycle({
      action: "archive", requestId: "archive", requestSha256: "hash", confirmationToken: archivePreview.confirmationToken, preview: archivePreview, committedAtMs: 1,
    })).rejects.toThrow("running_lifecycle_preview_stale");
    await expect(base({}, "UPDATE running_plans SET status = 'retired'").confirmLifecycle({
      action: "archive", requestId: "archive", requestSha256: "hash", confirmationToken: archivePreview.confirmationToken, preview: archivePreview, committedAtMs: 1,
    })).rejects.toThrow("running_lifecycle_preview_stale");

    const activeArchiveFacts = { ...archiveFacts, lifecycle: "active" as const };
    const activeArchivePreview = { ...activeArchiveFacts, confirmationToken: runningLifecycleToken(activeArchiveFacts) };
    await expect(base({ active: true }, "UPDATE plans SET is_active = 0").confirmLifecycle({
      action: "archive", requestId: "archive", requestSha256: "hash", confirmationToken: activeArchivePreview.confirmationToken, preview: activeArchivePreview, committedAtMs: 1,
    })).rejects.toThrow("running_lifecycle_preview_stale");

    const reactivateFacts = { ...previewFacts, action: "reactivate" as const, lifecycle: "archived" as const };
    const reactivatePreview = { ...reactivateFacts, confirmationToken: runningLifecycleToken(reactivateFacts) };
    await expect(base({ retired: true }, "UPDATE running_plans SET status = 'ready'").confirmLifecycle({
      action: "reactivate", requestId: "reactivate", requestSha256: "hash", confirmationToken: reactivatePreview.confirmationToken, preview: reactivatePreview, committedAtMs: 1,
    })).rejects.toThrow("running_lifecycle_preview_stale");

    await expect(base({ activePairInvalid: true }).confirmLifecycle({
      action: "activate", requestId: "request", requestSha256: "hash", confirmationToken: preview.confirmationToken, preview, committedAtMs: 1,
    })).rejects.toThrow("running_lifecycle_active_state_invalid");
  });

  it("covers create and source-graph receipt/revision/read-back conflicts", async () => {
    const createExisting = createRunningPlanRepository(kernel((sql) =>
      sql.includes("running_plan_receipts") ? [] : sql.includes("SELECT id FROM plans") ? [{ id: "plan" }] : []) as never);
    await expect(createExisting.createInactiveAggregate({ requestId: "create", requestSha256: "a".repeat(64), plan } as never))
      .rejects.toThrow("running_plan_revision_conflict");
    const createReceiptConflict = createRunningPlanRepository(kernel((sql) =>
      sql.includes("running_plan_receipts") ? [{ request_sha256: "other", result_json: "{}" }] : []) as never);
    await expect(createReceiptConflict.createInactiveAggregate({ requestId: "create", requestSha256: "a".repeat(64), plan } as never))
      .rejects.toThrow("running_plan_receipt_conflict");

    const sourceInput = {
      requestId: "save", requestSha256: "a".repeat(64), operation: "edit" as const,
      planId: "plan", expectedPlanRevision: 1, createdAtMs: 2,
      goal: { ...plan.goal, id: "goal-2", revision: 2, createdAtMs: 2 },
      sessions: [], slots: [], targetCommand: true, expectedGoalRevision: 1,
    };
    const receiptConflict = createRunningPlanRepository(kernel((sql) =>
      sql.includes("running_plan_receipts") ? [{ request_sha256: "other", operation: "edit", plan_id: "plan", expected_plan_revision: 1, result_json: "{}" }] : []) as never);
    await expect(receiptConflict.saveSourceGraph(sourceInput as never)).rejects.toThrow("running_plan_receipt_conflict");

    const missingPlan = createRunningPlanRepository(kernel((sql) =>
      sql.includes("running_plan_receipts") ? [] : []) as never);
    await expect(missingPlan.saveSourceGraph(sourceInput as never)).rejects.toThrow("running_plan_revision_conflict");

    const missingTarget = createRunningPlanRepository(kernel((sql) => {
      if (sql.includes("running_plan_receipts")) return [];
      if (sql.includes("FROM plans plan JOIN running_plans")) return [{ revision: 1, plan_kind: "running", is_active: 0, status: "ready" }];
      if (sql.includes("CAST(json_extract")) return [{ goal_json: JSON.stringify(plan.goal) }];
      return [];
    }) as never);
    await expect(missingTarget.saveSourceGraph(sourceInput as never)).rejects.toThrow("running_target_readback_missing");

    const sessionInput = {
      ...sourceInput,
      targetCommand: false,
      sessions: [{
        version: 1, id: "session-v2", rootId: "session-root", planId: "plan",
        sessionKind: "recovery", revision: 2, createdAtMs: 2,
        phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "duration", durationMs: 60_000 }] }],
        contextual: {},
      }],
    };
    const rootConflict = createRunningPlanRepository(kernel((sql) => {
      if (sql.includes("running_plan_receipts")) return [];
      if (sql.includes("FROM plans plan JOIN running_plans")) return [{ revision: 1, plan_kind: "running", is_active: 0, status: "ready" }];
      if (sql.includes("running_session_roots")) return [{ current_revision: 3, plan_id: "other" }];
      return [];
    }) as never);
    await expect(rootConflict.saveSourceGraph(sessionInput as never))
      .rejects.toThrow("running_session_revision_conflict");

    const currentMissing = createRunningPlanRepository(kernel((sql) => {
      if (sql.includes("running_plan_receipts")) return [];
      if (sql.includes("FROM plans plan JOIN running_plans")) return [{ revision: 1, plan_kind: "running", is_active: 0, status: "ready" }];
      if (sql.includes("running_session_roots")) return [{ current_revision: 2, plan_id: "plan" }];
      return [];
    }) as never);
    await expect(currentMissing.saveSourceGraph(sessionInput as never))
      .rejects.toThrow("running_session_revision_conflict");

    const retired = createRunningPlanRepository(kernel((sql) => {
      if (sql.includes("running_plan_receipts")) return [];
      if (sql.includes("FROM plans plan JOIN running_plans")) return [{ revision: 1, plan_kind: "running", is_active: 0, status: "retired" }];
      return [];
    }) as never);
    await expect(retired.saveSourceGraph({ ...sourceInput, targetCommand: false } as never))
      .resolves.toMatchObject({ planRevision: 2 });
  });
});
