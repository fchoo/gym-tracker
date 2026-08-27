import type {
  AddedLoadRepsObservationV1,
  AssistedRepsObservationV1,
  AssistedRepsTargetV1,
  BodyweightRepsObservationV1,
  FixedDistanceObservationV1,
  FixedDistanceTargetV1,
  FixedTimeObservationV1,
  FixedTimeTargetV1,
  IntervalsObservationV1,
  IntervalsTargetV1,
  LoadRepsObservationV1,
  MetricIdentity,
  MetricObservation,
  TimedHoldObservationV1,
  TimedHoldObservationV2,
  UnscoredObservationV1,
} from "./contracts";
import {
  parseMetricObservation,
  parseMetricTarget,
} from "./observations";
import {
  getMetricContract,
} from "./registry";
import {
  z,
} from "zod";

export type MetricComparison = "better" | "worse" | "equal";

export type MetricCandidate = Readonly<{
  observation: MetricObservation;
  completedAtMs: number;
  sessionId: string;
  setOrdinal: number;
  setId: string;
}>;

export class MetricComparisonError extends Error {
  readonly retryable = false;
  readonly correlationCode = "GT-METRIC02";

  constructor(
    readonly code:
      | "metric_comparison_incompatible"
      | "metric_candidate_invalid",
  ) {
    super(code);
    this.name = "MetricComparisonError";
  }
}

function higher(left: number, right: number): MetricComparison {
  if (left > right) {
    return "better";
  }
  if (left < right) {
    return "worse";
  }
  return "equal";
}

function lower(left: number, right: number): MetricComparison {
  return higher(right, left);
}

function completed(left: boolean, right: boolean): MetricComparison {
  if (left === right) {
    return "equal";
  }
  return left ? "better" : "worse";
}

function then(
  first: MetricComparison,
  second: () => MetricComparison,
): MetricComparison {
  return first === "equal" ? second() : first;
}

function compareAssisted(
  target: AssistedRepsTargetV1,
  left: AssistedRepsObservationV1,
  right: AssistedRepsObservationV1,
): MetricComparison {
  const leftMeetsTarget = left.reps >= target.minReps;
  const rightMeetsTarget = right.reps >= target.minReps;
  const targetResult = completed(leftMeetsTarget, rightMeetsTarget);
  if (targetResult !== "equal") {
    return targetResult;
  }
  if (!leftMeetsTarget) {
    return then(
      higher(left.reps, right.reps),
      () => lower(left.assistanceGrams, right.assistanceGrams),
    );
  }
  return then(
    lower(left.assistanceGrams, right.assistanceGrams),
    () => higher(left.reps, right.reps),
  );
}

function compareIntervals(
  target: IntervalsTargetV1,
  left: IntervalsObservationV1,
  right: IntervalsObservationV1,
): MetricComparison {
  if (
    left.protocolId !== target.protocolId
    || right.protocolId !== target.protocolId
  ) {
    throw new MetricComparisonError("metric_comparison_incompatible");
  }
  return then(
    higher(left.completedRounds, right.completedRounds),
    () => higher(left.completedWorkMs, right.completedWorkMs),
  );
}

