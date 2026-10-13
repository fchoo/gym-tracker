import {
  describe,
  expect,
  test,
} from "@jest/globals";

import {
  RunningBoundaryError,
  evaluateRunningReadiness,
  parseRunningGoal,
  parseRunningPlanAggregate,
  parseRunningSessionRevision,
  runningSessionReadback,
  runningSessionRevisionReadback,
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
    ["long_run", { finish: "easy_throughout" }],
    ["progression", { stages: 3, startTarget: { rpe: 4 }, finishTarget: { paceMsPerKm: 300_000 } }],
    ["tempo", { format: "continuous", work: { durationMs: 1_200_000 } }],
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
    expect(() => parseRunningSessionRevision({ ...base, sessionKind: "progression", contextual: { stages: 1, startTarget: { rpe: 4 }, finishTarget: { rpe: 7 } } })).toThrow(RunningBoundaryError);
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
    expect(parseRunningGoal({
      ...goal,
      id: "goal-2point4",
      goalDistanceMeters: 2_400,
    }).targetDurationMs).toBe(660_000);

    expect(() => parseRunningSessionRevision({
      ...base,
      sessionKind: "tempo",
      contextual: { format: "continuous", work: { durationMs: 600_000 } },
      advisoryTarget: { paceMsPerKm: 300_000, heartRateZone: 3, rpe: 7 },
    })).not.toThrow();
    expect(() => parseRunningSessionRevision({
      ...base,
      sessionKind: "tempo",
      contextual: { format: "continuous", work: { durationMs: 600_000 } },
      advisoryTarget: { heartRateZone: 6 },
    })).toThrow(RunningBoundaryError);
  });

  test("rejects duplicate phase and step ordinals while covering every goal and readiness outcome", () => {
    expect(() => parseRunningSessionRevision({ ...base, sessionKind: "recovery", contextual: {}, phases: [{ ...base.phases[0] }, { ...base.phases[0] }] })).toThrow(RunningBoundaryError);
    expect(() => parseRunningSessionRevision({ ...base, sessionKind: "recovery", contextual: {}, phases: [{ ...base.phases[0], steps: [{ ...base.phases[0].steps[0] }, { ...base.phases[0].steps[0] }] }] })).toThrow(RunningBoundaryError);
    expect(() => parseRunningGoal({ version: 1, id: "goal-1", planId: "plan-running", revision: 1, goalDistanceMeters: 5000, trainingDays: ["Monday", "Monday"], createdAtMs: 1 })).toThrow(RunningBoundaryError);
    expect(() => parseRunningGoal({ version: 1, id: "goal-1", planId: "plan-running", revision: 1, goalDistanceMeters: 5000, trainingDays: ["Monday"], createdAtMs: -1 })).toThrow(RunningBoundaryError);
    expect(evaluateRunningReadiness({ hasRecoveryRevision: false, slotCount: 1 })).toEqual({ ready: false, reason: "missing_recovery" });
    expect(evaluateRunningReadiness({ hasRecoveryRevision: true, slotCount: 0 })).toEqual({ ready: false, reason: "missing_slots" });
    expect(evaluateRunningReadiness({ hasRecoveryRevision: true, slotCount: 1 })).toEqual({ ready: true, reason: "ready" });
  });

  test("keeps unstructured Fartlek cues bounded and excludes structured quantities", () => {
    expect(parseRunningSessionRevision({
      ...base, id: "revision-fartlek-cues", rootId: "root-fartlek-cues", sessionKind: "fartlek", phases: [],
      advisoryTarget: { heartRateZone: 3 },
      contextual: { format: "unstructured", repetitions: 4, fastCue: "lamp posts", easyRecoveryCue: "easy to bridge" },
    })).toMatchObject({ contextual: { format: "unstructured", repetitions: 4, fastCue: "lamp posts", easyRecoveryCue: "easy to bridge" } });
    expect(() => parseRunningSessionRevision({
      ...base, id: "revision-fartlek-invalid", rootId: "root-fartlek-invalid", sessionKind: "fartlek", phases: [],
      contextual: { format: "unstructured", repetitions: 4, fastCue: "x".repeat(121), easyRecoveryCue: "easy", work: { durationMs: 60_000 } },
    })).toThrow(RunningBoundaryError);
  });

  test("rejects malformed aggregate ownership, session roots, and slot membership", () => {
    const entry = {
      slot: { id: "slot-v1", rootId: "slot", weekday: "Monday" as const, revision: 1, ordinal: 0 },
      session: parseRunningSessionRevision({ ...base, sessionKind: "recovery", contextual: {} }),
    };
    const aggregate = {
      version: 1 as const,
      id: "plan-running",
      name: "Running",
      revision: 1,
      active: false,
      lifecycle: "inactive" as const,
      createdAtMs: 1,
      goal: {
        version: 1 as const,
        id: "goal-v1",
        planId: "plan-running",
        revision: 1,
        goalDistanceMeters: 5_000,
        trainingDays: ["Monday" as const],
        createdAtMs: 1,
      },
      sessions: [entry],
    };
    expect(parseRunningPlanAggregate(aggregate)).toMatchObject({
      id: "plan-running",
      sessions: [entry],
    });
    expect(runningSessionReadback(entry)).toBe("5000 m · easy No target");
    expect(() => parseRunningPlanAggregate({ ...aggregate, name: "" })).toThrow(RunningBoundaryError);
    expect(() => parseRunningPlanAggregate({ ...aggregate, lifecycle: "unknown" })).toThrow(RunningBoundaryError);
    expect(() => parseRunningPlanAggregate({ ...aggregate, active: true })).toThrow(RunningBoundaryError);
    expect(() => parseRunningPlanAggregate({
      ...aggregate,
      goal: { ...aggregate.goal, planId: "other-plan" },
    })).toThrow(RunningBoundaryError);
    expect(() => parseRunningPlanAggregate({
      ...aggregate,
      sessions: [entry, {
        slot: { ...entry.slot, id: "slot-v2", rootId: "slot-2", weekday: "Thursday" as const },
        session: { ...entry.session, id: "revision-recovery-2" },
      }],
    })).toThrow(RunningBoundaryError);
    expect(() => parseRunningPlanAggregate({
      ...aggregate,
      sessions: [{ ...entry, slot: { ...entry.slot, weekday: "Funday" as never } }],
    })).toThrow(RunningBoundaryError);
    expect(() => parseRunningPlanAggregate({
      ...aggregate,
      sessions: [entry, {
        slot: { ...entry.slot, id: "slot-v2", rootId: "slot-2" },
        session: { ...entry.session, id: "revision-recovery-2", rootId: "root-recovery-2" },
      }],
    })).toThrow(RunningBoundaryError);
  });

  test.each([
    [
      { ...base, sessionKind: "recovery", advisoryTarget: { paceMsPerKm: 300_000 }, contextual: {} },
      "5000 m · easy 5:00 / km",
    ],
    [
      { ...base, sessionKind: "long_run", advisoryTarget: { heartRateZone: 2 }, contextual: { finish: "steady_finish" } },
      "5000 m · Z2 · steady finish",
    ],
    [
      { ...base, sessionKind: "progression", contextual: { stages: 3, startTarget: { rpe: 4 }, finishTarget: { paceMsPerKm: 290_000 } } },
      "5000 m · 3 stages · RPE 4 → 4:50 / km",
    ],
    [
      { ...base, phases: [], sessionKind: "tempo", advisoryTarget: { rpe: 6 }, contextual: { format: "continuous", work: { durationMs: 1_200_000 } } },
      "continuous 20 min · RPE 6",
    ],
    [
      { ...base, phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "duration", durationMs: 600_000 }] }], sessionKind: "tempo", advisoryTarget: { rpe: 6 }, contextual: { format: "tempo_repeats", repetitions: 3, work: { durationMs: 300_000 }, recovery: { distanceMeters: 400 } } },
      "3 × 5 min · recovery 400 m · RPE 6",
    ],
    [
      { ...base, phases: [], sessionKind: "intervals", advisoryTarget: { heartRateZone: 4 }, contextual: { repetitions: 6, work: { distanceMeters: 400 }, recovery: { durationMs: 60_000 } } },
      "6 × 400 m · recovery 1 min · Z4",
    ],
    [
      { ...base, phases: [], sessionKind: "hills", advisoryTarget: { rpe: 8 }, contextual: { repetitions: 6, work: { distanceMeters: 200 }, returnRecovery: { durationMs: 120_000 } } },
      "6 × uphill 200 m · return recovery 2 min · RPE 8",
    ],
    [
      { ...base, phases: [], sessionKind: "fartlek", advisoryTarget: { rpe: 7 }, contextual: { format: "structured", repetitions: 5, work: { distanceMeters: 800 }, recovery: { durationMs: 60_000 } } },
      "5 × 800 m · easy 1 min · RPE 7",
    ],
    [
      { ...base, phases: [], sessionKind: "fartlek", advisoryTarget: { heartRateZone: 3 }, contextual: { format: "unstructured", repetitions: 4, fastCue: "lamp posts", easyRecoveryCue: "easy to bridge" } },
      "4 surges · lamp posts · recover easy to bridge · Z3",
    ],
  ])("formats source-backed Running target facts for %#", (input, expected) => {
    expect(runningSessionRevisionReadback(parseRunningSessionRevision(input))).toBe(expected);
  });
});
