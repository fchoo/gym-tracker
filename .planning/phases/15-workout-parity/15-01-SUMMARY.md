---
phase: 15-workout-parity
plan: "01"
subsystem: workout-ui
tags: [react-native, expo-router, workout, presentation, selected-occurrence, tdd]
requires:
  - phase: 13-multi-plan-running-foundation
    provides: selected Strength occurrence identity and authoritative start/recovery contracts
  - phase: 14-prototype-visual-shell
    provides: semantic tokens, focusable controls, and shell presentation contracts
provides:
  - owning Workout return routing with exact-session Active retry
  - immutable command-free workout facts projection and disclosure presenter
  - SessionDetail-compatible facts-only reuse seam for Phase 16
affects: [15-workout-parity, 16-calendar-parity, workout, active-workout]
actuals:
  tokens: 9337
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns:
    - authoritative live and historical session facts map through a command-free presentation model
    - Active retains mutations, rest, retry, timing, focus, and navigation while shared UI owns disclosure only
key-files:
  created:
    - src/domains/workout/workoutPresentation.ts
    - src/ui/components/WorkoutSessionPresentation.tsx
    - src/ui/components/WorkoutSetFactsRow.tsx
    - src/ui/__tests__/WorkoutSessionPresentation.test.tsx
  modified:
    - app/(tabs)/index.tsx
    - app/workout/[sessionId].tsx
    - src/ui/screens/ActiveWorkoutScreen.tsx
    - app/__tests__/workout-route.test.tsx
key-decisions:
  - "Routes carry the owning Workout return context instead of rediscovering a plan or day after Active opens."
  - "WorkoutSessionPresentation exposes immutable facts and local disclosure only; Active supplies capability-owning composition separately."
  - "Historical SessionDetail projections use the same facts model with no active-exercise capability."
patterns-established:
  - "Facts presenter: map authoritative domain records in workoutPresentation.ts, then pass only immutable presentation facts to reusable UI."
  - "Route recovery: retry the same session ID in place and return through an explicit owning-context route parameter."
requirements-completed: [WRK-01, WRK-05, WRK-07, WRK-08, WRK-09, WRK-10, WRK-11]
coverage:
  - id: D1
    description: Exact selected session routing, retry, and owning Workout return context.
    requirement: WRK-01
    verification:
      - kind: automated_ui
        ref: app/(tabs)/__tests__/index.test.tsx and app/__tests__/workout-route.test.tsx
        status: pass
      - kind: integration
        ref: tests/integration/today-schedule-workout.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Active renders immutable facts through one disclosure presenter with the sole 4dp active edge and current-row state.
    requirement: WRK-07
    verification:
      - kind: unit
        ref: src/ui/__tests__/WorkoutSessionPresentation.test.tsx and src/ui/__tests__/ActiveWorkoutScreen.test.tsx
        status: pass
    human_judgment: false
  - id: D3
    description: Phase 16 can consume historical SessionDetail facts without mutation, runtime, repository, or route capability.
    requirement: WRK-11
    verification:
      - kind: unit
        ref: src/ui/__tests__/WorkoutSessionPresentation.test.tsx#maps a planned session detail and keeps its public presentation boundary command-free
        status: pass
      - kind: other
        ref: npm run check:boundaries
        status: pass
    human_judgment: false
duration: 8m
completed: 2026-10-10
status: complete
---

# Phase 15 Plan 01: Workout Occurrence and Facts Presenter Summary

**Selected Workout occurrences now retain their owning return context through Active retry and recovery, while Active and Phase 16 share a command-free immutable workout facts presenter.**

## Performance

