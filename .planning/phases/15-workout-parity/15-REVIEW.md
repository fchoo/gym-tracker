---
phase: 15-workout-parity
reviewed: 2026-10-10T00:00:00Z
depth: standard
files_reviewed: 78
files_reviewed_list:
  - app/(tabs)/__tests__/index.test.tsx
  - app/(tabs)/index.tsx
  - app/__phase15-benchmark.tsx
  - app/__tests__/completion-route.test.tsx
  - app/__tests__/workout-route.test.tsx
  - app/workout/[sessionId].tsx
  - maestro/phase15/active-workout.yaml
  - maestro/phase15/recovery-completion.yaml
  - maestro/phase15/workout-root.yaml
  - package.json
  - scripts/benchmark-phase15-workout.mjs
  - scripts/benchmark-phase15-workout.test.mjs
  - scripts/phase15-evidence-scripts.test.mjs
  - scripts/phase15-native-matrix.mjs
  - scripts/phase15-native-matrix.test.mjs
  - scripts/run-phase15-maestro.mjs
  - scripts/verify-phase15-evidence.mjs
  - src/bootstrap/ownedPlanRuntime.test.ts
  - src/bootstrap/phase15WorkoutBenchmark.test.ts
  - src/bootstrap/phase15WorkoutBenchmark.ts
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/bootstrap/workoutAppRuntime.tsx
  - src/domains/history/index.ts
  - src/domains/history/metricHistory.test.ts
  - src/domains/history/metricHistory.ts
  - src/domains/plans/planImpactCommands.test.ts
  - src/domains/plans/planImpactCommands.ts
  - src/domains/portability/mergePlan.ts
  - src/domains/workout/activeWorkout.ts
  - src/domains/workout/index.ts
  - src/domains/workout/outcomes.test.ts
  - src/domains/workout/workoutPreferences.test.ts
  - src/domains/workout/workoutPreferences.ts
  - src/domains/workout/workoutPresentation.ts
  - src/platform/sqlite/migrations/0036_session_exercise_rest_defaults.ts
  - src/platform/sqlite/migrations/index.ts
  - src/platform/sqlite/repositories/workoutPreferenceRepository.ts
  - src/platform/sqlite/repositories/workoutRepository.ts
  - src/testing/contracts/phase15Workout.contract.ts
  - src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - src/ui/__tests__/AdvancedTimingConfigSheet.test.tsx
  - src/ui/__tests__/AdvancedTimingIndicator.test.tsx
  - src/ui/__tests__/ExerciseTrendSheet.test.tsx
  - src/ui/__tests__/OwnedPlanEditor.test.tsx
  - src/ui/__tests__/RestDock.test.tsx
  - src/ui/__tests__/SetRow.test.tsx
  - src/ui/__tests__/TodayScreen.test.tsx
  - src/ui/__tests__/WorkoutActionDock.test.tsx
  - src/ui/__tests__/WorkoutCompletionScreen.test.tsx
  - src/ui/__tests__/WorkoutDaySelector.test.tsx
  - src/ui/__tests__/WorkoutPlanOverviewRoute.test.tsx
  - src/ui/__tests__/WorkoutPlanSettingsSheet.test.tsx
  - src/ui/__tests__/WorkoutSessionPresentation.test.tsx
  - src/ui/__tests__/WorkoutSetEditorSheet.test.tsx
  - src/ui/__tests__/foundation.test.tsx
  - src/ui/components/AdvancedTimingConfigSheet.tsx
  - src/ui/components/AdvancedTimingIndicator.tsx
  - src/ui/components/ExerciseTrendSheet.tsx
  - src/ui/components/PlanEditorFields.tsx
  - src/ui/components/RestDock.tsx
  - src/ui/components/SemanticToast.test.tsx
  - src/ui/components/SemanticToast.tsx
  - src/ui/components/SetRow.tsx
  - src/ui/components/WorkoutActionDock.tsx
  - src/ui/components/WorkoutDaySelector.tsx
  - src/ui/components/WorkoutPlanSettingsSheet.tsx
  - src/ui/components/WorkoutSessionPresentation.tsx
  - src/ui/components/WorkoutSetEditorSheet.tsx
  - src/ui/components/WorkoutSetFactsRow.tsx
  - src/ui/components/WorkoutStartSheet.tsx
  - src/ui/screens/ActiveWorkoutScreen.tsx
  - src/ui/screens/OwnedPlanEditorScreen.tsx
  - src/ui/screens/TodayScreen.tsx
  - src/ui/screens/WorkoutCompletionScreen.tsx
  - tests/integration/complete-set.test.ts
  - tests/integration/session-exercise-editing.test.ts
  - tests/sqlite-host/workout-preferences.test.ts
findings:
  critical: 3
  warning: 0
  info: 0
  total: 3
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-10-10T00:00:00Z
**Depth:** standard
**Files Reviewed:** 78 (74 existing files plus 4 deleted legacy timing files)
**Status:** issues_found

## Summary

The Phase 15 diff was reviewed against the owner brief, TIM-01 decision, source-precedence rules, Phase 15 plans/summaries, UI specification, and the complete scoped source/test/flow/script set. The code retains correct-looking repository-level guards for exercise-rest receipts and several focused tests pass, but three shipping blockers remain: retired timing commands are still public and manufacture success-shaped results, the new plan/exercise rest preferences have no user-reachable mutation path, and the Phase 20 native-evidence gate can accept forged metadata without retained capture artifacts.

