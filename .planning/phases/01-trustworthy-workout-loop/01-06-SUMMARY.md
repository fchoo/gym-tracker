---
phase: 01-trustworthy-workout-loop
plan: 06
subsystem: database
tags: [expo-sqlite, migrations, recovery, outbox, leases, launch, android, tdd]

requires:
  - phase: 01-02
    provides: Accessible disabled root shell, shared precision-instrument components, and root failure vocabulary
  - phase: 01-04
    provides: Private configured SQLite writer, FIFO explicit transactions, WAL reader, and ten-case host/device integrity contract
provides:
  - Complete constrained Phase 1 SQLite source schema and retained v0/v1 fixtures
  - Forward-only migration runner with transactional user_version and integrity blocking
  - Validated internal Expo SQLite hot-backup seam for destructive and long migrations
  - Durable typed pending-effect store with leases, stale-revision checks, idempotency, and five-attempt retry bound
  - Locked trusted-launch coordinator and privacy-safe RootFailureState
  - Selected migrations-effects installed-device preflight that preserves the original ten-case kernel contract
affects: [01-07-today, 01-08-active-workout, 01-09-rest, 01-10-completion, all-source-mutations, native-ci]

actuals:
  tokens: 43885
  tasks: 2
  commits: 12

tech-stack:
  added: []
  patterns:
    - Numbered forward-only migrations through the private serialized writer
    - Internal hot backup validated before destructive or long mutation
    - Source transaction plus coalesced durable effect row in one commit
    - Short claim and acknowledge transactions with handlers outside transactions
    - Sequential startup gates returning typed trusted or redacted failed state
    - Native migrations-effects preflight followed by the unchanged ten-case kernel contract

key-files:
  created:
    - src/platform/sqlite/migrations/0001_initial.ts
    - src/platform/sqlite/migrations/index.ts
    - src/platform/sqlite/migrationRunner.ts
    - src/platform/sqlite/recoveryBackup.ts
    - src/platform/sqlite/effects/effectStore.ts
    - src/platform/sqlite/effects/effectRunner.ts
    - src/bootstrap/launchCoordinator.ts
    - src/testing/contracts/migrationsEffects.contract.ts
    - src/ui/screens/RootFailureState.tsx
    - tests/migrations/fixtures/v0-empty.sql
    - tests/migrations/fixtures/v1-phase1.sql
    - tests/sqlite-host/migrations-effects.test.ts
    - src/ui/__tests__/RootFailureState.test.tsx
  modified:
    - app/__native-contracts.tsx
    - package.json
    - tests/sqlite-host/sqliteKernel.host.test.ts

key-decisions:
  - "Schema v1 creates every Phase 1 source-fact, ownership, workout, Undo, recommendation, effect, and settings table before downstream feature plans begin."
  - "Destructive and long migrations require one validated Expo SQLite hot backup and bounded manifest before entering the migration transaction."
  - "Phase 1 durable effects are limited to rest-notification reconciliation and load/reps recommendation generation; later period projections remain excluded."
  - "Effect handlers run outside SQLite transactions; only claim, retry, completion, supersession, and permanent-failure transitions use the serialized writer."
  - "The migrations-effects device suite runs a ten-case preflight before emitting the unchanged ten-case SQLite kernel result, preserving the existing all-pass verifier contract."
  - "Launch readiness is represented by one ordered coordinator and a typed RootFailureState that discloses only category and bounded correlation code."

patterns-established:
  - "Migration attempt latch: one failed runner instance cannot retry repeatedly during the same launch."
  - "Effect lease replay: expired processing rows return to pending and retain monotonic attempt counts."
  - "Revision-safe derivatives: stale expected revisions become superseded without invoking handlers."
  - "Final native evidence: clean CNG build, 16 KiB alignment, identical installed bytes, selected preflight, unchanged kernel contract, and live verifier."

requirements-completed: [FOUND-04, FOUND-05]

