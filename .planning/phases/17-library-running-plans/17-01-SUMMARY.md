---
phase: 17-library-running-plans
plan: "01"
subsystem: Running authoring and SQLite authority
tags: [running, sqlite, idempotency, route, drafts]
dependency_graph:
  requires: [phase-13-running-contracts, phase-14-ui-primitives]
  provides: [running-create-route, authoritative-running-readback, typed-running-drafts]
  affects: [17-09, 17-10, 18-garmin-import]
tech_stack:
  added: []
  patterns: [receipt-backed-create, source-table-readback, local-draft-before-command]
key_files:
  created:
    - src/bootstrap/runningPlanRuntime.test.tsx
    - src/ui/running/runningFormDraft.test.ts
    - src/ui/__tests__/RunningPlanEditorScreen.test.tsx
    - app/library/running/__tests__/routes.test.tsx
    - tests/integration/running-plan-authoring.test.ts
  modified:
    - src/platform/sqlite/repositories/runningPlanRepository.ts
    - src/bootstrap/runningPlanRuntime.tsx
    - src/ui/running/runningFormDraft.ts
    - src/ui/components/RunningSessionFields.tsx
    - src/ui/screens/RunningPlanEditorScreen.tsx
    - app/library/running/create.tsx
decisions:
  - SQLite source tables—not running event payloads—are the authoritative aggregate readback source.
  - Running creation persists an inactive aggregate and routes only after committed readback.
  - Create-mode sessions remain UI-local until the single aggregate create command.
metrics:
  duration: 2h
  completed: 2026-10-11
status: complete
actuals:
  tokens: 9954
  tasks: 3
  commits: 6
---

# Phase 17 Plan 01: Running create and reopen Summary

SQLite-authoritative inactive Running creation with exact committed reopen, typed zero-or-many local session drafts, and real-SQLite receipt/order proof.

## Completed Work

- Repaired the upstream Running aggregate read boundary to reconstruct a plan from plan, goal, stable slot, and current session source tables. It preserves inactive state, stable slots, and same-weekday ordinal order.
- Added a narrow runtime adapter that commits through Phase 13 then performs an authoritative readback before returning success to the route.
- Added the deep-linkable create route and create editor. One Recovery session can be added and removed back to zero before any write; successful submit replaces to the exact committed plan identity.
- Added pure local-draft helpers for validation plus add, edit, delete, and reorder of all seven approved Running session types.
- Added focused unit, component, route, and real SQLite integration coverage for runtime readback, inactive zero-session create, idempotent receipt replay, and two same-day ordered sessions.

## Commits

- `8b8ebe8e` `fix(13-17): add typed inactive Running aggregate create` — prior upstream repair retained.
- `193be417` `feat(17-01): add inactive Running create route` — prior plan starter retained.
- `27a68cbf` `fix(13-17): read Running aggregates from authoritative tables` — upstream repair completed.
- `83f9c8bc` `feat(17-01): create and reopen inactive Running plans` — tracer route/editor/runtime slice.
- `597f336d` `test(17-01): prove Running create commit and readback` — runtime, route, and real SQLite proof.
- `0edb1898` `feat(17-01): manage typed local Running session drafts` — all-kind local authoring behavior.

## Verification

- `npm run test:unit -- --runInBand src/bootstrap/runningPlanRuntime.test.tsx` — passed.
- `npm run test:components -- --runInBand src/ui/__tests__/RunningPlanEditorScreen.test.tsx` — passed.
- `npm run test:components -- --runInBand src/ui/running/runningFormDraft.test.ts src/ui/__tests__/RunningPlanEditorScreen.test.tsx` — passed.
- `npm run test:components -- --runInBand app/library/running/__tests__/routes.test.tsx` — passed.
- `npm run test:integration -- --runInBand tests/integration/running-plan-authoring.test.ts` — passed.
- `npm run test:integration -- --runInBand tests/integration/multi-plan-foundation-tracer.test.ts` — passed.
- `npm run typecheck`, `npm run lint`, and `npm run check:boundaries` — passed.

## Decisions Made

- Authoritative reopen reads SQLite source facts; the append-only event ledger is not treated as a presentation shadow store.
- Plan creation never activates a Running plan. Existing Phase 13 MAP-01 activation and real-identity collision protection remain below this adapter.
- Local drafts deliberately retain zero sessions and same-day rows until one create command commits them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Verification fix] Moved the pure Running draft test to the components Jest invocation.**
- **Found during:** Task 3 verification
- **Issue:** `src/ui/**` is excluded from the unit project, so the plan's unit command would not execute `runningFormDraft.test.ts`.
- **Fix:** Ran the test through `npm run test:components -- --runInBand src/ui/running/runningFormDraft.test.ts`; Jest boundaries were left unchanged.
- **Files modified:** None (verification command correction only)
- **Commit:** `0edb1898`

## Known Stubs

None.

## Self-Check: PASSED

- All committed production and focused test files exist.
- Commits `8b8ebe8e`, `193be417`, `27a68cbf`, `83f9c8bc`, `597f336d`, and `0edb1898` exist on `fchoo/UX-revamp`.
