---
phase: 02-owned-library-and-planning
plan: 06
subsystem: database
tags: [sqlite, fts5, trigram, expo-sqlite, android, native-evidence, tdd]

requires:
  - phase: 02-owned-library-and-planning
    provides: Migration 0004 authoritative exercise_search_terms and the retained v4 content-library fixture boundary
  - phase: 01-trustworthy-workout-loop
    provides: Private serialized SQLite writer, prepared statements, native contract route, exact-APK build, and evidence verification
provides:
  - External-content trigram FTS5 migration with same-transaction insert, update, and delete synchronization
  - Private-writer parity, integrity-check, and deterministic rebuild repository
  - Eight shared host and packaged Expo SQLite FTS prerequisite contracts
  - Exact implementation-HEAD Android APK evidence with 16 KiB alignment and retained-installed byte equality
affects: [library-search, exercise-search, phase2-native-contracts, migration-manifest, release-evidence]

actuals:
  tokens: 20215
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - External-content FTS remains a disposable derivative of authoritative exercise_search_terms rows
    - True parity uses the FTS shadow docsize table rather than external-content passthrough reads
    - Packaged contract counts and case IDs derive from the exported shared contract source
    - Exact native evidence binds implementation HEAD, source-tree SHA-256, retained APK, installed bytes, package, and device

key-files:
  created:
    - src/platform/sqlite/migrations/0005_exercise_search_fts.ts
    - src/platform/sqlite/repositories/exerciseSearchIndexRepository.ts
    - src/testing/contracts/phase2Fts.contract.ts
    - src/testing/contracts/phase2Fts.contract.test.ts
    - tests/migrations/fixtures/v4-content-library.sql
    - tests/sqlite-host/exercise-search-fts.test.ts
    - artifacts/native/phase2-fts/build.json
    - artifacts/native/phase2-fts/gym-tracker-phase2-fts-devtest.apk
    - artifacts/native/phase2-fts/result.json
    - artifacts/native/phase2-fts/zipalign.txt
  modified:
    - app/__native-contracts.tsx
    - scripts/run-coverage-gate.mjs
    - scripts/run-native-sqlite-contracts.mjs
    - scripts/verify-native-evidence.mjs

key-decisions:
  - "Migration 0005 is direct-imported by focused contracts only; src/platform/sqlite/migrations/index.ts remains unchanged for Plan 02-11."
  - "Index parity is measured against exercise_search_terms_fts_docsize stable IDs, because ordinary reads from an external-content FTS table can passthrough source rows and hide index drift."
  - "One- and two-code-point queries remain bounded relational prerequisites; three or more normalized code points use a prepared quoted trigram MATCH phrase."
  - "The Phase 2 FTS adapter disables only Expo's automatic unused-statement close cleanup while retaining explicit statement finalization, avoiding Expo's FTS close double-finalize bug."
  - "Native results expose only case IDs, counts, durations, statuses, and bounded error codes; raw search text is never emitted."

patterns-established:
  - "FTS migration pattern: create external-content table, install same-transaction triggers, run initial rebuild, verify shadow IDs, then run source-aware integrity-check."
  - "FTS repair pattern: run rebuild and full parity/integrity verification inside one private serialized write transaction."
  - "Native prerequisite pattern: source-derived expected cases plus current source, retained APK, installed bytes, package, device, and alignment verification."

requirements-completed: [LIB-04]

coverage:
  - id: D1
    description: "Migration 0005 creates a source-synchronized external-content trigram index from retained v4 and preserves exact source truth through updates, deletes, failures, and rebuilds."
    requirement: LIB-04
    verification:
      - kind: integration
        ref: "tests/sqlite-host/exercise-search-fts.test.ts#exercise search FTS migration"
        status: pass
      - kind: other
        ref: "npm run test:coverage -- --runInBand"
        status: pass
    human_judgment: false
  - id: D2
    description: "Parity, integrity, short-query bounds, punctuation-safe MATCH data, rollback, stable IDs, and idempotent rebuild are shared by host and packaged adapters."
    requirement: LIB-04
    verification:
      - kind: unit
        ref: "src/testing/contracts/phase2Fts.contract.test.ts#Phase 2 packaged FTS prerequisite"
        status: pass
      - kind: other
        ref: "npm run typecheck && npm run check:boundaries"
        status: pass
    human_judgment: false
  - id: D3
    description: "The exact packaged Expo SQLite adapter passes all eight FTS cases with zero failed or skipped results on a 16 KiB-aligned APK identical to the live installed package."
    requirement: LIB-04
    verification:
      - kind: e2e
        ref: "npm run test:sqlite:device -- --suite phase2-fts --manifest artifacts/native/phase2-fts/build.json"
        status: pass
      - kind: other
        ref: "node scripts/verify-native-evidence.mjs artifacts/native/phase2-fts/result.json"
        status: pass
    human_judgment: false