coverage:
  - id: D1
    description: "The complete Phase 1 schema migrates retained fixtures transactionally, preserves rows and user_version on injected failures, and blocks corrupt retained data."
    requirement: FOUND-05
    verification:
      - kind: integration
        ref: "npm run test:sqlite:host -- migrations-effects --runInBand"
        status: pass
      - kind: e2e
        ref: "migrations-effects device preflight: migration-empty-v0 through migration-integrity-block"
        status: pass
    human_judgment: false
  - id: D2
    description: "Destructive and long migrations create, close, validate, retain, and safely clean one internal Expo SQLite recovery backup before mutation."
    requirement: FOUND-05
    verification:
      - kind: integration
        ref: "tests/sqlite-host/migrations-effects.test.ts#Plan 01-06 Expo recovery backup port"
        status: pass
      - kind: e2e
        ref: "migrations-effects device preflight:migration-recovery-backup"
        status: pass
    human_judgment: false
  - id: D3
    description: "Atomic source/effect commits, coalescing, lease replay, stale-revision supersession, idempotent completion, and bounded five-attempt failure handling are enforced."
    requirement: FOUND-04
    verification:
      - kind: integration
        ref: "tests/sqlite-host/migrations-effects.test.ts#Plan 01-06 leased durable effects"
        status: pass
      - kind: e2e
        ref: "migrations-effects device preflight:effects-lease-replay, effects-stale-revision, effects-retry-limit"
        status: pass
    human_judgment: false
  - id: D4
    description: "Trusted launch cannot succeed before writer, migrations, integrity checks, reader, stale-lease reset, rest repair, urgent drain, and first trusted query complete."
    requirement: FOUND-04
    verification:
      - kind: unit
        ref: "tests/sqlite-host/migrations-effects.test.ts#Plan 01-06 trusted launch coordinator"
        status: pass
      - kind: automated_ui
        ref: "npm run test:components -- RootFailureState --runInBand"
        status: pass
    human_judgment: false
  - id: D5
    description: "The installed Android suite proves all migrations/effects preflight cases while retaining the original ten-case SQLite kernel all-pass contract."
    requirement: FOUND-05
    verification:
      - kind: e2e
        ref: "npm run test:sqlite:device -- --manifest artifacts/native/migrations-effects/build.json --suite migrations-effects"
        status: pass
      - kind: other
        ref: "node scripts/verify-native-evidence.mjs artifacts/native/migrations-effects/result.json"
        status: pass
    human_judgment: false

duration: 50 min
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 6: Migrations, Durable Effects, and Trusted Launch Summary

**Complete Phase 1 SQLite schema with transactional recovery, leased durable effects, ordered trusted launch, and 20 installed-device contracts**

## Performance

- **Duration:** 50 min
- **Started:** 2026-08-16T02:22:00Z
- **Completed:** 2026-08-16T03:11:37Z
- **Tasks:** 2
- **Files changed:** 17 including this summary
- **Host/component/unit tests:** 204 passed
- **Installed-device preflight:** 10/10 passed, 0 failed, 0 skipped
- **Installed-device kernel:** 10/10 passed, 0 failed, 0 skipped

## Accomplishments

- Created the complete retained Phase 1 schema with explicit ownership, revisions, status/state checks, foreign keys, ordered-row uniqueness, active-session and pending-recommendation guards, durable effects, Undo snapshots, and versioned settings.
- Added forward-only migrations through the proven 01-04 writer, transactional `user_version`, statement/verify/commit failure injection, one-attempt-per-launch behavior, and post-migration foreign-key/integrity blocking.
- Added validated internal Expo SQLite hot backup with bounded manifest and complete cleanup behavior for source-open, destination-open, backup, validation, and cleanup failures.
- Implemented typed pending-effect enqueue, claim, lease reset, retry, complete, supersede, and permanent-failure transitions with handlers outside transactions and a fixed initial five-attempt limit.
- Implemented the locked trusted-launch order and exact root failure copy/actions with category plus correlation code only.
- Proved the selected native preflight and the unchanged SQLite kernel contract on the same installed, source-bound development-test APK.

## Task Commits

### Task 1: Implement forward migrations and validated internal recovery

- **RED:** `847c403` — full schema, fixture, failure, backup, and integrity contracts failed because migration modules did not exist.
- **RED:** `4e1d479` — required a selectable native migration suite.
- **TEST CORRECTION:** `e727dfe` — aligned suite selection with Plan 01-06-owned package/route files.
- **RED:** `72d53ee` — required real Expo `backupDatabaseAsync` device proof.
- **GREEN:** `01fcf06` — complete schema, migration runner, recovery port, retained fixtures, and native preflight.

### Task 2: Implement leased effects and launch-blocking trusted startup

- **RED:** `146db6d` — atomic effects, leases, revisions, retry bounds, launch order, and typed UI contracts failed because modules did not exist.
- **TEST CORRECTION:** `fb656c0` — corrected launch event expectations to use coordinator port names.
- **GREEN:** `1da3abb` — durable effects, trusted launch coordinator, RootFailureState, and device effect cases.

