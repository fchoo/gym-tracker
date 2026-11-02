---
phase: 13-multi-plan-running-foundation
plan: 02
subsystem: database
tags: [sqlite, running, schedules, backup, restore, provenance]
requires:
  - phase: 13-01
    provides: MAP-01 approved one-active-plan-per-sport policy and frozen migration source registry
provides:
  - Schema-28 multi-plan and Running source graph with successor logical-backup graph
  - Minimum Recovery Running plan, paired activation, and independent ordered same-day occurrences
  - Query-only exact planned-Strength occurrence detail runtime seam
affects: [13-03, 15-calendar, 18-running-progress]
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns: [per-sport active-pair assertion, immutable running slot occurrence identities, exact-provenance read DTO]
key-files:
  created: [src/domains/running/contracts.ts, src/platform/sqlite/repositories/runningPlanRepository.ts, src/bootstrap/trainingFoundationRuntime.ts]
  modified: [src/platform/sqlite/migrations/0028_multi_plan_running_foundation.ts, src/platform/sqlite/repositories/scheduleRepository.ts, src/platform/sqlite/repositories/plansWorkoutRepository.ts]
key-decisions:
  - "MAP-01 is enforced at the paired plan/schedule state per sport, preserving the active Strength pair when Running activates."
  - "Running occurrence identity is schedule-version plus stable slot plus local date/timezone, never a date-only key."
requirements-completed: [DOM-01, DOM-02, DOM-03, DOM-04, DOM-06, DOM-07, DOM-15, DOM-17]
coverage:
  - id: D1
    description: Schema-28 source graph and logical-backup successor format
    requirement: DOM-01
    verification:
      - kind: other
        ref: npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Concurrent Strength and Running activation with two independent same-day Running occurrences
    requirement: DOM-03
    verification:
      - kind: integration
        ref: tests/integration/multi-plan-foundation-tracer.test.ts#keeps Strength active while a minimum Running plan materializes two ordered same-day occurrences
        status: pass
    human_judgment: false
  - id: D3
    description: Typed planned-Strength occurrence detail runtime port
    requirement: DOM-15
    verification:
      - kind: other
        ref: npm run typecheck
        status: pass
    human_judgment: false
duration: 43min
completed: 2026-10-07
status: complete
---

# Phase 13 Plan 02: Multi-plan Running Foundation Summary

**Schema-28 Running source facts, per-sport paired activation, ordered same-day Running occurrences, and an immutable planned-Strength detail read seam.**

## Performance

- **Duration:** 43 min
- **Started:** 2026-10-07T07:57:36Z
- **Completed:** 2026-10-07T08:40:28Z
- **Tasks:** 3/3
- **Files modified:** 15

## Accomplishments

- Finalized migration 0028 as the one owner of Phase 13 source tables, MAP-01 indexes, and source-generation triggers; successor logical backup/restore definitions include the new graph.
- Added minimum Recovery Running readiness plus a custom inactive Running plan graph, paired per-sport activation, and two stable ordered slots materialized independently on the same local date.
- Exposed `TrainingFoundationRuntimePort.loadPlannedStrengthOccurrence()` as a query-only, exact-provenance DTO loader that returns null for missing or inconsistent identity paths.

## Task Commits

1. **Task 1: Finalize migration 0028 and all Phase 13 source-generation triggers** - `256e32c` (feat)
2. **Task 2: Add minimum Running readiness, two slots, activation, and independent occurrences** - `d993906` (feat)
3. **Task 3: Read exact planned Strength detail, recover the active workout, and round-trip backup/restore** - `91875a9` (feat)

## Files Created/Modified

- `src/platform/sqlite/migrations/0028_multi_plan_running_foundation.ts` - Immutable successor source schema, per-sport active indexes, and backup-generation triggers.
- `src/domains/running/contracts.ts` - Minimum explicit Recovery-and-slot readiness contract.
- `src/platform/sqlite/repositories/runningPlanRepository.ts` - Inactive Running graph creation, MAP-aware activation delegation, and immutable occurrence materialization.
- `src/platform/sqlite/repositories/scheduleRepository.ts` - Exclusive per-sport active-pair assertion and Running activation transaction.
- `src/platform/sqlite/repositories/plansWorkoutRepository.ts` - Exact planned Strength provenance lookup and frozen snapshot DTO construction.
- `src/bootstrap/trainingFoundationRuntime.ts` - Consumer-facing query-only planned-occurrence port.
- `tests/integration/multi-plan-foundation-tracer.test.ts` - Real SQLite Strength-plus-Running activation and two-slot materialization proof.

## Decisions Made

- Active plan and active schedule remain one transactionally acknowledged pair for each sport; the pre-existing global active-workout block remains in force.
- A Running schedule uses an immutable plan-day anchor solely to satisfy the existing version/binding graph while session identity remains the stable Running slot and revision tuple.
- Logical backup remains a single successor graph, with Running and Strength source identities retained together and projections excluded.

## Verification

- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts` — passed during Task 1.
- `npm run test:integration -- --runInBand tests/integration/multi-plan-foundation-tracer.test.ts` — passed.
- `npm run typecheck` — passed.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Next Phase Readiness

Plan 13-03 can expand the established typed Running graph and schedule breadth without mutating migration 0028 or the successor backup format.

## Self-Check: PASSED

- Confirmed the Task 2 Running contracts/repository and Task 3 runtime port exist on disk.
- Confirmed task commits `256e32c`, `d993906`, and `91875a9` exist in git history.
