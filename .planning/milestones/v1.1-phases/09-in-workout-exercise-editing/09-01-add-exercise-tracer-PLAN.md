---
phase: 09-in-workout-exercise-editing
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/platform/sqlite/migrations/0019_session_exercise_editing.ts
  - src/platform/sqlite/migrations/index.ts
  - src/domains/portability/backupContracts.ts
  - src/domains/portability/restoreCommands.ts
  - src/domains/workout/activeWorkout.ts
  - src/domains/workout/sessionExerciseCommands.ts
  - src/domains/workout/sessionExerciseCommands.test.ts
  - src/domains/workout/index.ts
  - src/platform/sqlite/repositories/workoutRepository.ts
  - src/bootstrap/workoutAppRuntime.tsx
  - src/ui/screens/ActiveWorkoutScreen.tsx
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - src/testing/contracts/migrationsEffects.contract.ts
  - tests/sqlite-host/migrations-effects.test.ts
  - tests/sqlite-host/logicalBackupRepository.test.ts
  - tests/sqlite-host/logicalRestoreRepository.test.ts
  - tests/integration/session-exercise-editing.test.ts
  - scripts/run-coverage-gate.mjs
  - scripts/run-phase9-maestro.mjs
  - scripts/phase9-evidence-scripts.test.mjs
  - maestro/phase9/in-workout-exercise-editing.yaml
  - package.json
autonomous: false
requirements: [WORK-20, WORK-24]
must_haves:
  truths:
    - "D-03: committed session-exercise/session-set snapshots are append-only; completed or undo-referenced facts are never hard-deleted, and this one-way integrity contract is acknowledged before mutation code is written."
    - "D-04: Add is single-select, appends one library exercise at the session end with its metric-default target, one empty working set, explicit added origin, and null plan-target lineage."
    - "An add request is request-id/SHA-256/revision guarded, idempotent, and commits source rows, modified flag, receipt, pointers, and durable effects in one FIFO private-writer BEGIN IMMEDIATE transaction before UI acknowledgement."
    - "Migration 19 is additive, preserves ordinal as immutable creation/planned order, introduces display_ordinal, modified_from_plan, added origin, immutable edit receipts, and remains portable through logical backup/restore."
    - "The Phase 8 pinned Add exercise control opens the reviewed Material 3 library search, has exact accessible naming/focus/keyboard/non-color/48dp behavior, and the committed addition survives relaunch."
  artifacts:
    - {path: src/platform/sqlite/migrations/0019_session_exercise_editing.ts, provides: schema v19 editing metadata and immutable receipt storage}
    - {path: src/domains/workout/sessionExerciseCommands.ts, provides: validated add-exercise command boundary}
    - {path: tests/integration/session-exercise-editing.test.ts, provides: host-SQLite append-only and transaction proof}
    - {path: maestro/phase9/in-workout-exercise-editing.yaml, provides: native Add tracer and relaunch proof}
  key_links:
    - {from: src/ui/screens/ActiveWorkoutScreen.tsx, to: src/bootstrap/workoutAppRuntime.tsx, via: addExercise action; screens execute no SQL}
    - {from: src/bootstrap/workoutAppRuntime.tsx, to: src/platform/sqlite/repositories/workoutRepository.ts, via: sessionExerciseCommands request envelope}
    - {from: src/platform/sqlite/migrations/0019_session_exercise_editing.ts, to: src/domains/portability/restoreCommands.ts, via: schema version 19 and LOGICAL_BACKUP_REFERENCE_DEFINITIONS}
---

<objective>Ship the production-quality Phase 9 tracer: migrate safely to schema 19 and add one exercise end to end through the private writer, overview, real SQLite, and native lifecycle evidence.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/09-in-workout-exercise-editing/09-CONTEXT.md
@.planning/phases/09-in-workout-exercise-editing/09-RESEARCH.md
@.planning/phases/08-session-overview-navigation/08-04-SUMMARY.md

Implementation references: `src/platform/sqlite/serializedWriter.ts:27-84`, `src/platform/sqlite/sqliteKernel.ts:125-156`, `src/platform/sqlite/repositories/workoutRepository.ts:613-703,1014-1175,1527-1618`, `src/platform/sqlite/repositories/plansWorkoutRepository.ts:859-899,915-958`, `src/platform/sqlite/migrations/0017_workout_remove_receipts.ts:4-46,76-131`, `src/platform/sqlite/migrations/index.ts:15-37`, `src/domains/portability/restoreCommands.ts:146-220`, and `src/domains/portability/backupContracts.ts:22-79`.
</context>

