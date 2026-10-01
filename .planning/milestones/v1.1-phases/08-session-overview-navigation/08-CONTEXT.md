# Phase 8: Session Overview & Navigation - Context

**Gathered:** 2026-09-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Reorient the active-workout surface from a one-exercise-in-focus screen into a
single scrollable **session overview**: every exercise in the session rendered
in order with its sets inline (planned, active, completed, skipped), the active
set visually distinguished and used as the default scroll anchor, and the
primary Complete action reachable without leaving the overview. Empty/unplanned
workouts land on the same overview with a prominent Add-exercise affordance and
no set rows.

**This phase is presentation + navigation only (WORK-19).** It re-expresses
data the v1.0 domain already exposes (`ActiveWorkoutView.exercises[]`, per-set
`status`, `activeSetId`, `activeExerciseId`, `progress`, `rest`). It does NOT
add exercise add/replace/remove/reorder (Phase 9), advanced timing (Phase 10),
or any data-model change. Every v1.0 workout-loop guarantee — commit-gated
completion, 8s Undo, rest timer + RestDock, notification reconciliation,
rotation/background restore, process-death recovery — must survive unchanged.

The pinned "+ Add exercise" button and per-exercise overflow (⋯) menu are
rendered as **affordances/entry points** here, but their actions are wired in
Phase 9. Phase 8 may ship them disabled or routing to a Phase-9 stub; the
overview layout must leave room for them.
</domain>

<decisions>
## Implementation Decisions

### Overview layout & list behavior
- **D-01:** Completed/earlier exercises **auto-collapse to a one-line summary**
  (name + top working set or "done"); the active exercise and upcoming
  exercises stay expanded. Any collapsed exercise re-expands on tap. Matches
  Hevy/Strong behavior on long sessions and keeps scroll length manageable.
- **D-02:** After completing the active set, the list **auto-scrolls the newly
  active set into view**. Must respect reduced-motion: animate normally, but
  jump (no animation) when reduce-motion is enabled — reuse the existing
  `useAppTheme().reduceMotion` + `AdaptiveScreen` `scrollTo({animated:false})`
  pattern. — **Reversibility:** reversible.
- **D-04:** Set-value editing is **active-set-inline; other set rows are compact
  and expand their editor on tap**. Only the active set mounts its full editor
  by default; keeps render cost and visual noise low on long sessions. The
  active set's inline editor + Complete is the one-tap fast path.

### Focus / navigation model
- **D-03:** **Retire the v1.0 dual "Focused workout" vs "Reviewing workout"
  mode and the "return to current" banner.** The scrollable overview is the one
  and only active surface; everything is visible at once, so the
  `reviewExerciseId` / `reviewingEarlierOrLater` / `onReturnToCurrent` machinery
  and its "REVIEWING WORKOUT" eyebrow become redundant and are removed. —
  **Reversibility:** costly — removing `reviewExerciseId` and the review/return
  banner touches `ActiveWorkoutScreen` props, its runtime wiring in
  `workoutAppRuntime.tsx`, and the Phase 2 preview fixtures; re-introducing a
  focus mode later would need those props and the return-to-current flow rebuilt.

### Carried forward from owner decisions (2026-09-15, REQUIREMENTS.md)
- **D-05:** Q1 — anchor to the **active set within the full list** on entry
  (both overview and one-tap fast path win); not top-of-list, not a bare focus.
- **D-06:** Q2 — **overview-only** active screen (consistent with D-03).
- **D-07:** Q3 — the **empty/unplanned workout is unified into the overview**
  (no separate empty screen): `EmptyWorkoutView` renders the overview shell with
  the Add-exercise affordance and zero set rows.

### Claude's Discretion
- Exact collapsed-summary content (which stat to show), section header styling,
  drag-handle placement, and whether the pinned Add-exercise button is disabled
  vs Phase-9-stubbed in this phase — planner/UI-spec decides within the layout
  above.
- Whether to render with `SectionList` vs a memoized `ScrollView` of exercise
  sections — an implementation choice for the planner, provided auto-scroll,
  auto-collapse, and reduced-motion all hold and lifecycle tests pass.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & owner decisions
- `.planning/REQUIREMENTS.md` — WORK-19 text, the carried-forward WORK-04
  row-level immutability invariant, and the "Owner decisions (2026-09-15)"
  block (Q1/Q2/Q3 anchoring, overview-only, empty-workout unification).
- `.planning/ROADMAP.md` §"Phase 8: Session Overview & Navigation" — goal +
  4 success criteria (the verification anchor for this phase).

