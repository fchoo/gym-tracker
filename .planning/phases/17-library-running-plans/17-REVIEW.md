---
phase: 17-library-running-plans
reviewed: 2026-10-11T00:00:00Z
depth: standard
files_reviewed: 96
files_reviewed_list:
  - app/(tabs)/__tests__/library.test.tsx
  - app/(tabs)/library.tsx
  - app/library/plan/[planId]/index.tsx
  - app/library/plan/__tests__/create-strength.test.tsx
  - app/library/plan/create-strength.tsx
  - app/library/plan/create.tsx
  - app/library/running/[planId].tsx
  - app/library/running/[planId]/edit.tsx
  - app/library/running/[planId]/session/[sessionId].tsx
  - app/library/running/[planId]/session/new.tsx
  - app/library/running/__tests__/routes.test.tsx
  - app/library/running/create.tsx
  - app/library/starter/[templateId].tsx
  - artifacts/review/phase2/exercise-library-acceptance.json
  - assets/content/exercise-library.v1.json
  - assets/content/exercise-library.v1.manifest.json
  - maestro/phase17/accessibility.yaml
  - maestro/phase17/library.yaml
  - maestro/phase17/running-authoring.yaml
  - package.json
  - scripts/check-boundaries.mjs
  - scripts/phase17-evidence-scripts.test.mjs
  - scripts/run-coverage-gate.mjs
  - scripts/run-phase17-maestro.mjs
  - scripts/verify-phase17-evidence.mjs
  - src/bootstrap/customExerciseRuntime.test.tsx
  - src/bootstrap/customExerciseRuntimeReadPort.ts
  - src/bootstrap/runningPlanRuntime.test.tsx
  - src/bootstrap/runningPlanRuntime.tsx
  - src/bootstrap/workoutAppRuntime.tsx
  - src/domains/content/catalog.test.ts
  - src/domains/content/catalog.ts
  - src/domains/portability/backupContracts.ts
  - src/domains/portability/mergePlan.test.ts
  - src/domains/portability/mergePlan.ts
  - src/domains/portability/restoreCommands.ts
  - src/domains/running/commands.ts
  - src/domains/running/contracts.test.ts
  - src/domains/running/contracts.ts
  - src/domains/running/lifecycle.ts
  - src/domains/scheduling/collisionCommands.ts
  - src/domains/shared/tooling.test.ts
  - src/platform/sqlite/migrations/0037_exercise_instruction_sets.ts
  - src/platform/sqlite/migrations/0038_running_plan_lifecycle_receipts.ts
  - src/platform/sqlite/migrations/0039_running_session_slot_membership.ts
  - src/platform/sqlite/migrations/0040_schedule_collision_outcomes.ts
  - src/platform/sqlite/migrations/index.ts
  - src/platform/sqlite/repositories/contentRepository.ts
  - src/platform/sqlite/repositories/logicalBackupRepository.ts
  - src/platform/sqlite/repositories/logicalMergeRepository.ts
  - src/platform/sqlite/repositories/logicalRestoreRepository.ts
  - src/platform/sqlite/repositories/runningPlanRepository.ts
  - src/platform/sqlite/repositories/scheduleCollisionRepository.ts
  - src/platform/sqlite/repositories/starterPlanRepository.ts
  - src/testing/contracts/phase17LibraryRunning.contract.test.ts
  - src/testing/contracts/phase17LibraryRunning.contract.ts
  - src/ui/__tests__/CustomExerciseScreens.test.tsx
  - src/ui/__tests__/LibraryScreen.test.tsx
  - src/ui/__tests__/OwnedPlanDetailScreen.test.tsx
  - src/ui/__tests__/OwnedPlanEditor.test.tsx
  - src/ui/__tests__/PlanImpactReplacement.test.tsx
  - src/ui/__tests__/PlanTypeChooserScreen.test.tsx
  - src/ui/__tests__/RunningPlanDetailScreen.test.tsx
  - src/ui/__tests__/RunningPlanEditorScreen.test.tsx
  - src/ui/__tests__/RunningSessionEditorScreen.test.tsx
  - src/ui/__tests__/ScheduleEditor.test.tsx
  - src/ui/__tests__/StarterPlans.test.tsx
  - src/ui/components/PlanEditorFields.test.tsx
  - src/ui/components/PlanEditorFields.tsx
  - src/ui/components/RunningSessionFields.test.tsx
  - src/ui/components/RunningSessionFields.tsx
  - src/ui/components/ScheduleConflictSheet.test.tsx
  - src/ui/components/ScheduleConflictSheet.tsx
  - src/ui/running/runningFormDraft.test.ts
  - src/ui/running/runningFormDraft.ts
  - src/ui/screens/ExerciseDetailScreen.tsx
  - src/ui/screens/ExerciseReplacementScreen.tsx
  - src/ui/screens/LibraryScreen.tsx
  - src/ui/screens/OwnedPlanDetailScreen.tsx
  - src/ui/screens/OwnedPlanEditorScreen.tsx
  - src/ui/screens/PlanDayRemovalScreen.tsx
  - src/ui/screens/PlanTypeChooserScreen.tsx
  - src/ui/screens/RunningPlanDetailScreen.tsx
  - src/ui/screens/RunningPlanEditorScreen.tsx
  - src/ui/screens/RunningSessionEditorScreen.tsx
  - src/ui/screens/ScheduleEditorScreen.tsx
  - src/ui/screens/StarterActivationScreen.tsx
  - src/ui/screens/StarterPlanDetailScreen.tsx
  - src/ui/screens/TemplateUpdateScreen.tsx
  - tests/integration/content-import.test.ts
  - tests/integration/custom-exercise.test.ts
  - tests/integration/multi-plan-foundation-tracer.test.ts
  - tests/integration/multi-plan-portability.test.ts
  - tests/integration/running-plan-authoring.test.ts
  - tests/integration/running-schedule-collision.test.ts
  - tests/sqlite-host/running-plans.test.ts
