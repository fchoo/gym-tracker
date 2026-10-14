---
phase: 20-native-acceptance
plan: "08"
subsystem: native-acceptance
tags: [android, expo, development-test, immutable-manifest, integrity-coverage, v1.2]
requires:
  - phase: 20-07
    provides: committed native-acceptance contracts, readiness evidence, and build tooling
provides:
  - one frozen-source development-test release-variant APK with retained and installed byte identity
  - immutable V12 build-only run phase20-20261014T035323Z-114f1c857cb5
  - exact Phase 20 integrity coverage registration and native-safe contract repairs
affects: [20-09, native-evidence, acceptance-shards]
actuals:
  tokens: 19000
  tasks: 2
  commits: 7
tech-stack:
  added: []
  patterns:
    - source freeze precedes the single development-test build boundary
    - build-only manifest binds retained APK, installed APK, signature, certificate, and privacy-safe device identity
key-files:
  created:
    - .planning/phases/20-native-acceptance/20-08-SUMMARY.md
    - artifacts/native/v1.2/phase20-20261014T035323Z-114f1c857cb5/build.json
  modified:
    - scripts/run-coverage-gate.mjs
    - scripts/build-current-native-test-apk.sh
    - scripts/create-v12-run-manifest.mjs
    - src/domains/running/commands.ts
key-decisions:
  - "The only authoritative Phase 20 artifact is the frozen 114f1c85 development-test build bound to phase20-20261014T035323Z-114f1c857cb5."
  - "The prior d401 build remains preserved as invalidated manifest-timestamp evidence and is not reused."
  - "Phase 20 source freeze permits no subsequent implementation edits before shard evidence; Plan 20-09 is next."
requirements-completed: [VER-01, VER-07, VER-11, VER-13]
coverage:
  - id: D1
    description: Exact Phase 20 integrity registration and full pinned host verification.
    requirement: VER-01
    verification:
      - kind: unit
        ref: npm run test:coverage -- --runInBand
        status: pass
      - kind: integration
        ref: npm run test:evidence:v12
        status: pass
    human_judgment: false
  - id: D2
    description: Frozen development-test APK and immutable build-only identity manifest.
    requirement: VER-13
    verification:
      - kind: other
        ref: node scripts/create-v12-run-manifest.mjs --run phase20-20261014T035323Z-114f1c857cb5 --verify-build-only
        status: pass
    human_judgment: false
duration: 4h 19m
completed: 2026-10-14
status: complete
---

# Phase 20 Plan 08: Frozen development-test APK and immutable V12 build-only identity Summary

**A single Android development-test release-variant APK was rebuilt from frozen source 114f1c85, installed by data-preserving replacement, byte-verified on emulator-5554, and bound to immutable run `phase20-20261014T035323Z-114f1c857cb5`. This supersedes the pre-shard-producer run invalidated before any shard execution.**

## Performance

- **Duration:** 4h 19m
- **Started:** 2026-10-13T22:54:29Z
- **Completed:** 2026-10-14T03:12:49Z
- **Tasks:** 2
- **Files modified:** 21 tracked source/test files, one immutable ignored build manifest, and this summary/tracking record

## Accomplishments

- Registered all 164 integrity-critical modules, including the six Phase 20 decision-bearing modules, at exact 100% statements, branches, functions, and lines without collapsing default legacy coverage collection.
- Passed the pinned host gate: unit 156 suites / 2,545 tests; components 99 / 981; sqlite-host 29 / 607; integration 34 / 514; strict coverage twice at 318 suites / 4,647 tests with global 100%; `test:evidence:v12` 34/34.
- Re-froze `114f1c857cb52cad13197205f02b1ff6a8635683` after the producer repair host gate, with source-tree SHA-256 `54f791d46061fc046280b34cf78a8387cee5121ff6c2a44dcabd54543b515e42` and package-lock SHA-256 `216fd9d9f4388569e367f159030cddfdf24fe3b442b773764474f32f696b37ef`.
- Built exactly one replacement development-test release APK, installed it using `adb install -r`, and verified retained/installed byte identity: APK SHA-256 `d69b5a0552eee5e763d992170c626389269076b5c0f3f1d48e310c3306989ab8`.
- Created and verified immutable build-only manifest [build.json](artifacts/native/v1.2/phase20-20261014T035323Z-114f1c857cb5/build.json) for `phase20-20261014T035323Z-114f1c857cb5`.

