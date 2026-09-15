---
phase: 09-in-workout-exercise-editing
plan: 06
type: execute
wave: 5
depends_on: [09-05]
files_modified:
  - package.json
  - scripts/run-phase9-maestro.mjs
  - scripts/phase9-evidence-scripts.test.mjs
  - maestro/phase9/in-workout-exercise-editing.yaml
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - src/ui/__tests__/WorkoutCompletionScreen.test.tsx
autonomous: true
requirements: [WORK-20, WORK-21, WORK-22, WORK-23, WORK-24, WORK-25, WORK-27]
must_haves:
  truths:
    - "D-03/D-04/D-05/D-06/D-07: native evidence covers add, both replace/remove history branches, drag and accessible reorder, relaunch persistence, and immutable committed history."
    - "D-08: native and integration evidence covers durable modified-from-plan, one scheduled opportunity, and no auto-progression for added/absent work."
    - "D-01/D-02: native evidence covers exact conditional default-No prompt, No unchanged plan, Yes one aggregate write-back, and unchanged recorded history."
    - "The real gate `npm run test:coverage` invokes `scripts/run-coverage-gate.mjs` and every registered integrity-critical module, including sessionExerciseCommands and migration 19, is 100% statements/branches/functions/lines."
    - "All new/changed controls have exact accessible names, visible focus, keyboard/D-pad activation, non-color cues and at least 48dp targets across themes, widths, 200% text and reduced motion."
  artifacts:
    - {path: scripts/run-phase9-maestro.mjs, provides: fail-closed Phase 9 native runner}
    - {path: scripts/phase9-evidence-scripts.test.mjs, provides: evidence manifest and requirement matrix contract}
    - {path: maestro/phase9/in-workout-exercise-editing.yaml, provides: complete lifecycle-visible Phase 9 flow}
  key_links:
    - {from: Phase 9 decision matrix, to: automated and native evidence, via: fail-closed runner coverage IDs}
    - {from: scripts/run-coverage-gate.mjs, to: new integrity-critical files, via: exact 100% per-file metrics}
---

<objective>Close Phase 9 with one fail-closed verification matrix covering every locked decision, roadmap criterion, persistence contract, accessibility constraint, and native lifecycle path.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/09-in-workout-exercise-editing/09-CONTEXT.md
@.planning/phases/09-in-workout-exercise-editing/09-RESEARCH.md
@.planning/phases/09-in-workout-exercise-editing/09-05-SUMMARY.md

Verification references: `scripts/run-coverage-gate.mjs:16-101,122-175` for the exact 100% per-file gate and `maestro/phase7/plan-schedule-reorder.yaml:1-7,64-139` for staged manifest/relaunch/order evidence conventions.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Complete the fail-closed Phase 9 native and accessibility matrix</name>
  <files>package.json, scripts/run-phase9-maestro.mjs, scripts/phase9-evidence-scripts.test.mjs, maestro/phase9/in-workout-exercise-editing.yaml, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, src/ui/__tests__/WorkoutCompletionScreen.test.tsx</files>
  <read_first>scripts/run-phase7-maestro.mjs, scripts/phase7-evidence-scripts.test.mjs, maestro/phase7/plan-schedule-reorder.yaml, maestro/phase9/in-workout-exercise-editing.yaml, .planning/phases/09-in-workout-exercise-editing/09-CONTEXT.md</read_first>
  <action>Finalize `test:maestro:phase9` and its manifest validator so missing flows/assertions fail closed. Map D-01..D-08 and all seven WORK IDs to evidence IDs. The native flow must cover: Add from shared search and Added origin; zero-completed Replace; completed Replace retaining Skipped original; zero-completed Remove; completed Remove retaining Skipped original/history; drag reorder and keyboard/D-pad Move controls; force-stop/relaunch persistence; modified scheduled completion and manual-only added work; prompt absence cases; exact `Save these changes to the plan?`; default No unchanged plan; Yes complete atomic day composition after relaunch. Expand component matrices for System/Light/Dark, compact/medium/expanded, fontScale 2 with restoration, reduced motion, role/name/state, visible focus, Enter/Space/D-pad, text/icon non-color cues, and min 48dp. Reuse existing fixture/setup flows; do not weaken older lifecycle assertions or make physical-device observation release authority.</action>
  <verify><automated>npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx src/ui/__tests__/WorkoutCompletionScreen.test.tsx &amp;&amp; node --test scripts/phase9-evidence-scripts.test.mjs &amp;&amp; npm run typecheck</automated><native>npm run test:maestro:phase9 -- --manifest artifacts/native/phase9/build.json</native></verify>
  <acceptance_criteria>Every D-id D-01 through D-08 and WORK-20..25,27 has a named fail-closed evidence mapping; every lifecycle-visible branch and accessibility constraint has component/native proof.</acceptance_criteria>
  <done>The Phase 9 evidence corpus cannot pass if any locked behavior or required accessibility mode is absent.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Run the complete source, persistence, coverage, and native gate</name>
  <files>package.json, scripts/run-phase9-maestro.mjs, scripts/phase9-evidence-scripts.test.mjs</files>
  <read_first>package.json, scripts/run-coverage-gate.mjs, scripts/run-phase9-maestro.mjs, scripts/phase9-evidence-scripts.test.mjs, .planning/ROADMAP.md</read_first>
  <action>Run typecheck, lint/boundaries, all Jest projects, then explicitly run `npm run test:coverage -- --runInBand` and inspect its JSON plus `coverage/coverage-summary.json`. Require every registered integrity-critical file at exactly 100% statements/branches/functions/lines, specifically `sessionExerciseCommands.ts`, migration 19, activeWorkout, finishWorkout, planImpactCommands, restoreCommands and affected scheduling/progression modules. Run v19 host migration/backup suites, build/use the declared dev-test artifact, run the real Expo `migrations-effects` suite, then the Phase 9 Maestro runner. Preserve evidence for rollback, replay, byte-identical history, backup round trip, lifecycle relaunch and write-back No/Yes. Do not build a release candidate or include Phase 10+ work.</action>
  <verify><automated>npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries &amp;&amp; npm run test:all -- --runInBand &amp;&amp; npm run test:coverage -- --runInBand &amp;&amp; node --test scripts/phase9-evidence-scripts.test.mjs</automated><native>npm run android:devtest:fresh -- --suite phase9 &amp;&amp; npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/phase9/build.json &amp;&amp; npm run test:maestro:phase9 -- --manifest artifacts/native/phase9/build.json</native></verify>
  <acceptance_criteria>All six Roadmap success criteria, D-01..D-08, and WORK-20..25,27 pass source, host SQLite, real Expo SQLite, coverage, accessibility and Maestro gates; no release/publish action occurs.</acceptance_criteria>
  <done>Phase 9 is fully evidenced and ready for the orchestrator's post-checker commit.</done>
</task>
</tasks>

<verification>Execute the exact automated and native commands above; retain the coverage success JSON, per-file summary, schema-19 native contract result, and Phase 9 Maestro evidence report.</verification>
<success_criteria>All six Phase 9 roadmap criteria are proven together, all eight locked decisions are traceable, every persistence change has host plus real Expo SQLite proof, and every integrity-critical file remains at 100% coverage.</success_criteria>
<output>Create `.planning/phases/09-in-workout-exercise-editing/09-06-SUMMARY.md` when done.</output>
