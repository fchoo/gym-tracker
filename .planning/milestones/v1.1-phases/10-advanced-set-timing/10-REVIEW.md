---
phase: 10-advanced-set-timing
reviewed: 2026-10-01T03:35:03Z
reviewed_head: 8c64e33
depth: standard
files_reviewed: 71
files_reviewed_list:
  - app/__native-contracts.tsx
  - app/workout/[sessionId].tsx
  - maestro/phase10/advanced-set-timing.yaml
  - package.json
  - scripts/phase10-evidence-scripts.test.mjs
  - scripts/phase9-v20-native-evidence.test.mjs
  - scripts/run-coverage-gate.mjs
  - scripts/run-native-sqlite-contracts.mjs
  - scripts/run-phase10-maestro.mjs
  - scripts/verify-phase9-task1-boundary.mjs
  - scripts/verify-phase9-v20-native-evidence.mjs
  - src/bootstrap/phase1Benchmark.ts
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/bootstrap/workoutAppRuntime.tsx
  - src/domains/advancedTiming/advancedTimingCommands.test.ts
  - src/domains/advancedTiming/advancedTimingCommands.ts
  - src/domains/advancedTiming/advancedTimingConfig.test.ts
  - src/domains/advancedTiming/advancedTimingConfig.ts
  - src/domains/advancedTiming/advancedTimingState.test.ts
  - src/domains/advancedTiming/advancedTimingState.ts
  - src/domains/advancedTiming/index.ts
  - src/domains/plans/ownedPlanCommands.ts
  - src/domains/plans/index.ts
  - src/domains/plans/planImpactCommands.test.ts
  - src/domains/plans/planImpactCommands.ts
  - src/domains/portability/backupContracts.test.ts
  - src/domains/portability/backupContracts.ts
  - src/domains/portability/restoreCommands.test.ts
  - src/domains/portability/restoreCommands.ts
  - src/domains/portability/fixtures/pre-phase10-schema20-v1.json
  - src/domains/workout/activeWorkout.ts
  - src/domains/workout/hapticsPort.ts
  - src/domains/workout/setCommands.test.ts
  - src/platform/haptics/expoHapticsAdapter.test.ts
  - src/platform/haptics/expoHapticsAdapter.ts
  - src/platform/sqlite/migrations/0021_advanced_set_timing.ts
  - src/platform/sqlite/migrations/0027_advanced_timing_target_ownership.ts
  - src/platform/sqlite/migrations/index.ts
  - src/platform/sqlite/repositories/advancedTimingRepository.test.ts
  - src/platform/sqlite/repositories/advancedTimingRepository.ts
  - src/platform/sqlite/repositories/logicalBackupRepository.ts
  - src/platform/sqlite/repositories/ownedPlanRepository.ts
  - src/platform/sqlite/repositories/plansWorkoutRepository.ts
  - src/platform/sqlite/repositories/restorePreflightAdapters.test.ts
  - src/platform/sqlite/repositories/restorePreflightAdapters.ts
  - src/platform/sqlite/repositories/workoutRepository.ts
  - src/testing/contracts/migrationsEffects.contract.ts
  - src/testing/contracts/phase2Plan.contract.ts
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - src/ui/__tests__/AdvancedTimingConfigSheet.test.tsx
  - src/ui/__tests__/AdvancedTimingIndicator.test.tsx
  - src/ui/__tests__/OwnedPlanEditor.test.tsx
  - src/ui/__tests__/WorkoutPlanOverviewRoute.test.tsx
  - src/ui/components/AdvancedTimingConfigSheet.tsx
  - src/ui/components/AdvancedTimingIndicator.tsx
  - src/ui/screens/ActiveWorkoutScreen.tsx
  - src/ui/screens/OwnedPlanEditorScreen.tsx
  - tests/integration/advanced-timing.test.ts
  - tests/integration/complete-set.test.ts
  - tests/integration/cross-profile-workout.test.ts
  - tests/integration/owned-plan-crud.test.ts
  - tests/integration/plan-impact-replacement.test.ts
  - tests/integration/plan-workout-tracer.test.ts
  - tests/integration/starter-activation-repository.test.ts
  - tests/integration/today-schedule-workout.test.ts
  - tests/integration/workout-outcomes.test.ts
  - tests/sqlite-host/cleanInstallRestore.test.ts
  - tests/sqlite-host/logicalBackupRepository.test.ts
  - tests/sqlite-host/logicalRestoreRepository.test.ts
  - tests/sqlite-host/migrations-effects.test.ts
  - tests/sqlite-host/portabilityMigration.test.ts
