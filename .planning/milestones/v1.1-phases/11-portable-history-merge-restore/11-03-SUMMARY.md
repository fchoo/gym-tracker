---
phase: 11-portable-history-merge-restore
plan: 03
subsystem: portability, ui, native-evidence, settings
tags: [data-recovery, portable-merge, gtbk, maestro, expo-sqlite]

requires:
  - phase: 11-portable-history-merge-restore
    plan: 02
    provides: full portable merge planner, one-time token commit path, and 12-case Expo SQLite backstop
provides:
  - Settings Data & recovery surface with one canonical export, Restore clean, and Import / merge backup
  - safe latest-backup metadata display without leaking filesystem paths, passwords, or archive bytes
  - accessible bounded merge preview with exact MERGE confirmation and cancel/back/unmount token invalidation
  - development-test fixture selector seam for deterministic Restore clean and Import / merge Maestro evidence
  - manifest-bound Phase 11 Maestro evidence paired with the portable-merge SQLite backstop
affects: [11-04-portability-verification, phase-12-sync]

actuals:
  tokens: 17925
  tasks: 3
  commits: 29

tech-stack:
  added: []
  patterns:
    - Keep production import/export file pickers unchanged, and route only Phase 11 development-test builds through app-owned fixture selectors.
    - Keep lifecycle-visible UI evidence in Maestro while treating real Expo SQLite contracts as the source of database rollback and rebuild proof.
    - Keep host-only runtime read helpers outside the full React/Expo runtime import graph so integration coverage can run under the node test environment.

key-files:
  created:
    - maestro/phase11/portable-merge.yaml
    - scripts/run-phase11-maestro.mjs
    - src/bootstrap/customExerciseRuntimeReadPort.ts
  modified:
    - app/more/data-and-recovery.tsx
    - app/more/__tests__/data-and-recovery.test.tsx
    - src/bootstrap/workoutAppRuntime.tsx
    - src/bootstrap/workoutAppRuntime.test.tsx
    - src/bootstrap/workoutMutationTestControls.ts
    - src/domains/portability/backupCommands.ts
    - src/domains/portability/backupCommands.test.ts
    - src/platform/files/expoBackupFilePort.ts
    - src/platform/files/expoBackupFilePort.test.ts
    - src/testing/contracts/migrationsEffects.contract.ts
    - src/testing/contracts/portableMerge.contract.ts
    - src/testing/contracts/portableMerge.contract.test.ts
    - src/ui/screens/SettingsScreen.tsx
    - src/ui/__tests__/SettingsScreen.test.tsx
    - tests/integration/custom-exercise.test.ts
    - package.json

key-decisions:
  - "The UI exposes Restore clean and Import / merge backup as separate actions while preserving one canonical GTBK export format."
  - "The merge review names bounded conflict classes and requires exact MERGE before a one-use token can commit; all cancellation and stale paths invalidate tokens and leave local data unchanged."
  - "Maestro evidence proves lifecycle-visible UI behavior only; byte-level rollback and deterministic rebuild proof remain mapped to the real Expo SQLite portable-merge contract."
  - "The Phase 11 dev-test fixture seam uses separate restore and merge selector files scoped to the app-owned external directory and never changes the production picker."

patterns-established:
  - "Native UI evidence runners must fail closed on manifest/source/APK identity and consume SQLite backstop artifacts before running Maestro."
  - "Phase-specific fixture selectors are development-test-only and must be covered by source contract tests."
  - "Host integration tests should import small pure runtime read ports instead of the full production runtime provider when they do not need Expo adapters."
  - "Native portable-merge contract runtimes use runtime-scoped recovery backup IDs to avoid Expo SQLite shared-object teardown races."

requirements-completed: [DATA-08, DATA-09]

