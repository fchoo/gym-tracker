import type {
  AddedLoadRepsObservationV1,
  AssistedRepsObservationV1,
  BodyweightRepsObservationV1,
  FixedDistanceObservationV1,
  FixedTimeObservationV1,
  IntervalsObservationV1,
  LoadRepsObservationV1,
  MetricIdentity,
  MetricObservation,
  MetricProfile,
  TimedHoldObservationV1,
  TimedHoldObservationV2,
  UnscoredObservationV1,
} from "./contracts";
import {
  z,
} from "zod";
import {
  parseMetricObservation,
} from "./observations";
import {
  getMetricContract,
} from "./registry";

const MAX_AGGREGATE_POPULATION = 10_000;

type AggregateBase<
  Profile extends MetricProfile,
  Version extends number,
> = Readonly<{
  version: Version;
  profile: Profile;
  sampleSize: number;
}>;

export type MetricAggregate =
  | (AggregateBase<"load_reps", 1> & Readonly<{
      meanLoadGrams: number;
      meanReps: number;
    }>)
  | (AggregateBase<"bodyweight_reps", 1> & Readonly<{
      meanReps: number;
    }>)
  | (AggregateBase<"added_load_reps", 1> & Readonly<{
      meanAddedLoadGrams: number;
      meanReps: number;
    }>)
  | (AggregateBase<"assisted_reps", 1> & Readonly<{
      meanAssistanceGrams: number;
      meanReps: number;
    }>)
  | (AggregateBase<"timed_hold", 1> & Readonly<{
      meanDurationSeconds: number;
    }>)
  | (AggregateBase<"timed_hold", 2> & Readonly<{
      meanDurationMs: number;
    }>)
  | (AggregateBase<"fixed_distance", 1> & Readonly<{
      meanDurationMs: number;
    }>)
  | (AggregateBase<"fixed_time", 1> & Readonly<{
      meanDistanceMeters: number;
    }>)
  | (AggregateBase<"intervals", 1> & Readonly<{
      protocolId: string;
      meanCompletedRounds: number;
      meanCompletedWorkMs: number;
    }>)
  | (AggregateBase<"unscored", 1> & Readonly<{
      completionRate: number;
    }>);

export type MetricPresentationPrecision = Readonly<{
  loadFractionDigits: number;
  assistanceFractionDigits: number;
  distanceFractionDigits: number;
}>;

export class MetricAggregateError extends Error {
  readonly retryable = false;
  readonly correlationCode = "GT-METRIC03";

  constructor(
    readonly code:
      | "metric_aggregate_population_too_large"
      | "metric_aggregate_incompatible"
      | "metric_aggregate_non_finite"
      | "metric_presentation_precision_invalid",
  ) {
    super(code);
    this.name = "MetricAggregateError";
  }
}

function finiteMean(
  values: readonly number[],
): number {
  let mean = 0;
  let count = 0;
  for (const value of values) {
    count += 1;
    mean += (value - mean) / count;
  }
  return mean;
}

function parsePopulation(
  identity: MetricIdentity,
  observations: readonly unknown[],
): readonly MetricObservation[] {
  if (observations.length > MAX_AGGREGATE_POPULATION) {
    throw new MetricAggregateError("metric_aggregate_population_too_large");
  }
  return observations.map((observation) =>
    parseMetricObservation(identity, observation)
  );
}

