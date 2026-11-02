---
phase: 16-calendar-parity
plan: "05"
subsystem: ui
tags: [react-native, expo-router, calendar, accessibility, durable-routing, focus-restoration]
requires:
  - phase: 16-calendar-parity
    provides: source-backed Calendar range facts, fixed date/event tracks, and the measured focused-week transition controller from Plans 16-01 through 16-04
  - phase: 15-workout-parity
    provides: query-only Calendar-origin Strength history details that retain management authority outside Calendar
  - phase: 13-multi-plan-running-foundation
    provides: the typed session, occurrence, plan, and imported-activity destination union with durable identifiers
provides:
  - source-ordered compact Calendar agenda rows with one read-only full-width action per event
  - exhaustive Calendar-origin destination dispatch that preserves session, occurrence, plan/revision, activity, and return-event identities
  - Calendar-owned expanded-context, agenda-scroll, and focus restoration following detail Back
affects: [calendar, running, garmin, workout-history, phase-16-plan-07]
actuals:
  tokens: 12646
  tasks: 3
  commits: 7
tech-stack:
  added: []
  patterns:
    - event-keyed forwarded agenda refs paired with Calendar-owned return snapshots
    - presentation-blind discriminated route dispatch with validated durable identifiers
    - focus-return refresh that preserves last-good Calendar facts while reconciling stale events
key-files:
  created:
    - src/ui/calendar/CalendarAgenda.tsx
    - app/(tabs)/__tests__/calendar.test.tsx
  modified:
    - src/ui/screens/CalendarScreen.tsx
    - app/(tabs)/calendar.tsx
    - src/ui/__tests__/CalendarScreen.test.tsx
key-decisions:
  - "Calendar date cells only select/expand; agenda rows alone activate destinations, so the grid cannot contain a hidden first-event action."
  - "Calendar carries event ID, selected date, visible month, focused mode, and agenda offset locally; downstream detail routes receive only durable navigation identity and Calendar origin."
  - "Running and Garmin route pushes preserve typed handoff values without asserting downstream integration completion; Plan 16-07 remains its explicit closure owner."
patterns-established:
  - "Agenda activation: one FocusablePressable per source event, a return-reset latch, and no nested command control."
  - "Return recovery: restore Calendar snapshot, refresh the retained source range, then scroll and deliver host plus semantic focus after layout."
requirements-completed: [CAL-16, CAL-20, CAL-21, CAL-22, CAL-23]
coverage:
  - id: D1
    description: Compact source-ordered agenda rows provide one accessible read-only action per selected-date event.
    requirement: CAL-16
    verification:
      - kind: integration
        ref: src/ui/__tests__/CalendarScreen.test.tsx#opens one completed Strength agenda target without giving the date cell a nested event action
        status: pass
    human_judgment: false
  - id: D2
    description: Session, occurrence, Running plan/revision, and imported activity destinations preserve their durable identities to the Calendar route boundary.
    requirement: CAL-20
    verification:
      - kind: integration
        ref: app/(tabs)/__tests__/calendar.test.tsx#passes every remaining durable destination to its route boundary without fabricating a workout command
        status: pass
    human_judgment: false
  - id: D3
    description: Calendar-origin Back restores the retained spatial context and refreshes its source facts without exposing management authority.
    requirement: CAL-23
    verification:
      - kind: integration
        ref: src/ui/__tests__/CalendarScreen.test.tsx#restores the retained expanded month after Calendar returns from a detail route
        status: pass
      - kind: integration
        ref: src/ui/__tests__/SessionDetailScreen.test.tsx
        status: pass
    human_judgment: false
duration: 14min
completed: 2026-10-12
status: complete
---

# Phase 16 Plan 05: Compact Agenda and Durable Calendar Routing Summary

**Calendar now presents every selected-date source event as one compact read-only agenda action, dispatches its durable identity without presentation-based inference, and restores the exact Calendar context after detail Back.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-10-12T17:28:55Z
- **Completed:** 2026-10-12T17:42:33Z
- **Tasks:** 3/3
- **Files modified:** 5
- **Focused coverage:** 3 component suites / 10 tests

## Accomplishments

