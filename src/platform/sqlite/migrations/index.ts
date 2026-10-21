import { initialMigration } from "./0001_initial";
import { outcomeEffortMigration } from "./0002_outcome_effort";
import { exerciseHistoryIndexMigration } from "./0003_exercise_history_index";
import { contentLibraryMigration } from "./0004_content_library";
import { exerciseSearchFtsMigration } from "./0005_exercise_search_fts";
import { metricProfilesMigration } from "./0006_metric_profiles";
import { scheduleActivationMigration } from "./0008_schedule_activation";
import { ownedPlansMigration } from "./0009_owned_plans";
import { ownedRecommendationsMigration } from "./0010_owned_recommendations";
import { foregroundRestFeedbackMigration } from "./0011_foreground_rest_feedback";
import { foregroundRestFeedbackAttemptsMigration } from "./0012_foreground_rest_feedback_attempts";
import { historyIntegrityMigration } from "./0013_history_integrity";
import { historyProjectionsMigration } from "./0014_history_projections";
import { progressionEvidenceMigration } from "./0015_progression_evidence";
import { portabilityRestoreStateMigration } from "./0016_portability_restore_state";
import { workoutRemoveReceiptsMigration } from "./0017_workout_remove_receipts";
import { workoutRemoveReceiptEntityIdsMigration } from "./0018_workout_remove_receipt_entity_ids";
import { sessionExerciseEditingMigration } from "./0019_session_exercise_editing";
import { sessionExerciseEditReceiptsMigration } from "./0020_session_exercise_edit_receipts";
import { advancedSetTimingMigration } from "./0021_advanced_set_timing";
import { portableOwnerIdentitiesMigration } from "./0022_portable_owner_identities";
import { automaticDriveBackupMigration } from "./0023_automatic_drive_backup";
import { automaticBackupReceiptsMigration } from "./0024_automatic_backup_receipts";
import { automaticBackupDeletionProgressMigration } from "./0025_automatic_backup_deletion_progress";
import { automaticBackupAccountLabelMigration } from "./0026_automatic_backup_account_label";
import { advancedTimingTargetOwnershipMigration } from "./0027_advanced_timing_target_ownership";
import { multiPlanRunningFoundationMigration } from "./0028_multi_plan_running_foundation";
import { runningSessionRootsMigration } from "./0029_running_session_roots";
import { importedActivityEvidenceMigration } from "./0030_imported_activity_evidence";
import { bodyweightSourceHistoryMigration } from "./0031_bodyweight_source_history";
import { strengthOccurrenceProvenanceMigration } from "./0032_strength_occurrence_provenance";
import { completedSetCorrectionReceiptsMigration } from "./0033_completed_set_correction_receipts";
import { runningActivityMatchLedgerMigration } from "./0034_running_activity_match_ledger";
import { importedActivityLifecycleStateMigration } from "./0035_imported_activity_lifecycle_state";
import { sessionExerciseRestDefaultsMigration } from "./0036_session_exercise_rest_defaults";
import { exerciseInstructionSetsMigration } from "./0037_exercise_instruction_sets";
import { runningPlanLifecycleReceiptsMigration } from "./0038_running_plan_lifecycle_receipts";
import { runningSessionSlotMembershipMigration } from "./0039_running_session_slot_membership";
import { scheduleCollisionOutcomesMigration } from "./0040_schedule_collision_outcomes";
import { phase17FixtureCleanupMigration } from "./0041_phase17_fixture_cleanup";
import { customExerciseMutationReceiptsMigration } from "./0042_custom_exercise_mutation_receipts";
import { importedActivityRevisionReviewsMigration } from "./0043_imported_activity_revision_reviews";
import { garminSyncSummaryMigration } from "./0044_garmin_sync_summary";
import { recommendationDecisionReceiptsMigration } from "./0045_recommendation_decision_receipts";
import { logicalBackupReceiptsMigration } from "./0046_logical_backup_receipts";
import { planExerciseReplacementReceiptsMigration } from "./0047_plan_exercise_replacement_receipts";

