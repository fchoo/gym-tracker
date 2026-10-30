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
affects: [09-02, 09-03, 09-04, 09-05, 09-06, 09-07, 09-08, 09-09, 09-10]
actuals:
  tokens: 22288
  tasks: 4
  commits: 23
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
  - Exercise-add commits publish workoutRefreshGeneration so the mounted route rereads authoritative SQLite state before acknowledging the new overview.
requirements-completed: [WORK-20, WORK-24]
coverage:
  - id: D1
    description: Schema 19 adds immutable editing metadata and remains portable through logical backup and restore.
    requirement: WORK-24
    verification:
      - kind: integration
        ref: npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts tests/sqlite-host/logicalBackupRepository.test.ts tests/sqlite-host/logicalRestoreRepository.test.ts
        status: pass
      - kind: e2e
        ref: npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/migrations-effects/build.json
        status: pass
    human_judgment: false
  - id: D2
    description: Add exercise commits one added-origin immutable snapshot and one working set without mutating prior session facts.
    requirement: WORK-20
    verification:
      - kind: integration
        ref: tests/integration/session-exercise-editing.test.ts
        status: pass
      - kind: unit
        ref: src/domains/workout/sessionExerciseCommands.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: The overview Add flow renders the committed exercise and survives process relaunch.
    requirement: WORK-20
    verification:
      - kind: automated_ui
        ref: npm run test:maestro:phase9 -- --manifest artifacts/native/phase9/build.json
        status: pass
      - kind: automated_ui
        ref: /Users/bytedance/.maestro/tests/2026-09-16_135535/maestro.log
        status: pass
    human_judgment: false
metrics:
  duration: closeout audit and repair
  completed: 2026-09-16
status: complete
---

# Phase 09 Plan 01: Add Exercise Tracer Summary

Schema 19 and an atomic add-exercise command now append owner-added workout facts without rewriting history, refresh the live overview after commit, and survive native process relaunch.

## Completed Work

- Added schema 19 metadata (`modified_from_plan`, `origin`, `display_ordinal`) and immutable edit receipts, including logical backup/restore references.
- Added a validated add-exercise command that appends exactly one added-origin session exercise and one null-lineage working set inside the private writer transaction.
- Wired the Active Workout overview picker, accessible `Added` cue, and persisted Add tracer flow.
- Published the existing workout refresh generation after a successful add so the mounted route rereads authoritative SQLite state instead of retaining its empty pre-commit view.
- Repaired all stale test doubles and portability expectations exposed by full coverage. The schema-19 verifier now has explicit negative tests for malformed columns, indexes, receipt shape, FK graph, and trigger bodies.
- Repaired the Phase 9 Maestro manifest reader to use the canonical `apk.path` field.

## Automated Evidence

Passed using Node 24.19.0, npm 11.17.0, and Temurin 17.0.20+8:

- Focused host migration/backup/restore: 152 tests passed.
- Focused add command contract/integration: 22 tests passed.
- Active Workout component and evidence-script contract: 53 tests passed.
- TypeScript: `npm run typecheck` passed.
- Full integrity coverage: `npm run test:coverage -- --runInBand` passed 144 suites / 2,520 tests, with all 86 integrity-critical files at 100%.
- The pinned-toolchain refresh regression and adjacent route/component suites passed: 39 runtime tests and 55 adjacent tests.
- Migration-effects native evidence passed all 11/11 cases on the final non-diagnostic APK built from `6c2e88e8d22c00a4a16e7239cc162e36c93ad020`; retained and installed SHA-256 both equal `e601fdf0aa9a0cb56257eb995c960b4268d0c4a23836064dfcc5cb6b3f4b6fb1`.

## Native Evidence

Fresh exact-HEAD Android build and manifest binding succeeded for implementation commit `282036c9f86d249e7f0229985ba500dd4556d1a4`:

