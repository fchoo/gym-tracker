---
phase: 17-library-running-plans
plan: "08"
subsystem: running-lifecycle
tags: [running, sqlite, lifecycle, MAP-01, idempotency, react-native]
requires:
  - phase: 17-01
    provides: SQLite-authoritative Running aggregate readback and inactive authoring
  - phase: 17-09
    provides: receipt-backed committed Running session routes
provides:
  - Explicit inactive, active, and archived Running aggregate lifecycle readback.
  - Sport-scoped preview/confirm activation replacement with stable receipt replay.
  - Archive/reactivate lifecycle review and confirmation from Running detail.
affects: [17-10, 17-11, 18-garmin-import, running-portability]
actuals:
  tokens: 33684
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns: [source-backed-detail, revisioned-lifecycle-preview, receipt-stable-confirmation, post-commit-readback]
key-files:
  created:
    - src/domains/running/lifecycle.ts
    - src/platform/sqlite/migrations/0038_running_plan_lifecycle_receipts.ts
  modified:
    - src/platform/sqlite/repositories/runningPlanRepository.ts
    - src/bootstrap/runningPlanRuntime.tsx
    - src/ui/screens/RunningPlanDetailScreen.tsx
    - tests/integration/running-plan-authoring.test.ts
key-decisions:
  - "Running lifecycle is derived from source facts: plans.is_active plus running_plans.status, never route-local inference."
  - "Activation retires only the existing active Running pair within one SQLite writer transaction; Strength facts are never selected or changed."
  - "Archive and reactivate retain immutable session revisions, schedule history, events, and receipts; reactivation returns inactive and requires a separate activation review."
patterns-established:
  - "Lifecycle UI: preview first, retain review on stale/failure, confirm one receipt-backed command, then render authoritative readback."
  - "Lifecycle storage: confirmation token fences the exact plan, schedule, active-workout, and same-sport replacement facts."
requirements-completed: [LIB-09, LIB-23, LIB-24, LIB-25, LIB-26]
coverage:
  - id: D1
    description: Running detail renders factual lifecycle, committed goals, and stable weekly session slots.
    requirement: LIB-24
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/RunningPlanDetailScreen.test.tsx
        status: pass
    human_judgment: false
  - id: D2
    description: Running edits retain revision-safe drafts and reopen committed snapshots.
    requirement: LIB-25
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/RunningPlanEditorScreen.test.tsx
        status: pass
      - kind: automated_ui
        ref: app/library/running/__tests__/routes.test.tsx
        status: pass
    human_judgment: false
  - id: D3
    description: Running lifecycle previews and confirms replacement, replay, archive/reactivate, and Strength isolation through real SQLite.
    requirement: LIB-26
    verification:
      - kind: integration
        ref: tests/integration/running-plan-authoring.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/multi-plan-foundation-tracer.test.ts
        status: pass
    human_judgment: false
duration: 13m
completed: 2026-10-11
status: complete
---

# Phase 17 Plan 08: Running Detail, Editor, and Lifecycle Summary

**Source-backed Running detail and editor routes now expose an explicit lifecycle and use receipt-stable, revision-fenced SQLite commands to activate, replace, archive, and reactivate Running plans without touching Strength.**

## Performance

- **Duration:** 13m
- **Started:** 2026-10-10T19:23:56Z
- **Completed:** 2026-10-10T19:37:21Z
- **Tasks:** 3/3
- **Files modified:** 19

## Accomplishments

- Added deep-linkable factual Running detail with committed goal/pace facts, stable same-day weekly slot ordering, optional Garmin handoff, and revision-safe edit routing.
- Added dirty-draft-safe Running plan editing that preserves session order and only replaces local state from authoritative committed readback.
- Added explicit inactive/active/archived lifecycle source readback, preview/review/confirm UI callbacks, immutable event and receipt history, and post-commit aggregate readback.
- Proved same-sport replacement, stale preview rejection, idempotent replay, active-workout guards, archive/reactivate history, backup capture, and Strength non-interference against real SQLite.

## Task Commits

1. **Task 1: Reopen an inactive Running plan on factual detail** — `a6313333` (`feat`)
2. **Task 2: Edit goal and weekly structure with draft-safe navigation** — `4a839e08` (`feat`)
3. **Task 3: Separate Running activation and lifecycle from editing** — `bbe95c9d` (`feat`)

## Files Created/Modified

