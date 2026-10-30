# Phase 9: In-Workout Exercise Editing - Context

**Gathered:** 2026-09-15
**Status:** Ready for planning

<domain>
## Phase Boundary

From the Phase 8 session overview, let the owner **add, replace, remove, and
reorder whole exercises during a live workout** without ever rewriting or
destroying a committed snapshot, and offer an explicit end-of-workout choice to
push those session edits back to the plan. Covers WORK-20 (add), WORK-21
(replace), WORK-22 (remove), WORK-23 (reorder), WORK-24 (append-only immutable
snapshot invariant), WORK-25 (modified-from-plan / deterministic progression),
WORK-27 (save-to-plan prompt).

**Out of scope:** the overview layout itself (Phase 8), advanced set timing
(Phase 10), any backup/sync change (Phases 11–12). New capabilities beyond
add/replace/remove/reorder + write-back belong in the backlog.
</domain>

<decisions>
## Implementation Decisions

### Write-back to plan (WORK-27)
- **D-01:** The end-of-workout "Save changes to plan?" applies **all** session
  deltas (add/replace/remove/reorder) as **one all-or-nothing, revision-checked
  plan edit**, or none — no per-delta cherry-pick UI. Matches the default-No
  single-tap model and keeps edge cases bounded. — **Reversibility:** reversible
  (a later "pick which changes" UI could layer on top without changing the
  domain contract).
- **D-02:** Write-back reuses the existing v1.0 owned-plan editing path
  (`ownedPlanRuntime.replaceExercise` / owned-plan mutation-request commands),
  revision-checked and atomic; it never silently mutates and never alters
  already-recorded set history. The prompt appears **only** when the session
  diverged from its planned day, never for empty/unplanned/unedited sessions.

### Snapshot & history invariants (WORK-24, carried WORK-04)
- **D-03:** Every session-exercise/session-set row is an **append-only immutable
  snapshot**. Add/replace/remove/reorder only append new snapshot rows or
  transition a row's `status`; no operation rewrites or deletes a committed
  snapshot. Completed sets stay correct-or-undo, never hard-deleted. —
  **Reversibility:** one-way — this is the core data-integrity contract; relaxing
  it later would corrupt already-recorded history and break rebuildable
  derivatives (progression, FTS, projections). Mirror the existing
  `removeWorkingSet` refusal-when-completed rule.

### Add / Replace / Remove semantics (owner decisions carried from REQUIREMENTS.md)
- **D-04:** **Add** (WORK-20, Q4 single-select) — one library exercise appended
  to the session end with its metric profile's default target scheme, one empty
  working set, an explicit `added` origin, and **null plan-target lineage**
  (Q7: manual targets only, no auto-progression). Reuses the reviewed Material 3
  library picker.
- **D-05:** **Replace** (WORK-21, Q6 approved) — never rewrites a row. No
  completed sets → remove original + append replacement in the same display
  position. Has ≥1 completed set → keep original as **skipped** (history
  preserved/visible), append replacement. Replacement carries its own snapshot.
- **D-06:** **Remove** (WORK-22) — zero completed sets → hard-delete the
  exercise from the session; any completed set → cannot hard-delete, mark
  **skipped** (history retained, excluded from remaining-work counts). Progress
  totals + history snapshots stay correct and rebuildable either way.
- **D-07:** **Reorder** (WORK-23, Q5 append-then-reorder) — touch-and-hold drag
  with accessible up/down fallback; changes a **display order only**. The
  planned order captured at session start stays immutable for history; completed
  facts untouched. Reuse the drag-first pattern shipped in v1.0 Phase 7 plan
  editing.

### Scheduling / progression (WORK-25)
- **D-08:** An edited session still **consumes its scheduled opportunity** (Q8:
  the owner trained that day) but is flagged **modified-from-plan**. Rotation /
  weekday advancement and progression treat added/replaced/removed exercises
  deterministically: no silent target mutation, no advancement on exercises
  absent from the planned day. — **Reversibility:** costly — the
  modified-from-plan flag and progression-eligibility rule touch the schedule
  opportunity + progression modules.

