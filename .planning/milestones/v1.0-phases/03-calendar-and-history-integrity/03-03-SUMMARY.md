---
phase: 03-calendar-and-history-integrity
plan: 03
subsystem: history-projections
tags: [sqlite, effects, revisions, rebuilds, projections, determinism]
requires:
  - phase: 03-calendar-and-history-integrity/03-02
    provides: Effective comparable history facts and metric identity boundaries
provides:
  - Canonical old/new history subject fan-out and deterministic projection reducer
  - Revision-fenced durable targeted rebuild effects with conservative freshness reads
  - Targeted/full rebuild equivalence proof infrastructure
affects: [session-corrections, void-restore, progress, recommendations]
actuals:
  tokens: 15500
  tasks: 3
  commits: 1
tech-stack:
  added: []
  patterns:
    - All derivative history state is rebuilt from effective source facts through one reducer
    - Claimed rebuild effects re-check source revision immediately before derived writes
key-files:
  created:
    - src/domains/history/historySubjects.ts
    - src/domains/history/projectionReducer.ts
    - src/platform/sqlite/effects/historyProjectionEffects.ts
    - src/platform/sqlite/migrations/0014_history_projections.ts
    - src/platform/sqlite/repositories/historyProjectionRepository.ts
  modified:
    - src/bootstrap/workoutLifecycle.ts
    - src/bootstrap/workoutAppRuntime.tsx
key-decisions:
  - "Targeted and full rebuilds invoke the same canonical reducer."
  - "Projection consumers expose current, updating, or unavailable rather than stale data as final."
patterns-established:
  - "Lifecycle mutations fan out the complete old/new subject union, including void/restore scopes."
requirements-completed: [HIST-08, HIST-09]
coverage:
  - id: D1
    description: History subjects and canonical reducer are deterministic, fail closed, and exclude voided ordinary evidence.
    requirement: HIST-09
    verification:
      - kind: unit
        ref: src/domains/history/historySubjects.test.ts and src/domains/history/projectionReducer.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Revision-fenced effects supersede stale work and targeted/full rebuilds converge to identical derived rows.
    requirement: HIST-08
    verification:
      - kind: integration
        ref: tests/sqlite-host/historyProjectionRepository.test.ts
        status: pass
    human_judgment: false
duration: 1h 45m
completed: 2026-08-25
status: complete
---

# Phase 03 Plan 03: Deterministic History Projections Summary

**History-derived records, metrics, period inputs, and recommendation scopes now rebuild deterministically from revision-fenced effective facts.**

## Accomplishments

- Added complete old/new subject union calculation and a pure canonical reducer for history derivatives.
- Added a dedicated durable rebuild queue, monotonic subject revisions, stale-result rejection, and conservative freshness state.
- Proved targeted rebuilds and full rebuilds use the same reducer and converge.

## Task Commits

1. **Tasks 1–3: subjects, reducer, effect queue, freshness, and equivalence proof** — `4f92f22`.

## Decisions Made

- Projection failures are diagnosable derivatives and never revoke acknowledged source mutations.
- The existing pending-effects contract stays constrained; history rebuilds use their own versioned queue.

## Deviations from Plan

None — all planned deterministic source-to-effect boundaries were implemented in the one integrated commit.

## Verification

- Subject/reducer and SQLite projection suites passed, including stale-claim, retry, permanent-failure, and equivalence cases.

## User Setup Required

None.

## Next Phase Readiness

Correction and lifecycle commands can now mutate source facts while sharing one invalidation/rebuild contract.

---
*Phase: 03-calendar-and-history-integrity*
*Completed: 2026-08-25*