- Added `CalendarAgenda`, a source-ordered, scrollable agenda with 82dp-minimum full-width rows, 5dp sport rails, wrapping source/status content, decorative chevrons, and exactly one read-only activation target per event.
- Moved event routing out of calendar date cells. The exhaustive destination dispatcher validates durable IDs and retains Calendar origin, event return ID, planned Running revision ID, and imported activity ID without reading title, color, date, source label, or status to infer a route.
- Restored Calendar-owned month, selected date, focused mode, scroll anchor, and event-keyed focus after detail return; Back/Escape closes the key or focused state before root navigation, and return triggers a source refresh while retaining the last good projection.

## Task Commits

Each task was committed atomically:

1. **Task 1: Open one completed Strength event from a single-target agenda row** — `e4076cb0` (RED coverage), `058cd8bc` (agenda implementation)
2. **Task 2: Preserve every destination identity and truthful missing/overflow state** — `f5132840` (RED coverage), `81a1587b` (exhaustive durable dispatch)
3. **Task 3: Restore expanded Calendar state, scroll, and invoking focus after detail Back** — `e3c80de5` (RED coverage), `69867e3f` (return restoration)
4. **Required return reconciliation** — `c1365349` (refresh retained source range after detail Back)

## Files Created/Modified

- `src/ui/calendar/CalendarAgenda.tsx` — compact full-width source-event actions, event-keyed row refs, source-order list, empty state, and activation latch.
- `src/ui/screens/CalendarScreen.tsx` — agenda composition, read-only date-cell selection, return snapshot/restoration, refresh, Back priority, and semantic focus restoration.
- `app/(tabs)/calendar.tsx` — exhaustive presentation-blind destination dispatch and route-focus generation signal.
- `src/ui/__tests__/CalendarScreen.test.tsx` — agenda, source order, zero-command, return, and refresh regressions.
- `app/(tabs)/__tests__/calendar.test.tsx` — durable identity handoff tests for every destination discriminant.

## Decisions Made

- Date cells remain navigation/selection controls; only an agenda row can activate an event, preventing hidden nested actions or accidental selection-to-detail jumps.
- Calendar retains its return snapshot internally and uses the route focus signal solely to schedule restoration, preserving the read-only route boundary.
- The Calendar route records a typed Running/Garmin handoff but does not represent this as final downstream route integration; Plan 16-07 owns that closure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Refresh Calendar facts after detail return**

- **Found during:** Task 3: Restore expanded Calendar state, scroll, and invoking focus after detail Back
- **Issue:** A Calendar-origin detail could be missing or changed while away, while a same-month return would otherwise retain a stale agenda row without requesting a source refresh.
- **Fix:** The retained Calendar snapshot now increments its query generation on return, preserving last-good content while refreshing the exact selected range and reconciling removed rows to the existing empty/missing state.
- **Files modified:** `src/ui/screens/CalendarScreen.tsx`, `src/ui/__tests__/CalendarScreen.test.tsx`
- **Verification:** Focused Calendar route/component tests, SessionDetailScreen regression, typecheck, lint, and boundary checks pass.
- **Committed in:** `c1365349`

---

**Total deviations:** 1 auto-fixed Rule 2 correctness fix.
**Impact on plan:** Required to uphold the specified missing/stale return behavior without adding any mutation or management authority.

## Issues Encountered

- The strict project-wide coverage gate was run but could not complete because the unrelated `src/platform/sqlite/repositories/progressRepository.test.ts` fails with `progress_snapshot_kernel_required`. This Plan changed neither that repository nor its tests, so it was left untouched. All scoped route/component/detail suites, typecheck, lint, and boundary checks passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Calendar now has one command-free navigation affordance per source event and preserves Strength context end-to-end.
- Planned Running and imported Garmin identities are retained at the route boundary only. Plan 16-07 must provide the real Phase 17/18 downstream route integration before CAL-17 can be considered closed.
- No stubs were found in this Plan’s changed files. No new threat surface outside the Plan’s typed destination and return-token threat model was introduced.

## Self-Check: PASSED

- Confirmed all five owned implementation/test files and this summary exist in the isolated worktree.
- Confirmed all seven Task 1–3 and return-reconciliation commits exist in repository history.

---

*Phase: 16-calendar-parity*
*Completed: 2026-10-12*
