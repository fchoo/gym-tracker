---
phase: 09-in-workout-exercise-editing
plan: 08
subsystem: plans, sqlite, runtime
tags: [sqlite, owned-plans, session-write-back, immutable-history, idempotency]
requires:
  - phase: 09-07
    provides: immutable planned lineage, exactly-once schedule consumption, and durable modified-workout provenance
provides:
  - canonical aggregate preview for an edited completed owned planned session
  - one revision-bound owned-plan write that applies final composition atomically
  - preview-bound replay-safe runtime preview/apply ports without completion UI
affects: [09-09, 09-10, 10-advanced-set-timing, 11-portable-history-merge-restore]
actuals:
  tokens: 20586
  tasks: 3
  commits: 5
tech-stack:
  added: []
  patterns: [canonical-final-composition, high-ordinal-owned-occurrence-retirement, preview-bound-request-replay, stateless-plan-readback]
key-files:
  created: []
  modified:
    - src/domains/plans/planImpactCommands.ts
    - src/platform/sqlite/repositories/ownedPlanRepository.ts
    - src/bootstrap/ownedPlanRuntime.tsx
    - tests/integration/plan-impact-replacement.test.ts
key-decisions:
  - "A write-back preview describes the complete final owned-day composition. Retained planned rows preserve their targets, warmups, and policies; null-lineage added/replacement rows stay manual_hold."
  - "Obsolete owned occurrences are retained on their original plan day at ordinal >= 1000000, so authoritative historical references survive while active-plan readers exclude them."
  - "The aggregate uses the existing immutable mutation-request table with operation save and a result operation of session_exercise_edits; no workout session/history table is written."
  - "The runtime derives one retry-stable request ID from the exact preview token, suppresses concurrent duplicate applies, and keeps plan reads repository-backed rather than maintaining a mutable cache."
requirements-completed: [WORK-24, WORK-27]
coverage:
  - id: D1
    description: Completed edited owned sessions yield a deterministic canonical aggregate preview only when final composition differs; excluded and restored states yield no eligible write-back.
    requirement: WORK-27
    verification:
      - kind: unit
        ref: src/domains/plans/planImpactCommands.test.ts#D-01-D-02-session-exercise-write-back-preview
        status: pass
      - kind: integration
        ref: tests/integration/plan-impact-replacement.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: One revision-checked aggregate applies final composition atomically, replays exactly, rejects stale state, rolls back injected failure, and leaves completed workout history byte-identical.
    requirement: WORK-24
    verification:
      - kind: integration
        ref: tests/integration/plan-impact-replacement.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/session-exercise-editing.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Runtime exposes dedicated aggregate preview/apply ports, never invokes the legacy single-replacement path, refreshes through the next repository-backed plan read, replays by preview-bound request identity, and suppresses concurrent duplicates.
    requirement: WORK-27
    verification:
      - kind: unit
        ref: src/bootstrap/ownedPlanRuntime.test.ts#owned-plan-runtime-port
        status: pass
      - kind: other
        ref: npm run test:coverage -- --runInBand
        status: pass
    human_judgment: false
metrics:
  duration: multi-session
  completed: 2026-09-17
status: complete
---

# Phase 09 Plan 08: Aggregate Session Write-Back Summary

**Completed, divergent owned-plan sessions can now preview and apply their final exercise composition through one revision-bound transaction, while recorded workout history remains untouched.**

## Performance

- **Duration:** Multi-session execution
- **Completed:** 2026-09-17
- **Tasks:** 3
- **Files modified:** 10 implementation and test files

## Accomplishments

- Derived canonical final composition from immutable completed-session facts: retained planned exercises preserve their existing targets/warmups/policies, while added or replacement null-lineage rows remain manual-target `manual_hold` occurrences. Unplanned, non-owned, empty, unedited, and edit-then-restored sessions have no eligible aggregate.
- Added one transaction-backed owned-day writer that revalidates the preview token, expected plan revision, session identity, and complete composition before incrementing the plan revision once. Exact request replay returns `already_committed`; stale and injected failures produce no partial plan or workout-history changes.
- Retired removed/replaced owned occurrences at high ordinals on their original plan day, preserving immutable reference graphs while active snapshots, Today, future workout start, and replacement previews exclude retired rows.
- Exposed dedicated runtime preview/apply ports with no call to repeated `replaceExercise`, preview-bound retry identity, in-flight duplicate suppression, and repository-backed plan readback after a successful commit. No completion-prompt UI was added.

## Task Commits

