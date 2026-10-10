---
phase: 17-library-running-plans
plan: "11"
subsystem: running-session-lifecycle
tags: [react-native, sqlite, running, revisions, portability, accessibility]
requires:
  - phase: 17-08
    provides: source-backed Running lifecycle and archive/reactivate receipts
  - phase: 17-10
    provides: all seven typed Running session editor branches
provides:
  - Exact-membership prospective session saves with immutable root and receipt preservation.
  - Stable ordered same-day Running slots with accessible earlier/later controls.
  - True empty plan rendering, confirmed local removal, and portable active/retired slot facts.
affects: [17-12, 18-garmin-import, running-portability, running-history]
actuals:
  tokens: 4886
  tasks: 3
  commits: 7
tech-stack:
  added: []
  patterns: [exact-membership projection, retireable-current-slot projection, stable-ID reorder, local confirmation before save]
key-files:
  created:
    - src/platform/sqlite/migrations/0039_running_session_slot_membership.ts
    - tests/sqlite-host/running-plans.test.ts
  modified:
    - src/platform/sqlite/repositories/runningPlanRepository.ts
    - src/bootstrap/runningPlanRuntime.tsx
    - src/ui/screens/RunningPlanEditorScreen.tsx
    - src/ui/screens/RunningSessionEditorScreen.tsx
    - tests/integration/multi-plan-portability.test.ts
key-decisions:
  - "Immutable slot roots and revisions remain history; the current slot projection carries retirement state for prospective membership changes."
  - "Only Runtime aggregate/session saves set completeMembership; lower-level graph appends retain their existing partial-graph behavior."
  - "Removing a session is a local confirmation followed by an explicit Save, never an immediate permanent delete."
patterns-established:
  - "Exact Running membership updates offset current ordinals before reapplying stable IDs, avoiding unique-order collisions during a reorder."
  - "Editor retries use an explicit load attempt state, retaining no local mutation authority during failed read recovery."
requirements-completed: [LIB-25, LIB-27, LIB-35]
coverage:
  - id: D1
    description: "Session load retries, local drafts, and receipt-safe prospective removal preserve source identity and no-write failure recovery."
    requirement: LIB-25
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/RunningSessionEditorScreen.test.tsx
        status: pass
      - kind: integration
        ref: tests/integration/running-plan-authoring.test.ts
        status: pass
      - kind: other
        ref: tests/sqlite-host/running-plans.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: "Multiple same-day sessions keep stable slot identities and exact persisted order through accessible reordering."
    requirement: LIB-27
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/RunningPlanEditorScreen.test.tsx
        status: pass
      - kind: other
        ref: tests/sqlite-host/running-plans.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: "True empty plans and retained active/retired slot source facts remain portable without restoring fixture sessions."
    requirement: LIB-35
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/RunningPlanEditorScreen.test.tsx
        status: pass
      - kind: integration
        ref: tests/integration/multi-plan-portability.test.ts
        status: pass
      - kind: other
        ref: tests/sqlite-host/running-plans.test.ts
        status: pass
    human_judgment: false
duration: 7m
completed: 2026-10-11
status: complete
---

# Phase 17 Plan 11: Running Session Lifecycle Summary

**Running plans now save an exact future session membership with stable IDs, ordered same-day slots, true empty state, durable receipts, and portable retired-slot history.**

## Performance

- **Duration:** 7m
- **Started:** 2026-10-10T20:08:41Z
- **Completed:** 2026-10-10T20:15:10Z
- **Tasks:** 3/3
- **Files modified:** 11

## Accomplishments

- Fixed the SQLite current-membership boundary so a prospective delete retires only the active slot projection while retaining immutable roots, revisions, receipt replay, and historical opportunity references.
- Added accessible earlier/later same-day session movement, stable-ID order serialization, and a confirmed local final-session removal that produces the exact `No sessions yet` state before a save.
- Made failed session loads truly retryable without a write, kept draft/retry behavior intact, and extended the v6 portability proof to include Running slot roots, revisions, current membership, receipts, and events.

## Task Commits

