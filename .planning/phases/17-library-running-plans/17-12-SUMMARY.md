---
phase: 17-library-running-plans
plan: "12"
subsystem: scheduling
tags: [sqlite, running, strength, schedule-collision, accessibility, portability]
requires:
  - phase: 17-08
    provides: factual D17-08 collision decision contract and UI wording
provides:
  - append-only, revision-fenced collision outcomes and idempotency receipts
  - accessible factual review and confirmation for Move run, Move strength, and Keep both
  - collision history backup, restore, merge remapping, and projection rebuild support
affects: [running-plan-detail, schedule-projection, logical-backup, logical-restore, logical-merge]
actuals:
  tokens: 13837
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns:
    - immutable SQLite source fact plus rebuildable current-intent projection
    - revision-bound preview token with exclusive idempotent confirmation
    - owned-plan merge maps rewrite immutable cross-plan references
key-files:
  created:
    - src/domains/scheduling/collisionCommands.ts
    - src/platform/sqlite/migrations/0040_schedule_collision_outcomes.ts
    - src/platform/sqlite/repositories/scheduleCollisionRepository.ts
    - src/ui/components/ScheduleConflictSheet.tsx
    - tests/integration/running-schedule-collision.test.ts
  modified:
    - src/bootstrap/runningPlanRuntime.tsx
    - app/library/running/[planId].tsx
    - src/domains/portability/backupContracts.ts
    - src/domains/portability/mergePlan.ts
    - src/platform/sqlite/repositories/logicalBackupRepository.ts
    - src/platform/sqlite/repositories/logicalRestoreRepository.ts
    - src/platform/sqlite/repositories/logicalMergeRepository.ts
    - src/ui/screens/RunningPlanDetailScreen.tsx
key-decisions:
  - "Option A: persist collision decisions as append-only SQLite source facts with immutable receipts and a rebuildable projection."
  - "Both Strength and Running identities and revisions fence every preview and exclusive confirmation."
  - "Same-weekday Running sessions remain independent: only the reviewed stable occurrence can move."
patterns-established:
  - "Collision review: no outcome is selected by default; a second factual confirmation owns the write."
  - "Portable source facts: rewrite all imported owned-plan references before inserting immutable receipts."
requirements-completed: [LIB-24, LIB-36]
coverage:
  - id: D1
    description: Factual three-choice collision review with stale retry, cancellation, and focus return.
    requirement: LIB-36
    verification:
      - kind: automated_ui
        ref: npm run test:components -- --runInBand src/ui/components/ScheduleConflictSheet.test.tsx src/ui/__tests__/RunningPlanDetailScreen.test.tsx
        status: pass
    human_judgment: false
  - id: D2
    description: Atomic append-only collision command with all outcomes, revision fences, replay safety, and deterministic projection rebuild.
    requirement: LIB-24
    verification:
      - kind: integration
        ref: npm run test:integration -- --runInBand tests/integration/running-schedule-collision.test.ts
        status: pass
      - kind: unit
        ref: npm run test:unit -- --runInBand src/domains/portability/mergePlan.test.ts
        status: pass
    human_judgment: false
duration: 20 min
completed: 2026-10-11
status: complete
---

# Phase 17 Plan 12: Schedule Collision Outcomes Summary

**Authoritative SQLite collision receipts and accessible factual review safely resolve one selected future Strength or Running occurrence without rewriting history.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-10-11T04:20:08+08:00
- **Completed:** 2026-10-11T04:39:42+08:00
- **Tasks:** 2/2
- **Files modified:** 18

## Accomplishments

- Added schema-40 append-only outcomes and immutable receipts keyed to both stable Strength/Running opportunity and schedule revisions; projections rebuild current move or acknowledgement intent without touching opportunity or completed-history facts.
- Bound preview tokens and canonical request hashes to the reviewed identity pair, then confirmed them under the exclusive SQLite writer with exact replay/readback, stale-revision rollback, and hash-conflict handling.
- Delivered the equal, non-default Move run, Move strength, and Keep both UI with factual dates, second confirmation, cancel/retry paths, and focus restoration to the detail trigger.
- Registered collision facts through logical backup, restore, and merge, including owned-plan ID remapping for outcomes, receipts, and projections.

## Task Commits

1. **Task 1: Preview and confirm one Move run collision outcome** — `1904eaef` (test, RED) and `73d168c3` (feat, GREEN)
2. **Task 2: Complete Move strength, Keep both, stale, replay, and rollback paths** — `4d04581` (feat)

