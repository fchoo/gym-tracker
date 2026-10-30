---
phase: 20-native-acceptance
personal_release_required: false
personal_execution_status: removed_from_scope
current_scope_policy: ../../verification/TEST-NECESSITY-REASSESSMENT-20261030.md
plan: "08"
subsystem: native-acceptance
tags: [android, expo, development-test, immutable-manifest, integrity-coverage, v1.2]
requires:
  - phase: 20-07
    provides: committed native-acceptance contracts, readiness evidence, and build tooling
provides:
  - one frozen-source development-test release-variant APK with retained and installed byte identity
  - fresh same-SM-S916B run phase20-20261022T113830Z-898ae5f2cacc; prior 3550e7f3 and 335e0563 runs preserved invalidated
  - exact Phase 20 integrity coverage registration and native-safe contract repairs
affects: [20-09, native-evidence, acceptance-shards]
actuals:
  tokens: 19000
  tasks: 2
  commits: 10
tech-stack:
  added: []
  patterns:
    - source freeze precedes the single development-test build boundary
    - build-only manifest binds retained APK, installed APK, signature, certificate, and privacy-safe device identity
key-files:
  created:
    - .planning/phases/20-native-acceptance/20-08-SUMMARY.md
    - artifacts/native/v1.2/phase20-20261014T065837Z-335e0563d57f/build.json
  modified:
    - scripts/run-coverage-gate.mjs
    - scripts/build-current-native-test-apk.sh
    - scripts/create-v12-run-manifest.mjs
    - src/domains/running/commands.ts
key-decisions:
  - "The 3550e7f3 run and prior 335e0563 artifact are invalidated and preserved, never reused; current observations require a fresh build after corrective coverage/review gates close."
  - "The prior c530ca0f build/run remains preserved as invalidated pre-SQLite-producer-hardening evidence and is not reused."
  - "Phase 20 source freeze permits no subsequent implementation edits before shard evidence; Plan 20-09 is next."
requirements-completed: []
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
        ref: new final-source Samsung build/run pending;898 native failure retained and retry forbidden
        status: pending
    human_judgment: false
duration: 4h 19m
completed: 2026-10-22
status: corrective_native_gates_pending
host_gates_valid: false
current_implementation_sha: 6c6bc04d7cc7b40628a224a9b385b65363044367
invalidated_run_id: phase20-20261022T113830Z-898ae5f2cacc
native_build_valid: false
---

> Current personal scope (2026-10-30): this historical gate/build plan is removed from active acceptance under [the necessity reassessment](../../verification/TEST-NECESSITY-REASSESSMENT-20261030.md). The status, invalidated runs and results below retain their historical meanings; they do not authorize a new build or test.


# Phase 20 Plan 08: Frozen development-test APK and immutable V12 build-only identity Summary

## Current Corrective Status — 2026-10-22

**Plan20-08 is reopened for native-discovered corrective gates.** Build7899 passed at898ae5f2, but its first native SQLite stage failed and later source corrections invalidate that run. The898 and3550 APKs and immutable failure receipts remain preserved history, not valid current acceptance or retry inputs. Current progress/framing corrections are integrated through6c6bc04d; CNGdebug-access correction and final targeted source audits remain pending.

The pre-native verified source snapshot is `898ae5f2cacca08f3457af1d66d3c573c09cd68c`; current corrective HEAD is `6c6bc04d7cc7b40628a224a9b385b65363044367`. The following host/audit scores belong to the preserved898 snapshot, not an unexecuted current-source audit. The final application gate at `73e1e41a` passed 347 suites / 5,010 tests and all 166 integrity modules at exact 100% statements/branches/functions/lines; explicit unchanged-production-input proof permits inheritance without rerunning that aggregate. Runtime/executor/receipt corrections are complete. The final unchanged-source Linux task 68798 passed 649 Phase 20 tests, 172 Phase 18 tests and 10 pidfd tests with zero skips, and every one of the 17 critical Node modules plus pidfd reached exact 100% all four metrics. Independent exact-source review is clean 100/100, zero findings; source security is 49/49 closed, score 100, zero open threats/risks.

Current predecessor, typecheck, boundary and pinned Node 24.19.0 / npm 11.17.0 / Temurin 17.0.20+8 / API36 / Build Tools36 / NDK27.1.12297006 / Maestro2.8.0 preflight passes. Source tree is `d95c10ebb84195fefd7cad9d9aa9768cd94b927f09b5d30f3e87d92ab1545f65`; host receipt is `artifacts/native/host/phase20-final-898ae5f2cacc/host-receipt.json`, SHA-256 `cecf2e5caa3153b6352987014eb4847c3fc655824603190a141626a477757181`. Protected `.coverage` is unchanged; completed Linux evidence is retained and its VM stopped.

