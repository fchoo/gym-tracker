---
phase: 18-garmin-import
plan: 01
subsystem: native-packaging
tags: [expo-module, kotlin, python-3.13, chaquopy-17, garmin, arm64, cng]
requires:
  - phase: 13-multi-plan-running-foundation
    provides: GarminActivitySourcePort, GarminConnectionState, and GarminSourceEnvelope contract
provides:
  - ARM64-only embedded Python runtime harness with a fixed runtimeInfo DTO
  - Provenance-checked Python dependency lock and third-party notices
  - Deterministic Expo CNG wiring for the single host Chaquopy configuration
affects: [18-02, 18-03, garmin-import, native-evidence]
actuals:
  tokens: 7154
  tasks: 3
  commits: 6
tech-stack:
  added: [Chaquopy 17.0, Python 3.13, python-garminconnect 0.3.17]
  patterns: [fixed Kotlin-to-Python DTO dispatcher, lock-before-package Gradle gate, host-only Chaquopy CNG configuration]
key-files:
  created: [modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminConnectModule.kt, modules/garmin-connect/android/src/main/python/garmin_bridge.py, modules/garmin-connect/python/garmin-python-lock.json, plugins/withGarminConnectModule.ts]
  modified: [app.config.ts, jest.config.js]
key-decisions:
  - "Chaquopy is applied exactly once to the generated Android application through CNG because its 17.0 Gradle plugin cannot be applied to an Expo library module."
  - "runtimeInfo is the sole current bridge operation; it validates a bounded Python DTO before TypeScript receives it."
  - "The build fails before preBuild when the reviewed lock, client commit, ARM64 wheel filename, ABI, or hash is changed."
requirements-completed: []
coverage:
  - id: D-18-01
    description: "Bounded ARM64 Kotlin-to-Python runtime identity tracer"
    requirement: "GAR-04"
    verification:
      - kind: unit
        ref: "scripts/verify-garmin-module-schema.test.mjs"
        status: pass
      - kind: other
        ref: "npm run typecheck && npm run check:boundaries"
        status: pass
    human_judgment: false
  - id: D-18-02
    description: "Pinned Garmin Python provenance lock and notices"
    requirement: "GAR-05"
    verification:
      - kind: unit
        ref: "scripts/verify-garmin-python-lock.test.mjs"
        status: pass
    human_judgment: false
  - id: D-18-03
    description: "Deterministic Expo CNG host configuration"
    requirement: "GAR-04"
    verification:
      - kind: unit
        ref: "plugins/withGarminConnectModule.test.ts"
        status: pass
    human_judgment: false
duration: 9m 25s
completed: 2026-10-11
status: complete
---

# Phase 18 Plan 01: Embedded Python Transport Harness Summary

**ARM64-only Python 3.13 and Chaquopy 17.0 packaging harness with a fixed `runtimeInfo` Kotlin/Python schema, pin-checked Garmin dependency graph, and deterministic Expo CNG host wiring.**

## Performance

- **Duration:** 9m 25s
- **Started:** 2026-10-11T04:46:26Z
- **Completed:** 2026-10-11T04:55:51Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- Added the local Expo module, ARM64-only Gradle declaration, and a serialized background `runtimeInfo` operation that accepts no generic Python arguments and returns only the reviewed identity DTO.
- Added a 14-package machine-readable lock that pins `python-garminconnect` 0.3.17 at commit `218e72ca5459e014435fc2d94fd18bd601fa0c14`, the exact curl_cffi Android wheel, every selected transitive artifact hash, and ordinary notices.
- Added an idempotent config plugin that applies Chaquopy once to the generated Android host, pins Python 3.13/arm64-v8a, registers the pre-build lock verifier, and preserves the existing JavaScript engine.

## Task Commits

1. **Task 1: Cross the installed module boundary into bundled Python once** — `ed6e354` (RED test), `0c932f8` (GREEN implementation)
2. **Task 2: Lock dependency provenance, wheel hash, ABI, and notices** — `fc2af93` (RED test), `4bc04c5` (GREEN implementation)
3. **Task 3: Lock deterministic Expo CNG module generation** — `8894d04` (RED test), `ed1688a` (GREEN implementation)

## Files Created/Modified

