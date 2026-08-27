import type {
  MetricIdentity,
  MetricObservation,
  MetricTarget,
} from "./contracts";
import {
  MetricBoundaryError,
} from "./contracts";
import {
  getMetricContract,
} from "./registry";

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    throw new MetricBoundaryError("validation", "metric_json_invalid");
  }
}

export function parseMetricTarget(
  identity: MetricIdentity,
  input: unknown,
): MetricTarget {
  const result = getMetricContract(identity).targetSchema.safeParse(input);
  if (!result.success) {
    throw new MetricBoundaryError("validation", "metric_target_invalid");
  }
  return result.data as MetricTarget;
}

export function parseMetricObservation(
  identity: MetricIdentity,
  input: unknown,
): MetricObservation {
  const result = getMetricContract(identity).observationSchema.safeParse(input);
  if (!result.success) {
    throw new MetricBoundaryError("validation", "metric_observation_invalid");
  }
  return result.data as MetricObservation;
}

export function parseMetricTargetJson(
  identity: MetricIdentity,
  input: string,
): MetricTarget {
  return parseMetricTarget(identity, parseJson(input));
}

export function parseMetricObservationJson(
  identity: MetricIdentity,
  input: string,
): MetricObservation {
  return parseMetricObservation(identity, parseJson(input));
}

export function serializeMetricTarget(
  identity: MetricIdentity,
  input: unknown,
): string {
  return JSON.stringify(parseMetricTarget(identity, input));
}

export function serializeMetricObservation(
  identity: MetricIdentity,
  input: unknown,
): string {
  return JSON.stringify(parseMetricObservation(identity, input));
}
