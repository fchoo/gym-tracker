---
phase: 13-multi-plan-running-foundation
plan: 13
subsystem: sqlite-reconciliation
tags: [sqlite, restore, merge, rebuild, running, portability]
requires:
  - phase: 13-07
    provides: schema-35 v6 source graph with rebuild-only current relations
provides:
  - deterministic, source-derived rebuild of imported lifecycle and Running current-match relations
  - parity-gated restore readiness that leaves automatic backup generation unchanged
affects: [13-14-merge, 13-15-calendar-progress, 13-16-integration]
actuals:
  tokens: 5214
  tasks: 2
  commits: 4
tech-stack:
  added: []
  patterns:
    - event-ledger reconstruction of rebuildable current relations
    - temporary captured trigger suspension for generation-neutral derived writes
key-files:
  created: []
  modified:
    - src/platform/sqlite/repositories/restoreReconciliationRepository.ts
    - tests/sqlite-host/restoreReconciliationRepository.test.ts
    - tests/integration/multi-plan-portability.test.ts
key-decisions:
  - "Imported lifecycle and Running current matches rebuild from immutable ledgers before history, Calendar, Progress, recommendation, and search consumers can become trusted."
  - "The two lifecycle generation triggers are captured, dropped, exactly restored, and parity-checked so derivative recovery cannot dirty automatic backup state."
patterns-established:
  - "Restore rebuilds may use a narrow, transaction-scoped trigger suspension only for rebuild-only state and must verify trigger byte parity before committing."
requirements-completed: [DOM-13, DOM-15, DOM-17]
coverage:
  - id: D1
    description: Restored Phase 13 lifecycle and current Running match relations are rebuilt from durable source ledgers before readiness.
    requirement: DOM-15
    verification:
      - kind: unit
        ref: tests/sqlite-host/restoreReconciliationRepository.test.ts#rebuilds Phase 13 current lifecycle from immutable source without advancing backup generation
        status: pass
    human_judgment: false
  - id: D2
    description: Every rebuild subject fails closed, relaunches safely, and repeated completion preserves source and generation parity.
    requirement: DOM-13
    verification:
      - kind: unit
        ref: tests/sqlite-host/restoreReconciliationRepository.test.ts#retains rebuild_pending after a fault and relaunch retries without source or backup mutation
        status: pass
      - kind: integration
        ref: npm run test:integration -- --runInBand tests/integration/multi-plan-portability.test.ts
        status: pass
    human_judgment: false
metrics:
  duration: 25 min
  completed: 2026-10-07
status: complete
---

# Phase 13 Plan 13: Deterministic Post-Restore Rebuild Summary

**Restored or merged v6 source facts now reconstruct imported lifecycle and Running match projections deterministically, remain untrusted until exact parity succeeds, and never advance automatic-backup generation.**

## Performance

- **Duration:** 25 min
- **Completed:** 2026-10-07T13:56:51Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments

- Rebuilt Phase 13 current lifecycle and match projections from immutable event ledgers before downstream history, Calendar, Progress, recommendation, and search work.
- Guarded the `rebuild_pending` to `ready` transition with exact current-relation, history, and search parity.
- Added real-SQLite fault, relaunch, retry, and repeat coverage that proves no duplicate facts or automatic-backup generation changes.

## Task Commits

1. **Task 1 RED: Rebuild Phase 13 derivatives in source dependency order** — `038f92f`
2. **Task 1 GREEN: Rebuild Phase 13 derivatives in source dependency order** — `3b7aa7b`
3. **Task 2 RED: Prove rebuild fault, relaunch, repeat, and idempotency behavior** — `1b9c1ad`
4. **Task 2 GREEN: Prove rebuild fault, relaunch, repeat, and idempotency behavior** — `80ef855`

## Verification

- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/restoreReconciliationRepository.test.ts` — passed (16 tests).
- `npm run test:integration -- --runInBand tests/integration/multi-plan-portability.test.ts` — passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed (310 files).

## Decisions Made

- Current lifecycle derives from each imported activity's latest immutable event at the durable aggregate revision.
- Current Running matches derive from each activity's latest match-ledger event only when the activity lifecycle remains active.
- Trigger definitions are captured and byte-compared after recreation; failure leaves the transaction rolled back and the restore `rebuild_pending`.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Surface

The restored-source to trusted-projection boundary is now explicitly guarded by source-derived parity and a conditional ready-state transition. No network, credential, filesystem, or new schema surface was introduced.

## Next Phase Readiness

Restore and merge consumers can rely on Phase 13 current relations only after deterministic parity succeeds. Shared `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally left untouched for the orchestrator.

## Self-Check: PASSED

- Confirmed the reconciliation repository and both focused test files exist on disk.
- Confirmed task commits `038f92f`, `3b7aa7b`, `1b9c1ad`, and `80ef855` are reachable from this worktree branch.
