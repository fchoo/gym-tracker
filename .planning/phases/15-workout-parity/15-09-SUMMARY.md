---
phase: 15-workout-parity
plan: "09"
subsystem: workout-ui
tags: [active-workout, metric-history, trend, accessibility, plan-editor]
requires:
  - phase: 15-workout-parity
    provides: Active Workout editing, durable outcome commands, and the Phase 14 sheet/focus contract from Plans 15-01 through 15-08
provides:
  - factual metric-profile-aware six-session Active Workout trend sheet
  - independent trend/menu action targets with an exact three-action exercise overflow
  - deferred owned-plan editor navigation after an active-session boundary
affects: [15-10, workout-ui, exercise-history, owned-plan-editor]
actuals:
  tokens: 4219
  tasks: 2
  commits: 5
tech-stack:
  added: []
  patterns: [comparator-ranked trend projection, session-scoped deferred route intent, independent semantic header actions]
key-files:
  created: [src/ui/components/ExerciseTrendSheet.tsx]
  modified: [src/domains/history/metricHistory.ts, src/ui/screens/ActiveWorkoutScreen.tsx, app/workout/[sessionId].tsx, src/platform/sqlite/repositories/workoutRepository.ts]
key-decisions:
  - "Active trend chooses one durable result per compatible completed session, bounded to the newest six sessions."
  - "Deferred plan editing retains the session's SQLite plan identity and transitions only after Finish later or an authoritative outcome."
  - "Exercise overflow is intentionally limited to Timing, Replace exercise, and Delete exercise; trend remains its own target."
patterns-established:
  - "Metric chart positions are derived from the registered metric comparator and are accompanied by exact written rows."
  - "Route-level deferred navigation clears when the active session identity changes."
requirements-completed: [WRK-24, WRK-25, WRK-28]
coverage:
  - id: D1
    description: Comparable completed working evidence is projected as a factual, accessible six-session exercise trend.
    requirement: WRK-24
    verification:
      - kind: unit
        ref: npm run test:unit -- --runInBand src/domains/history/metricHistory.test.ts
        status: pass
      - kind: automated_ui
        ref: npm run test:components -- --runInBand src/ui/__tests__/ExerciseTrendSheet.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx
        status: pass
    human_judgment: false
  - id: D2
    description: Active keeps Trend separate while its exercise overflow exposes only Timing, Replace exercise, and Delete exercise.
    requirement: WRK-25
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#keeps the exercise overflow to Timing Replace exercise and Delete exercise
        status: pass
    human_judgment: false
  - id: D3
    description: A plan edit records the source session's owning plan and opens its real editor only after the active-session boundary.
    requirement: WRK-28
    verification:
      - kind: automated_ui
        ref: app/__tests__/workout-route.test.tsx#defers editing the owning plan until Finish workout later returns from Active
        status: pass
    human_judgment: false
duration: 13m
completed: 2026-10-10
status: complete
---

# Phase 15 Plan 09: Active Secondary Actions and Factual Trend Summary

**Comparator-ranked, metric-profile-aware exercise trends with separate header actions and source-identity-safe post-workout plan editing.**

## Accomplishments

- Added a pure history projection that accepts only completed comparable working evidence, selects one result per session, and caps Active's trend to six newest sessions.
- Added an accessible Phase 14 trend sheet with Recent, Best, Change, comparator-ranked SVG points, exact data rows, and an explicit no-history state that leaves the workout unchanged.
- Separated the Active targets: Trend is its own header action; the exercise menu contains exactly Timing, Replace exercise, and Delete exercise.
- Preserved immutable history and active-session safety by retaining the session's SQLite plan identity and opening the existing owned-plan editor only after Finish later or a saved outcome.

## Task Commits

1. Task 1 — `17062a9`, `65f8230` — RED/GREEN factual comparable trend specification and implementation.
2. Task 2 — `6474ee7`, `c3f9b68` — RED/GREEN exact action separation and deferred plan-editor routing.
3. Follow-up — `08b117a` — comparator-ranked chart facts and exact semantic action labels.

