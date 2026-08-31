---
phase: 06-material-3-ux-remediation
plan: 02
subsystem: testing
tags: [android, maestro, gesture-handler, reanimated, expo-router, native-evidence]
requires:
  - phase: 05-recovery-distribution-and-release
    provides: Candidate-manifest, installed-APK identity, and bounded native-evidence patterns
provides:
  - Exact Phase 6 Maestro command and fail-closed candidate/install/report validation
  - Generated development-test route exercising real horizontal pan and long-press displacement
  - Cold-start deep-link flow proven on generated Android without production runtime or SQLite startup
affects: [06-04-calendar, 06-05-reorder, 06-09-native-evidence]
actuals:
  tokens: 9049
  tasks: 2
  commits: 7
tech-stack:
  added: []
  patterns:
    - Standalone Maestro clearState immediately precedes a fixture deep link so the link is the cold-start intent
    - Native evidence binds manifest bytes, retained APK bytes, installed APK bytes, bounded reports, and restored device state
key-files:
  created:
    - scripts/run-phase6-maestro.mjs
    - scripts/phase6-evidence-scripts.test.mjs
    - maestro/phase6/gesture-smoke.yaml
    - app/__phase6-gesture-smoke.tsx
  modified:
    - package.json
    - scripts/build-current-native-test-apk.sh
    - scripts/doctor-android.sh
    - app/_layout.tsx
    - app/__tests__/root-layout.test.tsx
key-decisions:
  - "The Phase 6 smoke clears state without launchApp, then opens the fixture link so Expo Router receives it as the Android cold-start intent."
  - "The exact fixture route remains isolated from the production workout runtime, production appearance storage, and SQLite while ready and while fonts are pending."
  - "The retained development-test APK built at cd60cc8 is reusable because every later change before execution was artifact-neutral; the runner still recomputes and verifies manifest and APK identities."
  - "No approval, promotion, public tag, publication, or Terminal Seal state is produced by this automated-only gate."
patterns-established:
  - Native deep-link fixtures that must own initial routing clear app state before opening the link and never warm-launch production first.
  - Gesture acceptance requires real generated-Android interaction plus source-level isolation and evidence-contract tests.
requirements-completed: [UX-03, UX-04, UX-05, UX-09]
coverage:
  - id: D1
    description: Fail-closed Phase 6 native runner validates manifest, package, APK, installed bytes, report, and cleanup identity
    verification:
      - kind: integration
        ref: scripts/phase6-evidence-scripts.test.mjs
        status: pass
    human_judgment: false
  - id: D2
    description: Phase 6 gesture fixture stays outside production runtime and SQLite during ready and fonts-pending states
    requirement: UX-09
    verification:
      - kind: unit
        ref: app/__tests__/root-layout.test.tsx
        status: pass
    human_judgment: false
  - id: D3
    description: Generated Android performs the fixture horizontal swipe through the installed Gesture Handler and Reanimated stack
    requirement: UX-03
    verification:
      - kind: automated_ui
        ref: npm run test:maestro:phase6 -- --flow gesture-smoke
        status: pass
    human_judgment: false
  - id: D4
    description: Generated Android performs long-press held-row displacement through the installed Gesture Handler and Reanimated stack
    requirement: UX-04
    verification:
      - kind: automated_ui
        ref: npm run test:maestro:phase6 -- --flow gesture-smoke
        status: pass
    human_judgment: false
duration: 61 min
completed: 2026-08-31
status: complete
---

# Phase 06 Plan 02: Generated-Native Gesture Gate Summary

**Manifest-bound Android evidence proving real horizontal swipe and held-row displacement from a cold-start Expo Router fixture.**

## Performance

- **Duration:** 61 min
- **Started:** 2026-08-31T11:47:43Z
- **Completed:** 2026-08-31T12:48:19Z
- **Tasks:** 2/2
- **Files modified:** 10

## Accomplishments