findings:
  critical: 0
  warning: 1
  info: 0
  total: 1
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-10-01T03:35:03Z
**Depth:** standard
**Files Reviewed:** 71
**Status:** issues_found

## Summary

The Phase 10 fixes through `9f9218a` were re-reviewed at current HEAD `8c64e33`; intervening commits are Phase 12-only. All Phase 10 code-level findings are resolved without a new regression in the focused gates. The final verdict remains **issues found** only because the current manifest-bound APK and Maestro evidence still require the root workflow's final native build.

## Final Re-review

| Prior finding | Verdict | Evidence |
| --- | --- | --- |
| CR-01 timer ownership after set transition | RESOLVED | SQLite ownership is retired atomically and the mounted screen immediately projects the committed target to idle revision 0. |
| CR-02 warm-up timing | RESOLVED | Warm-ups in the active exercise are accepted targets; both modes have component and real-SQLite lifecycle/reconstruction coverage. |
| CR-03 removal FK failures | RESOLVED | Set, exercise-removal, and replacement transactions delete timing ownership before deleting/skipping rows, with real-SQLite regression coverage. |
| CR-04 historical v1 restore | RESOLVED | Non-empty schema-20 rows are validated against their producer shape and materialized with Phase 21/22 additive defaults before restore. |
| CR-05 unbounded set counts | RESOLVED | Both fields cap at the shared 100-set limit and allocation is gated before `Array.from`. |
| CR-06 row selector collisions | RESOLVED | Action, container, summary, and read-only IDs all include stable exercise/set identities across expanded exercises. |
| CR-07 restore timing invariants | RESOLVED | Preflight validation is fixed and additive migration 27 installs the ownership triggers on existing version-26 databases. |
| WR-01 cancelled sheet state | RESOLVED | Hidden-to-visible transitions reset draft and error state; reopen behavior is covered. |
| WR-02 cluster foreground reconciliation | RESOLVED | Both running variants reconcile and irrelevant contexts use `continue`; later contexts are covered. |
| WR-03 stale native evidence | PARTIAL | The source gate now fails closed, but a current APK/Maestro run remains outstanding. See WR-06 below. |

## Resolved Follow-up Critical Issues

### CR-08: Non-empty schema-20 backups still fail restore preflight

**Fix status:** FIXED (`947e25e`) - producer-schema rows are materialized with Phase 21 timing defaults and Phase 22 nullable identity defaults before candidate validation and restore; the frozen schema-20 fixture now contains a connected 10-row workout graph.

**Classification:** BLOCKER  
**File:** `src/domains/portability/restoreCommands.ts:206-223`  
**Related:** `src/domains/portability/fixtures/pre-phase10-schema20-v1.json:1`

**Issue:** The fix correctly removes `session_advanced_timing_states` from the schema-20 table list, but each non-empty row is still required to have exactly the columns returned by the current schema port. Real schema-20 rows predate `advanced_timing_default_json`, `advanced_timing_override_json`, and `advanced_timing_resolved_json`, so they fail `exactKeys(row, expectedColumns)`. The frozen regression fixture contains zero rows in every table and therefore never exercises column evolution.

**Fix:** Validate rows against a producer-schema column contract, then materialize missing additive columns with their migration defaults before insertion. Replace the empty fixture with a schema-20 archive containing plan, session exercise, warm-up, working-set, and workout rows that omit every schema-21 timing column.

### CR-09: Ownership triggers were added to an already-applied migration

