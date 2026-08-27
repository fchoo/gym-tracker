import {
  parseMetricIdentity,
  type MetricIdentity,
  type MetricProfile,
} from "../metrics";
import {
  evaluatePlanAuthoredV1,
  type PlanAuthoredPolicyDefinition,
  type PlanAuthoredProgressionResult,
  type PlanOwnedPolicy,
} from "./planAuthoredV1";

export type ProgressionPolicyInput = Readonly<{
  version: 1;
  policy: PlanOwnedPolicy;
  metricIdentity: MetricIdentity;
  policyMetricIdentity?: MetricIdentity;
  currentTarget: unknown;
  sourceFacts: readonly unknown[];
}>;

export type ProgressionPolicyResult = PlanAuthoredProgressionResult | Readonly<{
  version: 1;
  profile: MetricProfile;
  policy: Readonly<{
    kind: string;
    id: string;
    version: number;
  }>;
  decision: "manual";
  reasonCode:
    | "manual_unknown_policy"
    | "manual_unsupported_policy_version";
  reason: string;
  currentTarget: unknown;
  proposedTarget: null;
  review: Readonly<{ actionable: false; state: "manual" }>;
  evidence: Readonly<{
    version: 1;
    metricIdentity: MetricIdentity;
    immutableComparatorDimensions: Readonly<Record<string, unknown>>;
    comparableSourceFacts: readonly [];
    sourceFactCount: number;
  }>;
}>;

const POLICY_DEFINITIONS = [
  {
    kind: "manual_hold",
    id: "assisted_reps.manual_hold.v1",
    version: 1,
    profile: "assisted_reps",
    outcome: "manual_hold",
  },
  {
    kind: "manual_hold",
    id: "bodyweight_reps.manual_hold.v1",
    version: 1,
    profile: "bodyweight_reps",
    outcome: "manual_hold",
  },
  {
    kind: "manual_hold",
    id: "added_load_reps.manual_hold.v1",
    version: 1,
    profile: "added_load_reps",
    outcome: "manual_hold",
  },
  {
    kind: "manual_hold",
    id: "load_reps.manual_hold.v1",
    version: 1,
    profile: "load_reps",
    outcome: "manual_hold",
  },
  {
    kind: "manual_hold",
    id: "timed_hold.v1",
    version: 1,
    profile: "timed_hold",
    outcome: "manual_hold",
  },
  {
    kind: "manual_hold",
    id: "timed_hold.manual_hold.v1",
    version: 1,
    profile: "timed_hold",
    outcome: "manual_hold",
  },
  {
    kind: "manual_hold",
    id: "unscored.manual_hold.v1",
    version: 1,
    profile: "unscored",
    outcome: "manual_hold",
  },
  {
    kind: "plan_authored",
    id: "fixed_distance.plan_authored.v1",
    version: 1,
    profile: "fixed_distance",
    outcome: "plan_authored_fixed_target",
  },
  {
    kind: "plan_authored",
    id: "fixed_time.plan_authored.v1",
    version: 1,
    profile: "fixed_time",
    outcome: "plan_authored_fixed_target",
  },
  {
    kind: "plan_authored",
    id: "intervals.plan_authored.v1",
    version: 1,
    profile: "intervals",
    outcome: "plan_authored_fixed_target",
  },
] as const satisfies readonly PlanAuthoredPolicyDefinition[];

function manualResult(
  input: ProgressionPolicyInput,
  identity: MetricIdentity,
  reasonCode: Extract<
    ProgressionPolicyResult,
    Readonly<{ decision: "manual" }>
  >["reasonCode"],
  reason: string,
): ProgressionPolicyResult {
  return {
    version: 1,
    profile: identity.profile,
    policy: {
      kind: input.policy.kind,
      id: input.policy.id,
      version: input.policy.version,
    },
    decision: "manual",
    reasonCode,
    reason,
    currentTarget: input.currentTarget,
    proposedTarget: null,
    review: { actionable: false, state: "manual" },
    evidence: {
      version: 1,
      metricIdentity: identity,
      immutableComparatorDimensions: {},
      comparableSourceFacts: [],
      sourceFactCount: input.sourceFacts.length,
    },
  };
}

export function evaluateProgressionPolicy(
  input: ProgressionPolicyInput,
): ProgressionPolicyResult {
  const identity = parseMetricIdentity(input.metricIdentity);
  const definitions = POLICY_DEFINITIONS.filter(
    ({ id }) => id === input.policy.id,
  );
  if (definitions.length === 0) {
    return manualResult(
      input,
      identity,
      "manual_unknown_policy",
      "The copied plan policy is not approved for evaluation",
    );
  }
  const definition = definitions.find(
    ({ version }) => version === input.policy.version,
  );
  if (definition === undefined) {
    return manualResult(
      input,
      identity,
      "manual_unsupported_policy_version",
      "The copied plan policy version is not approved for evaluation",
    );
  }
  return evaluatePlanAuthoredV1({
    ...input,
    definition,
  });
}

export {
  POLICY_DEFINITIONS,
};
