---
phase: 01-trustworthy-workout-loop
plan: 04
subsystem: database
tags: [expo-sqlite, sqlite, fifo, transactions, android, native-contracts, tdd]

requires:
  - phase: 01-03
    provides: Typed errors, test harnesses, Node 24 host SQLite, architecture boundaries, and CI commands
provides:
  - Private preconfigured Expo SQLite writer and separate WAL reader
  - FIFO explicit BEGIN IMMEDIATE, COMMIT, and ROLLBACK mutation ownership
  - Narrow bound-parameter transaction executor with no raw connection export
  - Ten shared host and installed-device SQLite integrity contracts
  - Source- and APK-digest-bound reusable native build/evidence workflow
affects: [01-05-argon2, 01-06-migrations-effects, all-source-mutations, native-ci]

actuals:
  tokens: 26995
  tasks: 2
  commits: 18

tech-stack:
  added: []
  patterns:
    - One private configured writer and one separately configured WAL reader
    - FIFO write queue with explicit transaction statements and commit latch
    - Prepared statements finalized in finally on all operation paths
    - Shared integrity contract executed against Node node:sqlite and installed Expo SQLite

key-files:
  created:
    - src/platform/sqlite/connection.ts
    - src/platform/sqlite/serializedWriter.ts
    - src/platform/sqlite/sqliteKernel.ts
    - src/platform/sqlite/index.ts
    - app/__native-contracts.tsx
    - scripts/run-native-sqlite-contracts.mjs
    - scripts/build-current-native-test-apk.sh
    - scripts/verify-native-evidence.mjs
  modified:
    - src/testing/contracts/sqliteKernel.contract.ts
    - tests/sqlite-host/sqliteKernel.host.test.ts
    - src/domains/shared/tooling.test.ts
    - package.json

key-decisions:
  - "Do not use Expo withExclusiveTransactionAsync; own one preconfigured writer, serialize mutations FIFO, and issue explicit BEGIN IMMEDIATE/COMMIT/ROLLBACK."
  - "Expose only bound execute/query methods to transaction callbacks; raw Expo connections and the serialized writer remain private."
  - "Use one ten-case contract for Node 24 host proof and the installed Expo SQLite adapter, with zero skipped cases."
  - "Collect native results through bounded logcat polling after a cold deep-link start; do not use Android UiAutomation polling."

patterns-established:
  - "Commit latch: authoritative command state resolves only after COMMIT resolves."
  - "Native evidence: build once from clean CNG, 16 KiB check, hash, install identical bytes, run contracts, then bind result to source digest and live package."
  - "Runner hygiene: Metro starts on an emulator-reachable bind, subprocesses are bounded, and Expo CLI source-file mutations are byte-restored."

requirements-completed: [FOUND-03]

coverage:
  - id: D1
    description: "The production kernel owns a private configured writer, separate WAL reader, FIFO mutations, explicit BEGIN IMMEDIATE/COMMIT/ROLLBACK, and no raw connection export."
    requirement: FOUND-03
    verification:
      - kind: unit
        ref: "npm run test:sqlite:host -- --runInBand"
        status: pass
      - kind: unit
        ref: "npm run test:coverage -- --runInBand (100% platform/sqlite statements, branches, functions, lines)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The same ten integrity contracts pass against Node 24 node:sqlite and installed Expo SQLite with no failed or skipped case."
    requirement: FOUND-03
    verification:
      - kind: integration
        ref: "npm run test:sqlite:host -- --runInBand (10/10 shared contract)"
        status: pass
      - kind: e2e
        ref: "npm run test:sqlite:device -- --manifest artifacts/native/sqlite-kernel/build.json --assert-all=10"
        status: pass
    human_judgment: false
  - id: D3
    description: "The final development-test APK is source-bound, 16 KiB aligned, installed byte-for-byte, and verified live on Android 16/API 36."
    requirement: FOUND-03
    verification:
      - kind: e2e
        ref: "npm run android:devtest:fresh -- --suite sqlite-kernel"
        status: pass
      - kind: integration
        ref: "npm run verify:native:evidence -- artifacts/native/sqlite-kernel/result.json"
        status: pass
    human_judgment: false

