---
phase: 15-workout-parity
plan: "05"
subsystem: workout-ui
tags: [react-native, workout, sqlite, idempotency, warmups, offline]
requires:
  - phase: 15-workout-parity
    provides: explicit-save set editor and screen-owned revision-fenced completion
provides:
  - compact commit-gated Add Exercise and Complete Set dock
  - exercise-scoped Add Set menu with separate warm-up and working commands
  - committed-only final exercise collapse and Finish workout transition
affects: [15-07-workout-ui, 16-calendar-parity, workout-recovery]
actuals:
  tokens: 4835
  tasks: 3
  commits: 4
tech-stack:
  added: []
  patterns: [render-only action dock, screen-owned command envelopes, committed-source disclosure]
key-files:
  created: [src/ui/components/WorkoutActionDock.tsx]
  modified: [src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/__tests__/WorkoutActionDock.test.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx]
key-decisions:
  - "The dock is render-only; ActiveWorkoutScreen retains revision, idempotency, retry, and post-commit authority."
  - "Add Set targets the invoking exercise and exposes only the approved warm-up and working choices."
  - "A final completed exercise collapses only after its committed source view makes activeSetId null."
patterns-established:
  - "Completion feedback and disclosure consume CompleteSetResult.view and run no optimistic success transition."
  - "Warm-up and working mutations remain distinct command paths and ordinal domains."
requirements-completed: [WRK-16, WRK-17, WRK-18, WRK-19, WRK-20]
coverage:
  - id: D1
    description: Compact Add Exercise and commit-gated Complete Set dock suppresses duplicate activation and preserves retry identity.
    requirement: WRK-18
    verification:
      - kind: unit
        ref: src/ui/__tests__/WorkoutActionDock.test.tsx#keeps-add-exercise-and-the-authoritative-current-completion-in-one-compact-dock
        status: pass
      - kind: integration
        ref: tests/integration/complete-set.test.ts#keeps-completion-and-every-post-commit-probe-pending-until-commit-resolves
        status: pass
    human_judgment: false
  - id: D2
    description: The invoking exercise owns a two-option Add Set menu while warm-up and working data retain independent order, progress, and rest semantics.
    requirement: WRK-16
    verification:
      - kind: unit
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#scopes-the-two-option-add-set-menu-to-its-invoking-exercise
        status: pass
      - kind: integration
        ref: tests/integration/cross-profile-workout.test.ts#authoritative-cross-profile-workout-adapters
        status: pass
    human_judgment: false
  - id: D3
    description: Failed set commands retain the current row and stable retry envelope; committed final rows alone collapse and expose Finish workout.
    requirement: WRK-20
    verification:
      - kind: unit
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#collapses-the-final-exercise-and-reveals-finish-workout-only-after-its-committed-source-view
        status: pass
      - kind: integration
        ref: tests/integration/complete-set.test.ts#does-not-acknowledge-advance-rest-effect-or-haptic-when-commit-fails
        status: pass
    human_judgment: false
duration: 6min
completed: 2026-10-10
status: complete
---

# Phase 15 Plan 05: Commit-Gated Workout Action Dock Summary

**A compact, screen-owned workout dock now pairs Add Exercise with the authoritative Complete Set action, while scoped warm-up/working additions and final disclosure transitions remain source-committed.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-10T13:15:00Z
- **Completed:** 2026-10-10T13:21:07Z
- **Tasks:** 3/3 complete
- **Files modified:** 4

## Accomplishments

- Added the render-only `WorkoutActionDock`; the Active controller keeps its draft queue, expected revisions, metric identity, idempotency key, busy latch, and committed-result effect gate.
- Replaced independent header additions with an exercise-scoped Add Set sheet that contains only Add warm-up set and Add working set, preserving W1/W2 before working 01/02 through existing separate commands.
- Kept failed completion values in place with one exact retry envelope, and collapsed a final exercise only after its committed source view replaces the dock with Finish workout.

## Task Commits

1. **Task 1: Complete one working set through the compact dock after commit** — `f9b910e` (test), `7efc6bd` (feat)
2. **Task 2: Add and complete warm-up/working rows in their independent ordinal domains** — `aa61514` (feat)
3. **Task 3: Preserve draft/focus on failure and advance only after final commit** — `146225c` (feat)

## Files Created/Modified

- `src/ui/components/WorkoutActionDock.tsx` — Compact render-only action row with ready, saving, and retry presentation.
- `src/ui/screens/ActiveWorkoutScreen.tsx` — Screen-owned command orchestration, scoped add-set sheet, duplicate completion latch, and committed final collapse.
- `src/ui/__tests__/WorkoutActionDock.test.tsx` — Dock intent coverage.
- `src/ui/__tests__/ActiveWorkoutScreen.test.tsx` — Scoped additions, held/retry completion, and committed-final disclosure coverage.

## Decisions Made

- The dock receives intent callbacks only; it never constructs a persistence request or interprets a transaction result.
- Retry invokes the existing `CompleteSetInput` envelope again, preventing a fresh idempotency identity from being synthesized after a failure.
- A no-next-set committed view collapses its completed exercise and presents Finish workout; failed, rolled-back, and replayed outcomes do not synthesize that transition.

## Verification

- `npm run test:components -- --runInBand src/ui/__tests__/WorkoutActionDock.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx` — passed (8 tests).
- `npm run test:unit -- --runInBand src/domains/workout/setCommands.test.ts` — passed (48 tests).
- `npm run test:integration -- --runInBand tests/integration/complete-set.test.ts tests/integration/cross-profile-workout.test.ts` — passed (26 tests).
- `npm run typecheck` — passed.
- `npm run lint` and `npm run check:boundaries` — passed (336 files).
- `git diff --check` — passed.
- Intentionally not run: global full suite and native matrix, per owner instruction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected the new warm-up fixture to retain metric identity**
- **Found during:** Task 3 targeted typecheck.
- **Issue:** The new UI test modeled a warm-up with a null metric identity, which violates the authoritative set shape.
- **Fix:** Kept the fixture's inherited load-and-reps metric identity.
- **Files modified:** `src/ui/__tests__/ActiveWorkoutScreen.test.tsx`
- **Verification:** Typecheck and all focused component, unit, and integration checks passed.
- **Committed in:** `146225c`

**Total deviations:** 1 auto-fixed (Rule 1).

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 15-07 can consume a commit-gated, offline-safe gym-floor action boundary with no current-set stripe and no retired timing controls reintroduced.

## Self-Check: PASSED

- Confirmed the dock, Active screen, and both component test files exist.
- Confirmed task commits `f9b910e`, `7efc6bd`, `aa61514`, and `146225c` exist in git history.

---
*Phase: 15-workout-parity*
*Completed: 2026-10-10*
