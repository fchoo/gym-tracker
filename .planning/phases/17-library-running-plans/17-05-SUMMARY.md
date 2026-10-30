---
phase: 17-library-running-plans
plan: "05"
subsystem: ui
tags: [strength, schedules, plan-impact, revisions, confirmation, accessibility]
requires:
  - phase: 17-01
    provides: concurrent plan ownership and preserved schedule/runtime contracts
  - phase: 14
    provides: shared bottom-sheet, confirmation, focus, and presentation primitives
provides:
  - stale-safe prospective Strength schedule review that retains the local draft
  - explicit reviewed confirmations for exercise replacement and plan-day removal
  - focused UI proof that no mutation occurs before a final consequence confirmation
affects: [17-06, 17-07, 17-08, library, strength-workout]
tech-stack:
  added: []
  patterns: [preview-token-before-command, confirmation-dialog-focus-restoration, local-draft-on-stale-refresh]
key-files:
  created: []
  modified:
    - src/ui/screens/ScheduleEditorScreen.tsx
    - src/ui/screens/ExerciseReplacementScreen.tsx
    - src/ui/screens/PlanDayRemovalScreen.tsx
    - src/ui/__tests__/ScheduleEditor.test.tsx
    - src/ui/__tests__/PlanImpactReplacement.test.tsx
key-decisions:
  - "A stale schedule preview reloads factual state but retains the local draft for review and retry."
  - "Replacement and day removal stay command-layer revision-fenced and require a final focus-restoring ConfirmationDialog before writing."
patterns-established:
  - "Consequential prospective mutations present a reviewed preview, then confirm without recomputing authoritative impact in the screen."
requirements-completed: [LIB-16, LIB-17, LIB-18]
actuals:
  tokens: 3951
  tasks: 3
  commits: 6
coverage:
  - id: D1
    description: Prospective Strength schedule saves retain local drafts and refresh factual revisions after stale conflicts.
    requirement: LIB-16
    verification:
      - kind: unit
        ref: src/ui/__tests__/ScheduleEditor.test.tsx
        status: pass
      - kind: integration
        ref: tests/integration/schedule-commands.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Exercise replacement retains occurrence scope, compatible metrics, reviewed targets, and an explicit final confirmation.
    requirement: LIB-17
    verification:
      - kind: unit
        ref: src/ui/__tests__/PlanImpactReplacement.test.tsx
        status: pass
      - kind: integration
        ref: tests/integration/plan-impact-replacement.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Plan-day removal retains active-workout guards, prospective impact review, and no-write cancellation.
    requirement: LIB-18
    verification:
      - kind: unit
        ref: src/ui/__tests__/PlanImpactReplacement.test.tsx
        status: pass
      - kind: integration
        ref: tests/integration/plan-impact-replacement.test.ts
        status: pass
    human_judgment: false
duration: 5min
completed: 2026-10-11
status: complete
---

# Phase 17 Plan 05: Strength schedule and impact confirmations Summary

Prospective Strength schedule, replacement, and plan-day removal routes now reload stale facts safely and require an accessible final confirmation while retaining revision, preview-token, active-workout, and immutable-history guarantees.

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-11T02:19:22+08:00
- **Completed:** 2026-10-11T02:24:36+08:00
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Preserved the existing schedule route and runtime command payload, adding stale-preview refresh that keeps the user’s effective-date, timezone, mode, and bindings draft intact.
- Added reviewed, no-write-until-confirmed replacement flow with compatible metric identity filtering, scoped occurrence impact, idempotent request identity, and restored focus after cancellation.
- Added the matching guarded removal confirmation without bypassing active-workout protection, revisioned preview tokens, prospective effective-date choices, or completed history immutability.

## Verification

- `npm run test:components -- --runInBand src/ui/__tests__/ScheduleEditor.test.tsx src/ui/__tests__/PlanImpactReplacement.test.tsx` — passed (31 tests).
- `npm run test:integration -- --runInBand tests/integration/schedule-commands.test.ts tests/integration/plan-impact-replacement.test.ts` — passed (73 tests).
- `npm run typecheck`, `npm run lint`, and `npm run check:boundaries` — passed.

## Task Commits

1. **Task 1: Save one prospective Strength schedule** - `d931a72c` (test), `5b2778a6` (feat)
2. **Task 2: Preserve replacement scope, metrics, targets, and refreshed impact** - `12bf6cc6` (test), `fd259753` (feat)
3. **Task 3: Preserve plan-day removal consequences and current-workout guard** - `44ca3084` (test), `f944455c` (feat)

## Files Created/Modified

- `src/ui/screens/ScheduleEditorScreen.tsx` - Retains local schedule draft while refreshing factual state after a stale save conflict.
- `src/ui/screens/ExerciseReplacementScreen.tsx` - Requires reviewed future-replacement confirmation with focus restoration.
- `src/ui/screens/PlanDayRemovalScreen.tsx` - Requires reviewed prospective removal confirmation with focus restoration.
- `src/ui/__tests__/ScheduleEditor.test.tsx` - Covers stale factual refresh with draft retention.
- `src/ui/__tests__/PlanImpactReplacement.test.tsx` - Covers no-write cancellation and final confirmation for replacement and removal.

## Decisions Made

- Stale schedule conflicts refresh authoritative route facts but never overwrite the current user draft.
- Preview confirmation remains a UI presentation gate only; preview tokens, expected revisions, active-workout rechecks, receipts, and actual writes remain in the established runtime/domain layers.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- All five modified production/test files and this summary exist.
- Commits `d931a72c`, `5b2778a6`, `12bf6cc6`, `fd259753`, `44ca3084`, and `f944455c` exist on `fchoo/UX-revamp`.

## Next Phase Readiness

The preserved Strength deep routes now meet the shared Phase 14 presentation contract without altering Running same-day session identity, completed history, or retired timing surfaces.
