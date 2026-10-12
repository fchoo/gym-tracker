#!/usr/bin/env node

import {
  spawnSync,
} from "node:child_process";
import {
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadPhase18LanguageCoverageReports } from "./phase18-language-coverage.mjs";

const projectRoot = process.cwd();
const coverageDirectory = path.join(projectRoot, "coverage");
const summaryPath = path.join(coverageDirectory, "coverage-summary.json");
const phase18IntegrityCriticalFiles = [
  "src/domains/activities/activityDetails.ts",
  "src/domains/activities/importCommands.ts",
  "src/domains/portability/mergePlan.ts",
  "src/domains/running/activityMatchCommands.ts",
  "src/platform/garmin/garminActivityAdapter.ts",
  "src/platform/garmin/canonicalGarminPayload.ts",
  "src/platform/garmin/normalizeGarminActivity.ts",
  "src/platform/garmin/garminSyncCoordinator.ts",
  "src/platform/sqlite/repositories/garminSyncSummaryRepository.ts",
  "src/platform/sqlite/repositories/importedActivityRepository.ts",
  "src/platform/sqlite/repositories/logicalMergeRepository.ts",
  "src/platform/sqlite/repositories/runningActivityMatchRepository.ts",
  "src/bootstrap/garminImportRuntime.tsx",
  "src/ui/garmin/useGarminConnectionController.ts",
];
const phase18TargetedTests = [
  "src/domains/activities/activityDetails.test.ts",
  "src/domains/activities/importCommands.test.ts",
  "src/domains/portability/mergePlan.test.ts",
  "src/domains/running/activityMatchCommands.test.ts",
  "src/platform/garmin/garminActivityAdapter.test.ts",
  "src/platform/garmin/canonicalGarminPayload.test.ts",
  "src/platform/garmin/normalizeGarminActivity.test.ts",
  "src/platform/garmin/garminSyncCoordinator.test.ts",
  "src/platform/sqlite/repositories/importedActivityRepository.test.ts",
  "src/platform/sqlite/repositories/runningActivityMatchRepository.test.ts",
  "src/bootstrap/garminImportRuntime.test.tsx",
  "src/ui/garmin/useGarminConnectionController.test.tsx",
  "src/ui/__tests__/GarminSyncScreen.test.tsx",
  "tests/integration/garmin-envelope-import.test.ts",
  "tests/integration/garmin-import-portability.test.ts",
  "tests/integration/garmin-sync.test.ts",
  "tests/integration/imported-activity-facts.test.ts",
  "tests/integration/running-activity-match.test.ts",
  "tests/sqlite-host/garminSyncSummaryRepository.test.ts",
  "tests/sqlite-host/logicalMergeRepository.test.ts",
];
const phase18EvidenceTests = [
  "scripts/phase18-acceptance-helper-coverage.test.mjs",
  "scripts/phase18-benchmark-helper-coverage.test.mjs",
  "scripts/benchmark-phase18-garmin.test.mjs",
  "scripts/phase18-evidence-helpers.test.mjs",
  "scripts/phase18-build-manifest.test.mjs",
  "scripts/phase18-garmin-acceptance.test.mjs",
  "scripts/phase18-garmin-adversarial.test.mjs",
  "scripts/phase18-garmin-proof.test.mjs",
  "scripts/phase18-language-coverage.test.mjs",
  "scripts/phase18-privacy-scan.test.mjs",
  "scripts/phase18-proof-helper-coverage.test.mjs",
  "scripts/phase18-verifier-cli.test.mjs",
  "scripts/run-phase18-kotlin-coverage.test.mjs",
];
const phase18EvidenceFiles = [
  "scripts/acceptance-runner-evidence.mjs",
  "scripts/acceptance-verifier-evidence.mjs",
  "scripts/adversarial-runner-evidence.mjs",
  "scripts/adversarial-verifier-evidence.mjs",
  "scripts/benchmark-evidence-runner.mjs",
  "scripts/benchmark-phase18-garmin.mjs",
  "scripts/kotlin-coverage-evidence.mjs",
  "scripts/node-evidence-utils.mjs",
  "scripts/phase18-build-manifest.mjs",
  "scripts/phase18-language-coverage.mjs",
  "scripts/phase18-privacy-scan.mjs",
  "scripts/privacy-scan-evidence.mjs",
  "scripts/proof-runner-evidence.mjs",
  "scripts/proof-verifier-evidence.mjs",
  "scripts/run-phase18-kotlin-coverage.mjs",
  "scripts/run-phase18-garmin-acceptance.mjs",
  "scripts/run-phase18-garmin-adversarial.mjs",
  "scripts/run-phase18-garmin-proof.mjs",
  "scripts/verify-phase18-garmin-acceptance.mjs",
  "scripts/verify-phase18-garmin-adversarial.mjs",
  "scripts/verify-phase18-garmin-proof.mjs",
];
const integrityCriticalFiles = [
  "src/domains/content/catalog.ts",
  "src/domains/portability/backupContracts.ts",
  "src/domains/portability/backupCommands.ts",
  "src/domains/portability/backupFormat.ts",
  "src/domains/portability/mergeCommands.ts",
  "src/domains/portability/mergePlan.ts",
  "src/domains/portability/portableIdentity.ts",
  "src/domains/portability/csvExport.ts",
  "src/domains/portability/restoreCommands.ts",
  "src/domains/portability/automaticPortability.ts",
  "src/domains/backup/automaticBackupContracts.ts",
  "src/domains/backup/automaticBackupCoordinator.ts",
  "src/domains/backup/automaticBackupScheduler.ts",
  "src/domains/library/customExerciseCommands.ts",
  "src/domains/library/search.ts",
  "src/domains/metrics/aggregates.ts",
  "src/domains/metrics/comparators.ts",
  "src/domains/metrics/contracts.ts",
  "src/domains/metrics/exposure.ts",
  "src/domains/metrics/observations.ts",
  "src/domains/metrics/registry.ts",
  "src/domains/progression/loadRepsV1.ts",
  "src/domains/progression/recommendationContracts.ts",
  "src/domains/progression/recommendationCommands.ts",
  "src/domains/plans/activateStarterPlan.ts",
  "src/domains/plans/ownedPlanCommands.ts",
  "src/domains/plans/planImpactCommands.ts",
  "src/domains/metrics/migrateCustomExerciseMetricProfile.ts",
  "src/domains/rest/restCommands.ts",
  "src/domains/rest/restState.ts",
  "src/domains/advancedTiming/advancedTimingConfig.ts",
  "src/domains/advancedTiming/advancedTimingState.ts",
  "src/domains/advancedTiming/advancedTimingCommands.ts",
  "src/domains/activities/activityIdentity.ts",
  "src/domains/activities/activityDetails.ts",
  "src/domains/activities/garminActivitySourcePort.ts",
  "src/domains/activities/importCommands.ts",
  "src/platform/garmin/canonicalGarminPayload.ts",
  "src/platform/garmin/normalizeGarminActivity.ts",
  "src/platform/garmin/garminActivityAdapter.ts",
  "src/platform/garmin/garminSyncCoordinator.ts",
  "src/bootstrap/garminImportRuntime.tsx",
  "src/ui/garmin/useGarminConnectionController.ts",
  "src/domains/bodyweight/commands.ts",
  "src/domains/bodyweight/contracts.ts",
  "src/domains/running/activityMatchCommands.ts",
  "src/domains/running/commands.ts",
  "src/domains/running/contracts.ts",
  "src/domains/running/lifecycle.ts",
  "src/domains/scheduling/localDate.ts",
  "src/domains/scheduling/activation.ts",
  "src/domains/scheduling/scheduleCommands.ts",
  "src/domains/scheduling/scheduleState.ts",
  "src/domains/scheduling/timeZone.ts",
  "src/domains/shared/clock.ts",
  "src/domains/shared/contracts.ts",
  "src/domains/shared/diagnostics.ts",
  "src/domains/shared/errors.ts",
  "src/domains/workout/finishWorkout.ts",
  "src/domains/workout/activeWorkout.ts",
  "src/domains/workout/outcomes.ts",
  "src/domains/workout/sessionDetail.ts",
  "src/domains/workout/sessionExerciseCommands.ts",
  "src/domains/workout/setCommands.ts",
  "src/domains/workout/startWorkout.ts",
  "src/domains/workout/undoCompletedSet.ts",
  "src/platform/crypto/candidateKdfDescriptor.ts",
  "src/platform/crypto/runtimeSha256.ts",
  "src/platform/crypto/aesGcmArchivePort.ts",
  "src/platform/crypto/passwordKdf.ts",
  "src/platform/notifications/expoForegroundRestFeedbackAdapter.ts",
  "src/platform/notifications/expoRestNotificationAdapter.ts",
  "src/platform/notifications/restNotificationReconciler.ts",
  "src/platform/preferences/restAlertPreferenceStore.ts",
  "src/platform/sqlite/connection.ts",
  "src/platform/sqlite/effects/effectRunner.ts",
  "src/platform/sqlite/effects/effectStore.ts",
  "src/platform/sqlite/foregroundRestFeedbackStore.ts",
  "src/platform/sqlite/migrationRunner.ts",
  "src/platform/sqlite/migrations/0001_initial.ts",
  "src/platform/sqlite/migrations/0002_outcome_effort.ts",
  "src/platform/sqlite/migrations/0003_exercise_history_index.ts",
  "src/platform/sqlite/migrations/0004_content_library.ts",
  "src/platform/sqlite/migrations/0005_exercise_search_fts.ts",
  "src/platform/sqlite/migrations/0006_metric_profiles.ts",
  "src/platform/sqlite/migrations/0008_schedule_activation.ts",
  "src/platform/sqlite/migrations/0009_owned_plans.ts",
  "src/platform/sqlite/migrations/0010_owned_recommendations.ts",
  "src/platform/sqlite/migrations/0011_foreground_rest_feedback.ts",
  "src/platform/sqlite/migrations/0012_foreground_rest_feedback_attempts.ts",
  "src/platform/sqlite/migrations/0015_progression_evidence.ts",
  "src/platform/sqlite/migrations/0016_portability_restore_state.ts",
  "src/platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids.ts",
  "src/platform/sqlite/migrations/0019_session_exercise_editing.ts",
  "src/platform/sqlite/migrations/0020_session_exercise_edit_receipts.ts",
  "src/platform/sqlite/migrations/0021_advanced_set_timing.ts",
  "src/platform/sqlite/migrations/0022_portable_owner_identities.ts",
  "src/platform/sqlite/migrations/0023_automatic_drive_backup.ts",
  "src/platform/sqlite/migrations/0028_multi_plan_running_foundation.ts",
  "src/platform/sqlite/migrations/0029_running_session_roots.ts",
  "src/platform/sqlite/migrations/0030_imported_activity_evidence.ts",
  "src/platform/sqlite/migrations/0031_bodyweight_source_history.ts",
  "src/platform/sqlite/migrations/0032_strength_occurrence_provenance.ts",
  "src/platform/sqlite/migrations/0033_completed_set_correction_receipts.ts",
  "src/platform/sqlite/migrations/0034_running_activity_match_ledger.ts",
  "src/platform/sqlite/migrations/0035_imported_activity_lifecycle_state.ts",
  "src/platform/sqlite/migrations/0037_exercise_instruction_sets.ts",
  "src/platform/sqlite/migrations/0038_running_plan_lifecycle_receipts.ts",
  "src/platform/sqlite/migrations/0039_running_session_slot_membership.ts",
  "src/platform/sqlite/migrations/0040_schedule_collision_outcomes.ts",
  "src/platform/sqlite/migrations/index.ts",
  "src/platform/sqlite/recoveryBackup.ts",
  "src/platform/sqlite/repositories/contentRepository.ts",
  "src/platform/sqlite/repositories/logicalBackupRepository.ts",
  "src/platform/sqlite/repositories/csvExportRepository.ts",
  "src/platform/sqlite/repositories/logicalMergeRepository.ts",
  "src/platform/sqlite/repositories/logicalRestoreRepository.ts",
  "src/platform/sqlite/repositories/advancedTimingRepository.ts",
  "src/platform/sqlite/repositories/restoreReconciliationRepository.ts",
  "src/platform/sqlite/repositories/restorePreflightAdapters.ts",
  "src/platform/sqlite/repositories/exerciseSearchIndexRepository.ts",
  "src/platform/sqlite/repositories/customExerciseRepository.ts",
  "src/platform/sqlite/repositories/librarySearchRepository.ts",
  "src/platform/sqlite/repositories/metricRepository.ts",
  "src/platform/sqlite/repositories/ownedPlanRepository.ts",
  "src/platform/sqlite/repositories/planImpactRepository.ts",
  "src/platform/sqlite/repositories/starterPlanRepository.ts",
  "src/platform/sqlite/repositories/automaticBackupStateRepository.ts",
  "src/platform/sqlite/repositories/automaticSnapshotCapture.ts",
  "src/platform/sqlite/repositories/bodyweightRepository.ts",
  "src/platform/sqlite/repositories/garminSyncSummaryRepository.ts",
  "src/platform/sqlite/repositories/importedActivityRepository.ts",
  "src/platform/sqlite/repositories/plansWorkoutRepository.ts",
  "src/platform/sqlite/repositories/progressRepository.ts",
  "src/platform/sqlite/repositories/runningActivityMatchRepository.ts",
  "src/platform/sqlite/repositories/runningPlanRepository.ts",
  "src/platform/sqlite/repositories/scheduleRepository.ts",
  "src/platform/sqlite/repositories/trainingCalendarRepository.ts",
  "src/platform/sqlite/serializedWriter.ts",
  "src/platform/sqlite/sqliteKernel.ts",
  "src/platform/files/expoBackupFilePort.ts",
  "src/platform/files/expoCsvFilePort.ts",
  "src/platform/google/googleAuthAdapter.ts",
  "src/platform/google/driveBackupStoreAdapter.ts",
];

