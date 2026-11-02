---
phase: 15-workout-parity
plan: "04"
subsystem: workout-ui
tags: [react-native, explicit-save, metric-profiles, revision-fencing, accessibility]
requires:
  - phase: 15-02
    provides: TIM-01 playback retirement and timing presentation boundary
  - phase: 14
    provides: BottomSheet, focus restoration, and shared visual system
provides:
  - Facts-only tappable workout rows with one explicit-save editor
  - All-nine metric-profile draft, validation, cancellation, and failure coverage
  - Screen-owned duplicate-safe Complete Set transaction coverage
affects: [15-05, 15-06, 15-07, 15-08, 15-12, active-workout]
tech-stack:
  added: []
  patterns:
    - Local editor draft with one revision-fenced persistence boundary
    - Facts-only row presentation; screen owns completion authority
key-files:
  created:
    - src/ui/components/WorkoutSetEditorSheet.tsx
  modified:
    - src/ui/components/SetRow.tsx
    - src/ui/screens/ActiveWorkoutScreen.tsx
    - src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx
    - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
actuals:
  tokens: 47546
  tasks: 3
  commits: 4
key-decisions:
  - "Set rows expose facts and a single edit intent only; persistence remains behind explicit Save."
  - "Completed rows use the explicit Save committed set edit label and the existing revision-fenced correction command."
  - "Complete Set remains a screen-owned, duplicate-safe transaction and is not reintroduced on individual rows."
requirements-completed: [WRK-12, WRK-13, WRK-14, WRK-15]
coverage:
  - id: D1
    description: "Any planned, current, or committed row opens the local explicit-save editor; cancellation and scrim dismissal never write source facts."
    requirement: WRK-12
    verification:
      - kind: unit
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#opens-a-facts-only-row-in-one-local-editor-keeps-source-choice-local-and-cancels-without-a-source-write
        status: pass
      - kind: unit
        ref: src/ui/__tests__/WorkoutSetEditorSheet.test.tsx#dismisses-through-the-scrim-without-saving-a-changed-draft
        status: pass
    human_judgment: false
  - id: D2
    description: "Explicit Save validates and persists one load/reps draft, blocks duplicates, and retains the draft after failure."
    requirement: WRK-13
    verification:
      - kind: unit
        ref: src/ui/__tests__/WorkoutSetEditorSheet.test.tsx#keeps-a-load-reps-draft-local-until-explicit-Save
        status: pass
      - kind: unit
        ref: src/ui/__tests__/WorkoutSetEditorSheet.test.tsx#disables-duplicate-saves-until-the-explicit-save-command-settles
        status: pass
    human_judgment: false
  - id: D3
    description: "Timed holds remain duration-only with five-second controls, while all nine metric profiles retain profile-specific context and canonical observations."
    requirement: WRK-14
    verification:
      - kind: unit
        ref: src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx#keeps-name-local-to-the-compatible-explicit-save-editor
        status: pass
      - kind: integration
        ref: tests/integration/cross-profile-workout.test.ts#authoritative-cross-profile-workout-adapters
        status: pass
    human_judgment: false
  - id: D4
    description: "Completed corrections use a revision-fenced explicit editor path, and screen-owned completion remains truthful, duplicate-safe, and retry-stable."
    requirement: WRK-15
    verification:
      - kind: unit
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#keeps-a-committed-correction-sheet-and-its-draft-open-after-a-revision-fenced-failure
        status: pass
      - kind: unit
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#retries-a-failed-screen-owned-completion-with-the-exact-command-envelope
        status: pass
    human_judgment: false
duration: 13min
completed: 2026-10-10
status: complete
---

# Phase 15 Plan 04: Explicit-Save Workout Set Editor Summary

**Facts-only workout rows now open one metric-aware BottomSheet editor whose local drafts persist only on explicit Save, while completed corrections and screen-owned completion remain revision-fenced and retry-safe.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-10T12:32:09Z
- **Completed:** 2026-10-10T12:44:37Z
- **Tasks:** 3/3 complete
- **Files modified:** 7

## Accomplishments

- Replaced inline row mutation controls with a shared, keyboard-safe 82%-cap `WorkoutSetEditorSheet` for all nine shipped metric profiles.
- Kept source selections and direct input local until explicit Save; cancellation, scrim dismissal, failure, and correction retry preserve trustworthy source state and entered values.
- Migrated legacy inline-row tests to facts-only row, per-profile explicit-save, completed-correction, duplicate blocking, and screen-owned completion transaction assertions.
- Preserved canonical conversion, strict command validation, and cross-profile integration guarantees while removing retired SetRow mutation callback surface.