export const migrations = Object.freeze([
  initialMigration,
  outcomeEffortMigration,
  exerciseHistoryIndexMigration,
  contentLibraryMigration,
  exerciseSearchFtsMigration,
  metricProfilesMigration,
  scheduleActivationMigration,
  ownedPlansMigration,
  ownedRecommendationsMigration,
  foregroundRestFeedbackMigration,
  foregroundRestFeedbackAttemptsMigration,
  historyIntegrityMigration,
  historyProjectionsMigration,
  progressionEvidenceMigration,
  portabilityRestoreStateMigration,
  workoutRemoveReceiptsMigration,
  workoutRemoveReceiptEntityIdsMigration,
  sessionExerciseEditingMigration,
  sessionExerciseEditReceiptsMigration,
  advancedSetTimingMigration,
  portableOwnerIdentitiesMigration,
  automaticDriveBackupMigration,
  automaticBackupReceiptsMigration,
  automaticBackupDeletionProgressMigration,
  automaticBackupAccountLabelMigration,
  advancedTimingTargetOwnershipMigration,
  multiPlanRunningFoundationMigration,
  runningSessionRootsMigration,
  importedActivityEvidenceMigration,
  bodyweightSourceHistoryMigration,
  strengthOccurrenceProvenanceMigration,
  completedSetCorrectionReceiptsMigration,
  runningActivityMatchLedgerMigration,
  importedActivityLifecycleStateMigration,
  sessionExerciseRestDefaultsMigration,
  exerciseInstructionSetsMigration,
  runningPlanLifecycleReceiptsMigration,
  runningSessionSlotMembershipMigration,
  scheduleCollisionOutcomesMigration,
  phase17FixtureCleanupMigration,
  customExerciseMutationReceiptsMigration,
  importedActivityRevisionReviewsMigration,
  garminSyncSummaryMigration,
  recommendationDecisionReceiptsMigration,
  logicalBackupReceiptsMigration,
  planExerciseReplacementReceiptsMigration,
]);

export const CURRENT_SCHEMA_VERSION = migrations.reduce(
  (current, migration) => Math.max(current, migration.version),
  0,
);

export {
  contentLibraryMigration,
  exerciseHistoryIndexMigration,
  exerciseSearchFtsMigration,
  initialMigration,
  metricProfilesMigration,
  ownedPlansMigration,
  ownedRecommendationsMigration,
  foregroundRestFeedbackMigration,
  foregroundRestFeedbackAttemptsMigration,
  historyIntegrityMigration,
  historyProjectionsMigration,
  progressionEvidenceMigration,
  portabilityRestoreStateMigration,
  workoutRemoveReceiptsMigration,
  workoutRemoveReceiptEntityIdsMigration,
  sessionExerciseEditingMigration,
  sessionExerciseEditReceiptsMigration,
  advancedSetTimingMigration,
  portableOwnerIdentitiesMigration,
  automaticDriveBackupMigration,
  automaticBackupReceiptsMigration,
  automaticBackupDeletionProgressMigration,
  automaticBackupAccountLabelMigration,
  advancedTimingTargetOwnershipMigration,
  multiPlanRunningFoundationMigration,
  runningSessionRootsMigration,
  importedActivityEvidenceMigration,
  bodyweightSourceHistoryMigration,
  strengthOccurrenceProvenanceMigration,
  completedSetCorrectionReceiptsMigration,
  runningActivityMatchLedgerMigration,
  importedActivityLifecycleStateMigration,
  sessionExerciseRestDefaultsMigration,
  exerciseInstructionSetsMigration,
  runningPlanLifecycleReceiptsMigration,
  runningSessionSlotMembershipMigration,
  scheduleCollisionOutcomesMigration,
  phase17FixtureCleanupMigration,
  customExerciseMutationReceiptsMigration,
  importedActivityRevisionReviewsMigration,
  garminSyncSummaryMigration,
  recommendationDecisionReceiptsMigration,
  logicalBackupReceiptsMigration,
  planExerciseReplacementReceiptsMigration,
  outcomeEffortMigration,
  scheduleActivationMigration,
};
