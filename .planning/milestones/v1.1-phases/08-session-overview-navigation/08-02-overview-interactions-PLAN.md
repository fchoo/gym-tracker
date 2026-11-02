---
phase: 08-session-overview-navigation
plan: 02
type: execute
wave: 2
depends_on: [08-01]
files_modified:
  - src/ui/screens/ActiveWorkoutScreen.tsx
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - maestro/phase8/session-overview.yaml
autonomous: true
requirements: [WORK-19]
must_haves:
  truths:
    - Per D-01, completed and earlier exercises auto-collapse to an accessible one-line summary while active/upcoming exercises remain expanded and a collapsed section expands on tap.
    - Per D-04, non-active compact set rows expand their existing editor on tap; the active editor remains mounted by default.
    - Per D-02, a committed completion scrolls the newly active set into view, animated normally and non-animated under reduced motion.
    - Transient expansion and scroll state is keyed by stable IDs and never becomes a domain field or authoritative workout fact.
  artifacts:
    - {path: src/ui/screens/ActiveWorkoutScreen.tsx, provides: collapsible memoized sections, compact-row expansion, and reduced-motion-aware advancement}
    - {path: src/ui/__tests__/ActiveWorkoutScreen.test.tsx, provides: interaction, accessibility, motion, and completion regression proof}
  key_links:
    - {from: exercise status and activeExerciseId, to: default collapsed state, via: stable model identity}
    - {from: command-returned activeSetId, to: measured scroll request, via: applyView followed by target layout}
---