duration: 1h 04m
completed: 2026-08-18
status: complete
---

# Phase 02 Plan 06: Packaged FTS5 Trigram Prerequisite Summary

**Source-synchronized external-content trigram FTS with private repair commands and exact installed Expo SQLite proof across eight fail-closed contracts**

## Performance

- **Duration:** 1h 04m
- **Started:** 2026-08-18T02:08:05Z
- **Completed:** 2026-08-18T03:12:26Z
- **Tasks:** 3
- **Tracked files changed:** 10
- **Implementation commits:** 6
- **Merged host coverage run:** 842 tests passed
- **Integrity-critical gate:** 33 files at 100% statements, branches, functions, and lines
- **Packaged prerequisite:** 8/8 passed, 0 failed, 0 skipped

## Accomplishments

- Added forward-only migration `0005_exercise_search_fts` with an external-content trigram table, transactional insert/update/delete triggers, initial rebuild, compile-option verification, true shadow-index stable-ID parity, and source-aware integrity-check.
- Added private-writer `verifyParity` and `rebuildSearchIndex` commands that never mutate authoritative search terms and refuse to acknowledge an incomplete repair.
- Added eight shared host/native cases for SQLite/FTS5 capability, trigram substring behavior, one/two/three-code-point bounds, punctuation/Unicode-safe bound MATCH data, trigger rollback, stable-ID parity, integrity drift, and idempotent rebuild.
- Extended the guarded native route, runner, and independent verifier while preserving the existing `sqlite-kernel` and `migrations-effects` suites.
- Built and installed the exact development-test APK from implementation HEAD `aedcfba057e231343c0f246c3745232349d0ab85`, source digest `a3da2615c4e3da1720a4223292d49bcc3c8d91b61fcb5c540dfb1aa1ff8f3c64`, and APK SHA-256 `bc46ff6efb16648e83e8db1dff88396909f709c0bcdc35a0bfeabbda193ce09e`.

## Native Evidence

| Property | Final Value |
|---|---|
| Implementation HEAD | `aedcfba057e231343c0f246c3745232349d0ab85` |
| Source-tree SHA-256 | `a3da2615c4e3da1720a4223292d49bcc3c8d91b61fcb5c540dfb1aa1ff8f3c64` |
| APK SHA-256 | `bc46ff6efb16648e83e8db1dff88396909f709c0bcdc35a0bfeabbda193ce09e` |
| APK size | `117126646` bytes |
| Package | `com.fchoo.gymtracker.devtest` |
| Device | `emulator-5554`, Android 16 / API 36, `arm64-v8a` |
| Alignment | 16 KiB verified |
| Installed bytes | Byte-identical to retained APK |
| Contracts | 8 total, 8 passed, 0 failed, 0 skipped |

The native artifacts remain under the repository's intentionally ignored `artifacts/native/phase2-fts/` evidence path. They are retained on disk and verified live, but are not force-added to Git.

## Task Commits

1. **Task 1 RED:** `1eb35ae` — retained v4 fixture and failing migration/trigger/rollback/bounds contracts.
2. **Task 1 GREEN:** `423d2e2` — external-content trigram migration with transactional synchronization.
3. **Task 2 RED:** `060cf5d` — exact exported case IDs, strict result payloads, native routing, and private repair requirements.
4. **Task 2 GREEN:** `7dcb279` — parity/rebuild repository, shared host/native runner, route, and suite-aware evidence verification.
5. **Task 3 native fix:** `752f59b` — Expo FTS close double-finalize workaround with explicit statement cleanup preserved.
6. **Overall integrity gate:** `aedcfba` — migration/repository failure matrices and explicit 100% integrity-critical coverage.

