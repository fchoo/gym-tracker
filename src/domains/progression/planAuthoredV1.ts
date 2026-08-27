import {
  parseMetricIdentity,
  parseMetricObservation,
  parseMetricTarget,
  type MetricIdentity,
  type MetricObservation,
  type MetricProfile,
  type MetricTarget,
} from "../metrics";

export type PlanOwnedPolicy = Readonly<{
  kind: string;
  id: string;
  version: number;
  rule: unknown;
}>;

export type PlanAuthoredPolicyDefinition = Readonly<{
  kind: "manual_hold" | "plan_authored";
  id: string;
  version: 1;
  profile: MetricProfile;
  outcome: "manual_hold" | "plan_authored_fixed_target";
}>;

export type PlanAuthoredProgressionInput = Readonly<{
  version: 1;
  policy: PlanOwnedPolicy;
  definition: PlanAuthoredPolicyDefinition;
  metricIdentity: MetricIdentity;
  /** Identity persisted beside the copied policy, when available. */
  policyMetricIdentity?: MetricIdentity;
  currentTarget: unknown;
  sourceFacts: readonly unknown[];
}>;

export type PlanAuthoredReasonCode =
  | "manual_hold"
  | "manual_unscored"
  | "plan_authored_fixed_target_reviewed"
  | "manual_metric_identity_mismatch"
  | "manual_invalid_metric_contract"
  | "manual_invalid_source_fact"
  | "manual_fixed_distance_boundary_mismatch"
  | "manual_fixed_time_boundary_mismatch"
  | "manual_interval_protocol_mismatch"
  | "manual_policy_rule_mismatch";

export type PlanAuthoredProgressionResult = Readonly<{
  version: 1;
  profile: MetricProfile;
  policy: Readonly<{
    kind: string;
    id: string;
    version: number;
  }>;
  decision: "hold" | "manual";
  reasonCode: PlanAuthoredReasonCode;
  reason: string;
  currentTarget: unknown;
  proposedTarget: null;
  review: Readonly<{
    actionable: false;
    state: "manual" | "factual";
  }>;
  evidence: Readonly<{
    version: 1;
    metricIdentity: MetricIdentity;
    immutableComparatorDimensions: Readonly<Record<string, unknown>>;
    comparableSourceFacts: readonly MetricObservation[];
    sourceFactCount: number;
  }>;
}>;

type Evaluation = Readonly<{
  decision: PlanAuthoredProgressionResult["decision"];
  reasonCode: PlanAuthoredReasonCode;
  reason: string;
  state: PlanAuthoredProgressionResult["review"]["state"];
}>;

function policyRuleMatches(policy: PlanOwnedPolicy): boolean {
  if (typeof policy.rule !== "object" || policy.rule === null) {
    return false;
  }
  const rule = policy.rule as Readonly<Record<string, unknown>>;
  return rule.kind === policy.kind
    && rule.id === policy.id
    && rule.version === policy.version;
}

function immutableComparatorDimensions(
  target: MetricTarget,
): Readonly<Record<string, unknown>> {
  switch (target.profile) {
    case "bodyweight_reps":
      return {
        variationId: target.variationId,
        perSide: target.perSide,
      };
    case "assisted_reps":
      return {
        assistanceEquipmentId: target.assistanceEquipmentId,
        perSide: target.perSide,
      };
    case "timed_hold":
      return { perSide: target.perSide };
    case "fixed_distance":
      return { plannedDistanceMeters: target.plannedDistanceMeters };
    case "fixed_time":
      return { plannedDurationMs: target.plannedDurationMs };
    case "intervals":
      return {
        protocolId: target.protocolId,
        comparatorId: target.comparatorId,
        comparatorVersion: target.comparatorVersion,
        plannedRounds: target.plannedRounds,
        workIntervalMs: target.workIntervalMs,
        restIntervalMs: target.restIntervalMs,
      };
    case "unscored":
      return { completionRequired: target.completionRequired };
    case "load_reps":
    case "added_load_reps":
      return { perSide: target.perSide };
  }
}

function manualResult(
  input: PlanAuthoredProgressionInput,
  identity: MetricIdentity,
  target: MetricTarget | null,
  observations: readonly MetricObservation[],
  reasonCode: PlanAuthoredReasonCode,
  reason: string,
): PlanAuthoredProgressionResult {
  return result(input, identity, target, observations, {
    decision: "manual",
    reasonCode,
    reason,
    state: "manual",
  });
}

