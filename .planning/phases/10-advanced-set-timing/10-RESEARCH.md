# Phase 10: Advanced Set Timing — Research

**Phase:** 10 — Advanced Set Timing  
**Requirement:** WORK-26  
**Research date:** 2026-09-15  
**Confidence:** High for the current reuse/persistence surface; medium for the exact new config/table shape, which is planner discretion.

## Verification anchor

WORK-26 requires both configurable per-rep cadence and fixed cluster intra-rests, at exercise/set scope, retained with plan/session and across background/process death. It also requires a separately reviewed versioned machine distinct from between-set rest, with SQLite authoritative and denied/failed audio unable to corrupt the session. [VERIFIED: .planning/REQUIREMENTS.md:48-48]

The Phase 10 roadmap criteria require cadence per repetition, cluster 3+3+3 as one recorded set, lifecycle-persistent configuration, advisory cues, and no rest regression/entanglement. [VERIFIED: .planning/ROADMAP.md:86-94]

## Standard stack and patterns

- Use a TypeScript, versioned discriminated-union state machine with literal version 1, monotonic revision, pure timestamp-derived remaining time, narrow transition errors, and exhaustive branch tests. Rest supplies idle, running, paused, and expired variants. [VERIFIED: src/domains/rest/restState.ts:1-29]
- Persist through the repository-owned SQLite writer with expected session/state revisions; refresh the trusted runtime read after commit. [VERIFIED: src/domains/rest/restCommands.ts:8-46] [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:3019-3076]
- Keep native effects at the bootstrap/UI boundary. Existing audio uses expo-audio and haptics uses expo-haptics, so no new native dependency is needed. [VERIFIED: src/platform/audio/expoRestCountdownCueAdapter.ts:1-43] [VERIFIED: src/platform/haptics/expoHapticsAdapter.ts:1-16]
- The checked-in manifest ends at migration 18; Phase 9 research reserves 19. Phase 10 must therefore be migration **20** once Phase 9 lands. [VERIFIED: src/platform/sqlite/migrations/index.ts:1-37] [VERIFIED: .planning/phases/09-in-workout-exercise-editing/09-RESEARCH.md:117-131]

## Per-decision notes

### D-01 — haptic, audio, or both

The reusable audio port is:

> export interface RestCountdownCuePort {  
>   playShortCue(): Promise<void>;  
>   playLongCue(): Promise<void>;  
> }

[VERIFIED: src/domains/rest/restCountdownCuePort.ts:1-4]

The existing haptics port is:

> export interface HapticsPort {  
>   committed(): Promise<void>;  
> }

[VERIFIED: src/domains/workout/hapticsPort.ts:1-3]

Reuse both ports/adapters, but do not use the haptic method named committed() for a cadence tick: it denotes a committed-set effect. Extend HapticsPort with a separate advisory cue method (for example cue()), implemented by the current Expo adapter; leave committed() unchanged. The audio port already supplies short/long cue actions, so per-rep can use short and a cluster boundary can use a planner-defined short/long convention. [ASSUMED]

Audio failure is already non-fatal: RestDock invokes its cue asynchronously and only changes local cue-failure presentation on rejection. [VERIFIED: src/ui/components/RestDock.tsx:295-330] Its fallback says, “The timer is still accurate. Keep watching the countdown.” [VERIFIED: src/ui/components/RestDock.tsx:359-365] The Expo haptic adapter catches native rejection too. [VERIFIED: src/platform/haptics/expoHapticsAdapter.ts:10-15]

### D-02 — semantics, config, and lifecycle

**Recommended configuration shape (planner discretion):** one validated AdvancedTimingConfigV1 value: off; per_rep with positive intervalMs (or BPM canonicalized at command boundary) plus cueChannels; or cluster with positive group sizes and positive intraRestMs plus channel choice. [ASSUMED]

Persist at both scopes: an exercise default and a set override. Resolve effective config as set override then exercise default, and copy it into the session snapshot at workout start. An in-progress session must read its copied snapshot, not later-edited plan rows. [ASSUMED]

