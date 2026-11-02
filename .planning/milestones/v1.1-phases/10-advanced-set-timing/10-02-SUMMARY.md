---
phase: 10-advanced-set-timing
plan: 02
subsystem: advanced-timing, sqlite, workout-ui, native-evidence
tags: [cluster-timing, sqlite, advisory-cues, rest-independence, maestro]

requires:
  - phase: 10-01
    provides: advanced timing schema, per-rep state machine, runtime command seam, and Phase 10 evidence runner
provides:
  - cluster-ready and intra-set gap states in the separate advanced timing machine
  - SQLite persistence for cluster group progress and fixed intra-set gaps
  - active-workout cluster controls for 3+3+3 setup, begin gap, pause, resume, skip, and stop
  - source-level proof that cluster gaps leave set/rest/workout facts unchanged until one normal set completion
  - expanded Phase 10 Maestro contract for per-rep plus 3+3+3 cluster lifecycle recovery
affects: [phase-10-verification, advanced-timing, active-workout, native-evidence]

actuals:
  tokens: 9082
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - Cluster gaps are encoded inside session_advanced_timing_states using mode=cluster and progress_json currentGroupIndex/phase.
    - Active workout UI sends cluster gap commands through the advanced timing runtime only; set and rest commands remain separate.

key-files:
  created: []
  modified:
    - src/domains/advancedTiming/advancedTimingState.ts
    - src/domains/advancedTiming/advancedTimingCommands.ts
    - src/platform/sqlite/repositories/advancedTimingRepository.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - src/ui/components/AdvancedTimingIndicator.tsx
    - src/ui/screens/ActiveWorkoutScreen.tsx
    - tests/integration/advanced-timing.test.ts
    - maestro/phase10/advanced-set-timing.yaml
    - scripts/phase10-evidence-scripts.test.mjs

key-decisions:
  - "Cluster timing reuses the existing version-21 session_advanced_timing_states table rather than adding another migration; mode=cluster plus progress_json.currentGroupIndex/phase distinguishes ready, gap, and stopped states."
  - "Cluster gap begin/skip/pause/resume/reconcile/stop are advanced-only commands; they do not call set completion, add/remove set, undo, RestStateV1, or rest notification logic."
  - "The native Maestro flow is source-updated for the 3+3+3 branch, but manifest-bound Phase 10 device execution remains pending until artifacts/native/phase10/build.json exists."

patterns-established:
  - "One recorded set stays the data boundary for clusters: group boundaries are advisory state transitions, and completion still goes through the existing completeSet command once."
  - "Cluster lifecycle recovery derives from persisted absolute gap timestamps; missed background gaps advance state without replaying old cues."

requirements-completed: [WORK-26]

coverage:
  - id: D1
    description: "Cluster 3+3+3 timing produces two fixed intra-set gaps and finishes as one normally completed set row."
    requirement: WORK-26
    verification:
      - kind: unit
        ref: src/domains/advancedTiming/advancedTimingState.test.ts#runs, pauses, resumes, skips, and rejects final cluster gaps
        status: pass
      - kind: integration
        ref: tests/integration/advanced-timing.test.ts#persists cluster gaps as advanced-only state and preserves one recorded set
        status: pass
    human_judgment: false
  - id: D2
    description: "Cluster persistence and commands are contained in the advanced timing repository and leave rest/session/set facts byte-identical during gaps."
    requirement: WORK-26
    verification:
      - kind: unit
        ref: src/platform/sqlite/repositories/advancedTimingRepository.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/advanced-timing.test.ts#persists cluster gaps as advanced-only state and preserves one recorded set
        status: pass
      - kind: other
        ref: npm run test:coverage -- --runInBand
        status: pass
    human_judgment: false
  - id: D3
    description: "Active workout UI exposes cluster mode, group/gap inputs, start-rest, pause/resume, skip-gap, and stop controls while keeping RestDock independent."
    requirement: WORK-26
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/AdvancedTimingIndicator.test.tsx
        status: pass
      - kind: automated_ui
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#configures cluster timing and advances intra-set gaps without rest or set commands
        status: pass
    human_judgment: false
  - id: D4
    description: "Phase 10 Maestro source flow covers per-rep timing followed by 3+3+3 cluster timing across stop/relaunch and one normal completion."
    requirement: WORK-26
    verification:
      - kind: other
        ref: node --test scripts/phase10-evidence-scripts.test.mjs
        status: pass
    human_judgment: true
    rationale: "The flow is source-validated, but no artifacts/native/phase10/build.json exists yet for device execution in this slice."

duration: multi-session
completed: 2026-09-18
status: complete
---

# Phase 10 Plan 02: Cluster Mode Summary

**Cluster-set timing now runs through the separate advanced timing state machine, keeps 3+3+3 as one recorded set, and exposes an accessible active-workout control path.**