## Files Created/Modified

- `src/platform/sqlite/migrations/0005_exercise_search_fts.ts` — external-content trigram schema, triggers, rebuild, capability, parity, and integrity verification.
- `src/platform/sqlite/repositories/exerciseSearchIndexRepository.ts` — true shadow-index parity, deterministic repair, and packaged FTS connection lifecycle.
- `src/testing/contracts/phase2Fts.contract.ts` — eight adapter-neutral FTS prerequisite cases and strict result validator.
- `src/testing/contracts/phase2Fts.contract.test.ts` — host runner, malformed payload, private writer, Expo lifecycle, and failure cleanup tests.
- `tests/migrations/fixtures/v4-content-library.sql` — immutable post-0004 retained migration fixture.
- `tests/sqlite-host/exercise-search-fts.test.ts` — retained migration, trigger, rollback, bounds, parity, integrity, and rebuild proof.
- `app/__native-contracts.tsx` — guarded `phase2-fts` suite selection and bounded machine result.
- `scripts/run-native-sqlite-contracts.mjs` — suite binding, source-derived FTS case count, strict payload validation, and retained result writer.
- `scripts/verify-native-evidence.mjs` — suite-aware exact source/APK/install/device/case verification.
- `scripts/run-coverage-gate.mjs` — explicit 100% integrity-critical enumeration for migration 0005 and the search-index repository.

## Decisions Made

- Used FTS5 `_docsize` shadow IDs for parity because external-content table reads are not proof that index tokens exist.
- Kept short-query relational behavior in the shared prerequisite contract so the documented trigram one/two-code-point gap is explicit.
- Kept repair inside the private serialized writer and treated FTS integrity failure as derivative drift, never a source mutation.
- Scoped Expo's `finalizeUnusedStatementsBeforeClosing: false` workaround only to FTS contract databases; every app-owned prepared statement is still explicitly finalized.
- Kept `src/platform/sqlite/migrations/index.ts` untouched for Plan 02-11.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced external-content passthrough parity with true shadow-index parity**
- **Found during:** Task 2 repository implementation
- **Issue:** Counting or selecting the external-content FTS table can return source rows even when the FTS index is missing, hiding drift.
- **Fix:** Compare authoritative IDs and counts against `exercise_search_terms_fts_docsize`, then run `integrity-check` with rank `1`.
- **Files modified:** `src/platform/sqlite/migrations/0005_exercise_search_fts.ts`, `src/platform/sqlite/repositories/exerciseSearchIndexRepository.ts`
- **Verification:** Host drift tests, packaged stable-ID parity, integrity-check, rebuild, and 100% coverage all pass.
- **Committed in:** `7dcb279`

**2. [Rule 2 - Missing Critical] Made independent evidence verification suite-aware**
- **Found during:** Task 2 native runner preparation
- **Issue:** The existing verifier hardcoded the ten Phase 1 kernel cases and could not independently validate the eight-case FTS prerequisite.
- **Fix:** Derive FTS case IDs from the shared source and select exact expected IDs/counts from the manifest suite while preserving Phase 1 behavior.
- **Files modified:** `scripts/run-native-sqlite-contracts.mjs`, `scripts/verify-native-evidence.mjs`
- **Verification:** Existing Phase 1 route/runner source contracts pass; final Phase 2 verifier passes against live installed bytes.
- **Committed in:** `7dcb279`

**3. [Rule 1 - Bug] Avoided Expo SQLite FTS double-finalize during database close**
- **Found during:** Task 3 first packaged run
- **Issue:** Expo SQLite aborted in `exsqlite3_finalize` while closing the first FTS database because automatic unused-statement cleanup finalized FTS-owned statements twice.
- **Fix:** Open only FTS contract databases with `finalizeUnusedStatementsBeforeClosing: false` while preserving explicit app-owned statement finalization and deterministic cleanup.
- **Files modified:** `src/platform/sqlite/repositories/exerciseSearchIndexRepository.ts`, `src/testing/contracts/phase2Fts.contract.ts`, `src/testing/contracts/phase2Fts.contract.test.ts`
- **Verification:** Final packaged run completes all eight databases/cases without native crash; lifecycle failure tests and exact installed verification pass.
- **Committed in:** `752f59b`

