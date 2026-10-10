---
phase: 17
phase_name: library-running-plans
audited: "2026-10-11"
baseline: .planning/phases/17-library-running-plans/17-UI-SPEC.md
screenshots: not captured (no dev server on ports 3000, 5173, or 8080)
native_matrix: deferred to Phase 20 by owner direction
overall_score: 7/24
scores:
  copywriting: 2
  visuals: 1
  color: 1
  typography: 1
  spacing: 1
  experience_design: 1
registry_audit: skipped (components.json absent; no shadcn registry)
---

# Phase 17 — UI Review

**Audited:** 2026-10-11  
**Baseline:** `17-UI-SPEC.md`, with owner brief/decisions and source-precedence order applied.  
**Screenshots:** Not captured; no development server responded on ports 3000, 5173, or 8080.  
**Native proof:** APK, screenshots, and the native accessibility matrix are intentionally deferred to Phase20 and are not scored as Phase17 implementation defects.

## UI REVIEW COMPLETE

## Pillar Scores

| Pillar | Score | Key Finding |
|---|---:|---|
| 1. Copywriting | 2/4 | Several Phase17 screens use non-contract labels and state copy, including exercise no-match, Library retry, Running empty/error, and collision text. |
| 2. Visuals | 1/4 | Running detail/editor/session surfaces render raw React Native text and controls, so the approved Library/deep-route hierarchy is not actually applied. |
| 3. Color | 1/4 | Raw Running surfaces do not consume semantic theme colors; dark mode therefore has platform-default text/controls against the dark canvas. |
| 4. Typography | 1/4 | Running routes bypass `typeScale`; the session form contains unstyled `Text` and `TextInput`, and factual values use implementation units such as `ms`. |
| 5. Spacing | 1/4 | Shared deep headers are 48dp instead of 64dp, navigation rows are 48dp instead of 88dp, and the Running forms do not use the shared adaptive/inset layout. |
| 6. Experience Design | 1/4 | The core state logic exists and focused tests pass, but long Running forms are not keyboard-safe/scrollable, and several required recovery/focus/confirmation states are missing or materially different. |

**Overall: 7/24**

## Top 3 Priority Fixes

1. **Move every Running plan/session route onto the shared `AdaptiveScreen` and field/action primitives** — current raw `View`/`TextInput` forms can be clipped or covered at 200% text and by the keyboard, and their dark-mode presentation is unthemed — use the Phase14 shell, `PlanEditorTextField`/shared fields, semantic type tokens, keyboard insets, and a scrollable content area with the Save action reachable.
2. **Restore exact Phase17 state/copy contracts** — mismatches currently make empty, missing, load-failure, save-failure, and collision outcomes ambiguous — implement the exact strings from `17-UI-SPEC.md`, including `No sessions yet` with its body/CTA, `Retry loading Library`, `Retry refreshing Library`, `No exercise matches`, the contextual missing-detail CTA, and collision copy with “no medical judgment is made.”
3. **Correct shared geometry and route hierarchy before native validation** — the shared `ScreenHeader` is 48dp and `NavigationRow` is 48dp while Phase17 requires a 64dp deep header and 88dp list rows — change the shared tokens/components, preserve 48dp only for individual controls, and then rerun 200%/focus/keyboard checks in Phase20.

## Detailed Findings

### Pillar 1: Copywriting (2/4)

WARNING findings:

- `src/ui/screens/LibraryScreen.tsx:877-881` says `No exercises match` and `Try another name...`; the contract requires heading `No matches` and body `No exercise matches your search and current filters.`
- `src/ui/screens/LibraryScreen.tsx:861-866` uses `Retry exercise search` for the root load failure; the contract requires `Retry loading Library`. The root retry at `src/ui/screens/LibraryScreen.tsx:1800-1807` is `Retry Library`, also not the declared CTA.
- `src/ui/screens/LibraryScreen.tsx:1787-1793` uses `Retry Library refresh` and a different body; the contract requires `Library could not refresh. Your current results are still shown.` and `Retry refreshing Library`.
- `src/ui/screens/RunningPlanDetailScreen.tsx:54` uses `No weekly sessions scheduled.` instead of the exact `No sessions yet` empty-session state. The required body and `Add session` CTA are absent.
- `src/ui/screens/RunningPlanDetailScreen.tsx:88-89` uses `Return to Library and choose a Running plan.`, `Retry`, and `Your Library was not changed. Try again.` instead of the missing-detail and contextual load-error copy.
- `src/ui/screens/RunningPlanEditorScreen.tsx:59,62-83` exposes the internal error string `running_save_failed`, omits `Goal and weekly sessions` and its explanatory body, and uses `Save changes` rather than the declared Running create/edit CTAs. Its delete review says `Remove ...` / `Remove session` rather than `Delete {Workout type} session?` / `Delete session`.
- `src/ui/screens/RunningSessionEditorScreen.tsx:155-168` uses generic loading/missing/error wording and `Discard session edits?`; the contract requires the documented missing-detail, save-error, and three-way draft confirmation language.
- `src/ui/components/ScheduleConflictSheet.tsx:102-110,126,130-135` uses generic `Schedule conflict`, `Back`, and `Review schedule change`; the required grammar is `{weekday} conflict`, includes `no medical judgment is made`, and uses the exact confirmation/cancel contract. Stale text is also different from the required “Check the latest dates and choose again.”

