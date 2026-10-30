import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../domains/progression/recommendationCommands", () => {
  const actual = jest.requireActual<typeof import("../../domains/progression/recommendationCommands")>(
    "../../domains/progression/recommendationCommands",
  );
  return {
    ...actual,
    validateRecommendationDecisionInput: () => undefined,
  };
});

import {
  canonicalRecommendationDecisionRequest,
  type RecommendationDecisionResult,
} from "../../domains/progression/recommendationCommands";
import { runtimeSha256 } from "../../platform/crypto/runtimeSha256";
import {
  createWorkoutOutcomeRepository,
  workoutOutcomeRepositoryInternalContract as internal,
} from "../../platform/sqlite/repositories/workoutOutcomeRepository";

const recommendation = {
  id: "recommendation",
  exercise_id: "exercise",
  target_id: "target",
  metric_profile: "load_reps",
  metric_contract_version: 1,
  exercise_metric_generation: 1,
  proposed_target_json: JSON.stringify({
    version: 1,
    profile: "load_reps",
    loadGrams: 62_500,
    minReps: 6,
    maxReps: 8,
    targetReps: [8],
    incrementGrams: 2_500,
    perSide: false,
  }),
  evidence_version: 2,
  evidence_json: "{}",
  rule_type: "load_reps",
  rule_version: 1,
  status: "pending",
  source_revision: 1,
  target_revision: 1,
  created_at_ms: 1,
};

const metricCases = [
  {
    profile: "load_reps", contractVersion: 1, generation: 1,
    target: { version: 1, profile: "load_reps", loadGrams: 60_000, minReps: 6, maxReps: 8, targetReps: [8], incrementGrams: 2_500, perSide: false },
    observation: { version: 1, profile: "load_reps", loadGrams: 60_000, reps: 8, source: "manual" },
    value: "60 kg × 8",
  },
  {
    profile: "bodyweight_reps", contractVersion: 1, generation: 2,
    target: { version: 1, profile: "bodyweight_reps", minReps: 1, maxReps: 20, variationId: "standard", perSide: false },
    observation: { version: 1, profile: "bodyweight_reps", reps: 12, source: "plan_default" },
    value: "Bodyweight × 12",
  },
  {
    profile: "added_load_reps", contractVersion: 1, generation: 1,
    target: { version: 1, profile: "added_load_reps", addedLoadGrams: 10_000, minReps: 1, maxReps: 12, incrementGrams: 1, perSide: false },
    observation: { version: 1, profile: "added_load_reps", addedLoadGrams: 10_000, reps: 8, source: "recommended" },
    value: "BW + 10 kg × 8",
  },
  {
    profile: "assisted_reps", contractVersion: 1, generation: 1,
    target: { version: 1, profile: "assisted_reps", assistanceGrams: 20_500, minReps: 1, maxReps: 10, decrementGrams: 1, assistanceEquipmentId: "machine", perSide: false },
    observation: { version: 1, profile: "assisted_reps", assistanceGrams: 20_500, reps: 8, source: "last_workout" },
    value: "20.5 kg assist × 8",
  },
  {
    profile: "timed_hold", contractVersion: 1, generation: 1,
    target: { version: 1, profile: "timed_hold", durationSeconds: 45, perSide: true },
    observation: { version: 1, profile: "timed_hold", durationSeconds: 43, source: "manual" },
    value: "43 sec",
  },
  {
    profile: "timed_hold", contractVersion: 2, generation: 2,
    target: { version: 2, profile: "timed_hold", durationMs: 45_500, perSide: false },
    observation: { version: 2, profile: "timed_hold", durationMs: 45_250, source: "manual" },
    value: "45.25 sec",
  },
  {
    profile: "fixed_distance", contractVersion: 1, generation: 1,
    target: { version: 1, profile: "fixed_distance", plannedDistanceMeters: 2_000 },
    observation: { version: 1, profile: "fixed_distance", distanceMeters: 2_000, durationMs: 720_000, source: "manual" },
    value: "2000 m in 720 sec",
  },
  {
    profile: "fixed_time", contractVersion: 1, generation: 1,
    target: { version: 1, profile: "fixed_time", plannedDurationMs: 720_000 },
    observation: { version: 1, profile: "fixed_time", durationMs: 720_000, distanceMeters: 2_400, source: "manual" },
    value: "2400 m in 720 sec",
  },
  {
    profile: "intervals", contractVersion: 1, generation: 1,
    target: { version: 1, profile: "intervals", protocolId: "bike", comparatorId: "rounds_then_work", comparatorVersion: 1, plannedRounds: 6, workIntervalMs: 30_000, restIntervalMs: 30_000 },
    observation: { version: 1, profile: "intervals", protocolId: "bike", completedRounds: 6, completedWorkMs: 180_000, source: "manual" },
    value: "6 rounds · 180 sec work",
  },
  {
    profile: "unscored", contractVersion: 1, generation: 1,
    target: { version: 1, profile: "unscored", completionRequired: true },
    observation: { version: 1, profile: "unscored", completed: true, source: "manual" },
    value: "Completed",
  },
  {
    profile: "unscored", contractVersion: 1, generation: 1,
    target: { version: 1, profile: "unscored", completionRequired: true },
    observation: { version: 1, profile: "unscored", completed: false, source: "manual" },
    value: "Not completed",
  },
] as const;

function repositoryFor(
  queryAll: (sql: string) => readonly Record<string, unknown>[],
  execute = jest.fn(async () => ({ changes: 1 })),
) {
  const transaction = {
    queryAll: async (sql: string) => queryAll(sql),
    execute,
  };
  return {
    execute,
    repository: createWorkoutOutcomeRepository({
      write: async (operation: (value: unknown) => Promise<unknown>) => operation(transaction),
    } as never),
  };
}

