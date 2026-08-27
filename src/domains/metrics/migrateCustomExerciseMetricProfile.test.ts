import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import type {
  MetricProfileMigrationRepository,
} from "../../platform/sqlite/repositories/metricRepository";
import type {
  MetricIdentity,
  MetricTarget,
} from "./contracts";
import {
  migrateCustomExerciseMetricProfile,
  type MigrateCustomExerciseMetricProfileInput,
} from "./migrateCustomExerciseMetricProfile";

const target = {
  version: 2,
  profile: "timed_hold",
  durationMs: 45_000,
  perSide: false,
} as const;

const input: MigrateCustomExerciseMetricProfileInput = {
  exerciseId: "exercise-plank",
  expectedExerciseRevision: 3,
  fromIdentity: {
    profile: "timed_hold",
    contractVersion: 1,
    exerciseMetricGeneration: 1,
  },
  toIdentity: {
    profile: "timed_hold",
    contractVersion: 2,
    exerciseMetricGeneration: 2,
  },
  replacements: [
    {
      targetId: "target-a",
      expectedTargetRevision: 6,
      target,
      unit: {
        version: 2,
        duration: "milliseconds",
      },
    },
    {
      targetId: "target-b",
      expectedTargetRevision: 4,
      target,
      unit: {
        version: 2,
        duration: "milliseconds",
      },
    },
  ],
  policyDecisions: [
    {
      planDayExerciseId: "occurrence-a",
      expectedPolicyRevision: 4,
      policy: {
        kind: "manual_hold",
        version: 1,
      },
    },
    {
      planDayExerciseId: "occurrence-b",
      expectedPolicyRevision: null,
      policy: {
        kind: "metric",
        profile: "timed_hold",
        version: 2,
        rule: {
          version: 2,
          progression: "manual",
        },
      },
    },
  ],
  acknowledgedHistoryImmutable: true,
  idempotencyKey: "metric-profile-exercise-plank-2",
  migratedAtMs: 1_787_000_000_000,
};

function repository(): MetricProfileMigrationRepository {
  return {
    migrateCustomExerciseMetricProfile: jest.fn(async () => ({
      outcome: "committed" as const,
      exerciseId: input.exerciseId,
      exerciseRevision: input.expectedExerciseRevision + 1,
      metricIdentity: input.toIdentity,
      migratedTargetIds: ["target-a", "target-b"],
      invalidatedRecommendationIds: ["recommendation-a"],
      invalidatedPolicyIds: ["policy-a"],
      baselineStatus: "awaiting_comparable_observation" as const,
    })),
    readComparableHistory: jest.fn(async () => []),
  };
}

