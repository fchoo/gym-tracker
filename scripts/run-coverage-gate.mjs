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

const projectRoot = process.cwd();
const coverageDirectory = path.join(projectRoot, "coverage");
const summaryPath = path.join(coverageDirectory, "coverage-summary.json");
const integrityCriticalFiles = [
  "src/domains/content/catalog.ts",
  "src/domains/portability/backupContracts.ts",
  "src/domains/portability/backupCommands.ts",
  "src/domains/portability/backupFormat.ts",
  "src/domains/portability/csvExport.ts",
  "src/domains/portability/restoreCommands.ts",
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
  "src/domains/workout/setCommands.ts",
  "src/domains/workout/startWorkout.ts",
  "src/domains/workout/undoCompletedSet.ts",
  "src/platform/crypto/candidateKdfDescriptor.ts",
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
  "src/platform/sqlite/migrations/index.ts",
  "src/platform/sqlite/recoveryBackup.ts",
  "src/platform/sqlite/repositories/contentRepository.ts",
  "src/platform/sqlite/repositories/logicalBackupRepository.ts",
  "src/platform/sqlite/repositories/csvExportRepository.ts",
  "src/platform/sqlite/repositories/logicalRestoreRepository.ts",
  "src/platform/sqlite/repositories/restoreReconciliationRepository.ts",
  "src/platform/sqlite/repositories/restorePreflightAdapters.ts",
  "src/platform/sqlite/repositories/exerciseSearchIndexRepository.ts",
  "src/platform/sqlite/repositories/customExerciseRepository.ts",
  "src/platform/sqlite/repositories/librarySearchRepository.ts",
  "src/platform/sqlite/repositories/metricRepository.ts",
  "src/platform/sqlite/repositories/ownedPlanRepository.ts",
  "src/platform/sqlite/repositories/planImpactRepository.ts",
  "src/platform/sqlite/repositories/starterPlanRepository.ts",
  "src/platform/sqlite/serializedWriter.ts",
  "src/platform/sqlite/sqliteKernel.ts",
  "src/platform/files/expoBackupFilePort.ts",
  "src/platform/files/expoCsvFilePort.ts",
];

function coverageDirectoryArgument(args) {
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
    ? coverageDirectory
    : path.resolve(projectRoot, args[index + 1] ?? "coverage");
}

const forwarded = process.argv.slice(2);
const outputDirectory = coverageDirectoryArgument(forwarded);
rmSync(outputDirectory, { force: true, recursive: true });

const jest = spawnSync(
  process.execPath,
  [
    path.join(projectRoot, "node_modules/jest/bin/jest.js"),
    "--config",
    "jest.config.js",
    "--selectProjects",
    "unit",
    "components",
    "sqlite-host",
    "integration",
    "--coverage",
    ...forwarded,
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
for (const relativePath of integrityCriticalFiles) {
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
  integrity_critical_files: integrityCriticalFiles.length,
  metrics: ["statements", "branches", "functions", "lines"],
  required_percent: 100,
}));