duration: 1h 12m
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 4: Private SQLite Integrity Kernel Summary

**Private preconfigured Expo SQLite writer with FIFO explicit transactions, separate WAL reads, and ten shared integrity contracts proven on host and installed Android**

## Performance

- **Duration:** 1h 12m
- **Started:** 2026-08-16T00:56:23Z
- **Completed:** 2026-08-16T02:08:17Z
- **Tasks:** 2
- **Files changed:** 12
- **Host/unit tests:** 69 passed
- **Installed-device contracts:** 10/10 passed, 0 failed, 0 skipped

## Accomplishments

- Implemented the repository-owned SQLite integrity kernel: private configured writer, separate configured reader, FIFO mutation queue, explicit `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`, bound parameters, and typed storage failures.
- Proved foreign keys, WAL, busy timeout, serialization, bounded contention, committed-read isolation, rollback matrix, commit-before-observation, idempotency, prepared cleanup, and private boundaries through the same ten-case contract on Node 24 and actual Expo SQLite.
- Retained a 16 KiB-aligned 247,968,377-byte development-test APK with SHA-256 `fead5271e16eb6a6f4b34c6ad4d9bcf444702a21ac669b0c75e69f2fa3e93d47`; installed bytes match exactly.
- Bound final evidence to commit `869de00e51a40cb2dd14fe880c72990d4b79b2f7`, source digest `901ed8c8afa5a443ab2efbda8fdef0ad4ab71118854723b4bf27d1207376ffa2`, package `com.fchoo.gymtracker.devtest`, and Android 16/API 36 ARM64 emulator.

## Task Commits

1. **Task 1 RED: Specify private SQLite kernel behavior** - `bb3ad78`
2. **Task 1 test correction: Repair failure fixtures** - `8553b4e`
3. **Task 1 GREEN: Implement private writer kernel** - `7eef723`
4. **Task 2 RED: Require all ten native contracts** - `1c6cb5f`
5. **Task 2 GREEN: Build and prove ten integrity contracts** - `9733f2f`
6. **Native runner fixes and regressions** - `fcc8976`, `a55e10e`, `19ab861`, `b978566`, `808e910`, `17b1f34`, `4954818`, `279854b`, `869de00`

## Files Created/Modified

- `src/platform/sqlite/connection.ts` - Expo adapter, per-connection PRAGMAs, bound prepared execution, and finalization.
- `src/platform/sqlite/serializedWriter.ts` - FIFO explicit transaction owner and failure-stage mapping.
- `src/platform/sqlite/sqliteKernel.ts` - Public narrow kernel, separate reads, test runtime, and safe storage errors.
- `src/platform/sqlite/index.ts` - Public surface without raw connection/writer exports.
- `src/testing/contracts/sqliteKernel.contract.ts` - Ten shared integrity contracts and host/device runner.
- `tests/sqlite-host/sqliteKernel.host.test.ts` - Host adapter, failure-path, coverage, and harness regressions.
- `app/__native-contracts.tsx` - Development-test-only route executing the shared contract.
- `scripts/build-current-native-test-apk.sh` - Reusable clean native build, alignment, install, launch, and manifest protocol.
- `scripts/run-native-sqlite-contracts.mjs` - Fresh Metro, cold route launch, bounded result collection, and all-pass gate.
- `scripts/verify-native-evidence.mjs` - Source, APK, live package/device, and exact ten-case verifier.
- `package.json` - Real native SQLite/device/build/evidence commands.

## Decisions Made

