---
phase: 19-progress-parity
plan: 04
subsystem: ui
tags: [react-native, react-native-svg, accessibility, running, progress, jest]
requires:
  - phase: 19-01
    provides: accepted Running facts, target-at-date revisions, and source-evidence semantics
  - phase: 19-02
    provides: frozen, source-coherent Running dashboard snapshots
provides:
  - One immutable factual series that drives the chart, visible summary, accessibility label, and complete history data rows
  - A source-revision-bound Running history sheet that uses the shared BottomSheet cancellation and focus contract
affects: [19-03, 19-05, 19-09, 19-10, phase-20]
actuals:
  tokens: 11386
  tasks: 2
  commits: 4
tech-stack:
  added: []
  patterns:
    - "Render SVG marks as derived decoration from an immutable factual series; never use chart coordinates as evidence."
    - "Keep visual-only sampling deterministic while text/data equivalents retain every ordered factual source row."
    - "Carry accepted activity ID and accepted source revision together for every eligible source action."
key-files:
  created:
    - src/ui/components/FactualHistoryChart.tsx
    - src/ui/components/RunningHistorySheet.tsx
    - src/ui/__tests__/FactualHistoryChart.test.tsx
    - src/ui/__tests__/RunningHistorySheet.test.tsx
  modified: []
key-decisions:
  - "Only accepted/current, exact-distance summary/lap facts produce marks and source actions; corrected, removed, incompatible, and unavailable rows stay explicit data gaps."
  - "One-point history shows a labelled point and More data needed; zero efforts show no chart or synthetic zero."
  - "The target-at-date line stays separate from actual history and uses the persisted revision effective at each observation."
patterns-established:
  - "Factual history exposes a concise visible summary, programmatic label, and disclosure data equivalent from one typed series."
  - "Running history dismissal remains presentation-only; BottomSheet restores the exact invoking focus target."
requirements-completed: [PRO-09]
coverage:
  - id: D1
    description: "Accessible factual chart/data equivalence for accepted same-distance Running efforts, target-at-date lines, and revision-bound source links."
    requirement: PRO-09
    verification:
      - kind: unit
        ref: src/ui/__tests__/FactualHistoryChart.test.tsx
        status: pass
      - kind: unit
        ref: npm run test:components -- --runInBand src/ui/__tests__/FactualHistoryChart.test.tsx src/ui/__tests__/RunningHistorySheet.test.tsx
        status: pass
    human_judgment: false
  - id: D2
    description: "Source-backed Running history sheet with sparse, rebuilding, retry, large-text, and focus-return states."
    requirement: PRO-09
    verification:
      - kind: unit
        ref: src/ui/__tests__/RunningHistorySheet.test.tsx
        status: pass
      - kind: other
        ref: npm run typecheck && npm run lint && npm run check:boundaries
        status: pass
    human_judgment: false
duration: 15 min
completed: 2026-10-12
status: complete
---

# Phase 19 Plan 04: Factual Running History Summary

**Running progress now renders accepted 2.4 km facts as an accessible straight-segment chart, complete source-linked history data, and a non-mutating BottomSheet without treating SVG coordinates as evidence.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-10-13T00:28:46+08:00
- **Completed:** 2026-10-12T16:43:59Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Added `FactualHistoryChart`, with one immutable typed series for actual marks, target-at-date goal line, visible Latest/Best/Target/Gap summary, accessibility label, and expandable ordered history data.
- Added `RunningHistorySheet`, which accepts only Phase 18-qualified exact-distance summary/lap history, preserves accepted source revisions for source actions, and delegates close, scrim, Back/Escape, modal isolation, and focus restoration to `BottomSheet`.
- Proved zero, one, many, invalid-gap, long sampled visual, source status, target-only, rebuilding, source-error/retry, 200% text/landscape, 48dp retry action, and trigger-return behavior through focused component tests.

## Task Commits

Each TDD task was committed atomically:

1. **Task 1 RED: open one accepted 2.4 km history** — `2e29467e` (test)
2. **Task 1 GREEN: factual chart and Running history sheet** — `65b958bb` (feat)
3. **Task 2 RED: state and accessibility matrix** — `f5edc331` (test)
4. **Task 2 GREEN: truthful sparse, revision, and geometry states** — `4397d550` (feat)

