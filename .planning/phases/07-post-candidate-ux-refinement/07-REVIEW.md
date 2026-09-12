---
phase: 07-post-candidate-ux-refinement
reviewed: 2026-09-06T17:21:38Z
depth: standard
base: 9cdecb86dedeb9edd7bf5bc4d1c85d08bdc81660
head: c840b83f780b7e8339d40d599a9d0e210995d4c0
files_reviewed: 74
files_reviewed_list:
  - .github/workflows/release-candidate.yml
  - app/(tabs)/__tests__/index.test.tsx
  - app/(tabs)/index.tsx
  - app/__tests__/phase2-attended-preview.test.tsx
  - app/more/__tests__/index.test.tsx
  - app/more/index.tsx
  - app/workout/[sessionId].tsx
  - assets/audio/rest-cue-long.wav
  - assets/audio/rest-cue-short.wav
  - assets/images/android-icon-background.png
  - assets/images/android-icon-foreground.png
  - assets/images/android-icon-monochrome.png
  - assets/images/icon.png
  - assets/images/splash-icon.png
  - maestro/phase5/adaptive-accessibility.yaml
  - maestro/phase5/data-recovery.yaml
  - maestro/phase7/icon-navigation-accessibility.yaml
  - maestro/phase7/plan-schedule-reorder.yaml
  - maestro/phase7/today-settings.yaml
  - maestro/phase7/workout-removal-audio.yaml
  - package.json
  - scripts/concept-g-image-contract.test.mjs
  - scripts/generate-concept-g-icons.mjs
  - scripts/generate-phase7-attended-checklist.mjs
  - scripts/phase5-evidence-scripts.test.mjs
  - scripts/phase6-evidence-scripts.test.mjs
  - scripts/phase7-evidence-scripts.test.mjs
  - scripts/release-candidate-contract.test.mjs
  - scripts/run-phase7-maestro.mjs
  - src/bootstrap/restCountdownCue.ts
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/bootstrap/workoutAppRuntime.tsx
  - src/domains/portability/restoreCommands.test.ts
  - src/domains/portability/restoreCommands.ts
  - src/domains/rest/index.ts
  - src/domains/rest/restCountdownCuePort.ts
  - src/domains/workout/activeWorkout.ts
  - src/domains/workout/index.ts
  - src/domains/workout/setCommands.test.ts
  - src/domains/workout/setCommands.ts
  - src/platform/audio/expoRestCountdownCueAdapter.test.ts
  - src/platform/audio/expoRestCountdownCueAdapter.ts
  - src/platform/sqlite/migrations/0017_workout_remove_receipts.ts
  - src/platform/sqlite/migrations/index.ts
  - src/platform/sqlite/repositories/workoutRepository.ts
  - src/testing/phase2AttendedPreviewFixtures.ts
  - src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx
  - src/ui/__tests__/ActiveWorkoutScreen.test.tsx
  - src/ui/__tests__/OwnedPlanEditor.test.tsx
  - src/ui/__tests__/PlanEditorFields.test.tsx
  - src/ui/__tests__/RestDock.test.tsx
  - src/ui/__tests__/ScheduleEditor.test.tsx
  - src/ui/__tests__/SetRow.test.tsx
  - src/ui/__tests__/SettingsScreen.test.tsx
  - src/ui/__tests__/StarterPlans.test.tsx
  - src/ui/__tests__/TodayScreen.test.tsx
  - src/ui/__tests__/foundation.test.tsx
  - src/ui/components/PlanDaySwitcher.tsx
  - src/ui/components/PlanEditorFields.tsx
  - src/ui/components/RestDock.tsx
  - src/ui/components/ScheduleBindingEditor.tsx
  - src/ui/components/SetRow.tsx
  - src/ui/components/index.ts
  - src/ui/screens/ActiveWorkoutScreen.tsx
  - src/ui/screens/OwnedPlanEditorScreen.tsx
  - src/ui/screens/SettingsScreen.tsx
  - src/ui/screens/StarterActivationScreen.tsx
  - src/ui/screens/TodayScreen.tsx
  - tests/integration/complete-set.test.ts
  - tests/integration/rest-lifecycle.test.ts
  - tests/integration/workout-outcomes.test.ts
  - tests/sqlite-host/cleanInstallRestore.test.ts
  - tests/sqlite-host/migrations-effects.test.ts
  - tests/sqlite-host/portabilityMigration.test.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 7: Current-HEAD Re-review

**Reviewed:** 2026-09-06T17:21:38Z

**Comparison:** `9cdecb86dedeb9edd7bf5bc4d1c85d08bdc81660..c840b83f780b7e8339d40d599a9d0e210995d4c0`

**Depth:** standard

**Files reviewed:** 74

**Status:** clean

## Verdict

All prior findings are resolved in canonical HEAD `c840b83`. The final delta aligns native reorder selectors with the shipped `Reorder ${label}` accessibility label and proves resulting order independently from the live hierarchy's Y coordinates. No unresolved blocker or warning remains.

## Previous Findings: Resolution Evidence

