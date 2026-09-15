---
phase: 08-session-overview-navigation
plan: 03
subsystem: ui
tags: [react-native, expo-router, typescript, jest, maestro, accessibility, workout-overview]

requires:
  - phase: 08-session-overview-navigation
    provides: ordered multi-exercise overview, compact row editing, and revision-keyed authoritative scroll behavior
provides:
  - One union-safe active-workout route and overview shell for populated and empty sessions
  - Retirement of the obsolete focused/review route, screen, query contract, and preview navigation model
  - Empty-workout Phase 9 affordance and zero-set confirmation coverage in the Phase 8 native tracer
affects: [08-04-lifecycle-verification, active-workout-ui, phase2-attended-preview]

actuals:
  tokens: 13706
  tasks: 2
  commits: 5

tech-stack:
  added: []
  patterns:
    - Discriminated WorkoutSessionView rendering through one active-workout overview shell
    - Route refresh clears the prior union view before requesting the next session to prevent stale-session presentation

key-files:
  created: []
  modified:
    - app/workout/[sessionId].tsx
    - src/ui/screens/ActiveWorkoutScreen.tsx
    - app/__phase2-attended-preview.tsx
    - maestro/phase8/session-overview.yaml
  deleted:
    - app/workout-plan/[sessionId].tsx
    - src/ui/screens/WorkoutPlanOverviewScreen.tsx

key-decisions:
  - "Keep `runtime.getActiveWorkout` unchanged and pass both discriminated session-view arms to the one overview screen."
  - "Retire review navigation only after migrating its loading, error, empty/cardinality, and status-list responsibilities to the active route and overview preview."
  - "Phase 9 exercise creation remains a disabled, labelled affordance; no exercise mutation behavior or domain contract was introduced."

patterns-established:
  - "A route that asynchronously exchanges an identity-bearing view must clear the former view before loading the next identity."
  - "Retire a route/screen pair only after a consumer audit classifies retained presentation behavior and focused regressions cover its new home."

requirements-completed: [WORK-19]

coverage:
  - id: D1
    description: "Empty and populated session views share the Workout Overview shell; empty sessions expose no set rows, a disabled Phase 9 Add exercise control, and revision-checked zero-set/discard outcomes."
    requirement: WORK-19
    verification:
      - kind: unit
        ref: src/ui/__tests__/ActiveWorkoutScreen.test.tsx#keeps an empty workout in the overview shell with a disabled Phase 9 add-exercise affordance and revision-checked zero-set confirmation
        status: pass
      - kind: integration
        ref: src/ui/__tests__/WorkoutPlanOverviewRoute.test.tsx
        status: pass
    human_judgment: false
  - id: D2
    description: "Starting, resuming, and previewing use one overview model with no review query, review-only stack entry, or second workout-plan route."
    requirement: WORK-19
    verification:
      - kind: unit
        ref: app/__tests__/phase2-attended-preview.test.tsx
        status: pass
      - kind: other
        ref: grep retired-symbol verification plus consumer audit rg
        status: pass
      - kind: other
        ref: npm run typecheck; npm run lint; npm run check:boundaries; git diff --check
        status: pass
    human_judgment: false
  - id: D3
    description: "The native Phase 8 tracer covers the all-exercises overview and empty-session disabled Add exercise plus zero-set confirmation path."
    requirement: WORK-19
    verification:
      - kind: automated_ui
        ref: maestro test maestro/phase8/session-overview.yaml
        status: unknown
    human_judgment: true
    rationale: "Maestro could not start because the worktree had zero connected devices."

duration: 13min
completed: 2026-09-15
status: complete
---

# Phase 08 Plan 03: Unified Route Summary

**All in-progress workout entry points now render the single Workout Overview, including zero-exercise sessions, while the focused/review route and its obsolete navigation contract are removed.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-15T21:16:45+08:00
- **Completed:** 2026-09-15T21:29:47+08:00
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Made `ActiveWorkoutScreen` union-safe for `ActiveWorkoutView` and `EmptyWorkoutView`, with one sticky `WORKOUT OVERVIEW` shell and an accessible disabled `Add exercise. Available in Phase 9.` entry affordance for empty sessions.
- Preserved exact revision-checked save-zero-set and discard commands, plus Finish later, without adding Phase 9 exercise mutation behavior.
- Removed the review-only Expo route, stack registration, screen, query contract, focus/review copy, and preview navigation state after migrating retained overview responsibilities.
- Updated Phase 2 previews and the Phase 8 tracer to assert all exercise states on one overview surface, including the empty-session confirmation path.

## Consumer Audit and Disposition

The required pre-deletion audit was run with:

```text
rg -n 'WorkoutPlanOverviewScreen|workout-plan/|onOpenWorkoutPlan|reviewExerciseId|onReviewExercise' app src tests maestro scripts
```

| Consumer | Disposition |
| --- | --- |
| `app/workout-plan/[sessionId].tsx` | Review-only route; deleted. |
| `WorkoutPlanOverviewScreen` | Review-only loading/error/empty/cardinality/status list surface; responsibilities are covered by `ActiveWorkoutRoute`, `ActiveWorkoutScreen`, and preview tests; deleted. |
| `app/_layout.tsx` stack entry | Removed with the retired route. |
| `app/workout/[sessionId].tsx` | Retained as the sole union-safe route; it no longer parses `reviewExerciseId` and clears a former view while loading a changed session. |
| Phase 2 preview fixtures and tests | Migrated from plan/review navigation to overview-only presentation. |
| `ActiveWorkoutScreen` tests | Retained the active overview regression suite and removed screen-specific review tests. |
| Historical Phase 2/5/6/7 Maestro/evidence scripts outside this plan's owned files | Left untouched as historical evidence, not runtime consumers of the deleted route/screen. |

