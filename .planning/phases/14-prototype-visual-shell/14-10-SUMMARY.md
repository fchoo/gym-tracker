---
phase: 14-prototype-visual-shell
plan: "10"
subsystem: native-evidence
tags: [android, maestro, native, evidence, recovery, privacy, tdd]
requires:
  - phase: 14-05
    provides: shared sheet and toast presentation contracts
  - phase: 14-07
    provides: settings and rest-alert native routes
  - phase: 14-08
    provides: encrypted backup, restore, and recovery routes
  - phase: 14-09
    provides: identity-bound 13-item native evidence harness
  - phase: 14-12
    provides: source-owned Phase 14 verification inputs
provides:
  - fresh, installed development-test APK evidence for all 13 Phase 14 shell obligations
  - a Phase 14-only cancelled-recovery fixture that reaches the real restore action without user data or write authority
  - verified identity, staleness, privacy, focus, route, and DEV-02 evidence closure
affects: [phase-14-verification, phase-15-workout-parity, native-verification, SHL-01, SHL-02, SHL-03, SHL-04, SHL-05, SHL-06, SHL-07, SHL-08, SHL-09, SHL-10, SHL-11, SHL-12, SHL-13]
actuals:
  tokens: 13664
  tasks: 3
  commits: 27
tech-stack:
  added: []
  patterns:
    - native-contract-gated deterministic cancellation fixture with read-only, no-data recovery port
    - real-control Maestro traversal for recovery and automatic-backup evidence
    - fresh APK evidence accepted only after current source, installed bytes, device, and privacy checks agree
key-files:
  created:
    - src/testing/phase14RecoveryFixture.ts
    - src/testing/phase14RecoveryFixture.test.ts
  modified:
    - src/bootstrap/workoutAppRuntime.tsx
    - maestro/phase14/settings-recovery.yaml
    - scripts/phase14-native-matrix.test.mjs
    - .planning/phases/14-prototype-visual-shell/evidence/shell.four-roots.json
    - .planning/phases/14-prototype-visual-shell/evidence/shell.manual-backup.json
key-decisions:
  - "Use a cancellation-only fixture gated by nativeContractsEnabled, development-test, and suite phase14 so the real recovery UI is exercised without supplying an archive or changing production behavior."
  - "Target the real restore-clean action after explicit IME dismissal and use the shipped Automatic backup settings route, preserving rather than weakening assertions."
  - "Accept evidence only from one freshly built and installed APK after the full 13-artifact verifier validates exact source/APK/device/report identity and privacy constraints."
patterns-established:
  - "Deterministic native fixtures are suite-scoped, immutable, privacy-safe, and cannot gain persistent user-data authority."
  - "Native evidence traverses the production route and action identifiers instead of treating static labels or hub pages as action proof."
requirements-completed: [SHL-01, SHL-02, SHL-03, SHL-04, SHL-05, SHL-06, SHL-07, SHL-08, SHL-09, SHL-10, SHL-11, SHL-12, SHL-13]
coverage:
  - id: D1
    description: "Four-root shell composition, labels, selection, and target geometry are proven from the fresh Android run."
    requirement: SHL-01
    verification:
      - kind: automated_ui
        ref: "npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --ids shell.four-roots"
        status: pass
    human_judgment: true
    rationale: "Revision 18 visual fidelity requires the retained contact-sheet review."
  - id: D2
    description: "Root retention, heading focus, and deep-route return context are captured natively."
    requirement: SHL-02
    verification:
      - kind: automated_ui
        ref: "npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --ids shell.root-state"
        status: pass
    human_judgment: false
  - id: D3
    description: "Light, Dark, and System appearance synchronization is captured from the installed APK."
    requirement: SHL-03
    verification:
      - kind: automated_ui
        ref: "npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --ids shell.appearance"
        status: pass
    human_judgment: true
    rationale: "Color and visual hierarchy remain a human fidelity judgment."
  - id: D4
    description: "Native token, typography, focus, and geometry evidence includes the approved DEV-02 color treatment."
    requirement: SHL-04
    verification:
      - kind: automated_ui
        ref: "npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --ids shell.tokens"
        status: pass
    human_judgment: true
    rationale: "Typography, wrapping, and spacing comparison needs human visual review."
  - id: D5
    description: "Sheets prove focus, dismissal, return context, and IME-safe presentation."
    requirement: SHL-05
    verification:
      - kind: automated_ui
        ref: "npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --ids shell.sheets"
        status: pass
    human_judgment: false
  - id: D6
    description: "Theme-aware toast location and accessibility semantics are captured natively."
    requirement: SHL-06
    verification:
      - kind: automated_ui
        ref: "npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --ids shell.toasts"
        status: pass
    human_judgment: false
  - id: D7
    description: "Startup loading, failure/retry, and notification-permission states remain truthful."
    requirement: SHL-07
    verification:
      - kind: automated_ui
        ref: "npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --ids shell.launch"
        status: pass
    human_judgment: false
  - id: D8
    description: "Rest alert controls and device settings navigation remain reachable."
    requirement: SHL-08
    verification:
      - kind: automated_ui
        ref: "npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --ids shell.rest-alerts"
        status: pass
    human_judgment: false
  - id: D9
    description: "Settings deep links retain access to removed sessions and data/recovery routes."
    requirement: SHL-09
    verification:
      - kind: automated_ui
        ref: "npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --ids shell.settings-deep-links"
        status: pass
    human_judgment: false
  - id: D10
    description: "Removed-session recovery states and confirmation routing are recorded with deterministic data."
    requirement: SHL-10
    verification:
      - kind: automated_ui
        ref: "npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --ids shell.removed-sessions"
        status: pass
    human_judgment: false
  - id: D11
    description: "CSV and automatic-backup recovery states traverse the shipped Automatic backup settings route."
    requirement: SHL-11
    verification:
      - kind: automated_ui
        ref: "npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --ids shell.data-recovery,shell.automatic-backup"
        status: pass
    human_judgment: false
  - id: D12
    description: "Cloud backup connection, cancellation, privacy, and recovery evidence remains identity-bound."
    requirement: SHL-12
    verification:
      - kind: automated_ui
        ref: "npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --ids shell.automatic-backup"
        status: pass
    human_judgment: false
  - id: D13
    description: "Encrypted restore/merge cancellation reaches the real Restore clean control through a phase-scoped no-data fixture."
    requirement: SHL-13
    verification:
      - kind: unit
        ref: "src/testing/phase14RecoveryFixture.test.ts"
        status: pass
      - kind: automated_ui
        ref: "npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --ids shell.manual-backup"
        status: pass
    human_judgment: true
    rationale: "Exact recovery copy and unclipped confirmation layout require human visual review."
