---
phase: 10-advanced-set-timing
plan: 03
type: execute
wave: 3
depends_on: [10-02]
files_modified:
  - src/domains/plans/ownedPlanCommands.ts
  - src/domains/plans/ownedPlanCommands.test.ts
  - src/platform/sqlite/repositories/ownedPlanRepository.ts
  - src/platform/sqlite/repositories/advancedTimingRepository.ts
  - src/bootstrap/ownedPlanRuntime.tsx
  - src/bootstrap/ownedPlanRuntime.test.ts
  - src/bootstrap/workoutAppRuntime.tsx
  - src/bootstrap/restCountdownCue.ts
  - src/domains/rest/restCountdownCuePort.ts
  - src/platform/audio/expoRestCountdownCueAdapter.ts
  - src/platform/audio/expoRestCountdownCueAdapter.test.ts
  - app/workout/[sessionId].tsx
  - src/ui/components/AdvancedTimingConfigSheet.tsx
  - src/ui/components/AdvancedTimingIndicator.tsx
  - src/ui/screens/OwnedPlanEditorScreen.tsx
  - src/ui/screens/ActiveWorkoutScreen.tsx
  - src/ui/__tests__/OwnedPlanEditor.test.tsx
  - src/ui/__tests__/AdvancedTimingConfigSheet.test.tsx
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
    - "D-01: both modes offer owner-configurable haptic, audio, or both channels using the existing RestCountdownCuePort and HapticsPort adapters with no new native dependency."
    - "D-02: an exercise default and each warm-up/working-set override can independently be off, inherit, per-rep, or cluster as applicable; precedence is set override then exercise default, and owned-plan/session persistence survives relaunch."
    - "D-03: configuration and cue expansion still invoke only the separate advanced machine; v1.0 rest state, commands, notification reconciliation, and RestDock behavior remain unchanged."
    - "D-04: audio permission denial and audio/haptic rejection are caught after advanced-state commit and leave session_sets, workout facts, session_rest_states, and their revisions byte-identical."
    - "Every new control has an exact accessible name, visible focus, keyboard/D-pad activation, a non-color cue, and a >=48dp target across responsive/theme/200%-text/reduced-motion matrices."
  artifacts:
    - {path: src/ui/components/AdvancedTimingConfigSheet.tsx, provides: shared exercise/set mode, parameter, and channel editor}
    - {path: src/domains/plans/ownedPlanCommands.ts, provides: revision-checked timing config persistence in the owned-plan aggregate}
    - {path: src/platform/audio/expoRestCountdownCueAdapter.ts, provides: reused advisory audio channel}
    - {path: tests/integration/advanced-timing.test.ts, provides: precedence and failed-channel integrity matrix}
  key_links:
    - {from: OwnedPlanEditorScreen exercise/set controls, to: ownedPlanRepository, via: one revision-checked aggregate save carrying canonical timing config}
    - {from: ActiveWorkoutScreen set editor, to: session snapshot config, via: advancedTimingRepository without rewriting completed set facts}
    - {from: due advanced transition, to: RestCountdownCuePort and HapticsPort, via: selected channel dispatch after commit with independent catches}
---

<objective>Complete the configuration and cue matrix: per-exercise defaults, per-set overrides, owned-plan/session persistence, haptic/audio/both delivery, and accessible compact controls while preserving the advisory-only and separate-machine contracts.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/10-advanced-set-timing/10-CONTEXT.md
@.planning/phases/10-advanced-set-timing/10-RESEARCH.md
@.planning/phases/10-advanced-set-timing/10-02-SUMMARY.md

