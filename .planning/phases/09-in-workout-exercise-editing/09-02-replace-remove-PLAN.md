---
phase: 09-in-workout-exercise-editing
plan: 02
type: execute
wave: 2
depends_on: [09-01]
files_modified:
  - src/domains/workout/activeWorkout.ts
  - src/domains/workout/sessionExerciseCommands.ts
  - src/domains/workout/sessionExerciseCommands.test.ts
  - src/platform/sqlite/repositories/workoutRepository.ts
  - src/bootstrap/workoutAppRuntime.tsx
  - src/ui/screens/ActiveWorkoutScreen.tsx
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - src/testing/contracts/migrationsEffects.contract.ts
  - tests/integration/session-exercise-editing.test.ts
  - maestro/phase9/in-workout-exercise-editing.yaml
autonomous: true
requirements: [WORK-21, WORK-22, WORK-24]
must_haves:
  truths:
    - "D-03: Replace and Remove never rewrite or delete completed/undo-referenced facts; only provisional zero-completed rows may be physically removed."
    - "D-05: Replace removes a zero-completed provisional original and appends a fresh replacement at its display position, but with any completed set retains the original as skipped and appends the replacement."
    - "D-06: Remove hard-deletes only zero-completed provisional work; otherwise it marks the exercise and noncompleted children skipped while preserving completed history."
    - "Both commands use request-id/SHA-256/session+exercise revisions and one FIFO private-writer transaction including pointers, rest reconciliation, modified flag, receipt, and effects."
    - "Overflow controls explain delete-versus-skip behavior and satisfy accessible name, focus, keyboard/D-pad, non-color, and 48dp requirements."
  artifacts:
    - {path: src/domains/workout/sessionExerciseCommands.ts, provides: guarded replace/remove commands}
    - {path: tests/integration/session-exercise-editing.test.ts, provides: destructive-boundary and rollback proof}
    - {path: src/ui/screens/ActiveWorkoutScreen.tsx, provides: replacement picker and conditional removal confirmation}
  key_links:
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
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Implement atomic replace semantics at the immutable-history boundary</name>
  <files>src/domains/workout/activeWorkout.ts, src/domains/workout/sessionExerciseCommands.ts, src/domains/workout/sessionExerciseCommands.test.ts, src/platform/sqlite/repositories/workoutRepository.ts, src/testing/contracts/migrationsEffects.contract.ts, tests/integration/session-exercise-editing.test.ts</files>
  <read_first>src/domains/workout/sessionExerciseCommands.ts, src/platform/sqlite/repositories/workoutRepository.ts, src/platform/sqlite/repositories/workoutOutcomeRepository.ts, src/domains/workout/undoCompletedSet.ts, tests/integration/session-exercise-editing.test.ts</read_first>
  <action>Add revision- and receipt-guarded `replaceExercise`. In the writer, inspect every child working set and every `session_undo_snapshots` reference. If no completed or undo-referenced fact exists, delete only provisional child rows/original and append a new library-derived snapshot at the original `display_ordinal`; never reuse identity or mutate copied snapshot fields. If history exists, transition the original and only its noncompleted children to `skipped`, keep completed children byte-identical and visible, append the replacement snapshot at that display position, and select the next eligible set. Replacement gets its own metric/default target snapshot and null plan-target lineage/manual-only behavior. In both paths set modified-from-plan, increment the session revision exactly once, reconcile active/rest pointers and durable effects, and write the receipt before commit. Test identical replay, mismatched replay, stale revisions, injected failure rollback, active/rest ownership, zero-completed deletion, completed/undo preservation, progress counts, and byte equality of committed facts in host and real Expo SQLite contracts.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/workout/sessionExerciseCommands.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/session-exercise-editing.test.ts</automated><native>npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/migrations-effects/build.json</native></verify>
  <acceptance_criteria>D-03 and D-05 hold in both branches: zero-completed replacement deletes only provisional rows; completed/undo-referenced replacement retains original history as skipped; a fresh replacement occupies the display position; any conflict/failure changes nothing.</acceptance_criteria>
  <done>Replace is idempotent, atomic, history-safe, and pointer/progress correct.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement guarded whole-exercise removal</name>
  <files>src/domains/workout/activeWorkout.ts, src/domains/workout/sessionExerciseCommands.ts, src/domains/workout/sessionExerciseCommands.test.ts, src/platform/sqlite/repositories/workoutRepository.ts, src/testing/contracts/migrationsEffects.contract.ts, tests/integration/session-exercise-editing.test.ts</files>
  <read_first>src/domains/workout/sessionExerciseCommands.ts, src/platform/sqlite/repositories/workoutRepository.ts, src/platform/sqlite/repositories/workoutOutcomeRepository.ts, src/domains/workout/setCommands.ts, tests/integration/workout-outcomes.test.ts</read_first>
  <action>Add `removeExercise` under the same command envelope. Hard-delete the exercise and child rows only when every working set is noncompleted and no undo snapshot references a child; otherwise reuse the established skip transition semantics, retaining completed rows and marking the exercise plus noncompleted children skipped. Exclude skipped work from remaining totals, keep completed totals/history rebuildable, repair active session/set and rest next-set pointers by display order, persist modified-from-plan, durable effects and receipt atomically, and return an explicit `removed` or `skipped_history_preserved` result for UI copy. Cover replay/conflicts, mixed child statuses, undo-only history, last/active exercise, rollback after each write stage, and concurrent FIFO ordering in domain, host, and real Expo tests.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/workout/sessionExerciseCommands.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/session-exercise-editing.test.ts &amp;&amp; npm run test:coverage -- --runInBand</automated><native>npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/migrations-effects/build.json</native></verify>
  <acceptance_criteria>D-03 and D-06 are enforced from child facts, not UI state: hard deletion is impossible with completion/undo history, skip retains history and fixes remaining-work totals, and all transaction/retry failures are all-or-nothing.</acceptance_criteria>
  <done>Remove has one safe physical-delete boundary and a tested skip degradation path.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Enable Replace and Remove from the exercise overflow</name>
  <files>src/bootstrap/workoutAppRuntime.tsx, src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, maestro/phase9/in-workout-exercise-editing.yaml</files>
  <read_first>src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/screens/ExerciseReplacementScreen.tsx, src/ui/screens/LibraryScreen.tsx, src/bootstrap/workoutAppRuntime.tsx, maestro/phase9/in-workout-exercise-editing.yaml</read_first>
  <action>Wire Phase 8's per-exercise overflow Replace/Remove stubs to runtime commands. Replace uses the reviewed single-select library picker and the replacement's own default scheme. Removal confirmation must say `Remove exercise` for zero-completed work and explicitly say completed sets will be retained and the exercise marked `Skipped` when history exists. Render skipped originals and their completed sets visibly with text/icon non-color cues; expose committed outcomes and retry-safe conflict messaging. Test exact accessible menu/action names, visible focus, Enter/Space/D-pad activation, disabled/in-flight states, 48dp targets, and that no screen runs SQL. Extend Maestro to replace before completion (original gone, replacement in position), then complete a set and exercise both replacement/removal history branches, asserting `Skipped`, retained completed observation, correct remaining progress, and persistence after relaunch.</action>
  <verify><automated>npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx &amp;&amp; npm run typecheck</automated><native>npm run test:maestro:phase9 -- --manifest artifacts/native/phase9/build.json</native></verify>
  <acceptance_criteria>D-05 and D-06 are explicit and accessible in the UI; lifecycle evidence distinguishes provisional delete from history-preserving skip and proves retained completion after relaunch.</acceptance_criteria>
  <done>Owner can safely replace or remove any session exercise from the overview.</done>
</task>
</tasks>

<verification>Run command unit tests, host integration and real Expo SQLite contracts, component accessibility tests, coverage, and the Phase 9 Maestro replace/remove branches. Confirm completed and undo-referenced rows remain byte-identical across every operation.</verification>
<success_criteria>Roadmap criteria 2 and 3 pass: replace and remove preserve committed history, only provisional work is deleted, progress/pointers remain correct, and the behavior survives relaunch.</success_criteria>
<output>Create `.planning/phases/09-in-workout-exercise-editing/09-02-SUMMARY.md` when done.</output>