1. **Task 1: Define canonical aggregate preview and eligibility** - `89d9d7e`, `0868b4e` (test/feat)
2. **Task 2: Apply the complete owned-day composition atomically** - `b2aa8a2`, `0ea459a` (test/feat)
3. **Task 3: Expose aggregate preview/apply through owned-plan runtime** - `db1fb69` (feat with runtime regressions)

## Files Created/Modified

- `src/domains/plans/planImpactCommands.ts` and `src/domains/plans/index.ts` - Define and export canonical aggregate preview/apply contracts with deterministic preview/hash/replay boundaries.
- `src/platform/sqlite/repositories/ownedPlanRepository.ts` - Revalidates and applies the entire final owned-day composition in one receipt-bound transaction without writing workout history.
- `src/platform/sqlite/repositories/plansWorkoutRepository.ts` and `src/platform/sqlite/repositories/planImpactRepository.ts` - Exclude retired high-ordinal occurrences from active future-plan readers.
- `src/bootstrap/ownedPlanRuntime.tsx` - Adds dedicated aggregate runtime ports, duplicate suppression, and preview-bound retry identity.
- `src/domains/plans/planImpactCommands.test.ts`, `src/bootstrap/ownedPlanRuntime.test.ts`, and `tests/integration/plan-impact-replacement.test.ts` - Prove canonical eligibility, transactional/replay/stale/rollback behavior, byte-identical session history, and runtime retry/readback behavior.

## Decisions Made

- Aggregate write-back changes only the future owned-plan graph. The source session, exercises, sets, snapshots, lineage, undo state, and scheduled opportunity remain immutable facts.
- The existing `owned_plan_mutation_requests.operation` allowlist remains unchanged: this operation records as `save`, while the durable result body records `operation: session_exercise_edits`.
- Permanent deletion is forbidden by schema triggers, so retired occurrences remain on their source day with ordinals at or above `1000000`; active readers filter them out consistently.
- `OwnedPlanRuntimePort` does not own an in-memory plan cache. Its post-commit refresh contract is the next `loadPlan`, which reads the committed repository state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Runtime retry generated a fresh request ID and could bypass exact receipt replay**

- **Found during:** Task 3 pre-commit review
- **Issue:** Two sequential applies for one preview token created distinct UUID request IDs. The writer therefore could not return the immutable `already_committed` receipt after the first request had committed.
- **Fix:** Derived the runtime request ID from the preview token, which is already bound to the canonical source session, plan revision, and final composition.
- **Files modified:** `src/bootstrap/ownedPlanRuntime.tsx`, `src/bootstrap/ownedPlanRuntime.test.ts`
- **Verification:** Regression first failed with `first-uuid` and `second-uuid`; after the fix, the focused runtime suite, domain/integration gates, typecheck, lint, and full coverage gate passed.
- **Committed in:** `db1fb69`

**Total deviations:** 1 Rule 1 correctness fix required for deterministic receipt replay. No migration 0019 change, completion UI, dashboard/web surface, external API, or completed-workout mutation was introduced.

## Issues Encountered

- The plan listed `src/domains/plans/ownedPlan.ts` and `src/bootstrap/ownedPlanRuntime.test.tsx`, neither of which exists in this checkout. The actual owning files are `src/domains/plans/ownedPlanCommands.ts` and `src/bootstrap/ownedPlanRuntime.test.ts`; the implementation used the live repository structure.
- The full coverage gate emits the pre-existing Expo Go remote-notification warning while importing `expo-notifications`; the gate passed.

## Verification

- `node scripts/verify-phase9-task1-boundary.mjs downstream ...` - checked the Plan 09 boundary before Task 3 edits.
- `npm run test:unit -- --runInBand src/bootstrap/ownedPlanRuntime.test.ts src/domains/plans/planImpactCommands.test.ts` - 26 tests passed during the final focused gate.
- `npm run test:integration -- --runInBand tests/integration/plan-impact-replacement.test.ts tests/integration/session-exercise-editing.test.ts` - 41 tests passed.
- `npm run typecheck` - passed.
- `npm run lint` - boundary check passed (234 files).
- `npm run test:coverage -- --runInBand` - passed after the preview-bound retry correction.
- Focused pre-commit review - no remaining blocking findings; it surfaced and verified the retry-identity correction above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 09-09 can now present the explicit default-No post-finish choice. It must recompute this aggregate preview only after durable workout completion, pass its exact preview token/composition to the one aggregate apply port, retain Keep/Retry behavior on stale or failure, and never roll back or mutate completed session history.

## Self-Check: PASSED

---
*Phase: 09-in-workout-exercise-editing*
*Plan: 08*
*Completed: 2026-09-17*
