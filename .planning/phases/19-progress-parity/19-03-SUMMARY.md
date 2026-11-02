---
phase: 19-progress-parity
plan: 03
subsystem: progress-ui
tags: [react-native, expo-router, progress, accessibility, factual-dashboard, jest]
requires:
  - phase: 19-01
    provides: discriminated factual All, Strength, and Running dashboard projections
  - phase: 19-02
    provides: typed sport-aware Progress runtime reads and bounded refresh metadata
provides:
  - Retained All, Strength, and Running Progress root selection with typed sport/range reads
  - Accepted 2.4 km Running facts with exact target pacing and stale-result protection
  - Explicit loading, sparse, empty, rebuild, unavailable, retry, and source-error presentation
affects: [19-04, 19-05, 19-09, 19-10, phase-20]
actuals:
  tokens: 23929
  tasks: 2
  commits: 4
tech-stack:
  added: []
  patterns:
    - "ProgressScreen consumes only the discriminated dashboard union and never parses source payloads."
    - "A request generation plus selected-dashboard sport guard prevents obsolete async results from relabelling a selection."
key-files:
  created: []
  modified:
    - app/(tabs)/progress.tsx
    - app/__tests__/progress-route.test.tsx
    - src/ui/screens/ProgressScreen.tsx
    - src/ui/__tests__/ProgressScreen.test.tsx
key-decisions:
  - "The route forwards the selected typed request unchanged to the runtime; it contains no SQL, JSON parsing, or provider identity handling."
  - "Running's fixed 2.4 km target derives its displayed pace and splits from the persisted target only; absent 10 km and Half Marathon facts remain explicitly unset."
  - "Rebuild and unavailable reads suppress dashboard values while retaining the selection and an explicit refresh action."
patterns-established:
  - "Progress sport and range controls are 48dp segmented controls with programmatic selected state and Home/End/arrow keyboard movement."
  - "Sparse and empty facts render written absence copy, never numeric zero placeholders."
requirements-completed: [PRO-01, PRO-02, PRO-03, PRO-04, PRO-05, PRO-06, PRO-07, PRO-08]
coverage:
  - id: D1
    description: "Typed Progress route sends only the selected sport, range, and local date through the runtime boundary."
    requirement: PRO-04
    verification:
      - kind: integration
        ref: app/__tests__/progress-route.test.tsx#forwards only selected sport/range requests through the typed runtime adapter
        status: pass
    human_judgment: false
  - id: D2
    description: "Accepted 2.4 km Running facts render Latest, Best, Target, Gap, evidence, exact fixed pacing, and retained accessible controls."
    requirement: PRO-05
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/ProgressScreen.test.tsx#renders one accepted 2.4 km Running path with exact factual evidence and pacing
        status: pass
    human_judgment: false
  - id: D3
    description: "All, Strength, Running unset-target, stale completion, and rebuild states remain factual without relabelling or missing-as-zero output."
    requirement: PRO-01
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/ProgressScreen.test.tsx
        status: pass
    human_judgment: false
duration: 9m 28s
completed: 2026-10-13
status: complete
---

# Phase 19 Plan 03: Factual Progress Root Summary

**The Progress root now reads the typed factual dashboard as retained All, Strength, and Running scopes, led by accepted 2.4 km evidence and honest no-data/rebuild states.**

## Performance

- **Duration:** 9m 28s
- **Started:** 2026-10-12T16:26:20Z
- **Completed:** 2026-10-12T16:35:48Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Replaced the prohibited Overall Progress/Consistency presentation with the Revision 18 factual root hierarchy, exact three-sport/range controls, and retained keyboard-accessible selection.
- Routed only typed sport/range/local-date requests through the runtime adapter and rejected late completions that do not match the active selected sport.
- Rendered accepted 2.4 km Running evidence with Latest, Best, Target, written Gap, exact pacing, source notice, and clear 10 km/Half Marathon target-unset/no-effort rows.
- Added truthful All/Strength presentation and explicit loading, empty, sparse, rebuilding, unavailable, failure, and manual retry states with no zero-value placeholders.

