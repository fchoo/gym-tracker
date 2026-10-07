---
phase: 13-multi-plan-running-foundation
plan: 05
subsystem: workout-schedule-runtime
tags: [sqlite, strength, scheduling, provenance, receipts]
requires:
  - phase: 13-03
    provides: slot-qualified opportunity source contracts
  - phase: 13-04
    provides: immutable receipt and source-evidence conventions
provides:
  - selected Strength occurrence contract carried from Today to the exclusive start writer
  - immutable workout-to-schedule provenance links and reconciliation receipts
  - completion reconciliation that uses captured provenance rather than current activation
affects: [15-workout-parity, 16-calendar-parity, 17-library-running-plans]
actuals:
  tokens: 1835
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns:
    - complete selected occurrence tuples are revalidated in the writer
    - legacy sessions remain recoverable without guessed provenance
key-files:
  created:
    - src/domains/scheduling/activePlanSelection.ts
    - src/platform/sqlite/migrations/0032_strength_occurrence_provenance.ts
  modified:
    - src/platform/sqlite/repositories/plansWorkoutRepository.ts
    - src/bootstrap/scheduleRuntime.tsx
    - src/bootstrap/workoutAppRuntime.tsx
key-decisions:
  - "A scheduled Strength start carries its opportunity, schedule/version, date/timezone, and revisions to the writer."
  - "Completion resolves immutable session provenance; it never discovers a new active schedule."
requirements-completed: [DOM-04, DOM-06, DOM-16]
coverage:
  - id: D1
    description: Exact selected Strength occurrences are revalidated and linked atomically at start.
    requirement: DOM-06
    verification:
      - kind: integration
        ref: tests/integration/today-schedule-workout.test.ts#starts only from the captured Strength opportunity and stores immutable provenance
        status: pass
    human_judgment: false
  - id: D2
    description: Runtime completion reconciles the original link and preserves legacy-session recovery.
    requirement: DOM-04
    verification:
      - kind: integration
        ref: tests/integration/today-schedule-workout.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Independent multi-plan contexts retain a global Strength recovery authority.
    requirement: DOM-16
    verification:
      - kind: integration
        ref: tests/integration/multi-plan-foundation-tracer.test.ts
        status: pass
    human_judgment: false
duration: 48 min
completed: 2026-10-07
status: complete
---

# Phase 13 Plan 05: Explicit Workout Occurrence Provenance Summary

**Strength starts now bind a selected schedule occurrence to immutable session provenance, so completion and replay cannot follow a later plan activation.**

## Performance

- **Duration:** 48 min
- **Tasks:** 2/2
- **Files modified:** 9

## Accomplishments

- Added a deterministic selected-Strength-occurrence contract that rejects ambiguous selection instead of picking an active row.
- Added schema-32 immutable workout schedule links and reconciliation receipts, then revalidates the complete identity/revision tuple inside the exclusive start transaction.
- Routed Today start and completion through captured provenance, while retaining a guarded legacy recovery path for historical sessions without attribution.

## Task Commits

1. **Task 1: Start and replay Strength workouts from one exact selected occurrence** — `6cc2ece` (RED), `763d032` (implementation)
2. **Task 2: Cut Today, schedule mutations, and completion over to explicit identities** — `a990b94`

## Decisions Made

- No scheduled start can resolve a scalar current active plan after selection; only the captured tuple is accepted by the writer.
- Existing legacy sessions are not backfilled or guessed. Their prior recovery behavior remains isolated from new provenance-aware starts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added an additive schema-32 provenance graph.**

- **Found during:** Task 1
- **Issue:** Existing schema-28 placeholders could not retain a Strength occurrence link or durable reconciliation receipt.
- **Fix:** Added immutable link and receipt tables, triggers, migration registration, and transaction validation.
- **Files modified:** `src/platform/sqlite/migrations/0032_strength_occurrence_provenance.ts`, repository/runtime consumers.
- **Verification:** focused unit, real-SQLite integration, type, and boundary checks passed.
- **Committed in:** `763d032`

## Verification

- `npm run test:unit -- --runInBand src/domains/scheduling/activePlanSelection.test.ts` — passed.
- `npm run test:integration -- --runInBand tests/integration/today-schedule-workout.test.ts tests/integration/schedule-commands.test.ts tests/integration/multi-plan-foundation-tracer.test.ts` — passed (52 tests).
- `npm run typecheck` — passed.
- `npm run lint` — passed (304 files).

## Known Stubs

None.

## Self-Check: PASSED

- Confirmed task commits `6cc2ece`, `763d032`, and `a990b94` are reachable.
- Confirmed the provenance migration, selection contract, repository/runtime consumers, and integration coverage exist.
- Shared `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally not updated on this linked-worktree branch.