function result(
  input: PlanAuthoredProgressionInput,
  identity: MetricIdentity,
  target: MetricTarget | null,
  observations: readonly MetricObservation[],
  evaluation: Evaluation,
): PlanAuthoredProgressionResult {
  return {
    version: 1,
    profile: identity.profile,
    policy: {
      kind: input.policy.kind,
      id: input.policy.id,
      version: input.policy.version,
    },
    decision: evaluation.decision,
    reasonCode: evaluation.reasonCode,
    reason: evaluation.reason,
    currentTarget: input.currentTarget,
    proposedTarget: null,
    review: { actionable: false, state: evaluation.state },
    evidence: {
      version: 1,
      metricIdentity: identity,
      immutableComparatorDimensions: target === null
        ? {}
        : immutableComparatorDimensions(target),
      comparableSourceFacts: observations,
      sourceFactCount: input.sourceFacts.length,
    },
  };
}

function boundaryError(
  target: MetricTarget,
  observation: MetricObservation,
): Readonly<{ code: PlanAuthoredReasonCode; reason: string }> | null {
  switch (target.profile) {
    case "fixed_distance":
      return observation.profile !== "fixed_distance"
        || observation.distanceMeters !== target.plannedDistanceMeters
        ? {
            code: "manual_fixed_distance_boundary_mismatch",
            reason: "Fixed-distance source facts must match the copied distance",
          }
        : null;
    case "fixed_time":
      return observation.profile !== "fixed_time"
        || observation.durationMs !== target.plannedDurationMs
        ? {
            code: "manual_fixed_time_boundary_mismatch",
            reason: "Fixed-time source facts must match the copied duration",
          }
        : null;
    case "intervals":
      return observation.profile !== "intervals"
        || observation.protocolId !== target.protocolId
        ? {
            code: "manual_interval_protocol_mismatch",
            reason: "Interval source facts must match the copied protocol",
          }
        : null;
    default:
      return null;
  }
}

export function evaluatePlanAuthoredV1(
  input: PlanAuthoredProgressionInput,
): PlanAuthoredProgressionResult {
  const identity = parseMetricIdentity(input.metricIdentity);
  const policyIdentity = input.policyMetricIdentity === undefined
    ? identity
    : parseMetricIdentity(input.policyMetricIdentity);
  if (
    input.version !== 1
    || policyIdentity.profile !== identity.profile
    || policyIdentity.contractVersion !== identity.contractVersion
    || policyIdentity.exerciseMetricGeneration
      !== identity.exerciseMetricGeneration
    || input.definition.profile !== identity.profile
    || input.definition.id !== input.policy.id
    || input.definition.version !== input.policy.version
    || input.definition.kind !== input.policy.kind
  ) {
    return manualResult(
      input,
      identity,
      null,
      [],
      "manual_metric_identity_mismatch",
      "The copied policy does not match the metric identity",
    );
  }
  if (!policyRuleMatches(input.policy)) {
    return manualResult(
      input,
      identity,
      null,
      [],
      "manual_policy_rule_mismatch",
      "The copied policy rule does not match its named version",
    );
  }

  let target: MetricTarget;
  try {
    target = parseMetricTarget(identity, input.currentTarget);
  } catch {
    return manualResult(
      input,
      identity,
      null,
      [],
      "manual_invalid_metric_contract",
      "The copied target is not valid for its metric identity",
    );
  }

  const observations: MetricObservation[] = [];
  for (const sourceFact of input.sourceFacts) {
    let observation: MetricObservation;
    try {
      observation = parseMetricObservation(identity, sourceFact);
    } catch {
      return manualResult(
        input,
        identity,
        target,
        observations,
        "manual_invalid_source_fact",
        "A source fact is not valid for the copied metric identity",
      );
    }
    const mismatch = boundaryError(target, observation);
    if (mismatch !== null) {
      return manualResult(
        input,
        identity,
        target,
        observations,
        mismatch.code,
        mismatch.reason,
      );
    }
    observations.push(observation);
  }

  if (identity.profile === "unscored") {
    return result(input, identity, target, observations, {
      decision: "manual",
      reasonCode: "manual_unscored",
      reason: "Unscored work remains an owner-controlled completion fact",
      state: "manual",
    });
  }
  if (input.definition.outcome === "manual_hold") {
    return result(input, identity, target, observations, {
      decision: "manual",
      reasonCode: "manual_hold",
      reason: "The copied plan keeps this target under owner control",
      state: "manual",
    });
  }
  return result(input, identity, target, observations, {
    decision: "hold",
    reasonCode: "plan_authored_fixed_target_reviewed",
    reason: "The copied plan retains this fixed target",
    state: "factual",
  });
}
