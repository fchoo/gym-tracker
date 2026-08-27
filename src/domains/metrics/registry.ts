import {
  AddedLoadRepsObservationV1Schema,
  AddedLoadRepsTargetV1Schema,
  AssistedRepsObservationV1Schema,
  AssistedRepsTargetV1Schema,
  BodyweightRepsObservationV1Schema,
  BodyweightRepsTargetV1Schema,
  FixedDistanceObservationV1Schema,
  FixedDistanceTargetV1Schema,
  FixedTimeObservationV1Schema,
  FixedTimeTargetV1Schema,
  IntervalsObservationV1Schema,
  IntervalsTargetV1Schema,
  LoadRepsObservationV1Schema,
  LoadRepsTargetV1Schema,
  METRIC_TIE_ORDER,
  MetricBoundaryError,
  type MetricContract,
  type MetricContractDefinition,
  type MetricIdentity,
  TimedHoldObservationV1Schema,
  TimedHoldObservationV2Schema,
  TimedHoldTargetV1Schema,
  TimedHoldTargetV2Schema,
  UnscoredObservationV1Schema,
  UnscoredTargetV1Schema,
  parseMetricIdentity,
} from "./contracts";

const CONTRACT_DEFINITIONS = [
  {
    profile: "load_reps",
    contractVersion: 1,
    targetSchema: LoadRepsTargetV1Schema,
    observationSchema: LoadRepsObservationV1Schema,
    comparatorId: "load_then_reps",
    aggregateId: "mean_load_and_reps",
    exposureId: "identity",
    averagePopulation: "completed_comparable_working_sets",
    tieOrder: METRIC_TIE_ORDER,
  },
  {
    profile: "bodyweight_reps",
    contractVersion: 1,
    targetSchema: BodyweightRepsTargetV1Schema,
    observationSchema: BodyweightRepsObservationV1Schema,
    comparatorId: "reps",
    aggregateId: "mean_reps",
    exposureId: "identity_and_variation",
    averagePopulation: "completed_comparable_working_sets",
    tieOrder: METRIC_TIE_ORDER,
  },
  {
    profile: "added_load_reps",
    contractVersion: 1,
    targetSchema: AddedLoadRepsTargetV1Schema,
    observationSchema: AddedLoadRepsObservationV1Schema,
    comparatorId: "added_load_then_reps",
    aggregateId: "mean_added_load_and_reps",
    exposureId: "identity",
    averagePopulation: "completed_comparable_working_sets",
    tieOrder: METRIC_TIE_ORDER,
  },
  {
    profile: "assisted_reps",
    contractVersion: 1,
    targetSchema: AssistedRepsTargetV1Schema,
    observationSchema: AssistedRepsObservationV1Schema,
    comparatorId: "assistance_then_reps",
    aggregateId: "mean_assistance_and_reps",
    exposureId: "identity_and_assistance_equipment",
    averagePopulation: "completed_comparable_working_sets",
    tieOrder: METRIC_TIE_ORDER,
  },
  {
    profile: "timed_hold",
    contractVersion: 1,
    targetSchema: TimedHoldTargetV1Schema,
    observationSchema: TimedHoldObservationV1Schema,
    comparatorId: "duration",
    aggregateId: "mean_duration",
    exposureId: "identity_and_side",
    averagePopulation: "completed_comparable_working_sets",
    tieOrder: METRIC_TIE_ORDER,
  },
  {
    profile: "timed_hold",
    contractVersion: 2,
    targetSchema: TimedHoldTargetV2Schema,
    observationSchema: TimedHoldObservationV2Schema,
    comparatorId: "duration",
    aggregateId: "mean_duration",
    exposureId: "identity_and_side",
    averagePopulation: "completed_comparable_working_sets",
    tieOrder: METRIC_TIE_ORDER,
  },
  {
    profile: "fixed_distance",
    contractVersion: 1,
    targetSchema: FixedDistanceTargetV1Schema,
    observationSchema: FixedDistanceObservationV1Schema,
    comparatorId: "fixed_distance_duration",
    aggregateId: "mean_fixed_distance_duration",
    exposureId: "identity_and_planned_distance",
    averagePopulation: "completed_comparable_working_sets",
    tieOrder: METRIC_TIE_ORDER,
  },
  {
    profile: "fixed_time",
    contractVersion: 1,
    targetSchema: FixedTimeTargetV1Schema,
    observationSchema: FixedTimeObservationV1Schema,
    comparatorId: "fixed_time_distance",
    aggregateId: "mean_fixed_time_distance",
    exposureId: "identity_and_planned_duration",
    averagePopulation: "completed_comparable_working_sets",
    tieOrder: METRIC_TIE_ORDER,
  },
  {
    profile: "intervals",
    contractVersion: 1,
    targetSchema: IntervalsTargetV1Schema,
    observationSchema: IntervalsObservationV1Schema,
    comparatorId: "plan_authored_intervals",
    aggregateId: "mean_intervals",
    exposureId: "identity_and_interval_protocol",
    averagePopulation: "completed_comparable_working_sets",
    tieOrder: METRIC_TIE_ORDER,
  },
  {
    profile: "unscored",
    contractVersion: 1,
    targetSchema: UnscoredTargetV1Schema,
    observationSchema: UnscoredObservationV1Schema,
    comparatorId: "completion",
    aggregateId: "completion_rate",
    exposureId: "completion_history",
    averagePopulation: "completed_comparable_working_sets",
    tieOrder: METRIC_TIE_ORDER,
  },
] as const satisfies readonly MetricContractDefinition[];

function definitionKey(
  input: Pick<MetricIdentity, "profile" | "contractVersion">,
): string {
  return `${input.profile}:${input.contractVersion}`;
}

const DEFINITIONS_BY_KEY = new Map(
  CONTRACT_DEFINITIONS.map((definition) => [
    definitionKey(definition),
    definition,
  ]),
);

export function listMetricContracts(): readonly MetricContractDefinition[] {
  return CONTRACT_DEFINITIONS;
}

export function getMetricContract(identityInput: MetricIdentity): MetricContract {
  const identity = parseMetricIdentity(identityInput);
  const definition = DEFINITIONS_BY_KEY.get(definitionKey(identity));
  if (definition === undefined) {
    throw new MetricBoundaryError(
      "unsupported_version",
      "metric_identity_unsupported",
    );
  }
  return {
    ...definition,
    identity,
  };
}