### Integrity Hardening

- **RED:** `4cdcd54` — covered migration/recovery failure branches and reproduced a partially opened recovery-handle leak.
- **GREEN:** `cf70310` — closed the recovery leak and removed impossible serialized-transaction fallbacks.
- **TEST:** `3caac08` — completed branch coverage across migration, recovery, effects, launch, and diagnostics.

## Files Created/Modified

- `src/platform/sqlite/migrations/0001_initial.ts` — complete Phase 1 source schema and indexes.
- `src/platform/sqlite/migrations/index.ts` — ordered migration manifest.
- `src/platform/sqlite/migrationRunner.ts` — one-attempt forward migration runner with transactional versioning and integrity checks.
- `src/platform/sqlite/recoveryBackup.ts` — internal hot-backup validation and bounded manifest seam.
- `src/platform/sqlite/effects/effectStore.ts` — typed outbox enqueue and lifecycle transitions.
- `src/platform/sqlite/effects/effectRunner.ts` — revision-aware, leased, idempotent, bounded effect replay.
- `src/bootstrap/launchCoordinator.ts` — locked startup order producing trusted or redacted failed state.
- `src/ui/screens/RootFailureState.tsx` — exact safe failure UI contract.
- `src/testing/contracts/migrationsEffects.contract.ts` — installed-device migrations/effects preflight.
- `tests/migrations/fixtures/v0-empty.sql` — pre-schema fixture.
- `tests/migrations/fixtures/v1-phase1.sql` — populated retained ownership/workout/rest/Undo/effect/recommendation fixture.
- `tests/sqlite-host/migrations-effects.test.ts` — migration, backup, effect, retry, launch, and privacy contracts.
- `src/ui/__tests__/RootFailureState.test.tsx` — exact copy, disclosure, and retryability proof.
- `app/__native-contracts.tsx` — selected preflight before unchanged kernel contracts.
- `package.json` — suite-aware wrapper around the existing generic device runner.
- `tests/sqlite-host/sqliteKernel.host.test.ts` — preserved runner assertion while allowing the package wrapper.

## Decisions Made

- The initial unreleased schema is complete rather than incremental because Plans 01-07 through 01-10 require all source tables and ownership constraints.
- Internal recovery uses Expo SQLite hot backup only. It is not the later portable user backup and remains in an Android backup-excluded staging domain.
- Durable effect rows remain small, versioned, coalesced, and source-revision scoped. Unknown handler failures become safe permanent failures instead of persisting raw exceptions.
- The existing native runner and verifier remain authoritative. Suite selection is normalized in `package.json`; the route runs migrations/effects preflight first and emits the original ten kernel cases unchanged.
- Plan 01-06 provides the launch coordinator and typed failure surface. Downstream source-backed Today composition consumes these boundaries without requiring this plan to edit unowned Plan 01-02 route files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Closed partially opened recovery database handles**
- **Found during:** Integrity coverage hardening after Task 2
- **Issue:** Parallel source/destination opening could leave the source database open if destination opening failed.
- **Fix:** Opened handles sequentially and closed every acquired handle in an outer `finally`, preserving the original failure and backup cleanup behavior.
- **Files modified:** `src/platform/sqlite/recoveryBackup.ts`, `tests/sqlite-host/migrations-effects.test.ts`
- **Verification:** Destination-open, source-open, backup-failure, validation-failure, and cleanup-failure tests; recovery module reached 100% statements/branches/functions/lines.
- **Committed in:** `4cdcd54`, `cf70310`

**2. [Rule 2 - Missing Critical] Completed integrity-critical branch coverage**
- **Found during:** Plan-level merged coverage gate
- **Issue:** Global coverage passed, but new migration/recovery/effect modules initially had unexercised correctness branches, violating the project instruction requiring complete branch coverage for integrity-critical modules.
- **Fix:** Added focused tests for manifests, transactional reads, integrity query failure, backup validation/cleanup, claim races, absent effects, retry bounds, launch failures, and diagnostic categories; removed only impossible fallbacks guaranteed by the serialized transaction.
- **Files modified:** `src/platform/sqlite/migrationRunner.ts`, `src/platform/sqlite/recoveryBackup.ts`, `src/platform/sqlite/effects/effectStore.ts`, `tests/sqlite-host/migrations-effects.test.ts`, `src/ui/__tests__/RootFailureState.test.tsx`
- **Verification:** Every new database/effect/launch/failure module reports 100% statements, branches, functions, and lines under the unchanged global coverage command.
- **Committed in:** `4cdcd54`, `cf70310`, `3caac08`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical quality safeguard).
**Impact on plan:** Both fixes strengthen recovery correctness and evidence without adding product scope, packages, or later projection types.

