---
phase: 09-in-workout-exercise-editing
plan: 04
subsystem: workout, sqlite, testing
tags: [sqlite, workout, replace-exercise, remove-exercise, immutable-history, idempotency]
requires:
  - phase: 09-03
    provides: schema-20 scalar receipt authority and verified Task 1 boundary
provides:
  - bounded Replace and Remove command contracts
  - atomic v20 Replace/Remove persistence with canonical receipt replay
  - immutable-history, pointer/rest, restart, conflict, rollback, and migration-contract evidence
affects: [09-05, 09-06, 09-07, 09-08, 09-09, 09-10]
actuals:
  tokens: 15039
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns: [serialized SQLite mutations, scalar immutable receipts, protected-history skip, display-order pointer repair]
key-files:
  created: []
  modified:
    - src/domains/workout/activeWorkout.ts
    - src/domains/workout/sessionExerciseCommands.ts
    - src/domains/workout/sessionExerciseCommands.test.ts
    - src/platform/sqlite/repositories/workoutRepository.ts
    - tests/integration/session-exercise-editing.test.ts
    - src/testing/contracts/migrationsEffects.contract.ts
key-decisions:
  - "Replace and Remove persist all replay-critical request facts in the v20 scalar edit receipt; the expected exercise revision is carried inside canonical result_json because the shipped receipt schema has no separate column."
  - "A completed or undo-referenced exercise is never deleted: its remaining mutable child rows are skipped, the original stays skipped, and Replace appends a fresh added-origin snapshot."
  - "Replace and Remove never write the separate reorder receipt authority; pointer selection follows display_ordinal with stable ordinal and ID fallback."
requirements-completed: [WORK-21, WORK-22, WORK-24]
coverage:
  - id: D1
    description: Replace and Remove validate bounded request envelopes and expose committed, replay, and history-preserved outcomes.
    requirement: WORK-21
    verification:
      - kind: unit
        ref: src/domains/workout/sessionExerciseCommands.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Replace and Remove use one atomic scalar v20 receipt transaction, preserve protected facts, repair active/rest pointers, and reject stale concurrent requests.
    requirement: WORK-22
    verification:
      - kind: integration
        ref: tests/integration/session-exercise-editing.test.ts
        status: pass
      - kind: other
        ref: npm run test:coverage -- --runInBand
        status: pass
    human_judgment: false
  - id: D3
    description: Schema 20 accepts Replace/Remove scalar edit receipts while rejecting reorder and invalid operations in the edit ledger.
    requirement: WORK-24
    verification:
      - kind: other
        ref: tests/sqlite-host/migrations-effects.test.ts
        status: pass
    human_judgment: false
metrics:
  duration: 22 min
  completed: 2026-09-16
status: complete
---

# Phase 09 Plan 04: Replace and Remove Persistence Summary

**Revision-guarded Replace/Remove commands now preserve completed and undo-backed workout history while replaying canonical scalar v20 receipts atomically.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-16T14:22:25Z
- **Completed:** 2026-09-16T14:44:22Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added bounded Replace/Remove contracts with canonical request hashing, revision guards, explicit history-preserved outcomes, and fail-closed unavailable-capability behavior.
- Implemented one serialized SQLite mutation per command: exact scalar receipt replay, provisional delete, protected-history skip, fresh replacement snapshot creation, modified-from-plan marking, and one session revision increment.
- Repaired active/rest ownership before destructive deletion using display-order next-work selection, then queued rest reconciliation only when needed.
- Added integration proof for provisional Replace/Remove, restart replay, protected byte preservation and valid undo, pointer/rest repair, stale concurrent conflict, rollback, and no reorder-ledger writes.
- Extended the v20 migration-effects source contract to accept Replace/Remove edit receipts and reject invalid or reorder operations in that ledger.

## Task Commits

1. **Task 1: Define bounded Replace and Remove contracts** - 5908ffa (feat)
2. **Task 2: Persist Replace and Remove atomically against immutable history** - ae4f268 (feat)

## Files Created/Modified

- src/domains/workout/activeWorkout.ts - Declares the public Replace/Remove repository inputs, results, and optional capabilities.
- src/domains/workout/sessionExerciseCommands.ts - Validates and dispatches bounded Replace/Remove command envelopes.
- src/domains/workout/sessionExerciseCommands.test.ts - Covers malformed inputs, exact forwarding, history-preserved responses, and unavailable capabilities.
- src/platform/sqlite/repositories/workoutRepository.ts - Persists canonical v20 receipts and D-05/D-06 branch behavior in one FIFO write transaction.
- tests/integration/session-exercise-editing.test.ts - Covers durable behavior, immutable history, pointer/rest repair, conflicts, restart replay, and commit rollback.
- src/testing/contracts/migrationsEffects.contract.ts - Verifies v20 scalar receipt-operation boundaries without claiming new device evidence.

