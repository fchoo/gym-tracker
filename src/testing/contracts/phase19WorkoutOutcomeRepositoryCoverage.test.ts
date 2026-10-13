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
import { createWorkoutOutcomeRepository } from "../../platform/sqlite/repositories/workoutOutcomeRepository";

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
});
