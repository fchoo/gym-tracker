---
phase: 09-in-workout-exercise-editing
plan: 04
type: execute
wave: 3
depends_on: [09-02, 09-03]
files_modified:
  - src/domains/workout/activeWorkout.ts
  - src/domains/workout/sessionDetail.ts
  - src/platform/sqlite/repositories/workoutRepository.ts
  - src/platform/sqlite/repositories/workoutOutcomeRepository.ts
  - src/bootstrap/workoutAppRuntime.tsx
  - src/bootstrap/scheduleRuntime.tsx
  - src/bootstrap/scheduleRuntime.test.tsx
  - src/ui/screens/WorkoutCompletionScreen.tsx
  - src/ui/__tests__/WorkoutCompletionScreen.test.tsx
  - tests/integration/session-exercise-editing.test.ts
  - tests/integration/load-reps.test.ts
  - tests/integration/today-schedule-workout.test.ts
  - maestro/phase9/in-workout-exercise-editing.yaml
autonomous: true
requirements: [WORK-24, WORK-25]
must_haves:
  truths:
    - "D-08: a composition-edited scheduled workout consumes exactly one scheduled opportunity and remains durably flagged modified-from-plan."
    - "D-08: added/null-lineage work never advances targets, and planned exercises absent through replacement/removal receive no automatic progression."
    - "D-03: progression/schedule handling reads immutable session evidence and never rewrites session snapshots or targets silently."
    - "The modified flag is transactionally persisted on the first committed composition edit and survives retry, relaunch, and finish."
  artifacts:
    - {path: src/platform/sqlite/repositories/workoutOutcomeRepository.ts, provides: lineage-gated deterministic progression evidence}
    - {path: src/bootstrap/scheduleRuntime.tsx, provides: unchanged one-opportunity scheduled completion for modified sessions}
    - {path: src/ui/screens/WorkoutCompletionScreen.tsx, provides: post-finish modified-from-plan summary cue}
    - {path: src/ui/__tests__/WorkoutCompletionScreen.test.tsx, provides: accessible non-color modified cue component proof}
    - {path: tests/integration/today-schedule-workout.test.ts, provides: schedule consumption proof}
  key_links:
    - {from: workout_sessions.modified_from_plan, to: finish and scheduling, via: persisted active/completed view}
    - {from: src/platform/sqlite/repositories/workoutOutcomeRepository.ts, to: src/ui/screens/WorkoutCompletionScreen.tsx, via: SessionDetail.modifiedFromPlan post-finish summary state}
    - {from: progression evidence, to: plan target lineage, via: non-null occurrence captured at session start}
---

<objective>Make edited workouts schedule- and progression-safe: consume the trained opportunity, persist modified provenance, and exclude added/absent work from automatic target mutation.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/09-in-workout-exercise-editing/09-CONTEXT.md
@.planning/phases/09-in-workout-exercise-editing/09-RESEARCH.md
@.planning/phases/09-in-workout-exercise-editing/09-02-SUMMARY.md
@.planning/phases/09-in-workout-exercise-editing/09-03-SUMMARY.md

