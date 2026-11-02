---
phase: 08-session-overview-navigation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/layout/AdaptiveScreen.tsx
  - src/ui/components/SetRow.tsx
  - src/ui/screens/ActiveWorkoutScreen.tsx
  - src/ui/__tests__/foundation.test.tsx
  - src/ui/__tests__/SetRow.test.tsx
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - maestro/phase8/session-overview.yaml
autonomous: true
requirements: [WORK-19]
must_haves:
  truths:
    - Per D-05, an active workout renders every exercise in model order and initially anchors the measured active set inside that full list.
    - Per D-06, the rendered active-workout surface is an overview rather than a one-exercise focus view.
    - Per D-04, the active set mounts the existing full SetRow editor and inline Complete action while other rows use a compact presentation.
    - Completion remains commit-gated and uses the existing command/result/applyView path; WORK-04 row-level history and all domain contracts remain untouched.
  artifacts:
    - {path: src/ui/screens/ActiveWorkoutScreen.tsx, provides: production multi-exercise overview tracer}
    - {path: src/ui/layout/AdaptiveScreen.tsx, provides: keyed measured scroll request on the sole outer scroll owner}
    - {path: src/ui/components/SetRow.tsx, provides: stable per-set overview selector support without changing editor semantics}
  key_links:
    - {from: ActiveWorkoutView.exercises, to: memoized exercise sections, via: stable exercise and set IDs}
    - {from: activeSetId row layout, to: AdaptiveScreen ScrollView, via: post-layout keyed scroll request}
    - {from: inline Complete, to: commands.completeSet, via: existing awaited revision-checked handler}
---

<objective>Deliver the tracer-first production slice of WORK-19: one real active session renders as a single scrollable overview, lands on its active set, and completes that set inline without weakening any v1.0 workout guarantee.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/08-session-overview-navigation/08-CONTEXT.md
@.planning/phases/08-session-overview-navigation/08-RESEARCH.md
@.planning/design/v1.1-UX-FLOW.md
</context>

<tasks>
<task type="tracer" tdd="true">
  <name>Task 1: Give the existing AdaptiveScreen scroll owner a measured active-set request</name>
  <files>src/ui/layout/AdaptiveScreen.tsx, src/ui/__tests__/foundation.test.tsx</files>
  <read_first>src/ui/layout/AdaptiveScreen.tsx, src/ui/__tests__/foundation.test.tsx, src/ui/components/SetRow.tsx</read_first>
  <behavior>
    - A keyed request scrolls the existing ScrollView to a supplied measured y only after that request is ready; a repeated key does not scroll twice.
    - The request controls animation independently from the existing non-animated restoration path and never creates a nested vertical scroll owner.
    - Absent requests and non-scrollable screens retain current behavior.
  </behavior>
  <action>RED first. Extend AdaptiveScreen with a small immutable measured-scroll request contract (target key, measured y, animated) while preserving scrollOffset/scrollRestoreKey behavior for existing consumers. Keep its ScrollView as the only vertical owner; do not introduce SectionList or another ScrollView. Clamp invalid/negative offsets and execute each request key once after layout data exists.</action>
  <verify><automated>npm run test:components -- --runInBand src/ui/__tests__/foundation.test.tsx &amp;&amp; npm run typecheck &amp;&amp; npm run check:boundaries</automated></verify>
  <acceptance_criteria>D-05 has a deterministic post-layout scroll primitive that can anchor a stable set ID without racing stale restore offsets, while all existing AdaptiveScreen layouts remain green.</acceptance_criteria>
  <done>The sole outer scroll owner can receive a measured one-shot active-set anchor.</done>
</task>

