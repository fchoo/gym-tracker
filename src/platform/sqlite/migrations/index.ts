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
]);

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
  outcomeEffortMigration,
  scheduleActivationMigration,
};
