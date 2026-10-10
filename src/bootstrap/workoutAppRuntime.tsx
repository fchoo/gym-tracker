import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import exerciseCatalogAsset from "../../assets/content/exercise-library.v1.json";
import exerciseCatalogManifestAsset from "../../assets/content/exercise-library.v1.manifest.json";
import fullBodyFoundationAsset from "../../assets/content/full-body-foundation.v1.json";
import starterPlansAsset from "../../assets/content/starter-plans.v2.json";
import exerciseCatalogAcceptanceAsset from "../../artifacts/review/phase2/exercise-library-acceptance.json";
import starterPlansAcceptanceAsset from "../../artifacts/review/phase2/starter-plans-acceptance.json";
import type {
  ContentUpdateResult,
} from "../domains/content/catalog";
import type {
  CalendarMonth,
  HistoryCorrectionEditorState,
  ExerciseMetricHistory,
  RemovedHistorySession,
} from "../domains/history";
import type {
  ProgressPeriod,
  ProgressPeriodProjection,
  ProgressProjectionDiagnostic,
  ProgressProjectionFreshness,
} from "../domains/progress";
import {
  correctHistorySession,
  removeHistorySession,
  restoreHistorySession,
  type AvailableCorrectionExercise,
  type CorrectHistorySessionInput,
  type CorrectHistorySessionResult,
  type HistoryLifecycleResult,
  type RestoreHistorySessionInput,
  type VoidHistorySessionInput,
} from "../domains/history";
import {
  parseExerciseCatalog,
} from "../domains/content/catalog";
import type {
  SearchFilters,
} from "../domains/library/search";
import {
  archiveCustomExercise,
  createCustomExercise as createCustomExerciseCommand,
  editCustomExercise as editCustomExerciseCommand,
  previewCustomExerciseArchive,
  restoreCustomExercise,
  setExerciseHidden,
  setExerciseFavorite as setExerciseFavoriteCommand,
  type CreateCustomExerciseInput,
  type EditCustomExerciseInput,
} from "../domains/library/customExerciseCommands";
import {
  migrateCustomExerciseMetricProfile,
  type MigrateCustomExerciseMetricProfileInput,
} from "../domains/metrics/migrateCustomExerciseMetricProfile";
import type {
  ActivatedPlanDay,
} from "../domains/plans";
import {
  activateStarterPlan,
  createStarterPlanCopy,
  createStarterPlanActivationConfirmationToken,
  type AcceptedActivateStarterPlanInput,
  type AcceptedStarterTemplate,
  type AcceptedStarterPlanActivation,
} from "../domains/plans";
import type {
  InitialRotationScheduleBinding,
  InitialWeekdayScheduleBinding,
} from "../domains/scheduling";
import {
  acceptRecommendation,
  keepCurrentTarget,
  recordExerciseEffort,
  type ExerciseEffort,
  type RecommendationDecisionResult,
} from "../domains/progression";
import {
  adjustRest,
  expireRest,
  expireRestWithForegroundFeedback,
  pauseRest,
  resumeRest,
  skipRest,
  startManualRest,
  REST_NOTIFICATION_CHANNEL_IDS,
  type AdjustRestInput,
  type RestCommandResult,
  type RestNotificationPermission,
  type RestNotificationPort,
  type RestRevisionInput,
} from "../domains/rest";
import type {
  ActiveWorkoutView,
  AddExerciseInput,
  AddExerciseResult,
  CompletedWorkoutPlanWriteBackState,
  CompletedWorkoutPlanWriteBackChoiceState,
  FinishOutcomeResult,
  RemoveSetResult,
  RemoveWarmupInput,
  RemoveWorkingSetInput,
  ReorderExercisesInput,
  ReviseCompletedSetInput,
  SelectedStrengthOccurrence,
  SessionDetail,
  TodayView,
  WorkoutSessionView,
} from "../domains/workout";
import type {
  WorkoutPreference,
  WorkoutPreferenceWrite,
} from "../domains/workout/workoutPreferences";
import {
  DISCARD_CONFIRMATION,
  PARTIAL_CONFIRMATION,
  WorkoutCommandConflictError,
  addExercise,
  addWarmup,
  addWorkingSet,
  applyCompletedWorkoutPlanWriteBack,
  beginCompletedWorkoutPlanWriteBack,
  discardWorkout,
  finishCompleted,
  finishPartial,
  keepCompletedWorkoutPlanAsIs,
  previewCompletedWorkoutPlanWriteBack,
  startWorkout,
  completeSet,
  completeWarmup,
  removeWarmup,
  removeWorkingSet,
  reviseCompletedSet,
  resumePartialWorkout,
  saveZeroSetWorkout,
  skipExercise,
  skipWorkingSet,
  skipWarmup,
  undoCompletedSet,
  updateActiveSetDraft,
  updateWarmupDraft,
  type AddWarmupInput,
  type AddWorkingSetInput,
  type CompleteSetInput,
  type CompleteWarmupInput,
  type UpdateSessionExerciseDefaultRestInput,
  type DiscardWorkoutInput,
  type FinishCompletedInput,
  type FinishPartialInput,
  type ResumePartialWorkoutInput,
  type SaveZeroSetInput,
  type SkipExerciseInput,
  type SkipWorkingSetInput,
  type SkipWarmupInput,
  type UndoCompletedSetInput,
  type UpdateActiveSetDraftInput,
  type UpdateWarmupDraftInput,
} from "../domains/workout";
import {
  removeExercise,
  reorderExercises,
  replaceExercise,
} from "../domains/workout/sessionExerciseCommands";
import type {
  RemoveExerciseInput,
  RemoveExerciseResult,
  ReorderExercisesResult,
  ReplaceExerciseInput,
  ReplaceExerciseResult,
} from "../domains/workout/activeWorkout";
import type {
  AppError,
} from "../domains/shared";
import {
  createExpoHapticsAdapter,
} from "../platform/haptics/expoHapticsAdapter";
import {
  runWorkoutMutationWithTestFailure,
} from "./workoutMutationTestControls";
import {
  createExpoRestNotificationAdapter,
} from "../platform/notifications/expoRestNotificationAdapter";
import {
  DEFAULT_REST_ALERT_PREFERENCES,
  productionRestAlertPreferenceStore,
  type RestAlertPreferences,
  type RestAlertPreferenceStore,
} from "../platform/preferences/restAlertPreferenceStore";
import {
  createEffectStore,
} from "../platform/sqlite/effects/effectStore";
import {
  createWorkoutPreferenceRepository,
} from "../platform/sqlite/repositories/workoutPreferenceRepository";
import {
  createBackupCommands,
  type SecureBackupArchiveHandle,
  type SecureBackupCommands,
} from "../domains/portability/backupCommands";
import {
  createRestoreCommands,
  createRestorePreflightStore,
  type RestoreCommands,
} from "../domains/portability/restoreCommands";
import {
  createMergeCommands,
  createMergePreflightStore,
  type SecureMergeCommands,
} from "../domains/portability/mergeCommands";
import {
  createAesGcmArchivePort,
  createExpoAesGcmArchiveDriver,
} from "../platform/crypto/aesGcmArchivePort";
import {
  createPasswordKdfPort,
} from "../platform/crypto/passwordKdf";
import {
  createProductionExpoBackupFilePort,
  PHASE11_MERGE_FIXTURE_SELECTOR_FILE,
  createPhase11FixtureRestoreFilePort,
  createProductionExpoRestoreFilePort,
  type BackupArchiveHandle,
} from "../platform/files/expoBackupFilePort";
import {
  createPhase14RecoveryFixtureRestoreFilePort,
  phase14RecoveryFixtureFromNativeContract,
} from "../testing/phase14RecoveryFixture";
import {
  createProductionExpoCsvFilePort,
  type CsvExportHandle,
  type CsvFilePort,
} from "../platform/files/expoCsvFilePort";
import {
  createMigrationRunner,
} from "../platform/sqlite/migrationRunner";
import {
  migrations,
} from "../platform/sqlite/migrations";
import {
  createExpoRecoveryBackupPort,
} from "../platform/sqlite/recoveryBackup";
import {
  createContentRepository,
} from "../platform/sqlite/repositories/contentRepository";
import {
  createCustomExerciseRepository,
  type CustomExerciseArchivePreview,
} from "../platform/sqlite/repositories/customExerciseRepository";
import {
  createLibrarySearchRepository,
  type LibrarySearchItem,
  type LibrarySearchResult,
} from "../platform/sqlite/repositories/librarySearchRepository";
import {
  createHistoryRepository,
} from "../platform/sqlite/repositories/historyRepository";
import {
  createHistoryCommandRepository,
} from "../platform/sqlite/repositories/historyCommandRepository";
import {
  createCsvExportRepository,
  type CsvExportRepository,
} from "../platform/sqlite/repositories/csvExportRepository";
import {
  createHistoryProjectionRepository,
} from "../platform/sqlite/repositories/historyProjectionRepository";
import {
  createExerciseSearchIndexRepository,
} from "../platform/sqlite/repositories/exerciseSearchIndexRepository";
import {
  createProgressRepository,
} from "../platform/sqlite/repositories/progressRepository";
import {
  createHistoryProjectionEffectStore,
} from "../platform/sqlite/effects/historyProjectionEffects";
import {
  createMetricRepository,
} from "../platform/sqlite/repositories/metricRepository";
import {
  createPlansWorkoutRepository,
} from "../platform/sqlite/repositories/plansWorkoutRepository";
import {
  createRestRepository,
} from "../platform/sqlite/repositories/restRepository";
import {
  createStarterPlanRepository,
  installAcceptedStarterPlanSources,
} from "../platform/sqlite/repositories/starterPlanRepository";
import {
  createWorkoutRepository,
} from "../platform/sqlite/repositories/workoutRepository";
import {
  createLogicalBackupRepository,
} from "../platform/sqlite/repositories/logicalBackupRepository";
import {
  createLogicalRestoreRepository,
} from "../platform/sqlite/repositories/logicalRestoreRepository";
import {
  createFullPlanLogicalMergeWriter,
} from "../platform/sqlite/repositories/logicalMergeRepository";
import {
  createRestoreReconciliationRepository,
} from "../platform/sqlite/repositories/restoreReconciliationRepository";
import type {
  RestoreReconciliationResult,
} from "../platform/sqlite/repositories/restoreReconciliationRepository";
import {
  createSqliteRestoreCandidateProbe,
  createSqliteRestoreCatalogReferenceAvailabilityPort,
  createSqliteMergeLocalFactsPort,
  createSqliteRestoreRetainedReferencePort,
  createSqliteRestoreSchemaPort,
} from "../platform/sqlite/repositories/restorePreflightAdapters";
import {
  createWorkoutOutcomeRepository,
} from "../platform/sqlite/repositories/workoutOutcomeRepository";
import {
  openSqliteKernel,
  type SqliteKernel,
} from "../platform/sqlite";
import type {
  LaunchFailure,
} from "./launchCoordinator";
import {
  createWorkoutLifecycle,
} from "./workoutLifecycle";
import type { AutomaticBackupScheduler } from "../domains/backup/automaticBackupScheduler";
import type { AutomaticRecoveryCandidate, AutomaticRecoveryCommit, AutomaticRecoveryPreparation } from "../domains/backup/automaticBackupCoordinator";
import { projectAutomaticBackupPresentation, type AutomaticBackupViewModel } from "../domains/backup/automaticBackupPresentation";
import { phase12BackupFixtureFromNativeContract, phase12BackupFixtureViewModel } from "./phase12BackupTestControls";
import type { AutomaticBackupRuntime } from "./automaticBackupRuntime";
import { createProductionAutomaticBackupServices } from "./productionAutomaticBackupRuntime";
import {
  collectPhase14SourceStateProof as collectPhase14SourceStateProofFromKernel,
  type Phase14SourceStateProof,
} from "./phase14SourceStateProof";
import {
  createOwnedPlanRuntimePort,
  type OwnedPlanRuntimeExerciseOption,
} from "./ownedPlanRuntime";
import type {
  OwnedPlanDraftInput,
  RemovePlanDayWithImpactInput,
  ReplacePlanExerciseInput,
} from "../domains/plans";
import type {
  OwnedPlanRepositoryResult,
  OwnedPlanSnapshot,
} from "../platform/sqlite/repositories/ownedPlanRepository";
import {
  createStarterPlanRuntimeCatalog,
  createStarterTemplateUpdatePreview,
  findStarterPlan,
  legacyFullBodySourceJson,
  type StarterPlanRuntimeActivationCommand,
  type StarterPlanRuntimeActivationPreview,
  type StarterPlanRuntimeCatalog,
  type StarterPlanRuntimeSummary,
  type StarterPlanTemplateUpdatePreview,
} from "./starterPlanRuntime";
import {
  createScheduleRuntimePort,
  type ScheduleRuntimeAdapter,
  type ScheduleEditorSnapshot,
  type ScheduleSaveDraft,
  type ScheduleTodayAction,
  type ScheduleTodayPresentation,
} from "./scheduleRuntime";
import type {
  ScheduleOverrideSelection,
  ScheduleTimeZoneChoice,
} from "../domains/scheduling/scheduleState";
import {
  readCustomExerciseDetail,
  readCustomExerciseMigration,
  type CustomExerciseRuntimeDetail,
  type CustomExerciseRuntimeMigration,
} from "./customExerciseRuntimeReadPort";
export {
  createCustomExerciseRuntimeReadPort,
  type CustomExerciseRuntimeDetail,
  type CustomExerciseRuntimeMigration,
} from "./customExerciseRuntimeReadPort";

const DATABASE_NAME = "gym-tracker.db";
const LIBRARY_SECTION_SETTING_KEY = "library.section";
const LATEST_BACKUP_METADATA_SETTING_KEY = "backup.latest";

export type LibraryRuntimeSection = "plans" | "exercises";

export type LibraryRuntimeSectionPreference = Readonly<{
  section: LibraryRuntimeSection;
  revision: number;
}>;

export type LibraryRuntimePlanSummary = Readonly<{
  id: string;
  name: string;
  daysPerWeek: number;
  status?: "Active" | "Draft" | "Archived" | "Inactive";
  scheduleSummary?: string;
  missingRequirement?: string | null;
  templateUpdateTemplateId?: string;
}>;

export type LibraryRuntimeStarterPlanSummary = StarterPlanRuntimeSummary;
export type RuntimeSecureBackupArchive = SecureBackupArchiveHandle;
export type RuntimeCsvExport = CsvExportHandle;
export type RuntimeRestorePreflightResult = Awaited<ReturnType<RestoreCommands["preflightSecureRestore"]>>;
export type RuntimeMergePreflightResult = Awaited<ReturnType<SecureMergeCommands["preflightSecureMerge"]>>;
export type RuntimeRestoreCommitResult = Readonly<{
  state: "ready" | "rebuild_pending";
}>;
export type RuntimeBackupMetadata = Readonly<{
  archiveId: string;
  createdAtMs: number;
  displayName: string;
}>;

export type LibraryRuntimeSnapshot = Readonly<{
  sectionPreference: LibraryRuntimeSectionPreference;
  plans: Readonly<{
    active: LibraryRuntimePlanSummary | null;
    owned: readonly LibraryRuntimePlanSummary[];
    starters: readonly LibraryRuntimeStarterPlanSummary[];
  }>;
  exerciseFilterOptions: Readonly<{
    exerciseTypes: readonly string[];
    muscles: readonly string[];
    equipment: readonly string[];
  }>;
}>;

type LibrarySectionSettingRow = Readonly<{
  value_version: number;
  value_json: string;
  revision: number;
}>;

type LibraryPlanRow = Readonly<{
  id: string;
  name: string;
  days_per_week: number;
  is_active: number;
  lifecycle: "draft" | "ready" | "archived" | null;
  missing_requirement: string | null;
  schedule_lifecycle: "active" | "inactive" | null;
  legacy_schedule_id: string | null;
  source_namespace: string | null;
  upstream_id: string | null;
  source_revision: number | null;
}>;

type LibraryTaxonomyRow = Readonly<{
  kind: "exercise_type" | "muscle" | "equipment";
  slug: string;
}>;

type StarterCopyRow = Readonly<{
  plan_id: string;
  plan_name: string;
  plan_revision: number;
  schedule_lifecycle: "active" | "inactive";
  schedule_revision: number;
  schedule_version_id: string;
  schedule_mode: "weekday" | "rotation";
}>;

type StarterBindingSummaryRow = Readonly<{
  ordinal: number;
  weekday: string | null;
  day_name: string;
}>;

type ActiveStarterScheduleRow = Readonly<{
  revision: number;
}>;

type ActiveStarterWorkoutRow = Readonly<{
  id: string;
  revision: number;
}>;

type TemplateUpdateSourceRow = Readonly<{
  owned_plan_name: string;
  owned_plan_revision: number;
  source_revision: number;
  template_json: string;
  active_schedule_revision: number | null;
}>;

type RuntimeState = Readonly<{
  launchState: "booting" | "trusted" | "failed";
  view?: TodayView;
  planDays: readonly ActivatedPlanDay[];
  selectedStrengthOccurrence?: SelectedStrengthOccurrence | null;
  latestBackup: RuntimeBackupMetadata | null;
  automaticBackup: AutomaticBackupViewModel;
  contentUpdateResult?: ContentUpdateResult;
  contentUpdateFailed?: true;
  scheduleToday?: ScheduleTodayPresentation;
  notificationPermission: RestNotificationPermission;
  workoutRefreshGeneration: number;
  failure?: LaunchFailure;
  actionFailure?: Readonly<{
    code: "workout_action_failed";
    correlationCode: "GT-ACTION01";
  }>;
  mutationFailure?: AppError;
}>;

export type NotificationExpiryExerciseMode = "foreground" | "background";

export type NotificationExpiryExerciseCode =
  | "foreground_expiry_attempted_once"
  | "background_expiry_scheduled_once"
  | "permission_denied"
  | "runtime_contract_unavailable"
  | "platform_failure_after_expiry_commit"
  | "platform_failure";

const NOTIFICATION_EXPIRY_TEST_IDENTIFIER =
  "notification-test:background-expiry";
const NOTIFICATION_EXPIRY_TEST_SESSION_ID = "notification-test";
const NOTIFICATION_EXPIRY_TEST_REVISION = 0;
const NOTIFICATION_EXPIRY_TEST_DELAY_MS = 5_000;

function notificationExpiryTestChannelId(
  preferences: RestAlertPreferences,
): string {
  if (preferences.soundEnabled) {
    return preferences.vibrationEnabled
      ? REST_NOTIFICATION_CHANNEL_IDS.soundVibration
      : REST_NOTIFICATION_CHANNEL_IDS.soundOnly;
  }
  return preferences.vibrationEnabled
    ? REST_NOTIFICATION_CHANNEL_IDS.vibrationOnly
    : REST_NOTIFICATION_CHANNEL_IDS.silent;
}

export type CommittedWorkoutMutationResult = ActiveWorkoutView & Readonly<{
  committedSetId: string;
}>;

export type CommittedWorkoutRemovalRefreshFailure = Readonly<{
  outcome: "committed_refresh_failed";
  sessionId: string;
  setId: string;
  sessionRevision: number;
}>;

