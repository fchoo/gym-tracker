---
phase: 19-progress-parity
plan: 01
subsystem: progress-domain
tags: [typescript, sqlite-facts, running, strength, projections, jest]
requires:
  - phase: 13-multi-plan-running-foundation
    provides: revision-bearing Running goals, bodyweight facts, and effective Strength history
  - phase: 17-library-running-plans
    provides: final Running target and runtime boundaries
  - phase: 18-garmin-import
    provides: accepted canonical Garmin activity revisions and source evidence semantics
provides:
  - Fail-closed upstream-port contract for factual Progress inputs
  - Discriminated All, Strength, and Running dashboard projection contracts
  - Replayable accepted-effort, target-at-date, metric-eligibility, and pacing rules
affects: [19-02, 19-03, 19-04, 19-05, 19-09, 19-10, phase-20]
actuals:
  tokens: 8665
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns:
    - "Discriminated factual Progress projections over SQLite-authoritative source facts"
    - "Integer rational half-up pacing displays from committed Running targets"
    - "Metric eligibility and comparability reused below Strength presentation"
key-files:
  created:
    - src/testing/contracts/progressUpstreamPorts.contract.ts
    - src/testing/contracts/progressUpstreamPorts.contract.test.ts
    - src/domains/progress/dashboardProjection.ts
    - src/domains/progress/dashboardProjection.test.ts
    - src/domains/progress/runningPacing.ts
    - src/domains/progress/runningPacing.test.ts
  modified:
    - src/domains/progress/contracts.ts
    - src/domains/progress/periodProjection.ts
    - src/domains/progress/periodProjection.test.ts
key-decisions:
  - "Progress accepts only active, accepted, non-fixture Running facts with source-summary or source-lap exact-distance evidence."
  - "Running efforts are grouped by exact distance and documented time basis; sampled chart data never creates a best effort."
  - "Historical goal lines resolve the target revision effective at each factual observation rather than rewriting history with a current target."
  - "Strength eligibility delegates to the existing metric registry predicates and retains revision-fenced recommendations."
patterns-established:
  - "Projection modules are pure disposable views: they consume revision-bearing facts and never query SQLite or mutate source state."
  - "Missing, incompatible, and insufficient evidence are explicit typed states, never zero-valued placeholders."
requirements-completed: [PRO-02, PRO-03, PRO-04, PRO-05, PRO-06, PRO-07]
coverage:
  - id: D1
    description: "Fail-closed port contract for accepted Running goals, Garmin evidence, source detail, and navigation identities."
    requirement: PRO-04
    verification:
      - kind: unit
        ref: src/testing/contracts/progressUpstreamPorts.contract.test.ts#accepts the landed Phase 13/17/18 factual boundaries
        status: pass
    human_judgment: false
  - id: D2
    description: "Deterministic All and Running factual projections with exact-effort evidence, target-at-date history, and source-linked sparse states."
    requirement: PRO-02
    verification:
      - kind: unit
        ref: src/domains/progress/dashboardProjection.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: "Committed Running targets derive exact pace and split displays through integer half-up rounding."
    requirement: PRO-05
    verification:
      - kind: unit
        ref: src/domains/progress/runningPacing.test.ts
        status: pass
    human_judgment: false
  - id: D4
    description: "Strength facts reuse effective metric eligibility and omit stale recommendation fences."
    requirement: PRO-03
    verification:
      - kind: unit
        ref: src/domains/progress/periodProjection.test.ts#projectStrengthComparableFacts
        status: pass
    human_judgment: false
duration: 45 min
completed: 2026-10-13
status: complete
---

# Phase 19 Plan 01: Progress Factual Projection Foundation Summary

**Typed, replayable All/Strength/Running Progress projections now derive exact running efforts and metric-correct Strength facts only from accepted revision-bearing source data.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-10-12T15:17:00Z
- **Completed:** 2026-10-12T16:02:36Z
- **Tasks:** 3/3
- **Files modified:** 9

