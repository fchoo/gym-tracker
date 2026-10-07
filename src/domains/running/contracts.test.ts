import {
  describe,
  expect,
  test,
} from "@jest/globals";

import {
  RunningBoundaryError,
  parseRunningGoal,
  parseRunningSessionRevision,
} from "./contracts";

const base = {
  version: 1,
  id: "revision-recovery-1",
  rootId: "root-recovery",
  planId: "plan-running",
  revision: 1,
  createdAtMs: 1,
  phases: [{
    ordinal: 0,
    kind: "work",
    steps: [{ ordinal: 0, kind: "distance", distanceMeters: 5_000 }],
  }],
} as const;

describe("Running source contracts", () => {
  test.each([
    ["recovery", {}],
    ["long_run", {}],
    ["progression", { stages: [{ ordinal: 0, distanceMeters: 1_000, pace: "easy" }] }],
    ["tempo", { format: "continuous", durationMs: 1_200_000 }],
    ["intervals", { repetitions: 4, work: { durationMs: 180_000 }, recovery: { durationMs: 90_000 } }],
    ["hills", { repetitions: 6, work: { distanceMeters: 200 }, returnRecovery: { durationMs: 120_000 } }],
    ["fartlek", { format: "structured", repetitions: 5, work: { durationMs: 60_000 }, recovery: { durationMs: 60_000 } }],
  ])("accepts %s only with its contextual shape", (sessionKind, contextual) => {
    expect(parseRunningSessionRevision({ ...base, id: `revision-${sessionKind}-1`, rootId: `root-${sessionKind}`, sessionKind, contextual })).toMatchObject({ sessionKind, contextual });
  });

  test("rejects cross-kind contextual fields, non-SI quantities, and unknown keys", () => {
    expect(() => parseRunningSessionRevision({
      ...base,
      sessionKind: "recovery",
      contextual: { repetitions: 4, work: { durationMs: 60_000 }, recovery: { durationMs: 60_000 } },
    })).toThrow(RunningBoundaryError);
    expect(() => parseRunningSessionRevision({
      ...base,
      phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "distance", distanceMeters: 1.5 }] }],
    })).toThrow(RunningBoundaryError);
    expect(() => parseRunningSessionRevision({ ...base, sessionKind: "long_run", contextual: {}, gender: "female" })).toThrow(RunningBoundaryError);
  });

  test("preserves optional owner facts as absent and validates advisory targets", () => {
    const goal = parseRunningGoal({
      version: 1,
      id: "goal-1",
      planId: "plan-running",
      revision: 1,
      goalDistanceMeters: 10_000,
      benchmark: { source: "owner_selected", distanceMeters: 2_400, durationMs: 660_000, localDate: "2026-10-07" },
      trainingDays: ["Monday", "Thursday", "Saturday"],
      createdAtMs: 1,
    });
    expect(goal.targetDurationMs).toBeUndefined();
    expect(goal.targetLocalDate).toBeUndefined();
    expect(goal.benchmarks?.tenKilometres).toBeUndefined();
    expect(goal.benchmarks?.halfMarathon).toBeUndefined();

    expect(() => parseRunningSessionRevision({
      ...base,
      sessionKind: "tempo",
      contextual: { format: "continuous", durationMs: 600_000 },
      advisoryTarget: { paceMsPerKm: 300_000, heartRateZone: 3, rpe: 7 },
    })).not.toThrow();
    expect(() => parseRunningSessionRevision({
      ...base,
      sessionKind: "tempo",
      contextual: { format: "continuous", durationMs: 600_000 },
      advisoryTarget: { heartRateZone: 6 },
    })).toThrow(RunningBoundaryError);
  });
});
