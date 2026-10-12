import type { TrainingFoundationRuntimePort } from "../../bootstrap/trainingFoundationRuntime";
import type { WorkoutPresentationModel } from "../../domains/workout/workoutPresentation";

export { WorkoutSessionPresentation as CalendarWorkoutSessionPresentation } from "../components/WorkoutSessionPresentation";

/** The only foundation authority Calendar may receive: bounded facts reads. */
export type CalendarReadPort = Pick<
  TrainingFoundationRuntimePort,
  "loadCalendarRange" | "loadPlannedStrengthOccurrence"
>;

export type CalendarRange = Awaited<ReturnType<CalendarReadPort["loadCalendarRange"]>>;
export type CalendarEvent = CalendarRange["events"][number];
export type CalendarEventDestination = CalendarEvent["destination"];

/** The Phase 15 factual model remains presentation-only in Calendar. */
export type CalendarWorkoutPresentationModel = WorkoutPresentationModel;