const INVALID_CASES: readonly Readonly<{
  name: string;
  change: Partial<MigrateCustomExerciseMetricProfileInput>;
  error: string;
}>[] = [
  {
    name: "missing immutable-history acknowledgement",
    change: { acknowledgedHistoryImmutable: false },
    error: "metric_profile_history_acknowledgement_required",
  },
  {
    name: "non-monotonic generation",
    change: {
      toIdentity: {
        ...input.toIdentity,
        exerciseMetricGeneration: 1,
      },
    },
    error: "metric_profile_generation_invalid",
  },
  {
    name: "same metric identity",
    change: { toIdentity: input.fromIdentity },
    error: "metric_profile_identity_unchanged",
  },
  {
    name: "unsupported metric identity",
    change: {
      toIdentity: {
        ...input.toIdentity,
        contractVersion: 99,
      },
    },
    error: "metric_identity_unsupported",
  },
  {
    name: "missing replacement map",
    change: { replacements: [] },
    error: "metric_profile_replacements_required",
  },
  {
    name: "duplicate replacement target",
    change: {
      replacements: [input.replacements[0]!, input.replacements[0]!],
    },
    error: "metric_profile_replacement_duplicate",
  },
  {
    name: "target revision below zero",
    change: {
      replacements: [{
        ...input.replacements[0]!,
        expectedTargetRevision: -1,
      }],
    },
    error: "metric_profile_replacement_invalid",
  },
  {
    name: "oversized replacement target identifier",
    change: {
      replacements: [{
        ...input.replacements[0]!,
        targetId: "x".repeat(129),
      }],
    },
    error: "metric_profile_replacement_invalid",
  },
  {
    name: "replacement for another profile",
    change: {
      replacements: [{
        ...input.replacements[0]!,
        target: {
          version: 1,
          profile: "unscored",
          completionRequired: true,
        },
      }],
    },
    error: "metric_target_invalid",
  },
  {
    name: "missing unit/default contract",
    change: {
      replacements: [{
        ...input.replacements[0]!,
        unit: {},
      }],
    },
    error: "metric_profile_replacement_invalid",
  },
  {
    name: "missing policy decisions",
    change: { policyDecisions: [] },
    error: "metric_profile_policy_decisions_required",
  },
  {
    name: "duplicate policy occurrence",
    change: {
      policyDecisions: [
        input.policyDecisions[0]!,
        input.policyDecisions[0]!,
      ],
    },
    error: "metric_profile_policy_duplicate",
  },
  {
    name: "invalid policy revision",
    change: {
      policyDecisions: [{
        ...input.policyDecisions[0]!,
        expectedPolicyRevision: -1,
      }],
    },
    error: "metric_profile_policy_invalid",
  },
  {
    name: "invalid metric policy profile",
    change: {
      policyDecisions: [{
        planDayExerciseId: "occurrence-a",
        expectedPolicyRevision: 4,
        policy: {
          kind: "metric",
          profile: "unscored",
          version: 1,
          rule: { version: 1 },
        },
      }],
    },
    error: "metric_profile_policy_invalid",
  },
  {
    name: "invalid metric policy rule",
    change: {
      policyDecisions: [{
        planDayExerciseId: "occurrence-a",
        expectedPolicyRevision: 4,
        policy: {
          kind: "metric",
          profile: "timed_hold",
          version: 2,
          rule: {},
        },
      }],
    },
    error: "metric_profile_policy_invalid",
  },
  {
    name: "invalid policy version",
    change: {
      policyDecisions: [{
        ...input.policyDecisions[0]!,
        policy: {
          kind: "manual_hold",
          version: 0,
        },
      }],
    },
    error: "metric_profile_policy_invalid",
  },
  {
    name: "unsafe policy version",
    change: {
      policyDecisions: [{
        ...input.policyDecisions[0]!,
        policy: {
          kind: "manual_hold",
          version: Number.NaN,
        },
      }],
    },
    error: "metric_profile_policy_invalid",
  },
  {
    name: "empty idempotency key",
    change: { idempotencyKey: " " },
    error: "metric_profile_migration_input_invalid",
  },
  {
    name: "unsafe migration time",
    change: { migratedAtMs: -1 },
    error: "metric_profile_migration_input_invalid",
  },
  {
    name: "unsafe exercise revision",
    change: { expectedExerciseRevision: Number.NaN },
    error: "metric_profile_migration_input_invalid",
  },
  {
    name: "invalid exercise identifier",
    change: { exerciseId: " " },
    error: "metric_profile_migration_input_invalid",
  },
  {
    name: "unsafe migration timestamp",
    change: { migratedAtMs: Number.NaN },
    error: "metric_profile_migration_input_invalid",
  },
];