## Files Created/Modified

- `src/ui/components/FactualHistoryChart.tsx` — immutable factual-series rendering, deterministic visual-only sampling, direct data equivalent, and revision-bound source actions.
- `src/ui/components/RunningHistorySheet.tsx` — source-backed same-distance Running sheet using the Phase 14 modal/focus contract.
- `src/ui/__tests__/FactualHistoryChart.test.tsx` — factual-equivalence, empty/sparse, gap, long-history, source-status, and large-text coverage.
- `src/ui/__tests__/RunningHistorySheet.test.tsx` — sheet facts, retry, rebuild suppression, and focus-return coverage.

## Verification

- `npm run test:components -- --runInBand src/ui/__tests__/FactualHistoryChart.test.tsx src/ui/__tests__/RunningHistorySheet.test.tsx` — passed (2 suites, 7 tests).
- `npm run typecheck` — passed.
- `npm run lint` — passed (boundary check, 407 files).
- `npm run check:boundaries` — passed (407 files).
- Scoped Jest coverage collected both new files and all seven tests passed; the command exited non-zero only because the repository-wide global threshold is applied to the isolated two-file collection.
- `npm run test:coverage -- --runInBand` completed with 89.51% lines, 88.22% statements, 87.07% functions, and 84.79% branches. It did not meet the repository-wide 90%/90%/90%/85% global thresholds from this isolated base; this plan adds only three uncovered functions and cannot safely repair the pre-existing global shortfall without changing unrelated files.

## Decisions Made

- Straight green actual segments and outlined points represent only accepted/current factual observations; missing or incompatible rows split segments rather than becoming zero or a connected narrative.
- Goal values are persisted target-at-date revisions, rendered as a separate 7/5 dashed yellow line; current targets never redraw historical goals.
- Data rows retain their full source identity/revision even when visual sampling reduces SVG marks; source actions are unavailable for non-current facts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved target truth in the no-effort state and source-index chart geometry**
- **Found during:** Task 2
- **Issue:** Target-only history did not expose the persisted target, and SVG point X positions could compress around invalid gaps rather than retain chronological source positions.
- **Fix:** Rendered target-only facts explicitly and derived positions from original source indexes while preserving gaps.
- **Files modified:** `src/ui/components/FactualHistoryChart.tsx`, `src/ui/components/RunningHistorySheet.tsx`
- **Verification:** Focused component suite, typecheck, lint, and boundaries passed.
- **Committed in:** `4397d550`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug).
**Impact on plan:** Required for factual parity; no source mutations, storage changes, provider payload access, or scope expansion were introduced.

## Issues Encountered

- Dependencies were absent in the isolated worktree and were restored with `npm ci`; the lockfile remained unchanged.
- The repository’s full global coverage gate remains below its configured thresholds from this isolated base. Focused component behavior, static checks, and boundary checks pass; no unrelated coverage changes were made.

## Known Stubs

None. Empty, unavailable, corrected, removed, and target-unset values are explicit factual states, not placeholder data.

## Threat Surface

None. The plan added no network endpoint, auth path, file-access pattern, schema change, or raw-provider payload exposure. Source actions keep opaque activity identity plus accepted revision only.

## Next Phase Readiness

- Phase 19 Progress surfaces can reuse the chart and sheet without creating a second analytics authority or parsing Garmin payloads in UI.
- Integration owners must pass the selected immutable `ProgressRunningGoal` and retain its source/revision action route; Phase 20 native acceptance remains out of scope.

## Self-Check: PASSED

- All four declared implementation/test files and this summary exist in the isolated `agent-phase19-04` worktree.
- All four task commits exist: `2e29467e`, `65b958bb`, `f5edc331`, and `4397d550`.
- The scoped change contains no tracked deletions, untracked generated files, raw provider values, source mutations, or new trust-boundary surfaces.

---
*Phase: 19-progress-parity*
*Completed: 2026-10-12*
