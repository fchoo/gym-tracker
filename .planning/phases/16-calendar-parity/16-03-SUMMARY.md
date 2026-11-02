---
phase: 16-calendar-parity
plan: "03"
subsystem: ui
tags: [react-native, expo-router, calendar, workout-detail, immutable-facts, sqlite]
requires:
  - phase: 15-workout-parity
    provides: Immutable WorkoutSessionPresentation contract and disclosure-only presentation behavior.
  - phase: 13-multi-plan-running-foundation
    provides: Durable PlannedStrengthOccurrenceDetail reads from the authoritative training foundation port.
  - phase: 16-calendar-parity
    provides: Calendar event sources and range facts from Plan 16-01.
provides:
  - Calendar-origin session history that presents immutable committed and partial Strength facts without management commands.
  - Exact-occurrence planned Strength previews with immutable target sets and truthful missing or retry states.
  - A narrow query-only runtime bridge for existing Calendar source reads.
affects: [calendar, session-management, training-foundation, phase-16-plan-02]
actuals:
  tokens: 12286
  tasks: 3
  commits: 6
tech-stack:
  added: []
  patterns:
    - Discriminated Calendar origin branches construct query-only presentation capability before management props.
    - Planned previews validate immutable occurrence-backed DTOs and fail closed on identity, target, or provenance mismatches.
key-files:
  created:
    - src/ui/calendar/CalendarReadOnlyWorkout.tsx
    - src/ui/screens/PlannedWorkoutDetailScreen.tsx
    - app/calendar/plan/[occurrenceId].tsx
  modified:
    - app/session/[sessionId].tsx
    - src/bootstrap/workoutAppRuntime.tsx
    - src/bootstrap/workoutAppRuntime.test.tsx
    - app/__tests__/session-route.test.tsx
    - app/__tests__/calendar-plan-route.test.tsx
    - src/ui/__tests__/SessionDetailScreen.test.tsx
    - src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx
key-decisions:
  - "Calendar history renders through the Phase 15 immutable presentation contract, while management-origin SessionDetailScreen retains every mutation workflow."
  - "Planned detail is keyed only by the durable occurrence ID and rejects mutable, incomplete, mismatched, or unfrozen payloads instead of fabricating a session."
  - "WorkoutAppRuntime exposes only the existing query-only training-foundation Calendar reads; it delegates without SQL, fact shaping, or mutation authority."
patterns-established:
  - "Calendar read-only adapter: provide only immutable presentation data, Back, and local disclosure state to a Calendar-origin detail view."
  - "Exact occurrence preview: normalize one route string, retain it across retry, and accept only a deeply immutable, target-bearing matching DTO."
requirements-completed: [CAL-18, CAL-19, CAL-20, CAL-22, CAL-23]
coverage:
  - id: D1
    description: Calendar-origin completed and partial session detail remains facts-only while management-origin commands remain reachable.
    requirement: CAL-18
    verification:
      - kind: integration
        ref: app/__tests__/session-route.test.tsx and src/ui/__tests__/SessionDetailScreen.test.tsx
        status: pass
    human_judgment: false
  - id: D2
    description: Planned Strength occurrences render immutable target facts by exact durable occurrence identity with missing and retry states.
    requirement: CAL-20
    verification:
      - kind: integration
        ref: app/__tests__/calendar-plan-route.test.tsx and src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx
        status: pass
    human_judgment: false
  - id: D3
    description: The runtime bridge exposes only source-authoritative Calendar reads and no Calendar mutation capability.
    requirement: CAL-23
    verification:
      - kind: unit
        ref: src/bootstrap/workoutAppRuntime.test.tsx
        status: pass
    human_judgment: false
duration: 20min
completed: 2026-10-13
status: complete
---

# Phase 16 Plan 03: Capability-Safe Calendar Detail Summary

**Calendar opens committed, partial, and planned Strength facts through immutable, identity-safe details while retaining all correction and workout management actions exclusively in their existing management flow.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-10-12T16:12:22Z
- **Completed:** 2026-10-12T16:32:42Z
- **Tasks:** 3/3
- **Files modified:** 10
- **Focused coverage:** 6 component suites / 29 tests and 1 unit suite / 57 tests

## Accomplishments

- Added a Calendar-only history adapter that reuses Phase 15 presentation data but supplies no correction, removal, resume, edit, completion, rest, settings, keyboard, or accessibility mutation capability.
- Split the session route by validated origin before management command props are constructed, preserving the deliberate correction, revision, retry, Resume, and two-step removal workflow outside Calendar.
- Added a durable-occurrence planned Strength route and read-only detail with source-backed target facts, valid Retry behavior, Back focus, and explicit unavailable states.
- Exposed the existing training-foundation Calendar queries through the app runtime as immutable, query-only delegates with focused delegation tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Open one completed Strength session through a query-only Calendar capability** - `ba437d26` (RED coverage), `eb5dcfca` (implementation)
2. **Task 2: Complete partial history, disclosure, Back, and management-separation regressions** - `0de4f201` (regression coverage)
3. **Approved prerequisite: query-only Calendar foundation runtime bridge** - `a9f77bd2` (implementation and focused unit coverage)
4. **Task 3: Deliver the exact planned Strength occurrence preview** - `b1f78bf9` (RED coverage), `27160d9c` (implementation)