duration: 3h 16m
completed: 2026-10-09
status: complete
---

# Phase 14 Plan 10: Fresh Native Shell Evidence Summary

**Fresh Android evidence for all 13 shell obligations, including a Phase 14-only cancelled recovery fixture that exercises the real Restore clean control without user data or production behavior changes.**

## Performance

- **Duration:** 3h 16m resumed execution
- **Started:** 2026-10-09T04:43:34+08:00
- **Completed:** 2026-10-09T07:59:10+08:00
- **Tasks:** 3/3
- **Files modified:** 24
- **Final APK SHA-256:** `f22edab31b37ab452625f2a5f03d6342a875ffc9c806f0cb9536766c2d1f91f7`
- **Final evidence SHA-256:** `e953341952ef4cac0ab1dab8587722401d66cb3e34921173ec5464e80aecc765`

## Accomplishments

- Built and installed one fresh Phase 14 development-test APK while preserving app data, regenerated all 13 canonical artifacts, and passed the complete identity/staleness/privacy verifier.
- Added TDD-backed, deterministic Phase 14 cancellation recovery: it is unavailable in production and other development-test suites, contains only fixed privacy-safe data, has no archive bytes or persistent user-data authority, and invokes the real `restore-clean-action`.
- Exercised all planned native matrix areas: four roots, retained state, appearance, tokens, focus-safe sheets, toasts, startup, settings, removed history, recovery, automatic backup, and manual encrypted backup.
- Preserved DEV-02 native proof, including approved Light Strength `#9B470B`, sport roles `#D97820`, and unchanged Dark treatment.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run test:all`, and `npm run verify:cng` passed before the final flow-only revisions.
- `node --test scripts/phase14-native-matrix.test.mjs` and `npm run lint` passed after each later native-flow correction.
- `EXPO_PUBLIC_NATIVE_CONTRACT_SUITE=phase14 node scripts/validate-development-test-app-config.mjs artifacts/native/phase14/gym-tracker-phase14-devtest.apk` passed for the final APK.
- `npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --all` passed after the evidence commit and again during closeout, reporting all 13 canonical IDs and the final evidence SHA above.

## Task Commits

Each task was committed atomically; the evidence-run recovery fixes are retained as part of their task history.

1. **Task 1: Prove four roots, retained state, appearance, and exact tokens on Android**
   - `fba1edb3`, `3b1b43ba`, `863ace40`, `5499f0d6`, `7a763a14`, `891c4ec7`, `29c50b4b`, `9103f893`, `1436b0b1`, `3389ab2a`, `bfd9a5bc`
2. **Task 2: Prove focus-safe sheets/toasts/startup and complete settings reachability**
   - `26ca6abf`, `c70c3e60`, `b61f5dc7`, `a0767eb5`, `c3a9cb07`, `1f7edb0c`
3. **Task 3: Prove removed history, CSV/cloud recovery, and encrypted restore/merge preservation**
   - `8a5bb7ce`, `54ddc377`, `6223338b`, `a47f6536`, `b015960c`, `5b2488c3`, `d7e23ec9`, `a5d68f1e`, `2ccbd9a8`, `18093dfc`

## Files Created/Modified

- `src/testing/phase14RecoveryFixture.ts` — immutable suite-gated cancellation fixture and read-only no-data restore port.
- `src/testing/phase14RecoveryFixture.test.ts` — isolation, privacy, immutability, and no-write-authority TDD coverage.
- `src/bootstrap/workoutAppRuntime.tsx` — selects the fixture only for the Phase 14 development-test native contract.
- `maestro/phase14/settings-recovery.yaml` — follows real manual and automatic backup routes, dismisses IME, and taps the real restore action.
- `scripts/phase14-native-matrix.test.mjs` — prevents regression to static-label recovery proof or hub-only backup checks.
- `scripts/run-phase14-maestro.mjs`, `scripts/verify-phase14-evidence.mjs`, and `scripts/build-current-native-test-apk.sh` — bind the run to exact source/APK/device state and retain the final evidence.
- `.planning/phases/14-prototype-visual-shell/evidence/shell.{four-roots,root-state,appearance,tokens,sheets,toasts,launch,rest-alerts,settings-deep-links,removed-sessions,data-recovery,automatic-backup,manual-backup}.json` — regenerated current identity-bound reports.

## Decisions Made

- Used the approved cancellation-only fixture rather than a synthetic archive: cancellation exposes and exercises the production recovery UI while avoiding archive bytes, selected paths, passwords, tokens, accounts, and user data.
- Retained the real production recovery control and assertions; the test fixture only controls the no-selection result for the narrowly gated native contract.
- Treated recovery route traversal, action targeting, keyboard clearance, and automatic-backup route entry as evidence correctness requirements, not scope expansion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Opened the manual encrypted backup route before recovery verification**
- **Found during:** Task 3
- **Issue:** The native journey looked for `Restore clean` on the Data and recovery hub rather than the shipped manual-backup route.
- **Fix:** Opened `Manual encrypted backup` before locating the restoration control.
- **Files modified:** `maestro/phase14/settings-recovery.yaml`, `scripts/phase14-native-matrix.test.mjs`
- **Verification:** Matrix test, lint, and final 13-artifact verifier passed.
- **Committed in:** `5b2488c3`

**2. [Rule 1 - Bug] Targeted the real restore action instead of its static heading**
- **Found during:** Task 3
- **Issue:** Maestro could tap the `Restore clean` heading, which did not prove the production action path.
- **Fix:** Targeted `restore-clean-action` explicitly.
- **Files modified:** `maestro/phase14/settings-recovery.yaml`, `scripts/phase14-native-matrix.test.mjs`
- **Verification:** Matrix test, lint, and final 13-artifact verifier passed.
- **Committed in:** `d7e23ec9`

**3. [Rule 1 - Bug] Cleared the software keyboard before the recovery action**
- **Found during:** Task 3
- **Issue:** Password entry left the IME over the real restore action.
- **Fix:** Dismissed the keyboard and scrolled to the action identifier before tapping it.
- **Files modified:** `maestro/phase14/settings-recovery.yaml`, `scripts/phase14-native-matrix.test.mjs`
- **Verification:** Matrix test, lint, and final 13-artifact verifier passed.
- **Committed in:** `a5d68f1e`

**4. [Rule 1 - Bug] Entered the shipped Automatic backup settings route**
- **Found during:** Task 3
- **Issue:** The automatic-backup stage asserted a settings title while still on the hub page.
- **Fix:** Opened `Automatic backup settings` and asserted its route title.
- **Files modified:** `maestro/phase14/settings-recovery.yaml`, `scripts/phase14-native-matrix.test.mjs`
- **Verification:** Matrix test, lint, and final 13-artifact verifier passed.
- **Committed in:** `2ccbd9a8`

---

**Total deviations:** 4 auto-fixed (4 Rule 1 bugs)
**Impact on plan:** Each correction was required to produce truthful native evidence. Assertions stayed strict and production behavior was unchanged.

## Issues Encountered

- The initial Android build harness process stopped streaming output while idle. Its PID and cleanup behavior were inspected before it was safely terminated; a later log-redirected build completed normally and released the native-build lock.
- Node emitted an existing module-type performance warning while loading the TypeScript shell contract. The verifier still completed successfully; no configuration or dependency change was necessary for this evidence plan.

## Known Stubs

None. The modified source and evidence files have no unresolved UI placeholder, TODO, or fixture data stub. The Phase 14 fixture's null archive selection is intentional cancellation behavior and is isolated by its production/suite gating tests.

## Threat Flags

None. The new fixture is confined to the existing development-test native contract; it adds no production endpoint, authentication path, file-write capability, or trust-boundary schema change.

## User Setup Required

None. The final build used the existing development-test OAuth configuration without logging or persisting the public client ID.

## Next Phase Readiness

- All 13 Phase 14 evidence obligations are current, privacy-safe, and verified against the exact fresh APK and installed app identity.
- Phase 15 and later consumers can rely on the Phase 14 shell evidence contract; visual items marked for human judgment remain available for the retained contact-sheet review.

---
*Phase: 14-prototype-visual-shell*
*Completed: 2026-10-09*

## Self-Check: PASSED

- Confirmed the summary, deterministic fixture, fixture isolation test, runtime gate, native journey, matrix test, and representative first/last evidence reports exist on disk.
- Confirmed all retained Plan 14-10 commits from `fba1edb3` through `18093dfc` exist; the realized task range contains 27 commits.
