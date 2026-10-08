---
phase: 14-prototype-visual-shell
plan: "05"
subsystem: ui
tags: [react-native, bottom-sheet, accessibility, keyboard, modal, tdd]
requires:
  - phase: 14-04
    provides: BottomSheet shared overlay contract and confirmation semantics
provides:
  - Active Workout, calendar, duration, and workout-start consumers on one BottomSheet frame
  - Consumer-owned drafts, validation, command latches, and mutation callbacks preserved across shared-sheet dismissal
affects: [phase-14, active-workout, calendar, shared-ui, phase-15]
actuals:
  tokens: 9142
  tasks: 3
  commits: 4
tech-stack:
  added: []
  patterns:
    - BottomSheet owns modal isolation, IME-safe geometry, focus restoration, and safe cancellation.
    - Consumers own drafts, validation, busy latches, and workflow mutations.
key-files:
  created: []
  modified:
    - src/ui/screens/ActiveWorkoutScreen.tsx
    - src/ui/components/CalendarField.tsx
    - src/ui/components/TimeDurationField.tsx
    - src/ui/components/WorkoutStartSheet.tsx
    - src/ui/components/BottomSheet.tsx
    - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
    - src/ui/components/CalendarField.test.tsx
    - src/ui/components/SemanticInputFields.test.tsx
    - src/ui/__tests__/foundation.test.tsx
key-decisions:
  - "BottomSheet remains the sole owner of modal isolation, keyboard geometry, focus restoration, and safe cancellation."
  - "Consumers retain content drafts, validation, command busy latches, and mutation or confirmation authority."
  - "ConfirmationDialog remains unchanged so the d5071087 sequential-confirmation submission guard stays intact."
patterns-established:
  - "Shared frame migration: replace private overlay chrome only; retain the consumer state machine and its exact callbacks."
  - "Accessibility closure: restore both native accessibility focus and JavaScript focus after safe or caller-controlled sheet closure."
requirements-completed: [SHL-05]
coverage:
  - id: D1
    description: Active Workout pickers and actions use the shared BottomSheet without changing command ownership.
    requirement: SHL-05
    verification:
      - kind: unit
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx
        status: pass
    human_judgment: false
  - id: D2
    description: Calendar, duration, and workout-start sheets preserve draft, validation, action, dismissal, and focus-return behavior through the shared frame.
    requirement: SHL-05
    verification:
      - kind: unit
        ref: src/ui/components/CalendarField.test.tsx; src/ui/components/SemanticInputFields.test.tsx; src/ui/__tests__/foundation.test.tsx
        status: pass
      - kind: other
        ref: npm run typecheck && npm run check:boundaries
        status: pass
    human_judgment: false
duration: 9m
completed: 2026-10-08
status: complete
---

# Phase 14 Plan 05: Shared Active Workout and Field Sheet Migration Summary

**Active Workout, calendar, duration, and workout-start overlays now share the keyboard-safe BottomSheet contract while retaining consumer-owned drafts, validation, and mutation authority.**

## Performance

- **Duration:** 9m
- **Started:** 2026-10-08T18:46:00Z
- **Completed:** 2026-10-08T18:55:03Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Replaced Active Workout's private picker and action overlay frames with BottomSheet while preserving command, revision, rest, failure, and confirmation ownership.
- Moved CalendarField, TimeDurationField, and WorkoutStartSheet onto the shared keyboard-safe frame without changing their draft, validation, selected-occurrence, apply, cancel, or no-write dismissal contracts.
- Strengthened BottomSheet focus restoration for caller-controlled closes and audited the affected owners so no private Modal or KeyboardAvoidingView frame remains.

## Task Commits

Each task was committed atomically:

1. **Task 1: Edit one Active Workout picker through the shared keyboard-safe frame** - `919abba2` (feat)
2. **Task 2: Converge the CalendarField sheet** - `69719b16` (feat)
3. **Task 3: Converge duration and workout-start sheets** - `97bcc531` (feat)
4. **Owner audit and remaining Active Workout frame migration** - `2e9a48a4` (fix)

_Note: TDD RED and GREEN evidence was captured during execution; each completed task was retained as an atomic implementation commit on the shared sequential branch._

## Files Created/Modified

