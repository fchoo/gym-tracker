import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  acceptRecommendation,
  keepCurrentTarget,
  recordExerciseEffort,
  type ProgressionRepository,
} from "./recommendationCommands";

function repository(): ProgressionRepository {
  return {
    recordExerciseEffort: jest.fn<
      ProgressionRepository["recordExerciseEffort"]
    >(async (input) => ({
      sessionExerciseId: input.sessionExerciseId,
      effort: input.effort,
      revision: input.expectedExerciseRevision + 1,
    })),
    acceptRecommendation: jest.fn<
      ProgressionRepository["acceptRecommendation"]
    >(async (input) => ({
      recommendationId: input.recommendationId,
      status: "accepted" as const,
    })),
    keepCurrentTarget: jest.fn<
      ProgressionRepository["keepCurrentTarget"]
    >(async (input) => ({
      recommendationId: input.recommendationId,
      status: "rejected" as const,
    })),
    generateRecommendationsForSession: jest.fn(async () => 0),
    currentSessionRevision: jest.fn(async () => 1),
  };
}

describe("Plan 01-10 recommendation commands", () => {
  it("delegates effort and both decisions", async () => {
    const port = repository();
    await recordExerciseEffort({
      repository: port,
      input: {
        sessionId: "session-1",
        sessionExerciseId: "exercise-1",
        expectedExerciseRevision: 1,
        effort: "easy",
        recordedAtMs: 2_000,
      },
    });
    await acceptRecommendation({
      repository: port,
      input: { recommendationId: "recommendation-1", decidedAtMs: 3_000 },
    });
    await keepCurrentTarget({
      repository: port,
      input: { recommendationId: "recommendation-2", decidedAtMs: 3_000 },
    });
    expect(port.recordExerciseEffort).toHaveBeenCalledTimes(1);
    expect(port.acceptRecommendation).toHaveBeenCalledTimes(1);
    expect(port.keepCurrentTarget).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid revisions and timestamps", () => {
    const port = repository();
    expect(() => recordExerciseEffort({
      repository: port,
      input: {
        sessionId: "session-1",
        sessionExerciseId: "exercise-1",
        expectedExerciseRevision: -1,
        effort: "easy",
        recordedAtMs: 2_000,
      },
    })).toThrow("exercise_effort_input_invalid");
    expect(() => acceptRecommendation({
      repository: port,
      input: { recommendationId: "recommendation-1", decidedAtMs: -1 },
    })).toThrow("recommendation_decision_input_invalid");
    expect(() => keepCurrentTarget({
      repository: port,
      input: { recommendationId: "recommendation-1", decidedAtMs: -1 },
    })).toThrow("recommendation_decision_input_invalid");
  });
});
