---
phase: 08-session-overview-navigation
plan: 04
type: execute
wave: 4
depends_on: [08-03]
files_modified:
  - package.json
  - scripts/run-phase8-maestro.mjs
  - scripts/phase8-evidence-scripts.test.mjs
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - scripts/run-phase2-maestro.mjs
  - scripts/phase2-evidence-scripts.test.mjs
  - maestro/subflows/phase1-start-full-body-a.yaml
  - maestro/lifecycle/rest-recovery.yaml
  - maestro/smoke/phase1-full-loop.yaml
  - maestro/smoke/phase1-denied-late-notifications.yaml
  - maestro/phase2/remediation-workout.yaml
  - maestro/phase2/schedule-cross-profile.yaml
  - maestro/phase2/plan-impact-replacement.yaml
  - maestro/phase5/core-workout-lifecycle.yaml
  - maestro/phase6/progress-library.yaml
  - maestro/phase7/workout-removal-audio.yaml
  - maestro/phase8/session-overview.yaml
autonomous: true
requirements: [WORK-19]
must_haves:
  truths:
    - Lifecycle-visible overview behavior has native Maestro proof for all-exercise rendering, active-row resume anchoring, inline Complete, Undo, RestDock, rotation/background, process death, and notification reconciliation.
    - All retired focus/review selector copy is migrated without deleting the underlying v1.0 lifecycle assertions.
    - System/Light/Dark, compact/medium/expanded, 200% text, reduced motion, exact accessible names, visible focus, keyboard/D-pad activation, non-color cues, and 48dp targets have automated or native coverage.
    - The full test and coverage gates pass; integrity-critical domain/application modules retain 100% statement/branch/function/line coverage despite no intended domain change.
  artifacts:
    - {path: maestro/lifecycle/rest-recovery.yaml, provides: overview-aware rotation and process-death recovery proof}
    - {path: maestro/phase2/remediation-workout.yaml, provides: all-exercise overview traversal replacing review-mode steps}
    - {path: scripts/run-phase2-maestro.mjs, provides: updated lifecycle-visible flow contract}
  key_links:
    - {from: existing lifecycle seeds, to: overview selectors, via: stable accessible names and set IDs}
    - {from: source gates, to: WORK-19 completion, via: full test and coverage commands}
---