1. **Task 1: Add, edit, and delete one stable session prospectively** — `9a71a52c` (test), `b3d41814` (fix)
2. **Task 2: Reorder multiple same-day slots without collapsing identity** — `98228f92` (test), `ba9d8074` (feat)
3. **Task 3: Prove true-empty and full portability recovery** — `b24574ac` (test), `61ae58b9` (feat), `233e2521` (backup proof)

## Files Created/Modified

- `src/platform/sqlite/migrations/0039_running_session_slot_membership.ts` — makes the current slot projection retireable while stable roots/revisions stay immutable.
- `src/platform/sqlite/repositories/runningPlanRepository.ts` — applies exact membership atomically, preserves replay receipts, and reads only unretired current slots.
- `src/bootstrap/runningPlanRuntime.tsx` — marks aggregate/session commands as complete membership while keeping low-level partial commands compatible.
- `src/ui/screens/RunningPlanEditorScreen.tsx` — provides empty-state copy, local delete confirmation, and accessible earlier/later reorder actions.
- `src/ui/screens/RunningSessionEditorScreen.tsx` — retries failed source loads without issuing a write.
- `tests/sqlite-host/running-plans.test.ts` — real SQLite proof for prospective deletion, receipt replay, roots, and backup-retained tombstones.

## Decisions Made

- The mutable `running_session_slots` projection holds the current active/retired membership; `running_session_slot_roots` and immutable revision rows remain the source-history record.
- Aggregate editor commands use `completeMembership: true`; lower-level source graph calls remain partial by default to preserve their established append semantics.
- User removal is confirmation-gated and local until Save, so cancel and failure never mutate SQLite.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added retireable current-slot membership for prospective deletion and reordering.**
- **Found during:** Task 1
- **Issue:** The repository appended immutable revisions but never removed a deleted slot from the reopened current aggregate, so a saved final deletion could silently restore a previous session.
- **Fix:** Added migration 39, exact-membership Runtime commands, retired current-slot projection filtering, collision-safe ordinal replacement, and receipt/backup assertions.
- **Files modified:** `src/platform/sqlite/migrations/0039_running_session_slot_membership.ts`, `src/platform/sqlite/migrations/index.ts`, `src/platform/sqlite/repositories/runningPlanRepository.ts`, `src/bootstrap/runningPlanRuntime.tsx`, `src/domains/running/commands.ts`, `tests/sqlite-host/running-plans.test.ts`
- **Verification:** Focused component, integration, real-SQLite, typecheck, lint, and boundary commands passed.
- **Committed in:** `b3d41814`, `233e2521`

**2. [Rule 1 - Bug] Made the visible session load retry control perform a new source read.**
- **Found during:** Task 1
- **Issue:** The retry action only reset an unused ref, leaving the screen permanently in its error state.
- **Fix:** Added an explicit load-attempt state and regression coverage proving a successful retry performs no mutation.
- **Files modified:** `src/ui/screens/RunningSessionEditorScreen.tsx`, `src/ui/__tests__/RunningSessionEditorScreen.test.tsx`
- **Verification:** Focused component suite passed.
- **Committed in:** `b3d41814`

**Total deviations:** 2 auto-fixed (1 Rule 2, 1 Rule 1).

## Verification

- `npm run test:components -- --runInBand src/ui/__tests__/RunningPlanEditorScreen.test.tsx src/ui/__tests__/RunningSessionEditorScreen.test.tsx` — passed (12 tests).
- `npm run test:integration -- --runInBand tests/integration/running-plan-authoring.test.ts tests/integration/multi-plan-portability.test.ts` — passed (5 tests).
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/running-plans.test.ts` — passed.
- `npm run typecheck -- --pretty false`, `npm run lint`, and `npm run check:boundaries` — passed.

## Known Stubs

None.

## Next Phase Readiness

Running history and portability consumers can now distinguish active current slots from preserved retired slot identities. Phase 18 matching can continue to consume immutable opportunity/session revision facts without seeing deleted future membership as active.

## Self-Check: PASSED

- Confirmed the summary, retirement migration, lifecycle SQLite proof, and Running editor screen exist on disk.
- Confirmed commits `9a71a52c`, `b3d41814`, `98228f92`, `ba9d8074`, `b24574ac`, `61ae58b9`, and `233e2521` are reachable on `fchoo/UX-revamp`.

