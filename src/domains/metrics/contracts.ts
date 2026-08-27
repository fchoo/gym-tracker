import {
  z,
} from "zod";

export const METRIC_PROFILES = [
  "load_reps",
  "bodyweight_reps",
  "added_load_reps",
  "assisted_reps",
  "timed_hold",
  "fixed_distance",
  "fixed_time",
  "intervals",
  "unscored",
] as const;

export const METRIC_VALUE_SOURCES = [
  "recommended",
  "last_workout",
  "plan_default",
  "manual",
] as const;

export type MetricProfile = (typeof METRIC_PROFILES)[number];
export type MetricValueSource = (typeof METRIC_VALUE_SOURCES)[number];

export const MetricIdentitySchema = z.strictObject({
  profile: z.enum(METRIC_PROFILES),
  contractVersion: z.number().int().positive().safe(),
  exerciseMetricGeneration: z.number().int().positive().safe(),
});

export type MetricIdentity = z.infer<typeof MetricIdentitySchema>;

export type MetricBoundaryErrorKind =
  | "validation"
  | "unsupported_version";

const METRIC_CORRELATION_CODE = "GT-METRIC01";

export class MetricBoundaryError extends Error {
  readonly retryable = false;
  readonly correlationCode = METRIC_CORRELATION_CODE;

  constructor(
    readonly kind: MetricBoundaryErrorKind,
    readonly code:
      | "metric_identity_invalid"
      | "metric_identity_unsupported"
      | "metric_observation_invalid"
      | "metric_target_invalid"
      | "metric_json_invalid",
  ) {
    super(code);
    this.name = "MetricBoundaryError";
  }
}

export function parseMetricIdentity(input: unknown): MetricIdentity {
  const result = MetricIdentitySchema.safeParse(input);
  if (!result.success) {
    throw new MetricBoundaryError("validation", "metric_identity_invalid");
  }
  return result.data;
}

export function metricIdentityKey(input: MetricIdentity): string {
  const identity = parseMetricIdentity(input);
  return [
    identity.profile,
    identity.contractVersion,
    identity.exerciseMetricGeneration,
  ].join(":");
}

const PositiveAtomicIntegerSchema = z.number().int().positive().safe();
const NonnegativeAtomicIntegerSchema = z.number().int().nonnegative().safe();
const MetricValueSourceSchema = z.enum(METRIC_VALUE_SOURCES);
const BoundedIdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value.trim().length > 0);

export const LoadRepsTargetV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("load_reps"),
  loadGrams: NonnegativeAtomicIntegerSchema,
  minReps: PositiveAtomicIntegerSchema,
  maxReps: PositiveAtomicIntegerSchema,
  targetReps: z
    .array(PositiveAtomicIntegerSchema)
    .min(1)
    .max(100)
    .optional(),
  incrementGrams: PositiveAtomicIntegerSchema,
  perSide: z.boolean(),
}).refine(
  ({ minReps, maxReps, targetReps }) =>
    maxReps >= minReps
    && (
      targetReps === undefined
      || targetReps.every((reps) => reps >= minReps && reps <= maxReps)
    ),
);

export const LoadRepsObservationV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("load_reps"),
  loadGrams: NonnegativeAtomicIntegerSchema,
  reps: PositiveAtomicIntegerSchema,
  source: MetricValueSourceSchema,
});

export const BodyweightRepsTargetV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("bodyweight_reps"),
  minReps: PositiveAtomicIntegerSchema,
  maxReps: PositiveAtomicIntegerSchema,
  variationId: BoundedIdentifierSchema,
  perSide: z.boolean(),
}).refine(({ minReps, maxReps }) => maxReps >= minReps);

export const BodyweightRepsObservationV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("bodyweight_reps"),
  reps: PositiveAtomicIntegerSchema,
  source: MetricValueSourceSchema,
});

export const AddedLoadRepsTargetV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("added_load_reps"),
  addedLoadGrams: NonnegativeAtomicIntegerSchema,
  minReps: PositiveAtomicIntegerSchema,
  maxReps: PositiveAtomicIntegerSchema,
  incrementGrams: PositiveAtomicIntegerSchema,
  perSide: z.boolean(),
}).refine(({ minReps, maxReps }) => maxReps >= minReps);