### Pillar 2: Visuals (1/4)

BLOCKER findings:

- `src/ui/screens/RunningPlanDetailScreen.tsx:41-59,134-146` renders the entire detail hierarchy with unstyled `Text`, `View`, and actions. There is no status-tag treatment, fact-row composition, intro block, or shared editorial surface corresponding to the approved deep-route composition.
- `src/ui/screens/RunningPlanEditorScreen.tsx:62-84` and `src/ui/screens/RunningSessionEditorScreen.tsx:159-169` render raw controls in a bare `View`, without the shared form sections, field labels/help, scroll container, or deep-route layout. Passing component tests do not prove the resulting hierarchy or responsive composition.
- The Running detail route presents `Revision N` as a visible UI fact (`RunningPlanDetailScreen.tsx:56`) even though revision is an implementation/source fact, not a declared user-facing detail in the Phase17 composition.

### Pillar 3: Color (1/4)

BLOCKER findings:

- `src/ui/screens/RunningPlanDetailScreen.tsx:41-59,134-146` has no `useAppTheme`, semantic color, or `typeScale` use. All status, goal, session, and action-adjacent text falls back to native defaults, so the route cannot meet the persisted Light/Dark contract.
- `src/ui/screens/RunningPlanEditorScreen.tsx:1-84`, `src/ui/screens/RunningSessionEditorScreen.tsx:1-169`, and `src/ui/components/RunningSessionFields.tsx:1-244` likewise omit theme colors for text, inputs, labels, validation, and previews. This is a direct dark-mode failure, not a native-proof-only concern.
- The token source is mostly present in `src/ui/theme/index.ts:208-230`, but token existence does not compensate for consumers that do not apply it. No third-party registry audit was required because `components.json` is absent.

### Pillar 4: Typography (1/4)

BLOCKER findings:

- `src/ui/screens/RunningPlanDetailScreen.tsx:46-59` uses bare `Text` for title, status, facts, session labels, and revisions; none uses Archivo/IBM Plex Mono through the declared Phase17 roles.
- `src/ui/components/RunningSessionFields.tsx:140-165,178-242` uses bare labels and inputs for all seven session kinds. The contract requires 16sp/22sp body, 14sp factual mono values where appropriate, 20sp/24sp headings/actions, and wrapping at 200%.
- `src/ui/screens/RunningPlanEditorScreen.tsx:64-82` and `RunningSessionEditorScreen.tsx:155-168` also bypass typography tokens. The preview emits `m` and `ms` (`RunningSessionFields.tsx:118-125`) rather than user-facing distance/time units, making factual values implementation-oriented and inconsistent with the UI contract.
- `src/ui/theme/index.ts:64-124` correctly defines the shared Phase14 scale, but the Phase17 Running consumers do not use it. The inherited Workout-only extra roles do not excuse raw Phase17 consumers.

### Pillar 5: Spacing (1/4)

BLOCKER findings:

- `src/ui/components/index.ts:1362-1367` defines the shared `screenHeader` with `minHeight: sizes.minimumTarget` (48dp), while the Phase17 deep-route header requires 64dp.
- `src/ui/components/NavigationRow.tsx:64-67` defines a list navigation row with `minHeight: 48`; Phase17 plan/exercise/session rows require 88dp minimum and active-plan rows 120dp. Its own test codifies the 48dp geometry at `src/ui/components/NavigationRow.test.tsx:37`.
- `src/ui/screens/PlanTypeChooserScreen.tsx:104-110` introduces a literal `minHeight: 156` for choices. It is not a declared Phase17 geometry token and is not responsive to text expansion; at 200% it is only a minimum with no evidence that the surrounding layout reflows safely.
- Running editor/session routes do not use `AdaptiveScreen` (`RunningPlanEditorScreen.tsx:62`, `RunningSessionEditorScreen.tsx:159`), so they do not receive the shared gutters, readable max width, keyboard/navigation inset, or landscape scroll behavior required by the contract.

