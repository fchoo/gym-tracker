import { describe, expect, it } from "@jest/globals";

import {
  PLAN_WEIGHT_INCREMENT_GRAMS,
  WorkoutPreferenceConflictError,
  validateWorkoutPreferenceWrite,
} from "./workoutPreferences";

describe("workoutPreferences", () => {
  it("accepts only the approved bounded rest and increment preference values", () => {
    expect(validateWorkoutPreferenceWrite({
      planId: "plan-strength-a",
      expectedRevision: 4,
      defaultRestSeconds: 90,
      weightIncrementGrams: 2500,
      updatedAtMs: 1_000,
    })).toEqual({
      planId: "plan-strength-a",
      expectedRevision: 4,
      defaultRestSeconds: 90,
      weightIncrementGrams: 2500,
      updatedAtMs: 1_000,
    });
    expect(PLAN_WEIGHT_INCREMENT_GRAMS).toEqual([1250, 2500, 5000]);
  });

  it.each([
    { defaultRestSeconds: -1, weightIncrementGrams: 2500 },
    { defaultRestSeconds: 86_401, weightIncrementGrams: 2500 },
    { defaultRestSeconds: 90, weightIncrementGrams: 1000 },
  ])("rejects invalid persisted preference values %#", (values) => {
    expect(() => validateWorkoutPreferenceWrite({
      planId: "plan-strength-a",
      expectedRevision: 0,
      updatedAtMs: 1_000,
      ...values,
    })).toThrow(WorkoutPreferenceConflictError);
  });
});
