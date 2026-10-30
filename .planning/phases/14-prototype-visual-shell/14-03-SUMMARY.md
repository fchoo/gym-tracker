---
phase: 14-prototype-visual-shell
plan: "03"
subsystem: ui-navigation
tags: [expo-router, tabs, accessibility, focus, adaptive-layout]
requires:
  - phase: 14-prototype-visual-shell
    provides: shared typography, startup readiness, and all-width bottom-navigation baseline
provides:
  - One four-item bottom root navigation composition at every supported width and 200% text scale.
  - A non-remounting root-shell focus/origin seam and stable row-ref forwarding.
affects: [14-04, 14-05, 14-06, 14-07, 14-08]
tech-stack:
  added: []
  patterns: [navigator-owned root selection, screen-owned state, focus-origin fallback]
key-files:
  created: [src/ui/shell/AppRootShell.tsx, src/ui/shell/AppRootShell.test.tsx]
  modified: [app/(tabs)/_layout.tsx, src/ui/components/index.ts, src/ui/components/NavigationRow.tsx]
decisions:
  - "Workout, Calendar, Library, and Progress are the sole root destinations in a single bottom composition."
  - "AppRootShell coordinates focus/origin only; Expo Tabs remains the route/history authority and feature screens retain local state."
metrics:
  duration: 42m
  completed: 2026-10-09
status: complete
actuals:
  tokens: 5992
  tasks: 2
  commits: 5
---

# Phase 14 Plan 03: Four-Root Navigation and Focus Shell Summary

**The app now exposes one fixed bottom navigation with Workout, Calendar, Library, and Progress at every width, with stable focus-restoration seams that do not duplicate navigation or screen state.**

## Accomplishments

- Removed the obsolete rail and 200%-text two-row root-navigation branches while retaining Expo Tabs route keys, history behavior, tabPress prevention, startup disabling, and mounted screen ownership.
- Added `AppRootShell` as a wrapper—not a route store—with semantic heading, origin-trigger, and root-heading fallback focus coordination.
- Made `NavigationRow` forward a stable native ref while preserving full-row semantics, disabled/busy behavior, wrapping copy, and decorative chevron treatment.
- Updated attended-preview coverage to assert the approved Workout root label.

## Task Commits

1. Task 1 RED — `b5bfde20` test(14-03): add failing root shell navigation tests
2. Task 1 GREEN — `03f97492` feat(14-03): deliver stable four-root shell
3. Task 2 RED — `45dfd46f` test(14-03): add failing focus restoration tests
4. Task 2 GREEN — `09b17302` feat(14-03): restore root and deep-route focus
5. Rule 1 regression correction — `c260c9a6` fix(14-03): align attended preview root label

## Verification

- PASS: 60 focused shell/component tests, including all required widths, 200% text, selection, focus/origin, `NavigationRow`, and `AdaptiveScreen` coverage.
- PASS: `npm run typecheck`
- PASS: `npm run check:boundaries`
- PASS: attended-preview regression suite (59 tests).
- Full `npm run test:all` began successfully: the complete unit suite passed (112 suites / 1,957 tests), then component execution revealed the obsolete attended-preview `Today` assertion. The assertion was corrected and its dedicated suite passed. The execution environment terminated repeated full-suite commands at its 30-second output limit before a final combined all-suite completion signal; focused and direct regression checks are recorded above.

## Deviations from Plan

### Auto-fixed Issues

1. [Rule 1 - Bug] Updated the attended-preview assertion from the retired Today root label to Workout.
   - Found during: plan-level full component verification.
   - Commit: `c260c9a6`.

## Self-Check: PASSED

- All ten created or modified source and test files exist.
- All five task and correction commits are present in git history.
