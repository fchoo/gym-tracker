#!/usr/bin/env node

import {
  execFileSync,
  spawnSync,
} from "node:child_process";
import {
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

import { loadPhase18LanguageCoverageReports } from "./phase18-language-coverage.mjs";

const projectRoot = process.cwd();
const coverageDirectory = path.join(projectRoot, "coverage");
const summaryPath = path.join(coverageDirectory, "coverage-summary.json");
const phase19CoverageManifest = JSON.parse(readFileSync(
  path.join(projectRoot, "scripts/phase19-integrity-coverage.json"),
  "utf8",
));
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
  "src/bootstrap/phase18GarminBenchmarkRuntime.ts",
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
  "src/bootstrap/phase18GarminBenchmarkRuntime.test.ts",
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
  "scripts/phase18-aggregate-acceptance.test.mjs",
  "scripts/phase18-benchmark-helper-coverage.test.mjs",
  "scripts/benchmark-phase18-garmin.test.mjs",
  "scripts/phase18-evidence-helpers.test.mjs",
  "scripts/phase18-build-manifest.test.mjs",
  "scripts/phase18-device-identity.test.mjs",
  "scripts/phase18-garmin-acceptance.test.mjs",
  "scripts/phase18-garmin-adversarial.test.mjs",
  "scripts/phase18-garmin-proof.test.mjs",
  "scripts/phase18-installed-apk.test.mjs",
  "scripts/phase18-language-coverage.test.mjs",
  "scripts/phase18-privacy-scan.test.mjs",
  "scripts/phase18-proof-helper-coverage.test.mjs",
  "scripts/phase18-verifier-cli.test.mjs",
  "scripts/run-phase18-python-coverage.test.mjs",
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
  "scripts/phase18-aggregate-acceptance.mjs",
  "scripts/phase18-device-identity.mjs",
  "scripts/phase18-installed-apk.mjs",
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
const phase16EvidenceTests = [
  "scripts/v12-calendar-comparison.test.mjs",
  "scripts/v12-evidence-scripts.test.mjs",
  "scripts/v12-calendar-evidence-coverage.test.mjs",
];
const phase16EvidenceFiles = [
  "scripts/benchmark-v12-interactions.mjs",
  "scripts/compare-v12-calendar.mjs",
  "scripts/run-v12-maestro.mjs",
  "scripts/verify-v12-native-evidence.mjs",
  "scripts/v12-calendar-artifacts.mjs",
  "scripts/v12-calendar-case-registry.mjs",
];
const phase19IntegrityCriticalFiles = phase19CoverageManifest.required_files;
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
  "src/domains/progress/dashboardProjection.ts",
  "src/domains/progress/runningPacing.ts",
  "src/domains/progress/periodProjection.ts",
  "src/domains/progress/relativeStrength.ts",
  "src/domains/history/metricHistory.ts",
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
  "src/bootstrap/phase18GarminBenchmarkRuntime.ts",
  "src/bootstrap/runningPlanRuntime.tsx",
  "src/bootstrap/trainingFoundationRuntime.ts",
  "src/bootstrap/workoutAppRuntime.tsx",
  "src/bootstrap/phase16CalendarTestControls.ts",
  "src/ui/calendar/calendarTransitionController.ts",
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
  "src/platform/sqlite/migrations/0045_recommendation_decision_receipts.ts",
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
  "src/platform/sqlite/repositories/historyRepository.ts",
  "src/platform/sqlite/repositories/garminSyncSummaryRepository.ts",
  "src/platform/sqlite/repositories/importedActivityRepository.ts",
  "src/platform/sqlite/repositories/plansWorkoutRepository.ts",
  "src/platform/sqlite/repositories/progressRepository.ts",
  "src/platform/sqlite/repositories/runningActivityMatchRepository.ts",
  "src/platform/sqlite/repositories/runningPlanRepository.ts",
  "src/platform/sqlite/repositories/scheduleRepository.ts",
  "src/platform/sqlite/repositories/trainingCalendarRepository.ts",
  "src/platform/sqlite/repositories/workoutOutcomeRepository.ts",
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

function resolveJestBin() {
  if (process.env.PHASE19_JEST_BIN !== undefined) {
    return process.env.PHASE19_JEST_BIN;
  }
  try {
    return createRequire(import.meta.url).resolve("jest/bin/jest.js");
  } catch {
    return path.join(projectRoot, "node_modules/jest/bin/jest.js");
  }
}

function validatePhase19CoverageManifest() {
  const expectedKeys = [
    "schema_version", "phase", "diff_base", "diff_head", "required_files",
    "supporting_files", "changed_line_scope", "unreachable_coverage",
    "reviewed_exclusions",
  ];
  const exactKeys = (value, keys) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length
      && actual.every((key, index) => key === expected[index]);
  };
  const exclusions = phase19CoverageManifest.reviewed_exclusions;
  if (
    !exactKeys(phase19CoverageManifest, expectedKeys)
    || phase19CoverageManifest.schema_version !== 1
    || phase19CoverageManifest.phase !== "19-progress-parity"
    || !Array.isArray(phase19IntegrityCriticalFiles)
    || phase19IntegrityCriticalFiles.length < 1
    || new Set(phase19IntegrityCriticalFiles).size !== phase19IntegrityCriticalFiles.length
    || !Array.isArray(phase19CoverageManifest.supporting_files)
    || phase19CoverageManifest.supporting_files.some((filePath) =>
      !phase19IntegrityCriticalFiles.includes(filePath))
    || !Array.isArray(phase19CoverageManifest.changed_line_scope)
    || phase19CoverageManifest.changed_line_scope.some((entry) =>
      !exactKeys(entry, ["path", "reason"])
      || !phase19IntegrityCriticalFiles.includes(entry.path)
      || typeof entry.reason !== "string"
      || entry.reason.length < 20)
    || !Array.isArray(phase19CoverageManifest.unreachable_coverage)
    || phase19CoverageManifest.unreachable_coverage.some((entry) =>
      !exactKeys(entry, ["path", "line", "metrics", "reason"])
      || !phase19CoverageManifest.changed_line_scope.some(({ path: filePath }) =>
        filePath === entry.path)
      || !Number.isSafeInteger(entry.line)
      || entry.line < 1
      || !Array.isArray(entry.metrics)
      || entry.metrics.length < 1
      || entry.metrics.some((metric) =>
        !["statements", "branches", "functions", "lines"].includes(metric))
      || typeof entry.reason !== "string"
      || entry.reason.length < 40)
    || !Array.isArray(exclusions)
    || exclusions.some((entry) =>
      !exactKeys(entry, ["path", "reason"])
      || typeof entry.reason !== "string"
      || entry.reason.length < 20)
    || new Set(exclusions.map(({ path: filePath }) => filePath)).size !== exclusions.length
  ) throw new Error("phase19_integrity_coverage_manifest_invalid");

  const changedModules = execFileSync(
    "git",
    [
      "diff", "--name-only",
      `${phase19CoverageManifest.diff_base}..${phase19CoverageManifest.diff_head}`,
    ],
    { cwd: projectRoot, encoding: "utf8" },
  ).split(/\r?\n/u).filter((filePath) =>
    /^(?:src|app)\/.*\.tsx?$/u.test(filePath)
    && !/\.test\.|\/__tests__\/|^src\/testing\//u.test(filePath));
  const classified = new Set([
    ...phase19IntegrityCriticalFiles,
    ...exclusions.map(({ path: filePath }) => filePath),
  ]);
  const changed = new Set(changedModules);
  const unclassified = changedModules.filter((filePath) => !classified.has(filePath));
  const supporting = new Set(phase19CoverageManifest.supporting_files);
  const stale = [...classified].filter((filePath) =>
    !changed.has(filePath) && !supporting.has(filePath));
  const invalidRequired = phase19IntegrityCriticalFiles.filter((filePath) =>
    !integrityCriticalFiles.includes(filePath));
  if (unclassified.length > 0 || stale.length > 0 || invalidRequired.length > 0) {
    throw new Error(JSON.stringify({
      error: "phase19_integrity_coverage_manifest_drift",
      unclassified,
      stale,
      invalid_required: invalidRequired,
    }));
  }
}

function phase19OwnedLines(relativePath) {
  const phaseCommits = new Set(execFileSync(
    "git",
    [
      "rev-list",
      `${phase19CoverageManifest.diff_base}..${phase19CoverageManifest.diff_head}`,
    ],
    { cwd: projectRoot, encoding: "utf8" },
  ).split(/\r?\n/u).filter(Boolean));
  const lines = new Set();
  const blame = execFileSync(
    "git",
    ["blame", "--line-porcelain", "HEAD", "--", relativePath],
    { cwd: projectRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  for (const line of blame.split(/\r?\n/u)) {
    const match = line.match(/^([a-f0-9]{40}) \d+ (\d+)(?: (\d+))?$/u);
    if (match === null || !phaseCommits.has(match[1])) continue;
    const start = Number(match[2]);
    const count = Number(match[3] ?? 1);
    for (let index = 0; index < count; index += 1) lines.add(start + index);
  }
  if (lines.size === 0) throw new Error(`phase19_owned_lines_missing:${relativePath}`);
  return lines;
}

function overlapsOwnedLines(location, ownedLines) {
  const start = location?.start?.line;
  const end = location?.end?.line ?? start;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return false;
  for (let line = start; line <= end; line += 1) {
    if (ownedLines.has(line)) return true;
  }
  return false;
}

function changedScopeFailures(relativePath, detail) {
  const ownedLines = phase19OwnedLines(relativePath);
  const failures = [];
  const excluded = (metric, line) => phase19CoverageManifest.unreachable_coverage.some(
    (entry) => entry.path === relativePath
      && entry.line === line
      && entry.metrics.includes(metric),
  );
  const statements = Object.entries(detail.statementMap)
    .filter(([, location]) => overlapsOwnedLines(location, ownedLines)
      && !excluded("statements", location.start.line));
  const functions = Object.entries(detail.fnMap)
    .filter(([, metadata]) => overlapsOwnedLines(metadata.loc, ownedLines)
      && !excluded("functions", metadata.loc.start.line));
  const branches = Object.entries(detail.branchMap)
    .filter(([, metadata]) => overlapsOwnedLines(metadata.loc, ownedLines)
      && !excluded("branches", metadata.loc.start.line));
  const lines = new Map();
  for (const [id, location] of statements) {
    const line = location.start.line;
    if (excluded("lines", line)) continue;
    lines.set(line, (lines.get(line) ?? 0) + detail.s[id]);
  }
  const metrics = {
    statements: statements.map(([id]) => detail.s[id]),
    branches: branches.flatMap(([id]) => detail.b[id]),
    functions: functions.map(([id]) => detail.f[id]),
    lines: [...lines.values()],
  };
  for (const [metric, counts] of Object.entries(metrics)) {
    if (counts.some((count) => count === 0)) {
      failures.push(`${relativePath}: changed ${metric} below 100%`);
    }
  }
  return failures;
}

const forwarded = process.argv.slice(2);
const focusedIntegrityFiles = [];
const focusedProjects = [];
const jestForwarded = [];
let focusPhase18 = false;
let focusPhase16Evidence = false;
let focusPhase19 = false;
for (let index = 0; index < forwarded.length; index += 1) {
  const argument = forwarded[index];
  if (argument === "--focus-phase18") {
    focusPhase18 = true;
  } else if (argument === "--focus-phase16-evidence") {
    focusPhase16Evidence = true;
  } else if (argument === "--focus-phase19") {
    focusPhase19 = true;
  } else if (argument.startsWith("--focus-integrity=")) {
    focusedIntegrityFiles.push(...argument.slice("--focus-integrity=".length).split(",").filter(Boolean));
  } else if (argument.startsWith("--focus-project=")) {
    focusedProjects.push(...argument.slice("--focus-project=".length).split(",").filter(Boolean));
  } else if (argument === "--coverageDirectory") {
    index += 1;
  } else if (argument.startsWith("--coverageDirectory=")) {
    // Consumed by coverageDirectoryArgument; do not forward a duplicate to Jest.
  } else {
    jestForwarded.push(argument);
  }
}
if (focusPhase16Evidence) {
  focusedIntegrityFiles.push("src/bootstrap/phase16CalendarTestControls.ts");
  focusedProjects.push("unit");
  jestForwarded.push("src/bootstrap/phase16CalendarTestControls.test.ts");
}
if (focusPhase18) {
  focusedIntegrityFiles.push(...phase18IntegrityCriticalFiles);
  focusedProjects.push("unit", "components", "sqlite-host", "integration");
  jestForwarded.push(...phase18TargetedTests);
}
if (focusPhase19) {
  validatePhase19CoverageManifest();
  focusedIntegrityFiles.push(...phase19IntegrityCriticalFiles);
  focusedProjects.push("unit", "components", "sqlite-host", "integration");
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
if (focusPhase16Evidence) {
  const evidence = spawnSync(
    process.execPath,
    [
      "--experimental-test-coverage",
      "--test-concurrency=1",
      ...phase16EvidenceFiles.map((file) => `--test-coverage-include=${file}`),
      "--test-coverage-lines=100",
      "--test-coverage-branches=100",
      "--test-coverage-functions=100",
      "--test",
      ...phase16EvidenceTests,
    ],
    { cwd: projectRoot, encoding: "utf8", stdio: "inherit" },
  );
  if (evidence.error !== undefined) throw evidence.error;
  if (evidence.status !== 0) process.exit(evidence.status ?? 1);
}
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
  const evidenceEnvironment = { ...process.env };
  delete evidenceEnvironment.ANDROID_HOME;
  delete evidenceEnvironment.ANDROID_SDK_ROOT;
  delete evidenceEnvironment.ANDROID_SERIAL;
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
    { cwd: projectRoot, encoding: "utf8", env: evidenceEnvironment, stdio: "inherit" },
  );
  if (evidence.error !== undefined) throw evidence.error;
  if (evidence.status !== 0) process.exit(evidence.status ?? 1);
}
const outputDirectory = coverageDirectoryArgument(
  forwarded,
  focusPhase18
    ? path.join(coverageDirectory, "phase18-jest")
    : focusPhase16Evidence
      ? path.join(coverageDirectory, "phase16-jest")
      : focusPhase19
        ? path.join(coverageDirectory, "phase19-jest")
      : coverageDirectory,
);
rmSync(outputDirectory, { force: true, recursive: true });

const selectedProjects = focusedIntegrityFiles.length > 0
  ? focusedProjects
  : ["unit", "components", "sqlite-host", "integration"];
const collectionArguments = focusedIntegrityFiles.flatMap((file) => [`--collectCoverageFrom=${file}`]);

const jest = spawnSync(
  process.execPath,
  [
    resolveJestBin(),
    "--config",
    focusPhase19 && process.env.PHASE19_NODE_MODULES !== undefined
      ? "scripts/phase19-coverage.jest.cjs"
      : "jest.config.js",
    "--selectProjects",
    ...selectedProjects,
    "--coverage",
    "--coverageDirectory",
    outputDirectory,
    "--coverageReporters=json-summary",
    "--coverageReporters=text",
    "--coverageReporters=json",
    "--coverageThreshold={}",
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
const detail = JSON.parse(readFileSync(
  path.join(outputDirectory, "coverage-final.json"),
  "utf8",
));
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
  const changedScope = focusPhase19
    && phase19CoverageManifest.changed_line_scope.some(({ path: filePath }) =>
      filePath === relativePath);
  if (changedScope) {
    const fileDetail = detail[absolutePath];
    if (fileDetail === undefined) {
      failures.push(`${relativePath}: no detailed coverage data`);
    } else {
      failures.push(...changedScopeFailures(relativePath, fileDetail));
    }
  } else {
    for (const metric of ["statements", "branches", "functions", "lines"]) {
      if (coverage[metric]?.pct !== 100) {
        failures.push(
          `${relativePath}: ${metric} ${String(coverage[metric]?.pct)}%`,
        );
      }
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
  changed_line_scope_files: focusPhase19
    ? phase19CoverageManifest.changed_line_scope.length
    : 0,
}));
