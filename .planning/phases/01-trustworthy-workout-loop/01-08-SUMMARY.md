---
phase: 01-trustworthy-workout-loop
plan: 08
subsystem: workout
tags: [sqlite, exactly-once, active-workout, warmups, haptics, undo, accessibility, expo-router]

requires:
  - phase: 01-07
    provides: Copied Full Body Foundation sessions with immutable exercise, target, unit, policy, schedule, and active-pointer snapshots
provides:
  - Source-backed active workout read model with persisted profile-aware drafts and ordered value sources
  - Add, copy, complete, skip, and review warm-ups excluded from working completion and progression evidence
  - Revision-checked exactly-once working-set completion with atomic pointer, rest, Undo, and durable effect writes
  - Eight-second transactional Undo restoring prior set, exercise, active pointer, and rest state
  - Accessible focused Active Workout route with compact commit-gated row actions, inline values, Retry, timed holds, and non-blocking haptics
  - Explicit recoverable view for valid empty workout sessions
affects: [01-09-rest, 01-10-completion, process-death-recovery, progression-evidence]

actuals:
  tokens: 44856
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - Expected session/set revisions plus serialized conditional writes for duplicate defense
    - Source facts and durable rest reconciliation effects committed before acknowledgement
    - Post-commit invalidation, haptics, and drain probes are fail-open derivatives
    - Persisted value-source observations shared by plan targets, drafts, history, and completion
    - Focused route composition with domain-facing UI commands and no UI-to-platform imports

key-files:
  created:
    - src/domains/workout/activeWorkout.ts
    - src/domains/workout/setCommands.ts
    - src/domains/workout/undoCompletedSet.ts
    - src/domains/workout/hapticsPort.ts
    - src/platform/sqlite/repositories/workoutRepository.ts
    - src/platform/haptics/expoHapticsAdapter.ts
    - src/ui/screens/ActiveWorkoutScreen.tsx
    - src/ui/components/SetRow.tsx
    - tests/integration/complete-set.test.ts
    - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  modified:
    - src/platform/sqlite/migrations/0001_initial.ts
    - tests/migrations/fixtures/v1-phase1.sql
    - src/platform/sqlite/repositories/plansWorkoutRepository.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - app/workout/[sessionId].tsx
    - src/ui/layout/AdaptiveScreen.tsx
    - src/ui/components/index.ts
    - src/ui/screens/RootScreens.tsx

key-decisions:
  - "A session set snapshots its exact source plan target ID and equipment increment, so recommendations and manual controls never resolve against later mutable plan state."
  - "Working sets are the initial active pointer; optional warm-ups remain independently actionable and never block or advance working completion."
  - "Duplicate completion returns already_completed from current committed state; only the committed caller runs post-commit probes."
  - "Undo uses nowMs < undoUntilMs, increments source revisions monotonically, supersedes stale rest effects, and restores serialized prior facts."
  - "Haptic, invalidation, and effect-drain failures cannot turn a committed source mutation into a visible save failure."
  - "Valid empty sessions use an explicit empty_workout view rather than fabricated exercise rows or a corruption error."

patterns-established:
  - "Exactly-once boundary: UI busy state is usability only; source correctness is FIFO plus expected revisions plus conditional incomplete-set update."
  - "Commit acknowledgement boundary: no completed row, advancement, rest, Undo, haptic, invalidation, or drain is visible before COMMIT."
  - "Metric editor boundary: load/reps and timed holds retain distinct versioned observations and fixed unit semantics."
  - "Focused workout boundary: root navigation remains absent, Complete and Skip remain adjacent in each set row, Retry stays directly below the set list, and inline editing preserves focus."

requirements-completed: [WORK-05, WORK-06, WORK-07, WORK-08, WORK-09, WORK-10]

