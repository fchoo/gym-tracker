---
phase: 20-native-acceptance
plan: "04"
subsystem: native-acceptance-tooling
tags: [maestro, visual-comparison, accessibility, revision18, source-freeze]
dependency_graph:
  requires:
    - phase: 13-15-17
      provides: Source-owned multi-plan, Workout, and Library/Running contracts
    - phase: 14
      provides: Revision 18 precedence, 3dp focus ring, and native matrix conventions
  provides:
    - Complete source-bound visual capture plan for all 107 browser occurrences and 64 configurations
    - Semantic-first visual comparison with non-PASS owner-approved exceptions
    - F200 accessibility observation contract for input, focus, target geometry, and reduced motion
  affects: [phase-20-source-freeze, native-acceptance-execution]
tech-stack:
  added: []
  patterns:
    - Host-only planning tools never invoke Maestro, build, install, or native capture.
    - Semantic and accessibility gates determine verdict eligibility before visual pixel triage.
key-files:
  created:
    - maestro/v1.2/multi-plan.yaml
    - maestro/v1.2/workout.yaml
    - maestro/v1.2/library-running.yaml
    - maestro/v1.2/accessibility.yaml
    - scripts/capture-v12-visual.mjs
    - scripts/compare-v12-visual.mjs
    - scripts/v12-accessibility-shard.mjs
    - src/testing/contracts/v12Accessibility.contract.ts
  modified:
    - scripts/capture-v12-visual.test.mjs
    - scripts/compare-v12-visual.test.mjs
    - scripts/v12-accessibility-shard.test.mjs
    - src/testing/contracts/v12Accessibility.contract.test.ts
decisions:
  - "The exact 107 browser-state order and all 64 declared configurations are expanded as 6,848 capture identities; contact sheets remain index-only."
  - "A visual exception requires owner/deviation/date/scope/rationale/evidence metadata and is always ACCEPTED_EXCEPTION, never PASS."
  - "The accessibility shard is an observation schema only: it requires F200, 48dp non-overlap, all four input modes, Phase 14 3dp focus geometry, and normal/reduced semantic parity without claiming live TalkBack or native execution."
requirements-completed: [VER-02, VER-03, VER-04, VER-05, VER-06]
coverage:
  - id: D1
    description: Source-bound visual capture registry and cross-phase Maestro flow sources.
    verification:
      - kind: unit
        ref: node --test scripts/capture-v12-visual.test.mjs
        status: pass
    human_judgment: false
  - id: D2
    description: Revision 18 semantic-first visual comparison and accepted-exception isolation.
    verification:
      - kind: unit
        ref: node --test scripts/compare-v12-visual.test.mjs
        status: pass
    human_judgment: false
  - id: D3
    description: Native accessibility and reduced-motion observation contract.
    verification:
      - kind: unit
        ref: npm run test:unit -- --runInBand src/testing/contracts/v12Accessibility.contract.test.ts
        status: pass
      - kind: unit
        ref: node --test scripts/v12-accessibility-shard.test.mjs
        status: pass
    human_judgment: false
actuals:
  tokens: 6285
  tasks: 3
  commits: 6
metrics:
  duration: "19m"
  completed: "2026-10-13T21:49:41Z"
status: complete
---

# Phase 20 Plan 04: Source-Bound Visual and Accessibility Tooling Summary

Complete host-only capture, comparison, and accessibility contracts for the Phase 20 native-acceptance source freeze, with 6,848 exact visual capture identities and no native execution claim.

## Accomplishments

- Added explicit source-owned Maestro flow entry points for Phase 13 multi-plan occurrences, the full Phase 15 Workout lifecycle, and Phase 17 Library/Running states. The capture planner snapshots their source hashes and source-contract case ordering.
- Added a planning-only visual capture producer that expands every ordered `BW-001` through `BW-107` occurrence across every required appearance, size, orientation, and font configuration. It rejects sampling, reorder, duplicate screenshot identity, non-synthetic fixtures, and verdict-bearing contact sheets.
- Added Revision 18 comparison gates that validate reference/native/overlay/difference/mask identities, enforce semantic and measured gates before pixels, provide documented diagnostic thresholds, and keep `ACCEPTED_EXCEPTION` outside PASS counts.
- Added the accessibility observation contract and flow for actual F200 measurement, density/content/insets/IME metadata, 48dp non-overlap, non-color semantics, touch/software/hardware keyboard/D-pad activation, Back/Escape modal handling, Phase 14 3dp focus ring/offset, and normal/reduced-motion semantic parity.

## TDD Gate Compliance

- RED commits: `348878a7`, `b56fa147`, `63455548`.
- GREEN commits: `9be7eefb`, `3274f4df`, `2a1ffd71`.
- Each RED test initially failed because its implementation module did not exist; each scoped suite passed after its corresponding GREEN commit.

## Verification

- PASS — `node --test scripts/capture-v12-visual.test.mjs` (3 tests).
- PASS — `node --test scripts/compare-v12-visual.test.mjs` (4 tests).
- PASS — `node --test scripts/v12-accessibility-shard.test.mjs` (2 tests).
- PASS — `npm run test:unit -- --runInBand src/testing/contracts/v12Accessibility.contract.test.ts` (1 test). The worktree used a temporary symlink to the existing sibling-worktree dependency tree and removed it after the run.
- PASS — `git diff --check`.
- NOT RUN by plan boundary — native capture, APK build/install, Maestro execution, final ledger verdicts, and attended/Samsung evidence.

## Task Commits

1. Task 1 RED — `348878a7` test visual capture registry.
2. Task 1 GREEN — `9be7eefb` source-owned visual flows and 107×64 planner.
3. Task 2 RED — `b56fa147` semantic comparison tests.
4. Task 2 GREEN — `3274f4df` semantic-first comparison and exception validation.
5. Task 3 RED — `63455548` accessibility observation tests.
6. Task 3 GREEN — `2a1ffd71` accessibility contract, flow, and observation shard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Validation bug] Corrected the target overlap field lookup in the accessibility shard**
- **Found during:** Task 3 GREEN verification.
- **Issue:** The first validator path looked only at a target-level overlap marker while the measured target fixture stores its bounds separately.
- **Fix:** Accept the explicit measured overlap marker while preserving the fail-closed requirement that one of the canonical fields states `false`.
- **Files modified:** `scripts/v12-accessibility-shard.mjs`, `scripts/v12-accessibility-shard.test.mjs`.
- **Verification:** `node --test scripts/v12-accessibility-shard.test.mjs` passed.
- **Commit:** `2a1ffd71`.

**Total deviations:** 1 auto-fixed Rule 1 issue. **Impact:** The accessibility schema now accepts the documented measured representation while continuing to reject unmeasured or overlapping targets.

## Known Stubs

None. All sources intentionally produce plans and validations only; the plan expressly prohibits fabricating native captures or final PASS evidence.

## Threat Flags

None. This plan adds no runtime endpoint, authentication path, filesystem trust boundary, or production schema surface. The new tooling validates synthetic-fixture and hash-bound evidence metadata only.

## Next Phase Readiness

The Phase 20 source-freeze workflow can consume these static flows and validators before it creates one exact native artifact. Runtime evidence must use the later authorized execution plans; this plan makes no build, installation, capture, or owner-attended claim.

## Self-Check: PASSED

- Confirmed all twelve listed flow, script, contract, and test artifacts exist in this worktree.
- Confirmed task commits `348878a7`, `9be7eefb`, `b56fa147`, `3274f4df`, `63455548`, and `2a1ffd71` are reachable in Git history.
