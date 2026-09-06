---
phase: 07-post-candidate-ux-refinement
plan: 02
subsystem: workout-domain-runtime-sqlite
tags: [sqlite, workout, hard-delete, idempotency, history, react-runtime]
requires:
  - phase: 07-01
    provides: owner-approved Phase 7 UX context and removal contract
provides:
  - revision-bound distinct warm-up and working-set removal commands
  - receipt-backed atomic deletion with active-session repair
  - trusted runtime refresh and terminal-history regressions from remaining source rows
affects: [07-04, active-workout-ui, workout-history, runtime-refresh]
actuals:
  tokens: 11827
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns:
    - removal receipt plus conditional source deletion in the serialized SQLite writer
    - commit then active-session read then global trusted read before runtime acknowledgement
key-files:
  created: []
  modified:
    - src/domains/workout/activeWorkout.ts
    - src/domains/workout/setCommands.ts
    - src/platform/sqlite/repositories/workoutRepository.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - tests/integration/workout-outcomes.test.ts
key-decisions:
  - "Removal returns the authoritative refreshed ActiveWorkoutView at the runtime boundary while the SQLite repository retains its durable receipt result."
  - "The schema-17 production verifier remains strict; its fake kernel supplies the exact table and trigger metadata it requires."
  - "History is created only by the existing terminal outcome path from remaining session rows, never by an active-session projection."
patterns-established:
  - "Destructive set mutations require ownership, status, revision, request-hash, and immutable receipt checks in one serialized transaction."
  - "Runtime destructive commands increment workoutRefreshGeneration only after commit and authoritative active read succeed."
requirements-completed: [UX-18]
coverage:
  - id: D1
    description: Revision-bound distinct hard-removal commands reject malformed requests without invoking persistence.
    requirement: UX-18
    verification:
      - kind: unit
        ref: src/domains/workout/setCommands.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Incomplete warm-up and working rows are receipt-backed deleted atomically with active-state repair and remaining-row totals.
    requirement: UX-18
    verification:
      - kind: integration
        ref: tests/integration/complete-set.test.ts
        status: pass
      - kind: other
        ref: npm run test:coverage -- --runInBand
        status: pass
    human_judgment: false
  - id: D3
    description: Partial and completed finalization snapshots and history totals exclude removed rows without an active effective-history projection.
    requirement: UX-18
    verification:
      - kind: integration
        ref: tests/integration/workout-outcomes.test.ts
        status: pass
      - kind: unit
        ref: tests/sqlite-host/historyCommandRepository.test.ts
        status: pass
    human_judgment: false
  - id: D4
    description: Runtime and route expose only committed, active-read, globally trusted removal views with typed conflict handling.
    requirement: UX-18
    verification:
      - kind: unit
        ref: src/bootstrap/workoutAppRuntime.test.tsx
        status: pass
      - kind: other
        ref: npm run typecheck && npm run check:boundaries
        status: pass
    human_judgment: false
duration: 6m
completed: 2026-09-06
status: complete
---

# Phase 07 Plan 02: Hard-remove Workout Rows Summary

**Revision-checked hard deletion for incomplete workout rows, with receipt-backed atomic repair, trusted runtime refresh, and terminal history built solely from remaining SQLite facts.**

## Performance

- **Duration:** 6m
- **Started:** 2026-09-06T14:20:28Z
- **Completed:** 2026-09-06T14:26:16Z
- **Tasks:** 3/3
- **Files modified:** 11

## Accomplishments

- Added kind-specific, hash- and revision-bound hard-remove commands that cannot use skip semantics.
- Added a serialized, receipt-backed SQLite removal transaction that rejects stale, completed, mismatched, or replay-conflicting input; repairs active/rest state; and recalculates ordinals and active totals from remaining rows.
- Proved partial and completed terminal history paths use only remaining rows and write no active effective-history projection.
- Routed removal through runtime and the workout route so callers receive the authoritative `ActiveWorkoutView` only after commit, active-session read, trusted global read, and refresh-generation advancement.
- Kept schema-17 production verification strict while extending only the runtime test fake kernel with the migration's required metadata.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define and validate distinct hard-remove commands** - `24453e4` (feat)
2. **Task 2: Delete and repair active-session facts atomically** - `54b4859` (feat)
3. **Task 3: Expose committed removal through runtime and route** - `1cc703c` (feat)