## Decisions Made

- Preserved expectedSessionExerciseRevision in canonical receipt result_json; schema 20 already has the required scalar ledger but no dedicated exercise-revision column.
- Classified any completed set or session_undo_snapshots reference as protected history. Protected facts remain present; only mutable siblings may transition to skipped.
- Kept Replace/Remove isolated from workout_session_exercise_reorder_receipts; reordering remains owned by later Plan 09 work.
- Used source-level migration contract coverage only; this plan did not create or claim native/device proof.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved a repeated protected-history Remove as a committed no-op transition**

- **Found during:** Task 2
- **Issue:** A valid Remove after a protected Replace conflicted solely because the original was already skipped.
- **Fix:** Kept protected rows non-destructive, allowing the new immutable receipt and session revision while avoiding a second status write.
- **Files modified:** src/platform/sqlite/repositories/workoutRepository.ts, tests/integration/session-exercise-editing.test.ts
- **Verification:** Protected-history, valid-undo, and full coverage gates passed.
- **Committed in:** ae4f268

**2. [Rule 1 - Bug] Prevented protected row deletion after skip classification**

- **Found during:** Task 2
- **Issue:** The protected Remove path could fall through to a physical delete and violate foreign-key-backed history.
- **Fix:** Made every protected-history branch non-destructive; mutable child rows transition to skipped while completed/undo bytes remain unchanged.
- **Files modified:** src/platform/sqlite/repositories/workoutRepository.ts, tests/integration/session-exercise-editing.test.ts
- **Verification:** Focused integration suite, typecheck, and full coverage gate passed.
- **Committed in:** ae4f268

**3. [Rule 1 - Bug] Tightened canonical replay validation and added pointer/rest plus stale-conflict proof**

- **Found during:** Task 2 closeout review
- **Issue:** Replay needed explicit disposition validation, and required pointer/rest and concurrency branches needed direct evidence.
- **Fix:** Validated persisted disposition values; added active/rest repair and stale Replace integration assertions.
- **Files modified:** src/platform/sqlite/repositories/workoutRepository.ts, tests/integration/session-exercise-editing.test.ts
- **Verification:** Focused integration, full coverage, and exact final verification command passed.
- **Committed in:** ae4f268

**Total deviations:** 3 Rule 1 bug fixes required for immutable-history safety and explicit branch proof. No UI, migration-0019, reorder, progression, write-back, or native-evidence scope was added.

## Issues Encountered

- The prior planning state still described Plan 09-01 as the latest completion, although summaries for Plans 09-01 through 09-03 were already present. Closeout realigned the state to Plan 09-04 complete and Plan 09-05 next.
- WORK-21, WORK-22, and WORK-24 remain Draft in the cross-phase requirement ledger by design: they are shared with unfinished Plans 09-05 and 09-10, so the readiness gate rejected premature completion marking.

## Verification

- Precondition boundary verifier passed before edits.
- npm run test:integration -- --runInBand tests/integration/session-exercise-editing.test.ts - 9 tests passed.
- npm run test:unit -- --runInBand src/domains/workout/sessionExerciseCommands.test.ts - 35 tests passed.
- npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts - 130 tests passed.
- npm run typecheck - passed.
- npm run test:coverage -- --runInBand - 144 suites / 2,562 tests passed; all 87 integrity-critical files met the 100% coverage gate.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plans 09-05 onward can consume durable Replace/Remove repository capabilities and must continue to keep the reorder receipt authority separate. UI, display-order mutation, progression, and write-back remain outside this plan.

## Self-Check: PASSED

- Task commits 5908ffaded0ac8d6483617fdd16bbde8dff20809 and ae4f2685891997d757658f335dcf505c1c57ce0f exist.
- All six Plan 04 implementation and test paths exist at the committed tree.
- No Plan 04 diff touches src/platform/sqlite/migrations/0019_session_exercise_editing.ts, UI files, or the reorder receipt writer.
- Closeout re-check confirmed the six paths, both full commit objects, and the scoped change set without any stub markers.

---
*Phase: 09-in-workout-exercise-editing*
*Plan: 04*
*Completed: 2026-09-16*
