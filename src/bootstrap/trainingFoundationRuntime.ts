import type { PlannedStrengthOccurrenceDetail } from "../domains/workout";
import { createPlansWorkoutRepository } from "../platform/sqlite/repositories/plansWorkoutRepository";
import type { SqliteKernel } from "../platform/sqlite/sqliteKernel";

export type TrainingFoundationRuntimePort = Readonly<{
  loadPlannedStrengthOccurrence(occurrenceId: string): Promise<PlannedStrengthOccurrenceDetail | null>;
}>;

/** Query-only cross-domain handoff for later Today and Calendar consumers. */
export function createTrainingFoundationRuntimePort(kernel: SqliteKernel): TrainingFoundationRuntimePort {
  const repository = createPlansWorkoutRepository(kernel);
  const loadPlannedStrengthOccurrence = repository.loadPlannedStrengthOccurrence;
  if (loadPlannedStrengthOccurrence === undefined) {
    throw new Error("planned_strength_occurrence_loader_unavailable");
  }
  return Object.freeze({
    loadPlannedStrengthOccurrence: (occurrenceId) =>
      loadPlannedStrengthOccurrence(occurrenceId),
  });
}
