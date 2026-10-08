---
phase: 13-multi-plan-running-foundation
reviewed: 2026-10-08T06:44:23Z
depth: standard
files_reviewed: 111
files_reviewed_list:
  - app/__native-contracts.tsx
  - jest.setup.js
  - package.json
  - scripts/build-current-native-test-apk.sh
  - scripts/run-coverage-gate.mjs
  - scripts/run-native-sqlite-contracts.mjs
  - scripts/verify-phase13-evidence.mjs
  - scripts/verify-phase13-evidence.test.mjs
  - src/bootstrap/phase12BackupBenchmark.ts
  - src/bootstrap/scheduleRuntime.tsx
  - src/bootstrap/trainingFoundationRuntime.test.ts
  - src/bootstrap/trainingFoundationRuntime.ts
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/bootstrap/workoutAppRuntime.tsx
  - src/domains/activities/activityIdentity.test.ts
  - src/domains/activities/activityIdentity.ts
  - src/domains/activities/garminActivitySourcePort.test.ts
  - src/domains/activities/garminActivitySourcePort.ts
  - src/domains/activities/importCommands.test.ts
  - src/domains/activities/importCommands.ts
  - src/domains/activities/importContracts.ts
  - src/domains/advancedTiming/advancedTimingCommands.test.ts
  - src/domains/advancedTiming/advancedTimingCommands.ts
  - src/domains/advancedTiming/advancedTimingState.test.ts
  - src/domains/bodyweight/commands.ts
  - src/domains/bodyweight/contracts.test.ts
  - src/domains/bodyweight/contracts.ts
  - src/domains/portability/backupCommands.test.ts
  - src/domains/portability/backupContracts.test.ts
  - src/domains/portability/backupContracts.ts
  - src/domains/portability/backupFormat.test.ts
  - src/domains/portability/mergePlan.test.ts
  - src/domains/portability/mergePlan.ts
  - src/domains/portability/restoreCommands.test.ts
  - src/domains/portability/restoreCommands.ts
  - src/domains/running/activityMatchCommands.test.ts
  - src/domains/running/activityMatchCommands.ts
  - src/domains/running/commands.test.ts
  - src/domains/running/commands.ts
  - src/domains/running/contracts.test.ts
  - src/domains/running/contracts.ts
  - src/domains/scheduling/activePlanSelection.test.ts
  - src/domains/scheduling/activePlanSelection.ts
  - src/domains/scheduling/scheduleCommands.test.ts
  - src/domains/scheduling/scheduleCommands.ts
  - src/domains/scheduling/scheduleState.test.ts
  - src/domains/scheduling/scheduleState.ts
  - src/domains/workout/index.ts
  - src/domains/workout/setCommands.test.ts
  - src/domains/workout/setCommands.ts
  - src/platform/crypto/runtimeSha256.native.ts
  - src/platform/crypto/runtimeSha256.test.ts
  - src/platform/crypto/runtimeSha256.ts
  - src/platform/sqlite/migrations/0023_automatic_drive_backup.ts
  - src/platform/sqlite/migrations/0028_multi_plan_running_foundation.ts
  - src/platform/sqlite/migrations/0029_running_session_roots.ts
  - src/platform/sqlite/migrations/0030_imported_activity_evidence.ts
  - src/platform/sqlite/migrations/0031_bodyweight_source_history.ts
  - src/platform/sqlite/migrations/0032_strength_occurrence_provenance.ts
  - src/platform/sqlite/migrations/0033_completed_set_correction_receipts.ts
  - src/platform/sqlite/migrations/0034_running_activity_match_ledger.ts
  - src/platform/sqlite/migrations/0035_imported_activity_lifecycle_state.ts
  - src/platform/sqlite/migrations/index.ts
  - src/platform/sqlite/repositories/advancedTimingRepository.test.ts
  - src/platform/sqlite/repositories/bodyweightRepository.ts
  - src/platform/sqlite/repositories/importedActivityRepository.ts
  - src/platform/sqlite/repositories/logicalBackupRepository.ts
  - src/platform/sqlite/repositories/logicalMergeRepository.ts
  - src/platform/sqlite/repositories/logicalRestoreRepository.ts
  - src/platform/sqlite/repositories/plansWorkoutRepository.ts
  - src/platform/sqlite/repositories/progressRepository.test.ts
  - src/platform/sqlite/repositories/progressRepository.ts
  - src/platform/sqlite/repositories/restoreReconciliationRepository.ts
  - src/platform/sqlite/repositories/runningActivityMatchRepository.ts
  - src/platform/sqlite/repositories/runningPlanRepository.ts
  - src/platform/sqlite/repositories/scheduleRepository.ts
  - src/platform/sqlite/repositories/trainingCalendarRepository.ts
  - src/platform/sqlite/repositories/workoutRepository.ts
  - src/platform/sqlite/serializedWriter.ts
  - src/platform/sqlite/sqliteKernel.ts
  - src/testing/contracts/migrationsEffects.contract.ts
  - src/testing/contracts/multiPlanRunning.contract.test.ts
  - src/testing/contracts/multiPlanRunning.contract.ts
  - src/testing/contracts/phase2Plan.contract.ts
  - src/testing/contracts/portableMerge.contract.test.ts
  - src/testing/contracts/portableMerge.contract.ts
  - tests/integration/advanced-timing.test.ts
  - tests/integration/automatic-drive-backup.test.ts
  - tests/integration/bodyweight-history.test.ts
  - tests/integration/complete-set.test.ts
  - tests/integration/imported-activity-facts.test.ts
  - tests/integration/multi-plan-foundation-tracer.test.ts
  - tests/integration/multi-plan-lifecycle.test.ts
  - tests/integration/multi-plan-portability.test.ts
  - tests/integration/plan-workout-tracer.test.ts
  - tests/integration/portable-merge.test.ts
  - tests/integration/running-activity-match.test.ts
  - tests/integration/running-foundation.test.ts
  - tests/integration/runtime-sha256.test.ts
  - tests/integration/schedule-commands.test.ts
  - tests/integration/starter-activation-repository.test.ts
  - tests/integration/today-schedule-workout.test.ts
  - tests/migrations/fixtures/v27-multi-plan-baseline.sql
  - tests/sqlite-host/cleanInstallRestore.test.ts
  - tests/sqlite-host/logicalBackupRepository.test.ts
  - tests/sqlite-host/logicalMergeRepository.test.ts
  - tests/sqlite-host/logicalRestoreRepository.test.ts
  - tests/sqlite-host/migrations-effects.test.ts
  - tests/sqlite-host/progressRepository.test.ts
  - tests/sqlite-host/restoreReconciliationRepository.test.ts
  - tests/sqlite-host/trainingCalendarRepository.test.ts
