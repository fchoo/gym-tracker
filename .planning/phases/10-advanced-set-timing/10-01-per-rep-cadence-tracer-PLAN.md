---
phase: 10-advanced-set-timing
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/domains/advancedTiming/advancedTimingConfig.ts
  - src/domains/advancedTiming/advancedTimingConfig.test.ts
  - src/domains/advancedTiming/advancedTimingState.ts
  - src/domains/advancedTiming/advancedTimingState.test.ts
  - src/domains/advancedTiming/advancedTimingCommands.ts
  - src/domains/advancedTiming/advancedTimingCommands.test.ts
  - src/domains/advancedTiming/index.ts
  - src/platform/sqlite/migrations/0020_advanced_set_timing.ts
  - src/platform/sqlite/migrations/index.ts
  - src/platform/sqlite/repositories/advancedTimingRepository.ts
  - src/platform/sqlite/repositories/plansWorkoutRepository.ts
  - src/platform/sqlite/repositories/logicalBackupRepository.ts
  - src/domains/portability/backupContracts.ts
  - src/domains/portability/restoreCommands.ts
  - src/bootstrap/workoutAppRuntime.tsx
  - src/domains/workout/hapticsPort.ts
  - src/platform/haptics/expoHapticsAdapter.ts
  - src/platform/haptics/expoHapticsAdapter.test.ts
  - app/workout/[sessionId].tsx
  - src/ui/components/AdvancedTimingIndicator.tsx
  - src/ui/screens/ActiveWorkoutScreen.tsx
  - src/ui/__tests__/AdvancedTimingIndicator.test.tsx
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - src/testing/contracts/migrationsEffects.contract.ts
  - tests/sqlite-host/migrations-effects.test.ts
  - tests/sqlite-host/logicalBackupRepository.test.ts
  - tests/sqlite-host/logicalRestoreRepository.test.ts
  - tests/integration/advanced-timing.test.ts
  - scripts/run-coverage-gate.mjs
  - scripts/run-phase10-maestro.mjs
  - scripts/phase10-evidence-scripts.test.mjs
  - maestro/phase10/advanced-set-timing.yaml
  - package.json
autonomous: false
requirements: [WORK-26]
must_haves:
  truths:
    - "D-02: the tracer configures a per-repetition interval on one session set, emits one advisory haptic cadence cue per due repetition, and recovers timestamp-derived progress after backgrounding and process death."
    - "D-03: advanced timing is a separate version-1 state machine, command boundary, repository, revision, and session_advanced_timing_states row; no RestStateV1 variant, rest command, rest revision, session_rest_states row, or rest-notification effect is changed."
    - "D-04: timing transitions commit only advanced-timing state before best-effort cues; cue success/failure cannot acknowledge, create, alter, complete, undo, skip, or delete a session set or rest fact."
    - "Migration 20 carries exercise defaults, nullable set overrides, resolved immutable session snapshots, and the separate durable state across both legacy and owned plan graphs, with backup allowlist/reference/version updates in the same wave."
    - "The tracer is production-quality and user-visible: a per-set cadence can be enabled and started from the active workout, a small non-color indicator shows mode/progress, and force-stop/relaunch resumes from SQLite without replaying missed cues."
  artifacts:
    - {path: src/domains/advancedTiming/advancedTimingState.ts, provides: separate versioned per-rep timer state machine}
    - {path: src/platform/sqlite/migrations/0020_advanced_set_timing.ts, provides: schema v20 config snapshots and standalone advanced state}
    - {path: src/platform/sqlite/repositories/advancedTimingRepository.ts, provides: revision-checked private-writer transitions and lifecycle reconciliation}
    - {path: maestro/phase10/advanced-set-timing.yaml, provides: initial per-rep lifecycle tracer}
  key_links:
    - {from: plan exercise/set timing config, to: session_exercises/session_sets, via: plansWorkoutRepository snapshot resolution at workout start}
    - {from: src/bootstrap/workoutAppRuntime.tsx, to: src/platform/sqlite/repositories/advancedTimingRepository.ts, via: a separate runAdvancedTimingCommand/reconcile-after-commit path}
    - {from: committed advanced transition, to: HapticsPort.cue, via: post-commit best-effort effect outside SQLite transaction}
    - {from: session_advanced_timing_states, to: logical backup restore, via: table allowlist plus session/set reference definitions and schema version 20}
