import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDeviceTimeZone } from "../ui/time/useDeviceTimeZone";

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
  ProgressRecommendationReview,
  ProgressProjectionDiagnostic,
  ProgressProjectionFreshness,
} from "../domains/progress";
import type {
  ProgressDashboardProjection,
  ProgressRefreshMetadata,
  ProgressSport,
} from "../domains/progress/contracts";
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
  createCustomCopy,
  createCustomExercise as createCustomExerciseCommand,
  editCustomExercise as editCustomExerciseCommand,
  previewCustomExerciseArchive,
  restoreCustomExercise,
  setExerciseHidden,
  setExerciseFavorite as setExerciseFavoriteCommand,
  type CreateCustomExerciseInput,
  type CreateCustomCopyInput,
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
  type RecommendationDecision,
  type RecommendationDecisionInput,
  type ExerciseEffort,
  type ProgressionRepository,
  type RecommendationDecisionResult,
} from "../domains/progression";
import {
  canonicalBodyweightRequestPayload,
  type BodyweightCommand,
  type BodyweightEntryState,
} from "../domains/bodyweight/contracts";
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
  PlannedStrengthOccurrenceDetail,
  SelectedStrengthOccurrence,
  SessionDetail,
  TodayView,
  WorkoutOutcomeRepository,
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
  parseImportedActivityLocalId,
  projectImportedActivityDetail,
  type ImportedActivityDetailReadResult,
} from "../domains/activities/activityDetails";
import type {
  ConfirmGarminImportInput,
  GarminImportResult,
  GarminRevisionDecisionInput,
  GarminRevisionDecisionResult,
  GarminRevisionReview,
} from "../domains/activities/importCommands";
import {
  resolveGarminImportRevision,
} from "../domains/activities/importCommands";
import {
  canonicalJson,
} from "../domains/activities/importContracts";
import {
  confirmRunningActivityMatch,
  prepareRunningActivityMatchInput,
  queryRunningActivityMatchCandidates,
  type RunningActivityMatchCandidate,
  type RunningActivityMatchInput,
  type RunningActivityMatchReadResult,
  type RunningActivityMatchResult,
} from "../domains/running/activityMatchCommands";
import {
  createExpoHapticsAdapter,
} from "../platform/haptics/expoHapticsAdapter";
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
  createRunningActivityMatchRepository,
} from "../platform/sqlite/repositories/runningActivityMatchRepository";
import {
  createImportedActivityRepository,
} from "../platform/sqlite/repositories/importedActivityRepository";
import {
  createGarminSyncSummaryRepository,
} from "../platform/sqlite/repositories/garminSyncSummaryRepository";
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
  type SqliteSnapshotKernel,
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
  collectPhase20QualityWorkloadProof,
  type Phase20QualityWorkloadProof,
} from "../testing/phase20QualityWorkload";
import {
  prepareV12NativeAcceptanceProductCase as prepareV12NativeAcceptanceProductCaseFromKernel,
  prepareV12NativeAcceptanceProductionOperation,
  readV12NativeAcceptanceReceipt as readV12NativeAcceptanceReceiptFromKernel,
  v12NativeAcceptanceProductRequestId,
  type V12NativeAcceptancePreparedProductCase,
  type V12NativeAcceptanceReadbacks,
  type V12NativeAcceptanceRequest,
} from "../testing/v12NativeAcceptanceExecutor";
import {
  createPhase17FixtureProtocol,
  type Phase17Fixture,
  type Phase17SourceProbe,
} from "./phase17NativeFixture";
import {
  createPhase17ActionEnvelopeSource,
  createPhase17FixtureSetupIdentityFactory,
  phase17ActionEnvelopePlan,
} from "./phase17ActionEnvelope";
import {
  cleanupPhase17FamilyAManifest,
  createPhase17FamilyACleanupManifest,
  materializePhase17FamilyACleanupManifest,
} from "./phase17FamilyACleanup";
import {
  assertPhase17FamilyARegistry,
  isPhase17FamilyACaseId,
  phase17FamilyASelectorSchema,
} from "./phase17FamilyAFixture";
import {
  assertPhase17FamilyBRegistry,
  createPhase17FamilyBFixtureDriver,
  createPhase17FamilyFixtureAdapter,
} from "./phase17FamilyBFixture";
import {
  assertPhase17FamilyCRegistry,
  createPhase17FamilyCFixtureDriver,
} from "./phase17FamilyCFixture";
import {
  createRunningPlanRuntimePort,
  type RunningPlanRuntimePort,
  type RunningTargetMutationInput,
  type RunningTargetMutationResult,
} from "./runningPlanRuntime";
import type { RunningPlanAggregate } from "../domains/running/contracts";
import {
  createCalendarActivityReadPort,
  createCalendarRangeReadPort,
  createCalendarSessionReadPort,
  createCalendarStrengthOccurrenceReadPort,
  type CalendarActivityReadPort,
  type CalendarRangeReadPort,
  type CalendarSessionReadPort,
  type CalendarStrengthOccurrenceReadPort,
} from "./calendarReadPorts";
import {
  createTrainingFoundationRuntimePort,
  type TrainingFoundationRuntimePort,
} from "./trainingFoundationRuntime";
import type {
  TrainingCalendarRange,
} from "../platform/sqlite/repositories/trainingCalendarRepository";
import { PHASE17_CASE_ACTION_CONTRACTS } from "../testing/contracts/phase17LibraryRunning.contract";
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
import type {
  GarminImportApplicationPort,
} from "./garminImportRuntime";
import {
  readCustomExerciseDetail,
  readCustomExerciseMigration,
  type CustomExerciseRuntimeDetail,
  type CustomExerciseRuntimeMigration,
} from "./customExerciseRuntimeReadPort";
import {
  createLibrarySectionPreferencePort,
  type LibraryRuntimeSection,
  type LibraryRuntimeSectionPreference,
} from "./librarySectionPreferencePort";
import {
  readLibraryRuntimeSnapshot,
  type LibraryRuntimePlanSummary,
  type LibraryRuntimeSnapshot,
  type LibraryRuntimeStarterPlanSummary,
} from "./libraryRuntimeReadPort";
import { createLibraryPlanDeletionPort } from "../platform/sqlite/repositories/libraryPlanDeletionRepository";
import type { LibraryPlanDeletionPort } from "../domains/library/planDeletion";
export {
  createLibrarySectionPreferencePort,
  type LibraryRuntimeSection,
  type LibraryRuntimeSectionPreference,
  type LibrarySectionPreferencePort,
} from "./librarySectionPreferencePort";
export {
  LIBRARY_ACCESSIBILITY_RECOVERY_PROFILE,
  LIBRARY_ACTION_SHEET_CONFIGURATION,
  readLibraryRuntimeSnapshot,
  type LibraryRuntimePlanSummary,
  type LibraryRuntimeSnapshot,
  type LibraryRuntimeStarterPlanSummary,
} from "./libraryRuntimeReadPort";
export {
  createCustomExerciseRuntimeReadPort,
  type CustomExerciseRuntimeDetail,
  type CustomExerciseRuntimeMigration,
} from "./customExerciseRuntimeReadPort";

const DATABASE_NAME = "gym-tracker.db";

/** Production kernels always expose readSnapshot. The narrow test fallback
 * keeps legacy in-memory runtime doubles usable without ever exposing storage
 * to the Progress runtime port. */
function progressSnapshotKernel(kernel: SqliteKernel): SqliteSnapshotKernel {
  if (kernel.readSnapshot !== undefined) {
    return kernel as SqliteSnapshotKernel;
  }
  return Object.freeze({
    ...kernel,
    readSnapshot(query: Parameters<SqliteSnapshotKernel["readSnapshot"]>[0]) {
      return query({ queryAll: kernel.queryAll.bind(kernel) });
    },
  }) as SqliteSnapshotKernel;
}
const LATEST_BACKUP_METADATA_SETTING_KEY = "backup.latest";
const PHASE17_ACTION_ENVELOPE_SETTING_KEY = "development-test.phase17.action-envelope.v1";
const phase17FixtureActionReceiptId = (caseId: string, fixtureToken: string) => `phase17:${caseId}:${fixtureToken.slice("phase17:".length)}:action`;

export type RuntimeSecureBackupArchive = SecureBackupArchiveHandle;
export type RuntimeCsvExport = CsvExportHandle;

export type ProgressBodyweightEntry = Pick<
  BodyweightEntryState,
  "entryId" | "revision" | "localDate" | "grams"
>;

export type ProgressBodyweightSaveInput = Readonly<{
  requestId: string;
  entryId: string;
  expectedRevision: number;
  localDate: string;
  grams: number;
}>;
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

export type GarminRevisionReviewDetail = Readonly<{
  activityId: string;
  acceptedRevision: number;
  proposedRevision: number;
  expectedProposedSha256: string;
  changedFields: readonly Readonly<{
    field: string;
    accepted: string;
    proposed: string;
  }>[];
}>;

function sameRestAlertPreferences(
  left: RestAlertPreferences,
  right: RestAlertPreferences,
): boolean {
  return left.soundEnabled === right.soundEnabled
    && left.vibrationEnabled === right.vibrationEnabled;
}

function revisionDisplayValue(value: unknown): string {
  if (value === undefined) {
    return "Unavailable";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return canonicalJson(value);
}

type RuntimeValue = RuntimeState & Readonly<{
  nowMs(): number;
  runningPlanRuntime: RunningPlanRuntimePort | null;
  garminImport: GarminImportApplicationPort;
  collectPhase14SourceStateProof(): Promise<Phase14SourceStateProof>;
  collectPhase20QualitySourceProof(): Promise<Phase20QualityWorkloadProof>;
  prepareV12NativeAcceptanceProductCase(request: V12NativeAcceptanceRequest): Promise<V12NativeAcceptancePreparedProductCase>;
  readV12NativeAcceptanceReceipt(request: V12NativeAcceptanceRequest): Promise<V12NativeAcceptanceReadbacks>;
  triggerPhase20ProgressRebuild(): Promise<void>;
  collectPhase17SourceStateProof(): Promise<Phase14SourceStateProof>;
  setupPhase17Fixture(caseId: string): Promise<Phase17Fixture>;
  probePhase17Fixture(input: Readonly<{ caseId: string; fixtureToken: string; sourceTable: string }>): Promise<Phase17SourceProbe>;
  cleanupPhase17Fixture(input: Readonly<{ caseId: string; fixtureToken: string }>): Promise<Readonly<{ caseId: string; fixtureToken: string; baselineDigest: string; verdict: "restored" }>>;
  hydratePhase17ActionEnvelopes(input: Readonly<{ caseId: string; fixtureToken: string }>): Promise<boolean>;
  createPhase17ActionRequestId(label: string, productionRequestId: string): Promise<string>;
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
  expireRest(input: RestRevisionInput & Readonly<{
    foregroundCountdownTone?: true;
  }>): Promise<RestCommandResult>;
  exerciseNotificationExpiry(
    mode: NotificationExpiryExerciseMode,
  ): Promise<NotificationExpiryExerciseCode>;
  getActiveWorkout(sessionId: string): Promise<WorkoutSessionView>;
  getSessionDetail(sessionId: string): Promise<SessionDetail>;
  getSessionDetailAtRevision(sessionId: string, sourceRevision: number): Promise<SessionDetail>;
  getCalendarSessionDetail(sessionId: string): Promise<SessionDetail | null>;
  loadGarminRevisionReview(activityId: string): Promise<GarminRevisionReviewDetail | null>;
  listGarminRevisionReviews(): Promise<readonly GarminRevisionReview[]>;
  resolveGarminRevision(input: GarminRevisionDecisionInput): Promise<GarminRevisionDecisionResult>;
  loadImportedActivityDetail(activityId: string, expectedSourceRevision?: number): Promise<ImportedActivityDetailReadResult>;
  loadRunningActivityMatch(activityId: string): Promise<RunningActivityMatchReadResult>;
  confirmActivityMatch(candidate: RunningActivityMatchCandidate): Promise<RunningActivityMatchResult>;
  unmatchActivityMatch(candidate: RunningActivityMatchCandidate): Promise<RunningActivityMatchResult>;
  reassignActivityMatch(input: Readonly<{
    current: RunningActivityMatchCandidate;
    next: RunningActivityMatchCandidate;
  }>): Promise<RunningActivityMatchResult>;
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
  /** Calendar-only source reads delegated to the immutable training foundation port. */
  loadCalendarRange(input: Readonly<{
    startLocalDate: string;
    endLocalDateExclusive: string;
  }>): Promise<TrainingCalendarRange>;
  loadPlannedStrengthOccurrence(
    occurrenceId: string,
  ): Promise<PlannedStrengthOccurrenceDetail | null>;
  listRemovedHistorySessions(): Promise<readonly RemovedHistorySession[]>;
  loadExerciseMetricHistory(
    exerciseId: string,
  ): Promise<ExerciseMetricHistory>;
  loadProgress(input: Readonly<{
    sport?: ProgressSport;
    period: ProgressPeriod;
    nowLocalDate: string;
  }>): Promise<Readonly<{
    period: ProgressPeriod;
    freshness: ProgressProjectionFreshness;
    projection: ProgressPeriodProjection | null;
    sport?: ProgressSport;
    dashboard?: ProgressDashboardProjection | null;
    refresh?: ProgressRefreshMetadata;
    diagnostic?: ProgressProjectionDiagnostic;
    runningTargetSources?: readonly RunningPlanAggregate[];
  }>>;
  progressRunningTargetRuntime: Readonly<{
    createId(kind: string): string;
    loadPlan(planId: string): Promise<RunningPlanAggregate | null>;
    saveRunningTarget(input: RunningTargetMutationInput): Promise<RunningTargetMutationResult>;
  }>;
  progressRecommendationRuntime: Readonly<{
    decide(
      recommendation: ProgressRecommendationReview,
      decision: RecommendationDecision,
    ): Promise<RecommendationDecisionResult>;
  }>;
  progressBodyweightRuntime: Readonly<{
    createId(kind: string): string;
    loadHistory(): Promise<readonly ProgressBodyweightEntry[]>;
    save(input: ProgressBodyweightSaveInput): Promise<readonly ProgressBodyweightEntry[]>;
    delete(entry: ProgressBodyweightEntry, requestId: string): Promise<readonly ProgressBodyweightEntry[]>;
  }>;
  openRestNotificationSettings(): Promise<void>;
  refreshPreciseRestAlarms(): Promise<void>;
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
  retryLibraryLoad(): Promise<LibraryRuntimeSnapshot>;
  deleteLibraryPlan: LibraryPlanDeletionPort["deletePlan"];
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
  createCustomCopy(
    input: Omit<CreateCustomCopyInput, "createdAtMs">,
  ): ReturnType<typeof createCustomCopy>;
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

type RuntimeOutcomeRepository = WorkoutOutcomeRepository
  & ProgressionRepository
  & Pick<ReturnType<typeof createWorkoutOutcomeRepository>, "getCalendarSessionDetail">;

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
  importedActivities: ReturnType<typeof createImportedActivityRepository>;
  garminSyncSummaries: ReturnType<typeof createGarminSyncSummaryRepository>;
  progressRepository: ReturnType<typeof createProgressRepository>;
  runningPlans: RunningPlanRuntimePort;
  kernel: SqliteKernel;
  librarySearchRepository: ReturnType<typeof createLibrarySearchRepository>;
  lifecycle: ReturnType<typeof createWorkoutLifecycle>;
  notifications: RestNotificationPort;
  restAlertPreferenceStore: RestAlertPreferenceStore;
  ownedPlans: ReturnType<typeof createOwnedPlanRuntimePort>;
  schedules: ReturnType<typeof createScheduleRuntimePort>;
  trainingFoundation: TrainingFoundationRuntimePort;
  repository: ReturnType<typeof createPlansWorkoutRepository>;
  restRepository: ReturnType<typeof createRestRepository>;
  runningActivityMatches: ReturnType<typeof createRunningActivityMatchRepository>;
  outcomeRepository: RuntimeOutcomeRepository;
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
  ): RuntimeOutcomeRepository;
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
  randomUUID?(): string;
  prepareRuntime?(input: Readonly<{
    kernel: SqliteKernel;
    starterPlans?: StarterPlanRuntimeCatalog;
  }>): Promise<void>;
  disposeRuntime?(): Promise<void>;
  strictDisposal?: boolean;
  reportDisposalFailure?(error: unknown): void;
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
  ): RuntimeOutcomeRepository;
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
const CalendarRangeReadContext = createContext<CalendarRangeReadPort | null>(null);
const CalendarSessionReadContext = createContext<CalendarSessionReadPort | null>(null);
const CalendarStrengthOccurrenceReadContext = createContext<CalendarStrengthOccurrenceReadPort | null>(null);
const CalendarActivityReadContext = createContext<CalendarActivityReadPort | null>(null);

