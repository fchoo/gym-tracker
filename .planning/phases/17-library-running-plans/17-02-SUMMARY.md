---
phase: 17-library-running-plans
plan: "02"
subsystem: library-root-and-plan-chooser
tags: [react-native, expo-router, sqlite, library, running, accessibility]
requires:
  - phase: 17-library-running-plans
    provides: inactive Running creation and dedicated Strength create route
  - phase: 14-prototype-visual-shell
    provides: shared focus-restoring BottomSheet and root shell primitives
provides:
  - neutral Strength/Running plan-kind chooser with no entry mutation
  - batched Library snapshot projection with independent active Strength and Running rows
  - source-backed Library empty, no-match, action, update, and recovery states
affects: [library, strength-authoring, running-authoring, exercise-library]
tech-stack:
  added: []
  patterns:
    - thin Expo routes inject navigation only while screens own presentation state
    - source snapshot exposes active plans as a per-sport collection and rejects invalid duplicates
    - Library sheets retain focus restoration while route callbacks retain mutation authority
key-files:
  created: [src/ui/screens/PlanTypeChooserScreen.tsx, src/ui/__tests__/PlanTypeChooserScreen.test.tsx]
  modified: [app/library/plan/create.tsx, app/(tabs)/__tests__/library.test.tsx, src/bootstrap/workoutAppRuntime.tsx, src/ui/screens/LibraryScreen.tsx, src/ui/__tests__/LibraryScreen.test.tsx]
key-decisions:
  - "Create-plan navigation is neutral: only an explicit chooser choice enters Strength or Running authoring, and neither transition can activate a plan."
  - "The Library runtime returns a sport-aware active collection from one batched snapshot; duplicate active rows for one sport fail closed instead of being hidden."
  - "True empty is determined from the new authoritative active collection plus persisted owned plans, while legacy test snapshots remain backwards-compatible during the migration."
requirements-completed: [LIB-01, LIB-02, LIB-03, LIB-04, LIB-05, LIB-06, LIB-07, LIB-23]
actuals:
  tokens: 4623
  tasks: 3
  commits: 3
metrics:
  duration: 7m
  completed: 2026-10-11
status: complete
---

# Phase 17 Plan 02: Library Root and Neutral Plan Chooser Summary

**A remembered, source-backed Library root with neutral plan creation, sport-aware active plans, and recoverable action/update states.**

## Accomplishments

- Replaced the former Strength-editor create wrapper with a navigation-only chooser that presents equal unselected `Strength` and `Running` choices, routes to their dedicated create screens only after selection, and states the no-activation/Garmin boundary.
- Extended the batched Library runtime projection to carry stable sport identity and both active plan rows; invalid duplicate active rows for one sport now fail closed instead of being silently collapsed.
- Preserved independent Plans and Exercises search, filter, favorite, selection, scroll, refresh, and content-update state while adding true-empty Plans, exact no-match copy, a focus-restoring Actions sheet, and an inert accessible Import plan/Later action.

## Task Commits

1. **Task 1: Route every Create plan entry through the neutral chooser** — `d330c46c` `feat(17-02): route plan creation through neutral chooser`
2. **Task 2: Render complete plan and exercise groups from one coherent snapshot** — `11cf5575` `feat(17-02): project active plans per sport`
3. **Task 3: Complete Library actions, true-empty, refresh, and content-update recovery states** — `d051afad` `feat(17-02): complete Library recovery states`

## Verification

- PASS: `npm run test:components -- --runInBand src/ui/__tests__/PlanTypeChooserScreen.test.tsx "app/(tabs)/__tests__/library.test.tsx"`
- PASS: `npm run test:components -- --runInBand src/ui/__tests__/LibraryScreen.test.tsx "app/(tabs)/__tests__/library.test.tsx"`
- PASS: `npm run test:components -- --runInBand src/ui/__tests__/LibraryScreen.test.tsx`
- PASS: combined focused component suites — 38 tests.
- PASS: `npm run test:unit -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx` — 53 tests.
- PASS: `npm run test:integration -- --runInBand tests/integration/multi-plan-foundation-tracer.test.ts` — 8 tests.
- PASS: `npm run typecheck`, `npm run lint`, and `npm run check:boundaries`.

## Decisions Made

- The shared chooser is deliberately command-free. Saving within either downstream authoring route creates an inactive plan; activation remains a separate reviewed flow.
- Runtime projection, rather than Library UI code, owns MAP-01 cardinality validation and sport identity so the screen never performs SQL or fabricates a Running-specific state store.
- The Actions sheet only presents route choices. Import stays locally inert and labelled unavailable/Later until an approved import workflow exists.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added a source-level per-sport active collection to the Library snapshot.**
- **Found during:** Task 2
- **Issue:** The existing snapshot exposed only one legacy `active` scalar, which could hide an active Running plan when Strength was also active, violating MAP-01 display requirements.
- **Fix:** Added source-backed active-plan collection and sport identity at `workoutAppRuntime`, retaining the legacy scalar for compatible callers; duplicate active identities for the same sport now fail closed.
- **Files modified:** `src/bootstrap/workoutAppRuntime.tsx`, `src/ui/screens/LibraryScreen.tsx`, `src/ui/__tests__/LibraryScreen.test.tsx`.
- **Commit:** `11cf5575`.

## Known Stubs

None. The changed Library, chooser, runtime, and focused tests contain no plan-blocking placeholders, skipped tests, or unrun required verification.

## Self-Check: PASSED

- Confirmed the chooser route, chooser screen, Library screen, runtime projection, and this Summary exist.
- Confirmed task commits `d330c46c`, `11cf5575`, and `d051afad` are reachable in Git history.

