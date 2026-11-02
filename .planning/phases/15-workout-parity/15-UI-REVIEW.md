---
phase: 15
name: Workout Parity
audited: 2026-10-10
baseline: 15-UI-SPEC.md plus Phase 14 Light/Dark token authority
scope: scoped code/test re-audit; native acceptance deferred to Phase 20
screenshots: not captured
status: passed
overall: 22/24
---

# Phase 15 — UI Review

**Audited:** 2026-10-10
**Baseline:** `15-UI-SPEC.md` plus Phase 14 Light/Dark token authority
**Implementation state:** `0088f227` (includes and is after `cb5b3fec`)
**Status:** passed — scoped code/test re-audit; no unresolved in-scope UI findings
**Screenshots:** not captured (no dev server on ports 3000, 5173, or 8080)
**Native acceptance:** intentionally deferred to Phase 20; not scored as a defect

This is a code-and-focused-test audit. No APK, device mutation, screenshot capture, or full native matrix was run, as explicitly requested. The prior 18-item UI review/fix scope is closed: the 12 original implementation findings and five residual UI warnings are resolved in source and focused tests; the remaining item in that report was Phase 14 source authority, now verified in the shared theme.

## Pillar Scores

| Pillar | Score | Key Finding |
|---|---:|---|
| 1. Copywriting | 4/4 | Contract copy is present for root actions, exact exercise metadata, editor save/state, errors, confirmations, and Active-sheet return. |
| 2. Visuals | 3/4 | Component hierarchy and measured geometry are contract-aligned; rendered screenshots were unavailable, so pixel-level visual parity is not certified. **WARNING: evidence limitation, not an observed implementation defect.** |
| 3. Color | 4/4 | Root orange, blue selection/focus, state channels, and Phase 14 Light `#B42318` authority are represented by semantic theme tokens. |
| 4. Typography | 4/4 | Workout roles resolve to the declared 16/18/30/57 sizes and regular/emphasis weights with Archivo/IBM Plex Mono. |
| 5. Spacing | 4/4 | Required 64/16 root geometry, 56 compact actions, 128 Add, 60 rows, 8 gaps, 48 targets, measured header, and 82% sheet cap are present. |
| 6. Experience Design | 3/4 | Loading/error/empty/disabled/busy/retry/confirmation and focus-return paths are implemented and tested; native semantic/runtime matrix remains deferred. **WARNING: evidence limitation, not an observed implementation defect.** |

**Overall: 22/24**

## Top 3 Priority Follow-ups

There are no remaining implementation fixes required by the scoped Phase 15 UI re-audit. These are the three next verification actions, not defects or reasons to fail this review:

1. **Run the Phase 20 exact-source native acceptance closure** — verifies the already-implemented semantic tree, focus order, 200% text reflow, reduced motion, and device geometry against the current APK.
2. **Capture the approved Light/Dark reference viewport screenshots** — supplies the rendered evidence needed to turn the Visuals score from evidence-limited 3/4 into a fully certified score.
3. **Run the owner-directed full native matrix and performance gate** — verifies recovery, offline, process-death, all metric profiles, and rendered dock performance; do not treat the deferred status as a Phase 15 UI defect.

## Detailed Findings

### Pillar 1: Copywriting (4/4)

**PASS — root and start flow copy.** `TodayScreen.tsx:269-284, 501-535` uses the truthful plan/day identity, `Start {day}`, and `Resume workout` actions. `WorkoutStartSheet.tsx:49-80` preserves the ordered alternatives and `Return to Workout` dismissal.

**PASS — Active sheet return contract.** Every non-confirmation Active `BottomSheet` call site has `cancelLabel="Return to Workout"`: `ActiveWorkoutScreen.tsx:2541-2548, 2617-2623, 2649-2655, 2779-2785, 2946-2951`; the trend sheet does the same at `ExerciseTrendSheet.tsx:39`. The source assertion in `ActiveWorkoutScreen.test.tsx:94-99` covers all six Active call sites.

