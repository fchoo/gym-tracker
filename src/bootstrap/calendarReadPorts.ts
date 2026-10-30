import type { ImportedActivityDetailReadResult } from "../domains/activities/activityDetails";
import type { RunningPlanAggregate } from "../domains/running/contracts";
import type { PlannedStrengthOccurrenceDetail, SessionDetail } from "../domains/workout";
import type { TrainingCalendarRange } from "../platform/sqlite/repositories/trainingCalendarRepository";
import type { GarminRevisionReviewDetail } from "./workoutAppRuntime";

type CalendarWorkoutReadSource = Readonly<{
  loadCalendarRange(input: Readonly<{
    startLocalDate: string;
    endLocalDateExclusive: string;
  }>): Promise<TrainingCalendarRange>;
  getCalendarSessionDetail(sessionId: string): Promise<SessionDetail | null>;
  loadPlannedStrengthOccurrence(occurrenceId: string): Promise<PlannedStrengthOccurrenceDetail | null>;
  loadImportedActivityDetail(activityId: string): Promise<ImportedActivityDetailReadResult>;
  loadGarminRevisionReview(activityId: string): Promise<GarminRevisionReviewDetail | null>;
}>;

export type CalendarRangeReadPort = Pick<CalendarWorkoutReadSource, "loadCalendarRange">;
type CalendarSessionReadSource = Pick<CalendarWorkoutReadSource, "getCalendarSessionDetail">;
export type CalendarSessionReadPort = Readonly<{
  loadCalendarSessionDetail(sessionId: string): Promise<SessionDetail | null>;
}>;
export type CalendarStrengthOccurrenceReadPort = Pick<CalendarWorkoutReadSource, "loadPlannedStrengthOccurrence">;
export type CalendarActivityReadPort = Pick<
  CalendarWorkoutReadSource,
  "loadImportedActivityDetail" | "loadGarminRevisionReview"
>;

export type CalendarRunningPlanReadPort = Readonly<{
  loadScheduledSessionPlan(
    planId: string,
    sessionRevisionId: string,
  ): Promise<RunningPlanAggregate | null>;
}>;

export function createCalendarRangeReadPort(
  source: CalendarRangeReadPort,
): CalendarRangeReadPort {
  return Object.freeze({ loadCalendarRange: source.loadCalendarRange });
}

export function createCalendarSessionReadPort(
  source: CalendarSessionReadSource,
): CalendarSessionReadPort {
  return Object.freeze({
    loadCalendarSessionDetail: source.getCalendarSessionDetail,
  });
}

export function createCalendarStrengthOccurrenceReadPort(
  source: CalendarStrengthOccurrenceReadPort,
): CalendarStrengthOccurrenceReadPort {
  return Object.freeze({
    loadPlannedStrengthOccurrence: source.loadPlannedStrengthOccurrence,
  });
}

export function createCalendarActivityReadPort(
  source: CalendarActivityReadPort,
): CalendarActivityReadPort {
  return Object.freeze({
    loadImportedActivityDetail: source.loadImportedActivityDetail,
    loadGarminRevisionReview: source.loadGarminRevisionReview,
  });
}

export function createCalendarRunningPlanReadPort(
  source: CalendarRunningPlanReadPort,
): CalendarRunningPlanReadPort {
  return Object.freeze({
    loadScheduledSessionPlan: source.loadScheduledSessionPlan,
  });
}