coverage:
  - id: D1
    description: "Owner can choose Recommended, Last workout, Plan default, or Manual values in order and restore persisted load/reps or timed-hold drafts."
    requirement: WORK-05
    verification:
      - kind: integration
        ref: "tests/integration/complete-set.test.ts#Plan 01-08 persisted values and value sources"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx#offers value sources in approved order and persists the selected draft"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx#edits timed-hold duration without encoding it as repetitions"
        status: pass
    human_judgment: false
  - id: D2
    description: "Owner can add, copy, complete, skip, and review full-size optional warm-ups without changing working progress or progression effects."
    requirement: WORK-06
    verification:
      - kind: integration
        ref: "tests/integration/complete-set.test.ts#Plan 01-08 warm-up commands"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx#adds, copies, and skips warm-ups through separate persisted commands"
        status: pass
    human_judgment: false
  - id: D3
    description: "Touch, assistive activation, Enter, and Space invoke one revision-checked command; rapid duplicates complete exactly once."
    requirement: WORK-07
    verification:
      - kind: integration
        ref: "tests/integration/complete-set.test.ts#commits rapid duplicate completion once and runs post-commit probes once"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx#routes activation through the same completeSet command"
        status: pass
    human_judgment: false
  - id: D4
    description: "Completed source facts, advancement, rest, Undo, haptics, invalidation, and durable work remain commit-gated; derivative failure does not negate success."
    requirement: WORK-08
    verification:
      - kind: integration
        ref: "tests/integration/complete-set.test.ts#keeps completion and every post-commit probe pending until commit resolves"
        status: pass
      - kind: integration
        ref: "tests/integration/complete-set.test.ts#returns committed source state when post-commit derivatives fail"
        status: pass
    human_judgment: false
  - id: D5
    description: "Commit failure preserves entered values, active pointer, incomplete state, and exact Retry with no rest, effect, acknowledgement, or haptic."
    requirement: WORK-09
    verification:
      - kind: integration
        ref: "tests/integration/complete-set.test.ts#does not acknowledge, advance, rest, effect, or haptic when commit fails"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx#retains values and follows the normal committed path after exact Retry"
        status: pass
    human_judgment: false
  - id: D6
    description: "Undo succeeds through 7,999 ms, is unavailable at 8,000 ms, and restores prior active-set and rest facts transactionally."
    requirement: WORK-10
    verification:
      - kind: integration
        ref: "tests/integration/complete-set.test.ts#undoes before eight seconds and is unavailable at or after expiry"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx#removes Undo at the exact eight-second UI boundary"
        status: pass
    human_judgment: false

duration: 44 min
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 8: Exactly-Once Active Workout Summary

**Persisted profile-aware values, optional warm-ups, commit-gated exactly-once set completion, compact inline Retry, and eight-second transactional Undo now run through an accessible focused workout route**

## Performance

- **Duration:** 44 min
- **Started:** 2026-08-16T05:46:56Z
- **Completed:** 2026-08-16T06:31:13Z
- **Tasks:** 2
- **Files modified:** 25
- **Commits:** 4
- **Final tests:** 442 passed

## Accomplishments

- Added a source-backed active workout model for load/reps and timed holds, persisted drafts, exact plan-target identity, recommended/history/default/manual source ordering, equipment increments, and explicit valid empty sessions.
- Implemented warm-up add/copy/complete/skip commands that remain reviewable while never incrementing working completion or enqueuing progression evidence.
- Implemented exactly-once completion with FIFO serialization, expected revisions, a conditional incomplete-set update, active exercise/set advancement, persisted timestamp rest, one durable reconciliation effect, and one Undo snapshot.
- Proved a held COMMIT exposes no completed source state or derivative work, injected COMMIT failure rolls back everything, rapid duplicate input writes once, Retry succeeds normally, and derivative failure cannot misreport a committed set.
- Delivered the focused Active Workout route with hidden root navigation, full-size warm-ups, one active working row, inline load/reps and timed-hold values, adjacent Complete/Skip controls, commit-gated Saving and Retry states, touch/keyboard/D-pad equivalence, non-blocking light haptics, focus restoration, adaptive widths, large-text wrapping, and exact eight-second Undo expiry.

