---
phase: 01-trustworthy-workout-loop
plan: 01
subsystem: infra
tags: [expo-sdk-57, react-native, android, cng, gradle, apk-evidence]

requires: []
provides:
  - Reproducible Expo SDK 57 Android development-test scaffold owned by committed CNG configuration
  - Generated-native assertions for the reviewed Android toolchain, backup exclusions, permissions, Hermes, and New Architecture
  - Digest-bound APK build, 16 KiB alignment, install, byte verification, launch, and evidence workflow
affects: [phase-01-native-tests, phase-01-sqlite, phase-01-notifications, ci, release]

actuals:
  tokens: 421299
  tasks: 3
  commits: 3

tech-stack:
  added:
    - Expo SDK 57
    - React Native 0.86.2
    - React 19.2.3
    - TypeScript 6.0.3
    - Expo Router
    - Expo SQLite
    - Maestro 2.8.0
  patterns:
    - Expo CNG owns disposable Android native output
    - Native operations are serialized by an ignored workspace lock
    - Installed APK identity is bound to base HEAD, source-tree digest, and SHA-256

key-files:
  created:
    - package.json
    - package-lock.json
    - app.config.ts
    - plugins/withAndroidBackupRules.ts
    - scripts/assert-generated-android.mjs
    - scripts/build-bootstrap-native-test-apk.sh
    - scripts/verify-bootstrap-native-evidence.mjs
    - .github/workflows/pr.yml
  modified:
    - .gitignore
    - scripts/check-cng-reproducible.sh

key-decisions:
  - "Use Expo CNG from committed TypeScript config and plugins; keep generated android/ and ios/ untracked and disposable."
  - "Serialize every generated-native operation with an ignored atomic directory lock so concurrent executors cannot race over Android output or dependency caches."
  - "Identify development-test APK evidence by base HEAD plus deterministic source-tree SHA-256, then verify retained and installed APK bytes are identical."

patterns-established:
  - "Native generation lock: acquire .native-build.lock before touching generated native trees and only the owner may clean or release it."
  - "Artifact identity: retain build.json, result.json, zipalign evidence, and the exact APK under ignored artifacts/native/<suite>/."
  - "CNG verification: generate Android twice from clean state, normalize only reviewed nondeterminism, and compare the resulting source contract."

requirements-completed: [REL-01]

coverage:
  - id: D1
    description: "A clean checkout has a pinned Expo SDK 57 development-test scaffold whose Android native project is generated from committed CNG configuration and remains untracked."
    requirement: REL-01
    verification:
      - kind: integration
        ref: "npm run verify:cng"
        status: pass
      - kind: integration
        ref: "node scripts/assert-generated-android.mjs android"
        status: pass
    human_judgment: false
  - id: D2
    description: "Generated Android backup rules exclude authoritative databases and sensitive staging paths from both Android backup rule families."
    requirement: REL-01
    verification:
      - kind: integration
        ref: "npm run verify:cng"
        status: pass
    human_judgment: false
  - id: D3
    description: "The exact development-test APK is 16 KiB aligned, SHA-256 bound to its source identity, installed byte-for-byte, and launched on the API 36 Android emulator."
    requirement: REL-01
    verification:
      - kind: e2e
        ref: "npm run android:bootstrap:fresh -- --suite bootstrap"
        status: pass
      - kind: integration
        ref: "npm run verify:bootstrap:evidence -- artifacts/native/bootstrap/result.json"
        status: pass
    human_judgment: false

duration: 1h 4m
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 1: Native Prerequisite Summary

**Pinned Expo SDK 57 CNG foundation with generated-native contracts and a source-bound Android APK proven through install and launch**

## Performance

- **Duration:** 1h 4m
- **Started:** 2026-08-15T23:19:59Z
- **Completed:** 2026-08-16T00:23:25Z
- **Tasks:** 3
- **Files modified:** 26

## Accomplishments