function coverageDirectoryArgument(args, fallback) {
  const joined = args.find((argument) =>
    argument.startsWith("--coverageDirectory=")
  );
  if (joined !== undefined) {
    return path.resolve(projectRoot, joined.slice(
      "--coverageDirectory=".length,
    ));
  }
  const index = args.indexOf("--coverageDirectory");
  return index === -1
    ? fallback
    : path.resolve(projectRoot, args[index + 1] ?? "coverage");
}

const forwarded = process.argv.slice(2);
const focusedIntegrityFiles = [];
const focusedProjects = [];
const jestForwarded = [];
let focusPhase18 = false;
for (const argument of forwarded) {
  if (argument === "--focus-phase18") {
    focusPhase18 = true;
  } else if (argument.startsWith("--focus-integrity=")) {
    focusedIntegrityFiles.push(...argument.slice("--focus-integrity=".length).split(",").filter(Boolean));
  } else if (argument.startsWith("--focus-project=")) {
    focusedProjects.push(...argument.slice("--focus-project=".length).split(",").filter(Boolean));
  } else {
    jestForwarded.push(argument);
  }
}
if (focusPhase18) {
  focusedIntegrityFiles.push(...phase18IntegrityCriticalFiles);
  focusedProjects.push("unit", "components", "sqlite-host", "integration");
  jestForwarded.push(...phase18TargetedTests);
}
if (focusedIntegrityFiles.length > 0) {
  const invalidFiles = focusedIntegrityFiles.filter((file) => !integrityCriticalFiles.includes(file));
  if (invalidFiles.length > 0 || focusedProjects.length === 0) {
    console.error(JSON.stringify({
      ok: false,
      error: "focused_integrity_coverage_invalid",
      invalid_files: invalidFiles,
      focus_project_required: focusedProjects.length === 0,
    }, null, 2));
    process.exit(1);
  }
}
let languageReports;
if (focusPhase18) {
  try {
    languageReports = loadPhase18LanguageCoverageReports({ projectRoot });
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "phase18_language_coverage_invalid",
    }, null, 2));
    process.exit(1);
  }
  const evidence = spawnSync(
    process.execPath,
    [
      "--experimental-test-coverage",
      "--test-concurrency=1",
      ...phase18EvidenceFiles.map((file) => `--test-coverage-include=${file}`),
      "--test-coverage-lines=100",
      "--test-coverage-branches=100",
      "--test-coverage-functions=100",
      "--test",
      ...phase18EvidenceTests,
    ],
    { cwd: projectRoot, encoding: "utf8", stdio: "inherit" },
  );
  if (evidence.error !== undefined) throw evidence.error;
  if (evidence.status !== 0) process.exit(evidence.status ?? 1);
}
const outputDirectory = coverageDirectoryArgument(
  forwarded,
  focusPhase18 ? path.join(coverageDirectory, "phase18-jest") : coverageDirectory,
);
rmSync(outputDirectory, { force: true, recursive: true });

