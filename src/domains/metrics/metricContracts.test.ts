import {
  describe,
  expect,
  test,
} from "@jest/globals";

import {
  METRIC_PROFILES,
  MetricBoundaryError,
  type MetricIdentity,
  type MetricObservation,
  type MetricTarget,
  metricIdentityKey,
} from "./contracts";
import {
  MetricAggregateError,
  aggregateMetricObservations,
  formatMetricDuration,
  roundMetricAggregateForPresentation,
} from "./aggregates";
import {
  type MetricCandidate,
  compareMetricObservations,
  selectBestMetricCandidate,
  selectLastMetricCandidate,
} from "./comparators";
import {
  type MetricExposure,
  areMetricExposuresComparable,
  isMetricExposureEligible,
} from "./exposure";
import {
  parseMetricObservation,
  parseMetricObservationJson,
  parseMetricTarget,
  parseMetricTargetJson,
  serializeMetricObservation,
  serializeMetricTarget,
} from "./observations";
import {
  getMetricContract,
  listMetricContracts,
} from "./registry";

const APPROVED_PROFILES = [
  "load_reps",
  "bodyweight_reps",
  "added_load_reps",
  "assisted_reps",
  "timed_hold",
  "fixed_distance",
  "fixed_time",
  "intervals",
  "unscored",
] as const;

