---
phase: 18-garmin-import
plan: 02
subsystem: native-auth
tags: [garmin, kotlin, python, android-keystore, aes-gcm, expo-module]
requires:
  - phase: 18-01
    provides: ARM64 Python 3.13 and Chaquopy 17.0 packaging harness with pinned python-garminconnect provenance
  - phase: 13-multi-plan-running-foundation
    provides: GarminActivitySourcePort and GarminSourceEnvelope contracts
provides:
  - Fixed typed login, MFA, restore, logout, Running-page, activity, splits, and detail native operations
  - Android Keystore AES-GCM storage for dependency-injected DI session tokens with verified atomic rotation
  - Cross-language failure allowlist, retry clamping, stale-generation fencing, and response redaction
affects: [18-03, 18-04, 18-06, 18-10, 18-13, garmin-import, native-evidence]
actuals:
  tokens: 24163
  tasks: 3
  commits: 17
tech-stack:
  added: []
  patterns: [serialized native worker, encrypted no-backup token store, fixed Python dispatcher, injected envelope mapper, fail-closed boundary DTOs]
key-files:
  created:
    - modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminClientWorker.kt
    - modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminTokenStore.kt
    - modules/garmin-connect/android/src/test/java/expo/modules/garminconnect/GarminTokenStoreTest.kt
    - modules/garmin-connect/android/src/test/python/test_garmin_bridge.py
    - src/platform/garmin/garminActivityAdapter.ts
    - src/platform/garmin/garminActivityAdapter.test.ts
  modified:
    - .gitignore
    - modules/garmin-connect/android/build.gradle
    - modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminConnectModule.kt
    - modules/garmin-connect/android/src/main/python/garmin_bridge.py
    - modules/garmin-connect/src/index.ts
    - plugins/withGarminConnectModule.ts
    - plugins/withGarminConnectModule.test.ts
key-decisions:
  - "Persist only the pinned client's three DI token fields as authenticated ciphertext under Android noBackupFilesDir; password, MFA code, and JWT_WEB state never enter storage."
  - "Keep the domain adapter behind a typed native driver and injected envelope mapper so Plan 18-04 can own canonicalization without widening the native bridge."
  - "Treat every native/Python response as untrusted: accept only a fixed error allowlist and bounded plain JSON, and collapse all unknown details to safe codes."
patterns-established:
  - "Native session pattern: increment generation before auth/logout transitions, serialize all Python calls, persist rotations before returning success, and reject stale read results."
  - "Privacy boundary pattern: disable provider logging and never propagate native exception text, tracebacks, token material, response URLs, or unreviewed object types."
requirements-completed: []
coverage:
  - id: D-18-03
    description: Foreground login and MFA retain one generation while encrypted DI tokens rotate and restore without persisting credentials or codes.
    requirement: GAR-04
    verification:
      - kind: unit
        ref: modules/garmin-connect/android/src/test/python/test_garmin_bridge.py
        status: pass
      - kind: unit
        ref: modules/garmin-connect/android/src/test/java/expo/modules/garminconnect/GarminTokenStoreTest.kt
        status: pass
    human_judgment: false
  - id: D-18-04
    description: The TypeScript port uses a fixed native allowlist for bounded Running pages and activity, split, and detail reads.
    requirement: GAR-06
    verification:
      - kind: unit
        ref: src/platform/garmin/garminActivityAdapter.test.ts
        status: pass
      - kind: other
        ref: npm run check:boundaries
        status: pass
    human_judgment: false
  - id: D-18-08
    description: Auth and read failures remain distinct, retry metadata is clamped, and stale or unsafe results fail closed without sensitive details.
    requirement: GAR-07
    verification:
      - kind: unit
        ref: src/platform/garmin/garminActivityAdapter.test.ts
        status: pass
      - kind: unit
        ref: modules/garmin-connect/android/src/test/python/test_garmin_bridge.py
        status: pass
      - kind: unit
        ref: modules/garmin-connect/android/src/test/java/expo/modules/garminconnect/GarminTokenStoreTest.kt
        status: pass
    human_judgment: false
duration: 48m 5s
completed: 2026-10-11
status: complete
---

# Phase 18 Plan 02: Secure Garmin Account Bridge Summary

**Typed foreground Garmin login/MFA and bounded activity reads now run through a serialized native/Python bridge, with Android Keystore AES-GCM DI-token persistence, atomic rotation, generation fencing, and privacy-safe failure DTOs.**

## Performance