There are two plan graphs: legacy plan_day_exercises / plan_warmup_sets / plan_working_set_targets and owned owned_plan_day_exercises / owned_plan_warmup_sets / owned_plan_working_set_targets. Workout start deliberately selects one graph. [VERIFIED: src/platform/sqlite/repositories/plansWorkoutRepository.ts:758-768] It creates session_exercises and session_sets from that graph. [VERIFIED: src/platform/sqlite/repositories/plansWorkoutRepository.ts:859-925]

Migration 20 should add timing config to both exercise-level occurrence tables and both warm-up/working-target tables, then snapshot resolved defaults/config into session_exercises/session_sets. JSON is acceptable only with json_valid plus domain validation; normalised columns are also viable. Phase-9 add/replace/write-back must create/copy those fields under its snapshot rules. [ASSUMED]

**Cluster is one recorded set:** session_sets has one row per session_exercise_id, set_kind, ordinal. [VERIFIED: src/platform/sqlite/migrations/0001_initial.ts:183-217] Complete-set validates then calls repository.completeSet; only a committed outcome causes invalidation, haptics, and effects. [VERIFIED: src/domains/workout/setCommands.ts:214-230] Cluster boundaries must advance only advanced timing and advisory cues. They must not insert session_sets, call addWorkingSet, or complete a set; the owner completes the existing single set normally. [ASSUMED]

Lifecycle state must use absolute anchors, never a decrementing JS counter. Rest derives running time from endsAtMs minus now and retains remaining duration when paused. [VERIFIED: src/domains/rest/restState.ts:48-57] Persist advanced started/next-boundary time, target set, resolved config, and rep/group progress. Reconcile from wall-clock time on foreground/relaunch; do not replay missed background cues. [ASSUMED]

### D-03 — parallel structure, separate machine

Rest is structural template only. Its transitions guard active/not-due/invalid states and increment revisions. [VERIFIED: src/domains/rest/restState.ts:59-210] Its tests cover timestamp derivation, pause/resume, adjustment, expiry, and invalid transition branches. [VERIFIED: src/domains/rest/restState.test.ts:27-213]

Create separate advancedTiming state/command/repository modules and a separate session_advanced_timing_states table. Suggested variants are idle/running/paused/expired, literal version 1, dedicated revision, sessionSetId, mode/config, absolute timing fields, and mode-specific progress such as nextRepIndex or nextClusterBoundaryIndex. [ASSUMED]

Use one advanced state row per session (one active advisory timer), with foreign keys to workout_sessions and nullable session_sets. Do not modify session_rest_states, its revision, next_set_id, rest commands, or rest notification effects. The one-row-per-session rest table proves the relevant storage precedent. [VERIFIED: src/platform/sqlite/migrations/0001_initial.ts:218-250] [ASSUMED]

Do not add cases to RestStateV1, RestRepository, RestCommandResult, runRestCommand, or rest notification reconciliation. Rest post-commit logic specifically enumerates active sessions, detects running rest, requests notification permission when needed, and triggers its lifecycle. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:3019-3049] Build an analogous but separate runAdvancedTimingCommand/reconciliation seam. No advanced notification permission request is justified by WORK-26. [ASSUMED]

### D-04 — advisory-only integrity

Existing ordering is the model: effects occur only after a committed set result, and each failure is caught. [VERIFIED: src/domains/workout/setCommands.ts:226-230] Advanced cue success/failure must never be input to set completion, undo, session facts, rest transition, rest notification, or plan mutation. [ASSUMED]

Persist timer transition first; invoke audio/haptics outside the transaction and catch errors locally. Do not use a failed cue to rollback/alter a recorded fact. Avoid durable pending_effects for frequent ticks unless a separate idempotent no-replay policy is proven: cadence delivery is advisory unlike rest notification reconciliation. [ASSUMED]

## State machine, persistence, and lifecycle contract