coverage:
  - id: D1
    description: "Data & recovery presents a bounded merge review with inserted, duplicate, archive-wins, local-wins, kept-both, remapped, and conflict counts before commit."
    requirement: DATA-08
    verification:
      - kind: unit
        ref: app/more/__tests__/data-and-recovery.test.tsx
        status: pass
      - kind: automated_ui
        ref: artifacts/native/phase11/phase11-maestro.json#phase11-merge-review-cancel
        status: pass
      - kind: e2e
        ref: artifacts/native/phase11/result.json portable-merge 12/12
        status: pass
    human_judgment: false
  - id: D2
    description: "The UI communicates stable owner-scoped identity as the duplicate boundary without exposing name/content-based dedup controls."
    requirement: DATA-08
    verification:
      - kind: unit
        ref: app/more/__tests__/data-and-recovery.test.tsx
        status: pass
      - kind: automated_ui
        ref: artifacts/native/phase11/phase11-maestro.json#phase11-merge-review-cancel
        status: pass
      - kind: e2e
        ref: artifacts/native/phase11/result.json portable-merge same-name and same-identity cases
        status: pass
    human_judgment: false
  - id: D3
    description: "Settings keeps Export backup, Restore clean, and Import / merge backup distinct while retaining the v1 clean-restore path and safe latest-backup metadata."
    requirement: DATA-09
    verification:
      - kind: unit
        ref: src/bootstrap/workoutAppRuntime.test.tsx
        status: pass
      - kind: unit
        ref: src/domains/portability/backupCommands.test.ts
        status: pass
      - kind: unit
        ref: src/platform/files/expoBackupFilePort.test.ts
        status: pass
      - kind: automated_ui
        ref: artifacts/native/phase11/phase11-maestro.json#phase11-data-recovery-navigation
        status: pass
      - kind: automated_ui
        ref: artifacts/native/phase11/phase11-maestro.json#phase11-restore-clean-fixture
        status: pass
    human_judgment: false
  - id: D4
    description: "Merge commit requires exact MERGE, consumes one preflight token, prevents duplicate press drift, and reports ready or rebuild_pending without rerunning the writer."
    requirement: DATA-08
    verification:
      - kind: unit
        ref: src/domains/portability/mergeCommands.test.ts
        status: pass
      - kind: unit
        ref: src/bootstrap/workoutAppRuntime.test.tsx
        status: pass
      - kind: automated_ui
        ref: artifacts/native/phase11/phase11-maestro.json#phase11-merge-commit-relaunch
        status: pass
      - kind: e2e
        ref: artifacts/native/phase11/result.json portable-merge rollback and derivative parity cases
        status: pass
    human_judgment: false
  - id: D5
    description: "Phase 11 evidence is manifest-bound to the retained and installed development-test APK with current source digest and four passing Maestro stages."
    requirement: DATA-09
    verification:
      - kind: other
        ref: node --test scripts/phase11-evidence-scripts.test.mjs
        status: pass
      - kind: automated_ui
        ref: npm run test:maestro:phase11 -- --manifest artifacts/native/phase11/build.json
        status: pass
      - kind: e2e
        ref: npm run test:sqlite:device -- --suite portable-merge --manifest artifacts/native/phase11/build.json
        status: pass
    human_judgment: false

duration: multi-session
completed: 2026-09-22
status: complete
---

# Phase 11 Plan 03: Data & Recovery Merge UI Summary

**Settings now exposes the manual portable-backup surface end to end: one canonical encrypted export, distinct Restore clean and Import / merge backup actions, preview-before-commit merge review, and manifest-bound native UI evidence.**

## Performance

- **Duration:** Multi-session execution
- **Completed:** 2026-09-22
- **Tasks:** 3 implementation tasks plus host/native verification closure
- **Files modified:** 20 tracked files across Data & recovery UI, runtime wiring, file-port seams, evidence runner, Maestro flow, and focused tests

## Accomplishments

