---
phase: 12-automatic-google-drive-sync
plan: 09
subsystem: cloud-deletion-retention
tags: [tombstone, deletion, retention, etag, writer-epoch]
dependency_graph:
  requires:
    - phase: 12-08
      provides: strict manifest and recovery validation
  provides:
    - fresh-auth successor tombstone deletion
    - restart-safe permanent snapshot sweep
    - 24-hour ETag/epoch-fenced orphan retention
    - guarded first backup after deletion
  affects: [12-10-settings-ui, 12-11-evidence]
tech-stack:
  added: []
  patterns:
    - destructive snapshot deletion begins only after reread-verified metadata tombstone
    - retention rechecks manifest authority before every trash operation
key-files:
  created: []
  modified:
    - src/domains/backup/automaticBackupCoordinator.ts
    - src/platform/google/driveBackupStoreAdapter.ts
    - src/platform/sqlite/repositories/automaticBackupStateRepository.ts
    - src/bootstrap/productionAutomaticBackupRuntime.ts
key-decisions:
  - "Disconnect never reaches Drive deletion; delete, finish-delete, and start-new remain separate commands."
  - "The retained tombstone identity is conditionally converted by the first validated post-deletion snapshot rather than deleted or bypassed."
requirements-completed: [DATA-10]
actuals:
  tokens: 12317
  tasks: 3
  commits: 5
coverage:
  - id: D1
    description: Fresh-auth deletion promotes and rereads a successor tombstone before permanent snapshot deletion.
    requirement: DATA-10
    verification:
      - kind: unit
        ref: src/domains/backup/automaticBackupCoordinator.test.ts#promotes a verified successor tombstone before deleting snapshots
        status: pass
    human_judgment: false
  - id: D2
    description: Partial deletion sweeps remain bounded, idempotent, and restart-safe.
    requirement: DATA-10
    verification:
      - kind: unit
        ref: src/domains/backup/automaticBackupCoordinator.test.ts#re-discovers a durable tombstone namespace until no snapshot remains
        status: pass
    human_judgment: false
  - id: D3
    description: Orphan retention and post-deletion restart preserve current authority and protected snapshots.
    requirement: DATA-10
    verification:
      - kind: unit
        ref: src/domains/backup/automaticBackupCoordinator.test.ts#trashes only 24-hour orphan candidates while the promoted manifest fence remains current
        status: pass
      - kind: unit
        ref: src/domains/backup/automaticBackupCoordinator.test.ts#promotes the first post-deletion snapshot through the retained tombstone identity
        status: pass
    human_judgment: false
metrics:
  duration: "54m"
  completed_date: 2026-09-30
  tasks_completed: 3
  files_changed: 8
status: complete
---

# Phase 12 Plan 09: Guarded Cloud Deletion Summary

Fresh-auth successor tombstones, retryable permanent sweeps, fenced orphan retention, and explicit tombstone-to-active restart now form distinct production behaviors.

## Delivered

- Replaced the throwing delete command with verified current identity, conditional tombstone promotion, reread, and bounded permanent snapshot deletion.
- Preserved durable partial sweep behavior and later removal of stale uploads while retaining the tombstone.
- Added 24-hour orphan discovery metadata and per-object manifest ETag/writer-epoch rechecks before trash.
- Added fresh-auth restart that reuses the tombstone manifest identity and publishes the first validated snapshot before activating authority.

## Verification

- Focused coordinator, Drive adapter, and production composition suites passed.
- Focused coordinator/Drive adapter coverage: 43/43 tests at 100% statements, branches, functions, and lines.
- `npm run typecheck` and `npm run lint`: passed.

## Task Commits

1. **Task 1: Promote successor tombstone before deletion** - `9335315` (RED), `6f0b67b` (GREEN)
2. **Task 2: Resume deletion and retention sweeps** - `5037fd7`
3. **Task 3: Guard orphan trash and restart** - `f79bdf9`, `01bbb1c`

## Deviations from Plan

None - all destructive actions retain the plan's fresh-auth, ETag, epoch, and environment fences.

## Known Stubs

None.

## Self-Check: PASSED

- Confirmed all five Plan 12-09 commits and eight modified files exist.
- Confirmed focused integrity coverage is exactly 100%.
- Confirmed `.gsd/`, `.planning/debug/`, and `.planning/milestone.lock` remain preserved and unstaged.

---
*Phase: 12-automatic-google-drive-sync*
*Completed: 2026-09-30*