Verification run during review: `npm run typecheck`; focused component and integration suites for Active Workout, plan settings, rest receipts, and completion; and all three Phase 15 evidence/matrix/benchmark script suites. All passed. Those checks do not cover the missing wiring or prove evidence artifact provenance.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: TIM-01 leaves cadence/cluster commands public and reports no-op calls as successful

**Classification:** BLOCKER

**File:** `src/bootstrap/workoutAppRuntime.tsx:933-962`, `src/bootstrap/workoutAppRuntime.tsx:3306-3377`, `src/bootstrap/workoutAppRuntime.tsx:4163`, `src/bootstrap/workoutAppRuntime.tsx:4265-4268`, `src/bootstrap/workoutAppRuntime.tsx:4312-4314`, `src/bootstrap/workoutAppRuntime.tsx:4339`, `src/bootstrap/workoutAppRuntime.tsx:4373-4377`, `src/bootstrap/workoutAppRuntime.tsx:4386`

**Issue:** TIM-01 requires retirement of cadence/cluster authoring, callbacks, reconciliation, and playback with no compatibility mode. The runtime still exposes all of those methods in `RuntimeValue`, initializes an advanced-timing repository, and implements each method by returning a fabricated `AdvancedTimingCommandResult` (`idle`, revision `0`, and the caller-supplied session revision) without reading or writing SQLite. A caller therefore receives a result that has the same shape as a committed command result even though no transaction happened. This preserves the forbidden capability surface and can make a retained or future caller acknowledge a timing mutation/reconciliation that never occurred.

**Fix:** Remove the advanced-timing command/context types, runtime callbacks, exports, value bindings, repository creation, and now-dead cue helpers from the production runtime. Keep legacy timing tables/readability only behind portability/history readers, with no active runtime command port. Add a structural regression test that fails if `RuntimeValue` or the active runtime imports/exports any cadence/cluster command or repository.

### CR-02: Flat timing and plan-preference persistence are implemented but unreachable from the product

**Classification:** BLOCKER

**File:** `src/ui/components/WorkoutPlanSettingsSheet.tsx:27-78`, `src/ui/screens/ActiveWorkoutScreen.tsx:2534-2547`, `src/bootstrap/workoutAppRuntime.tsx:3910-3932`

**Issue:** The new `WorkoutPlanSettingsSheet` is not rendered outside its isolated component test, and `readWorkoutPreferences`/`setWorkoutPreferences` have no production caller. Separately, the only Active "Timing" surface is a read-only text label; it never collects seconds, builds the revision/idempotency envelope, or calls `updateSessionExerciseDefaultRest`. Consequently users cannot save the required plan default rest/weight increment or the required per-exercise flat between-set-rest override. Repository tests prove an internal command, not the required user workflow, so WRK-26/WRK-27 are functionally absent.

**Fix:** Mount `WorkoutPlanSettingsSheet` from the real Workout/plan context, load the preference by the authoritative plan ID, and save through `setWorkoutPreferences` with revision-conflict retry/readback handling. Replace the Active timing display with an explicit seconds editor whose save builds a stable request ID/hash and calls `updateSessionExerciseDefaultRest`; keep the sheet open with the draft on failure and reload the returned authoritative view on success. Add route-level tests that invoke both controls and assert the repository/runtime calls and no-write dismissal paths.

### CR-03: The native-evidence verifier trusts self-reported hashes instead of retained evidence artifacts

**Classification:** BLOCKER

**File:** `scripts/verify-phase15-evidence.mjs:47-53`, `scripts/verify-phase15-evidence.mjs:63-86`, `scripts/verify-phase15-evidence.mjs:169-181`

**Issue:** The verifier validates only that manifest, semantic, focus, screenshot, overlay, difference, receipt, and report fields look like hashes and agree with one another. It does not require paths for those artifacts, check that they exist, recompute their digests, parse the Maestro/device report, or bind a report digest to an actual report file. A fabricated `phase15-evidence.json` and matching manifest can therefore claim `status: "passed"`, native screenshots, accessibility/focus traces, receipt evidence, and recovery coverage while no capture ever occurred. The exact-HEAD/APK checks at line 177 do not fix this because they authenticate the APK, not the claimed observations. This would make the owner-directed Phase 20 final checkpoint unreliable; it is not a finding about the intentional deferral itself.

**Fix:** Define a fail-closed artifact manifest with workspace-relative, traversal-checked paths for every raw screenshot, overlay, difference, semantic tree, focus trace, receipt/export, lifecycle trace, and Maestro/device report. Require each file to exist, hash its bytes during verification, and compare the recomputed digest to the evidence record. Parse the raw report to verify each case ID/status/device action rather than trusting `cases[]`; bind the manifest's `report_sha256` to that report. Add mutation tests for absent/replaced artifacts and for a synthetic JSON record whose hashes are internally consistent but whose files are missing.

---

_Reviewed: 2026-10-10T00:00:00Z_
_Reviewer: TRAE (gsd-code-reviewer)_
_Depth: standard_