const UNIT_CASES: readonly Readonly<{
  name: string;
  identity: MetricIdentity;
  target: MetricTarget;
  unit: Readonly<Record<string, unknown>>;
}>[] = [
  {
    name: "load reps",
    identity: {
      profile: "load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "load_reps",
      loadGrams: 0,
      minReps: 1,
      maxReps: 1,
      incrementGrams: 1,
      perSide: false,
    },
    unit: { version: 1, load: "grams" },
  },
  {
    name: "bodyweight reps",
    identity: {
      profile: "bodyweight_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "bodyweight_reps",
      minReps: 1,
      maxReps: 1,
      variationId: "strict",
      perSide: false,
    },
    unit: { version: 1, count: "repetitions" },
  },
  {
    name: "added load reps",
    identity: {
      profile: "added_load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "added_load_reps",
      addedLoadGrams: 0,
      minReps: 1,
      maxReps: 1,
      incrementGrams: 1,
      perSide: false,
    },
    unit: { version: 1, load: "grams" },
  },
  {
    name: "assisted reps",
    identity: {
      profile: "assisted_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "assisted_reps",
      assistanceGrams: 0,
      minReps: 1,
      maxReps: 1,
      decrementGrams: 1,
      assistanceEquipmentId: "machine",
      perSide: false,
    },
    unit: { version: 1, assistance: "grams" },
  },
  {
    name: "fixed distance",
    identity: {
      profile: "fixed_distance",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "fixed_distance",
      plannedDistanceMeters: 1,
    },
    unit: { version: 1, distance: "meters" },
  },
  {
    name: "fixed time",
    identity: {
      profile: "fixed_time",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "fixed_time",
      plannedDurationMs: 1,
    },
    unit: { version: 1, duration: "milliseconds" },
  },
  {
    name: "intervals",
    identity: {
      profile: "intervals",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "intervals",
      protocolId: "one",
      comparatorId: "rounds_then_work",
      comparatorVersion: 1,
      plannedRounds: 1,
      workIntervalMs: 1,
      restIntervalMs: 0,
    },
    unit: { version: 1, protocol: "rounds" },
  },
  {
    name: "unscored",
    identity: {
      profile: "unscored",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "unscored",
      completionRequired: true,
    },
    unit: { version: 1, completion: "boolean" },
  },
];

describe("D-34 through D-39 metric profile migration command", () => {
  it("delegates one explicit future-only migration after complete validation", async () => {
    const port = repository();

    await expect(migrateCustomExerciseMetricProfile({
      repository: port,
      input,
    })).resolves.toEqual({
      baselineStatus: "awaiting_comparable_observation",
      exerciseId: "exercise-plank",
      exerciseRevision: 4,
      invalidatedPolicyIds: ["policy-a"],
      invalidatedRecommendationIds: ["recommendation-a"],
      metricIdentity: input.toIdentity,
      migratedTargetIds: ["target-a", "target-b"],
      outcome: "committed",
    });
    expect(port.migrateCustomExerciseMetricProfile).toHaveBeenCalledWith(input);
  });

  it.each(INVALID_CASES)(
    "rejects $name before repository access",
    ({ change, error }) => {
    const port = repository();

    expect(() => migrateCustomExerciseMetricProfile({
      repository: port,
      input: {
        ...input,
        ...change,
      } as MigrateCustomExerciseMetricProfileInput,
    })).toThrow(error);
    expect(port.migrateCustomExerciseMetricProfile).not.toHaveBeenCalled();
    },
  );

  it.each(UNIT_CASES)(
    "accepts the explicit $name unit contract",
    async ({ identity, target: replacementTarget, unit }) => {
      const port = repository();
      await expect(migrateCustomExerciseMetricProfile({
        repository: port,
        input: {
          ...input,
          toIdentity: identity,
          replacements: [{
            targetId: "target-a",
            expectedTargetRevision: 1,
            target: replacementTarget,
            unit,
          }],
          policyDecisions: [{
            planDayExerciseId: "occurrence-a",
            expectedPolicyRevision: 1,
            policy: { kind: "manual_hold", version: 1 },
          }],
        },
      })).resolves.toEqual(expect.objectContaining({ outcome: "committed" }));
    },
  );

  it.each([
    ["wrong version", { version: 1, duration: "milliseconds" }],
    ["array", []],
    ["null", null],
    ["primitive", "milliseconds"],
    ["oversized", { version: 2, duration: "x".repeat(16_385) }],
    ["empty serialization", {
      version: 2,
      duration: "milliseconds",
      toJSON: () => ({}),
    }],
  ])("rejects %s unit data", (_, unit) => {
    expect(() => migrateCustomExerciseMetricProfile({
      repository: repository(),
      input: {
        ...input,
        replacements: [{
          ...input.replacements[0]!,
          unit: unit as never,
        }],
      },
    })).toThrow("metric_profile_replacement_invalid");
  });

  it("rejects a circular unit contract", () => {
    const unit: Record<string, unknown> = { version: 2 };
    unit.duration = unit;
    expect(() => migrateCustomExerciseMetricProfile({
      repository: repository(),
      input: {
        ...input,
        replacements: [{
          ...input.replacements[0]!,
          unit,
        }],
      },
    })).toThrow("metric_profile_replacement_invalid");
  });
});
