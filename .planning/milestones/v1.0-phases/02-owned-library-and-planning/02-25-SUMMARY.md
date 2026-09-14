---
phase: 02-owned-library-and-planning
plan: 25
subsystem: ui
tags: [react-native, accessibility, design-system, content-cards, library, jest]
requires:
  - phase: 02-owned-library-and-planning
    provides: Library search, filters, ownership, attribution, selection, favorites, and pagination behavior
provides:
  - Neutral-grey canvas and semantic near-black flat content-card roles in Light and Dark appearances
  - Shared ContentCard and ActionCluster primitives that prevent nested cards and align same-row actions
  - Card-based Library plans, starter plans, and every exercise-result family without behavior regressions
affects: [design-system, library, root, today, active-workout, detail-editor, completion, plan-02-26, plan-02-34]
actuals:
  tokens: 8724
  tasks: 3
  commits: 7
tech-stack:
  added: []
  patterns:
    - Use ContentCard only for independently scannable content; keep form fields, sheets, navigation chrome, dialogs, and notices on their existing semantic surfaces.
    - Put per-item controls in a right-edge ActionCluster with 48dp minimum targets and card-semantic contrast tokens.
key-files:
  created: []
  modified:
    - DESIGN.md
    - src/ui/theme/index.ts
    - src/ui/components/index.ts
    - src/ui/components/PlanRow.tsx
    - src/ui/screens/LibraryScreen.tsx
    - src/ui/__tests__/LibraryScreen.test.tsx
    - src/ui/__tests__/foundation.test.tsx
key-decisions:
  - Content cards are a separate semantic role from generic surfaces so high-contrast list hierarchy never changes field, sheet, navigation, dialog, or notice treatment.
  - Library status stays textual as well as bordered, and favorite actions use card-semantic foregrounds so state remains visible without relying on color.
patterns-established:
  - A flat ContentCard may not contain another ContentCard; use internal layout Views and ActionCluster for composition.
  - Exercise cards are rendered through the one shared LibraryExerciseRow path, so Favorites, Recent, Results, All Exercises, and pagination retain identical behavior.
requirements-completed: [LIB-01, LIB-02, LIB-03, LIB-05, LIB-06, LIB-07, LIB-10]
coverage:
  - id: D1
    description: Neutral canvas, near-black content-card tokens, contrast guarantees, card states, no-nesting protection, and action-cluster geometry.
    requirement: LIB-01
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/foundation.test.tsx#defines neutral canvases and high-contrast near-black content cards in every appearance mode
        status: pass
      - kind: automated_ui
        ref: src/ui/__tests__/foundation.test.tsx#renders a flat ContentCard and right-edge ActionCluster without allowing card nesting
        status: pass
    human_judgment: false
  - id: D2
    description: Active, owned, and starter plan rows use flat cards while retaining long names, status, selection, source facts, and template-update actions.
    requirement: LIB-05
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/LibraryScreen.test.tsx#groups active owned and starter plans into flat high-contrast content cards
        status: pass
    human_judgment: false
  - id: D3
    description: Starter-plan card adoption preserves approved starter discovery and activation presentation.
    requirement: LIB-06
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/LibraryScreen.test.tsx#groups active owned and starter plans into flat high-contrast content cards
        status: pass
    human_judgment: false
  - id: D4
    description: Plan and exercise cards preserve ownership, origin, attribution, and explicit visible state facts.
    requirement: LIB-07
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/LibraryScreen.test.tsx#renders Favorites Recent and All Exercises with public row semantics
        status: pass
    human_judgment: false
  - id: D5
    description: Favorites, Recent, All Exercises, and matching aliases use shared semantic exercise cards without changing search-result presentation.
    requirement: LIB-02
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/LibraryScreen.test.tsx#renders Favorites Recent and All Exercises with public row semantics
        status: pass
    human_judgment: false
  - id: D6
    description: Filtered and paginated exercise results retain their ranked data and current controls while using the shared card renderer.
    requirement: LIB-03
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/LibraryScreen.test.tsx#keeps ranked rows and filters when loading the next page fails
        status: pass
      - kind: automated_ui
        ref: src/ui/__tests__/LibraryScreen.test.tsx#forwards Favorite Recent Unavailable and taxonomy filters without widening SQL
        status: pass
    human_judgment: false
  - id: D7
    description: Unavailable, archived, and hidden status facts remain explicit text on high-contrast cards with adaptive 48dp actions.
    requirement: LIB-10
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/LibraryScreen.test.tsx#uses adaptive width with 48dp controls and non-color states
        status: pass
    human_judgment: false
duration: 19min
completed: 2026-08-22
status: complete
---

# Phase 02 Plan 25: Global Content-Card Library Summary

**Library now presents every plan and exercise item on a neutral-grey canvas as a high-contrast, flat near-black card, with ownership, attribution, search, filter, favorite, and accessibility behavior intact.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-08-22T07:51:26Z
- **Completed:** 2026-08-22T08:10:24Z
- **Tasks:** 3/3
- **Files modified:** 7

## Accomplishments

- Updated the persistent design contract with the neutral-grey canvas, independent near-black content-card role, correct non-card surfaces, and an explicit Plan 02-26 adoption inventory.
- Added semantic content-card roles in both appearance modes plus shared `ContentCard` and `ActionCluster` primitives that provide focus, selected, pressed, disabled, status, contrast, non-nesting, and aligned-action behavior.
- Migrated Active Plan, My Plans, Starter Plans, Favorites, Recent, Results, All Exercises, filtered items, unavailable/archived/hidden items, and paginated exercise rows to the same card hierarchy.
- Proved Light, Dark, System, selected, attention/status, long text, alias, attribution, search/filter, pagination, favorite, focus, target size, and no-nesting behavior through focused component coverage.

