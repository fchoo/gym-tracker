---
phase: 01-trustworthy-workout-loop
plan: 05
subsystem: crypto
tags: [argon2id, bouncy-castle, expo-modules, android, cng, native-evidence, tdd]

requires:
  - phase: 01-04
    provides: Generic clean native build, installed-device contract runner, source/APK/device manifest, and independent evidence verifier
provides:
  - Bounded app-owned Argon2id 1.3 bridge using Bouncy Castle 1.85.2
  - Native and bridged OWASP-floor known-answer proof with background responsiveness
  - Versioned candidate KDF descriptor bound to HEAD, source digest, APK bytes, package, and API 36 emulator
  - CNG autolinking, packaged-provider inspection, 16 KiB alignment, and metadata-only diagnostics
  - Explicit deferred physical-device calibration contract for Plan 01-10
affects: [01-10-physical-checkpoint, phase-5-backup-security, native-ci, source-identity]

actuals:
  tokens: 21045
  tasks: 1
  commits: 7

tech-stack:
  added:
    - org.bouncycastle:bcprov-jdk18on:1.85.2
  patterns:
    - Direct Expo typed positional parameters for binary native calls
    - Native-owned ArrayBuffer results with caller-owned copies and bounded cleanup
    - Allowlisted product/native failure codes with no raw exception or byte logging
    - Passed-or-blocked feasibility descriptors bound to exact build identity

key-files:
  created:
    - modules/argon2-kdf/expo-module.config.json
    - modules/argon2-kdf/package.json
    - modules/argon2-kdf/src/index.ts
    - modules/argon2-kdf/android/build.gradle
    - modules/argon2-kdf/android/src/main/java/expo/modules/argon2kdf/Argon2KdfModule.kt
    - modules/argon2-kdf/android/src/test/java/expo/modules/argon2kdf/Argon2KdfModuleTest.kt
    - src/platform/crypto/passwordKdf.ts
    - src/platform/crypto/candidateKdfDescriptor.ts
    - src/testing/contracts/argon2Feasibility.contract.ts
    - app/__argon2-contracts.tsx
    - scripts/run-argon2-feasibility.mjs
  modified:
    - .gitignore
    - jest.config.js
    - scripts/build-bootstrap-native-test-apk.sh
    - scripts/build-current-native-test-apk.sh
    - scripts/verify-bootstrap-native-evidence.mjs
    - scripts/verify-native-evidence.mjs

key-decisions:
  - "The native bridge accepts direct typed positional parameters rather than an optimized Record because Expo 57 rejected the mixed binary record with ERR_UNEXPECTED before module execution."
  - "The public PasswordKdfPort remains a narrow versioned request object even though the internal native call is positional."
  - "Only the exact OWASP-floor production parameters are accepted through the app bridge; the RFC vector parameters remain confined to native tests."
  - "Blocked descriptors may contain zero or partial timing samples and one allowlisted failure code; passed descriptors require a successful KAT, responsiveness, CNG/package proof, and at least three samples."
  - "Physical-device calibration remains deferred to the single consolidated Plan 01-10 checkpoint and does not fabricate evidence from the emulator."

patterns-established:
  - "Binary boundary: Uint8Array inputs are copied into owned native buffers and returned as a native-owned ArrayBuffer before both sides clear temporary views."
  - "Source identity: generated local Expo-module Android build output is ignored and excluded identically by both builders and both verifiers."
  - "Diagnostic boundary: only bounded error identifiers and timing/provider metadata may leave the KDF path."

requirements-completed: []

coverage:
  - id: D1
    description: "RFC 9106 and OWASP-floor Argon2id vectors pass with the exact Bouncy Castle provider and bounded parameters."
    verification:
      - kind: unit
        ref: "./android/gradlew --project-dir android --no-daemon :argon2-kdf:testDebugUnitTest"
        status: pass
      - kind: e2e
        ref: "installed bridge KAT in artifacts/native/argon2/result.json"
        status: pass
    human_judgment: false
  - id: D2
    description: "The installed JS-to-native bridge derives off the interaction thread, returns typed binary output, and logs metadata only."
    verification:
      - kind: e2e
        ref: "node scripts/run-argon2-feasibility.mjs --device=emulator --manifest artifacts/native/argon2/build.json --assert-kat --assert-responsive --assert-cng --assert-page-size"
        status: pass
      - kind: other
        ref: "logcat redaction scan for KAT/password/salt/output patterns"
        status: pass
    human_judgment: false
  - id: D3
    description: "The candidate descriptor proves CNG autolinking, packaged provider presence, API 36 installation, 16 KiB alignment, and exact installed APK identity."
    verification:
      - kind: e2e
        ref: "node scripts/verify-native-evidence.mjs artifacts/native/argon2/result.json"
        status: pass
      - kind: integration
        ref: "parseCandidateKdfDescriptor plus assertCandidateKdfDescriptorMatchesBuild"
        status: pass
    human_judgment: false
  - id: D4
    description: "Minimum physical-device timing remains explicitly deferred to Plan 01-10 with ten required samples and a 250-750 ms target."
    verification: []
    human_judgment: true
    rationale: "A physical Android device is required; emulator timing cannot satisfy the approved calibration contract."