- **Duration:** 48m 5s
- **Started:** 2026-10-11T05:00:00Z
- **Completed:** 2026-10-11T05:48:05Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Implemented the exact Phase 13 `GarminActivitySourcePort` methods over an injected typed native driver, with strict cursor/activity-ID checks and fixed `maxchart=2000` / `maxpoly=4000` detail requests.
- Added a serialized Kotlin worker and Expo module methods for login, MFA continuation, restore, logout, Running summaries, activity, splits, and details; Python maps these to explicit pinned-client calls with retries disabled.
- Added versioned AES-GCM records backed by a non-exportable Android Keystore key in `noBackupFilesDir`, including fsync, verify-before-replace rotation, corrupt/unsupported fail-closed behavior, and local-only logout clearing.
- Added adversarial TypeScript, Python, and Kotlin tests for distinct auth/read failures, bounded retry metadata, malformed payloads, stale generations, and forbidden sensitive fields.

## Task Commits

1. **Task 18-02-01: Login through the typed port and read one activity with an injected client** — `7253ca2` (RED), `72a9320` (GREEN)
2. **Task 18-02-02: Encrypt, rotate, restore, and invalidate dependency-injected DI tokens** — `0794093` (RED), `b2674ac` (GREEN)
3. **Task 18-02-03: Classify auth/read failures and redact every boundary** — `b8e620f` (RED), `500838b` (GREEN), `4b7dd52` and `31bae74` (privacy hardening)

Supporting generated-module and hygiene commits: `530c17a`, `8ea48e0`, `a281d1e`, `1d5dbe1`, `b2427a7`, `595d1f9`, `9248e54`, `be72821`, `5419651`.

## Files Created/Modified

- `modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminClientWorker.kt` — serialized fixed-operation worker, token rotation handoff, generation fence, and Kotlin response sanitizer.
- `modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminTokenStore.kt` — versioned Android Keystore AES-GCM record and verified atomic replacement.
- `modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminConnectModule.kt` — typed background Expo functions backed by the worker and no-backup token store.
- `modules/garmin-connect/android/src/main/python/garmin_bridge.py` — pinned-client login/MFA/restore/logout/read lifecycle with a closed operation allowlist.
- `modules/garmin-connect/src/index.ts` — typed native module surface.
- `src/platform/garmin/garminActivityAdapter.ts` — Phase 13 port implementation with injected mapping and boundary validation.
- `plugins/withGarminConnectModule.ts` — Expo SDK 57 buildscript support, Chaquopy repository wiring, and generated ARM64-only configuration.
- Kotlin, Python, and TypeScript tests — deterministic encryption, lifecycle, allowlist, failure, and privacy contracts.
- `.gitignore` — excludes Python bytecode and cache directories generated by focused bridge tests.

## Decisions Made

- The Python client receives restored DI JSON inline and never receives a filesystem token-store path, so its upstream disk auto-save path remains disabled. Fresh `dumps()` output crosses only the private Python-to-Kotlin seam and is immediately encrypted before any success reaches JavaScript.
- The token record authenticates a fixed format/version as AES-GCM associated data and stores only the nonce plus authenticated ciphertext. Unsupported or corrupted records become `sign_in_required` without exposing bytes.
- The Phase 18 adapter accepts an injected envelope mapper. This keeps Plan 18-02 responsible for transport and boundary validation while Plan 18-04 remains the single owner of canonical Garmin normalization and hashing.
- GAR-04 through GAR-07 remain pending in `REQUIREMENTS.md` because later Phase 18 plans share and complete their live proof, UI, sync, and end-to-end obligations.

## Verification

- `npm run test:unit -- --runInBand src/platform/garmin/garminActivityAdapter.test.ts` — 25 passed.
- `python3 -m unittest modules/garmin-connect/android/src/test/python/test_garmin_bridge.py` — 6 passed; the host exposes `python3`, so it was used for the plan's `python -m unittest` target.
- `npm run prebuild:android` — passed with the repository-declared public development-test OAuth registration.
- `./android/gradlew --no-daemon -p android :garmin-connect:testDebugUnitTest --tests '*GarminTokenStoreTest*'` — 7 passed under the pinned Java 17 and Android SDK environment. `-p android` is required when invoking the generated wrapper from the repository root.
- `npm run typecheck` — passed.
- `npm run check:boundaries` — passed across 375 files.
- `node --test scripts/verify-garmin-module-schema.test.mjs` — 2 passed.
- `npm run test:unit -- --runInBand plugins/withGarminConnectModule.test.ts` — 5 passed.

