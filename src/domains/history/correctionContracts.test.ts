import {
  describe,
  expect,
  it,
} from "@jest/globals";

import type {
  MetricIdentity,
  MetricTarget,
} from "../metrics";
import {
  assertValidHistoryCorrectionSnapshot,
  HistoryCorrectionInputError,
  prepareHistoryCorrection,
  type HistoryCorrectionSnapshot,
} from "./correctionContracts";

const identity: MetricIdentity = {
  profile: "load_reps",
  contractVersion: 1,
  exerciseMetricGeneration: 1,
};

const target: MetricTarget = {
  version: 1,
  profile: "load_reps",
  loadGrams: 40_000,
  minReps: 8,
  maxReps: 10,
  incrementGrams: 2_500,
  perSide: false,
};

function snapshot(
  overrides: Partial<HistoryCorrectionSnapshot> = {},
): HistoryCorrectionSnapshot {
  return {
    version: 1,
    session: {
      id: "session-1",
      source: "manual",
      status: "completed",
      planId: null,
      planDayId: null,
      planName: null,
      dayName: null,
      localDate: "2026-08-24",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_428_800_000,
      completedAtMs: 1_724_429_160_000,
      ownerNote: null,
    },
    exercises: [{
      id: "session-exercise-1",
      exerciseId: "bench-press",
      name: "Bench press",
      ordinal: 0,
      status: "completed",
      metricIdentity: identity,
      effort: "on_target",
      sets: [{
        id: "working-set-1",
        kind: "working",
        ordinal: 0,
        status: "completed",
        target,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 40_000,
          reps: 8,
          source: "manual",
        },
        completedAtMs: 1_724_429_160_000,
        sourcePlanWorkingSetTargetId: "legacy:bench-target",
      }],
    }],
    ...overrides,
  };
}

function correction(
  base: HistoryCorrectionSnapshot,
  next: HistoryCorrectionSnapshot,
) {
  return prepareHistoryCorrection({
    base,
    baseEffectiveRevision: 4,
    expectedEffectiveRevision: 4,
    next,
  });
}