**Fix status:** FIXED (`8b3a83d`, `7810041`, `5e08f60`, `032d10b`, `ec5a182`, `9f9218a`) - migration 21 is restored to its released shape, additive migration 27 installs/verifies both ownership triggers from a real version-26 database, and restore/merge explicitly accept current schema-27 archives while rejecting version 28.

**Classification:** BLOCKER  
**File:** `src/platform/sqlite/migrations/0021_advanced_set_timing.ts:133-155`  
**Related:** `src/platform/sqlite/migrationRunner.ts:214-253`, `src/platform/sqlite/migrations/index.ts:20-49`

**Issue:** The same-session ownership triggers were appended to migration 21 after that migration had already been executed by Phase 10 builds. The migration runner executes only versions greater than `PRAGMA user_version`, and the current manifest ends at version 26. Every existing database already at 21 or later skips the modified `up()` and never receives these triggers; the new tests create fresh/v20 databases and cannot detect that upgrade gap.

**Fix:** Restore migration 21 to its released shape and add a new additive migration (version 27) that creates and verifies the two triggers for existing installations. Add an upgrade test starting from a real version-26 database without the triggers and assert migration 27 installs them.

## Follow-up Warning Review

### WR-04: The screen keeps a stale timing revision after target retirement

**Fix status:** FIXED (`8290255`) - applying a committed workout view immediately projects a retired target to idle revision 0, allowing the next set to start timing without a route refresh.

**Classification:** WARNING  
**File:** `src/ui/screens/ActiveWorkoutScreen.tsx:929-943`  
**Related:** `src/ui/screens/ActiveWorkoutScreen.tsx:1396-1436`, `src/bootstrap/workoutAppRuntime.tsx:3132-3162`

**Issue:** Completion/skip deletes the persisted timing row, but `latestAdvancedTimingContext` is not projected back to idle when the new workout view is applied. The indicator falls back to the new active set while `advancedInput()` still submits the old advanced revision, so an immediate restart attempt conflicts until the asynchronous post-commit refresh reaches the route.

**Fix:** Clear/project the timing context to idle as part of the committed set transition, or return the authoritative context with the workout result. Add a component test that completes a timed set and immediately starts timing on the next set without waiting for a route remount.

### WR-05: Non-action row timing test IDs still collide

**Fix status:** FIXED (`9926421`) - container, summary, action, and read-only timing IDs all use exercise/set identity, with editable and skipped multi-exercise coverage.

**Classification:** WARNING  
**File:** `src/ui/screens/ActiveWorkoutScreen.tsx:1282-1333`

**Issue:** The action label and action test ID now include exercise/set identity, but `set-timing-${kind}-${ordinal}`, `set-timing-summary-${kind}-${ordinal}`, and `set-timing-readonly-${kind}-${ordinal}` still repeat across visible exercises. The multi-exercise regression checks only the action IDs, leaving summary and immutable-state assertions ambiguous.

**Fix:** Qualify every timing-row test ID with `exercise.id` and `set.id`, and assert uniqueness for editable and read-only rows across two expanded exercises.

### WR-06: Current native Phase 10 evidence has not been regenerated

**Classification:** WARNING  
**File:** `scripts/run-phase10-maestro.mjs:67-97`  
**Related:** `maestro/phase10/advanced-set-timing.yaml:100-109`

**Issue:** The runner and selector are corrected and now reject stale source identity, but the fix report explicitly defers the APK rebuild and Maestro execution. The current HEAD therefore has no accepted manifest-bound device result.

**Fix:** Build the Phase 10 development-test APK from the final HEAD and run the updated migrations-effects and Maestro gates, retaining evidence whose `base_head` and source digest match the reviewed checkout.

## Final Verification

- `ActiveWorkoutScreen.test.tsx`: 75/75 passed.
- `restoreCommands.test.ts`: 60/60 passed, including the populated schema-20 fixture.
- `migrations-effects.test.ts`: 188/188 passed, including the real version-26 to version-27 upgrade.
- `phase10-evidence-scripts.test.mjs`: 7/7 passed.
- TypeScript typecheck passed.
- Commits after `9f9218a` through reviewed HEAD `8c64e33` do not modify Phase 10 source or tests.
- Native APK build and Maestro execution remain pending outside this review iteration.