- `src/ui/screens/ActiveWorkoutScreen.tsx` - Routes all retained workout pickers and action sheets through BottomSheet.
- `src/ui/__tests__/ActiveWorkoutScreen.test.tsx` - Protects shared-frame picker, command, and busy-state behavior.
- `src/ui/components/CalendarField.tsx` - Uses BottomSheet while keeping LocalDate draft and explicit apply/cancel behavior.
- `src/ui/components/CalendarField.test.tsx` - Verifies shared-frame focus, IME, reachability, and calendar actions.
- `src/ui/components/TimeDurationField.tsx` - Uses BottomSheet while retaining segmented duration validation and draft semantics.
- `src/ui/components/SemanticInputFields.test.tsx` - Verifies duration-field shared-frame use.
- `src/ui/components/WorkoutStartSheet.tsx` - Uses BottomSheet while retaining scheduled-day identity and exact start/cancel callbacks.
- `src/ui/__tests__/foundation.test.tsx` - Verifies WorkoutStartSheet shared-frame behavior.
- `src/ui/components/BottomSheet.tsx` - Restores native accessibility focus after consumer-controlled closure and makes scroll orientation explicit.

## Decisions Made

- BottomSheet is the only owner of modal isolation, keyboard geometry, focus restoration, and safe cancellation across this migration.
- Feature consumers retain their own drafts, validation, busy latches, exact actions, and workflow mutations; the shared frame receives no workflow authority.
- ConfirmationDialog was deliberately not changed, preserving the `d5071087` guard that resets its submission latch when confirmation state changes.

## Verification

- `npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx src/ui/components/CalendarField.test.tsx src/ui/components/SemanticInputFields.test.tsx src/ui/__tests__/foundation.test.tsx src/ui/components/BottomSheet.test.tsx src/ui/components/ConfirmationDialog.test.tsx` — passed (6 suites, 151 tests).
- `npm run typecheck` — passed.
- `npm run check:boundaries` — passed (318 files).
- Direct owner audit confirmed no `Modal`, `KeyboardAvoidingView`, private backdrop, or private sheet frame remains in the four audited owners.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Restored accessibility focus after consumer-controlled shared-sheet closure**
- **Found during:** Task 2 (Converge the CalendarField sheet)
- **Issue:** BottomSheet restored JavaScript focus only for safe cancellation, leaving native accessibility focus without a guaranteed return after callers closed a sheet following a successful action.
- **Fix:** Restored native accessibility focus for both safe dismissal and consumer-controlled close paths; made shared scroll orientation and indicator behavior explicit.
- **Files modified:** `src/ui/components/BottomSheet.tsx`, `src/ui/components/CalendarField.test.tsx`
- **Verification:** BottomSheet and CalendarField focused suites passed.
- **Committed in:** `69719b16`

**2. [Rule 2 - Missing critical functionality] Migrated remaining private Active Workout overlay frames after owner audit**
- **Found during:** Final owner audit after Task 3
- **Issue:** The initially migrated picker left workout-action and replacement overlays with private Modal and KeyboardAvoidingView chrome, violating the shared-frame invariant required by SHL-05.
- **Fix:** Routed the remaining Active Workout overlays through BottomSheet while preserving their command latches and ConfirmationDialog ownership.
- **Files modified:** `src/ui/screens/ActiveWorkoutScreen.tsx`, `src/ui/__tests__/ActiveWorkoutScreen.test.tsx`
- **Verification:** ActiveWorkoutScreen suite and direct owner audit passed.
- **Committed in:** `2e9a48a4`

---

**Total deviations:** 2 auto-fixed (2 Rule 2).
**Impact on plan:** Both fixes were required to fulfill the plan's shared-frame and accessibility contract; neither changed domain behavior or expanded into future presentation work.

## Issues Encountered

The focused ActiveWorkoutScreen suite continues to emit pre-existing overlapping `act()` warnings, but all assertions pass. No package, authentication, external-action, or blocking checkpoint was required.

## Known Stubs

None. The modified owners contain no placeholder data path, skipped test, TODO/FIXME that blocks the plan goal, or unrun required verification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The shared overlay contract now covers the Active Workout and field/start consumers scoped to SHL-05. Phase 14 Plan 12 remains responsible for the separately scoped Library and completion-screen owners; cadence and cluster retirement remains owned by Phase 15.

## Self-Check: PASSED

Verified the summary and all six key implementation files exist, and confirmed all four implementation commits are reachable in git history.

---
*Phase: 14-prototype-visual-shell*
*Completed: 2026-10-08*