describe("Phase 19 workout outcome receipt coverage", () => {
  it("projects every metric profile, source label, progress state, and previous-observation path", async () => {
    const exercises = metricCases.map((entry, index) => ({
      id: `session-exercise-${index}`,
      exercise_id: `exercise-${index}`,
      exercise_name: `Exercise ${index}`,
      metric_profile: entry.profile,
      metric_contract_version: entry.contractVersion,
      exercise_metric_generation: entry.generation,
      ordinal: index,
      status: index === metricCases.length - 1 ? "skipped" : "completed",
      effort: null,
      revision: 1,
    }));
    const sets = metricCases.flatMap((entry, index) => [
      {
        id: `warmup-${index}`,
        session_exercise_id: `session-exercise-${index}`,
        set_kind: "warmup",
        ordinal: 0,
        status: "planned",
        target_json: JSON.stringify(entry.target),
        metric_profile: entry.profile,
        metric_contract_version: entry.contractVersion,
        exercise_metric_generation: entry.generation,
        observed_load_grams: null,
        observed_reps: null,
        observed_json: null,
        completed_at_ms: null,
        source_plan_working_set_target_id: null,
        source_owned_plan_working_set_target_id: null,
        rule_type: entry.profile,
        rule_version: 1,
      },
      {
        id: `working-${index}`,
        session_exercise_id: `session-exercise-${index}`,
        set_kind: "working",
        ordinal: 0,
        status: index === metricCases.length - 1 ? "skipped" : "completed",
        target_json: JSON.stringify(entry.target),
        metric_profile: entry.profile,
        metric_contract_version: entry.contractVersion,
        exercise_metric_generation: entry.generation,
        observed_load_grams: entry.profile === "load_reps" ? 60_000 : null,
        observed_reps: "reps" in entry.observation ? entry.observation.reps : null,
        observed_json: JSON.stringify(entry.observation),
        completed_at_ms: 2,
        source_plan_working_set_target_id: null,
        source_owned_plan_working_set_target_id: null,
        rule_type: entry.profile,
        rule_version: 1,
      },
    ]);
    let source = "scheduled_day";
    let status = "completed";
    let completedAtMs: number | null = 4_000;
    const queryAll = async (sql: string) => {
      if (sql.includes("PRAGMA table_info(session_exercises)")) {
        return [{ name: "metric_contract_version" }, { name: "exercise_metric_generation" }];
      }
      if (sql.includes("PRAGMA table_info(session_sets)")) {
        return [{ name: "source_owned_plan_working_set_target_id" }];
      }
      if (sql.includes("sqlite_master") && sql.includes("owned_progression_recommendations")) return [{ count: 1 }];
      if (sql.includes("SELECT ws.id")) return [{
        id: "session", source, status, plan_id: "plan", plan_day_id: "day",
        local_date: "2026-10-13", timezone: "Asia/Singapore", started_at_ms: 1_000,
        completed_at_ms: completedAtMs, revision: 7, modified_from_plan: 1,
        plan_name: "Plan", day_name: "Day", effective_revision: null,
        lifecycle: null, snapshot_json: null,
      }];
      if (sql.includes("FROM session_exercises")) return exercises;
      if (sql.includes("FROM session_sets ss")) return sets;
      if (sql.includes("FROM workout_sessions prior_session")) {
        return [{ observed_json: JSON.stringify(metricCases[0].observation) }];
      }
      return [];
    };
    const repository = createWorkoutOutcomeRepository({ queryAll } as never);
    const detail = await repository.getSessionDetail("session");
    expect(detail.exercises.map(({ workingSets }) => workingSets[0]?.value))
      .toEqual(metricCases.map(({ value }) => value));
    expect(detail.exercises[0]?.workingSets[0]?.previousObservation).toEqual(metricCases[0].observation);
    expect(detail.sourceLabel).toBe("Planned day");
    expect(detail.durationMs).toBe(3_000);
    expect(detail.exerciseProgress.percent).toBe(91);
    expect(detail.workingSetProgress.percent).toBe(91);
    expect(detail.modifiedFromPlan).toBe(true);

    for (const [nextSource, expected] of [
      ["alternate_day", "Alternate plan day"],
      ["rest_day", "Trained on rest day"],
      ["empty", "Empty workout"],
      ["manual", "Manual visit"],
    ] as const) {
      source = nextSource;
      expect((await repository.getSessionDetail("session")).sourceLabel).toBe(expected);
    }
    status = "in_progress";
    completedAtMs = null;
    const inProgress = await repository.getSessionDetail("session");
    expect(inProgress.durationMs).toBeNull();
    expect(inProgress.resumable).toBe(true);
  });

  it("fails malformed metric identities, targets, and observations without manufacturing detail", async () => {
    const baseExercise = {
      id: "session-exercise", exercise_id: "exercise", exercise_name: "Exercise",
      metric_profile: "load_reps", metric_contract_version: 1,
      exercise_metric_generation: 1, ordinal: 0, status: "completed",
      effort: null, revision: 1,
    };
    const baseSet = {
      id: "set", session_exercise_id: "session-exercise", set_kind: "working",
      ordinal: 0, status: "completed", target_json: JSON.stringify(metricCases[0].target),
      metric_profile: "load_reps", metric_contract_version: 1,
      exercise_metric_generation: 1, observed_load_grams: 60_000, observed_reps: 8,
      observed_json: JSON.stringify(metricCases[0].observation), completed_at_ms: 2,
      source_plan_working_set_target_id: null, source_owned_plan_working_set_target_id: null,
      rule_type: "load_reps", rule_version: 1,
    };
    const session = {
      id: "session", source: "manual", status: "completed", plan_id: null,
      plan_day_id: null, local_date: "2026-10-13", timezone: "Asia/Singapore",
      started_at_ms: 1, completed_at_ms: 2, revision: 1, modified_from_plan: 0,
      plan_name: null, day_name: null, effective_revision: null, lifecycle: null,
      snapshot_json: null,
    };
    const repositoryForRows = (exercise: Record<string, unknown>, set: Record<string, unknown>, completeIdentity = true) => createWorkoutOutcomeRepository({
      queryAll: async (sql: string) => {
        if (sql.includes("PRAGMA table_info(session_exercises)")) return completeIdentity ? [{ name: "metric_contract_version" }, { name: "exercise_metric_generation" }] : [];
        if (sql.includes("PRAGMA table_info(session_sets)")) return [];
        if (sql.includes("SELECT ws.id")) return [session];
        if (sql.includes("FROM session_exercises")) return [exercise];
        if (sql.includes("FROM session_sets ss")) return [set];
        return [];
      },
    } as never);
    await expect(repositoryForRows(baseExercise, { ...baseSet, metric_profile: "timed_hold" }).getSessionDetail("session"))
      .rejects.toThrow("session_detail_metric_identity_mismatch");
    await expect(repositoryForRows(baseExercise, { ...baseSet, target_json: "{" }).getSessionDetail("session"))
      .rejects.toThrow("session_detail_target_invalid");
    await expect(repositoryForRows(baseExercise, { ...baseSet, observed_json: "{" }).getSessionDetail("session"))
      .rejects.toThrow("session_detail_observation_invalid");

    const legacyLoad = await repositoryForRows(baseExercise, {
      ...baseSet, target_json: "{}", metric_profile: undefined,
      metric_contract_version: undefined, exercise_metric_generation: undefined,
      observed_json: JSON.stringify({ loadGrams: 60_000, reps: 8 }),
    }, false).getSessionDetail("session");
    expect(legacyLoad.exercises[0]?.workingSets[0]?.value).toBe("60 kg × 8");
    const timedExercise = { ...baseExercise, metric_profile: "timed_hold" };
    const legacyTimed = await repositoryForRows(timedExercise, {
      ...baseSet, target_json: "{}", metric_profile: undefined,
      metric_contract_version: undefined, exercise_metric_generation: undefined,
      observed_json: JSON.stringify({ durationSeconds: 30 }),
    }, false).getSessionDetail("session");
    expect(legacyTimed.exercises[0]?.workingSets[0]?.value).toBe("30 sec");
    const absent = await repositoryForRows(baseExercise, {
      ...baseSet, metric_profile: undefined, metric_contract_version: undefined,
      exercise_metric_generation: undefined, observed_json: JSON.stringify({ nope: true }),
    }, false).getSessionDetail("session");
    expect(absent.exercises[0]?.workingSets[0]?.observation).toBeNull();
    await expect(repositoryForRows(baseExercise, {
      ...baseSet, metric_profile: undefined, metric_contract_version: undefined,
      exercise_metric_generation: undefined, observed_json: "{",
    }, false).getSessionDetail("session")).rejects.toThrow("session_detail_observation_invalid");
  });

  it("covers the internal graph, receipt, identity, and scalar behavior contracts", async () => {
    const queryExecutor = (rows: readonly Record<string, unknown>[]) => ({
      queryAll: jest.fn(async () => rows),
    });
    await expect(internal.supportsOwnedRecommendations(queryExecutor([]) as never)).resolves.toBe(false);
    const missingTable = {
      queryAll: jest.fn(async (sql: string) => sql.includes("PRAGMA")
        ? [{ name: "source_owned_plan_working_set_target_id" }]
        : []),
    };
    await expect(internal.supportsOwnedRecommendations(missingTable as never)).resolves.toBe(false);
    const ownedSupport = {
      queryAll: jest.fn(async (sql: string) => sql.includes("PRAGMA")
        ? [{ name: "source_owned_plan_working_set_target_id" }]
        : [{ count: 1 }]),
    };
    await expect(internal.supportsOwnedRecommendations(ownedSupport as never)).resolves.toBe(true);
    await expect(internal.sessionRows({ queryAll: async () => [] } as never, "missing"))
      .rejects.toThrow("workout_session_not_found");

    const bareSet = {
      source_plan_working_set_target_id: null,
      source_owned_plan_working_set_target_id: null,
    };
    expect(internal.targetReference(bareSet as never)).toBeNull();
    expect(internal.targetReference({ ...bareSet, source_plan_working_set_target_id: "legacy" } as never))
      .toEqual({ graph: "legacy", id: "legacy" });
    expect(internal.targetReference({ ...bareSet, source_owned_plan_working_set_target_id: "owned" } as never))
      .toEqual({ graph: "owned", id: "owned" });
    expect(internal.uniqueTargetReferences([
      { ...bareSet, source_plan_working_set_target_id: "legacy" },
      { ...bareSet, source_plan_working_set_target_id: "legacy" },
      { ...bareSet, source_owned_plan_working_set_target_id: "owned" },
    ] as never)).toEqual([
      { graph: "legacy", id: "legacy" },
      { graph: "owned", id: "owned" },
    ]);
    expect(internal.targetTable("legacy")).toBe("plan_working_set_targets");
    expect(internal.targetTable("owned")).toBe("owned_plan_working_set_targets");
    expect(internal.recommendationTable("legacy")).toBe("progression_recommendations");
    expect(internal.recommendationTable("owned")).toBe("owned_progression_recommendations");
    expect(internal.recommendationTargetColumn("legacy")).toBe("plan_working_set_target_id");
    expect(internal.recommendationTargetColumn("owned")).toBe("owned_plan_working_set_target_id");

    const scopeExecutor = { queryAll: jest.fn(async (_sql: string) => [{ id: "target" }]) };
    await internal.recommendationTargetScope(scopeExecutor as never, "owned", "target");
    await internal.recommendationTargetScope(scopeExecutor as never, "legacy", "target");
    expect(scopeExecutor.queryAll.mock.calls[0]?.[0]).toContain("owned_plan_working_set_targets");
    expect(scopeExecutor.queryAll.mock.calls[1]?.[0]).toContain("plan_working_set_targets");

    const noOwnedPending = {
      queryAll: jest.fn(async (sql: string) => sql.includes("PRAGMA") ? [] : []),
    };
    await expect(internal.pendingRecommendation(noOwnedPending as never, "missing")).resolves.toBeNull();
    const ownedPending = {
      queryAll: jest.fn(async (sql: string) => {
        if (sql.includes("FROM progression_recommendations")) return [];
        if (sql.includes("PRAGMA")) return [{ name: "source_owned_plan_working_set_target_id" }];
        if (sql.includes("sqlite_master")) return [{ count: 1 }];
        if (sql.includes("FROM owned_progression_recommendations")) return [recommendation];
        return [];
      }),
    };
    await expect(internal.pendingRecommendation(ownedPending as never, recommendation.id))
      .resolves.toMatchObject({ target_graph: "owned" });

    const receiptSupportMissing = queryExecutor([]);
    await expect(internal.supportsRecommendationDecisionReceipts(receiptSupportMissing as never)).resolves.toBe(false);
    await expect(internal.supportsRecommendationDecisionReceipts(queryExecutor([{ count: 2 }]) as never)).resolves.toBe(true);
    const ownedReceipt = {
      request_id: "request", request_sha256: "a".repeat(64), recommendation_id: "recommendation",
      decision: "use_target", result_json: JSON.stringify({ recommendationId: "recommendation", status: "accepted" }),
    };
    const oneReceipt = {
      queryAll: jest.fn(async (sql: string) => sql.includes("owned_progression") ? [ownedReceipt] : []),
    };
    await expect(internal.readRecommendationDecisionReceipt(oneReceipt as never, "request"))
      .resolves.toEqual(ownedReceipt);
    await expect(internal.readRecommendationDecisionReceiptByRecommendation(oneReceipt as never, "recommendation"))
      .resolves.toEqual(ownedReceipt);
    for (const status of ["accepted", "rejected", "superseded"] as const) {
      expect(internal.resultFromReceipt(JSON.stringify({ recommendationId: "recommendation", status })))
        .toEqual({ recommendationId: "recommendation", status: "already_committed" });
    }
    expect(internal.percentage(0, 0)).toEqual({ completed: 0, planned: 0, percent: null });
    expect(internal.percentage(1, 3)).toEqual({ completed: 1, planned: 3, percent: 33 });
    expect(internal.formatKilograms(20_500)).toBe("20.5 kg");
    expect(internal.formatKilograms(20_000)).toBe("20 kg");
    expect(internal.formatDurationMs(1_500)).toBe("1.5 sec");
    expect(internal.integerArray([1, 2.5, "3", 4])).toEqual([1, 4]);
    expect(internal.integerArray(null)).toEqual([]);
    expect(internal.recommendationStatus([{ status: "accepted" }] as never)).toBe("accepted");
    expect(internal.recommendationStatus([{ status: "rejected" }] as never)).toBe("kept_current");
    expect(internal.recommendationStatus([{ status: "pending" }] as never)).toBe("pending");
    expect(internal.recommendationStatus([])).toBe("none");
    expect(internal.lifecycleAuditId("session", 2, "active")).toBe("history-audit:session:2:active");
    expect(internal.sourceSnapshotAuditId("session", 2)).toBe("history-audit:session:2:source-snapshot");
    expect(internal.terminalizationAuditId("session", 2)).toBe("history-audit:session:2:terminalized");
    expect(internal.parseTarget("{}")) .toEqual({});
    expect(() => internal.parseTarget("null")).toThrow("progression_target_invalid");
    expect(internal.parsePolicyRule("{}")) .toEqual({});
    expect(internal.parsePolicyRule("[]")).toBeNull();
    expect(internal.parsePolicyRule("{")).toBeNull();

    const voidedPartialExecutor = {
      queryAll: jest.fn(async (sql: string) => {
        if (sql.includes("PRAGMA")) return [];
        if (sql.includes("SELECT ws.id")) return [{
          id: "partial", source: "manual", status: "partial", plan_id: null, plan_day_id: null,
          local_date: "2026-10-13", timezone: "Asia/Singapore", started_at_ms: 1,
          completed_at_ms: 2, revision: 1, modified_from_plan: 0, plan_name: null, day_name: null,
          effective_revision: 2, lifecycle: "voided", snapshot_json: null,
        }];
        return [];
      }),
    };
    await expect(internal.loadSessionDetail(voidedPartialExecutor as never, "partial"))
      .resolves.toMatchObject({ status: "partial", corrected: true });
  });

  it("covers policy lineage and corrected-snapshot behavior without creating mutation authority", async () => {
    const timedIdentity = { profile: "timed_hold", contractVersion: 1, exerciseMetricGeneration: 1 } as const;
    const timedTarget = { version: 1, profile: "timed_hold", durationSeconds: 45, perSide: false } as const;
    const timedObservation = { version: 1, profile: "timed_hold", durationSeconds: 45, source: "manual" } as const;
    const timedSet = {
      id: "set", session_exercise_id: "session-exercise", set_kind: "working", ordinal: 0,
      status: "completed", target_json: JSON.stringify(timedTarget), metric_profile: "timed_hold",
      metric_contract_version: 1, exercise_metric_generation: 1, observed_load_grams: null,
      observed_reps: null, observed_json: JSON.stringify(timedObservation), completed_at_ms: 2,
      source_plan_working_set_target_id: "legacy-target", source_owned_plan_working_set_target_id: null,
      rule_type: "manual_hold", rule_version: 1,
    };
    const policy = {
      policy_kind: "manual_hold", policy_id: "timed_hold.v1", policy_version: 1,
      rule_json: JSON.stringify({ kind: "manual_hold", id: "timed_hold.v1", version: 1 }),
      metric_profile: "timed_hold", metric_contract_version: 1, exercise_metric_generation: 1,
    };
    expect(internal.rawMetricIdentity(timedSet as never)).toEqual(timedIdentity);
    expect(internal.rawMetricIdentity({ ...timedSet, metric_profile: undefined } as never)).toBeNull();
    expect(internal.rawMetricIdentity({ ...timedSet, metric_contract_version: 0 } as never)).toBeNull();
    expect(internal.expectedRawRuleType(policy as never)).toBe("manual_hold");
    expect(internal.expectedRawRuleType({ ...policy, policy_kind: "plan_authored" } as never)).toBe("timed_hold");
    expect(internal.policyIdentityKey(policy as never)).toContain("timed_hold.v1");
    expect(internal.sameMetricIdentity(timedIdentity, timedIdentity)).toBe(true);
    expect(internal.sameMetricIdentity(timedIdentity, { ...timedIdentity, exerciseMetricGeneration: 2 })).toBe(false);
    expect(internal.sameTarget(timedTarget, timedTarget)).toBe(true);
    expect(internal.sameTarget(timedTarget, { ...timedTarget, durationSeconds: 30 })).toBe(false);
    expect(internal.policyMatchesRawSet(timedSet as never, timedIdentity, policy as never)).toBe(true);
    expect(internal.policyMatchesRawSet({ ...timedSet, rule_version: 2 } as never, timedIdentity, policy as never)).toBe(false);

    expect(internal.completeRawWorkingSets([], timedIdentity)).toBeNull();
    expect(internal.completeRawWorkingSets([timedSet] as never, timedIdentity))
      .toEqual([{ row: timedSet, observation: timedObservation }]);
    expect(internal.completeRawWorkingSets([{ ...timedSet, observed_json: null }] as never, timedIdentity)).toBeNull();
    expect(internal.completeRawWorkingSets([{ ...timedSet, observed_json: "{" }] as never, timedIdentity)).toBeNull();
    const emptyExecutor = { queryAll: jest.fn(async () => []) };
    await expect(internal.policyForRawSet(emptyExecutor as never, { ...timedSet, source_plan_working_set_target_id: null } as never, timedIdentity))
      .resolves.toBeNull();
    await expect(internal.nonLoadOutcomeFromCompletedSets(emptyExecutor as never, {
      sessionId: "session", sessionExerciseId: "exercise", exerciseId: "exercise",
      exerciseName: "Exercise", identity: timedIdentity, effectiveRevision: 1, completed: [],
    })).resolves.toBeNull();

    let policyRead = 0;
    const mixedPolicyExecutor = {
      queryAll: jest.fn(async () => {
        policyRead += 1;
        return policyRead === 1 ? [{
          policy_type: "manual_hold", policy_version: 1, rule_json: policy.rule_json,
          metric_profile: "timed_hold", metric_contract_version: 1, exercise_metric_generation: 1,
        }] : [{
          policy_type: "timed_hold", policy_version: 1,
          rule_json: JSON.stringify({ kind: "plan_authored", id: "timed_hold.plan.v1", version: 1 }),
          metric_profile: "timed_hold", metric_contract_version: 1, exercise_metric_generation: 1,
        }];
      }),
    };
    await expect(internal.nonLoadOutcomeFromCompletedSets(mixedPolicyExecutor as never, {
      sessionId: "session", sessionExerciseId: "exercise", exerciseId: "exercise", exerciseName: "Exercise",
      identity: timedIdentity, effectiveRevision: 1, completed: [
        { row: timedSet as never, target: timedTarget, observation: timedObservation },
        { row: { ...timedSet, id: "set-2", rule_type: "timed_hold" } as never, target: timedTarget, observation: timedObservation },
      ],
    })).resolves.toBeNull();
    await expect(internal.nonLoadOutcomeFromCompletedSets({ queryAll: async () => [{
      policy_type: "manual_hold", policy_version: 1, rule_json: policy.rule_json,
      metric_profile: "timed_hold", metric_contract_version: 1, exercise_metric_generation: 1,
    }] } as never, {
      sessionId: "session", sessionExerciseId: "exercise", exerciseId: "exercise", exerciseName: "Exercise",
      identity: timedIdentity, effectiveRevision: 1, completed: [
        { row: timedSet as never, target: timedTarget, observation: timedObservation },
        { row: { ...timedSet, id: "set-2" } as never, target: { ...timedTarget, durationSeconds: 30 }, observation: timedObservation },
      ],
    })).resolves.toBeNull();

    const legacyPolicyExecutor = {
      queryAll: jest.fn(async () => [{
        policy_type: "manual_hold", policy_version: 1,
        rule_json: policy.rule_json, metric_profile: "timed_hold",
        metric_contract_version: 1, exercise_metric_generation: 1,
      }]),
    };
    await expect(internal.copiedLegacyPolicy(legacyPolicyExecutor as never, "target")).resolves.toEqual(policy);
    await expect(internal.copiedLegacyPolicy({ queryAll: async () => [{
      policy_type: "fixed_distance", policy_version: 1,
      rule_json: JSON.stringify({ kind: "plan_authored", id: "fixed_distance.plan_authored.v1", version: 1 }),
      metric_profile: "fixed_distance", metric_contract_version: 1, exercise_metric_generation: 1,
    }] } as never, "target")).resolves.toMatchObject({ policy_kind: "plan_authored" });
    await expect(internal.policyForReference(legacyPolicyExecutor as never, { graph: "legacy", id: "target" }))
      .resolves.toEqual(policy);
    const ownedPolicyExecutor = { queryAll: jest.fn(async () => [policy]) };
    await expect(internal.copiedOwnedPolicy(ownedPolicyExecutor as never, "target")).resolves.toEqual(policy);
    await expect(internal.policyForReference(ownedPolicyExecutor as never, { graph: "owned", id: "target" }))
      .resolves.toEqual(policy);
    await expect(internal.copiedOwnedPolicy(emptyExecutor as never, "target")).resolves.toBeNull();
    await expect(internal.copiedLegacyPolicy(emptyExecutor as never, "target")).resolves.toBeNull();
    const nonLoadInput = (nextPolicy: Record<string, unknown>) => ({
      exerciseId: "exercise", exerciseName: "Exercise", identity: timedIdentity,
      policy: nextPolicy as never, target: timedTarget, sourceFacts: [timedObservation],
      source: { sessionId: "session", sessionExerciseId: "exercise", setIds: ["set"], effectiveRevision: 1 },
    });
    expect(internal.nonLoadOutcome(nonLoadInput({ ...policy, policy_kind: "automatic" }))).toBeNull();
    expect(internal.nonLoadOutcome(nonLoadInput({ ...policy, rule_json: "{" }))).toBeNull();
    expect(internal.nonLoadOutcome(nonLoadInput({ ...policy, rule_json: JSON.stringify({ kind: "manual_hold", id: "", version: 1 }) })))
      .toMatchObject({ review: { actionable: false } });
    expect(internal.nonLoadOutcome(nonLoadInput({ ...policy, rule_json: JSON.stringify({ kind: "manual_hold", id: "x", version: 2 }) })))
      .toMatchObject({ review: { actionable: false } });
    expect(internal.nonLoadOutcome({
      exerciseId: "exercise", exerciseName: "Exercise", identity: timedIdentity,
      policy: policy as never, target: timedTarget, sourceFacts: [timedObservation],
      source: { sessionId: "session", sessionExerciseId: "exercise", setIds: ["set-b", "set-a"], effectiveRevision: 1 },
    })).toMatchObject({ profile: "timed_hold", source: { setIds: ["set-a", "set-b"] } });

    const snapshotSet = {
      id: "set", kind: "working", ordinal: 0, status: "completed",
      target: timedTarget, observation: timedObservation, completedAtMs: 2,
      sourcePlanWorkingSetTargetId: "legacy-target",
    };
    expect(internal.snapshotTargetReference(snapshotSet as never)).toEqual({ graph: "legacy", id: "legacy-target" });
    expect(internal.snapshotTargetReference({ ...snapshotSet, sourcePlanWorkingSetTargetId: undefined, sourceOwnedPlanWorkingSetTargetId: "owned-target" } as never))
      .toEqual({ graph: "owned", id: "owned-target" });
    expect(internal.snapshotTargetReference({ ...snapshotSet, sourcePlanWorkingSetTargetId: undefined } as never)).toBeNull();
    expect(internal.snapshotTargetReference({ ...snapshotSet, sourceOwnedPlanWorkingSetTargetId: "owned-target" } as never)).toBeNull();
    expect(internal.sameTargetReference({ graph: "legacy", id: "x" }, { graph: "legacy", id: "x" })).toBe(true);
    expect(internal.sameTargetReference(null, { graph: "legacy", id: "x" })).toBe(false);

    const snapshot = {
      version: 1,
      session: {
        id: "session", source: "manual", status: "completed", planId: null, planDayId: null,
        planName: null, dayName: null, localDate: "2026-10-13", timezone: "Asia/Singapore",
        startedAtMs: 1, completedAtMs: 2, ownerNote: "note",
      },
      exercises: [{
        id: "session-exercise", exerciseId: "exercise", name: "Exercise", ordinal: 0,
        status: "completed", metricIdentity: timedIdentity, effort: null, sets: [snapshotSet],
      }],
    } as const;
    const session = {
      id: "session", source: "manual", status: "completed", plan_id: null, plan_day_id: null,
      local_date: "2026-10-13", timezone: "Asia/Singapore", started_at_ms: 1, completed_at_ms: 2,
      revision: 1, modified_from_plan: 0, plan_name: null, day_name: null,
      effective_revision: 2, lifecycle: "active", snapshot_json: JSON.stringify(snapshot),
    };
    expect(internal.effectiveOverlaySnapshot(session as never)).toEqual(snapshot);
    expect(() => internal.effectiveOverlaySnapshot({ ...session, snapshot_json: "{}" } as never))
      .toThrow("session_detail_effective_overlay_invalid");
    expect(() => internal.effectiveOverlaySnapshot({ ...session, snapshot_json: JSON.stringify({ ...snapshot, session: { ...snapshot.session, id: "other" } }) } as never))
      .toThrow("session_detail_effective_overlay_invalid");
    await expect(internal.detailFromEffectiveOverlay(emptyExecutor as never, { ...session, effective_revision: null } as never, snapshot as never, [], []))
      .rejects.toThrow("session_detail_effective_revision_missing");
    expect(internal.topEffectiveWorkingSet("session", timedIdentity, [snapshotSet] as never)).toBe("45 sec");
    expect(internal.topEffectiveWorkingSet("session", timedIdentity, [{ ...snapshotSet, completedAtMs: null }] as never)).toBe("45 sec");
    expect(internal.topEffectiveWorkingSet("session", timedIdentity, [{ ...snapshotSet, observation: undefined }] as never)).toBeNull();
    const detail = await internal.detailFromEffectiveOverlay(emptyExecutor as never, session as never, snapshot as never, [], []);
    expect(detail).toMatchObject({ id: "session", corrected: true, ownerNote: "note", durationMs: 1 });
    await expect(internal.detailFromEffectiveOverlay(emptyExecutor as never, session as never, {
      ...snapshot, session: { ...snapshot.session, completedAtMs: null },
    } as never, [], [])).resolves.toMatchObject({ durationMs: null });
    await expect(internal.effectiveNonLoadOutcomes(emptyExecutor as never, { ...session, effective_revision: null } as never, snapshot as never, [], []))
      .resolves.toEqual([]);

    const rawExercise = {
      id: "session-exercise", exercise_id: "exercise", exercise_name: "Exercise",
      metric_profile: "timed_hold", metric_contract_version: 1, exercise_metric_generation: 1,
      ordinal: 0, status: "completed", effort: null, revision: 1,
    };
    const rawSession = {
      ...session, snapshot_json: null, lifecycle: null, effective_revision: null,
    };
    expect(internal.historySubjectSnapshot(rawSession as never, [rawExercise] as never, [
      { ...timedSet, source_plan_working_set_target_id: null },
      timedSet,
      { ...timedSet, id: "owned-set", source_plan_working_set_target_id: null, source_owned_plan_working_set_target_id: "owned-target" },
    ] as never, "active").exercises.map(({ recommendationTargetIds }: any) => recommendationTargetIds))
      .toEqual([[], ["legacy:legacy-target"], ["owned:owned-target"]]);
    expect(internal.historySubjectSnapshotFromCorrectionSnapshot({
      ...snapshot,
      exercises: [{
        ...snapshot.exercises[0],
        sets: [
          snapshotSet,
          { ...snapshotSet, id: "owned-set", sourcePlanWorkingSetTargetId: undefined, sourceOwnedPlanWorkingSetTargetId: "owned-target" },
          { ...snapshotSet, id: "bare-set", sourcePlanWorkingSetTargetId: undefined },
        ],
      }],
    } as never, "active").exercises.map(({ recommendationTargetIds }: any) => recommendationTargetIds))
      .toEqual([["legacy:legacy-target"], ["owned:owned-target"], []]);
    expect(internal.sourceHistoryCorrectionSnapshot(rawSession as never, [rawExercise] as never, [{
      ...timedSet, source_plan_working_set_target_id: null, source_owned_plan_working_set_target_id: "owned-target",
    }] as never, "completed", 2).exercises[0]?.sets[0])
      .toMatchObject({ sourceOwnedPlanWorkingSetTargetId: "owned-target" });
    expect(internal.exerciseIdentity({ ...rawExercise, metric_contract_version: undefined, exercise_metric_generation: undefined } as never))
      .toEqual({ profile: "timed_hold", contractVersion: 1, exerciseMetricGeneration: 1 });
    expect(internal.setIdentity({ ...timedSet, metric_profile: undefined, metric_contract_version: undefined, exercise_metric_generation: undefined } as never, rawExercise as never))
      .toEqual(timedIdentity);
    expect(internal.setIdentity({ ...timedSet, metric_profile: undefined, metric_contract_version: undefined, exercise_metric_generation: undefined } as never, {
      ...rawExercise, metric_contract_version: undefined, exercise_metric_generation: undefined,
    } as never)).toEqual(timedIdentity);
    expect(internal.parseSetObservation({
      ...timedSet, metric_profile: "load_reps", observed_json: null,
      observed_load_grams: 60_000, observed_reps: 8,
    } as never, { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 }))
      .toMatchObject({ profile: "load_reps", loadGrams: 60_000, reps: 8 });

    const successExecutor = {
      queryAll: jest.fn(async () => [{
        policy_type: "manual_hold", policy_version: 1,
        rule_json: policy.rule_json, metric_profile: "timed_hold",
        metric_contract_version: 1, exercise_metric_generation: 1,
      }]),
    };
    const effectiveOutcomes = await internal.effectiveNonLoadOutcomes(
      successExecutor as never,
      { ...session, effective_revision: 2 } as never,
      snapshot as never,
      [rawExercise] as never,
      [timedSet] as never,
    );
    expect(effectiveOutcomes).toHaveLength(1);
    await expect(internal.effectiveNonLoadOutcomes(successExecutor as never, { ...session, effective_revision: 2 } as never, {
      ...snapshot,
      exercises: [
        { ...snapshot.exercises[0], id: "z", exerciseId: "z", sets: [snapshotSet] },
        { ...snapshot.exercises[0], id: "a", exerciseId: "a", sets: [snapshotSet] },
      ],
    } as never, [
      { ...rawExercise, id: "z", exercise_id: "z" },
      { ...rawExercise, id: "a", exercise_id: "a" },
    ] as never, [
      { ...timedSet, session_exercise_id: "z" },
      { ...timedSet, session_exercise_id: "a" },
    ] as never)).resolves.toHaveLength(2);
    await expect(internal.effectiveNonLoadOutcomes(successExecutor as never, { ...session, effective_revision: 2 } as never, {
      ...snapshot,
      exercises: [
        { ...snapshot.exercises[0], sets: [{ ...snapshotSet, id: "set-b" }] },
        { ...snapshot.exercises[0], sets: [{ ...snapshotSet, id: "set-a" }] },
      ],
    } as never, [rawExercise] as never, [
      { ...timedSet, id: "set-b" },
      { ...timedSet, id: "set-a" },
    ] as never)).resolves.toHaveLength(2);
    await expect(internal.effectiveNonLoadOutcomes(successExecutor as never, { ...session, effective_revision: 2 } as never, {
      ...snapshot,
      exercises: [{ ...snapshot.exercises[0], metricIdentity: { ...timedIdentity, contractVersion: 0 } }],
    } as never, [rawExercise] as never, [timedSet] as never)).resolves.toEqual([]);
    await expect(internal.effectiveNonLoadOutcomes(successExecutor as never, { ...session, effective_revision: 2 } as never, {
      ...snapshot,
      exercises: [{ ...snapshot.exercises[0], exerciseId: "different" }],
    } as never, [rawExercise] as never, [timedSet] as never)).resolves.toEqual([]);
    await expect(internal.effectiveNonLoadOutcomes(successExecutor as never, { ...session, effective_revision: 2 } as never, {
      ...snapshot,
      exercises: [{ ...snapshot.exercises[0], sets: [{ ...snapshotSet, sourcePlanWorkingSetTargetId: undefined }] }],
    } as never, [rawExercise] as never, [timedSet] as never)).resolves.toEqual([]);
    await expect(internal.effectiveNonLoadOutcomes(successExecutor as never, { ...session, effective_revision: 2 } as never, {
      ...snapshot,
      exercises: [{ ...snapshot.exercises[0], sets: [{ ...snapshotSet, id: "corrected-set" }] }],
    } as never, [rawExercise] as never, [timedSet] as never)).resolves.toHaveLength(1);
    await expect(internal.effectiveNonLoadOutcomes(successExecutor as never, { ...session, effective_revision: 2 } as never, {
      ...snapshot,
      exercises: [{ ...snapshot.exercises[0], sets: [{ ...snapshotSet, observation: undefined }] }],
    } as never, [rawExercise] as never, [timedSet] as never)).resolves.toEqual([]);
    await expect(internal.effectiveNonLoadOutcomes(successExecutor as never, { ...session, effective_revision: 2 } as never, {
      ...snapshot,
      exercises: [{ ...snapshot.exercises[0], sets: [{ ...snapshotSet, target: {} }] }],
    } as never, [rawExercise] as never, [timedSet] as never)).resolves.toEqual([]);

    const automaticPolicy = {
      policy_kind: "automatic", policy_id: "automatic", policy_version: 1,
      rule_json: JSON.stringify({ kind: "automatic", id: "automatic", version: 1 }),
      metric_profile: "timed_hold", metric_contract_version: 1, exercise_metric_generation: 1,
    };
    const automaticExecutor = { queryAll: jest.fn(async () => [automaticPolicy]) };
    await expect(internal.effectiveNonLoadOutcomes(automaticExecutor as never, { ...session, effective_revision: 2 } as never, {
      ...snapshot,
      exercises: [{ ...snapshot.exercises[0], sets: [{
        ...snapshotSet, sourcePlanWorkingSetTargetId: undefined, sourceOwnedPlanWorkingSetTargetId: "owned-target",
      }] }],
    } as never, [rawExercise] as never, [{
      ...timedSet, source_plan_working_set_target_id: null, source_owned_plan_working_set_target_id: "owned-target", rule_type: "timed_hold",
    }] as never)).resolves.toEqual([]);

    const rawOutcomes = await internal.rawNonLoadOutcomes(successExecutor as never, rawSession as never, [rawExercise, rawExercise] as never, [timedSet] as never);
    expect(rawOutcomes).toHaveLength(2);
    const failingPolicyExecutor = { queryAll: jest.fn(async () => { throw new Error("policy_read_failed"); }) };
    await expect(internal.rawNonLoadOutcomes(failingPolicyExecutor as never, rawSession as never, [rawExercise] as never, [timedSet] as never))
      .resolves.toEqual([]);
  });

  it("fences history overlay lifecycle transitions and terminalization", async () => {
    const snapshot = {
      version: 1,
      session: {
        id: "session", source: "manual", status: "partial", planId: null, planDayId: null,
        planName: null, dayName: null, localDate: "2026-10-13", timezone: "Asia/Singapore",
        startedAtMs: 1, completedAtMs: 2, ownerNote: null,
      },
      exercises: [],
    } as const;
    const active = { id: "session", lifecycle: "active", effective_revision: 1 };
    const voided = { id: "session", lifecycle: "voided", effective_revision: 2 };
    const transaction = (changes: number) => ({
      execute: jest.fn(async () => ({ changes })),
    });
    await expect(internal.voidActiveHistoryOverlayForResume(transaction(1) as never, { ...active, lifecycle: null } as never, 3))
      .rejects.toThrow("resume_partial_conflict");
    await expect(internal.voidActiveHistoryOverlayForResume(transaction(0) as never, active as never, 3))
      .rejects.toThrow("resume_partial_conflict");
    const voidSuccess = transaction(1);
    await expect(internal.voidActiveHistoryOverlayForResume(voidSuccess as never, active as never, 3)).resolves.toBeUndefined();
    expect(voidSuccess.execute).toHaveBeenCalledTimes(2);

    await expect(internal.reactivateHistoryOverlayAfterResume(transaction(1) as never, active as never, snapshot as never, snapshot as never, 4))
      .rejects.toThrow("finish_workout_conflict");
    await expect(internal.reactivateHistoryOverlayAfterResume(transaction(0) as never, voided as never, snapshot as never, snapshot as never, 4))
      .rejects.toThrow("finish_workout_conflict");
    const reactivateSuccess = transaction(1);
    await expect(internal.reactivateHistoryOverlayAfterResume(reactivateSuccess as never, voided as never, snapshot as never, snapshot as never, 4))
      .resolves.toBeUndefined();
    expect(reactivateSuccess.execute).toHaveBeenCalledTimes(3);

    await expect(internal.terminalizeVoidedHistoryOverlay(transaction(1) as never, active as never, snapshot as never, "discarded", 5))
      .rejects.toThrow("finish_workout_conflict");
    await expect(internal.terminalizeVoidedHistoryOverlay(transaction(0) as never, voided as never, snapshot as never, "discarded", 5))
      .rejects.toThrow("finish_workout_conflict");
    const terminalSuccess = transaction(1);
    await expect(internal.terminalizeVoidedHistoryOverlay(terminalSuccess as never, voided as never, snapshot as never, "zero_sets", 5))
      .resolves.toBeDefined();
    expect(terminalSuccess.execute).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid finish states before effects and conditional writes can claim success", async () => {
    const baseSession = {
      id: "session", source: "manual", status: "in_progress", plan_id: null, plan_day_id: null,
      local_date: "2026-10-13", timezone: "Asia/Singapore", started_at_ms: 1,
      completed_at_ms: null, revision: 1, modified_from_plan: 0, plan_name: null,
      day_name: null, effective_revision: null, lifecycle: null, snapshot_json: null,
    };
    const exercise = {
      id: "exercise", exercise_id: "exercise", exercise_name: "Exercise", metric_profile: "load_reps",
      metric_contract_version: 1, exercise_metric_generation: 1, ordinal: 0, status: "active", effort: null, revision: 1,
    };
    const set = {
      id: "set", session_exercise_id: "exercise", set_kind: "working", ordinal: 0, status: "planned",
      target_json: JSON.stringify(metricCases[0].target), metric_profile: "load_reps", metric_contract_version: 1,
      exercise_metric_generation: 1, observed_load_grams: null, observed_reps: null, observed_json: null,
      completed_at_ms: null, source_plan_working_set_target_id: null, source_owned_plan_working_set_target_id: null,
      rule_type: "load_reps", rule_version: 1,
    };
    const transaction = (session: Record<string, unknown>, exercises: readonly Record<string, unknown>[], sets: readonly Record<string, unknown>[], changes = 1) => ({
      queryAll: jest.fn(async (sql: string) => {
        if (sql.includes("PRAGMA table_info(session_exercises)")) return [{ name: "metric_contract_version" }, { name: "exercise_metric_generation" }];
        if (sql.includes("PRAGMA table_info(session_sets)")) return [];
        if (sql.includes("SELECT ws.id")) return [session];
        if (sql.includes("FROM session_exercises")) return exercises;
        if (sql.includes("FROM session_sets ss")) return sets;
        return [];
      }),
      execute: jest.fn(async () => ({ changes })),
    });
    const input = { sessionId: "session", expectedSessionRevision: 1, endedAtMs: 5 };
    await expect(internal.finish(transaction({ ...baseSession, revision: 2 }, [], []) as never, input as never, "finish_completed"))
      .rejects.toThrow("finish_workout_conflict");
    await expect(internal.finish(transaction(baseSession, [exercise], [set]) as never, input as never, "finish_completed"))
      .rejects.toThrow("workout_not_complete");
    await expect(internal.finish(transaction(baseSession, [exercise], [{ ...set, status: "completed" }]) as never, input as never, "finish_completed"))
      .rejects.toThrow("workout_not_complete");
    await expect(internal.finish(transaction(baseSession, [{ ...exercise, status: "completed" }], [{ ...set, status: "completed" }]) as never, input as never, "save_zero_sets"))
      .rejects.toThrow("zero_set_outcome_has_work");
    await expect(internal.finish(transaction(baseSession, [], [], 0) as never, input as never, "discard"))
      .rejects.toThrow("finish_workout_conditional_update_failed");
  });

  it("validates copied automatic policies and recommendation read projections", async () => {
    const identity = { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 } as const;
    const automatic = {
      policy_kind: "automatic", policy_id: "load_reps.double_progression.v1", policy_version: 1,
      rule_json: JSON.stringify({ kind: "automatic", id: "load_reps.double_progression.v1", version: 1 }),
      metric_profile: "load_reps", metric_contract_version: 1, exercise_metric_generation: 1,
    };
    expect(internal.isCopiedAutomaticLoadRepsPolicy(automatic as never, identity)).toBe(true);
    for (const invalid of [
      { ...automatic, policy_kind: "manual_hold" },
      { ...automatic, policy_id: "other" },
      { ...automatic, policy_version: 2 },
      { ...automatic, metric_profile: "timed_hold" },
      { ...automatic, metric_contract_version: 2 },
      { ...automatic, exercise_metric_generation: 2 },
      { ...automatic, rule_json: "{" },
      { ...automatic, rule_json: JSON.stringify({ kind: "automatic", id: "other", version: 1 }) },
    ]) {
      expect(internal.isCopiedAutomaticLoadRepsPolicy(invalid as never, identity)).toBe(false);
    }

    const set = {
      source_plan_working_set_target_id: "target", source_owned_plan_working_set_target_id: null,
    };
    const invalidRecommendationExecutor = {
      queryAll: jest.fn(async (sql: string) => {
        if (sql.includes("FROM progression_recommendations")) return [{
          id: "invalid", exercise_id: "exercise", status: "pending", rule_version: 1, created_at_ms: 1,
          evidence_json: JSON.stringify({ decision: "invalid", confidence: "invalid", reason: 1 }),
          current_target_json: JSON.stringify({ loadGrams: "bad" }),
          proposed_target_json: JSON.stringify({ loadGrams: "bad" }),
        }];
        return [];
      }),
    };
    await expect(internal.recommendationsForSession(invalidRecommendationExecutor as never, "session", [set] as never, []))
      .resolves.toEqual([]);
    const validEvidence = JSON.stringify({
      decision: "increase", confidence: "high", reason: "Increase",
      comparableReps: [8],
    });
    const validRecommendationExecutor = {
      queryAll: jest.fn(async () => [
        { id: "b", exercise_id: "exercise-b", status: "pending", rule_version: 1, created_at_ms: 1, evidence_json: validEvidence, current_target_json: JSON.stringify({ loadGrams: 60_000, targetReps: [8] }), proposed_target_json: JSON.stringify({ loadGrams: 62_500, targetReps: [8] }) },
        { id: "a", exercise_id: "exercise-a", status: "pending", rule_version: 1, created_at_ms: 1, evidence_json: validEvidence, current_target_json: JSON.stringify({ loadGrams: 60_000, maxReps: 8 }), proposed_target_json: JSON.stringify({ loadGrams: 62_500, targetReps: [8] }) },
        { id: "duplicate", exercise_id: "exercise-a", status: "pending", rule_version: 1, created_at_ms: 0, evidence_json: validEvidence, current_target_json: JSON.stringify({ loadGrams: 60_000 }), proposed_target_json: JSON.stringify({ loadGrams: 62_500 }) },
        { id: "wrong-rule", exercise_id: "exercise-c", status: "pending", rule_version: 2, created_at_ms: 0, evidence_json: validEvidence, current_target_json: JSON.stringify({ loadGrams: 60_000 }), proposed_target_json: JSON.stringify({ loadGrams: 62_500 }) },
      ]),
    };
    await expect(internal.recommendationsForSession(validRecommendationExecutor as never, "session", [set] as never, []))
      .resolves.toEqual([
        expect.objectContaining({ id: "a", exerciseName: "Exercise" }),
        expect.objectContaining({ id: "b", exerciseName: "Exercise" }),
      ]);
  });

  it("fails recommendation decisions at missing, invalid-target, target-CAS, and lifecycle-CAS boundaries", async () => {
    const currentTarget = metricCases[0].target;
    const proposedTarget = { ...currentTarget, targetReps: [8, 8, 8] };
    const evidenceFor = (proposed: Record<string, unknown>) => JSON.stringify({
      version: 2,
      rule: { id: "load_reps.double_progression.v1", version: 1 },
      metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
      source: { sessionId: "source-session", sessionExerciseId: "source-exercise", sessionRevision: 1, setIds: ["source-set"] },
      revisions: { source: 1, target: 1 },
      targetScope: [{ id: "target", revision: 1 }],
      currentTarget,
      proposedTarget: proposed,
      decision: "increase",
      reasonCode: "increase_all_qualified_sets_at_upper_bound",
      reason: "All qualifying sets reached the upper bound",
      confidence: "high",
      lifecycle: { state: "pending", createdAtMs: 1 },
    });
    const recommendationFor = (proposed: Record<string, unknown>) => ({
      ...recommendation,
      target_id: "target",
      evidence_json: evidenceFor(proposed),
      proposed_target_json: JSON.stringify(proposed),
      created_at_ms: 1,
      target_graph: "legacy",
    });
    const target = {
      id: "target", target_json: JSON.stringify(currentTarget), revision: 1,
      exercise_id: "exercise", metric_profile: "load_reps", metric_contract_version: 1,
      exercise_metric_generation: 1,
    };
    const createDecisionRepository = (input: Readonly<{
      proposed: Record<string, unknown>;
      targetChanges?: number;
      lifecycleChanges?: number;
      includeRecommendation?: boolean;
      graph?: "legacy" | "owned";
    }>) => {
      const execute = jest.fn(async (sql: string) => ({
        changes: sql.includes("UPDATE plan_working_set_targets") || sql.includes("UPDATE owned_plan_working_set_targets")
          ? input.targetChanges ?? 1
          : sql.includes("UPDATE progression_recommendations")
            ? input.lifecycleChanges ?? 1
            : 1,
      }));
      const queryAll = async (sql: string) => {
        if (sql.includes("COUNT(*) AS count") && sql.includes("decision_receipts")) return [{ count: 0 }];
        if (sql.includes("PRAGMA table_info(session_sets)")) return input.graph === "owned" ? [{ name: "source_owned_plan_working_set_target_id" }] : [];
        if (sql.includes("sqlite_master") && sql.includes("owned_progression_recommendations")) return [{ count: input.graph === "owned" ? 1 : 0 }];
        if (sql.includes("FROM progression_recommendations") && sql.includes("WHERE id = ?")) {
          return input.graph === "owned" || input.includeRecommendation === false ? [] : [recommendationFor(input.proposed)];
        }
        if (sql.includes("FROM owned_progression_recommendations") && sql.includes("WHERE id = ?")) {
          return input.includeRecommendation === false ? [] : [{ ...recommendationFor(input.proposed), target_graph: undefined }];
        }
        if (sql.includes("FROM plan_working_set_targets target") || sql.includes("FROM owned_plan_working_set_targets target")) return [target];
        if (sql.includes("FROM workout_sessions")) return [{ revision: 1, status: "completed" }];
        return [];
      };
      return createWorkoutOutcomeRepository({
        write: async (operation: any) => operation({ queryAll, execute }),
      } as never);
    };
    const command = {
      recommendationId: "recommendation", requestId: "request", decision: "use_target" as const,
      expectedEvidenceVersion: 2, expectedSourceRevision: 1, expectedTargetRevision: 1,
      decidedAtMs: 2,
    };
    await expect(createDecisionRepository({ proposed: proposedTarget, includeRecommendation: false }).acceptRecommendation(command))
      .rejects.toThrow("recommendation_decision_conflict");
    await expect(createDecisionRepository({ proposed: { ...currentTarget, targetReps: undefined } }).acceptRecommendation(command))
      .rejects.toThrow("recommendation_target_invalid");
    await expect(createDecisionRepository({ proposed: proposedTarget, targetChanges: 0 }).acceptRecommendation(command))
      .rejects.toThrow("recommendation_target_compare_and_swap_failed");
    await expect(createDecisionRepository({ proposed: proposedTarget, lifecycleChanges: 0 }).acceptRecommendation(command))
      .rejects.toThrow("recommendation_decision_conflict");
    await expect(createDecisionRepository({ proposed: proposedTarget }).acceptRecommendation(command))
      .resolves.toEqual({ recommendationId: "recommendation", status: "accepted" });
    await expect(createDecisionRepository({ proposed: proposedTarget, graph: "owned" }).acceptRecommendation(command))
      .resolves.toEqual({ recommendationId: "recommendation", status: "accepted" });

    const keep = {
      ...command,
      decision: "keep_current_target" as const,
    };
    await expect(createDecisionRepository({ proposed: proposedTarget, lifecycleChanges: 0 }).keepCurrentTarget(keep))
      .rejects.toThrow("recommendation_decision_conflict");
    await expect(createDecisionRepository({ proposed: proposedTarget }).keepCurrentTarget(keep))
      .resolves.toEqual({ recommendationId: "recommendation", status: "rejected" });
  });

  it("covers recommendation generation replay, eligibility, policy, and owned-insert branches", async () => {
    const session = {
      id: "session", source: "manual", status: "completed", plan_id: null, plan_day_id: null,
      local_date: "2026-10-13", timezone: "Asia/Singapore", started_at_ms: 1,
      completed_at_ms: 2, revision: 1, modified_from_plan: 0, plan_name: null,
      day_name: null, effective_revision: null, lifecycle: null, snapshot_json: null,
    };
    const exercise = {
      id: "session-exercise", exercise_id: "exercise", exercise_name: "Exercise",
      metric_profile: "load_reps", metric_contract_version: 1, exercise_metric_generation: 1,
      ordinal: 0, status: "completed", effort: "on_target", revision: 1,
    };
    const setFor = (graph: "legacy" | "owned") => ({
      id: "set", session_exercise_id: "session-exercise", set_kind: "working", ordinal: 0,
      status: "completed", target_json: JSON.stringify(metricCases[0].target),
      metric_profile: "load_reps", metric_contract_version: 1, exercise_metric_generation: 1,
      observed_load_grams: 60_000, observed_reps: 8, observed_json: JSON.stringify(metricCases[0].observation),
      completed_at_ms: 2, source_plan_working_set_target_id: graph === "legacy" ? "target" : null,
      source_owned_plan_working_set_target_id: graph === "owned" ? "target" : null,
      rule_type: "load_reps", rule_version: 1,
    });
    const target = { id: "target", plan_day_exercise_id: "occurrence", target_json: JSON.stringify(metricCases[0].target), revision: 1 };
    const validPolicy = {
      policy_kind: "automatic", policy_id: "load_reps.double_progression.v1", policy_version: 1,
      rule_json: JSON.stringify({ kind: "automatic", id: "load_reps.double_progression.v1", version: 1 }),
      metric_profile: "load_reps", metric_contract_version: 1, exercise_metric_generation: 1,
    };
    const repositoryForMode = (mode: string, graph: "legacy" | "owned" = "legacy") => {
      const execute = jest.fn(async () => ({ changes: 1 }));
      const queryAll = async (sql: string) => {
        if (sql.includes("PRAGMA table_info(session_exercises)")) return [{ name: "metric_contract_version" }, { name: "exercise_metric_generation" }];
        if (sql.includes("PRAGMA table_info(session_sets)")) return graph === "owned" ? [{ name: "source_owned_plan_working_set_target_id" }] : [];
        if (sql.includes("sqlite_master") && sql.includes("owned_progression_recommendations")) return [{ count: graph === "owned" ? 1 : 0 }];
        if (sql.includes("SELECT ws.id")) return [session];
        if (sql.includes("FROM session_exercises")) return [{
          ...exercise,
          ...(mode === "non-load" ? { metric_profile: "timed_hold" } : {}),
          ...(mode === "missing-generation" ? { exercise_metric_generation: undefined } : {}),
        }];
        if (sql.includes("FROM session_sets ss")) return [{
          ...setFor(graph),
          ...(mode === "timed-evidence" ? { rule_type: "timed_hold", observed_load_grams: null } : {}),
        }];
        if (sql.includes("SELECT exercise_id") && sql.includes("WHERE id = ?")) {
          return mode === "replay-conflict" ? [{ exercise_id: "other", target_id: "target", evidence_json: "{}" }] : [];
        }
        if (sql.includes(`FROM ${graph === "owned" ? "owned_plan_working_set_targets" : "plan_working_set_targets"} WHERE id = ?`)) {
          return mode === "missing-target" ? [] : [target];
        }
        if (sql.includes("WHERE plan_day_exercise_id = ?")) {
          return mode === "no-eligible" ? [{ ...target, id: "other" }] : [target];
        }
        if (sql.includes("FROM owned_plan_progression_policies")) {
          if (mode === "no-policy") return [];
          return [mode === "invalid-policy" ? { ...validPolicy, policy_id: "other" } : validPolicy];
        }
        return [];
      };
      return {
        execute,
        repository: createWorkoutOutcomeRepository({
          write: async (operation: any) => operation({ queryAll, execute }),
        } as never),
      };
    };
    await expect(repositoryForMode("replay-conflict").repository.generateRecommendationsForSession("session", 1, 3))
      .rejects.toThrow("recommendation_replay_conflict");
    await expect(repositoryForMode("missing-target").repository.generateRecommendationsForSession("session", 1, 3)).resolves.toBe(0);
    await expect(repositoryForMode("no-eligible").repository.generateRecommendationsForSession("session", 1, 3)).resolves.toBe(0);
    await expect(repositoryForMode("no-policy", "owned").repository.generateRecommendationsForSession("session", 1, 3)).resolves.toBe(0);
    await expect(repositoryForMode("non-load").repository.generateRecommendationsForSession("session", 1, 3)).resolves.toBe(0);
    await expect(repositoryForMode("invalid-policy", "owned").repository.generateRecommendationsForSession("session", 1, 3)).resolves.toBe(0);
    const owned = repositoryForMode("success", "owned");
    await expect(owned.repository.generateRecommendationsForSession("session", 1, 3)).resolves.toBe(1);
    expect(owned.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO owned_progression_recommendations"), expect.any(Array));
    await expect(repositoryForMode("timed-evidence").repository.generateRecommendationsForSession("session", 1, 3)).resolves.toEqual(expect.any(Number));
    await expect(repositoryForMode("missing-generation", "owned").repository.generateRecommendationsForSession("session", 1, 3)).resolves.toBe(1);
    await expect(repositoryForMode("missing-generation").repository.generateRecommendationsForSession("session", 1, 3)).resolves.toBe(1);
  });

  it("rejects duplicate graph receipts and malformed retained results", async () => {
    const duplicate = repositoryFor((sql) => {
      if (sql.includes("FROM sqlite_master")) return [{ count: 2 }];
      if (sql.includes("FROM progression_recommendation_decision_receipts")
        || sql.includes("FROM owned_progression_recommendation_decision_receipts")) {
        return [{ request_sha256: "a".repeat(64), result_json: "{}" }];
      }
      return [];
    });
    await expect(duplicate.repository.acceptRecommendation({
      recommendationId: "recommendation",
      requestId: "request",
      decision: "use_target",
      expectedEvidenceVersion: 2,
      expectedSourceRevision: 1,
      expectedTargetRevision: 1,
      decidedAtMs: 1,
    })).rejects.toThrow("recommendation_request_identity_conflict");

    const request = {
      recommendationId: "recommendation",
      requestId: "request",
      decision: "use_target" as const,
      expectedEvidenceVersion: 2,
      expectedSourceRevision: 1,
      expectedTargetRevision: 1,
      decidedAtMs: 1,
    };
    const requestSha256 = await runtimeSha256(canonicalRecommendationDecisionRequest(request));
    const malformed = repositoryFor((sql) => {
      if (sql.includes("FROM sqlite_master")) return [{ count: 2 }];
      if (sql.includes("FROM progression_recommendation_decision_receipts")) {
        return [{ request_sha256: requestSha256, result_json: "{}" }];
      }
      return [];
    });
    await expect(malformed.repository.acceptRecommendation(request))
      .rejects.toThrow("recommendation_receipt_invalid");

    const duplicateByRecommendation = repositoryFor((sql) => {
      if (sql.includes("FROM sqlite_master")) return [{ count: 2 }];
      if (sql.includes("WHERE request_id")) return [];
      if (sql.includes("WHERE recommendation_id")) {
        return [{
          request_id: "prior",
          request_sha256: "a".repeat(64),
          recommendation_id: recommendation.id,
          decision: "use_target",
          result_json: JSON.stringify({ recommendationId: recommendation.id, status: "accepted" }),
        }];
      }
      return [];
    });
    await expect(duplicateByRecommendation.repository.keepCurrentTarget({
      ...request,
      decision: "keep_current_target",
    })).rejects.toThrow("recommendation_request_identity_conflict");

    const conflictingPriorDecision = repositoryFor((sql) => {
      if (sql.includes("FROM sqlite_master")) return [{ count: 2 }];
      if (sql.includes("WHERE request_id")) return [];
      if (sql.includes("FROM progression_recommendation_decision_receipts")
        && sql.includes("WHERE recommendation_id")) {
        return [{
          request_id: "prior",
          request_sha256: "a".repeat(64),
          recommendation_id: recommendation.id,
          decision: "use_target",
          result_json: JSON.stringify({ recommendationId: recommendation.id, status: "accepted" }),
        }];
      }
      return [];
    });
    await expect(conflictingPriorDecision.repository.keepCurrentTarget({
      ...request,
      decision: "keep_current_target",
    })).rejects.toThrow("recommendation_request_identity_conflict");
  });

  it("fails closed across exact source-revision fallback reads", async () => {
    const missing = createWorkoutOutcomeRepository({
      queryAll: async () => [],
    } as never);
    await expect(missing.getSessionDetailAtRevision?.("missing", 1))
      .rejects.toThrow("workout_session_not_found");
    await expect(missing.getCalendarSessionDetail("missing")).resolves.toBeNull();

    const inconsistent = createWorkoutOutcomeRepository({
      queryAll: async (sql: string) => {
        if (sql.includes("SELECT COALESCE(overlay.effective_revision")) {
          return [{ effective_revision: 2, lifecycle: "active" }];
        }
        if (sql.includes("SELECT ws.id")) {
          return [{
            id: "session", source: "manual", status: "completed", plan_id: null,
            plan_day_id: null, local_date: "2026-10-13", timezone: "Asia/Singapore",
            started_at_ms: 1, completed_at_ms: 2, revision: 1, modified_from_plan: 0,
            plan_name: null, day_name: null, effective_revision: null,
            lifecycle: null, snapshot_json: null,
          }];
        }
        return [];
      },
    } as never);
    await expect(inconsistent.getSessionDetailAtRevision?.("session", 2))
      .rejects.toThrow("workout_source_revision_mismatch");

    const voided = createWorkoutOutcomeRepository({
      queryAll: async (sql: string) => sql.includes("SELECT ws.id") ? [{
        id: "voided", source: "manual", status: "completed", plan_id: null,
        plan_day_id: null, local_date: "2026-10-13", timezone: "Asia/Singapore",
        started_at_ms: 1, completed_at_ms: 2, revision: 1, modified_from_plan: 0,
        plan_name: null, day_name: null, effective_revision: 2,
        lifecycle: "voided", snapshot_json: null,
      }] : [],
    } as never);
    await expect(voided.getSessionDetail("voided")).resolves.toMatchObject({
      id: "voided",
      corrected: true,
      revision: 2,
      status: "completed",
    });

    const partialCalendar = createWorkoutOutcomeRepository({
      queryAll: async (sql: string) => {
        if (sql.includes("SELECT session.status")) {
          return [{ status: "partial", lifecycle: "active" }];
        }
        if (sql.includes("SELECT ws.id")) {
          return [{
            id: "partial", source: "manual", status: "partial", plan_id: null,
            plan_day_id: null, local_date: "2026-10-13", timezone: "Asia/Singapore",
            started_at_ms: 1, completed_at_ms: 2, revision: 1, modified_from_plan: 0,
            plan_name: null, day_name: null, effective_revision: null,
            lifecycle: null, snapshot_json: null,
          }];
        }
        return [];
      },
    } as never);
    await expect(partialCalendar.getCalendarSessionDetail("partial"))
      .resolves.toMatchObject({ id: "partial", status: "partial" });

    const inconsistentCalendar = createWorkoutOutcomeRepository({
      queryAll: async (sql: string) => {
        if (sql.includes("SELECT session.status")) {
          return [{ status: "completed", lifecycle: "active" }];
        }
        if (sql.includes("SELECT ws.id")) {
          return [{
            id: "inconsistent", source: "manual", status: "in_progress",
            plan_id: null, plan_day_id: null, local_date: "2026-10-13",
            timezone: "Asia/Singapore", started_at_ms: 1, completed_at_ms: null,
            revision: 1, modified_from_plan: 0, plan_name: null, day_name: null,
            effective_revision: null, lifecycle: null, snapshot_json: null,
          }];
        }
        return [];
      },
    } as never);
    await expect(inconsistentCalendar.getCalendarSessionDetail("inconsistent"))
      .resolves.toBeNull();
  });

  it("drops a malformed previous observation from an otherwise valid detail", async () => {
    const repository = createWorkoutOutcomeRepository({
      queryAll: async (sql: string) => {
        if (sql.includes("PRAGMA table_info(session_exercises)")) {
          return [{ name: "metric_contract_version" }, { name: "exercise_metric_generation" }];
        }
        if (sql.includes("PRAGMA table_info(session_sets)")) return [];
        if (sql.includes("SELECT ws.id")) {
          return [{
            id: "current", source: "manual", status: "completed", plan_id: null,
            plan_day_id: null, local_date: "2026-10-13", timezone: "Asia/Singapore",
            started_at_ms: 2, completed_at_ms: 3, revision: 1, modified_from_plan: 0,
            plan_name: null, day_name: null, effective_revision: null,
            lifecycle: null, snapshot_json: null,
          }];
        }
        if (sql.includes("FROM session_exercises")) return [{
          id: "current-exercise", exercise_id: "exercise", exercise_name: "Exercise",
          metric_profile: "load_reps", metric_contract_version: 1,
          exercise_metric_generation: 1, ordinal: 0, status: "completed",
          effort: null, revision: 1,
        }];
        if (sql.includes("FROM session_sets ss")) return [{
          id: "current-set", session_exercise_id: "current-exercise", set_kind: "working",
          ordinal: 0, status: "completed", target_json: JSON.stringify({
            version: 1, profile: "load_reps", loadGrams: 60_000, minReps: 8,
            maxReps: 8, targetReps: [8], incrementGrams: 2_500, perSide: false,
          }),
          metric_profile: "load_reps", metric_contract_version: 1,
          exercise_metric_generation: 1, observed_load_grams: 60_000, observed_reps: 8,
          observed_json: JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 60_000, reps: 8, source: "manual" }),
          completed_at_ms: 3, source_plan_working_set_target_id: null,
          source_owned_plan_working_set_target_id: null, rule_type: "load_reps", rule_version: 1,
        }];
        if (sql.includes("FROM workout_sessions prior_session")) return [{ observed_json: "{}" }];
        return [];
      },
    } as never);
    await expect(repository.getSessionDetail("current")).resolves.toMatchObject({
      exercises: [{ workingSets: [{ previousObservation: null }] }],
    });
  });

  it("rejects a partial explicit envelope at the public command boundary", () => {
    const actual = jest.requireActual<typeof import("../../domains/progression/recommendationCommands")>(
      "../../domains/progression/recommendationCommands",
    );
    expect(() => actual.validateRecommendationDecisionInput({
      recommendationId: "recommendation",
      decision: "use_target",
      decidedAtMs: 1,
    })).toThrow("recommendation_decision_input_invalid");
  });

  it("derives deterministic fences and hash-bound receipts for legacy bare callers", async () => {
    const rejected: RecommendationDecisionResult = {
      recommendationId: "recommendation",
      status: "rejected",
    };
    const legacy = repositoryFor((sql) => {
      if (sql.includes("FROM sqlite_master")) return [{ count: 2 }];
      if (sql.includes("FROM progression_recommendation_decision_receipts")
        || sql.includes("FROM owned_progression_recommendation_decision_receipts")) return [];
      if (sql.includes("FROM progression_recommendations")) {
        return [{ ...recommendation, target_graph: "legacy" }];
      }
      return [];
    });
    await expect(legacy.repository.keepCurrentTarget({
      recommendationId: "recommendation",
      decidedAtMs: 1,
    })).resolves.toEqual(rejected);
    const legacyRequestId = `recommendation_decision_${await runtimeSha256(JSON.stringify({
      decision: "keep_current_target",
      evidenceVersion: recommendation.evidence_version,
      recommendationId: recommendation.id,
      sourceRevision: recommendation.source_revision,
      targetRevision: recommendation.target_revision,
    }))}`;
    const legacyRequestSha256 = await runtimeSha256(canonicalRecommendationDecisionRequest({
      recommendationId: recommendation.id,
      requestId: legacyRequestId,
      decision: "keep_current_target",
      expectedEvidenceVersion: recommendation.evidence_version,
      expectedSourceRevision: recommendation.source_revision,
      expectedTargetRevision: recommendation.target_revision,
      decidedAtMs: 1,
    }));
    expect(legacy.execute).toHaveBeenCalledWith(
      expect.stringContaining("progression_recommendation_decision_receipts"),
      [legacyRequestId, legacyRequestSha256, recommendation.id, "keep_current_target", JSON.stringify(rejected), 1],
    );

    const owned = repositoryFor((sql) => {
      if (sql.includes("FROM progression_recommendation_decision_receipts")
        || sql.includes("FROM owned_progression_recommendation_decision_receipts")) return [];
      if (sql.includes("PRAGMA table_info(session_sets)")) {
        return [{ name: "source_owned_plan_working_set_target_id" }];
      }
      if (sql.includes("name IN")) return [{ count: 2 }];
      if (sql.includes("FROM sqlite_master")) return [{ count: 1 }];
      if (sql.includes("FROM progression_recommendations")) return [];
      if (sql.includes("FROM owned_progression_recommendations")) {
        return [{ ...recommendation, target_graph: "owned" }];
      }
      return [];
    });
    await expect(owned.repository.keepCurrentTarget({
      recommendationId: "recommendation",
      decidedAtMs: 1,
    })).resolves.toEqual(rejected);
    expect(owned.execute).toHaveBeenCalledWith(
      expect.stringContaining("owned_progression_recommendation_decision_receipts"),
      expect.any(Array),
    );
  });

  it("fails stale resume, skip, effort, and revision commands at every compare-and-swap boundary", async () => {
    const session = (status: string, revision = 1) => ({
      id: "session", source: "manual", status, plan_id: null, plan_day_id: null,
      local_date: "2026-10-13", timezone: "Asia/Singapore", started_at_ms: 1,
      completed_at_ms: status === "in_progress" ? null : 2, revision,
      modified_from_plan: 0, plan_name: null, day_name: null,
      effective_revision: null, lifecycle: null, snapshot_json: null,
    });
    const resumeInput = { sessionId: "session", expectedSessionRevision: 1, resumedAtMs: 3 };
    const completed = createWorkoutOutcomeRepository({
      write: async (operation: any) => operation({
        queryAll: async (sql: string) => sql.includes("SELECT ws.id") ? [session("completed")] : [],
        execute: async () => ({ changes: 1 }),
      }),
    } as never);
    await expect(completed.resumePartialWorkout(resumeInput)).rejects.toThrow("resume_partial_conflict");

    const staleResume = createWorkoutOutcomeRepository({
      write: async (operation: any) => operation({
        queryAll: async (sql: string) => sql.includes("SELECT ws.id") ? [session("partial")] : [],
        execute: async (sql: string) => ({ changes: sql.includes("UPDATE workout_sessions") ? 0 : 1 }),
      }),
    } as never);
    await expect(staleResume.resumePartialWorkout(resumeInput)).rejects.toThrow("resume_partial_conflict");

    const skipInput = {
      sessionId: "session", sessionExerciseId: "exercise", expectedSessionRevision: 1,
      expectedExerciseRevision: 1, confirmation: "skip_exercise" as const, nowMs: 4,
    };
    const skipRepository = (exerciseUpdate: number, sessionUpdate: number) => createWorkoutOutcomeRepository({
      write: async (operation: any) => operation({
        queryAll: async (sql: string) => {
          if (sql.includes("SELECT ws.id")) return [session("in_progress")];
          if (sql.includes("FROM session_exercises") && sql.includes("WHERE id = ?")) {
            return [{ id: "exercise", status: "planned", revision: 1 }];
          }
          return [];
        },
        execute: async (sql: string) => ({
          changes: sql.includes("UPDATE session_exercises")
            ? exerciseUpdate
            : sql.includes("active_session_exercise_id") ? sessionUpdate : 1,
        }),
      }),
    } as never);
    const missingExercise = createWorkoutOutcomeRepository({
      write: async (operation: any) => operation({
        queryAll: async (sql: string) => {
          if (sql.includes("SELECT ws.id")) return [session("in_progress")];
          return [];
        },
        execute: async () => ({ changes: 1 }),
      }),
    } as never);
    await expect(missingExercise.skipExercise(skipInput)).rejects.toThrow("skip_exercise_conflict");
    await expect(skipRepository(0, 1).skipExercise(skipInput)).rejects.toThrow("skip_exercise_conditional_update_failed");
    await expect(skipRepository(1, 0).skipExercise(skipInput)).rejects.toThrow("skip_exercise_session_update_failed");

    const effortInput = {
      sessionId: "session", sessionExerciseId: "exercise", expectedExerciseRevision: 1,
      effort: "on_target" as const, recordedAtMs: 5,
    };
    const effortRepository = (
      sessionRows: readonly Record<string, unknown>[],
      exerciseChanges: number,
      currentEffort: string | null,
      sessionChanges = 1,
    ) => createWorkoutOutcomeRepository({
      write: async (operation: any) => operation({
        queryAll: async (sql: string) => {
          if (sql.includes("SELECT status, revision FROM workout_sessions")) return sessionRows;
          if (sql.includes("SELECT effort FROM session_exercises")) return [{ effort: currentEffort }];
          return [];
        },
        execute: async (sql: string) => ({ changes: sql.includes("UPDATE session_exercises") ? exerciseChanges : sessionChanges }),
      }),
    } as never);
    await expect(effortRepository([], 0, null).recordExerciseEffort(effortInput))
      .rejects.toThrow("exercise_effort_session_invalid");
    await expect(effortRepository([{ status: "completed", revision: 1 }], 0, null).recordExerciseEffort(effortInput))
      .rejects.toThrow("exercise_effort_conflict");
    await expect(effortRepository([{ status: "completed", revision: 1 }], 0, "hard").recordExerciseEffort(effortInput))
      .rejects.toThrow("exercise_effort_already_recorded");
    await expect(effortRepository([{ status: "completed", revision: 1 }], 1, null, 0).recordExerciseEffort(effortInput))
      .rejects.toThrow("exercise_effort_session_update_failed");

    const revisions = createWorkoutOutcomeRepository({
      queryAll: async (_sql: string, parameters?: readonly unknown[]) => parameters?.[0] === "present" ? [{ revision: 7 }] : [],
    } as never);
    await expect(revisions.currentSessionRevision("present")).resolves.toBe(7);
    await expect(revisions.currentSessionRevision("missing")).resolves.toBeNull();
  });
});