## Issues Encountered

- The native build emitted upstream Expo/React Native deprecation, manifest-merge, SDK XML, and missing `NODE_ENV` warnings. The clean CNG assertions, Gradle build, installation, native contracts, and verifier all passed; no warning required a project-source change.
- `adb` was not available on the interactive shell PATH. The approved generic native scripts configured the pinned Android SDK path and completed normally.
- A diagnostic-only raw logcat extraction command initially piped log text into Node as source. It was rerun with `node -e`; no build, app, result, or source state was affected.

## Native Evidence

- **Implementation HEAD:** `3caac087676ec92f26f9fb62a9bdca6ec7724ec0`
- **Source-tree SHA-256:** `e63b3e50caa17d50560d03f8eecca9707b0449e14d2152c3f02059f29829e31e`
- **APK:** `artifacts/native/migrations-effects/gym-tracker-migrations-effects-devtest.apk`
- **APK size:** 247,968,377 bytes
- **APK SHA-256:** `8cb7a4c940df3fb6a1fce5f786f4efd243ae347ea337367d9a6d8892a440c37b`
- **Alignment:** 16 KiB verified
- **Installed bytes:** Exact SHA-256 match
- **Package:** `com.fchoo.gymtracker.devtest`
- **Device:** `emulator-5554`, Android 16/API 36, `arm64-v8a`, `sdk_gphone64_arm64`
- **Migrations/effects preflight:** 10 passed, 0 failed, 0 skipped
- **SQLite kernel:** 10 passed, 0 failed, 0 skipped
- **Evidence verifier:** PASS against current source tree, retained APK, live installed package, and live device identity

## Test Evidence

- `npm run typecheck` — PASS.
- `npm run lint` — PASS, boundary check over 34 application files.
- `npm run check:boundaries` — PASS.
- `npm run test:unit -- --runInBand` — PASS, 46/46.
- `npm run test:components -- --runInBand` — PASS, 33/33.
- `npm run test:sqlite:host -- --runInBand` — PASS, 125/125 at final focused run.
- `npm run test:coverage -- --runInBand` — PASS, 204/204; 99.31% statements, 96.78% branches, 97.86% functions, 99.3% lines.
- New migration, recovery, effect, launch, and typed failure modules — 100% statements, branches, functions, and lines.
- `npm run android:devtest:fresh -- --suite migrations-effects` — PASS.
- `npm run test:sqlite:device -- --manifest artifacts/native/migrations-effects/build.json --suite migrations-effects` — PASS.
- `node scripts/verify-native-evidence.mjs artifacts/native/migrations-effects/result.json` — PASS.
- No package install, coverage threshold reduction, exclusion, generated native commit, or global planning-state edit occurred.

## Authentication Gates

None.

## Known Stubs

None. The launch coordinator consists of explicit production ports for downstream application composition; no empty handler, mock data source, placeholder UI, or later-phase projection is shipped.

## Threat Flags

None. The new retained-database, effect-handler, launch-readiness, and internal backup surfaces were all declared in the Plan 01-06 threat model and have corresponding host/device mitigations.

## Next Phase Readiness

- Plan 01-07 can materialize the frozen starter content and copied-plan activation against the complete schema and trusted launch boundary.
- Plans 01-08 through 01-10 can commit workout facts plus durable rest/recommendation effects atomically through the proven store.
- No blockers remain for the next phase slice.

## Self-Check: PASSED

- All declared Plan 01-06 source, fixture, host, component, and native-contract artifacts exist.
- All eleven pre-summary Plan 01-06 commits exist and contain the required trailer exactly once.
- The fresh native build manifest, retained APK, selected-suite result, installed bytes, and live evidence verifier all pass at implementation HEAD `3caac08`.
- No tracked file deletion occurred.
- The only remaining untracked path is orchestrator-owned `.planning/current-agent-id.txt`, intentionally untouched.
- `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.planning/REQUIREMENTS.md` were not modified.

---
*Phase: 01-trustworthy-workout-loop*
*Completed: 2026-08-16*