- Added the exact `test:maestro:phase6` entry point and a fail-closed runner that validates manifest bytes, retained and installed APK identity, requested package, bounded JUnit report, and font-scale restoration.
- Added a generated-development-test route backed by the installed Gesture Handler and Reanimated stack while isolating both ready and fonts-pending fixture states from production runtime and SQLite initialization.
- Passed the real Android gesture smoke after replacing the racy warm production launch with standalone state clearing followed immediately by a cold-start deep link.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the exact Phase 6 native runner contract and npm command**
   - `956fa2b` (`feat`) — fail-closed runner, npm command, initial flow, and contract tests.
   - `c2d3e82` (`feat`) — generated development-test gesture fixture and isolated root route.
   - `cd60cc8` (`fix`) — suite-scoped npm 12.0.2 allowance while preserving npm 11.17.0 as the project default.
   - `a22b151` (`fix`) — published-manifest guard and SHA-256 derivation from actual `build.json` bytes.
2. **Task 2: Run the generated-native emulator gesture smoke and conditionally repair the existing root seam**
   - `3b15d70` (`test`) — failing cold-link ordering regression plus ready/fonts-pending root isolation coverage.
   - `8374938` (`fix`) — standalone state clear followed by the cold-start fixture link.

**Plan metadata:** committed separately after this summary.

## Files Created/Modified

- `package.json` — exact `test:maestro:phase6` command.
- `scripts/run-phase6-maestro.mjs` — manifest/install/report/cleanup identity runner with pinned ADB fallback.
- `scripts/phase6-evidence-scripts.test.mjs` — runner and flow contract tests, including rejection of a pre-link `launchApp`.
- `scripts/build-current-native-test-apk.sh` — Phase 6 development-test build and published-manifest handling.
- `scripts/doctor-android.sh` — narrowly scoped npm 12.0.2 allowance for this disposable suite only.
- `maestro/phase6/gesture-smoke.yaml` — cold-start horizontal-swipe and held-row-displacement flow.
- `app/__phase6-gesture-smoke.tsx` — generated-native fixture using real Gesture Handler and Reanimated primitives.
- `app/_layout.tsx` — exact native-contract fixture route isolated from production runtime.
- `app/__tests__/root-layout.test.tsx` — ready and fonts-pending isolation from production runtime and SQLite.
- `.planning/phases/06-material-3-ux-remediation/06-02-PLAN.md` — manifest digest verification corrected to hash the published bytes.

## Decisions Made

- Use `clearState` as a standalone Maestro command and immediately `openLink` the fixture. A warm `launchApp` allowed production Today to win before Expo Router subscribed to the deep link.
- Keep `app/_layout.tsx` unchanged during Task 2. New tests proved the existing exact-route branch already excludes the production runtime, production appearance store, and SQLite in both ready and font-loading states.
- Reuse the retained APK built at `cd60cc8`: later pre-run changes touched only the plan, build/evidence scripts, tests, and Maestro YAML, not app or bundle source. The runner independently revalidated manifest, retained APK, installed APK, package, report, and cleanup identities.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Scoped the locally available npm version to the disposable Phase 6 development-test build**

- **Found during:** Task 1
- **Issue:** Node 24.19.0 exposed npm 12.0.2 locally while the project default remains npm 11.17.0.
- **Fix:** Allowed exactly npm 12.0.2 only when building `phase6-gesture-smoke`; every other doctor invocation still requires npm 11.17.0, and the manifest records the actual npm version.
- **Files modified:** `scripts/doctor-android.sh`, `scripts/build-current-native-test-apk.sh`, `scripts/phase6-evidence-scripts.test.mjs`
- **Verification:** The focused evidence suite passed and the retained manifest records Node 24.19.0/npm 12.0.2.
- **Committed in:** `cd60cc8`

**2. [Rule 1 - Bug] Bound the runner to published manifest bytes**

- **Found during:** Task 1
- **Issue:** The planned invocation attempted to read an absent embedded manifest digest instead of hashing the retained `build.json`.
- **Fix:** Required successful manifest publication and derived the runner input from SHA-256 over the exact file bytes.
- **Files modified:** `scripts/build-current-native-test-apk.sh`, `scripts/phase6-evidence-scripts.test.mjs`, `.planning/phases/06-material-3-ux-remediation/06-02-PLAN.md`
- **Verification:** The contract test passed and the runtime digest exactly matched `f9e9df5bbb5ea236f6b7e26b9a4f9a204faa99986bad320db0c68b825b084ed2`.
- **Committed in:** `a22b151`

