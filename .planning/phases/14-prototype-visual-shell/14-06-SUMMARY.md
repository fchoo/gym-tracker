---
phase: 14-prototype-visual-shell
plan: "06"
subsystem: ui-settings
tags: [react-native, expo-router, bottom-sheet, appearance, accessibility, tdd]
requires:
  - phase: 14-prototype-visual-shell
    provides: shared BottomSheet, root focus shell, and AppearanceProvider
provides:
  - One router-independent App Settings content tree for root-sheet and direct-route presentation.
  - Preserved authoritative rest-alert preference controls and recovery-route reachability.
affects: [14-07, 14-08, settings, recovery, phase-15]
tech-stack:
  added: []
  patterns: [router-independent settings content, host-owned sheet dismissal before navigation, shared presentation with caller-owned preference writes]
key-files:
  created: []
  modified: [app/(tabs)/_layout.tsx, app/more/index.tsx, src/ui/screens/SettingsScreen.tsx, src/ui/shell/AppRootShell.tsx, src/ui/components/RestAlertSettingsSheet.tsx, src/ui/components/BottomSheet.tsx]
key-decisions:
  - "AppSettingsContent owns ordered settings presentation but never router, runtime, or appearance-provider state."
  - "A root sheet closes before recovery navigation; the direct route retains its normal Back wrapper."
  - "RestAlertSettingsSheet retains its serialized optimistic write/readback queue while BottomSheet owns frame and dismissal mechanics."
requirements-completed: [SHL-03, SHL-08, SHL-09]
coverage:
  - id: D1
    description: Shared App Settings content is available from the root sheet and direct route with synchronized appearance selection.
    requirement: SHL-03
    verification:
      - kind: unit
        ref: src/ui/__tests__/SettingsScreen.test.tsx; src/ui/shell/AppRootShell.test.tsx
        status: pass
      - kind: other
        ref: npm run typecheck && npm run check:boundaries
        status: pass
    human_judgment: false
  - id: D2
    description: Device-level rest-alert controls retain loading, save rollback, permission, and notification-settings behavior in the shared sheet.
    requirement: SHL-08
    verification:
      - kind: unit
        ref: src/ui/__tests__/RestAlertSettingsSheet.test.tsx
        status: pass
    human_judgment: false
  - id: D3
    description: Removed sessions and Data and recovery remain reachable from each settings presentation without retaining an obsolete sheet.
    requirement: SHL-09
    verification:
      - kind: unit
        ref: app/more/__tests__/index.test.tsx; src/ui/shell/AppRootShell.test.tsx
        status: pass
    human_judgment: false
actuals:
  tokens: 5187
  tasks: 2
  commits: 4
metrics:
  duration: 34m
  completed: 2026-10-09
status: complete
---

# Phase 14 Plan 06: Unified App Settings Summary

**One shared App Settings content tree now serves the root bottom sheet and `/more/index`, preserving System/Light/Dark appearance, rest-alert authority, and recovery-route access.**

## Performance

- **Duration:** 34m
- **Completed:** 2026-10-09
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Extracted `AppSettingsContent` from the direct route wrapper so Appearance, Rest alerts, History and data, and Data and recovery remain in the exact required order for both presentations.
- Added a root-owned App Settings BottomSheet with an accessible trigger, heading-first modal focus, and exact trigger-focus restoration on close.
- Preserved runtime-backed Rest sound and Rest vibration reads, serialized writes/readback rollback, loading skeletons, notification denial guidance, and recovery deep routes while migrating RestAlertSettingsSheet to the common frame.
- Ensured sheet-originated recovery navigation closes the sheet before pushing the existing route; direct `/more/index` remains a full-route wrapper with Back behavior.

## Task Commits

1. Task 1 RED — `857ab3bd` test(14-06): add failing shared settings sheet tests
2. Task 1 GREEN — `dc5e581a` feat(14-06): unify root and route app settings
3. Task 2 RED — `dc2dc4c4` test(14-06): add failing retained settings tests
4. Task 2 GREEN — `91a1ed8f` feat(14-06): retain alert controls across settings presentations

## Verification

- PASS: `npm run test:components -- --runInBand src/ui/__tests__/RestAlertSettingsSheet.test.tsx src/ui/shell/AppRootShell.test.tsx app/more/__tests__/index.test.tsx src/ui/__tests__/SettingsScreen.test.tsx` — 4 suites, 17 tests.
- PASS: `npm run typecheck`.
- PASS: `npm run check:boundaries` — 318 files.
- PASS: Tracer feedback gate re-ran the Task 1 focused settings/shell suites after its GREEN commit.

## Decisions Made

- `AppSettingsContent` remains router-independent. Its hosts supply the route Back behavior or root-sheet close behavior, preventing duplicate settings/appearance stores.
- The root host passes a close-before-navigate callback into shared content so recovery actions do not leave a stale modal mounted behind a deep route.
- Rest-alert content preserves its existing transaction-like write queue; `BottomSheet` supplies only focus, keyboard geometry, safe dismissal, and modal isolation.

## Deviations from Plan

### Auto-fixed Issues

1. [Rule 2 - Missing critical functionality] Added a dismissal lock to the shared BottomSheet while rest-alert settings load.
   - **Found during:** Task 2 GREEN verification.
   - **Issue:** The former private frame disabled all close affordances during loading; the shared frame needed the same protection to prevent a loading sheet from being dismissed through Back, scrim, or its header action.
   - **Fix:** Added `cancelDisabled` to BottomSheet and applied it to RestAlertSettingsSheet while loading.
   - **Files modified:** `src/ui/components/BottomSheet.tsx`, `src/ui/components/RestAlertSettingsSheet.tsx`.
   - **Verification:** RestAlertSettingsSheet focused suite, typecheck, and boundary checks pass.
   - **Committed in:** `91a1ed8f`.

**Total deviations:** 1 auto-fixed (1 Rule 2).
**Impact on plan:** Required to retain the existing loading safety contract; no domain or architectural scope expanded.

## Issues Encountered

- The managed commit hook emits a trailer-selection warning because it expects its legacy TRAE address, but each commit also contains the plan-required exact `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>` trailer.

## Known Stubs

None. The changed source and test files contain no plan-blocking placeholder, TODO/FIXME, skipped test, or unrun required verification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Subsequent Phase 14 consumers can open the same settings content without duplicating appearance or rest-alert state, and retained recovery flows continue to use their existing route/controller owners.

## Self-Check: PASSED

- All nine modified source/test files and this summary exist.
- All four RED/GREEN task commits are reachable in git history.