duration: 66 min
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 5: App-Owned Argon2id Feasibility Summary

**Bounded Bouncy Castle Argon2id bridge with native and installed KATs, source-bound API 36 evidence, CNG/page-size proof, and metadata-only diagnostics**

## Performance

- **Duration:** 66 min
- **Started:** 2026-08-16T03:34:54Z
- **Completed:** 2026-08-16T04:41:07Z
- **Tasks:** 1
- **Files changed:** 21
- **Plan commits:** 7
- **Final merged tests:** 345 passed

## Accomplishments

- Implemented a local Expo module pinned to `org.bouncycastle:bcprov-jdk18on:1.85.2` with Argon2id/version 19, exact OWASP-floor production parameters, native buffer cleanup, and background coroutine execution.
- Proved RFC 9106 and OWASP-floor vectors in Kotlin, then proved the OWASP-floor vector through the installed JS bridge while the interaction probe remained responsive.
- Produced a strict passed/blocked `CandidateKdfDescriptor` bound to implementation HEAD, source-tree SHA-256, retained and installed APK bytes, package, API 36 emulator, provider, parameter bounds, CNG registration, packaging, and page alignment.
- Preserved the existing ten-case native SQLite proof in the same installed APK and independently verified current source, retained APK, installed bytes, package, and live device identity.
- Kept the spike feasibility-only: no password UI, backup route, AES implementation, archive format, restore, export, or user-facing backup contract entered Phase 1.

## Task Commits

### Task 1: Implement and automate the bounded Argon2id feasibility contract

- **RED:** `d9bb3eb` — native vectors, parameter bounds, typed port, and candidate descriptor contracts.
- **GREEN:** `55d4932` — Bouncy Castle module, Kotlin KATs, background bridge, typed port, and descriptor parser.
- **RED:** `80d6240` — installed development-test route and source-bound evidence requirements.
- **GREEN:** `e163735` — installed feasibility runner, route, CNG/package inspection, and result artifacts.
- **HARDENING:** `b9b5eb0` — explicit Expo binary types, valid blocked evidence, safe failure metadata, and generated-module source exclusions.
- **DIAGNOSTIC:** `887c85b` — allowlisted native-stage failure codes used to localize the bridge rejection.
- **ROOT FIX:** `41bd895` — direct typed positional native parameters replaced the failing optimized record conversion.

## Files Created/Modified

- `modules/argon2-kdf/android/src/main/java/expo/modules/argon2kdf/Argon2KdfModule.kt` — bounded asynchronous Argon2id implementation and direct Expo binary boundary.
- `modules/argon2-kdf/android/src/test/java/expo/modules/argon2kdf/Argon2KdfModuleTest.kt` — RFC 9106, OWASP-floor, and invalid-request tests.
- `modules/argon2-kdf/src/index.ts` — narrow typed native wrapper.
- `src/platform/crypto/passwordKdf.ts` — validated, redacted application port with owned-buffer cleanup.
- `src/platform/crypto/candidateKdfDescriptor.ts` — strict passed/blocked evidence parser and build matcher.
- `src/testing/contracts/argon2Feasibility.contract.ts` — bridge KAT, three-sample timing, and responsiveness probe.
- `app/__argon2-contracts.tsx` — development-test-only route with metadata-only result marker.
- `scripts/run-argon2-feasibility.mjs` — SQLite preflight, CNG/package inspection, route launch, descriptor/result writer, and pass gate.
- `.gitignore` and native build/verifier scripts — consistent exclusion of generated local-module Android build output.

## Decisions Made

- Expo SDK 57's explicit `Uint8Array` converter and `NativeArrayBuffer` result are the supported binary boundary.
- Mixed binary values inside an optimized request record are not used because the installed runtime rejected that boundary with `ERR_UNEXPECTED` before native stage codes could execute.
- The application-facing request remains object-shaped and versioned; the wrapper alone expands it into positional native arguments.
- Physical timing is not inferred from emulator samples. The emulator evidence establishes feasibility and the physical ten-sample target remains owned by Plan 01-10.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced the failing optimized record bridge**
- **Found during:** Installed bridge KAT
- **Issue:** Kotlin KATs passed, but Expo rejected the mixed binary `Record` argument with `ERR_UNEXPECTED` before `deriveNative` executed.
- **Fix:** Kept the public request contract and changed only the internal Expo signature to direct typed positional parameters.
- **Files modified:** `Argon2KdfModule.kt`, `modules/argon2-kdf/src/index.ts`, bridge/source contract tests.
- **Verification:** Clean Kotlin compile/KAT, installed bridge KAT, three timing samples, responsiveness, and independent evidence verification.
- **Committed in:** `887c85b`, `41bd895`