export type CommittedExerciseEditRefreshFailure = Readonly<{
  outcome: "committed_refresh_failed";
  sessionId: string;
  sessionExerciseId: string;
  sessionRevision: number;
}>;

export type CommittedExerciseReorderRefreshFailure = Readonly<{
  outcome: "committed_refresh_failed";
  sessionId: string;
  sessionRevision: number;
}>;

export type RestAlertPreferenceSaveResult = Readonly<{
  status: "persisted" | "not_persisted" | "failed";
  preferences: RestAlertPreferences;
}>;

function sameRestAlertPreferences(
  left: RestAlertPreferences,
  right: RestAlertPreferences,
): boolean {
  return left.soundEnabled === right.soundEnabled
    && left.vibrationEnabled === right.vibrationEnabled;
}

type RuntimeValue = RuntimeState & Readonly<{
  collectPhase14SourceStateProof(): Promise<Phase14SourceStateProof>;
  connectAutomaticBackup(): Promise<void>;
  deferAutomaticRestore(): Promise<void>;
  cancelAutomaticBackupCheck(): Promise<void>;
  checkAutomaticBackupAgain(): Promise<void>;
  continueAutomaticRestore(): Promise<void>;
  reviewAutomaticRecovery(input: Readonly<{ candidate: AutomaticRecoveryCandidate }>): Promise<AutomaticRecoveryPreparation>;
  commitAutomaticRecovery(input: AutomaticRecoveryCommit): Promise<void>;
  cancelAutomaticRecovery(attemptId: string): Promise<void>;
  finishAutomaticBackupSetup(): Promise<void>;
  requestAutomaticBackupNow(): Promise<void>;
  retryAutomaticBackup(): Promise<void>;
  useAutomaticBackupCellularThisTime(): Promise<void>;
  dismissAutomaticBackupCellularConfirmation(): Promise<void>;
  setAutomaticBackupDataUsePolicy(policy: "wifi_and_cellular" | "wifi_only"): Promise<void>;
  takeOverAutomaticBackup(): Promise<void>;
  disconnectAutomaticBackup(): Promise<void>;
  deleteAutomaticCloudBackup(): Promise<void>;
  finishDeletingAutomaticCloudBackup(): Promise<void>;
  startNewAutomaticCloudBackup(): Promise<void>;
  actOnToday(action: ScheduleTodayAction): ReturnType<
    ReturnType<typeof createScheduleRuntimePort>["actOnToday"]
  >;
  activatePlan(): Promise<void>;
  addExercise(input: AddExerciseInput): Promise<AddExerciseResult>;
  addWarmup(input: AddWarmupInput): Promise<CommittedWorkoutMutationResult>;
  addWorkingSet(
    input: AddWorkingSetInput,
  ): Promise<CommittedWorkoutMutationResult>;
  completeSet(input: CompleteSetInput): ReturnType<typeof completeSet>;
  updateSessionExerciseDefaultRest(
    input: UpdateSessionExerciseDefaultRestInput,
  ): Promise<ActiveWorkoutView>;
  readWorkoutPreferences(planId: string): Promise<WorkoutPreference>;
  setWorkoutPreferences(input: WorkoutPreferenceWrite): Promise<WorkoutPreference>;
  completeWarmup(input: CompleteWarmupInput): Promise<ActiveWorkoutView>;
  createSecureBackup(input: Readonly<{
    password: string;
    signal?: AbortSignal;
  }>): Promise<RuntimeSecureBackupArchive>;
  createCsvExport(): Promise<CsvExportHandle>;
  discardSecureBackup(archive: BackupArchiveHandle): Promise<void>;
  discardCsvExport(handle: CsvExportHandle): Promise<void>;
  discardWorkout(input: DiscardWorkoutInput): Promise<FinishOutcomeResult>;
  finishCompleted(input: FinishCompletedInput): Promise<FinishOutcomeResult>;
  finishPartial(input: FinishPartialInput): Promise<FinishOutcomeResult>;
  previewCompletedWorkoutPlanWriteBack(
    sessionId: string,
  ): Promise<CompletedWorkoutPlanWriteBackState>;
  applyCompletedWorkoutPlanWriteBack(
    state: CompletedWorkoutPlanWriteBackChoiceState,
  ): Promise<CompletedWorkoutPlanWriteBackState>;
  keepCompletedWorkoutPlanAsIs(
    state: CompletedWorkoutPlanWriteBackChoiceState,
  ): CompletedWorkoutPlanWriteBackState;
  removeWarmup(
    input: RemoveWarmupInput,
  ): Promise<ActiveWorkoutView | CommittedWorkoutRemovalRefreshFailure>;
  removeWorkingSet(
    input: RemoveWorkingSetInput,
  ): Promise<ActiveWorkoutView | CommittedWorkoutRemovalRefreshFailure>;
  replaceExercise(
    input: ReplaceExerciseInput,
  ): Promise<ActiveWorkoutView | CommittedExerciseEditRefreshFailure>;
  removeExercise(
    input: RemoveExerciseInput,
  ): Promise<ActiveWorkoutView | CommittedExerciseEditRefreshFailure>;
  reorderExercises(
    input: ReorderExercisesInput,
  ): Promise<ActiveWorkoutView | CommittedExerciseReorderRefreshFailure>;
  reviseCompletedSet(
    input: ReviseCompletedSetInput,
  ): Promise<CommittedWorkoutMutationResult>;
  adjustRest(input: AdjustRestInput): Promise<RestCommandResult>;
  expireRest(input: RestRevisionInput): Promise<RestCommandResult>;
  exerciseNotificationExpiry(
    mode: NotificationExpiryExerciseMode,
  ): Promise<NotificationExpiryExerciseCode>;
  getActiveWorkout(sessionId: string): Promise<WorkoutSessionView>;
  getSessionDetail(sessionId: string): Promise<SessionDetail>;
  loadHistoryCorrectionSession(sessionId: string): Promise<HistoryCorrectionEditorState>;
  listAvailableCorrectionExercises(): Promise<readonly AvailableCorrectionExercise[]>;
  correctHistorySession(
    input: Omit<CorrectHistorySessionInput, "nowMs">,
  ): Promise<CorrectHistorySessionResult>;
  removeHistorySession(
    input: Omit<VoidHistorySessionInput, "nowMs">,
  ): Promise<HistoryLifecycleResult>;
  restoreHistorySession(
    input: Omit<RestoreHistorySessionInput, "nowMs">,
  ): Promise<HistoryLifecycleResult>;
  loadCalendarMonth(input: Readonly<{
    month: string;
    selectedDate: string;
    today: string;
  }>): Promise<CalendarMonth>;
  listRemovedHistorySessions(): Promise<readonly RemovedHistorySession[]>;
  loadExerciseMetricHistory(
    exerciseId: string,
  ): Promise<ExerciseMetricHistory>;
  loadProgress(input: Readonly<{
    period: ProgressPeriod;
    nowLocalDate: string;
  }>): Promise<Readonly<{
    period: ProgressPeriod;
    freshness: ProgressProjectionFreshness;
    projection: ProgressPeriodProjection | null;
    diagnostic?: ProgressProjectionDiagnostic;
  }>>;
  openRestNotificationSettings(): Promise<void>;
  readRestAlertPreferences(): RestAlertPreferences;
  setRestAlertPreferences(
    preferences: RestAlertPreferences,
  ): Promise<RestAlertPreferenceSaveResult>;
  requestRestNotificationPermission(): Promise<RestNotificationPermission>;
  pauseRest(input: RestRevisionInput): Promise<RestCommandResult>;
  refresh(): Promise<void>;
  resumeRest(input: RestRevisionInput): Promise<RestCommandResult>;
  resumePartialWorkout(
    input: ResumePartialWorkoutInput,
  ): Promise<Readonly<{
    sessionId: string;
    status: "in_progress";
    sessionRevision: number;
  }>>;
  recordExerciseEffort(input: Readonly<{
    sessionId: string;
    sessionExerciseId: string;
    expectedExerciseRevision: number;
    effort: ExerciseEffort;
    recordedAtMs: number;
  }>): Promise<Readonly<{
    sessionExerciseId: string;
    effort: ExerciseEffort;
    revision: number;
  }>>;
  acceptRecommendation(
    recommendationId: string,
  ): Promise<RecommendationDecisionResult>;
  keepCurrentTarget(
    recommendationId: string,
  ): Promise<RecommendationDecisionResult>;
  chooseTimeZone(
    choice: ScheduleTimeZoneChoice,
    detectedDeviceTimeZone?: string,
  ): ReturnType<ReturnType<typeof createScheduleRuntimePort>["chooseTimeZone"]>;
  completeScheduledSession(
    sessionId: string,
  ): ReturnType<
    ReturnType<typeof createScheduleRuntimePort>["completeScheduledSession"]
  >;
  consumeDateOverride(
    localDate: string,
  ): ReturnType<
    ReturnType<typeof createScheduleRuntimePort>["consumeDateOverride"]
  >;
  loadLibrary(): Promise<LibraryRuntimeSnapshot>;
  loadStarterPlan(templateId: string): Promise<AcceptedStarterTemplate | null>;
  loadStarterActivationPreview(
    templateId: string,
  ): Promise<StarterPlanRuntimeActivationPreview | null>;
  activateAcceptedStarterPlan(
    command: StarterPlanRuntimeActivationCommand,
  ): Promise<AcceptedStarterPlanActivation>;
  createStarterEditableCopy(templateId: string): Promise<string>;
  finishStarterSwitchWorkout(input: Readonly<{
    sessionId: string;
    sessionRevision: number;
  }>): Promise<void>;
  discardStarterSwitchWorkout(input: Readonly<{
    sessionId: string;
    sessionRevision: number;
  }>): Promise<void>;
  loadStarterTemplateUpdate(input: Readonly<{
    ownedPlanId: string;
    templateId: string;
  }>): Promise<StarterPlanTemplateUpdatePreview | null>;
  createStarterTemplateUpdateCopy(
    preview: StarterPlanTemplateUpdatePreview,
  ): Promise<string>;
  listLibraryRecentExercises(): Promise<readonly LibrarySearchItem[]>;
  searchLibraryExercises(input: Readonly<{
    query: string;
    filters?: SearchFilters;
    cursor?: string | null;
  }>): Promise<LibrarySearchResult>;
  setLibraryExerciseFavorite(
    exerciseId: string,
    favorite: boolean,
  ): Promise<Readonly<{
    exerciseId: string;
    favorite: boolean;
    preferenceRevision: number;
  }>>;
  createCustomExercise(
    input: Omit<CreateCustomExerciseInput, "createdAtMs">,
  ): ReturnType<typeof createCustomExerciseCommand>;
  editCustomExercise(
    input: Omit<EditCustomExerciseInput, "editedAtMs">,
  ): ReturnType<typeof editCustomExerciseCommand>;
  createCustomExerciseId(kind: string): string;
  loadCustomExercise(
    exerciseId: string,
  ): Promise<CustomExerciseRuntimeDetail | null>;
  setCustomExerciseFavorite(input: Readonly<{
    exerciseId: string;
    expectedPreferenceRevision: number | null;
    favorite: boolean;
  }>): Promise<CustomExerciseRuntimeDetail>;
  setCustomExerciseHidden(input: Readonly<{
    exerciseId: string;
    expectedPreferenceRevision: number | null;
    hidden: boolean;
  }>): Promise<CustomExerciseRuntimeDetail>;
  previewCustomExerciseArchive(
    exerciseId: string,
    expectedExerciseRevision: number,
  ): Promise<CustomExerciseArchivePreview>;
  setCustomExerciseArchived(input: Readonly<{
    exerciseId: string;
    expectedExerciseRevision: number;
    expectedPreferenceRevision: number | null;
    previewRevision: string;
    archived: boolean;
  }>): Promise<CustomExerciseRuntimeDetail>;
  loadCustomExerciseMigration(
    exerciseId: string,
  ): Promise<CustomExerciseRuntimeMigration | null>;
  migrateCustomExerciseMetricProfile(
    input: Omit<MigrateCustomExerciseMetricProfileInput, "migratedAtMs">,
  ): ReturnType<typeof migrateCustomExerciseMetricProfile>;
  setLibrarySection(
    section: LibraryRuntimeSection,
    expectedRevision: number,
  ): Promise<LibraryRuntimeSectionPreference>;
  createOwnedPlanDraft(input: Readonly<{
    name: string;
    dayName: string;
  }>): Promise<OwnedPlanRepositoryResult>;
  loadOwnedPlan(planId: string): Promise<OwnedPlanSnapshot | null>;
  listOwnedPlanExercises(): Promise<readonly OwnedPlanRuntimeExerciseOption[]>;
  saveOwnedPlan(input: Readonly<{
    expectedRevision: number;
    plan: OwnedPlanDraftInput;
  }>): Promise<OwnedPlanRepositoryResult>;
  duplicateOwnedPlan(input: Readonly<{
    sourcePlanId: string;
    expectedRevision: number;
    name: string;
  }>): Promise<OwnedPlanRepositoryResult>;
  archiveOwnedPlan(input: Readonly<{
    planId: string;
    expectedRevision: number;
  }>): Promise<OwnedPlanRepositoryResult>;
  restoreOwnedPlan(input: Readonly<{
    planId: string;
    expectedRevision: number;
  }>): Promise<OwnedPlanRepositoryResult>;
  createOwnedPlanId(kind: string): string;
  previewOwnedPlanDayRemoval(input: Readonly<{
    planId: string;
    dayId: string;
  }>): ReturnType<
    ReturnType<typeof createOwnedPlanRuntimePort>["previewDayRemoval"]
  >;
  removeOwnedPlanDayWithImpact(
    input: RemovePlanDayWithImpactInput,
  ): ReturnType<
    ReturnType<typeof createOwnedPlanRuntimePort>["removeDayWithImpact"]
  >;
  previewOwnedPlanExerciseReplacement(input: Readonly<{
    planId: string;
    occurrenceId: string;
  }>): ReturnType<
    ReturnType<typeof createOwnedPlanRuntimePort>[
      "previewExerciseReplacement"
    ]
  >;
  replaceOwnedPlanExercise(
    input: ReplacePlanExerciseInput,
  ): ReturnType<
    ReturnType<typeof createOwnedPlanRuntimePort>["replaceExercise"]
  >;
  loadSchedule(planId: string): Promise<ScheduleEditorSnapshot | null>;
  loadToday(
    instantMs: number,
  ): ReturnType<ReturnType<typeof createScheduleRuntimePort>["loadToday"]>;
  markWeekdayMissed(
    localDate: string,
  ): ReturnType<
    ReturnType<typeof createScheduleRuntimePort>["markWeekdayMissed"]
  >;
  recordTrainAnyway(input: Readonly<{
    workout:
      | Readonly<{ kind: "plan_day"; planDayId: string }>
      | Readonly<{ kind: "rest_day" | "empty"; planDayId: null }>;
    advanceRotation: boolean;
  }>): ReturnType<
    ReturnType<typeof createScheduleRuntimePort>["recordTrainAnyway"]
  >;
  saveSchedule(input: ScheduleSaveDraft): Promise<ScheduleEditorSnapshot>;
  setDateOverride(input: Readonly<{
    localDate: string;
    replacement: ScheduleOverrideSelection;
    confirmation?: "replace_pending_override";
  }>): ReturnType<
    ReturnType<typeof createScheduleRuntimePort>["setDateOverride"]
  >;
  saveZeroSetWorkout(input: SaveZeroSetInput): Promise<FinishOutcomeResult>;
  preflightSecureRestore(input: Readonly<{ password: string }>): Promise<RuntimeRestorePreflightResult>;
  preflightSecureMerge(input: Readonly<{ password: string }>): Promise<RuntimeMergePreflightResult>;
  commitSecureMerge(input: Readonly<{ token: string; confirmation: string }>): Promise<RuntimeRestoreCommitResult>;
  invalidateSecureMergePreflight(token: string): void;
  invalidateSecureRestorePreflight(token: string): void;
  commitSecureRestore(input: Readonly<{ token: string; confirmation: string }>): Promise<RuntimeRestoreCommitResult>;
  retryRestoreRebuild(): Promise<RuntimeRestoreCommitResult>;
  shareSecureBackup(archive: RuntimeSecureBackupArchive): Promise<void>;
  shareCsvExport(handle: CsvExportHandle): Promise<void>;
  skipExercise(input: SkipExerciseInput): Promise<Readonly<{
    sessionId: string;
    status: "in_progress";
    sessionRevision: number;
  }>>;
  retry(): void;
  skipWorkingSet(input: SkipWorkingSetInput): Promise<ActiveWorkoutView>;
  skipWarmup(input: SkipWarmupInput): Promise<ActiveWorkoutView>;
  skipRest(input: RestRevisionInput): Promise<RestCommandResult>;
  startManualRest(input: RestRevisionInput): Promise<RestCommandResult>;
  startEmptyWorkout(): Promise<string>;
  startPlanDay(
    dayId: string,
    mode: "scheduled" | "alternate" | "rest_day",
  ): Promise<string>;
  startSelectedStrengthOccurrence(
    occurrence: SelectedStrengthOccurrence,
  ): Promise<string>;
  undoCompletedSet(
    input: UndoCompletedSetInput,
  ): ReturnType<typeof undoCompletedSet>;
  updateActiveSetDraft(
    input: UpdateActiveSetDraftInput,
  ): Promise<ActiveWorkoutView>;
  updateWarmupDraft(
    input: UpdateWarmupDraftInput,
  ): Promise<ActiveWorkoutView>;
}>;

type LocalContext = Readonly<{
  localDate: string;
  timezone: string;
  weekday: number;
}>;

type RuntimeServices = Readonly<{
  automaticBackupRuntime?: AutomaticBackupRuntime;
  backupCommands: SecureBackupCommands;
  csvExportRepository: CsvExportRepository;
  csvFiles: CsvFilePort;
  restoreCommands: RestoreCommands;
  mergeCommands: SecureMergeCommands;
  reconcileRestore?: () => Promise<RestoreReconciliationResult>;
  customExerciseRepository: ReturnType<typeof createCustomExerciseRepository>;
  historyCommandRepository: ReturnType<typeof createHistoryCommandRepository>;
  historyRepository: ReturnType<typeof createHistoryRepository>;
  progressRepository: ReturnType<typeof createProgressRepository>;
  kernel: SqliteKernel;
  librarySearchRepository: ReturnType<typeof createLibrarySearchRepository>;
  lifecycle: ReturnType<typeof createWorkoutLifecycle>;
  notifications: RestNotificationPort;
  restAlertPreferenceStore: RestAlertPreferenceStore;
  ownedPlans: ReturnType<typeof createOwnedPlanRuntimePort>;
  schedules: ReturnType<typeof createScheduleRuntimePort>;
  repository: ReturnType<typeof createPlansWorkoutRepository>;
  restRepository: ReturnType<typeof createRestRepository>;
  outcomeRepository: ReturnType<typeof createWorkoutOutcomeRepository>;
  workoutRepository: ReturnType<typeof createWorkoutRepository>;
  workoutPreferenceRepository: ReturnType<typeof createWorkoutPreferenceRepository>;
}>;

