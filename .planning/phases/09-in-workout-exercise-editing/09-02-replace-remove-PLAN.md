---
phase: 09-in-workout-exercise-editing
plan: 02
type: execute
wave: 2
depends_on: [09-01]
files_modified:
  - src/platform/sqlite/migrations/0020_session_exercise_edit_receipts.ts
  - src/platform/sqlite/migrations/index.ts
  - src/domains/portability/backupContracts.ts
  - src/domains/portability/restoreCommands.ts
  - src/domains/workout/activeWorkout.ts
  - src/domains/workout/sessionExerciseCommands.ts
  - src/domains/workout/sessionExerciseCommands.test.ts
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
  - maestro/phase9/in-workout-exercise-editing.yaml
autonomous: true
requirements: [WORK-21, WORK-22, WORK-24]
must_haves:
  truths:
    - "D-03: Replace and Remove never rewrite or delete completed/undo-referenced facts; only provisional zero-completed rows may be physically removed."
    - "D-05: Replace removes a zero-completed provisional original and appends a fresh replacement at its display position, but with any completed set retains the original as skipped and appends the replacement."
    - "D-06: Remove hard-deletes only zero-completed provisional work; otherwise it marks the exercise and noncompleted children skipped while preserving completed history."
    - "Migration 20 forward-rebuilds the immutable exercise-edit receipt ledger: every v19 add receipt survives unchanged, add/replace/remove replay records use scalar exercise evidence rather than an entity FK that can block permitted provisional deletion, and the logical-backup graph remains portable through schema 20."
    - "Both commands use request-id/SHA-256/session+exercise revisions and one FIFO private-writer transaction including pointers, rest reconciliation, modified flag, the v20 receipt, and effects."
    - "Overflow controls explain delete-versus-skip behavior and satisfy accessible name, focus, keyboard/D-pad, non-color, and 48dp requirements."
  artifacts:
    - {path: src/platform/sqlite/migrations/0020_session_exercise_edit_receipts.ts, provides: forward-only portable receipt-ledger rebuild that preserves v19 add receipts while permitting provisional exercise deletion}
    - {path: src/domains/workout/sessionExerciseCommands.ts, provides: guarded replace/remove commands}
    - {path: tests/integration/session-exercise-editing.test.ts, provides: destructive-boundary and rollback proof}
    - {path: src/ui/screens/ActiveWorkoutScreen.tsx, provides: replacement picker and conditional removal confirmation}
  key_links:
    - {from: migration 0020 receipt ledger, to: replace/remove replay, via: scalar subject/replacement evidence that survives deleted provisional rows}
    - {from: exercise overflow menu, to: sessionExerciseCommands, via: runtime actions after confirmation}
    - {from: workoutRepository edit transaction, to: active/rest pointers, via: next eligible working set by display order}
---

<objective>Expand the verified Add tracer with safe whole-exercise Replace and Remove, including the completed-history skip boundary and lifecycle-visible overview behavior.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/09-in-workout-exercise-editing/09-CONTEXT.md
@.planning/phases/09-in-workout-exercise-editing/09-RESEARCH.md
@.planning/phases/09-in-workout-exercise-editing/09-01-SUMMARY.md

Implementation references: `src/platform/sqlite/repositories/workoutRepository.ts:1014-1175`, especially completed/undo guards at `1048-1067` and conditional deletion at `1117-1129`; `src/platform/sqlite/repositories/workoutOutcomeRepository.ts:2194-2279` for atomic skip/pointer/effect behavior; and `src/bootstrap/workoutAppRuntime.tsx:3330-3377` for post-commit acknowledgement.