<objective>Expand the tracer into the complete overview interaction model: manageable long-session sections, tap-to-edit compact rows, and automatic movement to the next authoritative active set.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/08-session-overview-navigation/08-CONTEXT.md
@.planning/phases/08-session-overview-navigation/08-RESEARCH.md
@.planning/phases/08-session-overview-navigation/08-01-SUMMARY.md
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Add accessible exercise collapse and compact-row expansion</name>
  <files>src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, maestro/phase8/session-overview.yaml</files>
  <read_first>src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, src/domains/workout/activeWorkout.ts</read_first>
  <behavior>
    - Exercises with status completed, plus exercises before the active exercise in model order, initially collapse; active and upcoming exercises initially expand. Status `completed` remains authoritative and is never inferred from ordinal.
    - A collapsed section shows name plus top working-set observation when available, otherwise `Done`, with visible status text/icon and exact accessible name `{name}. {status}. {completed} of {total} working sets. Expand exercise`.
    - Press, Enter/Space, or accessibility activate expands a collapsed section; its 48dp control reports expanded/collapsed state and has visible focus.
    - A compact non-active set row exposes `{set label}. {formatted value}. {status}. Expand set editor`; activating it mounts the same rich SetRow, and selecting another compact row keeps only one non-active editor expanded.
    - Active-set editor visibility wins over local collapse/expansion overrides after an authoritative view transition.
    - The component matrix reuses repository conventions rather than visual-only assertions: exact accessibility label/state queries, `fireEvent(..., "focus")` focus-ring checks, `keyDown` Enter/Space activation, visible text/icon status cues, and `minHeight`/`minWidth: 48` style assertions.
  </behavior>
  <action>RED first. Add stable-ID local presentation state and memoized exercise sections. Derive default collapse from explicit completed status and relative position to activeExerciseId, then allow a user-expanded collapsed section. Use text plus icon/non-color status cues, accessibilityState.expanded, visible focus, and minimum 48dp targets. In `ActiveWorkoutScreen.test.tsx`, follow the existing `M3FilterChip.test.tsx`/`foundation.test.tsx` interaction pattern: query exact role/name/state, fire focus and assert the theme focus ring, fire `keyDown` with Enter and Space and assert one activation per key, assert a visible textual/icon status independent of color, and assert every new exercise/compact-row/overflow control has at least 48dp height and width where glyph-only. Compact rows only choose which existing SetRow mounts; they must not duplicate validation, persistence, completion, correction, or removal logic. Extend the Phase 8 Maestro tracer to expand an earlier collapsed exercise and a compact non-active row in place.</action>
  <verify><automated>npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx &amp;&amp; npm run typecheck &amp;&amp; npm run check:boundaries &amp;&amp; maestro test maestro/phase8/session-overview.yaml</automated></verify>
  <acceptance_criteria>D-01 and D-04 pass zero/one/many, long-name, keyboard/D-pad, non-color, 48dp, compact/medium/expanded, and 200%-text component cases without changing workout facts.</acceptance_criteria>
  <done>Long workouts stay scannable and every non-active row remains explicitly reachable for editing.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Auto-scroll only after authoritative active-set advancement</name>
  <files>src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/__tests__/ActiveWorkoutScreen.test.tsx, maestro/phase8/session-overview.yaml</files>
  <read_first>src/ui/screens/ActiveWorkoutScreen.tsx, src/ui/layout/AdaptiveScreen.tsx, src/ui/theme/index.ts, src/ui/__tests__/ActiveWorkoutScreen.test.tsx</read_first>
  <behavior>
    - Initial entry/resume jumps to the measured activeSetId within the full list without animation.
    - A successful completeSet result that changes activeSetId expands the destination section/editor, waits for its layout, and issues exactly one scroll request.
    - The advancement request uses animated true normally and false when useAppTheme().reduceMotion is true.
    - Failed/retried completion, unchanged/null activeSetId, unrelated rerenders, and stale layout events do not scroll or acknowledge completion.
    - RestDock, eight-second Undo, row removal/correction, and exact retry inputs remain unchanged around the scroll effect.
    - Responsive/theme/motion cases render the real overview under System, Light, and Dark appearance stores; explicit 360/720/1024 widths assert compact/medium/expanded layout labels; a `Dimensions` fontScale 2 case proves long labels and actions remain reachable; and `AppearanceProvider reduceMotion` proves the same authoritative advancement uses `animated: false`.
  </behavior>
  <action>RED first. Track the previous authoritative activeSetId and a pending target ID around the existing awaited applyView path. Resolve the target across all exercises, ensure its section and editor are visible, accept only the matching post-layout measurement, and send one keyed request using `animated: !reduceMotion`. Keep entry anchoring distinct from advancement so stale restore/layout values cannot fire. Add table-driven width cases using the existing `width` prop and `{compact|medium|expanded} layout` accessibility labels from `foundation.test.tsx`/`OwnedPlanEditor.test.tsx`; render System with `createMemoryAppearanceStore(null)` and explicit Light/Dark stores; set `Dimensions` screen/window `fontScale: 2` and restore it after unmount as in `OwnedPlanEditor.test.tsx`; and render once with `<AppearanceProvider reduceMotion>` to assert the scroll request flips from animated to non-animated without changing its target. Extend the Maestro tracer to assert that the next Complete action becomes visible after a successful completion. Do not set completed/rest state optimistically.</action>
  <verify><automated>npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx &amp;&amp; npm run test:unit -- --runInBand src/bootstrap/workoutLifecycle.test.ts &amp;&amp; npm run typecheck &amp;&amp; npm run lint &amp;&amp; maestro test maestro/phase8/session-overview.yaml</automated></verify>
  <acceptance_criteria>D-02 and D-05 tests prove post-commit next-set scrolling, reduced-motion jumping, stale/no-op suppression, and unchanged commit-gated completion, Undo, rest, and lifecycle authority.</acceptance_criteria>
  <done>The one-tap loop advances visually to the correct authoritative row without motion-policy or lifecycle regressions.</done>
</task>
</tasks>

<verification>Run the full ActiveWorkoutScreen suite under normal and mocked reduced-motion themes, the workout lifecycle unit suite, typecheck, lint, boundaries, and `git diff --check`.</verification>
<success_criteria>Roadmap criterion 2 is complete: the active row is reachable, Complete remains one tap, and successful advancement lands on the next row while Undo/rest semantics remain v1.0-identical.</success_criteria>
<output>Create `.planning/phases/08-session-overview-navigation/08-02-SUMMARY.md` when done.</output>
