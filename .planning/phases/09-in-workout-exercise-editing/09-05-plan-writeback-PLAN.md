---
phase: 09-in-workout-exercise-editing
plan: 05
type: execute
wave: 4
depends_on: [09-04]
files_modified:
  - src/domains/plans/planImpactCommands.ts
  - src/domains/plans/planImpactCommands.test.ts
  - src/domains/plans/index.ts
  - src/platform/sqlite/repositories/planImpactRepository.ts
  - src/bootstrap/ownedPlanRuntime.tsx
  - src/bootstrap/ownedPlanRuntime.test.ts
  - src/domains/workout/finishWorkout.ts
  - src/bootstrap/workoutAppRuntime.tsx
  - src/ui/screens/ActiveWorkoutScreen.tsx
  - src/ui/screens/WorkoutCompletionScreen.tsx
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - src/ui/__tests__/WorkoutCompletionScreen.test.tsx
  - tests/integration/plan-impact-replacement.test.ts
  - tests/integration/session-exercise-editing.test.ts
  - src/testing/contracts/migrationsEffects.contract.ts
  - maestro/phase9/in-workout-exercise-editing.yaml
autonomous: true
requirements: [WORK-24, WORK-27]
must_haves:
  truths:
    - "D-01: Save changes to plan applies the complete add/replace/remove/reorder delta as one all-or-nothing owned-plan aggregate mutation or applies none."
    - "D-02: the explicit prompt appears only for a nonempty divergence on a completed owned planned session, defaults to No, uses revision/hash/preview guards, and never alters recorded history."
    - "No path implements write-back as repeated single-occurrence replaceExercise calls."
    - "A stale plan, invalid preview, failure, dismissal, or No leaves the plan unchanged while the already-finished workout remains durable."
  artifacts:
    - {path: src/domains/plans/planImpactCommands.ts, provides: aggregate preview and applySessionExerciseEditsToPlan command}
    - {path: src/platform/sqlite/repositories/planImpactRepository.ts, provides: one-transaction owned-day aggregate mutation}
    - {path: src/ui/screens/WorkoutCompletionScreen.tsx, provides: conditional default-No write-back choice}
    - {path: tests/integration/plan-impact-replacement.test.ts, provides: atomic write-back and history immutability proof}
  key_links:
    - {from: completed immutable session delta, to: owned plan day, via: one preview-token/revision/request guarded aggregate mutation}
    - {from: finish commit, to: write-back prompt, via: post-commit runtime state before completion navigation}
---

<objective>Offer explicit default-No plan write-back after an edited workout, applying the complete session delta atomically through the owned-plan editing architecture without touching history.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/09-in-workout-exercise-editing/09-CONTEXT.md
@.planning/phases/09-in-workout-exercise-editing/09-RESEARCH.md
@.planning/phases/09-in-workout-exercise-editing/09-04-SUMMARY.md