export const AddedLoadRepsObservationV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("added_load_reps"),
  addedLoadGrams: NonnegativeAtomicIntegerSchema,
  reps: PositiveAtomicIntegerSchema,
  source: MetricValueSourceSchema,
});

export const AssistedRepsTargetV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("assisted_reps"),
  assistanceGrams: NonnegativeAtomicIntegerSchema,
  minReps: PositiveAtomicIntegerSchema,
  maxReps: PositiveAtomicIntegerSchema,
  decrementGrams: PositiveAtomicIntegerSchema,
  assistanceEquipmentId: BoundedIdentifierSchema,
  perSide: z.boolean(),
}).refine(({ minReps, maxReps }) => maxReps >= minReps);

export const AssistedRepsObservationV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("assisted_reps"),
  assistanceGrams: NonnegativeAtomicIntegerSchema,
  reps: PositiveAtomicIntegerSchema,
  source: MetricValueSourceSchema,
});

export const TimedHoldTargetV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("timed_hold"),
  durationSeconds: PositiveAtomicIntegerSchema,
  perSide: z.boolean(),
});

export const TimedHoldObservationV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("timed_hold"),
  durationSeconds: PositiveAtomicIntegerSchema,
  source: MetricValueSourceSchema,
});

export const TimedHoldTargetV2Schema = z.strictObject({
  version: z.literal(2),
  profile: z.literal("timed_hold"),
  durationMs: PositiveAtomicIntegerSchema,
  perSide: z.boolean(),
});

export const TimedHoldObservationV2Schema = z.strictObject({
  version: z.literal(2),
  profile: z.literal("timed_hold"),
  durationMs: PositiveAtomicIntegerSchema,
  source: MetricValueSourceSchema,
});

export const FixedDistanceTargetV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("fixed_distance"),
  plannedDistanceMeters: PositiveAtomicIntegerSchema,
});

export const FixedDistanceObservationV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("fixed_distance"),
  distanceMeters: PositiveAtomicIntegerSchema,
  durationMs: PositiveAtomicIntegerSchema,
  source: MetricValueSourceSchema,
});

export const FixedTimeTargetV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("fixed_time"),
  plannedDurationMs: PositiveAtomicIntegerSchema,
});

export const FixedTimeObservationV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("fixed_time"),
  durationMs: PositiveAtomicIntegerSchema,
  distanceMeters: NonnegativeAtomicIntegerSchema,
  source: MetricValueSourceSchema,
});

export const IntervalsTargetV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("intervals"),
  protocolId: BoundedIdentifierSchema,
  comparatorId: z.literal("rounds_then_work"),
  comparatorVersion: PositiveAtomicIntegerSchema,
  plannedRounds: PositiveAtomicIntegerSchema,
  workIntervalMs: PositiveAtomicIntegerSchema,
  restIntervalMs: NonnegativeAtomicIntegerSchema,
});

export const IntervalsObservationV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("intervals"),
  protocolId: BoundedIdentifierSchema,
  completedRounds: NonnegativeAtomicIntegerSchema,
  completedWorkMs: NonnegativeAtomicIntegerSchema,
  source: MetricValueSourceSchema,
});

export const UnscoredTargetV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("unscored"),
  completionRequired: z.literal(true),
});

export const UnscoredObservationV1Schema = z.strictObject({
  version: z.literal(1),
  profile: z.literal("unscored"),
  completed: z.boolean(),
  source: MetricValueSourceSchema,
});

export type LoadRepsTargetV1 = z.infer<typeof LoadRepsTargetV1Schema>;
export type LoadRepsObservationV1 =
  z.infer<typeof LoadRepsObservationV1Schema>;
export type BodyweightRepsTargetV1 =
  z.infer<typeof BodyweightRepsTargetV1Schema>;
export type BodyweightRepsObservationV1 =
  z.infer<typeof BodyweightRepsObservationV1Schema>;
