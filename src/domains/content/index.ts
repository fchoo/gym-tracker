import { z } from "zod";

const WeekdaySchema = z.enum(["Monday", "Wednesday", "Friday"]);
const UuidSchema = z.string().uuid();
const PositiveInteger = z.number().int().positive().safe();
const NonnegativeInteger = z.number().int().nonnegative().safe();

const WarmupSchema = z.strictObject({
  loadGrams: NonnegativeInteger,
  reps: PositiveInteger,
});

const LoadRepsTargetSchema = z.strictObject({
  kind: z.literal("load_reps"),
  sets: PositiveInteger,
  loadGrams: NonnegativeInteger,
  minReps: PositiveInteger,
  maxReps: PositiveInteger,
  perSide: z.boolean(),
}).superRefine((value, context) => {
  if (value.maxReps < value.minReps) {
    context.addIssue({
      code: "custom",
      message: "maxReps must be at least minReps",
      path: ["maxReps"],
    });
  }
});

const TimedHoldTargetSchema = z.strictObject({
  kind: z.literal("timed_hold"),
  sets: PositiveInteger,
  durationSeconds: PositiveInteger,
  perSide: z.boolean(),
});

const LoadRepsExerciseSchema = z.strictObject({
  exerciseId: UuidSchema,
  name: z.string().trim().min(1).max(120),
  equipment: z.string().trim().min(1).max(160),
  metricProfile: z.literal("load_reps"),
  restSeconds: NonnegativeInteger,
  incrementGrams: PositiveInteger,
  warmups: z.array(WarmupSchema).max(6),
  target: LoadRepsTargetSchema,
  policy: z.strictObject({
    kind: z.literal("load_reps"),
    id: z.literal("load_reps.double_progression.v1"),
    version: z.literal(1),
  }),
});

const TimedHoldExerciseSchema = z.strictObject({
  exerciseId: UuidSchema,
  name: z.string().trim().min(1).max(120),
  equipment: z.string().trim().min(1).max(160),
  metricProfile: z.literal("timed_hold"),
  restSeconds: NonnegativeInteger,
  incrementGrams: z.literal(0),
  warmups: z.tuple([]),
  target: TimedHoldTargetSchema,
  policy: z.strictObject({
    kind: z.literal("manual_hold"),
    id: z.literal("timed_hold.v1"),
    version: z.literal(1),
  }),
});

const ExerciseSchema = z.discriminatedUnion("metricProfile", [
  LoadRepsExerciseSchema,
  TimedHoldExerciseSchema,
]);

const DaySchema = z.strictObject({
  name: z.enum(["Full Body A", "Full Body B"]),
  exercises: z.array(ExerciseSchema).length(5),
});

export const FullBodyFoundationSchema = z.strictObject({
  version: z.literal(1),
  metadata: z.strictObject({
    namespace: z.literal("gym-tracker.original"),
    templateId: z.literal("full-body-foundation"),
    sourceRevision: z.literal(1),
    displayName: z.literal("Full Body Foundation"),
    audience: z.literal("Beginner or returning"),
    schedule: z.strictObject({
      mode: z.literal("weekday"),
      cycle: z.array(
        z.array(z.strictObject({
          weekday: WeekdaySchema,
          day: z.enum(["Full Body A", "Full Body B"]),
        })).length(3),
      ).length(2),
    }),
    goal: z.literal("General strength, basic hypertrophy, and consistency"),
    estimateMinutes: z.literal(48),
    attribution: z.literal("Original Gym Tracker program"),
    progressionPolicy: z.literal("load_reps.double_progression.v1"),
  }),
  days: z.array(DaySchema).length(2),
}).superRefine((value, context) => {
  const dayNames = value.days.map(({ name }) => name);
  if (new Set(dayNames).size !== dayNames.length) {
    context.addIssue({
      code: "custom",
      message: "day names must be unique",
      path: ["days"],
    });
  }

  const exerciseIds = value.days.flatMap(({ exercises }) =>
    exercises.map(({ exerciseId }) => exerciseId),
  );
  if (new Set(exerciseIds).size !== exerciseIds.length) {
    context.addIssue({
      code: "custom",
      message: "exercise ids must be unique",
      path: ["days"],
    });
  }

  for (const [weekIndex, week] of value.metadata.schedule.cycle.entries()) {
    if (new Set(week.map(({ weekday }) => weekday)).size !== week.length) {
      context.addIssue({
        code: "custom",
        message: "schedule weekdays must be unique per week",
        path: ["metadata", "schedule", "cycle", weekIndex],
      });
    }
  }
});

export type FullBodyFoundation = z.infer<typeof FullBodyFoundationSchema>;
export type FoundationExercise =
  FullBodyFoundation["days"][number]["exercises"][number];
export type FoundationLoadRepsExercise = Extract<
  FoundationExercise,
  { metricProfile: "load_reps" }
>;
export type FoundationTimedHoldExercise = Extract<
  FoundationExercise,
  { metricProfile: "timed_hold" }
>;

export class FullBodyFoundationValidationError extends Error {
  readonly code = "full_body_foundation_invalid";

  constructor() {
    super("full_body_foundation_invalid");
    this.name = "FullBodyFoundationValidationError";
  }
}

export function parseFullBodyFoundation(input: unknown): FullBodyFoundation {
  const result = FullBodyFoundationSchema.safeParse(input);
  if (!result.success) {
    throw new FullBodyFoundationValidationError();
  }
  return result.data;
}