type CustomExerciseReadServices = Pick<
  RuntimeServices,
  "customExerciseRepository" | "kernel"
>;

export type WorkoutAppRuntimeDependencies = Readonly<{
  openKernel(): Promise<SqliteKernel>;
  migrate(kernel: SqliteKernel): Promise<void>;
  activateInitialStarter(input: Readonly<{
    kernel: SqliteKernel;
    catalog: StarterPlanRuntimeCatalog;
    startLocalDate: string;
    timeZone: string;
    activatedAtMs: number;
  }>): Promise<void>;
  installLibrary?(kernel: SqliteKernel): Promise<ContentUpdateResult | undefined>;
  loadStarterPlans?(kernel: SqliteKernel): Promise<StarterPlanRuntimeCatalog>;
  createRepository(
    kernel: SqliteKernel,
  ): ReturnType<typeof createPlansWorkoutRepository>;
  createNotifications(): RestNotificationPort;
  createAutomaticBackupScheduler?(
    kernel: SqliteKernel,
  ): AutomaticBackupScheduler;
  createAutomaticBackupRuntime?(kernel: SqliteKernel): AutomaticBackupRuntime;
  restAlertPreferenceStore?: RestAlertPreferenceStore;
  createLifecycle(
    input: Parameters<typeof createWorkoutLifecycle>[0],
  ): ReturnType<typeof createWorkoutLifecycle>;
  createRestRepository(
    kernel: SqliteKernel,
  ): ReturnType<typeof createRestRepository>;
  createOutcomeRepository(
    kernel: SqliteKernel,
  ): ReturnType<typeof createWorkoutOutcomeRepository>;
  createWorkoutRepository(
    kernel: SqliteKernel,
  ): ReturnType<typeof createWorkoutRepository>;
  createWorkoutPreferenceRepository?(
    kernel: SqliteKernel,
  ): ReturnType<typeof createWorkoutPreferenceRepository>;
  createBackupCommands?(kernel: SqliteKernel): SecureBackupCommands;
  createCsvExportRepository?(kernel: SqliteKernel): CsvExportRepository;
  createCsvFiles?(): CsvFilePort;
  createRestoreCommands?(kernel: SqliteKernel): RestoreCommands;
  createMergeCommands?(kernel: SqliteKernel): SecureMergeCommands;
  reconcileRestore?(kernel: SqliteKernel): Promise<RestoreReconciliationResult>;
  createScheduleRuntime?(
    kernel: SqliteKernel,
    ownedPlans: ReturnType<typeof createOwnedPlanRuntimePort>,
  ): ScheduleRuntimeAdapter;
  now(): Date;
  nowMs(): number;
}>;

export type WorkoutAppRuntimeAdapters = Readonly<{
  openKernel(databaseName: string): Promise<SqliteKernel>;
  runMigrations(input: Readonly<{
    databaseName: string;
    kernel: SqliteKernel;
  }>): Promise<void>;
  activateInitialStarter(input: Readonly<{
    kernel: SqliteKernel;
    catalog: StarterPlanRuntimeCatalog;
    startLocalDate: string;
    timeZone: string;
    activatedAtMs: number;
  }>): Promise<void>;
  installLibrary?(kernel: SqliteKernel): Promise<ContentUpdateResult | undefined>;
  loadStarterPlans?(kernel: SqliteKernel): Promise<StarterPlanRuntimeCatalog>;
  createRepository(
    kernel: SqliteKernel,
  ): ReturnType<typeof createPlansWorkoutRepository>;
  createNotifications(): RestNotificationPort;
  createAutomaticBackupScheduler?(
    kernel: SqliteKernel,
  ): AutomaticBackupScheduler;
  createAutomaticBackupRuntime?(kernel: SqliteKernel): AutomaticBackupRuntime;
  restAlertPreferenceStore?: RestAlertPreferenceStore;
  createLifecycle(
    input: Parameters<typeof createWorkoutLifecycle>[0],
  ): ReturnType<typeof createWorkoutLifecycle>;
  createRestRepository(
    kernel: SqliteKernel,
  ): ReturnType<typeof createRestRepository>;
  createOutcomeRepository(
    kernel: SqliteKernel,
  ): ReturnType<typeof createWorkoutOutcomeRepository>;
  createWorkoutRepository(
    kernel: SqliteKernel,
  ): ReturnType<typeof createWorkoutRepository>;
  createBackupCommands?(kernel: SqliteKernel): SecureBackupCommands;
  createCsvExportRepository?(kernel: SqliteKernel): CsvExportRepository;
  createCsvFiles?(): CsvFilePort;
  createRestoreCommands?(kernel: SqliteKernel): RestoreCommands;
  createMergeCommands?(kernel: SqliteKernel): SecureMergeCommands;
  reconcileRestore?(kernel: SqliteKernel): Promise<RestoreReconciliationResult>;
  createScheduleRuntime?(
    kernel: SqliteKernel,
    ownedPlans: ReturnType<typeof createOwnedPlanRuntimePort>,
  ): ScheduleRuntimeAdapter;
  now(): Date;
  nowMs(): number;
}>;

const initialState: RuntimeState = {
  launchState: "booting",
  planDays: [],
  latestBackup: null,
  automaticBackup: projectAutomaticBackupPresentation({ status: "not_connected", mutationGeneration: 0, backedUpGeneration: 0, nowMs: 0 }),
  notificationPermission: "undetermined",
  workoutRefreshGeneration: 0,
};

export async function acknowledgeCommittedRuntimeResult<Result, Snapshot>({
  result,
  refresh,
  onRefreshed,
  onRefreshFailed,
}: Readonly<{
  result: Result;
  refresh(): Promise<Snapshot>;
  onRefreshed(snapshot: Snapshot): void;
  onRefreshFailed(): void;
}>): Promise<Result> {
  try {
    onRefreshed(await refresh());
  } catch {
    onRefreshFailed();
  }
  return result;
}

export function mapWorkoutMutationFailure(error: unknown): AppError {
  if (error instanceof WorkoutCommandConflictError) {
    return {
      kind: "conflict",
      code: error.code,
      retryable: false,
      correlationCode: "GT-ACTION01",
    };
  }
  if (error instanceof TypeError) {
    return {
      kind: "validation",
      code: "workout_mutation_invalid",
      retryable: false,
      correlationCode: "GT-ACTION01",
    };
  }
  return {
    kind: "storage",
    code: "workout_mutation_failed",
    retryable: true,
    correlationCode: "GT-ACTION01",
  };
}

const WorkoutAppRuntimeContext = createContext<RuntimeValue | null>(null);

export function createWorkoutAppRuntimeDependencies(
  adapters: WorkoutAppRuntimeAdapters,
): WorkoutAppRuntimeDependencies {
  return {
    openKernel: () => adapters.openKernel(DATABASE_NAME),
    migrate: (kernel) => adapters.runMigrations({
      databaseName: DATABASE_NAME,
      kernel,
    }),
    activateInitialStarter: adapters.activateInitialStarter,
    ...(adapters.installLibrary === undefined
      ? {}
      : { installLibrary: adapters.installLibrary }),
    ...(adapters.loadStarterPlans === undefined
      ? {}
      : { loadStarterPlans: adapters.loadStarterPlans }),
    createRepository: adapters.createRepository,
    createNotifications: adapters.createNotifications,
    ...(adapters.createAutomaticBackupScheduler === undefined
      ? {}
      : { createAutomaticBackupScheduler: adapters.createAutomaticBackupScheduler }),
    ...(adapters.createAutomaticBackupRuntime === undefined
      ? {}
      : { createAutomaticBackupRuntime: adapters.createAutomaticBackupRuntime }),
    ...(adapters.restAlertPreferenceStore === undefined
      ? {}
      : { restAlertPreferenceStore: adapters.restAlertPreferenceStore }),
    createLifecycle: adapters.createLifecycle,
    createRestRepository: adapters.createRestRepository,
    createOutcomeRepository: adapters.createOutcomeRepository,
    createWorkoutRepository: adapters.createWorkoutRepository,
    ...(adapters.createBackupCommands === undefined
      ? {}
      : { createBackupCommands: adapters.createBackupCommands }),
    ...(adapters.createCsvExportRepository === undefined
      ? {}
      : { createCsvExportRepository: adapters.createCsvExportRepository }),
    ...(adapters.createCsvFiles === undefined
      ? {}
      : { createCsvFiles: adapters.createCsvFiles }),
    ...(adapters.createRestoreCommands === undefined
      ? {}
      : { createRestoreCommands: adapters.createRestoreCommands }),
    ...(adapters.createMergeCommands === undefined
      ? {}
      : { createMergeCommands: adapters.createMergeCommands }),
    ...(adapters.reconcileRestore === undefined
      ? {}
      : { reconcileRestore: adapters.reconcileRestore }),
    ...(adapters.createScheduleRuntime === undefined
      ? {}
      : { createScheduleRuntime: adapters.createScheduleRuntime }),
    now: adapters.now,
    nowMs: adapters.nowMs,
  };
}

export async function activateInitialAcceptedStarter(
  input: Readonly<{
    kernel: SqliteKernel;
    catalog: StarterPlanRuntimeCatalog;
    startLocalDate: string;
    timeZone: string;
    activatedAtMs: number;
  }>,
  activate: (
    command: AcceptedActivateStarterPlanInput,
  ) => Promise<AcceptedStarterPlanActivation> = activateStarterPlan,
): Promise<void> {
  const template = findStarterPlan(input.catalog, "full-body-foundation");
  if (template === null) {
    throw new Error("starter_template_not_found");
  }
  const {
    CryptoDigestAlgorithm,
    digestStringAsync,
  } = require("expo-crypto") as typeof import("expo-crypto");
  const schedule = suggestedTemplateSchedule(template);
  const copyChoice = null;
  const confirmationToken = createStarterPlanActivationConfirmationToken({
    assetSha256: input.catalog.pack.assetSha256,
    templateId: template.id,
    templateRevision: template.revision,
    startLocalDate: input.startLocalDate,
    timeZone: input.timeZone,
    ...schedule,
    copyChoice,
  });
  await activate({
    kind: "accepted",
    starterPackBytes: `${JSON.stringify(starterPlansAsset, null, 2)}
`,
    acceptanceBytes: `${JSON.stringify(starterPlansAcceptanceAsset, null, 2)}
`,
    sha256: digestStringAsync.bind(
      undefined,
      CryptoDigestAlgorithm.SHA256,
    ),
    repository: createStarterPlanRepository(input.kernel),
    requestId: `starter-today:${template.id}:${input.activatedAtMs}`,
    activatedAtMs: input.activatedAtMs,
    expectedActiveScheduleRevision: null,
    confirmationToken,
    templateId: template.id,
    templateRevision: template.revision,
    copyChoice,
    startLocalDate: input.startLocalDate,
    timeZone: input.timeZone,
    ...schedule,
  });
}

function phase11NativeFixtureFilesEnabled(): boolean {
  const {
    default: Constants,
  } = require("expo-constants") as typeof import("expo-constants");
  return Constants.expoConfig?.extra?.buildProfile === "development-test"
    && Constants.expoConfig.extra.nativeContractsEnabled === true
    && process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE === "phase11";
}

function phase14NativeRecoveryFixtureEnabled(): boolean {
  const {
    default: Constants,
  } = require("expo-constants") as typeof import("expo-constants");
  return phase14RecoveryFixtureFromNativeContract({
    nativeContractsEnabled: Constants.expoConfig?.extra?.nativeContractsEnabled === true,
    buildProfile: Constants.expoConfig?.extra?.buildProfile,
    suite: Constants.expoConfig?.extra?.nativeContractSuite,
  }) !== null;
}

function phase12NativeFixtureViewModel(): AutomaticBackupViewModel | null {
  const { default: Constants } = require("expo-constants") as typeof import("expo-constants");
  const fixture = phase12BackupFixtureFromNativeContract({
    nativeContractsEnabled: Constants.expoConfig?.extra?.nativeContractsEnabled === true,
    buildProfile: Constants.expoConfig?.extra?.buildProfile,
    suite: process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE,
    fixture: process.env.EXPO_PUBLIC_PHASE12_STAGE ?? process.env.PHASE12_STAGE,
  });
  return fixture === null ? null : phase12BackupFixtureViewModel(fixture);
}

export const productionWorkoutAppRuntimeDependencies =
  createWorkoutAppRuntimeDependencies({
    openKernel: openSqliteKernel,
    runMigrations: async ({ databaseName, kernel }) => {
      const recoveryOpenOptions = {
        useNewConnection: true,
        finalizeUnusedStatementsBeforeClosing: false,
      } as const;
      const recoveryBackup = createExpoRecoveryBackupPort({
        openSource(sourceName) {
          const {
            openDatabaseAsync,
          } = require("expo-sqlite") as typeof import("expo-sqlite");
          return openDatabaseAsync(sourceName, recoveryOpenOptions);
        },
        openDestination(destinationName) {
          const {
            openDatabaseAsync,
          } = require("expo-sqlite") as typeof import("expo-sqlite");
          return openDatabaseAsync(destinationName, recoveryOpenOptions);
        },
        backup({ sourceDatabase, destDatabase }) {
          const {
            backupDatabaseAsync,
          } = require("expo-sqlite") as typeof import("expo-sqlite");
          return backupDatabaseAsync({
            sourceDatabase: sourceDatabase as Parameters<
              typeof backupDatabaseAsync
            >[0]["sourceDatabase"],
            destDatabase: destDatabase as Parameters<
              typeof backupDatabaseAsync
            >[0]["destDatabase"],
          });
        },
        close(database) {
          return (
            database as Awaited<
              ReturnType<typeof import("expo-sqlite")["openDatabaseAsync"]>
            >
          ).closeAsync();
        },
        validate: openSqliteKernel,
        remove(backupName) {
          const {
            deleteDatabaseAsync,
          } = require("expo-sqlite") as typeof import("expo-sqlite");
          return deleteDatabaseAsync(backupName);
        },
        async writeManifest(manifest) {
          const {
            Directory,
            File,
            Paths,
          } = require("expo-file-system") as typeof import("expo-file-system");
          const directory = new Directory(
            Paths.document,
            "migration-recovery",
          );
          directory.create({ idempotent: true, intermediates: true });
          const file = new File(directory, `${manifest.backupId}.json`);
          if (file.exists) {
            file.delete();
          }
          file.create({ intermediates: true, overwrite: true });
          file.write(JSON.stringify(manifest));
        },
      });
      await createMigrationRunner({
        databaseName,
        kernel,
        migrations,
        recoveryBackup,
      }).run();
      await createEffectStore(kernel).resetExpiredClaims(Date.now());
    },
    installLibrary: async (kernel) => {
      const {
        CryptoDigestAlgorithm,
        digestStringAsync,
      } = require("expo-crypto") as typeof import("expo-crypto");
      const prettyBytes = (value: unknown) =>
        `${JSON.stringify(value, null, 2)}
`;
      const catalog = await parseExerciseCatalog({
        catalogBytes: prettyBytes(exerciseCatalogAsset),
        manifestBytes: prettyBytes(exerciseCatalogManifestAsset),
        acceptanceBytes: prettyBytes(exerciseCatalogAcceptanceAsset),
        sha256: (value) =>
          digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
      });
      const result = await createContentRepository(kernel)
        .importAcceptedCatalog({ catalog });
      return result.invalidationScopes.length === 0 ? undefined : result;
    },
    loadStarterPlans: async (kernel) => {
      const {
        CryptoDigestAlgorithm,
        digestStringAsync,
      } = require("expo-crypto") as typeof import("expo-crypto");
      const catalog = await createStarterPlanRuntimeCatalog({
        starterPackBytes: `${JSON.stringify(starterPlansAsset, null, 2)}
`,
        acceptanceBytes: `${JSON.stringify(starterPlansAcceptanceAsset, null, 2)}
`,
        sha256: (value) =>
          digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
      });
      await installAcceptedStarterPlanSources(kernel, catalog.pack);
      return catalog;
    },
    activateInitialStarter: activateInitialAcceptedStarter,
    createBackupCommands: (kernel) => createBackupCommands({
      collector: createLogicalBackupRepository(kernel),
      crypto: createAesGcmArchivePort(createExpoAesGcmArchiveDriver()),
      files: createProductionExpoBackupFilePort(),
      kdf: createPasswordKdfPort(),
      nowMs: () => Date.now(),
      randomBytes(length) {
        const {
          getRandomBytes,
        } = require("expo-crypto") as typeof import("expo-crypto");
        return getRandomBytes(length);
      },
      snapshotId: () => {
        const {
          randomUUID,
        } = require("expo-crypto") as typeof import("expo-crypto");
        return `backup-${randomUUID()}`;
      },
    }),
    createCsvExportRepository,
    createCsvFiles: createProductionExpoCsvFilePort,
    createRestoreCommands: (kernel) => {
      const files = phase14NativeRecoveryFixtureEnabled()
        ? createPhase14RecoveryFixtureRestoreFilePort()
        : phase11NativeFixtureFilesEnabled()
        ? createPhase11FixtureRestoreFilePort()
        : createProductionExpoRestoreFilePort();
      return createRestoreCommands({
        crypto: createAesGcmArchivePort(createExpoAesGcmArchiveDriver()),
        files,
        kdf: createPasswordKdfPort(),
        schema: createSqliteRestoreSchemaPort(kernel),
        retainedReferences: createSqliteRestoreRetainedReferencePort(kernel),
        referenceAvailability: createSqliteRestoreCatalogReferenceAvailabilityPort(kernel),
        candidateProbe: createSqliteRestoreCandidateProbe(),
        restorer: createLogicalRestoreRepository(kernel, { nowMs: () => Date.now() }),
        store: createRestorePreflightStore({
          tokenFactory() {
            const { randomUUID } = require("expo-crypto") as typeof import("expo-crypto");
            return randomUUID();
          },
        }),
      });
    },
    createMergeCommands: (kernel) => {
      const files = phase11NativeFixtureFilesEnabled()
        ? createPhase11FixtureRestoreFilePort({
            selectorFile: PHASE11_MERGE_FIXTURE_SELECTOR_FILE,
          })
        : createProductionExpoRestoreFilePort();
      return createMergeCommands({
        crypto: createAesGcmArchivePort(createExpoAesGcmArchiveDriver()),
        files,
        kdf: createPasswordKdfPort(),
        schema: createSqliteRestoreSchemaPort(kernel),
        retainedReferences: createSqliteRestoreRetainedReferencePort(kernel),
        candidateProbe: createSqliteRestoreCandidateProbe(),
        local: createSqliteMergeLocalFactsPort(kernel),
        sha256: async (value) => {
          const {
            CryptoDigestAlgorithm,
            digestStringAsync,
          } = require("expo-crypto") as typeof import("expo-crypto");
          return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
        },
        store: createMergePreflightStore({
          tokenFactory() {
            const { randomUUID } = require("expo-crypto") as typeof import("expo-crypto");
            return randomUUID();
          },
        }),
        writer: createFullPlanLogicalMergeWriter(kernel, {
          nowMs: () => Date.now(),
          sha256: async (value) => {
            const {
              CryptoDigestAlgorithm,
              digestStringAsync,
            } = require("expo-crypto") as typeof import("expo-crypto");
            return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
          },
        }),
      });
    },
    reconcileRestore: (kernel) => createRestoreReconciliationRepository(kernel, {
      history: createHistoryProjectionRepository(kernel),
      nowMs: () => Date.now(),
      search: createExerciseSearchIndexRepository(kernel),
    }).reconcileAndRebuild(),
    createRepository: createPlansWorkoutRepository,
    createNotifications: createExpoRestNotificationAdapter,
    createAutomaticBackupScheduler: (kernel) => createProductionAutomaticBackupServices(kernel).scheduler,
    createAutomaticBackupRuntime: (kernel) => createProductionAutomaticBackupServices(kernel).runtime,
    createLifecycle: createWorkoutLifecycle,
    createRestRepository,
    createOutcomeRepository: createWorkoutOutcomeRepository,
    createWorkoutRepository,
    createScheduleRuntime: (kernel, ownedPlans) =>
      createScheduleRuntimePort(kernel, ownedPlans, {
        now: () => new Date(),
        nowMs: () => Date.now(),
        randomUUID: () => {
          const {
            randomUUID,
          } = require("expo-crypto") as typeof import("expo-crypto");
          return randomUUID();
        },
        sha256: (value) => {
          const {
            CryptoDigestAlgorithm,
            digestStringAsync,
          } = require("expo-crypto") as typeof import("expo-crypto");
          return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
        },
      }),
    now: () => new Date(),
    nowMs: () => Date.now(),
  });

