---
phase: 15-workout-parity
plan: "12"
subsystem: testing
tags: [maestro, native-evidence, accessibility, visual-regression, recovery, expo-sqlite]
requires:
  - phase: 15-workout-parity
    provides: Phase 15 implementation, evidence ledger, verifier, and Revision 18 source pins
provides:
  - Three production-route Phase 15 Maestro flow entrypoints
  - Bounded 56-cell native behavior, accessibility, recovery, and visual-capture matrix
  - Static hash-chain, device-restoration, and canonical-ledger self-tests
affects: [15-13-performance-final-gate, verify-work]
tech-stack:
  added: []
  patterns: [risk-based representative matrix, ledger-owned native stages, chained visual metadata, per-case device restoration]
key-files:
  created:
    - maestro/phase15/workout-root.yaml
    - maestro/phase15/active-workout.yaml
    - maestro/phase15/recovery-completion.yaml
    - scripts/phase15-native-matrix.mjs
    - scripts/phase15-native-matrix.test.mjs
  modified: []
decisions:
  - "The native matrix uses one action-bearing representative per ledger case and only the editor, visual, appearance, viewport, text, motion, and lifecycle variants needed to cover distinct risk classes."
  - "Phase 15 captures semantic trees, keyboard/D-pad/focus traces, 48dp bounds, and synthetic privacy-safe artifacts while restoring device and fixture state after every case."
metrics:
  duration: 4 min
  completed: 2026-10-10
actuals:
  tokens: 5481
  tasks: 2
  commits: 4
status: complete
coverage:
  - id: D1
    description: Root-to-completion production-route Maestro tracer and chained Revision 18 visual capture contract.
    requirement: WRK-01
    verification:
      - kind: unit
        ref: scripts/phase15-native-matrix.test.mjs#Phase 15 tracer binds the root-to-completion journey to the canonical ledger
        status: pass
    human_judgment: false
  - id: D2
    description: Bounded representative matrix covers all 36 Workout requirements and six cross-cutting evidence cases.
    requirement: WRK-36
    verification:
      - kind: unit
        ref: scripts/phase15-native-matrix.test.mjs#Phase 15 matrix maps every ledger case once, with bounded necessary variants
        status: pass
      - kind: other
        ref: node --input-type=module YAML parser validation and node scripts/phase15-native-matrix.mjs
        status: pass
    human_judgment: false
  - id: D3
    description: Static accessibility, privacy, recovery, visual-chain, type, and boundary checks remain valid.
    verification:
      - kind: other
        ref: node --test scripts/phase15-native-matrix.test.mjs scripts/phase15-evidence-scripts.test.mjs && npm run typecheck && npm run lint && npm run check:boundaries
        status: pass
    human_judgment: false
---

# Phase 15 Plan 12: Native Workout Matrix and Visual Capture Summary

**Bounded 56-cell Expo SQLite-native Workout matrix with production-route Maestro stages, exact accessibility/recovery restoration contracts, and Revision 18 visual hash-chain metadata.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-10T14:27:39Z
- **Completed:** 2026-10-10T14:31:38Z
- **Tasks:** 2/2
- **Files modified:** 5
- **Representative cells:** 56

## Accomplishments

- Added root, Active Workout, and completion/recovery Maestro flows using the development-test package and real application actions rather than HTTP or fixture UI.
- Bound the tracer to preview, start, explicit Save, committed Complete, rest, finish, completion review, and `Keep plan as-is` without changing the plan.
- Expanded to all 42 canonical ledger IDs: WRK-01–36 and six cross-cutting evidence cases, with exactly one action-bearing cell for each case.
- Kept coverage risk-based: seven viewport/orientation rows, Light/Dark/System-to-both appearances, 100%/200% text, touch/keyboard/D-pad/Enter/Space/Back/Escape/IME variants, reduced motion, nine editor profiles, lifecycle recovery, and six distinct 390×844 visual references.
- Enforced static capture requirements for semantic trees, keyboard/D-pad focus traces, 48dp targets, synthetic privacy-safe facts, SHA-256 visual derivations, and restoration of font scale, appearance, orientation, notification state, and fixture database after every case.

## Task Commits

1. **Task 1: Drive one real root-to-completion native flow through the ledger**
   - `fe3300c` — RED contract test
   - `c003c9c` — production tracer flows and visual-chain matrix
2. **Task 2: Expand flows to every state, input, accessibility, and recovery case**
   - `912f24a` — RED full-matrix acceptance contract
   - `faa7b5d` — 56-cell bounded native matrix and stage expansion

## Verification

- `YAML_VALID:3` — all three Phase 15 Maestro flows parsed successfully.
- `MATRIX_VALID:56` — static matrix plan accepted with 56 representative cells.
- `node --test scripts/phase15-native-matrix.test.mjs scripts/phase15-evidence-scripts.test.mjs` — 14 passing tests.
- `npm run typecheck` — passed.
- `npm run lint` and `npm run check:boundaries` — passed (339 files).

Per owner instruction, no APK build/install, device mutation, native cell execution, or global suite ran here. Plan 15-13 owns scoped runtime proof; Phase 20 owns the comprehensive final checkpoint.

## Decisions Made

- A distinct risk class receives a variant; equivalent Cartesian-product cells do not. The result is 42 action-bearing representatives, seven additional metric-editor variants, and seven visual comparison rows.
- The root tracer intentionally binds the three tracer states to one composite visual capture declaration; the six reference-specific rows remain the one-reference-per-comparison source for 390×844 evidence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected visual-row counting for the composite tracer declaration**
- **Found during:** Task 2 static matrix verification
- **Issue:** The initial test counted the tracer's three-reference visual declaration as a seventh reference-specific comparison row.
- **Fix:** Counted only one-reference visual rows while retaining the composite tracer declaration.
- **Files modified:** `scripts/phase15-native-matrix.mjs`, `scripts/phase15-native-matrix.test.mjs`
- **Verification:** Phase 15 matrix/evidence tests passed.
- **Committed in:** `faa7b5d`

## Known Stubs

None. The matrix is executable only by the later current-APK native runner; it does not claim fixture-only runtime evidence.

## Threat Surface

No new network endpoint, authentication path, file-access trust boundary, or schema change was introduced. The matrix directly mitigates the plan's fixture spoofing, visual-artifact tampering, device-configuration restoration, and evidence privacy threats.

## TDD Gate Compliance

- RED commits: `fe3300c`, `912f24a`; each failed because the corresponding tracer or full-matrix implementation was absent.
- GREEN commits: `c003c9c`, `faa7b5d`; all targeted verification passed.

## Self-Check: PASSED

All five authored files and all four task commits exist on `fchoo/UX-revamp`; no task commit deleted tracked files.