## Task Commits

1. **Task 1: Edit one load-and-reps row through explicit Save** - `23ffba30` (test), `696ba980` (feat)
2. **Task 3: Harden editor failure, retry, focus, and no-hidden-timing boundaries** - `c3616a77` (fix)
3. **Tasks 2–3: Migrate all-profile and ActiveWorkoutScreen coverage** - `76281101` (test)

## Files Created/Modified

- `src/ui/components/WorkoutSetEditorSheet.tsx` - Shared explicit-save editor, profile-aware fields, committed-edit label, and local failure retention.
- `src/ui/components/SetRow.tsx` - Facts-only tappable set presentation with retired mutation callback API removed.
- `src/ui/screens/ActiveWorkoutScreen.tsx` - Connects selected row to the editor and applies only authoritative command results.
- `src/ui/__tests__/WorkoutSetEditorSheet.test.tsx` - Explicit-save, close/scrim cancellation, and pending-save duplicate coverage.
- `src/ui/__tests__/SetRow.test.tsx` - Facts-only row intent coverage.
- `src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx` - All-nine metric-profile explicit editor, cancellation, failure, and committed-correction coverage.
- `src/ui/__tests__/ActiveWorkoutScreen.test.tsx` - Screen-owned transaction gating, exact retry, and local-draft integration coverage.

## Decisions Made

- The editor, not the row, owns editable draft state; a row contains no persistence, reset, remove, or completion action.
- The existing authoritative commands remain the only persistence path: draft updates for uncommitted sets and revision-fenced corrections for completed sets.
- The completion dock alone invokes `completeSet`; it remains disabled while its exclusive transaction is pending and retries the exact request envelope.

## Verification

- `npm run typecheck` — passed
- `npm run test:components -- --runInBand src/ui/__tests__/WorkoutSetEditorSheet.test.tsx src/ui/__tests__/SetRow.test.tsx src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx` — passed (31 tests)
- `npm run test:unit -- --runInBand src/domains/workout/setCommands.test.ts` — passed (48 tests)
- `npm run test:integration -- --runInBand tests/integration/cross-profile-workout.test.ts` — passed (3 tests)
- `npm run lint` and `npm run check:boundaries` — passed (332 files)
- TIM-01 presentation audit: no cadence, cluster, rest-between-reps, advanced timing, or cue-authoring control is present in `SetRow` or `WorkoutSetEditorSheet`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Made the completed correction action explicit**
- **Found during:** Task 3
- **Issue:** Completed sets used the generic draft save label, which did not expose the committed-edit contract required by the plan.
- **Fix:** Render `Save committed set edit` for completed rows while retaining the existing revision-fenced correction command.
- **Files modified:** `src/ui/components/WorkoutSetEditorSheet.tsx`, `src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx`
- **Verification:** Component and typecheck suites passed.
- **Committed in:** `76281101`

**2. [Rule 2 - Missing Critical Functionality] Removed retired mutation callbacks from the SetRow API**
- **Found during:** Task 3
- **Issue:** The row type still exposed deprecated update, complete, and remove callbacks despite facts-only presentation, allowing accidental reintroduction of bypass authority.
- **Fix:** Removed those callback props and migrated the legacy screen tests to the editor and screen-owned command boundaries.
- **Files modified:** `src/ui/components/SetRow.tsx`, `src/ui/__tests__/ActiveWorkoutScreen.test.tsx`
- **Verification:** Component, integration, typecheck, lint, and boundary checks passed.
- **Committed in:** `76281101`

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 2).

## Known Stubs

None.

## Issues Encountered

- Legacy ActiveWorkoutScreen tests still targeted intentionally retired inline inputs and row-level mutation controls. They were migrated to the approved D15-05 editor and dock-owned transaction model rather than preserving the removed UI.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 15-05 can build the compact dock completion flow on top of an explicit editor that never writes on dismissal and preserves correction drafts on failure.

## Self-Check: PASSED

- Required editor, row, screen, and all-profile test files exist.
- All four task commits are present in git history.

---

*Phase: 15-workout-parity*
*Completed: 2026-10-10*
