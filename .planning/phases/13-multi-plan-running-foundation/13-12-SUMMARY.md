---
phase: 13-multi-plan-running-foundation
plan: 12
subsystem: schedule-collision-calendar-reads
tags: [scheduling, collisions, calendar, sqlite, query-only]
requires:
  - phase: 13-03
    provides: slot-qualified Running opportunity identities
  - phase: 13-04
    provides: immutable imported activity source facts
  - phase: 13-05
    provides: selected Strength occurrence provenance
provides:
  - append-only collision decisions and prospective move intents with exact source identity
  - typed bounded Today and Calendar event range reads
affects: [15-workout-parity, 16-calendar-parity, 18-running-progress]
tech-stack:
  added: []
  patterns:
    - selected-only pure schedule transition boundary
    - frozen multi-source calendar DTOs behind a query-only port
key-files:
  created:
    - src/platform/sqlite/repositories/trainingCalendarRepository.ts
    - tests/sqlite-host/trainingCalendarRepository.test.ts
  modified:
    - src/domains/scheduling/scheduleState.ts
    - src/domains/scheduling/scheduleCommands.ts
    - src/bootstrap/trainingFoundationRuntime.ts
    - tests/integration/running-foundation.test.ts
decisions:
  - "Collision decisions capture exact Strength and Running opportunity identities, expected revisions, version IDs, slot identity, and source timezones."
  - "Move decisions append a prospective intent without rewriting either source occurrence; Keep both appends only the decision event."
  - "Today and Calendar reads are bounded source queries and do not use current schedule activation as a history filter."
metrics:
  duration: 29 min
  completed: 2026-10-07
status: complete
actuals:
  tokens: 5920
  tasks: 2
  commits: 4
---

# Phase 13 Plan 12: Independent Scheduling and Bounded Calendar Reads Summary

**Exact collision identities now isolate Strength and Running mutations, while frozen bounded Calendar reads expose separate Strength, Running-slot, and imported-activity facts without materializing new state.**

## Accomplishments

- Added a pure selected-schedule transition that fences revisions and preserves the unselected schedule snapshot unchanged, including its local date and stored IANA timezone.
- Added validated append-only collision-decision commands for Move run, Move strength, and Keep both. Moves carry a prospective intent keyed to the selected exact occurrence; neither historical source fact is rewritten.
- Added a typed `TrainingFoundationRuntimePort` Today method and bounded Calendar-range method, preserving the existing `loadPlannedStrengthOccurrence(occurrenceId)` signature.
- Added bounded, deterministic, frozen multi-source event reads for Strength opportunities, independently addressable Running slots, and active imported activities. Reads use no writer and do not apply current-lifecycle filtering to Strength history.

## Task Commits

1. **Task 1 RED: Define selected collision semantics** — `8cc08e1`
2. **Task 1 GREEN: Isolate collision decisions by schedule** — `d69c53c`
3. **Task 2 RED: Define bounded Calendar source reads** — `cf2b9ad`
4. **Task 2 GREEN: Expose bounded training Calendar reads** — `9544f64`

## Verification

- `npm run test:unit -- --runInBand src/domains/scheduling/scheduleState.test.ts` — passed (43 tests).
- `npm run test:integration -- --runInBand tests/integration/running-foundation.test.ts tests/integration/schedule-commands.test.ts` — passed (41 tests).
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/trainingCalendarRepository.test.ts tests/sqlite-host/historyRepository.test.ts` — passed (8 tests).
- `npm run typecheck` — passed.
- `npm run lint` — passed (305 files).

## TDD Gate Compliance

- RED commits `8cc08e1` and `cf2b9ad` precede their corresponding GREEN commits `d69c53c` and `9544f64`.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Surface

The selected-occurrence boundary is guarded by complete schedule/version/slot/revision identities, preventing cross-schedule mutation ambiguity. Calendar reads are bounded by local-date range parameters, use three grouped source queries rather than per-event reads, return frozen DTOs, and make no source mutations. No network, credential, or file-access surface was added.

## Self-Check: PASSED

- Confirmed the calendar repository, runtime port, collision transition implementation, and both focused test files exist on disk.
- Confirmed task commits `8cc08e1`, `d69c53c`, `cf2b9ad`, and `9544f64` exist in git history.
- Shared `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally not updated on this linked-worktree branch per orchestration instruction.
