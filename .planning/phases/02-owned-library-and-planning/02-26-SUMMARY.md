---
phase: 02-owned-library-and-planning
plan: 26
subsystem: ui
tags: [react-native, expo, design-system, accessibility, content-card, theming]

requires:
  - phase: 02-owned-library-and-planning
    provides: "Plan 02-25 shared ContentCard primitive and semantic canvas/card theme roles"
provides:
  - "App-wide neutral-grey canvas and flat near-black content-card adoption beyond Library"
  - "Card-safe shared component presentations that preserve contrast and focus in every appearance mode"
  - "Regression coverage distinguishing content cards from fields, dialogs, notices, navigation, and docks"
affects: [02-28, 02-29, visual-regression, accessibility, owned-library]

actuals:
  tokens: 16778
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Use ContentCard only for independently scannable bounded content; retain dedicated semantic surfaces for interactive chrome."
    - "Give reusable content components an explicit card presentation mode when their default foreground tokens would be unsafe on card backgrounds."

key-files:
  created: []
  modified:
    - src/ui/components/index.ts
    - src/ui/components/PlanEditorFields.tsx
    - src/ui/components/SemanticNumberField.tsx
    - src/ui/components/SetRow.tsx
    - src/ui/components/TimeDurationField.tsx
    - src/ui/screens/TodayScreen.tsx
    - src/ui/screens/ActiveWorkoutScreen.tsx
    - src/ui/screens/ExerciseDetailScreen.tsx
    - src/ui/screens/StarterPlanDetailScreen.tsx
    - src/ui/screens/OwnedPlanEditorScreen.tsx
    - src/ui/screens/WorkoutCompletionScreen.tsx
    - src/ui/__tests__/TodayScreen.test.tsx
    - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
    - src/ui/__tests__/OwnedPlanEditor.test.tsx
    - src/ui/__tests__/WorkoutCompletionScreen.test.tsx

key-decisions:
  - "Content cards are an app-wide semantic role; card-contained content must use card-safe foreground, border, focus, and state tokens in every appearance."
  - "Fields, live set rows, sheets, dialogs, navigation, transient notices, recommendation actions, and docks retain their dedicated semantic surfaces rather than becoming nested cards."
  - "Plan 02-26 changes visual containment only; Plans 02-28 and 02-29 retain workout-action, sticky identity, Today's-plan, and RestDock behavior ownership."

patterns-established:
  - "ContentCard boundary: group related read-only or summary content once, never around an existing semantic control surface."
  - "Card-context component mode: adapt surrounding copy and focus colors while leaving the child field or action surface unchanged."

requirements-completed: [LIB-05, LIB-06, LIB-07, LIB-08, LIB-10, LIB-11, LIB-12]

coverage:
  - id: D1
    description: "Today, exercise detail, and starter-plan detail use independently scannable shared cards without turning notices or sheets into cards."
    requirement: LIB-05
    verification:
      - kind: automated_ui
        ref: "src/ui/__tests__/TodayScreen.test.tsx#uses flat high-contrast cards for Today content without turning notices or sheets into cards"
        status: pass
    human_judgment: false
  - id: D2
    description: "Active workout, owned-plan editor, and completion content use shared cards while editable and modal surfaces keep their semantic roles."
    requirement: LIB-06
    verification:
      - kind: automated_ui
        ref: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx#uses global card tokens while retaining editable set fields in Light and Dark appearance"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/WorkoutCompletionScreen.test.tsx#resolves every completion card through shared tokens in Light and Dark appearance"
        status: pass
    human_judgment: false
  - id: D3
    description: "Shared card primitives preserve contrast, focus, explicit non-color states, adaptive layouts, and a no-nesting boundary across intended owner-facing surfaces."
    requirement: LIB-07
    verification:
      - kind: automated_ui
        ref: "npm run typecheck && npm run lint && npm run test:components -- --runInBand src/ui/__tests__/foundation.test.tsx src/ui/__tests__/LibraryScreen.test.tsx src/ui/__tests__/TodayScreen.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx src/ui/__tests__/WorkoutCompletionScreen.test.tsx"
        status: pass
    human_judgment: false

duration: 20m
completed: 2026-08-22
status: complete
---

# Phase 02 Plan 26: Global Content-Card Adoption Summary

**The approved neutral-grey canvas and flat near-black ContentCard system now covers Today, workout, details, planning, and completion content while preserving every interactive surface's existing semantic role.**

## Performance

- **Duration:** 20m
- **Started:** 2026-08-22T09:44:35Z
- **Completed:** 2026-08-22T10:04:35Z
- **Tasks:** 3
- **Files modified:** 15
- **Verification:** `npm run typecheck`, `npm run lint`, and the specified five component suites passed (116 tests).

## Accomplishments

- Extended the shared flat-card system from Library to Today, active workout, exercise and starter-plan details, owned-plan editing, and workout completion without nesting cards.
- Made shared rows, headers, metrics, controls, labels, and notices card-aware where needed, preserving high-contrast text, focus affordances, and System/Light/Dark behavior.
- Added inventory-level regressions that keep inputs, editable set rows, sheets, dialogs, notices, navigation, recommendation actions, and docks semantically distinct from content cards.

