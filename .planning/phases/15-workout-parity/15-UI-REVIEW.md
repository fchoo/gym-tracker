---
phase: 15
name: Workout Parity
audited: 2026-10-10
baseline: 15-UI-SPEC.md, Revision 18 approved.json/approved-hybrid.html, owner brief and locked decisions
scope: targeted contract/code audit; native acceptance remains owner-deferred to Phase 20
screenshots: not captured (no dev server; native screenshots and the 56-cell matrix were intentionally not run)
overall: 12/24
---

# Phase 15 — UI Review

This is a code and contract audit of the implemented Workout root, Active Workout,
completion, recovery, editor, dock, and preserved deep actions. The pinned oracle
hashes match the contract: `approved.json` Revision 18 is
`b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf` and
`approved-hybrid.html` is
`b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96`.

No APK was built or installed, no native screenshot was claimed, and the 56-cell
matrix was not run. The Phase 15 summary explicitly defers comprehensive native,
visual, accessibility, and performance closure to Phase 20. That missing evidence
is recorded as pending final acceptance, not as an implementation defect.

## Pillar Scores

| Pillar | Score | Key finding |
|---|---:|---|
| 1. Copywriting | 3/4 | Core Workout, Save, rest, recovery, and completion labels are specific, but start-sheet ordering is data-order dependent and the editor still exposes generic `Cancel` copy. |
| 2. Visuals | 2/4 | The main hierarchy and single active-exercise edge exist, but the implementation does not prove the Revision 18 header/action composition and the root/action treatment is structurally generic rather than oracle-specific. |
| 3. Color | 2/4 | Light/Dark surface tokens are present, but primary actions use the blue action token globally and light destructive color silently diverges from the locked source token. |
| 4. Typography | 1/4 | The declared four sizes and two logical weights are contradicted by production tokens using 14/20sp and 800/890 weights. |
| 5. Spacing | 2/4 | Most values use the shared 4dp scale, but concrete contract violations include 56dp set rows, 44dp editor source buttons, and 4dp rest-control gaps. |
| 6. Experience Design | 2/4 | Commit/recovery, explicit Save, reduced motion, Escape, Back, and semantic labels are broadly implemented, but roving focus and several exact target/interaction contracts are incomplete in code. |

**Overall: 12/24**

## Severity Legend

- **BLOCKER** — a pillar score of 1 or a defect that can break task completion.
- **WARNING** — a pillar score of 2–3 or a quality/contract degradation that does not inherently block the flow.

## Top 3 Priority Fixes

1. **BLOCKER — Restore the locked typography contract.** Replace `typeScale`’s 14/20sp roles and 800/890 weights with the declared 16/18/30/57sp roles and logical 400/700 weights, then reflow titles, headers, rows, sheets, and 200% text before final acceptance. This affects every Workout surface and can cause the approved hierarchy and accessibility reflow to diverge. (`src/ui/theme/index.ts:64-124`)
2. **WARNING — Make the primary and semantic state treatments Revision 18-specific.** Route Workout-root Start/Resume through the reserved orange accent, keep blue for focus/trend/warm-up/progress, and resolve the light destructive token deviation through the owner-approved source token/exception path. This prevents the action hierarchy and 60/30/10 allocation from collapsing into a generic blue-button system. (`src/ui/components/index.ts:362-403`, `src/ui/theme/index.ts:127-147`)
3. **WARNING — Close the geometry and focus gaps before Phase 20 evidence.** Set active set rows and editor source controls to at least 60dp/48dp, change rest controls to the required 8dp gaps, and implement true roving day-selector focus with only the active tab in the keyboard/D-pad order. These defects are directly machine-checkable in the deferred matrix. (`src/ui/components/SetRow.tsx:116-120`, `src/ui/components/WorkoutSetEditorSheet.tsx:112-114`, `src/ui/components/RestDock.tsx:444-460`, `src/ui/components/WorkoutDaySelector.tsx:33-51`)

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**WARNING — start alternatives are not guaranteed to follow the locked order.**
The contract requires scheduled day first, then other real days, then `Start empty
workout`, then `Return to Workout`. `WorkoutStartSheet` renders `planDays` in
whatever order arrives and marks the scheduled day primary only by conditional
rendering (`src/ui/components/WorkoutStartSheet.tsx:61-81`). Sort or partition the
collection explicitly before rendering. The action labels themselves are good and
avoid generic `Submit`/`OK` patterns.

**WARNING — editor dismissal copy is generic relative to the contract.**
The editor uses visible `Cancel` (`src/ui/components/WorkoutSetEditorSheet.tsx:107`)
while the locked sheet semantics call for `Return to Workout` and an explicit hint
that entered changes will not be saved. The underlying BottomSheet supports custom
cancel labels, so pass the contract copy and hint at this call site.

