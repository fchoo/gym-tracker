---
phase: 15-workout-parity
plan: "07"
subsystem: workout-ui
tags: [rest, offline, notifications, accessibility, preferences]
requires:
  - phase: 15-workout-parity
    provides: authoritative rest commands and plan preference ports from Plan 15-06
provides:
  - always-expanded durable rest dock
  - flat saved-versus-draft plan preference presentation
affects: [15-08, workout-ui, lifecycle]
actuals:
  tokens: 5460
  tasks: 3
  commits: 4
tech-stack:
  added: []
  patterns: [render-only rest dock, presentation-only preference drafts]
key-files:
  created: [src/ui/components/WorkoutPlanSettingsSheet.tsx]
  modified: [src/ui/components/RestDock.tsx, src/ui/screens/ActiveWorkoutScreen.tsx]
key-decisions:
  - "Rest controls remain permanently visible and keep source mutations behind the revisioned command port."
  - "Plan settings preserve a local draft until the owning preference port acknowledges persistence."
requirements-completed: [WRK-21, WRK-22, WRK-23, WRK-26, WRK-27, WRK-28]
coverage:
  - id: D1
    description: Full-width durable rest dock with accessibility labels, cues, and no embedded Undo.
    requirement: WRK-21
    verification:
      - kind: automated_ui
        ref: npm run test:components -- --runInBand src/ui/__tests__/RestDock.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx
        status: pass
      - kind: integration
        ref: npm run test:integration -- --runInBand tests/integration/rest-lifecycle.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Lifecycle/notification reconciliation remains replayable, source-authoritative, and non-blocking on device failures.
    requirement: WRK-22
    verification:
      - kind: unit
        ref: npm run test:unit -- --runInBand src/bootstrap/workoutLifecycle.test.ts src/platform/notifications/restNotificationReconciler.test.ts src/platform/notifications/expoRestNotificationAdapter.test.ts
        status: pass
      - kind: integration
        ref: npm run test:integration -- --runInBand tests/integration/rest-lifecycle.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Flat plan settings expose authoritative rest and increment preferences without cadence or cluster controls.
    requirement: WRK-27
    verification:
      - kind: automated_ui
        ref: npm run test:components -- --runInBand src/ui/__tests__/WorkoutPlanSettingsSheet.test.tsx src/ui/__tests__/WorkoutSetEditorSheet.test.tsx
        status: pass
    human_judgment: false
duration: 7m
completed: 2026-10-10
status: complete
---

# Phase 15 Plan 07: Durable Rest Dock and Plan Settings Summary

**Always-visible, exercise-aware rest controls paired with offline-safe lifecycle reconciliation and flat plan rest/increment preference presentation.**

## Accomplishments

- Replaced the collapsed rest control with the approved full-width dock: countdown, −15, Pause/Resume, +15, and Skip remain reachable throughout rest.
- Passed the active exercise name into the next-set context while preserving the existing deadline/revision command authority and non-blocking cue/notification behavior.
- Added a Phase 14 BottomSheet-based Plan settings surface with explicit seconds, approved increment radios, saved/draft separation, device-owned cue explanation, deferred edit intent, and Workout actions entry point.
- Re-verified existing lifecycle recovery and notification reconciliation rather than duplicating their source-of-truth logic in presentation.

## Task Commits

1. Task 1 — `6c2c8c5`, `2396376` — TDD specification and durable rest dock implementation.
2. Task 2 — No source delta: existing authoritative lifecycle, notification, and integration coverage already satisfied the recovery contract; focused verification passed.
3. Task 3 — `fabd443`, `2cc56f1` — TDD specification and flat Plan settings implementation.

## Verification

- PASS: focused RestDock, Plan settings, set editor, and Active Workout component tests (21 tests).
- PASS: focused lifecycle and notification unit tests (46 tests).
- PASS: targeted session-exercise editing and rest lifecycle integration tests (26 tests).
- PASS: `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, and `git diff --check`.
- Intentionally not run: global test suite and native matrix, per owner instruction.

## Deviations from Plan

### Auto-fixed Issues

1. [Rule 1 - Bug] Rest notification-denial rendering lost its `SecondaryAction` import while the dock was simplified.
- **Found during:** Task 1 focused component verification.
- **Fix:** Restored the existing presentation-only import; timer and notification authority were unchanged.
- **Files modified:** `src/ui/components/RestDock.tsx`
- **Verification:** RestDock notification-denial test passes.
- **Committed in:** `2396376`

2. [Rule 3 - Blocking] The two GStack source-document paths named by the project rules had been renamed with a `bytedance-` prefix.
- **Found during:** Execution context loading.
- **Fix:** Read the available approved owner design and engineering-test documents from their current paths.

## Known Stubs

None.

## Self-Check: PASSED

- Confirmed task commits `6c2c8c5`, `2396376`, `fabd443`, and `2cc56f1` exist.
- Confirmed `RestDock.tsx` and `WorkoutPlanSettingsSheet.tsx` exist.

## Next Phase Readiness

The durable rest UI and flat preference presentation are ready for the remaining Workout parity plans. The Phase 14 dirty evidence and untracked verification report remain intentionally untouched.
