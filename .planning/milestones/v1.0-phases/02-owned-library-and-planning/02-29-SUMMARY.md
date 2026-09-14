---
phase: 02-owned-library-and-planning
plan: 29
subsystem: active-workout-ui
tags: [react-native, expo, rest-timer, accessibility, lucide, active-workout, jest]
requires:
  - phase: 02-owned-library-and-planning
    provides: Active Workout review/correction presentation and accessible glyph-control patterns from Plan 02-28
provides:
  - Collapsible in-app rest surface with always-visible remaining time and running/paused semantics
  - Ordered Skip, Pause/Resume, minus-15, plus-15 accessible rest controls
  - Direct authoritative skip-to-ready rendering without redundant skipped-rest feedback
affects: [plan-02-34, plan-02-35, active-workout-ui, phase-05-accessibility-verification]
actuals:
  tokens: 5047
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns:
    - Keep timer presentation local while deriving every rest value from RestStateV1 and sending revision-checked commands through ActiveWorkoutScreen.
    - Use synchronous refs alongside disabled render state to block rapid duplicate authoritative commands before React rerenders.
key-files:
  created: []
  modified:
    - src/ui/components/RestDock.tsx
    - src/ui/screens/ActiveWorkoutScreen.tsx
    - src/ui/__tests__/RestDock.test.tsx
    - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
key-decisions:
  - Expanded RestDock controls are glyph-first with exact accessible labels; minus/plus retain compact text glyphs plus explicit accessible names.
  - Skip consumes the authoritative idle rest result and renders the normal ready state directly instead of introducing transient UI state.
  - Rest commands use one synchronous in-flight guard to preserve the existing revision/command boundary under rapid repeated activation.
patterns-established:
  - Compact rest controls can wrap at large text while retaining equal 48dp touch and keyboard/D-pad targets.
  - Collapsed timer surfaces retain visible state semantics and a focusable expand/collapse control rather than hiding timer truth.
requirements-completed: [LIB-07, LIB-08]
coverage:
  - id: D1
    description: Collapsed and expanded RestDock states retain remaining time, explicit running/paused semantics, focusable 48dp targets, and the exact expanded control order.
    requirement: LIB-07
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/RestDock.test.tsx#keeps running time visible when collapsed and expands ordered controls
        status: pass
      - kind: automated_ui
        ref: src/ui/__tests__/RestDock.test.tsx#invokes pause adjust skip and resume through explicit controls
        status: pass
    human_judgment: false
  - id: D2
    description: Running and paused rest skip exactly once to the normal ready state without visual or accessibility-tree skipped-rest feedback, while collapsed expiry remains authoritative.
    requirement: LIB-08
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#skips running rest once and transitions directly to the ready state
        status: pass
      - kind: automated_ui
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#skips paused rest once and transitions directly to the ready state
        status: pass
      - kind: automated_ui
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#expires collapsed rest through the authoritative command without skipped feedback
        status: pass
    human_judgment: false
duration: 7min
completed: 2026-08-22
status: complete
---

# Phase 02 Plan 29: Compact RestDock and Direct Skip Summary

**Active Workout now offers a collapsible, timestamp-derived RestDock whose visible timer and paused/running state survive both presentations, with ordered accessible controls and a direct skip-to-ready transition.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-22T19:00:40+08:00
- **Completed:** 2026-08-22T19:07:38+08:00
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Added a collapsed RestDock that keeps the timestamp-derived remaining time and explicit running/paused semantics visible, with a focusable 48dp expand/collapse glyph control.
- Reordered expanded controls to Skip, Pause/Resume, −15, +15. Skip and Pause/Resume use installed Lucide glyphs with exact accessible names; all same-row controls share the minimum 48dp target and can wrap for large text.
- Removed the owner-visible and accessibility-tree `Rest skipped` state. A successfully committed skip now renders the normal ready next-set state directly.
- Proved running and paused skips, rapid duplicate Skip activation, collapse/expand around pause/resume/adjust, and collapsed expiry without altering RestStateV1 timestamp calculations or command semantics.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add failing collapsed RestDock contract coverage** - `6da2b7b` (test)
2. **Task 1: Add collapsed and expanded RestDock states with exact controls** - `0adfeea` (feat)
3. **Task 2: Remove skipped-rest notice and prove lifecycle behavior** - `d472925` (feat)