function localContext(now: Date): LocalContext {
  const localDate = [
    now.getFullYear().toString().padStart(4, "0"),
    (now.getMonth() + 1).toString().padStart(2, "0"),
    now.getDate().toString().padStart(2, "0"),
  ].join("-");
  const weekday = now.getDay() === 0 ? 7 : now.getDay();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { localDate, timezone, weekday };
}

function failedState(
  category: LaunchFailure["category"],
  code: string,
  correlationCode: string,
): RuntimeState {
  return {
    launchState: "failed",
    planDays: [],
    latestBackup: null,
    automaticBackup: projectAutomaticBackupPresentation({ status: "not_connected", mutationGeneration: 0, backedUpGeneration: 0, nowMs: 0 }),
    notificationPermission: "undetermined",
    workoutRefreshGeneration: 0,
    failure: {
      category,
      code,
      correlationCode,
      retryable: true,
    },
  };
}

function parseLibrarySectionPreference(
  row: LibrarySectionSettingRow | undefined,
): LibraryRuntimeSectionPreference {
  if (row === undefined) {
    return { section: "plans", revision: 0 };
  }
  if (row.value_version !== 1 || !Number.isSafeInteger(row.revision)) {
    throw new Error("library_section_preference_invalid");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value_json);
  } catch {
    throw new Error("library_section_preference_invalid");
  }
  if (
    typeof parsed !== "object"
    || parsed === null
    || Array.isArray(parsed)
    || Object.keys(parsed).length !== 1
  ) {
    throw new Error("library_section_preference_invalid");
  }
  const section = (parsed as { section?: unknown }).section;
  if (section !== "plans" && section !== "exercises") {
    throw new Error("library_section_preference_invalid");
  }
  return { section, revision: row.revision };
}

type BackupMetadataSettingRow = Readonly<{
  value_version: number;
  value_json: string;
}>;

function validBackupMetadata(
  value: unknown,
): value is RuntimeBackupMetadata {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value).length === 3
    && typeof (value as RuntimeBackupMetadata).archiveId === "string"
    && /^[a-z0-9][a-z0-9_-]{0,119}$/u.test((value as RuntimeBackupMetadata).archiveId)
    && Number.isSafeInteger((value as RuntimeBackupMetadata).createdAtMs)
    && (value as RuntimeBackupMetadata).createdAtMs >= 0
    && typeof (value as RuntimeBackupMetadata).displayName === "string"
    && (value as RuntimeBackupMetadata).displayName.trim().length > 0
    && !/[\\/]/u.test((value as RuntimeBackupMetadata).displayName);
}

function parseBackupMetadata(
  row: BackupMetadataSettingRow | undefined,
): RuntimeBackupMetadata | null {
  if (row === undefined) return null;
  if (row.value_version !== 1) return null;
  try {
    const parsed: unknown = JSON.parse(row.value_json);
    return validBackupMetadata(parsed) ? Object.freeze(parsed) : null;
  } catch {
    return null;
  }
}

async function readLatestBackupMetadata(
  kernel: SqliteKernel,
): Promise<RuntimeBackupMetadata | null> {
  try {
    const [row] = await kernel.queryAll<BackupMetadataSettingRow>(
      `SELECT value_version, value_json
       FROM app_settings
       WHERE key = ?`,
      [LATEST_BACKUP_METADATA_SETTING_KEY],
    );
    return parseBackupMetadata(row);
  } catch {
    return null;
  }
}