## Historical Findings And Fix Ledger

## Critical Issues

### CR-01: Completing or skipping a timed set strands the session timer

**Fix status:** FIXED (`0ae560e`) - workout completion and skip transactions now retire timing ownership before advancing the active set; real-SQLite tests start the next set in both timing modes.

**Classification:** BLOCKER  
**File:** `src/ui/screens/ActiveWorkoutScreen.tsx:1372-1420`  
**Related:** `src/ui/components/AdvancedTimingIndicator.tsx:229-241`, `src/platform/sqlite/repositories/advancedTimingRepository.ts:531-535`, `src/platform/sqlite/repositories/advancedTimingRepository.ts:795-797`

**Issue:** Set completion advances `activeSetId` without stopping or expiring the persisted advanced-timing state. The indicator then deliberately hides that state because its `targetSessionSetId` no longer equals the new active set. The repository rejects configuration for the new set while the old state is still running or paused, and stop commands cannot be issued because `advancedInput()` always targets the new active set. A user who completes or skips a set while cadence or cluster timing is active can no longer use advanced timing for the remainder of the session, including after process restart.

**Fix:** Retire the advanced-timing row atomically whenever its target set is completed or skipped (or explicitly require and complete a stop before the set mutation). Return the retired timing state with the committed workout view, and add integration tests that start each mode, complete/skip the target, then start timing on the next set.

### CR-02: Warm-up timing configuration is persisted but can never run

**Fix status:** FIXED (`2fcc4b7`, `c72575e`, `6bd639d`, `9ee8b65`) - active-exercise warm-ups are valid timing targets, the UI retains an explicit row target, and both modes are covered through start/reconcile/pause/stop/reconstruction.

**Classification:** BLOCKER  
**File:** `src/ui/screens/ActiveWorkoutScreen.tsx:2521-2533`  
**Related:** `src/platform/sqlite/repositories/advancedTimingRepository.ts:801-810`, `src/ui/__tests__/ActiveWorkoutScreen.test.tsx:3561-3656`

**Issue:** Plan 10-05 exposes and persists per-warm-up timing, but the only timer surface is disabled unless the active set is a working set, and warm-ups are never passed as the active timing target. The repository's configure write also hard-codes `set_kind = 'working'`. The new test verifies only that a warm-up override can be saved and summarized; it never starts cadence or a cluster gap for that warm-up. The resulting warm-up configuration is dead data and cannot emit the promised cues.

**Fix:** Define and implement an active warm-up timing target path (including repository ownership checks), or remove warm-up timing authoring and narrow the contract explicitly. Add component and integration coverage that starts, reconciles, pauses/stops, and reconstructs both modes on a warm-up.

### CR-03: Advanced-timing foreign keys make valid set and exercise removal fail

**Fix status:** FIXED (`4038baa`) - set, exercise-removal, and exercise-replacement transactions delete timing ownership before deleting or skipping target rows, with real-SQLite coverage.

**Classification:** BLOCKER  
**File:** `src/platform/sqlite/migrations/0021_advanced_set_timing.ts:93-105`  
**Related:** `src/platform/sqlite/repositories/workoutRepository.ts:1569-1585`, `src/platform/sqlite/repositories/workoutRepository.ts:1665-1681`, `src/platform/sqlite/repositories/workoutRepository.ts:2096-2104`

**Issue:** `session_advanced_timing_states.session_set_id` uses `ON DELETE RESTRICT`, while all set/exercise removal paths delete `session_sets` without first clearing or deleting the timing row. A stopped timing state still retains its target set ID, so removing that otherwise-provisional set or exercise fails with a foreign-key error. This regresses the Phase 9 remove/replace workflows after a timer has ever been used on the row.

**Fix:** In the same writer transaction, retire/delete the timing row before deleting its target set, or change the FK/state model to support `ON DELETE SET NULL` with a valid idle state. Add real-SQLite tests for remove-set, remove-exercise, and replace-exercise after starting and stopping timing.

### CR-04: Pre-Phase-10 v1 backups are advertised as supported but rejected

