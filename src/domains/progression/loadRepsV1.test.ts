import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  evaluateLoadRepsV1,
  type LoadRepsProgressionInput,
} from "./loadRepsV1";

function input(
  repetitions: readonly number[],
  effort: LoadRepsProgressionInput["effort"],
  overrides: Partial<LoadRepsProgressionInput> = {},
): LoadRepsProgressionInput {
  return {
    version: 1,
    rule: "load_reps.double_progression.v1",
    target: {
      version: 1,
      profile: "load_reps",
      loadGrams: 60_000,
      minReps: 6,
      maxReps: 8,
      incrementGrams: 2_500,
      plannedSets: 3,
    },
    sets: repetitions.map((reps, index) => ({
      id: `working-${index + 1}`,
      kind: "working" as const,
      status: "completed" as const,
      profile: "load_reps" as const,
      version: 1 as const,
      loadGrams: 60_000,
      reps,
    })),
    effort,
    ...overrides,
  };
}

describe("load_reps.double_progression.v1", () => {
  it("uses a baseline repeat when no comparable exposure exists", () => {
    expect(evaluateLoadRepsV1(input([], null))).toMatchObject({
      decision: "baseline",
      reason: "No comparable working-set history",
      proposed: {
        loadGrams: 60_000,
        targetReps: [6, 6, 6],
      },
    });
  });

  it("holds 60 kg and targets 8/8/8 for the locked 8/8/7 fixture", () => {
    expect(evaluateLoadRepsV1(input([8, 8, 7], "on_target"))).toEqual(
      expect.objectContaining({
        decision: "hold",
        reason: "One more repetition completes the range",
        proposed: {
          loadGrams: 60_000,
          targetReps: [8, 8, 8],
        },
        evidence: expect.objectContaining({
          comparableReps: [8, 8, 7],
          excludedWarmups: 0,
        }),
      }),
    );
  });

  it.each([
    {
      effort: null,
      decision: "hold",
      reason: "Effort not recorded",
      loadGrams: 60_000,
      targetReps: [8, 8, 8],
    },
    {
      effort: "easy",
      decision: "increase",
      reason: "All working sets reached the range",
      loadGrams: 62_500,
      targetReps: [6, 6, 6],
    },
    {
      effort: "on_target",
      decision: "increase",
      reason: "All working sets reached the range",
      loadGrams: 62_500,
      targetReps: [6, 6, 6],
    },
    {
      effort: "hard",
      decision: "hold",
      reason: "Hard effort recorded",
      loadGrams: 60_000,
      targetReps: [8, 8, 8],
    },
    {
      effort: "failed",
      decision: "retry",
      reason: "Retry the current target",
      loadGrams: 60_000,
      targetReps: [8, 8, 8],
    },
  ] as const)(
    "maps full upper-bound effort $effort to a bounded decision",
    ({ effort, decision, reason, loadGrams, targetReps }) => {
      expect(evaluateLoadRepsV1(input([8, 8, 8], effort))).toMatchObject({
        decision,
        reason,
        proposed: { loadGrams, targetReps: [...targetReps] },
      });
    },
  );

  it("excludes warm-ups and refuses an increase for incomplete exposure", () => {
    const result = evaluateLoadRepsV1(input([8, 8], "easy", {
      sets: [
        {
          id: "warmup-1",
          kind: "warmup",
          status: "completed",
          profile: "load_reps",
          version: 1,
          loadGrams: 20_000,
          reps: 10,
        },
        ...input([8, 8], "easy").sets,
        {
          id: "working-3",
          kind: "working",
          status: "planned",
          profile: "load_reps",
          version: 1,
          loadGrams: 60_000,
          reps: null,
        },
      ],
    }));

    expect(result).toMatchObject({
      decision: "retry",
      reason: "Planned working sets are incomplete",
      proposed: {
        loadGrams: 60_000,
        targetReps: [8, 8, 8],
      },
      evidence: {
        comparableReps: [8, 8],
        excludedWarmups: 1,
      },
    });
  });

  it.each([
    {
      profile: "timed_hold" as const,
      version: 1 as const,
      loadGrams: 60_000,
      reps: 8,
    },
    {
      profile: "load_reps" as const,
      version: 2 as const,
      loadGrams: 60_000,
      reps: 8,
    },
  ])("never treats mismatched profile/version as increase evidence", (set) => {
    expect(evaluateLoadRepsV1(input([], "easy", {
      sets: [{
        id: "mismatch",
        kind: "working",
        status: "completed",
        ...set,
      }],
    }))).toMatchObject({
      decision: "manual",
      reason: "Working-set evidence is not comparable",
    });
  });

  it.each([
    {
      label: "a skipped planned set",
      sets: [{
        id: "working-skipped",
        kind: "working" as const,
        status: "skipped" as const,
        profile: "load_reps",
        version: 1,
        loadGrams: 60_000,
        reps: null,
      }],
      reasonCode: "retry_incomplete_working_sets",
    },
    {
      label: "a draft planned set",
      sets: [{
        id: "working-draft",
        kind: "working" as const,
        status: "draft" as const,
        profile: "load_reps",
        version: 1,
        loadGrams: 60_000,
        reps: null,
      }],
      reasonCode: "retry_incomplete_working_sets",
    },
  ])("returns a retry with stable evidence for $label", ({ sets, reasonCode }) => {
    const base = input([8, 8], "easy");
    expect(evaluateLoadRepsV1({
      ...base,
      sets: [...base.sets, ...sets],
    })).toMatchObject({
      decision: "retry",
      reasonCode,
      evidence: expect.objectContaining({
        incompleteWorkingSets: 1,
        qualifiedWorkingSets: 2,
      }),
    });
  });

  it("keeps a below-range result explicit and never invents a lower target", () => {
    expect(evaluateLoadRepsV1(input([5, 5, 7], "easy"))).toMatchObject({
      decision: "retry",
      reasonCode: "retry_repeated_below_range",
      proposed: {
        loadGrams: 60_000,
        targetReps: [8, 8, 8],
      },
      evidence: expect.objectContaining({ belowRangeWorkingSets: 2 }),
    });
  });

  it("uses the explicit available equipment increment instead of the copied target default", () => {
    const base = input([8, 8, 8], "easy");
    expect(evaluateLoadRepsV1({
      ...base,
      target: {
        ...base.target,
        availableIncrementGrams: 5_000,
      },
    })).toMatchObject({
      decision: "increase",
      proposed: { loadGrams: 65_000, targetReps: [6, 6, 6] },
      evidence: expect.objectContaining({
        availableEquipmentIncrementGrams: 5_000,
      }),
    });
  });

  it.each([0, -1, 2.5])(
    "returns manual rather than inventing a target when the available increment is unusable: %s",
    (availableIncrementGrams) => {
      const base = input([8, 8, 8], "easy");
      expect(evaluateLoadRepsV1({
        ...base,
        target: {
          ...base.target,
          availableIncrementGrams,
        },
      })).toMatchObject({
        decision: "manual",
        reasonCode: "manual_equipment_increment_unavailable",
        proposed: { loadGrams: 60_000, targetReps: [8, 8, 8] },
      });
    },
  );

  it("rejects every invalid target contract before evaluating evidence", () => {
    const base = input([8, 8, 8], "easy");
    const invalidInputs = [
      { ...base, version: 2 },
      { ...base, rule: "load_reps.unknown" },
      { ...base, target: { ...base.target, version: 2 } },
      { ...base, target: { ...base.target, profile: "timed_hold" } },
      { ...base, target: { ...base.target, loadGrams: -1 } },
      { ...base, target: { ...base.target, minReps: 0 } },
      { ...base, target: { ...base.target, maxReps: 0 } },
      { ...base, target: { ...base.target, minReps: 9, maxReps: 8 } },
      { ...base, target: { ...base.target, plannedSets: 0 } },
    ];

    for (const invalid of invalidInputs) {
      expect(() => evaluateLoadRepsV1(
        invalid as LoadRepsProgressionInput,
      )).toThrow("invalid_load_reps_progression_input");
    }
  });

  it("keeps a zero copied increment readable but manual when an increase would otherwise qualify", () => {
    const base = input([8, 8, 8], "easy");
    expect(evaluateLoadRepsV1({
      ...base,
      target: { ...base.target, incrementGrams: 0 },
    })).toMatchObject({
      decision: "manual",
      reasonCode: "manual_equipment_increment_unavailable",
    });
  });
});