## Files Created/Modified

- `src/ui/components/RestDock.tsx` - Adds local collapsed/expanded presentation and ordered accessible glyph/text controls without modifying timer truth.
- `src/ui/screens/ActiveWorkoutScreen.tsx` - Removes skipped-rest presentation and synchronously guards rest commands before delegating to the existing revision-checked command port.
- `src/ui/__tests__/RestDock.test.tsx` - Covers both presentations, retained time/state semantics, ordered controls, and target/focus behavior.
- `src/ui/__tests__/ActiveWorkoutScreen.test.tsx` - Covers direct running/paused skip, immediate duplicate activation, expanded-state transitions, and collapsed expiry.

## Decisions Made

- RestDock owns presentation-only collapse state. Its remaining time continues to come exclusively from `remainingRestMs(state, nowMs)`, keeping SQLite/timestamp authority intact.
- The normal idle rest result is the only success feedback after Skip; no additional transient skip state is necessary or allowed.
- A synchronous in-flight ref complements `restBusy` because render-state disabling alone cannot stop two taps that arrive before the next render.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added a synchronous rest-command duplicate guard**
- **Found during:** Task 2
- **Issue:** `restBusy` disables controls after React renders, but two rapid Skip activations could reach the authoritative command port before that render.
- **Fix:** Added a local in-flight ref around `runRest`, preserving existing revision checks while rejecting a second in-flight rest command.
- **Files modified:** `src/ui/screens/ActiveWorkoutScreen.tsx`, `src/ui/__tests__/ActiveWorkoutScreen.test.tsx`
- **Verification:** The running and paused rapid-duplicate Skip regressions pass, alongside typecheck, lint, and focused component suites.
- **Committed in:** `d472925`

---

**Total deviations:** 1 auto-fixed (Rule 2 critical duplicate-command protection)
**Impact on plan:** The guard directly fulfills the plan threat model's exactly-once command requirement without changing the rest repository, persistence model, or domain command semantics.

## Issues Encountered

- Existing component tests encoded the superseded expanded-only control order. They were updated within the planned test files as part of the new D-60 contract.
- Shell startup emitted the pre-existing `compdef:153: _comps: assignment to invalid subscript range` warning; all test and static-analysis commands completed successfully.

## Known Stubs

None. The four changed source/test files were scanned for placeholder/TODO/FIXME and empty render-state patterns; no plan-blocking stub was introduced.

## Threat Flags

None. The plan adds no network endpoint, authentication path, filesystem access, schema change, or new trust boundary. Rest command integrity remains inside the existing revision-checked application/domain port.

## User Setup Required

None - no external service configuration, attended physical validation, final evidence, or terminal-seal artifact is authorized by this plan.

## Next Phase Readiness

- Plan 02-34 owns rebuilding exact-HEAD APK and automated native evidence for this runtime UI change.
- Plan 02-35 owns attended physical device and emulator review; this plan deliberately records no physical verification claim.

## Self-Check: PASSED

- Confirmed all four production/test files and this summary exist on disk.
- Confirmed task commits `6da2b7b`, `0adfeea`, and `d472925` exist in Git history and each ends with `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>`.
- Verified `npm run typecheck -- --pretty false`, `npm run lint`, focused RestDock/ActiveWorkout component suites (39 tests), and `git diff --check a9b0304..HEAD` pass.
- Confirmed the plan introduced no tracked-file deletion, no runtime `Rest skipped`/`restSkipped` source text, and no plan-blocking stubs.
- Confirmed `.gsd/dispatch-isolation-sentinel.json` remains unstaged with SHA-256 `180d0b3d90e0e02f74556b3762c2e7f6a25463b8244cee5e0d4b167cbf44523c`.

---
*Phase: 02-owned-library-and-planning*
*Plan: 29*
*Completed: 2026-08-22*
