---
phase: 14-prototype-visual-shell
plan: "09"
subsystem: native-evidence
tags: [maestro, native, evidence, accessibility, privacy, tdd]
requires:
  - phase: 14-05
    provides: shared sheet and toast presentation contracts
  - phase: 14-07
    provides: settings and rest-alert native routes
  - phase: 14-08
    provides: data and recovery native routes
  - phase: 14-12
    provides: source-owned Phase 14 verification inputs
provides:
  - fail-closed source/APK/device/report identity verifier for all 13 shell obligations
  - native Maestro journeys and a fixed theme, viewport, text, input, motion, startup, and recovery matrix
  - package commands for building, running, verifying, and self-testing Phase 14 evidence
affects: [14-10, native-verification, SHL-01, SHL-02, SHL-03, SHL-04, SHL-05, SHL-06, SHL-07, SHL-08, SHL-09, SHL-10, SHL-11, SHL-12, SHL-13]
actuals:
  tokens: 9764
  tasks: 3
  commits: 5
tech-stack:
  added: []
  patterns:
    - source-owned shell evidence ledger consumed by the runner and verifier
    - fail-closed development-test native matrix and privacy-safe evidence validation
key-files:
  created:
    - src/testing/contracts/phase14Shell.contract.ts
    - scripts/run-phase14-maestro.mjs
    - scripts/verify-phase14-evidence.mjs
    - scripts/phase14-native-matrix.mjs
    - maestro/phase14/shell.yaml
    - maestro/phase14/settings-recovery.yaml
    - maestro/phase14/accessibility.yaml
  modified:
    - package.json
    - package-lock.json
key-decisions:
  - "The canonical 13-item shell ledger is the single source for requirements, native stage names, flows, and evidence paths."
  - "Evidence is accepted only when source, retained APK, installed APK, development-test package/profile, device identity, reports, privacy checks, and DEV-02 native proof all agree."
  - "The native matrix preserves the requested Light/Dark/System, viewport/orientation, 200% text, input/focus, motion, startup, and no-write recovery coverage."
patterns-established:
  - "Native evidence plans validate a static configuration contract before a device run and replay every ledger stage through one named Maestro flow."
  - "Device evidence uses deterministic development-test fixtures and rejects account, token, SQL, archive, password, and filesystem-path content."
requirements-completed: [SHL-01, SHL-02, SHL-03, SHL-04, SHL-05, SHL-06, SHL-07, SHL-08, SHL-09, SHL-10, SHL-11, SHL-12, SHL-13]
coverage:
  - id: D1
    description: "Source-owned ledger and verifier bind every shell obligation to current native evidence identity."
    requirement: SHL-01
    verification:
      - kind: unit
        ref: "node --test scripts/phase14-evidence-scripts.test.mjs"
        status: pass
    human_judgment: false
  - id: D2
    description: "Native matrix and three Maestro journeys cover the required shell configuration and accessibility stages."
    requirement: SHL-13
    verification:
      - kind: unit
        ref: "node --test scripts/phase14-native-matrix.test.mjs"
        status: pass
    human_judgment: false
duration: 15min
completed: 2026-10-09
status: complete
---

# Phase 14 Plan 09: Native Shell Evidence Harness Summary

**A source-owned 13-case shell ledger, fail-closed source/APK/device evidence verifier, and native Maestro matrix for Phase 14 themes, accessibility, startup, settings, and recovery.**

## Performance

- **Duration:** 15 min resumed execution
- **Completed tasks:** 3/3
- **Files modified:** 11
- **Verification:** clean dependency restore, typecheck, boundary check, evidence self-tests, and native-matrix self-tests passed

## Accomplishments

- Bound all SHL-01–13 obligations to ordered native stages and canonical evidence paths, rejecting stale, incomplete, unsafe, or DEV-02-invalid evidence.
- Added development-test Maestro journeys for four roots and appearance, settings/recovery, and accessibility/startup behavior without browser acceptance or user-owned data.
- Established fixed native matrix requirements for Light/Dark/System behavior, the requested viewports and orientations, 200% text, 48dp targets, 3dp focus, keyboard/D-pad, reduced motion, factual startup, and no-write recovery navigation.
- Added Phase 14 package commands and removed obsolete font dependency entries after references had migrated.

## Task Commits

1. **Task 1: Bind one four-root native journey to source/APK identity and all shell IDs**
   - `7cfc9fba` test(14-09): add failing shell evidence harness coverage
   - `702ec49c` feat(14-09): bind shell evidence to native identity
2. **Task 2: Reconcile package scripts and remove obsolete font packages**
   - `8d0a5d45` chore(14-09): add phase14 evidence commands
3. **Task 3: Drive themes, widths, text, motion, focus, startup, and recovery natively**
   - `c2b38161` test(14-09): add failing native matrix coverage
   - `1116bc3b` feat(14-09): drive native shell matrix

## Files Created/Modified

- `src/testing/contracts/phase14Shell.contract.ts` — exact SHL ledger and canonical stage-to-evidence mapping.
- `scripts/run-phase14-maestro.mjs` — current source and retained APK-bound native stage runner.
- `scripts/verify-phase14-evidence.mjs` — installed APK/device/report, privacy, inventory, and DEV-02 verifier.
- `scripts/phase14-evidence-scripts.test.mjs` — fail-closed identity, coverage, privacy, and sheet-inventory tests.
- `scripts/phase14-native-matrix.mjs` — immutable native coverage matrix and validation/plan helper.
- `scripts/phase14-native-matrix.test.mjs` — RED/GREEN coverage for native matrix and flow-stage requirements.
- `maestro/phase14/*.yaml` — native-only shell, settings/recovery, and accessibility journeys.
- `package.json`, `package-lock.json` — Phase 14 commands and obsolete font dependency cleanup.

## Decisions Made

- Kept device execution out of this plan: the harness is self-tested here, while Plan 14-10 must execute it against a fresh Phase 14 manifest.
- Kept all flows on `com.fchoo.gymtracker.devtest`, deterministic routes, and no-write fixture behavior to avoid capturing user-owned data or treating browser checks as native proof.
- Required a separate approved native blended-fill report before DEV-02 can close, even though its owner color decision is already approved.

## Deviations from Plan

None — plan execution resumed from the existing Task 3 RED commit and completed the remaining GREEN implementation exactly as planned.

## Issues Encountered

None. Node emitted a module-type performance warning while importing the existing TypeScript contract directly; it did not affect the passing test, typecheck, or boundary results and requires no plan-scoped change.

## User Setup Required

None for this harness plan. Plan 14-10 owns execution against a fresh development-test APK/device manifest.

## Next Phase Readiness

- Plan 14-10 can build a fresh `phase14` development-test APK, run the 13 staged native journeys, capture the matrix artifacts, and invoke the verifier.
- No APK installation, device mutation, final APK, deployment, or user-owned data was used in this plan.

## Self-Check: PASSED

- Confirmed all 10 plan artifacts and this summary exist on disk.
- Confirmed all five recovered and new task commits exist in repository history.

---
*Phase: 14-prototype-visual-shell*
*Completed: 2026-10-09*