const identityCases = [
  {
    name: "load reps V1",
    identity: {
      profile: "load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "load_reps",
      loadGrams: 0,
      minReps: 1,
      maxReps: 12,
      incrementGrams: 1,
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "load_reps",
      loadGrams: Number.MAX_SAFE_INTEGER,
      reps: 1,
      source: "manual",
    },
  },
  {
    name: "bodyweight reps V1",
    identity: {
      profile: "bodyweight_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "bodyweight_reps",
      minReps: 1,
      maxReps: 20,
      variationId: "standard",
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "bodyweight_reps",
      reps: 12,
      source: "plan_default",
    },
  },
  {
    name: "added load reps V1",
    identity: {
      profile: "added_load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "added_load_reps",
      addedLoadGrams: 0,
      minReps: 1,
      maxReps: 12,
      incrementGrams: 1,
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "added_load_reps",
      addedLoadGrams: 10_000,
      reps: 8,
      source: "recommended",
    },
  },
  {
    name: "assisted reps V1",
    identity: {
      profile: "assisted_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "assisted_reps",
      assistanceGrams: 20_000,
      minReps: 1,
      maxReps: 10,
      decrementGrams: 1,
      assistanceEquipmentId: "machine_stack",
      perSide: false,
    },
    observation: {
      version: 1,
      profile: "assisted_reps",
      assistanceGrams: 20_000,
      reps: 8,
      source: "last_workout",
    },
  },
  {
    name: "legacy timed hold V1 seconds",
    identity: {
      profile: "timed_hold",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "timed_hold",
      durationSeconds: 45,
      perSide: true,
    },
    observation: {
      version: 1,
      profile: "timed_hold",
      durationSeconds: 43,
      source: "manual",
    },
  },
  {
    name: "timed hold V2 milliseconds",
    identity: {
      profile: "timed_hold",
      contractVersion: 2,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 2,
      profile: "timed_hold",
      durationMs: 45_500,
      perSide: false,
    },
    observation: {
      version: 2,
      profile: "timed_hold",
      durationMs: 45_250,
      source: "manual",
    },
  },
  {
    name: "fixed distance V1",
    identity: {
      profile: "fixed_distance",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "fixed_distance",
      plannedDistanceMeters: 2_000,
    },
    observation: {
      version: 1,
      profile: "fixed_distance",
      distanceMeters: 2_000,
      durationMs: 720_000,
      source: "manual",
    },
  },
  {
    name: "fixed time V1",
    identity: {
      profile: "fixed_time",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "fixed_time",
      plannedDurationMs: 720_000,
    },
    observation: {
      version: 1,
      profile: "fixed_time",
      durationMs: 720_000,
      distanceMeters: 2_400,
      source: "manual",
    },
  },
  {
    name: "intervals V1",
    identity: {
      profile: "intervals",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "intervals",
      protocolId: "bike_30_30_6",
      comparatorId: "rounds_then_work",
      comparatorVersion: 1,
      plannedRounds: 6,
      workIntervalMs: 30_000,
      restIntervalMs: 30_000,
    },
    observation: {
      version: 1,
      profile: "intervals",
      protocolId: "bike_30_30_6",
      completedRounds: 6,
      completedWorkMs: 180_000,
      source: "manual",
    },
  },
  {
    name: "unscored V1",
    identity: {
      profile: "unscored",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    target: {
      version: 1,
      profile: "unscored",
      completionRequired: true,
    },
    observation: {
      version: 1,
      profile: "unscored",
      completed: true,
      source: "manual",
    },
  },
] as const;

const invalidObservationCases = [
  {
    name: "load reps below minimum repetitions",
    index: 0,
    observation: {
      ...identityCases[0].observation,
      reps: 0,
    },
  },
  {
    name: "bodyweight reps below minimum repetitions",
    index: 1,
    observation: {
      ...identityCases[1].observation,
      reps: 0,
    },
  },
  {
    name: "added load reps below minimum repetitions",
    index: 2,
    observation: {
      ...identityCases[2].observation,
      reps: 0,
    },
  },
  {
    name: "assisted reps below minimum repetitions",
    index: 3,
    observation: {
      ...identityCases[3].observation,
      reps: 0,
    },
  },
  {
    name: "legacy timed hold below minimum seconds",
    index: 4,
    observation: {
      ...identityCases[4].observation,
      durationSeconds: 0,
    },
  },
  {
    name: "millisecond timed hold below minimum duration",
    index: 5,
    observation: {
      ...identityCases[5].observation,
      durationMs: 0,
    },
  },
  {
    name: "fixed distance below minimum distance",
    index: 6,
    observation: {
      ...identityCases[6].observation,
      distanceMeters: 0,
    },
  },
  {
    name: "fixed time below minimum duration",
    index: 7,
    observation: {
      ...identityCases[7].observation,
      durationMs: 0,
    },
  },
  {
    name: "intervals below minimum completed rounds",
    index: 8,
    observation: {
      ...identityCases[8].observation,
      completedRounds: -1,
    },
  },
  {
    name: "unscored with non-boolean completion",
    index: 9,
    observation: {
      ...identityCases[9].observation,
      completed: "yes",
    },
  },
] as const;

describe("metric identity contracts", () => {
  test("identity tracer preserves legacy seconds and a new profile", () => {
    const legacyCase = identityCases[4];
    const bodyweightCase = identityCases[1];

    expect(
      parseMetricObservation(
        legacyCase.identity,
        legacyCase.observation,
      ),
    ).toEqual(legacyCase.observation);
    expect(
      serializeMetricObservation(
        legacyCase.identity,
        legacyCase.observation,
      ),
    ).toBe(
      '{"version":1,"profile":"timed_hold","durationSeconds":43,"source":"manual"}',
    );
    expect(
      parseMetricTarget(
        bodyweightCase.identity,
        bodyweightCase.target,
      ),
    ).toEqual(bodyweightCase.target);
    expect(
      parseMetricObservation(
        bodyweightCase.identity,
        bodyweightCase.observation,
      ),
    ).toEqual(bodyweightCase.observation);
    expect(getMetricContract(bodyweightCase.identity).identity).toEqual(
      bodyweightCase.identity,
    );
  });

  test("identity E-64 LIB-11 boundary accepts exact minima", () => {
    expect(
      parseMetricObservation(
        identityCases[0].identity,
        {
          ...identityCases[0].observation,
          loadGrams: 0,
          reps: 1,
        },
      ),
    ).toEqual({
      ...identityCases[0].observation,
      loadGrams: 0,
      reps: 1,
    });
  });

  test("identity E-65 LIB-11 boundary accepts exact safe-integer maxima", () => {
    expect(
      parseMetricObservation(
        identityCases[0].identity,
        identityCases[0].observation,
      ),
    ).toEqual(identityCases[0].observation);
  });

  test.each(invalidObservationCases)(
    "identity E-66 LIB-11 one-step-invalid rejects $name",
    ({ index, observation }) => {
      const identity = identityCases[index]!.identity;
      expect(() => parseMetricObservation(identity, observation)).toThrow(
        expect.objectContaining({
          code: "metric_observation_invalid",
          retryable: false,
        } satisfies Partial<MetricBoundaryError>),
      );
    },
  );

  test("identity E-66 LIB-11 rejects an integer beyond the safe maximum", () => {
    expect(() =>
      parseMetricObservation(identityCases[0].identity, {
        ...identityCases[0].observation,
        loadGrams: Number.MAX_SAFE_INTEGER + 1,
      })
    ).toThrow("metric_observation_invalid");
  });

  test("identity E-67 LIB-12 empty and unknown fields fail closed", () => {
    expect(() =>
      parseMetricObservation(identityCases[1].identity, null)
    ).toThrow("metric_observation_invalid");
    expect(() =>
      parseMetricTarget(identityCases[1].identity, {
        ...identityCases[1].target,
        diagnosis: "raw owner value",
      })
    ).toThrow("metric_target_invalid");
  });

  test("load/reps targets preserve bounded per-set repetition aims", () => {
    const identity = identityCases[0].identity;
    const target = {
      ...identityCases[0].target,
      minReps: 6,
      maxReps: 8,
      targetReps: [8, 8, 7],
    };

    expect(parseMetricTarget(identity, target)).toEqual(target);
    expect(
      parseMetricTargetJson(
        identity,
        serializeMetricTarget(identity, target),
      ),
    ).toEqual(target);
  });

  test.each([
    {
      label: "empty",
      targetReps: [],
    },
    {
      label: "below the target range",
      targetReps: [5],
    },
    {
      label: "above the target range",
      targetReps: [9],
    },
    {
      label: "over the set limit",
      targetReps: Array.from({ length: 101 }, () => 6),
    },
  ])("load/reps targets reject $label per-set aims", ({ targetReps }) => {
    expect(() =>
      parseMetricTarget(identityCases[0].identity, {
        ...identityCases[0].target,
        minReps: 6,
        maxReps: 8,
        targetReps,
      })
    ).toThrow("metric_target_invalid");
  });

  test.each(identityCases)(
    "identity round-trips $name target and observation",
    ({ identity, target, observation }) => {
      expect(parseMetricTarget(identity, target)).toEqual(target);
      expect(parseMetricObservation(identity, observation)).toEqual(
        observation,
      );
      expect(
        parseMetricObservationJson(
          identity,
          serializeMetricObservation(identity, observation),
        ),
      ).toEqual(observation);
      expect(JSON.parse(serializeMetricTarget(identity, target))).toEqual(
        target,
      );
    },
  );

  test("identity E-71 LIB-11 adjacency includes metric generation", () => {
    const first = identityCases[1].identity;
    const adjacent = {
      ...first,
      exerciseMetricGeneration: first.exerciseMetricGeneration + 1,
    };

    expect(metricIdentityKey(first)).not.toBe(metricIdentityKey(adjacent));
    expect(getMetricContract(adjacent).identity).toEqual(adjacent);
  });

  test("identity E-72 LIB-11 rejects unsupported combinations safely", () => {
    const unsupported = {
      profile: "timed_hold",
      contractVersion: 3,
      exerciseMetricGeneration: 1,
    } as MetricIdentity;

    expect(() => getMetricContract(unsupported)).toThrow(
      expect.objectContaining({
        kind: "unsupported_version",
        code: "metric_identity_unsupported",
        message: "metric_identity_unsupported",
        retryable: false,
      } satisfies Partial<MetricBoundaryError>),
    );
    expect(() =>
      getMetricContract({
        ...identityCases[0].identity,
        exerciseMetricGeneration: 0,
      })
    ).toThrow(
      expect.objectContaining({
        kind: "validation",
        code: "metric_identity_invalid",
      } satisfies Partial<MetricBoundaryError>),
    );
  });

  test("identity E-73 LIB-12 registry order is stable and complete", () => {
    expect(METRIC_PROFILES).toEqual(APPROVED_PROFILES);
    expect([
      ...new Set(listMetricContracts().map(({ profile }) => profile)),
    ]).toEqual(APPROVED_PROFILES);
    expect(listMetricContracts()).toHaveLength(10);
  });

  test("identity E-74 LIB-12 protocol encoding preserves Unicode", () => {
    const target = {
      ...identityCases[8].target,
      protocolId: "自行车_30秒_6轮",
    };
    const observation = {
      ...identityCases[8].observation,
      protocolId: "自行车_30秒_6轮",
    };

    expect(
      parseMetricTarget(identityCases[8].identity, target),
    ).toEqual(target);
    expect(
      parseMetricObservationJson(
        identityCases[8].identity,
        serializeMetricObservation(identityCases[8].identity, observation),
      ),
    ).toEqual(observation);
  });

  test("identity E-75 LIB-11 legacy JSON bytes retain seconds", () => {
    const json =
      '{"version":1,"profile":"timed_hold","durationSeconds":43,"source":"manual"}';

    expect(
      serializeMetricObservation(
        identityCases[4].identity,
        parseMetricObservationJson(identityCases[4].identity, json),
      ),
    ).toBe(json);
    expect(json).not.toContain("durationMs");
  });

  test("identity boundary errors never reflect malformed values", () => {
    const rawValue = "private-observation-value";

    try {
      parseMetricObservation(identityCases[1].identity, {
        ...identityCases[1].observation,
        reps: rawValue,
      });
      throw new Error("expected metric boundary rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(MetricBoundaryError);
      expect(String(error)).not.toContain(rawValue);
      expect(JSON.stringify(error)).not.toContain(rawValue);
    }
  });

  test("identity JSON parsers reject malformed input with stable codes", () => {
    expect(() =>
      parseMetricTargetJson(identityCases[1].identity, "{")
    ).toThrow("metric_json_invalid");
    expect(() =>
      parseMetricObservationJson(identityCases[1].identity, "{")
    ).toThrow("metric_json_invalid");
  });
});

const comparisonCases = [
  {
    name: "load reps uses load before repetitions",
    index: 0,
    better: {
      ...identityCases[0].observation,
      loadGrams: 10_000,
      reps: 5,
    },
    worse: {
      ...identityCases[0].observation,
      loadGrams: 9_999,
      reps: 20,
    },
  },
  {
    name: "bodyweight reps uses repetitions",
    index: 1,
    better: {
      ...identityCases[1].observation,
      reps: 13,
    },
    worse: {
      ...identityCases[1].observation,
      reps: 12,
    },
  },
  {
    name: "added load uses added load before repetitions",
    index: 2,
    better: {
      ...identityCases[2].observation,
      addedLoadGrams: 10_000,
      reps: 5,
    },
    worse: {
      ...identityCases[2].observation,
      addedLoadGrams: 9_999,
      reps: 20,
    },
  },
  {
    name: "assisted reps uses lower assistance after meeting target",
    index: 3,
    better: {
      ...identityCases[3].observation,
      assistanceGrams: 19_999,
      reps: 8,
    },
    worse: {
      ...identityCases[3].observation,
      assistanceGrams: 20_000,
      reps: 8,
    },
  },
  {
    name: "legacy timed hold uses longer seconds",
    index: 4,
    better: {
      ...identityCases[4].observation,
      durationSeconds: 44,
    },
    worse: {
      ...identityCases[4].observation,
      durationSeconds: 43,
    },
  },
  {
    name: "millisecond timed hold uses longer milliseconds",
    index: 5,
    better: {
      ...identityCases[5].observation,
      durationMs: 45_251,
    },
    worse: {
      ...identityCases[5].observation,
      durationMs: 45_250,
    },
  },
  {
    name: "fixed distance uses lower duration",
    index: 6,
    better: {
      ...identityCases[6].observation,
      durationMs: 719_999,
    },
    worse: {
      ...identityCases[6].observation,
      durationMs: 720_000,
    },
  },
  {
    name: "fixed time uses greater distance",
    index: 7,
    better: {
      ...identityCases[7].observation,
      distanceMeters: 2_401,
    },
    worse: {
      ...identityCases[7].observation,
      distanceMeters: 2_400,
    },
  },
  {
    name: "intervals uses the plan-authored rounds comparator",
    index: 8,
    better: {
      ...identityCases[8].observation,
      completedRounds: 6,
      completedWorkMs: 180_000,
    },
    worse: {
      ...identityCases[8].observation,
      completedRounds: 5,
      completedWorkMs: 999_999,
    },
  },
  {
    name: "unscored uses completion only",
    index: 9,
    better: {
      ...identityCases[9].observation,
      completed: true,
    },
    worse: {
      ...identityCases[9].observation,
      completed: false,
    },
  },
] as const;

function compareCase(
  index: number,
  left: unknown,
  right: unknown,
) {
  const metricCase = identityCases[index]!;
  return compareMetricObservations({
    identity: metricCase.identity,
    target: metricCase.target,
    left,
    right,
  });
}

function candidate(
  observation: MetricObservation,
  overrides: Partial<MetricCandidate> = {},
): MetricCandidate {
  return {
    observation,
    completedAtMs: 1_000,
    sessionId: "session_a",
    setOrdinal: 1,
    setId: "set_a",
    ...overrides,
  };
}

function exposure(
  index: number,
  overrides: Partial<MetricExposure> = {},
): MetricExposure {
  const metricCase = identityCases[index]!;
  return {
    exerciseId: "exercise_a",
    identity: metricCase.identity,
    target: metricCase.target as MetricTarget,
    observation: metricCase.observation as MetricObservation,
    sessionStatus: "completed",
    setKind: "working",
    setStatus: "completed",
    plannedWorkingSets: 1,
    completedWorkingSets: 1,
    ...overrides,
  };
}

describe("metric comparator contracts", () => {
  test.each(comparisonCases)(
    "comparator E-68 LIB-11 $name",
    ({ index, better, worse }) => {
      expect(compareCase(index, better, worse)).toBe("better");
      expect(compareCase(index, worse, better)).toBe("worse");
      expect(compareCase(index, better, { ...better })).toBe("equal");
    },
  );

  test("comparator assisted sets meeting the target outrank incomplete sets", () => {
    expect(
      compareMetricObservations({
        identity: identityCases[3].identity,
        target: {
          ...identityCases[3].target,
          minReps: 8,
        },
        left: {
          ...identityCases[3].observation,
          assistanceGrams: 25_000,
          reps: 8,
        },
        right: {
          ...identityCases[3].observation,
          assistanceGrams: 5_000,
          reps: 7,
        },
      }),
    ).toBe("better");
    expect(
      compareMetricObservations({
        identity: identityCases[3].identity,
        target: {
          ...identityCases[3].target,
          minReps: 8,
        },
        left: {
          ...identityCases[3].observation,
          assistanceGrams: 20_000,
          reps: 6,
        },
        right: {
          ...identityCases[3].observation,
          assistanceGrams: 25_000,
          reps: 7,
        },
      }),
    ).toBe("worse");
  });

  test("comparator resistance and interval secondary values break ties", () => {
    expect(
      compareCase(
        0,
        {
          ...identityCases[0].observation,
          reps: 2,
        },
        identityCases[0].observation,
      ),
    ).toBe("better");
    expect(
      compareCase(
        2,
        identityCases[2].observation,
        {
          ...identityCases[2].observation,
          reps: 7,
        },
      ),
    ).toBe("better");
    expect(
      compareCase(
        3,
        identityCases[3].observation,
        {
          ...identityCases[3].observation,
          reps: 7,
        },
      ),
    ).toBe("better");
    expect(
      compareCase(
        8,
        identityCases[8].observation,
        {
          ...identityCases[8].observation,
          completedWorkMs: 179_999,
        },
      ),
    ).toBe("better");
  });

  test("comparator assisted incomplete ties use repetitions then assistance", () => {
    expect(
      compareMetricObservations({
        identity: identityCases[3].identity,
        target: {
          ...identityCases[3].target,
          minReps: 8,
        },
        left: {
          ...identityCases[3].observation,
          assistanceGrams: 19_000,
          reps: 7,
        },
        right: {
          ...identityCases[3].observation,
          assistanceGrams: 20_000,
          reps: 7,
        },
      }),
    ).toBe("better");
  });

  test("comparator E-70 LIB-11 tie order is recent then stable", () => {
    const observation = identityCases[1].observation;
    const oldest = candidate(observation, {
      completedAtMs: 999,
      sessionId: "session_a",
    });
    const newestLaterId = candidate(observation, {
      completedAtMs: 1_001,
      sessionId: "session_b",
    });
    const newestStableId = candidate(observation, {
      completedAtMs: 1_001,
      sessionId: "session_a",
      setOrdinal: 2,
      setId: "set_b",
    });
    const newestStableOrdinal = candidate(observation, {
      completedAtMs: 1_001,
      sessionId: "session_a",
      setOrdinal: 1,
      setId: "set_b",
    });
    const winner = candidate(observation, {
      completedAtMs: 1_001,
      sessionId: "session_a",
      setOrdinal: 1,
      setId: "set_a",
    });

    expect(
      selectBestMetricCandidate({
        identity: identityCases[1].identity,
        target: identityCases[1].target,
        candidates: [
          oldest,
          newestLaterId,
          newestStableId,
          newestStableOrdinal,
          winner,
        ],
      }),
    ).toBe(winner);
    expect(
      selectLastMetricCandidate([
        oldest,
        newestLaterId,
        newestStableId,
        newestStableOrdinal,
        winner,
      ]),
    ).toBe(winner);
    expect(
      selectBestMetricCandidate({
        identity: identityCases[1].identity,
        target: identityCases[1].target,
        candidates: [],
      }),
    ).toBeNull();
    expect(selectLastMetricCandidate([])).toBeNull();
  });

  test("comparator rejects fixed dimensions and unknown interval policy", () => {
    expect(() =>
      compareCase(
        6,
        {
          ...identityCases[6].observation,
          distanceMeters: 1_999,
        },
        identityCases[6].observation,
      )
    ).toThrow("metric_comparison_incompatible");
    expect(() =>
      compareCase(
        7,
        {
          ...identityCases[7].observation,
          durationMs: 719_999,
        },
        identityCases[7].observation,
      )
    ).toThrow("metric_comparison_incompatible");
    expect(() =>
      compareMetricObservations({
        identity: identityCases[8].identity,
        target: {
          ...identityCases[8].target,
          comparatorId: "unknown_policy",
        },
        left: identityCases[8].observation,
        right: identityCases[8].observation,
      })
    ).toThrow("metric_target_invalid");
  });

  test("comparator rejects interval observations outside the target protocol", () => {
    expect(() =>
      compareMetricObservations({
        identity: identityCases[8].identity,
        target: identityCases[8].target,
        left: {
          ...identityCases[8].observation,
          protocolId: "other_protocol",
        },
        right: identityCases[8].observation,
      })
    ).toThrow("metric_comparison_incompatible");
  });

  test("comparator selectors replace worse candidates and validate metadata", () => {
    const worse = candidate({
      ...identityCases[1].observation,
      reps: 10,
    });
    const better = candidate({
      ...identityCases[1].observation,
      reps: 12,
    }, {
      completedAtMs: 1_001,
      setId: "set_b",
    });
    const invalid = candidate(identityCases[1].observation, {
      completedAtMs: -1,
    });
    const maximumGeneratedId = "s".repeat(256);
    const oversizedGeneratedId = "s".repeat(257);

    expect(
      selectBestMetricCandidate({
        identity: identityCases[1].identity,
        target: identityCases[1].target,
        candidates: [worse, better],
      }),
    ).toBe(better);
    expect(
      selectBestMetricCandidate({
        identity: identityCases[1].identity,
        target: identityCases[1].target,
        candidates: [better, worse],
      }),
    ).toBe(better);
    expect(selectLastMetricCandidate([worse, better])).toBe(better);
    expect(selectLastMetricCandidate([better, worse])).toBe(better);
    expect(
      selectLastMetricCandidate([
        candidate(identityCases[1].observation, {
          sessionId: maximumGeneratedId,
          setId: maximumGeneratedId,
        }),
      ]),
    ).not.toBeNull();
    expect(() =>
      selectBestMetricCandidate({
        identity: identityCases[1].identity,
        target: identityCases[1].target,
        candidates: [invalid],
      })
    ).toThrow("metric_candidate_invalid");
    expect(() => selectLastMetricCandidate([invalid])).toThrow(
      "metric_candidate_invalid",
    );
    expect(() =>
      selectLastMetricCandidate([
        candidate(identityCases[1].observation, {
          setId: oversizedGeneratedId,
        }),
      ])
    ).toThrow("metric_candidate_invalid");
  });
});

describe("metric aggregate contracts", () => {
  test.each(identityCases)(
    "aggregate E-69 LIB-11 empty and single population for $name",
    ({ identity, observation }) => {
      expect(aggregateMetricObservations(identity, [])).toBeNull();
      expect(
        aggregateMetricObservations(identity, [observation]),
      ).toEqual(expect.objectContaining({
        version: identity.contractVersion,
        profile: identity.profile,
        sampleSize: 1,
      }));
    },
  );

  test("aggregate computes profile-specific finite means", () => {
    expect(
      aggregateMetricObservations(identityCases[0].identity, [
        {
          ...identityCases[0].observation,
          loadGrams: 10_000,
          reps: 8,
        },
        {
          ...identityCases[0].observation,
          loadGrams: 11_000,
          reps: 9,
        },
      ]),
    ).toEqual({
      version: 1,
      profile: "load_reps",
      sampleSize: 2,
      meanLoadGrams: 10_500,
      meanReps: 8.5,
    });
    expect(
      aggregateMetricObservations(identityCases[3].identity, [
        {
          ...identityCases[3].observation,
          assistanceGrams: 20_000,
          reps: 8,
        },
        {
          ...identityCases[3].observation,
          assistanceGrams: 19_000,
          reps: 9,
        },
      ]),
    ).toEqual({
      version: 1,
      profile: "assisted_reps",
      sampleSize: 2,
      meanAssistanceGrams: 19_500,
      meanReps: 8.5,
    });
    expect(
      aggregateMetricObservations(identityCases[5].identity, [
        {
          ...identityCases[5].observation,
          durationMs: 45_000,
        },
        {
          ...identityCases[5].observation,
          durationMs: 46_000,
        },
      ]),
    ).toEqual({
      version: 2,
      profile: "timed_hold",
      sampleSize: 2,
      meanDurationMs: 45_500,
    });
    expect(
      aggregateMetricObservations(identityCases[8].identity, [
        identityCases[8].observation,
        {
          ...identityCases[8].observation,
          completedRounds: 5,
          completedWorkMs: 150_000,
        },
      ]),
    ).toEqual({
      version: 1,
      profile: "intervals",
      sampleSize: 2,
      protocolId: "bike_30_30_6",
      meanCompletedRounds: 5.5,
      meanCompletedWorkMs: 165_000,
    });
    expect(
      aggregateMetricObservations(identityCases[9].identity, [
        identityCases[9].observation,
        {
          ...identityCases[9].observation,
          completed: false,
        },
      ]),
    ).toEqual({
      version: 1,
      profile: "unscored",
      sampleSize: 2,
      completionRate: 0.5,
    });
  });

  test("aggregate covers remaining profile-specific fields", () => {
    expect(
      aggregateMetricObservations(identityCases[1].identity, [
        identityCases[1].observation,
      ]),
    ).toEqual({
      version: 1,
      profile: "bodyweight_reps",
      sampleSize: 1,
      meanReps: 12,
    });
    expect(
      aggregateMetricObservations(identityCases[2].identity, [
        identityCases[2].observation,
      ]),
    ).toEqual({
      version: 1,
      profile: "added_load_reps",
      sampleSize: 1,
      meanAddedLoadGrams: 10_000,
      meanReps: 8,
    });
    expect(
      aggregateMetricObservations(identityCases[4].identity, [
        identityCases[4].observation,
      ]),
    ).toEqual({
      version: 1,
      profile: "timed_hold",
      sampleSize: 1,
      meanDurationSeconds: 43,
    });
    expect(
      aggregateMetricObservations(identityCases[6].identity, [
        identityCases[6].observation,
      ]),
    ).toEqual({
      version: 1,
      profile: "fixed_distance",
      sampleSize: 1,
      meanDurationMs: 720_000,
    });
    expect(
      aggregateMetricObservations(identityCases[7].identity, [
        identityCases[7].observation,
      ]),
    ).toEqual({
      version: 1,
      profile: "fixed_time",
      sampleSize: 1,
      meanDistanceMeters: 2_400,
    });
  });

  test("aggregate rejects mixed interval protocols", () => {
    expect(() =>
      aggregateMetricObservations(identityCases[8].identity, [
        identityCases[8].observation,
        {
          ...identityCases[8].observation,
          protocolId: "other_protocol",
        },
      ])
    ).toThrow("metric_aggregate_incompatible");
  });

  test("aggregate rejects mixed fixed-distance and fixed-time protocols", () => {
    expect(() =>
      aggregateMetricObservations(identityCases[6].identity, [
        identityCases[6].observation,
        {
          ...identityCases[6].observation,
          distanceMeters: 2_001,
        },
      ])
    ).toThrow("metric_aggregate_incompatible");
    expect(() =>
      aggregateMetricObservations(identityCases[7].identity, [
        identityCases[7].observation,
        {
          ...identityCases[7].observation,
          durationMs: 719_999,
        },
      ])
    ).toThrow("metric_aggregate_incompatible");
  });

  test("aggregate E-76 LIB-11 rounding is presentation-only", () => {
    const aggregate = aggregateMetricObservations(
      identityCases[0].identity,
      [
        {
          ...identityCases[0].observation,
          loadGrams: 1_000,
          reps: 1,
        },
        {
          ...identityCases[0].observation,
          loadGrams: 1_001,
          reps: 2,
        },
        {
          ...identityCases[0].observation,
          loadGrams: 1_003,
          reps: 2,
        },
      ],
    );

    expect(aggregate).toEqual(expect.objectContaining({
      meanLoadGrams: 1_001.3333333333334,
      meanReps: 1.6666666666666667,
    }));
    expect(
      roundMetricAggregateForPresentation(aggregate!, {
        loadFractionDigits: 0,
        assistanceFractionDigits: 0,
        distanceFractionDigits: 1,
      }),
    ).toEqual({
      version: 1,
      profile: "load_reps",
      sampleSize: 3,
      meanLoadGrams: 1_001,
      meanReps: 1.7,
    });
    expect(aggregate).toEqual(expect.objectContaining({
      meanLoadGrams: 1_001.3333333333334,
      meanReps: 1.6666666666666667,
    }));
    expect(() =>
      parseMetricObservation(identityCases[1].identity, {
        ...identityCases[1].observation,
        reps: 1.7,
      })
    ).toThrow("metric_observation_invalid");
    expect(formatMetricDuration(599_500)).toBe("600 sec");
    expect(formatMetricDuration(600_000)).toBe("10:00");
    expect(formatMetricDuration(3_661_000)).toBe("61:01");
  });

  test("aggregate E-78 LIB-11 rejects oversized populations deterministically", () => {
    const population = Array.from(
      { length: 10_001 },
      () => identityCases[1].observation,
    );

    expect(() =>
      aggregateMetricObservations(identityCases[1].identity, population)
    ).toThrow(
      expect.objectContaining({
        code: "metric_aggregate_population_too_large",
      } satisfies Partial<MetricAggregateError>),
    );
    expect(population).toHaveLength(10_001);
  });

  test.each(identityCases)(
    "aggregate presentation covers $name",
    ({ identity, observation }) => {
      const aggregate = aggregateMetricObservations(identity, [observation]);
      expect(
        roundMetricAggregateForPresentation(aggregate!, {
          loadFractionDigits: 1,
          assistanceFractionDigits: 1,
          distanceFractionDigits: 1,
        }),
      ).toEqual(aggregate);
    },
  );

  test("aggregate presentation rejects invalid precision and values", () => {
    const aggregate = aggregateMetricObservations(
      identityCases[0].identity,
      [identityCases[0].observation],
    )!;
    expect(aggregate.profile).toBe("load_reps");
    if (aggregate.profile !== "load_reps") {
      throw new Error("expected load_reps aggregate");
    }

    expect(() =>
      roundMetricAggregateForPresentation(aggregate, {
        loadFractionDigits: -1,
        assistanceFractionDigits: 0,
        distanceFractionDigits: 0,
      })
    ).toThrow("metric_presentation_precision_invalid");
    expect(() =>
      roundMetricAggregateForPresentation({
        ...aggregate,
        meanLoadGrams: Number.POSITIVE_INFINITY,
      }, {
        loadFractionDigits: 0,
        assistanceFractionDigits: 0,
        distanceFractionDigits: 0,
      })
    ).toThrow("metric_aggregate_non_finite");
    expect(() =>
      roundMetricAggregateForPresentation({
        ...aggregate,
        meanLoadGrams: -1,
      }, {
        loadFractionDigits: 0,
        assistanceFractionDigits: 0,
        distanceFractionDigits: 0,
      })
    ).toThrow("metric_aggregate_non_finite");
    expect(() => formatMetricDuration(-1)).toThrow(
      "metric_presentation_precision_invalid",
    );
  });
});

describe("metric exposure contracts", () => {
  test.each([
    {
      name: "completed session",
      overrides: {},
      eligible: true,
    },
    {
      name: "partial session with complete exercise sets",
      overrides: { sessionStatus: "partial" },
      eligible: true,
    },
    {
      name: "in-progress session",
      overrides: { sessionStatus: "in_progress" },
      eligible: false,
    },
    {
      name: "discarded session",
      overrides: { sessionStatus: "discarded" },
      eligible: false,
    },
    {
      name: "voided session",
      overrides: { sessionStatus: "voided" },
      eligible: false,
    },
    {
      name: "zero-set session",
      overrides: { sessionStatus: "zero_sets" },
      eligible: false,
    },
    {
      name: "warm-up",
      overrides: { setKind: "warmup" },
      eligible: false,
    },
    {
      name: "skipped set",
      overrides: { setStatus: "skipped" },
      eligible: false,
    },
    {
      name: "draft set",
      overrides: { setStatus: "draft" },
      eligible: false,
    },
    {
      name: "incomplete exercise",
      overrides: {
        plannedWorkingSets: 2,
        completedWorkingSets: 1,
      },
      eligible: false,
    },
  ])("exposure population includes $name: $eligible", ({
    overrides,
    eligible,
  }) => {
    expect(
      isMetricExposureEligible(exposure(0, overrides as Partial<MetricExposure>)),
    ).toBe(eligible);
  });

  test("exposure E-77 LIB-11 enforces D-37 identity segmentation", () => {
    const reference = exposure(0);

    expect(areMetricExposuresComparable(reference, { ...reference })).toBe(
      true,
    );
    expect(
      areMetricExposuresComparable(reference, {
        ...reference,
        exerciseId: "exercise_b",
      }),
    ).toBe(false);
    expect(
      areMetricExposuresComparable(reference, {
        ...reference,
        identity: {
          ...reference.identity,
          contractVersion: 2,
        },
      }),
    ).toBe(false);
    expect(
      areMetricExposuresComparable(reference, {
        ...reference,
        identity: {
          ...reference.identity,
          exerciseMetricGeneration:
            reference.identity.exerciseMetricGeneration + 1,
        },
      }),
    ).toBe(false);
    expect(
      areMetricExposuresComparable(reference, exposure(1)),
    ).toBe(false);
  });

  test("exposure rejects fixed and interval protocol mismatches", () => {
    const fixedDistance = exposure(6);
    const fixedTime = exposure(7);
    const intervals = exposure(8);

    expect(
      areMetricExposuresComparable(fixedDistance, {
        ...fixedDistance,
        target: {
          ...identityCases[6].target,
          plannedDistanceMeters: 2_001,
        },
        observation: {
          ...identityCases[6].observation,
          distanceMeters: 2_001,
        },
      }),
    ).toBe(false);
    expect(
      areMetricExposuresComparable(fixedTime, {
        ...fixedTime,
        target: {
          ...identityCases[7].target,
          plannedDurationMs: 719_999,
        },
        observation: {
          ...identityCases[7].observation,
          durationMs: 719_999,
        },
      }),
    ).toBe(false);
    expect(
      areMetricExposuresComparable(intervals, {
        ...intervals,
        target: {
          ...identityCases[8].target,
          protocolId: "bike_30_30_7",
        },
        observation: {
          ...identityCases[8].observation,
          protocolId: "bike_30_30_7",
        },
      }),
    ).toBe(false);
    expect(
      areMetricExposuresComparable(intervals, {
        ...intervals,
        target: {
          ...identityCases[8].target,
          comparatorVersion: 2,
        },
      }),
    ).toBe(false);
    expect(
      areMetricExposuresComparable(intervals, {
        ...intervals,
        target: {
          ...identityCases[8].target,
          workIntervalMs: 31_000,
        },
      }),
    ).toBe(false);
    expect(
      areMetricExposuresComparable(intervals, {
        ...intervals,
        target: {
          ...identityCases[8].target,
          restIntervalMs: 31_000,
        },
      }),
    ).toBe(false);
  });

  test("exposure rejects target-significant variation, equipment, and side mismatches", () => {
    const bodyweight = exposure(1);
    const assisted = exposure(3);
    const timed = exposure(5);

    expect(
      areMetricExposuresComparable(bodyweight, {
        ...bodyweight,
        target: {
          ...identityCases[1].target,
          variationId: "incline",
        },
      }),
    ).toBe(false);
    expect(
      areMetricExposuresComparable(assisted, {
        ...assisted,
        target: {
          ...identityCases[3].target,
          assistanceEquipmentId: "band_blue",
        },
      }),
    ).toBe(false);
    expect(
      areMetricExposuresComparable(timed, {
        ...timed,
        target: {
          ...identityCases[5].target,
          perSide: true,
        },
      }),
    ).toBe(false);
  });

  test("exposure rejects ineligible and internally inconsistent observations", () => {
    const fixedDistance = exposure(6);

    expect(
      areMetricExposuresComparable(
        fixedDistance,
        exposure(6, { sessionStatus: "in_progress" }),
      ),
    ).toBe(false);
    expect(
      areMetricExposuresComparable(fixedDistance, {
        ...fixedDistance,
        observation: {
          ...identityCases[6].observation,
          distanceMeters: 1_999,
        },
      }),
    ).toBe(false);
    expect(
      areMetricExposuresComparable(exposure(8), {
        ...exposure(8),
        observation: {
          ...identityCases[8].observation,
          protocolId: "other_protocol",
        },
      }),
    ).toBe(false);
  });

  test("exposure treats malformed persisted contracts as incomparable", () => {
    const reference = exposure(0);

    expect(
      areMetricExposuresComparable(reference, {
        ...reference,
        target: {} as MetricTarget,
      }),
    ).toBe(false);
  });

  test("exposure E-78 LIB-11 remains pure under repeated interleaving", () => {
    const load = exposure(0);
    const bodyweight = exposure(1);
    const first = areMetricExposuresComparable(load, { ...load });

    expect(areMetricExposuresComparable(bodyweight, { ...bodyweight })).toBe(
      true,
    );
    expect(areMetricExposuresComparable(load, { ...load })).toBe(first);
    expect(load).toEqual(exposure(0));
    expect(bodyweight).toEqual(exposure(1));
  });
});
