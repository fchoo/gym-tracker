---
phase: 13-multi-plan-running-foundation
plan: 08
subsystem: sqlite-portability
tags: [sqlite, merge, backup, source-graph, running, bodyweight]
requires:
  - phase: 13-13
    provides: deterministic rebuild of lifecycle and current-match projections
provides:
  - owner-scoped source-graph merge planning for imported lifecycle, match ledgers, and bodyweight history
  - transactional source-graph writes with exact read-back and one automatic-backup generation handover
  - trigger-ownership regression coverage for every Phase 13 source family
affects: [automatic-backup, restore, merge, running-import, bodyweight]
actuals:
  tokens: 7578
  tasks: 3
  commits: 7
tech-stack:
  added: []
  patterns:
    - Phase 13 source facts merge as a dedicated owner-scoped graph, separate from workout sessions and rebuildable projections.
    - Bulk source-graph merge captures and byte-verifies trigger definitions before performing one generation handover.
key-files:
  created: []
  modified:
    - src/domains/portability/mergePlan.ts
    - src/platform/sqlite/repositories/logicalMergeRepository.ts
    - src/testing/contracts/portableMerge.contract.ts
    - tests/integration/automatic-drive-backup.test.ts
key-decisions:
  - Imported lifecycle evidence, match-ledger facts, and bodyweight history use a dedicated source_graph merge aggregate scoped to the portable owner namespace.
  - Current match projections are excluded from archive writes and rebuilt after the authoritative source graph commits.
  - A successful Phase 13 source-graph merge advances automatic backup generation exactly once while preserving trigger SQL byte-for-byte.
requirements-completed: [DOM-15, DOM-17]
coverage:
  - id: D1
    description: Phase 13 imported lifecycle and bodyweight source facts are planned as an owner-scoped graph with rebuild-only current matches excluded.
    requirement: DOM-15
    verification:
      - kind: unit
        ref: src/domains/portability/mergePlan.test.ts#plans a complete owner-scoped Phase 13 source graph
        status: pass
    human_judgment: false
  - id: D2
    description: Full-plan merge writes and verifies Phase 13 source facts atomically, then records one backup generation handover.
    requirement: DOM-17
    verification:
      - kind: unit
        ref: src/testing/contracts/portableMerge.contract.test.ts#portable-merge-phase13-source-generation-once
        status: pass
      - kind: integration
        ref: npm run test:sqlite:host -- --runInBand tests/sqlite-host/logicalMergeRepository.test.ts tests/sqlite-host/restoreReconciliationRepository.test.ts
        status: pass
    human_judgment: false
metrics:
  duration: 27 min
  completed: 2026-10-07
status: complete
---

# Phase 13 Plan 08: Complete Source-Graph Merge Summary

**Portable merge now plans imported lifecycle evidence, match-ledger facts, and bodyweight history as one owner-scoped source graph, commits it atomically with exact read-back, and advances automatic backup exactly once.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-10-07T14:16:51Z
- **Completed:** 2026-10-07T14:43:06Z
- **Tasks:** 3/3
- **Files modified:** 6

## Accomplishments

- Classified every Phase 13 imported-activity, match-ledger, and bodyweight source table as a dedicated `source_graph` aggregate; current-match projections remain rebuild-only.
- Preserved the approved MAP-01 per-sport activation semantics and rejected incompatible portable plan kinds before source mutation.
- Extended the exclusive full-plan writer to insert and exactly read back the source graph while preserving trigger definitions and recording a single generation handover.
- Added host-contract and migration ownership coverage for source graph idempotency, atomic failure boundaries, and automatic-backup trigger families.

## Task Commits

1. **Task 1: Plan complete successor merges and resolve activation once** — `6f14b3a`, `e798466`, `c0825ef`, `4b87835`, `f59e430`
2. **Task 2: Commit full-graph merge atomically and prove idempotent relaunch** — `5a991e0`
3. **Task 3: Prove automatic-backup generation completeness and historical trigger isolation** — `c2c2689`

## Verification

- `npm run test:unit -- --runInBand src/domains/portability/mergePlan.test.ts src/testing/contracts/portableMerge.contract.test.ts` — passed (77 tests).
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/logicalMergeRepository.test.ts tests/sqlite-host/restoreReconciliationRepository.test.ts` — passed (120 tests).
- `npm run test:integration -- --runInBand tests/integration/portable-merge.test.ts tests/integration/multi-plan-portability.test.ts tests/integration/automatic-drive-backup.test.ts` — passed (6 tests).
- `npm run typecheck -- --pretty false` — passed.

## Decisions Made

- The dedicated graph uses the owner namespace as its merge identity and uses canonical graph equality for duplicate no-ops.
- Unchanged portable identities deduplicate; changed accepted identity graphs fail closed as preview conflicts rather than overwriting immutable evidence.
- The merge writer suspends only Phase 13 source-generation triggers during graph insertion, restores their exact SQL, and increments generation once inside the same transaction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added single-generation handover for bulk source-graph merge**
- **Found during:** Task 2
- **Issue:** Per-row automatic-backup triggers would mark one accepted graph merge dirty multiple times.
- **Fix:** Captured and recreated all Phase 13 source trigger definitions around the graph write, then advanced generation once transactionally.
- **Files modified:** `src/platform/sqlite/repositories/logicalMergeRepository.ts`, `src/testing/contracts/portableMerge.contract.ts`
- **Verification:** Isolated portable-merge contract case proves the generation delta is exactly one.
- **Committed in:** `5a991e0`

---

**Total deviations:** 1 auto-fixed (Rule 2).
**Impact on plan:** Necessary integrity hardening; no scope expansion beyond the planned source-generation handover.

## Known Stubs

None.

## Threat Surface

No new network, credential, filesystem, or schema boundary was introduced. The existing archive-to-writer boundary is strengthened by owner-scoped graph classification, preview/fingerprint validation, exact read-back, and trigger parity checks.

## Next Phase Readiness

Restore and merge consumers can accept the complete Phase 13 source graph without treating derived current-match state as authoritative. Shared `STATE.md` and `ROADMAP.md` were intentionally left untouched because this is a linked-worktree continuation and the orchestrator owns integration.

## Self-Check: PASSED

- Confirmed all modified source, contract, and integration-test files exist on disk.
- Confirmed task commits `6f14b3a`, `e798466`, `c0825ef`, `4b87835`, `f59e430`, `5a991e0`, and `c2c2689` are reachable from this branch.
