---
phase: 13-multi-plan-running-foundation
plan: 10
subsystem: timing-retirement-native-lifecycle-contract
tags: [tim-01, sqlite, lifecycle, native-contracts, expo]
requires:
  - phase: 13-08
    provides: portable Phase 13 source graph
  - phase: 13-09
    provides: timing recovery characterization
provides:
  - inert TIM-01 timing command boundary without foreground playback
  - source-owned multi-plan Running lifecycle suite registration
affects: [13-14, 15-workout-parity, 17-running]
tech-stack:
  added: []
  patterns:
    - retired runtime capability resolves legacy requests to inert off state
    - immutable source case registry gates native SQLite evidence preflights
key-files:
  created:
    - src/testing/contracts/multiPlanRunning.contract.ts
    - src/testing/contracts/multiPlanRunning.contract.test.ts
  modified:
    - src/domains/advancedTiming/advancedTimingCommands.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - app/__native-contracts.tsx
    - scripts/run-native-sqlite-contracts.mjs
    - package.json
decisions:
  - TIM-01 removes cadence and cluster playback with no legacy compatibility route.
  - Existing persisted timing rows remain repository-readable while runtime commands and foreground transitions are inert.
  - Phase 13 lifecycle IDs are source-owned and registered in both host and native runners.
metrics:
  duration: 31 min
  completed: 2026-10-07
status: complete
actuals:
  tokens: 43120
  tasks: 2
  commits: 4
---

# Phase 13 Plan 10: TIM-01 Retirement and Shared SQLite Lifecycle Summary

**Cadence and cluster requests now resolve to an inert off snapshot, foreground playback is removed, and a source-owned Phase 13 lifecycle suite is available to the real Expo SQLite runner.**

## Accomplishments

- Retired cadence/cluster command execution by coercing new configuration snapshots to `off`; start, pause, resume, gap, reconcile, and stop requests return an inert result and no cue.
- Removed the timing foreground subscription and its queued reconciliation path while retaining independent rest and automatic-backup foreground behavior.
- Kept legacy storage parsing and repository readers available for backup/history integrity without using them to emit playback.
- Added immutable `MULTI_PLAN_RUNNING_CONTRACT_CASES` covering migration cuts, MAP-01, two Running slots, Strength retry, imports/matching/replay, bodyweight, backup/restore/merge/rebuild, source generation, and TIM-01.
- Registered `multi-plan-running` in the native contract route, device runner, and package command allow-list.

## Task Commits

1. **Task 1 RED: Define TIM-01 retirement boundary** — `568ae86`
2. **Task 1 GREEN: Retire cadence and cluster playback** — `953da21`
3. **Task 2: Add shared Phase 13 lifecycle contract** — `297f584`
4. **Rule 1 follow-up: Type retirement contract precisely** — `94e3f1f`

## Verification

- `npm run test:unit -- --runInBand src/domains/advancedTiming/advancedTimingCommands.test.ts src/platform/sqlite/repositories/advancedTimingRepository.test.ts src/bootstrap/workoutAppRuntime.test.tsx` — passed (158 tests).
- `npm run test:integration -- --runInBand tests/integration/today-schedule-workout.test.ts tests/integration/multi-plan-portability.test.ts` — passed (17 tests).
- `npm run test:unit -- --runInBand src/testing/contracts/multiPlanRunning.contract.test.ts` — passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed (311 files).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Type correctness] Corrected the cluster fixture field and preserved the legacy cue type used by repository readers.**

- **Found during:** Task 1 verification.
- **Fix:** Used the current `intraRestMs` contract, restored the cue type import, and fixed the tuple inference for invalidation scopes.
- **Files modified:** `src/domains/advancedTiming/advancedTimingCommands.ts`, `src/domains/advancedTiming/advancedTimingCommands.test.ts`.
- **Commit:** `94e3f1f`.

## TDD Gate Compliance

- Task 1 has a RED commit before its GREEN implementation commit.
- Task 2 includes an executable registry test but was added with its implementation commit; no separate RED commit was created.

## Known Stubs

None.

## Self-Check: PASSED

- Confirmed the retirement command boundary, runtime removal, lifecycle registry, native route, and runner wiring exist on disk.
- Confirmed task commits `568ae86`, `953da21`, `297f584`, and `94e3f1f` exist in git history.
- Shared `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally not updated; the orchestrator owns integrated tracking.