findings:
  critical: 3
  warning: 0
  info: 0
  total: 3
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-10-08T06:44:23Z
**Depth:** standard
**Files Reviewed:** 111
**Status:** issues_found

## Summary

The Phase 13 implementation was reviewed at standard depth, including SQLite repositories and migrations, runtime/domain adapters, portability flows, contract/evidence tooling, native harnesses, and the full supplied 111-file manifest. Three release-blocking defects remain: Strength schedule activation still enforces a single global active pair, native evidence reports thirteen tests that were never independently executed, and APK evidence is not cryptographically tied to the committed complete source tree. Passing focused unit/host suites do not exercise or prove these conditions.

## Narrative Findings (AI reviewer)

## BLOCKER Issues

### BL-01 [BLOCKER]: Strength activation still treats all sports as one globally active plan/schedule pair

**File:** `src/platform/sqlite/repositories/scheduleRepository.ts:818-862, 1100-1105, 1151-1175, 1226-1233`

**Issue:** `readActiveSchedulePair()` selects active plans and schedules without a sport predicate and rejects any state with more than one of either. `activateSchedule()` calls it before activation, deactivates the pair it returns, and uses it again for its final assertion. A valid Phase 13 state containing an active Running pair and an active Strength pair therefore makes a subsequent Strength activation throw; if it reaches the deactivation path with a Running pair, it can deactivate Running. The separate Running-specific activation path masks the defect in the Strength-then-Running direction but does not make activation or later schedule mutation safe in the reverse/concurrent state.

