---
phase: 06-material-3-ux-remediation
plan: 08
subsystem: ui
tags: [react-native, expo-router, accessibility, root-navigation, today]
requires:
  - phase: 06-01
    provides: Material 3 shared controls and accessible interaction contracts
provides:
  - Adaptive two-row root navigation for constrained large-text bottom layouts
  - A distinct compact Today History and data route to the established secondary-tools surface
affects: [06-09, root-navigation, today, accessibility]
actuals:
  tokens: 3048
  tasks: 2
  commits: 5
tech-stack:
  added: []
  patterns:
    - Width and font-scale budget selects root navigation presentation without changing route ownership.
    - Today secondary-tools intents use distinct typed callbacks and accessibility names.
key-files:
  created: []
  modified:
    - src/ui/components/index.ts
    - app/(tabs)/_layout.tsx
    - src/ui/screens/TodayScreen.tsx
    - app/(tabs)/index.tsx
    - src/ui/__tests__/foundation.test.tsx
    - app/(tabs)/__tests__/_layout.test.tsx
    - src/ui/__tests__/TodayScreen.test.tsx
    - app/(tabs)/__tests__/index.test.tsx
key-decisions:
  - "Bottom navigation reflows to two rows only when the width/font-scale budget cannot preserve all four full labels."
  - "History and data keeps the established /more destination while Appearance and rest-alert settings remains a separate header action."
patterns-established:
  - "Root navigation retains fixed destination order, existing tabPress guards, selected semantics, and keyboard activation across presentation changes."
  - "Secondary Today utilities are compact, purpose-labelled actions instead of a generic More control."
requirements-completed: [UX-09]
coverage:
  - id: D1
    description: Four root destinations retain complete labels, selected/focus state, 48dp targets, and keyboard activation while constrained bottom navigation uses two rows.
    requirement: UX-09
    verification:
      - kind: automated_ui
        ref: "src/ui/__tests__/foundation.test.tsx#reflows four complete root destinations into two accessible rows for 200% text"
        status: pass
      - kind: automated_ui
        ref: "app/(tabs)/__tests__/_layout.test.tsx#uses a two-row bottom bar only when 200% text cannot fit full labels"
        status: pass
    human_judgment: false
  - id: D2
    description: Today exposes one compact History and data action distinct from Appearance and rest-alert settings and routes it to the established secondary-tools surface.
    requirement: UX-09
    verification:
      - kind: automated_ui
        ref: "src/ui/__tests__/TodayScreen.test.tsx#keeps History and data distinct from appearance and rest-alert settings"
        status: pass
      - kind: automated_ui
        ref: "app/(tabs)/__tests__/index.test.tsx#opens the established History and data surface from Today"
        status: pass
    human_judgment: false
  - id: D3
    description: Android 200% text, TalkBack, keyboard/D-pad, and Samsung safe-area presentation evidence for the changed navigation and Today tools.
    requirement: UX-09
    verification:
      - kind: manual_procedural
        ref: "06-09 exact-candidate native and attended evidence gate"
        status: unknown
    human_judgment: true
    rationale: Plan 06-09 owns exact-candidate Android 200%, TalkBack, and Samsung validation.
duration: 17m 47s
completed: 2026-08-31
status: complete
---

# Phase 06 Plan 08: Root Navigation and Today Tools Summary

**Adaptive full-label root navigation and a distinct Today History and data route preserve accessible typed navigation at large text**

## Performance

- **Duration:** 17m 47s
- **Started:** 2026-08-31T12:57:56Z
- **Completed:** 2026-08-31T13:15:43Z
- **Tasks:** 2/2 completed
- **Files modified:** 8

## Accomplishments

- Added a width/font-scale budget to reflow constrained compact root navigation into two rows, preserving Today → Calendar → Library → Progress order, full labels, 48dp minimum targets, focus rings, selected state, keyboard/D-pad activation, and existing tabPress guards.
- Preserved the existing expanded root rail and typed route ownership while live dimension changes retain the selected destination.
- Replaced Today’s ambiguous full-width `More` action with one compact `History and data` control that opens the established `/more` History and Data and recovery surface.
- Kept the Appearance and rest-alert settings header action, settings flow, and focus restoration separate from History and data.