## Files Created/Modified

- `src/platform/sqlite/migrations/0040_schedule_collision_outcomes.ts` — append-only outcome, receipt, and projection tables with immutability and backup triggers.
- `src/platform/sqlite/repositories/scheduleCollisionRepository.ts` — preview, exclusive confirmation, exact replay/conflict behavior, post-commit readback, and projection rebuild.
- `src/domains/scheduling/collisionCommands.ts` — shared request hash, preview, choice, and revision-bound token contract.
- `src/ui/components/ScheduleConflictSheet.tsx` — accessible factual three-choice sheet and confirmation dialog.
- `src/ui/screens/RunningPlanDetailScreen.tsx` — collision review entry, stale retry, cancellation, and trigger focus ownership.
- `src/domains/portability/mergePlan.ts` — remaps Running-owned collision references before immutable source-history insertion.
- `tests/integration/running-schedule-collision.test.ts` — real SQLite proof for all choices, stale dual revisions, replay/hash conflict, same-day independence, and projection rebuild.

## Decisions Made

- **Option A selected:** collision outcomes are authoritative append-only records, while `schedule_collision_projections` is explicitly rebuildable current-state intent.
- **No default or recommendation:** each owner-facing choice remains factual, unselected, and requires a second confirmation with both exact dates.
- **Selected occurrence only:** a move overlays current intent for one stable occurrence, preserving multiple same-weekday Running sessions and all immutable schedule/history facts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical correctness] Added the authoritative collision persistence and portability graph omitted from the UI-focused task file list.**
- **Found during:** Task 1 and Task 2
- **Issue:** A presentation-only confirm route could not provide the required exclusive write, immutable audit receipt, revision fence, backup/restore/merge, or deterministic projection rebuild.
- **Fix:** Added schema-40 source/receipt/projection tables, repository/runtime command port, SQLite tests, and backup/restore/merge registration with reference rewriting.
- **Files modified:** collision command/repository/migration/runtime and portability files listed above.
- **Verification:** targeted integration, SQLite-host backup/restore/merge, unit merge-remap, component, typecheck, lint, and boundary checks passed.
- **Committed in:** `73d168c3`, `4d04581`

**2. [Rule 1 - Bug] Rewrote collision references when owned-plan physical IDs are remapped during logical merge.**
- **Found during:** Task 2
- **Issue:** Source-graph insertion could preserve archive opportunity/schedule IDs after a keep-both merge remapped the corresponding owned-plan rows.
- **Fix:** Extended owned-plan Running aggregate mapping and supplied those maps to collision outcome/receipt/projection graph rewriting.
- **Files modified:** `src/domains/portability/mergePlan.ts`, `src/domains/portability/mergePlan.test.ts`, `src/platform/sqlite/repositories/logicalMergeRepository.ts`
- **Verification:** `npm run test:unit -- --runInBand src/domains/portability/mergePlan.test.ts` and targeted SQLite host suites passed.
- **Committed in:** `4d04581`

**Total deviations:** 2 auto-fixed (1 Rule 2, 1 Rule 1)

## Verification

- `npm run typecheck` — passed
- `npm run test:components -- --runInBand src/ui/components/ScheduleConflictSheet.test.tsx src/ui/__tests__/RunningPlanDetailScreen.test.tsx` — passed (existing React test-environment `act(...)` warnings remain non-fatal)
- `npm run test:integration -- --runInBand tests/integration/running-schedule-collision.test.ts` — passed (5 tests)
- `npm run test:unit -- --runInBand src/domains/portability/mergePlan.test.ts` — passed (79 tests)
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/logicalBackupRepository.test.ts tests/sqlite-host/logicalRestoreRepository.test.ts tests/sqlite-host/logicalMergeRepository.test.ts` — passed (142 tests)
- `npm run lint` and `npm run check:boundaries` — passed

## Known Stubs

None.

## Self-Check: PASSED

- Summary file exists and all TDD/task commits (`1904eaef`, `73d168c3`, `4d04581`) are reachable in git history.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The factual collision source model is available through the Running runtime port, survives logical portability operations, and preserves immutable workout/schedule history. No Phase 14 or Phase 15 artifacts were changed or staged.

---
*Phase: 17-library-running-plans*
*Completed: 2026-10-11*