- `withExclusiveTransactionAsync()` is prohibited because it creates/configures its own connection too late for the required per-connection guarantees.
- Writer commands receive an immutable narrow executor, not a raw Expo database or writer object.
- Commit failures attempt rollback and never return command state; operation and finalization failures retain deterministic typed failure stages.
- Native contract output uses the route’s existing log marker. Repeated `uiautomator` polling was removed because Android 16 permits only one UiAutomation registration and the helper can hang.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected rollback/finalization test fixtures**
- **Found during:** Task 1 RED/GREEN loop.
- **Issue:** Initial mocks could not represent independent operation, finalize, commit, and rollback failures accurately.
- **Fix:** Added explicit staged fixtures and verified every failure branch.
- **Verification:** 23 host tests pass; platform/sqlite coverage is 100% on every dimension.
- **Committed in:** `8553b4e`

**2. [Rule 3 - Blocking] Replaced unbounded Android UiAutomation polling**
- **Found during:** Installed-device contract run.
- **Issue:** Repeated `uiautomator dump` calls crashed on API 36 with `UiAutomationService ... already registered` and one child could hang past the advertised 90-second bound.
- **Fix:** Added per-child deadlines and bounded logcat polling for the existing React Native result marker.
- **Verification:** Regression rejects `uiautomator`; the final 10/10 device run completes through logcat.
- **Committed in:** `a55e10e`, `19ab861`

**3. [Rule 3 - Blocking] Made the contract launch deterministic**
- **Found during:** Installed-device contract retry.
- **Issue:** Deep-link delivery as early `onNewIntent` was dropped before React context became ready.
- **Fix:** Force-stop the installed package before sending the contract URI so it becomes the initial intent.
- **Verification:** Cold-start regression passes; contract route executes.
- **Committed in:** `b978566`, `808e910`

**4. [Rule 3 - Blocking] Exposed Metro to the Android emulator**
- **Found during:** Cold-start contract run.
- **Issue:** `--localhost` bound Metro only to IPv6 `::1`, while React Native requested `10.0.2.2:8081`.
- **Fix:** Start Metro with `--host lan` while retaining `adb reverse`.
- **Verification:** Final device run loads the JS bundle and passes all ten cases.
- **Committed in:** `17b1f34`, `4954818`

**5. [Rule 1 - Bug] Restored source files Expo CLI rewrites**
- **Found during:** Native evidence verification.
- **Issue:** Expo start appended generated hints to tracked `.gitignore` and `expo-env.d.ts`, invalidating the source digest after the run.
- **Fix:** Snapshot and byte-restore those two known files in the runner’s `finally` path.
- **Verification:** Final runner leaves the worktree clean except the intentional untracked worktree `node_modules` symlink; evidence verifier passes.
- **Committed in:** `279854b`, `869de00`

---

**Total deviations:** 5 auto-fixed (2 bugs, 3 blocking native-runner issues).
**Impact on plan:** All changes strengthen determinism and evidence integrity without changing the kernel architecture or product scope.

## Issues Encountered

- An interrupted build exited after verified install/launch but before metadata write during diagnosis. No evidence from that run was used for closure; the final chain rebuilt cleanly at final HEAD and wrote its manifest atomically.
- Expo/React Native emits upstream deprecation and SDK XML warnings during native compilation. They are nonfatal; all pinned generated-native assertions and integrity contracts pass.

## User Setup Required

None - no external service configuration or package installation required.

## Next Phase Readiness

- The source-mutation hard gate is open: Plan 01-06 can build migrations, recovery, effects, and launch on the proven writer.
- Plan 01-05 can consume the reusable final-HEAD native build/evidence workflow for its Argon2 feasibility module.
- Future native runners must cold-start their route, bind Metro for emulator reachability, bound every subprocess, and restore known Expo CLI source mutations.

## Self-Check: PASSED

- `npm run typecheck`, `npm run lint`, and `npm run check:boundaries` pass.
- 46 shared unit tests and 23 SQLite host tests pass.
- `npm run test:coverage -- --runInBand` reports 100% statements, branches, functions, and lines for `src/platform/sqlite`.
- Final installed-device contract result is 10 passed, 0 failed, 0 skipped.
- `npm run verify:native:evidence -- artifacts/native/sqlite-kernel/result.json` passes against live installed bytes/device state.
- `git ls-files android ios` is empty.

---
*Phase: 01-trustworthy-workout-loop*
*Completed: 2026-08-16*