| Previous finding | Current source and regression evidence | Result |
| --- | --- | --- |
| Stale notification after removing a rest-owned set | `src/platform/sqlite/repositories/workoutRepository.ts:1131-1142` advances the idle rest revision and enqueues `reconcile_rest_notification` within the removal transaction; `src/bootstrap/workoutAppRuntime.tsx` triggers post-commit reconciliation; `tests/integration/rest-lifecycle.test.ts:257-286` proves cancellation of `rest:<sessionId>`. | Resolved |
| Receipt-trigger verification trusts names only | `src/platform/sqlite/migrations/0017_workout_remove_receipts.ts:61-70,123-129` maps expected trigger names to normalized expected SQL and compares bodies; `tests/sqlite-host/migrations-effects.test.ts:383-408` rejects a same-named permissive replacement trigger. | Resolved |
| Eligible skipped/inactive rows lack a removal control | `src/ui/components/SetRow.tsx` now exposes removal for eligible skipped and inactive rows; `src/ui/__tests__/SetRow.test.tsx` and `src/ui/__tests__/ActiveWorkoutScreen.test.tsx` cover those user paths. | Resolved |
| Generated removal request IDs can exceed command bounds | `src/ui/screens/ActiveWorkoutScreen.tsx:720-745` generates a SHA-256-derived `remove_<digest>` request ID; `src/ui/__tests__/ActiveWorkoutScreen.test.tsx:1235-1275` verifies a legal long imported ID produces a bounded 71-character request ID. | Resolved |
| Owned-plan save recovery copy differs from the contract | `src/ui/screens/OwnedPlanEditorScreen.tsx:1146-1158` uses the required heading, body, and retry action; `src/ui/__tests__/OwnedPlanEditor.test.tsx:572-591` asserts the exact copy and retry behavior. | Resolved |
| Reorder handles lose Enter/Space activation | `src/ui/components/PlanEditorFields.tsx:375-393` maps `Enter` and `" "` to `requestMove(position + 1)` while retaining Shift+Arrow; `src/ui/__tests__/PlanEditorFields.test.tsx` covers both activation keys and directional movement. | Resolved |
| Schedule dragging does not translate sibling rows | `src/ui/components/ScheduleBindingEditor.tsx` and `src/ui/screens/StarterActivationScreen.tsx` hoist a shared drag preview and clear it after commit; `src/ui/__tests__/ScheduleEditor.test.tsx:454-541` and `src/ui/__tests__/StarterPlans.test.tsx:626-709` verify sibling translation. | Resolved |
| Evidence metadata and candidate CI omit real icon-contract proof | `scripts/phase7-evidence-scripts.test.mjs:74-84` requires each declared check path to exist; `.github/workflows/release-candidate.yml:85` runs `scripts/concept-g-image-contract.test.mjs`; the current Node tooling/release suite passed. | Resolved |
| RestDock cue implementation has no meaningful coverage / WR-01 | `src/ui/components/RestDock.tsx:250-256` advances `cueRestGenerationRef` before a distinct rest resets cue state. Each dispatch captures that generation at lines 321-324; its rejection changes `cueFailure` only when it still matches at lines 325-329. `src/ui/__tests__/RestDock.test.tsx:502-568` starts Rest A, transitions to Rest B, rejects A's deferred cue, and verifies B has no sound-unavailable notice. | Resolved |
| Maestro flows do not perform claimed removal/reorder interactions / WR-02 | The production drag handle emits `accessibilityLabel={`Reorder ${label}`}` at `src/ui/components/PlanEditorFields.tsx:362-364`, and `FocusablePressable` forwards it to native `Pressable` at `src/ui/components/index.ts:234-247`. `maestro/phase7/plan-schedule-reorder.yaml:45,71-72` now asserts `Reorder Back Squat` / `Reorder Bench Press`; `scripts/run-phase7-maestro.mjs:258-274` selects the same labels. The runner verifies held-drag and accessibility outcomes from the matched nodes' vertical hierarchy coordinates at lines 300-305 and 330-342, rather than position text embedded in a label. `scripts/phase7-evidence-scripts.test.mjs:107-124,149-165` binds both evidence paths to the component source and exercises true/false coordinate order assertions. | Resolved |

## Verification Performed

- `git diff --check 9cdecb86dedeb9edd7bf5bc4d1c85d08bdc81660..HEAD -- . ':!.planning/' ':!package-lock.json'` — passed.
- `npm run typecheck` — passed.
- `npm run lint` and `npm run check:boundaries` — passed (232 files).
- `node --test scripts/phase6-evidence-scripts.test.mjs scripts/phase7-evidence-scripts.test.mjs` — passed (30 tests), including the source-to-Maestro label contract and independent hierarchy-Y order assertions.
- `npm run test:components -- --runInBand src/ui/__tests__/PlanEditorFields.test.tsx` — passed (1 suite, 1 test), confirming the shipped `Reorder Recovery` drag-handle label.
- `npm run test:components -- --runInBand src/ui/__tests__/RestDock.test.tsx` — passed (1 suite, 9 tests), including the deferred old-rest rejection regression.
- Targeted component suites for active-workout removal, plan editing/reorder, schedules, starter plans, and set rows — passed (6 suites, 106 tests).
- Targeted unit suites for set commands and the Expo countdown-cue adapter — passed (2 suites, 42 tests).
- Targeted SQLite-host migration/restore suites — passed (3 suites, 132 tests).
- Targeted integration suites for rest lifecycle, completion, and workout outcomes — passed (3 suites, 48 tests).

The final delta was reviewed directly (`68e6fa4..c840b83`) in addition to the full Phase 7 scope. It contains no unresolved data, concurrency, accessibility, evidence, or release-gating defect.

---

_Reviewer: TraeCode_

_Re-review scope: current canonical HEAD only; source files were not modified and no commit was created._