Implementation anchors: `src/domains/rest/restCountdownCuePort.ts:1-4`, `src/bootstrap/restCountdownCue.ts:1-14`, and `src/platform/audio/expoRestCountdownCueAdapter.ts:23-43` provide the existing audio boundary; `src/domains/workout/hapticsPort.ts:1-3` and `src/platform/haptics/expoHapticsAdapter.ts:10-16` provide haptics; `src/ui/components/RestDock.tsx:205-330` provides the foreground generation ledger/caught-failure pattern; and `src/platform/sqlite/repositories/plansWorkoutRepository.ts:758-925` provides snapshot precedence/copy points.
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Persist exercise defaults and per-set overrides through owned-plan and session commands</name>
  <files>src/domains/plans/ownedPlanCommands.ts, src/domains/plans/ownedPlanCommands.test.ts, src/platform/sqlite/repositories/ownedPlanRepository.ts, src/platform/sqlite/repositories/advancedTimingRepository.ts, src/bootstrap/ownedPlanRuntime.tsx, src/bootstrap/ownedPlanRuntime.test.ts, src/bootstrap/workoutAppRuntime.tsx, tests/integration/advanced-timing.test.ts, src/testing/contracts/migrationsEffects.contract.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>src/domains/plans/ownedPlanCommands.ts, src/platform/sqlite/repositories/ownedPlanRepository.ts, src/bootstrap/ownedPlanRuntime.tsx, src/platform/sqlite/repositories/plansWorkoutRepository.ts, src/platform/sqlite/repositories/advancedTimingRepository.ts, .planning/phases/09-in-workout-exercise-editing/09-05-plan-writeback-PLAN.md</read_first>
  <action>Extend the owned-plan draft/save aggregate to carry canonical exercise timing defaults and nullable overrides for every warm-up and working target. Validate all config at the domain boundary; persist in the same revision-checked owned-plan transaction and include it in idempotency/hash semantics. Preserve config in Phase 9 add/replace/reorder and optional plan-writeback paths: new occurrences default off, copied occurrences retain their config, replacements take the replacement/default policy deliberately, and write-back carries final explicit timing choices without altering recorded history. Add active-session commands to update a not-completed session exercise default or set override/resolved value; reject completed/undo-referenced facts and stale revisions. Resolution is always set override then exercise default. Test owned-plan save/replay/stale/failure rollback, both plan graphs at workout start, set inherit/override/clear, config isolation from later plan edits, force-stop/reload, and equivalent real Expo SQLite cases. Snapshot completed rows/rest state around every config edit and require byte equality. Keep changed command/repository modules at 100%.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/plans/ownedPlanCommands.test.ts src/bootstrap/ownedPlanRuntime.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/advanced-timing.test.ts &amp;&amp; npm run test:coverage -- --runInBand</automated><native>npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/phase10/build.json</native></verify>
  <acceptance_criteria>D-02 is repository-proven at both exercise and set scope with set-over-exercise precedence, owned-plan/session relaunch persistence, and no later plan drift; D-03/D-04 hold because config edits do not touch completed or rest facts.</acceptance_criteria>
  <done>All required scopes persist canonical timing configuration through the existing aggregate/private-writer boundaries.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Reuse existing audio and haptic ports for the full cue-channel matrix</name>
  <files>src/bootstrap/workoutAppRuntime.tsx, src/bootstrap/restCountdownCue.ts, src/domains/rest/restCountdownCuePort.ts, src/platform/audio/expoRestCountdownCueAdapter.ts, src/platform/audio/expoRestCountdownCueAdapter.test.ts, app/workout/[sessionId].tsx, src/platform/sqlite/repositories/advancedTimingRepository.ts, src/ui/components/AdvancedTimingIndicator.tsx, src/ui/__tests__/AdvancedTimingIndicator.test.tsx, tests/integration/advanced-timing.test.ts</files>
  <read_first>src/domains/rest/restCountdownCuePort.ts, src/bootstrap/restCountdownCue.ts, src/platform/audio/expoRestCountdownCueAdapter.ts, src/platform/audio/expoRestCountdownCueAdapter.test.ts, src/domains/workout/hapticsPort.ts, src/platform/haptics/expoHapticsAdapter.ts, src/ui/components/RestDock.tsx</read_first>
  <action>At the existing route/bootstrap composition boundary (`app/workout/[sessionId].tsx` and `useRestCountdownCue`), pass the same existing `RestCountdownCuePort` to the advanced indicator/runtime rather than adding a package or native module. Map a per-rep tick to `playShortCue`; map cluster gap start/end to a documented short/long convention. Dispatch selected `haptic`, `audio`, or `both` only after the corresponding advanced transition committed. In `both`, isolate promises so one rejected channel does not suppress the other; catch all failures and show a non-blocking advisory message (`Timing cue unavailable` plus text that the timer and recorded set remain accurate). Treat denied/unavailable audio identically: never stop/revert advanced state, never call set/rest commands, and never request rest-notification permission. Add adapter/component/integration tests for each channel, one failure, both failures, foreground ledger de-duplication, no background replay, and byte equality of session/rest facts and revisions.</action>
  <verify><automated>npm run test:unit -- --runInBand src/platform/audio/expoRestCountdownCueAdapter.test.ts &amp;&amp; npm run test:components -- --runInBand src/ui/__tests__/AdvancedTimingIndicator.test.tsx &amp;&amp; npm run test:integration -- --runInBand tests/integration/advanced-timing.test.ts</automated></verify>
  <acceptance_criteria>D-01 exposes haptic/audio/both through existing ports only; D-04 is explicitly tested for denied audio and rejected audio/haptics, with durable advanced progress preserved and every recorded set/rest fact and rest revision unchanged.</acceptance_criteria>
  <reversibility rating="one-way">Cue outcomes remain non-authoritative under D-04; no future channel may be inserted into a recorded-fact transaction.</reversibility>
  <done>All approved cue channels are best-effort, independently failure-contained, and dependency-neutral.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add complete per-exercise and per-set configuration UI</name>
  <files>src/ui/components/AdvancedTimingConfigSheet.tsx, src/ui/components/AdvancedTimingIndicator.tsx, src/ui/screens/OwnedPlanEditorScreen.tsx, src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/__tests__/OwnedPlanEditor.test.tsx, src/ui/__tests__/AdvancedTimingConfigSheet.test.tsx, src/ui/__tests__/AdvancedTimingIndicator.test.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, maestro/phase10/advanced-set-timing.yaml</files>
  <read_first>src/ui/screens/OwnedPlanEditorScreen.tsx, src/ui/__tests__/OwnedPlanEditor.test.tsx, src/ui/components/PlanEditorFields.tsx, src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/components/AdvancedTimingIndicator.tsx, .planning/design/v1.1-UX-FLOW.md</read_first>
  <action>Create one reusable config sheet opened from the owned-plan exercise overflow and each warm-up/working-set editor, plus the active workout exercise/set overflow. Exercise scope offers Off, Per-rep, Cluster and parameters/channels; set scope additionally offers `Inherit exercise timing`. Show the resolved mode summary inline, validate/canonicalize interval and `3+3+3` grouping before save, and preserve unsaved edits on validation errors. In active sessions, completed sets are read-only and explain why. Keep the overview change to a small indicator only. Every selector/input/action has an exact name including scope, visible focus state, keyboard/D-pad activation, non-color selected/error/status treatment and >=48dp target. Add component matrices for System/Light/Dark, compact/medium/expanded, fontScale 2, reduced motion, screen-reader names/states, focus, Enter/Space/D-pad, and validation. Extend native flow to save an exercise default, override one set, relaunch the plan editor and active session, and prove override precedence plus haptic/audio/both selection.</action>
  <verify><automated>npm run test:components -- --runInBand src/ui/__tests__/OwnedPlanEditor.test.tsx src/ui/__tests__/AdvancedTimingConfigSheet.test.tsx src/ui/__tests__/AdvancedTimingIndicator.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx &amp;&amp; npm run typecheck</automated><native>npm run test:maestro:phase10 -- --manifest artifacts/native/phase10/build.json</native></verify>
  <acceptance_criteria>D-01 channel choice and D-02 exercise/set scope are usable and persistent; all controls pass accessible-name, visible-focus, D-pad/keyboard, non-color, >=48dp, theme/width/200%-text/reduced-motion assertions; D-03 leaves RestDock behavior unchanged.</acceptance_criteria>
  <done>The owner can configure and understand effective advanced timing at both required scopes with full accessibility.</done>
</task>
</tasks>

<verification>Run owned-plan/session persistence and real Expo contracts, full channel failure matrix, component accessibility/responsive matrices, 100% coverage, and native exercise-default/set-override/relaunch proof.</verification>
<success_criteria>Roadmap criteria 1-3 are complete across both modes and all three cue choices; per-exercise/per-set settings persist with correct precedence, and every cue remains advisory and non-authoritative.</success_criteria>
<output>Create `.planning/phases/10-advanced-set-timing/10-03-SUMMARY.md` when done.</output>