**PASS — exact metadata and editor/state copy.** `ActiveWorkoutScreen.tsx:368-387, 2147-2161` derives current `{target} · set {ordinal}/{total}` or `{target} · warm-up W{ordinal}`, and non-current `{target} · {completed}/{total} complete`, then supplies the same facts to visible supporting text and accessible labels. `SetRow.tsx:80-93` exposes explicit state and edit semantics; `WorkoutSetEditorSheet.tsx:100-111` and the Active failure paths retain explicit Save/retry wording.

**PASS — no generic error/empty handling in the scoped flow.** Root read/start failures, exercise picker loading/error/empty states, set-save failure, rest-save failure, finish failure, and completion/write-back paths use actionable copy and bounded retries. No unresolved generic `Cancel`, `OK`, or `Submit` label remains in the audited Phase 15 flow.

### Pillar 2: Visuals (3/4)

**PASS — hierarchy and focal point.** The root keeps plan/day identity and Start/Resume above the exercise preview (`TodayScreen.tsx:269-285`). Active keeps the current set and mutually exclusive dock as the focal action (`ActiveWorkoutScreen.tsx:2085-2141`), with plan settings, trend, and exercise actions secondary.

**PASS — measured structural composition.** `WorkoutSessionPresentation.tsx:45-111` keeps the sole 4dp active-exercise edge, 80dp exercise header, 48dp grip/action columns, flexible disclosure copy, and no set-row stripe. Active scroll-to-current positioning uses measured exercise/card/set offsets at `ActiveWorkoutScreen.tsx:2062-2084`, rather than a fixed/clamped offset.

**WARNING — rendered parity is not visually certifiable in this run.** No dev server was available and the requested audit excludes screenshots. The source structure is aligned, but this review cannot claim absence of runtime clipping, font rasterization, or device-specific overlay defects without the deferred native evidence.

### Pillar 3: Color (4/4)

**PASS — semantic color channels.** `src/ui/theme/index.ts:208-229` preserves Paper/Bone/surface hierarchy, blue selected/focus tokens, orange Workout-root action tokens, completed green, current/rest yellow, and theme-specific text channels. `WorkoutDaySelector.tsx:68-73` uses `contentCardSelected` plus `focusRing` for the selected day rather than the reserved orange action channel.

**PASS — orange root action scope.** `WorkoutPrimaryAction` is the dedicated root-only orange primitive at `src/ui/components/index.ts:412-451`; the root uses it at `TodayScreen.tsx:278-283, 505-526`. Active compact Complete remains the standard primary action, so orange is not spread across every interaction.

**PASS — Phase 14 Light destructive authority.** Light `destructive` is exactly `#B42318` at `src/ui/theme/index.ts:216-219`, while the dark theme retains the Phase 14 `#FF8279` source token at `:227-228`. Destructive styling is limited to confirmation/error contexts in the audited flow.

### Pillar 4: Typography (4/4)

**PASS — declared Workout roles.** `src/ui/theme/index.ts:132-205` maps body/label to 16sp regular, emphasis to 18sp 700, numeric emphasis to IBM Plex Mono 30sp 700, and editorial workout title to 57sp 700 condensed. Compatibility names (`targetValue`, `screenTitle`, `bodyStrong`, etc.) reuse those exact declared roles rather than introducing new sizes or weights.

**PASS — numeric font and required text growth.** Numeric values use the bundled numeric family and tabular numerals in `index.ts:145-150, 162-174`. The audited Workout components contain no `numberOfLines`, `ellipsizeMode`, or line-clamp constraint that truncates required exercise metadata; `WorkoutSessionPresentation.tsx:84-90` leaves the copy flexible and reflowable.

### Pillar 5: Spacing (4/4)

**PASS — root action geometry.** `src/ui/components/index.ts:1330-1342` gives `WorkoutPrimaryAction` a minimum 64dp height, 16dp radius, and 16dp horizontal padding. This fixes the prior generic 56dp/8dp root-action mismatch.

**PASS — compact dock geometry.** `WorkoutActionDock.tsx:50-60` uses an 8dp gap, a 128dp minimum Add slot, and 56dp minimum heights for both actions. Wrapping is enabled for narrow/large-text layouts while preserving Add-first ordering.