- `npm run android:devtest:fresh -- --suite phase9` completed successfully on `emulator-5554` (API 36, arm64-v8a) using Node 24.19.0, npm 11.17.0, Temurin 17.0.20+8, and Android SDK API 36.
- Manifest: `artifacts/native/phase9/build.json`; APK SHA-256: `d1b13c16b9d995ce1738701a4b79bdd47faacce4aa3bbe4fdcd7da8036a7e8ac`; installed APK digest matched the retained artifact.
- Manifest: `artifacts/native/phase9/build.json`; APK SHA-256: `d1b13c16b9d995ce1738701a4b79bdd47faacce4aa3bbe4fdcd7da8036a7e8ac`; installed APK digest matched the retained artifact.
- Evidence-oracle commit `797a9d1f091fb3bff818b16b732074dc2a869572` replaced the non-matching partial `Added` regex with the exact visible accessibility contract. This changed only Maestro YAML and its fail-closed validator, so the retained implementation APK remained authoritative.
- The manifest-bound Phase 9 Maestro command passed end to end. Before stop it verified `Back Squat. Added. 0 of 1 working sets. Collapse exercise` and `Working sets`; after `clearState: false` relaunch it verified `Back Squat · Working set 1 · Rest idle`. Retained log: `/Users/bytedance/.maestro/tests/2026-09-16_135535/maestro.log`.

## Deviations from Plan

### Auto-fixed Issues

1. [Rule 1 - Bug] Repaired stale tests and evidence-runner manifest access exposed by the complete coverage gate.
- **Found during:** Closeout verification
- **Fix:** Updated schema-19 test fixtures, restored verifier-branch coverage, and read the canonical nested APK path.
- **Files modified:** six test files, `scripts/run-phase9-maestro.mjs`, `scripts/phase9-evidence-scripts.test.mjs`
- **Commits:** `5263bab`, `78f992d`

2. [Rule 1 - Bug] Prevented Expo SQLite from double-finalizing explicitly owned prepared statements and emitted the selected migrations result shape directly.
- **Found during:** Exact-head migration-effects device verification
- **Fix:** Disabled Expo's redundant close-time finalizer on generic connections and corrected the selected-suite result payload.
- **Verification:** 142 focused host tests, typecheck, and native migrations-effects 11/11.
- **Committed in:** `6c2e88e`

3. [Rule 1 - Bug] Published the post-commit workout refresh generation after adding an exercise.
- **Found during:** Exact-head Phase 9 Maestro verification
- **Fix:** Reused the existing route refresh signal after a successful add commit, including trusted-refresh fallback behavior.
- **Verification:** red/green runtime regression, 39 focused tests, 55 adjacent tests, boundaries, typecheck, coverage, and native Maestro.
- **Committed in:** `282036c`

4. [Rule 1 - Bug] Corrected Phase 9 native evidence selectors and deterministic fixture setup.
- **Found during:** Manifest-bound Maestro execution
- **Fix:** Bound the dev-test package, established an empty workout deterministically, targeted the exact confirmation, dismissed the keyboard, revealed the confirmation, and asserted the exact semantic added-row label before and after relaunch.
- **Verification:** evidence-script contract and full manifest-bound Maestro pass.
- **Commits:** `d08e799`, `ccfd913`, `3e0abe8`, `ffe521b`, `49be4f3`, `acf24db`, `797a9d1`

**Total deviations:** 4 correctness/evidence defects resolved without weakening D-03 or changing release authority.

## Issues Encountered

All encountered source, native lifecycle, route-refresh, and test-oracle issues were resolved. No open Plan 09-01 blocker remains.

## Next Phase Readiness

Ready for the authoritative serial Phase 09 plan registry beginning with 09-02 migration core and 09-03 Add compatibility/Task 1 boundary. The add command, generalized immutable receipt foundation, display-order metadata, route refresh signal, and manifest-bound Phase 9 tracer are established.

## Self-Check: PASSED

- Summary exists at the required phase path.
- Implementation/evidence commits `dd8231e`, `15a5b0e`, `c1219a1`, `3f29c1c`, `5263bab`, `78f992d`, `6c2e88e`, `d08e799`, `ccfd913`, `3e0abe8`, `ffe521b`, `49be4f3`, `acf24db`, `282036c`, and `797a9d1` exist.
- Fresh exact-HEAD manifest is bound to `282036c9f86d249e7f0229985ba500dd4556d1a4` with APK SHA-256 `d1b13c16b9d995ce1738701a4b79bdd47faacce4aa3bbe4fdcd7da8036a7e8ac`.
- Native migrations-effects passed 11/11 and the corrected semantic-label Phase 9 flow passed through persisted relaunch recovery.
