---
phase: 13-multi-plan-running-foundation
plan: 03
subsystem: running-source-graph
tags: [running, sqlite, immutable-revisions, schedule-slots, portability]
requires:
  - phase: 13-02
    provides: schema-28 Running tracer and per-sport active schedule pairing
provides:
  - stable Running session and slot roots with append-only revisions
  - canonical receipt-fenced Running graph command boundary
  - slot-qualified Running opportunity transitions
affects: [15-calendar, 17-garmin, 18-running-progress, portability]
tech-stack:
  added: []
  patterns:
    - additive schema successor for immutable root identity
    - frozen historical backup graphs with successor format versions
    - slot-qualified occurrence identity
key-files:
  created:
    - src/platform/sqlite/migrations/0029_running_session_roots.ts
    - src/domains/running/commands.ts
    - src/domains/running/commands.test.ts
    - tests/integration/running-foundation.test.ts
  modified:
    - src/domains/running/contracts.ts
    - src/platform/sqlite/repositories/runningPlanRepository.ts
    - src/domains/scheduling/scheduleState.ts
    - src/domains/portability/backupContracts.ts
decisions:
  - "D13-07 session identity is a stable root; revisions append under it and never replace it."
  - "D13-08 same-weekday uniqueness is scoped to stable Running slots, not Strength schedule bindings."
  - "Schema-28 and logical backup formats v1-v3 remain frozen; schema-29 and format v4 carry stable-root facts."
metrics:
  duration: 30 min
  completed: 2026-10-07
status: complete
actuals:
  tokens: 13604
  tasks: 3
  commits: 3
---

# Phase 13 Plan 03: Structured Running Source Graph Summary

**Strict seven-type Running contracts now persist through stable session roots, immutable revisions, ordered same-weekday slots, and slot-qualified opportunity transitions.**

## Performance

- **Tasks:** 3/3
- **Commits:** `7091631`, `22f19f2`, `9bedaf4`
- **Files modified:** 15
- **Verification:** focused unit tests, real-SQLite integration tests, and `npm run typecheck` passed.

## Accomplishments

- Defined strict, versioned contracts for Recovery, Long run, Progression, Tempo, Intervals, Hills, and Fartlek, including absence-preserving goals, benchmarks, training days, and advisory-only targets.
- Added schema 29 as an additive successor which separates durable session/slot identities from append-only revisions, receipts, and events.
- Added canonical command request hashing and revision/order validation before source-graph persistence enters the exclusive SQLite writer.
- Preserved independent same-day slot identities through persistence and added pure Running opportunity transitions that retain plan, schedule, version, stable slot, revision, local date, and IANA timezone provenance.

## Task Commits

1. **Task 1: Define strict seven-type Running, target, benchmark, and goal contracts** — `7091631`
2. **Task 2: Persist immutable Running revisions and multiple ordered same-weekday slots** — `22f19f2`
3. **Task 3: Add slot-aware Running opportunity transitions and activation readiness** — `9bedaf4`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Architectural correctness] Added a forward schema and portability successor for the locked stable-root invariant.**

- **Found during:** Task 2
- **Issue:** Schema 28 persists `running_session_revisions` directly against a plan and treats original slot rows as the source identity. It cannot preserve D13-07 stable session-root identity while adding immutable revisions, and mutating migration 0028 or logical backup format v3 would rewrite shipped history.
- **Fix:** Added additive migration 0029 with `running_session_roots`, slot roots/revisions, receipt/event tables, generation triggers, and repository persistence. Allocated logical backup format v4 while leaving v1-v3 table graphs frozen; added restore dependency and merge classifications.
- **Files modified:** `0029_running_session_roots.ts`, migration registry, Running repository/commands, backup contracts, backup collector, merge plan, and restore dependency graph.
- **Commit:** `22f19f2`

No historical migration or historical backup format was modified.

## Threat Surface

The source-authoring trust boundary remains local SQLite only. Schema-29 command receipts, canonical SHA-256 request hashes, expected revisions, strict contracts, append-only roots/revisions/events, and one `kernel.write` transaction mitigate tampering and repudiation at the boundary; no network endpoint, credential path, or file-access surface was introduced.

## Verification

- `npm run test:unit -- --runInBand src/domains/running/commands.test.ts src/domains/running/contracts.test.ts` — passed
- `npm run test:unit -- --runInBand src/domains/scheduling/scheduleState.test.ts src/domains/running/contracts.test.ts` — passed
- `npm run test:integration -- --runInBand tests/integration/running-foundation.test.ts tests/integration/schedule-commands.test.ts` — passed
- `npm run typecheck` — passed

## Known Stubs

None.

## Self-Check: PASSED

All listed artifacts exist, and commits `7091631`, `22f19f2`, and `9bedaf4` are reachable from this worktree branch.