## Files Created/Modified

- `src/ui/calendar/CalendarReadOnlyWorkout.tsx` - Immutable Calendar history adapter over the Phase 15 workout presentation.
- `app/session/[sessionId].tsx` - Validated Calendar origin branch separated from management capability construction.
- `src/ui/screens/PlannedWorkoutDetailScreen.tsx` - Source-backed planned Strength target preview with fail-closed ready, missing, and error states.
- `app/calendar/plan/[occurrenceId].tsx` - Exact durable-occurrence Calendar route.
- `src/bootstrap/workoutAppRuntime.tsx` - Query-only delegates to the existing training-foundation Calendar reads.
- `src/bootstrap/workoutAppRuntime.test.tsx` - Delegation coverage for Calendar range and planned-occurrence reads.
- `app/__tests__/session-route.test.tsx` and `src/ui/__tests__/SessionDetailScreen.test.tsx` - Calendar history and management-separation regression coverage.
- `app/__tests__/calendar-plan-route.test.tsx` and `src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx` - Exact occurrence identity and read-only planned preview coverage.

## Decisions Made

- Calendar history takes the immutable presentation path rather than a disabled management screen, so mutation authority is absent structurally rather than hidden visually.
- Planned preview accepts an exact occurrence identity only; it never falls back to an array element, another plan version, a current activation, or a fabricated session.
- The approved runtime bridge uses `createTrainingFoundationRuntimePort(kernel)` as the single source-authoritative delegate, preserving the coordinator-integrated Phase 19 Progress runtime implementation.

## Deviations from Plan

### Approved Prerequisite Deviation

**1. [Rule 3 - Blocking prerequisite] Exposed existing Calendar reads through WorkoutAppRuntime**

- **Found during:** Task 3 (Deliver the exact planned Strength occurrence preview)
- **Issue:** The Phase 13 source-authoritative `TrainingFoundationRuntimePort` already supplied `loadCalendarRange` and `loadPlannedStrengthOccurrence`, but the Calendar route's `WorkoutAppRuntime` facade did not expose either query. Task 3 therefore could not load its required occurrence without bypassing the runtime boundary.
- **Approval and fix:** The owner approved narrow additional ownership of `src/bootstrap/workoutAppRuntime.tsx` and its unit test. The facade now delegates both existing methods through `createTrainingFoundationRuntimePort(kernel)`.
- **Capability boundary:** The bridge adds no SQL, data shaping, session fabrication, mutable return values, or mutation method. It preserves all integrated Phase 19 Progress runtime changes.
- **Files modified:** `src/bootstrap/workoutAppRuntime.tsx`, `src/bootstrap/workoutAppRuntime.test.tsx`
- **Verification:** `npm run test:unit -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx` passed (57 tests); typecheck passed.
- **Committed in:** `a9f77bd2`

---

**Total deviations:** 1 approved prerequisite deviation (Rule 3 blocking runtime bridge).
**Impact on plan:** Necessary to retain the existing authoritative runtime boundary; no scope expansion beyond the two explicitly authorized bridge files.

## Issues Encountered

- The worktree intentionally has no local dependency installation. Focused tests used a temporary symlink to the already-installed sibling workspace dependency directory and removed it after each run.
- A local zsh alias collision prevented a shell cleanup helper from parsing before verification started. The unchanged verification command ran successfully under Bash; no repository file or test result was affected.

## Verification

- `npm run test:components -- --runInBand app/__tests__/session-route.test.tsx src/ui/__tests__/SessionDetailScreen.test.tsx src/ui/__tests__/SessionCorrectionScreen.test.tsx src/ui/__tests__/RemovedSessionsScreen.test.tsx app/__tests__/calendar-plan-route.test.tsx src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx` — passed: 6 suites, 29 tests.
- `npm run test:unit -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx` — passed: 1 suite, 57 tests.
- `npm run typecheck` — passed.
- `npm run lint` — passed: boundary check over 410 files.
- `npm run check:boundaries` — passed: boundary check over 410 files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Calendar can now inspect completed, partial, and planned Strength details without acquiring mutation authority.
- Phase 16 Plan 02 can retain its separate Calendar surface work; this plan changed no Plan 16-02 file.
- No stubs, new trust-boundary surfaces, or unrun verification remain.

---

*Phase: 16-calendar-parity*
*Completed: 2026-10-13*

## Self-Check: PASSED

- Confirmed all declared Calendar detail, planned-preview, and approved runtime-bridge files exist.
- Confirmed all six task commits exist in the repository history.
