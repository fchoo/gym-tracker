---
phase: 19-progress-parity
plan: 05
subsystem: progress-history
tags: [typescript, sqlite, react-native, progress, bodyweight, snapshots, jest]
requires:
  - phase: 19-02
    provides: source-coherent Progress SQLite snapshots and typed runtime facts
  - phase: 19-04
    provides: immutable factual chart/data equivalence and source-link presentation
provides:
  - Pure dated bodyweight-relative Strength projection with disclosed per-observation basis
  - One-snapshot effective Exercise history with source revisions, target-at-date, freshness, and private bodyweight joins
  - Preserved read-only Exercise history route with allowlisted inputs, exact source navigation, and retryable factual states
affects: [19-09, 19-10, phase-20, progress, exercise-history]
actuals:
  tokens: 18609
  tasks: 3
  commits: 8
tech-stack:
  added: []
  patterns:
    - "Resolve optional bodyweight per observation by owner-local date, effective timestamp, source revision, then stable fact ID."
    - "Read effective overlays, raw fallback facts, freshness, source revisions, targets, and private bases through one SQLite readSnapshot."
    - "Use one immutable factual series for chart marks, summaries, semantic labels, complete rows, and source actions."
key-files:
  created:
    - src/domains/progress/relativeStrength.ts
    - src/domains/progress/relativeStrength.test.ts
    - app/exercise-history/__tests__/exercise-history-route.test.tsx
  modified:
    - src/domains/history/metricHistory.ts
    - src/domains/history/metricHistory.test.ts
    - src/platform/sqlite/repositories/historyRepository.ts
    - tests/sqlite-host/historyRepository.test.ts
    - src/ui/components/FactualHistoryChart.tsx
    - src/ui/screens/ExerciseHistoryScreen.tsx
    - src/ui/__tests__/ExerciseHistoryScreen.test.tsx
    - app/exercise-history/[exerciseId].tsx
key-decisions:
  - "Relative is a rebuildable view-only transform over exact load/bodyweight atomic units; it has no target or recommendation command authority."
  - "Relative is offered only when every comparable load observation has an eligible dated basis; Load remains available otherwise."
  - "Exercise history source rows carry opaque session identity and effective revision, while bodyweight fact IDs and owner namespace remain below the repository boundary."
  - "Stack Back remains the return authority; route parameters are allowlisted context only and arbitrary return URLs are never executed."
patterns-established:
  - "Freshness failure returns updating/unavailable without mixing stale final facts."
  - "Corrected overlays wholly replace raw source facts while retaining source-linked immutable history."
requirements-completed: [PRO-10, PRO-11]
coverage:
  - id: D1
    description: "Dated optional bodyweight produces a disclosed Relative view without changing load observations or targets."
    requirement: PRO-11
    verification:
      - kind: unit
        ref: src/domains/progress/relativeStrength.test.ts
        status: pass
      - kind: automated_ui
        ref: src/ui/__tests__/ExerciseHistoryScreen.test.tsx#renders one factual load series and discloses the exact dated basis in Relative
        status: pass
    human_judgment: false
  - id: D2
    description: "Exercise history joins effective facts, target-at-date, source revisions, freshness, and private bodyweight bases in one SQLite snapshot."
    requirement: PRO-10
    verification:
      - kind: integration
        ref: tests/sqlite-host/historyRepository.test.ts#loads source revisions target-at-date and private bodyweight bases through exactly one snapshot
        status: pass
      - kind: integration
        ref: tests/sqlite-host/historyRepository.test.ts#does not mix a bodyweight fact committed after the exercise-history snapshot begins
        status: pass
    human_judgment: false
  - id: D3
    description: "The existing Exercise history route retains Back, factual states, complete data, and exact allowlisted workout-source navigation."
    requirement: PRO-10
    verification:
      - kind: automated_ui
        ref: app/exercise-history/__tests__/exercise-history-route.test.tsx
        status: pass
      - kind: automated_ui
        ref: src/ui/__tests__/ExerciseHistoryScreen.test.tsx
        status: pass
    human_judgment: false
duration: 53 min
completed: 2026-10-12
status: complete
---

