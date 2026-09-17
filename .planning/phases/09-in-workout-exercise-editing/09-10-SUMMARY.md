---
phase: 09-in-workout-exercise-editing
plan: 10
subsystem: testing, native-evidence, sqlite, workout, plans
tags: [maestro, expo-sqlite, immutable-history, write-back, coverage, android]

requires:
  - phase: 09-09
    provides: post-finish default-No write-back state machine and manifest-bound Keep/retry flows
provides:
  - complete fail-closed source, coverage, native SQLite, and Maestro closure for Phase 09
  - stable installed-APK identity verification that tolerates Android package-path rotation
  - native Expo SQLite lifecycle safety for unique contract databases
affects: [phase-9-verification, 10-advanced-set-timing, 11-portable-history-merge-restore]

actuals:
  tokens: 16429
  tasks: 2
  commits: 7

tech-stack:
  added: []
  patterns:
    - Native evidence validates stable APK bytes rather than Android's ephemeral package-install path
    - Expo SQLite contract databases use unique run IDs and are cleaned only after close

key-files:
  created:
    - src/platform/sqlite/repositories/ownedPlanRepository.test.ts
  modified:
    - scripts/run-phase9-maestro.mjs
    - scripts/phase9-evidence-scripts.test.mjs
    - src/platform/sqlite/repositories/ownedPlanRepository.ts
    - src/testing/contracts/migrationsEffects.contract.ts
    - tests/integration/plan-impact-replacement.test.ts
    - tests/sqlite-host/migrations-effects.test.ts

key-decisions:
  - "The Phase 9 runner validates v20 evidence before installing the separate Phase 9 APK, then proves installed bytes by pulling and hashing the APK rather than comparing Android's rotated /data/app path."
  - "Unique native contract database names already isolate each run; deleting before open is removed because Expo SQLite can race a released shared native object. Cleanup stays after runtime close."
  - "Write-back remains read-snapshot guarded: a disappeared scheduled day returns no write-back facts rather than risking a stale or mutated plan update."

patterns-established:
  - "A retained phase ledger may embed a prerequisite native pass when a later required APK install intentionally makes a standalone recheck fail closed. Record the sequence and identities rather than weakening either validator."
  - "Completed workout history and Phase 09 migration 0019 remain immutable throughout source and device verification."

requirements-completed: [WORK-20, WORK-21, WORK-22, WORK-23, WORK-24, WORK-25, WORK-27]

coverage:
  - id: D1
    description: "A live session can add, replace, remove, and reorder exercises while preserving append-only snapshot and completed-history behavior."
    requirement: WORK-24
    verification:
      - kind: integration
        ref: tests/integration/session-exercise-editing.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/plan-impact-replacement.test.ts
        status: pass
      - kind: e2e
        ref: maestro/phase9/in-workout-exercise-editing.yaml
        status: pass
    human_judgment: false
  - id: D2
    description: "Edited sessions consume their scheduled opportunity with modified-from-plan semantics and deterministic non-mutating progression."
    requirement: WORK-25
    verification:
      - kind: integration
        ref: tests/integration/today-schedule-workout.test.ts
        status: pass
      - kind: e2e
        ref: maestro/phase9/completed-workout-plan-writeback-keep.yaml
        status: pass
    human_judgment: false
  - id: D3
    description: "Only a durably completed divergent owned-plan workout offers the default-No plan write-back choice; Keep and retry preserve completed history."
    requirement: WORK-27
    verification:
      - kind: unit
        ref: src/domains/workout/outcomes.test.ts
        status: pass
      - kind: automated_ui
        ref: src/ui/__tests__/WorkoutCompletionScreen.test.tsx
        status: pass
      - kind: e2e
        ref: maestro/phase9/completed-workout-plan-writeback-keep.yaml and maestro/phase9/completed-workout-plan-writeback-retry.yaml
        status: pass
    human_judgment: false
  - id: D4
    description: "The full Phase 09 decision, accessibility, migration, receipt, coverage, and native evidence matrix passes on one exact source head."
    requirement: WORK-20
    verification:
      - kind: other
        ref: npm run test:all -- --runInBand
        status: pass
      - kind: other
        ref: npm run test:coverage -- --runInBand
        status: pass
      - kind: e2e
        ref: artifacts/native/phase9/phase9-maestro.json
        status: pass
    human_judgment: false

