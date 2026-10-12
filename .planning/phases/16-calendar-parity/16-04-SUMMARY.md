---
phase: 16-calendar-parity
plan: 04
subsystem: ui
tags: [react-native, reanimated, gesture-handler, calendar, accessibility, motion]
requires:
  - phase: 16-01
    provides: Source-backed Calendar read capability and event presentation contracts
  - phase: 16-02
    provides: Civil Calendar geometry and source-backed Calendar states
provides:
  - UI-thread three-panel month drag with bounded React semantic bridge
  - Epoch-guarded cancellation, reduced-motion equivalence, and shared control intents
  - Measured focused-week overlays with ordered adjacent-week transitions
affects: [16-05, 16-06, calendar-parity, native-calendar-evidence]
actuals:
  tokens: 9013
  tasks: 3
  commits: 7
tech-stack:
  added: []
  patterns: [UI-thread pointer translation with scheduleOnRN boundary publication, epoch-guarded semantic controller, keyed civil-week geometry overlays]
key-files:
  created: [src/ui/calendar/CalendarMonthViewport.tsx]
  modified: [src/ui/calendar/calendarTransitionController.ts, src/ui/calendar/CalendarWeekRow.tsx, src/ui/screens/CalendarScreen.tsx, src/ui/__tests__/CalendarTransitions.test.tsx, src/ui/__tests__/CalendarScreen.test.tsx]
key-decisions:
  - "The UI thread owns continuous pointer and row geometry; React receives only threshold previews, bounded releases, cancellation, and epoch-guarded completion."
  - "Adjacent-week selection retains the old semantic date until collapse completes, then applies the pending civil date/month immediately before expansion."
  - "Calendar range reads extend one civil week beyond the visible grid so the bottom focused overlay never drops following-week titles or actions."
patterns-established:
  - "Spatial transitions use measured layout keyed by civil-week start and cancel rather than manufacture coordinates after layout invalidation."
  - "Keyboard, buttons, pointer completion, Back cancellation, and runtime reduced-motion changes converge through transitionCalendar."
requirements-completed: [CAL-07, CAL-08, CAL-09, CAL-10, CAL-11, CAL-12, CAL-13, CAL-14, CAL-15]
coverage:
  - id: D1
    description: "Distance-only month drag, intent arbitration, cancellation, and reduced-motion semantic controller"
    requirement: CAL-07
    verification:
      - kind: unit
        ref: "src/ui/__tests__/CalendarTransitions.test.tsx; controller-only Jest coverage run"
        status: pass
    human_judgment: false
  - id: D2
    description: "Measured focused-week morph and adjacent collapse/select/expand sequencing"
    requirement: CAL-12
    verification:
      - kind: unit
        ref: "src/ui/__tests__/CalendarTransitions.test.tsx"
        status: pass
      - kind: integration
        ref: "src/ui/__tests__/CalendarScreen.test.tsx"
        status: pass
    human_judgment: false
duration: 22m 55s
completed: 2026-10-12
status: complete
---

# Phase 16 Plan 04: Calendar spatial transition state machine Summary

**UI-thread three-panel month drag and measured focused-week geometry with source-backed titles, shared control semantics, cancellation safety, and reduced-motion equivalence.**

## Performance

- **Duration:** 22m 55s
- **Started:** 2026-10-12T16:59:50Z
- **Completed:** 2026-10-12T17:22:45Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added the production `CalendarMonthViewport`: clipped previous/current/next month panels follow measured horizontal pointer displacement on the UI thread, settle at the inclusive 25% boundary using the approved 240ms easing, and reject stale completions by epoch.
- Routed buttons, keyboard date movement, pointer release, cancellation, and runtime motion changes through the immutable Calendar controller while preserving vertical scrolling and a single source-backed selected date.
- Added measured civil-week overlays that retain the fixed date/event tracks, query the following week, and execute collapse → select/focus → expand without dropped event titles or actions.

## Task Commits

1. **Task 1: Drag one month 1:1 across the exact 25% boundary and settle once**
   - `a4c93faf` test — failing measured three-panel geometry specification
   - `0085ce75` feat — UI-thread month viewport
   - `5b276b95` fix — preserve outgoing panel through guarded settle
2. **Task 2: Close intent arbitration, cancellation, controls, concurrency, and reduced motion**
   - `8d0daa29` test — failing interruption specification
   - `0d382dfd` feat — shared intents and race guards