---

<objective>Ship the Phase 10 tracer end to end: schema 20, portable exercise/set configuration snapshots, a separate durable per-rep state machine, one haptic cue channel, a compact active-workout indicator, and lifecycle recovery without touching recorded set/rest facts.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/10-advanced-set-timing/10-CONTEXT.md
@.planning/phases/10-advanced-set-timing/10-RESEARCH.md
@.planning/phases/09-in-workout-exercise-editing/09-CONTEXT.md
@.planning/phases/09-in-workout-exercise-editing/09-01-add-exercise-tracer-PLAN.md

**Cross-phase dependency (depends_on: Phase 9).** Phase 9 is planned but not yet
executed, so its execution outputs do not exist on disk while Phase 10 is being
planned. Treat them as execution-time givens delivered by the depends_on phase,
NOT as files to read now: Phase 9 introduces schema **migration v19**
(`session_exercises`/`session_sets` snapshot columns: `added` origin,
`modified_from_plan`, immutable `ordinal` vs `display_ordinal`, idempotency
receipts) — see `09-01-add-exercise-tracer-PLAN.md` for its shape. Phase 10's
migration is the next version after whatever is highest at execution time (v19
from Phase 9 → Phase 10 adds **v20**).

Implementation anchors: `src/domains/rest/restState.ts:1-210` and `restState.test.ts:27-213` are structural templates only; `src/domains/rest/restCommands.ts:8-108` supplies the revisioned-command pattern; `src/platform/sqlite/repositories/restRepository.ts:43-197` supplies row conversion/persistence precedent; `src/platform/sqlite/repositories/plansWorkoutRepository.ts:758-768,859-925` selects the plan graph and creates session snapshots; `src/platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids.ts` + `src/platform/sqlite/migrations/index.ts` are the concrete migration-file + registration pattern (highest present now is `0018`); `src/bootstrap/workoutAppRuntime.tsx:3019-3076` is the reconcile-after-commit seam; and `src/domains/workout/setCommands.ts:214-230` is the commit-before-effects integrity precedent.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Define the versioned configuration and separate per-rep state machine</name>
  <files>src/domains/advancedTiming/advancedTimingConfig.ts, src/domains/advancedTiming/advancedTimingConfig.test.ts, src/domains/advancedTiming/advancedTimingState.ts, src/domains/advancedTiming/advancedTimingState.test.ts, src/domains/advancedTiming/advancedTimingCommands.ts, src/domains/advancedTiming/advancedTimingCommands.test.ts, src/domains/advancedTiming/index.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>src/domains/rest/restState.ts, src/domains/rest/restState.test.ts, src/domains/rest/restCommands.ts, src/domains/workout/setCommands.ts, scripts/run-coverage-gate.mjs</read_first>
  <action>Create a new `advancedTiming` domain; do not import or extend `RestStateV1`. Define and fully validate `AdvancedTimingConfigV1`: `off`; `per_rep` with safe positive `intervalMs` and `cueChannels` (`haptic|audio|both`); and the cluster config shape reserved for Plan 10-02 (`groupSizes` positive integers, at least two groups, bounded total, positive `intraRestMs`, channel choice). Define literal-version-1 advanced states with independent monotonic revision and target `sessionSetId`: idle, running per-rep (absolute `startedAtMs`/`nextBoundaryAtMs` and next repetition index), paused (remaining time/progress), and expired/stopped. Implement pure start, pause, resume, reconcile-due, and stop transitions. Reconcile derives the first future boundary from wall-clock truth, reports only currently crossed foreground boundaries, and never requests replay of boundaries missed while absent. Add exhaustive tests for every state/config/mode guard, invalid/safe-integer time, due/not-due, large clock jumps, revision increments, pause/resume, stop, and process-restart reconstruction. Register config/state/commands as integrity-critical in `scripts/run-coverage-gate.mjs` and keep each at exactly 100% statements/branches/functions/lines.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/advancedTiming/advancedTimingConfig.test.ts src/domains/advancedTiming/advancedTimingState.test.ts src/domains/advancedTiming/advancedTimingCommands.test.ts &amp;&amp; npm run test:coverage -- --runInBand</automated></verify>
  <acceptance_criteria>D-02 is encoded as a validated version-1 per-rep cadence with absolute timestamp recovery, and D-03 is explicit: advanced timing has its own types/transitions/revision and 100% branch coverage without any change to the rest domain.</acceptance_criteria>
  <reversibility rating="costly">D-03 requires a standalone machine. Entangling it with v1.0 rest would be difficult to reverse and is forbidden.</reversibility>
  <done>A fully covered independent per-rep machine can deterministically recover progress from persisted timestamps.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add migration 20, snapshot resolution, and portable backup support</name>
  <files>src/platform/sqlite/migrations/0020_advanced_set_timing.ts, src/platform/sqlite/migrations/index.ts, src/platform/sqlite/repositories/plansWorkoutRepository.ts, src/platform/sqlite/repositories/logicalBackupRepository.ts, src/domains/portability/backupContracts.ts, src/domains/portability/restoreCommands.ts, src/testing/contracts/migrationsEffects.contract.ts, tests/sqlite-host/migrations-effects.test.ts, tests/sqlite-host/logicalBackupRepository.test.ts, tests/sqlite-host/logicalRestoreRepository.test.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>src/platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids.ts, src/platform/sqlite/migrations/index.ts, src/platform/sqlite/repositories/plansWorkoutRepository.ts, src/domains/portability/backupContracts.ts, src/domains/portability/restoreCommands.ts, src/platform/sqlite/repositories/logicalBackupRepository.ts, src/testing/contracts/migrationsEffects.contract.ts, tests/sqlite-host/migrations-effects.test.ts</read_first>
  <action>Add and register the next migration after the highest present at execution time. Phase 9 (depends_on) introduces v19; Phase 10 adds `0020_advanced_set_timing.ts` (model the file + registration on the existing `0018_*` migration and `migrations/index.ts`; do NOT read Phase 9's v19 file — it is a depends_on given, not present at plan time). Store canonical validated JSON: a non-null version-1 exercise default (default `off`) on both `plan_day_exercises` and `owned_plan_day_exercises`; nullable set overrides on both legacy/owned warm-up and working-target tables; the copied exercise default on `session_exercises`; and nullable override plus non-null resolved config on `session_sets`. Add `json_valid`, version/mode, and bounded-value checks rather than accepting arbitrary JSON. Add standalone `session_advanced_timing_states` keyed by session with FK to `workout_sessions` and nullable target FK to `session_sets`, literal state version 1, independent revision, status/mode, canonical config/progress payload, and absolute timing columns/checks. At workout start resolve `set override ?? exercise default` and copy both provenance and resolved value into the session snapshot; an existing session never rereads later plan edits. In this same task update `LOGICAL_BACKUP_SUPPORTED_SCHEMA_VERSIONS` (currently `[15, 16, 17, 18]` in `restoreCommands.ts` at plan time) so it includes every version through the one this migration adds — append 19 if Phase 9 has not already, and append 20 — so restore stays compatible across the v1.1 chain; add the new table to `LOGICAL_BACKUP_TABLE_DEFINITIONS` and the logical-backup user-owned filter, and add both `session_id -> workout_sessions` and `session_set_id -> session_sets` references to `LOGICAL_BACKUP_REFERENCE_DEFINITIONS`. Add host tests for upgrade from the prior version, defaults, both plan graphs, precedence, immutable session copy, constraints/FKs/indexes, injected migration rollback, and exact backup/restore round trip at the new supported versions. Extend the real Expo `migrations-effects` contract with the same persistence cases. Register migration 20 and changed portability modules in the 100% gate.</action>
  <verify><automated>npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts tests/sqlite-host/logicalBackupRepository.test.ts tests/sqlite-host/logicalRestoreRepository.test.ts &amp;&amp; npm run typecheck &amp;&amp; npm run test:coverage -- --runInBand</automated><native>npm run android:devtest:fresh -- --suite migrations-effects &amp;&amp; npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/migrations-effects/build.json</native></verify>
  <acceptance_criteria>D-02 persists exercise defaults and set overrides into resolved session snapshots in both plan graphs; D-03 has a physically separate state table/revision; schema 20, its new table/FKs, backup reference graph, table filter, and supported-version entry ship together; host and real Expo SQLite prove the contract.</acceptance_criteria>
  <done>Schema 20 safely carries advanced timing through plan, session, process death, and logical backup without a portability gap.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Persist and reconcile per-rep transitions through the private writer</name>
  <files>src/domains/advancedTiming/advancedTimingCommands.ts, src/domains/advancedTiming/advancedTimingCommands.test.ts, src/platform/sqlite/repositories/advancedTimingRepository.ts, src/bootstrap/workoutAppRuntime.tsx, tests/integration/advanced-timing.test.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>src/platform/sqlite/repositories/restRepository.ts, src/platform/sqlite/serializedWriter.ts, src/platform/sqlite/sqliteKernel.ts, src/bootstrap/workoutAppRuntime.tsx, src/domains/workout/setCommands.ts, tests/integration/rest-lifecycle.test.ts</read_first>
  <action>Implement a dedicated repository and runtime command path for get/start/pause/resume/reconcile/stop. Validate active-session ownership, target-set ownership/status, resolved per-rep config, expected session revision, and expected advanced revision. Persist only advanced state in one private-writer `BEGIN IMMEDIATE` transaction; do not increment or update the rest revision/table and do not enqueue `reconcile_rest_notification`. Expose a separate `runAdvancedTimingCommand`; after commit, refresh the trusted read and run an advanced-only reconciliation on initialization, foreground, and post-advanced-command. Reconciliation uses absolute timestamps, advances idempotently with the expected advanced revision, skips replay of missed cues, and does not request notification permission. Add integration snapshots before/after every transition proving `session_sets`, `session_rest_states`, workout completion/status fields, undo snapshots, and pending rest effects are byte-identical. Cover conflicts, wrong target, inactive/completed set, failure injection rollback, concurrent reconcile, background clock jump, and cold repository reconstruction. Register repository/commands at 100%.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/advancedTiming/advancedTimingCommands.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/advanced-timing.test.ts &amp;&amp; npm run test:coverage -- --runInBand</automated><native>npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/migrations-effects/build.json</native></verify>
  <acceptance_criteria>D-03 is preserved by separate persistence and runtime seams; D-02 survives foreground and cold-start reconciliation from SQLite; every transition leaves recorded set/rest facts and rest effects byte-identical.</acceptance_criteria>
  <done>Per-rep timer progress is durable and conflict-safe without coupling to v1.0 rest.</done>
</task>

<task type="checkpoint:decision" gate="blocking">
  <decision>Confirm D-04's one-way advisory-only boundary before wiring any advanced timing cue to the recorded-workout UI path.</decision>
  <files>src/bootstrap/workoutAppRuntime.tsx, app/workout/[sessionId].tsx, src/ui/components/AdvancedTimingIndicator.tsx, src/ui/screens/ActiveWorkoutScreen.tsx</files>
  <context>D-04 is LOCKED, not an invitation to redesign it. Audio/haptic delivery is an optional post-commit effect. It may never be awaited as a prerequisite for an advanced transition, set completion, rest transition, UI acknowledgement of recorded facts, or session validity.</context>
  <options>
    <option id="uphold-d04"><name>Uphold D-04</name><pros>Preserves SQLite authority and protects session/rest facts from native-effect failure.</pros><cons>Cues can be missed and the UI must explicitly describe them as advisory.</cons></option>
    <option id="stop-plan"><name>Stop execution</name><pros>Avoids shipping code that violates the integrity contract.</pros><cons>Phase 10 remains incomplete; weakening D-04 is not an allowed option.</cons></option>
  </options>
  <resume-signal>Select: uphold-d04 or stop-plan</resume-signal>
  <action>Record exactly one resume signal. Continue to Task 5 only for `uphold-d04`; for `stop-plan`, end execution without changing the cue/UI files. Do not accept a third option or reinterpret the locked decision.</action>
  <verify><manual>Record the signal. Task 5 and all later cue wiring remain blocked unless it is exactly `uphold-d04`; `stop-plan` ends execution without cue-path changes.</manual></verify>
  <acceptance_criteria>The execution record explicitly acknowledges D-04: cues are advisory, native-effect failure cannot roll back or redefine committed facts, and no cue-wiring task begins without `uphold-d04`.</acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 5: Wire the one-channel per-rep UI tracer after commit</name>
  <files>src/domains/workout/hapticsPort.ts, src/platform/haptics/expoHapticsAdapter.ts, src/platform/haptics/expoHapticsAdapter.test.ts, src/bootstrap/workoutAppRuntime.tsx, app/workout/[sessionId].tsx, src/ui/components/AdvancedTimingIndicator.tsx, src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/__tests__/AdvancedTimingIndicator.test.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, scripts/run-phase10-maestro.mjs, scripts/phase10-evidence-scripts.test.mjs, maestro/phase10/advanced-set-timing.yaml, package.json</files>
  <read_first>src/domains/workout/hapticsPort.ts, src/platform/haptics/expoHapticsAdapter.ts, src/ui/components/RestDock.tsx, src/ui/__tests__/RestDock.test.tsx, src/ui/screens/ActiveWorkoutScreen.tsx, maestro/lifecycle/rest-recovery.yaml</read_first>
  <action>Extend `HapticsPort` with a distinctly named advisory `cue()` method while leaving `committed()` semantics unchanged; implement it with the current Expo adapter and catch native rejection. Add the narrow tracer UI: from the active set's overflow/config action select per-rep, enter a bounded interval, choose haptic for this slice, persist the set override through the repository, and start/stop/pause/resume via runtime commands. Render a compact `AdvancedTimingIndicator` adjacent to the active set without replacing or changing `RestDock`; show literal `Per-rep cadence`, repetition index and time to next cue. A generation-keyed foreground ledger invokes `haptics.cue()` only after the due advanced transition is durable, never backfills after background/relaunch, and catches rejection locally. Controls need exact accessible names, visible focus, Enter/Space/D-pad activation, non-color text/icon status, and >=48dp targets. Add component tests for failure, no duplicate/replay, AppState, focus/target size, and evidence that set completion remains available regardless of timer state. Create the initial fail-closed Phase 10 runner/manifest and native flow: configure a set, observe two cadence ticks/indicator advances, background/foreground, force-stop/relaunch, observe timestamp-reconciled progress with no replay, complete the set normally, and verify the existing RestDock path still behaves independently.</action>
  <verify><automated>npm run test:unit -- --runInBand src/platform/haptics/expoHapticsAdapter.test.ts &amp;&amp; npm run test:components -- --runInBand src/ui/__tests__/AdvancedTimingIndicator.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx &amp;&amp; node --test scripts/phase10-evidence-scripts.test.mjs &amp;&amp; npm run typecheck</automated><native>npm run android:devtest:fresh -- --suite phase10 &amp;&amp; npm run test:maestro:phase10 -- --manifest artifacts/native/phase10/build.json</native></verify>
  <acceptance_criteria>D-02's per-rep tracer works through process death; D-03 leaves RestDock/rest state unchanged; D-04 is upheld because haptic denial/rejection is caught after durable advanced progress and cannot block or mutate the one normally completed session set.</acceptance_criteria>
  <reversibility rating="one-way">D-04 is the locked data-integrity contract. This wiring may only deliver best-effort cues after durable transitions; relaxing that ordering is forbidden.</reversibility>
  <done>The verified vertical tracer configures, runs, cues, recovers, and completes one per-rep set without granting cues authority over facts.</done>
</task>
</tasks>

<verification>Run the domain/command 100% gate, v20 host and real Expo SQLite contracts, logical backup/restore round trip, integration byte-equality assertions, and the focused per-rep background/force-stop/relaunch Maestro tracer before beginning Plan 10-02.</verification>
<success_criteria>Roadmap criteria 2-4 are proven for the per-rep tracer, and criterion 1 is proven for per-rep cadence: one haptic cue per foreground due repetition, durable per-set config, process-death recovery, advisory-only effects, and zero rest-machine changes.</success_criteria>
<output>Create `.planning/phases/10-advanced-set-timing/10-01-SUMMARY.md` when done.</output>