The post-migration audit found no matches for `WorkoutPlanOverviewScreen`, `workout-plan/`, `onOpenWorkoutPlan`, `reviewExerciseId`, or `onReviewExercise` in `app`, `src`, `tests`, `maestro`, and `scripts`. `runtime.getActiveWorkout` wiring was intentionally unchanged.

## Task Commits

Each TDD task followed the required RED → GREEN flow and was committed atomically:

1. **Task 1: Unify EmptyWorkoutView into the session overview**
   - `17e9b87` — `test(08-03): add failing empty overview contract`
   - `ea3290f` — `feat(08-03): unify empty workout overview`
2. **Task 2: Retire the costly review/focus route and preview contract**
   - `9704c6f` — `test(08-03): add failing unified route coverage`
   - `7ae7adb` — `feat(08-03): preserve active route loading semantics`
   - `21a655f` — `feat(08-03): retire review workout route`

Plan metadata is committed separately after this summary and state updates are finalized.

## Files Created/Modified

- `app/workout/[sessionId].tsx` — sole route for both session-view union arms, without review query parsing or stale session content.
- `src/ui/screens/ActiveWorkoutScreen.tsx` — shared empty/populated overview shell and existing zero-set/discard confirmation semantics.
- `src/ui/screens/RootScreens.tsx` — overview-consistent loading identity.
- `app/__phase2-attended-preview.tsx` and `src/testing/phase2AttendedPreviewFixtures.ts` — overview-only populated/empty/loading preview states.
- `app/__tests__/phase2-attended-preview.test.tsx`, `src/ui/__tests__/ActiveWorkoutScreen.test.tsx`, and `src/ui/__tests__/WorkoutPlanOverviewRoute.test.tsx` — regressions for union routing, one-surface status presentation, and compact editor access.
- `maestro/phase8/session-overview.yaml` — all-exercises overview checks plus empty-session disabled-add and zero-set confirmation coverage.
- `app/workout-plan/[sessionId].tsx` and `src/ui/screens/WorkoutPlanOverviewScreen.tsx` — deleted retired review-only machinery.

## Verification

Passed:

- `npm run test:components -- --runInBand app/__tests__/phase2-attended-preview.test.tsx` — 58 tests passed.
- `npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx src/ui/__tests__/WorkoutPlanOverviewRoute.test.tsx app/__tests__/phase2-attended-preview.test.tsx` — 112 tests passed.
- `grep -R -n -E 'reviewExerciseId|onReturnToCurrent|reviewingEarlierOrLater|FOCUSED WORKOUT|REVIEWING WORKOUT|Return to current exercise' app src` — no matches (exit 1 treated as the expected no-match result).
- Post-migration consumer audit `rg -n 'WorkoutPlanOverviewScreen|workout-plan/|onOpenWorkoutPlan|reviewExerciseId|onReviewExercise' app src tests maestro scripts || true` — no matches.
- `npm run typecheck`
- `npm run lint` — boundary check passed (231 files).
- `npm run check:boundaries` — boundary check passed (231 files).
- `git diff --check`

Unrun:

- `maestro test maestro/phase8/session-overview.yaml` could not start because Maestro reported: `You have 0 devices connected, which is not enough to run 1 shards.` The tracer is not claimed as passing.

## Decisions Made

- Use the existing discriminated `WorkoutSessionView` rather than fabricating an active exercise for an empty workout.
- Migrate preview cardinality and status coverage to the actual overview instead of preserving a compatibility review screen.
- Keep the add-exercise control intentionally disabled and explanatory until Phase 9 owns exercise mutation behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prevented stale workout content during session/refresh changes**

- **Found during:** Task 2 (retired review/focus route compatibility cut)
- **Issue:** A previous session view remained rendered while the route loaded a different session after session ID or refresh-generation changes.
- **Fix:** Clear the route view before requesting the next authoritative `getActiveWorkout` result.
- **Files modified:** `app/workout/[sessionId].tsx`, `src/ui/__tests__/WorkoutPlanOverviewRoute.test.tsx`
- **Verification:** Focused route regression and the 112-test component command passed.
- **Committed in:** `7ae7adb`

---

**Total deviations:** 1 auto-fixed (1 Rule 1).
**Impact on plan:** The correction preserves the plan's explicit requirement that loading/refresh never displays stale prior-session content; it does not expand the domain or mutation scope.

## Issues Encountered

- The preview suite initially used focused-row selectors for compact completed and warm-up rows; it was updated to expand overview rows through their accessible labels before exercising the existing correction/removal actions.
- The first tracer edit placed the empty-session path before the existing set-completion steps; the flow was reordered before verification so its state progression remains valid when a device is available.
- Maestro had no connected device, so native execution remains an explicit open verification item.

## Known Stubs

None. The disabled Add exercise affordance is intentional Phase 9 scope gating with explanatory copy, not a data-flow stub.

## User Setup Required

None - no external service configuration required. Connect a device before rerunning the Maestro tracer.

## Self-Check: PASSED

- Confirmed the sole route, shared overview screen, Phase 2 preview, Maestro tracer, and this summary exist.
- Confirmed all five TDD task commits (`17e9b87`, `ea3290f`, `9704c6f`, `7ae7adb`, and `21a655f`) exist in git history.

## Next Phase Readiness

The sole active-workout navigation model is ready for Plan 08-04 lifecycle verification. Native-tracer execution remains pending a connected device.

---
*Phase: 08-session-overview-navigation*
*Completed: 2026-09-15*
