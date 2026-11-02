---
phase: 13
plan: 15
subsystem: calendar-progress-source-queries
tags: [sqlite, calendar, running, bodyweight, progress]
requires: [13-06]
provides: [effective-calendar-match-overlay, factual-running-progress-source-reads]
affects: [calendar, progress, running]
tech-stack:
  added: []
  patterns:
    - current-match overlay over immutable activity identity
    - freshness-gated factual source reads
    - source-derived reads without backup-generation mutation
key-files:
  created:
    - src/platform/sqlite/repositories/progressRepository.test.ts
  modified:
    - src/platform/sqlite/repositories/trainingCalendarRepository.ts
    - src/platform/sqlite/repositories/progressRepository.ts
    - tests/sqlite-host/trainingCalendarRepository.test.ts
    - tests/integration/bodyweight-history.test.ts
decisions:
  - A current explicit activity match replaces only its linked planned Running event in Calendar; the imported activity remains the event identity.
  - Progress exposes accepted active activity, goal, and dated active bodyweight facts only after the existing history freshness gate is current.
metrics:
  duration: 25m
  completed: 2026-10-07
status: complete
actuals:
  tokens: 4715
  tasks: 2
  commits: 5
---

# Phase 13 Plan 15: Factual Calendar and Progress Source Queries Summary

Calendar now overlays an explicit current Running match on the imported activity without duplication, while Progress exposes only source-linked active Running, goal, and bodyweight facts after its existing freshness gate.

## Completed Tasks

1. Added a bounded Calendar overlay that joins the current one-to-one activity match to an active imported source fact. A linked import carries the plan/schedule/slot metadata and suppresses only the corresponding planned slot; unlinked slots and imports retain separate identities.
2. Added direct Progress repository source-read coverage and factual read models for active imports, explicit Running goals, and active dated bodyweight. Sparse source categories return explicit unavailable states, while stale projections retain the established no-source response shape.

## Verification

- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/trainingCalendarRepository.test.ts` — passed (2 tests).
- `npm run test:unit -- --runInBand src/platform/sqlite/repositories/progressRepository.test.ts` — passed (1 test).
- `npm run test:integration -- --runInBand tests/integration/bodyweight-history.test.ts` — passed (3 tests).
- `npm run typecheck` — passed.
- `npm run lint` — passed (310 files).

## Task Commits

1. **Task 1: Overlay matches and removals onto stable Calendar events** — `0489683` (RED), `b00e78a` (GREEN).
2. **Task 2: Add direct factual Running/bodyweight Progress repository coverage** — `8a837c1` (RED), `c79cd1a` (GREEN), `ead9a50` (integration isolation coverage).

## Decisions Made

- Calendar never infers a Running relationship by date or proximity. It uses the durable `running_activity_current_matches` relation and retains the imported activity ID as the effective event ID.
- Removed activity facts do not appear because both Calendar and Progress query the active lifecycle derivative; restoration is visible as unmatched unless the owner confirms a new match.
- A stale history projection remains fail-closed under the existing API contract; current source reads return explicit empty/unavailable categories rather than invented zero values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Compatibility] Preserved the existing stale Progress response shape.**

- **Found during:** Task 2 regression verification.
- **Issue:** Adding source facts to stale/updating responses changed established exact-result contracts in the SQLite Progress suite.
- **Fix:** Source facts remain behind the existing freshness gate. Stale or unavailable projections retain their established typed diagnostic and no source payload.
- **Files modified:** `src/platform/sqlite/repositories/progressRepository.ts`.
- **Verification:** `tests/sqlite-host/progressRepository.test.ts` passed alongside the task suites.
- **Commit:** `c79cd1a`.

## Known Stubs

None.

## Self-Check: PASSED

- Confirmed source files and direct repository tests exist.
- Confirmed task commits `0489683`, `b00e78a`, `8a837c1`, `c79cd1a`, and `ead9a50` are reachable on `agent-phase13-15`.
- Shared `.planning/STATE.md` and `.planning/ROADMAP.md` were intentionally not changed; the orchestrator owns integrated tracking.