**Evidence:** The unspecialized count/assertion is at lines 818-862; it is invoked at 1100-1105, its result is deactivated at 1151-1175, and the same global assertion is used after mutation at 1226-1233. `runningPlanRepository.ts` uses a separate running-specific activation path, so an existing Strength-to-Running tracer cannot cover the inverse direction.

**Fix:** Make the active-pair lookup, cardinality assertions, and deactivation queries sport-scoped for the Strength command (or make sport an explicit repository argument). Preserve every other sport's active plan/schedule pair. Add repository/integration coverage for Running-first then Strength activation, and for changing the Strength schedule after both sports are active.

### BL-02 [BLOCKER]: Native contract output fabricates thirteen pass identities from two aggregate calls

**File:** `src/testing/contracts/multiPlanRunning.contract.ts:11-16, 31-49`; `app/__native-contracts.tsx:514-518`; `scripts/verify-phase13-evidence.mjs:191-202, 243-258`

**Issue:** The contract declares thirteen distinct Phase 13 case IDs, but its runner executes only `runMigrationsEffectsContract()` and `runPortableMergeContract()`. It then assigns every named case the same aggregate `passed` or `failed` value. The native app invokes this wrapper and the evidence verifier accepts and persists a passing record for every advertised ID. This makes the evidence claim that activity import, bodyweight history, active-plan selection, scheduling, running workout, activity matching, and other named flows passed native validation when none of those cases was actually executed or independently asserted.

**Evidence:** Lines 11-16 define the thirteen IDs, while lines 31-42 call only the two aggregate contracts and lines 45-49 broadcast their status to all IDs. The native suite calls that wrapper at `app/__native-contracts.tsx:514-518`; the verifier treats each returned record as independently satisfied at lines 191-202 and persists it at 243-258.

**Fix:** Implement and execute one concrete adapter-backed native test for each advertised case ID, returning that case's actual result and diagnostic detail. Alternatively, emit only the two genuinely executed suite IDs and revise the Phase 13 evidence requirements so the report cannot imply coverage that did not run.

### BL-03 [BLOCKER]: Accepted APK evidence is not bound to the committed full source tree

**File:** `scripts/source-tree-digest.mjs:16-18, 74-83`; `scripts/verify-phase13-evidence.mjs:308-313`

**Issue:** The digest deliberately excludes the tracked `android/` and `ios/` trees, then hashes bytes from the working tree rather than the checked-out commit tree. The verifier compares that mutable digest with the evidence record and compares only the current `HEAD` string and APK hashes. Consequently, an APK incorporating changed native source can retain the same source digest, and an APK built from uncommitted JavaScript/TypeScript can be accepted while `base_head` names an older commit. This defeats the evidence chain needed to trust that the tested APK corresponds to the reviewed Phase 13 source.

**Evidence:** The exclusions are declared at lines 16-18 and working-tree file bytes are read at lines 74-83. The verifier's final binding check at `verify-phase13-evidence.mjs:308-313` compares current `HEAD`, the mutable digest, and APK hashes only; it never derives a digest from the recorded commit tree or covers the native source trees.

**Fix:** Refuse evidence creation/verification from a dirty worktree; calculate the digest from the exact committed tree named by `base_head` (for example, `git show <commit>:<path>` or a committed-tree manifest); and include source-controlled Android/iOS files while excluding only generated native build outputs. Record and verify the commit/tree digest alongside the APK hashes.

---

_Reviewed: 2026-10-08T06:44:23Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