No full repository checkpoint, native evidence matrix, APK/AAB build, install, device action, visual/accessibility/performance suite, live Garmin sign-in, publication, or release work was run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made Chaquopy CNG compatible with Expo SDK 57 output**
- **Found during:** Task 2 RED verification
- **Issue:** The generated root Gradle file uses `buildscript` dependencies rather than the plugin block assumed by Plan 18-01, so clean prebuild stopped before Kotlin compilation.
- **Fix:** Added tested buildscript classpath and repository wiring while retaining plugin-block compatibility and idempotence.
- **Files modified:** `plugins/withGarminConnectModule.ts`, `plugins/withGarminConnectModule.test.ts`
- **Verification:** focused plugin tests and clean `npm run prebuild:android` passed.
- **Commits:** `8ea48e0`, `a281d1e`, `595d1f9`, `9248e54`

**2. [Rule 2 - Missing Critical] Enforced the selected ARM64-only generated architecture**
- **Found during:** Task 2 RED verification
- **Issue:** Expo's generated `reactNativeArchitectures` still included unsupported ABIs despite the app Gradle block's filter, causing Chaquopy configuration to reject the variant.
- **Fix:** Added an idempotent CNG gradle-properties transform that sets the generated architecture list to `arm64-v8a`.
- **Files modified:** `plugins/withGarminConnectModule.ts`, `plugins/withGarminConnectModule.test.ts`
- **Verification:** focused plugin tests and clean generated-module configuration passed.
- **Commits:** `1d5dbe1`, `b2427a7`

**3. [Rule 3 - Blocking] Made the local Expo module compile against the host-owned Chaquopy runtime**
- **Found during:** Task 2 RED verification
- **Issue:** Host-only Chaquopy application did not place its Java API on the local library's compile classpath, and the zero-argument coroutine declaration used an ambiguous Expo API form.
- **Fix:** Added the exact compile-only Chaquopy Java artifact, retained host-only runtime packaging, and selected Expo's typed zero-argument suspend-body overload.
- **Files modified:** `modules/garmin-connect/android/build.gradle`, `modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminConnectModule.kt`
- **Verification:** `:garmin-connect:compileDebugKotlin` and the named module unit test passed.
- **Commits:** `be72821`, `5419651`

**4. [Rule 2 - Missing Critical] Suppressed upstream exception logging and dynamic method lookup**
- **Found during:** Task 3 boundary audit
- **Issue:** The pinned client can log request paths and exception text even with retries disabled, and an internal dynamic lookup made the read allowlist harder to audit.
- **Fix:** Disabled provider logging before client creation, classified nested exception metadata without message inspection, and replaced lookup with explicit activity/split calls.
- **Files modified:** `modules/garmin-connect/android/src/main/python/garmin_bridge.py`, `modules/garmin-connect/android/src/test/python/test_garmin_bridge.py`
- **Verification:** all 6 Python tests and the module schema test passed.
- **Commits:** `4b7dd52`, `31bae74`

**5. [Rule 3 - Verification Environment] Used the repository's pinned Android toolchain inputs**
- **Found during:** Task 2 verification
- **Issue:** The shell defaulted to Java 27, omitted the Android SDK path, and Gradle 9 did not infer `android/` as its project directory when its wrapper was invoked from the repository root.
- **Fix:** Ran the authorized target with the repository-documented Java 17 and Android SDK values and supplied `-p android`; the public development-test OAuth registration was read from the repository without printing it.
- **Files modified:** None.
- **Verification:** clean CNG generation and the named module unit test passed.

**Total deviations:** 5 auto-fixed (3 Rule 3, 2 Rule 2). All changes were necessary to compile, preserve the ARM64 contract, or close the plan's privacy boundary; no transport or verification scope was widened.

## Issues Encountered

- Context7 MCP was unavailable and the approved `ctx7` CLI fallback was not installed. The exact pinned python-garminconnect commit was inspected in a temporary directory instead; no package was installed and no source was copied into the repository.
- The generated wrapper requires an explicit Android project directory from the repository root. The named unit target was unchanged; only its invocation context was corrected.

## Known Stubs

None. Canonical Garmin normalization remains an intentional injected dependency owned by Plan 18-04, not a placeholder in this transport plan.

## Threat Flags

None. The new authentication, token-file, and native-call surfaces are the two trust boundaries already registered in Plan 18-02 and are covered by the listed mitigations and tests.

## Next Phase Readiness

- Plan 18-03 can use the typed native methods for its guarded installed ARM64 real-account proof.
- Live credentials, MFA, authenticated provider behavior, and restart proof remain deliberately unattempted until Plan 18-03.
- Phase 14 evidence changes and the untracked `14-VERIFICATION.md` remain untouched and unstaged.

## Self-Check: PASSED

Verified all declared created files exist, all 17 implementation/support commits are reachable, every commit contains the required TRAE CLI co-author trailer, and no Plan 18-02 generated cache remains untracked.

