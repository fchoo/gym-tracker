---
phase: 08-session-overview-navigation
plan: 03
type: execute
wave: 3
depends_on: [08-02]
files_modified:
  - app/_layout.tsx
  - app/workout/[sessionId].tsx
  - app/workout-plan/[sessionId].tsx
  - app/__phase2-attended-preview.tsx
  - app/__tests__/phase2-attended-preview.test.tsx
  - src/testing/phase2AttendedPreviewFixtures.ts
  - src/ui/screens/RootScreens.tsx
  - src/ui/screens/ActiveWorkoutScreen.tsx
  - src/ui/screens/WorkoutPlanOverviewScreen.tsx
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - src/ui/__tests__/WorkoutPlanOverviewRoute.test.tsx
  - maestro/phase8/session-overview.yaml
autonomous: true
requirements: [WORK-19]
must_haves:
  truths:
    - Per D-07, EmptyWorkoutView and ActiveWorkoutView enter one overview shell; empty sessions show zero set rows and a prominent disabled Phase 9 Add-exercise affordance.
    - Per D-03 and D-06, reviewExerciseId, reviewingEarlierOrLater, onReturnToCurrent, review eyebrow/banner, and review-only route navigation are retired rather than hidden.
    - Empty-session save-zero, finish-later, and discard confirmations keep their exact existing command semantics.
    - The costly D-03 removal updates screen props, route/runtime wiring, stack registration, Phase-2 preview fixtures, and tests as one coherent compatibility cut.
  artifacts:
    - {path: app/workout/[sessionId].tsx, provides: one union-safe session route with no review query mode}
    - {path: src/ui/screens/ActiveWorkoutScreen.tsx, provides: overview shell for active and empty WorkoutSessionView arms}
    - {path: app/__phase2-attended-preview.tsx, provides: preview state aligned to overview-only navigation}
  key_links:
    - {from: runtime.getActiveWorkout, to: overview shell, via: unmodified WorkoutSessionView discriminated union}
    - {from: empty overview outcome controls, to: existing runtime commands, via: revision-checked save/discard calls}
---