## Task Commits

Each task was committed atomically:

1. **Task 1: Adopt global cards in root, Today, and detail surfaces** - `7ad9066` (feat)
2. **Task 2: Adopt global cards in workout, editor, and completion surfaces** - `81f7600` (feat)
3. **Task 3: Close the app-wide surface inventory** - `7cafc4a` (fix)

## Files Created/Modified

- `src/ui/components/index.ts` - Adds scoped card-safe presentation support for shared headers, metrics, exercise rows, actions, notices, and activation rows.
- `src/ui/components/PlanEditorFields.tsx`, `SemanticNumberField.tsx`, and `TimeDurationField.tsx` - Keep editor labels card-safe while fields and dialogs remain dedicated interactive surfaces.
- `src/ui/components/SetRow.tsx` - Keeps live editable fields and controls non-card while surrounding content is contrast-safe within a parent card.
- `src/ui/screens/TodayScreen.tsx`, `ActiveWorkoutScreen.tsx`, `ExerciseDetailScreen.tsx`, `StarterPlanDetailScreen.tsx`, `OwnedPlanEditorScreen.tsx`, and `WorkoutCompletionScreen.tsx` - Apply shared cards only to independently scannable content groups.
- `src/ui/__tests__/TodayScreen.test.tsx`, `ActiveWorkoutScreen.test.tsx`, `OwnedPlanEditor.test.tsx`, and `WorkoutCompletionScreen.test.tsx` - Lock down card boundaries, high contrast, appearance modes, adaptive behavior, and non-card interactive surfaces.

## Decisions Made

- Content cards are an app-wide semantic role. Card-contained content uses card-safe foreground, border, focus, and state tokens in every appearance mode.
- Fields, live set rows, sheets, dialogs, navigation, transient notices, recommendation actions, and docks retain their own semantic surfaces rather than becoming nested cards.
- This plan is visual containment only. Plans 02-28 and 02-29 continue to own workout actions, sticky identity, Today's-plan navigation, completed-set editing, and RestDock behavior.

## Intentional Non-Card Surfaces

- Root navigation remains navigation chrome, not content.
- Search, form, number, duration, and editable set fields remain input surfaces.
- SetRow remains a live editable row; only its enclosing warm-up or working-set summary is a content card.
- RestDock, action sheets, confirmation sheets, duration dialogs, save docks, and action clusters remain control or modal surfaces.
- Inline notices and recommendation controls remain semantic notices or actions, even when they appear within a card-contained content group.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical accessibility functionality] Added card-safe shared component modes**
- **Found during:** Task 3 (Close the app-wide surface inventory)
- **Issue:** Generic foreground tokens in reusable rows and editor labels were not sufficient when rendered on the near-black card role, risking low contrast and obscured focus/state treatment.
- **Fix:** Added scoped `card` presentation modes for shared copy-bearing components; preserved the dedicated field, action, notice, dialog, sheet, and dock surfaces beneath them.
- **Files modified:** `src/ui/components/index.ts`, `PlanEditorFields.tsx`, `SemanticNumberField.tsx`, `SetRow.tsx`, and `TimeDurationField.tsx`
- **Verification:** Typecheck, lint, targeted card-boundary suites, Light/Dark assertions, adaptive/reduced-motion coverage, and 116 passing component tests.
- **Committed in:** `7cafc4a` (part of Task 3)

---

**Total deviations:** 1 auto-fixed (Rule 2 accessibility correction)
**Impact on plan:** Required for contrast and focus correctness on the planned card system; no behavior, data, route, or scope expansion occurred.

## Known Stubs

None. The modified source and test files were scanned for placeholder text, TODO/FIXME markers, and hardcoded empty render-state stubs; no plan-blocking stub was introduced.

## Threat Flags

None. This visual containment work introduced no network endpoint, authentication path, file access pattern, schema change, or other new trust boundary.

## Issues Encountered

- A first attempt to patch `SetRow` did not match the live parameter context; no file changed, and the scoped card-safe update was applied successfully afterward.
- A first test patch had JavaScript string quoting errors before it reached disk; it was corrected and the resulting tests passed.
- Shell startup emitted a pre-existing `compdef:153: _comps: assignment to invalid subscript range` warning, but all relevant commands completed successfully.

## User Setup Required

None - no external service configuration, physical verification, final evidence, or terminal seal is authorized by this plan.

## Next Phase Readiness

The app-wide content-card role is ready for later workout behavior work. Future plans must preserve this boundary: use ContentCard for bounded content, and retain semantic input, modal, navigation, notice, recommendation, and dock surfaces unchanged.

## Self-Check

PASSED

- All 15 planned code and test files plus this summary exist.
- Task commits `7ad9066`, `81f7600`, and `7cafc4a` exist in Git and each ends with the required `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>` trailer.
- `git diff --check` passed for the implementation range and current closeout changes.
- The protected untracked `.gsd/dispatch-isolation-sentinel.json` remains unstaged with SHA-256 `180d0b3d90e0e02f74556b3762c2e7f6a25463b8244cee5e0d4b167cbf44523c`.

---
*Phase: 02-owned-library-and-planning*
*Plan: 26*
*Completed: 2026-08-22*
