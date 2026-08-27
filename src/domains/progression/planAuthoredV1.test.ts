import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  evaluateProgressionPolicy,
  type ProgressionPolicyInput,
} from "./policyRegistry";

function input(
  overrides: Partial<ProgressionPolicyInput>,
): ProgressionPolicyInput {
  return {
    version: 1,
    policy: {
      kind: "plan_authored",
      id: "fixed_distance.plan_authored.v1",
      version: 1,
      rule: {
        kind: "plan_authored",
        id: "fixed_distance.plan_authored.v1",
        version: 1,
      },
    },
    metricIdentity: {
      profile: "fixed_distance",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    },
    currentTarget: {
      version: 1,
      profile: "fixed_distance",
      plannedDistanceMeters: 200,
    },
    sourceFacts: [{
      version: 1,
      profile: "fixed_distance",
      distanceMeters: 200,
      durationMs: 72_000,
      source: "manual",
    }],
    ...overrides,
  };
}

describe("named copied-plan non-load policies", () => {
  it.each([
    {
      label: "assisted repetitions",
      policyId: "assisted_reps.manual_hold.v1",
      identity: {
        profile: "assisted_reps",
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      currentTarget: {
        version: 1,
        profile: "assisted_reps",
        assistanceGrams: 15_000,
        minReps: 6,
        maxReps: 10,
        decrementGrams: 5_000,
        assistanceEquipmentId: "loop-band-equivalent",
        perSide: false,
      },
      sourceFacts: [{
        version: 1,
        profile: "assisted_reps",
        assistanceGrams: 15_000,
        reps: 10,
        source: "manual",
      }],
      dimensions: { assistanceEquipmentId: "loop-band-equivalent" },
    },
    {
      label: "bodyweight variation",
      policyId: "bodyweight_reps.manual_hold.v1",
      identity: {
        profile: "bodyweight_reps",
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      currentTarget: {
        version: 1,
        profile: "bodyweight_reps",
        minReps: 6,
        maxReps: 10,
        variationId: "standard-chin-up",
        perSide: false,
      },
      sourceFacts: [{
        version: 1,
        profile: "bodyweight_reps",
        reps: 10,
        source: "manual",
      }],
      dimensions: { variationId: "standard-chin-up" },
    },
    {
      label: "timed hold",
      policyId: "timed_hold.manual_hold.v1",
      identity: {
        profile: "timed_hold",
        contractVersion: 2,
        exerciseMetricGeneration: 1,
      },
      currentTarget: {
        version: 2,
        profile: "timed_hold",
        durationMs: 60_000,
        perSide: false,
      },
      sourceFacts: [{
        version: 2,
        profile: "timed_hold",
        durationMs: 60_000,
        source: "manual",
      }],
      dimensions: { perSide: false },
    },
  ] as const)(
    "keeps $label manual and non-actionable",
    ({ policyId, identity, currentTarget, sourceFacts, dimensions }) => {
      const result = evaluateProgressionPolicy(input({
        policy: {
          kind: "manual_hold",
          id: policyId,
          version: 1,
          rule: { kind: "manual_hold", id: policyId, version: 1 },
        },
        metricIdentity: identity,
        currentTarget,
        sourceFacts,
      }));

      expect(result).toMatchObject({
        version: 1,
        profile: identity.profile,
        policy: { id: policyId, version: 1 },
        decision: "manual",
        reasonCode: "manual_hold",
        review: { actionable: false },
        proposedTarget: null,
        evidence: {
          immutableComparatorDimensions: dimensions,
          comparableSourceFacts: sourceFacts,
        },
      });
    },
  );

  it.each([
    {
      label: "fixed distance",
      policy: {
        kind: "plan_authored",
        id: "fixed_distance.plan_authored.v1",
        version: 1,
        rule: {
          kind: "plan_authored",
          id: "fixed_distance.plan_authored.v1",
          version: 1,
        },
      },
      identity: {
        profile: "fixed_distance",
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      currentTarget: {
        version: 1,
        profile: "fixed_distance",
        plannedDistanceMeters: 200,
      },
      sourceFacts: [{
        version: 1,
        profile: "fixed_distance",
        distanceMeters: 200,
        durationMs: 72_000,
        source: "manual",
      }],
      dimensions: { plannedDistanceMeters: 200 },
    },
    {
      label: "fixed time",
      policy: {
        kind: "plan_authored",
        id: "fixed_time.plan_authored.v1",
        version: 1,
        rule: {
          kind: "plan_authored",
          id: "fixed_time.plan_authored.v1",
          version: 1,
        },
      },
      identity: {
        profile: "fixed_time",
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      currentTarget: {
        version: 1,
        profile: "fixed_time",
        plannedDurationMs: 720_000,
      },
      sourceFacts: [{
        version: 1,
        profile: "fixed_time",
        durationMs: 720_000,
        distanceMeters: 2_400,
        source: "manual",
      }],
      dimensions: { plannedDurationMs: 720_000 },
    },
    {
      label: "intervals",
      policy: {
        kind: "plan_authored",
        id: "intervals.plan_authored.v1",
        version: 1,
        rule: {
          kind: "plan_authored",
          id: "intervals.plan_authored.v1",
          version: 1,
        },
      },
      identity: {
        profile: "intervals",
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      currentTarget: {
        version: 1,
        profile: "intervals",
        protocolId: "battling-ropes-30s-30s-8r-v1",
        comparatorId: "rounds_then_work",
        comparatorVersion: 1,
        plannedRounds: 8,
        workIntervalMs: 30_000,
        restIntervalMs: 30_000,
      },
      sourceFacts: [{
        version: 1,
        profile: "intervals",
        protocolId: "battling-ropes-30s-30s-8r-v1",
        completedRounds: 8,
        completedWorkMs: 240_000,
        source: "manual",
      }],
      dimensions: {
        protocolId: "battling-ropes-30s-30s-8r-v1",
        comparatorId: "rounds_then_work",
        comparatorVersion: 1,
        plannedRounds: 8,
        workIntervalMs: 30_000,
        restIntervalMs: 30_000,
      },
    },
  ] as const)(
    "reviews the named $label target without proposing a generic change",
    ({ policy, identity, currentTarget, sourceFacts, dimensions }) => {
      const result = evaluateProgressionPolicy(input({
        policy,
        metricIdentity: identity,
        currentTarget,
        sourceFacts,
      }));

      expect(result).toMatchObject({
        decision: "hold",
        reasonCode: "plan_authored_fixed_target_reviewed",
        policy: { id: policy.id, version: 1 },
        currentTarget,
        proposedTarget: null,
        review: { actionable: false },
        evidence: {
          immutableComparatorDimensions: dimensions,
          comparableSourceFacts: sourceFacts,
        },
      });
    },
  );

  it.each([
    {
      label: "an unknown policy id",
      overrides: {
        policy: {
          kind: "plan_authored",
          id: "fixed_distance.unreviewed.v1",
          version: 1,
          rule: {
            kind: "plan_authored",
            id: "fixed_distance.unreviewed.v1",
            version: 1,
          },
        },
      },
      reasonCode: "manual_unknown_policy",
    },
    {
      label: "an unsupported policy version",
      overrides: {
        policy: {
          kind: "plan_authored",
          id: "fixed_distance.plan_authored.v1",
          version: 2,
          rule: {
            kind: "plan_authored",
            id: "fixed_distance.plan_authored.v1",
            version: 2,
          },
        },
      },
      reasonCode: "manual_unsupported_policy_version",
    },
    {
      label: "a metric identity mismatch",
      overrides: {
        policyMetricIdentity: {
          profile: "fixed_time",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
      },
      reasonCode: "manual_metric_identity_mismatch",
    },
    {
      label: "an interval protocol mismatch",
      overrides: {
        policy: {
          kind: "plan_authored",
          id: "intervals.plan_authored.v1",
          version: 1,
          rule: {
            kind: "plan_authored",
            id: "intervals.plan_authored.v1",
            version: 1,
          },
        },
        metricIdentity: {
          profile: "intervals",
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        },
        currentTarget: {
          version: 1,
          profile: "intervals",
          protocolId: "battling-ropes-30s-30s-8r-v1",
          comparatorId: "rounds_then_work",
          comparatorVersion: 1,
          plannedRounds: 8,
          workIntervalMs: 30_000,
          restIntervalMs: 30_000,
        },
        sourceFacts: [{
          version: 1,
          profile: "intervals",
          protocolId: "different-protocol",
          completedRounds: 8,
          completedWorkMs: 240_000,
          source: "manual",
        }],
      },
      reasonCode: "manual_interval_protocol_mismatch",
    },
  ] as const)(
    "fails closed for $label",
    ({ overrides, reasonCode }) => {
      const result = evaluateProgressionPolicy(input(overrides));

      expect(result).toMatchObject({
        decision: "manual",
        reasonCode,
        review: { actionable: false },
        proposedTarget: null,
      });
    },
  );

  it("keeps unscored work manual even when its source fact says completed", () => {
    expect(evaluateProgressionPolicy(input({
      policy: {
        kind: "manual_hold",
        id: "unscored.manual_hold.v1",
        version: 1,
        rule: {
          kind: "manual_hold",
          id: "unscored.manual_hold.v1",
          version: 1,
        },
      },
      metricIdentity: {
        profile: "unscored",
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      currentTarget: {
        version: 1,
        profile: "unscored",
        completionRequired: true,
      },
      sourceFacts: [{
        version: 1,
        profile: "unscored",
        completed: true,
        source: "manual",
      }],
    }))).toMatchObject({
      decision: "manual",
      reasonCode: "manual_unscored",
      review: { actionable: false },
      proposedTarget: null,
    });
  });
});
