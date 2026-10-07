---
phase: 13-multi-plan-running-foundation
plan: 06
subsystem: running-activity-matching
tags: [sqlite, running, imported-activities, match-ledger, tombstones, revisions]
requires:
  - phase: 13-03
    provides: slot-qualified Running opportunities and immutable session revisions
  - phase: 13-04
    provides: immutable imported activity source evidence and lifecycle commands
provides:
  - explicit revision-fenced owner confirmation for Running activity matching
  - append-only match/unmatch/reassign/invalidation audit ledger with receipt replay
  - source-tombstone-driven current-match invalidation that never silently restores a link
affects: [17-running-plan-ui, 18-garmin-import, running-progress, portability]
tech-stack:
  added: []
  patterns: [exclusive-sqlite-writer, append-only-events, receipt-first-replay, derived-current-relation, revision-fences]
key-files:
  created:
    - src/domains/running/activityMatchCommands.ts
    - src/platform/sqlite/repositories/runningActivityMatchRepository.ts
    - src/platform/sqlite/migrations/0034_running_activity_match_ledger.ts
    - src/platform/sqlite/migrations/0035_imported_activity_lifecycle_state.ts
  modified:
    - src/platform/sqlite/repositories/importedActivityRepository.ts
    - src/platform/sqlite/repositories/trainingCalendarRepository.ts
    - tests/integration/running-activity-match.test.ts
decisions:
  - "A Running match is an explicit owner command over exact activity, opportunity, schedule/version, slot, session revision, and current relation revision identities."
  - "Imported activity identity evidence remains immutable; current lifecycle state is a rebuildable derivative keyed to the append-only lifecycle event."
  - "Restoring an imported activity restores source visibility only; rematching requires a fresh current-revision owner confirmation."
metrics:
  duration: 3h 40m
  completed: 2026-10-07
status: complete
actuals:
  tokens: 9256
  tasks: 2
  commits: 2
---

# Phase 13 Plan 06: Explicit Running Activity Matching Summary

**Explicit owner-confirmed Running activity matching now uses a revision-fenced immutable SQLite ledger; source removal atomically invalidates the derived link while restoration remains deliberately unmatched.**

## Accomplishments

- Added a strict command boundary for match, unmatch, and reassign: every mutation carries a stable request hash, exact imported-activity revision, exact Running opportunity identity, schedule/version, slot, session revision, and expected current-relation revision.
- Added schema-34 append-only match events and receipts plus an asserted one-to-one derived current relation. A duplicate request replays its receipt; stale or competing requests return a conflict without a write.
- Added schema-35 lifecycle state because the prior imported identity is immutable and therefore cannot safely act as mutable current lifecycle authority. Import initializes active lifecycle state, calendar reads consume that derived state, and history/source evidence remains immutable.
- Wired removal to append a tombstone and match-invalidation event within the same exclusive transaction, remove the current relation, and retain all prior activity and match events. Restore appends a lifecycle event only and never restores a match.

## Task Commits

1. **Task 1: Commit explicit match, unmatch, and reassign events** — `726b583` (feat)
2. **Task 2: Invalidate and restore current matches through audited source events** — `a59d7f7` (feat)

## Verification

- `npm run test:unit -- --runInBand src/domains/running/activityMatchCommands.test.ts` — passed.
- `npm run test:integration -- --runInBand tests/integration/imported-activity-facts.test.ts tests/integration/running-activity-match.test.ts tests/integration/running-foundation.test.ts` — passed (10 tests).
- `npm run typecheck` — passed.
- `npm run lint` — passed (310 files).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added a mutable lifecycle derivative separate from immutable imported identity evidence.**

- **Found during:** Task 2
- **Issue:** `imported_activity_identities` is append-only, so its frozen `removal_state` cannot represent a current source lifecycle without rewriting audit evidence. Calendar was also reading this historical field as if it were current authority.
- **Fix:** Added schema-35 `imported_activity_current_lifecycle`, initialized it at import, updated it only in the lifecycle transaction, and made calendar activity reads consume the derivative. Removal simultaneously invalidates the current match; restoration remains unmatched.
- **Files modified:** `src/platform/sqlite/migrations/0035_imported_activity_lifecycle_state.ts`, `src/platform/sqlite/repositories/importedActivityRepository.ts`, `src/platform/sqlite/repositories/trainingCalendarRepository.ts`.
- **Commit:** `a59d7f7`

## Known Stubs

None.

## Threat Surface

No network, credential, or arbitrary file-access path was introduced. The confirmation trust boundary is covered by exact identity/revision revalidation inside the exclusive writer, immutable request receipts/events, and one-to-one current-relation assertions.

## Self-Check: PASSED

- Confirmed the command boundary, match repository, schema-34 ledger, schema-35 lifecycle derivative, and focused integration coverage exist on disk.
- Confirmed task commits `726b583` and `a59d7f7` are reachable from this worktree branch.
- Shared `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally not changed; the execution orchestrator owns integrated tracking.
