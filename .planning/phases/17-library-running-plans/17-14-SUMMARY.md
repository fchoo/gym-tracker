---
phase: 17-library-running-plans
plan: "14"
subsystem: native verification tooling
tags: [maestro, android, native-runner, library, running, accessibility, privacy]
dependency_graph:
  requires:
    - phase: 17-13
      provides: canonical 39-case Library and Running ledger with fail-closed evidence verification
  provides:
    - bounded manifest-bound Phase 17 native runner
    - Library, Running, and accessibility Maestro flow sources
    - explicit Phase 20 native-validation handoff without fabricated evidence
  affects: [phase-20, native-verification, library-running-acceptance]
tech-stack:
  added: []
  patterns: [explicit-native-execution-opt-in, finally-device-state-restoration, risk-based-case-selection, static-flow-coverage]
key-files:
  created: [scripts/run-phase17-maestro.mjs, maestro/phase17/library.yaml, maestro/phase17/running-authoring.yaml, maestro/phase17/accessibility.yaml]
  modified: [scripts/phase17-evidence-scripts.test.mjs, package.json, .planning/phases/17-library-running-plans/17-VALIDATION.md]
decisions:
  - "The runner plans the canonical 39 cases but requires --execute before it can contact a device; no invocation writes the consolidated evidence file."
  - "Device presentation state is captured before execution and restored in finally, including display size/density, font scale, night mode, and all animation scales."
  - "Phase 20 owns the deferred global host suite, CNG/APK build, device mutation, all Maestro journeys, and final privacy-safe evidence generation."
patterns-established:
  - "Native flow sources declare canonical IDs and remain payload-free; evidence is produced only from retained real-run artifacts."
  - "Risk-based native coverage is one case per canonical ledger ID, not a Cartesian matrix."
requirements-completed: []
requirements-pending-native-evidence: [LIB-01, LIB-02, LIB-03, LIB-04, LIB-05, LIB-06, LIB-07, LIB-08, LIB-09, LIB-10, LIB-11, LIB-12, LIB-13, LIB-14, LIB-15, LIB-16, LIB-17, LIB-18, LIB-19, LIB-20, LIB-21, LIB-22, LIB-23, LIB-24, LIB-25, LIB-26, LIB-27, LIB-28, LIB-29, LIB-30, LIB-31, LIB-32, LIB-33, LIB-34, LIB-35, LIB-36]
coverage:
  - id: D1
    description: Bounded Phase 17 runner and all three payload-free Maestro source flows
    verification:
      - kind: unit
        ref: node --test scripts/phase17-evidence-scripts.test.mjs
        status: pass
      - kind: other
        ref: npm run typecheck && npm run lint && npm run check:boundaries
        status: pass
    human_judgment: false
  - id: D2
    description: Exact-source APK, device execution, evidence report, and all 39 native acceptance cases
    verification:
      - kind: automated_ui
        ref: npm run test:maestro:phase17 -- --manifest artifacts/native/phase17/build.json --all --execute
        status: unknown
      - kind: other
        ref: npm run verify:phase17:evidence -- --manifest artifacts/native/phase17/build.json --all
        status: unknown
    human_judgment: true
    rationale: Owner-directed deferral prohibits APK creation, device mutation, native execution, and evidence PASS in this plan.
metrics:
  duration: "5m"
  completed: "2026-10-11"
status: complete
actuals:
  tokens: 9949
  tasks: 2
  commits: 5
---

# Phase 17 Plan 14: Bounded Native Runner and Flow Sources Summary

Manifest-bound, risk-based Library/Running native runner with 39 canonical cases, three Maestro flows, explicit device-execution opt-in, and guaranteed presentation-state restoration.

## Completed Work