duration: multi-session
completed: 2026-09-17
status: complete
---

# Phase 09 Plan 10: Evidence Closure Summary

**Phase 09 now has exact-head source, SQLite, coverage, and Android lifecycle proof for immutable in-workout editing and default-No plan write-back.**

## Performance

- **Duration:** Multi-session execution
- **Completed:** 2026-09-17
- **Tasks:** 2
- **Files modified:** 11 production, runner, and regression-test files

## Accomplishments

- Hardened the Phase 09 evidence runner so it validates source/APK/device identity, exact requirement and UI evidence mappings, v20 native proof, three serialized Maestro flows, and restoration of the emulator time setting.
- Replaced the brittle Android package-path comparison with stable installed-APK byte validation. `adb install -r` rotates the ephemeral `/data/app/...` path, while package/device identity and a pulled SHA-256 still prove the exact installed build.
- Closed the remaining write-back and repository integrity paths: receipt replay/mismatch/corruption, stale source, missing policy, warm-up preservation, bundled-plan rejection, and read-snapshot race behavior. The three Phase 09 integrity-critical modules are fully covered.
- Fixed the native contract lifecycle race without relaxing isolation: unique per-run Expo SQLite database names are no longer deleted before first open, and cleanup remains after close. The final emulator v20 contract passed all 11 cases.
- Preserved the approved overview polish from Plan 09-09: visible 2dp themed dividers separate exercises and the accessible `…` action remains in the exercise header rather than taking an entire row.

## Task Commits

1. **Task 1: Complete the fail-closed Phase 09 evidence contract**
   - `91f0a09` — harden the phase evidence contract
   - `b5a0923` — make native constants safe in integration tests
   - `3b0d683` — tolerate Android package-path rotation while retaining installed-byte validation
2. **Task 2: Run complete source and native verification**
   - `64bc62c` — close write-back integrity coverage
   - `e91e8cb` — cover the write-back snapshot race
   - `1eb182b` — label native effect-lease replay failures
   - `4f1ecf8` — avoid the pre-open Expo SQLite teardown race

## Verification

### Source and persistence gates

- `node scripts/verify-phase9-task1-boundary.mjs downstream ...` — passed.
- `git diff --quiet -- src/platform/sqlite/migrations/0019_session_exercise_editing.ts` — passed; migration 0019 stayed byte-unchanged.
- `npm run typecheck`, `npm run lint`, and `npm run check:boundaries` — passed; boundary check covered 234 files.
- `node --test scripts/phase9-evidence-scripts.test.mjs scripts/phase9-v20-native-evidence.test.mjs scripts/phase9-task1-boundary.test.mjs` — 6/6 passed.
- Focused component matrix — 77/77 passed for `ActiveWorkoutScreen` and `WorkoutCompletionScreen`.
- Focused host migration/effects contract — 130/130 passed.
- Focused session-edit/write-back integration — 45/45 passed.
- `npm run test:all -- --runInBand` — 146 suites / 2,635 tests passed.
- The integrated coverage gate reported `ok:true`, 87 integrity-critical files, and required 100% statements, branches, functions, and lines.

The full source run still emits the pre-existing Expo Go push-notification and React `act(...)` warnings; they are warnings only and every suite exits successfully.

### Fresh native evidence

Both native artifacts are bound to implementation HEAD `4f1ecf8f274a10ab27fdf3c0b83507cdf3c9c07d` and source digest `a3889174429ef55323ffe861792c4af509da3f6ed6ea91d02c6cefe0fd19c2a1` on `emulator-5554` (API 36, arm64-v8a, Android 16).