## Performance

- **Duration:** Multi-session execution
- **Completed:** 2026-09-18
- **Tasks:** 3
- **Files modified:** 16 source, test, and evidence files

## Accomplishments

- Added cluster-ready, running-gap, paused-gap, skipped-gap, reconciled-gap, and stopped-cluster variants to `AdvancedTimingStateV1` with exhaustive transition coverage.
- Persisted cluster progress in `session_advanced_timing_states` using the existing advanced-timing table and revision checks; no rest table, rest revision, set mutation, undo, or notification path is touched by cluster gaps.
- Proved the D-02/D-03/D-04 data boundary in integration: both cluster gaps leave `session_sets`, `session_rest_states`, session facts, undo facts, and pending-rest effects byte-identical, then one existing set row completes through the normal command.
- Added active-workout cluster controls for `3+3+3`, fixed gap seconds, `Start rest after group N`, pause/resume, skip-gap, stop, and visible `Cluster N of M` / `Intra-set rest · 00:20` status.
- Extended the Phase 10 Maestro source contract to cover per-rep timing, cluster selection, first gap skip, second gap force-stop/relaunch recovery, one normal set completion, and independent between-set RestDock display.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add cluster group and fixed-gap transitions to the advanced machine** - `b1d455e` (feat)
2. **Task 2: Persist cluster transitions and prove the one-record invariant** - `b1d455e` (feat)
3. **Task 3: Expose the cluster interaction and lifecycle flow** - `0328c6a` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified

- `src/domains/advancedTiming/advancedTimingState.ts` - Added cluster-ready/gap/stopped variants and transitions.
- `src/domains/advancedTiming/advancedTimingCommands.ts` - Exposed revision-checked begin/skip cluster gap commands.
- `src/platform/sqlite/repositories/advancedTimingRepository.ts` - Encoded cluster progress and state transitions in the standalone advanced timing row.
- `src/bootstrap/workoutAppRuntime.tsx` - Wired cluster gap methods through the runtime provider.
- `src/ui/components/AdvancedTimingIndicator.tsx` - Added per-rep/cluster mode selection and cluster controls/status.
- `src/ui/screens/ActiveWorkoutScreen.tsx` - Connected cluster configuration and gap actions without rest/set command coupling.
- `tests/integration/advanced-timing.test.ts` - Proved cluster gap transitions preserve protected workout/rest facts and complete one existing set normally.
- `maestro/phase10/advanced-set-timing.yaml` - Extended the native flow contract with the 3+3+3 cluster lifecycle.
- `scripts/phase10-evidence-scripts.test.mjs` - Made the source evidence contract fail closed on cluster flow omissions.

## Verification

- `npm run typecheck`
- `npm run test:unit -- --runInBand src/domains/advancedTiming/advancedTimingState.test.ts src/domains/advancedTiming/advancedTimingCommands.test.ts src/platform/sqlite/repositories/advancedTimingRepository.test.ts`
- `npm run test:integration -- --runInBand tests/integration/advanced-timing.test.ts`
- Targeted coverage probe for `advancedTimingState.ts`, `advancedTimingCommands.ts`, and `advancedTimingRepository.ts`: 100% statements, branches, and functions for all three.
- `node --test scripts/phase10-evidence-scripts.test.mjs`
- `npm run test:components -- --runInBand src/ui/__tests__/AdvancedTimingIndicator.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx`
- `npm run lint`
- `npm run check:boundaries`
- `npm run test:coverage -- --runInBand` - 152 suites and 2,749 tests passed; integrity-critical coverage gate reported 92 files at 100%.

## Native Evidence

- Not run in this slice: `artifacts/native/phase10/build.json` does not exist yet.
- The Maestro source flow and evidence contract now include the cluster path and remain ready for the final Phase 10 manifest-bound device run.

## Decisions Made

- Reused the v21 advanced timing table for cluster mode rather than adding a new migration.
- Kept cluster gaps as advisory advanced-state transitions only; normal set completion stays the single authoritative recorded-set mutation.
- Left audio/both cue-channel expansion to Plan 10-03, as planned.

## Deviations from Plan

None - plan executed exactly as written, except native device execution is deferred until a Phase 10 build manifest exists.

## Issues Encountered

- The local Phase 10 native check could not run because `artifacts/native/phase10/build.json` is absent. Source and evidence-contract checks pass.
- Existing test noise remains from React Native overlapping `act()` warnings and Expo notification warnings; no test failed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `10-03-configuration-and-cue-channels-PLAN.md`: cluster and per-rep runtime paths exist, the active workout UI exposes cluster interactions, and D-04 remains enforced by source tests.

---
*Phase: 10-advanced-set-timing*
*Completed: 2026-09-18*