- Added latest-backup metadata to the runtime and Data & recovery screen so the owner sees whether a canonical GTBK backup has ever been produced, plus a safe display name and produced-at timestamp after successful export.
- Split the recovery surface into `Restore clean` and `Import / merge backup` actions. Clean restore keeps the replacement behavior and exact `REPLACE` confirmation; merge has its own picker, password flow, bounded preview, exact `MERGE` confirmation, cancellation cleanup, duplicate-press latch, stale-token handling, and rebuild retry state.
- Wired `preflightSecureMerge`, `commitSecureMerge`, merge preflight invalidation, and shared restore/merge reconciliation into the app runtime without adding Drive, sign-in, account, sync, raw-row, path, or SQL exposure.
- Added stable native test IDs for restore, merge, cancel, and rebuild retry buttons so Maestro drives pressable controls rather than text children.
- Added a Phase 11 Maestro runner that creates deterministic encrypted GTBK v2 fixtures, stages them in the app-owned external directory, writes separate restore/merge selector files, verifies current source and APK identity, requires the portable-merge SQLite backstop, and writes a fail-closed evidence JSON.
- Fixed two evidence-harness issues found during native proof: host integration tests now import the custom-exercise read port without loading the full Expo runtime graph, and native portable-merge runtime migrations use runtime-scoped recovery backup IDs to avoid Expo SQLite shared-object races.

## Task Commits

Key implementation and verification commits:

1. **Task 1: Runtime merge commands and export metadata** - `23ca2fc` (feat)
2. **Task 2: Split restore-clean and merge review UI** - `dff2e30`, `36004ec` (feat)
3. **Task 3: Phase 11 native UI evidence runner** - `7da20e2` (feat)
4. **Task 3 native-flow hardening** - `98ad850`, `eb0ef62`, `59ce89d`, `7eef3e8`, `3bb9deb`, `bd2f983`, `908d036`, `fa51b0a`, `fe8f565`, `afba7e1`, `31cc522`, `dfc638f`, `64384c1`, `1b38ca9`, `d6fbcdf`, `00c2f49`, `85eaea5`, `b8e43fb`, `dc447aa`, `1901bdc`, `f3fe61e`, `47a834a` (fix)
5. **Host/native harness closeout** - `b6a24dd`, `4923ab3`, `e754785` (fix/test)

## Files Created/Modified

- `app/more/data-and-recovery.tsx` - Adds the split export, Restore clean, and Import / merge backup UI with token-safe confirmation, safe copy, error, success, and rebuild-pending states.
- `app/more/__tests__/data-and-recovery.test.tsx` - Covers cancel/no-mutation, preview counts, exact confirmations, duplicate press latches, stale tokens, v1 merge guidance, rebuild retry, accessibility, and unchanged CSV/export paths.
- `src/bootstrap/workoutAppRuntime.tsx` - Wires production backup, restore, merge, metadata, and reconciliation dependencies; re-exports the custom-exercise read port.
- `src/bootstrap/customExerciseRuntimeReadPort.ts` - Extracts pure custom-exercise read helpers so host integration tests do not import the full React/Expo runtime graph.
- `src/bootstrap/workoutMutationTestControls.ts` - Lazily loads `expo-constants` for development-test mutation controls to avoid host integration import leaks.
- `src/bootstrap/workoutAppRuntime.test.tsx` - Covers latest-backup metadata, merge commands, and rebuild retry behavior.
- `src/domains/portability/backupCommands.ts` and `src/domains/portability/backupCommands.test.ts` - Expose safe backup metadata without leaking archive paths or passwords.
- `src/platform/files/expoBackupFilePort.ts` and `src/platform/files/expoBackupFilePort.test.ts` - Add production-safe file ports plus Phase 11 restore/merge fixture selectors with complete branch coverage.
- `src/testing/contracts/migrationsEffects.contract.ts`, `src/testing/contracts/portableMerge.contract.ts`, and `src/testing/contracts/portableMerge.contract.test.ts` - Keep native contract runtimes isolated through runtime-scoped recovery backups.
- `scripts/run-phase11-maestro.mjs`, `scripts/phase11-evidence-scripts.test.mjs`, `maestro/phase11/portable-merge.yaml`, and `package.json` - Add the manifest-bound Phase 11 Maestro evidence command and its source contract.
- `src/ui/screens/SettingsScreen.tsx` and `src/ui/__tests__/SettingsScreen.test.tsx` - Update Settings recovery copy to mention restore clean, merge backup, and CSV export.
- `tests/integration/custom-exercise.test.ts` - Imports the extracted pure read-port helper.