**Positive evidence.** The implementation has concrete root failure/start-failure
copy (`src/ui/screens/TodayScreen.tsx:565-576`), explicit Save copy and draft
preservation (`src/ui/components/WorkoutSetEditorSheet.tsx:63-79`), exact rest
control labels (`src/ui/components/RestDock.tsx:388-418`), and factual completion
copy (`src/ui/screens/WorkoutCompletionScreen.tsx:177-235`).

### Pillar 2: Visuals (2/4)

**WARNING — the approved hierarchy is only partially encoded by reusable generic
primitives.** The root does place `Workout` and Settings first, then date/day
selection, identity, summary, preview, and contextual Running (`src/ui/screens/TodayScreen.tsx:540-628`). Active content also applies one continuous 4dp yellow edge to the active exercise (`src/ui/components/WorkoutSessionPresentation.tsx:53-56`) and uses amber fill for a current set (`src/ui/components/WorkoutSetFactsRow.tsx:12-22`). Those are important Revision 18 matches.

However, the active exercise header is assembled from a generic disclosure header
plus absolutely positioned trend/menu actions (`src/ui/components/WorkoutSessionPresentation.tsx:62-86`, `src/ui/screens/ActiveWorkoutScreen.tsx:2185-2225`, `src/ui/screens/ActiveWorkoutScreen.tsx:2901-2927`), rather than encoding the locked 48dp grip/name/metadata/trend/menu order as one measured header. The code therefore needs Phase 20 geometry evidence to prove no collision or clipped long-name state, especially at 360dp and 200% text.

**WARNING — root focus treatment is not the reserved source treatment.** The shared
`PrimaryAction` is a generic full-width blue action (`src/ui/components/index.ts:362-403`), while Revision 18 reserves orange for the Workout-root Start action and selected root underline. This weakens the intended focal point even though the labels are correct.

### Pillar 3: Color (2/4)

**WARNING — accent allocation is wrong for the root primary action.** The light and
dark theme tokens correctly contain the Paper/Bone/surface, orange, green, amber,
blue, and divider values (`src/ui/theme/index.ts:127-147`). The root Start action,
though, renders through `colors.action` (`src/ui/components/index.ts:394-402`),
which is blue in both themes (`src/ui/theme/index.ts:135,147`). The contract reserves
orange for Workout-root Start, queue ordinals, and selected Workout underline; blue
is reserved for focus/trend/warm-up/progress.

**WARNING — light destructive color is a silent deviation.** Light theme sets
`destructive: "#B42318"`, while the locked semantic source token is `#FF8279` in
both themes (`src/ui/theme/index.ts:134-138`, `src/ui/theme/index.ts:146-147`).
The owner contract allows a native contrast deviation only when recorded and
accepted; this code contains no such deviation register or acceptance at the use
site. Verify contrast and record the exact approved deviation before shipping.

### Pillar 4: Typography (1/4)

**BLOCKER — production tokens contradict the declared type system.** The UI spec
declares exactly four semantic sizes (16, 18, 30, 57sp) and two logical weights
(400 and 700). `typeScale` instead ships `displayTimer` 30/400, but also
`targetValue` 20/400, `screenTitle` and `sectionTitle` 20/800, `secondary` and
`label` 14/400, `bodyStrong` 16/800, and `editorialWorkoutTitle` 57/890
(`src/ui/theme/index.ts:64-124`). These roles are used throughout the root,
Active, editor, dock, and completion surfaces (`src/ui/screens/TodayScreen.tsx:258-275`,
`src/ui/screens/ActiveWorkoutScreen.tsx:381-397`,
`src/ui/components/WorkoutSetEditorSheet.tsx:87-107`). This is a direct locked
requirement failure, not a screenshot-dependent judgment.

**WARNING — text-scale behavior is not demonstrated in the implementation.** The
editor fields and headers rely on fixed semantic roles and the day-selector detail
has an explicit two-line clamp (`src/ui/components/WorkoutDaySelector.tsx:63-65`).
The contract requires relaxing required-content clamps at 200% before truncation.
The deferred native matrix must prove this, and the clamp should be removed or
made text-scale aware beforehand.

### Pillar 5: Spacing (2/4)

**WARNING — active facts rows are below the locked minimum.** `SetRow` uses
`minHeight: 56` and compact rows use 48 (`src/ui/components/SetRow.tsx:116-120`),
while the contract requires a 60dp set row. `WorkoutSetFactsRow` does use 60dp
(`src/ui/components/WorkoutSetFactsRow.tsx:27-31`), so the implementation has
inconsistent row geometry across the same Active Workout surface.

**WARNING — an editor target is 44dp.** The source selector buttons are explicitly
`minHeight: 44` (`src/ui/components/WorkoutSetEditorSheet.tsx:112-114`), below the
48dp touch/keyboard/D-pad minimum. The main numeric fields use shared 48dp/64dp
primitives, but this smaller control remains a contract failure.

