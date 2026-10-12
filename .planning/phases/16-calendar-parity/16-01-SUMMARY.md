---
phase: 16-calendar-parity
plan: 01
subsystem: calendar-ui
tags: [calendar, sqlite, transitions, react-native, coverage]
requires:
  - phase: 13-multi-plan-running-foundation
    provides: bounded typed Calendar facts and stale-safe planned Strength occurrence reads
  - phase: 15-workout-parity
    provides: command-free WorkoutSessionPresentation facts surface
provides:
  - immutable, source-authoritative Calendar event destinations
  - deterministic epoch-fenced Calendar transition state machine
  - approved DEV-01 and DEV-02 downstream design contracts
affects: [16-calendar-parity, phase-20-native-acceptance]
actuals:
  tokens: 12283
  tasks: 3
  commits: 4
tech-stack:
  added: []
  patterns: [narrow-runtime-port, immutable-discriminated-events, distance-only-transition-settling, epoch-fenced-completions]
key-files:
  created:
    - src/ui/calendar/calendarPorts.ts
    - src/ui/calendar/calendarTransitionController.ts
    - src/ui/calendar/calendarPorts.test.ts
    - src/ui/__tests__/CalendarTransitions.test.tsx
  modified:
    - src/platform/sqlite/repositories/trainingCalendarRepository.ts
    - tests/sqlite-host/trainingCalendarRepository.test.ts
    - scripts/run-coverage-gate.mjs
key-decisions:
  - Calendar receives only bounded range reads and the exact null-on-stale Strength occurrence loader.
  - Calendar events carry immutable durable destinations rather than UI-reconstructed routing identifiers.
  - Month settling is inclusive 25% distance-only, with stale completion fencing by transition epoch.
requirements-completed: [CAL-07, CAL-08, CAL-09, CAL-15]
coverage:
  - id: D1
    description: Source-backed Calendar capability seam and deterministic transition controller
    requirement: CAL-07
    verification:
      - kind: unit
        ref: src/ui/calendar/calendarPorts.test.ts and src/ui/__tests__/CalendarTransitions.test.tsx
        status: pass
      - kind: automated_ui
        ref: npm run test:coverage -- --focus-integrity=src/ui/calendar/calendarTransitionController.ts --focus-project=components --runInBand
        status: pass
    human_judgment: false
  - id: D2
    description: DEV-01 adaptive inset and DEV-02 accessible Light Strength title contracts
    requirement: CAL-15
    verification:
      - kind: other
        ref: owner-decisions JSON assertions for DEV-01 and DEV-02
        status: pass
    human_judgment: true
    rationale: Native/device/attended acceptance remains Phase 20-only.
duration: 29 min
completed: 2026-10-13
status: complete
---

# Phase 16 Plan 01: Calendar Transition Foundation Summary

**Calendar now consumes immutable SQLite source facts through a narrow port and applies 25%-threshold, epoch-fenced month and focused-week semantics without mutation authority.**

## Performance

- **Started:** 2026-10-12T15:35:42Z
- **Completed:** 2026-10-12T16:04:53Z
- **Tasks:** 3/3
- **Files modified:** 8

## Accomplishments

- Extended the bounded Calendar snapshot to carry full titles, source labels, sport/status, local date/timezone, and immutable session/occurrence/plan/activity destinations while preserving imported Running match overlay behavior.
- Added a pure Calendar controller with inclusive 25% distance settling, 7dp/1.15 horizontal-intent claim, one-panel clamping, cancellation, ordered adjacent-week semantics, Back priority, reduced-motion equivalence, and stale epoch rejection.
- Registered the controller as integrity-critical and proved 100% statements, branches, functions, and lines through the focused coverage gate.
- Recorded approved DEV-01 adaptive 6–18dp inset and DEV-02 `#9B470B` Light Strength title contracts without treating native acceptance as complete.

## Task Commits

1. **Prerequisite deviation: expand the source-authoritative Calendar range contract** — `76da9c2d` (`feat`)
2. **Task 1: Prove the upstream-to-semantic transition seam with one exact month drag** — `898e670a` (`feat`)
3. **Task 2: Validate and record approved DEV-01** — `7493246d` (`docs`)
4. **Task 3: Validate and record approved DEV-02 and complete this summary** — this commit (`docs`)

