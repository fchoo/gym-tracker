---
phase: 07-post-candidate-ux-refinement
reviewed: 2026-09-06T16:16:35Z
depth: standard
files_reviewed: 68
files_reviewed_list:
  - .github/workflows/release-candidate.yml
  - app/(tabs)/__tests__/index.test.tsx
  - app/(tabs)/index.tsx
  - app/__tests__/phase2-attended-preview.test.tsx
  - app/more/__tests__/index.test.tsx
  - app/more/index.tsx
  - app/workout/[sessionId].tsx
  - assets/audio/rest-cue-long.wav
  - assets/audio/rest-cue-short.wav
  - assets/images/android-icon-background.png
  - assets/images/android-icon-foreground.png
  - assets/images/android-icon-monochrome.png
  - assets/images/icon.png
  - assets/images/splash-icon.png
  - maestro/phase7/icon-navigation-accessibility.yaml
  - maestro/phase7/plan-schedule-reorder.yaml
  - maestro/phase7/today-settings.yaml
  - maestro/phase7/workout-removal-audio.yaml
  - package.json
  - scripts/concept-g-image-contract.test.mjs
  - scripts/generate-concept-g-icons.mjs
  - scripts/generate-phase7-attended-checklist.mjs
  - scripts/phase7-evidence-scripts.test.mjs
  - scripts/release-candidate-contract.test.mjs
  - scripts/run-phase7-maestro.mjs
  - src/bootstrap/restCountdownCue.ts
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/bootstrap/workoutAppRuntime.tsx
  - src/domains/portability/restoreCommands.test.ts
  - src/domains/portability/restoreCommands.ts
  - src/domains/rest/index.ts
  - src/domains/rest/restCountdownCuePort.ts
  - src/domains/workout/activeWorkout.ts
  - src/domains/workout/index.ts
  - src/domains/workout/setCommands.test.ts
  - src/domains/workout/setCommands.ts
  - src/platform/audio/expoRestCountdownCueAdapter.test.ts
  - src/platform/audio/expoRestCountdownCueAdapter.ts
  - src/platform/sqlite/migrations/0017_workout_remove_receipts.ts
  - src/platform/sqlite/migrations/index.ts
  - src/platform/sqlite/repositories/workoutRepository.ts
  - src/testing/phase2AttendedPreviewFixtures.ts
  - src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - src/ui/__tests__/OwnedPlanEditor.test.tsx
  - src/ui/__tests__/PlanEditorFields.test.tsx
  - src/ui/__tests__/ScheduleEditor.test.tsx
  - src/ui/__tests__/SetRow.test.tsx
  - src/ui/__tests__/SettingsScreen.test.tsx
  - src/ui/__tests__/StarterPlans.test.tsx
  - src/ui/__tests__/TodayScreen.test.tsx
  - src/ui/__tests__/foundation.test.tsx
  - src/ui/components/PlanDaySwitcher.tsx
  - src/ui/components/PlanEditorFields.tsx
  - src/ui/components/RestDock.tsx
  - src/ui/components/ScheduleBindingEditor.tsx
  - src/ui/components/SetRow.tsx
  - src/ui/components/index.ts
  - src/ui/screens/ActiveWorkoutScreen.tsx
  - src/ui/screens/OwnedPlanEditorScreen.tsx
  - src/ui/screens/SettingsScreen.tsx
  - src/ui/screens/StarterActivationScreen.tsx
  - src/ui/screens/TodayScreen.tsx
  - tests/integration/complete-set.test.ts
  - tests/integration/workout-outcomes.test.ts
  - tests/sqlite-host/cleanInstallRestore.test.ts
  - tests/sqlite-host/migrations-effects.test.ts
  - tests/sqlite-host/portabilityMigration.test.ts
findings:
  critical: 3
  warning: 7
  info: 0
  total: 10
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-09-06T16:16:35Z
**Depth:** standard
**Files Reviewed:** 68
**Status:** issues_found

## Summary

Reviewed the complete Phase 7 source diff against `9cdecb86dedeb9edd7bf5bc4d1c85d08bdc81660`, including SQLite mutation/replay behavior, runtime-to-notification propagation, audio and accessibility paths, evidence tooling, release gates, and changed tests. The focused suites, typecheck, and Node evidence tests passed, but they omit several contract-critical states. Three defects can leave native state inconsistent, weaken migration integrity, or make valid incomplete sets impossible to remove.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01 [BLOCKER]: Removing a rest-owned set leaves its native notification scheduled

**File:** `src/platform/sqlite/repositories/workoutRepository.ts:1131-1136` and `src/bootstrap/workoutAppRuntime.tsx:3319-3358`