**2. [Rule 1 - Bug] Excluded nested generated module output from source identity**
- **Found during:** First evidence verification
- **Issue:** `modules/argon2-kdf/android/build/` was untracked but included by the source digest, so generated Gradle output changed identity after build.
- **Fix:** Ignored the generated path and added the identical exclusion to both native builders and both evidence verifiers.
- **Files modified:** `.gitignore`, build scripts, verifier scripts, source-contract test.
- **Verification:** Final current source digest matches the build and result after all native work.
- **Committed in:** `b9b5eb0`

**3. [Rule 2 - Missing Critical] Made blocked evidence valid and privacy-safe**
- **Found during:** Failed installed bridge diagnostics
- **Issue:** A blocked descriptor with zero samples was malformed and the initial route discarded the only safe failure identifier.
- **Fix:** Added strict status invariants, nullable zero-sample statistics, allowlisted failure codes, and optional bounded Expo error identifiers without messages/stacks/data.
- **Files modified:** descriptor, KDF port, route contract, runner, and tests.
- **Verification:** Crypto modules retain 100% statement/branch/function/line coverage; blocked and passed mutation tables both pass.
- **Committed in:** `b9b5eb0`, `887c85b`, `41bd895`

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical evidence safeguard).
**Impact on plan:** All fixes were required for correct installed proof and stronger privacy/source identity. No backup product scope or new npm dependency was added.

## Issues Encountered

- The first installed route failed before samples with a generic code. Safe layered diagnostics localized it to Expo's optimized record conversion, not Bouncy Castle, threading, or nested `NativeArrayBuffer` output.
- Native builds emitted upstream Expo/React Native deprecation, manifest, SDK XML, `NODE_ENV`, and dev-client scheme warnings. Build, install, route launch, contracts, and verifier all passed; none required a project-source workaround.
- Emulator timing (`258`, `122`, `111` ms) is recorded as feasibility evidence only and is not treated as the approved physical-device calibration.

## Native Evidence

- **Implementation HEAD:** `41bd895f00059a80419427aed043e38e2109d4c3`
- **Source-tree SHA-256:** `5fb04cec4425bdc26fab782fe5656238fb58a14228dddbe77161804f14229193`
- **APK:** `artifacts/native/argon2/gym-tracker-argon2-devtest.apk`
- **APK size:** 251,738,259 bytes
- **APK SHA-256:** `b0696c8ff079d1c8c628d09f2edfaf3bcdf6277d3ac602ec87f20611953b433d`
- **Alignment:** 16 KiB verified
- **Installed bytes:** Exact SHA-256 match
- **Package:** `com.fchoo.gymtracker.devtest`
- **Device:** `emulator-5554`, Android 16/API 36, `arm64-v8a`, `sdk_gphone64_arm64`
- **Argon2 bridge:** KAT passed, responsive, samples `258/122/111 ms`
- **CNG/package:** Two clean prebuilds represented, autolinked, Bouncy Castle classes inspected
- **SQLite kernel:** 10 passed, 0 failed, 0 skipped
- **Evidence verifier:** PASS against current source, retained APK, installed package bytes, and live device

## Test Evidence

- `./android/gradlew --project-dir android --no-daemon :argon2-kdf:testDebugUnitTest` — PASS.
- `npm run typecheck` — PASS.
- `npm run lint` — PASS.
- `npm run test:unit -- --runInBand src/platform/crypto src/testing/contracts/argon2Feasibility.contract.test.ts` — PASS, 141/141.
- `npm run test:coverage -- --runInBand` — PASS, 345/345; 99.4% statements, 97.86% branches, 98.07% functions, 99.39% lines.
- `src/platform/crypto/` — 100% statements, branches, functions, and lines.
- `npm run android:devtest:fresh -- --suite argon2` — PASS.
- Installed `run-argon2-feasibility.mjs` gate — PASS.
- `node scripts/verify-native-evidence.mjs artifacts/native/argon2/result.json` — PASS.
- Candidate descriptor parse/build match — PASS.
- Logcat KAT/password/salt/output redaction scan — PASS.

## Authentication Gates

None.

## Known Stubs

None. Physical calibration is a declared Plan 01-10 checkpoint, not a stub. Backup UI, encryption envelope, archive, restore, and export remain intentionally absent.

## Threat Flags

None. Parameter DoS, binary disclosure, dependency identity, source/APK identity, and native threading threats from the plan register have automated mitigations and passing evidence.

## Next Phase Readiness

- Plan 01-07 can proceed against the proven schema, writer, launch boundary, and current Android build chain.
- Phase 5 backup-security planning may treat this provider as a provisional candidate, subject to the required Plan 01-10 physical-device calibration.
- No blocker remains for the next Phase 1 implementation slice.

## Self-Check: PASSED

- Every declared Plan 01-05 source and test artifact exists.
- All seven production/test commits exist and include the required TRAE CLI trailer exactly once.
- The final descriptor is `passed`, has a null error field, includes three real samples, and matches the build manifest.
- Current HEAD, current source digest, retained APK, installed bytes, package, API 36 device, ten SQLite cases, CNG registration, provider packaging, and 16 KiB alignment all verify.
- Generated `android/`, `ios/`, and local-module build output remain untracked/ignored.

---
*Phase: 01-trustworthy-workout-loop*
*Completed: 2026-08-16*
