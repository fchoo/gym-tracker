---
phase: 07-post-candidate-ux-refinement
plan: 01
subsystem: database
tags: [sqlite, migrations, logical-backup, restore, idempotency]
requires: []
provides:
  - "Schema-17 immutable removal-request receipts that survive hard deletion"
  - "Explicit logical-restore compatibility for producer schemas 15 through 17"
affects: [workout-removal-commands, portability, SQLite migration runner]
actuals:
  tokens: 3668.75
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns:
    - "Append-only STRICT SQLite migration verified against its normalized DDL"
    - "Operational idempotency metadata excluded from logical user-data backups"
key-files:
  created:
    - src/platform/sqlite/migrations/0017_workout_remove_receipts.ts
  modified:
    - src/platform/sqlite/migrations/index.ts
    - tests/sqlite-host/migrations-effects.test.ts
    - src/domains/portability/restoreCommands.ts
    - src/domains/portability/restoreCommands.test.ts
key-decisions:
  - "Keep removal receipts foreign-key-free and immutable so hard deletion cannot remove replay metadata."
  - "Accept schema 17 only through the explicit restore allowlist; keep receipts out of logical backup ownership."
patterns-established:
  - "Durable command replay records retain stable request, identity, revision, result, and commit metadata only."
  - "Future logical-producer versions fail closed until an explicit compatibility test and allowlist update ship."
requirements-completed: [UX-18]
coverage:
  - id: D1
    description: "Schema-17 STRICT immutable removal receipts survive their target-row deletion boundary without foreign keys."
    requirement: UX-18
    verification:
      - kind: integration
        ref: "npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "Logical backups from schemas 15, 16, and 17 restore through the existing fail-closed preflight, while receipts remain outside logical backup tables."
    requirement: UX-18
    verification:
      - kind: unit
        ref: "npm run test:unit -- --runInBand src/domains/portability/restoreCommands.test.ts"
        status: pass
      - kind: integration
        ref: "npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts"
        status: pass
    human_judgment: false
duration: 10min
completed: 2026-09-06
status: complete
---

# Phase 7 Plan 01: Durable Removal-Receipt Foundation Summary

**Schema-17 immutable SQLite removal receipts and explicit schemas 15–17 logical-restore support establish durable hard-delete replay metadata without adding it to user-owned backup facts.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-06T13:20:00Z
- **Completed:** 2026-09-06T13:29:58Z
- **Tasks:** 2/2
- **Files modified:** 5 implementation/test files
- **Actual implementation diff:** 14,675 characters / 4 = 3,668.75 estimate tokens

## Accomplishments

- Added append-only schema migration 17 with a STRICT, bounded, immutable workout_remove_receipts table keyed by request ID and canonical SHA-256 request hash.
- Registered migration 17 after the immutable historical prefix and tested clean-install and schema-16 upgrade contracts, including strict DDL, foreign-key absence, and immutability behavior.
- Extended only the logical producer-version allowlist to schema 17, preserving schema-15/16 support and fail-closed rejection of schemas 14 and 18.
- Confirmed receipt rows remain operational retry metadata and never enter LOGICAL_BACKUP_TABLES.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the durable removal-receipt migration** — efc727c (feat)
2. **Task 2: Preserve logical restore compatibility across schema 17** — df77d4b (feat)

**Plan metadata:** committed separately after this summary is self-checked.

## Files Created/Modified

- src/platform/sqlite/migrations/0017_workout_remove_receipts.ts — schema-17 STRICT removal-receipt table, immutable triggers, and fail-closed verifier.
- src/platform/sqlite/migrations/index.ts — append-only registration of migration 17 after migration 16.
- tests/sqlite-host/migrations-effects.test.ts — clean/upgrade migration contract and immutable receipt tests.
- src/domains/portability/restoreCommands.ts — explicit producer-schema compatibility allowlist through version 17.
- src/domains/portability/restoreCommands.test.ts — schema 15–17 acceptance, 14/18 rejection, and backup-table ownership regression coverage.

## Decisions Made

- Kept receipts free of foreign keys to workout_sessions and session_sets; a receipt must remain after the row it records is hard-deleted.
- Stored only replay-safe request, identity, revision, result, and commit-time metadata in receipts—not workout observations, UI state, or logical backup facts.
- Preserved the existing pre-mutation restore validation path and enlarged only its explicit producer-version allowlist.

## Verification

- npm run test:unit -- --runInBand src/domains/portability/restoreCommands.test.ts — passed (50 tests).
- npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts — passed (113 tests).
- npm run typecheck — passed.
- git diff --check d3fdd0e7c48314786d4ef857305342e7d8a47292..HEAD — passed.

The restore unit suite emits deliberate codec-error diagnostic output while asserting its public error mapping; all tests passed.

## Deviations from Plan

None — the implementation follows the approved migration, restore-compatibility, and backup-ownership contracts.

## Issues Encountered

- The local test environment initially lacked the repository’s declared Jest dependencies. npm ci restored the lockfile-defined toolchain without tracked source or configuration changes. npm reported a Node engine advisory because the local runtime was Node 26 while the project targets Node 24; the focused suites and typecheck passed.

## User Setup Required

None — no external service or device configuration is required for this database and restore-contract foundation.

## Next Phase Readiness

Later D-01 removal-command work can write an immutable request receipt in the same committed transaction as a hard deletion, then replay that committed result safely. Logical export/restore continues to own only source user facts.

## Self-Check

PASSED

- Confirmed all five implementation/test artifacts exist in the worktree.
- Confirmed task commits efc727c and df77d4b exist in repository history.
- Confirmed the summary artifact exists and git diff --check passes.

---
*Phase: 07-post-candidate-ux-refinement*
*Plan: 01*
*Completed: 2026-09-06*