## Frozen Artifact Identity

| Fact | Value |
| --- | --- |
| V12 run ID | `phase20-20261014T035323Z-114f1c857cb5` |
| Run manifest | `artifacts/native/v1.2/phase20-20261014T035323Z-114f1c857cb5/build.json` |
| Active build record | `artifacts/native/v1.2-acceptance/build.json` |
| Source HEAD | `114f1c857cb52cad13197205f02b1ff6a8635683` |
| Source tree SHA-256 | `54f791d46061fc046280b34cf78a8387cee5121ff6c2a44dcabd54543b515e42` |
| APK / installed APK SHA-256 | `d69b5a0552eee5e763d992170c626389269076b5c0f3f1d48e310c3306989ab8` (identical) |
| Package / profile / variant | `com.fchoo.gymtracker.devtest` / development-test / release |
| Signature SHA-256 | `779b75b032a8f23d45d558b304ab6276bf5894001fa1fafb79c17eaf8f89a272` |
| Certificate SHA-256 | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` |
| Device/config identity | API 36, arm64-v8a, hashed device `76e6e712…3208e7ac0`, configuration `AP-SL-C390-P-F100` |
| Toolchain | Node 24.19.0, npm 11.17.0, Temurin 17.0.20+8, Android API 36 / Build Tools 36.0.0 / NDK 27.1.12297006 |

## Task Commits

1. **Task 1: Gate terminal outputs, exact integrity coverage, and pinned host toolchain**
   - `82cec8a7` test(20-08): register Phase 20 integrity coverage
   - `0286093b` fix(20-08): enforce single build manifest boundary
   - `8c3bfb8f` test(20-08): complete Phase 20 integrity coverage
   - `d2e7010a` fix(20-08): preserve default integrity coverage collection
2. **Task 2: Freeze source, build exactly once, and create immutable run manifest**
   - `d401e3d4` fix(20-08): use native-safe running request hashes
   - `5917481c` fix(20-08): canonicalize v12 manifest timestamps
   - `9791cb47` test(20-09): define immutable native shard producer contracts
   - `114f1c85` feat(20-09): add immutable native shard producers

## Files Created/Modified

- `scripts/run-coverage-gate.mjs` - preserves normal full-project collection while adding Phase 20 integrity files; focused mode remains exact.
- `scripts/build-current-native-test-apk.sh` - provides the versioned single-build development-test path.
- `scripts/create-v12-run-manifest.mjs` - creates/verifies the immutable build-only record and canonicalizes internally generated UTC timestamps.
- `src/domains/running/commands.ts` - uses native-safe asynchronous hashing instead of Metro-incompatible `node:crypto`.
- `artifacts/native/v1.2/phase20-20261014T035323Z-114f1c857cb5/build.json` - ignored immutable evidence artifact; no sensitive serial or OAuth value is stored.

## Decisions Made

- The original `5917481c` run was archived as invalidated pre-shard evidence because immutable shard producers were added afterward; it was never used for shard execution.
- `--single-build` was used exactly once after the green host gate for `114f1c85`; it is a development-test release-variant APK, not a signed production APK/AAB or release action.
- The d401 build was kept only at `artifacts/native/v1.2-invalidated/phase20-d401e3d4-manifest-timestamp/` because the timestamp-authority repair changed source after that build; it is not bound to a V12 run.
- The new run is build-only. No evidence shard, Maestro flow, row verdict, final seal, production build, release, publish, deploy, uninstall, or data clear ran in this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Completed the approved v1.2 single-build and build-manifest CLI paths**
- **Found during:** Task 1
- **Issue:** The required `--single-build`, `--from-build --create`, and `--verify-build-only` paths were absent.
- **Fix:** Added backward-compatible single-build handling and fail-closed manifest CLI behavior with tests.
- **Files modified:** `scripts/build-current-native-test-apk.sh`, `scripts/create-v12-run-manifest.mjs`, and focused tests.
- **Verification:** Focused tests, typecheck, boundaries, and the final single build/run verification passed.
- **Committed in:** `0286093b`

**2. [Rule 1 - Bug] Restored full default integrity collection**
- **Found during:** Task 1
- **Issue:** The default strict gate replaced legacy coverage collection with six Phase 20 modules, leaving 158 legacy integrity files without coverage data.
- **Fix:** Extended default collection with Phase 20 files while retaining the focused six-file mode.
- **Files modified:** `scripts/run-coverage-gate.mjs`, `scripts/v12-evidence-scripts.test.mjs`.
- **Verification:** Full strict coverage passed twice with 164 integrity-critical files exact at 100%.
- **Committed in:** `d2e7010a`

**3. [Rule 1 - Bug] Removed Metro-incompatible Node crypto from running contracts**
- **Found during:** Task 2 prebuild proof
- **Issue:** Native contract reachability statically imported `node:crypto` through running commands.
- **Fix:** Changed canonical request hashing to asynchronous platform-safe `runtimeSha256` and awaited each contract/production caller.
- **Files modified:** `src/domains/running/commands.ts` and direct callers/tests.
- **Verification:** Focused tests, typecheck, boundaries, Metro release bundle proof, and final host gate passed.
- **Committed in:** `d401e3d4`

**4. [Rule 1 - Bug] Canonicalized internally generated V12 manifest timestamps**
- **Found during:** Task 2 manifest publication
- **Issue:** Non-zero milliseconds persisted in internally generated ISO timestamps and violated the strict whole-second UTC run-ID contract.
- **Fix:** Removed every three-digit millisecond segment before the terminal `Z` only for internally generated timestamps; externally supplied malformed timestamps remain rejected.
- **Files modified:** `scripts/create-v12-run-manifest.mjs`, `scripts/create-v12-run-manifest.test.mjs`.
- **Verification:** TDD regression test, focused manifest tests, typecheck, boundaries, full host gate, and this manifest creation/verification passed.
- **Committed in:** `5917481c`

**Total deviations:** 4 auto-fixed (3 Rule 1 bugs, 1 Rule 3 blocking issue).

## Issues Encountered

Prior build attempts ended before an artifact/run existed due to local ADB transport, toolchain discovery, OAuth configuration, CA-chain, Python discovery, Metro, and timestamp-contract faults. Each was diagnosed and repaired or provided as verified environment precondition before the final build. The current run is the sole post-freeze authoritative artifact.

## Known Stubs

None. The `--coverageThreshold={}` literal in `scripts/run-coverage-gate.mjs` is a Jest command argument, not a UI or data-flow stub.

## User Setup Required

None. The installed development-test app remains on emulator-5554 with existing data preserved; later attended evidence remains governed by its own plans.

## Next Phase Readiness

Plan 20-09 is next. It must consume only `phase20-20261014T035323Z-114f1c857cb5` and its immutable `build.json`; any later implementation-source change invalidates this run and requires a new source freeze/build/run under the plan authority.

## Self-Check: PASSED

- Required source commits `82cec8a7`, `0286093b`, `8c3bfb8f`, `d2e7010a`, `d401e3d4`, `5917481c`, `9791cb47`, and `114f1c85` exist.
- The immutable run manifest exists at `artifacts/native/v1.2/phase20-20261014T035323Z-114f1c857cb5/build.json` and `--verify-build-only` passed.