**4. [Rule 2 - Missing Critical] Added both FTS modules to the explicit 100% integrity gate**
- **Found during:** Overall verification
- **Issue:** The first merged coverage run passed global thresholds but did not enforce complete branch coverage for the new integrity-critical migration and repair repository.
- **Fix:** Enumerated both files and added fail-closed migration, parity, rebuild, Expo lifecycle, and cleanup tests.
- **Files modified:** `scripts/run-coverage-gate.mjs`, `tests/sqlite-host/exercise-search-fts.test.ts`, `src/testing/contracts/phase2Fts.contract.test.ts`
- **Verification:** Coverage reports both modules at 100% statements, branches, functions, and lines; 33 integrity-critical files pass.
- **Committed in:** `aedcfba`

---

**Total deviations:** 4 auto-fixed (2 Rule 1 bugs, 2 Rule 2 missing critical controls)
**Impact on plan:** All fixes were required for truthful parity, crash-free packaged execution, exact evidence verification, and the project's integrity-coverage rule. No package, product UI, runtime migration manifest, or source-authority scope was added.

## Issues Encountered

- The API 36 emulator launched from a detached short-lived shell was reaped after boot; the same AVD was relaunched in a persistent process while the existing locked build continued its bounded boot wait. No duplicate build was started.
- The first packaged APK exposed the Expo SQLite FTS close double-finalize bug and was overwritten after the committed fix. It is not retained or cited as passing evidence.
- Existing Gradle/Expo dependency deprecation and SDK XML warnings remained non-fatal and out of scope; build, install, native contracts, and evidence verification all completed successfully.

## Known Stubs

None. The changed files contain no TODO/FIXME, skipped tests, UI placeholders, mock product data, or unimplemented result paths.

## Threat Review

- T-02-02: MATCH input is normalized, length-bounded, safely quoted, and passed as a prepared parameter; one/two-code-point behavior is relational and bounded.
- T-02-04: Migration and rebuild are forward-only/private-writer operations; `migrations/index.ts` remains reserved for Plan 02-11.
- T-02-06: Same-transaction triggers, shadow-ID parity, source-aware integrity-check, deterministic rebuild, and rollback are proven on host and packaged adapters.
- T-02-07: Native output contains only case IDs, counts, durations, status, and bounded error codes.
- No unplanned network, authentication, file-access, or trust-boundary surface was introduced.

## Verification

- `npm run test:coverage -- --runInBand` — PASS, 842 tests; 33 integrity-critical files at 100% all metrics.
- `npm run typecheck` — PASS.
- `npm run lint` — PASS.
- `npm run check:boundaries` — PASS.
- `npm run test:sqlite:device -- --suite phase2-fts --manifest artifacts/native/phase2-fts/build.json` — PASS, 8/8.
- Plan JSON result gate — PASS, 0 failed and 0 skipped.
- `node scripts/verify-native-evidence.mjs artifacts/native/phase2-fts/result.json` — PASS against final implementation HEAD, source digest, retained APK, live installed bytes, package, and API 36 device.

## User Setup Required

None - no package installation, credentials, external service, or manual device action is required.

## Next Phase Readiness

- Plan 02-09 may rely on packaged Expo SQLite trigram behavior, bounded short-query fallback, punctuation-safe prepared MATCH data, stable-ID parity, integrity-check, and deterministic rebuild.
- Plan 02-11 remains the sole final owner of runtime migration manifest registration.
- No blockers remain for this prerequisite.

## Self-Check: PASSED

- All implementation, contract, fixture, summary, and retained native evidence files exist.
- Commits `1eb35ae`, `423d2e2`, `060cf5d`, `7dcb279`, `752f59b`, and `aedcfba` exist and each carries the required TRAE CLI trailer exactly once.
- Final build/result identities match implementation HEAD `aedcfba057e231343c0f246c3745232349d0ab85`, source digest `a3da2615c4e3da1720a4223292d49bcc3c8d91b61fcb5c540dfb1aa1ff8f3c64`, and APK digest `bc46ff6efb16648e83e8db1dff88396909f709c0bcdc35a0bfeabbda193ce09e`.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-18*