- `modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminConnectModule.kt` — fixed native runtime identity bridge on Expo's background coroutine queue.
- `modules/garmin-connect/android/src/main/python/garmin_bridge.py` — strict Python operation and empty-argument dispatcher.
- `modules/garmin-connect/python/garmin-python-lock.json` — exact runtime, source, artifact, hash, and licence record.
- `scripts/verify-garmin-python-lock.mjs` — fail-closed lock verifier used by the CNG-generated pre-build task.
- `plugins/withGarminConnectModule.ts` — idempotent Android host Gradle CNG wiring.
- `modules/garmin-connect/src/index.ts` — narrow TypeScript runtime identity reader.

## Decisions Made

- Chaquopy remains a single generated-app plugin; the Expo library declares the immutable packaging contract while CNG applies it to the only Gradle module Chaquopy supports.
- The live provider client is not reachable through this tracer: only the fixed `runtimeInfo` operation is present until Plan 18-02 implements the allowlisted typed calls.
- No fallback transport, FIT handling, runtime installer, local server, downloaded code, JavaScript-engine change, or agent was introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added host CNG registration and local module discovery metadata**
- **Found during:** Task 3
- **Issue:** A Chaquopy 17.0 plugin may only be applied once to the generated Android application; applying it in the Expo library would make packaging invalid. The local module also needs package metadata and application plugin registration for CNG/autolinking to discover it.
- **Fix:** Kept the module Gradle file declarative, added the local package/TypeScript entrypoint, registered the CNG plugin in `app.config.ts`, and made the plugin apply the reviewed host Gradle configuration exactly once.
- **Files modified:** `app.config.ts`, `modules/garmin-connect/package.json`, `modules/garmin-connect/src/index.ts`, `plugins/withGarminConnectModule.ts`
- **Verification:** `plugins/withGarminConnectModule.test.ts` passes idempotence, registration, ABI, engine-preservation, and missing-plugin checks.
- **Committed in:** `ed1688a`

**2. [Rule 2 - Missing Critical] Included plugin tests in the unit-test discovery scope**
- **Found during:** Task 3
- **Issue:** The plan's required targeted plugin-test command found no tests because the unit Jest project excluded `plugins/`.
- **Fix:** Added the plugin root and plugin test match to the existing unit project only.
- **Files modified:** `jest.config.js`
- **Verification:** `npm run test:unit -- --runInBand plugins/withGarminConnectModule.test.ts` passes.
- **Committed in:** `ed1688a`

**3. [Rule 1 - Test contract] Corrected the tracer assertion to permit the fixed Kotlin operation constant**
- **Found during:** Task 1
- **Issue:** The RED test required a string literal in `AsyncFunction`, even though the implementation uses a private fixed constant to prevent operation-name drift.
- **Fix:** Asserted both the immutable constant and its use in the native function registration.
- **Files modified:** `scripts/verify-garmin-module-schema.test.mjs`
- **Verification:** the targeted Node schema test passes.
- **Committed in:** `0c932f8`

**4. [Rule 1 - Tracking integrity] Kept GAR-04 and GAR-05 pending**
- **Found during:** Final tracking update
- **Issue:** The plan frontmatter associated this packaging harness with GAR-04/GAR-05, but their full requirements need the later authentication, encrypted token, verified read, connection UI, and sync work.
- **Fix:** Restored the requirement checklist and traceability rows to Pending while retaining the requirement references in coverage metadata.
- **Files modified:** `.planning/REQUIREMENTS.md`, `18-01-SUMMARY.md`
- **Verification:** Requirement text and traceability table both show Pending.

**Total deviations:** 4 auto-fixed (2 Rule 2, 2 Rule 1). All are necessary packaging, testability, or tracking-integrity corrections; no transport scope widened.

## Issues Encountered

- `ctx7` was unavailable in this environment, so the Chaquopy 17.0 Gradle documentation was read directly from the official documentation site. It confirmed the host-module plugin constraint.
- No generated-native CNG run, Gradle build, APK build/install, device action, live sign-in, or broad regression suite was run. Those proofs are intentionally outside this plan's targeted checkpoint.

## Known Stubs

None. The bridge deliberately exposes only `runtimeInfo`; later allowlisted provider operations are owned by Plan 18-02 and are not placeholders for completed Plan 18-01 behavior.

## Next Phase Readiness

- Plan 18-02 can add the typed login/MFA and fixed activity read operations to the established dispatcher without adding generic method, URL, eval, upload, delete, or token-export authority.
- The first installed ARM64 proof remains explicitly deferred to Plan 18-03.

## Self-Check: PASSED

Verified all declared Garmin module, lock, plugin, and verifier files exist and all six RED/GREEN commits are reachable in Git history.