1. **Start:** validate expected session and advanced-timing revisions; resolve config from the session snapshot; transactionally persist only the advanced state. Reject off/invalid config, inactive target, or another active advanced timer. [ASSUMED]
2. **Run:** UI derives display/next boundary from durable timestamps and may retain a generation-keyed in-memory cue ledger. RestDock demonstrates a cue ledger tied to a timer generation. [VERIFIED: src/ui/components/RestDock.tsx:205-257] [ASSUMED]
3. **Pause/resume/skip/expire:** each command consumes expectedAdvancedTimingRevision and increments only that revision. Due transition must be conflict-safe/idempotent after restart. Rest command inputs show the expected revision shape. [VERIFIED: src/domains/rest/restCommands.ts:17-46] [ASSUMED]
4. **Reconcile:** during initialization/foreground and after advanced commands, query active advanced contexts, derive due progress from timestamp truth, issue revision-checked advance/expiry, then refresh trusted state. This parallels rest command -> reconcileAfterCommit -> trusted read. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:3052-3076] [ASSUMED]
5. **No rest coupling:** advanced expiry must never call expireRest, enqueue reconcile_rest_notification, or request notifications. Rest effects use the named reconcile_rest_notification type. [VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:1298-1320] [ASSUMED]

## Migration and backup graph

**Conclusion: migration 20 is required** after Phase 9 migration 19: it persists plan/session config and the new durable timing state. [VERIFIED: .planning/phases/09-in-workout-exercise-editing/09-RESEARCH.md:117-131] [ASSUMED]

Register 20 in the migration manifest, with verified columns/checks/foreign keys/indexes. [VERIFIED: src/platform/sqlite/migrations/index.ts:15-37] [ASSUMED]

Update portability in the same phase:

- append 20 to LOGICAL_BACKUP_SUPPORTED_SCHEMA_VERSIONS, currently exactly [15, 16, 17, 18]; [VERIFIED: src/domains/portability/restoreCommands.ts:146-146]
- add session_advanced_timing_states with session_id primary key to LOGICAL_BACKUP_TABLE_DEFINITIONS; [VERIFIED: src/domains/portability/backupContracts.ts:27-75]
- add session_id -> workout_sessions and session_set_id -> session_sets to LOGICAL_BACKUP_REFERENCE_DEFINITIONS, following rest; [VERIFIED: src/domains/portability/restoreCommands.ts:161-162]
- add the user-owned table filter; current logical backup includes session_rest_states: “1”. [VERIFIED: src/platform/sqlite/repositories/logicalBackupRepository.ts:110-118]

New config columns in existing plan/session tables are collected with their rows, but version-20 restore fixtures and schema validation must still change. [ASSUMED]

## Reusable assets and integration points

| Asset | Phase 10 use |
|---|---|
| src/domains/rest/restState.ts:1-210 | Copy version/revision/timestamp/transition discipline into a separate advanced module. |
| src/domains/rest/restState.test.ts:27-213 | Template for exhaustive state/invalid transition tests. |
| src/domains/rest/restCommands.ts:8-108 | Template for narrow revisioned command interfaces. |
| src/platform/sqlite/repositories/restRepository.ts:43-145 | Template for row/domain conversion and state serialization in a separate repository. |
| src/bootstrap/workoutAppRuntime.tsx:3019-3076 | Separate post-commit reconciliation and trusted refresh bridge. |
| src/ui/components/RestDock.tsx:162-330 | Timestamp display, AppState, cue ledger, and caught effect failure pattern. |
| src/domains/rest/restCountdownCuePort.ts:1-4; src/bootstrap/restCountdownCue.ts:1-14; src/platform/audio/expoRestCountdownCueAdapter.ts:23-43 | Existing audio port and platform boundary. |
| src/domains/workout/hapticsPort.ts:1-3; src/platform/haptics/expoHapticsAdapter.ts:10-16 | Extend with distinct advisory cue method; retain committed feedback. |
| src/platform/sqlite/repositories/plansWorkoutRepository.ts:758-768,859-925 | Copy plan config into immutable session snapshots. |
| src/domains/workout/setCommands.ts:214-230 | Keep commit-first/best-effort-effect ordering. |
| src/domains/portability/restoreCommands.ts:146-162 | Backup schema version/reference graph changes. |

UI should be a compact advanced indicator adjacent to the active set/overview, following RestDock display discipline but not replacing/expanding RestDock. RestDock accepts only running/paused rest state, so this must be a parallel surface. [VERIFIED: src/ui/components/RestDock.tsx:162-198] [ASSUMED]

## Pitfalls