<task type="tracer" tdd="true">
  <name>Task 2: Render the live multi-exercise overview and preserve inline commit-gated Complete</name>
  <files>src/ui/components/SetRow.tsx, src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/__tests__/SetRow.test.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, maestro/phase8/session-overview.yaml</files>
  <read_first>src/domains/workout/activeWorkout.ts, src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/components/SetRow.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, src/ui/__tests__/SetRow.test.tsx</read_first>
  <behavior>
    - One AdaptiveScreen renders every exercise from view.exercises in source order with warm-up and working-set statuses inline; no SectionList or nested vertical scroll exists.
    - Stable namespaced selectors use exercise/set IDs so repeated per-exercise indexes cannot collide.
    - The active set alone mounts the rich SetRow editor by default, is visually and textually identified as current, and exposes the existing exact Complete action plus keyboard/D-pad activate behavior.
    - Awaiting Complete shows the existing saving state; rejected completion preserves values and does not start rest; resolved completion applies only the command-returned authoritative view and preserves Undo and RestDock behavior.
    - Exercise headers reserve a disabled 48dp overflow affordance labelled `More actions for {exercise name}. Available in Phase 9.`; no Phase 9 mutation is implemented.
    - Presentation lookup is exercise-agnostic: a stable set ID resolves to its owning exercise across `view.exercises`, but every existing mutation command type, payload, expected revision, idempotency key, commit gate, and `applyView` result path remains unchanged.
    - Focused regressions prove Complete, Skip exercise, Undo through the unchanged RestDock/runtime path, add warm-up/working set, remove warm-up/working set, and completed-set correction target the owning set/exercise selected from the overview rather than accidentally falling back to `currentExercise`.
  </behavior>
  <action>RED first. Replace the single viewedExercise render with memoized exercise sections inside AdaptiveScreen. Introduce one presentation-only stable-ID resolver that returns the owning exercise and set from `view.exercises`; use it wherever a rendered overview row currently re-reads through `currentExercise` (Complete, warm-up completion, draft update, add warm-up/working set source, remove warm-up/working set, completed-set correction, and Skip exercise). Do not widen or redesign `ActiveWorkoutCommands`: preserve the exact command payloads, expected session/exercise/set revisions, idempotency keys, awaited commit gates, authoritative return handling, and `applyView` calls. Undo is still owned by the existing RestDock/runtime contract; test that overview advancement supplies the correct committed/next-set identity and does not reroute or synthesize Undo. Add table-driven component regressions with two exercises whose set IDs/revisions and exercise revisions differ, asserting the exact owning identity sent for Complete, Skip, add warm-up, add working set, both remove variants, correction, and the unchanged Undo/RestDock handoff. Reuse SetRow and every command handler rather than cloning editor or mutation logic. Add only the compact display needed for non-active rows; expansion is Plan 08-02. Feed the active row's measured position into Task 1's non-animated entry request. Keep More sheet, removals/Undo, RestDock, completion/retry, and finish operations wired verbatim. Add a focused Maestro tracer that starts the real seeded workout, sees at least two exercises in the one overview, reaches the anchored active Complete action, completes it, and observes Undo/RestDock. Do not change domain types, repositories, persistence, or WORK-04 history semantics.</action>
  <verify><automated>npm run test:components -- --runInBand src/ui/__tests__/SetRow.test.tsx src/ui/__tests__/ActiveWorkoutScreen.test.tsx &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries &amp;&amp; maestro test maestro/phase8/session-overview.yaml</automated></verify>
  <acceptance_criteria>D-04, D-05, and D-06 are proven by component tests: all exercise/set statuses share one overview, the measured active row is the initial anchor, its editor and Complete are inline, every affected handler targets the owning exercise/set from stable overview identity, and completion/retry/Undo/rest assertions remain commit-gated and unchanged. Only presentation lookup changes; no mutation contract changes.</acceptance_criteria>
  <done>A production-quality end-to-end overview tracer works against the real ActiveWorkoutView and real command contract.</done>
</task>
</tasks>

<verification>Run the focused AdaptiveScreen, SetRow, and ActiveWorkoutScreen component suites, then typecheck, lint, boundaries, and `git diff --check`. Confirm no domain/application/persistence source changed.</verification>
<success_criteria>Roadmap criteria 1 and the active-set/Complete portion of criterion 2 work end-to-end before expansion behavior begins.</success_criteria>
<output>Create `.planning/phases/08-session-overview-navigation/08-01-SUMMARY.md` when done.</output>