- `app/library/running/[planId].tsx` — thin detail route supplying lifecycle runtime callbacks.
- `src/ui/screens/RunningPlanDetailScreen.tsx` — factual lifecycle state plus review, cancellation, retry, and confirmation presentation.
- `src/domains/running/lifecycle.ts` — narrow preview/confirmation DTO and stable token shape.
- `src/platform/sqlite/repositories/runningPlanRepository.ts` — transactional lifecycle ownership, MAP-01 replacement, receipt replay, and historical events.
- `src/platform/sqlite/migrations/0038_running_plan_lifecycle_receipts.ts` — preserves previous source rows while allowing immutable lifecycle receipt/event kinds.
- `src/bootstrap/runningPlanRuntime.tsx` — request-stable lifecycle callbacks and authoritative post-commit readback.
- `tests/integration/running-plan-authoring.test.ts` — real-SQLite lifecycle, history, backup, and cross-sport coverage.

## Decisions Made

- Lifecycle is represented by `running_plans.status` and `plans.is_active`; no parallel UI store or route-local SQL was introduced.
- A reactivated plan is safely inactive and visible again. It cannot silently replace the active Running plan; activation always needs a fresh preview.
- The lifecycle migration rebuilds only the two receipt/event table constraints while copying all source rows and restoring their immutable and backup-generation triggers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added the authoritative lifecycle repository, runtime port, and persistence compatibility migration.**
- **Found during:** Task 3
- **Issue:** Detail could present lifecycle controls, but no revisioned source-owned command existed to preview/confirm replacement, archive, or reactivation; existing immutable receipt/event constraints also rejected lifecycle records.
- **Fix:** Added source-derived lifecycle readback, same-sport transactional replacement, archive/reactivate state transitions, request-stable receipts, immutable lifecycle events, and migration 38 to preserve and extend receipt/event compatibility.
- **Files modified:** `src/domains/running/lifecycle.ts`, `src/platform/sqlite/repositories/runningPlanRepository.ts`, `src/bootstrap/runningPlanRuntime.tsx`, `src/platform/sqlite/migrations/0038_running_plan_lifecycle_receipts.ts`
- **Verification:** Real-SQLite lifecycle/replay/history/backup test, MAP-01 integration test, typecheck, lint, and boundary checks passed.
- **Committed in:** `bbe95c9d`

**2. [Rule 3 - Verification fix] Replaced a stale planned integration test path with the current MAP-01 tracer.**
- **Found during:** Task 3 verification
- **Issue:** `tests/integration/multi-plan-activation.test.ts` no longer exists, so Jest found no tests.
- **Fix:** Ran `tests/integration/multi-plan-foundation-tracer.test.ts`, which contains the current host-SQLite MAP-01 activation proof, alongside the new lifecycle integration test.
- **Files modified:** None
- **Verification:** Both real-SQLite integration suites passed.
- **Committed in:** `bbe95c9d`

**Total deviations:** 2 auto-fixed (Rule 2 correctness boundary; Rule 3 verification correction).

## Issues Encountered

- The first lifecycle test revealed that the pre-existing receipt/event CHECK constraints accepted only create/edit/copy. Migration 38 preserves every old row and trigger while adding lifecycle values; no data was deleted or rewritten semantically.

## Known Stubs

None.

## User Setup Required

None — no external service configuration is required.

## Next Phase Readiness

- Running detail now owns the only lifecycle presentation path, and future Garmin/match work can remain contextual without gaining mutation authority.
- Portability, merge, restore, and history retain the same registered Running source tables, including the new lifecycle receipts/events.

## Verification

- `npm run test:components -- --runInBand src/ui/__tests__/RunningPlanDetailScreen.test.tsx src/ui/__tests__/RunningPlanEditorScreen.test.tsx app/library/running/__tests__/routes.test.tsx` — passed (8 tests; React test environment emitted non-failing `act(...)` warnings).
- `npm run test:unit -- --runInBand src/bootstrap/runningPlanRuntime.test.tsx` — passed (3 tests).
- `npm run test:integration -- --runInBand tests/integration/running-plan-authoring.test.ts` — passed (3 real-SQLite tests).
- `npm run test:integration -- --runInBand tests/integration/multi-plan-foundation-tracer.test.ts` — passed (8 real-SQLite MAP-01 tests).
- `npm run typecheck`, `npm run lint`, and `npm run check:boundaries` — passed.

## Self-Check: PASSED

- All detail, editor, runtime, lifecycle, migration, and real-SQLite test files listed above exist.
- Task commits `a6313333`, `4a839e08`, and `bbe95c9d` exist on `fchoo/UX-revamp`.

---
*Phase: 17-library-running-plans*
*Completed: 2026-10-11*