1. Never put advanced timing in session_rest_states, share rest revision, or call rest expiry for cluster gaps; that risks rest notification reconciliation. [VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:1298-1320]
2. Never model cluster groups as multiple session_sets or run completeSet between groups. [VERIFIED: src/platform/sqlite/migrations/0001_initial.ts:183-217] [VERIFIED: src/domains/workout/setCommands.ts:214-230]
3. Never allow cue promises to change transaction outcome, recorded set/rest facts, session revision, or UI acknowledgement. [VERIFIED: src/ui/components/RestDock.tsx:321-329]
4. Never use a decrementing in-memory clock as durable truth. [VERIFIED: src/domains/rest/restState.ts:48-57]
5. Do not overload HapticsPort.committed() for a non-committed cue. [VERIFIED: src/domains/workout/hapticsPort.ts:1-3]
6. Add every new table/FK to explicit logical backup allowlist/reference definitions. [VERIFIED: src/domains/portability/backupContracts.ts:22-79] [VERIFIED: src/domains/portability/restoreCommands.ts:156-162]

## Tests, coverage, and Maestro

### Domain and component tests

- Add advancedTimingState tests for each mode/state, invalid times/config/group totals, active-start rejection, pause/resume, due/not-due transition, revision increments, and timestamp recovery. Follow rest's full branch matrix. [VERIFIED: src/domains/rest/restState.test.ts:27-213]
- Add command/repository tests for revision conflicts, target ownership/status, idempotent reconcile, and byte equality proving every advanced transition leaves session_sets recorded facts, workout session facts, and session_rest_states unchanged. [ASSUMED]
- Add indicator/cue tests for accessibility, channel choice, rotation/AppState, no duplicate cue, and rejected audio/haptic without set/rest mutation. RestDock tests provide AppState/component conventions. [VERIFIED: src/ui/__tests__/RestDock.test.tsx:31-105] [ASSUMED]

### SQLite and portability

Extend migrationsEffects host/device contracts with migration-20 checks, both plan graphs, session snapshot copies, state recovery, backup round-trip, and failure rollback. Phase 9 establishes host plus real Expo migrations-effects as persistence proof. [VERIFIED: .planning/phases/09-in-workout-exercise-editing/09-06-phase-verification-PLAN.md:61-71]

### Coverage

Register new advanced state/commands, migration 20, advanced repository, and changed portability modules in scripts/run-coverage-gate.mjs. It runs all Jest projects and demands exactly 100% statements/branches/functions/lines for registered integrity-critical files. [VERIFIED: scripts/run-coverage-gate.mjs:16-101] [VERIFIED: scripts/run-coverage-gate.mjs:122-180]

### Maestro

Create maestro/phase10/advanced-set-timing.yaml, scripts/run-phase10-maestro.mjs, package script, and fail-closed evidence tests following Phase 9's evidence pattern. [VERIFIED: .planning/phases/09-in-workout-exercise-editing/09-06-phase-verification-PLAN.md:50-57]

Native proof should configure exercise default plus set override; demonstrate per-rep and cluster indicator; rotate/background and force-stop/relaunch; prove resumed timing; complete exactly one cluster set; deny audio/notifications where testable; and prove RestDock remains independent. The rest flow supplies stopApp/relaunch/resume assertion conventions. [VERIFIED: maestro/lifecycle/rest-recovery.yaml:84-135] [ASSUMED]

## Planner-ready sequence

1. Define and fully test separate advanced config/state machine and cue-port extension.
2. Implement migration 20, both-plan-graph/session snapshot propagation, standalone repository/commands, and backup version/reference updates with host and Expo contracts.
3. Add runtime lifecycle reconciliation and compact indicator; wire best-effort effects strictly after durable timing transitions.
4. Add coverage registration plus fail-closed Phase 10 Maestro/evidence proof for process death and denied effects.

## Confidence

- **High:** rest-machine template, cue interfaces/failure precedent, runtime seam, backup obligations, coverage and Maestro conventions, and v20 numbering.
- **Medium:** exact config JSON/column/table field names and advanced progression states; these do not yet exist and remain planner discretion.
- **High:** D-03/D-04 require independent state/revisions/table and best-effort effects to protect rest/session facts.

## RESEARCH COMPLETE