## Files Created/Modified

- `src/domains/workout/activeWorkout.ts` - Typed removal inputs, durable receipt result, and repository ports.
- `src/domains/workout/setCommands.ts` and `setCommands.test.ts` - Pre-persistence validation and distinct remove wrappers.
- `src/platform/sqlite/repositories/workoutRepository.ts` - Serialized conditional deletion, immutable receipts, ordinal normalization, and active/rest repair.
- `tests/integration/complete-set.test.ts` - Atomic removal, remaining-total, receipt, replay/conflict, and no-active-overlay assertions.
- `tests/integration/workout-outcomes.test.ts` - Partial/completed terminal snapshots and history totals after removal.
- `src/bootstrap/workoutAppRuntime.tsx` and `workoutAppRuntime.test.tsx` - Commit → active read → trusted global refresh contract and schema-17 fake-kernel metadata.
- `app/workout/[sessionId].tsx` and `src/ui/screens/ActiveWorkoutScreen.tsx` - Remove ports available to the dependent workout UI; obsolete copy-warmup route seam removed.

## Decisions Made

- The repository returns the durable `RemoveSetResult`, while the screen/runtime boundary returns the freshly read `ActiveWorkoutView`; this preserves receipt replay semantics internally and prevents UI acknowledgement without authoritative facts.
- Removal increments `workoutRefreshGeneration` after a successful commit and active-session read, before publishing the trusted global state, so route consumers reliably reload.
- Schema migration verification was not relaxed: the fake kernel now provides the exact schema-17 table, foreign-key, and trigger metadata used by the existing strict verifier.

## Verification

- `npm run test:unit -- --runInBand src/domains/workout/setCommands.test.ts src/bootstrap/workoutAppRuntime.test.tsx` — pass (73 tests)
- `npm run test:integration -- --runInBand tests/integration/complete-set.test.ts tests/integration/workout-outcomes.test.ts` — pass (39 tests)
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/historyCommandRepository.test.ts tests/sqlite-host/migrations-effects.test.ts` — pass (122 tests)
- `npm run test:coverage -- --runInBand` — pass
- `npm run typecheck` — pass
- `npm run check:boundaries` and `npm run lint` — pass
- `git diff --check` — pass

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Return authoritative post-commit views from runtime removal commands**
- **Found during:** Task 3
- **Issue:** The initial runtime adapter refreshed its state but returned only receipt metadata, leaving route callers without the promised trusted post-commit `ActiveWorkoutView` and not advancing the refresh generation.
- **Fix:** Read `getActiveWorkout` after the commit, increment refresh generation, publish the global trusted read, and return the active view; added ordered runtime assertions for removal → active read → trusted read.
- **Files modified:** `src/bootstrap/workoutAppRuntime.tsx`, `src/bootstrap/workoutAppRuntime.test.tsx`, `src/ui/screens/ActiveWorkoutScreen.tsx`
- **Verification:** Focused unit, integration, type, boundary, lint, coverage, and diff checks pass.
- **Committed in:** `1cc703c`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Correctness-only adjustment; the runtime now meets the plan's trusted-refresh contract without expanding scope.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The dependent UI plan can consume typed `removeWarmup` and `removeWorkingSet` ports knowing each success represents a committed, source-backed active view.

## Self-Check: PASSED

- All eleven planned source and test files exist in the worktree.
- Task commits `24453e4`, `54b4859`, and `1cc703c` exist and include the required co-author trailer.
- No stubs, skipped checks, or unrun plan verification remain.

---
*Phase: 07-post-candidate-ux-refinement*
*Completed: 2026-09-06*