3. **Task 3: Morph measured selected/following rows and sequence adjacent weeks**
   - `452574ad` test — failing exact morph timing specification
   - `acbfa03c` feat — measured overlay implementation and complete controller coverage

## Files Created/Modified

- `src/ui/calendar/CalendarMonthViewport.tsx` — Native-gesture/Reanimated panel tracking, cancellation, settle completion, and measured focused-week overlays.
- `src/ui/calendar/calendarTransitionController.ts` — Exhaustive semantic state/epoch controller for drag, controls, focused mode, adjacency, and reduced motion.
- `src/ui/calendar/CalendarWeekRow.tsx` — Fixed-track row renderer with layout measurement and inert duplicate-row support.
- `src/ui/screens/CalendarScreen.tsx` — Source query extension, controller integration, keyboard/control routing, and week-geometry recording.
- `src/ui/__tests__/CalendarTransitions.test.tsx` — Boundary, interruption, exact timing, adjacency, and strict controller coverage tests.
- `src/ui/__tests__/CalendarScreen.test.tsx` — Updated query-boundary coverage for following civil-week source data.

## Decisions Made

- Kept per-frame drag and row positions solely in Reanimated shared values; `scheduleOnRN` publishes only bounded preview identity changes, release semantics, and guarded completion.
- Treated null/stale geometry as non-authoritative: animations wait for measured rows and viewport layout instead of using fixed fallback coordinates.
- Used an extra seven civil days in the query range so the following focused-week overlay remains source-backed at a month boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Retained the outgoing month panel until its settle completes**

- **Found during:** Task 1
- **Issue:** Committing the new month to React before the UI-thread movement completed replaced the outgoing panel content during the animation.
- **Fix:** Kept pending month/date state until the epoch-matched completion while the header tracks the committed title.
- **Files modified:** `src/ui/screens/CalendarScreen.tsx`, `src/ui/calendar/CalendarMonthViewport.tsx`
- **Verification:** Focused component suites, typecheck, and boundary checks pass.
- **Committed in:** `5b276b95`

**2. [Rule 1 - Bug] Completed no-layout non-gesture controls deterministically**

- **Found during:** Task 1
- **Issue:** A button intent before initial layout was canceled despite having a valid controller destination.
- **Fix:** The viewport completes the controller epoch without fabricated geometry when it has no measured width.
- **Files modified:** `src/ui/calendar/CalendarMonthViewport.tsx`
- **Verification:** CalendarScreen refresh/control test passes.
- **Committed in:** `5b276b95`

**3. [Rule 1 - Bug] Deferred adjacent date/month mutation until collapse completion**

- **Found during:** Task 3
- **Issue:** The initial controller updated the selected date before the required collapse → select/focus → expand sequence.
- **Fix:** Added pending civil date/month state that applies at the collapse completion epoch, including the reduced-motion equivalent.
- **Files modified:** `src/ui/calendar/calendarTransitionController.ts`, `src/ui/screens/CalendarScreen.tsx`, `src/ui/__tests__/CalendarTransitions.test.tsx`
- **Verification:** Focused suites pass and the controller reaches 100% statements, branches, functions, and lines.
- **Committed in:** `acbfa03c`

**Total deviations:** 3 auto-fixed Rule 1 behavior defects.

## Issues Encountered

- `state.advance-plan` could not parse the repository's free-form `Current Position` plan text. The remaining state handlers updated metrics, decisions, session data, roadmap progress, and requirements; the Current Position text was updated directly to record Plan 16-04 completion and Plan 16-05 as next.

## Verification

- `npm run test:components -- --runInBand src/ui/__tests__/CalendarTransitions.test.tsx src/ui/__tests__/CalendarScreen.test.tsx` — passed (12 tests).
- `npm run typecheck` — passed.
- `npm run lint` and `npm run check:boundaries` — passed.
- `npm run test:coverage -- --runInBand` — completed across all four Jest projects.
- Controller-only coverage command — passed at **100% statements, branches, functions, and lines** for `calendarTransitionController.ts`.

## Known Stubs

None.

## Next Phase Readiness

Plans 16-05 and 16-06 can build on a source-backed Calendar with deterministic drag/focus semantics. Native intermediate-geometry evidence remains intentionally owned by Plan 16-06.

## Self-Check: PASSED

- Confirmed the summary and all six owned implementation/test files exist.
- Confirmed all seven Task 1–3 commits exist in the worktree history.
