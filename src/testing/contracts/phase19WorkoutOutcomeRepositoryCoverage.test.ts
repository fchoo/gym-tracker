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
    const duplicate = repositoryFor((sql) =>
      sql.includes("recommendation_decision_receipts")
        ? [{ request_sha256: "a".repeat(64), result_json: "{}" }]
        : []);
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
      if (sql.includes("FROM progression_recommendation_decision_receipts")) {
        return [{ request_sha256: requestSha256, result_json: "{}" }];
      }
      return [];
    });
    await expect(malformed.repository.acceptRecommendation(request))
      .rejects.toThrow("recommendation_receipt_invalid");
  });

  it("rejects an explicit envelope without request identity", async () => {
    const source = repositoryFor(() => []);
    await expect(source.repository.acceptRecommendation({
      recommendationId: "recommendation",
      decision: "use_target",
      decidedAtMs: 1,
    } as never)).rejects.toThrow("recommendation_request_identity_missing");
  });

  it("uses retained recommendation fences when an explicit request omits optional fences", async () => {
    const legacy = repositoryFor((sql) => {
      if (sql.includes("FROM progression_recommendation_decision_receipts")
        || sql.includes("FROM owned_progression_recommendation_decision_receipts")) return [];
      if (sql.includes("FROM progression_recommendations")) {
        return [{ ...recommendation, target_graph: "legacy" }];
      }
      return [];
    });
    await expect(legacy.repository.keepCurrentTarget({
      recommendationId: "recommendation",
      requestId: "legacy-request",
      decidedAtMs: 1,
    } as never)).resolves.toEqual({
      recommendationId: "recommendation",
      status: "superseded",
    });

    const owned = repositoryFor((sql) => {
      if (sql.includes("recommendation_decision_receipts")) return [];
      if (sql.includes("PRAGMA table_info(session_sets)")) {
        return [{ name: "source_owned_plan_working_set_target_id" }];
      }
      if (sql.includes("FROM sqlite_master")) return [{ count: 1 }];
      if (sql.includes("FROM progression_recommendations")) return [];
      if (sql.includes("FROM owned_progression_recommendations")) {
        return [{ ...recommendation, target_graph: "owned" }];
      }
      return [];
    });
    await expect(owned.repository.keepCurrentTarget({
      recommendationId: "recommendation",
      requestId: "owned-request",
      decidedAtMs: 1,
    } as never)).resolves.toEqual({
      recommendationId: "recommendation",
      status: "superseded",
    });
    expect(owned.execute).toHaveBeenCalledWith(
      expect.stringContaining("owned_progression_recommendation_decision_receipts"),
      expect.any(Array),
    );
  });
});