**3. [Rule 1 - Bug] Removed the warm production launch before the fixture link**

- **Found during:** Task 2
- **Issue:** `launchApp(clearState: true)` warmed production Today before Expo Router subscribed; the link arrived 25ms later and could land on Today or transiently crash.
- **Fix:** Made standalone `clearState` the first flow command and opened the fixture link immediately afterward as the cold-start Android intent.
- **Files modified:** `scripts/phase6-evidence-scripts.test.mjs`, `maestro/phase6/gesture-smoke.yaml`
- **Verification:** The regression test failed on the old ordering, then all five evidence tests passed; Maestro 2.8 accepted the standalone command and passed the native flow.
- **Committed in:** `3b15d70`, `8374938`

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking environment issue)
**Impact on plan:** All fixes were required to make the native acceptance gate deterministic and identity-bound; no product behavior or release state changed.

## Issues Encountered

- The original native flow launched production before delivering its deep link. Direct cold-start `VIEW` evidence localized the failure to flow ordering rather than root-layout integration.
- The retained development-test build used Node 24.19.0/npm 12.0.2 under the suite-only allowance. A fresh rebuild was intentionally skipped after confirming that all changes since artifact base `cd60cc8` were artifact-neutral; exact manifest/APK/install identities were still revalidated by the runner.

## Known Stubs

None. The fixture uses the installed native gesture stack and the runner writes bounded machine evidence rather than placeholder results.

## Threat Review

- No new endpoint, authentication path, schema, production file-access path, approval state, or publication surface was introduced.
- T-06-01 remained mitigated: manifest, retained APK, installed package/APK, report, and font-scale state all fail closed.
- T-06-02 remained mitigated: evidence contains bounded hashes and flow totals, not raw rows, local paths, or raw device serials.

## Native Evidence

- Manifest SHA-256: `f9e9df5bbb5ea236f6b7e26b9a4f9a204faa99986bad320db0c68b825b084ed2`
- Candidate and installed APK SHA-256: `3f2b4e06a66c42ea0653b8b73251d9ddbea359cfb253c90437ff43763d30d6fb`
- Package: `com.fchoo.gymtracker.devtest`
- Maestro 2.8 result: `1/1` flow passed in 9 seconds
- JUnit SHA-256: `aa0989a9be110fde0c776677bff71f14cc76cdc25593d87ba0e055bc3688d79e`
- Assertions: `tests=1`, `failures=0`, `errors=0`, `skipped=0`
- Cleanup: `font_scale_restored=true`; device font scale read back as `1.0`
- Evidence mode remains `automated-only`, `approval_status=evidence_pending`, and `attended_scope=excluded`.

## Verification

- `node --test scripts/phase6-evidence-scripts.test.mjs` — passed, 5/5.
- `jest --selectProjects components --runTestsByPath app/__tests__/root-layout.test.tsx --runInBand` — passed, 8/8.
- Exact `npm run test:maestro:phase6` invocation against the retained manifest and APK — passed, 1/1 native flow.
- `npm run typecheck` — passed.
- `npm run lint` — passed, boundary check covered 226 files.
- `npm run check:boundaries` — passed, 226 files.
- `git diff --check` — passed.
- All six task commits end with exactly one required TRAE CLI co-author trailer.

## User Setup Required

None.

## Next Phase Readiness

- Plan 06-04 may consume the proven horizontal gesture stack for Calendar month swipes.
- Plan 06-05 may consume the proven long-press displacement stack for continuous reorder.
- Plan 06-09 may extend the manifest-bound native evidence lane after the consumer plans integrate.
- No release approval, promotion, tag, publication, or Terminal Seal action was performed.

## Self-Check: PASSED

- Confirmed all ten Plan 06-02 source, test, flow, script, package, and plan files exist.
- Confirmed task commits `956fa2b`, `c2d3e82`, `cd60cc8`, `a22b151`, `3b15d70`, and `8374938` exist.
- Confirmed the manifest, retained APK, bounded evidence JSON, and JUnit report exist.
- Confirmed all six task commits end with exactly one required TRAE CLI co-author trailer.

---
*Phase: 06-material-3-ux-remediation*
*Plan: 02*
*Completed: 2026-08-31*
