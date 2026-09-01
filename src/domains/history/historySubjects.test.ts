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
  collectHistoryImpact,
  collectHistorySubjects,
  metricComparatorBoundaryKey,
  parseHistorySubjectId,
  type EffectiveHistorySubjectSnapshot,
} from "./historySubjects";

const loadIdentity: MetricIdentity = {
  profile: "load_reps",
  contractVersion: 1,
  exerciseMetricGeneration: 1,
};

const fixedDistanceIdentity: MetricIdentity = {
  profile: "fixed_distance",
  contractVersion: 1,
  exerciseMetricGeneration: 1,
};

const loadTarget: MetricTarget = {
  version: 1,
  profile: "load_reps",
  loadGrams: 40_000,
  minReps: 8,
  maxReps: 10,
  incrementGrams: 2_500,
  perSide: false,
};

function snapshot(
  overrides: Partial<EffectiveHistorySubjectSnapshot> = {},
): EffectiveHistorySubjectSnapshot {
  return {
    sessionId: "session-1",
    localDate: "2026-08-20",
    lifecycle: "active",
    exercises: [
      {
        exerciseId: "bench-press",
        identity: loadIdentity,
        target: loadTarget,
        recommendationTargetIds: ["legacy:bench-target"],
      },
    ],
    ...overrides,
  };
}

function summary(input: ReturnType<typeof collectHistorySubjects>): readonly string[] {
  return input.map(({ id }) => id);
}