export type AddedLoadRepsTargetV1 =
  z.infer<typeof AddedLoadRepsTargetV1Schema>;
export type AddedLoadRepsObservationV1 =
  z.infer<typeof AddedLoadRepsObservationV1Schema>;
export type AssistedRepsTargetV1 =
  z.infer<typeof AssistedRepsTargetV1Schema>;
export type AssistedRepsObservationV1 =
  z.infer<typeof AssistedRepsObservationV1Schema>;
export type TimedHoldTargetV1 = z.infer<typeof TimedHoldTargetV1Schema>;
export type TimedHoldObservationV1 =
  z.infer<typeof TimedHoldObservationV1Schema>;
export type TimedHoldTargetV2 = z.infer<typeof TimedHoldTargetV2Schema>;
export type TimedHoldObservationV2 =
  z.infer<typeof TimedHoldObservationV2Schema>;
export type FixedDistanceTargetV1 =
  z.infer<typeof FixedDistanceTargetV1Schema>;
export type FixedDistanceObservationV1 =
  z.infer<typeof FixedDistanceObservationV1Schema>;
export type FixedTimeTargetV1 = z.infer<typeof FixedTimeTargetV1Schema>;
export type FixedTimeObservationV1 =
  z.infer<typeof FixedTimeObservationV1Schema>;
export type IntervalsTargetV1 = z.infer<typeof IntervalsTargetV1Schema>;
export type IntervalsObservationV1 =
  z.infer<typeof IntervalsObservationV1Schema>;
export type UnscoredTargetV1 = z.infer<typeof UnscoredTargetV1Schema>;
export type UnscoredObservationV1 =
  z.infer<typeof UnscoredObservationV1Schema>;

export type MetricTarget =
  | LoadRepsTargetV1
  | BodyweightRepsTargetV1
  | AddedLoadRepsTargetV1
  | AssistedRepsTargetV1
  | TimedHoldTargetV1
  | TimedHoldTargetV2
  | FixedDistanceTargetV1
  | FixedTimeTargetV1
  | IntervalsTargetV1
  | UnscoredTargetV1;

export type MetricObservation =
  | LoadRepsObservationV1
  | BodyweightRepsObservationV1
  | AddedLoadRepsObservationV1
  | AssistedRepsObservationV1
  | TimedHoldObservationV1
  | TimedHoldObservationV2
  | FixedDistanceObservationV1
  | FixedTimeObservationV1
  | IntervalsObservationV1
  | UnscoredObservationV1;

export type MetricComparatorId =
  | "load_then_reps"
  | "reps"
  | "added_load_then_reps"
  | "assistance_then_reps"
  | "duration"
  | "fixed_distance_duration"
  | "fixed_time_distance"
  | "plan_authored_intervals"
  | "completion";

export type MetricAggregateId =
  | "mean_load_and_reps"
  | "mean_reps"
  | "mean_added_load_and_reps"
  | "mean_assistance_and_reps"
  | "mean_duration"
  | "mean_fixed_distance_duration"
  | "mean_fixed_time_distance"
  | "mean_intervals"
  | "completion_rate";

export type MetricExposureId =
  | "identity"
  | "identity_and_variation"
  | "identity_and_assistance_equipment"
  | "identity_and_side"
  | "identity_and_planned_distance"
  | "identity_and_planned_duration"
  | "identity_and_interval_protocol"
  | "completion_history";

export const METRIC_TIE_ORDER = [
  "completedAtMs",
  "sessionId",
  "setOrdinal",
  "setId",
] as const;

export type MetricContractDefinition = Readonly<{
  profile: MetricProfile;
  contractVersion: number;
  targetSchema: z.ZodType;
  observationSchema: z.ZodType;
  comparatorId: MetricComparatorId;
  aggregateId: MetricAggregateId;
  exposureId: MetricExposureId;
  averagePopulation: "completed_comparable_working_sets";
  tieOrder: typeof METRIC_TIE_ORDER;
}>;

export type MetricContract = MetricContractDefinition & Readonly<{
  identity: MetricIdentity;
}>;