findings:
  critical: 7
  warning: 2
  info: 0
  total: 9
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-10-11T00:00:00Z
**Depth:** standard
**Files Reviewed:** 96
**Status:** issues_found

## Summary

The Phase 17 implementation has serious integrity and behavior defects despite passing the focused suites. Most importantly, a current-schema backup cannot be restored, collision choices never affect any schedule reader, and retired Running sessions can still be materialized and used to satisfy activation readiness. Four of the seven authored session kinds are unsaveable through the supplied form. Native/global execution was intentionally deferred and is not reported as a defect; the review does flag the runner and summary metadata where they overstate what its flows prove.

## Critical Issues

### CR-01: Current Phase 17 backups are rejected by restore

**File:** `src/domains/portability/restoreCommands.ts:149, 266-280`

**Issue:** Schema migrations now advance `user_version` to 40, and the logical backup collector writes that current value into every new version-6 snapshot. Restore accepts only schemas through 36 and specifically requires a version-6 snapshot to be schema 36. Consequently, any backup created after migrations 37–40 is rejected as `restore_archive_unsupported_version`; this makes the advertised backup/restore coverage unusable for every upgraded owner.

**Fix:** Define a new logical backup format/table set for schema 40 (or explicitly extend v6 only if its graph is identical), add 37–40 to the supported-schema list, make the version/schema pairing accept it, and add a real current-schema create → preflight → restore test.

### CR-02: Collision choices are persisted but never change what Calendar reads

**File:** `src/platform/sqlite/repositories/scheduleCollisionRepository.ts:95-121`; `src/platform/sqlite/repositories/trainingCalendarRepository.ts:56-121`

**Issue:** Confirming Move run, Move strength, or Keep both inserts an outcome and a projection only. No repository that supplies Calendar/Today reads `schedule_collision_projections`; the calendar selects `local_date` directly from the immutable strength and running opportunities. Thus a successful “Move” leaves both events displayed on their original conflicting date. The UI’s confirmation copy says the selected future occurrence changes, but the application never applies that intent.

**Fix:** Make the authoritative schedule projection query join the latest collision projection for each opportunity and project its effective/moved date (or have the schedule projection rebuild materialize a consumed override that all schedule readers use). Cover each choice with a readback assertion from the actual Calendar/Today query.

### CR-03: Retired sessions are still materialized into future Running opportunities

**File:** `src/platform/sqlite/repositories/runningPlanRepository.ts:585-602`

**Issue:** Exact-membership saves retire deleted slots with `retired_at_ms`, but `materializeOccurrences` selects all matching rows from `running_session_slots` without `retired_at_ms IS NULL`. After deleting the last session, or replacing/reordering membership, the old slot continues to generate future occurrences. This violates true-empty plans, prospective editing, and immutable-history boundaries.

**Fix:** Filter occurrence materialization to current membership and add an integration test that deletes the final slot, materializes a later matching weekday, and asserts no occurrence is created for the retired root.

### CR-04: Activation readiness counts deleted historical slots and revisions

