---
phase: 10-advanced-set-timing
plan: 02
type: execute
wave: 2
depends_on: [10-01]
files_modified:
  - src/domains/advancedTiming/advancedTimingState.ts
  - src/domains/advancedTiming/advancedTimingState.test.ts
  - src/domains/advancedTiming/advancedTimingCommands.ts
  - src/domains/advancedTiming/advancedTimingCommands.test.ts
  - src/platform/sqlite/repositories/advancedTimingRepository.ts
  - src/bootstrap/workoutAppRuntime.tsx
  - src/ui/components/AdvancedTimingIndicator.tsx
  - src/ui/screens/ActiveWorkoutScreen.tsx
  - src/ui/__tests__/AdvancedTimingIndicator.test.tsx
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - tests/integration/advanced-timing.test.ts
  - src/testing/contracts/migrationsEffects.contract.ts
  - maestro/phase10/advanced-set-timing.yaml
  - scripts/run-coverage-gate.mjs
autonomous: true
requirements: [WORK-26]
must_haves:
  truths:
    - "D-02: cluster configuration such as 3+3+3 creates fixed advisory gaps between groups and the owner completes exactly one existing session_sets row for the entire cluster set."
    - "D-03: cluster phases/progress are added only to the separate AdvancedTimingStateV1 machine and advanced repository; no between-set rest state, revision, notification, or UI behavior changes."
    - "D-04: starting, expiring, skipping, or failing an intra-set gap never calls completeSet/addWorkingSet/remove/undo, never inserts another session_sets row, and never changes a recorded rest fact."
    - "Cluster progress and remaining gap time reconcile from persisted absolute timestamps after backgrounding and process death without replaying missed cues."
  artifacts:
    - {path: src/domains/advancedTiming/advancedTimingState.ts, provides: version-1 cluster group/gap transitions}
    - {path: tests/integration/advanced-timing.test.ts, provides: one-row and rest-byte-equality cluster proof}
    - {path: maestro/phase10/advanced-set-timing.yaml, provides: 3+3+3 lifecycle-visible native flow}
  key_links:
    - {from: cluster group completion control, to: advancedTimingRepository, via: start-next-gap advanced-only command}
    - {from: cluster gap expiry, to: AdvancedTimingIndicator, via: trusted advanced state refresh, never setCommands}
---

<objective>Expand the proven tracer with cluster-set timing whose explicit group boundaries and fixed intra-set gaps remain advisory and culminate in exactly one normally recorded set.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/10-advanced-set-timing/10-CONTEXT.md
@.planning/phases/10-advanced-set-timing/10-RESEARCH.md
@.planning/phases/10-advanced-set-timing/10-01-SUMMARY.md