Implementation references: `src/domains/workout/finishWorkout.ts:65-76` and `src/bootstrap/workoutAppRuntime.tsx:3480-3514` for post-finish prompt placement; `src/domains/plans/planImpactCommands.ts:96-127,395-415,633-664`, `src/bootstrap/ownedPlanRuntime.tsx:91-106,208-221`, and `src/ui/screens/ExerciseReplacementScreen.tsx:416-421` for revision/hash/preview safety and history-unaffected messaging.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Build one revision-checked owned-plan aggregate write-back command</name>
  <files>src/domains/plans/planImpactCommands.ts, src/domains/plans/planImpactCommands.test.ts, src/domains/plans/index.ts, src/platform/sqlite/repositories/planImpactRepository.ts, src/bootstrap/ownedPlanRuntime.tsx, src/bootstrap/ownedPlanRuntime.test.ts, tests/integration/plan-impact-replacement.test.ts, src/testing/contracts/migrationsEffects.contract.ts</files>
  <read_first>src/domains/plans/planImpactCommands.ts, src/domains/plans/ownedPlanCommands.ts, src/platform/sqlite/repositories/planImpactRepository.ts, src/bootstrap/ownedPlanRuntime.tsx, tests/integration/plan-impact-replacement.test.ts</read_first>
  <action>Add `previewSessionExerciseEditsToPlan` and `applySessionExerciseEditsToPlan` to the existing owned-plan mutation-request architecture. Derive/recompute a canonical full-day delta from immutable planned lineage plus final session display composition; include add/replace/remove/reorder, expected plan revision, preview token/hash, request ID and fresh occurrence/target/policy IDs. In exactly one `kernel.write`/owned-plan transaction create, retire and reorder the owned day occurrences/targets/policies, insert one idempotency result, and increment the aggregate revision once. Reject non-owned plans, empty/stale/changed previews and hash conflicts before writes; injected failure at any stage rolls back everything. Do not loop over public `replaceExercise`. Snapshot all session/session-exercise/session-set/undo rows before apply and assert byte-for-byte equality afterward. Add host integration and equivalent real Expo SQLite contract cases for full mixed delta, No-op, replay, stale plan, malformed IDs and each failure stage.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/plans/planImpactCommands.test.ts src/bootstrap/ownedPlanRuntime.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/plan-impact-replacement.test.ts &amp;&amp; npm run test:coverage -- --runInBand</automated><native>npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/migrations-effects/build.json</native></verify>
  <acceptance_criteria>D-01 and D-02 are repository-proven: all deltas commit as one aggregate or none, retries are idempotent, stale/failure paths cannot partially edit a plan, and every recorded history row is unchanged.</acceptance_criteria>
  <done>The owned-plan path supports one safe full-session write-back command rather than repeated replacements.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add the conditional post-finish default-No prompt</name>
  <files>src/domains/workout/finishWorkout.ts, src/bootstrap/workoutAppRuntime.tsx, src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/screens/WorkoutCompletionScreen.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, src/ui/__tests__/WorkoutCompletionScreen.test.tsx, tests/integration/session-exercise-editing.test.ts, maestro/phase9/in-workout-exercise-editing.yaml</files>
  <read_first>src/domains/workout/finishWorkout.ts, src/bootstrap/workoutAppRuntime.tsx, src/ui/screens/WorkoutCompletionScreen.tsx, src/domains/plans/planImpactCommands.ts, maestro/phase9/in-workout-exercise-editing.yaml</read_first>
  <action>After the final workout commit and before normal completion navigation, recompute whether a completed session with an owning owned plan/day has a nonempty divergence; do not trust only `modified_from_plan`. Show exactly `Save these changes to the plan?` only in that case, never for empty, unplanned, non-owned, unedited, or edit-then-restored composition. Focus/default selection is `No`; dismissal and No navigate without plan mutation. Yes obtains the aggregate preview and calls one apply command; stale plan/failure keeps the completed session durable, applies no plan rows, and gives actionable retry/keep-session-only feedback. Test exact accessible names/states, visible focus, keyboard/D-pad, non-color feedback, 48dp targets, and 200%/responsive/theme behavior. Maestro runs No and Yes paths across relaunch, proving No leaves plan unchanged, Yes updates complete day order/composition after relaunch, and both leave recorded session history unchanged.</action>
  <verify><automated>npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx src/ui/__tests__/WorkoutCompletionScreen.test.tsx &amp;&amp; npm run test:integration -- --runInBand tests/integration/session-exercise-editing.test.ts tests/integration/plan-impact-replacement.test.ts &amp;&amp; npm run typecheck</automated><native>npm run test:maestro:phase9 -- --manifest artifacts/native/phase9/build.json</native></verify>
  <acceptance_criteria>D-01/D-02 and WORK-27 are visible end to end: prompt eligibility is exact, No is default and inert, Yes applies one atomic owned-plan edit, stale failure applies none, and completed history never changes.</acceptance_criteria>
  <done>Edited owned-plan workouts offer safe optional write-back after their history is committed.</done>
</task>
</tasks>

<verification>Run owned-plan command/runtime tests, host and real Expo SQLite atomicity contracts, completion component tests, coverage, and native No/Yes/stale/relaunch flows. Grep the implementation to confirm write-back does not invoke `replaceExercise` per delta.</verification>
<success_criteria>Roadmap criterion 6 passes: only truly diverged owned-plan workouts prompt after finish, default No is inert, Yes applies the whole delta atomically with revision checks, and history remains untouched.</success_criteria>
<output>Create `.planning/phases/09-in-workout-exercise-editing/09-05-SUMMARY.md` when done.</output>
