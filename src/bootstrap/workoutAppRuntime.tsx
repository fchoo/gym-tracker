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
  formatMetricDuration,
} from "../domains/metrics/aggregates";
import type {
  MetricIdentity,
  MetricTarget,
} from "../domains/metrics";
import {
  parseMetricTargetJson,
} from "../domains/metrics";
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
  FinishOutcomeResult,
  ReviseCompletedSetInput,
  SessionDetail,
  TodayView,
  WorkoutSessionView,
} from "../domains/workout";
import {
  DISCARD_CONFIRMATION,
  PARTIAL_CONFIRMATION,
  WorkoutCommandConflictError,
  addWarmup,
  addWorkingSet,
  discardWorkout,
  finishCompleted,
  finishPartial,
  startWorkout,
  completeSet,
  completeWarmup,
  copyPreviousWarmup,
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
  type CopyPreviousWarmupInput,
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
import type {
  AppError,
} from "../domains/shared";
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
  createBackupCommands,
  type SecureBackupCommands,
} from "../domains/portability/backupCommands";
import {
  createRestoreCommands,
  createRestorePreflightStore,
  type RestoreCommands,
} from "../domains/portability/restoreCommands";
import {
  createAesGcmArchivePort,
  createExpoAesGcmArchiveDriver,
} from "../platform/crypto/aesGcmArchivePort";
import {
  createPasswordKdfPort,
} from "../platform/crypto/passwordKdf";
import {
  createProductionExpoBackupFilePort,
  createProductionExpoRestoreFilePort,
  type BackupArchiveHandle,
} from "../platform/files/expoBackupFilePort";
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
  type ExercisePlanReference,
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
  createRestoreReconciliationRepository,
} from "../platform/sqlite/repositories/restoreReconciliationRepository";
import type {
  RestoreReconciliationResult,
} from "../platform/sqlite/repositories/restoreReconciliationRepository";
import {
  createSqliteRestoreCandidateProbe,
  createSqliteRestoreCatalogReferenceAvailabilityPort,
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

const DATABASE_NAME = "gym-tracker.db";
const LIBRARY_SECTION_SETTING_KEY = "library.section";

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
export type RuntimeSecureBackupArchive = BackupArchiveHandle;
export type RuntimeCsvExport = CsvExportHandle;
export type RuntimeRestorePreflightResult = Awaited<ReturnType<RestoreCommands["preflightSecureRestore"]>>;
export type RuntimeRestoreCommitResult = Readonly<{
  state: "ready" | "rebuild_pending";
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

export type CustomExerciseRuntimeDetail = Readonly<{
  exerciseId: string;
  name: string;
  origin: "bundled" | "custom" | "copied";
  originLabel: "Built-in" | "Custom";
  exerciseType: string;
  movementClass: string;
  aliases: readonly string[];
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  equipment: readonly string[];
  metricIdentity: MetricIdentity;
  defaultRestSeconds: number;
  availability: "available" | "unavailable";
  favorite: boolean;
  hidden: boolean;
  archived: boolean;
  exerciseRevision: number;
  preferenceRevision: number | null;
  source: Readonly<{
    namespace: string;
    revision: string;
    license: string;
    attribution: string;
  }> | null;
  references: readonly ExercisePlanReference[];
}>;

export type CustomExerciseRuntimeMigration = Readonly<{
  exerciseId: string;
  exerciseName: string;
  exerciseRevision: number;
  fromIdentity: MetricIdentity;
  activeWorkoutSessionId: string | null;
  occurrences: readonly Readonly<{
    graph: "legacy" | "owned";
    planId: string;
    planName: string;
    dayId: string;
    dayName: string;
    occurrenceId: string;
    occurrenceRevision: number;
    policyRevision: number | null;
    targets: readonly Readonly<{
      targetId: string;
      targetRevision: number;
      ordinal: number;
      currentTarget: string;
    }>[];
  }>[];
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

type CustomExerciseDetailRow = Readonly<{
  exercise_id: string;
  origin: "bundled" | "custom" | "copied";
  canonical_name: string;
  exercise_type: string;
  movement_class: string;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
  availability: "available" | "unavailable";
  default_rest_seconds: number;
  exercise_revision: number;
  library_revision: number;
  favorite: number | null;
  hidden: number | null;
  archived: number | null;
  preference_revision: number | null;
  source_namespace: string | null;
  source_revision: string | null;
  license: string | null;
  attribution: string | null;
}>;

type CustomExerciseTaxonomyRow = Readonly<{
  kind: "equipment" | "exercise_type" | "movement_class" | "muscle";
  relation: "equipment" | "movement" | "primary" | "secondary" | "type";
  slug: string;
  ordinal: number;
}>;

type CustomExerciseAliasRow = Readonly<{
  display_text: string;
}>;

type CustomExerciseActiveWorkoutRow = Readonly<{
  session_id: string;
}>;

type CustomExerciseMigrationOccurrenceRow = Readonly<{
  graph: "legacy" | "owned";
  plan_id: string;
  plan_name: string;
  day_id: string;
  day_name: string;
  occurrence_id: string;
  occurrence_revision: number;
  policy_revision: number | null;
}>;

type CustomExerciseMigrationTargetRow = Readonly<{
  graph: "legacy" | "owned";
  occurrence_id: string;
  target_id: string;
  target_revision: number;
  ordinal: number;
  target_json: string;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
}>;

type RuntimeState = Readonly<{
  launchState: "booting" | "trusted" | "failed";
  view?: TodayView;
  planDays: readonly ActivatedPlanDay[];
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
  actOnToday(action: ScheduleTodayAction): ReturnType<
    ReturnType<typeof createScheduleRuntimePort>["actOnToday"]
  >;
  activatePlan(): Promise<void>;
  addWarmup(input: AddWarmupInput): Promise<CommittedWorkoutMutationResult>;
  addWorkingSet(
    input: AddWorkingSetInput,
  ): Promise<CommittedWorkoutMutationResult>;
  completeSet(input: CompleteSetInput): ReturnType<typeof completeSet>;
  completeWarmup(input: CompleteWarmupInput): Promise<ActiveWorkoutView>;
  createSecureBackup(input: Readonly<{
    password: string;
    signal?: AbortSignal;
  }>): Promise<BackupArchiveHandle>;
  createCsvExport(): Promise<CsvExportHandle>;
  discardSecureBackup(archive: BackupArchiveHandle): Promise<void>;
  discardCsvExport(handle: CsvExportHandle): Promise<void>;
  discardWorkout(input: DiscardWorkoutInput): Promise<FinishOutcomeResult>;
  finishCompleted(input: FinishCompletedInput): Promise<FinishOutcomeResult>;
  finishPartial(input: FinishPartialInput): Promise<FinishOutcomeResult>;
  copyPreviousWarmup(
    input: CopyPreviousWarmupInput,
  ): Promise<CommittedWorkoutMutationResult>;
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
  invalidateSecureRestorePreflight(token: string): void;
  commitSecureRestore(input: Readonly<{ token: string; confirmation: string }>): Promise<RuntimeRestoreCommitResult>;
  retryRestoreRebuild(): Promise<RuntimeRestoreCommitResult>;
  shareSecureBackup(archive: BackupArchiveHandle): Promise<void>;
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
  backupCommands: SecureBackupCommands;
  csvExportRepository: CsvExportRepository;
  csvFiles: CsvFilePort;
  restoreCommands: RestoreCommands;
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
  loadStarterPlans?(): Promise<StarterPlanRuntimeCatalog>;
  createRepository(
    kernel: SqliteKernel,
  ): ReturnType<typeof createPlansWorkoutRepository>;
  createNotifications(): RestNotificationPort;
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
  loadStarterPlans?(): Promise<StarterPlanRuntimeCatalog>;
  createRepository(
    kernel: SqliteKernel,
  ): ReturnType<typeof createPlansWorkoutRepository>;
  createNotifications(): RestNotificationPort;
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

export const productionWorkoutAppRuntimeDependencies =
  createWorkoutAppRuntimeDependencies({
    openKernel: openSqliteKernel,
    runMigrations: async ({ databaseName, kernel }) => {
      const recoveryBackup = createExpoRecoveryBackupPort({
        openSource(sourceName) {
          const {
            openDatabaseAsync,
          } = require("expo-sqlite") as typeof import("expo-sqlite");
          return openDatabaseAsync(sourceName, { useNewConnection: true });
        },
        openDestination(destinationName) {
          const {
            openDatabaseAsync,
          } = require("expo-sqlite") as typeof import("expo-sqlite");
          return openDatabaseAsync(destinationName, {
            useNewConnection: true,
          });
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
    loadStarterPlans: async () => {
      const {
        CryptoDigestAlgorithm,
        digestStringAsync,
      } = require("expo-crypto") as typeof import("expo-crypto");
      return createStarterPlanRuntimeCatalog({
        starterPackBytes: `${JSON.stringify(starterPlansAsset, null, 2)}
`,
        acceptanceBytes: `${JSON.stringify(starterPlansAcceptanceAsset, null, 2)}
`,
        sha256: (value) =>
          digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
      });
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
    createRestoreCommands: (kernel) => createRestoreCommands({
      crypto: createAesGcmArchivePort(createExpoAesGcmArchiveDriver()),
      files: createProductionExpoRestoreFilePort(),
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
    }),
    reconcileRestore: (kernel) => createRestoreReconciliationRepository(kernel, {
      history: createHistoryProjectionRepository(kernel),
      nowMs: () => Date.now(),
      search: createExerciseSearchIndexRepository(kernel),
    }).reconcileAndRebuild(),
    createRepository: createPlansWorkoutRepository,
    createNotifications: createExpoRestNotificationAdapter,
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
       WHERE lifecycle = 'active'
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

function customExerciseIdentity(row: Readonly<{
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
}>): MetricIdentity {
  return Object.freeze({
    profile: row.metric_profile,
    contractVersion: row.metric_contract_version,
    exerciseMetricGeneration: row.exercise_metric_generation,
  });
}

function formatCustomTarget(target: MetricTarget): string {
  switch (target.profile) {
    case "load_reps":
      return `${target.loadGrams / 1_000} kg · ${target.minReps}–${target.maxReps} reps`;
    case "bodyweight_reps":
      return `${target.minReps}–${target.maxReps} reps · ${target.variationId}`;
    case "added_load_reps":
      return `+${target.addedLoadGrams / 1_000} kg · ${target.minReps}–${target.maxReps} reps`;
    case "assisted_reps":
      return `${target.assistanceGrams / 1_000} kg assist · ${target.minReps}–${target.maxReps} reps`;
    case "timed_hold":
      return target.version === 1
        ? `${target.durationSeconds} sec`
        : formatMetricDuration(target.durationMs);
    case "fixed_distance":
      return `${target.plannedDistanceMeters} m`;
    case "fixed_time":
      return formatMetricDuration(target.plannedDurationMs);
    case "intervals":
      return `${target.plannedRounds} rounds · ${formatMetricDuration(target.workIntervalMs)} work · ${formatMetricDuration(target.restIntervalMs)} rest`;
    case "unscored":
      return "Completed";
  }
}

async function readCustomExerciseDetail(
  services: CustomExerciseReadServices,
  exerciseId: string,
): Promise<CustomExerciseRuntimeDetail | null> {
  const [row] = await services.kernel.queryAll<CustomExerciseDetailRow>(
    `SELECT entry.exercise_id, entry.origin, entry.canonical_name,
            entry.exercise_type, entry.movement_class,
            entry.metric_profile, entry.metric_contract_version,
            entry.exercise_metric_generation, entry.availability,
            source.default_rest_seconds,
            source.revision AS exercise_revision,
            entry.revision AS library_revision,
            preference.favorite, preference.hidden, preference.archived,
            preference.revision AS preference_revision,
            catalog.source_namespace, catalog.source_revision,
            catalog.license, catalog.attribution
     FROM exercise_library_entries entry
     JOIN exercises source ON source.id = entry.exercise_id
     LEFT JOIN exercise_owner_preferences preference
       ON preference.exercise_id = entry.exercise_id
     LEFT JOIN exercise_catalog_sources catalog
       ON catalog.exercise_id = entry.exercise_id
     WHERE entry.exercise_id = ?`,
    [exerciseId],
  );
  if (row === undefined) {
    return null;
  }
  if (
    row.origin === "custom"
    && row.exercise_revision !== row.library_revision
  ) {
    throw new Error("custom_exercise_revision_inconsistent");
  }
  const [aliases, taxonomy, references] = await Promise.all([
    services.kernel.queryAll<CustomExerciseAliasRow>(
      `SELECT display_text
       FROM exercise_aliases
       WHERE exercise_id = ?
       ORDER BY ordinal, id`,
      [exerciseId],
    ),
    services.kernel.queryAll<CustomExerciseTaxonomyRow>(
      `SELECT kind, relation, slug, ordinal
       FROM exercise_taxonomy
       WHERE exercise_id = ?
       ORDER BY kind, relation, ordinal, slug`,
      [exerciseId],
    ),
    services.customExerciseRepository.listExercisePlanReferences(exerciseId),
  ]);
  return Object.freeze({
    exerciseId: row.exercise_id,
    name: row.canonical_name,
    origin: row.origin,
    originLabel: row.origin === "bundled" ? "Built-in" : "Custom",
    exerciseType: row.exercise_type,
    movementClass: row.movement_class,
    aliases: Object.freeze(aliases.map(({ display_text }) => display_text)),
    primaryMuscles: Object.freeze(taxonomy
      .filter(({ kind, relation }) =>
        kind === "muscle" && relation === "primary"
      )
      .map(({ slug }) => slug)),
    secondaryMuscles: Object.freeze(taxonomy
      .filter(({ kind, relation }) =>
        kind === "muscle" && relation === "secondary"
      )
      .map(({ slug }) => slug)),
    equipment: Object.freeze(taxonomy
      .filter(({ kind }) => kind === "equipment")
      .map(({ slug }) => slug)),
    metricIdentity: customExerciseIdentity(row),
    defaultRestSeconds: row.default_rest_seconds,
    availability: row.availability,
    favorite: row.favorite === 1,
    hidden: row.hidden === 1,
    archived: row.archived === 1,
    exerciseRevision: row.exercise_revision,
    preferenceRevision: row.preference_revision,
    source: row.source_namespace === null
      ? null
      : Object.freeze({
          namespace: row.source_namespace,
          revision: row.source_revision!,
          license: row.license!,
          attribution: row.attribution!,
        }),
    references: Object.freeze([...references]),
  });
}

async function readCustomExerciseMigration(
  services: CustomExerciseReadServices,
  exerciseId: string,
): Promise<CustomExerciseRuntimeMigration | null> {
  const detail = await readCustomExerciseDetail(services, exerciseId);
  if (detail === null || detail.origin !== "custom") {
    return null;
  }
  const [[active], occurrences, targets] = await Promise.all([
    services.kernel.queryAll<CustomExerciseActiveWorkoutRow>(
      `SELECT session.id AS session_id
       FROM workout_sessions session
       JOIN session_exercises exercise
         ON exercise.session_id = session.id
       WHERE session.status = 'in_progress'
         AND exercise.exercise_id = ?
       ORDER BY session.started_at_ms, session.id
       LIMIT 1`,
      [exerciseId],
    ),
    services.kernel.queryAll<CustomExerciseMigrationOccurrenceRow>(
      `SELECT graph, plan_id, plan_name, day_id, day_name,
              occurrence_id, occurrence_revision, policy_revision
       FROM (
         SELECT 'legacy' AS graph, plan.id AS plan_id,
                plan.name AS plan_name, day.id AS day_id,
                day.name AS day_name, occurrence.id AS occurrence_id,
                occurrence.revision AS occurrence_revision,
                policy.revision AS policy_revision
         FROM plan_day_exercises occurrence
         JOIN plan_days day ON day.id = occurrence.plan_day_id
         JOIN plans plan ON plan.id = day.plan_id
         LEFT JOIN progression_policies policy
           ON policy.plan_day_exercise_id = occurrence.id
          AND policy.status = 'active'
         WHERE occurrence.exercise_id = ?
         UNION ALL
         SELECT 'owned' AS graph, plan.id AS plan_id,
                plan.name AS plan_name, day.id AS day_id,
                day.name AS day_name, occurrence.id AS occurrence_id,
                occurrence.revision AS occurrence_revision,
                policy.revision AS policy_revision
         FROM owned_plan_day_exercises occurrence
         JOIN plan_days day ON day.id = occurrence.plan_day_id
         JOIN plans plan ON plan.id = day.plan_id
         LEFT JOIN owned_plan_progression_policies policy
           ON policy.plan_day_exercise_id = occurrence.id
          AND policy.status = 'active'
         WHERE occurrence.exercise_id = ?
       )
       ORDER BY plan_name, day_name, occurrence_id, graph`,
      [exerciseId, exerciseId],
    ),
    services.kernel.queryAll<CustomExerciseMigrationTargetRow>(
      `SELECT graph, occurrence_id, target_id, target_revision, ordinal,
              target_json, metric_profile, metric_contract_version,
              exercise_metric_generation
       FROM (
         SELECT 'legacy' AS graph, occurrence.id AS occurrence_id,
                target.id AS target_id,
                target.revision AS target_revision, target.ordinal,
                target.target_json, target.metric_profile,
                target.metric_contract_version,
                target.exercise_metric_generation
         FROM plan_working_set_targets target
         JOIN plan_day_exercises occurrence
           ON occurrence.id = target.plan_day_exercise_id
         WHERE occurrence.exercise_id = ?
         UNION ALL
         SELECT 'owned' AS graph, occurrence.id AS occurrence_id,
                target.id AS target_id,
                target.revision AS target_revision, target.ordinal,
                target.target_json, target.metric_profile,
                target.metric_contract_version,
                target.exercise_metric_generation
         FROM owned_plan_working_set_targets target
         JOIN owned_plan_day_exercises occurrence
           ON occurrence.id = target.plan_day_exercise_id
         WHERE occurrence.exercise_id = ?
       )
       ORDER BY occurrence_id, ordinal, target_id, graph`,
      [exerciseId, exerciseId],
    ),
  ]);
  return Object.freeze({
    exerciseId: detail.exerciseId,
    exerciseName: detail.name,
    exerciseRevision: detail.exerciseRevision,
    fromIdentity: detail.metricIdentity,
    activeWorkoutSessionId: active?.session_id ?? null,
    occurrences: Object.freeze(occurrences.map((occurrence) =>
      Object.freeze({
        graph: occurrence.graph,
        planId: occurrence.plan_id,
        planName: occurrence.plan_name,
        dayId: occurrence.day_id,
        dayName: occurrence.day_name,
        occurrenceId: occurrence.occurrence_id,
        occurrenceRevision: occurrence.occurrence_revision,
        policyRevision: occurrence.policy_revision,
        targets: Object.freeze(targets
          .filter(({ occurrence_id }) =>
            occurrence_id === occurrence.occurrence_id
          )
          .map((target) => {
            const identity = customExerciseIdentity(target);
            return Object.freeze({
              targetId: target.target_id,
              targetRevision: target.target_revision,
              ordinal: target.ordinal,
              currentTarget: formatCustomTarget(
                parseMetricTargetJson(identity, target.target_json),
              ),
            });
          })),
      })
    )),
  });
}

export function createCustomExerciseRuntimeReadPort(
  services: CustomExerciseReadServices,
) {
  return Object.freeze({
    loadExercise: (exerciseId: string) =>
      readCustomExerciseDetail(services, exerciseId),
    loadMigration: (exerciseId: string) =>
      readCustomExerciseMigration(services, exerciseId),
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
    const services = servicesRef.current;
    servicesRef.current = null;
    await services?.lifecycle.dispose?.().catch(() => undefined);
    await services?.kernel.close().catch(() => undefined);
  }, []);

  const trustedRead = useCallback(async (
    services: RuntimeServices,
  ): Promise<RuntimeState> => {
    const context = localContext(dependencies.now());
    const [legacyView, scheduledToday, activation, notificationPermission] =
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
    ]);
    const preserveWorkoutState = legacyView.state === "active_workout"
      || legacyView.state === "saved_partial";
    return {
      launchState: "trusted",
      view: preserveWorkoutState
        ? legacyView
        : scheduledToday?.view ?? legacyView,
      planDays: scheduledToday?.planDays ?? activation?.days ?? [],
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
      starterPlansRef.current = await dependencies.loadStarterPlans?.();
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
  }, [requireServices, trustedRead]);

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
      const session = await startWorkout({
        repository: services.repository,
        request: {
          mode,
          planId,
          planDayId: dayId,
          localDate,
          timezone,
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
    return committedSetId === undefined
      ? view
      : Object.freeze({ ...view, committedSetId });
  }, [requireServices, trustedRead]);

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

  const copyWorkoutWarmup = useCallback((input: CopyPreviousWarmupInput) =>
    runWorkoutMutation((repository) =>
      copyPreviousWarmup({ repository, input }),
      input.setId,
    ) as Promise<CommittedWorkoutMutationResult>, [runWorkoutMutation]);

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
    activatePlan,
    addWarmup: addWorkoutWarmup,
    addWorkingSet: addWorkoutWorkingSet,
    adjustRest: adjustWorkoutRest,
    completeSet: completeWorkoutSet,
    completeWarmup: completeWorkoutWarmup,
    copyPreviousWarmup: copyWorkoutWarmup,
    createSecureBackup: (input) =>
      requireServices().backupCommands.createSecureBackup(input),
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
    shareSecureBackup: (archive) =>
      requireServices().backupCommands.shareSecureBackup(archive),
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
    activatePlan,
    addWorkoutWarmup,
    addWorkoutWorkingSet,
    adjustWorkoutRest,
    completeWorkoutSet,
    completeWorkoutWarmup,
    copyWorkoutWarmup,
    requireServices,
    createRuntimeCustomExercise,
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
    reviseWorkoutCompletedSet,
    refresh,
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