## Task Commits

1. **RED exactly-once contract:** `4d446be` — persisted drafts/value sources, warm-up exclusion, duplicate defense, commit failure, and Undo boundary.
2. **Task 1 GREEN:** `e84c52b` — active workout domain/repository, schema target identity, atomic completion, rest effect, and transactional Undo.
3. **Task 2 GREEN and review hardening:** `96c657c` — focused route, commit-gated actions, value editing, accessibility input equivalence, haptics, runtime composition, and coverage.
4. **Compatibility fix:** `b4c304c` — explicit recoverable empty-workout session view.

## Files Created/Modified

- `src/domains/workout/activeWorkout.ts` — versioned observations, targets, value sources, active/empty views, command inputs, results, and repository port.
- `src/domains/workout/setCommands.ts` — validation, warm-up/draft orchestration, exactly-once completion, and fail-open post-commit derivatives.
- `src/platform/sqlite/repositories/workoutRepository.ts` — source-backed queries and all atomic Plan 01-08 writes.
- `src/ui/screens/ActiveWorkoutScreen.tsx` — focused persisted workout state machine and accessible interaction composition.
- `src/ui/components/SetRow.tsx` — semantic active/saving/completed rows with large-text wrapping.
- `src/ui/components/SetRow.tsx` — ordered sources, inline load/reps and timed-hold values, adjacent Complete/Skip actions, saving state, fixed units, and focus retention.
- `src/ui/screens/ActiveWorkoutScreen.tsx` — exact save-failed Retry, focused workout orchestration, and finish states.
- `src/bootstrap/workoutAppRuntime.tsx` — injected active repository, source-backed route commands, authoritative refresh, and non-blocking derivative handling.
- `tests/integration/complete-set.test.ts` — database-level draft, source, warm-up, latch, duplicate, rollback, derivative failure, Undo, and empty-session proof.
- `src/ui/__tests__/ActiveWorkoutScreen.test.tsx` — accessibility, input equivalence, editor, warm-up, Retry, Undo, adaptive, large-text, and finish proof.

## Decisions Made

- Session target JSON now snapshots `incrementGrams`; using the current plan's increment later would violate immutable workout history.
- Planned session reads remain strongly typed through `getActiveWorkout`; the route uses separate `getWorkoutSession` for the planned-or-empty union.
- Automatic rest source state and its durable reconciliation effect are created in Plan 01-08, while notification draining/reconciliation remains explicitly owned by Plan 01-09.
- Post-commit derivative failures are swallowed only after source COMMIT, so a haptic/cache/drain problem cannot display `Set not saved`.
- The eight-second UI timeout is derived from the same completion timestamp passed to the source command; SQLite still makes the final Undo decision.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added exact source target and equipment increment snapshots**
- **Found during:** Task 1 value-source implementation
- **Issue:** Recommended values could not resolve the exact copied target, and manual increments could drift with later plan edits.
- **Fix:** Added `source_plan_working_set_target_id` and snapshotted `incrementGrams` in target JSON for working and warm-up sets.
- **Verification:** value-source integration ordering, snapshot assertion, retained migration fixture, 129 host SQLite contracts.
- **Committed in:** `e84c52b`, `96c657c`

**2. [Rule 1 - Bug] Kept post-commit derivatives from negating a saved set**
- **Found during:** Task 2 review
- **Issue:** A rejected invalidation, haptic, or drain callback could reject the command after source COMMIT and incorrectly show Retry.
- **Fix:** Made post-commit derivatives fail-open and preserved bounded runtime action metadata for secondary refresh failure.
- **Verification:** `returns committed source state when post-commit derivatives fail`; runtime refresh-failure contract.
- **Committed in:** `96c657c`

