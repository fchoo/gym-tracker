import {
  describe,
  expect,
  it,
} from "@jest/globals";

import type {
  MetricIdentity,
} from "../metrics";
import {
  buildExerciseMetricHistory,
  projectComparableExerciseTrend,
  projectLoadMetricHistorySeries,
  type EffectiveMetricHistorySet,
} from "./metricHistory";

const loadIdentity: MetricIdentity = {
  profile: "load_reps",
  contractVersion: 1,
  exerciseMetricGeneration: 1,
};

function loadSet(
  overrides: Partial<EffectiveMetricHistorySet> = {},
): EffectiveMetricHistorySet {
  return {
    sessionId: "session-1",
    localDate: "2026-08-24",
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
    completedAtMs: 1_724_428_800_000,
    ...overrides,
  };
}

describe("effective metric history", () => {
  it("projects at most six reverse-chronological completed comparable sessions", () => {
    const history = buildExerciseMetricHistory({
      exerciseId: "bench-press",
      sets: Array.from({ length: 8 }, (_, index) => loadSet({
        sessionId: `session-${index + 1}`,
        setId: `set-${index + 1}`,
        localDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
        completedAtMs: 1_724_428_800_000 + index * 86_400_000,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 40_000 + index * 2_500,
          reps: 8,
          source: "manual",
        },
      })),
    });

    const trend = projectComparableExerciseTrend(history);

    expect(trend).toMatchObject({
      recent: { setId: "set-8" },
      best: { setId: "set-8" },
    });
    expect(trend?.sessions.map(({ setId }) => setId)).toEqual([
      "set-8", "set-7", "set-6", "set-5", "set-4", "set-3",
    ]);
  });

  it("uses only fully completed working-set visits for Best, Average, and Last", () => {
    const history = buildExerciseMetricHistory({
      exerciseId: "bench-press",
      sets: [
        loadSet({ setId: "source", completedAtMs: 1_724_428_800_000 }),
        loadSet({
          sessionId: "partial-complete",
          setId: "partial-complete",
          sessionStatus: "partial",
          completedAtMs: 1_724_515_200_000,
          observation: {
            version: 1,
            profile: "load_reps",
            loadGrams: 42_500,
            reps: 9,
            source: "manual",
          },
          plannedWorkingSets: 2,
          completedWorkingSets: 2,
        }),
        loadSet({
          sessionId: "partial-incomplete",
          setId: "partial-incomplete",
          sessionStatus: "partial",
          completedAtMs: 1_724_601_600_000,
          observation: {
            version: 1,
            profile: "load_reps",
            loadGrams: 90_000,
            reps: 20,
            source: "manual",
          },
          plannedWorkingSets: 2,
          completedWorkingSets: 1,
        }),
      ],
    });

    expect(history.segments).toHaveLength(1);
    expect(history.segments[0]).toMatchObject({
      best: { setId: "partial-complete" },
      last: { setId: "partial-complete" },
      average: {
        profile: "load_reps",
        sampleSize: 2,
        meanLoadGrams: 41_250,
        meanReps: 8.5,
      },
    });
    expect(history.segments[0]?.comparableSets.map(({ setId }) => setId))
      .toEqual(["partial-complete", "source"]);
  });

  it("keeps completed warm-ups as separate visits and never fabricates a summary", () => {
    const history = buildExerciseMetricHistory({
      exerciseId: "bench-press",
      sets: [loadSet({
        setId: "warmup",
        setKind: "warmup",
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 20_000,
          reps: 12,
          source: "manual",
        },
      })],
    });

    expect(history.segments).toEqual([]);
    expect(history.warmupVisits.map(({ setId }) => setId)).toEqual(["warmup"]);
  });

  it("preserves target-significant boundaries as separate metric segments", () => {
    const identity: MetricIdentity = {
      profile: "fixed_distance",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    };
    const set = (setId: string, distanceMeters: number): EffectiveMetricHistorySet => ({
      sessionId: setId,
      localDate: "2026-08-24",
      exerciseId: "rower",
      exerciseName: "Rower",
      identity,
      target: {
        version: 1,
        profile: "fixed_distance",
        plannedDistanceMeters: distanceMeters,
      },
      observation: {
        version: 1,
        profile: "fixed_distance",
        distanceMeters,
        durationMs: 600_000,
        source: "manual",
      },
      sessionStatus: "completed",
      setKind: "working",
      setStatus: "completed",
      plannedWorkingSets: 1,
      completedWorkingSets: 1,
      setId,
      setOrdinal: 0,
      completedAtMs: 1_724_428_800_000,
    });

    const history = buildExerciseMetricHistory({
      exerciseId: "rower",
      sets: [set("row-2k", 2_000), set("row-5k", 5_000)],
    });

    expect(history.segments).toHaveLength(2);
    expect(history.segments.map(({ referenceTarget }) => referenceTarget))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ plannedDistanceMeters: 2_000 }),
        expect.objectContaining({ plannedDistanceMeters: 5_000 }),
      ]));
  });

  it("projects target-at-date, immutable source revision, and dated relative basis from the same comparable sets", () => {
    const first = loadSet({
      sessionId: "session-first",
      setId: "set-first",
      localDate: "2026-08-23",
      completedAtMs: 1_724_428_800_000,
      sourceRevision: 1,
      targetAtDate: {
        version: 1,
        profile: "load_reps",
        loadGrams: 37_500,
        minReps: 8,
        maxReps: 10,
        incrementGrams: 2_500,
        perSide: false,
      },
      relativeStrength: {
        loadGrams: 40_000,
        relativeLoad: 0.5,
        basis: { grams: 80_000, localDate: "2026-08-20" },
      },
    });
    const corrected = loadSet({
      sessionId: "session-corrected",
      setId: "set-corrected",
      localDate: "2026-08-24",
      completedAtMs: 1_724_515_200_000,
      sourceRevision: 3,
      historyStatus: "corrected_effective",
      observation: {
        version: 1,
        profile: "load_reps",
        loadGrams: 45_000,
        reps: 8,
        source: "manual",
      },
      relativeStrength: {
        loadGrams: 45_000,
        relativeLoad: 0.5,
        basis: { grams: 90_000, localDate: "2026-08-24" },
      },
    });
    const segment = buildExerciseMetricHistory({
      exerciseId: "bench-press",
      sets: [corrected, first],
    }).segments[0]!;

    expect(projectLoadMetricHistorySeries(segment, "load")?.points).toEqual([
      expect.objectContaining({
        sessionId: "session-first",
        sourceRevision: 1,
        targetAtDate: 37.5,
        value: 40,
      }),
      expect.objectContaining({
        sessionId: "session-corrected",
        sourceRevision: 3,
        statusLabel: "Corrected effective fact",
        targetAtDate: 40,
        value: 45,
      }),
    ]);
    expect(projectLoadMetricHistorySeries(segment, "relative")?.points).toEqual([
      expect.objectContaining({ value: 0.5, targetAtDate: 0.46875 }),
      expect.objectContaining({
        value: 0.5,
        targetAtDate: 40_000 / 90_000,
        basisDisclosure: "Using 90 kg from 24 August 2026",
      }),
    ]);
  });
});