**WARNING — rest control gaps are 4dp rather than 8dp.** `RestDock.controls` uses
`gap: space[1]` (`src/ui/components/RestDock.tsx:444-447`), and `space[1]` is 4dp
(`src/ui/theme/index.ts:32-40`). The contract calls for four equal controls with
8dp gaps. The `flexWrap` also makes the exact four-control row dependent on width;
wrapping is only allowed as a deliberate 200% fallback, not the default layout.

### Pillar 6: Experience Design (2/4)

**WARNING — day-selector focus is not roving.** Every rendered item is
`focusable` (`src/ui/components/WorkoutDaySelector.tsx:38-43`), while the contract
requires a roving keyboard/D-pad focus model. Arrow/Home/End movement is present
(`src/ui/components/WorkoutDaySelector.tsx:44-50`), but the code does not remove
the inactive tabs from the focus order or expose a single roving tab stop. Fix the
focus model and prevent default key traversal where needed.

**WARNING — set editor source controls are under target minimum and lack explicit
busy/selected state semantics.** The buttons at
`src/ui/components/WorkoutSetEditorSheet.tsx:104` expose a generic button label and
do not expose which source is selected; their 44dp geometry is also below the
minimum. This makes keyboard/screen-reader recovery from a draft source choice
less clear.

**Positive evidence.** `FocusablePressable` supplies Enter/Space activation and a
visible 3dp focus ring (`src/ui/components/index.ts:224-320`); BottomSheet handles
focus trapping/restoration, Escape, and reduced-motion presentation
(`src/ui/components/BottomSheet.tsx:118-165`, `:248-367`); Active commit state
keeps the dock action busy and retryable (`src/ui/screens/ActiveWorkoutScreen.tsx:2041-2063`); RestDock preserves authoritative countdown state and uses meaningful threshold
announcements without per-second live updates (`src/ui/components/RestDock.tsx:259-292`, `:367-385`).

**Pending, not a defect.** The required native checks for Back, D-pad geometry,
48dp bounds, 200% reflow, reduced motion, semantic tree, Light/Dark, and the exact
Revision 18 screenshots were not re-run in this audit because Phase 15 explicitly
defers them to Phase 20. They remain required acceptance evidence.

## Files Audited

Contract and decisions:

- `.planning/phases/15-workout-parity/15-UI-SPEC.md`
- `.planning/phases/15-workout-parity/15-CONTEXT.md`
- `.planning/phases/15-workout-parity/15-01-PLAN.md` through `15-13-PLAN.md`
- `.planning/phases/15-workout-parity/15-01-SUMMARY.md` through `15-13-SUMMARY.md`
- `.planning/v1.2-OWNER-BRIEF.md`
- `.planning/v1.2-OWNER-DECISIONS.md`
- `.planning/design/v1.2-SOURCE-PRECEDENCE.md`
- `/Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001/approved.json`
- `/Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001/approved-hybrid.html`

Implemented UI and tests:

- `src/ui/screens/TodayScreen.tsx`
- `src/ui/screens/ActiveWorkoutScreen.tsx`
- `src/ui/screens/WorkoutCompletionScreen.tsx`
- `src/ui/components/WorkoutSessionPresentation.tsx`
- `src/ui/components/WorkoutSetFactsRow.tsx`
- `src/ui/components/SetRow.tsx`
- `src/ui/components/WorkoutActionDock.tsx`
- `src/ui/components/RestDock.tsx`
- `src/ui/components/WorkoutSetEditorSheet.tsx`
- `src/ui/components/WorkoutStartSheet.tsx`
- `src/ui/components/WorkoutDaySelector.tsx`
- `src/ui/components/BottomSheet.tsx`
- `src/ui/components/AndroidEscapeBoundary.tsx`
- `src/ui/components/index.ts`
- `src/ui/theme/index.ts`
- `app/(tabs)/index.tsx`
- `app/__tests__/workout-route.test.tsx`
- `app/__tests__/completion-route.test.tsx`
- `src/ui/__tests__/ActiveWorkoutScreen.test.tsx`
- `src/ui/__tests__/RestDock.test.tsx`
- `src/ui/__tests__/SetRow.test.tsx`
- `src/ui/__tests__/WorkoutActionDock.test.tsx`
- `src/ui/__tests__/WorkoutCompletionScreen.test.tsx`
- `src/ui/__tests__/WorkoutDaySelector.test.tsx`
- `src/ui/__tests__/WorkoutSessionPresentation.test.tsx`
- `src/ui/__tests__/WorkoutSetEditorSheet.test.tsx`

Registry audit: skipped because `components.json` is absent and the UI spec
declares no third-party component registries.

## UI REVIEW COMPLETE
