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