**PASS — rows, controls, sheet, and measured header.** `SetRow.tsx:117-119` enforces 60dp rows; `RestDock.tsx:438-460` uses 8dp control gaps and 48dp minimum controls; `BottomSheet.tsx:394-403` uses the measured header padding and 82% maximum scroll height; `WorkoutSessionPresentation.tsx:104-111` uses the 80dp exercise header and 48dp fixed columns. The Active root uses measured layout offsets rather than clamped required-content height.

### Pillar 6: Experience Design (3/4)

**PASS — state coverage.** Loading, error, empty, disabled, busy, retry, commit-gated saving, and confirmation states are represented across `TodayScreen.tsx`, `ActiveWorkoutScreen.tsx`, `WorkoutSetEditorSheet.tsx`, `WorkoutActionDock.tsx`, and `WorkoutCompletionScreen.tsx`. Failed set completion retains values and exposes `Set not saved · Retry` (`ActiveWorkoutScreen.tsx:2128-2141, 2488-2528`).

**PASS — interaction and focus contracts.** `WorkoutDaySelector.tsx:24-67` bounds the selected occurrence inside a five-item roving window and supports Arrow/Home/End movement with only the selected tab focusable. Active sheets pass restore refs and use `Return to Workout`; editor dismissal is non-mutating. The focused suite covers the selector, start order, sheet labels, dock geometry, metadata, and editor behavior.

**PASS — regression checks at current HEAD.** `npm run test:evidence:phase15` passed 12/12; focused Phase 15 UI suites passed 6/6 suites and 55/55 tests; `npm run typecheck`, `npm run lint`, and `npm run check:boundaries` passed (341 files).

**WARNING — native acceptance is not claimed.** The Phase 15 contract explicitly defers APK/device acceptance, the 56-cell matrix, and rendered performance to Phase 20. This is a scope boundary, not a failing UI implementation finding; no stale native artifact was used to inflate this score.

## Registry Safety

Registry audit: skipped because `components.json` is absent and `15-UI-SPEC.md` declares no third-party component registries.

## Files Audited

- `.planning/phases/15-workout-parity/15-UI-SPEC.md`
- `.planning/phases/15-workout-parity/15-CONTEXT.md`
- `.planning/phases/15-workout-parity/15-01-PLAN.md` through `15-13-PLAN.md`
- `.planning/phases/15-workout-parity/15-01-SUMMARY.md` through `15-13-SUMMARY.md`
- `.planning/phases/15-workout-parity/15-UI-REVIEW-FIX.md`
- `.planning/phases/15-workout-parity/15-VALIDATION.md`
- `src/ui/theme/index.ts`
- `src/ui/components/index.ts`
- `src/ui/components/WorkoutActionDock.tsx`
- `src/ui/components/WorkoutDaySelector.tsx`
- `src/ui/components/WorkoutSessionPresentation.tsx`
- `src/ui/components/SetRow.tsx`
- `src/ui/components/RestDock.tsx`
- `src/ui/components/BottomSheet.tsx`
- `src/ui/components/WorkoutStartSheet.tsx`
- `src/ui/components/WorkoutSetEditorSheet.tsx`
- `src/ui/components/ExerciseTrendSheet.tsx`
- `src/ui/screens/TodayScreen.tsx`
- `src/ui/screens/ActiveWorkoutScreen.tsx`
- `src/ui/screens/WorkoutCompletionScreen.tsx`
- Focused Phase 15 UI and evidence tests under `src/ui/__tests__/` and `scripts/phase15-evidence-scripts.test.mjs`

## UI REVIEW COMPLETE

**Phase:** 15 — workout parity
**Overall Score:** 22/24
**Screenshots:** not captured (no dev server; code/test-only audit)

### Pillar Summary

| Pillar | Score |
|---|---:|
| Copywriting | 4/4 |
| Visuals | 3/4 |
| Color | 4/4 |
| Typography | 4/4 |
| Spacing | 4/4 |
| Experience Design | 3/4 |

### Top 3 Fixes

1. Phase 20 exact-source native acceptance closure.
2. Approved Light/Dark reference screenshot capture.
3. Full native matrix and performance verification.

### File Created

`.planning/phases/15-workout-parity/15-UI-REVIEW.md`

### Recommendation Count

- Priority implementation fixes: 0
- Deferred verification follow-ups: 3
- Minor recommendations: 0