Implementation anchors: `src/platform/sqlite/migrations/0001_initial.ts:183-217` establishes one session-set row per set; `src/domains/workout/setCommands.ts:214-230` is the only normal set-completion boundary; and `src/domains/rest/restState.ts:48-57` demonstrates absolute-time derivation.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Add cluster group and fixed-gap transitions to the advanced machine</name>
  <files>src/domains/advancedTiming/advancedTimingState.ts, src/domains/advancedTiming/advancedTimingState.test.ts, src/domains/advancedTiming/advancedTimingCommands.ts, src/domains/advancedTiming/advancedTimingCommands.test.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>src/domains/advancedTiming/advancedTimingConfig.ts, src/domains/advancedTiming/advancedTimingState.ts, src/domains/advancedTiming/advancedTimingState.test.ts, src/domains/workout/setCommands.ts</read_first>
  <action>Extend only `AdvancedTimingStateV1` with cluster progress: current group index, an explicit ready/working-group phase, and running/paused fixed-gap phases anchored by absolute timestamps. Because rep auto-detection is out of scope, the owner explicitly invokes `Start rest after group N`; permit this only after a non-final configured group and advance to the next group when the gap expires or is skipped. A 3+3+3 config therefore offers exactly two gaps. Do not infer performed reps, auto-complete the set, or create a set per group. Reconcile a clock jump to the correct next-group-ready state without replaying missed end cues. Exhaustively test malformed patterns, first/middle/final group guards, two gaps, pause/resume, skip, due/idempotent reconcile, process restart, and all invalid transitions. Maintain exact 100% coverage.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/advancedTiming/advancedTimingState.test.ts src/domains/advancedTiming/advancedTimingCommands.test.ts &amp;&amp; npm run test:coverage -- --runInBand</automated></verify>
  <acceptance_criteria>D-02's 3+3+3 semantics produce two fixed gaps and one final ready-to-complete set; D-03 keeps every new transition in AdvancedTimingStateV1; no transition has a recorded-set or RestStateV1 output.</acceptance_criteria>
  <done>The separate machine deterministically represents cluster group work and intra-set gaps.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Persist cluster transitions and prove the one-record invariant</name>
  <files>src/platform/sqlite/repositories/advancedTimingRepository.ts, src/bootstrap/workoutAppRuntime.tsx, tests/integration/advanced-timing.test.ts, src/testing/contracts/migrationsEffects.contract.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>src/platform/sqlite/repositories/advancedTimingRepository.ts, src/platform/sqlite/repositories/workoutRepository.ts, src/domains/workout/setCommands.ts, tests/integration/advanced-timing.test.ts, src/testing/contracts/migrationsEffects.contract.ts</read_first>
  <action>Add revision-checked advanced-only commands for start cluster, begin gap, pause/resume gap, skip gap, reconcile gap, and stop. Persist group/gap progress in `session_advanced_timing_states`; retain the same target session-set ID throughout. Before a 3+3+3 run snapshot the complete `session_sets`, `session_rest_states`, session/undo facts and rest pending effects; after both gaps assert the target set row count and bytes are unchanged. Then call the existing normal complete-set command once and assert exactly that one pre-existing row becomes completed—no new row exists and no intra-rest was recorded as between-set rest. Cover denied/failing cue stubs, transaction failure, stale advanced revision, relaunch during each gap, and concurrent gap expiry in host integration plus the real Expo migration-effects contract. Ensure cluster commands never import or invoke set mutation/rest commands.</action>
  <verify><automated>npm run test:integration -- --runInBand tests/integration/advanced-timing.test.ts &amp;&amp; npm run test:coverage -- --runInBand</automated><native>npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/phase10/build.json</native></verify>
  <acceptance_criteria>D-02/Q11 is repository-proven: 3+3+3 leaves exactly one session_sets row and completes it once through the existing set command; D-03/D-04 are proven by byte-identical rest/set facts during gaps and harmless effect failure.</acceptance_criteria>
  <done>Cluster persistence survives lifecycle changes while keeping intra-rests out of recorded workout/rest facts.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Expose the cluster interaction and lifecycle flow</name>
  <files>src/bootstrap/workoutAppRuntime.tsx, src/ui/components/AdvancedTimingIndicator.tsx, src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/__tests__/AdvancedTimingIndicator.test.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, maestro/phase10/advanced-set-timing.yaml</files>
  <read_first>src/ui/components/AdvancedTimingIndicator.tsx, src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/components/RestDock.tsx, maestro/phase10/advanced-set-timing.yaml</read_first>
  <action>Add cluster selection to the active-set timing config with a plain-text grouping input canonicalized as positive groups (for example `3+3+3`) and a fixed gap duration. The compact indicator must show literal mode/progress such as `Cluster 2 of 3` and `Intra-set rest · 00:20`, with explicit `Start rest after group 1`, pause/resume, skip-gap, and stop controls. Keep normal set completion visible and enabled; it stops advanced timing only as post-completion cleanup and does not depend on a gap/cue result. Use text plus icon/state rather than color alone, visible focus, D-pad/keyboard activation and >=48dp controls. Component tests cover 200% text, compact/medium/expanded widths, System/Light/Dark, reduced motion, exact accessible names, and that RestDock can be simultaneously present and independent. Extend Maestro to configure 3+3+3, run one gap, force-stop during the second, relaunch to the reconciled group, complete one set, and assert one completed-set presentation plus independent between-set rest.</action>
  <verify><automated>npm run test:components -- --runInBand src/ui/__tests__/AdvancedTimingIndicator.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx &amp;&amp; npm run typecheck</automated><native>npm run test:maestro:phase10 -- --manifest artifacts/native/phase10/build.json</native></verify>
  <acceptance_criteria>D-02 is visible as two fixed gaps for 3+3+3 and one normal completion; D-03 keeps the small indicator parallel to RestDock; D-04 keeps completion available and independent of all cue/gap outcomes.</acceptance_criteria>
  <done>Cluster mode is usable, accessible, lifecycle-safe, and visibly one set.</done>
</task>
</tasks>

<verification>Run the full advanced domain/coverage gate, host and Expo one-row contracts, component accessibility matrix, and the 3+3+3 background/force-stop/relaunch/one-completion Maestro branch.</verification>
<success_criteria>Roadmap criterion 1 is complete for cluster mode: fixed intra-set gaps work, 3+3+3 remains one recorded set, lifecycle recovery is timestamp-derived, and the v1.0 rest machine remains independent.</success_criteria>
<output>Create `.planning/phases/10-advanced-set-timing/10-02-SUMMARY.md` when done.</output>
