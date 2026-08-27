import type { FullBodyFoundation } from "../content";

export type PlanOrigin = "bundled" | "custom" | "copied";

export type ActivatedPlan = Readonly<{
  id: string;
  origin: "custom" | "copied";
  sourceNamespace: string | null;
  upstreamId: string | null;
  name: string;
  isActive: true;
  revision: number;
}>;

export type ActivatedPlanDay = Readonly<{
  id: string;
  name: string;
  ordinal: number;
}>;

export type ActivatedSchedule = Readonly<{
  id: string;
  mode: "weekday" | "rotation";
  startLocalDate: string;
  timezone: string;
  cycleLengthWeeks: number;
}>;

export type StarterActivation = Readonly<{
  plan: ActivatedPlan;
  days: readonly ActivatedPlanDay[];
  schedule: ActivatedSchedule;
}>;

export interface PlansRepository {
  activateStarterPlan(input: Readonly<{
    fixture: FullBodyFoundation;
    activatedAtMs: number;
    startLocalDate: string;
    timezone: string;
  }>): Promise<StarterActivation>;
}

export {
  ACCEPTED_STARTER_ACCEPTANCE_SHA256,
  ACCEPTED_STARTER_ASSET_SHA256,
  ACCEPTED_STARTER_NAMESPACE,
  AcceptedStarterPlanActivationError,
  activateStarterPlan,
  createStarterPlanCopy,
  createStarterPlanActivationConfirmationToken,
  parseAcceptedStarterPlanPack,
  type AcceptedScheduleBinding,
  type AcceptedStarterDay,
  type AcceptedStarterOccurrence,
  type AcceptedStarterPack,
  type AcceptedStarterPlanActivation,
  type AcceptedStarterPlanCopy,
  type AcceptedStarterPlanCopyRepositoryInput,
  type AcceptedStarterPlanRepository,
  type AcceptedStarterPlanRepositoryInput,
  type AcceptedStarterTemplate,
  type AcceptedStarterWarmup,
  type AcceptedActivateStarterPlanInput,
  type AcceptedCreateStarterPlanCopyInput,
  type ActivateStarterPlanInput,
  type LegacyActivateStarterPlanInput,
  type StarterPlanCopyChoice,
} from "./activateStarterPlan";
export {
  archiveOwnedPlan,
  createOwnedPlanDraft,
  duplicateOwnedPlan,
  OwnedPlanInputError,
  restoreOwnedPlan,
  saveOwnedPlan,
  type CreateOwnedPlanDraftInput,
  type DuplicateOwnedPlanInput,
  type OwnedPlanDayInput,
  type OwnedPlanDraftInput,
  type OwnedPlanOccurrenceInput,
  type OwnedPlanPolicyInput,
  type OwnedPlanTargetInput,
  type OwnedPlanWarmupInput,
  type SaveOwnedPlanInput,
  type SetOwnedPlanArchivedInput,
} from "./ownedPlanCommands";
export {
  PlanImpactInputError,
  previewDayRemoval,
  previewExerciseReplacement,
  removePlanDayWithImpact,
  replacePlanExercise,
  type DayRemovalPreview,
  type ExerciseReplacementCandidate,
  type ExerciseReplacementCommandResult,
  type ExerciseReplacementPreview,
  type PlanImpactCommandResult,
  type RemovePlanDayWithImpactInput,
  type ReplacePlanExerciseInput,
} from "./planImpactCommands";
