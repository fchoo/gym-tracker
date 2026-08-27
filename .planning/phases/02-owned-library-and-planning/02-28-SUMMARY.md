---
phase: 02-owned-library-and-planning
plan: 28
subsystem: active-workout-ui
tags: [react-native, expo-router, sqlite, accessibility, active-workout, metric-profiles, jest]
requires:
  - phase: 02-owned-library-and-planning
    provides: Current-schema committed set identities and revision-checked active-session correction from Plan 02-27
provides:
  - Dedicated presentation-only Today's plan navigation with sticky workout identity
  - Accessible 48dp glyph actions and explicit set-status semantics
  - Retriable committed-row add/copy mutations and unlimited in-progress completed-working-set correction
affects: [plan-02-29, plan-02-34, plan-02-35, phase-03-history, active-workout-ui]
actuals:
  tokens: 21156
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns:
    - Use a committed row ID from the runtime result as the single source for row reveal, scroll restoration, and focus.
    - Keep UI-level duplicate-submit guards synchronous with refs and reset them only after the mutation settles.
    - Treat completed working-set correction as a narrow revision-checked editor, never as whole-session rollback.
key-files:
  created:
    - app/workout-plan/[sessionId].tsx
    - src/ui/screens/WorkoutPlanOverviewScreen.tsx
  modified:
    - app/workout/[sessionId].tsx
    - src/ui/layout/AdaptiveScreen.tsx
    - src/ui/screens/ActiveWorkoutScreen.tsx
    - src/ui/components/SetRow.tsx
    - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
    - src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx
key-decisions:
  - Workout-plan review receives no mutation port, so browsing any exercise remains structurally presentation-only and cannot move the SQLite active pointer.
  - Add/copy UI consumes Plan 02-27 committedSetId rather than inferring an inserted row from the pre-mutation array.
  - Completed working sets remain editable only while ActiveWorkoutView is in_progress; later historical editing stays reserved for Phase 3.
patterns-established:
  - Dense set actions use accessible glyph controls with 48dp targets and exact visible accessibility labels.
  - Mutation failure notices retain user state and replay the exact affected section operation through a visible Retry action.
requirements-completed: [LIB-07, LIB-08, LIB-11, LIB-12]
coverage:
  - id: D1
    description: Today's plan lists exercises in workout order and supports non-mutating review with a sticky current/review identity.
    requirement: LIB-07
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#lists every workout exercise in order and reviews it without changing the active pointer
        status: pass
    human_judgment: false
  - id: D2
    description: Set and planning controls use accessible glyph controls with explicit completed and skipped state semantics.
    requirement: LIB-08
    verification:
      - kind: automated_ui
        ref: npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx src/ui/__tests__/OwnedPlanEditor.test.tsx
        status: pass
    human_judgment: false
  - id: D3
    description: Add/copy failures keep state, expose exact section retry actions, block duplicate submissions, and reveal/focus the runtime-identified committed row.
    requirement: LIB-11
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#keeps section mutations retryable without duplicate submissions and guards repeated add-working taps until the committed mutation settles
        status: pass
    human_judgment: false
  - id: D4
    description: Any completed working set can be corrected for the active in-progress session without a timed Undo or whole-session rollback.
    requirement: LIB-12
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#corrects a completed working set throughout the active workout without whole-session Undo
        status: pass
      - kind: automated_ui
        ref: src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx
        status: pass
    human_judgment: false
duration: 32min
completed: 2026-08-22
status: complete
---

# Phase 02 Plan 28: Active Workout Review and Persistent Correction Summary

**Active Workout now offers presentation-only workout-plan review, compact accessible set actions, committed-row retry/focus feedback, and revision-checked completed-set correction for the full in-progress session.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-08-22T18:19:32+08:00
- **Completed:** 2026-08-22T18:50:29+08:00
- **Tasks:** 3/3
- **Files modified:** 9

## Accomplishments

- Added the dedicated Today's plan route, ordered exercise-state overview, sticky workout/review identity, and explicit return-to-current action without supplying a mutation port to review UI.
- Replaced set and section text actions with 48dp accessible glyph controls, visible top-right completed/skipped glyphs, and explicit non-color status copy.
- Used the Plan 02-27 runtime contracts for exact committed-row reveal/scroll/focus and narrow completed-working-set correction; the timed whole-session Undo UI, timer, expiry notice, and RestDock rollback controls are removed.
- Added inline retries for add warm-up, copy warm-up, and add working set while retaining values and synchronously rejecting duplicate submissions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the dedicated Today's-plan page and sticky workout identity** - `1e40c32` (feat)
2. **Task 2: Replace textual set and planning actions with accessible glyph controls** - `8743db8` (feat)
3. **Task 3: Wire persistent add/copy retry and unlimited active-session correction** - `233c590` (feat)

## Files Created/Modified