- **Duration:** 8m
- **Started:** 2026-10-10T11:18:53Z
- **Completed:** 2026-10-10T11:26:38Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Routed start and resume navigation through the exact authoritative session ID with an explicit owning Workout return context; Active read failures retry the same session without stale replacement facts.
- Added `WorkoutPresentationModel`, a live-session adapter, and `WorkoutSessionPresentation` / `WorkoutSetFactsRow` for immutable identity, progress, exercise, warm-up, working-set, previous, target, result, and state facts.
- Kept all Active mutation, retry, rest, timing, focus/scroll, editor, and outcome authority in the existing controller while the presenter owns only disclosure and fact rendering.
- Proved that a planned or historical `SessionDetail` maps to the same facts model without runtime, repository, route, or mutation capability; Back and unmount issue no workout command.

## Task Commits

1. **Task 1: Trace one selected occurrence from Workout through Active and recovery** — `14f656b8` (`feat`)
2. **Task 2: Extract immutable Active facts presentation without changing source authority** — `8386fddb` (`feat`)
3. **Task 3: Prove the Phase 16 facts-only capability boundary and navigation safety** — `36a6f8a7` (`test`)

## Files Created/Modified

- `app/(tabs)/index.tsx` and `app/workout/[sessionId].tsx` — carry owning return context and recover the same authoritative session in place.
- `app/__tests__/workout-route.test.tsx` — protects exact retry, owning return, Back, and no-command unmount behavior.
- `src/domains/workout/workoutPresentation.ts` — maps live Active and historical SessionDetail facts into immutable presentation records.
- `src/ui/components/WorkoutSessionPresentation.tsx` and `WorkoutSetFactsRow.tsx` — command-free disclosure and factual set-table rendering.
- `src/ui/screens/ActiveWorkoutScreen.tsx` — composes controller-owned commands beneath the shared facts presenter.
- `src/ui/__tests__/WorkoutSessionPresentation.test.tsx` — covers the facts adapter, 4dp edge/disclosure, and Phase 16 boundary.

## Decisions Made

- Active routing returns to the owning Workout root only when that explicit context was supplied; it never discovers a substitute current plan/day.
- The shared presenter has no mutation, rest, resume, correction, removal, schedule, outcome, write-back, runtime, repository, or navigation surface.
- Active passes any capability-owning composition separately, preserving source authority and the read-only Phase 16 seam.

## Verification

- PASS: `npm run test:components -- --runInBand 'app/(tabs)/__tests__/index.test.tsx' app/__tests__/workout-route.test.tsx src/ui/__tests__/WorkoutSessionPresentation.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx` — 4 suites, 86 tests.
- PASS: `npm run test:integration -- --runInBand tests/integration/today-schedule-workout.test.ts` — 19 tests.
- PASS: `npm run typecheck`.
- PASS: `npm run lint`.
- PASS: `npm run check:boundaries` — 332 files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test type correctness] Typed route-test mocks and full Active fixture boundaries.**

- **Found during:** Task 2 verification.
- **Issue:** The newly checkpointed route test inferred its async mocks as `never`, causing the required full TypeScript verification to fail.
- **Fix:** Declared the route mock return contracts and cast only the intentionally partial route fixture at its test boundary.
- **Files modified:** `app/__tests__/workout-route.test.tsx`.
- **Verification:** `npm run typecheck` and focused route tests passed.
- **Committed in:** `8386fddb`.

**Total deviations:** 1 auto-fixed (Rule 1).

## TDD Gate Compliance

- The checkpointed Task 1 work arrived already implemented and uncommitted; its focused test and integration verification passed before its atomic feature commit.
- Tasks 2 and 3 added executable coverage with their implementation/boundary commits. Separate RED commits were not possible for the inherited checkpointed slice, so this plan does not contain a distinct `test(...)` commit before every feature change.

## Known Stubs

None. The scan found only intentional nullable domain facts and controller state, with no placeholder UI data, skipped tests, TODO/FIXME markers, or unrun required verification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 16 can consume `presentSessionDetail` and `WorkoutSessionPresentation` for read-only Active-shaped detail without receiving any Active command capability. No blocker remains.

## Self-Check: PASSED

- Confirmed the four created presentation/test files and six modified route/controller files exist.
- Confirmed task commits `14f656b8`, `8386fddb`, and `36a6f8a7` are reachable in git history.
