---
phase: 15-workout-parity
plan: "11"
subsystem: testing
tags: [native-evidence, expo-sqlite, maestro, accessibility, visual-regression, sha256]
requires:
  - phase: 15-workout-parity
    provides: Workout implementation, TIM-01 retirement evidence, and approved UI specification
  - phase: 14-prototype-visual-shell
    provides: hardened source/APK/device evidence and visual-reference patterns
provides:
  - Canonical one-to-one Phase 15 Workout evidence ledger
  - Fail-closed native evidence verifier and pre-native runner contract
  - Mutation-tested identity, accessibility, privacy, TIM, and visual hash gates
affects: [15-12-native-matrix, 15-13-performance-final-gate, verify-work]
actuals:
  tokens: 7543
  tasks: 2
  commits: 4
tech-stack:
  added: []
  patterns: [source-owned evidence ledger, full SHA-256 artifact chains, fail-closed native evidence validation]
key-files:
  created:
    - src/testing/contracts/phase15Workout.contract.ts
    - scripts/run-phase15-maestro.mjs
    - scripts/verify-phase15-evidence.mjs
    - scripts/phase15-evidence-scripts.test.mjs
  modified:
    - package.json
key-decisions:
  - "Phase 15 evidence accepts only Expo SQLite-authoritative native cases; fixture-only evidence is rejected."
  - "All visual evidence derives from recomputed approved/source-manifest/reference hashes and binds native plus reference inputs."
  - "TIM-01 requires the approved retire-playback record and zero-cue lifecycle proof; no compatibility branch is accepted."
patterns-established:
  - "Evidence records use codes, bounded timings, hashes, and opaque scoped IDs only; recursive privacy scanning rejects raw workout data."
  - "Phase-native runners may validate their manifest contract but refuse to execute a matrix owned by a later plan."
requirements-completed: [WRK-01, WRK-02, WRK-03, WRK-04, WRK-05, WRK-06, WRK-07, WRK-08, WRK-09, WRK-10, WRK-11, WRK-12, WRK-13, WRK-14, WRK-15, WRK-16, WRK-17, WRK-18, WRK-19, WRK-20, WRK-21, WRK-22, WRK-23, WRK-24, WRK-25, WRK-26, WRK-27, WRK-28, WRK-29, WRK-30, WRK-31, WRK-32, WRK-33, WRK-34, WRK-35, WRK-36]
coverage:
  - id: D1
    description: Canonical Phase 15 Workout requirement and cross-cutting evidence ledger.
    requirement: WRK-01
    verification:
      - kind: unit
        ref: scripts/phase15-evidence-scripts.test.mjs#ledger
        status: pass
    human_judgment: false
  - id: D2
    description: Fail-closed identity, semantic, privacy, TIM, and visual-chain verifier.
    requirement: WRK-36
    verification:
      - kind: unit
        ref: scripts/phase15-evidence-scripts.test.mjs
        status: pass
      - kind: other
        ref: npm run typecheck && npm run lint && npm run check:boundaries
        status: pass
    human_judgment: false
duration: 13 min
completed: 2026-10-10
status: complete
---

# Phase 15 Plan 11: Workout Evidence Ledger and Verifier Summary

**Fail-closed Workout evidence contract that binds all 36 requirements to current Expo SQLite-native APK identity, accessibility/recovery/performance facts, TIM approval, and chained visual artifacts.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-10T14:11:00Z
- **Completed:** 2026-10-10T14:24:07Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments

- Created a source-owned, one-to-one ledger for WRK-01 through WRK-36 plus six cross-cutting acceptance cases.
- Added a pre-native runner contract that requires current source/APK/install/device/report identity and explicitly defers the native matrix to Plan 15-12.
- Added mutation-tested rejection of duplicate, skipped, failed, stale, forged, synthetic, unmapped, privacy-unsafe, and unapproved evidence.
- Recompute-verifies approved JSON/HTML, source manifest, and six Light/Dark Workout references; comparisons bind screenshot, overlay, and difference inputs and outputs.

## Task Commits

1. **Task 1: Bind one root-to-completion evidence case to exact source and APK identity**
   - `02f8e0f` — test RED
   - `f681fd2` — feature GREEN
2. **Task 2: Enforce complete coverage, semantic, privacy, TIM, and visual hash chains**
   - `07ab5fe` — test RED
   - `6f6ad71` — feature GREEN

## Files Created/Modified

- `src/testing/contracts/phase15Workout.contract.ts` — canonical requirements, paths, and visual pins.
- `scripts/run-phase15-maestro.mjs` — identity preflight and Plan 15-12 ownership guard.
- `scripts/verify-phase15-evidence.mjs` — fail-closed report, privacy, TIM, source, and visual-chain verifier.
- `scripts/phase15-evidence-scripts.test.mjs` — red/green mutation coverage for acceptance boundaries.
- `package.json` — Phase 15 evidence command bindings.

## Verification

- `node --test scripts/phase15-evidence-scripts.test.mjs` — 9 passing tests.
- `npm run test:evidence:phase15` — 9 passing tests.
- `npm run typecheck` — passed.
- `npm run lint` and `npm run check:boundaries` — passed (339 files).

Native matrix/global suite/build/device operations were intentionally not run; Plans 15-12 and 15-13 own them.

## Decisions Made

- Require an identity envelope so valid-looking individual manifest fields cannot disagree with evidence.
- Treat synthetic/fixture-only evidence as invalid even if it reports `passed`.
- Require semantic labels/roles/actions, focus restoration, 48dp geometry, 200% layout, keyboard/D-pad activation, recovery traces, and phase performance facts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cross-bind identity and case source hashes**
- **Found during:** Task 1 green verification
- **Issue:** Individually valid fields could disagree with the evidence or case source identity.
- **Fix:** Added exact manifest-to-evidence and manifest-to-case hash comparisons with mutation regressions.
- **Files modified:** `scripts/verify-phase15-evidence.mjs`
- **Verification:** evidence-script tests
- **Committed in:** `f681fd2`

**2. [Rule 1 - Bug] Recompute pinned source bytes instead of trusting manifest text**
- **Found during:** Task 2 green verification
- **Issue:** Manifest text alone could not detect changed approval or reference bytes.
- **Fix:** Recompute SHA-256 for both approved artifacts, the manifest, and all six reference images.
- **Files modified:** `scripts/verify-phase15-evidence.mjs`, `scripts/phase15-evidence-scripts.test.mjs`
- **Verification:** evidence-script tests
- **Committed in:** `6f6ad71`

**Total deviations:** 2 auto-fixed Rule 1 correctness fixes.

## TDD Gate Compliance

- RED commits: `02f8e0f`, `07ab5fe`; both failed for the intended missing contract/export.
- GREEN commits: `f681fd2`, `6f6ad71`; all scoped checks pass.

## Known Stubs

None. The runner refuses to execute the later native matrix rather than reporting a fixture-only pass.

## Issues Encountered

Node 24 emits a non-blocking `MODULE_TYPELESS_PACKAGE_JSON` warning while loading the TypeScript contract; the existing module configuration and all targeted checks remain passing.

## User Setup Required

None.

## Next Phase Readiness

Plan 15-12 can generate evidence only through the canonical ledger; Plan 15-13 can consume the same contract for performance and final closure.

## Self-Check: PASSED

All five scoped files and all four task commits exist on `fchoo/UX-revamp`.