Implementation references: `src/bootstrap/workoutAppRuntime.tsx:3504-3514` for finish-before-schedule ordering; `src/bootstrap/scheduleRuntime.tsx:886-930` for scheduled opportunity completion; `src/domains/progression/recommendationCommands.ts:33-53` and `src/platform/sqlite/repositories/workoutOutcomeRepository.ts:187-220` for lineage resolution and progression eligibility.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Enforce deterministic progression eligibility from immutable lineage</name>
  <files>src/domains/workout/activeWorkout.ts, src/platform/sqlite/repositories/workoutRepository.ts, src/platform/sqlite/repositories/workoutOutcomeRepository.ts, tests/integration/session-exercise-editing.test.ts, tests/integration/load-reps.test.ts</files>
  <read_first>src/platform/sqlite/repositories/workoutOutcomeRepository.ts, src/domains/progression/recommendationCommands.ts, tests/integration/load-reps.test.ts, src/platform/sqlite/migrations/0019_session_exercise_editing.ts</read_first>
  <action>Carry `modifiedFromPlan` through active and completed workout reads. Tighten progression evidence so only completed working sets with non-null lineage to an occurrence captured in the planned day at session start are eligible. Owner-added and replacement rows with null target lineage always remain manual-only; a planned occurrence absent because it was removed/replaced produces no advancement and no target mutation. Preserve existing valid planned-occurrence progression. Add integration matrices for add/replace/remove/reorder, edited-then-returned composition, partial/skipped completion, and replay, asserting recommendation/policy rows and plan targets are unchanged for ineligible work and all session snapshots remain byte-identical.</action>
  <verify><automated>npm run test:integration -- --runInBand tests/integration/load-reps.test.ts tests/integration/session-exercise-editing.test.ts &amp;&amp; npm run test:coverage -- --runInBand</automated><native>npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/migrations-effects/build.json</native></verify>
  <acceptance_criteria>D-03 and D-08 are explicit in progression tests: null-lineage and absent planned occurrences cannot auto-advance, valid untouched planned work remains deterministic, and no session snapshot is rewritten.</acceptance_criteria>
  <done>Progression consumes only eligible immutable planned evidence.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Preserve one scheduled opportunity for modified sessions</name>
  <files>src/domains/workout/sessionDetail.ts, src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/scheduleRuntime.tsx, src/bootstrap/scheduleRuntime.test.tsx, src/ui/screens/WorkoutCompletionScreen.tsx, src/ui/__tests__/WorkoutCompletionScreen.test.tsx, tests/integration/today-schedule-workout.test.ts, maestro/phase9/in-workout-exercise-editing.yaml</files>
  <read_first>src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/scheduleRuntime.tsx, src/ui/screens/WorkoutCompletionScreen.tsx, src/ui/screens/SessionDetailScreen.tsx, src/ui/__tests__/WorkoutCompletionScreen.test.tsx, src/domains/workout/sessionDetail.ts, src/platform/sqlite/repositories/workoutOutcomeRepository.ts, tests/integration/today-schedule-workout.test.ts, maestro/phase9/in-workout-exercise-editing.yaml</read_first>
  <action>Keep finish ordering as workout commit followed by `completeScheduledSession`; do not gate schedule consumption on composition equality. Ensure a completed planned/scheduled session with `modified_from_plan=1` carries its original plan/day and consumes exactly one opportunity across retry/relaunch, while unplanned sessions remain unscheduled. Carry that provenance through `SessionDetail` and render the visible post-finish cue in the existing `WorkoutCompletionScreen`, which owns the immediate saved-workout summary before its `View workout details` action; do not invent a component or change immutable rows. Render literal `Modified from plan` text and an accessible name containing that same state so the cue remains understandable without color. Add the component assertion to the existing combined completion/detail convention in `WorkoutCompletionScreen.test.tsx`, proving the accessible name, literal non-color indicator, and absence for an unmodified detail. Test weekday/rotation advancement, repeated completion, each edit kind, and unplanned sessions. Extend native flow to edit, relaunch, finish, and assert the next scheduled opportunity advances once while the completed session remains marked modified.</action>
  <verify><automated>npm run test:unit -- --runInBand src/bootstrap/scheduleRuntime.test.tsx &amp;&amp; npm run test:components -- --runInBand src/ui/__tests__/WorkoutCompletionScreen.test.tsx &amp;&amp; npm run test:integration -- --runInBand tests/integration/today-schedule-workout.test.ts &amp;&amp; npm run typecheck</automated><native>npm run test:maestro:phase9 -- --manifest artifacts/native/phase9/build.json</native></verify>
  <acceptance_criteria>D-08 is proven after restart and retry: edited scheduled workouts advance once and the post-finish summary shows literal `Modified from plan` with an accessible name and a non-color text indicator; unmodified/unplanned workouts omit the cue, unplanned workouts do not consume an opportunity, and no edit silently mutates targets.</acceptance_criteria>
  <reversibility rating="costly">Changing D-08 later affects persisted provenance, schedule opportunity semantics, and progression eligibility.</reversibility>
  <done>Edited sessions finish with deterministic scheduling and progression behavior.</done>
</task>
</tasks>

<verification>Run progression and schedule integration suites, the 100% coverage gate, and Phase 9 native edit-relaunch-finish evidence. Inspect plan target and recommendation rows for no silent mutation.</verification>
<success_criteria>Roadmap criterion 5 passes: every edited session remains append-only, is marked modified-from-plan, consumes its scheduled opportunity exactly once, and advances only eligible planned exercise targets.</success_criteria>
<output>Create `.planning/phases/09-in-workout-exercise-editing/09-04-SUMMARY.md` when done.</output>
