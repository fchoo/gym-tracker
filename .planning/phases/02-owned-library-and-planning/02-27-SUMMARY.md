---
phase: 02-owned-library-and-planning
plan: 27
subsystem: workout-runtime
tags: [sqlite, migrations, metric-identity, active-workout, correction, react-native, jest]
requires:
  - phase: 02-owned-library-and-planning
    provides: Versioned metric identities, current migration manifest, and active-workout source facts
provides:
  - Current-schema Add warm-up, Copy warm-up, and Add working set persistence with exact metric identity
  - Narrow revision-checked in-progress completed-working-set correction that preserves unrelated workout source facts
  - Runtime mutation results with committed row identity and bounded retryability information for the later UI plan
affects: [plan-02-28, active-workout-ui, phase-03-history, phase-02-34-native-evidence]
actuals:
  tokens: 13085
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns:
    - Run set-command integration tests through the complete exported migration manifest, never an early migration alone.
    - Treat the committed SQLite view and inserted set ID as authoritative runtime mutation output; derived refresh failures cannot negate a committed write.
    - Map mutation failures to bounded typed data while preserving the original typed rejection for the caller.
key-files:
  created: []
  modified:
    - src/platform/sqlite/repositories/workoutRepository.ts
    - src/domains/workout/activeWorkout.ts
    - src/domains/workout/setCommands.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - tests/integration/complete-set.test.ts
key-decisions:
  - Inserted session sets always copy the exact profile, contract version, and exercise metric generation from the authoritative source snapshot.
  - A completed-set correction is limited to one completed working set in an in-progress workout, revision-checks both session and set, and never restores an undo snapshot or changes active/rest state.
  - Correction request identity is validated but not persisted because no compatible receipt schema exists; the expected session/set revision pair rejects stale replay deterministically.
  - Runtime add/copy/correction results carry committedSetId so Plan 02-28 can focus and reveal the exact saved row.
patterns-established:
  - Mutation tests prove both transaction rollback and invariance of later progress, active pointer, rest revision, immutable snapshots, and unrelated rows.
  - Runtime mutation errors expose only bounded AppError data for UI retry decisions and retain the original typed error for control flow.
requirements-completed: [LIB-07, LIB-08, LIB-11, LIB-12]
coverage:
  - id: D1
    description: Add warm-up, Copy warm-up, and Add working set persist compatible owned targets and complete versioned metric identity under the full migration manifest.
    requirement: LIB-11
    verification:
      - kind: integration
        ref: tests/integration/complete-set.test.ts#Plan 01-08 warm-up commands and Plan 01-10 working-set structure commands
        status: pass
    human_judgment: false
  - id: D2
    description: A selected completed working set can be corrected during an active workout without moving later progress, active pointer, rest state, snapshots, or unrelated rows.
    requirement: LIB-12
    verification:
      - kind: integration
        ref: tests/integration/complete-set.test.ts#Plan 02-27 completed working-set correction
        status: pass
      - kind: unit
        ref: src/domains/workout/setCommands.test.ts#Plan 02-27 completed working-set correction
        status: pass
    human_judgment: false
  - id: D3
    description: Runtime exposes correction and returns committed identities for add/copy/correction, maps retryability without raw storage details, and does not refresh before a rejected write.
    requirement: LIB-08
    verification:
      - kind: unit
        ref: src/bootstrap/workoutAppRuntime.test.tsx#returns committed identities for insertions and forwards completed-set corrections
        status: pass
      - kind: unit
        ref: src/bootstrap/workoutAppRuntime.test.tsx#propagates typed mutation rejection without refreshing before commit
        status: pass
    human_judgment: false
duration: 25min
completed: 2026-08-22
status: complete
---

# Phase 02 Plan 27: Current-Schema Set Insertion and Active Correction Summary

**Current-schema set insertion now saves complete metric identity, while active workouts support narrow revision-checked completed-working-set corrections and return committed row identities to the runtime.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-22T08:20:15Z
- **Completed:** 2026-08-22T08:45:37Z
- **Tasks:** 3/3
- **Files modified:** 8

## Accomplishments