<tasks>
<task type="checkpoint:decision" gate="blocking">
  <decision>Confirm D-03 as the one-way implementation boundary before creating any session-exercise mutation command.</decision>
  <context>D-03 is LOCKED and inviolable: committed snapshots are append-only; completed sets remain correct-or-undo; only a zero-completed, non-undo-referenced provisional exercise may be physically removed. This checkpoint records the one-way integrity contract rather than reopening it.</context>
  <options>
    <option id="uphold-d03"><name>Uphold D-03</name><pros>Preserves history, rebuildability, and the approved WORK-24/WORK-04 contract.</pros><cons>Remove and replace must degrade to skip whenever committed history exists.</cons></option>
    <option id="stop-plan"><name>Stop execution</name><pros>Avoids implementing code that cannot honor the locked contract.</pros><cons>Phase 9 remains unimplemented; weakening D-03 is not an allowed option.</cons></option>
  </options>
  <resume-signal>Select: uphold-d03 or stop-plan</resume-signal>
  <verify><manual>Record the selected resume signal in the execution checkpoint. Confirm Task 2 and every session-exercise mutation task remain blocked unless the recorded selection is exactly `uphold-d03`; `stop-plan` must end execution without mutation code.</manual></verify>
  <acceptance_criteria>The execution record explicitly acknowledges D-03 as the one-way boundary—committed snapshots are append-only, completed sets remain correct-or-undo, and physical removal is limited to zero-completed, non-undo-referenced provisional exercises—and no subsequent mutation task begins without `uphold-d03`.</acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add migration 19 and preserve logical-backup portability</name>
  <files>src/platform/sqlite/migrations/0019_session_exercise_editing.ts, src/platform/sqlite/migrations/index.ts, src/domains/portability/backupContracts.ts, src/domains/portability/restoreCommands.ts, src/testing/contracts/migrationsEffects.contract.ts, tests/sqlite-host/migrations-effects.test.ts, tests/sqlite-host/logicalBackupRepository.test.ts, tests/sqlite-host/logicalRestoreRepository.test.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>src/platform/sqlite/migrations/0017_workout_remove_receipts.ts, src/platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids.ts, src/platform/sqlite/migrations/index.ts, src/domains/portability/backupContracts.ts, src/domains/portability/restoreCommands.ts, tests/sqlite-host/migrations-effects.test.ts, tests/sqlite-host/logicalBackupRepository.test.ts, tests/sqlite-host/logicalRestoreRepository.test.ts, scripts/run-coverage-gate.mjs</read_first>
  <action>Create additive migration v19. Add `workout_sessions.modified_from_plan INTEGER NOT NULL DEFAULT 0 CHECK(... IN (0,1))`; `session_exercises.origin TEXT NOT NULL DEFAULT 'planned' CHECK(... IN ('planned','added'))`; and `session_exercises.display_ordinal INTEGER`, backfilled from immutable `ordinal`, non-null for the final schema, with a session/display ordering index. Do not rename or repurpose `ordinal`. Add `workout_session_exercise_edit_receipts` with request id/hash, operation, session/affected IDs, expected/result revisions, immutable result JSON and committed time plus update/delete prevention triggers, following migration 17. Register/export v19. Extend `LOGICAL_BACKUP_SUPPORTED_SCHEMA_VERSIONS` to include 19, add the receipt table to `LOGICAL_BACKUP_TABLE_DEFINITIONS`, and add every receipt FK to `LOGICAL_BACKUP_REFERENCE_DEFINITIONS` in the same task. Write host migration tests for upgrade/defaults/checks/index/triggers/injected rollback/FK integrity and exact backup-restore round-trip, and extend the real Expo `migrations-effects` contract with equivalent v19 cases. Register migration 19 in `scripts/run-coverage-gate.mjs` at 100%.</action>
  <verify><automated>npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts tests/sqlite-host/logicalBackupRepository.test.ts tests/sqlite-host/logicalRestoreRepository.test.ts &amp;&amp; npm run test:unit -- --runInBand src/testing/contracts/phase2Shared.contract.test.ts &amp;&amp; npm run typecheck</automated><native>npm run android:devtest:fresh -- --suite migrations-effects &amp;&amp; npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/migrations-effects/build.json</native></verify>
  <acceptance_criteria>D-03 and D-04 are schema-enforced without rewriting ordinal; schema version 19 is registered and supported; backup table/reference graphs include every new persisted table/reference; host and real Expo SQLite contracts prove migration, rollback, immutability triggers, and round-trip portability.</acceptance_criteria>
  <done>Schema 19 safely represents modified sessions, added origin, separate display order, and idempotency receipts without sacrificing backup portability.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Implement the idempotent add-exercise command through the private writer</name>
  <files>src/domains/workout/activeWorkout.ts, src/domains/workout/sessionExerciseCommands.ts, src/domains/workout/sessionExerciseCommands.test.ts, src/domains/workout/index.ts, src/platform/sqlite/repositories/workoutRepository.ts, src/bootstrap/workoutAppRuntime.tsx, tests/integration/session-exercise-editing.test.ts, src/testing/contracts/migrationsEffects.contract.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>src/domains/workout/setCommands.ts, src/domains/workout/activeWorkout.ts, src/platform/sqlite/repositories/workoutRepository.ts, src/platform/sqlite/repositories/plansWorkoutRepository.ts, src/platform/sqlite/serializedWriter.ts, src/platform/sqlite/sqliteKernel.ts, src/bootstrap/workoutAppRuntime.tsx</read_first>
  <action>Introduce `sessionExerciseCommands.ts` with bounded IDs, lowercase 64-character request SHA, nonnegative revision/time validation and an immutable envelope `{requestId, requestSha256, sessionId, expectedSessionRevision, occurredAtMs}`. Add repository/runtime `addExercise` using library ID plus caller-created session-exercise/set IDs. Inside one `kernel.write` transaction, replay an identical receipt as `already_committed`, reject hash/fact or revision conflicts, materialize the chosen library exercise's metric identity/default rest/default target scheme, append a planned-status exercise at the last `display_ordinal` with `origin='added'`, null plan-day lineage, append exactly one empty working set with null target lineage, set `modified_from_plan=1`, repair eligible active pointers if needed, increment session revision once, enqueue any durable reconciliation effects, and insert the receipt. Never mutate an existing snapshot column and never acknowledge UI/haptics until commit returns. Extend the active read model with origin/display order/modified flag. Add domain branch tests, host integration failure injection/rollback/replay/concurrency tests, before-versus-after byte equality for all preexisting exercise/set rows, and an equivalent real Expo SQLite command contract. Register the new integrity-critical command module in the coverage gate.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/workout/sessionExerciseCommands.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/session-exercise-editing.test.ts &amp;&amp; npm run test:coverage -- --runInBand</automated><native>npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/migrations-effects/build.json</native></verify>
  <acceptance_criteria>D-03 one-way integrity and D-04 add semantics are proven: one fresh exercise plus one set is appended, lineage is null, origin is added, previous rows are byte-identical, retries cannot duplicate, stale/hash conflicts apply nothing, and both host and real Expo SQLite exercise the private-writer transaction.</acceptance_criteria>
  <reversibility rating="one-way">D-03 is the locked row-level data-integrity contract. This task may only implement commands that preserve it; relaxing it later would corrupt committed history.</reversibility>
  <done>Add is an atomic, idempotent repository command with immutable snapshots and 100% integrity-critical coverage.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Wire the Add exercise overview tracer and native relaunch proof</name>
  <files>src/bootstrap/workoutAppRuntime.tsx, src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, scripts/run-phase9-maestro.mjs, scripts/phase9-evidence-scripts.test.mjs, maestro/phase9/in-workout-exercise-editing.yaml, package.json</files>
  <read_first>src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/screens/LibraryScreen.tsx, src/ui/screens/OwnedPlanEditorScreen.tsx, src/bootstrap/ownedPlanRuntime.tsx, maestro/phase7/plan-schedule-reorder.yaml, scripts/run-phase7-maestro.mjs</read_first>
  <action>Enable Phase 8's pinned `Add exercise` entry point. Present the shared Material 3 search/filter with every available exercise (not replacement's same-metric filter), single selection, and explicit confirmation. Generate stable IDs/request hash at runtime, invoke only the runtime command, show commit/conflict feedback, render a visible non-color `Added` cue, and preserve end-of-list placement. Component-test exact accessible name, accessibility state, visible focus, Enter/Space and D-pad activation, 48dp minimum target, non-color cue, 200% text and compact/medium/expanded layouts. Establish the Phase 9 runner/evidence contract and Maestro flow: start a planned workout, add a searched exercise, assert `Added`, one working set and end position, stop/relaunch without clearing state, resume, and assert persistence. The evidence script must fail closed when these assertions or manifest validation are absent.</action>
  <verify><automated>npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx &amp;&amp; node --test scripts/phase9-evidence-scripts.test.mjs &amp;&amp; npm run typecheck</automated><native>npm run test:maestro:phase9 -- --manifest artifacts/native/phase9/build.json</native></verify>
  <acceptance_criteria>D-04 and WORK-20 are observable end to end: single-select Add uses reviewed search, appends an accessible Added row with one set, and survives process relaunch; no screen contains SQL.</acceptance_criteria>
  <done>The tracer is production-complete from schema through native UI and lifecycle evidence.</done>
</task>
</tasks>

<verification>Run migration/backup host suites, the real Expo `migrations-effects` contract, command unit/integration tests, component tests, `npm run test:coverage -- --runInBand`, and the Phase 9 Maestro tracer. Inspect preexisting-row byte-equality assertions and the v19 logical backup reference graph.</verification>
<success_criteria>Roadmap criterion 1 is met and criterion 5's append-only foundation is established: Add creates only a fresh immutable added-origin snapshot and set, uses null lineage, persists across relaunch, and cannot bypass the serialized writer.</success_criteria>
<output>Create `.planning/phases/09-in-workout-exercise-editing/09-01-SUMMARY.md` when done.</output>
