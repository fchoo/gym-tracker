import type {
  MetricIdentity,
  MetricObservation,
  MetricTarget,
} from "./contracts";
import {
  metricIdentityKey,
} from "./contracts";
import {
  parseMetricObservation,
  parseMetricTarget,
} from "./observations";
import {
  getMetricContract,
} from "./registry";

export type MetricExposure = Readonly<{
  exerciseId: string;
  identity: MetricIdentity;
  target: MetricTarget;
  observation: MetricObservation;
  sessionStatus:
    | "in_progress"
    | "completed"
    | "partial"
    | "discarded"
    | "voided"
    | "manual_visit"
    | "zero_sets";
  setKind: "warmup" | "working";
  setStatus: "planned" | "draft" | "completed" | "skipped";
  plannedWorkingSets: number;
  completedWorkingSets: number;
}>;

function validSetCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function isMetricExposureEligible(
  exposure: MetricExposure,
): boolean {
  return (exposure.sessionStatus === "completed"
      || exposure.sessionStatus === "partial")
    && exposure.setKind === "working"
    && exposure.setStatus === "completed"
    && validSetCount(exposure.plannedWorkingSets)
    && exposure.plannedWorkingSets > 0
    && validSetCount(exposure.completedWorkingSets)
    && exposure.completedWorkingSets === exposure.plannedWorkingSets;
}

function sameIdentity(
  left: MetricExposure,
  right: MetricExposure,
): boolean {
  return left.exerciseId === right.exerciseId
    && metricIdentityKey(left.identity) === metricIdentityKey(right.identity);
}

function internallyCompatible(exposure: MetricExposure): boolean {
  try {
    const target = parseMetricTarget(exposure.identity, exposure.target);
    const observation = parseMetricObservation(
      exposure.identity,
      exposure.observation,
    );
    switch (target.profile) {
      case "fixed_distance":
        return observation.profile === "fixed_distance"
          && observation.distanceMeters === target.plannedDistanceMeters;
      case "fixed_time":
        return observation.profile === "fixed_time"
          && observation.durationMs === target.plannedDurationMs;
      case "intervals":
        return observation.profile === "intervals"
          && observation.protocolId === target.protocolId;
      default:
        return true;
    }
  } catch {
    return false;
  }
}

function sameTargetSignificantBoundary(
  left: MetricExposure,
  right: MetricExposure,
): boolean {
  const contract = getMetricContract(left.identity);
  const leftTarget = parseMetricTarget(left.identity, left.target);
  const rightTarget = parseMetricTarget(right.identity, right.target);
  switch (contract.exposureId) {
    case "identity":
    case "completion_history":
      return true;
    case "identity_and_variation":
      return leftTarget.profile === "bodyweight_reps"
        && rightTarget.profile === "bodyweight_reps"
        && leftTarget.variationId === rightTarget.variationId;
    case "identity_and_assistance_equipment":
      return leftTarget.profile === "assisted_reps"
        && rightTarget.profile === "assisted_reps"
        && leftTarget.assistanceEquipmentId
          === rightTarget.assistanceEquipmentId;
    case "identity_and_side":
      return leftTarget.profile === "timed_hold"
        && rightTarget.profile === "timed_hold"
        && leftTarget.perSide === rightTarget.perSide;
    case "identity_and_planned_distance":
      return leftTarget.profile === "fixed_distance"
        && rightTarget.profile === "fixed_distance"
        && leftTarget.plannedDistanceMeters
          === rightTarget.plannedDistanceMeters;
    case "identity_and_planned_duration":
      return leftTarget.profile === "fixed_time"
        && rightTarget.profile === "fixed_time"
        && leftTarget.plannedDurationMs === rightTarget.plannedDurationMs;
    case "identity_and_interval_protocol":
      return leftTarget.profile === "intervals"
        && rightTarget.profile === "intervals"
        && leftTarget.protocolId === rightTarget.protocolId
        && leftTarget.comparatorId === rightTarget.comparatorId
        && leftTarget.comparatorVersion === rightTarget.comparatorVersion
        && leftTarget.plannedRounds === rightTarget.plannedRounds
        && leftTarget.workIntervalMs === rightTarget.workIntervalMs
        && leftTarget.restIntervalMs === rightTarget.restIntervalMs;
  }
}

export function areMetricExposuresComparable(
  left: MetricExposure,
  right: MetricExposure,
): boolean {
  if (
    !isMetricExposureEligible(left)
    || !isMetricExposureEligible(right)
    || !sameIdentity(left, right)
    || !internallyCompatible(left)
    || !internallyCompatible(right)
  ) {
    return false;
  }
  return sameTargetSignificantBoundary(left, right);
}