<objective>Converge every start/resume path onto the overview, including empty workouts, and remove the obsolete focused-versus-reviewing navigation contract completely.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/08-session-overview-navigation/08-CONTEXT.md
@.planning/phases/08-session-overview-navigation/08-RESEARCH.md
@.planning/phases/08-session-overview-navigation/08-02-SUMMARY.md
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Unify EmptyWorkoutView into the session overview</name>
  <files>app/workout/[sessionId].tsx, src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, src/ui/__tests__/WorkoutPlanOverviewRoute.test.tsx, maestro/phase8/session-overview.yaml</files>
  <read_first>app/workout/[sessionId].tsx, src/domains/workout/activeWorkout.ts, src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, src/ui/__tests__/WorkoutPlanOverviewRoute.test.tsx</read_first>
  <behavior>
    - Both WorkoutSessionView union arms render the same sticky header, overview scroll owner, and list-end Add exercise affordance.
    - Empty view renders no exercise/set selector and visibly shows `+ Add exercise`; it is disabled with accessible name `Add exercise. Available in Phase 9.` and disabled state, with a minimum 48dp target and non-color explanatory copy.
    - Populated overview exposes the same affordance after its last exercise; no add/replace/remove/reorder exercise behavior exists.
    - Save zero-set and discard require their existing confirmations and revision inputs; finish later remains available; loading/error refresh never shows stale prior-session content.
  </behavior>
  <action>RED first. Broaden the overview shell to accept WorkoutSessionView and make its active-only work type-safe behind the discriminant. Move the route's separate empty render/confirmation state into the shared shell while preserving runtime command calls and navigation outcomes exactly. Repurpose the obsolete route test into an active-route union/loading test rather than creating duplicate coverage. Extend the Phase 8 Maestro fixture/flow with an empty-session launch that proves the overview header, zero set rows, disabled Add-exercise affordance, and existing confirmation path. Render disabled Phase-9 entry affordances only; no exercise mutation command or domain field may be added.</action>
  <verify><automated>npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx src/ui/__tests__/WorkoutPlanOverviewRoute.test.tsx &amp;&amp; npm run typecheck &amp;&amp; npm run check:boundaries &amp;&amp; maestro test maestro/phase8/session-overview.yaml</automated></verify>
  <acceptance_criteria>D-07 tests prove empty and populated sessions share one overview, zero rows are present for empty, the exact accessible Add-exercise affordance is prominent, and all existing zero-set/discard outcomes remain revision-checked.</acceptance_criteria>
  <done>Roadmap criterion 3 is implemented without Phase 9 behavior or model changes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Retire the costly review/focus route and preview contract</name>
  <files>app/_layout.tsx, app/workout/[sessionId].tsx, app/workout-plan/[sessionId].tsx, app/__phase2-attended-preview.tsx, app/__tests__/phase2-attended-preview.test.tsx, src/testing/phase2AttendedPreviewFixtures.ts, src/ui/screens/RootScreens.tsx, src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/screens/WorkoutPlanOverviewScreen.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, src/ui/__tests__/WorkoutPlanOverviewRoute.test.tsx, maestro/phase8/session-overview.yaml</files>
  <read_first>app/_layout.tsx, app/workout/[sessionId].tsx, app/workout-plan/[sessionId].tsx, app/__phase2-attended-preview.tsx, src/testing/phase2AttendedPreviewFixtures.ts, src/ui/screens/WorkoutPlanOverviewScreen.tsx, src/ui/screens/ActiveWorkoutScreen.tsx</read_first>
  <behavior>
    - ActiveWorkoutScreen has no reviewExerciseId/onReturnToCurrent props or reviewingEarlierOrLater/viewedExercise branches.
    - The route no longer parses or emits reviewExerciseId. Before touching `WorkoutPlanOverviewScreen`, all consumers are inventoried and classified as review-only versus retained; only the obsolete review route/navigation machinery is unconditionally removed.
    - Any non-review responsibility found in a touched surface (loading, error, empty/cardinality presentation, exercise/status summary, back/return behavior) is either migrated to the unified active-session overview with an explicit regression test or kept in a stripped read-only screen; the screen file and Stack entry are deleted only when the retained-consumer set is proven empty.
    - `FOCUSED WORKOUT`, `REVIEWING WORKOUT`, `Reviewing another exercise`, and `Return to current exercise` disappear from production and Phase-2 preview code.
    - More sheet, RestDock, confirmation sheets, row actions, and overview header remain reachable on the sole active surface.
  </behavior>
  <action>RED first. Perform D-03 as one costly compatibility cut, but scope deletion to review machinery rather than assuming the whole plan-overview surface is disposable. Start with the concrete retained-consumer audit `rg -n 'WorkoutPlanOverviewScreen|workout-plan/|onOpenWorkoutPlan|reviewExerciseId|onReviewExercise' app src tests maestro scripts`: the current tree shows the route, ActiveWorkoutScreen launcher, Phase-2 attended preview, and component/route tests. Classify every hit. Remove `reviewExerciseId`, `onReturnToCurrent`, `viewedExercise`/`reviewingEarlierOrLater`, review banner/copy, and review navigation. Migrate loading/error/empty/cardinality and exercise/status-list responsibilities needed by the unified route or Phase-2 preview into the overview shell and prove each with route/preview tests. Delete `app/workout-plan/[sessionId].tsx`, `WorkoutPlanOverviewScreen`, and the Stack entry only if a second post-migration grep proves no retained consumer or non-review responsibility remains; otherwise retain and rename/strip the read-only surface without any route-to-review behavior. Update ActiveWorkoutLoadingScreen copy. The runtime provider itself has no review prop, so verify its `getActiveWorkout` wiring remains unchanged. Replace review/focus assertions and the Phase 8 Maestro tracer with all-exercises-on-one-surface assertions.</action>
  <verify><automated>! grep -R -n -E 'reviewExerciseId|onReturnToCurrent|reviewingEarlierOrLater|FOCUSED WORKOUT|REVIEWING WORKOUT|Return to current exercise' app src &amp;&amp; (rg -n 'WorkoutPlanOverviewScreen|workout-plan/|onOpenWorkoutPlan' app src tests maestro scripts || true) &amp;&amp; npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx src/ui/__tests__/WorkoutPlanOverviewRoute.test.tsx app/__tests__/phase2-attended-preview.test.tsx &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries &amp;&amp; maestro test maestro/phase8/session-overview.yaml</automated></verify>
  <acceptance_criteria>D-03 and D-06 are complete: only the overview navigation model exists, every review/focus contract and fixture is removed, and all formerly gated v1.0 controls remain available. D-03 reversibility is costly because restoring focus later would require rebuilding screen props, route/runtime wiring, and preview fixtures.</acceptance_criteria>
  <done>Starting, resuming, previewing, and navigating an active workout all use the one overview surface; the execution summary records the consumer inventory and disposition of every non-review responsibility before any screen/route deletion.</done>
  <reversibility rating="costly">Reintroducing focused/review mode requires rebuilding screen props, route/runtime wiring, review navigation, and Phase-2 preview state.</reversibility>
</task>
</tasks>

<verification>Run focused screen and route suites, source grep for retired symbols/copy, typecheck, lint, boundaries, and `git diff --check`; verify the only production active-workout route accepts both union arms.</verification>
<success_criteria>Roadmap criteria 1 and 3 are true from the real route, and D-03/D-06 leave no second active-workout navigation model.</success_criteria>
<output>Create `.planning/phases/08-session-overview-navigation/08-03-SUMMARY.md` when done.</output>
