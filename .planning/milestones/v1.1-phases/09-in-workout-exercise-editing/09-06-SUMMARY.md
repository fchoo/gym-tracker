---
phase: 09-in-workout-exercise-editing
plan: 06
subsystem: workout, sqlite, ui, native-evidence
tags: [sqlite, react-native, maestro, exercise-reorder, display-ordinal, immutable-history]
requires:
  - phase: 09-05
    provides: authoritative Add/Replace/Remove overview actions and manifest-bound Android evidence harness
provides:
  - exact-membership whole-exercise reorder command with canonical replay protection
  - independent reorder receipt authority and durable display-order traversal
  - drag-first and accessible fallback reorder controls with manifest-bound Android relaunch proof
affects: [09-07, 09-08, 09-09, 09-10]
actuals:
  tokens: 34000
  tasks: 3
  commits: 15
tech-stack:
  added: []
  patterns: [separate immutable receipt authority, authoritative-refresh-only reorder UI, manifest-pinned Maestro device execution]
key-files:
  created: []
  modified:
    - src/domains/workout/activeWorkout.ts
    - src/domains/workout/sessionExerciseCommands.ts
    - src/platform/sqlite/repositories/workoutRepository.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - app/workout/[sessionId].tsx
    - src/ui/screens/ActiveWorkoutScreen.tsx
    - scripts/run-phase9-maestro.mjs
    - maestro/phase9/in-workout-exercise-editing.yaml
key-decisions:
  - "Reorder is a separate operation and receipt authority: workout_session_exercise_reorder_receipts is the only replay ledger for reorder; the v20 edit ledger stays limited to Add, Replace, and Remove."
  - "Reorder changes only display_ordinal and session command metadata; immutable ordinal, copied snapshots, lineage, completed facts, and undo state remain untouched."
  - "Native reorder feedback is rendered adjacent to the moved exercise, and protected skipped history carries its retained completed observation in the accessible card label."
  - "The Phase 9 Maestro runner must read the manifest device serial and pass it as --udid so named evidence cannot stall at device selection."
requirements-completed: [WORK-23, WORK-24]
coverage:
  - id: D1
    description: Exact ordered membership and revision validation reject malformed, stale, no-op, skipped-only, and cross-session reorder requests.
    requirement: WORK-23
    verification:
      - kind: unit
        ref: src/domains/workout/sessionExerciseCommands.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/session-exercise-editing.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Reorder updates only display order through its independent receipt table, preserves immutable history, and drives active traversal in the persisted order.
    requirement: WORK-23
    verification:
      - kind: integration
        ref: tests/integration/session-exercise-editing.test.ts
        status: pass
      - kind: other
        ref: npm run test:coverage -- --runInBand
        status: pass
    human_judgment: false
  - id: D3
    description: Native drag/fallback reorder, visible feedback, protected completed-history retention, and cold-relaunch persistence work through the manifest-pinned Phase 9 flow.
    requirement: WORK-24
    verification:
      - kind: automated_ui
        ref: npm run test:maestro:phase9 -- --manifest artifacts/native/phase9/build.json
        status: pass
      - kind: unit
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx
        status: pass
    human_judgment: false
metrics:
  duration: multi-session
  completed: 2026-09-16
status: complete
---

# Phase 09 Plan 06: Persistent Whole-Exercise Reorder Summary

**Whole-exercise reorder now persists through its own immutable receipt authority, changes only presentation order, and is proven across Android cold relaunch alongside protected completed-history retention.**

## Performance

- **Duration:** Multi-session execution and native evidence hardening
- **Completed:** 2026-09-16
- **Tasks:** 3
- **Files modified:** 14 implementation, route, test, and evidence files

## Accomplishments

- Added the `reorderExercises` command contract with exact ordered membership, expected exercise revisions, canonical request hashing, and replay validation.
- Persisted reorder through `workout_session_exercise_reorder_receipts`, updating only `session_exercises.display_ordinal` plus allowed session metadata. The Add/Replace/Remove edit receipt ledger is unchanged.
- Switched active-workout loading and next-working-set traversal to `display_ordinal, id` while retaining immutable creation `ordinal` for history.
- Added drag-first reorder controls plus accessible `Move <exercise> up/down` fallbacks, endpoint/in-flight protection, durable visible position feedback, and no local optimistic ordering.
- Hardened the Phase 9 native gate to select the manifest device explicitly, retry the startup action only when it makes no change, verify Back Squat at position 2 after relaunch, and prove the retained skipped history fact on the completed Overhead Press.

## Task Commits

1. **Task 1: Define exact-membership reorder behavior** - `a22e250` (feat)
2. **Task 2: Persist display order with reorder-only receipts** - `27900c7` (feat)
3. **Task 3: Add drag-first reorder and accessible fallback** - `667ab47` (feat)
4. **Native feedback, route lifecycle, evidence, and runner hardening** - `463d793`, `5129bbb`, `40cda09`, `06c9d72`, `955833e`, `2fb7849`, `524d259`, `22fbdc7`, `ec946f8`, `3a13602`, `64b388e` (fix/test)

## Files Created/Modified