<objective>Migrate the native verification surface and prove the overview preserves every v1.0 lifecycle, integrity, accessibility, responsive, theme, and reduced-motion guarantee.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/08-session-overview-navigation/08-CONTEXT.md
@.planning/phases/08-session-overview-navigation/08-RESEARCH.md
@.planning/phases/08-session-overview-navigation/08-03-SUMMARY.md
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Replace retired review/focus Maestro selectors with overview evidence</name>
  <files>package.json, scripts/run-phase8-maestro.mjs, scripts/phase8-evidence-scripts.test.mjs, scripts/run-phase2-maestro.mjs, scripts/phase2-evidence-scripts.test.mjs, maestro/subflows/phase1-start-full-body-a.yaml, maestro/lifecycle/rest-recovery.yaml, maestro/smoke/phase1-full-loop.yaml, maestro/smoke/phase1-denied-late-notifications.yaml, maestro/phase2/remediation-workout.yaml, maestro/phase2/schedule-cross-profile.yaml, maestro/phase2/plan-impact-replacement.yaml, maestro/phase5/core-workout-lifecycle.yaml, maestro/phase6/progress-library.yaml, maestro/phase7/workout-removal-audio.yaml, maestro/phase8/session-overview.yaml</files>
  <read_first>scripts/run-phase2-maestro.mjs, scripts/phase2-evidence-scripts.test.mjs, maestro/phase2/remediation-workout.yaml, maestro/lifecycle/rest-recovery.yaml, maestro/smoke/phase1-full-loop.yaml, maestro/smoke/phase1-denied-late-notifications.yaml</read_first>
  <behavior>
    - Phase-2 remediation proves multiple exercise names and set statuses coexist on one overview, a collapsed earlier exercise expands in place, and no return-to-current trip exists.
    - Rest recovery proves the next active row/Complete action is visible after rotation, backgrounding, process death, resume, pause/resume, and skip-rest.
    - Full-loop and denied/late/stale notification flows retain their completion, Undo, rest, and reconciliation assertions while using overview selectors.
    - Every remaining `FOCUSED WORKOUT` or `REVIEWING WORKOUT` assertion in affected phase flows is replaced by a semantic overview assertion, not merely deleted.
    - `ActiveWorkoutScreen.test.tsx` follows existing component conventions to check the Phase 8 surface in System/Light/Dark appearance, at compact/medium/expanded widths, at `Dimensions` fontScale 2, with reduced motion, visible focus, Enter/Space activation, exact accessibility labels/states, text/icon non-color status cues, and 48dp minimum targets.
    - The Phase 8 native runner follows the Phase 5/6/7 ADB convention: save `settings get system font_scale`, set `font_scale` to `2.0` for the dedicated overview flow, restore it in cleanup, and fail evidence validation unless restoration is recorded; the flow uses `pressKey: TAB`/`pressKey: ENTER` on the overview controls as already used by `maestro/phase6/progress-library.yaml`.
  </behavior>
  <action>Update the existing public flows and Phase-2 runner contract rather than cloning those flows. Replace the Today-plan review/return sequence with in-overview traversal and expansion. Add active-set visibility after each resume point and retain all existing mutation/rest/notification checkpoints. Add a thin fail-closed Phase 8 runner and package script that invoke the dedicated tracer plus the existing changed lifecycle flows against one declared manifest, validating paths and subprocess failures in a node:test contract. In `ActiveWorkoutScreen.test.tsx`, add one explicit verification matrix using the established patterns: `createMemoryAppearanceStore(null | "Light" | "Dark")`/`AppearanceProvider` as in `M3FilterChip.test.tsx`, with `Appearance.getColorScheme` mocked for the System case as in `foundation.test.tsx`; the `width` prop plus `{compact|medium|expanded} layout` label as in `foundation.test.tsx` and `OwnedPlanEditor.test.tsx`; `Dimensions.set(...fontScale: 2)` with unmount/finally restoration as in `OwnedPlanEditor.test.tsx`; `AppearanceProvider reduceMotion` and scroll-spy assertions that advancement changes from `animated: true` to `false`; `fireEvent(..., "focus")` plus focus-ring style and `keyDown` Enter/Space as in `foundation.test.tsx`; and role/name, `accessibilityState.expanded/disabled/selected`, visible text/icon status, and `minHeight`/`minWidth: 48` checks. In the native runner, reuse the Phase 5/6/7 saved-font-scale setup/restore contract and add `TAB`/`ENTER` overview activation plus semantic visibility assertions to `maestro/phase8/session-overview.yaml`. Prefer role/accessibility text and stable ID selectors; avoid repeated per-exercise index selectors.</action>
  <verify><automated>npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx &amp;&amp; node --test scripts/phase2-evidence-scripts.test.mjs scripts/phase8-evidence-scripts.test.mjs &amp;&amp; ! grep -R -n -E 'FOCUSED WORKOUT|REVIEWING WORKOUT|Return to current exercise' maestro &amp;&amp; npm run typecheck</automated></verify>
  <acceptance_criteria>D-01, D-02, D-03, D-04, D-05, and D-06 have lifecycle-visible Maestro assertions, and no retired selector is removed without an overview replacement preserving the original v1.0 guarantee.</acceptance_criteria>
  <done>The native flow corpus speaks the single-overview contract and retains all critical workout-loop checks.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Run the Phase 8 source, coverage, and native regression gate</name>
  <files>package.json, scripts/run-phase8-maestro.mjs, scripts/phase8-evidence-scripts.test.mjs</files>
  <read_first>package.json, jest.config.js, scripts/run-phase8-maestro.mjs, scripts/run-phase2-maestro.mjs, .planning/REQUIREMENTS.md</read_first>
  <behavior>
    - Typecheck, lint/boundaries, all Jest projects, and the repo's actual integrity gate `npm run test:coverage -- --runInBand` pass. That command runs `scripts/run-coverage-gate.mjs`, reads `coverage/coverage-summary.json`, and fails unless every registered integrity-critical file is present at exactly 100% statements, branches, functions, and lines.
    - The coverage-gate success report is checked for `ok: true`, `integrity_critical_files: 84`, `required_percent: 100`, and all four metrics; the generated summary is checked specifically for Phase 8's at-risk registered workout modules `src/domains/workout/activeWorkout.ts`, `setCommands.ts`, `undoCompletedSet.ts`, and `outcomes.ts`, each at 100% for all four metrics.
    - Phase-2 Maestro passes the overview/remediation and rest-recovery flows on the current dev-test APK.
    - Existing Phase-1, Phase-5, Phase-6, and Phase-7 files have no stale focus/review selector and remain runner-valid.
    - The verification matrix maps System/Light/Dark, compact/medium/expanded, 200% text, reduced motion, visible focus, keyboard/D-pad, non-color cues, and 48dp targets to the concrete `ActiveWorkoutScreen.test.tsx` cases and Phase 8 runner/flow assertions added in Task 1; the evidence-contract test fail-closes if any row or font-scale restoration is absent.
  </behavior>
  <action>Wire `test:maestro:phase8` to the thin runner from Task 1; do not clone flow logic or build a release candidate. Run the complete local source gate, then invoke `npm run test:coverage -- --runInBand` explicitly even though `test:all` currently includes it. Preserve and inspect the runner's JSON success report and `coverage/coverage-summary.json`; do not substitute Jest's 90/90/90/85 global thresholds for the standalone 100% per-file integrity check. Confirm all 84 registered files pass and explicitly inspect the four registered workout modules at risk from overview routing (`activeWorkout.ts`, `setCommands.ts`, `undoCompletedSet.ts`, `outcomes.ts`). Build/use the current dev-test artifact according to the existing manifest contract, and execute the Phase 8 tracer plus affected lifecycle flows. Treat Samsung N4 or other physical-device observations as observation-only and never as release authority.</action>
  <verify><automated>npm run typecheck &amp;&amp; npm run lint &amp;&amp; npm run check:boundaries &amp;&amp; npm run test:all -- --runInBand &amp;&amp; coverage_output="$(npm run test:coverage -- --runInBand)" &amp;&amp; printf '%s\n' "$coverage_output" &amp;&amp; printf '%s\n' "$coverage_output" | grep -q '"ok": true' &amp;&amp; printf '%s\n' "$coverage_output" | grep -q '"integrity_critical_files": 84' &amp;&amp; printf '%s\n' "$coverage_output" | grep -q '"required_percent": 100' &amp;&amp; node -e 'const s=require("./coverage/coverage-summary.json"); const p=require("node:path"); for (const f of ["src/domains/workout/activeWorkout.ts","src/domains/workout/setCommands.ts","src/domains/workout/undoCompletedSet.ts","src/domains/workout/outcomes.ts"]) for (const m of ["statements","branches","functions","lines"]) if (s[p.resolve(f)]?.[m]?.pct !== 100) throw new Error(`${f} ${m} is not 100%`)' &amp;&amp; npm run test:maestro:phase8 -- --manifest artifacts/native/phase2/build.json</automated></verify>
  <acceptance_criteria>D-07 and all other Phase 8 decisions are covered by green source/native checks; all four Roadmap success criteria pass, WORK-04 completed-row immutability remains unchanged, and integrity-critical coverage stays at 100% statements/branches/functions/lines.</acceptance_criteria>
  <done>WORK-19 has complete automated and lifecycle-visible proof with no Phase 9 behavior or release action.</done>
</task>
</tasks>

<verification>Run `npm run typecheck`, lint, boundaries, `npm run test:all -- --runInBand`, and the explicit `npm run test:coverage -- --runInBand` gate. Confirm its success report says `ok: true`, `integrity_critical_files: 84`, `required_percent: 100`, and statements/branches/functions/lines; inspect `coverage/coverage-summary.json` for the four Phase 8 at-risk workout modules at 100% in every metric. Then run Phase-2/Phase-8 evidence contract tests, stale-selector grep, and the Phase-8 Maestro suite against its declared dev-test manifest; evidence must include the Task 1 matrix mapping and successful restoration from native 200% font scale.</verification>
<success_criteria>All four Phase 8 roadmap criteria are demonstrated: one full overview, anchored inline Complete with unchanged Undo/rest, unified empty workout, and preserved process-death/rotation/background/notification behavior.</success_criteria>
<output>Create `.planning/phases/08-session-overview-navigation/08-04-SUMMARY.md` when done.</output>