### Pillar 6: Experience Design (1/4)

BLOCKER findings:

- `src/ui/screens/RunningSessionEditorScreen.tsx:155-169` is a non-scrollable bare `View` for the longest form. It has no keyboard inset handling, no focus-to-first-invalid behavior, and no guarantee that validation, preview, or Save remains reachable above the keyboard at 200% text.
- `src/ui/screens/RunningPlanEditorScreen.tsx:70-72` renders `RunningSessionFields` for persisted rows with `onChange={() => undefined}`. Those visible controls are inert; editing is delegated to another action while a form-shaped UI is presented as if interactive.
- `src/ui/screens/RunningPlanEditorScreen.tsx:76-78` provides reorder actions, but there is no lifted-row/insertion-marker or explicit Escape-cancel path in the screen; the Phase17 reorder contract requires keyboard/D-pad semantics plus cancellation without mutation.
- Lifecycle review in `src/ui/screens/RunningPlanDetailScreen.tsx:134-141` is an inline block rather than the shared focus-trapping confirmation surface. It does not use the exact reviewed confirmation copy and has no explicit focus ownership for opening, confirmation, cancel, or stale retry.
- Loading/error recovery is incomplete or non-shared: `RunningPlanDetailScreen.tsx:87-89` uses skeletons but no announced loading contract or contextual Retry label; `RunningSessionEditorScreen.tsx:155-157` renders plain loading/error text; save failure is a raw alert string at `:165` rather than a focused error notice followed by the noun-specific retry action.
- Positive evidence: Library state separation and scroll offsets are implemented in `src/ui/screens/LibraryScreen.tsx:1263-1266,1869-1877`; focus-capable shared controls exist; and the focused Phase17 component suites passed 7/7 suites and 60/60 tests. Those strengths do not cover the unstyled Running surfaces or deferred native proof.

## Native / Screenshot Boundary

No APK, native screenshots, device mutation, or native accessibility matrix was performed, per owner direction. Phase20 owns that proof. The absence of that evidence is recorded here and is not scored as a Phase17 implementation defect; the findings above are source-level contradictions visible without native execution.

## Files Audited

- Contract/context: `.planning/phases/17-library-running-plans/17-UI-SPEC.md`, `17-CONTEXT.md`, `17-01` through `17-14` PLAN/SUMMARY files, `17-VALIDATION.md`.
- Owner/source precedence: `.planning/v1.2-OWNER-BRIEF.md`, `.planning/v1.2-OWNER-DECISIONS.md`, `.planning/design/v1.2-SOURCE-PRECEDENCE.md`, external Revision18 approval/prototype references under `/Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001/`.
- Shared shell/token consumers: `src/ui/layout/AdaptiveScreen.tsx`, `src/ui/components/index.ts`, `src/ui/components/NavigationRow.tsx`, `src/ui/theme/index.ts`.
- Library: `src/ui/screens/LibraryScreen.tsx`, `src/ui/components/PlanRow.tsx`, `src/ui/components/M3SearchField.tsx`, `src/ui/components/M3FilterChip.tsx`, `src/ui/__tests__/LibraryScreen.test.tsx`, `src/ui/__tests__/PlanTypeChooserScreen.test.tsx`.
- Strength/exercise ownership: `src/ui/screens/OwnedPlanDetailScreen.tsx`, `src/ui/screens/OwnedPlanEditorScreen.tsx`, `src/ui/screens/ExerciseDetailScreen.tsx`, `src/ui/screens/ExerciseEditorScreen.tsx`, `src/ui/__tests__/OwnedPlanDetailScreen.test.tsx`, `src/ui/__tests__/OwnedPlanEditor.test.tsx`, `src/ui/__tests__/CustomExerciseScreens.test.tsx`.
- Running: `src/ui/screens/RunningPlanDetailScreen.tsx`, `src/ui/screens/RunningPlanEditorScreen.tsx`, `src/ui/screens/RunningSessionEditorScreen.tsx`, `src/ui/components/RunningSessionFields.tsx`, `src/ui/components/ScheduleConflictSheet.tsx`, corresponding focused tests, and `tests/integration/running-plan-authoring.test.ts`, `tests/integration/running-schedule-collision.test.ts`, `tests/integration/multi-plan-lifecycle.test.ts`.
- Phase14 reference read-only: `.planning/phases/14-prototype-visual-shell/14-UI-SPEC.md` and related shell artifacts were consulted only for the inherited contract; no Phase14 evidence was modified by this audit.
