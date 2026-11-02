---
phase: 09-in-workout-exercise-editing
plan: 05
subsystem: workout, ui, native-evidence
tags: [react-native, expo, maestro, replace-exercise, remove-exercise, immutable-history]
requires:
  - phase: 09-04
    provides: revision-checked Replace/Remove persistence and immutable history behavior
provides:
  - authoritative native overview actions for Replace and Remove
  - protected-history confirmation, retry, skipped-state, and relaunch proof
  - manifest-bound Android evidence for the complete Phase 09 edit flow
affects: [09-06, 09-07, 09-08, 09-09, 09-10]
actuals:
  tokens: 26460
  tasks: 2
  commits: 19
tech-stack:
  added: []
  patterns: [authoritative-refresh-only UI, bounded mutation request IDs, manifest-bound Maestro evidence]
key-files:
  created: []
  modified:
    - src/bootstrap/workoutAppRuntime.tsx
    - src/ui/screens/ActiveWorkoutScreen.tsx
    - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
    - maestro/phase9/in-workout-exercise-editing.yaml
    - scripts/phase9-evidence-scripts.test.mjs
key-decisions:
  - "Replace/Remove render only committed or refreshed authoritative views; command failure and post-commit reload recovery remain distinct."
  - "Protected completed history renders literal Skipped before the added-origin label and retains the completed set observation."
  - "The Android flow asserts the full rendered retained row and resumes the persisted workout after cold relaunch before proving history."
requirements-completed: [WORK-21, WORK-22, WORK-24]
coverage:
  - id: D1
    description: Native overview exposes accessible Replace/Remove actions, selection, confirmation, operation retries, and protected-history cancellation.
    requirement: WORK-21
    verification:
      - kind: unit
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#retries-a-provisional-replacement-through-the-selected-authoritative-exercise
        status: pass
      - kind: automated_ui
        ref: npm run test:maestro:phase9 -- --manifest artifacts/native/phase9/build.json
        status: pass
    human_judgment: false
  - id: D2
    description: Protected Remove retains a completed observation, displays Skipped, and survives cold relaunch after the workout is resumed.
    requirement: WORK-22
    verification:
      - kind: unit
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#keeps-protected-completed-history-after-cancellation-and-a-retried-removal
        status: pass
      - kind: automated_ui
        ref: maestro/phase9/in-workout-exercise-editing.yaml#protected-history-retry-and-relaunch
        status: pass
    human_judgment: false
  - id: D3
    description: Native workflow remains overview-only and preserves immutable completed workout facts without a dashboard, browser, or screen-owned SQL surface.
    requirement: WORK-24
    verification:
      - kind: other
        ref: npm run typecheck && npm run lint
        status: pass
    human_judgment: false
metrics:
  duration: 4h 31m
  completed: 2026-09-16
status: complete
---

# Phase 09 Plan 05: Native Replace and Remove Overview Summary

**The active workout overview now exposes safe Replace/Remove controls with exact retry and protected-history behavior, proven on a manifest-bound Android build through cold relaunch.**

## Performance

- **Duration:** 4h 31m
- **Started:** 2026-09-16T14:51:20Z
- **Completed:** 2026-09-16T19:18:42Z
- **Tasks:** 2
- **Files modified:** 10 implementation/evidence files

## Accomplishments

- Wired the persisted Replace/Remove domain ports through the trusted runtime and applied only post-commit authoritative views.
- Added per-exercise accessible action menus, a searchable single-select replacement picker, protected-removal confirmation, operation-specific retry, and duplicate-action guards to the existing native overview.
- Preserved completed history by rendering `Skipped · 1 of 1 working sets` and the actual retained set row `Completed · 0 kg × 8`; ordinary owner-added exercises continue to render `Added`.
- Extended the Android Maestro flow through injected Replace and Remove failures, retry paths, cancellation, protected-history preservation, and cold relaunch followed by an explicit resume.
- Built and installed one exact-HEAD Android artifact, then passed the named manifest-bound Maestro gate on `emulator-5554` (Android 16 / API 36 / arm64-v8a).

## Task Commits

1. **Task 1: Wire Replace and Remove runtime outcomes** - `f5c3aad` (feat)
2. **Task 2: Implement exact overview Replace and Remove states** - `9beeccc` (feat)
3. **Native recovery and evidence hardening** - `3ffc938`, `3baae9c`, `f412a7c`, `54ab891`, `9334be2`, `262f2ab`, `2fc864f`, `9a6c1e8`, `9b61483`, `2551d32`, `0def91c`, `9df3360`, `3de76ac`, `b6f220f`, `2e006ab`, `7e677ec`, `716fb82` (test/fix)

## Files Created/Modified

