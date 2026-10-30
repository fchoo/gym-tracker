---
phase: 16-calendar-parity
plan: 02
subsystem: ui
tags: [react-native, calendar, civil-date, accessibility, sqlite-projection]
requires:
  - phase: 16-01
    provides: owner-approved DEV-01/DEV-02 records and the narrow CalendarReadPort contract
  - phase: 16-03
    provides: production WorkoutAppRuntime loadCalendarRange query bridge
provides:
  - source-backed Monday-first Calendar route with typed durable event destinations
  - civil month geometry and identity-preserving Calendar presentation helpers
  - retained Calendar refresh/error UI, modal key, and keyboard date navigation
affects: [phase-16-calendar-parity, phase-20-native-verification]
actuals:
  tokens: 16783
  tasks: 3
  commits: 6
tech-stack:
  added: []
  patterns:
    - monotonic async range-query generation with last-good presentation retention
    - Monday-first civil grids and source-order-preserving event summaries
key-files:
  created:
    - src/ui/calendar/CalendarWeekRow.tsx
  modified:
    - app/(tabs)/calendar.tsx
    - src/ui/screens/CalendarScreen.tsx
    - src/domains/scheduling/localDate.ts
    - src/domains/history/calendar.ts
    - src/ui/__tests__/CalendarScreen.test.tsx
key-decisions:
  - "Calendar consumes only CalendarReadPort.loadCalendarRange and typed destinations; the 16-03 runtime bridge is an external prerequisite, not a 16-02 deviation."
  - "Refresh and stale failure retain the last successful Calendar panel while a monotonic request generation blocks older results from publishing."
  - "Sport identity and source status remain separate: source titles/IDs/order are preserved while chip borders and fills carry only the approved visual status treatment."
patterns-established:
  - "Use civil LocalDate helpers for month/week navigation; never convert Calendar navigation through JavaScript Date."
  - "Keep a modal-only key and use shared BottomSheet focus restoration instead of an inline Calendar legend."
requirements-completed: [CAL-01, CAL-02, CAL-03, CAL-04, CAL-05, CAL-06, CAL-10, CAL-11, CAL-21]
coverage:
  - id: D1
    description: Source-backed Calendar root retains the Phase 13 event identity and bounded range query.
    requirement: CAL-01
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/CalendarScreen.test.tsx#renders a full source-backed event in its shared Monday-first day cell
        status: pass
    human_judgment: false
  - id: D2
    description: Civil month geometry and source-order-preserving Calendar event transforms.
    requirement: CAL-02
    verification:
      - kind: unit
        ref: npm run test:unit -- --runInBand src/domains/scheduling/localDate.test.ts src/domains/history/calendar.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Persistent Calendar controls, modal key, and truthful retained refresh/error state.
    requirement: CAL-21
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/CalendarScreen.test.tsx#keeps Previous Today Next and the modal-only Calendar key reachable
        status: pass
      - kind: automated_ui
        ref: src/ui/__tests__/CalendarScreen.test.tsx#retains the last good month during refresh and retries the exact failed range
        status: pass
    human_judgment: true
    rationale: Native 360/390 geometry, Light/Dark comparison, text scaling, and focus-ring evidence remain owned by Phase 20 and are not claimed here.
duration: 13min
completed: 2026-10-13
status: complete
---

# Phase 16 Plan 02: Source-backed Calendar Surface Summary

**Revision 18 Calendar now renders typed Phase 13 range facts in a Monday-first civil grid with durable routing, retained query states, and an accessible modal key.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-12T16:36:37Z
- **Completed:** 2026-10-12T16:49:51Z
- **Tasks:** 3/3
- **Files modified:** 9 production/test files plus this summary

## Accomplishments

- Replaced the Calendar route's legacy month projection with the narrow Phase 13 range-read capability and typed destination routing.
- Added Monday-first four/five/six-row civil month arithmetic and event transforms that retain every stable ID and source order.
- Built fixed date/event tracks, source status patterns, persistent Previous/Today/Next controls, a modal-only Calendar key, keyboard movement, and truthful loading/refresh/error retry behavior.

## Task Commits

