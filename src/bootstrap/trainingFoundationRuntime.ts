import type { PlannedStrengthOccurrenceDetail } from "../domains/workout";
import { addLocalDays, parseLocalDate } from "../domains/scheduling";
import { commitBodyweightCommand } from "../domains/bodyweight/commands";
import type {
  BodyweightCommand,
  BodyweightEntryState,
  BodyweightTransition,
} from "../domains/bodyweight/contracts";
import { runtimeSha256 } from "../platform/crypto/runtimeSha256";
import { createBodyweightRepository } from "../platform/sqlite/repositories/bodyweightRepository";
import {
  createTrainingCalendarRepository,
  type TrainingCalendarRange,
} from "../platform/sqlite/repositories/trainingCalendarRepository";
import { createPlansWorkoutRepository } from "../platform/sqlite/repositories/plansWorkoutRepository";
import type { SqliteKernel } from "../platform/sqlite/sqliteKernel";

export type TrainingFoundationRuntimePort = Readonly<{
  loadPlannedStrengthOccurrence(occurrenceId: string): Promise<PlannedStrengthOccurrenceDetail | null>;
  loadToday(localDate: string): Promise<TrainingCalendarRange>;
  loadCalendarRange(input: Readonly<{
    startLocalDate: string;
    endLocalDateExclusive: string;
    displayTimeZone?: string;
  }>): Promise<TrainingCalendarRange>;
  loadBodyweightHistory(ownerId: string): Promise<readonly BodyweightEntryState[]>;
  commitBodyweight(input: BodyweightCommand): Promise<BodyweightTransition>;
}>;

/** Query-only cross-domain handoff for later Today and Calendar consumers. */
export function createTrainingFoundationRuntimePort(kernel: SqliteKernel): TrainingFoundationRuntimePort {
  const repository = createPlansWorkoutRepository(kernel);
  const loadPlannedStrengthOccurrence = repository.loadPlannedStrengthOccurrence;
  if (loadPlannedStrengthOccurrence === undefined) {
    throw new Error("planned_strength_occurrence_loader_unavailable");
  }
  const calendar = createTrainingCalendarRepository(kernel);
  const bodyweight = createBodyweightRepository(kernel);
  return Object.freeze({
    loadPlannedStrengthOccurrence: (occurrenceId) =>
      loadPlannedStrengthOccurrence(occurrenceId),
    loadToday: (localDate) => {
      const start = parseLocalDate(localDate);
      return calendar.loadRange({
        startLocalDate: start,
        endLocalDateExclusive: addLocalDays(start, 1),
      });
    },
    loadCalendarRange: (input) => calendar.loadRange(input),
    loadBodyweightHistory: (ownerId) => bodyweight.history(ownerId),
    commitBodyweight: (input) => commitBodyweightCommand(bodyweight, input, runtimeSha256),
  });
}
