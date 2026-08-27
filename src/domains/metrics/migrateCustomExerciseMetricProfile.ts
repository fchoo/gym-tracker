import type {
  MetricProfileMigrationRepository,
} from "../../platform/sqlite/repositories/metricRepository";
import type {
  MetricIdentity,
  MetricTarget,
} from "./contracts";
import {
  metricIdentityKey,
} from "./contracts";
import {
  serializeMetricTarget,
} from "./observations";
import {
  getMetricContract,
} from "./registry";

export type MetricTargetReplacement = Readonly<{
  targetId: string;
  expectedTargetRevision: number;
  target: MetricTarget;
  unit: Readonly<Record<string, unknown>>;
}>;

export type MetricPolicyDecision =
  | Readonly<{
      planDayExerciseId: string;
      expectedPolicyRevision: number | null;
      policy: Readonly<{
        kind: "manual_hold";
        version: number;
      }>;
    }>
  | Readonly<{
      planDayExerciseId: string;
      expectedPolicyRevision: number | null;
      policy: Readonly<{
        kind: "metric";
        profile: MetricIdentity["profile"];
        version: number;
        rule: Readonly<Record<string, unknown>>;
      }>;
    }>;

export type MigrateCustomExerciseMetricProfileInput = Readonly<{
  exerciseId: string;
  expectedExerciseRevision: number;
  fromIdentity: MetricIdentity;
  toIdentity: MetricIdentity;
  replacements: readonly MetricTargetReplacement[];
  policyDecisions: readonly MetricPolicyDecision[];
  acknowledgedHistoryImmutable: boolean;
  idempotencyKey: string;
  migratedAtMs: number;
}>;

export type MetricProfileMigrationResult = Readonly<{
  outcome: "committed" | "already_committed";
  exerciseId: string;
  exerciseRevision: number;
  metricIdentity: MetricIdentity;
  migratedTargetIds: readonly string[];
  invalidatedRecommendationIds: readonly string[];
  invalidatedPolicyIds: readonly string[];
  baselineStatus: "awaiting_comparable_observation";
}>;

export class MetricProfileMigrationInputError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-METRIC03" as const;

  constructor(readonly code: string) {
    super(code);
    this.name = "MetricProfileMigrationInputError";
  }
}

function validIdentifier(value: string): boolean {
  return value.trim().length > 0 && value.length <= 128;
}

function validRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validJsonObject(
  value: Readonly<Record<string, unknown>>,
): boolean {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || Object.keys(value).length === 0
  ) {
    return false;
  }
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string"
      && serialized.length > 2
      && serialized.length <= 16_384;
  } catch {
    return false;
  }
}

function validUnitContract(
  identity: MetricIdentity,
  unit: Readonly<Record<string, unknown>>,
): boolean {
  if (
    !validJsonObject(unit)
    || unit.version !== identity.contractVersion
  ) {
    return false;
  }
  switch (identity.profile) {
    case "load_reps":
    case "added_load_reps":
    case "assisted_reps":
      return typeof unit.load === "string" || typeof unit.assistance === "string";
    case "bodyweight_reps":
      return typeof unit.count === "string";
    case "timed_hold":
    case "fixed_time":
      return typeof unit.duration === "string";
    case "fixed_distance":
      return typeof unit.distance === "string";
    case "intervals":
      return typeof unit.protocol === "string";
    case "unscored":
      return typeof unit.completion === "string";
  }
}

function assertUnique(
  values: readonly string[],
  code: string,
): void {
  if (new Set(values).size !== values.length) {
    throw new MetricProfileMigrationInputError(code);
  }
}

function validateReplacement(
  replacement: MetricTargetReplacement,
  identity: MetricIdentity,
): void {
  if (
    !validIdentifier(replacement.targetId)
    || !validRevision(replacement.expectedTargetRevision)
    || !validUnitContract(identity, replacement.unit)
  ) {
    throw new MetricProfileMigrationInputError(
      "metric_profile_replacement_invalid",
    );
  }
  serializeMetricTarget(identity, replacement.target);
}

function validatePolicyDecision(
  decision: MetricPolicyDecision,
  identity: MetricIdentity,
): void {
  if (
    !validIdentifier(decision.planDayExerciseId)
    || (
      decision.expectedPolicyRevision !== null
      && !validRevision(decision.expectedPolicyRevision)
    )
    || !Number.isSafeInteger(decision.policy.version)
    || decision.policy.version < 1
  ) {
    throw new MetricProfileMigrationInputError(
      "metric_profile_policy_invalid",
    );
  }
  if (
    decision.policy.kind === "metric"
    && (
      decision.policy.profile !== identity.profile
      || !validJsonObject(decision.policy.rule)
    )
  ) {
    throw new MetricProfileMigrationInputError(
      "metric_profile_policy_invalid",
    );
  }
}

function validateInput(input: MigrateCustomExerciseMetricProfileInput): void {
  if (
    !validIdentifier(input.exerciseId)
    || !validRevision(input.expectedExerciseRevision)
    || !validIdentifier(input.idempotencyKey)
    || !Number.isSafeInteger(input.migratedAtMs)
    || input.migratedAtMs < 0
  ) {
    throw new MetricProfileMigrationInputError(
      "metric_profile_migration_input_invalid",
    );
  }
  getMetricContract(input.fromIdentity);
  getMetricContract(input.toIdentity);
  if (metricIdentityKey(input.fromIdentity) === metricIdentityKey(input.toIdentity)) {
    throw new MetricProfileMigrationInputError(
      "metric_profile_identity_unchanged",
    );
  }
  if (
    input.toIdentity.exerciseMetricGeneration
    !== input.fromIdentity.exerciseMetricGeneration + 1
  ) {
    throw new MetricProfileMigrationInputError(
      "metric_profile_generation_invalid",
    );
  }
  if (!input.acknowledgedHistoryImmutable) {
    throw new MetricProfileMigrationInputError(
      "metric_profile_history_acknowledgement_required",
    );
  }
  if (input.replacements.length === 0) {
    throw new MetricProfileMigrationInputError(
      "metric_profile_replacements_required",
    );
  }
  assertUnique(
    input.replacements.map(({ targetId }) => targetId),
    "metric_profile_replacement_duplicate",
  );
  for (const replacement of input.replacements) {
    validateReplacement(replacement, input.toIdentity);
  }
  if (input.policyDecisions.length === 0) {
    throw new MetricProfileMigrationInputError(
      "metric_profile_policy_decisions_required",
    );
  }
  assertUnique(
    input.policyDecisions.map(({ planDayExerciseId }) => planDayExerciseId),
    "metric_profile_policy_duplicate",
  );
  for (const decision of input.policyDecisions) {
    validatePolicyDecision(decision, input.toIdentity);
  }
}

export function migrateCustomExerciseMetricProfile(input: Readonly<{
  repository: MetricProfileMigrationRepository;
  input: MigrateCustomExerciseMetricProfileInput;
}>): Promise<MetricProfileMigrationResult> {
  validateInput(input.input);
  return input.repository.migrateCustomExerciseMetricProfile(input.input);
}