- Established the audited Expo SDK 57, React Native 0.86.2, Node 24.19.0, npm 11.17.0, Java 17, Android API 36, and Maestro 2.8.0 development foundation without committing native projects.
- Proved two clean CNG generations are identical and assert the reviewed Gradle, AGP, Kotlin, SDK, NDK, Hermes, New Architecture, permission, package, and backup contracts.
- Built a 16 KiB-aligned 247,968,377-byte APK, retained SHA-256 `8cb7a4c940df3fb6a1fce5f786f4efd243ae347ea337367d9a6d8892a440c37b`, installed identical bytes, and launched `com.fchoo.gymtracker.devtest/.MainActivity` on Android 16/API 36.

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm package legitimacy before the first install** - `7bd5b9f` (docs)
2. **Task 2: Pin the toolchain and merge the Expo CNG scaffold** - `1aba02c` (chore)
3. **Task 3 deviation: Serialize generated-native operations** - `2ec21af` (fix)

## Files Created/Modified

- `package.json` - Pinned Expo SDK 57 dependencies and native verification commands.
- `package-lock.json` - Reproducible npm 11 dependency graph.
- `app.config.ts` - CNG-owned development-test and production application identities.
- `plugins/withAndroidBackupRules.ts` - Android 11 and Android 12+ backup/device-transfer exclusions.
- `scripts/doctor-android.sh` - Exact local toolchain, emulator, device, and Maestro preflight.
- `scripts/assert-generated-android.mjs` - Generated Android contract verifier.
- `scripts/check-cng-reproducible.sh` - Two-clean-generation comparison with cross-process locking.
- `scripts/build-bootstrap-native-test-apk.sh` - Source identity, native build, alignment, retention, install, byte check, launch, and evidence workflow.
- `scripts/verify-bootstrap-native-evidence.mjs` - Evidence bundle and installed-artifact identity verifier.
- `.github/workflows/pr.yml` - Full-SHA-pinned ordered PR gate skeleton for Phase 1 closure.
- `.gitignore` - Excludes generated native projects, native evidence, and the native-operation lock.

## Decisions Made

- CNG is the only source of Android native configuration; generated `android/` and `ios/` trees remain ignored and disposable.
- Native generation/build scripts use `.native-build.lock` as an atomic cross-process mutex, and a contender that does not own the lock cannot clean the current owner’s generated tree.
- Bootstrap evidence records commit identity and a deterministic digest of all nonignored source files, so task-local source is represented without requiring a clean worktree.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Serialized concurrent generated-native workflows**
- **Found during:** Task 3 (Prove clean CNG generation and retain the development-test APK identity)
- **Issue:** A second executor ran clean prebuild and Gradle in the same workspace, racing over generated Android output and `node_modules` Kotlin caches; Gradle then failed while deleting a cache another process was writing.
- **Fix:** Added an ignored atomic workspace lock to both native-generation scripts. Cleanup is now owner-only, so a rejected contender cannot remove the active operation’s Android tree.
- **Files modified:** `.gitignore`, `scripts/check-cng-reproducible.sh`, `scripts/build-bootstrap-native-test-apk.sh`
- **Verification:** Shell syntax passed; contention tests proved both scripts fail closed and preserve an owner sentinel; the complete CNG/build/install/launch evidence chain then passed.
- **Committed in:** `2ec21af`

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** The fix preserves the planned CNG architecture while making local and agent-driven native verification deterministic. No product scope was added.

## Issues Encountered

- The first Task 3 build failed because a duplicate executor concurrently rewrote generated output and Kotlin caches. The executor was stopped, stale cache output was removed, native operations were serialized, and the exact full proof was rerun successfully.
- The Android toolchain emitted nonfatal upstream deprecation and SDK XML compatibility warnings. Generated versions remain exactly pinned and assertions passed; no warning indicated a failed contract.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for Plan 01-02 design-system shell and Plan 01-03 architecture/test foundations.
- Native plans must use the serialized scripts rather than invoking clean prebuild or Gradle concurrently in the shared workspace.
- The dependency audit still records official Expo/React Native transitive advisories for later security review; incompatible forced downgrades were intentionally not applied.

## Self-Check: PASSED

- `npm run verify:cng` passed with two identical clean Android generations.
- `npm run android:bootstrap:fresh -- --suite bootstrap` produced, aligned, installed, byte-verified, and launched the retained APK.
- `npm run verify:bootstrap:evidence -- artifacts/native/bootstrap/result.json` bound source and artifact identity successfully.
- `git ls-files android ios` is empty, and the working tree contains no generated-native changes.

---
*Phase: 01-trustworthy-workout-loop*
*Completed: 2026-08-16*
