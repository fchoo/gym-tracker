---
phase: 13
plan: 11
subsystem: bodyweight-source-history
tags: [sqlite, bodyweight, revisions, receipts, portability]
requires: [13-02]
provides: [owner-scoped-bodyweight-history, schema-31-bodyweight-graph, logical-backup-format-5]
affects: [progress, portability, merge]
tech-stack:
  added: []
  patterns: [serialized-exclusive-write, receipt-first-replay, append-only-source-events, forward-only-migration]
key-files:
  created:
    - src/platform/sqlite/migrations/0031_bodyweight_source_history.ts
    - src/platform/sqlite/repositories/bodyweightRepository.ts
    - tests/integration/bodyweight-history.test.ts
  modified:
    - src/domains/bodyweight/contracts.ts
    - src/domains/portability/backupContracts.ts
    - src/domains/portability/restoreCommands.ts
decisions:
  - Bodyweight identity is an owner-scoped root with current lifecycle state and immutable dated correction events.
  - Logical backup format 5 adds the successor bodyweight graph while formats 1 through 4 remain frozen.
metrics:
  duration: 32m
  completed: 2026-10-07
status: complete
actuals:
  tokens: 85081
  tasks: 2
  commits: 3
---

# Phase 13 Plan 11: Dated Bodyweight Source History Summary

Independent owner-scoped bodyweight facts now use integer grams, local-date/timezone provenance, append-only correction events, and receipt-fenced SQLite writes without touching workout metrics or recommendations.

## Completed Tasks

1. Defined deterministic create, edit, delete, and restore transitions with canonical request hashing and typed validation/conflict outcomes.
2. Added durable SQLite persistence, replay receipts, protected-graph tests, schema-31 migration, and successor logical backup/restore graph coverage.

## Verification

- `npm run typecheck` — passed.
- `npm run lint` — passed (302 files).
- `npm run test:unit -- --runInBand src/domains/bodyweight/contracts.test.ts` — passed (9 tests).
- `npm run test:integration -- --runInBand tests/integration/bodyweight-history.test.ts` — passed (2 tests).
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/logicalBackupRepository.test.ts tests/sqlite-host/logicalRestoreRepository.test.ts tests/sqlite-host/migrations-effects.test.ts` — passed (228 tests).

## Decisions Made

- A bodyweight entry has a stable owner-scoped root and mutable current lifecycle only; every measured correction and deletion is recorded as an immutable event.
- Replays return the stored receipt result after restart; changed request hashes and stale revisions cannot stage a mutation.
- The old schema-28 tables and logical formats remain untouched. Schema 31 and logical backup format 5 carry the complete corrected aggregate instead.

## Deviations from Plan

### Approved Architectural Deviation

**1. [Approved] Added schema 31 and logical backup format 5 instead of writing schema-28 bodyweight tables**
- **Found during:** Task 2
- **Reason:** Schema 28's `bodyweight_revisions` and `bodyweight_tombstones` cannot represent stable owner identity, local-date/timezone provenance, lifecycle state, immutable correction events, and receipts safely.
- **Resolution:** Added forward-only migration `0031_bodyweight_source_history.ts`, immutable event/receipt triggers, successor backup format 5, restore reference edges, and migration coverage; schema 28 and formats 1–4 are unchanged.
- **Authorization:** Owner explicitly approved this blocking-human architectural change before continuation.
- **Commit:** 01abcb0

### Auto-fixed Issues

**1. [Rule 2 - Isolation] Removed a cross-domain scheduling import from the bodyweight contract**
- **Found during:** Task 2 boundary verification
- **Fix:** Replaced the internal scheduling helper with equivalent local ISO-date validation so bodyweight contracts remain domain-isolated.
- **Commit:** 01abcb0

## Known Stubs

None.

## Self-Check: PASSED

- Confirmed task commits `4e05cec`, `72db01d`, and `01abcb0` exist.
- Confirmed schema migration, repository, integration test, and this summary exist.
- Shared `.planning/STATE.md` and `.planning/ROADMAP.md` were not updated on this linked-worktree branch per continuation instruction.