async function writeLatestBackupMetadata(
  kernel: SqliteKernel,
  metadata: RuntimeBackupMetadata,
  nowMs: number,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO app_settings
        (key, value_version, value_json, revision, updated_at_ms)
       VALUES (?, 1, ?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
        value_version = excluded.value_version,
        value_json = excluded.value_json,
        revision = app_settings.revision + 1,
        updated_at_ms = excluded.updated_at_ms`,
      [
        LATEST_BACKUP_METADATA_SETTING_KEY,
        JSON.stringify(metadata),
        nowMs,
      ],
    );
  });
}

async function readLibrarySectionPreference(
  kernel: SqliteKernel,
): Promise<LibraryRuntimeSectionPreference> {
  const [row] = await kernel.queryAll<LibrarySectionSettingRow>(
    `SELECT value_version, value_json, revision
     FROM app_settings
     WHERE key = ?`,
    [LIBRARY_SECTION_SETTING_KEY],
  );
  return parseLibrarySectionPreference(row);
}

export type LibrarySectionPreferencePort = Readonly<{
  read(): Promise<LibraryRuntimeSectionPreference>;
  write(
    section: LibraryRuntimeSection,
    expectedRevision: number,
  ): Promise<LibraryRuntimeSectionPreference>;
}>;

export function createLibrarySectionPreferencePort(
  kernel: SqliteKernel,
  nowMs: () => number,
): LibrarySectionPreferencePort {
  return Object.freeze({
    read: () => readLibrarySectionPreference(kernel),
    async write(section, expectedRevision) {
      if (
        (section !== "plans" && section !== "exercises")
        || !Number.isSafeInteger(expectedRevision)
        || expectedRevision < 0
      ) {
        throw new Error("library_section_preference_invalid");
      }
      return kernel.write(async (transaction) => {
        const [row] = await transaction.queryAll<LibrarySectionSettingRow>(
          `SELECT value_version, value_json, revision
           FROM app_settings
           WHERE key = ?`,
          [LIBRARY_SECTION_SETTING_KEY],
        );
        const current = parseLibrarySectionPreference(row);
        if (current.section === section) {
          return current;
        }
        if (current.revision !== expectedRevision) {
          throw new Error("library_section_preference_conflict");
        }
        const next: LibraryRuntimeSectionPreference = {
          section,
          revision: current.revision + 1,
        };
        if (row === undefined) {
          await transaction.execute(
            `INSERT INTO app_settings
              (key, value_version, value_json, revision, updated_at_ms)
             VALUES (?, 1, ?, ?, ?)`,
            [
              LIBRARY_SECTION_SETTING_KEY,
              JSON.stringify({ section }),
              next.revision,
              nowMs(),
            ],
          );
        } else {
          const result = await transaction.execute(
            `UPDATE app_settings
             SET value_json = ?, revision = ?, updated_at_ms = ?
             WHERE key = ? AND revision = ?`,
            [
              JSON.stringify({ section }),
              next.revision,
              nowMs(),
              LIBRARY_SECTION_SETTING_KEY,
              expectedRevision,
            ],
          );
          if (result.changes !== 1) {
            throw new Error("library_section_preference_conflict");
          }
        }
        return Object.freeze(next);
      });
    },
  });
}

function libraryPlanStatus(
  row: LibraryPlanRow,
): LibraryRuntimePlanSummary["status"] {
  if (row.is_active === 1 || row.schedule_lifecycle === "active") {
    return "Active";
  }
  if (row.lifecycle === "archived") {
    return "Archived";
  }
  if (row.lifecycle === "draft") {
    return "Draft";
  }
  return "Inactive";
}

async function readLibraryPlans(
  kernel: SqliteKernel,
  starterPlans: readonly LibraryRuntimeStarterPlanSummary[],
  templates: readonly AcceptedStarterTemplate[],
): Promise<LibraryRuntimeSnapshot["plans"]> {
  const rows = await kernel.queryAll<LibraryPlanRow>(
    `SELECT plan.id,
            plan.name,
            plan.days_per_week,
            plan.is_active,
            state.lifecycle,
            state.missing_requirement,
            schedule.lifecycle AS schedule_lifecycle,
            legacy_schedule.id AS legacy_schedule_id,
            plan.source_namespace,
            plan.upstream_id,
            source.source_revision
     FROM plans plan
     LEFT JOIN owned_plan_aggregate_states state ON state.plan_id = plan.id
     LEFT JOIN owned_plan_schedules schedule ON schedule.plan_id = plan.id
     LEFT JOIN plan_schedules legacy_schedule
       ON legacy_schedule.plan_id = plan.id
     LEFT JOIN owned_plan_starter_sources source ON source.plan_id = plan.id
     WHERE plan.origin IN ('custom', 'copied')
     ORDER BY plan.name COLLATE NOCASE, plan.id`,
  );
  const summaries = rows.map((row) => {
    const template = templates.find(({ id }) => id === row.upstream_id);
    const sourceRevision = row.source_revision
      ?? (row.source_namespace === "gym-tracker.original" ? 1 : null);
    return Object.freeze({
      id: row.id,
      name: row.name,
      daysPerWeek: row.days_per_week,
      status: libraryPlanStatus(row)!,
      scheduleSummary: row.schedule_lifecycle === "active"
        ? "Active schedule"
        : row.schedule_lifecycle === "inactive"
          ? "Inactive schedule"
          : row.legacy_schedule_id !== null
            ? row.is_active === 1
              ? "Active Weekday schedule"
              : "Inactive Weekday schedule"
          : "Not scheduled",
      missingRequirement: row.missing_requirement,
      ...(template !== undefined
          && sourceRevision !== null
          && sourceRevision < template.revision
        ? { templateUpdateTemplateId: template.id }
        : {}),
    });
  });
  return Object.freeze({
    active: summaries.find(({ status }) => status === "Active") ?? null,
    owned: Object.freeze(summaries),
    starters: starterPlans,
  });
}

async function readLibraryFilterOptions(
  kernel: SqliteKernel,
): Promise<LibraryRuntimeSnapshot["exerciseFilterOptions"]> {
  const rows = await kernel.queryAll<LibraryTaxonomyRow>(
    `SELECT kind, slug
     FROM taxonomy_terms
     WHERE kind IN ('exercise_type', 'muscle', 'equipment')
     ORDER BY kind, display_name COLLATE NOCASE, slug`,
  );
  return Object.freeze({
    exerciseTypes: Object.freeze(rows
      .filter(({ kind }) => kind === "exercise_type")
      .map(({ slug }) => slug)),
    muscles: Object.freeze(rows
      .filter(({ kind }) => kind === "muscle")
      .map(({ slug }) => slug)),
    equipment: Object.freeze(rows
      .filter(({ kind }) => kind === "equipment")
      .map(({ slug }) => slug)),
  });
}

async function starterScheduleSummary(
  kernel: SqliteKernel,
  row: StarterCopyRow,
): Promise<string> {
  const bindings = await kernel.queryAll<StarterBindingSummaryRow>(
    `SELECT binding.ordinal,
            binding.weekday,
            day.name AS day_name
     FROM owned_plan_schedule_bindings binding
     JOIN plan_days day ON day.id = binding.plan_day_id
     WHERE binding.schedule_version_id = ?
     ORDER BY binding.ordinal`,
    [row.schedule_version_id],
  );
  const mode = row.schedule_mode === "weekday" ? "Weekday" : "Rotation";
  return `${mode} · ${bindings.map((binding) =>
    row.schedule_mode === "weekday"
      ? `${binding.weekday} ${binding.day_name}`
      : binding.day_name
  ).join(", ")}`;
}

async function readStarterActivationPreview(
  kernel: SqliteKernel,
  catalog: StarterPlanRuntimeCatalog,
  templateId: string,
  startLocalDate: string,
  timeZone: string,
): Promise<StarterPlanRuntimeActivationPreview | null> {
  const template = findStarterPlan(catalog, templateId);
  if (template === null) {
    return null;
  }
  const [activeSchedules, copyRows, activeWorkouts] = await Promise.all([
    kernel.queryAll<ActiveStarterScheduleRow>(
      `SELECT revision
       FROM owned_plan_schedules
       WHERE lifecycle = 'active' AND plan_kind = 'strength'
       ORDER BY id`,
    ),
    kernel.queryAll<StarterCopyRow>(
      `SELECT plan.id AS plan_id,
              plan.name AS plan_name,
              plan.revision AS plan_revision,
              schedule.lifecycle AS schedule_lifecycle,
              schedule.revision AS schedule_revision,
              version.id AS schedule_version_id,
              version.mode AS schedule_mode
       FROM owned_plan_starter_sources source
       JOIN plans plan ON plan.id = source.plan_id
       JOIN owned_plan_schedules schedule ON schedule.plan_id = plan.id
       JOIN owned_plan_schedule_versions version
         ON version.schedule_id = schedule.id
        AND version.version_number = (
          SELECT MAX(candidate.version_number)
          FROM owned_plan_schedule_versions candidate
          WHERE candidate.schedule_id = schedule.id
        )
       WHERE source.source_namespace = ?
         AND source.template_id = ?
         AND source.source_revision = ?
       ORDER BY plan.name COLLATE NOCASE, plan.id`,
      [catalog.pack.namespace, template.id, template.revision],
    ),
    kernel.queryAll<ActiveStarterWorkoutRow>(
      `SELECT id, revision
       FROM workout_sessions
       WHERE status = 'in_progress'
       ORDER BY started_at_ms, id`,
    ),
  ]);
  if (activeSchedules.length > 1 || activeWorkouts.length > 1) {
    throw new Error("starter_activation_preview_state_invalid");
  }
  const copies = await Promise.all(copyRows.map(async (row) => Object.freeze({
    planId: row.plan_id,
    name: row.plan_name,
    state: row.schedule_lifecycle === "active"
      ? "Active" as const
      : "Inactive" as const,
    scheduleSummary: await starterScheduleSummary(kernel, row),
    planRevision: row.plan_revision,
    scheduleRevision: row.schedule_revision,
  })));
  const activeWorkout = activeWorkouts[0];
  return Object.freeze({
    template,
    startLocalDate,
    timeZone,
    activeScheduleRevision: activeSchedules[0]?.revision ?? null,
    copies: Object.freeze(copies),
    activeWorkout: activeWorkout === undefined
      ? null
      : Object.freeze({
          sessionId: activeWorkout.id,
          sessionRevision: activeWorkout.revision,
        }),
  });
}

function suggestedTemplateSchedule(
  template: AcceptedStarterTemplate,
):
  | Readonly<{
      mode: "weekday";
      bindings: readonly InitialWeekdayScheduleBinding[];
    }>
  | Readonly<{
      mode: "rotation";
      bindings: readonly InitialRotationScheduleBinding[];
    }> {
  if (template.scheduleSuggestion.mode === "weekday") {
    return {
      mode: "weekday",
      bindings: Object.freeze(
        template.scheduleSuggestion.cycleWeeks.flatMap(
          (week, weekIndex) => week.map((binding, ordinal) => ({
            planDaySourceId: binding.dayId,
            ordinal: weekIndex * week.length + ordinal,
            weekIndex,
            weekday: binding.weekday,
          })),
        ),
      ),
    };
  }
  return {
    mode: "rotation",
    bindings: Object.freeze(template.scheduleSuggestion.rotation.map(
      (planDaySourceId, ordinal) => ({ planDaySourceId, ordinal }),
    )),
  };
}

async function readStarterTemplateUpdate(
  kernel: SqliteKernel,
  catalog: StarterPlanRuntimeCatalog,
  input: Readonly<{
    ownedPlanId: string;
    templateId: string;
  }>,
): Promise<StarterPlanTemplateUpdatePreview | null> {
  const template = findStarterPlan(catalog, input.templateId);
  if (template === null) {
    return null;
  }
  const [row] = await kernel.queryAll<TemplateUpdateSourceRow>(
    `SELECT plan.name AS owned_plan_name,
            plan.revision AS owned_plan_revision,
            source.source_revision,
            accepted.template_json,
            active.revision AS active_schedule_revision
     FROM owned_plan_starter_sources source
     JOIN plans plan ON plan.id = source.plan_id
     JOIN starter_plan_sources accepted
       ON accepted.source_namespace = source.source_namespace
      AND accepted.template_id = source.template_id
      AND accepted.source_revision = source.source_revision
     LEFT JOIN owned_plan_schedules active
       ON active.lifecycle = 'active'
     WHERE source.plan_id = ?
       AND source.template_id = ?`,
    [input.ownedPlanId, input.templateId],
  );
  if (row !== undefined) {
    return row.source_revision >= template.revision
      ? null
      : createStarterTemplateUpdatePreview({
          ownedPlanId: input.ownedPlanId,
          ownedPlanName: row.owned_plan_name,
          ownedPlanRevision: row.owned_plan_revision,
          activeScheduleRevision: row.active_schedule_revision,
          previousSourceJson: row.template_json,
          template,
        });
  }
  if (input.templateId !== "full-body-foundation") {
    return null;
  }
  const [legacy] = await kernel.queryAll<{
    owned_plan_name: string;
    owned_plan_revision: number;
    active_schedule_revision: number | null;
  }>(
    `SELECT plan.name AS owned_plan_name,
            plan.revision AS owned_plan_revision,
            active.revision AS active_schedule_revision
     FROM plans plan
     LEFT JOIN owned_plan_schedules active
       ON active.lifecycle = 'active'
     WHERE plan.id = ?
       AND plan.origin = 'copied'
       AND plan.source_namespace = 'gym-tracker.original'
       AND plan.upstream_id = 'full-body-foundation'`,
    [input.ownedPlanId],
  );
  if (legacy === undefined) {
    return null;
  }
  return createStarterTemplateUpdatePreview({
    ownedPlanId: input.ownedPlanId,
    ownedPlanName: legacy.owned_plan_name,
    ownedPlanRevision: legacy.owned_plan_revision,
    activeScheduleRevision: legacy.active_schedule_revision,
    previousSourceJson: legacyFullBodySourceJson(
      fullBodyFoundationAsset,
      template,
    ),
    template,
  });
}

export function WorkoutAppRuntimeProvider({
  children,
  dependencies,
}: Readonly<{
  children: React.ReactNode;
  dependencies: WorkoutAppRuntimeDependencies;
}>) {
  const servicesRef = useRef<RuntimeServices | null>(null);
  const foregroundUnsubscribeRef = useRef<(() => void) | null>(null);
  const automaticBackupForegroundUnsubscribeRef = useRef<(() => void) | null>(null);
  const automaticBackupUnsubscribeRef = useRef<(() => void) | null>(null);
  const generationRef = useRef(0);
  const workoutRefreshGenerationRef = useRef(0);
  const contentUpdateResultRef = useRef<ContentUpdateResult | undefined>(
    undefined,
  );
  const contentUpdateFailedRef = useRef(false);
  const starterPlansRef = useRef<
    StarterPlanRuntimeCatalog | undefined
  >(undefined);
  const [state, setState] = useState<RuntimeState>(initialState);

  const closeServices = useCallback(async () => {
    foregroundUnsubscribeRef.current?.();
    foregroundUnsubscribeRef.current = null;
    automaticBackupForegroundUnsubscribeRef.current?.();
    automaticBackupForegroundUnsubscribeRef.current = null;
    automaticBackupUnsubscribeRef.current?.();
    automaticBackupUnsubscribeRef.current = null;
    const services = servicesRef.current;
    servicesRef.current = null;
    await services?.lifecycle.dispose?.().catch(() => undefined);
    services?.automaticBackupRuntime?.dispose();
    await services?.kernel.close().catch(() => undefined);
  }, []);

  const trustedRead = useCallback(async (
    services: RuntimeServices,
  ): Promise<RuntimeState> => {
    const context = localContext(dependencies.now());
    const [legacyView, scheduledToday, activation, notificationPermission, latestBackup] =
      await Promise.all([
        services.repository.getTodayView({
          localDate: context.localDate,
          weekday: context.weekday,
        }),
        services.schedules.loadToday(dependencies.nowMs()),
      services.repository.getActivation(),
      services.notifications.permission().catch(
        () => "undetermined" as const,
      ),
      readLatestBackupMetadata(services.kernel),
    ]);
    const preserveWorkoutState = legacyView.state === "active_workout"
      || legacyView.state === "saved_partial";
    return {
      launchState: "trusted",
      view: preserveWorkoutState
        ? legacyView
        : scheduledToday?.view ?? legacyView,
      planDays: scheduledToday?.planDays ?? activation?.days ?? [],
      ...(scheduledToday?.selectedStrengthOccurrence === undefined
        ? {}
        : { selectedStrengthOccurrence: scheduledToday.selectedStrengthOccurrence }),
      latestBackup,
      automaticBackup: phase12NativeFixtureViewModel()
        ?? services.automaticBackupRuntime?.current()
        ?? projectAutomaticBackupPresentation({
          status: "not_connected",
          mutationGeneration: 0,
          backedUpGeneration: 0,
          nowMs: dependencies.nowMs(),
          reason: "unavailable",
        }),
      ...(scheduledToday === null
        ? {}
        : { scheduleToday: scheduledToday.scheduleToday }),
      ...(contentUpdateResultRef.current === undefined
        ? {}
        : { contentUpdateResult: contentUpdateResultRef.current }),
      ...(contentUpdateFailedRef.current ? { contentUpdateFailed: true as const } : {}),
      notificationPermission,
      workoutRefreshGeneration: workoutRefreshGenerationRef.current,
    };
  }, [dependencies]);

  const initialize = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setState(initialState);
    await closeServices();

    let kernel: SqliteKernel;
    try {
      kernel = await dependencies.openKernel();
    } catch {
      if (generation === generationRef.current) {
        setState(failedState(
          "storage",
          "launch_openWriter_failed",
          "GT-WRITER01",
        ));
      }
      return;
    }
    if (generation !== generationRef.current) {
      await kernel.close().catch(() => undefined);
      return;
    }

    const notifications = dependencies.createNotifications();
    const restAlertPreferenceStore = dependencies.restAlertPreferenceStore
      ?? productionRestAlertPreferenceStore;
    const restRepository = dependencies.createRestRepository(kernel);
    const outcomeRepository = dependencies.createOutcomeRepository(kernel);
    const customExerciseRepository = createCustomExerciseRepository(kernel);
    const librarySearchRepository = createLibrarySearchRepository(kernel);
    const lifecycle = dependencies.createLifecycle({
      kernel,
      restRepository,
      progressionRepository: outcomeRepository,
      historyProjectionRepository: createHistoryProjectionRepository(kernel),
      historyProjectionEffectStore: createHistoryProjectionEffectStore(kernel),
      notifications,
      nowMs: dependencies.nowMs,
      ...(dependencies.createAutomaticBackupScheduler === undefined
        ? {}
        : { automaticBackupScheduler: dependencies.createAutomaticBackupScheduler(kernel) }),
    });
    const ownedPlans = createOwnedPlanRuntimePort(kernel, {
      nowMs: dependencies.nowMs,
      randomUUID: () => {
        const {
          randomUUID,
        } = require("expo-crypto") as typeof import("expo-crypto");
        return randomUUID();
      },
      sha256: (value) => {
        const {
          CryptoDigestAlgorithm,
          digestStringAsync,
        } = require("expo-crypto") as typeof import("expo-crypto");
        return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
      },
    });
    const schedules = dependencies.createScheduleRuntime?.(kernel, ownedPlans)
      ?? Object.freeze({
        actOnToday: async () => {
          throw new Error("schedule_runtime_unavailable");
        },
        chooseTimeZone: async () => {
          throw new Error("schedule_runtime_unavailable");
        },
        completeScheduledSession: async () => null,
        consumeDateOverride: async () => {
          throw new Error("schedule_runtime_unavailable");
        },
        loadSchedule: async () => null,
        loadToday: async () => null,
        markWeekdayMissed: async () => {
          throw new Error("schedule_runtime_unavailable");
        },
        recordTrainAnyway: async () => null,
        saveSchedule: async () => {
          throw new Error("schedule_runtime_unavailable");
        },
        setDateOverride: async () => {
          throw new Error("schedule_runtime_unavailable");
        },
      });
    const services: RuntimeServices = {
      ...(dependencies.createAutomaticBackupRuntime === undefined
        ? {}
        : { automaticBackupRuntime: dependencies.createAutomaticBackupRuntime(kernel) }),
      backupCommands: dependencies.createBackupCommands?.(kernel)
        ?? Object.freeze({
          createSecureBackup: async () => {
            throw new Error("backup_commands_unavailable");
          },
          discardSecureBackup: async () => undefined,
          shareSecureBackup: async () => {
            throw new Error("backup_commands_unavailable");
          },
        }),
      csvExportRepository: dependencies.createCsvExportRepository?.(kernel)
        ?? Object.freeze({
          readRows: async () => { throw new Error("csv_export_unavailable"); },
          serialize: async () => { throw new Error("csv_export_unavailable"); },
        }),
      csvFiles: dependencies.createCsvFiles?.() ?? Object.freeze({
        writeCsv: async () => { throw new Error("csv_export_unavailable"); },
        shareCsv: async () => { throw new Error("csv_export_unavailable"); },
        discardCsv: async () => undefined,
      }),
      restoreCommands: dependencies.createRestoreCommands?.(kernel)
        ?? Object.freeze({
          preflightSecureRestore: async () => {
            throw new Error("restore_commands_unavailable");
          },
          invalidateSecureRestorePreflight: () => undefined,
          commitSecureRestore: async () => {
            throw new Error("restore_commands_unavailable");
          },
        }),
      mergeCommands: dependencies.createMergeCommands?.(kernel)
        ?? Object.freeze({
          preflightSecureMerge: async () => {
            throw new Error("merge_commands_unavailable");
          },
          commitSecureMerge: async () => {
            throw new Error("merge_commands_unavailable");
          },
          invalidateSecureMergePreflight: () => undefined,
        }),
      ...(dependencies.reconcileRestore === undefined
        ? {}
        : { reconcileRestore: () => dependencies.reconcileRestore!(kernel) }),
      customExerciseRepository,
      historyCommandRepository: createHistoryCommandRepository(kernel),
      historyRepository: createHistoryRepository(kernel),
      progressRepository: createProgressRepository(kernel),
      kernel,
      librarySearchRepository,
      lifecycle,
      notifications,
      restAlertPreferenceStore,
      ownedPlans,
      schedules,
      outcomeRepository,
      repository: dependencies.createRepository(kernel),
      restRepository,
      workoutRepository: dependencies.createWorkoutRepository(kernel),
      workoutPreferenceRepository: dependencies.createWorkoutPreferenceRepository?.(kernel)
        ?? createWorkoutPreferenceRepository(kernel),
    };
    servicesRef.current = services;
    try {
      await dependencies.migrate(kernel);
    } catch {
      if (generation === generationRef.current) {
        setState(failedState(
          "migration",
          "launch_runMigrations_failed",
          "GT-MIGRATE1",
        ));
      }
      return;
    }
    try {
      const contentUpdateResult = await dependencies.installLibrary?.(kernel);
      contentUpdateResultRef.current = contentUpdateResult;
      contentUpdateFailedRef.current = false;
    } catch {
      contentUpdateResultRef.current = undefined;
      contentUpdateFailedRef.current = true;
    }
    if (services.reconcileRestore !== undefined) {
      try {
        const restoreReconciliation = await services.reconcileRestore();
        if (restoreReconciliation.outcome === "retryable_failure") {
          if (generation === generationRef.current) {
            setState(failedState(
              "storage",
              "launch_restore_rebuild_pending",
              "GT-RESTORE03",
            ));
          }
          return;
        }
      } catch {
        if (generation === generationRef.current) {
          setState(failedState(
            "storage",
            "launch_restore_rebuild_pending",
            "GT-RESTORE03",
          ));
        }
        return;
      }
    }
    try {
      starterPlansRef.current = await dependencies.loadStarterPlans?.(kernel);
    } catch {
      starterPlansRef.current = undefined;
    }
    if (generation !== generationRef.current) {
      await lifecycle.dispose().catch(() => undefined);
      await kernel.close().catch(() => undefined);
      return;
    }

    try {
      await lifecycle.trigger("launch").catch(() => undefined);
      if (services.automaticBackupRuntime !== undefined) {
        automaticBackupUnsubscribeRef.current = services.automaticBackupRuntime.subscribe((automaticBackup) => {
          if (generation === generationRef.current) {
            setState((current) => ({ ...current, automaticBackup }));
          }
        });
        await services.automaticBackupRuntime.start();
      }
      foregroundUnsubscribeRef.current = lifecycle.subscribeForeground(
        (result) => {
          if (generation !== generationRef.current) {
            return;
          }
          workoutRefreshGenerationRef.current += 1;
          setState((current) => ({
            ...current,
            notificationPermission: result.permission,
            workoutRefreshGeneration: workoutRefreshGenerationRef.current,
          }));
        },
      );
      const appState = (require("react-native") as typeof import("react-native"))
        .AppState;
      let priorAppState = appState.currentState;
      const automaticBackupSubscription = appState.addEventListener("change", (next) => {
        const enteringForeground = priorAppState !== "active" && next === "active";
        priorAppState = next;
        if (enteringForeground && generation === generationRef.current) {
          void services.automaticBackupRuntime?.refresh();
        }
      });
      automaticBackupForegroundUnsubscribeRef.current = () => {
        automaticBackupSubscription?.remove();
      };
      const next = await trustedRead(services);
      if (generation !== generationRef.current) {
        await lifecycle.dispose().catch(() => undefined);
        await kernel.close().catch(() => undefined);
        return;
      }
      setState(next);
    } catch {
      if (generation === generationRef.current) {
        setState(failedState(
          "storage",
          "launch_firstTrustedQuery_failed",
          "GT-QUERY001",
        ));
      }
    }
  }, [closeServices, dependencies, trustedRead]);

  useEffect(() => {
    void initialize();
    return () => {
      generationRef.current += 1;
      void closeServices();
    };
  }, [closeServices, initialize]);

  const requireServices = useCallback((): RuntimeServices => {
    const services = servicesRef.current;
    if (services === null || state.launchState !== "trusted") {
      throw new Error("workout_runtime_not_trusted");
    }
    return services;
  }, [state.launchState]);

  const refresh = useCallback(async () => {
    const services = requireServices();
    try {
      const next = await trustedRead(services);
      setState(next);
    } catch {
      setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
      }));
    }
  }, [requireServices, trustedRead]);

  const runAutomaticBackupCommand = useCallback(async <Result,>(
    command: (runtime: AutomaticBackupRuntime) => Promise<Result>,
  ): Promise<Result> => {
    const runtime = requireServices().automaticBackupRuntime;
    if (runtime === undefined) throw new Error("automatic_backup_unavailable");
    const result = await command(runtime);
    setState((current) => ({ ...current, automaticBackup: runtime.current() }));
    return result;
  }, [requireServices]);

  const activatePlan = useCallback(async () => {
    const services = requireServices();
    const context = localContext(dependencies.now());
    try {
      const catalog = starterPlansRef.current;
      if (catalog === undefined) {
        throw new Error("starter_catalog_unavailable");
      }
      await dependencies.activateInitialStarter({
        kernel: services.kernel,
        catalog,
        activatedAtMs: dependencies.nowMs(),
        startLocalDate: context.localDate,
        timeZone: context.timezone,
      });
      setState(await trustedRead(services));
    } catch {
      setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
      }));
    }
  }, [dependencies, requireServices, trustedRead]);

  const startPlanDay = useCallback(async (
    dayId: string,
    mode: "scheduled" | "alternate" | "rest_day",
  ): Promise<string> => {
    const services = requireServices();
    const context = localContext(dependencies.now());
    try {
      const activation = await services.repository.getActivation();
      const scheduledToday = await services.schedules.loadToday(
        dependencies.nowMs(),
      );
      const planId = scheduledToday?.planId ?? activation?.plan.id;
      const localDate = scheduledToday?.localDate ?? context.localDate;
      const timezone = scheduledToday?.timeZone ?? context.timezone;
      if (planId === undefined) {
        throw new Error("active_plan_missing");
      }
      if (mode === "scheduled") {
        const selected = scheduledToday?.selectedStrengthOccurrence;
        if (
          selected === null
          || selected === undefined
          || selected.planId !== planId
          || selected.planDayId !== dayId
        ) {
          throw new Error("selected_strength_occurrence_unavailable");
        }
      }
      const session = await startWorkout({
        repository: services.repository,
        request: {
          mode,
          planId,
          planDayId: dayId,
          localDate,
          timezone,
          startedAtMs: dependencies.nowMs(),
          ...(mode === "scheduled"
            ? {
                selectedOccurrence: scheduledToday!.selectedStrengthOccurrence!,
                commandIdentity: dependencies.nowMs().toString(16)
                  .padStart(64, "0"),
              }
            : {}),
        },
      });
      setState(await trustedRead(services));
      return session.id;
    } catch {
      setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
      }));
      throw new Error("workout_action_failed");
    }
  }, [dependencies, requireServices, trustedRead]);

  const startSelectedStrengthOccurrence = useCallback(async (
    occurrence: SelectedStrengthOccurrence,
  ): Promise<string> => {
    const services = requireServices();
    try {
      const session = await startWorkout({
        repository: services.repository,
        request: {
          mode: "scheduled",
          planId: occurrence.planId,
          planDayId: occurrence.planDayId,
          localDate: occurrence.localDate,
          timezone: occurrence.timeZone,
          startedAtMs: dependencies.nowMs(),
          selectedOccurrence: occurrence,
          commandIdentity: dependencies.nowMs().toString(16).padStart(64, "0"),
        },
      });
      setState(await trustedRead(services));
      return session.id;
    } catch {
      setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
      }));
      throw new Error("workout_action_failed");
    }
  }, [dependencies, requireServices, trustedRead]);

  const startEmptyWorkout = useCallback(async (): Promise<string> => {
    const services = requireServices();
    const context = localContext(dependencies.now());
    try {
      const session = await startWorkout({
        repository: services.repository,
        request: {
          mode: "empty",
          localDate: context.localDate,
          timezone: context.timezone,
          startedAtMs: dependencies.nowMs(),
        },
      });
      setState(await trustedRead(services));
      return session.id;
    } catch {
      setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
      }));
      throw new Error("workout_action_failed");
    }
  }, [dependencies, requireServices, trustedRead]);

  const getActiveWorkout = useCallback((sessionId: string) => {
    return requireServices().workoutRepository.getWorkoutSession(sessionId);
  }, [requireServices]);

  const getSessionDetail = useCallback((sessionId: string) => {
    return requireServices().outcomeRepository.getSessionDetail(sessionId);
  }, [requireServices]);

  const loadHistoryCorrectionSession = useCallback((sessionId: string) =>
    requireServices().historyCommandRepository.loadCorrectionSession(sessionId),
  [requireServices]);

  const listAvailableCorrectionExercises = useCallback(() =>
    requireServices().historyCommandRepository.listAvailableCorrectionExercises(),
  [requireServices]);

  const correctRuntimeHistorySession = useCallback(async (
    input: Omit<CorrectHistorySessionInput, "nowMs">,
  ) => {
    const services = requireServices();
    const result = await correctHistorySession({
      repository: services.historyCommandRepository,
      command: { ...input, nowMs: dependencies.nowMs() },
    });
    await services.lifecycle.trigger("post_commit").catch(() => undefined);
    workoutRefreshGenerationRef.current += 1;
    try {
      setState(await trustedRead(services));
    } catch {
      setState((current) => ({
        ...current,
        workoutRefreshGeneration: workoutRefreshGenerationRef.current,
      }));
    }
    return result;
  }, [dependencies, requireServices, trustedRead]);

  const refreshAfterHistoryLifecycleCommit = useCallback(async () => {
    const services = requireServices();
    await services.lifecycle.trigger("post_commit").catch(() => undefined);
    workoutRefreshGenerationRef.current += 1;
    try {
      setState(await trustedRead(services));
    } catch {
      setState((current) => ({
        ...current,
        workoutRefreshGeneration: workoutRefreshGenerationRef.current,
      }));
    }
  }, [requireServices, trustedRead]);

  const removeRuntimeHistorySession = useCallback(async (
    input: Omit<VoidHistorySessionInput, "nowMs">,
  ) => {
    const result = await removeHistorySession({
      repository: requireServices().historyCommandRepository,
      command: { ...input, nowMs: dependencies.nowMs() },
    });
    await refreshAfterHistoryLifecycleCommit();
    return result;
  }, [dependencies, refreshAfterHistoryLifecycleCommit, requireServices]);

  const restoreRuntimeHistorySession = useCallback(async (
    input: Omit<RestoreHistorySessionInput, "nowMs">,
  ) => {
    const result = await restoreHistorySession({
      repository: requireServices().historyCommandRepository,
      command: { ...input, nowMs: dependencies.nowMs() },
    });
    await refreshAfterHistoryLifecycleCommit();
    return result;
  }, [dependencies, refreshAfterHistoryLifecycleCommit, requireServices]);

  const loadCalendarMonth = useCallback((input: Readonly<{
    month: string;
    selectedDate: string;
    today: string;
  }>) => {
    return requireServices().historyRepository.loadCalendarMonth(input);
  }, [requireServices]);

  const loadExerciseMetricHistory = useCallback((exerciseId: string) => {
    return requireServices().historyRepository.loadExerciseMetricHistory({
      exerciseId,
    });
  }, [requireServices]);

  const loadProgress = useCallback((input: Readonly<{
    period: ProgressPeriod;
    nowLocalDate: string;
  }>) => requireServices().progressRepository.load(input), [requireServices]);

  const listRemovedHistorySessions = useCallback(() =>
    requireServices().historyRepository.listRemovedSessions(),
  [requireServices]);

  const loadLibrary = useCallback(async (): Promise<LibraryRuntimeSnapshot> => {
    const services = requireServices();
    const [sectionPreference, plans, exerciseFilterOptions] = await Promise.all([
      readLibrarySectionPreference(services.kernel),
      readLibraryPlans(
        services.kernel,
        starterPlansRef.current?.summaries ?? [],
        starterPlansRef.current?.templates ?? [],
      ),
      readLibraryFilterOptions(services.kernel),
    ]);
    return Object.freeze({
      sectionPreference,
      plans,
      exerciseFilterOptions,
    });
  }, [requireServices]);

  const loadStarterPlan = useCallback(async (
    templateId: string,
  ): Promise<AcceptedStarterTemplate | null> => {
    const catalog = starterPlansRef.current;
    return catalog === undefined ? null : findStarterPlan(catalog, templateId);
  }, []);

  const loadStarterActivationPreview = useCallback(async (
    templateId: string,
  ): Promise<StarterPlanRuntimeActivationPreview | null> => {
    const catalog = starterPlansRef.current;
    if (catalog === undefined) {
      return null;
    }
    const context = localContext(dependencies.now());
    return readStarterActivationPreview(
      requireServices().kernel,
      catalog,
      templateId,
      context.localDate,
      context.timezone,
    );
  }, [dependencies, requireServices]);

  const activateAcceptedStarter = useCallback(async (
    command: StarterPlanRuntimeActivationCommand,
  ): Promise<AcceptedStarterPlanActivation> => {
    const catalog = starterPlansRef.current;
    if (catalog === undefined) {
      throw new Error("starter_catalog_unavailable");
    }
    const services = requireServices();
    const {
      CryptoDigestAlgorithm,
      digestStringAsync,
    } = require("expo-crypto") as typeof import("expo-crypto");
    const prettyBytes = (value: unknown) => `${JSON.stringify(value, null, 2)}
`;
    const activatedAtMs = dependencies.nowMs();
    const confirmationToken = createStarterPlanActivationConfirmationToken({
      assetSha256: catalog.pack.assetSha256,
      templateId: command.templateId,
      templateRevision: findStarterPlan(catalog, command.templateId)?.revision
        ?? catalog.pack.revision,
      startLocalDate: command.startLocalDate,
      timeZone: command.timeZone,
      mode: command.mode,
      bindings: command.bindings,
      copyChoice: command.copyChoice,
    });
    const result = await activateStarterPlan({
      kind: "accepted",
      starterPackBytes: prettyBytes(starterPlansAsset),
      acceptanceBytes: prettyBytes(starterPlansAcceptanceAsset),
      sha256: (value: string) =>
        digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
      repository: createStarterPlanRepository(services.kernel),
      requestId: `starter-ui:${command.templateId}:${activatedAtMs}`,
      activatedAtMs,
      expectedActiveScheduleRevision:
        command.expectedActiveScheduleRevision,
      confirmationToken,
      templateId: command.templateId,
      templateRevision: findStarterPlan(catalog, command.templateId)?.revision
        ?? catalog.pack.revision,
      copyChoice: command.copyChoice,
      startLocalDate: command.startLocalDate,
      timeZone: command.timeZone,
      mode: command.mode,
      bindings: command.bindings as never,
    } as never);
    return acknowledgeCommittedRuntimeResult({
      result,
      refresh: () => trustedRead(services),
      onRefreshed: setState,
      onRefreshFailed: () => setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
      })),
    });
  }, [dependencies, requireServices, trustedRead]);

  const createStarterEditableCopy = useCallback(async (
    templateId: string,
  ): Promise<string> => {
    const catalog = starterPlansRef.current;
    if (catalog === undefined) {
      throw new Error("starter_catalog_unavailable");
    }
    const template = findStarterPlan(catalog, templateId);
    if (template === null) {
      throw new Error("starter_template_not_found");
    }
    const services = requireServices();
    const { CryptoDigestAlgorithm, digestStringAsync } = require("expo-crypto") as typeof import("expo-crypto");
    const createdAtMs = dependencies.nowMs();
    const result = await createStarterPlanCopy({
      starterPackBytes: `${JSON.stringify(starterPlansAsset, null, 2)}\n`,
      acceptanceBytes: `${JSON.stringify(starterPlansAcceptanceAsset, null, 2)}\n`,
      sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
      repository: createStarterPlanRepository(services.kernel),
      requestId: `starter-editable-copy:${template.id}:${createdAtMs}`,
      createdAtMs,
      sourceOwnedPlanId: `starter:${template.id}:r${template.revision}`,
      expectedSourcePlanRevision: template.revision,
      expectedActiveScheduleRevision: null,
      templateId: template.id,
      templateRevision: template.revision,
      startLocalDate: localContext(dependencies.now()).localDate,
      timeZone: localContext(dependencies.now()).timezone,
      ...suggestedTemplateSchedule(template),
    });
    return acknowledgeCommittedRuntimeResult({
      result,
      refresh: () => trustedRead(services),
      onRefreshed: setState,
      onRefreshFailed: () => setState((current) => ({
        ...current,
        actionFailure: { code: "workout_action_failed", correlationCode: "GT-ACTION01" },
      })),
    }).then(({ plan }) => plan.id);
  }, [dependencies, requireServices, trustedRead]);

  const loadStarterTemplateUpdate = useCallback((input: Readonly<{
    ownedPlanId: string;
    templateId: string;
  }>): Promise<StarterPlanTemplateUpdatePreview | null> => {
    const catalog = starterPlansRef.current;
    if (catalog === undefined) {
      return Promise.resolve(null);
    }
    return readStarterTemplateUpdate(requireServices().kernel, catalog, input);
  }, [requireServices]);

  const createStarterTemplateUpdateCopy = useCallback(async (
    preview: StarterPlanTemplateUpdatePreview,
  ): Promise<string> => {
    const services = requireServices();
    const catalog = starterPlansRef.current;
    if (catalog === undefined) {
      throw new Error("starter_catalog_unavailable");
    }
    const {
      CryptoDigestAlgorithm,
      digestStringAsync,
    } = require("expo-crypto") as typeof import("expo-crypto");
    const prettyBytes = (value: unknown) => `${JSON.stringify(value, null, 2)}
`;
    const context = localContext(dependencies.now());
    const createdAtMs = dependencies.nowMs();
    const result = await createStarterPlanCopy({
      starterPackBytes: prettyBytes(starterPlansAsset),
      acceptanceBytes: prettyBytes(starterPlansAcceptanceAsset),
      sha256: (value) =>
        digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
      repository: createStarterPlanRepository(services.kernel),
      requestId:
        `starter-update-copy:${preview.ownedPlanId}:${preview.template.id}:${createdAtMs}`,
      createdAtMs,
      sourceOwnedPlanId: preview.ownedPlanId,
      expectedSourcePlanRevision: preview.ownedPlanRevision,
      expectedActiveScheduleRevision: preview.activeScheduleRevision,
      templateId: preview.template.id,
      templateRevision: preview.template.revision,
      startLocalDate: context.localDate,
      timeZone: context.timezone,
      ...suggestedTemplateSchedule(preview.template),
    });
    return result.plan.id;
  }, [dependencies, requireServices]);

  const searchLibraryExercises = useCallback((
    input: Readonly<{
      query: string;
      filters?: SearchFilters;
      cursor?: string | null;
    }>,
  ) => requireServices().librarySearchRepository.searchExercises(input),
  [requireServices]);

  const listLibraryRecentExercises = useCallback(
    () => requireServices().librarySearchRepository.listRecentExercises(),
    [requireServices],
  );

  const setLibrarySection = useCallback(async (
    section: LibraryRuntimeSection,
    expectedRevision: number,
  ): Promise<LibraryRuntimeSectionPreference> =>
    createLibrarySectionPreferencePort(
      requireServices().kernel,
      dependencies.nowMs,
    ).write(section, expectedRevision),
  [dependencies, requireServices]);

  const setLibraryExerciseFavorite = useCallback(async (
    exerciseId: string,
    favorite: boolean,
  ) => {
    const services = requireServices();
    const [preference] = await services.kernel.queryAll<{
      revision: number;
    }>(
      `SELECT revision
       FROM exercise_owner_preferences
       WHERE exercise_id = ?`,
      [exerciseId],
    );
    const expectedPreferenceRevision = preference?.revision ?? null;
    const result = await services.customExerciseRepository.setExerciseFavorite({
      requestId:
        `favorite:${exerciseId}:${favorite ? "on" : "off"}:${expectedPreferenceRevision ?? "new"}`,
      exerciseId,
      expectedPreferenceRevision,
      favorite,
      updatedAtMs: dependencies.nowMs(),
    });
    return Object.freeze({
      exerciseId: result.exerciseId,
      favorite: result.favorite,
      preferenceRevision: result.preferenceRevision,
    });
  }, [dependencies, requireServices]);

  const createRuntimeCustomExercise = useCallback((
    input: Omit<CreateCustomExerciseInput, "createdAtMs">,
  ) => {
    const services = requireServices();
    return createCustomExerciseCommand({
      repository: services.customExerciseRepository,
      invalidate: async () => undefined,
      input: {
        ...input,
        createdAtMs: dependencies.nowMs(),
      },
    });
  }, [dependencies, requireServices]);

  const editRuntimeCustomExercise = useCallback((
    input: Omit<EditCustomExerciseInput, "editedAtMs">,
  ) => {
    const services = requireServices();
    return editCustomExerciseCommand({
      repository: services.customExerciseRepository,
      invalidate: async () => undefined,
      input: {
        ...input,
        editedAtMs: dependencies.nowMs(),
      },
    });
  }, [dependencies, requireServices]);

  const loadRuntimeCustomExercise = useCallback((
    exerciseId: string,
  ) => readCustomExerciseDetail(requireServices(), exerciseId),
  [requireServices]);

  const requireCustomExerciseDetail = useCallback(async (
    services: RuntimeServices,
    exerciseId: string,
  ): Promise<CustomExerciseRuntimeDetail> => {
    const detail = await readCustomExerciseDetail(services, exerciseId);
    if (detail === null) {
      throw new Error("custom_exercise_not_found");
    }
    return detail;
  }, []);

  const setRuntimeCustomExerciseFavorite = useCallback(async (
    input: Readonly<{
      exerciseId: string;
      expectedPreferenceRevision: number | null;
      favorite: boolean;
    }>,
  ) => {
    const services = requireServices();
    await setExerciseFavoriteCommand({
      repository: services.customExerciseRepository,
      invalidate: async () => undefined,
      input: {
        requestId: services.ownedPlans.createId("exercise-favorite"),
        ...input,
        updatedAtMs: dependencies.nowMs(),
      },
    });
    return requireCustomExerciseDetail(services, input.exerciseId);
  }, [dependencies, requireCustomExerciseDetail, requireServices]);

  const setRuntimeCustomExerciseHidden = useCallback(async (
    input: Readonly<{
      exerciseId: string;
      expectedPreferenceRevision: number | null;
      hidden: boolean;
    }>,
  ) => {
    const services = requireServices();
    await setExerciseHidden({
      repository: services.customExerciseRepository,
      invalidate: async () => undefined,
      input: {
        requestId: services.ownedPlans.createId("exercise-hidden"),
        ...input,
        updatedAtMs: dependencies.nowMs(),
      },
    });
    return requireCustomExerciseDetail(services, input.exerciseId);
  }, [dependencies, requireCustomExerciseDetail, requireServices]);

  const previewRuntimeCustomExerciseArchive = useCallback((
    exerciseId: string,
    expectedExerciseRevision: number,
  ) => previewCustomExerciseArchive({
    repository: requireServices().customExerciseRepository,
    input: {
      exerciseId,
      expectedExerciseRevision,
    },
  }), [requireServices]);

  const setRuntimeCustomExerciseArchived = useCallback(async (
    input: Readonly<{
      exerciseId: string;
      expectedExerciseRevision: number;
      expectedPreferenceRevision: number | null;
      previewRevision: string;
      archived: boolean;
    }>,
  ) => {
    const services = requireServices();
    const command = input.archived
      ? archiveCustomExercise
      : restoreCustomExercise;
    await command({
      repository: services.customExerciseRepository,
      invalidate: async () => undefined,
      input: {
        requestId: services.ownedPlans.createId(
          input.archived ? "exercise-archive" : "exercise-restore",
        ),
        exerciseId: input.exerciseId,
        expectedExerciseRevision: input.expectedExerciseRevision,
        expectedPreferenceRevision: input.expectedPreferenceRevision,
        previewRevision: input.previewRevision,
        updatedAtMs: dependencies.nowMs(),
      },
    });
    return requireCustomExerciseDetail(services, input.exerciseId);
  }, [dependencies, requireCustomExerciseDetail, requireServices]);

  const loadRuntimeCustomExerciseMigration = useCallback((
    exerciseId: string,
  ) => readCustomExerciseMigration(requireServices(), exerciseId),
  [requireServices]);

  const migrateRuntimeCustomExerciseProfile = useCallback((
    input: Omit<MigrateCustomExerciseMetricProfileInput, "migratedAtMs">,
  ) => migrateCustomExerciseMetricProfile({
    repository: createMetricRepository(requireServices().kernel),
    input: {
      ...input,
      migratedAtMs: dependencies.nowMs(),
    },
  }), [dependencies, requireServices]);

  const runOwnedPlanMutation = useCallback(async (
    mutation: (
      ownedPlans: RuntimeServices["ownedPlans"],
    ) => Promise<OwnedPlanRepositoryResult>,
  ): Promise<OwnedPlanRepositoryResult> => {
    const services = requireServices();
    const result = await mutation(services.ownedPlans);
    if (
      result.outcome === "committed"
      || result.outcome === "already_committed"
    ) {
      setState(await trustedRead(services));
    }
    return result;
  }, [requireServices, trustedRead]);

  const createOwnedDraft = useCallback((
    input: Readonly<{ name: string; dayName: string }>,
  ) => runOwnedPlanMutation((ownedPlans) => ownedPlans.createDraft(input)),
  [runOwnedPlanMutation]);

  const saveOwnedDraft = useCallback((
    input: Readonly<{
      expectedRevision: number;
      plan: OwnedPlanDraftInput;
    }>,
  ) => runOwnedPlanMutation((ownedPlans) => ownedPlans.savePlan(input)),
  [runOwnedPlanMutation]);

  const duplicateOwnedDraft = useCallback((
    input: Readonly<{
      sourcePlanId: string;
      expectedRevision: number;
      name: string;
    }>,
  ) => runOwnedPlanMutation((ownedPlans) => ownedPlans.duplicatePlan(input)),
  [runOwnedPlanMutation]);

  const archiveOwnedDraft = useCallback((
    input: Readonly<{ planId: string; expectedRevision: number }>,
  ) => runOwnedPlanMutation((ownedPlans) => ownedPlans.archivePlan(input)),
  [runOwnedPlanMutation]);

  const restoreOwnedDraft = useCallback((
    input: Readonly<{ planId: string; expectedRevision: number }>,
  ) => runOwnedPlanMutation((ownedPlans) => ownedPlans.restorePlan(input)),
  [runOwnedPlanMutation]);

  const previewOwnedDayRemoval = useCallback((
    input: Readonly<{ planId: string; dayId: string }>,
  ) => requireServices().ownedPlans.previewDayRemoval(input),
  [requireServices]);

  const removeOwnedDayWithImpact = useCallback(async (
    input: RemovePlanDayWithImpactInput,
  ) => {
    const services = requireServices();
    const result = await services.ownedPlans.removeDayWithImpact(input);
    if (
      result.outcome === "committed"
      || result.outcome === "already_committed"
    ) {
      setState(await trustedRead(services));
    }
    return result;
  }, [requireServices, trustedRead]);

  const previewOwnedExerciseReplacement = useCallback((
    input: Readonly<{ planId: string; occurrenceId: string }>,
  ) => requireServices().ownedPlans.previewExerciseReplacement(input),
  [requireServices]);

  const replaceOwnedExercise = useCallback(async (
    input: ReplacePlanExerciseInput,
  ) => {
    const services = requireServices();
    const result = await services.ownedPlans.replaceExercise(input);
    if (
      result.outcome === "committed"
      || result.outcome === "already_committed"
    ) {
      setState(await trustedRead(services));
    }
    return result;
  }, [requireServices, trustedRead]);

  const reconcileAfterCommit = useCallback((
    services: RuntimeServices,
    foregroundExpiry?: Readonly<{ sessionId: string; restRevision: number }>,
  ) => {
    void (async () => {
      const sessionIds = await services.restRepository.listActiveSessionIds()
        .catch(() => []);
      const hasRunningRest = (
        await Promise.all(
          sessionIds.map((sessionId) =>
            services.restRepository.getRestState(sessionId).catch(() => null)
          ),
        )
      ).some((rest) => rest?.state === "running");
      let permission = await services.notifications.permission()
        .catch(() => "undetermined" as const);
      if (hasRunningRest && permission === "undetermined") {
        permission = await services.notifications.requestPermission()
          .catch(() => "denied" as const);
      }
      const lifecycleResult = await services.lifecycle.trigger("post_commit", {
        ...(foregroundExpiry === undefined ? {} : { foregroundExpiry }),
      })
        .catch(() => null);
      workoutRefreshGenerationRef.current += 1;
      setState((current) => ({
        ...current,
        notificationPermission: lifecycleResult?.permission ?? permission,
        workoutRefreshGeneration: workoutRefreshGenerationRef.current,
      }));
    })();
  }, []);

  const runRestCommand = useCallback((
    sessionId: string,
    command: (
      repository: ReturnType<typeof createRestRepository>,
    ) => Promise<RestCommandResult>,
  ): Promise<RestCommandResult> => {
    const services = requireServices();
    return command(services.restRepository).then(async (result) => {
      reconcileAfterCommit(services, result.state.state === "expired"
        ? { sessionId, restRevision: result.state.revision }
        : undefined);
      try {
        setState(await trustedRead(services));
      } catch {
        setState((current) => ({
          ...current,
          actionFailure: {
            code: "workout_action_failed",
            correlationCode: "GT-ACTION01",
          },
        }));
      }
      return result;
    });
  }, [reconcileAfterCommit, requireServices, trustedRead]);

  const openRestNotificationSettings = useCallback(() => {
    return requireServices().notifications.openSettings();
  }, [requireServices]);

  const readRestAlertPreferences = useCallback(() =>
    requireServices().restAlertPreferenceStore.read(), [requireServices]);

  const setRestAlertPreferences = useCallback(async (
    preferences: RestAlertPreferences,
  ): Promise<RestAlertPreferenceSaveResult> => {
    const services = requireServices();
    let persisted = DEFAULT_REST_ALERT_PREFERENCES;
    let status: RestAlertPreferenceSaveResult["status"] = "failed";
    try {
      services.restAlertPreferenceStore.write(preferences);
      persisted = services.restAlertPreferenceStore.read();
      if (sameRestAlertPreferences(persisted, preferences)) {
        status = "persisted";
        await services.lifecycle.trigger("post_commit").catch(() => undefined);
      } else {
        status = "not_persisted";
      }
    } catch {
      try {
        persisted = services.restAlertPreferenceStore.read();
      } catch {
        persisted = DEFAULT_REST_ALERT_PREFERENCES;
      }
    }
    workoutRefreshGenerationRef.current += 1;
    setState((current) => ({
      ...current,
      workoutRefreshGeneration: workoutRefreshGenerationRef.current,
    }));
    return { status, preferences: persisted };
  }, [requireServices]);

  const requestRestNotificationPermission = useCallback(async () => {
    const services = requireServices();
    const permission = await services.notifications.requestPermission()
      .catch(() => "denied" as const);
    setState((current) => ({
      ...current,
      notificationPermission: permission,
    }));
    return permission;
  }, [requireServices]);

  const exerciseNotificationExpiry = useCallback(async (
    mode: NotificationExpiryExerciseMode,
  ): Promise<NotificationExpiryExerciseCode> => {
    let services: RuntimeServices;
    try {
      services = requireServices();
    } catch {
      return "runtime_contract_unavailable";
    }

    try {
      if (mode === "background") {
        const permission = await services.notifications.permission();
        if (permission !== "granted") {
          return "permission_denied";
        }
        const preferences = services.restAlertPreferenceStore.read();
        await services.notifications.ensureChannel(preferences);
        const scheduled = await services.notifications.listScheduled();
        for (const request of scheduled) {
          if (request.identifier === NOTIFICATION_EXPIRY_TEST_IDENTIFIER) {
            await services.notifications.cancel(request.identifier);
          }
        }
        const endsAtMs = dependencies.nowMs()
          + NOTIFICATION_EXPIRY_TEST_DELAY_MS;
        await services.notifications.schedule({
          identifier: NOTIFICATION_EXPIRY_TEST_IDENTIFIER,
          sessionId: NOTIFICATION_EXPIRY_TEST_SESSION_ID,
          restRevision: NOTIFICATION_EXPIRY_TEST_REVISION,
          endsAtMs,
          preferences,
        });
        const matching = (await services.notifications.listScheduled())
          .filter((request) => (
            request.identifier === NOTIFICATION_EXPIRY_TEST_IDENTIFIER
          ));
        return matching.length === 1
          && matching[0]?.sessionId === NOTIFICATION_EXPIRY_TEST_SESSION_ID
          && matching[0]?.restRevision === NOTIFICATION_EXPIRY_TEST_REVISION
          && matching[0]?.endsAtMs === endsAtMs
          && matching[0]?.channelId === notificationExpiryTestChannelId(
            preferences,
          )
          ? "background_expiry_scheduled_once"
          : "platform_failure";
      }

      const sessionIds = await services.restRepository.listActiveSessionIds();
      const running = (await Promise.all(sessionIds.map(async (sessionId) => {
        const context = await services.restRepository.getRestContext(sessionId);
        return context?.state.state === "running"
          ? { context, sessionId }
          : null;
      }))).filter((candidate): candidate is NonNullable<typeof candidate> => (
        candidate !== null
      ));
      if (running.length !== 1) {
        return "runtime_contract_unavailable";
      }
      const candidate = running[0];
      if (candidate === undefined) {
        return "runtime_contract_unavailable";
      }
      const { context, sessionId } = candidate;
      if (context.state.state !== "running") {
        return "runtime_contract_unavailable";
      }
      const expired = await services.restRepository.expireRestWithForegroundFeedback?.({
        sessionId,
        expectedSessionRevision: context.sessionRevision,
        expectedRestRevision: context.state.revision,
        nowMs: context.state.endsAtMs,
        preferences: services.restAlertPreferenceStore.read(),
      });
      if (expired?.state.state !== "expired") {
        return "platform_failure";
      }
      const foregroundExpiry = {
        sessionId,
        restRevision: expired.state.revision,
      };
      let first: Awaited<ReturnType<typeof services.lifecycle.trigger>>;
      let second: Awaited<ReturnType<typeof services.lifecycle.trigger>>;
      try {
        first = await services.lifecycle.trigger("post_commit", {
          foregroundExpiry,
        });
        second = await services.lifecycle.trigger("post_commit", {
          foregroundExpiry,
        });
      } catch {
        return "platform_failure_after_expiry_commit";
      }
      const firstFeedback = first.foregroundFeedback.filter((feedback) => (
        feedback.sessionId === sessionId
        && feedback.restRevision === expired.state.revision
      ));
      const secondFeedback = second.foregroundFeedback.filter((feedback) => (
        feedback.sessionId === sessionId
        && feedback.restRevision === expired.state.revision
      ));
      try {
        setState(await trustedRead(services));
      } catch {
        setState((current) => ({
          ...current,
          actionFailure: {
            code: "workout_action_failed",
            correlationCode: "GT-ACTION01",
          },
        }));
      }
      return firstFeedback.length === 1
        && firstFeedback[0]?.outcome === "attempted"
        && firstFeedback[0].diagnostics.length === 0
        && secondFeedback.length === 1
        && secondFeedback[0]?.outcome === "already_attempted"
        ? "foreground_expiry_attempted_once"
        : "platform_failure";
    } catch {
      return "platform_failure";
    }
  }, [dependencies, requireServices, trustedRead]);

  const startWorkoutRest = useCallback((input: RestRevisionInput) =>
    runRestCommand(input.sessionId, (repository) =>
      startManualRest({ repository, input })),
  [runRestCommand]);

  const pauseWorkoutRest = useCallback((input: RestRevisionInput) =>
    runRestCommand(input.sessionId, (repository) =>
      pauseRest({ repository, input })),
  [runRestCommand]);

  const resumeWorkoutRest = useCallback((input: RestRevisionInput) =>
    runRestCommand(input.sessionId, (repository) =>
      resumeRest({ repository, input })),
  [runRestCommand]);

  const adjustWorkoutRest = useCallback((input: AdjustRestInput) =>
    runRestCommand(input.sessionId, (repository) =>
      adjustRest({ repository, input })),
  [runRestCommand]);

  const skipWorkoutRest = useCallback((input: RestRevisionInput) =>
    runRestCommand(input.sessionId, (repository) =>
      skipRest({ repository, input })),
  [runRestCommand]);

  const expireWorkoutRest = useCallback((input: RestRevisionInput) => {
    const services = requireServices();
    const preferences = services.restAlertPreferenceStore.read();
    const appState = (require("react-native") as typeof import("react-native"))
      .AppState.currentState;
    if (appState === "background" || appState === "inactive") {
      return runRestCommand(input.sessionId, (repository) =>
        expireRest({ repository, input }));
    }
    return runRestCommand(input.sessionId, (repository) =>
      expireRestWithForegroundFeedback({
        repository,
        input: { ...input, preferences },
      }));
  }, [requireServices, runRestCommand]);

  const runWorkoutMutation = useCallback(async (
    mutation: (
      repository: ReturnType<typeof createWorkoutRepository>,
    ) => Promise<ActiveWorkoutView>,
    committedSetId?: string,
  ): Promise<ActiveWorkoutView | CommittedWorkoutMutationResult> => {
    const services = requireServices();
    let view: ActiveWorkoutView;
    try {
      view = await mutation(services.workoutRepository);
    } catch (error) {
      const failure = mapWorkoutMutationFailure(error);
      setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
        mutationFailure: failure,
      }));
      throw error;
    }
    reconcileAfterCommit(services);
    workoutRefreshGenerationRef.current += 1;
    try {
      setState(await trustedRead(services));
    } catch {
      setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
        workoutRefreshGeneration: workoutRefreshGenerationRef.current,
      }));
    }
    return committedSetId === undefined
      ? view
      : Object.freeze({ ...view, committedSetId });
  }, [reconcileAfterCommit, requireServices, trustedRead]);

  const runWorkoutRemoval = useCallback(async (
    input: RemoveWarmupInput | RemoveWorkingSetInput,
    mutation: (
      repository: ReturnType<typeof createWorkoutRepository>,
    ) => Promise<RemoveSetResult>,
  ): Promise<ActiveWorkoutView | CommittedWorkoutRemovalRefreshFailure> => {
    const services = requireServices();
    let committed: RemoveSetResult;
    try {
      committed = await mutation(services.workoutRepository);
    } catch (error) {
      const failure = mapWorkoutMutationFailure(error);
      setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
        mutationFailure: failure,
      }));
      throw error;
    }
    reconcileAfterCommit(services);

    let activeView: ActiveWorkoutView;
    try {
      activeView = await services.workoutRepository.getActiveWorkout(input.sessionId);
      workoutRefreshGenerationRef.current += 1;
      setState(await trustedRead(services));
    } catch {
      workoutRefreshGenerationRef.current += 1;
      setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
        workoutRefreshGeneration: workoutRefreshGenerationRef.current,
      }));
      return Object.freeze({
        outcome: "committed_refresh_failed",
        sessionId: committed.sessionId,
        setId: committed.setId,
        sessionRevision: committed.sessionRevision,
      });
    }
    return activeView;
  }, [reconcileAfterCommit, requireServices, trustedRead]);

  const runExerciseEdit = useCallback(async (
    input: ReplaceExerciseInput | RemoveExerciseInput,
    mutation: (
      repository: ReturnType<typeof createWorkoutRepository>,
    ) => Promise<ReplaceExerciseResult | RemoveExerciseResult>,
  ): Promise<ActiveWorkoutView | CommittedExerciseEditRefreshFailure> => {
    const services = requireServices();
    let committed: ReplaceExerciseResult | RemoveExerciseResult;
    try {
      committed = await mutation(services.workoutRepository);
    } catch (error) {
      const failure = mapWorkoutMutationFailure(error);
      setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
        mutationFailure: failure,
      }));
      throw error;
    }
    reconcileAfterCommit(services);

    try {
      const activeView = await services.workoutRepository.getActiveWorkout(
        input.sessionId,
      );
      workoutRefreshGenerationRef.current += 1;
      setState(await trustedRead(services));
      return activeView;
    } catch {
      workoutRefreshGenerationRef.current += 1;
      setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
        workoutRefreshGeneration: workoutRefreshGenerationRef.current,
      }));
      return Object.freeze({
        outcome: "committed_refresh_failed",
        sessionId: committed.sessionId,
        sessionExerciseId: committed.sessionExerciseId,
        sessionRevision: committed.sessionRevision,
      });
    }
  }, [reconcileAfterCommit, requireServices, trustedRead]);

  const updateDraft = useCallback((input: UpdateActiveSetDraftInput) =>
    runWorkoutMutation((repository) =>
      updateActiveSetDraft({ repository, input }),
    ), [runWorkoutMutation]);

  const updateWorkoutWarmupDraft = useCallback((input: UpdateWarmupDraftInput) =>
    runWorkoutMutation((repository) =>
      updateWarmupDraft({ repository, input }),
    ), [runWorkoutMutation]);

  const addWorkoutWarmup = useCallback((input: AddWarmupInput) =>
    runWorkoutMutation(
      (repository) => addWarmup({ repository, input }),
      input.setId,
    ) as Promise<CommittedWorkoutMutationResult>,
  [runWorkoutMutation]);

  const addWorkoutWorkingSet = useCallback((input: AddWorkingSetInput) =>
    runWorkoutMutation(
      (repository) => addWorkingSet({ repository, input }),
      input.setId,
    ) as Promise<CommittedWorkoutMutationResult>,
  [runWorkoutMutation]);

  const addWorkoutExercise = useCallback(async (input: AddExerciseInput) => {
    const services = requireServices();
    let result: AddExerciseResult;
    try {
      result = await addExercise({
        repository: services.workoutRepository,
        input,
      });
    } catch (error) {
      const failure = mapWorkoutMutationFailure(error);
      setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
        mutationFailure: failure,
      }));
      throw error;
    }
    workoutRefreshGenerationRef.current += 1;
    try {
      setState(await trustedRead(services));
    } catch {
      setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
        workoutRefreshGeneration: workoutRefreshGenerationRef.current,
      }));
    }
    return result;
  }, [requireServices, trustedRead]);

  const replaceWorkoutExercise = useCallback((input: ReplaceExerciseInput) =>
    runExerciseEdit(input, (repository) => replaceExercise({
      repository,
      input,
    })),
  [runExerciseEdit]);

  const removeWorkoutExercise = useCallback((input: RemoveExerciseInput) =>
    runExerciseEdit(input, (repository) => removeExercise({
      repository,
      input,
    })),
  [runExerciseEdit]);

  const reorderWorkoutExercises = useCallback(async (
    input: ReorderExercisesInput,
  ): Promise<ActiveWorkoutView | CommittedExerciseReorderRefreshFailure> => {
    const services = requireServices();
    let committed: ReorderExercisesResult;
    try {
      committed = await reorderExercises({
        repository: services.workoutRepository,
        input,
      });
    } catch (error) {
      const failure = mapWorkoutMutationFailure(error);
      setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
        mutationFailure: failure,
      }));
      throw error;
    }
    reconcileAfterCommit(services);

    try {
      const activeView = await services.workoutRepository.getActiveWorkout(
        input.sessionId,
      );
      workoutRefreshGenerationRef.current += 1;
      setState(await trustedRead(services));
      return activeView;
    } catch {
      workoutRefreshGenerationRef.current += 1;
      setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
        workoutRefreshGeneration: workoutRefreshGenerationRef.current,
      }));
      return Object.freeze({
        outcome: "committed_refresh_failed",
        sessionId: committed.sessionId,
        sessionRevision: committed.sessionRevision,
      });
    }
  }, [reconcileAfterCommit, requireServices, trustedRead]);

  const removeWorkoutWarmup = useCallback((input: RemoveWarmupInput) =>
    runWorkoutRemoval(input, (repository) => removeWarmup({ repository, input })),
  [runWorkoutRemoval]);

  const removeWorkoutWorkingSet = useCallback((input: RemoveWorkingSetInput) =>
    runWorkoutRemoval(input, (repository) => removeWorkingSet({ repository, input })),
  [runWorkoutRemoval]);

  const reviseWorkoutCompletedSet = useCallback((
    input: ReviseCompletedSetInput,
  ) => runWorkoutMutation(
    (repository) => reviseCompletedSet({ repository, input }),
    input.setId,
  ) as Promise<CommittedWorkoutMutationResult>, [runWorkoutMutation]);

  const completeWorkoutWarmup = useCallback((input: CompleteWarmupInput) =>
    runWorkoutMutation((repository) =>
      completeWarmup({ repository, input }),
    ), [runWorkoutMutation]);

  const skipWorkoutWarmup = useCallback((input: SkipWarmupInput) =>
    runWorkoutMutation((repository) => skipWarmup({ repository, input })),
  [runWorkoutMutation]);

  const skipWorkoutWorkingSet = useCallback((input: SkipWorkingSetInput) =>
    runWorkoutMutation((repository) => skipWorkingSet({ repository, input })),
  [runWorkoutMutation]);

  const completeWorkoutSet = useCallback((input: CompleteSetInput) => {
    const services = requireServices();
    return completeSet({
      repository: services.workoutRepository,
      haptics: createExpoHapticsAdapter(),
      invalidate: async () => {
        try {
          setState(await trustedRead(services));
        } catch {
          setState((current) => ({
            ...current,
            actionFailure: {
              code: "workout_action_failed",
              correlationCode: "GT-ACTION01",
            },
          }));
        }
      },
      drainEffects: async () => {
        reconcileAfterCommit(services);
      },
      input,
    });
  }, [reconcileAfterCommit, requireServices, trustedRead]);

  const updateWorkoutSessionExerciseDefaultRest = useCallback(
    async (input: UpdateSessionExerciseDefaultRestInput) => {
      const result = await runWorkoutMutation(
        (repository) => {
          if (repository.updateSessionExerciseDefaultRest === undefined) {
            throw new Error("session_exercise_default_rest_unavailable");
          }
          return repository.updateSessionExerciseDefaultRest(input);
        },
      );
      return result as ActiveWorkoutView;
    },
    [runWorkoutMutation],
  );

  const readWorkoutPreferences = useCallback((planId: string) =>
    requireServices().workoutPreferenceRepository.read(planId), [requireServices]);

  const setWorkoutPreferences = useCallback(async (input: WorkoutPreferenceWrite) => {
    const services = requireServices();
    const saved = await services.workoutPreferenceRepository.write(input);
    await services.lifecycle.trigger("post_commit").catch(() => undefined);
    return saved;
  }, [requireServices]);

  const undoWorkoutSet = useCallback((input: UndoCompletedSetInput) => {
    const services = requireServices();
    return undoCompletedSet({
      repository: services.workoutRepository,
      input,
    }).then(async (result) => {
      if (result.outcome === "undone") {
        reconcileAfterCommit(services);
        try {
          setState(await trustedRead(services));
        } catch {
          setState((current) => ({
            ...current,
            actionFailure: {
              code: "workout_action_failed",
              correlationCode: "GT-ACTION01",
            },
          }));
        }
      }
      return result;
    });
  }, [reconcileAfterCommit, requireServices, trustedRead]);

  const runOutcomeMutation = useCallback(async <Result,>(
    mutation: (
      repository: ReturnType<typeof createWorkoutOutcomeRepository>,
    ) => Promise<Result>,
  ): Promise<Result> => {
    const services = requireServices();
    const result = await mutation(services.outcomeRepository);
    await services.lifecycle.trigger("post_commit").catch(() => undefined);
    workoutRefreshGenerationRef.current += 1;
    try {
      setState(await trustedRead(services));
    } catch {
      setState((current) => ({
        ...current,
        actionFailure: {
          code: "workout_action_failed",
          correlationCode: "GT-ACTION01",
        },
        workoutRefreshGeneration: workoutRefreshGenerationRef.current,
      }));
    }
    return result;
  }, [requireServices, trustedRead]);

  const finishWorkoutCompleted = useCallback(async (
    input: FinishCompletedInput,
  ) => {
    const result = await runOutcomeMutation((repository) =>
      finishCompleted({ repository, input })
    );
    await requireServices().schedules.completeScheduledSession(
      input.sessionId,
    ).catch(() => null);
    return result;
  }, [requireServices, runOutcomeMutation]);

  const previewCompletedPlanWriteBack = useCallback((sessionId: string) =>
    previewCompletedWorkoutPlanWriteBack({
      port: requireServices().ownedPlans,
      sessionId,
    }),
  [requireServices]);

  const applyCompletedPlanWriteBack = useCallback(async (
    state: CompletedWorkoutPlanWriteBackChoiceState,
  ) => {
    const services = requireServices();
    let retryState: CompletedWorkoutPlanWriteBackState = state;
    if (state.state === "save_failed" && state.failure.kind === "stale") {
      try {
        retryState = await previewCompletedWorkoutPlanWriteBack({
          port: services.ownedPlans,
          sessionId: state.preview.sourceSessionId,
        });
      } catch {
        return {
          state: "save_failed",
          preview: state.preview,
          failure: {
            kind: "failed",
            code: "session_write_back_preview_failed",
          },
        } satisfies CompletedWorkoutPlanWriteBackState;
      }
    }
    if (retryState.state !== "awaiting_choice"
      && retryState.state !== "save_failed") {
      return retryState;
    }
    let result: CompletedWorkoutPlanWriteBackState;
    try {
      result = await runWorkoutMutationWithTestFailure(
        "plan_write_back",
        () => applyCompletedWorkoutPlanWriteBack({
          port: services.ownedPlans,
          state: beginCompletedWorkoutPlanWriteBack(retryState),
        }),
      );
    } catch {
      return {
        state: "save_failed",
        preview: retryState.preview,
        failure: {
          kind: "failed",
          code: "session_write_back_failed",
        },
      } satisfies CompletedWorkoutPlanWriteBackState;
    }
    if (result.state === "completed" && result.disposition === "saved") {
      workoutRefreshGenerationRef.current += 1;
      try {
        setState(await trustedRead(services));
      } catch {
        setState((current) => ({
          ...current,
          actionFailure: {
            code: "workout_action_failed",
            correlationCode: "GT-ACTION01",
          },
          workoutRefreshGeneration: workoutRefreshGenerationRef.current,
        }));
      }
    }
    return result;
  }, [requireServices, trustedRead]);

  const keepCompletedPlanAsIs = useCallback((
    state: CompletedWorkoutPlanWriteBackChoiceState,
  ) => keepCompletedWorkoutPlanAsIs(state), []);

  const finishWorkoutPartial = useCallback((input: FinishPartialInput) =>
    runOutcomeMutation((repository) =>
      finishPartial({ repository, input }),
    ), [runOutcomeMutation]);

  const finishZeroSetWorkout = useCallback((input: SaveZeroSetInput) =>
    runOutcomeMutation((repository) =>
      saveZeroSetWorkout({ repository, input }),
    ), [runOutcomeMutation]);

  const discardActiveWorkout = useCallback((input: DiscardWorkoutInput) =>
    runOutcomeMutation((repository) =>
      discardWorkout({ repository, input }),
    ), [runOutcomeMutation]);

  const finishStarterSwitchWorkout = useCallback(async (input: Readonly<{
    sessionId: string;
    sessionRevision: number;
  }>) => {
    await finishWorkoutPartial({
      sessionId: input.sessionId,
      expectedSessionRevision: input.sessionRevision,
      confirmation: PARTIAL_CONFIRMATION,
      endedAtMs: dependencies.nowMs(),
    });
  }, [dependencies, finishWorkoutPartial]);

  const discardStarterSwitchWorkout = useCallback(async (input: Readonly<{
    sessionId: string;
    sessionRevision: number;
  }>) => {
    await discardActiveWorkout({
      sessionId: input.sessionId,
      expectedSessionRevision: input.sessionRevision,
      confirmation: DISCARD_CONFIRMATION,
      endedAtMs: dependencies.nowMs(),
    });
  }, [dependencies, discardActiveWorkout]);

  const skipActiveExercise = useCallback((input: SkipExerciseInput) =>
    runOutcomeMutation((repository) =>
      skipExercise({ repository, input }),
    ), [runOutcomeMutation]);

  const resumeSavedPartial = useCallback((input: ResumePartialWorkoutInput) =>
    runOutcomeMutation((repository) =>
      resumePartialWorkout({ repository, input }),
    ), [runOutcomeMutation]);

  const recordWorkoutEffort = useCallback((input: Readonly<{
    sessionId: string;
    sessionExerciseId: string;
    expectedExerciseRevision: number;
    effort: ExerciseEffort;
    recordedAtMs: number;
  }>) => runOutcomeMutation((repository) =>
    recordExerciseEffort({ repository, input }),
  ), [runOutcomeMutation]);

  const acceptWorkoutRecommendation = useCallback(
    (recommendationId: string) => runOutcomeMutation((repository) =>
      acceptRecommendation({
        repository,
        input: {
          recommendationId,
          decidedAtMs: dependencies.nowMs(),
        },
      }),
    ),
    [dependencies, runOutcomeMutation],
  );

  const keepWorkoutTarget = useCallback(
    (recommendationId: string) => runOutcomeMutation((repository) =>
      keepCurrentTarget({
        repository,
        input: {
          recommendationId,
          decidedAtMs: dependencies.nowMs(),
        },
      }),
    ),
    [dependencies, runOutcomeMutation],
  );

  const value = useMemo<RuntimeValue>(() => ({
    ...state,
    actOnToday: (action) => requireServices().schedules.actOnToday(action),
    acceptRecommendation: acceptWorkoutRecommendation,
    activateAcceptedStarterPlan: activateAcceptedStarter,
    createStarterEditableCopy,
    activatePlan,
    addExercise: addWorkoutExercise,
    addWarmup: addWorkoutWarmup,
    addWorkingSet: addWorkoutWorkingSet,
    adjustRest: adjustWorkoutRest,
    completeSet: completeWorkoutSet,
    updateSessionExerciseDefaultRest: updateWorkoutSessionExerciseDefaultRest,
    readWorkoutPreferences,
    setWorkoutPreferences,
    completeWarmup: completeWorkoutWarmup,
    collectPhase14SourceStateProof: () => {
      if (!phase14NativeRecoveryFixtureEnabled()) {
        return Promise.reject(new Error("phase14_source_state_proof_unavailable"));
      }
      const {
        CryptoDigestAlgorithm,
        digestStringAsync,
      } = require("expo-crypto") as typeof import("expo-crypto");
      return collectPhase14SourceStateProofFromKernel({
        kernel: requireServices().kernel,
        sha256: (value) =>
          digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
      });
    },
    createSecureBackup: (input) =>
      requireServices().backupCommands.createSecureBackup(input),
    connectAutomaticBackup: () => runAutomaticBackupCommand((runtime) => runtime.connect()),
    deferAutomaticRestore: () => runAutomaticBackupCommand((runtime) => runtime.deferRestore()),
    cancelAutomaticBackupCheck: () => runAutomaticBackupCommand((runtime) => runtime.cancelChecking()),
    checkAutomaticBackupAgain: () => runAutomaticBackupCommand((runtime) => runtime.checkAgain()),
    continueAutomaticRestore: () => runAutomaticBackupCommand((runtime) => runtime.continueRestore()),
    reviewAutomaticRecovery: (input) => runAutomaticBackupCommand((runtime) => runtime.prepareRecovery(input)),
    commitAutomaticRecovery: (input) => runAutomaticBackupCommand((runtime) => runtime.commitRecovery(input)),
    cancelAutomaticRecovery: (attemptId) => runAutomaticBackupCommand((runtime) => runtime.cancelRecovery(attemptId)),
    finishAutomaticBackupSetup: () => runAutomaticBackupCommand((runtime) => runtime.finishSetup()),
    requestAutomaticBackupNow: () => runAutomaticBackupCommand((runtime) => runtime.backupNow()),
    retryAutomaticBackup: () => runAutomaticBackupCommand((runtime) => runtime.retryBackup()),
    useAutomaticBackupCellularThisTime: () => runAutomaticBackupCommand((runtime) => runtime.useCellularThisTime()),
    dismissAutomaticBackupCellularConfirmation: () => runAutomaticBackupCommand((runtime) => runtime.dismissCellularConfirmation()),
    setAutomaticBackupDataUsePolicy: (policy) => runAutomaticBackupCommand((runtime) => runtime.setDataUsePolicy(policy)),
    takeOverAutomaticBackup: () => runAutomaticBackupCommand((runtime) => runtime.takeOver()),
    disconnectAutomaticBackup: () => runAutomaticBackupCommand((runtime) => runtime.disconnect()),
    deleteAutomaticCloudBackup: () => runAutomaticBackupCommand((runtime) => runtime.deleteCloudBackup()),
    finishDeletingAutomaticCloudBackup: () => runAutomaticBackupCommand((runtime) => runtime.finishDeletingCloudBackup()),
    startNewAutomaticCloudBackup: () => runAutomaticBackupCommand((runtime) => runtime.startNewCloudBackup()),
    createCsvExport: async () => {
      const services = requireServices();
      return services.csvFiles.writeCsv(
        await services.csvExportRepository.serialize(),
      );
    },
    discardSecureBackup: (archive) =>
      requireServices().backupCommands.discardSecureBackup(archive),
    discardCsvExport: (handle) => requireServices().csvFiles.discardCsv(handle),
    preflightSecureRestore: (input) =>
      requireServices().restoreCommands.preflightSecureRestore(input),
    preflightSecureMerge: (input) =>
      requireServices().mergeCommands.preflightSecureMerge(input),
    commitSecureMerge: async (input) => {
      const services = requireServices();
      await services.mergeCommands.commitSecureMerge(input);
      const result = services.reconcileRestore === undefined
        ? { outcome: "retryable_failure" as const }
        : await services.reconcileRestore();
      return {
        state: result.outcome === "rebuilt" || result.outcome === "already_ready"
          ? "ready" as const
          : "rebuild_pending" as const,
      };
    },
    invalidateSecureMergePreflight: (token) =>
      requireServices().mergeCommands.invalidateSecureMergePreflight(token),
    invalidateSecureRestorePreflight: (token) =>
      requireServices().restoreCommands.invalidateSecureRestorePreflight(token),
    commitSecureRestore: async (input) => {
      const services = requireServices();
      await services.restoreCommands.commitSecureRestore(input);
      const result = services.reconcileRestore === undefined
        ? { outcome: "retryable_failure" as const }
        : await services.reconcileRestore();
      return {
        state: result.outcome === "rebuilt" || result.outcome === "already_ready"
          ? "ready" as const
          : "rebuild_pending" as const,
      };
    },
    createCustomExercise: createRuntimeCustomExercise,
    createCustomExerciseId: (kind) =>
      requireServices().ownedPlans.createId(kind),
    editCustomExercise: editRuntimeCustomExercise,
    loadCustomExercise: loadRuntimeCustomExercise,
    loadCustomExerciseMigration: loadRuntimeCustomExerciseMigration,
    migrateCustomExerciseMetricProfile:
      migrateRuntimeCustomExerciseProfile,
    previewCustomExerciseArchive:
      previewRuntimeCustomExerciseArchive,
    setCustomExerciseArchived: setRuntimeCustomExerciseArchived,
    setCustomExerciseFavorite: setRuntimeCustomExerciseFavorite,
    setCustomExerciseHidden: setRuntimeCustomExerciseHidden,
    createOwnedPlanDraft: createOwnedDraft,
    createOwnedPlanId: (kind) => requireServices().ownedPlans.createId(kind),
    discardWorkout: discardActiveWorkout,
    discardStarterSwitchWorkout,
    expireRest: expireWorkoutRest,
    exerciseNotificationExpiry,
    applyCompletedWorkoutPlanWriteBack: applyCompletedPlanWriteBack,
    finishCompleted: finishWorkoutCompleted,
    finishPartial: finishWorkoutPartial,
    finishStarterSwitchWorkout,
    getActiveWorkout,
    getSessionDetail,
    loadHistoryCorrectionSession,
    listAvailableCorrectionExercises,
    correctHistorySession: correctRuntimeHistorySession,
    removeHistorySession: removeRuntimeHistorySession,
    restoreHistorySession: restoreRuntimeHistorySession,
    loadCalendarMonth,
    listRemovedHistorySessions,
    loadExerciseMetricHistory,
    loadProgress,
    keepCurrentTarget: keepWorkoutTarget,
    keepCompletedWorkoutPlanAsIs: keepCompletedPlanAsIs,
    chooseTimeZone: (choice, detectedDeviceTimeZone) =>
      requireServices().schedules.chooseTimeZone(
        choice,
        detectedDeviceTimeZone,
      ),
    completeScheduledSession: (sessionId) =>
      requireServices().schedules.completeScheduledSession(sessionId),
    consumeDateOverride: (localDate) =>
      requireServices().schedules.consumeDateOverride(localDate),
    listLibraryRecentExercises,
    listOwnedPlanExercises: () =>
      requireServices().ownedPlans.listExercises(),
    loadLibrary,
    loadOwnedPlan: (planId) => requireServices().ownedPlans.loadPlan(planId),
    loadSchedule: (planId) => requireServices().schedules.loadSchedule(planId),
    loadToday: (instantMs) => requireServices().schedules.loadToday(instantMs),
    markWeekdayMissed: (localDate) =>
      requireServices().schedules.markWeekdayMissed(localDate),
    previewOwnedPlanDayRemoval: previewOwnedDayRemoval,
    previewOwnedPlanExerciseReplacement: previewOwnedExerciseReplacement,
    previewCompletedWorkoutPlanWriteBack: previewCompletedPlanWriteBack,
    loadStarterActivationPreview,
    loadStarterPlan,
    loadStarterTemplateUpdate,
    openRestNotificationSettings,
    readRestAlertPreferences,
    pauseRest: pauseWorkoutRest,
    requestRestNotificationPermission,
    setRestAlertPreferences,
    recordTrainAnyway: (input) =>
      requireServices().schedules.recordTrainAnyway(input),
    recordExerciseEffort: recordWorkoutEffort,
    replaceExercise: replaceWorkoutExercise,
    removeExercise: removeWorkoutExercise,
    reorderExercises: reorderWorkoutExercises,
    removeWarmup: removeWorkoutWarmup,
    removeWorkingSet: removeWorkoutWorkingSet,
    reviseCompletedSet: reviseWorkoutCompletedSet,
    refresh,
    retryRestoreRebuild: async () => {
      const reconcileRestore = requireServices().reconcileRestore;
      if (reconcileRestore === undefined) {
        return { state: "rebuild_pending" as const };
      }
      const result = await reconcileRestore();
      return {
        state: result.outcome === "rebuilt" || result.outcome === "already_ready"
          ? "ready" as const
          : "rebuild_pending" as const,
      };
    },
    resumeRest: resumeWorkoutRest,
    resumePartialWorkout: resumeSavedPartial,
    retry: () => {
      void initialize();
    },
    saveZeroSetWorkout: finishZeroSetWorkout,
    shareSecureBackup: async (archive) => {
      const services = requireServices();
      await services.backupCommands.shareSecureBackup(archive);
      const latestBackup: RuntimeBackupMetadata = Object.freeze({
        archiveId: archive.archiveId,
        createdAtMs: archive.createdAtMs,
        displayName: archive.displayName,
      });
      await writeLatestBackupMetadata(
        services.kernel,
        latestBackup,
        dependencies.nowMs(),
      ).catch(() => undefined);
      setState((current) => ({
        ...current,
        latestBackup,
      }));
    },
    shareCsvExport: (handle) => requireServices().csvFiles.shareCsv(handle),
    saveOwnedPlan: saveOwnedDraft,
    saveSchedule: (input) => requireServices().schedules.saveSchedule(input),
    setDateOverride: (input) =>
      requireServices().schedules.setDateOverride(input),
    searchLibraryExercises,
    setLibraryExerciseFavorite,
    setLibrarySection,
    skipExercise: skipActiveExercise,
    skipRest: skipWorkoutRest,
    skipWorkingSet: skipWorkoutWorkingSet,
    skipWarmup: skipWorkoutWarmup,
    startManualRest: startWorkoutRest,
    startEmptyWorkout,
    startPlanDay,
    startSelectedStrengthOccurrence,
    createStarterTemplateUpdateCopy,
    duplicateOwnedPlan: duplicateOwnedDraft,
    archiveOwnedPlan: archiveOwnedDraft,
    restoreOwnedPlan: restoreOwnedDraft,
    removeOwnedPlanDayWithImpact: removeOwnedDayWithImpact,
    replaceOwnedPlanExercise: replaceOwnedExercise,
    undoCompletedSet: undoWorkoutSet,
    updateActiveSetDraft: updateDraft,
    updateWarmupDraft: updateWorkoutWarmupDraft,
  }), [
    acceptWorkoutRecommendation,
    activateAcceptedStarter,
    createStarterEditableCopy,
    activatePlan,
    addWorkoutExercise,
    addWorkoutWarmup,
    addWorkoutWorkingSet,
    adjustWorkoutRest,
    completeWorkoutSet,
    readWorkoutPreferences,
    setWorkoutPreferences,
    completeWorkoutWarmup,
    requireServices,
    createRuntimeCustomExercise,
    runAutomaticBackupCommand,
    editRuntimeCustomExercise,
    createOwnedDraft,
    discardActiveWorkout,
    discardStarterSwitchWorkout,
    expireWorkoutRest,
    exerciseNotificationExpiry,
    finishWorkoutCompleted,
    finishWorkoutPartial,
    finishStarterSwitchWorkout,
    finishZeroSetWorkout,
    getActiveWorkout,
    getSessionDetail,
    loadHistoryCorrectionSession,
    listAvailableCorrectionExercises,
    correctRuntimeHistorySession,
    removeRuntimeHistorySession,
    restoreRuntimeHistorySession,
    loadCalendarMonth,
    listRemovedHistorySessions,
    loadExerciseMetricHistory,
    loadProgress,
    initialize,
    keepWorkoutTarget,
    listLibraryRecentExercises,
    loadLibrary,
    loadRuntimeCustomExercise,
    loadRuntimeCustomExerciseMigration,
    loadStarterActivationPreview,
    loadStarterPlan,
    loadStarterTemplateUpdate,
    openRestNotificationSettings,
    readRestAlertPreferences,
    pauseWorkoutRest,
    requestRestNotificationPermission,
    setRestAlertPreferences,
    recordWorkoutEffort,
    replaceWorkoutExercise,
    removeWorkoutExercise,
    removeWorkoutWarmup,
    removeWorkoutWorkingSet,
    reviseWorkoutCompletedSet,
    refresh,
    runExerciseEdit,
    runWorkoutRemoval,
    resumeWorkoutRest,
    resumeSavedPartial,
    searchLibraryExercises,
    saveOwnedDraft,
    setRuntimeCustomExerciseArchived,
    setRuntimeCustomExerciseFavorite,
    setRuntimeCustomExerciseHidden,
    setLibraryExerciseFavorite,
    setLibrarySection,
    skipActiveExercise,
    skipWorkoutRest,
    skipWorkoutWorkingSet,
    skipWorkoutWarmup,
    startEmptyWorkout,
    startWorkoutRest,
    startPlanDay,
    createStarterTemplateUpdateCopy,
    migrateRuntimeCustomExerciseProfile,
    previewRuntimeCustomExerciseArchive,
    duplicateOwnedDraft,
    archiveOwnedDraft,
    restoreOwnedDraft,
    previewOwnedDayRemoval,
    previewOwnedExerciseReplacement,
    removeOwnedDayWithImpact,
    replaceOwnedExercise,
    state,
    undoWorkoutSet,
    updateDraft,
    updateWorkoutWarmupDraft,
  ]);

  return (
    <WorkoutAppRuntimeContext.Provider value={value}>
      {children}
    </WorkoutAppRuntimeContext.Provider>
  );
}

export function useWorkoutAppRuntime(): RuntimeValue {
  const value = useContext(WorkoutAppRuntimeContext);
  if (value === null) {
    throw new Error(
      "useWorkoutAppRuntime must be used within WorkoutAppRuntimeProvider",
    );
  }
  return value;
}