# Phase 19 Plan 05: Snapshot-Safe Relative Exercise History Summary

**Exercise history now reads one SQLite snapshot, renders source-linked factual Load/Relative series, and discloses the exact dated optional bodyweight basis without mutating targets or source facts.**

## Performance

- **Duration:** 53 min
- **Started:** 2026-10-12T18:00:13Z
- **Completed:** 2026-10-12T18:52:52Z
- **Tasks:** 3/3
- **Net implementation/test files:** 11
- **Commits:** 7 task/refactor commits plus this metadata commit

## Accomplishments

- Added a pure temporal relative-strength projection that rejects future, deleted, malformed, fractional, and absent bodyweight while deterministically resolving same-date ties.
- Extended effective metric history with target-at-date, source revision, corrected-source status, and optional relative basis; Load and Relative consume one immutable factual chart/data series.
- Refactored Exercise history to read overlays, raw fallback, source revisions, projection freshness, targets, and owner-private bodyweight through exactly one `readSnapshot`, including a concurrent late-write proof.
- Preserved the existing deep route across loading, empty, error, updating, unavailable, corrected, missing-source, one/many-segment, and long-series behavior with stack Back and exact workout-source navigation.

## Task Commits

1. **Task 19-05-01 RED:** `5bb3d537` — specified deterministic dated Relative behavior and screen disclosure.
2. **Task 19-05-01 GREEN:** `1f4f94d3` — implemented pure Relative projection and factual Load/Relative presentation.
3. **Task 19-05-02 RED:** `57b29cc0` — specified one-snapshot, freshness, target, privacy, and bodyweight contracts.
4. **Task 19-05-02 GREEN:** `f5e1c169` — implemented snapshot-safe effective Exercise history.
5. **Task 19-05-03 RED:** `2596f499` — specified route validation, exact source navigation, and freshness recovery.
6. **Task 19-05-03 GREEN:** `266ae658` — preserved trustworthy route and screen behavior.
7. **TDD refactor:** `289e62c5` — removed temporary index shims and restored the requested net file boundary.

## Files Created/Modified

- `src/domains/progress/relativeStrength.ts` — pure dated basis selection and view-only ratio projection.
- `src/domains/progress/relativeStrength.test.ts` — temporal ordering, invalid/tombstone/future rejection, privacy, and immutability tests.
- `src/domains/history/metricHistory.ts` — typed target-at-date/source/basis fields and immutable load-series projection.
- `src/domains/history/metricHistory.test.ts` — chronological source revision, corrected overlay, target-at-date, and relative-series proof.
- `src/platform/sqlite/repositories/historyRepository.ts` — single-snapshot effective/raw/freshness/bodyweight/source read.
- `tests/sqlite-host/historyRepository.test.ts` — real-SQLite snapshot, overlay, race, stale, privacy, and bodyweight coverage.
- `src/ui/components/FactualHistoryChart.tsx` — backward-compatible typed formatter and workout-source adapter while preserving Running behavior.
- `src/ui/screens/ExerciseHistoryScreen.tsx` — Load/Relative presentation, disclosure, source rows, and coarse freshness states.
- `src/ui/__tests__/ExerciseHistoryScreen.test.tsx` — factual state, Relative, source absence, correction, retry, Back, and appearance coverage.
- `app/exercise-history/[exerciseId].tsx` — allowlisted route parsing, stack Back, and exact workout-source navigation.
- `app/exercise-history/__tests__/exercise-history-route.test.tsx` — route payload rejection and exact navigation proof.

## Verification