export function aggregateMetricObservations(
  identity: MetricIdentity,
  inputs: readonly unknown[],
): MetricAggregate | null {
  const contract = getMetricContract(identity);
  const observations = parsePopulation(identity, inputs);
  if (observations.length === 0) {
    return null;
  }
  const sampleSize = observations.length;
  switch (contract.aggregateId) {
    case "mean_load_and_reps": {
      const values = observations as readonly LoadRepsObservationV1[];
      return {
        version: 1,
        profile: "load_reps",
        sampleSize,
        meanLoadGrams: finiteMean(values.map(({ loadGrams }) => loadGrams)),
        meanReps: finiteMean(values.map(({ reps }) => reps)),
      };
    }
    case "mean_reps": {
      const values = observations as readonly BodyweightRepsObservationV1[];
      return {
        version: 1,
        profile: "bodyweight_reps",
        sampleSize,
        meanReps: finiteMean(values.map(({ reps }) => reps)),
      };
    }
    case "mean_added_load_and_reps": {
      const values = observations as readonly AddedLoadRepsObservationV1[];
      return {
        version: 1,
        profile: "added_load_reps",
        sampleSize,
        meanAddedLoadGrams: finiteMean(
          values.map(({ addedLoadGrams }) => addedLoadGrams),
        ),
        meanReps: finiteMean(values.map(({ reps }) => reps)),
      };
    }
    case "mean_assistance_and_reps": {
      const values = observations as readonly AssistedRepsObservationV1[];
      return {
        version: 1,
        profile: "assisted_reps",
        sampleSize,
        meanAssistanceGrams: finiteMean(
          values.map(({ assistanceGrams }) => assistanceGrams),
        ),
        meanReps: finiteMean(values.map(({ reps }) => reps)),
      };
    }
    case "mean_duration": {
      if (identity.contractVersion === 1) {
        const values = observations as readonly TimedHoldObservationV1[];
        return {
          version: 1,
          profile: "timed_hold",
          sampleSize,
          meanDurationSeconds: finiteMean(
            values.map(({ durationSeconds }) => durationSeconds),
          ),
        };
      }
      const values = observations as readonly TimedHoldObservationV2[];
      return {
        version: 2,
        profile: "timed_hold",
        sampleSize,
        meanDurationMs: finiteMean(values.map(({ durationMs }) => durationMs)),
      };
    }
    case "mean_fixed_distance_duration": {
      const values = observations as readonly FixedDistanceObservationV1[];
      const distanceMeters = values[0]!.distanceMeters;
      if (values.some((value) => value.distanceMeters !== distanceMeters)) {
        throw new MetricAggregateError("metric_aggregate_incompatible");
      }
      return {
        version: 1,
        profile: "fixed_distance",
        sampleSize,
        meanDurationMs: finiteMean(values.map(({ durationMs }) => durationMs)),
      };
    }
    case "mean_fixed_time_distance": {
      const values = observations as readonly FixedTimeObservationV1[];
      const durationMs = values[0]!.durationMs;
      if (values.some((value) => value.durationMs !== durationMs)) {
        throw new MetricAggregateError("metric_aggregate_incompatible");
      }
      return {
        version: 1,
        profile: "fixed_time",
        sampleSize,
        meanDistanceMeters: finiteMean(
          values.map(({ distanceMeters }) => distanceMeters),
        ),
      };
    }
    case "mean_intervals": {
      const values = observations as readonly IntervalsObservationV1[];
      const first = values[0]!;
      if (
        values.some(({ protocolId }) => protocolId !== first.protocolId)
      ) {
        throw new MetricAggregateError("metric_aggregate_incompatible");
      }
      return {
        version: 1,
        profile: "intervals",
        sampleSize,
        protocolId: first.protocolId,
        meanCompletedRounds: finiteMean(
          values.map(({ completedRounds }) => completedRounds),
        ),
        meanCompletedWorkMs: finiteMean(
          values.map(({ completedWorkMs }) => completedWorkMs),
        ),
      };
    }
    case "completion_rate": {
      const values = observations as readonly UnscoredObservationV1[];
      return {
        version: 1,
        profile: "unscored",
        sampleSize,
        completionRate: finiteMean(
          values.map(({ completed }) => Number(completed)),
        ),
      };
    }
  }
}

const MetricPresentationPrecisionSchema = z.strictObject({
  loadFractionDigits: z.number().int().min(0).max(3),
  assistanceFractionDigits: z.number().int().min(0).max(3),
  distanceFractionDigits: z.number().int().min(0).max(3),
});

const DurationMsSchema = z.number().int().nonnegative().safe();

function rounded(value: number, fractionDigits: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new MetricAggregateError("metric_aggregate_non_finite");
  }
  return Number(value.toFixed(fractionDigits));
}

export function roundMetricAggregateForPresentation(
  aggregate: MetricAggregate,
  precision: MetricPresentationPrecision,
): MetricAggregate {
  const precisionResult = MetricPresentationPrecisionSchema.safeParse(precision);
  if (!precisionResult.success) {
    throw new MetricAggregateError(
      "metric_presentation_precision_invalid",
    );
  }
  const validatedPrecision = precisionResult.data;
  switch (aggregate.profile) {
    case "load_reps":
      return {
        ...aggregate,
        meanLoadGrams: rounded(
          aggregate.meanLoadGrams,
          validatedPrecision.loadFractionDigits,
        ),
        meanReps: rounded(aggregate.meanReps, 1),
      };
    case "bodyweight_reps":
      return {
        ...aggregate,
        meanReps: rounded(aggregate.meanReps, 1),
      };
    case "added_load_reps":
      return {
        ...aggregate,
        meanAddedLoadGrams: rounded(
          aggregate.meanAddedLoadGrams,
          validatedPrecision.loadFractionDigits,
        ),
        meanReps: rounded(aggregate.meanReps, 1),
      };
    case "assisted_reps":
      return {
        ...aggregate,
        meanAssistanceGrams: rounded(
          aggregate.meanAssistanceGrams,
          validatedPrecision.assistanceFractionDigits,
        ),
        meanReps: rounded(aggregate.meanReps, 1),
      };
    case "timed_hold":
      return aggregate.version === 1
        ? {
            ...aggregate,
            meanDurationSeconds: rounded(aggregate.meanDurationSeconds, 0),
          }
        : {
            ...aggregate,
            meanDurationMs: rounded(aggregate.meanDurationMs, 0),
          };
    case "fixed_distance":
      return {
        ...aggregate,
        meanDurationMs: rounded(aggregate.meanDurationMs, 0),
      };
    case "fixed_time":
      return {
        ...aggregate,
        meanDistanceMeters: rounded(
          aggregate.meanDistanceMeters,
          validatedPrecision.distanceFractionDigits,
        ),
      };
    case "intervals":
      return {
        ...aggregate,
        meanCompletedRounds: rounded(aggregate.meanCompletedRounds, 1),
        meanCompletedWorkMs: rounded(aggregate.meanCompletedWorkMs, 0),
      };
    case "unscored":
      return aggregate;
  }
}

export function formatMetricDuration(durationMs: number): string {
  if (!DurationMsSchema.safeParse(durationMs).success) {
    throw new MetricAggregateError("metric_presentation_precision_invalid");
  }
  const totalSeconds = Math.round(durationMs / 1_000);
  if (durationMs < 600_000) {
    return `${totalSeconds} sec`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