- **v20 migrations/effects:** retained APK SHA-256 `99a0672cc5ada800207c8b31c05d0dffe8b5ef388811b8043624a0950dd773f9`; exact contract passed 11/11 with 0 failed and 0 skipped.
- **Phase 09 Maestro:** retained and installed APK SHA-256 `eec2c391a6941b2a11b67e8b4c4a3133ac766979c791de829a8b7981fafb27b4`; the evidence ledger is `status: passed`.
  - `in-workout-exercise-editing` — 1 test, 0 failures, 0 errors, 0 skipped.
  - `completed-workout-plan-writeback-keep` — 1 test, 0 failures, 0 errors, 0 skipped.
  - `completed-workout-plan-writeback-retry` — 1 test, 0 failures, 0 errors, 0 skipped.
- The runner validates v20 first, then installs the distinct Phase 09 APK. Re-running the standalone v20 parser after that final install intentionally fails its installed-package identity guard; the retained Phase 09 ledger records the valid pre-install `v20.ok: true` result instead of weakening the guard.
- Cleanup proof: automatic device time is restored (`auto_time=1`).

## Decisions Made

- Android installation paths are treated as volatile implementation details. Stable APK byte identity is the native proof boundary.
- The lifecycle repair preserves strict isolation: unique native database keys supply isolation, while post-close deletion avoids a released-shared-object race.
- A missing scheduled day found between read and apply is safely non-eligible for plan write-back. It cannot become an accidental write based on stale facts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Evidence correctness] Android rotates package-install paths on every `adb install -r`**

- **Found during:** Task 2 final Phase 09 Maestro execution.
- **Issue:** The runner compared a manifest path against an Android-owned ephemeral `/data/app/...` path after reinstalling the same package.
- **Fix:** Require device identity and a nonempty installed package path, then pull and SHA-256 the installed APK against the retained artifact.
- **Files modified:** `scripts/run-phase9-maestro.mjs`, `scripts/phase9-evidence-scripts.test.mjs`.
- **Verification:** Fresh final Phase 09 ledger passed all three flows with retained and installed APK hashes equal.
- **Committed in:** `3b0d683`.

**2. [Rule 1 - Native lifecycle correctness] Pre-open deletion raced Expo SQLite database opening**

- **Found during:** Task 2 emulator migrations/effects validation.
- **Issue:** Deleting an already-unique native contract database immediately before `openDatabaseAsync` could produce `ERR_USING_RELEASED_SHARED_OBJECT`.
- **Fix:** Removed only the redundant pre-open delete; retained unique run IDs and cleanup after `runtime.close()`.
- **Files modified:** `src/testing/contracts/migrationsEffects.contract.ts`, `tests/sqlite-host/migrations-effects.test.ts`.
- **Verification:** Host regression passed and the fresh emulator v20 contract passed 11/11.
- **Committed in:** `4f1ecf8`.

**Total deviations:** 2 auto-fixed correctness repairs. Both strengthen verification without expanding product scope.

## Issues Encountered

- The final standalone v20 parser cannot be run after the Phase 09 runner’s distinct APK has been installed because its installed-package identity check correctly fails. The runner’s required order is v20 parser first, Phase 09 install second, and it atomically retains the combined ledger only after all checks and flows pass.
- Generated artifacts, coverage folders, `.gsd`, `.planning/debug`, and `.planning/milestone.lock` remain untracked by design. They were not included in this plan’s commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 09 is ready for independent code review and goal-backward verification. If those gates are clean, Phase 10 can begin from schema v20, preserving Phase 09 migrations 0019/0020, both immutable receipt authorities, the logical-backup graph, and default-No write-back semantics.

## Self-Check: PASSED

- Confirmed the required runner, source tests, host tests, integration tests, and repository regression test exist.
- Confirmed every Task 1/Task 2 commit listed above exists in Git history and carries exactly one required attribution trailer.
- Confirmed ignored native artifacts contain matching final source/head identities, an 11/11 v20 result, and three zero-failure Maestro reports.

---
*Phase: 09-in-workout-exercise-editing*
*Plan: 10*
*Completed: 2026-09-17*
