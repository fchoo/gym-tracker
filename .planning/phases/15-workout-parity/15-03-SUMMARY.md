---
phase: 15-workout-parity
plan: "03"
subsystem: workout-ui
tags: [react-native, workout, occurrence, accessibility, tdd]
requires:
  - phase: 13-multi-plan-running-foundation
    provides: selected Strength occurrence and offline start transaction contracts
  - phase: 14-prototype-visual-shell
    provides: tokens, bottom sheet, focus, and root shell primitives
provides:
  - editorial Workout root driven by an exact selected Strength occurrence
  - non-mutating preview selector and explicit truthful rest/start-recovery states
  - keyboard-operable day-preview selector and navigation-only Running context
affects: [15-workout-parity, 16-calendar-parity, workout]
actuals:
  tokens: 7015
  tasks: 3
  commits: 6
tech-stack:
  added: []
  patterns:
    - route starts a selected occurrence envelope directly instead of rediscovering an active plan
    - root previews remain local presentation state until an explicit start command
key-files:
  created:
    - src/ui/components/WorkoutDaySelector.tsx
    - src/ui/__tests__/WorkoutDaySelector.test.tsx
  modified:
    - app/(tabs)/index.tsx
    - src/bootstrap/workoutAppRuntime.tsx
    - src/ui/screens/TodayScreen.tsx
    - src/ui/components/WorkoutStartSheet.tsx
key-decisions:
  - "Selected occurrence identity is handed from Workout root to the runtime start request without a route-side plan rediscovery."
  - "Rest exposes a disabled factual primary and opens alternatives only through an explicit non-mutating control."
  - "Running context exposes View plan and Sync Garmin only; it has no start or recorder command."
requirements-completed: [WRK-01, WRK-02, WRK-03, WRK-04, WRK-05, WRK-06]
coverage:
  - id: D1
    description: Selected Strength occurrence identity, ordered preview, and exact start handoff.
    requirement: WRK-01
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/TodayScreen.test.tsx and app/(tabs)/__tests__/index.test.tsx
        status: pass
    human_judgment: false
  - id: D2
    description: Truthful rest, start failure, alternatives, and Running navigation context.
    requirement: WRK-03
    verification:
      - kind: unit
        ref: src/ui/__tests__/TodayScreen.test.tsx and src/ui/__tests__/foundation.test.tsx
        status: pass
    human_judgment: false
  - id: D3
    description: Day selector keyboard, selected-state, and target geometry contract.
    requirement: WRK-02
    verification:
      - kind: unit
        ref: src/ui/__tests__/WorkoutDaySelector.test.tsx
        status: pass
    human_judgment: false
duration: 32m
completed: 2026-10-10
status: complete
---

# Phase 15 Plan 03: Workout Root Parity Summary

**Workout now presents an editorial, source-backed Strength occurrence with factual preview, exact offline Start, truthful recovery states, and keyboard-operable day selection.**

## Performance

- **Duration:** 32m
- **Started:** 2026-10-10T11:18:53Z
- **Completed:** 2026-10-10T11:50:48Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Rebuilt the scheduled Workout composition around real selected-occurrence identity, local presentation-only preview selection, persisted exercise order, and direct exact-envelope start routing.
- Added factual rest, start-failure, start-alternative, and recovered-session behavior using the approved copy; sheet dismissal is now `Return to Workout`.
- Added a five-item-capable selector with touch, Enter, Space, Arrow, Home, End, selected-state semantics, and 56dp targets; Running remains contextual navigation only.
- Closed the Wave 2 component-gate rest-day regression without allowing a source-less start.

## Task Commits

1. **Task 1: Render and start one real scheduled Workout occurrence** — `71da3aae` (`test`), `4b868a73` (`feat`), `746ce4af` (`fix`)
2. **Task 2: Complete truthful root states, alternatives, and Running context** — `7a925247` (`feat`)
3. **Task 3: Enforce root keyboard, focus, text-scale, and responsive contracts** — `bf478929` (`test`)
4. **Wave 2 component-gate auto-fix: restore source-backed rest-day start** — `a2d92aa` (`fix`)

## Verification

- PASS: focused component suite for `TodayScreen`, `WorkoutDaySelector`, foundation, and Workout route — 4 suites, 84 tests.
- PASS: `npm run lint -- --quiet` and `npm run check:boundaries` (333 files).
- PASS: post-fix `npm run typecheck`, `npm run lint -- --quiet`, and `npm run check:boundaries` (333 files), after Plan 15-01 commits `2384f15a` and `b0315a97` resolved the presenter-fixture typing errors.
- PASS: Wave 2 focused `ScheduleEditor` and `TodayScreen` component suites — 2 suites, 38 tests.
- PASS: Wave 2 Workout root route suites — 2 suites, 8 tests.
- PASS: Wave 2 `npm run typecheck`, `npm run lint -- --quiet`, `npm run check:boundaries` (331 files), and full `npm run test:components -- --runInBand`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Routed selected occurrence identity through the runtime start boundary.**
- **Found during:** Task 1
- **Issue:** The pre-existing route handed only `dayId` to a runtime command that re-read the currently active schedule, allowing a previewed occurrence to be replaced before start.
- **Fix:** Added a narrow `startSelectedStrengthOccurrence` runtime command and passed the saved occurrence envelope from the root route.
- **Files modified:** `src/bootstrap/workoutAppRuntime.tsx`, `app/(tabs)/index.tsx`
- **Verification:** focused route/root tests passed.
- **Committed in:** `4b868a73`

**2. [Rule 1 - Test compatibility] Aligned root accessibility coverage with React Native's `header` role.**
- **Found during:** Task 1 tracer re-run
- **Fix:** Asserted visible editorial identity while preserving the native header semantic.
- **Files modified:** `src/ui/__tests__/TodayScreen.test.tsx`
- **Committed in:** `746ce4af`

**3. [Rule 1 - Correctness] Restored the explicit rest-day start only for a source-backed next plan day.**
- **Found during:** Wave 2 full component gate (`ScheduleEditor` regression).
- **Issue:** The truthful-rest rewrite in `7a925247` unconditionally replaced `Train anyway` with `Choose another day`. Its fixture already supplied a factual `nextDayId` that existed in `planDays`, so the rewrite hid an eligible non-advancing rest-day start rather than exposing a missing-data state.
- **Fix:** Derive rest-day eligibility from the authoritative `planDays` list. An existing next day keeps the explicit `Train anyway` entry point; a missing next day retains disabled `Nothing scheduled` and only the generic alternatives selector. The focused TodayScreen coverage asserts both paths.
- **Files modified:** `src/ui/screens/TodayScreen.tsx`, `src/ui/__tests__/TodayScreen.test.tsx`
- **Verification:** ScheduleEditor, TodayScreen, Workout root route, typecheck, lint, boundaries, and full components passed.
- **Committed in:** `a2d92aa`

## Issues Encountered

None remaining. The earlier Plan 15-01 presenter-fixture typecheck failure was resolved after this plan completed; post-fix typecheck, lint, and boundary verification now pass.

## Next Phase Readiness

The Workout root exposes a stable occurrence/start seam and source-backed truth states for later native acceptance. Full typecheck, lint, and boundary verification are now green.

## Self-Check: PASSED

- Found `src/ui/components/WorkoutDaySelector.tsx` and `src/ui/screens/TodayScreen.tsx`.
- Found task commits `71da3aae`, `4b868a73`, `746ce4af`, `7a925247`, and `bf478929`.