- `npm run test:unit -- --runInBand src/domains/progress/relativeStrength.test.ts src/domains/history/metricHistory.test.ts` — passed (2 suites, 8 tests).
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/historyRepository.test.ts` — passed (1 suite, 10 tests).
- `npm run test:components -- --runInBand src/ui/__tests__/ExerciseHistoryScreen.test.tsx app/exercise-history/__tests__/exercise-history-route.test.tsx src/ui/__tests__/FactualHistoryChart.test.tsx` — passed (3 suites, 17 tests).
- `npm run typecheck` — passed.
- `npm run lint` — passed (boundary check, 421 files).
- `npm run check:boundaries` — passed (421 files).
- `git diff --check` — passed.
- No Android build, adb, device, Maestro, production artifact, or attended checkpoint was run; exact native/global acceptance remains Phase 20-owned.

## Decisions Made

- Bodyweight selection occurs below presentation using owner-local at-or-before dates and deterministic effective ordering; only grams and date cross into the view basis.
- Corrected effective overlays replace ordinary evidence and remain source-linked through their effective immutable revision.
- A source-less row remains factual and explicitly says Source unavailable; it is never converted to zero or silently hidden.
- Route display names are convenience-only and fail to a neutral label; repository facts supply the authoritative exercise name once loaded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added a backward-compatible Strength adapter to the duration-only factual chart**
- **Found during:** Task 19-05-01
- **Issue:** The plan required Exercise history to consume `FactualHistoryChart`, but the existing component formatted every numeric value as elapsed time and accepted only imported-activity source identity. Using it unchanged would render Strength load dishonestly.
- **Fix:** Added optional typed value formatting, metric/direction labels, bodyweight-basis disclosure, and opaque workout-session source support while preserving the existing Running defaults and regression tests.
- **Files modified:** `src/ui/components/FactualHistoryChart.tsx`
- **Verification:** Existing FactualHistoryChart tests plus ExerciseHistoryScreen tests, typecheck, lint, and boundaries passed.
- **Commit:** `1f4f94d3`, completed for missing-source handling in `266ae658`

**2. [Rule 3 - Blocking] Removed temporary cross-domain index shims from the final scope**
- **Found during:** Task 19-05-01 boundary verification
- **Issue:** Initial public-index shims fixed cross-domain lint but exceeded the requested net file boundary.
- **Fix:** Kept the pure projection self-contained, used a structural read-model type and direct platform/UI imports where allowed, and restored all temporary index files to the exact base state.
- **Files modified:** no additional net files
- **Verification:** Net diff lists only the ten planned files plus the required chart adapter; boundary checks pass across 421 files.
- **Commit:** `289e62c5`

---

**Total deviations:** 2 auto-fixed (1 missing critical integration, 1 blocking scope issue).
**Impact on plan:** Both changes were necessary to keep the displayed values truthful and the final diff isolated. No source schema, source fact, target command, recommendation command, Android artifact, or native evidence changed.

## Issues Encountered

- The isolated worktree had no dependencies, so the existing lockfile was restored with `npm ci`. npm reported that the host Node/npm versions were newer than the package's pinned engine, but installation completed with zero vulnerabilities and every targeted gate passed. No manifest or lockfile changed.

## Known Stubs

None. Empty, updating, unavailable, target-unset, missing-source, and absent-bodyweight values are deliberate fail-closed states, not placeholders.

## Threat Mitigations

- **T-19-05-01:** Pure owner-local temporal selection rejects future, deleted, invalid, and ineligible bodyweight facts and preserves exact atomic units.
- **T-19-05-02:** Owner namespace and bodyweight fact IDs remain repository-private; UI receives only the selected grams/date basis.
- **T-19-05-03:** Exercise and source IDs are bounded opaque identifiers; arbitrary arrays, origins, return URLs, and display payloads are rejected or neutralized.
- **T-19-05-04:** Freshness, overlays, raw facts, targets, sources, and bodyweight execute in one read snapshot; stale projections suppress final facts.

## User Setup Required

None.

## Next Phase Readiness

- PRO-10 and PRO-11 have targeted host proof and are ready for downstream Phase 19 composition.
- Phase 20 retains exact APK/device, global cross-phase, accessibility geometry, long-history native performance, and production-artifact acceptance.

## Self-Check: PASSED

- All eleven net implementation/test files and this Summary exist in the isolated worktree.
- All seven task/refactor commits exist and contain the required `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>` trailer.
- Shared STATE, ROADMAP, REQUIREMENTS, WINDOWS, Phase 14 evidence, and Phase 16 files are absent from the net diff.
- No tracked deletion remains relative to the requested base.

---
*Phase: 19-progress-parity*
*Completed: 2026-10-12*
