---
phase: 09-in-workout-exercise-editing
plan: 03
subsystem: database
tags: [sqlite, add-exercise, idempotency, native-evidence, commit-boundary]
requires:
  - phase: 09-02
    provides: schema-20 dual receipt authority and fail-closed native validator
provides:
  - v20-compatible public Add persistence and replay
  - schema-20 fixture parity
  - native-tested Task 1 boundary commit
affects: [09-04, 09-05, 09-06, 09-07, 09-08, 09-09, 09-10]
actuals:
  tokens: 0
  tasks: 3
  commits: 1
tech-stack:
  added: []
  patterns: [clean-worktree native proof, scoped commit-tree boundary, manifest-bound source identity]
key-files:
  created:
    - scripts/verify-phase9-task1-boundary.mjs
    - scripts/phase9-task1-boundary.test.mjs
  modified:
    - src/platform/sqlite/repositories/workoutRepository.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - src/testing/contracts/migrationsEffects.contract.ts
key-decisions:
  - "Build native proof in a clean detached worktree at the precise candidate commit, then promote only after the parser accepts it."
  - "Apply Expo close-safe options to every direct migration-contract and recovery database handle."
requirements-completed: [WORK-20, WORK-24]
coverage:
  - id: D1
    description: Add writes and replays through the schema-20 scalar receipt authority
    requirement: WORK-20
    verification:
      - kind: integration
        ref: tests/integration/session-exercise-editing.test.ts#preserves-populated-v19-receipts-then-writes-and-replays-Add-through-v20
        status: pass
    human_judgment: false
  - id: D2
    description: schema-20 fixture and restore parity rejects future producer schemas
    requirement: WORK-24
    verification:
      - kind: unit
        ref: src/bootstrap/workoutAppRuntime.test.tsx and tests/sqlite-host/portabilityMigration.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: exact Task 1 source commit has fresh device proof for all migrations-effects contracts
    requirement: WORK-20
    verification:
      - kind: other
        ref: artifacts/native/migrations-effects/result.json#migration-session-exercise-edit-receipts-v20
        status: pass
    human_judgment: false
status: complete
---

# Plan 09-03 Summary

**Public Add now uses schema-20 scalar receipt evidence, and the complete Task 1 source boundary is verified on a real Expo SQLite artifact.**

task1_boundary_commit: 184195504a6f223872965944f605e1d31fcb24ac

## Accomplishments

- Updated Add receipt selection, replay reconstruction, and insertion to use `subject_session_exercise_id` plus a null `replacement_session_exercise_id`.
- Repaired the runtime, portability, restore, and clean-install schema fixtures for both v20 receipt authorities.
- Added populated v19-to-v20 Add/replay integration coverage and a tested boundary verifier for source scope, protected migration 0019, ancestry, and exactly one attribution trailer.
- Closed the Expo SQLite direct-handle lifecycle gap by applying `finalizeUnusedStatementsBeforeClosing: false` to migration recovery and test-contract direct opens.

## Boundary Commit

- Commit: `184195504a6f223872965944f605e1d31fcb24ac`
- Parent: `9a43a6c9cad18102f7fad537f3ab1a65f98f80d2`
- Trailer count: 1
- Migration 0019: unchanged
- Committed source paths: Task 1 allowlist only, including the schema-20 migration, Add compatibility, fixture parity, native validator, boundary validator, and direct-handle lifecycle repair.

## Native Evidence

- Manifest: `artifacts/native/migrations-effects/build.json`
- Result: `artifacts/native/migrations-effects/result.json`
- Source digest: `38084d4110999f1be030027ab0afb16a68e17c20a8833cb9face14db671d1696`
- APK SHA-256: `aa5ae9438075a81b194024664e5d02a24002fb0a562aa1c31987e913b5bb276b`
- Device: `emulator-5554`, API 36, `arm64-v8a`
- Result: 11/11 passed, 0 failed, 0 skipped, including `migration-session-exercise-edit-receipts-v20`.

## Verification

- `node --test scripts/phase9-v20-native-evidence.test.mjs scripts/phase9-task1-boundary.test.mjs` — 4 tests passed.
- Focused unit, SQLite-host, and Add integration suites — passed.
- `npm run typecheck` — passed.
- `npm run test:coverage -- --runInBand` — 144 suites / 2,535 tests passed; all 87 integrity-critical files at 100%.
- Clean detached native build, device migrations-effects suite, and manifest-bound parser — passed.
- `node scripts/verify-phase9-task1-boundary.mjs post-commit --commit 184195504a6f223872965944f605e1d31fcb24ac` — passed.

## Deviations from Plan

1. Native builder requires a clean tracked worktree, while Task 1 had to remain uncommitted until native proof. A detached clean worktree was built from the candidate commit; the branch advanced only after its manifest/result passed validation.
2. Device rollback testing exposed Expo direct-open handles that still used the default automatic statement finalizer. The repair aligned those direct recovery, foreign-key probe, and competing-write handles with the production connection lifecycle and added regression coverage.

## Next Phase Readiness

The downstream verifier can now prove the Task 1 boundary with this summary. Plan 09-04 may begin Replace/Remove persistence; it must not modify the separate reorder ledger.

## Self-Check: PASSED