1. **Task 1: Render one real Phase 13 event through the Calendar root**
   - `086d2c74` — `test(16-02): add source-backed Calendar root coverage`
   - `a6b77f88` — `feat(16-02): render source-backed Calendar event`
2. **Task 2: Complete civil month geometry and identity-preserving event transforms**
   - `be44b4b9` — `test(16-02): specify civil Calendar transforms`
   - `54dd6ed0` — `feat(16-02): add civil Calendar geometry transforms`
3. **Task 3: Finish the key, date/event encoding, navigation, focus, and source-state matrix**
   - `bced79f6` — `test(16-02): specify Calendar controls and retained query states`
   - `83b06123` — `feat(16-02): complete source-backed Calendar states`

## Files Created/Modified

- `.planning/design/v1.2-DEVIATIONS.md` — records owner-approved DEV-01/DEV-02 values while retaining their technical-evidence disposition.
- `app/(tabs)/calendar.tsx` — injects only the query-only range port and routes typed durable destinations.
- `src/domains/scheduling/localDate.ts` and test — civil month clamping and exact Monday-first variable grids.
- `src/domains/history/calendar.ts` and test — source-order-preserving chip presentation and complete day labels.
- `src/ui/calendar/CalendarWeekRow.tsx` — shared source-backed fixed-track date/event cell renderer.
- `src/ui/screens/CalendarScreen.tsx` — persistent controls, key sheet, guarded range lifecycle, and retained source states.
- `src/ui/__tests__/CalendarScreen.test.tsx` — root event, controls/key, retained refresh, error, and retry assertions.

## Decisions Made

- Plan 16-03's merged `loadCalendarRange` delegate (`a9f77bd2`) satisfies the production runtime prerequisite. It was consumed unchanged and is not attributed to this plan.
- The Calendar keeps only last-good immutable query facts visible during an authoritative refresh or stale error; no empty fallback or synthetic workout is introduced.
- Calendar cells enumerate all source events for accessibility even when two fixed visual chips and `+N` constrain the visual track.

## Verification

- PASS — `npm run test:unit -- --runInBand src/domains/scheduling/localDate.test.ts src/domains/history/calendar.test.ts` (47 tests)
- PASS — `npm run test:components -- --runInBand src/ui/__tests__/CalendarScreen.test.tsx` (3 tests)
- PASS — `npm run typecheck`
- PASS — `npm run lint`
- PASS — `npm run check:boundaries`
- PASS — `npm run test:coverage -- --runInBand`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Consume the shared BottomSheet from its actual module export**

- **Found during:** Task 3
- **Issue:** `BottomSheet` is used by the shared component layer but is not re-exported by `src/ui/components/index.ts`; importing it from the barrel produced an invalid React element at runtime.
- **Fix:** Imported the existing Phase 14 `BottomSheet` directly from `src/ui/components/BottomSheet` without changing shared code.
- **Files modified:** `src/ui/screens/CalendarScreen.tsx`
- **Verification:** Calendar component tests, typecheck, lint, and boundary check pass.
- **Committed in:** `83b06123`

---

**Total deviations:** 1 auto-fixed (1 Rule 3 blocking issue)

**Impact on plan:** No scope expansion. The production runtime bridge was supplied by Plan 16-03 as an external satisfied prerequisite; it is not a deviation or 16-02-owned change.

## Known Stubs

None. Empty, loading, refresh, and error UI is connected to the actual range query and does not render fixture or fabricated workout data.

## Threat Surface Scan

No new network endpoint, authentication path, filesystem operation, schema change, or source-mutation capability was introduced. Calendar remains limited to `CalendarReadPort` query reads and typed navigation destinations.

## Next Phase Readiness

- The static source-backed Calendar is ready for downstream destination integration and Phase 20 native/reference evidence.
- DEV-01 and DEV-02 remain `REVIEW_REQUIRED` for their native geometry, appearance, scaling, and focus evidence; this summary does not claim those checks have passed.

## Self-Check: PASSED

All declared source/test artifacts and the six task commits were verified on `agent-phase16-01`; `git diff --check` is clean.

---

*Phase: 16-calendar-parity*
*Completed: 2026-10-13*
