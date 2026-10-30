---
phase: 09-in-workout-exercise-editing
plan: 07
subsystem: workout, progression, schedule, native-ui
tags: [sqlite, progression, schedule, react-native, immutable-lineage, modified-from-plan]
requires:
  - phase: 09-06
    provides: immutable display-order edits and persisted modified-from-plan session state
provides:
  - progression and non-load outcomes gated by immutable planned target lineage
  - replay-safe, exactly-once scheduled opportunity consumption for edited sessions
  - persisted, accessible Modified from plan completion and detail cue
affects: [09-08, 09-09, 09-10, 10-advanced-set-timing, 11-portable-history-merge-restore]
actuals:
  tokens: 8408
  tasks: 3
  commits: 8
tech-stack:
  added: []
  patterns: [planned-lineage-only progression, consumed-opportunity retry readback, persisted provenance read model]
key-files:
  created: []
  modified:
    - src/platform/sqlite/repositories/workoutOutcomeRepository.ts
    - src/bootstrap/scheduleRuntime.tsx
    - src/domains/workout/sessionDetail.ts
    - src/ui/screens/WorkoutCompletionScreen.tsx
    - src/ui/screens/SessionDetailScreen.tsx
    - tests/integration/load-reps.test.ts
    - tests/integration/today-schedule-workout.test.ts
key-decisions:
  - "Only completed working sets with a non-null immutable target reference inside the selected planned occurrence target scope may affect load/reps recommendations or non-load policy outcomes."
  - "A second schedule-completion call first reads the persisted consumed opportunity for the session, avoiding a request-hash conflict after the schedule revision advances."
  - "Modified provenance is a required SessionDetail fact read from workout_sessions.modified_from_plan and is rendered as literal text plus an accessibility-hidden Pencil icon in existing native completion/detail flows."
requirements-completed: [WORK-24, WORK-25]
coverage:
  - id: D1
    description: Null-lineage added and replacement work cannot produce a load/reps recommendation, non-load outcome, policy advance, or plan-target mutation; eligible planned evidence remains intact.
    requirement: WORK-25
    verification:
      - kind: integration
        ref: tests/integration/load-reps.test.ts#ignores-a-completed-null-lineage-added-working-set-when-planned-working-sets-are-absent
        status: pass
      - kind: other
        ref: npm run test:coverage -- --runInBand
        status: pass
    human_judgment: false
  - id: D2
    description: An edited scheduled completed session consumes exactly one persisted opportunity and retries/relaunch calls return the refreshed schedule state without duplicate consumption.
    requirement: WORK-25
    verification:
      - kind: integration
        ref: tests/integration/today-schedule-workout.test.ts#consumes-an-edited-scheduled-session-exactly-once-across-a-retry
        status: pass
      - kind: other
        ref: npm run typecheck
        status: pass
    human_judgment: false
  - id: D3
    description: Persisted modified-from-plan provenance appears as exact literal text with non-color icon semantics in existing native completion and detail surfaces after rehydration.
    requirement: WORK-25
    verification:
      - kind: unit
        ref: src/ui/__tests__/WorkoutCompletionScreen.test.tsx#renders-the-literal-persisted-modified-cue-in-the-native-completion-flow
        status: pass
      - kind: integration
        ref: tests/integration/session-exercise-editing.test.ts#rehydrates-the-persisted-modified-from-plan-flag-after-an-edited-session-finishes
        status: pass
    human_judgment: false
metrics:
  duration: multi-session
  completed: 2026-09-16
status: complete
---

# Phase 09 Plan 07: Lineage, Scheduling, and Provenance Summary

**Edited workouts now consume their scheduled day exactly once while progression reads only immutable planned-lineage evidence, and completed native views state `Modified from plan` durably.**

## Performance

- **Duration:** Multi-session execution
- **Completed:** 2026-09-16
- **Tasks:** 3
- **Files modified:** 10 implementation and test files

## Accomplishments

- Gated load/reps recommendations to completed working sets with immutable legacy/owned target lineage inside the selected planned occurrence scope; added null-lineage work cannot manufacture a target recommendation or distort eligible planned evidence.
- Applied the same lineage boundary to factual non-load outcomes, preserving valid planned source evidence when an edited row adds completed null-lineage work.
- Kept finish-before-schedule ordering and made schedule retries/relaunch idempotent by reading the persisted consumed opportunity before rebuilding the schedule command.
- Carried `workout_sessions.modified_from_plan` through the required `SessionDetail` read model and rendered exact literal `Modified from plan` text with a Pencil icon in existing completion and workout-detail native surfaces.

## Task Commits

