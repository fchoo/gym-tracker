---
phase: 02-owned-library-and-planning
plan: 16
subsystem: scheduling
tags: [sqlite, localdate, timezone, rotation, weekday, overrides, optimistic-concurrency, idempotency, tdd]

requires:
  - phase: 02-owned-library-and-planning
    provides: Pure LocalDate, timezone, Rotation, Weekday, override, and timezone transitions from Plan 02-03
  - phase: 02-owned-library-and-planning
    provides: Authoritative owned schedule source schema and starter activation from Plan 02-08
  - phase: 02-owned-library-and-planning
    provides: Final migration manifest and owned-plan revision contracts from Plan 02-11
provides:
  - Preview-bound prospective schedule version commands with complete immutable bindings
  - Stored-timezone effective opportunity and override read models
  - Atomic Rotation, Weekday, override, Train anyway, and timezone command persistence
  - Immutable event-backed request replay with expected schedule and plan revisions
  - Rollback, stale concurrency, session-fact, and historical immutability proof
affects: [today, schedule-editor, workout-completion, phase2-native-contracts, history]

actuals:
  tokens: 46143
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - Immutable schedule events carry canonical request receipts and committed results
    - Rotation pointers are reconstructed from the effective version plus later immutable pointer events
    - Effective LocalDate and weekday intent are resolved using each version's stored IANA timezone
    - Exact query invalidations run only after the serialized SQLite transaction commits

key-files:
  created:
    - src/domains/scheduling/scheduleCommands.ts
    - src/domains/scheduling/scheduleCommands.test.ts
    - src/platform/sqlite/repositories/scheduleRepository.ts
    - tests/integration/schedule-commands.test.ts
  modified: []

key-decisions:
  - "Schedule command request identity and committed replay results are stored in immutable schedule-event payloads, avoiding a second receipt authority."
  - "Rotation pointer state is never written back into an historical version; effective state folds later pointer events over the immutable version."
  - "Pending and consumed date overrides take precedence over recurring Weekday or Rotation intent in the effective read model."
  - "Following a device timezone appends a complete prospective version; keeping the current timezone records only the explicit decision event."
  - "Scheduled completion advances only after the referenced completed workout session matches plan, plan day, scheduled source, and start LocalDate."

patterns-established:
  - "Command boundary: validate and canonicalize input -> check immutable replay -> run pure transition -> persist one FIFO transaction -> invalidate exact keys."
  - "Historical boundary: versions, bindings, consumed opportunities, consumed overrides, sessions, and events are never rewritten."
  - "Effective-read boundary: stored timezone selects LocalDate/version, override wins for that date, and recurring intent is derived only when no override exists."

requirements-completed: [LIB-09]

coverage:
  - id: D1
    description: "D-40/D-41 prospective schedule saves append complete versions and bindings while preserving prior versions, opportunities, sessions, and history."
    requirement: LIB-09
    verification:
      - kind: unit
        ref: "src/domains/scheduling/scheduleCommands.test.ts#D-40/D-41 schedule version commands"
        status: pass
      - kind: integration
        ref: "tests/integration/schedule-commands.test.ts#schedule version persistence"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-42 through D-49 Rotation, Weekday, override, Train anyway, missed-day, start-LocalDate, and timezone commands persist exact immutable transition facts."
    requirement: LIB-09
    verification:
      - kind: unit
        ref: "src/domains/scheduling/scheduleCommands.test.ts#persisted schedule command orchestration tables"
        status: pass
      - kind: integration
        ref: "tests/integration/schedule-commands.test.ts#D-42 through D-49 persistence"
        status: pass
    human_judgment: false
  - id: D3
    description: "E-53 through E-58 ordering, empty state, IANA timezone, request replay, rollback, and concurrent expected-revision conflicts are executable."
    requirement: LIB-09
    verification:
      - kind: integration
        ref: "tests/integration/schedule-commands.test.ts#schedule repository edge contracts"
        status: pass
      - kind: other
        ref: "focused Jest coverage: 100% statements, branches, functions, and lines"
        status: pass
    human_judgment: false

duration: 1h 55m
completed: 2026-08-18
status: complete
---

# Phase 02 Plan 16: Complete Schedule Command Persistence Summary

**Prospective schedule versions, effective stored-timezone reads, and atomic Rotation, Weekday, override, and timezone commands now preserve every historical fact**

## Performance

- **Duration:** 1h 55m
- **Started:** 2026-08-18T09:21:32Z
- **Completed:** 2026-08-18T11:16:42Z
- **Tasks:** 2
- **Files modified:** 4
- **Implementation commits:** 4
- **Focused tests:** 80 passed
- **Focused production coverage:** 100% statements, branches, functions, and lines

## Accomplishments

- Added preview-token-bound schedule saves that validate complete before/after state, expected schedule and plan revisions, effective LocalDate, IANA timezone, stable binding order, and owned plan-day references before appending a version.
- Added effective schedule reads that resolve the applicable immutable version in its stored timezone, prioritize pending or consumed date overrides, derive Weekday/Rotation intent, and reconstruct Rotation pointers from immutable events.
- Added atomic persistence for Repeat, Skip, Advance, scheduled completion, Train anyway, explicit rotation advancement, Weekday missed outcomes, override create/replace/consume, and both exact timezone choices.
- Added immutable event-backed request replay, stale concurrency conflicts, transaction rollback proof, session-fact verification, exact post-commit invalidations, and malformed persisted-fact defenses.
- Proved the two production modules at 100% statements, branches, functions, and lines through 49 command tests and 31 real-SQLite integration tests.