/** Transient pre-action evidence may cross a devtest route remount. It never
 * authorizes replay: the post-action receipt is still re-read from SQLite. */
const v12NativeAcceptancePreparedProductCases = new Map<
  string,
  V12NativeAcceptancePreparedProductCase
>();

export function createWorkoutAppRuntimeDependencies(
  adapters: WorkoutAppRuntimeAdapters,
  options: Readonly<{ databaseName?: string }> = {},
): WorkoutAppRuntimeDependencies {
  const databaseName = options.databaseName ?? DATABASE_NAME;
  return {
    openKernel: () => adapters.openKernel(databaseName),
    migrate: (kernel) => adapters.runMigrations({
      databaseName,
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

function phase17NativeContractEnabled(): boolean {
  const { default: Constants } = require("expo-constants") as typeof import("expo-constants");
  return Constants.expoConfig?.extra?.buildProfile === "development-test"
    && Constants.expoConfig.extra.nativeContractsEnabled === true
    && Constants.expoConfig.extra.nativeContractSuite === "phase17";
}

function phase20QualitySourceProofEnabled(): boolean {
  const { default: Constants } = require("expo-constants") as typeof import("expo-constants");
  return Constants.expoConfig?.extra?.buildProfile === "development-test"
    && Constants.expoConfig.extra.nativeContractsEnabled === true
    && Constants.expoConfig.extra.nativeContractSuite === "v1.2-acceptance";
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

const productionWorkoutAppRuntimeAdapters: WorkoutAppRuntimeAdapters = {
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
  };

export function createProductionWorkoutAppRuntimeDependencies(
  databaseName = DATABASE_NAME,
): WorkoutAppRuntimeDependencies {
  return createWorkoutAppRuntimeDependencies(
    productionWorkoutAppRuntimeAdapters,
    { databaseName },
  );
}

export const productionWorkoutAppRuntimeDependencies =
  createProductionWorkoutAppRuntimeDependencies();

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
  const displayTimeZone = useDeviceTimeZone();
  const displayTimeZoneRef = useRef(displayTimeZone);
  displayTimeZoneRef.current = displayTimeZone;
  const servicesRef = useRef<RuntimeServices | null>(null);
  const pendingActivityMatchRef = useRef<Readonly<{
    candidateKey: string;
    input: RunningActivityMatchInput;
  }> | null>(null);
  const progressBodyweightCommandsRef = useRef(new Map<string, BodyweightCommand>());
  const phase17FixtureProtocolRef = useRef<ReturnType<typeof createPhase17FixtureProtocol> | null>(null);
  const phase17ActionEnvelopeSourceRef = useRef<ReturnType<typeof createPhase17ActionEnvelopeSource> | null>(null);
  const v12NativeAcceptanceProductRequestRef = useRef<V12NativeAcceptanceRequest | null>(null);
  const runtimeRandomUUID = useCallback(() => {
    if (dependencies.randomUUID !== undefined) return dependencies.randomUUID();
    const { randomUUID } = require("expo-crypto") as typeof import("expo-crypto");
    return randomUUID();
  }, [dependencies]);
  const phase17RequestId = useCallback(async (label: string, productionRequestId: string) => {
    const acceptanceRequest = v12NativeAcceptanceProductRequestRef.current;
    if (acceptanceRequest !== null) {
      return v12NativeAcceptanceProductRequestId(acceptanceRequest, label);
    }
    if (!phase17NativeContractEnabled()) return productionRequestId;
    const source = phase17ActionEnvelopeSourceRef.current;
    if (source === null) throw new Error("phase17_action_envelope_missing");
    const requestId = await source.reserveCached(label);
    if (requestId === null) throw new Error("phase17_action_envelope_missing");
    return requestId;
  }, []);
  const foregroundUnsubscribeRef = useRef<(() => void) | null>(null);
  const automaticBackupForegroundUnsubscribeRef = useRef<(() => void) | null>(null);
  const automaticBackupUnsubscribeRef = useRef<(() => void) | null>(null);
  const generationRef = useRef(0);
  const workoutRefreshGenerationRef = useRef(0);
  const restCommandQueueRef = useRef<Promise<void>>(Promise.resolve());
  const postCommitReconciliationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const restReconciliationGenerationRef = useRef(0);
  const selectionRefreshGenerationRef = useRef(0);
  const workoutSummaryGenerationRef = useRef(0);
  const selectionRefreshQueueRef = useRef<Promise<void>>(Promise.resolve());
  const committedWorkoutRevisionsRef = useRef(new Map<string, number>());
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
    restCommandQueueRef.current = Promise.resolve();
    postCommitReconciliationQueueRef.current = Promise.resolve();
    restReconciliationGenerationRef.current += 1;
    selectionRefreshGenerationRef.current += 1;
    workoutSummaryGenerationRef.current += 1;
    selectionRefreshQueueRef.current = Promise.resolve();
    committedWorkoutRevisionsRef.current.clear();
    pendingActivityMatchRef.current = null;
    progressBodyweightCommandsRef.current.clear();
    try {
      if (dependencies.strictDisposal) await services?.lifecycle.dispose?.();
      else await services?.lifecycle.dispose?.().catch(() => undefined);
      services?.automaticBackupRuntime?.dispose();
      if (dependencies.strictDisposal) {
        await services?.kernel.close();
        await dependencies.disposeRuntime?.();
      } else {
        await services?.kernel.close().catch(() => undefined);
        await dependencies.disposeRuntime?.().catch(() => undefined);
      }
    } catch (error) {
      dependencies.reportDisposalFailure?.(error);
      throw error;
    }
  }, [dependencies]);

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

  // Product mutations refresh only the Today selection they can change. Backup
  // metadata and OS permission reads belong to launch/settings, not save clicks.
  const refreshTodaySelection = useCallback(async (
    services: RuntimeServices,
    plansChanged = false,
  ) => {
    const generation = ++selectionRefreshGenerationRef.current;
    const summaryGeneration = workoutSummaryGenerationRef.current;
    const context = localContext(dependencies.now());
    const [legacyView, scheduledToday, activation] = await Promise.all([
      services.repository.getTodayView({ localDate: context.localDate, weekday: context.weekday }),
      services.schedules.loadToday(dependencies.nowMs()),
      plansChanged ? services.repository.getActivation() : Promise.resolve(undefined),
    ]);
    if (servicesRef.current !== services || generation !== selectionRefreshGenerationRef.current) return;
    setState((current) => {
      const { scheduleToday: _scheduleToday, ...preserved } = current;
      return {
        ...preserved,
        ...(summaryGeneration !== workoutSummaryGenerationRef.current ? {} : {
          view: legacyView.state === "active_workout" || legacyView.state === "saved_partial"
            ? legacyView : scheduledToday?.view ?? legacyView,
        }),
        planDays: scheduledToday?.planDays ?? (plansChanged ? activation?.days ?? [] : current.planDays),
        selectedStrengthOccurrence: scheduledToday?.selectedStrengthOccurrence ?? null,
        ...(scheduledToday === null ? {} : { scheduleToday: scheduledToday.scheduleToday }),
        workoutRefreshGeneration: workoutRefreshGenerationRef.current,
      };
    });
  }, [dependencies]);

  const clearCommittedActionFailure = useCallback((services: RuntimeServices) => {
    if (servicesRef.current !== services) return;
    setState((current) => {
      if (current.actionFailure === undefined && current.mutationFailure === undefined) return current;
      const { actionFailure: _actionFailure, mutationFailure: _mutationFailure, ...preserved } = current;
      return preserved;
    });
  }, []);

  const queueTodaySelectionRefresh = useCallback((services: RuntimeServices) => {
    clearCommittedActionFailure(services);
    const generation = ++selectionRefreshGenerationRef.current;
    selectionRefreshQueueRef.current = selectionRefreshQueueRef.current.then(async () => {
      if (servicesRef.current !== services || generation !== selectionRefreshGenerationRef.current) return;
      await refreshTodaySelection(services, true);
    }).catch(() => undefined);
  }, [clearCommittedActionFailure, refreshTodaySelection]);

  const publishStartedWorkout = useCallback((services: RuntimeServices, view: TodayView) => {
    if (servicesRef.current !== services) return;
    workoutSummaryGenerationRef.current += 1;
    setState((current) => {
      const { actionFailure: _actionFailure, mutationFailure: _mutationFailure, ...preserved } = current;
      return { ...preserved, view, workoutRefreshGeneration: workoutRefreshGenerationRef.current };
    });
  }, []);

  const publishCommittedWorkout = useCallback((services: RuntimeServices, view: ActiveWorkoutView) => {
    if (servicesRef.current !== services) return;
    const previousRevision = committedWorkoutRevisionsRef.current.get(view.id) ?? -1;
    if (view.revision < previousRevision) return;
    committedWorkoutRevisionsRef.current.set(view.id, view.revision);
    workoutSummaryGenerationRef.current += 1;
    const exercises = view.exercises.length > 0 ? view.exercises : [view.currentExercise];
    const exercise = exercises.find(({ id }) => id === view.activeExerciseId);
    const set = exercise === undefined ? undefined : [...exercise.warmups, ...exercise.workingSets]
      .find(({ id }) => id === view.activeSetId);
    setState((current) => {
      if (current.view?.state === "active_workout"
        && current.view.sessionId === view.id
        && current.view.exerciseName === (exercise?.name ?? null)
        && current.view.setLabel === (set === undefined ? null : `${set.kind === "warmup" ? "Warm-up" : "Working set"} ${set.ordinal + 1}`)
        && current.view.restStatus === view.rest.state
        && current.actionFailure === undefined && current.mutationFailure === undefined) return current;
      const { actionFailure: _actionFailure, mutationFailure: _mutationFailure, ...preserved } = current;
      return {
        ...preserved,
        view: {
          state: "active_workout",
          sessionId: view.id,
          exerciseName: exercise?.name ?? null,
          setLabel: set === undefined ? null : `${set.kind === "warmup" ? "Warm-up" : "Working set"} ${set.ordinal + 1}`,
          restStatus: view.rest.state,
        },
      };
    });
  }, []);

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
      randomUUID: runtimeRandomUUID,
      sha256: (value) => {
        const {
          CryptoDigestAlgorithm,
          digestStringAsync,
        } = require("expo-crypto") as typeof import("expo-crypto");
        return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
      },
    });
    const runningPlans = createRunningPlanRuntimePort(kernel, {
      nowMs: dependencies.nowMs,
      randomUUID: runtimeRandomUUID,
      sha256: (value) => {
        const { CryptoDigestAlgorithm, digestStringAsync } = require("expo-crypto") as typeof import("expo-crypto");
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
        ?? Object.freeze((() => {
          const unavailable = async () => { throw new Error("csv_export_unavailable"); };
          return { readRows: unavailable, serialize: unavailable };
        })()),
      csvFiles: dependencies.createCsvFiles?.() ?? Object.freeze((() => {
        const unavailable = async () => { throw new Error("csv_export_unavailable"); };
        return {
          writeCsv: unavailable,
          shareCsv: unavailable,
          discardCsv: async () => undefined,
        };
      })()),
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
      historyRepository: createHistoryRepository(kernel, { displayTimeZone: () => displayTimeZoneRef.current }),
      importedActivities: createImportedActivityRepository(kernel),
      garminSyncSummaries: createGarminSyncSummaryRepository(kernel),
      progressRepository: createProgressRepository(progressSnapshotKernel(kernel), { displayTimeZone: () => displayTimeZoneRef.current }),
      runningPlans,
      kernel,
      librarySearchRepository,
      lifecycle,
      notifications,
      restAlertPreferenceStore,
      ownedPlans,
      schedules,
      trainingFoundation: createTrainingFoundationRuntimePort(kernel),
      outcomeRepository,
      repository: dependencies.createRepository(kernel),
      restRepository,
      runningActivityMatches: createRunningActivityMatchRepository(kernel),
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
      await dependencies.prepareRuntime?.({
        kernel,
        ...(starterPlansRef.current === undefined
          ? {}
          : { starterPlans: starterPlansRef.current }),
      });
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
  }, [closeServices, dependencies, runtimeRandomUUID, trustedRead]);

  useEffect(() => {
    void initialize();
    return () => {
      generationRef.current += 1;
      void closeServices().catch(() => {
        if (!dependencies.strictDisposal) return;
        console.error("workout_runtime_strict_disposal_failed");
      });
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
      const readContext = localContext(dependencies.now());
      const view = await services.repository.getTodayView({ localDate: readContext.localDate, weekday: readContext.weekday });
      publishStartedWorkout(services, view);
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
  }, [dependencies, publishStartedWorkout, requireServices]);

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
      const readContext = localContext(dependencies.now());
      const view = await services.repository.getTodayView({ localDate: readContext.localDate, weekday: readContext.weekday });
      publishStartedWorkout(services, view);
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
  }, [dependencies, publishStartedWorkout, requireServices]);

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
      const readContext = localContext(dependencies.now());
      const view = await services.repository.getTodayView({ localDate: readContext.localDate, weekday: readContext.weekday });
      publishStartedWorkout(services, view);
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
  }, [dependencies, publishStartedWorkout, requireServices]);

  const getActiveWorkout = useCallback((sessionId: string) => {
    return requireServices().workoutRepository.getWorkoutSession(sessionId);
  }, [requireServices]);

  const getSessionDetail = useCallback((sessionId: string) => {
    return requireServices().outcomeRepository.getSessionDetail(sessionId);
  }, [requireServices]);

  const getSessionDetailAtRevision = useCallback((sessionId: string, sourceRevision: number) => {
    const read = requireServices().outcomeRepository.getSessionDetailAtRevision;
    if (read === undefined) throw new Error("workout_source_revision_reader_unavailable");
    return read(sessionId, sourceRevision);
  }, [requireServices]);

  const getCalendarSessionDetail = useCallback((sessionId: string) => {
    return requireServices().outcomeRepository.getCalendarSessionDetail(sessionId);
  }, [requireServices]);

  const confirmGarminImport = useCallback((input: ConfirmGarminImportInput): Promise<GarminImportResult> =>
    requireServices().importedActivities.confirmGarminImport(input),
  [requireServices]);

  const loadGarminActivities = useCallback(async (): ReturnType<GarminImportApplicationPort["loadGarminActivities"]> => {
    const rows = await requireServices().kernel.queryAll<{
      activity_id: string;
      aggregate_json: string;
      aggregate_revision: number;
      accepted_normalized_sha256: string;
      removal_state: "active" | "removed";
      match_count: number;
      pending_revision_count: number;
    }>(
      `SELECT activity.id AS activity_id, activity.aggregate_json,
              identity.aggregate_revision, identity.accepted_normalized_sha256,
              COALESCE(lifecycle.removal_state, identity.removal_state) AS removal_state,
              (SELECT count(*) FROM running_activity_current_matches current
                WHERE current.activity_id = activity.id) AS match_count,
              (SELECT count(*)
                 FROM imported_activity_revision_proposals proposal
                 LEFT JOIN imported_activity_revision_decisions decision
                   ON decision.activity_id = proposal.activity_id
                  AND decision.proposed_revision = proposal.proposed_revision
                WHERE proposal.activity_id = activity.id
                  AND decision.request_id IS NULL) AS pending_revision_count
         FROM imported_activities activity
         JOIN imported_activity_identities identity ON identity.activity_id = activity.id
         LEFT JOIN imported_activity_current_lifecycle lifecycle ON lifecycle.activity_id = activity.id
        WHERE COALESCE(lifecycle.removal_state, identity.removal_state) = 'active'
        ORDER BY activity.started_at_ms DESC, activity.id`,
    );
    return Object.freeze(rows.map((row) => {
      const projected = projectImportedActivityDetail({
        activityId: row.activity_id,
        aggregateJson: row.aggregate_json,
        aggregateRevision: row.aggregate_revision,
        acceptedNormalizedSha256: row.accepted_normalized_sha256,
        removalState: row.removal_state,
      });
      if (projected.kind !== "ready") {
        throw new Error("garmin_history_projection_unavailable");
      }
      const summary = [projected.detail.distance, projected.detail.elapsed]
        .filter((value): value is string => value !== undefined)
        .join(" · ");
      return Object.freeze({
        activityId: row.activity_id,
        title: projected.detail.activityType,
        activityType: "Running",
        confirmedLocalDate: projected.detail.confirmedLocalDate,
        // A ready projection has passed the required normalized timestamp schema.
        startedAtMs: projected.detail.startedAtMs!,
        identityCopy: "Accepted source title unavailable.",
        summary,
        matchState: row.match_count === 1 ? "matched" as const : "unmatched" as const,
        revisionState: row.pending_revision_count > 0
          ? "needs_review" as const
          : "accepted" as const,
      });
    }));
  }, [requireServices]);

  const loadLastGarminSync = useCallback(async () => (
    requireServices().garminSyncSummaries.load()
  ), [requireServices]);

  const saveLastGarminSync = useCallback((summary: Parameters<GarminImportApplicationPort["saveLastGarminSync"]>[0]) => (
    requireServices().garminSyncSummaries.save(summary)
  ), [requireServices]);

  const listGarminRevisionReviews = useCallback(async () => (
    requireServices().importedActivities.listGarminRevisionReviews()
  ), [requireServices]);

  const loadGarminRevisionReview = useCallback(async (
    activityId: string,
  ): Promise<GarminRevisionReviewDetail | null> => {
    const localActivityId = parseImportedActivityLocalId(activityId);
    if (localActivityId === null) {
      return null;
    }
    const [row] = await requireServices().kernel.queryAll<{
      accepted_revision: number;
      accepted_aggregate_json: string;
      proposed_revision: number;
      proposed_sha256: string;
      proposed_aggregate_json: string;
    }>(
      `SELECT identity.aggregate_revision AS accepted_revision,
              activity.aggregate_json AS accepted_aggregate_json,
              proposal.proposed_revision,
              proposal.normalized_sha256 AS proposed_sha256,
              proposal.envelope_json AS proposed_aggregate_json
         FROM imported_activity_revision_proposals proposal
         JOIN imported_activity_identities identity ON identity.activity_id = proposal.activity_id
         JOIN imported_activities activity ON activity.id = proposal.activity_id
         LEFT JOIN imported_activity_revision_decisions decision
           ON decision.activity_id = proposal.activity_id
          AND decision.proposed_revision = proposal.proposed_revision
        WHERE proposal.activity_id = ?
          AND decision.request_id IS NULL
        ORDER BY proposal.proposed_revision DESC
        LIMIT 1`,
      [localActivityId],
    );
    if (row === undefined) {
      return null;
    }
    const accepted = JSON.parse(row.accepted_aggregate_json) as Readonly<{ normalized?: Record<string, unknown> }>;
    const proposed = JSON.parse(row.proposed_aggregate_json) as Readonly<{ normalized?: Record<string, unknown> }>;
    const acceptedFacts = accepted.normalized ?? {};
    const proposedFacts = proposed.normalized ?? {};
    const keys = [...new Set([...Object.keys(acceptedFacts), ...Object.keys(proposedFacts)])]
      .filter((key) => canonicalJson(acceptedFacts[key]) !== canonicalJson(proposedFacts[key]))
      .sort();
    return Object.freeze({
      activityId: localActivityId,
      acceptedRevision: row.accepted_revision,
      proposedRevision: row.proposed_revision,
      expectedProposedSha256: row.proposed_sha256,
      changedFields: Object.freeze(keys.map((field) => Object.freeze({
        field,
        accepted: revisionDisplayValue(acceptedFacts[field]),
        proposed: revisionDisplayValue(proposedFacts[field]),
      }))),
    });
  }, [requireServices]);

  const resolveGarminRevision = useCallback(async (input: GarminRevisionDecisionInput) => (
    resolveGarminImportRevision(requireServices().importedActivities, input)
  ), [requireServices]);

  const garminImport = useMemo<GarminImportApplicationPort>(() => Object.freeze({
    confirmGarminImport,
    loadGarminActivities,
    loadLastGarminSync,
    saveLastGarminSync,
  }), [confirmGarminImport, loadGarminActivities, loadLastGarminSync, saveLastGarminSync]);

  const loadImportedActivityDetail = useCallback(async (
    activityId: string,
    expectedSourceRevision?: number,
  ): Promise<ImportedActivityDetailReadResult> => {
    const localActivityId = parseImportedActivityLocalId(activityId);
    if (localActivityId === null) return Object.freeze({ kind: "missing" });
    const rows = await requireServices().kernel.queryAll<{
      activity_id: string;
      aggregate_json: string;
      aggregate_revision: number;
      accepted_normalized_sha256: string;
      removal_state: "active" | "removed";
      pending_revision_count: number;
    }>(
      `SELECT activity.id AS activity_id, activity.aggregate_json,
              identity.aggregate_revision, identity.accepted_normalized_sha256,
              COALESCE(lifecycle.removal_state, identity.removal_state) AS removal_state,
              (SELECT count(*)
                 FROM imported_activity_revision_proposals proposal
                 LEFT JOIN imported_activity_revision_decisions decision
                   ON decision.activity_id = proposal.activity_id
                  AND decision.proposed_revision = proposal.proposed_revision
                WHERE proposal.activity_id = activity.id
                  AND decision.request_id IS NULL) AS pending_revision_count
         FROM imported_activities activity
         JOIN imported_activity_identities identity ON identity.activity_id = activity.id
         LEFT JOIN imported_activity_current_lifecycle lifecycle ON lifecycle.activity_id = activity.id
        WHERE activity.id = ?
        LIMIT 2`,
      [localActivityId],
    );
    if (rows.length === 0) return Object.freeze({ kind: "missing" });
    if (rows.length !== 1) {
      return Object.freeze({ kind: "projection_error", code: "accepted_payload_unavailable" });
    }
    const row = rows[0]!;
    if (expectedSourceRevision !== undefined && row.aggregate_revision !== expectedSourceRevision) {
      return Object.freeze({ kind: "projection_error", code: "accepted_payload_unavailable" });
    }
    if (row.pending_revision_count > 0) {
      return Object.freeze({ kind: "revision_review" });
    }
    return projectImportedActivityDetail({
      activityId: row.activity_id,
      aggregateJson: row.aggregate_json,
      aggregateRevision: row.aggregate_revision,
      acceptedNormalizedSha256: row.accepted_normalized_sha256,
      removalState: row.removal_state,
    });
  }, [requireServices]);

  const loadRunningActivityMatch = useCallback((activityId: string) =>
    queryRunningActivityMatchCandidates(requireServices().runningActivityMatches, activityId),
  [requireServices]);

  const prepareActivityMatchCommand = useCallback(async (input: Readonly<{
    action: "match" | "unmatch" | "reassign";
    candidate: RunningActivityMatchCandidate;
    expectedCurrentOpportunityId?: string;
  }>): Promise<RunningActivityMatchInput> => {
    const candidateKey = JSON.stringify([
      input.action,
      input.candidate.activityId,
      input.candidate.expectedActivityRevision,
      input.candidate.expectedAcceptedPayloadSha256,
      input.candidate.opportunityId,
      input.candidate.expectedOpportunityRevision,
      input.candidate.expectedRelationRevision,
      input.candidate.scheduleId,
      input.candidate.scheduleVersionId,
      input.candidate.expectedScheduleRevision,
      input.candidate.planDayId,
      input.candidate.expectedPlanDayRevision,
      input.candidate.slotId,
      input.candidate.slotRevisionId,
      input.candidate.expectedSlotRevision,
      input.candidate.sessionRevisionId,
      input.candidate.expectedSessionRevision,
      input.expectedCurrentOpportunityId ?? null,
    ]);
    let prepared = pendingActivityMatchRef.current;
    if (prepared?.candidateKey !== candidateKey) {
      const {
        CryptoDigestAlgorithm,
        digestStringAsync,
        randomUUID,
      } = require("expo-crypto") as typeof import("expo-crypto");
      prepared = Object.freeze({
        candidateKey,
        input: await prepareRunningActivityMatchInput({
          action: input.action,
          candidate: input.candidate,
          requestId: `running-match-${input.action}-${randomUUID()}`,
          occurredAtMs: dependencies.nowMs(),
          ...(input.expectedCurrentOpportunityId === undefined
            ? {}
            : { expectedCurrentOpportunityId: input.expectedCurrentOpportunityId }),
        }, (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value)),
      });
      pendingActivityMatchRef.current = prepared;
    }
    return prepared.input;
  }, [dependencies]);

  const confirmActivityMatch = useCallback(async (
    candidate: RunningActivityMatchCandidate,
  ): Promise<RunningActivityMatchResult> => {
    const result = await confirmRunningActivityMatch(
      requireServices().runningActivityMatches,
      await prepareActivityMatchCommand({
        action: "match",
        candidate,
      }),
    );
    pendingActivityMatchRef.current = null;
    return result;
  }, [prepareActivityMatchCommand, requireServices]);

  const unmatchActivityMatch = useCallback(async (
    candidate: RunningActivityMatchCandidate,
  ): Promise<RunningActivityMatchResult> => {
    const result = await confirmRunningActivityMatch(
      requireServices().runningActivityMatches,
      await prepareActivityMatchCommand({
        action: "unmatch",
        candidate,
        expectedCurrentOpportunityId: candidate.opportunityId,
      }),
    );
    pendingActivityMatchRef.current = null;
    return result;
  }, [prepareActivityMatchCommand, requireServices]);

  const reassignActivityMatch = useCallback(async (input: Readonly<{
    current: RunningActivityMatchCandidate;
    next: RunningActivityMatchCandidate;
  }>): Promise<RunningActivityMatchResult> => {
    const result = await confirmRunningActivityMatch(
      requireServices().runningActivityMatches,
      await prepareActivityMatchCommand({
        action: "reassign",
        candidate: Object.freeze({
          ...input.next,
          expectedRelationRevision: input.current.expectedRelationRevision,
        }),
        expectedCurrentOpportunityId: input.current.opportunityId,
      }),
    );
    pendingActivityMatchRef.current = null;
    return result;
  }, [prepareActivityMatchCommand, requireServices]);

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
    clearCommittedActionFailure(services);
    await services.lifecycle.trigger("post_commit").catch(() => undefined);
    workoutRefreshGenerationRef.current += 1;
    try {
      await refreshTodaySelection(services);
    } catch {
      setState((current) => ({
        ...current,
        workoutRefreshGeneration: workoutRefreshGenerationRef.current,
      }));
    }
    return result;
  }, [dependencies, requireServices, refreshTodaySelection, clearCommittedActionFailure]);

  const refreshAfterHistoryLifecycleCommit = useCallback(async () => {
    const services = requireServices();
    clearCommittedActionFailure(services);
    await services.lifecycle.trigger("post_commit").catch(() => undefined);
    workoutRefreshGenerationRef.current += 1;
    try {
      await refreshTodaySelection(services);
    } catch {
      setState((current) => ({
        ...current,
        workoutRefreshGeneration: workoutRefreshGenerationRef.current,
      }));
    }
  }, [requireServices, refreshTodaySelection, clearCommittedActionFailure]);

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
  }, [requireServices, displayTimeZone]);

  const loadCalendarRange = useCallback((input: Readonly<{
    startLocalDate: string;
    endLocalDateExclusive: string;
  }>) => requireServices().trainingFoundation.loadCalendarRange({ ...input, displayTimeZone }), [
    requireServices,
    displayTimeZone,
  ]);

  const loadPlannedStrengthOccurrence = useCallback((occurrenceId: string) =>
    requireServices().trainingFoundation.loadPlannedStrengthOccurrence(
      occurrenceId,
    ), [requireServices]);

  const loadExerciseMetricHistory = useCallback((exerciseId: string) => {
    return requireServices().historyRepository.loadExerciseMetricHistory({
      exerciseId,
    });
  }, [requireServices, displayTimeZone]);

  const loadProgress = useCallback(async (input: Readonly<{
    sport?: ProgressSport;
    period: ProgressPeriod;
    nowLocalDate: string;
  }>) => {
    return requireServices().progressRepository.load(input);
  }, [requireServices, displayTimeZone]);

  const progressRunningTargetRuntime = useMemo(() => Object.freeze({
    createId: (kind: string) => requireServices().runningPlans.createId(kind),
    loadPlan: (planId: string) => requireServices().runningPlans.loadPlan(planId),
    saveRunningTarget: (input: RunningTargetMutationInput) =>
      requireServices().runningPlans.saveRunningTarget(input),
  }), [requireServices]);

  const createProgressId = useCallback((kind: string) => {
    const acceptanceRequest = v12NativeAcceptanceProductRequestRef.current;
    if (acceptanceRequest?.caseId === "workout.plan-increment" && kind === "recommendation-use") {
      return v12NativeAcceptanceProductRequestId(acceptanceRequest, kind);
    }
    return requireServices().runningPlans.createId(kind);
  }, [requireServices]);

  const loadProgressBodyweightHistory = useCallback(async (): Promise<readonly ProgressBodyweightEntry[]> => {
    const services = requireServices();
    const owners = await services.kernel.queryAll<{ owner_namespace: string }>(
      "SELECT owner_namespace FROM portable_owner_identity WHERE id = 1",
    );
    const ownerId = owners.length === 1 ? owners[0]?.owner_namespace : undefined;
    if (ownerId === undefined || !/^[A-Za-z0-9._:-]{1,128}$/u.test(ownerId)) {
      throw new Error("progress_bodyweight_owner_unavailable");
    }
    const entries = await services.trainingFoundation.loadBodyweightHistory(ownerId);
    return Object.freeze(entries
      .filter(({ lifecycle }) => lifecycle === "active")
      .map(({ entryId, revision, localDate, grams }) => Object.freeze({
        entryId,
        revision,
        localDate,
        grams,
      })));
  }, [requireServices]);

  const commitProgressBodyweight = useCallback(async (
    operation: "create" | "edit" | "delete",
    input: ProgressBodyweightSaveInput | Readonly<{ requestId: string; entryId: string; expectedRevision: number }>,
  ): Promise<readonly ProgressBodyweightEntry[]> => {
    const services = requireServices();
    let command = progressBodyweightCommandsRef.current.get(input.requestId);
    if (command === undefined) {
      const owners = await services.kernel.queryAll<{ owner_namespace: string }>(
        "SELECT owner_namespace FROM portable_owner_identity WHERE id = 1",
      );
      const ownerId = owners.length === 1 ? owners[0]?.owner_namespace : undefined;
      if (ownerId === undefined || !/^[A-Za-z0-9._:-]{1,128}$/u.test(ownerId)) {
        throw new Error("progress_bodyweight_owner_unavailable");
      }
      const context = localContext(dependencies.now());
      const request = {
        operation,
        requestId: input.requestId,
        entryId: input.entryId,
        ownerId,
        expectedRevision: input.expectedRevision,
        revisionId: createProgressId("bodyweight-revision"),
        eventId: createProgressId("bodyweight-event"),
        occurredAtMs: dependencies.nowMs(),
        ...(operation === "delete" ? {} : {
          localDate: (input as ProgressBodyweightSaveInput).localDate,
          timezone: context.timezone,
          grams: (input as ProgressBodyweightSaveInput).grams,
        }),
      } as const;
      const { CryptoDigestAlgorithm, digestStringAsync } = require("expo-crypto") as typeof import("expo-crypto");
      command = Object.freeze({
        ...request,
        requestSha256: await digestStringAsync(
          CryptoDigestAlgorithm.SHA256,
          canonicalBodyweightRequestPayload(request),
        ),
      });
      progressBodyweightCommandsRef.current.set(input.requestId, command);
    }
    const result = await services.trainingFoundation.commitBodyweight(command);
    if (result.kind === "conflict") throw new Error("bodyweight_revision_conflict");
    const readBack = await loadProgressBodyweightHistory();
    const committedEntry = readBack.find(({ entryId }) => entryId === input.entryId);
    if ((operation === "delete" && committedEntry !== undefined)
      || (operation !== "delete" && committedEntry === undefined)) {
      throw new Error("bodyweight_readback_missing");
    }
    progressBodyweightCommandsRef.current.delete(input.requestId);
    return readBack;
  }, [createProgressId, dependencies, loadProgressBodyweightHistory, requireServices]);

  const progressBodyweightRuntime = useMemo(() => Object.freeze({
    createId: createProgressId,
    loadHistory: loadProgressBodyweightHistory,
    save: (input: ProgressBodyweightSaveInput) => commitProgressBodyweight(
      input.expectedRevision === 0 ? "create" : "edit",
      input,
    ),
    delete: (entry: ProgressBodyweightEntry, requestId: string) =>
      commitProgressBodyweight("delete", {
        requestId,
        entryId: entry.entryId,
        expectedRevision: entry.revision,
      }),
  }), [commitProgressBodyweight, createProgressId, loadProgressBodyweightHistory]);

  const listRemovedHistorySessions = useCallback(() =>
    requireServices().historyRepository.listRemovedSessions(),
  [requireServices, displayTimeZone]);

  const loadLibrary = useCallback(async (): Promise<LibraryRuntimeSnapshot> => {
    const services = requireServices();
    return readLibraryRuntimeSnapshot({
      kernel: services.kernel,
      nowMs: dependencies.nowMs,
      starterPlans: starterPlansRef.current?.summaries ?? [],
      templates: starterPlansRef.current?.templates ?? [],
    });
  }, [requireServices]);

  const retryLibraryLoad = useCallback(async () => {
    // Retrying a failed Library load reads the same authoritative source rows;
    // it is not a product mutation and must not claim a fixture envelope.
    return loadLibrary();
  }, [loadLibrary]);

  const deleteLibraryPlan = useCallback<LibraryPlanDeletionPort["deletePlan"]>(async (input) => {
    const services = requireServices();
    const result = await createLibraryPlanDeletionPort(services.kernel, {
      nowMs: dependencies.nowMs,
    }).deletePlan(input);
    if (result.outcome === "deleted") {
      queueTodaySelectionRefresh(services);
    }
    return result;
  }, [dependencies, queueTodaySelectionRefresh, requireServices]);

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
    const requestId = await phase17RequestId(
      "starter-plan-activation",
      `starter-ui:${command.templateId}:${activatedAtMs}`,
    );
    const result = await activateStarterPlan({
      kind: "accepted",
      starterPackBytes: prettyBytes(starterPlansAsset),
      acceptanceBytes: prettyBytes(starterPlansAcceptanceAsset),
      sha256: (value: string) =>
        digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
      repository: createStarterPlanRepository(services.kernel),
      requestId,
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
  }, [dependencies, phase17RequestId, requireServices, trustedRead]);

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
      requestId: await phase17RequestId(
        "starter-editable-copy",
        `starter-editable-copy:${template.id}:${createdAtMs}`,
      ),
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
      requestId: await phase17RequestId(
        "starter-template-update-copy",
        `starter-update-copy:${preview.ownedPlanId}:${preview.template.id}:${createdAtMs}`,
      ),
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
    const requestId = await phase17RequestId(
        "exercise-favorite",
        `favorite:${exerciseId}:${favorite ? "on" : "off"}:${expectedPreferenceRevision ?? "new"}`,
      );
    const result = await services.customExerciseRepository.setExerciseFavorite({
      requestId,
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
  }, [dependencies, phase17RequestId, requireServices]);

  const createRuntimeCustomExercise = useCallback(async (
    input: Omit<CreateCustomExerciseInput, "createdAtMs">,
  ) => {
    const services = requireServices();
    const requestId = await phase17RequestId("custom-exercise-create", input.requestId);
    return createCustomExerciseCommand({
      repository: services.customExerciseRepository,
      invalidate: async () => undefined,
      input: {
        ...input,
        requestId,
        createdAtMs: dependencies.nowMs(),
      },
    });
  }, [dependencies, phase17RequestId, requireServices]);

  const editRuntimeCustomExercise = useCallback(async (
    input: Omit<EditCustomExerciseInput, "editedAtMs">,
  ) => {
    const services = requireServices();
    const requestId = await phase17RequestId("custom-exercise-edit", input.requestId);
    return editCustomExerciseCommand({
      repository: services.customExerciseRepository,
      invalidate: async () => undefined,
      input: {
        ...input,
        requestId,
        editedAtMs: dependencies.nowMs(),
      },
    });
  }, [dependencies, phase17RequestId, requireServices]);

  const createRuntimeCustomCopy = useCallback(async (
    input: Omit<CreateCustomCopyInput, "createdAtMs">,
  ) => {
    const services = requireServices();
    const requestId = await phase17RequestId("custom-exercise-copy", input.requestId);
    return createCustomCopy({
      repository: services.customExerciseRepository,
      invalidate: async () => undefined,
      input: { ...input, requestId, createdAtMs: dependencies.nowMs() },
    });
  }, [dependencies, phase17RequestId, requireServices]);

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
    const requestId = await phase17RequestId("exercise-favorite", services.ownedPlans.createId("exercise-favorite"));
    await setExerciseFavoriteCommand({
      repository: services.customExerciseRepository,
      invalidate: async () => undefined,
      input: {
        requestId,
        ...input,
        updatedAtMs: dependencies.nowMs(),
      },
    });
    return requireCustomExerciseDetail(services, input.exerciseId);
  }, [dependencies, phase17RequestId, requireCustomExerciseDetail, requireServices]);

  const setRuntimeCustomExerciseHidden = useCallback(async (
    input: Readonly<{
      exerciseId: string;
      expectedPreferenceRevision: number | null;
      hidden: boolean;
    }>,
  ) => {
    const services = requireServices();
    const requestId = await phase17RequestId(
      "custom-exercise-hide",
      services.ownedPlans.createId("exercise-hidden"),
    );
    await setExerciseHidden({
      repository: services.customExerciseRepository,
      invalidate: async () => undefined,
      input: {
        requestId,
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
    const requestId = input.archived
      ? await phase17RequestId("custom-exercise-archive", services.ownedPlans.createId("exercise-archive"))
      : await phase17RequestId("custom-exercise-reactivate", services.ownedPlans.createId("exercise-restore"));
    await command({
      repository: services.customExerciseRepository,
      invalidate: async () => undefined,
      input: {
        requestId,
        exerciseId: input.exerciseId,
        expectedExerciseRevision: input.expectedExerciseRevision,
        expectedPreferenceRevision: input.expectedPreferenceRevision,
        previewRevision: input.previewRevision,
        updatedAtMs: dependencies.nowMs(),
      },
    });
    return requireCustomExerciseDetail(services, input.exerciseId);
  }, [dependencies, phase17RequestId, requireCustomExerciseDetail, requireServices]);

  const loadRuntimeCustomExerciseMigration = useCallback((
    exerciseId: string,
  ) => readCustomExerciseMigration(requireServices(), exerciseId),
  [requireServices]);

  const migrateRuntimeCustomExerciseProfile = useCallback(async (
    input: Omit<MigrateCustomExerciseMetricProfileInput, "migratedAtMs">,
  ) => {
    const idempotencyKey = await phase17RequestId("custom-exercise-metric-migration", input.idempotencyKey);
    return migrateCustomExerciseMetricProfile({
      repository: createMetricRepository(requireServices().kernel),
      input: { ...input, idempotencyKey, migratedAtMs: dependencies.nowMs() },
    });
  }, [dependencies, phase17RequestId, requireServices]);

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
      queueTodaySelectionRefresh(services);
    }
    return result;
  }, [queueTodaySelectionRefresh, requireServices]);

  const createOwnedDraft = useCallback(async (
    input: Readonly<{ name: string; dayName: string }>,
  ) => {
    const services = requireServices();
    const requestId = await phase17RequestId("owned-plan-create", services.ownedPlans.createId("owned-plan-create"));
    return runOwnedPlanMutation((ownedPlans) => ownedPlans.createDraft({ ...input, requestId }));
  }, [phase17RequestId, requireServices, runOwnedPlanMutation]);

  const saveOwnedDraft = useCallback(async (
    input: Readonly<{
      expectedRevision: number;
      plan: OwnedPlanDraftInput;
    }>,
  ) => {
    const services = requireServices();
    const requestId = await phase17RequestId("owned-plan-save", services.ownedPlans.createId("owned-plan-save"));
    return runOwnedPlanMutation((ownedPlans) => ownedPlans.savePlan({ ...input, requestId }));
  }, [phase17RequestId, requireServices, runOwnedPlanMutation]);

  const duplicateOwnedDraft = useCallback((
    input: Readonly<{
      sourcePlanId: string;
      expectedRevision: number;
      name: string;
    }>,
  ) => runOwnedPlanMutation((ownedPlans) => ownedPlans.duplicatePlan({
    ...input,
    requestId: ownedPlans.createId("owned-plan-duplicate"),
  })),
  [runOwnedPlanMutation]);

  const archiveOwnedDraft = useCallback(async (
    input: Readonly<{ planId: string; expectedRevision: number }>,
  ) => {
    const services = requireServices();
    const requestId = await phase17RequestId("owned-plan-lifecycle", services.ownedPlans.createId("owned-plan-archive"));
    return runOwnedPlanMutation((ownedPlans) => ownedPlans.archivePlan({ ...input, requestId }));
  }, [phase17RequestId, requireServices, runOwnedPlanMutation]);

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
      queueTodaySelectionRefresh(services);
    }
    return result;
  }, [queueTodaySelectionRefresh, requireServices]);

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
      queueTodaySelectionRefresh(services);
    }
    return result;
  }, [queueTodaySelectionRefresh, requireServices]);

  const reconcileAfterCommit = useCallback((
    services: RuntimeServices,
    foregroundExpiry?: Readonly<{ sessionId: string; restRevision: number }>,
  ) => {
    const restGeneration = foregroundExpiry === undefined
      ? ++restReconciliationGenerationRef.current
      : null;
    const isSuperseded = () => restGeneration !== null
      && restGeneration !== restReconciliationGenerationRef.current;
    // Native notification and durable effect work is serialized independently
    // of command acknowledgement. Every pass reads the latest authoritative
    // rest state; a failed pass leaves its transactional effects replayable.
    postCommitReconciliationQueueRef.current = postCommitReconciliationQueueRef.current.then(async () => {
      if (servicesRef.current !== services || isSuperseded()) return;
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
      if (servicesRef.current !== services || isSuperseded()) return;
      const lifecycleResult = await services.lifecycle.trigger("post_commit", {
        ...(foregroundExpiry === undefined ? {} : { foregroundExpiry }),
      })
        .catch(() => null);
      if (servicesRef.current !== services) return;
      // RestCommandResult already updates the timer and Today rest status.
      // Reloading the full workout/progress tree here would reintroduce lag.
      setState((current) => current.notificationPermission === (lifecycleResult?.permission ?? permission)
        && current.workoutRefreshGeneration === workoutRefreshGenerationRef.current
        ? current : {
          ...current,
          notificationPermission: lifecycleResult?.permission ?? permission,
          workoutRefreshGeneration: workoutRefreshGenerationRef.current,
        });
    }).catch(() => undefined);
  }, []);

  const runRestCommand = useCallback((
    sessionId: string,
    command: (
      repository: ReturnType<typeof createRestRepository>,
    ) => Promise<RestCommandResult>,
  ): Promise<RestCommandResult> => {
    const services = requireServices();
    const committed = restCommandQueueRef.current.then(async () => {
      if (servicesRef.current !== services) throw new Error("workout_runtime_not_trusted");
      const result = await command(services.restRepository);
      if (servicesRef.current !== services) return result;
      committedWorkoutRevisionsRef.current.set(sessionId, Math.max(
        committedWorkoutRevisionsRef.current.get(sessionId) ?? -1,
        result.sessionRevision,
      ));
      workoutSummaryGenerationRef.current += 1;
      // The repository resolves only after its exclusive transaction commits.
      // Use that acknowledgement directly, keeping unrelated reads and effect
      // adapters off the rest-control path. Expected revisions are never rebased.
      setState((current) => current.view?.state === "active_workout"
        && current.view.sessionId === sessionId && current.view.restStatus !== result.state.state
        ? { ...current, view: { ...current.view, restStatus: result.state.state } }
        : current);
      reconcileAfterCommit(services, result.state.state === "expired"
        ? { sessionId, restRevision: result.state.revision }
        : undefined);
      return result;
    });
    restCommandQueueRef.current = committed.then(() => undefined, () => undefined);
    return committed;
  }, [reconcileAfterCommit, requireServices]);

  const openRestNotificationSettings = useCallback(() => {
    return requireServices().notifications.openSettings();
  }, [requireServices]);

  const refreshPreciseRestAlarms = useCallback((): Promise<void> => {
    const services = requireServices();
    const refresh = postCommitReconciliationQueueRef.current.then(async () => {
      if (servicesRef.current !== services) return;
      const sessionIds = await services.restRepository.listActiveSessionIds();
      for (const sessionId of sessionIds) {
        const context = await services.restRepository.getRestContext(sessionId);
        if (context?.state.state !== "running"
          || context.state.endsAtMs <= dependencies.nowMs()) continue;
        await services.notifications.cancel(`rest:${sessionId}`);
      }
      if (servicesRef.current !== services) return;
      // Reconciliation reads the latest SQLite rest, rather than replaying a
      // previously captured native notification. Later mutations queue after
      // this pass and replace its derivative with their newer saved deadline.
      const result = await services.lifecycle.trigger("post_commit");
      if (result.outcomes?.some(({ outcome }) => outcome === "platform_failure")) {
        throw new Error("precise_rest_alarm_refresh_failed");
      }
    });
    postCommitReconciliationQueueRef.current = refresh.catch(() => undefined);
    return refresh;
  }, [dependencies, requireServices]);

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
          ? { context: { ...context, state: context.state }, sessionId }
          : null;
      }))).filter((candidate): candidate is NonNullable<typeof candidate> => (
        candidate !== null
      ));
      if (running.length !== 1) {
        return "runtime_contract_unavailable";
      }
      const candidate = running[0]!;
      const { context, sessionId } = candidate;
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

  const expireWorkoutRest = useCallback((input: RestRevisionInput & Readonly<{
    foregroundCountdownTone?: true;
  }>) => runRestCommand(input.sessionId, (repository) => {
      const { foregroundCountdownTone, ...revisionInput } = input;
      const appState = (require("react-native") as typeof import("react-native"))
        .AppState.currentState;
      if (appState === "background" || appState === "inactive") {
        return expireRest({ repository, input: revisionInput });
      }
      const preferences = requireServices().restAlertPreferenceStore.read();
      return expireRestWithForegroundFeedback({
        repository,
        input: {
          ...revisionInput,
          // The dock dispatched its foreground long-cue attempt before expiry.
          // Keep the durable feedback/vibration claim, with that tone owned by
          // the countdown. Background notifications retain saved preferences.
          preferences: foregroundCountdownTone === true
            ? { ...preferences, soundEnabled: false }
            : preferences,
        },
      });
    }), [requireServices, runRestCommand]);

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
    publishCommittedWorkout(services, view);
    reconcileAfterCommit(services);
    return committedSetId === undefined
      ? view
      : Object.freeze({ ...view, committedSetId });
  }, [publishCommittedWorkout, reconcileAfterCommit, requireServices]);

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
      publishCommittedWorkout(services, activeView);
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
  }, [publishCommittedWorkout, reconcileAfterCommit, requireServices]);

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
      publishCommittedWorkout(services, activeView);
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
  }, [publishCommittedWorkout, reconcileAfterCommit, requireServices]);

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
      const context = localContext(dependencies.now());
      const view = await services.repository.getTodayView({ localDate: context.localDate, weekday: context.weekday });
      publishStartedWorkout(services, view);
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
  }, [dependencies, publishStartedWorkout, requireServices]);

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
      publishCommittedWorkout(services, activeView);
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
  }, [publishCommittedWorkout, reconcileAfterCommit, requireServices]);

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
      invalidate: async () => undefined,
      drainEffects: async () => { reconcileAfterCommit(services); },
      input,
    }).then((result) => {
      publishCommittedWorkout(services, result.view);
      return result;
    });
  }, [publishCommittedWorkout, reconcileAfterCommit, requireServices]);

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
    reconcileAfterCommit(services);
    return saved;
  }, [reconcileAfterCommit, requireServices]);

  const undoWorkoutSet = useCallback((input: UndoCompletedSetInput) => {
    const services = requireServices();
    return undoCompletedSet({
      repository: services.workoutRepository,
      input,
    }).then((result) => {
      if (result.outcome === "undone") {
        publishCommittedWorkout(services, result.view);
        reconcileAfterCommit(services);
      }
      return result;
    });
  }, [publishCommittedWorkout, reconcileAfterCommit, requireServices]);

  const runOutcomeMutation = useCallback(async <Result,>(
    mutation: (
      repository: RuntimeOutcomeRepository,
    ) => Promise<Result>,
  ): Promise<Result> => {
    const services = requireServices();
    const result = await mutation(services.outcomeRepository);
    clearCommittedActionFailure(services);
    await services.lifecycle.trigger("post_commit").catch(() => undefined);
    workoutRefreshGenerationRef.current += 1;
    try {
      await refreshTodaySelection(services);
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
  }, [requireServices, refreshTodaySelection, clearCommittedActionFailure]);

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
    // The domain command translates repository failures into a retryable
    // save_failed state; do not duplicate that failure boundary here.
    const result = await applyCompletedWorkoutPlanWriteBack({
      port: services.ownedPlans,
      state: beginCompletedWorkoutPlanWriteBack(retryState),
    });
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

  const commitRecommendationDecision = useCallback(async (
    recommendationId: string,
    decision: RecommendationDecision,
  ): Promise<RecommendationDecisionResult> => {
    const fences = await requireServices().kernel.queryAll<{
      evidence_version: number;
      source_revision: number;
      target_revision: number;
      status: string;
    }>(
      `SELECT evidence_version, source_revision, target_revision, status
         FROM progression_recommendations WHERE id = ?
       UNION ALL
       SELECT evidence_version, source_revision, target_revision, status
         FROM owned_progression_recommendations WHERE id = ?`,
      [recommendationId, recommendationId],
    );
    const fence = fences.length === 1 ? fences[0] : undefined;
    if (fence === undefined
      || !["pending", "accepted", "rejected", "superseded"].includes(fence.status)
      || !Number.isSafeInteger(fence.evidence_version)
      || fence.evidence_version < 1
      || !Number.isSafeInteger(fence.source_revision)
      || fence.source_revision < 1
      || !Number.isSafeInteger(fence.target_revision)
      || fence.target_revision < 1) {
      throw new Error("recommendation_revision_fence_unavailable");
    }
    const command: RecommendationDecisionInput = Object.freeze({
      recommendationId,
      requestId: createProgressId(`recommendation-${decision === "use_target" ? "use" : "keep"}`),
      decision,
      expectedEvidenceVersion: fence.evidence_version,
      expectedSourceRevision: fence.source_revision,
      expectedTargetRevision: fence.target_revision,
      decidedAtMs: dependencies.nowMs(),
    });
    return runOutcomeMutation((repository) => decision === "use_target"
      ? acceptRecommendation({ repository, input: command })
      : keepCurrentTarget({ repository, input: command }));
  }, [createProgressId, dependencies, requireServices, runOutcomeMutation]);

  const acceptWorkoutRecommendation = useCallback(
    (recommendationId: string) => commitRecommendationDecision(recommendationId, "use_target"),
    [commitRecommendationDecision],
  );

  const keepWorkoutTarget = useCallback(
    (recommendationId: string) => commitRecommendationDecision(recommendationId, "keep_current_target"),
    [commitRecommendationDecision],
  );

  const decideProgressRecommendation = useCallback(async (
    recommendation: ProgressRecommendationReview,
    decision: RecommendationDecision,
  ): Promise<RecommendationDecisionResult> => {
    if (recommendation.lifecycle !== "pending") {
      throw new Error("recommendation_no_longer_actionable");
    }
    return commitRecommendationDecision(recommendation.id, decision);
  }, [commitRecommendationDecision]);

  const progressRecommendationRuntime = useMemo(() => Object.freeze({
    decide: decideProgressRecommendation,
  }), [decideProgressRecommendation]);

  const phase17ActionEnvelopeSource = useCallback(() => {
    if (!phase17NativeContractEnabled()) throw new Error("phase17_action_envelope_unavailable");
    if (phase17ActionEnvelopeSourceRef.current !== null) return phase17ActionEnvelopeSourceRef.current;
    const services = requireServices();
    const { default: Constants } = require("expo-constants") as typeof import("expo-constants");
    phase17ActionEnvelopeSourceRef.current = createPhase17ActionEnvelopeSource({
      contracts: PHASE17_CASE_ACTION_CONTRACTS,
      identity: () => ({
        packageName: Constants.expoConfig?.android?.package ?? Constants.expoConfig?.ios?.bundleIdentifier,
        buildProfile: Constants.expoConfig?.extra?.buildProfile,
        nativeContractsEnabled: Constants.expoConfig?.extra?.nativeContractsEnabled === true,
        suite: Constants.expoConfig?.extra?.nativeContractSuite,
      }),
      store: {
        read: async () => {
          const [row] = await services.kernel.queryAll<Readonly<{ value_json: string }>>("SELECT value_json FROM app_settings WHERE key = ?", [PHASE17_ACTION_ENVELOPE_SETTING_KEY]);
          if (row === undefined) return null;
          try { return JSON.parse(row.value_json); } catch { throw new Error("phase17_action_envelope_invalid"); }
        },
        write: async (context) => {
          await services.kernel.write((transaction) => transaction.execute(
            `INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms)
             VALUES (?, 1, ?, 1, ?)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
               revision = app_settings.revision + 1, updated_at_ms = excluded.updated_at_ms`,
            [PHASE17_ACTION_ENVELOPE_SETTING_KEY, JSON.stringify(context), dependencies.nowMs()],
          ));
        },
        clear: async (context) => {
          const result = await services.kernel.write((transaction) => transaction.execute(
            "DELETE FROM app_settings WHERE key = ? AND value_json = ?",
            [PHASE17_ACTION_ENVELOPE_SETTING_KEY, JSON.stringify(context)],
          ));
          if (result.changes !== 1) throw new Error("phase17_action_envelope_clear_token_mismatch");
        },
      },
    });
    return phase17ActionEnvelopeSourceRef.current;
  }, [dependencies, requireServices]);

  const phase17FixtureProtocol = useCallback(() => {
    if (!phase17NativeContractEnabled()) throw new Error("phase17_fixture_unavailable");
    if (phase17FixtureProtocolRef.current !== null) return phase17FixtureProtocolRef.current;
    const services = requireServices();
    const { CryptoDigestAlgorithm, digestStringAsync, randomUUID } = require("expo-crypto") as typeof import("expo-crypto");
    const { default: Constants } = require("expo-constants") as typeof import("expo-constants");
    const fixtureSetupIds = createPhase17FixtureSetupIdentityFactory({
      identity: () => ({
        packageName: Constants.expoConfig?.android?.package ?? Constants.expoConfig?.ios?.bundleIdentifier,
        buildProfile: Constants.expoConfig?.extra?.buildProfile,
        nativeContractsEnabled: Constants.expoConfig?.extra?.nativeContractsEnabled === true,
        suite: Constants.expoConfig?.extra?.nativeContractSuite,
      }),
    });
    assertPhase17FamilyARegistry(PHASE17_CASE_ACTION_CONTRACTS);
    assertPhase17FamilyBRegistry(PHASE17_CASE_ACTION_CONTRACTS);
    assertPhase17FamilyCRegistry(PHASE17_CASE_ACTION_CONTRACTS);
    const physicalTable = (sourceTable: string) => ({
      library_view_state: "app_settings", library_action_state: "app_settings", plan_create_intent: "plans",
      owned_plans: "plans",
      exercise_search_index: "exercise_search_terms", exercise_preferences: "exercise_owner_preferences",
      owned_plan_lifecycle_receipts: "owned_plan_mutation_requests", owned_plan_revisions: "plans",
      plan_schedule_slots: "owned_plan_schedules", plan_exercise_replacements: "owned_plan_mutation_requests",
      plan_day_revisions: "plan_days", custom_exercises: "exercises",
      custom_exercise_metric_migrations: "metric_profile_migration_events",
      library_load_receipts: "app_settings", starter_plan_catalog: "starter_plan_sources",
      starter_plan_activations: "starter_plan_activation_requests", template_update_receipts: "starter_plan_copy_requests",
      exercise_instruction_sets: "exercise_instruction_sets",
      running_plan_aggregates: "running_plans", running_plan_revisions: "running_goals",
      running_session_revisions: "running_session_revisions", running_session_slots: "running_session_slots",
      running_plan_receipts: "running_plan_receipts",
    } as Readonly<Record<string, string>>)[sourceTable] ?? sourceTable;
    phase17FixtureProtocolRef.current = createPhase17FixtureProtocol({
      contracts: PHASE17_CASE_ACTION_CONTRACTS,
      createToken: () => `phase17:${randomUUID().replace(/[^a-z0-9-]/gu, "")}`,
      adapter: createPhase17FamilyFixtureAdapter({
        baselineDigest: async () => (await collectPhase14SourceStateProofFromKernel({ kernel: services.kernel, sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value) })).digest_sha256,
        canonicalHash: async (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(value, Object.keys(value).sort())),
        finalizeCleanup: async (input) => {
          const contract = PHASE17_CASE_ACTION_CONTRACTS.find(({ id }) => id === input.caseId);
          if (contract === undefined) throw new Error("phase17_fixture_case_invalid");
          if (contract.proofMode === "mutating") {
            await phase17ActionEnvelopeSource().clear(input);
          }
          // This awaited no-op write drains the kernel's serialized write queue
          // after family cleanup and test-control deletion before digesting.
          await services.kernel.write(async () => undefined);
        },
        familyB: createPhase17FamilyBFixtureDriver({
          kernel: services.kernel,
          running: createRunningPlanRuntimePort(services.kernel, {
            nowMs: dependencies.nowMs,
            randomUUID,
            sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
          }),
          sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
        }),
        familyC: createPhase17FamilyCFixtureDriver({
          kernel: services.kernel,
          graph: {
            setupGraph: async (fixtureToken, choice) => {
              const suffix = `${fixtureToken.slice("phase17:".length)}:${choice}`;
              const runningPlanId = `phase17:running-plan:${suffix}`;
              const strength = await services.ownedPlans.createFixtureDraft({
                requestId: `phase17:fixture:collision-strength:${suffix}:setup`,
                planId: `phase17:collision-strength-plan:${suffix}`,
                dayId: `phase17:collision-strength-day:${suffix}`,
                name: "Phase 17 collision Strength",
                dayName: "Fixture day",
              });
              if (strength.outcome !== "committed") throw new Error("phase17_collision_strength_create_failed");
              const runningPort = createRunningPlanRuntimePort(services.kernel, { nowMs: dependencies.nowMs, randomUUID, sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value) });
              const now = dependencies.nowMs();
              let running = await runningPort.createInactivePlan({ plan: {
                version: 1, id: runningPlanId, name: "Phase 17 collision Running", revision: 1, createdAtMs: now,
                goal: { version: 1, id: `phase17:running-goal:${suffix}`, planId: runningPlanId, revision: 1, goalDistanceMeters: 5_000, targetDurationMs: 1_800_000, trainingDays: ["Monday"], runsPerWeek: 1, longRunDay: "Monday", currentWeeklyDistanceMeters: 10_000, createdAtMs: now }, sessions: [],
              } });
              running = (await runningPort.saveSession({ planId: running.id, expectedPlanRevision: running.revision, requestId: `phase17:collision-recovery:${suffix}`, session: { sessionKind: "recovery", weekday: "Monday", phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "duration", durationMs: 1_800_000 }] }], advisoryTarget: { rpe: 4 }, contextual: {} } })).plan;
              const runningScheduleId = `phase17:collision-running-schedule:${suffix}`;
              const runningVersionId = `phase17:collision-running-version:${suffix}`;
              const strengthScheduleId = `phase17:collision-strength-schedule:${suffix}`;
              const strengthVersionId = `phase17:collision-strength-version:${suffix}`;
              const runningOpportunityId = `phase17:collision-running-opportunity:${suffix}`;
              const strengthOpportunityId = `phase17:collision-strength-opportunity:${suffix}`;
              const localDate = "2026-11-09";
              const slot = running.sessions[0];
              if (slot === undefined) throw new Error("phase17_collision_running_readback_missing");
              await services.kernel.write(async (transaction) => {
                await transaction.execute("INSERT INTO owned_plan_schedules (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind) VALUES (?, ?, 'active', 1, ?, NULL, 'running')", [runningScheduleId, runningPlanId, now]);
                await transaction.execute("INSERT INTO owned_plan_schedule_versions (id, schedule_id, version_number, effective_local_date, mode, timezone, rotation_pointer, created_at_ms) VALUES (?, ?, 1, ?, 'weekday', 'Asia/Singapore', NULL, ?)", [runningVersionId, runningScheduleId, localDate, now]);
                await transaction.execute("INSERT INTO owned_plan_schedules (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind) VALUES (?, ?, 'active', 1, ?, NULL, 'strength')", [strengthScheduleId, strength.plan.id, now]);
                await transaction.execute("INSERT INTO owned_plan_schedule_versions (id, schedule_id, version_number, effective_local_date, mode, timezone, rotation_pointer, created_at_ms) VALUES (?, ?, 1, ?, 'weekday', 'Asia/Singapore', NULL, ?)", [strengthVersionId, strengthScheduleId, localDate, now]);
                await transaction.execute("INSERT INTO owned_plan_schedule_opportunities (id, schedule_id, schedule_version_id, local_date, source, plan_day_id, state, outcome, session_id, revision, consumed_at_ms) VALUES (?, ?, ?, ?, 'weekday', ?, 'pending', NULL, NULL, 1, NULL)", [strengthOpportunityId, strengthScheduleId, strengthVersionId, localDate, strength.plan.days[0]!.id]);
                await transaction.execute("INSERT INTO running_opportunities (id, plan_id, schedule_id, schedule_version_id, slot_id, local_date, timezone, session_revision_id, state, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, 'Asia/Singapore', ?, 'planned', ?)", [runningOpportunityId, runningPlanId, runningScheduleId, runningVersionId, slot.slot.id, localDate, slot.session.id, now]);
              });
              return Object.freeze({ choice, runningPlanId, strengthPlanId: strength.plan.id, runningOpportunityId, strengthOpportunityId, runningScheduleId, strengthScheduleId, localDate });
            },
            cleanupGraph: async (graph) => {
              await services.kernel.write(async (transaction) => {
                await transaction.execute("DELETE FROM owned_plan_schedule_opportunities WHERE id = ?", [graph.strengthOpportunityId]);
                await transaction.execute("DELETE FROM running_opportunities WHERE id = ?", [graph.runningOpportunityId]);
                await transaction.execute("DELETE FROM owned_plan_schedule_versions WHERE schedule_id IN (?, ?)", [graph.runningScheduleId, graph.strengthScheduleId]);
                await transaction.execute("DELETE FROM owned_plan_schedules WHERE id IN (?, ?)", [graph.runningScheduleId, graph.strengthScheduleId]);
                await transaction.execute("DELETE FROM running_plan_events WHERE plan_id = ?", [graph.runningPlanId]);
                await transaction.execute("DELETE FROM running_plan_receipts WHERE plan_id = ?", [graph.runningPlanId]);
                await transaction.execute("DELETE FROM running_goals WHERE plan_id = ?", [graph.runningPlanId]);
                await transaction.execute("DELETE FROM running_session_slot_revisions WHERE slot_root_id IN (SELECT id FROM running_session_slot_roots WHERE plan_id = ?)", [graph.runningPlanId]);
                await transaction.execute("DELETE FROM running_session_slots WHERE plan_id = ?", [graph.runningPlanId]);
                await transaction.execute("DELETE FROM running_session_slot_roots WHERE plan_id = ?", [graph.runningPlanId]);
                await transaction.execute("DELETE FROM running_session_revisions WHERE plan_id = ?", [graph.runningPlanId]);
                await transaction.execute("DELETE FROM running_session_roots WHERE plan_id = ?", [graph.runningPlanId]);
                await transaction.execute("DELETE FROM running_plans WHERE plan_id = ?", [graph.runningPlanId]);
                await transaction.execute("DELETE FROM plans WHERE id = ?", [graph.runningPlanId]);
                await transaction.execute("DELETE FROM owned_plan_aggregate_states WHERE plan_id = ?", [graph.strengthPlanId]);
                await transaction.execute("DELETE FROM plan_days WHERE plan_id = ?", [graph.strengthPlanId]);
                await transaction.execute("DELETE FROM plans WHERE id = ?", [graph.strengthPlanId]);
              });
            },
            sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
            nowMs: dependencies.nowMs,
          },
        }),
        familyA: {
          selectorSchema: (caseId, proofMode) => phase17FamilyASelectorSchema(caseId, proofMode),
        seed: async (caseId, fixtureToken, sourceTable) => {
          const contract = PHASE17_CASE_ACTION_CONTRACTS.find(({ id }) => id === caseId);
          if (contract === undefined) throw new Error("phase17_fixture_case_invalid");
          fixtureSetupIds.begin(fixtureToken);
          try {
          const owned = await services.ownedPlans.createFixtureDraft({
            requestId: fixtureSetupIds.requestId("owned-plan-create"),
            planId: fixtureSetupIds.ownedPlanId(),
            dayId: fixtureSetupIds.ownedPlanDayId(),
            name: `Phase17 ${caseId}`,
            dayName: "Fixture day",
          });
          if (owned.outcome === "requires_schedule_impact") throw new Error("phase17_fixture_seed_failed");
          const customId = fixtureSetupIds.customExerciseId();
          const custom = await createCustomExerciseCommand({
            repository: services.customExerciseRepository,
            invalidate: async () => undefined,
            input: {
              requestId: fixtureSetupIds.requestId("custom-exercise-create"),
              exerciseId: customId,
              name: `Phase17 exercise ${caseId}`, aliases: ["Phase17"], exerciseType: "strength",
              movementClass: "compound", primaryMuscles: ["quadriceps"], secondaryMuscles: [], equipment: ["barbell"],
              metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 }, defaultRestSeconds: 60,
              createdAtMs: dependencies.nowMs(),
            },
          });
          const fixtureDay = owned.plan.days[0];
          if (fixtureDay === undefined) throw new Error("phase17_fixture_seed_failed");
          const suffix = fixtureToken.slice("phase17:".length);
          const enriched = await services.ownedPlans.savePlan({
            requestId: fixtureSetupIds.requestId("owned-plan-save"),
            expectedRevision: owned.plan.revision,
            plan: {
              id: owned.plan.id,
              name: owned.plan.name,
              days: [{
                id: fixtureDay.id,
                name: fixtureDay.name,
                ordinal: fixtureDay.ordinal,
                occurrences: [{
                  id: `phase17:owned-plan-occurrence:${suffix}`,
                  exerciseId: custom.exercise.exerciseId,
                  ordinal: 0,
                  restSeconds: 60,
                  metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
                  warmups: [{ id: `phase17:owned-plan-warmup:${suffix}`, ordinal: 0, loadGrams: 10_000, reps: 5 }],
                  targets: [{
                    id: `phase17:owned-plan-target:${suffix}`,
                    ordinal: 0,
                    target: { profile: "load_reps", version: 1, loadGrams: 20_000, minReps: 8, maxReps: 12, incrementGrams: 2_500, perSide: false },
                    units: { version: 1, load: "grams", count: "repetitions" },
                  }],
                  policy: {
                    id: `phase17:owned-plan-policy:${suffix}`,
                    kind: "manual_hold",
                    policyId: "manual-hold-v1",
                    version: 1,
                    rule: { kind: "manual_hold", id: "manual-hold-v1", version: 1 },
                  },
                }],
              }],
            },
          });
          if (enriched.outcome === "requires_schedule_impact") throw new Error("phase17_fixture_seed_failed");
          const [row, bundled, starter] = await Promise.all([
            services.kernel.queryAll<Readonly<{ id: string; revision: number; is_active: number }>>(
            "SELECT id, revision, is_active FROM plans WHERE id = ? AND name = ?",
            [owned.plan.id, `Phase17 ${caseId}`],
            ),
            services.kernel.queryAll<Readonly<{ exercise_id: string }>>("SELECT exercise_id FROM exercise_library_entries ORDER BY exercise_id LIMIT 1"),
            services.kernel.queryAll<Readonly<{ template_id: string }>>("SELECT template_id FROM starter_plan_sources ORDER BY template_id LIMIT 1"),
          ]);
          const plan = row[0]; const bundledExerciseId = bundled[0]?.exercise_id; const starterTemplateId = starter[0]?.template_id;
          if (plan === undefined || bundledExerciseId === undefined || starterTemplateId === undefined || custom.exercise.exerciseId !== customId) throw new Error("phase17_fixture_seed_failed");
          const actionReceiptId = contract.proofMode === "mutating" ? phase17FixtureActionReceiptId(caseId, fixtureToken) : null;
          const selectors = Object.freeze({ ownedPlanId: plan.id, customExerciseId: custom.exercise.exerciseId, bundledExerciseId, starterTemplateId });
          const actionInputs = Object.freeze(actionReceiptId === null ? {} : { phase17ActionReceiptId: actionReceiptId });
          const facts = Object.freeze({ caseId, fixtureToken, ownedPlanId: plan.id, customExerciseId: custom.exercise.exerciseId, bundledExerciseId, starterTemplateId, sourceTable: physicalTable(sourceTable) });
          const expectedPostState = actionReceiptId === null ? facts : Object.freeze({ caseId, fixtureToken, ownedPlanId: plan.id, customExerciseId: custom.exercise.exerciseId, bundledExerciseId, starterTemplateId, sourceTable: physicalTable(sourceTable), actionReceiptId, action: contract.action });
          return Object.freeze({ selectors, actionInputs, expectedPreState: facts, expectedPostState, actionReceiptId });
          } finally {
            fixtureSetupIds.end(fixtureToken);
          }
        },
        probe: async (caseId, fixtureToken, sourceTable, selectors) => {
          const contract = PHASE17_CASE_ACTION_CONTRACTS.find(({ id }) => id === caseId);
          if (contract === undefined) throw new Error("phase17_fixture_case_invalid");
          const table = physicalTable(sourceTable);
          const customExerciseId = selectors.customExerciseId;
          const bundledExerciseId = selectors.bundledExerciseId;
          const ownedPlanId = selectors.ownedPlanId;
          const starterTemplateId = selectors.starterTemplateId;
          if (customExerciseId === undefined || bundledExerciseId === undefined || ownedPlanId === undefined || starterTemplateId === undefined) throw new Error("phase17_fixture_selector_invalid");
          const actionReceiptId = contract.proofMode === "mutating" ? phase17FixtureActionReceiptId(caseId, fixtureToken) : undefined;
          const requireCommittedJson = (value: string) => {
            try {
              const parsed = JSON.parse(value) as { outcome?: unknown };
              if (parsed.outcome !== "committed") throw new Error("invalid");
              return parsed;
            } catch {
              throw new Error("phase17_family_a_action_receipt_missing");
            }
          };
          let rowCount = 0;
          if (contract.proofMode === "read_only") {
            const rows = await (async () => {
              switch (table) {
                case "plans": return services.kernel.queryAll("SELECT id FROM plans WHERE id = ? AND origin IN ('custom', 'copied')", [ownedPlanId]);
                case "exercises": return services.kernel.queryAll("SELECT id FROM exercises WHERE id = ? AND origin = 'custom'", [customExerciseId]);
                case "exercise_search_terms": return services.kernel.queryAll("SELECT exercise_id FROM exercise_search_terms WHERE exercise_id = ?", [bundledExerciseId]);
                case "exercise_owner_preferences": return services.kernel.queryAll("SELECT exercise_id FROM exercise_owner_preferences WHERE exercise_id = ?", [bundledExerciseId]);
                case "exercise_instruction_sets": return services.kernel.queryAll("SELECT exercise_id FROM exercise_instruction_sets WHERE exercise_id = ?", [bundledExerciseId]);
                case "starter_plan_sources": return services.kernel.queryAll("SELECT template_id FROM starter_plan_sources WHERE template_id = ?", [starterTemplateId]);
                default: throw new Error("phase17_fixture_table_unseeded");
              }
            })();
            if (rows.length !== 1) throw new Error("phase17_fixture_probe_failed");
            rowCount = rows.length;
          }
          const customReceiptKind = ({
            "library.exercise-favorites": "favorite",
            "library.custom-exercise": "archive",
            "library.create-exercise": "create",
          } as Readonly<Record<string, string>>)[caseId];
          if (customReceiptKind !== undefined && actionReceiptId !== undefined) {
            const [receipt] = await services.kernel.queryAll<Readonly<{
              mutation_kind: string;
              request_json: string;
              result_json: string;
            }>>(
              `SELECT mutation_kind, request_json, result_json
               FROM custom_exercise_mutation_receipts
               WHERE request_id = ?`,
              [actionReceiptId],
            );
            if (receipt === undefined || receipt.mutation_kind !== customReceiptKind
              || !receipt.request_json.includes(actionReceiptId)) {
              throw new Error("phase17_family_a_action_receipt_missing");
            }
            const result = requireCommittedJson(receipt.result_json) as {
              exercise?: { exerciseId?: unknown; revision?: unknown };
              exerciseId?: unknown;
              preferenceRevision?: unknown;
            };
            const exerciseId = result.exercise?.exerciseId ?? result.exerciseId;
            if (typeof exerciseId !== "string") throw new Error("phase17_family_a_action_receipt_missing");
            const request = JSON.parse(receipt.request_json) as { expectedExerciseRevision?: unknown };
            const exerciseRevision = result.exercise?.revision
              ?? (typeof request.expectedExerciseRevision === "number" ? request.expectedExerciseRevision + 1 : undefined);
            if (customReceiptKind === "favorite" && !Number.isSafeInteger(result.preferenceRevision)) throw new Error("phase17_family_a_action_receipt_missing");
            if (customReceiptKind !== "favorite" && !Number.isSafeInteger(exerciseRevision)) throw new Error("phase17_family_a_action_receipt_missing");
            const entities = customReceiptKind === "favorite"
              ? await services.kernel.queryAll("SELECT exercise_id FROM exercise_owner_preferences WHERE exercise_id = ? AND revision = ?", [exerciseId, result.preferenceRevision as number])
              : await services.kernel.queryAll("SELECT id FROM exercises WHERE id = ? AND revision = ?", [exerciseId, exerciseRevision as number]);
            if (entities.length !== 1) throw new Error("phase17_family_a_action_receipt_missing");
            rowCount = entities.length;
          }
          if (caseId === "library.copy-metric-migration" && actionReceiptId !== undefined) {
            const [receipt] = await services.kernel.queryAll<Readonly<{
              exercise_id: string;
              to_exercise_metric_generation: number;
              exercise_revision: number;
              result_json: string;
            }>>(
              `SELECT exercise_id, to_exercise_metric_generation, exercise_revision, result_json FROM metric_profile_migration_events
               WHERE idempotency_key = ?`,
              [actionReceiptId],
            );
            if (receipt === undefined) {
              throw new Error("phase17_family_a_action_receipt_missing");
            }
            requireCommittedJson(receipt.result_json);
            const entities = await services.kernel.queryAll("SELECT id FROM exercises WHERE id = ? AND revision = ? AND exercise_metric_generation = ?", [receipt.exercise_id, receipt.exercise_revision, receipt.to_exercise_metric_generation]);
            if (entities.length !== 1) throw new Error("phase17_family_a_action_receipt_missing");
            rowCount = entities.length;
          }
          if (["library.true-no-plans", "library.owned-lifecycle", "library.create-strength", "library.plan-editor"].includes(caseId) && actionReceiptId !== undefined) {
            const [receipt] = await services.kernel.queryAll<Readonly<{ operation: string; result_plan_id: string; result_revision: number; result_json: string }>>(
              "SELECT operation, result_plan_id, result_revision, result_json FROM owned_plan_mutation_requests WHERE request_id = ?",
              [actionReceiptId],
            );
            const expectedOperation = caseId === "library.owned-lifecycle"
              ? "archive"
              : caseId === "library.true-no-plans"
                ? "create"
                : "save";
            if (receipt === undefined || receipt.operation !== expectedOperation) throw new Error("phase17_family_a_action_receipt_missing");
            requireCommittedJson(receipt.result_json);
            const entities = await services.kernel.queryAll(
              caseId === "library.owned-lifecycle"
                ? "SELECT plan.id FROM plans plan JOIN owned_plan_aggregate_states state ON state.plan_id = plan.id WHERE plan.id = ? AND plan.revision = ? AND plan.origin IN ('custom', 'copied') AND state.lifecycle = 'archived'"
                : "SELECT id FROM plans WHERE id = ? AND revision = ? AND origin IN ('custom', 'copied')",
              [receipt.result_plan_id, receipt.result_revision],
            );
            if (entities.length !== 1) throw new Error("phase17_family_a_action_receipt_missing");
            rowCount = entities.length;
          }
          if (caseId === "library.starter-activation" && actionReceiptId !== undefined) {
            const [receipt] = await services.kernel.queryAll<Readonly<{ result_plan_id: string; result_schedule_id: string; result_json: string }>>(
              "SELECT result_plan_id, result_schedule_id, result_json FROM starter_plan_activation_requests WHERE request_id = ?",
              [actionReceiptId],
            );
            if (receipt === undefined) throw new Error("phase17_family_a_action_receipt_missing");
            requireCommittedJson(receipt.result_json);
            const entities = await services.kernel.queryAll("SELECT plan.id FROM plans plan JOIN owned_plan_schedules schedule ON schedule.plan_id = plan.id WHERE plan.id = ? AND plan.is_active = 1 AND schedule.id = ? AND schedule.lifecycle = 'active' AND plan.revision >= 1 AND schedule.revision >= 1", [receipt.result_plan_id, receipt.result_schedule_id]);
            if (entities.length !== 1) throw new Error("phase17_family_a_action_receipt_missing");
            rowCount = entities.length;
          }
          if (["library.schedule-editor", "library.replacement-impact", "library.day-removal-impact"].includes(caseId) && actionReceiptId !== undefined) {
            const eventId = caseId === "library.schedule-editor" ? `schedule-command:${actionReceiptId}` : `plan-impact-command:${actionReceiptId}`;
            const [event] = await services.kernel.queryAll<Readonly<{ schedule_id: string; schedule_revision: number; local_date: string | null; payload_json: string }>>(
              "SELECT schedule_id, schedule_revision, local_date, payload_json FROM owned_plan_schedule_events WHERE id = ?",
              [eventId],
            );
            if (event === undefined || event.local_date === null) throw new Error("phase17_family_a_action_receipt_missing");
            const payload = JSON.parse(event.payload_json) as { result?: { outcome?: unknown; planId?: unknown; planRevision?: unknown; scheduleRevision?: unknown } };
            if (payload.result?.outcome !== "committed" || typeof payload.result.planId !== "string" || typeof payload.result.planRevision !== "number" || !Number.isSafeInteger(payload.result.planRevision) || payload.result.scheduleRevision !== event.schedule_revision) throw new Error("phase17_family_a_action_receipt_missing");
            const entities = await services.kernel.queryAll("SELECT plan.id FROM plans plan JOIN owned_plan_schedules schedule ON schedule.plan_id = plan.id WHERE plan.id = ? AND plan.revision = ? AND schedule.id = ? AND schedule.revision = ?", [payload.result.planId, payload.result.planRevision, event.schedule_id, event.schedule_revision]);
            if (entities.length !== 1) throw new Error("phase17_family_a_action_receipt_missing");
            rowCount = entities.length;
          }
          const facts = contract.proofMode === "mutating"
            ? Object.freeze({ caseId, fixtureToken, ownedPlanId, customExerciseId, bundledExerciseId, starterTemplateId, sourceTable: table, actionReceiptId, action: contract.action })
            : Object.freeze({ caseId, fixtureToken, ownedPlanId, customExerciseId, bundledExerciseId, starterTemplateId, sourceTable: table });
          if (rowCount !== 1) throw new Error("phase17_family_a_action_receipt_missing");
          return Object.freeze({ rowCount, identityHash: await digestStringAsync(CryptoDigestAlgorithm.SHA256, `${fixtureToken}:${table}:${JSON.stringify(facts)}`), facts });
        },
        cleanup: async (caseId, fixtureToken, selectors) => {
          const ownedPlanId = selectors.ownedPlanId;
          const customExerciseId = selectors.customExerciseId;
          if (ownedPlanId === undefined || customExerciseId === undefined) throw new Error("phase17_fixture_selector_invalid");
          const manifest = createPhase17FamilyACleanupManifest(caseId, fixtureToken, { ownedPlanId, customExerciseId });
          await cleanupPhase17FamilyAManifest(services.kernel, manifest);
        },
        },
      }),
    });
    return phase17FixtureProtocolRef.current;
  }, [requireServices]);

  const value = useMemo<RuntimeValue>(() => ({
    ...state,
    nowMs: dependencies.nowMs,
    runningPlanRuntime: state.launchState === "trusted"
      ? requireServices().runningPlans
      : null,
    garminImport,
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
    collectPhase20QualitySourceProof: () => {
      if (!phase20QualitySourceProofEnabled()) {
        return Promise.reject(new Error("phase20_quality_source_proof_unavailable"));
      }
      const {
        CryptoDigestAlgorithm,
        digestStringAsync,
      } = require("expo-crypto") as typeof import("expo-crypto");
      return collectPhase20QualityWorkloadProof({
        kernel: requireServices().kernel,
        sha256: (value) =>
          digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
      });
    },
    prepareV12NativeAcceptanceProductCase: async (request) => {
      if (!phase20QualitySourceProofEnabled()) {
        throw new Error("v12_native_acceptance_executor_unavailable");
      }
      const services = requireServices();
      v12NativeAcceptanceProductRequestRef.current = request;
      const { CryptoDigestAlgorithm, digestStringAsync } = require("expo-crypto") as typeof import("expo-crypto");
      const prepared = await prepareV12NativeAcceptanceProductCaseFromKernel({
        kernel: services.kernel,
        request,
        sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
        prepareOperation: ({ contract, request: operationRequest }) =>
          prepareV12NativeAcceptanceProductionOperation({
            kernel: services.kernel,
            contract,
            request: operationRequest,
            runtime: {
              running: services.runningPlans,
              ownedPlans: services.ownedPlans,
              customExercises: services.customExerciseRepository,
            },
          }),
      });
      v12NativeAcceptancePreparedProductCases.set(
        `${request.shard}:${request.caseId}:${request.nonce}`,
        prepared,
      );
      setState(await trustedRead(services));
      return prepared;
    },
    readV12NativeAcceptanceReceipt: async (request) => {
      if (!phase20QualitySourceProofEnabled()) {
        throw new Error("v12_native_acceptance_executor_unavailable");
      }
      const key = `${request.shard}:${request.caseId}:${request.nonce}`;
      const preparedProductCase = v12NativeAcceptancePreparedProductCases.get(key);
      if (preparedProductCase === undefined) {
        throw new Error("v12_native_acceptance_prepared_case_missing");
      }
      const services = requireServices();
      const { CryptoDigestAlgorithm, digestStringAsync } = require("expo-crypto") as typeof import("expo-crypto");
      const readbacks = await readV12NativeAcceptanceReceiptFromKernel({
        kernel: services.kernel,
        request,
        preparedProductCase,
        sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
      });
      v12NativeAcceptancePreparedProductCases.delete(key);
      v12NativeAcceptanceProductRequestRef.current = null;
      return readbacks;
    },
    triggerPhase20ProgressRebuild: async () => {
      if (!phase20QualitySourceProofEnabled()) {
        throw new Error("phase20_quality_progress_rebuild_unavailable");
      }
      await requireServices().kernel.write((transaction) => transaction.execute(
        "UPDATE history_projection_freshness SET applied_revision = applied_revision - 1 WHERE applied_revision > 0",
      ));
    },
    collectPhase17SourceStateProof: () => {
      if (!phase17NativeContractEnabled()) {
        return Promise.reject(new Error("phase17_source_state_proof_unavailable"));
      }
      const { CryptoDigestAlgorithm, digestStringAsync } = require("expo-crypto") as typeof import("expo-crypto");
      return collectPhase14SourceStateProofFromKernel({
        kernel: requireServices().kernel,
        sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
      });
    },
    setupPhase17Fixture: async (caseId) => {
      const fixture = await phase17FixtureProtocol().setup(caseId);
      if (fixture.actionReceiptId !== null) {
        const cleanupManifest = isPhase17FamilyACaseId(fixture.caseId)
          ? createPhase17FamilyACleanupManifest(fixture.caseId, fixture.fixtureToken, {
            ownedPlanId: fixture.selectors.ownedPlanId!,
            customExerciseId: fixture.selectors.customExerciseId!,
          })
          : undefined;
        await phase17ActionEnvelopeSource().activate({
          caseId: fixture.caseId,
          fixtureToken: fixture.fixtureToken,
          envelopes: phase17ActionEnvelopePlan(fixture.caseId, fixture.fixtureToken),
          ...(cleanupManifest === undefined ? {} : { cleanupManifest }),
        });
      }
      return fixture;
    },
    probePhase17Fixture: (input) => phase17FixtureProtocol().probe(input),
    cleanupPhase17Fixture: async (input) => {
      if (PHASE17_CASE_ACTION_CONTRACTS.some(({ id, proofMode }) => id === input.caseId && proofMode === "mutating")) {
        const source = phase17ActionEnvelopeSource();
        await source.assertConsumed(input);
        if (isPhase17FamilyACaseId(input.caseId)) {
          const cleanupManifest = createPhase17FamilyACleanupManifest(input.caseId, input.fixtureToken, {
            ownedPlanId: `phase17:owned-plan:${input.fixtureToken.slice("phase17:".length)}`,
            customExerciseId: `phase17:custom:${input.fixtureToken.slice("phase17:".length)}`,
          });
          await source.updateCleanupManifest({
            ...input,
            cleanupManifest: await materializePhase17FamilyACleanupManifest(requireServices().kernel, cleanupManifest),
          });
        }
      }
      return phase17FixtureProtocol().cleanup(input);
    },
    hydratePhase17ActionEnvelopes: async (input) => {
      const active = await phase17ActionEnvelopeSource().hydrate();
      if (active === null || active.caseId !== input.caseId || active.fixtureToken !== input.fixtureToken) {
        throw new Error("phase17_action_envelope_token_mismatch");
      }
      return true;
    },
    createPhase17ActionRequestId: async (label, productionRequestId) => {
      if (!phase17NativeContractEnabled()) return productionRequestId;
      const source = phase17ActionEnvelopeSourceRef.current;
      if (source === null) throw new Error("phase17_action_envelope_missing");
      const requestId = await source.reserveCached(label);
      if (requestId === null) throw new Error("phase17_action_envelope_missing");
      return requestId;
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
    createCustomCopy: createRuntimeCustomCopy,
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
    getSessionDetailAtRevision,
    getCalendarSessionDetail,
    loadGarminRevisionReview,
    listGarminRevisionReviews,
    resolveGarminRevision,
    loadImportedActivityDetail,
    loadRunningActivityMatch,
    confirmActivityMatch,
    unmatchActivityMatch,
    reassignActivityMatch,
    loadHistoryCorrectionSession,
    listAvailableCorrectionExercises,
    correctHistorySession: correctRuntimeHistorySession,
    removeHistorySession: removeRuntimeHistorySession,
    restoreHistorySession: restoreRuntimeHistorySession,
    loadCalendarMonth,
    loadCalendarRange,
    loadPlannedStrengthOccurrence,
    listRemovedHistorySessions,
    loadExerciseMetricHistory,
    loadProgress,
    progressRunningTargetRuntime,
    progressRecommendationRuntime,
    progressBodyweightRuntime,
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
    deleteLibraryPlan,
    retryLibraryLoad,
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
    refreshPreciseRestAlarms,
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
    saveSchedule: async (input) => {
      const services = requireServices();
      const requestId = await phase17RequestId("schedule-save", services.ownedPlans.createId("schedule-save"));
      return services.schedules.saveSchedule({ ...input, requestId });
    },
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
    createRuntimeCustomCopy,
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
    garminImport,
    getActiveWorkout,
    getSessionDetail,
    getSessionDetailAtRevision,
    getCalendarSessionDetail,
    loadGarminRevisionReview,
    listGarminRevisionReviews,
    resolveGarminRevision,
    loadImportedActivityDetail,
    loadRunningActivityMatch,
    confirmActivityMatch,
    unmatchActivityMatch,
    reassignActivityMatch,
    loadHistoryCorrectionSession,
    listAvailableCorrectionExercises,
    correctRuntimeHistorySession,
    removeRuntimeHistorySession,
    restoreRuntimeHistorySession,
    loadCalendarMonth,
    loadCalendarRange,
    loadPlannedStrengthOccurrence,
    listRemovedHistorySessions,
    loadExerciseMetricHistory,
    loadProgress,
    progressRunningTargetRuntime,
    progressRecommendationRuntime,
    progressBodyweightRuntime,
    initialize,
    keepWorkoutTarget,
    listLibraryRecentExercises,
    loadLibrary,
    deleteLibraryPlan,
    loadRuntimeCustomExercise,
    loadRuntimeCustomExerciseMigration,
    loadStarterActivationPreview,
    loadStarterPlan,
    loadStarterTemplateUpdate,
    openRestNotificationSettings,
    refreshPreciseRestAlarms,
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

  const calendarRangeRead = useMemo(
    () => createCalendarRangeReadPort(value),
    [value.loadCalendarRange],
  );
  const calendarSessionRead = useMemo(
    () => createCalendarSessionReadPort(value),
    [value.getCalendarSessionDetail],
  );
  const calendarStrengthOccurrenceRead = useMemo(
    () => createCalendarStrengthOccurrenceReadPort(value),
    [value.loadPlannedStrengthOccurrence],
  );
  const calendarActivityRead = useMemo(
    () => createCalendarActivityReadPort(value),
    [value.loadGarminRevisionReview, value.loadImportedActivityDetail],
  );

  return (
    <WorkoutAppRuntimeContext.Provider value={value}>
      <CalendarRangeReadContext.Provider value={calendarRangeRead}>
        <CalendarSessionReadContext.Provider value={calendarSessionRead}>
          <CalendarStrengthOccurrenceReadContext.Provider value={calendarStrengthOccurrenceRead}>
            <CalendarActivityReadContext.Provider value={calendarActivityRead}>
              {children}
            </CalendarActivityReadContext.Provider>
          </CalendarStrengthOccurrenceReadContext.Provider>
        </CalendarSessionReadContext.Provider>
      </CalendarRangeReadContext.Provider>
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

export function useCalendarRangeReadPort(): CalendarRangeReadPort {
  const value = useContext(CalendarRangeReadContext);
  if (value === null) throw new Error("calendar_range_read_port_unavailable");
  return value;
}

export function useCalendarSessionReadPort(): CalendarSessionReadPort {
  const value = useContext(CalendarSessionReadContext);
  if (value === null) throw new Error("calendar_session_read_port_unavailable");
  return value;
}

export function useCalendarStrengthOccurrenceReadPort(): CalendarStrengthOccurrenceReadPort {
  const value = useContext(CalendarStrengthOccurrenceReadContext);
  if (value === null) throw new Error("calendar_strength_occurrence_read_port_unavailable");
  return value;
}

export function useCalendarActivityReadPort(): CalendarActivityReadPort {
  const value = useContext(CalendarActivityReadContext);
  if (value === null) throw new Error("calendar_activity_read_port_unavailable");
  return value;
}