## Verification

- `npm run test:unit -- --runInBand src/testing/contracts/portableMerge.contract.test.ts src/platform/files/expoBackupFilePort.test.ts src/bootstrap/workoutMutationTestControls.test.ts src/bootstrap/workoutAppRuntime.test.tsx` - pass, 97/97 tests.
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts tests/sqlite-host/logicalMergeRepository.test.ts` - pass, 281/281 tests.
- `npm run test:integration -- --runInBand --no-cache tests/integration/custom-exercise.test.ts` - pass, 23/23 tests.
- `node --test scripts/phase11-evidence-scripts.test.mjs` - pass, 7/7 tests.
- `npm run typecheck` - pass.
- `npm run lint` - pass, boundary check 249 files.
- `npm run check:boundaries` - pass, boundary check 249 files.
- `npm run test:coverage -- --runInBand` - pass, 159/159 suites and 3,077/3,077 tests; all 97 integrity-critical files reached 100% statements, branches, functions, and lines. Existing React Native `act()` warnings and Expo notification test-environment warnings remain non-fatal.
- `npm run android:devtest:fresh -- --suite phase11 --serial emulator-5554` - pass, generated and installed exact Phase 11 dev-test APK.
- `npm run test:sqlite:device -- --suite portable-merge --manifest artifacts/native/phase11/build.json` - pass, 12/12 cases.
- `npm run test:maestro:phase11 -- --manifest artifacts/native/phase11/build.json` - pass, 4/4 flows.

## Native Evidence

Final Phase 11 development-test manifest:

- `base_head`: `e754785d407642b4c72b0e756853c9a38213d2a9`
- `source_tree_sha256`: `7a9e7ac156cf3e96f19dd83455d44b8894a0468521eabb0614f579f61bf71234`
- APK SHA-256: `7420604609420e4ca336305604cd48924b50058a5ef2fb98adf6310da95f8504`
- Device: `emulator-5554`, API 36, arm64-v8a, Android 16
- SQLite backstop: `portable-merge`, 12 total, 12 passed, 0 failed, 0 skipped
- Maestro evidence: `phase11-data-recovery-navigation`, `phase11-restore-clean-fixture`, `phase11-merge-review-cancel`, and `phase11-merge-commit-relaunch` all passed with one JUnit testcase each.

## Deviations from Plan

### Auto-fixed Issues

**1. [Native picker instability] Android DocumentsUI could not reliably select deterministic fixtures**

- **Found during:** Task 3 native evidence.
- **Issue:** The system picker state was unstable across staged GTBK fixtures, causing the flow to miss or select the wrong archive path.
- **Fix:** Added a Phase 11 development-test fixture file port and runner-managed selector files. Restore and merge use distinct selector files while production continues to use the system `application/octet-stream` picker.
- **Files modified:** `src/platform/files/expoBackupFilePort.ts`, `src/bootstrap/workoutAppRuntime.tsx`, `scripts/run-phase11-maestro.mjs`, `maestro/phase11/portable-merge.yaml`.
- **Verification:** `node --test scripts/phase11-evidence-scripts.test.mjs`; `npm run test:maestro:phase11 -- --manifest artifacts/native/phase11/build.json`.
- **Committed in:** `64384c1`, `1b38ca9`, `f3fe61e`.

**2. [Maestro interaction drift] Long Data & recovery flows needed stable pressable targets and readiness waits**

- **Found during:** Task 3 native evidence.
- **Issue:** Tapping text children, hidden password fields, single Back navigation, and immediate Settings taps caused false UI failures.
- **Fix:** Added stable retry/action test IDs, explicit keyboard dismissal, scoped scroll waits, route readiness waits, hardware Back navigation, and retry-safe rebuild assertions.
- **Files modified:** `app/more/data-and-recovery.tsx`, `maestro/phase11/portable-merge.yaml`, `scripts/phase11-evidence-scripts.test.mjs`.
- **Verification:** `npm run test:maestro:phase11 -- --manifest artifacts/native/phase11/build.json`.
- **Committed in:** `d6fbcdf`, `00c2f49`, `85eaea5`, `b8e43fb`, `dc447aa`, `1901bdc`, `47a834a`.

**3. [Host import boundary] Custom exercise integration coverage imported Expo runtime shims through one pure read helper**

- **Found during:** Final `npm run test:coverage -- --runInBand`.
- **Issue:** `tests/integration/custom-exercise.test.ts` needed only `createCustomExerciseRuntimeReadPort`, but importing it from `workoutAppRuntime.tsx` pulled production Expo modules and failed on `expo/virtual/env.js` under the node integration Jest project.
- **Fix:** Extracted the pure custom-exercise read port into `src/bootstrap/customExerciseRuntimeReadPort.ts`, re-exported its public types from `workoutAppRuntime.tsx`, and moved dev-test `expo-constants` usage behind lazy requires.
- **Files modified:** `src/bootstrap/customExerciseRuntimeReadPort.ts`, `src/bootstrap/workoutAppRuntime.tsx`, `src/bootstrap/workoutMutationTestControls.ts`, `tests/integration/custom-exercise.test.ts`.
- **Verification:** `npm run test:integration -- --runInBand --no-cache tests/integration/custom-exercise.test.ts`; `npm run test:coverage -- --runInBand`.
- **Committed in:** `b6a24dd`.

**4. [Native contract isolation] Portable-merge device cases raced on a shared recovery backup database name**

- **Found during:** Final `portable-merge` native reruns after rebuilding the Phase 11 APK.
- **Issue:** Different portable-merge cases intermittently failed with `sqlite_query_failed` or `migration_statement_failed` during migration because each case opens paired archive/local runtimes and the Expo adapter used a shared `migration-recovery-*` database name.
- **Fix:** Native contract runtimes now expose a runtime-scoped recovery backup port, with backup IDs prefixed by the runtime database name and cleanup tracking those backup databases.
- **Files modified:** `src/testing/contracts/migrationsEffects.contract.ts`, `src/testing/contracts/portableMerge.contract.ts`, `src/testing/contracts/portableMerge.contract.test.ts`.
- **Verification:** `npm run test:sqlite:device -- --suite portable-merge --manifest artifacts/native/phase11/build.json` passed 12/12.
- **Committed in:** `e754785`.

---

**Total deviations:** 4 auto-fixed verification and native-evidence issues.
**Impact on plan:** The changes tighten the planned evidence path without adding Phase 12 sync scope or changing the production backup format.

## Issues Encountered

- The first final native build attempt failed because `emulator-5554` was not running; starting `gym-tracker-api36` in a persistent session restored the device and the exact build passed.
- Two pre-fix native `portable-merge` runs failed on different cases. The root cause was the native contract adapter sharing one recovery-backup database name across paired archive/local migrations; runtime-scoped backup IDs resolved this and the final device contract passed 12/12.
- The full coverage run initially failed because a host integration suite imported a pure custom-exercise read helper through the full React/Expo runtime graph, which exposed Expo ESM shims to the node integration Jest project. The helper extraction fixed the import boundary.
- Existing non-fatal React Native `act()` warnings and Expo notification test-environment warnings remain during component/unit coverage runs.

## User Setup Required

None.

## Next Phase Readiness

Plan 11-04 can now run final portability verification. It should reuse the final Phase 11 manifest and evidence artifacts above, keep rollback proof anchored to the real Expo SQLite contract, and broaden the closeout gate across `migrations-effects`, `portable-merge`, accessibility/component coverage, and the Phase 11 Maestro corpus. Phase 12 Drive/sign-in/sync remains out of scope until Phase 11 verification is closed.

---
*Phase: 11-portable-history-merge-restore*
*Plan: 11-03*
*Completed: 2026-09-22*