1. **Task 1: Enforce progression eligibility from immutable planned lineage** - `c155711`, `d43ff12`, `0b7fb04`, `f5c2812` (test/feat)
2. **Task 2: Consume one scheduled opportunity for modified sessions** - `9622569`, `2a4db24` (test/fix)
3. **Task 3: Surface durable Modified from plan state** - `32466ee`, `57ef6ce` (test/feat)

## Files Created/Modified

- `src/platform/sqlite/repositories/workoutOutcomeRepository.ts` - Filters progression and non-load evidence to immutable planned target lineage and supplies persisted modified provenance in SessionDetail.
- `src/bootstrap/scheduleRuntime.tsx` - Returns the current schedule state for an already consumed completed session, preserving exactly-once semantics through retry/relaunch.
- `src/domains/workout/sessionDetail.ts` - Makes persisted `modifiedFromPlan` an explicit completed/detail contract.
- `src/ui/screens/WorkoutCompletionScreen.tsx` and `src/ui/screens/SessionDetailScreen.tsx` - Render the exact textual, non-color `Modified from plan` cue in existing native flow surfaces.
- `tests/integration/load-reps.test.ts`, `tests/integration/today-schedule-workout.test.ts`, `tests/integration/session-exercise-editing.test.ts`, and `src/ui/__tests__/WorkoutCompletionScreen.test.tsx` - Prove lineage, schedule retry, persisted rehydration, themes, and accessibility semantics.

## Decisions Made

- Target lineage is interpreted as immutable source evidence, not a hint: a completed set is eligible only when it has a non-null source target reference belonging to the chosen plan occurrence’s target scope.
- Scheduled completion continues after the workout commit. Existing command receipts remain authoritative for initial consumption; the runtime’s persisted-opportunity check makes a later retry safe after schedule revision changes.
- `modifiedFromPlan` is required on `SessionDetail`, allowing native completion/detail views to distinguish actual persisted provenance from any transient UI action.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Null-lineage edited working sets could influence planned progression evidence**

- **Found during:** Task 1 test-first matrix expansion
- **Issue:** An added completed working set could cause a recommendation against a planned target when planned working sets were absent, and could invalidate a valid non-load outcome when planned evidence existed.
- **Fix:** Restricted load/reps and non-load evidence to completed working sets with immutable planned target lineage.
- **Files modified:** `src/platform/sqlite/repositories/workoutOutcomeRepository.ts`, `tests/integration/load-reps.test.ts`
- **Verification:** Focused integration suite and full coverage gate passed.
- **Committed in:** `d43ff12`, `f5c2812`

**2. [Rule 1 - Bug] Repeated schedule completion conflicted after the first schedule revision update**

- **Found during:** Task 2 retry/relaunch regression
- **Issue:** The stable request ID rebuilt against a newer schedule revision, changing the request hash and producing `schedule_request_identity_conflict` even though the opportunity was already consumed.
- **Fix:** Read the persisted consumed opportunity by completed session ID before attempting to rebuild a command.
- **Files modified:** `src/bootstrap/scheduleRuntime.tsx`, `tests/integration/today-schedule-workout.test.ts`
- **Verification:** Full today-schedule integration suite and typecheck passed.
- **Committed in:** `2a4db24`

**Total deviations:** 2 Rule 1 bug fixes required for deterministic immutable evidence and retry-safe schedule consumption. No migrations, receipt schema changes, plan write-back behavior, dashboard/web surface, browser flow, or external API were added.

## Issues Encountered

- The plan listed `src/bootstrap/scheduleRuntime.test.tsx`, but that file is not present in the checkout. The equivalent runtime behavior is proven through the existing real SQLite integration harness in `tests/integration/today-schedule-workout.test.ts`.
- The coverage suite emits the pre-existing Expo Go remote-notification warning while importing Expo notifications; the coverage gate itself passed.

## Verification

- `npm run test:integration -- --runInBand tests/integration/load-reps.test.ts tests/integration/session-exercise-editing.test.ts tests/integration/today-schedule-workout.test.ts` — 61 tests passed.
- `npm run test:components -- --runInBand src/ui/__tests__/WorkoutCompletionScreen.test.tsx` — 16 tests passed.
- `npm run test:coverage -- --runInBand` — passed.
- `npm run typecheck` — passed.
- `npm run lint` — boundary check passed (234 files).
- Five-axis code review — passed with no blocking findings.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 09-08 can build on the required `SessionDetail.modifiedFromPlan` fact and lineage/schedule invariants. It must preserve the separate edit/reorder receipt authorities, immutable snapshots, exactly-once scheduled consumption, and the completion/detail cue while implementing the later explicit plan write-back flow.

## Self-Check: PASSED

---
*Phase: 09-in-workout-exercise-editing*
*Plan: 07*
*Completed: 2026-09-16*