**Blocking replan correction.** Migration `0019_session_exercise_editing.ts` is shipped and
immutable. Its receipt table accepts only `add_exercise` and holds a
`session_exercise_id REFERENCES session_exercises(id) ON DELETE RESTRICT` foreign key,
which makes D-05/D-06's permitted zero-completed provisional delete impossible.
Task 1 therefore owns additive migration `0020_session_exercise_edit_receipts.ts`:
rebuild the table forward-only, copy every legacy v19 add receipt, preserve immutable
update/delete triggers, and store scalar subject/replacement IDs instead of an entity FK.
No task may edit migration 19 or introduce a second receipt table that leaves its
restrictive FK in force.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Forward-rebuild the receipt ledger before any destructive exercise command</name>
  <files>src/platform/sqlite/migrations/0020_session_exercise_edit_receipts.ts, src/platform/sqlite/migrations/index.ts, src/domains/portability/backupContracts.ts, src/domains/portability/restoreCommands.ts, src/testing/contracts/migrationsEffects.contract.ts, tests/sqlite-host/migrations-effects.test.ts, tests/sqlite-host/logicalBackupRepository.test.ts, tests/sqlite-host/logicalRestoreRepository.test.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>src/platform/sqlite/migrations/0017_workout_remove_receipts.ts, src/platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids.ts, src/platform/sqlite/migrations/0019_session_exercise_editing.ts, src/platform/sqlite/migrations/index.ts, src/domains/portability/backupContracts.ts, src/domains/portability/restoreCommands.ts, src/testing/contracts/migrationsEffects.contract.ts, tests/sqlite-host/migrations-effects.test.ts, tests/sqlite-host/logicalBackupRepository.test.ts, tests/sqlite-host/logicalRestoreRepository.test.ts</read_first>
  <action>RED first. Add and register forward-only migration `0020_session_exercise_edit_receipts.ts`; never alter 0019. Following migration 18's rebuild pattern, drop only 0019's receipt immutability triggers, rename its table, create the replacement strict table under the same public name, copy every legacy add row, drop the legacy table, and recreate reject-all update/delete triggers. The new ledger accepts `add_exercise`, `replace_exercise`, and `remove_exercise`; keeps request ID, SHA-256, session ID, expected/result revision, canonical `result_json`, and commit time; replaces the receipt-to-`session_exercises` FK with bounded scalar `subject_session_exercise_id` and nullable `replacement_session_exercise_id` evidence; constrains replacement ID to be non-null only for replace; retains only the session FK; and indexes session receipt inspection. Extend the logical backup table shape, user-owned source filter, reference graph by removing the obsolete receipt-to-exercise edge, and supported schemas through 20 in the same wave. Add host and Expo contracts for v19-to-v20 legacy receipt preservation, exact columns/checks/indexes/FKs/triggers, migration failure at every rename/create/copy/drop/trigger stage, portable archive/restore where a receipt names a deleted subject ID, and exact rollback. Register migration 20 plus changed portability modules in the 100% gate.</action>
  <verify><automated>npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts tests/sqlite-host/logicalBackupRepository.test.ts tests/sqlite-host/logicalRestoreRepository.test.ts &amp;&amp; npm run typecheck &amp;&amp; npm run test:coverage -- --runInBand</automated><native>npm run android:devtest:fresh -- --suite migrations-effects &amp;&amp; npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/migrations-effects/build.json</native></verify>
  <acceptance_criteria>Schema 20 preserves every v19 add receipt byte-for-byte in its legacy fields, has no receipt FK to `session_exercises` or `session_sets`, retains only the intended session edge and immutable triggers, accepts supported schemas through 20, and passes host plus real Expo migration/backup rollback contracts.</acceptance_criteria>
  <done>A portable immutable receipt ledger can retain evidence for a later-deleted provisional exercise without changing migration 19.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement receipt-guarded replace and remove at the immutable-history boundary</name>
  <files>src/domains/workout/activeWorkout.ts, src/domains/workout/sessionExerciseCommands.ts, src/domains/workout/sessionExerciseCommands.test.ts, src/platform/sqlite/repositories/workoutRepository.ts, tests/integration/session-exercise-editing.test.ts, src/testing/contracts/migrationsEffects.contract.ts</files>
  <read_first>src/domains/workout/activeWorkout.ts, src/domains/workout/sessionExerciseCommands.ts, src/domains/workout/sessionExerciseCommands.test.ts, src/platform/sqlite/repositories/workoutRepository.ts, src/platform/sqlite/repositories/workoutOutcomeRepository.ts, src/domains/workout/setCommands.ts, src/domains/workout/undoCompletedSet.ts, tests/integration/session-exercise-editing.test.ts</read_first>
  <action>RED first. Add bounded validated `replaceExercise` and `removeExercise` inputs/results under the existing request-id/SHA-256/session-revision envelope, and make the repository read/write only the v20 receipt shape. Before any mutation, compare all persisted receipt facts and canonical result JSON: a byte-identical retry returns `already_committed`; changed SHA, operation, subject/replacement identity, expected revision, or command facts conflicts. In one FIFO private-writer transaction inspect every child working set and `session_undo_snapshots` reference. Replace: with zero completed and no undo reference, stage a fresh library-derived null-lineage replacement at the original `display_ordinal`, clear/repair active/rest pointers deliberately, delete only provisional children/original, set modified, increment session revision once, enqueue required effects, and persist scalar receipt evidence; otherwise mark original and only noncompleted children skipped, keep completed/undo rows byte-identical, append the fresh replacement, and persist the same atomic outcome. Remove: physically delete only zero-completed/no-undo provisional children/original; otherwise skip the exercise plus noncompleted children and return `skipped_history_preserved`. Select next eligible work by `display_ordinal` with a stable ID fallback, never immutable `ordinal`; ensure skipped work cannot become the current fallback. Cover add-then-remove of a provisional exercise, provisional replace, mixed completed and undo-only branches, replay/mismatch/stale revision, active/last/rest ownership, concurrent FIFO ordering, fault injection before/after each delete/update/receipt stage, rollback equality, and byte equality for completed/undo-referenced facts. Extend the named real Expo command contract after Task 1's schema migration is available.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/workout/sessionExerciseCommands.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/session-exercise-editing.test.ts &amp;&amp; npm run test:coverage -- --runInBand</automated><native>npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/migrations-effects/build.json</native></verify>
  <acceptance_criteria>D-03/D-05/D-06 are proven from durable child/undo facts: the sole physical-delete branch leaves both legacy add and new replace/remove receipts replayable, every history-bearing branch retains completed/undo rows byte-identical apart from explicitly allowed skipped status, and every conflict or injected failure leaves rows, pointers, revision, effects, and receipts unchanged.</acceptance_criteria>
  <done>Replace and Remove are idempotent, atomic, display-order-correct, and history-safe under the v20 receipt ledger.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Enable Replace and Remove from the exercise overflow</name>
  <files>src/bootstrap/workoutAppRuntime.tsx, src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, maestro/phase9/in-workout-exercise-editing.yaml</files>
  <read_first>src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/screens/ExerciseReplacementScreen.tsx, src/ui/screens/LibraryScreen.tsx, src/bootstrap/workoutAppRuntime.tsx, maestro/phase9/in-workout-exercise-editing.yaml</read_first>
  <action>Wire per-exercise overview overflow controls to the committed Task 2 runtime commands; do not assume a Phase 8 stub exists. Replace uses the reviewed single-select library picker and the replacement's own default scheme. Removal confirmation says exactly `Remove exercise` for zero-completed work and explicitly says completed sets will be retained and the exercise marked `Skipped` when history exists. Render skipped originals and retained completed sets with text/icon non-color cues; expose committed outcomes and retry-safe conflict messaging only after the runtime receives the authoritative result. Test exact accessible menu/action names, visible focus, Enter/Space/D-pad activation, disabled/in-flight states, 48dp targets, and that no screen runs SQL. Extend Maestro to replace before completion (original absent, replacement at the same display position), then complete a set and exercise both replacement/removal history branches, asserting `Skipped`, retained completed observation, correct remaining progress, receipt-backed relaunch persistence, and no stale fallback to skipped work.</action>
  <verify><automated>npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx &amp;&amp; npm run typecheck</automated><native>npm run test:maestro:phase9 -- --manifest artifacts/native/phase9/build.json</native></verify>
  <acceptance_criteria>D-05 and D-06 are explicit and accessible in the UI; lifecycle evidence distinguishes provisional delete from history-preserving skip and proves retained completion after relaunch.</acceptance_criteria>
  <done>Owner can safely replace or remove any session exercise from the overview.</done>