The owner connected/unlocked/authorized the SM-S916B. Existing builder task7899 passed physical preflight, completed the release-variant development-test build in 7m57s, replacement-installed it without touching production data, and verified retained/installed APK byte equality. Fresh run is `phase20-20261022T113830Z-898ae5f2cacc`; APK SHA-256 is `4d517126d2a76343e537ff97087e8c5fb07f9c687d23d6c4e7bd6e6132c66d40` (93,278,447 bytes). Package/profile is `com.fchoo.gymtracker.devtest` / development-test, signature SHA-256 `779b75b032a8f23d45d558b304ab6276bf5894001fa1fafb79c17eaf8f89a272`, certificate SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. Device identity is `84aabfed05f6f03b4fb2b3d9ef00ce26a0c18e6bcfcaa975b673c1c836815de0`; actual device OS is Android17/API37, while compile/target/build tools remain pinned API36. Settings/restoration hashes agree. Both device serial bindings remain ephemeral and are never logged. Native pipeline58825 failed its first SQLite producer with `v12_sqlite_marker_timeout`; `failures/sqlite.json` is immutable and `retry_allowed:false`. Real diagnostics confirmed rejected source progress prefixes, duplicate same-nonce registry execution, unsafe/unbound result framing, and missing devtest `run-as` access (`not debuggable`). Parent transport/single-flight repairs and canonical case/operation progress are integrated through6c6bc04d;245 agent tests,12 parser/registry tests,7 framing tests and36 launcher tests passed zero-skipped focused scopes with the affected helper/V12 metrics exactly100. No budgets or heartbeat are changed. CNGdebug-access implementation remains active; a fresh audited build/run is required after it closes. Plans20-09–20-12, seven same-Samsung attended observations, final seal/goal/Nyquist and signed production delivery remain incomplete; this acceptance APK is not presented as the finished product.

## Preserved Corrective Build — invalidated 3550e7f3

The following table is historical build identity only. The earlier `335e0563` APK/build record was preserved under `artifacts/native/v1.2-invalidated-builds/source-335e0563d57f/`; neither build is current acceptance evidence.