const selectedProjects = focusedIntegrityFiles.length > 0
  ? focusedProjects
  : ["unit", "components", "sqlite-host", "integration"];
const collectionArguments = focusedIntegrityFiles.flatMap((file) => [`--collectCoverageFrom=${file}`]);

const jest = spawnSync(
  process.execPath,
  [
    path.join(projectRoot, "node_modules/jest/bin/jest.js"),
    "--config",
    "jest.config.js",
    "--selectProjects",
    ...selectedProjects,
    "--coverage",
    "--coverageDirectory",
    outputDirectory,
    "--coverageReporters=json-summary",
    "--coverageReporters=text",
    "--coverageReporters=json",
    ...collectionArguments,
    ...jestForwarded,
  ],
  {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "inherit",
  },
);
if (jest.error !== undefined) {
  throw jest.error;
}
if (jest.status !== 0) {
  process.exit(jest.status ?? 1);
}

const resolvedSummary = path.join(outputDirectory, "coverage-summary.json");
const summary = JSON.parse(readFileSync(resolvedSummary, "utf8"));
const failures = [];
const requiredIntegrityFiles = focusedIntegrityFiles.length > 0
  ? focusedIntegrityFiles
  : integrityCriticalFiles;
for (const relativePath of requiredIntegrityFiles) {
  const absolutePath = path.join(projectRoot, relativePath);
  const coverage = summary[absolutePath];
  if (coverage === undefined) {
    failures.push(`${relativePath}: no coverage data`);
    continue;
  }
  for (const metric of ["statements", "branches", "functions", "lines"]) {
    if (coverage[metric]?.pct !== 100) {
      failures.push(
        `${relativePath}: ${metric} ${String(coverage[metric]?.pct)}%`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({
    ok: false,
    error: "integrity_critical_coverage_failed",
    failures,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  integrity_critical_files: requiredIntegrityFiles.length,
  focused: focusedIntegrityFiles.length > 0,
  ...(languageReports === undefined ? {} : {
    language_reports: Object.fromEntries(Object.entries(languageReports).map(([language, report]) => [
      language,
      report.coverage,
    ])),
  }),
  metrics: ["statements", "branches", "functions", "lines"],
  required_percent: 100,
}));
