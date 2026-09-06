---
phase: 07-post-candidate-ux-refinement
plan: 05
subsystem: ui
tags: [react-native, accessibility, plan-editor, drag-reorder, tdd]
requires:
  - phase: 07-post-candidate-ux-refinement
    provides: locked D-04 single-active-day UX contract
provides:
  - Drag-first accessible reorder rows with keyboard and assistive movement alternatives
  - Stable-ID single-active-day switcher and trailing Replace glyph
affects: [owned-plan-editor, plan-day-removal, plan-impact-replacement, native-qa]
actuals:
  tokens: 5671
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - Shared reorder primitive keeps touch, keyboard, and accessibility movement on one bounded draft callback
    - Selected plan day is retained by ID and falls forward to the nearest surviving index after a committed update
key-files:
  created:
    - src/ui/components/PlanDaySwitcher.tsx
  modified:
    - src/ui/components/PlanEditorFields.tsx
    - src/ui/screens/OwnedPlanEditorScreen.tsx
    - src/ui/__tests__/PlanEditorFields.test.tsx
    - src/ui/__tests__/OwnedPlanEditor.test.tsx
key-decisions:
  - "Keep exactly one stable-ID day editor visible; day rows are selectors rather than expanded all-day forms."
  - "Use the shared reorder row's trailing slot for the labelled 48dp Replace glyph."
  - "Only explicit plan save persists; selection, reorder, replacement, and day actions stay draft-local."
patterns-established:
  - "Accessible reorder: exact Reorder label and drag hint, TalkBack actions, Enter/Space, and Shift+Arrow without visible ordinal controls."
  - "Nearest survivor: capture the selected index and select that index, clamped to remaining days, if its ID disappears."
requirements-completed: [UX-20]
coverage:
  - id: D1
    description: Drag-first plan/day reorder rows expose labelled 48dp handles with bounded keyboard and assistive movement.
    requirement: UX-20
    verification:
      - kind: unit
        ref: src/ui/__tests__/PlanEditorFields.test.tsx and src/ui/__tests__/OwnedPlanEditor.test.tsx
        status: pass
    human_judgment: false
  - id: D2
    description: Every plan day is selectable by stable ID and exercises use a non-persisting labelled Replace glyph.
    requirement: UX-20
    verification:
      - kind: unit
        ref: src/ui/__tests__/OwnedPlanEditor.test.tsx#OwnedPlanEditorScreen reorder hierarchy
        status: pass
    human_judgment: false
duration: 31min
completed: 2026-09-06
status: complete
---

# Phase 07 Plan 05: Owned Plan Drag-First Editing Summary

**Accessible drag-first plan editing with stable-ID day selection, nearest-survivor fallback, and a right-aligned draft-only Replace glyph.**

## Performance

- **Duration:** 31 min
- **Completed:** 2026-09-06T13:35:37Z
- **Tasks:** 2/2
- **Files modified:** 5
- **Focused tests:** 29 passing

## Accomplishments

- Removed visible position and directional controls from shared plan editor rows while retaining 48dp drag, reduced-motion behavior, TalkBack actions, Enter/Space, and Shift+Arrow alternatives.
- Added `PlanDaySwitcher`, keeping all days visibly reachable while only one stable-ID day editor is expanded at a time.
- Moved Replace to a labelled, 48dp trailing forward glyph; selection, reordering, replacement, and day draft operations do not save.
- Preserved save failure recovery copy and draft state; added a regression for choosing the closest remaining day after a committed update removes the selected day.

## Task Commits

1. **Task 1: Clean the shared reorder primitive** — `e8082d3` (`feat`)
2. **Task 2: Add the single-active-day switcher and trailing Replace glyph** — `98d30ea` (`feat`)

## Files Created/Modified

- `src/ui/components/PlanEditorFields.tsx` — shared drag-first reorder primitive with a trailing action slot and non-visual movement alternatives.
- `src/ui/components/PlanDaySwitcher.tsx` — labelled 48dp selectable/reorderable day rows.
- `src/ui/screens/OwnedPlanEditorScreen.tsx` — stable selected-day state, nearest-survivor handling, and trailing Replace glyph wiring.
- `src/ui/__tests__/PlanEditorFields.test.tsx` — focused shared reorder accessibility regressions.
- `src/ui/__tests__/OwnedPlanEditor.test.tsx` — day selector, reorder, replacement, and nearest-survivor regressions.

## Decisions Made

- D-04 remains a single-active-day model: selection changes the one editor below instead of expanding all days.
- Selection is keyed by day ID across reorders; if a committed response removes that ID, the saved selected index is clamped to a surviving day.
- Replace remains an explicit navigation/action callback, not a persistence event.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserve nearest-survivor selection after a committed save removes the current day**

- **Found during:** Task 2 — nearest-survivor regression verification.
- **Issue:** The first implementation chose the first day after save when the selected ID was absent, ignoring the required nearest-survivor rule.
- **Fix:** Reused the captured selected index and selected its clamped equivalent in the committed day list.
- **Files modified:** `src/ui/screens/OwnedPlanEditorScreen.tsx`, `src/ui/__tests__/OwnedPlanEditor.test.tsx`
- **Verification:** Focused component tests pass with a committed-update removal regression.
- **Committed in:** `98d30ea`

**Total deviations:** 1 auto-fixed (Rule 1).

## Verification

Passed:

- `npm run test:components -- --runInBand src/ui/__tests__/OwnedPlanEditor.test.tsx src/ui/__tests__/PlanEditorFields.test.tsx` — 2 suites, 29 tests.
- `npm run typecheck`
- `npm run lint`
- `npm run check:boundaries`
- `git diff --check`

## Known Stubs

None.

## Self-Check: PASSED

- Confirmed all five implementation and test artifacts exist.
- Confirmed task commits `e8082d3` and `98d30ea` exist in git history.

## Next Phase Readiness

The owned-plan UX-20 surface is ready for native visual/accessibility evidence. No user setup, authentication, or external configuration is required.

---

*Phase: 07-post-candidate-ux-refinement*
*Plan: 05*
