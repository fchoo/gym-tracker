---
phase: 13-multi-plan-running-foundation
plan: 07
subsystem: portability
tags: [sqlite, backup, restore, running, garmin, bodyweight]
requires:
  - phase: 13-02
    provides: frozen v1-v3 portability contracts
  - phase: 13-15
    provides: schema-35 source graph consumers
provides:
  - frozen v1-v5 readers and a schema-35 v6 source archive graph
  - trigger-safe, atomic successor clean restore with rebuild-only projections
affects: [13-13-reconciliation, drive-backup, merge, Garmin-import]
tech-stack:
  added: []
  patterns:
    - version-specific portable table graphs
    - captured SQLite trigger restoration around source replacement
key-files:
  created:
    - tests/integration/multi-plan-portability.test.ts
  modified:
    - src/domains/portability/backupContracts.ts
    - src/domains/portability/restoreCommands.ts
    - src/platform/sqlite/repositories/logicalBackupRepository.ts
    - src/platform/sqlite/repositories/logicalRestoreRepository.ts
key-decisions:
  - "v1-v5 remain frozen; schema 35 uses successor archive format v6."
  - "Current match and imported lifecycle relations are rebuildable projections and remain outside v6 source snapshots."
actuals:
  tokens: 8491
  tasks: 2
  commits: 5
requirements-completed: [DOM-15, DOM-17]
coverage:
  - id: D1
    description: Complete schema-35 source facts collect into a bounded v6 archive while historical graphs remain unchanged.
    requirement: DOM-17
    verification:
      - kind: unit
        ref: src/domains/portability/backupContracts.test.ts#freezes v1-v5 while the schema-35 successor carries every durable Phase 13 fact
        status: pass
      - kind: integration
        ref: tests/integration/multi-plan-portability.test.ts#keeps every pre-schema-35 archive graph frozen while v6 owns complete source replay
        status: pass
    human_judgment: false
  - id: D2
    description: Successor clean restore validates schema closure and preserves rollback, trigger, and rebuild-pending guards.
    requirement: DOM-15
    verification:
      - kind: unit
        ref: src/domains/portability/restoreCommands.test.ts#accepts only the schema-35 successor archive after all Phase 13 source facts exist
        status: pass
      - kind: other
        ref: npm run test:sqlite:host -- --runInBand tests/sqlite-host/logicalRestoreRepository.test.ts
        status: pass
    human_judgment: false
metrics:
  duration: 12 min
  completed: 2026-10-07
status: complete
---

# Phase 13 Plan 07: Complete Portable Source Graph Summary

**Frozen legacy archive readers now coexist with a schema-35 v6 archive that captures every durable Phase 13 source fact and restores it atomically while leaving rebuilt projections untrusted.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-07T13:10:34Z
- **Completed:** 2026-10-07T13:23:02Z
- **Tasks:** 2/2
- **Files modified:** 10

## Accomplishments

- Added v6 as the schema-35 successor graph while retaining exact v1-v5 table graphs and readers.
- Included durable imported-activity identity/events, Strength schedule provenance/receipts, correction receipts, and running match ledger facts; excluded mutable current-match and lifecycle projections.
- Made collection graph-version-aware and made clean restore suspend/capture every relevant Phase 13 source trigger, clear only rebuildable projections, validate sport-aware active pairs, and retain the existing transactional rollback/readiness barrier.

## Task Commits

1. **Task 1: Harden the tracer's successor backup graph for every implemented source fact** — `c41c972` (RED), `de364b4` (GREEN).
2. **Task 2: Validate and restore old or successor graphs atomically** — `156d46e` (RED), `5d2894d` (GREEN), `3106b12` (integration proof).

## Files Created/Modified

- `src/domains/portability/backupContracts.ts` — versioned archive-table graphs through v6 and exact keys.
- `src/platform/sqlite/repositories/logicalBackupRepository.ts` — collects only the active format's source graph.
- `src/domains/portability/restoreCommands.ts` — schema-35 compatibility, references, and MAP-aware preflight.
- `src/platform/sqlite/repositories/logicalRestoreRepository.ts` — successor trigger capture, source replacement, and projection clearing.
- `tests/integration/multi-plan-portability.test.ts` — frozen legacy/v6 source-graph matrix.

## Decisions Made

- Added a forward-only v6 format because v5 predated schema 32-35 durable facts; existing producer readers and historical table graphs remain untouched.
- `running_activity_current_matches` and `imported_activity_current_lifecycle` are explicitly rebuildable. Restore clears them inside its transaction and returns `rebuild_pending` rather than serializing mutable current state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added a forward-compatible v6 archive graph.**

- **Found during:** Task 1
- **Issue:** The finalized v5 graph predates durable schema 32-35 provenance, correction, imported evidence, and match-ledger tables. Collecting it would make source history unrecoverable.
- **Fix:** Froze v1-v5 definitions and added v6 for every missing durable source table, excluding only explicit rebuildable projections.
- **Files modified:** `backupContracts.ts`, `logicalBackupRepository.ts`, `mergePlan.ts`, and coverage tests.
- **Verification:** focused unit, integration, real-SQLite, and type checks passed.
- **Committed in:** `de364b4`

**2. [Rule 2 - Missing critical functionality] Expanded restore's captured trigger set to Phase 13 successor sources.**

- **Found during:** Task 2
- **Issue:** The former allowlist covered only older migration triggers, so immutable successor rows could not be safely replaced or have their exact database triggers restored.
- **Fix:** Captured and restored all successor source triggers, validated the schema-35 closure, and cleared only deterministic current projections before replacement.
- **Files modified:** `restoreCommands.ts`, `logicalRestoreRepository.ts`, and restore tests.
- **Verification:** real-SQLite fault matrix passed for every transaction stage.
- **Committed in:** `5d2894d`

**Total deviations:** 2 auto-fixed (Rule 2).

## Known Stubs

None.

## Next Phase Readiness

Plan 13-13 can deterministically rebuild `running_activity_current_matches` and `imported_activity_current_lifecycle` from restored immutable facts. Shared STATE/ROADMAP tracking was intentionally left to the orchestrator.

## Self-Check: PASSED

- Confirmed the v6 contract, collection and restore repositories, and portability integration test exist on disk.
- Confirmed task commits `c41c972`, `de364b4`, `156d46e`, `5d2894d`, and `3106b12` are reachable from this worktree branch.

