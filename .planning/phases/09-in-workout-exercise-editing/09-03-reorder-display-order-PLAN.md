---
phase: 09-in-workout-exercise-editing
plan: 03
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
requirements: [WORK-23, WORK-24]
must_haves:
  truths:
    - "D-03: reorder never changes snapshot identity, copied fields, completed facts, source lineage, or immutable ordinal."
    - "D-07: touch-and-hold drag plus accessible Move up/Move down persists only contiguous display_ordinal values; planned/creation order remains immutable."
    - "The exact ordered-ID command is request-id/SHA-256/revision guarded and commits atomically through the FIFO private writer."
    - "Reordered display and active/rest next-set traversal survive process death without changing completion history."
  artifacts:
    - {path: src/domains/workout/sessionExerciseCommands.ts, provides: validated reorder command}
    - {path: src/platform/sqlite/repositories/workoutRepository.ts, provides: display-order read/write behavior}
    - {path: maestro/phase9/in-workout-exercise-editing.yaml, provides: drag/fallback/relaunch order evidence}
  key_links:
    - {from: PlanEditorReorderableRow pattern, to: ActiveWorkoutScreen exercise cards, via: drag and move callbacks}
    - {from: reorder command, to: session_exercises.display_ordinal, via: one revision-checked writer transaction}
---

<objective>Add persistent whole-exercise reorder while proving the immutable planned/creation ordinal and all committed set facts remain untouched.</objective>

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

Implementation references: `src/ui/screens/OwnedPlanEditorScreen.tsx:897-953,1246-1292` for drag plus Move up/down; `src/platform/sqlite/repositories/workoutRepository.ts:613-703` for active-workout ordering; and `maestro/phase7/plan-schedule-reorder.yaml:52-62,64-139` for stable drag/order/relaunch evidence.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Persist revision-checked display-only reorder</name>
  <files>src/domains/workout/activeWorkout.ts, src/domains/workout/sessionExerciseCommands.ts, src/domains/workout/sessionExerciseCommands.test.ts, src/platform/sqlite/repositories/workoutRepository.ts, src/testing/contracts/migrationsEffects.contract.ts, tests/integration/session-exercise-editing.test.ts</files>
  <read_first>src/domains/workout/sessionExerciseCommands.ts, src/platform/sqlite/repositories/workoutRepository.ts, src/platform/sqlite/migrations/0019_session_exercise_editing.ts, src/ui/screens/OwnedPlanEditorScreen.tsx</read_first>
  <action>Add `reorderExercises` accepting the exact ordered session-exercise ID list plus expected session and affected exercise revisions. Validate uniqueness, exact membership, and legal in-progress state. In one writer transaction, replay receipts idempotently, reject stale/hash/list conflicts, update only `display_ordinal` to contiguous values, set modified-from-plan, increment the session revision once, retain active pointers unless invalid, and persist receipt/effects. Change active-workout and next-eligible queries to order by `display_ordinal` with stable ID fallback, while history/audit continues exposing immutable `ordinal`. Test no-op order, invalid/missing/duplicate IDs, stale revision, replay, rollback, concurrent requests, active/rest behavior, and before/after equality for ordinal, copied snapshot fields, source lineage and all completed set rows in host and real Expo SQLite.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/workout/sessionExerciseCommands.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/session-exercise-editing.test.ts &amp;&amp; npm run test:coverage -- --runInBand</automated><native>npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/migrations-effects/build.json</native></verify>
  <acceptance_criteria>D-03 and D-07 are proven by column-level assertions: only display_ordinal, session revision/modified flag, receipt and required effects change; immutable ordinal and completed facts do not.</acceptance_criteria>
  <done>Repository reads and traversal honor durable display order without corrupting snapshot order.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add drag-first reorder with accessible fallback</name>
  <files>src/bootstrap/workoutAppRuntime.tsx, src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, maestro/phase9/in-workout-exercise-editing.yaml</files>
  <read_first>src/ui/screens/OwnedPlanEditorScreen.tsx, src/ui/screens/ActiveWorkoutScreen.tsx, src/bootstrap/workoutAppRuntime.tsx, maestro/phase7/plan-schedule-reorder.yaml</read_first>
  <action>Reuse the shipped `PlanEditorReorderableRow` drag-first behavior for overview exercise cards, but commit through the Phase 9 runtime command instead of draft React state. Expose exact `Move <exercise> up`, `Move <exercise> down`, and drag-handle accessible names; disable impossible endpoints and in-flight repeats; announce `<name> moved to <n> of <total>` as text, not color alone. Preserve open/active card identity after reorder. Test visible focus, keyboard/D-pad Enter/Space activation, 48dp targets, reduced-motion feedback, and compact/medium/expanded plus 200% text. Extend Maestro with touch-and-hold reorder and accessible fallback, `assertVisible ... above ...`, relaunch persistence, active-set traversal in the new order, and retained completed observation.</action>
  <verify><automated>npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx &amp;&amp; npm run typecheck</automated><native>npm run test:maestro:phase9 -- --manifest artifacts/native/phase9/build.json</native></verify>
  <acceptance_criteria>D-07 is available by drag and accessible up/down controls, both commit the same display-only command, and native relaunch proves durable order without changing planned order/history.</acceptance_criteria>
  <done>Owner can reorder exercises accessibly and the presentation order persists.</done>
</task>
</tasks>

<verification>Run reorder domain/integration/real-SQLite tests, the component accessibility matrix, coverage, and native drag plus fallback/relaunch assertions. Compare immutable ordinals and completed rows before/after.</verification>
<success_criteria>Roadmap criterion 4 passes: reorder changes presentation only, supports drag and accessible fallback, persists across relaunch, and leaves planned order plus completed facts immutable.</success_criteria>
<output>Create `.planning/phases/09-in-workout-exercise-editing/09-03-SUMMARY.md` when done.</output>
