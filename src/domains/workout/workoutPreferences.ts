export const PLAN_WEIGHT_INCREMENT_GRAMS = [1250, 2500, 5000] as const;
export const DEFAULT_WORKOUT_PREFERENCE = Object.freeze({
  defaultRestSeconds: 90,
  weightIncrementGrams: 2500,
});

export type WorkoutPreference = Readonly<{
  version: 1;
  planId: string;
  defaultRestSeconds: number;
  weightIncrementGrams: (typeof PLAN_WEIGHT_INCREMENT_GRAMS)[number];
  revision: number;
}>;

export type WorkoutPreferenceWrite = Readonly<{
  planId: string;
  expectedRevision: number;
  defaultRestSeconds: number;
  weightIncrementGrams: number;
  updatedAtMs: number;
}>;

export class WorkoutPreferenceConflictError extends Error {
  readonly kind = "conflict" as const;
  constructor(readonly code: "workout_preference_invalid" | "workout_preference_conflict") {
    super(code);
    this.name = "WorkoutPreferenceConflictError";
  }
}

export type WorkoutPreferenceRepository = Readonly<{
  read(planId: string): Promise<WorkoutPreference>;
  write(input: WorkoutPreferenceWrite): Promise<WorkoutPreference>;
}>;

export function workoutPreferenceKey(planId: string): string {
  return `gym_tracker.workout_plan_preferences.v1:${planId}`;
}

export function validateWorkoutPreferenceWrite(
  input: WorkoutPreferenceWrite,
): WorkoutPreferenceWrite {
  if (
    input.planId.trim().length === 0
    || !Number.isSafeInteger(input.expectedRevision)
    || input.expectedRevision < 0
    || !Number.isSafeInteger(input.updatedAtMs)
    || input.updatedAtMs < 0
    || !Number.isSafeInteger(input.defaultRestSeconds)
    || input.defaultRestSeconds < 0
    || input.defaultRestSeconds > 86_400
    || !PLAN_WEIGHT_INCREMENT_GRAMS.includes(
      input.weightIncrementGrams as (typeof PLAN_WEIGHT_INCREMENT_GRAMS)[number],
    )
  ) {
    throw new WorkoutPreferenceConflictError("workout_preference_invalid");
  }
  return Object.freeze({ ...input });
}