- Added a static-tested native runner that accepts only the retained Phase 17 manifest, validates the exact current source/APK identity, and plans the complete canonical ledger without expanding it into a Cartesian matrix. Its representative profiles apply 200% text, Light/Dark/System selection, reduced motion, and landscape before each relevant case.
- Added Library, Running authoring, and accessibility/recovery Maestro flows spanning chooser, preserved routes, Strength lifecycle, bundled/custom exercise paths, all seven Running variants, zero/nonempty/same-day ordering, lifecycle/collision, keyboard/D-pad/Back, IME-safe flow structure, 200% text, reduced motion, 48dp, focus, and process recovery cases.
- Added `test:maestro:phase17` package binding and focused static tests that reject missing flow coverage and payload-capturing Maestro sources.
- Recorded the owner-directed Phase 20 handoff: full global host gate, CNG, fresh development-test APK, device install/mutation, all 39 native cases, artifact/evidence binding, and all-ID verification remain intentionally unrun.

## Verification

- PASS: `node --test scripts/phase17-evidence-scripts.test.mjs` (6 tests).
- PASS: `node --check scripts/run-phase17-maestro.mjs`.
- PASS: `npm run typecheck`.
- PASS: `npm run lint` and `npm run check:boundaries`.
- NOT RUN by owner directive: global host suite, CNG, APK build/install, native device execution, all Maestro flows, and current-artifact evidence verification.
- NOT CREATED by owner directive: `artifacts/native/phase17/build.json` and `.planning/phases/17-library-running-plans/evidence/phase17-library-running.json`; no source/APK/device/report hashes or PASS cases are claimed.

## Task Commits

1. **Task 1: Capture the complete Library and preserved-route native journey**
   - `71febe57` — test RED coverage for the bounded runner contract.
   - `41a0996e` — manifest-bound Library runner and Library flow implementation.
2. **Task 2: Capture Running authoring/accessibility and close all evidence**
   - `a013219a` — test RED coverage for Running and accessibility flows.
   - `d2c17327` — Running/accessibility flow sources and package command binding.
   - `55e495fd` — representative device accessibility profiles applied before each relevant native case.

## Files Created/Modified

- `scripts/run-phase17-maestro.mjs` — exact-manifest runner with explicit `--execute`, bounded case selection, and `finally` restoration.
- `maestro/phase17/library.yaml` — Library root, chooser, deep-route, and recovery flow source.
- `maestro/phase17/running-authoring.yaml` — zero/nonempty Running creation, typed sessions, lifecycle, and collision flow source.
- `maestro/phase17/accessibility.yaml` — keyboard/D-pad/Back/focus recovery source.
- `scripts/phase17-evidence-scripts.test.mjs` — runner and static flow coverage checks.
- `package.json` — `test:maestro:phase17` command.
- `17-VALIDATION.md` — truthful implementation-complete/native-pending state and exact Phase 20 command sequence.

## Decisions Made

- Evidence remains fail-closed: this runner never writes consolidated evidence; retained real-run artifacts must drive the later evidence record.
- Device settings restoration is guaranteed by a `finally` path so an interrupted native run cannot leave the test device altered.
- The 39-case ledger is the sole execution scope; each canonical case gets one representative journey, avoiding Cartesian combinations.

## Deviations from Plan

### User-directed verification boundary

The original plan called for an exact-source APK run, device execution, completed evidence JSON, and all-ID verifier PASS. The owner explicitly deferred those steps. The implementation is complete, but native acceptance remains Phase 20 pending and no evidence PASS was fabricated.

## Known Stubs

None. The absence of a current native evidence JSON is an intentional owner-directed deferral, not an application stub.

## Next Phase Readiness

Phase 20 can execute the exact retained-artifact sequence listed in `17-VALIDATION.md`. It must run the deferred global host checks and native commands before creating any evidence JSON or setting Nyquist validation complete.

## Self-Check: PASSED

- `scripts/run-phase17-maestro.mjs`, all three `maestro/phase17/*.yaml` flows, and the focused test file exist.
- Task commits `71febe57`, `41a0996e`, `a013219a`, and `d2c17327` exist on `fchoo/UX-revamp`.
