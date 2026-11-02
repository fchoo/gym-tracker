---
phase: 15-workout-parity
plan: "08"
subsystem: workout-ui
tags: [active-workout, exercise-picker, receipts, reorder, undo, offline]
requires:
  - phase: 15-workout-parity
    provides: explicit-save editor, action/rest docks, and revisioned workout command ports from Plans 15-01 through 15-07
provides:
  - searchable, sheet-based exercise add and replacement flows with explicit loading, empty, failure, and retry states
  - named two-step exercise deletion that preserves completed facts as Skipped
  - receipt-stable retry behavior for replace/reorder and Workout-only 8dp drag activation
  - bounded contextual Undo for completed sets outside the persistent docks
affects: [15-09, workout-ui, active-workout, session-history]
actuals:
  tokens: 9206
  tasks: 3
  commits: 6
tech-stack:
  added: []
  patterns: [authoritative-view-after-command, receipt-stable-retry, bounded-toast-action, operation-specific-picker-state]
key-files:
  created: []
  modified: [app/workout/[sessionId].tsx, src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/components/PlanEditorFields.tsx, src/ui/components/WorkoutActionDock.tsx, src/ui/components/SemanticToast.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, src/ui/components/SemanticToast.test.tsx]
key-decisions:
  - "Picker loading and library-read failures remain distinct from an empty exercise catalog, and neither can mutate a workout."
  - "Exercise edit and reorder retries replay the original revision/hash/receipt envelope rather than generating a time-dependent mutation."
  - "Undo is a bounded SemanticToast action using the existing durable runtime command, never a permanent dock control."
requirements-completed: [WRK-17, WRK-25, WRK-29, WRK-30, WRK-31, WRK-32, WRK-33]
coverage:
  - id: D1
    description: Searchable add/replace picker preserves explicit confirmation and no-mutation loading, empty, failure, and retry states.
    requirement: WRK-17
    verification:
      - kind: automated_ui
        ref: npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx app/__tests__/workout-route.test.tsx
        status: pass
      - kind: unit
        ref: npm run test:unit -- --runInBand src/domains/workout/sessionExerciseCommands.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Delete, replace, and reorder preserve protected history, exact receipts, current identity, rollback, and relaunch behavior.
    requirement: WRK-29
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#requires explicit named delete confirmation and retains protected history truthfully
        status: pass
      - kind: integration
        ref: npm run test:integration -- --runInBand tests/integration/session-exercise-editing.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Completed-set Undo is a dock-safe eight-second contextual toast action that restores the authoritative workout view.
    requirement: WRK-33
    verification:
      - kind: automated_ui
        ref: npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx src/ui/components/SemanticToast.test.tsx
        status: pass
      - kind: integration
        ref: npm run test:integration -- --runInBand tests/integration/complete-set.test.ts tests/integration/session-exercise-editing.test.ts
        status: pass
    human_judgment: false
duration: 12m
completed: 2026-10-10
status: complete
---

# Phase 15 Plan 08: Active Workout Exercise Editing and Undo Summary

**Source-authoritative exercise editing with global search pickers, named history-safe delete, receipt-stable reorder retries, and a bounded contextual Undo action.**

## Accomplishments

- Moved the Active Workout Add flow into the approved BottomSheet picker, with search plus distinct loading, empty, error, and retry states; selection, dismissal, and failure do not mutate source facts.
- Retained Phase 9 receipt/revision/hash authority for add, replace, delete, and reorder. Protected completed history is truthfully retained as Skipped, while provisional exercise rows are deleted.
- Applied the Workout-only 8dp drag activation threshold while preserving the plan editor's existing long-press behavior; accessibility Move up/down follows the same reorder command.
- Restored the eight-second Undo affordance after a committed set using SemanticToast. It invokes the durable runtime command, reapplies its authoritative view, and stays outside the persistent action and rest docks.

## Task Commits

1. Task 1 — `15cfd5a`, `620640a` — searched add-exercise specification and sheet picker implementation.
2. Task 2 — `e20de39`, `4348fb8` — protected edit/reorder specification and receipt-stable history implementation.
3. Task 3 — `ee0ee55`, `c48ec48` — contextual Undo specification and durable toast-action implementation.

## Verification

- PASS: targeted Active Workout, route, and SemanticToast component tests (19 tests).
- PASS: session exercise command-boundary unit tests (48 tests).
- PASS: targeted completed-set and session-exercise SQLite integration tests (40 tests).
- PASS: `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, and `git diff --check`.
- Intentionally not run: global full suite and native matrix, per owner instruction.

## Decisions Made

- Kept `removeExercise` as the repository command while presenting Delete and a second named confirmation in the UI.
- Treated a library-read failure as a retryable error, not an empty list, so users never receive a misleading picker state.
- Extended only Workout's use of the shared reorder row with the 8dp gate; plan editor remains on its established long-press interaction.

## Deviations from Plan

### Auto-fixed Issues

1. [Rule 2 - Missing critical functionality] Distinguished exercise-library load failure from an empty picker.
- **Found during:** Task 1.
- **Issue:** The route collapsed a library read failure into `[]`, presenting a false empty state with no retry path.
- **Fix:** Added loading/error/retry route state and non-mutating picker notices.
- **Files modified:** `app/workout/[sessionId].tsx`, `src/ui/screens/ActiveWorkoutScreen.tsx`, `src/ui/components/WorkoutActionDock.tsx`.
- **Verification:** Active Workout and route component tests pass.
- **Committed in:** `620640a`.

2. [Rule 1 - Bug] Reused exact edit and reorder command receipts on retry.
- **Found during:** Task 2.
- **Issue:** Retrying recalculated `occurredAtMs`, producing a new envelope instead of the exact bounded intent required by receipt/idempotency semantics.
- **Fix:** Captured the original request envelope and replay it for replace and reorder retries.
- **Files modified:** `src/ui/screens/ActiveWorkoutScreen.tsx`.
- **Verification:** retry envelope component specification plus session editing integration tests pass.
- **Committed in:** `4348fb8`.

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 2). All changes were required to preserve source authority and offline receipt semantics.

## Known Stubs

None.

## Self-Check: PASSED

- Confirmed task commits `15cfd5a`, `620640a`, `e20de39`, `4348fb8`, `ee0ee55`, and `c48ec48` exist.
- Confirmed all seven modified implementation/test files exist.
- Confirmed the preserved Phase 14 dirty evidence and untracked `14-VERIFICATION.md` remain outside this plan's commits.

## Next Phase Readiness

Active Workout editing and recovery interactions are ready for subsequent workout-parity plans. No external setup is required.