**3. [Rule 2 - Missing Critical] Completed timed-hold and large-text editor behavior**
- **Found during:** UI review
- **Issue:** Load/reps editing was complete, but timed holds needed a duration-specific manual editor and the sheet needed to scroll at 200% text.
- **Fix:** Added fixed-second manual controls/input, scrollable modal content, wrapping set rows, and invoking-focus restoration.
- **Verification:** timed-hold editor, manual input, dismiss/save focus surface, adaptive-width and reduced-motion component tests.
- **Committed in:** `96c657c`

**4. [Rule 1 - Bug] Preserved valid empty-workout entry**
- **Found during:** Final cross-plan regression review
- **Issue:** Plan 01-07 could start an empty session, but the new active read required at least one exercise and would show a corruption-style failure.
- **Fix:** Added an explicit source-backed `empty_workout` view and focused recoverable route state without fabricated exercise data.
- **Verification:** empty-session integration test, runtime typecheck, full coverage suite.
- **Committed in:** `b4c304c`

---

**Total deviations:** 4 auto-fixed (2 bugs, 2 missing critical contracts).
**Impact on plan:** Each fix was required to preserve authoritative source semantics, approved metric profiles, accessibility, or a previously shipped start mode. No rest controls, notification scheduler, progression engine, history correction, or new dependency was pulled forward.

## Issues Encountered

- The plan's literal `npm run test:coverage -- workout` command filters Jest by test path, excluding `complete-set.test.ts` and reporting the new repository as unexecuted. The authoritative unfiltered four-project coverage gate was used instead and passed.
- Plan 01-08 creates persisted automatic-rest state and an outbox row, but the actual notification reconciler/drainer is intentionally deferred to Plan 01-09. The runtime exposes the post-commit drain seam without fabricating an incomplete scheduler.

## User Setup Required

None - no external service configuration required.

## Test Evidence

- `npm run typecheck` — PASS.
- `npm run lint` — PASS, boundary check across 57 files.
- `npm run test:components -- ActiveWorkoutScreen --runInBand` — PASS, 62/62.
- `npm run test:integration -- complete-set --runInBand` — PASS, 47/47.
- `npm run test:unit -- workoutAppRuntime --runInBand` — PASS, 204/204 unit project tests.
- `npm run test:sqlite:host -- migrations-effects --runInBand` — PASS, 129/129.
- `npm run test:coverage -- --runInBand` — PASS, 442/442; 95.68% statements, 89.32% branches, 97.14% functions, 95.69% lines.

## Threat Flags

None. Repeated input, stale revisions, invalid observations, partial COMMIT, premature acknowledgement, Undo expiry, and stale rest effects have tested mitigations. All SQL remains parameterized.

## Next Phase Readiness

- Plan 01-09 can use persisted running/idle rest timestamps, next-set identity, monotonic rest revisions, stable reconciliation effects, immutable exercise rest durations, exact target observations, and the focused compact route.
- Plan 01-09 still owns pause/resume/±15/skip/manual rest, notification adapter/reconciler, foreground/permission/boot triggers, and process-death evidence.
- Plan 01-10 can use committed working-set observations, warm-up exclusion, explicit empty sessions, source target IDs, and the exact completion/Undo transaction model.
- No blocker remains for the recoverable rest tracer.

## Self-Check: PASSED

- All declared Plan 01-08 source, route, UI, haptics, migration, integration, and component artifacts exist.
- All four plan commits exist with the required TRAE trailer exactly once.
- Typecheck, boundaries, 442-test coverage gate, 129 host SQLite contracts, exact duplicate/rollback/derivative/Undo tests, timed-hold editor, empty-session compatibility, and generated-native exclusion all verify.
- Worktree is clean and no dependency or generated `android/`/`ios/` tree was added.

---
*Phase: 01-trustworthy-workout-loop*
*Completed: 2026-08-16*