| Current fact | Verified value |
|---|---|
| Implementation SHA | `3550e7f3f76059d2b430ecb2e63f4093383f23ed` |
| Source-tree SHA-256 | `fbb462ba15ae1450cfe4edd73f8ffab8e52f8d022a634bf0dfcdc337dcb4b5f0` |
| Immutable run manifest | `artifacts/native/v1.2/phase20-20261021T150646Z-3550e7f3f760/build.json` |
| Manifest SHA-256 | `442aa2c991ba17d39398182c74a631121e187d4e4cba4f5dc03f819a87c816e8` |
| APK and installed-byte SHA-256 | `a394c2f2f01972351bdd93f37054513044ee3c75ce7d89e83ce0d23b58b5fd5a` (identical) |
| Signature-report SHA-256 | `779b75b032a8f23d45d558b304ab6276bf5894001fa1fafb79c17eaf8f89a272` |
| Certificate SHA-256 | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` |
| Package/profile | `com.fchoo.gymtracker.devtest`, development-test, release variant |
| Source gates | Clean exact-SHA review; security 49/49 closed, zero open/flags; typecheck and boundary lint passed |
| Build/install | Pinned Node/npm/Temurin/API36/Build Tools36/NDK toolchain; standalone ARM64 Chaquopy/Python lock validated; `adb install -r`, signature and alignment verified |

The first current-source prebuild attempt produced no APK/run because the shell lacked the already-approved public OAuth configuration. The existing registration was verified against the retained APK and supplied without printing its values. The exited failed claim and log were preserved under `artifacts/native/v1.2-invalidated-builds/pre-artifact-attempt-3550e7f3/` before the successful pre-artifact retry. No application source or dependency changed for that recovery.

The successful build is an acceptance-only artifact, not a production delivery or native PASS. Plans 20-09 through 20-12 still must complete their observations, attended gate and final seal. The final consolidated host-coverage pass is separately in progress; the historical host scores below are not relabeled as current-source proof.

## Historical Build Record — superseded and invalidated

**The remaining historical sections record the prior 335e0563 build and must not be used by current Plan 20-09 or final acceptance.**

## Performance

- **Duration:** 4h 19m
- **Started:** 2026-10-13T22:54:29Z
- **Completed:** 2026-10-14T03:12:49Z
- **Tasks:** 2
- **Files modified:** 21 tracked source/test files, one immutable ignored build manifest, and this summary/tracking record

## Accomplishments

- Registered all 164 integrity-critical modules, including the six Phase 20 decision-bearing modules, at exact 100% statements, branches, functions, and lines without collapsing default legacy coverage collection.
- Passed the pinned host gate: 318 suites / 4,647 tests; 164 integrity-critical files at exact 100%; `test:evidence:v12` 36/36.
- Re-froze `335e0563d57f872d69a3ef6377a70c80f0d2e011` after the SQLite-producer hardening host gate, with source-tree SHA-256 `7002d98d47e1c3976b7b7c6f9e68e836398dc28f9a93c1f1fda0a9aaefc24bd9`.
- Built exactly one replacement development-test release APK, installed it using `adb install -r`, and verified retained/installed byte identity: APK SHA-256 `131b1e405d633dddac0aa91a35c0164e2e1e2a03541027dad1802a30fcdf37bf`.
- Created and verified immutable build-only manifest [build.json](artifacts/native/v1.2/phase20-20261014T065837Z-335e0563d57f/build.json) for `phase20-20261014T065837Z-335e0563d57f`.

## Frozen Artifact Identity

| Fact | Value |
| --- | --- |
| V12 run ID | `phase20-20261014T065837Z-335e0563d57f` |
| Run manifest | `artifacts/native/v1.2/phase20-20261014T065837Z-335e0563d57f/build.json` |
| Active build record | `artifacts/native/v1.2-acceptance/build.json` |
| Source HEAD | `335e0563d57f872d69a3ef6377a70c80f0d2e011` |
| Source tree SHA-256 | `7002d98d47e1c3976b7b7c6f9e68e836398dc28f9a93c1f1fda0a9aaefc24bd9` |
| APK / installed APK SHA-256 | `131b1e405d633dddac0aa91a35c0164e2e1e2a03541027dad1802a30fcdf37bf` (identical) |
| Immutable manifest SHA-256 | `bab8d74fee1e87cdea271872d760ec7c634c078deca81f90760d4955336b029e` |
| Active build manifest SHA-256 | `b8e76ffeff7f8f84f7b1fd187239724ba43eedfcd8ee902bcbdcad8c3e9e8e46` |
| Package / version / variant | `com.fchoo.gymtracker.devtest` / `0.1.0 (1)` / release |
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
   - `147022cf` fix(20-08): exclude generated root coverage database
   - `d852e9ab` test(20-09): cover privacy-safe native device selection
   - `c6750a42` fix(20-09): bind SQLite device leases privately
   - `c530ca0f` fix(20-09): enforce selector coverage in host gates

## Files Created/Modified

- `scripts/run-coverage-gate.mjs` - preserves normal full-project collection while adding Phase 20 integrity files; focused mode remains exact.
- `scripts/build-current-native-test-apk.sh` - provides the versioned single-build development-test path.
- `scripts/create-v12-run-manifest.mjs` - creates/verifies the immutable build-only record and canonicalizes internally generated UTC timestamps.
- `src/domains/running/commands.ts` - uses native-safe asynchronous hashing instead of Metro-incompatible `node:crypto`.
- `scripts/source-tree-digest.mjs` - excludes only the protected generated root `.coverage` database from canonical source identity.
- `scripts/native-device-selection.mjs` - selects a live device only ephemerally and binds its canonical identity hash without serial persistence.
- `artifacts/native/v1.2/phase20-20261014T065837Z-335e0563d57f/build.json` - ignored immutable evidence artifact; no sensitive serial or OAuth value is stored.

## Decisions Made

- The original `5917481c` run was archived as invalidated pre-shard evidence because immutable shard producers were added afterward; it was never used for shard execution.
- The root generated `.coverage` database is excluded from canonical source identity, while similarly named source files remain included; the subsequent privacy-safe device-selector repair invalidated the prior 147022cf build before shard execution.
- `--single-build` was used exactly once after the green host gate for `335e0563`; it is a development-test release-variant APK, not a signed production APK/AAB or release action.
- The prior c530ca0f build/run was archived as invalidated pre-SQLite-producer-hardening evidence; it was not reused after the hardening repair.
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

Connect and unlock the SM-S916B and authorize USB debugging. Later Garmin foreground authentication/MFA and the seven same-artifact attended observations remain physical/account-owner actions; no credentials should be supplied in chat. Existing production data must be preserved.

## Next Phase Readiness

The historical `335e0563` and `3550e7f3` runs are invalidated, not next-plan inputs. Plan20-09 now consumes only `phase20-20261022T113830Z-898ae5f2cacc`; native pipeline task58825 serializes the remaining existing plans and checks encrypted-session existence before Garmin's immutable producer. Do not duplicate the active pipeline, edit source, replan, or rerun the passing host application aggregate without actual input invalidation.

## Self-Check: PASSED

- Required source commits `82cec8a7`, `0286093b`, `8c3bfb8f`, `d2e7010a`, `d401e3d4`, `5917481c`, `9791cb47`, `114f1c85`, `6b8f16ab`, `147022cf`, `d852e9ab`, `c6750a42`, `c530ca0f`, and `335e0563` exist.
- The immutable run manifest exists at `artifacts/native/v1.2/phase20-20261014T065837Z-335e0563d57f/build.json` and `--verify-build-only` passed.