## Accomplishments

- Added a narrow upstream contract proving Phase 13, 17, and 18 provide stable goal, accepted-import, source-detail, bodyweight, and navigation facts without a Phase 19 adapter store.
- Added a discriminated factual dashboard projection that rejects sampled, unaccepted, removed, fixture, malformed, and inexact Running inputs; it retains target-at-date history and explicit empty/sparse/more-data-needed states.
- Added source-target-only, integer half-up Running pacing for the 2.4 km 11:00 default and alternate committed targets.
- Extended Strength projection with existing metric eligibility/comparability predicates and effective revision/recommendation fences.

## Task Commits

Each task was committed atomically:

1. **Task 1: Trace accepted effort into factual Running projection** — `7f3cd3af` (feat)
2. **Task 2: Expand All/Running selection and pacing rules** — `50a5f90e` (feat)
3. **Task 3: Expand effective Strength history projection** — `019296e1` (feat)

## Files Created/Modified

- `src/testing/contracts/progressUpstreamPorts.contract.ts` — narrow compile-time/runtime preflight for factual upstream ports.
- `src/testing/contracts/progressUpstreamPorts.contract.test.ts` — behavioral proof that the landed source boundaries satisfy the preflight.
- `src/domains/progress/contracts.ts` — discriminated factual dashboard, Running evidence, target revision, and Strength candidate contracts.
- `src/domains/progress/dashboardProjection.ts` — deterministic All/Strength/Running factual projection.
- `src/domains/progress/dashboardProjection.test.ts` — accepted-evidence, target-history, tie-break, missing-state, and deterministic-order tests.
- `src/domains/progress/runningPacing.ts` — integer rational pacing and split derivation.
- `src/domains/progress/runningPacing.test.ts` — default and half-second rounding tests.
- `src/domains/progress/periodProjection.ts` — effective Strength candidate filtering using existing metric contracts.
- `src/domains/progress/periodProjection.test.ts` — Strength effective revision, eligibility, stale recommendation, and invalid revision cases.

## Verification

- `npm run test:unit -- --runInBand src/testing/contracts/progressUpstreamPorts.contract.test.ts src/domains/progress/dashboardProjection.test.ts src/domains/progress/runningPacing.test.ts src/domains/progress/periodProjection.test.ts` — passed (4 suites, 17 tests).
- `npm run typecheck` — passed.
- `npm run lint` — passed (boundary check, 405 files).
- `npm run test:coverage -- --runInBand` — passed with global branch coverage at **85.00%**.

## Decisions Made

- Exact Running best efforts require canonical accepted source-summary or source-lap evidence at the claimed distance and time basis; sampled chart points are presentation-only.
- All-goal ordering uses persisted source order, explicit target date, sport, stable target identity, then revision—never a normalized cross-sport gap or composite score.
- Strength projection consumes existing metric eligibility and comparability services, preserving the established source authority instead of duplicating metric semantics.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `node_modules` was absent at start, so dependencies were restored with the existing lockfile via `npm ci`; the lockfile remained unchanged.
- The full coverage gate initially landed just below its global branch threshold. Added plan-relevant tie-break and invalid-revision tests, then the gate passed at 85.00%.
- A summary write was detected outside the isolated worktree during self-check and removed before staging; the committed summary is exclusively in `p19-01-live`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 19 consumers can compose the frozen factual dashboard contracts without parsing provider payloads, adding SQL paths, or inventing missing values.
- Phase 20-only native/device/attended acceptance remains intentionally out of scope.

## Self-Check: PASSED

- All nine declared implementation/test files exist and are committed in `7f3cd3af`, `50a5f90e`, and `019296e1`.
- No stubs, skipped tests, unrun verification, new network surfaces, auth paths, file-access patterns, or schema changes were introduced.

---
*Phase: 19-progress-parity*
*Completed: 2026-10-13*