- `src/domains/workout/activeWorkout.ts` and `src/domains/workout/sessionExerciseCommands.ts` - Define and validate the reorder command capability.
- `src/platform/sqlite/repositories/workoutRepository.ts` - Writes reorder-only immutable receipts and authoritative display order.
- `src/bootstrap/workoutAppRuntime.tsx` and `app/workout/[sessionId].tsx` - Refresh the authoritative session safely without unmounting local committed feedback.
- `src/ui/screens/ActiveWorkoutScreen.tsx` - Provides the native drag/fallback reorder flow and accessible retained-history status.
- `src/ui/__tests__/ActiveWorkoutScreen.test.tsx`, `src/ui/__tests__/WorkoutPlanOverviewRoute.test.tsx`, and `tests/integration/session-exercise-editing.test.ts` - Protect command, persistence, route-lifecycle, accessibility, and immutable-history behavior.
- `maestro/phase9/in-workout-exercise-editing.yaml`, `scripts/run-phase9-maestro.mjs`, and `scripts/phase9-evidence-scripts.test.mjs` - Enforce the complete manifest-bound Android proof.

## Native Evidence

- **Manifest:** `artifacts/native/phase9/build.json`
- **Exact implementation HEAD:** `64b388ebd4ca4a6e45a8ecc72840297f8391646e`
- **Retained APK SHA-256:** `338e729061eeadf0f28076b4f058eb963cc821c93bea88ff1f3f961421ea4ab0`
- **Device:** `emulator-5554`, Android 16 / API 36, `arm64-v8a`
- **Binding:** Manifest records that installed APK SHA matches the retained APK.
- **Result:** `npm run test:maestro:phase9 -- --manifest artifacts/native/phase9/build.json` passed after Add, fallback reorder, visible `Back Squat moved to 2 of 2`, cold-relaunch position persistence, injected Replace/Remove retries, protected history, and final cold relaunch.

## Decisions Made

- Reorder never writes the v20 edit receipt table. Its exact ordered IDs and expected revisions bind a separate replay receipt.
- `display_ordinal` is the sole mutable presentation order. Creation ordinal, snapshots, lineage, metrics, targets, completed facts, and undo data remain immutable.
- The native flow shows a textual ordinal in reorder mode and puts committed success feedback beside the moved exercise, avoiding hidden or offscreen-only confirmation.
- A skipped exercise with protected completed sets explicitly includes its retained completed observation in the card’s visible and accessible status text.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Authoritative refresh unmounted committed reorder feedback**

- **Found during:** Task 3 Android proof
- **Issue:** A runtime refresh generation cleared the same-session route view and removed the local success message before native assertion.
- **Fix:** Retain a loaded view for same-session refreshes; clear only when the route session changes.
- **Files modified:** `app/workout/[sessionId].tsx`, `src/ui/__tests__/WorkoutPlanOverviewRoute.test.tsx`
- **Verification:** Route regression and focused component suite passed.
- **Committed in:** `5129bbb`

**2. [Rule 1 - Bug] Reorder feedback and order proof depended on unstable scroll position**

- **Found during:** Task 3 Android proof
- **Issue:** A global message could be offscreen, and dynamic card-ID relative order checks failed after legitimate active-set scroll anchoring.
- **Fix:** Anchor feedback and visible `Position n of total` text to the moved exercise.
- **Files modified:** `src/ui/screens/ActiveWorkoutScreen.tsx`, component tests, Phase 9 Maestro flow, evidence contract
- **Verification:** Exact-head named native gate passed.
- **Committed in:** `40cda09`, `06c9d72`

**3. [Rule 1 - Bug] Reorder changed which protected exercise remained active**

- **Found during:** Task 3 Android proof
- **Issue:** Display-order traversal correctly selected Overhead Press first, while the old test attempted protected removal on the replacement exercise.
- **Fix:** Prove protected removal on Overhead Press and surface its retained completed observation directly in the skipped card.
- **Files modified:** `src/ui/screens/ActiveWorkoutScreen.tsx`, component tests, Phase 9 Maestro flow, evidence contract
- **Verification:** Manifest-bound named native gate passed.
- **Committed in:** `2fb7849`, `22fbdc7`, `64b388e`

**4. [Rule 1 - Bug] Named Maestro runner could wait at device selection**

- **Found during:** Task 3 native-gate execution
- **Issue:** The runner read the manifest but did not forward its emulator serial to Maestro.
- **Fix:** Require `build.device.serial` and pass it as `--udid`; the start action also retries only when it produced no navigation change.
- **Files modified:** `scripts/run-phase9-maestro.mjs`, native flow, evidence contract
- **Verification:** Named manifest-bound gate passed on `emulator-5554`.
- **Committed in:** `ec946f8`, `3a13602`

**Total deviations:** 4 Rule 1 bug fixes needed for authoritative native evidence and truthful feedback. No migration `0019`, edit-receipt scope, immutable history, web/dashboard, browser, external API, progression, or write-back behavior was expanded.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 09-07 can now consume the durable `modified_from_plan` signal and immutable display/lineage facts to gate progression and consume exactly one scheduled opportunity.

---
*Phase: 09-in-workout-exercise-editing*
*Plan: 06*
*Completed: 2026-09-16*