### Claude's Discretion
- Exact new domain command names/shapes for session-level add/replace/remove/
  reorder, and whether they live in a new `sessionEditCommands.ts` or extend
  `setCommands.ts` — planner decides, provided each is repository-owned,
  request-id + sha256 guarded (like `removeWorkingSet`), and revision-checked.
- The `added`-origin badge styling and the skipped-original visual treatment.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & owner decisions
- `.planning/REQUIREMENTS.md` — WORK-20..25, WORK-27 text; the carried-forward
  WORK-04 row-level immutability invariant; "Owner decisions (2026-09-15)"
  (Q4 single-select, Q5 append-then-reorder, Q6 replace-keeps-skipped,
  Q7 added=manual-only, Q8 opportunity+modified flag, Q9 write-back default No).
- `.planning/ROADMAP.md` §"Phase 9: In-Workout Exercise Editing" — goal + 6
  success criteria (verification anchor).
- `.planning/design/v1.1-UX-FLOW.md` §3–7, §8a — add/replace/remove/reorder
  flows and the end-of-workout save-to-plan prompt.

### v1.0 domain contracts to extend / mirror
- `src/domains/workout/activeWorkout.ts` — `ActiveWorkoutRepository`
  (existing `addWorkingSet`, `removeWorkingSet` request-id+sha256 pattern,
  `skipWorkingSet`, `WorkoutCommandConflictError`); new session-level exercise
  commands mirror these guards.
- `src/domains/workout/setCommands.ts` — `validateRemoveInput` /
  `validateObservation` / request-id + sha256 validation to reuse.
- `src/domains/plans/ownedPlanCommands.ts` + `src/bootstrap/ownedPlanRuntime.tsx`
  `replaceExercise` / `previewExerciseReplacement` /
  `ReplacePlanExerciseInput` — the revision-checked owned-plan editing path for
  WORK-27 write-back.
- `src/domains/workout/finishWorkout.ts` — finish/partial/skip confirmation
  constants; WORK-27 prompt slots into this completion flow.
- `src/domains/workout/undoCompletedSet.ts` — completed-set immutability
  reference (never hard-delete).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ownedPlanRuntime.replaceExercise` already performs a fresh-identity,
  never-mutate replacement at plan level — the exact model for session-level
  Replace (D-05) and for write-back (D-01/D-02).
- `src/ui/screens/ExerciseReplacementScreen.tsx` + `LibraryScreen.tsx` +
  shared Material 3 Search/filter — reuse for the add/replace picker.
- `setCommands.ts` request-id + sha256 + revision guards — the template for
  idempotent, conflict-safe session-exercise mutations.
- Phase 7 plan-editing drag-reorder UI — reuse for WORK-23.

### Established Patterns
- Removal already degrades safely: `removeWorkingSet` refuses when a
  completed/undo snapshot exists. Exercise Remove/Replace (D-05/D-06) generalize
  this "refuse-to-destroy, degrade-to-skip" rule to whole exercises.
- `session_exercises` / `session_sets` carry `source_plan_day_exercise_id` and
  metric-generation columns (see restore reference definitions) — added
  exercises set these null to express `added` origin + null lineage (D-04).

### Integration Points
- `src/bootstrap/workoutAppRuntime.tsx` — wires `ActiveWorkoutCommands`; new
  exercise-edit commands are added here and surfaced through the Phase 8
  overview's ⋯ menu + pinned Add button.
- Progression + schedule-opportunity modules — WORK-25's modified-from-plan
  flag and deterministic progression eligibility.
</code_context>

<specifics>
## Specific Ideas

- Model interactions on **Hevy / Strong**: per-exercise ⋯ overflow for
  Replace/Remove/Reorder, pinned "+ Add exercise" at list end (from
  `v1.1-UX-FLOW.md` §2).
- Replace/Remove copy must be explicit when history exists (e.g. "This exercise
  has completed sets and will be marked skipped, not deleted").
</specifics>

<deferred>
## Deferred Ideas

- Per-delta cherry-pick write-back UI — possible future layer on D-01.
- Multi-select add (adding several exercises at once) — Q4 chose single-select;
  backlog.
- Supersets — roadmap backlog (not a v1.1 phase).
- Advanced timing config on the added exercise — Phase 10.

</deferred>

---

*Phase: 9-In-Workout Exercise Editing*
*Context gathered: 2026-09-15*