## Task Commits

1. **Task 1 RED:** `fd8b5d8` — failing prospective schedule version and effective opportunity persistence contract.
2. **Task 1 GREEN:** `3c58a69` — preview-bound append-only versions, bindings, receipts, revisions, and stored-timezone reads.
3. **Task 2 RED:** `d3eb92c` — failing Rotation, Weekday, override, Train anyway, and timezone command tables.
4. **Task 2 GREEN:** `dcf49a6` — complete atomic schedule command persistence, replay, conflicts, overrides, pointers, and immutable history.

## Files Created/Modified

- `src/domains/scheduling/scheduleCommands.ts` — validates and canonicalizes schedule commands, binds previews, applies pure transitions, checks replay first, and invalidates exact keys after commit.
- `src/domains/scheduling/scheduleCommands.test.ts` — D-40 through D-49 command, validation, replay, invalidation, and mode-boundary tables.
- `src/platform/sqlite/repositories/scheduleRepository.ts` — atomic version/action/override/timezone transactions plus effective stored-timezone read models.
- `tests/integration/schedule-commands.test.ts` — real SQLite rollback, concurrency, immutable history, request replay, session-fact, empty-state, malformed-state, and timezone proof.

## Decisions Made

- Immutable `owned_plan_schedule_events` rows are the single command receipt authority: payloads retain request ID, canonical SHA-256, domain events, and committed result for exact replay.
- Rotation pointer changes are append-only events. Historical `owned_plan_schedule_versions.rotation_pointer` remains unchanged and later reads fold only subsequent pointer events onto the effective version.
- A pending or consumed override is the effective fact for its LocalDate. Recurring Weekday or Rotation intent is not exposed concurrently for that date.
- `Follow device timezone from today` appends a complete version later than the current version's effective date. `Keep current timezone` records the explicit prospective decision without cloning an unchanged version.
- Completion cannot advance a schedule from a caller assertion alone; the repository validates the referenced completed scheduled session and its immutable start LocalDate inside the same transaction.

## Deviations from Plan

None - plan executed within the four specified implementation and test files.

## Issues Encountered

- A Jest table callback briefly accepted a second parameter, which Jest interpreted as the asynchronous `done` callback and timed out otherwise-completed rows. The table now derives IDs from the row name and completes normally.
- Strict discriminated unions exposed places where Rotation pointers, branded LocalDates, stored timezones, and empty tuples needed exact types. The final contracts encode those invariants directly.
- The first coverage pass exposed duplicated schema-impossible guards and missing public edge cases. Redundant guards were simplified, while executable conflict, replay, empty-state, malformed-fact, and override-precedence cases were added until both production modules reached 100% all metrics.

## TDD Gate Compliance

- Task 1 RED commit `fd8b5d8` failed because `scheduleCommands.ts` and `scheduleRepository.ts` did not exist.
- Task 1 GREEN commit `3c58a69` passed the exact tracer integration command, and the autonomous tracer feedback gate passed again after commit.
- Task 2 RED commit `d3eb92c` failed because the complete command exports and repository methods were absent.
- Task 2 GREEN commit `dcf49a6` passed all focused unit/integration tests, typecheck, lint, and 100% all-metrics focused coverage.

## Known Stubs

None.

## Threat Model Verification

- **T-02-03 owned authority:** every version binding and plan-day override is checked against the schedule's owned plan before persistence.
- **T-02-04 expected revisions/request IDs:** commands run in the FIFO `BEGIN IMMEDIATE` writer, reject stale schedule/plan/override revisions, and replay only exact canonical request hashes.
- **T-02-05 silent advancement/timezone history:** only eligible scheduled completion or explicit Skip/Advance/advance intent changes the pointer; timezone follow appends a prospective version and never rewrites earlier dates.
- **T-02-07 diagnostic disclosure:** public errors expose bounded stable codes and safe identifiers/dates/revisions, not SQL or owner-entered workout data.
- No new network endpoint, authentication path, file access pattern, dependency, or schema migration was introduced.

## User Setup Required

None - no package installation, external service configuration, or credentials required.

## Verification

- `npm run test:unit -- --runInBand src/domains/scheduling/scheduleCommands.test.ts` — 49 tests passed.
- `npm run test:integration -- --runInBand tests/integration/schedule-commands.test.ts` — 31 tests passed.
- Plan Task 1 exact tracer command — 4 schedule-version integration cases passed before expansion.
- Focused combined Jest coverage — 80 tests passed; both production modules reached 100% statements, branches, functions, and lines.
- `npm run typecheck` — passed.
- `npm run lint` — boundary check passed for 118 files.
- Stub/skip scan — no TODO, FIXME, skipped test, or placeholder implementation.
- Immutable-write scan — no update of schedule versions/bindings, workout sessions, or consumed historical facts.

## Next Phase Readiness

- Today and schedule-editor integration can consume one authoritative effective read model and invoke explicit source commands without duplicating calendar, override, pointer, or timezone semantics.
- Workout completion can advance Rotation safely by presenting the already-committed session fact and expected revisions.
- Phase 2 native contracts can reuse the same repository API for Weekday/Rotation, override, midnight, DST, replay, rollback, and concurrency cases.
- No blockers, known stubs, unrun verification, or new threat flags remain.

## Self-Check: PASSED

- All four Plan 02-16 implementation/test files and this summary exist.
- RED/GREEN commits `fd8b5d8`, `3c58a69`, `d3eb92c`, and `dcf49a6` exist in repository history.
- Summary actuals, coverage evidence, requirement mapping, and immutable-history claims match the verified diff and test output.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-18*