**Issue:** When the deleted set is `session_rest_states.next_set_id`, the repository changes the authoritative rest row to `idle`, but it neither writes the `reconcile_rest_notification` effect nor triggers the post-commit lifecycle. The reconciliation code is the only path that lists and cancels the already-scheduled `rest:<sessionId>` native notification (`src/platform/notifications/restNotificationReconciler.ts:134-140`). The corresponding completion and undo flows enqueue this effect, but removal does not. A user can therefore remove the next set during an active rest and later receive a stale native rest alert for a set that no longer exists.

**Fix:** Capture the revision returned by `setIdleRest` and call `enqueueRestReconciliation` in the same write transaction, with a unique removal idempotency key. After a committed removal, call `reconcileAfterCommit(services)` (or await `lifecycle.trigger("post_commit")`) before treating the UI as refreshed. Add an integration regression that schedules `rest:<sessionId>`, removes its owning set, drains effects, and proves the native request is cancelled.

### CR-02 [BLOCKER]: Migration verification accepts replacement immutable triggers with arbitrary bodies

**File:** `src/platform/sqlite/migrations/0017_workout_remove_receipts.ts:101-124`

**Issue:** The migration checks the receipt table SQL exactly, but validates triggers only by their names. A database with `workout_remove_receipts_immutable_update` or `_delete` replaced by a no-op/permissive trigger passes `verify`, allowing historical removal receipts to be edited or deleted. That breaks the idempotency and replay-conflict guarantee that the new table is meant to enforce.

**Fix:** Associate each expected trigger name with its normalized expected `CREATE TRIGGER` SQL from `WORKOUT_REMOVE_RECEIPT_SCHEMA_STATEMENTS`, then compare every trigger object's normalized `sqlite_master.sql`. Add a migration-effects test that replaces one trigger with a same-named no-op trigger and asserts `verify` rejects the database.

### CR-03 [BLOCKER]: The workout UI prevents removal of contract-eligible incomplete sets

**File:** `src/ui/components/SetRow.tsx:1007` and `src/ui/components/SetRow.tsx:1139-1145`

**Issue:** The repository accepts non-completed `planned`, `draft`, and `skipped` rows (`src/platform/sqlite/repositories/workoutRepository.ts:1048-1055`) and the screen permits every non-completed candidate (`src/ui/screens/ActiveWorkoutScreen.tsx:665-677`). The component nevertheless renders no controls for `skipped` rows and disables Remove for every inactive working row. This makes valid rows unrecoverable through the sole Phase 7 removal UI, despite their transaction being explicitly supported.

**Fix:** Render the labelled Remove control for skipped rows, and remove the inactive-working-set predicate from Remove while preserving it for Done/Reset where those actions require the active set. Add tests for skipped warmup/working removal and a planned inactive working row.

## Warnings

### WR-01 [WARNING]: The generated remove request ID exceeds the command's own maximum for legal restored IDs

**File:** `src/ui/screens/ActiveWorkoutScreen.tsx:699`

**Issue:** The UI constructs `remove_${sessionId}_${currentSet.id}_${revision}_${timestamp}`, but `validateRemoveInput` rejects request, session, and set IDs above 128 Unicode code points (`src/domains/workout/setCommands.ts:27-51`). The SQLite schema does not impose that bound on `workout_sessions.id` or `session_sets.id` (`src/platform/sqlite/migrations/0001_initial.ts:136-164` and `183-217`), and restore validation accepts any non-empty text primary key (`src/domains/portability/restoreCommands.ts:202-219`). A valid restored long ID therefore produces a request ID that fails before reaching the repository, leaving the user unable to remove the row.

**Fix:** Generate a bounded request ID, for example `remove:${sha256(sessionId + "\0" + setId + "\0" + revision + "\0" + timestamp)}`, or raise/align the shared identifier contract across storage, restore, and commands. Add a test using a restored valid long session/set ID.

### WR-02 [WARNING]: Owned-plan save failure does not provide the required recovery wording

**File:** `src/ui/screens/OwnedPlanEditorScreen.tsx:1146-1152`

**Issue:** The recovery alert displays `Plan could not be saved. Your edits are still here. Try again.` with a `Retry` action. The Phase 7 contract requires the heading `Plan changes could not be saved`, the body `Your draft is still here. Your existing plan was not changed.`, and action `Retry saving plan changes`. The current text omits the assurance that the existing plan was unchanged and makes the action ambiguous.

**Fix:** Use the exact heading, body, and action labels from the UI contract; add a focused test that asserts them and verifies the action retries persistence without discarding the draft.

### WR-03 [WARNING]: Custom reorder key handling disables the shared Enter/Space activation fallback