- Replaced the migration-0001-only false proof with the complete exported migration manifest and repaired all three add/copy insert paths for the current metric-identity schema.
- Added a single-row completed-working-set correction transaction guarded by authoritative `in_progress` status and exact session/set revisions, without extending the legacy whole-session Undo mechanism.
- Proved correction conflicts, final-state rejection, incompatible identity rejection, injected-write rollback, and source-fact invariants for later progress, pointer, rest, snapshots, and unrelated rows.
- Exposed add/copy/correction through one runtime path with `committedSetId`, post-commit refresh semantics, and bounded retryable/non-retryable failure metadata for Plan 02-28.

## Task Commits

Each task was committed atomically:

1. **Task 1: Reproduce and repair all current-schema set insertion paths** - `6f5dfa2` (feat)
2. **Task 2: Add a narrow revision-checked completed-set correction transaction** - `739efb8` (feat)
3. **Task 3: Expose committed add/copy/correction outcomes through the runtime** - `648634e` (feat)

## Files Created/Modified

- `src/platform/sqlite/repositories/workoutRepository.ts` - Copies full metric identity into add/copy rows and performs the selected completed-working-set correction transaction.
- `src/domains/workout/activeWorkout.ts` - Defines the typed correction input and repository port.
- `src/domains/workout/setCommands.ts` - Validates correction identity and replacement observations before the repository is called.
- `src/domains/workout/index.ts` - Re-exports the correction command and type.
- `src/bootstrap/workoutAppRuntime.tsx` - Returns committed set identities, exposes correction, refreshes only after a successful write, and retains bounded mutation-failure metadata.
- `src/bootstrap/workoutAppRuntime.test.tsx` - Covers runtime forwarding, committed identities, rejection propagation, refresh ordering, and retryability mapping.
- `src/domains/workout/setCommands.test.ts` - Covers valid and invalid completed-set correction command inputs.
- `tests/integration/complete-set.test.ts` - Uses the full migration manifest and proves current-schema persistence, correction conflicts, rollback, and invariants.

## Decisions Made

- Complete metric identity is `(profile, contractVersion, exerciseMetricGeneration)` and must be persisted on every inserted `session_sets` row.
- Correction stays active-session-only and updates only the selected completed working-set observations, draft timestamp, and revisions; final-history editing/audit remains Phase 3.
- No correction-receipt schema was introduced: blank request identities are rejected, and stale retries deterministically conflict through the expected session/set revision pair. Adding a receipt table would have exceeded this plan's schema scope.
- Runtime consumers receive the committed row ID alongside the committed view, allowing Plan 02-28 to implement focus/reveal and retry presentation without owning persistence logic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Full-schema fixture exposed missing identity columns in adjacent fixture setup**
- **Found during:** Task 1
- **Issue:** Moving the integration fixture to the current manifest also made fixture rows for `session_exercises` and `progression_recommendations` violate newly-required identity columns.
- **Fix:** Supplied the compatible complete identity fields in the fixture while preserving the production regression proof.
- **Files modified:** `tests/integration/complete-set.test.ts`
- **Verification:** `npm run test:integration -- --runInBand tests/integration/complete-set.test.ts`
- **Committed in:** `6f5dfa2`

---

**Total deviations:** 1 auto-fixed (Rule 1 bug)
**Impact on plan:** Required to make the full-current-schema test fixture valid; no product scope was added.

## Issues Encountered

- The initial Task 3 RED tests correctly failed because the runtime had neither the correction capability nor an explicit committed identity contract. The completed runtime implementation and focused tests now pass.
- No package installation, external authentication, or physical-device verification was needed. Plan 02-34 owns fresh APK evidence after these packaged source changes.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02-28 can consume `reviseCompletedSet` and `committedSetId` to implement completed-set editing, visible retry, reveal, and focus without changing the repository contract.
- The source changes invalidate earlier APK evidence; Plan 02-34 remains responsible for a new exact-HEAD build and physical/device verification.

## Self-Check: PASSED

- Confirmed all eight task files and this summary exist on disk.
- Confirmed task commits `6f5dfa2`, `739efb8`, and `648634e` exist in Git history and each has the required `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>` trailer.
- Confirmed the plan diff contains no tracked file deletions, and `.gsd/dispatch-isolation-sentinel.json` remains unstaged with SHA-256 `180d0b3d90e0e02f74556b3762c2e7f6a25463b8244cee5e0d4b167cbf44523c`.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-22*
