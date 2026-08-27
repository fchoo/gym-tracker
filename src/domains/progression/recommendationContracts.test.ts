import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  RecommendationEvidenceError,
  parseActionableRecommendationEvidence,
} from "./recommendationContracts";

const evidence = {
  version: 2,
  rule: {
    id: "load_reps.double_progression.v1",
    version: 1,
  },
  metricIdentity: {
    profile: "load_reps",
    contractVersion: 1,
    exerciseMetricGeneration: 1,
  },
  source: {
    sessionId: "session-1",
    sessionExerciseId: "session-exercise-1",
    sessionRevision: 4,
    setIds: ["set-1", "set-2"],
  },
  revisions: { source: 4, target: 6 },
  targetScope: [
    { id: "target-1", revision: 6 },
    { id: "target-2", revision: 6 },
  ],
  currentTarget: {
    version: 1,
    profile: "load_reps",
    loadGrams: 40_000,
    minReps: 8,
    maxReps: 10,
    incrementGrams: 2_500,
    perSide: false,
  },
  proposedTarget: {
    version: 1,
    profile: "load_reps",
    loadGrams: 42_500,
    minReps: 8,
    maxReps: 10,
    incrementGrams: 2_500,
    perSide: false,
  },
  decision: "increase",
  reasonCode: "increase_all_qualified_sets_at_upper_bound",
  reason: "All qualifying sets reached the upper bound",
  confidence: "high",
  lifecycle: { state: "pending", createdAtMs: 1_786_853_900_000 },
} as const;

describe("actionable recommendation evidence contract", () => {
  it("accepts an exact versioned evidence envelope", () => {
    expect(parseActionableRecommendationEvidence({
      evidence,
      expected: {
        rule: { id: "load_reps.double_progression.v1", version: 1 },
        metricIdentity: evidence.metricIdentity,
        sourceRevision: 4,
        targetRevision: 6,
        targetId: "target-1",
        sourceSessionRevision: 4,
        currentTarget: evidence.currentTarget,
        proposedTarget: evidence.proposedTarget,
        createdAtMs: 1_786_853_900_000,
      },
    })).toEqual(evidence);
  });

  it("accepts durable entity identifiers longer than a rule identifier", () => {
    const longId = `owned-session-exercise-${"x".repeat(256)}`;
    const longEvidence = {
      ...evidence,
      source: {
        ...evidence.source,
        sessionExerciseId: longId,
        setIds: [longId],
      },
      targetScope: [{ id: longId, revision: 6 }],
    };
    expect(parseActionableRecommendationEvidence({
      evidence: longEvidence,
      expected: {
        rule: { id: "load_reps.double_progression.v1", version: 1 },
        metricIdentity: evidence.metricIdentity,
        sourceRevision: 4,
        targetRevision: 6,
        targetId: longId,
        sourceSessionRevision: 4,
        currentTarget: evidence.currentTarget,
        proposedTarget: evidence.proposedTarget,
        createdAtMs: 1_786_853_900_000,
      },
    })).toEqual(longEvidence);
  });

  it("accepts an immutable source session without a live revision expectation", () => {
    expect(parseActionableRecommendationEvidence({
      evidence: {
        ...evidence,
        source: { ...evidence.source, sessionRevision: 999 },
      },
      expected: {
        rule: { id: "load_reps.double_progression.v1", version: 1 },
        metricIdentity: evidence.metricIdentity,
        sourceRevision: 4,
        targetRevision: 6,
        targetId: "target-1",
        currentTarget: evidence.currentTarget,
        proposedTarget: evidence.proposedTarget,
        createdAtMs: 1_786_853_900_000,
      },
    })).toMatchObject({
      source: { sessionRevision: 999 },
    });
  });

  it("rejects an invalid caller-side expectation before reading evidence", () => {
    expect(() => parseActionableRecommendationEvidence({
      evidence,
      expected: {
        rule: { id: " ", version: 1 },
        metricIdentity: evidence.metricIdentity,
        sourceRevision: 4,
        targetRevision: 6,
        targetId: "target-1",
        sourceSessionRevision: 4,
        currentTarget: evidence.currentTarget,
        proposedTarget: evidence.proposedTarget,
        createdAtMs: 1_786_853_900_000,
      },
    })).toThrow("recommendation_evidence_invalid");
  });

  it.each([
    ["a stale rule version", { ...evidence, rule: { ...evidence.rule, version: 2 } }],
    ["an identity mismatch", {
      ...evidence,
      metricIdentity: { ...evidence.metricIdentity, exerciseMetricGeneration: 2 },
    }],
    ["a missing source set identity", {
      ...evidence,
      source: { ...evidence.source, setIds: [] },
    }],
    ["a stale target revision", {
      ...evidence,
      revisions: { ...evidence.revisions, target: 7 },
    }],
    ["a stale source session revision", {
      ...evidence,
      source: { ...evidence.source, sessionRevision: 5 },
    }],
    ["a target scope without the stored target revision", {
      ...evidence,
      targetScope: [{ id: "target-1", revision: 7 }],
    }],
    ["a malformed proposed target", {
      ...evidence,
      proposedTarget: { ...evidence.proposedTarget, loadGrams: -1 },
    }],
  ] as const)("rejects %s", (...parameters) => {
    const [, invalidEvidence] = parameters;
    expect(() => parseActionableRecommendationEvidence({
      evidence: invalidEvidence,
      expected: {
        rule: { id: "load_reps.double_progression.v1", version: 1 },
        metricIdentity: evidence.metricIdentity,
        sourceRevision: 4,
        targetRevision: 6,
        targetId: "target-1",
        sourceSessionRevision: 4,
        currentTarget: evidence.currentTarget,
        proposedTarget: evidence.proposedTarget,
        createdAtMs: 1_786_853_900_000,
      },
    })).toThrow(RecommendationEvidenceError);
  });
});
