---
phase: 07-post-candidate-ux-refinement
plan: 04
subsystem: ui
tags: [expo, react-native, active-workout, rest-countdown, accessibility]
requires:
  - phase: 07-02
    provides: trusted active-workout removal runtime ports
  - phase: 07-07
    provides: hook-shaped Expo rest countdown cue adapter
provides:
  - Responsive active-workout SetRow controls with committed removal confirmation
  - Foreground-only rest countdown cue observer with bounded playback failure notice
affects: [active-workout, rest-alerts, route-boundaries]
actuals:
  tokens: 13411
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns:
    - Route-safe bootstrap composition for platform-backed hook ports
    - Commit-gated destructive row removal with authoritative refresh
    - Foreground-only exact-threshold audio cue ledger
key-files:
  created:
    - src/bootstrap/restCountdownCue.ts
    - src/ui/__tests__/SetRow.test.tsx
  modified:
    - src/ui/screens/ActiveWorkoutScreen.tsx
    - src/ui/components/SetRow.tsx
    - src/ui/components/RestDock.tsx
    - app/workout/[sessionId].tsx
key-decisions:
  - "Removal applies only the ActiveWorkoutView returned by the trusted runtime port."
  - "Routes consume rest audio through bootstrap composition rather than importing platform modules."
  - "Cue playback failures reject to RestDock, where they become a bounded non-authoritative notice."
requirements-completed: [UX-15, UX-16, UX-17, UX-18, UX-19, UX-21]
coverage:
  - id: D1
    description: Quiet active-workout hierarchy and More sheet retain only approved actions.
    requirement: UX-15
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx
        status: pass
    human_judgment: false
  - id: D2
    description: Editable rows render Reset, Done, and Remove with commit-gated destructive confirmation.
    requirement: UX-16
    verification:
      - kind: automated_ui
        ref: npm run test:components -- --runInBand src/ui/__tests__/SetRow.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx
        status: pass
    human_judgment: false
  - id: D3
    description: Foreground rest countdown audio remains an observer and reports one bounded playback failure notice.
    requirement: UX-21
    verification:
      - kind: automated_ui
        ref: npm run test:components -- --runInBand src/ui/__tests__/RestDock.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx
        status: pass
      - kind: other
        ref: npm run typecheck && npm run check:boundaries
        status: pass
    human_judgment: false
duration: 42min
completed: 2026-09-06
status: complete
---

# Phase 07 Plan 04: Active Workout Removal and Countdown Cue Summary

**Responsive active-workout removal, exact confirmation/focus recovery, and foreground-only rest countdown cues backed by route-safe Expo audio composition.**

## Performance

- **Duration:** 42 min
- **Completed:** 2026-09-06
- **Tasks:** 3/3
- **Files modified:** 10

## Accomplishments

- Preserved the quiet header, section add controls, and constrained More sheet from Task 1.
- Replaced active-row Skip affordances with ordered Reset, Done, and Remove controls; removal waits for a trusted returned view before updating the screen.
- Added exact destructive removal copy, cancel/failure focus recovery, committed success announcements, and no completed-row removal affordance.
- Added AppState- and preference-gated countdown cues at exact 3/2/1/0 transitions without rest command access, mutation, duplicate, or backfill behaviour.
- Added a bootstrap composition hook so the route remains isolated from platform audio modules.

## Task Commits

1. **Task 1: Finish the quiet header sections and More sheet** — `74dbf62` (`feat`)
2. **Task 2: Integrate confirmed removal in a responsive SetRow** — `1e9434d` (`feat`)
3. **Task 3: Wire once-only foreground audio without rest authority** — `50a93cd` (`feat`)

## Files Created/Modified

- `src/ui/components/SetRow.tsx` — ordered, wrapping active-row action band and Remove glyph.
- `src/ui/screens/ActiveWorkoutScreen.tsx` — confirmation ownership, canonical removal request, authoritative refresh, focus routing, and RestDock injection.
- `src/ui/components/RestDock.tsx` — foreground/preference-gated threshold ledger and bounded audio failure notice.
- `src/bootstrap/restCountdownCue.ts` — route-safe composition boundary around Expo audio.
- `src/platform/audio/expoRestCountdownCueAdapter.ts` — propagates playback failures to its observer.
- `app/workout/[sessionId].tsx` — passes persisted sound preference and bootstrap-composed cue port.
- `src/ui/__tests__/SetRow.test.tsx` and `src/ui/__tests__/ActiveWorkoutScreen.test.tsx` — removal layout and commit-gated UI coverage.

## Decisions Made

- The active screen is the sole `ConfirmationSheet` owner so confirmation copy, busy state, failure recovery, announcements, and focus stay at the UI/runtime boundary.
- The removal request SHA-256 is calculated over stable sorted JSON before the trusted remove port is invoked.
- A route-safe bootstrap hook composes the native audio adapter; routes do not import `src/platform` modules.
- Audio errors are deliberately propagated by the adapter and caught by RestDock, preserving rest timer and notification authority.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Boundary bug] Routed countdown audio through bootstrap composition**
- **Found during:** Task 3
- **Issue:** The direct route import of `src/platform/audio` failed `npm run check:boundaries`.
- **Fix:** Added `src/bootstrap/restCountdownCue.ts` as the approved composition boundary and changed the route to import only that bootstrap hook.
- **Files modified:** `src/bootstrap/restCountdownCue.ts`, `app/workout/[sessionId].tsx`
- **Verification:** 42 focused component tests, typecheck, and boundary check pass.
- **Committed in:** `50a93cd`

**2. [Rule 1 - Feedback bug] Propagated cue playback failures to the UI observer**
- **Found during:** Task 3
- **Issue:** The native adapter swallowed playback failures, preventing the required bounded `Countdown sound unavailable` notice.
- **Fix:** Preserved non-authoritative playback by allowing the cue promise to reject and catching it only in RestDock.
- **Files modified:** `src/platform/audio/expoRestCountdownCueAdapter.ts`, `src/ui/components/RestDock.tsx`
- **Verification:** focused component tests and adapter test pass.
- **Committed in:** `50a93cd`

**Total deviations:** 2 auto-fixed (2 Rule 1)

## Verification

- `npm run test:components -- --runInBand src/ui/__tests__/SetRow.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx` — passed, 41 tests.
- `npm run test:components -- --runInBand src/ui/__tests__/RestDock.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx` — passed, 42 tests.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run check:boundaries` — passed (232 files).
- `git diff --check` — passed.

## Known Stubs

None.

## Next Phase Readiness

The active workout UI has committed removal and foreground countdown cue wiring. Physical audio and 200% text evidence remain owned by the planned Phase 07 device-evidence work.

## Self-Check: PASSED

- Confirmed all listed implementation, test, bootstrap, route, and summary files exist.
- Confirmed Task 1 (`74dbf62`), Task 2 (`1e9434d`), and Task 3 (`50a93cd`) commits exist in git history.