## Verification

- `npm run test:components -- --runInBand src/ui/__tests__/foundation.test.tsx app/(tabs)/__tests__/_layout.test.tsx src/ui/__tests__/TodayScreen.test.tsx app/(tabs)/__tests__/index.test.tsx` — passed: 4 suites, 84 tests.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run check:boundaries` — passed.
- `npm run test:components -- --runInBand` — passed: 32 suites, 442 tests.
- `npm run test:coverage -- --runInBand` — passed: 136 suites, 2,373 tests; 100% integrity-critical coverage.
- `git diff --check dddf506..HEAD` — passed.

## Task Commits

1. **Task 1 RED: Keep every root destination complete and operable at 200% text** — `b1c075f` (`test`)
2. **Task 1 GREEN: Keep every root destination complete and operable at 200% text** — `3489918` (`feat`)
3. **Task 2 RED: Give Today one distinct compact History and data route** — `1559a80` (`test`)
4. **Task 2 GREEN: Give Today one distinct compact History and data route** — `572767e` (`feat`)

## Files Created/Modified

- `src/ui/components/index.ts` — supplies the font-scale-aware two-row root-tab presentation and preserves root tab semantics.
- `app/(tabs)/_layout.tsx` — passes live window width/font scale into the root navigation presentation selector.
- `src/ui/__tests__/foundation.test.tsx` and `app/(tabs)/__tests__/_layout.test.tsx` — cover order, labels, selected/focus state, keyboard activation, and two-row reflow.
- `src/ui/screens/TodayScreen.tsx` — exposes the compact History and data action separately from the settings header action.
- `app/(tabs)/index.tsx` — routes the dedicated History and data intent to the existing `/more` surface.
- `src/ui/__tests__/TodayScreen.test.tsx` and `app/(tabs)/__tests__/index.test.tsx` — cover distinct purpose/name, compact layout, appearance tokens, keyboard activation, focus restoration, and typed routing.

## Decisions Made

- Root navigation changes presentation only: the fixed destination order, route ownership, tabPress/missing/prevented guards, and rail contract remain unchanged.
- `History and data` intentionally uses `/more` because it is the existing route that owns both workout history and data/recovery; no parallel navigation tree was added.
- The Today settings header remains the sole owner of Appearance and rest-alert controls and its existing modal focus restoration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test harness] Corrected live-dimension test sequencing**
- **Found during:** Task 1
- **Issue:** An initial global `react-native` mock failed under Jest hoisting, and manual rerenders after `Dimensions.set` emitted React `act(...)` warnings.
- **Fix:** Used the repository’s existing `Dimensions.set` seam and performed live resize updates inside `act`.
- **Files modified:** `app/(tabs)/__tests__/_layout.test.tsx`
- **Verification:** Task 1 focused suite passed without console warnings; typecheck and boundaries passed.
- **Committed in:** `565444c`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 test-harness correction)
**Impact on plan:** Necessary for reliable large-text resize coverage; no production scope change.

## TDD Gate Compliance

- Task 1 RED `test(06-08)` commit `b1c075f` precedes GREEN `feat(06-08)` commit `3489918`.
- Task 2 RED `test(06-08)` commit `1559a80` precedes GREEN `feat(06-08)` commit `572767e`.

## Issues Encountered

- Full component and coverage suites emitted pre-existing Expo Go notification warnings from `src/platform/notifications/expoRestNotificationAdapter.ts` and existing React `act(...)` environment warnings from `app/more/__tests__/data-and-recovery.test.tsx`. Both suites passed; neither file is owned by this plan. They are recorded in `deferred-items.md`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Source-level D-77 and D-79 contracts are complete and covered by regression tests.
- Plan 06-09 remains responsible for exact-candidate Android 200% text, TalkBack, keyboard/D-pad, and Samsung safe-area/visual evidence. No release, promotion, tag, or Terminal Seal action was performed.

## Self-Check: PASSED

- Confirmed all eight planned source/test files exist.
- Confirmed TDD commits `b1c075f`, `3489918`, `1559a80`, and `572767e` exist on `agent-phase6-08`.

---
*Phase: 06-material-3-ux-remediation*
*Plan: 08*
*Completed: 2026-08-31*