### Approved UX model
- `.planning/design/v1.1-UX-FLOW.md` §1–2, §7 — the approved overview layout
  (sticky header + session ⋯, per-exercise ⋯, pinned Add-exercise, RestDock
  unchanged) and the explicit "what stays exactly as v1.0" list.
- `.planning/design/v1.1-OPEN-QUESTIONS.md` — resolved decision record backing
  the owner decisions above.

### v1.0 domain contracts (do not change in this phase)
- `src/domains/workout/activeWorkout.ts` — `ActiveWorkoutView`,
  `ActiveWorkoutExercise`, `ActiveWorkoutSet`, `ActiveWorkoutSetStatus`,
  `EmptyWorkoutView`, `WorkoutSessionView`, `ActiveWorkoutRestState`,
  `ActiveWorkoutRepository`. Phase 8 consumes these unchanged.
- `src/domains/workout/sessionDetail.ts` — `SessionExerciseDetail` /
  `SessionSetDetail` status vocabulary (mirrors the overview's status chips).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ui/screens/ActiveWorkoutScreen.tsx` — the screen being reoriented. Already
  holds all set-mutation command wiring (`completeSet`, `skipWorkingSet`,
  `addWorkingSet`, `addWarmup`, `removeWorkingSet`, `reviseCompletedSet`,
  `undoCompletedSet`), the RestDock, More sheet, removal/undo flows, and
  per-set busy/failure state. Overview refactor reuses these command handlers
  verbatim — only the render tree (single-exercise → full list) changes.
- `src/ui/layout/AdaptiveScreen.tsx` — has a `scrollViewRef` + scroll-restore
  effect (`scrollTo({animated:false, y: scrollOffset})`) that is the model for
  D-02 auto-scroll and for process-death scroll restoration.
- `src/ui/screens/WorkoutPlanOverviewScreen.tsx` — already renders an
  exercise-list-with-status view (`resolveWorkoutPlanOverviewScene`, status →
  completed/attention chips). Closest existing list/status pattern to mirror.
- `useAppTheme().reduceMotion` (used in `RestAlertSettingsSheet`, components
  index) — the established reduced-motion signal for D-02.
- `src/ui/components/RestDock.tsx` — docked rest timer; unchanged, keeps its
  position above nav.

### Established Patterns
- The view is a discriminated union: `WorkoutSessionView = ActiveWorkoutView |
  EmptyWorkoutView`. The runtime already branches on `EmptyWorkoutView` — the
  overview must render both arms (D-07 unifies them into one shell).
- Set rows already carry `status`, `revision`, and `activeSetId`
  identity — enough to drive per-row expand/collapse (D-01/D-04) without new
  domain fields.
- Commit-gated completion + optimistic `applyView(nextView)` is the state model;
  the overview keeps `view`/`viewRef` and `applyView` as-is.

### Integration Points
- `src/bootstrap/workoutAppRuntime.tsx` — constructs `ActiveWorkoutCommands`,
  supplies `getActiveWorkout`/`getWorkoutSession`, and passes
  `reviewExerciseId`/`onReturnToCurrent`. Removing the focus/review mode (D-03)
  means dropping those two props at this call site.
- `src/testing/phase2AttendedPreviewFixtures.ts` imports
  `ActiveWorkoutCommands` — update if the props contract changes.
</code_context>

<specifics>
## Specific Ideas

- Model the layout on **Hevy / Strong**: one vertical scrollable session sheet,
  per-exercise section header with ⋯ overflow, set rows beneath, pinned
  "+ Add exercise" at the list end, RestDock docked above nav. See the ASCII
  layout in `v1.1-UX-FLOW.md` §2.
- Keep the one-tap loop sacrosanct: the active set's inline Complete is the
  primary action; auto-scroll (D-02) keeps it in view without hunting.
</specifics>

<deferred>
## Deferred Ideas

- Exercise **add / replace / remove / reorder** actions behind the pinned
  button and per-exercise ⋯ — **Phase 9** (WORK-20..25, 27). Phase 8 only lays
  out their entry points.
- Per-exercise **advanced timing** indicator/config — **Phase 10** (WORK-26).
- **Superset** grouping and per-exercise rest-timer overrides — not in any v1.1
  phase; roadmap backlog.
- **Sync-status indicator** on Today/Settings — Phases 11–12 (DATA-08/09/10).

</deferred>

---

*Phase: 8-Session Overview & Navigation*
*Context gathered: 2026-09-15*
