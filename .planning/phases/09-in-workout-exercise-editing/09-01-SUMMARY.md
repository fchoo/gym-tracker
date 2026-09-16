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
  tokens: 22288
  tasks: 4
  commits: 13
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

Schema 19 and the add-exercise tracer provide append-only, idempotent session additions with full host coverage, but exact-HEAD Android/Maestro evidence still fails before the required post-add UI and relaunch-persistence assertions.

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
- Migration-effects source evidence: commit `6c2e88e8d22c00a4a16e7239cc162e36c93ad020` contains the Phase 9 `migration-session-exercise-editing-v19` case in the aggregate migrations-effects contract, whose result assertion requires all 11 of 11 declared cases to pass.

## Native Verification Blocker

Fresh exact-HEAD Android build and manifest binding succeeded for source commit `282036c9f86d249e7f0229985ba500dd4556d1a4`:

- `npm run android:devtest:fresh -- --suite phase9` completed successfully on `emulator-5554` (API 36, arm64-v8a) using Node 24.19.0, npm 11.17.0, Temurin 17.0.20+8, and Android SDK API 36.
- Manifest: `artifacts/native/phase9/build.json`; APK SHA-256: `d1b13c16b9d995ce1738701a4b79bdd47faacce4aa3bbe4fdcd7da8036a7e8ac`; installed APK digest matched the retained artifact.
- `npm run test:maestro:phase9 -- --manifest artifacts/native/phase9/build.json` reached and tapped the exact dynamic confirmation `Add Back Squat`.

The final assertion failed at `assertVisible: "Added"`. Native debug evidence is at `/Users/bytedance/.maestro/tests/2026-09-16_134709`. The unchanged flow completed initial plan activation, empty-workout start, search for `Squat`, and `Add Back Squat`, then failed because Maestro did not treat `Added` as visible. Its captured hierarchy does contain `Added · 0 of 1 working sets` and the accessibility label `Back Squat. Added. 0 of 1 working sets. Collapse exercise`; nevertheless, the required visible assertion failed. The required working-set/end-position and stop/relaunch persistence assertions did not execute. This directly violates Task 4's native acceptance criteria. No source or Maestro-flow change was made during this verification task.

Do not mark Plan 09-01 complete or start dependent plans until the route/runtime refresh path is corrected, a new exact-HEAD APK is built, and the same manifest-bound Maestro flow passes through its relaunch assertion.

## Deviations from Plan

### Auto-fixed Issues

1. [Rule 1 - Bug] Repaired stale tests and evidence-runner manifest access exposed by the complete coverage gate.
- **Found during:** Closeout verification
- **Fix:** Updated schema-19 test fixtures, restored verifier-branch coverage, and read the canonical nested APK path.
- **Files modified:** six test files, `scripts/run-phase9-maestro.mjs`, `scripts/phase9-evidence-scripts.test.mjs`
- **Commits:** `5263bab`, `78f992d`

## Self-Check: PASSED

- Summary exists at the required phase path.
- Implementation commits `dd8231e`, `15a5b0e`, `c1219a1`, `3f29c1c`, `5263bab`, `78f992d`, `d08e799`, `ccfd913`, `3e0abe8`, `ffe521b`, `49be4f3`, and `acf24db` exist.
- Fresh exact-HEAD manifest is bound to `282036c9f86d249e7f0229985ba500dd4556d1a4` with APK SHA-256 `d1b13c16b9d995ce1738701a4b79bdd47faacce4aa3bbe4fdcd7da8036a7e8ac`.
- Native evidence is recorded as blocked, not passed: the unchanged Phase 9 Maestro flow failed at `assertVisible: "Added"` in `/Users/bytedance/.maestro/tests/2026-09-16_134709`.
