export const SESSION_STATUSES = [
  "in_progress",
  "completed",
  "partial",
  "discarded",
  "voided",
  "manual_visit",
  "zero_sets",
] as const;

export type WorkoutSessionStatus = (typeof SESSION_STATUSES)[number];

export type WorkoutOutcomeAction =
  | "finish_completed"
  | "finish_partial"
  | "save_zero_sets"
  | "discard"
  | "resume_partial";

export function nextWorkoutStatus(
  status: WorkoutSessionStatus,
  action: WorkoutOutcomeAction,
): WorkoutSessionStatus {
  const transitions: Partial<
    Record<WorkoutSessionStatus, Partial<Record<WorkoutOutcomeAction, WorkoutSessionStatus>>>
  > = {
    in_progress: {
      finish_completed: "completed",
      finish_partial: "partial",
      save_zero_sets: "zero_sets",
      discard: "discarded",
    },
    partial: {
      resume_partial: "in_progress",
    },
  };
  const next = transitions[status]?.[action];
  if (next === undefined) {
    throw new WorkoutOutcomeConflictError("workout_outcome_transition_invalid");
  }
  return next;
}

export function sessionStatusLabel(status: WorkoutSessionStatus): string {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "completed":
      return "Completed";
    case "partial":
      return "Partial";
    case "discarded":
      return "Discarded";
    case "voided":
      return "Removed from history";
    case "manual_visit":
      return "Manual visit";
    case "zero_sets":
      return "Zero working sets";
  }
}

export function sessionIsResumable(status: WorkoutSessionStatus): boolean {
  return status === "in_progress" || status === "partial";
}

export class WorkoutOutcomeConflictError extends Error {
  readonly kind = "conflict" as const;
  readonly retryable = false;

  constructor(readonly code: string) {
    super(code);
    this.name = "WorkoutOutcomeConflictError";
  }
}