**File:** `src/platform/sqlite/repositories/runningPlanRepository.ts:485-490`

**Issue:** `readiness` counts every recovery revision and every slot ever stored, including retired slots. Deleting the final Recovery session creates a true-empty aggregate on reopen, but readiness still reports ready because historical rows remain. A plan can therefore be activated with no current Recovery session and no current session slots.

**Fix:** Base readiness on the current membership projection (`retired_at_ms IS NULL`) and join each current slot to its current session root/revision; require a current Recovery slot/revision pair. Add a lifecycle test for delete-final-session followed by activation preview/confirm rejection.

### CR-05: Four typed Running-session routes cannot pass their own validation

**File:** `src/ui/components/RunningSessionFields.tsx:81-105`; `src/ui/screens/RunningSessionEditorScreen.tsx:133-148`

**Issue:** Validation unconditionally requires `draft.volume` at line 85. Tempo, Intervals, Hills, and Fartlek render no Volume field—their inputs are Work/Recovery (and cues for unstructured Fartlek)—so `volume` remains empty and every save is rejected before the runtime is called. This blocks four of the required seven types.

**Fix:** Require Volume only for Recovery, Long run, and Progression. Validate Work/Recovery/Cues for the other kinds as their respective branches already intend, then add one UI save test for each branch that reaches `saveSession`.

### CR-06: Adding Tempo from the plan editor builds an invalid contract payload

**File:** `src/ui/running/runningFormDraft.ts:67-88`

**Issue:** The local Tempo default uses `{ format: "continuous", durationMs: 60_000 }`, but the strict running contract requires `{ format: "continuous", work: { durationMs | distanceMeters } }`. The `as RunningSessionRevision` assertion masks the mismatch until the repository command parses it, so adding the default Tempo session in the plan editor makes Save changes fail.

**Fix:** Construct the exact `TempoContextSchema` shape, e.g. `{ format: "continuous", work: { durationMs: 60_000 } }`, without a broad assertion; test plan-editor add-and-save for Tempo.

### CR-07: Session rows render interactive fields with no callback and crash when used

**File:** `src/ui/screens/RunningPlanEditorScreen.tsx:70-78`

**Issue:** Every existing session row mounts `RunningSessionFields` with `onChange={() => undefined}`. Those fields render active day/type controls and text inputs; interacting with any control calls the no-op callback rather than updating the draft, while some inputs make the detail look editable even though it is discarded. This breaks the UI contract and can cause an interaction failure depending on the control’s event path.

**Fix:** Replace this component with a read-only session summary in the plan list, or wire `onChange` to `updateRunningSessionDraft` and validate/save the edited entry. Preserve the dedicated Edit route as the single editor if that is the intended design.

## Warnings

### WR-01: Native evidence flows only assert navigation, not the cases their IDs claim

**File:** `maestro/phase17/running-authoring.yaml:30-85`; `maestro/phase17/library.yaml:21-52`; `.planning/phases/17-library-running-plans/17-14-SUMMARY.md:22-28`

**Issue:** The runner correctly does not write evidence and native execution is deferred, but the flows are not capable of proving their named cases when later executed. For example, the zero-session case never saves/reopens a plan, typed-session and same-day cases only press D-pad once, and the seven-kind cases never choose, fill, save, or read back a type. The summary simultaneously marks LIB-01–36 as `requirements-completed`, which overstates the deferred native validation.

**Fix:** Keep the requirements pending until final evidence exists, and expand each flow to perform the state-changing action plus factual SQLite/UI readback required by its ledger assertion. The evidence producer should bind those real artifacts before a case can be marked passed.

### WR-02: Component tests pass while emitting repeated React `act(...)` warnings

**File:** `src/ui/__tests__/RunningPlanDetailScreen.test.tsx`; `src/ui/components/ScheduleConflictSheet.test.tsx`

**Issue:** The focused component command passes but logs repeated “The current testing environment is not configured to support act(...)” warnings for lifecycle/collision promises and BottomSheet focus/animation updates. These warnings mean the tests can finish before asserted async state settles, reducing confidence in the error/retry/focus behavior they claim to cover.

**Fix:** Configure the React Native test environment for concurrent `act`, await the promise-driven updates with `act`/`waitFor`, and fail the focused test command on unexpected `console.error` output once known framework warnings are eliminated.

---

_Reviewed: 2026-10-11T00:00:00Z_
_Reviewer: TRAE (gsd-code-reviewer)_
_Depth: standard_