## Task Commits

Each TDD task was committed atomically:

1. **Task 1: Render one accepted 2.4 km Running path with retained sport/range controls** — `9e8bfcb8` (test RED) and `1bab2848` (feat GREEN)
2. **Task 2: Expand All/Strength/Running content and every honest root read state** — `42dd0bf2` (test RED) and `e276712e` (feat GREEN)

## Files Created/Modified

- `app/(tabs)/progress.tsx` — thin runtime/navigation adapter that forwards the selected typed Progress request.
- `app/__tests__/progress-route.test.tsx` — proves opaque sport/range runtime routing and keeps source identities out of rendered text.
- `src/ui/screens/ProgressScreen.tsx` — retained factual root, state machine, accessible segmented selectors, and factual render branches.
- `src/ui/__tests__/ProgressScreen.test.tsx` — selected state, keyboard, exact Running fact, stale completion, All/Strength, target-unset, and rebuild-state coverage.

## Decisions Made

- Progress presentation consumes the frozen dashboard union rather than legacy period-projection fields, source rows, provider payloads, or parsed JSON.
- The 2.4 km pace display is calculated from the committed 11:00 target; no pacing or performance value is inferred when a fact is missing.
- An `updating` response with no final dashboard is accepted for the active request so the UI shows its recovery notice rather than remaining indefinitely in a skeleton.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Kept rebuilding reads from being discarded as stale**
- **Found during:** Task 2
- **Issue:** The selected-sport guard rejected `updating` snapshots because those intentionally carry no dashboard, leaving the screen in loading state.
- **Fix:** Guard dashboard sport only when a final dashboard is present; preserve the request-generation guard for every completion.
- **Files modified:** `src/ui/screens/ProgressScreen.tsx`, `src/ui/__tests__/ProgressScreen.test.tsx`
- **Verification:** Focused component tests, typecheck, lint, and boundary check passed.
- **Committed in:** `e276712e`

**2. [Rule 1 - Bug] Made every explicit empty state actionable**
- **Found during:** Task 1 and Task 2
- **Issue:** Shared `EmptyState` requires a recovery action; missing it would leave truthful absent-data states without a manual refresh route.
- **Fix:** Added the screen-owned `Refresh progress` action while retaining no-data semantics.
- **Files modified:** `src/ui/screens/ProgressScreen.tsx`
- **Verification:** Focused component tests and typecheck passed.
- **Committed in:** `1bab2848`, `e276712e`

**Total deviations:** 2 auto-fixed Rule 1 correctness issues.

## Issues Encountered

- `npm run test:coverage -- --runInBand` was run but did not complete: unrelated `src/platform/sqlite/repositories/progressRepository.test.ts` cases fail before this plan's UI code with `progress_snapshot_kernel_required`. The owned focused component suites, `typecheck`, `lint`, and `check:boundaries` all passed. The user requested no shared tracking/report files, so this concurrent repository failure was not recorded outside this Summary.

## Known Stubs

None. The target-unset and no-effort labels are the approved factual absence states, not fixture data; no placeholder values flow to the UI.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Progress detail and mutation plans can build on a retained factual root without reintroducing source parsing, scorecards, stale labels, or zero stand-ins.
- The unrelated SQLite coverage-suite failure must be resolved by its owning repository/runtime work before a repository-wide coverage gate can pass.

## Self-Check: PASSED

- The four owned implementation/test files exist and are committed in `9e8bfcb8`, `1bab2848`, `42dd0bf2`, and `e276712e`.
- The scope diff from `5db77a8ee3e1d61b0909997c9e8e782e084ab794` contains only the four owned files before this Summary, with no tracked-file deletions, new network/auth/file-access surface, skipped test, or unresolved UI stub.

---
*Phase: 19-progress-parity*
*Completed: 2026-10-13*
