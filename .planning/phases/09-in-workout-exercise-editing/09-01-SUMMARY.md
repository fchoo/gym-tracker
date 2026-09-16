---
phase: 09-in-workout-exercise-editing
plan: 01
subsystem: workout, sqlite, native-evidence
tags: [sqlite, migrations, workout, append-only, maestro, accessibility]
requires:
  - phase: 08-session-overview-navigation
    provides: pinned workout-overview Add exercise entry point
provides:
  - schema 19 additive session-exercise editing metadata and immutable receipts
  - atomic, idempotent added-exercise command through the serialized writer
  - accessible Add exercise overview tracer and manifest-bound Maestro runner
affects: [09-02-replace-remove, 09-03-reorder-display-order, 09-04-modified-progression]
actuals:
  tokens: 22020
  tasks: 4
  commits: 10
tech-stack:
  added: []
  patterns: [additive SQLite migration, immutable command receipts, request-hash idempotency, fail-closed native evidence]
key-files:
  created:
    - src/platform/sqlite/migrations/0019_session_exercise_editing.ts
    - src/domains/workout/sessionExerciseCommands.ts
    - tests/integration/session-exercise-editing.test.ts
    - maestro/phase9/in-workout-exercise-editing.yaml
  modified:
    - src/platform/sqlite/repositories/workoutRepository.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - src/ui/screens/ActiveWorkoutScreen.tsx
    - scripts/run-phase9-maestro.mjs
key-decisions:
  - D-03 upheld: pre-existing session snapshots remain append-only and new exercise facts are inserted only.
  - Migration 19 preserves ordinal as creation order and uses display_ordinal for presentation order.
  - The Phase 9 Maestro runner reads the canonical native manifest apk.path field and fails closed without it.
metrics:
  duration: closeout audit and repair
  completed: 2026-09-16
status: blocked
---

# Phase 09 Plan 01: Add Exercise Tracer Summary

Schema 19 and the add-exercise tracer now provide append-only, idempotent session additions with full host coverage; exact-HEAD Android/Maestro evidence remains pending.

## Completed Work

- Added schema 19 metadata (`modified_from_plan`, `origin`, `display_ordinal`) and immutable edit receipts, including logical backup/restore references.
- Added a validated add-exercise command that appends exactly one added-origin session exercise and one null-lineage working set inside the private writer transaction.
- Wired the Active Workout overview picker, accessible `Added` cue, and persisted Add tracer flow.
- Repaired all stale test doubles and portability expectations exposed by full coverage. The schema-19 verifier now has explicit negative tests for malformed columns, indexes, receipt shape, FK graph, and trigger bodies.
- Repaired the Phase 9 Maestro manifest reader to use the canonical `apk.path` field.

## Verification

Passed using Node 24.19.0, npm 11.17.0, and Temurin 17.0.20+8:

- Focused host migration/backup/restore: 152 tests passed.
- Focused add command contract/integration: 22 tests passed.
- Active Workout component and evidence-script contract: 53 tests passed.
- TypeScript: `npm run typecheck` passed.
- Full integrity coverage: `npm run test:coverage -- --runInBand` passed 144 suites / 2,520 tests, with all 86 integrity-critical files at 100%.

## Native Verification Blocker

The retained `artifacts/native/migrations-effects/build.json` was originally digest-matched, but the plan closeout repairs changed the exact-HEAD source digest from `d23b0f49…` to `ad63a7a4…`. It therefore cannot prove current source. `artifacts/native/phase9/build.json` is absent, so the required `npm run test:maestro:phase9 -- --manifest artifacts/native/phase9/build.json` cannot run.

The previous migration-effects device attempt also timed out waiting for the contract log after 90 seconds. Build exact-HEAD artifacts with `npm run android:devtest:fresh -- --suite migrations-effects` and `npm run android:devtest:fresh -- --suite phase9`, then run the two device/Phase 9 Maestro commands before treating the plan as fully verified.

## Deviations from Plan

### Auto-fixed Issues

1. [Rule 1 - Bug] Repaired stale tests and evidence-runner manifest access exposed by the complete coverage gate.
- **Found during:** Closeout verification
- **Fix:** Updated schema-19 test fixtures, restored verifier-branch coverage, and read the canonical nested APK path.
- **Files modified:** six test files, `scripts/run-phase9-maestro.mjs`, `scripts/phase9-evidence-scripts.test.mjs`
- **Commits:** `5263bab`, `78f992d`

## Self-Check: PASSED

- Summary exists at the required phase path.
- Implementation commits `dd8231e`, `15a5b0e`, `c1219a1`, `3f29c1c`, `5263bab`, and `78f992d` exist.
