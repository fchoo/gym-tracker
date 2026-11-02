export const LIBRARY_PLAN_DELETION_KEY_PREFIX = "gym_tracker.library_plan_deletion.v1:";

export function libraryPlanDeletionKey(planId: string): string {
  return `${LIBRARY_PLAN_DELETION_KEY_PREFIX}${planId}`;
}

export type LibraryPlanDeletionReason = "workout_linked" | "not_found" | "bundled" | "already_deleted";
export type LibraryPlanDeletionEligibility = Readonly<{
  planId: string;
  eligible: boolean;
  reason: LibraryPlanDeletionReason | null;
}>;
export type LibraryPlanDeletionResult =
  | Readonly<{ outcome: "deleted"; planId: string }>
  | Readonly<{ outcome: "ineligible"; planId: string; reason: LibraryPlanDeletionReason }>;

export type LibraryPlanDeletionPort = Readonly<{
  readEligibility(planId: string): Promise<LibraryPlanDeletionEligibility>;
  deletePlan(input: Readonly<{ planId: string }>): Promise<LibraryPlanDeletionResult>;
}>;