- `src/bootstrap/workoutAppRuntime.tsx` - Composes authoritative Replace/Remove runtime outcomes.
- `src/ui/screens/ActiveWorkoutScreen.tsx` - Hosts overview-only edit actions, picker, confirmation, recovery, and protected-history display.
- `src/ui/__tests__/ActiveWorkoutScreen.test.tsx` - Covers bounded native-shaped retry IDs and retained protected history.
- `src/bootstrap/workoutMutationTestControls.ts` - Development-test-only one-shot mutation failure controls.
- `app/workout/[sessionId].tsx` - Connects development-test adapters to runtime exercise commands.
- `app/__notification-test-controls.tsx` - Arms the native test-only failure seams through deep links.
- `maestro/phase9/in-workout-exercise-editing.yaml` - Runs the complete Add/Replace/Remove/relaunch scenario.
- `scripts/phase9-evidence-scripts.test.mjs` - Fails closed if required native evidence assertions drift.

## Native Evidence

- **Manifest:** `artifacts/native/phase9/build.json`
- **Exact HEAD:** `716fb82d3e538442f71b11c6c96ae952d75182dd`
- **Source tree SHA-256:** `91c74fb25d3cbd4660bd213db63bcd392c3c944c0165b62a23dacacc4de8183d`
- **APK SHA-256:** `c420c12b14d516d0c863ab1db2c04addaabad2444d3269e541dbf02869a27b61`
- **Installed APK:** exact retained APK hash match recorded in the manifest
- **Device:** `emulator-5554`, Android 16 / API 36, `arm64-v8a`
- **Result:** `npm run test:maestro:phase9 -- --manifest artifacts/native/phase9/build.json` passed after Add, injected Replace retry, completed-set protected Remove retry, and cold relaunch/resume.

## Decisions Made

- Kept the current workout identity, inline set completion, one AdaptiveScreen scroll owner, and RestDock as the primary hierarchy. No web, dashboard, browser, external API, or project-management surface was added.
- Derived retry request IDs from canonical SHA-256 identity so real session/exercise IDs cannot exceed the domain's 128-character limit.
- Used the stable `remove-exercise-confirm` selector rather than text shared by the protected confirmation heading and destructive action.
- Matched Android's rendered complete set row verbatim and resumed the saved workout after cold relaunch instead of assuming the app relaunches directly into its overview.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Native picker keyboard intercepted confirmation traversal**

- **Found during:** Task 2 Android Maestro execution
- **Issue:** The Android IME consumed the scroll that should reveal `Replace with Bench Press`.
- **Fix:** Dismissed the keyboard after selecting the canonical replacement and bound the sequence in the evidence source test.
- **Files modified:** `maestro/phase9/in-workout-exercise-editing.yaml`, `scripts/phase9-evidence-scripts.test.mjs`
- **Verification:** Exact-HEAD named Maestro gate passed.

**2. [Rule 1 - Bug] Native retry IDs exceeded the accepted command length**

- **Found during:** Task 2 Android Maestro execution
- **Issue:** Session/exercise-derived retry IDs reached 149 characters against a 128-character command limit.
- **Fix:** Replaced the raw composition with a canonical operation SHA-256 suffix and added native-shaped ID coverage.
- **Files modified:** `src/ui/screens/ActiveWorkoutScreen.tsx`, `src/ui/__tests__/ActiveWorkoutScreen.test.tsx`
- **Verification:** Focused component suite and exact-HEAD named Maestro gate passed.

**3. [Rule 1 - Bug] Protected-history evidence drifted from Android's actual rendered state**

- **Found during:** Task 2 Android Maestro execution
- **Issue:** The flow matched a text fragment and expected overview-on-launch, while Android renders one full completed-set row and cold relaunch returns to Today with a resumable workout.
- **Fix:** Asserted `Completed · 0 kg × 8` verbatim and resumed the persisted workout before the post-relaunch assertions.
- **Files modified:** `maestro/phase9/in-workout-exercise-editing.yaml`, `scripts/phase9-evidence-scripts.test.mjs`
- **Verification:** Source contract test, direct flow, and named manifest-bound Maestro gate all passed.

**Total deviations:** 3 Rule 1 bug fixes necessary for accurate native behavior and evidence. No persistence ownership, migration 0019, reorder receipt ledger, progression, write-back, or surface-scope expansion occurred.

## Issues Encountered

- Maestro 2.8 attempts iOS discovery even for Android runs on this host. The host-only `xcrun simctl` shim returns an empty iOS device list while the evidence continues to execute against the real Android emulator.

## Verification

- `node --test scripts/phase9-evidence-scripts.test.mjs` — passed.
- `npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx` — 56 tests passed.
- `npm run typecheck` — passed.
- `npm run lint` — boundary check passed (234 files).
- `npm run android:devtest:fresh -- --suite phase9 --serial emulator-5554` — passed and installed the manifest-bound APK.
- Direct Android Maestro flow — passed.
- `npm run test:maestro:phase9 -- --manifest artifacts/native/phase9/build.json` — passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 09-06 can implement persistent whole-exercise reorder through its separate immutable reorder receipt authority. It must preserve the completed Add/Replace/Remove receipt ledger boundary and must not modify migration `0019_session_exercise_editing.ts`.

## Self-Check: PASSED

---
*Phase: 09-in-workout-exercise-editing*
*Plan: 05*
*Completed: 2026-09-16*