**Fix status:** FIXED (`fe34c87`) - the v1 table allowlist is schema-aware and a frozen schema-20 archive fixture proves compatibility without the timing table.

**Classification:** BLOCKER  
**File:** `src/domains/portability/backupContracts.ts:78-101`  
**Related:** `src/domains/portability/restoreCommands.ts:147-149`, `src/domains/portability/restoreCommands.ts:197-210`

**Issue:** Phase 10 added `session_advanced_timing_states` to the global table registry without creating a historical v1 table registry. `LOGICAL_BACKUP_V1_TABLES` is derived from today's registry, and restore requires exact table keys. Therefore a genuine schema 15-20/version-1 archive created before Phase 10 lacks the new table and is rejected, even though those schema versions remain explicitly supported. Existing tests generate legacy fixtures from the current registry and cannot detect the regression.

**Fix:** Version the table allowlist by archive schema/format. For schema versions before 21, omit `session_advanced_timing_states` from the expected source table set and let migration 21 create the empty table. Add a frozen pre-21 archive fixture rather than deriving it from the current constants.

### CR-05: Unbounded set counts can synchronously crash the plan editor

**Fix status:** FIXED (`13628cb`) - the shared domain maximum is exported to the UI, both inputs declare the limit, and allocation occurs only for valid bounded counts.

**Classification:** BLOCKER  
**File:** `src/ui/screens/OwnedPlanEditorScreen.tsx:232-239`  
**Related:** `src/ui/screens/OwnedPlanEditorScreen.tsx:1563-1603`

**Issue:** Both count handlers accept any safe integer and immediately allocate `Array.from({ length: count })`; neither field supplies the domain maximum of 100. Pasting `4294967296`, which passes `Number.isSafeInteger`, throws `RangeError: Invalid array length` directly from the input handler. Smaller but huge values can exhaust memory or freeze the app before command-layer validation runs.

**Fix:** Share the domain `SET_MAX_COUNT` (or an exported equivalent) with the UI, set `maximum={100}`, and resize only when `0 <= count <= 100` for warm-ups and `1 <= count <= 100` for working sets. Add boundary tests for 100, 101, and values above the JavaScript array-length limit.

### CR-06: Row timing controls collide across exercises

**Fix status:** FIXED (`bbe8231`) - action labels include the exercise name and action test IDs include stable exercise and set IDs, with a multi-exercise regression test.

**Classification:** BLOCKER  
**File:** `src/ui/screens/ActiveWorkoutScreen.tsx:1261-1301`  
**Related:** `src/ui/screens/ActiveWorkoutScreen.tsx:2408-2449`, `src/ui/screens/ActiveWorkoutScreen.tsx:2590-2650`

**Issue:** The new accessibility labels and test IDs use only set kind plus ordinal (`working-0`, `Warm-up W1 timing`). A session overview can render multiple expanded/current-or-future exercises at once, so every exercise repeats those identifiers. Assistive-technology users cannot distinguish which exercise will be edited, and Maestro/component selectors can activate the wrong row or fail as ambiguous. Plan 10-05's "uniquely targeted" contract is therefore not met.

**Fix:** Include the exercise identity/name and stable set ID in both the accessible label and test ID, for example `Configure Back Squat, working set 1 timing` and `set-timing-action-${exercise.id}-${set.id}`. Add a multi-exercise test that expands two exercises and edits the same ordinal in each.

### CR-07: Restored advanced-timing rows are not semantically validated

**Fix status:** FIXED (`ed9f885`, `f9a44f3`, `f247473`, `8b3a83d`) - restore preflight validates persisted state semantics and session/set ownership; migration 27 adds insert/update ownership triggers for fresh and upgraded databases; the shared decoder and preflight branches have exact coverage.

**Classification:** BLOCKER  
**File:** `src/platform/sqlite/migrations/0021_advanced_set_timing.ts:93-130`  
**Related:** `src/domains/portability/restoreCommands.ts:179-249`, `src/platform/sqlite/repositories/advancedTimingRepository.ts:117-195`