## Task Commits

Each TDD task was committed atomically:

1. **Task 1 RED: Define semantic global canvas and content-card roles** - `7d3e5c5` (test)
2. **Task 1 GREEN: Define semantic global canvas and content-card roles** - `e0a18c3` (feat)
3. **Task 2 RED: Convert plan and starter items to flat cards** - `a7eddb1` (test)
4. **Task 2 GREEN: Convert plan and starter items to flat cards** - `337cf92` (feat)
5. **Task 3 RED: Convert exercise results and close Library appearance coverage** - `9705030` (test)
6. **Task 3 GREEN: Convert exercise results and close Library appearance coverage** - `7f2f151` (feat)
7. **Task 3 coverage correction: Cover archived and paginated exercise cards** - `ef2fefe` (test)

## Files Created/Modified

- `DESIGN.md` - Supersedes the prior card-light direction with the global semantic card contract and remaining-surface inventory.
- `src/ui/theme/index.ts` - Supplies light/dark canvas, content-card, text, border, selected, pressed, disabled, and completed-status tokens.
- `src/ui/components/index.ts` - Provides non-nesting `ContentCard` and right-aligned `ActionCluster` primitives.
- `src/ui/components/PlanRow.tsx` - Renders active, owned, and starter plan variants as shared content cards.
- `src/ui/screens/LibraryScreen.tsx` - Renders every Library exercise family as a card while preserving action and list semantics.
- `src/ui/__tests__/foundation.test.tsx` - Covers token contrast, primitive states, action geometry, and structural no-nesting.
- `src/ui/__tests__/LibraryScreen.test.tsx` - Covers all plan and exercise card families, appearances, semantic status, selection, long content, and target geometry.

## Decisions Made

- `surface` remains for controls, sheets, navigation chrome, dialogs, and notices. `contentCard` is intentionally separate so independently scannable Library items retain a stable high-contrast hierarchy.
- Status uses text in addition to a semantic card border. Ownership, availability, archive, hidden, matched-alias, and attribution facts remain visible and accessible.
- The favorite control is a card-local focusable action using content-card semantic foregrounds. The generic `IconAction` keeps its existing light-surface behavior for non-card chrome.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Accessibility] Corrected favorite-action contrast on near-black exercise cards**

- **Found during:** Task 3 (Convert exercise results and close Library appearance coverage)
- **Issue:** The generic `IconAction` uses the generic light-surface `textPrimary` foreground when unselected, which would be insufficiently visible on a near-black content card.
- **Fix:** Kept the separate favorite action and all existing semantic labels/callbacks, but rendered it through a card-local focusable action using `contentCardText`, `contentCardBorder`, `contentCardPressed`, and `contentCardStatusCompleted`.
- **Files modified:** `src/ui/screens/LibraryScreen.tsx`, `src/ui/__tests__/LibraryScreen.test.tsx`
- **Verification:** Full Task 3 gate passed, including System/Light/Dark and 48dp action assertions.
- **Committed in:** `7f2f151`

---

**2. [Rule 2 - Missing Critical Coverage] Added explicit archived, hidden, and paginated-result card assertions**

- **Found during:** Final Task 3 scope audit
- **Issue:** The shared `LibraryExerciseRow` rendered archived, hidden, query-result, and paginated rows correctly, but the focused suite did not explicitly prove those paths preserved the card hierarchy and non-color status semantics.
- **Fix:** Added assertions for `Archived · Hidden`, the attention border, card test ID, semantic row label, and rendered query/paginated Results cards.
- **Files modified:** `src/ui/__tests__/LibraryScreen.test.tsx`
- **Verification:** Final component gate passed: 2 suites, 60 tests.
- **Committed in:** `ef2fefe`

---

**Total deviations:** 2 auto-fixed (2 Rule 2 corrections).
**Impact on plan:** Required to meet the plan's high-contrast and non-color-state contract without changing the generic action component outside Library scope.

## Issues Encountered

- The existing Expo Go `expo-notifications` import emits a recurring Android push-notification warning during the Library test bootstrap. It is pre-existing, does not affect test results, and all suites passed.

## Verification

- `npm run test:components -- --runInBand src/ui/__tests__/LibraryScreen.test.tsx` — passed (19 tests).
- `npm run typecheck` — passed.
- `npm run lint` — passed (`Boundary check passed (160 files)`).
- `npm run test:components -- --runInBand src/ui/__tests__/LibraryScreen.test.tsx src/ui/__tests__/foundation.test.tsx` — passed (2 suites, 60 tests).

## Known Stubs

None. The placeholder search property is live input behavior, and the unrelated root-screen fixture copy in `foundation.test.tsx` was pre-existing and outside this plan's scope.

## Threat Flags

None. This plan adds no network endpoint, authentication path, file access, schema, or other trust boundary.

## Next Phase Readiness

- Plan 02-26 can adopt the established content-card system for Root, Today, Active Workout, detail/editor, and completion surfaces without redefining Library behavior.
- Plan 02-34 remains responsible for the one exact-HEAD APK rebuild and regenerated physical/OLED/accessibility evidence after this source change.

## Self-Check: PASSED

- Confirmed all seven listed design/UI/test files and this summary exist on disk.
- Confirmed task commits `7d3e5c5`, `e0a18c3`, `a7eddb1`, `337cf92`, `9705030`, `7f2f151`, and `ef2fefe` exist in Git history.
- Confirmed every task commit contains `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>`.
- Confirmed `.gsd/dispatch-isolation-sentinel.json` retains SHA-256 `180d0b3d90e0e02f74556b3762c2e7f6a25463b8244cee5e0d4b167cbf44523c` and remains unstaged.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-22*