## Verification

- PASS: `npm run test:unit -- --runInBand src/domains/history/metricHistory.test.ts` (4 tests).
- PASS: `npm run test:components -- --runInBand src/ui/__tests__/ExerciseTrendSheet.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx app/__tests__/workout-route.test.tsx` (17 tests).
- PASS: `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, and `git diff --check`.
- PASS: focused `app/` and `src/ui/` retirement scan found no cadence, cluster, rest-between-reps, or advanced-timing UI controls.
- Intentionally not run: global suite and native matrix, per the requested targeted checkpoint scope.

## Files Created/Modified

- `src/domains/history/metricHistory.ts` — six-session compatible projection without cross-profile/string comparison.
- `src/ui/components/ExerciseTrendSheet.tsx` — Phase 14 modal trend presentation, written facts, comparator-ranked SVG, and data rows.
- `src/ui/screens/ActiveWorkoutScreen.tsx` — separate trend/menu actions, exact exercise overflow, timing fact sheet, and post-workout edit request.
- `app/workout/[sessionId].tsx` — narrow history loader plus deferred route transition to the existing owned-plan editor.
- `src/domains/workout/activeWorkout.ts` and `src/platform/sqlite/repositories/workoutRepository.ts` — stable source-plan identity in the active session view.

## Decisions Made

- Reused the registered metric comparator to rank SVG points rather than comparing formatted display strings or inventing a cross-profile scale.
- Retained a single selected session's source plan ID in the route and clear it on session change, preventing any deferred navigation from guessing or crossing plan ownership.
- Kept Timing flat and limited to ordinary between-set rest facts; no retired cadence, cluster, nested timing, or cue controls were reintroduced.

## Deviations from Plan

### Auto-fixed Issues

1. [Rule 2 - Missing critical functionality] Added stable active-session plan identity for deferred editor navigation.
- **Found during:** Task 2.
- **Issue:** The existing active-session view omitted `planId`, so routing after the boundary would have had to infer ownership from presentation state.
- **Fix:** Selected the existing SQLite `plan_id`, carried it through `ActiveWorkoutView`, and cleared a deferred intent when the session changes.
- **Files modified:** `src/domains/workout/activeWorkout.ts`, `src/platform/sqlite/repositories/workoutRepository.ts`, `app/workout/[sessionId].tsx`.
- **Verification:** route deferral component test, typecheck, lint, and boundaries pass.
- **Committed in:** `c3f9b68`.

2. [Rule 1 - Bug] Corrected semantic target labels and comparator-ranked chart rendering.
- **Found during:** Task 2 verification.
- **Issue:** The first implementation used non-canonical action labels and rendered trend points on a shared baseline instead of reflecting the registered metric comparison.
- **Fix:** Restored the exact independent labels and use the metric comparator to position each recorded point, while keeping written facts authoritative.
- **Files modified:** `src/ui/components/ExerciseTrendSheet.tsx`, `src/ui/screens/ActiveWorkoutScreen.tsx`, associated component tests.
- **Verification:** targeted unit/component tests and typecheck pass.
- **Committed in:** `08b117a`.

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 2). Both changes enforce the plan's truth and ownership boundaries without expanding product scope.

## Known Stubs

None.

## Issues Encountered

- The historical global GStack design and engineering-test paths named by the project rule are not present in this workspace host. The checked-in Phase 15 context, UI specification, requirements, design matrix, and completed-plan summaries supplied the applicable source contract.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The Active surface now has factual trend and safe secondary-action contracts ready for subsequent Workout parity work. Existing Phase 14 evidence changes and the untracked `14-VERIFICATION.md` remain preserved and outside this plan's commits.

## Self-Check: PASSED

- Confirmed all five task commits (`17062a9`, `65f8230`, `6474ee7`, `c3f9b68`, and `08b117a`) exist.
- Confirmed every listed implementation and test artifact exists.
- Confirmed no plan stub, skipped test, unrun targeted verification, new network boundary, auth path, file-access boundary, or schema trust-boundary change was introduced.