</task>
</tasks>

<verification>Run command unit tests, host integration and real Expo SQLite contracts, component accessibility tests, coverage, and the Phase 9 Maestro replace/remove branches. Confirm completed and undo-referenced rows remain byte-identical across every operation.</verification>
<success_criteria>Roadmap criteria 2 and 3 pass: replace and remove preserve committed history, only provisional work is deleted, progress/pointers remain correct, and the behavior survives relaunch.</success_criteria>
<threat_model>
  <threat>
    <surface>SQLite exercise-edit receipt migration and logical backup/restore</surface>
    <risk>Receipt loss or a stale entity foreign key can destroy replay evidence or forbid the permitted provisional-delete branch; an incomplete graph can make authoritative receipts non-portable.</risk>
    <mitigation>Migration 20 rebuilds forward-only with legacy-copy, scalar subject/replacement evidence, immutable triggers, exact backup/reference/version updates, host/Expo migration rollback, and portable round-trip contracts.</mitigation>
  </threat>
  <threat>
    <surface>Replace/remove writer and active/rest pointer repair</surface>
    <risk>Stale revision, request collision, injected writer failure, or skipped fallback can duplicate edits, lose history, or make rest/current pointers dangle.</risk>
    <mitigation>Canonical receipt comparison, expected revisions, one FIFO transaction, display-order pointer selection, fault injection, rollback equality, and completed/undo byte-equality tests.</mitigation>
  </threat>
</threat_model>

## Artifacts this phase produces

- `src/platform/sqlite/migrations/0020_session_exercise_edit_receipts.ts` — v20 forward-only receipt-ledger rebuild.
- `replaceExercise` and `removeExercise` command/input/result contracts — request-hash and revision-guarded session edits.
- Per-exercise Replace/Remove overview actions — accessible runtime-command entry points.
<output>Create `.planning/phases/09-in-workout-exercise-editing/09-02-SUMMARY.md` when done.</output>