describe("history correction contracts", () => {
  it("accepts independent warm-up and working-set ordinal sequences", () => {
    const base = snapshot();
    const mixedSets: HistoryCorrectionSnapshot = {
      ...base,
      exercises: [{
        ...base.exercises[0]!,
        sets: [{
          id: "warmup-set-1",
          kind: "warmup",
          ordinal: 0,
          status: "completed",
          target,
          observation: {
            version: 1,
            profile: "load_reps",
            loadGrams: 20_000,
            reps: 8,
            source: "manual",
          },
          completedAtMs: 1_724_429_150_000,
        }, ...base.exercises[0]!.sets],
      }],
    };

    expect(() => assertValidHistoryCorrectionSnapshot(mixedSets))
      .not.toThrow();
  });

  it("keeps set ordinals unique within each set kind", () => {
    const base = snapshot();
    const duplicateWorkingOrdinal: HistoryCorrectionSnapshot = {
      ...base,
      exercises: [{
        ...base.exercises[0]!,
        sets: [
          ...base.exercises[0]!.sets,
          {
            ...base.exercises[0]!.sets[0]!,
            id: "history-added:set-duplicate-ordinal",
          },
        ],
      }],
    };

    expect(() => assertValidHistoryCorrectionSnapshot(duplicateWorkingOrdinal))
      .toThrow("history_correction_set_invalid");
  });

  it("accepts a complete effective snapshot, produces canonical discrete audit deltas, and keeps immutable entity IDs", () => {
    const base = snapshot();
    const next = snapshot({
      session: {
        ...base.session,
        localDate: "2026-08-25",
        ownerNote: "Grip felt uneven",
      },
      exercises: [{
        ...base.exercises[0]!,
        effort: "easy",
        sets: [{
          ...base.exercises[0]!.sets[0]!,
          observation: {
            version: 1,
            profile: "load_reps",
            loadGrams: 42_500,
            reps: 9,
            source: "manual",
          },
        }, {
          id: "history-added:set-0001",
          kind: "warmup",
          ordinal: 1,
          status: "completed",
          target: {
            ...target,
            loadGrams: 20_000,
          },
          observation: {
            version: 1,
            profile: "load_reps",
            loadGrams: 20_000,
            reps: 12,
            source: "manual",
          },
          completedAtMs: 1_724_428_900_000,
        }],
      }],
    });

    expect(correction(base, next)).toEqual(expect.objectContaining({
      next,
      auditDeltas: expect.arrayContaining([
        expect.objectContaining({ fieldIdentity: "session.localDate" }),
        expect.objectContaining({ fieldIdentity: "session.ownerNote" }),
        expect.objectContaining({ fieldIdentity: "exercise:session-exercise-1.effort" }),
        expect.objectContaining({
          fieldIdentity: "set:working-set-1.observation",
        }),
        expect.objectContaining({
          fieldIdentity: "set:history-added:set-0001.added",
        }),
      ]),
    }));
  });

  it("supports a set kind change or removal while requiring valid working-set evidence", () => {
    const base = snapshot();
    const retitled = snapshot({
      exercises: [{
        ...base.exercises[0]!,
        sets: [{
          ...base.exercises[0]!.sets[0]!,
          kind: "warmup",
        }],
      }],
    });

    expect(correction(base, retitled).auditDeltas).toContainEqual(
      expect.objectContaining({ fieldIdentity: "set:working-set-1.kind" }),
    );
    expect(() => correction(base, snapshot({
      exercises: [{
        ...base.exercises[0]!,
        sets: [{
          ...base.exercises[0]!.sets[0]!,
          observation: undefined,
        }],
      }],
    }))).toThrow(HistoryCorrectionInputError);
  });

  it("serializes an omitted optional set association as a canonical audit value", () => {
    const base = snapshot();
    const {
      sourcePlanWorkingSetTargetId,
      ...withoutSourceTarget
    } = base.exercises[0]!.sets[0]!;
    expect(sourcePlanWorkingSetTargetId).toBe("legacy:bench-target");
    const next = snapshot({
      exercises: [{
        ...base.exercises[0]!,
        sets: [{
          ...withoutSourceTarget,
        }],
      }],
    });

    expect(correction(base, next).auditDeltas).toContainEqual(
      expect.objectContaining({
        fieldIdentity: "set:working-set-1.sourcePlanWorkingSetTargetId",
        before: "legacy:bench-target",
        after: null,
      }),
    );
  });

  it("permits an explicit replacement with a valid compatible metric identity", () => {
    const base = snapshot();
    const next = snapshot({
      exercises: [{
        ...base.exercises[0]!,
        exerciseId: "incline-bench-press",
        name: "Incline bench press",
      }],
    });

    expect(correction(base, next).auditDeltas).toContainEqual(
      expect.objectContaining({
        fieldIdentity: "exercise:session-exercise-1.exerciseId",
        before: "bench-press",
        after: "incline-bench-press",
      }),
    );
  });

  it("rejects direct session status/source rewrites and unsupported exercise removal or addition", () => {
    const base = snapshot();
    expect(() => correction(base, snapshot({
      session: { ...base.session, source: "rest_day" },
    }))).toThrow("history_correction_session_field_immutable");
    expect(() => correction(base, snapshot({
      session: { ...base.session, status: "partial" },
    }))).toThrow("history_correction_session_field_immutable");
    expect(() => correction(base, snapshot({ exercises: [] })))
      .toThrow("history_correction_exercise_removal_unsupported");
    expect(() => correction(base, snapshot({
      exercises: [
        ...base.exercises,
        {
          ...base.exercises[0]!,
          id: "history-added:exercise-0001",
          ordinal: 1,
          sets: [],
        },
      ],
    }))).toThrow("history_correction_exercise_addition_unsupported");
  });

  it("rejects stale, no-op, malformed civil-time, incompatible replacement values, and non-synthetic added identities", () => {
    const base = snapshot();
    expect(() => prepareHistoryCorrection({
      base,
      baseEffectiveRevision: 4,
      expectedEffectiveRevision: 3,
      next: snapshot({
        session: { ...base.session, ownerNote: "Changed" },
      }),
    })).toThrow("history_correction_conflict");
    expect(() => correction(base, base)).toThrow("history_correction_noop");
    expect(() => correction(base, snapshot({
      session: { ...base.session, timezone: "Invalid/Timezone" },
    }))).toThrow("history_correction_timezone_invalid");
    expect(() => correction(base, snapshot({
      exercises: [{
        ...base.exercises[0]!,
        exerciseId: "rower",
        metricIdentity: {
          profile: "bodyweight_reps",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
      }],
    }))).toThrow("history_correction_metric_invalid");
    expect(() => correction(base, snapshot({
      exercises: [{
        ...base.exercises[0]!,
        sets: [
          ...base.exercises[0]!.sets,
          {
            ...base.exercises[0]!.sets[0]!,
            id: "new-set",
            ordinal: 1,
          },
        ],
      }],
    }))).toThrow("history_correction_added_identity_invalid");
  });
});