**Issue:** Restore preflight checks that `*_json` strings parse and that each foreign key exists, but it never validates the advanced timing state contract. The schema accepts arbitrary valid `progress_json` and independently valid `session_id`/`session_set_id` values, including an out-of-range cluster index, wrong progress shape, or a set owned by another session. Restore can therefore commit a snapshot that `stateFromRow` later rejects or that permanently points one session's timer at another session's set.

**Fix:** Add an explicit `session_advanced_timing_states` validator during restore preflight that parses config/progress by mode and status, checks all state invariants, and proves the target set belongs to the same workout session. Mirror the same ownership invariant in SQLite with a trigger or enforce it in every import path. Add malformed-progress and cross-session archive tests.

## Warnings

### WR-01: Exercise-scope Cancel preserves unsaved modal state

**Fix status:** FIXED (`55388ca`) - the mounted sheet resets draft and error state on each hidden-to-visible transition.

**Classification:** WARNING  
**File:** `src/ui/components/AdvancedTimingConfigSheet.tsx:150-167`  
**Related:** `src/ui/screens/OwnedPlanEditorScreen.tsx:1731-1739`, `src/ui/__tests__/AdvancedTimingConfigSheet.test.tsx:320-327`

**Issue:** The sheet initializes its draft only once. The owned-plan exercise-scope sheet remains mounted while hidden, so Cancel closes it without restoring `initialValue`; reopening shows the cancelled edits and a later Save persists them. The cancel test checks only that the callback fires, not that reopening discards changes.

**Fix:** Reset draft/error from `initialValue` when the modal transitions to visible, or conditionally mount/key the exercise sheet like the row-scoped sheets. Add an open-edit-cancel-reopen assertion.

### WR-02: Global foreground reconciliation skips cluster timers

**Fix status:** FIXED (`2d28e95`) - lifecycle reconciliation handles per-rep and cluster-gap states and skips irrelevant contexts without aborting later work.

**Classification:** WARNING  
**File:** `src/bootstrap/workoutAppRuntime.tsx:3186-3226`

**Issue:** `listActiveTimingContexts()` returns both per-rep `running` and persisted cluster-gap `running` rows, but the loop returns unless the decoded state is exactly `"running"`. A `cluster_gap_running` item is skipped and also aborts reconciliation of later contexts. Cluster recovery therefore depends on the active screen's one-second interval rather than the lifecycle reconciler and can remain stale while the route is not mounted.

**Fix:** Accept both `running` and `cluster_gap_running`, and use `continue` rather than `return` for an irrelevant context. Add a runtime foreground test with a cluster gap and a second context to prove all eligible contexts are reconciled.

### WR-03: Phase 10 native evidence is stale after Plan 10-05

**Fix status:** FIXED, NATIVE REFRESH REQUIRED (`d85b65e`) - Maestro now uses the exercise/set-qualified selector and the runner rejects manifests whose HEAD or source digest is stale. The APK was not rebuilt in this fix task by instruction.

**Classification:** WARNING  
**File:** `maestro/phase10/advanced-set-timing.yaml:100-108`  
**Related:** `scripts/phase10-evidence-scripts.test.mjs:136-143`, `scripts/run-phase10-maestro.mjs:65-80`, `src/ui/screens/ActiveWorkoutScreen.tsx:1295-1300`

**Issue:** Plan 10-05 renamed the action to row-specific labels such as `Working set 1 timing`, but the retained Maestro flow still searches for and taps `Set timing`. The source-level evidence test explicitly asserts that stale selector, so it passes despite drift. The manifest validator checks APK bytes against the manifest but does not bind the manifest to the current HEAD/source digest, allowing a pre-10-05 APK to remain accepted as Phase 10 evidence.

**Fix:** Update the flow to target the stable, exercise-qualified row ID; rebuild and rerun the Phase 10 artifact after 10-05; and make the validator compare manifest `base_head` plus source-tree digest to the reviewed source. Add a test that fails when production selectors change without updating the flow.

---

_Re-reviewed: 2026-10-01T03:35:03Z_  
_Reviewer: TraeCode (gsd-code-reviewer)_  
_Depth: standard_
