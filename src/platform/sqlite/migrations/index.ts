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
  outcomeEffortMigration,
  scheduleActivationMigration,
};