- `app/workout-plan/[sessionId].tsx` - Provides the dedicated Today's plan route.
- `src/ui/screens/WorkoutPlanOverviewScreen.tsx` - Shows every active-workout exercise in order with explicit review states.
- `app/workout/[sessionId].tsx` - Wires the Plan 02-27 `reviseCompletedSet` runtime command to the Active Workout UI.
- `src/ui/layout/AdaptiveScreen.tsx` - Retains/restores scroll position for reviewed or newly committed row context.
- `src/ui/screens/ActiveWorkoutScreen.tsx` - Owns sticky review context, mutation retry/focus feedback, and in-progress correction orchestration.
- `src/ui/components/SetRow.tsx` - Renders glyph/status controls and profile-aware completed-working-set correction controls.
- `src/ui/__tests__/ActiveWorkoutScreen.test.tsx` and `src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx` - Prove review invariance, retry/focus, duplicate guarding, correction, and all metric-profile regressions.

## Decisions Made

- Today's plan remains non-mutating by construction: its screen consumes the current workout view but has no command interface capable of changing authoritative progress.
- Success feedback derives from `committedSetId`, then highlights, scrolls to, and focuses that exact row instead of assuming it is the final array item.
- Completed-set correction preserves the active session's later progress, active pointer, and rest source facts by delegating all persistence to Plan 02-27's revision-checked command.
- An active exercise with no remaining set still shows its completed rows so they remain correctable until the owner finishes the session.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved completed rows after the final active set**
- **Found during:** Task 3
- **Issue:** The legacy completion shortcut replaced the workout content when `activeSetId` became null, which made the plan-required unlimited in-progress correction unavailable for the last completed set.
- **Fix:** Kept the completion notice and Finish workout action alongside completed rows, allowing correction until the active session is finalized.
- **Files modified:** `src/ui/screens/ActiveWorkoutScreen.tsx`, `src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx`, `src/ui/__tests__/ActiveWorkoutScreen.test.tsx`
- **Verification:** Focused Active Workout and metric-profile component suites pass (51 tests).
- **Committed in:** `233c590`

**2. [Rule 2 - Missing critical functionality] Added synchronous duplicate-submit guards and committed-row reveal/focus**
- **Found during:** Task 3
- **Issue:** React state alone cannot reliably block two rapid taps before a render; the plan also requires the exact committed row to be revealed, scrolled to, and focused.
- **Fix:** Added per-section/correction ref guards and used `committedSetId` with row layout restoration and focus.
- **Files modified:** `src/ui/screens/ActiveWorkoutScreen.tsx`, `src/ui/components/SetRow.tsx`, `src/ui/__tests__/ActiveWorkoutScreen.test.tsx`
- **Verification:** Duplicate-tap regression plus focused component suites, typecheck, and lint pass.
- **Committed in:** `233c590`

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 2 critical interaction correction)
**Impact on plan:** Both changes directly enforce D-63/D-64 correctness and scope; no repository contract, schema, route beyond the planned Today's-plan route, or external integration was added.

## Issues Encountered

- Focused tests first exposed the expected removal of the legacy Undo completion path and an existing metric-profile expectation that incorrectly assumed final completed rows would disappear. The tests and UI now assert the planned persistent correction behavior.
- Shell startup emitted a pre-existing `compdef:153: _comps: assignment to invalid subscript range` warning, but all verification commands completed successfully.

## Known Stubs

None. The Task 3 source and test files were scanned for placeholder text, TODO/FIXME markers, and hardcoded empty render-state stubs; no plan-blocking stub was introduced.

## Threat Flags

None. This plan introduces no new network endpoint, authentication path, file access pattern, schema change, or trust boundary. Duplicate mutation and lost-update threats are addressed by UI guards plus Plan 02-27 repository revisions.

## User Setup Required

None - no external service configuration, physical verification, final evidence, or terminal seal is authorized by this plan.

## Next Phase Readiness

- Plan 02-29 can redesign RestDock without restoring the removed Undo/rollback controls.
- Plan 02-34 must rebuild the exact current source HEAD and regenerate automated APK evidence; Plan 02-35 owns attended physical review.

## Self-Check: PASSED

- Confirmed all nine plan files and this summary exist on disk.
- Confirmed task commits `1e40c32`, `8743db8`, and `233c590` exist in Git history and each has the required `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>` trailer.
- Verified `npm run typecheck -- --pretty false`, `npm run lint`, focused component suites (51 tests), and `git diff --check` pass.
- Confirmed no tracked files were deleted by this plan, and `.gsd/dispatch-isolation-sentinel.json` remains unstaged with SHA-256 `180d0b3d90e0e02f74556b3762c2e7f6a25463b8244cee5e0d4b167cbf44523c`.

---
*Phase: 02-owned-library-and-planning*
*Plan: 28*
*Completed: 2026-08-22*