function compareByStrategy(
  comparatorId: ReturnType<typeof getMetricContract>["comparatorId"],
  target: ReturnType<typeof parseMetricTarget>,
  left: MetricObservation,
  right: MetricObservation,
): MetricComparison {
  switch (comparatorId) {
    case "load_then_reps": {
      const leftValue = left as LoadRepsObservationV1;
      const rightValue = right as LoadRepsObservationV1;
      return then(
        higher(leftValue.loadGrams, rightValue.loadGrams),
        () => higher(leftValue.reps, rightValue.reps),
      );
    }
    case "reps": {
      const leftValue = left as BodyweightRepsObservationV1;
      const rightValue = right as BodyweightRepsObservationV1;
      return higher(leftValue.reps, rightValue.reps);
    }
    case "added_load_then_reps": {
      const leftValue = left as AddedLoadRepsObservationV1;
      const rightValue = right as AddedLoadRepsObservationV1;
      return then(
        higher(leftValue.addedLoadGrams, rightValue.addedLoadGrams),
        () => higher(leftValue.reps, rightValue.reps),
      );
    }
    case "assistance_then_reps":
      return compareAssisted(
        target as AssistedRepsTargetV1,
        left as AssistedRepsObservationV1,
        right as AssistedRepsObservationV1,
      );
    case "duration":
      return left.version === 1
        ? higher(
            (left as TimedHoldObservationV1).durationSeconds,
            (right as TimedHoldObservationV1).durationSeconds,
          )
        : higher(
            (left as TimedHoldObservationV2).durationMs,
            (right as TimedHoldObservationV2).durationMs,
          );
    case "fixed_distance_duration": {
      const targetValue = target as FixedDistanceTargetV1;
      const leftValue = left as FixedDistanceObservationV1;
      const rightValue = right as FixedDistanceObservationV1;
      if (
        leftValue.distanceMeters !== targetValue.plannedDistanceMeters
        || rightValue.distanceMeters !== targetValue.plannedDistanceMeters
      ) {
        throw new MetricComparisonError("metric_comparison_incompatible");
      }
      return lower(leftValue.durationMs, rightValue.durationMs);
    }
    case "fixed_time_distance": {
      const targetValue = target as FixedTimeTargetV1;
      const leftValue = left as FixedTimeObservationV1;
      const rightValue = right as FixedTimeObservationV1;
      if (
        leftValue.durationMs !== targetValue.plannedDurationMs
        || rightValue.durationMs !== targetValue.plannedDurationMs
      ) {
        throw new MetricComparisonError("metric_comparison_incompatible");
      }
      return higher(leftValue.distanceMeters, rightValue.distanceMeters);
    }
    case "plan_authored_intervals":
      return compareIntervals(
        target as IntervalsTargetV1,
        left as IntervalsObservationV1,
        right as IntervalsObservationV1,
      );
    case "completion": {
      const leftValue = left as UnscoredObservationV1;
      const rightValue = right as UnscoredObservationV1;
      return completed(leftValue.completed, rightValue.completed);
    }
  }
}

export function compareMetricObservations(input: Readonly<{
  identity: MetricIdentity;
  target: unknown;
  left: unknown;
  right: unknown;
}>): MetricComparison {
  const contract = getMetricContract(input.identity);
  const target = parseMetricTarget(input.identity, input.target);
  const left = parseMetricObservation(input.identity, input.left);
  const right = parseMetricObservation(input.identity, input.right);
  return compareByStrategy(contract.comparatorId, target, left, right);
}

const CandidateMetadataSchema = z.strictObject({
  completedAtMs: z.number().int().nonnegative().safe(),
  sessionId: z.string().min(1).max(256),
  setOrdinal: z.number().int().nonnegative().safe(),
  setId: z.string().min(1).max(256),
});

function validCandidate(candidate: MetricCandidate): boolean {
  return CandidateMetadataSchema.safeParse({
    completedAtMs: candidate.completedAtMs,
    sessionId: candidate.sessionId,
    setOrdinal: candidate.setOrdinal,
    setId: candidate.setId,
  }).success;
}

function tiePreference(
  left: MetricCandidate,
  right: MetricCandidate,
): MetricComparison {
  return then(
    higher(left.completedAtMs, right.completedAtMs),
    () => then(
      lower(left.sessionId.localeCompare(right.sessionId), 0),
      () => then(
        lower(left.setOrdinal, right.setOrdinal),
        () => lower(left.setId.localeCompare(right.setId), 0),
      ),
    ),
  );
}

export function selectBestMetricCandidate(input: Readonly<{
  identity: MetricIdentity;
  target: unknown;
  candidates: readonly MetricCandidate[];
}>): MetricCandidate | null {
  let best: MetricCandidate | null = null;
  for (const current of input.candidates) {
    parseMetricObservation(input.identity, current.observation);
    if (!validCandidate(current)) {
      throw new MetricComparisonError("metric_candidate_invalid");
    }
    if (best === null) {
      best = current;
      continue;
    }
    const result = compareMetricObservations({
      identity: input.identity,
      target: input.target,
      left: current.observation,
      right: best.observation,
    });
    if (
      result === "better"
      || (result === "equal" && tiePreference(current, best) === "better")
    ) {
      best = current;
    }
  }
  return best;
}

export function selectLastMetricCandidate(
  candidates: readonly MetricCandidate[],
): MetricCandidate | null {
  let last: MetricCandidate | null = null;
  for (const current of candidates) {
    if (!validCandidate(current)) {
      throw new MetricComparisonError("metric_candidate_invalid");
    }
    if (last === null || tiePreference(current, last) === "better") {
      last = current;
    }
  }
  return last;
}