**File:** `src/ui/components/PlanEditorFields.tsx:375-390`

**Issue:** Reorder handles supply a custom `onKeyDown` that only responds to Shift+Arrow. `FocusablePressable` only installs its Enter/Space activation handler when no custom `onKeyDown` is supplied (`src/ui/components/index.ts:225-232`). Thus keyboard users cannot activate the handle with Enter or Space, contrary to the common focusable-control contract.

**Fix:** Merge `keyboardActivationProps` into the custom handler, or handle Enter and Space explicitly and invoke the reorder action. Retain Shift+Arrow behavior and add tests for both keys.

### WR-04 [WARNING]: Weekday and rotation reordering has no shared drag preview, so neighboring rows do not displace

**File:** `src/ui/components/ScheduleBindingEditor.tsx:155-164`, `src/ui/components/ScheduleBindingEditor.tsx:244-253`, and `src/ui/screens/StarterActivationScreen.tsx:278-286`

**Issue:** `PlanEditorReorderableRow` needs a list-level `preview` and `onDragPreview` to calculate a sibling's translation (`src/ui/components/PlanEditorFields.tsx:216-228`). These schedule lists do not hoist or pass either value. During drag, only the held row has local state, so the remaining rows never move out of the way even though owned-plan-day reorder correctly shares preview state.

**Fix:** Keep a preview state per weekday/rotation list in the parent, pass `preview` and `onDragPreview` to every row, and clear it after commit/cancel. Add a visual-state component test proving the neighboring row is displaced while a row is dragged.

### WR-05 [WARNING]: Phase 7 release evidence cites checks that do not exist and does not run the actual icon contract

**File:** `scripts/run-phase7-maestro.mjs:111-135`, `scripts/phase7-evidence-scripts.test.mjs:55-61`, and `.github/workflows/release-candidate.yml:68-88`

**Issue:** The evidence matrix records nonexistent paths as automated proof, including `src/platform/sqlite/repositories/workoutRepository.test.ts`, `src/platform/notifications/restCountdownAudioPort.test.ts`, and `scripts/phase7-icon-assets.test.mjs` (as well as several incorrectly located component tests). Its passing self-test only asserts that `automated_checks` is non-empty; it never checks that those paths exist. Candidate CI likewise runs `phase7-evidence-scripts.test.mjs` but never executes the actual `scripts/concept-g-image-contract.test.mjs`. The emitted evidence can therefore claim source checks that neither exist nor gate the candidate.

**Fix:** Replace every metadata entry with the real test path, make the evidence test assert that every declared automated-check path exists, and add a named Phase 7/icon evidence script which invokes `concept-g-image-contract.test.mjs`. Run that script in the candidate source gate before build/evidence materialization.

### WR-06 [WARNING]: No test exercises the newly added countdown-cue behavior

**File:** `src/ui/__tests__/RestDock.test.tsx:62-260`

**Issue:** `RestDock` implements the Phase 7 cue ledger, AppState gating, exact 3/2/1/0 crossings, and playback-failure notice at `src/ui/components/RestDock.tsx:263-293`. The changed test file contains only pre-existing rest controls and expiration coverage; it has no cue port, rest sound preference, AppState, ledger reset, duplicate/backfill, or rejected-playback assertion. The required audio behavior can regress entirely without a suite failure.

**Fix:** Add deterministic fake-clock/AppState tests for short 3/2/1 and long zero calls, no duplicate or threshold backfill, suppression while disabled/paused/backgrounded, reset for a new rest revision, and a rejected playback call that shows the bounded notice without changing rest state or controls.

### WR-07 [WARNING]: The attended Maestro flows never execute the claimed remove and reorder actions

**File:** `maestro/phase7/workout-removal-audio.yaml:1-52` and `maestro/phase7/plan-schedule-reorder.yaml:1-49`

**Issue:** The workout flow opens a removal confirmation and taps Cancel; it never commits removal, checks the trusted refreshed state, or crosses a countdown threshold. The plan flow opens the reorder surface but never drags or invokes an accessibility reorder. Yet the Phase 7 evidence runner records both flows as coverage for authoritative removal, audio, and reorder considerations (`scripts/run-phase7-maestro.mjs:118-135`). This turns screenshots of an untouched screen into evidence for destructive and accessibility interactions.

**Fix:** Extend the fixtures/flows with safe deterministic data that can confirm removal, assert the committed row disappearance and notification reconciliation, drive 3/2/1/0 audio through an observable test seam, and perform both drag and accessibility reorder before asserting new order. Keep the flows observation-only outside their controlled fixture data.

---

_Reviewed: 2026-09-06T16:16:35Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