## Files Created/Modified

- `src/platform/sqlite/repositories/trainingCalendarRepository.ts` — immutable discriminated Calendar destinations from the existing snapshot rows.
- `tests/sqlite-host/trainingCalendarRepository.test.ts` — all four destination arms, full source facts, immutability, match overlay, and stale identity behavior.
- `src/ui/calendar/calendarPorts.ts` — narrow Phase 13 read aliases and Phase 15 facts-only presenter export.
- `src/ui/calendar/calendarTransitionController.ts` — pure deterministic transition state and motion commands.
- `src/ui/calendar/calendarPorts.test.ts` and `src/ui/__tests__/CalendarTransitions.test.tsx` — capability and full semantic behavior coverage.
- `scripts/run-coverage-gate.mjs` — marks the controller integrity-critical.

## Decisions Made

- Calendar does not receive a repository, SQLite kernel, router, mutation command, current-activation fallback, timer, velocity decision, or worklet dependency.
- Completed/partial Strength opens the durable session, planned Strength the durable occurrence, planned Running its plan/session revision, and imported Running its activity. Missing or stale identities fail closed.
- DEV-01 is owner-approved `adaptive-6-to-18dp`: `min(18, max(0, (safeWidth - 348) / 2))` dp; 6dp at 360 and 18dp at 390 with 2dp gaps.
- DEV-02 is owner-approved `accessible-9b470b`: Light Strength titles `#9B470B`, with `#D97820` retained for border/rail/swatch and Dark treatment unchanged.

## Deviations from Plan

### Implementation Prerequisite

**1. [Rule 3 - Blocking contract gap] Expanded the source-authoritative Calendar range before Task 1.**

- **Found during:** Task 1 precondition check.
- **Issue:** The completed Phase 13 range had stable routing identifiers but lacked untruncated titles, displayable source labels, typed sport/status, and durable discriminated destinations needed by the declared Calendar seam.
- **Fix:** Extended only the existing bounded SQLite snapshot query and its host tests; no table, cache, projection, mutation, UI reconstruction, or activation fallback was added.
- **Files modified:** `src/platform/sqlite/repositories/trainingCalendarRepository.ts`, `tests/sqlite-host/trainingCalendarRepository.test.ts`.
- **Verification:** focused SQLite host test, `npm run typecheck`, and `npm run check:boundaries` passed.
- **Committed in:** `76da9c2d`.

**Impact on plan:** The prerequisite supplied the exact source contract Task 1 was explicitly required to narrow. It remains scoped to the user-authorized read boundary and does not expand Calendar UI or mutation authority.

## Verification

- PASS: `npm run test:sqlite:host -- --runInBand tests/sqlite-host/trainingCalendarRepository.test.ts`.
- PASS: `npm run test:components -- --runInBand src/ui/calendar/calendarPorts.test.ts src/ui/__tests__/CalendarTransitions.test.tsx`.
- PASS: `npm run test:coverage -- --focus-integrity=src/ui/calendar/calendarTransitionController.ts --focus-project=components --runInBand` — 83 suites / 814 tests; controller at 100% statements, branches, functions, and lines.
- PASS: `npm run typecheck`.
- PASS: `npm run check:boundaries`.
- PASS: DEV-01 and DEV-02 JSON approval assertions.
- RUN / BASELINE FAILURE: `npm run test:coverage -- --runInBand` ran all 282 suites / 4,235 tests successfully, but Jest returned non-zero because the repository-wide global coverage baseline was below its configured 90% thresholds (statements 88.27%, lines 89.56%, functions 87.03%). The new integrity-critical controller remained 100%; no unrelated coverage configuration or files were changed.

## Known Stubs

None. The final scan found no placeholder data, skipped tests, or incomplete Calendar behavior in the files changed by this plan.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Downstream Calendar UI may consume immutable source events, route by durable destination, and bind pointer/worklet output only to this controller’s semantic events. Native/device/attended geometry, contrast, and full parity acceptance remain Phase 20-only and are not claimed here.

## Self-Check: PASSED

- Confirmed all eight scoped source, test, coverage, and summary files exist.
- Confirmed prerequisite, Task 1, and Task 2 commits `76da9c2d`, `898e670a`, and `7493246d` are reachable in git history.