describe("history subject fan-out", () => {
  it("returns one sorted, de-duplicated union for every old and new effective scope", () => {
    const oldSnapshot = snapshot();
    const newSnapshot = snapshot({
      localDate: "2026-08-24",
      exercises: [
        {
          exerciseId: "bench-press",
          identity: loadIdentity,
          target: {
            ...loadTarget,
            loadGrams: 42_500,
          },
          recommendationTargetIds: ["legacy:bench-target"],
        },
        {
          exerciseId: "rower",
          identity: fixedDistanceIdentity,
          target: {
            version: 1,
            profile: "fixed_distance",
            plannedDistanceMeters: 2_000,
          },
          recommendationTargetIds: ["owned:rower-target"],
        },
      ],
    });

    const subjects = collectHistorySubjects({
      oldSnapshot,
      newSnapshot,
    });

    expect(summary(subjects)).toEqual([
      'history-subject/v1:["date","2026-08-20"]',
      'history-subject/v1:["date","2026-08-24"]',
      'history-subject/v1:["exercise_metric","bench-press","load_reps:1:1","identity"]',
      'history-subject/v1:["exercise_metric","rower","fixed_distance:1:1","planned_distance:2000"]',
      'history-subject/v1:["period","2026-08-20"]',
      'history-subject/v1:["period","2026-08-24"]',
      'history-subject/v1:["period","all"]',
      'history-subject/v1:["recommendation_target","legacy:bench-target"]',
      'history-subject/v1:["recommendation_target","owned:rower-target"]',
      'history-subject/v1:["session","session-1"]',
    ]);
  });

  it("derives recommendation invalidation from working-set history subjects", () => {
    const impact = collectHistoryImpact({
      oldSnapshot: snapshot(),
      newSnapshot: snapshot({
        exercises: [{
          ...snapshot().exercises[0]!,
          recommendationTargetIds: [
            "owned:new-target",
            "legacy:bench-target",
          ],
        }],
      }),
    });

    expect(impact.recommendationScopes).toEqual([
      "legacy:bench-target",
      "owned:new-target",
    ]);
    expect(impact.subjects.filter(({ kind }) => kind === "recommendation_target"))
      .toHaveLength(2);
  });

  it("does not invent recommendation scopes absent from working-set subjects", () => {
    const active = snapshot({
      exercises: [{
        ...snapshot().exercises[0]!,
        recommendationTargetIds: [],
      }],
    });

    expect(collectHistoryImpact({
      oldSnapshot: active,
      newSnapshot: active,
    }).recommendationScopes).toEqual([]);
  });

  it("keeps the former scope when a session becomes voided so restore can rebuild it", () => {
    const active = snapshot({
      exercises: [
        {
          exerciseId: "rower",
          identity: fixedDistanceIdentity,
          target: {
            version: 1,
            profile: "fixed_distance",
            plannedDistanceMeters: 5_000,
          },
          recommendationTargetIds: ["owned:rower-target"],
        },
      ],
    });

    const subjects = collectHistorySubjects({
      oldSnapshot: active,
      newSnapshot: { ...active, lifecycle: "voided" },
    });

    expect(summary(subjects)).toEqual([
      'history-subject/v1:["date","2026-08-20"]',
      'history-subject/v1:["exercise_metric","rower","fixed_distance:1:1","planned_distance:5000"]',
      'history-subject/v1:["period","2026-08-20"]',
      'history-subject/v1:["period","all"]',
      'history-subject/v1:["recommendation_target","owned:rower-target"]',
      'history-subject/v1:["session","session-1"]',
    ]);
  });

  it("emits no projection subjects when both snapshots are voided", () => {
    expect(collectHistorySubjects({
      oldSnapshot: snapshot({ lifecycle: "voided" }),
      newSnapshot: snapshot({ lifecycle: "voided" }),
    })).toEqual([]);
  });

  it("uses every metric contract's approved comparison boundary without inventing a universal load key", () => {
    const cases: readonly Readonly<{
      identity: MetricIdentity;
      target: MetricTarget;
      expected: string;
    }>[] = [
      {
        identity: {
          profile: "bodyweight_reps",
          contractVersion: 1,
          exerciseMetricGeneration: 2,
        },
        target: {
          version: 1,
          profile: "bodyweight_reps",
          minReps: 8,
          maxReps: 12,
          variationId: "strict",
          perSide: false,
        },
        expected: "variation:strict",
      },
      {
        identity: {
          profile: "added_load_reps",
          contractVersion: 1,
          exerciseMetricGeneration: 3,
        },
        target: {
          version: 1,
          profile: "added_load_reps",
          addedLoadGrams: 10_000,
          minReps: 6,
          maxReps: 8,
          incrementGrams: 2_500,
          perSide: false,
        },
        expected: "identity",
      },
      {
        identity: {
          profile: "assisted_reps",
          contractVersion: 1,
          exerciseMetricGeneration: 4,
        },
        target: {
          version: 1,
          profile: "assisted_reps",
          assistanceGrams: 20_000,
          minReps: 6,
          maxReps: 8,
          decrementGrams: 2_500,
          assistanceEquipmentId: "machine-stack",
          perSide: false,
        },
        expected: "assistance_equipment:machine-stack",
      },
      {
        identity: {
          profile: "timed_hold",
          contractVersion: 1,
          exerciseMetricGeneration: 5,
        },
        target: {
          version: 1,
          profile: "timed_hold",
          durationSeconds: 45,
          perSide: true,
        },
        expected: "side:true",
      },
      {
        identity: {
          profile: "fixed_time",
          contractVersion: 1,
          exerciseMetricGeneration: 6,
        },
        target: {
          version: 1,
          profile: "fixed_time",
          plannedDurationMs: 720_000,
        },
        expected: "planned_duration:720000",
      },
      {
        identity: {
          profile: "intervals",
          contractVersion: 1,
          exerciseMetricGeneration: 7,
        },
        target: {
          version: 1,
          profile: "intervals",
          protocolId: "bike-30-30",
          comparatorId: "rounds_then_work",
          comparatorVersion: 1,
          plannedRounds: 6,
          workIntervalMs: 30_000,
          restIntervalMs: 30_000,
        },
        expected: "interval:bike-30-30:rounds_then_work:1:6:30000:30000",
      },
      {
        identity: {
          profile: "unscored",
          contractVersion: 1,
          exerciseMetricGeneration: 8,
        },
        target: {
          version: 1,
          profile: "unscored",
          completionRequired: true,
        },
        expected: "completion",
      },
    ];

    expect(cases.map(metricComparatorBoundaryKey)).toEqual(
      cases.map(({ expected }) => expected),
    );
  });

  it("parses each durable subject kind and rejects malformed or mixed-session rebuild requests", () => {
    expect(parseHistorySubjectId(
      'history-subject/v1:["date","2026-08-24"]',
    )).toEqual({ kind: "date", scope: ["2026-08-24"] });
    expect(parseHistorySubjectId(
      'history-subject/v1:["exercise_metric","bench-press","load_reps:1:1","identity"]',
    )).toEqual({
      kind: "exercise_metric",
      scope: ["bench-press", "load_reps:1:1", "identity"],
    });
    expect(parseHistorySubjectId(
      'history-subject/v1:["period","all"]',
    )).toEqual({ kind: "period", scope: ["all"] });
    expect(parseHistorySubjectId(
      'history-subject/v1:["recommendation_target","owned:target"]',
    )).toEqual({ kind: "recommendation_target", scope: ["owned:target"] });
    expect(parseHistorySubjectId(
      'history-subject/v1:["session","session-1"]',
    )).toEqual({ kind: "session", scope: ["session-1"] });

    for (const value of [
      "not-a-history-subject",
      "history-subject/v1:not-json",
      "history-subject/v1:{}",
      "history-subject/v1:[\"date\"]",
      "history-subject/v1:[\"date\",\"\"]",
      "history-subject/v1:[\"unknown\",\"scope\"]",
    ]) {
      expect(() => parseHistorySubjectId(value)).toThrow(
        "history_subject_id_invalid",
      );
    }

    expect(() => collectHistorySubjects({
      oldSnapshot: snapshot(),
      newSnapshot: snapshot({ sessionId: "session-2" }),
    })).toThrow("history_subject_session_mismatch");
    expect(() => collectHistorySubjects({
      oldSnapshot: snapshot({ sessionId: " " }),
      newSnapshot: snapshot({ sessionId: " " }),
    })).toThrow("history_subject_session_id_invalid");
  });
});
