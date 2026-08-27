---
phase: 04-overall-progress-and-complete-progression
plan: 01
subsystem: progress-projections
tags: [sqlite, projections, progress, metrics, scheduling, freshness]
requires:
  - phase: 03-calendar-and-history-integrity/03-03
    provides: Revision-fenced effective-history projections and freshness contracts
provides:
  - Deterministic civil-window Progress reducer over effective history and persisted schedule opportunities
  - Freshness-aware SQLite Progress repository that fails closed on incomplete or behind projections
  - Runtime-only typed Progress read capability for later UI routes
affects: [progress-ui, recommendations, release]
actuals:
  tokens: 6500
  tasks: 2
  commits: 1
tech-stack:
  added: []
  patterns:
    - Progress reads compose Phase 3 derivatives only after all required subjects are current
    - UI consumers receive factual Progress data exclusively through WorkoutAppRuntime
key-files:
  created:
    - src/domains/progress/contracts.ts
    - src/domains/progress/periodProjection.ts
    - src/platform/sqlite/repositories/progressRepository.ts
  modified:
    - src/bootstrap/workoutAppRuntime.tsx
    - src/bootstrap/workoutAppRuntime.test.tsx
key-decisions:
  - "Progress period windows are inclusive civil dates: 4 weeks is today minus 27 days and 12 weeks is today minus 83 days."
  - "A missing or behind history projection never produces current totals; an empty history-subject set is an explicit baseline."
  - "Recommendation-backed attention remains empty here and is owned by the later lifecycle integration plan."
patterns-established:
  - "Derived progress uses metric comparators only inside persisted identity and comparator boundaries."
requirements-completed: [PROG-01, PROG-02, PROG-03, PROG-05]
coverage:
  - id: D1
    description: Civil-window Progress facts, metric-aware statuses, records, trends, and source drill-down IDs are deterministic.
    requirement: PROG-01
    verification:
      - kind: unit
        ref: src/domains/progress/periodProjection.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: SQLite Progress reads fail closed when source projections are unavailable or updating and include persisted schedule opportunities.
    requirement: PROG-03
    verification:
      - kind: integration
        ref: tests/sqlite-host/progressRepository.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Progress can be read through the trusted runtime boundary without importing SQLite into presentation code.
    requirement: PROG-05
    verification:
      - kind: unit
        ref: src/bootstrap/workoutAppRuntime.test.tsx#exposes factual progress only through the trusted runtime boundary
        status: pass
    human_judgment: false
duration: 35m
completed: 2026-08-24
status: complete
---

# Phase 04 Plan 01: Factual Progress Projection Summary

**Progress now reads reproducible civil-window facts from current Phase 3 projections and persisted scheduling outcomes through one typed runtime capability.**

## Accomplishments

- Added deterministic 4-week, 12-week, and all-time reducers for working sets, schedule opportunities, comparator-backed records, statuses, trends, and source drill-down IDs.
- Added a SQLite repository that checks the all-period and exercise-metric projection revisions before returning facts, exposing baseline, updating, or unavailable state instead of stale analytics.
- Exposed Progress only via `WorkoutAppRuntime`, preserving the route/UI-to-runtime boundary for the next UI plan.

## Task Commits

1. **Tasks 1–2: reducer, revision-aware repository, runtime boundary, and tests** — pending commit.

## Decisions Made

- Progress is strictly factual: it emits no global score, volume headline, medical interpretation, or fabricated sparse-history record.
- Persisted consumed schedule opportunities enter the same civil-window reducer as history facts; the reducer performs the final selected-period filtering.
- Attention is deliberately empty until Phase 04 Plan 06 attaches stored recommendation lifecycle evidence.

## Deviations from Plan

None — the repository conservatively reads all durable schedule opportunity rows and the deterministic reducer selects the relevant civil window, preserving all-time earliest-date correctness without duplicating window math in SQL.

## Verification

- `npm run test:unit -- --runInBand src/domains/progress/periodProjection.test.ts` — passed (5 tests).
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/progressRepository.test.ts` — passed (3 tests).
- `npm run test:unit -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx` — passed (35 tests).
- `npm run typecheck` and `git diff --check` — passed.

## User Setup Required

None.

## Next Phase Readiness

The Progress screen can bind to `runtime.loadProgress` and renders the established neutral-grey canvas with white light cards and near-black dark cards. Recommendation attention remains for the later lifecycle plan.

---
*Phase: 04-overall-progress-and-complete-progression*
*Completed: 2026-08-24*
