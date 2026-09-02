import {
  describe,
  expect,
  it,
} from "@jest/globals";

import type {
  MetricIdentity,
} from "../metrics";
import type {
  EffectiveMetricHistorySet,
} from "./metricHistory";
import {
  reduceHistoryProjection,
  type EffectiveHistoryProjectionSession,
} from "./projectionReducer";

const loadIdentity: MetricIdentity = {
  profile: "load_reps",
  contractVersion: 1,
  exerciseMetricGeneration: 1,
};

function metricSet(
  overrides: Partial<EffectiveMetricHistorySet> = {},
): EffectiveMetricHistorySet {
  return {
    sessionId: "session-1",
    localDate: "2026-08-20",
    exerciseId: "bench-press",
    exerciseName: "Bench Press",
    identity: loadIdentity,
    target: {
      version: 1,
      profile: "load_reps",
      loadGrams: 40_000,
      minReps: 8,
      maxReps: 10,
      incrementGrams: 2_500,
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "load_reps",
      loadGrams: 40_000,
      reps: 8,
      source: "manual",
    },
    sessionStatus: "completed",
    setKind: "working",
    setStatus: "completed",
    plannedWorkingSets: 1,
    completedWorkingSets: 1,
    setId: "set-1",
    setOrdinal: 0,
    completedAtMs: 1_724_083_200_000,
    ...overrides,
  };
}

function session(
  overrides: Partial<EffectiveHistoryProjectionSession> = {},
): EffectiveHistoryProjectionSession {
  return {
    sessionId: "session-1",
    localDate: "2026-08-20",
    lifecycle: "active",
    completedExercises: 1,
    plannedExercises: 1,
    completedWorkingSets: 1,
    plannedWorkingSets: 1,
    metricSets: [metricSet()],
    recommendationScopes: ["legacy:bench-target"],
    ...overrides,
  };
}

describe("history projection reducer", () => {
  it("builds records, comparable exposures, aggregates, period inputs, and invalidation scopes from active effective facts only", () => {
    const projection = reduceHistoryProjection({
      sessions: [
        session({
          metricSets: [
            metricSet({ setId: "working" }),
            metricSet({
              setId: "warmup",
              setKind: "warmup",
              observation: {
                version: 1,
                profile: "load_reps",
                loadGrams: 90_000,
                reps: 20,
                source: "manual",
              },
            }),
          ],
        }),
        session({
          sessionId: "partial-incomplete",
          localDate: "2026-08-21",
          completedWorkingSets: 1,
          plannedWorkingSets: 2,
          metricSets: [metricSet({
            sessionId: "partial-incomplete",
            localDate: "2026-08-21",
            setId: "partial-incomplete",
            sessionStatus: "partial",
            plannedWorkingSets: 2,
            completedWorkingSets: 1,
          })],
          recommendationScopes: ["legacy:partial-target"],
        }),
        session({
          sessionId: "voided",
          lifecycle: "voided",
          metricSets: [metricSet({
            sessionId: "voided",
            setId: "voided",
            observation: {
              version: 1,
              profile: "load_reps",
              loadGrams: 100_000,
              reps: 20,
              source: "manual",
            },
          })],
          recommendationScopes: ["legacy:voided-target"],
        }),
      ],
    });

    expect(projection.recordCandidates.map(({ setId }) => setId)).toEqual([
      "working",
    ]);
    expect(projection.comparableExposures.map(({ setId }) => setId)).toEqual([
      "working",
    ]);
    expect(projection.metricAggregates).toEqual([
      expect.objectContaining({
        exerciseId: "bench-press",
        comparatorKey: "identity",
        aggregate: expect.objectContaining({
          profile: "load_reps",
          sampleSize: 1,
          meanLoadGrams: 40_000,
          meanReps: 8,
        }),
      }),
    ]);
    expect(projection.periodInputs).toEqual([
      {
        localDate: "2026-08-20",
        completedExercises: 1,
        plannedExercises: 1,
        completedWorkingSets: 1,
        plannedWorkingSets: 1,
        comparableExposureCount: 1,
      },
      {
        localDate: "2026-08-21",
        completedExercises: 1,
        plannedExercises: 1,
        completedWorkingSets: 1,
        plannedWorkingSets: 2,
        comparableExposureCount: 0,
      },
    ]);
    expect(projection.recommendationInvalidationScopes).toEqual([
      "legacy:bench-target",
      "legacy:partial-target",
    ]);
  });

  it("normalizes every output deterministically when effective source facts arrive in a different order", () => {
    const first = session({
      sessionId: "session-a",
      metricSets: [
        metricSet({ sessionId: "session-a", setId: "a-2", setOrdinal: 1 }),
        metricSet({ sessionId: "session-a", setId: "a-1", setOrdinal: 0 }),
      ],
    });
    const second = session({
      sessionId: "session-b",
      localDate: "2026-08-22",
      metricSets: [metricSet({
        sessionId: "session-b",
        localDate: "2026-08-22",
        setId: "b-1",
        completedAtMs: 1_724_169_600_000,
      })],
    });

    const forward = reduceHistoryProjection({ sessions: [first, second] });
    const reversed = reduceHistoryProjection({
      sessions: [
        { ...second, metricSets: [...second.metricSets].reverse() },
        { ...first, metricSets: [...first.metricSets].reverse() },
      ],
    });

    expect(reversed).toEqual(forward);
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });

  it("fails closed for source/set identity mismatches, missing completion facts, invalid period counts, and empty scopes", () => {
    expect(() => reduceHistoryProjection({
      sessions: [session({
        metricSets: [metricSet({ sessionId: "other-session" })],
      })],
    })).toThrow("history_projection_metric_set_session_mismatch");

    expect(() => reduceHistoryProjection({
      sessions: [session({
        metricSets: [metricSet({ localDate: "2026-08-21" })],
      })],
    })).toThrow("history_projection_metric_set_session_mismatch");

    expect(() => reduceHistoryProjection({
      sessions: [session({
        metricSets: [metricSet({ completedAtMs: null })],
      })],
    })).toThrow("history_metric_completed_timestamp_missing");

    expect(() => reduceHistoryProjection({
      sessions: [session({ completedExercises: -1 })],
    })).toThrow("history_projection_completed_exercises_invalid");

    expect(() => reduceHistoryProjection({
      sessions: [session({ plannedExercises: 1.5 })],
    })).toThrow("history_projection_planned_exercises_invalid");

    expect(() => reduceHistoryProjection({
      sessions: [session({ completedWorkingSets: -1 })],
    })).toThrow("history_projection_completed_working_sets_invalid");

    expect(() => reduceHistoryProjection({
      sessions: [session({ plannedWorkingSets: 1.5 })],
    })).toThrow("history_projection_planned_working_sets_invalid");

    expect(() => reduceHistoryProjection({
      sessions: [session({ recommendationScopes: [" " ] })],
    })).toThrow("history_projection_recommendation_scope_invalid");
  });
});
